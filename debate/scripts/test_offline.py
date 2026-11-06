"""Teste browser da versão que o usuário abre via duplo clique (file://)."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, time
root=Path(__file__).resolve().parents[1]
out=root/'docs/screenshots/offline-v16';out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
 for label,vp in [('desktop',{'width':1500,'height':950}),('mobile',{'width':390,'height':844})]:
  page=b.new_page(viewport=vp)
  issues=[];page.on('pageerror',lambda e:issues.append(str(e)))
  requests=[];page.on('request',lambda r:requests.append(r.url))
  from urllib.parse import unquote,urlparse
  def assets(route):
    f=(root/unquote(urlparse(route.request.url).path).lstrip('/')).resolve()
    if not f.is_relative_to(root) or not f.is_file():
      route.fulfill(status=404,body='missing');return
    mt={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg','.jpg':'image/jpeg'}.get(f.suffix.lower(),'application/octet-stream')
    route.fulfill(status=200,body=f.read_bytes(),content_type=mt)
  page.route('https://contraponto.test/**',assets)
  html=(root/'index.html').read_text(encoding='utf8').replace('<head>','<head><base href="https://contraponto.test/">',1)
  page.set_content(html,wait_until='load',timeout=20000)
  page.wait_for_timeout(1000)
  print(label,'title',page.title(),'models',page.locator('#model-a option').count(),'stage',page.locator('#arena').count(),'issues',issues[:7])
  print('broken',page.locator('img').evaluate_all('(images) => images.filter(x=>!x.complete || x.naturalWidth===0).map(x=>x.id+":"+x.src).slice(0,12)'))
  page.screenshot(path=str(out/f'{label}-inicio.png'),full_page=True,timeout=20000)
  page.locator('#offline-next').click(timeout=5000)
  page.wait_for_timeout(900)
  print('start disabled',page.locator('#offline-next').is_disabled(),'text',page.locator('#status').inner_text(),'err',issues[:7])
  page.wait_for_timeout(6000)
  print('after6',page.locator('#status').inner_text(),'speech',page.locator('#speech-text').inner_text()[:120], 'anim',page.locator('#pack-avatar-a').get_attribute('data-animation'), 'errors',issues[:7])
  page.screenshot(path=str(out/f'{label}-debate.png'),full_page=True,timeout=20000)
  maxscroll=page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
  print('scroll overflow',maxscroll)
  page.close()
 b.close()
