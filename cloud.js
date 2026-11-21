
/* ===================== Cloud mode (Supabase), set up the same way as Proview Bookings / Proview Team =====================
   cloud.json next to index.html holds { url, key } of the Supabase project. When it is there:
   1. people sign in with an email account (or "Sign in with Proview account"),
   2. pr_whoami says which businesses that login may open and whether each one is licensed,
   3. the data of the chosen business is shared between devices through the res-api function, as small patches.
   A Staff login never receives pay rates, labour and sales figures or the manager PIN. On a Staff device the manager
   PIN is checked on the server, which then sends those parts until the device locks again.
   Without cloud.json the app works as before: on this device only. */
const CL={cfg:null,sb:null,who:null,user:null,site:null,scr:"",err:"",note:"",email:"",busy:false,go:null,locked:null,kicked:false,base:true,tok:"",mem:null,memErr:""};
const RS={on:false,rev:0,snap:null,busy:false,dirty:false,err:false,pend:false,hold:false,t:null,lastRs:0};
const CL_SDK="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";
const CL_PORTAL="https://license.proviewcrm.co.uk",CL_PHONE="020 8935 5495",CL_APP="reservations";
const clGet=k=>{try{return localStorage.getItem(k)||""}catch(e){return ""}};
const clSet=(k,v)=>{try{if(v)localStorage.setItem(k,v);else localStorage.removeItem(k)}catch(e){}};
const clSS=(k,v)=>{try{if(v===undefined)return sessionStorage.getItem(k)||"";if(v)sessionStorage.setItem(k,v);else sessionStorage.removeItem(k)}catch(e){return ""}};
function clLoad(src){return new Promise((ok,no)=>{const s=document.createElement("script");s.src=src;s.onload=ok;s.onerror=no;document.head.appendChild(s)})}
async function clCfg(){try{const r=await fetch("cloud.json",{cache:"no-store"});if(!r.ok)return null;const j=await r.json();return j&&j.url&&j.key?j:null}catch(e){return null}}
function clErr(e){const m=String((e&&e.message)||e||"");if(/Invalid login/i.test(m))return "Wrong email or password.";if(/not confirmed/i.test(m))return "Please confirm your email first: open the link we emailed you.";if(/already registered/i.test(m))return "This email already has an account. Sign in instead.";if(/at least 6|password should/i.test(m))return "The password needs at least 6 characters.";if(/rate limit|too many/i.test(m))return "Too many tries. Please wait a few minutes.";if(/fetch|network/i.test(m))return "Cannot reach the server. Check the internet.";return m||"Something went wrong. Try again."}
function clLic(s){if(s.suspended)return "This business is paused.";if(!s.license_type)return "This business has no licence yet.";return s.license_type==="trial"?"The free trial has ended.":"The licence has ended."}
// A new business starts with the sample floor plan only: no sample bookings, guests, staff or history.
function blankState(name){const s=seed();s.parties=[];s.waiting=[];s.staff=[];s.punches=[];s.hist={};s.histSample=false;s.gnotes={};s.ts={};s.rotaSh=[];s.demoY=s.demoU=s.demoB=s.demoP=1;s.venue.name=name||"My venue";delete s.venue.id;return s}

