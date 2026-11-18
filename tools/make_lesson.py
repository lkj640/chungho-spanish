#!/usr/bin/env python3
"""유튜브 링크나 오디오 파일 하나로 강의를 통째로 만들어요.

  유튜브:  python3 tools/make_lesson.py https://youtu.be/XXXX --lang zh
  오디오:  python3 tools/make_lesson.py 파일.m4a --lang ja
  여러 개: python3 tools/make_lesson.py 1.wav 2.wav 3.wav --lang ja        (순서대로 이어 붙여요)
  대본도:  python3 tools/make_lesson.py 파일.m4a --lang en --transcript 대본.txt

하는 일
  1) 문장과 시작 시각 얻기
     - 유튜브: 해당 언어 자막(json3)만 받아요. 영상·오디오는 받지 않아요(플레이어는 유튜브 임베드).
     - 오디오: faster-whisper로 받아 적고, --transcript가 있으면 그 대본 문장에 시각을 맞춰요.
  2) Claude API로 받아쓰기 오류 교정 · 한국어 번역 · 화자 · 섹션
  3) Claude API로 제목 · 요약 · 단어 · 문법 · 표현 · 퀴즈 (meta.json)
  4) lessons/<언어>-<날짜>/ 에 script.txt · meta.json (· audio.m4a) 저장 → tools/build.py 실행
  5) --push 를 주면 git commit + push

필요한 것
  pip3 install anthropic yt-dlp faster-whisper pypinyin pykakasi   (+ ffmpeg)
  Claude API 키: export ANTHROPIC_API_KEY=...   (또는 ant auth login)

중간 결과는 .work/<강의ID>/ 에 저장돼요. 같은 명령을 다시 실행하면 끝난 단계는 건너뛰어요(--fresh로 처음부터).
"""
import argparse, datetime, difflib, json, re, shutil, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LESSONS = ROOT / "lessons"
WORK = ROOT / ".work"

LANGS = {
    "zh": {"name": "중국어", "sub": ["zh-Hans", "zh-CN", "zh", "zh-Hant", "zh-TW"], "whisper": "medium", "level": "HSK"},
    "ja": {"name": "일본어", "sub": ["ja"], "whisper": "medium", "level": "JLPT"},
    "es": {"name": "스페인어", "sub": ["es", "es-419", "es-ES", "es-MX"], "whisper": "medium", "level": "CEFR"},
    "en": {"name": "영어", "sub": ["en", "en-US", "en-GB"], "whisper": "small.en", "level": "CEFR"},
}
CJK = ("zh", "ja")
END_PUNCT = "。！？!?…"


def log(*a):
    print("·", *a, flush=True)


def mmss(t):
    t = max(0.0, t)
    return f"{int(t // 60):02d}:{t % 60:05.2f}"


def mmss_short(t):
    return f"{int(t // 60)}:{int(round(t % 60)):02d}"


def cached(path, fn, fresh):
    if path.exists() and not fresh:
        return json.loads(path.read_text(encoding="utf-8"))
    data = fn()
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    return data


# ───────────────────────── 1. 문장 + 시각 ─────────────────────────

def youtube_id(s):
    m = re.search(r"(?:v=|youtu\.be/|shorts/|embed/)([\w-]{11})", s)
    return m.group(1) if m else None


