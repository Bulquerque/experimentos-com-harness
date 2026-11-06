"""Constrói o index.html que abre por duplo clique, sem módulos HTTP nem NIM.

Somente módulos da apresentação são reunidos; arquivos do Harness ficam intocados.
A ponte local entrega eventos no mesmo formato que o servidor via SSE.
"""
from pathlib import Path
import json, re

ROOT=Path(__file__).resolve().parents[1]
APP=ROOT/'app'; OFF=ROOT/'offline'

def read(path): return (APP/path).read_text(encoding='utf8')

# CSS de origem permanece legível por módulo. Só o arquivo gerado usa caminhos file://.
css_modules=('base','camera','effects','customization','audio','scenes','characters','sprites','motion','actors-v22','judge','judge-effects','performance')
css='\n'.join(read(f'styles/{name}.css') for name in css_modules)
css=re.sub(r"(['\"]?)/assets/",lambda m:m.group(1)+'../app/assets/',css)
(OFF/'offline.css').write_text(css+'\n/* Entrada local: sem requests de servidor. */\n.offline-banner{padding:12px 18px;background:linear-gradient(90deg,#203653,#33243c);border:1px solid #6885a5;border-radius:12px;margin-bottom:14px;font-size:13px;color:#f6e9d8}.offline-banner strong{color:#f2c27a}.offline-controls{display:flex;align-items:center;flex-wrap:wrap;gap:9px;padding:12px 16px;background:#161c30;border:1px solid #414968;border-radius:12px;margin-bottom:12px}.offline-controls button,.offline-controls select{border:1px solid #6e668d;color:#fff1dc;border-radius:7px;background:#272c45;padding:8px 11px;cursor:pointer}.offline-controls label,.offline-controls small{font-size:12px;color:#d4d3e5}.offline-controls strong{font-size:11px;letter-spacing:.8px;color:#d9dfed}.offline-controls button:hover{background:#3b4568}.offline-status{margin-left:auto;color:#b6d7ef;font-size:11px;font-weight:700}.offline-only-note{font-size:12px;color:#d4d3e5;margin:8px 0 14px}@media(max-width:690px){.offline-controls{gap:6px}.offline-status{margin-left:0;width:100%}}\n',encoding='utf8')

# Monta o runtime clássico (não ES Module) para que file:// funcione em Chromium/Edge/Firefox.
dom=read('ui/dom.js')
dom=dom.replace('export const','const').replace('export function','function').replace('export async function','async function')
dom=re.sub(r'async function api\(route, options = \{\}\) \{.*?\n\}',
           'async function api(route, options={}) { return window.ContrapontoOffline.api(route, options); }',dom,flags=re.S)
configuration=read('ui/configuration.js').replace("import { $ , node } from './dom.js';",'').replace('export function','function')
assets=read('ui/character-assets.js').replace('export const','const').replace('export function','function')
sprite=read('ui/sprite-director.js').replace('export class SpriteDirector','class SpriteDirector')
sprite=sprite.replace("const res = await fetch('/assets/trio/manifest.json');\n    if (!res.ok) throw new Error(`Manifesto visual indisponível: ${res.status}`);\n    const data = await res.json();",
                      "const data = window.CONTRAPONTO_MANIFEST;")
performance=read('ui/performance-director.js').replace('export function','function').replace('export class','class')
breakdown_policy=read('ui/breakdown-policy.js').replace('export function','function')
main=read('app.js')
main=re.sub(r'^import .*?;\n','',main,flags=re.M)
# URLs relativas para abrir de qualquer pasta no computador sem servir HTTP.
main=main.replace("audio.registerBundledCue('objection','/assets/audio/objection-voice.mp3')\n  .then(()=>{if(document.getElementById('cue-status'))refreshCueStatus();});",
"""// Reprodução por <audio> local: evita fetch de arquivo file:// (bloqueado pelo navegador).
const offlineVoice = new Audio('app/assets/audio/objection-voice.mp3');
const playOriginalCue = audio.cue.bind(audio);
audio.cue = function(name, options) {
  if(name === 'objection' && audio.sfxOn && document.getElementById('use-objection-voice')?.checked) {
    offlineVoice.pause();offlineVoice.currentTime=0;
    offlineVoice.volume=Math.max(0,Math.min(1,audio.volume*audio.sfxVolume));
    offlineVoice.play().catch(()=>playOriginalCue(name,options));
    audio.duck?.(1.6);return;
  }
  return playOriginalCue(name,options);
};
""")
main=main.replace('Roteiro singular carregado: 3 rounds, respostas fixas e juiz simulado.', 'Roteiro visual estendido carregado: 5 rounds, 20 falas, 5 julgamentos.')
main=main.replace("'DEBATE SINGULAR: roteiro de IA/criatividade pré-escrito, 3 rounds e 2 trocas. Nenhuma chamada de modelo.'", "'DEBATE SINGULAR ESTENDIDO: 5 rounds e 20 falas pré-escritas. Nenhuma chamada de modelo.'")
# A rota do catálogo necessita servidor; o Laboratório de Animações já funciona offline.
main=main.replace("'/assets/", "'app/assets/")
main=main.replace('"/assets/', '"app/assets/')
sprite=sprite.replace("'/assets/trio/'", "'app/assets/trio/'")
sprite=sprite.replace("'/assets/'", "'app/assets/'")
assets=assets.replace("`/assets/characters/", "`app/assets/characters/")
files=[dom,configuration,assets,sprite,performance,breakdown_policy,main]
(OFF/'app.bundle.js').write_text("/* Gerado por scripts/build-offline.py, não editar diretamente. */\n"+'\n\n'.join(files),encoding='utf8')

