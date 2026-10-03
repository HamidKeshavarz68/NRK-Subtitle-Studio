/**
 * Details for a film or an episode, shown before playback (like the NRK app):
 * Watch (or Continue / Watch again), Mark as watched, Favourite and, for
 * episodes, a shortcut to all episodes of the series. Favouriting an episode
 * saves its series.
 */

import { onActivate, push, toast, type Screen } from "../app";
import { clear, errorBox, h, lazyBg } from "../dom";
import { addFavorite, isFavorite, removeFavorite, type Favorite } from "../favorites";
import { getProgramInfo, getSeries, type Card } from "../nrk";
import { clearProgress, getProgress, markWatched, progressLabel } from "../progress";
import { createPlayer } from "./player";
import { createSeries } from "./series";

export function createDetails(card: Card): Screen {
  const backdrop = h("div", { class: "backdrop" });
  const kicker = h("div", { class: "details-kicker" });
  const title = h("h1", { class: "series-title", text: card.title });
  const meta = h("div", { class: "details-meta", text: card.meta || "" });
  const sub = h("div", { class: "details-sub" });
  const desc = h("p", { class: "series-desc", text: card.subtitle || "" });
  const note = h("div", { class: "details-note" });
  const progress = h("div", { class: "details-progress" });

  let target: Favorite | null = null;

  const watch = onActivate(h("div", { class: "button details-btn focusable", text: "▶  Watch" }), () =>
    push(createPlayer("program", card.id, title.textContent || card.title))
  );
  const seenBtn = onActivate(h("div", { class: "button details-btn focusable" }), () => {
    const p = getProgress(card.id);
    if (p && p.done) {
      clearProgress(card.id);
      toast("Marked as not watched");
    } else {
      markWatched(card.id);
      toast("Marked as watched");
    }
    renderProgress();
  });

  function renderProgress(): void {
    const p = getProgress(card.id);
    watch.textContent = !p ? "▶  Watch" : p.done ? "↺  Watch again" : "▶  Continue";
    seenBtn.textContent = p && p.done ? "○  Mark as not watched" : "✓  Mark as watched";
    clear(progress);
    const label = progressLabel(p);
    if (!label) return;
    progress.appendChild(h("span", { text: label }));
    if (p && !p.done && p.d > 0) {
      const fill = h("div", { class: "pbar-fill" });
      fill.style.width = Math.min(100, (p.t / p.d) * 100).toFixed(1) + "%";
      progress.appendChild(h("div", { class: "pbar" }, fill));
    }
  }
  renderProgress();
  const fav = h("div", { class: "button details-btn fav-btn focusable" });
  const seriesBtn = h("div", { class: "button details-btn focusable", text: "☰  All episodes" });
  fav.style.display = "none";
  seriesBtn.style.display = "none";

  onActivate(fav, () => {
    if (!target) return;
    if (isFavorite(target.kind, target.id)) {
      removeFavorite(target.kind, target.id);
      toast("Removed from favourites");
    } else {
      addFavorite({ ...target });
      toast(target.kind === "series" ? `${target.title} added to favourites` : "Added to favourites");
    }
    renderFav();
  });

  function renderFav(): void {
    if (!target) return;
    const on = isFavorite(target.kind, target.id);
    const what = target.kind === "series" ? "series " : "";
    fav.textContent = on ? `★  ${what ? "Series in" : "In"} favourites` : `☆  Add ${what}to favourites`;
    fav.classList.toggle("on", on);
    fav.style.display = "";
  }

  const body = h(
    "div",
    { class: "series-body details-body" },
    kicker,
    title,
    meta,
    progress,
    sub,
    desc,
    h("div", { class: "details-actions" }, watch, seenBtn, fav, seriesBtn),
    note
  );
  const el = h("div", { class: "screen series details" }, backdrop, body);
  lazyBg(backdrop, card.backdrop || card.image);

  getProgramInfo(card.id)
    .then((info) => {
      const name = info.title || card.title;
      title.textContent = name;
      if (info.meta) meta.textContent = info.meta;
      const description = info.description || card.subtitle || "";
      desc.textContent = description;
      sub.textContent = info.subtitle && info.subtitle !== description && info.subtitle !== name ? info.subtitle : "";
      if (!info.playable && info.message) note.textContent = info.message;
      if (!card.backdrop && !card.image) lazyBg(backdrop, info.image);

      if (info.seriesId) {
        const seriesId = info.seriesId;
        const t: Favorite = { kind: "series", id: seriesId, title: name, image: card.image || info.image };
        target = t;
        onActivate(seriesBtn, () => push(createSeries(seriesId, t.title)));
        seriesBtn.style.display = "";
        getSeries(seriesId)
          .then((s) => {
            t.title = s.title || t.title;
            t.subtitle = s.description || undefined;
            if (s.image) t.image = s.image;
            if (t.title !== name) kicker.textContent = t.title;
          })
          .catch(() => {
            // Keep the episode's own title and image.
          });
      } else {
        target = {
          kind: "program",
          id: card.id,
          title: name,
          subtitle: description || undefined,
          image: card.image || info.image,
        };
      }
      renderFav();
    })
    .catch((err) => {
      note.appendChild(errorBox(err));
    });

  return {
    el,
    onResume() {
      renderFav();
      renderProgress();
    },
  };
}