/* ---------- sign-in screens ---------- */
function clRoot(){let r=document.getElementById("cl-root");if(!r){r=document.createElement("div");r.id="cl-root";document.body.appendChild(r)}return r}
function clHide(){const r=document.getElementById("cl-root");if(r)r.remove()}
const CL_EYE='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const CL_BRAND='<div class="pvs-brand"><span class="pvlogo" role="img" aria-label="Proview logo"></span><span class="pvword">PROVIEW<i>RESERVATIONS</i></span></div>';
const CL_ART='<div class="pvs-art">'+CL_BRAND+'<h2>Every table, every guest — one calm service.</h2><div class="pvs-mock" aria-hidden="true"><div class="hd"><b>Tonight · 42 covers</b><span>19:12</span></div><div class="rw"><b>19:00</b><em>Hughes · 4</em><span class="s">Seated</span></div><div class="rw"><b>19:30</b><em>Okafor · 2</em><span class="r">Booked</span></div><div class="rw"><b>19:45</b><em>Martin · 6</em><span class="r">Booked</span></div><div class="rw"><b>20:15</b><em>Walk-in · 3</em><span class="f">Waiting</span></div></div><div class="sub">Take reservations, run the waitlist and seat guests from your phone, iPad or till.</div></div>';
function clShow(){const r=clRoot(),m=CL.scr,em=esc(CL.email||"");
 if(m==="wait"){r.className="pvs-wait";r.innerHTML=`<div class="pvs-splash" role="status" aria-label="${esc(CL.note||"Loading Proview Reservations")}"></div>`;return}
 const msg=`<div>${CL.err?`<div class="notice bad">${esc(CL.err)}</div>`:""}${CL.note?`<div class="notice">${esc(CL.note)}</div>`:""}</div>`,dis=CL.busy?"disabled":"";
 const go=(act,t)=>`<button type="button" class="go" data-act="${act}" ${dis}>${t}</button>`,alt=(act,t,extra)=>`<button type="button" class="pv-sso" data-act="${act}" ${extra||""}>${t}</button>`,lnk=(act,t,extra)=>`<button type="button" data-act="${act}" ${extra||""}>${t}</button>`;
 const fEm=`<label class="af">Email<input id="clem" type="email" autocomplete="email" placeholder="you@company.com" value="${em}"></label>`;
 const fPw=(id,lab,ac,ph)=>`<label class="af">${lab}<div class="pw-wrap"><input id="${id}" type="password" autocomplete="${ac}" placeholder="${ph}"><button type="button" class="pw-eye" data-act="clEye" data-f="${id}" title="Show password" aria-label="Show password">${CL_EYE}</button></div></label>`;
 const portal=`<a class="go" href="${CL_PORTAL}" target="_blank" rel="noopener">Open the licence portal</a>`;
 const out=lnk("clOut","Sign out"),links=h=>`<div class="alinks">${h}</div>`;
 let b="",split=false,wide=false;
 if(m==="in"){split=true;b=`<h1>Sign in</h1><p class="muted">Manage your reservations, tables and guests.</p>${msg}${fEm}${fPw("clpw","Password","current-password","••••••••")}${go("clIn","Sign in")}${CL.cfg.sso?`<div class="or-line">or</div>${alt("clSso","Sign in with Proview account")}`:""}${links(lnk("clScr","Create an account",'data-s="up"')+lnk("clScr","Forgot password?",'data-s="reset"'))}`}
 else if(m==="up"){split=true;b=`<h1>Create your account</h1><p class="muted">Use the email address your manager added for you, or your own if you are setting up a new business. Choose a password of at least 6 characters.</p>${msg}${fEm}${fPw("clpw","Password","new-password","At least 6 characters")}${fPw("clpw2","Confirm password","new-password","Type it again")}${go("clUp","Create account")}${links(lnk("clScr","I already have an account",'data-s="in"'))}`}
 else if(m==="reset"){split=true;b=`<h1>Forgot password</h1><p class="muted">We will email you a link to choose a new one. Your password is the same on all Proview sites.</p>${msg}${fEm}${go("clReset","Send the link")}${links(lnk("clScr","Back to sign in",'data-s="in"'))}`}
 else if(m==="newpw")b=`<h1>Choose a new password</h1><p class="muted">At least 6 characters. Your password is the same on all Proview sites, so this changes it everywhere.</p>${msg}${fPw("clpw","New password","new-password","At least 6 characters")}${go("clNewPw","Save and continue")}`;
 else if(m==="setup")b=`<h1>Set up your business</h1><p class="muted">Signed in as ${esc(CL.who.email)}. This login is not part of a business yet.</p><p class="muted">Staff: ask your manager to add this email under Settings, Logins, then press Check again.</p>${msg}<label class="af">Business name<input id="clbn" type="text" maxlength="80" placeholder="e.g. Bella Pizza" autocomplete="organization"></label>${go("clMake","Create my business")}${links(lnk("clAgain","Check again")+out)}`;
 else if(m==="empty")b=`<h1>No businesses yet</h1><p class="muted">Add the first one in the licence portal (New business).</p>${msg}${portal}${links(lnk("clAgain","Check again")+out)}`;
 else if(m==="pick"){wide=true;const ss=CL.who.sites||[];b=`<h1>Which business?</h1><p class="muted">Signed in as ${esc(CL.who.email||"")}.</p>${msg}<div class="pvs-pick">${ss.map(s=>`<button type="button" data-act="clPick" data-id="${esc(s.id)}"><b>${esc(s.name)}</b><span>${esc(s.business&&s.business!==s.name?s.business+" · ":"")}${s.ok?esc(s.role||""):esc(clLic(s))}</span></button>`).join("")}</div>${links(out)}`}
 else if(m==="lock"){const s=CL.locked;b=`<h1>${esc(s.name)}</h1><div class="notice bad">${esc(clLic(s))}</div><p class="muted">${s.suspended?"Call Proview on "+CL_PHONE+".":"Buy or renew a licence in the licence portal, or call Proview on "+CL_PHONE+"."}</p>${s.suspended?"":portal}${links(lnk("clAgain","Check again")+((CL.who.sites||[]).length>1?lnk("clScr","Another business",'data-s="pick"'):"")+out)}`}
 else if(m==="fail")b=`<h1>Cannot connect</h1><p class="muted">${esc(CL.err||"Check the internet and try again.")}</p>${go("clReload","Try again").replace(" disabled","")}${CL.who?links(out):""}`;
 r.className="";
 r.innerHTML=`<div class="pvs-auth${split?"":" solo"}">${split?CL_ART:""}<div class="pvs-form"><form class="pvs-card${wide?" wide":""}" novalidate onsubmit="return false">${CL_BRAND}${b}</form></div></div>`;
 const f=$("#clem")&&!$("#clem").value?$("#clem"):($("#clpw")||$("#clbn")||$("#clem"));if(f)setTimeout(()=>{try{f.focus()}catch(e){}},50);
 r.querySelectorAll("input").forEach(i=>i.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();const k={in:"clIn",up:"clUp",reset:"clReset",newpw:"clNewPw",setup:"clMake"}[CL.scr];if(k)A[k]()}}))}
