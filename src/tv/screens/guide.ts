/** Guide: tips and tricks for using the app with a TV remote. */

import { h } from "../dom";

interface Section {
  title: string;
  tips: string[];
}

const SECTIONS: Section[] = [
  {
    title: "Getting around",
    tips: [
      "Use ▲ ▼ ◀ ▶ to move and OK to select.",
      "Back jumps from the page to the menu on the left. On the menu, press Back twice to leave the app.",
      "On the Front page, press ◀ ▶ on the Watch button to browse the featured programmes.",
      "None of the features need the red, green, yellow or blue buttons.",
    ],
  },
  {
    title: "Favourites",
    tips: [
      "Save a series or film with ☆ Add to favourites on its page.",
      "Favouriting an episode saves its series, so new episodes are always one click away.",
      "Open Favourites in the menu to see your list. Press ▼ on a tile to reach its ✕ Remove button.",
    ],
  },
  {
    title: "Programmes and series",
    tips: [
      "Films and episodes open a details page first. Choose ▶ Watch to start, or ☰ All episodes to see the series.",
      "On a series page, pick a season at the top, then an episode.",
      "Programmes remember where you stopped and continue from there next time.",
    ],
  },
  {
    title: "Watched and in progress",
    tips: [
      "A blue bar under a picture shows how much of that film or episode you have seen.",
      "“✓ Watched” marks the ones you have finished (reaching the end credits counts).",
      "On a details page, ▶ Continue picks up where you stopped and ↺ Watch again starts from the beginning.",
      "Use ✓ Mark as watched (or Mark as not watched) on the details page to change it yourself.",
    ],
  },
  {
    title: "During playback",
    tips: [
      "OK pauses and resumes. Only a small bar at the bottom edge appears, so the subtitles stay readable.",
      "While playing, ◀ ▶ jump 10 seconds back or forward. ⏪ ⏩ jump 30 seconds at any time.",
      "While paused, ◀ ▶ move between the ⚙ and ▶ buttons in the player bar instead of jumping. OK on ▶ resumes.",
      "▲ goes to the previous subtitle line (or the start of the current one), ▼ to the next line.",
      "Back or Stop leaves the player.",
    ],
  },
  {
    title: "Options strip (⚙)",
    tips: [
      "Pause with OK, press ◀ to move to the ⚙ icon in the player bar, then press OK. A slim strip opens along the bottom edge.",
      "◀ ▶ choose an option, ▲ ▼ (or OK) change it: Speed, Auto pause, Subtitles, Layout, Text size and Background opacity. Changes are saved right away.",
      "↺ Repeat line replays the current line and starts playing. Great for listening practice. ⏮ Start over plays from the beginning.",
      "Press Back to close the strip. It also closes by itself after a few seconds. Then press ▶ and OK (or Play) to continue.",
    ],
  },
  {
    title: "Auto pause",
    tips: [
      "Turn on Auto pause (Settings or the ⚙ options strip) to stop at the end of every subtitle line, so you have time to read it.",
      "“After each line” waits for you: press OK to play the next line. Or choose to resume by itself after 2, 3 or 5 seconds.",
      "Jumping back with ▲ replays a line and pauses after it again. Great for listening practice.",
    ],
  },
  {
    title: "Playback speed",
    tips: [
      "Slow programmes down (0.95× to 0.65×) or speed them up (1.05× to 1.4×) with Speed in the options strip (⚙) or under Settings → Playback speed.",
      "Tip for learners: 0.85× or 0.9× makes fast speech easier to follow without sounding unnatural.",
      "Voices keep their natural pitch, and the sound stays in sync with the picture.",
      "When you change speed, the picture may pause for a second or two while the TV switches over.",
      "The speed is remembered for the next programme. The player bar shows it (for example 0.9×) when it isn't 1×.",
      "Live channels always play at normal speed.",
      "If a programme's sound can't be played at another speed, the app tells you and plays it at 1×.",
    ],
  },
  {
    title: "Subtitles",
    tips: [
      "Subtitles: Bilingual shows Norwegian with the translation underneath. You can also show only the original or only the translation.",
      "Layout: Side panel shows a scrolling list of lines next to a smaller picture. Bottom shows classic captions. Hidden turns them off.",
      "Text size goes from 24 to 84 px. With big text the side panel scrolls so the current line stays in view.",
      "Subtitle background opacity (in Settings or the options strip) sets how dark the box behind bottom captions is: 0 % shows outlined text only, 100 % a solid box.",
      "You can change all of these with the options strip during playback, or in Settings.",
      "Right-to-left languages such as Persian, Arabic, Urdu and Kurdish (Sorani) are shown right to left.",
      "Live channels don't have subtitle files, so no subtitles are shown there.",
    ],
  },
  {
    title: "Translation",
    tips: [
      "Choose the language under Settings → Translate subtitles to. Choose “No translation” to see Norwegian only.",
      "Translations come from Google Translate by default.",
      "For better translations, add a DeepL API key in Settings (a free DeepL API plan works). Use Test DeepL key to check it.",
      "DeepL covers almost every language in the list, including Persian, Arabic, Urdu, Kurdish, Turkish and Ukrainian. Somali and Tigrinya always use Google Translate.",
      "If the DeepL key is missing, wrong or out of quota, the app uses Google Translate automatically.",
      "The subtitle panel header shows which service is translating and how far it has come.",
    ],
  },
  {
    title: "If something doesn't work",
    tips: [
      "Many NRK programmes can only be watched from Norway.",
      "If nothing loads, use Settings → Test connection.",
      "The TV app normally talks to NRK directly, so the Proxy server setting is usually empty.",
      "If the TV can't reach NRK directly, run npm run serve:tv on a computer on the same network. Enter its address under Settings → Proxy server. The proxy forwards the NRK and DeepL requests.",
    ],
  },
];

export function guideView(): HTMLElement {
  const view = h("div", { class: "view scroll-y guide" }, h("h1", { text: "Guide" }));
  view.appendChild(h("p", { class: "hint", text: "Tips and tricks. Use ▲ ▼ to scroll and Back to return to the menu." }));
  for (const s of SECTIONS) {
    const list = h("ul", { class: "guide-list" });
    for (const t of s.tips) list.appendChild(h("li", { text: t }));
    view.appendChild(h("section", { class: "guide-section focusable" }, h("h2", { text: s.title }), list));
  }
  return view;
}
