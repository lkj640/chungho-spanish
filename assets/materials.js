// 중국어 자료실: 목록(materials.html) · 병음 리더(materials.html?t=<id>)
(async () => {
  const { esc, fmtDate, store } = U;
  const app = document.getElementById("app");
  const BASE = "materials/zh/";
  let data;
  try { data = await fetch(BASE + "index.json", { cache: "no-cache" }).then(r => r.json()); }
  catch { app.innerHTML = '<p class="hint">자료 목록을 불러오지 못했어요. 새로고침해 주세요.</p>'; return; }
  const sessions = data.sessions;
  const tid = new URLSearchParams(location.search).get("t");

  const kb = n => n > 1e6 ? (n / 1e6).toFixed(1) + "MB" : Math.round(n / 1e3) + "KB";
  const ICON = { pdf: "📄", word: "📝", audio: "🎧" };
  const fileBtns = s => s.files.filter(f => f.kind !== "audio").map(f =>
    `<a class="btn" href="${BASE}${esc(f.path)}" target="_blank" rel="noopener">${ICON[f.kind]} ${esc(f.label)} <span class="hint">${kb(f.size)}</span></a>`).join("");
  const audios = s => s.files.filter(f => f.kind === "audio").map(f =>
    `<div class="audiobox"><div class="hint">🎧 ${esc(f.label)}</div><audio controls preload="none" src="${BASE}${esc(f.path)}"></audio></div>`).join("");

  // 유튜브: 처음엔 썸네일만 보여 주고, 누르면 그 자리에서 재생해요 (페이지가 가볍게)
  const videos = s => (s.videos || []).map(v => `<div class="ytlite" data-id="${esc(v.id)}">
      <button class="ytthumb" aria-label="${esc(v.title)} 재생" style="background-image:url(https://i.ytimg.com/vi/${esc(v.id)}/mqdefault.jpg)"><span class="ytplay">▶</span></button>
      <div class="ytcap">▶ <a href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank" rel="noopener">${esc(v.title)}</a> <span class="hint">Chinese Daily Podcast</span></div>
    </div>`).join("");
  document.addEventListener("click", e => {
    const b = e.target.closest(".ytthumb"); if (!b) return;
    const box = b.closest(".ytlite");
    b.outerHTML = `<div class="ytbox"><iframe src="https://www.youtube.com/embed/${esc(box.dataset.id)}?autoplay=1&rel=0&playsinline=1" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="YouTube"></iframe></div>`;
  });

  // ---------- 병음 리더 ----------
  if (tid) {
    const s = sessions.find(x => x.texts.some(t => t.id === tid));
    const T = s && await fetch(`${BASE}${tid}.json`).then(r => r.ok ? r.json() : null).catch(() => null);
    if (!T) { app.innerHTML = '<p><a class="back" href="materials.html">‹ 자료실</a></p><h1>자료를 찾을 수 없어요</h1>'; return; }
    document.title = `${T.title} · 중국어 자료실`;
    const order = [...new Set(T.lines.map(l => l.s).filter(Boolean))];
    const ruby = rb => rb.map(([c, p]) => p ? `<ruby>${esc(c)}<rt>${esc(p)}</rt></ruby>` : esc(c)).join("");
    app.innerHTML = `<div class="hero">
        <p><a class="back" href="materials.html#d${esc(s.date)}">‹ 📂 중국어 자료실</a></p>
        <div class="chips"><span class="chip">${fmtDate(s.date)}</span>${s.tags.map(t => `<span class="chip yel">${esc(t)}</span>`).join("")}</div>
        <h1>${esc(T.title)}</h1>
        <div class="es" lang="zh">${esc(s.zh)}</div>
        <p>${esc(s.ko)} — ${esc(s.desc)}</p>
        ${order.length ? `<div class="cast">등장: ${order.map((n, i) => `<b class="sp${i % 3}">${esc(n)}</b>`).join(" · ")}</div>` : ""}
      </div>
      ${videos(s)}
      ${audios(s)}
      <div class="opts">
        <label><input type="checkbox" id="optPy" checked> 병음 보기</label>
        <label><input type="checkbox" id="optHide"> 中文 가리기 (청취·읽기 연습)</label>
      </div>
      <div id="lines">${T.lines.map(l => {
        const i = order.indexOf(l.s);
        return `<div class="line ${i < 0 ? "nar" : "sp" + (i % 3)}">${i < 0 ? "" : `<div class="who">${esc(l.s)}</div>`}
          <div class="txt"><div class="es" lang="zh">${ruby(l.rb)}</div></div></div>`;
      }).join("")}</div>
      <div class="btns" style="margin:24px 0">${fileBtns(s)}</div>
      <p class="hint">※ 병음은 자동으로 붙인 거라 다음자(多音字)는 가끔 틀릴 수 있어요. 문장을 누르면 가리기를 잠깐 풀어요.</p>`;
    const bind = (id, key, def, apply) => { const el = document.getElementById(id); el.checked = store.get(key, def); apply(el.checked); el.onchange = () => { store.set(key, el.checked); apply(el.checked); }; };
    bind("optPy", "opt_py", true, v => document.body.classList.toggle("no-py", !v));
    bind("optHide", "mat_hide", false, v => document.body.classList.toggle("hide-es", v));
    document.getElementById("lines").addEventListener("click", e => { const l = e.target.closest(".line"); if (l) l.classList.toggle("peek"); });
    return;
  }

  // ---------- 목록 ----------
  const nText = sessions.reduce((a, s) => a + s.texts.length, 0);
  const nAudio = sessions.filter(s => s.files.some(f => f.kind === "audio")).length;
  const nVideo = sessions.filter(s => (s.videos || []).length).length;
  let html = `<div class="hero">
      <p><a class="back" href="./?lang=zh">‹ 🇨🇳 중국어</a></p>
      <h1>📂 원어민 중국어 회화 공부 자료실</h1>
      <p>2025년 10월부터 모아 온 중국어 대화문·팟캐스트 대본·녹음이에요. 대부분 <a href="https://www.youtube.com/@ChineseDailyPodcast/videos" target="_blank" rel="noopener">Chinese Daily Podcast</a> 영상에서 가져온 거라 원본 영상을 함께 걸어 두었어요. 📖 표시가 있는 자료는 한자 위에 병음을 달아 바로 읽을 수 있어요.</p>
      <div class="stats" style="margin-bottom:0">
        <div class="stat"><b>${sessions.length}</b><span>공부한 날</span></div>
        <div class="stat"><b>${nText}</b><span>병음으로 읽기</span></div>
        <div class="stat"><b>${nVideo}</b><span>유튜브 영상</span></div>
      </div>
    </div>
    <input class="search" id="q" type="search" placeholder="제목·주제로 찾기 (예: 성어, 孤独, 여행)">
    <div id="lst"></div>`;
  app.innerHTML = html;

  function render(f = "") {
    f = f.trim().toLowerCase();
    const rows = sessions.filter(s => !f || [s.zh, s.ko, s.desc, ...s.tags].join(" ").toLowerCase().includes(f));
    let out = "", month = "";
    for (const s of rows) {
      const m = s.date.slice(0, 7);
      if (m !== month) { month = m; out += `<div class="month">${+m.slice(0, 4)}년 ${+m.slice(5)}월</div>`; }
      out += `<section class="card matcard" id="d${esc(s.date)}">
        <div class="chips"><span class="chip">${fmtDate(s.date)}</span>${s.tags.map(t => `<span class="chip yel">${esc(t)}</span>`).join("")}</div>
        <h3 lang="zh">${esc(s.zh)}</h3>
        <div class="ko">${esc(s.ko)}</div>
        <p class="hint">${esc(s.desc)}</p>
        ${videos(s)}
        ${audios(s)}
        <div class="btns">
          ${s.lesson ? `<a class="btn primary" href="lesson.html?d=${esc(s.lesson)}">🎬 강의로 공부하기</a>` : ""}
          ${s.texts.map(t => `<a class="btn primary" href="materials.html?t=${esc(t.id)}">📖 ${s.texts.length > 1 ? esc(t.title) : "병음으로 읽기"}</a>`).join("")}
          ${fileBtns(s)}
        </div>
      </section>`;
    }
    document.getElementById("lst").innerHTML = out || '<p class="hint">찾는 자료가 없어요.</p>';
  }
  render();
  document.getElementById("q").oninput = e => render(e.target.value);
  if (location.hash) { const el = document.querySelector(location.hash); if (el) el.scrollIntoView(); }
})();
