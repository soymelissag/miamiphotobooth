# Miami Photobooth

A photobooth that runs on the guest's own phone. They scan a QR code, take four
shots, and get a classic 2×6 strip with your frame on it — saved straight to
their camera roll.

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
| `COUNTDOWN_FROM` | Seconds counted before each shot (3) |
| `MIRROR` | Whether photos save mirrored, matching the viewfinder |

## Notes for running an event

- **Test on the actual phones first.** iOS and Android both prompt for camera
  permission; a guest who taps "Don't Allow" has to fix it in browser settings.
- **Strips are not saved anywhere.** If a guest closes the tab before saving,
  their strip is gone. The copy in section 5 says so.
- Works offline once loaded, so patchy event wifi only affects the first load.
