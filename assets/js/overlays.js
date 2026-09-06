/**
 * Strip frames offered to guests, in the order they appear in the picker.
 *
 * To add your own: export a 600 x 1800 PNG with a transparent background,
 * drop it in the /overlays folder, and add a line here. That's the only
 * file you need to touch. See overlays/README.md for the exact geometry.
 *
 *   id    - short unique key, lowercase, no spaces
 *   label - what guests see on the button
 *   src   - path to the artwork, or null for a bare strip with no frame
 */
const OVERLAYS = [
    { id: 'classic', label: 'Classic', src: 'overlays/classic.svg' },
    { id: 'miami',   label: 'Miami',   src: 'overlays/miami.svg' },
    { id: 'none',    label: 'No frame', src: null }
];
