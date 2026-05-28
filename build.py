#!/usr/bin/env python3
"""Build investtrack-standalone.html by inlining CSS and JS into index.html."""
import re, os

BASE = os.path.dirname(os.path.abspath(__file__))

def read(path):
    with open(os.path.join(BASE, path), encoding='utf-8') as f:
        return f.read()

html = read('index.html')

# Replace <link rel="stylesheet" href="css/style.css"> with inlined <style>
css = read('css/style.css')
html = html.replace(
    '<link rel="stylesheet" href="css/style.css">',
    f'<style>\n{css}\n</style>'
)

# JS files in load order (same as index.html script tags)
JS_ORDER = [
    'js/storage.js', 'js/utils.js', 'js/charts.js', 'js/period-filter.js',
    'js/investments.js', 'js/expenses.js', 'js/revenues.js', 'js/flux.js',
    'js/comparisons.js', 'js/categories.js', 'js/data-entry.js',
    'js/budget.js', 'js/patrimony.js', 'js/app.js',
]

# Remove existing <script src="..."> tags and replace with inlined versions
for js_path in JS_ORDER:
    filename = js_path.split('/')[-1]
    html = re.sub(rf'\s*<script src="{re.escape(js_path)}"></script>', '', html)

# Find where to insert scripts (before </body>)
inlined = '\n'.join(f'<script>\n{read(p)}\n</script>' for p in JS_ORDER)
html = html.replace('</body>', f'{inlined}\n</body>')

out = os.path.join(BASE, 'investtrack-standalone.html')
with open(out, 'w', encoding='utf-8') as f:
    f.write(html)

print(f"Built {out} ({len(html)} chars)")
