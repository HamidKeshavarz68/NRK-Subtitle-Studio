# Changelog

All notable changes to this project will be documented in this file. The format
is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.2] - 2026-08-25

### Changed

- Reorganized the content script into explicit core, platform, subtitle,
  translation, and UI domains with typed extension messaging boundaries.
- Made the settings popover scale automatically with viewport size and display
  density, including compact mobile layout and bounded scrolling.
- Separated overlay window interactions and settings-popover lifecycle from the
  overlay coordinator to keep UI responsibilities focused.

## [0.5.0] - 2026-08-09

### Added

- **New "Single line (NRK)" subtitle view.** A **Subtitle view** setting lets you
  switch between the extension's rolling list and a single-line subtitle. In
  single-line mode the extension window is hidden and NRK's own native caption is
  used: with **Display mode** set to *Original* it is shown untouched, while
  *Translated* / *Bilingual* replace NRK's on-video caption with a translated one
  in the same spot so it looks native. NRK's own caption text is only hidden via
  CSS, never edited, so seeking never freezes it. In *Bilingual* the original and
  translation are shown as two equally-weighted lines on distinctly tinted boxes;
  the translation line reserves its space and is revealed in place — combined with
  pre-translating upcoming cues — so the text never flashes or jumps. The injected
  caption matches NRK's own font size (and honours the **Text size** control), and
  automatically lifts above the player controls while they are visible. The
  player-bar button and settings menu stay available so you can switch back at any
  time.

### Changed

- **Moved the Settings menu into the video player's control bar.** The overlay's
  header **Settings** button has been replaced by a button injected into the
  NRK player's control bar (bottom-right, to the left of the caption and
  fullscreen buttons). It shows the extension's own icon and opens the settings
  menu as a popover anchored to it.
- **Moved the `no → en` status indicator into the player control bar,** sitting
  directly to the left of the extension's button.
- **Simplified the overlay window.** The title bar is now a slim header showing
  just the extension icon and name, which doubles as the drag handle so it is
  obvious the window can be moved. The old **Hide** / collapse control was
  removed.

## [0.4.1] - 2026-07-24

### Changed

- **Consolidated the toolbar into a single Settings menu.** The separate
  **Translation** menu and **Download subtitle** button have been merged into the
  **Settings** menu, which now groups every control in one place: menu language,
  text size, playback speed, translation display mode, target language, the
  download subtitle button, translator, and DeepL API key.

## [0.4.0] - 2026-07-24

### Added

- **Choose your translation engine (Google or DeepL).** A new **Translator**
  option in the Settings menu lets you pick between the free Google Translate
  endpoint (default, unchanged behavior) and **DeepL**. Selecting DeepL reveals a
  field to paste your DeepL API key (free `:fx` and Pro keys both work — the
  correct endpoint is chosen automatically). If the key is missing, wrong, out of
  quota, or the target language isn't supported by DeepL, translation
  transparently falls back to free Google Translate and shows a 7-second warning
  bar directly under the extension's toolbar. The provider and key are persisted locally; everything runs through
  the existing service-worker proxy so it works on mobile and ARM devices
  (e.g. Raspberry Pi) too.

### Changed

- **The panel now opens on the top-left by default** (previously top-right). It
  remains fully draggable and resizable, and its size is still persisted.

### Fixed

- **NRK's own subtitle briefly flashed at the bottom of the video.** The player
  (Shaka) paints its caption as a DOM node, which was only hidden reactively
  after each render matched the cue text, leaving a one-frame flash as each new
  caption appeared. The overlay now hides Shaka's caption container
  (`.shaka-text-container`) up-front with CSS while it is expanded, so the native
  subtitle no longer blinks. This only affects `visibility`/`opacity` (never
  `track.mode`), so the player keeps streaming cues, and it is fully restored
  when the panel is collapsed.

## [0.3.0] - 2026-07-18

### Fixed

- **Moving and resizing the overlay did not work on Android extension browsers.**
  Both interactions listened only for mouse events (`mousedown`/`mousemove`/
  `mouseup`), which touchscreens never fire, so the panel could not be dragged or
  resized by touch. They now use Pointer Events with pointer capture, so mouse,
  touch and pen all work. The drag header and resize edges also set
  `touch-action: none` (so the page does not scroll while you drag), and the
  resize handles grow to finger-sized hit targets on touch devices.
