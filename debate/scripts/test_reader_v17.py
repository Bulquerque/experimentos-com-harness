"""E2E do leitor: sem chave NVIDIA, sem servidor e sem modelo local."""
from pathlib import Path
from urllib.parse import urlparse, unquote
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/screenshots/reader-v17';OUT.mkdir(parents=True,exist_ok=True)
MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg','.jpg':'image/jpeg'}

def new_page(browser,width,height):
    page=browser.new_page(viewport={'width':width,'height':height})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    def route(req):
        path=(ROOT/unquote(urlparse(req.request.url).path).lstrip('/')).resolve()
        if not path.is_relative_to(ROOT) or not path.is_file():
            return req.fulfill(status=404,body='not found')
        req.fulfill(status=200,body=path.read_bytes(),content_type=MIME.get(path.suffix.lower(),'application/octet-stream'))
    page.route('https://contraponto.local/**',route)
    html=(ROOT/'index.html').read_text(encoding='utf8').replace('<head>','<head><base href="https://contraponto.local/">',1)
    page.set_content(html,wait_until='load')
    return page,errors

with sync_playwright() as p:
    b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    for label,w,h in [('desktop',1512,920),('mobile',390,844)]:
        page,errors=new_page(b,w,h)
        page.wait_for_timeout(250)
        assert page.locator('.config-drawer[open]').count()==0
        assert page.locator('.stage-settings[open]').count()==0
        assert page.locator('.transcript-drawer[open]').count()==0
        assert page.locator('#offline-advance-mode').input_value()=='manual'
        page.screenshot(path=str(OUT/f'{label}-initial.png'),full_page=True)
        page.locator('#offline-next').click()
        page.wait_for_function("document.querySelector('#offline-position').textContent.includes('01 /')",timeout=5000)
        start_position=page.locator('#offline-position').inner_text()
        page.wait_for_timeout(260)
        assert page.locator('#offline-position').inner_text()==start_position, 'A cena avançou sozinha!'
        assert 'ROUND' in page.locator('#speech-name').inner_text()
        # Ao clicar, apenas revelar a fala — não adiantar o roteiro.
        page.locator('#offline-next').click()
        assert page.locator('#offline-position').inner_text()==start_position
        page.wait_for_timeout(140)
        page.locator('#offline-next').click()
        page.wait_for_function("document.querySelector('#offline-position').textContent.includes('02 /')")
        assert page.locator('#speech-name').inner_text()=='LIA'
        assert page.locator('#offline-position').inner_text().startswith('02')
        page.screenshot(path=str(OUT/f'{label}-first-speech.png'),full_page=True)
        # Verifica pausa indefinida e ajuste de velocidade do sprite.
        page.wait_for_timeout(1150)
        assert page.locator('#offline-position').inner_text().startswith('02'), 'A fala não esperou o clique'
        page.locator('.offline-preferences > summary').click()
        page.locator('#offline-speed').select_option('0.7')
        assert page.evaluate('window.CONTRAPONTO_ANIMATION_SPEED')==0.7
        page.locator('#offline-text-speed').select_option('0')
        page.locator('.offline-preferences > summary').click()
        page.locator('#offline-next').click()
        page.wait_for_timeout(120)
        page.locator('#offline-next').click()
        page.wait_for_function("document.querySelector('#offline-position').textContent.includes('03 /')")
        assert 'DANTE' in page.locator('#speech-name').inner_text()
        page.screenshot(path=str(OUT/f'{label}-objection.png'),full_page=True)
        assert page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')<=1
        # Debates completos podem ser percorridos sem qualquer timer automático.
        page.locator('.offline-preferences > summary').click()
        page.locator('#offline-text-speed').select_option('0')
        page.locator('.offline-preferences > summary').click()
        for _ in range(40):
            if 'CONCLUÍDO' in page.locator('#offline-state').inner_text():break
            if page.locator('#offline-next').is_enabled():page.locator('#offline-next').click()
            page.wait_for_timeout(120)
        assert page.locator('#verdict').is_visible(), 'Veredito final não apareceu'
        assert page.locator('#transcript .entry').count()==25
        assert page.locator('#judge-messages .judge-note').count()==5
        assert page.locator('#score-a').inner_text()=='43'
        assert page.locator('#score-b').inner_text()=='42'
        assert not errors,errors
        page.screenshot(path=str(OUT/f'{label}-final.png'),full_page=True)
        page.locator('#offline-replay').click()
        page.wait_for_function("document.querySelector('#offline-position').textContent.includes('01 /')")
        print(label,'PASS', 'errors:',errors,'overflow:',page.evaluate('document.documentElement.scrollWidth-document.documentElement.clientWidth'))
        page.close()
    b.close()
