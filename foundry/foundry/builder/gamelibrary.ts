// The games saved in this browser: a list, one of them open. The open game is also mirrored to the old single-game key so older code and tests keep working.
import type { GameConfig } from '../compiler/config';
import { parseConfig, syncMaxWin } from './model';

export interface SavedGame { id: string; config: GameConfig; savedAt: number }
const LIB_KEY = 'foundry-builder-games-v1';
const CURRENT_KEY = 'foundry-builder-current-v1';
export const MIRROR_KEY = 'foundry-builder-config-v1';

const read = (): SavedGame[] => {
  try {
    const t = localStorage.getItem(LIB_KEY); if (!t) return [];
    const v = JSON.parse(t) as SavedGame[];
    return Array.isArray(v) ? v.filter((g) => g && typeof g.id === 'string' && g.config && typeof g.savedAt === 'number') : [];
  } catch { return []; }
};
const write = (games: SavedGame[]) => { try { localStorage.setItem(LIB_KEY, JSON.stringify(games)); } catch { /* storage blocked: the game stays open until the page closes */ } };

export const newGameId = () => `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** All saved games, newest first. A game saved by an older version (the single-game key) becomes the first entry. */
export function loadGames(): SavedGame[] {
  let games = read();
  if (!games.length) {
    try {
      const old = localStorage.getItem(MIRROR_KEY);
      if (old) { const p = parseConfig(old); if (p.config) { games = [{ id: newGameId(), config: syncMaxWin(p.config), savedAt: Date.now() }]; write(games); } }
    } catch { /* nothing to migrate */ }
  }
  return games.sort((a, b) => b.savedAt - a.savedAt);
}
export function currentGameId(games: SavedGame[]): string | undefined {
  try { const c = localStorage.getItem(CURRENT_KEY); if (c && games.some((g) => g.id === c)) return c; } catch { /* use the newest */ }
  return games[0]?.id;
}
export function saveGame(id: string, config: GameConfig): void {
  const games = read(); const i = games.findIndex((g) => g.id === id); const item = { id, config, savedAt: Date.now() };
  if (i >= 0) games[i] = item; else games.push(item);
  write(games);
  try { localStorage.setItem(CURRENT_KEY, id); localStorage.setItem(MIRROR_KEY, JSON.stringify(config)); } catch { /* fine */ }
}
export function removeGame(id: string): SavedGame[] {
  const games = read().filter((g) => g.id !== id); write(games);
  try { if (!games.length) { localStorage.removeItem(MIRROR_KEY); localStorage.removeItem(CURRENT_KEY); } } catch { /* fine */ }
  return games.sort((a, b) => b.savedAt - a.savedAt);
}
export function setCurrent(id: string): void { try { localStorage.setItem(CURRENT_KEY, id); } catch { /* fine */ } }
