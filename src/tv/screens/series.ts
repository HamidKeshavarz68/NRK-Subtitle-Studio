/** Series detail: backdrop, season chips and the list of available episodes. */

import { cardEl, onActivate, push, type Screen } from "../app";
import { clear, errorBox, h, lazyBg, spinner } from "../dom";
import { focusFirst } from "../focus";
import { getEpisodes, getSeries, type Season } from "../nrk";
import { createPlayer } from "./player";

export function createSeries(id: string, fallbackTitle: string): Screen {
  const backdrop = h("div", { class: "backdrop" });
  const title = h("h1", { class: "series-title", text: fallbackTitle });
  const desc = h("p", { class: "series-desc" });
  const seasonsRow = h("div", { class: "chips scroll-x", "data-remember": "" });
  const episodes = h("div", { class: "grid episodes" }, spinner());
  const body = h("div", { class: "series-body scroll-y" }, title, desc, seasonsRow, episodes);
  const el = h("div", { class: "screen series" }, backdrop, body);

  let seq = 0;
  let chips: HTMLElement[] = [];

  function loadSeason(season: Season, chip: HTMLElement | null, moveFocus: boolean): void {
    const mine = ++seq;
    chips.forEach((c) => c.classList.toggle("active", c === chip));
    clear(episodes);
    episodes.appendChild(spinner());
    getEpisodes(season.href)
      .then((cards) => {
        if (mine !== seq) return;
        clear(episodes);
        if (!cards.length) {
          episodes.appendChild(h("div", { class: "hint", text: "No episodes are available to watch in this season yet." }));
          return;
        }
        for (const c of cards) {
          episodes.appendChild(
            cardEl(c, (card) => push(createPlayer("program", card.id, card.title)))
          );
        }
        if (moveFocus) focusFirst(episodes);
      })
      .catch((err) => {
        if (mine !== seq) return;
        clear(episodes);
        episodes.appendChild(errorBox(err));
      });
  }

  getSeries(id)
    .then((info) => {
      title.textContent = info.title;
      desc.textContent = info.description;
      lazyBg(backdrop, info.backdrop || info.image);

      if (!info.seasons.length) {
        clear(episodes);
        episodes.appendChild(h("div", { class: "hint", text: "Nothing to watch here yet." }));
        return;
      }
      chips = info.seasons.map((s) =>
        onActivate(h("div", { class: "chip focusable", text: s.title || "Season" }), () =>
          loadSeason(s, chips[info.seasons.indexOf(s)], true)
        )
      );
      chips.forEach((c) => seasonsRow.appendChild(c));
      // Year-named seasons: open the newest. Otherwise open the first (season 1 / latest).
      let idx = 0;
      info.seasons.forEach((s, i) => {
        const y = Number(s.title);
        if (/^\d{4}$/.test(s.title) && y > Number(info.seasons[idx].title)) idx = i;
      });
      if (!/^\d{4}$/.test(info.seasons[0].title)) idx = 0;
      if (info.seasons.length < 2) seasonsRow.style.display = "none";
      loadSeason(info.seasons[idx], chips[idx], true);
    })
    .catch((err) => {
      clear(episodes);
      episodes.appendChild(errorBox(err));
    });

  return { el };
}
