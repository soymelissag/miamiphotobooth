#!/usr/bin/env python3
"""Turn a white-on-alpha texture into an opaque greyscale multiply layer.

Paper overlays are normally sold as white paint at varying opacity, meant to
be laid over artwork in Normal or Screen mode. Multiply ignores them entirely,
because white is multiply's identity — every pixel comes out unchanged.

This maps alpha to darkness instead: where the source was bare the output is
white (multiply leaves the strip alone), and where it was opaque the output is
dark (multiply bites). The result is a texture that behaves like a scan of
real paper.

    python3 tools/make-multiply-texture.py source.png overlays/paper-multiply.png [strength]

`strength` scales the darkening before it is baked in, but you almost always
want to leave it at 1.0 and dial the effect with `paper.opacity` in
assets/js/overlays.js instead — that way you can retune without re-exporting.

Needs only the standard library. Sized for a few megapixels; it decodes in
pure Python, so give it a moment on very large sources.
"""
import sys
import zlib
import struct


def decode(path):
    """Minimal PNG reader: 8-bit, non-interlaced, with an alpha channel."""
    data = open(path, 'rb').read()
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise SystemExit('not a png: ' + path)

    pos, idat = 8, []
    w = h = depth = ctype = interlace = None

    while pos < len(data):
        (length,) = struct.unpack('>I', data[pos:pos + 4])
        tag = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + length]
        if tag == b'IHDR':
            w, h, depth, ctype, _, _, interlace = struct.unpack('>IIBBBBB', chunk)
        elif tag == b'IDAT':
            idat.append(chunk)
        elif tag == b'IEND':
            break
        pos += 12 + length

    if depth != 8 or interlace != 0:
        raise SystemExit('need an 8-bit non-interlaced png')
    if ctype not in (4, 6):
        raise SystemExit('source has no alpha channel (colour type %d)' % ctype)

    bpp = 4 if ctype == 6 else 2
    stride = w * bpp
    raw = zlib.decompress(b''.join(idat))

    prev = bytearray(stride)
    rows = []
    i = 0
    for _ in range(h):
        f = raw[i]; i += 1
        line = bytearray(raw[i:i + stride]); i += stride

        if f == 1:
            for x in range(bpp, stride):
                line[x] = (line[x] + line[x - bpp]) & 255
        elif f == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 255
        elif f == 3:
            for x in range(stride):
                a = line[x - bpp] if x >= bpp else 0
                line[x] = (line[x] + ((a + prev[x]) >> 1)) & 255
        elif f == 4:
            for x in range(stride):
                a = line[x - bpp] if x >= bpp else 0
                c = prev[x - bpp] if x >= bpp else 0
                b = prev[x]
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pr) & 255

        rows.append(line)
        prev = line

    return w, h, bpp, rows


def write_grey_png(path, w, h, rows):
    raw = bytearray()
    for row in rows:
        raw.append(0)              # filter type 0 (None)
        raw.extend(row)

    def chunk(tag, payload):
        head = struct.pack('>I', len(payload)) + tag + payload
        return head + struct.pack('>I', zlib.crc32(tag + payload) & 0xffffffff)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 0, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    png += chunk(b'IEND', b'')
    open(path, 'wb').write(png)


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__.strip().splitlines()[0] +
                         '\n\nusage: make-multiply-texture.py SRC DST [strength]')

    src, dst = sys.argv[1], sys.argv[2]
    strength = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0

    w, h, bpp, rows = decode(src)

    out = []
    lo, hi, total = 255, 0, 0
    for row in rows:
        line = bytearray(w)
        for x in range(w):
            v = 255 - int(row[x * bpp + bpp - 1] * strength)
            if v < 0:
                v = 0
            line[x] = v
            if v < lo: lo = v
            if v > hi: hi = v
            total += v
        out.append(line)

    write_grey_png(dst, w, h, out)
    print('wrote %s  %dx%d  grey min=%d max=%d mean=%.1f'
          % (dst, w, h, lo, hi, total / (w * h)))


if __name__ == '__main__':
    main()
