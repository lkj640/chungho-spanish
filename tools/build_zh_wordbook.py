#!/usr/bin/env python3
"""중국어 단어장 엑셀(拼音 · 汉字 · 意思 · 词类 · HSK級) → wordbook/zh.json

    python3 tools/build_zh_wordbook.py "…/중국어 공부/중국어 단어 8.xlsx"

- 병음·한자·뜻의 앞뒤 공백(줄바꿈 없는 공백 포함)을 지워요.
- 한국어로 적힌 품사(동사·명사…)는 중국어 품사 이름으로 맞춰요.
- 병음·한자·뜻이 모두 같은 줄은 한 번만 넣어요(长 cháng / zhǎng처럼 읽기나 뜻이 다르면 따로 둬요).
"""
import json
import pathlib
import sys

import openpyxl

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "wordbook" / "zh.json"

POS_FIX = {"동사": "动词", "명사": "名词", "형용사": "形容词", "부사": "副词"}
LVL = {"一二三": "1-3", "四": "4", "五": "5"}


def clean(v):
    return str(v or "").replace(" ", " ").replace("\t", " ").strip()


def main(path):
    ws = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    words, seen, skipped = [], set(), 0
    for row in ws.iter_rows(min_row=2, values_only=True):
        py, hz, ko, pos, lvl = (clean(x) for x in (list(row) + [None] * 5)[:5])
        if not hz:
            continue
        key = (py, hz, ko)
        if key in seen:
            skipped += 1
            continue
        seen.add(key)
        words.append([py, hz, ko, POS_FIX.get(pos, pos), LVL.get(lvl, "")])
    OUT.parent.mkdir(exist_ok=True)
    data = {"title": "중국어 단어장", "source": pathlib.Path(path).name, "words": words}
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(words)}개 단어 → {OUT.relative_to(ROOT)} (중복 {skipped}개 뺌)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
