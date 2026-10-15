import { describe, it, expect } from "vitest";
import { smoothRoad } from "../lib/roadCurve";

describe("road curve stays inside the existing road bed", () => {
  it("bounds horizontal displacement and preserves height, width and endpoints", () => {
    const points = [{ x: 0, z: 0, y: 4, w: 3 }, { x: 10, z: 0, y: 5, w: 4 }, { x: 10, z: 10, y: 7, w: 5 }];
    const before = JSON.stringify(points);
    const out = smoothRoad(points);
    expect(out[0]).toEqual(points[0]);
    expect(out.at(-1)).toEqual(points.at(-1));
    for (let i = 0; i < 10; i++) {
      const segment = Math.floor(i / 5), t = (i % 5) / 5;
      const a = points[segment], b = points[segment + 1];
      expect(Math.hypot(out[i].x - (a.x + (b.x - a.x) * t), out[i].z - (a.z + (b.z - a.z) * t))).toBeLessThanOrEqual(0.350001);
      expect(out[i].y).toBeCloseTo(a.y + (b.y - a.y) * t);
      expect(out[i].w).toBeCloseTo(a.w + (b.w - a.w) * t);
    }
    expect(JSON.stringify(points)).toBe(before);
  });

  it("handles repeated coordinates without producing invalid geometry", () => {
    const out = smoothRoad([{ x: 0, z: 0, w: 3 }, { x: 0, z: 0, w: 3 }, { x: 2, z: 1, w: 3 }]);
    expect(out.every((p) => Number.isFinite(p.x) && Number.isFinite(p.z))).toBe(true);
    expect(out.every((p) => p.y === undefined)).toBe(true);
  });
});
