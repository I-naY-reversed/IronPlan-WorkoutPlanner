import subprocess, sys
SP = sys.argv[1]
GLYPH = '''<rect x="150" y="486" width="724" height="52" fill="{bar}"/>
<path d="M268 256h104v47h-57v419h57v47H268z" fill="{plate}"/>
<path d="M756 256H652v47h57v419h-57v47h104z" fill="{plate}"/>'''
H = 513
def svg(size, glyph_h, centre, bg=None, bar='#FFFFFF', plate='#F0C419'):
    s = glyph_h / H
    tx, ty = centre[0] - 512 * s, centre[1] - 512.5 * s
    back = f'<rect width="{size}" height="{size}" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">{back}<g transform="translate({tx} {ty}) scale({s})">{GLYPH.format(bar=bar, plate=plate)}</g></svg>'
assets = {
    'icon.png': (1024, 513, (512, 512.5), '#1F2326', {}),
    'android-icon-foreground.png': (512, 186, (256, 256), None, {}),
    'android-icon-monochrome.png': (432, 174, (216, 216), None, {'bar': '#FFFFFF', 'plate': '#FFFFFF'}),
    'splash-icon.png': (288, 180, (144, 144), None, {}),
    'favicon.png': (48, 25, (24, 24.5), '#1F2326', {}),
}
for name, (size, gh, c, bg, colours) in assets.items():
    path = f'{SP}/icons/{name}.svg'
    open(path, 'w').write(svg(size, gh, c, bg, **colours))
    subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), path, '-o', f'{SP}/icons/{name}'], check=True)
print('ok')
