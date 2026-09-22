# CLAUDE.md — Dragon Rider Reader

## Purpose
E-reader web app for an 8-year-old who is learning to read. Built by her dad. Keep everything **kid-first**: big type, big touch targets, forgiving interactions, encouraging copy, nothing that requires typing.

## Stack & constraints
- Static site: `index.html` + `styles.css` + `app.js` + `stories/*.js`. **No build step, no framework, no npm.** It must keep working by opening `index.html` or from GitHub Pages at a sub-path (use relative URLs only).
- Fonts: Andika (body — designed for beginning readers) and Fredoka (headings) from Google Fonts, with system fallbacks.
- Persistence: `localStorage` under key `dragonReader.v2` (see `S` in `app.js`). Every read/write is wrapped in try/catch. If the saved shape changes incompatibly, bump the key version rather than migrating.
- Theming: all colours are CSS variables on `:root`, redefined for dark mode. Never hard-code a colour in a component rule.
- Test locally with `python3 -m http.server 8000`.

## Core rules of the game (do not change without asking)
1. Tap a word → split into coloured chunks + speak it. Tapping again un-splits. Only one word chunked at a time.
2. Press-and-hold (~550 ms) → flag as tough word, add to list (deduped by lowercase word). Haptic buzz where supported.
3. At `MAX = 20` flagged words → record high score (word index → chapter + % of story) → enter review.
4. Review: words in the order they were flagged. ✓ advances; ✗ resets to word 1 and counts an attempt. Passing all 20 archives the list (`S.history`, passed=true), clears the list, resets to chapter 1.
5. "I finished!" on the last chapter = finished high score; goes to review if the list is non-empty, otherwise straight to celebration.
6. Grown-ups panel (gear icon): stats, current list, saved lists, recurring words, text export, restart (archives list as not passed), erase all.

## Code map (`app.js`)
- `chunk(word)` — heuristic syllable splitter (digraphs kept together, no vowel-less chunks). `chunkHTML()` colours chunks with `.c1–.c4`.
- `S` — single state object; `save()`/`load()`.
- `WORDS` — flat array of every word in the story with `{id, ch, text}`; ids are the story position used for high scores.
- `render()` dispatches on `S.mode`: `read | review | done | grownups`.
- `bindWords()` — pointer events for tap vs hold on `.w` spans; keyboard: Enter/Space = chunk, X = flag.

## Story format
`stories/<name>.js` sets `window.STORY = { title, chapters: [{ title, text }] }`. Paragraphs separated by blank lines. Target reading level: roughly grade 2–3 with some harder words on purpose (names, multi-syllable words) so there is something to flag.

## Roadmap ideas
Story picker · per-story high scores · cross-device sync · syllable exception dictionary · reward/streak screen · parent-adjustable `MAX`.
