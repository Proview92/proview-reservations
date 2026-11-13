
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
function clRoot(){let r=document.getElementById("cl-root");if(!r){r=document.createElement("div");r.id="cl-root";r.style.cssText="position:fixed;inset:0;z-index:200;background:var(--bg);color:var(--ink);overflow:auto;padding:32px 16px;display:grid;gap:16px;align-content:start;justify-items:center";document.body.appendChild(r)}return r}
function clHide(){const r=document.getElementById("cl-root");if(r)r.remove()}
function clShow(){const r=clRoot(),m=CL.scr,em=esc(CL.email||"");let b="";
 const msg=(CL.err?`<p style="margin:0;color:var(--bad)">${esc(CL.err)}</p>`:"")+(CL.note?`<p class="mut" style="margin:0">${esc(CL.note)}</p>`:""),dis=CL.busy?"disabled":"";
 const box=h=>`<div class="card" style="width:min(360px,100%);padding:22px 18px;display:grid;gap:12px;text-align:center">${h}</div>`,bt=(act,t,pri,extra)=>`<button class="btn${pri?" pri":""}" style="justify-content:center;min-height:42px" data-act="${act}" ${extra||""}>${t}</button>`;
 const out=bt("clOut","Sign out");
 if(m==="wait")b=`<p class="mut">${esc(CL.note||"Loading...")}</p>`;
 else if(m==="in")b=box(`<h2 style="margin:0">Sign in</h2><input id="clem" type="email" autocomplete="username" placeholder="Email" value="${em}"><input id="clpw" type="password" autocomplete="current-password" placeholder="Password">${msg}${bt("clIn","Sign in",1,dis)}${CL.cfg.sso?bt("clSso","Sign in with Proview account"):""}${bt("clScr","First time? Create your account",0,'data-s="up"')}${bt("clScr","Forgot password",0,'data-s="reset"')}`);
 else if(m==="up")b=box(`<h2 style="margin:0">Create your account</h2><p class="mut" style="margin:0">Use the email your manager added for you, or your own if you are setting up a new business.</p><input id="clem" type="email" autocomplete="username" placeholder="Email" value="${em}"><input id="clpw" type="password" autocomplete="new-password" placeholder="Choose a password (6 or more characters)">${msg}${bt("clUp","Create account",1,dis)}${bt("clScr","Back to sign in",0,'data-s="in"')}`);
 else if(m==="reset")b=box(`<h2 style="margin:0">Forgot password</h2><p class="mut" style="margin:0">We will email you a link to choose a new one.</p><input id="clem" type="email" autocomplete="username" placeholder="Email" value="${em}">${msg}${bt("clReset","Send the link",1,dis)}${bt("clScr","Back to sign in",0,'data-s="in"')}`);
 else if(m==="newpw")b=box(`<h2 style="margin:0">Choose a new password</h2><input id="clpw" type="password" autocomplete="new-password" placeholder="New password (6 or more characters)">${msg}${bt("clNewPw","Save and continue",1,dis)}`);
 else if(m==="setup")b=box(`<h2 style="margin:0">Set up your business</h2><p class="mut" style="margin:0">Signed in as ${esc(CL.who.email)}. This login is not part of a business yet.</p><p class="mut" style="margin:0">Staff: ask your manager to add this email under Settings, Logins, then press Check again.</p><input id="clbn" type="text" maxlength="80" placeholder="Business name">${msg}${bt("clMake","Create my business",1,dis)}${bt("clAgain","Check again")}${out}`);
 else if(m==="empty")b=box(`<h2 style="margin:0">No businesses yet</h2><p class="mut" style="margin:0">Add the first one in the licence portal (New business).</p><a class="btn pri" style="justify-content:center;min-height:42px;display:inline-flex;align-items:center" href="${CL_PORTAL}" target="_blank" rel="noopener">Open the licence portal</a>${bt("clAgain","Check again")}${out}`);
 else if(m==="pick"){const ss=CL.who.sites||[];b=`<p class="mut" style="margin:0">Which business?</p><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;width:min(900px,100%)">${ss.map(s=>`<button class="card" style="padding:14px;text-align:left;cursor:pointer;color:inherit;font:inherit" data-act="clPick" data-id="${esc(s.id)}"><b>${esc(s.name)}</b><br><span class="mut small">${esc(s.business&&s.business!==s.name?s.business+" · ":"")}${s.ok?esc(s.role||""):esc(clLic(s))}</span></button>`).join("")}</div>${out}`}
 else if(m==="lock"){const s=CL.locked;b=box(`<h2 style="margin:0">${esc(s.name)}</h2><p style="margin:0;color:var(--bad)">${esc(clLic(s))}</p><p class="mut" style="margin:0">${s.suspended?"Call Proview on "+CL_PHONE+".":"Buy or renew a licence in the licence portal, or call Proview on "+CL_PHONE+"."}</p>${s.suspended?"":`<a class="btn pri" style="justify-content:center;min-height:42px;display:inline-flex;align-items:center" href="${CL_PORTAL}" target="_blank" rel="noopener">Open the licence portal</a>`}${bt("clAgain","Check again")}${(CL.who.sites||[]).length>1?bt("clScr","Another business",0,'data-s="pick"'):""}${out}`)}
 else if(m==="fail")b=box(`<h2 style="margin:0">Cannot connect</h2><p class="mut" style="margin:0">${esc(CL.err||"Check the internet and try again.")}</p>${bt("clReload","Try again",1)}${CL.who?out:""}`);
 r.innerHTML=`<div style="display:flex;align-items:center;gap:10px;font-weight:700;font-size:18px"><span style="width:36px;height:36px;border-radius:10px;background:var(--pri);color:var(--onpri,#fff);display:grid;place-items:center">P</span><span>Proview <i style="font-style:normal;color:var(--mut);font-weight:600">Reservations</i></span></div>${b}`;
 const f=$("#clem")&&!$("#clem").value?$("#clem"):($("#clpw")||$("#clbn")||$("#clem"));if(f)setTimeout(()=>{try{f.focus()}catch(e){}},50);
 r.querySelectorAll("input").forEach(i=>i.addEventListener("keydown",e=>{if(e.key==="Enter"){const k={in:"clIn",up:"clUp",reset:"clReset",newpw:"clNewPw",setup:"clMake"}[CL.scr];if(k)A[k]()}}))}
