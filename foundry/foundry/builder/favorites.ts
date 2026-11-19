// Features and bonuses a designer saved to reuse in other games. They live in this browser only and can be exported and imported as JSON.
import type { Feature } from '../compiler/features';
import type { BonusSettings } from './model';

/** A feature without its identity and place: those are chosen when it is added to a game. */
export type FeatureTemplate = Omit<Feature, 'id' | 'where'>;
export interface BonusTemplate { settings: BonusSettings; features: FeatureTemplate[]; cost: number }
export type Favorite =
  | { uid: string; kind: 'feature'; name: string; feature: FeatureTemplate }
  | { uid: string; kind: 'bonus'; name: string; bonus: BonusTemplate };
type NewFavorite = { kind: 'feature'; name: string; feature: FeatureTemplate } | { kind: 'bonus'; name: string; bonus: BonusTemplate };

export const FAV_KEY = 'foundry-favorites-v1';

export function loadFavorites(): Favorite[] {
  try {
    const t = localStorage.getItem(FAV_KEY); if (!t) return [];
    const v = JSON.parse(t); return Array.isArray(v) ? v.filter(isFavorite) : [];
  } catch { return []; }
}
function save(list: Favorite[]) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(list)); } catch { /* storage blocked: favorites last until the page closes */ }
  mem = list; for (const f of listeners) f();
}
let mem: Favorite[] | null = null;
const listeners = new Set<() => void>();
export const favorites = (): Favorite[] => (mem ??= loadFavorites());
export const subscribeFavorites = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function isFavorite(x: unknown): x is Favorite {
  const f = x as Favorite | null;
  if (!f || typeof f !== 'object' || typeof f.uid !== 'string' || typeof f.name !== 'string') return false;
  if (f.kind === 'feature') return !!f.feature && typeof (f.feature as { type?: unknown }).type === 'string';
  if (f.kind === 'bonus') return !!f.bonus && !!f.bonus.settings && Array.isArray(f.bonus.features);
  return false;
}
const uid = () => `fav_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Saves a favorite; saving the same name and kind again replaces the older one. */
export function addFavorite(f: NewFavorite): Favorite {
  const item = { ...f, uid: uid() } as Favorite;
  save([...favorites().filter((x) => !(x.kind === f.kind && x.name === f.name)), item]);
  return item;
}
export function removeFavorite(id: string) { save(favorites().filter((x) => x.uid !== id)); }
export const exportFavorites = (): string => JSON.stringify({ foundryFavorites: 1, items: favorites() }, null, 2);
/** Adds the favorites in an exported file; returns how many were new. */
export function importFavorites(text: string): number {
  const v = JSON.parse(text); const items: unknown[] = Array.isArray(v) ? v : v?.items;
  if (!Array.isArray(items)) throw new Error('This file has no favorites in it.');
  const have = new Set(favorites().map((x) => `${x.kind}:${x.name}`)); let n = 0; const add: Favorite[] = [];
  for (const it of items) if (isFavorite(it) && !have.has(`${it.kind}:${it.name}`)) { add.push({ ...it, uid: uid() }); n++; }
  if (add.length) save([...favorites(), ...add]);
  return n;
}
