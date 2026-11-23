// 중국어 단어장 = 엑셀 「중국어 단어 8」(wordbook/zh.json, tools/build_zh_wordbook.py로 만들어요)
// 단어 = [병음, 한자, 한국어 뜻, 품사, 급수("1-3" | "4" | "5" | "")]
// 주소: zhwords.html#list · #review(카드 복습) · #quiz
// 기록은 다른 단어장과 따로 저장해요 (zw_ 로 시작하는 열쇠)
(async () => {
  const { esc, store, say } = U;
  const $ = id => document.getElementById(id);
  let D;
  try { D = await fetch("wordbook/zh.json", { cache: "no-cache" }).then(r => r.json()); }
  catch { $("lcount").textContent = "단어장을 불러오지 못했어요. 새로고침해 주세요."; return; }

  // 병음 검색용: 성조·띄어쓰기·경성 점(‧)·격음 부호(’)를 빼요. ü는 u나 v로 찾을 수 있어요
  const flat = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s‧·’'\-]/g, "");
  const W = D.words.map(([py, hz, ko, pos, lvl], i) => ({ i, py, hz, ko, pos, lvl, k: `${hz}|${py}|${ko}`, fp: flat(py) }));

  const POS_KO = { 名词: "명사", 动词: "동사", 形容词: "형용사", 副词: "부사", 连接词: "접속사", 量词: "양사", 代词: "대명사",
    前置词: "개사", 数词: "수사", 助词: "조사", 助动词: "조동사", 感叹词: "감탄사" };
  const posName = p => p ? `${p} ${POS_KO[p] || ""}`.trim() : "품사 없음";
  const LV = ["1-3", "4", "5", ""];
  const lvName = l => l ? `HSK ${l.replace("-", "–")}급` : "급수 없음";

  // ---------- 기록 ----------
  const dayOf = t => { const d = new Date(t); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); };
  const today = dayOf(Date.now());
  const SRS = store.get("zw_srs", {});   // 열쇠 → {i 간격(일), e 쉬움 배수, d 다음 복습일, r 맞힌 횟수, x 틀린 횟수}
  const known = store.get("zw_known", {});
  const LOG = store.get("zw_log", {});   // 날짜 → {n 새 단어, r 복습}
  const log = LOG[today] = LOG[today] || { n: 0, r: 0 };
  const save = () => { store.set("zw_srs", SRS); store.set("zw_known", known); store.set("zw_log", LOG); };
  const status = w => { const s = SRS[w.k]; if (s) return s.i >= 21 ? "known" : "learn"; return known[w.k] ? "known" : "new"; };
  const isKnown = w => status(w) === "known";

  // ---------- 필터 ----------
  const selLv = new Set(store.get("zw_lv", []));
  const lvCount = l => W.filter(w => w.lvl === l).length;
  const POS = [...new Set(W.map(w => w.pos))].sort((a, b) => W.filter(w => w.pos === b).length - W.filter(w => w.pos === a).length);
  $("pos").innerHTML = `<option value="*">모든 품사</option>` + POS.map(p => `<option value="${esc(p)}">${esc(posName(p))} (${W.filter(w => w.pos === p).length})</option>`).join("");
  const setSel = (id, k, def) => { const v = store.get(k, def); $(id).value = v; if ($(id).value !== v) $(id).value = def; };
  setSel("pos", "zw_pos", "*"); setSel("st", "zw_st", "all"); setSel("ord", "zw_ord", "orig");
  function drawLv() {
    $("lvls").innerHTML = `<button data-l="*" aria-pressed="${!selLv.size}">모든 급수</button>` +
      LV.filter(lvCount).map(l => `<button data-l="${l}" aria-pressed="${selLv.has(l)}">${lvName(l)} <small>${lvCount(l)}</small></button>`).join("");
  }
  drawLv();
  $("lvls").onclick = e => {
    const b = e.target.closest("button"); if (!b) return;
    const l = b.dataset.l;
    if (l === "*") selLv.clear(); else selLv.has(l) ? selLv.delete(l) : selLv.add(l);
    store.set("zw_lv", [...selLv]); drawLv(); refresh();
  };
  let rnd = new Map();
  function filtered({ useStatus = true } = {}) {
    const raw = $("q").value.trim(), f = raw.toLowerCase(), fp = flat(raw).replace(/v/g, "u");
    const pos = $("pos").value, st = $("st").value, ord = $("ord").value;
    let rows = W.filter(w => (!selLv.size || selLv.has(w.lvl)) && (pos === "*" || w.pos === pos)
      && (!useStatus || st === "all" || (st === "known") === isKnown(w))
      && (!raw || w.hz.includes(raw) || w.ko.includes(raw) || (fp && w.fp.replace(/ü/g, "u").includes(fp)) || w.py.toLowerCase().includes(f)));
    if (raw) {
      const r = w => w.hz === raw || w.fp === fp ? 0 : w.hz.startsWith(raw) || w.fp.startsWith(fp) ? 1 : 2;
      rows.sort((a, b) => r(a) - r(b) || a.i - b.i);
    } else if (ord === "py") rows.sort((a, b) => a.fp.localeCompare(b.fp) || a.i - b.i);
    else if (ord === "rnd") { rows.forEach(w => { if (!rnd.has(w.i)) rnd.set(w.i, Math.random()); }); rows.sort((a, b) => rnd.get(a.i) - rnd.get(b.i)); }
    return rows;
  }

  // ---------- 통계 ----------
  function stats() {
    const c = { due: 0, learn: 0, known: 0 };
    for (const w of W) { const s = SRS[w.k], st = status(w); if (st !== "new") c[st]++; if (s && s.d <= today) c.due++; }
    let streak = 0;
    for (let d = today - (log.n || log.r ? 0 : 1); LOG[d] && (LOG[d].n || LOG[d].r); d--) streak++;
    const byLv = LV.slice(0, 3).map(l => { const t = W.filter(w => w.lvl === l); return `${lvName(l)} ${t.filter(isKnown).length}/${t.length}`; }).join(" · ");
    $("vstats").innerHTML = `<div class="stats four">
      <div class="stat"><b>${W.length.toLocaleString()}</b><span>전체 단어</span></div>
      <div class="stat"><b>${c.due}</b><span>오늘 복습</span></div>
      <div class="stat"><b>${c.learn.toLocaleString()}</b><span>공부 중</span></div>
      <div class="stat"><b>${c.known.toLocaleString()}</b><span>외운 단어</span></div>
    </div><p class="hint">오늘 새 단어 ${log.n}개 · 복습 ${log.r}번 · 연속 ${streak}일<br>외운 단어 · ${byLv}</p>`;
  }

  // ---------- 화면 조각 ----------
  const tags = w => `<span class="tags">${w.pos ? `<span class="chip">${esc(posName(w.pos))}</span>` : ""}<span class="chip yel">${esc(lvName(w.lvl))}</span></span>`;
  const sayBtn = w => `<button class="say" data-say="${w.i}" aria-label="발음 듣기">🔊</button>`;
  const ivl = i => i === 0 ? "곧 다시" : i < 30 ? `${i}일` : i < 365 ? `${Math.round(i / 30)}달` : `${(i / 365).toFixed(1)}년`;

  // ---------- 목록 ----------
  let limit = 100, cur = [];
  function renderList() {
    cur = filtered();
    $("lcount").textContent = `${cur.length.toLocaleString()}개 단어`;
    $("vgrid").innerHTML = cur.length ? cur.slice(0, limit).map(w => {
      const s = SRS[w.k], st = status(w);
      const srsTag = st === "learn" ? `<span class="chip">${s.d <= today ? "오늘 복습" : ivl(s.d - today) + " 뒤 복습"}</span>` : "";
      return `<div class="vcard${st === "known" ? " known" : ""}" data-i="${w.i}">
        <div><span class="hz" lang="zh-CN">${esc(w.hz)}</span><span class="pyw">${esc(w.py)}</span>${sayBtn(w)}${tags(w)}${srsTag}
          <div class="m">${esc(w.ko)}</div></div>
        <div class="acts"><button class="k" data-k="${w.i}">${st === "known" ? "✓ 외움" : "외웠어요"}</button></div>
      </div>`;
    }).join("") : `<p class="hint" style="padding:12px">조건에 맞는 단어가 없어요.</p>`;
    $("more").hidden = cur.length <= limit;
  }
  $("more").onclick = () => { limit += 200; renderList(); };
  const sayClick = e => { const s = e.target.closest("[data-say]"); if (s) { say(W[+s.dataset.say].hz, "zh"); return true; } return false; };
  $("vgrid").addEventListener("click", e => {
    if (sayClick(e)) return;
    const k = e.target.closest("[data-k]");
    if (k) {
      const w = W[+k.dataset.k];
      if (isKnown(w)) { delete known[w.k]; if (SRS[w.k] && SRS[w.k].i >= 21) delete SRS[w.k]; }
      else known[w.k] = 1;
      save(); stats(); renderList(); return;
    }
    const card = e.target.closest(".vcard");
    if (card && document.body.matches(".cover, .hidepy")) card.classList.toggle("open");
  });
  for (const [id, cls, key] of [["optCover", "cover", "zw_cover"], ["optPy", "hidepy", "zw_hidepy"]]) {
    $(id).checked = store.get(key, false);
    document.body.classList.toggle(cls, $(id).checked);
    $(id).onchange = () => { store.set(key, $(id).checked); document.body.classList.toggle(cls, $(id).checked); };
  }

  // ---------- 카드 복습 (간격 반복) ----------
  const opt = { dir: store.get("zw_dir", "f"), nnew: store.get("zw_new", 10), say: store.get("zw_say", true) };
  $("oDir").value = opt.dir; $("oNew").value = opt.nnew; $("oSay").checked = opt.say;
  $("oDir").onchange = e => { opt.dir = e.target.value; store.set("zw_dir", opt.dir); show(); };
  $("oNew").onchange = e => { opt.nnew = +e.target.value; store.set("zw_new", opt.nnew); start(); };
  $("oSay").onchange = e => { opt.say = e.target.checked; store.set("zw_say", opt.say); };
  function next(s, q) { // q: 0 다시 · 1 어려움 · 2 알맞음 · 3 쉬움
    s = s ? { ...s } : { i: 0, e: 2.5, r: 0, x: 0 };
    if (q === 0) { if (s.i > 0) s.x++; s.e = Math.max(1.3, s.e - 0.2); s.i = 0; }
    else if (s.i === 0) { s.i = [0, 1, 1, 4][q]; if (q === 3) s.e += 0.15; }
    else if (q === 1) { s.i = Math.max(s.i + 1, Math.round(s.i * 1.2)); s.e = Math.max(1.3, s.e - 0.15); }
    else if (q === 2) s.i = Math.max(s.i + 1, Math.round(s.i * s.e));
    else { s.i = Math.round(s.i * s.e * 1.3) + 1; s.e += 0.15; }
    if (q > 0) s.r++;
    s.d = today + s.i;
    return s;
  }
  let queue = [], card = null, shown = false;
  const freshPool = () => filtered({ useStatus: false }).filter(w => status(w) === "new");
  function start(extra = 0) {
    const due = W.filter(w => SRS[w.k] && SRS[w.k].d <= today).sort((a, b) => SRS[a.k].d - SRS[b.k].d);
    queue = [...due, ...freshPool().slice(0, Math.max(0, opt.nnew - log.n) + extra)];
    card = null; nextCard();
  }
  function nextCard() { card = queue.shift() || null; shown = false; show(); stats(); }
  const front = w => `<div class="fw hz" lang="zh-CN">${esc(w.hz)}</div>`;
  const meaning = w => `<div class="fk">${esc(w.ko)}</div>`;
  function show() {
    const rv = $("rv");
    if (!card) {
      const more = freshPool().length;
      rv.innerHTML = `<div class="fcard done"><div class="fk">🎉 오늘 복습 끝!</div>
        <p class="hint">내일 다시 오면 복습할 단어가 기다리고 있어요.${more ? ` 지금 조건의 새 단어가 ${more.toLocaleString()}개 남았어요.` : ""}</p>
        ${more ? `<div class="btns"><button class="btn primary" id="more10">새 단어 10개 더</button></div>` : ""}</div>`;
      if (more) $("more10").onclick = () => start(10);
      return;
    }
    const w = card, s = SRS[w.k], isNew = !s;
    const prev = q => ivl(next(s, q).i);
    rv.innerHTML = `<div class="fcard${shown ? " open" : ""}">
      <div class="chips"><span class="chip ${isNew ? "red" : ""}">${isNew ? "새 단어" : "복습"}</span><span class="chip">남은 카드 ${queue.length + 1}</span>${tags(w)}</div>
      ${opt.dir === "f" ? front(w) : meaning(w)}
      ${shown ? `<div class="fback">${opt.dir === "f" ? "" : front(w)}<div class="pyb">${esc(w.py)} ${sayBtn(w)}</div>${opt.dir === "f" ? meaning(w) : ""}</div>
        <div class="rate">
          <button data-q="0" class="q0">다시<small>${prev(0)}</small></button>
          <button data-q="1" class="q1">어려움<small>${prev(1)}</small></button>
          <button data-q="2" class="q2">알맞음<small>${prev(2)}</small></button>
          <button data-q="3" class="q3">쉬움<small>${prev(3)}</small></button>
        </div>`
      : `<div class="btns"><button class="btn primary" id="reveal">답 보기</button>${opt.dir === "f" ? sayBtn(w) : ""}</div>`}
      <p class="hint keys">키보드: 스페이스 = 답 보기 · 1 다시 · 2 어려움 · 3 알맞음 · 4 쉬움</p></div>`;
  }
  function reveal() { if (!card || shown) return; shown = true; show(); if (opt.say) say(card.hz, "zh"); }
  function rate(q) {
    if (!card || !shown) return;
    if (SRS[card.k]) log.r++; else log.n++;
    SRS[card.k] = next(SRS[card.k], q);
    if (q === 0) queue.splice(Math.min(3, queue.length), 0, card);
    save(); nextCard();
  }
  $("rv").addEventListener("click", e => {
    if (sayClick(e)) return;
    if (e.target.closest("#reveal")) return reveal();
    const r = e.target.closest("[data-q]"); if (r) return rate(+r.dataset.q);
    if (!shown && e.target.closest(".fcard") && !e.target.closest("button,a")) reveal();
  });

  // ---------- 퀴즈 (4지선다) ----------
  const qo = { dir: store.get("zw_qdir", "f"), n: store.get("zw_qn", 10) };
  $("qDir").value = qo.dir; $("qN").value = qo.n;
  $("qDir").onchange = e => { qo.dir = e.target.value; store.set("zw_qdir", qo.dir); quiz(); };
  $("qN").onchange = e => { qo.n = +e.target.value; store.set("zw_qn", qo.n); quiz(); };
  const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  let Q = [], qi = 0, right = 0, wrong = [], answered = false;
  function makeQ(w) {
    const same = W.filter(x => x.pos === w.pos && x.ko !== w.ko && x.hz !== w.hz);
    const pool = same.length >= 3 ? same : W.filter(x => x.ko !== w.ko && x.hz !== w.hz);
    const picked = [];
    for (const x of shuffle(pool)) { if (!picked.some(p => p.ko === x.ko || p.hz === x.hz)) picked.push(x); if (picked.length === 3) break; }
    return { w, opts: shuffle([w, ...picked]) };
  }
  function quiz(list) {
    const src = list || filtered();
    Q = shuffle(src).slice(0, qo.n).map(makeQ); qi = 0; right = 0; wrong = []; answered = false;
    drawQ();
  }
  function drawQ() {
    const el = $("qz");
    if (!Q.length) { el.innerHTML = `<div class="fcard done"><p class="hint">조건에 맞는 단어가 없어요. 위의 조건을 바꿔 보세요.</p></div>`; return; }
    if (qi >= Q.length) {
      el.innerHTML = `<div class="fcard done"><div class="score">${right} / ${Q.length}</div>
        <p class="hint">${right === Q.length ? "🎉 모두 맞혔어요!" : "틀린 단어를 한 번 더 보고 가요."}</p>
        ${wrong.length ? `<ul class="wrongs">${wrong.map(w => `<li><b lang="zh-CN">${esc(w.hz)}</b> ${esc(w.py)} ${sayBtn(w)} — ${esc(w.ko)}</li>`).join("")}</ul>` : ""}
        <div class="btns">${wrong.length ? `<button class="btn primary" id="qWrong">틀린 단어만 다시</button>` : ""}<button class="btn${wrong.length ? "" : " primary"}" id="qAgain">새 문제 ${qo.n}개</button></div></div>`;
      if (wrong.length) $("qWrong").onclick = () => quiz(wrong);
      $("qAgain").onclick = () => quiz();
      return;
    }
    const { w, opts } = Q[qi];
    const head = qo.dir === "b" ? `<div class="qko">${esc(w.ko)}</div><div class="qpy"></div>`
      : qo.dir === "l" ? `<div class="qhz"><button class="btn primary" data-say="${w.i}">🔊 다시 듣기</button></div><div class="qpy">${answered ? `<b lang="zh-CN">${esc(w.hz)}</b> ${esc(w.py)}` : ""}</div>`
      : `<div class="qhz" lang="zh-CN">${esc(w.hz)}</div><div class="qpy">${answered ? esc(w.py) : ""}</div>`;
    el.innerHTML = `<div class="fcard open" style="text-align:left">
      <div class="chips"><span class="chip">문제 ${qi + 1} / ${Q.length}</span><span class="chip green">맞힘 ${right}</span>${tags(w)}</div>
      ${head}
      ${opts.map((o, j) => `<button class="opt${qo.dir === "b" ? " hzopt" : ""}" data-o="${j}">${qo.dir === "b" ? `<span lang="zh-CN">${esc(o.hz)}</span>${answered ? `<span class="py">${esc(o.py)}</span>` : ""}` : esc(o.ko)}</button>`).join("")}
      ${answered ? `<div class="btns"><button class="btn primary" id="qNext">${qi + 1 < Q.length ? "다음 문제" : "결과 보기"}</button></div>` : ""}
      <p class="hint keys">키보드: 1~4 = 보기 고르기 · 스페이스 = 다음</p></div>`;
    if (qo.dir === "l" && !answered) say(w.hz, "zh");
  }
  function answer(j) {
    if (answered || qi >= Q.length) return;
    const { w, opts } = Q[qi];
    answered = true;
    if (opts[j] === w) right++; else wrong.push(w);
    drawQ();
    const bs = $("qz").querySelectorAll(".opt");
    opts.forEach((o, k) => { if (o === w) bs[k].classList.add("right"); else if (k === j) bs[k].classList.add("wrong"); });
    if (qo.dir !== "l") say(w.hz, "zh");
  }
  function qNext() { if (!answered) return; qi++; answered = false; drawQ(); }
  $("qz").addEventListener("click", e => {
    if (sayClick(e)) return;
    const o = e.target.closest("[data-o]"); if (o) return answer(+o.dataset.o);
    if (e.target.closest("#qNext")) qNext();
  });

  document.addEventListener("keydown", e => {
    if (e.target.matches("input,select,textarea")) return;
    if (mode === "review") {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); shown ? rate(2) : reveal(); }
      else if ("1234".includes(e.key) && e.key.length === 1) rate(+e.key - 1);
    } else if (mode === "quiz") {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); qNext(); }
      else if ("1234".includes(e.key) && e.key.length === 1) answer(+e.key - 1);
    }
  });

  // ---------- 모드 · 새로고침 ----------
  const MODES = ["list", "review", "quiz"];
  let mode = MODES.includes(location.hash.slice(1)) ? location.hash.slice(1) : store.get("zw_mode", "list");
  function setMode(m) {
    mode = m; store.set("zw_mode", m);
    $("mseg").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.m === m));
    for (const x of MODES) $("pane-" + x).hidden = x !== m;
    $("listOpts").hidden = m !== "list";
    history.replaceState(null, "", location.pathname + location.search + "#" + m);
    refresh();
  }
  $("mseg").onclick = e => { const b = e.target.closest("button"); if (b) setMode(b.dataset.m); };
  addEventListener("hashchange", () => { const m = location.hash.slice(1); if (MODES.includes(m) && m !== mode) setMode(m); });
  function refresh() {
    limit = 100;
    if (mode === "list") renderList();
    else if (mode === "review") { $("lcount").textContent = `새 단어는 지금 조건(${filtered({ useStatus: false }).length.toLocaleString()}개 단어)에서 나와요`; start(); }
    else { $("lcount").textContent = `문제는 지금 조건(${filtered().length.toLocaleString()}개 단어)에서 나와요`; quiz(); }
  }
  let tmr;
  $("q").oninput = () => { clearTimeout(tmr); tmr = setTimeout(refresh, 200); };
  for (const [id, k] of [["pos", "zw_pos"], ["st", "zw_st"]]) $(id).onchange = e => { store.set(k, e.target.value); refresh(); };
  $("ord").onchange = e => { store.set("zw_ord", e.target.value); rnd = new Map(); refresh(); };
  stats();
  setMode(mode);
})();
