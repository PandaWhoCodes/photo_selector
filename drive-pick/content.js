// Drive Photo Picker — runs on drive.google.com.
// When a file preview is open (either via Drive's in-folder viewer dialog or a
// direct /file/d/<id> URL), shows a "Select" button (in the dialog toolbar if
// present, or floating bottom-right). Click it or press S to add/remove the
// photo from the list kept in chrome.storage.local under "picks".

(() => {
  const FILE_RE = /\/file\/d\/([A-Za-z0-9_-]+)/;
  const TITLE_SUFFIX = / - Google Drive$/;

  // Single constant for Drive's preview toolbar selector. Falls back to a
  // fixed floating position if Google's viewer has no visible toolbar.
  const TOOLBAR_SELECTOR = 'div[role="dialog"] div[role="toolbar"]';

  // Candidate places where Drive prints the open file's name. Tried in order;
  // document.title is the fallback.
  const NAME_SELECTORS = [
    'div[role="dialog"] [data-tooltip][aria-label]',
    'div[role="toolbar"] [aria-label][data-tooltip]',
    'div[role="dialog"] [role="heading"]',
    'div[role="toolbar"] [role="heading"]',
  ];

  let currentId = null;
  let picks = {};
  let pendingSaves = 0;
  let ui = null;

  // ---------- storage ----------

  async function loadPicks() {
    const res = await chrome.storage.local.get("picks");
    picks = res.picks || {};
  }

  async function savePicks() {
    pendingSaves++;
    try {
      await chrome.storage.local.set({ picks });
    } finally {
      pendingSaves--;
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.picks) return;
    if (pendingSaves > 0) return;
    picks = changes.picks.newValue || {};
    render();
  });

  // ---------- reading the open file ----------

  function isViewerDialogVisible(el) {
    const dialog = el?.closest?.('div[role="dialog"]');
    if (!dialog) return true;
    if (dialog.getAttribute("aria-hidden") === "true" || dialog.hidden) return false;
    const style = getComputedStyle(dialog);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function activeItemFromDom() {
    // 1. Drive's viewer dialog embeds #drive-active-item-info with JSON { id, title, mimeType }
    const infoEl = document.getElementById("drive-active-item-info");
    if (infoEl && isViewerDialogVisible(infoEl)) {
      try {
        const data = JSON.parse(infoEl.textContent || "");
        if (data && typeof data.id === "string" && data.id) {
          return {
            id: data.id,
            name: typeof data.title === "string" && data.title.trim() ? data.title.trim() : null,
          };
        }
      } catch {
        // fall through
      }
    }

    // 2. Fallback: visible viewer dialog with a preview image (/d/<id>)
    const viewer = document.querySelector('div[role="dialog"][aria-label*="viewer" i]');
    if (viewer && isViewerDialogVisible(viewer)) {
      for (const img of viewer.querySelectorAll('img[src*="/d/"]')) {
        const r = img.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        const m = img.src.match(/\/d\/([A-Za-z0-9_-]{10,})/);
        if (m) {
          const alt = (img.getAttribute("alt") || "").replace(/^Displaying\s+/i, "").trim();
          return { id: m[1], name: alt || null };
        }
      }
    }

    return null;
  }

  function fileIdFromUrl() {
    const active = activeItemFromDom();
    if (active?.id) return active.id;
    const m = location.href.match(FILE_RE);
    return m ? m[1] : null;
  }

  function fileName() {
    const active = activeItemFromDom();
    if (active?.name) return active.name;

    for (const sel of NAME_SELECTORS) {
      for (const el of document.querySelectorAll(sel)) {
        const txt = (el.getAttribute("aria-label") || el.textContent || "").trim();
        if (txt && /\.[a-z0-9]{2,5}$/i.test(txt)) return txt;
      }
    }
    const t = document.title.replace(TITLE_SUFFIX, "").trim();
    if (!t || t === "Google Drive") return "(unnamed file)";
    return t;
  }

  function findToolbar() {
    for (const sel of TOOLBAR_SELECTOR.split(",")) {
      for (const el of document.querySelectorAll(sel.trim())) {
        if (el.closest('[aria-hidden="true"], [hidden]')) continue;
        if (!isViewerDialogVisible(el)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return el;
      }
    }
    return null;
  }

  function fileUrl(id) {
    return `https://drive.google.com/file/d/${id}/view`;
  }

  // ---------- toggle ----------

  async function toggle() {
    const id = fileIdFromUrl();
    if (!id) return;
    if (picks[id]) {
      delete picks[id];
      render();
      await savePicks();
      toast("Removed from selection");
    } else {
      picks[id] = {
        name: fileName(),
        url: fileUrl(id),
        pickedAt: new Date().toISOString(),
      };
      render();
      await savePicks();
      toast(`Selected · ${Object.keys(picks).length}`);
    }
  }

  // ---------- UI ----------

  function buildUi() {
    const root = document.createElement("div");
    root.id = "dpp-root";
    root.innerHTML = `
      <button id="dpp-btn" type="button" title="Select this photo (S)">
        <span class="dpp-check" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18">
            <circle cx="12" cy="12" r="10.5" class="dpp-ring"></circle>
            <path d="M7 12.5l3.2 3.2L17 9" class="dpp-tick" fill="none" stroke-width="2.2"
                  stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </span>
        <span class="dpp-label">Select</span>
        <span class="dpp-count" aria-label="photos selected">0</span>
      </button>
      <div id="dpp-toast" role="status" aria-live="polite"></div>
    `;
    document.documentElement.appendChild(root);
    root.querySelector("#dpp-btn").addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    });
    return root;
  }

  function render() {
    if (!document.documentElement) return;
    if (!ui) ui = buildUi();
    const id = fileIdFromUrl();
    const inPreview = Boolean(id);
    const toolbar = inPreview ? findToolbar() : null;
    const host = toolbar || document.documentElement;
    if (ui.parentElement !== host) {
      host.appendChild(ui);
    }
    ui.classList.toggle("dpp-in-toolbar", Boolean(toolbar));
    ui.classList.toggle("dpp-visible", inPreview);
    if (!inPreview) return;
    const picked = Boolean(picks[id]);
    const btn = ui.querySelector("#dpp-btn");
    btn.classList.toggle("dpp-picked", picked);
    btn.setAttribute("aria-pressed", String(picked));
    btn.title = picked ? "Unselect this photo (S)" : "Select this photo (S)";
    ui.querySelector(".dpp-label").textContent = picked ? "Selected" : "Select";
    ui.querySelector(".dpp-count").textContent = String(Object.keys(picks).length);
  }

  let toastTimer = null;
  function toast(msg) {
    if (!ui) return;
    const el = ui.querySelector("#dpp-toast");
    el.textContent = msg;
    el.classList.add("dpp-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("dpp-show"), 1400);
  }

  // ---------- navigation watching ----------

  function onNavigate() {
    if (!document.documentElement) return;
    const id = fileIdFromUrl();
    if (id && picks[id] && picks[id].name === "(unnamed file)") {
      const name = fileName();
      if (name !== "(unnamed file)") {
        picks[id].name = name;
        savePicks();
      }
    }
    const toolbar = id ? findToolbar() : null;
    const targetHost = toolbar || document.documentElement;
    if (id === currentId && ui && ui.isConnected && ui.parentElement === targetHost) return;
    currentId = id;
    render();
  }

  function startObservers() {
    const titleEl = document.querySelector("title");
    if (titleEl) {
      new MutationObserver(onNavigate).observe(titleEl, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
    if (document.documentElement) {
      let scheduled = false;
      new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
          scheduled = false;
          onNavigate();
        });
      }).observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-hidden", "style", "class", "src", "alt"],
      });
    }
  }

  window.addEventListener("popstate", onNavigate);
  setInterval(onNavigate, 250);

  // ---------- keyboard ----------

  function isTypingTarget(el) {
    if (!el || typeof el !== "object") return false;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) {
      return true;
    }
    return Boolean(el.closest?.('[contenteditable="true"], [role="textbox"]'));
  }

  // Register in capture phase at document_start so we run before Drive's own
  // 's' = Star shortcut handler when a photo preview is open.
  for (const type of ["keydown", "keypress", "keyup"]) {
    window.addEventListener(
      type,
      (e) => {
        if (!fileIdFromUrl()) return;
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        if (e.key !== "s" && e.key !== "S") return;
        if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (type === "keydown" && !e.repeat) {
          toggle();
        }
      },
      true
    );
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "toggle-pick") toggle();
  });

  // ---------- start ----------

  function init() {
    startObservers();
    loadPicks().then(() => {
      currentId = fileIdFromUrl();
      render();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
