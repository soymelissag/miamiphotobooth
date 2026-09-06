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
        stamps: [
            { src: 'overlays/stamp-hill.png' }
            // Three more slots free — add one per photo as the artwork lands.
        ]
    },
    { id: 'miami',   label: 'Miami',   src: 'overlays/miami.svg' },
    { id: 'none',    label: 'No frame', src: null }
];
