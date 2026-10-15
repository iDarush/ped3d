import { describe, expect, it } from "vitest";
import { angleDelta, buildGeoTrack, lookAheadBearing, sampleTrack, trackGrade } from "../lib/geoTrack";
import { RideClock } from "../lib/rideClock";

// 1 km due north then 1 km due east, climbing 10 m on the first leg
const north = 1000 / 111195;
const track = buildGeoTrack([
  [10, 46, 100],
  [10, 46 + north, 110],
  [10, 46 + north, 110], // duplicate is dropped
  [10 + 1000 / (111195 * Math.cos((46 * Math.PI) / 180)), 46 + north, 110],
]);

describe("geoTrack", () => {
  it("measures length and drops duplicates", () => {
    expect(track.lon.length).toBe(3);
    expect(track.lengthM).toBeGreaterThan(1990);
    expect(track.lengthM).toBeLessThan(2010);
  });
  it("interpolates position and elevation", () => {
    const p = sampleTrack(track, 500);
    expect(p.ele).toBeCloseTo(105, 1);
    expect(p.lat).toBeCloseTo(46 + north / 2, 6);
  });
  it("heads north on the first leg and east after the corner", () => {
    expect(Math.abs(angleDelta(0, lookAheadBearing(track, 200)))).toBeLessThan(1);
    expect(Math.abs(angleDelta(90, lookAheadBearing(track, 1500)))).toBeLessThan(1);
    const atCorner = lookAheadBearing(track, 990);
    expect(atCorner).toBeGreaterThan(10); // already turning into the bend
  });
  it("computes grade from track elevations", () => {
    expect(trackGrade(track, 500)).toBeCloseTo(1, 1);
    expect(trackGrade(track, 1500)).toBeCloseTo(0, 5);
  });
});

describe("RideClock", () => {
  it("extrapolates between 2 Hz updates and never runs backwards", () => {
    const c = new RideClock();
    c.update(100, 36, 0); // 10 m/s
    let last = c.tick(0);
    for (let t = 16; t <= 500; t += 16) {
      const d = c.tick(t);
      expect(d).toBeGreaterThanOrEqual(last);
      last = d;
    }
    expect(last).toBeGreaterThan(103.5);
    expect(last).toBeLessThan(105.5);
  });
  it("snaps on lap reset", () => {
    const c = new RideClock();
    c.update(5000, 30, 0);
    c.tick(0);
    c.update(2, 30, 500);
    expect(c.tick(516)).toBeLessThan(10);
  });
});
