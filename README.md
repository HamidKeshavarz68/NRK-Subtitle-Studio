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
- [Scripts](#scripts)
- [Samsung TV app (Tizen)](#samsung-tv-app-tizen)
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
| `npm run build:tv` | Build the Samsung TV app into `build/tv/app/` (see [Samsung TV app](#samsung-tv-app-tizen)). |
| `npm run watch:tv` | Rebuild the TV app on change. |
| `npm run serve:tv` | Serve `build/tv/app/` on port 8787 for a desktop preview, plus an NRK/Google proxy the TV can use. |
| `npm run package:tv` | Build, sign and package `build/tv/NRK-Subtitle-Studio-<version>.wgt` with the Tizen CLI. |
| `npm run install:tv` | Package, then install and launch on the TV (`npm run install:tv -- --tv <TV-IP>`). |

> The `.crx` signing key lives in `.crx-key/` (git-ignored), **not** under
> `build/`. It is kept in a dot-prefixed folder on purpose: Chrome's
> **Load unpacked** recursively scans the project folder, and it warns if a
> private key file is found inside the extension. Chrome ignores files and
> folders whose names start with `.`, so the key never trips that warning.
> Back this file up and reuse it for every build to keep a stable extension ID.

## Samsung TV app (Tizen)

`src/tv/` contains a standalone Samsung Smart TV app (Tizen 4.0 / 2018 models
and newer) that brings the rolling, translated subtitle panel to the living
room. It doesn't wrap tv.nrk.no; it talks to NRK's public API directly:

- browse an NRK-style front page (hero carousel, promo banners, "Mest sett"
  and themed rows), live channels and search, with the remote,
- open a series, pick a season and an episode, and play it,
- open a film or an episode to see its details first, then **▶ Watch**,
- keep **favourite** series and films under **★ Favourites** in the menu: use
  **☆ Add to favourites** on a series, film or episode page (favouriting an
  episode saves its series) and **✕ Remove** to take one off the list,
- read the subtitles in a **side panel** (2 past + 8 upcoming lines) or as a
  **bottom caption**, in Norwegian, translated, or bilingual,
- step line by line, repeat a line, and resume where you left off,
- **change the playback speed** (0.65×–1.4×) with natural-sounding voices that
  stay in sync with the picture,
- change speed, subtitle mode, layout and text size (24–84 px) while watching
  from a slim options strip (pause, then **◀ ⚙ OK**) that keeps the subtitles readable,
- read Persian, Arabic, Urdu, Sorani and Hebrew translations right to left,
- read tips and tricks under **? Guide** in the menu.

Programmes are played with Samsung's AVPlay (NRK serves DASH to TVs and
AES-128 HLS for live channels); a plain `<video>` element with the HLS stream
is used as a fallback and in the desktop preview.

Samsung TVs mute their own audio at any speed other than 1× (both AVPlay and
`<video>`), so other speeds bring their own sound: the picture plays in a
muted `<video>` at the chosen rate, while the app fetches NRK's separate DASH
audio track, decodes it with Web Audio, time-stretches it with WSOLA (pitch
preserved) and schedules it against the video clock (`src/tv/audio/`). Back at
1× the player returns to AVPlay. Live channels always play at 1×.

### Remote control

| Key | Browsing | Player |
| --- | --- | --- |
| ◀ ▲ ▼ ▶ | Move focus | ◀ ▶ seek ±10 s (while paused: move between ⚙ and ▶) · ▲ ▼ previous / next subtitle line |
| OK | Open | Play / pause |
| OK on ⚙ (paused) | — | Options strip along the bottom edge (speed, subtitles, layout, text size, repeat line, start over); ◀ ▶ choose, ▲ ▼ or OK change, Back closes |
| ▶❚❚ | — | Play / pause |
| ⏪ ⏩ | — | Seek ±30 s |
| Back | Back (press twice on the home screen to exit) | Close the options strip, or leave the player (Stop works too) |

The colour keys aren't needed. On remotes that have them, they still work as
shortcuts (red: display mode, green: layout, yellow: repeat line, blue: text
size). Target language, display mode, layout and text size are also under
**Settings** in the app.

**Proxy server (optional).** NRK's API only allows browser requests from
tv.nrk.no, but the packaged TV app is allowed to talk to NRK directly, so this
setting is normally left empty (**Test connection** says "Connected directly
to NRK"). If the TV can't reach NRK directly, or you're using the desktop
preview, run `npm run serve:tv` on a computer on the same network and enter its
address (e.g. `192.168.1.20:8787`) under **Settings → Proxy server**. It
forwards the NRK and DeepL requests.

**DeepL (optional).** Paste a DeepL API key under **Settings → DeepL API key**
(free `:fx` and Pro keys both work) and press OK; **Test DeepL key** shows
whether it works and how much of your quota is used. Subtitles are then
translated with DeepL. With no key, a rejected key, a used-up quota, a target
language DeepL doesn't support, or any other DeepL error, the app falls back to
Google Translate and the subtitle panel header shows which one is in use
(`· DeepL` / `· Google`).

### Build and preview

```powershell
npm run build:tv   # → build/tv/app/ (config.xml, index.html, js/, css/, icon.png)
npm run serve:tv   # → http://localhost:8787/ (1920×1080, keyboard: arrows, Enter, Esc, r/g/y/b)
```

### Install on your TV

1. Install [Tizen Studio](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html)
   with the **TV Extensions** and **Samsung Certificate Extension** packages
   (Package Manager → Extension SDK).
2. Enable **Developer Mode** on the TV: open **Apps**, press `1 2 3 4 5` on the
   remote, switch Developer mode **On**, enter your PC's IP address, and
   restart the TV.
3. In Tizen Studio's **Certificate Manager**, create a **Samsung** certificate
   profile (TV). Signing in with a Samsung account adds your TV's DUID to the
   distributor certificate; connect to the TV first (step 4) so it is
   detected. Mark the profile as active.
4. With the TV and PC on the same network:

   ```powershell
   npm run install:tv -- --tv 192.168.1.50            # your TV's IP
   npm run install:tv -- --tv 192.168.1.50 --profile MyTvProfile
   ```

   This builds, signs and packages the `.wgt`, runs `sdb connect`, installs
   it and launches **NRK Subtitle Studio**. Set `TIZEN_STUDIO` if Tizen Studio
   isn't in `C:\tizen-studio` or `~/tizen-studio`. `npm run package:tv` only
   produces the signed `.wgt` (in `build/tv/`), which you can also install
   from Tizen Studio's Device Manager.

### Notes

- Most NRK content is **only available in Norway**; elsewhere NRK returns a
  "not available" message or the stream fails.
- NRK's API only allows cross-origin requests from `tv.nrk.no`. Packaged TV
  apps normally aren't subject to CORS. If yours is and lists don't load, run
  `npm run serve:tv` on a computer on the same network and enter
  `<computer-ip>:8787` under **Settings → Proxy server** in the app. The proxy
  only forwards requests to `nrk.no`, `translate.googleapis.com` and DeepL's
  API (the only host it forwards POSTs and the `Authorization` header to).
- Live channels have no subtitle file, so the panel is hidden on live TV.
- The app keeps your settings and resume positions in the TV's local storage.

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
│   ├── build-tv.mjs           Samsung TV app build / package / install
│   ├── tv-server.mjs          TV preview server + NRK/Google/DeepL proxy
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
    │   ├── extension/
    │   │   ├── messages.ts    Shared request/response contracts
    │   │   └── runtime.ts     Typed Chrome runtime boundary
    │   ├── subtitles/
    │   │   └── vtt.ts         WebVTT parser (extension + TV app)
    │   └── translation/
    │       └── deepl.ts       DeepL request helpers (extension + TV app)
    ├── styles/
    │   └── overlay.css        Overlay styles
    └── tv/                    Samsung Tizen TV app
        ├── index.ts           Entry point
        ├── app.ts / focus.ts / keys.ts  Screen stack, spatial navigation, remote keys
        ├── nrk.ts / net.ts    NRK API client and fetch (with optional proxy)
        ├── media.ts           AVPlay and <video> playback backends
        ├── audio/             Slowed-playback sound: DASH/AAC demux, WSOLA, Web Audio sync
        ├── translate.ts       Background subtitle translation (DeepL → Google fallback)
        ├── favorites.ts       Favourite series and films (localStorage)
        ├── screens/           Home (favourites, live, search, settings), frontpage,
        │                      series, details (Watch / Favourite), guide, player
        ├── static/            config.xml and index.html
        └── styles.css         1920×1080 TV styles
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
