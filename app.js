
const DB = window.PEUGEOT_E2008_DB;

let port, reader, writer;
let rxBuffer = "";
let waitingResolver = null;
let live = false;
let logRows = [];
let currentSetupKey = "";

// Sniffer state
let sniffing = false;
let sniffLineBuffer = "";
let sniffFrames = 0;
let sniffRawRows = [];
let sniffMap = new Map();
let sniffBaseline = new Map();
let currentEvent = "";
let currentEventUntil = 0;
let renderSniffTimer = null;

const enc = new TextEncoder();
const $ = id => document.getElementById(id);
const terminal = $("terminal");

function term(s){
  terminal.textContent += s + "\n";
  terminal.scrollTop = terminal.scrollHeight;
}
function setStatus(on, text){
  $("status").className = "status-chip " + (on ? "on" : "off");
  $("status").innerHTML = `<span class="dot"></span>${text}`;
}
function allSignals(){
  return DB.ecus.flatMap(ecu => ecu.signals.map(s => ({...s, ecu})));
}
const signalState = new Map();

function renderTiles(){
  const q = $("filter").value.toLowerCase().trim();
  const html = allSignals().filter(x => x.name.toLowerCase().includes(q) || x.did.toLowerCase().includes(q)).map(x => {
    const st = signalState.get(x.ecu.key+":"+x.did) || {};
    let v = st.display ?? "—";
    return `<div class="tile">
      <div class="name">${x.name}</div>
      <div class="value">${v}${st.display!==undefined && x.unit ? ` <small>${x.unit}</small>` : ""}</div>
      <div class="meta">${x.ecu.name} • ${x.ecu.request_id}→${x.ecu.response_id} • ${x.command}</div>
    </div>`;
  }).join("");
  $("tiles").innerHTML = html;

  // Hero summary from decoded BMS values
  const soc = signalState.get("bms:D410")?.value;
  const hv = signalState.get("bms:D815")?.value;
  const vmin = signalState.get("bms:D86F")?.value;
  const vmax = signalState.get("bms:D870")?.value;
  if(Number.isFinite(soc)) $("heroSoc").textContent = soc.toFixed(1);
  if(Number.isFinite(hv)) $("heroHv").textContent = hv.toFixed(1);
  if(Number.isFinite(vmin) && Number.isFinite(vmax)) $("heroDelta").textContent = ((vmax-vmin)*1000).toFixed(0);
}

$("filter").addEventListener("input", renderTiles);
$("clearBtn").addEventListener("click", ()=>terminal.textContent="");

// -------- Navigation --------
function showTab(id){
  document.querySelectorAll(".panel").forEach(x=>x.classList.add("hidden"));
  const target=$(id);
  if(target) target.classList.remove("hidden");
  document.querySelectorAll(".nav-item").forEach(x=>x.classList.toggle("active",x.dataset.tab===id));
  try{ history.replaceState(null,"",location.pathname+"?tab="+encodeURIComponent(id)); }catch{}
  window.scrollTo({top:0,behavior:"smooth"});
}
document.querySelectorAll(".nav-item").forEach(btn=>btn.addEventListener("click",()=>showTab(btn.dataset.tab)));

const initialTab=new URLSearchParams(location.search).get("tab");
if(initialTab && $(initialTab)) showTab(initialTab);

// -------- PWA / platform install --------
let deferredInstallPrompt = null;
const ua = navigator.userAgent || "";
const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);
const isAndroid = /Android/i.test(ua);
const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

function toast(msg){
  const t=$("toast"); if(!t) return;
  t.textContent=msg; t.classList.remove("hidden");
  clearTimeout(window.__toastTimer);
  window.__toastTimer=setTimeout(()=>t.classList.add("hidden"),2600);
}

function openModal(html){
  $("modalContent").innerHTML=html;
  $("installModal").classList.remove("hidden");
}
function closeModal(){ $("installModal").classList.add("hidden"); }
document.querySelectorAll("[data-close-modal]").forEach(x=>x.addEventListener("click",closeModal));

