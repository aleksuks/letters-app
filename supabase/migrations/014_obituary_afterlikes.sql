-- Post-mortem hearts + accurate lifespan for the Obituary feed.
--
-- The Obituary previously only ever showed like_count (hearts earned while
-- the letter was still traveling) and had no record of how long a letter
-- actually lived — expires_at is a fixed created_at+7days and says nothing
-- about letters that died early to a graveyard vote (dislike_letter()).
--
-- Adds:
--   1. died_at — stamped the moment a letter's status actually flips to
--      'expired', whether via the timed sweep or an early graveyard vote.
--   2. after_like_count — hearts given once a letter is already in the
--      Obituary, tracked per-user via letter_afterlikes (one per reader)
--      so the same person can't inflate it, kept separate from the
--      original like_count.
--   3. total_like_count — generated column (like_count + after_like_count)
--      so the feed can sort by combined popularity without computing it
--      client-side.

ALTER TABLE letters ADD COLUMN died_at TIMESTAMPTZ;
ALTER TABLE letters ADD COLUMN after_like_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE letters ADD COLUMN total_like_count INTEGER
  GENERATED ALWAYS AS (like_count + after_like_count) STORED;

-- Backfill: expires_at is the only signal available for letters that died
-- before this column existed (early graveyard deaths pre-date it too, so
-- there's no more accurate timestamp to recover).
UPDATE letters SET died_at = expires_at WHERE status = 'expired' AND died_at IS NULL;

-- ============================================================
-- LETTER AFTERLIKES — one post-mortem heart per reader per letter
-- ============================================================

CREATE TABLE letter_afterlikes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  letter_id  UUID NOT NULL REFERENCES letters(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (letter_id, user_id)
);

CREATE INDEX idx_letter_afterlikes_user ON letter_afterlikes(user_id);

ALTER TABLE letter_afterlikes ENABLE ROW LEVEL SECURITY;

-- Readers can see their own afterlikes (drives the filled/unfilled heart
-- state); all writes go through give_after_like() below, which validates
-- obituary eligibility server-side, so no direct-insert policy is needed.
CREATE POLICY "letter_afterlikes_own_select"
  ON letter_afterlikes FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION give_after_like(p_letter_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Same eligibility as the public Obituary listing itself (status +
  -- approved_for_obituary) — a letter can't be after-liked unless it's
  -- actually visible on the public feed.
  IF NOT EXISTS (
    SELECT 1 FROM letters
    WHERE id = p_letter_id AND status = 'expired' AND approved_for_obituary = TRUE
  ) THEN
    RAISE EXCEPTION 'not_obituary_eligible';
  END IF;

  INSERT INTO letter_afterlikes (letter_id, user_id)
  VALUES (p_letter_id, auth.uid())
  ON CONFLICT (letter_id, user_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN; -- already given, idempotent
  END IF;

  UPDATE letters SET after_like_count = after_like_count + 1 WHERE id = p_letter_id;
END;
$$;

-- ============================================================
-- died_at — stamp it at the two places status ever flips to 'expired'
-- ============================================================

CREATE OR REPLACE FUNCTION expire_due_letters()
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE letters
  SET status = 'expired', died_at = NOW()
  WHERE status = 'active'
    AND expires_at <= NOW();
$$;

CREATE OR REPLACE FUNCTION dislike_letter(p_letter_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_rec letter_recipients%ROWTYPE;
BEGIN
  SELECT * INTO v_rec FROM letter_recipients
  WHERE letter_id = p_letter_id AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_a_recipient';
  END IF;

  IF v_rec.liked THEN
    RAISE EXCEPTION 'already_liked';
  END IF;

  IF v_rec.disliked THEN
    RETURN; -- idempotent
  END IF;

  UPDATE letter_recipients
  SET disliked    = TRUE,
      opened_at   = COALESCE(opened_at, NOW()),
      released_at = NULL
  WHERE id = v_rec.id;

  IF v_rec.released_at IS NOT NULL THEN
    PERFORM recount_letter_deliveries(ARRAY[p_letter_id]);
  END IF;

  UPDATE letters
  SET dislike_count = dislike_count + 1
  WHERE id = p_letter_id
    AND status = 'active'
    AND expires_at > NOW();

  -- TUNING KNOB: graveyard vote — dies early only once at least 3 readers
  -- voted it out AND gravestones outnumber hearts.
  UPDATE letters
  SET status = 'expired', died_at = NOW()
  WHERE id = p_letter_id
    AND status = 'active'
    AND dislike_count >= 3
    AND dislike_count > like_count;
END;
$$;
