const STORY = window.STORY;
const PH = window.PH;

/* ---------- STATE ---------- */
const MAX = 20;
const KEY = "dragonReader.v2";
const DAY = 864e5;
const GAPS = [1, 3, 10, 30, 90];              // days between spaced checks, per stage (stage 4+ = mastered)

const FRESH = () => ({
  chapter: 0, flagged: [], flaggedIds: {},   // flagged: [{id, word}]
  best: null,                                 // {id, chapter, pct, date, finished}
  history: [], mode: "read",                  // read | review | done | grownups
  reviewIdx: 0, attempts: 0,
  queue: null, qi: 0, qkind: "list",          // current practice queue: [{w, k: new|known|warm}]
  bank: {},                                   // word → {w, stage, due, seen}  (spaced re-checks)
  fluency: {},                                // chapter → [{date, secs, words, misses, wcpm}]
  timed: null, lastTimed: null,               // timed read in progress / just finished
  lastWarm: 0, lessonStep: 0, lessons: 0, lastLesson: 0, opts: { delay: true, known: true },
  tough: null, pressed: {}, sessMiss: {}                 // sticky-word tracking (see STICKY below)
});
let S = FRESH();
function load(){ try{ const raw = localStorage.getItem(KEY); if (raw) S = Object.assign(FRESH(), JSON.parse(raw)); S.opts = Object.assign({ delay: true, known: true }, S.opts || {}); }catch(e){} }
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }
load();
if (S.mode === "review" && !S.queue) S.mode = "read";   // older saved state

/* word index across the whole story */
const WORDS = []; // {id, ch, text}
STORY.chapters.forEach((c, ci) => c.text.split(/\s+/).forEach(t => { if (t) WORDS.push({ id: WORDS.length, ch: ci, text: t }); }));
const TOTAL = WORDS.length;

