/** Home: left navigation rail + Front page / Favourites / Live / Search / Guide / Settings views. */

import { cardEl, onActivate, toast, push, type Screen } from "../app";
import { LANGS } from "../../content/core/config";
import { clear, errorBox, h, spinner } from "../dom";
import { focus, focusFirst, focused } from "../focus";
import type { Key } from "../keys";
import { resetNetworkMode, testConnection } from "../net";
import { getChannels, search, type Card } from "../nrk";
import {
  cycle, DISPLAY_MODES, FONT_SIZES, formatRate, LAYOUTS, saveSettings, settings, SPEEDS,
} from "../settings";
import { frontpageView, type Adjustable } from "./frontpage";
import { createDetails } from "./details";
import { favoriteToCard, getFavorites, onFavoritesChange, removeFavorite, type Favorite } from "../favorites";
import { createPlayer } from "./player";
import { createSeries } from "./series";
import { checkDeeplKey } from "../translate";
import { guideView } from "./guide";

type ViewId = "home" | "favorites" | "live" | "search" | "guide" | "settings";

/** Series open their page, films/episodes a details page; `play` skips straight to the player. */
export function openCard(card: Card, play = false): void {
  if (card.kind === "series") push(createSeries(card.id, card.title));
  else if (card.kind === "program" && !play) push(createDetails(card));
  else push(createPlayer(card.kind, card.id, card.title));
}

export function createHome(): Screen {
  const content = h("main", { class: "content" });
  const views: Partial<Record<ViewId, HTMLElement>> = {};
  const railItems: Record<string, HTMLElement> = {};
  let active: ViewId = "home";

  const rail = h(
    "nav",
    { class: "rail", "data-remember": "" },
    h("div", { class: "brand" }, h("span", { class: "brand-nrk", text: "NRK" }), h("span", { text: "Subtitle Studio" })),
    railItem("home", "⌂", "Front page", true),
    railItem("favorites", "★", "Favourites"),
    railItem("live", "●", "Live TV"),
    railItem("search", "⌕", "Search"),
    railItem("guide", "?", "Guide"),
    railItem("settings", "⚙", "Settings")
  );

  function railItem(id: ViewId, icon: string, label: string, autofocus = false): HTMLElement {
    const el = h(
      "div",
      { class: "rail-item focusable", "data-autofocus": autofocus },
      h("span", { class: "rail-icon", text: icon }),
      h("span", { class: "rail-label", text: label })
    );
    railItems[id] = el;
    return onActivate(el, () => {
      show(id);
      focusFirst(content);
    });
  }

  function show(id: ViewId): void {
    active = id;
    for (const k in railItems) railItems[k].classList.toggle("active", k === id);
    if (!views[id]) views[id] = buildView(id);
    clear(content);
    content.appendChild(views[id]!);
  }

  function buildView(id: ViewId): HTMLElement {
    switch (id) {
      case "home":
        return frontpageView(openCard, () => {
          // Jump into the content once it has loaded, unless the user already moved.
          if (active === "home" && focused() === railItems.home) focusFirst(content);
        });
      case "favorites":
        return favoritesView(() => {
          if (active === "favorites") focus(railItems.favorites);
        });
      case "live":
        return liveView();
      case "search":
        return searchView();
      case "guide":
        return guideView();
      default:
        return settingsView();
    }
  }

  const el = h("div", { class: "screen home" }, rail, content);
  show("home");

  const screen: Screen = {
    el,
    onResume(): void {
      // A favourite tile can be rebuilt while another screen was on top; refocus its replacement.
      const last = screen.lastFocus;
      if (!last || el.contains(last)) return;
      const key = last.getAttribute("data-fav");
      const match = key ? content.querySelector<HTMLElement>(`[data-fav="${key}"]`) : null;
      if (match) focus(match);
      else focusFirst(content);
    },
    onKey(key: Key): boolean {
      const f = focused() as Adjustable | null;
      if (f && f._adjust && (key === "left" || key === "right")) {
        if (f._adjust(key === "left" ? -1 : 1) !== false) return true;
      }
      if (key === "back" && f && content.contains(f)) {
        focus(railItems[active]);
        return true;
      }
      return false;
    },
  };
  return screen;
}

/* ------------------------------------------------------------------ views */

