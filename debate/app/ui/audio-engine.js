/* CONTRAPONTO 5 — compositor e sonoplasta originais para navegador.
 * Os eventos do Harness acionam cues; este módulo NÃO chama modelo/servidor.
 * Música e foley são síntese Web Audio original. A única voz pré-incluída é
 * o MP3 fornecido pelo usuário, usado na ação "objection".
 * Arquivos personalizados são opcionais, escolhidos localmente e NÃO enviados ao servidor.
 */
(function () {
  'use strict';
  const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
  const semitone=(midi)=>440*Math.pow(2,(midi-69)/12);
  // Progressão e pequenos motivos compostos para Contraponto. 16 passos por compasso.
  const SCORE=[
    {root:50, chord:[62,65,69,72], bass:[38,45]},  // Dm(add9)
    {root:46, chord:[58,62,65,69], bass:[34,41]},  // Bbmaj7
    {root:43, chord:[55,58,62,65], bass:[31,38]},  // Gm7
    {root:45, chord:[57,61,64,67], bass:[33,40]},  // A7
  ];
  const MOTIFS={
    cinematic:[0,null,2,1,null,3,2,null,1,null,0,2,3,null,2,null],
    noir:[0,null,null,1,null,2,null,null,3,null,2,null,1,null,null,0],
    pulse:[0,2,1,3,2,1,3,0,1,2,0,3,2,1,0,2],
  };
  const CUES=['round','argument','thinking','question','rebuttal','objection','concession','judging','judge_comment','judgment','verdict','finished','cut','paper'];
  class ArenaAudio {
    constructor(){
      this.ctx=null;this.master=null;this.sfxBus=null;this.animationBus=null;this.animationA=null;this.animationB=null;this.musicBus=null;this.ambienceBus=null;
      this.musicVolume=.72;this.sfxVolume=.78;this.volume=.68;
      // Armado por padrão, mas só inicia quando uma ação do usuário desbloqueia o contexto.
      this.musicOn=true;this.sfxOn=true;this.ambienceOn=false;this.dynamic=true;
      this.intensity='calm';this.tension=.12;this.tensionTarget=.12;this._tensionTime=0;this.palette='cinematic';this.step=0;this.nextTick=0;
      // A animação usa o acorde do compasso que a trilha está tocando. Antes
      // do primeiro tick (ou com a música desligada), a referência é Ré menor.
      this.currentHarmony={index:0,chord:SCORE[0]};
      this.harmonyTimeline=[];
      this._pendingIntensity=null;
      this.scheduler=null;this.paused=false;this.duckUntil=0;this.duckLevel=.14;this._duckTimer=null;this._ambienceNodes=[];this._speech=null;
      this.customCues=new Map();this.bundledCues=new Map();this.bundledEnabled=true;this.noiseBuffer=null;this._reverb=null;this._musicWet=null;this.activeSfxBus=null;this.animationSounds=new Set();this.animationEffects=new Set();
    }
    unlock(){
      try{
        if(!this.ctx){
          const AC=window.AudioContext||window.webkitAudioContext;
          if(!AC)return false;
          const c=this.ctx=new AC();
          this.master=c.createGain();this.master.gain.value=this.volume;
          const limiter=c.createDynamicsCompressor();limiter.threshold.value=-16;limiter.knee.value=8;
          limiter.ratio.value=5;limiter.attack.value=.004;limiter.release.value=.2;
          this.master.connect(limiter);limiter.connect(c.destination);
          this.sfxBus=c.createGain();this.sfxBus.gain.value=this.sfxVolume;
          this.animationBus=c.createGain();this.animationBus.gain.value=this.sfxVolume;
          this.musicBus=c.createGain();this.musicBus.gain.value=0;
          this.ambienceBus=c.createGain();this.ambienceBus.gain.value=0;
          this.sfxBus.connect(this.master);
          this.animationBus.connect(this.master);
          const toneFilter=c.createBiquadFilter();toneFilter.type='lowpass';toneFilter.frequency.value=2700;
          this.musicBus.connect(toneFilter);toneFilter.connect(this.master);
          this.ambienceBus.connect(toneFilter);
          this.sfxA=c.createStereoPanner?.()||c.createGain();this.sfxB=c.createStereoPanner?.()||c.createGain();
          if(this.sfxA.pan)this.sfxA.pan.value=-.45;
          if(this.sfxB.pan)this.sfxB.pan.value=.45;
          this.sfxA.connect(this.sfxBus);this.sfxB.connect(this.sfxBus);
          this.animationA=c.createStereoPanner?.()||c.createGain();this.animationB=c.createStereoPanner?.()||c.createGain();
          if(this.animationA.pan)this.animationA.pan.value=-.42;
          if(this.animationB.pan)this.animationB.pan.value=.42;
          this.animationA.connect(this.animationBus);this.animationB.connect(this.animationBus);
          // Reverberação muito discreta, integralmente sintetizada.
          const impulse=c.createBuffer(2,Math.round(c.sampleRate*.47),c.sampleRate);
          for(let channel=0;channel<2;channel++){
            const samples=impulse.getChannelData(channel);
            let seed=channel+43;for(let i=0;i<samples.length;i++){
              seed=(seed*1664525+1013904223)>>>0;
              const u=seed/4294967296*2-1;
              samples[i]=u*Math.pow(1-i/samples.length,3)*.17;
            }
          }
          const verb=c.createConvolver();verb.buffer=impulse;this._reverb=verb;
          const wet=c.createGain();wet.gain.value=.13;this._musicWet=c.createGain();this._musicWet.gain.value=1;
          this.musicBus.connect(verb);verb.connect(wet);wet.connect(this._musicWet);this._musicWet.connect(this.master);
          this.sfxBus.connect(verb);
          // Ruído reutilizável para foley em vez de recriar buffers a cada evento.
          this.noiseBuffer=c.createBuffer(1,Math.floor(c.sampleRate*2),c.sampleRate);
          const arr=this.noiseBuffer.getChannelData(0);let seed=1337;
          for(let i=0;i<arr.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;arr[i]=(seed/4294967296)*2-1;}
        }
        if(!this.paused&&this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});
        // O arquivo de voz é carregado apenas uma vez; decodificá-lo não exige tocar áudio.
        for(const name of this.bundledCues.keys())this.decodeBundledCue(name);
        return true;
      }catch(e){console.warn('Áudio não disponível:',e);return false;}
    }
    gainTo(node,target,speed=.05){
      if(!node||!this.ctx)return;
      const t=this.ctx.currentTime;node.gain.cancelScheduledValues(t);
      node.gain.setTargetAtTime(target,t,speed);
    }
    setVolume(v){this.volume=clamp(Number(v)||0);this.gainTo(this.master,this.volume,.04);}
    setMusicVolume(v){this.musicVolume=clamp(Number(v)||0);this.refreshMusicGain();}
    setSfxVolume(v){this.sfxVolume=clamp(Number(v)||0);this.gainTo(this.sfxBus,this.sfxVolume,.04);this.gainTo(this.animationBus,this.sfxVolume,.04);}
    setPalette(s){if(MOTIFS[s]){this.palette=s;}}
    setDynamic(v){this.dynamic=Boolean(v);if(!this.dynamic)this.setIntensity('calm',true);}
    setSfx(v){this.sfxOn=Boolean(v);if(v)this.unlock();else {this.stopAnimationSounds();this.stopAnimationEffects();}}
    setMusic(v){this.musicOn=Boolean(v);if(v){this.unlock();this.startMusic();}else this.stopMusic();}
    setAmbience(v){
      this.ambienceOn=Boolean(v);
      if(v&&!this.unlock())return;
      if(v&&!this._ambienceNodes.length){
        const c=this.ctx;
        for(const [freq,wave,amp] of [[55,'sine',.030],[82.41,'triangle',.012],[109.7,'sine',.008]]){
          const osc=c.createOscillator(),gain=c.createGain();osc.type=wave;osc.frequency.value=freq;
          gain.gain.value=amp;osc.connect(gain);gain.connect(this.ambienceBus);osc.start();
          this._ambienceNodes.push({osc,gain});
        }
      }
      this.gainTo(this.ambienceBus,v?.4:0,.25);
    }
    refreshMusicGain(){
      const ducked=this.ctx&&this.ctx.currentTime<this.duckUntil;
      const mood=.82+this.tension*.27+(this.intensity==='victory'?.12:0);
      // Both the dry score and its reverb send follow the same duck so speech and foley stay clear.
      const speechFocus=this._speech?.active ? .19 : 1;
      const animationFocus=this.animationSounds?.size ? .62 : 1;
      const transientFocus=ducked ? this.duckLevel : 1;
      const foreground=speechFocus*animationFocus*transientFocus;
      const target=this.musicOn?foreground*this.musicVolume*mood:0;
      this.gainTo(this.musicBus,target,.24);
    }
    duck(seconds=.7){
      if(!this.ctx||!this.musicOn)return;
      this.duckUntil=Math.max(this.duckUntil,this.ctx.currentTime+seconds);
      this.duckLevel=.46;this.refreshMusicGain();
      if(this._duckTimer)window.clearTimeout(this._duckTimer);
      this._duckTimer=window.setTimeout(()=>{
        this._duckTimer=null;
        if(this.ctx&&this.ctx.currentTime>=this.duckUntil){this.duckLevel=.46;this.refreshMusicGain();}
      },Math.max(0,(this.duckUntil-this.ctx.currentTime)*1000+35));
    }
    setIntensity(s,force=false){
      if(!['calm','intense','suspense','victory'].includes(s))return;
      if(!this.dynamic&&!force)return;
      // Com a trilha em execução, decisões de arranjo entram no próximo
      // primeiro tempo. Os efeitos sonoros continuam imediatos.
      if(this.musicOn&&this.scheduler&&!force){this._pendingIntensity=s;return;}
      this._pendingIntensity=null;
      this.applyIntensity(s);
    }
    // API de performance para o Harness: decisões de fala mudam o clima da
    // música mesmo se efeitos e textura vocal estiverem desligados.
    setPerformanceMood(turn={}){
      const action=String(turn?.action||'').toLowerCase();
      const emotion=String(turn?.emotion||'').toLowerCase();
      const side=String(turn?.speaker||turn?.side||'').toLowerCase();
      const kind=String(turn?.kind||'').toLowerCase();
      const mood=side==='judge'?(kind==='verdict'?'victory':'suspense'):
        ['objection','rebuttal'].includes(action)||['frustrated','angry'].includes(emotion)?'intense':
        action==='question'||emotion==='thinking'?'suspense':
        action==='concession'?'calm':emotion==='excited'?'intense':'calm';
      this.setIntensity(mood);
      return mood;
    }
    applyIntensity(s){
      this.intensity=s;
      this.tensionTarget={calm:.12,suspense:.62,intense:.9,victory:.34}[s];
      if(!this.ctx)this.tension=this.tensionTarget;
      this.refreshMusicGain();
    }
    // Envelope com release finito: elimina estalos na maioria dos cortes.
    tone(freq,duration,opts={}){
      const c=this.ctx,dest=opts.dest||this.activeSfxBus||this.sfxBus;
      if(!c||!dest||!Number.isFinite(freq)||freq<=0)return;
      const t=Math.max(c.currentTime,opts.at??c.currentTime),attack=opts.attack??.009;
      const osc=c.createOscillator(),gain=c.createGain();osc.type=opts.wave||'sine';
      osc.frequency.setValueAtTime(freq,t);
      if(opts.slide&&opts.slide!==1)osc.frequency.exponentialRampToValueAtTime(Math.max(27,freq*opts.slide),t+duration*.82);
      const amp=clamp(opts.amp??.04,0,.5);
      gain.gain.setValueAtTime(.0001,t);
      gain.gain.linearRampToValueAtTime(amp,t+Math.max(.002,attack));
      gain.gain.setTargetAtTime(.0001,t+Math.max(attack+.01,duration-(opts.release??.09)),Math.max(.015,(opts.release??.09)/3));
      osc.connect(gain);gain.connect(dest);osc.start(t);osc.stop(t+duration+.10);
      osc.onended=()=>{osc.disconnect();gain.disconnect();};
    }
    hiss(duration=.15,opts={}){
      const c=this.ctx,dest=opts.dest||this.activeSfxBus||this.sfxBus;
      if(!c||!dest||!this.noiseBuffer)return;
      const t=Math.max(c.currentTime,opts.at??c.currentTime),src=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();
      filter.type=opts.filter||'bandpass';filter.frequency.value=opts.freq||1400;filter.Q.value=opts.q||.5;
      gain.gain.setValueAtTime(Math.max(.0001,opts.amp??.06),t);
      gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
      src.buffer=this.noiseBuffer;src.loop=true;
      src.connect(filter);filter.connect(gain);gain.connect(dest);src.start(t);src.stop(t+duration+.01);
      src.onended=()=>{src.disconnect();filter.disconnect();gain.disconnect();};
    }
    note(midi,duration,opts={}){this.tone(semitone(midi),duration,opts);}
    // Três camadas dão peso sem amostra comercial: transiente, corpo e cauda.
    hit(at,{weight=1,bright=1,whoosh=false}={}){
      if(!this.ctx)return;
      if(whoosh)this.hiss(.27,{at:at-.07,amp:.042*weight,filter:'highpass',freq:780});
      this.tone(88,.37,{at,amp:.115*weight,wave:'sine',slide:.34,attack:.002,release:.17});
      this.tone(175,.19,{at,amp:.037*weight,wave:'triangle',slide:.58,attack:.002});
      this.hiss(.11,{at,amp:.085*weight*bright,filter:'highpass',freq:1300});
      this.hiss(.46,{at:at+.05,amp:.021*weight,filter:'lowpass',freq:470});
    }
    // Som oficial do projeto: arquivo local fornecido pelo usuário, não um endpoint externo.
    // Prefetch começa ao abrir a página; decodificação acontece ao desbloquear o áudio.
    async registerBundledCue(name,url){
      if(!CUES.includes(name))throw new Error('Tipo de efeito não reconhecido.');
      const entry={url,bytes:null,buffer:null,error:null,decoding:null};
      this.bundledCues.set(name,entry);
      entry.loadingPromise=(async()=>{
        try{
          const response=await fetch(url);
          if(!response.ok)throw new Error(`HTTP ${response.status}`);
          entry.bytes=await response.arrayBuffer();
          if(entry.bytes.byteLength<100)throw new Error('Áudio vazio.');
          if(this.ctx)await this.decodeBundledCue(name);
          return true;
        }catch(error){
          entry.error=String(error.message||error);
          console.warn('Voz de Objeção indisponível, usando efeito original:',entry.error);
          return false;
        }
      })();
      return entry.loadingPromise;
    }
    async prepareCue(name){
      const entry=this.bundledCues.get(name);
      if(!entry||!this.bundledEnabled||this.customCues.has(name))return;
      await entry.loadingPromise;
      if(entry.bytes&&this.unlock())await this.decodeBundledCue(name);
    }
    decodeBundledCue(name){
      const entry=this.bundledCues.get(name);
      if(!this.ctx||!entry?.bytes||entry.buffer||entry.error)return Promise.resolve(entry?.buffer||null);
      if(entry.decoding)return entry.decoding;
      entry.decoding=this.ctx.decodeAudioData(entry.bytes.slice(0)).then(buffer=>{
        entry.buffer=buffer;return buffer;
      }).catch(error=>{
        entry.error=String(error.message||error);
        console.warn('Não foi possível decodificar a voz:',entry.error);return null;
      });
      return entry.decoding;
    }
    setBundledEnabled(value){this.bundledEnabled=Boolean(value);}
    cueInfo(name){
      if(this.customCues.has(name))return {kind:'personalizado',name:this.customCues.get(name).name};
      const entry=this.bundledCues.get(name);
      if(this.bundledEnabled&&entry?.buffer)return {kind:'arquivo incluído',name:'Objection! (MP3)'};
      if(this.bundledEnabled&&entry&&!entry.error)return {kind:'carregando áudio',name:'Objection! (MP3)'};
      return {kind:'sintetizado',name:'Efeito original'};
    }
    // Arquivo de áudio apenas na memória desta página (não faz upload).
    async setCustomCue(name,file){
      if(!CUES.includes(name))throw new Error('Tipo de efeito não reconhecido.');
      if(!file||!String(file.type).startsWith('audio/'))throw new Error('Escolha WAV, MP3, OGG ou outro áudio compatível.');
      if(file.size>8*1024*1024)throw new Error('Limite por arquivo: 8 MB.');
      if(!this.unlock())throw new Error('Áudio Web Audio indisponível neste navegador.');
      const bytes=await file.arrayBuffer();const decoded=await this.ctx.decodeAudioData(bytes.slice(0));
      if(decoded.duration>35)throw new Error('Use um efeito curto, de até 35 segundos.');
      this.customCues.set(name,{buffer:decoded,name:file.name});
      return {name:file.name,duration:decoded.duration};
    }
    removeCustomCue(name){this.customCues.delete(name);}
    // Textura vocal original para marcar que há fala, sem fingir ser TTS.
    // Cada turno gera sílabas sintetizadas com formantes, cadência e altura por personagem.
    startSpeech(side,text='',durationHint=0){
      this.stopSpeech();
      const opts=durationHint&&typeof durationHint==='object'?durationHint:{};
      const kind=['commentary','verdict'].includes(opts.kind)?opts.kind:'speech';
      const words=String(text).trim().split(/\s+/).filter(Boolean).length;
      // Optional structured metadata lets the Harness align the score with each
      // action and emotion; plain legacy calls remain fully compatible.
      this.setPerformanceMood({...opts,speaker:side,kind});
      // A música acompanha a fala mesmo quando os efeitos de som estão
      // desligados; nesse modo apenas a textura vocal é omitida.
      if(!this.sfxOn||!this.ctx||this.ctx.state!=='running'||!['a','b','judge'].includes(side))return 0;
      const c=this.ctx,now=c.currentTime,pan=side==='a'?this.sfxA:side==='b'?this.sfxB:null;
      const rate=kind==='verdict'?2.15:kind==='commentary'?2.35:2.7;
      const duration=clamp(Number(durationHint)||words/rate,1.2,7.5);
      const phrase=c.createGain();phrase.gain.setValueAtTime(.0001,now);
      phrase.gain.linearRampToValueAtTime(.62,now+.12);phrase.gain.setValueAtTime(.62,now+Math.max(.13,duration-.16));
      phrase.gain.linearRampToValueAtTime(.0001,now+duration);
      phrase.connect(pan||this.sfxBus);
      const nodes=[];const cadence=kind==='verdict'?2.15:kind==='commentary'?2.55:3.05;
      const count=Math.max(3,Math.floor(duration*cadence));
      let seed=(side==='a'?1709:side==='b'?2903:4817)+words*31;
      const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      for(let i=0;i<count;i++){
        const at=Math.max(now,now+i*(duration/count)+(rand()-.5)*.055);
        const len=Math.min(.115+rand()*.055,now+duration-at-.015);if(len<=.025)continue;
        const base=side==='judge'?(kind==='verdict'?104:116):side==='a'?164:128;
        const f0=base+(rand()-.5)*(side==='judge'?12:20)+(i%4===3?(side==='judge'?9:14):0);
        const syllable=c.createGain();syllable.gain.setValueAtTime(.0001,at);
        syllable.gain.linearRampToValueAtTime(.05+rand()*.025,at+.018);
        syllable.gain.setTargetAtTime(.0001,at+len*.56,.025);
        const formants=[];
        const vowel=rand(),f1=(side==='judge'?520:610)+vowel*(side==='judge'?180:230);
        const f2=(kind==='verdict'?1180:1380)+vowel*360,f3=(side==='judge'?2250:2380)+vowel*330;
        // Equalization compensates for weak upper sawtooth harmonics so the
        // formants remain audible instead of collapsing into a low beep.
        for(const [mult,center,q,levelValue] of [[1,f1,2.8,1.05],[2,f2,2.35,1.55],[3,f3,1.9,2.05]]){
          const osc=c.createOscillator(),filter=c.createBiquadFilter(),level=c.createGain();
          osc.type='sawtooth';osc.frequency.setValueAtTime(f0*mult,at);osc.frequency.linearRampToValueAtTime(f0*mult*(.96+rand()*.08),at+len);
          filter.type='bandpass';filter.frequency.setValueAtTime(center,at);filter.Q.value=q;
          level.gain.value=levelValue;
          osc.connect(filter);filter.connect(level);level.connect(syllable);osc.start(at);osc.stop(at+len+.035);
          formants.push(osc,filter,level);
        }
        syllable.connect(phrase);nodes.push({gain:syllable,nodes:formants});
      }
      const token={phrase,nodes,stopTimer:null,active:true};this._speech=token;
      this.refreshMusicGain();
      token.stopTimer=window.setTimeout(()=>{if(this._speech===token)this.stopSpeech();},duration*1000+80);
      return duration;
    }
    stopSpeech(){
      const token=this._speech;if(!token||!this.ctx)return;
      token.active=false;this._speech=null;window.clearTimeout(token.stopTimer);this.refreshMusicGain();
      const t=this.ctx.currentTime;token.phrase.gain.cancelScheduledValues(t);
      token.phrase.gain.setTargetAtTime(.0001,t,.012);
      for(const item of token.nodes){
        item.gain.gain.cancelScheduledValues(t);item.gain.gain.setTargetAtTime(.0001,t,.008);
        for(const node of item.nodes)if(typeof node.stop==='function'){try{node.stop(t+.045);}catch{}}
      }
      window.setTimeout(()=>{try{token.phrase.disconnect();for(const item of token.nodes){item.gain.disconnect();for(const n of item.nodes)n.disconnect();}}catch{}},100);
    }
    // Mini-cues sonoros presos ao primeiro quadro da animação. Cada pessoa tem
    // uma base tímbrica própria; o track e o papel (fala/reação) variam o motivo.
    animationCue(person,track,role='speaker',durationMs=700){
      if(!this.sfxOn||!this.ctx||this.ctx.state!=='running'||durationMs<=0)return null;
      const identity=person==='a'?'lia':person==='b'?'dante':'judge';
      const profile={
        talking:[0,2,4], confident:[0,4,7], frustrated:[0,1,5],
        objection:[0,7,2], surprised:[7,12,9], thinking:[0,7],
        breakdown:[0,-2,-5], listening:[0,2],
        anuncio:[0,4,7], ordem:[0,5,2], pensando:[0,1],
        martelo:[0,-12,0], veredito:[0,4,7,12], observacao:[0,2],
        expressoes:[0,3], faixas_olhos:[0,7], efeitos:[0,12],
        pulpito:[0,5], props_martelo:[0,-12], props_maos:[0,4], idle:[0]
      }[track]||[0,2,5];
      const contour=role==='reaction'?[...profile].reverse():profile;
      const waveform={lia:'sine',dante:'triangle',judge:'sine'}[identity];
      const amp=identity==='judge'?.034:.028;
      const c=this.ctx,now=c.currentTime,seconds=durationMs/1000;
      // Mantém os gestos reconhecíveis, mas quantiza cada passo ao acorde
      // corrente. Os números legados descrevem direção/tamanho do gesto;
      // nenhum semitom cromático literal é tocado sobre a harmonia.
      const anchor={lia:2,dante:0,judge:1}[identity];
      const octave={lia:0,dante:0,judge:-12}[identity];
      const quantized=contour.map((movement,index)=>{
        const degrees=movement===0?0:Math.sign(movement)*Math.min(2,Math.max(1,Math.round(Math.abs(movement)/4)));
        const noteAt=now+index*seconds/contour.length;
        const chord=this.harmonyAt(noteAt).chord;
        const count=chord.chord.length,degree=anchor+degrees;
        const chordIndex=((degree%count)+count)%count;
        // Pequena inflexão de fala/reação no desenho rítmico, sem mudar notas.
        return chord.chord[chordIndex]+octave+12*Math.floor(degree/count);
      });
      const root=identity==='lia'?this.animationA:identity==='dante'?this.animationB:this.animationBus;
      const gain=c.createGain(),osc=c.createOscillator(),pulse=c.createOscillator(),pulseGain=c.createGain();
      gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(amp,now+.012);
      osc.type=waveform;
      quantized.forEach((midi,index)=>osc.frequency.setValueAtTime(semitone(midi),now+index*seconds/quantized.length));
      // Um pulso discreto dá cadência ao motivo ao longo do movimento inteiro.
      pulse.type='sine';pulse.frequency.value=identity==='lia'?5.4:identity==='dante'?4.4:3.6;
      pulseGain.gain.value=amp*.22;pulse.connect(pulseGain);pulseGain.connect(gain.gain);
      osc.connect(gain);gain.connect(root);osc.start(now);pulse.start(now);
      const token={osc,pulse,gain,pulseGain};this.animationSounds.add(token);
      this.refreshMusicGain();
      return ()=>this.stopAnimationSound(token);
    }
    stopAnimationSound(token){
      if(!token||!this.animationSounds.delete(token)||!this.ctx)return;
      this.refreshMusicGain();
      const t=this.ctx.currentTime;
      token.gain.gain.cancelScheduledValues(t);token.gain.gain.setTargetAtTime(0,t,.004);
      for(const osc of [token.osc,token.pulse])try{osc.stop(t+.025);}catch{}
      window.setTimeout(()=>{for(const node of [token.osc,token.pulse,token.gain,token.pulseGain])try{node.disconnect();}catch{}},80);
    }
    stopAnimationSounds(){for(const token of [...this.animationSounds])this.stopAnimationSound(token);}
    // Efeitos de cena podem terminar antes do gesto, mas nunca passam dele.
    playAnimationEffect(name,side,durationMs){
      if(!this.sfxOn||!this.ctx||this.ctx.state!=='running'||durationMs<=0)return null;
      const c=this.ctx,now=c.currentTime,buffer=this.customCues.get(name)?.buffer||(this.bundledEnabled?this.bundledCues.get(name)?.buffer:null);
      const gain=c.createGain();gain.gain.value=buffer?.72:.035;
      gain.connect(side==='a'?this.animationA:side==='b'?this.animationB:this.animationBus);
      const source=buffer?c.createBufferSource():c.createOscillator();
      if(buffer)source.buffer=buffer;
      else{source.type='triangle';source.frequency.setValueAtTime(520,now);source.frequency.exponentialRampToValueAtTime(190,now+Math.min(.18,durationMs/1000));}
      source.connect(gain);const token={source,gain};this.animationEffects.add(token);
      source.onended=()=>{if(this.animationEffects.delete(token)){source.disconnect();gain.disconnect();}};
      source.start(now);
      if(!buffer)source.stop(now+Math.min(.22,durationMs/1000));
      this.duck(Math.min(.7,durationMs/1000));
      return ()=>this.stopAnimationEffect(token);
    }
    stopAnimationEffect(token){
      if(!token||!this.animationEffects.delete(token)||!this.ctx)return;
      const t=this.ctx.currentTime;token.gain.gain.cancelScheduledValues(t);token.gain.gain.setTargetAtTime(0,t,.004);
      try{token.source.stop(t+.025);}catch{}
      window.setTimeout(()=>{try{token.source.disconnect();token.gain.disconnect();}catch{}},80);
    }
    stopAnimationEffects(){for(const token of [...this.animationEffects])this.stopAnimationEffect(token);}
    playCustomCue(name,side){
      if(!this.sfxOn||!this.ctx||this.ctx.state!=='running')return null;
      // Prioridade: arquivo importado > MP3 incluído > efeito sintetizado.
      const imported=this.customCues.get(name);
      const included=this.bundledEnabled?this.bundledCues.get(name):null;
      const buffer=imported?.buffer||included?.buffer;
      if(!buffer)return null;
      const dest=side==='a'?this.sfxA:side==='b'?this.sfxB:this.sfxBus;
      const src=this.ctx.createBufferSource(),gain=this.ctx.createGain();
      src.buffer=buffer;gain.gain.value=imported?.9:.82;
      src.connect(gain);gain.connect(dest);src.start();
      src.onended=()=>{src.disconnect();gain.disconnect();};
      return buffer.duration;
    }
    cue(type,meta={}){
      if(type==='round')this.setIntensity('calm');
      if(['rebuttal','objection'].includes(type))this.setIntensity('intense');
      if(type==='question')this.setIntensity('suspense');
      if(type==='concession')this.setIntensity('calm');
      if(['judging','judge_comment'].includes(type))this.setIntensity('suspense');
      if(type==='judgment')this.setIntensity('victory');
      if(['finished','verdict'].includes(type))this.setIntensity('victory');
      if(!this.sfxOn||!this.ctx||this.ctx.state!=='running')return;
      this.activeSfxBus=meta.side==='a'?this.sfxA:meta.side==='b'?this.sfxB:null;
      const t=this.ctx.currentTime;
      // Importações substituem apenas o efeito correspondente, mantendo a música dinâmica.
      const fileDuration=this.playCustomCue(type,meta.side);
      if(fileDuration!==null){
        if(['objection','judgment','rebuttal'].includes(type))this.duck(Math.min(3,fileDuration+.30));
        this.activeSfxBus=null;return;
      }
      switch(type){
        case 'round':
          this.duck(.60);this.hit(t,{weight:.65,bright:.42});
          [74,77,81].forEach((n,i)=>this.note(n,.32,{at:t+.12+i*.105,amp:.025,wave:'triangle',release:.17}));break;
        case 'thinking':this.note(57,.18,{at:t,amp:.014,wave:'sine'});break;
        case 'argument':this.note(74,.09,{at:t,amp:.022,wave:'triangle'});break;
        case 'question':
          this.hiss(.13,{at:t,amp:.031,freq:1800,filter:'highpass'});
          this.note(62,.14,{at:t,amp:.047,wave:'triangle'});
          this.note(66,.23,{at:t+.15,amp:.035,wave:'triangle'});break;
        case 'concession':
          [69,72,77].forEach((n,i)=>this.note(n,.42,{at:t+i*.11,amp:.022,wave:'sine'}));break;
        case 'rebuttal':
          this.duck(.73);this.hit(t,{weight:.84,bright:.8,whoosh:true});
          this.note(50,.43,{at:t+.13,amp:.028,wave:'sawtooth',slide:.92,release:.27});break;
        case 'objection':
          this.duck(1.55);this.hiss(.18,{at:t,amp:.065,filter:'bandpass',freq:930});
          this.hit(t+.095,{weight:1.27,bright:1.10,whoosh:true});
          this.hit(t+.26,{weight:.56,bright:.70});
          [74,77,81].forEach((n,i)=>this.note(n,.42,{at:t+.32+i*.065,amp:.018,wave:'sawtooth',release:.25}));break;
        case 'judging':
          this.duck(.6);this.note(50,1.1,{at:t,amp:.033,wave:'sine',attack:.12,release:.56});
          this.note(51,.9,{at:t+.10,amp:.011,wave:'sine',attack:.11,release:.45});break;
        case 'judgment':
          this.duck(1.35);this.hit(t,{weight:1.12,bright:.63});
          this.hit(t+.36,{weight:.48,bright:.5});
          this.note(62,.9,{at:t+.1,amp:.028,wave:'triangle',attack:.07,release:.53});break;
        case 'judge_comment':
          this.duck(.8);this.note(55,.48,{at:t,amp:.028,wave:'triangle',attack:.06,release:.25});
          this.note(62,.56,{at:t+.12,amp:.022,wave:'sine',attack:.08,release:.3});break;
        case 'verdict':
          this.duck(1.45);this.hit(t,{weight:.9,bright:.55});
          [50,57,62,69].forEach((n,i)=>this.note(n,.92,{at:t+.12+i*.075,amp:.025,wave:'triangle',attack:.045,release:.48}));break;
        case 'finished':
          this.duck(.5);[62,65,69,74,77].forEach((n,i)=>this.note(n,1.5,{at:t+i*.115,amp:.025,wave:'triangle',release:.68}));break;
        case 'paper':this.hiss(.22,{at:t,amp:.019,freq:2600,filter:'highpass'});break;
        case 'cut':this.hiss(.070,{at:t,amp:.022,freq:3600,filter:'highpass'});break;
      }
      this.activeSfxBus=null;
    }
    // O tensionamento acompanha a ação sem saltar entre andamentos em cada fala.
    advanceTension(at){
      const elapsed=this._tensionTime?Math.max(0,at-this._tensionTime):0;
      this._tensionTime=at;
      const response=1-Math.exp(-elapsed/2.1);
      this.tension+=((this.dynamic?this.tensionTarget:.12)-this.tension)*response;
      return clamp(this.tension,.08,.96);
    }
    // Score gerativo: um pulso comum sustenta o debate e o andamento segue a tensão.
    stepSeconds(){const t=this.tension,bpm=78+t*40;return 60/bpm/4;}
    scoreTick(at,step){
      const s=step%16,bar=Math.floor(step/16),chord=SCORE[bar%SCORE.length];
      if(s===0&&this._pendingIntensity){const pending=this._pendingIntensity;this._pendingIntensity=null;this.applyIntensity(pending);}
      this.currentHarmony={index:bar%SCORE.length,chord};
      this.harmonyTimeline.push({at,step,index:bar%SCORE.length,chord});
      while(this.harmonyTimeline.length>1&&this.harmonyTimeline[1].at<at-12)this.harmonyTimeline.shift();
      const tension=this.advanceTension(at),intensity=this.intensity;
      const calm=tension<.34,suspense=intensity==='suspense'&&tension>.38,intense=tension>.67;
      const noir=this.palette==='noir',pulse=this.palette==='pulse';
      const dest=this.musicBus;
      if(s===0){
        // Low strings + sub-bass + chord bed.
        this.note(chord.bass[0],noir?1.3:.7,{at,amp:.026+tension*.062,wave:'sine',dest,attack:.028,release:.26});
        chord.chord.forEach((n,j)=>this.note(n-12,2.3,{at:at+j*.025,amp:(noir?.013:.018)+tension*.012,wave:'sine',dest,attack:.37,release:.68}));
      }
      if(suspense){
        // Pulso de baixa frequência e nota vizinha criam expectativa sem uma camada rítmica agressiva.
        if(s===0||s===8)this.note(chord.bass[s===0?0:1],.34,{at,amp:.018+tension*.018,wave:'sine',dest,attack:.015,release:.2});
        if(s===12){this.note(chord.root+1,.58,{at,amp:.006+tension*.007,wave:'sine',dest,attack:.14,release:.3});this.hiss(.10,{at,amp:.002+tension*.003,dest,filter:'highpass',freq:4600});}
        return;
      }
      if(s===8){this.note(chord.bass[1],.46,{at,amp:.032+tension*.048,wave:'triangle',dest,release:.18});}
      const motif=MOTIFS[this.palette][s];
      if(motif!==null&&(intense||pulse||s%2===0)){
        const base=chord.chord[motif],shift=pulse?12:noir?-12:0;
        this.note(base+shift, pulse?.18:.25,{at,amp:(noir?.020:.026)+tension*.018,wave:pulse?'square':noir?'sine':'triangle',dest,attack:.007,release:.12});
      }
      if(s===0||s===8||intense&&s%4===0)this.kick(at,.012+tension*.027);
      if(intense&&(s===4||s===12))this.snare(at,.006+tension*.010);
      if(intense&&s%2===1||pulse&&s%4===2)this.hat(at,.002+tension*.004);
      if(noir&&s===12)this.note(chord.chord[1]-12,.7,{at,amp:.01,wave:'sine',dest,attack:.1,release:.32});
    }
    harmonyAt(at){
      const events=this.harmonyTimeline;
      let event=null;
      for(const candidate of events){if(candidate.at>at)break;event=candidate;}
      if(event&&event.at===at)return {index:event.index,chord:event.chord};
      if(event&&this.scheduler&&!this.paused){
        // Tick spacing follows the smoothly changing tempo. Forecast only
        // beyond Web Audio's queued look-ahead; queued events above are exact.
        const ahead=Math.max(0,Math.floor((at-event.at)/this.stepSeconds()));
        const bar=Math.floor((event.step+ahead)/16);
        return {index:bar%SCORE.length,chord:SCORE[bar%SCORE.length]};
      }
      if(event)return {index:event.index,chord:event.chord};
      return this.currentHarmony||{index:0,chord:SCORE[0]};
    }
    kick(at,amp){this.tone(110,.19,{at,amp,wave:'sine',slide:.29,dest:this.musicBus,attack:.002,release:.12});}
    snare(at,amp){this.hiss(.15,{at,amp,dest:this.musicBus,filter:'highpass',freq:2100});}
    hat(at,amp){this.hiss(.055,{at,amp,dest:this.musicBus,filter:'highpass',freq:5500});}
    schedule(){
      if(!this.musicOn||!this.ctx||this.paused||this.ctx.state!=='running')return;
      if(this.nextTick<this.ctx.currentTime-.5)this.nextTick=this.ctx.currentTime+.025;
      let guard=0;while(this.nextTick<this.ctx.currentTime+.14&&guard++<6){
        this.scoreTick(this.nextTick,this.step++);this.nextTick+=this.stepSeconds();
      }
    }
    startMusic(){
      if(!this.musicOn||!this.unlock())return;
      if(this.scheduler){this.refreshMusicGain();return;}
      this.nextTick=this.ctx.currentTime+.03;this.refreshMusicGain();
      this.scheduler=window.setInterval(()=>this.schedule(),65);
      this.schedule();
    }
    stopMusic(){
      if(this.scheduler){window.clearInterval(this.scheduler);this.scheduler=null;}
      this.gainTo(this.musicBus,0,.12);
    }
    pause(paused){
      this.paused=Boolean(paused);
      if(paused)this.stopSpeech();
      if(!this.ctx)return Promise.resolve();
      const change=paused?this.ctx.suspend():this.ctx.resume();
      if(!paused){this.nextTick=this.ctx.currentTime+.04;if(this.musicOn&&!this.scheduler)this.startMusic();}
      return change.catch(()=>{});
    }
    stop(){this.stopSpeech();this.stopAnimationSounds();this.stopAnimationEffects();this.stopMusic();this.setIntensity('calm',true);this.step=0;}
    close(){
      this.stopSpeech();this.stopAnimationSounds();this.stopAnimationEffects();this.stopMusic();for(const {osc} of this._ambienceNodes){try{osc.stop();osc.disconnect();}catch{}}
      this._ambienceNodes=[];this.ctx?.close().catch(()=>{});
    }
  }
  window.ContrapontoAudio=ArenaAudio;
  window.ContrapontoAudioCues=Object.freeze(CUES);
})();
