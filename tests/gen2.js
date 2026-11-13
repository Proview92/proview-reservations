// deterministic generator for 200 bookings from today for 30 days
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
window.GEN=function(today,n){
 const R=mulberry32(20270214),pick=a=>a[Math.floor(R()*a.length)];
 const F=["Amelia","Oliver","Isla","Noah","Ava","Arthur","Mia","Leo","Freya","Harry","Ayse","Mehmet","Elif","Can","Zeynep","Emre","Sofia","Mateo","Chloe","Jack","Priya","Arjun","Fatima","Omar","Yuki","Hiro","Anna","Piotr","Katarzyna","Tomasz","Lucia","Marco","Sean","Niamh","Declan","Siobhan","Kwame","Abena","Tunde","Ngozi"];
 const L=["Smith","Jones","Taylor","Brown","Wilson","Evans","Thomas","Roberts","Johnson","Walker","Yilmaz","Demir","Kaya","Celik","Patel","Shah","Khan","Ali","Tanaka","Sato","Kowalski","Nowak","Rossi","Ferrari","O'Brien","Murphy","Kelly","Mensah","Okafor","Adeyemi","D'Souza","Van der Berg","Smith-Jones","McDonald"];
 const guests=[];for(let i=0;i<70;i++){const f=pick(F),l=pick(L);const k=R();const ph=k<.55?"07700 9"+String(10000+Math.floor(R()*89999)).slice(0,5):k<.75?"+44 7700 9"+String(10000+Math.floor(R()*89999)).slice(0,5):k<.9?"07700"+String(900000+Math.floor(R()*99999)):k<.96?"020 7946 0"+String(100+Math.floor(R()*899)):"";guests.push({name:f+" "+l,phone:ph,email:R()<.4?(f+"."+l).toLowerCase().replace(/[^a-z.]/g,"")+"@example.com":""})}
 const notes=["","","","","","Birthday","Anniversary","Nut allergy","Vegetarian x2","High chair","Window seat please","Wheelchair user","Celiac","Pram","Business lunch","Quiet table","Surprise cake at 20:00","Dog friendly area"];
 const days=[];for(let d=0;d<30;d++){const dt=new Date(today+"T12:00");dt.setDate(dt.getDate()+d);days.push({i:d,iso:dt.toISOString().slice(0,10),dow:(dt.getDay()+6)%7})}
 const wgt=dw=>[0.7,0.8,0.9,1.1,1.8,2.2,1.7][dw]; // Mon..Sun
 const tot=days.reduce((a,d)=>a+wgt(d.dow),0);
 const out=[];
 days.forEach(d=>{const cnt=Math.round(n*wgt(d.dow)/tot);for(let k=0;k<cnt;k++){
   const lunch=R()<.45;const hh=lunch?12+Math.floor(R()*3):17+Math.floor(R()*4);const mm=pick([0,15,30,45]);
   const r=R();const size=r<.04?1:r<.42?2:r<.55?3:r<.77?4:r<.85?5:r<.92?6:r<.96?7:r<.985?8:pick([10,12]);
   const g=R()<.35?guests[Math.floor(R()*12)]:pick(guests);
   out.push({date:d.iso,time:String(hh).padStart(2,"0")+":"+String(mm).padStart(2,"0"),size,name:g.name,phone:g.phone,email:g.email,src:pick(["Phone","Phone","Website","Website","App","Walk-in"]),notes:pick(notes),tags:R()<.1?["VIP"]:R()<.1?["Regular"]:[]})}});
 while(out.length<n){const d=pick(days);out.push({date:d.iso,time:"19:00",size:2,name:pick(guests).name,phone:"",email:"",src:"Phone",notes:"",tags:[]})}
 return out.slice(0,n)}