function iosInstructions(){
  openModal(`
    <span class="section-kicker">IPHONE / IPAD</span>
    <h3>Installer som webapp</h3>
    <p>Bruk Safari og legg e‑2008 CAN på Hjem-skjermen.</p>
    <div class="install-steps">
      <div class="install-step">Åpne denne siden i <strong>Safari</strong>.</div>
      <div class="install-step">Trykk <strong>Del</strong> i Safari.</div>
      <div class="install-step">Velg <strong>Legg til på Hjem-skjermen</strong>.</div>
      <div class="install-step">Slå på <strong>Åpne som webapp</strong> og trykk <strong>Legg til</strong>.</div>
    </div>
    <div class="compat-card">
      <div class="compat-symbol">!</div>
      <div><strong>CAN-tilkobling på iOS</strong><p>Safari støtter ikke Web Serial. Appen kan installeres, men Bluetooth Classic ELM327 kan ikke kobles til gjennom denne webversjonen på iPhone/iPad.</p></div>
    </div>`);
}

function androidInstructions(){
  openModal(`
    <span class="section-kicker">ANDROID</span>
    <h3>Installer e‑2008 CAN</h3>
    <p>Åpne siden i Chrome/Chromium over HTTPS. Når nettleseren godkjenner appen som installérbar får du direkte installasjon.</p>
    <div class="install-steps">
      <div class="install-step">Åpne denne siden i <strong>Chrome</strong>.</div>
      <div class="install-step">Trykk <strong>Installer app</strong> her i e‑2008 CAN.</div>
      <div class="install-step">Bekreft installasjonen i Chrome.</div>
      <div class="install-step">Start den fra hjemskjerm/appskuff som en vanlig app.</div>
    </div>
    <button id="modalAndroidInstall" class="primary">Installer nå</button>`);
  setTimeout(()=>{$("modalAndroidInstall")?.addEventListener("click",triggerInstall)},0);
}

async function triggerInstall(){
  if(isStandalone){ toast("Appen er allerede installert."); return; }
  if(isIOS){ iosInstructions(); return; }
  if(deferredInstallPrompt){
    deferredInstallPrompt.prompt();
    const choice=await deferredInstallPrompt.userChoice;
    if(choice?.outcome==="accepted") toast("Installasjon startet.");
    deferredInstallPrompt=null;
    updatePlatformUI();
    return;
  }
  if(isAndroid){ androidInstructions(); return; }
  openModal(`<span class="section-kicker">INSTALLASJON</span><h3>Installer webappen</h3><p>Bruk nettleserens meny og velg Installer app / Legg til på hjemskjermen. Appen må åpnes over HTTPS.</p>`);
}

function updatePlatformUI(){
  const title=$("platformTitle"), txt=$("platformText"), icon=$("platformIcon");
  if(isStandalone){
    icon.textContent="✓"; title.textContent="Appen er installert"; txt.textContent="Kjører som frittstående webapp.";
  } else if(isIOS){
    icon.textContent="●"; title.textContent="iPhone / iPad oppdaget"; txt.textContent="Installer via Safari → Del → Legg til på Hjem-skjermen.";
  } else if(isAndroid){
    icon.textContent="A"; title.textContent="Android oppdaget"; txt.textContent=deferredInstallPrompt ? "Klar for installasjon fra Chrome." : "Chrome/Chromium anbefales for Bluetooth Classic.";
  } else {
    icon.textContent="◉"; title.textContent="Nettleser oppdaget"; txt.textContent="Installer som PWA dersom nettleseren støtter det.";
  }

  // Be explicit about CAN transport support.
  if(!("serial" in navigator) && !isStandalone){
    txt.textContent += " Web Serial er ikke tilgjengelig i denne nettleseren.";
  }
}

window.addEventListener("beforeinstallprompt", e=>{
  e.preventDefault();
  deferredInstallPrompt=e;
  updatePlatformUI();
});
window.addEventListener("appinstalled", ()=>{
  deferredInstallPrompt=null;
  toast("e‑2008 CAN er installert.");
  updatePlatformUI();
});
updatePlatformUI();

