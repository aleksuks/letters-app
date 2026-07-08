-- Reminder cadence tune-up: check five times a day instead of once, and
-- shorten the inactivity bar to 24 hours instead of 3 days — a quiet user
-- now gets nudged at the first check after crossing 24h, rather than
-- waiting for a single daily slot up to a day later. Still at most one
-- reminder per person per day (last_reminder_sent_at gap matches the bar).

-- pg_cron on Supabase runs in UTC, and cron.timezone is PGC_POSTMASTER —
-- it can't be changed without a full Postgres restart, so this migration
-- can't just ask for "09:00 Europe/Vilnius" directly. The cron times below
-- are hardcoded to UTC+3 (EEST, the offset for most of the year, including
-- today). During EET (roughly late Oct-late Mar, UTC+2) these will fire
-- one hour later than the label says. TUNING KNOB: bump every hour value
-- down by 1 for the winter half of the year, or restart the Postgres
-- instance once (Dashboard > Settings > Infrastructure) after setting
-- cron.timezone via ALTER DATABASE to fix this permanently.
CREATE OR REPLACE FUNCTION enqueue_reminder_notifications()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_ids UUID[];
BEGIN
  PERFORM expire_due_letters();

  WITH candidates AS (
    SELECT up.id, up.push_token
    FROM user_profiles up
    WHERE up.push_token IS NOT NULL
      AND up.reminders_enabled
      -- TUNING KNOB: quiet period before a nudge is even considered, and
      -- the minimum gap between two nudges to the same person. Checked at
      -- five fixed times a day (see pg_cron jobs below), so a user is
      -- notified at the first check after crossing this bar, not the
      -- instant they cross it.
      AND up.last_active_at <= NOW() - INTERVAL '24 hours'
      AND (up.last_reminder_sent_at IS NULL OR up.last_reminder_sent_at <= NOW() - INTERVAL '24 hours')
      AND EXISTS (
        SELECT 1 FROM letters l
        WHERE l.status = 'active'
          AND l.expires_at > NOW()
          AND l.author_id != up.id
          AND l.travel_count < l.recipient_cap + l.like_count
          AND (l.last_delivered_at IS NULL OR l.last_delivered_at <= NOW() - INTERVAL '1 hour')
          AND NOT EXISTS (
            SELECT 1 FROM letter_recipients lr
            WHERE lr.letter_id = l.id AND lr.user_id = up.id AND lr.released_at IS NULL
          )
      )
  ), inserted AS (
    INSERT INTO notification_outbox (user_id, type, title, body, data, push_token)
    SELECT id, 'reminder', 'Laiškelis laukia', 'Yra naujas laiškelis, kurį galėtum gauti.',
           '{"type":"reminder"}'::jsonb, push_token
    FROM candidates
    RETURNING user_id
  )
  SELECT ARRAY_AGG(user_id) INTO v_user_ids FROM inserted;

  IF v_user_ids IS NOT NULL THEN
    UPDATE user_profiles SET last_reminder_sent_at = NOW() WHERE id = ANY(v_user_ids);
  END IF;
END;
$$;

DO $do$
BEGIN
  PERFORM cron.unschedule('reminder-notifications-enqueue');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'reminder-notifications-enqueue was not scheduled, nothing to remove (%)', SQLERRM;
END;
$do$;

DO $do$
BEGIN
  -- Intended local (Europe/Vilnius) check times: 09:00, 12:30, 16:00,
  -- 19:00, 22:00 — expressed here as UTC (see EEST/EET note above). Split
  -- into two jobs because a single cron expression can't pair different
  -- hours with different minutes (0 vs 30) in one field.
  PERFORM cron.schedule(
    'reminder-notifications-enqueue-hourly',
    '0 6,13,16,19 * * *', -- 09:00, 16:00, 19:00, 22:00 EEST
    $job$ SELECT enqueue_reminder_notifications(); $job$
  );
  PERFORM cron.schedule(
    'reminder-notifications-enqueue-1230',
    '30 9 * * *', -- 12:30 EEST
    $job$ SELECT enqueue_reminder_notifications(); $job$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron unavailable (%); reminder enqueue needs manual scheduling', SQLERRM;
END;
$do$;
