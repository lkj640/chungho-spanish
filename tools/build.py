#!/usr/bin/env python3
"""lessons/<언어>-<날짜>/script.txt + meta.json  →  data.json, 그리고 전체 목록 lessons.json

폴더 이름: <언어>-YYYY-MM-DD (같은 날 같은 언어가 또 있으면 -2, -3…)
언어 코드: en 영어 · ja 일본어 · zh 중국어 · es 스페인어 (meta.json의 "lang")
중국어(zh)는 pypinyin이 있으면 문장마다 병음(py)을 자동으로 달아요.

script.txt 형식
  END mm:ss                 영상 끝 시각
  [mm:ss]                   유튜브 transcript의 구간 시작 시각
  ## 섹션 제목               (다음 줄부터 새 섹션)
  S | 원문 | 한국어            화자 코드는 meta.json의 speakers 참고
구간 안의 각 줄 시작 시각은 글자 수 비율로 나눠서 계산해요.

사용법:  python3 tools/build.py
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LESSONS = ROOT / "lessons"


def secs(s):
    m, s = s.split(":")
    return int(m) * 60 + int(s)


def parse_script(path):
    end = None
    chunks = []  # [start, [(section_or_None, speaker, es, ko), ...]]
    pending_sec = None
    for n, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("# "):
            continue
        if line.startswith("END "):
            end = secs(line[4:].strip())
        elif m := re.fullmatch(r"\[(\d+:\d\d)\]", line):
            chunks.append([secs(m.group(1)), []])
        elif line.startswith("## "):
            pending_sec = line[3:].strip()
        else:
            parts = [p.strip() for p in line.split("|")]
            if len(parts) != 3 or not chunks:
                sys.exit(f"{path}:{n}: 형식 오류 → {raw}")
            chunks[-1][1].append((pending_sec, *parts))
            pending_sec = None
    if end is None:
        sys.exit(f"{path}: END mm:ss 줄이 필요해요")

    sections = []
    for i, (start, rows) in enumerate(chunks):
        stop = chunks[i + 1][0] if i + 1 < len(chunks) else end
        total = sum(len(r[2]) for r in rows) or 1
        acc = 0
        for sec, spk, es, ko in rows:
            t = round(start + (stop - start) * acc / total, 1)
            acc += len(es)
            if sec or not sections:
                sections.append({"title": sec or "대본", "lines": []})
            sections[-1]["lines"].append({"t": t, "s": spk, "es": es, "ko": ko})
    return sections


PUNCT = str.maketrans({"，": ",", "。": ".", "！": "!", "？": "?", "；": ";", "：": ":", "、": ",",
                       "“": '"', "”": '"', "《": "«", "》": "»", "（": "(", "）": ")", "—": "—"})


# 여러 소리가 나는 글자(多音字)를 바로잡는 구절 — 틀린 병음이 보이면 여기에 추가하세요
PHRASES = {
    "这只": [["zhè"], ["zhī"]], "那只": [["nà"], ["zhī"]], "一只": [["yī"], ["zhī"]], "两只": [["liǎng"], ["zhī"]],
    "长达": [["cháng"], ["dá"]], "米长": [["mǐ"], ["cháng"]], "要还": [["yào"], ["huán"]], "数不清": [["shǔ"], ["bu"], ["qīng"]], "种出": [["zhòng"], ["chū"]],
    "饱觉": [["bǎo"], ["jiào"]], "好觉": [["hǎo"], ["jiào"]], "觉也": [["jiào"], ["yě"]], "个觉": [["gè"], ["jiào"]],
}


DE_BEFORE_DI = "气由在目心静淡稳停慢真细快轻默悄"


def _han(c):
    return "\u4e00" <= c <= "\u9fff" or "\u3400" <= c <= "\u4dbf"


def _tone(syl):
    for ch in syl:
        for t, group in enumerate(("āēīōūǖ", "áéíóúǘ", "ǎěǐǒǔǚ", "àèìòùǜ"), 1):
            if ch in group:
                return t
    return 0


def add_pinyin(sections):
    try:
        from pypinyin import pinyin, load_phrases_dict
    except ImportError:
        print("  (pypinyin이 없어서 병음은 건너뛰어요: pip3 install pypinyin)")
        return
    load_phrases_dict(PHRASES)
    for s in sections:
        for l in s["lines"]:
            text = l["es"]
            # 한자는 한 글자씩, 나머지(문장부호 등)는 묶음으로 → pypinyin 결과와 1:1로 맞춰요
            toks, run = [], ""
            for c in text:
                if _han(c):
                    if run: toks.append(run); run = ""
                    toks.append(c)
                else:
                    run += c
            if run: toks.append(run)
            syls = [x[0] for x in pinyin(text)]
            if len(syls) == len(toks):
                # 一·不 성조 변화 (교재 표기 방식)
                for i, (c, y) in enumerate(zip(toks, syls)):
                    nxt = _tone(syls[i + 1]) if i + 1 < len(syls) and _han(toks[i + 1]) else 0
                    prev = toks[i - 1] if i else ""
                    if c == "一" and y == "yī" and nxt and prev not in ("第", "十") and toks[i + 1] not in "十二三四五六七八九":
                        syls[i] = "yí" if nxt == 4 else "yì"
                    elif c == "不" and y == "bù" and nxt == 4:
                        syls[i] = "bú"
                    # 부사어 표지 地 (安静地, 客气地…) · 보어 표지 得 (分析得太深刻) → 경성 de
                    elif c == "觉" and prev and prev in "睡个好饱午着":
                        syls[i] = "jiào"
                    elif c == "着" and prev == "不" and i + 1 < len(toks) and toks[i + 1] == "觉":
                        syls[i] = "zháo"
                    elif c == "数" and i + 1 < len(toks) and toks[i + 1] == "不":
                        syls[i] = "shǔ"
                    elif c == "地" and y == "dì" and prev and prev in DE_BEFORE_DI and i + 1 < len(toks) and _han(toks[i + 1]):
                        syls[i] = "de"
                    elif c == "得" and y == "dé" and prev and _han(prev) and prev not in "获取赢难记" and i + 1 < len(toks) and toks[i + 1] != "到":
                        syls[i] = "de"
            out = ""
            for syl in syls:
                syl = syl.translate(PUNCT)
                if out and not (syl[:1] in ",.!?;:)»\"'—…" or out[-1] in "(«\"" or not syl.strip()):
                    out += " "
                out += syl
            l["py"] = re.sub(r"\s+", " ", out).strip()


def main():
    index = []
    for d in sorted(p for p in LESSONS.iterdir() if p.is_dir()):
        meta_p, script_p = d / "meta.json", d / "script.txt"
        if not meta_p.exists():
            continue
        meta = json.loads(meta_p.read_text(encoding="utf-8"))
        data = {"id": d.name} | meta
        if script_p.exists():
            data["sections"] = parse_script(script_p)
            if meta.get("lang") == "zh":
                add_pinyin(data["sections"])
        (d / "data.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        nlines = sum(len(s["lines"]) for s in data.get("sections", []))
        index.append({"id": d.name} | {k: meta.get(k) for k in
                      ("lang", "date", "title", "es", "emoji", "level", "channel", "youtube", "duration", "summary", "topics")}
                     | {"vocabCount": len(meta.get("vocab", [])), "lineCount": nlines})
        print(f"✓ {d.name}: 문장 {nlines}개 · 단어 {len(meta.get('vocab', []))}개 · 퀴즈 {len(meta.get('quiz', []))}개")
    # 같은 날 강의가 여럿이면 폴더 이름에 -2, -3…을 붙여요 (예: 2026-10-18-2)
    index.sort(key=lambda x: (x["date"], len(x["id"]), x["id"]), reverse=True)
    (ROOT / "lessons.json").write_text(json.dumps({"lessons": index}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✓ lessons.json: 총 {len(index)}개 강의")


if __name__ == "__main__":
    main()
