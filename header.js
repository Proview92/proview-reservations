/* ===================== Top-right header group, the same in every Proview app =====================
   (HEADER_BAR_STANDARD.md; copied from Proview Bookings topMe() and Proview Signage web/hub.js PVHub.accountMenu)
   - "Dashboard" button: back to dashboard.proviewcrm.co.uk. Cloud mode, for the Proview master, Owners and Admins (as Signage).
   - Blue avatar with the initials of whoever is signed in: opens the account menu (Signed in as <email>, Account, Sign out).
   - Red sign-out button: signs out straight away (clOut in cloud.js). Hidden when the app runs on this device only (no cloud.json).
   It is added after every render(), which rebuilds #top. */
const PVACCT_SVG={refresh:'<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',swap:'<path d="M4 21V5l8-2v18M12 9h8v12M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2"/>',help:'<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'};
let pvAcct=null;
function pvCloseAccount(){if(!pvAcct)return;pvAcct.el.remove();pvAcct.btn.setAttribute("aria-expanded","false");document.removeEventListener("mousedown",pvAcct.out,true);document.removeEventListener("keydown",pvAcct.key,true);removeEventListener("hashchange",pvCloseAccount);pvAcct=null}
function pvAccountMenu(btn,o){if(pvAcct){const was=pvAcct.btn;pvCloseAccount();if(was===btn||was.isConnected===false&&btn.classList.contains("top-av"))return}
 const m=document.createElement("div");m.className="pv-acct";m.setAttribute("role","menu");m.setAttribute("aria-label","My account");
 m.innerHTML=`<div class="pv-acct-h"><span class="hub-av">${esc(o.initials||"?")}</span><span class="ct"><b>${esc(o.name||"")}</b>${o.email?`<small>${esc(o.email)}</small>`:""}${o.sub?`<small>${esc(o.sub)}</small>`:""}</span></div>`;
 (o.items||[]).forEach(it=>{if(it.sep){const d=document.createElement("div");d.className="pv-acct-sep";m.appendChild(d)}
  const el=document.createElement(it.href?"a":"button");el.className="pv-acct-i";el.setAttribute("role","menuitem");if(it.href)el.href=it.href;else el.type="button";
  el.innerHTML=`<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${PVACCT_SVG[it.icon]||""}</svg><span>${esc(it.label)}</span>`;
  el.addEventListener("click",e=>{pvCloseAccount();if(it.run){e.preventDefault();it.run()}});m.appendChild(el)});
 document.body.appendChild(m);const r=btn.getBoundingClientRect();m.style.top=Math.round(r.bottom+8)+"px";m.style.right=Math.max(8,Math.round(innerWidth-r.right))+"px";
 const items=()=>[...m.querySelectorAll(".pv-acct-i")];
 pvAcct={el:m,btn,out:e=>{if(!m.contains(e.target)&&!btn.contains(e.target)&&!(e.target.closest&&e.target.closest(".top-av")))pvCloseAccount()},
  key:e=>{if(e.key==="Escape"){e.stopPropagation();pvCloseAccount();(btn.isConnected?btn:document.querySelector("#top .top-av"))?.focus();return}
   if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();const l=items(),i=l.indexOf(document.activeElement);l[(i+(e.key==="ArrowDown"?1:-1)+l.length)%l.length]?.focus()}}};
 btn.setAttribute("aria-expanded","true");document.addEventListener("mousedown",pvAcct.out,true);document.addEventListener("keydown",pvAcct.key,true);addEventListener("hashchange",pvCloseAccount);
 if(o.focusFirst)items()[0]?.focus()}
const hdrCloud=()=>!!(CL.site&&CL.who);
// "Dashboard": the Proview master, owners and admins only (as Proview Signage and Bookings)
const hdrCanDash=()=>hdrCloud()&&!!(CL.who.is_master||CL.site.role==="Admin");
function hdrWho(){if(hdrCloud()){const email=CL.who.email||(CL.user&&CL.user.email)||"";
  const name=email.split("@")[0].split(/[._-]+/).filter(Boolean).map(w=>w[0].toUpperCase()+w.slice(1)).join(" ")||"Me";
  return{name,email,sub:(CL.who.is_master?"Proview":CL.site.role||"Staff")+" · "+(CL.site.name||"")}}
 const v=((S&&S.venue&&S.venue.name)||"Proview").trim()||"Proview";return{name:v,email:"",sub:"On this device only"}}
