"""Teste visual offline em Chromium: carrega os módulos JS reais via file://.

As respostas HTTP/SSE são fixtures explícitas. As rotas HTTP reais são
verificadas separadamente em tests/server.test.js.
"""
import json
import base64
import re
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'app'
SHOTS = ROOT / 'docs' / 'screenshots'
SHOTS.mkdir(parents=True, exist_ok=True)

# O único script gerado é um fixture de navegador. Não há modelo local.
script = """import { SINGULAR_PRESET, scriptedTurn, scriptedJudgment } from './harness/singular.js';
const events=[];
for(let round=1;round<=3;round++) {
  events.push(['round_start',{round,total:3,subtopic:SINGULAR_PRESET.roundTopics[round-1]}]);
  for(let exchange=1;exchange<=2;exchange++) {
    for(const side of (round%2?['A','B']:['B','A'])) {
      const agent=SINGULAR_PRESET.agents[side==='A'?0:1];
      events.push(['turn',{...scriptedTurn(round,exchange,side),round,speaker:side,name:agent.name,position:agent.position}]);
    }
  }
  events.push(['judging',{round}]);
  events.push(['judgment',scriptedJudgment(round)]);
}
events.push(['finished',{totalA:25,totalB:25,winner:'empate'}]);
console.log(JSON.stringify({preset:SINGULAR_PRESET,events}));"""
fixture = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script], cwd=ROOT, text=True))
models = [
    {'id': 'nvidia/nemotron-3.5-lightning-30b-a3b', 'label': 'Nemotron Lightning'},
    {'id': 'z-ai/glm-5.3-flash', 'label': 'GLM Flash'},
    {'id': 'nvidia/nemotron-3.5-super-vl-120b-a12b', 'label': 'Nemotron Judge'}
]
mock = f"""
window.__fixture = {json.dumps(fixture, ensure_ascii=False)};
window.__activeConfig = null;
window.fetch = async (url, options = {{}}) => {{
  const route = String(url);
  let data = {{}};
  if (route === '/assets/audio/objection-voice.mp3') {{
    const bytes=Uint8Array.from(atob('__OBJECTION_AUDIO__'),c=>c.charCodeAt(0));
    return {{ok:true,arrayBuffer:async()=>bytes.buffer}};
  }}
  if (route === '/assets/trio/manifest.json') data = __MANIFEST__;
  else if (route === '/api/config') data = {{ models: {json.dumps(models)}, hasNimKey:false, hasWebSearch:false }};
  else if (route === '/api/documents') data = {{ documents:[] }};
  else if (route === '/api/scenarios/singular') data = {{ preset: window.__fixture.preset }};
  else if (route === '/api/debates') {{
    window.__activeConfig = JSON.parse(options.body);
    data = {{ id:'12345678-aaaa-bbbb-cccc-123456789012', config:window.__activeConfig }};
  }}
  else if (route.endsWith('/control')) data = {{ status:'running' }};
  return {{ok:true, status:200, json:async () => data}};
}};
window.EventSource = class {{
  constructor() {{
    this.closed = false;
    setTimeout(() => {{
      if (this.closed) return;
      this.onmessage?.({{data: JSON.stringify({{type:'started',data:{{config:window.__activeConfig}}}})}});
      if (window.__activeConfig?.mode === 'singular') {{
        window.__fixture.events.forEach(([type,data],index) => setTimeout(() => {{
          if (!this.closed) this.onmessage?.({{data:JSON.stringify({{type,data}})}});
        }}, 80 + index*40));
      }}
    }}, 30);
  }}
  close() {{this.closed=true;}}
}};
"""
mock = mock.replace("__MANIFEST__", json.dumps(json.loads((PUBLIC / "assets/trio/manifest.json").read_text()),ensure_ascii=False))
mock = mock.replace("__OBJECTION_AUDIO__", base64.b64encode((PUBLIC / "assets/audio/objection-voice.mp3").read_bytes()).decode())

# O ambiente de execução bloqueia navegação HTTP e file:// no Chromium.
# O fixture carrega o HTML/CSS e CONCATENA os módulos exatos, removendo apenas
# imports/exports ES, sem modificar o código de produção.
html = (PUBLIC / 'index.html').read_text().replace('<head>', '<head><base href="https://contraponto.test/">')
for filename in ('styles/base.css', 'styles/camera.css', 'styles/effects.css', 'styles/customization.css', 'styles/audio.css', 'styles/scenes.css', 'styles/characters.css', 'styles/sprites.css', 'styles/motion.css', 'styles/judge.css', 'styles/judge-effects.css', 'styles/performance.css'):
    html = html.replace(f'<link rel="stylesheet" href="/{filename}">', '')
