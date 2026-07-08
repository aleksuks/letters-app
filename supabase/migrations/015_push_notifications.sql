-- Push notifications: quiet, event-driven, no in-app inbox.
--
-- Three kinds of event, each a separate notification type so one type can
-- be silenced or tuned without touching the others:
--
--   like_milestone  — an author's letter crosses a heart-count threshold.
--   letter_died     — an author's letter stops traveling (expiry or a
--                      graveyard vote). Independent of moderation.
--   letter_obituary — a moderator later approves that dead letter for the
--                      public Obituary feed. A distinct, less common event
--                      from letter_died — most dead letters never get here.
--   reminder        — a gentle nudge to an inactive account, sent only when
--                      a letter is actually receivable by them right now.
--
-- Enqueueing (DB triggers/functions, transactional with the event that
-- caused it) is decoupled from sending (the send-push-notifications Edge
-- Function draining this table on a pg_cron heartbeat) so a flaky push
-- provider can never roll back or block the underlying business logic.

-- ============================================================
-- SCHEMA
-- ============================================================

ALTER TABLE user_profiles ADD COLUMN push_token           TEXT;
ALTER TABLE user_profiles ADD COLUMN last_active_at        TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE user_profiles ADD COLUMN last_reminder_sent_at TIMESTAMPTZ;
ALTER TABLE user_profiles ADD COLUMN reminders_enabled     BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE letters ADD COLUMN last_notified_like_milestone INTEGER NOT NULL DEFAULT 0;

CREATE TABLE notification_outbox (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('like_milestone', 'letter_died', 'letter_obituary', 'reminder')),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  push_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at    TIMESTAMPTZ,
  error      TEXT
);

CREATE INDEX idx_notification_outbox_unsent
  ON notification_outbox(created_at) WHERE sent_at IS NULL;

CREATE INDEX idx_user_profiles_reminder_candidates
  ON user_profiles(last_active_at) WHERE push_token IS NOT NULL AND reminders_enabled;

ALTER TABLE notification_outbox ENABLE ROW LEVEL SECURITY;
-- No policies: same pattern as moderation_keywords. Nothing here is ever
-- read or written directly by a client — only by SECURITY DEFINER
-- functions/triggers (run as table owner, bypassing RLS) and the dispatch
-- Edge Function (service-role key, also bypasses RLS). There is no in-app
-- notification inbox, so clients have no legitimate reason to see this
-- table at all.

-- ============================================================
-- LIKE MILESTONES
-- BEFORE UPDATE so it can stamp last_notified_like_milestone in the same
-- write that crossed it — no separate round trip, no double-fire race.
-- ============================================================

CREATE OR REPLACE FUNCTION notify_like_milestones()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  -- TUNING KNOB: milestone ladder. Small steps early (when every heart is
  -- a big deal to a new author), round numbers further out.
  v_milestones INTEGER[] := ARRAY[1,2,3,5,10,15,20,25,30,40,50,75,100,150,200,300,500,750,1000];
  v_total      INTEGER := NEW.like_count + NEW.after_like_count;
  v_milestone  INTEGER;
  v_token      TEXT;
