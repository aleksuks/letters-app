-- 045's disposable-domain gate only looks at the domain half of the
-- address, so the local part was a free-for-all: x@gmail.com,
-- x+anything@gmail.com and x.y@gmail.com are three distinct auth.users
-- rows that all deliver to one inbox. That's the zero-effort way to farm
-- accounts — no temp-mail service needed, no blocklist to dodge — and it
-- undermines every per-user limit the product has (send pacing, one
-- like per reader, blocking).
--
-- Fix: canonicalize the address and require the canonical form to be
-- unique across accounts.
--
-- Deliberately NOT "reject any address containing + or a dot": a Gmail
-- user's real, printed-on-their-CV address often contains dots, and
-- `ugne.baguckyte@gmail.com` is an existing user here. Rejecting the
-- address someone considers theirs is a bad first impression; rejecting
-- the *second* account from the same inbox is the actual goal.
--
-- Known trade-off (accepted): this is a weak account-existence oracle —
-- signing up as `x+1@gmail.com` and being rejected reveals that some
-- account on `x@gmail.com` exists. The attacker has to already know the
-- base address to learn anything, and the alternative is unlimited free
-- accounts per inbox, so the leak is the cheaper of the two.
--
-- This does not stop someone registering several genuinely separate
-- mailboxes; nothing short of identity verification does. It closes the
-- path that costs nothing.

-- ============================================================
-- CANONICALIZATION
-- ============================================================

-- Two addresses are "the same inbox" when this returns the same string.
-- Rules, most to least universal:
--   * case is insignificant in practice for every mainstream provider
--   * everything from the first '+' to the '@' is a user-chosen tag
--     (gmail, outlook, icloud, fastmail, proton, zoho all honour it)
--   * dots are insignificant in the local part ONLY on gmail — elsewhere
--     they are ordinary characters and two dotted variants really can be
--     two different people
--   * googlemail.com is a legacy alias of gmail.com
CREATE OR REPLACE FUNCTION public.canonical_email(p_email TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = public
AS $$
DECLARE
  v_email  TEXT := lower(btrim(p_email));
  v_local  TEXT;
  v_domain TEXT;
BEGIN
  IF position('@' IN v_email) = 0 THEN
    RETURN v_email;
  END IF;

  v_local  := split_part(v_email, '@', 1);
  v_domain := split_part(v_email, '@', 2);

  IF v_domain = 'googlemail.com' THEN
    v_domain := 'gmail.com';
  END IF;

  v_local := split_part(v_local, '+', 1);

  IF v_domain = 'gmail.com' THEN
    v_local := replace(v_local, '.', '');
  END IF;

  -- A local part that was nothing but a tag ('+foo@x.com') canonicalizes
  -- to empty; keep the original so it can't collide with other such
  -- addresses. GoTrue rejects these anyway — this is belt and braces.
  IF v_local = '' THEN
    RETURN v_email;
  END IF;

  RETURN v_local || '@' || v_domain;
END;
$$;

-- ============================================================
-- EXEMPTIONS
-- ============================================================

-- The store-reviewer demo account is a deliberate second account on the
-- founder's own inbox (App Store Connect and Play Console both need a
-- working login, and it must not be the founder's real account). Same
-- founder-managed, RLS-with-no-policies pattern as
-- blocked_email_domains: unreadable from the app, managed via the
-- dashboard.
CREATE TABLE email_uniqueness_exemptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT email_lowercase CHECK (email = lower(email))
);

ALTER TABLE email_uniqueness_exemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON email_uniqueness_exemptions FROM anon, authenticated;

INSERT INTO email_uniqueness_exemptions (email, note) VALUES
  ('aleksandrasabrutis18+laiskelisreviewer@gmail.com',
   'App Store / Play Console reviewer demo account (scripts/seed-reviewer-account.mjs)')
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- HOOK
-- ============================================================

-- Supabase "Before User Created" Auth Hook contract: takes the event
-- jsonb, returns '{}' to allow or {"error": {...}} to reject.
-- supabase_auth_admin is the only caller.
--
-- search_path is pinned because supabase_auth_admin's role-level
-- search_path is just `auth` — see 046, where the missing pin turned
-- every signup into a 500.
CREATE OR REPLACE FUNCTION validate_new_user_email(event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email     TEXT := lower(event -> 'user' ->> 'email');
  v_domain    TEXT;
  v_canonical TEXT;
BEGIN
  IF v_email IS NULL OR position('@' IN v_email) = 0 THEN
    RETURN '{}'::jsonb;
  END IF;

  v_domain := split_part(v_email, '@', 2);

  IF EXISTS (SELECT 1 FROM public.blocked_email_domains WHERE domain = v_domain) THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'disposable_email_not_allowed',
        'http_code', 400
      )
    );
  END IF;

  IF EXISTS (SELECT 1 FROM public.email_uniqueness_exemptions WHERE email = v_email) THEN
    RETURN '{}'::jsonb;
  END IF;

  v_canonical := public.canonical_email(v_email);

  -- Sequential scan over auth.users by design: the table is tiny and an
  -- expression index would mean creating an index on a Supabase-managed
  -- schema. Revisit (functional index on canonical_email(email)) if the
  -- user count ever reaches five figures.
  --
  -- Exempt addresses are skipped on BOTH sides so the reviewer account
  -- never blocks the founder's own address, or vice versa.
  IF EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.deleted_at IS NULL
      AND u.email IS NOT NULL
      AND public.canonical_email(u.email) = v_canonical
      AND NOT EXISTS (
        SELECT 1 FROM public.email_uniqueness_exemptions x
        WHERE x.email = lower(u.email)
      )
  ) THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'email_variant_already_registered',
        'http_code', 400
      )
    );
  END IF;

  RETURN '{}'::jsonb;
END;
$$;

GRANT EXECUTE ON FUNCTION validate_new_user_email(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION validate_new_user_email(jsonb) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT SELECT ON public.email_uniqueness_exemptions TO supabase_auth_admin;

-- The dashboard hook setting still points at the old function name, and a
-- migration can't change that setting. Rather than leave the new rule
-- inert until someone remembers to flip it, the old name becomes a
-- delegating wrapper — so the gate tightens the moment this migration
-- lands, whether or not the dashboard is updated.
--
-- MANUAL STEP (optional, cosmetic): Authentication → Hooks → "Before User
-- Created" → select validate_new_user_email. Once that's done this
-- wrapper can be dropped.
CREATE OR REPLACE FUNCTION reject_disposable_email_domains(event jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.validate_new_user_email(event);
$$;

GRANT EXECUTE ON FUNCTION reject_disposable_email_domains(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION reject_disposable_email_domains(jsonb) FROM PUBLIC, anon, authenticated;