def from_youtube(vid, lang):
    """자막 json3 → 문장 목록. 영상·오디오는 받지 않아요."""
    info = json.loads(subprocess.run(
        ["yt-dlp", "--no-update", "-J", "--skip-download", f"https://www.youtube.com/watch?v={vid}"],
        capture_output=True, text=True, check=True).stdout)
    manual, auto = info.get("subtitles") or {}, info.get("automatic_captions") or {}
    pick = next(((c, False) for c in LANGS[lang]["sub"] if c in manual), None) \
        or next(((c, True) for c in LANGS[lang]["sub"] if c in auto), None)
    if not pick:
        sys.exit(f"이 영상에는 {LANGS[lang]['name']} 자막이 없어요. "
                 "유튜브의 '스크립트 표시'를 복사해서 --transcript로 주거나, 오디오 파일로 만들어 주세요.")
    code, is_auto = pick
    log(f"자막: {code}{' (자동 생성)' if is_auto else ''}")
    with tempfile.TemporaryDirectory() as td:
        subprocess.run(["yt-dlp", "--no-update", "--skip-download",
                        "--write-auto-subs" if is_auto else "--write-subs",
                        "--sub-langs", code, "--sub-format", "json3", "-o", f"{td}/s",
                        f"https://www.youtube.com/watch?v={vid}"], capture_output=True, check=True)
        f = next(Path(td).glob("*.json3"), None)
        if not f:
            sys.exit("자막 파일을 받지 못했어요.")
        ev = json.loads(f.read_text(encoding="utf-8")).get("events", [])
    cues = []
    for e in ev:
        txt = "".join(s.get("utf8", "") for s in e.get("segs") or []).replace("\n", " ").strip()
        if txt:
            cues.append({"t": e.get("tStartMs", 0) / 1000, "text": txt})
    sents = cues_to_sentences(cues, lang)
    meta = {"youtube": vid, "videoTitle": info.get("title", ""), "channel": info.get("channel") or info.get("uploader", ""),
            "duration": info.get("duration") or (sents[-1]["t"] + 5 if sents else 0), "auto_captions": is_auto}
    return sents, meta


def cues_to_sentences(cues, lang):
    """자막 조각을 문장 단위로 합쳐요. 문장 부호가 없는 자동 자막은 조각 그대로 써요(나중에 Claude가 부호를 넣어요)."""
    has_punct = sum(any(p in c["text"] for p in END_PUNCT + ".") for c in cues) > len(cues) * 0.3
    if not has_punct:
        return [{"t": c["t"], "text": c["text"]} for c in cues]
    # 한 조각 안에 문장이 여럿이면 문장 부호에서 나누고, 다음 조각까지의 시간을 글자 수 비율로 나눠요
    pat = r"(?<=[。！？!?])" if lang in CJK else r"(?<=[.!?])\s+"
    pieces = []
    for n, c in enumerate(cues):
        nxt = cues[n + 1]["t"] if n + 1 < len(cues) else c["t"] + 3
        parts = [p for p in re.split(pat, c["text"]) if p.strip()]
        total, acc = sum(map(len, parts)) or 1, 0
        for p in parts:
            pieces.append({"t": c["t"] + (nxt - c["t"]) * acc / total, "text": p.strip()})
            acc += len(p)
    cues = pieces
    out, cur, start = [], "", None
    sep = "" if lang in CJK else " "
    for c in cues:
        start = c["t"] if start is None else start
        cur = (cur + sep + c["text"]).strip()
        if cur[-1:] in END_PUNCT + "." and len(cur) > 3:
            out.append({"t": start, "text": cur})
            cur, start = "", None
    if cur:
        out.append({"t": start, "text": cur})
    return out


def prepare_audio(files, out):
    """여러 파일을 순서대로 이어 붙여 64k 모노 AAC 하나로 만들어요."""
    with tempfile.TemporaryDirectory() as td:
        lst = Path(td) / "l.txt"
        lst.write_text("".join(f"file '{Path(f).resolve()}'\n" for f in files), encoding="utf-8")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
                        "-ac", "1", "-b:a", "64k", "-c:a", "aac", str(out)], check=True)
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(out)],
                                capture_output=True, text=True, check=True).stdout)


def whisper_words(audio, lang):
    from faster_whisper import WhisperModel
    log(f"faster-whisper {LANGS[lang]['whisper']}로 받아 적는 중… (오디오 길이의 절반쯤 걸려요)")
    m = WhisperModel(LANGS[lang]["whisper"], device="cpu", compute_type="int8")
    segs, _ = m.transcribe(str(audio), language=lang, word_timestamps=True, beam_size=5)
    words = []
    for s in segs:
        words += [[w.start, w.end, w.word] for w in s.words]
        print(f"  {mmss(s.start)} {s.text.strip()[:60]}", flush=True)
    return words


