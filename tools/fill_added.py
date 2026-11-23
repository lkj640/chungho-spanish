#!/usr/bin/env python3
"""「내가 추가한 단어」(wordbook/added-<언어>.json)에서 뜻이 빈 단어를 채워요.

단어장 페이지(assets/addword.js)에서 뜻 없이 추가한 단어는 "auto": true 로 저장돼요.
매일 자동 작업이 이 도구로 빈 단어를 찾고, 한국어 뜻·예문을 정해서 채워 넣어요.

사용법
  python3 tools/fill_added.py list
      → 채울 단어를 JSON으로 보여 줘요: {"es": ["la almohada", ...], "zh": [...], ...}
  python3 tools/fill_added.py apply fills.json
      → fills.json = {"es": {"la almohada": {"ko": "베개", "ex": "...", "exKo": "..."}}, "zh": {"枕头": {"ko": "...", "py": "zhěntou", ...}}}
        에 있는 내용으로 채워요. 중국어 병음·일본어 읽기를 비워 두면 pypinyin·pykakasi로 자동으로 달아요.
        채운 단어는 "auto"를 지우고 "filled": 날짜를 남겨요. 사용자가 직접 적은 값은 덮어쓰지 않아요.
"""
import json, sys, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LANGS = ["es", "en", "zh", "ja"]


def path(lang):
    return ROOT / "wordbook" / f"added-{lang}.json"


def load(lang):
    p = path(lang)
    if not p.exists():
        return {"lang": lang, "words": []}
    return json.loads(p.read_text(encoding="utf-8"))


def save(lang, data):
    path(lang).write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def pending(w):
    return w.get("auto") or not (w.get("ko") or "").strip()


def zh_py(text):
    from pypinyin import pinyin, Style
    return "".join(x[0] for x in pinyin(text, style=Style.TONE))


def ja_read(text):
    import pykakasi
    return "".join(t["hira"] for t in pykakasi.kakasi().convert(text))


def cmd_list():
    out = {}
    for lang in LANGS:
        ws = [w["w"] for w in load(lang)["words"] if pending(w)]
        if ws:
            out[lang] = ws
    print(json.dumps(out, ensure_ascii=False, indent=1))


def cmd_apply(fills_path):
    fills = json.loads(Path(fills_path).read_text(encoding="utf-8"))
    today = datetime.date.today().isoformat()
    for lang, items in fills.items():
        data = load(lang)
        n = 0
        for w in data["words"]:
            f = items.get(w["w"])
            if not f:
                continue
            for k in ("ko", "ex", "exKo", "py"):
                if f.get(k) and not (w.get(k) or "").strip():
                    w[k] = f[k].strip()
            if lang == "zh" and not w.get("py"):
                try: w["py"] = zh_py(w["w"])
                except Exception: pass
            if lang == "ja" and not w.get("py"):
                try:
                    r = ja_read(w["w"])
                    if r != w["w"]: w["py"] = r
                except Exception: pass
            if (w.get("ko") or "").strip():
                w.pop("auto", None)
                w["filled"] = today
                n += 1
        save(lang, data)
        print(f"✓ {lang}: {n}개 채움")


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "list":
        cmd_list()
    elif len(sys.argv) >= 3 and sys.argv[1] == "apply":
        cmd_apply(sys.argv[2])
    else:
        sys.exit(__doc__)
