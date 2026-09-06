# Designing a strip frame

Your artwork is composited **on top of** the four photos. Anything you leave
transparent shows the photo underneath.

## Canvas

| | |
|---|---|
| Size | **600 × 1800 px** |
| Physical | 2 × 6 in at 300 dpi |
| Format | PNG-24 with alpha (SVG also works) |
| Background | **Transparent** |

## Where the photos land

Four windows, each 540 × 405 px (4:3 landscape), 30 px in from each side:

| Photo | X | Y | Width | Height |
|---|---|---|---|---|
| 1 | 30 | 30 | 540 | 405 |
| 2 | 30 | 453 | 540 | 405 |
| 3 | 30 | 876 | 540 | 405 |
| 4 | 30 | 1299 | 540 | 405 |

The leftover areas are yours to design into:

- **Side margins** — 30 px down each edge
- **Gaps between photos** — 18 px tall, at y = 435, 858, 1281
- **Footer plate** — y = 1704 to 1800, a **96 px** band across the full width

Where nothing is drawn, the strip's base colour shows through (`#F4F4F2`,
set as `STRIP.bg` in `assets/js/booth.js`).

## Keep faces clear

Guests centre themselves in the viewfinder, so the middle of each window is
where heads land. Treat the inner ~70% of every photo window as a no-go zone
and keep type, logos, and heavy graphics on the margins, gaps, and footer.

## Adding your frame

1. Export the PNG into this folder, e.g. `overlays/birthday.png`.
2. Add one line to `assets/js/overlays.js`:

   ```js
   { id: 'birthday', label: 'Birthday', src: 'overlays/birthday.png' },
   ```

3. Reload. The button appears in section 2 automatically.

The order in that array is the order guests see, and the first entry is the
default. A frame that fails to load is skipped — guests still get their photos,
just without the frame.

## Paper texture

`paper` lays a texture over the finished strip — photos, frame, wordmark and
all — so the whole thing reads as one printed object.

```js
paper: { src: 'overlays/paper-multiply.png', blend: 'multiply', opacity: 0.35 }
```

**A multiply texture must contain dark pixels.** White is multiply's identity,
so a texture painted in white at varying opacity — which is how paper overlays
are usually sold and how the source art here was built — multiplies to exactly
nothing. `paper-multiply.png` was generated from that source by mapping its
alpha to darkness: bare areas became white (no change) and opaque areas became
dark (strong darkening). Regenerate it with:

```sh
python3 tools/make-multiply-texture.py "assets/overlays/paper overlay.png" overlays/paper-multiply.png
```

The original art stays in `assets/overlays/`.

`opacity` is the dial worth touching. At `1` the fibre swallows faces; `0.35`
gives tooth without hurting the photo. Raise it for something handmade, drop it
toward `0.15` for a whisper of grain.

## The footer mark

The wordmark in the footer plate is its own layer, not part of the strip
artwork — an SVG drawn to canvas can't pull in an external image, so baking it
into the frame would mean embedding it as base64 and re-exporting the whole
frame every time the wordmark changes.

```js
footer: { src: 'overlays/wordmark.png', width: 540 }
```

`width` is in strip pixels and defaults to 540, matching the photo width. The
height follows your artwork's proportions and it centres itself in the 96 px
plate. It draws above the frame, so a frame with a filled footer plate can't
bury it.

Export it trimmed, with no transparent margin — the same reason as stamps
below. Twice the final size is plenty (the current one is 1080 × 56).

## Stamps

A frame can also carry small graphics that sit *inside* the photos, like a
postage stamp stuck on the print. These are separate from the full-strip
artwork above and you can use either, both, or neither.

Stamps are listed per photo, top to bottom — entry 1 lands on the first photo,
entry 2 on the second. A photo with no entry gets no stamp:

```js
{
    id: 'classic',
    label: 'Classic',
    src: 'overlays/classic.svg',
    stamps: [
        { src: 'overlays/stamp-hill.png' },
        { src: 'overlays/stamp-two.png', corner: 'top-left' },
        { src: 'overlays/stamp-three.png', height: 200 }
    ]
}
```

Each entry takes three optional settings:

| Key | Default | Does what |
|---|---|---|
| `corner` | cycles | `top-left`, `top-right`, `bottom-left`, `bottom-right` |
| `height` | 165 | Height in strip pixels; width follows the artwork's proportions |
| `inset` | 20 | Distance from the photo's edge |

Left alone, stamps cycle through the corners as they go down the strip
(bottom-right, bottom-left, top-right, top-left) so four of them don't stack in
the same spot.

**Export them tight.** Crop right to the edge of the artwork with no
transparent margin — padding is treated as part of the image, so a stamp with
30% empty space around it lands 30% smaller and off-centre. Keep them a few
hundred pixels tall; anything larger is wasted on a 165 px slot and just slows
the page down on event wifi.

Defaults for every stamp live in `STAMP` at the top of `assets/js/booth.js`.

## Changing the strip shape

`STRIP` at the top of `assets/js/booth.js` drives all the numbers above. If you
change it, update this spec to match — the artwork is authored against it.
