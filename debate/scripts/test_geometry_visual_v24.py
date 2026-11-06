"""Chromium browser smoke test for all 16 states / transparent sprites in offline harness."""
from pathlib import Path
from urllib.parse import urlparse,unquote
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
SCREEN=ROOT/'docs/screenshots/v24';SCREEN.mkdir(parents=True,exist_ok=True)
STATES=['idle','talking','thinking','confident','objection','surprised','frustrated','breakdown']
def open_page(browser,width,height):
 page=browser.new_page(viewport={'width':width,'height':height});errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 def resolve(route):
  p=(ROOT/unquote(urlparse(route.request.url).path).lstrip('/')).resolve()
  if not p.is_relative_to(ROOT) or not p.is_file():return route.fulfill(status=404,body='missing')
  mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.wav':'audio/wav'}.get(p.suffix.lower(),'application/octet-stream')
  route.fulfill(status=200,body=p.read_bytes(),content_type=mime)
 page.route('https://contraponto.test/**',resolve)
 page.set_content((ROOT/'index.html').read_text(encoding='utf8').replace('<head>','<head><base href="https://contraponto.test/">',1),wait_until='load',timeout=35000)
 return page,errors
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for name,w,h in [('desktop',1512,960),('mobile',390,844)]:
  page,errors=open_page(browser,w,h)
  page.locator('#sprite-lab > summary').click()
  counts={}
  for who in ['lia','dante']:
   page.locator('#lab-person').select_option(who)
   options=page.locator('#lab-track option').evaluate_all('(xs)=>xs.map(x=>x.value)')
   assert options==STATES,options
   for state in STATES:
    page.locator('#lab-track').select_option(state)
    page.wait_for_function('''() => {const x=document.querySelector('#lab-image');return x && x.complete && x.naturalWidth===512 && x.naturalHeight===576}''',timeout=13000)
    v=page.locator('#lab-image').evaluate('(x)=>({src:x.getAttribute("src"),w:x.naturalWidth,h:x.naturalHeight,frame:x.dataset.frame})')
    assert v['src'].startswith(f'app/assets/actors-v22/{who}/{state}/'),v
    assert (v['w'],v['h'])==(512,576),v
    counts[who+'/'+state]=v['frame']
   # screenshot of dramatic state displayed in the lab
   page.locator('#lab-track').select_option('breakdown')
   page.locator('#lab-play').click()
   page.wait_for_timeout(220)
   page.locator('#lab-stop').click()
   page.screenshot(path=str(SCREEN/f'{name}-{who}-breakdown.png'),full_page=False,timeout=30000)
  assert not errors,errors
  assert page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth') <= 1
  print(name,'states confirmed:',len(counts),'errors:',len(errors),'overflow:',page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth'))
  page.close()
 browser.close()
