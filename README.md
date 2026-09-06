# Westofchester’s Photo Booth

A photobooth that runs on the guest's own phone. They scan a QR code, take four
shots, and get a classic 2×6 strip with your frame on it — saved straight to
their camera roll.

Each shot is a separate tap, so guests set their own pace and can undo one they
don't like. Nothing fires on its own and there is no flash.

No app to install, no backend, no accounts. Everything happens in the browser:
the photos are composited on the phone and never leave it.

## Running it locally

The camera only works over HTTPS or on `localhost`, so you need a server —
opening `index.html` by double-clicking will not work.

```sh
python3 -m http.server 8777
```

Then open <http://localhost:8777>. On a laptop it'll use the webcam, which is
fine for checking layout and frames. Any free port works — 8000 is already in
use on this machine.

To try it on your actual phone, deploy it (below) — phones on your wifi hitting
your laptop's IP address count as an insecure origin and get blocked.

## Deploying

Any static host works. The repo is plain HTML, CSS, and JS with no build step.

**GitHub Pages** — in the repo settings, Pages → Build from branch → `main` /
root. It lands at `https://soymelissag.github.io/miamiphotobooth/`.

**Vercel or Netlify** — import the repo, no build command, publish directory `.`.

Both give you HTTPS automatically, which is the part that matters. Generate a QR
code pointing at the URL and put it on the table.

## Making your own frames

See [overlays/README.md](overlays/README.md) for the canvas size, the exact photo
window coordinates, and how to register a new frame. Short version: export a
600 × 1800 transparent PNG, drop it in `overlays/`, add one line to
`assets/js/overlays.js`.

The two frames in there now are placeholders — replace them.

## Layout of the code

```
index.html              The five-section accordion and the camera module
assets/css/booth.css    All styling; the palette lives in :root
assets/js/overlays.js   The list of frames guests can pick — edit this
assets/js/booth.js      Camera, countdown, capture, compositing, saving
overlays/               Frame artwork
```

Things you might want to change, all near the top of `assets/js/booth.js`:

| Setting | Does what |
|---|---|
| `STRIP` | Strip dimensions and photo window geometry |
| `SHOT_COUNT` | How many photos per strip (4) |
| `COUNTDOWN_FROM` | Count before each shot (3); set to `0` to fire instantly |
| `MIRROR` | Whether photos save mirrored, matching the viewfinder |
| `PHOTO_LOOK` | The vintage black-and-white grade on the photos |
| `POSTER` | The 4:5 image guests actually save |

## What gets saved

Guests don't save the bare strip — they save a **1080 × 1350** poster, the 4:5
shape Instagram wants for a portrait post. The strip is still built at full
600 × 1800 and only scaled on the way in, so nothing is lost.

`POSTER.strip` places it on the artwork:

| | |
|---|---|
| `heightRatio` | Strip height as a fraction of the poster, before rotation |
| `centreX` / `centreY` | Where the strip's centre sits, as fractions |
| `angle` | Tilt in degrees. Negative leans the top to the left |

It rotates about the strip's own centre, so changing `angle` pivots it in
place rather than swinging it across the poster.

Set `enabled: false` to go back to saving the bare 600 × 1800 strip.

The background is `overlays/poster-bg.png`, sized to match. To restyle it,
export a new 4:5 image at 1080 × 1350 and leave room for the strip — it lands
down the middle at a slight tilt.

`PHOTO_LOOK` only touches the photos — stamps, frame and wordmark composite
afterwards and keep their colour. Set `enabled: false` for straight colour.
The knobs worth turning:

| | |
|---|---|
| `contrast` | Higher is punchier; `1` leaves the curve alone |
| `blackPoint` / `whitePoint` | How far the print stops short of black and white. Widen to `0`/`255` for a crisp digital look |
| `tone` | Per-channel multipliers. The default leans warm; make all three `1` for neutral grey, or raise `r` and drop `b` for stronger sepia |
| `vignette` | Corner darkening, `0` to switch off |

The viewfinder previews the grade with a CSS `filter` in `booth.css`. That's an
approximation of the canvas grade, not the same maths — if you change the look
substantially, nudge the filter to match or drop it so guests see plain colour.

## Notes for running an event

- **Test on the actual phones first.** iOS and Android both prompt for camera
  permission; a guest who taps "Don't Allow" has to fix it in browser settings.
- **Strips are not saved anywhere.** If a guest closes the tab before saving,
  their strip is gone. The fine print under the save button says so.
- Works offline once loaded, so patchy event wifi only affects the first load.
