import { forestHash } from './forestPlacement';

export type VergeKind='field'|'forest'|'meadow';
export interface VergeSample { kind:VergeKind; field:number; free:number; shoulder:number }
export interface FieldVerge { sample:(x:number,z:number)=>VergeSample; hasFieldTile?:(ix:number,iz:number)=>boolean }
export function vergeKind(w:readonly number[]):VergeKind {
  if(w[2]>.25)return 'forest';
  return w[1]>.5&&w[2]<.25?'field':'meadow';
}

/** Baked, side-specific classification at 4/6/8 m beyond the asphalt. Majority
 * along route distance -10/0/+10 m is independent of camera position/refills.
 * A segment grid gives exact edge distance without scallops between samples. */
export function createFieldVerge(track:Float32Array,weights:(x:number,z:number)=>number[]):FieldVerge {
  const count=track.length/6,grid=new Map<string,number[]>(),fieldTiles=new Set<string>(),size=16;
  const raw:VergeKind[][]=[[],[]],smooth:VergeKind[][]=[[],[]];
  const at=(distance:number)=>{
    let lo=0,hi=count-1;
    while(lo<hi){const mid=(lo+hi)>>1;if(track[mid*6+3]<distance)lo=mid+1;else hi=mid;}
    return lo;
  };
  for(let i=0;i<count;i++){
    const a=Math.max(0,i-1),b=Math.min(count-1,i+1),dx=track[b*6]-track[a*6],dz=track[b*6+2]-track[a*6+2],length=Math.hypot(dx,dz)||1;
    for(let side=0;side<2;side++){
      const sum=[0,0,0],sign=side===0?-1:1;
      for(const offset of [4,6,8]){
        const d=(track[i*6+4]/2+offset)*sign,w=weights(track[i*6]-dz/length*d,track[i*6+2]+dx/length*d);
        for(let c=0;c<3;c++)sum[c]+=w[c]/3;
      }
      raw[side][i]=vergeKind(sum);
    }
  }
  for(let side=0;side<2;side++)for(let i=0;i<count;i++){
    const votes=[raw[side][at(track[i*6+3]-10)],raw[side][i],raw[side][at(track[i*6+3]+10)]];
    smooth[side][i]=votes.find(kind=>votes.filter(v=>v===kind).length>=2)??raw[side][i];
  }
  for(let i=0;i<count-1;i++){
    const x=track[i*6],z=track[i*6+2],xx=track[(i+1)*6],zz=track[(i+1)*6+2];
    const pad=Math.max(track[i*6+4],track[(i+1)*6+4])/2+12;
    if(smooth.some(side=>side[i]==='field'||side[i+1]==='field')){
      const fieldPad=pad-12+2.601;
      for(let gx=Math.floor((Math.min(x,xx)-fieldPad)/8);gx<=Math.floor((Math.max(x,xx)+fieldPad)/8);gx++)
        for(let gz=Math.floor((Math.min(z,zz)-fieldPad)/8);gz<=Math.floor((Math.max(z,zz)+fieldPad)/8);gz++)fieldTiles.add(`${gx},${gz}`);
    }
    for(let gx=Math.floor((Math.min(x,xx)-pad)/size);gx<=Math.floor((Math.max(x,xx)+pad)/size);gx++)
      for(let gz=Math.floor((Math.min(z,zz)-pad)/size);gz<=Math.floor((Math.max(z,zz)+pad)/size);gz++){
        const key=`${gx},${gz}`;let list=grid.get(key);if(!list)grid.set(key,list=[]);list.push(i);
      }
  }
  return {hasFieldTile:(ix,iz)=>fieldTiles.has(`${ix},${iz}`),sample:(x,z)=>{
    let best=Infinity,index=-1,fraction=0,px=0,pz=0,tx=0,tz=0;
    for(const i of grid.get(`${Math.floor(x/size)},${Math.floor(z/size)}`)??[]){
      const ax=track[i*6],az=track[i*6+2],dx=track[(i+1)*6]-ax,dz=track[(i+1)*6+2]-az,l2=dx*dx+dz*dz;
      if(l2<1e-8)continue;
      const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/l2)),qx=ax+t*dx,qz=az+t*dz,d2=(x-qx)**2+(z-qz)**2;
      if(d2>=best)continue;
      best=d2;index=i;fraction=t;px=qx;pz=qz;tx=dx;tz=dz;
    }
    if(index<0)return {kind:vergeKind(weights(x,z)),field:0,free:Infinity,shoulder:Infinity};
    const side=(x-px)*-tz+(z-pz)*tx<0?0:1;
    const a=smooth[side][index],b=smooth[side][index+1],field=(a==='field'?1-fraction:0)+(b==='field'?fraction:0);
    const width=track[index*6+4]*(1-fraction)+track[(index+1)*6+4]*fraction,free=Math.sqrt(best)-width/2;
    const shoulderWidth=.4*(1+.22*Math.sin(px*.37+pz*.23)+.13*Math.sin(pz*1.1));
    return {kind:field>=.5?'field':(fraction<.5?a:b),field,free,shoulder:free-shoulderWidth};
  }};
}

