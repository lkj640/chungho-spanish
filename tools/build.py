#!/usr/bin/env python3
"""lessons/<언어>-<날짜>/script.txt + meta.json  →  data.json, 그리고 전체 목록 lessons.json

폴더 이름: <언어>-YYYY-MM-DD (같은 날 같은 언어가 또 있으면 -2, -3…)
언어 코드: en 영어 · ja 일본어 · zh 중국어 · es 스페인어 (meta.json의 "lang")
중국어(zh)는 pypinyin이 있으면 문장마다 병음(py)을 자동으로 달아요.
일본어(ja)는 pykakasi가 있으면 한자 위에 후리가나(rb)를 자동으로 달아요.
유튜브가 없는 강의는 meta.json에 "audio": "audio.m4a"처럼 같은 폴더의 오디오 파일을 적어요.

script.txt 형식
  END mm:ss                 영상 끝 시각
  [mm:ss]                   유튜브 transcript의 구간 시작 시각 (문장별로 [mm:ss.ss]도 돼요)
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
    return int(m) * 60 + float(s)


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
        elif m := re.fullmatch(r"\[(\d+:\d\d(?:\.\d+)?)\]", line):
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
    "哈喽": [["hā"], ["lou"]], "就得": [["jiù"], ["děi"]], "你得": [["nǐ"], ["děi"]], "大汗": [["dà"], ["hàn"]],
}

# 위 PHRASES는 pypinyin이 단어를 다르게 자르면 안 먹혀요. 그럴 땐 여기에 넣으면 자동 보정 뒤에 무조건 덮어써요 (한자만, 글자 수 = 병음 수)
FORCE = {
    "长时间": "cháng shí jiān", "太长": "tài cháng", "更长": "gèng cháng", "时间长": "shí jiān cháng",
    "得不到": "dé bu dào", "不动地": "bú dòng de", "很好地": "hěn hǎo de",
    "背了": "bēi le", "睛干": "jing gān", "舒服的觉": "shū fu de jiào",
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
                for key, val in FORCE.items():
                    v = val.split()
                    for i in range(len(toks) - len(key) + 1):
                        if "".join(toks[i:i + len(key)]) == key and all(len(t) == 1 for t in toks[i:i + len(key)]):
                            syls[i:i + len(key)] = v
            # 한자 한 글자마다 병음을 위에 달 수 있게 [[글자, 병음], …] (문장부호 등은 병음 없이)
            if len(syls) == len(toks):
                l["rb"] = [[c, y if _han(c) else ""] for c, y in zip(toks, syls)]
            out = ""
            for syl in syls:
                syl = syl.translate(PUNCT)
                if out and not (syl[:1] in ",.!?;:)»\"'—…" or out[-1] in "(«\"" or not syl.strip()):
                    out += " "
                out += syl
            l["py"] = re.sub(r"\s+", " ", out).strip()


def _kanji(c):
    return "\u4e00" <= c <= "\u9fff" or c in "々〆ヶ"


# pykakasi가 틀리게 읽는 말은 여기에 추가하세요 (원문: 읽기)
JA_FIX = {"八尺": "はっしゃく", "卵麺": "たまごめん", "璞": "ぼく", "真": "しん", "祀": "まつ", "泥": "どろ", "尽": "つ",
          "渇": "かわ", "入って": "はいって", "入っている": "はいっている", "分": "ぶん", "金": "かね", "飯": "はん", "歳": "さい",
          "深掘": "ふかぼ", "通して": "とおして", "間": "かん",
          "今日": "きょう", "日本": "にほん", "笑": "わら", "地道": "じみち", "後": "あと", "通り": "とおり",
          "習": "なら", "養": "やしな", "一人前": "いちにんまえ", "今頃": "いまごろ", "下積み": "したづみ", "根付く": "ねづく", "根っこ": "ねっこ",
          "人": "ひと", "小": "ちい", "頃": "ころ", "幹": "みき", "紐解": "ひもと"}
# 여러 토큰에 걸친 말은 여기서 통째로 덮어써요: 구절 → [[원문 조각, 읽기], …] (조각을 이으면 구절과 같아야 해요)
JA_FORCE = {"久坐傷肉": [["久坐傷肉", "きゅうざしょうにく"]], "久臥傷気": [["久臥傷気", "きゅうがしょうき"]],
            "黄帝内経": [["黄帝内経", "こうていだいけい"]], "1日中": [["1日中", "いちにちじゅう"]],
            "歩かずに": [["歩", "ある"], ["かずに", ""]], "1歩も": [["1歩", "いっぽ"], ["も", ""]]}


def add_ruby(sections):
    try:
        import pykakasi
    except ImportError:
        print("  (pykakasi가 없어서 후리가나는 건너뛰어요: pip3 install pykakasi)")
        return
    kks = pykakasi.kakasi()
    for s in sections:
        for l in s["lines"]:
            rb = []
            for tok in kks.convert(l["es"]):
                o, r = tok["orig"], tok["hira"]
                if not any(_kanji(c) for c in o):
                    rb.append([o, ""]); continue
                r = JA_FIX.get(o, r)
                # 앞뒤로 겹치는 가나(送り仮名)는 빼고 한자 부분에만 읽기를 달아요
                head = 0
                while head < len(o) and head < len(r) and not _kanji(o[head]) and o[head] == r[head]:
                    head += 1
                tail = 0
                while tail < len(o) - head and tail < len(r) - head and not _kanji(o[-1 - tail]) and o[-1 - tail] == r[-1 - tail]:
                    tail += 1
                ko, kr = o[head:len(o) - tail], r[head:len(r) - tail]
                kr = JA_FIX.get(ko, kr)
                if head: rb.append([o[:head], ""])
                rb.append([ko, kr])
                if tail: rb.append([o[len(o) - tail:], ""])
            # 연속된 가나 조각은 합쳐서 가볍게 · 「ヶ月」은 한 덩어리로
            merged = []
            for o, r in rb:
                if o == "月" and merged and merged[-1][0] == "ヶ":
                    merged[-1] = ["ヶ月", "かげつ"]; continue
                # 동사 연용형 + 方 = かた (炊き方·握り方), 그 밖에는 ほう (教わった方が)
                if o == "方" and r == "ほう" and merged and not merged[-1][1] and merged[-1][0][-1:] in "きしちにひみりぎじびいえけせてねめれげべ":
                    r = "かた"
                if merged and not r and not merged[-1][1]:
                    merged[-1][0] += o
                else:
                    merged.append([o, r])
            # 다음 글자를 봐야 정해지는 읽기: 入っている(はい), 深掘り(ふか)
            for j, (o, r) in enumerate(merged):
                nxt = merged[j + 1][0] if j + 1 < len(merged) else ""
                if o == "入" and nxt.startswith("っ"):
                    merged[j][1] = "はい"
                elif o == "深" and nxt.startswith("掘"):
                    merged[j][1] = "ふか"
            def cut(k):  # 위치 k가 읽기 없는 조각 한가운데면 둘로 나눠요
                i = 0
                for n, (o, r) in enumerate(merged):
                    if i < k < i + len(o) and not r:
                        merged[n:n + 1] = [[o[:k - i], ""], [o[k - i:], ""]]
                        return
                    i += len(o)
            for phrase, rep_rb in JA_FORCE.items():
                text = "".join(o for o, _ in merged)
                at = text.find(phrase)
                while at != -1:
                    cut(at); cut(at + len(phrase))
                    pos, i = [], 0
                    for o, _ in merged:
                        pos.append(i); i += len(o)
                    pos.append(i)
                    if at in pos and at + len(phrase) in pos:
                        a, b = pos.index(at), pos.index(at + len(phrase))
                        merged[a:b] = [list(x) for x in rep_rb]
                        pos, i = [], 0
                        for o, _ in merged:
                            pos.append(i); i += len(o)
                        pos.append(i)
                        text = "".join(o for o, _ in merged)
                    at = text.find(phrase, at + 1)
            l["rb"] = merged


def ja_ruby(text):
    """일본어 문장 하나 → [[원문 조각, 읽기], …]"""
    sec = [{"title": "", "lines": [{"es": text}]}]
    add_ruby(sec)
    return sec[0]["lines"][0].get("rb") or [[text, ""]]


def add_discussion_ruby(d):
    """토론 주제(일본어만)의 모든 문장에 후리가나를 달아요."""
    for k in ("intro", "bonus", "bonusEx"):
        if d.get(k):
            d[k + "Rb"] = ja_ruby(d[k])
    for q in d.get("questions", []):
        q["rb"] = ja_ruby(q["q"])
        q["hintsRb"] = [ja_ruby(h) for h in q.get("hints", [])]
    for e in d.get("expressions", []):
        e.append(ja_ruby(e[1]))


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
            elif meta.get("lang") == "ja":
                add_ruby(data["sections"])
        if meta.get("lang") == "ja" and data.get("discussion"):
            add_discussion_ruby(data["discussion"])
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
