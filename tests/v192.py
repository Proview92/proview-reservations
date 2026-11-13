import datetime,json
from playwright.sync_api import sync_playwright
ok=0;bad=[]
def T(c,m):
    global ok
    if c:ok+=1
    else:bad.append(m)
with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1180,'height':820});errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.clock.install(time=datetime.datetime(2026,11,10,12,0,0))
    pg.goto('file:///mnt/user-data/outputs/proview-bookings.html');pg.add_style_tag(content='[role=alert]{display:none!important}');pg.wait_for_timeout(300)
    pg.evaluate("""()=>{S.parties=S.parties.filter(p=>false);const L=LOY();L.n=3;
      const mk=(n,ph,em,date,leftDaysAgo)=>S.parties.push({id:uid(),name:n,phone:ph,email:em,size:2,date,time:'19:00',dur:90,table:'',join:[],status:'done',left:Date.now()-leftDaysAgo*864e5,notes:'',tags:[],src:'Phone'});
      mk('Ann Due','07700900001','ann@x.com','2026-11-01',9);mk('Ann Due','07700900001','ann@x.com','2026-11-09',1);   // 2 visits, last yesterday -> ready today
      mk('Bob Wait','07700900002','bob@x.com','2026-11-02',8);mk('Bob Wait','07700900002','bob@x.com','2026-11-10',0);  // last today -> sends tomorrow
      mk('Cy NoMail','07700900003','','2026-11-02',8);mk('Cy NoMail','07700900003','','2026-11-08',2);
      mk('Dee One','07700900004','d@x.com','2026-11-08',2);save();U.mgr=true;U.mgrT=Date.now();U.view='guests';U.gtab='loy';render()}""")
    r=pg.evaluate("""()=>({q:ProviewEmail.queue().map(x=>[x.key,x.sendOn,x.subject]),all:ProviewEmail.all().map(x=>[x.key,x.sendOn]),on:[LOY().auto,LOY().delay],ann:loyMsg('07700900001'),bulk:loyMsg('07700900001',true),sj:loySubj('07700900001')})""")
    print(json.dumps(r,indent=1)[:1500])
    T(len(r['q'])==1 and r['q'][0][0]=='07700900001','ready queue should be Ann only')
    T(len(r['all'])==2 and any(x[1]=='2026-11-11' for x in r['all']),'Bob should be scheduled 11 Nov')
    T('3rd visit' in r['ann'] and 'Ann' in r['ann'],'message fill')
    T('next visit' in r['bulk'] and 'there' in r['bulk'],'bulk fill')
    # UI
    pg.evaluate("U.view='guests';U.gtab='loy';render()")
    html=pg.evaluate("document.querySelector('#main').innerText")
    print([l for l in html.split('\n') if 'Ready' in l or 'Sends' in l or 'Discount invites' in l or 'ready to send' in l][:8])
    T('Ready to send' in html and 'Sends' in html,'ui chips')
    # find loyalty tab
    print('tab html has Time the invite:', 'Time the invite' in html)
    # settings edits
    pg.fill('[data-lo=delay]','2');pg.fill('[data-lo=msg]','Hello {name}! {nth} visit {pct}% at {venue}');pg.wait_for_timeout(100)
    r=pg.evaluate("[LOY().delay,LOY().msg,document.querySelector('#lo-prev').textContent,ProviewEmail.all().map(x=>[x.key,x.sendOn])]");print(r)
    T(r[0]==2 and r[3][0][1] in('2026-11-11','2026-11-12'),'delay edit')
    pg.click('[data-lo=auto]');pg.wait_for_timeout(100)
    r=pg.evaluate("[LOY().auto,ProviewEmail.queue().length]");print('auto off',r);T(r[0]==False and r[1]==2,'auto off sends at once')
    pg.click('[data-act=loyrst]');pg.wait_for_timeout(100);T(pg.evaluate("LOY().msg===undefined"),'reset')
    # reload persistence
    pg.reload();pg.wait_for_timeout(300);print('persist',pg.evaluate("[LOY().auto,LOY().delay]"))
    # bulk button
    pg.evaluate("U.mgr=true;U.mgrT=Date.now();U.view='guests';U.gtab='loy';render()")
    print('errs',errs);T(not errs,'page errors');b.close()
print('PASSED',ok,'FAILED',bad)
