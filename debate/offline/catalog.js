(() => {
  const manifest=window.CONTRAPONTO_MANIFEST;
  const actorManifest=window.CONTRAPONTO_ACTOR_MANIFEST;
  const $=id=>document.getElementById(id);
  let timer=null,index=0,frames=[];
  const stop=()=>{clearTimeout(timer);timer=null;};
  function draw(){
    if(!frames.length)return;
    const current=frames[index];
    $('frame').src=current.frame.startsWith('actors-v22/')?'../app/assets/'+current.frame:'../app/assets/trio/'+current.frame;
    $('progress').textContent=`QUADRO ${index+1}/${frames.length} · ${current.duration_ms}ms`;
  }
  function update(){
    stop();const who=$('person').value;
    const source=who==='elias'?manifest.animations:actorManifest.animations;
    const keys=Object.keys(source).filter(k=>k.startsWith(who+'/'));
    $('track').replaceChildren(...keys.map(k=>{const o=document.createElement('option');o.textContent=k.slice(who.length+1);o.value=k;return o}));
    change();$('track-count').textContent=keys.length+' SEQUÊNCIAS';
  }
  function change(){stop();frames=(actorManifest.animations[$('track').value]||manifest.animations[$('track').value]||[]);index=0;draw();$('caption').textContent=$('track').value||'—';}
  function play(){stop();const next=()=>{if(!frames.length)return;draw();timer=setTimeout(()=>{index=(index+1)%frames.length;next();},Math.max(60,frames[index].duration_ms));};next();}
  $('person').addEventListener('change',update);$('track').addEventListener('change',change);
  $('play').onclick=play;$('stop').onclick=stop;update();
})();
