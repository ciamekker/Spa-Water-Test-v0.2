const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let currentImage = null;
let deferredPrompt = null;
let lastResult = null;
let wbGain = [1,1,1];
const canvas = $("#previewCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

// Spa Water Test v0.6.2 – kalibrert mot brukerens egen 3-i-1-skala (referansebilder 15.09.2026).
const SPA_LITERS = 600;

const REF = {
  // Kalibrert fra brukerens egen 3-i-1 teststripe-boks.
  // Skala på boksen:
  // Fritt klor: 0.0 / 0.5 / 1.0 / 3.0 / 5.0 mg/l
  // pH:         6.8 / 7.2 / 7.6 / 8.0 / 8.4
  // TA:         0 / 80 / 120 / 180 / 240 mg/l
  chlorine: [
    {value:0.0, rgb:[214,220,214]},
    {value:0.5, rgb:[200,194,188]},
    {value:1.0, rgb:[179,188,200]},
    {value:3.0, rgb:[160,132,185]},
    {value:5.0, rgb:[153,118,177]}
  ],
  ph: [
    {value:6.8, rgb:[224,133,55]},
    {value:7.2, rgb:[208,126,89]},
    {value:7.6, rgb:[209,118,96]},
    {value:8.0, rgb:[220,112,97]},
    {value:8.4, rgb:[225,93,84]}
  ],
  ta: [
    {value:0,   rgb:[151,179,58]},
    {value:80,  rgb:[68,104,115]},
    {value:120, rgb:[77,119,148]},
    {value:180, rgb:[76,104,150]},
    {value:240, rgb:[81,100,137]}
  ]
};

function rgb2lab(rgb){
  let [r,g,b]=rgb.map(v=>v/255);
  [r,g,b]=[r,g,b].map(v=>v>0.04045?Math.pow((v+0.055)/1.055,2.4):v/12.92);
  let x=(r*.4124+g*.3576+b*.1805)/.95047;
  let y=(r*.2126+g*.7152+b*.0722)/1.00000;
  let z=(r*.0193+g*.1192+b*.9505)/1.08883;
  [x,y,z]=[x,y,z].map(v=>v>.008856?Math.cbrt(v):(7.787*v)+(16/116));
  return [(116*y)-16, 500*(x-y), 200*(y-z)];
}
function dist(a,b){ return Math.sqrt(a.reduce((s,v,i)=>s+(v-b[i])**2,0)); }
function nearest(rgb, refs){
  const lab=rgb2lab(rgb);
  return refs.reduce((best,r)=>{
    const d=dist(lab,rgb2lab(r.rgb));
    return !best||d<best.d?{...r,d}:best;
  },null);
}
function averageRegion(cx, cy, w=70, h=48){
  const x=Math.max(0,Math.round(cx-w/2)), y=Math.max(0,Math.round(cy-h/2));
  const data=ctx.getImageData(x,y,Math.min(w,canvas.width-x),Math.min(h,canvas.height-y)).data;
  let r=0,g=0,b=0,n=0;
  for(let i=0;i<data.length;i+=4){
    if(data[i+3]<10) continue;
    r+=data[i];g+=data[i+1];b+=data[i+2];n++;
  }
  return [Math.round(r/n),Math.round(g/n),Math.round(b/n)];
}
function estimateWhiteBalance(){
  // Finn lyse, lite mettede piksler (typisk hvit/grå bakgrunn) og bruk dem som nøytral referanse.
  const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  let r=0,g=0,b=0,n=0;
  const step=40; // rask sampling
  for(let i=0;i<data.length;i+=4*step){
    const R=data[i],G=data[i+1],B=data[i+2];
    const mx=Math.max(R,G,B), mn=Math.min(R,G,B);
    if(mx>135 && (mx-mn)<38){ r+=R;g+=G;b+=B;n++; }
  }
  if(n<40) return [1,1,1];
  r/=n;g/=n;b/=n;
  const target=(r+g+b)/3;
  const clamp=v=>Math.max(.78,Math.min(1.28,v));
  return [clamp(target/r),clamp(target/g),clamp(target/b)];
}
function corrected(rgb){
  return rgb.map((v,i)=>Math.max(0,Math.min(255,Math.round(v*wbGain[i]))));
}

function patchStats(cx,cy,size=28){
  const x=Math.max(0,Math.round(cx-size/2)), y=Math.max(0,Math.round(cy-size/2));
  const w=Math.min(size,canvas.width-x), h=Math.min(size,canvas.height-y);
  const d=ctx.getImageData(x,y,w,h).data; let r=0,g=0,b=0,n=0,rr=0,gg=0,bb=0;
  for(let i=0;i<d.length;i+=4){ if(d[i+3]<10)continue; r+=d[i];g+=d[i+1];b+=d[i+2];rr+=d[i]*d[i];gg+=d[i+1]*d[i+1];bb+=d[i+2]*d[i+2];n++; }
  if(!n)return {rgb:[0,0,0],sd:999}; r/=n;g/=n;b/=n;
  const v=Math.sqrt(Math.max(0,(rr+gg+bb)/n-(r*r+g*g+b*b)));
  return {rgb:[Math.round(r),Math.round(g),Math.round(b)],sd:v};
}
function autoDetectPads(){
  wbGain=estimateWhiteBalance();
  const types=[['chlorine',REF.chlorine],['ph',REF.ph],['ta',REF.ta]], step=12, margin=24;
  const cand={chlorine:[],ph:[],ta:[]};
  for(let y=margin;y<canvas.height-margin;y+=step) for(let x=margin;x<canvas.width-margin;x+=step){
    const st=patchStats(x,y,26); if(st.sd>48) continue; const rgb=corrected(st.rgb);
    for(const [name,refs] of types){ const m=nearest(rgb,refs); if(m.d<30) cand[name].push({x,y,rgb,d:m.d,m}); }
  }
  for(const k of Object.keys(cand)) cand[k]=cand[k].sort((a,b)=>a.d-b.d).slice(0,45);
  let best=null;
  for(const c of cand.chlorine) for(const p of cand.ph) for(const t of cand.ta){
    const d1=Math.hypot(c.x-p.x,c.y-p.y), d2=Math.hypot(p.x-t.x,p.y-t.y), d3=Math.hypot(c.x-t.x,c.y-t.y);
    if(d1<45||d2<45||d1>320||d2>320) continue;
    const spacing=Math.abs(d1-d2)/Math.max(d1,d2); if(spacing>.38) continue;
    const straight=Math.abs((c.x-p.x)*(t.y-p.y)-(c.y-p.y)*(t.x-p.x))/(d1*d2); if(straight>.22) continue;
    if(Math.abs(d3-(d1+d2))>Math.max(24,.18*(d1+d2))) continue;
    const score=c.d+p.d+t.d+spacing*28+straight*45; if(!best||score<best.score) best={c,p,t,score};
  }
  if(!best || best.score>72) return null;
  return best;
}

function canvasImageBlob(){
  return new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",0.72));
}

// IndexedDB brukes slik at bilder ikke fyller localStorage.
const DB_NAME="SpaWaterTestDB", DB_VER=1, STORE="history";
function openDB(){ return new Promise((resolve,reject)=>{ const q=indexedDB.open(DB_NAME,DB_VER); q.onupgradeneeded=()=>{const db=q.result;if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE,{keyPath:"ts"});}; q.onsuccess=()=>resolve(q.result); q.onerror=()=>reject(q.error); }); }
async function dbPut(item){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put(item);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
async function dbAll(){const db=await openDB();return new Promise((res,rej)=>{const q=db.transaction(STORE).objectStore(STORE).getAll();q.onsuccess=()=>res(q.result.sort((a,b)=>b.ts.localeCompare(a.ts)));q.onerror=()=>rej(q.error);});}
async function dbClear(){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).clear();tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
function statusFor(type,v){
  if(type==="chlorine") return v<0.5?"LOW":v>1.0?"HIGH":"OK";
  if(type==="ph") return v<7.2?"LOW":v>7.6?"HIGH":"OK";
  if(type==="ta") return v<80?"LOW":v>120?"HIGH":"OK";
}
function statusLabel(s){ return s==="OK"?"✓ OK":s==="LOW"?"↓ Lav":s==="HIGH"?"↑ Høy":"! Sjekk"; }

function drawImageToCanvas(img){
  const cw=canvas.width,ch=canvas.height;
  const scale=Math.max(cw/img.width,ch/img.height);
  const dw=img.width*scale, dh=img.height*scale;
  const dx=(cw-dw)/2, dy=(ch-dh)/2;
  ctx.clearRect(0,0,cw,ch);
  ctx.drawImage(img,dx,dy,dw,dh);
}
function loadFile(file){
  if(!file) return;
  const img=new Image();
  img.onload=()=>{ currentImage=img; drawImageToCanvas(img); $("#placeholder").classList.add("hidden"); $("#analyzeBtn").disabled=false; };
  img.src=URL.createObjectURL(file);
}
$("#cameraInput").addEventListener("change",e=>loadFile(e.target.files[0]));
$("#galleryInput").addEventListener("change",e=>loadFile(e.target.files[0]));
$("#flashHint").addEventListener("click",()=>alert("Bruk telefonens vanlige kamerablits hvis bildet blir for mørkt. PWA kan ikke styre blits på alle Android-modeller."));

$("#analyzeBtn").addEventListener("click",()=>{
  const found=autoDetectPads();
  if(!found){
    alert("Kan ikke lese teststrimmelen sikkert. Sørg for at hele strimmelen og alle tre fargefeltene er synlige, med jevnt lys.");
    return;
  }
  const rgb1=found.c.rgb, rgb2=found.p.rgb, rgb3=found.t.rgb;
  const c=found.c.m, p=found.p.m, t=found.t.m;
  lastResult={
    ts:new Date().toISOString(),
    chlorine:{value:c.value,rgb:rgb1,status:statusFor("chlorine",c.value)},
    ph:{value:p.value,rgb:rgb2,status:statusFor("ph",p.value)},
    ta:{value:t.value,rgb:rgb3,status:statusFor("ta",t.value)},
    wb:wbGain.map(v=>+v.toFixed(3)), confidence: Math.max(0,Math.round(100-(found.score/72)*45))
  };
  renderResults(lastResult);
  showScreen("Results");
});

function metricCard(name,value,unit,range,data,color){
  const debug=$("#debugToggle").checked?`<div class="rgb">RGB: ${data.rgb.join(", ")}</div>`:"";
  const cls=data.status==="OK"?"ok":(data.status==="LOW"||data.status==="HIGH")?"low":"bad";
  return `<div class="metric">
    <div class="metric-bar" style="background:${color}"></div>
    <div class="metric-main">
      <div class="metric-name">${name}</div>
      <div class="metric-value">${value}${unit}</div>
      <div class="metric-range">Anbefalt: ${range}</div>${debug}
    </div>
    <div class="status ${cls}">${statusLabel(data.status)}</div>
  </div>`;
}
function renderResults(r){
  $("#resultTime").textContent=new Date(r.ts).toLocaleString("no-NO");
  $("#resultCards").innerHTML=
    metricCard("Fritt klor (Cl)",r.chlorine.value," mg/l","0,5–1,0 mg/l",r.chlorine,"#ffd23f")+
    metricCard("pH",r.ph.value,"","7,2–7,6",r.ph,"#ff84bf")+
    metricCard("Total alkalinitet (TA)",r.ta.value," ppm","80–120 ppm",r.ta,"#4cff68");
  const all=[r.chlorine.status,r.ph.status,r.ta.status];
  const bad=all.filter(x=>x!=="OK").length;
  const qc=$("#qualityCard"); qc.classList.remove("warn","bad");
  let q="GOD",sub="Alle målte verdier er innenfor anbefalt område.",adv="Ingen tiltak nødvendig. Fortsett normal vedlikeholdsrutine.";
  if(bad===1){q="SJEKK";sub="Én verdi ligger utenfor anbefalt område.";qc.classList.add("warn");}
  if(bad>=2){q="UBALANSE";sub="Flere verdier bør korrigeres før bruk.";qc.classList.add("bad");}
  const advice=[];
  if(r.chlorine.status==="LOW") advice.push("Fritt klor er lavt i forhold til skalaen på teststripe-boksen – korriger etter kjemiprodusentens dosering og mål på nytt.");
  if(r.chlorine.status==="HIGH") advice.push("Fritt klor er høyt i forhold til teststripe-skalaen – la nivået falle og mål på nytt før bruk.");
  if(r.ph.status==="LOW") advice.push("pH er lav – bruk pH Plus i små doser.");
  if(r.ph.status==="HIGH") advice.push("pH er høy – bruk pH Minus i små doser.");
  if(r.ta.status==="LOW") advice.push("Alkaliniteten er lav – øk TA gradvis.");
  if(r.ta.status==="HIGH") advice.push("Alkaliniteten er høy – korriger gradvis og mål på nytt.");
  if(advice.length) adv=advice.join(" ");
  $("#qualityText").textContent=q; $("#qualitySub").textContent=sub; $("#adviceText").textContent=adv;
}
$("#saveBtn").addEventListener("click",async()=>{
  if(!lastResult) return;
  try{
    const blob=await canvasImageBlob();
    await dbPut({...lastResult,image:blob});
    await renderHistory();
    $("#saveBtn").textContent="✓ Lagret med bilde";
  }catch(e){
    console.error(e); $("#saveBtn").textContent="Kunne ikke lagre";
  }
  setTimeout(()=>$("#saveBtn").textContent="💾 Lagre resultat",1400);
});
$("#newTestBtn").addEventListener("click",()=>{
  currentImage=null; lastResult=null; wbGain=[1,1,1]; ctx.clearRect(0,0,canvas.width,canvas.height);
  $("#placeholder").classList.remove("hidden"); $("#analyzeBtn").disabled=true;
  $("#cameraInput").value=""; $("#galleryInput").value=""; showScreen("Test");
});
async function renderHistory(){
  const arr=await dbAll();
  $("#historyList").innerHTML=arr.length?arr.map((r,i)=>{
    const img=r.image?URL.createObjectURL(r.image):"";
    return `<div class="history-item clickable" data-i="${i}">
      <div class="history-summary">
        ${img?`<img class="history-thumb" src="${img}" alt="Teststripe">`:""}
        <div class="history-info"><div class="row"><strong>${new Date(r.ts).toLocaleDateString("no-NO")}</strong><span class="pill">${[r.chlorine.status,r.ph.status,r.ta.status].every(s=>s==="OK")?"GOD":"SJEKK"}</span></div>
        <small>${new Date(r.ts).toLocaleTimeString("no-NO",{hour:"2-digit",minute:"2-digit"})}</small>
        <div class="history-values"><span>Cl ${r.chlorine.value} mg/l</span><span>pH ${r.ph.value}</span><span>TA ${r.ta.value} ppm</span></div></div>
      </div>
      <div class="history-detail hidden">${img?`<img class="history-photo" src="${img}" alt="Lagret testbilde">`:""}<p>Trykk på testen igjen for å lukke bildet.</p></div>
    </div>`;
  }).join(""):`<div class="empty">Ingen lagrede tester ennå.</div>`;
  $$(".history-item.clickable").forEach(el=>el.addEventListener("click",()=>el.querySelector(".history-detail").classList.toggle("hidden")));
}
$("#clearHistoryBtn").addEventListener("click",async()=>{
  if(confirm("Slette all historikk og alle lagrede bilder?")){await dbClear();await renderHistory();}
});

function showScreen(name){
  $$(".screen").forEach(s=>s.classList.remove("active"));
  const id="#screen"+name; $(id).classList.add("active");
  $$(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.screen===name || (name==="Results"&&b.dataset.screen==="Test")));
  if(name==="History") renderHistory();
  window.scrollTo({top:0,behavior:"smooth"});
}
$$(".nav-btn").forEach(b=>b.addEventListener("click",()=>showScreen(b.dataset.screen)));

window.addEventListener("beforeinstallprompt",e=>{
  e.preventDefault();deferredPrompt=e;$("#installBtn").classList.remove("hidden");
});
$("#installBtn").addEventListener("click",async()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$("#installBtn").classList.add("hidden");
});
if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
renderHistory();
