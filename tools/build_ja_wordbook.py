#!/usr/bin/env python3
"""일본어 단어장 엑셀(單語 · 意味 · 品詞 · Level) → wordbook/ja.json

    python3 tools/build_ja_wordbook.py "…/일본어 어휘의 달인/일본어 단어8.xlsx"

單語 칸은 「읽기 [한자·다른 한자]」 형식이에요 (예: あいしょう [相性·合性], かしだ-す [貸(し)出す]).
- 읽기의 '-'(오쿠리가나 경계 표시)는 지워요.
- 대표 표기는 첫 번째 한자 표기에서 괄호만 지운 것(貸(し)出す → 貸し出す), 원래 표기는 따로 보여 줘요.
- 한자가 없는 단어(そして, ぎりぎり…)는 읽기가 그대로 표제어예요.
- ']' 뒤에 붙은 글자(듣기, ㅂ)나 닫는 괄호가 빠진 것은 바로잡아요.
- 읽기·표기·뜻·품사가 모두 같은 줄은 한 번만 넣고, 레벨이 다르면 낮은 레벨(初級)을 써요.
"""
import json
import pathlib
import re
import sys
import unicodedata

import openpyxl

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "wordbook" / "ja.json"
RANK = {"初級": 0, "中級": 1, "": 2}


def clean(v):
    return str(v or "").replace(" ", " ").replace("\t", " ").strip()


def parse(word):
    m = re.match(r"^([^\[［]+?)\s*(?:[\[［]([^\]］]*)(?:[\]］].*)?)?$", word)
    reading = m.group(1).replace("-", "").strip()
    forms = [f.strip() for f in re.split(r"[·∙•・]", unicodedata.normalize("NFKC", m.group(2) or "")) if f.strip()]
    if not forms:
        return reading, reading, ""
    head = re.sub(r"[()（）]", "", forms[0])
    alt = "·".join(forms) if len(forms) > 1 or forms[0] != head else ""
    return reading, head, alt


def main(path):
    ws = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    words, index, skipped = [], {}, 0
    for row in ws.iter_rows(min_row=2, values_only=True):
        word, ko, pos, lvl = (clean(x) for x in (list(row) + [None] * 4)[:4])
        if not word:
            continue
        reading, head, alt = parse(word)
        key = (reading, head, ko, pos)
        if key in index:
            skipped += 1
            w = words[index[key]]
            if RANK.get(lvl, 2) < RANK.get(w[5], 2):
                w[5] = lvl
            continue
        index[key] = len(words)
        words.append([reading, head, alt, ko, pos, lvl])
    OUT.parent.mkdir(exist_ok=True)
    data = {"title": "일본어 단어장", "source": pathlib.Path(path).name, "words": words}
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(words)}개 단어 → {OUT.relative_to(ROOT)} (중복 {skipped}개 뺌)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
