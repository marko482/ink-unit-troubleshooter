
/**
* Hotspots are stored in IMAGE PIXELS (natural size).
* We render by scaling them to the displayed image size.
*/

const STORAGE_KEY = "ink_guide_hotspots_v1";
let views = []; // VIEWS DEFINED HERE - either hardcode or load from JSON as needed
let currentView = null;
let hotspots = []; //HOTSPOTS DEFINED HERE - either hardcode or load from JSON as needed
const viewSelect = document.getElementById("viewSelect");



console.log("hotspots embedded:", hotspots?.length, hotspots); //DEBUG to verify hotspots are present on load
// ================================================

const img = document.getElementById("diagramImg");
const layer = document.getElementById("hotspotLayer");
const panel = document.getElementById("panel");
const statusEl = document.getElementById("status");

let parts = {}; // load from JSON or define inline as needed

async function loadParts() {
    try {
        const res = await fetch("./data/parts.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status} loading parts.json`);
        parts = await res.json();
        console.log("Loaded parts:", Object.keys(parts).length);
    } catch (err) {
        console.error(err);
        panel.innerHTML = `
    <h2>Failed to load parts.json</h2>
    <div class="muted">${escapeHtml(String(err))}</div>
    `;
    }
}

function renderAfterImageReady() {
    if (img.complete && img.naturalWidth) render();
    else img.addEventListener("load", () => render(), { once: true });
}

async function setView(viewId) {
    currentView = views.find(v => v.id === viewId);
    if (!currentView) return;

    hotspots = await fetchJson(currentView.hotspots);

    img.src = currentView.image;
    renderAfterImageReady();
}
async function loadViews() {
    const res = await fetch("./data/views.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} loading views.json`);
    views = await res.json();
}

async function loadHotspots(path) {
    const res = await fetch(`./${path}`.replace("././", "./"), { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} loading hotspots`);
    hotspots = await res.json();
}

async function setView(viewId) {
    const v = views.find(x => x.id === viewId);
    if (!v) return;

    currentView = v;
    selectedId = null;
    editMode = false; // optional: force edit off when switching
    document.getElementById("toggleEdit").textContent = "Edit: OFF";
    document.getElementById("addBox").disabled = true;
    document.getElementById("deleteBox").disabled = true;

    // load hotspots for this view
    await loadHotspots(v.hotspots);

    // swap image
    img.src = v.image;

    // render after image loads (handles cached images too)
    const after = () => render();
    if (img.complete && img.naturalWidth) after();
    else img.onload = after;

    // reset panel to default/search view if you have that function
    // renderDefaultPanel();
}

async function fetchJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
    return res.json();
}

async function loadViews() {
    views = await fetchJson("./data/views.json");
}

async function loadHotspots(path) {
    hotspots = await fetchJson(path);
}

const searchInput = document.getElementById("searchInput");
const clearSearchBtn = document.getElementById("clearSearch");
const searchResultsEl = document.getElementById("searchResults");

function initViewSelect() {
    viewSelect.innerHTML = views.map(v => `<option value="${v.id}">${v.name}</option>`).join("");
    viewSelect.addEventListener("change", () => setView(viewSelect.value));
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
        const hay = partText(p);
        if (hay.includes(q)) results.push({ id, p });
    }

    // simple sort: name match first
    results.sort((a, b) => {
        const an = normalize(a.p.name).includes(q) ? 0 : 1;
        const bn = normalize(b.p.name).includes(q) ? 0 : 1;
        return an - bn || a.p.name.localeCompare(b.p.name);
    });

    return results;
}

function renderSearchResults(items, query) {
    if (!query) {
        searchResultsEl.innerHTML = `<div class="muted">Search to find parts by name, tag, symptom, or check.</div>`;
        return;
    }
    if (!items.length) {
        searchResultsEl.innerHTML = `<div class="muted">No matches for "${escapeHtml(query)}".</div>`;
        return;
    }

    searchResultsEl.innerHTML = items.map(({ id, p }) => `
    <div class="btn" style="width:100%; text-align:left; margin:6px 0;"
         data-part-id="${escapeHtml(id)}">
      <div style="font-weight:600;">${escapeHtml(p.name || id)}</div>
      <div class="muted">${escapeHtml((p.tags || []).join(" • "))}</div>
    </div>
  `).join("");

    // click handlers
    searchResultsEl.querySelectorAll("[data-part-id]").forEach(el => {
        el.addEventListener("click", () => {
            const id = el.getAttribute("data-part-id");
            showPart(id);
            // optional: highlight hotspot
            selectedId = id;
            render();
        });
    });
}

function wireSearchUI() {
    if (!searchInput) return;

    const run = () => {
        const q = searchInput.value;
        const items = searchParts(q);
        renderSearchResults(items, q);
    };

    searchInput.addEventListener("input", run);
    clearSearchBtn?.addEventListener("click", () => {
        searchInput.value = "";
        renderSearchResults([], "");
        searchInput.focus();
    });

    renderSearchResults([], "");
}

let editMode = false;
let selectedId = null;
let dragState = null;
function setStatus(msg) {
    statusEl.textContent = msg || "";
}

function getScale() {
    const sx = img.clientWidth / img.naturalWidth;
    const sy = img.clientHeight / img.naturalHeight;
    return { sx, sy };
}

function render() {
    // clear ONCE
    layer.innerHTML = "";

    const { sx, sy } = getScale();

    const frag = document.createDocumentFragment();

    for (const h of hotspots) {
        const el = document.createElement("div");
        el.className = "hotspot" + (h.id === selectedId ? " selected" : "");
        el.dataset.id = h.id;

        el.style.left = h.x * sx + "px";
        el.style.top = h.y * sy + "px";
        el.style.width = h.w * sx + "px";
        el.style.height = h.h * sy + "px";

        el.addEventListener("click", (e) => {
            if (!editMode) {
                e.stopPropagation();
                showPart(h.id);
            }
        });

        if (editMode && h.id === selectedId) {
            el.appendChild(makeHandle("tl"));
            el.appendChild(makeHandle("br"));
        }

        frag.appendChild(el);
    }

    // append ONCE
    layer.appendChild(frag);
}

function showPart(id) {
    const p = parts[id];
    if (!p) {
        panel.innerHTML = `<h2>Missing part definition: ${escapeHtml(id)}</h2>`;
        return;
    }

    panel.innerHTML = `
    <h2>${escapeHtml(p.name || id)}</h2>

    ${p.photo
            ? `
      <img src="${p.photo}"
           style="width:100%;max-height:260px;object-fit:contain;border:1px solid #ddd;border-radius:8px;margin:10px 0;"
           onerror="this.style.display='none'">
    `
            : ""
        }

    <div>${(p.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>
    <p class="muted">${escapeHtml(p.desc || "")}</p>

    <h3>Symptoms</h3>
    <ul>${(p.symptoms || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>

    <h3>Checks</h3>
    <ul>${(p.checks || []).map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>
    `;
}

function select(id) {
    selectedId = id;
    document.getElementById("deleteBox").disabled = !selectedId;
    render();
}

function toggleEdit() {
    editMode = !editMode;
    selectedId = null;
    document.getElementById("toggleEdit").textContent =
        `Edit: ${editMode ? "ON" : "OFF"}`;
    document.getElementById("addBox").disabled = !editMode;
    document.getElementById("deleteBox").disabled = true;
    setStatus(
        editMode
            ? "Click a box to select. Drag to move. Use corners to resize."
            : "",
    );
    render();
}

function addBox() {
    // new box centered-ish
    const newId = `part_${Date.now()}`;
    hotspots.push({ id: newId, x: 50, y: 50, w: 200, h: 140 });
    selectedId = newId;
    setStatus(`Added ${newId}. Rename the id in Export output.`);
    render();
}

function deleteBox() {
    if (!selectedId) return;
    hotspots = hotspots.filter((h) => h.id !== selectedId);
    selectedId = null;
    document.getElementById("deleteBox").disabled = true;
    render();
}

function saveLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hotspots));
    setStatus("Saved locally.");
}

function loadLocal() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
        hotspots = JSON.parse(raw);
        setStatus("Loaded local saved boxes.");
    } catch (e) { }
}

function exportData() {
    const out = JSON.stringify(hotspots, null, 2);
    // show in panel for copy/paste
    panel.innerHTML = `
    <h2>Export Hotspots</h2>
    <div class="muted">Copy this and replace the <b>hotspots</b> array in the HTML.</div>
    <textarea style="width:100%;height:55vh;font-family:ui-monospace,Consolas,monospace;">${out}</textarea>
    `;
}

function makeHandle(pos) {
    const h = document.createElement("div");
    h.className = "handle " + pos;
    h.dataset.handle = pos;
    return h;
}

// Move + resize (in image pixel units)
function enableDragResize(boxEl) {
    let mode = null; // "move" | "resize-tl" | "resize-br"
    let start = null;

    const id = boxEl.dataset.id;
    const hot = hotspots.find((h) => h.id === id);
    if (!hot) return;

    boxEl.onpointerdown = (e) => {
        e.stopPropagation();
        const handle = e.target?.dataset?.handle;
        if (handle === "tl") mode = "resize-tl";
        else if (handle === "br") mode = "resize-br";
        else mode = "move";

        const { sx, sy } = getScale();
        start = {
            px: e.clientX,
            py: e.clientY,
            x: hot.x,
            y: hot.y,
            w: hot.w,
            h: hot.h,
            sx,
            sy,
        };
        boxEl.setPointerCapture(e.pointerId);
    };

    boxEl.onpointermove = (e) => {
        if (!start || !mode) return;
        const dx = (e.clientX - start.px) / start.sx;
        const dy = (e.clientY - start.py) / start.sy;

        if (mode === "move") {
            hot.x = Math.max(0, start.x + dx);
            hot.y = Math.max(0, start.y + dy);
        } else if (mode === "resize-br") {
            hot.w = Math.max(30, start.w + dx);
            hot.h = Math.max(30, start.h + dy);
        } else if (mode === "resize-tl") {
            hot.x = Math.max(0, start.x + dx);
            hot.y = Math.max(0, start.y + dy);
            hot.w = Math.max(30, start.w - dx);
            hot.h = Math.max(30, start.h - dy);
        }
        render();
    };

    boxEl.onpointerup = () => {
        mode = null;
        start = null;
    };
}

document
    .getElementById("toggleEdit")
    .addEventListener("click", toggleEdit);
document.getElementById("addBox").addEventListener("click", addBox);
document.getElementById("deleteBox").addEventListener("click", deleteBox);
document.getElementById("saveLocal").addEventListener("click", saveLocal);
document
    .getElementById("exportJson")
    .addEventListener("click", exportData);

// click empty area to deselect in edit mode
document.getElementById("imgWrap").addEventListener("click", () => {
    if (editMode) {
        selectedId = null;
        document.getElementById("deleteBox").disabled = true;
        render();
    } else {
        selectedId = null;
        render();
        renderDefaultPanel();
    }
});

// Escape helpers
function escapeHtml(s) {
    return String(s).replace(
        /[&<>"']/g,
        (m) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#039;",
            })[m],
    );
}

// Init
// ===== INIT =====
loadLocal();

async function boot() {
    await loadParts();
    await loadViews();
    initViewSelect();
    await setView(views[0]?.id); // load first view by default

    wireSearchUI();
    render();
}

if (img.complete && img.naturalWidth) {
    boot();
} else {
    img.addEventListener("load", boot);
}

window.addEventListener("resize", render);

function updateBoxElement(el, hot) {
    const { sx, sy } = getScale();
    el.style.left = hot.x * sx + "px";
    el.style.top = hot.y * sy + "px";
    el.style.width = hot.w * sx + "px";
    el.style.height = hot.h * sy + "px";
}

layer.addEventListener("pointerdown", (e) => {
    if (!editMode) return;

    const boxEl = e.target.closest(".hotspot");
    if (!boxEl) return;

    e.preventDefault();
    e.stopPropagation();

    const id = boxEl.dataset.id;
    select(id);

    const hot = hotspots.find((h) => h.id === id);
    if (!hot) return;

    const handle = e.target?.dataset?.handle;
    const mode =
        handle === "tl"
            ? "resize-tl"
            : handle === "br"
                ? "resize-br"
                : "move";

    const { sx, sy } = getScale();

    dragState = {
        id,
        mode,
        boxEl,
        sx,
        sy,
        px: e.clientX,
        py: e.clientY,
        x: hot.x,
        y: hot.y,
        w: hot.w,
        h: hot.h,
    };

    layer.setPointerCapture(e.pointerId);
});

layer.addEventListener("pointermove", (e) => {
    if (!dragState) return;

    e.preventDefault();

    const hot = hotspots.find((h) => h.id === dragState.id);
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

function renderDefaultPanel() {
    panel.innerHTML = `
    <div style="display:flex; gap:8px; margin-bottom:12px;">
      <input id="searchInput" placeholder="Search parts, tags, symptoms..."
        style="flex:1; padding:10px 12px; border:1px solid #ccc; border-radius:10px; font-size:14px;">
      <button id="clearSearch" class="btn">Clear</button>
    </div>

    <div id="searchResults"></div>
    <hr style="border:none;border-top:1px solid #eee;margin:12px 0;">

    <h2>Click a component</h2>
    <div class="muted">
      Use Edit mode to create/adjust boxes.
    </div>
  `;

    wireSearchUI();  // reattach search listeners
}