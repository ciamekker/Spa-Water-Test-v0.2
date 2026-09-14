const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const canvas = $("#photoCanvas");
const ctx = canvas.getContext("2d", {willReadFrequently:true});
const work = document.createElement("canvas");
const wctx = work.getContext("2d", {willReadFrequently:true});

let sourceImage = null;
let detectedPoints = [];
let manualMode = false;
let lastResult = null;
let deferredPrompt = null;
let wb = [1,1,1];

const REF = {
  chlorine: [
    {value:0.0,rgb:[214,220,214]},
    {value:0.5,rgb:[200,194,188]},
    {value:1.0,rgb:[179,188,200]},
    {value:3.0,rgb:[160,132,185]},
    {value:5.0,rgb:[153,118,177]}
  ],
  ph: [
    {value:6.8,rgb:[224,133,55]},
    {value:7.2,rgb:[208,126,89]},
    {value:7.6,rgb:[209,118,96]},
    {value:8.0,rgb:[220,112,97]},
    {value:8.4,rgb:[225,93,84]}
  ],
  ta: [
    {value:0,rgb:[151,179,58]},
    {value:80,rgb:[68,104,115]},
    {value:120,rgb:[77,119,148]},
    {value:180,rgb:[76,104,150]},
    {value:240,rgb:[81,100,137]}
  ]
};
const TYPES = ["chlorine","ph","ta"];

function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function rgb2lab(rgb){
  let [r,g,b]=rgb.map(v=>clamp(v,0,255)/255);
  [r,g,b]=[r,g,b].map(v=>v>.04045?Math.pow((v+.055)/1.055,2.4):v/12.92);
  let x=(r*.4124+g*.3576+b*.1805)/.95047;
  let y=(r*.2126+g*.7152+b*.0722);
  let z=(r*.0193+g*.1192+b*.9505)/1.08883;
  [x,y,z]=[x,y,z].map(v=>v>.008856?Math.cbrt(v):(7.787*v)+(16/116));
  return [(116*y)-16,500*(x-y),200*(y-z)];
}
function labDist(a,b){
  const A=rgb2lab(a),B=rgb2lab(b);
  return Math.hypot(A[0]-B[0],A[1]-B[1],A[2]-B[2]);
}
function nearest(rgb,refs){
  return refs.reduce((best,r)=>{
    const d=labDist(rgb,r.rgb);
    return !best||d<best.d?{...r,d}:best;
  },null);
}
function corrected(rgb){
  return rgb.map((v,i)=>Math.round(clamp(v*wb[i],0,255)));
}
function typeDistance(rgb,type){ return nearest(rgb,REF[type]).d; }

function showMessage(msg){
  const el=$("#detectMessage");
  el.textContent=msg; el.classList.remove("hidden");
}
function hideMessage(){ $("#detectMessage").classList.add("hidden"); }

function fileToImage(file){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=reject;
    img.src=URL.createObjectURL(file);
  });
}

async function loadFile(file){
  if(!file) return;
  sourceImage=await fileToImage(file);
  detectedPoints=[]; manualMode=false;
  $("#emptyState").classList.add("hidden");
  $("#redetectBtn").disabled=false;
  drawSource();
  wb=estimateWhiteBalance();
  await new Promise(r=>setTimeout(r,40));
  autoDetect();
}

function drawSource(){
  if(!sourceImage) return;
  const max=1000;
  const sc=Math.min(max/sourceImage.width,max/sourceImage.height,1);
  work.width=Math.max(1,Math.round(sourceImage.width*sc));
  work.height=Math.max(1,Math.round(sourceImage.height*sc));
  wctx.clearRect(0,0,work.width,work.height);
  wctx.drawImage(sourceImage,0,0,work.width,work.height);

  canvas.width=work.width; canvas.height=work.height;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(work,0,0);
  drawOverlay();
}

