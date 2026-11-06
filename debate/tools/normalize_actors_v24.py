#!/usr/bin/env python3
"""Contraponto v24 — normalize face / body scale across all 16 states.

This tool does not redraw frames. One scale + one translation for all eight frames
of a state; keeps internal motion intact. Uses first-frame connected skin region
as reproducible approximate facial anchor, and outputs (1) full 640x800 master,
(2) 512x576 stage sprite with no lateral cuts and a podium-safe lower fade.
"""
from __future__ import annotations
import cv2,numpy as np,json,csv,shutil,zipfile,hashlib
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
STATES=['idle','talking','thinking','confident','objection','surprised','frustrated','breakdown']
ACTORS=['lia','dante']
FULL_SIZE=(640,800)
VIEW_SIZE=(512,576)
PAD=(64,64)
TARGETS={'lia':{'faceWidth':96,'center':[281.0,198.0]},'dante':{'faceWidth':130,'center':[247.0,199.0]}}


def facial_region(im:Image.Image):
    raw=np.asarray(im.convert('RGBA'));rgb=raw[:,:,:3].astype('int16')
    r,g,b=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2];a=raw[:,:,3]
    mask=((r>160)&(g>95)&(b>65)&(r>g*1.1)&(r<g*1.95)&(g>b*1.03)&(a>170)).astype('uint8')*255
    mask[325:,:]=0
    mask=cv2.morphologyEx(mask,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
    count,_,stats,_=cv2.connectedComponentsWithStats(mask)
    candidates=[]
    for i in range(1,count):
        x,y,w,h,area=map(int,stats[i])
        if area>1000 and 80<y<230 and 150<x+w/2<370:
            candidates.append((area,[x,y,w,h]))
    if not candidates:
        raise ValueError('Face region not found in neutral first frame; requires manual QA')
    return max(candidates,key=lambda x:x[0])[1]


def nontransparent_box(img:Image.Image,threshold=8):
    a=np.array(img.getchannel('A'))
    ys,xs=np.nonzero(a>threshold)
    if len(xs)==0:raise ValueError('Transparent empty frame')
    return [int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())]


def output_frame(original,scale,oldcenter,targetcenter):
    # Scaled art is composited on a *larger* fully transparent canvas first.
    # Pillow's RGBA resampling preserves alpha coverage better than naive RGB interpolation.
    sw,sh=original.size
    resized=original.resize((round(sw*scale),round(sh*scale)),Image.Resampling.LANCZOS)
    paste_x=round(PAD[0]+targetcenter[0]-oldcenter[0]*scale)
    paste_y=round(PAD[1]+targetcenter[1]-oldcenter[1]*scale)
    master=Image.new('RGBA',FULL_SIZE,(0,0,0,0))
    master.alpha_composite(resized,(paste_x,paste_y))
    # Stage crop removes only transparent horizontal padding: never side-clips art.
    view=master.crop((PAD[0],PAD[1],PAD[0]+VIEW_SIZE[0],PAD[1]+VIEW_SIZE[1]))
    # Lower 68 px are *behind* podium in both desktop/mobile variants. Fade
    # prevents a hard leg/coat cutoff when browsing the sprite catalog alone.
    pixels=np.array(view)
    ramp=np.ones((VIEW_SIZE[1],),dtype=np.float32)
    start=508
    ramp[start:]=np.linspace(1.0,0.0,VIEW_SIZE[1]-start)
    pixels[:,:,3]=np.rint(pixels[:,:,3]*ramp[:,None]).astype('uint8')
    view=Image.fromarray(pixels,'RGBA')
    return master,view,{'paste':[paste_x,paste_y],'scaledSize':[resized.width,resized.height]}