$("installBtn")?.addEventListener("click",triggerInstall);
$("heroInstallBtn")?.addEventListener("click",triggerInstall);
$("androidInstallBtn")?.addEventListener("click",triggerInstall);
$("iosGuideBtn")?.addEventListener("click",iosInstructions);
$("platformAction")?.addEventListener("click",()=>showTab("installPanel"));

// -------- Connection --------
async function connect(){
  if(!("serial" in navigator)){
    if(isIOS){
      iosInstructions();
      toast("CAN via Bluetooth Classic er ikke tilgjengelig i Safari/iOS.");
    } else {
      openModal(`<span class="section-kicker">BLUETOOTH / SERIAL</span><h3>Web Serial mangler</h3><p>Åpne appen i oppdatert Chrome/Chromium over HTTPS. På Android må Bluetooth Classic-adapteren være paret med telefonen først.</p>`);
    }
    return;
  }
  try{
    port = await navigator.serial.requestPort();
    await port.open({baudRate:38400, bufferSize:32768});
    writer = port.writable.getWriter();
    readLoop();
    setStatus(true, "Tilkoblet");
    $("initBtn").disabled = false;
    term("✓ Bluetooth/serial tilkoblet");
  }catch(e){
    term("FEIL: "+e.message);
  }
}

async function readLoop(){
  try{
    reader = port.readable.getReader();
    const decoder = new TextDecoder();
    while(true){
      const {value, done} = await reader.read();
      if(done) break;
      if(!value) continue;

      const s = decoder.decode(value);

      if(sniffing){
        processSniffChunk(s);
        continue;
      }

      rxBuffer += s;
      if(rxBuffer.includes(">") && waitingResolver){
        const r = rxBuffer;
        rxBuffer = "";
        const res = waitingResolver;
        waitingResolver = null;
        res(r);
      }
    }
  }catch(e){ term("Lesefeil: "+e.message); }
  finally{ try{reader?.releaseLock()}catch{} }
}

async function rawWrite(text){
  if(!writer) throw new Error("Ikke tilkoblet");
  await writer.write(enc.encode(text));
}

async function cmd(text, timeout=1800){
  if(sniffing) throw new Error("Stopp rå monitor først");
  if(!writer) throw new Error("Ikke tilkoblet");
  rxBuffer = "";
  await rawWrite(text.replace(/\s+/g,"") + "\r");
  term("TX  "+text);
  const response = await new Promise((resolve,reject)=>{
    const t = setTimeout(()=>{
      if(waitingResolver){ waitingResolver=null; reject(new Error("Timeout: "+text)); }
    }, timeout);
    waitingResolver = r => { clearTimeout(t); resolve(r); };
  });
  const clean = response.replace(/\r/g,"\n").replace(/\n+/g,"\n").trim();
  term("RX  "+clean.replace(/\n/g," | "));
  return clean;
}

async function initElm(){
  const seq = ["ATZ","ATI","ATS0","ATE0","ATL0","ATSP6","ATDP","ATST16","ATCAF1","ATAL","ATFCSM1"];
  try{
    for(const c of seq) await cmd(c, c==="ATZ" ? 3000:1800);
    $("startBtn").disabled = false;
    $("sniffStartBtn").disabled = false;
    term("✓ ELM initialisert for 11-bit 500 kbit/s CAN");
  }catch(e){ term("Init-feil: "+e.message); }
}

// -------- Diagnostic polling --------
function hexBytes(s){
  const m = s.match(/[0-9A-Fa-f]{2}/g);
  return m ? m.map(x=>parseInt(x,16)) : [];
}
function u16(b,o){ return ((b[o]||0)<<8) | (b[o+1]||0); }
function u32(b,o){ return (((b[o]||0)*0x1000000)+((b[o+1]||0)<<16)+((b[o+2]||0)<<8)+(b[o+3]||0))>>>0; }

function payloadForDid(response, did){
  let s = response.toUpperCase()
    .replace(/SEARCHING\.\.\./g,"")
    .replace(/NO DATA/g,"")
    .replace(/STOPPED/g,"")
    .replace(/>/g,"");
  const lines = s.split(/[\r\n|]+/).map(x=>x.replace(/[^0-9A-F]/g,"")).filter(Boolean);
  const marker = "62"+did;
  for(const line of lines){
    const idx = line.indexOf(marker);
    if(idx>=0) return hexBytes(line.slice(idx+marker.length));
  }
  const all = lines.join("");
  const idx = all.indexOf(marker);
  if(idx>=0) return hexBytes(all.slice(idx+marker.length));
  return null;
}