export interface FieldTuft { x:number;z:number;id:string;dry:boolean;variant:number;scale:number;yaw:number }
export function fieldVergeTufts(ix:number,iz:number,k:number,sample:FieldVerge['sample']) {
  const out:FieldTuft[]=[];
  const append=(x:number,z:number,tall=false)=>{
    if(Math.floor(x/8)!==ix||Math.floor(z/8)!==iz)return;
    const region=sample(x,z);if(region.kind!=='field'||region.free<.6||region.free>2.6)return;
    const h=forestHash(x,z,330),scale=forestHash(x,z,332);
    const id=tall?'digitaria':h<.45?'ammophila':h<.68?'setaria':h<.9?'digitaria':forestHash(x,z,334)<.5?'setaria':'ammophila';
    const dry=tall||h<.9;
    const s=tall?2+scale:id==='ammophila'?(dry ? .9+scale*.9 : .9+scale*.5):id==='setaria'?(dry ? 1+scale*.6 : .9+scale*.5):1.8+scale;
    out.push({x,z,id,dry,variant:Math.floor(forestHash(x,z,331)*2),scale:s,yaw:forestHash(x,z,333)*Math.PI*2});
  };
  // Include neighbouring group centres, then assign every tuft to exactly one
  // tile. Jitter across a tile boundary must neither disappear nor duplicate.
  for(let gx=ix*4-1;gx<=(ix+1)*4;gx++)for(let gz=iz*4-1;gz<=(iz+1)*4;gz++){
    const x=gx*2+1,z=gz*2+1,region=sample(x,z);
    if(region.kind!=='field'||region.free<.6||region.free>2.6||forestHash(x,z,301)>=Math.min(1,.62*k))continue;
    const n=2+Math.floor(forestHash(x,z,304)*5*k),radius=.25+.65*forestHash(x,z,305);
    for(let i=0;i<n;i++){
      const angle=forestHash(x,z,310+i)*Math.PI*2,r=radius*Math.sqrt(forestHash(x,z,320+i));
      append(x+Math.cos(angle)*r,z+Math.sin(angle)*r);
    }
  }
  for(let gx=ix*10;gx<(ix+1)*10;gx++)for(let gz=iz*10;gz<(iz+1)*10;gz++){
    const x=gx*.8,z=gz*.8;
    if(forestHash(x,z,338)<.06*k)append(x+forestHash(x,z,339)*.8,z+forestHash(x,z,340)*.8,true);
  }
  return out;
}

/** No texture masks/samplers: these inputs come from baked terrain attributes. */
export const fieldVergePars=`
varying vec2 vFieldVerge;
float fvHash(vec2 p){vec3 q=fract(vec3(p.xyx)*0.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float fvNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(fvHash(i),fvHash(i+vec2(1,0)),f.x),mix(fvHash(i+vec2(0,1)),fvHash(i+vec2(1)),f.x),f.y);}
`;
export const fieldVergeWeightsGlsl=`
float fvAmount=vFieldVerge.x;
float fvTransfer=(sp.r+wStub)*fvAmount;
sp.g+=fvTransfer;sp.r*=1.0-fvAmount;wStub*=1.0-fvAmount;
`;
export const fieldVergeColorGlsl=`
if(fvAmount>0.001){
 float fvFine=fvNoise(vWPos.xz*2.5);
 float fvStraw=(1.0-smoothstep(0.2,1.5,vFieldVerge.y+(fvFine-0.5)*0.9))*0.8*clamp(0.55+0.9*fvFine,0.0,1.0);
 vec3 fvColor=dot(grass,vec3(0.333))*vec3(2.3,2.05,1.25);
 fvColor=mix(fvColor,soil*vec3(1.12,1.10,0.98),fvFine);
 col=mix(col,fvColor,fvStraw*fvAmount);
}
`;