function clScreen(s,o){CL.scr=s;CL.err=(o&&o.err)||"";CL.note=(o&&o.note)||"";CL.busy=false;clShow()}
function clVals(){const e=$("#clem"),p=$("#clpw");if(e)CL.email=e.value.trim().toLowerCase();return{email:CL.email,pw:p?p.value:""}}
async function clTry(fn){if(CL.busy)return;CL.busy=true;CL.err="";try{await fn()}catch(e){CL.busy=false;CL.err=clErr(e);clShow()}}
Object.assign(A,{
 clScr:b=>{clVals();clScreen(b.dataset.s)},
 clEye:b=>{const i=document.getElementById(b.dataset.f);if(!i)return;const on=i.type==="password";i.type=on?"text":"password";b.classList.toggle("on",on);b.title=on?"Hide password":"Show password";b.setAttribute("aria-label",b.title)},
 clReload:()=>location.reload(),
 clIn:()=>clTry(async()=>{const v=clVals();if(!v.email||!v.pw)throw new Error("Enter your email and password.");const r=await CL.sb.auth.signInWithPassword({email:v.email,password:v.pw});if(r.error)throw r.error;await clAfter()}),
 clUp:()=>clTry(async()=>{const v=clVals();if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email))throw new Error("Enter a valid email address.");if(v.pw.length<6)throw new Error("The password needs at least 6 characters.");const p2=$("#clpw2");if(p2&&p2.value!==v.pw)throw new Error("The two passwords do not match.");
  const r=await CL.sb.auth.signUp({email:v.email,password:v.pw,options:{emailRedirectTo:location.origin+location.pathname}});if(r.error)throw r.error;
  if(r.data&&r.data.session){await clAfter();return}clScreen("in",{note:"Almost there: open the link we just emailed you, then sign in here."})}),
 clReset:()=>clTry(async()=>{const v=clVals();if(!v.email)throw new Error("Enter your email.");const r=await CL.sb.auth.resetPasswordForEmail(v.email,{redirectTo:location.origin+location.pathname});if(r.error)throw r.error;clScreen("in",{note:"If that email has an account, a link is on its way."})}),
 clNewPw:()=>clTry(async()=>{const p=($("#clpw")||{}).value||"";if(p.length<6)throw new Error("The password needs at least 6 characters.");const r=await CL.sb.auth.updateUser({password:p});if(r.error)throw r.error;await clAfter()}),
 clSso:()=>{location.href="https://dashboard.proviewcrm.co.uk/?app="+CL_APP+"&return="+encodeURIComponent(location.origin+location.pathname)},
 clOut:async()=>{try{await rsFlush()}catch(e){}try{await CL.sb.auth.signOut()}catch(e){}clSet("pr-site","");try{if(CLK)localStorage.removeItem(CLK)}catch(e){}location.reload()},
 clAgain:()=>clTry(clAfter),
 clMake:()=>clTry(async()=>{const n=(($("#clbn")||{}).value||"").trim();if(n.length<2)throw new Error("Enter your business name.");const r=await CL.sb.rpc("pr_create_my_business",{p_business:n});if(r.error)throw r.error;clSet("pr-site",r.data);await clAfter()}),
 clPick:b=>{const s=(CL.who.sites||[]).find(x=>x.id===b.dataset.id);if(s)clOpen(s)},
 clSwitch:async()=>{try{await rsFlush()}catch(e){}clSS("pr-pick","1");location.reload()}
});
async function clAfter(){clScreen("wait");
 const s=(await CL.sb.auth.getSession()).data.session;if(!s){clScreen("in");return}CL.user=s.user;
 const r=await CL.sb.rpc("pr_whoami");if(r.error||!r.data){clScreen("fail",{err:"Could not load your account. Try again."});return}
 CL.who=r.data;const sites=r.data.sites||[];
 if(!sites.length){clScreen(r.data.is_master?"empty":"setup");return}
 const open=clSS("pr-open"),pick=clSS("pr-pick");clSS("pr-pick","");
 const site=(open&&sites.find(x=>x.business_id===open))||sites.find(x=>x.id===clGet("pr-site"))||(sites.length===1?sites[0]:null);
 if(!site||(pick&&sites.length>1)){clScreen("pick");return}
 clOpen(site)}
