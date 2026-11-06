import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const read=file=>readFile(new URL(file,root),'utf8');

test('música vem armada sem iniciar automaticamente antes do gesto',async()=>{
  const source=await read('app/ui/audio-engine.js');
  const window={};
  vm.runInNewContext(source,{window,console,Math,Number,Map,Boolean,String,Promise});
  const audio=new window.ContrapontoAudio();
  assert.equal(audio.musicOn,true);
  assert.equal(audio.sfxOn,true);
  assert.equal(audio.ctx,null);
  assert.equal(audio.scheduler,null);
  assert.equal(audio.musicVolume,.72);
  assert.equal(audio.volume,.68);
});

test('controle liga/desliga a trilha e start exige Web Audio desbloqueável',async()=>{
  const source=await read('app/ui/audio-engine.js');
  const window={};
  vm.runInNewContext(source,{window,console,Math,Number,Map,Boolean,String,Promise});
  const audio=new window.ContrapontoAudio();
  audio.startMusic();
  assert.equal(audio.ctx,null);
  assert.equal(audio.scheduler,null);
  audio.setMusic(false);
  assert.equal(audio.musicOn,false);
  audio.setMusic(true);
  assert.equal(audio.musicOn,true);
  assert.equal(audio.scheduler,null);
});

test('iniciar debate arma a música no gesto e prepara a voz Objection',async()=>{
  const app=await read('app/app.js');
  assert.match(app,/if\(audio\.musicOn\)audio\.startMusic\(\)/);
  assert.match(app,/void audio\.prepareCue\('objection'\)/);
  const html=await read('app/index.html');
  assert.match(html,/aria-pressed="true" id="music-toggle"/);
  assert.match(html,/<input\b(?=[^>]*\bid="use-objection-voice")(?=[^>]*\bchecked(?:\s|=|>))[^>]*>/);
});

function fakeAudioWindow(){
  let intervals=0,starts=0;const oscillatorFrequencies=[];
  const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){},cancelScheduledValues(){}});
  const node=()=>({gain:param(),frequency:param(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param(),pan:param(),connect(){},disconnect(){},start(){starts++;},stop(){},getChannelData(){return new Float32Array(4)}});
  class AudioContext{
    constructor(){this.state='running';this.currentTime=0;this.sampleRate=8;this.destination=node();}
    createGain(){return node()} createDynamicsCompressor(){return node()} createBiquadFilter(){return node()}
    createStereoPanner(){return node()} createBuffer(){return {getChannelData(){return new Float32Array(4)}}}
    createConvolver(){return node()} createOscillator(){const osc=node(),frequency=param();frequency.setValueAtTime=value=>oscillatorFrequencies.push(value);osc.frequency=frequency;return osc} createBufferSource(){return node()}
    decodeAudioData(){return Promise.resolve({duration:1})} resume(){this.state='running';return Promise.resolve()}
    suspend(){this.state='suspended';return Promise.resolve()} close(){this.state='closed';return Promise.resolve()}
  }
  const window={AudioContext,setInterval(){intervals++;return intervals},clearInterval(){intervals=0},setTimeout(){return 1},clearTimeout(){}};
  return {window,counts:()=>({intervals,starts}),oscillatorFrequencies};
}

test('stop encerra a agenda e o próximo start reinicia a trilha',async()=>{
  const source=await read('app/ui/audio-engine.js');
  const fake=fakeAudioWindow();
  vm.runInNewContext(source,{window:fake.window,console,Math,Number,Map,Boolean,String,Promise});
  const audio=new fake.window.ContrapontoAudio();
  audio.startMusic();
  assert.ok(fake.counts().intervals>0);
  audio.stop();
  assert.equal(fake.counts().intervals,0);
  assert.equal(audio.musicOn,true);
  audio.startMusic();
  assert.ok(fake.counts().intervals>0);
});