function estimateWhiteBalance(){
  const data=wctx.getImageData(0,0,work.width,work.height).data;
  const vals=[];
  const step=Math.max(1,Math.floor(Math.min(work.width,work.height)/120));
  for(let y=0;y<work.height;y+=step){
    for(let x=0;x<work.width;x+=step){
      const i=(y*work.width+x)*4,r=data[i],g=data[i+1],b=data[i+2];
      const mx=Math.max(r,g,b),mn=Math.min(r,g,b);
      if(mx>165 && mx-mn<35) vals.push([r,g,b,mx]);
    }
  }
  if(vals.length<20) return [1,1,1];
  vals.sort((a,b)=>b[3]-a[3]);
  const sel=vals.slice(0,Math.max(20,Math.floor(vals.length*.25)));
  const mean=[0,1,2].map(k=>sel.reduce((s,v)=>s+v[k],0)/sel.length);
  const target=(mean[0]+mean[1]+mean[2])/3;
  return mean.map(v=>clamp(target/v,.78,1.28));
}

function sampleRegion(x,y,radius=18){
  const r=Math.max(5,Math.round(radius));
  const x0=clamp(Math.round(x-r),0,work.width-1), y0=clamp(Math.round(y-r),0,work.height-1);
  const x1=clamp(Math.round(x+r),1,work.width), y1=clamp(Math.round(y+r),1,work.height);
  const im=wctx.getImageData(x0,y0,Math.max(1,x1-x0),Math.max(1,y1-y0)).data;
  const px=[];
  for(let i=0;i<im.length;i+=4){
    const rr=im[i],gg=im[i+1],bb=im[i+2],mx=Math.max(rr,gg,bb),mn=Math.min(rr,gg,bb);
    if(mx<35 || mx>252) continue;
    px.push([rr,gg,bb]);
  }
  if(!px.length) return [128,128,128];
  // Median-like trimmed mean reduces glare/shadows.
  const means=[0,1,2].map(k=>{
    const arr=px.map(p=>p[k]).sort((a,b)=>a-b);
    const a=Math.floor(arr.length*.15),b=Math.ceil(arr.length*.85);
    const sub=arr.slice(a,b);
    return Math.round(sub.reduce((s,v)=>s+v,0)/sub.length);
  });
  return corrected(means);
}

function blockCandidates(){
  const minDim=Math.min(work.width,work.height);
  const bs=clamp(Math.round(minDim/70),7,16);
  const cols=Math.floor(work.width/bs), rows=Math.floor(work.height/bs);
  const cand=[];
  for(let gy=1;gy<rows-1;gy++){
    for(let gx=1;gx<cols-1;gx++){
      const x=gx*bs,y=gy*bs;
      const im=wctx.getImageData(x,y,bs,bs).data;
      let sr=0,sg=0,sb=0,n=0,sv=0;
      const pixels=[];
      for(let i=0;i<im.length;i+=8){
        const r=im[i],g=im[i+1],b=im[i+2];
        sr+=r;sg+=g;sb+=b;n++; pixels.push([r,g,b]);
      }
      if(!n) continue;
      let rgb=corrected([sr/n,sg/n,sb/n]);
      for(const p of pixels) sv+=(p[0]-sr/n)**2+(p[1]-sg/n)**2+(p[2]-sb/n)**2;
      const stdev=Math.sqrt(sv/(n*3));
      const mx=Math.max(...rgb),mn=Math.min(...rgb),chroma=mx-mn;
      let best={type:null,d:1e9};
      for(const type of TYPES){
        const d=typeDistance(rgb,type);
        if(d<best.d) best={type,d};
      }
      // Low-variance colored/swatch-like blocks. Loose enough for pale chlorine.
      const threshold=best.type==="chlorine"?34:31;
      if(best.d<threshold && mx>65 && stdev<47 && (chroma>10 || best.d<19)){
        cand.push({gx,gy,x:x+bs/2,y:y+bs/2,bs,rgb,type:best.type,d:best.d});
      }
    }
  }
  return {cand,bs,cols,rows};
}

