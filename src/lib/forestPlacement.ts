/** Stable, coordinate-based identity: independent of refill and source ordering. */
export function forestHash(x: number, z: number, salt = 0) {
  let n = Math.imul(Math.round(x * 100), 374761393) ^ Math.imul(Math.round(z * 100), 668265263) ^ salt;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export function chooseForestSpecies(x: number, z: number, available: string[], shrub = false) {
  const weights: Record<string, number> = shrub ? { abelia: 0.6, cistus: 0.4 } : { birch: 0.35, alder: 0.25, gentree: 0.2, maple: 0.2 };
  const total = available.reduce((n, id) => n + (weights[id] ?? 0), 0);
  let r = forestHash(x, z, 73) * total;
  for (const id of available) { r -= weights[id] ?? 0; if (r < 0) return id; }
  return available[available.length - 1];
}
