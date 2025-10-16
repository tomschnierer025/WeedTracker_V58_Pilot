/* === WeedTracker V58 Pilot — Full Build === */
document.addEventListener("DOMContentLoaded", () => {
  // ---------- helpers ----------
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const today = () => new Date().toISOString().slice(0,10);
  const nowTime = () => new Date().toTimeString().slice(0,5);
  const fmt = (n,d=0)=> (n==null||n==="")?"–":Number(n).toFixed(d);

  // ---------- storage & seeds ----------
  const STORAGE_KEY = "weedtracker_data";
  const BACKUP_KEY  = "weedtracker_backup";
  const MAX_BACKUPS = 3;

  const NSW_WEEDS_40 = [
    "African Boxthorn (noxious)","African Lovegrass (noxious)","Bathurst Burr (noxious)","Blackberry (noxious)",
    "Cape Broom (noxious)","Chilean Needle Grass (noxious)","Coolatai Grass (noxious)","Fireweed (noxious)",
    "Gorse (noxious)","Lantana (noxious)","Patterson’s Curse (noxious)","Serrated Tussock (noxious)",
    "St John’s Wort (noxious)","Sweet Briar (noxious)","Willow spp. (noxious)",
    "African Feathergrass","Artichoke Thistle","Balloon Vine","Blue Heliotrope","Bridal Creeper","Caltrop",
    "Coltsfoot","Fleabane","Flax-leaf Broom","Fountain Grass","Galvanised Burr","Giant Parramatta Grass",
    "Glycine","Green Cestrum","Horehound","Khaki Weed","Noogoora Burr","Parthenium Weed","Prickly Pear (common)",
    "Saffron Thistle","Silverleaf Nightshade","Spear Thistle","Sweet Vernal Grass","Three-cornered Jack","Wild Radish"
  ];

  const DEFAULT_CHEMS = [
    {name:"Crucial", active:"Glyphosate 540 g/L", containerSize:20, containerUnit:"L", containers:4, threshold:2},
    {name:"SuperWet", active:"Non-ionic surfactant", containerSize:20, containerUnit:"L", containers:1, threshold:1},
    {name:"Bow Saw 600", active:"Triclopyr 600 g/L", containerSize:1, containerUnit:"L", containers:2, threshold:1},
    {name:"Clethodim", active:"Clethodim 240 g/L", containerSize:20, containerUnit:"L", containers:1, threshold:1},
    {name:"Grazon", active:"Triclopyr + Picloram", containerSize:20, containerUnit:"L", containers:1, threshold:1},
    {name:"Bosol", active:"Metsulfuron-methyl", containerSize:500, containerUnit:"g", containers:2, threshold:1},
    {name:"Hastings", active:"MCPA", containerSize:20, containerUnit:"L", containers:1, threshold:1},
    {name:"Outright", active:"Fluroxypyr", containerSize:20, containerUnit:"L", containers:1, threshold:1}
  ];

  function backupDB(db){
    try{
      const existing = JSON.parse(localStorage.getItem(BACKUP_KEY) || "[]");
      existing.unshift({ ts: new Date().toISOString(), db });
      while (existing.length > MAX_BACKUPS) existing.pop();
      localStorage.setItem(BACKUP_KEY, JSON.stringify(existing));
    }catch(e){ console.warn("Backup failed", e); }
  }
  function restoreLatest(){
    const stacks = JSON.parse(localStorage.getItem(BACKUP_KEY) || "[]");
    if (!stacks.length) return null;
    const latest = stacks[0].db;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(latest));
    return latest;
  }

  function ensureDB() {
    let db;
    try { db = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
    catch { db = {}; }
    db.version ??= 58;
    db.accountEmail ??= "";
    db.tasks ??= [];
    db.batches ??= [];
    db.chems ??= [];
    db.procurement ??= [];
    db.weeds ??= NSW_WEEDS_40.slice();
    if (!db.chems.length) db.chems = DEFAULT_CHEMS.slice();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    return db;
  }
  let DB = ensureDB();

  // Splash removal + optional restore
  setTimeout(()=> $("#splash")?.remove(), 900);
  if ((!DB.tasks.length && !DB.batches.length && !DB.chems.length) && localStorage.getItem(BACKUP_KEY)){
    if (confirm("Backup found. Restore data now?")) {
      const r = restoreLatest();
      if (r){ DB = r; }
    }
  }

  const saveDB = (doBackup=true) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DB));
    if (doBackup) backupDB(DB);
  };

  // ---------- nav ----------
  const screens = $$(".screen");
  function switchScreen(id) {
    screens.forEach(s => s.classList.remove("active"));
    $("#"+id)?.classList.add("active");
    if (id === "records") renderRecords();
    if (id === "batches") renderBatches();
    if (id === "inventory") renderChems();
    if (id === "mapping") renderMap(true);
  }
  $$("[data-target]").forEach(btn => btn.addEventListener("click", ()=> switchScreen(btn.dataset.target)));
  $$(".home-btn").forEach(b => b.addEventListener("click", (e)=>{ e.preventDefault(); e.stopPropagation(); switchScreen("home"); }));

  // ---------- spinner ----------
  const spinner = $("#spinner");
  const spin = (on)=> spinner?.classList[on?"add":"remove"]("active");

  // ---------- settings ----------
  const accountInput = $("#accountEmail");
  accountInput && (accountInput.value = DB.accountEmail || "");
  $("#saveAccount")?.addEventListener("click", ()=>{ DB.accountEmail = accountInput.value.trim(); saveDB(); toast("Saved"); });
  $("#exportBtn")?.addEventListener("click", ()=>{
    const blob=new Blob([JSON.stringify(DB,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="weedtracker_data.json"; a.click();
  });
  $("#clearBtn")?.addEventListener("click", ()=>{
    if (!confirm("Clear ALL local data?")) return;
    localStorage.removeItem(STORAGE_KEY);
    DB = ensureDB();
    renderRecords(); renderBatches(); renderChems(); renderMap();
  });
  $("#restoreBtn")?.addEventListener("click", ()=>{
    const r = restoreLatest();
    if (r){ DB = r; renderRecords(); renderBatches(); renderChems(); renderMap(); toast("Restored"); }
    else toast("No backup found");
  });

  // ---------- reminder 1–52 ----------
  const remSel = $("#reminderWeeks");
  if (remSel && !remSel.options.length) for (let i=1;i<=52;i++){ const o=document.createElement("option"); o.value=o.textContent=i; remSel.appendChild(o); }

  // ---------- create task ----------
  const taskTypeSel = $("#taskType");
  const roadTrackBlock = $("#roadTrackBlock");
  const syncTrackVis = ()=> roadTrackBlock.style.display = (taskTypeSel.value === "Road Spray") ? "block" : "none";
  taskTypeSel?.addEventListener("change", syncTrackVis); syncTrackVis();

  // location then auto-name
  const locateBtn = $("#locateBtn");
  const locRoad = $("#locRoad");
  let currentRoad = "";
  locateBtn?.addEventListener("click", ()=>{
    spin(true);
    if (!navigator.geolocation){ spin(false); toast("Enable location"); return; }
    navigator.geolocation.getCurrentPosition(async pos=>{
      const {latitude:lat, longitude:lon} = pos.coords;
      try{
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
        const j = await r.json();
        currentRoad = j.address?.road || j.display_name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
      }catch{ currentRoad = `${lat.toFixed(5)}, ${lon.toFixed(5)}`; }
      locRoad.textContent = currentRoad; spin(false);
    }, ()=>{ spin(false); toast("GPS failed"); });
  });

  $("#autoNameBtn")?.addEventListener("click", ()=>{
    const t = $("#taskType").value;
    const prefix = (t||"Task").split(" ").map(w=>w[0]).join("").toUpperCase(); // I / S / RS
    const date = today().replaceAll("-","");
    const base = currentRoad || "Unknown";
    $("#jobName").value = `${prefix}${date}_${base.replace(/\s+/g,"")}`;
  });

  // weather incl humidity
  $("#autoWeatherBtn")?.addEventListener("click", ()=>{
    if (!navigator.geolocation){ toast("Enable location services"); return; }
    navigator.geolocation.getCurrentPosition(async pos=>{
      try{
        const { latitude, longitude } = pos.coords;
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m`;
        const r = await fetch(url); const j = await r.json(); const c = j.current || {};
        $("#temp").value = c.temperature_2m ?? "";
        $("#wind").value = c.wind_speed_10m ?? "";
        $("#windDir").value = (c.wind_direction_10m ?? "") + (c.wind_direction_10m!=null?"°":"");
        $("#humidity").value = c.relative_humidity_2m ?? "";
        $("#wxUpdated").textContent = "Updated @ " + nowTime();
      }catch(e){ console.warn(e); toast("Weather unavailable"); }
    }, ()=> toast("Location not available"));
  });

  // weeds select (noxious first)
  function populateWeeds(){
    const sel = $("#weedSelect"); if (!sel) return;
    sel.innerHTML = "";
    const nox = DB.weeds.filter(w=>/noxious/i.test(w)).sort((a,b)=>a.localeCompare(b));
    const rest = DB.weeds.filter(w=>! /noxious/i.test(w)).sort((a,b)=>a.localeCompare(b));
    const all = ["— Select Weed —", ...nox, ...rest];
    all.forEach(w=>{
      const o=document.createElement("option");
      o.value = w==="— Select Weed —" ? "" : w;
      o.textContent = w;
      if (/noxious/i.test(w)) o.textContent = "⚠ " + w;
      sel.appendChild(o);
    });
  }
  populateWeeds();

  // batch select
  function populateBatchSelect(){
    const sel=$("#batchSelect"); if (!sel) return;
    sel.innerHTML=""; const def=document.createElement("option"); def.value=""; def.textContent="— Select Batch —"; sel.appendChild(def);
    DB.batches.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")).forEach(b=>{
      const o=document.createElement("option");
      o.value=b.id; o.textContent=`${b.id} • ${b.date} • remain ${fmt(b.remaining??b.mix??0)} L`;
      sel.appendChild(o);
    });
  }
  populateBatchSelect();

  // roadside tracking
  let tracking=false, trackTimer=null, trackCoords=[];
  $("#startTrack")?.addEventListener("click", ()=>{
    trackCoords=[]; tracking=true; $("#trackStatus").textContent="Tracking…";
    if (trackTimer) clearInterval(trackTimer);
    if (!navigator.geolocation){ toast("Enable location"); return; }
    trackTimer = setInterval(()=> navigator.geolocation.getCurrentPosition(p=> trackCoords.push([p.coords.latitude,p.coords.longitude])), 5000);
  });
  $("#stopTrack")?.addEventListener("click", ()=>{
    tracking=false; if (trackTimer) clearInterval(trackTimer);
    $("#trackStatus").textContent=`Stopped (${trackCoords.length} pts)`;
    localStorage.setItem("lastTrack", JSON.stringify(trackCoords));
  });

  // photo upload (DataURL)
  let photoDataURL = "";
  $("#photoInput")?.addEventListener("change", async (e)=>{
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { photoDataURL = String(reader.result||""); $("#photoPreview").src = photoDataURL; $("#photoPreview").style.display="block"; };
    reader.readAsDataURL(f);
  });

  // save task
  $("#saveTask")?.addEventListener("click", ()=> saveTask(false));
  $("#saveDraft")?.addEventListener("click", ()=> saveTask(true));
  function saveTask(isDraft){
    spin(true);
    const id=Date.now();
    const status=isDraft?"Draft":($("input[name='status']:checked")?.value||"Incomplete");
    const obj={
      id,
      name: $("#jobName").value.trim() || ("Task_"+id),
      council: $("#councilNum").value.trim(),
      linkedInspectionId: $("#linkInspectionId").value.trim(),
      type: $("#taskType").value,
      weed: $("#weedSelect").value,
      batch: $("#batchSelect").value,
      date: $("#jobDate").value || today(),
      start: $("#startTime").value || "",
      end: $("#endTime").value || "",
      temp: $("#temp").value, wind: $("#wind").value, windDir: $("#windDir").value, humidity: $("#humidity").value,
      reminder: $("#reminderWeeks").value || "",
      status, notes: $("#notes").value || "",
      coords: trackCoords.slice(),
      photo: photoDataURL || "",            // << store photo
      createdAt:new Date().toISOString(), archived:false
    };
    const existing = DB.tasks.find(t=> t.name===obj.name);
    if (existing) Object.assign(existing, obj); else DB.tasks.push(obj);

    // link & archive inspection if provided
    if (obj.linkedInspectionId){
      const insp = DB.tasks.find(t=> t.type==="Inspection" && (String(t.id)===obj.linkedInspectionId || t.name===obj.linkedInspectionId));
      if (insp){ insp.archived=true; insp.status="Archived"; obj.linkedInspectionResolved=true; }
    }

    // consume batch (simple heuristic)
    if (obj.batch){
      const b = DB.batches.find(x=>x.id===obj.batch);
      if (b){
        const used = (obj.type==="Road Spray" && obj.coords?.length>1) ? 100 : 0;
        b.used = (b.used||0)+used;
        b.remaining = Math.max(0, (Number(b.mix)||0) - (b.used||0));
      }
    }

    saveDB(); populateBatchSelect(); renderRecords(); renderMap();
    spin(false); toast("Saved");
    // reset transient photo preview
    // (keep if editing same job by name)
  }

  // records
  $("#recSearchBtn")?.addEventListener("click", renderRecords);
  $("#recResetBtn")?.addEventListener("click", ()=>{
    $("#recSearch").value=""; $("#recFrom").value=""; $("#recTo").value="";
    ["fInspection","fSpot","fRoad","fComplete","fIncomplete","fDraft"].forEach(id=>{$("#"+id).checked=false;}); // start empty
    renderRecords();
  });

  function recordMatches(t,q,from,to,types,statuses){
    if (t.archived) return false;
    if (from && (t.date||"")<from) return false;
    if (to && (t.date||"")>to) return false;
    if (q){ const hay=`${t.name} ${t.weed} ${t.council}`.toLowerCase(); if (!hay.includes(q.toLowerCase())) return false; }
    const typeOK=( (!types.inspection && !types.spot && !types.road) // none checked → accept all
                   || (t.type==="Inspection"&&types.inspection) || (t.type==="Spot Spray"&&types.spot) || (t.type==="Road Spray"&&types.road) );
    if (!typeOK) return false;
    const s=t.status||"Incomplete";
    const statusesEmpty = !statuses.complete && !statuses.incomplete && !statuses.draft;
    const statusOK = statusesEmpty || (s==="Complete"&&statuses.complete) || (s==="Incomplete"&&statuses.incomplete) || (s==="Draft"&&statuses.draft);
    return statusOK;
  }
  function renderRecords(){
    const list=$("#recordsList"); if (!list) return; list.innerHTML="";
    const q=$("#recSearch").value.trim(); const from=$("#recFrom").value; const to=$("#recTo").value;
    const types={inspection:$("#fInspection").checked, spot:$("#fSpot").checked, road:$("#fRoad").checked};
    const statuses={complete:$("#fComplete").checked, incomplete:$("#fIncomplete").checked, draft:$("#fDraft").checked};
    DB.tasks.filter(t=>recordMatches(t,q,from,to,types,statuses))
      .sort((a,b)=>(b.date||"").localeCompare(a.date||""))
      .forEach(t=>{
        const d=document.createElement("div"); d.className="item";
        d.innerHTML=`<b>${t.name}</b><br><small>${t.type} • ${t.date} • ${t.status}</small>
          <div class="row end"><button class="pill" data-open="${t.id}">Open</button></div>`;
        d.querySelector("[data-open]")?.addEventListener("click", ()=> showJobPopup(t));
        list.appendChild(d);
      });
  }
  renderRecords();

  function showJobPopup(t){
    const batchLink = t.batch ? `<a href="#" data-open-batch="${t.batch}">${t.batch}</a>` : "—";
    const linkedInsp = t.linkedInspectionId ? `<a href="#" data-open-insp="${t.linkedInspectionId}">${t.linkedInspectionId}</a>` : "—";
    const photoHtml = t.photo ? `<div style="margin:.4rem 0"><img src="${t.photo}" alt="photo" style="max-width:100%;border-radius:8px"/></div>` : "";
    const html=`
      <div class="modal">
        <div class="card p">
          <h3 style="margin-top:0">${t.name}</h3>
          <div class="grid two tight">
            <div><b>Type:</b> ${t.type}</div><div><b>Status:</b> ${t.status}</div>
            <div><b>Date:</b> ${t.date}</div><div><b>Start:</b> ${t.start || "–"} · <b>Finish:</b> ${t.end || "–"}</div>
            <div><b>Weed:</b> ${t.weed || "—"}</div><div><b>Batch:</b> ${batchLink}</div>
            <div><b>Linked Inspection:</b> ${linkedInsp}</div><div><b>Reminder:</b> ${t.reminder || "—"} wk</div>
            <div class="span2"><b>Weather:</b> ${fmt(t.temp)}°C, ${fmt(t.wind)} km/h, ${t.windDir||"–"}, ${fmt(t.humidity)}%</div>
            <div class="span2"><b>Notes:</b> ${t.notes || "—"}</div>
          </div>
          ${photoHtml}
          <div class="row gap end" style="margin-top:.8rem;">
            <button class="pill" data-edit>Edit</button>
            <button class="pill warn" data-close>Close</button>
          </div>
        </div>
      </div>`;
    const w=document.createElement("div"); w.innerHTML=html; document.body.appendChild(w.firstChild);
    const modal=$(".modal");
    modal?.addEventListener("click",(e)=>{ if(e.target===modal || e.target.dataset.close!=null) modal.remove(); });

    $("[data-open-batch]",modal)?.addEventListener("click",(e)=>{ e.preventDefault(); const b=DB.batches.find(x=>x.id===t.batch); b && showBatchPopup(b); });
    $("[data-open-insp]",modal)?.addEventListener("click",(e)=>{ e.preventDefault(); const insp=DB.tasks.find(x=>x.type==="Inspection"&&(String(x.id)===t.linkedInspectionId||x.name===t.linkedInspectionId)); insp && showJobPopup(insp); });

    $("[data-edit]",modal)?.addEventListener("click",()=>{
      switchScreen("createTask");
      $("#jobName").value=t.name; $("#councilNum").value=t.council||""; $("#linkInspectionId").value=t.linkedInspectionId||"";
      $("#taskType").value=t.type; $("#taskType").dispatchEvent(new Event("change"));
      $("#weedSelect").value=t.weed||""; $("#batchSelect").value=t.batch||"";
      $("#jobDate").value=t.date||today(); $("#startTime").value=t.start||""; $("#endTime").value=t.end||"";
      $("#temp").value=t.temp||""; $("#wind").value=t.wind||""; $("#windDir").value=t.windDir||""; $("#humidity").value=t.humidity||"";
      $("#notes").value=t.notes||"";
      if (t.photo){ $("#photoPreview").src=t.photo; $("#photoPreview").style.display="block"; }
      modal.remove();
    });
  }

  // batches
  $("#batSearchBtn")?.addEventListener("click", renderBatches);
  $("#batResetBtn")?.addEventListener("click", ()=>{ $("#batFrom").value=""; $("#batTo").value=""; renderBatches(); });
  $("#newBatch")?.addEventListener("click", ()=>{
    const id="B"+Date.now(); const mix=Number(prompt("Total mix (L):","600"))||0;
    const chemicals=prompt("Chemicals (e.g. 'Crucial 1.5L/100L, Wetter 300mL/100L'):","")||"";
    const obj={id, date:today(), time:nowTime(), mix, remaining:mix, used:0, chemicals};
    DB.batches.push(obj); saveDB(); populateBatchSelect(); renderBatches();
  });

  function renderBatches(){
    const list=$("#batchList"); if(!list) return; list.innerHTML="";
    const from=$("#batFrom").value||""; const to=$("#batTo").value||"";
    DB.batches.filter(b=>(!from||b.date>=from)&&(!to||b.date<=to))
      .sort((a,b)=>(b.date||"").localeCompare(a.date||""))
      .forEach(b=>{
        const item=document.createElement("div"); item.className="item";
        item.innerHTML=`<b>${b.id}</b><br><small>${b.date} • Total ${fmt(b.mix)} L • Remaining ${fmt(b.remaining)} L</small>
                        <div class="row end"><button class="pill" data-open="${b.id}">Open</button></div>`;
        item.querySelector("[data-open]")?.addEventListener("click",()=> showBatchPopup(b));
        list.appendChild(item);
      });
  }
  renderBatches();

  function showBatchPopup(b){
    const jobs=DB.tasks.filter(t=>t.batch===b.id);
    const jobsHtml= jobs.length ? `<ul>${jobs.map(t=>`<li><a href="#" data-open-job="${t.id}">${t.name}</a></li>`).join("")}</ul>` : "—";
    const html=`
      <div class="modal">
        <div class="card p">
          <h3 style="margin-top:0">${b.id}</h3>
          <div><b>Date:</b> ${b.date || "–"} · <b>Time:</b> ${b.time || "–"}</div>
          <div><b>Total Mix Made:</b> ${fmt(b.mix)} L</div>
          <div><b>Total Mix Remaining:</b> ${fmt(b.remaining)} L</div>
          <div style="margin-top:.4rem;"><b>Chemicals (made of):</b><br>${b.chemicals || "—"}</div>
          <div style="margin-top:.4rem;"><b>Linked Jobs:</b><br>${jobsHtml}</div>
          <div class="row gap end" style="margin-top:.8rem;">
            <button class="pill" data-edit-batch>Edit</button>
            <button class="pill warn" data-close>Close</button>
          </div>
        </div>
      </div>`;
    const w=document.createElement("div"); w.innerHTML=html; document.body.appendChild(w.firstChild);
    const modal=$(".modal");
    modal?.addEventListener("click",(e)=>{ if(e.target===modal || e.target.dataset.close!=null) modal.remove(); });
    $$("[data-open-job]",modal).forEach(a=> a.addEventListener("click",(e)=>{ e.preventDefault(); const t=DB.tasks.find(x=> String(x.id)===a.dataset.openJob); t && showJobPopup(t); }));
    $("[data-edit-batch]",modal)?.addEventListener("click",()=>{
      const mix=Number(prompt("Total mix (L):",b.mix))||b.mix;
      const rem=Number(prompt("Remaining (L):",b.remaining))||b.remaining;
      const chems=prompt("Chemicals:",b.chemicals||"")||b.chemicals||"";
      b.mix=mix; b.remaining=rem; b.chemicals=chems; b.time ||= nowTime();
      saveDB(); modal.remove(); renderBatches(); populateBatchSelect();
    });
  }

  // inventory (full-screen editor wired from previous build)
  $("#addChem")?.addEventListener("click", ()=>{
    const name=prompt("Chemical name:"); if (!name) return;
    const active=prompt("Active ingredient:", "")||"";
    const size=Number(prompt("Container size (number):","20"))||0;
    const unit=prompt("Unit (L, mL, g):","L")||"L";
    const count=Number(prompt("How many containers:","0"))||0;
    const thr=Number(prompt("Reorder threshold (containers):","0"))||0;
    DB.chems.push({name,active,containerSize:size,containerUnit:unit,containers:count,threshold:thr});
    saveDB(); renderChems(); renderProcurement();
  });

  function upsertProcurement(title){
    if (!DB.procurement.find(p=>p.title===title)){
      DB.procurement.push({id:"P"+Date.now()+Math.random().toString(16).slice(2), title, createdAt:new Date().toISOString(), done:false});
      saveDB();
    }
  }

  // Full-screen chemical editor hooks (from previous build)
  let _chemEditing = null;
  function openChemEditor(c) {
    _chemEditing = c;
    $("#ce_name").value = c.name || "";
    $("#ce_active").value = c.active || "";
    $("#ce_size").value = c.containerSize || 0;
    $("#ce_unit").value = c.containerUnit || "L";
    $("#ce_count").value = c.containers || 0;
    $("#ce_threshold").value = c.threshold || 0;
    $("#chemEditSheet").style.display = "block";
  }
  function closeChemEditor() { $("#chemEditSheet").style.display = "none"; _chemEditing = null; }
  $("#ce_cancel")?.addEventListener("click", closeChemEditor);
  $("#ce_save")?.addEventListener("click", ()=>{
    if (!_chemEditing) return;
    _chemEditing.name = $("#ce_name").value.trim();
    _chemEditing.active = $("#ce_active").value.trim();
    _chemEditing.containerSize = Number($("#ce_size").value) || 0;
    _chemEditing.containerUnit = $("#ce_unit").value || "L";
    _chemEditing.containers = Number($("#ce_count").value) || 0;
    _chemEditing.threshold = Number($("#ce_threshold").value) || 0;
    saveDB(); renderChems(); renderProcurement(); closeChemEditor(); toast("Chemical updated");
  });

  function renderChems(){
    const list=$("#chemList"); if(!list) return; list.innerHTML="";
    DB.chems.slice().sort((a,b)=>a.name.localeCompare(b.name)).forEach(c=>{
      const total = (c.containers||0) * (c.containerSize||0);
      const line = `${c.containers} × ${fmt(c.containerSize)} ${c.containerUnit} • total ${fmt(total)} ${c.containerUnit}`;
      const card=document.createElement("div"); card.className="item";
      card.innerHTML=`<b>${c.name}</b><br><small>${line}</small><br><small>Active: ${c.active || "—"}</small>
        <div class="row gap end" style="margin-top:.4rem;">
          <button class="pill" data-edit>Edit</button>
          <button class="pill warn" data-del>Delete</button>
        </div>`;
      if (c.threshold && c.containers < c.threshold) upsertProcurement(`Low stock: ${c.name}`);
      card.querySelector("[data-edit]")?.addEventListener("click", ()=> openChemEditor(c));
      card.querySelector("[data-del]")?.addEventListener("click", ()=>{ if (!confirm("Delete chemical?")) return; DB.chems = DB.chems.filter(x=>x!==c); saveDB(); renderChems(); renderProcurement(); });
      list.appendChild(card);
    });
  }
  renderChems();

  function renderProcurement(){
    const ul = $("#procList");
    if (!ul) return;
    ul.innerHTML = "";
    DB.chems.forEach(c=>{
      if (c.threshold && (c.containers||0) < c.threshold){
        const li = document.createElement("li");
        li.textContent = `Low stock: ${c.name} (${c.containers||0} < ${c.threshold})`;
        ul.appendChild(li);
      }
    });
  }
  renderProcurement();

  // mapping with Locate Me + clickable pins
  let map, locateBtn;
  function ensureMap(){
    if (map) return map;
    map = L.map("map").setView([-34.75,148.65], 10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19}).addTo(map);
    // locate-me button
    locateBtn = L.control({position:"bottomright"});
    locateBtn.onAdd = function(){
      const d=L.DomUtil.create("div","leaflet-bar");
      d.style.background="#0c7d2b"; d.style.color="#fff"; d.style.borderRadius="6px"; d.style.padding="6px 10px"; d.style.cursor="pointer";
      d.innerText="Locate Me";
      d.onclick=()=>{
        if (!navigator.geolocation){ toast("Enable location"); return;}
        navigator.geolocation.getCurrentPosition(p=>{
          const pt=[p.coords.latitude,p.coords.longitude];
          map.setView(pt, 14);
          L.circleMarker(pt,{radius:7,opacity:.9}).addTo(map).bindPopup("You are here").openPopup();
        });
      };
      return d;
    };
    locateBtn.addTo(map);
    return map;
  }
  $("#mapSearchBtn")?.addEventListener("click", ()=>renderMap(true));
  $("#mapResetBtn")?.addEventListener("click", ()=>{
    $("#mapFrom").value=""; $("#mapTo").value=""; $("#mapWeed").value=""; $("#mapType").value="All"; renderMap(true);
  });

  function renderMap(fit=false){
    const m=ensureMap();
    m.eachLayer(l=>{ if (!(l instanceof L.TileLayer)) m.removeLayer(l); });

    const from=$("#mapFrom").value||""; const to=$("#mapTo").value||""; const typ=$("#mapType").value||"All";
    const weedQ = ($("#mapWeed")?.value || "").trim().toLowerCase();

    const tasks=DB.tasks
      .filter(t=>!t.archived)
      .filter(t=>(!from||t.date>=from)&&(!to||t.date<=to))
      .filter(t=> typ==="All"?true:t.type===typ)
      .filter(t=> weedQ ? (String(t.weed||"").toLowerCase().includes(weedQ)) : true);

    const group = L.featureGroup();
    tasks.forEach(t=>{
      if (t.coords?.length>1) group.addLayer(L.polyline(t.coords,{color:"yellow",weight:4,opacity:.9}));
      const pt = t.coords?.[0] || [-34.75 + Math.random()*0.1, 148.65 + Math.random()*0.1];
      const thumb = t.photo ? `<br><img src="${t.photo}" style="max-width:180px;border-radius:6px;margin-top:.3rem">` : "";
      const popup = `<b>${t.name}</b><br>${t.type} • ${t.date}${thumb}<br><button id="open_${t.id}" class="pill" style="margin-top:.4rem">Open</button>`;
      const marker = L.marker(pt); marker.bindPopup(popup);
      marker.on("popupopen", ()=> setTimeout(()=>{ const btn=document.getElementById(`open_${t.id}`); btn && (btn.onclick=()=> showJobPopup(t)); },0));
      group.addLayer(marker);
    });
    group.addTo(m);
    if (fit && tasks.length){
      try { m.fitBounds(group.getBounds().pad(0.2)); } catch {}
    }
  }

  // toast
  function toast(msg, ms=1500){
    const d=document.createElement("div");
    d.textContent=msg;
    Object.assign(d.style,{position:"fixed",bottom:"1.2rem",left:"50%",transform:"translateX(-50%)",background:"#cfffcf",color:"#030",padding:".6rem 1rem",borderRadius:"20px",boxShadow:"0 2px 6px rgba(0,0,0,.25)",zIndex:9999,fontWeight:700});
    document.body.appendChild(d); setTimeout(()=>d.remove(), ms);
  }
});
