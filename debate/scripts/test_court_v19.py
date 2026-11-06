"""Inspeção de duas telas, primeira fala e veredito, com cenários locais simulados."""
from pathlib import Path
from urllib.parse import urlparse, unquote
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/screenshots/court-v19';OUT.mkdir(parents=True,exist_ok=True)
MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg','.jpg':'image/jpeg'}
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 for label,width,height in [('desktop',1512,960),('mobile',390,844)]:
  page=b.new_page(viewport={'width':width,'height':height},device_scale_factor=1); errors=[];missing=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  def route(r):
   target=(ROOT/unquote(urlparse(r.request.url).path).lstrip('/')).resolve()
   if not target.is_relative_to(ROOT) or not target.is_file(): missing.append(str(target));return r.fulfill(status=404,body='not found')
   return r.fulfill(status=200,body=target.read_bytes(),content_type=MIME.get(target.suffix.lower(),'application/octet-stream'))
  page.route('https://contraponto.test/**',route)
  html=(ROOT/'index.html').read_text().replace('<head>','<head><base href="https://contraponto.test/">',1)
  page.set_content(html,wait_until='domcontentloaded',timeout=12000)
  page.wait_for_timeout(300)
  page.select_option('#offline-demo-format','court');page.wait_for_timeout(300)
  assert page.locator('#court-fields').is_visible();print("start button status",page.locator("#start-singular").evaluate("el=>({hidden:el.hidden,style:getComputedStyle(el).display,exists:!!window.ContrapontoOffline})"),flush=True)
  assert page.locator('#debate-format').input_value()=='court'
  page.screenshot(path=str(OUT/f'{label}-config.png'),full_page=True,animations='disabled')
  page.click('#offline-next');page.wait_for_timeout(400)
  page.wait_for_function('window.ContrapontoOffline.settings.session.position>0',timeout=3500)
  first=page.locator('#offline-position').inner_text();page.wait_for_timeout(130)
  assert page.locator('#offline-position').inner_text()==first, 'Avanço não deveria ser automático'
  page.screenshot(path=str(OUT/f'{label}-opening.png'),full_page=False,animations='disabled')
  # Teste do evento real da interface sem forçar 23 sprites simultaneamente.
  page.evaluate('''() => {const session=window.ContrapontoOffline.settings.session;
    session.onmessage({data:JSON.stringify({type:'case_verdict',data:window.CONTRAPONTO_COURT_SCENARIO.verdict})}); }''')
  assert page.locator('#verdict').is_visible()
  assert page.locator('#debate-scores').is_hidden()
  assert 'NÃO COMPROVADA' in page.locator('#winner').inner_text()
  page.locator('#verdict').screenshot(path=str(OUT/f'{label}-verdict.png'),animations='disabled')
  assert page.evaluate('document.documentElement.scrollWidth-document.documentElement.clientWidth')<=1
  assert not errors,(label,errors)
  assert not missing,(label,missing[:5])
  print(label,'OK','erros',len(errors),'arquivos ausentes',len(missing),flush=True)
  page.close()
 b.close()
