
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
const CL_SDK="vendor/supabase.js"; // the Supabase library, served by this site (version in vendor/README.md)
const CL_PORTAL="https://license.proviewcrm.co.uk",CL_PHONE="020 8935 5495",CL_APP="reservations";
const clGet=k=>{try{return localStorage.getItem(k)||""}catch(e){return ""}};
const clSet=(k,v)=>{try{if(v)localStorage.setItem(k,v);else localStorage.removeItem(k)}catch(e){}};
const clSS=(k,v)=>{try{if(v===undefined)return sessionStorage.getItem(k)||"";if(v)sessionStorage.setItem(k,v);else sessionStorage.removeItem(k)}catch(e){return ""}};
function clLoad(src){return new Promise((ok,no)=>{const s=document.createElement("script");s.src=src;s.onload=ok;s.onerror=no;document.head.appendChild(s)})}
async function clCfg(){try{const r=await fetch("cloud.json",{cache:"no-store"});if(!r.ok)return null;const j=await r.json();return j&&j.url&&j.key?j:null}catch(e){return null}}
function clErr(e){const m=String((e&&e.message)||e||"");if(/Invalid login/i.test(m))return "Wrong email or password.";if(/not confirmed/i.test(m))return "Please confirm your email first: open the link we emailed you.";if(/already registered/i.test(m))return "This email already has an account. Sign in instead.";if(/at least \d+|password should/i.test(m))return "The password needs at least 8 characters.";if(/rate limit|too many/i.test(m))return "Too many tries. Please wait a few minutes.";if(/fetch|network/i.test(m))return "Cannot reach the server. Check the internet.";return m||"Something went wrong. Try again."}
function clLic(s){if(s.suspended)return "This business is paused.";if(!s.license_type)return "This business has no licence yet.";return s.license_type==="trial"?"The free trial has ended.":"The licence has ended."}
// A new business starts with the sample floor plan only: no sample bookings, guests, staff or history.
function blankState(name){const s=seed();s.parties=[];s.waiting=[];s.staff=[];s.punches=[];s.hist={};s.histSample=false;s.gnotes={};s.ts={};s.rotaSh=[];s.tables=[];s.deco=[];s.rooms=["Main room"];s.demoY=s.demoU=s.demoB=s.demoP=1;s.venue.name=name||"My venue";delete s.venue.id;return s}

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
 else if(m==="up"){split=true;b=`<h1>Create your account</h1><p class="muted">Use the email address your manager added for you, or your own if you are setting up a new business. Choose a password of at least 8 characters.</p>${msg}${fEm}${fPw("clpw","Password","new-password","At least 8 characters")}${fPw("clpw2","Confirm password","new-password","Type it again")}${go("clUp","Create account")}${links(lnk("clScr","I already have an account",'data-s="in"'))}`}
 else if(m==="reset"){split=true;b=`<h1>Forgot password</h1><p class="muted">We will email you a link to choose a new one. Your password is the same on all Proview sites.</p>${msg}${fEm}${go("clReset","Send the link")}${links(lnk("clScr","Back to sign in",'data-s="in"'))}`}
 else if(m==="newpw")b=`<h1>Choose a new password</h1><p class="muted">At least 8 characters. Your password is the same on all Proview sites, so this changes it everywhere.</p>${msg}${fPw("clpw","New password","new-password","At least 8 characters")}${go("clNewPw","Save and continue")}`;
 else if(m==="setup")b=`<h1>Set up your business</h1><p class="muted">Signed in as ${esc(CL.who.email)}. This login is not part of a business yet.</p><p class="muted">Staff: ask your manager to add this email under Settings, Logins, then press Check again.</p>${msg}<label class="af">Business name<input id="clbn" type="text" maxlength="80" placeholder="e.g. Bella Pizza" autocomplete="organization"></label>${go("clMake","Create my business")}${links(lnk("clAgain","Check again")+out)}`;
 else if(m==="empty")b=`<h1>No businesses yet</h1><p class="muted">Add the first one in the licence portal (New business).</p>${msg}${portal}${links(lnk("clAgain","Check again")+out)}`;
 else if(m==="pick"){wide=true;const ss=CL.who.sites||[];b=`<h1>Which business?</h1><p class="muted">Signed in as ${esc(CL.who.email||"")}.</p>${msg}<div class="pvs-pick">${ss.map(s=>`<button type="button" data-act="clPick" data-id="${esc(s.id)}"><b>${esc(s.name)}</b><span>${esc(s.business&&s.business!==s.name?s.business+" · ":"")}${s.ok?esc(s.role||""):esc(clLic(s))}</span></button>`).join("")}</div>${links(out)}`}
 else if(m==="lock"){const s=CL.locked;b=`<h1>${esc(s.name)}</h1><div class="notice bad">${esc(clLic(s))}</div><p class="muted">${s.suspended?"Call Proview on "+CL_PHONE+".":"Buy or renew a licence in the licence portal, or call Proview on "+CL_PHONE+"."}</p>${s.suspended?"":portal}${links(lnk("clAgain","Check again")+((CL.who.sites||[]).length>1?lnk("clScr","Another business",'data-s="pick"'):"")+out)}`}
 else if(m==="fail")b=`<h1>Cannot connect</h1><p class="muted">${esc(CL.err||"Check the internet and try again.")}</p>${go("clReload","Try again").replace(" disabled","")}${CL.who?links(out):""}`;
 r.className="";
 r.innerHTML=`<div class="pvs-auth${split?"":" solo"}">${split?CL_ART:""}<div class="pvs-form"><form class="pvs-card${wide?" wide":""}" novalidate onsubmit="return false">${CL_BRAND}${b}<p class="pvs-legal"><a href="privacy.html" target="_blank" rel="noopener">Privacy</a> \u00b7 Proview \u00b7 ${CL_PHONE}</p></form></div></div>`;
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
 clUp:()=>clTry(async()=>{const v=clVals();if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email))throw new Error("Enter a valid email address.");if(v.pw.length<8)throw new Error("The password needs at least 8 characters.");const p2=$("#clpw2");if(p2&&p2.value!==v.pw)throw new Error("The two passwords do not match.");
  const r=await CL.sb.auth.signUp({email:v.email,password:v.pw,options:{emailRedirectTo:location.origin+location.pathname}});if(r.error)throw r.error;
  if(r.data&&r.data.session){await clAfter();return}clScreen("in",{note:"Almost there: open the link we just emailed you, then sign in here."})}),
 clReset:()=>clTry(async()=>{const v=clVals();if(!v.email)throw new Error("Enter your email.");const r=await CL.sb.auth.resetPasswordForEmail(v.email,{redirectTo:location.origin+location.pathname});if(r.error)throw r.error;clScreen("in",{note:"If that email has an account, a link is on its way."})}),
 clNewPw:()=>clTry(async()=>{const p=($("#clpw")||{}).value||"";if(p.length<8)throw new Error("The password needs at least 8 characters.");const r=await CL.sb.auth.updateUser({password:p});if(r.error)throw r.error;await clAfter()}),
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
 try{const nw=(S.parties||[]).filter(p=>p.web&&!had[p.id]&&Date.now()-p.web<6e5);if(nw.length)setTimeout(()=>toast(nw.length===1?"New: "+nw[0].name+" \u00b7 "+nw[0].size+" \u00b7 "+fmtD(nw[0].date)+" "+nw[0].time:nw.length+" new bookings"),600)}catch(e){}
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
 A.mgrin=b=>{if(!CL.site||CL.base)return mgrin0(b);if(S.mgrPin)return mgrModal("Manager sign in","","mgrok",false);toast("No manager PIN set yet")};
 A.mgrok=async b=>{if(!CL.site||CL.base)return mgrok0(b);if(CL.unl)return;const pin=$("#m-pin").value.trim();if(!pin)return;CL.unl=true;
  try{await rsFlush();const r=await fetch(rsUrl("api/unlock"),{method:"POST",headers:await rsHdr(),body:JSON.stringify({pin})});const j=await r.json().catch(()=>({}));
   if(r.status===200&&j.token){CL.tok=j.token;await rsResync(true);mgrOn()}
   else if(r.status===429)toast("Too many tries. Wait ten minutes.");
   else if(r.status===401&&j.error==="pin"){toast("That PIN is not right");$("#m-pin").value=""}
   else if(j.error==="nopin")toast("No manager PIN set yet");
   else toast("No internet to check PIN")}
  catch(e){toast("No internet to check PIN")}finally{CL.unl=false}};
 A.mgrout=b=>{mgrout0(b);if(CL.tok)clRelock()}}

