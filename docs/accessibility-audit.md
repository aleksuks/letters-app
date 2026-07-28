# Accessibility audit — 2026-07-28

> Covers `ux-plan.md` Phase 5's remaining items: the contrast audit and the
> screen-reader pass. Infrastructure (reduced-motion override, high-contrast
> palette, large touch targets, the Accessibility settings screen) already
> existed; this is the audit of what shipped on top of it.

## 1. Contrast

### There is one palette, not two

`remaining-steps.md` said "contrast audit in both themes". There are no two
themes: `contexts/theme.tsx` defines a single warm-paper palette plus a
high-contrast variant of it. `app.json` still sets
`userInterfaceStyle: "automatic"`, which only affects native chrome (alerts,
keyboards, status bar), not the app's own surfaces — worth revisiting if
system dark mode ever looks wrong against the paper, but not a contrast bug.

So the audit is two palettes, and each foreground was measured against **every
surface it actually appears on** — `bg`, `surface` and `surfaceAlt` are close
in luminance but not identical, and `subtext` failed differently on each.

### Results

Method: WCAG 2.1 relative luminance. Body text needs 4.5:1, large text and
non-text UI components need 3:1.

**Default palette — before**

| Pair | Ratio | Needs | |
| --- | --- | --- | --- |
| body text on page bg / card / paper | 11.10 / 13.21 / 14.42 | 4.5 | pass |
| accent link on page bg / card | 6.28 / 7.47 | 4.5 | pass |
| primary button label | 8.71 | 4.5 | pass |
| destructive text on card | 7.47 | 4.5 | pass |
| active tab on tab bar | 7.47 | 3.0 | pass |
| **subtext on page bg** | **2.83** | 4.5 | **fail** |
| **subtext on card** | **3.37** | 4.5 | **fail** |
| **subtext on letter paper** | **3.68** | 4.5 | **fail** |
| **inactive tab on tab bar** | **2.25** | 3.0 | **fail** |
| **switch track (off) on card** | **1.38** | 3.0 | **fail** |
| border on card | 1.38 | 3.0 | see below |
| tab bar border | 1.13 | 3.0 | see below |

**High-contrast palette — every pair passed**, including the borders
(3.37:1). That is the palette doing its job, and it is why the default-palette
fixes below are modest: the escape hatch already exists for users who need
more. It was then pushed further — see §1.3.

### What changed, and what deliberately did not

Three colours moved, each darkened **along lightness only** — same hue, same
saturation — so the warm cast that is the product's whole visual identity is
unchanged:

| Token | Before | After | Worst ratio after |
| --- | --- | --- | --- |
| `subtext` | `#8A7F6F` | `#665D51` | 4.66:1 on `bg` |
| `tabInactive` | `#A89F8F` | `#726959` | 4.64:1 on tab bar |
| `switchTrackOff` | `#ccc` | `#8A7F6F` | 3.37:1 on card |

Reasoning:

- **`subtext` was the real bug.** It is not decorative — it carries
  timestamps, heart and travel counts, letter status, and most of the app's
  metadata. At 2.83:1 on the page background that is body text failing by a
  wide margin. It was darkened to the *lightest* value that clears 4.5:1 on
  the worst of the three surfaces, so the change is the minimum that passes
  rather than a redesign.
- **`tabInactive`**: an unselected tab is not a disabled control. It is a live
  navigation target with a small text label, so it gets the 4.5:1 bar, not
  the 3:1 one.
- **`switchTrackOff`** encodes a control's state, so it needs 3:1. It was also
  `#ccc` — a cold grey in a warm palette, inherited rather than chosen.
  Reusing the retired `subtext` tone fixes both problems with a colour already
  in the system.

**`border` and `tabBarBorder` were left alone** at 1.38:1 and 1.13:1. WCAG
1.4.11 requires 3:1 only where a visual boundary is *needed to identify* a
control. These are decorative rules between paper surfaces; every control
near them is identifiable by its own label and contrast. Raising them turns
the paper into a wireframe — and the high-contrast palette, which does exactly
that, is the right place for it.