manifest=json.loads((APP/'assets/trio/manifest.json').read_text(encoding='utf8'))
(OFF/'manifest.js').write_text('window.CONTRAPONTO_MANIFEST = '+json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+';\nwindow.CONTRAPONTO_ACTOR_MANIFEST = '+json.dumps(json.loads((APP/'assets/actors-v22/manifest.json').read_text(encoding='utf8')),ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf8')
scenario=json.loads((OFF/'scenario.json').read_text(encoding='utf8'))
(OFF/'scenario.js').write_text('window.CONTRAPONTO_SCENARIO = '+json.dumps(scenario,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf8')
html=read('index.html')
html=re.sub(r'<link rel="stylesheet" href="/styles/[^\"]+">','',html)
html=html.replace('<script src="/ui/audio-engine.js" defer></script><script src="/ui/camera-director.js" defer></script><script type="module" src="/app.js"></script>',
                  '<link rel="stylesheet" href="offline/offline.css"><link rel="stylesheet" href="offline/reader-v17.css"><link rel="stylesheet" href="offline/menu-v18.css">'
                  '<script src="offline/manifest.js" defer></script><script src="offline/scenario.js" defer></script>'
                  '<script src="offline/bridge.js" defer></script>'
                  '<script src="app/ui/audio-engine.js" defer></script><script src="app/ui/camera-director.js" defer></script>'
                  '<script src="offline/app.bundle.js" defer></script>')
html=html.replace('href="/catalog.html"','href="offline/catalog.html"')
html=html.replace('src="/assets/', 'src="app/assets/')
html=html.replace('<main class="grid">','''<div class="offline-banner"><span class="demo-label"><span class="demo-signal"></span> DEMONSTRAÇÃO INTERATIVA</span><span>5 rodadas · história predefinida · nenhum modelo conectado</span><span class="demo-tag">100% OFFLINE</span></div>
<div class="offline-controls" id="offline-controls" aria-label="Controles do roteiro offline">
  <div class="offline-playback-label"><strong>DIREÇÃO DE LEITURA</strong><small>O ritmo é seu</small></div>
  <button type="button" class="offline-next-primary" id="offline-next">▶ COMEÇAR DEMONSTRAÇÃO</button>
  <button type="button" id="offline-replay">↻ REINICIAR</button>
  <span id="offline-position" class="offline-status">00 CENAS</span>
  <details class="offline-preferences"><summary><span class="preferences-icon">⚙</span> Ajustar ritmo <span aria-hidden="true">⌄</span></summary>
    <div class="offline-preferences-inner"><label>AVANÇO DO ROTEIRO<select id="offline-advance-mode"><option value="manual" selected>Por clique (recomendado)</option><option value="auto">Automático (opcional)</option></select></label>
    <label>VELOCIDADE DAS ANIMAÇÕES<select id="offline-speed"><option value="0.7" selected>0,7× · Cinematográfico</option><option value="1">1× · Natural</option><option value="1.35">1,35× · Ágil</option></select></label>
    <label>VELOCIDADE DO TEXTO<select id="offline-text-speed"><option value="55">Calmo · 55 ms</option><option value="35" selected>Natural · 35 ms</option><option value="18">Rápido · 18 ms</option><option value="0">Instantâneo</option></select></label>
    <p>Barra de espaço ou →: continuar. Clique uma vez para completar a fala; clique novamente para mudar de cena.</p></div>
  </details>
  <span id="offline-state" class="offline-status">PRONTO</span>
</div>
<main class="grid">''')
html=html.replace('<title>CONTRAPONTO • Arena de debates</title>', '<title>CONTRAPONTO • Visual Offline — abrir este HTML</title>')
html=html.replace('id="start-singular" class="scripted-btn"','id="start-singular" class="scripted-btn"')
html=html.replace('<label class="field-title" for="topic">TEMA DO DEBATE</label><textarea id="topic"', '<label class="field-title" for="topic">TEMA DO ROTEIRO <span>PREDEFINIDO</span></label><textarea id="topic" readonly')
html=html.replace('<div class="dialogue-foot">','<div class="dialogue-foot">')
html=html.replace('<span class="quote-mark">”</span>','<span class="dialogue-hint" id="dialogue-hint">▶ INICIE O DEBATE</span>')
# Modo offline v18 usa um HTML específico, com menus otimizados e os mesmos IDs.
# O template preserva a interface mesmo quando os bundles são regenerados.
menu_template = OFF/'menu-root-template.html'
if menu_template.exists():
    (ROOT/'index.html').write_text(menu_template.read_text(encoding='utf8'),encoding='utf8')
else:
    (ROOT/'index.html').write_text(html,encoding='utf8')
print('Gerados root index.html, offline/offline.css, offline/app.bundle.js, manifesto e roteiro.')
