
/**
* Hotspots are stored in IMAGE PIXELS (natural size).
* We render by scaling them to the displayed image size.
*/

const STORAGE_KEY = "ink_guide_hotspots_v1";

// ==== EDITABLE DATA (this is what export prints) ====
let hotspots = [
    {
        id: "lung",
        x: 500.7308333333333,
        y: 117.01185770750989,
        w: 69.91666666666666,
        h: 85.40579710144925,
    },
    {
        id: "meniscusPumpFeedLine",
        x: 875.0916666666667,
        y: 281.5335968379447,
        w: 74.90833333333332,
        h: 93.46640316205536,
    },
    {
        id: "purgePump",
        x: 555.7808333333334,
        y: 510.70223978919637,
        w: 96.4425,
        h: 94.98023715415019,
    },
    {
        id: "meniscusPumpReturnLine",
        x: 1301.6950000000002,
        y: 651.764163372859,
        w: 102.44583333333333,
        h: 84.4756258234519,
    },
    {
        id: "a2SeparatorMeniscusFLC",
        x: 722.3733333333333,
        y: 920.3820816864296,
        w: 94.94166666666666,
        h: 66.467720685112,
    },
    {
        id: "a3SeparatormeniscusRLC",
        x: 893.4683333333332,
        y: 921.8827404479578,
        w: 87.43750000000001,
        h: 69.46903820816866,
    },
    {
        id: "a1SeparatorLungCupFilter",
        x: 503.25166666666667,
        y: 218.0737812911726,
        w: 55.91999999999999,
        h: 72.4703557312253,
    },
    {
        id: "f2Filter",
        x: 380.1833333333334,
        y: 614.2476943346509,
        w: 61.923333333333325,
        h: 64.96706192358366,
    },
    {
        id: "threeWayMagneticValve",
        x: 494.24666666666667,
        y: 680.2766798418972,
        w: 175.98666666666668,
        h: 63.466403162055336,
    },
    {
        id: "throttleValve",
        x: 1004.53,
        y: 384.6469038208169,
        w: 87.4375,
        h: 51.46113306982872,
    },
    {
        id: "f10Filter",
        x: 893.4683333333334,
        y: 176.05533596837944,
        w: 51.41749999999997,
        h: 60.46508563899868,
    },
    {
        id: "twoWayMagneticValve",
        x: 512.2566666666668,
        y: 405.65612648221344,
        w: 99.44416666666666,
        h: 57.463768115942045,
    },
];

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