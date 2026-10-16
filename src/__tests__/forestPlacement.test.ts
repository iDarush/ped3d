import { expect, it } from 'vitest';
import { chooseForestSpecies, forestHash, forestGrassRegion, treeRootRing } from '../lib/forestPlacement';
it('keeps world identities independent of lookup order and renderer refills', () => {
  const points = [[0,0],[-12.3,77.1],[1200,-910]];
  const first = points.map(([x,z]) => [forestHash(x,z), chooseForestSpecies(x,z,['birch','alder','gentree','maple'])]);
  const second = [...points].reverse().map(([x,z]) => [forestHash(x,z), chooseForestSpecies(x,z,['birch','alder','gentree','maple'])]).reverse();
  expect(second).toEqual(first);
  expect(forestHash(12,34,1)).not.toBe(forestHash(12,34,2));
});
it('renormalizes species weights over the available manifest subset', () => {
  for(let i=0;i<500;i++) {
    expect(chooseForestSpecies(i*7,-i*13,['maple'])).toBe('maple');
    expect(['alder','birch']).toContain(chooseForestSpecies(i,-i,['alder','birch']));
  }
});

it('keeps texture tufts off the road and out of deep forest or open field interiors', () => {
  const forest=()=>[0,0,1,0],field=()=>[1,0,0,0];
  expect(forestGrassRegion(0,0,()=>-1,forest)).toBe(false);
  expect(forestGrassRegion(0,0,()=>0.3,field)).toBe(false);
  expect(forestGrassRegion(0,0,()=>2,field)).toBe(true);
  expect(forestGrassRegion(0,0,()=>20,forest)).toBe(false);
  expect(forestGrassRegion(0,0,()=>20,field)).toBe(false);
  expect(forestGrassRegion(0,0,()=>20,(x)=>x>=4?field():forest())).toBe(true);
});

it('keeps root rings deterministic with 3–6 low clumps inside the specified annulus',()=>{
  for(const [x,z] of [[0,0],[-17.3,83.1],[900,1200]]) {
    const ring=treeRootRing(x,z);
    expect(treeRootRing(x,z)).toEqual(ring);
    expect(ring.length).toBeGreaterThanOrEqual(3);expect(ring.length).toBeLessThanOrEqual(6);
    for(const p of ring){expect(Math.hypot(p.x-x,p.z-z)).toBeGreaterThanOrEqual(.3-1e-9);expect(Math.hypot(p.x-x,p.z-z)).toBeLessThanOrEqual(1.2+1e-9);expect(p.scale).toBeLessThanOrEqual(.95);}
  }
});
