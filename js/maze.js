/**
 * Maze generator using Recursive Backtracker (DFS).
 * Each cell stores N/S/E/W wall booleans, plus analysis metadata.
 */
export class Maze {
  constructor(cols = 21, rows = 21) {
    this.cols = cols;
    this.rows = rows;
    this.start = { x: 0, y: 0 };
    this.end   = { x: cols - 1, y: rows - 1 };
    this.grid  = [];

    this._init();
    this._generate();
    this._analyze();
  }

  _init() {
    for (let y = 0; y < this.rows; y++) {
      this.grid[y] = [];
      for (let x = 0; x < this.cols; x++) {
        this.grid[y][x] = {
          x, y,
          walls:      { n: true, s: true, e: true, w: true },
          visited:    false,
          isDeadEnd:  false,
          isJunction: false,
          onSolution: false,
        };
      }
    }
  }

  _generate() {
    const stack = [];
    const origin = this.grid[0][0];
    origin.visited = true;
    stack.push(origin);

    while (stack.length > 0) {
      const current   = stack[stack.length - 1];
      const neighbors = this._unvisitedNeighbors(current);

      if (neighbors.length === 0) {
        stack.pop();
      } else {
        const next = neighbors[Math.floor(Math.random() * neighbors.length)];
        this._carve(current, next);
        next.visited = true;
        stack.push(next);
      }
    }
  }

  _unvisitedNeighbors({ x, y }) {
    const nb = [];
    if (y > 0            && !this.grid[y-1][x].visited) nb.push(this.grid[y-1][x]);
    if (y < this.rows-1  && !this.grid[y+1][x].visited) nb.push(this.grid[y+1][x]);
    if (x > 0            && !this.grid[y][x-1].visited) nb.push(this.grid[y][x-1]);
    if (x < this.cols-1  && !this.grid[y][x+1].visited) nb.push(this.grid[y][x+1]);
    return nb;
  }

  _carve(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    if      (dx ===  1) { a.walls.e = false; b.walls.w = false; }
    else if (dx === -1) { a.walls.w = false; b.walls.e = false; }
    else if (dy ===  1) { a.walls.s = false; b.walls.n = false; }
    else if (dy === -1) { a.walls.n = false; b.walls.s = false; }
  }

  _analyze() {
    // BFS solution path
    this.solutionPath = this.findPath(this.start, this.end);
    for (const { x, y } of this.solutionPath) {
      this.grid[y][x].onSolution = true;
    }

    // Tag each cell
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const cell = this.grid[y][x];
        const open = this._openCount(cell);
        const isStart = x === 0 && y === 0;
        const isEnd   = x === this.cols - 1 && y === this.rows - 1;
        cell.isDeadEnd  = open === 1 && !isStart && !isEnd;
        cell.isJunction = open >= 3;
      }
    }
  }

  _openCount(cell) {
    return Object.values(cell.walls).filter(w => !w).length;
  }

  // Public BFS: finds shortest path between two {x,y} points.
  findPath(start, end) {
    const queue   = [{ x: start.x, y: start.y, path: [{ x: start.x, y: start.y }] }];
    const visited = new Set([`${start.x},${start.y}`]);
    const dirs    = [
      { dx: 0, dy: -1, wall: 'n' },
      { dx: 0, dy:  1, wall: 's' },
      { dx: 1, dy:  0, wall: 'e' },
      { dx:-1, dy:  0, wall: 'w' },
    ];

    while (queue.length > 0) {
      const { x, y, path } = queue.shift();
      if (x === end.x && y === end.y) return path;

      const cell = this.grid[y]?.[x];
      if (!cell) continue;

      for (const { dx, dy, wall } of dirs) {
        if (!cell.walls[wall]) {
          const key = `${x + dx},${y + dy}`;
          if (!visited.has(key)) {
            visited.add(key);
            queue.push({ x: x + dx, y: y + dy, path: [...path, { x: x + dx, y: y + dy }] });
          }
        }
      }
    }
    return [];
  }

  getCell(x, y) {
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return null;
    return this.grid[y][x];
  }

  canMove(x, y, dx, dy) {
    const cell = this.getCell(x, y);
    if (!cell) return false;
    const wallMap = { '0,-1': 'n', '0,1': 's', '1,0': 'e', '-1,0': 'w' };
    return !cell.walls[wallMap[`${dx},${dy}`]];
  }
}