test('voz incluída é decodificada e tocada por cue Objection',async()=>{
  const source=await read('app/ui/audio-engine.js');
  const fake=fakeAudioWindow();
  vm.runInNewContext(source,{window:fake.window,console,Math,Number,Map,Boolean,String,Promise,fetch:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(128)})});
  const audio=new fake.window.ContrapontoAudio();
  await audio.registerBundledCue('objection','/assets/audio/objection-voice.mp3');
  audio.unlock();
  await audio.prepareCue('objection');
  assert.equal(audio.cueInfo('objection').kind,'arquivo incluído');
  const before=fake.counts().starts;
  audio.cue('objection');
  assert.ok(fake.counts().starts>before);
});

test('motivos de animação usam notas do acorde atual e mantêm a identidade registral',async()=>{
  const source=await read('app/ui/audio-engine.js');
  const fake=fakeAudioWindow();
  vm.runInNewContext(source,{window:fake.window,console,Math,Number,Map,Boolean,String,Promise});
  const audio=new fake.window.ContrapontoAudio();audio.unlock();
  audio.currentHarmony={index:3,chord:{chord:[57,61,64,67]}};
  audio.animationCue('a','frustrated','speaker',500);
  const midi=fake.oscillatorFrequencies.map(freq=>Math.round(69+12*Math.log2(freq/440)));
  assert.deepEqual(midi,[64,67,67]);
  assert.ok(midi.every(note=>[57,61,64,67].includes(note)));
  audio.stopAnimationSounds();
});

test('motivos diferentes da Lia preservam distinção mesmo perto do fim do acorde',async()=>{
  const source=await read('app/ui/audio-engine.js');
  const fake=fakeAudioWindow();
  vm.runInNewContext(source,{window:fake.window,console,Math,Number,Map,Boolean,String,Promise});
  const audio=new fake.window.ContrapontoAudio();audio.unlock();
  audio.currentHarmony={index:0,chord:{chord:[62,65,69,72]}};
  audio.animationCue('a','talking','speaker',600);
  const talking=fake.oscillatorFrequencies.splice(0);
  audio.animationCue('a','confident','speaker',600);
  const confident=fake.oscillatorFrequencies.splice(0);
  assert.notDeepEqual(talking,confident);
  audio.stopAnimationSounds();
});

test('cue longo atravessa compassos e adota os acordes previstos pelo scheduler',async()=>{
  const source=await read('app/ui/audio-engine.js');
  const fake=fakeAudioWindow();
  vm.runInNewContext(source,{window:fake.window,console,Math,Number,Map,Boolean,String,Promise});
  const audio=new fake.window.ContrapontoAudio();audio.unlock();audio.scheduler=1;
  audio.step=16;audio.nextTick=0;
  audio.harmonyTimeline=[{at:0,step:15,index:0,chord:{chord:[62,65,69,72]}}];
  audio.currentHarmony=audio.harmonyTimeline[0];
  audio.animationCue('b','talking','speaker',6000);
  const midi=fake.oscillatorFrequencies.map(freq=>Math.round(69+12*Math.log2(freq/440)));
  assert.deepEqual(midi,[62,62,58]);
  audio.stopAnimationSounds();
});

test('setPerformanceMood atualiza o clima sem efeitos e agenda a troca no compasso',async()=>{
  const source=await read('app/ui/audio-engine.js');
  const window={};
  vm.runInNewContext(source,{window,console,Math,Number,Map,Boolean,String,Promise});
  const audio=new window.ContrapontoAudio();audio.sfxOn=false;audio.musicOn=true;audio.scheduler=1;
  assert.equal(audio.setPerformanceMood({action:'objection',emotion:'frustrated',speaker:'a'}),'intense');
  assert.equal(audio.intensity,'calm');
  audio.scoreTick(0,16);
  assert.equal(audio.intensity,'intense');
});

test('mudanças de clima durante a trilha entram apenas no início do próximo compasso',async()=>{
  const source=await read('app/ui/audio-engine.js');
  const window={};
  vm.runInNewContext(source,{window,console,Math,Number,Map,Boolean,String,Promise});
  const audio=new window.ContrapontoAudio();audio.musicOn=true;audio.scheduler=1;
  audio.setIntensity('intense');
  assert.equal(audio.intensity,'calm');
  audio.scoreTick(0,.5);
  assert.equal(audio.intensity,'calm');
  audio.scoreTick(0,16);
  assert.equal(audio.intensity,'intense');
  assert.equal(audio.tensionTarget,.9);
});
