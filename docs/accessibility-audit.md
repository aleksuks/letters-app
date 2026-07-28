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

**High-contrast palette — every pair passed, including the borders (3.37:1).**
That is the palette doing its job, and it is why the fixes below are modest:
the escape hatch already exists for users who need more.

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
that at 3.37:1, is the right place for it.

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