function connectedComponents(cand,bs){
  const map=new Map();
  cand.forEach((c,i)=>map.set(`${c.gx},${c.gy}`,i));
  const seen=new Set(), comps=[];
  for(let i=0;i<cand.length;i++){
    if(seen.has(i)) continue;
    const stack=[i],members=[];seen.add(i);
    while(stack.length){
      const j=stack.pop(),c=cand[j];members.push(c);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dy)continue;
        const k=map.get(`${c.gx+dx},${c.gy+dy}`);
        if(k!==undefined&&!seen.has(k)){seen.add(k);stack.push(k)}
      }
    }
    if(members.length<2) continue;
    const xs=members.map(c=>c.x),ys=members.map(c=>c.y);
    const minx=Math.min(...xs)-bs/2,maxx=Math.max(...xs)+bs/2,miny=Math.min(...ys)-bs/2,maxy=Math.max(...ys)+bs/2;
    const ww=maxx-minx,hh=maxy-miny,ratio=ww/hh;
    if(ratio<.28||ratio>3.5) continue;
    if(ww>work.width*.22||hh>work.height*.22) continue;
    const typeVotes={chlorine:0,ph:0,ta:0};
    members.forEach(c=>typeVotes[c.type]+=1/(1+c.d));
    const type=Object.entries(typeVotes).sort((a,b)=>b[1]-a[1])[0][0];
    const rgb=[0,1,2].map(k=>Math.round(members.reduce((s,c)=>s+c.rgb[k],0)/members.length));
    const d=typeDistance(rgb,type);
    comps.push({
      x:members.reduce((s,c)=>s+c.x,0)/members.length,
      y:members.reduce((s,c)=>s+c.y,0)/members.length,
      w:ww,h:hh,size:Math.sqrt(ww*hh),count:members.length,type,rgb,d,
      score:d + Math.abs(Math.log(Math.max(.01,ratio)))*5 - Math.min(8,members.length*.2)
    });
  }
  return comps;
}

function geometryPenalty(a,b,c){
  const ds=[
    Math.hypot(a.x-b.x,a.y-b.y),
    Math.hypot(a.x-c.x,a.y-c.y),
    Math.hypot(b.x-c.x,b.y-c.y)
  ].sort((x,y)=>x-y);
  if(ds[0]<8) return 999;
  const area=Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x));
  const line=area/(ds[2]*ds[2]+1);
  const spacing=Math.abs(ds[1]/ds[0]-1);
  const sizes=[a.size,b.size,c.size];
  const sm=Math.max(...sizes)/Math.max(1,Math.min(...sizes));
  return line*80 + Math.max(0,spacing-.65)*8 + Math.max(0,sm-2.8)*5;
}

function bestAutoTriple(comps){
  const top={};
  for(const t of TYPES) top[t]=comps.filter(c=>c.type===t).sort((a,b)=>a.score-b.score).slice(0,8);
  let best=null;
  for(const c of top.chlorine) for(const p of top.ph) for(const t of top.ta){
    const gp=geometryPenalty(c,p,t);
    const score=c.score+p.score+t.score+gp;
    if(!best||score<best.score) best={score,pts:[
      {x:c.x,y:c.y,type:"chlorine",auto:true},
      {x:p.x,y:p.y,type:"ph",auto:true},
      {x:t.x,y:t.y,type:"ta",auto:true}
    ]};
  }
  if(best && best.score<105) return best.pts;

  // Fallback: use the best two distinct analytes and infer the third assuming
  // the three pads are approximately equally spaced on the strip.
  const choices=TYPES.map(t=>top[t][0]).filter(Boolean);
  if(choices.length>=2){
    choices.sort((a,b)=>a.score-b.score);
    const a=choices[0], b=choices.find(x=>x.type!==a.type);
    if(b){
      let missing=TYPES.find(t=>t!==a.type&&t!==b.type);
      let pos;
      const A={x:a.x,y:a.y},B={x:b.x,y:b.y};
      if((a.type==="chlorine"&&b.type==="ta")||(a.type==="ta"&&b.type==="chlorine")){
        pos={x:(A.x+B.x)/2,y:(A.y+B.y)/2};
      } else {
        const idx={chlorine:0,ph:1,ta:2};
        const ia=idx[a.type],ib=idx[b.type],im=idx[missing];
        const k=(im-ia)/(ib-ia);
        pos={x:A.x+(B.x-A.x)*k,y:A.y+(B.y-A.y)*k};
      }
      if(pos.x>0&&pos.x<work.width&&pos.y>0&&pos.y<work.height){
        return [
          {x:a.x,y:a.y,type:a.type,auto:true},
          {x:b.x,y:b.y,type:b.type,auto:true},
          {x:pos.x,y:pos.y,type:missing,auto:true,inferred:true}
        ];
      }
    }
  }
  return null;
}

