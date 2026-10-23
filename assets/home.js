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
  // 언어별 자료실 (같은 사이트 안의 페이지)
  const MATS = { zh: { emoji: "📂", title: "원어민 중국어 회화 공부 자료실", desc: "2025년 10월부터 모은 대화문·대본·녹음 38회 · 병음으로 읽기", url: "materials.html" } };
  const matCard = code => { const x = MATS[code]; return x ? `<a class="sitecard mat" href="${esc(x.url)}">
      <span class="em">${esc(x.emoji)}</span><span><b>${esc(x.title)}</b><span class="d">${esc(x.desc)}</span></span><span class="go">›</span></a>` : ""; };
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
      ${matCard(lang)}
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
      <div class="stat"><b>${totalWords}</b><span>모은 단어</span></div>
    </div>
    <nav class="langnav">${Object.entries(LANGS).map(([c, L]) => `<a href="#lang-${c}">${L.flag} ${L.name} <b>${byLang(c).length}</b></a>`).join("")}</nav>`;
  for (const [code, L] of Object.entries(LANGS)) {
    const list = byLang(code);
    html += `<section class="langsec" id="lang-${code}">
      <div class="langhead"><h3>${L.flag} ${L.name} <span>${L.native}</span></h3>
        ${list.length ? `<a href="./?lang=${code}">전체 ${list.length}개 보기 ›</a>` : ""}</div>
      ${list.length ? latestCard(list[0]) : `<div class="card empty">아직 강의가 없어요.<br><span class="hint">유튜브 링크와 transcript를 주시면 이곳에 추가돼요.</span></div>`}
      ${matCard(code)}
      ${siteCards(code)}
    </section>`;
  }
  app.innerHTML = html;
})();
