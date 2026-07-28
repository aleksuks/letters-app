# Store release checklist

> Written 2026-07-28, resolving the "release identity" fork at the end of
> [`07-27.md`](07-27.md). Update this file as items land.
>
> **Revised 2026-07-28: both stores are in scope.** `07-27.md` argued for
> Android-only for a month, with iOS deferred until the $99 was justified by
> real usage. That is no longer the plan — the App Store is a requirement, so
> the $99 is a cost of launching, not a decision to make later.
>
> The ordering argument survives the change of scope, though, and it is worth
> keeping straight: **Android still goes first, but only because its clock is
> longer**, not because iOS is optional. Play's closed test needs 12 testers
> for 14 continuous days before you may even apply for production; Apple's
> review is measured in days. So the Play clock starts first and Apple work
> happens beside it, rather than after it.

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

## 3. Apple App Store — the harder review

Apple is faster than Play (days, not a fortnight) but scrutinises this app's
category far harder. An anonymous social app with user-generated content and
stranger-to-stranger messaging sits squarely in **guideline 1.2 (User
Generated Content)**, which is where most solo apps get rejected — almost
always for lacking safeguards this app already has. §6's review notes exist to
put them in front of the reviewer rather than hoping they're found.

Windows is the dev machine, so **every iOS build must go through EAS cloud** —
there is no local escape hatch, and no way to reproduce a build failure
offline. Budget for slower iteration on iOS than on Android.

### Config decisions already made for Apple

- **`supportsTablet: false`** (changed 2026-07-28, was `true`). Declaring iPad
  support obliges you to supply iPad screenshots *and* invites the reviewer to
  test on iPad — where the map WebView, the envelope ceremony, and the drawing
  canvas have never been opened, let alone laid out. This is a phone-shaped
  product for a phone-shaped audience; claiming iPad support buys a rejection
  risk in exchange for nothing. iPhone apps still run on iPad in compatibility
  mode, so nobody is locked out. Reversible if iPad ever earns the layout work.
- **`ios.config.usesNonExemptEncryption: false`**. The app uses only HTTPS,
  which is exempt. Without this, App Store Connect asks the export-compliance
  question on *every single build* before it can be tested or submitted.

### What Apple will ask for that Play does not

- **App Privacy "nutrition labels"** — declared in App Store Connect, and
  they must match reality or the app gets pulled later. Answers here: *Contact
  Info → Email Address*, collected, **linked to identity**, used for **App
  Functionality only** (auth and recovery), **not** used for tracking. *User
  Content → Other User Content* (letters, messages, drawings), linked, App
  Functionality. Nothing else: no identifiers, no usage data, no diagnostics,
  no location, no contacts. **Tracking: none** — so no
  `NSUserTrackingUsageDescription` and no ATT prompt.
- **An EULA.** Apple's standard licence agreement is the default and is
  sufficient; if you instead point at the hosted terms, the link must be in the
  App Store Connect metadata *and* reachable in-app (it is — onboarding and
  Settings both link to it).
- **Age rating 18+** via the App Store Connect questionnaire. Answer honestly
  on "Unrestricted Web Access" (no — the WebView renders a fixed local map
  document, not arbitrary URLs) and on user-generated content and messaging
  (yes to both, with moderation). Keep it consistent with the in-app 18+ gate,
  which Apple checks against the rating.
- **Account deletion inside the app** (guideline 5.1.1(v)) — required for any
  app that creates accounts, and a common rejection. Already implemented
  (migration 029, Settings → delete account). Point the reviewer at the exact
  path in the notes so it isn't hunted for.
- **Sign in with Apple** is *not* required here: it only triggers when an app
  offers third-party or social login. Email + password only means the
  requirement never applies. Worth knowing so it isn't added defensively.
- **Push notification permission** must be requested in context, not on
  launch. Verify the app asks after the user has a reason to say yes.

### TestFlight

External TestFlight testing needs its own (light) Apple review, but internal
testing does not — so builds can be handed to a handful of people immediately.
Unlike Play there is **no minimum tester count and no 14-day clock**, so
TestFlight is a convenience here, not a gate. Use it to catch iOS-specific
breakage in the WebView map and the SVG drawing canvas, which are the two
places where iOS and Android genuinely diverge.

## 4. Credentials to gather

- **Play**: developer account ($25 once), then a Google Cloud service account
  with the Play Developer API enabled. Save its JSON key to
  `credentials/play-service-account.json` — that directory is gitignored, and
  `eas.json` points both submit profiles at it.
- **Android signing**: let EAS generate and hold the upload keystore
  (`eas credentials`). Do not commit a `.jks`.
- **Apple**: Apple Developer Program ($99/year), then create the app record in
  App Store Connect. Three values are then needed, and only then, because they
  don't exist until the app record does:

  | Value | Where it comes from |
  | --- | --- |
  | `appleId` | the Apple ID email on the developer account |
  | `ascAppId` | App Store Connect → the app → App Information → Apple ID (a number) |
  | `appleTeamId` | developer.apple.com → Membership |

  They go into `eas.json` as a new submit block:

  ```json
  "production": {
    "ios": {
      "appleId": "...",
      "ascAppId": "...",
      "appleTeamId": "..."
    },
    "android": { "...": "unchanged" }
  }
  ```

  It is deliberately absent today rather than stubbed — `eas submit` fails
  more usefully on a missing block than on a plausible-looking wrong value.
- **iOS signing and push**: let EAS generate and hold the distribution
  certificate, provisioning profile, and the APNs key (`eas credentials`).
  expo-notifications needs the APNs key for production push to work at all —
  a build that pushes fine in development and silently doesn't in TestFlight
  is almost always this.

## 5. Build and submit

