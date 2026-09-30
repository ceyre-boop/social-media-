# Smiley design system

Source of truth: `src/lib/theme.ts`. Primitives: `src/components/ui/`. Nothing else may define a color, type size, radius, shadow, or duration.

## Principles

1. **Warm, not urgent.** Every time someone opens the app they should feel good, and leave feeling better. No red badges, no counts in navigation, no countdowns, no scarcity, no looping attention-grabbers. The one exception is the live dot, which breathes slowly (1.6s, opacity only).
2. **Delight is earned.** The rainbow (unicorn mane) appears only at moments that deserve it: gifts, likes, celebrations, avatars, the end-of-feed page. Never in chrome (nav, buttons, headers, borders).
3. **Confident, not childish.** Bright and warm, but adult: real type hierarchy, restrained radii, no cartoon chrome. This is not a kids' app (COPPA); the tone is a friend with good taste.
4. **Stop points.** Feeds end. Discover is finite and finishes with a full-page "That's everything for now" so it is unmistakable that you are done. Nothing auto-advances; no infinite refill.
5. **Media is always dark.** Reels and live sit on a fixed dark "stage" palette regardless of the theme, so video looks right in light mode too.

## Color tokens

Read via `useTheme().colors`. Both themes are fully designed; dark is the default.

| Token            | Dark                  | Light                   | Use                                              |
| ---------------- | --------------------- | ----------------------- | ------------------------------------------------ |
| `bg`             | `#0E0B10`             | `#FFF9F6` (warm cream)  | Screen background                                |
| `surface`        | `#17131A`             | `#FFFFFF`               | Cards, inputs, sheets                            |
| `surface2`       | `#211B25`             | `#FBF1F4`               | Secondary buttons, hover, chips                  |
| `surface3`       | `#2C2431`             | `#F5E6EC`               | Pressed secondary, deepest fill                  |
| `border`         | `#342B3A`             | `#EEDFE6`               | Hairlines, card outlines                         |
| `borderStrong`   | `#4A3D52`             | `#DCC6D1`               | Sheet handle, toast outline                      |
| `text`           | `#FBF6F9`             | `#1C1220`               | Primary text                                     |
| `textSecondary`  | `#C9BFCC`             | `#4E4054`               | Supporting text                                  |
| `muted`          | `#978C9C`             | `#6F6175`               | Hints, timestamps, placeholders                  |
| `primary`        | `#FF6FB5`             | `#BA3273` *             | Buttons, links, active states                    |
| `primaryPressed` | `#F0529F`             | `#9E2A62` *             | Pressed / hover primary                          |
| `onPrimary`      | `#24040F`             | `#FFFFFF`               | Text/icons on `primary`                          |
| `primarySubtle`  | `#3A1A2B`             | `#FCE3EF`               | Active nav row, tinted chip                      |
| `focus`          | `#FF9CCB`             | `#8C1240`               | Focus ring, focused input border                 |
| `success`        | `#4CD68A`             | `#177844` *             | Success text/icons                               |
| `warning`        | `#FFC24D`             | `#8F5E18` *             | Warning text/icons                               |
| `danger`         | `#FF6B6B`             | `#BA3C3C` *             | Errors, destructive                              |
| `info`           | `#5CC8FF`             | `#176EA6` *             | Informational                                    |
| `live`           | `#FF4FA3`             | `#BA3273` *             | LIVE tag, live dot, avatar live ring. Never red. |
| `scrim`          | `rgba(8,6,10,0.72)`   | `rgba(28,18,32,0.55)`   | Behind sheets/dialogs                            |
| `overlay`        | `rgba(14,11,16,0.55)` | `rgba(255,249,246,0.7)` | Translucent chip over content                    |

\* Adjusted from the brief to meet WCAG AA, see "Contrast" below.

### Brand and delight (`useTheme().brand`, theme-independent)

`pink #FF6FB5`, `maroon #8C1240`, `sun #FFD93B`, `tangerine #FF8A1F`, `magenta #FF3D9A`, `violet #B45CFF`, `sky #28C2F2`, `lime #5BD245`. `rainbow` is the ordered array of the six mane colors; `tintFor(name)` hashes a name to one. Text on any rainbow color uses `brand.onRainbow` (`#24040F`, 5.4:1 or better on all six).

### Stage (`useTheme().stage`, fixed dark)

Everything drawn over photos, video and live uses `stage.*`: `bg`, `surface`, `text`, `textSecondary`, `primary`, `control` / `controlHover` (round buttons over media), `glass` / `glassActive` (the floating nav pill), `scrimTop` / `scrimBottom`, `warmTop` / `warmBottom` (end-of-feed backdrop), and so on. `<Text tone="onMedia">` reads from it.