function autoDetect(){
  if(!sourceImage) return;
  showMessage("Søker etter fargefeltene …");
  setTimeout(()=>{
    try{
      const {cand,bs}=blockCandidates();
      const comps=connectedComponents(cand,bs);
      const pts=bestAutoTriple(comps);
      if(pts){
        detectedPoints=pts;
        manualMode=false;
        showMessage(pts.some(p=>p.inferred)?"Fant 2 felt – beregnet plasseringen til det tredje":"Fant 3 fargefelt automatisk ✓");
        $("#analyzeBtn").disabled=false;
        $("#manualBtn").classList.remove("hidden");
      }else{
        detectedPoints=[];
        showMessage("Fant ikke alle feltene. Trykk på de 3 fargefeltene i bildet.");
        manualMode=true;
        $("#analyzeBtn").disabled=true;
        $("#manualBtn").classList.add("hidden");
      }
      redraw();
    }catch(e){
      console.error(e);
      detectedPoints=[];
      manualMode=true;
      showMessage("Automatisk søk feilet. Trykk på de 3 fargefeltene.");
      redraw();
    }
  },30);
}

function redraw(){
  if(!sourceImage) return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(work,0,0);
  drawOverlay();
}

function drawOverlay(){
  if(!detectedPoints.length) return;
  const labelMap={chlorine:"Cl",ph:"pH",ta:"TA"};
  ctx.save();
  ctx.lineWidth=Math.max(3,work.width/260);
  ctx.font=`700 ${Math.max(15,Math.round(work.width/45))}px system-ui`;
  detectedPoints.forEach((p,i)=>{
    const r=Math.max(18,Math.min(work.width,work.height)/28);
    ctx.strokeStyle=p.inferred?"#ffd14a":"#3db3ff";
    ctx.fillStyle="rgba(1,10,18,.72)";
    ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.stroke();
    const label=p.type?labelMap[p.type]:String(i+1);
    const tw=ctx.measureText(label).width;
    ctx.fillRect(p.x+r+5,p.y-15,tw+16,30);
    ctx.fillStyle="#fff";ctx.fillText(label,p.x+r+13,p.y+7);
  });
  ctx.restore();
}

function enterManual(){
  if(!sourceImage) return;
  manualMode=true; detectedPoints=[];
  showMessage("Manuell markering: trykk på Cl, pH og TA-feltene – rekkefølgen spiller ingen rolle.");
  $("#analyzeBtn").disabled=true;
  redraw();
}
$("#manualBtn").addEventListener("click",enterManual);

canvas.addEventListener("pointerdown",e=>{
  if(!sourceImage||!manualMode) return;
  const rect=canvas.getBoundingClientRect();
  const x=(e.clientX-rect.left)*canvas.width/rect.width;
  const y=(e.clientY-rect.top)*canvas.height/rect.height;
  if(detectedPoints.length>=3) detectedPoints=[];
  detectedPoints.push({x,y,type:null,auto:false});
  if(detectedPoints.length===3){
    showMessage("3 felt markert ✓ Trykk «Analyser teststripe».");
    $("#analyzeBtn").disabled=false;
  }else{
    showMessage(`Markert ${detectedPoints.length} av 3 felt.`);
  }
  redraw();
});

