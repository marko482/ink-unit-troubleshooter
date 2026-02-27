/**
 * Clean structure:
 * - boot() runs once
 * - loads: views -> parts -> initial view/hotspots
 * - render() only draws hotspots (no side-effects)
 * - search UI is built once + event delegation (no listener leaks)
 */

const STORAGE_KEY = "ink_guide_hotspots_v1";

const img = document.getElementById("diagramImg");
const layer = document.getElementById("hotspotLayer");
const panel = document.getElementById("panel");
const statusEl = document.getElementById("status");
const viewSelect = document.getElementById("viewSelect");

const btnToggleEdit = document.getElementById("toggleEdit");
const btnAddBox = document.getElementById("addBox");
const btnDeleteBox = document.getElementById("deleteBox");
const btnSaveLocal = document.getElementById("saveLocal");
const btnExport = document.getElementById("exportJson");
const imgWrap = document.getElementById("imgWrap");

let views = [];
let currentView = null;

let parts = {};      // object keyed by id
let hotspots = [];   // [{id,x,y,w,h}, ...]

let editMode = false;
let selectedId = null;
let dragState = null;

let booted = false;



//--------WIZARD DATA STRUCTURE (EXAMPLE)-------- ADD MORE WIZARDS/STEPLISTS AS NEEDED --------
const wizards = [
  {
    id: "no_ink_at_head",
    title: "No ink at head",
    description: "Start here when the head is starving / no delivery.",
    startStep: "s1",
    steps: {
      s1: {
        title: "Confirm ink supply + obvious restrictions",
        text: "Make sure ink supply is present and lines aren’t pinched.",
        bullets: [
          "Verify ink level / supply valve open",
          "Check for kinked feed line",
          "Check for obvious leaks / air being pulled in"
        ],
        next: "s2"
      },
      s2: {
        title: "Check F10 filter (restriction)",
        hotspotId: "f10Filter",
        bullets: [
          "Inspect/replace if dirty",
          "If recurring contamination: check upstream cleanliness"
        ],
        passNext: "s3",
        failNext: "s3",
        passLabel: "Filter OK → Next",
        failLabel: "Replaced/cleaned → Next"
      },
      s3: {
        title: "Check meniscus feed pump operation",
        hotspotId: "feedPump",
        bullets: [
          "Verify air supply/reservoir",
          "Confirm pump actuates and holds pressure",
          "Check throttle valve setting if applicable"
        ],
        next: "s4"
      },
      s4: {
        title: "Check 3-way magnetic valve routing",
        hotspotId: "threeWayMagneticValve",
        bullets: [
          "Confirm valve actuates during command",
          "Verify correct hose routing",
          "Check for debris/sticking"
        ],
        next: null
      }
    }
  },

  {
    id: "ink_dripping",
    title: "Ink dripping / too positive",
    description: "Start here when meniscus is too high / dripping.",
    startStep: "d1",
    steps: {
      d1: {
        title: "Check return pull (return pump + restrictions)",
        hotspotId: "meniscusPumpReturnLine",
        bullets: [
          "Inspect return restrictions/kinks",
          "Confirm return pump actuates",
          "Inspect F2/F10 if used in return path"
        ],
        next: null
      }
    }
  }
];


//--------END WIZARD DATA STRUCTURE--------





//--------UTILITY FUNCTIONS--------




function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[m]));
}

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

function getScale() {
  const sx = img.clientWidth / img.naturalWidth;
  const sy = img.clientHeight / img.naturalHeight;
  return { sx, sy };
}

function render() {
  if (!img.naturalWidth) return; // image not ready yet
  layer.innerHTML = "";

  const { sx, sy } = getScale();
  const frag = document.createDocumentFragment();

  for (const h of hotspots) {
    if (!h || !h.id) continue;

    const el = document.createElement("div");
    el.className = "hotspot" + (h.id === selectedId ? " selected" : "");
    el.dataset.id = h.id;

    el.style.left = (h.x * sx) + "px";
    el.style.top = (h.y * sy) + "px";
    el.style.width = (h.w * sx) + "px";
    el.style.height = (h.h * sy) + "px";

    // Only show handles on the selected hotspot in edit mode
    if (editMode && h.id === selectedId) {
      el.appendChild(makeHandle("tl"));
      el.appendChild(makeHandle("br"));
    }

    frag.appendChild(el);
  }

  layer.appendChild(frag);
}

