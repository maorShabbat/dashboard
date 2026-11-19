import { useEffect, useMemo, useRef } from 'react';
import { builtinPresets, legacyPresets, presetsOf } from '../../library';
import { CATEGORIES, categoryDef, presetRef, type Preset } from '../../model/preset';
import { cx } from './widgets';
import { useServices, useStore } from './services';

function Thumb({ preset }: { preset: Preset }) {
  const { hub } = useServices();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let release: (() => void) | null = null;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && !release) release = hub.register(preset, el);
        else if (!e.isIntersecting && release) { release(); release = null; }
      }
    }, { rootMargin: '120px' });
    io.observe(el);
    return () => { io.disconnect(); release?.(); };
  }, [hub, preset]);
  return <canvas ref={ref} width={384} height={216} aria-label={`${preset.name} preview`} />;
}

function Card({ preset, onOpen }: { preset: Preset; onOpen: (p: Preset) => void }) {
  const store = useStore();
  const fav = store.favourites.has(preset.id);
  return (
    <div className="card" data-testid={`card-${preset.id}`} style={{ cursor: 'pointer' }} role="button" tabIndex={0} onClick={() => onOpen(preset)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(preset); }}>
      <div className="thumb">
        <Thumb preset={preset} />
        <button type="button" className="fav" aria-pressed={fav} aria-label={fav ? 'Remove from favourites' : 'Add to favourites'} title="Favourite" data-testid={`fav-${preset.id}`} onClick={(e) => { e.stopPropagation(); store.toggleFavourite(preset.id); }}>{fav ? '★' : '☆'}</button>
      </div>
      <div className="meta">
        <b>{preset.name} {preset.status === 'approved' && <span className="badge approved">approved</span>}{preset.status === 'archived' && <span className="badge archived">archived</span>}{preset.status === 'experimental' && <span className="badge experimental">experimental</span>}{preset.kind === 'user' && <span className="badge mine">mine</span>}</b>
        <p>{preset.description}</p>
      </div>
    </div>
  );
}

const norm = (s: string) => s.toLowerCase();

export function Library({ onOpen }: { onOpen: (p: Preset) => void }) {
  const store = useStore();
  const { section, search } = store;
  const user = store.userPresets();

  const { title, blurb, list } = useMemo(() => {
    const q = norm(search.trim());
    if (q) {
      const words = q.split(/\s+/);
      const pool = [...builtinPresets(), ...user];
      const hits = pool.filter((p) => { const hay = norm(`${p.name} ${p.description} ${p.tags.join(' ')} ${categoryDef(p.category).name} ${p.id}`); return words.every((w) => hay.includes(w)); });
      return { title: `Search: “${search.trim()}”`, blurb: `${hits.length} effect${hits.length === 1 ? '' : 's'} found across every category.`, list: hits };
    }
    switch (section.kind) {
      case 'category': { const c = categoryDef(section.id); return { title: c.name, blurb: c.blurb, list: [...presetsOf(section.id), ...user.filter((p) => p.category === section.id && false)] }; }
      case 'favourites': return { title: 'Favourites', blurb: 'The effects you starred.', list: [...builtinPresets(), ...user].filter((p) => store.favourites.has(p.id)) };
      case 'mine': return { title: 'My presets', blurb: 'Your saved presets. Each save keeps its own stable id; every change adds a version.', list: user };
      case 'archived': return { title: 'Archived and experimental', blurb: 'Kept so earlier work stays reproducible, or because the look was not approved. Open one to copy it.', list: legacyPresets() };
    }
  }, [section, search, user, store.favourites, store]);

  // inside a category, effects that name a group are shown under that heading (in the order the groups first appear)
  const groups = useMemo(() => {
    const by = new Map<string, Preset[]>();
    for (const p of list) { const g = p.group ?? 'More'; if (!by.has(g)) by.set(g, []); by.get(g)!.push(p); }
    return section.kind === 'category' && !search.trim() && list.some((p) => p.group) ? [...by] : [];
  }, [list, section, search]);

  return (
    <div className="lib" data-testid="library">
      <h2>{title}</h2>
      <p className="blurb">{blurb}</p>
      {list.length === 0 ? (
        <div className="empty">{section.kind === 'favourites' ? 'Nothing starred yet. Click the star on any effect.' : section.kind === 'mine' ? 'No saved presets yet. Open any effect, change it and press “Save as my preset”.' : 'No effects match.'}</div>
      ) : (
        groups.length > 1
          ? groups.map(([name, items]) => (
            <section key={name} aria-label={name}>
              <h3 className="group" data-testid={`group-${name}`}>{name}<span>{items.length}</span></h3>
              <div className="grid">{items.map((p) => <Card key={presetRef(p)} preset={p} onOpen={onOpen} />)}</div>
            </section>
          ))
          : <div className="grid">{list.map((p) => <Card key={presetRef(p)} preset={p} onOpen={onOpen} />)}</div>
      )}
    </div>
  );
}

export function Sidebar() {
  const store = useStore();
  const { section } = store;
  const cur = (k: string, id?: string) => (section.kind === k && (!id || (section.kind === 'category' && section.id === id)));
  return (
    <nav className="side" aria-label="Categories">
      <h4>Library</h4>
      {CATEGORIES.map((c) => (
        <button type="button" key={c.id} className="navitem" aria-current={cur('category', c.id)} data-testid={`cat-${c.id}`} onClick={() => store.setSection({ kind: 'category', id: c.id })}>
          {c.name}<span className="n">{presetsOf(c.id).length}</span>
        </button>
      ))}
      <h4>Yours</h4>
      <button type="button" className="navitem" aria-current={cur('favourites')} data-testid="nav-favourites" onClick={() => store.setSection({ kind: 'favourites' })}>★ Favourites<span className="n">{store.favourites.size}</span></button>
      <button type="button" className="navitem" aria-current={cur('mine')} data-testid="nav-mine" onClick={() => store.setSection({ kind: 'mine' })}>My presets<span className="n">{store.user.length}</span></button>
      <h4>Other</h4>
      <button type="button" className={cx('navitem')} aria-current={cur('archived')} data-testid="nav-archived" onClick={() => store.setSection({ kind: 'archived' })}>Archived and experimental<span className="n">{legacyPresets().length}</span></button>
    </nav>
  );
}
