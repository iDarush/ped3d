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
`;

// Initially an exact color-path replacement of tileTex(uForest,...).
export function floorColorGlsl(_mode: ForestFloorMode) {
  return `
vec3 flW=vec3(0.0);
vec2 fwp=vWPos.xz;
vec3 forestc=vec3(0.0);
if(sp.b>0.0){
 vec4 flBase=texture(uFloor,vec3(fwp/2.2,0.0));
 float flMacro=dot(texture(uFloor,vec3(mat2(0.8,-0.6,0.6,0.8)*fwp/29.0,0.0)).rgb,vec3(0.33));
 vec3 flColor=flBase.rgb;
 flColor*=0.65+0.9*flMacro/max(0.05,dot(flColor,vec3(0.33))*0.5+0.5*flMacro);
 forestc=mix(flColor,tileTex(uMoss,fwp*0.7),0.08+mossPatch*0.55);
}
`;
}
export function floorNormalGlsl(_mode: ForestFloorMode) {
  return 'vec3 nF=texture(uFloorN,vec3(vWPos.xz/2.2,0.0)).xyz*2.0-1.0;';
}
