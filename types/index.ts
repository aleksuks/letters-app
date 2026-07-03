export type LetterStatus = 'active' | 'expired' | 'removed_reported';
export type ConnectionStatus = 'pending' | 'accepted' | 'declined';
export type ConversationStatus = 'active' | 'left_by_a' | 'left_by_b' | 'blocked';
export type ReportTargetType = 'letter' | 'conversation' | 'message';
export type ReportStatus = 'open' | 'reviewed_ok' | 'reviewed_removed';

export interface UserProfile {
  id: string;
  nickname: string;
  age_confirmed: boolean;
  accepts_requests: boolean;
  is_moderator: boolean;
  muted_until: string | null;
  banned_at: string | null;
  created_at: string;
}

export interface Letter {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  expires_at: string;
  status: LetterStatus;
  like_count: number;
  travel_count: number;
  recipient_cap: number;
  dislike_count: number;
  last_delivered_at: string | null;
  approved_for_obituary: boolean;
}

export interface LetterWithNickname extends Letter {
  author_nickname: string;
}

export interface LetterRecipient {
  id: string;
  letter_id: string;
  user_id: string;
  seen_at: string | null;
  liked: boolean;
  disliked: boolean;
}

export interface ConnectionRequest {
  id: string;
  letter_id: string;
  requester_id: string;
  author_id: string;
  greeting: string;
  status: ConnectionStatus;
  created_at: string;
}

export interface Conversation {
  id: string;
  connection_request_id: string;
  user_a_id: string;
  user_b_id: string;
  status: ConversationStatus;
  created_at: string;
  reported_at: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  deleted_for_sender: boolean;
}

export interface Report {
  id: string;
  target_type: ReportTargetType;
  target_id: string;
  reporter_id: string;
  reason: string;
  status: ReportStatus;
  created_at: string;
}

export interface BlockedUser {
  id: string;
  blocker_id: string;
  blocked_id: string;
  created_at: string;
}
