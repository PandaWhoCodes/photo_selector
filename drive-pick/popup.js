const $ = (sel) => document.querySelector(sel);

let picks = {};
let hideUnselected = false;
let pendingSaves = 0;

async function savePicks() {
  pendingSaves++;
  try {
    await chrome.storage.local.set({ picks });
  } finally {
    pendingSaves--;
  }
}

async function load() {
  const res = await chrome.storage.local.get(["picks", "hideUnselected"]);
  picks = res.picks || {};
  hideUnselected = Boolean(res.hideUnselected);
  render();
}

function sorted() {
  // Filename order matches shoot order for camera files (DSC_0412 < DSC_0417).
  return Object.entries(picks)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", undefined, { numeric: true, sensitivity: "base" })
    );
}

function render() {
  const items = sorted();
  const n = items.length;
  $("#headline").textContent =
    n === 0 ? "No photos selected yet" : `${n} photo${n === 1 ? "" : "s"} selected`;

  $("#copy").disabled = n === 0;
  $("#csv").disabled = n === 0;
  $("#backup").disabled = n === 0;
  $("#clear").disabled = n === 0;

  const hideBtn = $("#toggle-hide");
  if (hideBtn) {
    hideBtn.classList.toggle("active-toggle", hideUnselected);
    hideBtn.setAttribute("aria-pressed", String(hideUnselected));
  }

  const list = $("#list");
  list.textContent = "";
  if (n === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Photos you select in Drive will appear here.";
    list.appendChild(li);
    return;
  }
  for (const p of items) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = p.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = p.name;
    a.title = p.name;
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "remove";
    rm.textContent = "Remove";
    rm.setAttribute("aria-label", `Remove ${p.name}`);
    rm.addEventListener("click", () => remove(p.id));
    li.append(a, rm);
    list.appendChild(li);
  }
}

async function remove(id) {
  delete picks[id];
  render();
  await savePicks();
  say("Removed");
}

let sayTimer;
function say(msg) {
  const el = $("#feedback");
  el.textContent = msg;
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => (el.textContent = ""), 2000);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- actions ----------

$("#copy").addEventListener("click", async () => {
  const items = sorted();
  const lines = [`Selected photos — ${items.length}`, ""];
  for (const p of items) lines.push(`${p.name}  ${p.url}`);
  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    say(`Copied ${items.length} lines`);
  } catch {
    say("Copy failed — try Download CSV instead");
  }
});

$("#csv").addEventListener("click", () => {
  const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const rows = [["filename", "drive_link", "picked_at"].join(",")];
  for (const p of sorted()) rows.push([esc(p.name), esc(p.url), esc(p.pickedAt)].join(","));
  download(`wedding-selection-${today()}.csv`, rows.join("\r\n"), "text/csv");
  say("CSV downloaded");
});

$("#backup").addEventListener("click", () => {
  download(
    `wedding-selection-backup-${today()}.json`,
    JSON.stringify({ picks }, null, 2),
    "application/json"
  );
  say("Backup downloaded");
});

function isPlainObject(v) {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

$("#restore").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!isPlainObject(data)) throw new Error("Invalid backup root");
    const incoming = "picks" in data ? data.picks : data;
    if (!isPlainObject(incoming)) throw new Error("Invalid picks map");
    const entries = Object.entries(incoming);
    const validEntries = entries.filter(
      ([, p]) =>
        isPlainObject(p) &&
        typeof p.name === "string" &&
        p.name.trim() !== "" &&
        typeof p.url === "string" &&
        p.url.trim() !== ""
    );
    if (entries.length > 0 && validEntries.length === 0) {
      throw new Error("No valid pick entries");
    }
    let added = 0;
    for (const [id, p] of validEntries) {
      if (!picks[id]) {
        picks[id] = {
          name: p.name,
          url: p.url,
          pickedAt: p.pickedAt || new Date().toISOString(),
        };
        added++;
      }
    }
    await savePicks();
    render();
    say(added ? `Restored ${added} photo${added === 1 ? "" : "s"}` : "Nothing new to restore");
  } catch {
    say("That file is not a backup from this extension");
  }
  e.target.value = "";
});

$("#toggle-hide").addEventListener("click", async () => {
  hideUnselected = !hideUnselected;
  render();
  pendingSaves++;
  try {
    await chrome.storage.local.set({ hideUnselected });
  } finally {
    pendingSaves--;
  }
  say(hideUnselected ? "Hiding unselected in Drive" : "Showing all photos in Drive");
});

$("#clear").addEventListener("click", async () => {
  const n = Object.keys(picks).length;
  if (!confirm(`Remove all ${n} selected photos? Download a backup first if unsure.`)) return;
  picks = {};
  hideUnselected = false;
  render();
  pendingSaves++;
  try {
    await chrome.storage.local.set({ picks, hideUnselected });
  } finally {
    pendingSaves--;
  }
  say("Cleared");
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (pendingSaves > 0) return;
    if (changes.picks) picks = changes.picks.newValue || {};
    if (changes.hideUnselected) hideUnselected = Boolean(changes.hideUnselected.newValue);
    render();
  }
});

load();