function makeHandle(pos) {
  const h = document.createElement("div");
  h.className = "handle " + pos;
  h.dataset.handle = pos;
  return h;
}

function showPart(id) {
  const p = parts[id];
  if (!p) {
    panel.querySelector("#searchResults").innerHTML =
      `<div class="muted">No part found for id: <b>${escapeHtml(id)}</b></div>`;
    return;
  }

  const details = document.getElementById("partDetails");
  details.innerHTML = `
    <h2>${escapeHtml(p.name || id)}</h2>
    ${p.photo ? `
      <img src="${escapeHtml(p.photo)}"
           style="width:100%;max-height:260px;object-fit:contain;border:1px solid #ddd;border-radius:8px;margin:10px 0;"
           onerror="this.style.display='none'">
    ` : ""}

    <div>${(p.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>
    <p class="muted">${escapeHtml(p.desc || "")}</p>

    <h3>Symptoms</h3>
    <ul>${(p.symptoms || []).map(s => `<li>${escapeHtml(s)}</li>`).join("")}</ul>

    <h3>Checks</h3>
    <ul>${(p.checks || []).map(c => `<li>${escapeHtml(c)}</li>`).join("")}</ul>
  `;
}

function normalize(s) {
  return (s || "").toLowerCase().trim();
}

function partText(p) {
  const tags = (p.tags || []).join(" ");
  const symptoms = (p.symptoms || []).join(" ");
  const checks = (p.checks || []).join(" ");
  return normalize([p.name, p.desc, tags, symptoms, checks].join(" "));
}

function searchParts(query) {
  const q = normalize(query);
  if (!q) return [];

  const results = [];
  for (const [id, p] of Object.entries(parts)) {
    if (partText(p).includes(q)) results.push({ id, p });
  }

  results.sort((a, b) => {
    const an = normalize(a.p.name).includes(q) ? 0 : 1;
    const bn = normalize(b.p.name).includes(q) ? 0 : 1;
    return an - bn || String(a.p.name).localeCompare(String(b.p.name));
  });

  return results;
}

function renderSearchResults(items, query) {
  const resultsEl = document.getElementById("searchResults");

  if (!query) {
    resultsEl.innerHTML = `<div class="muted">Search by name, tag, symptom, or check.</div>`;
    return;
  }
  if (!items.length) {
    resultsEl.innerHTML = `<div class="muted">No matches for "${escapeHtml(query)}".</div>`;
    return;
  }

  resultsEl.innerHTML = items.map(({ id, p }) => `
    <button class="btn" style="width:100%; text-align:left; margin:6px 0;"
            data-part-id="${escapeHtml(id)}">
      <div style="font-weight:600;">${escapeHtml(p.name || id)}</div>
      <div class="muted">${escapeHtml((p.tags || []).join(" • "))}</div>
    </button>
  `).join("");
}


//--------SIDE PANEL FOR SEARCH/WIZARD CONTENT--------
function buildPanelOnce() {
  panel.innerHTML = `
    <div style="display:flex; gap:8px; margin-bottom:12px;">
      <button id="tabSearch" class="btn" type="button">Search</button>
      <button id="tabWizard" class="btn" type="button">Wizard</button>
    </div>

    <div id="panelBody"></div>
  `;

  document.getElementById("tabSearch").addEventListener("click", () => renderSearchPanel());
  document.getElementById("tabWizard").addEventListener("click", () => renderWizardHome());

  // default tab
  renderWizardHome();
}

