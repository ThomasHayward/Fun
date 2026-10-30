# Fun
A little place for me to test new fun ideas with Claude

## Home Hub

A personal app for notes, reminders and grocery lists. It works on a PC and on an iPhone as an installable web app. There's no build step: it's plain HTML, CSS and JavaScript.

### Features
- **Groceries**: multiple lists, each linked to a store. Give an item an aisle once (e.g. `G12` at Target) and it's remembered for that store. The list is then sorted into walking order and grouped by aisle. 🔎 opens the item in the store's site or app so you can find its aisle.
- **Stores**: set the order you walk a store's zones (Target aisle letters, or sections like Produce/Dairy).
- **Reminders**: due dates, repeats, alerts while the app is open, and 📅 to add one to your phone's calendar so it alerts even when the app is closed.
- **Notes**: autosaving notes with search and pinning.
- **Offline**: works without a connection once loaded.
- **Backup**: export or import a JSON file from Settings to back up your data or copy it between devices.

Data is stored on each device only. There's no syncing yet.

### Run locally
```
python3 -m http.server 8000
```
Then open http://localhost:8000.

### Put it on your phone (GitHub Pages)
1. On GitHub, go to repo **Settings → Pages** and set the source to **Deploy from a branch**, branch `main`, folder `/ (root)`.
2. Open the Pages URL in **Safari** on your iPhone, tap **Share**, then **Add to Home Screen**.
