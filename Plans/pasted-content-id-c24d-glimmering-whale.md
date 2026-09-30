# Smiley — Milestone 2 (front end): design system, 5-tab shell, reel player, video upload, live + gift UI shells

## Context
Colin's Milestone 2 brief is front-end only: the visible surface first, backend automation deferred. It targets four things: feel ("leave feeling better"), a pooled no-stutter reel player, 30-second reels, and live-first UI shells. There is no money, no real streaming, no moderation, no ranking and no battles.

**Starting point:**
- Milestone 1 plus follow-ups are pushed (HEAD `4ba70ba`).
- Expo SDK 57, expo-router, headless tabs.
- A theme already exists: `src/lib/theme.ts`, `src/components/ui/*`.
- The image reels feed is `src/app/(app)/(tabs)/index.tsx` plus `src/components/reels/*`.
- Other existing pieces: floating pill nav, sidebar and rail, `src/lib/errors.ts`, `src/lib/posts.ts` (signed URLs), `src/lib/follows.ts`.

**Colin's decision (revised mid-build): option 1, no new native deps.** Record: expo-camera `maxDuration: 30`, 720p. Library on iOS: expo-image-picker `allowsEditing` + `videoMaxDuration: 30` (Apple's native trimmer) + `videoExportPreset` 1280x720 (compression). Library on Android: videos over 30s rejected with friendly copy. Web: 30s or under only. Runs in **Expo Go**, so no dev build, no EAS, no Apple account. `react-native-compressor`, `react-native-video-trim` and `expo-dev-client` were removed.

## Things to flag before building
1. **`frontend-design` skill:** it isn't installed on this machine. I'll use the installed `design:design-system` skill for the token and spec work, plus a visual review pass. I'm naming it so it isn't a silent substitution.
2. **Trim needs a second native dependency:** `react-native-compressor` has no trim API, so I'm adding `react-native-video-trim`. It provides a native trim editor with `maxDuration: 30` on iOS and Android and has an Expo config plugin. It's listed here so approving this plan approves it.
3. **Physical-device testing:**
   - The dev build is made with EAS (free tier).
   - **Installing on an iPhone needs Colin's Apple Developer account ($99/yr).** I won't enroll or pay; Colin does that himself.
   - An Android phone can install the APK with no account.
   - I can't do the device performance profiling the brief requires. I'll ship an instrumented build plus a checklist, and Colin runs it.
4. **Web:** the native modules don't run on web. Web uploads accept videos up to 30s only, uncompressed, with a clear message for longer ones. The web player uses the same pool, but decode-ahead is best-effort.
5. **"Home = people you return to":**
   - Home shows your follows plus relationships of `returning` or `regular`, plus your own posts, in chronological order.
   - Discover shows recent public posts from everyone else, capped at a **finite set** (latest 30 from the last 7 days), then a terminal "That's everything for now" state.
   - If Home is empty, it points to Discover rather than refilling itself with strangers.
6. **One small DB migration, 007:** the 30-second cap is enforced on the database too, and storage allows video types. Otherwise the cap is client-only and bypassable, which is the same lesson as the age rules.

## 1. Design system (first; everything consumes it)
- **Tokens:** rebuild `src/lib/theme.ts` as the single source of truth.
  - Semantic colour tokens for light and dark, both fully designed: warm and confident, not childish.
  - Base palette from the unicorn: pink, maroon, rainbow accents only for delight moments.
  - Type scale in 7 steps (display, title, headline, body, callout, caption, micro), each with a documented use.
  - Spacing, radii, elevation (shadow tokens per theme), and motion tokens (durations 120/200/320/480, standard and gentle springs, a reduced-motion variant).
- **Primitives in `src/components/ui/`:** Button, Avatar, Card, **Sheet** (a new bottom sheet with Reanimated gestures), TabBar, Toast, EmptyState. Existing ones are refactored onto the tokens.
- **Lint guard:** an ESLint `no-restricted-syntax` rule fails on hex, `rgb(` or `rgba(` literals outside `theme.ts`, which enforces "no hardcoded colors" mechanically.
- **`DESIGN.md`:** tokens, the type scale and when to use each step, motion principles ("warm, not urgent"), and component usage.

## 2. Navigation shell: Home · Discover · Create · Live · You
- Routes under `src/app/(app)/(tabs)/`: `index` (Home), `discover`, `create`, `live/index`, `live/[id]`, and `you` (renamed from `profile`, with a redirect from the old URL).
- Five items in the floating pill nav on phones and in the sidebar on desktop. Create is emphasized.
- No red badges and no counts in the nav.

## 3. Reel player (the most important piece)
- **`src/components/reels/player/`:**
  - `PlayerPool` holds 4 `expo-video` players created once (`useVideoPlayer` ×4, never per item).
  - Each visible page borrows a slot. Source changes use `player.replaceAsync` instead of remounting.
  - **Decode-ahead:** when a page becomes current, the slots for index+1 and index−1 get their sources loaded and are held paused on the first frame (`currentTime = 0`, `pause()`), with a poster frame underneath so no black frame ever shows.
  - Only the current slot plays. It loops, with **no auto-advance**, per the anti-trance rule.
- **Pager:** built twice and measured.
  - Option A: FlashList with `pagingEnabled`, snapping to the page height (the current approach).
  - Option B: a pager with a Reanimated `ScrollView` and `onMomentumScrollEnd`.
  - Measured on JS and UI frame drops with the React Native performance monitor during a 20-swipe run on device. The smoother one is kept, and the numbers are recorded in `DESIGN.md`.
  - **No React state changes during a swipe.** The active index lives in a Reanimated shared value, and slot assignment runs on momentum end via `runOnJS` once per settle.