```bash
# Android: production AAB, version code auto-incremented from EAS
# (appVersionSource: remote, so the counter lives server-side)
npx eas build --profile production --platform android

# first Android upload: by hand in the Play Console (see §2)
# afterwards:
npx eas submit --profile closed-test --platform android   # -> Play "alpha" / closed testing
npx eas submit --profile production  --platform android   # -> production track

# iOS: cloud build, then straight to App Store Connect / TestFlight
npx eas build  --profile production --platform ios
npx eas submit --profile production --platform ios        # needs the ios block from §4

# both at once, once the iOS submit block exists
npx eas build --profile production --platform all
```

`production` builds ship on the `production` EAS Update channel, so OTA
updates to store builds go out with `eas update --channel production`.

One caveat on OTA updates now that both stores are live: an update pushed to
the `production` channel reaches **both** platforms at once. Anything that
touches the WebView map or the SVG drawing canvas — the two places where the
platforms genuinely diverge — should be tested on both before it goes out, not
just on whichever device is nearest.

## 6. App Review notes (English — paste into the review form)

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
> - **Account and data deletion** are available in-app under Settings →
>   "Ištrinti paskyrą". Deleting removes the account and its content; nothing
>   is retained for re-activation.
> - **The app is Lithuanian-language.** The core loop, for a reviewer who does
>   not read Lithuanian: the **Laiškeliai** tab has "Parašyti laiškelį"
>   (write a letter) and "Gauti laiškelį" (receive a stranger's letter). On a
>   received letter, "Atsiliepti" requests a private chat with its author.
>   **Žemėlapis** is the map of letters pinned to places, **Kapinės** is the
>   public feed of expired, moderator-approved letters, and **Pokalbiai** is
>   the chat list. Reporting is available on any letter, conversation, or
>   message.
>
> Terms: https://aleksuks.github.io/letters-app/terms.html
> Privacy: https://aleksuks.github.io/letters-app/privacy.html

The safety model is the strongest asset in a review of this category
(App Store guideline 1.2, Play's UGC policy) — state it rather than assume the
reviewer will find it.

The last two bullets are there for Apple specifically: 5.1.1(v) account
deletion is a frequent rejection, and a reviewer who cannot read Lithuanian
and cannot find the core loop will reject on 2.1 (Performance: App
Completeness) rather than ask.

**A reviewer demo account is still needed.** The current shared test account
in `TEST_ACCOUNT.md` gets wiped before release, so create a fresh one with a
rotated password specifically for review, and seed it with enough letters that
a reviewer opening the app sees a working feed rather than an empty state.

## 7. Store listing

- Screenshots in Lithuanian, taken on a real device with real content.
  **Map letters are the screenshot feature** — a map of Vilnius with letters
  pinned to real places is visual in a way the random pool is not.
- Launch density matters: 40 letters in one city looks alive, 40 spread across
  Lithuania looks abandoned. Seed and recruit city-first.
- Play needs a feature graphic, short description, and full description — all
  Lithuanian. Apple needs a subtitle, promotional text, keywords, and a
  support URL (the GitHub Pages site already serves terms and privacy; a
  support page can live beside them).
- **Screenshot sizes differ per store and Apple is stricter.** With
  `supportsTablet: false` only iPhone sizes are required — one 6.9" set
  (the current required size) covers modern devices. No iPad set is needed,
  which is most of the point of §3's tablet decision.

## 8. Still blocking release

**Mine to finish in the repo:**

- [x] ~~Moderation checklist doc~~ — `moderation-checklist.md`, 2026-07-28.
- [x] ~~Accessibility passes~~ — `accessibility-audit.md`, 2026-07-28.
      Contrast fixed in the default palette, all 21 icon-only controls
      labelled. A device pass with VoiceOver/TalkBack is still open.

**Yours, outside the repo:**

- [ ] **Populate the `moderation_keywords` table — currently empty.** The
      review notes in §6 tell both Apple and Google that "every letter passes
      a keyword scoring gate"; with zero terms that gate scores everything 0
      and rejects nothing, so the claim is false as it stands. Founder-managed
      through the Supabase dashboard by design (RLS keeps it unreadable from
      the app so it can't be mined for evasion). Migration 007's header
      carries suggested weights — 1 mild, 3 strong profanity, 5 slurs — and
      the reject threshold is 10, i.e. two slurs. **Do not submit to either
      store before this has terms in it.**

- [x] ~~Decide the package/bundle id~~ — `lt.laiskelis.app`, 2026-07-28 (§1).
- [x] ~~Add `laiskelis://auth/callback` to the Supabase redirect allowlist~~ —
      done 2026-07-28.
- [ ] Google Play developer account ($25), first manual AAB upload, recruit 12
      closed testers, start the 14-day clock. **This is the long pole — it
      cannot be shortened, so start it before anything else here.**
- [ ] Apple Developer Program ($99/yr), create the App Store Connect record,
      then hand over the three values in §4 so the iOS submit block can be
      filled in.
- [ ] Wipe test data and rotate the password committed in `TEST_ACCOUNT.md`;
      remove the seeded test letters. (I can run this — it just needs a
      go-ahead and the right moment, since it costs you the working test
      account.)
- [ ] Write real founder seed letters (cold-start content). Your voice, not
      mine — but I can draft candidates to edit.
- [ ] Create the reviewer demo account (§6), seeded so the app isn't empty on
      first open.

Done: release identity settled (scheme, bundle id), production/submit profiles
in `eas.json`, leftover microphone permissions dropped, iPad support and export
compliance settled for Apple, pg_cron verified running in production (all four
jobs active, zero failures over 7 days as of 2026-07-28) and its dispatch
timeout fixed in migration 039.
