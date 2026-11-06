from pathlib import Path
from urllib.parse import urlparse,unquote
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1200,'height':800})
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def asset(route):
  f=(root/unquote(urlparse(route.request.url).path).lstrip('/')).resolve()
  if not f.is_relative_to(root) or not f.is_file():return route.fulfill(status=404,body='missing')
  ct={'.js':'text/javascript','.png':'image/png','.html':'text/html','.css':'text/css'}.get(f.suffix.lower(),'application/octet-stream')
  route.fulfill(status=200,body=f.read_bytes(),content_type=ct)
 page.route('https://contraponto.test/**',asset)
 html=(root/'offline/catalog.html').read_text().replace('<head>','<head><base href="https://contraponto.test/offline/">',1)
 page.set_content(html,wait_until='load')
 print('Lia',page.locator('#track option').count())
 page.locator('#person').select_option('elias')
 print('Elias',page.locator('#track option').count(),'errors',errors)
 page.locator('#play').click();page.wait_for_timeout(400)
 print('frame',page.locator('#frame').get_attribute('src'),'loaded',page.locator('#frame').evaluate('(img) => img.naturalWidth > 0'))
 assert not errors and page.locator('#track option').count()>5
 (root/'docs/screenshots/offline-v16').mkdir(exist_ok=True,parents=True)
 page.screenshot(path=str(root/'docs/screenshots/offline-v16/catalogo-juiz.png'),full_page=True)
 b.close()