def words_to_sentences(words, lang):
    out, cur = [], []
    sep = "" if lang in CJK else ""
    for i, w in enumerate(words):
        cur.append(w)
        nxt = words[i + 1][0] if i + 1 < len(words) else None
        t = w[2].strip()
        if (t[-1:] in END_PUNCT + "." and len(cur) > 2) or (nxt and nxt - w[1] > 0.7 and len(cur) > 3):
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return [{"t": s[0][0], "e": s[-1][1], "text": sep.join(w[2] for w in s).strip()} for s in out]


def pitch_hint(audio, sents):
    """문장마다 목소리 높낮이(F0 중앙값, Hz). 화자를 나눌 때 Claude에게 참고로만 줘요."""
    try:
        import numpy as np
    except ImportError:
        return
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(audio), "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
                         capture_output=True).stdout
    x = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768
    for s in sents:
        seg, fs = x[int(s["t"] * 16000):int(s.get("e", s["t"] + 3) * 16000)], []
        for k in range(0, len(seg) - 640, 320):
            fr = seg[k:k + 640]
            if np.sqrt((fr ** 2).mean()) < 0.02:
                continue
            fr = fr - fr.mean()
            c = np.correlate(fr, fr, "full")[639:]
            lo, hi = 16000 // 400, 16000 // 70
            j = lo + int(np.argmax(c[lo:hi]))
            if c[j] > 0.4 * c[0]:
                fs.append(16000 / j)
        s["f0"] = int(np.median(fs)) if fs else 0


def split_transcript(text, lang):
    """사용자 대본 → 문장 목록. '이름: 대사' 형식이면 화자도 기억해요. #으로 시작하는 줄은 무시."""
    out = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        spk = None
        m = re.match(r"^([^:：\s][^:：]{0,15})[:：]\s*(.+)$", line)
        if m and not re.match(r"^\d", m.group(1)):
            spk, line = m.group(1).strip(), m.group(2)
        line = re.sub(r"^\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*", "", line)  # 유튜브 스크립트의 시각 표시 제거
        parts, cur, depth = [], "", 0
        for ch in line:
            cur += ch
            depth += ch in "「『“(（" and 1 or 0
            depth -= ch in "」』”)）" and 1 or 0
            if depth <= 0 and (ch in END_PUNCT or (ch == "." and lang not in CJK)):
                parts.append(cur.strip())
                cur, depth = "", 0
        if cur.strip():
            parts.append(cur.strip())
        out += [{"text": p, "spk": spk} for p in parts if re.search(r"\w", p)]
    if sum(r["spk"] is not None for r in out) > len(out) / 2:  # 대사 형식 대본이면 화자 없는 줄(지시문 등)은 빼요
        out = [r for r in out if r["spk"] is not None]
    return out


def align(rows, words, lang):
    """대본 문장에 받아쓰기 단어 시각을 붙여요 (글자/단어 단위 difflib)."""
    norm = (lambda s: [c for c in s if re.match(r"\w", c)]) if lang in CJK else \
        (lambda s: re.findall(r"[\w']+", s.lower()))
    A, AT = [], []
    for st, en, w in words:
        toks = norm(w)
        for k, tk in enumerate(toks):
            A.append(tk)
            AT.append(st + (en - st) * k / max(1, len(toks)))
    B, BI = [], []
    for i, r in enumerate(rows):
        for tk in norm(r["text"]):
            B.append(tk)
            BI.append(i)
    bt = [None] * len(B)
    for a, b, n in difflib.SequenceMatcher(None, B, A, autojunk=False).get_matching_blocks():
        for k in range(n):
            bt[a + k] = AT[b + k]
    rate = sum(x is not None for x in bt) / max(1, len(B))
    log(f"대본-오디오 맞춤: {rate:.0%} 일치")
    first = {}
    for j, i in enumerate(BI):
        first.setdefault(i, j)
        if "t" not in rows[i] and bt[j] is not None:
            rows[i]["t"] = bt[j] - (j - first[i]) * (0.12 if lang in CJK else 0.3)
    known = [i for i, r in enumerate(rows) if "t" in r]
    for i, r in enumerate(rows):  # 못 맞춘 문장은 앞뒤 사이로
        if "t" not in r:
            p = max((k for k in known if k < i), default=None)
            n = min((k for k in known if k > i), default=None)
            tp = rows[p]["t"] if p is not None else 0
            tn = rows[n]["t"] if n is not None else tp + 3
            r["t"] = (tp + tn) / 2
    for i in range(1, len(rows)):
        rows[i]["t"] = max(rows[i]["t"], rows[i - 1]["t"] + 0.05)
    return rows, rate


