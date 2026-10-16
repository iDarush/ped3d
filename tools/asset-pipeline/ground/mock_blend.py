"""Mock of the proposed terrain shader logic (numpy). World xz in metres; same value noise as shNoise()."""
import numpy as np, os
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import map_coordinates
T='out/textures'; P='out/docs'
def load(f, srgb=True):
    a=np.asarray(Image.open(f).convert('RGB' if not f.endswith('_h.jpg') else 'L')).astype(np.float32)/255
    return a
def mip(a, px):  # emulate mip level: downsample so one texel ~ one screen pixel
    n=a.shape[0]; k=max(1,int(n/max(1,px)))
    s=n//k
    if k>1: a=np.asarray(Image.fromarray((a*255).astype(np.uint8)).resize((s,s),Image.BOX)).astype(np.float32)/255
    return a
def sample(a, u, v):  # u,v in tiles; bilinear, wrap
    n=a.shape[0]; cu=(u%1)*n-0.5; cv=(v%1)*n-0.5
    if a.ndim==2: return map_coordinates(a,[cv,cu],order=1,mode='grid-wrap')
    return np.stack([map_coordinates(a[...,c],[cv,cu],order=1,mode='grid-wrap') for c in range(3)],-1)
def hsh(x,y): return np.modf(np.sin(x*127.1+y*311.7)*43758.5453)[0]%1.0
def vnoise(x,y):
    ix,iy=np.floor(x),np.floor(y); fx,fy=x-ix,y-iy; fx=fx*fx*(3-2*fx); fy=fy*fy*(3-2*fy)
    a,b,c,d=hsh(ix,iy),hsh(ix+1,iy),hsh(ix,iy+1),hsh(ix+1,iy+1)
    return (a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+d*fx)*fy
def sstep(e0,e1,x): t=np.clip((x-e0)/(e1-e0),0,1); return t*t*(3-2*t)
def hblend(m, hb, hl, depth=0.2, hk=0.5):
    a=hl*hk+m; b=hb*hk+(1-m); ma=np.maximum(a,b)-depth
    wa=np.maximum(a-ma,0); wb=np.maximum(b-ma,0); return wa/(wa+wb+1e-6)
LAYERS={  # role: tile size in metres
 'forestfloor':2.2,'forest_grass':1.2,'forest_leaves':1.4,'forest_rock':2.6}
def render(size_m, px, x0=0, z0=0, label='', ox=20, oz=220):
    x=x0+(np.arange(px)+0.5)/px*size_m; X,Z=np.meshgrid(x,z0+(np.arange(px)+0.5)/px*size_m)
    ppm=px/size_m
    XN,ZN=X+ox,Z+oz
    # synthetic inputs: canopy density cC (forest to the right, clearing bottom-left), contact AO cA at a few trunks, slope
    cC=sstep(8,22,X)*(1-0.6*sstep(5,0,np.hypot(X-30,Z-12)-4)) if size_m>20 else np.full_like(X,0.75)
    trees=[(26,6),(31,20),(36,9),(22,28),(34,33),(15,16),(5.5,3)] if size_m>20 else [(5.5,3)]
    cA=np.zeros_like(X)
    for tx,tz in trees: d=np.hypot(X-tx,Z-tz)/3.0; cA=1-(1-cA)*(1-0.75*np.clip(1-d,0,1)**2)
    slope=sstep(30,40,Z)*0.6 if size_m>20 else np.zeros_like(X)
    tex={r:{k:mip(load(f'{T if r!="forestfloor" else "existing"}/{r}{k}.jpg') if not (r=="forestfloor" and k=="_h") else mip(load(f'{T}/forestfloor_h.jpg'),LAYERS[r]*ppm), LAYERS[r]*ppm) for k in ['','_h','_orm']} for r in LAYERS}
    ROT={'forestfloor':(1.0,0.0),'forest_grass':(0.6,0.8),'forest_leaves':(-0.28,0.96),'forest_rock':(0.96,-0.28)}
    def col(r):
        # fixed per-layer rotation + offset (constant mat2, NOT noise-driven: that swirls/moirés)
        s=LAYERS[r]; cs,sn=ROT[r]; u,v=(XN*cs-ZN*sn)/s+0.37*len(r),(XN*sn+ZN*cs)/s
        return sample(tex[r][''],u,v),sample(tex[r]['_h'],u,v),sample(tex[r]['_orm'],u,v)[...,0]
    # macro modulation exactly like tileTex(): one extra fetch of forestfloor at 29 m, reused for every layer
    ffm=mip(load('existing/forestfloor.jpg'),29*ppm)
    qa,qb=(0.8*XN-0.6*ZN)/29,(0.6*XN+0.8*ZN)/29
    lb=sample(ffm,qa,qb).mean(-1)
    c,h,ao=col('forestfloor')
    # masks (all world-space value noise, no textures)
    nr=vnoise(XN/13+31.7,ZN/13)*0.75+vnoise(XN/3,ZN/3)*0.25
    mR=sstep(0.78,0.85,nr+0.12*slope+0.06*(vnoise(XN/0.7,ZN/0.7)-0.5))*(1-0.6*cA)
    nl=vnoise(XN/4+11,ZN/4)*0.5+vnoise(XN/1.3,ZN/1.3+3)*0.35+vnoise(XN/0.45,ZN/0.45)*0.15
    mL=sstep(0.62,0.69,nl+0.2*cC+0.3*cA-0.12)
    ng=vnoise(XN/9-7,ZN/9)*0.55+vnoise(XN/3,ZN/3+9)*0.3+vnoise(XN/0.6,ZN/0.6)*0.15
    mG=sstep(0.46,0.54,ng+0.45*(1-cC)-0.25*cA-0.18)
    out={}
    for r,m in [('forest_rock',mR),('forest_leaves',mL),('forest_grass',mG)]:
        cl,hl,aol=col(r); t=hblend(m,h,hl)[...,None]
        c=c*(1-t)+cl*t; h=h*(1-t[...,0])+hl*t[...,0]; ao=ao*(1-t[...,0])+aol*t[...,0]; out[r]=float((t>0.5).mean())
    # shading like canopyShade.groundGlsl (k = mix(1, .45, cC), contact AO) + texture AO, no 0.55 forest factor
    la=c.mean(-1); c=c*(0.65+0.9*lb/np.maximum(0.05,la*0.5+0.5*lb))[...,None]
    k=(1-0.55*cC)*(1-0.5*cA)*(0.55+0.45*ao)
    img=np.clip(c*k[...,None]*1.25,0,1)
    im=Image.fromarray((img**1.0*255).astype(np.uint8))
    if label:
        d=ImageDraw.Draw(im); f=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',max(14,px//60))
        d.text((10,10),label+'  cover: '+', '.join(f"{k.split('_')[1]} {v*100:.1f}%" for k,v in out.items()),fill='white',font=f,stroke_width=2,stroke_fill='black')
    return im,out
w,o=render(40,1600,label='mock 40x40 m: open edge (left) -> forest (right), slope at top')
w.save(f'{P}/mock_blend_40m.jpg',quality=90); print('wide',o)
c,o=render(8,1200,x0=2,z0=0,label='close 8x8 m, under canopy, trunk at (5.5,3)')
c.save(f'{P}/mock_blend_8m_close.jpg',quality=90); print('close',o)
