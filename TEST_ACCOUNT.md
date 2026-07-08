# Shared test account

Not gitignored on purpose — this is a throwaway dev/test project that gets
wiped before real release (per user decision 2026-07-08).

- Email: `aleksandrasabrutis18+letterstest@gmail.com`
- Password: `LettersTest123!`
- Nickname: `testrasytojas`
- User ID: `8b973a5d-1528-42d7-aa11-d342b6e1d334`

Seeded with 4 sample letters via `scripts/seed-test-account.mjs`. Re-running
that script is idempotent for the account/profile (skips creation if they
already exist) but will insert 4 more letters each time it's run.

Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (gitignored) to
confirm the account's email without needing to click the confirmation link.
