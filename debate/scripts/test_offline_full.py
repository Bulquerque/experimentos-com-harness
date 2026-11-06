from pathlib import Path
from urllib.parse import urlparse,unquote
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
out=root/'docs/screenshots/offline-v16'
out.mkdir(parents=True,exist_ok=True)
def open_page(browser,width,height):
 page=browser.new_page(viewport={'width':width,'height':height})
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def assets(route):
  f=(root/unquote(urlparse(route.request.url).path).lstrip('/')).resolve()
  if not f.is_relative_to(root) or not f.is_file():return route.fulfill(status=404,body='not found')
  mt={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg','.jpg':'image/jpeg'}.get(f.suffix.lower(),'application/octet-stream')
  route.fulfill(status=200,body=f.read_bytes(),content_type=mt)
 page.route('https://contraponto.test/**',assets)
 page.set_content((root/'index.html').read_text(encoding='utf8').replace('<head>','<head><base href="https://contraponto.test/">',1),wait_until='load',timeout=20000)
 return page,errors
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
 for name,w,h in [('desktop',1512,900),('mobile',390,844)]:
  page,errors=open_page(b,w,h)
  page.locator('.offline-preferences > summary').click()
  page.locator('#offline-advance-mode').select_option('auto')
  page.locator('.offline-preferences > summary').click()
  page.evaluate('window.ContrapontoOffline.settings.speed=12; window.ContrapontoOffline.settings.textDelay=0')
  page.locator('#offline-next').click()
  try:page.wait_for_function("document.querySelector('#verdict')?.hidden===false",timeout=20000)
  except Exception as e: print(name,'timeout',e)
  print(name,'entries',page.locator('#transcript .entry').count(),'judge notes',page.locator('#judge-messages .judge-note').count(),'winner',page.locator('#winner').inner_text(),'score',page.locator('#score-a').inner_text(),page.locator('#score-b').inner_text(),'error',errors[:5])
  print('overscroll',page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth'))
  page.screenshot(path=str(out/f'{name}-final.png'),full_page=True,timeout=20000)
  assert page.locator('#transcript .entry').count()==25
  assert page.locator('#judge-messages .judge-note').count()==5
  assert not errors
  # Reiniciar, pausar e continuar também usam somente a ponte local.
  page.locator('#offline-replay').click()
  page.wait_for_timeout(700)
  page.locator('#pause').click()
  page.wait_for_timeout(180)
  assert 'PAUSADO' in page.locator('#offline-state').inner_text()
  page.locator('#pause').click()
  page.wait_for_timeout(180)
  assert 'REPRODUÇÃO AUTOMÁTICA' in page.locator('#offline-state').inner_text()
  page.close()
 b.close()
