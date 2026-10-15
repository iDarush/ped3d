import { CatmullRomCurve3, Vector3 } from "three";

export interface RoadPoint { x: number; z: number; w: number; y?: number }

/** Round the ridden ribbon without moving it out of its flattened road bed.
 * Height and width stay linearly interpolated; only horizontal tangents curve.
 */
export function smoothRoad(points: RoadPoint[], step = 2, maxOffset = 0.35): RoadPoint[] {
  if (points.length < 3) return points;
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(p.x, 0, p.z)), false, "centripetal");
  const sample = new Vector3();
  const out: RoadPoint[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step));
    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      curve.getPoint((i + t) / (points.length - 1), sample);
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      const dx = sample.x - x, dz = sample.z - z;
      const scale = Math.min(1, maxOffset / (Math.hypot(dx, dz) || 1));
      out.push({ x: x + dx * scale, z: z + dz * scale, w: a.w + (b.w - a.w) * t,
        y: a.y !== undefined && b.y !== undefined ? a.y + (b.y - a.y) * t : undefined });
    }
  }
  out.push({ ...points[points.length - 1] });
  return out;
}
