-- ============================================================
-- 037 — Remove the recipient cap: pacing is the only limiter
-- ============================================================
--
-- Until now a letter's reach was `recipient_cap + like_count`, where
-- recipient_cap = ceil(users/16) frozen at send time (migration 006). Two
-- problems with that:
--
--   1. On a small user base the cap lands at 1–2, so a letter effectively
--      stopped travelling almost immediately regardless of how good it was.
--   2. It capped the wrong dimension. The scarcity the product wants is
--      scarcity in *time* — one delivery per hour, so letters stay rare and
--      unhurried — not a ceiling on how many people may ever read one.
--
-- Hourly pacing already does that job, and a letter's own expiry bounds the
-- total on its own (168 hours of life = at most 168 deliveries). So the cap
-- goes entirely, along with the trigger that computed it and the column that
-- stored it.
--
-- CONSEQUENCE, deliberately accepted: with no cap, `like_count` no longer
-- affects distribution — reach was `cap + likes`, and removing the cap makes
-- reach unbounded, so the "+1 reader per like" mechanic has nothing left to
-- extend. Likes on pool letters now behave like likes on map letters: a
-- counter, an author's milestone push, and an Obituary sort key, with no
-- distribution power. Dislikes are unaffected — the graveyard vote still
-- kills a letter early (dislikes >= 3 AND dislikes > likes).

-- ------------------------------------------------------------
-- 1. Stop computing the cap on insert
-- ------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_letters_set_recipient_cap ON letters;
DROP FUNCTION IF EXISTS set_letter_recipient_cap();

-- ------------------------------------------------------------
-- 2. RLS eligibility loses the reach predicate
--    (replaced before the column drop, which would otherwise fail on the
--    dependency)
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "letters_receive_eligible" ON letters;

CREATE POLICY "letters_receive_eligible"
  ON letters FOR SELECT USING (
    status = 'active'
    AND expires_at > NOW()
    AND author_id != auth.uid()
    AND (last_delivered_at IS NULL
         OR last_delivered_at <= NOW() - INTERVAL '1 hour')
    AND NOT EXISTS (
      SELECT 1 FROM letter_recipients lr
      WHERE lr.letter_id = letters.id
        AND lr.user_id = auth.uid()
        AND lr.released_at IS NULL
    )
  );

-- ------------------------------------------------------------
-- 3. receive_letter() — same claim semantics, no reach ceiling.
--    Dropped rather than replaced: the return signature loses a column.
-- ------------------------------------------------------------

DROP FUNCTION IF EXISTS receive_letter();

CREATE FUNCTION receive_letter()
RETURNS TABLE (
  id                      UUID,
  author_id               UUID,
  body                    TEXT,
  created_at              TIMESTAMPTZ,
  expires_at              TIMESTAMPTZ,
  status                  letter_status,
  like_count              INTEGER,
  travel_count            INTEGER,
  dislike_count           INTEGER,
  author_nickname         TEXT,
  author_accepts_requests BOOLEAN
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_letter letters%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Lazy housekeeping: flip overdue letters to 'expired' and return stale
  -- unconfirmed claims to the pool before picking. Both are idempotent and
  -- cheap (partial indexes); pg_cron also runs them where available.
  PERFORM expire_due_letters();
  PERFORM release_stale_claims();

  SELECT l.* INTO v_letter
  FROM letters l
  WHERE l.status = 'active'
    AND l.expires_at > NOW()
    AND l.author_id != auth.uid()
    -- pacing: at most one delivery per hour, and the only limit on reach
    AND (l.last_delivered_at IS NULL
         OR l.last_delivered_at <= NOW() - INTERVAL '1 hour')
    AND NOT EXISTS (
      SELECT 1 FROM letter_recipients lr
      WHERE lr.letter_id = l.id
        AND lr.user_id = auth.uid()
        -- a released claim was never read, so the same user may re-claim
        AND lr.released_at IS NULL
    )
  ORDER BY random()
  LIMIT 1
  FOR UPDATE OF l SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Fresh claim, or re-claim of a row this user previously released. The
  -- WHERE arm keeps the double-tap guard: conflicting with an unreleased
  -- row updates nothing, so FOUND stays false and we bail out.
  INSERT INTO letter_recipients (letter_id, user_id, seen_at)
  VALUES (v_letter.id, auth.uid(), NOW())
  ON CONFLICT (letter_id, user_id) DO UPDATE
    SET seen_at     = NOW(),
        opened_at   = NULL,
        released_at = NULL
    WHERE letter_recipients.released_at IS NOT NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE letters
  SET travel_count      = letters.travel_count + 1,
      last_delivered_at = NOW()
  WHERE letters.id = v_letter.id;

  RETURN QUERY
  SELECT v_letter.id, v_letter.author_id, v_letter.body, v_letter.created_at,
         v_letter.expires_at, v_letter.status, v_letter.like_count,
         v_letter.travel_count + 1,
         v_letter.dislike_count, up.nickname, up.accepts_requests
  FROM user_profiles up
  WHERE up.id = v_letter.author_id;
END;
$$;

-- ------------------------------------------------------------
-- 4. Reminder eligibility — "is anything actually receivable right now"
--    loses the same predicate. Body otherwise identical to migration 025.
-- ------------------------------------------------------------

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

-- ------------------------------------------------------------
-- 5. The column itself
-- ------------------------------------------------------------

ALTER TABLE letters DROP COLUMN IF EXISTS recipient_cap;
