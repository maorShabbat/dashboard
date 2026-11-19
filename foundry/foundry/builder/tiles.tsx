// One tile: a feature or a perk, in a board, a bonus or the palette. Click to edit, drag to move, plus and cross to add and remove.
import type { CSSProperties, ReactNode } from 'react';

export interface TileProps {
  testid: string; color: string; title: string; sub?: ReactNode; value?: ReactNode; tags?: string[];
  onOpen?: () => void; onRemove?: () => void; removeLabel?: string; onAdd?: () => void; addLabel?: string;
  drag?: string; muted?: boolean; star?: boolean; onUnstar?: () => void;
}

export function Tile({ testid, color, title, sub, value, tags, onOpen, onRemove, removeLabel, onAdd, addLabel, drag, muted, star, onUnstar }: TileProps) {
  return (
    <li className={`ftile ${muted ? 'muted' : ''} ${drag ? 'drag' : ''}`} style={{ '--tc': color } as CSSProperties} data-testid={testid}
      draggable={!!drag} onDragStart={drag ? (e) => { e.dataTransfer.setData('text/plain', drag); e.dataTransfer.effectAllowed = 'copyMove'; } : undefined}>
      <button className="ftilemain" onClick={onOpen} disabled={!onOpen} aria-label={`${onOpen ? 'Edit' : ''} ${title}`.trim()} data-testid={`${testid}-open`}>
        <span className="fbar" />
        <span className="fhead"><b>{star ? '★ ' : ''}{title}</b>{value !== undefined && <span className="fvalue">{value}</span>}</span>
        {sub && <span className="fsub">{sub}</span>}
        {tags && tags.length > 0 && <span className="ftags">{tags.map((t) => <i key={t}>{t}</i>)}</span>}
      </button>
      {onAdd && <button className="ftilebtn add" aria-label={addLabel ?? `Add ${title}`} data-testid={`${testid}-add`} onClick={onAdd}>+</button>}
      {onUnstar && <button className="ftilebtn" aria-label={`Remove ${title} from favorites`} data-testid={`${testid}-unstar`} onClick={onUnstar}>★</button>}
      {onRemove && <button className="ftilebtn" aria-label={removeLabel ?? `Remove ${title}`} data-testid={`${testid}-remove`} onClick={onRemove}>×</button>}
    </li>
  );
}

/** A box tiles can be dropped on. */
export function DropZone({ testid, onDropToken, children, empty }: { testid: string; onDropToken: (t: string) => void; children: ReactNode; empty?: ReactNode }) {
  return (
    <div className="dropzone" data-testid={testid}
      onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('over'); }} onDragLeave={(e) => e.currentTarget.classList.remove('over')}
      onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('over'); const t = e.dataTransfer.getData('text/plain'); if (t) onDropToken(t); }}>
      {children}{empty}
    </div>
  );
}
