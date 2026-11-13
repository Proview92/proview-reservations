import datetime,json
from playwright.sync_api import sync_playwright
from lib import open_page
ok=0;bad=[]
def T(c,msg):
    global ok
    if c:ok+=1
    else:bad.append(msg)
with sync_playwright() as p:
    # 1 overstay
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1180,'height':820});errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.clock.install(time=datetime.datetime(2026,11,14,18,50,0))
    pg.goto('file:///mnt/user-data/outputs/proview-bookings.html');pg.add_style_tag(content='[role=alert]{display:none!important}')
    pg.evaluate("localStorage.removeItem(KEY)");pg.reload();pg.wait_for_timeout(300)
    pg.evaluate("""()=>{const d='2026-11-14';S.parties=[];const T=S.tables.find(t=>t.seats>=2);window.T1=T.id;
      const mk=(n,time,tb)=>{const o={id:uid(),name:n,phone:'0770000'+n.length,size:2,date:d,time,dur:90,table:tb,join:[],status:'booked',notes:'',tags:[],src:'Phone'};S.parties.push(o);return o};
      const A_=mk('GuestA','19:00',T.id);mk('GuestB','20:45',T.id);save();A.seat({dataset:{id:A_.id}})}""")
    pg.clock.run_for(115*60*1000)
    r=pg.evaluate("""()=>{const B_=S.parties.find(x=>x.name==='GuestB');A.seat({dataset:{id:B_.id}});const se=S.parties.filter(p=>p.status==='seated');return {B:B_.status,Btable:B_.table,sameTable:se.filter(p=>p.table===T1).length,n:se.length}}""")
    print('overstay',r);T(r['sameTable']==1,'still double seated on same table')
    # after A leaves B can seat
    r=pg.evaluate("""()=>{const A_=S.parties.find(x=>x.name==='GuestA'),B_=S.parties.find(x=>x.name==='GuestB');A.done({dataset:{id:A_.id}});B_.table=T1;A.seat({dataset:{id:B_.id}});return B_.status}""")
    T(r=='seated','B cannot seat after A leaves');b.close()
    # 2 phone variants + migration
    b,pg=open_page(p,state=None)
    r=pg.evaluate("""()=>{S.parties=[];const mk=(n,ph)=>S.parties.push({id:uid(),name:n,phone:ph,size:2,date:'2026-11-21',time:'19:00',dur:90,table:'',join:[],status:'done',left:1,notes:'',tags:[],src:'Phone'});
      ['07700 900123','07700900123','+44 7700 900123','+447700900123','07700-900-123','0044 7700 900123','+44 (0) 7700 900123'].forEach(x=>mk('Sam Lee',x));mk('Other','07700 900124');mk('NoPhone','');mk('Short','123');
      return [...new Set(S.parties.map(gkey))]}""")
    print('keys',r);T(len(r)==4,'phone variants not merged: %s'%r)
    # migration
    pg.evaluate("""()=>{S.parties=[];const mk=(n,ph)=>S.parties.push({id:uid(),name:n,phone:ph,size:2,date:'2026-11-21',time:'19:00',dur:90,table:'',join:[],status:'done',left:1,notes:'',tags:[],src:'Phone'});
      mk('Sam Lee','07700 900123');mk('Sam Lee','+447700900123');mk('Solo','');S.gnotes={'07700 900123':'likes window','+447700900123':'allergy nuts','solo':'vip'};S.mkoff={'+447700900123':true};S.loy.gifts={'07700 900123':[{id:'g1',pct:10}],'+447700900123':[{id:'g2',pct:10}]};delete S.keyv;save()}""")
    pg.reload();pg.wait_for_timeout(300)
    r=pg.evaluate("({g:S.gnotes,mk:S.mkoff,gf:S.loy.gifts,keyv:S.keyv})");print('migrated',r)
    T(r['g'].get('07700900123')=='likes window | allergy nuts' or r['g'].get('07700900123')=='allergy nuts | likes window','notes not merged')
    T(r['g'].get('solo')=='vip','solo note lost');T(r['mk'].get('07700900123') is True,'mkoff lost');T(len(r['gf'].get('07700900123',[]))==2,'gifts not merged');T(r['keyv']==2,'keyv')
    # 3/4 form checks
    FORM="""async c=>{window.LOGT=[];const o=toast;window.toast=function(t){LOGT.push(t);o(t)};const n0=S.parties.length;openBK(null,{});$('#f-name').value=c.name;$('#f-phone').value=c.phone;$('#f-size').value=c.size;$('#f-date').value=c.date;$('#f-time').value=c.time;$('#f-dur').value=c.dur||90;$('#f-table').value='';
      const press=()=>A.save({dataset:{id:''}});press();const w1=document.querySelector('#f-warn'),t1=w1?w1.innerText:'',added1=S.parties.length-n0;let added2=added1;if(w1){press();added2=S.parties.length-n0}
      return {toasts:LOGT.slice(),warn:t1,added1,added2}}"""
    def run(**c):
        d=dict(name='T',phone='07700900555',size='2',date='2026-11-20',time='19:00');d.update(c);r=pg.evaluate(FORM,d);pg.evaluate("document.querySelector('#modal').hidden=true;document.querySelector('#modal').innerHTML=''");return r
    pg.evaluate("S.parties=[];save()")
    r=run(size='2.5');T(r['added2']==0 and 'whole number' in ' '.join(r['toasts']),'2.5 allowed');print('2.5',r['toasts'])
    r=run(size='0');T(r['added2']==0,'0 allowed')
    r=run(size='100');T(r['added2']==0,'100 allowed')
    r=run(dur='600');T(r['added2']==0,'dur 600 allowed')
    r=run(phone='abc');T(r['added2']==0,'abc phone allowed');
    r=run(phone='123');T(r['added2']==0,'123 phone allowed')
    r=run(phone='+44 7700 900555');T(r['added1']==1 and not r['warn'],'good phone blocked/warned: %s'%r)
    r=run(date='2026-11-01');T(r['added1']==0 and r['added2']==1 and 'passed' in r['warn'],'past date: %s'%r);print('past',r['warn'])
    r=run(time='03:00',name='Night',phone='07700900556');T(r['added1']==0 and r['added2']==1 and 'outside opening' in r['warn'],'03:00: %s'%r);print('03:00',r['warn'])
    r=run(name='Dup',phone='07700900557');T(r['added1']==1,'first dup should save')
    r=run(name='Dup',phone='+44 7700 900557');T(r['added1']==0 and r['added2']==1 and 'already has a booking' in r['warn'],'dup: %s'%r);print('dup',r['warn'])
    r=run(name='Dup',phone='07700900557',time='22:00');print('later same day',r['warn'],r['added1'])
    print('errs',errs,pg.errs,pg.cons);b.close()
print('PASSED',ok,'FAILED',bad)
