-- 049's canonical-uniqueness check also fired on an EXACT address match,
-- which was wrong on two counts:
--
--   1. Anti-enumeration. Supabase deliberately returns a success-shaped
--      response when you sign up with an already-registered address, so
--      the API never confirms which emails exist (use-auth.ts detects it
--      client-side via an empty `identities` array). A hook error fires
--      before that, turning a plain existing address into a definitive
--      "yes, this account exists" oracle — a regression against the
--      product's anonymity premise. The variant check accepts a narrower
--      version of this leak on purpose (see 049), but there is no reason
--      to widen it to addresses GoTrue already handles quietly.
--
--   2. Wrong copy. The exact-match case is "you already have an account,
--      sign in" — not "a + tag or dots don't make a new address", which
--      is baffling advice to someone who typed their only address.
--
-- Fix: the variant check only considers accounts whose address differs
-- from the one being registered. Exact matches fall through to GoTrue's
-- existing quiet handling.

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

  IF EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.deleted_at IS NULL
      AND u.email IS NOT NULL
      AND lower(u.email) <> v_email          -- exact match: GoTrue's problem, not ours
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
