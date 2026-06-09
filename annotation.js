/* =============================================
   CONFIGURATION
============================================= */
const SHEET_URL      = "https://script.google.com/macros/s/AKfycbyZ0u_14oI9Nha9zZcPETZf9jLaJOr-RjB5twlGChtj4tJuVnWYf2B_JgxsCaI1KfNKkw/exec";
//const ANNOTATOR_NAME = "Annotator_T";

// ── LOGIN SCREEN ──
/* =============================================
   AUTHENTICATION
============================================= */

const auth = localStorage.getItem("annotator_auth");

if (auth !== "true") {
  window.location.href = "login.html";
}

const annotator =
  localStorage.getItem("annotator_name");

document.getElementById(
  "annotator-badge"
).textContent = annotator;


const CURRENT_ANNOTATOR =
  localStorage.getItem("annotator_name");

function loadProgressFromSheet(annotator) {
  const url = `${SHEET_URL}?type=load&annotator=${encodeURIComponent(annotator)}`;
  
  return fetch(url)   // GET request — no CORS issue
    .then(r => r.json())
    .then(res => {
      if (!res.ok || !res.data) return;
      Object.entries(res.data).forEach(([absId, saved]) => {
        if (state.annotations[absId] !== undefined) {
          state.annotations[absId] = saved.annotations || [];
          if (saved.completed) state.completed.add(absId);
        }
      });
      showToast("✓ Progress restored.");
    })
    .catch(err => {
      console.error("Load error:", err);
      showToast("⚠ Could not load progress — starting fresh.");
    });
}

  //fetch("test_abstracts.json")
  fetch(SHEET_URL + "?type=abstracts")
  .then(r => r.json())
  .then(data => {

    abstracts = data;

    abstracts.forEach(abs => {
      state.annotations[abs.abstract_id] = [];
    });

    const annotator =
      localStorage.getItem("annotator_name");

    document.getElementById(
      "annotator-badge"
    ).textContent = annotator;

    loadProgressFromSheet(annotator)
      .then(() => renderAll());
  });


  function saveProgressToSheet(absId) {
  const annotator = localStorage.getItem("annotator_name");;
  fetch(SHEET_URL, {
    method:  "POST",
    mode:    "no-cors",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      type:        "progress",
      annotator,
      abstract_id: absId,
      annotations: state.annotations[absId],
      completed:   state.completed.has(absId)
    })
  }).catch(err => console.error("Save error:", err));
}

/* =============================================
   STATE
   BUG FIX: state must be declared BEFORE fetch()
   and BEFORE any function that references it.
   Original code declared state AFTER fetch() —
   this caused a ReferenceError on load.
============================================= */
const state = {
  annotations:       {},
  completed:         new Set(),
  hidden:            new Set(),
  filter:            "all",
  pendingSelection:  null,
  pendingAbstractId: null,
  currentPage:       1,
  pageSize:          25
};

let abstracts = [];

/* =============================================
   LOAD DATA
============================================= */


/* =============================================
   OVERLAP DETECTION
   BUG FIX: Original code had no overlap check.
   Same span could be annotated multiple times.
============================================= */
function hasOverlap(absId, newStart, newEnd) {
  return (state.annotations[absId] || []).some(a =>
    newStart < a.end && newEnd > a.start
  );
}

/* =============================================
   RENDER ANNOTATED TEXT
   BUG FIX: Original used innerHTML +=
   which re-renders and loses event bindings.
   Now builds full string and sets once.
   BUG FIX: Added removeAnnotation call on span click.
============================================= */


function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}


function normalizeArabic(text) {
  if (!text || !text.trim()) return "";

  // 1. Normalize unicode (compatibility — e.g. ligatures → base chars)
  text = text.normalize("NFKC");

  // 2. Remove diacritics / tashkeel (harakat + shadda + sukun + tanwin)
  text = text.replace(/[\u064B-\u065F\u0670]/g, "");

  // 3. Remove tatweel (kashida)
  text = text.replace(/\u0640/g, "");

  // 4. Normalize Alef variants → bare Alef (ا)
  //    Covers: أ إ آ ٱ ٲ ٳ ٵ
  text = text.replace(/[\u0622\u0623\u0625\u0671\u0672\u0673\u0675]/g, "\u0627");

  // 5. Normalize Alef Maqsura (ى) → Ya (ي)
  text = text.replace(/\u0649/g, "\u064A");

  // 6. Normalize Teh Marbuta (ة) → Ha (ه)
  text = text.replace(/\u0629/g, "\u0647");

  // 7. Remove zero-width and directional characters
  text = text.replace(/[\u200B-\u200F\u202A-\u202E\uFEFF\u00AD]/g, "");

  // 8. Normalize whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
}
function findOccurrence(originalText, searchText, annotations, cursorHint) {
  const normOrig   = normalizeArabic(originalText);
  const normSearch = normalizeArabic(searchText);
  if (!normSearch) return -1;

  // Collect ALL occurrences
  const occurrences = [];
  let searchFrom = 0;
  while (true) {
    const normIdx = normOrig.indexOf(normSearch, searchFrom);
    if (normIdx === -1) break;
    const origStart = mapNormalizedToOriginal(originalText, normIdx);
    const alreadyAnnotated = (annotations || []).some(
      a => a.start === origStart
    );
    if (!alreadyAnnotated) occurrences.push(origStart);
    searchFrom = normIdx + 1;
  }

  if (!occurrences.length) return -1;

  // Pick the occurrence CLOSEST to where user clicked
  if (cursorHint !== undefined) {
    return occurrences.reduce((best, curr) =>
      Math.abs(curr - cursorHint) < Math.abs(best - cursorHint) ? curr : best
    );
  }

  return occurrences[0];
}

