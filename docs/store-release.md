# Store release checklist

> Written 2026-07-28, resolving the "release identity" fork at the end of
> [`07-27.md`](07-27.md). Plan: **Android first, alone, for about a month**;
> iOS only once there is real usage to show and the $99/year is worth
> spending. Update this file as items land.

## 1. Release identity

| Item | Value | State |
| --- | --- | --- |
| App name | `Laiškelis` | settled |
| Slug | `letters-for-strangers` | settled (internal, EAS-only) |
| EAS project | `aleksuks / 3b4053eb-491d-4bb8-bab3-286f64458751` | settled |
| URL scheme | `laiskelis` | **changed 2026-07-28** (was `microlearningproject`) |
| Android package | `lt.laiskelis.app` | **decided 2026-07-28** (was `dev.aleksuks.lettersforstrangers`) |
| iOS bundle id | `lt.laiskelis.app` | **decided 2026-07-28** (was `dev.aleksuks.lettersforstrangers`) |

### The scheme change has one follow-up outside the repo

`hooks/use-auth.ts` builds the signup confirmation redirect with
`Linking.createURL('auth/callback')`, which now produces
`laiskelis://auth/callback`. **Add that to the Supabase dashboard's
Authentication → URL Configuration → Redirect URLs allowlist** (and remove the
`microlearningproject://` entry) before the next build, or email confirmation
links will bounce. Push-notification taps ride on the same scheme.

### The package/bundle id is settled — and now frozen

Changed from `dev.aleksuks.lettersforstrangers` to `lt.laiskelis.app` on
2026-07-28, while nothing was published and the change was still free.
`dev.aleksuks.*` read as a personal side project in the Play listing's
technical details; `lt.laiskelis.app` matches the name users actually see and
the Lithuanian-market framing.

**This is now permanent.** After the first submit to either store the id
cannot be changed — a different one means a new listing with zero installs.

Practical consequence: the id change makes existing preview builds a different
app to the OS. Installed `preview-apk` builds won't update in place; uninstall
them and install a fresh build.

## 2. Google Play — the long pole

Personal developer accounts must run a **closed test with 12+ real testers
opted in for 14 continuous days** before production access can even be applied
for. Verify the current wording at account creation, but plan for it: the
14-day clock is the only part of the launch that cannot be compressed, so it
should start before anything else is polished.

Treat the 12 testers as the first cohort, not a tax — recruit them as beta
users and let them write the first letters, and the cold-start problem and the
Play requirement are solved by one action.

**The first AAB upload has to be done by hand** in the Play Console (Google
requires a manual first release before the API will accept submissions). Every
upload after that can go through `eas submit`.

### Play Console answers this app needs

- **Data safety**: no phone numbers, no social handles, no advertising id, no
  location. Email is collected for auth only (account recovery) and is never
  shown to other users. Letters and chat messages are user-generated content
  stored on Supabase.
- **Location permission**: none declared, and none used — map letters are
  placed by tapping a map, never by reading device GPS. Say so explicitly; an
  app with a map and no location permission looks like an oversight otherwise.
- **Content rating**: user-generated content + user-to-user communication →
  expect Mature 17+ / PEGI 16-18. Keep it consistent with the in-app 18+ gate.
- **Target audience**: adults only. Do not tick anything that implies a child
  audience — that pulls in Families policy and a whole extra review.
- **Ads**: none. **In-app purchases**: none.
- **Account deletion**: required disclosure — the app has in-app deletion
  (migration 029, Settings → delete account), so link to that plus the
  privacy policy.

## 3. Credentials to gather

- **Play**: developer account ($25 once), then a Google Cloud service account
  with the Play Developer API enabled. Save its JSON key to
  `credentials/play-service-account.json` — that directory is gitignored, and
  `eas.json` points both submit profiles at it.
- **Android signing**: let EAS generate and hold the upload keystore
  (`eas credentials`). Do not commit a `.jks`.
