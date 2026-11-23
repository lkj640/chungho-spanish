// 통합 단어장: vocab/<언어>.json(모든 강의 단어) + 간격 반복(SRS) 복습
// 주소: vocab.html?lang=es  · 한 강의만: vocab.html?lang=es&lesson=es-2026-11-17-5
(async () => {
  const { LANGS, esc, store, say } = U;
  const $ = id => document.getElementById(id);
  const P = new URLSearchParams(location.search);
  const lang = LANGS[P.get("lang")] ? P.get("lang") : store.get("vocab_lang", "es");
  const only = P.get("lesson");
  // 스페인어는 스페인어 단어장(엑셀 단어장 + 강의 단어)으로 옮겼어요 — 복습 기록은 그대로 이어져요
  if (lang === "es") { location.replace(`wordbook.html${only ? "?lesson=" + encodeURIComponent(only) : ""}#${location.hash === "#list" ? "list" : "review"}`); return; }
  // 중국어·일본어도 각 단어장(엑셀 단어장 + 강의 단어)으로 옮겼어요 — 복습 기록은 단어장에서 이어져요
  if (lang === "zh" || lang === "ja") { location.replace(`${lang}words.html${only ? "?lesson=" + encodeURIComponent(only) : ""}#${location.hash === "#list" ? "list" : "review"}`); return; }
  store.set("vocab_lang", lang);
  document.title = `${LANGS[lang].name} 단어장 · 충호의 어학 열공 사이트`;

  $("ltabs").innerHTML = Object.entries(LANGS).map(([c, L]) =>
    `<button role="tab" aria-selected="${c === lang}" data-l="${c}">${L.flag} ${L.name}</button>`).join("");
  $("ltabs").onclick = e => { const b = e.target.closest("button"); if (b) location.href = `vocab.html?lang=${b.dataset.l}`; };

  let D;
  try { D = await fetch(`vocab/${lang}.json`, { cache: "no-cache" }).then(r => r.json()); }
  catch { $("rv").innerHTML = '<p class="hint">단어를 불러오지 못했어요. 새로고침해 주세요.</p>'; return; }

  // vocab/<언어>.json 이후에 추가된 강의는 meta.json에서 단어를 직접 가져와 합쳐요
  try {
    const have = new Set(D.lessons || []);
    const idx = (await U.loadIndex()).lessons.filter(l => (l.lang || "es") === lang && !have.has(l.id) && l.vocabCount)
      .sort((a, b) => (a.date + a.id < b.date + b.id ? -1 : 1));
    const byW = new Map(D.words.map(w => [w.w, w]));
    for (const l of idx) {
      const m = await fetch(`lessons/${l.id}/meta.json`, { cache: "no-cache" }).then(r => r.json()).catch(() => null);
      if (!m) continue;
      D.titles[l.id] = l.title;
      for (const v of m.vocab || []) {
        const w = (v.es || "").trim(); if (!w) continue;
        if (byW.has(w)) { const x = byW.get(w); if (!x.l.includes(l.id)) x.l.push(l.id); continue; }
        const x = { w, py: v.py || "", ko: v.ko || "", ex: v.ex || "", exKo: v.exKo || "", l: [l.id], d: l.date };
        byW.set(w, x); D.words.push(x);
      }
    }
  } catch {}

  // ---------- 날짜(기기 시간 기준 하루 단위) ----------
  const dayOf = t => { const d = new Date(t); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); };
  const today = dayOf(Date.now());

  // ---------- 기록 ----------
  const SRS = store.get("srs", {});          // "lang|단어" → {i 간격(일), e 쉬움 배수, d 다음 복습일, r 맞힌 횟수, x 틀린 횟수}
  const known = store.get("known", {});     // 강의 단어장의 「외웠어요」: "강의id|단어"
  const LOG = store.get("srs_log", {});     // 날짜 → {n 새 단어, r 복습}
  const key = w => lang + "|" + w.w;
  const save = () => { store.set("srs", SRS); store.set("srs_log", LOG); };
  const log = LOG[today] = LOG[today] || {};
  log[lang] = log[lang] || { n: 0, r: 0 };

  const words = only ? D.words.filter(w => w.l.includes(only)) : D.words;
  const markedKnown = w => w.l.some(id => known[id + "|" + w.w]);
  const status = w => {
    const s = SRS[key(w)];
    if (s) return s.i >= 21 ? "known" : "learn";
    return markedKnown(w) ? "known" : "new";
  };

  if (only) $("scope").innerHTML = `이 강의 단어만: <b>${esc(D.titles[only] || only)}</b> · <a href="vocab.html?lang=${lang}">전체 보기</a>`;

  // ---------- 설정 ----------
  const opt = { dir: store.get("srs_dir", "f"), nnew: store.get("srs_new", 10), ord: store.get("srs_ord", "new"), say: store.get("srs_say", true) };
  $("oDir").value = opt.dir; $("oNew").value = opt.nnew; $("oOrd").value = opt.ord; $("oSay").checked = opt.say;
  $("oDir").onchange = e => { opt.dir = e.target.value; store.set("srs_dir", opt.dir); show(); };
  $("oNew").onchange = e => { opt.nnew = +e.target.value; store.set("srs_new", opt.nnew); start(); };
  $("oOrd").onchange = e => { opt.ord = e.target.value; store.set("srs_ord", opt.ord); start(); };
  $("oSay").onchange = e => { opt.say = e.target.checked; store.set("srs_say", opt.say); };

  // ---------- 간격 계산 (SM-2를 단순하게) ----------
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
  const ivl = i => i === 0 ? "곧 다시" : i < 30 ? `${i}일` : i < 365 ? `${Math.round(i / 30)}달` : `${(i / 365).toFixed(1)}년`;

  // ---------- 통계 ----------
  function stats() {
    const c = { due: 0, new: 0, learn: 0, known: 0 };
    for (const w of words) {
      const s = SRS[key(w)], st = status(w);
      c[st]++;
      if (s && s.d <= today) c.due++;
    }
    let streak = 0;
    for (let d = today - (LOG[today]?.[lang]?.r || LOG[today]?.[lang]?.n ? 0 : 1); LOG[d]?.[lang] && (LOG[d][lang].r || LOG[d][lang].n); d--) streak++;
    $("vstats").innerHTML = `<div class="stats four">
      <div class="stat"><b>${c.due}</b><span>복습할 단어</span></div>
      <div class="stat"><b>${c.learn}</b><span>공부 중</span></div>
      <div class="stat"><b>${c.known}</b><span>외움</span></div>
      <div class="stat"><b>${streak}일</b><span>연속 공부</span></div>
    </div>
    <p class="hint">${LANGS[lang].flag} ${LANGS[lang].name} 단어 ${words.length}개 · 아직 안 본 단어 ${c.new}개 · 오늘 새 단어 ${log[lang].n}개 · 복습 ${log[lang].r}번</p>`;
  }

  // 강의 순서만 뒤집고(최근 강의 먼저), 한 강의 안의 단어 순서는 그대로
  const newestFirst = list => {
    const g = new Map(); list.forEach(w => { if (!g.has(w.l[0])) g.set(w.l[0], []); g.get(w.l[0]).push(w); });
    return [...g.values()].reverse().flat();
  };

  // ---------- 복습 세션 ----------
  let queue = [], cur = null, shown = false, newLeft = 0;
  function start(extra = 0) {
    const due = words.filter(w => { const s = SRS[key(w)]; return s && s.d <= today; })
      .sort((a, b) => SRS[key(a)].d - SRS[key(b)].d);
    let fresh = words.filter(w => status(w) === "new");
    if (opt.ord === "new") fresh = newestFirst(fresh);
    newLeft = Math.max(0, opt.nnew - log[lang].n) + extra;
    queue = [...due, ...fresh.slice(0, newLeft)];
    cur = null; nextCard();
  }
  function nextCard() { cur = queue.shift() || null; shown = false; show(); stats(); }

  const front = w => opt.dir === "f"
    ? `<div class="fw" lang="${lang}">${esc(w.w)}</div>`
    : `<div class="fk">${esc(w.ko)}</div>`;
  const lessonLinks = w => w.l.map(id => `<a href="lesson.html?d=${esc(id)}#vocab">${esc(D.titles[id] || id)}</a>`).join(" · ");

  function show() {
    const rv = $("rv");
    if (!cur) {
      const more = words.filter(w => status(w) === "new").length;
      rv.innerHTML = `<div class="fcard done"><div class="fk">🎉 오늘 복습 끝!</div>
        <p class="hint">내일 다시 오면 복습할 단어가 기다리고 있어요.</p>
        ${more ? `<div class="btns"><button class="btn primary" id="more10">새 단어 10개 더</button></div>` : ""}</div>`;
      if (more) $("more10").onclick = () => start(10);
      return;
    }
    const s = SRS[key(cur)], isNew = !s;
    const prev = q => ivl(next(s, q).i);
    rv.innerHTML = `<div class="fcard${shown ? " open" : ""}">
      <div class="chips"><span class="chip ${isNew ? "red" : ""}">${isNew ? "새 단어" : "복습"}</span><span class="chip">남은 카드 ${queue.length + 1}</span></div>
      ${front(cur)}
      ${shown ? `<div class="fback">
          ${opt.dir === "f" ? `<div class="fk">${esc(cur.ko)}</div>` : `<div class="fw" lang="${lang}">${esc(cur.w)}</div>`}
          ${cur.py ? `<div class="py">${esc(cur.py)}</div>` : ""}
          <div><button class="say" data-say="${esc(cur.w)}" aria-label="발음 듣기">🔊</button></div>
          ${cur.ex ? `<div class="x"><div lang="${lang}">${esc(cur.ex)} <button class="say" data-say="${esc(cur.ex)}" aria-label="예문 듣기">🔊</button></div><div class="ko">${esc(cur.exKo)}</div></div>` : ""}
          <div class="src">📗 ${lessonLinks(cur)}</div>
        </div>
        <div class="rate">
          <button data-q="0" class="q0">다시<small>${prev(0)}</small></button>
          <button data-q="1" class="q1">어려움<small>${prev(1)}</small></button>
          <button data-q="2" class="q2">알맞음<small>${prev(2)}</small></button>
          <button data-q="3" class="q3">쉬움<small>${prev(3)}</small></button>
        </div>`
      : `<div class="btns"><button class="btn primary" id="reveal">답 보기</button>
          ${opt.dir === "f" ? `<button class="say" data-say="${esc(cur.w)}" aria-label="발음 듣기">🔊</button>` : ""}</div>`}
      <p class="hint keys">키보드: 스페이스 = 답 보기 · 1 다시 · 2 어려움 · 3 알맞음 · 4 쉬움</p>
    </div>`;
  }
  function reveal() { if (!cur || shown) return; shown = true; show(); if (opt.say) say(cur.w, lang); }
  function rate(q) {
    if (!cur || !shown) return;
    const k = key(cur), wasNew = !SRS[k];
    SRS[k] = next(SRS[k], q);
    if (wasNew) log[lang].n++; else log[lang].r++;
    if (q === 0) queue.splice(Math.min(3, queue.length), 0, cur); // 틀리면 몇 장 뒤에 다시
    save(); nextCard();
  }
  $("rv").addEventListener("click", e => {
    const sb = e.target.closest("[data-say]");
    if (sb) { say(sb.dataset.say, lang); return; }
    if (e.target.closest("#reveal")) return reveal();
    const r = e.target.closest("[data-q]");
    if (r) return rate(+r.dataset.q);
    if (!shown && e.target.closest(".fcard")) reveal();
  });
  document.addEventListener("keydown", e => {
    if ($("pane-review").hidden || e.target.matches("input,select,textarea")) return;
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); shown ? rate(2) : reveal(); }
    else if ("1234".includes(e.key) && e.key.length === 1) rate(+e.key - 1);
  });

  // ---------- 단어 목록 ----------
  let filt = "all", limit = 100;
  function renderList() {
    const f = $("q").value.trim().toLowerCase();
    let rows = words.filter(w => (filt === "all" || status(w) === filt)
      && (!f || [w.w, w.py, w.ko, w.ex, w.exKo].join(" ").toLowerCase().includes(f)));
    rows = newestFirst(rows);
    $("lcount").textContent = `${rows.length}개 단어 (최근 강의 순)`;
    $("vgrid").innerHTML = rows.slice(0, limit).map(w => {
      const s = SRS[key(w)], st = status(w);
      const tag = st === "new" ? "" : st === "known" ? '<span class="chip green">외움</span>'
        : `<span class="chip">${s.d <= today ? "오늘 복습" : ivl(s.d - today) + " 뒤 복습"}</span>`;
      return `<div class="vcard">
        <div>${w.py ? `<div class="py">${esc(w.py)}</div>` : ""}<span class="w" lang="${lang}">${esc(w.w)}</span>
          <button class="say" data-say="${esc(w.w)}" aria-label="발음 듣기">🔊</button> ${tag}<div class="m">${esc(w.ko)}</div></div>
        <div class="acts"></div>
        ${w.ex ? `<div class="x"><div lang="${lang}">${esc(w.ex)}</div><div class="ko">${esc(w.exKo)}</div><div class="src">📗 ${lessonLinks(w)}</div></div>` : ""}
      </div>`;
    }).join("") || '<p class="hint">해당하는 단어가 없어요.</p>';
    $("more").hidden = rows.length <= limit;
  }
  $("q").oninput = () => { limit = 100; renderList(); };
  $("more").onclick = () => { limit += 100; renderList(); };
  $("fseg").onclick = e => {
    const b = e.target.closest("button"); if (!b) return;
    filt = b.dataset.f; limit = 100;
    $("fseg").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
    renderList();
  };
  $("vgrid").addEventListener("click", e => {
    const sb = e.target.closest("[data-say]");
    if (sb) { say(sb.dataset.say, lang); return; }
    const c = e.target.closest(".vcard"); if (c && !e.target.closest("a")) c.classList.toggle("open");
  });
  const cov = $("optCover");
  cov.checked = store.get("opt_cover", false); document.body.classList.toggle("cover", cov.checked);
  cov.onchange = () => { store.set("opt_cover", cov.checked); document.body.classList.toggle("cover", cov.checked); };

  // ---------- 모드 전환 ----------
  function mode(m) {
    $("mseg").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x.dataset.m === m));
    $("pane-review").hidden = m !== "review"; $("pane-list").hidden = m !== "list";
    if (m === "list") renderList(); else stats();
    history.replaceState(null, "", "#" + m);
  }
  $("mseg").onclick = e => { const b = e.target.closest("button"); if (b) mode(b.dataset.m); };

  start();
  mode(location.hash === "#list" ? "list" : "review");
})();
