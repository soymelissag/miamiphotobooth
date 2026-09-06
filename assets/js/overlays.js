/**
 * Strip frames offered to guests, in the order they appear in the picker.
 *
 * To add your own: export a 600 x 1800 PNG with a transparent background,
 * drop it in the /overlays folder, and add a line here. That's the only
 * file you need to touch. See overlays/README.md for the exact geometry.
 *
 *   id     - short unique key, lowercase, no spaces
 *   label  - what guests see on the button
 *   src    - path to the full-strip artwork, or null for no frame
 *   footer - optional wordmark centred in the plate below the last photo.
 *            Takes an optional `width` in strip pixels (default 540).
 *   paper  - optional texture over the whole finished strip. `opacity` dials
 *            it back; `blend` is any canvas blend mode. Note that a multiply
 *            texture has to carry dark pixels to do anything at all.
 *   stamps - optional small graphics, one per photo, top to bottom. Entry 1
 *            lands on the first photo, entry 2 on the second, and so on; a
 *            photo with no entry simply gets no stamp. Each takes an optional
 *            `corner` ('top-left', 'top-right', 'bottom-left', 'bottom-right'),
 *            `height` in strip pixels, and `inset` from the photo edge.
 */
const OVERLAYS = [
    {
        id: 'classic',
        label: 'Classic',
        src: 'overlays/classic.svg',
        footer: { src: 'overlays/wordmark.png' },
        // Full strength buries faces in fibre; this reads as printed stock.
        paper: { src: 'overlays/paper-multiply.png', blend: 'multiply', opacity: 0.2 },
        stamps: [
            { src: 'overlays/stamp-tropical-park.png' },
            { src: 'overlays/stamp-burdines.png' },
            { src: 'overlays/stamp-frankies.png' },
            { src: 'overlays/stamp-cereal-bowl.png', corner: 'top-left' }
        ]
    },
    { id: 'none', label: 'No frame', src: null }
];