function decodeSignal(sig, payload){
  if(sig.kind==="vin_mode09") return null;
  if(!payload) return null;
  const o = sig.offset||0;
  let v;
  if(sig.kind==="u8") v=(payload[o]??0)*(sig.factor??1)+(sig.add??0);
  else if(sig.kind==="u16be") v=u16(payload,o)*(sig.factor??1)+(sig.add??0);
  else if(sig.kind==="u32be") v=u32(payload,o)*(sig.factor??1)+(sig.add??0);
  else if(sig.kind==="bool_u8_gt0") return (payload[o]??0)>0;
  else if(sig.kind==="custom" && sig.did==="D816") v=(76800-u32(payload,o))*0.018;
  else if(sig.kind==="array_u16be"){
    const arr=[]; for(let i=0;i<sig.count;i++) arr.push(u16(payload,o+i*2)*(sig.factor??1)+(sig.add??0));
    return arr;
  } else if(sig.kind==="array_u8"){
    const arr=[]; for(let i=0;i<sig.count;i++) arr.push((payload[o+i]??0)*(sig.factor??1)+(sig.add??0));
    return arr;
  } else if(sig.kind==="array_min_u16be"){
    const arr=[];
    for(let i=o;i+1<payload.length;i+=2){
      let x=u16(payload,i)*(sig.factor??1)+(sig.add??0);
      if(x>100 && x<=110) x=100;
      if(x>=50 && x<=100) arr.push(x);
    }
    return arr.length ? Math.min(...arr) : null;
  } else return null;
  if(Number.isFinite(v) && sig.min!==undefined && (v<sig.min || v>sig.max)) return null;
  return v;
}

function fmt(v){
  if(Array.isArray(v)){
    const valid=v.filter(Number.isFinite);
    if(!valid.length) return "—";
    const min=Math.min(...valid), max=Math.max(...valid);
    return `${valid.length} stk • ${min.toFixed(3)}–${max.toFixed(3)}`;
  }
  if(typeof v==="boolean") return v ? "JA" : "NEI";
  if(typeof v==="number"){
    const a=Math.abs(v);
    return a>=100 ? v.toFixed(0) : a>=10 ? v.toFixed(1) : v.toFixed(3).replace(/0+$/,"").replace(/\.$/,"");
  }
  return String(v);
}

async function ensureSetup(ecu){
  if(currentSetupKey===ecu.key) return;
  for(const c of ecu.setup) await cmd(c);
  currentSetupKey=ecu.key;
}

async function pollSignal(ecu, sig){
  await ensureSetup(ecu);
  const response = await cmd(sig.command, sig.kind.startsWith("array_") ? 3500 : 1800);
  if(sig.kind==="vin_mode09"){
    const compact=response.toUpperCase().replace(/[^0-9A-F]/g,"");
    const p=compact.indexOf("4902");
    let vin="";
    if(p>=0){
      const bytes=hexBytes(compact.slice(p+4));
      for(const b of bytes){ if((b>=48&&b<=57)||(b>=65&&b<=90)) vin+=String.fromCharCode(b); }
      vin=vin.slice(-17);
    }
    if(vin.length===17){
      signalState.set(ecu.key+":"+sig.did,{display:vin,raw:response});
      addLog(sig.name, vin, sig.unit, sig.did, ecu);
    }
    return;
  }
  const payload = payloadForDid(response, sig.did);
  const value = decodeSignal(sig,payload);
  if(value!==null && value!==undefined){
    signalState.set(ecu.key+":"+sig.did,{display:fmt(value),value,raw:response});
    addLog(sig.name, Array.isArray(value)?JSON.stringify(value):value, sig.unit, sig.did, ecu);
  }
}