# ───────────────────────── 2·3. Claude ─────────────────────────

def claude_json(client, model, system, prompt, schema, effort="medium"):
    import anthropic
    kw = dict(model=model, max_tokens=64000, system=system,
              messages=[{"role": "user", "content": prompt}],
              output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}})
    if model in ("claude-opus-5-5", "claude-sonnet-5-5", "claude-opus-5", "claude-fable-5-1", "claude-fable-5-2"):
        kw.update(betas=["server-side-fallback-2026-07-01"], fallbacks="default")  # 안전 거절 시 서버가 다른 모델로 재시도
        stream = client.beta.messages.stream(**kw)
    else:
        stream = client.messages.stream(**kw)
    try:
        with stream as s:
            msg = s.get_final_message()
    except anthropic.AuthenticationError:
        sys.exit("Claude API 키가 없거나 틀렸어요. export ANTHROPIC_API_KEY=... 를 먼저 해 주세요.")
    except anthropic.RateLimitError:
        sys.exit("API 사용량 한도에 걸렸어요. 잠시 뒤 같은 명령을 다시 실행하면 이어서 해요.")
    except anthropic.APIConnectionError:
        sys.exit("네트워크 오류예요. 연결을 확인하고 다시 실행해 주세요.")
    if msg.stop_reason == "refusal":
        sys.exit(f"Claude가 이 내용 처리를 거절했어요: {getattr(msg.stop_details, 'explanation', '')}")
    if msg.stop_reason == "max_tokens":
        sys.exit("응답이 너무 길어 잘렸어요. --chunk 값을 줄여서 다시 실행해 주세요.")
    text = next(b.text for b in msg.content if b.type == "text")
    u = msg.usage
    log(f"  토큰 입력 {u.input_tokens:,} / 출력 {u.output_tokens:,}")
    return json.loads(text)


def obj(props, req=None):
    return {"type": "object", "properties": props, "required": req or list(props), "additionalProperties": False}


S, I = {"type": "string"}, {"type": "integer"}
ARR = lambda x: {"type": "array", "items": x}

TRANSLATE_SCHEMA = obj({
    "lines": ARR(obj({"i": I, "text": S, "ko": S, "speaker": S})),
    "sections": ARR(obj({"i": I, "title": S})),
    "speakers": ARR(obj({"code": S, "name": S})),
})


