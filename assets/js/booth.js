/**
 * Miami Photobooth — four shots, composited into a classic 2x6 strip
 * entirely on the guest's own phone. No uploads, no backend.
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
    var COUNTDOWN_FROM = 3;
    var COUNTDOWN_TICK_MS = 800;
    var BETWEEN_SHOTS_MS = 700;
    var DEVELOP_TICK_MS = 45;

    // Guests see themselves mirrored, so the saved strip is mirrored too —
    // otherwise the photo doesn't match the pose they just struck.
    var MIRROR = true;

    /* ------------------------------------------------------------------ *
     * Element handles
     * ------------------------------------------------------------------ */

    var video = document.getElementById('viewfinder');
    var shutter = document.getElementById('shutter');
    var flashLayer = document.getElementById('flash-layer');

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

    function setMode(label) {
        metaMode.textContent = label;
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
                metaFrame.textContent = overlay.label.toUpperCase();
                preloadOverlay(overlay);
            });

            framePicker.appendChild(chip);
        });

        metaFrame.textContent = selectedOverlay.label.toUpperCase();
    }

    /**
     * Overlay artwork is fetched once and reused. Resolves to null when the
     * frame is "none" or the file is missing — a missing overlay costs the
     * guest their frame, never their photos.
     */
    function preloadOverlay(overlay) {
        if (!overlay.src) return Promise.resolve(null);
        if (overlayCache[overlay.src]) return overlayCache[overlay.src];

        var promise = new Promise(function (resolve) {
            var img = new Image();
            img.onload = function () { resolve(img); };
            img.onerror = function () {
                console.warn('Overlay failed to load: ' + overlay.src);
                resolve(null);
            };
            img.src = overlay.src;
        });

        overlayCache[overlay.src] = promise;
        return promise;
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

    function fireFlash() {
        flashLayer.classList.remove('is-firing');
        // Force a reflow so the animation restarts on every shot.
        void flashLayer.offsetWidth;
        flashLayer.classList.add('is-firing');
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

        return frame;
    }

    async function runCountdown(shotIndex) {
        shotCounter.textContent = 'SHOT ' + (shotIndex + 1) + ' / ' + SHOT_COUNT;
        countdownState.classList.add('is-active');

        for (var n = COUNTDOWN_FROM; n > 0; n--) {
            countdownNumeral.textContent = String(n);
            await wait(COUNTDOWN_TICK_MS);
            if (aborted) break;
        }

        countdownState.classList.remove('is-active');
    }

    /** Tear down a half-finished sequence and hand the booth back, idle. */
    function abortSequence() {
        shots = [];
        aborted = false;
        busy = false;
        countdownState.classList.remove('is-active');
        processingState.classList.remove('is-active');
        loadProgress.style.width = '0%';
        updatePips(0);
        shutter.disabled = !stream;
        setMode(stream ? 'READY' : 'STANDBY');
    }

    async function runSequence() {
        if (busy) return;
        if (!stream || !video.videoWidth) {
            showPermissionGate('Camera is not ready yet. Tap to start it.');
            return;
        }

        busy = true;
        aborted = false;
        shutter.disabled = true;
        shots = [];
        updatePips(0);
        setMode('SHOOTING');

        // Start fetching the frame now so it is ready by the time we composite.
        var overlayPromise = preloadOverlay(selectedOverlay);

        for (var i = 0; i < SHOT_COUNT; i++) {
            await runCountdown(i);
            if (aborted) return abortSequence();

            fireFlash();
            shots.push(grabFrame());
            updatePips(shots.length);

            if (i < SHOT_COUNT - 1) await wait(BETWEEN_SHOTS_MS);
            if (aborted) return abortSequence();
        }

        await develop(overlayPromise);

        busy = false;
        shutter.disabled = false;
    }

    /* ------------------------------------------------------------------ *
     * Compositing
     * ------------------------------------------------------------------ */

    async function develop(overlayPromise) {
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

        var overlayImg = await overlayPromise;
        composeStrip(overlayImg);

        await sweep;

        stripBlob = await canvasToBlob(stripCanvas);
        stripPreview.src = URL.createObjectURL(stripBlob);

        processingState.classList.remove('is-active');
        loadProgress.style.width = '0%';

        resultEmpty.hidden = true;
        resultBody.hidden = false;
        openSection(resultSection);
        setMode('COMPLETE');
    }

    function composeStrip(overlayImg) {
        var ctx = stripCanvas.getContext('2d');

        ctx.fillStyle = STRIP.bg;
        ctx.fillRect(0, 0, STRIP.w, STRIP.h);

        shots.forEach(function (frame, i) {
            ctx.drawImage(frame, STRIP.marginX, cellY(i), STRIP.cellW, STRIP.cellH);
        });

        if (overlayImg) {
            ctx.drawImage(overlayImg, 0, 0, STRIP.w, STRIP.h);
        }
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
        return 'miami-photobooth-' +
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
                await navigator.share({ files: [file], title: 'Miami Photobooth' });
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
        setMode(stream ? 'READY' : 'STANDBY');
    }

    /* ------------------------------------------------------------------ *
     * Wiring
     * ------------------------------------------------------------------ */

    shutter.addEventListener('click', runSequence);
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

    // Phones reclaim the camera from backgrounded tabs, so a sequence left
    // running would quietly capture frozen frames. Drop it and let the guest
    // start over rather than hand them four identical stills.
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
    preloadOverlay(selectedOverlay);
    initCamera();
})();
