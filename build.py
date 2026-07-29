#!/usr/bin/env python3
"""Build investtrack-standalone.html by inlining CSS and JS into index.html."""
import re, os

BASE = os.path.dirname(os.path.abspath(__file__))

def read(path):
    with open(os.path.join(BASE, path), encoding='utf-8') as f:
        return f.read()

html = read('index.html')

# Inline CSS
css = read('css/style.css')
html = html.replace(
    '<link rel="stylesheet" href="css/style.css">',
    f'<style>\n{css}\n</style>'
)

# Collect all local JS files referenced in index.html (in document order)
js_refs = re.findall(r'<script src="(js/[^"]+\.js)"></script>', html)

# Remove all <script src="js/..."> tags from html
html = re.sub(r'\s*<script src="js/[^"]+\.js"></script>', '', html)

# Inline each JS file before </body>
inlined = '\n'.join(f'<script>\n{read(p)}\n</script>' for p in js_refs)
html = html.replace('</body>', f'{inlined}\n</body>')

out = os.path.join(BASE, 'investtrack-standalone.html')
with open(out, 'w', encoding='utf-8') as f:
    f.write(html)

print(f"Built {out} ({len(html)} chars)")
