(async () => {
  const { esc, fmtDate, store, loadIndex } = U;
  const app = document.getElementById("app");
  let list;
  try { list = (await loadIndex()).lessons; } catch { app.innerHTML = '<p class="hint">강의 목록을 불러오지 못했어요. 새로고침해 주세요.</p>'; return; }
  if (!list.length) { app.innerHTML = '<p class="hint">아직 강의가 없어요.</p>'; return; }

  const done = store.get("done", {});
  const link = l => `lesson.html?d=${l.date}`;
  const totalWords = list.reduce((a, l) => a + (l.vocabCount || 0), 0);
  const doneCount = list.filter(l => done[l.date]).length;
  const latest = list[0];

  let html = `<div class="stats">
      <div class="stat"><b>${list.length}</b><span>전체 강의</span></div>
      <div class="stat"><b>${doneCount}</b><span>공부 완료</span></div>
      <div class="stat"><b>${totalWords}</b><span>모은 단어</span></div>
    </div>
    <section class="card latest">
      <div class="chips"><span class="chip red">🆕 최신 강의</span><span class="chip">${fmtDate(latest.date)}</span>
        <span class="chip yel">${esc(latest.level || "")}</span>${done[latest.date] ? '<span class="chip green">✓ 완료</span>' : ""}</div>
      <h2>${esc(latest.emoji || "")} ${esc(latest.title)}</h2>
      <div class="es">${esc(latest.es || "")}</div>
      <p>${esc(latest.summary || "")}</p>
      ${latest.topics ? `<ul class="topics">${latest.topics.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
      <div class="btns">
        <a class="btn primary" href="${link(latest)}#listen">🎧 듣기</a>
        <a class="btn" href="${link(latest)}#grammar">📘 문법</a>
        <a class="btn" href="${link(latest)}#vocab">📝 단어장</a>
        <a class="btn" href="${link(latest)}#quiz">✏️ 퀴즈</a>
      </div>
    </section>
    <h3 class="sec">📅 날짜별 강의</h3>
    ${list.length > 4 ? '<input class="search" id="q" type="search" placeholder="제목·표현으로 찾기">' : ""}
    <div id="lst"></div>`;
  app.innerHTML = html;

  function renderList(filter = "") {
    const f = filter.trim().toLowerCase();
    const rows = list.filter(l => !f || [l.title, l.es, l.channel, ...(l.topics || [])].join(" ").toLowerCase().includes(f));
    let out = "", month = "";
    for (const l of rows) {
      const m = l.date.slice(0, 7);
      if (m !== month) { month = m; out += `<div class="month">${+m.slice(0, 4)}년 ${+m.slice(5)}월</div>`; }
      out += `<a class="item" href="${link(l)}">
        <div class="em">${esc(l.emoji || "📗")}</div>
        <div><div class="d">${fmtDate(l.date)} · ${esc(l.channel || "")} · ${esc(l.level || "")}${l.duration ? " · " + esc(l.duration) : ""}</div>
          <div class="t">${esc(l.title)}</div><div class="d">${esc(l.es || "")}</div></div>
        <div class="go">${done[l.date] ? "✅" : "›"}</div></a>`;
    }
    document.getElementById("lst").innerHTML = out ? `<div class="list">${out}</div>` : '<p class="hint">찾는 강의가 없어요.</p>';
  }
  renderList();
  const q = document.getElementById("q");
  if (q) q.oninput = () => renderList(q.value);
})();
