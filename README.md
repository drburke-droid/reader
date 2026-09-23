# Dragon Rider Reader

A tap-to-read e-reader for a beginning reader. Plain HTML/CSS/JS — no build step, no dependencies — so it runs from GitHub Pages and works on any phone or tablet (add it to the home screen and it behaves like an app).

## How it works

- **Tap** a word → it splits into syllable chunks with the vowels underlined, silent *e* dimmed and a ♥ over the part of an irregular word you learn by heart. The word grows so she can see it. She tries it first; nothing is spoken until she taps it a second time.
- **Press and hold** a word → it's marked as a tough word and added to the word list.
- At **20 words**, her spot in the story is saved as her **high score** and she goes to the Word List.
- Word List: each word shown big. A **Hint** ladder walks the decoding script (first sound → check the vowel → cover the ending → try the other vowel sound). She reads it and marks ✓ / ✗ herself; *Hear it* and the hints are there if she needs them. A miss brings the word back a few items later and again at the end; words she already knows are mixed in to keep success high. Clear the queue → back to chapter 1 to beat the high score.
- 🔥 **Warm-up lesson** (top bar, or the card on the chapter page once a day): a two-minute guided lesson on the four tricks the hints use. Find the vowels (tap them), vowels have two sounds (tap to hear), try it both ways (say *cā-mel* and *căm-el*, pick the real word), heart words, and cover-the-ending for long words. Words are shuffled each time.
- **Sticky words**: a word that lands on her list twice, or that she misses twice in practice, keeps coming back in every practice session. It is released only after two clean sessions and three reads past it in the story without tapping or holding it. Parents can release one manually.
- Passed words go into a **word bank** and are re-checked in short **quick checks** after 1, 3, 10 and 30 days. Four checks in a row = a word she "owns".
- **Timed read** (from the Grown-ups page): a parent starts the timer, taps words she misses while she reads a chapter aloud, and gets correct-words-per-minute with history per chapter. Misses can be added to the list.
- 📚 **Stories**: a library with several kids' retellings (currently *Fourth Wing* and *Dungeon Crawler Carl*). Progress and high scores are per story; word lists and sticky words carry across.
- Tapping **I finished!** on the last chapter counts as beating the story.
- ⚙️ **Grown-ups** page: stats, current list, owned words, quick check now, warm-up lesson, timed reads and norms, a "how to help when she's stuck" script, settings, saved lists, text export, restart / erase.

The design follows the reading-science evidence (see `CLAUDE.md` for the short version): decoding beats whole-word memorising, so every feature pushes her to look at every letter before she hears the word.

Progress and word lists are saved in the browser (`localStorage`) on each device.

## Files

| File | What it is |
|---|---|
| `index.html` | Page shell |
| `styles.css` | All styling; light & dark themes via CSS variables |
| `app.js` | Reader, word list, practice queue, warm-ups, timed reads, grown-ups panel, storage |
| `phonics.js` | Word analysis: grapheme tokenizer, affix peeling, syllable division, heart-word table |
| `stories/*.js` | The stories (kids' retellings of *Fourth Wing* and *Dungeon Crawler Carl*) — each pushes `{ id, title, blurb, level, chapters: [{ title, text }] }` onto `window.STORIES` |
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

1. Copy `stories/dungeon-crawler-carl.js` to `stories/<name>.js`, give it a new `id`, and replace the text. Separate paragraphs with a blank line. End chapters on a hook.
2. Add a `<script src="stories/<name>.js">` line to `index.html` next to the others. It appears in the 📚 library automatically.

## Ideas / to-do

- Per-story high scores
- Sync word lists between devices (e.g. export/import a code, or a tiny backend)
- Bigger exception dictionary for the syllable splitter (`SPLITS` / `CLOSED_FIRST` in `phonics.js`)
- Word-box (Elkonin) view for short words; mispronunciation-correction game
- Reward screen / streaks
