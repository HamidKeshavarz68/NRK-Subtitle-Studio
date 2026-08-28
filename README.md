# NRK Subtitle Studio

[**📦 Install from the Chrome Web Store →**](https://chromewebstore.google.com/detail/nrk-subtitle-studio/mcnkomopjmjaoamdpjmpokoboheekapf)

A Chrome (MV3) extension that supercharges the **tv.nrk.no** player with a side
panel that:

- shows **every subtitle cue** of the current video, scrolling in sync with
  playback (past cues fade, the active line is highlighted, upcoming lines stay
  visible so you can read ahead),
- can **translate** the subtitles to any of ~20 languages via Google Translate
  (Original / Translated / Bilingual modes),
- lets you **click any line to seek** the video to that point,
- adds a **playback-speed selector** (0.5× – 2×),
- adjusts **font size** (A− / A+),
- can be **resized from any edge or corner** and dragged anywhere on screen,
- hides NRK's native on-video subtitle while the panel is open, and restores it
  the moment you collapse the panel.

## Table of contents

- [Install from the Chrome Web Store](#install-from-the-chrome-web-store)
- [Install (unpacked)](#install-unpacked)
- [Toolbar controls](#toolbar-controls)
- [Tizen TV standalone app (prototype)](#tizen-tv-standalone-app-prototype)
- [Scripts](#scripts)
- [Releasing to the Chrome Web Store](#releasing-to-the-chrome-web-store)
- [How it works](#how-it-works)
- [File layout](#file-layout)
- [Notes & limitations](#notes--limitations)
- [Roadmap](#roadmap)
- [License](#license)

## Install from the Chrome Web Store

The easiest way to install NRK Subtitle Studio is straight from the
[**Chrome Web Store listing**](https://chromewebstore.google.com/detail/nrk-subtitle-studio/mcnkomopjmjaoamdpjmpokoboheekapf):

1. Open the listing and click **Add to Chrome**.
2. Confirm the permissions prompt.
3. Open any video on <https://tv.nrk.no/> and turn subtitles on in the NRK
   player at least once (see step 4 under [Install (unpacked)](#install-unpacked)
   for why).

Chrome will keep the extension up to date automatically. If you'd rather build
from source — to hack on it, audit the code, or pin a specific version — follow
the unpacked install below.

## Install (unpacked)

```powershell
npm install
npm run build
```

This type-checks with `tsc` and bundles the TypeScript sources with
[esbuild](https://esbuild.github.io/) into:

- `src/content/**/*.ts` → `dist/content/index.js`    (runs on the NRK page)
- `src/background/*.ts` → `dist/background/index.js` (service worker — proxies
  Google Translate calls so the page CSP can't block them)

Then:

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this project folder (the one
   containing `manifest.json`).
3. Open any video on <https://tv.nrk.no/>.
4. **Turn subtitles on in the NRK player at least once** — pick any
   language from the player's CC menu. NRK only downloads a subtitle file
   when the user requests it; once you have, every cue is loaded and stays
   available even if you turn the native subtitles back off.
5. The panel appears in the top-left. Drag the header to move it. Drag any
   edge or corner to resize. Click **Hide** to collapse to just the
   toolbar; click **Show** to bring the list back.

> The panel only mounts on actual video pages (URLs containing
> `/episode/`, `/program/`, `/direkte/`, `/film/`, `/se/`). The main /
> category pages of `tv.nrk.no` stay clean.

## Toolbar controls

| Control | What it does |
| --- | --- |
| **Language** | Target language for translation. "— No translation —" disables it. Hidden when mode is "Original". |
| **Mode** | `Original` / `Translated` / `Bilingual`. Bilingual shows the original above and a smaller, blue, italic translation below. Hidden when language is off. |
| **0.5× – 2×** | Sets `video.playbackRate` and re-asserts it if the player tries to reset. |
| **A− / A+** | Cue font size (10 px – 32 px, persisted). |
| **⚙ Settings** | Opens a responsive menu for language, translator, playback speed, and text size. Typography, spacing, and controls scale automatically with viewport size and display density. |
| **Hide / Show** | Collapses the window to just the toolbar, or restores its previous size. |

The settings dropdown is localised with a small built-in i18n layer
(`src/content/ui/i18n.ts`).
Switching the menu language re-renders every toolbar label and tooltip on the fly.
Turning **Enable translation** off hides the language/mode controls entirely and
stops any translation requests. The dropdown also shows the current extension
version and quick links to email the author or open the GitHub repository for
bugs, issues and suggestions.

## Tizen TV standalone app (prototype)

This repository now includes a **separate Tizen web app prototype** in
`/tizen-app`. This is not an injection into NRK's official Samsung app (that
is blocked by Tizen app sandboxing), but a standalone app that reproduces the
subtitle panel workflow.

### What it includes

- TV-friendly shell UI with Samsung remote key navigation
- NRK programme-id/URL loading through `psapi.nrk.no` manifest
- Subtitle track selection and full-WebVTT parsing
- Original / Translated / Bilingual subtitle display modes
- Large-text controls for TV readability
- Translation fallback behavior (failed cues keep original text)

### Build

```powershell
npm run build:tizen
```

This outputs `tizen-app/dist/app.js`, used by `tizen-app/index.html`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run typecheck` | Type-check the sources with `tsc` (no emit). |
| `npm run build` | Type-check, then bundle TypeScript → `dist/` with esbuild. |
| `npm run watch` | Rebuild on change (esbuild watch mode). |
| `npm run clean` | Delete the `dist/` folder. |
| `npm run rebuild` | `clean` + `build`. |
| `npm run package` | Rebuild and produce `build/nrk-subtitle-studio.zip` ready to upload to the Chrome Web Store. |
| `npm run crx` | Rebuild and produce `build/nrk-subtitle-studio.crx` (auto-creates the signing key at `.crx-key/key.pem` on first run). |

> The `.crx` signing key lives in `.crx-key/` (git-ignored), **not** under
> `build/`. It is kept in a dot-prefixed folder on purpose: Chrome's
> **Load unpacked** recursively scans the project folder, and it warns if a
> private key file is found inside the extension. Chrome ignores files and
> folders whose names start with `.`, so the key never trips that warning.
> Back this file up and reuse it for every build to keep a stable extension ID.

## Releasing to the Chrome Web Store

The repository ships two GitHub Actions workflows under `.github/workflows/`:

- **`ci.yml`** – runs on every push / PR; builds, sanity-checks the produced
  files, and uploads a build artefact.
- **`publish.yml`** – on every tag matching `v*` (e.g. `v1.0.1`), or via
  manual *workflow_dispatch*, it:
  1. verifies the tag matches `manifest.json`'s `version`,
  2. builds + zips the extension,
  3. uploads it to the Chrome Web Store via
     [`chrome-webstore-upload-cli`](https://github.com/fregante/chrome-webstore-upload-cli)
     and (for tag pushes) auto-publishes.

### One-time setup

1. Manually upload the first build (the zip from `npm run package`) to the
   [Chrome Web Store dashboard](https://chrome.google.com/webstore/devconsole)
   so Google assigns you an extension ID.
2. In Google Cloud Console, enable the **Chrome Web Store API** and create
   OAuth 2.0 credentials (type: *Desktop app*).
3. Generate a refresh token:
   ```powershell
   npx chrome-webstore-upload-cli@3 generate-refresh-token
   ```
4. Add four repository secrets (Settings → Secrets and variables → Actions):

   | Secret | Value |
   | --- | --- |
   | `CWS_EXTENSION_ID` | Extension ID from the developer dashboard |
   | `CWS_CLIENT_ID` | OAuth 2.0 client ID |
   | `CWS_CLIENT_SECRET` | OAuth 2.0 client secret |
   | `CWS_REFRESH_TOKEN` | Refresh token from step 3 |

### Cutting a release

```powershell
# bump version in package.json + manifest.json so they match, commit, then:
git tag v1.0.1
git push --tags
```

GitHub Actions will build, upload, and publish.

## How it works

### Subtitle capture

A content script finds the player's `<video>` element (works across NRK's SPA
navigations) and listens for `addtrack` on `video.textTracks`, plus `cuechange`
on the subtitle track and a periodic re-scan. Whenever the cue set changes it is
snapshotted into shared state.

The script **never changes `track.mode`**. NRK's player streams subtitle
segments only while its text track is visible, so forcing the track to
`'hidden'` (an earlier approach) made the player stop loading cues — the overlay
would freeze on the last cue while the video kept playing. Leaving the
user-selected track untouched keeps cues flowing for the whole programme.

Because the cue set is delivered (and evicted) in segments, the snapshot is
guarded by a content *signature* (count + boundary timestamps), not just length,
so it refreshes correctly even when cues are appended, replaced or rolled
forward.

### Hiding NRK's native captions

Since `track.mode` is left alone, the native captions are suppressed *visually*
instead, fully reversibly:

- a `video::cue { … }` stylesheet covers the browser's native cue renderer, and
- NRK paints its on-video subtitle as a styled DOM node (not via `::cue`), so the
  script also walks the player container and `visibility:hidden`s any leaf-ish
  element whose visible text matches the current cue.

Both are removed when the panel collapses or you leave the video page.

### Rendering & rolling window

On every `timeupdate`, a binary search finds the active cue (most recent
cue with `startTime ≤ currentTime`). The active cue stays highlighted
through the silent gap until the **next** cue starts, so the current line
never disappears between subtitles. A window of 3 past + 12 upcoming cues
is re-rendered only when the window or translation states change, and the
active line auto-scrolls to the centre.

### Translation (Google Translate, batched)

- The unauthenticated `translate.googleapis.com/translate_a/single?client=gtx`
  endpoint is used (the same one Chrome's "Translate this page" calls — no
  API key, but unofficial; rate-limited by IP).
- The page's CSP blocks direct fetches from a content script, so all
  translation requests are proxied through the **background service worker**
  (`dist/background.js`).
- Translation is **on-demand** — only the visible window (active cue + the
  next ~12) is translated, not the whole episode. As playback advances new
  cues stream in.
- Requests are **coalesced into batches**: every render-triggered enqueue
  joins a 30 ms collection window, and the resulting set is sent to Google
  in **one HTTP request** (cues separated by a `@@@` token, then split back
  apart). The active cue typically arrives in 200–400 ms with the rest of
  the visible window, instead of N × 120 ms.
- Per-pair LRU cache (`source|target|normalised text` → translation) so
  repeats and seeks don't re-translate.
- Falls back to per-cue requests if the separator gets mangled.

**DeepL (optional, API key).** Selecting DeepL in Settings routes the same
batched requests through DeepL's `/v2/translate` API instead (the free
`api-free.deepl.com` or Pro `api.deepl.com` host is chosen automatically from
the key's `:fx` suffix), still proxied via the service worker. Batched cues are
sent as individual `text` parameters and rejoined, so splitting stays exact. If
the key is missing/invalid, the quota is exhausted, or the target language isn't
supported by DeepL, the request transparently falls back to the free Google
endpoint and a short toast warns the user. The per-pair cache is keyed by
provider, so switching engines never shows stale results.

### Resizing & dragging

Eight invisible handles (4 edges + 4 corners) translate mouse drags into
width/height/top/left changes, clamped to `[240×140, 95vw×95vh]` and to the
viewport. Header dragging uses the same scheme. Position is not persisted
across reloads, but **size is** (`localStorage.nsr.size`).

### Persisted settings (localStorage)

| Key | Value |
| --- | --- |
| `nsr.targetLang` | BCP-47 base code or `off` |
| `nsr.displayMode` | `original` / `translated` / `bilingual` |
| `nsr.fontSize` | px |
| `nsr.size` | `{ "w": …, "h": … }` |
| `nsr.playbackRate` | number 0.25 – 4 |
| `nsr.translationEnabled` | `true` / `false` (translation master switch) |
| `nsr.uiLang` | `en` / `no` (menu language) |
| `nsr.translator` | `google` / `deepl` (translation provider) |
| `nsr.deeplApiKey` | DeepL API key (used only when provider is `deepl`) |

## File layout

```
NRK-Subtitle-Studio/
├── manifest.json              MV3 manifest (content script + service worker)
├── package.json
├── tsconfig.json
├── scripts/
│   ├── build.mjs              esbuild bundler (one-off + --watch)
│   └── pack-*.mjs             Chrome package builders
├── public/
│   └── icons/                 Toolbar and web-store icons
└── src/
    ├── background/
    │   └── index.ts           Service worker and external API proxy
    ├── content/
    │   ├── index.ts           Entry: SPA gating + mount lifecycle
    │   ├── core/
    │   │   ├── config.ts      Constants, language lists and shared types
    │   │   ├── state.ts       Application state and persisted settings
    │   │   └── utils.ts       Shared text, cue, time and storage helpers
    │   ├── platform/
    │   │   └── runtime-client.ts Typed content-to-service-worker adapter
    │   ├── subtitles/
    │   │   ├── download.ts    Full-programme SRT export
    │   │   ├── native-subtitles.ts Native caption suppression/override
    │   │   ├── remote-subtitles.ts NRK manifest and WebVTT loading
    │   │   └── video.ts       Video/track discovery and cue snapshots
    │   ├── translation/
    │   │   └── translator.ts  Translation batching, fallback and cache
    │   └── ui/
    │       ├── elements.ts    Overlay DOM construction and element references
    │       ├── i18n.ts        English/Norwegian UI messages
    │       ├── overlay.ts     Settings controls and UI coordination
    │       ├── player-controls.ts NRK player-button integration
    │       ├── renderer.ts    Rolling and single-caption rendering
    │       ├── settings-popover.ts Popover mounting and positioning
    │       ├── toast.ts       Short-lived notices
    │       └── window-interactions.ts Drag, resize and size persistence
    ├── shared/
    │   └── extension/
    │       ├── messages.ts    Shared request/response contracts
    │       └── runtime.ts     Typed Chrome runtime boundary
    └── styles/
        └── overlay.css        Overlay styles
```

The content entry point composes these domains. Shared extension contracts contain
no feature logic; platform code owns browser API access; subtitle and translation
code own their respective workflows; UI code owns DOM creation and presentation.
Imports remain explicit instead of using barrel files, which keeps dependencies
visible and avoids hidden initialization side effects in the content-script bundle.

Built with `npm run build` → `dist/content/index.js` and
`dist/background/index.js` (each a single bundled file).

## Notes & limitations

- **NRK must have downloaded the subtitle file**: enable subtitles in the
  NRK player at least once per video. After that, every cue is in memory.
- **Live streams** that ship only in-band 608/708 captions don't expose
  cues via `TextTrack.cues` and won't roll.
- The Google Translate `gtx` endpoint is **unofficial**. If you start
  seeing only ⚠ on cues, that's almost certainly a temporary 429 from
  Google — wait a few minutes or pause translation by switching mode to
  "Original".
- The DOM-hiding heuristic for NRK's on-video subtitle is content-based
  (it matches by text). If NRK ever changes their renderer markedly the
  match may need tightening.

## Roadmap

- Optional cloud providers with API keys (Google Cloud Translation v3) for
  higher quality / quota guarantees. (DeepL is now supported — see Settings.)
- Persistent translation cache per-program in `chrome.storage.local`.
- Export current transcript (original + translation) as `.srt` / `.vtt`.

## License

[MIT](./LICENSE)
