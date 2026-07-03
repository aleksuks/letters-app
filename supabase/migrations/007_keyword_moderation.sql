-- Keyword auto-moderation: a points-based gate at send time.
--
-- Every letter body is scored against `moderation_keywords` before the
-- insert is allowed. Each keyword carries a points weight; every occurrence
-- adds its points. A letter is rejected only when the total crosses a
-- threshold — so a genuine letter with a few rough words passes, while one
-- that exists just to repeat a slur gets scrapped with a clear error the
-- client can show.
--
-- Evasion handling (all matching happens on a normalized copy of the text):
--   * case, Lithuanian diacritics (š→s, ū→u, ė→e, ...) via unaccent
--   * leet speak: 0→o, 1→i, 3→e, 4→a, 5→s, 6→g, 7→t, 8→b, @→a, $→s,
--     !→i, +→t, €→e
--   * repeated letters collapsed (faaaggot → fagot) — keywords are stored
--     through the same normalizer, so both sides collapse identically
--   * punctuation/spacing tricks (f.a.g.g.o.t, f a g g o t): a second pass
--     scans the text with all separators removed. To limit Scunthorpe-style
--     false positives, this aggressive pass only runs for high-severity
--     keywords (see SQUASH_MIN_POINTS below).
--   * Lithuanian inflection: keywords default to prefix matching
--     (is_prefix = TRUE), so one stem catches case endings.
--
-- Known limitation: unicode homoglyphs from other scripts (e.g. Cyrillic
-- "а") are not folded. Reports + manual review remain the backstop.
--
-- The keyword list itself ships empty; the founder fills it via the
-- Supabase dashboard. Suggested weights, tuned so the reject threshold of
-- 10 behaves as intended:
--   1 point  — mild profanity (a few of these never block a letter)
--   3 points — strong profanity / targeted insults
--   5 points — slurs & hate terms (one slips through, two do not,
--              spam-repeats are dead on arrival)

-- Pinned to the extensions schema and called schema-qualified below, so
-- resolution never depends on the caller's search_path (SECURITY DEFINER
-- functions inherit the session's).
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- ============================================================
-- KEYWORD LIST
-- ============================================================

CREATE TABLE moderation_keywords (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  term            TEXT NOT NULL,            -- as entered by the founder
  term_normalized TEXT NOT NULL UNIQUE,     -- filled by trigger, matched against
  points          INTEGER NOT NULL CHECK (points > 0),
  is_prefix       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- only lowercase latin words (single or multi-word) may end up in the
  -- matcher — this also guarantees terms are safe to embed in a regex
  CONSTRAINT term_normalized_shape CHECK (term_normalized ~ '^[a-z]+( [a-z]+)*$')
);

-- Founder-only data: RLS on with no policies means no client role can read
-- or write it, so the list can't be mined from the app. It is managed via
-- the Supabase dashboard / SQL editor (service role bypasses RLS).
ALTER TABLE moderation_keywords ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON moderation_keywords FROM anon, authenticated;

-- ============================================================
-- NORMALIZATION
-- ============================================================

-- Folds text into the canonical form both keywords and letter bodies are
-- compared in: lowercase ascii letters and single spaces, leet mapped,
-- repeated characters collapsed.
CREATE OR REPLACE FUNCTION normalize_for_moderation(p_text TEXT)
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT btrim(
    regexp_replace(                          -- collapse repeat runs: faaggot → fagot
      regexp_replace(                        -- anything not a-z becomes a space
        translate(
          lower(extensions.unaccent(p_text)),
          '01345678@$!+€',
          'oieasgtbasite'
        ),
        '[^a-z]', ' ', 'g'
      ),
      '(.)\1+', '\1', 'g'
    )
  )
$$;

-- Keywords pass through the same normalizer so both sides always agree.
CREATE OR REPLACE FUNCTION set_keyword_normalized()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.term_normalized := normalize_for_moderation(NEW.term);
  IF NEW.term_normalized = '' THEN
    RAISE EXCEPTION 'keyword_normalizes_to_nothing';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_moderation_keywords_normalize
  BEFORE INSERT OR UPDATE OF term ON moderation_keywords
  FOR EACH ROW EXECUTE FUNCTION set_keyword_normalized();

-- ============================================================
-- SCORING
-- ============================================================

-- Total moderation score of a text: sum of points over every keyword
-- occurrence. SECURITY DEFINER so it can read moderation_keywords, which
-- is invisible to client roles.
CREATE OR REPLACE FUNCTION moderation_score(p_body TEXT)
RETURNS INTEGER LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  -- TUNING KNOB: keywords worth at least this many points also get the
  -- aggressive separator-stripped substring pass (catches "f a g g o t").
  -- Lower-severity words skip it to avoid Scunthorpe false positives.
  SQUASH_MIN_POINTS CONSTANT INTEGER := 4;

  v_norm     TEXT;
  v_squashed TEXT;
  v_term     TEXT;
  v_score    INTEGER := 0;
  v_hits     INTEGER;
  kw         RECORD;
BEGIN
  v_norm := normalize_for_moderation(p_body);
  -- Repeats must collapse again after dropping spaces: "f a g g o t"
  -- normalizes with its double g intact (the g's aren't adjacent yet), so
  -- only squash-then-collapse lines it up with the stored "fagot".
  v_squashed := regexp_replace(replace(v_norm, ' ', ''), '(.)\1+', '\1', 'g');

  FOR kw IN SELECT term_normalized, points, is_prefix FROM moderation_keywords LOOP
    -- word-boundary pass; \m/\M are zero-width, so back-to-back repeats
    -- of the same word are each counted
    IF kw.is_prefix THEN
      SELECT count(*) INTO v_hits
      FROM regexp_matches(v_norm, '\m' || kw.term_normalized, 'g');
    ELSE
      SELECT count(*) INTO v_hits
      FROM regexp_matches(v_norm, '\m' || kw.term_normalized || '\M', 'g');
    END IF;

    -- spaced/punctuated evasion pass, high-severity terms only
    IF v_hits = 0 AND kw.points >= SQUASH_MIN_POINTS THEN
      v_term := replace(kw.term_normalized, ' ', '');
      v_hits := (length(v_squashed) - length(replace(v_squashed, v_term, '')))
                / length(v_term);
    END IF;

    v_score := v_score + v_hits * kw.points;
  END LOOP;

  RETURN v_score;
END;
$$;

-- Neither function is a client API: callable scoring would let anyone
-- probe the keyword list word by word. The letters trigger still runs them
-- fine (EXECUTE is checked at trigger creation, not per statement).
REVOKE EXECUTE ON FUNCTION normalize_for_moderation(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION moderation_score(TEXT) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- ENFORCEMENT — gate on the letters table itself
-- ============================================================

-- A trigger (rather than an RPC wrapper) means no insert path can skip the
-- check, and write.tsx keeps its plain .insert(). The client recognizes
-- the exception message below and shows a friendly Lithuanian warning.
CREATE OR REPLACE FUNCTION letters_moderation_gate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  -- TUNING KNOB: total points at which a letter is refused. With the
  -- suggested weights: a handful of mild words passes, one slur inside a
  -- real letter passes, two slurs — or any slur-spam — does not.
  REJECT_THRESHOLD CONSTANT INTEGER := 10;
BEGIN
  IF moderation_score(NEW.body) >= REJECT_THRESHOLD THEN
    RAISE EXCEPTION 'letter_rejected_moderation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_letters_moderation_gate
  BEFORE INSERT OR UPDATE OF body ON letters
  FOR EACH ROW EXECUTE FUNCTION letters_moderation_gate();