//PANEL RENDERERS (SEARCH + WIZARD)
function renderSearchPanel(){
  const body = document.getElementById("panelBody");
  body.innerHTML = `
    <div style="display:flex; gap:8px; margin-bottom:12px;">
      <input id="searchInput" placeholder="Search parts, tags, symptoms..."
        style="flex:1; padding:10px 12px; border:1px solid #ccc; border-radius:10px; font-size:14px;">
      <button id="clearSearch" class="btn" type="button">Clear</button>
    </div>

    <div id="searchResults"></div>
    <hr style="border:none;border-top:1px solid #eee;margin:12px 0;">

    <div id="partDetails">
      <h2>Click a component</h2>
      <div class="muted">Use search or click a hotspot on the diagram.</div>
    </div>
  `;

  const searchInput = document.getElementById("searchInput");
  const clearBtn = document.getElementById("clearSearch");
  const resultsEl = document.getElementById("searchResults");

  searchInput.addEventListener("input", () => {
    const q = searchInput.value;
    renderSearchResults(searchParts(q), q);
  });

  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    renderSearchResults([], "");
    searchInput.focus();
    document.getElementById("partDetails").innerHTML = `
      <h2>Click a component</h2>
      <div class="muted">Use search or click a hotspot on the diagram.</div>
    `;
  });

  resultsEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-part-id]");
    if (!btn) return;
    const id = btn.getAttribute("data-part-id");
    selectedId = hotspots.some(h => h.id === id) ? id : null;
    showPart(id);
    render();
    if (selectedId) scrollHotspotIntoView(selectedId);
  });

  renderSearchResults([], "");
}

function renderWizardHome(){
  const body = document.getElementById("panelBody");
  body.innerHTML = `
    <h2>Troubleshooting Wizard</h2>
    <div class="muted" style="margin-bottom:12px;">Pick a symptom to start a guided checklist.</div>

    <div id="wizardList"></div>
    <hr style="border:none;border-top:1px solid #eee;margin:12px 0;">
    <div id="wizardStep"></div>
  `;

  const list = document.getElementById("wizardList");
  list.innerHTML = wizards.map(w => `
    <button class="btn" style="width:100%; text-align:left; margin:6px 0;"
            data-wizard-id="${escapeHtml(w.id)}">
      <div style="font-weight:600;">${escapeHtml(w.title)}</div>
      <div class="muted">${escapeHtml(w.description || "")}</div>
    </button>
  `).join("");

  list.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-wizard-id]");
    if (!btn) return;
    startWizard(btn.getAttribute("data-wizard-id"));
  });

  document.getElementById("wizardStep").innerHTML = `
    <div class="muted">Select a symptom above.</div>
  `;
}
//-----------------------------------


function initViewSelect() {
  if (!viewSelect) return;
  viewSelect.innerHTML = views.map(v => `<option value="${escapeHtml(v.id)}">${escapeHtml(v.name)}</option>`).join("");
  viewSelect.addEventListener("change", async () => {
    await setView(viewSelect.value);
  });
}

async function loadViews() {
  views = await fetchJson("./data/views.json");
}

async function loadParts() {
  parts = await fetchJson("./data/parts.json");
  console.log("Loaded parts:", Object.keys(parts).length);
}

async function loadHotspots(path) {
  hotspots = await fetchJson(path);
}

async function setView(viewId) {
  const v = views.find(x => x.id === viewId);
  if (!v) return;

  currentView = v;
  selectedId = null;
  editMode = false;
  btnToggleEdit.textContent = "Edit: OFF";
  btnAddBox.disabled = true;
  btnDeleteBox.disabled = true;

  await loadHotspots(v.hotspots);

  img.src = v.image;

  const after = () => render();
  if (img.complete && img.naturalWidth) after();
  else img.addEventListener("load", after, { once: true });

  setStatus(`View: ${v.name}`);
}

function toggleEdit() {
  editMode = !editMode;
  selectedId = null;

  btnToggleEdit.textContent = `Edit: ${editMode ? "ON" : "OFF"}`;
  btnAddBox.disabled = !editMode;
  btnDeleteBox.disabled = true;

  setStatus(editMode ? "Edit mode: drag to move, corners to resize." : "");
  render();
}