function mapNormalizedToOriginal(original, normalizedIdx) {
  // Walk original string, skip normalized-out chars,
  // count until we reach normalizedIdx
  let normCount = 0;
  for (let i = 0; i < original.length; i++) {
    if (normCount === normalizedIdx) return i;
    const ch = original[i];
    // Skip chars that normalizeArabic removes
    const isDiacritic    = /[\u064B-\u065F]/.test(ch);
    const isTatweel      = ch === "\u0640";
    const isZeroWidth    = /[\u200B-\u200F\u202A-\u202E\uFEFF]/.test(ch);
    if (!isDiacritic && !isTatweel && !isZeroWidth) normCount++;
  }
  return original.length;
}

/* =============================================
   CAPTURE SELECTION
   BUG FIX: Original captureSelection used
   range.cloneRange() then selectNodeContents()
   but didn't guard against empty selections or
   selections outside the target container.
   Also popup was placed at pageX/pageY which
   can clip off-screen — now clamped.
============================================= */
function captureSelection(event, abstractId) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;

  const text = selection.toString().trim();
  if (!text) return;

  // Get original raw Arabic text
  const originalText = abstracts.find(a => a.abstract_id === abstractId)?.arabic_abstract || "";

  // Find this text in the original
  //const start = findOccurrence(originalText, text, state.annotations[abstractId]);

  // Inside captureSelection, replace the findOccurrence call with:
   const range     = selection.getRangeAt(0);
    const container = document.getElementById(`arabic-${abstractId}`);
    if (!container) return;

    // Cursor hint — rough position in plain text
    const preRange = document.createRange();
    preRange.selectNodeContents(container);
    preRange.setEnd(range.startContainer, range.startOffset);
    const cursorHint = preRange.toString().length;

    const start = findOccurrence(
      originalText,
      text,
      state.annotations[abstractId],
      cursorHint
    );

  if (start === -1) {
    showToast("⚠ Could not locate selection in original text.");
    selection.removeAllRanges();
    return;
  }

  const end = start + text.length;

  console.log("Selected:", text);
  console.log("Start   :", start);
  console.log("End     :", end);
  console.log("Captured:", originalText.slice(start, end));
  console.log("Match   :", text === originalText.slice(start, end));

  console.log("text bytes   :", [...text].map(c => c.charCodeAt(0).toString(16)));
  console.log("original slice:", [...originalText.slice(originalText.length - 50)].map(c => c.charCodeAt(0).toString(16)));

  if (hasOverlap(abstractId, start, end)) {
    selection.removeAllRanges();
    showToast("⚠ Span overlaps an existing annotation.");
    return;
  }

  state.pendingSelection  = { text, start, end };
  state.pendingAbstractId = abstractId;

  const popup = document.getElementById("labelPopup");
  popup.classList.remove("hidden");
  //const range = selection.getRangeAt(0);
  const rect  = range.getBoundingClientRect();
  const px    = Math.min(event.pageX, window.innerWidth  - popup.offsetWidth  - 12);
  const py    = Math.min(event.pageY + window.scrollY,
                         window.scrollY + window.innerHeight - popup.offsetHeight - 12);
  popup.style.left = Math.max(8, px) + "px";
  popup.style.top  = Math.max(8, py) + "px";
}

function renderAnnotatedText(text, annotations) {
  if (!annotations || annotations.length === 0) return escHtml(text);

  const sorted = [...annotations].sort((a, b) => a.start - b.start);
  let result = "";
  let last   = 0;

  sorted.forEach(a => {
    // use raw text slice with original offsets
    if (a.start > last) result += escHtml(text.slice(last, a.start));
    result += `<span class="entity-${a.label.toLowerCase()}"
      onclick="removeAnnotationBySpan('${a.abstractId}', ${a.start}, ${a.end})"
      title="Click to remove · ${a.label}"
    >${escHtml(text.slice(a.start, a.end))}</span>`;
    last = a.end;
  });

  if (last < text.length) result += escHtml(text.slice(last));
  return result;
}