function addLog(name,value,unit,did,ecu){
  logRows.push({time:new Date().toISOString(),name,value,unit,did,requestId:ecu.request_id,responseId:ecu.response_id});
  if(logRows.length>20000) logRows.shift();
  $("rowCount").textContent=logRows.length+" rader";
}

async function liveLoop(){
  const fast = [];
  for(const ecu of DB.ecus){
    for(const sig of ecu.signals){
      if(!["D440","D442","D426","0902"].includes(sig.did)) fast.push({ecu,sig});
    }
  }
  while(live){
    for(const x of fast){
      if(!live) break;
      try{ await pollSignal(x.ecu,x.sig); }catch(e){ term("Poll: "+e.message); }
      renderTiles();
      await new Promise(r=>setTimeout(r,25));
    }
  }
}

function startLive(){
  if(sniffing) return;
  live=true;
  $("startBtn").disabled=true;
  $("stopBtn").disabled=false;
  $("sniffStartBtn").disabled=true;
  liveLoop();
}
function stopLive(){
  live=false;
  $("startBtn").disabled=false;
  $("stopBtn").disabled=true;
  $("sniffStartBtn").disabled=false;
}

// -------- CAN Sniffer --------

// Accept common ELM monitor formats:
// "123 8 11 22 33 44 55 66 77 88"
// "123 11 22 33 44 55 66 77 88"
// "7E8 8 02 41 0C ..."
// Header must be a 3-hex 11-bit CAN ID.
function parseMonitorLine(line){
  line = line.trim().toUpperCase();
  if(!line || line==="STOPPED" || line==="BUFFER FULL" || line===">") return null;
  line = line.replace(/\s+/g," ");
  const parts = line.split(" ").filter(Boolean);
  if(!/^[0-7][0-9A-F]{2}$/.test(parts[0]||"")) return null;

  const id = parts[0];
  let rest = parts.slice(1);
  let dlc = null;

  if(rest.length && /^[0-8]$/.test(rest[0])){
    dlc = parseInt(rest[0],10);
    rest = rest.slice(1);
  }
  const data = rest.filter(x=>/^[0-9A-F]{2}$/.test(x)).map(x=>parseInt(x,16));
  if(dlc===null) dlc = Math.min(data.length,8);
  if(!data.length) return null;
  return {id, dlc, data:data.slice(0,Math.max(dlc,data.length))};
}

function processSniffChunk(s){
  sniffLineBuffer += s.replace(/\r/g,"\n");
  const lines = sniffLineBuffer.split("\n");
  sniffLineBuffer = lines.pop() || "";
  for(const line of lines){
    const f = parseMonitorLine(line);
    if(f) processFrame(f);
  }
}

function processFrame(frame){
  const now = performance.now();
  const wall = new Date().toISOString();
  sniffFrames++;

  let st = sniffMap.get(frame.id);
  if(!st){
    st = {
      id:frame.id, count:0, first:now, last:now, prev:null, data:frame.data.slice(),
      dlc:frame.dlc, byteChanges:Array(8).fill(0), byteMin:Array(8).fill(255),
      byteMax:Array(8).fill(0), byteSeen:Array.from({length:8},()=>new Set()),
      eventStats:{}
    };
    sniffMap.set(frame.id, st);
  }

  st.count++;
  st.last = now;
  st.dlc = frame.dlc;

  if(st.prev){
    for(let i=0;i<Math.min(8,frame.data.length);i++){
      if(st.prev[i]!==undefined && st.prev[i]!==frame.data[i]) st.byteChanges[i]++;
    }
  }

  for(let i=0;i<Math.min(8,frame.data.length);i++){
    const v=frame.data[i];
    st.byteMin[i]=Math.min(st.byteMin[i],v);
    st.byteMax[i]=Math.max(st.byteMax[i],v);
    st.byteSeen[i].add(v);
  }

  const event = (Date.now() < currentEventUntil) ? currentEvent : "";
  if(event){
    if(!st.eventStats[event]) st.eventStats[event]=Array.from({length:8},()=>({n:0,min:255,max:0,sum:0,changes:0,last:null}));
    for(let i=0;i<Math.min(8,frame.data.length);i++){
      const e=st.eventStats[event][i], v=frame.data[i];
      e.n++; e.min=Math.min(e.min,v); e.max=Math.max(e.max,v); e.sum+=v;
      if(e.last!==null && e.last!==v) e.changes++;
      e.last=v;
    }
  }

  st.prev = st.data ? st.data.slice() : null;
  st.data = frame.data.slice();

  sniffRawRows.push({
    time:wall, id:frame.id, dlc:frame.dlc,
    data:frame.data.map(x=>x.toString(16).padStart(2,"0").toUpperCase()).join(" "),
    event
  });
  if(sniffRawRows.length>100000) sniffRawRows.shift();

  if(!renderSniffTimer){
    renderSniffTimer=setTimeout(()=>{
      renderSniffTimer=null;
      renderSniffer();
    },120);
  }
}