- **Apple** (deferred): $99/year, then Apple ID, App Store Connect app id, and
  team id go into a new `submit.production.ios` block. It is deliberately
  absent from `eas.json` today so nobody builds against half-filled values.

## 4. Build and submit

```bash
# production AAB, version code auto-incremented from EAS (appVersionSource: remote)
npx eas build --profile production --platform android

# first upload: by hand in the Play Console (see above)
# afterwards:
npx eas submit --profile closed-test --platform android   # -> Play "alpha" / closed testing
npx eas submit --profile production  --platform android   # -> production track
```

`production` builds ship on the `production` EAS Update channel, so OTA
updates to store builds go out with `eas update --channel production`.

## 5. App Review notes (English — paste into the review form)

> Laiškelis is a Lithuanian-language app for writing short anonymous letters
> to strangers. Accounts are nickname-only; we never collect real names, phone
> numbers, or social handles.
>
> The app contains user-generated content and one-to-one messaging, so it
> ships with the full set of safeguards required for that category:
>
> - **Automated filtering at submission.** Every letter passes a keyword
>   scoring gate before it is stored; letters over the threshold are rejected
>   and never reach another user. Nicknames are filtered the same way.
> - **In-app reporting.** Every letter, conversation, and individual message
>   has a report control. A report immediately flips the content's status so
>   it stops being distributed or shown, pending review — nothing waits on a
>   moderator before it disappears.
> - **Blocking.** Any user can block another; blocking prevents all future
>   connection requests and messages in both directions.
> - **A single manual review queue**, checked daily by the developer. We
>   commit to acting on reports within 24 hours.
> - **Public content is moderated before it is public.** Expired letters only
>   appear on the public "Obituary" feed after a manual approval step —
>   expiry alone is never sufficient.
> - **Age gate.** Users must confirm they are 18+ and accept the terms and
>   privacy policy before an account is created.
> - **No location data of any kind.** The app has a map for letters pinned to
>   places, but locations are chosen by tapping the map. The app requests no
>   location permission and reads no device GPS.
> - **Account and data deletion** are available in-app under Settings.
>
> Terms: https://aleksuks.github.io/letters-app/terms.html
> Privacy: https://aleksuks.github.io/letters-app/privacy.html

The safety model is the strongest asset in a review of this category
(App Store guideline 1.2, Play's UGC policy) — state it rather than assume the
reviewer will find it.

**A reviewer demo account is still needed.** The current shared test account
in `TEST_ACCOUNT.md` gets wiped before release, so create a fresh one with a
rotated password specifically for review, and seed it with enough letters that
a reviewer opening the app sees a working feed rather than an empty state.

## 6. Store listing

- Screenshots in Lithuanian, taken on a real device with real content.
  **Map letters are the screenshot feature** — a map of Vilnius with letters
  pinned to real places is visual in a way the random pool is not.
- Launch density matters: 40 letters in one city looks alive, 40 spread across
  Lithuania looks abandoned. Seed and recruit city-first.
- Feature graphic, short description, full description — all Lithuanian.

## 7. Still blocking release

- [x] ~~Decide the package/bundle id~~ — `lt.laiskelis.app`, 2026-07-28 (§1).
- [ ] Add `laiskelis://auth/callback` to the Supabase redirect allowlist (§1).
- [ ] Wipe test data and rotate the password committed in `TEST_ACCOUNT.md`;
      remove the seeded test letters.
- [ ] Write real founder seed letters (cold-start content).
- [ ] Create the reviewer demo account (§5).
- [ ] Moderation checklist doc — what gets rejected from the public Obituary
      even when well-liked (identifying info, distress content, harassment,
      spam). `product-flow.md` §8 asks for it explicitly.
- [ ] Recruit 12 closed testers and start the 14-day clock.

Done: production/submit profiles in `eas.json`, scheme renamed off the old
project, leftover microphone permissions dropped, pg_cron verified running in
production (all four jobs active, zero failures over 7 days as of 2026-07-28).
