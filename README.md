# Fun
A little place for me to test new fun ideas with Claude

Each app lives in its own folder. `index.html` at the root is a launcher page that links to them.
The web apps are written in TypeScript. `npm run build` compiles them into `dist/`, which is the folder that gets published.

| App | Folder | How it runs |
| --- | --- | --- |
| Shelf Prep | [`shelf-prep/`](shelf-prep/) | TypeScript web app, built into `dist/` and published to GitHub Pages |

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
3. The launcher is at `https://<your-username>.github.io/<repo-name>/`, and each app is at `…/<folder>/`, e.g. `…/shelf-prep/`.

All apps on Pages share one site, so they also share browser storage. Each app should save under its own key, the way Shelf Prep uses `shelfprep.v1`.

## Shelf Prep

Practice for the Internal Medicine shelf exam. It works on a PC and on an iPhone as an installable web app.

### Features
- **Body map**: tap an organ to study that system. Organs are colored by how well that system's questions are going.
- **Board-style questions**: clinical vignettes with five choices. Every choice has an explanation, plus a one-line takeaway.
  - **Tutor mode** shows the answer after each question.
  - **Timed mode** gives 90 seconds per question, like the shelf, with marking and a review at the end.
  - You can cross out choices and use keyboard shortcuts on a PC.
- **Flashcards with spaced repetition**: rate a card Again, Hard, Good or Easy, and it comes back sooner or later accordingly, Anki-style.
- **Progress**: accuracy by system and topic, your weakest topics, and a "retry missed questions" option.
- **Library**: edit any question or card, add your own, and import flashcards from Anki or a spreadsheet.
  - **Flag**: mark anything that looks wrong so you can find it later.
  - **Backup**: export or import your progress.

### Content
`shelf-prep/content.ts` holds the starter bank: 36 original questions and 54 flashcards across 9 systems (cardiology, pulmonology, GI, renal, endocrine, heme/onc, ID, rheumatology, neurology).
- **Accuracy:** the starter bank was written by an AI for practice and can contain mistakes. It's not a substitute for vetted resources like UWorld or the NBME practice exams. Check anything surprising and flag it.
- **Your edits:** edits made in the app are stored separately, so the original stays available through "Restore original".

### Run locally
Run `npm run dev`, then open http://localhost:8000/shelf-prep/.

### On your iPhone
Open the Pages URL for `shelf-prep/` in **Safari**, tap **Share**, then **Add to Home Screen**.
