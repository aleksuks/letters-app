-- ============================================================
-- 040 — Reject Cyrillic outright in letter bodies and nicknames
--
-- Migration 007 lists "unicode homoglyphs from other scripts (e.g. Cyrillic
-- а) are not folded" as a known limitation, with reports as the backstop.
-- It is worse than that in practice, and in two directions at once:
--
--   * normalize_for_moderation() strips everything outside [a-z] AFTER
--     unaccent, and unaccent does not transliterate Cyrillic. A body written
--     in Cyrillic normalizes to the empty string, so it scores 0 no matter
--     what it says. Confirmed on the live database: 'блядь' -> ''.
--   * A single Cyrillic character inside an otherwise Latin word defeats the
--     matcher for that word, because the two look identical on screen and
--     nothing folds them together. Cyrillic а/е/о/р/с/х/у are homoglyphs of
--     Latin a/e/o/p/c/x/y — enough to spell most evasions.
--
-- Banning the script is a blunter instrument than folding homoglyphs, and a
-- much more reliable one: there is no partial-coverage table to keep current
-- and nothing to get clever about. The app is Lithuanian-language throughout,
-- so Latin script is already the assumption everywhere else.
--
-- SCOPE, and what is deliberately left out:
--   * letters + map_letters — both run letters_moderation_gate(), so one
--     function change covers both kinds.
--   * nicknames — the strongest homoglyph target in the app, since a
--     nickname is the only identity other users see, and a Cyrillic
--     lookalike is straightforward impersonation of an existing user.
--   * NOT messages. A private conversation between two consenting people is
--     not a distribution surface, and cutting a reply off mid-thread because
--     of its script would break an accepted conversation rather than protect
--     anyone. Revisit only if it is actually abused.
--
-- Range check is by code point via ascii(), not a regex character range:
-- bracket ranges like [а-я] are resolved in collation order rather than code
-- point order, so they are not dependable for this. ascii() returns the
-- Unicode code point on a UTF8 database, which is exact.
--
-- Blocks covered: Cyrillic (U+0400–U+04FF), Cyrillic Supplement
-- (U+0500–U+052F), Cyrillic Extended-A (U+2DE0–U+2DFF) and Extended-B
-- (U+A640–U+A69F). The extended blocks are archaic, but they are free to
-- include and they are exactly where someone looking for a gap would look.
-- ============================================================

CREATE OR REPLACE FUNCTION contains_cyrillic(p_text TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM regexp_split_to_table(coalesce(p_text, ''), '') AS ch
    WHERE ascii(ch) BETWEEN 1024  AND 1327    -- U+0400–U+052F
       OR ascii(ch) BETWEEN 11744 AND 11775   -- U+2DE0–U+2DFF
       OR ascii(ch) BETWEEN 42560 AND 42655   -- U+A640–U+A69F
  );
$$;

-- Same visibility posture as the rest of the moderation machinery: not a
-- client API, so it cannot be used to probe behaviour from the app.
REVOKE EXECUTE ON FUNCTION contains_cyrillic(TEXT) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- Letters and map letters
-- ============================================================

-- Distinct exception from letter_rejected_moderation on purpose. A keyword
-- rejection is a judgment the writer cannot argue with and should not be
-- coached around; a script rejection is a fixable mistake, so the client
-- says which one it is and the writer can retype the sentence.
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

  IF moderation_score(NEW.body) >= REJECT_THRESHOLD THEN
    RAISE EXCEPTION 'letter_rejected_moderation';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- Nicknames
-- ============================================================

CREATE OR REPLACE FUNCTION nickname_moderation_gate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  -- TUNING KNOB: unlike letters, even the mildest single keyword hit
  -- (1 point) rejects — there's no context for a rough word to be genuine.
  NICKNAME_REJECT_THRESHOLD CONSTANT INTEGER := 1;
BEGIN
  IF contains_cyrillic(NEW.nickname) THEN
    RAISE EXCEPTION 'nickname_rejected_script';
  END IF;

  IF moderation_score(NEW.nickname) >= NICKNAME_REJECT_THRESHOLD THEN
    RAISE EXCEPTION 'nickname_rejected_moderation';
  END IF;

  RETURN NEW;
END;
$$;

-- Existing rows are untouched: this gates writes only. If any account
-- already carries a Cyrillic nickname it keeps it until it is next edited,
-- at which point the trigger applies. Worth a one-off check after deploying:
--   SELECT id, nickname FROM user_profiles WHERE contains_cyrillic(nickname);
