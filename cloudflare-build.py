#!/usr/bin/env python3
"""Build the Git-connected Cloudflare Pages release into dist/."""
import importlib.util
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('vendvision_site', ROOT / 'site.py')
site = importlib.util.module_from_spec(spec)
spec.loader.exec_module(site)

target = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / 'dist'
site.make_pages()
site.build('production', target)

# Pages normalises .html URLs. Serve HTML through the Worker from exact asset keys
# so the established public paths remain canonical during the migration.
storage = target / '__page_html'
storage.mkdir()
pages = {}
for path in sorted(site.PAGES):
    key = path.lstrip('/') + ('index.html' if path.endswith('/') else '')
    asset = '__page_html/' + key.removesuffix('.html').replace('/', '.') + '.bin'
    (target / key).rename(target / asset)
    pages[path] = '/' + asset

settings = {
    'origin': site.ORIGIN,
    'pages': pages,
    'articleRedirects': site.LEGACY_ARTICLES,
    'retiredRoutes': sorted(site.GONE),
}
worker = (ROOT / 'cloudflare-edge.mjs').read_text(encoding='utf-8')
(target / '_worker.js').write_text(
    'const SETTINGS = ' + json.dumps(settings) + ';\n' + worker, encoding='utf-8'
)
