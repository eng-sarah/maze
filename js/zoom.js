/**
 * Semantic Zoom Engine.
 * Manages level (0–4) and smoothly animates per-layer alpha values.
 */
export class ZoomEngine {
  // Camera scale per zoom level: lower = zoomed out (more of maze visible)
  static SCALES = [0.62, 0.82, 1.05, 1.35, 1.72];

  // Display name per level
  static NAMES  = ['EXPLORE', 'STRUCTURE', 'AWARENESS', 'INSIGHT', 'REVELATION'];

  // HUD color per level
  static COLORS = ['#4488ff', '#44ff88', '#ffee44', '#ff8844', '#ff44aa'];

  constructor() {
    this.targetLevel = 0;
    // Per-layer alpha (layers 0-4)
    this.layerAlphas = [1, 0, 0, 0, 0];
    this.transitionSpeed = 3.0;  // alpha units per second
  }

  setTargetLevel(level) {
    this.targetLevel = Math.max(0, Math.min(4, Math.round(level)));
  }

  update(dt) {
    for (let i = 0; i <= 4; i++) {
      const target = i <= this.targetLevel ? 1 : 0;
      const diff   = target - this.layerAlphas[i];
      const step   = Math.sign(diff) * Math.min(Math.abs(diff), this.transitionSpeed * dt);
      this.layerAlphas[i] = Math.max(0, Math.min(1, this.layerAlphas[i] + step));
    }
  }

  getLayerAlpha(layer) {
    return this.layerAlphas[layer] ?? 0;
  }

  getCameraScale() {
    // Smoothly interpolate between discrete level scales
    const lo = Math.floor(this.targetLevel);
    const hi = Math.min(4, lo + 1);
    const t  = this.targetLevel - lo;  // fractional part (0 if already integer)
    return ZoomEngine.SCALES[lo] * (1 - t) + ZoomEngine.SCALES[hi] * t;
  }

  get name()  { return ZoomEngine.NAMES[this.targetLevel];  }
  get color() { return ZoomEngine.COLORS[this.targetLevel]; }
}
