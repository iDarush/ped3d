import numpy as np, os, json
from PIL import Image, ImageDraw, ImageFont
T='out/textures'; P='out/docs'; os.makedirs(P,exist_ok=True)
def L(f): return np.asarray(Image.open(f).convert('L')).astype(float)
res={}
for f in sorted(os.listdir(T)):
    a=L(os.path.join(T,f))
    inner=np.median([np.abs(a[:,i]-a[:,i+1]).mean() for i in range(7,a.shape[1]-8,64)])
    innerv=np.median([np.abs(a[i]-a[i+1]).mean() for i in range(7,a.shape[0]-8,64)])
    res[f]=dict(size=Image.open(os.path.join(T,f)).size, bytes=os.path.getsize(os.path.join(T,f)),
        seam_x=round(np.abs(a[:,0]-a[:,-1]).mean()/inner,2), seam_y=round(np.abs(a[0]-a[-1]).mean()/innerv,2))
    print(f,res[f])
json.dump(res,open('out/docs/seam_check.json','w'),indent=1)
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',22)
# strip: existing forestfloor + three new, each as 2x2 tiles (seam visible if any), with stats
roles=[('forestfloor (existing)','existing/forestfloor.jpg'),('forest_grass','out/textures/forest_grass.jpg'),('forest_leaves','out/textures/forest_leaves.jpg'),('forest_rock','out/textures/forest_rock.jpg')]
S=512; img=Image.new('RGB',(S*4,S+40),(30,30,30)); d=ImageDraw.Draw(img)
for i,(n,f) in enumerate(roles):
    t=Image.open(f).convert('RGB').resize((S//2,S//2),Image.LANCZOS)
    for x in range(2):
        for y in range(2): img.paste(t,(i*S+x*S//2,y*S//2))
    m=np.asarray(Image.open(f).convert('RGB')).reshape(-1,3).mean(0)
    d.text((i*S+8,S+8),f"{n}  mean {m.round().astype(int).tolist()}",fill=(230,230,230),font=font)
img.save(f'{P}/ground_strip_2x2tiles.jpg',quality=90)
# raw (unadjusted) vs adjusted
raw=[('grass raw','dl/tc130/ground_0009_color_1k.jpg'),('leaves raw','dl/tc243/ground_0028_color_1k.jpg'),('rock raw','dl/tc265/ground_0035_color_1k.jpg')]
img=Image.new('RGB',(S*3,S*2+40),(30,30,30)); d=ImageDraw.Draw(img)
for i,((n,f),(n2,f2)) in enumerate(zip(raw,roles[1:])):
    img.paste(Image.open(f).convert('RGB').resize((S,S)),(i*S,0)); img.paste(Image.open(f2).convert('RGB').resize((S,S)),(i*S,S))
    d.text((i*S+8,8),n,fill='white',font=font); d.text((i*S+8,S+8),n2+' (adjusted)',fill='white',font=font)
img.save(f'{P}/raw_vs_adjusted.jpg',quality=88)