function clOpen(s){if(!s.ok&&!CL.who.is_master){CL.locked=s;clScreen("lock");return}clSet("pr-site",s.id);CL.site=s;clScreen("wait");if(CL.go){const g=CL.go;CL.go=null;g(s)}}
// Something changed under us (signed out elsewhere, licence ended, removed from the business): start again cleanly.
function clKick(kind){if(CL.kicked)return;CL.kicked=true;RS.on=false;const fin=()=>setTimeout(()=>location.reload(),50);if(kind==="auth"){CL.sb.auth.signOut().catch(()=>{}).then(fin);return}fin()}
// Resolves with the business to open, once someone is signed in and that business is licensed.
async function cloudGate(cfg){CL.cfg=cfg;const rec=/[#&]type=recovery/.test(location.hash);clScreen("wait");
 try{if(!window.supabase)await clLoad(CL_SDK)}catch(e){clScreen("fail",{err:"Cannot reach the sign-in service. Check the internet."});return new Promise(()=>{})}
 CL.sb=window.supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true}});
 const gate=new Promise(res=>{CL.go=res});
 try{
  const pv=location.hash.match(/[#&]pv_sso=([^&]+)/);
  if(pv){history.replaceState(null,"",location.pathname+location.search);
   const r=await fetch(cfg.url+"/functions/v1/sso-login",{method:"POST",headers:{"content-type":"application/json",apikey:cfg.key},body:JSON.stringify({assertion:pv[1]})});const j=await r.json().catch(()=>({}));
   if(!r.ok||!j.token_hash){clScreen("in",{err:j.error||"Sign-in with your Proview account failed. Please try again."});return gate}
   clSS("pr-open",j.open||"");const cur=(await CL.sb.auth.getSession()).data.session;if(cur&&String(cur.user.email||"").toLowerCase()!==j.email)await CL.sb.auth.signOut();
   const v=await CL.sb.auth.verifyOtp({token_hash:j.token_hash,type:"magiclink"});if(v.error){clScreen("in",{err:clErr(v.error)});return gate}}
  const s=(await CL.sb.auth.getSession()).data.session;
  if(rec&&s){clScreen("newpw");return gate}
  if(!s){clScreen("in");return gate}
  await clAfter()
 }catch(e){clScreen("fail",{err:clErr(e)})}
 return gate}

/* ---------- shared data: small patches to and from the server ---------- */
const rsIsObj=v=>!!v&&typeof v==="object"&&!Array.isArray(v);
const rsIdArr=v=>Array.isArray(v)&&v.every(x=>rsIsObj(x)&&x.id!=null);
function rsOne(v){if(rsIdArr(v)){const m={};v.forEach(x=>{m[x.id]=JSON.stringify(x)});return{t:"a",m}}
 if(rsIsObj(v)){const m={};Object.keys(v).forEach(s=>{const j=JSON.stringify(v[s]);if(j!==undefined)m[s]=j});return{t:"o",m}}
 return{t:"v",j:JSON.stringify(v)}}
function rsSnap(st){const o={};Object.keys(st).forEach(k=>{if(st[k]!==undefined)o[k]=rsOne(st[k])});return o}
function rsDiff(){const ops=[],snap=RS.snap||{};
 Object.keys(S).forEach(k=>{const v=S[k];if(v===undefined)return;const cur=rsOne(v),old=snap[k];
  if(!old||old.t!==cur.t){ops.push({k,set:v});return}
  if(cur.t==="a"){const up=[];v.forEach(x=>{if(old.m[x.id]!==cur.m[x.id])up.push(x)});const del=Object.keys(old.m).filter(id=>!(id in cur.m));if(up.length||del.length)ops.push({k,up,del})}
  else if(cur.t==="o"){const mp={};let n=0;Object.keys(cur.m).forEach(s=>{if(old.m[s]!==cur.m[s]){mp[s]=v[s];n++}});const md=Object.keys(old.m).filter(s=>!(s in cur.m));if(n||md.length)ops.push({k,mp,md})}
  else if(old.j!==cur.j)ops.push({k,set:v})});
 Object.keys(snap).forEach(k=>{if(!(k in S)||S[k]===undefined)ops.push({k,unset:true})});return ops}
function rsApply(ops,st,snap){ops.forEach(o=>{const k=o.k;if(o.unset){delete st[k];if(snap)delete snap[k];return}
 if("set" in o){st[k]=o.set;if(snap)snap[k]=rsOne(o.set);return}
 if(o.mp||o.md){if(!rsIsObj(st[k]))st[k]={};Object.keys(o.mp||{}).forEach(s=>{st[k][s]=o.mp[s]});(o.md||[]).forEach(s=>{delete st[k][s]});if(snap)snap[k]=rsOne(st[k]);return}
 let arr=st[k];if(!Array.isArray(arr))arr=st[k]=[];
 (o.up||[]).forEach(x=>{const i=arr.findIndex(y=>y&&y.id===x.id);if(i>=0)arr[i]=x;else arr.push(x)});
 (o.del||[]).forEach(id=>{const i=arr.findIndex(y=>y&&String(y.id)===String(id));if(i>=0)arr.splice(i,1)});
 if(snap)snap[k]=rsOne(arr)})}
const rsUrl=p=>CL.cfg.url+"/functions/v1/res-api/"+p;
async function rsHdr(){const h={"content-type":"application/json"};const ss=(await CL.sb.auth.getSession()).data.session;if(!ss){clKick("auth");throw new Error("auth")}h.apikey=CL.cfg.key;h.authorization="Bearer "+ss.access_token;h["x-site"]=CL.site.id;if(CL.tok)h["x-token"]=CL.tok;return h}
async function rsFetch(path,opt,ms){const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),ms||20000);
 try{const r=await fetch(rsUrl(path),{...(opt||{}),headers:await rsHdr(),signal:ctl.signal,cache:"no-store"});
  if(r.status===401){clKick("auth");throw new Error("auth")}
  if(r.status===402){clKick("licence");throw new Error("licence")}
  if(r.status===403){let bj={};try{bj=await r.clone().json()}catch(e){}if(bj.error==="site"){clSet("pr-site","");clKick("site");throw new Error("site")}}
  if(!r.ok){const er=new Error("http "+r.status);er.status=r.status;try{er.body=await r.json()}catch(e){}throw er}
  return await r.json()}finally{clearTimeout(t)}}
// take a full copy from the server and run it through the app's own load() (which tidies older data)
function rsAdopt(state,rev){RS.hold=true;try{try{localStorage.setItem(SKEY(),JSON.stringify(state))}catch(e){}load();snapInit()}finally{RS.hold=false}RS.rev=rev;RS.snap=rsSnap(S)}
function rsIdle(){const a=document.activeElement;return $("#modal").hidden&&!(a&&/INPUT|SELECT|TEXTAREA/.test(a.tagName))&&!U.drag}
function rsRender(){if(!RS.pend)return;if(!rsIdle())return;RS.pend=false;try{render()}catch(e){console.error(e)}}
function rsRemote(list){const had={};(S.parties||[]).forEach(p=>{had[p.id]=1});list.forEach(ops=>rsApply(ops,S,RS.snap));snapInit();
 // a booking that has just come in from the booking link
 try{const nw=(S.parties||[]).filter(p=>p.web&&!had[p.id]&&Date.now()-p.web<6e5);if(nw.length)setTimeout(()=>toast(nw.length===1?"New online booking: "+nw[0].name+", "+nw[0].size+(nw[0].size===1?" guest, ":" guests, ")+fmtD(nw[0].date)+" "+nw[0].time:nw.length+" new online bookings"),600)}catch(e){}
 try{localStorage.setItem(SKEY(),JSON.stringify(S))}catch(e){}RS.pend=true;rsRender()}
function rsMark(){if(!RS.on||RS.hold)return;clearTimeout(RS.t);RS.t=setTimeout(rsPush,350);rsDot()}
// the server no longer treats this device as unlocked (the manager token ran out): lock the screen too
function rsFullCheck(full){if(CL.tok&&full===false){CL.tok="";U.mgr=false;toast("Manager access locked");rsResync(true)}}
async function rsPush(){if(!RS.on)return;if(RS.busy){RS.dirty=true;return}const ops=rsDiff();if(!ops.length){rsDot();return}RS.busy=true;const after=rsSnap(S);
 try{const r=await rsFetch("api/ops",{method:"POST",body:JSON.stringify({base:RS.rev,ops})});RS.snap=after;RS.rev=r.rev;RS.err=false;
  if(r.missed&&r.missed.length)rsRemote(r.missed);
  RS.busy=false;if(r.dropped)await rsResync(true);rsFullCheck(r.full)}
 catch(e){RS.busy=false;if(!CL.kicked){RS.err=true;setTimeout(rsMark,4000)}}
 RS.busy=false;rsDot();if(RS.dirty){RS.dirty=false;rsMark()}}