function baselineChanged(st){
  const base = sniffBaseline.get(st.id);
  if(!base) return false;
  const n=Math.max(base.length,st.data.length);
  for(let i=0;i<n;i++) if(base[i]!==st.data[i]) return true;
  return false;
}

function hzFor(st){
  const seconds=(st.last-st.first)/1000;
  return seconds>0 ? st.count/seconds : 0;
}

function activityBars(st){
  const max=Math.max(1,...st.byteChanges);
  return `<div class="activity">${
    st.byteChanges.map((c,i)=>{
      const h=Math.max(2,Math.round(20*c/max));
      return `<i title="Byte ${i}: ${c} endringer, ${st.byteSeen[i].size} verdier" style="height:${h}px"></i>`;
    }).join("")
  }</div>`;
}

function renderSniffer(){
  const filter=$("sniffFilter").value.trim().toUpperCase().replace(/^0X/,"");
  const onlyChanged=$("onlyChanged").checked;
  const freeze=$("freezeRows").checked;

  let rows=[...sniffMap.values()];
  if(filter) rows=rows.filter(x=>x.id.includes(filter));
  if(onlyChanged) rows=rows.filter(baselineChanged);

  if(!freeze){
    rows.sort((a,b)=>{
      const ac=baselineChanged(a)?1:0, bc=baselineChanged(b)?1:0;
      if(ac!==bc) return bc-ac;
      return hzFor(b)-hzFor(a);
    });
  } else {
    rows.sort((a,b)=>parseInt(a.id,16)-parseInt(b.id,16));
  }

  $("sniffBody").innerHTML = rows.map(st=>{
    const base=sniffBaseline.get(st.id);
    const changed=baselineChanged(st);
    const bytes=st.data.map((v,i)=>{
      const ch=base && base[i]!==v;
      const active=st.byteChanges[i]>0;
      return `<span class="byte ${ch?"changed":""} ${active?"active":""}" title="B${i}">${v.toString(16).padStart(2,"0").toUpperCase()}</span>`;
    }).join("");
    const changeTxt = base ? st.data.map((v,i)=>base[i]===v?"·":"▲").join(" ") : "—";
    return `<tr class="${changed?"changed":""}">
      <td><strong>0x${st.id}</strong></td>
      <td>${hzFor(st).toFixed(1)}</td>
      <td>${st.dlc}</td>
      <td>${bytes}</td>
      <td>${changeTxt}</td>
      <td>${activityBars(st)}</td>
      <td>${(st.last/1000).toFixed(1)}s</td>
    </tr>`;
  }).join("");

  $("sniffFrameCount").textContent=sniffFrames.toLocaleString("no-NO");
  $("sniffIdCount").textContent=sniffMap.size;
  $("sniffChangedCount").textContent=[...sniffMap.values()].filter(baselineChanged).length;
  $("activeEvent").textContent=(Date.now()<currentEventUntil && currentEvent)?currentEvent:"—";
  renderCandidates();
}

function setBaseline(){
  sniffBaseline.clear();
  for(const [id,st] of sniffMap) sniffBaseline.set(id, st.data.slice());
  renderSniffer();
}

function markEvent(name){
  name=(name||"").trim();
  if(!name) return;
  currentEvent=name;
  currentEventUntil=Date.now()+5000;
  $("activeEvent").textContent=name+" (5s)";
  term("EVENT: "+name);
  setTimeout(()=>renderSniffer(),5100);
}