BEGIN
  SELECT MAX(m) INTO v_milestone
  FROM UNNEST(v_milestones) AS m
  WHERE m <= v_total AND m > NEW.last_notified_like_milestone;

  IF v_milestone IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.last_notified_like_milestone := v_milestone;

  SELECT push_token INTO v_token FROM user_profiles WHERE id = NEW.author_id;
  IF v_token IS NOT NULL THEN
    INSERT INTO notification_outbox (user_id, type, title, body, data, push_token)
    VALUES (
      NEW.author_id,
      'like_milestone',
      'Tavo laiškelis surinko ' || v_milestone || ' ❤',
      'Kažkam jis patiko.',
      jsonb_build_object('type', 'like_milestone', 'letter_id', NEW.id, 'milestone', v_milestone),
      v_token
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_like_milestones
  BEFORE UPDATE ON letters
  FOR EACH ROW
  WHEN ((NEW.like_count + NEW.after_like_count) IS DISTINCT FROM (OLD.like_count + OLD.after_like_count))
  EXECUTE FUNCTION notify_like_milestones();

-- ============================================================
-- LETTER DEATH + OBITUARY PLACEMENT
-- Two independent events on the same row; a letter can hit either, both,
-- or (usually) just the first.
-- ============================================================

CREATE OR REPLACE FUNCTION notify_letter_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_token TEXT;
BEGIN
  SELECT push_token INTO v_token FROM user_profiles WHERE id = NEW.author_id;
  IF v_token IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'expired' AND OLD.status IS DISTINCT FROM 'expired' THEN
    INSERT INTO notification_outbox (user_id, type, title, body, data, push_token)
    VALUES (
      NEW.author_id,
      'letter_died',
      'Tavo laiškelis baigė kelionę',
      '✉ ' || NEW.travel_count || '   ·   ❤ ' || (NEW.like_count + NEW.after_like_count),
      jsonb_build_object('type', 'letter_died', 'letter_id', NEW.id),
      v_token
    );
  END IF;

  IF NEW.approved_for_obituary AND NOT OLD.approved_for_obituary THEN
    INSERT INTO notification_outbox (user_id, type, title, body, data, push_token)
    VALUES (
      NEW.author_id,
      'letter_obituary',
      'Tavo laiškelis kapinėse',
      'Praėjo peržiūrą ir dabar matomas viešai, „Kapinių" skiltyje.',
      jsonb_build_object('type', 'letter_obituary', 'letter_id', NEW.id),
      v_token
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_letter_lifecycle
  AFTER UPDATE ON letters
  FOR EACH ROW
  WHEN (
    (NEW.status = 'expired' AND OLD.status IS DISTINCT FROM 'expired')
    OR (NEW.approved_for_obituary AND NOT OLD.approved_for_obituary)
  )
  EXECUTE FUNCTION notify_letter_lifecycle();

-- ============================================================
-- GENTLE REMINDER
-- Only ever targets accounts that have gone quiet AND have a letter they
-- could actually receive right now — mirrors receive_letter()'s own
-- eligibility check so the nudge is never a lie.
-- ============================================================

CREATE OR REPLACE FUNCTION enqueue_reminder_notifications()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_ids UUID[];
BEGIN
  PERFORM expire_due_letters();

  WITH candidates AS (
    SELECT up.id, up.push_token
    FROM user_profiles up
    WHERE up.push_token IS NOT NULL
      AND up.reminders_enabled
      -- TUNING KNOB: quiet period before a nudge is even considered, and
      -- the minimum gap between two nudges to the same person.
      AND up.last_active_at <= NOW() - INTERVAL '3 days'
      AND (up.last_reminder_sent_at IS NULL OR up.last_reminder_sent_at <= NOW() - INTERVAL '3 days')
      AND EXISTS (
        SELECT 1 FROM letters l
        WHERE l.status = 'active'
          AND l.expires_at > NOW()
          AND l.author_id != up.id
          AND l.travel_count < l.recipient_cap + l.like_count
          AND (l.last_delivered_at IS NULL OR l.last_delivered_at <= NOW() - INTERVAL '1 hour')
          AND NOT EXISTS (
            SELECT 1 FROM letter_recipients lr
            WHERE lr.letter_id = l.id AND lr.user_id = up.id AND lr.released_at IS NULL
          )
      )
  ), inserted AS (
    INSERT INTO notification_outbox (user_id, type, title, body, data, push_token)
    SELECT id, 'reminder', 'Laiškelis laukia', 'Yra naujas laiškelis, kurį galėtum gauti.',
           '{"type":"reminder"}'::jsonb, push_token
    FROM candidates
    RETURNING user_id
  )
  SELECT ARRAY_AGG(user_id) INTO v_user_ids FROM inserted;

  IF v_user_ids IS NOT NULL THEN
    UPDATE user_profiles SET last_reminder_sent_at = NOW() WHERE id = ANY(v_user_ids);
  END IF;
END;
$$;

-- ============================================================
-- SCHEDULING
-- Dispatch needs to leave the database (Expo's push HTTP API), so it goes
-- through pg_net + a vault-stored service-role token authenticating the
-- call to the Edge Function. Enqueueing the reminder is pure SQL and needs
-- neither. Both degrade gracefully (RAISE NOTICE, not failure) if the
-- extensions aren't available, matching the pattern already used for the
-- lifecycle sweep in migration 012.
--
-- One-time manual setup this migration can't do for you (secrets don't
-- belong in a committed migration file): store the project's service_role
-- key in Vault under the name 'service_role_key', e.g. via the SQL editor:
--   select vault.create_secret('<service-role-key>', 'service_role_key');
-- ============================================================

DO $do$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
  PERFORM cron.schedule(
    'push-notifications-dispatch',
    '* * * * *',
    $job$
    SELECT net.http_post(
      url     := 'https://fuskxhhwkanenwmmoytu.supabase.co/functions/v1/send-push-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
      ),
      body    := '{}'::jsonb
    );
    $job$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_net/vault unavailable (%); push dispatch needs manual scheduling until set up', SQLERRM;
END;
$do$;

DO $do$
BEGIN
  PERFORM cron.schedule(
    'reminder-notifications-enqueue',
    '0 17 * * *', -- once daily, tuning knob
    $job$ SELECT enqueue_reminder_notifications(); $job$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron unavailable (%); reminder enqueue needs manual scheduling', SQLERRM;
END;
$do$;