/* ---------- Settings: who is signed in, and the logins of this business ---------- */
const clBoss=()=>!!CL.site&&(CL.who.is_master||CL.site.role==="Admin");
async function clMembers(){try{const r=await CL.sb.rpc("pr_list_members",{p_business:CL.site.business_id});if(r.error)throw r.error;CL.mem=r.data.members||[];CL.memErr=""}catch(e){CL.mem=CL.mem||[];CL.memErr=clErr(e)}if(U.view==="users"&&rsIdle())render()}
/* ---------- Settings: Guest privacy ----------
   - what the booking page tells guests (the venue's own policy link and a contact email), kept in venue.ob.priv
   - how long guest details are kept (venue.keep, months; 0 = until deleted by hand)
   When a period is set, guests whose last booking is older than that have their name, phone, email, notes and tags
   removed. The bookings themselves stay (marked anon) so covers and reports do not change. */
const CL_KEEP=[[0,"Until I delete them"],[12,"12 months after their last booking"],[24,"24 months after their last booking"],[36,"3 years after their last booking"],[60,"5 years after their last booking"]];
const clPriv=()=>Object.assign({url:"",email:""},(OB().priv)||{});
function clKeepCut(k){const d=new Date();d.setMonth(d.getMonth()-k);return iso(d)}
function clKeepList(k){k=k==null?(+S.venue.keep||0):k;if(k<6)return[];const cut=clKeepCut(k),last={};(S.parties||[]).forEach(p=>{if(p.anon)return;const g=gkey(p);if(!last[g]||p.date>last[g])last[g]=p.date});return Object.keys(last).filter(g=>last[g]<cut)}
function clKeepRun(){const k=+S.venue.keep||0,ks=clKeepList(k);const cut=k>=6?clKeepCut(k):"";let ev=0;
 if(k>=6){const cms=new Date(cut+"T00:00:00").getTime();(S.evb||[]).forEach(b=>{if(!b.anon&&b.at&&b.at<cms){b.name="GUEST REMOVED";b.phone="";b.email="";b.notes="";delete b.mkAt;delete b.mkBy;b.anon=1;ev++}})}
 if(!ks.length&&!ev)return 0;const gone=new Set(ks);
 // keys first, because a booking's key is built from the phone and name that are about to be removed
 const hit=(S.parties||[]).filter(p=>!p.anon&&gone.has(gkey(p)));
 hit.forEach(p=>{p.name="GUEST REMOVED";p.phone="";p.email="";p.notes="";p.tags=[];["occ","dsrt","mkAt","mkBy","cmail","web","req"].forEach(f=>{delete p[f]});p.anon=1});
 const L=S.loy||{};ks.forEach(g=>{[S.gnotes,S.mkoff,L.used,L.mailed,L.gifts].forEach(o=>{if(o&&typeof o==="object")delete o[g]})});
 save();return ks.length}
function clSettings(){if(!CL.site||U.view!=="settings")return;const main=$("#main");if(!main||document.getElementById("cl-priv"))return;const host=main.querySelector(".setcols")||main;
 const P=clPriv(),k=+S.venue.keep||0,ed=can("settings"),due=clKeepList().length,dis=ed?"":"disabled";
 const d=document.createElement("div");d.id="cl-priv";d.className="card pad";
 d.innerHTML=`<h2>Guest privacy</h2><p class="mut" style="margin-top:0">You are responsible for your guests' details. Proview stores them for you in the UK. Guests see a short notice on your booking page saying how their details are used.</p>
 <label class="of" style="display:block"><span class="ot">Keep guest details</span><select data-clp="keep" ${dis}>${CL_KEEP.map(x=>`<option value="${x[0]}" ${x[0]===k?"selected":""}>${x[1]}</option>`).join("")}</select><small class="mut" style="display:block">${k?`Names, phone numbers, emails and notes are removed ${k} months after a guest's last booking. The bookings stay in your reports without the guest's details.`:"Nothing is removed automatically. UK rules say details should not be kept longer than you need them, so choose a period."}</small></label>
 ${due?`<p style="margin:8px 0 0;color:var(--warn);font-weight:600">${due} guest${due===1?" is":"s are"} past this period.</p><div class="bar" style="margin:8px 0 0"><button class="btn" data-act="clKeepNow" ${dis}>Remove their details now</button></div>`:""}
 <label class="of" style="display:block;margin-top:12px"><span class="ot">Email guests can use to ask about their details</span><input type="email" data-clp="email" maxlength="120" placeholder="for example info@yourvenue.co.uk" value="${esc(P.email)}" ${dis}></label>
 <label class="of" style="display:block;margin-top:12px"><span class="ot">Link to your own privacy policy (optional)</span><input type="url" data-clp="url" maxlength="300" placeholder="https://" value="${esc(P.url)}" ${dis}><small class="mut" style="display:block">Shown under the notice on your booking page. To delete one guest, open them in Guests and press Delete guest.</small></label>`;
 const cols=host.querySelectorAll(":scope>.scol");(cols.length?[...cols].sort((x,y)=>x.offsetHeight-y.offsetHeight)[0]:host).appendChild(d);
 {const h=d.firstElementChild;d.classList.add("sc");h.classList.add("sh");h.dataset.act="setc";h.dataset.t="Guest privacy";h.setAttribute("role","button");h.setAttribute("tabindex","0");const cl=!SETO["Guest privacy"];d.classList.toggle("cl",cl);h.setAttribute("aria-expanded",cl?"false":"true")}
 clMailCard(host,dis);clMsgCard(host,dis)}
/* ---------- Settings: Emails to guests ----------
   venue.mail.addr is the venue's own email address. Every automatic email to a guest (confirmation, change, cancellation,
   event booking, table alert) goes out under the venue's name with replies to this address; it is sent FROM this address
   when the venue's domain is verified in Proview's email service, otherwise from the shared Proview address. */
