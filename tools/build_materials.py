#!/usr/bin/env python3
"""언어별 자료실 만들기: tools/materials_<언어>.json + 원본 폴더 → materials/<언어>/

- 원본 파일(PDF·Word·녹음)을 materials/<언어>/<자료 id>/ 에 짧은 이름으로 복사해요.
- 깨끗한 원문이 있는 자료는 읽기용 JSON을 만들어요 (중국어는 한자마다 병음, tools/build.py와 같은 규칙).
- materials/<언어>/index.json 에 전체 목록을 써요.

사용법:  python3 tools/build_materials.py zh     (중국어: 원어민중국어회화공부, 날짜별)
         python3 tools/build_materials.py es     (스페인어: 유튜브 팟캐스트, 레벨별)
"""
import datetime, json, re, shutil, sys, unicodedata, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import build  # add_pinyin 재사용

LANG = sys.argv[1] if len(sys.argv) > 1 else "zh"
CONF = json.loads((ROOT / "tools" / f"materials_{LANG}.json").read_text(encoding="utf-8"))
SRC = Path(CONF.get("src", "~/Library/Mobile Documents/com~apple~CloudDocs/중국어 공부/원어민중국어회화공부")).expanduser()
OUT = ROOT / "materials" / LANG

KIND = {".pdf": "pdf", ".docx": "word", ".m4a": "audio", ".mp3": "audio"}


def find(d, name):
    """이름에 특수 문자·정규화 차이가 있어도 원본 파일을 찾아요."""
    p = d / name
    if p.exists():
        return p
    d, name = p.parent, p.name
    nfc = lambda x: re.sub(r"[\W_]+", "", unicodedata.normalize("NFC", x))
    want = nfc(name)
    cands = [f for f in d.iterdir() if f.suffix.lower() == Path(name).suffix.lower()]
    for f in cands:
        if nfc(f.name) == want:
            return f
    hits = [f for f in cands if nfc(f.name)[:12] == want[:12]]
    if len(hits) == 1:
        return hits[0]
    sys.exit(f"없는 파일: {p}")


