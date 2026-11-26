"""Builds res/kmhh-ce.ico for the handheld from res/kmhh.ico.

Windows CE 6 (MC3190) cannot read PNG-compressed icon images (a Vista addition); kmhh.ico holds only
those, so the shortcut showed a blank icon. This writes classic bitmap (DIB) images, 8 bpp with a
palette, at the two sizes CE uses: 16x16 (Start menu) and 32x32 (desktop). The logo is opaque, so the
AND mask is all zero. Run: python res/make_ce_icon.py
"""
import io, os, struct
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))

def images(path):
    d = open(path, 'rb').read()
    n = struct.unpack('<H', d[4:6])[0]
    out = {}
    for i in range(n):
        w, h, _, _, _, _, size, off = struct.unpack('<BBBBHHII', d[6 + 16 * i:22 + 16 * i])
        out[w or 256] = Image.open(io.BytesIO(d[off:off + size])).convert('RGB')
    return out

def dib8(im):
    w, h = im.size
    q = im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal = (q.getpalette() + [0] * 768)[:768]
    palette = b''.join(bytes([pal[3 * i + 2], pal[3 * i + 1], pal[3 * i], 0]) for i in range(256))
    px = q.tobytes()
    xor = b''.join(px[y * w:(y + 1) * w] for y in range(h - 1, -1, -1))  # bottom-up, w is a multiple of 4
    and_row = ((w + 31) // 32) * 4
    mask = bytes(and_row * h)
    header = struct.pack('<IiiHHIIiiII', 40, w, h * 2, 1, 8, 0, len(xor) + len(mask), 0, 0, 256, 0)
    return header + palette + xor + mask

src = images(os.path.join(HERE, 'kmhh.ico'))
entries = []
for size in (32, 16):
    im = src[size] if size in src else src[256].resize((size, size), Image.LANCZOS)
    entries.append((size, dib8(im)))
off = 6 + 16 * len(entries)
out = struct.pack('<HHH', 0, 1, len(entries))
for size, data in entries:
    out += struct.pack('<BBBBHHII', size, size, 0, 0, 1, 8, len(data), off)
    off += len(data)
out += b''.join(d for _, d in entries)
open(os.path.join(HERE, 'kmhh-ce.ico'), 'wb').write(out)
print('kmhh-ce.ico:', ', '.join('%dx%d 8bpp BMP' % (s, s) for s, _ in entries), len(out), 'bytes')
