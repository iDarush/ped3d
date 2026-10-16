import {expect,it} from 'vitest';
import {packFloorLayer,parseForestFloor,FLOOR_ROTATIONS} from '../lib/forestFloor';

it('packs linear alpha and flips rows exactly once, preserving RGB',()=>{
  const rgb=new Uint8ClampedArray([1,2,3,255,4,5,6,255,7,8,9,255,10,11,12,255]);
  const alpha=new Uint8ClampedArray([20,0,0,255,40,0,0,255,60,0,0,255,80,0,0,255]);
  expect([...packFloorLayer(rgb,alpha,2)]).toEqual([7,8,9,60,10,11,12,80,1,2,3,20,4,5,6,40]);
  expect(rgb[0]).toBe(1);
  expect(()=>packFloorLayer(rgb,alpha,3)).toThrow();
});
it('rotates normal directions back from layer UV space while preserving height/AO and Z',()=>{
  const rgb=new Uint8ClampedArray([255,128,128,255]),alpha=new Uint8ClampedArray([69,0,0,255]);
  for(const rotation of FLOOR_ROTATIONS){
    const p=packFloorLayer(rgb,alpha,1,rotation),x=p[0]/127.5-1,y=p[1]/127.5-1,[c,s]=rotation;
    expect(c*x-s*y).toBeCloseTo(1,2);
    expect(s*x+c*y).toBeCloseTo(1/255,2);
    expect(p[2]).toBe(128);expect(p[3]).toBe(69);
  }
  expect([...packFloorLayer(rgb,alpha,1,FLOOR_ROTATIONS[0])]).toEqual([255,128,128,69]);
});
it('keeps legacy scenes opt-in and provides reproducible floor stages',()=>{
  expect(parseForestFloor(null,false)).toBe('off');
  expect(parseForestFloor(null,true)).toBe('full');
  expect(parseForestFloor('0')).toBe('off');
  expect(parseForestFloor('base')).toBe('base');
  expect(parseForestFloor('1',false)).toBe('full');
});
