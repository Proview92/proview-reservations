import json,datetime,sys
from collections import Counter
from lib import *
gen=open('/home/claude/stress/gen.js').read()
DAY='2026-11-14'
with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1180,'height':820})
    pg.errs=[];pg.on('pageerror',lambda e:pg.errs.append(str(e)))
    pg.clock.install(time=datetime.datetime(2026,11,14,10,0,0))
    pg.goto('file:///mnt/user-data/outputs/proview-bookings.html');pg.add_style_tag(content='[role=alert]{display:none!important}')
    st=open('/home/claude/stress/state1.json').read();pg.evaluate("s=>localStorage.setItem(KEY,s)",st);pg.reload();pg.add_style_tag(content='[role=alert]{display:none!important}');pg.wait_for_timeout(300)
    pg.add_script_tag(content=gen)
    # busy Saturday: add 50 extra bookings 17:00-20:45 on DAY through the real form
    pg.evaluate("""day=>{window.LOG=[];const o=toast;window.toast=function(t){LOG.push(t);o(t)};window.toast.t=0;
      let s=7;const R=()=>{s=(s*16807)%2147483647;return s/2147483647};
      for(let i=0;i<50;i++){const size=[2,2,2,3,4,4,5,6,8][Math.floor(R()*9)],h=17+Math.floor(R()*4),mm=[0,15,30,45][Math.floor(R()*4)];
        openBK(null,{});$('#f-name').value='Rush '+i;$('#f-phone').value='07700 8'+String(10000+i);$('#f-size').value=size;$('#f-date').value=day;$('#f-time').value=String(h).padStart(2,'0')+':'+String(mm).padStart(2,'0');$('#f-dur').value=durFor(size);$('#f-table').value='';A.save({dataset:{id:''}})}
      return LOG.slice()}""",DAY)
    extra=pg.evaluate("LOG.filter(t=>t!=='Booking saved')");print('extra-load toasts:',Counter(extra).most_common())
    print('Sat bookings',pg.evaluate("S.parties.filter(p=>p.date===%r&&p.status!=='cancelled').length"%DAY),'no table',pg.evaluate("S.parties.filter(p=>p.date===%r&&p.status==='booked'&&!p.table).length"%DAY))
    pg.evaluate("LOG.length=0")
    # plan outcomes
    pg.evaluate("""day=>{let s=99;const R=()=>{s=(s*16807)%2147483647;return s/2147483647};window.PLAN={};
      S.parties.filter(p=>p.date===day).forEach(p=>{const r=R();p.__o=r<.08?'noshow':r<.16?'cancel':'attend';PLAN[p.id]={o:p.__o,off:Math.round(-5+R()*30),stay:Math.round(p.dur*(.7+R()*.6)),cancelAt:Math.round(R()*600+660)}})}""",DAY)
    ev=[];dbl=[];seatnotable=[]
    clock0=datetime.datetime(2026,11,14,10,0,0)
    for step in range(0,15*12+1):   # 10:00 -> 01:00 next day, 5 min ticks
        pg.evaluate("""day=>{const now=nowMin()+((new Date().getDate()!==+day.slice(8))?1440:0);const P=S.parties.filter(p=>p.date===day);
          P.forEach(p=>{const pl=PLAN[p.id];if(!pl)return;const tm=m(p.time);
            if(p.status==='booked'){
              if(pl.o==='cancel'&&now>=pl.cancelAt){A.cancel({dataset:{id:p.id}});return}
              if(pl.o==='noshow'&&now>=tm+45){A.noshow({dataset:{id:p.id}});return}
              if(pl.o==='attend'&&now>=tm+pl.off){if(!p.arr)A.arrive({dataset:{id:p.id}});const before=LOG.length;A.seat({dataset:{id:p.id}});if(find({dataset:{id:p.id}}).status!=='seated')pl.stuck=(pl.stuck||0)+1}
            }else if(p.status==='seated'&&p.__seatedAt==null){p.__seatedAt=now}
            if(p.status==='seated'){if(p.__seatedAt==null)p.__seatedAt=now;if(now>=p.__seatedAt+pl.stay)A.done({dataset:{id:p.id}})}
          })}""",DAY)
        # invariants
        r=pg.evaluate("""day=>{const se=S.parties.filter(p=>p.date===day&&p.status==='seated'),out=[];
          for(let i=0;i<se.length;i++)for(let j=i+1;j<se.length;j++){const a=[se[i].table,...(se[i].join||[])],c=[se[j].table,...(se[j].join||[])];if(a.some(x=>x&&c.includes(x)))out.push(se[i].name+' & '+se[j].name+' share a table')}
          const nt=se.filter(p=>!p.table).map(p=>p.name);return {out,nt,n:se.length}}""",DAY)
        for o in r['out']:
            if o not in dbl:dbl.append(o);ev.append((step,'DOUBLE-SEATED',o))
        pg.clock.run_for(5*60*1000)
    print('events',ev[:10]);print('double seats',len(dbl))
    fin=pg.evaluate("""day=>{const P=S.parties.filter(p=>p.date===day);return {byStatus:P.reduce((a,p)=>(a[p.status]=(a[p.status]||0)+1,a),{}),plan:Object.values(PLAN).reduce((a,x)=>(a[x.o]=(a[x.o]||0)+1,a),{}),stuck:Object.entries(PLAN).filter(([k,v])=>v.stuck&&v.o==='attend').length,still:P.filter(p=>p.status==='seated'||p.status==='booked').map(p=>[p.name,p.status,p.time,p.size,p.table?'T':'-'])}}""",DAY)
    print(json.dumps(fin)[:1500])
    print('toasts:',Counter(pg.evaluate("LOG")).most_common(12))
    print('page errors',pg.errs[:5])
    pg.evaluate("U.date='%s'"%DAY)
    b.close()
