"""Скачивает шрифты Google Fonts в fonts/ и пишет css/fonts.css, чтобы приложение работало без интернета.
Запуск: python3 android/fetch_fonts.py (нужен curl)."""
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (
    'https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700'
    '&family=Unbounded:wght@500;600&family=JetBrains+Mono:wght@400;600&family=Noto+Music&display=swap'
)
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
KEEP = {'cyrillic', 'latin', 'music'}


def curl(url, out=None):
    args = ['curl', '-sSfL', '--max-time', '60', '-A', UA, url]
    if out:
        args += ['-o', str(out)]
        subprocess.run(args, check=True)
        return None
    return subprocess.run(args, check=True, capture_output=True).stdout.decode('utf-8')


css = curl(URL)
blocks = re.findall(r'/\*\s*([\w-]+)\s*\*/\s*(@font-face\s*{[^}]*})', css)
fonts = ROOT / 'fonts'
fonts.mkdir(exist_ok=True)
out = ['/* Шрифты лежат внутри приложения: Golos Text, Unbounded, JetBrains Mono, Noto Music (лицензия SIL OFL). */']
seen = {}
for subset, block in blocks:
    if subset not in KEEP:
        continue
    fam = re.search(r"font-family:\s*'([^']+)'", block).group(1)
    url = re.search(r'url\((https://[^)]+\.woff2)\)', block).group(1)
    if url not in seen:
        name = re.sub(r'[^a-z0-9]+', '-', fam.lower()).strip('-') + '-' + subset + '-' + str(len(seen)) + '.woff2'
        curl(url, fonts / name)
        seen[url] = name
        print(name, (fonts / name).stat().st_size // 1024, 'KB')
    out.append(block.replace(url, '../fonts/' + seen[url]))
(ROOT / 'css' / 'fonts.css').write_text('\n'.join(out) + '\n', encoding='utf-8')
print('css/fonts.css:', len(out) - 1, 'начертаний')
