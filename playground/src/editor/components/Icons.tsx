/** Inline SVG icons: font-independent, so transport controls never fall back to tofu boxes. */
const base = { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'currentColor', 'aria-hidden': true } as const;
export const PlayIcon = () => <svg {...base}><path d="M4 2.5v11l9-5.5z" /></svg>;
export const PauseIcon = () => <svg {...base}><rect x="3.5" y="2.5" width="3" height="11" rx="1" /><rect x="9.5" y="2.5" width="3" height="11" rx="1" /></svg>;
export const StopIcon = () => <svg {...base}><rect x="3" y="3" width="10" height="10" rx="1.5" /></svg>;
export const ReplayIcon = () => <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8a5 5 0 1 0 1.6-3.7" /><path d="M3 2.5v3h3" /></svg>;
export const UndoIcon = () => <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4 3 7l3 3" /><path d="M3 7h6.5a3.5 3.5 0 0 1 0 7H7" /></svg>;
export const RedoIcon = () => <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m10 4 3 3-3 3" /><path d="M13 7H6.5a3.5 3.5 0 0 0 0 7H9" /></svg>;
