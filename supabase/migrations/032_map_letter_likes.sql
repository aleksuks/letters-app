-- Likes on map letters: a small "this was funny / honest" nod from a
-- reader. Unlike pool-letter likes they carry no mechanics at all — no
-- reach extension (there is no reach), no lifespan extension, no milestone
-- notifications, no ranking. Just a counter the author and later readers
-- can see. One like per reader, no unlike (same as pool letters).
--
-- Pool letters track likes on letter_recipients because a recipient row
-- always exists first; the map has no claim rows, so likes get their own
-- table.

-- ============================================================
-- SCHEMA
-- ============================================================

ALTER TABLE map_letters ADD COLUMN like_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE map_letter_likes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_letter_id UUID NOT NULL REFERENCES map_letters(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (map_letter_id, user_id)
);

CREATE INDEX idx_map_letter_likes_letter ON map_letter_likes(map_letter_id);

ALTER TABLE map_letter_likes ENABLE ROW LEVEL SECURITY;

-- Readers only ever need their own row ("have I already liked this?").
-- Nobody can enumerate who liked a letter — the aggregate count on
-- map_letters is the only public trace. Writes go through the RPC below.
CREATE POLICY "map_letter_likes_own_select"
  ON map_letter_likes FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- LIKE — idempotent, one per reader, never on your own letter
-- ============================================================

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

  INSERT INTO map_letter_likes (map_letter_id, user_id)
  VALUES (p_map_letter_id, auth.uid())
  ON CONFLICT (map_letter_id, user_id) DO NOTHING;

  -- Second tap is a silent no-op, same as like_letter().
  IF FOUND THEN
    UPDATE map_letters
    SET like_count = like_count + 1
    WHERE id = p_map_letter_id;
  END IF;
END;
$$;

-- ============================================================
-- MAP FEED — expose the count (return-type change needs a drop)
-- ============================================================

DROP FUNCTION IF EXISTS get_map_letters();

CREATE OR REPLACE FUNCTION get_map_letters()
RETURNS TABLE (
  id                      UUID,
  author_id               UUID,
  lat                     DOUBLE PRECISION,
  lng                     DOUBLE PRECISION,
  body                    TEXT,
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
  SELECT ml.id, ml.author_id, ml.lat, ml.lng, ml.body, ml.created_at,
         ml.expires_at, ml.like_count, up.nickname, up.accepts_requests
  FROM map_letters ml
  JOIN user_profiles up ON up.id = ml.author_id
  WHERE ml.status = 'active'
    AND ml.expires_at > NOW();
END;
$$;
