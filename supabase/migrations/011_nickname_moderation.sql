-- Extends the keyword moderation gate (migration 007) to nicknames.
--
-- moderation_score() already normalizes and scores text against
-- moderation_keywords; letters gate on REJECT_THRESHOLD = 10 because a
-- long genuine letter can absorb a stray rough word. A nickname has no
-- surrounding prose to redeem it and is the one piece of identity shown on
-- every letter and chat, so any keyword hit at all is disqualifying —
-- hence a much stricter threshold here.
CREATE OR REPLACE FUNCTION nickname_moderation_gate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  -- TUNING KNOB: unlike letters, even the mildest single keyword hit
  -- (1 point) rejects — there's no context for a rough word to be genuine.
  NICKNAME_REJECT_THRESHOLD CONSTANT INTEGER := 1;
BEGIN
  IF moderation_score(NEW.nickname) >= NICKNAME_REJECT_THRESHOLD THEN
    RAISE EXCEPTION 'nickname_rejected_moderation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nickname_moderation_gate
  BEFORE INSERT OR UPDATE OF nickname ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION nickname_moderation_gate();
