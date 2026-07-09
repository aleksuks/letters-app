-- Admin overview for the (single-founder) moderation screen: visibility
-- into currently-active letters plus aggregate stats, alongside the
-- existing reports queue and obituary review queue.
--
-- Existing moderator SELECT policies on `letters` only cover status =
-- 'expired' (005, the obituary queue) and status = 'removed_reported'
-- (008, the reports queue) — an active, untouched letter was invisible to
-- the moderator entirely. Adding the missing status='active' policy gives
-- the same row-level guarantee as the other two queues, rather than
-- leaning on a client-side-only check.
CREATE POLICY "letters_moderator_select_active"
  ON letters FOR SELECT
  USING (is_moderator() AND status = 'active');

-- Aggregate counts are computed server-side (not by having the client run
-- COUNT queries against user_profiles, which would need a much broader —
-- and privacy-eroding — SELECT policy on that table just to get numbers).
-- SECURITY DEFINER bypasses RLS for the aggregation itself, so the
-- moderator check has to happen explicitly inside the function.
CREATE OR REPLACE FUNCTION moderation_overview_stats()
RETURNS TABLE (
  active_letters_count      INTEGER,
  total_letters_count       INTEGER,
  obituary_public_count     INTEGER,
  pending_obituary_review   INTEGER,
  open_reports_count        INTEGER,
  total_users_count         INTEGER,
  active_users_24h          INTEGER,
  active_users_7d           INTEGER,
  total_conversations_count INTEGER,
  total_messages_count      INTEGER
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_moderator() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY SELECT
    (SELECT COUNT(*) FROM letters WHERE status = 'active' AND expires_at > NOW())::INTEGER,
    (SELECT COUNT(*) FROM letters)::INTEGER,
    (SELECT COUNT(*) FROM letters WHERE approved_for_obituary = TRUE)::INTEGER,
    (SELECT COUNT(*) FROM letters WHERE status = 'expired' AND obituary_reviewed = FALSE)::INTEGER,
    (SELECT COUNT(*) FROM reports WHERE status = 'open')::INTEGER,
    (SELECT COUNT(*) FROM user_profiles)::INTEGER,
    (SELECT COUNT(*) FROM user_profiles WHERE last_active_at >= NOW() - INTERVAL '24 hours')::INTEGER,
    (SELECT COUNT(*) FROM user_profiles WHERE last_active_at >= NOW() - INTERVAL '7 days')::INTEGER,
    (SELECT COUNT(*) FROM conversations)::INTEGER,
    (SELECT COUNT(*) FROM messages)::INTEGER;
END;
$$;