def main():
    asset_root=ROOT/'app/assets/actors-v22'
    originalzip=ROOT/'sources/geometry_v23_1_input.zip'
    if not originalzip.exists():raise FileNotFoundError(originalzip)
    info=[]; audit=[]
    params={}
    with zipfile.ZipFile(originalzip) as original:
      for actor in ACTORS:
       params[actor]={};t=TARGETS[actor]
       for state in STATES:
        prefix=f'{actor}/{state}/'
        source=lambda i:Image.open(original.open(prefix+f'{i:02}.png')).convert('RGBA')
        example=source(1)
        assert example.size==(512,576), (actor,state,example.size)
        x,y,w,h=facial_region(example)
        scale=t['faceWidth']/w
        facecenter=(x+w/2,y+h/2)
        # fixed affine transform throughout 8 frames: no per-frame zoom jitter
        state_meta={'actor':actor,'state':state,'referenceFaceBBox':[x,y,w,h],
            'originalFaceCenter':list(facecenter),'targetFaceCenter':t['center'],
            'scale':round(scale,6),'sourceDimensions':[512,576],
            'masterDimensions':list(FULL_SIZE),'stageDimensions':list(VIEW_SIZE),
            'frames':[]}
        params[actor][state]=state_meta
        stage_dir=asset_root/actor/state
        master_dir=ROOT/'sources/full_geometry_v24'/actor/state
        stage_dir.mkdir(parents=True,exist_ok=True)
        master_dir.mkdir(parents=True,exist_ok=True)
        for i in range(1,9):
          im=source(i)
          full,stage,render_meta=output_frame(im,scale,facecenter,t['center'])
          fullbbox=nontransparent_box(full)
          stagebbox=nontransparent_box(stage)
          # Uncropped normalized master must keep >=14 pixels on all sides.
          assert fullbbox[0]>=14 and fullbbox[1]>=14 and fullbbox[2]<FULL_SIZE[0]-14 and fullbbox[3]<FULL_SIZE[1]-14,(actor,state,i,fullbbox)
          # Stage must never clip *lateral/top* content, including fingers/hair.
          assert stagebbox[0]>=18 and stagebbox[2]<=VIEW_SIZE[0]-19 and stagebbox[1]>=18,(actor,state,i,stagebbox)
          assert stagebbox[3]<VIEW_SIZE[1]-1,(actor,state,i,stagebbox)
          full.save(master_dir/f'{i:02}.png',optimize=False,compress_level=2)
          stage.save(stage_dir/f'{i:02}.png',optimize=False,compress_level=2)
          data={'actor':actor,'state':state,'frame':i,'scale':round(scale,5),
              'oldFaceWidth':w,'normalizedFaceWidth':round(scale*w,2),
              'stageBBox':stagebbox,'masterBBox':fullbbox,
              'stageMargins':[stagebbox[0],stagebbox[1],VIEW_SIZE[0]-1-stagebbox[2],VIEW_SIZE[1]-1-stagebbox[3]],
              **render_meta}
          state_meta['frames'].append(data); audit.append(data)
        info.append(f'{actor:<6} {state:<11} scale={scale:.3f} oldFaceWidth={w} stage min-margin={min(min(a["stageMargins"][:3]) for a in state_meta["frames"])}')
    (ROOT/'docs/geometry_v24.json').write_text(json.dumps({'method':'One affine transform per state, skin segmentation of first frame only; all 8 frames share transform. Full artwork preserved as 640x800 masters, cropped stage frame 512x576 with fade only after y508.', 'reference':TARGETS,'characters':params},ensure_ascii=False,indent=2)+'\n')
    with (ROOT/'docs/geometry_v24.csv').open('w',encoding='utf-8-sig',newline='') as fp:
      cols=['actor','state','frame','scale','oldFaceWidth','normalizedFaceWidth','stageBBox','masterBBox','stageMargins','paste','scaledSize']
      writer=csv.DictWriter(fp,fieldnames=cols);writer.writeheader();writer.writerows(audit)
    print('\n'.join(info))
    print('SUCCESS: 128 stage sprites (512x576), 128 full normalized masters (640x800)')

if __name__=='__main__':main()
