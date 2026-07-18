# Changelog

All notable changes to this project will be documented in this file. The format
is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-07-18

### Fixed

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