async function rsFlush(){if(!RS.on)return;clearTimeout(RS.t);let n=0;while(RS.busy&&n++<40)await new Promise(r=>setTimeout(r,100));await rsPush()}
async function rsResync(force){if(!RS.on)return;if(!force&&Date.now()-RS.lastRs<8000)return;RS.lastRs=Date.now();
 try{const j=await rsFetch("api/state");rsAdopt(j.state,j.rev);RS.err=false;RS.pend=true;if(force){RS.pend=false;render()}else rsRender()}catch(e){if(!CL.kicked)RS.err=true}rsDot()}
async function rsPoll(){if(!RS.on||RS.busy)return;if(RS.pend)rsRender();
 if(CL.tok&&(!U.mgr||Date.now()-(U.mgrT||0)>6e5)){await clRelock();return}
 try{const r=await rsFetch("api/changes?since="+RS.rev,{},15000);RS.err=false;
  if(r.snapshot){if(rsDiff().length){RS.pend=true;rsMark();return}rsAdopt(r.snapshot,r.rev);RS.pend=true;rsRender()}
  else if(r.ops&&r.ops.length){
   // changes made here and not sent yet go first, so nothing typed on this device is lost
   if(rsDiff().length){await rsPush();return}
   RS.rev=r.rev;rsRemote(r.ops)}
  else RS.rev=Math.max(RS.rev,r.rev);
  rsFullCheck(r.full)}catch(e){if(!CL.kicked)RS.err=true}rsDot()}
function rsDot(){let d=document.getElementById("rs-dot");const side=document.querySelector(".side .brand");if(!side)return;
 if(!d){d=document.createElement("span");d.id="rs-dot";d.style.cssText="width:9px;height:9px;border-radius:50%;flex:none;margin-left:6px";side.appendChild(d)}
 const st=RS.err?"bad":(RS.busy||RS.t&&rsDiffQuick())?"warn":"ok";d.style.background=st==="bad"?"var(--bad)":st==="warn"?"var(--warn)":"var(--ok)";d.title=st==="bad"?"Offline: changes are kept on this device and sent when the internet is back":st==="warn"?"Saving...":"Saved for every device"}
function rsDiffQuick(){try{return rsDiff().length>0}catch(e){return false}}
function rsTimers(){if(RS.tm)return;RS.tm=1;setInterval(rsPoll,60000);setInterval(()=>{rsRender();rsDot()},1500);setInterval(()=>{if(CL.tok&&(!U.mgr||Date.now()-(U.mgrT||0)>6e5))clRelock()},15000);
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)rsPoll()});addEventListener("online",()=>{rsPoll();rsMark()});
 try{CL.sb.channel("pr-"+CL.site.id).on("postgres_changes",{event:"*",schema:"public",table:"pr_site_ping",filter:"id=eq."+CL.site.id},ev=>{const rv=Number(ev&&ev.new&&ev.new.rev)||0;if(!rv||rv>RS.rev)rsPoll()}).subscribe()}catch(e){}}

/* ---------- manager PIN on a Staff login: checked on the server ---------- */
async function clRelock(){if(!CL.tok)return;const t=CL.tok;U.mgr=false;try{await rsFlush()}catch(e){}try{await rsFetch("api/lock",{method:"POST",body:"{}"})}catch(e){}if(CL.tok===t)CL.tok="";await rsResync(true)}
{const mgrin0=A.mgrin,mgrok0=A.mgrok,mgrout0=A.mgrout;
 A.mgrin=b=>{if(!CL.site||CL.base)return mgrin0(b);if(S.mgrPin)return mgrModal("Manager sign in","","mgrok",false);toast("No manager PIN yet. An admin or a manager sets it from their own login.")};
 A.mgrok=async b=>{if(!CL.site||CL.base)return mgrok0(b);if(CL.unl)return;const pin=$("#m-pin").value.trim();if(!pin)return;CL.unl=true;
  try{await rsFlush();const r=await fetch(rsUrl("api/unlock"),{method:"POST",headers:await rsHdr(),body:JSON.stringify({pin})});const j=await r.json().catch(()=>({}));
   if(r.status===200&&j.token){CL.tok=j.token;await rsResync(true);mgrOn()}
   else if(r.status===429)toast("Too many tries. Wait ten minutes.");
   else if(r.status===401&&j.error==="pin"){toast("That PIN is not right");$("#m-pin").value=""}
   else if(j.error==="nopin")toast("No manager PIN yet. An admin or a manager sets it from their own login.");
   else toast("Could not check the PIN. Check the internet.")}
  catch(e){toast("Could not check the PIN. Check the internet.")}finally{CL.unl=false}};
 A.mgrout=b=>{mgrout0(b);if(CL.tok)clRelock()}}