const clMail=()=>Object.assign({addr:""},S.venue.mail||{});
function clMailCard(host,dis,at){if(document.getElementById("cl-mail"))return;const M=clMail(),T=CL.mailT,TT="Emails to guests";
 const d=document.createElement("div");d.id="cl-mail";d.className="card pad";
 const st=!M.addr?`<p style="margin:8px 0 0;color:var(--warn);font-weight:600">No address yet. Guest emails are sent from the Proview address and replies do not come to you.</p>`
  :T&&T.to===M.addr?(T.via==="own"?`<p style="margin:8px 0 0;color:var(--ok);font-weight:600">Guest emails are sent from ${esc(M.addr)} and replies come to you.</p>`
   :T.via==="shared"?`<p style="margin:8px 0 0;font-weight:600">Guest emails show your venue name, are sent from ${esc(T.shared)}, and replies come to ${esc(M.addr)}.</p><p class="mut small" style="margin:6px 0 0">${T.free?"Gmail, Outlook and similar addresses cannot be used as the sending address by another service, so this is as close as it gets. Use an address on your own website domain to send from it.":"To send from "+esc(M.addr)+" itself, your domain needs three DNS records. Call Proview on "+CL_PHONE+" and we will set it up with you."}</p>`
   :`<p style="margin:8px 0 0;color:var(--warn);font-weight:600">${esc(T.message||"The test email could not be sent.")}</p>`):`<p class="mut small" style="margin:8px 0 0">Replies from guests come to this address. Press Send a test email to check it and see which address guests will see.</p>`;
 d.innerHTML=`<h2>${TT}</h2><p class="mut" style="margin-top:0">Booking confirmations, changes, cancellations, event bookings and table alerts are emailed to guests as ${esc(S.venue.name||"your venue")}. Enter your own email address so they come from you and replies come back to you.</p>
 <label class="of" style="display:block"><span class="ot">Your email address</span><input type="email" data-clm="addr" maxlength="120" placeholder="for example bookings@yourvenue.co.uk" value="${esc(M.addr)}" ${dis}></label>${st}
 ${M.addr?`<div class="bar" style="margin:10px 0 0"><button class="btn" data-act="clMailTest" ${dis} ${CL.mailBusy?"disabled":""}>${CL.mailBusy?"Sending\u2026":"Send a test email"}</button></div>`:""}
 <p class="mut small" style="margin:10px 0 0">Emails you write yourself from a booking or the marketing list open in your own email app and already come from you.</p>`;
 if(at&&at.parentNode)at.parentNode.insertBefore(d,at);else{const cols=host.querySelectorAll(":scope>.scol");(cols.length?[...cols].sort((x,y)=>x.offsetHeight-y.offsetHeight)[0]:host).appendChild(d)}
 {const h=d.firstElementChild;d.classList.add("sc");h.classList.add("sh");h.dataset.act="setc";h.dataset.t=TT;h.setAttribute("role","button");h.setAttribute("tabindex","0");const cl=!SETO[TT];d.classList.toggle("cl",cl);h.setAttribute("aria-expanded",cl?"false":"true")}}
/* ---------- Settings: Texts and WhatsApp to guests ----------
   venue.msg = { wa, sms, rem, staff, name }. Sent by the server through Proview's Twilio account (see _shared/notify.ts).
   WhatsApp is tried first when it is on; a text is sent only if WhatsApp is off or cannot be delivered. */
const clMsg=()=>Object.assign({wa:false,sms:false,rem:false,staff:false,name:""},S.venue.msg||{});
function clMsgCard(host,dis,at){if(document.getElementById("cl-msg"))return;const M=clMsg(),I=CL.msgInfo,TT="Texts and WhatsApp to guests",T=CL.msgT;
 if(!I&&!CL.msgAsk&&CL.site){CL.msgAsk=true;rsFetch("api/msginfo").then(r=>{CL.msgInfo=r;clMsgRedraw()}).catch(()=>{CL.msgInfo={sms:false,wa:false,tpl:[],err:true};clMsgRedraw()})}
 const d=document.createElement("div");d.id="cl-msg";d.className="card pad";
 const sw=(k,t,sub,off)=>`<label class="chk" style="display:flex;gap:10px;align-items:flex-start;margin:10px 0 0"><input type="checkbox" data-clg="${k}" style="width:auto;margin-top:3px" ${M[k]?"checked":""} ${dis} ${off?"disabled":""}><span><b>${t}</b><small class="mut" style="display:block">${sub}</small></span></label>`;
 const none=I&&!I.sms&&!I.wa,any=M.wa||M.sms;
 const top=!I?`<p class="mut small" style="margin:8px 0 0">Checking\u2026</p>`:none?`<p style="margin:8px 0 0;color:var(--warn);font-weight:600">Text and WhatsApp messages are not switched on for Proview Reservations yet. Call Proview on ${CL_PHONE}.</p>`:"";
 const tplNote=I&&I.wa&&(I.tpl||[]).length<5?`<small class="mut" style="display:block">WhatsApp is ready for: ${(I.tpl||[]).map(k=>({new:"confirmations",request:"requests",changed:"changes",cancelled:"cancellations",remind:"reminders"})[k]).join(", ")||"nothing yet"}. Other messages go by text if texts are on.</small>`:"";
 const res=T?`<p style="margin:8px 0 0;font-weight:600;color:${(T.sms||T.wa)?"var(--ok)":"var(--warn)"}">${esc(T.message||[T.wa===true?"WhatsApp test sent":T.wa===false?"WhatsApp test could not be sent":"",T.sms===true?"Text test sent":T.sms===false?"Text test could not be sent":""].filter(Boolean).join(". ")+" to "+T.to+".")}</p>`:"";
 d.innerHTML=`<h2>${TT}</h2><p class="mut" style="margin-top:0">Tell guests about their booking on their mobile as well as by email. Each message is paid for, so this is off until you switch it on. If both are on, WhatsApp is tried first and a text is sent only if WhatsApp cannot deliver.</p>${top}
 ${sw("wa","WhatsApp message","Sent from the Proview Reservations WhatsApp number, with your venue name in the message.",I&&!I.wa)}${tplNote}
 ${sw("sms","Text message","A short text with the day, time, party size and reference.",I&&!I.sms)}
 ${sw("rem","Reminder the day before","Sent after 10am the day before the booking. Guests who booked in the last 12 hours are not reminded.",!any)}
 ${sw("staff","Also for bookings my staff make and change","Guests get a message when staff add, move or cancel a booking in the app. Walk-ins are never messaged.",!any)}
 <label class="of" style="display:block;margin-top:12px"><span class="ot">Name shown as the sender of texts (optional)</span><input type="text" data-clg="name" maxlength="11" placeholder="up to 11 letters or numbers" value="${esc(M.name)}" ${dis}><small class="mut" style="display:block">For example ${esc((S.venue.name||"Venue").replace(/[^A-Za-z0-9]/g,"").slice(0,11))}. Guests cannot reply to a named sender. Leave empty to send from the Proview number.</small></label>
 ${any&&!none?`<div style="display:flex;gap:8px;align-items:center;margin:12px 0 0;flex-wrap:wrap"><input type="tel" id="cl-msg-to" placeholder="Your mobile, e.g. 07700 900123" style="flex:1;min-width:180px" value="${esc(CL.msgTo||"")}" ${dis}><button class="btn" data-act="clMsgTest" ${dis} ${CL.msgBusy?"disabled":""}>${CL.msgBusy?"Sending\u2026":"Send a test"}</button></div>`:""}${res}`;
 if(at&&at.parentNode)at.parentNode.insertBefore(d,at);else{const cols=host.querySelectorAll(":scope>.scol");(cols.length?[...cols].sort((x,y)=>x.offsetHeight-y.offsetHeight)[0]:host).appendChild(d)}
 {const h=d.firstElementChild;d.classList.add("sc");h.classList.add("sh");h.dataset.act="setc";h.dataset.t=TT;h.setAttribute("role","button");h.setAttribute("tabindex","0");const cl=!SETO[TT];d.classList.toggle("cl",cl);h.setAttribute("aria-expanded",cl?"false":"true")}}
