/** Remote-control key handling for Samsung TVs, with keyboard fallbacks for desktop preview. */

export type Key =
  | "left" | "right" | "up" | "down" | "enter" | "back"
  | "play" | "pause" | "playpause" | "stop" | "ff" | "rw"
  | "red" | "green" | "yellow" | "blue";

const CODES: Record<number, Key> = {
  37: "left",
  38: "up",
  39: "right",
  40: "down",
  13: "enter",
  10009: "back",
  415: "play",
  19: "pause",
  10252: "playpause",
  413: "stop",
  417: "ff",
  412: "rw",
  403: "red",
  404: "green",
  405: "yellow",
  406: "blue",
  // Desktop fallbacks
  27: "back",
  8: "back",
  32: "playpause",
};

const CHARS: Record<string, Key> = {
  r: "red",
  g: "green",
  y: "yellow",
  b: "blue",
  ".": "ff",
  ",": "rw",
};

/** Tizen IME "Done" and "Cancel" keys shown on the on-screen keyboard. */
export const IME_DONE = 65376;
export const IME_CANCEL = 65385;

export function toKey(e: KeyboardEvent): Key | null {
  const code = e.keyCode;
  if (CODES[code]) return CODES[code];
  if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    return CHARS[e.key.toLowerCase()] || null;
  }
  return null;
}

/** Ask Tizen to deliver media and colour keys to the app instead of the system. */
export function registerTvKeys(): void {
  const tizen = window.tizen;
  if (!tizen || !tizen.tvinputdevice) return;
  const keys = [
    "MediaPlay", "MediaPause", "MediaPlayPause", "MediaStop",
    "MediaFastForward", "MediaRewind",
    "ColorF0Red", "ColorF1Green", "ColorF2Yellow", "ColorF3Blue",
  ];
  try {
    tizen.tvinputdevice.registerKeyBatch(keys, undefined, () => {
      // Some models lack a few of these keys; register individually as a fallback is not needed.
    });
  } catch {
    // Running outside a Tizen runtime.
  }
}

export function exitApp(): void {
  try {
    const app = window.tizen?.application?.getCurrentApplication();
    if (app) {
      app.exit();
      return;
    }
  } catch {
    // fall through
  }
  window.close();
}
