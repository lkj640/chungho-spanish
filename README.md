# 📚 충호의 어학 열공 사이트

영어 · 일본어 · 중국어 · 스페인어 유튜브 영상과 transcript로 만드는 날짜별 공부 사이트예요.
홈에는 언어별 최신 강의가 하나씩 보이고, `?lang=en|ja|zh|es`로 언어별 전체 목록을 볼 수 있어요.
강의마다 이런 걸 볼 수 있어요.

- 🎧 **듣기**: 문장을 누르면 그 부분부터 재생, 한국어 번역, 받아쓰기 모드, 문장 반복, 재생 속도
- 📘 **문법**: 핵심 문법 정리와 따라 말할 핵심 문장 (🔊 발음 듣기)
- 📝 **단어장**: 뜻 가리기, '외웠어요' 체크 (내 기기에 저장돼요)
- ✏️ **퀴즈**: 객관식 문제와 해설

## 자동으로 강의 만들기 (`tools/make_lesson.py`)

유튜브 링크나 오디오 파일 하나로 대본·한국어 번역·섹션·단어·문법·퀴즈까지 만들어요.

```bash
pip3 install anthropic yt-dlp faster-whisper pypinyin pykakasi   # ffmpeg도 필요해요
export ANTHROPIC_API_KEY=sk-ant-...                              # Claude API 키

python3 tools/make_lesson.py https://youtu.be/XXXXXXXXXXX --lang zh          # 유튜브 (해당 언어 자막 필요)
python3 tools/make_lesson.py 파일.m4a --lang ja                               # 오디오 (Whisper로 받아 적기)
python3 tools/make_lesson.py 1.wav 2.wav 3.wav --lang ja --transcript 대본.txt   # 여러 파일 + 대본
python3 tools/make_lesson.py 파일.m4a --lang en --hide-cast --push             # 딥 다이브, 바로 push
```

- 유튜브는 자막만 받아요(영상·오디오는 받지 않고 화면에서는 유튜브 플레이어로 재생). 자막이 없으면 오디오 파일로 만들어요.
- `--transcript` 대본이 `이름: 대사` 형식이면 화자도 그대로 써요.
- 끝나면 자주 틀리는 병음/후리가나를 문맥과 함께 보여 줘요. 틀린 건 `tools/build.py`의 `FORCE` / `JA_FORCE`에 넣고 `python3 tools/build.py`.
- 중간 결과는 `.work/`에 저장돼서, 도중에 멈춰도 같은 명령을 다시 실행하면 이어서 해요.
- 그 밖의 옵션: `--date`, `--title`, `--channel`, `--model`(기본 `claude-opus-5-5`), `--vocab`, `--no-llm`(번역 없이 문장·시각만), `--fresh`. 전체는 `python3 tools/make_lesson.py -h`.

## 새 강의 추가하기 (손으로)

1. `lessons/<언어>-YYYY-MM-DD/` 폴더를 만들어요 (언어: en · ja · zh · es, 같은 날 또 있으면 `-2`).
2. `script.txt`: transcript를 화자별 문장으로 나누고 한국어 번역을 달아요.
   ```
   END 29:55                 ← 영상 길이
   [00:00]                   ← transcript의 구간 시작 시각
   ## 인사와 소개             ← 섹션 제목 (선택)
   S | Hola a todos. | 안녕하세요 여러분.
   ```
3. `meta.json`: `lang`, 제목, 유튜브 ID, 화자 이름, 문법, 단어, 퀴즈를 넣어요 (기존 강의 파일을 참고하세요).
   중국어는 `pip3 install pypinyin`이 있으면 병음이, 일본어는 `pip3 install pykakasi`가 있으면 후리가나가 자동으로 붙어요.
   틀린 읽기는 `tools/build.py`의 `PHRASES`(중국어) / `JA_FIX`(일본어)에 추가해요.
   유튜브 영상이 없으면 오디오 파일을 폴더에 넣고 `"audio": "audio.m4a"`라고 적어요.
   유튜브와 오디오를 둘 다 적으면 강의 화면에 🎧 MP3(광고 없음) / 🎬 유튜브 전환 버튼이 생겨요.
   `"game": "<게임 주소>"`를 적으면 탭 줄 끝에 🎮 게임 바로가기가 생겨요 (예: `"lessons/ja-2026-10-26-2/game.html"`).
4. `python3 tools/build.py` 실행 → `data.json`과 `lessons.json`이 만들어져요.
5. commit하고 push하면 GitHub Pages에 반영돼요.

## 내 컴퓨터에서 미리 보기

```bash
python3 -m http.server 8765
```
그다음 http://localhost:8765 를 열어요.
