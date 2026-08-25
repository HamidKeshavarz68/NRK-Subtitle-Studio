/**
 * NRK Subtitle Studio — content script entry point.
 *
 * Wires the modules together and owns the page lifecycle: it gates on actual
 * video pages, mounts/tears down the overlay across NRK's SPA navigations, and
 * keeps the overlay attached to the current <video>.
 *
 * Modules:
 *  - core/             configuration, shared state and pure helpers
 *  - platform/         browser-extension runtime adapter
 *  - subtitles/        track discovery, native captions, remote files and export
 *  - translation/      translation proxy and coalesced batch engine
 *  - ui/               overlay, rendering and player controls
 */

import { VIDEO_PAGE_RE } from "./core/config";
import { state } from "./core/state";
import { overlay, syncFullscreenParent } from "./ui/overlay";
import { settingsHost } from "./ui/elements";
import { closeSettings } from "./ui/settings-popover";
import {
  applyNativeSubtitleVisibility,
  clearNativeSubtitleHiding,
} from "./subtitles/native-subtitles";
import { stopTranslations } from "./translation/translator";
import { attachToVideo, detachVideo, findVideo, scanTextTracks } from "./subtitles/video";
import { resetAccumulatedCues } from "./subtitles/download";
import { injectSettingsButton, removePlayerButton } from "./ui/player-controls";

const pageWindow = window as Window & { __nrkSubtitleStudioLoaded?: boolean };

if (!pageWindow.__nrkSubtitleStudioLoaded) {
  pageWindow.__nrkSubtitleStudioLoaded = true;
  bootstrap();
}

function isVideoPage(): boolean {
  return VIDEO_PAGE_RE.test(location.pathname);
}

function bootstrap(): void {
  let mounted = false;

  function mountIfNeeded(): void {
    const should = isVideoPage();
    if (should && !mounted) {
      document.documentElement.appendChild(overlay);
      document.documentElement.appendChild(settingsHost);
      syncFullscreenParent(); // in case we entered fullscreen on the new page
      mounted = true;
      const v = findVideo();
      if (v) attachToVideo(v);
      applyNativeSubtitleVisibility();
      injectSettingsButton();
    } else if (!should && mounted) {
      // Leaving a video page → tear everything down.
      clearNativeSubtitleHiding();
      closeSettings();
      removePlayerButton();
      overlay.parentElement?.removeChild(overlay);
      settingsHost.parentElement?.removeChild(settingsHost);
      stopTranslations();
      detachVideo();
      resetAccumulatedCues();
      state.video = null;
      state.track = null;
      state.cues = [];
      mounted = false;
    }
  }

  // Detect SPA navigations: NRK uses the History API.
  const fireNavigation = () => queueMicrotask(mountIfNeeded);
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function (
    this: History,
    ...args: Parameters<History["pushState"]>
  ): ReturnType<History["pushState"]> {
    const r = origPush.apply(this, args);
    fireNavigation();
    return r;
  };
  history.replaceState = function (
    this: History,
    ...args: Parameters<History["replaceState"]>
  ): ReturnType<History["replaceState"]> {
    const r = origReplace.apply(this, args);
    fireNavigation();
    return r;
  };
  window.addEventListener("popstate", fireNavigation);
  window.addEventListener("hashchange", fireNavigation);

  const mo = new MutationObserver(() => {
    if (!mounted) return;
    const v = findVideo();
    if (v && v !== state.video) attachToVideo(v);
    // The player re-renders its controls (lit) across state changes; re-add our
    // settings button promptly whenever it gets wiped.
    injectSettingsButton();
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // Periodic tick: re-evaluate URL, re-scan tracks, re-attach if needed.
  setInterval(() => {
    mountIfNeeded();
    if (!mounted) return;
    // Shaka rebuilds its controls across navigations / fullscreen toggles, so
    // re-add our settings button whenever it has gone missing.
    injectSettingsButton();
    if (!state.video || !document.contains(state.video)) {
      const v = findVideo();
      if (v) attachToVideo(v);
      return;
    }
    scanTextTracks(state.video);
  }, 1500);

  // Initial check.
  mountIfNeeded();
}
