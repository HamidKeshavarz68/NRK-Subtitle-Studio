/**
 * Front page laid out like the NRK TV app: a rotating hero with backdrop and
 * title logo, typed rows (16:9 tiles, ranked posters) and wide promo banners.
 * The focused section glides to the top of the screen.
 */

import { onActivate } from "../app";
import { clear, errorBox, h, lazyBg, spinner } from "../dom";
import { decorate } from "../progress";
import { focus, onFocusChange } from "../focus";
import { getFrontpage, type Card, type Section } from "../nrk";

/** Left/right handler; returning false lets spatial navigation take the key. */
export type Adjustable = HTMLElement & { _adjust?: (step: number) => boolean | void };

const ROTATE_MS = 9000;
const SNAP_TOP = 40;

export function frontpageView(open: (c: Card, play?: boolean) => void, onLoaded: () => void): HTMLElement {
  const track = h("div", { class: "fp-track" });
  const view = h("div", { class: "view fp" }, track);
  let offset = 0;
  let lastInput = Date.now();
  let hero: Hero | null = null;

  const setOffset = (y: number) => {
    offset = y;
    const t = `translate3d(0, ${-y}px, 0)`;
    track.style.webkitTransform = t;
    track.style.transform = t;
  };

  onFocusChange((el) => {
    lastInput = Date.now();
    if (!track.contains(el)) return;
    let sec: HTMLElement | null = el;
    while (sec && sec.parentElement !== track) sec = sec.parentElement;
    if (!sec) return;
    setOffset(sec.classList.contains("fp-hero") ? 0 : Math.max(0, sec.offsetTop - SNAP_TOP));
  });

  window.setInterval(() => {
    if (!hero || offset !== 0 || view.offsetParent === null) return;
    if (Date.now() - lastInput < ROTATE_MS || Date.now() - hero.changedAt < ROTATE_MS) return;
    hero.step(1);
  }, 1000);

  const load = () => {
    clear(track);
    track.appendChild(spinner());
    getFrontpage()
      .then((sections) => {
        clear(track);
        setOffset(0);
        for (const sec of sections) track.appendChild(sectionEl(sec));
        onLoaded();
      })
      .catch((err) => {
        clear(track);
        const retry = onActivate(h("div", { class: "button focusable", text: "Try again" }), load);
        track.appendChild(h("div", { class: "fp-error" }, errorBox(err), retry));
        focus(retry);
      });
  };

  function sectionEl(sec: Section): HTMLElement {
    if (sec.kind === "hero") {
      hero = heroEl(sec.cards, open, () => (lastInput = Date.now()));
      return hero.el;
    }
    if (sec.kind === "banner") return bannerEl(sec.cards[0], open);
    return rowEl(sec, open);
  }

  load();
  return view;
}

/* ------------------------------------------------------------------ hero */

interface Hero {
  el: HTMLElement;
  step(dir: number): void;
  changedAt: number;
}

