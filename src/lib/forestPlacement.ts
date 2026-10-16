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

export function forestGrassRegion(x:number,z:number,roadFree:(x:number,z:number)=>number,weights:(x:number,z:number)=>number[]) {
  const free=roadFree(x,z);if(free<0.6)return false;
  if(free>=1&&free<=4)return true;
  const w=weights(x,z);
  if(w[2]>.25)return [[4,0],[-4,0],[0,4],[0,-4]].some(([dx,dz])=>weights(x+dx,z+dz)[2]<.25);
  return w[0]>.5&&[[8,0],[-8,0],[0,8],[0,-8]].some(([dx,dz])=>weights(x+dx,z+dz)[2]>.4);
}

/** A coordinate hash is the tree's persistent ID, independent of model slots. */
export function treeRootRing(x:number,z:number) {
  const count=3+Math.floor(forestHash(x,z,210)*4),phase=forestHash(x,z,211)*Math.PI*2;
  return Array.from({length:count},(_,i)=>{
    const angle=phase+(i+forestHash(x,z,212+i)*.45)*Math.PI*2/count;
    const radius=Math.sqrt(.3*.3+forestHash(x,z,220+i)*(1.2*1.2-.3*.3));
    return {x:x+Math.cos(angle)*radius,z:z+Math.sin(angle)*radius,scale:.65+forestHash(x,z,230+i)*.3,yaw:forestHash(x,z,240+i)*Math.PI*2};
  });
}