### Contrast

Every text/background pair below meets AA (4.5:1) unless noted; UI components (focus ring, borders that carry meaning, icons) meet 3:1.

- Dark: all brief values pass as given (lowest: `muted` on `surface3` 4.66:1).
- Light, adjusted because the brief values failed as text on `bg`/`surface`/`surface2`/`primarySubtle`:
  - `primary` `#D63A84` (4.38:1 with white; 3.6 on `primarySubtle`) to **`#BA3273`** (white 5.54:1; min 4.58 on any surface).
  - `primaryPressed` `#BD2E72` to **`#9E2A62`** (keeps the pressed step visibly darker; white 7.09:1).
  - `success` `#1E9E5A` to **`#177844`**, `warning` `#B7791F` to **`#8F5E18`**, `danger` `#D64545` to **`#BA3C3C`**, `info` `#1B7FBF` to **`#176EA6`**, `live` `#D63A84` to **`#BA3273`** (all were 3.3 to 4.4:1 as text; now 4.55 or better).
  - Hue is preserved; only brightness dropped. Everything else in the light palette passes unchanged.
- Stage: white on `warmTop` 15.4:1, `stage.muted` on black 9.5:1, `stage.onPrimary` on `stage.primary` 7.45:1.

## Typography

Font: **Plus Jakarta Sans** (`@expo-google-fonts/plus-jakarta-sans`), weights 400/500/600/700/800, loaded with `useFonts` in `src/app/_layout.tsx`; the splash is held until it is ready. Web appends a system fallback stack (`fontFamilyFor`). Native custom fonts ignore `fontWeight`, so the weight is chosen by family; that is why screens must use `<Text>` and never `react-native`'s `Text` (ESLint enforces it).

```tsx
<Text variant="title">Screen title</Text>
<Text variant="caption" tone="muted">2 hours ago</Text>
```

| Variant    | Size / line | Weight | Tracking | Use                                                 |
| ---------- | ----------- | ------ | -------- | --------------------------------------------------- |
| `display`  | 34 / 40     | 800    | -0.5     | Hero moments, empty states, onboarding, end-of-feed |
| `title`    | 26 / 32     | 800    | -0.3     | Screen titles (AppBar)                              |
| `headline` | 20 / 26     | 700    | 0        | Section and card titles, author names on reels      |
| `body`     | 16 / 23     | 400    | 0        | Default reading text, captions, form input          |
| `callout`  | 15 / 21     | 600    | 0        | Buttons, field labels, emphasized inline text       |
| `caption`  | 13 / 18     | 500    | 0        | Metadata, hints, timestamps, helper/error text      |
| `micro`    | 11 / 14     | 700    | +0.6     | UPPERCASE: chips, badges, the LIVE tag              |

`tone`: `default`, `secondary`, `muted`, `primary`, `onPrimary`, `danger`, `success`, `warning`, `info`, `onMedia`, `onMediaMuted`. `weight` overrides the variant weight (rare).

## Spacing, radii, elevation

**Spacing** (4-base): `xxs 2`, `xs 4`, `sm 8`, `md 12`, `lg 16`, `xl 20`, `xxl 24`, `xxxl 32`, `huge 40`, `giant 56`. Default screen padding is `lg`; gaps between related controls are `sm` to `md`.

**Radii**: `xs 6` (thumbnails), `sm 10` (small buttons, segments), `md 14` (buttons, inputs, toasts), `lg 20` (cards), `xl 28` (sheets, dialogs), `pill 999` (chips, nav, avatars).

**Elevation** (`useTheme().elevation[0..3]`, spread into `style`): 0 flat, 1 cards, 2 floating nav / banners, 3 toasts, sheets, dialogs. Dark uses deep subtle shadows plus a 1px inset top highlight (web); light uses soft warm-tinted shadows. Web emits `boxShadow`, native emits `shadow*` props (and Android `elevation`).

## Motion

Tokens in `motion` (theme.ts); Reanimated curves in `src/lib/motion.ts`.

- **Durations**: `instant 120`, `quick 200`, `base 320`, `gentle 480`, `celebrate 900+`.
- **Easing**: `standard` cubic-bezier(0.2, 0, 0, 1), `emphasized` (0.3, 0, 0, 1).
- **Springs**: `gentle` {damping 18, stiffness 180, mass 1}; `bouncy` {damping 12, stiffness 200} for delight only.
- **Reduced motion**: `useReducedMotion()` (OS setting). Under it, animations become fades only: no translation, no scale. Sheets fade instead of sliding, toasts fade in place, the like heart appears without a pop, the live dot stops breathing. User-driven drags still work.
- **Rules**: warm, never urgent. Nothing loops except the live dot. No shake, no pulse-to-attract, no countdown, no "hurry" motion. Prefer the slowest duration that still feels responsive.

