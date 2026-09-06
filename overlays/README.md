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

## Changing the strip shape

`STRIP` at the top of `assets/js/booth.js` drives all the numbers above. If you
change it, update this spec to match — the artwork is authored against it.
