/**
 * Westofchester's Photo Booth — four shots, composited into a classic 2x6
 * strip entirely on the guest's own phone. No uploads, no backend.
 */
(function () {
    'use strict';

    /* ------------------------------------------------------------------ *
     * Configuration
     * ------------------------------------------------------------------ */

    // 2" x 6" strip at 300dpi. Change these and the overlay spec in
    // overlays/README.md together — the artwork is authored against them.
    var STRIP = {
        w: 600,
        h: 1800,
        marginX: 30,
        marginTop: 30,
        cellW: 540,
        cellH: 405,
        gap: 18,
        bg: '#F4F4F2'
    };

    var SHOT_COUNT = 4;
    var DEVELOP_TICK_MS = 45;

    // Per-photo stamps, sized by height so artwork of any proportion sits
    // consistently. Both values are in strip pixels; a photo cell is 540x405.
    var STAMP = {
        height: 165,
        inset: 20
    };

    // Where a stamp lands when its entry doesn't name a corner. Cycling keeps
    // four stamps from stacking in the same spot down the strip.
    var STAMP_CORNERS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];

    // Artwork centred in the plate below the last photo. Kept as its own layer
    // rather than baked into the frame, because an SVG drawn to canvas cannot
    // pull in an external image.
    var FOOTER = { width: 540 };

    // Texture laid over the finished strip. `blend` is a canvas composite
    // mode; `opacity` dials the whole effect back without re-exporting art.
    var PAPER = { blend: 'multiply', opacity: 1 };

    // Each shot is taken on its own tap. The countdown is the pause between
    // tapping and the shutter firing, so nobody is photographed mid-tap —
    // set it to 0 for an instant capture.
    var COUNTDOWN_FROM = 3;
    var COUNTDOWN_TICK_MS = 800;

    // Guests see themselves mirrored, so the saved strip is mirrored too —
    // otherwise the photo doesn't match the pose they just struck.
    var MIRROR = true;

    // Vintage black-and-white treatment, applied to the photos only. Stamps,
    // frame and wordmark composite afterwards and keep their colour.
    var PHOTO_LOOK = {
        enabled: true,
        contrast: 1.14,
        // A print off a real machine never reaches pure black or paper white.
        blackPoint: 24,
        whitePoint: 242,
        // Slightly warm rather than neutral grey, which reads digital.
        tone: { r: 1.06, g: 1.0, b: 0.91 },
        vignette: 0.20
    };

    /* ------------------------------------------------------------------ *
     * Element handles
     * ------------------------------------------------------------------ */

    var video = document.getElementById('viewfinder');
    var shutter = document.getElementById('shutter');
    var btnUndo = document.getElementById('btn-undo');
    var cameraModule = document.querySelector('.camera-module');
    var resultStage = document.getElementById('result-stage');
    var stampPreview = document.getElementById('stamp-preview');

    var permissionState = document.getElementById('permission-state');
    var permissionCopy = document.getElementById('permission-copy');
    var btnEnable = document.getElementById('btn-enable');

    var countdownState = document.getElementById('countdown-state');
    var countdownNumeral = document.getElementById('countdown-numeral');
    var shotCounter = document.getElementById('shot-counter');
    var shotPips = document.getElementById('shot-pips');

    var processingState = document.getElementById('processing-state');
    var loadProgress = document.getElementById('load-progress');
    var statusText = document.getElementById('status-text');
    var bitrateData = document.getElementById('bitrate-data');

    var framePicker = document.getElementById('frame-picker');
    var resultSection = document.getElementById('result-section');
    var resultEmpty = document.getElementById('result-empty');
    var resultBody = document.getElementById('result-body');
    var stripPreview = document.getElementById('strip-preview');
    var btnShare = document.getElementById('btn-share');
    var btnRetake = document.getElementById('btn-retake');
    var saveHint = document.getElementById('save-hint');

    var metaMode = document.getElementById('meta-mode');
    var metaFrame = document.getElementById('meta-frame');

    var stripCanvas = document.getElementById('strip-canvas');
    stripCanvas.width = STRIP.w;
    stripCanvas.height = STRIP.h;

    /* ------------------------------------------------------------------ *
     * State
     * ------------------------------------------------------------------ */

    var stream = null;
    var busy = false;
    var aborted = false;      // set when the page is backgrounded mid-sequence
    var shots = [];            // captured frames, as canvases
    var selectedOverlay = OVERLAYS[0];
    var overlayCache = {};     // src -> HTMLImageElement
    var stripBlob = null;

    /* ------------------------------------------------------------------ *
     * Small helpers
     * ------------------------------------------------------------------ */

    function wait(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    /**
     * Plain-English status for the footer. The keys stay terse so the calls
     * read as states; only the guest-facing wording lives here.
     */
    var MODE_TEXT = {
        STANDBY: 'Camera is off',
        CONNECTING: 'Getting the camera ready',
        READY: 'Ready — tap the shutter',
        BLOCKED: 'Camera not allowed',
        SHOOTING: 'Taking your photo',
        DEVELOPING: 'Developing your strip',
        COMPLETE: 'Your strip is ready'
    };

    function setMode(key) {
        metaMode.textContent = MODE_TEXT[key] || key;
    }

    function cellY(index) {
        return STRIP.marginTop + index * (STRIP.cellH + STRIP.gap);
    }

    /**
     * Draw `source` into the rect (dx, dy, dw, dh) cropped from the centre,
     * filling the rect without distortion — the canvas equivalent of
     * `object-fit: cover`, so the saved frame matches the live viewfinder.
     */
    function drawCover(ctx, source, sw, sh, dx, dy, dw, dh, mirror) {
        var sourceAspect = sw / sh;
        var targetAspect = dw / dh;
        var cropW, cropH, cropX, cropY;

        if (sourceAspect > targetAspect) {
            cropH = sh;
            cropW = sh * targetAspect;
            cropX = (sw - cropW) / 2;
            cropY = 0;
        } else {
            cropW = sw;
            cropH = sw / targetAspect;
            cropX = 0;
            cropY = (sh - cropH) / 2;
        }

        ctx.save();
        if (mirror) {
            ctx.translate(dx + dw, dy);
            ctx.scale(-1, 1);
            ctx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, dw, dh);
        } else {
            ctx.drawImage(source, cropX, cropY, cropW, cropH, dx, dy, dw, dh);
        }
        ctx.restore();
    }

    /* ------------------------------------------------------------------ *
     * Accordion — only one section open at a time (from the design)
     * ------------------------------------------------------------------ */

    var detailsElements = document.querySelectorAll('details');

    detailsElements.forEach(function (targetDetail) {
        targetDetail.addEventListener('toggle', function () {
            if (!targetDetail.open) return;
            detailsElements.forEach(function (detail) {
                if (detail !== targetDetail) detail.removeAttribute('open');
            });
        });
    });

    function openSection(section) {
        section.setAttribute('open', '');
        section.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    /* ------------------------------------------------------------------ *
     * Frame picker
     * ------------------------------------------------------------------ */

    function buildFramePicker() {
        OVERLAYS.forEach(function (overlay) {
            var chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'frame-chip';
            chip.textContent = overlay.label;
            chip.setAttribute('role', 'radio');
            chip.setAttribute('aria-checked', overlay === selectedOverlay ? 'true' : 'false');

            chip.addEventListener('click', function () {
                selectedOverlay = overlay;
                framePicker.querySelectorAll('.frame-chip').forEach(function (other) {
                    other.setAttribute('aria-checked', other === chip ? 'true' : 'false');
                });
                metaFrame.textContent = overlay.label;
                preloadFrame(overlay);
                updateStampPreview();
            });

            framePicker.appendChild(chip);
        });

        metaFrame.textContent = selectedOverlay.label;
    }

    /**
     * Artwork is fetched once and reused. Resolves to null rather than
     * rejecting when a file is missing — bad artwork costs the guest their
     * frame, never their photos.
     */
    function loadImage(src) {
        if (!src) return Promise.resolve(null);
        if (overlayCache[src]) return overlayCache[src];

        var promise = new Promise(function (resolve) {
            var img = new Image();
            img.onload = function () { resolve(img); };
            img.onerror = function () {
                console.warn('Artwork failed to load: ' + src);
                resolve(null);
            };
            img.src = src;
        });

        overlayCache[src] = promise;
        return promise;
    }

    /** A frame is its full-strip artwork, per-photo stamps, and footer mark. */
    function preloadFrame(overlay) {
        var stamps = overlay.stamps || [];
        return Promise.all([
            loadImage(overlay.src),
            Promise.all(stamps.map(function (stamp) { return loadImage(stamp.src); })),
            loadImage(overlay.footer && overlay.footer.src),
            loadImage(overlay.paper && overlay.paper.src)
        ]).then(function (loaded) {
            return {
                strip: loaded[0], stamps: loaded[1],
                footer: loaded[2], paper: loaded[3]
            };
        });
    }

    /* ------------------------------------------------------------------ *
     * Camera
     * ------------------------------------------------------------------ */

    function showPermissionGate(message) {
        permissionCopy.textContent = message;
        permissionState.classList.add('is-active');
        shutter.disabled = true;
    }

    function hidePermissionGate() {
        permissionState.classList.remove('is-active');
        shutter.disabled = false;
    }

    function isSecure() {
        return window.isSecureContext ||
            location.protocol === 'https:' ||
            location.hostname === 'localhost' ||
            location.hostname === '127.0.0.1';
    }

    async function initCamera() {
        if (!isSecure()) {
            showPermissionGate('Camera needs a secure connection. Open this page over https.');
            return;
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showPermissionGate('This browser cannot open the camera. Try Safari or Chrome.');
            return;
        }

        setMode('CONNECTING');

        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width: { ideal: 1280 },
                    height: { ideal: 960 }
                },
                audio: false
            });

            video.srcObject = stream;
            if (MIRROR) video.classList.add('is-mirrored');
            await video.play().catch(function () { /* autoplay retry is handled by the gate */ });

            hidePermissionGate();
            setMode('READY');
        } catch (err) {
            console.error('Camera access failed', err);
            setMode('BLOCKED');

            if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
                showPermissionGate('Camera blocked. Allow camera in your browser settings, then tap below.');
            } else if (err && err.name === 'NotFoundError') {
                showPermissionGate('No camera found on this device.');
            } else {
                showPermissionGate('Could not start the camera. Tap to try again.');
            }
        }
    }

    /* ------------------------------------------------------------------ *
     * Capture sequence
     * ------------------------------------------------------------------ */

    function buildPips() {
        for (var i = 0; i < SHOT_COUNT; i++) {
            var pip = document.createElement('span');
            pip.className = 'pip';
            shotPips.appendChild(pip);
        }
    }

    function updatePips(filled) {
        var pips = shotPips.querySelectorAll('.pip');
        for (var i = 0; i < pips.length; i++) {
            pips[i].classList.toggle('is-filled', i < filled);
        }
    }

    /**
     * The standing prompt in the corner of the viewfinder. This is the only
     * capture feedback there is — no flash — so it has to carry the whole
     * story: what just happened, and what the next tap will do.
     */
    function updatePrompt() {
        var taken = shots.length;

        // Deliberately short. This sits between two corner stamps on a narrow
        // phone, and "tap the shutter" now lives in the status line instead.
        shotCounter.textContent = taken >= SHOT_COUNT
            ? 'COMPLETE'
            : 'SHOT ' + (taken + 1) + ' / ' + SHOT_COUNT;

        btnUndo.hidden = !(taken > 0 && taken < SHOT_COUNT);
        updateStampPreview();
    }

    /**
     * Show the stamp this shot will receive, in the corner it will land in.
     * The viewfinder is cover-cropped to the same 4:3 as a photo cell, so the
     * strip geometry maps straight onto it as percentages.
     *
     * Height is set and width left to the image, so the browser keeps the
     * artwork's proportions without us needing its dimensions; offsets are
     * anchored from the same edges drawStamp measures from.
     */
    function updateStampPreview() {
        var defs = selectedOverlay.stamps || [];
        var index = shots.length;
        var def = defs[index];

        if (!def || !def.src || index >= SHOT_COUNT) {
            stampPreview.hidden = true;
            return;
        }

        var h = def.height || STAMP.height;
        var inset = typeof def.inset === 'number' ? def.inset : STAMP.inset;
        var corner = def.corner || STAMP_CORNERS[index % STAMP_CORNERS.length];

        var s = stampPreview.style;
        s.height = (h / STRIP.cellH * 100) + '%';
        s.top = s.bottom = s.left = s.right = '';

        var insetX = (inset / STRIP.cellW * 100) + '%';
        var insetY = (inset / STRIP.cellH * 100) + '%';

        if (corner.indexOf('left') > -1) s.left = insetX; else s.right = insetX;
        if (corner.indexOf('top') > -1) s.top = insetY; else s.bottom = insetY;

        if (stampPreview.getAttribute('src') !== def.src) {
            stampPreview.setAttribute('src', def.src);
        }
        stampPreview.hidden = false;
    }

    /** Give the strip the whole stage once it exists. */
    function showStage(showResult) {
        cameraModule.hidden = showResult;
        resultStage.hidden = !showResult;
    }

    function collapseAllSections() {
        detailsElements.forEach(function (d) { d.removeAttribute('open'); });
    }

    function clamp255(v) {
        return v < 0 ? 0 : (v > 255 ? 255 : v);
    }

    /**
     * Turn a captured frame into a vintage black-and-white print: desaturate
     * by luminance, firm up the contrast, darken toward the corners, then
     * compress the result into a range that stops short of pure black and
     * paper white — the giveaway that separates a print from a digital photo.
     */
    function applyPhotoLook(ctx, w, h) {
        if (!PHOTO_LOOK.enabled) return;

        var look = PHOTO_LOOK;
        var img = ctx.getImageData(0, 0, w, h);
        var d = img.data;

        var cx = w / 2;
        var cy = h / 2;
        var maxDist = Math.sqrt(cx * cx + cy * cy);
        var span = (look.whitePoint - look.blackPoint) / 255;

        for (var y = 0; y < h; y++) {
            for (var x = 0; x < w; x++) {
                var i = (y * w + x) * 4;

                var lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
                lum = (lum - 128) * look.contrast + 128;

                if (look.vignette) {
                    var dx = x - cx;
                    var dy = y - cy;
                    var t = Math.sqrt(dx * dx + dy * dy) / maxDist;
                    lum *= 1 - look.vignette * t * t;
                }

                // Level mapping goes last so the lifted black point survives
                // both the contrast curve and the vignette.
                lum = look.blackPoint + clamp255(lum) * span;

                d[i]     = clamp255(lum * look.tone.r);
                d[i + 1] = clamp255(lum * look.tone.g);
                d[i + 2] = clamp255(lum * look.tone.b);
            }
        }

        ctx.putImageData(img, 0, 0);
    }

    /** Grab the current video frame at strip-cell resolution. */
    function grabFrame() {
        var frame = document.createElement('canvas');
        frame.width = STRIP.cellW;
        frame.height = STRIP.cellH;

        var ctx = frame.getContext('2d');
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, frame.width, frame.height);

        drawCover(
            ctx, video,
            video.videoWidth, video.videoHeight,
            0, 0, frame.width, frame.height,
            MIRROR
        );
        applyPhotoLook(ctx, frame.width, frame.height);

        return frame;
    }

    async function runCountdown(shotIndex) {
        shotCounter.textContent = 'SHOT ' + (shotIndex + 1) + ' / ' + SHOT_COUNT;
        if (COUNTDOWN_FROM < 1) return;

        // Both sit dead centre, and the numeral says everything a counting
        // guest needs, so the label steps aside for it.
        shotCounter.hidden = true;
        countdownState.classList.add('is-active');

        for (var n = COUNTDOWN_FROM; n > 0; n--) {
            countdownNumeral.textContent = String(n);
            await wait(COUNTDOWN_TICK_MS);
            if (aborted) break;
        }

        countdownState.classList.remove('is-active');
        shotCounter.hidden = false;
    }

    /**
     * Drop the shot that was counting down and hand the booth back, idle.
     * Shots already banked are kept — losing them because a text message
     * arrived would be its own small tragedy.
     */
    function abortShot() {
        aborted = false;
        busy = false;
        countdownState.classList.remove('is-active');
        processingState.classList.remove('is-active');
        loadProgress.style.width = '0%';
        updatePips(shots.length);
        updatePrompt();
        shutter.disabled = !stream;
        setMode(stream ? 'READY' : 'STANDBY');
    }

    async function takeShot() {
        if (busy) return;
        if (!stream || !video.videoWidth) {
            showPermissionGate('Camera is not ready yet. Tap to start it.');
            return;
        }

        if (shots.length >= SHOT_COUNT) return;

        busy = true;
        aborted = false;
        shutter.disabled = true;
        btnUndo.hidden = true;
        setMode('SHOOTING');

        // Start fetching the frame now so it is ready by the time we composite.
        var framePromise = preloadFrame(selectedOverlay);

        await runCountdown(shots.length);
        if (aborted) return abortShot();

        shots.push(grabFrame());
        updatePips(shots.length);
        updatePrompt();

        if (shots.length >= SHOT_COUNT) {
            await develop(framePromise);
            busy = false;
            // The strip is built; the next tap should be "Start over", not a
            // fifth photo landing nowhere.
            shutter.disabled = true;
            return;
        }

        busy = false;
        shutter.disabled = false;
        setMode('READY');
    }

    /** Hand back the last shot so a blink or a bad angle isn't final. */
    function undoShot() {
        if (busy || !shots.length) return;
        shots.pop();
        updatePips(shots.length);
        updatePrompt();
        setMode(stream ? 'READY' : 'STANDBY');
    }

    /* ------------------------------------------------------------------ *
     * Compositing
     * ------------------------------------------------------------------ */

    async function develop(framePromise) {
        setMode('DEVELOPING');
        statusText.textContent = 'DEVELOPING_STRIP...';
        bitrateData.textContent = 'FRAMES: ' + SHOT_COUNT + '/' + SHOT_COUNT + ' // COMPOSITE: ACTIVE';
        processingState.classList.add('is-active');
        loadProgress.style.width = '0%';

        // Run the progress sweep and the real compositing side by side, then
        // wait for both, so the animation never outruns the actual work.
        var sweep = (async function () {
            for (var p = 0; p <= 100; p += 5) {
                loadProgress.style.width = p + '%';
                await wait(DEVELOP_TICK_MS);
            }
        })();

        var art = await framePromise;
        composeStrip(art);

        await sweep;

        stripBlob = await canvasToBlob(stripCanvas);
        stripPreview.src = URL.createObjectURL(stripBlob);

        processingState.classList.remove('is-active');
        loadProgress.style.width = '0%';

        resultEmpty.hidden = true;
        resultBody.hidden = false;

        // The camera has done its job. Hand the stage to the strip, and fold
        // the accordion away so it gets the height.
        stampPreview.hidden = true;
        showStage(true);
        collapseAllSections();
        setMode('COMPLETE');
    }

    /**
     * Place one stamp inside a photo cell. Drawn unmirrored on purpose: the
     * photo beneath was flipped at capture, and lettering on a stamp has to
     * stay readable.
     */
    function drawStamp(ctx, img, def, index, cellTop) {
        if (!img) return;

        var h = (def && def.height) || STAMP.height;
        var w = Math.round(h * (img.width / img.height));
        var corner = (def && def.corner) || STAMP_CORNERS[index % STAMP_CORNERS.length];
        var inset = (def && typeof def.inset === 'number') ? def.inset : STAMP.inset;

        var x = corner.indexOf('left') > -1
            ? STRIP.marginX + inset
            : STRIP.marginX + STRIP.cellW - inset - w;
        var y = corner.indexOf('top') > -1
            ? cellTop + inset
            : cellTop + STRIP.cellH - inset - h;

        ctx.drawImage(img, x, y, w, h);
    }

    /** The plate below the last photo, where the footer mark sits. */
    function footerTop() {
        return cellY(SHOT_COUNT - 1) + STRIP.cellH;
    }

    /** Centre the footer mark in that plate, both axes. */
    function drawFooter(ctx, img, def) {
        if (!img) return;

        var w = (def && def.width) || FOOTER.width;
        var h = Math.round(w * (img.height / img.width));
        var top = footerTop();

        ctx.drawImage(
            img,
            Math.round((STRIP.w - w) / 2),
            Math.round(top + (STRIP.h - top - h) / 2),
            w, h
        );
    }

    function composeStrip(art) {
        var ctx = stripCanvas.getContext('2d');
        var stampDefs = selectedOverlay.stamps || [];

        ctx.fillStyle = STRIP.bg;
        ctx.fillRect(0, 0, STRIP.w, STRIP.h);

        shots.forEach(function (frame, i) {
            var top = cellY(i);
            ctx.drawImage(frame, STRIP.marginX, top, STRIP.cellW, STRIP.cellH);
            drawStamp(ctx, art.stamps[i], stampDefs[i], i, top);
        });

        // The strip frame goes above the photos so its window rules sit over a
        // stamp that strays close to an edge...
        if (art.strip) {
            ctx.drawImage(art.strip, 0, 0, STRIP.w, STRIP.h);
        }

        // ...and the footer mark above that, so a frame with a filled footer
        // plate can't bury it.
        drawFooter(ctx, art.footer, selectedOverlay.footer);

        // Paper goes over everything, so the whole strip reads as one printed
        // object rather than photos sitting on a clean background.
        drawPaper(ctx, art.paper, selectedOverlay.paper);
    }

    function drawPaper(ctx, img, def) {
        if (!img) return;

        ctx.save();
        ctx.globalCompositeOperation = (def && def.blend) || PAPER.blend;
        ctx.globalAlpha = (def && typeof def.opacity === 'number')
            ? def.opacity
            : PAPER.opacity;
        drawCover(ctx, img, img.width, img.height, 0, 0, STRIP.w, STRIP.h, false);
        ctx.restore();
    }

    function canvasToBlob(canvas) {
        return new Promise(function (resolve) {
            if (canvas.toBlob) {
                canvas.toBlob(function (blob) { resolve(blob); }, 'image/png');
            } else {
                // Very old Safari — fall back to a data URL round-trip.
                var parts = canvas.toDataURL('image/png').split(',');
                var binary = atob(parts[1]);
                var bytes = new Uint8Array(binary.length);
                for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                resolve(new Blob([bytes], { type: 'image/png' }));
            }
        });
    }

    /* ------------------------------------------------------------------ *
     * Save / share
     * ------------------------------------------------------------------ */

    function stripFilename() {
        var d = new Date();
        var pad = function (n) { return String(n).padStart(2, '0'); };
        return 'westofchesters-photo-booth-' +
            d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' +
            pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '.png';
    }

    function downloadStrip() {
        var link = document.createElement('a');
        link.href = URL.createObjectURL(stripBlob);
        link.download = stripFilename();
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    }

    async function saveStrip() {
        if (!stripBlob) return;

        var file = new File([stripBlob], stripFilename(), { type: 'image/png' });

        // The share sheet is the only reliable route to the iOS camera roll;
        // the download attribute is the fallback everywhere else.
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({ files: [file], title: 'Westofchester’s Photo Booth' });
                return;
            } catch (err) {
                if (err && err.name === 'AbortError') return;
                console.warn('Share failed, falling back to download', err);
            }
        }

        downloadStrip();
    }

    function resetBooth() {
        shots = [];
        stripBlob = null;
        updatePips(0);
        resultBody.hidden = true;
        resultEmpty.hidden = false;
        if (stripPreview.src) URL.revokeObjectURL(stripPreview.src);
        stripPreview.removeAttribute('src');

        // Camera back on stage, and the stamp preview back to the first shot.
        showStage(false);
        updatePrompt();

        shutter.disabled = !stream;
        setMode(stream ? 'READY' : 'STANDBY');
    }

    /* ------------------------------------------------------------------ *
     * Wiring
     * ------------------------------------------------------------------ */

    shutter.addEventListener('click', takeShot);
    btnUndo.addEventListener('click', undoShot);
    btnEnable.addEventListener('click', initCamera);
    btnShare.addEventListener('click', saveStrip);
    btnRetake.addEventListener('click', resetBooth);

    if (!(navigator.canShare && navigator.share)) {
        btnShare.textContent = 'Download strip';
        saveHint.textContent = 'Press and hold the strip to save it to your photos.';
    }

    function releaseCamera() {
        if (!stream) return;
        stream.getTracks().forEach(function (track) { track.stop(); });
        stream = null;
    }

    // Phones reclaim the camera from backgrounded tabs, so a shot left
    // counting down would capture a frozen frame. Drop that one shot; the
    // ones already banked survive.
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            if (busy) aborted = true;
            releaseCamera();
            shutter.disabled = true;
            if (!busy) setMode('STANDBY');
        } else if (!stream) {
            initCamera();
        }
    });

    buildFramePicker();
    buildPips();
    updatePrompt();
    preloadFrame(selectedOverlay);
    initCamera();
})();
