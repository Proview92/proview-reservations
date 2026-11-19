import json
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(); pg.goto('file:///home/claude/proview-reservations/app.src.html'); pg.wait_for_timeout(1500)
    out=pg.evaluate("""()=>{
      let z=12345;const r=()=>(z=(z*1664525+1013904223)>>>0)/4294967296,pk=a=>a[Math.floor(r()*a.length)];
      const cases=[];
      for(let round=0;round<40;round++){
        S=seed();fixLay&&fixLay();addDemoTables();addDemoBookings();
        // more load, joined and split tables, special days, per-day hours
        const T=S.tables; if(T.length>3){S.combos=[{id:'c1',ids:[T[0].id,T[1].id]},{id:'c2',ids:[T[2].id,T[3].id],max:pk([0,9])}]}
        if(round%3===0&&T.length>5)S.splits=[{id:'s1',tid:T[5].id,parts:[2,2,pk([2,3])],from:today(),to:addD(today(),pk([0,2,10]))}];
        wk().forEach((h,i)=>{h.x=r()<.12;h.o=pk(['09:00','11:30','12:00','17:00']);h.c=pk(['21:00','22:00','23:00','23:30'])});
        S.venue.exc=[{d:addD(today(),2),x:r()<.5,o:'13:00',c:'20:00',n:'Private hire'},{d:addD(today(),5),x:false,o:'10:00',c:'16:00'}];
        S.venue.over=pk([null,'',0,1,2]);S.venue.dur=pk([60,90,105]);S.venue.bigFrom=pk([5,6,8]);S.venue.bigDur=pk([0,120,150]);
        for(let i=0;i<pk([0,20,60,140]);i++){const d=addD(today(),Math.floor(r()*8)),sz=pk([1,2,2,3,4,4,5,6,8]),tm=hm(pk([12,12.5,13,13.5,18,18.5,19,19.25,19.5,20,20.5,21])*60),t=pk(T);
          S.parties.push({id:uid(),name:'F'+i,phone:'',size:sz,date:d,time:tm,dur:durFor(sz),table:r()<.9?t.id:'',status:pk(['booked','booked','booked','seated','done','cancelled','noshow']),notes:'',tags:[]})}
        S.venue.ob={on:true,step:pk([15,30,60]),maxParty:pk([4,8,12]),notice:pk([0,1,2,6]),ahead:pk([3,14,60]),lastBefore:pk([0,30,60,90]),cap:pk([0,0,6,12]),hold:pk([0,0,1,3]),confirm:'auto',rooms:r()<.3?[roomList()[0]]:null};
        const res=[];for(let k=0;k<14;k++){const d=addD(today(),pk([-1,0,0,1,2,3,5,6,7,20,70])),n=pk([0,1,2,2,3,4,5,6,7,8,9,10,12,14]);const a=availSlots(d,n);res.push({d,n,why:a.why,slots:a.slots})}
        cases.push({S:JSON.parse(JSON.stringify(S)),today:today(),nowMin:nowMin(),res})
      }
      return cases}""")
    json.dump(out,open('/home/claude/work/bk/cases.json','w')); print(len(out)); b.close()