function scoreCandidates(){
  const out=[];
  for(const st of sniffMap.values()){
    for(let i=0;i<Math.min(8,st.dlc||8);i++){
      const span=st.byteMax[i]-st.byteMin[i];
      const unique=st.byteSeen[i].size;
      const changes=st.byteChanges[i];
      if(unique<2 || changes<2) continue;

      const eventScores=[];
      for(const [event, arr] of Object.entries(st.eventStats)){
        const e=arr[i];
        if(e && e.n>=2){
          eventScores.push({
            event,
            span:e.max-e.min,
            mean:e.sum/e.n,
            changes:e.changes,
            n:e.n
          });
        }
      }
      let eventBoost=eventScores.reduce((a,e)=>a + Math.min(15,e.changes) + Math.min(20,e.span/4),0);
      let score=Math.log2(unique+1)*8 + Math.log2(changes+1)*6 + Math.min(40,span/3) + eventBoost;
      out.push({
        id:st.id, byte:i, unique, changes, span, score,
        min:st.byteMin[i], max:st.byteMax[i], events:eventScores
      });
    }

    // Also scan adjacent 16-bit big-endian words using current global min/max approximation from raw rows.
    for(let i=0;i<Math.min(7,(st.dlc||8)-1);i++){
      const vals=[];
      let n=0;
      for(let r=sniffRawRows.length-1;r>=0 && n<4000;r--){
        const row=sniffRawRows[r];
        if(row.id!==st.id) continue;
        const b=row.data.split(" ").map(x=>parseInt(x,16));
        if(b.length>i+1){ vals.push((b[i]<<8)|b[i+1]); n++; }
      }
      if(vals.length<8) continue;
      const mn=Math.min(...vals), mx=Math.max(...vals);
      const span=mx-mn;
      const uniq=new Set(vals).size;
      if(uniq<4 || span<4) continue;
      const score=Math.log2(uniq+1)*5 + Math.min(35,span/200);
      out.push({id:st.id, word:`B${i}-B${i+1}`, unique:uniq, span, score, min:mn, max:mx, events:[]});
    }
  }
  return out.sort((a,b)=>b.score-a.score).slice(0,30);
}

function renderCandidates(){
  const cands=scoreCandidates();
  $("candidateList").innerHTML=cands.length ? cands.map(c=>{
    const target=c.word || `B${c.byte}`;
    const ev=(c.events||[]).map(e=>`<span class="tag">${e.event}</span>`).join("");
    return `<div class="candidate">
      <strong>0x${c.id} ${target}</strong>
      <span class="tag">score ${c.score.toFixed(1)}</span>
      ${ev}
      <div class="muted">min ${c.min}, maks ${c.max}, spenn ${c.span}, unike ${c.unique}</div>
    </div>`;
  }).join("") : `<div class="muted">Ingen kandidater ennå. Kjør monitor og merk noen hendelser.</div>`;
}

async function startSniffer(){
  if(live) stopLive();
  if(sniffing) return;
  try{
    // Configure ELM for raw 11-bit CAN headers and no auto formatting.
    const setup=["ATSP6","ATH1","ATS1","ATL0","ATE0","ATCAF0","ATAL","ATCRA"];
    for(const c of setup){
      // ATCRA with no parameter is clone-dependent; ignore failure.
      try{ await cmd(c,1600); }catch(e){ term("Sniffer setup: "+c+" → "+e.message); }
    }

    sniffing=true;
    sniffLineBuffer="";
    rxBuffer="";
    $("sniffStartBtn").disabled=true;
    $("sniffStopBtn").disabled=false;
    $("baselineBtn").disabled=false;
    $("startBtn").disabled=true;
    term("TX  ATMA (rå CAN monitor)");
    await rawWrite("ATMA\r");
  }catch(e){
    sniffing=false;
    term("Sniffer-feil: "+e.message);
  }
}

