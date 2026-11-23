// 스페인어 단어장 = 엑셀 단어장(wordbook/es.json) + 강의 단어(vocab/es.json · 새 강의는 meta.json) + 간격 반복(SRS) 복습
// 엑셀 단어 = [성별 관사, 스페인어, 영어 뜻, 품사, 레벨, (동사) 활용 32칸]
// 활용 32칸: 현재분사, 과거분사, 현재 6, 단순과거 6, 불완료과거 6, 현재완료 6, 단순미래 6
// 주소: wordbook.html(처음엔 단어 목록) · #review(오늘 복습) · #list(목록) · ?lesson=<강의id> 그 강의 단어만
(async () => {
  const { esc, store, say, loadIndex } = U;
  const $ = id => document.getElementById(id);
  const lang = "es";
  const P = new URLSearchParams(location.search);
  const only = P.get("lesson");
  let D;
  try { D = await fetch("wordbook/es.json", { cache: "no-cache" }).then(r => r.json()); }
  catch { $("lcount").textContent = "단어장을 불러오지 못했어요. 새로고침해 주세요."; return; }

  const plain = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const W = D.words.map((a, i) => ({ i, g: a[0], w: a[1], en: a[2], pos: a[3] ? a[3].split(",") : [], lvl: a[4], cj: a[5] || null,
    ko: (D.ko || [])[i] || "", l: [], lw: [], book: true }));
  for (const i of D.autoLvl || []) W[i].est = "추정"; // 원본에 레벨이 없어서 추정해 넣은 단어

  // ---------- 강의 단어 합치기 ----------
  // 강의 단어 "el boleto / el billete"는 관사·괄호를 빼고 엑셀 단어와 맞춰 봐요. 맞으면 그 단어에 예문·강의를 붙이고, 없으면 새 단어로 넣어요.
  const ART = /^(el|la|los|las|un|una|unos|unas|lo)\s+/;
  const norm = s => plain(s).replace(/\(.*?\)/g, " ").replace(/[¡!¿?.,…]/g, " ").replace(/\s+/g, " ").trim().replace(ART, "")
    .replace(/(\w)\/(a|as|os)$/, "$1");
  const byN = new Map();
  for (const w of W) { const n = norm(w.w); if (n && !byN.has(n)) byN.set(n, w); }
  const titles = {}, lessonLvl = {}, lessonDate = {};
  let LX = { words: [], titles: {} }, idx = [];
  try { LX = await fetch("vocab/es.json", { cache: "no-cache" }).then(r => r.json()); } catch {}
  try { idx = (await loadIndex()).lessons.filter(l => (l.lang || "es") === lang); } catch {}
  Object.assign(titles, LX.titles || {});
  for (const l of idx) { titles[l.id] = l.title; lessonLvl[l.id] = ((l.level || "").match(/[ABC][12]/) || [""])[0]; lessonDate[l.id] = l.date; }
  const lessonWords = [...(LX.words || [])];
  // vocab/es.json 이후에 올라온 강의는 meta.json에서 단어를 바로 가져와요
  try {
    const have = new Set(LX.lessons || []);
    const extra = idx.filter(l => !have.has(l.id) && l.vocabCount).sort((a, b) => (a.date + a.id < b.date + b.id ? -1 : 1));
    const seen = new Map(lessonWords.map(v => [v.w, v]));
    for (const l of extra) {
      const m = await fetch(`lessons/${l.id}/meta.json`, { cache: "no-cache" }).then(r => r.json()).catch(() => null);
      if (!m) continue;
      for (const v of m.vocab || []) {
        const w = (v.es || "").trim(); if (!w) continue;
        if (seen.has(w)) { const x = seen.get(w); if (!x.l.includes(l.id)) x.l.push(l.id); continue; }
        const x = { w, ko: v.ko || "", ex: v.ex || "", exKo: v.exKo || "", l: [l.id], d: l.date };
        seen.set(w, x); lessonWords.push(x);
      }
    }
  } catch {}
  // 「내가 추가한 단어」(wordbook/added-<언어>.json · assets/addword.js)도 강의 단어처럼 합쳐요
  try { const have = new Set(lessonWords.map(v => v.w)); for (const v of await AW.load(lang)) if (!have.has(v.w)) lessonWords.push(v); titles.added = AW.TITLE; } catch {}
  const guessPos = w => {
    const t = plain(w).replace(/\(.*?\)/g, "").trim();
    if (ART.test(t)) return "명사";
    if (!t.includes(" ") && /(ar|er|ir)(se)?$/.test(t)) return "동사";
    if (/^¡.*!$/.test(t)) return "감탄사";
    if (t.includes(" ")) return "표현";
    if (/mente$/.test(t)) return "부사";
    if (/\/(a|as)$|(ado|ido|oso|osa|ble|al|il|ante|ente|ivo|iva|ario|aria|orio|eiforme|forme|uro|ura|io|ia|ico|ica|il)$/.test(t)) return "형용사";
    return "기타";
  };
  let added = 0;
  for (const v of lessonWords) {
    const parts = v.w.split(/\s+\/\s+|\s*;\s*/).map(norm).filter(Boolean);
    const hit = parts.map(n => byN.get(n)).find(Boolean) || byN.get(norm(v.w));
    if (hit) {
      hit.lw.push(v.w);
      for (const id of v.l) if (!hit.l.includes(id)) hit.l.push(id);
      if (!hit.ex && v.ex) { hit.ex = v.ex; hit.exKo = v.exKo; }
      if (!hit.d || v.d > hit.d) hit.d = v.d;
      continue;
    }
    const lvl = lessonLvl[v.l[0]] || "";
    const x = { i: W.length, g: "", w: v.w, en: "", pos: [guessPos(v.w)], lvl, est: lvl ? "강의 수준" : "", cj: null,
      ko: v.ko || "", ex: v.ex || "", exKo: v.exKo || "", l: [...v.l], lw: [v.w], d: v.d || lessonDate[v.l[0]] || "", book: false };
    W.push(x); added++;
    for (const n of parts) if (!byN.has(n)) byN.set(n, x);
  }
  W.forEach(w => {
    w.s = plain(`${w.w} ${w.en} ${w.ko} ${w.ex || ""} ${w.exKo || ""}`);
    w.k = `${w.w}|${w.en}`;
    // 복습 기록 열쇠: 강의 단어였던 것은 예전 통합 단어장 기록을 그대로 이어 써요
    w.keys = [...w.lw.map(x => lang + "|" + x), lang + "|" + (w.g && !w.g.includes("(") ? w.g + " " : "") + w.w];
  });
  const bookN = W.filter(w => w.book).length;

  // ---------- 기록 ----------
  const dayOf = t => { const d = new Date(t); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); };
  const today = dayOf(Date.now());
  const SRS = store.get("srs", {});        // "es|단어" → {i 간격(일), e 쉬움 배수, d 다음 복습일, r 맞힌 횟수, x 틀린 횟수}
  const LOG = store.get("srs_log", {});    // 날짜 → {언어: {n 새 단어, r 복습}}
  const lknown = store.get("known", {});   // 강의 단어장의 「외웠어요」: "강의id|단어"
  const KK = "wb_es_known";
  const known = store.get(KK, {});         // 이 단어장의 「외웠어요」
  const log = LOG[today] = LOG[today] || {};
  log[lang] = log[lang] || { n: 0, r: 0 };
  const saveSrs = () => { store.set("srs", SRS); store.set("srs_log", LOG); };
  const sKey = w => w.keys.find(k => SRS[k]) || null;
  const getS = w => { const k = sKey(w); return k ? SRS[k] : null; };
  const setS = (w, s) => { SRS[sKey(w) || w.keys[0]] = s; };
  const markedKnown = w => !!known[w.k] || w.l.some(id => w.lw.some(x => lknown[id + "|" + x]));
  const status = w => { const s = getS(w); if (s) return s.i >= 21 ? "known" : "learn"; return markedKnown(w) ? "known" : "new"; };
  const isKnown = w => status(w) === "known";

  // ---------- 필터 ----------
  const LV = ["A1", "A2", "B1", "B2", "C1", "C2", ""];
  const lvName = l => l || "레벨 없음";
  const selLv = new Set(store.get("wb_lv", []));
  const lvCount = l => W.filter(w => w.lvl === l).length;
  const POS = [...new Set(W.flatMap(w => w.pos))].filter(Boolean)
    .sort((a, b) => W.filter(w => w.pos.includes(b)).length - W.filter(w => w.pos.includes(a)).length);
  $("pos").innerHTML = `<option value="">모든 품사</option>` + POS.map(p => `<option>${esc(p)}</option>`).join("");
  const setSel = (id, k, def) => { const v = store.get(k, def); $(id).value = v; if ($(id).value !== v) $(id).value = def; };
  setSel("pos", "wb_pos", ""); setSel("st", "wb_st", "all"); setSel("ord", "wb_ord", "orig"); setSel("src", "wb_src", "all");
  for (const l of [...selLv]) if (!lvCount(l)) selLv.delete(l);
  function drawLv() {
    $("lvls").innerHTML = `<button data-l="*" aria-pressed="${!selLv.size}">모든 레벨</button>` +
      LV.filter(l => lvCount(l)).map(l => `<button data-l="${l}" aria-pressed="${selLv.has(l)}">${lvName(l)} <small>${lvCount(l)}</small></button>`).join("");
  }
  drawLv();
  $("lvls").onclick = e => {
    const b = e.target.closest("button"); if (!b) return;
    const l = b.dataset.l;
    if (l === "*") selLv.clear(); else selLv.has(l) ? selLv.delete(l) : selLv.add(l);
    store.set("wb_lv", [...selLv]); drawLv(); refresh();
  };
  if (only) $("scope").innerHTML = `이 강의 단어만: <b>${esc(titles[only] || only)}</b> · <a href="wordbook.html">전체 보기</a>`;

  // 강의 단어를 최근(또는 오래된) 강의 순으로 — 한 강의 안의 순서는 그대로
  const lessonOrder = (rows, newest) => {
    const g = new Map();
    for (const w of rows) { const k = w.d || ""; if (!g.has(k)) g.set(k, []); g.get(k).push(w); }
    const ks = [...g.keys()].sort(); if (newest) ks.reverse();
    return ks.flatMap(k => g.get(k));
  };
  let rnd = new Map();
  function filtered({ forList = true } = {}) {
    const f = plain($("q").value.trim()), pos = $("pos").value, st = $("st").value, src = $("src").value, ord = $("ord").value;
    let rows = W.filter(w => (!only || w.l.includes(only)) && (!selLv.size || selLv.has(w.lvl)) && (!pos || w.pos.includes(pos))
      && (src === "all" || (src === "lesson") === !!w.l.length) && (!forList || st === "all" || (st === "known") === isKnown(w))
      && (!f || w.s.includes(f)));
    if (!forList) return rows;
    if (f) {
      const r = w => { const p = plain(w.w).replace(ART, ""); return p === f ? 0 : p.startsWith(f) ? 1 : plain(w.ko).includes(f) ? 2 : 3; };
      rows.sort((a, b) => r(a) - r(b) || a.i - b.i);
    } else if (ord === "abc") rows.sort((a, b) => plain(a.w).replace(ART, "").localeCompare(plain(b.w).replace(ART, ""), "es") || a.i - b.i);
    else if (ord === "recent") rows = [...lessonOrder(rows.filter(w => w.l.length), true), ...rows.filter(w => !w.l.length)];
    else if (ord === "rnd") { rows.forEach(w => { if (!rnd.has(w.i)) rnd.set(w.i, Math.random()); }); rows.sort((a, b) => rnd.get(a.i) - rnd.get(b.i)); }
    return rows;
  }

  // ---------- 통계 ----------
  function stats() {
    const c = { due: 0, learn: 0, known: 0 };
    for (const w of W) { const s = getS(w), st = status(w); if (st !== "new") c[st]++; if (s && s.d <= today) c.due++; }
    let streak = 0;
    for (let d = today - (LOG[today]?.[lang]?.r || LOG[today]?.[lang]?.n ? 0 : 1); LOG[d]?.[lang] && (LOG[d][lang].r || LOG[d][lang].n); d--) streak++;
    const byLv = LV.slice(0, 6).map(l => { const t = W.filter(w => w.lvl === l); return `${l} ${t.filter(isKnown).length}/${t.length}`; }).join(" · ");
    $("vstats").innerHTML = `<div class="stats four">
      <div class="stat"><b>${W.length.toLocaleString()}</b><span>전체 단어</span></div>
      <div class="stat"><b>${c.due}</b><span>오늘 복습</span></div>
      <div class="stat"><b>${c.learn.toLocaleString()}</b><span>공부 중</span></div>
      <div class="stat"><b>${c.known.toLocaleString()}</b><span>외운 단어</span></div>
    </div><p class="hint">엑셀 단어장 ${bookN.toLocaleString()}개 + 강의에서 새로 들어온 단어 ${added.toLocaleString()}개 · 오늘 새 단어 ${log[lang].n}개 · 복습 ${log[lang].r}번 · 연속 ${streak}일<br>외운 단어 · ${byLv}</p>`;
  }

  // ---------- 화면 조각 ----------
  const art = w => w.g ? `<span class="art">${esc(w.g)}</span> ` : "";
  const sayText = w => (w.g && !w.g.includes("(") ? w.g.replace("/", " ") + " " : "") + w.w;
  const PER = ["yo", "tú", "él/ella/usted", "nosotros", "vosotros", "ellos/ustedes"];
  const conjTable = w => {
    const c = w.cj;
    return `<div class="conj"><table lang="es"><tr><th></th><th>현재</th><th>현재완료</th><th>단순과거</th><th>불완료과거</th><th>단순미래</th></tr>
      ${PER.map((p, j) => `<tr><th>${p}</th><td>${esc(c[2 + j])}</td><td>${esc(c[20 + j] || "")}</td><td>${esc(c[8 + j])}</td><td>${esc(c[14 + j])}</td><td>${esc(c[26 + j] || "")}</td></tr>`).join("")}
      </table><p class="np">현재분사 <b lang="es">${esc(c[0])}</b> · 과거분사 <b lang="es">${esc(c[1])}</b><span class="swipe"> · 표는 옆으로 밀면 더 보여요 →</span></p></div>`;
  };
  const tags = w => `<span class="tags">${w.pos.map(p => `<span class="chip">${esc(p)}</span>`).join("")}${w.lvl ? `<span class="chip yel"${w.est ? ` title="${w.est === "추정" ? "원본에 레벨이 없어 추정해 넣었어요" : "이 단어가 나온 강의의 수준이에요"}"` : ""}>${esc(w.lvl)}${w.est ? ` (${w.est})` : ""}</span>` : ""}${!w.book ? '<span class="chip red">강의</span>' : ""}</span>`;
  const lessonLinks = w => w.l.map(id => AW.link(id, titles)).join(" · ");
  const exBlock = w => w.ex ? `<div class="x"><div lang="es">${esc(w.ex)} <button class="say" data-sayx="${w.i}" aria-label="예문 듣기">🔊</button></div><div class="ko">${esc(w.exKo || "")}</div>${w.l.length ? `<div class="src">📗 ${lessonLinks(w)}</div>` : ""}</div>`
    : w.l.length ? `<div class="x"><div class="src">📗 ${lessonLinks(w)}</div></div>` : "";
  const meanHtml = (w, cls) => `<div class="${cls}">${esc(w.ko || w.en)}</div>${w.ko && w.en ? `<div class="en">${esc(w.en)}</div>` : ""}`;
  const ivl = i => i === 0 ? "곧 다시" : i < 30 ? `${i}일` : i < 365 ? `${Math.round(i / 30)}달` : `${(i / 365).toFixed(1)}년`;

  // ---------- 목록 ----------
  let limit = 100, open = new Set(), cur = [];
  function renderList() {
    cur = filtered();
    $("lcount").textContent = `${cur.length.toLocaleString()}개 단어`;
    $("vgrid").innerHTML = cur.length ? cur.slice(0, limit).map(w => {
      const s = getS(w), st = status(w);
      const srsTag = st === "learn" ? `<span class="chip">${s.d <= today ? "오늘 복습" : ivl(s.d - today) + " 뒤 복습"}</span>` : "";
      return `<div class="vcard${st === "known" ? " known" : ""}${open.has(w.i) ? " open" : ""}" data-i="${w.i}">
        <div><span class="w" lang="es">${art(w)}${esc(w.w)}</span>
          <button class="say" data-say="${w.i}" aria-label="발음 듣기">🔊</button>${tags(w)}${srsTag}
          ${meanHtml(w, "m")}</div>
        <div class="acts">${w.cj ? `<button class="k cj" data-cj="${w.i}">활용 ${open.has(w.i) ? "▴" : "▾"}</button>` : ""}
          <button class="k" data-k="${w.i}">${st === "known" ? "✓ 외움" : "외웠어요"}</button></div>
        ${w.cj && open.has(w.i) ? conjTable(w) : ""}
        ${exBlock(w)}
      </div>`;
    }).join("") : `<p class="hint" style="padding:12px">조건에 맞는 단어가 없어요.</p>`;
    $("more").hidden = cur.length <= limit;
  }
  $("more").onclick = () => { limit += 200; renderList(); };
  const sayClick = e => {
    const s = e.target.closest("[data-say]"); if (s) { say(sayText(W[+s.dataset.say]), lang); return true; }
    const x = e.target.closest("[data-sayx]"); if (x) { say(W[+x.dataset.sayx].ex, lang); return true; }
    return false;
  };
  $("vgrid").addEventListener("click", e => {
    if (sayClick(e)) return;
    const t = e.target;
    const k = t.closest("[data-k]");
    if (k) {
      const w = W[+k.dataset.k];
      if (isKnown(w)) {
        delete known[w.k];
        for (const id of w.l) for (const x of w.lw) delete lknown[id + "|" + x];
        const s = getS(w); if (s && s.i >= 21) delete SRS[sKey(w)];
        store.set("known", lknown); saveSrs();
      } else known[w.k] = 1;
      store.set(KK, known); stats(); renderList(); return;
    }
    const c = t.closest("[data-cj]");
    if (c) { const i = +c.dataset.cj; open.has(i) ? open.delete(i) : open.add(i); renderList(); return; }
    const card = t.closest(".vcard");
    if (card && !t.closest("a") && document.body.classList.contains("cover")) card.classList.toggle("open");
  });
  $("optCover").checked = store.get("wb_cover", false);
  const applyCover = () => document.body.classList.toggle("cover", $("optCover").checked);
  $("optCover").onchange = () => { store.set("wb_cover", $("optCover").checked); applyCover(); };
  applyCover();

  // ---------- 오늘 복습 (간격 반복) ----------
  const opt = { dir: store.get("srs_dir", "f"), nnew: store.get("srs_new", 10), ord: store.get("wb_srs_ord", store.get("srs_ord", "new")), say: store.get("srs_say", true) };
  $("oDir").value = opt.dir; $("oNew").value = opt.nnew; $("oOrd").value = opt.ord; $("oSay").checked = opt.say;
  $("oDir").onchange = e => { opt.dir = e.target.value; store.set("srs_dir", opt.dir); show(); };
  $("oNew").onchange = e => { opt.nnew = +e.target.value; store.set("srs_new", opt.nnew); start(); };
  $("oOrd").onchange = e => { opt.ord = e.target.value; store.set("wb_srs_ord", opt.ord); start(); };
  $("oSay").onchange = e => { opt.say = e.target.checked; store.set("srs_say", opt.say); };
  function next(s, q) { // q: 0 다시 · 1 어려움 · 2 알맞음 · 3 쉬움 (SM-2를 단순하게)
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
  function freshPool() {
    const pool = filtered({ forList: false }).filter(w => status(w) === "new");
    if (opt.ord === "book") return pool;
    return [...lessonOrder(pool.filter(w => w.l.length), opt.ord === "new"), ...pool.filter(w => !w.l.length)];
  }
  function start(extra = 0) {
    const scope = only ? W.filter(w => w.l.includes(only)) : W;
    const due = scope.filter(w => { const s = getS(w); return s && s.d <= today; }).sort((a, b) => getS(a).d - getS(b).d);
    const newLeft = Math.max(0, opt.nnew - log[lang].n) + extra;
    queue = [...due, ...freshPool().slice(0, newLeft)];
    card = null; nextCard();
  }
  function nextCard() { card = queue.shift() || null; shown = false; show(); stats(); }
  const fword = w => `<div class="fw" lang="es">${art(w)}${esc(w.w)}</div>`;
  function show() {
    const rv = $("rv");
    if (!card) {
      const more = freshPool().length;
      rv.innerHTML = `<div class="fcard done wbcard"><div class="fk">🎉 오늘 복습 끝!</div>
        <p class="hint">내일 다시 오면 복습할 단어가 기다리고 있어요.${more ? ` 지금 조건의 새 단어가 ${more.toLocaleString()}개 남았어요.` : ""}</p>
        ${more ? `<div class="btns"><button class="btn primary" id="more10">새 단어 10개 더</button></div>` : ""}</div>`;
      if (more) $("more10").onclick = () => start(10);
      return;
    }
    const w = card, s = getS(w), isNew = !s;
    const prev = q => ivl(next(s, q).i);
    rv.innerHTML = `<div class="fcard wbcard${shown ? " open" : ""}">
      <div class="chips"><span class="chip ${isNew ? "red" : ""}">${isNew ? "새 단어" : "복습"}</span><span class="chip">남은 카드 ${queue.length + 1}</span>${tags(w)}</div>
      ${opt.dir === "f" ? fword(w) : meanHtml(w, "fk")}
      ${shown ? `<div class="fback">${opt.dir === "f" ? meanHtml(w, "fk") : fword(w)}
          <div><button class="say" data-say="${w.i}" aria-label="발음 듣기">🔊</button></div>
          ${w.ex ? `<div class="x"><div lang="es">${esc(w.ex)} <button class="say" data-sayx="${w.i}" aria-label="예문 듣기">🔊</button></div><div class="ko">${esc(w.exKo || "")}</div></div>` : ""}
          ${w.l.length ? `<div class="src">📗 ${lessonLinks(w)}</div>` : ""}
          ${w.cj ? conjTable(w) : ""}</div>
        <div class="rate">
          <button data-q="0" class="q0">다시<small>${prev(0)}</small></button>
          <button data-q="1" class="q1">어려움<small>${prev(1)}</small></button>
          <button data-q="2" class="q2">알맞음<small>${prev(2)}</small></button>
          <button data-q="3" class="q3">쉬움<small>${prev(3)}</small></button>
        </div>`
      : `<div class="btns"><button class="btn primary" id="reveal">답 보기</button>
          ${opt.dir === "f" ? `<button class="say" data-say="${w.i}" aria-label="발음 듣기">🔊</button>` : ""}</div>`}
      <p class="hint keys">키보드: 스페이스 = 답 보기 · 1 다시 · 2 어려움 · 3 알맞음 · 4 쉬움</p></div>`;
  }
  function reveal() { if (!card || shown) return; shown = true; show(); if (opt.say) say(sayText(card), lang); }
  function rate(q) {
    if (!card || !shown) return;
    const wasNew = !getS(card);
    setS(card, next(getS(card), q));
    if (wasNew) log[lang].n++; else log[lang].r++;
    if (q === 0) queue.splice(Math.min(3, queue.length), 0, card);
    saveSrs(); nextCard();
  }
  $("rv").addEventListener("click", e => {
    if (sayClick(e)) return;
    if (e.target.closest("#reveal")) return reveal();
    const r = e.target.closest("[data-q]"); if (r) return rate(+r.dataset.q);
    if (!shown && e.target.closest(".fcard") && !e.target.closest("button,a")) reveal();
  });
  document.addEventListener("keydown", e => {
    if ($("pane-review").hidden || e.target.matches("input,select,textarea")) return;
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); shown ? rate(2) : reveal(); }
    else if ("1234".includes(e.key) && e.key.length === 1) rate(+e.key - 1);
  });

  // ---------- 모드 · 새로고침 ----------
  let mode = location.hash === "#list" ? "list" : location.hash === "#review" ? "review" : "list"; // 주소에 #review가 없으면 단어 목록부터
  function setMode(m) {
    mode = m; store.set("wb_mode", m);
    $("mseg").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.m === m));
    $("pane-list").hidden = m !== "list"; $("pane-review").hidden = m !== "review";
    $("coverL").hidden = m !== "list";
    history.replaceState(null, "", location.pathname + location.search + "#" + m);
    refresh();
  }
  $("mseg").onclick = e => { const b = e.target.closest("button"); if (b) setMode(b.dataset.m); };
  function refresh() {
    limit = 100;
    if (mode === "list") renderList();
    else { $("lcount").textContent = `새 단어는 지금 조건(${filtered({ forList: false }).length.toLocaleString()}개 단어)에서 나와요`; start(); }
  }
  let tmr;
  $("q").oninput = () => { clearTimeout(tmr); tmr = setTimeout(refresh, 200); };
  for (const [id, k] of [["pos", "wb_pos"], ["st", "wb_st"], ["src", "wb_src"]]) $(id).onchange = e => { store.set(k, e.target.value); refresh(); };
  $("ord").onchange = e => { store.set("wb_ord", e.target.value); rnd = new Map(); refresh(); };
  stats();
  setMode(mode);
})();
