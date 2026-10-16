import {expect,it} from 'vitest';
import * as THREE from 'three';
import {createForestFog,updateForestWall,BINS,SECTORS} from '../lib/forestFog';
it('keeps an open wall sector clear even when its accumulated path crossed a forest',()=>{
  const fog=createForestFog({weight:(x)=>x<0?1:0,color:new THREE.Color(),near:12,far:140,maxDist:256});
  fog.update(-100,0);
  const bytes=(fog.uniforms.uFFTex.value as THREE.DataTexture).image.data as Uint8Array;
  // East ray has crossed 100 m of forest, but its distant endpoint is a field.
  expect(bytes[(BINS-1)*2]).toBeGreaterThan(0);
  expect(bytes[(BINS-1)*2+1]).toBe(0);
  const west=((SECTORS/2)*BINS+BINS-1)*2;
  expect(bytes[west+1]).toBe(255);
  expect(fog.path(256,0)).toBeGreaterThan(80);
  fog.dispose();
});
it('places the wall under crowns relative to terrain, independently of camera elevation',()=>{
  const wall=new THREE.Mesh(new THREE.CylinderGeometry(1,1,1,16,1,true));
  const ground=(x:number,z:number)=>70+x*.04-z*.02;
  updateForestWall(wall,100,200,140,ground);
  const position=wall.geometry.getAttribute('position'),uv=wall.geometry.getAttribute('uv');
  for(let i=0;i<position.count;i++){
    const y=ground(100+position.getX(i)*140,200+position.getZ(i)*140);
    expect(position.getY(i)-y).toBeCloseTo(uv.getY(i)*46-40,4);
    expect(position.getY(i)-y).toBeLessThanOrEqual(6.0001);
  }
  expect(wall.position.y).toBe(0);expect(wall.scale.y).toBe(1);
  wall.geometry.dispose();
});
