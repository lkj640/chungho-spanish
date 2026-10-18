#!/usr/bin/env python3
"""lessons/<날짜>/script.txt + meta.json  →  lessons/<날짜>/data.json, 그리고 전체 목록 lessons.json

script.txt 형식
  END mm:ss                 영상 끝 시각
  [mm:ss]                   유튜브 transcript의 구간 시작 시각
  ## 섹션 제목               (다음 줄부터 새 섹션)
  S | 스페인어 | 한국어        화자 코드는 meta.json의 speakers 참고
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


def main():
    index = []
    for d in sorted(p for p in LESSONS.iterdir() if p.is_dir()):
        meta_p, script_p = d / "meta.json", d / "script.txt"
        if not meta_p.exists():
            continue
        meta = json.loads(meta_p.read_text(encoding="utf-8"))
        data = dict(meta)
        if script_p.exists():
            data["sections"] = parse_script(script_p)
        (d / "data.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        nlines = sum(len(s["lines"]) for s in data.get("sections", []))
        index.append({k: meta.get(k) for k in
                      ("date", "title", "es", "emoji", "level", "channel", "youtube", "duration", "summary", "topics")}
                     | {"vocabCount": len(meta.get("vocab", [])), "lineCount": nlines})
        print(f"✓ {d.name}: 문장 {nlines}개 · 단어 {len(meta.get('vocab', []))}개 · 퀴즈 {len(meta.get('quiz', []))}개")
    index.sort(key=lambda x: x["date"], reverse=True)
    (ROOT / "lessons.json").write_text(json.dumps({"lessons": index}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✓ lessons.json: 총 {len(index)}개 강의")


if __name__ == "__main__":
    main()
