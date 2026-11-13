import json
from playwright.sync_api import sync_playwright
def open_page(p,w=1180,h=820,state='/home/claude/stress/state1.json',theme='light'):
    b=p.chromium.launch();pg=b.new_page(viewport={'width':w,'height':h},color_scheme=theme)
    pg.errs=[];pg.on('pageerror',lambda e:pg.errs.append(str(e)))
    pg.cons=[];pg.on('console',lambda m:pg.cons.append(m.text) if m.type=='error' and 'ERR_TUNNEL' not in m.text and 'vibrate' not in m.text else None)
    pg.goto('file:///mnt/user-data/outputs/proview-bookings.html');pg.add_style_tag(content='[role=alert]{display:none!important}')
    if state:
        st=open(state).read();pg.evaluate("s=>localStorage.setItem(KEY,s)",st);pg.reload();pg.add_style_tag(content='[role=alert]{display:none!important}')
    pg.wait_for_timeout(500);return b,pg
