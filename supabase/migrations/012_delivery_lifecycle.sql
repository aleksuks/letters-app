-- Delivery lifecycle: stop letters from silently vanishing.
--
-- Two bugs compounded into "letters just disappear":
--
--   1. Abandoned deliveries. receive_letter() consumed a delivery slot
--      (letter_recipients row + travel_count + the hourly pacing stamp) the
--      moment the RPC ran — before the reader actually saw anything. Backing
--      out mid-animation, an app kill, or a double-tap burned the slot
--      forever: that reader could never get the letter again and, with a
--      small user base (recipient_cap = ceil(users/16) is often 1–2), a
--      couple of abandoned opens exhausted the letter's whole reach. It then
--      circulated to no one.
--
--   2. No active → expired transition on time. Only the dislike vote and
--      report resolution ever set status = 'expired'. A letter that simply
--      aged past expires_at stayed 'active' forever — excluded from the
--      receive pool by the expires_at check, but invisible to the moderation
--      queue and the Obituary, which both key on status = 'expired'.
--
-- New delivery lifecycle for a letter_recipients row:
--
--   claimed  — receive_letter() reserves the slot (still atomic, still
--              counts against the reach cap so concurrent claims can't
--              overshoot it).
--   opened   — the app confirms the reader actually saw the letter
--              (open_letter(), called when the unfold animation completes;
--              liking, disliking, or reporting confirms implicitly).
--   released — an unopened, unreacted claim is returned to the pool, either
--              explicitly (release_letter(), when the reader backs out
--              early) or by the reaper (release_stale_claims(), covering
--              crashes and dead clients). Released rows are kept, not
--              deleted: they stop counting against travel_count, free the
--              pacing slot, and allow that same user to claim the letter
--              again — they never read it.
--
-- Time-based expiry becomes an explicit transition (expire_due_letters()),
-- run lazily on every receive_letter() call, on moderation-queue load, and
-- on a pg_cron schedule where the extension is available — so letters reach
-- the moderation queue → Obituary even through quiet periods.

-- ============================================================
-- SCHEMA
-- ============================================================

ALTER TABLE letter_recipients ADD COLUMN opened_at   TIMESTAMPTZ;
ALTER TABLE letter_recipients ADD COLUMN released_at TIMESTAMPTZ;

-- Historical rows predate open-confirmation and can't be told apart from
-- real reads; treat them all as read so the reaper never claws back a
-- delivery that may genuinely have been seen.
UPDATE letter_recipients SET opened_at = COALESCE(seen_at, NOW());

-- Reaper scan: only ever looks at unconfirmed, unreleased claims.
CREATE INDEX idx_letter_recipients_unconfirmed
  ON letter_recipients(seen_at)
  WHERE opened_at IS NULL AND released_at IS NULL;

-- Expiry sweep: only ever looks at still-active letters.
CREATE INDEX idx_letters_active_expires_at
  ON letters(expires_at)
  WHERE status = 'active';

-- ============================================================
-- EXPIRY SWEEP
-- ============================================================

CREATE OR REPLACE FUNCTION expire_due_letters()
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE letters
  SET status = 'expired'
  WHERE status = 'active'
    AND expires_at <= NOW();
$$;

-- ============================================================
-- DELIVERY ACCOUNTING
-- ============================================================

-- Re-derives travel_count and last_delivered_at from the unreleased
-- letter_recipients rows — the single source of truth for deliveries.
-- Every release/reinstate path funnels through this, so the counters can
-- never drift permanently.
CREATE OR REPLACE FUNCTION recount_letter_deliveries(p_letter_ids UUID[])
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE letters l
  SET travel_count = (
        SELECT COUNT(*) FROM letter_recipients lr
        WHERE lr.letter_id = l.id AND lr.released_at IS NULL
      ),
      last_delivered_at = (
        SELECT MAX(lr.seen_at) FROM letter_recipients lr
        WHERE lr.letter_id = l.id AND lr.released_at IS NULL
      )
  WHERE l.id = ANY (p_letter_ids);