/** Saved series and films. Re-renders whenever the favourites change anywhere in the app. */
function favoritesView(onEmpty: () => void): HTMLElement {
  const grid = h("div", { class: "grid fav-grid" });
  const empty = h("p", {
    class: "hint fav-empty",
    text: "No favourites yet. Open a series, film or episode and choose ☆ Add to favourites.",
  });
  const count = h("div", { class: "hint" });

  // Tiles are reused by kind:id so focus (and the focus restored after Back) survives re-renders.
  let tiles: Record<string, { tile: HTMLElement; sig: string }> = {};

  function tileFor(f: Favorite, i: number): HTMLElement {
    const key = f.kind + ":" + f.id;
    const sig = [f.title, f.subtitle, f.image].join("|");
    const old = tiles[key];
    if (old && old.sig === sig) return old.tile;
    const remove = onActivate(h("div", { class: "fav-remove focusable", text: "✕  Remove" }), () => {
      const idx = getFavorites().map((x) => x.kind + ":" + x.id).indexOf(key);
      removeFavorite(f.kind, f.id);
      toast(`Removed “${f.title}”`);
      render(idx < 0 ? i : idx);
    });
    const card = cardEl(favoriteToCard(f), (c) => openCard(c));
    card.setAttribute("data-fav", key);
    if (f.kind === "series") card.appendChild(h("div", { class: "badge fav-kind", text: "SERIES" }));
    const tile = h("div", { class: "fav-tile" }, card, remove);
    tiles[key] = { tile, sig };
    return tile;
  }

  function render(focusIndex = -1): void {
    const favs = getFavorites();
    const next: typeof tiles = {};
    const els = favs.map((f, i) => {
      const el = tileFor(f, i);
      next[f.kind + ":" + f.id] = tiles[f.kind + ":" + f.id];
      return el;
    });
    tiles = next;
    clear(grid);
    els.forEach((el) => grid.appendChild(el));
    empty.style.display = favs.length ? "none" : "";
    count.textContent = favs.length ? `${favs.length} saved · newest first` : "";
    if (focusIndex >= 0) {
      const cards = grid.querySelectorAll<HTMLElement>(".fav-tile .card");
      if (cards.length) focus(cards[Math.min(focusIndex, cards.length - 1)]);
      else onEmpty();
    }
  }

  onFavoritesChange(() => {
    // Removals made from this view re-render (and refocus) themselves.
    const f = focused();
    if (!f || !grid.contains(f)) render();
  });
  render();

  return h("div", { class: "view scroll-y favorites" }, h("h1", { text: "Favourites" }), count, empty, grid);
}

function liveView(): HTMLElement {
  const view = h("div", { class: "view scroll-y" }, h("h1", { text: "Live TV" }), spinner());
  const load = () => {
    getChannels()
      .then((channels) => {
        clear(view);
        view.appendChild(h("h1", { text: "Live TV" }));
        view.appendChild(h("div", { class: "grid" }, channels.map((c) => cardEl(c, openCard))));
        view.appendChild(
          h("p", { class: "hint", text: "Live channels don't carry subtitle files, so the subtitle panel is unavailable on live TV." })
        );
      })
      .catch((err) => showError(view, err, load));
  };
  load();
  return view;
}

function searchView(): HTMLElement {
  const input = h("input", {
    class: "search-input focusable",
    type: "text",
    placeholder: "Search NRK TV… (press OK to type)",
    autocomplete: "off",
  }) as HTMLInputElement;
  const results = h("div", { class: "grid" });
  const status = h("div", { class: "hint", text: "Search for series, films and programmes." });
  let seq = 0;

  const run = () => {
    const q = input.value.trim();
    if (!q) return;
    const mine = ++seq;
    clear(results);
    status.textContent = "Searching…";
    search(q)
      .then((cards) => {
        if (mine !== seq) return;
        status.textContent = cards.length ? `${cards.length} results for “${q}”` : `No results for “${q}”`;
        for (const c of cards) results.appendChild(cardEl(c, openCard));
        if (cards.length) focusFirst(results);
      })
      .catch((err) => {
        if (mine !== seq) return;
        status.textContent = err instanceof Error ? err.message : String(err);
      });
  };
  input.addEventListener("submit-search", run);

  return h("div", { class: "view scroll-y" }, h("h1", { text: "Search" }), input, status, results);
}

