"""把各主題的預覽畫面截成圖。用法：python3 scripts/preview/shoot.py <輸出資料夾> [主題...]
不需要開伺服器：用 Playwright 攔截 http://preview.local/ 的請求，直接從 SITE 資料夾讀檔（預設 /tmp/site，內含 app、lib、components、scripts 與 ink 的連結）。"""
import mimetypes
import sys, os
from playwright.sync_api import sync_playwright
SITE = os.environ.get('SITE', '/tmp/site')
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
themes = sys.argv[2:] or ['classic', 'xuan', 'modai', 'qingshan', 'zhuyin']
shots = [('entry', 1280, 760, 'entry'), ('play', 1280, 900, 'play'), ('lobby', 1280, 900, 'lobby'), ('dice', 1280, 760, 'dice_cs'), ('mobile', 390, 844, 'play')]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for t in themes:
        for name, w, h, view in shots:
            ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1 if name != 'mobile' else 2, reduced_motion='reduce')
            def serve(route):
                path = route.request.url.split('preview.local', 1)[1].split('?')[0]
                fp = os.path.join(SITE, path.lstrip('/'))
                if os.path.isfile(fp): route.fulfill(path=fp, content_type=mimetypes.guess_type(fp)[0] or 'text/plain')
                else: route.fulfill(status=404, body='')
            ctx.route('http://preview.local/**', serve)
            pg = ctx.new_page()
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
            pg.goto(f'http://preview.local/scripts/preview/preview.html?theme={t}&view={view.split("_")[0]}')
            pg.wait_for_selector('body[data-ready="1"]', timeout=20000)
            pg.wait_for_timeout(300)
            pg.screenshot(path=f'{out}/{t}_{name}.png', full_page=(name in ('play', 'lobby', 'mobile')))
            if errs: print(t, name, errs[:3])
            ctx.close()
    b.close()
print('ok')
