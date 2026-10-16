export const BIRCH_FADE_SECONDS = 0.4;
export interface BirchState { level: number; from: number; to: number; start: number }
export function birchBlend(s: BirchState, now: number) {
  const t = Math.max(0, Math.min(1, (now - s.start) / BIRCH_FADE_SECONDS));
  return s.from + (s.to - s.from) * t * t * (3 - 2 * t);
}

/** Keep a model's identity and LOD until it leaves the retention radius.
 * Outgoing models occupy their slot until fully faded, so transitions never
 * exceed either geometry budget. Cards cover trees waiting for a free slot.
 */
export class BirchSelection {
  readonly states = new Map<number, BirchState>();
  constructor(readonly limits: readonly number[], readonly radius: number, readonly detailRadius = 20) {}
  update(candidates: { i: number; dd: number }[], now: number) {
    const distances = new Map(candidates.map(c => [c.i, Math.sqrt(c.dd)]));
    for (const [i, s] of this.states) {
      const wanted = (distances.get(i) ?? Infinity) <= this.radius + 6;
      if (s.to === 0 && birchBlend(s, now) === 0 && !wanted) {
        this.states.delete(i);
        continue;
      }
      const target = wanted ? 1 : 0;
      if (target !== s.to) {
        s.from = birchBlend(s, now); s.to = target; s.start = now;
      }
    }
    const counts = [0, 0];
    for (const s of this.states.values()) counts[s.level]++;
    for (const { i, dd } of [...candidates].sort((a, b) => a.dd - b.dd || a.i - b.i)) {
      if (this.states.has(i) || dd > this.radius ** 2) continue;
      const level = dd < this.detailRadius ** 2 && counts[0] < this.limits[0] ? 0 : counts[1] < this.limits[1] ? 1 : -1;
      if (level < 0) continue;
      this.states.set(i, { level, from: 0, to: 1, start: now });
      counts[level]++;
    }
  }
}
