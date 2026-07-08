-- Like milestone notification body now scales with how far the letter has
-- traveled emotionally, instead of the flat "Kažkam jis patiko." for every
-- threshold. Title (with the live count) is unchanged.
CREATE OR REPLACE FUNCTION notify_like_milestones()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  -- TUNING KNOB: milestone ladder. Small steps early (when every heart is
  -- a big deal to a new author), round numbers further out.
  v_milestones INTEGER[] := ARRAY[1,2,3,5,10,15,20,25,30,40,50,75,100,150,200,300,500,750,1000];
  v_total      INTEGER := NEW.like_count + NEW.after_like_count;
  v_milestone  INTEGER;
  v_token      TEXT;
  v_body       TEXT;
BEGIN
  SELECT MAX(m) INTO v_milestone
  FROM UNNEST(v_milestones) AS m
  WHERE m <= v_total AND m > NEW.last_notified_like_milestone;

  IF v_milestone IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.last_notified_like_milestone := v_milestone;

  -- TUNING KNOB: tier boundaries and copy.
  v_body := CASE
    WHEN v_milestone <= 5  THEN 'Gal ir nieko?'
    WHEN v_milestone <= 10 THEN 'Geras!'
    WHEN v_milestone <= 20 THEN 'Čia jau nebe laiškelis, o skelbimas.'
    WHEN v_milestone <= 50 THEN 'PAVARYTA!!!'
    ELSE 'Tikiuosi laikai nenupirkti.'
  END;

  SELECT push_token INTO v_token FROM user_profiles WHERE id = NEW.author_id;
  IF v_token IS NOT NULL THEN
    INSERT INTO notification_outbox (user_id, type, title, body, data, push_token)
    VALUES (
      NEW.author_id,
      'like_milestone',
      'Tavo laiškelis surinko ' || v_milestone || ' ❤',
      v_body,
      jsonb_build_object('type', 'like_milestone', 'letter_id', NEW.id, 'milestone', v_milestone),
      v_token
    );
  END IF;

  RETURN NEW;
END;
$$;
