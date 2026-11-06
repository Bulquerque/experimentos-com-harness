"""Teste visual offline v18. Carrega arquivos locais por interceptação em Chromium, sem API externa."""
from pathlib import Path
from urllib.parse import unquote,urlparse
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/screenshots/menu-v18'
OUT.mkdir(parents=True,exist_ok=True)
MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg','.jpg':'image/jpeg','.svg':'image/svg+xml'}

def make_page(browser,width,height):
    page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
    errors=[];missing=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    def route(r):
        target=(ROOT/unquote(urlparse(r.request.url).path).lstrip('/')).resolve()
        if not target.is_relative_to(ROOT) or not target.is_file():
            missing.append(str(target));return r.fulfill(status=404,body='not found')
        r.fulfill(status=200,body=target.read_bytes(),content_type=MIME.get(target.suffix.lower(),'application/octet-stream'))
    page.route('https://contraponto.local/**',route)
    html=(ROOT/'index.html').read_text(encoding='utf8').replace('<head>','<head><base href="https://contraponto.local/">',1)
    page.set_content(html,wait_until='load')
    return page,errors,missing
with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
  for label,width,height in [('desktop',1512,960),('mobile',390,844)]:
    page,errors,missing=make_page(browser,width,height)
    page.wait_for_timeout(600)
    assert page.locator('link[href="offline/menu-v18.css"]').count()==1
    assert page.locator('.config-drawer[open]').count()==0
    assert page.locator('#offline-advance-mode').input_value()=='manual'
    page.screenshot(path=str(OUT/f'{label}-initial.png'),full_page=True,animations='disabled')
    # Inspect accessible configurations without breaking interactive controls.
    page.locator('.config-drawer:not([hidden]) > summary').first.click()
    assert page.locator('#name-a').is_visible()
    page.screenshot(path=str(OUT/f'{label}-elenco.png'),full_page=True,animations='disabled')
    page.locator('.config-drawer:not([hidden]) > summary').nth(1).click()
    page.wait_for_function("!document.querySelector('.config-drawer').open", timeout=2500)
    page.locator('.config-drawer:not([hidden]) > summary').nth(1).click()
    page.locator('.offline-preferences summary').click()
    assert page.locator('#offline-speed').is_visible()
    page.screenshot(path=str(OUT/f'{label}-ritmo.png'),full_page=False,animations='disabled')
    page.locator('.topbar .logo').click()
    assert not page.locator('.offline-preferences').evaluate('(el) => el.open'), 'Menu de ritmo não fechou com clique externo'
    # test singular: 2-click behavior (reveal and next).
    page.locator('#offline-next').click()
    page.wait_for_function("document.querySelector('#offline-position').textContent.includes('01 /')",timeout=5000)
    pos=page.locator('#offline-position').inner_text()
    page.wait_for_timeout(350)
    assert page.locator('#offline-position').inner_text()==pos
    # O primeiro clique revela o texto, os seguintes avançam uma cena por vez.
    for _ in range(4):
        page.locator('#offline-next').click()
        page.wait_for_timeout(180)
        if '02 /' in page.locator('#offline-position').inner_text():break
    assert '02 /' in page.locator('#offline-position').inner_text(), 'Clique não avançou a cena'
    page.screenshot(path=str(OUT/f'{label}-debate.png'),full_page=True,animations='disabled')
    overflow=page.evaluate('document.documentElement.scrollWidth-document.documentElement.clientWidth')
    assert overflow<=1,(label,overflow)
    assert not errors,(label,errors)
    assert not missing,(label,missing[:15])
    print(label,'OK','overlap',overflow,'errors',len(errors),'files_missing',len(missing))
    page.close()
  browser.close()
