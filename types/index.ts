import type { Drawing } from '@/lib/drawing';

export type LetterStatus = 'active' | 'expired' | 'removed_reported';
export type ConnectionStatus = 'pending' | 'accepted' | 'declined';
export type ConversationStatus = 'active' | 'left_by_a' | 'left_by_b' | 'blocked';
export type ReportTargetType = 'letter' | 'conversation' | 'message' | 'map_letter';
export type ReportStatus = 'open' | 'reviewed_ok' | 'reviewed_removed';

export interface UserProfile {
  id: string;
  nickname: string;
  avatar_emoji: string;
  age_confirmed: boolean;
  accepts_requests: boolean;
  is_moderator: boolean;
  muted_until: string | null;
  banned_at: string | null;
  created_at: string;
  push_token: string | null;
  last_active_at: string;
  last_reminder_sent_at: string | null;
  reminders_enabled: boolean;
  activity_notifications_enabled: boolean;
}

export interface Letter {
  id: string;
  author_id: string;
  body: string;
  /** Crayon strokes, or null for a text-only letter (migration 038). */
  drawing: Drawing | null;
  created_at: string;
  expires_at: string;
  status: LetterStatus;
  like_count: number;
  after_like_count: number;
  total_like_count: number;
  travel_count: number;
  dislike_count: number;
  last_delivered_at: string | null;
  died_at: string | null;
  approved_for_obituary: boolean;
  last_notified_like_milestone: number;
}

export interface LetterWithNickname extends Letter {
  author_nickname: string;
}

export interface LetterRecipient {
  id: string;
  letter_id: string;
  user_id: string;
  seen_at: string | null;
  opened_at: string | null;
  released_at: string | null;
  liked: boolean;
  disliked: boolean;
}

export interface MapLetter {
  id: string;
  author_id: string;
  body: string;
  /** Crayon strokes, or null for a text-only letter (migration 038). */
  drawing: Drawing | null;
  lat: number;
  lng: number;
  created_at: string;
  expires_at: string;
  status: LetterStatus;
  like_count: number;
}

export interface MapLetterWithNickname extends MapLetter {
  author_nickname: string;
  author_accepts_requests: boolean;
}

export interface ConnectionRequest {
  id: string;
  // Exactly one of letter_id / map_letter_id is set (see migration 031).
  letter_id: string | null;
  map_letter_id: string | null;
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
  user_a_last_read_at: string;
  user_b_last_read_at: string;
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
