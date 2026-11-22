// 스페인어 단어장(엑셀에서 옮김): wordbook/es.json
// 단어 = [성별 관사, 스페인어, 영어 뜻, 품사, 레벨, (동사) 활용 20칸]
// 활용 32칸: 현재분사, 과거분사, 현재 6, 단순과거 6, 불완료과거 6, 현재완료 6, 단순미래 6
(async () => {
  const { esc, store, say } = U;
  const $ = id => document.getElementById(id);
  let D;
  try { D = await fetch("wordbook/es.json", { cache: "no-cache" }).then(r => r.json()); }
  catch { $("lcount").textContent = "단어장을 불러오지 못했어요. 새로고침해 주세요."; return; }

  const plain = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const W = D.words.map((a, i) => ({ i, g: a[0], w: a[1], en: a[2], pos: a[3] ? a[3].split(",") : [], lvl: a[4], cj: a[5] || null, ko: (D.ko || [])[i] || "" }));
  for (const i of D.autoLvl || []) W[i].est = true; // 원본에 레벨이 없어서 추정해 넣은 단어
  W.forEach(w => { w.s = plain(`${w.w} ${w.en} ${w.ko}`); w.k = `${w.w}|${w.en}`; });

  const KK = "wb_es_known";
  const known = store.get(KK, {});
  const saveKnown = () => store.set(KK, known);
  const isKnown = w => !!known[w.k];

  // ---------- 필터 ----------
  const LV = ["A1", "A2", "B1", "B2", "C1", "C2", ""];
  const lvName = l => l || "레벨 없음";
  const selLv = new Set(store.get("wb_lv", []));
  const POS = [...new Set(W.flatMap(w => w.pos))].sort((a, b) => W.filter(w => w.pos.includes(b)).length - W.filter(w => w.pos.includes(a)).length);
  $("pos").innerHTML = `<option value="">모든 품사</option>` + POS.map(p => `<option>${esc(p)}</option>`).join("");
  $("pos").value = store.get("wb_pos", "");
  $("st").value = store.get("wb_st", "all");
  $("ord").value = store.get("wb_ord", "orig");
  const lvCount = l => W.filter(w => w.lvl === l).length;
  function drawLv() {
    $("lvls").innerHTML = `<button data-l="*" aria-pressed="${!selLv.size}">모든 레벨</button>` +
      LV.filter(l => lvCount(l)).map(l => `<button data-l="${l}" aria-pressed="${selLv.has(l)}">${lvName(l)} <small>${lvCount(l)}</small></button>`).join("");
  }
  for (const l of [...selLv]) if (!lvCount(l)) selLv.delete(l);
  drawLv();
  $("lvls").onclick = e => {
    const b = e.target.closest("button"); if (!b) return;
    const l = b.dataset.l;
    if (l === "*") selLv.clear(); else selLv.has(l) ? selLv.delete(l) : selLv.add(l);
    store.set("wb_lv", [...selLv]); drawLv(); refresh();
  };

  let rnd = new Map();
  function filtered() {
    const f = plain($("q").value.trim()), pos = $("pos").value, st = $("st").value, ord = $("ord").value;
    let rows = W.filter(w => (!selLv.size || selLv.has(w.lvl)) && (!pos || w.pos.includes(pos))
      && (st === "all" || (st === "known") === isKnown(w)) && (!f || w.s.includes(f)));
    if (f) { // 검색어로 시작하는 단어를 먼저
      const pw = w => plain(w.w);
      rows.sort((a, b) => (pw(a) === f ? 0 : pw(a).startsWith(f) ? 1 : 2) - (pw(b) === f ? 0 : pw(b).startsWith(f) ? 1 : 2) || a.i - b.i);
    } else if (ord === "abc") rows.sort((a, b) => plain(a.w).localeCompare(plain(b.w), "es") || a.i - b.i);
    else if (ord === "rnd") { rows.forEach(w => { if (!rnd.has(w.i)) rnd.set(w.i, Math.random()); }); rows.sort((a, b) => rnd.get(a.i) - rnd.get(b.i)); }
    return rows;
  }

  // ---------- 통계 ----------
  function stats() {
    const k = W.filter(isKnown).length;
    const byLv = LV.slice(0, 6).map(l => { const t = W.filter(w => w.lvl === l), n = t.filter(isKnown).length; return `${l} ${n}/${t.length}`; }).join(" · ");
    $("vstats").innerHTML = `<div class="stats four">
      <div class="stat"><b>${W.length.toLocaleString()}</b><span>전체 단어</span></div>
      <div class="stat"><b>${W.filter(w => w.cj).length}</b><span>활용표 있는 동사</span></div>
      <div class="stat"><b>${k.toLocaleString()}</b><span>외운 단어</span></div>
      <div class="stat"><b>${W.length ? Math.round(k / W.length * 100) : 0}%</b><span>진도</span></div>
    </div><p class="hint">외운 단어 · ${byLv}</p>`;
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
  const tags = w => `<span class="tags">${w.pos.map(p => `<span class="chip">${esc(p)}</span>`).join("")}${w.lvl ? `<span class="chip yel"${w.est ? ' title="원본에 레벨이 없어 추정해 넣었어요"' : ""}>${esc(w.lvl)}${w.est ? " (추정)" : ""}</span>` : ""}</span>`;

  // ---------- 목록 ----------
  let limit = 100, open = new Set(), cur = [];
  function renderList() {
    cur = filtered();
    $("lcount").textContent = `${cur.length.toLocaleString()}개 단어`;
    $("vgrid").innerHTML = cur.length ? cur.slice(0, limit).map(w => `<div class="vcard${isKnown(w) ? " known" : ""}${open.has(w.i) ? " open" : ""}" data-i="${w.i}">
        <div><span class="w" lang="es">${art(w)}${esc(w.w)}</span>
          <button class="say" data-say="${w.i}" aria-label="발음 듣기">🔊</button>${tags(w)}
          <div class="m">${esc(w.ko || w.en)}</div>${w.ko ? `<div class="en">${esc(w.en)}</div>` : ""}</div>
        <div class="acts">${w.cj ? `<button class="k cj" data-cj="${w.i}">활용 ${open.has(w.i) ? "▴" : "▾"}</button>` : ""}
          <button class="k" data-k="${w.i}">${isKnown(w) ? "✓ 외움" : "외웠어요"}</button></div>
        ${w.cj && open.has(w.i) ? conjTable(w) : ""}
      </div>`).join("") : `<p class="hint" style="padding:12px">조건에 맞는 단어가 없어요.</p>`;
    $("more").hidden = cur.length <= limit;
  }
  $("more").onclick = () => { limit += 200; renderList(); };
  $("vgrid").addEventListener("click", e => {
    const t = e.target;
    const s = t.closest("[data-say]"); if (s) return say(sayText(W[+s.dataset.say]), "es");
    const k = t.closest("[data-k]");
    if (k) { const w = W[+k.dataset.k]; if (isKnown(w)) delete known[w.k]; else known[w.k] = 1; saveKnown(); stats(); renderList(); return; }
    const c = t.closest("[data-cj]");
    if (c) { const i = +c.dataset.cj; open.has(i) ? open.delete(i) : open.add(i); renderList(); return; }
    const card = t.closest(".vcard");
    if (card && document.body.classList.contains("cover")) card.classList.toggle("open");
  });
  $("optCover").checked = store.get("wb_cover", false);
  const applyCover = () => document.body.classList.toggle("cover", $("optCover").checked);
  $("optCover").onchange = () => { store.set("wb_cover", $("optCover").checked); applyCover(); };
  applyCover();

  // ---------- 카드 ----------
  const opt = { dir: store.get("wb_dir", "f"), say: store.get("wb_say", true) };
  $("oDir").value = opt.dir; $("oSay").checked = opt.say;
  $("oDir").onchange = e => { opt.dir = e.target.value; store.set("wb_dir", opt.dir); showCard(); };
  $("oSay").onchange = e => { opt.say = e.target.checked; store.set("wb_say", opt.say); };
  let deck = [], card = null, shown = false, done = 0, ok = 0;
  function startDeck() {
    deck = filtered().filter(w => !isKnown(w));
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    deck = deck.slice(0, 20); done = 0; ok = 0;
    nextCard();
  }
  function nextCard() { card = deck.shift() || null; shown = false; showCard(); }
  const fword = w => `<div class="fw" lang="es">${art(w)}${esc(w.w)}</div>`;
  const fmean = w => `<div class="fk">${esc(w.ko || w.en)}</div>${w.ko ? `<div class="en">${esc(w.en)}</div>` : ""}`;
  function showCard() {
    const cv = $("cv");
    if (!card) {
      const left = filtered().filter(w => !isKnown(w)).length;
      cv.innerHTML = `<div class="fcard done wbcard"><div class="fk">${done ? `🎉 ${done}장 끝! (알아요 ${ok}개)` : left ? "카드 20장씩 공부해요" : "이 조건의 단어는 모두 외웠어요 🎉"}</div>
        <p class="hint">${left ? `지금 조건에서 아직 못 외운 단어 ${left.toLocaleString()}개` : "레벨이나 품사를 바꿔 보세요."}</p>
        ${left ? `<div class="btns"><button class="btn primary" id="go">${done ? "20장 더" : "시작하기"}</button></div>` : ""}</div>`;
      if (left) $("go").onclick = startDeck;
      return;
    }
    const w = card;
    cv.innerHTML = `<div class="fcard wbcard${shown ? " open" : ""}">
      <div class="chips"><span class="chip">남은 카드 ${deck.length + 1}</span>${tags(w)}</div>
      ${opt.dir === "f" ? fword(w) : fmean(w)}
      ${shown ? `<div class="fback">${opt.dir === "f" ? fmean(w) : fword(w)}
          <div><button class="say" data-say="${w.i}" aria-label="발음 듣기">🔊</button></div>
          ${w.cj ? conjTable(w) : ""}</div>
        <div class="rate2"><button class="no" data-r="0">몰라요<small> · 다시</small></button><button class="yes" data-r="1">알아요<small> · 외움</small></button></div>`
      : `<div class="btns"><button class="btn primary" id="reveal">답 보기</button>
          ${opt.dir === "f" ? `<button class="say" data-say="${w.i}" aria-label="발음 듣기">🔊</button>` : ""}</div>`}
      <p class="hint keys">키보드: 스페이스 = 답 보기 · 1 몰라요 · 2 알아요</p></div>`;
  }
  function reveal() { if (!card || shown) return; shown = true; showCard(); if (opt.say) say(sayText(card), "es"); }
  function rate(r) {
    if (!card || !shown) return;
    if (r) { known[card.k] = 1; saveKnown(); ok++; done++; stats(); }
    else deck.splice(Math.min(3, deck.length), 0, card);
    nextCard();
  }
  $("cv").addEventListener("click", e => {
    const s = e.target.closest("[data-say]"); if (s) return say(sayText(W[+s.dataset.say]), "es");
    if (e.target.closest("#reveal")) return reveal();
    const r = e.target.closest("[data-r]"); if (r) return rate(+r.dataset.r);
    if (!shown && e.target.closest(".fcard") && !e.target.closest("button")) reveal();
  });
  document.addEventListener("keydown", e => {
    if ($("pane-card").hidden || e.target.matches("input,select,textarea")) return;
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); shown ? rate(1) : reveal(); }
    else if (e.key === "1" || e.key === "2") rate(+e.key - 1);
  });

  // ---------- 모드 · 새로고침 ----------
  let mode = location.hash === "#card" ? "card" : "list";
  function setMode(m) {
    mode = m;
    $("mseg").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.m === m));
    $("pane-list").hidden = m !== "list"; $("pane-card").hidden = m !== "card";
    $("coverL").hidden = m !== "list";
    history.replaceState(null, "", m === "card" ? "#card" : location.pathname + location.search);
    refresh();
  }
  $("mseg").onclick = e => { const b = e.target.closest("button"); if (b) setMode(b.dataset.m); };
  function refresh() {
    limit = 100;
    if (mode === "list") renderList();
    else { $("lcount").textContent = `${filtered().length.toLocaleString()}개 단어 중 못 외운 단어에서 20장씩`; card = null; done = 0; showCard(); }
  }
  let tmr;
  $("q").oninput = () => { clearTimeout(tmr); tmr = setTimeout(refresh, 150); };
  $("pos").onchange = e => { store.set("wb_pos", e.target.value); refresh(); };
  $("st").onchange = e => { store.set("wb_st", e.target.value); refresh(); };
  $("ord").onchange = e => { store.set("wb_ord", e.target.value); rnd = new Map(); refresh(); };
  stats();
  setMode(mode);
})();
