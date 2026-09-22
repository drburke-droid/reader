const STORY = window.STORY;

/* ---------- WORD CHUNKING (simple syllable heuristic) ---------- */
const VOW = "aeiouy";
function chunk(word){
  const w = word.toLowerCase().replace(/[^a-z']/g,"");
  if (w.length <= 3) return [word];
  const isV = ch => VOW.includes(ch);
  let parts = [], cur = "", i = 0;
  const letters = word.replace(/[^A-Za-z']/g,"");
  const L = letters.toLowerCase();
  // find split points
  const splits = [];
  for (i = 0; i < L.length - 1; i++){
    const a = L[i], b = L[i+1], c = L[i+2] || "", d = L[i+3] || "";
    if (isV(a) && !isV(b)){
      // vowel then consonant cluster
      if (!isV(c) && c){
        // vowel + consonant cluster: keep digraphs together (th, sh, ght, ck...)
        const cl = L.slice(i+1).match(/^[^aeiouy]+/)[0];
        let cut = 1;
        if (/^(ght|tch|dge)/.test(cl)) cut = 3;
        else if (/^(th|sh|ch|ph|wh|gh|qu)$/.test(cl)) cut = 0;                 // V|CCV for a lone digraph
        else if (/^(th|sh|ch|ph|wh|ck|ng|nk|gh|qu|([a-z])\2)/.test(cl) && cl.length > 2) cut = 2;
        if (cut === 0){ splits.push(i+1); i += 1; }
        else if (cut < cl.length || cut > 1){ splits.push(i+1+cut); i += cut; }
      } else if (isV(c)){
        // V|CV  — keep short common endings together
        const rest = L.slice(i+1);
        if (!/^[^aeiouy]e$/.test(rest) && !/^[^aeiouy]es$/.test(rest) && !/^[^aeiouy]ed$/.test(rest)) splits.push(i+1);
      }
    }
  }
  // consonant-le ending: e.g. ta-ble
  if (/[^aeiouy]le$/.test(L) && L.length > 4){
    const p = L.length - 3; if (!splits.includes(p)) splits.push(p);
  }
  const uniq = [...new Set(splits)].filter(p => p > 0 && p < L.length).sort((a,b)=>a-b);
  // avoid 1-letter chunks: merge
  let last = 0; const out = [];
  for (const p of uniq){ if (p - last >= 2 && L.length - p >= 2){ out.push(letters.slice(last,p)); last = p; } }
  out.push(letters.slice(last));
  // a chunk with no vowel sound can't stand alone — glue it to its neighbour
  const merged = [];
  for (const c of out){ if (merged.length && !/[aeiouy]/i.test(c)) merged[merged.length-1] += c; else merged.push(c); }
  if (merged.length > 1 && !/[aeiouy]/i.test(merged[0])){ merged[1] = merged[0] + merged[1]; merged.shift(); }
  return merged;
}

/* ---------- STATE ---------- */
const MAX = 20;
const KEY = "dragonReader.v2";

let S = {
  chapter: 0, flagged: [], flaggedIds: {},   // flagged: [{id, word}]
  best: null,                                 // {id, chapter, pct, date, finished}
  history: [], mode: "read",                  // read | review | done
  reviewIdx: 0, attempts: 0
};
function load(){ try{ const raw = localStorage.getItem(KEY); if (raw) S = Object.assign(S, JSON.parse(raw)); }catch(e){} }
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }
load();

/* word index across the whole story */
const WORDS = []; // {id, ch, text}
STORY.chapters.forEach((c, ci) => c.text.split(/\s+/).forEach(t => { if (t) WORDS.push({ id: WORDS.length, ch: ci, text: t }); }));
const TOTAL = WORDS.length;

function clean(t){ return t.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g,""); }
const toastEl = document.getElementById("toast"); let toastT;
function toast(msg){ toastEl.textContent = msg; toastEl.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(()=>toastEl.classList.remove("on"), 1800); }
function speak(t){ try{ if (!window.speechSynthesis) return; speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.rate = .8; speechSynthesis.speak(u); }catch(e){} }

/* ---------- RENDER ---------- */
const view = document.getElementById("view"), scroll = document.getElementById("scroll");
function updateTop(){
  document.getElementById("pillText").textContent = S.mode === "review" ? `${S.reviewIdx} / ${MAX} right` : `${S.flagged.length} / ${MAX}`;
  const pill = document.getElementById("pill");
  pill.style.background = S.mode==="review" ? "var(--good)" : ""; pill.style.color = S.mode==="review" ? "#fff" : "";
  const pct = S.mode === "read" ? (WORDS.filter(w=>w.ch<S.chapter).length / TOTAL) * 100 : 100;
  document.getElementById("barFill").style.width = pct + "%";
  document.getElementById("topTitle").textContent = S.mode==="read" ? STORY.title : S.mode==="review" ? "Word List" : "Dragon Rider Reader";
}
function render(){
  updateTop();
  if (S.mode === "read") renderRead();
  else if (S.mode === "review") renderReview();
  else if (S.mode === "done") renderDone();
  else if (S.mode === "grownups") renderGrownups();
  scroll.scrollTop = 0;
}

function renderRead(){
  const ci = S.chapter, ch = STORY.chapters[ci];
  const paras = ch.text.split(/\n\n+/);
  let id = WORDS.findIndex(w => w.ch === ci);
  const html = paras.map(p => "<p>" + p.split(/\s+/).map(t => {
    const w = WORDS[id++];
    const fl = S.flaggedIds[w.id] ? " flag" : "";
    return `<span class="w${fl}" data-id="${w.id}" tabindex="0">${t}</span>`;
  }).join(" ") + "</p>").join("");
  const bestLine = S.best ? `Best so far: <b>${S.best.finished ? "finished the whole story!" : "Chapter " + (S.best.chapter+1) + " (" + S.best.pct + "% of the story)"}</b>` : "No high score yet. Read as far as you can!";
  view.innerHTML = `
    <div class="card chapter">
      <div class="eyebrow">Chapter ${ci+1} of ${STORY.chapters.length}</div>
      <h2>${ch.title}</h2>
      <div class="text" id="text">${html}</div>
      <div class="nav">
        <button class="btn ghost" id="prev" ${ci===0?"disabled":""}>← Back</button>
        ${ci < STORY.chapters.length-1 ? `<button class="btn" id="next">Next chapter →</button>` : `<button class="btn big" id="finish">🎉 I finished!</button>`}
      </div>
      <p class="hint"><b>Tap</b> a word to break it into pieces. <b>Press and hold</b> a tricky word to add it to your list. ${bestLine}</p>
    </div>`;
  const p = document.getElementById("prev"), n = document.getElementById("next"), f = document.getElementById("finish");
  if (p) p.onclick = () => { S.chapter--; save(); render(); };
  if (n) n.onclick = () => { S.chapter++; save(); render(); };
  if (f) f.onclick = finishStory;
  bindWords();
}

let pressTimer = null, pressed = null, longFired = false;
function bindWords(){
  const text = document.getElementById("text");
  text.addEventListener("contextmenu", e => e.preventDefault());
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
function chunkHTML(t){
  const m = t.match(/^([^A-Za-z']*)([A-Za-z'-]+)(.*)$/); if (!m) return t;
  const pieces = m[2].split("-").flatMap(chunk);
  return m[1] + pieces.map((c,i)=>`<span class="c c${i%4+1}">${c}</span>`).join("") + m[3];
}
function chunkWord(el){
  const w = WORDS[+el.dataset.id];
  if (el.classList.contains("chunked")){ el.classList.remove("chunked"); el.textContent = w.text; return; }
  document.querySelectorAll(".w.chunked").forEach(o => { o.classList.remove("chunked"); o.textContent = WORDS[+o.dataset.id].text; });
  el.classList.add("chunked"); el.innerHTML = chunkHTML(w.text);
  speak(clean(w.text));
}
function flagWord(el){
  const w = WORDS[+el.dataset.id], word = clean(w.text);
  if (!word || S.flaggedIds[w.id]) return;
  if (S.flagged.some(f => f.word.toLowerCase() === word.toLowerCase())){ S.flaggedIds[w.id] = 1; el.classList.add("flag"); save(); toast("Already on your list"); return; }
  S.flaggedIds[w.id] = 1; S.flagged.push({ id: w.id, word });
  el.classList.add("flag"); el.classList.remove("chunked"); el.textContent = w.text;
  try{ navigator.vibrate && navigator.vibrate(40); }catch(e){}
  save(); updateTop();
  if (S.flagged.length >= MAX){ setHighScore(w.id, false); S.mode = "review"; S.reviewIdx = 0; S.attempts = 0; save(); toast("20 words! Time to practise"); setTimeout(render, 600); }
  else toast(`Added "${word}"  (${S.flagged.length} of ${MAX})`);
}
function setHighScore(id, finished){
  const pct = Math.round((id+1) / TOTAL * 100), chapter = WORDS[id].ch;
  const better = !S.best || finished || (!S.best.finished && id > S.best.id);
  if (better) S.best = { id, chapter, pct, date: new Date().toISOString(), finished };
}
function finishStory(){
  setHighScore(TOTAL-1, true);
  if (S.flagged.length){ S.mode = "review"; S.reviewIdx = 0; S.attempts = 0; save(); render(); }
  else { archive(true); S.mode = "done"; save(); render(); }
}

/* ---------- REVIEW ---------- */
function renderReview(){
  const list = S.flagged, i = S.reviewIdx, item = list[i];
  const dots = list.map((_,k)=>`<i class="${k<i?"done":k===i?"now":""}"></i>`).join("");
  view.innerHTML = `
    <div class="card review">
      <div class="dots">${dots}</div>
      <p class="hint" style="margin:0">Word ${i+1} of ${list.length}. Read it out loud!${S.attempts ? ` <b>Try ${S.attempts+1}.</b>` : ""}</p>
      <div class="bigword pop" id="bigword" tabindex="0">${item.word}</div>
      <div class="row">
        <button class="btn ghost small" id="hear">🔊 Hear it</button>
        <button class="btn ghost small" id="split">Break it up</button>
      </div>
      <div class="row">
        <button class="btn bad big" id="wrong">✗ Missed it</button>
        <button class="btn good big" id="right">✓ Got it</button>
      </div>
      <p class="hint">Get all ${list.length} in a row to go back to the story. One miss sends you back to the top of the list.</p>
    </div>`;
  const bw = document.getElementById("bigword");
  const split = () => { bw.classList.toggle("chunked"); bw.innerHTML = bw.classList.contains("chunked") ? chunkHTML(item.word) : item.word; };
  bw.onclick = split; document.getElementById("split").onclick = split;
  document.getElementById("hear").onclick = () => speak(item.word);
  document.getElementById("right").onclick = () => {
    S.reviewIdx++;
    if (S.reviewIdx >= list.length){ archive(true); S.mode = "done"; save(); render(); }
    else { save(); render(); }
  };
  document.getElementById("wrong").onclick = () => {
    bw.classList.add("shake"); S.attempts++; S.reviewIdx = 0; save();
    toast("Back to the top — you can do it!"); setTimeout(render, 500);
  };
}
function archive(passed){
  if (S.flagged.length) S.history.unshift({ date: new Date().toISOString(), words: S.flagged.map(f=>f.word), passed, attempts: S.attempts, chapter: S.best ? S.best.chapter : S.chapter });
  S.history = S.history.slice(0, 50);
  S.flagged = []; S.flaggedIds = {}; S.reviewIdx = 0; S.attempts = 0; S.chapter = 0;
}
function renderDone(){
  const b = S.best;
  view.innerHTML = `
    <div class="card celebrate">
      <div class="dragon pop">🐉</div>
      <h2 style="font-size:2rem;color:var(--ember)">You did it!</h2>
      <p>${b && b.finished ? "You finished the whole story <b>and</b> beat your word list!" : `All ${MAX} words in a row. Your high score is <b>Chapter ${b.chapter+1}</b>.`}</p>
      <p class="hint">The story starts again from the beginning. Can you read even further this time?</p>
      <button class="btn big" id="again">Read again →</button>
    </div>`;
  document.getElementById("again").onclick = () => { S.mode = "read"; S.chapter = 0; save(); render(); };
}

/* ---------- GROWN-UPS ---------- */
function renderGrownups(){
  const b = S.best;
  const hist = S.history.length ? S.history.map(h => `<li><div class="meta">${new Date(h.date).toLocaleDateString(undefined,{dateStyle:"medium"})} · ${h.words.length} words · ${h.passed ? "passed" + (h.attempts ? " after " + (h.attempts+1) + " tries" : " first try") : "not finished"}</div><div class="chips">${h.words.map(w=>`<span class="chip${h.passed?" pass":""}">${w}</span>`).join("")}</div></li>`).join("") : "<li><div class='meta'>No saved lists yet.</div></li>";
  const cur = S.flagged.length ? S.flagged.map(f=>`<span class="chip">${f.word}</span>`).join("") : "<span class='meta'>empty</span>";
  const all = {}; S.history.forEach(h => h.words.forEach(w => { const k = w.toLowerCase(); all[k] = (all[k]||0)+1; })); S.flagged.forEach(f => { const k=f.word.toLowerCase(); all[k]=(all[k]||0)+1; });
  const repeat = Object.entries(all).filter(([,n])=>n>1).sort((a,b)=>b[1]-a[1]);
  view.innerHTML = `
    <div class="card gu">
      <h2>Grown-ups</h2>
      <p>How it works: a <b>tap</b> splits a word into coloured chunks and reads it aloud. A <b>press-and-hold</b> marks it as a tough word. At ${MAX} tough words her spot in the story becomes her high score and she practises the list: ${MAX} in a row, any miss restarts the list. Passing sends her back to chapter 1 to beat the score.</p>
      <div class="stat">
        <div><b>${b ? (b.finished ? "Done!" : "Ch. " + (b.chapter+1)) : "—"}</b><span>High score${b ? " · " + b.pct + "% of story" : ""}</span></div>
        <div><b>${S.history.length}</b><span>Word lists saved</span></div>
        <div><b>${S.history.filter(h=>h.passed).length}</b><span>Lists passed</span></div>
      </div>
      <h3>Current list (${S.flagged.length}/${MAX})</h3>
      <div class="chips">${cur}</div>
      ${S.flagged.length ? `<div class="row" style="justify-content:flex-start;margin-top:10px"><button class="btn ghost small" id="reviewNow">Practise this list now</button><button class="btn ghost small" id="undoLast">Remove last word</button></div>` : ""}
      ${repeat.length ? `<h3>Words that keep coming back</h3><div class="chips">${repeat.map(([w,n])=>`<span class="chip">${w} ×${n}</span>`).join("")}</div>` : ""}
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
  const lines = [`${STORY.title} — word lists`, b ? `High score: ${b.finished ? "finished" : "chapter " + (b.chapter+1) + " (" + b.pct + "%)"}` : "", S.flagged.length ? `Current list: ${S.flagged.map(f=>f.word).join(", ")}` : "", ...S.history.map(h => `${h.date.slice(0,10)} (${h.passed?"passed":"open"}): ${h.words.join(", ")}`)].filter(Boolean);
  document.getElementById("export").value = lines.join("\n");
  document.getElementById("back").onclick = () => { S.mode = "read"; save(); render(); };
  document.getElementById("restart").onclick = () => { if (confirm("Go back to chapter 1 and clear the current list?")){ archive(false); S.mode = "read"; save(); render(); } };
  document.getElementById("wipe").onclick = () => { if (confirm("Erase the high score and ALL saved word lists?")){ S = { chapter:0, flagged:[], flaggedIds:{}, best:null, history:[], mode:"read", reviewIdx:0, attempts:0 }; save(); render(); } };
  const rn = document.getElementById("reviewNow"); if (rn) rn.onclick = () => { setHighScore(S.flagged[S.flagged.length-1].id, false); S.mode = "review"; S.reviewIdx = 0; S.attempts = 0; save(); render(); };
  const ul = document.getElementById("undoLast"); if (ul) ul.onclick = () => { const f = S.flagged.pop(); if (f) delete S.flaggedIds[f.id]; save(); render(); };
}
document.getElementById("guBtn").onclick = () => { if (S.mode === "grownups"){ S.mode = (S._before && S._before !== "grownups") ? S._before : "read"; } else { S._before = S.mode; S.mode = "grownups"; } save(); render(); };

render();
