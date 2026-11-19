#!/usr/bin/env python3
"""Moves the inline application script of a built Foundry game page (SvelteKit adapter-static index.html) into app.js.

Why: the artifact platform's publish guard rejected the 1.2 MB index.html (a "review page" heuristic that fires on the combined content of a
large single page; the same happened to the playground, see split-artifact-for-publish.py). With the bundle in its own file the page is accepted.
The script tag stays where it was, so `document.currentScript.parentElement` (used by the SvelteKit start code) still points at the same element.

Usage: python3 scripts/split-game-for-artifact.py <game build dir>      (rewrites index.html, writes app.js next to it)
"""
import os, re, sys

d = sys.argv[1]
p = os.path.join(d, 'index.html')
s = open(p, encoding='utf-8').read()
m = re.search(r'<script>\s*\{\s*__sveltekit_\w+ = \{', s)
if not m:
    raise SystemExit('no inline SvelteKit start script found (already split?)')
start = m.start()
end = s.index('</script>', start)
js = s[start + len('<script>'):end]
open(os.path.join(d, 'app.js'), 'w', encoding='utf-8').write(js.strip() + '\n')
open(p, 'w', encoding='utf-8').write(s[:start] + '<script src="./app.js"></script>' + s[end + len('</script>'):])
print(f'app.js {len(js)} chars, index.html now {len(s) - len(js)} bytes')
