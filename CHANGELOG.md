# Changelog — Laiškelis

A running log of user-facing and notable technical changes, by release
version. Written as changes land, in the order they land — newest entry on
top. For product/architecture decisions and the reasoning behind them, see
[`decisions.md`](decisions.md); this file is "what shipped when," not "why."

Each entry also carries a short **Play Store release notes** draft in
Lithuanian — the text pasted into Play Console's "What's new" field for
that version — so it doesn't have to be reconstructed at submit time.

---

## 1.0.1 — 2026-07-30

- **Password visibility toggle.** Both password fields on sign-up/sign-in
  and both fields on the reset-password screen now have an eye icon that
  reveals the typed password, so a typo can be caught before submitting
  instead of only after a failed sign-in. New shared
  `components/password-input.tsx`; labels added to
  `lib/i18n/strings/common.ts` (`showPassword`/`hidePassword`, LT + EN).
- **Fixed the "request to talk" greeting box being hidden behind the
  keyboard on Android** on both the pool-letter (`app/receive.tsx`) and
  map-letter (`app/map-letter.tsx`) screens. Both wrapped their content in
  a `KeyboardAvoidingView` with `behavior: undefined` on Android, relying
  on the platform's own `adjustResize` window behavior to make room —
  which isn't reliably picking up the slack now that
  `edgeToEdgeEnabled: true` is set. Switched Android to explicit
  `behavior="height"` (iOS keeps `"padding"`), which resizes the
  container itself regardless of that native behavior.
- **Fixed the envelope pull-out animation for letters with both text and a
  drawing.** The picture sheet used to stay mounted (tucked, but rendered
  on top) for the entire ceremony, so it visually intruded on the written
  sheet's own peek/pull — reading as if one swipe nudged both sheets at
  once. It's now only mounted once the letter's own pull has committed, so
  each sheet gets one clean motion in sequence: first swipe pulls the
  letter out entirely, second swipe pulls the picture out entirely.
  Letters with only text or only a drawing were already single-sheet and
  are unaffected. (`components/envelope-letter.tsx`)
- **Fixed the Android tab bar overlapping the system navigation bar on
  some OEM devices** (reported on an older Huawei/EMUI phone with
  on-screen nav buttons, not gesture nav). Some OEM Android skins
  misreport `insets.bottom` as exactly `0` even though a real nav bar is
  on screen; the tab bar now falls back to a fixed 48px clearance only
  when that exact-zero misreport is detected, leaving every
  correctly-reporting device (gesture nav included, even at a small
  nonzero inset) untouched. (`components/tab-bar.tsx`)
- Quieted a benign `[Reanimated] You can not use setGestureState in
  non-worklet function` console warning that was spamming the dev
  terminal — internal Gesture Handler/Reanimated plumbing from racing
  Tap/Pan gestures in the envelope ceremony, not a bug in app code, and
  not fixable by a dependency bump (already on the newest patch versions
  Expo SDK 54 supports). Dev-only, via `configureReanimatedLogger` in
  `app/_layout.tsx`.
- Added a hosted CSAE (child sexual abuse and exploitation) standards
  page at `docs/csae-standards.html`, published to
  `https://laiskelis.lt/csae-standards.html` and cross-linked from the
  existing privacy/terms/account-deletion pages — required by Google
  Play's App Content policy for apps with user-generated content and
  messaging.
- Version bumped to 1.0.1 (`app.json`, `package.json`).

**Play Store release notes (LT):**
> Galite peržiūrėti įvestą slaptažodį prisijungimo ir registracijos languose.
> Pataisyta laiškelio su piešiniu traukimo iš voko animacija. Pataisytas
> apatinės skirtukų juostos persidengimas su telefono navigacijos juosta
> kai kuriuose Android įrenginiuose.

---

## 0.3.1 and earlier

Not tracked in this file — see `git log` and [`docs/store-release.md`](docs/store-release.md)
for release-prep history up to the first store submission.
