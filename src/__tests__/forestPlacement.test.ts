import { expect, it } from 'vitest';
import { chooseForestSpecies, forestHash } from '../lib/forestPlacement';
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