## Primitives (`src/components/ui`)

Every interactive primitive has hover (web), pressed, disabled and focus-visible states. Focus-visible uses the global `:focus-visible` ring in `src/app/+html.tsx` (2px, `focus` color, 2px offset). Minimum hit target 44px (visual size can be smaller with padding/hitSlop).

| Primitive                   | Variants / props                                                                                            | States and a11y                                                                                                                                                                                                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Text`                      | `variant`, `tone`, `weight`, `align`                                                                        | Renders Plus Jakarta by weight; use `accessibilityRole="header"` on titles                                                                                                                                                                                                                      |
| `Button`                    | `variant` primary / secondary / ghost / danger; `size` sm 36 / md 48 / lg 56; `icon`, `loading`, `disabled` | Hover/pressed swap background; disabled 50%; loading shows a spinner and `busy`; label = title                                                                                                                                                                                                  |
| `IconButton`                | `icon`, `label` (required), `onMedia`, `size`                                                               | 44px target, round; `onMedia` uses stage colors                                                                                                                                                                                                                                                 |
| `Avatar`                    | `size` xs 24 / sm 32 / md 40 / lg 64 / xl 96 (or a number); `uri`; `live`                                   | Initials on a rainbow tint hashed from the username; `live` adds a static ring in `live` color (never animated); decorative when initials                                                                                                                                                       |
| `Card`                      | `elevation` 0..3, `padded`                                                                                  | Surface + 1px border + `lg` radius                                                                                                                                                                                                                                                              |
| `Chip`                      | `tone` neutral / primary, `icon`, `onMedia`                                                                 | Non-interactive status pill, `micro` type                                                                                                                                                                                                                                                       |
| `LiveDot`                   | `size`                                                                                                      | The only looping animation; steady under reduced motion; hidden from screen readers                                                                                                                                                                                                             |
| `TextField`                 | `label`, `hint`, `error`, `counter`                                                                         | Focus: 2px `focus` border; error: `danger` border + live-region message                                                                                                                                                                                                                         |
| `SegmentedControl`          | `segments`, `value`, `onChange`, `label`                                                                    | `radiogroup` semantics; active segment uses `primary`                                                                                                                                                                                                                                           |
| `Skeleton`                  | `width`, `height`, `radius`                                                                                 | Static, no shimmer (calm loading)                                                                                                                                                                                                                                                               |
| `EmptyState`                | `title`, `message`, `actionLabel`, `illustration`, `compact`                                                | Illustration slot defaults to the logo; `display` title (or `title` when `compact`)                                                                                                                                                                                                             |
| `Sheet`                     | `visible`, `onClose`, `title`, `scroll`                                                                     | Phone: bottom sheet, sized to content (max ~90%), drag down (RNGH + Reanimated) or tap backdrop / handle / Escape to dismiss, safe-area and keyboard aware. Width >= 768: centered dialog with a close button. Reduced motion: fades only. Handle is a labelled Close button for screen readers |
| `TabBar` / `TabBarItem`     | `label`, `active`, `emphasized`                                                                             | Floating pill on the stage glass; icons only, labels spoken via `accessibilityLabel`; `emphasized` is the pink Create button; fits 320px; no badges or counts                                                                                                                                   |
| `Toast` (`useToast().show`) | `message`, `tone`, `actionLabel`, `onAction`, `duration`                                                    | Stacked (max 3), auto-dismiss (4.5s default), polite live region, dismiss button, fades in place under reduced motion                                                                                                                                                                           |

## Shell

Five destinations, everywhere: **Home, Discover, Create, Live, You**. Phone: floating pill (icons only). Desktop >= 768: sidebar (icons only at 768-1199, icons + labels from 1200) with Create as the prominent button; the right rail appears at >= 1200. No red, no counts, no badges in navigation.

## Adding a token

1. Add it to `src/lib/theme.ts` only: to `Colors` and both `dark` and `light` for theme colors, or to `stage` / `brand` for fixed ones. Name it by role (`primarySubtle`), not by value (`lightPink`).
2. Check contrast: text tokens need 4.5:1 on every surface they can sit on in both themes (3:1 for UI-only tokens). Record any adjustment here under "Contrast".
3. Add it to the table in this file.
4. Consume it through `useTheme()` (or `stage` / `brand`). Color literals (`#...`, `rgb(...)`, `rgba(...)`) anywhere in `src/` except `src/lib/theme.ts` fail lint (`no-restricted-syntax`). Raw `Text` from `react-native` fails lint (`no-restricted-imports`) outside `src/components/ui/Text.tsx`.

