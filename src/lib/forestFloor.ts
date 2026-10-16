import * as THREE from 'three';

export type ForestFloorMode = 'off' | 'base' | 'leaves' | 'cover' | 'full';
export function parseForestFloor(value: string | null, enabled = true): ForestFloorMode {
  if(value==='0'||!enabled&&value===null)return 'off';
  return value==='base'||value==='leaves'||value==='cover'?value:'full';
}
export const FLOOR_LAYERS = ['forestfloor','forest_grass','forest_leaves','forest_rock'] as const;

/** Raw data textures cannot use UNPACK_FLIP_Y. Match TextureLoader's flipY
 * while preserving RGB and copying linear height/AO into the alpha channel. */
export function packFloorLayer(rgb: Uint8ClampedArray, alpha: Uint8ClampedArray, size: number) {
  if(rgb.length!==size*size*4||alpha.length!==rgb.length)throw new Error('Invalid floor layer dimensions');
  const out=new Uint8Array(rgb.length);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const from=(y*size+x)*4,to=((size-1-y)*size+x)*4;
    out[to]=rgb[from];out[to+1]=rgb[from+1];out[to+2]=rgb[from+2];out[to+3]=alpha[from];
  }
  return out;
}

export async function loadForestFloor(base: string, normals: boolean, normalSize: number, anisotropy: number) {
  const loader=new THREE.ImageLoader();
  const pack=async (suffix: string, alphaSuffix: string, size: number, srgb: boolean)=>{
    const images=await Promise.all(FLOOR_LAYERS.map(async n=>Promise.all([loader.loadAsync(base+n+suffix+'.jpg'),loader.loadAsync(base+n+alphaSuffix+'.jpg')])));
    const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
    const context=canvas.getContext('2d',{willReadFrequently:true});
    if(!context)throw new Error('Canvas unavailable for forest floor arrays');
    const pixels=(image:HTMLImageElement)=>{context.drawImage(image,0,0,size,size);return context.getImageData(0,0,size,size).data;};
    const data=new Uint8Array(size*size*4*FLOOR_LAYERS.length);
    images.forEach(([rgb,alpha],i)=>data.set(packFloorLayer(pixels(rgb),pixels(alpha),size),i*size*size*4));
    const texture=new THREE.DataArrayTexture(data,size,size,FLOOR_LAYERS.length);
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
    texture.generateMipmaps=true;texture.anisotropy=Math.min(8,anisotropy);
    texture.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;
    texture.name=srgb?'forest-floor-color-height':'forest-floor-normal-ao';
    texture.needsUpdate=true;
    return texture;
  };
  const color=await pack('','_h',1024,true);
  try {
    const normal=normals?await pack('_n','_orm',normalSize,false):undefined;
    return {color,normal,dispose:()=>{color.dispose();normal?.dispose();}};
  } catch(error){color.dispose();throw error;}
}

export const floorPars = `
precision highp sampler2DArray;
uniform sampler2DArray uFloor;
#ifdef GROUND_NORMALS
uniform sampler2DArray uFloorN;
#endif
const vec4 FL_TILE=vec4(2.2,1.2,1.4,2.6);
vec2 flRotation(int layer){
 return layer==1?vec2(0.6,0.8):layer==2?vec2(-0.28,0.96):layer==3?vec2(0.96,-0.28):vec2(1.0,0.0);
}
vec2 flTurn(vec2 p,int layer){vec2 r=flRotation(layer);return mat2(r.x,r.y,-r.y,r.x)*p;}
vec4 flSample(sampler2DArray tex,vec2 p,int layer,vec2 dx,vec2 dy){
 return textureGrad(tex,vec3(flTurn(p,layer)/FL_TILE[layer]+float(layer)*vec2(0.37,0.61),float(layer)),flTurn(dx,layer)/FL_TILE[layer],flTurn(dy,layer)/FL_TILE[layer]);
}
float flBlend(float mask,float baseHeight,float layerHeight){
 float a=layerHeight*0.5+mask,b=baseHeight*0.5+1.0-mask,limit=max(a,b)-0.2;
 float wa=max(a-limit,0.0),wb=max(b-limit,0.0);
 return wa/(wa+wb+0.00001);
}
`;

// Initially an exact color-path replacement of tileTex(uForest,...).
export function floorColorGlsl(mode: ForestFloorMode) {
  const cover=mode==='cover'||mode==='full';
  return `
vec3 flW=vec3(0.0);
vec2 fwp=vWPos.xz;
vec2 flDx=dFdx(fwp),flDy=dFdy(fwp);
float flFade=1.0-smoothstep(90.0,140.0,length(vWPos-cameraPosition));
vec3 forestc=vec3(0.0);
if(sp.b>0.0){
 vec4 flBase=flSample(uFloor,fwp,0,flDx,flDy);
 mat2 flMacroR=mat2(0.8,-0.6,0.6,0.8);
 float flMacro=dot(textureGrad(uFloor,vec3(flMacroR*fwp/29.0,0.0),flMacroR*flDx/29.0,flMacroR*flDy/29.0).rgb,vec3(0.33));
 vec3 flColor=flBase.rgb;float flHeight=flBase.a;
 ${mode!=='base'?`
 if(sp.b>0.01&&flFade>0.0){
  ${cover?`
  float flSlope=1.0-clamp(normalize(vWN).y,0.0,1.0);
  float flRock=smoothstep(0.78,0.85,shNoise(fwp/13.0+31.7)*0.75+shNoise(fwp/3.0)*0.25+1.2*flSlope)*(1.0-0.6*groundShade.g)*flFade;
  if(flRock>0.002){
   vec4 layer=flSample(uFloor,fwp,3,flDx,flDy);
   flW.z=flBlend(flRock,flHeight,layer.a);
   flColor=mix(flColor,layer.rgb,flW.z);flHeight=mix(flHeight,layer.a,flW.z);
  }`:''}
  float flLeaves=smoothstep(0.62,0.69,shNoise(fwp/4.0+11.0)*0.5+shNoise(fwp/1.3+3.0)*0.35+shNoise(fwp/0.45)*0.15+0.2*groundShade.r+0.3*groundShade.g-0.12)*flFade;
  if(flLeaves>0.002){
   vec4 layer=flSample(uFloor,fwp,2,flDx,flDy);
   flW.y=flBlend(flLeaves,flHeight,layer.a);
   flColor=mix(flColor,layer.rgb,flW.y);flHeight=mix(flHeight,layer.a,flW.y);
   flW.z*=1.0-flW.y;
  }
  ${cover?`
  float flGrass=smoothstep(0.46,0.54,shNoise(fwp/9.0-7.0)*0.55+shNoise(fwp/3.0+9.0)*0.3+shNoise(fwp/0.6)*0.15+0.45*(1.0-groundShade.r)-0.25*groundShade.g-0.18)*flFade;
  if(flGrass>0.002){
   vec4 layer=flSample(uFloor,fwp,1,flDx,flDy);
   flW.x=flBlend(flGrass,flHeight,layer.a);
   flColor=mix(flColor,layer.rgb,flW.x);flW.yz*=1.0-flW.x;
  }`:''}
 }`:''}
 flColor*=0.65+0.9*flMacro/max(0.05,dot(flColor,vec3(0.33))*0.5+0.5*flMacro);
 forestc=mix(flColor,tileTex(uMoss,fwp*0.7),(0.08+mossPatch*0.55)*(1.0-dot(flW,vec3(1.0))));
}
`;
}
export function floorNormalGlsl(_mode: ForestFloorMode) {
  return 'vec3 nF=flSample(uFloorN,fwp,0,flDx,flDy).xyz*2.0-1.0;';
}
