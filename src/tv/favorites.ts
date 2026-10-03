/**
 * Favourite series and films, stored in localStorage (newest first).
 * Episodes are never stored on their own: favouriting one saves its series.
 */

import type { Card } from "./nrk";

export interface Favorite {
  kind: "series" | "program";
  id: string;
  title: string;
  subtitle?: string;
  image?: string;
}

const STORAGE_KEY = "nss.tv.favorites";
const MAX = 200;
const listeners: (() => void)[] = [];

function load(): Favorite[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (f): f is Favorite =>
        !!f && (f.kind === "series" || f.kind === "program") && typeof f.id === "string" && !!f.id &&
        typeof f.title === "string"
    );
  } catch {
    return [];
  }
}

let list: Favorite[] = load();

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
  for (const fn of listeners) fn();
}

export function getFavorites(): Favorite[] {
  return list.slice();
}

export function isFavorite(kind: Favorite["kind"], id: string): boolean {
  return list.some((f) => f.kind === kind && f.id === id);
}

export function addFavorite(fav: Favorite): void {
  list = [fav].concat(list.filter((f) => !(f.kind === fav.kind && f.id === fav.id))).slice(0, MAX);
  save();
}

export function removeFavorite(kind: Favorite["kind"], id: string): void {
  list = list.filter((f) => !(f.kind === kind && f.id === id));
  save();
}

/** Refresh the stored title/image/description of an existing favourite without reordering. */
export function updateFavorite(fav: Favorite): void {
  let changed = false;
  list = list.map((f) => {
    if (f.kind !== fav.kind || f.id !== fav.id) return f;
    if (f.title === fav.title && f.image === fav.image && f.subtitle === fav.subtitle) return f;
    changed = true;
    return { kind: fav.kind, id: fav.id, title: fav.title, subtitle: fav.subtitle, image: fav.image };
  });
  if (changed) save();
}

export function onFavoritesChange(fn: () => void): void {
  listeners.push(fn);
}

export function favoriteToCard(f: Favorite): Card {
  return { kind: f.kind, id: f.id, title: f.title, subtitle: f.subtitle, image: f.image };
}
