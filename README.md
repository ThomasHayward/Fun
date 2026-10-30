# Fun
A little place for me to test new fun ideas with Claude

Each app lives in its own folder. `index.html` at the root is a launcher page that links to them.
The web apps are written in TypeScript. `npm run build` compiles them into `dist/`, which is the folder that gets published.

| App | Folder | How it runs |
| --- | --- | --- |
| Home Hub | [`home-hub/`](home-hub/) | TypeScript web app, built into `dist/` and published to GitHub Pages |

Every app has its own README section or file explaining how to run it. A web app can be published with GitHub Pages. A script, bot or server can sit in its own folder with its own run instructions; it just won't be on Pages.

### Developing
You'll need [Node.js](https://nodejs.org) 22 or newer.
```
npm install        # once
npm run dev        # build, then serve at http://localhost:8000
npm run typecheck  # check types without building
```

### Publishing with GitHub Pages
1. On GitHub, go to repo **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Every push to `main` runs `.github/workflows/pages.yml`, which builds the site and publishes it.
3. The launcher is at `https://<your-username>.github.io/<repo-name>/`, and each app is at `…/<folder>/`, e.g. `…/home-hub/`.

All apps on Pages share one site, so they also share browser storage. Each app should save under its own key, the way Home Hub uses `homehub.v1`.

## Home Hub

A personal app for notes, reminders and grocery lists. It works on a PC and on an iPhone as an installable web app. It's written in TypeScript with no framework.

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
Run `npm run dev`, then open http://localhost:8000/home-hub/.

### On your iPhone
Open the Pages URL for `home-hub/` in **Safari**, tap **Share**, then **Add to Home Screen**.