### 1.3 High contrast: white paper, not bone

The high-contrast palette originally kept the warm background and only
darkened the foregrounds. That left the mode capped by the thing limiting it
in the first place: `bg` at `#E3DAC9` is the darkest surface anything is ever
drawn on, so every foreground had to clear its bar against bone rather than
against the near-white card and letter surfaces.

All three surfaces now go to `#FFFFFF` when the toggle is on. The effect is
palette-wide rather than pair-by-pair — the *worst* pair in the whole mode
improves from 7.27:1 to 10.09:1, and body text lands at 18.62:1:

| Pair | Was (bone) | Now (white) |
| --- | --- | --- |
| body text on page | 13.42:1 | **18.62:1** |
| subtext on page | 7.27:1 | **10.09:1** |
| accent link on page | 8.72:1 | **12.10:1** |
| inactive tab | 8.65:1 | **10.09:1** |
| border on card | 3.37:1 | **5.99:1** |

Two consequences worth naming:

- **The warm paper is the product's identity, and this mode gives it up.**
  That is the right trade in one direction only: someone who has switched high
  contrast on has said, explicitly, that they would rather read the text. The
  default palette is untouched, so nobody gets this unless they ask.
- **Cards lost their tonal separation.** With page, card and letter paper all
  the same white, `border` is the only thing describing where a card ends, so
  it was darkened to `#6B6255` — well past the 3:1 minimum, because in the one
  mode whose entire purpose is legibility a card edge should not be a hairline
  you have to hunt for.

  That turned out not to be enough. Most surfaces in the app never drew a
  border at all — a card was legible because it was a *lighter* rectangle on a
  bone page, which is exactly the cue white-on-white removes. On real screens
  letters and buttons simply had no edges. High contrast therefore now draws
  them explicitly: two tokens, `outline` (black) and `outlineWidth` (2), with
  `outlineWidth: 0` in the default palette so the same code is a no-op there
  and nothing changes for users who never turned the setting on.

  Consumers go through `outlineOnly(colors)` or
  `outlineOver(colors, base)` rather than branching on the mode themselves —
  the second is for surfaces that already draw a hairline, so high contrast
  thickens and blackens the existing ring instead of stacking a second one
  outside it. 23 surfaces across 15 files: every letter card and letter
  sheet (including both sheets inside the envelope ceremony), every primary
  and secondary button, the map FAB, the chat send button, and the text
  inputs.

`switchTrackOff` deliberately did *not* follow the border darker. It stays at
`#8A7F6F` (3.93:1, clear of the 3:1 non-text bar): the "on" state is `accent`,
a dark red, and a dark warm-grey "off" track would read as another dark pill,
leaving the two states to be told apart by hue alone.

## 2. Screen readers

### Findings

A scan of every `TouchableOpacity` / `Pressable` in `app/` and `components/`
found 94 touchables, of which 71 had no `accessibilityLabel`. That number
alone overstates the problem — React Native synthesises a label from a child
`<Text>`, so a button reading "Išsiųsti" already announces correctly. Split by
what the control actually contains:

| | Count | Real problem? |
| --- | --- | --- |
| Icon-only (no text child) | **21** | **Yes** — announces nothing, or the raw glyph |
| Invisible scrim / no child | 3 | Yes — 2 real, 1 in dead code |
| Has a text child | 47 | No — label is synthesised |

The 21 icon-only ones were the whole story, and they were the *navigation*:
every back chevron, every close X, the chat overflow menu, the send button,
the report flag, the delete-letter trash, the avatar edit. A blind user could
open a letter and not find the way out of it.

### What was done

All 21 icon-only controls and both live scrims now carry
`accessibilityRole="button"` and a Lithuanian `accessibilityLabel`. The two
destructive/consequential ones also carry an `accessibilityHint` that states
the consequence before it happens — the report flag now announces that the
letter is pulled from circulation immediately pending review, which is
exactly the "what will happen" legibility the trust phase asks for elsewhere.

