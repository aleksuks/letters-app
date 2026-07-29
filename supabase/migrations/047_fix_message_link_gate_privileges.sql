-- 042_no_links.sql broke chat entirely: no message could be sent, whatever
-- it contained. `contains_link()` has EXECUTE revoked from `authenticated`
-- (so the TLD list can't be mined from the app, same posture as
-- contains_cyrillic()), but `check_message_no_link()` — unlike every other
-- gate function in this schema — was created without SECURITY DEFINER. A
-- plain trigger function runs as the role doing the INSERT, so every send
-- from the app hit `permission denied for function contains_link` before
-- the body was ever examined.
--
-- Two symptoms, one cause: messages appeared to be rejected as links when
-- they contained none, and the failure surfaced as a raw English Postgres
-- error (the app's translated `message_rejected_link` copy never matched,
-- since that exception was never reached).
--
-- Confirmed against the linked project:
--   proname               | prosecdef | authenticated may EXECUTE
--   check_message_no_link | false     | (n/a — the caller's own privileges)
--   contains_link         | false     | false
--   letters_moderation_gate | true    | true   <- letters were unaffected
--
-- Fix: SECURITY DEFINER, matching letters_moderation_gate() and
-- nickname_moderation_gate(), with search_path pinned and the call
-- schema-qualified for the same reason as migration 046 — a definer
-- function must not depend on the caller's search_path.

CREATE OR REPLACE FUNCTION check_message_no_link()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.contains_link(NEW.body) THEN
    RAISE EXCEPTION 'message_rejected_link';
  END IF;
  RETURN NEW;
END;
$$;