for filename in ('ui/audio-engine.js', 'ui/camera-director.js'):
    html = html.replace(f'<script src="/{filename}" defer></script>', '')
html = html.replace('<script type="module" src="/app.js"></script>', '')
styles = '\n'.join((PUBLIC / filename).read_text() for filename in
    ('styles/base.css', 'styles/camera.css', 'styles/effects.css', 'styles/customization.css', 'styles/audio.css', 'styles/scenes.css', 'styles/characters.css', 'styles/sprites.css', 'styles/motion.css', 'styles/judge.css', 'styles/judge-effects.css', 'styles/performance.css'))
# Chromium neste ambiente bloqueia URLs HTTP locais. Imagens da cena são
# embutidas apenas no fixture visual; os arquivos reais continuam externos.
def embed_scene_asset(match):
    f = PUBLIC / 'assets' / match.group(1)
    if not f.is_file():
        raise FileNotFoundError(f)
    mime = 'image/webp'
    return 'url(\"data:' + mime + ';base64,' + base64.b64encode(f.read_bytes()).decode() + '\")'
styles = re.sub(r"url\(['\"]?/assets/([^)'\"]+)['\"]?\)", embed_scene_asset, styles)
dom = (PUBLIC / 'ui/dom.js').read_text().replace('export const', 'const').replace('export function', 'function').replace('export async function', 'async function')
configuration = (PUBLIC / 'ui/configuration.js').read_text().replace("import { $ , node } from './dom.js';", '').replace('export function', 'function').replace('export async function', 'async function')
sprite = (PUBLIC / 'ui/sprite-director.js').read_text().replace("export class SpriteDirector", "class SpriteDirector")
performance = (PUBLIC / 'ui/performance-director.js').read_text().replace('export function performanceBeats','function performanceBeats').replace('export class PerformanceDirector','class PerformanceDirector')
assets = (PUBLIC / 'ui/character-assets.js').read_text().replace('export const', 'const').replace('export function','function')
app = (PUBLIC / 'app.js').read_text()
app = app.replace("import { $, node, toast, api, optionList } from './ui/dom.js';", '')
app = app.replace("import { formConfig, renderRoundTopics } from './ui/configuration.js';", '')
app = app.replace("import { artUrl, poseName, eyesName } from './ui/character-assets.js';", '')
app = app.replace("import { SpriteDirector } from './ui/sprite-director.js';", '')
app = app.replace("import { PerformanceDirector } from './ui/performance-director.js';", '')
app_bundle = dom + '\n' + configuration + '\n' + assets + '\n' + sprite + '\n' + performance + '\n' + app

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium',
                                args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
    for viewport, name in [({'width':1440,'height':900},'desktop'), ({'width':390,'height':844},'mobile')]:
        page = browser.new_page(viewport=viewport)
        def serve_asset(route):
            from urllib.parse import urlparse, unquote
            rel=unquote(urlparse(route.request.url).path).lstrip('/')
            candidate=(PUBLIC / rel).resolve()
            if not candidate.is_relative_to(PUBLIC) or not candidate.is_file():
                return route.fulfill(status=404, body='missing')
            suffix=candidate.suffix.lower()
            return route.fulfill(status=200, body=candidate.read_bytes(), content_type= {'png':'image/png','webp':'image/webp','css':'text/css','jpg':'image/jpeg','json':'application/json'}.get(suffix.lstrip('.'),'application/octet-stream'))
        page.route('https://contraponto.test/assets/**', serve_asset)
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))
        page.set_content(html)
        page.add_style_tag(content=styles)
        page.add_script_tag(content=mock)
        page.add_script_tag(content="""
          window.__audioSourceDurations=[];
          const createBufferSource=AudioContext.prototype.createBufferSource;
          AudioContext.prototype.createBufferSource=function(){
            const source=createBufferSource.apply(this,arguments);
            const start=source.start;
            source.start=function(){
              window.__audioSourceDurations.push(this.buffer?.duration||0);
              return start.apply(this,arguments);
            };
            return source;
          };
        """)
        page.add_script_tag(content=(PUBLIC / 'ui/audio-engine.js').read_text())
        page.add_script_tag(content=(PUBLIC / 'ui/camera-director.js').read_text())
        page.add_script_tag(content=app_bundle)
        try:
            page.wait_for_function("document.querySelector('#model-a')?.options.length > 0", timeout=3500)
        except Exception:
            print('DEBUG errors:', errors, 'models:', page.evaluate("document.querySelector('#model-a')?.options.length"))
            raise
        assert page.locator('#lab-track option').count() == 12, 'Laboratório incompleto'
        page.locator('#sprite-lab summary').click()
        page.locator('#lab-track').select_option('objection/corpo')
        page.locator('#lab-play').click()
        page.wait_for_timeout(250)
        page.wait_for_function("document.querySelector('#lab-image').complete && document.querySelector('#lab-image').naturalWidth>0",timeout=5000)
        page.locator('#lab-stop').click()
        page.locator('#audio-studio summary').click()
        page.locator('#music-volume').fill('64')
        page.locator('#effects-volume').fill('35')
        assert page.locator('#music-volume-value').inner_text() == '64%'
        assert page.locator('#effects-volume-value').inner_text() == '35%'
        # O MP3 real fornecido pelo usuário deve decodificar e tocar no Web Audio.
        page.locator('#cue-type').select_option('objection')
        page.locator('#cue-preview').click()
        page.wait_for_function("window.__audioSourceDurations.some(x => x > 1.4 && x < 1.7)",timeout=4000)
        assert 'arquivo incluído' in page.locator('#cue-status').inner_text().lower()
        previous=page.evaluate('window.__audioSourceDurations.length')
        page.locator('#use-objection-voice').uncheck()
        page.locator('#cue-preview').click()
        page.wait_for_timeout(200)
        synth=page.evaluate('(before) => window.__audioSourceDurations.slice(before)', previous)
        assert not any(1.4<x<1.7 for x in synth), 'Desligar voz não desativou arquivo incluído'
        page.locator('#use-objection-voice').check()

        page.locator('#start-singular').click()
        page.wait_for_function("document.querySelector('#stats-turns').textContent !== '00'", timeout=8000)
        assert 'criatividade' in page.locator('#topic').input_value().lower()
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 3')
        assert not errors, errors
        page.wait_for_timeout(700)  # espera fim das animações de revelação do texto
        assert page.locator('#pack-avatar-a').evaluate('(el) => el.complete && el.naturalWidth > 0')
        assert page.locator('#pack-avatar-b').evaluate('(el) => el.complete && el.naturalWidth > 0')
        page.screenshot(path=str(SHOTS / f'arena-{name}.png'), full_page=True)
        # Captura determinística da MESMA ação usada pelo Debate Singular e NIM.
        # O evento é enviado ao diretor de UI sem gastar uma chamada de IA.
        page.locator('#arena').scroll_into_view_if_needed()
        page.evaluate("document.getElementById('toast').style.display='none'")
        played_before_objection=page.evaluate('window.__audioSourceDurations.length')
        page.evaluate("""() => signalVisual({speaker:'B',name:'Dante',round:1,
          action:'objection',emotion:'frustrated',gesture:'point',
          speech:'Objeção! Uma tese deve trazer evidências verificáveis.'})""")
        overlay=page.locator('#facecard-overlay')
        assert overlay.get_attribute('data-side') == 'b'
        assert page.locator('#arena').get_attribute('data-performance-side') == 'b'
        assert overlay.evaluate('(el) => el.classList.contains("visible")')
        page.wait_for_timeout(220)
        assert 'objection/olhos' in (page.locator('#facecard-image').get_attribute('data-animation') or '')
        assert page.locator('#facecard-image').evaluate('(el) => el.complete && el.naturalWidth > 0')
        bounds=overlay.bounding_box(); arena=page.locator('#arena').bounding_box()
        assert bounds['x']>=arena['x']-2 and bounds['x']+bounds['width'] <= arena['x']+arena['width']+2
        assert bounds['width'] <= arena['width']*.55, 'Face Card grande demais: encobre o palco'
        assert bounds['height'] <= arena['height']*.22, 'Face Card alto demais'
        assert page.locator('#dialogue').evaluate('(el) => +getComputedStyle(el).zIndex') > overlay.evaluate('(el) => +getComputedStyle(el).zIndex')
        # Congelamos o instante APENAS para capturar um frame reproduzível.
        page.evaluate("() => {clearTimeout(facecardTimer);document.querySelector('#facecard-overlay').style.animationPlayState='paused'}")
        page.locator('#arena').screenshot(path=str(SHOTS / f'facecard-stage-{name}.png'), animations='allow')
        page.evaluate("() => {const e=document.querySelector('#facecard-overlay');e.classList.remove('visible');e.style.animationPlayState=''}")
        # Esperar o início do corpo com polling elimina flutuação do Chromium.
        page.wait_for_function("document.querySelector('#arena').dataset.shotPhase === 'performance'",timeout=2200)
        assert not overlay.evaluate('(el) => el.classList.contains("visible")'), 'Face Card ficou sobre o gesto completo'
        assert 'objection/corpo' in (page.locator('#pack-avatar-b').get_attribute('data-animation') or ''), 'Gesto corporal não iniciou'
        page.wait_for_function('(n) => window.__audioSourceDurations.slice(n).some(x=>x>1.4&&x<1.7)',arg=played_before_objection,timeout=1800)
        assert page.locator('#pack-avatar-b').evaluate('(el) => el.complete && el.naturalWidth>0')
        page.locator('#arena').screenshot(path=str(SHOTS / f'body-action-stage-{name}.png'), animations='allow')
        # O zoom de performance não pode cortar o retângulo dos retratos.
        portrait=page.locator('#duelist-b .portrait').bounding_box()
        assert portrait['x']>=arena['x']-10 and portrait['x']+portrait['width'] <= arena['x']+arena['width']+10
        assert not errors, errors
        # O mesmo controlador deve utilizar os assets de pergunta, refutação
        # e concessão. O juiz reage como observador durante cada intervenção.
        for kind,expected in [('rebuttal','argumento_forte/corpo'),('question','conversa_gestos/corpo'),('concession','conversa_gestos/corpo')]:
            page.evaluate('''(kind) => signalVisual({speaker:'A',name:'Lia',round:1,
                action:kind,emotion:'confident',gesture:'open-hand',
                speech:'Uma intervenção simulada para conferir sprites e enquadramento.'})''', kind)
            page.wait_for_timeout(640)
            assert expected in (page.locator('#pack-avatar-a').get_attribute('data-animation') or ''), kind
            assert 'elias/observacao' in (page.locator('#judge-sidebar-sprite').get_attribute('data-animation') or ''), 'O juiz deve observar as intervenções'
            assert page.locator('#pack-avatar-a').evaluate('(img) => img.complete && img.naturalWidth > 0')
            if name=='desktop':
                page.locator('#arena').screenshot(path=str(SHOTS / f'{kind}-v13-desktop.png'),animations='allow')
        # Alternância de cenários precisa afetar a arte, sem reiniciar os agentes.
        # Juiz Elias real: a mesma função acionada pelo evento 'judging' / 'judgment'.
        page.evaluate("onEvent({type:'judging',data:{round:1}})")
        page.wait_for_timeout(220)
        assert 'elias/pensando' in (page.locator('#judge-stage-sprite').get_attribute('data-animation') or '')
        assert page.locator('#judge-stage-sprite').evaluate('(img) => img.complete && img.naturalWidth === 256')
        assert page.locator('#judge-sidebar-sprite').evaluate('(img) => img.complete && img.naturalWidth === 256')
        judge_stage=page.locator('#judge-stage-sprite').bounding_box()
        assert judge_stage['x'] >= arena['x']-4 and judge_stage['x']+judge_stage['width'] <= arena['x']+arena['width']+4
        assert judge_stage['y'] >= arena['y']-5 and judge_stage['y']+judge_stage['height'] <= arena['y']+arena['height']-130
        page.locator('#arena').screenshot(path=str(SHOTS / f'judge-thinking-{name}.png'),animations='allow')
        page.evaluate("onEvent({type:'judgment',data:{round:1,scoreA:8,scoreB:7,winner:'A',reason:'Avaliação simulada de integração.',simulated:true}})")
        page.wait_for_timeout(280)
        assert 'elias/martelo' in (page.locator('#judge-stage-sprite').get_attribute('data-animation') or '')
        eyes = page.locator('#judge-eyes-sprite')
        assert eyes.is_visible(), 'A faixa original dos olhos de Elias deveria estar no primeiro ato'
        assert eyes.evaluate('(img) => img.complete && img.naturalWidth === 960')
        page.locator('#arena').screenshot(path=str(SHOTS / f'judge-eyes-v13-{name}.png'),animations='allow')
        page.wait_for_timeout(510)
        assert not eyes.is_visible(), 'A faixa do juiz ficou sobre a animação corporal'
        flash=page.locator('#judge-impact-sprite')
        # O flash dura poucos quadros. Prints podem atravessar essa janela;
        # se necessário, reproduzimos a mesma transição e esperamos o frame real.
        if not flash.is_visible():
            page.evaluate("sprites.judgeAccent('judgment')")
            page.wait_for_function("!document.querySelector('#judge-impact-sprite').hidden", timeout=2200)
        assert flash.is_visible(), 'O impacto do martelo deveria usar o sprite real de Elias'
        assert flash.evaluate('(img) => img.complete && img.naturalWidth === 192')
        assert page.locator('#dialogue').evaluate('(el) => +getComputedStyle(el).zIndex') > 0
        page.locator('#arena').screenshot(path=str(SHOTS / f'judge-impact-v13-{name}.png'),animations='allow')
        page.locator('#arena').screenshot(path=str(SHOTS / f'judge-gavel-{name}.png'),animations='allow')
        page.wait_for_function("(el) => el.dataset.animation === 'elias/veredito'",arg=page.locator('#judge-stage-sprite').element_handle(),timeout=3200)
        page.locator('#arena').screenshot(path=str(SHOTS / f'judge-verdict-{name}.png'),animations='allow')
        # Alternância de cenários após o juiz, sem reiniciar os agentes.
        # O evento 'finished' não pode cancelar a sequência final do magistrado.
        page.evaluate("onEvent({type:'finished',data:{winner:'empate',totalA:25,totalB:25}})")
        page.wait_for_timeout(450)
        assert 'elias/veredito' in (page.locator('#judge-stage-sprite').get_attribute('data-animation') or ''), 'A animação de encerramento foi interrompida'
        page.locator('#arena').screenshot(path=str(SHOTS / f'finale-v13-{name}.png'),animations='allow')
        # Alternar para uma nova cena não deve manter efeitos de gavel anteriores.
        page.locator('#scene-preset').select_option('night')
        assert page.locator('#arena').get_attribute('data-scene') == 'night'
        assert 'image/webp;base64' in page.locator('.scene-backdrop').evaluate('(el) => getComputedStyle(el).backgroundImage')
        if name == 'desktop':
            page.screenshot(path=str(SHOTS / 'arena-night-desktop.png'), full_page=True)
        page.locator('#scene-preset').select_option('front')
        assert page.locator('#arena').get_attribute('data-scene') == 'front'
        page.locator('#reset').click()
        page.wait_for_function("!document.querySelector('#start-singular').disabled")
        # V14: atuação viva de um argumento, com mudança de pose e resposta.
        page.evaluate("signalVisual({speaker:'A',name:'Lia',round:1,action:'argument',emotion:'confident',gesture:'open-hand',speech:'A criatividade nasce de escolhas, comparação e experimentação.'})")
        page.wait_for_timeout(1520)
        assert 'conversa_gestos/corpo' in (page.locator('#pack-avatar-a').get_attribute('data-animation') or ''), 'Fala comum não alternou para gesto'
        assert page.locator('#arena').get_attribute('data-performance-phase') == 'emphasis'
        page.locator('#arena').screenshot(path=str(SHOTS / f'performance-gesto-v14-{name}.png'), animations='allow')
        page.wait_for_timeout(970)
        assert page.locator('#arena').get_attribute('data-performance-phase') == 'listener'
        page.locator('#arena').screenshot(path=str(SHOTS / f'performance-ouvinte-v14-{name}.png'), animations='allow')
        # Nova fala deve cancelar cues da anterior, sem uma reação atrasada.
        page.evaluate("signalVisual({speaker:'B',name:'Dante',round:1,action:'objection',emotion:'frustrated',gesture:'point',speech:'Objeção! Esse argumento precisa de provas.'})")
        page.wait_for_timeout(1150)
        assert page.locator('#arena').get_attribute('data-performance-side') == 'b'
        assert 'negacao/corpo' in (page.locator('#pack-avatar-a').get_attribute('data-animation') or ''), 'O ouvinte não reagiu ao impacto'
        assert not errors, errors
        print(f'OK: {name}, módulos de UI, roteiro simulado, sprites e áudio.')
        page.close()
    browser.close()
