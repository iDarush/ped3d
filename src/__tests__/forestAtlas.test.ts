import { expect, it } from 'vitest';
import * as THREE from 'three';
import { mirroredForestGeometry } from '../lib/forestAtlas';
it('bakes a mirror without negative instance scale or reversed front faces',()=>{
  const source=new THREE.BufferGeometry();
  source.setAttribute('position',new THREE.Float32BufferAttribute([1,0,0,2,0,0,1,1,0],3));
  source.setAttribute('normal',new THREE.Float32BufferAttribute([0,0,1,0,0,1,0,0,1],3));source.setIndex([0,1,2]);
  const mirror=mirroredForestGeometry(source),p=mirror.getAttribute('position');
  expect(source.getAttribute('position').getX(0)).toBe(1);
  expect(p.getX(0)).toBe(-1);
  expect([...mirror.index!.array]).toEqual([0,2,1]);
  const a=new THREE.Vector3().fromBufferAttribute(p,0),b=new THREE.Vector3().fromBufferAttribute(p,2),c=new THREE.Vector3().fromBufferAttribute(p,1);
  expect(b.sub(a).cross(c.sub(a)).z).toBeGreaterThan(0);
  source.dispose();mirror.dispose();
});