## Reel player

"Performance is the feature." Code: `src/components/reels/player/` and `src/components/reels/ReelsFeed.tsx`.

**Pool.** `PlayerPoolProvider` (one per feed) creates exactly 4 `expo-video` players with `useVideoPlayer(null, …)` and never creates or destroys one per item. Pages borrow a slot by post id (`usePooledPlayer(key)`, a `useSyncExternalStore` subscription with a primitive snapshot, so a settle re-renders only pages whose slot changed). On each settle the feed calls `pool.settle(current, [next, prev])`: slots already holding a wanted reel keep it; missing reels take the least-recently-used free slot and swap source with `player.replaceAsync({ uri })` (no remount). Only the current slot plays; neighbours are loaded and held paused at `currentTime = 0` (decode-ahead); every other slot is paused. Stale loads are dropped by a per-slot token; a failed load frees the slot and the page keeps its poster.

**No black frame.** `ReelVideo` draws the poster (expo-image) underneath and the `VideoView` (`nativeControls={false}`, `cover` for aspect ≤ 0.8, else `contain` over a blurred poster) on top at opacity 0, fading in (`instant`, 120 ms) only after `onFirstFrameRender` (250 ms after load as a fallback for surfaces that never emit it, e.g. a web `<video>` attached to an already-loaded player).

**Anti-trance.** The current reel loops (`player.loop = true`). Nothing ever auto-advances.

**Pause rules.** Tap toggles pause on the current reel (a play glyph fades in). Tab blur (`useFocusEffect`), app background (`AppState`) and a hidden web tab (`visibilitychange`) suspend every player; returning resumes only the current one, unless the user had paused it.

**Mute.** `src/lib/mute.ts` (subscribe/get/set, `useMuted`) persisted under `smiley.muted` with `expo-sqlite/kv-store` on native and `localStorage` on web. First launch is muted. The speaker button on reel pages toggles it; the pool writes `player.muted` directly on every player, with no React render.

**Gestures** (RNGH, `Gesture.Exclusive(longPress, doubleTap, tap)`): tap pauses/resumes, double-tap likes (never unlikes; heart burst), long-press opens the options sheet. The info overlay is `box-none`, so taps on empty areas reach the media.

### Pagers

Both keep the swipe off React state: the live index is a Reanimated shared value; the settled index is committed to JS once per settle (`onMomentumScrollEnd`, plus `onViewableItemsChanged` at 80% visibility for A; web adds a 120 ms scroll-idle commit because it has no momentum events), and only then are slots reassigned. Pages are `React.memo` with stable callbacks.

| Env                                          | Pager                                                                                                                                                                                                                                               |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_REEL_PAGER=flashlist` (default) | **A**: FlashList, `pagingEnabled` + `snapToInterval`. Scroll events run on the JS thread (shared-value write only).                                                                                                                                 |
| `EXPO_PUBLIC_REEL_PAGER=scrollview`          | **B**: Reanimated `Animated.ScrollView`, `pagingEnabled` + `snapToInterval`, `useAnimatedScrollHandler` (scroll handled on the UI thread; `scheduleOnRN` once per settle). Mounts real pages within ±2 of the settled page, placeholders elsewhere. |

### Measuring (on device, Expo Go)

1. `EXPO_PUBLIC_PERF_OVERLAY=1 EXPO_PUBLIC_REEL_PAGER=flashlist bunx expo start`, open Home with the 20 seeded reels (`scripts/seed-reels.ts`).
2. Tap **reset** on the overlay (top right: JS fps from a rAF counter, UI fps from Reanimated `useFrameCallback`, dropped frames per thread = frames over 1.5× the 16.7 ms budget).
3. Swipe through all 20 reels, one snap each, at a steady pace. Note the dropped counts and the lowest fps seen. Also open the React Native perf monitor (shake → Perf Monitor) for a second opinion.
4. Repeat with `EXPO_PUBLIC_REEL_PAGER=scrollview` (restart with `-c`). Keep the smoother one as the default.

| Device        | Pager        | JS dropped / 20 swipes | UI dropped / 20 swipes | Min JS fps | Min UI fps | Black frames seen | Notes |
| ------------- | ------------ | ---------------------- | ---------------------- | ---------- | ---------- | ----------------- | ----- |
| _(iPhone …)_  | A flashlist  |                        |                        |            |            |                   |       |
| _(iPhone …)_  | B scrollview |                        |                        |            |            |                   |       |
| _(Android …)_ | A flashlist  |                        |                        |            |            |                   |       |
| _(Android …)_ | B scrollview |                        |                        |            |            |                   |       |
