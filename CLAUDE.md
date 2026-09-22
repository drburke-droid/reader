# CLAUDE.md — Dragon Rider Reader

## Purpose
E-reader web app for an 8-year-old who is learning to read. Built by her dad. Keep everything **kid-first**: big type, big touch targets, forgiving interactions, encouraging copy, nothing that requires typing.

## Stack & constraints
- Static site: `index.html` + `styles.css` + `phonics.js` + `app.js` + `stories/*.js`. Bump the `?v=` query on the script/style tags in `index.html` when shipping so GitHub Pages caches refresh. **No build step, no framework, no npm.** It must keep working by opening `index.html` or from GitHub Pages at a sub-path (use relative URLs only).
- Fonts: Andika (body — designed for beginning readers) and Fredoka (headings) from Google Fonts, with system fallbacks.
- Persistence: `localStorage` under key `dragonReader.v2` (see `S` in `app.js`). Every read/write is wrapped in try/catch. If the saved shape changes incompatibly, bump the key version rather than migrating.
- Theming: all colours are CSS variables on `:root`, redefined for dark mode. Never hard-code a colour in a component rule.
- Test locally with `python3 -m http.server 8000`.

## Why it is built this way (research summary, Sept 2026)
She has a strong memory and was memorising whole words. The evidence (Ehri's orthographic mapping, Share's self-teaching hypothesis, NRP/Ehri 2001 phonics meta-analysis, Kilpatrick, Castles/Rastle/Nation 2018) says visual memorising plateaus at roughly 40–100 words and then masks a decoding gap; permanent word storage happens when a word is *decoded* correctly, letter by letter. So every feature makes her attempt the word before hearing it and shows the word's structure (graphemes, syllables, morphemes, the irregular "heart" part) rather than flashing whole words. Whole-word flash review with no analysis is the one thing not to build. Tangible rewards are avoided (Deci 1999); the reward is the count of words she owns. Full report: `reports/` (git-ignored).

## Core rules of the game (do not change without asking)
1. Tap a word → split into chunks (syllable colours, vowel graphemes underlined, silent e dimmed, ♥ on heart-word graphemes, affixes italic). No audio yet: she tries it. Second tap or `AUDIO_DELAY` (2.5 s) → speak. Third tap → close. Only one word chunked at a time. `S.opts.delay=false` speaks immediately.
2. Press-and-hold (~550 ms) → flag as tough word, add to list (deduped by lowercase word). Haptic buzz where supported.
3. At `MAX = 20` flagged words → record high score (word index → chapter + % of story) → enter review.
4. Review = a practice **queue** (`S.queue`, `S.qi`): the flagged words in order, with up to 10 already-known bank words interleaved (`S.opts.known`). Per word: Hint ladder (first sound → vowel → cover the ending → try the other split) → *Hear it* → only then ✓/✗. ✗ re-inserts the word 3 items later and again at the end, counts a miss; the list is never reset. Emptying the queue archives the list (`S.history`, passed=true), puts each word in the bank at stage 1, clears the list, resets to chapter 1.
5. Word bank (`S.bank[word] = {w, stage, due}`): stages are spaced re-checks at `GAPS = [1,3,10,30,90]` days. A **warm-up** card appears on the chapter page when words are due (max 8, once per day); ✓ → stage+1, ✗ → stage 0 and back onto the current list if there's room. Stage ≥ 4 = "owned".
6. Timed read (parent-driven, from Grown-ups): `S.timed = {ch, start, errors}`; tapping words toggles misses; Stop → `S.fluency[ch]` gets `{wcpm, misses, secs}` and a result card shows with "add misses to list".
7. "I finished!" on the last chapter = finished high score; goes to review if the list is non-empty, otherwise straight to celebration.
8. Grown-ups panel (gear icon): stats, current list, owned words, warm-up now, timed read + Hasbrouck-Tindal norms, the parent script for stuck words, settings, saved lists, text export, restart (archives list as not passed), erase all.

## Code map
`phonics.js` (`window.PH`):
- `tokenize(w)` — longest-match grapheme tokenizer with positional rules (r-controlled units only before a consonant, `ng`/`nk` split before a vowel, silent final e).
- `peelPrefix` / `peelSuffix` — affix peeling with guards against false positives (`re|ad`, `un|der`); restores dropped e (`like·d`, `make·s`).
- `divide(gs)` — consonant-le, VC|CV, V|CV (open first; `CLOSED_FIRST` set for camel-type words), onset-preserving splits for 3+ consonants; `opts.flip` gives the other single-consonant split.
- `SPLITS` — explicit teaching splits for compounds and words the rules get wrong. `HEART_SRC` — irregular high-frequency words as grapheme patterns, `*` marks the heart part, `|` a chunk break.
- `analyze(word)` → `{chunks:[[{t,v,s,h,affix}]], alt}`; `html(word, {flip})` renders `.c.cN` chunks of `.g` graphemes (`.gv` vowel, `.gs` silent, `.gh` heart, `.gm` multi-letter, `.aff` affix chunk).
- Test quickly with `node`: `global.window={}; require("./phonics.js"); window.PH.chunkTexts("lightning")`.

`app.js`:
- `S` — single state object; `FRESH()` gives defaults; `save()`/`load()`.
- `WORDS` — flat array of every word in the story with `{id, ch, text}`; ids are the story position used for high scores.
- `render()` dispatches on `S.mode`: `read | review | done | grownups`. `S.qkind` = `list | warm` inside review.
- `bindWords(timing)` — pointer events for tap vs hold on `.w` spans (in timed mode a tap toggles a miss); keyboard: Enter/Space = chunk, X = flag.
- `buildQueue()`, `startReview()`, `answer()`, `finishQueue()` — practice loop. `H` holds per-word hint state (not persisted).
- `bankAdd/bankHit/bankMiss/dueWords/mastered/learning` — spaced re-check bank.
- `startTimed/stopTimed/renderTimedResult/addMissesToList` — fluency check.

## Story format
`stories/<name>.js` sets `window.STORY = { title, chapters: [{ title, text }] }`. Paragraphs separated by blank lines. Target reading level: roughly grade 2–3 with some harder words on purpose (names, multi-syllable words) so there is something to flag.

## Roadmap ideas
Story picker · per-story high scores · cross-device sync · grow `SPLITS`/`CLOSED_FIRST` from her actual misses · word-box (Elkonin) view for short words · mispronunciation-correction game ("I say it wrong, you fix it") · parent-adjustable `MAX` and new-words-per-session cap.