/* ---------- Settings: who is signed in, and the logins of this business ---------- */
const clBoss=()=>!!CL.site&&(CL.who.is_master||CL.site.role==="Admin");
async function clMembers(){try{const r=await CL.sb.rpc("pr_list_members",{p_business:CL.site.business_id});if(r.error)throw r.error;CL.mem=r.data.members||[];CL.memErr=""}catch(e){CL.mem=CL.mem||[];CL.memErr=clErr(e)}if(U.view==="users"&&rsIdle())render()}
function clSettings(){} // the Account and Logins cards moved to the Users page (side menu, under Settings)
function clUsersHtml(){if(!CL.site||!clBoss())return"";const many=(CL.who.sites||[]).length>1;if(!CL.mem){CL.mem=[];clMembers()}
 return`<div class="sgc" style="max-width:820px"><div class="card pad"><h2>Signed in on this device</h2><p style="margin-top:0"><b>${esc(CL.who.email)}</b><br><span class="mut">${esc(CL.who.is_master?"Proview":CL.site.role||"")} \u00b7 ${esc(CL.site.name)}</span></p><div class="bar" style="margin:0"><button class="btn pri" data-act="clOut">Switch user</button>${many?`<button class="btn" data-act="clSwitch">Switch business</button>`:""}</div><p class="mut small" style="margin-bottom:0">Switch user signs this device out, so the next person can sign in with their own email.</p></div>
 <div class="card pad"><h2>Users</h2><p class="mut" style="margin-top:0">Everyone who can sign in to ${esc(CL.site.name)}. Each person uses their own email. <b>Admin</b> and <b>Manager</b> users see everything. A <b>Staff</b> user is good for a shared tablet.</p>${CL.memErr?`<p style="color:var(--bad)">${esc(CL.memErr)}</p>`:""}
  ${(CL.mem||[]).map(m=>`<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px solid var(--line)"><div style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis"><b>${esc(m.email)}</b><br><span class="mut small">${esc(m.role)}${m.joined?"":" \u00b7 has not signed in yet"}${m.me?" \u00b7 you":""}</span></div>${m.me?"":`<button class="btn" data-act="clMemDel" data-e="${esc(m.email)}">Remove</button>`}</div>`).join("")}
  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;border-top:1px solid var(--line);padding-top:10px;margin-top:4px"><input id="cl-me" type="email" placeholder="Email of the new user" aria-label="Email of the new user" style="flex:2 1 200px"><select id="cl-mr" aria-label="Role" style="flex:1 1 110px"><option>Staff</option><option>Manager</option><option>Admin</option></select><button class="btn pri" data-act="clMemAdd">Add user</button></div>
  <p class="mut small" style="margin-bottom:0">They then open this site and choose "First time? Create your account" with that email.</p></div></div>`}
/* ---------- Widget page: the booking link for Google and the venue's website ---------- */
const clBookUrl=()=>location.origin+location.pathname.replace(/[^/]*$/,"")+"book/?v="+encodeURIComponent(CL.site.id);
// The look of the booking page (kept with the online rules in venue.ob.look): theme, button colour, background, corners.
const CL_LOOK={mode:"light",accent:"",bg:"",corners:"round",style:""};
const clLook=()=>Object.assign({},CL_LOOK,(OB().look)||{});
const clLum=h=>{const c=parseInt(h.slice(1),16);return(0.299*(c>>16)+0.587*((c>>8)&255)+0.114*(c&255))/255};
function clLookPrev(){const L=clLook(),dk=L.mode==="dark",bg=L.bg||(dk?"#0e0e11":"#f4f3ef"),card=dk?"#17171c":"#fff",ink=dk?"#ececf1":"#17171c",mut=dk?"#9a9aa5":"#55555f",line=dk?"#2a2a32":"#e4e2dc";
 if(L.style==="elegant"){const sd=L.accent||"#ddc9b0",si=L.accent&&clLum(L.accent)<=0.62?"#fff":"#1b1b1b",nm=esc((S.venue.name||"Your venue").split(/\s+[-\u2013]\s+/)[0]),loc=esc((S.venue.name||"").split(/\s+[-\u2013]\s+/).slice(1).join(" - ")),cb=(t,on)=>`<span style="display:inline-block;width:30px;height:30px;line-height:30px;border-radius:50%;text-align:center;border:1px solid ${on?sd:line};background:${on?sd:card};color:${on?si:ink};font-size:13px">${t}</span>`;return`<div style="background:${bg};border:1px solid var(--line);border-radius:12px;padding:16px"><div style="background:${card};border:1px solid ${line};border-radius:14px;overflow:hidden;max-width:340px;margin:0 auto;font-family:Jost,Futura,'Century Gothic',system-ui,sans-serif;color:${ink}"><div style="background:${sd};color:${si};text-align:center;padding:18px 10px 0"><div style="letter-spacing:.28em;text-transform:uppercase;font-size:16px">${nm}</div><div style="display:inline-block;margin-top:12px;padding:6px 2px 8px;border-bottom:2px solid ${si};letter-spacing:.18em;text-transform:uppercase;font-size:10px">${loc||"Location"}</div></div><div style="padding:14px 16px"><div style="letter-spacing:.14em;text-transform:uppercase;font-size:10px;color:${mut};margin-bottom:8px">Guests</div><div style="display:flex;gap:6px;margin-bottom:12px">${cb(1)}${cb(2,1)}${cb(3)}${cb(4)}</div><div style="letter-spacing:.14em;text-transform:uppercase;font-size:10px;color:${mut};margin-bottom:6px">Date</div><div style="color:${mut};font-size:12px">Month calendar, then the free times</div></div></div></div>`}
 const btn=L.accent||"linear-gradient(135deg,#2f84d4 0%,#5a5fbb 100%)",bi=L.accent&&clLum(L.accent)>0.62?"#17171c":"#fff",rad=L.corners==="square"?3:L.corners==="pill"?22:10;
 const chip=(t,on)=>`<span style="display:inline-block;padding:8px 12px;border-radius:${rad}px;border:1px solid ${on?"transparent":line};background:${on?btn:card};color:${on?bi:ink};font-weight:600;font-size:13px">${t}</span>`;
 return`<div style="background:${bg};border:1px solid var(--line);border-radius:12px;padding:16px"><div style="background:${card};border:1px solid ${line};border-radius:${rad*2}px;padding:16px 18px;max-width:340px;margin:0 auto;font-family:Inter,'Segoe UI',system-ui,sans-serif;color:${ink}"><div style="font-size:19px;font-weight:700">${esc(S.venue.name||"Your venue")}</div><div style="color:${mut};font-size:13px;margin:2px 0 10px">${esc(OB().label||"Book a table")}</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">${chip("6:30pm")}${chip("7:00pm",1)}${chip("7:30pm")}${chip("8:00pm")}</div><div style="background:${btn};color:${bi};border-radius:${rad}px;text-align:center;padding:11px;font-weight:600;font-size:14px">Confirm booking</div></div></div>`}
