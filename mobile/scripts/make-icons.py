from pathlib import Path
from PIL import Image, ImageDraw

STEEL = (31, 35, 38, 255)
YELLOW = (240, 196, 25, 255)
WHITE = (255, 255, 255, 255)
OUT = Path(__file__).resolve().parent.parent / 'assets' / 'images'

def mark(draw, cx, cy, size, stroke, colour=YELLOW, bar=WHITE):
    h = size; w = size * 0.95; arm = size * 0.2
    left, right, top, bottom = cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2
    for x, d in ((left, 1), (right, -1)):
        draw.rectangle([min(x, x + d * stroke), top, max(x, x + d * stroke), bottom], fill=colour)
        for y in (top, bottom - stroke):
            draw.rectangle([min(x, x + d * arm), y, max(x, x + d * arm), y + stroke], fill=colour)
    if bar:
        bw = w * 0.42; bh = stroke * 1.1
        draw.rectangle([cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2], fill=bar)

def icon(size, bg=STEEL, scale=0.5, colour=YELLOW, bar=WHITE):
    img = Image.new('RGBA', (size, size), bg if bg else (0, 0, 0, 0))
    mark(ImageDraw.Draw(img), size / 2, size / 2, size * scale, size * scale * 0.09, colour, bar)
    return img

icon(1024).save(OUT / 'icon.png')
icon(512, bg=None, scale=0.36).save(OUT / 'android-icon-foreground.png')
Image.new('RGBA', (512, 512), STEEL).save(OUT / 'android-icon-background.png')
icon(432, bg=None, scale=0.4, colour=WHITE, bar=WHITE).save(OUT / 'android-icon-monochrome.png')
icon(288, bg=None, scale=0.62).save(OUT / 'splash-icon.png')
icon(48).save(OUT / 'favicon.png')

def tab(name, painter):
    for factor, suffix in ((1, ''), (2, '@2x'), (3, '@3x')):
        s = 24 * factor; k = factor * 4
        img = Image.new('RGBA', (s * 4, s * 4), (0, 0, 0, 0))
        painter(ImageDraw.Draw(img), 4 * factor, 2 * k)
        img.resize((s, s), Image.LANCZOS).save(OUT / 'tabIcons' / f'{name}{suffix}.png')

def line(d, pts, u, w):
    d.line([(x * u, y * u) for x, y in pts], fill=WHITE, width=w, joint=None)

def plan(d, u, w):
    d.rectangle([3 * u, 5 * u, 21 * u, 19 * u], outline=WHITE, width=w)
    for x in (9, 15): line(d, [(x, 5), (x, 19)], u, w)
    line(d, [(3, 9), (21, 9)], u, w)

def session(d, u, w):
    line(d, [(2, 12), (22, 12)], u, w)
    for x in (6, 18): d.rectangle([(x - 1.2) * u, 7 * u, (x + 1.2) * u, 17 * u], fill=WHITE)

def progress(d, u, w):
    line(d, [(3, 6), (21, 10.5)], u, w); line(d, [(3, 18), (21, 13.5)], u, w)
    line(d, [(3, 12), (21, 12)], u, max(1, w // 2))

def import_(d, u, w):
    line(d, [(12, 3), (12, 14)], u, w); line(d, [(7.5, 9.5), (12, 14), (16.5, 9.5)], u, w)
    line(d, [(4, 15), (4, 20), (20, 20), (20, 15)], u, w)

def profile(d, u, w):
    mark(d, 12 * u, 12 * u, 16 * u, w, WHITE, None)
    d.ellipse([10 * u, 10 * u, 14 * u, 14 * u], fill=WHITE)

for name, painter in (('plan', plan), ('session', session), ('progress', progress), ('import', import_), ('profile', profile)):
    tab(name, painter)
print('icons written to', OUT)