The 47 text-bearing touchables were left as they are. Adding
`accessibilityRole="button"` to each would be a genuine (small) improvement,
but it is 47 mechanical edits for a marginal gain against a real risk of
typos in flows that are already correct — worth doing when those files are
next touched for other reasons, not as a sweep.

### The map is still opaque, and that is a product question

The MapLibre canvas inside the WebView is a single surface: nothing in it is
an accessibility element, so a screen reader lands on an unnamed blank view
and the screen reads as empty. It now at least announces itself as the map of
Lithuania and points at the place search, which is a real control that can
move it.

That is a mitigation, not a fix. A genuine non-visual path would be a list of
map letters by place — **and that is a product decision, not an accessibility
one**, because it adds a browsable feed of map letters that the product
deliberately does not have ("the map itself is the public surface"). It would
also be the only way to read map letters without exploring, which changes the
feel of the feature for everyone, not just screen-reader users. Flagged for a
decision rather than built.

## 2.5 "Bigger buttons" did almost nothing

The `largeTouchTargets` setting only ever applied `hitSlop` plus a handful of
per-screen `*Large` styles that nudged `paddingVertical` from 8 to 14. `hitSlop`
grows the *invisible* touch area, so the setting read as broken: you turned it
on and every button looked identical. Worse, the two biggest buttons in the
app — "Parašyti laiškelį" and "Gauti laiškelį" on the letters tab — had no
large variant at all, so the most likely place to test the setting was the one
place guaranteed to show nothing.

Someone who needs a larger target usually needs to *see* it as well as hit it,
and an unchanged button says "this did nothing" whatever the touch handler now
accepts. The per-screen variants are replaced by shared constants in
`contexts/accessibility.tsx`:

- `LARGE_BUTTON` — `minHeight: 56`, and wider horizontal padding. A floor
  rather than a padding bump, because `+6pt` on a compact button and on a roomy
  one produce visibly different results while a floor produces the same one.
  The old values had drifted to 14pt on one screen and 17pt on another for no
  reason anyone could reconstruct.
- `LARGE_BUTTON_TEXT` — bumps the label to 18pt. Growing the target without
  growing the text strands a small word in a big rectangle, which reads as a
  layout bug rather than an accommodation.
- `LARGE_ICON_BUTTON` — a square floor for icon-only buttons, which have no
  label to grow with them.

Applied at 28 call sites. The chat send button is a circle, so it grows by
diameter (42 → 56) rather than padding.

## 3. Not covered

- **No device pass.** Nothing here was verified with VoiceOver or TalkBack
  actually running; it is a static audit of labels and computed contrast
  ratios. A real pass over write → receive → connect is still worth doing on
  hardware, and is the only way to catch focus-order problems, which this
  method cannot see at all.
- **Dynamic Type / font scaling** was not audited. The envelope ceremony and
  the letter paper use fixed sizes in a fixed-height layout, which is where
  large system font sizes usually break first.
- **The drawing canvas** has no non-visual equivalent and probably cannot
  have one. A crayon scribble is not describable; the letter's text carries
  the meaning, and a drawing-only letter is genuinely inaccessible. Worth
  stating plainly rather than pretending otherwise.
- **The map WebView's own contents** are outside this palette entirely — the
  mini-letter cards are styled inside `lib/map-html.ts`, so the high-contrast
  toggle does not reach them. The map stays warm-paper even in high contrast.

## 4. Housekeeping done alongside

Thirteen files from the previous project's Expo template were still in the
tree and referenced by nothing: `themed-text`, `themed-view`, `collapsible`,
`icon-symbol` (+ `.ios`), `parallax-scroll-view`, `hello-wave`,
`external-link`, `haptic-tab`, the stock `constants/theme.ts`, and the
`use-theme-color` / `use-color-scheme` hooks that only served them. They were
a closed loop — importing each other and nothing else — which is why the
screen-reader scan kept reporting an unlabelled control in `collapsible.tsx`
that no user could ever reach. Removed, along with the three dependencies they
solely owned (`expo-symbols`, `expo-web-browser`, `expo-image`) and the
now-dead `expo-web-browser` config plugin.
