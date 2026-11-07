"""Draw the correct (check) and fault (cross) badges as small anti-aliased PNGs.

Pure Python with no dependencies: shapes are signed distance fields, written
with zlib, so the badge looks the same on every machine.
"""

import math
import struct
import zlib
from pathlib import Path

COLOURS = {'check': (34, 197, 94), 'cross': (239, 68, 68)}


def _seg(px, py, ax, ay, bx, by):
    vx, vy, wx, wy = bx - ax, by - ay, px - ax, py - ay
    t = max(0.0, min(1.0, (wx * vx + wy * vy) / (vx * vx + vy * vy)))
    return math.hypot(wx - vx * t, wy - vy * t)


def draw(kind, size=76):
    r = size / 2 - 1.5
    c = size / 2
    stroke = size * 0.085
    if kind == 'check':
        segs = [(0.30, 0.52, 0.44, 0.66), (0.44, 0.66, 0.71, 0.36)]
    else:
        segs = [(0.34, 0.34, 0.66, 0.66), (0.66, 0.34, 0.34, 0.66)]
    segs = [tuple(v * size for v in s) for s in segs]
    fill = COLOURS[kind]
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            px, py = x + 0.5, y + 0.5
            disc = max(0.0, min(1.0, r - math.hypot(px - c, py - c) + 0.5))
            ring = max(0.0, min(1.0, (r + 1.5) - math.hypot(px - c, py - c) + 0.5))
            mark = max(0.0, min(1.0, stroke / 2 - min(_seg(px, py, *s) for s in segs) + 0.5))
            col = [fill[i] * (1 - mark) + 255 * mark for i in range(3)]
            # A thin dark outline keeps the disc readable on the clay figure too.
            alpha = disc + (ring - disc) * 0.55
            if ring > disc:
                k = disc / ring if ring else 0
                col = [v * k + 12 * (1 - k) for v in col]
            row += bytes([int(round(v)) for v in col]) + bytes([int(round(alpha * 255))])
        rows.append(bytes(row))
    return size, b''.join(rows)


def write_png(path, kind, size=76):
    size, raw = draw(kind, size)

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    path = Path(path)
    path.write_bytes(png)
    return path
