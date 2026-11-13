import sys,json,datetime,collections
sys.path.insert(0,'/home/claude/stress')
from playwright.sync_api import sync_playwright
import os
OFF=int(os.environ.get("OFF","1000"))
N=int(sys.argv[1]) if len(sys.argv)>1 else 500
OUT=sys.argv[2] if len(sys.argv)>2 else '/home/claude/stress/fuzz_out.json'
js=open('/home/claude/stress/fuzz.js').read()
THEMES=['normal flow','partial arrival','partial seating','seat part from booked','partial then noshow/cancel','special occasions + dessert','late / overdue','noshow + reopen','cancel + rebook','walk-ins','all tables full','big party joined tables','manual split override','live split now','move table','edit size/time/stay','unseat/left/done sequences','invalid input','opening hours','duplicate guest','odd names / injection','random monkey','past midnight','waitlist','other-day bookings']
res=[]
with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1180,'height':820})
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.clock.install(time=datetime.datetime(2026,11,14,18,0,0))
    pg.goto('file:///mnt/user-data/outputs/proview-bookings.html');pg.add_style_tag(content='[role=alert]{display:none!important}')
    st=open('/home/claude/stress/state1.json').read();pg.evaluate("s=>localStorage.setItem(KEY,s)",st);pg.reload();pg.add_style_tag(content='[role=alert]{display:none!important}');pg.wait_for_timeout(400)
    pg.add_script_tag(content=js)
    for i in range(N):
        th=i%25
        hour=[18,12,21,18,15][ (i//25)%5 ]; mn=[0,30,15,45][(i//5)%4]
        if th==22: hour,mn=23,30
        pg.clock.set_fixed_time(datetime.datetime(2026,11,14,hour,mn,0))
        e0=len(errs)
        try:
            r=pg.evaluate("([t,s])=>RUN(t,s)",[th,OFF+i*7])
        except Exception as ex:
            r={'viol':['PLAYWRIGHT '+str(ex)[:200]],'info':[],'n':0}
        r['th']=th;r['i']=i;r['time']='%02d:%02d'%(hour,mn)
        if len(errs)>e0: r['viol'].append('PAGEERROR '+errs[-1])
        res.append(r)
    b.close()
json.dump(res,open(OUT,'w'))
tot=sum(1 for r in res if r['viol']);print('scenarios',len(res),'with violations',tot)
by=collections.defaultdict(lambda:[0,0])
for r in res:
    by[r['th']][0]+=1;by[r['th']][1]+=1 if r['viol'] else 0
for t in sorted(by):print(t,THEMES[t],by[t])
c=collections.Counter()
for r in res:
    for v in r['viol']:c[v.split('  ctx=')[0][:110]]+=1
print('--- distinct violations');
for k,v in c.most_common(40):print(v,k)
ci=collections.Counter()
for r in res:
    for v in r['info']:ci[v[:80]]+=1
print('--- info');
for k,v in ci.most_common(15):print(v,k)
