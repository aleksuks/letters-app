-- Reminder notification title is now picked at random per send from a
-- fixed pool, instead of the flat "Laiškelis laukia" every time. Body
-- stays constant. Each candidate row gets its own independent random pick.
CREATE OR REPLACE FUNCTION enqueue_reminder_notifications()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_ids UUID[];
  -- TUNING KNOB: title pool. Add/remove entries freely.
  v_titles TEXT[] := ARRAY[
    'Laisvi laiškeliai tavo rajone',
    'Labas',
    'Paukšteli, padangių paukšteli...',
    'Imkit mane ir skaitykit...',
    'You''ve got mail!',
    'Jeigu labai nori, yra laiškelis',
    'Jeigu manęs neskaitysi, yra kas perskaitys',
    'Gavote virusą. Juokauju',
    'Atidaryk mane',
    'Aš tikrai ne spam laiškelis'
  ];
BEGIN
  PERFORM expire_due_letters();

  WITH candidates AS (
    SELECT up.id, up.push_token
    FROM user_profiles up
    WHERE up.push_token IS NOT NULL
      AND up.reminders_enabled
      -- TUNING KNOB: quiet period before a nudge is even considered, and
      -- the minimum gap between two nudges to the same person. Checked at
      -- five fixed times a day (see pg_cron jobs in migration 016), so a
      -- user is notified at the first check after crossing this bar, not
      -- the instant they cross it.
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
    SELECT id, 'reminder',
           v_titles[1 + floor(random() * array_length(v_titles, 1))::int],
           'Tavęs galimai laukia naujas laiškelis',
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
