import { Pathfinder } from './pathfinder.js';
import { ZoomEngine  } from './zoom.js';

const CELL = 40;  // base pixels per maze cell

// ─── Color palette ────────────────────────────────────────────────────────────
const C = {
  bg:         '#06060e',
  wall:       '#00d4ff',
  wallGlow:   '#00d4ff',
  player:     '#ffb347',
  playerGlow: '#ff8c00',
  trail:      '#9955ff',
  deadEnd:    'rgba(255,60,40,',
  junction:   'rgba(50,255,130,',
  solution:   'rgba(50,180,255,',
  ghost:      '#ff9944',
  arrowGood:  '#4dff8c',
  arrowBad:   '#ff4444',
  startBg:    'rgba(50,255,100,0.18)',
  exitBg:     'rgba(255,100,40,',
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.time   = 0;

    // Camera state (cell units) — initialized to player start position
    this.camX      = 0;
    this.camY      = 0;
    this.camScale  = ZoomEngine.SCALES[0];
    this._camTX    = 0;
    this._camTY    = 0;
    this._camTS    = ZoomEngine.SCALES[0];
    this._firstFrame = true;
  }

  setSize(w, h) {
    this.canvas.width  = w;
    this.canvas.height = h;
  }

  // ─── Main render ────────────────────────────────────────────────────────────
  render(maze, player, zoom, dt) {
    this.time += dt;
    const ctx = this.ctx;
    const { width: W, height: H } = this.canvas;

    // Smooth camera toward player
    this._camTX = player.renderX;
    this._camTY = player.renderY;
    this._camTS = zoom.getCameraScale();

    if (this._firstFrame) {
      // Snap camera instantly on first frame so maze starts centered
      this.camX     = this._camTX;
      this.camY     = this._camTY;
      this.camScale = this._camTS;
      this._firstFrame = false;
    } else {
      const smoothK = 8 * dt;
      this.camX     += (this._camTX - this.camX)    * smoothK;
      this.camY     += (this._camTY - this.camY)    * smoothK;
      this.camScale += (this._camTS - this.camScale) * 5 * dt;
    }

    // Background
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // Camera transform
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(this.camScale, this.camScale);
    ctx.translate(
      -(this.camX * CELL + CELL / 2),
      -(this.camY * CELL + CELL / 2),
    );

    const a = {
      l1: zoom.getLayerAlpha(1),
      l2: zoom.getLayerAlpha(2),
      l3: zoom.getLayerAlpha(3),
      l4: zoom.getLayerAlpha(4),
    };

    // Draw order: ghost paths → trail → maze → overlays → player
    if (a.l4 > 0) this._drawCounterfactual(ctx, maze, player, a.l4);
    if (a.l3 > 0) this._drawTrail(ctx, player, a.l3);
    this._drawMaze(ctx, maze, a.l1);
    if (a.l2 > 0) this._drawAwareness(ctx, maze, player, a.l2);
    if (a.l3 > 0) this._drawCausality(ctx, maze, player, a.l3);
    this._drawPlayer(ctx, player);

    ctx.restore();

    // HUD (no camera transform)
    this._drawHUD(ctx, W, H, zoom);
  }

  // ─── Layer 0+1: Base maze ───────────────────────────────────────────────────
  _drawMaze(ctx, maze, a1) {
    const cs = CELL;

    // Start cell
    ctx.fillStyle = C.startBg;
    ctx.fillRect(0, 0, cs, cs);

    // Exit cell (pulsing)
    const pulse   = 0.5 + 0.5 * Math.sin(this.time * 3.5);
    const ex = (maze.cols - 1) * cs;
    const ey = (maze.rows - 1) * cs;
    ctx.fillStyle = `${C.exitBg}${0.25 + 0.2 * pulse})`;
    ctx.fillRect(ex, ey, cs, cs);

    // Structure shading (Level 1)
    if (a1 > 0) {
      for (let y = 0; y < maze.rows; y++) {
        for (let x = 0; x < maze.cols; x++) {
          const cell = maze.grid[y][x];
          const open = Object.values(cell.walls).filter(v => !v).length;
          const shade = a1 * 0.12 * (open / 4);
          ctx.fillStyle = `rgba(0,150,255,${shade})`;
          ctx.fillRect(x * cs, y * cs, cs, cs);
        }
      }
    }

    // Walls — batch all into two strokes (glow + sharp)
    ctx.lineCap = 'square';

    // Outer glow pass
    ctx.beginPath();
    this._buildWallPaths(ctx, maze, cs);
    ctx.strokeStyle = 'rgba(0,212,255,0.3)';
    ctx.lineWidth   = 6;
    ctx.shadowColor = C.wallGlow;
    ctx.shadowBlur  = 14;
    ctx.stroke();

    // Sharp line pass
    ctx.beginPath();
    this._buildWallPaths(ctx, maze, cs);
    ctx.strokeStyle = C.wall;
    ctx.lineWidth   = 1.8;
    ctx.shadowBlur  = 0;
    ctx.stroke();

    // Exit arrow
    ctx.save();
    ctx.translate(ex + cs / 2, ey + cs / 2);
    ctx.strokeStyle = `rgba(255,160,60,${0.6 + 0.4 * pulse})`;
    ctx.lineWidth   = 2.5;
    ctx.shadowColor = '#ff8040';
    ctx.shadowBlur  = 12 * pulse;
    ctx.beginPath();
    ctx.moveTo(-cs * 0.18, 0);
    ctx.lineTo( cs * 0.22, 0);
    ctx.moveTo( cs * 0.10, -cs * 0.14);
    ctx.lineTo( cs * 0.22,  0);
    ctx.lineTo( cs * 0.10,  cs * 0.14);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  _buildWallPaths(ctx, maze, cs) {
    for (let y = 0; y < maze.rows; y++) {
      for (let x = 0; x < maze.cols; x++) {
        const cell = maze.grid[y][x];
        const px = x * cs, py = y * cs;
        if (cell.walls.n) { ctx.moveTo(px, py);      ctx.lineTo(px + cs, py);      }
        if (cell.walls.w) { ctx.moveTo(px, py);      ctx.lineTo(px, py + cs);      }
        if (cell.walls.s && y === maze.rows - 1) { ctx.moveTo(px, py + cs); ctx.lineTo(px + cs, py + cs); }
        if (cell.walls.e && x === maze.cols - 1) { ctx.moveTo(px + cs, py); ctx.lineTo(px + cs, py + cs); }
      }
    }
  }

  // ─── Layer 2: Path Awareness ─────────────────────────────────────────────────
  _drawAwareness(ctx, maze, player, alpha) {
    const cs     = CELL;
    const hints  = Pathfinder.getLocalHints(maze, player.gridX, player.gridY, 5);
    const pulse  = 0.6 + 0.4 * Math.sin(this.time * 5);

    for (const hint of hints.values()) {
      const nb  = maze.getCell(hint.x, hint.y);
      const cx  = hint.x * cs + cs / 2;
      const cy  = hint.y * cs + cs / 2;
      const fade = (1 - hint.dist / 6);

      if (nb.isDeadEnd) {
        // Dim red wash
        ctx.fillStyle = `${C.deadEnd}${alpha * 0.38 * fade})`;
        ctx.fillRect(hint.x * cs, hint.y * cs, cs, cs);
      } else if (nb.isJunction) {
        // Pulsing green halo
        ctx.beginPath();
        ctx.arc(cx, cy, cs * 0.28 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `${C.junction}${alpha * 0.3 * pulse})`;
        ctx.fill();
        ctx.strokeStyle = `${C.junction}${alpha * 0.7})`;
        ctx.lineWidth   = 1.5;
        ctx.shadowColor = '#32ff84';
        ctx.shadowBlur  = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (nb.onSolution) {
        // Subtle solution glow
        ctx.fillStyle = `${C.solution}${alpha * 0.18 * fade})`;
        ctx.fillRect(hint.x * cs, hint.y * cs, cs, cs);
      }
    }
  }

  // ─── Layer 3: Trail ─────────────────────────────────────────────────────────
  _drawTrail(ctx, player, alpha) {
    const cs  = CELL;
    const len = player.trail.length;

    for (let i = 0; i < len; i++) {
      const t  = player.trail[i];
      const ag = i / len;  // 0 = oldest, 1 = newest
      const a  = ag * alpha * 0.65;
      if (a < 0.02) continue;

      const r = cs * (0.08 + 0.1 * ag);
      ctx.beginPath();
      ctx.arc(t.x * cs + cs / 2, t.y * cs + cs / 2, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(160,80,255,${a})`;
      ctx.fill();
    }

    // Connect trail with a faint line
    if (len > 1) {
      ctx.beginPath();
      ctx.moveTo(player.trail[0].x * cs + cs / 2, player.trail[0].y * cs + cs / 2);
      for (let i = 1; i < len; i++) {
        ctx.lineTo(player.trail[i].x * cs + cs / 2, player.trail[i].y * cs + cs / 2);
      }
      ctx.strokeStyle = `rgba(150,70,255,${alpha * 0.25})`;
      ctx.lineWidth   = 2;
      ctx.setLineDash([4, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ─── Layer 3: Causality arrows ───────────────────────────────────────────────
  _drawCausality(ctx, maze, player, alpha) {
    const cs      = CELL;
    const cell    = maze.getCell(player.gridX, player.gridY);
    if (!cell || !cell.isJunction) return;

    const arrows = Pathfinder.getCausalityArrows(maze, player.gridX, player.gridY);
    const cx     = player.gridX * cs + cs / 2;
    const cy     = player.gridY * cs + cs / 2;

    ctx.font      = `bold ${cs * 0.38}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const { dx, dy, good, deadEnd } of arrows) {
      const tx = cx + dx * cs * 0.55;
      const ty = cy + dy * cs * 0.55;
      const sym = dx === 1 ? '→' : dx === -1 ? '←' : dy === -1 ? '↑' : '↓';

      if (good) {
        ctx.fillStyle   = `rgba(77,255,140,${alpha})`;
        ctx.shadowColor = C.arrowGood;
        ctx.shadowBlur  = 16;
        ctx.fillText(sym, tx, ty);
        ctx.shadowBlur  = 0;
      } else if (deadEnd) {
        ctx.fillStyle   = `rgba(255,60,40,${alpha * 0.85})`;
        ctx.shadowColor = C.arrowBad;
        ctx.shadowBlur  = 10;
        ctx.fillText('✕', tx, ty);
        ctx.shadowBlur  = 0;
      }
    }
  }

  // ─── Layer 4: Counterfactual ghost paths ─────────────────────────────────────
  _drawCounterfactual(ctx, maze, player, alpha) {
    const cs    = CELL;
    const paths = Pathfinder.getCounterfactualPaths(maze, player);
    const pulse = 0.4 + 0.6 * Math.sin(this.time * 2.2);

    ctx.setLineDash([cs * 0.22, cs * 0.18]);
    ctx.lineWidth   = 2.5;
    ctx.shadowColor = C.ghost;
    ctx.shadowBlur  = 12;

    for (const path of paths) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(255,150,60,${alpha * 0.7 * pulse})`;
      ctx.moveTo(path[0].x * cs + cs / 2, path[0].y * cs + cs / 2);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x * cs + cs / 2, path[i].y * cs + cs / 2);
      }
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
  }

  // ─── Player ──────────────────────────────────────────────────────────────────
  _drawPlayer(ctx, player) {
    const cs = CELL;
    const px = player.renderX * cs + cs / 2;
    const py = player.renderY * cs + cs / 2;
    const r  = cs * 0.28;

    // Outer glow ring
    ctx.beginPath();
    ctx.arc(px, py, r * 1.6, 0, Math.PI * 2);
    const glow = ctx.createRadialGradient(px, py, r * 0.5, px, py, r * 1.6);
    glow.addColorStop(0, 'rgba(255,180,80,0.25)');
    glow.addColorStop(1, 'rgba(255,140,0,0)');
    ctx.fillStyle = glow;
    ctx.fill();

    // Body
    ctx.shadowColor = C.playerGlow;
    ctx.shadowBlur  = 18;
    const grad = ctx.createRadialGradient(px - r * 0.3, py - r * 0.3, r * 0.05, px, py, r);
    grad.addColorStop(0, '#ffe8a0');
    grad.addColorStop(1, '#e07800');
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Shine
    ctx.beginPath();
    ctx.arc(px - r * 0.28, py - r * 0.28, r * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,220,0.45)';
    ctx.fill();
  }

  // ─── HUD ─────────────────────────────────────────────────────────────────────
  _drawHUD(ctx, W, H, zoom) {
    const level  = zoom.targetLevel;
    const name   = zoom.name;
    const color  = zoom.color;

    const pillW = 270, pillH = 42;
    const pillX = W / 2 - pillW / 2;
    const pillY = H - 68;

    // Glass pill
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(4,4,22,0.85)';
    this._roundRect(ctx, pillX, pillY, pillW, pillH, 22);
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.5;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 10;
    this._roundRect(ctx, pillX, pillY, pillW, pillH, 22);
    ctx.stroke();
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;

    // Level dots
    const dotStartX = pillX + 20;
    const dotY      = pillY + pillH / 2;
    for (let i = 0; i <= 4; i++) {
      const active = i <= level;
      ctx.beginPath();
      ctx.arc(dotStartX + i * 14, dotY, active ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle   = active ? color : 'rgba(255,255,255,0.18)';
      if (active) { ctx.shadowColor = color; ctx.shadowBlur = 8; }
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Level name
    ctx.font         = 'bold 12px Inter, sans-serif';
    ctx.fillStyle    = color;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor  = color;
    ctx.shadowBlur   = 8;
    ctx.fillText(`ZOOM · ${name}`, pillX + pillW / 2 + 26, dotY);
    ctx.shadowBlur   = 0;
    ctx.restore();
  }

  // util
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
