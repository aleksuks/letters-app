-- Blocks signups from well-known disposable/temp-mail domains (10-minute-
-- mail style throwaway inboxes) — a common source of spam/duplicate
-- accounts, since a real person recovering a nickname-based account needs
-- an email that still exists tomorrow.
--
-- Enforced via a Supabase Auth "Before User Created" hook rather than a
-- client-side check: the hook runs inside Supabase's own auth service
-- before the auth.users row is created, so it can't be skipped by calling
-- the Auth API directly the way a check in use-auth.ts could be.
--
-- MANUAL STEP AFTER THIS MIGRATION: in the Supabase dashboard, go to
-- Authentication → Hooks → "Before User Created" and select the
-- reject_disposable_email_domains function. Migrations can't toggle this
-- setting themselves.

-- ============================================================
-- BLOCKLIST
-- ============================================================

CREATE TABLE blocked_email_domains (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain     TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT domain_lowercase CHECK (domain = lower(domain))
);

-- Founder-managed, same pattern as moderation_keywords: RLS on with no
-- policies means no client role can read or write it (so the list can't
-- be probed to find an unblocked domain), managed via the Supabase
-- dashboard / SQL editor (service role bypasses RLS).
ALTER TABLE blocked_email_domains ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON blocked_email_domains FROM anon, authenticated;

-- Seed with well-known disposable/temp-mail providers. A tuning knob, not
-- an exhaustive list — add more via the dashboard as spam patterns emerge.
INSERT INTO blocked_email_domains (domain) VALUES
  ('10minutemail.com'), ('10minutemail.net'), ('20minutemail.com'),
  ('guerrillamail.com'), ('guerrillamail.net'), ('guerrillamail.org'),
  ('guerrillamail.biz'), ('guerrillamail.de'), ('guerrillamailblock.com'),
  ('sharklasers.com'), ('grr.la'), ('pokemail.net'), ('spam4.me'),
  ('mailinator.com'), ('mailinator.net'), ('mailinator2.com'),
  ('tempmail.com'), ('temp-mail.org'), ('temp-mail.io'), ('tempail.com'),
  ('throwawaymail.com'), ('yopmail.com'), ('yopmail.fr'), ('yopmail.net'),
  ('dispostable.com'), ('maildrop.cc'), ('getnada.com'), ('nada.email'),
  ('trashmail.com'), ('trashmail.net'), ('mohmal.com'), ('fakeinbox.com'),
  ('fakemailgenerator.com'), ('emailondeck.com'), ('mintemail.com'),
  ('moakt.com'), ('tempinbox.com'), ('mailnesia.com'), ('mailcatch.com'),
  ('discard.email'), ('discardmail.com'), ('mailnull.com'),
  ('spamgourmet.com'), ('burnermail.io'), ('emailfake.com'),
  ('crazymailing.com'), ('getairmail.com'), ('anonbox.net'),
  ('spambog.com'), ('mailsac.com'), ('maildrop.io')
ON CONFLICT (domain) DO NOTHING;

-- ============================================================
-- HOOK
-- ============================================================

-- Contract fixed by Supabase's "Before User Created" Auth Hook: takes the
-- event jsonb, returns '{}' to allow or {"error": {...}} to reject. Not a
-- client API — supabase_auth_admin is the only caller.
CREATE OR REPLACE FUNCTION reject_disposable_email_domains(event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_email  TEXT := lower(event -> 'user' ->> 'email');
  v_domain TEXT;
BEGIN
  IF v_email IS NULL OR position('@' IN v_email) = 0 THEN
    RETURN '{}'::jsonb;
  END IF;

  v_domain := split_part(v_email, '@', 2);

  IF EXISTS (SELECT 1 FROM blocked_email_domains WHERE domain = v_domain) THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'disposable_email_not_allowed',
        'http_code', 400
      )
    );
  END IF;

  RETURN '{}'::jsonb;
END;
$$;

GRANT EXECUTE ON FUNCTION reject_disposable_email_domains(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION reject_disposable_email_domains(jsonb) FROM PUBLIC, anon, authenticated;
