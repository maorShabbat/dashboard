// The settings of each special feature (the part of its dialog that differs by type). Where it works and when it fires are edited elsewhere.
import type { GameConfig } from '../compiler/config';
import type { Feature } from '../compiler/features';
import { symbolLook } from './model';
import { Hint } from './shell';
import { Num } from './ui';

type Chips<T extends string | number | boolean> = { value: T; options: readonly (readonly [T, string])[]; label: string; test: string; onChange: (v: T) => void };
function ChipRow<T extends string | number | boolean>({ value, options, label, test, onChange }: Chips<T>) {
  return (
    <span className="chips" role="group" aria-label={label}>
      {options.map(([v, text]) => <button key={String(v)} className={`chip ${value === v ? 'on' : ''}`} data-testid={`${test}-${v}`} onClick={() => onChange(v)}>{text}</button>)}
    </span>
  );
}
const Row = ({ label, hint, children }: { label: React.ReactNode; hint?: [string, string]; children: React.ReactNode }) => (
  <div className="field"><span className="lab">{label}{hint && <Hint title={hint[0]}>{hint[1]}</Hint>}</span>{children}</div>
);

function Weights({ counts, unit, label, onChange }: { counts: Record<string, number>; unit: string; label: string; onChange: (c: Record<string, number>) => void }) {
  const ks = Object.keys(counts).map(Number).sort((a, b) => a - b);
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="wcounts">
      {ks.map((k) => (
        <label key={k} className="wcount"><small>{k} {unit}</small>
          <Num w={72} min={1} step={1} value={counts[String(k)]} label={`${label} ${k}`} onChange={(n) => onChange({ ...counts, [String(k)]: Math.max(1, n) })} />
          <small className="faint">{Math.round((counts[String(k)] / total) * 100)}%</small></label>
      ))}
    </div>
  );
}

