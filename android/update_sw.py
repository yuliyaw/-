"""Вписывает в sw.js список файлов программы и версию (хеш содержимого).
Запуск после любых изменений: python3 android/update_sw.py"""
import hashlib
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
files = ['index.html', 'manifest.webmanifest']
for folder, pattern in [('css', '*.css'), ('js', '*.js'), ('fonts', '*.woff2'), ('icons', '*.png')]:
    files += sorted(str(p.relative_to(ROOT)) for p in (ROOT / folder).glob(pattern))
h = hashlib.sha256()
for f in files:
    h.update(f.encode())
    h.update((ROOT / f).read_bytes())
version = 'vg-' + h.hexdigest()[:10]
sw = (ROOT / 'sw.js').read_text(encoding='utf-8')
sw = re.sub(r"const VERSION = '[^']*';", "const VERSION = '" + version + "';", sw)
sw = re.sub(r'const ASSETS = \[[^\]]*\];', 'const ASSETS = ' + json.dumps(files, ensure_ascii=False, indent=2) + ';', sw, flags=re.S)
(ROOT / 'sw.js').write_text(sw, encoding='utf-8')
print(version, len(files), 'файлов')
