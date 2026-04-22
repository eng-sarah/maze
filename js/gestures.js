/**
 * MediaPipe Hand gesture interpreter.
 * Loads all dependencies from ./local_assets/ (offline capable).
 */
export class GestureInterpreter {
  constructor() {
    this.handLandmarker = null;
    this.ready          = false;
    this.lastVideoTime  = -1;
    this.results        = null;

    // Derived each frame
    this.handCount        = 0;
    this.pinchDistances   = [];   // [hand0, hand1]
    this.wristPositions   = [];   // [hand0, hand1] normalized 0-1

    // Smoothed pinch for stable zoom
    this._smoothPinch = 1.0;
  }

  async init() {
    // Dynamic import: vision_bundle.js is a UMD/ESM bundle
    const vision = await import('../local_assets/vision_bundle.js');
    const { HandLandmarker, FilesetResolver } = vision;

    const filesetResolver = await FilesetResolver.forVisionTasks('./local_assets/');

    this.handLandmarker = await HandLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: './local_assets/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode:              'VIDEO',
      numHands:                 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence:  0.5,
      minTrackingConfidence:      0.5,
    });

    this.ready = true;
  }

  /** Run detection on the current video frame. Call once per game loop tick. */
  detect(video) {
    if (!this.ready || video.readyState < 2) return;
    const now = performance.now();
    if (now === this.lastVideoTime) return;
    this.lastVideoTime = now;

    this.results   = this.handLandmarker.detectForVideo(video, now);
    this.handCount = this.results.landmarks?.length ?? 0;
    this._process();
  }

  _process() {
    const lms = this.results?.landmarks ?? [];

    this.pinchDistances = lms.map(lm => {
      const t = lm[4], i = lm[8];
      return Math.hypot(t.x - i.x, t.y - i.y);
    });

    this.wristPositions = lms.map(lm => lm[0]);

    // Smooth pinch (exponential moving average)
    const raw = this.pinchDistances[0] ?? 1.0;
    this._smoothPinch = this._smoothPinch * 0.7 + raw * 0.3;
  }

  // ── Zoom ──────────────────────────────────────────────────────────

  /** Returns the desired zoom level (0–4) based on pinch gesture. */
  getZoomLevel() {
    if (this.handCount === 0) return 0;

    // Both hands pinching tightly → Level 4
    if (this.handCount >= 2 &&
        (this.pinchDistances[0] ?? 1) < 0.07 &&
        (this.pinchDistances[1] ?? 1) < 0.07) {
      return 4;
    }

    // Single-hand pinch: map distance to levels 0–3
    // 0.18+ = open (0), ~0.04 = fully pinched (level 3)
    const OPEN   = 0.18;
    const CLOSED = 0.04;
    const t = Math.max(0, Math.min(1, (OPEN - this._smoothPinch) / (OPEN - CLOSED)));
    return Math.round(t * 3);
  }

  // ── Movement ──────────────────────────────────────────────────────

  /**
   * Returns {dx, dy} direction for the player, or null.
   * Based on wrist.x/y offset from the frame center (0.5, 0.5).
   * Camera image is typically mirrored, so we flip x.
   */
  getMoveDirection() {
    if (this.handCount === 0) return null;
    if (this.isPalmOpen())    return null;  // flat palm = stop

    const wrist = this.wristPositions[0];
    if (!wrist) return null;

    // Flip x because video is mirrored for display
    const offsetX =  (0.5 - wrist.x);   // >0 means hand moved right in real space
    const offsetY =  (wrist.y - 0.5);   // >0 means hand moved down

    const DEAD = 0.18;
    if (Math.abs(offsetX) < DEAD && Math.abs(offsetY) < DEAD) return null;

    if (Math.abs(offsetX) >= Math.abs(offsetY)) {
      return { dx: offsetX > 0 ? 1 : -1, dy: 0 };
    } else {
      return { dx: 0, dy: offsetY > 0 ? 1 : -1 };
    }
  }

  // ── Gesture predicates ────────────────────────────────────────────

  /** True when 4+ fingers are extended (palm flat) → stop movement. */
  isPalmOpen() {
    const lm = this.results?.landmarks?.[0];
    if (!lm) return false;
    const tips  = [8, 12, 16, 20];
    const bases = [5,  9, 13, 17];
    let ext = 0;
    for (let i = 0; i < 4; i++) {
      if (lm[tips[i]].y < lm[bases[i]].y) ext++;
    }
    return ext >= 4;
  }

  /** True when 4+ fingers are curled (fist) → interact. */
  isFist() {
    const lm = this.results?.landmarks?.[0];
    if (!lm) return false;
    const tips  = [8, 12, 16, 20];
    const bases = [5,  9, 13, 17];
    let curl = 0;
    for (let i = 0; i < 4; i++) {
      if (lm[tips[i]].y > lm[bases[i]].y) curl++;
    }
    return curl >= 4;
  }
}