/* Walk DOM text nodes to get true character offset
   relative to the plain text content of container */
function getTextOffset(container, targetNode, targetOffset) {
  let offset = 0;
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node === targetNode) {
      return offset + targetOffset;
    }
    offset += node.textContent.length;
  }

  // targetNode not found as text node —
  // it may be an element node (e.g. clicked at end of span)
  // fall back: count all text up to and including targetOffset children
  if (targetNode === container || container.contains(targetNode)) {
    return offset;
  }

  return -1;
}

/* =============================================
   APPLY LABEL
============================================= */

// Add this at the top with your other state variables
let _suppressPopupClose = false;

// Update applyLabel to set the flag
function applyLabel(label) {
  if (!state.pendingSelection || state.pendingAbstractId === null) return;

  const { text, start, end } = state.pendingSelection;
  const absId = state.pendingAbstractId;

  state.annotations[absId].push({ abstractId: absId, text, start, end, label });
  window.getSelection()?.removeAllRanges();

  _suppressPopupClose = true;   // ← suppress the mousedown listener
  hidePopup();
  renderAll();
  setTimeout(() => { _suppressPopupClose = false; }, 100);  // ← re-enable after render

  if (!SHEET_URL.includes("YOUR_DEPLOYMENT")) {
    fetch(SHEET_URL, {
      method:  "POST",
      mode:    "no-cors",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ annotator: CURRENT_ANNOTATOR, abstract_id: absId, start, end, text, label })
    }).catch(err => console.error("Sheet error:", err));
  }
  saveProgressToSheet(absId);
}

// Update mousedown listener to check the flag
document.addEventListener("mousedown", e => {
  if (_suppressPopupClose) return;   // ← skip if suppressed
  const popup = document.getElementById("labelPopup");
  if (!popup.classList.contains("hidden") && !popup.contains(e.target)) {
    window.getSelection()?.removeAllRanges();
    hidePopup();
  }
});

/* =============================================
   REMOVE ANNOTATION
============================================= */
function removeAnnotationByIndex(absId, idx) {
  state.annotations[absId].splice(idx, 1);
  renderAll();
  saveProgressToSheet(absId);
}

function removeAnnotationBySpan(absId, start, end) {
  state.annotations[absId] = state.annotations[absId].filter(
    a => !(a.start === start && a.end === end)
  );
  renderAll();
  saveProgressToSheet(absId);
}

/* =============================================
   TOGGLE HELPERS
============================================= */
function toggleAbstract(id) {
  state.hidden.has(id) ? state.hidden.delete(id) : state.hidden.add(id);
  renderAll();
}

function finishAbstract(id) {
  state.completed.has(id) ? state.completed.delete(id) : state.completed.add(id);
  renderAll();
  saveProgressToSheet(id);
}

function toggleEnglish(id) {
  const div  = document.getElementById(`english-${id}`);
  const link = document.getElementById(`english-link-${id}`);
  const open = div.style.display === "block";
  div.style.display   = open ? "none"  : "block";
  link.textContent    = open ? "Show English reference" : "Hide English reference";
}

/* =============================================
   FILTER & PAGINATION
============================================= */
function setFilter(mode) {
  state.filter      = mode;
  state.currentPage = 1;    /* BUG FIX: reset to page 1 on filter change */
  document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
  const map = { all: "f-all", remaining: "f-remaining", finished: "f-finished" };
  document.getElementById(map[mode])?.classList.add("active");
  renderAll();
}

function nextPage(totalPages) {
  if (state.currentPage < totalPages) { state.currentPage++; renderAll(); window.scrollTo(0,0); }
}
function prevPage() {
  if (state.currentPage > 1) { state.currentPage--; renderAll(); window.scrollTo(0,0); }
}

/* =============================================
   POPUP
============================================= */
function hidePopup() {
  document.getElementById("labelPopup").classList.add("hidden");
  state.pendingSelection  = null;
  state.pendingAbstractId = null;
}

document.addEventListener("mousedown", e => {
  const popup = document.getElementById("labelPopup");
  if (!popup.classList.contains("hidden") && !popup.contains(e.target)) {
    window.getSelection()?.removeAllRanges();
    hidePopup();
  }
});

/* =============================================
   TOAST
============================================= */
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  t.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.classList.add("hidden"), 300);
  }, 3000);
}

