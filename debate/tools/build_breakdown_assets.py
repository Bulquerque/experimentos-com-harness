from __future__ import annotations
from pathlib import Path
import json, numpy as np, hashlib, shutil
from PIL import Image
from scipy.ndimage import binary_propagation,binary_dilation,gaussian_filter
R=Path(__file__).resolve().parents[1]
sources={'lia':'lia_breakdown_original.gif','dante':'dante_breakdown_original.gif'}
# Normalize all actor frames on the same 512 x 576 canvas as the previous seven states.
# Masked regions are transparent; source RGB is only transformed to remove halo.
BG_LIA=np.array([3.,250.,2.],dtype='float32')

def extract_lia(rgb):
 v=np.asarray(rgb.convert('RGB'),dtype='float32')
 r,g,b=np.moveaxis(v,2,0)
 chroma=g-np.maximum(r,b)
 # 8-bit green screen: background dominance is typically >225, edge hair is mixed.
 k=np.clip((chroma-19)/207,0,1)
 k=np.where((g>75)&(g>np.maximum(r,b)*1.16),k,0)
 k=np.where(chroma>=226,1.,k)
 a=1-k
 fg=(v-(1-a[...,None])*BG_LIA)/np.maximum(a[...,None],0.06)
 fg=np.clip(fg,0,255)
 result=np.uint8(np.rint(np.concatenate([fg,np.clip(a[...,None]*255,0,255)],axis=2)))
 result[result[:,:,3]==0,:3]=0
 return result

def extract_dante(rgb):
 v=np.asarray(rgb.convert('RGB'),dtype='float32')
 lo=v.min(axis=2);hi=v.max(axis=2)
 spread=hi-lo
 # The GIF is matted against a BAKED-IN light gray checkerboard, not actual alpha.
 # Only the neutral checker pixels connected to the outer border are classified
 # as background: white blouse and skin inside dark contours must be preserved.
 light=(lo>212)&(spread<18)
 seeds=np.zeros(light.shape,dtype=bool)
 seeds[0,:]=light[0,:];seeds[-1,:]=light[-1,:];seeds[:,0]=light[:,0];seeds[:,-1]=light[:,-1]
 bg=binary_propagation(seeds,mask=light)
 # Pixel-level edge antialiasing: fade the first 1-2 px surrounding checker.
 # Preserve all wholly internal opaque whites, which shouldn't touch bg directly.
 shade=gaussian_filter(bg.astype('float32'),sigma=.55)
 a=1-np.maximum(bg.astype('float32'),np.clip((shade-.17)*1.2,0,.68))
 # If a near-background gray retains a bit of halo, lower its alpha at that edge.
 a=np.clip(a,0,1)
 neutral=np.array([246.,246.,246.],dtype='float32')
 fg=(v-(1-a[...,None])*neutral)/np.maximum(a[...,None],0.09)
 fg=np.clip(fg,0,255)
 result=np.uint8(np.rint(np.concatenate([fg,a[...,None]*255],axis=2)))
 result[result[:,:,3]==0,:3]=0
 return result

def classify_edges(rgb,person):
 v=np.array(rgb.convert('RGB'))
 if person=='lia':
  fg=~((v[:,:,1]>85)&(v[:,:,1]-np.maximum(v[:,:,0],v[:,:,2])>55))
 else:
  fg=~((v.min(axis=2)>212)&((v.max(axis=2)-v.min(axis=2))<18))
 return {edge:bool(x.any()) for edge,x in {
  'left':fg[:,:3],'right':fg[:,-3:], 'top':fg[:3,:], 'bottom':fg[-3:,:]
 }.items()}

manifest_path=R/'app/assets/actors-v22/manifest.json'
m=json.loads(manifest_path.read_text())
quality={}
for person,source in sources.items():
 src=R/'sources/breakdown'/source
 orig=Image.open(src)
 assert orig.n_frames==8
 dest=R/'app/assets/actors-v22'/person/'breakdown';dest.mkdir(parents=True,exist_ok=True)
 # Store true GIF originals for an auditable, reproducible conversion.
 origdir=R/'sources/breakdown';origdir.mkdir(parents=True,exist_ok=True)
 if src.resolve() != (origdir/f'{person}_breakdown_original.gif').resolve():
  shutil.copyfile(src,origdir/f'{person}_breakdown_original.gif')
 quality[person]={'sourceSize':orig.size,'sourceSHA256':hashlib.sha256(src.read_bytes()).hexdigest(),'border_contacts':[],'alphaFrameStats':[]}
 entries=[]
 for i in range(8):
  orig.seek(i);rgb=orig.convert('RGB')
  matte=extract_lia(rgb) if person=='lia' else extract_dante(rgb)
  # same placement as original 7 states; constant canvas and no auto-cropping
  canvas=np.zeros((576,512,4),dtype='uint8')
  x=(512-orig.width)//2;y=56
  assert y+orig.height <= 576
  canvas[y:y+orig.height,x:x+orig.width]=matte
  img=Image.fromarray(canvas,'RGBA')
  p=dest/f'{i+1:02d}.png';img.save(p,optimize=True)
  assert img.getchannel('A').getextrema()==(0,255)
  quality[person]['border_contacts'].append(classify_edges(rgb,person))
  quality[person]['alphaFrameStats'].append({'frame':i+1,'transparent_pixels':int(np.count_nonzero(canvas[:,:,3]==0)), 'bbox':img.getbbox()})
  entries.append({'frame':f'actors-v22/{person}/breakdown/{i+1:02d}.png','duration_ms':205 if person=='lia' else 185})
 m['animations'][f'{person}/breakdown']=entries
 # Preview as animated APNG with true alpha (not GIF with baked background).
 preview=R/'previews/breakdown';preview.mkdir(parents=True,exist_ok=True)
 frames=[Image.open(dest/f'{j+1:02d}.png') for j in range(8)]
 frames[0].save(preview/f'{person}_breakdown.png',save_all=True,append_images=frames[1:],duration=[z['duration_ms'] for z in entries],loop=0,disposal=2,blend=0)
 print(person,'converted 8 frames',orig.size)
m['version']='v23-transparent-actors-breakdown'
m['states']=['idle','talking','thinking','confident','objection','surprised','frustrated','breakdown']
m['durations_ms']['breakdown']={'lia':205,'dante':185}
m['notes']='16 animações RGBA (8 estados x 2 atores). Breakdown: ação dramática não repetida; preferencialmente acionada por julgamento adverso confirmado, nunca por palavras aleatórias.'
manifest_path.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
(R/'docs/BREAKDOWN_ASSET_QA.json').write_text(json.dumps(quality,indent=2,ensure_ascii=False)+'\n')
print('DONE',len(m['animations']),'states',len(m['states']))
