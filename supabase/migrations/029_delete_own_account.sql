-- Self-serve account deletion, required for App Store / Play Store review
-- (both require in-app deletion for apps that support account creation).
--
-- Deleting the auth.users row is enough: user_profiles.id references
-- auth.users(id) ON DELETE CASCADE, and every other table (letters,
-- letter_recipients, connection_requests, conversations, messages,
-- reports, notification_outbox) cascades from there or from
-- user_profiles(id), all the way down. No manual per-table cleanup
-- needed — this satisfies the privacy policy's "paskyros duomenys ...
-- ištrinami" promise in one statement.
--
-- SECURITY DEFINER is required because authenticated/anon have no direct
-- grants on the auth schema; the function owner (postgres) does.
CREATE OR REPLACE FUNCTION delete_own_account()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;
