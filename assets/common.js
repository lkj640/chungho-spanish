// 공통 도우미: 언어 목록 · HTML 이스케이프 · 날짜 표시 · 저장소 · 발음 듣기
const U = (() => {
  // 홈 화면에 이 순서대로 보여요
  const LANGS = {
    en: { name: "영어", native: "English", flag: "🇺🇸", tts: "en-US" },
    ja: { name: "일본어", native: "日本語", flag: "🇯🇵", tts: "ja-JP" },
    zh: { name: "중국어", native: "中文", flag: "🇨🇳", tts: "zh-CN" },
    es: { name: "스페인어", native: "Español", flag: "🇪🇸", tts: "es-ES" },
  };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const WD = ["일", "월", "화", "수", "목", "금", "토"];
  const fmtDate = d => {
    const [y, m, dd] = d.split("-").map(Number);
    return `${y}년 ${m}월 ${dd}일 (${WD[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]})`;
  };
  const store = {
    get(k, def) { try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch { return def; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  // 예전 주소(?d=2026-10-18)는 스페인어 강의였어요 → es-2026-10-18
  const OLD_ID = /^\d{4}-\d{2}-\d{2}(-\d+)?$/;
  const fixId = id => (OLD_ID.test(id || "") ? "es-" + id : id);
  (function migrate() {
    if (store.get("migrated_v2", false)) return;
    const done = store.get("done", {}), known = store.get("known", {});
    const nd = {}, nk = {};
    for (const k in done) nd[fixId(k)] = done[k];
    for (const k in known) { const [id, ...w] = k.split("|"); nk[fixId(id) + "|" + w.join("|")] = known[k]; }
    store.set("done", nd); store.set("known", nk); store.set("migrated_v2", true);
  })();
  // 브라우저 내장 음성으로 발음 듣기
  function say(text, lang = "es") {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const tts = (LANGS[lang] || LANGS.es).tts;
    const u = new SpeechSynthesisUtterance(text.replace(/\s*\/\s*/g, ", "));
    u.lang = tts; u.rate = 0.9;
    const v = speechSynthesis.getVoices().find(v => v.lang.replace("_", "-").startsWith(tts.slice(0, 2)));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  }
  const loadIndex = () => fetch("lessons.json", { cache: "no-cache" }).then(r => r.json());
  return { LANGS, esc, fmtDate, store, say, loadIndex, fixId };
})();
