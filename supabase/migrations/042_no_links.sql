-- ============================================================
-- 042 — Reject links in letters, map letters, and messages
--
-- moderation-checklist.md already names "link-dropping" and "attempts to
-- move the conversation to another platform" as Obituary rejections (§4),
-- but that only ever applied at expiry review — nothing stopped a link at
-- send time, and messages had no content gate at all (migration 040
-- deliberately left messages alone, but that was about script/homoglyph
-- impersonation, not this). A link is the one thing that reliably defeats
-- the whole safety model in one step: blocking, reporting, and anonymity
-- all stop mattering the moment a conversation leaves the app.
--
-- Same posture as contains_cyrillic(): a blunt, deterministic regex check
-- rather than anything clever, consistent with the no-ML non-goal.
-- Covers explicit URLs (http(s)://, www.) and bare domains from a fixed
-- TLD list (so ordinary Lithuanian text with a stray period never trips
-- it — the dot has to be immediately followed by one of these).
-- ============================================================

CREATE OR REPLACE FUNCTION contains_link(p_text TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(p_text, '') ~* '(https?://|www\.)\S+'
      OR coalesce(p_text, '') ~*
         '\m[a-z0-9][a-z0-9-]*\.(com|net|org|lt|io|me|co|info|app|ru|by|pl|de|eu|tv|gg|xyz|link|ly|to|biz|page|chat|click)\M';
$$;

REVOKE EXECUTE ON FUNCTION contains_link(TEXT) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- Letters and map letters
-- ============================================================

CREATE OR REPLACE FUNCTION letters_moderation_gate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  -- TUNING KNOB: total points at which a letter is refused. With the
  -- suggested weights: a handful of mild words passes, one slur inside a
  -- real letter passes, two slurs — or any slur-spam — does not.
  REJECT_THRESHOLD CONSTANT INTEGER := 10;
BEGIN
  -- Script check first: a Cyrillic body scores 0 under moderation_score(),
  -- so running the keyword gate first would let it through on the way past.
  IF contains_cyrillic(NEW.body) THEN
    RAISE EXCEPTION 'letter_rejected_script';
  END IF;

  IF contains_link(NEW.body) THEN
    RAISE EXCEPTION 'letter_rejected_link';
  END IF;

  IF moderation_score(NEW.body) >= REJECT_THRESHOLD THEN
    RAISE EXCEPTION 'letter_rejected_moderation';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- Messages
--
-- Unlike the script gate, this one does apply to messages: a link is
-- exactly the off-platform exit moderation-checklist.md warns about, and
-- unlike a Cyrillic character it isn't collateral damage to a genuine
-- reply — a message that is only a link loses nothing by being refused.
-- ============================================================

CREATE OR REPLACE FUNCTION check_message_no_link()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF contains_link(NEW.body) THEN
    RAISE EXCEPTION 'message_rejected_link';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_messages_link_check
  BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION check_message_no_link();
