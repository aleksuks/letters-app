-- ============================================================
-- 038 — Drawings: a letter may carry a picture, text, or both
-- ============================================================
--
-- Drawings are stored as the strokes themselves, not as an image. The client
-- re-renders them with react-native-svg (already a dependency), which means:
-- no Storage bucket and its RLS, no egress on the free tier, no upload step
-- that can half-fail mid-send, no orphaned files to sweep when a letter
-- expires, and a picture that stays crisp at any size it's shown.
--
-- Payload shape (v1):
--
--   {
--     "v": 1,
--     "w": 320, "h": 320,          -- logical canvas the strokes were drawn on
--     "strokes": [
--       { "c": 3, "s": 8, "p": [[12,40],[13,42], ...] }
--     ]
--   }
--
-- `c` is an index into the app's fixed 10-colour crayon palette rather than a
-- hex value, so the palette can be re-themed (or given a dark-mode variant)
-- without rewriting stored drawings. `w`/`h` make the strokes resolution
-- independent: any reader scales them to whatever box the picture is shown in.
--
-- MODERATION NOTE: the send-time keyword gate (rule 9) cannot see a drawing.
-- Per an explicit product decision, drawings are governed by the existing
-- report flow only — the same status flip into the same single review queue
-- that already covers map letter text. There is no automated visual gate and
-- none is planned (rule: no ML/NLP moderation).

-- ------------------------------------------------------------
-- 1. Columns
-- ------------------------------------------------------------

ALTER TABLE letters     ADD COLUMN IF NOT EXISTS drawing JSONB;
ALTER TABLE map_letters ADD COLUMN IF NOT EXISTS drawing JSONB;

-- A letter must carry *something*. Text-only and drawing-only are both
-- valid; empty-and-empty is not.
ALTER TABLE letters
  ADD CONSTRAINT letters_has_content
  CHECK (length(btrim(body)) > 0 OR drawing IS NOT NULL);

ALTER TABLE map_letters
  ADD CONSTRAINT map_letters_has_content
  CHECK (length(btrim(body)) > 0 OR drawing IS NOT NULL);

-- TUNING KNOB: hard ceiling on a stored drawing. A full-canvas crayon
-- scribble lands around 5-15 KB; this is generous headroom that still stops
-- a crafted client from posting a megabyte of points.
ALTER TABLE letters
  ADD CONSTRAINT letters_drawing_size
  CHECK (drawing IS NULL OR octet_length(drawing::text) <= 120000);

ALTER TABLE map_letters
  ADD CONSTRAINT map_letters_drawing_size
  CHECK (drawing IS NULL OR octet_length(drawing::text) <= 120000);

-- ------------------------------------------------------------
-- 2. receive_letter() — carry the drawing to the reader
--    (dropped rather than replaced: the return signature grows a column)
-- ------------------------------------------------------------

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
-- 3. get_map_letters() — same, for the map
-- ------------------------------------------------------------

DROP FUNCTION IF EXISTS get_map_letters();

CREATE FUNCTION get_map_letters()
RETURNS TABLE (
  id                      UUID,
  author_id               UUID,
  lat                     DOUBLE PRECISION,
  lng                     DOUBLE PRECISION,
  body                    TEXT,
  drawing                 JSONB,
  created_at              TIMESTAMPTZ,
  expires_at              TIMESTAMPTZ,
  like_count              INTEGER,
  author_nickname         TEXT,
  author_accepts_requests BOOLEAN
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM expire_due_map_letters();

  RETURN QUERY
  SELECT ml.id, ml.author_id, ml.lat, ml.lng, ml.body, ml.drawing,
         ml.created_at, ml.expires_at, ml.like_count,
         up.nickname, up.accepts_requests
  FROM map_letters ml
  JOIN user_profiles up ON up.id = ml.author_id
  WHERE ml.status = 'active'
    AND ml.expires_at > NOW();
END;
$$;