$$;

-- ============================================================
-- OPEN — the app confirms the reader actually saw the letter
-- ============================================================

CREATE OR REPLACE FUNCTION open_letter(p_letter_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE letter_recipients
  SET opened_at = COALESCE(opened_at, NOW())
  WHERE letter_id = p_letter_id
    AND user_id = auth.uid()
    AND released_at IS NULL;

  IF FOUND THEN
    RETURN;
  END IF;

  -- The claim was already released (reaped under a very slow client, or a
  -- retry after a network failure). The reader is looking at the letter,
  -- so the delivery is real — reinstate it.
  UPDATE letter_recipients
  SET released_at = NULL,
      opened_at   = NOW(),
      seen_at     = COALESCE(seen_at, NOW())
  WHERE letter_id = p_letter_id
    AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_a_recipient';
  END IF;

  PERFORM recount_letter_deliveries(ARRAY[p_letter_id]);
END;
$$;

-- ============================================================
-- RELEASE — reader backed out before reading; return the slot
-- ============================================================

CREATE OR REPLACE FUNCTION release_letter(p_letter_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE letter_recipients
  SET released_at = NOW()
  WHERE letter_id = p_letter_id
    AND user_id = auth.uid()
    AND released_at IS NULL
    AND opened_at IS NULL
    AND liked = FALSE
    AND disliked = FALSE;

  IF FOUND THEN
    PERFORM recount_letter_deliveries(ARRAY[p_letter_id]);
  END IF;
  -- Otherwise a silent no-op: the client calls this best-effort on exit,
  -- and an already-opened, already-reacted, or already-reaped claim has
  -- nothing to give back.
END;
$$;

-- ============================================================
-- REAPER — crash-proof backstop for claims the client never resolved
-- ============================================================

-- TUNING KNOB: how long an unconfirmed claim may sit before its slot goes
-- back to the pool. Must comfortably exceed the arrival animation plus the
-- open_letter() round-trip; 15 minutes only ever catches dead clients.
CREATE OR REPLACE FUNCTION release_stale_claims()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_letter_ids UUID[];
BEGIN
  WITH reaped AS (
    UPDATE letter_recipients lr
    SET released_at = NOW()
    WHERE lr.opened_at IS NULL
      AND lr.released_at IS NULL
      AND lr.liked = FALSE
      AND lr.disliked = FALSE
      AND lr.seen_at < NOW() - INTERVAL '15 minutes'
    RETURNING lr.letter_id
  )
  SELECT ARRAY_AGG(DISTINCT letter_id) INTO v_letter_ids FROM reaped;

  IF v_letter_ids IS NOT NULL THEN
    PERFORM recount_letter_deliveries(v_letter_ids);
  END IF;
END;
$$;

-- ============================================================
-- RECEIVE — claim stays atomic, but is now provisional until opened
-- ============================================================

CREATE OR REPLACE FUNCTION receive_letter()
RETURNS TABLE (
  id                      UUID,
  author_id               UUID,
  body                    TEXT,
  created_at              TIMESTAMPTZ,
  expires_at              TIMESTAMPTZ,
  status                  letter_status,
  like_count              INTEGER,
  travel_count            INTEGER,
  recipient_cap           INTEGER,
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
    -- reach: initial cap plus one extra reader per like
    AND l.travel_count < l.recipient_cap + l.like_count
    -- pacing: at most one delivery per hour
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

  -- Fresh claim, or re-claim of a row this user previously released. The
  -- WHERE arm keeps the double-tap guard: conflicting with an unreleased
  -- row updates nothing, so FOUND stays false and we bail out.
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
  SELECT v_letter.id, v_letter.author_id, v_letter.body, v_letter.created_at,
         v_letter.expires_at, v_letter.status, v_letter.like_count,
         v_letter.travel_count + 1, v_letter.recipient_cap,
         v_letter.dislike_count, up.nickname, up.accepts_requests
  FROM user_profiles up
  WHERE up.id = v_letter.author_id;
END;
$$;

-- ============================================================
-- RLS — keep the direct-select eligibility in sync (defense in depth)
-- ============================================================

DROP POLICY IF EXISTS "letters_receive_eligible" ON letters;

CREATE POLICY "letters_receive_eligible"
  ON letters FOR SELECT USING (
    status = 'active'
    AND expires_at > NOW()
    AND author_id != auth.uid()
    AND travel_count < recipient_cap + like_count
    AND (last_delivered_at IS NULL
         OR last_delivered_at <= NOW() - INTERVAL '1 hour')
    AND NOT EXISTS (
      SELECT 1 FROM letter_recipients lr
      WHERE lr.letter_id = letters.id
        AND lr.user_id = auth.uid()
        AND lr.released_at IS NULL
    )
  );

-- ============================================================
-- LIKE / DISLIKE — a reaction confirms the delivery
-- ============================================================

CREATE OR REPLACE FUNCTION like_letter(p_letter_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_rec letter_recipients%ROWTYPE;
BEGIN
  -- FOR UPDATE serializes against the reaper: either it waits for us and
  -- then skips the now-reacted row, or we see its release and recount.
  SELECT * INTO v_rec FROM letter_recipients
  WHERE letter_id = p_letter_id AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_a_recipient';
  END IF;

  IF v_rec.disliked THEN
    RAISE EXCEPTION 'already_disliked';
  END IF;

  IF v_rec.liked THEN
    RETURN; -- idempotent
  END IF;

  -- Reacting proves the letter was read; if the claim had been reaped out
  -- from under a slow reader, reinstate it.
  UPDATE letter_recipients
  SET liked       = TRUE,
      opened_at   = COALESCE(opened_at, NOW()),
      released_at = NULL
  WHERE id = v_rec.id;

  IF v_rec.released_at IS NOT NULL THEN
    PERFORM recount_letter_deliveries(ARRAY[p_letter_id]);
  END IF;

  -- like_count appearing in the eligibility expression is what extends
  -- reach by one reader; travel_count only counts deliveries.
  UPDATE letters
  SET like_count = like_count + 1
  WHERE id = p_letter_id
    AND status = 'active'
    AND expires_at > NOW();
END;
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
  SET status = 'expired'
  WHERE id = p_letter_id
    AND status = 'active'
    AND dislike_count >= 3
    AND dislike_count > like_count;
END;
$$;

-- ============================================================
-- REPORT — reporting also confirms the delivery, so the reporter's slot
-- is never reaped and they can't be re-dealt the letter if it's restored
-- ============================================================

CREATE OR REPLACE FUNCTION report_letter(p_letter_id UUID, p_reason TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  INSERT INTO reports (target_type, target_id, reporter_id, reason)
  VALUES ('letter', p_letter_id, auth.uid(), p_reason);

  UPDATE letter_recipients
  SET opened_at = COALESCE(opened_at, NOW())
  WHERE letter_id = p_letter_id
    AND user_id = auth.uid()
    AND released_at IS NULL;

  UPDATE letters
  SET status = 'removed_reported'
  WHERE id = p_letter_id
    AND status = 'active';
END;
$$;

-- ============================================================
-- BACKFILL + SCHEDULING
-- ============================================================

-- Flip every letter that already aged out while stuck on 'active', so the
-- backlog finally lands in the moderation queue.
SELECT expire_due_letters();

-- Belt-and-braces: run both sweeps on a schedule where pg_cron exists
-- (it does on Supabase), so expiry and reaping don't depend on receive
-- traffic. If the extension can't be installed, the lazy calls inside
-- receive_letter() and the moderation screen remain the fallback.
DO $do$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule(
    'letters-lifecycle-sweep',
    '*/10 * * * *',
    $job$ SELECT expire_due_letters(); SELECT release_stale_claims(); $job$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron unavailable (%); relying on lazy sweeps in receive_letter()', SQLERRM;
END;
$do$;
