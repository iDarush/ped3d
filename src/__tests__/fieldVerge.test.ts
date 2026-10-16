import {expect,it} from 'vitest';
import {createFieldVerge,fieldVergeTufts} from '../lib/fieldVerge';

const road=()=>new Float32Array(Array.from({length:101},(_,i)=>[i*2-100,0,0,i*2,5,0]).flat());
it('classifies road sides independently outside the blurred green road band',()=>{
  const v=createFieldVerge(road(),(_x,z)=>Math.abs(z)<5?[1,0,0,0]:z<0?[0,1,0,0]:[0,0,1,0]);
  expect(v.sample(0,-3.5).kind).toBe('field');expect(v.sample(0,3.5).kind).toBe('forest');
  expect(v.sample(1,-3.5).free).toBeCloseTo(1); // between route samples, no scallop
  expect(v.sample(0,-20).field).toBe(0);
});
it('suppresses a short landcover glitch using world-fixed majority samples',()=>{
  const v=createFieldVerge(road(),x=>Math.abs(x)<3?[0,1,0,0]:[0,0,1,0]);
  expect(v.sample(0,-4).kind).toBe('forest');
  for(let x=-2;x<=2;x+=.2)expect(v.sample(x,-4).field).toBe(0);
});
it('skips pure forest tiles without omitting a tile containing dry field groups',()=>{
  const forest=createFieldVerge(road(),()=>[0,0,1,0]);
  const field=createFieldVerge(road(),()=>[0,1,0,0]);
  let found=0;
  for(let x=-12;x<=12;x++)for(let z=-2;z<=1;z++){
    expect(forest.hasFieldTile!(x,z)).toBe(false);
    const tufts=fieldVergeTufts(x,z,1.7,field.sample);
    if(tufts.length){expect(field.hasFieldTile!(x,z)).toBe(true);found++;}
  }
  expect(found).toBeGreaterThan(20);
});
it('keeps dry groups stable across tile order/borders, off asphalt, and denser for C',()=>{
  const sample=(x:number,z:number)=>({kind:'field' as const,field:1,free:Math.abs(z)-2.5,shoulder:Math.abs(z)-2.9});
  const tiles:[number,number][]=[...Array.from({length:30},(_,i):[number,number]=>[i-15,-1]),...Array.from({length:30},(_,i):[number,number]=>[i-15,0])];
  const a=tiles.flatMap(([x,z])=>fieldVergeTufts(x,z,1.7,sample));
  const b=[...tiles].reverse().flatMap(([x,z])=>fieldVergeTufts(x,z,1.7,sample));
  const ids=(p:typeof a)=>p.map(p=>JSON.stringify(p)).sort();
  expect(ids(a)).toEqual(ids(b));expect(new Set(a.map(p=>`${p.x},${p.z}`)).size).toBe(a.length);
  expect(a.length).toBeGreaterThan(tiles.flatMap(([x,z])=>fieldVergeTufts(x,z,1,sample)).length*1.5);
  for(const p of a){expect(sample(p.x,p.z).free).toBeGreaterThanOrEqual(.6);expect(sample(p.x,p.z).free).toBeLessThanOrEqual(2.6);expect(['ammophila','setaria','digitaria']).toContain(p.id);if(p.id==='digitaria')expect(p.dry).toBe(true);}
  const dry=a.filter(p=>p.dry).length/a.length;
  expect(dry).toBeGreaterThan(.87);expect(dry).toBeLessThan(.96);
});
