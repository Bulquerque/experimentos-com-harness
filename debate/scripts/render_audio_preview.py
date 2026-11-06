"""Renderiza WAVs ORIGINAIS direto do sintetizador Web Audio do projeto (sem NIM)."""
import base64
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
JS = r'''async (kind) => {
  const sr=24000, seconds=kind==='music'?16:7;
  const ctx=new OfflineAudioContext(2,sr*seconds,sr),a=new ContrapontoAudio();a.ctx=ctx;
  a.master=ctx.createGain();a.master.gain.value=.65;a.master.connect(ctx.destination);
  a.musicBus=ctx.createGain();a.musicBus.gain.value=.40;a.musicBus.connect(a.master);
  a.sfxBus=ctx.createGain();a.sfxBus.gain.value=.65;a.sfxBus.connect(a.master);
  a.sfxA=ctx.createGain();a.sfxA.connect(a.sfxBus);a.sfxB=ctx.createGain();a.sfxB.connect(a.sfxBus);
  a.noiseBuffer=ctx.createBuffer(1,sr*2,sr);
  const n=a.noiseBuffer.getChannelData(0);let seed=1234;
  for(let i=0;i<n.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;n[i]=2*seed/4294967296-1;}
  if(kind==='music'){
    let at=.06,step=0;
    while(at<seconds-.6){
      if(at<5.5){a.intensity='calm';a.palette='cinematic';}
      else if(at<11){a.intensity='intense';a.palette='pulse';}
      else {a.intensity='suspense';a.palette='noir';}
      a.scoreTick(at,step++);at+=a.stepSeconds();
    }
  }else{
    a.activeSfxBus=a.sfxBus;
    a.hit(.30,{weight:.70,bright:.55});
    a.hit(1.70,{weight:1.25,bright:1.07,whoosh:true});
    a.hit(1.91,{weight:.5,bright:.6});
    a.note(62,.7,{at:3.20,amp:.025,wave:'triangle'});
    a.hit(4.40,{weight:1.1,bright:.6});
    [62,65,69,74].forEach((n,i)=>a.note(n,1.2,{at:5.1+i*.12,amp:.04,wave:'triangle'}));
  }
  const buff=await ctx.startRendering();const ns=buff.length;
  let peak=0,rms=0;for(let i=0;i<ns;i++)for(let ch=0;ch<2;ch++){const x=buff.getChannelData(ch)[i];peak=Math.max(peak,Math.abs(x));rms+=x*x;}
  const norm=Math.min(24,.79/Math.max(1e-7,peak));
  const bytes=new ArrayBuffer(44+ns*4),v=new DataView(bytes);
  const put=(i,s)=>{for(let k=0;k<s.length;k++)v.setUint8(i+k,s.charCodeAt(k));};
  put(0,'RIFF');v.setUint32(4,36+ns*4,true);put(8,'WAVE');put(12,'fmt ');
  v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);
  v.setUint32(24,sr,true);v.setUint32(28,sr*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);
  put(36,'data');v.setUint32(40,ns*4,true);
  for(let i=0;i<ns;i++)for(let ch=0;ch<2;ch++)v.setInt16(44+(i*2+ch)*2,Math.round(Math.max(-1,Math.min(1,buff.getChannelData(ch)[i]*norm))*32767),true);
  const raw=new Uint8Array(bytes);let bin='';for(let off=0;off<raw.length;off+=6000)bin+=String.fromCharCode(...raw.subarray(off,off+6000));
  return {base64:btoa(bin),rms:Math.sqrt(rms/(ns*2))*norm,peak:peak*norm,seconds};
}'''
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page()
    page.goto('about:blank')
    page.add_script_tag(content=(ROOT/'app/ui/audio-engine.js').read_text())
    for typ,filename in [('music','trilha-original-v5.wav'),('effects','efeitos-originais-v5.wav')]:
        info=page.evaluate(JS,typ)
        assert info['rms']>0.001,info
        assert info['peak']<.97,info
        output=ROOT/'docs'/filename
        output.write_bytes(base64.b64decode(info['base64']))
        print(filename,'duration=',info['seconds'],'RMS=',round(info['rms'],4),'peak=',round(info['peak'],4),'size=',output.stat().st_size)
    browser.close()
