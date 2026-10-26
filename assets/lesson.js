(async () => {
  const { LANGS, esc, fmtDate, store, say, fixId } = U;
  const $ = id => document.getElementById(id);
  const fmt = t => { t = Math.max(0, t | 0); return (t / 60 | 0) + ":" + String(t % 60).padStart(2, "0"); };
  let lang = "es";
  const sayBtn = text => `<button class="say" data-say="${esc(text)}" aria-label="발음 듣기">🔊</button>`;
  document.addEventListener("click", e => { const b = e.target.closest("[data-say]"); if (b) { e.stopPropagation(); say(b.dataset.say, lang); } });

  // ---------- 강의 불러오기 ----------
  const id = fixId(new URLSearchParams(location.search).get("d"));
  let L = null;
  if (/^[a-z]{2}-\d{4}-\d{2}-\d{2}(-\d+)?$/.test(id || "")) L = await fetch(`lessons/${id}/data.json`, { cache: "no-cache" }).then(r => r.ok ? r.json() : null).catch(() => null);
  if (!L) {
    $("hero").innerHTML = '<h1>강의를 찾을 수 없어요</h1><p><a href="./">홈으로 돌아가기</a></p>';
    document.querySelectorAll(".pane,.bar,.tabs").forEach(e => e.remove());
    return;
  }
  lang = L.lang || "es";
  const LG = LANGS[lang] || LANGS.es;
  document.documentElement.dataset.lang = lang;
  $("backLink").href = `./?lang=${lang}`;
  $("backLink").textContent = `‹ ${LG.flag} ${LG.name}`;
  const who = L.speakers || {};
  document.title = `${L.title} · ${fmtDate(L.date)} · 충호의 어학 열공 사이트`;
  $("ttl").textContent = `${LG.name} · ${fmtDate(L.date)} · ${L.channel || ""}`;
  $("hero").innerHTML = `<div class="chips"><span class="chip yel">${esc(L.channel || "")}</span><span class="chip">${esc(L.level || "")}</span>${L.duration ? `<span class="chip">⏱ ${esc(L.duration)}</span>` : ""}</div>
    <h1>${esc(L.emoji || "")} ${esc(L.title)}</h1><div class="es" lang="${esc(lang)}">${esc(L.es || "")}</div>
    ${L.summary ? `<p>${esc(L.summary)}</p>` : ""}
    ${Object.keys(who).length && !L.hideCast ? `<div class="cast">출연: ${Object.entries(who).map(([k, v], i) => `<b class="sp${i % 4}">${esc(v)}</b>`).join(" · ")} <span class="ts">※ 화자 구분은 대화 맥락 기준</span></div>` : ""}
    ${L.youtube ? `<p><a href="https://www.youtube.com/watch?v=${esc(L.youtube)}" target="_blank" rel="noopener">▶ 유튜브에서 원본 보기</a></p>` : ""}`;

  // ---------- 탭 ----------
  const tabs = [...document.querySelectorAll(".tabs button")];
  // 퀴즈가 없는 강의는 퀴즈 탭을 숨기고, 토론 주제(discussion)가 있으면 討論 탭을 보여 줘요
  const hasQuiz = (L.quiz || []).length > 0, hasTalk = !!L.discussion;
  tabs.forEach(b => { if (b.dataset.tab === "quiz") b.hidden = !hasQuiz; if (b.dataset.tab === "talk") b.hidden = !hasTalk; });
  const TABS = ["listen", "grammar", "vocab", ...(hasQuiz ? ["quiz"] : []), ...(hasTalk ? ["talk"] : [])];
  function showTab(name) {
    if (!TABS.includes(name)) name = "listen";
    tabs.forEach(b => b.setAttribute("aria-selected", b.dataset.tab === name));
    document.querySelectorAll(".pane").forEach(p => p.classList.toggle("on", p.id === "pane-" + name));
    $("bar").style.display = name === "listen" ? "" : "none";
    window.scrollTo(0, 0);
  }
  tabs.forEach(b => b.onclick = () => { history.replaceState(null, "", "#" + b.dataset.tab); showTab(b.dataset.tab); });
  window.addEventListener("hashchange", () => showTab(location.hash.slice(1)));
  showTab(location.hash.slice(1));

  // ---------- 대본 ----------
  let html = "", opts = '<option value="">📍 구간으로 이동…</option>', n = 0;
  const spk = Object.keys(who);
  // 일본어 후리가나: rb = [[원문 조각, 읽기], …] (읽기는 한자가 있는 조각에만)
  const rubyHtml = rb => rb.map(([o, r]) => r ? `<ruby>${esc(o)}<rt>${esc(r)}</rt></ruby>` : esc(o)).join("");
  (L.sections || []).forEach((s, si) => {
    const t0 = s.lines[0] ? s.lines[0].t : 0;
    html += `<h2 class="secT" id="sec${si}">${esc(s.title)} <span class="hint">${fmt(t0)}</span></h2>`;
    opts += `<option value="${si}">${fmt(t0)} · ${esc(s.title)}</option>`;
    for (const l of s.lines) {
      html += `<div class="line sp${Math.max(0, spk.indexOf(l.s)) % 4}" data-i="${n++}" data-t="${l.t}"><div class="who">${esc(who[l.s] || l.s)}<span class="ts">${fmt(l.t)}</span></div>
        <div class="txt">${l.py && !l.rb ? `<div class="py">${esc(l.py)}</div>` : ""}<div class="es" lang="${esc(lang)}">${l.rb ? rubyHtml(l.rb) : esc(l.es)}</div><div class="ko">${esc(l.ko)}</div></div></div>`;
    }
  });
  $("lines").innerHTML = html;
  $("jump").innerHTML = opts;
  $("jump").onchange = e => { const v = e.target.value; if (v !== "") { $("sec" + v).scrollIntoView({ behavior: "smooth" }); e.target.value = ""; } };
  const lines = [...document.querySelectorAll(".line")];
  const T = lines.map(l => +l.dataset.t);

  // 보기 옵션 (기기에 저장)
  const bindOpt = (id, key, def, apply) => {
    const el = $(id); el.checked = store.get(key, def); apply(el.checked);
    el.onchange = () => { store.set(key, el.checked); apply(el.checked); };
  };
  if (lines.some(l => l.querySelector(".py, rt"))) {
    $("optPyWrap").hidden = false;
    $("optPyWrap").lastChild.textContent = lang === "ja" ? " 후리가나 보기" : " 병음 보기";
    bindOpt("optPy", "opt_py", true, v => document.body.classList.toggle("no-py", !v));
  }
  bindOpt("optKo", "opt_ko", true, v => document.body.classList.toggle("no-ko", !v));
  $("hideLbl").textContent = `${LG.native} 가리기`;
  bindOpt("optHide", "opt_hide", false, v => document.body.classList.toggle("hide-es", v));
  bindOpt("optScroll", "opt_scroll", true, () => {});

  // 글자 크기 (보통 · 크게 · 아주 크게) — 대본·정리·단어장·퀴즈 모두에 적용, 기기에 저장
  const setZoom = z => {
    document.documentElement.style.setProperty("--z", z);
    $("fseg").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.z === z));
  };
  setZoom(store.get("zoom", 1));
  $("fseg").onclick = e => { const b = e.target.closest("[data-z]"); if (b) { store.set("zoom", +b.dataset.z); setZoom(+b.dataset.z); } };

  // ---------- 플레이어: 유튜브 영상 또는 오디오 파일(meta.json의 "audio") ----------
  // 둘 다 있으면 위에 전환 버튼이 생겨요. 고른 쪽은 기기에 저장되고, 처음엔 광고 없는 오디오로 시작해요.
  const paintPlay = () => { $("play").textContent = P.playing() ? "❚❚" : "▶"; };
  const ytBox = document.querySelector(".ytbox");
  const audioBox = document.createElement("div");
  audioBox.className = "audiobox";
  ytBox.after(audioBox);
  const players = {};
  const getPlayer = m => players[m] || (players[m] = m === "yt" ? youtubePlayer() : audioPlayer());
  let mode = !L.youtube ? "audio" : !L.audio ? "yt" : store.get("src", "audio") === "yt" ? "yt" : "audio";
  const showSrc = () => {
    ytBox.hidden = mode !== "yt";
    audioBox.hidden = mode !== "audio";
    document.querySelectorAll(".srcsw button").forEach(b => b.setAttribute("aria-pressed", b.dataset.src === mode));
  };
  let P = getPlayer(mode);
  if (L.youtube && L.audio) {
    const sw = document.createElement("div");
    sw.className = "srcsw";
    sw.setAttribute("role", "group");
    sw.setAttribute("aria-label", "재생 방식");
    sw.innerHTML = '<button type="button" data-src="audio">🎧 MP3 (광고 없음)</button><button type="button" data-src="yt">🎬 유튜브 영상</button>';
    ytBox.before(sw);
    sw.onclick = async e => {
      const b = e.target.closest("[data-src]");
      if (!b || b.dataset.src === mode) return;
      const was = P.playing(), t = P.now();
      if (P.ready()) P.pause();
      mode = b.dataset.src; store.set("src", mode);
      P = getPlayer(mode); showSrc(); paintPlay();
      await P.readyP;
      P.rate(+$("rate").value);
      if (t) P.seek(t);
      if (was) P.play();
      paintPlay();
    };
  }
  showSrc();
  function youtubePlayer() {
    let yt = null, ready = false, state = -1;
    const readyP = new Promise(res => {
      window.onYouTubeIframeAPIReady = () => {
        yt = new YT.Player("yt", {
          videoId: L.youtube,
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
          events: {
            onReady: () => { ready = true; yt.setPlaybackRate(+$("rate").value); res(); },
            onStateChange: e => { state = e.data; paintPlay(); },
          },
        });
      };
    });
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
    return {
      readyP, ready: () => ready,
      playing: () => state === 1 || state === 3,
      now: () => (ready ? yt.getCurrentTime() || 0 : 0),
      dur: () => (ready ? yt.getDuration() : 1e9),
      seek: t => yt.seekTo(Math.max(0, t), true),
      play: () => yt.playVideo(), pause: () => yt.pauseVideo(),
      rate: r => ready && yt.setPlaybackRate(r),
    };
  }
  function audioPlayer() {
    audioBox.innerHTML = `<audio id="au" controls preload="metadata" src="lessons/${esc(L.id)}/${esc(L.audio)}"></audio>`;
    const au = $("au");
    ["play", "pause", "ended"].forEach(ev => au.addEventListener(ev, paintPlay));
    const readyP = new Promise(res => au.readyState >= 1 ? res() : au.addEventListener("loadedmetadata", res, { once: true }));
    readyP.then(() => { au.playbackRate = +$("rate").value; });
    return {
      readyP, ready: () => au.readyState >= 1,
      playing: () => !au.paused,
      now: () => au.currentTime,
      dur: () => au.duration || 1e9,
      seek: t => { au.currentTime = Math.max(0, t); },
      play: () => au.play().catch(() => {}), pause: () => au.pause(),
      rate: r => { au.playbackRate = r; },
    };
  }
  const playing = () => P.playing();
  async function seekPlay(t) { await P.readyP; P.seek(t); P.play(); }

  // ---------- 화면 동기화 ----------
  let cur = -1, loopIdx = -1;
  const idxAt = t => { let lo = 0, hi = T.length - 1, r = -1; while (lo <= hi) { const k = (lo + hi) >> 1; if (T[k] <= t + 0.15) { r = k; lo = k + 1; } else hi = k - 1; } return r; };
  function setActive(i) {
    if (i === cur) return;
    if (cur >= 0) lines[cur].classList.remove("active");
    cur = i;
    if (i < 0) return;
    const l = lines[i];
    l.classList.add("active");
    if ($("optScroll").checked && playing()) l.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  setInterval(() => {
    if (!P.ready()) return;
    const t = P.now();
    if ($("optLoop").checked && loopIdx >= 0 && playing()) {
      const end = loopIdx + 1 < T.length ? T[loopIdx + 1] : P.dur();
      if (t >= end - 0.1 || t < T[loopIdx] - 1) { P.seek(T[loopIdx]); return; }
    }
    setActive(idxAt(t));
    const d = P.dur();
    if (d && d < 1e8) {
      $("curT").textContent = fmt(t); $("durT").textContent = fmt(d);
      if (!dragging) $("seek").value = Math.round(t / d * 1000);
    }
  }, 200);
  let dragging = false;
  $("seek").addEventListener("input", () => { dragging = true; const d = P.dur(); if (d < 1e8) $("curT").textContent = fmt($("seek").value / 1000 * d); });
  $("seek").addEventListener("change", async () => { await P.readyP; const d = P.dur(); if (d < 1e8) P.seek($("seek").value / 1000 * d); dragging = false; });

  $("lines").addEventListener("click", e => {
    const l = e.target.closest(".line"); if (!l) return;
    const i = +l.dataset.i;
    if (document.body.classList.contains("hide-es") && i !== cur) l.classList.toggle("peek");
    loopIdx = i; setActive(i); seekPlay(T[i]);
  });
  $("optLoop").onchange = () => { loopIdx = cur; };
  $("play").onclick = async () => { await P.readyP; if (playing()) P.pause(); else { if (cur < 0 && T.length) P.seek(T[0]); P.play(); } };
  const step = d => { const i = Math.min(T.length - 1, Math.max(0, (cur < 0 ? 0 : cur) + d)); loopIdx = i; setActive(i); seekPlay(T[i]); };
  $("prev").onclick = () => step(-1);
  $("next").onclick = () => step(1);
  $("rate").value = String(store.get("rate", 1));
  P.readyP.then(() => P.rate(+$("rate").value));
  $("rate").onchange = e => { store.set("rate", +e.target.value); P.rate(+e.target.value); };
  document.addEventListener("keydown", e => {
    if (e.target.matches("input,select,textarea") || !$("pane-listen").classList.contains("on")) return;
    if (e.code === "Space") { e.preventDefault(); $("play").click(); }
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
  });

  // 공부 완료 체크
  const done = store.get("done", {});
  const paintDone = () => { $("doneBtn").textContent = done[L.id] ? "✅ 공부 완료! (다시 누르면 취소)" : "🎉 이 강의 공부 완료하기"; };
  $("doneBtn").onclick = () => { if (done[L.id]) delete done[L.id]; else done[L.id] = Date.now(); store.set("done", done); paintDone(); };
  paintDone();

  // ---------- 정리 (문법·표현) ----------
  // 예문은 [원문, 한국어] 또는 [원문, 병음, 한국어]
  const exRow = r => {
    const [src, a, b] = r, py = r.length > 2 ? a : "", ko = r.length > 2 ? b : a;
    return `<div class="ex">${py ? `<div class="py">${esc(py)}</div>` : ""}<div class="es" lang="${esc(lang)}">${esc(src)} ${sayBtn(src)}</div><div class="ko">${esc(ko)}</div></div>`;
  };
  let g = "";
  if (L.pdf) {
    const href = `lessons/${esc(L.id)}/${esc(L.pdf.file)}`;
    g += `<section class="card gcard pdfcard"><h3>📄 공부 자료</h3>
      <p class="lead">${esc(L.pdf.title)}</p>
      ${L.pdf.contents ? `<ol class="pdflist">${L.pdf.contents.map(c => `<li>${esc(c)}</li>`).join("")}</ol>` : ""}
      <div class="btns"><a class="btn primary" href="${href}" download>⬇️ PDF 다운로드</a><a class="btn" href="${href}" target="_blank" rel="noopener">👀 바로 보기</a></div>
    </section>`;
  }
  for (const c of L.grammar || []) {
    g += `<section class="card gcard"><h3>${esc(c.title)}</h3>${c.lead ? `<p class="lead">${c.lead}</p>` : ""}`;
    if (c.table) g += `<div class="tblwrap"><table class="tbl"><thead><tr>${c.table.head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${c.table.rows.map(r => `<tr>${r.map(x => `<td>${esc(x)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    if (c.examples) g += c.examples.map(exRow).join("");
    if (c.tip) g += `<div class="tip">💡 ${esc(c.tip)}</div>`;
    g += `</section>`;
  }
  if (L.phrases && L.phrases.length) {
    g += `<section class="card gcard"><h3>🗣 따라 말해 보기 — 핵심 문장</h3>` +
      L.phrases.map(exRow).join("") + `</section>`;
  }
  $("pane-grammar").innerHTML = g || '<p class="hint">문법 정리가 없어요.</p>';

  // ---------- 단어장 ----------
  const known = store.get("known", {});
  const kkey = v => L.id + "|" + v.es;
  let vfilter = "all";
  const vocab = L.vocab || [];
  $("pane-vocab").innerHTML = `<div class="vtools">
      <div class="seg" id="vseg"><button data-f="all" aria-pressed="true">전체</button><button data-f="todo" aria-pressed="false">못 외운 것</button><button data-f="known" aria-pressed="false">외운 것</button></div>
      <label class="opts" style="margin:0"><input type="checkbox" id="optCover"> 뜻 가리기</label>
      <span class="hint" id="vcount"></span>
    </div><div class="vgrid" id="vgrid"></div>`;
  function renderVocab() {
    const rows = vocab.filter(v => vfilter === "all" || (vfilter === "known") === !!known[kkey(v)]);
    $("vgrid").innerHTML = rows.map(v => {
      const k = !!known[kkey(v)];
      return `<div class="vcard${k ? " known" : ""}" data-k="${esc(kkey(v))}">
        <div>${v.py ? `<div class="py">${esc(v.py)}</div>` : ""}<span class="w" lang="${esc(lang)}">${esc(v.es)}</span> ${sayBtn(v.es)}<div class="m">${esc(v.ko)}</div></div>
        <div class="acts"><button class="k">${k ? "✓ 외웠어요" : "외웠어요"}</button></div>
        ${v.ex ? `<div class="x"><div lang="${esc(lang)}">${esc(v.ex)} ${sayBtn(v.ex)}</div><div class="ko">${esc(v.exKo || "")}</div></div>` : ""}
      </div>`;
    }).join("") || '<p class="hint">해당하는 단어가 없어요.</p>';
    const kn = vocab.filter(v => known[kkey(v)]).length;
    $("vcount").textContent = `${kn} / ${vocab.length} 외움`;
  }
  $("vseg").onclick = e => {
    const b = e.target.closest("button"); if (!b) return;
    vfilter = b.dataset.f;
    $("vseg").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
    renderVocab();
  };
  $("vgrid").addEventListener("click", e => {
    const card = e.target.closest(".vcard"); if (!card) return;
    if (e.target.closest(".k")) {
      const k = card.dataset.k;
      if (known[k]) delete known[k]; else known[k] = 1;
      store.set("known", known); renderVocab();
    } else card.classList.toggle("open");
  });
  bindOpt("optCover", "opt_cover", false, v => document.body.classList.toggle("cover", v));
  renderVocab();

  // ---------- 討論 (일본어만) ----------
  if (hasTalk) {
    const D = L.discussion;
    const R = (rb, txt) => rb ? rb.map(([o, r]) => r ? `<ruby>${esc(o)}<rt>${esc(r)}</rt></ruby>` : esc(o)).join("") : esc(txt || "");
    $("pane-talk").innerHTML = `<section class="card gcard talk">
        <h3>💬 ${esc(D.title || "討論テーマ")}</h3>
        <p class="lead jp">${R(D.introRb, D.intro)}</p>
        <label class="opts" style="margin:0 0 8px"><input type="checkbox" id="optTalkPy" checked> ふりがな</label>
        ${(D.questions || []).map((q, i) => `<div class="tq">
          <div class="tq-n">質問 ${i + 1}</div>
          <div class="tq-q jp">${R(q.rb, q.q)}</div>
          ${(q.hints || []).length ? `<ul class="tq-h">${q.hints.map((h, j) => `<li class="jp">${R((q.hintsRb || [])[j], h)}</li>`).join("")}</ul>` : ""}
        </div>`).join("")}
      </section>
      ${(D.expressions || []).length ? `<section class="card gcard talk"><h3>🗣 討論で使える表現</h3>
        <div class="tblwrap"><table class="tbl"><thead><tr><th>場面</th><th>表現</th></tr></thead><tbody>
        ${D.expressions.map(e => `<tr><td>${esc(e[0])}</td><td class="jp">${R(e[2], e[1])}</td></tr>`).join("")}
        </tbody></table></div></section>` : ""}
      ${D.bonus ? `<section class="card gcard talk"><div class="tip jp">📝 ${R(D.bonusRb, D.bonus)}${D.bonusEx ? `<br><span class="hint">${R(D.bonusExRb, D.bonusEx)}</span>` : ""}</div></section>` : ""}`;
    bindOpt("optTalkPy", "opt_talk_py", true, v => $("pane-talk").classList.toggle("no-rt", !v));
  }

  // ---------- 퀴즈 ----------
  const quiz = L.quiz || [];
  let answered = 0, correct = 0;
  function renderQuiz() {
    answered = 0; correct = 0;
    $("pane-quiz").innerHTML = quiz.length ? `<div class="score" id="score"></div>` +
      quiz.map((q, qi) => `<section class="card qcard" data-q="${qi}">
        <div class="qn">문제 ${qi + 1}</div><div class="q">${esc(q.q)}</div>
        ${q.options.map((o, oi) => `<button class="opt" data-o="${oi}">${esc(o)}</button>`).join("")}
        <div class="explain" hidden>${esc(q.explain || "")}</div></section>`).join("") +
      `<div class="done-box"><button class="btn" id="retry">🔄 다시 풀기</button></div>` : '<p class="hint">퀴즈가 없어요.</p>';
    paintScore();
    const r = $("retry"); if (r) r.onclick = () => { renderQuiz(); window.scrollTo(0, 0); };
  }
  function paintScore() {
    const el = $("score"); if (!el) return;
    el.textContent = answered === quiz.length
      ? `🎯 결과: ${quiz.length}문제 중 ${correct}개 정답! ${correct === quiz.length ? "¡Perfecto! 🎉" : correct >= quiz.length * 0.7 ? "¡Muy bien! 👏" : "¡Ánimo! 다시 도전해 봐요 💪"}`
      : `${answered} / ${quiz.length} 풀었어요 · 정답 ${correct}개`;
  }
  $("pane-quiz").addEventListener("click", e => {
    const b = e.target.closest(".opt"); if (!b || b.disabled) return;
    const card = b.closest(".qcard"), q = quiz[+card.dataset.q], pick = +b.dataset.o;
    card.querySelectorAll(".opt").forEach(o => { o.disabled = true; if (+o.dataset.o === q.answer) o.classList.add("right"); });
    if (pick !== q.answer) b.classList.add("wrong"); else correct++;
    answered++;
    card.querySelector(".explain").hidden = false;
    paintScore();
  });
  renderQuiz();
})();
