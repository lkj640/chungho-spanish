// 공통 도우미: HTML 이스케이프 · 날짜 표시 · 저장소 · 발음 듣기
const U = (() => {
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
  // 브라우저 내장 음성으로 스페인어 발음 듣기
  function say(text) {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/\s*\/\s*/g, ", "));
    u.lang = "es-ES"; u.rate = 0.9;
    const v = speechSynthesis.getVoices().find(v => v.lang.startsWith("es"));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  }
  const loadIndex = () => fetch("lessons.json", { cache: "no-cache" }).then(r => r.json());
  return { esc, fmtDate, store, say, loadIndex };
})();
