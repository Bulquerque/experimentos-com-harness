"""Visual QA: cenários offline, revelações por sessão, sem chave NIM."""
from pathlib import Path
from urllib.parse import urlparse, unquote
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/screenshots/sessoes-v21';OUT.mkdir(parents=True,exist_ok=True)
MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg','.jpg':'image/jpeg'}
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 for label,w,h in [('desktop',1512,940),('mobile',390,844)]:
  page=b.new_page(viewport={'width':w,'height':h},device_scale_factor=1)
  errors=[];missing=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  def route(req):
   f=(ROOT/unquote(urlparse(req.request.url).path).lstrip('/')).resolve()
   if not f.is_relative_to(ROOT) or not f.is_file():missing.append(str(f));return req.fulfill(status=404,body='missing')
   return req.fulfill(status=200,body=f.read_bytes(),content_type=MIME.get(f.suffix.lower(),'application/octet-stream'))
  page.route('https://court-v21.test/**',route)
  html=(ROOT/'index.html').read_text().replace('<head>','<head><base href="https://court-v21.test/">',1)
  page.set_content(html,wait_until='load',timeout=18000)
  page.select_option('#offline-demo-format','court')
  page.wait_for_timeout(300)
  page.screenshot(path=str(OUT/f'{label}-menu.png'),full_page=True,animations='disabled')
  page.locator('#offline-text-speed').select_option('0',force=True)
  page.locator('#offline-next').click()
  page.wait_for_function('window.ContrapontoOffline.settings.session && window.ContrapontoOffline.settings.session.position>0',timeout=5000)
  page.wait_for_timeout(170)
  def next_scene():
   if 'CONCLUÍDO' not in page.locator('#offline-state').inner_text():
    page.locator('#offline-next').click()
    page.wait_for_timeout(130)
  # 1 abertura, 2 prova EX-01; cenas programadas no bridge
  next_scene()
  assert 'NOVA PROVA' in page.locator('#speech-name').inner_text()
  assert 'Registro de acesso' in page.locator('#speech-text').inner_text()
  page.screenshot(path=str(OUT/f'{label}-prova-inicial.png'),full_page=False,animations='disabled')
  found2=False;found3=False
  for i in range(40):
   if 'CONCLUÍDO' in page.locator('#offline-state').inner_text():break
   next_scene()
   if 'NOVA PROVA' in page.locator('#speech-name').inner_text():
    body=page.locator('#speech-text').inner_text()
    if 'Relatório da câmera' in body:
     found2=True;page.screenshot(path=str(OUT/f'{label}-nova-camera.png'),full_page=False,animations='disabled')
    if 'Depoimento' in body:
     found3=True;page.screenshot(path=str(OUT/f'{label}-novo-depoimento.png'),full_page=False,animations='disabled')
  assert found2 and found3, (label,found2,found3)
  assert page.locator('#verdict').is_visible()
  assert page.locator('#transcript .entry').count() >= 20
  assert page.locator('.court-evidence-timeline-entry').count()==3
  assert page.evaluate('document.documentElement.scrollWidth-document.documentElement.clientWidth')<=1
  assert not errors,errors;assert not missing,missing[:5]
  page.screenshot(path=str(OUT/f'{label}-veredito.png'),full_page=True,animations='disabled')
  print(label,'PASS', 'timeline 3, file errors',len(missing),'JS errors',len(errors),flush=True)
  page.close()
 b.close()