function heroEl(cards: Card[], open: (c: Card, play?: boolean) => void, onUserStep: () => void): Hero {
  const layers = cards.map(() => h("div", { class: "fp-hero-bg" }));
  const logo = h("img", { class: "fp-hero-logo", alt: "" }) as HTMLImageElement;
  const title = h("div", { class: "fp-hero-title" });
  const tag = h("div", { class: "fp-tag" });
  const desc = h("div", { class: "fp-hero-desc" });
  const dots = cards.map(() => h("span", { class: "fp-dot" }));
  const btn = h("div", { class: "button fp-hero-btn focusable", text: "▶  Watch" }) as Adjustable;
  let idx = 0;

  logo.addEventListener("error", () => {
    logo.style.display = "none";
    title.style.display = "";
  });

  const paint = (i: number) => {
    const layer = layers[i];
    const url = cards[i].backdrop || cards[i].image;
    if (url && !layer.style.backgroundImage) layer.style.backgroundImage = `url("${url.replace(/"/g, "%22")}")`;
  };

  const hero: Hero = {
    el: h(
      "section",
      { class: "fp-hero" },
      layers,
      h("div", { class: "fp-hero-shade" }),
      h(
        "div",
        { class: "fp-hero-info" },
        logo,
        title,
        tag,
        desc,
        btn,
        cards.length > 1 ? h("div", { class: "fp-dots" }, dots) : null
      )
    ),
    changedAt: Date.now(),
    step(dir: number) {
      show((idx + dir + cards.length) % cards.length);
    },
  };

  function show(i: number): void {
    idx = i;
    hero.changedAt = Date.now();
    const c = cards[i];
    paint(i);
    paint((i + 1) % cards.length);
    layers.forEach((l, n) => l.classList.toggle("active", n === i));
    dots.forEach((d, n) => d.classList.toggle("active", n === i));
    if (c.logo) {
      logo.style.display = "";
      title.style.display = "none";
      logo.src = c.logo;
    } else {
      logo.style.display = "none";
      title.style.display = "";
    }
    logo.alt = c.title;
    title.textContent = c.title;
    tag.textContent = c.tagline || "";
    tag.style.display = c.tagline ? "" : "none";
    desc.textContent = c.subtitle || "";
  }

  btn._adjust = (step) => {
    if (cards.length < 2 || (step < 0 && idx === 0)) return false;
    onUserStep();
    hero.step(step);
    return true;
  };
  onActivate(btn, () => open(cards[idx], true));
  show(0);
  return hero;
}

/* ------------------------------------------------------------------ rows */

function rowEl(sec: Section, open: (c: Card, play?: boolean) => void): HTMLElement {
  const portrait = sec.kind === "portrait";
  const ranked = portrait && /mest sett|topp ?\d*/i.test(sec.title);
  return h(
    "section",
    { class: "fp-row" + (portrait ? " fp-row-portrait" : "") },
    h("h2", { text: sec.title }),
    h(
      "div",
      { class: "row-items scroll-x", "data-remember": "" },
      sec.cards.map((c, i) => tileEl(c, open, portrait, ranked ? i + 1 : 0))
    )
  );
}

function tileEl(card: Card, open: (c: Card, play?: boolean) => void, portrait: boolean, rank: number): HTMLElement {
  const img = h("div", { class: "fp-img" }, card.kind === "channel" ? h("div", { class: "badge live", text: "LIVE" }) : null);
  lazyBg(img, card.image);
  if (card.kind === "program") decorate(img, card.id);
  const sub = [card.meta, card.subtitle].filter(Boolean).join(" · ");
  const el = h(
    "div",
    { class: "fp-card focusable" + (portrait ? " portrait" : "") + (rank ? " ranked" : "") },
    rank ? h("div", { class: "fp-rank", text: String(rank) }) : null,
    img,
    portrait ? null : h("div", { class: "fp-card-title", text: card.title }),
    portrait || !sub ? null : h("div", { class: "fp-card-sub", text: sub })
  );
  return onActivate(el, () => open(card));
}

/* ---------------------------------------------------------------- banner */

function bannerEl(card: Card, open: (c: Card, play?: boolean) => void): HTMLElement {
  const bg = h("div", { class: "fp-banner-bg" });
  lazyBg(bg, card.backdrop || card.image);
  const title = h("div", { class: "fp-banner-title", text: card.title });
  let logo: HTMLElement | null = null;
  if (card.logo) {
    logo = h("img", { class: "fp-banner-logo", alt: card.title, src: card.logo });
    title.style.display = "none";
    logo.addEventListener("error", () => {
      logo!.style.display = "none";
      title.style.display = "";
    });
  }
  const el = h(
    "div",
    { class: "fp-banner focusable" },
    bg,
    h("div", { class: "fp-banner-shade" }),
    h(
      "div",
      { class: "fp-banner-info" },
      logo,
      title,
      card.tagline ? h("div", { class: "fp-tag", text: card.tagline }) : null,
      card.subtitle ? h("div", { class: "fp-banner-desc", text: card.subtitle }) : null
    )
  );
  return h("section", { class: "fp-banner-wrap" }, onActivate(el, () => open(card)));
}
