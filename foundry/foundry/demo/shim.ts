// Browser entry, bundled into demo-rgs.js and loaded before the game: answers the game's https://demo.local/... requests in the page,
// so no server is needed. All other requests (the game's own files) go through untouched.
import { handleDemo, newState, type DemoData, type DemoState } from './engine';

const HOST = 'demo.local';

(() => {
  // Diagnostics for the page that frames the demo: errors and blocked loads are reported upward, so a black screen can say why.
  const report = (kind: string, detail: string) => {
    try {
      if (window.parent !== window) window.parent.postMessage({ foundryDemo: { kind, detail: String(detail).slice(0, 300) } }, '*');
    } catch {
      /* no parent to tell */
    }
  };
  const origError = console.error.bind(console);
  let reported = 0;
  console.error = (...args: unknown[]) => {
    if (reported++ < 8) report('console', args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === 'string' ? a : JSON.stringify(a))).join(' ').slice(0, 280));
    origError(...args);
  };
  report('start', location.pathname.split('/').slice(-2).join('/'));
  try {
    const probe = document.createElement('canvas');
    const gl = (probe.getContext('webgl2') as WebGL2RenderingContext | null) ?? (probe.getContext('webgl') as WebGLRenderingContext | null);
    report('info', gl ? (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? 'webgl2 available' : 'webgl1 available') : 'webgl UNAVAILABLE in this frame');
  } catch (e) {
    report('info', `webgl probe failed: ${String(e)}`);
  }
  window.addEventListener('error', (e) => report('error', `${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`));
  window.addEventListener('unhandledrejection', (e) => report('error', `unhandled: ${(e.reason && (e.reason.message || e.reason)) || 'rejection'}`));
  // the game is up and the player is using it: the host page can drop its progress line
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => report('ready', ev), { once: true, capture: true });
  document.addEventListener('securitypolicyviolation', (e) => report('blocked', `${e.violatedDirective}: ${e.blockedURI || 'inline'}`));

  const origFetch = window.fetch.bind(window);
  const params = new URLSearchParams(location.search);

  // Opened without the launch parameters Engine would add: add demo ones (keeps replay parameters when present).
  if (!params.get('sessionID') && !params.get('replay')) {
    params.set('sessionID', 'demo');
    params.set('rgs_url', HOST);
    if (!params.get('lang')) params.set('lang', 'en');
    if (!params.get('device')) params.set('device', /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'desktop');
    location.replace(`${location.pathname}?${params.toString()}`);
    return;
  }

  let dataP: Promise<DemoData> | null = null;
  const load = () => (dataP ??= origFetch(new URL('demo-books.json', document.baseURI).href).then((r) => r.json() as Promise<DemoData>));
  const sessions = new Map<string, DemoState>();
  const social = params.get('social') === 'true';
  const rand = () => {
    const b = new Uint32Array(2);
    crypto.getRandomValues(b);
    return (b[0] * 2097152 + (b[1] >>> 11)) / 9007199254740992;
  };
  const saveKey = 'foundry-demo-balance';
  // Storage can be refused in a framed page (blocked site data, sandboxed frame): fall back to memory so the in-page server never throws.
  const memory = new Map<string, string>();
  const store = {
    get(k: string): string | null {
      try {
        return window.sessionStorage.getItem(k);
      } catch {
        return memory.get(k) ?? null;
      }
    },
    set(k: string, v: string): void {
      try {
        window.sessionStorage.setItem(k, v);
      } catch {
        memory.set(k, v);
      }
    },
    remove(k: string): void {
      try {
        window.sessionStorage.removeItem(k);
      } catch {
        memory.delete(k);
      }
    },
  };

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const prefix = `https://${HOST}`;
    if (!url.startsWith(prefix)) return origFetch(input, init);
    const data = await load();
    report('ready', 'rgs');
    const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
    let body: Record<string, unknown> = {};
    try {
      if (typeof init?.body === 'string') body = JSON.parse(init.body);
    } catch {
      /* empty body */
    }
    // a refresh keeps the demo balance (never below one default bet, so the demo cannot get stuck)
    const sid = typeof body.sessionID === 'string' ? body.sessionID : '';
    if (sid && !sessions.has(sid) && url.endsWith('/wallet/authenticate')) {
      const st = newState(data);
      const saved = Number(store.get(saveKey));
      if (saved >= 1_000_000) st.balance = saved;
      sessions.set(sid, st);
    }
    const r = handleDemo(data, sessions, method, url.slice(prefix.length).split('?')[0], body, rand, social);
    const st = sessions.get(sid);
    if (st) store.set(saveKey, String(st.balance));
    return new Response(JSON.stringify(r.json), { status: r.status, headers: { 'content-type': 'application/json' } });
  };
})();
