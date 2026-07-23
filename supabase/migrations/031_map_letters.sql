-- Map letters ("vietos laiškeliai"): a second way to send a letter — pinned
-- to a geographic spot in Lithuania instead of dealt to a random stranger.
-- The emotional premise: you saw or crossed paths with someone at a place
-- and never got to say thanks / sorry / anything — so you leave the words
-- there, and whoever browses the map (ideally them) can find and read them.
--
-- Deliberate differences from pool letters:
--   - Publicly browsable on the map by any signed-in user — no claim slots,
--     no pacing, no likes/travel, no Obituary. The map itself is the surface.
--   - Longer lifespan (30 days vs 7): the person it's aimed at may not open
--     the app for weeks, and an apology that evaporates in a week defeats
--     the point. Still temporary by design.
--   - Placement is a deliberate map tap, never device GPS — the author
--     chooses exactly what spot to reveal, so no location tracking exists
--     to leak.
--
-- What is deliberately shared with pool letters:
--   - The keyword moderation gate (letters_moderation_gate() reads only
--     NEW.body, so the same trigger function attaches directly).
--   - The report → soft removal → single manual review queue flow.
--   - Connection requests → conversations, including the block and
--     duplicate-conversation triggers, via a second FK on
--     connection_requests rather than a parallel table.

-- ============================================================
-- SCHEMA
-- ============================================================

CREATE TABLE map_letters (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id  UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  -- Plain lat/lng, no PostGIS: the whole country fits in one bounding box
  -- and v1 volume is small enough to ship every active letter to the
  -- client, where clustering happens anyway.
  lat        DOUBLE PRECISION NOT NULL,
  lng        DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- TUNING KNOB: map letter lifespan.
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  status     letter_status NOT NULL DEFAULT 'active',
  -- Lithuania bounding box (with a small margin for the coast/border):
  -- the map UI enforces the same limits, this makes it a hard rule.
  CONSTRAINT map_letters_in_lithuania
    CHECK (lat BETWEEN 53.85 AND 56.50 AND lng BETWEEN 20.85 AND 26.90)
);

CREATE INDEX idx_map_letters_author ON map_letters(author_id);
CREATE INDEX idx_map_letters_active_expires_at
  ON map_letters(expires_at)
  WHERE status = 'active';

-- Same send-time keyword gate as pool letters (migration 007); the client
-- surfaces the same letter_rejected_moderation exception message.
CREATE TRIGGER trg_map_letters_moderation_gate
  BEFORE INSERT OR UPDATE OF body ON map_letters
  FOR EACH ROW EXECUTE FUNCTION letters_moderation_gate();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE map_letters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "map_letters_own"
  ON map_letters FOR ALL USING (auth.uid() = author_id);

-- The map is a shared public surface for signed-in users — anyone may read
-- any active, unexpired letter. Reported/expired letters disappear from it.
CREATE POLICY "map_letters_read_active"
  ON map_letters FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND status = 'active'
    AND expires_at > NOW()
  );

CREATE POLICY "map_letters_moderator_select_reported"
  ON map_letters FOR SELECT
  USING (is_moderator() AND status = 'removed_reported');

-- ============================================================
-- EXPIRY — same lazy + scheduled pattern as pool letters (012)
-- ============================================================

CREATE OR REPLACE FUNCTION expire_due_map_letters()
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE map_letters
  SET status = 'expired'
  WHERE status = 'active'
    AND expires_at <= NOW();
$$;