/* =============================================
   RENDER ALL
============================================= */
function renderAll() {

  // ── Save scroll position before re-render ──
  const scrollY = window.scrollY;

  const container = document.getElementById("abstracts");
  container.innerHTML = "";

  /* filter */
  let visible = abstracts;
  if (state.filter === "remaining") visible = abstracts.filter(a => !state.completed.has(a.abstract_id));
  if (state.filter === "finished")  visible = abstracts.filter(a =>  state.completed.has(a.abstract_id));

  /* pagination */
  const totalPages = Math.max(1, Math.ceil(visible.length / state.pageSize));
  if (state.currentPage > totalPages) state.currentPage = totalPages;

  const start  = (state.currentPage - 1) * state.pageSize;
  const paged  = visible.slice(start, start + state.pageSize);

  /* update page indicator */
  document.getElementById("page-indicator").textContent =
    `Page ${state.currentPage} of ${totalPages}`;

  /* update progress */
  updateProgress();

  /* render cards */
  paged.forEach(abs => {
    const done   = state.completed.has(abs.abstract_id);
    const hidden = state.hidden.has(abs.abstract_id);
    const anns   = state.annotations[abs.abstract_id] || [];

    const card = document.createElement("div");
    card.className = "abstract-card" + (done ? " finished" : "");

    /* header */
    card.innerHTML = `
      <div class="abstract-header${hidden ? "" : " open"}">
        <div class="abstract-id-wrap">
          <span class="abstract-id">${abs.abstract_id}</span>
          ${done ? `<span class="done-badge">✓ Done</span>` : ""}
          ${anns.length ? `<span class="ann-count">${anns.length} entit${anns.length > 1 ? "ies" : "y"}</span>` : ""}
        </div>
        <div class="card-actions">
          <button class="act-btn${done ? " done-btn" : ""}"
            onclick="finishAbstract('${abs.abstract_id}')">
            ${done ? "Undo Done" : "Mark Done"}
          </button>
          <button class="act-btn"
            onclick="toggleAbstract('${abs.abstract_id}')">
            ${hidden ? "Show" : "Hide"}
          </button>
        </div>
      </div>`;

    /* body */
    if (!hidden) {
      const annListHTML = anns.map((a, i) => `
        <span class="annotation-item ${a.label.toLowerCase()}">
          <span class="annotation-label">${a.label}</span>
          <span class="annotation-text">${escHtml(a.text)}</span>
          <button class="ann-del" onclick="removeAnnotationByIndex('${abs.abstract_id}', ${i})" title="Remove">×</button>
        </span>`).join("");

      const hasEnglish = abs.english_abstract && abs.english_abstract.trim();;

      card.innerHTML += `
        <div class="card-body">
          <div id="arabic-${abs.abstract_id}"
              class="abstract-text"
              onmouseup="captureSelection(event, '${abs.abstract_id}')">
            ${renderAnnotatedText(abs.arabic_abstract, anns)}
          </div>
          ${anns.length ? `<div class="annotation-list">${annListHTML}</div>` : ""}
          ${hasEnglish ? `
            <div id="english-link-${abs.abstract_id}"
                 class="english-toggle"
                 onclick="toggleEnglish('${abs.abstract_id}')">
              Show English reference
            </div>
            <div id="english-${abs.abstract_id}" class="english-reference">
              <div class="reference-title">English Abstract (Reference Only)</div>
              ${escHtml(abs.english_abstract)}
            </div>` : ""}
        </div>`;
    } else {
      card.innerHTML += `<div style="padding:12px 18px;font-family:var(--font-mono);font-size:11px;color:var(--faint)">(Abstract hidden)</div>`;
    }

    container.appendChild(card);
  });

  /* pagination controls */
  document.getElementById("pagination").innerHTML = `
    <button class="pag-btn" onclick="prevPage()" ${state.currentPage === 1 ? "disabled" : ""}>← Previous</button>
    <span class="pag-label">Page ${state.currentPage} of ${totalPages}</span>
    <button class="pag-btn" onclick="nextPage(${totalPages})" ${state.currentPage === totalPages ? "disabled" : ""}>Next →</button>
  `;

  // ── Restore scroll position after re-render ──
  window.scrollTo(0, scrollY);
}

/* =============================================
   PROGRESS
============================================= */
function updateProgress() {
  const total = abstracts.length;
  const done  = state.completed.size;
  const pct   = total ? Math.round(done / total * 100) : 0;

  document.getElementById("progress-text").textContent = `${done} of ${total} done`;
  document.getElementById("progress-center").textContent = pct + "%";

  /* ring */
  const circ   = 150.8;
  const offset = circ - (pct / 100) * circ;
  document.getElementById("ring-fill").style.strokeDashoffset = offset;
}
