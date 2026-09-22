const STORY = window.STORY;
const PH = window.PH;

/* ---------- STATE ---------- */
const MAX = 20;
const KEY = "dragonReader.v2";
const DAY = 864e5;
const GAPS = [1, 3, 10, 30, 90];              // days between spaced checks, per stage (stage 4+ = mastered)
const AUDIO_DELAY = 2500;                     // ms: she tries the word first, then hears it

const FRESH = () => ({
  chapter: 0, flagged: [], flaggedIds: {},   // flagged: [{id, word}]
  best: null,                                 // {id, chapter, pct, date, finished}
  history: [], mode: "read",                  // read | review | done | grownups
  reviewIdx: 0, attempts: 0,
  queue: null, qi: 0, qkind: "list",          // current practice queue: [{w, k: new|known|warm}]
  bank: {},                                   // word → {w, stage, due, seen}  (spaced re-checks)
  fluency: {},                                // chapter → [{date, secs, words, misses, wcpm}]
  timed: null, lastTimed: null,               // timed read in progress / just finished
  lastWarm: 0, opts: { delay: true, known: true }
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
function learning(){ return Object.values(S.bank).filter(b => b.stage >= 1 && b.stage < 4); }

/* ---------- RENDER ---------- */
const view = document.getElementById("view"), scroll = document.getElementById("scroll");
function updateTop(){
  const pill = document.getElementById("pill"), pt = document.getElementById("pillText");
  if (S.mode === "review"){ const done = S.qi, total = S.queue ? S.queue.length : 0; pt.textContent = `${done} / ${total}`; pill.style.background = "var(--good)"; pill.style.color = "#fff"; }
  else { pt.textContent = `${S.flagged.length} / ${MAX}`; pill.style.background = ""; pill.style.color = ""; }
  const pct = S.mode === "read" ? (WORDS.filter(w=>w.ch<S.chapter).length / TOTAL) * 100 : 100;
  document.getElementById("barFill").style.width = pct + "%";
  document.getElementById("topTitle").textContent = S.mode==="read" ? STORY.title : S.mode==="review" ? (S.qkind === "warm" ? "Warm-up" : "Word List") : "Dragon Rider Reader";
}
function render(){
  clearInterval(timerTick); clearTimeout(speakTimer);
  updateTop();
  if (S.mode === "read") renderRead();
  else if (S.mode === "review") renderReview();
  else if (S.mode === "done") renderDone();
  else if (S.mode === "grownups") renderGrownups();
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
      <div class="warmrow"><span class="flame">🔥</span><div><b>Warm-up first?</b><br><span class="hint" style="margin:0">${due.length} word${due.length>1?"s":""} from before. Still got ${due.length>1?"them":"it"}?</span></div></div>
      <div class="row" style="justify-content:flex-start"><button class="btn small" id="warmGo">Let's check</button><button class="btn ghost small" id="warmSkip">Later</button></div>
    </div>` : "";
  const lt = S.lastTimed && S.lastTimed.ch === ci ? renderTimedResult(S.lastTimed) : "";
  const strip = timed ? `<div class="strip"><span>⏱ <b id="clock">0:00</b> · reading with a grown-up · tap a word she misses</span><button class="btn small" id="stopTimed">Stop</button></div>` : "";
  view.innerHTML = `${warm}${lt}
    <div class="card chapter">
      ${strip}
      <div class="eyebrow">Chapter ${ci+1} of ${STORY.chapters.length}</div>
      <h2>${esc(ch.title)}</h2>
      <div class="text${timed ? " timing" : ""}" id="text">${html}</div>
      <div class="nav">
        <button class="btn ghost" id="prev" ${ci===0?"disabled":""}>← Back</button>
        ${ci < STORY.chapters.length-1 ? `<button class="btn" id="next">Next chapter →</button>` : `<button class="btn big" id="finish">🎉 I finished!</button>`}
      </div>
      <p class="hint">${timed ? "<b>Timed read.</b> Tap any word she gets wrong. Tap Stop when she reaches the end." : `<b>Tap</b> a word to break it into pieces. Try to read it, then tap again to hear it. <b>Press and hold</b> a tricky word to add it to your list. ${bestLine}`}</p>
    </div>`;
  const p = document.getElementById("prev"), n = document.getElementById("next"), f = document.getElementById("finish");
  if (p) p.onclick = () => { S.chapter--; save(); render(); };
  if (n) n.onclick = () => { S.chapter++; save(); render(); };
  if (f) f.onclick = finishStory;
  const wg = document.getElementById("warmGo"); if (wg) wg.onclick = () => startWarmup();
  const ws = document.getElementById("warmSkip"); if (ws) ws.onclick = () => { S.lastWarm = today(); save(); render(); };
  const st = document.getElementById("stopTimed"); if (st) st.onclick = stopTimed;
  const dm = document.getElementById("dismissTimed"); if (dm) dm.onclick = () => { S.lastTimed = null; save(); render(); };
  const am = document.getElementById("addMisses"); if (am) am.onclick = () => { addMissesToList(S.lastTimed); S.lastTimed = null; save(); render(); };
  if (timed){ const clock = document.getElementById("clock"); const tick = () => { const s = Math.floor((Date.now() - timed.start)/1000); clock.textContent = `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`; }; tick(); timerTick = setInterval(tick, 1000); }
  bindWords(!!timed);
}

let pressTimer = null, pressed = null, longFired = false, speakTimer = null;
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
function unchunkAll(){ document.querySelectorAll(".w.chunked").forEach(o => { o.classList.remove("chunked","spoken"); o.textContent = WORDS[+o.dataset.id].text; }); clearTimeout(speakTimer); }
/* Tap 1: split into chunks (she tries it). Tap 2 (or ~2.5 s): hear it. Tap 3: close. */
function chunkWord(el){
  const w = WORDS[+el.dataset.id], word = clean(w.text);
  if (el.classList.contains("chunked")){
    if (el.classList.contains("spoken") || !S.opts.delay){ el.classList.remove("chunked","spoken"); el.textContent = w.text; clearTimeout(speakTimer); return; }
    clearTimeout(speakTimer); el.classList.add("spoken"); speak(word); return;
  }
  unchunkAll();
  el.classList.add("chunked"); el.innerHTML = chunkHTML(w.text);
  if (S.opts.delay){ speakTimer = setTimeout(() => { if (el.classList.contains("chunked")){ el.classList.add("spoken"); speak(word); } }, AUDIO_DELAY); }
  else { el.classList.add("spoken"); speak(word); }
}
function flagWord(el){
  const w = WORDS[+el.dataset.id], word = clean(w.text);
  if (!word || S.flaggedIds[w.id]) return;
  if (S.flagged.some(f => f.word.toLowerCase() === word.toLowerCase())){ S.flaggedIds[w.id] = 1; el.classList.add("flag"); save(); toast("Already on your list"); return; }
  S.flaggedIds[w.id] = 1; S.flagged.push({ id: w.id, word });
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
  const q = []; let ki = 0;
  news.forEach((n, i) => { q.push(n); if (ki < known.length && i % 2 === 1) q.push(known[ki++]); });
  while (ki < known.length) q.push(known[ki++]);
  return q;
}
function startReview(kind){
  S.qkind = kind; S.queue = kind === "warm" ? dueWords().slice(0, 8).map(b => ({ w: b.w, k: "warm" })) : buildQueue();
  S.qi = 0; S.attempts = 0; S.mode = "review"; save(); render();
}
function startWarmup(){ if (!dueWords().length){ toast("Nothing to warm up today"); return; } startReview("warm"); }

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
  const kindLine = item.k === "known" ? "One you already know." : item.k === "warm" ? "From a while ago. Still got it?" : "";
  const hint = HINTS[H.step];
  let word;
  if (H.step === 0) word = esc(item.w);
  else if (H.step === 1){ const h = PH.html(item.w); word = h.replace('<span class="g', '<span class="g hl'); }
  else if (H.step === 2) word = PH.html(item.w);
  else if (H.step === 3){ const parts = PH.analyze(item.w).chunks; word = parts.map((c, k) => `<span class="c c${k%4+1}${k ? " mask" : ""}">${c.map(g => g.punct ? g.t : `<span class="g${g.v?" gv":""}${g.s?" gs":""}${g.h?" gh":""}">${g.t}</span>`).join("")}</span>`).join(""); }
  else word = PH.html(item.w, { flip: alt && H.flip });
  const caption = H.heard
    ? (heart ? `<b>Heart word.</b> The part with the ♥ doesn't play fair. Learn that bit by heart; the rest you can sound out.` : `Say it once more while you look at <b>every letter</b>.`)
    : hint ? `<b>${hint.q}</b> ${hint.how}` : `Read it out loud. Then tap <b>Hear it</b> to check.`;
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
      ${H.heard ? `<div class="row">
        <button class="btn bad big" id="wrong">✗ Not yet</button>
        <button class="btn good big" id="right">✓ Got it</button>
      </div>` : ""}
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
    S.attempts++;
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
  if (S.qkind === "warm"){ S.lastWarm = today(); S.queue = null; S.mode = "read"; save(); toast("Warm-up done. Nice work!"); render(); return; }
  S.flagged.forEach(f => bankAdd(f.word, 1));
  archive(true); S.queue = null; S.mode = "done"; save(); render();
}
function archive(passed){
  if (S.flagged.length) S.history.unshift({ date: new Date().toISOString(), words: S.flagged.map(f=>f.word), passed, attempts: S.attempts, chapter: S.best ? S.best.chapter : S.chapter });
  S.history = S.history.slice(0, 50);
  S.flagged = []; S.flaggedIds = {}; S.reviewIdx = 0; S.attempts = 0; S.chapter = 0; S.queue = null;
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

/* ---------- GROWN-UPS ---------- */
const NORMS = { 2: { fall: 50, winter: 84, spring: 100 }, 3: { fall: 83, winter: 97, spring: 112 } };   // Hasbrouck & Tindal 2017, 50th percentile
function renderGrownups(){
  const b = S.best;
  const hist = S.history.length ? S.history.map(h => `<li><div class="meta">${fmtDate(h.date)} · ${h.words.length} words · ${h.passed ? "passed" + (h.attempts ? " with " + h.attempts + " miss" + (h.attempts>1?"es":"") : " first try") : "not finished"}</div><div class="chips">${h.words.map(w=>`<span class="chip${h.passed?" pass":""}">${esc(w)}</span>`).join("")}</div></li>`).join("") : "<li><div class='meta'>No saved lists yet.</div></li>";
  const cur = S.flagged.length ? S.flagged.map(f=>`<span class="chip">${esc(f.word)}</span>`).join("") : "<span class='meta'>empty</span>";
  const all = {}; S.history.forEach(h => h.words.forEach(w => { const k = w.toLowerCase(); all[k] = (all[k]||0)+1; })); S.flagged.forEach(f => { const k=f.word.toLowerCase(); all[k]=(all[k]||0)+1; });
  const repeat = Object.entries(all).filter(([,n])=>n>1).sort((a,b)=>b[1]-a[1]);
  const own = mastered(), learn = learning(), due = dueWords();
  const flu = Object.entries(S.fluency).filter(([,r]) => r.length).map(([ch, rs]) => `<li><div class="meta">Chapter ${+ch+1} · ${STORY.chapters[+ch].title}</div><div class="meta">${rs.slice().reverse().map(r => `${r.wcpm} wpm, ${r.misses.length} miss${r.misses.length===1?"":"es"} (${fmtDate(r.date)})`).join(" · ")}</div></li>`).join("");
  view.innerHTML = `
    <div class="card gu">
      <h2>Grown-ups</h2>
      <p>How it works: a <b>tap</b> splits a word into chunks so she can try it; a second tap (or a couple of seconds) reads it aloud. A <b>press-and-hold</b> marks a tough word. At ${MAX} tough words her spot becomes her high score and she practises the list with hints, hears each word, then marks it herself. Missed words come back later in the same session instead of restarting the list. Words she passes get re-checked in short <b>warm-ups</b> after 1, 3, 10 and 30 days; four checks in a row and she "owns" the word.</p>
      <div class="stat">
        <div><b>${b ? (b.finished ? "Done!" : "Ch. " + (b.chapter+1)) : "—"}</b><span>High score${b ? " · " + b.pct + "% of story" : ""}</span></div>
        <div><b>${own.length}</b><span>Words owned</span></div>
        <div><b>${learn.length}</b><span>Being re-checked</span></div>
        <div><b>${S.history.filter(h=>h.passed).length}</b><span>Lists passed</span></div>
      </div>

      <h3>Current list (${S.flagged.length}/${MAX})</h3>
      <div class="chips">${cur}</div>
      <div class="row" style="justify-content:flex-start;margin-top:10px">
        ${S.flagged.length ? `<button class="btn ghost small" id="reviewNow">Practise this list now</button><button class="btn ghost small" id="undoLast">Remove last word</button>` : ""}
        <button class="btn ghost small" id="warmNow" ${due.length ? "" : "disabled"}>Warm-up now (${due.length} due)</button>
      </div>
      ${repeat.length ? `<h3>Words that keep coming back</h3><div class="chips">${repeat.map(([w,n])=>`<span class="chip">${esc(w)} ×${n}</span>`).join("")}</div>` : ""}
      ${own.length ? `<h3>Words she owns</h3><div class="chips">${own.map(x=>`<span class="chip pass">${esc(x.w)}</span>`).join("")}</div>` : ""}

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
      <label class="opt"><input type="checkbox" id="optDelay" ${S.opts.delay ? "checked" : ""}> Wait a couple of seconds before reading a tapped word aloud (so she tries it first)</label>
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
    ...S.history.map(h => `${h.date.slice(0,10)} (${h.passed?"passed":"open"}): ${h.words.join(", ")}`),
    ...Object.entries(S.fluency).flatMap(([ch, rs]) => rs.map(r => `Timed read ch.${+ch+1} ${r.date.slice(0,10)}: ${r.wcpm} wcpm, misses: ${r.misses.join(", ") || "none"}`))].filter(Boolean);
  document.getElementById("export").value = lines.join("\n");
  document.getElementById("back").onclick = () => { S.mode = "read"; save(); render(); };
  document.getElementById("restart").onclick = () => { if (confirm("Go back to chapter 1 and clear the current list?")){ archive(false); S.mode = "read"; save(); render(); } };
  document.getElementById("wipe").onclick = () => { if (confirm("Erase the high score, ALL saved word lists, and progress?")){ S = FRESH(); save(); render(); } };
  const rn = document.getElementById("reviewNow"); if (rn) rn.onclick = () => { const last = S.flagged[S.flagged.length-1]; if (last.id >= 0) setHighScore(last.id, false); startReview("list"); };
  const ul = document.getElementById("undoLast"); if (ul) ul.onclick = () => { const f = S.flagged.pop(); if (f) delete S.flaggedIds[f.id]; save(); render(); };
  document.getElementById("warmNow").onclick = startWarmup;
  document.getElementById("startTimed").onclick = () => startTimed(+document.getElementById("timedCh").value);
  document.getElementById("optDelay").onchange = e => { S.opts.delay = e.target.checked; save(); };
  document.getElementById("optKnown").onchange = e => { S.opts.known = e.target.checked; save(); };
}
document.getElementById("guBtn").onclick = () => { if (S.mode === "grownups"){ S.mode = (S._before && S._before !== "grownups") ? S._before : "read"; } else { S._before = S.mode; S.mode = "grownups"; } save(); render(); };

render();
