import { Maze               } from './maze.js';
import { Player             } from './player.js';
import { ZoomEngine         } from './zoom.js';
import { Renderer           } from './renderer.js';
import { GestureInterpreter } from './gestures.js';

// ─── Animated maze background on start screen ────────────────────────────────
function initBgCanvas() {
  const bg  = document.getElementById('bgCanvas');
  const ctx = bg.getContext('2d');
  let bgMaze, time = 0;

  function resize() {
    bg.width  = window.innerWidth;
    bg.height = window.innerHeight;
    bgMaze = new Maze(Math.ceil(bg.width / 44) + 2, Math.ceil(bg.height / 44) + 2);
  }

  function drawBg(ts) {
    if (!bg.isConnected) return;
    time = ts / 1000;
    const cs = 44;
    ctx.clearRect(0, 0, bg.width, bg.height);

    // Draw a slowly-pulsing maze grid
    ctx.lineWidth = 1.2;
    for (let y = 0; y < bgMaze.rows; y++) {
      for (let x = 0; x < bgMaze.cols; x++) {
        const cell = bgMaze.grid[y][x];
        const px = x * cs - 22, py = y * cs - 22;
        const dist = Math.hypot(x / bgMaze.cols - 0.5, y / bgMaze.rows - 0.5);
        const phase  = Math.sin(time * 0.6 + dist * 6) * 0.5 + 0.5;
        const alpha  = 0.15 + 0.25 * phase * (1 - dist * 1.2);
        ctx.strokeStyle = `rgba(0,180,255,${Math.max(0, alpha)})`;
        ctx.beginPath();
        if (cell.walls.n) { ctx.moveTo(px,    py);    ctx.lineTo(px+cs, py);    }
        if (cell.walls.w) { ctx.moveTo(px,    py);    ctx.lineTo(px,    py+cs); }
        ctx.stroke();
      }
    }

    requestAnimationFrame(drawBg);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(drawBg);
}

// ─── Main Game class ─────────────────────────────────────────────────────────
class Game {
  constructor() {
    this.state  = 'menu';
    this.maze   = null;
    this.player = null;
    this.zoom   = new ZoomEngine();

    this.canvas  = document.getElementById('gameCanvas');
    this.video   = document.getElementById('webcamVideo');
    this.renderer = new Renderer(this.canvas);
    this.gestures = new GestureInterpreter();

    this.cameraEnabled = false;
    this.lastTime      = 0;

    // Keyboard state
    this.keys      = {};
    this.lastMove  = 0;
    this.moveCd    = 170;  // ms between moves

    // Stats
    this.startTime = 0;
    this.maxZoom   = 0;

    this._bindUI();
    this._bindKeys();
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  // ─── UI bindings ────────────────────────────────────────────────────────────
  _bindUI() {
    document.getElementById('startBtn')
      .addEventListener('click', () => this._requestCamera());

    document.getElementById('skipCameraBtn')
      .addEventListener('click', () => this._beginGame(false));

    document.getElementById('newMazeBtn')
      .addEventListener('click', () => this._newMaze());

    document.getElementById('newMazeBtnWin')
      .addEventListener('click', () => {
        document.getElementById('winOverlay').style.display = 'none';
        this._newMaze();
      });

    document.getElementById('backMenuBtn')
      .addEventListener('click', () => location.reload());
  }

  _bindKeys() {
    const DIR = {
      ArrowUp: { dx:0, dy:-1 }, w: { dx:0, dy:-1 },
      ArrowDown:  { dx:0, dy:1  }, s: { dx:0, dy:1  },
      ArrowLeft:  { dx:-1,dy:0  }, a: { dx:-1,dy:0  },
      ArrowRight: { dx:1, dy:0  }, d: { dx:1, dy:0  },
    };

    window.addEventListener('keydown', e => {
      this.keys[e.key] = true;

      if (e.key === '=' || e.key === '+') this.zoom.setTargetLevel(this.zoom.targetLevel + 1);
      if (e.key === '-' || e.key === '_') this.zoom.setTargetLevel(this.zoom.targetLevel - 1);
      if ((e.key === 'r' || e.key === 'R') && this.state === 'playing') this._newMaze();

      // Immediate move on first keydown
      if (this.state === 'playing' && DIR[e.key]) {
        const now = performance.now();
        if (now - this.lastMove > this.moveCd) {
          const { dx, dy } = DIR[e.key];
          if (this.player.tryMove(dx, dy, this.maze)) this.lastMove = now;
        }
      }

      // Prevent page scroll
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', e => { delete this.keys[e.key]; });
  }

  // ─── Camera permission flow ──────────────────────────────────────────────────
  async _requestCamera() {
    const btn    = document.getElementById('startBtn');
    const status = document.getElementById('cameraStatus');
    const loader = document.getElementById('cameraLoader');

    btn.disabled    = true;
    btn.textContent = 'Enabling camera…';
    loader.style.display = 'flex';
    status.textContent   = 'Requesting camera permission…';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      this.video.srcObject = stream;
      await this.video.play();

      status.textContent = 'Loading AI hand model…';

      await this.gestures.init();

      status.textContent = '';
      loader.style.display = 'none';
      this._beginGame(true);

    } catch (err) {
      console.warn('Camera/MediaPipe error:', err);
      loader.style.display = 'none';
      status.textContent   = 'Camera unavailable — using keyboard only.';
      btn.disabled         = false;
      btn.innerHTML        = '⌨ Play with Keyboard';
      btn.onclick          = () => this._beginGame(false);
    }
  }

  // ─── Start game ─────────────────────────────────────────────────────────────
  _beginGame(withCamera) {
    this.cameraEnabled = withCamera;

    document.getElementById('startScreen').style.display   = 'none';
    document.getElementById('gameContainer').style.display = 'block';

    if (withCamera) {
      document.getElementById('webcamContainer').style.display = 'block';
    }

    this._newMaze();
    requestAnimationFrame(ts => this._loop(ts));
  }

  _newMaze() {
    this.maze      = new Maze(21, 21);
    this.player    = new Player(0, 0);
    this.zoom      = new ZoomEngine();
    this.state     = 'playing';
    this.startTime = Date.now();
    this.maxZoom   = 0;
    document.getElementById('winOverlay').style.display = 'none';
  }

  // ─── Game loop ───────────────────────────────────────────────────────────────
  _loop(ts) {
    const dt = Math.min((ts - this.lastTime) / 1000, 0.1);
    this.lastTime = ts;

    if (this.state === 'playing' || this.state === 'complete') {
      this._update(dt);
      this.renderer.render(this.maze, this.player, this.zoom, dt);
    }

    requestAnimationFrame(t => this._loop(t));
  }

  _update(dt) {
    if (this.state !== 'playing') return;

    // ── Gestures ──
    if (this.cameraEnabled && this.gestures.ready) {
      this.gestures.detect(this.video);

      const zl = this.gestures.getZoomLevel();
      this.zoom.setTargetLevel(zl);

      const dir = this.gestures.getMoveDirection();
      if (dir) {
        const now = performance.now();
        if (now - this.lastMove > this.moveCd) {
          if (this.player.tryMove(dir.dx, dir.dy, this.maze)) this.lastMove = now;
        }
      }
    }

    // ── Held keyboard movement ──
    const DIR = {
      ArrowUp: { dx:0, dy:-1 }, w: { dx:0, dy:-1 },
      ArrowDown:  { dx:0, dy:1  }, s: { dx:0, dy:1  },
      ArrowLeft:  { dx:-1,dy:0  }, a: { dx:-1,dy:0  },
      ArrowRight: { dx:1, dy:0  }, d: { dx:1, dy:0  },
    };

    const now = performance.now();
    if (now - this.lastMove > this.moveCd) {
      for (const [key, dir] of Object.entries(DIR)) {
        if (this.keys[key]) {
          if (this.player.tryMove(dir.dx, dir.dy, this.maze)) {
            this.lastMove = now;
          }
          break;
        }
      }
    }

    // ── Update subsystems ──
    this.player.update(dt);
    this.zoom.update(dt);

    // Track max zoom used (for win stats)
    if (this.zoom.targetLevel > this.maxZoom) this.maxZoom = this.zoom.targetLevel;

    // ── Win condition ──
    if (
      this.player.gridX === this.maze.end.x &&
      this.player.gridY === this.maze.end.y &&
      !this.player.moving
    ) {
      this._showWin();
    }
  }

  _showWin() {
    this.state = 'complete';
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);

    document.getElementById('stepsCount').textContent   = this.player.steps;
    document.getElementById('timeCount').textContent    = `${elapsed}s`;
    document.getElementById('insightCount').textContent = this.maxZoom;
    document.getElementById('winOverlay').style.display = 'flex';
  }

  _resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
initBgCanvas();
new Game();