function assignments(samples){
  const perms=[
    ["chlorine","ph","ta"],["chlorine","ta","ph"],
    ["ph","chlorine","ta"],["ph","ta","chlorine"],
    ["ta","chlorine","ph"],["ta","ph","chlorine"]
  ];
  let best=null;
  for(const perm of perms){
    let score=0;
    for(let i=0;i<3;i++) score+=typeDistance(samples[i],perm[i]);
    if(!best||score<best.score) best={score,perm};
  }
  return best.perm;
}
function analyze(){
  if(detectedPoints.length!==3) return;
  const radius=Math.max(8,Math.min(work.width,work.height)/55);
  const samples=detectedPoints.map(p=>sampleRegion(p.x,p.y,radius));
  let types;
  if(detectedPoints.every(p=>p.type)) types=detectedPoints.map(p=>p.type);
  else types=assignments(samples);
  const by={};
  for(let i=0;i<3;i++){
    const type=types[i],near=nearest(samples[i],REF[type]);
    by[type]={value:near.value,rgb:samples[i],distance:near.d,status:statusFor(type,near.value)};
  }
  lastResult={ts:new Date().toISOString(),chlorine:by.chlorine,ph:by.ph,ta:by.ta};
  renderResults(lastResult);
  showScreen("Results");
}
$("#analyzeBtn").addEventListener("click",analyze);

function statusFor(type,v){
  if(type==="chlorine") return v<0.5?"LOW":v>1.0?"HIGH":"OK";
  if(type==="ph") return v<7.2?"LOW":v>7.6?"HIGH":"OK";
  if(type==="ta") return v<80?"LOW":v>120?"HIGH":"OK";
}
function stLabel(s){return s==="OK"?"✓ OK":s==="LOW"?"↓ Lav":"↑ Høy"}
function metric(name,value,unit,range,d,color){
  const debug=$("#debugToggle").checked?`<div class="metric-rgb">Målt RGB: ${d.rgb.join(", ")}</div>`:"";
  return `<div class="metric">
    <div class="metric-bar" style="background:${color}"></div>
    <div class="metric-main">
      <div class="metric-name">${name}</div>
      <div class="metric-value">${value}${unit}</div>
      <div class="metric-range">Ideelt på skalaen: ${range}</div>${debug}
    </div>
    <div class="status ${d.status==="OK"?"ok":"warn"}">${stLabel(d.status)}</div>
  </div>`;
}
function renderResults(r){
  $("#resultTime").textContent=new Date(r.ts).toLocaleString("no-NO");
  $("#resultCards").innerHTML=
    metric("Fritt klor (Cl)",String(r.chlorine.value).replace(".",",")," mg/l","0,5–1,0 mg/l",r.chlorine,"#ffd14a")+
    metric("pH",String(r.ph.value).replace(".",","),"","7,2–7,6",r.ph,"#ff85bd")+
    metric("Total alkalinitet (TA)",r.ta.value," mg/l","80–120 mg/l",r.ta,"#4de36c");
  const all=[r.chlorine.status,r.ph.status,r.ta.status];
  const nbad=all.filter(s=>s!=="OK").length;
  const q=$("#qualityCard");q.classList.remove("warn","bad");
  let title="GOD",sub="Alle målte verdier er innenfor idealområdet på teststripe-skalaen.";
  if(nbad===1){title="SJEKK";sub="Én verdi ligger utenfor idealområdet.";q.classList.add("warn")}
  if(nbad>=2){title="UBALANSE";sub="Flere verdier ligger utenfor idealområdet.";q.classList.add("bad")}
  $("#qualityText").textContent=title;$("#qualitySub").textContent=sub;
  const a=[];
  if(r.chlorine.status==="LOW")a.push("Fritt klor er lavt – korriger etter produktets dosering og mål på nytt.");
  if(r.chlorine.status==="HIGH")a.push("Fritt klor er høyt – la nivået falle og mål på nytt før bruk.");
  if(r.ph.status==="LOW")a.push("pH er lav – øk pH gradvis og mål på nytt.");
  if(r.ph.status==="HIGH")a.push("pH er høy – senk pH gradvis og mål på nytt.");
  if(r.ta.status==="LOW")a.push("Alkaliniteten er lav – øk TA gradvis.");
  if(r.ta.status==="HIGH")a.push("Alkaliniteten er høy – korriger gradvis og mål på nytt.");
  $("#adviceText").textContent=a.length?a.join(" "):"Ingen tiltak nødvendig ut fra de målte feltene.";
}

