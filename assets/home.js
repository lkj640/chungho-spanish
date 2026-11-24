// 홈: 언어별 최신 강의 하나씩 · ?lang=xx 이면 그 언어의 전체 강의 목록
(async () => {
  const { LANGS, esc, fmtDate, store, loadIndex } = U;
  const app = document.getElementById("app");
  let all;
  try { all = (await loadIndex()).lessons; } catch { app.innerHTML = '<p class="hint">강의 목록을 불러오지 못했어요. 새로고침해 주세요.</p>'; return; }
  all.forEach(l => { l.lang = l.lang || "es"; });

  const done = store.get("done", {});
  const link = l => `lesson.html?d=${l.id}`;
  const byLang = code => all.filter(l => l.lang === code);
  const lang = new URLSearchParams(location.search).get("lang");
  // 언어별로 함께 보는 다른 공부 사이트
  const SITES = {
    es: [{ emoji: "🥕", title: "당근 스페인어 스터디", desc: "매주 일요일 오전 10시 · 팟캐스트 듣기와 학습 교재", url: "https://lkj640.github.io/carrot_spanish/" }],
    zh: [{ emoji: "🥕", title: "당근 중국어 스터디", desc: "매주 목요일 저녁 · 중국어 회화 듣기와 학습 교재", url: "https://lkj640.github.io/carrot_chinese/" }],
  };
  // 통합 단어장 카드: 오늘 복습할 단어 수(이 기기 기록)를 함께 보여줘요
  const srs = store.get("srs", {});
  const todayN = (d => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5))(new Date());
  const dueN = code => Object.entries(srs).filter(([k, v]) => k.startsWith(code + "|") && v.d <= todayN).length;
  const vocabCard = code => {
    if (!byLang(code).length) return "";
    const due = dueN(code);
    if (code === "es") return `<a class="sitecard mat vocabcard" href="wordbook.html#list">
      <span class="em">📗</span><span><b>스페인어 단어장 · 오늘 복습${due ? ` <span class="chip red">${due}개</span>` : ""}</b><span class="d">엑셀 단어장 4,389개 + 강의 단어 · 한국어 뜻 · 동사 활용표 · 간격 반복(SRS) 복습</span></span><span class="go">›</span></a>`;
    // 중국어·일본어는 엑셀 단어장 + 강의 단어를 합친 단어장 하나로 복습해요 (예전 통합 단어장 기록은 단어장을 처음 열 때 옮겨져요)
    const XB = {
      zh: { pre: "zw_", url: "zhwords.html", em: "📕", t: "중국어 단어장", d: "HSK 1~5급 2,506개 + 강의 단어 · 급수·품사별 찾기 · 병음 검색 · 카드 복습(SRS) · 4지선다 퀴즈" },
      ja: { pre: "jw_", url: "jawords.html", em: "📘", t: "일본어 단어장", d: "초급·중급 2,382개 + 강의 단어 · 레벨·품사별 찾기 · 가나로 검색 · 카드 복습(SRS) · 4지선다 퀴즈" },
    }[code];
    if (XB) {
      const n = Object.values(store.get(XB.pre + "srs", {})).filter(v => v.d <= todayN).length + (store.get(XB.pre + "mig", 0) ? 0 : due);
      return `<a class="sitecard mat vocabcard" href="${XB.url}${n ? "#review" : ""}">
      <span class="em">${XB.em}</span><span><b>${XB.t} · 오늘 복습${n ? ` <span class="chip red">${n}개</span>` : ""}</b><span class="d">${XB.d}</span></span><span class="go">›</span></a>`;
    }
    return `<a class="sitecard mat vocabcard" href="vocab.html?lang=${code}">
      <span class="em">📇</span><span><b>통합 단어장 · 오늘 복습${due ? ` <span class="chip red">${due}개</span>` : ""}</b><span class="d">모든 강의 단어를 간격 반복(SRS) 카드로 복습</span></span><span class="go">›</span></a>`;
  };
  const siteCards = code => (SITES[code] || []).map(x => `<a class="sitecard" href="${esc(x.url)}" target="_blank" rel="noopener">
      <span class="em">${esc(x.emoji)}</span><span><b>${esc(x.title)}</b><span class="d">${esc(x.desc)}</span></span><span class="go">↗</span></a>`).join("");

  const latestCard = l => `<section class="card latest">
      <div class="chips"><span class="chip red">🆕 최신</span><span class="chip">${fmtDate(l.date)}</span>
        <span class="chip yel">${esc(l.level || "")}</span>${l.duration ? `<span class="chip">⏱ ${esc(l.duration)}</span>` : ""}
        ${done[l.id] ? '<span class="chip green">✓ 완료</span>' : ""}</div>
      <h2>${esc(l.emoji || "")} ${esc(l.title)}</h2>
      <div class="es" lang="${esc(l.lang)}">${esc(l.es || "")}</div>
      <p>${esc(l.summary || "")}</p>
      <div class="btns">
        <a class="btn primary" href="${link(l)}#listen">🎧 듣기</a>
        <a class="btn" href="${link(l)}#grammar">📘 정리</a>
        <a class="btn" href="${link(l)}#vocab">📝 단어장</a>
        <a class="btn" href="${link(l)}#quiz">✏️ 퀴즈</a>
      </div>
    </section>`;

  const item = l => `<a class="item" href="${link(l)}">
      <div class="em">${esc(l.emoji || "📗")}</div>
      <div><div class="d">${fmtDate(l.date)} · ${esc(l.channel || "")} · ${esc(l.level || "")}${l.duration ? " · " + esc(l.duration) : ""}</div>
        <div class="t">${esc(l.title)}</div><div class="d" lang="${esc(l.lang)}">${esc(l.es || "")}</div></div>
      <div class="go">${done[l.id] ? "✅" : "›"}</div></a>`;

  // ---------- 언어별 전체 목록 ----------
  if (lang && LANGS[lang]) {
    const L = LANGS[lang], list = byLang(lang);
    document.title = `${L.name} · 충호의 어학 열공 사이트`;
    app.innerHTML = `<p><a class="back" href="./">‹ 홈</a></p>
      <h2 class="langT">${L.flag} ${L.name} <span>${L.native} · 강의 ${list.length}개 · 완료 ${list.filter(l => done[l.id]).length}개</span></h2>
      ${list.length > 4 ? '<input class="search" id="q" type="search" placeholder="제목·표현으로 찾기">' : ""}
      ${vocabCard(lang)}
      <div id="lst"></div>
      ${siteCards(lang)}`;
    const render = (f = "") => {
      f = f.trim().toLowerCase();
      const rows = list.filter(l => !f || [l.title, l.es, l.channel, ...(l.topics || [])].join(" ").toLowerCase().includes(f));
      let out = "", month = "";
      for (const l of rows) {
        const m = l.date.slice(0, 7);
        if (m !== month) { month = m; out += `<div class="month">${+m.slice(0, 4)}년 ${+m.slice(5)}월</div>`; }
        out += item(l);
      }
      document.getElementById("lst").innerHTML = out ? `<div class="list">${out}</div>`
        : `<p class="hint">${list.length ? "찾는 강의가 없어요." : "아직 강의가 없어요. 유튜브 링크와 transcript를 주시면 추가돼요."}</p>`;
    };
    render();
    const q = document.getElementById("q");
    if (q) q.oninput = () => render(q.value);
    return;
  }

  // ---------- 홈 ----------
  const totalWords = all.reduce((a, l) => a + (l.vocabCount || 0), 0);
  let html = `<div class="stats">
      <div class="stat"><b>${all.length}</b><span>전체 강의</span></div>
      <div class="stat"><b>${all.filter(l => done[l.id]).length}</b><span>공부 완료</span></div>
      <a class="stat" href="vocab.html" style="text-decoration:none;color:inherit"><b>${totalWords}</b><span>모은 단어 · 복습 ›</span></a>
    </div>
    <nav class="langnav">${Object.entries(LANGS).map(([c, L]) => `<a href="#lang-${c}">${L.flag} ${L.name} <b>${byLang(c).length}</b></a>`).join("")}</nav>`;
  for (const [code, L] of Object.entries(LANGS)) {
    const list = byLang(code);
    html += `<section class="langsec" id="lang-${code}">
      <div class="langhead"><h3>${L.flag} ${L.name} <span>${L.native}</span></h3>
        ${list.length ? `<a href="./?lang=${code}">전체 ${list.length}개 보기 ›</a>` : ""}</div>
      ${list.length ? latestCard(list[0]) : `<div class="card empty">아직 강의가 없어요.<br><span class="hint">유튜브 링크와 transcript를 주시면 이곳에 추가돼요.</span></div>`}
      ${vocabCard(code)}
      ${siteCards(code)}
    </section>`;
  }
  app.innerHTML = html;
})();