function clLookSet(k,v,keep){if(!can("settings")){toast("Staff cannot change this. Ask a manager to sign in.");return}const o=OB();o.look=Object.assign({},CL_LOOK,o.look||{});o.look[k]=v;
 const pv=document.getElementById("cl-bk-pv");if(pv)pv.innerHTML=clLookPrev();if(keep)return;save();const c=document.getElementById("cl-book");if(c){c.remove();clBookCard()}}
document.addEventListener("input",e=>{const t=e.target;if(t&&t.dataset&&t.dataset.bkl&&t.type==="color")clLookSet(t.dataset.bkl,t.value,true)});
document.addEventListener("change",e=>{const t=e.target;if(t&&t.dataset&&t.dataset.bkl)clLookSet(t.dataset.bkl,t.value)});
function clBookCard(){if(!CL.site||U.view!=="online")return;const main=$("#main");if(!main||document.getElementById("cl-book"))return;const host=main.querySelector(".sgc")||main;
 const url=clBookUrl(),on=!!OB().on,lab=OB().label||"Book a table";
 const L=clLook(),bc=L.accent||"#3f5fd0",bi=L.accent&&clLum(L.accent)>0.62?"#17171c":"#fff",br=L.corners==="square"?3:L.corners==="pill"?22:10;
 const btn=`<a href="${url}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 22px;border-radius:${br}px;background:${bc};color:${bi};font-family:Arial,sans-serif;font-weight:bold;text-decoration:none">${esc(lab)}</a>`;
 const frame=`<iframe id="pvbook" src="${url}&embed=1" title="${esc(lab)}" style="width:100%;max-width:760px;height:620px;border:0" loading="lazy"></iframe>\n<script>addEventListener("message",function(e){var f=document.getElementById("pvbook");if(f&&e.source===f.contentWindow&&e.data&&e.data.proviewBookingHeight)f.style.height=e.data.proviewBookingHeight+"px"})<\/script>`;
 const box=(id,v,rows)=>`<div style="display:flex;gap:8px;align-items:flex-start;margin:6px 0 0">${rows?`<textarea id="${id}" readonly rows="${rows}" style="flex:1;min-width:0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px">${esc(v)}</textarea>`:`<input id="${id}" readonly value="${esc(v)}" style="flex:1;min-width:0">`}<button class="btn" data-act="clBkCopy" data-f="${id}">Copy</button></div>`;
 const d=document.createElement("div");d.id="cl-book";d.className="clbk";
 d.innerHTML=`<div class="clc"><div class="card pad"><h2>Your booking link</h2><p class="mut" style="margin-top:0">Guests book a table themselves from this link. It follows the rules below, only offers times with a free table, and each booking appears here straight away marked Website.</p>
 ${on?`<p style="margin:0 0 6px;color:var(--ok);font-weight:600">Online booking is on.</p>`:`<p style="margin:0 0 6px;color:var(--warn);font-weight:600">Online booking is off. Switch on "Accept online bookings" below and guests can book from this link.</p>`}
 ${box("cl-bk-u",url)}<div class="bar" style="margin:10px 0 0"><a class="btn pri" style="text-decoration:none" href="${url}" target="_blank" rel="noopener">Open the booking page</a></div></div>
 <div class="card pad"><h2>Add it to Google</h2><ol class="mut" style="margin:0;padding-left:20px"><li>Sign in to the Google account that manages your Business Profile and search for your business name.</li><li>Choose <b>Bookings</b> (on some profiles: Edit profile, then Bookings or Reservations).</li><li>Choose <b>Links to your online booking tools</b>, then <b>Add a link</b>.</li><li>Paste your booking link and save. Google shows it on Search and Maps, usually within a few minutes.</li></ol></div>
 <div class="card pad"><h2>Add it to your website</h2><p class="mut" style="margin:0">A button that opens your booking page. Paste this where the button should be:</p>${box("cl-bk-b",btn,3)}
 <p class="mut" style="margin:12px 0 0">Or show the booking form inside your own page:</p>${box("cl-bk-f",frame,3)}
 <p class="mut small" style="margin:10px 0 0">The link also works in Instagram and Facebook profiles, emails and on a QR code.</p></div></div>
 <div class="clc"><div class="card pad"><h2>Look of the booking page</h2><p class="mut" style="margin:0 0 8px">Match the booking page to your brand. Changes show on your link and on your website straight away.</p>
 <div class="g2"><label class="of"><span class="ot">Template</span><select data-bkl="style"><option value="" ${L.style!=="elegant"?"selected":""}>Standard</option><option value="elegant" ${L.style==="elegant"?"selected":""}>Elegant (sand header, calendar)</option></select></label></div>
 <div class="g2"><label class="of"><span class="ot">Theme</span><select data-bkl="mode"><option value="light" ${L.mode!=="dark"?"selected":""}>Light</option><option value="dark" ${L.mode==="dark"?"selected":""}>Dark</option></select></label>
 <label class="of"><span class="ot">Corners</span><select data-bkl="corners"><option value="round" ${L.corners==="round"?"selected":""}>Rounded</option><option value="square" ${L.corners==="square"?"selected":""}>Square</option><option value="pill" ${L.corners==="pill"?"selected":""}>Very round</option></select></label></div>
 <div class="g2"><label class="of"><span class="ot">Button colour</span><input type="color" data-bkl="accent" value="${L.accent||"#3f6fc8"}" style="height:44px;padding:4px"><small class="mut">${L.accent?"Your colour "+esc(L.accent):"Proview blue (standard)"}</small></label>
 <label class="of"><span class="ot">Page background</span><input type="color" data-bkl="bg" value="${L.bg||(L.mode==="dark"?"#0e0e11":"#f4f3ef")}" style="height:44px;padding:4px"><small class="mut">${L.bg?"Your colour "+esc(L.bg):"Standard for the theme"}. Inside your own website the page behind shows through.</small></label></div>
 <div id="cl-bk-pv" style="margin:10px 0 0">${clLookPrev()}</div>
 <div class="bar" style="margin:10px 0 0"><button class="btn" data-act="clBkReset">Use the Proview colours</button></div>
</div></div>`;
 host.insertBefore(d,host.firstChild);
 { const ob=host.querySelector(":scope>.card.onb"),lc=d.querySelector(".clc");if(ob&&lc)lc.appendChild(ob) }
 /* each Widget box minimises like the Settings boxes; the booking link starts open, the rest minimised */
 if(!clBookCard.init){clBookCard.init=1;SETO["Your booking link"]=1}
 d.querySelectorAll(".card").forEach(c=>{const h=c.firstElementChild;if(!h||h.tagName!=="H2")return;const t=h.textContent.trim();c.classList.add("sc");h.classList.add("sh");h.dataset.act="setc";h.dataset.t=t;h.setAttribute("role","button");h.setAttribute("tabindex","0");const cl=!SETO[t];c.classList.toggle("cl",cl);h.setAttribute("aria-expanded",cl?"false":"true")});
 if(!main.querySelector(".setbar"))host.insertAdjacentHTML("beforebegin",'<div class="setbar"><button class="btn" data-act="setall" data-v="1">Minimise all</button><button class="btn" data-act="setall" data-v="0">Expand all</button></div>');
 const i=main.querySelector(".obi");if(i)i.textContent="Rules for your booking link. They apply to every online booking, on Google and on your website.";
 main.querySelectorAll(".swt small").forEach(x=>{if(/widget is connected/.test(x.textContent))x.textContent="Guests can book from your link while this is on"})}