$("#cameraInput").addEventListener("change",e=>loadFile(e.target.files[0]));
$("#galleryInput").addEventListener("change",e=>loadFile(e.target.files[0]));
$("#redetectBtn").addEventListener("click",()=>{manualMode=false;detectedPoints=[];redraw();autoDetect()});

$("#newTestBtn").addEventListener("click",()=>{
  sourceImage=null;detectedPoints=[];lastResult=null;manualMode=false;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  $("#emptyState").classList.remove("hidden");
  $("#analyzeBtn").disabled=true;$("#redetectBtn").disabled=true;
  $("#manualBtn").classList.add("hidden");hideMessage();
  $("#cameraInput").value="";$("#galleryInput").value="";
  showScreen("Test");
});
$("#saveBtn").addEventListener("click",()=>{
  if(!lastResult)return;
  const h=JSON.parse(localStorage.getItem("spaHistory")||"[]");
  h.unshift(lastResult);localStorage.setItem("spaHistory",JSON.stringify(h.slice(0,80)));
  $("#saveBtn").textContent="✓ Lagret";
  setTimeout(()=>$("#saveBtn").textContent="💾 Lagre resultat",1000);
});
function renderHistory(){
  const h=JSON.parse(localStorage.getItem("spaHistory")||"[]");
  $("#historyList").innerHTML=h.length?h.map(r=>`
    <div class="history">
      <div class="history-top"><strong>${new Date(r.ts).toLocaleDateString("no-NO")}</strong>
      <span class="pill">${[r.chlorine.status,r.ph.status,r.ta.status].every(s=>s==="OK")?"GOD":"SJEKK"}</span></div>
      <small>${new Date(r.ts).toLocaleTimeString("no-NO",{hour:"2-digit",minute:"2-digit"})}</small>
      <div class="history-values"><span>Cl ${r.chlorine.value} mg/l</span><span>pH ${r.ph.value}</span><span>TA ${r.ta.value} mg/l</span></div>
    </div>`).join(""):`<div class="empty-history">Ingen lagrede tester ennå.</div>`;
}
$("#clearHistoryBtn").addEventListener("click",()=>{
  if(confirm("Slette all historikk?")){localStorage.removeItem("spaHistory");renderHistory()}
});

function showScreen(name){
  $$(".screen").forEach(s=>s.classList.remove("active"));
  $("#screen"+name).classList.add("active");
  $$(".nav").forEach(n=>n.classList.toggle("active",n.dataset.screen===name||(name==="Results"&&n.dataset.screen==="Test")));
  if(name==="History")renderHistory();
  scrollTo({top:0,behavior:"smooth"});
}
$$(".nav").forEach(n=>n.addEventListener("click",()=>showScreen(n.dataset.screen)));

window.addEventListener("beforeinstallprompt",e=>{
  e.preventDefault();deferredPrompt=e;$("#installBtn").classList.remove("hidden");
});
$("#installBtn").addEventListener("click",async()=>{
  if(!deferredPrompt)return;
  deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$("#installBtn").classList.add("hidden");
});
if("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(console.error));
renderHistory();
