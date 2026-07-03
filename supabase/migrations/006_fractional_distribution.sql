-- Fractional distribution: fix the "sent to everyone at once" model.
--
-- Previously a letter had no delivery limit at all — it sat in every user's
-- receive pool, travel_count counted likes (not readers), and max_travels
-- therefore capped likes instead of reach. One dislike also killed a letter
-- globally. New model:
--
--   1. Reach: a letter can be claimed by ceil(users / 16) distinct readers
--      (frozen at send time). Nothing is pre-assigned — distribution stays
--      pull-based, first-come-first-served, so inactive users never consume
--      a slot.
--   2. Pacing: at most one delivery per hour, gated on the previous
--      delivery (last_delivered_at), so quiet periods never stack up
--      burst-claimable slots.
--   3. Each like extends total reach by exactly +1 reader. No ceiling —
--      max_travels is dropped; expiry and the dislike vote are the only
--      stoppers.
--   4. A dislike is a vote, not a kill: the letter dies early only when
--      dislikes >= 3 AND dislikes > likes.
--   5. travel_count is redefined as actual deliveries.

-- ============================================================
-- SCHEMA
-- ============================================================

-- The old eligibility policy references max_travels and blocks dropping
-- the column; it's recreated with the new rules further down.
DROP POLICY IF EXISTS "letters_receive_eligible" ON letters;

ALTER TABLE letters DROP COLUMN max_travels;
ALTER TABLE letters ADD COLUMN recipient_cap     INTEGER NOT NULL DEFAULT 1;
ALTER TABLE letters ADD COLUMN dislike_count     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE letters ADD COLUMN last_delivered_at TIMESTAMPTZ;

-- Backfill existing letters into the new semantics.
UPDATE letters SET recipient_cap = GREATEST(
  1, CEIL((SELECT COUNT(*) FROM user_profiles) / 16.0)
);

UPDATE letters l SET
  travel_count = (
    SELECT COUNT(*) FROM letter_recipients lr WHERE lr.letter_id = l.id
  ),
  dislike_count = (
    SELECT COUNT(*) FROM letter_recipients lr
    WHERE lr.letter_id = l.id AND lr.disliked = TRUE
  ),
  last_delivered_at = (
    SELECT MAX(lr.seen_at) FROM letter_recipients lr WHERE lr.letter_id = l.id
  );

-- ============================================================
-- RECIPIENT CAP AT SEND TIME
-- ============================================================

-- TUNING KNOB: initial reach fraction. A letter starts claimable by
-- 1/16th of the current user base (minimum 1 reader).
CREATE OR REPLACE FUNCTION set_letter_recipient_cap()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  NEW.recipient_cap := GREATEST(
    1, CEIL((SELECT COUNT(*) FROM user_profiles) / 16.0)
  )::INTEGER;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_letters_set_recipient_cap
  BEFORE INSERT ON letters
  FOR EACH ROW EXECUTE FUNCTION set_letter_recipient_cap();

-- ============================================================
-- RECEIVE (claim) — the random-recipient selection logic
-- ============================================================

