# DSA Pattern Trainer

A small, browser-based study tool for practicing data structures and algorithms, recognizing problem patterns, and reviewing problems over time. It is a personal project built with plain HTML, CSS, and JavaScript.

## Run it locally

The project has no build step or package installation. From this folder, start a local web server:

```bash
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000) in your browser. Keep `index.html` and `app.js` together in the same folder. The app loads Tailwind CSS and Font Awesome from CDNs, so the first load needs an internet connection for the styling and icons.

## What it can do

- Organize problems by topic, subtopic/pattern, and difficulty.
- Practice problems due for review, choose a topic, or start a mixed interview set.
- Use a per-problem timer and set a session goal of 3, 5, or 10 problems.
- Reveal a hint and then the saved solution after attempting a problem.
- Record whether you solved independently, needed a hint, or needed the solution, and add a reflection.
- Schedule reviews adaptively based on your rating, past interval, and attempt outcome.
- Track recent attempts and independent recall by topic.
- Save scratchpad drafts by problem and programming language.
- Add problems manually, parse a pasted problem list with a preview, or import JSON with duplicate detection.
- Export and import JSON backups.

## Progress and backups

Problems, attempts, reflections, session progress, and code drafts are saved in the browser using `localStorage` and IndexedDB. Data belongs to the browser profile and site origin where you use the app. It does not automatically sync to another browser, phone, or computer.

Use **Export JSON** or **Download backup** regularly, and keep the downloaded file somewhere outside the browser. To restore it, use **Import JSON** and review the preview before confirming. Browser storage can be cleared, and switching from a `file://` URL to `http://localhost:8000` creates a different storage location. Keep using the same address and browser profile if you want to see the same local data.

## Current limitations

- This is not yet an installable offline PWA. It has no service worker or cloud sync, and its CSS/icon libraries come from CDNs.
- The code area is a scratchpad; it does not compile or run code.
- Local browser storage is not a substitute for an off-device backup.

## Project files

- `index.html` — page structure, theme setup, and external library links.
- `app.js` — application state, rendering, practice flow, storage, and import/export logic.
