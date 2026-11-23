// 단어장에 「내가 추가한 단어」 넣기 (wordbook.html · zhwords.html · jawords.html · vocab.html 이 함께 써요)
// - 검색 결과가 없으면 「＋ 단어장에 추가」 버튼이 나와요. 뜻·예문은 비워 둬도 돼요.
// - 저장: GitHub 저장소의 wordbook/added-<언어>.json (개인 토큰을 한 번 넣어 두면 모든 기기에서 보여요)
//         토큰이 없거나 저장에 실패하면 이 기기에만 임시 저장해 두고, 다음에 토큰이 있을 때 다시 올려요.
// - 뜻이 빈 단어는 매일 자동 작업이 한국어 뜻·예문(중국어 병음·일본어 읽기)을 채워요 (tools/fill_added.py).
// 단어 = { w 단어, py 병음/읽기, ko 뜻, ex 예문, exKo 예문 뜻, d 추가한 날, auto: true(뜻을 자동으로 채울 단어) }
const AW = (() => {
  const REPO = "lkj640/chungho-spanish", BRANCH = "main";
  const path = lang => `wordbook/added-${lang}.json`;
  const store = U.store, esc = U.esc;
  const pendKey = lang => `aw_pending_${lang}`;
  const token = () => store.get("aw_token", "");
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const same = (a, b) => (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();

  // ---------- GitHub 파일 읽고 쓰기 ----------
  const b64dec = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, "")), c => c.charCodeAt(0)));
  const b64enc = s => { const b = new TextEncoder().encode(s); let t = ""; for (let i = 0; i < b.length; i += 0x8000) t += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(t); };
  const api = (p, opt = {}) => fetch(`https://api.github.com/repos/${REPO}/${p}`, { ...opt,
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token()}`, ...(opt.headers || {}) } });
  async function readRemote(lang) {
    const r = await api(`contents/${path(lang)}?ref=${BRANCH}&t=${Date.now()}`);
    if (r.status === 404) return { sha: null, data: { lang, words: [] } };
    if (!r.ok) throw new Error(`읽기 실패 (${r.status})`);
    const j = await r.json();
    return { sha: j.sha, data: JSON.parse(b64dec(j.content)) };
  }
  // 새 단어들을 GitHub 파일에 합쳐서 올려요 (다른 기기·자동 작업과 겹치면 한 번 더 시도)
  async function pushRemote(lang, items) {
    for (let tryN = 0; tryN < 3; tryN++) {
      const { sha, data } = await readRemote(lang);
      data.lang = lang; data.words = data.words || [];
      const fresh = items.filter(x => !data.words.some(w => same(w.w, x.w)));
      if (!fresh.length) return 0;
      data.words.push(...fresh);
      const body = { message: `단어 추가(${lang}): ${fresh.map(x => x.w).join(", ")}`, branch: BRANCH,
        content: b64enc(JSON.stringify(data, null, 1) + "\n"), ...(sha ? { sha } : {}) };
      const r = await api(`contents/${path(lang)}`, { method: "PUT", body: JSON.stringify(body) });
      if (r.ok) return fresh.length;
      if (r.status !== 409 && r.status !== 422) throw new Error(r.status === 401 || r.status === 403 ? "토큰 권한 오류" : `저장 실패 (${r.status})`);
    }
    throw new Error("저장 충돌 — 잠시 뒤 다시 시도해 주세요");
  }

  // ---------- 단어 불러오기 (사이트 파일 + 아직 반영 안 된 이 기기의 단어) ----------
  async function load(lang) {
    let site = [];
    try { site = (await fetch(`${path(lang)}?t=${Date.now()}`, { cache: "no-cache" }).then(r => r.ok ? r.json() : { words: [] })).words || []; } catch {}
    let pend = store.get(pendKey(lang), []);
    // 사이트에 이미 반영된 단어는 이 기기 임시 목록에서 지워요 (올리지 못한 단어는 남겨 둬요)
    pend = pend.filter(p => !(p.up && site.some(w => same(w.w, p.w))));
    store.set(pendKey(lang), pend);
    const all = [...site];
    for (const p of pend) if (!all.some(w => same(w.w, p.w))) all.push(p);
    // 아직 못 올린 단어가 있고 토큰이 있으면 다시 올려 봐요
    const notUp = pend.filter(p => !p.up);
    if (notUp.length && token()) pushRemote(lang, notUp.map(clean)).then(() => {
      const ps = store.get(pendKey(lang), []); for (const p of ps) if (notUp.some(n => same(n.w, p.w))) p.up = true; store.set(pendKey(lang), ps);
    }).catch(() => {});
    return all.map(w => ({ w: w.w, py: w.py || "", ko: w.ko || (w.auto ? "(뜻 채우는 중…)" : ""), ex: w.ex || "", exKo: w.exKo || "", l: ["added"], d: w.d || "" }));
  }
  const clean = x => { const o = { w: x.w, py: x.py || "", ko: x.ko || "", ex: x.ex || "", exKo: x.exKo || "", d: x.d || todayStr() }; if (!o.ko) o.auto = true; return o; };

  // ---------- 화면 ----------
  const NAVER = { es: "https://dict.naver.com/eskodict/#/search?query=", en: "https://en.dict.naver.com/#/search?query=",
    zh: "https://zh.dict.naver.com/#/search?query=", ja: "https://ja.dict.naver.com/#/search?query=" };
  const PH = { es: "예: la almohada", en: "예: resilience", zh: "예: 枕头", ja: "예: 枕" };
  function css() {
    if (document.getElementById("aw-css")) return;
    const s = document.createElement("style"); s.id = "aw-css";
    s.textContent = `.aw{margin:6px 0 10px;padding:10px 12px;border:1px dashed var(--line,#ccc);border-radius:12px;background:var(--card,#fff)}
      .aw[hidden]{display:none}.aw .row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
      .aw input{flex:1;min-width:140px;padding:8px 10px;border:1px solid var(--line,#ccc);border-radius:8px;font:inherit;background:transparent;color:inherit}
      .aw label{display:block;font-size:.85em;margin:6px 0 2px;opacity:.8}.aw .msg{font-size:.9em;margin-top:6px}
      .aw-bar{display:flex;gap:10px;justify-content:flex-end;font-size:.85em;margin:-2px 0 4px}.aw-bar button{background:none;border:0;color:var(--accent,#c8102e);cursor:pointer;padding:2px 0;font:inherit}`;
    document.head.appendChild(s);
  }

  function attach(lang) {
    const q = document.getElementById("q"), lc = document.getElementById("lcount");
    if (!q) return;
    css();
    const bar = document.createElement("div"); bar.className = "aw-bar";
    bar.innerHTML = `<button type="button" data-a="open">＋ 단어 추가</button><button type="button" data-a="set">⚙️ 저장 설정${token() ? " ✓" : ""}</button>`;
    const box = document.createElement("div"); box.className = "aw"; box.hidden = true;
    q.insertAdjacentElement("afterend", box); q.insertAdjacentElement("afterend", bar);

    const hint = w => `<div class="row"><span>‘<b>${esc(w)}</b>’ 검색 결과가 없어요.</span>
      <button class="btn" data-a="form">＋ 단어장에 추가</button>
      <a class="btn" target="_blank" rel="noopener" href="${NAVER[lang] + encodeURIComponent(w)}">📖 네이버 사전</a></div>`;
    const form = w => `<b>＋ 새 단어</b>
      <label>단어</label><input id="aw-w" value="${esc(w)}" placeholder="${PH[lang]}">
      ${lang === "zh" ? `<label>병음 (비워 두면 자동)</label><input id="aw-py" placeholder="예: zhěntou">` : ""}
      ${lang === "ja" ? `<label>읽기 (비워 두면 자동)</label><input id="aw-py" placeholder="예: まくら">` : ""}
      <label>한국어 뜻 (비워 두면 매일 자동으로 채워요)</label><input id="aw-ko" placeholder="예: 베개">
      <label>예문 (선택)</label><input id="aw-ex">
      <label>예문 뜻 (선택)</label><input id="aw-exko">
      <div class="row" style="margin-top:8px"><button class="btn" data-a="save">저장</button><button class="btn" data-a="close">닫기</button>
      <a class="btn" target="_blank" rel="noopener" id="aw-dict" href="${NAVER[lang] + encodeURIComponent(w)}">📖 네이버 사전</a></div>
      ${token() ? "" : `<div class="msg">⚠️ 저장 설정(GitHub 토큰)이 없어서 이 기기에만 저장돼요. <button class="k" data-a="set">설정하기</button></div>`}
      <div class="msg" id="aw-msg"></div>`;
    const settings = () => `<b>⚙️ 저장 설정</b>
      <div class="msg">추가한 단어를 GitHub 저장소(<code>${path(lang)}</code>)에 저장해서 모든 기기에서 보이게 해요. 처음 한 번만 하면 돼요.</div>
      <ol class="msg" style="padding-left:18px;margin:6px 0">
        <li><a target="_blank" rel="noopener" href="https://github.com/settings/personal-access-tokens/new">GitHub 토큰 만들기</a> (Fine-grained token)</li>
        <li>Repository access → <b>Only select repositories</b> → <code>${REPO}</code></li>
        <li>Permissions → Repository permissions → <b>Contents: Read and write</b></li>
        <li>Generate token → 나온 토큰(github_pat_…)을 아래에 붙여 넣기</li></ol>
      <input id="aw-tok" type="password" placeholder="github_pat_..." value="${esc(token())}">
      <div class="row" style="margin-top:8px"><button class="btn" data-a="tok">저장하고 확인</button><button class="btn" data-a="close">닫기</button>
      ${token() ? `<button class="btn" data-a="untok">토큰 지우기</button>` : ""}</div>
      <div class="msg">토큰은 이 브라우저에만 저장돼요. 기기마다 한 번씩 넣어 주세요.</div><div class="msg" id="aw-msg"></div>`;

    let mode = ""; // "", "hint", "form", "set"
    const show = (m, w = q.value.trim()) => { mode = m; box.hidden = !m; box.innerHTML = m === "hint" ? hint(w) : m === "form" ? form(w) : m === "set" ? settings() : ""; };
    const count = () => { const m = (lc && lc.textContent || "").match(/^([\d,]+)/); return m ? +m[1].replace(/,/g, "") : -1; };
    // 검색 결과가 0개가 되면 안내를 보여요 (목록이 다시 그려질 때마다 확인)
    const check = () => { if (mode === "form" || mode === "set") return; const w = q.value.trim(); if (w && count() === 0) show("hint", w); else if (mode === "hint") show(""); };
    if (lc) new MutationObserver(check).observe(lc, { childList: true, characterData: true, subtree: true });
    q.addEventListener("input", () => setTimeout(check, 350));
    // 추가 후 새로 고쳤을 때 그 단어로 다시 찾아 줘요
    const again = sessionStorage.getItem("aw_q_" + lang);
    if (again) { sessionStorage.removeItem("aw_q_" + lang); setTimeout(() => { q.value = again; q.dispatchEvent(new Event("input")); }, 300); }

    const msg = t => { const m = document.getElementById("aw-msg"); if (m) m.innerHTML = t; };
    const onClick = async e => {
      const b = e.target.closest("[data-a]"); if (!b) return;
      const a = b.dataset.a;
      if (a === "open") return show("form");
      if (a === "form") return show("form");
      if (a === "set") return show("set");
      if (a === "close") return show("");
      if (a === "untok") { store.set("aw_token", ""); bar.querySelector('[data-a="set"]').textContent = "⚙️ 저장 설정"; return show("set"); }
      if (a === "tok") {
        const t = document.getElementById("aw-tok").value.trim();
        store.set("aw_token", t); msg("확인하는 중…");
        try { await readRemote(lang); bar.querySelector('[data-a="set"]').textContent = "⚙️ 저장 설정 ✓"; msg("✅ 연결됐어요. 이제 추가한 단어가 모든 기기에 저장돼요."); }
        catch (err) { msg(`❌ 확인 실패: ${esc(err.message)} — 토큰과 권한(Contents: Read and write)을 확인해 주세요.`); }
        return;
      }
      if (a === "save") {
        const v = id => (document.getElementById(id) || { value: "" }).value.trim();
        const item = clean({ w: v("aw-w"), py: v("aw-py"), ko: v("aw-ko"), ex: v("aw-ex"), exKo: v("aw-exko") });
        if (!item.w) return msg("단어를 적어 주세요.");
        const pend = store.get(pendKey(lang), []);
        if (!pend.some(p => same(p.w, item.w))) pend.push({ ...item, up: false });
        store.set(pendKey(lang), pend);
        b.disabled = true;
        if (token()) {
          msg("GitHub에 저장하는 중…");
          try {
            await pushRemote(lang, [item]);
            const ps = store.get(pendKey(lang), []); for (const p of ps) if (same(p.w, item.w)) p.up = true; store.set(pendKey(lang), ps);
            msg(`✅ 저장했어요. ${item.auto ? "뜻은 매일 자동으로 채워져요. " : ""}다른 기기에는 1~2분 뒤 보여요.`);
          } catch (err) { msg(`⚠️ GitHub 저장 실패(${esc(err.message)}) — 이 기기에 저장해 뒀다가 다음에 다시 올릴게요.`); }
        } else msg("이 기기에 저장했어요.");
        sessionStorage.setItem("aw_q_" + lang, item.w);
        setTimeout(() => location.reload(), 1400);
      }
    };
    box.addEventListener("click", onClick); bar.addEventListener("click", onClick);
    box.addEventListener("input", e => { if (e.target.id === "aw-w") { const d = document.getElementById("aw-dict"); if (d) d.href = NAVER[lang] + encodeURIComponent(e.target.value.trim()); } });
  }

  const TITLE = "✍️ 내가 추가한 단어";
  // 강의 링크 자리에 「내가 추가한 단어」는 링크 없이 보여 줘요
  const link = (id, titles) => id === "added" ? `<span>${TITLE}</span>` : `<a href="lesson.html?d=${esc(id)}#vocab">${esc(titles[id] || id)}</a>`;
  return { load, attach, link, TITLE };
})();
