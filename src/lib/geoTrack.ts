// Geographic track helpers for the first-person ride view.
// Pure functions, no map dependency, so they can be unit-tested with vitest.

/** [lon, lat, elevationM?] — same order as GeoJSON. */
export type GeoPoint = [number, number, number?];

export interface GeoTrack {
  lon: Float64Array;
  lat: Float64Array;
  ele: Float64Array; // NaN when unknown
  /** cumulative horizontal distance from start, metres */
  dist: Float64Array;
  lengthM: number;
}

export interface TrackSample {
  lon: number;
  lat: number;
  ele: number; // NaN when unknown
  index: number; // segment start index
}

const R = 6371008.8;
const rad = Math.PI / 180;

export function haversineM(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dLat = (lat2 - lat1) * rad,
    dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial bearing a→b in degrees (0 = north, clockwise). */
export function bearingDeg(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const y = Math.sin((lon2 - lon1) * rad) * Math.cos(lat2 * rad);
  const x =
    Math.cos(lat1 * rad) * Math.sin(lat2 * rad) -
    Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lon2 - lon1) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

/** Builds a track, dropping duplicate consecutive points (zero-length segments). */
export function buildGeoTrack(points: GeoPoint[]): GeoTrack {
  const kept: GeoPoint[] = [];
  for (const p of points) {
    const last = kept[kept.length - 1];
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    if (last && haversineM(last[0], last[1], p[0], p[1]) < 0.05) continue;
    kept.push(p);
  }
  if (kept.length < 2) throw new Error("Geo track needs at least two distinct points");
  const n = kept.length;
  const track: GeoTrack = {
    lon: new Float64Array(n),
    lat: new Float64Array(n),
    ele: new Float64Array(n),
    dist: new Float64Array(n),
    lengthM: 0,
  };
  for (let i = 0; i < n; i++) {
    const [lon, lat, ele] = kept[i];
    track.lon[i] = lon;
    track.lat[i] = lat;
    track.ele[i] = Number.isFinite(ele) ? (ele as number) : NaN;
    if (i > 0) track.dist[i] = track.dist[i - 1] + haversineM(track.lon[i - 1], track.lat[i - 1], lon, lat);
  }
  track.lengthM = track.dist[n - 1];
  return track;
}

/** Binary search for the segment containing distance d. */
function segmentIndex(t: GeoTrack, d: number): number {
  let lo = 0,
    hi = t.dist.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t.dist[mid] <= d) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Position at distance d (clamped to the track). Linear interpolation is fine at segment sizes of metres. */
export function sampleTrack(t: GeoTrack, d: number): TrackSample {
  const dd = Math.min(Math.max(d, 0), t.lengthM);
  const i = segmentIndex(t, dd);
  const j = Math.min(i + 1, t.dist.length - 1);
  const span = t.dist[j] - t.dist[i];
  const f = span > 0 ? (dd - t.dist[i]) / span : 0;
  return {
    lon: t.lon[i] + (t.lon[j] - t.lon[i]) * f,
    lat: t.lat[i] + (t.lat[j] - t.lat[i]) * f,
    ele: t.ele[i] + (t.ele[j] - t.ele[i]) * f,
    index: i,
  };
}

/**
 * Look-ahead heading: average of unit vectors towards several points ahead
 * (weighted towards the near ones). This cuts GPS zig-zag noise and makes the
 * camera start turning slightly before a bend, like a rider looking into it.
 */
export function lookAheadBearing(t: GeoTrack, d: number, aheadM = 25, samples = 6): number {
  // near the finish, keep looking along the last aheadM metres
  const base = Math.max(0, Math.min(d, t.lengthM - aheadM - 0.5));
  const from = sampleTrack(t, base);
  let x = 0,
    y = 0;
  for (let k = 1; k <= samples; k++) {
    const target = sampleTrack(t, base + (aheadM * k) / samples);
    const b = bearingDeg(from.lon, from.lat, target.lon, target.lat) * rad;
    const w = 1 / k;
    x += Math.sin(b) * w;
    y += Math.cos(b) * w;
  }
  return (Math.atan2(x, y) / rad + 360) % 360;
}

/** Grade in % from the track's own elevations, centred window. NaN if elevations are missing. */
export function trackGrade(t: GeoTrack, d: number, windowM = 30): number {
  const a = sampleTrack(t, d - windowM / 2),
    b = sampleTrack(t, d + windowM / 2);
  const run = Math.min(t.lengthM, d + windowM / 2) - Math.max(0, d - windowM / 2);
  return run > 1 ? ((b.ele - a.ele) / run) * 100 : 0;
}

/** Shortest signed angle difference b - a in degrees, in (-180, 180]. */
export function angleDelta(a: number, b: number): number {
  return ((((b - a) % 360) + 540) % 360) - 180;
}

/**
 * Maps the trainer's ride distance onto the geo track.
 * TrainerLab's route length (lengthKm) is not necessarily equal to the geo
 * track length, so we go through the route ratio (0..1) the backend uses.
 */
export function rideToTrackDistance(track: GeoTrack, ratio: number): number {
  return Math.min(Math.max(ratio, 0), 1) * track.lengthM;
}
