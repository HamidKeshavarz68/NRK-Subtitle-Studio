/** Home: left navigation rail + Front page / Live / Search / Settings views. */

import { cardEl, onActivate, toast, push, type Screen } from "../app";
import { LANGS } from "../../content/core/config";
import { clear, errorBox, h, spinner } from "../dom";
import { focus, focusFirst, focused } from "../focus";
import type { Key } from "../keys";
import { resetNetworkMode, testConnection } from "../net";
import { getChannels, getFrontpage, search, type Card } from "../nrk";
import {
  cycle, DISPLAY_MODES, FONT_SIZES, LAYOUTS, saveSettings, settings,
} from "../settings";
import { createPlayer } from "./player";
import { createSeries } from "./series";

type ViewId = "home" | "live" | "search" | "settings";

type Adjustable = HTMLElement & { _adjust?: (step: number) => void };

export function openCard(card: Card): void {
  if (card.kind === "series") push(createSeries(card.id, card.title));
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
    railItem("live", "●", "Live TV"),
    railItem("search", "⌕", "Search"),
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
        return frontpageView(() => {
          // Jump into the content once it has loaded, unless the user already moved.
          if (active === "home" && focused() === railItems.home) focusFirst(content);
        });
      case "live":
        return liveView();
      case "search":
        return searchView();
      default:
        return settingsView();
    }
  }

  const el = h("div", { class: "screen home" }, rail, content);
  show("home");

  return {
    el,
    onKey(key: Key): boolean {
      const f = focused() as Adjustable | null;
      if (f && f._adjust && (key === "left" || key === "right")) {
        f._adjust(key === "left" ? -1 : 1);
        return true;
      }
      if (key === "back" && f && content.contains(f)) {
        focus(railItems[active]);
        return true;
      }
      return false;
    },
  };
}

/* ------------------------------------------------------------------ views */

function frontpageView(onLoaded: () => void): HTMLElement {
  const view = h("div", { class: "view scroll-y" }, spinner());
  const load = () => {
    clear(view);
    view.appendChild(spinner());
    getFrontpage()
      .then((rows) => {
        clear(view);
        for (const row of rows) {
          view.appendChild(
            h(
              "section",
              { class: "row" },
              h("h2", { text: row.title }),
              h(
                "div",
                { class: "row-items scroll-x", "data-remember": "" },
                row.cards.map((c) => cardEl(c, openCard))
              )
            )
          );
        }
        onLoaded();
      })
      .catch((err) => showError(view, err, load));
  };
  load();
  return view;
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

  const testBtn = onActivate(h("div", { class: "button focusable", text: "Test connection" }), () => {
    status.textContent = "Testing…";
    testConnection()
      .then((msg) => (status.textContent = msg))
      .catch((err) => (status.textContent = err instanceof Error ? err.message : String(err)));
  });

  return h(
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
    h(
      "div",
      { class: "setting setting-text" },
      h("span", { class: "setting-label", text: "Proxy server" }),
      proxyInput
    ),
    h("div", { class: "setting-actions" }, testBtn),
    status,
    h(
      "div",
      { class: "about" },
      h("p", { text: `NRK Subtitle Studio for Samsung TV · v${__APP_VERSION__}` }),
      h("p", {
        text:
          "During playback: OK play/pause · ◀ ▶ seek 10 s · ▲ ▼ previous/next line · " +
          "RED display mode · GREEN layout · YELLOW repeat line · BLUE text size",
      }),
      h("p", { text: "Not affiliated with NRK. Translations by Google Translate." })
    )
  );
}

function showError(view: HTMLElement, err: unknown, retry: () => void): void {
  clear(view);
  view.appendChild(errorBox(err));
  const btn = onActivate(h("div", { class: "button focusable", text: "Try again" }), retry);
  view.appendChild(btn);
  focus(btn);
}
