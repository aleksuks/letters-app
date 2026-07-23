-- Two gaps found in review:
--
-- 1. blocking (008) never got a reverse operation — a user could block but
--    never unblock, and there was no screen listing who they'd blocked.
--    The RLS policy on blocked_users already scopes rows to the blocker,
--    so this is a thin symmetric RPC mirroring block_user().
--
-- 2. push notifications (015) only ever exposed one toggle
--    (reminders_enabled). The three "your letter is doing something"
--    events — like_milestone, letter_died, letter_obituary — had no way
--    to be silenced independently of the reminder nudge. This adds one
--    flag covering all three (they're all "your letter's travels", one
--    concern from the user's point of view) and gates each insert on it.

-- ============================================================
-- UNBLOCK
-- ============================================================

CREATE OR REPLACE FUNCTION unblock_user(p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  DELETE FROM blocked_users
  WHERE blocker_id = auth.uid() AND blocked_id = p_user_id;
END;
$$;

-- ============================================================
-- ACTIVITY NOTIFICATIONS TOGGLE
-- ============================================================

ALTER TABLE user_profiles
  ADD COLUMN activity_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE OR REPLACE FUNCTION notify_like_milestones()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_milestones INTEGER[] := ARRAY[1,2,3,5,10,15,20,25,30,40,50,75,100,150,200,300,500,750,1000];
  v_total      INTEGER := NEW.like_count + NEW.after_like_count;
  v_milestone  INTEGER;
  v_token      TEXT;
  v_enabled    BOOLEAN;
BEGIN
  SELECT MAX(m) INTO v_milestone
  FROM UNNEST(v_milestones) AS m
  WHERE m <= v_total AND m > NEW.last_notified_like_milestone;

  IF v_milestone IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.last_notified_like_milestone := v_milestone;

  SELECT push_token, activity_notifications_enabled INTO v_token, v_enabled
  FROM user_profiles WHERE id = NEW.author_id;

  IF v_token IS NOT NULL AND v_enabled THEN
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

CREATE OR REPLACE FUNCTION notify_letter_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_token   TEXT;
  v_enabled BOOLEAN;
BEGIN
  SELECT push_token, activity_notifications_enabled INTO v_token, v_enabled
  FROM user_profiles WHERE id = NEW.author_id;

  IF v_token IS NULL OR NOT v_enabled THEN
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
