-- Letters for Strangers — initial schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE letter_status        AS ENUM ('active', 'expired', 'removed_reported');
CREATE TYPE connection_status    AS ENUM ('pending', 'accepted', 'declined');
CREATE TYPE conversation_status  AS ENUM ('active', 'left_by_a', 'left_by_b', 'blocked');
CREATE TYPE report_target_type   AS ENUM ('letter', 'conversation', 'message');
CREATE TYPE report_status        AS ENUM ('open', 'reviewed_ok', 'reviewed_removed');

-- ============================================================
-- USER PROFILES
-- ============================================================

CREATE TABLE user_profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname      TEXT NOT NULL UNIQUE,
  age_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- LETTERS
-- author_id → user_profiles so PostgREST can join nickname.
-- ============================================================

CREATE TABLE letters (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id             UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  body                  TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at            TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  status                letter_status NOT NULL DEFAULT 'active',
  like_count            INTEGER NOT NULL DEFAULT 0,
  travel_count          INTEGER NOT NULL DEFAULT 0,
  max_travels           INTEGER NOT NULL DEFAULT 15,
  approved_for_obituary BOOLEAN NOT NULL DEFAULT FALSE
);

-- ============================================================
-- LETTER RECIPIENTS
-- ============================================================

CREATE TABLE letter_recipients (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  letter_id UUID NOT NULL REFERENCES letters(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seen_at   TIMESTAMPTZ,
  liked     BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (letter_id, user_id)
);

-- ============================================================
-- CONNECTION REQUESTS
-- Both party columns → user_profiles so PostgREST can join
-- nicknames. Named constraints allow unambiguous embedding hints.
-- ============================================================

CREATE TABLE connection_requests (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  letter_id    UUID NOT NULL REFERENCES letters(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  author_id    UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  greeting     TEXT NOT NULL,
  status       connection_status NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (letter_id, requester_id)
);

-- ============================================================
-- CONVERSATIONS
-- ============================================================

CREATE TABLE conversations (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  connection_request_id UUID NOT NULL REFERENCES connection_requests(id) ON DELETE CASCADE UNIQUE,
  user_a_id             UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  user_b_id             UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  status                conversation_status NOT NULL DEFAULT 'active',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MESSAGES
-- ============================================================

CREATE TABLE messages (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id    UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id          UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  body               TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_for_sender BOOLEAN NOT NULL DEFAULT FALSE
);

-- ============================================================
-- REPORTS
-- ============================================================

CREATE TABLE reports (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_type report_target_type NOT NULL,
  target_id   UUID NOT NULL,
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  status      report_status NOT NULL DEFAULT 'open',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_letters_author              ON letters(author_id);
CREATE INDEX idx_letters_status              ON letters(status);
CREATE INDEX idx_letters_expires_at          ON letters(expires_at);
CREATE INDEX idx_letters_obituary            ON letters(approved_for_obituary) WHERE approved_for_obituary = TRUE;
CREATE INDEX idx_letter_recipients_letter    ON letter_recipients(letter_id);
CREATE INDEX idx_letter_recipients_user      ON letter_recipients(user_id);
CREATE INDEX idx_conn_requests_author        ON connection_requests(author_id);
CREATE INDEX idx_conn_requests_requester     ON connection_requests(requester_id);
CREATE INDEX idx_conn_requests_status        ON connection_requests(status);
CREATE INDEX idx_conversations_user_a        ON conversations(user_a_id);
CREATE INDEX idx_conversations_user_b        ON conversations(user_b_id);
CREATE INDEX idx_messages_conversation       ON messages(conversation_id);
CREATE INDEX idx_messages_created_at         ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_reports_status              ON reports(status);
CREATE INDEX idx_reports_target              ON reports(target_type, target_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE user_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE letters              ENABLE ROW LEVEL SECURITY;
ALTER TABLE letter_recipients    ENABLE ROW LEVEL SECURITY;
ALTER TABLE connection_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports              ENABLE ROW LEVEL SECURITY;

-- user_profiles
CREATE POLICY "user_profiles_own"
  ON user_profiles FOR ALL USING (auth.uid() = id);

CREATE POLICY "user_profiles_read_nickname"
  ON user_profiles FOR SELECT USING (auth.uid() IS NOT NULL);

-- letters
CREATE POLICY "letters_own"
  ON letters FOR ALL USING (auth.uid() = author_id);

CREATE POLICY "letters_receive_eligible"
  ON letters FOR SELECT USING (
    status = 'active'
    AND expires_at > NOW()
    AND author_id != auth.uid()
    AND travel_count < max_travels
    AND NOT EXISTS (
      SELECT 1 FROM letter_recipients lr
      WHERE lr.letter_id = id AND lr.user_id = auth.uid()
    )
  );

CREATE POLICY "letters_obituary_public"
  ON letters FOR SELECT USING (
    status = 'expired' AND approved_for_obituary = TRUE
  );

-- letter_recipients
CREATE POLICY "letter_recipients_own"
  ON letter_recipients FOR ALL USING (auth.uid() = user_id);

-- connection_requests
CREATE POLICY "connection_requests_parties"
  ON connection_requests FOR ALL
  USING (auth.uid() = requester_id OR auth.uid() = author_id);

-- conversations
CREATE POLICY "conversations_participants"
  ON conversations FOR ALL
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

-- messages
CREATE POLICY "messages_participants"
  ON messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
        AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
    )
  );

-- reports
CREATE POLICY "reports_insert"
  ON reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "reports_own_select"
  ON reports FOR SELECT USING (auth.uid() = reporter_id);

-- ============================================================
-- REALTIME
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Like a letter atomically. SECURITY DEFINER bypasses RLS so
-- recipients can increment counts they don't own directly.
CREATE OR REPLACE FUNCTION like_letter(p_letter_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM letter_recipients
    WHERE letter_id = p_letter_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_a_recipient';
  END IF;

  IF EXISTS (
    SELECT 1 FROM letter_recipients
    WHERE letter_id = p_letter_id AND user_id = auth.uid() AND liked = TRUE
  ) THEN
    RETURN; -- idempotent
  END IF;

  UPDATE letter_recipients
  SET liked = TRUE
  WHERE letter_id = p_letter_id AND user_id = auth.uid();

  UPDATE letters
  SET like_count   = like_count + 1,
      travel_count = travel_count + 1
  WHERE id = p_letter_id
    AND status = 'active'
    AND expires_at > NOW();
END;
$$;

-- Accept a connection request and create the conversation.
-- Returns the new conversation ID so the caller can navigate directly.
CREATE OR REPLACE FUNCTION accept_connection_request(p_request_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_req   connection_requests%ROWTYPE;
  v_conv_id UUID;
BEGIN
  SELECT * INTO v_req FROM connection_requests WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF v_req.author_id != auth.uid() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_req.status != 'pending' THEN
    RAISE EXCEPTION 'not_pending';
  END IF;

  UPDATE connection_requests SET status = 'accepted' WHERE id = p_request_id;

  INSERT INTO conversations (connection_request_id, user_a_id, user_b_id)
  VALUES (p_request_id, v_req.author_id, v_req.requester_id)
  RETURNING id INTO v_conv_id;

  RETURN v_conv_id;
END;
$$;
