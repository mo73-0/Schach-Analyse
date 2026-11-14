"""Builds ../index.html (GitHub Pages version) from the sources in this folder.
Run:  python3 src/build.py   (from the repository root)"""
import os
here = os.path.dirname(os.path.abspath(__file__))
t = open(os.path.join(here, 'template.html')).read()
t = t.replace('<!--HEAD-->',
  '<link rel="manifest" href="manifest.webmanifest">\n'
  '<link rel="apple-touch-icon" href="apple-touch-icon.png">\n'
  '<meta name="apple-mobile-web-app-title" content="Schach-Analyse">\n'
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">')
t = t.replace('/*FLAGS*/', 'window.SA_EXTERNAL=true;if("serviceWorker" in navigator)addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));')
for k, f in [('CHESS', 'chess.js'), ('PIECES', 'pieces.js'), ('ANALYSIS', 'analysis.js'), ('APP', 'app.js')]:
    t = t.replace('/*%s*/' % k, open(os.path.join(here, f)).read().replace('</script', '<\\/script'))
root = os.path.join(here, '..')
open(os.path.join(root, 'index.html'), 'w').write(t)
print('index.html', len(t))

# Offline cache version: hash of every cache-first asset (everything the service worker
# caches except index.html, which is always fetched fresh). Changing the engine, icons or
# manifest therefore automatically gives the service worker a new cache name -> phones update.
import hashlib, re
sw_path = os.path.join(root, 'sw.js')
sw = open(sw_path).read()
core = re.search(r"const CORE = \[(.*?)\];", sw, re.S).group(1)
assets = [a for a in re.findall(r"'\./([^']+)'", core) if a and a != 'index.html']
h = hashlib.sha256()
for a in sorted(assets):
    h.update(a.encode()); h.update(open(os.path.join(root, a), 'rb').read())
version = h.hexdigest()[:10]
sw = re.sub(r"const CACHE = '[^']*';", "const CACHE = 'sa-%s';" % version, sw)
open(sw_path, 'w').write(sw)
print('sw cache', version)
