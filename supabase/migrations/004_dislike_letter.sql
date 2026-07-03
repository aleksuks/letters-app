-- Explicit dislike action ("Į kapines"). Previously a recipient who didn't
-- like a letter had no way to act on it — the letter just kept sitting in
-- the pool until it happened to hit expires_at or max_travels on its own.
-- A dislike now retires it immediately instead, mirroring how a like keeps
-- it alive. It does not by itself decide obituary eligibility — that still
-- goes through the existing manual moderation / approved_for_obituary flag.

ALTER TABLE letter_recipients
  ADD COLUMN disliked BOOLEAN NOT NULL DEFAULT FALSE;

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
  SET status = 'expired'
  WHERE id = p_letter_id
    AND status = 'active';
END;
$$;

-- Mirror the same liked/disliked exclusivity guard on like_letter.
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

  UPDATE letters
  SET like_count   = like_count + 1,
      travel_count = travel_count + 1
  WHERE id = p_letter_id
    AND status = 'active'
    AND expires_at > NOW();
END;
$$;
