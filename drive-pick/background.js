// Keeps the toolbar badge showing the number of selected photos,
// and forwards the Chrome-level keyboard shortcut to the Drive tab.

async function updateBadge() {
  const { picks = {} } = await chrome.storage.local.get("picks");
  const n = Object.keys(picks).length;
  await chrome.action.setBadgeText({ text: n ? String(n) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#1e7a4f" });
}

chrome.runtime.onInstalled.addListener(updateBadge);
chrome.runtime.onStartup.addListener(updateBadge);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.picks) updateBadge();
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-pick") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith("https://drive.google.com/")) return;
  chrome.tabs.sendMessage(tab.id, { type: "toggle-pick" }).catch(() => {});
});
