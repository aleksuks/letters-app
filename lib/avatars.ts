// Preset avatar emoji. Deliberately not user photos — see CLAUDE.md's "no
// public profiles beyond nickname" non-goal. Picking one is customization,
// not identity; nothing here is unique or traceable to a real person.
// Keep this list in sync with the CHECK constraint in migration 036.
export const AVATAR_EMOJIS = [
  "🦊", "🐱", "🐶", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷",
  "🐸", "🐵", "🐔", "🐧", "🦉", "🦄", "🐝", "🐢", "🐙", "🦋",
  "🌸", "🌵", "🍄", "🌙", "⭐", "☀️", "🍁", "🌊", "🔥", "❄️",
] as const;

export const DEFAULT_AVATAR_EMOJI: string = AVATAR_EMOJIS[0];

export function randomAvatarEmoji(): string {
  return AVATAR_EMOJIS[Math.floor(Math.random() * AVATAR_EMOJIS.length)];
}
