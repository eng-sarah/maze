/**
 * BFS / path-analysis utilities used by the renderer.
 */
export class Pathfinder {
  static DIRS = [
    { dx: 0, dy: -1, wall: 'n' },
    { dx: 0, dy:  1, wall: 's' },
    { dx: 1, dy:  0, wall: 'e' },
    { dx:-1, dy:  0, wall: 'w' },
  ];

  /**
   * Returns a Map of nearby cells (within `radius` steps) with their
   * path-relevance weight (1 = on solution, 0.5 = corridor, 0.1 = dead end).
   * Used by Level 2 (Awareness) overlay.
   */
  static getLocalHints(maze, px, py, radius = 4) {
    const hints   = new Map();
    const queue   = [{ x: px, y: py, dist: 0 }];
    const visited = new Set([`${px},${py}`]);

    while (queue.length > 0) {
      const { x, y, dist } = queue.shift();
      if (dist >= radius) continue;

      const cell = maze.getCell(x, y);
      if (!cell) continue;

      for (const { dx, dy, wall } of Pathfinder.DIRS) {
        if (!cell.walls[wall]) {
          const nx = x + dx, ny = y + dy;
          const key = `${nx},${ny}`;
          if (!visited.has(key)) {
            visited.add(key);
            const nb = maze.getCell(nx, ny);
            if (nb) {
              const weight = nb.onSolution ? 1.0 : nb.isDeadEnd ? 0.1 : 0.5;
              hints.set(key, { x: nx, y: ny, weight, dist: dist + 1 });
            }
            queue.push({ x: nx, y: ny, dist: dist + 1 });
          }
        }
      }
    }

    return hints;
  }

  /**
   * Returns alternative ghost paths originating from the player's
   * most recent junction choice. Used by Level 4 (Revelation) overlay.
   * Returns an array of cell-arrays (each = one alternative route).
   */
  static getCounterfactualPaths(maze, player) {
    const paths = [];
    if (player.junctionChoices.length === 0) return paths;

    const lastChoice = player.junctionChoices[player.junctionChoices.length - 1];
    const { from, to } = lastChoice;
    const fromCell = maze.getCell(from.x, from.y);
    if (!fromCell) return paths;

    for (const { dx, dy, wall } of Pathfinder.DIRS) {
      if (fromCell.walls[wall]) continue;
      const nx = from.x + dx, ny = from.y + dy;
      if (nx === to.x && ny === to.y) continue; // skip the already-taken path

      // Build alternative path from this direction
      const altFrom = { x: nx, y: ny };
      const altPath = maze.findPath(altFrom, maze.end);
      if (altPath.length > 0) {
        // Prepend the junction cell so the line starts there
        paths.push([{ x: from.x, y: from.y }, ...altPath.slice(0, 10)]);
      }
    }

    return paths;
  }

  /**
   * Returns directions (open from playerCell) that lead toward the solution.
   * Used by Level 3 (Insight) causality overlay.
   */
  static getCausalityArrows(maze, px, py) {
    const cell = maze.getCell(px, py);
    if (!cell) return [];
    const arrows = [];

    for (const { dx, dy, wall } of Pathfinder.DIRS) {
      if (cell.walls[wall]) continue;
      const nb = maze.getCell(px + dx, py + dy);
      if (!nb) continue;
      arrows.push({
        dx, dy,
        good:    nb.onSolution,
        deadEnd: nb.isDeadEnd,
      });
    }
    return arrows;
  }
}
