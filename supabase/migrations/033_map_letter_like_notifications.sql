-- Map-letter like milestones: the author of a map letter now gets the same
-- quiet milestone push a pool-letter author gets — same ladder, same tiered
-- copy voice, same activity_notifications_enabled toggle, same outbox →
-- Edge Function delivery (the dispatcher is type-agnostic, so no change
-- there). A distinct type ('map_like_milestone') so tapping it can deep-link
-- to the map letter itself rather than the pool-letters tab, and so it can
-- be tuned/silenced independently later.
--
-- Everything else about map letters stays notification-silent: no death
-- notice (they just fade after 30 days) and nothing fires for readers.

ALTER TABLE map_letters
  ADD COLUMN last_notified_like_milestone INTEGER NOT NULL DEFAULT 0;

ALTER TABLE notification_outbox
  DROP CONSTRAINT IF EXISTS notification_outbox_type_check;
ALTER TABLE notification_outbox
  ADD CONSTRAINT notification_outbox_type_check
  CHECK (type IN ('like_milestone', 'letter_died', 'letter_obituary',
                  'reminder', 'map_like_milestone'));

-- Same BEFORE UPDATE pattern as notify_like_milestones() (015/017/030):
-- stamps the high-water mark in the same write that crossed it, so a
-- milestone can never fire twice.
CREATE OR REPLACE FUNCTION notify_map_like_milestones()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  -- TUNING KNOB: same ladder as pool letters; map letters will realistically
  -- only ever climb its low rungs, which is where the small steps live.
  v_milestones INTEGER[] := ARRAY[1,2,3,5,10,15,20,25,30,40,50,75,100,150,200,300,500,750,1000];
  v_milestone  INTEGER;
  v_token      TEXT;
  v_enabled    BOOLEAN;
  v_body       TEXT;
BEGIN
  SELECT MAX(m) INTO v_milestone
  FROM UNNEST(v_milestones) AS m
  WHERE m <= NEW.like_count AND m > NEW.last_notified_like_milestone;

  IF v_milestone IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.last_notified_like_milestone := v_milestone;

  -- TUNING KNOB: tier boundaries and copy — kept in the 017 voice.
  v_body := CASE
    WHEN v_milestone <= 5  THEN 'Kažkas jį rado. Ir jam patiko.'
    WHEN v_milestone <= 10 THEN 'Geras!'
    WHEN v_milestone <= 20 THEN 'Ta vieta jau tavo.'
    WHEN v_milestone <= 50 THEN 'PAVARYTA!!!'
    ELSE 'Tikiuosi laikai nenupirkti.'
  END;

  SELECT push_token, activity_notifications_enabled INTO v_token, v_enabled
  FROM user_profiles WHERE id = NEW.author_id;

  IF v_token IS NOT NULL AND v_enabled THEN
    INSERT INTO notification_outbox (user_id, type, title, body, data, push_token)
    VALUES (
      NEW.author_id,
      'map_like_milestone',
      'Tavo laiškelis žemėlapyje surinko ' || v_milestone || ' ❤',
      v_body,
      jsonb_build_object('type', 'map_like_milestone', 'map_letter_id', NEW.id, 'milestone', v_milestone),
      v_token
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_map_like_milestones
  BEFORE UPDATE ON map_letters
  FOR EACH ROW
  WHEN (NEW.like_count IS DISTINCT FROM OLD.like_count)
  EXECUTE FUNCTION notify_map_like_milestones();