const clMsgRedraw=()=>{const c=document.getElementById("cl-msg");if(!c)return;const t=document.getElementById("cl-msg-to");if(t)CL.msgTo=t.value;const h=c.closest(".setcols")||c.parentNode,mark=document.createComment("m");c.parentNode.insertBefore(mark,c);c.remove();clMsgCard(h,can("settings")?"":"disabled",mark);mark.remove()};
document.addEventListener("change",e=>{const t=e.target;if(!t||!t.dataset||!t.dataset.clg)return;if(!can("settings")){toast("Staff cannot change this. Ask a manager to sign in.");render();return}
 const k=t.dataset.clg,M=clMsg();if(k==="name"){M.name=String(t.value||"").replace(/[^A-Za-z0-9 ]/g,"").trim().slice(0,11);if(M.name&&!/[A-Za-z]/.test(M.name)){toast("The sender name needs at least one letter");M.name=""}}else M[k]=!!t.checked;
 if(!M.wa&&!M.sms){M.rem=false;M.staff=false}
 S.venue.msg=M;CL.msgT=null;save();clMsgRedraw();toast(k==="name"?(M.name?"Texts will show "+M.name.replace(/\s+/g,"")+" as the sender":"Texts will come from the Proview number"):"Saved")});
// redraw in the same place (after saving or testing)
const clMailRedraw=()=>{const c=document.getElementById("cl-mail");if(!c)return;const h=c.closest(".setcols")||c.parentNode,mark=document.createComment("m");c.parentNode.insertBefore(mark,c);c.remove();clMailCard(h,can("settings")?"":"disabled",mark);mark.remove()};
document.addEventListener("change",e=>{const t=e.target;if(!t||!t.dataset||!t.dataset.clm)return;if(!can("settings")){toast("Staff cannot change this. Ask a manager to sign in.");render();return}
 const v=String(t.value||"").trim().toLowerCase();if(v&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)){toast("That email address does not look right");t.value=clMail().addr;return}
 if(v)S.venue.mail={addr:v};else delete S.venue.mail;CL.mailT=null;save();clMailRedraw();toast(v?"Saved. Replies from guests will come to "+v:"Email address removed")});
document.addEventListener("change",e=>{const t=e.target;if(t&&U.evDraft&&U.evDraft.isNew&&(t.id==="ev-rep"||t.id==="ev-date")){clEvRead();clEvForm();return}if(!t||!t.dataset||!t.dataset.clp)return;if(!can("settings")){toast("Staff cannot change this. Ask a manager to sign in.");render();return}const k=t.dataset.clp;
 if(k==="keep"){const v=+t.value||0,n=clKeepList(v).length;const set=()=>{S.venue.keep=v;if(!v)delete S.venue.keep;save();if(v)clKeepRun();render();toast(v?"Guest details are kept for "+v+" months":"Guest details are kept until you delete them")};
  if(v&&n){ask("Remove the details of "+n+" guest"+(n===1?"":"s")+" whose last booking was more than "+v+" months ago? Names, phone numbers, emails and notes are removed for good. Their bookings stay in your reports.","Remove details",set);t.value=String(+S.venue.keep||0)}else set();return}
 const pv=clPriv(),o=OB();o.priv=pv;let v=String(t.value||"").trim();
 if(k==="url"&&v&&!/^https:\/\/\S+\.\S+/i.test(v)){toast("The link must start with https://");t.value=o.priv.url;return}
 if(k==="email"&&v&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)){toast("That email address does not look right");t.value=o.priv.email;return}
 o.priv[k]=v;save();toast("Saved")});

function clUsersHtml(){if(!CL.site||!clBoss())return"";const many=(CL.who.sites||[]).length>1;if(!CL.mem){CL.mem=[];clMembers()}
 return`<div class="sgc usr" style="max-width:820px"><div class="card pad"><h2>Signed in on this device</h2><p style="margin-top:0"><b>${esc(CL.who.email)}</b><br><span class="mut">${esc(CL.who.is_master?"Proview":CL.site.role||"")} \u00b7 ${esc(CL.site.name)}</span></p><div class="bar" style="margin:0"><button class="btn pri" data-act="clOut">Switch user</button>${many?`<button class="btn" data-act="clSwitch">Switch business</button>`:""}</div></div>
 <div class="card pad"><h2>Users</h2>${CL.memErr?`<p style="color:var(--bad)">${esc(CL.memErr)}</p>`:""}
  ${(CL.mem||[]).map(m=>`<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px solid var(--line)"><div style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis"><b>${esc(m.email)}</b><br><span class="mut small">${esc(m.role)}${m.joined?"":" \u00b7 has not signed in yet"}${m.me?" \u00b7 you":""}</span></div>${m.me?"":`<button class="btn" data-act="clMemDel" data-e="${esc(m.email)}">Remove</button>`}</div>`).join("")}
  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;border-top:1px solid var(--line);padding-top:10px;margin-top:4px"><input id="cl-me" type="email" placeholder="Email of the new user" aria-label="Email of the new user" style="flex:2 1 200px"><select id="cl-mr" aria-label="Role" style="flex:1 1 110px"><option>Staff</option><option>Manager</option><option>Admin</option></select><button class="btn pri" data-act="clMemAdd">Add user</button></div></div></div>`}
/* ---------- Widget page: the booking link for Google and the venue's website ---------- */
const clBookUrl=()=>location.origin+location.pathname.replace(/[^/]*$/,"")+"book/?v="+encodeURIComponent(CL.site.id);
// The look of the booking page (kept with the online rules in venue.ob.look): theme, button colour, background, corners.
const CL_LOOK={mode:"light",accent:"",bg:"",corners:"round",style:"",layout:"",size:"",logo:"",header:"",bgimg:"",addr:"",about:"",map:"",menu:"",alert:"",policy:"",policyTick:"",bgl:""};
const clLook=()=>Object.assign({},CL_LOOK,(OB().look)||{});
const clLum=h=>{const c=parseInt(h.slice(1),16);return(0.299*(c>>16)+0.587*((c>>8)&255)+0.114*(c&255))/255};
function clLookPrev(){const L=clLook(),dk=L.mode==="dark",bg=L.bg||(dk?"#0e0e11":"#f4f3ef"),card=dk?"#17171c":"#fff",ink=dk?"#ececf1":"#17171c",mut=dk?"#9a9aa5":"#55555f",line=dk?"#2a2a32":"#e4e2dc";
 if(L.style==="elegant"){const sd=L.accent||"#ddc9b0",si=L.accent&&clLum(L.accent)<=0.62?"#fff":"#1b1b1b",nm=esc((S.venue.name||"Your venue").split(/\s+[-\u2013]\s+/)[0]),loc=esc((S.venue.name||"").split(/\s+[-\u2013]\s+/).slice(1).join(" - ")),cb=(t,on)=>`<span style="display:inline-block;width:30px;height:30px;line-height:30px;border-radius:50%;text-align:center;border:1px solid ${on?sd:line};background:${on?sd:card};color:${on?si:ink};font-size:13px">${t}</span>`;return`<div style="background:${bg};border:1px solid var(--line);border-radius:12px;padding:16px"><div style="background:${card};border:1px solid ${line};border-radius:14px;overflow:hidden;max-width:340px;margin:0 auto;font-family:Jost,Futura,'Century Gothic',system-ui,sans-serif;color:${ink}"><div style="background:${sd};color:${si};text-align:center;padding:18px 10px 0"><div style="letter-spacing:.28em;text-transform:uppercase;font-size:16px">${nm}</div><div style="display:inline-block;margin-top:12px;padding:6px 2px 8px;border-bottom:2px solid ${si};letter-spacing:.18em;text-transform:uppercase;font-size:10px">${loc||"Location"}</div></div><div style="padding:14px 16px"><div style="letter-spacing:.14em;text-transform:uppercase;font-size:10px;color:${mut};margin-bottom:8px">Guests</div><div style="display:flex;gap:6px;margin-bottom:12px">${cb(1)}${cb(2,1)}${cb(3)}${cb(4)}</div><div style="letter-spacing:.14em;text-transform:uppercase;font-size:10px;color:${mut};margin-bottom:6px">Date</div><div style="color:${mut};font-size:12px">Month calendar, then the free times</div></div></div></div>`}
 const btn=L.accent||"linear-gradient(135deg,#2f84d4 0%,#5a5fbb 100%)",bi=L.accent&&clLum(L.accent)>0.62?"#17171c":"#fff",rad=L.corners==="square"?3:L.corners==="pill"?22:10;
 const chip=(t,on)=>`<span style="display:inline-block;padding:8px 12px;border-radius:${rad}px;border:1px solid ${on?"transparent":line};background:${on?btn:card};color:${on?bi:ink};font-weight:600;font-size:13px">${t}</span>`;
 return`<div style="background:${bg};border:1px solid var(--line);border-radius:12px;padding:16px"><div style="background:${card};border:1px solid ${line};border-radius:${rad*2}px;padding:16px 18px;max-width:340px;margin:0 auto;font-family:Inter,'Segoe UI',system-ui,sans-serif;color:${ink}"><div style="font-size:19px;font-weight:700">${esc(S.venue.name||"Your venue")}</div><div style="color:${mut};font-size:13px;margin:2px 0 10px">${esc(OB().label||"Book a table")}</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">${chip("6:30pm")}${chip("7:00pm",1)}${chip("7:30pm")}${chip("8:00pm")}</div><div style="background:${btn};color:${bi};border-radius:${rad}px;text-align:center;padding:11px;font-weight:600;font-size:14px">Confirm booking</div></div></div>`}
