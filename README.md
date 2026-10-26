# Drive Photo Picker

Built for my wife to go through thousands of wedding photos shared on Google Drive and pick her favorites — without learning a new tool, creating an account, or re-uploading gigabytes of photos anywhere.

Google Drive is built for managing files, not culling photos: thumbnails are small, there is no persistent "pick" state across folders, and there is no way to export a list of chosen filenames with links. **Drive Photo Picker** is a lightweight Chrome extension that adds a one-key **Select** button directly inside Google Drive's native photo viewer and exports the final picks for the photographers.

---

## Features

- **Zero setup, zero backend:** No Google Cloud project, no OAuth, and no Drive API. It reads the active photo's filename and file ID directly from the Google Drive page you are viewing.
- **One-key picking:** Press **`S`** (or click the **Select** button) inside Drive's photo preview to mark or unmark a photo, with a live running counter (`Selected · 113`) and toolbar badge.
- **Works across sessions & folders:** Selections are saved locally in Chrome (`chrome.storage.local`), so you can pick across multiple shared folders over several evenings.
- **Photographer-ready exports:**
  - **Copy list:** Copies `filename  drive_link` (sorted in natural shoot order, e.g. `DSC_0001.JPG` before `DSC_0002.JPG`) ready to paste into WhatsApp or email.
  - **Download CSV:** Exports `wedding-selection-YYYY-MM-DD.csv` with `filename,drive_link,picked_at`.
  - **Back up & Restore:** Export or merge selections as a `.json` backup file at any time.

---

## Install in Chrome

1. Clone or download this repository to a permanent folder on your computer.
2. Open **`chrome://extensions`** in Chrome and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the **`drive-pick`** folder inside this repository.
4. Click the puzzle-piece Extensions icon in Chrome's toolbar and **pin** **Drive Photo Picker**.

---

## How to Use

1. **Open a photo** in any Google Drive folder the normal way (double-click it).
2. **Select / Unselect:** Click the **Select** button (bottom-right) or press **`S`** on your keyboard. The button turns green (**Selected**) and updates your total count.
3. **Flip through photos** using Google Drive's **`→`** and **`←`** arrow keys. Any photo you already picked shows the green **Selected** state when you land on it.
4. **Review & Export:** Click the extension icon in Chrome's toolbar to see your full list, remove individual photos, **Copy list**, **Download CSV**, or **Back up** your progress.

> **Tip for large Drive folders (50+ photos):** Google Drive only loads 50 files at a time until you scroll. If you scroll down the folder for a few seconds before opening the first photo, Drive pre-loads hundreds of photos so the `→` arrow key keeps advancing without stopping at photo #50.

---

## Project Structure

```text
.
├── drive-pick/                              # Unpacked Chrome Extension (Manifest V3)
│   ├── manifest.json                        # Extension manifest
│   ├── content.js                           # Drive viewer detector, 'S' shortcut, and button UI
│   ├── content.css                          # Floating / toolbar button & toast styles
│   ├── background.js                        # Toolbar badge counter & Alt+S command handler
│   ├── popup.html / popup.js / popup.css    # Extension popup (list, Copy, CSV, Backup/Restore)
│   └── icons/                               # Extension icons
├── tests/
│   └── extension.spec.js                    # End-to-end Playwright test suite (including 300-photo bulk test)
└── Wedding Photo Selector — Design Doc.md   # Original design document
```

## Running Tests

The project includes an end-to-end Playwright test suite that loads the unpacked Manifest V3 extension into Chromium and tests folder views, in-folder lightbox previews, keyboard shortcuts, SPA navigation, popup live sync, and a 300-photo bulk selection & CSV export test:

```bash
npm install
npm test
```