function clScreen(s,o){CL.scr=s;CL.err=(o&&o.err)||"";CL.note=(o&&o.note)||"";CL.busy=false;clShow()}
function clVals(){const e=$("#clem"),p=$("#clpw");if(e)CL.email=e.value.trim().toLowerCase();return{email:CL.email,pw:p?p.value:""}}
async function clTry(fn){if(CL.busy)return;CL.busy=true;CL.err="";try{await fn()}catch(e){CL.busy=false;CL.err=clErr(e);clShow()}}
Object.assign(A,{
 clScr:b=>{clVals();clScreen(b.dataset.s)},
 clReload:()=>location.reload(),
 clIn:()=>clTry(async()=>{const v=clVals();if(!v.email||!v.pw)throw new Error("Enter your email and password.");const r=await CL.sb.auth.signInWithPassword({email:v.email,password:v.pw});if(r.error)throw r.error;await clAfter()}),
 clUp:()=>clTry(async()=>{const v=clVals();if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email))throw new Error("Enter a valid email address.");if(v.pw.length<6)throw new Error("The password needs at least 6 characters.");
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
function rsRemote(list){list.forEach(ops=>rsApply(ops,S,RS.snap));snapInit();try{localStorage.setItem(SKEY(),JSON.stringify(S))}catch(e){}RS.pend=true;rsRender()}
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
 A.mgrin=b=>{if(!CL.site||CL.base)return mgrin0(b);if(S.mgrPin)return mgrModal("Manager sign in","","mgrok",false);toast("No manager PIN yet. The owner or a manager sets it from their own login.")};
 A.mgrok=async b=>{if(!CL.site||CL.base)return mgrok0(b);if(CL.unl)return;const pin=$("#m-pin").value.trim();if(!pin)return;CL.unl=true;
  try{await rsFlush();const r=await fetch(rsUrl("api/unlock"),{method:"POST",headers:await rsHdr(),body:JSON.stringify({pin})});const j=await r.json().catch(()=>({}));
   if(r.status===200&&j.token){CL.tok=j.token;await rsResync(true);mgrOn()}
   else if(r.status===429)toast("Too many tries. Wait ten minutes.");
   else if(r.status===401&&j.error==="pin"){toast("That PIN is not right");$("#m-pin").value=""}
   else if(j.error==="nopin")toast("No manager PIN yet. The owner or a manager sets it from their own login.");
   else toast("Could not check the PIN. Check the internet.")}
  catch(e){toast("Could not check the PIN. Check the internet.")}finally{CL.unl=false}};
 A.mgrout=b=>{mgrout0(b);if(CL.tok)clRelock()}}

/* ---------- Settings: who is signed in, and the logins of this business ---------- */
const clBoss=()=>!!CL.site&&(CL.who.is_master||CL.site.role==="Owner"||CL.site.role==="Admin");
async function clMembers(){try{const r=await CL.sb.rpc("pr_list_members",{p_business:CL.site.business_id});if(r.error)throw r.error;CL.mem=r.data.members||[];CL.memErr=""}catch(e){CL.mem=CL.mem||[];CL.memErr=clErr(e)}if(U.view==="settings"&&rsIdle())render()}
function clSettings(){if(!CL.site||U.view!=="settings")return;const main=$("#main");if(!main||document.getElementById("cl-set"))return;
 const many=(CL.who.sites||[]).length>1;let h=`<div class="card pad"><h2>Account</h2><p class="mut" style="margin-top:0">Signed in as <b>${esc(CL.who.email)}</b> · ${esc(CL.site.name)} · ${esc(CL.who.is_master?"Proview":CL.site.role||"")}. ${CL.base?"This login sees everything.":"This is a staff login: pay rates and sales figures stay on the server until a manager enters the PIN."}</p><div class="bar" style="margin:0">${many?`<button class="btn" data-act="clSwitch">Switch business</button>`:""}<button class="btn" data-act="clOut">Sign out</button></div></div>`;
 if(clBoss()){if(!CL.mem){CL.mem=[];clMembers()}
  h+=`<div class="card pad"><h2>Logins</h2><p class="mut" style="margin-top:0">Each person signs in with their own email. <b>Manager</b>, Admin and Owner logins see everything. A <b>Staff</b> login (good for a shared tablet) never receives pay rates or sales figures unless the manager PIN is entered.</p>${CL.memErr?`<p style="color:var(--bad)">${esc(CL.memErr)}</p>`:""}
  ${(CL.mem||[]).map(m=>`<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px solid var(--line)"><div style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis"><b>${esc(m.email)}</b><br><span class="mut small">${esc(m.role)}${m.joined?"":" · has not signed in yet"}${m.me?" · you":""}</span></div>${m.me||(m.role==="Owner"&&CL.site.role==="Admin")?"":`<button class="btn" data-act="clMemDel" data-e="${esc(m.email)}">Remove</button>`}</div>`).join("")}
  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;border-top:1px solid var(--line);padding-top:10px;margin-top:4px"><input id="cl-me" type="email" placeholder="Email of the new login" style="flex:2 1 200px"><select id="cl-mr" style="flex:1 1 110px"><option>Staff</option><option>Manager</option><option>Admin</option></select><button class="btn pri" data-act="clMemAdd">Add login</button></div>
  <p class="mut small" style="margin-bottom:0">They then open this page and choose "First time? Create your account" with that email.</p></div>`}
 const d=document.createElement("div");d.id="cl-set";d.innerHTML=h;main.appendChild(d)}
Object.assign(A,{
 clMemAdd:async()=>{const e=(($("#cl-me")||{}).value||"").trim().toLowerCase(),role=($("#cl-mr")||{}).value||"Staff";if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)){toast("Enter a valid email address");return}
  const r=await CL.sb.rpc("pr_save_member",{p_business:CL.site.business_id,p_email:e,p_role:role});if(r.error){toast(clErr(r.error));return}toast("Login added");await clMembers();render()},
 clMemDel:b=>ask("Remove the login "+b.dataset.e+"?","Remove",async()=>{const r=await CL.sb.rpc("pr_remove_member",{p_business:CL.site.business_id,p_email:b.dataset.e});if(r.error){toast(clErr(r.error));return}toast("Login removed");await clMembers();render()})
});

