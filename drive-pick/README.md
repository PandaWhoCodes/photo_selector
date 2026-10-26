# Drive Photo Picker

Select photos while browsing Google Drive, then copy a list of filenames and links to send to the photographer. No sign-in, no Drive API — it only reads the file name and ID already on the page.

## Install (once, on her Chrome)

1. Unzip this folder somewhere permanent (e.g. `Documents/drive-pick`). Chrome loads it from here, so don't delete it later.
2. Open `chrome://extensions`, turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `drive-pick` folder.
4. Pin the extension: puzzle-piece icon → pin **Drive Photo Picker**.

## Use

- Open any photo in Drive the normal way. A **Select** button appears in the preview toolbar (or floating bottom-right if Drive's toolbar is not found).
- Click it, or press **S**, to select. Press again to unselect.
- Move between photos with Drive's own arrows. Already-selected photos show a green **Selected**.
- In the folder **Grid view** or **List view**, selected photos display a green checkmark badge (and you can click the badge on any thumbnail to select/unselect directly from the folder).
- Click the extension icon to see the list. **Copy list** gives `filename  link` per line for WhatsApp/email; **Download CSV** gives a spreadsheet.
- **Back up** downloads the list as JSON; **Restore** merges one back in.

`Alt+S` also works from anywhere on the Drive tab; change it at `chrome://extensions/shortcuts`.

## Where the data lives

`chrome.storage.local`, key `picks`, shaped `{ fileId: { name, url, pickedAt } }`. It is per Chrome profile, survives restarts and clearing site data, and is deleted only when the extension is removed.

## If the button stops appearing

Google changed the Drive preview URL or title format. Check `FILE_RE`, `TOOLBAR_SELECTOR`, and `NAME_SELECTORS` at the top of `content.js`.
