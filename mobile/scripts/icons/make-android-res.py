import subprocess, sys, os
SP, RES = sys.argv[1], sys.argv[2]
GLYPH = '''<rect x="150" y="486" width="724" height="52" fill="{bar}"/>
<path d="M268 256h104v47h-57v419h57v47H268z" fill="{plate}"/>
<path d="M756 256H652v47h57v419h-57v47h104z" fill="{plate}"/>'''
def svg(size, share, bg=None, circle=False, bar='#F9F4EE', plate='#8EB1F1'):
    s = share * size / 513
    tx, ty = size / 2 - 512 * s, size / 2 - 512.5 * s
    back = ''
    if bg and circle: back = f'<circle cx="{size/2}" cy="{size/2}" r="{size/2}" fill="{bg}"/>'
    elif bg: back = f'<rect width="{size}" height="{size}" fill="{bg}"/>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">{back}<g transform="translate({tx} {ty}) scale({s})">{GLYPH.format(bar=bar, plate=plate)}</g></svg>'
def render(text, out, size):
    tmp = f'{SP}/icons/tmp.svg'
    open(tmp, 'w').write(text)
    png = out if out.endswith('.png') else f'{SP}/icons/tmp.png'
    subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), tmp, '-o', png], check=True)
    if out.endswith('.webp'):
        subprocess.run(['magick', png, '-define', 'webp:lossless=true', out], check=True)
dens = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for d, k in dens.items():
    m = f'{RES}/mipmap-{d}'
    render(svg(int(108 * k), 158 / 432), f'{m}/ic_launcher_foreground.webp', int(108 * k))
    render(svg(int(108 * k), 174 / 432, bar='#FFFFFF', plate='#FFFFFF'), f'{m}/ic_launcher_monochrome.webp', int(108 * k))
    render(svg(int(48 * k), 96 / 192, bg='#16191C'), f'{m}/ic_launcher.webp', int(48 * k))
    render(svg(int(48 * k), 96 / 192, bg='#16191C', circle=True), f'{m}/ic_launcher_round.webp', int(48 * k))
    render(svg(int(288 * k), 76 / 288), f'{RES}/drawable-{d}/splashscreen_logo.png', int(288 * k))
print('ok')