function clean(t){ return t.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g,""); }
function esc(t){ return String(t).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
const toastEl = document.getElementById("toast"); let toastT;
function toast(msg){ toastEl.textContent = msg; toastEl.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(()=>toastEl.classList.remove("on"), 1800); }
function speak(t, rate){ try{ if (!window.speechSynthesis) return; speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.rate = rate || .8; speechSynthesis.speak(u); }catch(e){} }
const today = () => new Date().toISOString().slice(0,10);
const fmtDate = d => new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" });

/* ---------- WORD BANK (spaced re-checks) ---------- */
function bankKey(w){ return w.toLowerCase(); }
function bankAdd(word, stage){
  const k = bankKey(word); const b = S.bank[k] || { w: word, stage: 0, seen: 0 };
  b.stage = stage; b.due = Date.now() + (GAPS[stage-1] || 365) * DAY; b.seen++; S.bank[k] = b;
}
function bankHit(word){ const b = S.bank[bankKey(word)]; if (!b) return bankAdd(word, 1); bankAdd(word, b.stage + 1); }
function bankMiss(word){ const k = bankKey(word); const b = S.bank[k] || { w: word, seen: 0 }; b.stage = 0; b.due = Date.now() + DAY; b.seen++; S.bank[k] = b; }
function dueWords(){ const now = Date.now(); return Object.values(S.bank).filter(b => b.stage >= 1 && b.stage < GAPS.length && b.due <= now); }
function mastered(){ return Object.values(S.bank).filter(b => b.stage >= 4); }

/* ---------- STICKY WORDS ----------
   A word turns sticky when it lands on STICKY_FLAGS different lists or is missed STICKY_MISSES times in practice.
   Sticky words join every practice session. They are released only when she clears them in RELEASE_STREAK
   sessions in a row AND has read past them RELEASE_SEEN times in the story without tapping or holding them. */
const STICKY_FLAGS = 2, STICKY_MISSES = 2, RELEASE_STREAK = 2, RELEASE_SEEN = 3;
function tough(word){ const k = bankKey(word); return S.tough[k] || (S.tough[k] = { w: word, flags: 0, misses: 0, streak: 0, seen: 0, sticky: false }); }
function checkSticky(t){ if (!t.sticky && (t.flags >= STICKY_FLAGS || t.misses >= STICKY_MISSES)){ t.sticky = true; t.since = Date.now(); t.streak = 0; t.seen = 0; } }
function toughFlag(word){ const t = tough(word); t.flags++; t.seen = 0; checkSticky(t); }
function toughMiss(word){ const t = tough(word); t.misses++; t.streak = 0; t.seen = 0; checkSticky(t); S.sessMiss[bankKey(word)] = 1; }
function toughPress(word){ const k = bankKey(word); S.pressed[k] = 1; const t = S.tough[k]; if (t && t.sticky) t.seen = 0; }
function stickyWords(){ return Object.values(S.tough).filter(t => t.sticky); }
function tryRelease(t){
  if (t.sticky && t.streak >= RELEASE_STREAK && t.seen >= RELEASE_SEEN){
    t.sticky = false; t.flags = 0; t.misses = 0; t.streak = 0; t.seen = 0; t.released = Date.now();
    setTimeout(() => toast(`"${t.w}" isn't sticky any more. You own it!`), 700);
  }
}
/* she read past chapter ci: every sticky word in it that she didn't press counts as seen */
function leaveChapter(ci){
  const counts = {}; WORDS.filter(w => w.ch === ci).forEach(w => { const k = clean(w.text).toLowerCase(); if (k) counts[k] = (counts[k]||0) + 1; });
  stickyWords().forEach(t => { const k = bankKey(t.w); if (!counts[k]) return; if (S.pressed[k]){ t.seen = 0; return; } t.seen += Math.min(2, counts[k]); tryRelease(t); });
  S.pressed = {};
}
/* end of a practice session: sticky words she cleared without a miss extend their streak */
function settleSession(){
  const inSession = new Set((S.queue || []).map(q => bankKey(q.w)));
  stickyWords().forEach(t => { const k = bankKey(t.w); if (!inSession.has(k)) return; if (S.sessMiss[k]) t.streak = 0; else { t.streak++; tryRelease(t); } });
  S.sessMiss = {};
}
if (!S.tough){ S.tough = {}; S.history.forEach(h => h.words.forEach(w => tough(w).flags++)); S.flagged.forEach(f => tough(f.word).flags++); Object.values(S.tough).forEach(checkSticky); save(); }

function learning(){ return Object.values(S.bank).filter(b => b.stage >= 1 && b.stage < 4); }

/* ---------- RENDER ---------- */
const view = document.getElementById("view"), scroll = document.getElementById("scroll");
function updateTop(){
  const pill = document.getElementById("pill"), pt = document.getElementById("pillText");
  if (S.mode === "review"){ const done = S.qi, total = S.queue ? S.queue.length : 0; pt.textContent = `${done} / ${total}`; pill.style.background = "var(--good)"; pill.style.color = "#fff"; }
  else { pt.textContent = `${S.flagged.length} / ${MAX}`; pill.style.background = ""; pill.style.color = ""; }
  const pct = S.mode === "read" ? (WORDS.filter(w=>w.ch<S.chapter).length / TOTAL) * 100 : 100;
  document.getElementById("barFill").style.width = pct + "%";
  document.getElementById("topTitle").textContent = S.mode==="read" ? STORY.title : S.mode==="review" ? (S.qkind === "warm" ? "Quick check" : "Word List") : S.mode === "lesson" ? "Warm-up" : "Dragon Rider Reader";
}
function render(){
  clearInterval(timerTick);
  updateTop();
  if (S.mode === "read") renderRead();
  else if (S.mode === "review") renderReview();
  else if (S.mode === "done") renderDone();
  else if (S.mode === "grownups") renderGrownups();
  else if (S.mode === "lesson") renderLesson();
  scroll.scrollTop = 0;
}

/* ---------- READING ---------- */
let timerTick = null;
function renderRead(){
  const ci = S.chapter, ch = STORY.chapters[ci];
  const paras = ch.text.split(/\n\n+/);
  let id = WORDS.findIndex(w => w.ch === ci);
  const timed = S.timed && S.timed.ch === ci ? S.timed : null;
  const html = paras.map(p => "<p>" + p.split(/\s+/).map(t => {
    const w = WORDS[id++];
    const fl = S.flaggedIds[w.id] ? " flag" : "";
    const ms = timed && timed.errors[w.id] ? " miss" : "";
    return `<span class="w${fl}${ms}" data-id="${w.id}" tabindex="0">${esc(t)}</span>`;
  }).join(" ") + "</p>").join("");
  const bestLine = S.best ? `Best so far: <b>${S.best.finished ? "finished the whole story!" : "Chapter " + (S.best.chapter+1) + " (" + S.best.pct + "% of the story)"}</b>` : "No high score yet. Read as far as you can!";
  const due = dueWords();
  const warm = (!timed && due.length && S.lastWarm !== today()) ? `
    <div class="card warm">
      <div class="warmrow"><span class="flame">🧠</span><div><b>Quick check?</b><br><span class="hint" style="margin:0">${due.length} word${due.length>1?"s":""} from before. Still got ${due.length>1?"them":"it"}?</span></div></div>
      <div class="row" style="justify-content:flex-start"><button class="btn small" id="warmGo">Let's check</button><button class="btn ghost small" id="warmSkip">Later</button></div>
    </div>` : "";
  const lt = S.lastTimed && S.lastTimed.ch === ci ? renderTimedResult(S.lastTimed) : "";
  const lesson = (!timed && S.lastLesson !== today()) ? `<div class="card warm lessoncard"><div class="warmrow"><span class="flame">🔥</span><div><b>Warm up first?</b><br><span class="hint" style="margin:0">Four reading tricks in about two minutes.</span></div></div><div class="row" style="justify-content:flex-start"><button class="btn small" id="lessonGo">Let's go</button><button class="btn ghost small" id="lessonSkip">Not today</button></div></div>` : "";
  const strip = timed ? `<div class="strip"><span>⏱ <b id="clock">0:00</b> · reading with a grown-up · tap a word she misses</span><button class="btn small" id="stopTimed">Stop</button></div>` : "";
  view.innerHTML = `${lesson}${warm}${lt}
    <div class="card chapter">
      ${strip}
      <div class="eyebrow">Chapter ${ci+1} of ${STORY.chapters.length}</div>
      <h2>${esc(ch.title)}</h2>
      <div class="text${timed ? " timing" : ""}" id="text">${html}</div>
      <div class="nav">
        <button class="btn ghost" id="prev" ${ci===0?"disabled":""}>← Back</button>
        ${ci < STORY.chapters.length-1 ? `<button class="btn" id="next">Next chapter →</button>` : `<button class="btn big" id="finish">🎉 I finished!</button>`}
      </div>
      <p class="hint">${timed ? "<b>Timed read.</b> Tap any word she gets wrong. Tap Stop when she reaches the end." : `<b>Tap</b> a word to break it into pieces. Try to read it. Tap it again if you want to hear it. <b>Press and hold</b> a tricky word to add it to your list. ${bestLine}`}</p>
    </div>`;
  const p = document.getElementById("prev"), n = document.getElementById("next"), f = document.getElementById("finish");
  if (p) p.onclick = () => { S.pressed = {}; S.chapter--; save(); render(); };
  if (n) n.onclick = () => { leaveChapter(ci); S.chapter++; save(); render(); };
  if (f) f.onclick = () => { leaveChapter(ci); finishStory(); };
  const wg = document.getElementById("warmGo"); if (wg) wg.onclick = () => startWarmup();
  const lg = document.getElementById("lessonGo"); if (lg) lg.onclick = startLesson;
  const ls = document.getElementById("lessonSkip"); if (ls) ls.onclick = () => { S.lastLesson = today(); save(); render(); };
  const ws = document.getElementById("warmSkip"); if (ws) ws.onclick = () => { S.lastWarm = today(); save(); render(); };
  const st = document.getElementById("stopTimed"); if (st) st.onclick = stopTimed;
  const dm = document.getElementById("dismissTimed"); if (dm) dm.onclick = () => { S.lastTimed = null; save(); render(); };
  const am = document.getElementById("addMisses"); if (am) am.onclick = () => { addMissesToList(S.lastTimed); S.lastTimed = null; save(); render(); };
  if (timed){ const clock = document.getElementById("clock"); const tick = () => { const s = Math.floor((Date.now() - timed.start)/1000); clock.textContent = `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`; }; tick(); timerTick = setInterval(tick, 1000); }
  bindWords(!!timed);
}

let pressTimer = null, pressed = null, longFired = false;
function bindWords(timing){
  const text = document.getElementById("text");
  text.addEventListener("contextmenu", e => e.preventDefault());
  if (timing){
    text.addEventListener("pointerup", e => { const el = e.target.closest(".w"); if (!el) return; const id = el.dataset.id; if (S.timed.errors[id]) delete S.timed.errors[id]; else S.timed.errors[id] = 1; el.classList.toggle("miss"); save(); });
    return;
  }
  text.addEventListener("pointerdown", e => {
    const el = e.target.closest(".w"); if (!el) return;
    pressed = el; longFired = false; el.classList.add("pressing");
    pressTimer = setTimeout(() => { longFired = true; el.classList.remove("pressing"); flagWord(el); }, 550);
  });
  const end = e => {
    clearTimeout(pressTimer);
    if (pressed){ pressed.classList.remove("pressing"); if (!longFired && e.type === "pointerup" && e.target.closest(".w") === pressed) chunkWord(pressed); }
    pressed = null;
  };
  text.addEventListener("pointerup", end); text.addEventListener("pointercancel", end); text.addEventListener("pointerleave", end);
  text.addEventListener("keydown", e => { const el = e.target.closest(".w"); if (!el) return; if (e.key === "Enter" || e.key === " "){ e.preventDefault(); chunkWord(el); } if (e.key.toLowerCase() === "x") flagWord(el); });
}
function chunkHTML(t, opts){ return t.split("-").map(part => PH.html(part, opts)).join("<span class=\"c\">-</span>"); }
function unchunkAll(){ document.querySelectorAll(".w.chunked").forEach(o => { o.classList.remove("chunked","spoken"); o.textContent = WORDS[+o.dataset.id].text; }); }
/* Tap 1: the word grows and splits into chunks (she tries it). Tap 2: hear it. Tap 3: close. No audio unless she asks. */
function chunkWord(el){
  const w = WORDS[+el.dataset.id], word = clean(w.text);
  if (el.classList.contains("chunked")){
    if (el.classList.contains("spoken") || !S.opts.delay){ el.classList.remove("chunked","spoken"); el.textContent = w.text; return; }
    el.classList.add("spoken"); speak(word); return;
  }
  unchunkAll();
  toughPress(word);
  el.classList.add("chunked"); el.innerHTML = chunkHTML(w.text);
  if (!S.opts.delay){ el.classList.add("spoken"); speak(word); }
}
function flagWord(el){
  const w = WORDS[+el.dataset.id], word = clean(w.text);
  if (!word || S.flaggedIds[w.id]) return;
  if (S.flagged.some(f => f.word.toLowerCase() === word.toLowerCase())){ S.flaggedIds[w.id] = 1; el.classList.add("flag"); save(); toast("Already on your list"); return; }
  S.flaggedIds[w.id] = 1; S.flagged.push({ id: w.id, word });
  toughFlag(word); toughPress(word);
  el.classList.add("flag"); el.classList.remove("chunked","spoken"); el.textContent = w.text;
  try{ navigator.vibrate && navigator.vibrate(40); }catch(e){}
  save(); updateTop();
  if (S.flagged.length >= MAX){ setHighScore(w.id, false); toast(`${MAX} words! Time to practise`); setTimeout(() => startReview("list"), 600); }
  else toast(`Added "${word}"  (${S.flagged.length} of ${MAX})`);
}
function setHighScore(id, finished){
  const pct = Math.round((id+1) / TOTAL * 100), chapter = WORDS[id].ch;
  const better = !S.best || finished || (!S.best.finished && id > S.best.id);
  if (better) S.best = { id, chapter, pct, date: new Date().toISOString(), finished };
}
function finishStory(){
  setHighScore(TOTAL-1, true);
  if (S.flagged.length) startReview("list");
  else { archive(true); S.mode = "done"; save(); render(); }
}

/* ---------- TIMED READ (assisted repeated reading) ---------- */
function startTimed(ch){ S.timed = { ch, start: Date.now(), errors: {} }; S.lastTimed = null; S.chapter = ch; S.mode = "read"; save(); render(); }
function stopTimed(){
  const t = S.timed; if (!t) return;
  const secs = Math.max(1, Math.round((Date.now() - t.start) / 1000));
  const words = WORDS.filter(w => w.ch === t.ch).length;
  const misses = Object.keys(t.errors).map(id => clean(WORDS[+id].text)).filter(Boolean);
  const wcpm = Math.round((words - misses.length) / (secs / 60));
  const r = { date: new Date().toISOString(), ch: t.ch, secs, words, misses, wcpm };
  (S.fluency[t.ch] = S.fluency[t.ch] || []).push(r); S.fluency[t.ch] = S.fluency[t.ch].slice(-12);
  S.timed = null; S.lastTimed = r; save(); render();
}
function renderTimedResult(r){
  const prev = (S.fluency[r.ch] || []).slice(0, -1).slice(-3).reverse();
  const acc = Math.round((r.words - r.misses.length) / r.words * 100);
  return `<div class="card result">
    <h3>⏱ Timed read · Chapter ${r.ch+1}</h3>
    <div class="stat">
      <div><b>${r.wcpm}</b><span>correct words per minute</span></div>
      <div><b>${acc}%</b><span>read correctly</span></div>
      <div><b>${r.misses.length}</b><span>misses</span></div>
    </div>
    ${r.misses.length ? `<div class="chips">${r.misses.map(m=>`<span class="chip">${esc(m)}</span>`).join("")}</div>` : `<p class="hint" style="margin-top:8px">Every word right. Try a chapter she hasn't read yet.</p>`}
    ${prev.length ? `<p class="hint" style="margin-top:8px">Earlier reads of this chapter: ${prev.map(p=>`${p.wcpm} wpm (${fmtDate(p.date)})`).join(" · ")}</p>` : ""}
    <div class="row" style="justify-content:flex-start;margin-top:12px">
      ${r.misses.length ? `<button class="btn small" id="addMisses">Add misses to word list</button>` : ""}
      <button class="btn ghost small" id="dismissTimed">Done</button>
    </div>
  </div>`;
}
function addMissesToList(r){
  let added = 0;
  r.misses.forEach(m => {
    if (S.flagged.length >= MAX) return;
    if (S.flagged.some(f => f.word.toLowerCase() === m.toLowerCase())) return;
    const w = WORDS.find(x => x.ch === r.ch && clean(x.text).toLowerCase() === m.toLowerCase());
    S.flagged.push({ id: w ? w.id : -1, word: m }); if (w) S.flaggedIds[w.id] = 1; added++;
  });
  toast(added ? `Added ${added} word${added>1?"s":""} to the list` : "Those words are already on the list");
}

/* ---------- PRACTICE (review + warm-up) ---------- */
function buildQueue(){
  const news = S.flagged.map(f => ({ w: f.word, k: "new" }));
  let known = [];
  if (S.opts.known){
    const fl = new Set(S.flagged.map(f => f.word.toLowerCase()));
    known = Object.values(S.bank).filter(b => b.stage >= 1 && !fl.has(bankKey(b.w)))
      .sort(() => Math.random() - .5).slice(0, Math.min(10, Math.ceil(news.length / 2))).map(b => ({ w: b.w, k: "known" }));
  }
  const fl = new Set(S.flagged.map(f => bankKey(f.word)));
  const sticky = stickyWords().filter(t => !fl.has(bankKey(t.w))).map(t => ({ w: t.w, k: "sticky" }));
  const q = []; let ki = 0, si = 0;
  news.forEach((n, i) => { q.push(n); if (ki < known.length && i % 2 === 1) q.push(known[ki++]); if (si < sticky.length && i % 3 === 2) q.push(sticky[si++]); });
  while (ki < known.length || si < sticky.length){ if (si < sticky.length) q.push(sticky[si++]); if (ki < known.length) q.push(known[ki++]); }
  return q;
}
function startReview(kind){
  S.qkind = kind; S.queue = kind === "warm" ? dueWords().slice(0, 8).map(b => ({ w: b.w, k: "warm" })) : buildQueue();
  S.qi = 0; S.attempts = 0; S.sessMiss = {}; S.mode = "review"; save(); render();
}
function startWarmup(){ if (!dueWords().length){ toast("Nothing to check today"); return; } startReview("warm"); }

let H = { step: 0, heard: false, flip: false, key: null };
const HINTS = [
  null,
  { q: "What's the first sound?", how: "Look at the very first letter and get your mouth ready." },
  { q: "Check the vowel. What is it doing?", how: "The underlined part is the vowel. It can say more than one sound." },
  { q: "Cover the ending. Read the first part.", how: "Say the first chunk. Then uncover the next one." },
  { q: "Yes, it could be that. What else could it be?", how: "Try the other vowel sound. Does it sound like a word you know?" }
];
function renderReview(){
  const q = S.queue, i = S.qi, item = q[i];
  if (!item){ finishQueue(); return; }
  if (H.key !== i + item.w){ H = { step: 0, heard: false, flip: false, key: i + item.w }; }
  const heart = PH.isHeart(item.w), alt = PH.analyze(item.w).alt;
  const dots = q.map((x, k) => `<i class="${k<i?"done":k===i?"now":""}${x.k!=="new"?" known":""}"></i>`).join("");
  const kindLine = item.k === "known" ? "One you already know." : item.k === "warm" ? "From a while ago. Still got it?" : item.k === "sticky" ? "A sticky word. You've been working on this one." : "";
  const hint = HINTS[H.step];
  let word;
  if (H.step === 0) word = esc(item.w);
  else if (H.step === 1){ const h = PH.html(item.w); word = h.replace('<span class="g', '<span class="g hl'); }
  else if (H.step === 2) word = PH.html(item.w);
  else if (H.step === 3){ const parts = PH.analyze(item.w).chunks; word = parts.map((c, k) => `<span class="c c${k%4+1}${k ? " mask" : ""}">${c.map(g => g.punct ? g.t : `<span class="g${g.v?" gv":""}${g.s?" gs":""}${g.h?" gh":""}">${g.t}</span>`).join("")}</span>`).join(""); }
  else word = PH.html(item.w, { flip: alt && H.flip });
  const caption = H.heard
    ? (heart ? `<b>Heart word.</b> The part with the ♥ doesn't play fair. Learn that bit by heart; the rest you can sound out.` : `Say it once more while you look at <b>every letter</b>.`)
    : hint ? `<b>${hint.q}</b> ${hint.how}` : `Read it out loud. Know it? Tap <b>✓</b>. Not sure? Try a <b>Hint</b> or <b>Hear it</b>.`;
  view.innerHTML = `
    <div class="card review">
      <div class="dots">${dots}</div>
      <p class="hint" style="margin:0">Word ${i+1} of ${q.length}. ${kindLine}</p>
      <div class="bigword pop${H.step ? " chunked" : ""}${H.step === 1 ? " plain" : ""}" id="bigword" tabindex="0">${word}</div>
      <p class="hint caption" style="margin:0">${caption}</p>
      <div class="row">
        ${!H.heard && H.step < 4 ? `<button class="btn ghost small" id="hint">💡 Hint</button>` : ""}
        ${!H.heard && H.step === 4 && alt ? `<button class="btn ghost small" id="flip">↔ Try it the other way</button>` : ""}
        ${H.step ? `<button class="btn ghost small" id="split">${H.step >= 2 ? "Whole word" : "Break it up"}</button>` : ""}
        <button class="btn ${H.heard ? "ghost " : ""}small" id="hear">🔊 Hear it</button>
      </div>
      <div class="row">
        <button class="btn bad big" id="wrong">✗ Not yet</button>
        <button class="btn good big" id="right">✓ Got it</button>
      </div>
      <p class="hint">${S.qkind === "warm" ? "A quick check of words you learned before. Then back to the story." : `Get every word right to finish the list. A miss just means that word comes back later.${S.attempts ? ` <b>Misses so far: ${S.attempts}.</b>` : ""}`}</p>
    </div>`;
  const bw = document.getElementById("bigword");
  const rerender = () => renderReview();
  bw.onclick = e => {
    const ch = e.target.closest(".c");
    if (ch && H.step){ const txt = ch.textContent.replace(/[^A-Za-z']/g,""); if (txt) speak(txt, .7); return; }
    if (!H.step){ H.step = 2; rerender(); } else { H.step = 0; rerender(); }
  };
  const hb = document.getElementById("hint"); if (hb) hb.onclick = () => { H.step = Math.min(4, H.step + 1); if (H.step === 3 && PH.analyze(item.w).chunks.length < 2) H.step = 4; rerender(); };
  const fb = document.getElementById("flip"); if (fb) fb.onclick = () => { H.flip = !H.flip; rerender(); };
  const sb = document.getElementById("split"); if (sb) sb.onclick = () => { H.step = H.step >= 2 ? 0 : 2; rerender(); };
  document.getElementById("hear").onclick = () => { speak(item.w); if (!H.heard){ H.heard = true; if (H.step < 2) H.step = 2; H.flip = false; rerender(); } };
  const rb = document.getElementById("right"); if (rb) rb.onclick = () => answer(true);
  const wb = document.getElementById("wrong"); if (wb) wb.onclick = () => { bw.classList.add("shake"); setTimeout(() => answer(false), 350); };
}
function answer(right){
  const q = S.queue, item = q[S.qi];
  if (right){
    if (item.k === "warm" || item.k === "known") bankHit(item.w);
    S.qi++;
  } else {
    S.attempts++; toughMiss(item.w);
    if (item.k === "warm" || item.k === "known"){
      bankMiss(item.w);
      if (item.k === "warm" && S.flagged.length < MAX && !S.flagged.some(f => f.word.toLowerCase() === item.w.toLowerCase())){
        const w = WORDS.find(x => clean(x.text).toLowerCase() === item.w.toLowerCase());
        S.flagged.push({ id: w ? w.id : -1, word: item.w }); if (w) S.flaggedIds[w.id] = 1;
      }
    }
    // the word comes back soon, and again at the end (spaced retrieval)
    const again = { w: item.w, k: item.k, again: true };
    q.splice(Math.min(q.length, S.qi + 3), 0, again);
    if (item.k === "new" && !item.again) q.push({ ...again });
    S.qi++;
    toast("No worries. It'll come back in a minute.");
  }
  save(); render();
}
function finishQueue(){
  settleSession();
  if (S.qkind === "warm"){ S.lastWarm = today(); S.queue = null; S.mode = "read"; save(); toast("Quick check done. Nice work!"); render(); return; }
  S.flagged.forEach(f => bankAdd(f.word, 1));
  archive(true); S.queue = null; S.mode = "done"; save(); render();
}
function archive(passed){
  if (S.flagged.length) S.history.unshift({ date: new Date().toISOString(), words: S.flagged.map(f=>f.word), passed, attempts: S.attempts, chapter: S.best ? S.best.chapter : S.chapter });
  S.history = S.history.slice(0, 50);
  S.flagged = []; S.flaggedIds = {}; S.reviewIdx = 0; S.attempts = 0; S.chapter = 0; S.queue = null; S.pressed = {};
}
function renderDone(){
  const b = S.best, own = mastered().length, learn = learning().length;
  const praise = ["You looked at every letter. That's how words stick.", "You broke the big words into pieces. That's what strong readers do.", "You kept going after a miss. That's the whole trick."][S.history.length % 3];
  view.innerHTML = `
    <div class="card celebrate">
      <div class="dragon pop">🐉</div>
      <h2 style="font-size:2rem;color:var(--ember)">You did it!</h2>
      <p>${b && b.finished ? "You finished the whole story <b>and</b> beat your word list!" : `Every word on the list. Your high score is <b>Chapter ${b ? b.chapter+1 : 1}</b>.`}</p>
      <div class="stat" style="max-width:24em;margin:6px auto 0">
        <div><b>${own}</b><span>words you own</span></div>
        <div><b>${learn}</b><span>words nearly there</span></div>
      </div>
      <p class="hint">${praise} The story starts again from the beginning. Can you read even further this time?</p>
      <button class="btn big" id="again">Read again →</button>
    </div>`;
  document.getElementById("again").onclick = () => { S.mode = "read"; S.chapter = 0; save(); render(); };
}


/* ---------- WARM-UP LESSON (the four tricks) ---------- */
const HUNT_WORDS = ["sunset","rabbit","napkin","basket","picnic","cactus","muffin","magnet","velvet","pumpkin","kitten","hidden"];
const FLEX_WORDS = [
  { w:"camel",  open:"kay mel",  closed:"cam el",   ans:"closed" },
  { w:"tiger",  open:"tie gur",  closed:"tig ur",   ans:"open" },
  { w:"robot",  open:"roe bot",  closed:"rob ot",   ans:"open" },
  { w:"lemon",  open:"lee mon",  closed:"lem un",   ans:"closed" },
  { w:"paper",  open:"pay per",  closed:"pap er",   ans:"open" },
  { w:"seven",  open:"see ven",  closed:"sev en",   ans:"closed" },
  { w:"music",  open:"mew zik",  closed:"muss ick", ans:"open" },
  { w:"planet", open:"play net", closed:"plan et",  ans:"closed" },
  { w:"wagon",  open:"way gon",  closed:"wag on",   ans:"closed" },
  { w:"bacon",  open:"bay kun",  closed:"back on",  ans:"open" },
  { w:"river",  open:"rye ver",  closed:"riv er",   ans:"closed" },
  { w:"silent", open:"sigh lent",closed:"sill ent", ans:"open" }
];
const VOWELS = [
  { v:"a", short:"apple", long:"cake" }, { v:"e", short:"egg", long:"me" }, { v:"i", short:"pig", long:"kite" },
  { v:"o", short:"hot", long:"go" }, { v:"u", short:"cup", long:"music" }
];
const HEART_DEMO = ["said","was","of","they"];
const COVER_WORDS = ["fantastic","lightning","umbrella","adventure","remember","suddenly"];
const pick = (arr, n) => arr.slice().sort(() => Math.random() - .5).slice(0, n);
let L = null;   // per-session lesson state (not persisted)
function startLesson(){
  L = { hunt: pick(HUNT_WORDS, 2), flex: pick(FLEX_WORDS, 3), cover: pick(COVER_WORDS, 1)[0], i: 0, picked: {}, checked: false, chose: null, shown: 1 };
  S.lessonStep = 0; S.mode = "lesson"; save(); render();
}
function lessonNext(){ S.lessonStep++; L.i = 0; L.picked = {}; L.checked = false; L.chose = null; L.shown = 1; save(); render(); }
function tileHTML(word, cls){
  const mark = (g, k) => { const p = !!L.picked[k]; if (!L.checked) return p ? " pick" : ""; return g.v ? (p ? " ok" : " missed") : (p ? " wrong" : ""); };
  return `<div class="tiles ${cls||""}">${PH.tokenize(word.toLowerCase()).map((g, k) => `<button class="tile${g.t.length>1 ? " team" : ""}${mark(g, k)}" data-k="${k}">${g.t}</button>`).join("")}</div>`;
}
function markedSplit(split, kind){
  // "ca|mel" → chunks; first vowel letter of the first chunk gets a macron (open) or breve (closed)
  return split.split("|").map((c, i) => { let done = false; return `<span class="c c${i%4+1}">` + [...c].map(ch => { if (i === 0 && !done && "aeiou".includes(ch)){ done = true; return `<span class="g gv ${kind}">${ch}</span>`; } return `<span class="g">${ch}</span>`; }).join("") + "</span>"; }).join("");
}
function renderLesson(){
  if (!L){ L = { hunt: pick(HUNT_WORDS, 2), flex: pick(FLEX_WORDS, 3), cover: pick(COVER_WORDS, 1)[0], i: 0, picked: {}, checked: false, chose: null, shown: 1 }; }
  const step = S.lessonStep, total = 6;
  const bar = `<div class="steps">${Array.from({length: total}, (_, k) => `<i class="${k < step ? "done" : k === step ? "now" : ""}"></i>`).join("")}</div>`;
  let body = "", after = () => {};
  if (step === 0){
    body = `<div class="lesson intro"><div class="dragon pop">🔥</div><h2>Warm-up</h2>
      <p>Strong readers don't guess. They use four tricks. Let's practise them on a few words, then go read.</p>
      <ol class="tricks"><li>Find the vowels</li><li>Vowels have two sounds</li><li>Try it both ways</li><li>Heart words</li></ol>
      <button class="btn big" id="next">Let's go →</button></div>`;
  }
  else if (step === 1){
    const word = L.hunt[L.i];
    const toks = PH.tokenize(word);
    const nv = toks.filter(g => g.v).length;
    body = `<div class="lesson"><div class="eyebrow">Trick 1 of 4 · word ${L.i+1} of ${L.hunt.length}</div><h2>Find the vowels</h2>
      <p>Every chunk has <b>one</b> vowel sound. The vowels are <b>a e i o u</b> (and sometimes y). Tap the vowels in this word.</p>
      ${tileHTML(word, L.checked ? "checked" : "")}
      ${L.checked ? `<p class="lesson-msg"><b>${nv} vowel${nv>1?"s":""}, so ${nv} chunk${nv>1?"s":""}.</b> Tap each chunk to hear it, then hear the whole word.</p>
        <div class="bigword chunked lessonword" id="lessonword">${PH.html(word)}</div>
        <div class="row"><button class="btn ghost small" id="hearWord">🔊 Whole word</button><button class="btn small" id="next">${L.i < L.hunt.length-1 ? "Next word →" : "Next trick →"}</button></div>`
      : `<div class="row"><button class="btn small" id="check">Check</button></div>`}
    </div>`;
    after = () => {
      document.querySelectorAll(".tile").forEach(t => t.onclick = () => { if (L.checked) return; const k = t.dataset.k; L.picked[k] = !L.picked[k]; t.classList.toggle("pick", L.picked[k]); });
      const ck = document.getElementById("check"); if (ck) ck.onclick = () => {
        L.checked = true; let missed = 0, wrong = 0;
        document.querySelectorAll(".tile").forEach(t => { const g = toks[+t.dataset.k]; const p = !!L.picked[t.dataset.k]; if (g.v && p) t.classList.add("ok"); else if (g.v && !p){ t.classList.add("missed"); missed++; } else if (!g.v && p){ t.classList.add("wrong"); wrong++; } });
        toast(!missed && !wrong ? "Yes! You found them all." : missed ? "Nearly. The green ones are the vowels." : "Close. Only the green ones are vowels.");
        setTimeout(render, 900);
      };
      const lw = document.getElementById("lessonword"); if (lw) lw.onclick = e => { const c = e.target.closest(".c"); if (c) speak(c.textContent.replace(/[^A-Za-z]/g,""), .7); };
      const hw = document.getElementById("hearWord"); if (hw) hw.onclick = () => speak(word);
      const nx = document.getElementById("next"); if (nx) nx.onclick = () => { if (L.i < L.hunt.length-1){ L.i++; L.picked = {}; L.checked = false; render(); } else lessonNext(); };
    };
  }
  else if (step === 2){
    body = `<div class="lesson"><div class="eyebrow">Trick 2 of 4</div><h2>Vowels have two sounds</h2>
      <p>Each vowel can say a <b>short</b> sound (˘) or its <b>own name</b> (¯). Tap to hear both.</p>
      <div class="vtable">${VOWELS.map(v => `<div class="vrow"><b>${v.v}</b><button class="btn ghost small vbtn" data-say="${v.short}"><span class="g gv short">${v.v}</span> as in <i>${v.short}</i></button><button class="btn ghost small vbtn" data-say="${v.long}"><span class="g gv long">${v.v}</span> as in <i>${v.long}</i></button></div>`).join("")}</div>
      <p>Here's the clue: if the chunk <b>ends with a consonant</b>, the vowel is usually short: <span class="demo">${markedSplit("rab|bit","short")}</span>. If the chunk <b>ends with the vowel</b>, it says its name: <span class="demo">${markedSplit("ti|ger","long")}</span>.</p>
      <p class="hint">But English cheats sometimes, so there's one more trick.</p>
      <div class="row"><button class="btn small" id="next">Next trick →</button></div></div>`;
    after = () => { document.querySelectorAll(".vbtn").forEach(b => b.onclick = () => speak(b.dataset.say)); document.getElementById("next").onclick = lessonNext; };
  }
  else if (step === 3){
    const f = L.flex[L.i];
    const a = PH.chunkTexts(f.w).join("|"), b = PH.chunkTexts(f.w, { flip: true }).join("|");
    const openSplit = f.ans === "open" ? (PH.analyze(f.w).alt && a.indexOf("|") < b.indexOf("|") ? b : a) : null;
    // derive the two splits: open = vowel ends the first chunk, closed = consonant ends it
    const splits = [a, b].sort((x, y) => x.indexOf("|") - y.indexOf("|"));
    const open = splits[0], closed = splits[1];
    const chosen = L.chose;
    body = `<div class="lesson"><div class="eyebrow">Trick 3 of 4 · word ${L.i+1} of ${L.flex.length}</div><h2>Try it both ways</h2>
      <p>Not sure which sound the vowel makes? <b>Say it both ways.</b> One of them will sound like a word you know.</p>
      <div class="bigword lessonword plain">${f.w}</div>
      <div class="cards">
        <div class="tcard${chosen ? (f.ans === "open" ? " right" : " notit") : ""}"><div class="bigword chunked small">${markedSplit(open, "long")}</div><button class="btn ghost small say" data-say="${f.open}">🔊 Say it</button>${chosen ? "" : `<button class="btn small choose" data-k="open">That's a word!</button>`}</div>
        <div class="tcard${chosen ? (f.ans === "closed" ? " right" : " notit") : ""}"><div class="bigword chunked small">${markedSplit(closed, "short")}</div><button class="btn ghost small say" data-say="${f.closed}">🔊 Say it</button>${chosen ? "" : `<button class="btn small choose" data-k="closed">That's a word!</button>`}</div>
      </div>
      ${chosen ? `<p class="lesson-msg">${chosen === f.ans ? "<b>Yes!</b>" : "<b>Not that one.</b>"} <i>${f.w}</i> is the ${f.ans === "open" ? "vowel-says-its-name" : "short-vowel"} one. If the first try isn't a real word, flip the vowel and try again.</p>
        <div class="row"><button class="btn ghost small" id="hearWord">🔊 ${f.w}</button><button class="btn small" id="next">${L.i < L.flex.length-1 ? "Next word →" : "Next trick →"}</button></div>` : `<p class="hint">Tap both speakers, then pick the one that's a real word.</p>`}
    </div>`;
    after = () => {
      document.querySelectorAll(".say").forEach(b => b.onclick = () => speak(b.dataset.say, .75));
      document.querySelectorAll(".choose").forEach(b => b.onclick = () => { L.chose = b.dataset.k; render(); });
      const hw = document.getElementById("hearWord"); if (hw) hw.onclick = () => speak(f.w);
      const nx = document.getElementById("next"); if (nx) nx.onclick = () => { if (L.i < L.flex.length-1){ L.i++; L.chose = null; render(); } else lessonNext(); };
    };
  }
  else if (step === 4){
    body = `<div class="lesson"><div class="eyebrow">Trick 4 of 4</div><h2>Heart words</h2>
      <p>A few words don't play fair. Sound out the fair parts, and learn the part with the <span style="color:var(--bad)">♥</span> by heart. Tap a word to hear it.</p>
      <div class="hearts">${HEART_DEMO.map(w => `<div class="bigword chunked small heartdemo" data-w="${w}">${PH.html(w)}</div>`).join("")}</div>
      <p><i>said</i>: the <b>s</b> and <b>d</b> are fair. The <b>ai</b> should say /ā/ like in <i>rain</i>, but here it says /e/. That's the bit to remember.</p>
      <div class="row"><button class="btn small" id="next">One more →</button></div></div>`;
    after = () => { document.querySelectorAll(".heartdemo").forEach(d => d.onclick = () => speak(d.dataset.w)); document.getElementById("next").onclick = lessonNext; };
  }
  else if (step === 5){
    const w = L.cover, parts = PH.analyze(w).chunks, n = parts.length, shown = Math.min(L.shown, n);
    const html = parts.map((c, k) => `<span class="c c${k%4+1}${k >= shown ? " mask" : ""}">${c.map(g => g.punct ? g.t : `<span class="g${g.v?" gv":""}${g.s?" gs":""}${g.h?" gh":""}">${g.t}</span>`).join("")}</span>`).join("");
    body = `<div class="lesson"><div class="eyebrow">Long words</div><h2>Cover the ending</h2>
      <p>Big words are just small chunks in a row. Read the first chunk, then uncover the next one and add it on.</p>
      <div class="bigword chunked lessonword" id="lessonword">${html}</div>
      <div class="row">${shown < n ? `<button class="btn small" id="uncover">Uncover the next chunk</button>` : `<button class="btn ghost small" id="hearWord">🔊 ${w}</button><button class="btn small" id="next">Finish →</button>`}</div>
      <p class="hint">Tap a chunk to hear just that piece.</p></div>`;
    after = () => {
      const lw = document.getElementById("lessonword"); lw.onclick = e => { const c = e.target.closest(".c"); if (c && !c.classList.contains("mask")) speak(c.textContent.replace(/[^A-Za-z]/g,""), .7); };
      const un = document.getElementById("uncover"); if (un) un.onclick = () => { L.shown++; render(); };
      const hw = document.getElementById("hearWord"); if (hw) hw.onclick = () => speak(w);
      const nx = document.getElementById("next"); if (nx) nx.onclick = () => { S.lessons = (S.lessons || 0) + 1; S.lastLesson = today(); S.lessonStep = 0; S.mode = "read"; save(); toast("Warmed up! Now go read."); render(); };
    };
  }
  view.innerHTML = `<div class="card">${bar}${body}<div class="row" style="justify-content:flex-start;margin-top:14px"><button class="btn ghost small" id="quit">← Back to the story</button></div></div>`;
  after();
  const n0 = document.getElementById("next"); if (step === 0 && n0) n0.onclick = lessonNext;
  document.getElementById("quit").onclick = () => { S.mode = "read"; save(); render(); };
}

/* ---------- GROWN-UPS ---------- */
const NORMS = { 2: { fall: 50, winter: 84, spring: 100 }, 3: { fall: 83, winter: 97, spring: 112 } };   // Hasbrouck & Tindal 2017, 50th percentile
function renderGrownups(){
  const b = S.best;
  const hist = S.history.length ? S.history.map(h => `<li><div class="meta">${fmtDate(h.date)} · ${h.words.length} words · ${h.passed ? "passed" + (h.attempts ? " with " + h.attempts + " miss" + (h.attempts>1?"es":"") : " first try") : "not finished"}</div><div class="chips">${h.words.map(w=>`<span class="chip${h.passed?" pass":""}">${esc(w)}</span>`).join("")}</div></li>`).join("") : "<li><div class='meta'>No saved lists yet.</div></li>";
  const cur = S.flagged.length ? S.flagged.map(f=>`<span class="chip">${esc(f.word)}</span>`).join("") : "<span class='meta'>empty</span>";
  const all = {}; S.history.forEach(h => h.words.forEach(w => { const k = w.toLowerCase(); all[k] = (all[k]||0)+1; })); S.flagged.forEach(f => { const k=f.word.toLowerCase(); all[k]=(all[k]||0)+1; });
  const repeat = Object.entries(all).filter(([,n])=>n>1).sort((a,b)=>b[1]-a[1]);
  const own = mastered(), learn = learning(), due = dueWords(), sticky = stickyWords();
  const flu = Object.entries(S.fluency).filter(([,r]) => r.length).map(([ch, rs]) => `<li><div class="meta">Chapter ${+ch+1} · ${STORY.chapters[+ch].title}</div><div class="meta">${rs.slice().reverse().map(r => `${r.wcpm} wpm, ${r.misses.length} miss${r.misses.length===1?"":"es"} (${fmtDate(r.date)})`).join(" · ")}</div></li>`).join("");
  view.innerHTML = `
    <div class="card gu">
      <h2>Grown-ups</h2>
      <p>How it works: a <b>tap</b> splits a word into chunks so she can try it; a second tap reads it aloud; nothing is spoken until she asks. A <b>press-and-hold</b> marks a tough word. At ${MAX} tough words her spot becomes her high score and she practises the list with hints, hears each word, then marks it herself. Missed words come back later in the same session instead of restarting the list. Words she passes get re-checked in short <b>quick checks</b> after 1, 3, 10 and 30 days; four checks in a row and she "owns" the word. The <b>warm-up lesson</b> (🔥) teaches the four tricks the hints use: find the vowels, vowels have two sounds, try it both ways, heart words. Run it before reading until the tricks are automatic.</p>
      <div class="stat">
        <div><b>${b ? (b.finished ? "Done!" : "Ch. " + (b.chapter+1)) : "—"}</b><span>High score${b ? " · " + b.pct + "% of story" : ""}</span></div>
        <div><b>${own.length}</b><span>Words owned</span></div>
        <div><b>${learn.length}</b><span>Being re-checked</span></div>
        <div><b>${S.history.filter(h=>h.passed).length}</b><span>Lists passed</span></div>
        <div><b>${S.lessons || 0}</b><span>Warm-ups done</span></div>
        <div><b>${sticky.length}</b><span>Sticky words</span></div>
      </div>

      <h3>Current list (${S.flagged.length}/${MAX})</h3>
      <div class="chips">${cur}</div>
      <div class="row" style="justify-content:flex-start;margin-top:10px">
        ${S.flagged.length ? `<button class="btn ghost small" id="reviewNow">Practise this list now</button><button class="btn ghost small" id="undoLast">Remove last word</button>` : ""}
        <button class="btn ghost small" id="warmNow" ${due.length ? "" : "disabled"}>Quick check now (${due.length} due)</button>
        <button class="btn ghost small" id="lessonNow">🔥 Warm-up lesson</button>
      </div>
      ${repeat.length ? `<h3>Words that keep coming back</h3><div class="chips">${repeat.map(([w,n])=>`<span class="chip">${esc(w)} ×${n}</span>`).join("")}</div>` : ""}
      ${own.length ? `<h3>Words she owns</h3><div class="chips">${own.map(x=>`<span class="chip pass">${esc(x.w)}</span>`).join("")}</div>` : ""}

      <h3>Sticky words (${sticky.length})</h3>
      <p>A word turns sticky when it lands on her list twice or she misses it twice in practice. Sticky words join every practice session until she clears them in ${RELEASE_STREAK} sessions in a row <i>and</i> reads past them ${RELEASE_SEEN} times in the story without tapping or holding them.</p>
      ${sticky.length ? `<ul class="list">${sticky.map(t => `<li class="stickyrow"><div><b>${esc(t.w)}</b><div class="meta">on ${t.flags} list${t.flags===1?"":"s"} · ${t.misses} miss${t.misses===1?"":"es"} · clean sessions ${t.streak}/${RELEASE_STREAK} · read past ${t.seen}/${RELEASE_SEEN}</div></div><button class="btn ghost small letgo" data-w="${esc(t.w)}">Let it go</button></li>`).join("")}</ul>` : `<p class="meta">None right now.</p>`}

      <h3>Fluency check (timed read)</h3>
      <p>Sit with her, start the timer, and tap each word she misses while she reads the chapter aloud. Stop at the end. Re-read the same chapter up to three times over a few days, then move on; progress on a <i>new</i> chapter is the real test. Typical scores for a child who is on track: grade 2 about ${NORMS[2].fall} words per minute in the fall and ${NORMS[2].spring} by spring; grade 3 about ${NORMS[3].fall} to ${NORMS[3].spring}.</p>
      <div class="row" style="justify-content:flex-start">
        <select id="timedCh" class="sel">${STORY.chapters.map((c,i)=>`<option value="${i}" ${i===S.chapter?"selected":""}>Chapter ${i+1}: ${esc(c.title)}</option>`).join("")}</select>
        <button class="btn small" id="startTimed">⏱ Start timed read</button>
      </div>
      ${flu ? `<ul class="list" style="margin-top:10px">${flu}</ul>` : ""}

      <h3>How to help when she's stuck</h3>
      <p>She has a great memory, and right now she is using it to remember what words <i>look like</i>. That works for a few hundred words and then stalls, because the words get longer and there are too many that look alike (<i>house / horse</i>). The fix is not to memorise harder. It is to look at every letter and sound the word through; every word she decodes correctly gets filed away by that same great memory, permanently. So when she guesses:</p>
      <ol>
        <li><b>"What's the first sound?"</b> Not "what would make sense?" and not "look at the picture".</li>
        <li><b>"Check the vowel. What is it doing?"</b> A vowel can say two sounds. Try the other one.</li>
        <li><b>"Cover the ending and read the first part."</b> Then add the next chunk.</li>
        <li><b>"Yes, it could be that. What else could it be?"</b> One flex of the vowel, then…</li>
        <li><b>Tell her the word after about 3 seconds.</b> She repeats it while looking at it, then reads the sentence again. Long silences teach nothing.</li>
      </ol>
      <p>Praise the strategy, not the child: "You looked at every letter" beats "you're so smart". No prizes for reading; the count of words she owns is the reward. Two quick checks you can do at home: can she read made-up words like <i>blim</i> or <i>trange</i>? Does she substitute look-alike words (<i>was/saw</i>, <i>then/when</i>)? If both are shaky, the word list and warm-ups here are exactly the right practice, and it is worth asking her teacher for a phonics check.</p>

      <h3>Settings</h3>
      <label class="opt"><input type="checkbox" id="optDelay" ${S.opts.delay ? "checked" : ""}> Only read a tapped word aloud when she taps it a second time (so she tries it first)</label>
      <label class="opt"><input type="checkbox" id="optKnown" ${S.opts.known ? "checked" : ""}> Mix words she already knows into the practice list (keeps success high)</label>

      <h3>Saved word lists</h3>
      <ul class="list">${hist}</ul>
      <h3>Copy everything</h3>
      <p>Select the text below to copy the lists into a note or email.</p>
      <textarea id="export" readonly></textarea>
      <div class="row" style="justify-content:flex-start;margin-top:14px">
        <button class="btn small" id="back">← Back to the story</button>
        <button class="btn ghost small" id="restart">Restart story (keep lists)</button>
        <button class="btn ghost small" id="wipe">Erase everything</button>
      </div>
    </div>`;
  const lines = [`${STORY.title} — word lists`, b ? `High score: ${b.finished ? "finished" : "chapter " + (b.chapter+1) + " (" + b.pct + "%)"}` : "",
    S.flagged.length ? `Current list: ${S.flagged.map(f=>f.word).join(", ")}` : "",
    own.length ? `Owned: ${own.map(x=>x.w).join(", ")}` : "", learn.length ? `Being re-checked: ${learn.map(x=>x.w).join(", ")}` : "",
    sticky.length ? `Sticky: ${sticky.map(t=>`${t.w} (${t.flags} lists, ${t.misses} misses)`).join(", ")}` : "",
    ...S.history.map(h => `${h.date.slice(0,10)} (${h.passed?"passed":"open"}): ${h.words.join(", ")}`),
    ...Object.entries(S.fluency).flatMap(([ch, rs]) => rs.map(r => `Timed read ch.${+ch+1} ${r.date.slice(0,10)}: ${r.wcpm} wcpm, misses: ${r.misses.join(", ") || "none"}`))].filter(Boolean);
  document.getElementById("export").value = lines.join("\n");
  document.getElementById("back").onclick = () => { S.mode = "read"; save(); render(); };
  document.getElementById("restart").onclick = () => { if (confirm("Go back to chapter 1 and clear the current list?")){ archive(false); S.mode = "read"; save(); render(); } };
  document.getElementById("wipe").onclick = () => { if (confirm("Erase the high score, ALL saved word lists, and progress?")){ S = FRESH(); save(); render(); } };
  const rn = document.getElementById("reviewNow"); if (rn) rn.onclick = () => { const last = S.flagged[S.flagged.length-1]; if (last.id >= 0) setHighScore(last.id, false); startReview("list"); };
  const ul = document.getElementById("undoLast"); if (ul) ul.onclick = () => { const f = S.flagged.pop(); if (f) delete S.flaggedIds[f.id]; save(); render(); };
  document.getElementById("warmNow").onclick = startWarmup;
  document.querySelectorAll(".letgo").forEach(b => b.onclick = () => { const t = S.tough[bankKey(b.dataset.w)]; if (t){ t.sticky = false; t.flags = 0; t.misses = 0; t.streak = 0; t.seen = 0; } save(); render(); });
  document.getElementById("lessonNow").onclick = startLesson;
  document.getElementById("startTimed").onclick = () => startTimed(+document.getElementById("timedCh").value);
  document.getElementById("optDelay").onchange = e => { S.opts.delay = e.target.checked; save(); };
  document.getElementById("optKnown").onchange = e => { S.opts.known = e.target.checked; save(); };
}
document.getElementById("lessonBtn").onclick = () => { if (S.mode === "lesson"){ S.mode = "read"; save(); render(); } else startLesson(); };
document.getElementById("guBtn").onclick = () => { if (S.mode === "grownups"){ S.mode = (S._before && S._before !== "grownups") ? S._before : "read"; } else { S._before = S.mode; S.mode = "grownups"; } save(); render(); };

render();
