"""Check all 128 stage and 128 uncropped master sprites of Contraponto v24.
Requires Pillow, NumPy (OpenCV not needed for QA)."""
from pathlib import Path
from PIL import Image
import json,zipfile,numpy as np,collections,sys
R=Path(__file__).resolve().parents[1]
info=json.loads((R/'docs/geometry_v24.json').read_text(encoding='utf8'))
m=json.loads((R/'app/assets/actors-v22/manifest.json').read_text(encoding='utf8'))
assert len(m['animations'])==16
n=0;minSide=999;worst=[]
for a in ['lia','dante']:
 for state in ['idle','talking','thinking','confident','objection','surprised','frustrated','breakdown']:
  meta=info['characters'][a][state]
  assert len(meta['frames'])==8
  assert all(abs(f['scale']-meta['scale'])<1e-4 for f in meta['frames'])
  assert abs(meta['scale']*meta['referenceFaceBBox'][2]-info['reference'][a]['faceWidth'])<.01
  for f in meta['frames']:
   i=f['frame'];stage=R/'app/assets/actors-v22'/a/state/f'{i:02}.png';full=R/'sources/full_geometry_v24'/a/state/f'{i:02}.png'
   x=Image.open(stage);y=Image.open(full)
   assert x.size==(512,576) and x.mode=='RGBA' and y.size==(640,800) and y.mode=='RGBA'
   sa=np.asarray(x.getchannel('A'));fa=np.asarray(y.getchannel('A'))
   assert sa.max()==255 and sa.min()==0 and fa.max()==255 and fa.min()==0
   assert sa[:,0].max()==0 and sa[:,-1].max()==0 and sa[0,:].max()==0 and sa[-1,:].max()==0
   assert not np.any(fa[:,0]) and not np.any(fa[:,-1]) and not np.any(fa[0,:]) and not np.any(fa[-1,:])
   side=min(f['stageMargins'][:3]);minSide=min(side,minSide)
   if side<24:worst.append((a,state,i,side))
   n+=1
assert n==128 and minSide>=24,(minSide,worst)
with zipfile.ZipFile(R/'sources/geometry_v23_1_input.zip') as old:
 assert len([k for k in old.namelist() if k.endswith('.png')])==128 and old.testzip() is None
print(f'PASS: {n} sprites palco 512×576 RGBA; {n} masters 640×800; margem mínima topo/lados: {minSide}px; 128 originais preservados.')