def translate(client, model, lang, rows, info, chunk, work, fresh):
    name = LANGS[lang]["name"]
    system = (
        f"너는 한국인 학습자를 위한 {name} 청취 강의를 만드는 편집자야. 원문 문장 목록을 받아서 다음을 해.\n"
        "1) text: 받아쓰기 오류(동음이의어, 고유명사, 빠진 문장 부호)를 문맥으로 바로잡은 원문. 내용·말투는 바꾸지 말고, 문장을 합치거나 나누지 마.\n"
        "   자막에 문장 부호가 없으면 자연스럽게 넣어. 중국어는 간체자와 전각 부호(，。？！)를 써.\n"
        "2) ko: 자연스러운 한국어 번역. 구어체 '-요' 말투, 학습자가 원문과 대응을 찾기 쉽게 너무 의역하지 마.\n"
        "3) speaker: 짧은 화자 코드(A, B, 또는 이름 머리글자). 대화 흐름(질문-대답, 맞장구)과 f0(목소리 높낮이 Hz, 0은 모름)를 참고해 정해. "
        "   주어진 화자 정보가 있으면 그대로 따라. 한 사람만 말하면 모두 같은 코드.\n"
        "4) sections: 주제가 바뀌는 문장 번호 i와 한국어 섹션 제목(예: '① 문자의 역사 — 읽기 전용 영역은 없다'). 첫 문장은 반드시 포함. 15분에 5~8개 정도.\n"
        "5) speakers: 이번에 쓴 화자 코드와 표시 이름(원어 이름을 알면 원어로, 모르면 '진행자 A'처럼).\n"
        "모든 입력 문장에 대해 같은 i로 정확히 한 줄씩 돌려줘."
    )
    out_lines, out_secs, speakers = {}, [], {}
    for k in range(0, len(rows), chunk):
        part = rows[k:k + chunk]
        cache = work / f"tr_{k:04d}.json"

        def run():
            ctx = "\n".join(f"{j}\t{rows[j]['text']}" for j in range(max(0, k - 6), k))
            body = "\n".join(
                f"{k + j}\t[{mmss(r['t'])}]\tf0={r.get('f0', 0)}\t{('화자=' + r['spk'] + chr(9)) if r.get('spk') else ''}{r['text']}"
                for j, r in enumerate(part))
            prompt = (f"자료: {info}\n지금까지 정한 화자: {json.dumps(speakers, ensure_ascii=False) or '없음'}\n"
                      + (f"\n(앞 문맥, 번역하지 마)\n{ctx}\n" if ctx else "")
                      + f"\n문장 {k}~{k + len(part) - 1}:\n{body}")
            log(f"Claude: 교정·번역 {k + 1}~{k + len(part)} / {len(rows)}")
            return claude_json(client, model, system, prompt, TRANSLATE_SCHEMA)

        res = cached(cache, run, fresh)
        for ln in res["lines"]:
            out_lines[ln["i"]] = ln
        out_secs += [s for s in res["sections"] if k <= s["i"] < k + len(part)]
        speakers.update({s["code"]: s["name"] for s in res["speakers"]})
    missing = [i for i in range(len(rows)) if i not in out_lines]
    if missing:
        sys.exit(f"번역이 빠진 문장이 있어요: {missing[:10]}… --fresh 없이 다시 실행하면 해당 부분만 다시 해요"
                 " (.work 안의 tr_*.json 중 해당 파일을 지워 주세요).")
    return out_lines, out_secs, speakers


def meta_schema(lang):
    ex = obj({"text": S, "reading": S, "ko": S})
    return obj({
        "title": S, "original_title": S, "emoji": S, "level": S, "summary": S,
        "topics": ARR(S),
        "grammar": ARR(obj({"title": S, "lead": S, "examples": ARR(ex), "tip": S})),
        "phrases": ARR(obj({"text": S, "ko": S})),
        "vocab": ARR(obj({"word": S, "reading": S, "ko": S, "ex": S, "exKo": S})),
        "quiz": ARR(obj({"q": S, "options": ARR(S), "answer": I, "explain": S})),
    })


def make_meta(client, model, lang, lines, info, n_vocab):
    name, lv = LANGS[lang]["name"], LANGS[lang]["level"]
    reading = {"zh": "병음(성조 부호, 예: sànbù)", "ja": "히라가나 읽기", "es": "빈 문자열", "en": "빈 문자열"}[lang]
    system = (
        f"너는 한국인 학습자를 위한 {name} 청취 강의 자료를 만드는 교사야. 대본을 읽고 학습 자료를 JSON으로 만들어.\n"
        f"- title: 한국어 강의 제목 '핵심 주제 — 부제' 형식. original_title: 원어로 된 짧은 제목. emoji: 이모지 1개.\n"
        f"- level: '{lv} 4–5'처럼 범위. summary: 한국어 4~6문장, 내용 흐름과 배울 점.\n"
        "- topics: 원어로 된 주제 4~6개(짧은 구).\n"
        "- grammar: 6개. title은 '① 구문 — 한국어 뜻' 형식, lead는 언제 쓰는지 한 문장, examples 2~3개는 반드시 대본에 나온 문장 그대로, "
        f"reading은 {reading}(문장 전체), tip은 짧은 팁.\n"
        "- phrases: 대본에서 그대로 따라 말하기 좋은 짧은 표현 10개.\n"
        f"- vocab: {n_vocab}개 내외. word는 사전형, reading은 {reading}, ko는 뜻, ex는 대본에 나온 예문 그대로, exKo는 번역.\n"
        "- quiz: 12문항. 원어로 묻고, 4지선다, answer는 0부터 시작하는 정답 번호, explain은 근거가 되는 대본 문장. 정답 위치를 골고루 섞어.\n"
        "대본에 없는 내용을 지어내지 마."
    )
    script = "\n".join(f"{l['speaker']}: {l['text']} ({l['ko']})" for l in lines)
    log("Claude: 단어·문법·퀴즈 만드는 중")
    return claude_json(client, model, system, f"자료: {info}\n\n대본:\n{script}", meta_schema(lang), effort="high")


