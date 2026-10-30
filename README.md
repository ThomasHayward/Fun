# Fun
A little place for me to test new fun ideas with Claude

Each app lives in its own folder. `index.html` at the root is a launcher page that links to them.

| App | Folder | How it runs |
| --- | --- | --- |
| Home Hub | [`home-hub/`](home-hub/) | Static web app (GitHub Pages / any web server) |

Every app has its own README section or file explaining how to run it. A web app can be published with GitHub Pages. A script, bot or server can sit in its own folder with its own run instructions; it just won't be on Pages.

### Publishing with GitHub Pages
1. On GitHub, go to repo **Settings → Pages** and set the source to **Deploy from a branch**, branch `main`, folder `/ (root)`.
2. The launcher is at `https://<your-username>.github.io/<repo-name>/`, and each app is at `…/<folder>/`, e.g. `…/home-hub/`.

All apps on Pages share one site, so they also share browser storage. Each app should save under its own key, the way Home Hub uses `homehub.v1`.

## Home Hub

A personal app for notes, reminders and grocery lists. It works on a PC and on an iPhone as an installable web app. There's no build step: it's plain HTML, CSS and JavaScript.

### Features
- **Groceries**: give an item an aisle once and it's remembered for that store. The list is then sorted into walking order and grouped by aisle.
  - **Multiple stores**: comes with Target and Meijer, and presets for Target, Meijer, Walmart or a generic grocery store. Each item shows the aisles you've saved at other stores, e.g. "Meijer Aisle 14".
  - **Split trips**: set any item to "@ Meijer" or "@ Target". The list then becomes one route per store.
  - **🔎 lookup**: opens the item in the store's site or app so you can find its aisle.
- **Reminders**: due dates, repeats, alerts while the app is open, and 📅 to add one to your phone's calendar so it alerts even when the app is closed.
- **Notes**: autosaving notes with search and pinning.
- **Offline + backup**: works without a connection, and you can export or import a JSON file from Settings to copy your data between devices.

Data is stored on each device only. There's no syncing yet.

### Run locally
From the repo root, run:
```
python3 -m http.server 8000
```
Then open http://localhost:8000/home-hub/.

### On your iPhone
Open the Pages URL for `home-hub/` in **Safari**, tap **Share**, then **Add to Home Screen**.