function addBox() {
  const newId = `part_${Date.now()}`;
  hotspots.push({ id: newId, x: 50, y: 50, w: 200, h: 140 });
  selectedId = newId;
  setStatus(`Added ${newId}. Rename in hotspot JSON + add part entry.`);
  btnDeleteBox.disabled = false;
  render();
}

function deleteBox() {
  if (!selectedId) return;
  hotspots = hotspots.filter(h => h.id !== selectedId);
  selectedId = null;
  btnDeleteBox.disabled = true;
  render();
}

function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(hotspots));
  setStatus("Saved hotspots to local browser storage.");
}

function exportData() {
  const out = JSON.stringify(hotspots, null, 2);
  const details = document.getElementById("partDetails");
  details.innerHTML = `
    <h2>Export Hotspots</h2>
    <div class="muted">Copy/paste into your hotspots JSON file.</div>
    <textarea style="width:100%;height:55vh;font-family:ui-monospace,Consolas,monospace;">${out}</textarea>
  `;
}

function updateBoxElement(el, hot) {
  const { sx, sy } = getScale();
  el.style.left = (hot.x * sx) + "px";
  el.style.top = (hot.y * sy) + "px";
  el.style.width = (hot.w * sx) + "px";
  el.style.height = (hot.h * sy) + "px";
}


//--------WIZARD LOGIC--------
let activeWizard = null;
let activeStepId = null;

function startWizard(wizardId){
  activeWizard = wizards.find(w => w.id === wizardId);
  if (!activeWizard) return;
  activeStepId = activeWizard.startStep;
  renderWizardStep();
}

function renderWizardStep(){
  const stepHost = document.getElementById("wizardStep");
  if (!stepHost || !activeWizard || !activeStepId) return;

  const step = activeWizard.steps[activeStepId];
  if (!step){
    stepHost.innerHTML = `<div class="muted">Wizard step not found.</div>`;
    return;
  }

  // highlight + jump if step points to a part/hotspot
  if (step.hotspotId){
    selectedId = hotspots.some(h => h.id === step.hotspotId) ? step.hotspotId : null;
    render();
    if (selectedId) scrollHotspotIntoView(selectedId);
  } else {
    selectedId = null;
    render();
  }

  stepHost.innerHTML = `
    <h3 style="margin:0 0 6px;">${escapeHtml(step.title)}</h3>
    ${step.text ? `<div class="muted" style="margin-bottom:10px;">${escapeHtml(step.text)}</div>` : ""}

    ${step.bullets?.length ? `
      <ul>${step.bullets.map(b => `<li>${escapeHtml(b)}</li>`).join("")}</ul>
    ` : ""}

    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
      ${step.hotspotId ? `<button class="btn" id="btnOpenPart" type="button">Open Part</button>` : ""}
      ${step.passNext ? `<button class="btn" id="btnPass" type="button">${escapeHtml(step.passLabel || "Pass")}</button>` : ""}
      ${step.failNext ? `<button class="btn" id="btnFail" type="button">${escapeHtml(step.failLabel || "Fail")}</button>` : ""}
      ${step.next ? `<button class="btn" id="btnNext" type="button">Next</button>` : ""}
      <button class="btn" id="btnBack" type="button">Back</button>
      <button class="btn" id="btnExit" type="button">Exit</button>
    </div>
  `;

  // wire buttons (these are recreated per step, so wiring here is fine)
  if (step.hotspotId){
    document.getElementById("btnOpenPart")?.addEventListener("click", () => {
      // Switch to Search tab and show part details
      renderSearchPanel();
      showPart(step.hotspotId);
      selectedId = step.hotspotId;
      render();
      scrollHotspotIntoView(step.hotspotId);
    });
  }

  document.getElementById("btnNext")?.addEventListener("click", () => {
    activeStepId = step.next;
    renderWizardStep();
  });

  document.getElementById("btnPass")?.addEventListener("click", () => {
    activeStepId = step.passNext;
    renderWizardStep();
  });

  document.getElementById("btnFail")?.addEventListener("click", () => {
    activeStepId = step.failNext;
    renderWizardStep();
  });

  document.getElementById("btnBack")?.addEventListener("click", () => {
    // simple back: restart wizard (easy). Upgrade later to true history stack.
    activeStepId = activeWizard.startStep;
    renderWizardStep();
  });

  document.getElementById("btnExit")?.addEventListener("click", () => {
    activeWizard = null;
    activeStepId = null;
    renderWizardHome();
  });
}