export function FeatureControls({ cfg, f, update }: { cfg: GameConfig; f: Feature; update: (patch: Partial<Feature>) => void }) {
  const wild = symbolLook(cfg, cfg.symbols.wild).name;
  const set = (patch: object) => update(patch as Partial<Feature>);
  switch (f.type) {
    case 'randomWild':
      return (
        <>
          <Row label={`How many ${wild} symbols`} hint={['How many', 'Each time it fires, one of these amounts drops. The weight is how likely that amount is.']}>
            <Weights counts={f.counts} unit={wild} label="Weight of wilds" onChange={(counts) => set({ counts })} /></Row>
          <p className="muted small">They land on ordinary cells only, never on scatters, multipliers or other wilds.</p>
        </>
      );
    case 'mystery':
      return (
        <>
          <Row label="How many cells" hint={['How many cells', 'Each time it fires, one of these amounts of cells turns into the same symbol. The weight is how likely that amount is.']}>
            <Weights counts={f.counts} unit="cells" label="Weight of mystery cells" onChange={(counts) => set({ counts })} /></Row>
          <Row label="Can turn into"><ChipRow value={f.pool} label="Mystery symbol pool" test="my-pool" options={[['all', 'Any paying symbol'], ['high', 'High pay only']] as const} onChange={(pool) => set({ pool })} /></Row>
          <p className="muted small">All the cells show the same symbol, picked by how often it appears on the reels. They land on ordinary cells only.</p>
        </>
      );
    case 'expandWild':
    case 'spreadWild':
      return (
        <>
          <Row label={`Chance for each ${wild}`} hint={['Chance', 'Every wild on the board rolls this chance on its own, after the trigger has fired.']}>
            <span className="row tight"><Num w={90} min={1} max={100} step={1} value={Math.round(f.chance * 100)} label="Chance for each wild (%)" onChange={(n) => set({ chance: Math.min(1, Math.max(0.01, n / 100)) })} /><span className="muted">%</span></span></Row>
          {f.type === 'expandWild'
            ? <Row label="Grows to fill"><ChipRow value={f.shape} label="Expansion shape" test="expand-shape" options={[['reel', 'Its reel'], ['row', 'Its row'], ['cross', 'Reel and row']] as const} onChange={(shape) => set({ shape })} /></Row>
            : <Row label="Copies onto" hint={['Copies', 'How many of the four neighbouring cells (up, down, left, right) receive a copy. Copies do not spread again.']}><ChipRow value={f.copies} label="Number of copies" test="spread-copies" options={[[1, '1 neighbour'], [2, '2 neighbours'], [3, '3 neighbours'], [4, '4 neighbours']] as const} onChange={(copies) => set({ copies })} /></Row>}
          <p className="muted small">Scatters and multipliers are never covered. Wilds made by other features count as sources.</p>
        </>
      );
    case 'stickyWild':
      return (
        <>
          <Row label="Held for" hint={['Held for', 'How many free spins a wild stays after the spin it landed on. "Rest of the bonus" keeps it until the feature ends.']}>
            <ChipRow value={f.lifetime} label="How long wilds are held" test="sticky" options={[[1, '1 spin'], [2, '2 spins'], [3, '3 spins'], [0, 'Rest of the bonus']] as const} onChange={(lifetime) => set({ lifetime })} /></Row>
          <p className="muted small">Bonuses only. A held {wild} comes back at the start of each following spin; it can still be used in wins and tumbles like any wild.</p>
        </>
      );
    case 'heroWild':
      return (
        <>
          <Row label="Starts at" hint={['Starts at', "The hero's multiplier on its first free spin."]}><ChipRow value={f.startFactor} label="Hero start multiplier" test="hero-start" options={[[1, '1x'], [2, '2x'], [3, '3x'], [5, '5x']] as const} onChange={(startFactor) => set({ startFactor, maxFactor: Math.max(f.maxFactor, startFactor) })} /></Row>
          <Row label="Grows by" hint={['Grows by', "Added to the hero's multiplier after every free spin that wins. 0 keeps it fixed."]}><ChipRow value={f.growth} label="Hero growth" test="hero-growth" options={[[0, 'Fixed'], [1, '+1'], [2, '+2'], [3, '+3']] as const} onChange={(growth) => set({ growth })} /></Row>
          <Row label="Up to"><span className="row tight"><Num w={90} min={f.startFactor} max={100} step={1} value={f.maxFactor} label="Hero maximum multiplier" onChange={(n) => set({ maxFactor: Math.max(f.startFactor, Math.round(n)) })} /><span className="muted">x</span></span></Row>
          <Row label="Moves" hint={['Moves', 'Step: to a neighbouring cell, like a walking character. Random: anywhere on the grid.']}><ChipRow value={f.move} label="How the hero moves" test="hero-move" options={[['step', 'Steps to a neighbour'], ['random', 'Jumps anywhere']] as const} onChange={(move) => set({ move })} /></Row>
          <p className="muted small">Bonuses only. The hero is a wild: it counts in wins, and it is replaced by a normal symbol after it is used in a tumble. The next free spin it appears again at its new cell.</p>
        </>
      );
    case 'cellMultiplier':
      return (
        <>
          <Row label="A cell starts at" hint={['Starts at', 'The multiplier a cell gets the first time it takes part in a win.']}><ChipRow value={f.start} label="Cell multiplier start" test="cm-start" options={[[2, '2x'], [3, '3x'], [5, '5x']] as const} onChange={(start) => set({ start, max: Math.max(f.max, start) })} /></Row>
          <Row label="Each further win" hint={['Growth', 'Every time the cell takes part in another win, its multiplier grows this way.']}><ChipRow value={f.growth} label="Cell multiplier growth" test="cm-growth" options={[['double', 'Doubles'], ['add', `Adds ${f.start}x`]] as const} onChange={(growth) => set({ growth })} /></Row>
          <Row label="Up to"><span className="row tight"><Num w={90} min={f.start} max={1024} step={1} value={f.max} label="Cell multiplier maximum" onChange={(n) => set({ max: Math.max(f.start, Math.round(n)) })} /><span className="muted">x</span></span></Row>
          <Row label="Marks last" hint={['Marks last', 'For one spin only, or for the whole bonus. The base game always clears every spin.']}><ChipRow value={f.memory} label="How long marks last" test="cm-memory" options={[['bonus', 'The whole bonus'], ['spin', 'One spin']] as const} onChange={(memory) => set({ memory })} /></Row>
          <p className="muted small">A win that includes marked cells is multiplied by the sum of their multipliers. The marks use the multiplier a cell has before this win, then every cell in the win is marked or upgraded.</p>
        </>
      );
    case 'multiplierLadder':
      return (
        <>
          <Row label="Starts at" hint={['Starts at', 'The global multiplier at the start of every spin.']}><ChipRow value={f.start} label="Ladder start" test="ladder-start" options={[[1, '1x'], [2, '2x'], [3, '3x'], [5, '5x']] as const} onChange={(start) => set({ start, max: Math.max(f.max, start) })} /></Row>
          <Row label="Grows by" hint={['Grows by', 'Added to the multiplier after every tumble. 0 keeps it fixed.']}><ChipRow value={f.step} label="Ladder step" test="ladder-step" options={[[0, 'Fixed'], [1, '+1'], [2, '+2'], [3, '+3'], [5, '+5']] as const} onChange={(step) => set({ step })} /></Row>
          <Row label="Up to"><span className="row tight"><Num w={90} min={f.start} max={500} step={1} value={f.max} label="Ladder maximum" onChange={(n) => set({ max: Math.max(f.start, Math.round(n)) })} /><span className="muted">x</span></span></Row>
          <p className="muted small">It applies to every win of the spin. In a bonus it goes back to the start on every free spin; in the base game it lasts for the tumbles of one round.</p>
        </>
      );
    case 'lives':
      return (
        <>
          <Row label="Lives" hint={['Lives', 'Every free spin without a win costs one life. When none is left the bonus ends, even if free spins remain, and it cannot be retriggered.']}><ChipRow value={f.lives} label="Lives" test="lives" options={[[1, '1'], [2, '2'], [3, '3'], [5, '5']] as const} onChange={(lives) => set({ lives })} /></Row>
          <p className="muted small">Free spins and purchased bonuses only. The free spins you set are the most the bonus can last.</p>
        </>
      );
    case 'shuffle':
      return <p className="muted small">The ordinary symbols change places at random. Scatters, wilds and multipliers stay put. It changes wins only in cluster, paylines and ways games. Use the trigger to decide when it happens.</p>;
    case 'bonusMultiplier':
      return (
        <>
          <Row label="Starts at" hint={['Starts at', 'The bonus multiplier on the first free spin.']}><ChipRow value={f.start} label="Bonus multiplier start" test="bm-start" options={[[1, '1x'], [2, '2x'], [3, '3x'], [5, '5x']] as const} onChange={(start) => set({ start, max: Math.max(f.max, start) })} /></Row>
          <Row label="Grows by" hint={['Grows by', 'Added after every free spin that wins. 0 keeps it fixed.']}><ChipRow value={f.step} label="Bonus multiplier step" test="bm-step" options={[[0, 'Fixed'], [1, '+1'], [2, '+2'], [3, '+3'], [5, '+5']] as const} onChange={(step) => set({ step })} /></Row>
          <Row label="Up to"><span className="row tight"><Num w={90} min={f.start} max={500} step={1} value={f.max} label="Bonus multiplier maximum" onChange={(n) => set({ max: Math.max(f.start, Math.round(n)) })} /><span className="muted">x</span></span></Row>
          <p className="muted small">It is kept from one free spin to the next and applies to every win. Free spins and purchased bonuses only.</p>
        </>
      );
    case 'removeSymbols':
      return (
        <>
          <Row label="Swapped out" hint={['Swapped out', 'These symbols are replaced by other paying symbols, picked by how often they appear on the reels.']}><ChipRow value={f.target} label="Which symbols are swapped" test="remove-target" options={[['lowest', 'The lowest symbol'], ['low', 'The lower half']] as const} onChange={(target) => set({ target })} /></Row>
          <p className="muted small">Scatters, wilds and multipliers are never changed. Use the trigger to decide when it happens.</p>
        </>
      );
    case 'prizeAward':
      return (
        <>
          <Row label="Prize values (x bet)" hint={['Prize values', 'When the prize fires, one of these amounts (as a multiple of the bet) is added to the win. The weight is how likely it is. Whole numbers only.']}>
            <Weights counts={f.values} unit="x" label="Weight of prize value" onChange={(values) => set({ values })} /></Row>
          <p className="muted small">The prize is added after the multipliers and is not changed by them. Set how often it fires in the trigger.</p>
        </>
      );
    case 'wildMultiplier':
      return (
        <>
          <Row label="Wild values" hint={['Wild values', 'Each wild that lands carries one of these multipliers. The weight is how likely it is.']}>
            <Weights counts={f.values} unit="x" label="Weight of wild multiplier" onChange={(values) => set({ values })} /></Row>
          <Row label="Several wilds in a win" hint={['Combine', 'Add: 2x and 3x give 5x. Multiply: 2x and 3x give 6x.']}><ChipRow value={f.combine} label="How wild values combine" test="wm-combine" options={[['add', 'Add them'], ['multiply', 'Multiply them']] as const} onChange={(combine) => set({ combine })} /></Row>
          <p className="muted small">The value stays with the {wild} while it tumbles down. A win without a {wild} is not changed.</p>
        </>
      );
    case 'colossalWild':
      return (
        <>
          <Row label="Block size" hint={['Block size', 'The block is a square of wilds, placed anywhere it fits without covering scatters or multipliers.']}><ChipRow value={f.size} label="Colossal wild size" test="colossal-size" options={[[2, '2 x 2'], [3, '3 x 3'], [4, '4 x 4']] as const} onChange={(size) => set({ size })} /></Row>
          <p className="muted small">Use a small chance in the trigger to keep it rare.</p>
        </>
      );
    case 'holdAndWin':
      return (
        <>
          <Row label="Orbs at the start" hint={['Orbs at the start', 'Each time the round starts, one of these amounts of orbs is locked on the grid. The weight is how likely that amount is.']}>
            <Weights counts={f.counts} unit="orbs" label="Weight of starting orbs" onChange={(counts) => set({ counts })} /></Row>
          <Row label="Chance for each empty cell" hint={['Chance', 'On every respin each empty cell rolls this chance to fill with a new orb.']}>
            <span className="row tight"><Num w={90} min={1} max={50} step={1} value={Math.round(f.landChance * 100)} label="Chance for each empty cell (%)" onChange={(n) => set({ landChance: Math.min(0.5, Math.max(0.01, n / 100)) })} /><span className="muted">%</span></span></Row>
          <Row label="Respins" hint={['Respins', 'The round starts with this many respins. Every new orb puts them back to this number.']}>
            <ChipRow value={f.respins} label="Respins" test="hw-respins" options={[[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']] as const} onChange={(respins) => set({ respins })} /></Row>
          <Row label="Orb values (x bet)" hint={['Orb values', 'Each orb shows one of these cash values, as a multiple of the bet. The weight is how likely it is. Whole numbers only.']}>
            <Weights counts={f.values} unit="x" label="Weight of orb value" onChange={(values) => set({ values })} /></Row>
          <Row label="Full grid" hint={['Full grid', 'When every cell fills with an orb, the total is multiplied by this. 1x means no bonus.']}>
            <ChipRow value={f.fullMult} label="Full grid multiplier" test="hw-full" options={[[1, 'None'], [2, '2x'], [3, '3x'], [5, '5x'], [10, '10x']] as const} onChange={(fullMult) => set({ fullMult })} /></Row>
          <p className="muted small">The orbs are paid on top of the spin's win and are not changed by multipliers. It can start in any place; to keep it rare use a small chance in the trigger.</p>
        </>
      );
    case 'gadgetPanel': return <></>; // the top gadget bar has its own editor (mechanics.tsx)
  }
}
