/**
 * Player state: grid position, smooth render position, trail history.
 */
export class Player {
  constructor(x, y) {
    this.gridX   = x;
    this.gridY   = y;
    this.renderX = x;   // interpolated (float)
    this.renderY = y;
    this.targetX = x;
    this.targetY = y;

    this.moving    = false;
    this.moveSpeed = 10;  // cells per second

    this.trail    = [{ x, y }];
    this.maxTrail = 60;

    // Junction choices for Level 4 counterfactual
    this.junctionChoices = [];

    this.steps = 0;
    this.state = 'idle'; // idle | moving | finished
  }

  /**
   * Attempt to move the player by (dx, dy).
   * Returns true if the move was accepted.
   */
  tryMove(dx, dy, maze) {
    if (this.moving) return false;
    if (!maze.canMove(this.gridX, this.gridY, dx, dy)) return false;

    const wasJunction = maze.getCell(this.gridX, this.gridY)?.isJunction;
    const fromX = this.gridX;
    const fromY = this.gridY;

    this.gridX += dx;
    this.gridY += dy;
    this.targetX = this.gridX;
    this.targetY = this.gridY;
    this.moving  = true;
    this.steps++;

    // Record trail
    this.trail.push({ x: this.gridX, y: this.gridY });
    if (this.trail.length > this.maxTrail) this.trail.shift();

    // Record junction choice for Level 4
    if (wasJunction) {
      this.junctionChoices.push({
        from: { x: fromX, y: fromY },
        to:   { x: this.gridX, y: this.gridY },
        dir:  { dx, dy },
      });
      if (this.junctionChoices.length > 20) this.junctionChoices.shift();
    }

    return true;
  }

  update(dt) {
    if (!this.moving) return;

    const speed = this.moveSpeed * dt;
    const dx    = this.targetX - this.renderX;
    const dy    = this.targetY - this.renderY;
    const dist  = Math.hypot(dx, dy);

    if (dist < 0.04) {
      this.renderX = this.targetX;
      this.renderY = this.targetY;
      this.moving  = false;
    } else {
      const step = Math.min(speed, dist);
      this.renderX += (dx / dist) * step;
      this.renderY += (dy / dist) * step;
    }
  }
}
