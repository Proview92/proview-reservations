(()=>{
const B=id=>({dataset:{id}}),BT=(id,tid)=>({dataset:{id,tid}});
let seed=1;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647};
const ri=(a,b)=>a+Math.floor(rnd()*(b-a+1)),pk=a=>a[Math.floor(rnd()*a.length)];
window.TOASTS=[];window.ERRS=[];window.ASKS=[];window.ASKFN=null;window.LOGF=[];
const ot=window.toast;window.toast=function(t){TOASTS.push(String(t));try{ot(t)}catch(e){ERRS.push('toast:'+e.message)}};
window.ask=function(m,l,fn){ASKS.push(String(m));ASKFN=fn};
const BASE=JSON.stringify(S.tables),BASEHRS=JSON.stringify(S.venue.hrs);
let N=0,VIOL=[],INFO=[];
const hmm=(h,mi)=>String(h).padStart(2,'0')+':'+String(mi).padStart(2,'0');
const TM=()=>{const n=nowMin();return n};
function reset(){S.parties=[];S.waiting=[];S.splits=[];S.ts={};S.audit=[];S.tables=JSON.parse(BASE);S.venue.hrs=JSON.parse(BASEHRS);try{closeM()}catch(e){}U.cnt=null;U.spm=null;U.date=today();U.view='bookings';TOASTS.length=0;ASKS.length=0;ASKFN=null;LOGF.length=0;ERRS.length=0;VIOL=[];INFO=[];N=0}
function vi(msg){VIOL.push(msg+'  ctx='+LOGF.slice(-5).join(' > '))}
function info(msg){INFO.push(msg)}
function INV(){
 const P=S.parties,seat=P.filter(p=>p.status==='seated');
 const ids=new Set();P.forEach(p=>{if(ids.has(p.id))vi('duplicate id '+p.id);ids.add(p.id)});
 for(let i=0;i<seat.length;i++)for(let j=i+1;j<seat.length;j++){const a=seat[i],c=seat[j];if(a.date!==c.date)continue;
  const A1=ptabs(a),C1=ptabs(c);if(A1.some(x=>x&&C1.includes(x))&&(a.part==null||c.part==null||a.part===c.part))vi('DOUBLE-SEATED '+a.name+' & '+c.name+' on '+a.table)}
 P.forEach(p=>{
  if(!['booked','seated','done','cancelled','noshow'].includes(p.status))vi('bad status '+p.status+' '+p.name);
  if(!Number.isInteger(p.size)||p.size<1||p.size>99)vi('bad size '+p.size+' '+p.name);
  if(!(p.dur>=15&&p.dur<=480))vi('bad dur '+p.dur+' '+p.name);
  if(!/^\d\d:\d\d$/.test(p.time))vi('bad time '+p.time);
  if(!/^\d{4}-\d\d-\d\d$/.test(p.date))vi('bad date '+p.date);
  if(p.status==='seated'&&!p.table)vi('seated without table '+p.name);
  if(p.seatN!=null&&!(p.status==='seated'&&p.seatN>=1&&p.seatN<p.size))vi('bad seatN '+p.seatN+'/'+p.size+' status '+p.status+' '+p.name);
  if(p.arrN!=null&&!(p.arrN>=1&&p.arrN<p.size))vi('bad arrN '+p.arrN+'/'+p.size+' '+p.name);
  if(p.arrN!=null&&p.status!=='booked')info('stale arrN on '+p.status);
  if(p.status==='seated'&&p.table){const ts=ptabs(p);ts.forEach(id=>{if(!TB(id))vi('seated on missing table '+id)});
   const cap=ts.reduce((a,id)=>{const t=TB(id);return a+(t?(p.part!=null?((splitOf(id,p.date)||{parts:[]}).parts[p.part]||0):Math.max(t.seats,tmax(t))):0)},0);if(p.size>cap)info('over capacity '+p.size+'>'+cap)}
  ['name','phone','notes'].forEach(k=>{if(p[k]!=null&&/NaN|undefined/.test(String(p[k])))vi('bad field '+k+'='+p[k])});
 });
 if(ERRS.length)vi('ERR '+ERRS[ERRS.length-1])
}
function op(label,fn){LOGF.push(label);try{const r=fn();INV();return r}catch(e){vi('EXCEPTION in '+label+': '+e.message);return null}}
function pend(){if(ASKFN&&rnd()<.6){const f=ASKFN;ASKFN=null;op('ask-yes',()=>{f();try{closeM()}catch(e){}})}else if(ASKFN){ASKFN=null;try{closeM()}catch(e){}}}
function mk(o){
 return op('mk '+(o.label||o.size+'@'+o.time),()=>{
  const name=o.name||('G'+(++N));
  openBK(null,{});
  const set=(k,v)=>{const e=document.querySelector('#f-'+k);if(e&&v!=null)e.value=v};
  set('name',name);set('phone',o.phone==null?'07700 9'+String(10000+ri(0,89999)):o.phone);set('size',o.size);set('date',o.date||today());set('time',o.time);set('dur',o.dur||durFor(+o.size||2));set('table',o.table||'');set('occ',o.occ||'');set('dsrt',o.dsrt||'');set('notes',o.notes||'');
  const before=S.parties.length;
  A.save(B(''));
  let warned=false;if(document.getElementById('f-warn')&&S.parties.length===before){warned=true;if(!o.noforce)A.save(B(''))}
  const added=S.parties.length>before?S.parties[S.parties.length-1]:null;
  try{closeM()}catch(e){}
  if(added&&o.tags)added.tags=o.tags.slice();
  window.LASTWARN=warned;
  return added})}
const T=(h,m)=>hmm(h,m||0);
function arr(p){return op('arrive '+p.name,()=>A.arrive(B(p.id)))}
function seat(p){const r=op('seat '+p.name,()=>A.seat(B(p.id)));pend();return r}
function done(p){return op('done '+p.name,()=>A.done(B(p.id)))}
function cnt(p,k,n){return op('cnt '+k+' '+n+' '+p.name,()=>{U.cnt={id:p.id,n,max:p.size,k};A.cntok(B(p.id))})}
function wi(size,name,key){return op('walkin '+size,()=>{A.walkin(B(''));const s=document.querySelector('#wi-size');if(s){s.value=size;s.dispatchEvent(new Event('input',{bubbles:true}))}
 const nm=document.querySelector('#wi-name');if(nm)nm.value=name||'W'+(++N);if(key!=null){U.wiK=key}
 A.wiseat();pend();try{closeM()}catch(e){}})}
function anyTable(){return pk(S.tables).id}
function addBig(){const t={id:'big16',name:'T16',seats:16,area:'Main room',x:300,y:420};S.tables.push(t);return t}
function nowSlot(){const n=nowMin();return hmm(Math.floor(n/60)%24,Math.floor((n%60)/15)*15)}
function rt(lo,hi){const h=ri(lo,hi);return T(h,pk([0,15,30,45]))}
function views(){
 const bad=[];const chk=(tag)=>{const t=document.body.innerText;const m=t.match(/NaN|undefined|\[object Object\]|null(?![a-z])/);if(m)bad.push(tag+': '+m[0]+' near '+t.slice(Math.max(0,t.indexOf(m[0])-40),t.indexOf(m[0])+40).replace(/\n/g,' '))};
 for(const v of ['bookings','tables','floor','guests','reports','settings','online']){try{U.view=v;if(v==='reports'){for(const rt2 of ['day','outlook','history','activity']){U.rtab=rt2;render();chk(v+'/'+rt2)}}else{render();chk(v)}}catch(e){vi('RENDER '+v+': '+e.message)}}
 for(const fm of ['flow','line']){try{U.view='floor';if(typeof A.fmode==='function'){A.fmode({dataset:{v:fm}})}render();chk('floor/'+fm)}catch(e){vi('RENDER floor '+fm+': '+e.message)}}
 bad.forEach(b=>vi('TEXT '+b));U.view='bookings';U.rtab='day';render()
}
const TH={};
TH[0]=()=>{const n=ri(2,5);for(let i=0;i<n;i++){const p=mk({size:ri(1,6),time:rt(12,21)});if(!p)continue;arr(p);if(rnd()<.8)seat(p);if(rnd()<.5&&p.status==='seated')done(p)}};
TH[1]=()=>{const p=mk({size:ri(3,12),time:nowSlot()});if(!p)return;cnt(p,'arr',ri(1,p.size-1));if(p.arrN==null)vi('partarr not recorded');if(rnd()<.5)cnt(p,'arr',ri(1,p.size-1));if(rnd()<.3)op('unarrive',()=>A.unarrive(B(p.id)));if(rnd()<.7){arr(p);seat(p)}else cnt(p,'arr',p.size)};
TH[2]=()=>{const p=mk({size:ri(3,10),time:nowSlot()});if(!p)return;arr(p);seat(p);if(p.status!=='seated')return;cnt(p,'seat',ri(1,p.size-1));if(p.seatN==null)vi('partseat not recorded');if(rnd()<.5)cnt(p,'seat',ri(1,p.size-1));op('allseat',()=>A.allseat(B(p.id)));if(p.seatN!=null)vi('allseat left seatN');if(rnd()<.5)done(p)};
TH[3]=()=>{const p=mk({size:ri(4,12),time:nowSlot()});if(!p)return;const k=ri(1,p.size-1);cnt(p,'seat',k);if(p.status==='seated'&&p.seatN!==k)vi('seat-part from booked: seatN '+p.seatN+' want '+k);if(p.status==='seated'){op('allseat',()=>A.allseat(B(p.id)));done(p)}};
TH[4]=()=>{const p=mk({size:ri(3,9),time:nowSlot()});if(!p)return;cnt(p,'arr',ri(1,p.size-1));const k=pk(['noshow','cancel','del','reopen']);if(k==='reopen'){op('noshow',()=>A.noshow(B(p.id)));op('reopen',()=>A.reopen(B(p.id)))}else op(k,()=>A[k](B(p.id)));if(p.status==='cancelled'&&p.arrN!=null)info('arrN kept on cancelled');pend()};
TH[5]=()=>{const n=ri(2,5);for(let i=0;i<n;i++){const occ=pk(OCC),p=mk({size:ri(2,8),time:rt(17,20),occ,dsrt:rnd()<.5?pk(['Tiramisu','Chocolate fondant','Candle on a cake','Yes','']):'',notes:rnd()<.3?'Surprise':''});if(!p)continue;if(p.occ!==occ)vi('occ not saved');arr(p);seat(p);
  if(p.status==='seated'){const t=TB(p.table);let m1;try{m1=tmarks(t)}catch(e){vi('tmarks threw '+e.message)}if(!S.thide&&(!m1||!String(JSON.stringify(m1)).length||JSON.stringify(m1)==='[]'))vi('no table mark for occasion '+p.name);}
  try{const c=occCard(today());if(c&&!String(c).includes(p.name.replace(/&/g,'&amp;'))&&p.status!=='cancelled')info('occCard lacks '+p.name)}catch(e){vi('occCard threw '+e.message)}
  try{const sd=sheetData(today());if(!JSON.stringify(sd).includes(p.name))vi('sheet lacks '+p.name)}catch(e){vi('sheetData threw '+e.message)}
  if(rnd()<.3)done(p)}};
TH[6]=()=>{const p=mk({size:ri(2,6),time:T(Math.max(9,Math.floor(nowMin()/60)-2),0),dur:60});if(!p)return;if(rnd()<.6)op('late',()=>A.latepick({dataset:{id:p.id,v:pk([10,15,20,30,45])}}));op('pastDue?',()=>{if(!pastDue(p))info('not pastDue')});seat(p);if(p.status==='seated'&&p.time!==hm(nowMin()))info('late seat time '+p.time+' vs '+hm(nowMin()));if(rnd()<.5)done(p)};
TH[7]=()=>{const p=mk({size:ri(2,6),time:nowSlot()});if(!p)return;op('noshow',()=>A.noshow(B(p.id)));if(rnd()<.7){op('reopen',()=>A.reopen(B(p.id)));if(p.status!=='booked')vi('reopen -> '+p.status);arr(p);seat(p)}};
TH[8]=()=>{const nm='Dup'+(++N),ph='07700 9'+(30000+ri(0,999));const p=mk({size:2,time:'19:00',name:nm,phone:ph});if(!p)return;op('cancel',()=>A.cancel(B(p.id)));const q=mk({size:2,time:'19:00',name:nm,phone:ph});if(!q)vi('rebook after cancel refused');op('reopen',()=>A.reopen(B(p.id)));pend();if(p.status==='booked'&&q&&q.status==='booked')info('same guest double booked after reopen')};
TH[9]=()=>{const n=ri(2,7);for(let i=0;i<n;i++){wi(ri(1,12),null,rnd()<.4?anyTable():null);}op('waitlist',()=>{A.wadd&&(document.querySelector('#w-name')||0)});};
TH[10]=()=>{S.tables.forEach(t=>{wi(Math.min(t.seats,ri(1,t.seats)),null,t.id)});const p=mk({size:2,time:nowSlot()});if(!p)return;arr(p);seat(p);if(p.status==='seated'&&S.parties.filter(q=>q.status==='seated'&&q.table===p.table&&q.id!==p.id).length)vi('seated onto occupied table')};
TH[11]=()=>{const p=mk({size:ri(7,14),time:nowSlot()});if(!p)return;arr(p);seat(p);if(p.status==='seated'&&ptabs(p).length<2&&p.size>8)info('big party on single table '+p.size);const q=mk({size:ri(2,4),time:nowSlot()});if(q){arr(q);seat(q)}};
TH[12]=()=>{const t=addBig();const today_=today();S.splits.push({id:'sp'+ri(1,999),tid:t.id,from:today_,to:today_,parts:pk([[4,4,4,2,2],[8,8],[4,4,4,4],[6,6,2,2]])});save();const sp=S.splits[0];const n=ri(4,9);for(let i=0;i<n;i++){const k=ri(0,sp.parts.length-1),size=ri(1,sp.parts[k]+1);const p=mk({size,time:nowSlot(),table:rnd()<.6?'s:'+t.id+':'+k:''});if(!p)continue;arr(p);seat(p);if(rnd()<.3&&p.status==='seated')done(p)}};
TH[13]=()=>{const t=addBig();const k=ri(2,9);wi(k,null,t.id);const p=S.parties.find(q=>q.status==='seated');op('splitnow',()=>A.splitnow(B(t.id)));if($('#modal')&&!$('#modal').hidden){op('spsave',()=>A.spsave(B('')))}pend();const q=mk({size:ri(1,4),time:nowSlot()});if(q){arr(q);seat(q)}if(rnd()<.5)op('merge',()=>A.spmerge&&A.spmerge(B(t.id)))};
TH[14]=()=>{const a=mk({size:2,time:nowSlot()}),b=mk({size:2,time:nowSlot()});if(!a||!b)return;arr(a);seat(a);arr(b);seat(b);if(a.status==='seated'&&b.status==='seated'){op('move a->b table',()=>A.allocto(BT(a.id,b.table)));pend();op('move a->free',()=>{const f=S.tables.find(t=>!S.parties.some(q=>q.status==='seated'&&ptabs(q).includes(t.id)));if(f)A.allocto(BT(a.id,f.id))})}};
TH[15]=()=>{const p=mk({size:ri(2,5),time:nowSlot()});if(!p)return;mk({size:ri(2,4),time:T(Math.min(21,Math.floor(nowMin()/60)+1),0)});const n=ri(3,8);for(let i=0;i<n;i++){const k=pk(['psz+','psz-','tshift+','tshift-','stshift+','stshift-']);op(k,()=>{if(k[0]==='p')A.psz({dataset:{id:p.id,v:k.endsWith('+')?1:-1}});else if(k[0]==='t')A.tshift({dataset:{id:p.id,v:k.endsWith('+')?15:-15}});else A.stshift({dataset:{id:p.id,v:k.endsWith('+')?15:-15}})});pend()}if(rnd()<.5){op('edit-save',()=>{openBK(p.id);document.querySelector('#f-size').value=ri(1,8);document.querySelector('#f-time').value=rt(12,21);A.save(B(p.id));if(document.getElementById('f-warn'))A.save(B(p.id));try{closeM()}catch(e){}})}};
TH[16]=()=>{const ps=[];for(let i=0;i<ri(3,6);i++){const p=mk({size:ri(1,6),time:nowSlot()});if(p)ps.push(p)}ps.forEach(p=>{arr(p);seat(p)});for(let i=0;i<8;i++){const p=pk(ps);const k=pk(['unseat','left','done','seat','reopen','unarrive']);op(k+' '+p.name,()=>{if(k==='left'||k==='unseat')A[k](B(p.id));else A[k](B(p.id))});pend()}};
TH[17]=()=>{const bad=[['size',0],['size',-3],['size',2.5],['size',100],['size',''],['dur',14],['dur',481],['dur',-1]];bad.forEach(([k,v])=>{const o={size:2,time:nowSlot(),noforce:true,label:k+'='+v};o[k]=v;const before=S.parties.length;const p=mk(o);if(p)vi('accepted invalid '+k+'='+v+' ('+p.size+'/'+p.dur+')')});
 [{size:1},{size:99},{size:2,dur:15},{size:2,dur:480}].forEach(o=>{const p=mk(Object.assign({time:nowSlot()},o));if(!p)info('refused valid '+JSON.stringify(o)+' toast '+TOASTS.slice(-1))});
 const p=mk({size:2,time:'',noforce:true});if(p)vi('accepted empty time');const q=mk({size:2,time:nowSlot(),name:' ',noforce:true});if(q)vi('accepted blank name');const r=mk({size:2,time:nowSlot(),phone:'abc',noforce:true});if(r)vi('accepted bad phone')};
TH[18]=()=>{[['08:00'],['08:59'],['22:00'],['22:30'],['23:45'],['00:30']].forEach(([t])=>{mk({size:ri(1,6),time:t,label:'hours '+t})});const d=addD(today(),1),dw=dowOf(d);S.venue.hrs[dw].x=true;const p=mk({size:2,time:'19:00',date:d,label:'closed day'});if(p&&!window.LASTWARN)vi('no closed-day warning');S.venue.hrs[dw].x=false};
TH[19]=()=>{const nm='Same'+(++N),ph='07700 9'+(50000+ri(0,999));const a=mk({size:2,time:'19:00',name:nm,phone:ph});const before=S.parties.length;const b=mk({size:2,time:'19:15',name:nm,phone:ph,noforce:true});if(b)vi('duplicate created without warning');if(!document.getElementById('f-warn')&&S.parties.length===before)info('dup refused w/o warn');try{closeM()}catch(e){}};
TH[20]=()=>{const names=['<img src=x onerror=window.PWN=1>','"><script>window.PWN=1<\/script>','Robert\'); DROP TABLE;--','😀 Zoë Ñandú','א ב ג עברית','A'.repeat(300),'<b>bold</b> & co','{{7*7}} ${1+1}'];names.forEach(n=>{const p=mk({size:2,time:nowSlot(),name:n,notes:n});if(p){arr(p);seat(p)}});views();if(window.PWN)vi('XSS executed');if(document.querySelector('#main img[src="x"],#main script'))vi('injected element in DOM')};
TH[21]=()=>{const ps=[];for(let i=0;i<12;i++){const p=mk({size:ri(1,8),time:rt(12,21),occ:rnd()<.2?pk(OCC):'',tags:rnd()<.2?['VIP']:rnd()<.2?['Allergy']:undefined});if(p)ps.push(p)}
 const acts=['arrive','seat','done','cancel','noshow','reopen','left','unseat','unarrive','psz+','psz-','tshift+','tshift-','late','partarr','partseat','allseat','del','conftog','allocto'];
 for(let i=0;i<70;i++){const p=pk(ps),k=pk(acts);op(k+' '+p.name+' '+p.status,()=>{if(!S.parties.includes(p))return;if(k==='psz+'||k==='psz-')A.psz({dataset:{id:p.id,v:k==='psz+'?1:-1}});else if(k==='tshift+'||k==='tshift-')A.tshift({dataset:{id:p.id,v:k==='tshift+'?15:-15}});else if(k==='late')A.latepick({dataset:{id:p.id,v:15}});else if(k==='partarr'||k==='partseat'){U.cnt={id:p.id,n:ri(1,Math.max(1,p.size)),max:p.size,k:k==='partarr'?'arr':'seat'};A.cntok(B(p.id))}else if(k==='allocto')A.allocto(BT(p.id,anyTable()));else if(A[k])A[k](B(p.id))});pend()}};
TH[22]=()=>{const a=mk({size:ri(2,6),time:'23:45',dur:120,label:'late-night'});const b=mk({size:2,time:'00:30',date:addD(today(),1),label:'after midnight'});[a,b].forEach(p=>{if(p){arr(p);seat(p);if(rnd()<.6)done(p)}});wi(ri(2,4),null,null)};
TH[23]=()=>{for(let i=0;i<ri(2,5);i++){op('waitadd',()=>{S.waiting.push({id:uid(),name:'WL'+(++N),size:ri(1,8),at:Date.now(),quote:ri(5,40)});save();render()})}
 S.tables.forEach(t=>{if(rnd()<.7)wi(Math.min(t.seats,ri(1,t.seats)),null,t.id)});const sea=S.parties.filter(p=>p.status==='seated');sea.slice(0,3).forEach(p=>done(p));S.waiting.slice().forEach(w=>{op('wseat '+w.name,()=>A.wseat({dataset:{id:w.id}}))});if(S.waiting.length&&rnd()<.5)op('wdel',()=>A.wdel({dataset:{id:S.waiting[0].id}}))};
TH[24]=()=>{const tm=addD(today(),1),yd=addD(today(),-1);const f=mk({size:3,time:'19:00',date:tm,label:'tomorrow'}),y=mk({size:3,time:'19:00',date:yd,label:'yesterday'});[f,y].forEach(p=>{if(p){arr(p);seat(p);if(p.status==='seated'&&p.date!==today())info('seated on '+p.date+' not today');if(rnd()<.5)done(p)}})};
window.RUN=function(th,sd){seed=sd;reset();try{TH[th]()}catch(e){vi('THEME EXCEPTION '+e.message)}try{views()}catch(e){vi('views EXCEPTION '+e.message)}INV();return{viol:VIOL.slice(),info:INFO.slice(),n:S.parties.length,toasts:TOASTS.length,log:LOGF.length}};
})();