function scrollHotspotIntoView(id){
  try{
    const el = layer.querySelector(`.hotspot[data-id="${CSS.escape(id)}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }catch(e){}
}


// Layer click (hotspots) + edit drag/resize (delegated)
layer.addEventListener("click", (e) => {
  const boxEl = e.target.closest(".hotspot");
  if (!boxEl) return;

  const id = boxEl.dataset.id;

  if (!editMode) {
    selectedId = id;
    showPart(id);
    render();
  } else {
    selectedId = id;
    btnDeleteBox.disabled = false;
    render();
  }
});

layer.addEventListener("pointerdown", (e) => {
  if (!editMode) return;

  const boxEl = e.target.closest(".hotspot");
  if (!boxEl) return;

  e.preventDefault();

  const id = boxEl.dataset.id;
  selectedId = id;
  btnDeleteBox.disabled = false;

  const hot = hotspots.find(h => h.id === id);
  if (!hot) return;

  const handle = e.target?.dataset?.handle;
  const mode = handle === "tl" ? "resize-tl"
            : handle === "br" ? "resize-br"
            : "move";

  const { sx, sy } = getScale();

  dragState = {
    id, mode, boxEl, sx, sy,
    px: e.clientX, py: e.clientY,
    x: hot.x, y: hot.y, w: hot.w, h: hot.h
  };

  layer.setPointerCapture(e.pointerId);
});

layer.addEventListener("pointermove", (e) => {
  if (!dragState) return;

  e.preventDefault();

  const hot = hotspots.find(h => h.id === dragState.id);
  if (!hot) return;

  const dx = (e.clientX - dragState.px) / dragState.sx;
  const dy = (e.clientY - dragState.py) / dragState.sy;

  if (dragState.mode === "move") {
    hot.x = Math.max(0, dragState.x + dx);
    hot.y = Math.max(0, dragState.y + dy);
  } else if (dragState.mode === "resize-br") {
    hot.w = Math.max(30, dragState.w + dx);
    hot.h = Math.max(30, dragState.h + dy);
  } else if (dragState.mode === "resize-tl") {
    hot.x = Math.max(0, dragState.x + dx);
    hot.y = Math.max(0, dragState.y + dy);
    hot.w = Math.max(30, dragState.w - dx);
    hot.h = Math.max(30, dragState.h - dy);
  }

  updateBoxElement(dragState.boxEl, hot);
});

layer.addEventListener("pointerup", () => {
  if (!dragState) return;
  dragState = null;
  render();
});

layer.addEventListener("pointercancel", () => {
  dragState = null;
  render();
});

// Deselect when clicking blank image area
imgWrap.addEventListener("click", (e) => {
  const clickedHotspot = e.target.closest(".hotspot");
  if (clickedHotspot) return;

  selectedId = null;
  btnDeleteBox.disabled = true;
  render();
});

// Buttons
btnToggleEdit.addEventListener("click", toggleEdit);
btnAddBox.addEventListener("click", addBox);
btnDeleteBox.addEventListener("click", deleteBox);
btnSaveLocal.addEventListener("click", saveLocal);
btnExport.addEventListener("click", exportData);

window.addEventListener("resize", () => render());

// ---- boot ----
async function boot() {
  if (booted) return;
  booted = true;

  buildPanelOnce();

  try {
    await loadViews();
    await loadParts();
    initViewSelect();

    // Pick first view by default
    const initial = views[0]?.id;
    if (initial) {
      viewSelect.value = initial;
      await setView(initial);
    } else {
      setStatus("No views found in views.json");
    }
  } catch (err) {
    console.error(err);
    panel.innerHTML = `
      <h2>Startup error</h2>
      <div class="muted">${escapeHtml(String(err))}</div>
    `;
  }
}

boot();