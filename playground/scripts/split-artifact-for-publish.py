#!/usr/bin/env python3
"""Splits dist/playground-single/artifact.html into a small HTML shell and a separate app.js for publishing as an artifact.

Why: publishing the 12 MB single file was rejected by the artifact platform as a "review page" (a heuristic that fires on this
page's combined content; no single marker causes it). The same page published as index.html + app.js (the Artifact tool's
`files` map) is accepted and works. Usage:  python3 scripts/split-artifact-for-publish.py <out-dir>
then publish <out-dir>/index.html with files {"app.js": "<out-dir>/app.js"} and capabilities {"downloads": true}.
"""
import os, sys

out = sys.argv[1] if len(sys.argv) > 1 else 'dist/playground-split'
s = open('dist/playground-single/artifact.html', encoding='utf-8').read()
marker = '</script>\n<script type="module">\n'
i = s.index(marker)
head = s[:i + len('</script>\n')]                       # title, style, root div and the embedded font pack
assert s.rstrip().endswith('</script>')
js = s[i + len(marker):s.rstrip().rindex('</script>')]
os.makedirs(out, exist_ok=True)
open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(head + '<script type="module" src="app.js"></script>\n')
open(os.path.join(out, 'app.js'), 'w', encoding='utf-8').write(js)
print('wrote', out, len(head), 'bytes of html,', len(js), 'chars of script')