/* redraw the Widget boxes after a theme change; the Booking rules box lives inside them, so it is put back first and not thrown away */
/* while a guest is waiting on "Alert me", ask the booking server every few minutes to check whether a table has come free */
setInterval(()=>{try{if(!CL.site||!CL.cfg||typeof S==="undefined"||!S||!S.venue||!(S.venue.ob&&S.venue.ob.on)||!(S.alerts||[]).some(a=>a&&!a.sent))return;const u=new URL(CL.cfg.url+"/functions/v1/res-book");u.searchParams.set("v",CL.site.id);u.searchParams.set("a","tick");fetch(u,{headers:{apikey:CL.cfg.key,Authorization:"Bearer "+CL.cfg.key},cache:"no-store"}).catch(()=>{})}catch(e){}},240000);
/* ---------- Events: set up here, shown on the booking page ---------- */
const clEvs=()=>{if(!Array.isArray(S.events))S.events=[];return S.events},clEvb=()=>{if(!Array.isArray(S.evb))S.evb=[];return S.evb},clEvTaken=id=>clEvb().filter(b=>b.eid===id&&b.status!=="cancelled").reduce((a,b)=>a+(+b.n||0),0);
function clEvRows(){const L=clEvs().slice().sort((a,b)=>(a.date+(a.start||"")).localeCompare(b.date+(b.start||""))),T=today(),up=L.filter(e=>e.date>=T),past=L.filter(e=>e.date<T);
 const row=e=>{const tk=clEvTaken(e.id);return`<div class="evr ${e.date<T?"old":""}"><div class="evt"${e.img?` style="background-image:url('${esc(e.img)}')"`:""}></div><div class="evi"><b>${esc(e.title)}</b><small class="mut">${esc(fmtD(e.date))}${e.start?" \u00b7 "+esc(e.start)+(e.end?" to "+esc(e.end):""):""}${e.hide?" \u00b7 Hidden":""}</small><small>${tk} ${+e.places>0?"of "+e.places+" places":tk===1?"place":"places"} booked</small></div><div class="evx"><button class="btn sm" data-act="evGuests" data-id="${e.id}">Guests</button><button class="btn sm" data-act="evEdit" data-id="${e.id}">Edit</button></div></div>`};
 return(up.length?up.map(row).join(""):`<p class="mut small" style="margin:0">No upcoming events yet.</p>`)+(past.length?`<details class="ghd" style="margin-top:8px"><summary>Past events <small class="mut">${past.length}</small></summary>${past.reverse().map(row).join("")}</details>`:"")}
const clEvDates=e=>{const o=[];if(!/^\d{4}-\d{2}-\d{2}$/.test(e.date||"")||!(e.rep>0))return o;for(let i=0;i<e.rep;i++){const d=new Date(e.date+"T12:00:00");d.setDate(d.getDate()+7*i);o.push(iso(d))}return o};
function clEvRepHtml(e){const wd=/^\d{4}-\d{2}-\d{2}$/.test(e.date||"")?new Date(e.date+"T12:00:00").toLocaleDateString("en-GB",{weekday:"long"}):"week",R=[[0,"Does not repeat"],[4,"Every "+wd+", 4 weeks"],[8,"Every "+wd+", 8 weeks"],[12,"Every "+wd+", 12 weeks"],[26,"Every "+wd+", 26 weeks"],[52,"Every "+wd+", 52 weeks"]];
 return`<label>Repeats<select id="ev-rep">${R.map(x=>`<option value="${x[0]}" ${(+e.rep||0)===x[0]?"selected":""}>${x[1]}</option>`).join("")}</select></label>${e.rep>0?`<p class="mut small" style="margin:0">${e.date?"Each date is its own event with its own places.":"Choose the first date above."} When a day is not on, press Edit on it and tick Hide from guests for now.</p>`:""}`}
function clEvForm(){const e=U.evDraft;if(!e)return;$("#modal").innerHTML=`<div class="sheet evm" role="dialog" aria-modal="true" aria-label="Event"><h2>${e.isNew?"Add an event":"Edit event"}</h2>
 <label>Title<input id="ev-title" maxlength="80" value="${esc(e.title||"")}" placeholder="For example Sip and Paint"></label>
 <div class="evg"><label>Date<input id="ev-date" type="date" min="${today()}" value="${esc(e.date||"")}"></label><label>Starts<input id="ev-start" type="time" value="${esc(e.start||"")}"></label><label>Ends<input id="ev-end" type="time" value="${esc(e.end||"")}"></label></div>
 ${e.isNew?clEvRepHtml(e):""}
 <label>Description<textarea id="ev-desc" rows="3" maxlength="600" placeholder="What happens, what is included">${esc(e.desc||"")}</textarea></label>
 <div class="evg two"><label>Price line<input id="ev-price" maxlength="120" value="${esc(e.price||"")}" placeholder="For example \u00a335 per person"></label><label>Places<input id="ev-places" type="number" inputmode="numeric" min="0" max="2000" value="${+e.places>0?+e.places:""}" placeholder="Empty for no limit"></label></div>
 <div class="evp"><div class="evt"${e.img?` style="background-image:url('${esc(e.img)}')"`:""}>${e.img?"":"No picture"}</div><button class="btn sm" data-act="evPic">${e.img?"Change picture":"Upload picture"}</button>${e.img?`<button class="btn sm" data-act="evPicRm">Remove picture</button>`:""}</div>
 <label class="chk"><input type="checkbox" id="ev-hide" ${e.hide?"checked":""}> Hide from guests for now</label>
 <div class="r">${e.isNew?"":`<button class="btn danger" data-act="evDel" style="margin-right:auto">Remove event</button>`}<button class="btn" data-act="cfno">Cancel</button><button class="btn pri" data-act="evSave">Save</button></div></div>`;$("#modal").hidden=false}