Object.assign(A,{
 clBkReset:()=>{if(!can("settings")){toast("Staff cannot change this. Ask a manager to sign in.");return}const o=OB();delete o.look;save();const c=document.getElementById("cl-book");if(c){c.remove();clBookCard()}toast("Back to the Proview colours")},
 clBkCopy:b=>{const f=document.getElementById(b.dataset.f);if(!f)return;f.focus();f.select();let ok=false;try{ok=document.execCommand("copy")}catch(e){}const bad=()=>toast("Could not copy by button. The text is selected: press Cmd+C.");if(ok){toast("Copied");return}try{navigator.clipboard.writeText(f.value).then(()=>toast("Copied"),bad)}catch(e){bad()}},
 clMemAdd:async()=>{const e=(($("#cl-me")||{}).value||"").trim().toLowerCase(),role=($("#cl-mr")||{}).value||"Staff";if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)){toast("Enter a valid email address");return}
  const r=await CL.sb.rpc("pr_save_member",{p_business:CL.site.business_id,p_email:e,p_role:role});if(r.error){toast(clErr(r.error));return}toast("User added");await clMembers();render()},
 clMemDel:b=>ask("Remove the user "+b.dataset.e+"? They will no longer be able to sign in to this business.","Remove",async()=>{const r=await CL.sb.rpc("pr_remove_member",{p_business:CL.site.business_id,p_email:b.dataset.e});if(r.error){toast(clErr(r.error));return}toast("User removed");await clMembers();render()})
});

/* ---------- start ---------- */
async function cloudStart(){
 if(!/^https?:$/.test(location.protocol)){clHide();BOOT();return}
 // nothing is shown, and nothing saved, until we know whether this site uses the cloud
 CLK=KEY+"-gate";S={parties:[],tables:[],staff:[],punches:[],waiting:[],ts:{},gnotes:{},hist:{},venue:{},deco:[],rooms:[]};RS.hold=true;
 try{S=blankState("")}catch(e){}
 CL.scr="wait";clShow();
 const cfg=await clCfg();
 if(!cfg){CLK="";RS.hold=false;clHide();BOOT();return}
 const site=await cloudGate(cfg);
 CLK="proview-res-"+site.id;
 try{
  const p=await rsFetch("api/ping");CL.base=!!p.full;
  if(!p.hasState){
   if(!(p.master||p.role==="Admin")){clScreen("fail",{err:"This business has not been set up yet. Ask your business admin to sign in first."});return}
   await rsFetch("api/init",{method:"POST",body:JSON.stringify({state:blankState(site.name)})},30000)}
  const j=await rsFetch("api/state");
  rsAdopt(j.state,j.rev);
  // hook saving: every save() also sends the changes
  const save0=save;save=function(){save0();rsMark()};
  const render0=render;render=function(){render0();try{clSettings();clBookCard()}catch(e){console.error(e)}};
  RS.on=true;RS.hold=false;clHide();
  autoRun();render();setBtn();rsTimers();rsDot();
  document.title=(S.venue&&S.venue.name?S.venue.name+" · ":"")+"Proview Reservations";
 }catch(e){if(CL.kicked)return;console.error(e);clScreen("fail",{err:"Could not load the data. Check the internet and try again."})}}
