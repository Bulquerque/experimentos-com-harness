"""Compila o modo offline e aplica a navegação editorial v18 ao HTML gerado.
Não expõe tokens e não altera código do Harness. Idênticos IDs funcionais.
"""
from pathlib import Path
import subprocess, sys
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
subprocess.run([sys.executable,str(ROOT/'scripts/build-offline.py')],check=True,cwd=ROOT)
soup=BeautifulSoup((ROOT/'app/index.html').read_text(encoding='utf8'),'html.parser')
for el in list(soup.head.find_all('link')):
    if str(el.get('href','')).startswith('/styles/'):el.decompose()
for el in list(soup.head.find_all('script')):
    if str(el.get('src','')).startswith(('/ui/','/app.js')):el.decompose()
for href in ('offline/offline.css','offline/reader-v17.css','offline/menu-v18.css','app/styles/court-v19.css'):
    soup.head.append(soup.new_tag('link',rel='stylesheet',href=href))
for src in ('offline/manifest.js','offline/scenario.js','offline/court-scenario.js','offline/bridge.js',
            'app/ui/audio-engine.js','app/ui/camera-director.js','app/ui/menu-v18.js','offline/app.bundle.js'):
    soup.head.append(soup.new_tag('script',src=src,defer=''))
soup.title.string='CONTRAPONTO · Visual novel offline'
soup.body['class']=list(dict.fromkeys([c for c in soup.body.get('class',[]) if c!='server-mode']+['menu-v18']))
for tag in soup.find_all(src=True):
    if tag['src'].startswith('/assets/'):tag['src']='app'+tag['src']
for tag in soup.find_all(href=True):
    if tag['href']=='/catalog.html':tag['href']='offline/catalog.html'
    elif tag['href'].startswith('/assets/'):tag['href']='app'+tag['href']
main=soup.select_one('main.grid')
assert main,'O documento da arena não contém a estrutura principal.'
controls=BeautifulSoup('''
<div class="offline-banner"><span class="demo-marker">✦ DEMONSTRAÇÃO INTERATIVA</span><span class="demo-caption" id="offline-banner-caption">5 rodadas · roteiro predefinido · sem chamadas a modelos</span><span class="demo-help">OFFLINE <b>◌</b></span></div>
<div class="offline-controls" id="offline-controls" aria-label="Controles de leitura">
  <label class="offline-demo-select">FORMATO<select id="offline-demo-format"><option value="debate">⚔ Debate de Ideias</option><option value="court">⚖ Tribunal Simulado</option></select></label>
  <div class="offline-playback-label"><strong>DIREÇÃO DE LEITURA</strong><small>Cada cena no seu ritmo</small></div>
  <button type="button" class="offline-next-primary" id="offline-next">▶ COMEÇAR A HISTÓRIA</button>
  <button type="button" id="offline-replay" title="Reiniciar roteiro" aria-label="Reiniciar roteiro">↻</button>
  <span id="offline-position" class="offline-status">00 CENAS</span>
  <details class="offline-preferences"><summary><span class="gear-symbol">⚙</span> Ritmo <span aria-hidden="true" class="disclosure-chevron">⌄</span></summary>
    <div class="offline-preferences-inner"><label>AVANÇO DO ROTEIRO<select id="offline-advance-mode"><option value="manual" selected>Por clique (recomendado)</option><option value="auto">Automático (opcional)</option></select></label>
    <label>VELOCIDADE DAS ANIMAÇÕES<select id="offline-speed"><option value="0.7" selected>0,7× · Cinematográfico</option><option value="1">1× · Natural</option><option value="1.35">1,35× · Ágil</option></select></label>
    <label>VELOCIDADE DO TEXTO<select id="offline-text-speed"><option value="55">Calmo · 55 ms</option><option value="35" selected>Natural · 35 ms</option><option value="18">Rápido · 18 ms</option><option value="0">Instantâneo</option></select></label>
    <p>Espaço ou seta → para continuar. Um clique revela a fala; o próximo avança.</p></div>
  </details>
  <span id="offline-state" class="offline-status">PRONTO</span>
</div>''','html.parser')
for child in list(controls.contents):main.insert_before(child.extract())
topic=soup.select_one('#topic')
if topic:topic['readonly']=''
label=soup.select_one('label[for="topic"]')
if label:
    label.clear(); label.append('✦ TEMA FIXO DO ROTEIRO')
    small=soup.new_tag('small'); small.string='DEMONSTRAÇÃO';label.append(small)
if not soup.select_one('#dialogue-hint'):
    hint=soup.new_tag('span',id='dialogue-hint');hint['class']=['dialogue-hint'];hint.string='▶ INICIE O DEBATE'
    foot=soup.select_one('.dialogue-foot');assert foot
    quote=foot.select_one('.quote-mark')
    if quote:quote.replace_with(hint)
    else:foot.append(hint)
(ROOT/'index.html').write_text(str(soup),encoding='utf8')
print('HTML offline v18 atualizado com menus editoriais, botão único e scripts locais.')
