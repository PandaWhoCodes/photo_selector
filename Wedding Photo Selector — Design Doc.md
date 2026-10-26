# Wedding Photo Selector — Design Doc

Oct 26, 2026

## Problem

The photographers shared 2–3 Google Drive folders of wedding photos and want back a list of the ones we pick, by filename. Google Drive's web UI is built for managing files, not culling photos: previews are small, there is no persistent "pick" state across folders, and there is no way to export a list of chosen filenames with links.

What a good tool needs to do:

1. Work inside Drive's own photo preview, so there is nothing new to learn.
2. Mark or unmark a photo with one click or one key, with the running count visible.
3. Keep picks saved between sessions, so she can do it over several evenings.
4. Export the picks as a list the photographers can act on: `filename · folder · Drive link`.

Hard constraints: free, nothing to install for the photographers, and no re-uploading of the photos anywhere.

## Build vs. buy

Nothing free does exactly this for a *client* holding a Drive folder; the free tools all sit on the photographer's side. The closest zero-build option is Google Drive itself, using shortcuts into a shared "Selected" folder. Recommendation: try that for 30 minutes first, and build the extension only if she finds it slow (it probably will be above \~500 photos).

| Option | Cost | Fits the need? | Catch |
| --- | --- | --- | --- |
| Google Drive shortcuts: she creates a `Selected` folder, multi-selects photos in each shared folder, Organize → Add shortcut (Shift+Z) into it, shares the folder with the photographers | Free | Yes. Photographers see filenames and can open the originals | Small thumbnails, no pick count, shortcuts can't be added from the preview view, easy to lose track across folders |
| Google Drive star | Free | No | Stars are private to her account; photographers never see them |
| Google Photos shared album | Free | Partly | Needs the photos copied into Photos; filenames are hidden from viewers |
| [Drive Explorer](https://workspace.google.com/marketplace/app/drive_explorer_google_drive_on_sheet/520711270513) (Sheets add-on): lists files with thumbnails and links into a Sheet, add a Pick column | Free tier | Partly | Reviews report the free tier caps at 200 files; the thumbnail-in-a-cell view is poor for judging photos |
| Proofing galleries such as Pixieset, Pic-Time, FotoOwl | Free tiers exist, e.g. [Pixieset 3 GB](https://www.fast.io/resources/photo-delivery-service.md) | Yes, but for the photographer | They would have to re-upload the set into the gallery. Worth asking them once if they already have one |
| Custom Chrome extension (this doc) | Free, \~2 weekends | Yes, exactly | Depends on Drive's page structure, which Google can change |

The extension needs no Google Cloud project, no OAuth and no Drive API: it only reads the file name and ID already on the Drive page she is looking at.

## How she uses it

Nothing new to learn: she browses the shared folders in Google Drive exactly as she does today. The extension only adds a check button to Drive's photo preview and remembers what she checked.

1. **Install.** Load the extension once in Chrome. No sign-in, no setup screen.
2. **Open a photo** in Drive the normal way (double-click in the folder). Drive's full-screen preview opens.
3. **Check it.** A check button sits in the preview's toolbar. Click it, or press `S`, and the photo is selected: the button turns solid and a small badge shows `Selected · 113`.
4. **Move on** with Drive's own `→` / `←` arrows. Already-selected photos show the solid check when she lands on them.
5. **Uncheck** by clicking the button again or pressing `S` again. The photo is removed from the list.
6. **See the list** by clicking the extension icon: every selected photo with its filename and Drive link, in the order picked, with a Remove button per row.
7. **Send** from that same popup: Copy as text (`filename – link`, one per line) for WhatsApp or email, or Download CSV.

Selections live in the extension's local storage on her machine. Nothing is sent anywhere until she copies the list herself.

## How it works

A Manifest V3 extension with three small parts and no backend. The content script runs only on `drive.google.com`; everything else is standard Chrome.

&#91;embedded content: extension architecture · 4 parts, no backend\]

The content script watches the Drive page, adds the button, and writes picks to local storage; the popup reads the same storage to show and export the list.

**Detecting the open photo.** Drive is a single-page app, so the script watches for navigation with a `MutationObserver` on `<title>` plus `popstate`. When the URL matches `/file/d/<id>/view`, the file ID is the path segment and the name is the preview's title element (fallback: `document.title` minus the " - Google Drive" suffix). The Drive link is simply `https://drive.google.com/file/d/<id>/view`. First task on day one: confirm in her Drive that opening a photo from a shared folder changes the URL this way.

**The check button.** Injected into the preview toolbar next to Google's own icons, with a solid/outline state read from storage on each navigation. If Google's toolbar markup is not found, the button falls back to a fixed floating position so the extension keeps working.

**Shortcut.** `S` toggles the current photo, handled by the content script with a `keydown` listener (ignored when focus is in a text field). Also registered as a `chrome.commands` shortcut so she can rebind it in `chrome://extensions/shortcuts`.

**Storage.** `chrome.storage.local` rather than `localStorage`: it is per-extension, not per-origin, so the popup and the content script read the same data, and it is not cleared when Drive's site data is. One key, `picks`, holding `{ fileId: { name, url, pickedAt } }`. Unchecking deletes the key. Default quota is 10 MB; 2,000 picks are under 300 KB.

**Permissions.** `storage`, plus host access to `https://drive.google.com/*`. Nothing else, no network calls.

## What the photographers get

Two export buttons in the popup, both built from the same stored list, sorted by filename so the list follows shoot order.

**Copy as text** (for WhatsApp or email): one photo per line, filename first because that is what they will search for in their own library.

```markdown
Selected photos — 113

DSC_0412.JPG  https://drive.google.com/file/d/1AbC…/view
DSC_0417.JPG  https://drive.google.com/file/d/1DeF…/view
…
```

**Download CSV** (`wedding-selection-2026-10-26.csv`), for photographers who want to sort or import it:

```csv
filename,drive_link,picked_at
DSC_0412.JPG,https://drive.google.com/file/d/1AbC…/view,2026-10-26T19:02:11+05:30
DSC_0417.JPG,https://drive.google.com/file/d/1DeF…/view,2026-10-26T19:02:40+05:30
```

The links open the originals because the photographers own the folders. If they also want a filenames-only list (no links), that is a third button worth adding only if asked.

## Edge cases and non-goals

| Case | Handling |
| --- | --- |
| Drive changes its toolbar markup | Button falls back to a floating position; the `S` key keeps working because it needs no toolbar. Keep the toolbar selector in one constant |
| Same photo in two folders, or a JPG and a RAW with the same name | Keyed by file ID, so each file is its own pick; the export shows the folder name only if we add it later (Drive's preview does not expose it without the API) |
| She picks on the laptop, later on another computer | Storage is per Chrome profile. If Chrome sync is on for the profile, swap `storage.local` for `storage.sync` (100 KB cap, roughly 600 picks) or add an Import JSON button. Not needed for v1 |
| Both of us want to pick | Each has our own list; export both and merge by filename in a sheet. A shared list would need a backend, out of scope |
| Accidentally clears Chrome data | `chrome.storage.local` is not touched by clearing site data; only removing the extension deletes it. Add a Backup JSON button in the popup as insurance |
| Photo opened from search or a direct link rather than the folder | Same URL shape, works the same |
| Preview of a non-image file (a video, a PDF) | Button still shows; a pick is a pick. No type filtering in v1 |

Non-goals: comments or ratings per photo, a separate gallery screen, anything that needs the Drive API or a sign-in, and publishing to the Chrome Web Store (load unpacked on her machine is enough).

## Build plan

One evening to a usable v1, a second to make it comfortable. Four files: `manifest.json`, `content.js`, `popup.html`, `popup.js`. No build step.

1. **Spike (30 min).** Open a photo from one of the shared folders, confirm the URL becomes `/file/d/<id>/view`, and find a stable selector for the preview title and toolbar. This decides whether the toolbar button or the floating button is the default.
2. **Core (2 h).** Content script: detect navigation, read ID and name, toggle on `S`, read/write `chrome.storage.local`. Floating button with solid/outline state. Load unpacked on her Chrome and let her use it for real.
3. **Popup (1.5 h).** List with filename, link, Remove; Copy as text; Download CSV; Backup JSON.
4. **Polish (1 h, after a few days of real use).** Move the button into Drive's toolbar, add the running count badge, register the `chrome.commands` shortcut, handle whatever broke.

- [ ] Spike done, URL and selectors confirmed
- [ ] v1 loaded on her laptop
- [ ] First export sent to the photographers

One thing to decide with her before step 2: whether `S` is the right key, or whether she would rather use something that cannot clash with Drive's own shortcuts (Drive uses many single letters; `S` is star in Drive's list view, which is why the script only listens inside the preview).