def read_text(p):
    if p.suffix == ".docx":
        x = zipfile.ZipFile(p).read("word/document.xml").decode("utf-8")
        return "\n".join("".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", para)) for para in re.findall(r"<w:p[ >].*?</w:p>", x, re.S))
    if p.suffix == ".pdf":
        import pypdf
        return "\n".join((pg.extract_text() or "") for pg in pypdf.PdfReader(str(p)).pages)
    return p.read_text(encoding="utf-8", errors="ignore")


NA = r"[^\x00-\x7f]"  # 한자·한글·전각 문장부호


def tidy(s):
    if LANG != "zh":
        return re.sub(r"\s+", " ", s).strip()
    s = re.sub(rf"(?<={NA})\s+(?={NA})", "", s)      # 한자 사이 공백·줄바꿈(PDF 줄바꿈) 제거
    s = re.sub(r"[🙋🎙●•]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def sentences(s):
    # 마침표류에서 끊고, 너무 짧은 조각은 앞 문장에 붙여요
    parts = [p for p in re.split(r"(?<=[。！？!?])\s*" if LANG == "zh" else r"(?<=[.!?])\s+", s) if p.strip()]
    out = []
    for p in parts:
        if out and len(out[-1]) < (14 if LANG == "zh" else 30):
            out[-1] += p if LANG == "zh" else " " + p
        else:
            out.append(p)
    return out


def parse(text, t):
    mode = t["mode"]
    if t.get("after") and t["after"] in text:
        text = text.split(t["after"], 1)[1]
    raw = [l for l in text.split("\n")]
    if t.get("skip_first"):
        raw = [l for l in raw if l.strip()][t["skip_first"]:]
    names = t.get("names", {})
    lines = []  # [(speaker, text)]
    if mode == "ab":
        cur = None
        for l in raw:
            l = l.strip()
            if l in ("A", "B"):
                cur = names.get(l, l)
            elif l and cur and re.search(r"[一-鿿]", l):
                lines.append((cur, tidy(l)))
    elif mode == "kor":
        body = tidy("\n".join(raw))
        for m in re.finditer(r"(왕우|이명)\s*\((王雨|李明)\)\s*(.*?)(?=(?:왕우|이명)\s*\((?:王雨|李明)\)|$)", body):
            if m.group(3).strip():
                lines.append((m.group(2), m.group(3).strip()))
    elif mode in ("colon", "spaced"):
        body = "\n".join(raw)
        if mode == "spaced":
            body = re.sub(r"\s+", "", body)
        lab = r"(?<![\u4e00-\u9fff])((?:[A-Z]|[\u4e00-\u9fff]{2,3}))\s*(?:\(([^)]{1,6})\))?\s*[:：]"
        ms = list(re.finditer(lab, body))
        # 자주 나오는 이름만 화자로 인정해요 ("鲍曼说：" 같은 인용은 대사의 일부)
        from collections import Counter
        cnt = Counter(m.group(1) for m in ms)
        ms = [m for m in ms if cnt[m.group(1)] >= 3]
        if ms and ms[0].start() > 0:
            head = tidy(body[:ms[0].start()])
            if head and len(head) < 120:
                lines.append(("", head))
        for i, m in enumerate(ms):
            seg = body[m.end(): ms[i + 1].start() if i + 1 < len(ms) else len(body)]
            spk = m.group(2) or names.get(m.group(1), m.group(1))
            seg = tidy(seg)
            if seg:
                lines.append((spk, seg))
    elif mode == "interleaved":
        for l in raw:
            if re.search(r"[一-鿿]", l):
                lines.append(("", tidy(l)))
    else:  # plain
        body = re.sub(r"[\[(]\d+:\d\d[\])]", " ", "\n".join(raw))
        for s in sentences(tidy(body)):
            lines.append(("", s))
    return lines


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    index = []
    for s in CONF["sessions"]:
        key = s.get("id") or s["date"]
        d = SRC if "id" in s else SRC / s["date"]
        dst = OUT / key
        dst.mkdir()
        files, n, born = [], {}, []
        for name, label in s["files"]:
            p = find(d, name)
            born.append(p.stat().st_birthtime)
            k = KIND[p.suffix.lower()]
            n[k] = n.get(k, 0) + 1
            short = f"{k}{n[k] if n[k] > 1 else ''}{p.suffix.lower()}"
            shutil.copy2(p, dst / short)
            files.append({"kind": k, "label": label, "path": f"{key}/{short}", "size": p.stat().st_size})
        texts = []
        for i, t in enumerate(s.get("texts", []), 1):
            src = find(d, t["src"])
            born.append(src.stat().st_birthtime)
            lines = parse(read_text(src), t)
            sec = [{"title": t["title"], "lines": [{"s": spk, "es": es, "ko": ""} for spk, es in lines]}]
            if LANG == "zh":
                build.add_pinyin(sec)
            tid = f"{key}-{i}"
            out_lines = [{"s": l["s"], "rb": l.get("rb") or [[l["es"], ""]]} for l in sec[0]["lines"]]
            (OUT / f"{tid}.json").write_text(json.dumps({"title": t["title"], "lines": out_lines}, ensure_ascii=False), encoding="utf-8")
            texts.append({"id": tid, "title": t["title"], "lines": len(out_lines)})
            print(f"  ✓ {tid} {t['title']}: {len(out_lines)}줄 · 화자 {sorted({l['s'] for l in out_lines if l['s']})}")
        # 자료를 만든 날짜: 원본 파일 중 가장 먼저 만든 파일의 생성일 (파일이 없으면 연결된 강의 날짜)
        made = s.get("made")
        if not made and born:
            made = datetime.date.fromtimestamp(min(born)).isoformat()
        if not made and s.get("lesson"):
            made = json.loads((ROOT / "lessons" / s["lesson"] / "meta.json").read_text(encoding="utf-8"))["date"]
        if made and "date" not in s:
            s = s | {"made": made}
        index.append({"key": key} | {k: s[k] for k in ("date", "made", "group", "zh", "orig", "ko", "desc", "tags") if k in s}
                     | {"files": files, "texts": texts, "lesson": s.get("lesson"),
                        "videos": [{"id": v, "title": t} for v, t in s.get("videos", [])]})
    if "groups" in CONF:
        order = CONF["groups"]
        index.sort(key=lambda x: x.get("made", ""), reverse=True)    # 같은 레벨 안에서는 최근에 만든 자료부터
        index.sort(key=lambda x: order.index(x["group"]))             # 레벨 순서 (정렬이 안정적이라 날짜 순서 유지)
    else:
        index.sort(key=lambda x: x["date"], reverse=True)
    meta = {k: CONF[k] for k in ("lang", "title", "groups") if k in CONF}
    (OUT / "index.json").write_text(json.dumps(meta | {"sessions": index}, ensure_ascii=False, indent=1), encoding="utf-8")
    size = sum(f.stat().st_size for f in OUT.rglob("*") if f.is_file())
    print(f"✓ materials/{LANG}: {len(index)}회 · 유튜브 연결 {sum(1 for x in index if x['videos'])}회 · {size / 1e6:.1f}MB")


if __name__ == "__main__":
    main()