- **Disabling subtitles in the NRK player froze the overlay instead of showing
  the tip.** When subtitles are turned off the player disables the track and its
  cues go null; the overlay kept displaying the last-loaded cues (which no longer
  advanced) and never reset. It now detects when no subtitle track is enabled,
  clears the stale cues, and shows the "enable subtitles" tip again.
- **Text size A- / A+ buttons did nothing on Android extension browsers.**
  Without `touch-action: manipulation`, the browser held each tap to watch for a
  double-tap-to-zoom, so rapid repeated taps on the steppers were swallowed. The
  overlay's buttons and selects now opt out of that delay, so taps register
  immediately.
- **Translation menu was unusable on a fresh install.** At the default settings
  (Display mode "Original", no target language), the panel hid both of its
  controls at once, so opening it showed only the "Display mode" label with
  nothing to interact with and no way to enable translation. This was most
  visible on Android extension browsers, where storage starts empty so every
  user hit the default state. The Display mode selector now stays visible at all
  times, so translation can always be enabled.

### Changed

- **Translation controls moved into a dedicated menu.** A new Translation menu
  button in the overlay header opens a panel that groups the Translate to
  language picker and the Display mode selector, mirroring the Settings menu.
  This declutters the header and keeps all translation options in one place.
- **New users now start on the original subtitles.** The default display mode is
  now "Original" instead of bilingual, so translation only happens once the user
  explicitly chooses a translated or bilingual mode.
- Switching Display mode to Translated or Bilingual without a target language
  chosen now auto-selects a sensible default (the menu language when it differs
  from the subtitle's source language, otherwise English), so translation takes
  effect immediately instead of silently staying off.
- The "enable subtitles in the NRK player" footer tip now only shows while no
  subtitles have been captured yet. Once subtitles are available it is hidden,
  since the advice no longer applies.
- Removed the separate "Enable translation" toggle. Translation is now driven
  entirely by the Display mode and target language, so there is no redundant
  master switch to keep in sync.

## [0.2.0]

### Added

- **Download subtitles** as a `.srt` (SubRip) file via a button in the overlay
  header. The complete subtitle file for the whole programme is fetched from
  NRK's playback manifest, so the export covers the entire video regardless of
  how much has been played. When translation is enabled the whole file is
  translated too, written as translated-only or bilingual output to match the
  selected display mode. The button appears once subtitles are available.
- Link to the [Chrome Web Store listing](https://chromewebstore.google.com/detail/nrk-subtitle-studio/mcnkomopjmjaoamdpjmpokoboheekapf)
  in the README and in the in-overlay Settings dropdown (Rate on Chrome Web
  Store).

## [0.1.1]

### Added

- Side-panel overlay on `tv.nrk.no` showing every subtitle cue of the current
  video, scrolling in sync with playback.
- Active cue highlighted; stays active through silent gaps until the next cue
  starts.
- Click any cue to seek the video to that timestamp.
- **Translation** via Google Translate (public `gtx` endpoint), proxied through
  a background service worker so the page CSP does not block requests.
- **Display modes**: Original / Translated / Bilingual.
- **Coalesced batch translator** — visible-window cues are sent in one request
  per batch instead of one per cue.
- **Per-pair LRU cache** so seeks and re-watches don't re-translate.
- **Playback-speed selector** (0.5×–2×).
- **Font-size buttons** (A− / A+, 10–32 px).
- **Resize from any edge or corner** with persisted size.
- **Drag-to-move** the panel; **Hide / Show** collapses to just the toolbar.
- **Fullscreen-aware**: panel reparents into the fullscreen element so it stays
  visible during fullscreen playback.
- **DOM-based subtitle hider** that suppresses NRK's on-video subtitle while
  the panel is expanded, restoring it on collapse.
- Mounts only on actual video pages (URLs containing `/episode/`, `/program/`,
  `/direkte/`, `/film/`, `/se/`).