const hdrIni=n=>String(n).replace(/[^\p{L}\p{N}\s._-]/gu," ").split(/[\s._-]+/).filter(Boolean).map(w=>w[0]).slice(0,2).join("").toUpperCase()||"?";
function hdrAccount(){A.nav({dataset:{v:navOk("users")?"users":"settings"}})}
function topMe(){const t=document.getElementById("top");if(!t)return;t.querySelectorAll(":scope>.pv-dash,:scope>.top-me,:scope>.hdr-br").forEach(e=>e.remove());
 const w=hdrWho(),ini=hdrIni(w.name),cloud=hdrCloud();
 const br=document.createElement("span");br.className="hdr-br";br.setAttribute("aria-hidden","true");t.appendChild(br);
 if(hdrCanDash()){const d=document.createElement("a");d.className="pv-dash";d.href="https://dashboard.proviewcrm.co.uk/";d.title="Proview dashboard: all your Proview apps";d.setAttribute("aria-label","Proview dashboard");d.innerHTML='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg><span>Dashboard</span>';t.appendChild(d)}
 const me=document.createElement("div");me.className="top-me";
 me.innerHTML=`<button type="button" class="top-av" title="${esc(w.name+(w.sub?" · "+w.sub:""))}" aria-label="My account" aria-haspopup="menu" aria-expanded="${pvAcct&&pvAcct.el.isConnected?"true":"false"}">${esc(ini)}</button>`;
 me.querySelector(".top-av").onclick=e=>{e.stopPropagation();const items=[];
  if(cloud?navOk("users"):navOk("settings"))items.push({label:cloud?"Users":"Settings",icon:"user",run:hdrAccount});
  if(cloud&&(CL.who.sites||[]).length>1)items.push({label:"Switch business",icon:"swap",run:()=>A.clSwitch()});
  items.push({label:"Refresh",icon:"refresh",run:()=>pvReload()});
  items.push({label:isDark()?"Light mode":"Dark mode",icon:isDark()?"sun":"moon",run:()=>A.theme()});
  if(cloud)items.push({label:"Sign out",icon:"logout",run:()=>A.clOut(),sep:items.length>0});
  pvAccountMenu(e.currentTarget,{initials:ini,name:w.name,email:w.email?"Signed in as "+w.email:"",sub:w.sub,focusFirst:e.detail===0,items})};
 t.appendChild(me)}
{const r0=render;render=function(){const r=r0.apply(this,arguments);try{topMe()}catch(e){console.error(e)}return r}}

/* ---- Refresh and new-version check. A home-screen app has no browser refresh button, so the app offers its own.
   Every few minutes, and whenever the app comes back to the front, it asks the server whether index.html has changed.
   If it has: reload straight away when the app has just been reopened and nothing is open, otherwise show a Refresh bar. ---- */
function pvReload(){try{const u=new URL(location.href);u.searchParams.set("r",Date.now().toString(36));location.replace(u.toString())}catch(e){location.reload()}}
const PVUPD={tag:null,ready:false,busy:false};
function pvIdle(){const m=document.getElementById("modal"),a=document.activeElement;return(!m||m.hidden)&&!(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))}
function pvUpdBar(){if(document.getElementById("pvupd"))return;const d=document.createElement("div");d.id="pvupd";d.setAttribute("role","status");d.innerHTML='<span>A new version is ready</span><button type="button">Refresh</button>';d.querySelector("button").addEventListener("click",pvReload);document.body.appendChild(d)}
async function pvUpdCheck(front){if(PVUPD.busy||!/^https?:/.test(location.protocol))return;PVUPD.busy=true;
 try{const r=await fetch(location.pathname,{method:"HEAD",cache:"no-store"}),t=r.ok?(r.headers.get("etag")||r.headers.get("last-modified")||""):"";
  if(t){if(PVUPD.tag===null)PVUPD.tag=t;else if(t!==PVUPD.tag)PVUPD.ready=true}}catch(e){}
 PVUPD.busy=false;if(PVUPD.ready){if(front&&pvIdle())pvReload();else pvUpdBar()}}
setTimeout(()=>pvUpdCheck(false),4000);setInterval(()=>pvUpdCheck(false),240000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)pvUpdCheck(true)});

/* ---- Pull down to refresh, on touch screens. Works when the page is scrolled to the top. Not on the floor plan or inside pop-ups, which have their own gestures. ---- */
(function(){let y0=null,x0=0,pull=0,on=false,el=null;const MAX=110,GO=70;
 const ind=()=>{if(!el){el=document.createElement("div");el.id="pvptr";el.setAttribute("aria-hidden","true");el.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>';document.body.appendChild(el)}return el};
 const atTop=t=>{for(let n=t;n&&n!==document.documentElement;n=n.parentElement){if(n.scrollTop>0)return false}const m=document.getElementById("main");return(!m||m.scrollTop<=0)&&(document.scrollingElement||document.documentElement).scrollTop<=0};
 const skip=t=>!t||!t.closest||!!t.closest("#modal,.plan,.cin,input,textarea,select,.fpbig,[role=menu]");
 document.addEventListener("touchstart",e=>{y0=null;on=false;if(e.touches.length!==1||PVUPD.going)return;const t=e.target;if(skip(t)||!atTop(t))return;y0=e.touches[0].clientY;x0=e.touches[0].clientX},{passive:true});
 document.addEventListener("touchmove",e=>{if(y0===null||e.touches.length!==1)return;const dy=e.touches[0].clientY-y0,dx=e.touches[0].clientX-x0;
  if(!on){if(dy<8||Math.abs(dx)>Math.abs(dy)){if(dy<-4||Math.abs(dx)>12)y0=null;return}on=true}
  if(e.cancelable)e.preventDefault();pull=Math.min(MAX,dy*.5);const i=ind();i.style.transition="none";i.style.transform="translate(-50%,"+(pull-50)+"px) rotate("+(pull*3)+"deg)";i.style.opacity=Math.min(1,pull/40);i.classList.toggle("go",pull>=GO)},{passive:false});
 const end=()=>{if(!on){y0=null;return}on=false;y0=null;const i=ind();i.style.transition="transform .2s,opacity .2s";if(pull>=GO){PVUPD.going=true;i.classList.add("spin");i.style.transform="translate(-50%,24px)";setTimeout(pvReload,350)}else{i.style.transform="translate(-50%,-50px)";i.style.opacity=0}pull=0};
 document.addEventListener("touchend",end);document.addEventListener("touchcancel",end)})();