function clEvRead(){const e=U.evDraft,g=id=>{const x=document.getElementById(id);return x?x.value.trim():""};if(!e||!document.getElementById("ev-title"))return;e.title=g("ev-title");e.date=g("ev-date");e.start=g("ev-start");e.end=g("ev-end");e.desc=g("ev-desc");e.price=g("ev-price");e.places=Math.max(0,Math.round(+g("ev-places")||0));e.hide=!!document.getElementById("ev-hide").checked;const rp=document.getElementById("ev-rep");if(rp){e.rep=+rp.value||0;}}
function clEvOk(){if(can("settings"))return true;toast("Manager only");return false}
Object.assign(A,{
 evAdd:()=>{if(!clEvOk())return;U.evDraft={id:uid(),isNew:true,title:"",date:"",start:"",end:"",desc:"",price:"",places:0,img:"",hide:false};clEvForm()},
 evEdit:b=>{if(!clEvOk())return;const e=clEvs().find(x=>x.id===b.dataset.id);if(!e)return;U.evDraft=Object.assign({},e);clEvForm()},
 evPic:()=>{clEvRead();const e=U.evDraft,i=document.createElement("input");i.type="file";i.accept="image/png,image/jpeg,image/webp";i.onchange=async()=>{const f=i.files&&i.files[0];if(!f)return;toast("Uploading\u2026");try{const d=await clPicShrink(f,CL_PIC.header),r=await clPicSend({kind:"ev"+String(e.id).toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,12),data:d});if(!r.url)throw new Error("");clEvRead();e.img=r.url;clEvForm();toast("Picture saved")}catch(x){toast(x&&x.message&&x.message!=="bad"?x.message:"Use a PNG or JPG")}};i.click()},
 evPicRm:()=>{clEvRead();U.evDraft.img="";clEvForm()},
 evSave:()=>{clEvRead();const e=U.evDraft;if(!e.title){toast("Give the event a title");return}if(!/^\d{4}-\d{2}-\d{2}$/.test(e.date)){toast("Choose the date");return}const tk=clEvTaken(e.id);if(e.places>0&&e.places<tk){toast(tk+" places already booked");return}
  const mk=(id,date)=>({id,title:e.title,date,start:e.start,end:e.end,desc:e.desc,price:e.price,places:e.places,img:e.img||"",hide:!!e.hide}),L=clEvs();
  if(e.isNew&&e.rep>0){const ds=clEvDates(e);if(!ds.length){toast("Choose the first date");return}ds.forEach(d=>L.push(mk(uid(),d)));U.evDraft=null;closeM();save();clBookRe();toast(ds.length+" events added");return}
  const o=mk(e.id,e.date),i=L.findIndex(x=>x.id===e.id);if(i>=0)L[i]=o;else L.push(o);U.evDraft=null;closeM();save();clBookRe();toast("Event saved")},
 evDel:()=>{const e=U.evDraft;if(!e)return;const tk=clEvTaken(e.id);ask("Remove "+(e.title||"this event")+"?"+(tk?" "+tk+" booked place"+(tk===1?"":"s")+" will be removed with it. Guests are not told.":"")+" This cannot be undone.","Remove event",()=>{S.events=clEvs().filter(x=>x.id!==e.id);S.evb=clEvb().filter(b=>b.eid!==e.id);U.evDraft=null;save();clBookRe();toast("Event removed")})},
 evGuests:b=>{const e=clEvs().find(x=>x.id===b.dataset.id);if(!e)return;const L=clEvb().filter(x=>x.eid===e.id&&x.status!=="cancelled").sort((a,c)=>(a.at||0)-(c.at||0)),tk=clEvTaken(e.id);
  $("#modal").innerHTML=`<div class="sheet evm" role="dialog" aria-modal="true" aria-label="Guest list"><h2>${esc(e.title)}</h2><p class="mut" style="margin:0 0 8px">${esc(fmtD(e.date))}${e.start?" \u00b7 "+esc(e.start):""} \u00b7 ${tk} ${+e.places>0?"of "+e.places+" places":"places"} booked</p>
  ${L.length?L.map(g=>`<div class="evgl"><b>${g.n}</b><div><b>${esc(g.name)}</b><small class="mut">${esc(g.phone||"")}${g.email?" \u00b7 "+esc(g.email):""}</small>${g.notes?`<small>${esc(g.notes)}</small>`:""}</div><button class="btn sm" data-act="evbDel" data-id="${g.id}" data-eid="${e.id}">Remove</button></div>`).join(""):`<p class="mut">Nobody has booked yet.</p>`}
  <div class="r">${L.length?`<button class="btn" data-act="evCopy" data-id="${e.id}" style="margin-right:auto">Copy list</button>`:""}<button class="btn pri" data-act="cfno">Close</button></div></div>`;$("#modal").hidden=false},
 evbDel:b=>{if(!clEvOk())return;const g=clEvb().find(x=>x.id===b.dataset.id);if(!g)return;ask("Remove "+g.name+" ("+g.n+" place"+(g.n===1?"":"s")+") from this event? The guest is not told. This cannot be undone.","Remove",()=>{S.evb=clEvb().filter(x=>x.id!==g.id);save();clBookRe();toast("Removed from the event")})},
 evCopy:b=>{const e=clEvs().find(x=>x.id===b.dataset.id);if(!e)return;const t=clEvb().filter(x=>x.eid===e.id&&x.status!=="cancelled").map(g=>g.n+" x "+g.name+"  "+(g.phone||"")+"  "+(g.email||"")+(g.notes?"  ("+g.notes+")":"")).join("\n");try{navigator.clipboard.writeText(e.title+", "+fmtD(e.date)+"\n"+t);toast("Guest list copied")}catch(x){toast("Could not copy")}}
});
function clBookRe(){const c=document.getElementById("cl-book");if(!c)return;const ob=c.querySelector(".card.onb");if(ob&&c.parentNode)c.parentNode.insertBefore(ob,c);c.remove();clBookCard()}
/* pictures for the booking page: shrunk in the browser, stored by the res-media service, and only the address is kept in the theme */
const CL_PIC={logo:{w:640,h:320,t:"image/png",q:.92,n:"logo"},header:{w:1600,h:800,t:"image/jpeg",q:.8,n:"header"},bgimg:{w:1800,h:1800,t:"image/jpeg",q:.72,n:"bg"}};
function clPicShrink(file,c){return new Promise((ok,no)=>{const im=new Image(),u=URL.createObjectURL(file);im.onload=()=>{try{const r=Math.min(1,c.w/im.naturalWidth,c.h/im.naturalHeight),w=Math.max(1,Math.round(im.naturalWidth*r)),h=Math.max(1,Math.round(im.naturalHeight*r)),cv=document.createElement("canvas");cv.width=w;cv.height=h;const x=cv.getContext("2d");if(c.t==="image/jpeg"){x.fillStyle="#fff";x.fillRect(0,0,w,h)}x.drawImage(im,0,0,w,h);URL.revokeObjectURL(u);let q=c.q,d=cv.toDataURL(c.t,q);while(d.length>1.1e6&&c.t==="image/jpeg"&&q>.4){q-=.1;d=cv.toDataURL(c.t,q)}ok(d)}catch(e){no(e)}};im.onerror=()=>{URL.revokeObjectURL(u);no(new Error("bad"))};im.src=u})}
async function clPicSend(body){const h=await rsHdr();delete h["x-token"];const r=await fetch(CL.cfg.url+"/functions/v1/res-media",{method:"POST",headers:h,body:JSON.stringify(body)});let j={};try{j=await r.json()}catch(e){}if(!r.ok)throw new Error(j.message||"The picture could not be saved. Please try again.");return j}
function clPicUp(k){if(!can("settings")){toast("Manager only");return}const c=CL_PIC[k];if(!c)return;const i=document.createElement("input");i.type="file";i.accept="image/png,image/jpeg,image/webp";i.onchange=async()=>{const f=i.files&&i.files[0];if(!f)return;toast("Uploading\u2026");try{const d=await clPicShrink(f,c);if(d.length>1.2e6){toast("Picture too large");return}const r=await clPicSend({kind:c.n,data:d});if(!r.url)throw new Error("");clLookSet(k,r.url);toast("Picture saved")}catch(e){toast(e&&e.message&&e.message!=="bad"?e.message:"Use a PNG or JPG")}};i.click()}
async function clPicRm(k){if(!can("settings")){toast("Manager only");return}const c=CL_PIC[k];if(!c)return;clLookSet(k,"");toast("Picture removed");try{await clPicSend({kind:c.n,remove:true})}catch(e){}}
function clLookSet(k,v,keep){if(!can("settings")){toast("Manager only");return}const o=OB();o.look=Object.assign({},CL_LOOK,o.look||{});o.look[k]=v;if(k==="layout"&&v==="wide")o.look.size="l";if(k==="size"&&v!=="l"&&o.look.layout==="wide")o.look.layout="";
 const pv=document.getElementById("cl-bk-pv");if(pv)pv.innerHTML=clLookPrev();if(keep)return;save();clBookRe()}
