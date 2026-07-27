-- Preset emoji avatars. Deliberately not user photo uploads: the product
-- stays nickname-only for identity (CLAUDE.md "no public profiles beyond
-- nickname"), so this is decoration a user picks from a fixed set, not a
-- new identifying surface. Enforced server-side via CHECK, not just the
-- app's picker UI, per the RLS-over-client-checks convention — keep this
-- list in sync with lib/avatars.ts.

ALTER TABLE user_profiles
  ADD COLUMN avatar_emoji TEXT NOT NULL DEFAULT '🦊';

ALTER TABLE user_profiles
  ADD CONSTRAINT avatar_emoji_allowed CHECK (
    avatar_emoji IN (
      '🦊', '🐱', '🐶', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷',
      '🐸', '🐵', '🐔', '🐧', '🦉', '🦄', '🐝', '🐢', '🐙', '🦋',
      '🌸', '🌵', '🍄', '🌙', '⭐', '☀️', '🍁', '🌊', '🔥', '❄️'
    )
  );
