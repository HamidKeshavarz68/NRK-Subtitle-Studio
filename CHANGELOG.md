# Changelog

All notable changes to this project will be documented in this file. The format
is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

