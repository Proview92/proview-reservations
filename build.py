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
# 1c. the Proview shell: the same app-icon logo, sign-in page and loading page as the other Proview sites
import urllib.parse
icon='data:image/svg+xml,'+urllib.parse.quote(open(os.path.join(here,'icon-app.svg')).read(),safe="/:=;, ")
once('<span class="mono" id="bmono">P</span><span class="bname" id="bname">Proview <i>Reservations</i></span>','<span class="pvlogo" role="img" aria-label="Proview Reservations"></span><span class="bname pvword">PROVIEW<i>RESERVATIONS</i></span>')
css=open(os.path.join(here,'shell.css')).read().replace('ICON','"'+icon+'"').replace('GRAD_A','#8B5CF6').replace('GRAD_B','#6D28D9')
i=s.index('</style>'); s=s[:i]+css+s[i:]
# 1d. the top-right header group (Dashboard, avatar with the account menu, red sign-out), the same as every Proview app
i=s.index('</style>'); s=s[:i]+open(os.path.join(here,'header.css')).read()+s[i:]
# the loading page is in the page itself, so it shows before any script runs
once('<body>','<body><div id="cl-root" class="pvs-wait"><div class="pvs-splash" role="status" aria-label="Loading Proview Reservations"></div></div>')
i=s.index('<link rel="icon"'); j=s.index('>',i)+1; s=s[:i]+'<link rel="icon" type="image/svg+xml" href="icon-app.svg">'+s[j:]
# 2. the saved data lives under a per-business key in cloud mode (display preferences stay per device)
once('KEY="proview-bookings-v1",APPV="v222";','KEY="proview-bookings-v1",APPV="v222";let CLK="";const SKEY=()=>CLK||KEY;')
n1=s.count('localStorage.setItem(KEY,'); n2=s.count('localStorage.getItem(KEY)'); n3=s.count('KEY+"-vid"')
assert n1>=1 and n2>=1 and n3==2,(n1,n2,n3)
s=s.replace('localStorage.setItem(KEY,','localStorage.setItem(SKEY(),').replace('localStorage.getItem(KEY)','localStorage.getItem(SKEY())').replace('KEY+"-vid"','SKEY()+"-vid"')
# 3. start-up waits for the sign-in when cloud.json is present
once('applyTh();applyNav();load();snapInit();autoRun();render();setBtn();','applyTh();applyNav();const BOOT=()=>{load();snapInit();autoRun();render();setBtn()};')
i=s.rindex('</script>')
s=s[:i]+open(os.path.join(here,'cloud.js')).read()+'\n'+open(os.path.join(here,'header.js')).read()+'\ncloudStart();\n'+s[i:]
open(os.path.join(here,'index.html'),'w').write(s)
print(len(s),'bytes; state key uses:',n1,n2)
