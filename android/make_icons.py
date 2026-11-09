"""Рисует значки приложения «Второй голос» (нужен Pillow): python3 android/make_icons.py"""
import pathlib

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
VIOLET = (90, 61, 216, 255)
TOP = (255, 255, 255, 150)
BOTTOM = (255, 255, 255, 255)
# Знак из шапки: viewBox 48×30, верхний ряд — мелодия, нижний — второй голос.
BARS = [
    (1, 3, 13, 6, TOP), (17, 1, 13, 6, TOP), (33, 5, 14, 6, TOP),
    (1, 15, 13, 7, BOTTOM), (17, 13, 13, 7, BOTTOM), (33, 17, 14, 7, BOTTOM),
]


def icon(size, mark_width, shape='square', pad=0.0):
    """shape: square — заливка до краёв; rounded — скруглённый квадрат с прозрачными углами."""
    s = size * 4
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    p = int(s * pad)
    if shape == 'rounded':
        d.rounded_rectangle((p, p, s - p - 1, s - p - 1), radius=int((s - 2 * p) * 0.22), fill=VIOLET)
    else:
        d.rectangle((0, 0, s, s), fill=VIOLET)
    k = s * mark_width / 48
    ox = (s - 48 * k) / 2
    oy = (s - 30 * k) / 2 + k * 0.5
    layer = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    for x, y, w, h, col in BARS:
        ld.rounded_rectangle((ox + x * k, oy + y * k, ox + (x + w) * k, oy + (y + h) * k), radius=h * k / 2, fill=col)
    im = Image.alpha_composite(im, layer)
    return im.resize((size, size), Image.LANCZOS)


def save(img, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)
    print(path.relative_to(ROOT), img.size)


icons = ROOT / 'icons'
save(icon(192, 0.62), icons / 'icon-192.png')
save(icon(512, 0.62), icons / 'icon-512.png')
save(icon(512, 0.5), icons / 'maskable-512.png')
save(icon(180, 0.62).convert('RGB'), icons / 'apple-touch-icon.png')
save(icon(32, 0.8), icons / 'favicon-32.png')
for name, px in [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]:
    save(icon(px, 0.6, 'rounded', 0.06), ROOT / 'android' / 'res' / ('mipmap-' + name) / 'ic_launcher.png')
