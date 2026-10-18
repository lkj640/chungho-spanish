# 📚 충호의 어학 열공 사이트

영어 · 일본어 · 중국어 · 스페인어 유튜브 영상과 transcript로 만드는 날짜별 공부 사이트예요.
홈에는 언어별 최신 강의가 하나씩 보이고, `?lang=en|ja|zh|es`로 언어별 전체 목록을 볼 수 있어요.
강의마다 이런 걸 볼 수 있어요.

- 🎧 **듣기**: 문장을 누르면 그 부분부터 재생, 한국어 번역, 받아쓰기 모드, 문장 반복, 재생 속도
- 📘 **문법**: 핵심 문법 정리와 따라 말할 핵심 문장 (🔊 발음 듣기)
- 📝 **단어장**: 뜻 가리기, '외웠어요' 체크 (내 기기에 저장돼요)
- ✏️ **퀴즈**: 객관식 문제와 해설

## 새 강의 추가하기

1. `lessons/<언어>-YYYY-MM-DD/` 폴더를 만들어요 (언어: en · ja · zh · es, 같은 날 또 있으면 `-2`).
2. `script.txt`: transcript를 화자별 문장으로 나누고 한국어 번역을 달아요.
   ```
   END 29:55                 ← 영상 길이
   [00:00]                   ← transcript의 구간 시작 시각
   ## 인사와 소개             ← 섹션 제목 (선택)
   S | Hola a todos. | 안녕하세요 여러분.
   ```
3. `meta.json`: `lang`, 제목, 유튜브 ID, 화자 이름, 문법, 단어, 퀴즈를 넣어요 (기존 강의 파일을 참고하세요).
   중국어는 `pip3 install pypinyin`이 있으면 대본 병음이 자동으로 붙어요. 틀린 병음은 `tools/build.py`의 `PHRASES`에 추가해요.
4. `python3 tools/build.py` 실행 → `data.json`과 `lessons.json`이 만들어져요.
5. commit하고 push하면 GitHub Pages에 반영돼요.

## 내 컴퓨터에서 미리 보기

```bash
python3 -m http.server 8765
```
그다음 http://localhost:8765 를 열어요.
