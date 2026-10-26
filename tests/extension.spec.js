const { test: base, expect, chromium } = require("@playwright/test");
const path = require("path");
const fs = require("fs");

const EXTENSION_PATH = path.resolve(__dirname, "../drive-pick");

const test = base.extend({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    // Mock Google Drive routes so content.js and content.css are injected by Chrome
    await context.route("https://drive.google.com/**", async (route) => {
      const url = new URL(route.request().url());

      if (url.pathname.startsWith("/drive/folders/")) {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: `<!doctype html>
<html>
<head>
  <title>Wedding Photos - Google Drive</title>
  <script>
    // Simulate Google Drive's own 's' = Star shortcut registered at page load
    window.__driveStarTriggered = false;
    window.addEventListener("keydown", (e) => {
      if (e.key === "s" || e.key === "S") {
        window.__driveStarTriggered = true;
      }
    }, true);
  </script>
</head>
<body>
  <div role="toolbar" style="height:40px;width:400px;">Folder Toolbar</div>
  <main>
    <div id="card-1" role="gridcell" data-target="doc" data-id="1SamplePhoto001" style="width:200px;height:200px;position:relative;">
      <div data-tooltip="DSC00001.jpg Image">DSC00001.jpg</div>
    </div>
    <div id="card-2" role="gridcell" data-target="doc" data-id="1SamplePhoto002" style="width:200px;height:200px;position:relative;">
      <div data-tooltip="DSC00002.jpg Image">DSC00002.jpg</div>
    </div>
    <div id="card-3" role="gridcell" data-target="doc" data-id="1SamplePhoto003" style="width:200px;height:200px;position:relative;">
      <div data-tooltip="DSC00003.jpg Image">DSC00003.jpg</div>
    </div>
  </main>
  <div id="viewer-dialog" role="dialog" aria-label="Showing viewer." aria-hidden="true" style="visibility:hidden;">
    <div role="main">
      <div id="drive-active-item-info"></div>
    </div>
  </div>
</body>
</html>`,
        });
        return;
      }

      // Simulate a photo preview page without a toolbar if ?notoolbar=1 is passed
      if (url.searchParams.get("notoolbar") === "1") {
        const name = url.searchParams.get("name") || "DSC_0412.JPG";
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: `<!doctype html>
<html>
<head><title>${name} - Google Drive</title></head>
<body>
  <main>Photo viewer with unfamiliar markup</main>
</body>
</html>`,
        });
        return;
      }

      // Simulate a photo preview where the title is initially just "Google Drive"
      if (url.searchParams.get("delayedtitle") === "1") {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: `<!doctype html>
<html>
<head><title>Google Drive</title></head>
<body>
  <div role="dialog">
    <div role="toolbar" style="display:flex;align-items:center;height:48px;width:600px;background:#222;color:#fff;">
      <button aria-label="Close" data-tooltip="Close">X</button>
    </div>
  </div>
</body>
</html>`,
        });
        return;
      }

      // Standard Drive preview page with Close button before the filename element
      const titleName = url.searchParams.get("title") || "Fallback_Title.JPG";
      const ariaName = url.searchParams.get("aria") || "DSC_0412.JPG";
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html>
<html>
<head><title>${titleName} - Google Drive</title></head>
<body>
  <div role="dialog">
    <div role="toolbar" id="preview-toolbar" style="display:flex;align-items:center;height:48px;width:600px;background:#222;color:#fff;">
      <button aria-label="Close" data-tooltip="Close">Back</button>
      <div aria-label="${ariaName}" data-tooltip="${ariaName}">${ariaName}</div>
      <button aria-label="Download" data-tooltip="Download">Download</button>
    </div>
    <input id="comment-input" type="text" placeholder="Add a comment" />
    <div id="rich-comment" role="textbox" contenteditable="true">Rich comment</div>
  </div>