async function stopSniffer(){
  if(!sniffing) return;
  try{
    // ELM327 monitor commands stop when any character is received.
    await rawWrite(" ");
    await new Promise(r=>setTimeout(r,300));
    sniffing=false;
    sniffLineBuffer="";
    currentSetupKey="";
    $("sniffStartBtn").disabled=false;
    $("sniffStopBtn").disabled=true;
    $("startBtn").disabled=false;
    term("✓ Rå monitor stoppet");
    renderSniffer();
  }catch(e){
    sniffing=false;
    term("Stoppfeil: "+e.message);
  }
}

function clearSniffer(){
  sniffFrames=0;
  sniffRawRows=[];
  sniffMap.clear();
  sniffBaseline.clear();
  currentEvent="";
  currentEventUntil=0;
  renderSniffer();
}

function exportLearned(){
  const candidates=scoreCandidates();
  const ids=[...sniffMap.values()].map(st=>({
    can_id:"0x"+st.id,
    dlc:st.dlc,
    observed_frames:st.count,
    estimated_hz:Number(hzFor(st).toFixed(2)),
    last_data:st.data.map(x=>x.toString(16).padStart(2,"0").toUpperCase()),
    bytes:st.byteChanges.map((changes,i)=>({
      index:i,
      min:st.byteMin[i]===255?null:st.byteMin[i],
      max:st.byteMax[i],
      unique_values:st.byteSeen[i].size,
      changes
    })),
    event_stats:st.eventStats
  }));

  const learned={
    format:"e2008-can-autodecode",
    version:2,
    exported_at:new Date().toISOString(),
    vehicle:DB.vehicle,
    bus:DB.bus,
    notes:[
      "Automatisk observert database. Ikke bekreftet DBC.",
      "Bruk hendelsesmerking og flere kjøresituasjoner før signaler navngis."
    ],
    ids,
    candidate_signals:candidates
  };
  downloadBlob(JSON.stringify(learned,null,2),"application/json",
    "e2008_learned_can_"+new Date().toISOString().replace(/[:.]/g,"-")+".json");
}

function downloadBlob(content,type,name){
  const blob=new Blob([content],{type});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=name;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

function exportSniffCsv(){
  const esc=x=>`"${String(x??"").replace(/"/g,'""')}"`;
  const cols=["time","id","dlc","data","event"];
  const csv=[cols.join(","),...sniffRawRows.map(r=>cols.map(c=>esc(r[c])).join(","))].join("\n");
  downloadBlob(csv,"text/csv;charset=utf-8",
    "e2008_raw_can_"+new Date().toISOString().replace(/[:.]/g,"-")+".csv");
}

function exportDiagCsv(){
  const esc = x => `"${String(x??"").replace(/"/g,'""')}"`;
  const cols=["time","name","value","unit","did","requestId","responseId"];
  const csv=[cols.join(","),...logRows.map(r=>cols.map(c=>esc(r[c])).join(","))].join("\n");
  downloadBlob(csv,"text/csv;charset=utf-8",
    "e2008_diag_"+new Date().toISOString().replace(/[:.]/g,"-")+".csv");
}

$("connectBtn").addEventListener("click",connect);
$("initBtn").addEventListener("click",initElm);
$("startBtn").addEventListener("click",startLive);
$("stopBtn").addEventListener("click",stopLive);
$("csvBtn").addEventListener("click",exportDiagCsv);

$("sniffStartBtn").addEventListener("click",startSniffer);
$("sniffStopBtn").addEventListener("click",stopSniffer);
$("baselineBtn").addEventListener("click",setBaseline);
$("clearSniffBtn").addEventListener("click",clearSniffer);
$("learnBtn").addEventListener("click",exportLearned);
$("sniffCsvBtn").addEventListener("click",exportSniffCsv);
$("sniffFilter").addEventListener("input",renderSniffer);
$("onlyChanged").addEventListener("change",renderSniffer);
$("freezeRows").addEventListener("change",renderSniffer);
document.querySelectorAll(".eventBtn").forEach(b=>b.addEventListener("click",()=>markEvent(b.dataset.event)));
$("customEventBtn").addEventListener("click",()=>markEvent($("customEvent").value));

renderTiles();
renderSniffer();

if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