document.addEventListener("input",e=>{const t=e.target;if(t&&t.dataset&&t.dataset.bkl&&t.type==="color")clLookSet(t.dataset.bkl,t.value,true)});
document.addEventListener("change",e=>{const t=e.target;if(t&&t.dataset&&t.dataset.bkl)clLookSet(t.dataset.bkl,t.value)});
function clBookCard(){if(!CL.site||U.view!=="online")return;const main=$("#main");if(!main||document.getElementById("cl-book"))return;const host=main.querySelector(".sgc")||main;
 const url=clBookUrl(),on=!!OB().on,lab=OB().label||"Book a table";
 const L=clLook(),bc=L.accent||"#3f5fd0",bi=L.accent&&clLum(L.accent)>0.62?"#17171c":"#fff",br=L.corners==="square"?3:L.corners==="pill"?22:10;
 const btn=`<a href="${url}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 22px;border-radius:${br}px;background:${bc};color:${bi};font-family:Arial,sans-serif;font-weight:bold;text-decoration:none">${esc(lab)}</a>`;
 const frame=`<iframe id="pvbook" src="${url}&embed=1" title="${esc(lab)}" style="width:100%;max-width:1040px;height:460px;border:0;display:block;margin:0 auto" loading="lazy"></iframe>\n<script>addEventListener("message",function(e){var f=document.getElementById("pvbook");if(f&&e.source===f.contentWindow&&e.data&&e.data.proviewBookingHeight)f.style.height=e.data.proviewBookingHeight+"px"})<\/script>`;
 const box=(id,v,rows)=>`<div style="display:flex;gap:8px;align-items:flex-start;margin:6px 0 0">${rows?`<textarea id="${id}" readonly rows="${rows}" style="flex:1;min-width:0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px">${esc(v)}</textarea>`:`<input id="${id}" readonly value="${esc(v)}" style="flex:1;min-width:0">`}<button class="btn" data-act="clBkCopy" data-f="${id}">Copy</button></div>`;
 const d=document.createElement("div");d.id="cl-book";d.className="clbk";
 d.innerHTML=`<div class="clc"><div class="card pad"><h2>Your booking link</h2><p class="mut" style="margin-top:0">Guests book from this link. Bookings appear here marked Website.</p>
 ${on?`<p style="margin:0 0 6px;color:var(--ok);font-weight:600">Online booking is on.</p>`:`<p style="margin:0 0 6px;color:var(--warn);font-weight:600">Online booking is off. Switch on "Accept online bookings" below and guests can book from this link.</p>`}
 ${box("cl-bk-u",url)}<div class="bar" style="margin:10px 0 0"><a class="btn pri" style="text-decoration:none" href="${url}" target="_blank" rel="noopener">Open the booking page</a></div></div>
 <div class="card pad"><h2>Add it to Google</h2><ol class="mut" style="margin:0;padding-left:20px"><li>Sign in to the Google account that manages your Business Profile and search for your business name.</li><li>Choose <b>Bookings</b> (on some profiles: Edit profile, then Bookings or Reservations).</li><li>Choose <b>Links to your online booking tools</b>, then <b>Add a link</b>.</li><li>Paste your booking link and save. Google shows it on Search and Maps, usually within a few minutes.</li></ol></div>
 <div class="card pad"><h2>Add it to your website</h2><p class="mut" style="margin:0">A button that opens your booking page. Paste this where the button should be:</p>${box("cl-bk-b",btn,3)}
 <p class="mut" style="margin:12px 0 0">Or show the booking form inside your own page:</p>${box("cl-bk-f",frame,3)}
 <p class="mut small" style="margin:10px 0 0">The link also works in Instagram and Facebook profiles, emails and on a QR code.</p></div>
 <div class="card pad"><h2>Events</h2><p class="mut" style="margin-top:0">Events show in an Events tab on your booking page. Guests book places; payment is not taken online.</p>
 ${clEvRows()}<div class="bar" style="margin:10px 0 0"><button class="btn pri" data-act="evAdd">Add an event</button></div></div></div>
 <div class="clc"><div class="card pad"><h2>Edit theme</h2><p class="mut" style="margin:0 0 8px">Changes show on your booking page straight away.</p>
 <div class="g2"><label class="of"><span class="ot">Template</span><select data-bkl="style"><option value="" ${L.style!=="elegant"?"selected":""}>Standard</option><option value="elegant" ${L.style==="elegant"?"selected":""}>Elegant</option><option value="show" ${L.style==="show"?"selected":""}>Showcase</option></select></label></div>
 <div class="g2"><label class="of"><span class="ot">Layout on your website</span><select data-bkl="layout"><option value="" ${!L.layout?"selected":""}>Automatic</option><option value="stack" ${L.layout==="stack"?"selected":""}>Stacked</option><option value="wide" ${L.layout==="wide"?"selected":""}>Wide</option></select></label>
 <label class="of"><span class="ot">Size on your website</span><select data-bkl="size"><option value="s" ${L.size==="s"?"selected":""}>Small</option><option value="" ${!L.size?"selected":""}>Medium</option><option value="l" ${L.size==="l"?"selected":""}>Large</option></select></label></div>
 <p class="mut small" style="margin:-2px 0 8px">For the form inside your own website. Phones always get Stacked.</p>
 <label class="of"><span class="ot">Background photo on a Large or Wide form</span><select data-bkl="bgl"><option value="" ${L.bgl!=="off"?"selected":""}>Show it</option><option value="off" ${L.bgl==="off"?"selected":""}>Hide it</option></select></label>
 <div class="g2"><label class="of"><span class="ot">Theme</span><select data-bkl="mode"><option value="light" ${L.mode!=="dark"?"selected":""}>Light</option><option value="dark" ${L.mode==="dark"?"selected":""}>Dark</option></select></label>
 <label class="of"><span class="ot">Corners</span><select data-bkl="corners"><option value="round" ${L.corners==="round"?"selected":""}>Rounded</option><option value="square" ${L.corners==="square"?"selected":""}>Square</option><option value="pill" ${L.corners==="pill"?"selected":""}>Very round</option></select></label></div>
 <div class="g2"><label class="of"><span class="ot">Button colour</span><input type="color" data-bkl="accent" value="${L.accent||"#3f6fc8"}" style="height:44px;padding:4px"><small class="mut">${L.accent?"Your colour "+esc(L.accent):"Proview blue (standard)"}</small></label>
 <label class="of"><span class="ot">Page background</span><input type="color" data-bkl="bg" value="${L.bg||(L.mode==="dark"?"#0e0e11":"#f4f3ef")}" style="height:44px;padding:4px"><small class="mut">${L.bg?"Your colour "+esc(L.bg):"Standard for the theme"}. Inside your own website the page behind shows through.</small></label></div>
 <div class="clpx fold${FO.pic?" open":""}"><span class="ot fh" data-act="fold" data-k="pic" role="button" tabindex="0">Your pictures</span><p class="mut small" style="margin:2px 0 8px">Shown on your booking link. Inside your own website only the logo shows.</p>
 ${[["logo","Logo","Replaces your name at the top. A PNG with a see-through background looks best."],["header","Header photo","A wide photo of your venue across the top."],["bgimg","Background photo","Fills the page behind the booking form."]].map(x=>`<div class="clpr"><div class="clpt ${x[0]}"${L[x[0]]?` style="background-image:url('${esc(L[x[0]])}')"`:""}>${L[x[0]]?"":"None"}</div><div class="clpi"><b>${x[1]}</b><small class="mut">${x[2]}</small></div><div class="clpb"><button class="btn sm pri" data-act="clPicUp" data-k="${x[0]}">${L[x[0]]?"Change":"Upload"}</button>${L[x[0]]?`<button class="btn sm" data-act="clPicRm" data-k="${x[0]}">Remove</button>`:""}</div></div>`).join("")}</div>
 <div class="clpx fold${FO.abt?" open":""}"><span class="ot fh" data-act="fold" data-k="abt" role="button" tabindex="0">About your venue</span><p class="mut small" style="margin:2px 0 8px">Shown with the Showcase template. Leave a box empty to leave it out.</p>
 <label class="of"><span class="ot">Menu link</span><input data-bkl="menu" maxlength="300" inputmode="url" value="${esc(L.menu||"")}" placeholder="https://yourwebsite.com/menu"></label>
 <label class="of"><span class="ot">Address</span><input data-bkl="addr" maxlength="160" value="${esc(L.addr||"")}" placeholder="For example 12 High Street, London N16 9PX"></label>
 <label class="of"><span class="ot">About text</span><textarea data-bkl="about" rows="3" maxlength="700" placeholder="A few lines about your venue">${esc(L.about||"")}</textarea></label>
 <label class="of"><span class="ot">Policies guests must accept (optional)</span><textarea data-bkl="policy" rows="6" maxlength="1500" placeholder="Write one policy per line, for example:
A \u00a310 per person fee applies to cancellations within 24 hours.
Smart casual dress code.
Tables are held for 15 minutes.">${esc(L.policy||"")}</textarea></label>
 <label class="of"><span class="ot">Tick box wording</span><input data-bkl="policyTick" maxlength="120" value="${esc(L.policyTick||"")}" placeholder="I have read and agree to these policies"></label>
 <div class="g2"><label class="of"><span class="ot">"Alert me if a table comes free" button</span><select data-bkl="alert"><option value="" ${L.alert!=="on"?"selected":""}>Hide</option><option value="on" ${L.alert==="on"?"selected":""}>Show</option></select></label></div>
 <div class="g2"><label class="of"><span class="ot">Map at the bottom of your booking link</span><select data-bkl="map"><option value="" ${L.map!=="off"?"selected":""}>Show</option><option value="off" ${L.map==="off"?"selected":""}>Hide</option></select></label></div></div>
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
 clPicUp:b=>clPicUp(b.dataset.k),clPicRm:b=>clPicRm(b.dataset.k),
 clBkReset:()=>{if(!can("settings")){toast("Manager only");return}const o=OB(),k=o.look||{};delete o.look;if(k.logo||k.header||k.bgimg||k.addr||k.about||k.map||k.menu||k.alert)o.look=Object.assign({},CL_LOOK,{menu:k.menu||"",alert:k.alert||"",logo:k.logo||"",header:k.header||"",bgimg:k.bgimg||"",addr:k.addr||"",about:k.about||"",map:k.map||""});save();clBookRe();toast("Back to the Proview colours")},
 clMsgTest:async()=>{if(!can("settings")){toast("Staff cannot change this. Ask a manager to sign in.");return}const M=clMsg(),i=document.getElementById("cl-msg-to"),to=i?i.value.trim():"";if(CL.msgBusy)return;if(to.replace(/\D/g,"").length<9){toast("Enter your mobile number first");if(i)i.focus();return}
  CL.msgTo=to;CL.msgBusy=true;clMsgRedraw();
  try{CL.msgT=await rsFetch("api/msgtest",{method:"POST",body:JSON.stringify({to,wa:M.wa,sms:M.sms})})}
  catch(e){CL.msgT={to,message:(e.body&&e.body.message)||"The test could not be sent. Check the internet and try again."}}
  CL.msgBusy=false;clMsgRedraw()},
 clMailTest:async()=>{if(!can("settings")){toast("Staff cannot change this. Ask a manager to sign in.");return}const a=clMail().addr;if(!a||CL.mailBusy)return;CL.mailBusy=true;clMailRedraw();
  try{const r=await rsFetch("api/mailtest",{method:"POST",body:JSON.stringify({addr:a})});CL.mailT=Object.assign({to:a},r);toast(r.ok?"Test email sent to "+a:(r.message||"The test email could not be sent"))}
  catch(e){CL.mailT={to:a,via:"",message:(e.body&&e.body.message)||"The test email could not be sent. Check the internet and try again."};toast(CL.mailT.message)}
  CL.mailBusy=false;clMailRedraw()},
 clKeepNow:()=>{if(!can("settings")){toast("Staff cannot change this. Ask a manager to sign in.");return}const n=clKeepList().length;if(!n)return;ask("Remove the details of "+n+" guest"+(n===1?"":"s")+" past your keeping period? This cannot be undone.","Remove details",()=>{const c=clKeepRun();render();toast("Details removed for "+c+" guest"+(c===1?"":"s"))})},
 clBkCopy:b=>{const f=document.getElementById(b.dataset.f);if(!f)return;f.focus();f.select();let ok=false;try{ok=document.execCommand("copy")}catch(e){}const bad=()=>toast("Selected: press Cmd+C");if(ok){toast("Copied");return}try{navigator.clipboard.writeText(f.value).then(()=>toast("Copied"),bad)}catch(e){bad()}},
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
  try{if(CL.base&&clBoss()&&(+S.venue.keep||0)>=6)setTimeout(()=>{try{if(clKeepRun())render()}catch(e){console.error(e)}},4000)}catch(e){}
  document.title=(S.venue&&S.venue.name?S.venue.name+" · ":"")+"Proview Reservations";
 }catch(e){if(CL.kicked)return;console.error(e);clScreen("fail",{err:"Could not load the data. Check the internet and try again."})}}