# ───────────────────────── 4. 파일 쓰기 ─────────────────────────

def lesson_id(lang, date):
    base = f"{lang}-{date}"
    if not (LESSONS / base).exists():
        return base
    n = 2
    while (LESSONS / f"{base}-{n}").exists():
        n += 1
    return f"{base}-{n}"


def write_script(path, rows, lines, sections, speakers, duration, src_note):
    sec_at = {s["i"]: s["title"] for s in sections}
    sec_at.setdefault(0, "대본")
    out = ["# 형식: [mm:ss.ss] 문장 시작 시각 / ## 섹션 제목 / 화자 | 원문 | 한국어",
           "# 화자: " + ", ".join(f"{c} = {n}" for c, n in speakers.items()) + ". END = 끝 시각",
           f"# 원본: {src_note}. tools/make_lesson.py로 자동 생성(Claude가 교정·번역).",
           f"END {mmss_short(duration)}", "", ""]
    for i, r in enumerate(rows):
        ln = lines[i]
        txt, ko = ln["text"].replace("|", "/").strip(), ln["ko"].replace("|", "/").strip()
        if not txt:
            continue
        out.append(f"[{mmss(r['t'])}]")
        if i in sec_at:
            out.append("## " + sec_at[i])
        out.append(f"{ln['speaker'] or 'A'} | {txt} | {ko or '…'}")
    path.write_text("\n".join(out) + "\n", encoding="utf-8")


def write_meta(path, lang, date, m, src, speakers, duration):
    ja = lang == "ja"

    def ex(e):
        return [e["text"], e["reading"], e["ko"]] if ja else [e["text"], e["ko"]]

    vocab = []
    for v in m["vocab"]:
        d = {"es": v["word"], "ko": v["ko"], "ex": v["ex"], "exKo": v["exKo"]}
        if lang in CJK and v["reading"]:
            d = {"es": v["word"], "py": v["reading"], **{k: d[k] for k in ("ko", "ex", "exKo")}}
        vocab.append(d)
    meta = {"lang": lang, "date": date, "title": m["title"], "es": m["original_title"], "emoji": m["emoji"],
            "level": m["level"], "channel": src.get("channel", ""), "videoTitle": src.get("videoTitle", "")}
    meta.update({"youtube": src["youtube"]} if src.get("youtube") else {"audio": "audio.m4a"})
    meta.update({
        "duration": mmss_short(duration), "speakers": speakers,
        **({"hideCast": True} if src.get("hideCast") else {}),
        "summary": m["summary"], "topics": m["topics"],
        "grammar": [{"title": g["title"], "lead": g["lead"], "examples": [ex(e) for e in g["examples"]], "tip": g["tip"]}
                    for g in m["grammar"]],
        "phrases": [[p["text"], p["ko"]] for p in m["phrases"]],
        "vocab": vocab,
        "quiz": [q for q in m["quiz"] if 0 <= q["answer"] < len(q["options"])],
    })
    path.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")


