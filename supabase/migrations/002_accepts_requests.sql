-- Allow users to opt out of receiving connection requests.

ALTER TABLE user_profiles
  ADD COLUMN accepts_requests BOOLEAN NOT NULL DEFAULT TRUE;

-- Requesters need to read the author's preference before/while inserting;
-- the existing "user_profiles_read_nickname" policy already exposes full-row
-- SELECT to any authenticated user, so no additional read policy is needed.

DROP POLICY IF EXISTS "connection_requests_parties" ON connection_requests;

CREATE POLICY "connection_requests_select_parties"
  ON connection_requests FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = author_id);

CREATE POLICY "connection_requests_insert_open_author"
  ON connection_requests FOR INSERT
  WITH CHECK (
    auth.uid() = requester_id
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = author_id AND accepts_requests = TRUE
    )
  );

CREATE POLICY "connection_requests_update_parties"
  ON connection_requests FOR UPDATE
  USING (auth.uid() = requester_id OR auth.uid() = author_id);

CREATE POLICY "connection_requests_delete_parties"
  ON connection_requests FOR DELETE
  USING (auth.uid() = requester_id OR auth.uid() = author_id);
