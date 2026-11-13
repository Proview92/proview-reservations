from lib import *
with sync_playwright() as p:
    for name,w,h in (('desk',1180,820),('ipadP',820,1180)):
        b,pg=open_page(p,w,h)
        pg.evaluate("U.view='floor';render()");pg.wait_for_timeout(500)
        pg.screenshot(path=f'/tmp/flow_{name}.png')
        print(name,pg.evaluate("(()=>{const bl=[...document.querySelectorAll('.fqb')].map(e=>{const r=e.getBoundingClientRect();return Math.round(r.width)+'x'+Math.round(r.height)});return [...new Set(bl)].join('|')+' n='+bl.length+' fpen visible:'+(document.querySelector('.fpen')?.offsetParent!==null)})()"))
        b.close()
