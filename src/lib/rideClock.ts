// TrainerLab pushes state over WebSocket every ~500 ms. Rendering at 60 fps needs a
// smooth distance in between: extrapolate with the current speed and gently pull
// towards the server value (dead reckoning + soft correction).

export class RideClock {
  private displayed = 0;
  private serverD = 0;
  private serverAt = 0;
  private speedMs = 0;
  private lastFrame = 0;
  private initialised = false;

  /** Feed a server sample. `now` in ms (performance.now()). */
  update(distanceM: number, speedKph: number, now = performance.now()): void {
    const prevPredicted = this.predicted(now);
    this.serverD = distanceM;
    this.serverAt = now;
    this.speedMs = Math.max(0, speedKph) / 3.6;
    // lap reset / jump / first sample: snap instead of easing across the route
    if (!this.initialised || Math.abs(distanceM - prevPredicted) > 60) {
      this.displayed = distanceM;
      this.initialised = true;
    }
  }

  private predicted(now: number): number {
    // never extrapolate more than 2 s past the last packet (connection drop)
    return this.serverD + this.speedMs * Math.min(2, (now - this.serverAt) / 1000);
  }

  /** Advance one frame and return the smoothed distance. */
  tick(now = performance.now()): number {
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 0;
    this.lastFrame = now;
    const error = this.predicted(now) - this.displayed;
    // move with the rider plus a correction that removes the error in ~0.5 s;
    // never run backwards visibly
    this.displayed += Math.max(0, this.speedMs * dt + error * Math.min(1, 2 * dt));
    return this.displayed;
  }
}
