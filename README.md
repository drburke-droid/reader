# Dragon Rider Reader

A tap-to-read e-reader for a beginning reader. Plain HTML/CSS/JS — no build step, no dependencies — so it runs from GitHub Pages and works on any phone or tablet (add it to the home screen and it behaves like an app).

## How it works

- **Tap** a word → it splits into colour-coded chunks (*light-ning*) and is read aloud.
- **Press and hold** a word → it's marked as a tough word and added to the word list.
- At **20 words**, her spot in the story is saved as her **high score** and she goes to the Word List.
- Word List: each word shown big, with *Hear it* / *Break it up* helpers and ✓ / ✗ buttons. One miss restarts the list. 20 in a row → back to chapter 1 to beat the high score.
- Tapping **I finished!** on the last chapter counts as beating the story.
- ⚙️ **Grown-ups** page: high score, current list, every saved list (date, passed/not), recurring words, text export, restart / erase.

Progress and word lists are saved in the browser (`localStorage`) on each device.

## Files

| File | What it is |
|---|---|
| `index.html` | Page shell |
| `styles.css` | All styling; light & dark themes via CSS variables |
| `app.js` | Reader, chunking, word list, review, grown-ups panel, storage |
| `stories/fourth-wing.js` | The story (kids' retelling of *Fourth Wing*) — `window.STORY = { title, chapters: [{ title, text }] }` |
| `manifest.json`, `icon.svg` | Home-screen / PWA metadata |
| `.nojekyll` | Tells GitHub Pages to serve files as-is |

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy to GitHub Pages

The app lives at the repo root, so pushing to `main` is all that's needed:

```bash
git add . && git commit -m "Update reader" && git push
```

One-time setup on GitHub: **Settings → Pages → Source: Deploy from a branch → Branch: `main` / (root) → Save.**
The site is served at `https://drburke-droid.github.io/reader/` within a minute or two of each push.

## Adding a story

1. Copy `stories/fourth-wing.js` to `stories/<name>.js` and replace the text. Separate paragraphs with a blank line.
2. Point `index.html` at the new file (or build a story picker — see `CLAUDE.md` for ideas).

## Ideas / to-do

- Story picker with several stories at different levels
- Per-story high scores
- Sync word lists between devices (e.g. export/import a code, or a tiny backend)
- Smarter syllable splitting (a dictionary of exceptions)
- Reward screen / streaks
