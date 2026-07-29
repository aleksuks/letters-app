-- ============================================================
-- 043 — Invisible send-side pacing: one letter actually enters
-- circulation per author every 20 minutes
-- ============================================================
--
-- Rule 2 already paces *delivery* per letter (one recipient per hour,
-- last_delivered_at). That does nothing to stop a single author from
-- writing and submitting 25 letters back to back: each of those 25 starts
-- accumulating its own hourly deliveries immediately, so one prolific (or
-- spammy) author can flood the random pool with 25x the normal delivery
-- rate the moment they hit send.
--
-- Fix is at the other end of the pipeline: writing/submitting a letter is
-- never blocked or queued from the author's point of view (insert always
-- succeeds immediately, the send animation always plays), but a new
-- `eligible_at` column silently gates when the letter can actually be
-- picked up by receive_letter(). A burst of letters from the same author
-- gets chained 20 minutes apart; a single letter, or the first one after a
-- quiet spell, is eligible immediately. Nothing in the API response or the
-- author's own letter list distinguishes a chained-back letter from a
-- normal one — same status, same created_at/expires_at — so there is
-- nothing for the client to leak even if it wanted to.
--
-- created_at/expires_at are deliberately left alone: a queued letter still
-- ages from the moment it was written, not from when it goes live. Worst
-- case (last of a 25-letter burst) loses a few hours off a 7-day life,
-- which isn't worth the complexity of decoupling the two clocks.

ALTER TABLE letters ADD COLUMN IF NOT EXISTS eligible_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ------------------------------------------------------------
-- 1. Chain new letters off the author's own most recent one
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION apply_letter_send_pacing()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  -- TUNING KNOB: gap between two letters from the same author actually
  -- entering circulation. Only bites during a burst — a returning author
  -- whose last letter is older than this is unaffected.
  v_last_eligible_at TIMESTAMPTZ;
BEGIN
  SELECT MAX(eligible_at) INTO v_last_eligible_at
  FROM letters
  WHERE author_id = NEW.author_id;

  IF v_last_eligible_at IS NULL THEN
    NEW.eligible_at := NOW();
  ELSE
    NEW.eligible_at := GREATEST(NOW(), v_last_eligible_at + INTERVAL '20 minutes');
  END IF;

  RETURN NEW;
END;
$$;

-- BEFORE INSERT, separate from letters_moderation_gate() (which also
-- fires on map_letters — this one must not, since map letters have no
-- pacing mechanic at all, by design).
CREATE TRIGGER trg_letters_send_pacing
  BEFORE INSERT ON letters
  FOR EACH ROW EXECUTE FUNCTION apply_letter_send_pacing();

-- ------------------------------------------------------------
-- 2. Gate every delivery-eligibility check on it
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "letters_receive_eligible" ON letters;

CREATE POLICY "letters_receive_eligible"
  ON letters FOR SELECT USING (
    status = 'active'
    AND expires_at > NOW()
    AND author_id != auth.uid()
    AND eligible_at <= NOW()
    AND (last_delivered_at IS NULL
         OR last_delivered_at <= NOW() - INTERVAL '1 hour')
    AND NOT EXISTS (
      SELECT 1 FROM letter_recipients lr
      WHERE lr.letter_id = letters.id
        AND lr.user_id = auth.uid()
        AND lr.released_at IS NULL
    )
  );

DROP FUNCTION IF EXISTS receive_letter();

CREATE FUNCTION receive_letter()
RETURNS TABLE (
  id                      UUID,
  author_id               UUID,
  body                    TEXT,
  drawing                 JSONB,
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
    AND l.eligible_at <= NOW()
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
  SELECT v_letter.id, v_letter.author_id, v_letter.body, v_letter.drawing,
         v_letter.created_at, v_letter.expires_at, v_letter.status,
         v_letter.like_count, v_letter.travel_count + 1,
         v_letter.dislike_count, up.nickname, up.accepts_requests
  FROM user_profiles up
  WHERE up.id = v_letter.author_id;
END;
$$;

-- ------------------------------------------------------------
-- 3. Reminder eligibility — "is anything actually receivable right now"
--    loses the same predicate as receive_letter() (body otherwise
--    identical to migration 037's version).
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
          AND l.eligible_at <= NOW()
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