/* ---------- start ---------- */
async function cloudStart(){
 if(!/^https?:$/.test(location.protocol)){BOOT();return}
 // nothing is shown, and nothing saved, until we know whether this site uses the cloud
 CLK=KEY+"-gate";S={parties:[],tables:[],staff:[],punches:[],waiting:[],ts:{},gnotes:{},hist:{},venue:{},deco:[],rooms:[]};RS.hold=true;
 try{S=blankState("")}catch(e){}
 const veil=clRoot();veil.innerHTML="";
 const cfg=await clCfg();
 if(!cfg){CLK="";RS.hold=false;clHide();BOOT();return}
 const site=await cloudGate(cfg);
 CLK="proview-res-"+site.id;
 try{
  const p=await rsFetch("api/ping");CL.base=!!p.full;
  if(!p.hasState){
   if(!(p.master||p.role==="Owner"||p.role==="Admin")){clScreen("fail",{err:"This business has not been set up yet. Ask the owner to sign in first."});return}
   await rsFetch("api/init",{method:"POST",body:JSON.stringify({state:blankState(site.name)})},30000)}
  const j=await rsFetch("api/state");
  rsAdopt(j.state,j.rev);
  // hook saving: every save() also sends the changes
  const save0=save;save=function(){save0();rsMark()};
  const render0=render;render=function(){render0();try{clSettings()}catch(e){console.error(e)}};
  RS.on=true;RS.hold=false;clHide();
  autoRun();render();setBtn();rsTimers();rsDot();
  document.title=(S.venue&&S.venue.name?S.venue.name+" · ":"")+"Proview Reservations";
 }catch(e){if(CL.kicked)return;console.error(e);clScreen("fail",{err:"Could not load the data. Check the internet and try again."})}}