def review_readings(lid, lang):
    """자동 병음/후리가나 중 자주 틀리는 글자를 문맥과 함께 보여 줘요 (build.py의 FORCE / JA_FORCE로 고쳐요)."""
    d = json.loads((LESSONS / lid / "data.json").read_text(encoding="utf-8"))
    # 중국어: 다음자(多音字) 목록에 있는 글자 / 일본어: 한 강의 안에서 읽기가 둘 이상이거나 숫자 바로 뒤에 오는 한자
    watch = set("着长重处得地还觉了为行只弹背中好分发当种差干应假几数量调便相省空传")
    seen = {}  # (글자, 읽기) → 예시 문맥 하나
    for s in d["sections"]:
        for l in s["lines"]:
            rb = l.get("rb") or []
            for k, (ch, py) in enumerate(rb):
                if not py:
                    continue
                ctx = "".join(x[0] for x in rb[max(0, k - 2):k + 3])
                after_digit = k > 0 and re.search(r"\d$", rb[k - 1][0])
                if lang == "zh" and ch not in watch:
                    continue
                seen.setdefault((ch, py), (ctx, bool(after_digit)))
    if lang == "ja":
        multi = {c for c, _ in seen if sum(1 for c2, _ in seen if c2 == c) > 1}
        seen = {k: v for k, v in seen.items() if k[0] in multi or v[1]}
    if seen:
        print("\n읽기 확인용 — 틀린 게 있으면 tools/build.py의 FORCE(중국어)/JA_FORCE(일본어)에 구절을 추가하고 다시 빌드:")
        for (c, p), (x, _) in sorted(seen.items()):
            print(f"  {c}({p})  〔{x}〕")


# ───────────────────────── main ─────────────────────────

