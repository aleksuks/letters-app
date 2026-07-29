-- 045_disposable_email_gate.sql broke signup for every user, not just
-- disposable-domain ones. The "Before User Created" Auth Hook invokes
-- reject_disposable_email_domains() as `supabase_auth_admin`, whose
-- role-level search_path is just `auth` (no `public`). The function's
-- unqualified reference to `blocked_email_domains` couldn't resolve under
-- that search_path, so every signup attempt hit an unhandled SQL error
-- inside the SECURITY DEFINER function, which GoTrue surfaces as a bare
-- 500 "unexpected_failure" — confirmed by calling the function directly
-- (works fine as `postgres`, whose search_path includes `public`) vs.
-- reproducing the hook's actual signup 500 over HTTP.
--
-- Fix: pin the function's search_path explicitly so it doesn't depend on
-- the caller's role config, and schema-qualify the table reference too.

CREATE OR REPLACE FUNCTION reject_disposable_email_domains(event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email  TEXT := lower(event -> 'user' ->> 'email');
  v_domain TEXT;
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

  RETURN '{}'::jsonb;
END;
$$;
