import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AssetsProvider } from './library';

/** A crash must never leave a blank page: say what happened and offer the way back (the saved games are not touched). */
class Boundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) { return { error: e instanceof Error ? e.message : String(e) }; }
  render() {
    if (this.state.error === null) return this.props.children;
    return (
      <div className="shell start" data-testid="crash">
        <h1 className="hero" style={{ fontSize: 34 }}>Something went wrong.</h1>
        <p className="lead">The builder hit an error and stopped. Your saved games are still in this browser and nothing was deleted.</p>
        <pre className="doc" style={{ maxWidth: 640, whiteSpace: 'pre-wrap' }}>{this.state.error}</pre>
        <div className="row">
          <button className="primary" onClick={() => location.reload()}>Reload</button>
          <button onClick={() => { try { localStorage.removeItem('foundry-builder-area-v1'); } catch { /* nothing to clear */ } location.reload(); }}>Reload from the games list</button>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(<Boundary><AssetsProvider><App /></AssetsProvider></Boundary>);