def main():
    ap = argparse.ArgumentParser(description="유튜브 링크나 오디오로 강의 만들기", formatter_class=argparse.RawDescriptionHelpFormatter,
                                 epilog=__doc__)
    ap.add_argument("source", nargs="+", help="유튜브 링크 또는 오디오 파일(여러 개면 순서대로 이어 붙임)")
    ap.add_argument("--lang", required=True, choices=LANGS)
    ap.add_argument("--transcript", help="대본 텍스트 파일 ('이름: 대사' 형식이면 화자도 반영)")
    ap.add_argument("--date", default=datetime.date.today().isoformat())
    ap.add_argument("--title", help="자료 제목(오디오일 때 videoTitle로 써요)")
    ap.add_argument("--channel", default="", help="채널/출처 이름")
    ap.add_argument("--model", default="claude-opus-5-5", help="Claude 모델 (기본 claude-opus-5-5)")
    ap.add_argument("--vocab", type=int, default=55, help="단어 개수 (기본 55)")
    ap.add_argument("--chunk", type=int, default=120, help="번역 한 번에 보낼 문장 수")
    ap.add_argument("--hide-cast", action="store_true", help="화자 이름 숨기기(딥 다이브 형식)")
    ap.add_argument("--no-llm", action="store_true", help="Claude 없이 문장·시각만 만들기(번역 칸은 비움)")
    ap.add_argument("--fresh", action="store_true", help="저장된 중간 결과를 무시하고 처음부터")
    ap.add_argument("--push", action="store_true", help="빌드 후 git commit + push")
    a = ap.parse_args()

    lang, vid = a.lang, youtube_id(a.source[0])
    key = vid or Path(a.source[0]).stem
    safe = re.sub(r"[^\w-]", "_", key)[:40]
    work = WORK / f"{lang}-{a.date}-{safe}"
    work.mkdir(parents=True, exist_ok=True)
    log(f"작업 폴더: {work.relative_to(ROOT)}")

    # 1. 문장 + 시각
    if vid:
        if a.transcript:
            sys.exit("유튜브 링크에는 --transcript 대신 자막을 써요. 대본으로 하려면 오디오 파일을 주세요.")
        sents, src = cached(work / "source.json", lambda: list(from_youtube(vid, lang)), a.fresh)
        rows, duration = sents, src["duration"]
        src_note = f"유튜브 {vid} {'자동' if src.get('auto_captions') else ''}자막 시각"
        audio = None
    else:
        for f in a.source:
            if not Path(f).exists():
                sys.exit(f"파일이 없어요: {f}")
        audio = work / "audio.m4a"
        if not audio.exists() or a.fresh:
            log("오디오 합치고 64k로 줄이는 중")
        duration = prepare_audio(a.source, audio) if (not audio.exists() or a.fresh) else \
            float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(audio)],
                                 capture_output=True, text=True).stdout)
        words = cached(work / "words.json", lambda: whisper_words(audio, lang), a.fresh)
        if a.transcript:
            rows = split_transcript(Path(a.transcript).read_text(encoding="utf-8"), lang)
            rows, rate = align(rows, words, lang)
            if rate < 0.6:
                log("⚠ 대본과 오디오가 많이 달라요. 다른 파일이 아닌지 확인해 주세요.")
            src_note = "사용자 오디오 + 대본, faster-whisper 단어 시각에 맞춤"
        else:
            rows = words_to_sentences(words, lang)
            src_note = "사용자 오디오, faster-whisper로 받아 적음"
        pitch_hint(audio, rows)
        src = {"videoTitle": a.title or Path(a.source[0]).stem, "channel": a.channel}
    src["hideCast"] = a.hide_cast
    if a.channel:
        src["channel"] = a.channel
    log(f"문장 {len(rows)}개, 길이 {mmss_short(duration)}")

    # 2·3. Claude
    info = f"{LANGS[lang]['name']} 자료 '{src.get('videoTitle', '')}' ({src.get('channel', '')}), 길이 {mmss_short(duration)}"
    if a.no_llm:
        lines = {i: {"text": r["text"], "ko": "", "speaker": r.get("spk") or "A"} for i, r in enumerate(rows)}
        sections, speakers, m = [], {"A": "화자"}, None
    else:
        import anthropic
        client = anthropic.Anthropic()
        lines, sections, speakers = translate(client, a.model, lang, rows, info, a.chunk, work, a.fresh)
        m = cached(work / "meta_llm.json",
                   lambda: make_meta(client, a.model, lang, [lines[i] for i in range(len(rows))], info, a.vocab), a.fresh)

    # 4. 파일
    lid = lesson_id(lang, a.date)
    d = LESSONS / lid
    d.mkdir(parents=True)
    write_script(d / "script.txt", rows, lines, sections, speakers, duration, src_note)
    if audio:
        shutil.copy(audio, d / "audio.m4a")
    if m:
        write_meta(d / "meta.json", lang, a.date, m, src, speakers, duration)
    else:
        (d / "meta.json").write_text(json.dumps({
            "lang": lang, "date": a.date, "title": src.get("videoTitle", lid), "es": src.get("videoTitle", ""),
            "emoji": "📝", "level": "", "channel": src.get("channel", ""), "videoTitle": src.get("videoTitle", ""),
            **({"youtube": src["youtube"]} if src.get("youtube") else {"audio": "audio.m4a"}),
            "duration": mmss_short(duration), "speakers": speakers, "summary": "", "topics": [], "grammar": [],
            "phrases": [], "vocab": [], "quiz": []}, ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"저장: lessons/{lid}/")
    subprocess.run([sys.executable, str(ROOT / "tools" / "build.py")], check=True, cwd=ROOT)
    if lang in CJK:
        review_readings(lid, lang)

    # 5. push
    if a.push:
        msg = f"강의 추가: {lid} {(m or {}).get('original_title', '')} (make_lesson.py)"
        subprocess.run(["git", "add", "lessons", "lessons.json", "tools"], check=True, cwd=ROOT)
        subprocess.run(["git", "commit", "-q", "-m", msg], check=True, cwd=ROOT)
        subprocess.run(["git", "pull", "--rebase", "-q"], check=True, cwd=ROOT)
        subprocess.run(["git", "push", "-q"], check=True, cwd=ROOT)
        log("push 완료. 1~2분 뒤 사이트에 나타나요.")
    print(f"\n완료 → https://lkj640.github.io/chungho-spanish/lesson.html?d={lid}")


if __name__ == "__main__":
    main()