function settingsView(): HTMLElement {
  const status = h("div", { class: "hint" });

  function choiceRow<T>(
    label: string,
    options: { code: T; name: string }[],
    getValue: () => T,
    setValue: (v: T) => void
  ): HTMLElement {
    const value = h("span", { class: "setting-value" });
    const render = () => {
      const cur = options.filter((o) => o.code === getValue())[0];
      value.textContent = cur ? cur.name : String(getValue());
    };
    const row = h(
      "div",
      { class: "setting focusable" },
      h("span", { class: "setting-label", text: label }),
      h("span", { class: "setting-control" }, h("span", { class: "arrow", text: "◀" }), value, h("span", { class: "arrow", text: "▶" }))
    ) as Adjustable;
    const codes = options.map((o) => o.code);
    row._adjust = (step) => {
      setValue(cycle(codes, getValue(), step));
      saveSettings();
      render();
    };
    onActivate(row, () => row._adjust!(1));
    render();
    return row;
  }

  const proxyInput = h("input", {
    class: "setting-input focusable",
    type: "text",
    placeholder: "e.g. 192.168.1.20:8787 (optional)",
    value: settings.proxyUrl,
  }) as HTMLInputElement;
  proxyInput.addEventListener("submit-search", () => {
    settings.proxyUrl = proxyInput.value.trim();
    saveSettings();
    resetNetworkMode();
    toast(settings.proxyUrl ? "Proxy saved" : "Proxy cleared");
  });

  // The result appears below the last focusable button, so keep it in view.
  const showStatus = (msg: string) => {
    status.textContent = msg;
    view.scrollTop = view.scrollHeight;
  };
  const testBtn = onActivate(h("div", { class: "button focusable", text: "Test connection" }), () => {
    showStatus("Testing…");
    testConnection()
      .then(showStatus)
      .catch((err) => showStatus(err instanceof Error ? err.message : String(err)));
  });

  const deeplStatus = h("div", {
    class: "hint",
    text: "Optional. Without a working key, subtitles are translated with Google Translate.",
  });
  const deeplInput = h("input", {
    class: "setting-input focusable",
    type: "text",
    placeholder: "Paste or type your DeepL API key",
    autocomplete: "off",
    value: settings.deeplApiKey,
  }) as HTMLInputElement;
  const runDeeplCheck = () => {
    deeplStatus.textContent = "Checking DeepL key…";
    checkDeeplKey(settings.deeplApiKey).then((msg) => (deeplStatus.textContent = msg));
  };
  deeplInput.addEventListener("submit-search", () => {
    const key = deeplInput.value.trim();
    if (key === settings.deeplApiKey) return;
    settings.deeplApiKey = key;
    saveSettings();
    toast(key ? "DeepL key saved" : "DeepL key removed: using Google Translate");
    if (key) runDeeplCheck();
    else deeplStatus.textContent = "No DeepL key: subtitles are translated with Google Translate.";
  });
  const deeplBtn = onActivate(h("div", { class: "button focusable", text: "Test DeepL key" }), runDeeplCheck);

  const view = h(
    "div",
    { class: "view scroll-y settings" },
    h("h1", { text: "Settings" }),
    h("p", { class: "hint", text: "Use ◀ ▶ to change a value. Press Back to return to the menu." }),
    choiceRow("Translate subtitles to", LANGS, () => settings.targetLang, (v) => (settings.targetLang = v)),
    choiceRow("Show", DISPLAY_MODES, () => settings.displayMode, (v) => (settings.displayMode = v)),
    choiceRow("Subtitle layout", LAYOUTS, () => settings.layout, (v) => (settings.layout = v)),
    choiceRow(
      "Subtitle size",
      FONT_SIZES.map((n) => ({ code: n, name: n + " px" })),
      () => settings.fontSize,
      (v) => (settings.fontSize = v)
    ),
    choiceRow(
      "Playback speed",
      SPEEDS.map((n) => ({ code: n, name: n === 1 ? "Normal (1×)" : formatRate(n) })),
      () => settings.playbackRate,
      (v) => (settings.playbackRate = v)
    ),
    h(
      "div",
      { class: "setting setting-text" },
      h("span", { class: "setting-label", text: "DeepL API key" }),
      deeplInput
    ),
    h("div", { class: "setting-actions" }, deeplBtn),
    deeplStatus,
    h(
      "div",
      { class: "setting setting-text" },
      h("span", { class: "setting-label", text: "Proxy server" }),
      proxyInput
    ),
    h("div", {
      class: "hint",
      text:
        "Usually not needed: the TV app talks to NRK directly. Only if Test connection fails, run " +
        "\"npm run serve:tv\" on a PC on the same network and enter its address here.",
    }),
    h("div", { class: "setting-actions" }, testBtn),
    status,
    h(
      "div",
      { class: "about" },
      h("p", { text: `NRK Subtitle Studio for Samsung TV · v${__APP_VERSION__}` }),
      h("p", {
        text:
          "During playback: OK play/pause · paused: ◀ ⚙ then OK for speed and subtitle options · " +
          "◀ ▶ seek 10 s · ▲ ▼ previous/next line. More tips under Guide.",
      }),
      h("p", { text: "Not affiliated with NRK. Translations by DeepL (with your API key) or Google Translate." })
    )
  );
  return view;
}

function showError(view: HTMLElement, err: unknown, retry: () => void): void {
  clear(view);
  view.appendChild(errorBox(err));
  const btn = onActivate(h("div", { class: "button focusable", text: "Try again" }), retry);
  view.appendChild(btn);
  focus(btn);
}
