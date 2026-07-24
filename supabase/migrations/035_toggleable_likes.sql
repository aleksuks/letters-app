-- Map-letter likes and Obituary afterlikes become toggleable: a second
-- like tap (double-tap, or the small heart button on the Obituary card)
-- now removes the like instead of being a silent idempotent no-op.
--
-- This reverses the "no unlike" decision documented in 032's header
-- comment and in CLAUDE.md's map_letters bullet — both should be read as
-- superseded by this migration. It's safe to reverse here specifically
-- because neither like kind drives any mechanics: map-letter likes never
-- did (no reach, no ranking — CLAUDE.md rule 11), and afterlikes only
-- ever apply to letters already dead in the Obituary, long after
-- like_count stopped affecting distribution. Pool-letter likes
-- (like_letter(), migration 006) are NOT touched — that like_count
-- permanently extends recipient_cap the moment it's given, so walking it
-- back would have to also claw back reach that may already be in use.

CREATE OR REPLACE FUNCTION like_map_letter(p_map_letter_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_letter map_letters%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_letter FROM map_letters
  WHERE id = p_map_letter_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF v_letter.author_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_like_own';
  END IF;

  IF v_letter.status != 'active' OR v_letter.expires_at <= NOW() THEN
    RAISE EXCEPTION 'letter_not_active';
  END IF;

  DELETE FROM map_letter_likes
  WHERE map_letter_id = p_map_letter_id AND user_id = auth.uid();

  IF FOUND THEN
    UPDATE map_letters SET like_count = like_count - 1 WHERE id = p_map_letter_id;
    RETURN;
  END IF;

  INSERT INTO map_letter_likes (map_letter_id, user_id)
  VALUES (p_map_letter_id, auth.uid());

  UPDATE map_letters SET like_count = like_count + 1 WHERE id = p_map_letter_id;
END;
$$;

CREATE OR REPLACE FUNCTION give_after_like(p_letter_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Same eligibility as the public Obituary listing itself (status +
  -- approved_for_obituary) — a letter can't be after-liked (or
  -- un-after-liked) unless it's actually visible on the public feed.
  IF NOT EXISTS (
    SELECT 1 FROM letters
    WHERE id = p_letter_id AND status = 'expired' AND approved_for_obituary = TRUE
  ) THEN
    RAISE EXCEPTION 'not_obituary_eligible';
  END IF;

  DELETE FROM letter_afterlikes
  WHERE letter_id = p_letter_id AND user_id = auth.uid();

  IF FOUND THEN
    UPDATE letters SET after_like_count = after_like_count - 1 WHERE id = p_letter_id;
    RETURN;
  END IF;

  INSERT INTO letter_afterlikes (letter_id, user_id)
  VALUES (p_letter_id, auth.uid());

  UPDATE letters SET after_like_count = after_like_count + 1 WHERE id = p_letter_id;
END;
$$;