</body>
</html>`,
      });
    });

    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent("serviceworker");
    }
    const extensionId = background.url().split("/")[2];
    await use(extensionId);
  },
});

test.describe("Drive Photo Picker Extension", () => {
  test("1. Works inside Drive folder viewer modal (#drive-active-item-info) and blocks Drive Star shortcut", async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto("https://drive.google.com/drive/folders/1SampleFolderAbc123");

    const root = page.locator("#dpp-root");
    const btn = page.locator("#dpp-btn");
    await expect(root).toBeAttached();
    await expect(root).not.toHaveClass(/dpp-visible/);

    // Simulate double-clicking DSC00001.jpg in the folder (opens viewer dialog without changing URL)
    await page.evaluate(() => {
      const dialog = document.getElementById("viewer-dialog");
      dialog.setAttribute("aria-hidden", "false");
      dialog.style.visibility = "visible";
      document.getElementById("drive-active-item-info").textContent = JSON.stringify({
        id: "1SamplePhoto001",
        title: "DSC00001.jpg",
        mimeType: "image/jpeg",
      });
    });

    await expect(root).toHaveClass(/dpp-visible/);
    await expect(page.locator(".dpp-label")).toHaveText("Select");

    // Press S: should select photo and prevent Drive's own 's' = Star shortcut from firing
    await page.keyboard.press("s");
    await expect(btn).toHaveClass(/dpp-picked/);
    await expect(page.locator(".dpp-label")).toHaveText("Selected");
    await expect(page.locator(".dpp-count")).toHaveText("1");
    const starTriggered = await page.evaluate(() => window.__driveStarTriggered);
    expect(starTriggered).toBe(false);

    // Simulate ArrowRight to DSC00002.jpg inside folder viewer
    await page.evaluate(() => {
      document.getElementById("drive-active-item-info").textContent = JSON.stringify({
        id: "1SamplePhoto002",
        title: "DSC00002.jpg",
        mimeType: "image/jpeg",
      });
    });

    await expect(btn).not.toHaveClass(/dpp-picked/);
    await expect(page.locator(".dpp-label")).toHaveText("Select");
    await expect(page.locator(".dpp-count")).toHaveText("1");

    // Select DSC00002.jpg
    await page.keyboard.press("s");
    await expect(btn).toHaveClass(/dpp-picked/);
    await expect(page.locator(".dpp-count")).toHaveText("2");

    // Verify popup has both photos
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    expect(await popup.locator("#list li a").allTextContents()).toEqual([
      "DSC00001.jpg",
      "DSC00002.jpg",
    ]);

    // Close viewer dialog (Escape): button hides again, and grid cards show picked state!
    await page.bringToFront();
    await page.evaluate(() => {
      const dialog = document.getElementById("viewer-dialog");
      dialog.setAttribute("aria-hidden", "true");
      dialog.style.visibility = "hidden";
      document.getElementById("drive-active-item-info").textContent = "";
    });
    await expect(root).not.toHaveClass(/dpp-visible/);

    // Verify grid view cards 1 and 2 have tick badges marked picked, while card 3 is unpicked
    await expect(page.locator("#card-1")).toHaveClass(/dpp-card-picked/);
    await expect(page.locator("#card-1 .dpp-grid-badge")).toHaveClass(/dpp-grid-badge-picked/);
    await expect(page.locator("#card-2")).toHaveClass(/dpp-card-picked/);
    await expect(page.locator("#card-3")).not.toHaveClass(/dpp-card-picked/);

    // Click the tick badge directly on card 3 in the grid view to select DSC00003.jpg
    await page.locator("#card-3 .dpp-grid-badge").click();
    await expect(page.locator("#card-3")).toHaveClass(/dpp-card-picked/);
    await expect(page.locator("#card-3 .dpp-grid-badge")).toHaveClass(/dpp-grid-badge-picked/);
    await expect(page.locator("#dpp-toast")).toHaveText("Selected · 3");
    await expect(popup.locator("#headline")).toHaveText("3 photos selected");

    // Click the tick badge on card 1 to unselect DSC00001.jpg directly from the grid view
    await page.locator("#card-1 .dpp-grid-badge").click();
    await expect(page.locator("#card-1")).not.toHaveClass(/dpp-card-picked/);
    await expect(page.locator("#dpp-toast")).toHaveText("Removed from selection");
    await expect(popup.locator("#headline")).toHaveText("2 photos selected");
  });

  test("2. Injects button into Drive toolbar when present and falls back to floating when absent", async ({
    context,
  }) => {
    const page = await context.newPage();

    // Case A: Toolbar is present
    await page.goto("https://drive.google.com/file/d/1PhotoToolbar/view?aria=DSC_0100.JPG");
    const root = page.locator("#dpp-root");
    await expect(root).toHaveClass(/dpp-visible/);
    await expect(root).toHaveClass(/dpp-in-toolbar/);

    const parentId = await root.evaluate((el) => el.parentElement?.id);
    expect(parentId).toBe("preview-toolbar");

    // Case B: Toolbar markup is absent -> falls back to floating on documentElement
    await page.goto("https://drive.google.com/file/d/1PhotoNoToolbar/view?notoolbar=1&name=DSC_0101.JPG");
    await expect(root).toHaveClass(/dpp-visible/);
    await expect(root).not.toHaveClass(/dpp-in-toolbar/);

    const fallbackParentTag = await root.evaluate((el) => el.parentElement?.tagName);
    expect(fallbackParentTag).toBe("HTML");
  });

  test("3. Extracts filename from toolbar aria-label even after Close button, with document.title fallback and delayed title healing", async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();

    // Close button comes before DSC_0412.JPG in div[role="dialog"] [data-tooltip][aria-label]
    await page.goto(
      "https://drive.google.com/file/d/1PhotoAria/view?aria=DSC_0412.JPG&title=Wrong_Fallback.JPG"
    );
    await page.locator("#dpp-btn").click();
    await expect(page.locator("#dpp-btn")).toHaveClass(/dpp-picked/);

    // Fallback to document.title when no toolbar exists
    await page.goto(
      "https://drive.google.com/file/d/1PhotoTitleFallback/view?notoolbar=1&name=DSC_0417.JPG"
    );
    await page.keyboard.press("s");
    await expect(page.locator("#dpp-btn")).toHaveClass(/dpp-picked/);

    // Delayed title: starts as "Google Drive" and mutates to "DSC_0420.JPG - Google Drive"
    await page.goto("https://drive.google.com/file/d/1PhotoDelayed/view?delayedtitle=1");
    await page.keyboard.press("S");
    await expect(page.locator("#dpp-btn")).toHaveClass(/dpp-picked/);

    // Now Drive updates <title>
    await page.evaluate(() => {
      document.title = "DSC_0420.JPG - Google Drive";
    });
    await page.waitForTimeout(100);

    // Check stored picks in popup
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    const names = await popup.locator("#list li a").allTextContents();
    expect(names).toEqual(["DSC_0412.JPG", "DSC_0417.JPG", "DSC_0420.JPG"]);
  });

  test("4. Selects/unselects via click, S key, Alt+S command, and ignores typing targets & key repeat", async ({
    context,
  }) => {
    const page = await context.newPage();
    await page.goto("https://drive.google.com/file/d/1PhotoKeyTest/view?aria=DSC_0500.JPG");

    const btn = page.locator("#dpp-btn");
    const label = page.locator(".dpp-label");
    const count = page.locator(".dpp-count");
    const toast = page.locator("#dpp-toast");

    await expect(label).toHaveText("Select");
    await expect(count).toHaveText("0");

    // Press S to select
    await page.keyboard.press("s");
    await expect(btn).toHaveClass(/dpp-picked/);
    await expect(btn).toHaveAttribute("aria-pressed", "true");
    await expect(label).toHaveText("Selected");
    await expect(count).toHaveText("1");
    await expect(toast).toHaveText("Selected · 1");

    // Simulated key repeat should be ignored
    await page.evaluate(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "s", repeat: true, bubbles: true, cancelable: true })
      );
    });
    await expect(btn).toHaveClass(/dpp-picked/);

    // Typing 's' inside <input> should be ignored
    await page.locator("#comment-input").focus();
    await page.keyboard.press("s");
    await expect(btn).toHaveClass(/dpp-picked/);

    // Typing 'S' inside contenteditable / role="textbox" should be ignored
    await page.locator("#rich-comment").focus();
    await page.keyboard.press("S");
    await expect(btn).toHaveClass(/dpp-picked/);

    // Blur input and press S to unselect
    await page.locator("#rich-comment").evaluate((el) => el.blur());
    await page.keyboard.press("S");
    await expect(btn).not.toHaveClass(/dpp-picked/);
    await expect(btn).toHaveAttribute("aria-pressed", "false");
    await expect(label).toHaveText("Select");
    await expect(count).toHaveText("0");
    await expect(toast).toHaveText("Removed from selection");

    // Test background service worker command message ("toggle-pick" / Alt+S)
    let [sw] = context.serviceWorkers();
    await sw.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, { type: "toggle-pick" });
    });
    await expect(btn).toHaveClass(/dpp-picked/);
    await expect(count).toHaveText("1");

    // Verify extension toolbar badge updated via background.js
    const badgeText = await sw.evaluate(() => chrome.action.getBadgeText({}));
    expect(badgeText).toBe("1");
  });

  test("5. Handles SPA navigation between photos and toolbar DOM replacement", async ({
    context,
  }) => {
    const page = await context.newPage();
    await page.goto("https://drive.google.com/file/d/1PhotoOne/view?aria=DSC_0001.JPG");

    const btn = page.locator("#dpp-btn");
    const label = page.locator(".dpp-label");
    const count = page.locator(".dpp-count");

    // Select photo 1
    await btn.click();
    await expect(label).toHaveText("Selected");
    await expect(count).toHaveText("1");

    // Simulate Drive SPA navigation to photo 2 where Drive also replaces the toolbar DOM element
    await page.evaluate(() => {
      history.pushState({}, "", "/file/d/1PhotoTwo/view");
      const oldToolbar = document.getElementById("preview-toolbar");
      const newToolbar = document.createElement("div");
      newToolbar.id = "preview-toolbar-2";
      newToolbar.setAttribute("role", "toolbar");
      newToolbar.style.cssText = "display:flex;align-items:center;height:48px;width:600px;";
      newToolbar.innerHTML = '<div aria-label="DSC_0002.JPG" data-tooltip="DSC_0002.JPG">DSC_0002.JPG</div>';
      oldToolbar.replaceWith(newToolbar);
      document.title = "DSC_0002.JPG - Google Drive";
    });

    await expect(label).toHaveText("Select");
    await expect(count).toHaveText("1");
    await expect(page.locator("#dpp-root")).toBeAttached();
    const newParentId = await page.locator("#dpp-root").evaluate((el) => el.parentElement?.id);
    expect(newParentId).toBe("preview-toolbar-2");

    // Select photo 2
    await page.keyboard.press("s");
    await expect(label).toHaveText("Selected");
    await expect(count).toHaveText("2");

    // Navigate back to photo 1 via history.back() (popstate)
    await page.evaluate(() => {
      history.back();
    });
    await expect(label).toHaveText("Selected");
    await expect(count).toHaveText("2");
  });

  test("6. Popup UI: natural sorting, live sync, remove, copy list, CSV download, backup/restore, and clear all", async ({
    context,
    extensionId,
  }) => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    // 1. Empty state check
    await expect(popup.locator("#headline")).toHaveText("No photos selected yet");
    await expect(popup.locator("#list .empty")).toHaveText(
      "Photos you select in Drive will appear here."
    );
    await expect(popup.locator("#copy")).toBeDisabled();
    await expect(popup.locator("#csv")).toBeDisabled();
    await expect(popup.locator("#backup")).toBeDisabled();
    await expect(popup.locator("#clear")).toBeDisabled();

    // 2. Select photos in Drive tab and verify real-time popup update + natural filename sorting
    const drivePage = await context.newPage();
    await drivePage.goto("https://drive.google.com/file/d/id_10/view?aria=DSC_10.JPG");
    await drivePage.locator("#dpp-btn").click();

    await drivePage.goto("https://drive.google.com/file/d/id_2/view?aria=DSC_2.JPG");
    await drivePage.locator("#dpp-btn").click();

    await drivePage.goto("https://drive.google.com/file/d/id_417/view?aria=DSC_0417.JPG");
    await drivePage.locator("#dpp-btn").click();

    await expect(popup.locator("#headline")).toHaveText("3 photos selected");
    const items = await popup.locator("#list li a").allTextContents();
    // Natural numeric sort: DSC_2.JPG < DSC_10.JPG < DSC_0417.JPG
    expect(items).toEqual(["DSC_2.JPG", "DSC_10.JPG", "DSC_0417.JPG"]);

    // 3. Test Copy list
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await popup.bringToFront();
    await popup.locator("#copy").click();
    await expect(popup.locator("#feedback")).toHaveText("Copied 3 lines");

    const clipboardText = await popup.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(
      [
        "Selected photos — 3",
        "",
        "DSC_2.JPG  https://drive.google.com/file/d/id_2/view",
        "DSC_10.JPG  https://drive.google.com/file/d/id_10/view",
        "DSC_0417.JPG  https://drive.google.com/file/d/id_417/view",
      ].join("\n")
    );

    // 4. Test Download CSV
    const csvDownloadPromise = popup.waitForEvent("download");
    await popup.locator("#csv").click();
    const csvDownload = await csvDownloadPromise;
    expect(csvDownload.suggestedFilename()).toMatch(/^wedding-selection-\d{4}-\d{2}-\d{2}\.csv$/);
    const csvPath = await csvDownload.path();
    const csvContent = fs.readFileSync(csvPath, "utf8");
    const csvLines = csvContent.split("\r\n");
    expect(csvLines[0]).toBe("filename,drive_link,picked_at");
    expect(csvLines[1]).toMatch(
      /^"DSC_2\.JPG","https:\/\/drive\.google\.com\/file\/d\/id_2\/view","\d{4}-\d{2}-\d{2}T/
    );
    expect(csvLines[2]).toMatch(
      /^"DSC_10\.JPG","https:\/\/drive\.google\.com\/file\/d\/id_10\/view","\d{4}-\d{2}-\d{2}T/
    );
    expect(csvLines[3]).toMatch(
      /^"DSC_0417\.JPG","https:\/\/drive\.google\.com\/file\/d\/id_417\/view","\d{4}-\d{2}-\d{2}T/
    );

    // 5. Test Back up JSON
    const backupDownloadPromise = popup.waitForEvent("download");
    await popup.locator("#backup").click();
    const backupDownload = await backupDownloadPromise;
    expect(backupDownload.suggestedFilename()).toMatch(
      /^wedding-selection-backup-\d{4}-\d{2}-\d{2}\.json$/
    );
    const backupPath = await backupDownload.path();
    const backupJson = JSON.parse(fs.readFileSync(backupPath, "utf8"));
    expect(Object.keys(backupJson.picks).sort()).toEqual(["id_10", "id_2", "id_417"]);

    // 6. Test per-row Remove and verify Drive tab updates in real time
    await popup.locator('button[aria-label="Remove DSC_0417.JPG"]').click();
    await expect(popup.locator("#headline")).toHaveText("2 photos selected");
    await expect(drivePage.locator(".dpp-label")).toHaveText("Select");
    await expect(drivePage.locator(".dpp-count")).toHaveText("2");

    // 7. Test Restore with valid backup (restores the removed DSC_0417.JPG)
    await popup.locator("#restore").setInputFiles(backupPath);
    await expect(popup.locator("#feedback")).toHaveText("Restored 1 photo");
    await expect(popup.locator("#headline")).toHaveText("3 photos selected");

    // Re-restoring the same backup reports "Nothing new to restore"
    await popup.locator("#restore").setInputFiles(backupPath);
    await expect(popup.locator("#feedback")).toHaveText("Nothing new to restore");

    // 8. Test Restore with non-backup JSON reports error
    await popup.locator("#restore").setInputFiles({
      name: "unrelated.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ foo: "bar" })),
    });
    await expect(popup.locator("#feedback")).toHaveText(
      "That file is not a backup from this extension"
    );

    // 9. Test Clear all
    popup.once("dialog", (dialog) => dialog.accept());
    await popup.locator("#clear").click();
    await expect(popup.locator("#headline")).toHaveText("No photos selected yet");
    await expect(popup.locator("#feedback")).toHaveText("Cleared");
    await expect(drivePage.locator(".dpp-count")).toHaveText("0");
  });

  test("7. Bulk scale test: selects 300 photos and exports all 300 to CSV and clipboard without data loss", async ({
    context,
    extensionId,
  }) => {
    const TOTAL = 300;
    const page = await context.newPage();
    await page.goto("https://drive.google.com/drive/folders/1SampleFolderAbc123");

    // Open the viewer dialog
    await page.evaluate(() => {
      const dialog = document.getElementById("viewer-dialog");
      dialog.setAttribute("aria-hidden", "false");
      dialog.style.visibility = "visible";
    });

    // Step through 300 photos in reverse order (300 down to 1) and press 'S' on each
    for (let i = TOTAL; i >= 1; i--) {
      const padded = String(i).padStart(4, "0");
      await page.evaluate(
        ({ id, title }) => {
          document.getElementById("drive-active-item-info").textContent = JSON.stringify({
            id,
            title,
            mimeType: "image/jpeg",
          });
        },
        { id: `id_photo_${padded}`, title: `DSC_${padded}.JPG` }
      );
      await page.keyboard.press("s");
    }

    await expect(page.locator(".dpp-count")).toHaveText(String(TOTAL));
    await expect(page.locator(".dpp-label")).toHaveText("Selected");

    // Verify extension toolbar badge shows "300"
    const [sw] = context.serviceWorkers();
    await expect
      .poll(() => sw.evaluate(() => chrome.action.getBadgeText({})))
      .toBe(String(TOTAL));

    // Open popup and verify all 300 photos are listed and sorted DSC_0001.JPG .. DSC_0300.JPG
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.locator("#headline")).toHaveText(`${TOTAL} photos selected`);
    await expect(popup.locator("#list li")).toHaveCount(TOTAL);

    const firstLinkText = await popup.locator("#list li a").first().textContent();
    const lastLinkText = await popup.locator("#list li a").last().textContent();
    expect(firstLinkText).toBe("DSC_0001.JPG");
    expect(lastLinkText).toBe("DSC_0300.JPG");

    // Verify Copy list with 300 photos
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await popup.bringToFront();
    await popup.locator("#copy").click();
    await expect(popup.locator("#feedback")).toHaveText(`Copied ${TOTAL} lines`);
    const copiedLines = (await popup.evaluate(() => navigator.clipboard.readText())).split("\n");
    expect(copiedLines[0]).toBe(`Selected photos — ${TOTAL}`);
    expect(copiedLines.length).toBe(TOTAL + 2);
    expect(copiedLines[2]).toBe("DSC_0001.JPG  https://drive.google.com/file/d/id_photo_0001/view");
    expect(copiedLines[TOTAL + 1]).toBe(
      "DSC_0300.JPG  https://drive.google.com/file/d/id_photo_0300/view"
    );

    // Export CSV and verify all 300 rows exist and are valid
    const csvDownloadPromise = popup.waitForEvent("download");
    await popup.locator("#csv").click();
    const csvDownload = await csvDownloadPromise;
    const csvPath = await csvDownload.path();
    const csvContent = fs.readFileSync(csvPath, "utf8");
    const csvRows = csvContent.split("\r\n");

    expect(csvRows.length).toBe(TOTAL + 1);
    expect(csvRows[0]).toBe("filename,drive_link,picked_at");

    for (let i = 1; i <= TOTAL; i++) {
      const padded = String(i).padStart(4, "0");
      expect(csvRows[i]).toMatch(
        new RegExp(
          `^"DSC_${padded}\\.JPG","https://drive\\.google\\.com/file/d/id_photo_${padded}/view","\\d{4}-\\d{2}-\\d{2}T`
        )
      );
    }
  });
});