-- Atomically picks one random eligible letter for the caller, records the
-- delivery, and returns the letter with its author's public fields.
-- SECURITY DEFINER because eligibility must count *other* users'
-- letter_recipients rows, which their own-rows-only RLS would hide.
--
-- TUNING KNOB: INTERVAL '1 hour' below is the minimum gap between two
-- deliveries of the same letter.
CREATE OR REPLACE FUNCTION receive_letter()
RETURNS TABLE (
  id                      UUID,
  author_id               UUID,
  body                    TEXT,
  created_at              TIMESTAMPTZ,
  expires_at              TIMESTAMPTZ,
  status                  letter_status,
  like_count              INTEGER,
  travel_count            INTEGER,
  recipient_cap           INTEGER,
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

  SELECT l.* INTO v_letter
  FROM letters l
  WHERE l.status = 'active'
    AND l.expires_at > NOW()
    AND l.author_id != auth.uid()
    -- reach: initial cap plus one extra reader per like
    AND l.travel_count < l.recipient_cap + l.like_count
    -- pacing: at most one delivery per hour
    AND (l.last_delivered_at IS NULL
         OR l.last_delivered_at <= NOW() - INTERVAL '1 hour')
    AND NOT EXISTS (
      SELECT 1 FROM letter_recipients lr
      WHERE lr.letter_id = l.id AND lr.user_id = auth.uid()
    )
  ORDER BY random()
  LIMIT 1
  FOR UPDATE OF l SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- ON CONFLICT guards a double-tap race from the same user; the row lock
  -- above already serializes competing claims from different users.
  INSERT INTO letter_recipients (letter_id, user_id, seen_at)
  VALUES (v_letter.id, auth.uid(), NOW())
  ON CONFLICT (letter_id, user_id) DO NOTHING;

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
         v_letter.travel_count + 1, v_letter.recipient_cap,
         v_letter.dislike_count, up.nickname, up.accepts_requests
  FROM user_profiles up
  WHERE up.id = v_letter.author_id;
END;
$$;

-- ============================================================
-- RLS — keep the direct-select eligibility in sync (defense in depth;
-- the receive flow itself now goes through receive_letter())
-- ============================================================

DROP POLICY IF EXISTS "letters_receive_eligible" ON letters;

CREATE POLICY "letters_receive_eligible"
  ON letters FOR SELECT USING (
    status = 'active'
    AND expires_at > NOW()
    AND author_id != auth.uid()
    AND travel_count < recipient_cap + like_count
    AND (last_delivered_at IS NULL
         OR last_delivered_at <= NOW() - INTERVAL '1 hour')
    AND NOT EXISTS (
      SELECT 1 FROM letter_recipients lr
      WHERE lr.letter_id = letters.id AND lr.user_id = auth.uid()
    )
  );

-- ============================================================
-- LIKE — no longer consumes a travel; it *grants* one instead
-- ============================================================

CREATE OR REPLACE FUNCTION like_letter(p_letter_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM letter_recipients
    WHERE letter_id = p_letter_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_a_recipient';
  END IF;

  IF EXISTS (
    SELECT 1 FROM letter_recipients
    WHERE letter_id = p_letter_id AND user_id = auth.uid() AND disliked = TRUE
  ) THEN
    RAISE EXCEPTION 'already_disliked';
  END IF;

  IF EXISTS (
    SELECT 1 FROM letter_recipients
    WHERE letter_id = p_letter_id AND user_id = auth.uid() AND liked = TRUE
  ) THEN
    RETURN; -- idempotent
  END IF;

  UPDATE letter_recipients
  SET liked = TRUE
  WHERE letter_id = p_letter_id AND user_id = auth.uid();

  -- like_count appearing in the eligibility expression is what extends
  -- reach by one reader; travel_count now only counts deliveries.
  UPDATE letters
  SET like_count = like_count + 1
  WHERE id = p_letter_id
    AND status = 'active'
    AND expires_at > NOW();
END;
$$;

-- ============================================================
-- DISLIKE — a graveyard vote instead of a global kill
-- ============================================================

-- TUNING KNOB: a letter dies early only once at least 3 readers voted it
-- out AND gravestones outnumber hearts. Below that, the vote is recorded
-- and the letter keeps circulating (the disliker never sees it again
-- anyway). Public Obituary display remains gated by manual moderation.
CREATE OR REPLACE FUNCTION dislike_letter(p_letter_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM letter_recipients
    WHERE letter_id = p_letter_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_a_recipient';
  END IF;

  IF EXISTS (
    SELECT 1 FROM letter_recipients
    WHERE letter_id = p_letter_id AND user_id = auth.uid() AND liked = TRUE
  ) THEN
    RAISE EXCEPTION 'already_liked';
  END IF;

  IF EXISTS (
    SELECT 1 FROM letter_recipients
    WHERE letter_id = p_letter_id AND user_id = auth.uid() AND disliked = TRUE
  ) THEN
    RETURN; -- idempotent
  END IF;

  UPDATE letter_recipients
  SET disliked = TRUE
  WHERE letter_id = p_letter_id AND user_id = auth.uid();

  UPDATE letters
  SET dislike_count = dislike_count + 1
  WHERE id = p_letter_id
    AND status = 'active'
    AND expires_at > NOW();

  UPDATE letters
  SET status = 'expired'
  WHERE id = p_letter_id
    AND status = 'active'
    AND dislike_count >= 3
    AND dislike_count > like_count;
END;
$$;
