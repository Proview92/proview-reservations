# Builds index.html from app.src.html (the app exactly as exported, v222) plus cloud.js (sign-in and shared data).
# Run: python3 build.py
import os
here=os.path.dirname(os.path.abspath(__file__))
s=open(os.path.join(here,'app.src.html')).read()
def once(a,b,n=1):
    global s
    assert s.count(a)==n,(a[:60],s.count(a)); s=s.replace(a,b)
# 1. the product name
s=s.replace('Proview Bookings','Proview Reservations').replace('Proview <i>Bookings</i>','Proview <i>Reservations</i>')
# 1b. the side-menu label and the browser tab say Reservations too (they are built from the venue name)
once('if(b)b.innerHTML=esc(n)+" <i>Bookings</i>";','if(b)b.innerHTML=esc(n)+" <i>Reservations</i>";')
once('document.title=n+" bookings"}','document.title=n+" reservations"}')
# 1c. the menu logo matches the other Proview sites: the PV mark and a PROVIEW RESERVATIONS wordmark
import base64
logo='data:image/png;base64,'+base64.b64encode(open(os.path.join(here,'proview-logo.png'),'rb').read()).decode()
once('<span class="mono" id="bmono">P</span><span class="bname" id="bname">Proview <i>Reservations</i></span>','<span class="pvlogo" role="img" aria-label="Proview logo"></span><span class="bname pvword">PROVIEW<i>RESERVATIONS</i></span>')
css='.pvlogo{display:block;float:left;width:36px;height:26px;margin:1px 9px 0 0;flex:none;background:url('+logo+') center/contain no-repeat}'\
 '.pvword{font-size:12px;font-weight:500;letter-spacing:.04em;line-height:1.2;color:#fff;max-width:none}'\
 '.pvword i,.brand .pvword i{display:block;font-style:normal;background:linear-gradient(90deg,#62b0ec 0%,#8b88dc 100%);-webkit-background-clip:text;background-clip:text;color:transparent}'\
 '.brand{overflow:hidden}'
i=s_i=s.index('</style>'); s=s[:i]+css+s[i:]
# 2. the saved data lives under a per-business key in cloud mode (display preferences stay per device)
once('KEY="proview-bookings-v1",APPV="v222";','KEY="proview-bookings-v1",APPV="v222";let CLK="";const SKEY=()=>CLK||KEY;')
n1=s.count('localStorage.setItem(KEY,'); n2=s.count('localStorage.getItem(KEY)'); n3=s.count('KEY+"-vid"')
assert n1>=1 and n2>=1 and n3==2,(n1,n2,n3)
s=s.replace('localStorage.setItem(KEY,','localStorage.setItem(SKEY(),').replace('localStorage.getItem(KEY)','localStorage.getItem(SKEY())').replace('KEY+"-vid"','SKEY()+"-vid"')
# 3. start-up waits for the sign-in when cloud.json is present
once('applyTh();applyNav();load();snapInit();autoRun();render();setBtn();','applyTh();applyNav();const BOOT=()=>{load();snapInit();autoRun();render();setBtn()};')
i=s.rindex('</script>')
s=s[:i]+open(os.path.join(here,'cloud.js')).read()+'\ncloudStart();\n'+s[i:]
open(os.path.join(here,'index.html'),'w').write(s)
print(len(s),'bytes; state key uses:',n1,n2)
