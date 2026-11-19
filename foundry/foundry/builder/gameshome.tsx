// The first screen: your games as tiles and a tile to start a new slot (the wizard). Nothing else (no menu, no live numbers); the builder layout only
// appears inside a game. With no games yet, the demo game and a pasted config are offered as quiet alternatives.
import { useState } from 'react';
import type { GameConfig, GameType } from '../compiler/config';
import { gameTypeOf } from './model';
import type { SavedGame } from './gamelibrary';
import { ConfirmModal } from './shell';
import { PasteStart } from './review';
import { Icon, Tile } from './ui';

const TYPE_NAME: Record<GameType, string> = { anywhere: 'Pay anywhere', cluster: 'Cluster pays', paylines: 'Paylines', ways: 'Ways to win' };
const when = (t: number) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function GamesHome({ games, onOpen, onDelete, onNew, onDemo, onPaste }: { games: SavedGame[]; onOpen: (id: string) => void; onDelete: (id: string) => void; onNew: () => void; onDemo: () => void; onPaste: (c: GameConfig) => void }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const doomed = games.find((g) => g.id === confirm);
  return (
    <div className="gameshome" data-testid="games-home">
      <header className="ghhead">
        <span className="brand"><Icon name="crown" size={24} /><span className="wordmark">BANGERS</span></span>
      </header>
      <main className="ghmain">
        <h1 className="ghtitle">{games.length ? 'Your games' : 'Build a Stake-ready slot'}</h1>
        <ul className="gametiles" data-testid="games-list">
          {games.map((g) => { const c: GameConfig = g.config; return (
            <li key={g.id} className="gametile" data-testid={`game-row-${g.id}`}>
              <button className="gtmain" data-testid={`open-game-${g.id}`} onClick={() => onOpen(g.id)} aria-label={`Open ${c.name || 'game'}`}>
                <span className="thumbs">{c.symbols.paying.slice(0, 4).map((p) => <Tile key={p} cfg={c} id={p} size={0} />)}</span>
                <b className="gtname">{c.name || 'Untitled game'}</b>
                <small className="gtmeta">{TYPE_NAME[gameTypeOf(c)]} · {c.board.reels}x{c.board.rows}</small>
                <small className="gtsaved">Saved {when(g.savedAt)}</small>
              </button>
              <button className="iconbtn gtdel" aria-label={`Delete ${c.name || 'this game'}`} data-testid={`delete-game-${g.id}`} onClick={() => setConfirm(g.id)}>×</button>
            </li>
          ); })}
          <li className="gametile add">
            <button className="gtmain gtnew" data-testid="new-game-open" onClick={onNew}><span className="gtplus"><Icon name="plus" size={26} /></span><b className="gtname">Start a new slot</b><small className="gtmeta">Name, type, grid and assets, step by step</small></button>
          </li>
        </ul>
        {!games.length && (
          <div className="ghalt">
            <button className="linkbtn" data-testid="start-demo" onClick={onDemo}>Or start from the demo game</button>
            <small className="muted">A 6x5 pay-anywhere slot with tumbles, wilds, scatters, free spins and a 200x bonus buy.</small>
            <PasteStart onConfig={onPaste} />
          </div>
        )}
      </main>
      {doomed && <ConfirmModal title={`Delete ${doomed.config.name || 'this game'}?`} body="The game and its history are removed from this browser. This cannot be undone. Export the config first if you want to keep it." confirmLabel="Delete game" ariaConfirm="Confirm delete game" onCancel={() => setConfirm(null)} onConfirm={() => { onDelete(doomed.id); setConfirm(null); }} />}
    </div>
  );
}