-- Fold map-letter expiry into the existing sweep job; cron.schedule
-- upserts by name, so this replaces the 012 definition in place.
DO $do$
BEGIN
  PERFORM cron.schedule(
    'letters-lifecycle-sweep',
    '*/10 * * * *',
    $job$ SELECT expire_due_letters(); SELECT release_stale_claims(); SELECT expire_due_map_letters(); $job$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron unavailable (%); relying on lazy sweep in get_map_letters()', SQLERRM;
END;
$do$;

-- ============================================================
-- MAP FEED
-- ============================================================

-- One call returns every letter currently on the map, nickname included.
-- An RPC (rather than a direct select) so the expiry sweep runs lazily on
-- every map open — the map must never show a letter past its date even if
-- pg_cron is down.
CREATE OR REPLACE FUNCTION get_map_letters()
RETURNS TABLE (
  id                      UUID,
  author_id               UUID,
  lat                     DOUBLE PRECISION,
  lng                     DOUBLE PRECISION,
  body                    TEXT,
  created_at              TIMESTAMPTZ,
  expires_at              TIMESTAMPTZ,
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
         ml.expires_at, up.nickname, up.accepts_requests
  FROM map_letters ml
  JOIN user_profiles up ON up.id = ml.author_id
  WHERE ml.status = 'active'
    AND ml.expires_at > NOW();
END;
$$;

-- ============================================================
-- REPORTING — same soft-removal + single-queue flow as pool letters
-- ============================================================

-- Safe inside this transaction: the value is only referenced from plpgsql
-- bodies below (parsed, not evaluated, at CREATE time).
ALTER TYPE report_target_type ADD VALUE IF NOT EXISTS 'map_letter';

CREATE OR REPLACE FUNCTION report_map_letter(p_map_letter_id UUID, p_reason TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  INSERT INTO reports (target_type, target_id, reporter_id, reason)
  VALUES ('map_letter', p_map_letter_id, auth.uid(), p_reason);

  UPDATE map_letters
  SET status = 'removed_reported'
  WHERE id = p_map_letter_id
    AND status = 'active';
END;
$$;

-- resolve_report grows a map_letter branch; letters branch unchanged (010).
CREATE OR REPLACE FUNCTION resolve_report(p_report_id UUID, p_restore BOOLEAN)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_report reports%ROWTYPE;
BEGIN
  IF NOT is_moderator() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_report FROM reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF v_report.status != 'open' THEN
    RAISE EXCEPTION 'already_resolved';
  END IF;
  IF v_report.target_type NOT IN ('letter', 'map_letter') THEN
    RAISE EXCEPTION 'wrong_resolver';
  END IF;

  UPDATE reports
  SET status = CASE WHEN p_restore
                 THEN 'reviewed_ok'::report_status
                 ELSE 'reviewed_removed'::report_status
               END
  WHERE id = p_report_id;

  IF p_restore THEN
    IF v_report.target_type = 'letter' THEN
      UPDATE letters
      SET status = CASE WHEN expires_at > NOW() THEN 'active' ELSE 'expired' END
      WHERE id = v_report.target_id
        AND status = 'removed_reported';
    ELSE
      UPDATE map_letters
      SET status = CASE WHEN expires_at > NOW() THEN 'active' ELSE 'expired' END
      WHERE id = v_report.target_id
        AND status = 'removed_reported';
    END IF;
  END IF;
END;
$$;

-- ============================================================
-- CONNECTION REQUESTS — a request may now point at either letter kind
-- ============================================================

-- The whole point of a map letter is that its addressee might recognize
-- themselves and answer — so "Request to talk" must work here too. A second
-- nullable FK (exactly one of the two set) reuses every existing safeguard
-- on connection_requests: the accepts_requests insert policy (002), the
-- block trigger (008), the duplicate-conversation trigger (027), and
-- accept_connection_request itself, none of which read letter_id.

ALTER TABLE connection_requests ALTER COLUMN letter_id DROP NOT NULL;

ALTER TABLE connection_requests
  ADD COLUMN map_letter_id UUID REFERENCES map_letters(id) ON DELETE CASCADE;

ALTER TABLE connection_requests
  ADD CONSTRAINT connection_requests_one_letter_kind
  CHECK ((letter_id IS NULL) != (map_letter_id IS NULL));

-- Mirrors UNIQUE (letter_id, requester_id): one request per user per map
-- letter (the client maps 23505 to a friendly "already asked" alert).
CREATE UNIQUE INDEX idx_conn_requests_map_letter_requester
  ON connection_requests(map_letter_id, requester_id)
  WHERE map_letter_id IS NOT NULL;

-- ============================================================
-- MODERATION OVERVIEW — count map letters too
-- ============================================================

-- Return-type change requires a drop (CREATE OR REPLACE can't alter the
-- column list). New column appended; moderation.tsx reads named fields.
DROP FUNCTION IF EXISTS moderation_overview_stats();

CREATE OR REPLACE FUNCTION moderation_overview_stats()
RETURNS TABLE (
  active_letters_count      INTEGER,
  total_letters_count       INTEGER,
  obituary_public_count     INTEGER,
  pending_obituary_review   INTEGER,
  open_reports_count        INTEGER,
  total_users_count         INTEGER,
  active_users_24h          INTEGER,
  active_users_7d           INTEGER,
  total_conversations_count INTEGER,
  total_messages_count      INTEGER,
  active_map_letters_count  INTEGER
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_moderator() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY SELECT
    (SELECT COUNT(*) FROM letters WHERE status = 'active' AND expires_at > NOW())::INTEGER,
    (SELECT COUNT(*) FROM letters)::INTEGER,
    (SELECT COUNT(*) FROM letters WHERE approved_for_obituary = TRUE)::INTEGER,
    (SELECT COUNT(*) FROM letters WHERE status = 'expired' AND obituary_reviewed = FALSE)::INTEGER,
    (SELECT COUNT(*) FROM reports WHERE status = 'open')::INTEGER,
    (SELECT COUNT(*) FROM user_profiles)::INTEGER,
    (SELECT COUNT(*) FROM user_profiles WHERE last_active_at >= NOW() - INTERVAL '24 hours')::INTEGER,
    (SELECT COUNT(*) FROM user_profiles WHERE last_active_at >= NOW() - INTERVAL '7 days')::INTEGER,
    (SELECT COUNT(*) FROM conversations)::INTEGER,
    (SELECT COUNT(*) FROM messages)::INTEGER,
    (SELECT COUNT(*) FROM map_letters WHERE status = 'active' AND expires_at > NOW())::INTEGER;
END;
$$;
