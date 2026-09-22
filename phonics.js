/* phonics.js — structured-literacy word analysis for the reader.
   Grapheme tokenizer → affix peeling → syllable division (VC|CV, V|CV, consonant-le, blends)
   → chunk rendering with vowels marked, silent e dimmed, hearts on irregular graphemes.
   Rules follow the ordered procedure teachers use (UFLI / Orton-Gillingham style); the
   V|CV vs VC|V choice is a coin flip in English (Kearns 2020), so analyze() can produce
   the alternative split for "try it the other way" practice. */
window.PH = (function(){
  const V = "aeiou";
  const isVL = c => !!c && V.includes(c);              // vowel letter
  const isVY = c => !!c && (V.includes(c) || c === "y"); // vowel letter or y

  /* ---- graphemes (longest match first, with positional conditions) ---- */
  const VOWEL_UNITS = ["augh","ough","eigh","igh","air","ear","ere","ire","ore","ure","are","our",
    "ai","ay","ee","ea","oa","oe","ow","ou","oi","oy","oo","ue","ew","ui","ie","au","aw","ey","ei","ar","or","er","ir","ur"];
  const R_UNITS = new Set(["ar","or","er","ir","ur","air","ear","our"]);
  const RE_UNITS = new Set(["are","ere","ire","ore","ure"]);   // only at word end
  const CONS_UNITS = ["tch","dge","ch","sh","th","wh","ph","ck","qu","ng","nk","kn","wr","gn","mb","gh"];
  const START_ONLY = new Set(["kn","wr","gn","gh"]);
  const END_ONLY = new Set(["mb"]);
  const NOT_START = new Set(["ck","tch","dge","ng","nk"]);
  const ONSETS = new Set(["bl","br","cl","cr","dr","fl","fr","gl","gr","pl","pr","sc","sk","sl","sm","sn","sp","st","sw","tr","tw","wr","kn","qu","ch","sh","th","wh","ph","gn","scr","spr","str","spl","squ","thr","shr","sch"]);
  const STAY_LEFT = new Set(["ck","tch","dge","x","ch","sh","th","ng","nk"]);   // never begin a syllable
  const GH = new Set(["igh","augh","ough","eigh"]);

  /* Tokenize a lowercase letters-only word into graphemes: [{t, v}] (v = vowel grapheme). */
  function tokenize(w){
    const out = []; let i = 0;
    while (i < w.length){
      let hit = null;
      if (!hit) for (const u of CONS_UNITS){
        if (!w.startsWith(u, i)) continue;
        if (START_ONLY.has(u) && i !== 0) continue;
        if (END_ONLY.has(u) && i + u.length !== w.length) continue;
        if (NOT_START.has(u) && i === 0) continue;
        if ((u === "ng" || u === "nk") && isVY(w[i+2] || "")) continue;   // fin-ger, mon-key: keep letters apart
        hit = { t: u, v: false }; break;
      }
      if (!hit) for (const u of VOWEL_UNITS){
        if (!w.startsWith(u, i)) continue;
        const next = w[i+u.length] || "";
        if (RE_UNITS.has(u) && i + u.length !== w.length) continue;
        if (R_UNITS.has(u) && isVY(next)) continue;          // ve-ry, a-round: r goes with the next vowel
        if (!R_UNITS.has(u) && !RE_UNITS.has(u) && u !== "ow" && u !== "ew" && isVL(next)) continue;  // be-yond, a-way: team breaks before a vowel
        hit = { t: u, v: true }; break;
      }
      if (!hit){
        const c = w[i];
        const vowel = isVL(c) || (c === "y" && i > 0 && !isVL(w[i+1] || ""));
        hit = { t: c, v: vowel };
      }
      out.push(hit); i += hit.t.length;
    }
    // silent final e: "…Ce" with an earlier vowel (make, house, twelve, judge) — not "the", "she"
    const n = out.length;
    if (n >= 3 && out[n-1].t === "e" && !out[n-2].v && out.slice(0, n-2).some(g => g.v)){
      out[n-1].v = false; out[n-1].s = true;
    }
    return out;
  }

  /* ---- words the rules get wrong: explicit teaching splits ---- */
  const SPLITS = {};
  ("some|thing any|thing every|thing no|thing some|one any|one every|one some|where any|where every|where no|where " +
   "some|body any|body every|body no|body in|to on|to up|on with|out with|in in|side out|side be|side him|self her|self " +
   "it|self my|self your|self them|selves our|selves can|not may|be al|ways al|most al|read|y al|though al|so al|right " +
   "be|cause to|day to|night to|geth|er to|ward to|wards a|way a|gain e|lev|en ev|er|y ev|er|y|one ev|er|y|thing ev|er|y|where " +
   "ev|er|y|body peo|ple cre|ate cre|a|ture i|de|a re|act o|cean po|em po|et qui|et sci|ence di|et fu|el cru|el awe|some " +
   "bed|room bed|time birth|day break|fast some|times grand|ma grand|pa grand|moth|er grand|fath|er home|work play|ground " +
   "sun|shine sun|light moon|light day|light fire|place foot|ball base|ball bas|ket|ball sea|side rain|bow snow|man snow|flake " +
   "air|plane air|port pan|cake cup|cake door|way hall|way high|way rail|road note|book back|pack back|yard up|stairs down|stairs " +
   "in|deed in|stead per|haps ex|cept be|yond an|oth|er with|out un|der|stand un|der|neath o|ver|head war|ri|or fam|i|ly " +
   "beau|ti|ful an|i|mal gen|er|al en|e|my en|e|mies li|brar|y mys|ter|y mys|te|ri|ous ex|per|i|ment ma|chine strong|est long|est young|est strong|er long|er")
   .split(" ").forEach(s => { SPLITS[s.replace(/\|/g,"")] = s.split("|"); });

  /* two-syllable words where the single middle consonant stays with the first (closed) syllable */
  const CLOSED_FIRST = new Set(("never ever seven river liver clever camel lemon melon wagon dragon cabin robin planet comet " +
    "visit finish punish vanish banish polish relish radish salad habit rapid solid valid vivid timid limit lizard wizard " +
    "magic tragic logic topic panic credit edit second minute present promise olive oven image damage manage cover hover " +
    "shovel level novel travel gravel metal medal petal pedal chapel model body copy study busy money honey shadow meadow " +
    "heaven heavy ready steady forest spirit given driven woman women linen satin talent salmon closet city pity dozen " +
    "devil digit color colour stomach having giving living loving coming shining? planet prison desert honest modest " +
    "profit rocket punish menace palace ballad cabinet river seven eleven clinic tonic sonic denim lily wagon record shiver quiver deliver sliver").replace("?","").split(" "));

  /* ---- heart words: graphemes separated by ".", "*" = learn-by-heart part, "|" = chunk break ---- */
  const HEART_SRC = {
    the:"th.e*", of:"o*.f*", was:"w.a*.s", said:"s.ai*.d", one:"one*", once:"o*.n.ce", two:"t.wo*", are:"are*", were:"w.ere*",
    do:"d.o*", to:"t.o*", you:"y.ou*", your:"y.our*", they:"th.ey*", their:"th.eir*", there:"th.ere*", where:"wh.ere*",
    what:"wh.a*.t", who:"wh*.o*", whose:"wh*.o*.s.e", come:"c.o*.m.e", comes:"c.o*.m.e.s", coming:"c.o*.m|ing", some:"s.o*.m.e",
    done:"d.o*.n.e", from:"f.r.o*.m", want:"w.a*.n.t", wants:"w.a*.n.t.s", wanted:"w.a*.n.t|ed", wash:"w.a*.sh", water:"w.a*|t.er",
    watch:"w.a*.tch", would:"w.oul*.d", could:"c.oul*.d", should:"sh.oul*.d", put:"p.u*.t", pull:"p.u*.ll", full:"f.u*.ll",
    push:"p.u*.sh", again:"a|g.ai*.n", against:"a|g.ai*.n.s.t", any:"a*|n.y", many:"m.a*|n.y", been:"b.ee*.n", eight:"eigh*.t",
    laugh:"l.augh*", laughed:"l.augh*|ed", buy:"b.uy*", does:"d.oe*.s", friend:"f.r.ie*.n.d", friends:"f.r.ie*.n.d.s",
    people:"p.eo*|p.le", thought:"th.ough*.t", through:"th.r.ough*", though:"th.ough*", enough:"e|n.ough*", rough:"r.ough*",
    tough:"t.ough*", eye:"eye*", eyes:"eye*.s", gone:"g.o*.n.e", love:"l.o*.v.e", loved:"l.o*.v.e|d", above:"a|b.o*.v.e",
    give:"g.i.v.e*", live:"l.i.v.e*", have:"h.a.v.e*", move:"m.o*.v.e", prove:"p.r.o*.v.e", lose:"l.o*.s.e", other:"o*.th|er",
    mother:"m.o*.th|er", brother:"b.r.o*.th|er", another:"a|n.o*.th|er", nothing:"n.o*.th|ing", something:"s.o*.m.e|th.ing",
    month:"m.o*.n.th", money:"m.o*|n.ey", monkey:"m.o*|n.k.ey", front:"f.r.o*.n.t", won:"w.o*.n", son:"s.o*.n", sure:"s*.ure",
    sugar:"s*.u|g.ar", says:"s.ay*.s", heart:"h.ear*.t", great:"g.r.ea*.t", break:"b.r.ea*.k", head:"h.ea*.d", bread:"b.r.ea*.d",
    dead:"d.ea*.d", read:"r.ea.d", instead:"in|s.t.ea*.d", weather:"w.ea*.th|er", feather:"f.ea*.th|er", leather:"l.ea*.th|er",
    heavy:"h.ea*|v.y", ready:"r.ea*|d.y", already:"al|r.ea*|d.y", meant:"m.ea*.n.t", breath:"b.r.ea*.th", work:"w.or*.k",
    word:"w.or*.d", words:"w.or*.d.s", world:"w.or*.l.d", worm:"w.or*.m", worth:"w.or*.th", war:"w.ar*", warm:"w.ar*.m",
    wand:"w.a*.n.d", swan:"s.w.a*.n", wolf:"w.o*.l.f", woman:"w.o*|m.a.n", women:"w.o*|m.e*.n", shoe:"sh.oe*", shoes:"sh.oe*.s",
    build:"b.ui*.l.d", built:"b.ui*.l.t", busy:"b.u*|s.y", pretty:"p.r.e*|tt.y", island:"i|s*.l.a.n.d", answer:"a.n|s.w*.er",
    sword:"s.w*.or.d", listen:"l.i.s|t*.e.n", often:"o.f|t*.e.n", castle:"c.a.s|t*.le", whistle:"wh.i.s|t*.le", half:"h.a*.l*.f",
    calf:"c.a*.l*.f", walk:"w.a*.l*.k", talk:"t.a*.l*.k", chalk:"ch.a*.l*.k", climb:"c.l.i*.mb", child:"ch.i*.l.d", find:"f.i*.n.d",
    kind:"k.i*.n.d", mind:"m.i*.n.d", behind:"be|h.i*.n.d", wild:"w.i*.l.d", old:"o*.l.d", cold:"c.o*.l.d", told:"t.o*.l.d",
    hold:"h.o*.l.d", gold:"g.o*.l.d", most:"m.o*.s.t", both:"b.o*.th", only:"o*.n|l.y", father:"f.a*.th|er", school:"s.ch*.oo.l",
    ghost:"gh*.o*.s.t", guess:"gu*.e.ss", guard:"gu*.ar.d", tongue:"t.o*.ngue*", young:"y.ou*.ng", touch:"t.ou*.ch",
    cousin:"c.ou*|s.i.n", country:"c.ou*.n|t.r.y", double:"d.ou*|b.le", trouble:"t.r.ou*|b.le", couple:"c.ou*|p.le",
    blood:"b.l.oo*.d", flood:"f.l.oo*.d", door:"d.oor*", floor:"f.l.oor*", poor:"p.oor*", heard:"h.ear*.d", learn:"l.ear*.n",
    earth:"ear*.th", early:"ear*|l.y", search:"s.ear*.ch", bear:"b.ear*", wear:"w.ear*", pear:"p.ear*", sew:"s.ew*",
    minute:"m.i.n|u*.t.e", iron:"i*|r.o.n", stomach:"s.t.o.m|a.ch*", machine:"m.a|ch*.i.n.e", ocean:"o|c*.ea*.n",
    special:"s.p.e|c*.i.a.l", ache:"a.ch*.e", chorus:"ch*.o|r.u.s", character:"ch*.a.r|ac|t.er", echo:"e.ch*|o",
    because:"be|c.au.s.e", very:"v.e|r.y", where:"wh.ere*", here:"h.ere", there:"th.ere*", none:"n.o*.n.e",
    dove:"d.o*.v.e", glove:"g.l.o*.v.e", shove:"sh.o*.v.e", above:"a|b.o*.v.e", oven:"o*|v.e.n", among:"a|m.o*.ng",
    become:"be|c.o*.m.e", welcome:"w.e.l|c.o*.m.e", honey:"h.o*|n.ey", onion:"o*|n.i.o.n", cover:"c.o*|v.er", dozen:"d.o*|z.e.n",
    tomb:"t.o*.mb", womb:"w.o*.mb", comb:"c.o*.mb", brought:"b.r.ough*.t", bought:"b.ough*.t", fought:"f.ough*.t",
    ought:"ough*.t", caught:"c.augh*.t", taught:"t.augh*.t", daughter:"d.augh*|t.er", straight:"s.t.r.aigh*.t",
    height:"h.eigh*.t", weight:"w.eigh*.t", neighbor:"n.eigh*|b.or", neighbour:"n.eigh*|b.our", key:"k.ey", they:"th.ey*",
    obey:"o|b.ey*", grey:"g.r.ey*", gray:"g.r.ay", hour:"h*.our", honest:"h*.o.n|e.s.t", honor:"h*.o.n|or", knew:"kn.ew",
    quite:"qu.i.t.e", quiet:"qu.i|e.t", science:"s.c*.i|e.n.ce", scissors:"s.c*.i.ss|or.s", muscle:"m.u.s|c*.le",
    yacht:"y.a.ch*.t", stopped:"s.t.o.p|p.ed", "don't":"d.o*.n'.t", "won't":"w.o*.n'.t", "doesn't":"d.oe*.s.n'.t",
    "wasn't":"w.a*.s.n'.t", "couldn't":"c.oul*.d.n'.t", "wouldn't":"w.oul*.d.n'.t", "shouldn't":"sh.oul*.d.n'.t",
    "you're":"y.ou*.'.r.e", "they're":"th.ey*.'.r.e", "we're":"w.e.'.r.e", "I'm":"i.'.m", "isn't":"i.s.n'.t", "aren't":"are*.n'.t",
    "there's":"th.ere*.'.s", "where's":"wh.ere*.'.s", "who's":"wh*.o*.'.s", "what's":"wh.a*.t.'.s", "that's":"th.a.t.'.s",
    "let's":"l.e.t.'.s", "can't":"c.a.n'.t", "didn't":"d.i.d.n'.t", "hadn't":"h.a.d.n'.t", "haven't":"h.a.v.e*.n'.t",
    "I'll":"i.'.ll", "you'll":"y.ou*.'.ll", "we'll":"w.e.'.ll", "she'll":"sh.e.'.ll", "he'll":"h.e.'.ll", "I've":"i.'.v.e", "you've":"y.ou*.'.v.e"
  };
  const HEART = {};
  for (const k in HEART_SRC){
    const chunks = HEART_SRC[k].split("|").map(c => c.split(".").map(g => {
      const heart = g.endsWith("*"); const t = heart ? g.slice(0,-1) : g;
      return { t, v: /[aeiouy]/.test(t) && !/^[^aeiouy]*'?[^aeiouy]*$/.test(t) && !/^(ll|wo|th|wh|s|gu|gh|c|ch|t|l|sc|f|h|w)$/.test(t), h: heart };
    }));
    HEART[k.toLowerCase()] = chunks;
  }

  /* ---- affixes ---- */
  const PREFIXES = [
    { p:"under", min:4, vowelOk:false }, { p:"over", min:4, vowelOk:false }, { p:"dis", min:4, vowelOk:true },
    { p:"mis", min:4, vowelOk:true }, { p:"non", min:4, vowelOk:false }, { p:"sub", min:4, vowelOk:false },
    { p:"pre", min:4, vowelOk:false }, { p:"un", min:4, vowelOk:true, notI:true }, { p:"re", min:4, vowelOk:false },
    { p:"im", min:4, vowelOk:false }, { p:"in", min:4, vowelOk:false }, { p:"en", min:3, vowelOk:false },
    { p:"be", min:3, vowelOk:false }, { p:"de", min:4, vowelOk:false }, { p:"a", min:4, vowelOk:false }
  ];
  function validOnset(r){
    const m = r.match(/^[^aeiouy]+/); if (!m) return true;
    const c = m[0]; if (c.length === 1) return c !== "x";
    return ONSETS.has(c);
  }
  function peelPrefix(w){
    for (const {p, min, vowelOk, notI} of PREFIXES){
      if (!w.startsWith(p) || w.length - p.length < min) continue;
      const r = w.slice(p.length);
      if (!/[aeiouy]/.test(r)) continue;
      if (isVL(r[0])){ if (!vowelOk || (notI && r[0] === "i")) continue; }
      else if (!validOnset(r)) continue;
      if (r[0] === "y" && !isVL(r[1] || "")) continue;
      return [p, r];
    }
    return null;
  }
  const TEAM_END = /(ay|ey|oy|ow|ew|aw|ee|oo|ie|ue|oe|ea|ay)$/;
  function endsVCe(r){ const n = r.length; return n >= 3 && r[n-1] === "e" && !isVL(r[n-2]) && /[aeiouy]/.test(r.slice(0, n-2)); }
  function endsDouble(r){ const n = r.length; return n >= 2 && r[n-1] === r[n-2] && !isVL(r[n-1]); }
  function vowelGraphemes(r){ return tokenize(r).filter(g => g.v).length; }
  function endsVC(r){ const n = r.length; return n >= 2 && !isVL(r[n-1]) && r[n-1] !== "y" && r[n-1] !== "w" && isVL(r[n-2]) && !isVY(r[n-3] || ""); }
  /* returns [base, suffix] or null; base may have a restored silent e */
  function peelSuffix(w){
    // -tion / -sion / -ture
    let m = w.match(/^(.{2,})(tion|sion|ture)$/);
    if (m && /[aeiouy]/.test(m[1])) return [m[1], m[2]];
    m = w.match(/^(.{3,})(ness|less|ful|ly)$/);
    if (m){ const r = m[1];
      if (/[aeiouy]/.test(r) && !endsDouble(r) && (!isVL(r[r.length-1]) || endsVCe(r) || TEAM_END.test(r)) && !(r.endsWith("y") && !isVL(r[r.length-2]))) return [r, m[2]];
    }
    m = w.match(/^(.{2,})(ing)$/);
    if (m){ const r = m[1];
      if (/[aeiou]/.test(r) && !endsDouble(r) && !(endsVC(r) && vowelGraphemes(r) === 1) && !r.endsWith("e") && !/[tdpkb]n$/.test(r) && !/[^aeiouy]l$/.test(r) && !(r.endsWith("y") && !isVL(r[r.length-2]) && r.length < 3)) return [r, "ing"];
    }
    m = w.match(/^(.{3,})(er|est)$/);
    if (m){ const r = m[1];
      const t = tokenize(r), L = t.length;
      if (/[aeiou]/.test(r) && !endsDouble(r) && L >= 2 && !t[L-1].v && t[L-2].v && t[L-2].t.length >= 2) return [r, m[2]];
    }
    m = w.match(/^(.{2,})(ed)$/);
    if (m){ let r = m[1]; const last = r[r.length-1];
      if (/[aeiouy]/.test(r) && /[^aeiouy]l$/.test(r) && r.length >= 4) return [r + "e", "d"];   // circle·d, tumble·d
      if (/dg$/.test(r)) return [r + "e", "d"];                                                     // nudge·d
      if (/[aeiouy]/.test(r) && !endsDouble(r) && !/[bcdfgkpt][rl]$/.test(r)){
        if (isVL(last)){ /* bleed, freed: not a suffix */ }
        else if ((last === "y" || last === "w") && isVL(r[r.length-2])) return [r, "ed"];
        else if (last !== "y" && last !== "w"){
          if (endsVC(r) && last !== "x" && (vowelGraphemes(r) === 1 || "csvz".includes(last))) return [r + "e", "d"];
          return [r, "ed"];
        }
      }
    }
    m = w.match(/^(.{3,})(es)$/);
    if (m){ const r = m[1]; if (/[aeiouy]/.test(r) && /(s|x|z|ch|sh)$/.test(r) && !endsDouble(r) && !/ss$/.test(r)) return [r, "es"]; }
    m = w.match(/^(.{3,})(s)$/);
    if (m){ const r = m[1]; const last = r[r.length-1];
      if (/[aeiouy]/.test(r) && !endsDouble(r) && last !== "s" && last !== "u" && last !== "i"){
        if (!isVL(last) && last !== "y" && last !== "w") return [r, "s"];
        if ((last === "y" || last === "w") && isVL(r[r.length-2])) return [r, "s"];
        if (last === "e" && endsVCe(r)) return [r, "s"];
        if (TEAM_END.test(r)) return [r, "s"];
      }
    }
    return null;
  }

  /* ---- syllable division on a tokenized base ---- */
  function divide(gs, opts){
    let n = gs.length;
    // consonant-le: split before the consonant that precedes "le"
    let cleCut = -1;
    if (n >= 4 && gs[n-1].t === "e" && gs[n-2].t === "l" && !gs[n-3].v && gs.slice(0, n-3).some(g => g.v)){
      gs[n-1].v = true; gs[n-1].s = false;           // the "le" carries the vowel sound
      if (gs[n-3].t === "ng"){ gs.splice(n-3, 1, { t:"n", v:false }, { t:"g", v:false }); }   // sin|gle, jun|gle
      const N = gs.length;
      cleCut = (STAY_LEFT.has(gs[N-3].t)) ? N - 2 : N - 3;
    }
    const n2 = gs.length;
    const vi = []; gs.forEach((g, i) => { if (g.v) vi.push(i); });
    if (vi.length < 2) return [gs];
    const cuts = [];
    n = n2;
    const lastVi = cleCut >= 0 ? vi.filter(i => i < cleCut) : vi;
    for (let k = 0; k < lastVi.length - 1; k++){
      const a = lastVi[k], b = lastVi[k+1];
      const cons = gs.slice(a+1, b);
      if (cons.length === 0){ cuts.push(a+1); continue; }                    // li|on
      const single = gs[a].t.length === 1;                                   // a e i o u y (not a team / r-unit)
      const ght = GH.has(gs[a].t) && cons[0].t === "t";                       // light-ning, fright-en
      if (cons.length === 1){
        const c = cons[0].t;
        const closed = ght || (single && STAY_LEFT.has(c)) || c === "x" || opts.closed || (opts.closedFirst && lastVi.length === 2);
        cuts.push(closed ? a+2 : a+1); continue;
      }
      if (cons.length === 2){
        const pair = cons.map(g => g.t).join("");
        if (!single && !ght && ONSETS.has(pair)) cuts.push(a+1);              // sur|prise, or|chard
        else cuts.push(a+2);                                                  // rab|bit
        continue;
      }
      // 3+: keep a valid onset with the second vowel
      let cut = a + cons.length;                                              // default: last consonant moves
      for (let take = Math.min(3, cons.length - 1); take >= 1; take--){
        const tail = cons.slice(cons.length - take).map(g => g.t).join("");
        if ((take === 1 && !STAY_LEFT.has(tail) && tail !== "x") || ONSETS.has(tail)){ cut = b - take; break; }
      }
      cuts.push(cut);
    }
    if (cleCut >= 0) cuts.push(cleCut);
    const out = []; let last = 0;
    [...new Set(cuts)].sort((x,y)=>x-y).forEach(c => { if (c > last && c < n){ out.push(gs.slice(last, c)); last = c; } });
    out.push(gs.slice(last));
    return out;
  }

  /* ---- full analysis ---- */
  function fromPattern(chunks){ return chunks.map(c => c.map(g => ({ ...g }))); }
  function analyzeLower(w, opts){
    if (HEART[w] && !opts.noHeart) return { chunks: fromPattern(HEART[w]), heart: true };
    if (SPLITS[w]) return { chunks: SPLITS[w].map(s => tokenize(s)), dict: true };
    let pre = null, suf = null, base = w;
    const pp = peelPrefix(base); if (pp){ pre = pp[0]; base = pp[1]; }
    const sufs = [];
    for (let k = 0; k < 2; k++){ const ps = peelSuffix(base); if (!ps || (k && (ps[1] === "s" || ps[1] === "d"))) break; base = ps[0]; sufs.unshift(ps[1]); if (ps[1] === "s" || ps[1] === "d") break; }
    let baseChunks;
    if (HEART[base] && !opts.noHeart) baseChunks = fromPattern(HEART[base]);
    else if (SPLITS[base]) baseChunks = SPLITS[base].map(s => tokenize(s));
    else baseChunks = divide(tokenize(base), { closedFirst: opts.flip ? !CLOSED_FIRST.has(base) && !CLOSED_FIRST.has(w) : (CLOSED_FIRST.has(base) || CLOSED_FIRST.has(w)) });
    const chunks = [];
    if (pre) chunks.push(Object.assign(tokenize(pre), { affix: true }));
    chunks.push(...baseChunks);
    for (const suf of sufs){
      const sg = tokenize(suf); sg.forEach(g => { if (g.s){ g.s = false; } });
      if (suf === "d" || suf === "s"){ chunks[chunks.length-1].push(...sg.map(g => ({ ...g, affix: true }))); }   // like·d, make·s
      else chunks.push(Object.assign(sg, { affix: true }));
    }
    return { chunks, hasSingleCut: hasSingleConsonantCut(base) };
  }
  function hasSingleConsonantCut(base){
    const gs = tokenize(base); const vi = []; gs.forEach((g,i)=>{ if (g.v) vi.push(i); });
    for (let k = 0; k < vi.length - 1; k++){ if (vi[k+1] - vi[k] === 2 && !STAY_LEFT.has(gs[vi[k]+1].t)) return true; }
    return false;
  }
  /* analyze(word) → { chunks:[[{t, v, s, h, affix}]], alt:bool }  — keeps original casing */
  function analyze(word, opts){
    opts = opts || {};
    const m = word.match(/^([^A-Za-z]*)([A-Za-z][A-Za-z']*)(.*)$/);
    if (!m) return { chunks: [[{ t: word }]], alt: false };
    let core = m[2], tail = "";
    let apos = core.indexOf("'");
    const lower = core.toLowerCase();
    let res;
    if (HEART[lower]) res = { chunks: fromPattern(HEART[lower]), heart: true };
    else {
      if (apos > 0){ tail = core.slice(apos); core = core.slice(0, apos); }
      res = analyzeLower(core.toLowerCase(), opts);
      if (tail) res.chunks[res.chunks.length-1].push({ t: tail.toLowerCase(), v: false, affix: true });
    }
    // restore original casing letter by letter
    let src = (m[2]).replace(/[^A-Za-z']/g, ""); let k = 0;
    res.chunks.forEach(c => c.forEach(g => {
      let t = "";
      for (const ch of g.t){ const s = src[k] || ch; t += (ch === "'" ? "'" : (s.toLowerCase() === ch ? s : ch)); k++; }
      g.t = t;
    }));
    res.chunks[res.chunks.length-1].push({ t: m[3], punct: true });
    if (m[1]) res.chunks[0].unshift({ t: m[1], punct: true });
    res.alt = !!res.hasSingleCut && !res.heart && !res.dict;
    return res;
  }

  /* HTML: syllable colours per chunk, vowels underlined, silent e dimmed, ♥ over heart graphemes */
  function html(word, opts){
    const a = analyze(word, opts);
    return a.chunks.map((c, i) => `<span class="c c${i%4+1}${c.affix ? " aff" : ""}" data-ci="${i}">` +
      c.map(g => g.punct ? g.t : `<span class="g${g.v ? " gv" : ""}${g.s ? " gs" : ""}${g.h ? " gh" : ""}${g.affix ? " ga" : ""}${g.t.length > 1 && !g.affix ? " gm" : ""}">${g.t}</span>`).join("") +
      `</span>`).join("");
  }
  function chunkTexts(word, opts){ return analyze(word, opts).chunks.map(c => c.filter(g => !g.punct).map(g => g.t).join("")); }
  function isHeart(word){ return !!HEART[word.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g,"").toLowerCase()]; }

  return { analyze, html, chunkTexts, isHeart, tokenize, HEART, SPLITS };
})();