- **Gestures:**
  - Tap pauses or resumes.
  - Double-tap likes, reusing the existing heart burst.
  - Long-press opens the options Sheet.
- **Mute:** kept in a global store and persisted with `expo-sqlite/kv-store` on native and `localStorage` on web. The first reel starts muted, and a tap on the speaker toggles it.
- **Mixed feed:** image posts keep today's page. Reel pages use the pool. Text posts keep their colour cards.
- **Storage interface:** `src/lib/storage/index.ts` defines `MediaStore` (`upload`, `signedUrl(s)`, `remove`).
  - `supabaseStore.ts` implements it today. An `r2Store.ts` stub throws "not configured".
  - `EXPO_PUBLIC_MEDIA_PROVIDER` picks the store, so the R2 move is a config change.
  - `posts.ts` and image upload move onto it.
- **Stub content for the 20-video test:** a dev-only seed script, `scripts/seed-reels.ts`, generates 20 short sample clips with `ffmpeg` on the Mac (test pattern plus tone, 5–25s), uploads them, and inserts reel posts as seed users. It's local only, and no network video sources are used.

## 4. Video capture and upload (`create` tab)
- **Sources:**
  - Record with `expo-camera` (`maxDuration: 30`, `videoQuality: '720p'`).
  - Or pick from the library with `expo-image-picker` (videos plus images).
- **Trim:** any video over 30s opens `react-native-video-trim`'s editor with `maxDuration: 30` before continuing. It can't be skipped.
- **Compress:** `react-native-compressor` `Video.compress` with a max size of 1280 and a ~1.5 Mbps target bitrate, showing compression progress.
- **Upload:** resumable, with progress, cancel and retry.
  - It uses Supabase Storage's TUS endpoint through `MediaStore.upload`, with `AbortController` for cancel.
  - Retry picks up where it stopped.
  - Existing `errors.ts` mapping applies. Post creation keeps the M1 cleanup path.
- Caption, visibility and a poster preview (via `expo-video-thumbnails`) all sit on the same screen.
- `media_assets` gets `kind 'video'`, `duration_ms`, width and height. Posts get `kind 'reel'`.
- **Migration 007:**
  - A check that video media has `duration_ms` ≤ 30500.
  - A check that `posts.kind='reel'` only attaches video.
  - The storage bucket allows `video/mp4` and `video/quicktime`, with a 60 MB limit.
  - pgTAP tests for each.

## 5. Profile ("You")
- Header: avatar, name, username, bio, link, and an edit flow (the existing one, restyled).
- A grid mixing posts and reels. Reel tiles use the poster frame plus a play glyph.
- No counts anywhere. A grep-based check in CI (`scripts/check-no-counts.ts`) fails on `follower_count` or `following_count` appearing in `src/`.

## 6. Live directory and viewer: shell only, stub data
- `src/lib/live/stub.ts` holds typed fake streams: host, title, thumbnail gradient and viewer count. Viewer counts on live are explicitly requested in the brief.
- **Directory:** a "Live now" grid of cards with a pulsing live dot (gentle, not red-urgent) and the viewer count.
- **Viewer `live/[id]`:**
  - A placeholder video surface (animated gradient plus "Stream preview").
  - A chat panel: stub messages, plus a send box that only appends locally ("sending is off in preview").
  - A participant list Sheet and a gift button.
  - No network calls.

## 7. Gift picker: visual only
- A gift catalog grid in three tiers: Small (Rose, Coffee), Medium (Star, Rocket) and Grand (Crown). Tier colours come from tokens.
- **Animation tiers with Reanimated:**
  - Small: an icon floats up from the gift button, about 20% of the screen, for 900ms.
  - Medium: a centered burst with confetti particles, about 50% of the screen, for 1.6s.
  - Grand: a full-screen takeover with the unicorn, a rainbow sweep and particles, for 3s.
  - All three respect reduced motion.
- Buttons play the animation only. No Stripe, balance or ledger. The sheet footer reads "Preview — gifting isn't live yet".

## Execution
- **Order:** design system → shell → storage interface and migration 007 → reel player → capture and upload → profile → live → gifts → `DESIGN.md`.
- **Agents:** Forge takes the reel player and upload pipeline (E4 coding). The builder takes the design system, shell, live and gifts. The reviewer reads the final diff.
- **Commits:** logical units, pushed to `main` as each unit passes its checks.
- **Dev build:**
  - Add the `eas.json` development profile.
  - `bunx eas build --profile development --platform android` produces a free, sideloadable APK.
  - iOS needs Colin's Apple account.
  - I'll run `eas login` only with Colin's go-ahead, since it signs into his Expo account.
- **Stop** when §2 is done. No battles in any form.

## Verification
1. `bun run typecheck` and `bun run lint` are clean, including the no-hex rule. `bunx expo export --platform web` passes.
2. `bunx supabase db reset` works, and `bunx supabase test db` passes, including the new 007 tests.
3. `scripts/check-no-counts.ts` passes.
4. **Web walk in Chrome at 390 and 1512 widths, light and dark:**
   - All five tabs.
   - The 20 seeded reels swipe one per snap, with tap to pause, double-tap to like, long-press options, and mute persisting across reels.
   - Discover reaches "That's everything for now".
   - Uploading a web video ≤30s shows it in Home.
   - The live directory, the viewer, and all three gift tiers.
   - Screenshots of each.
5. **Device (Colin, dev build):** the brief's §5 checklist.
   - The build shows a dev-only perf overlay (JS and UI fps) to judge "no stutter".
   - I'll say plainly which items only Colin can confirm: 60fps on a real phone, no audio pops, recording, and the native trim editor.
