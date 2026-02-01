# GitHub 웹에서 toeic-words 통째로 다시 올리기

## 1. 지울 것만 지우기

1. GitHub 저장소 열기 (toeic-words-b5vc에 연결된 그 repo).
2. **루트**에 있는 것 중:
   - **index.html, connector.html, app.js, style.css** 가 **폴더 없이** 루트에만 있으면 → 그 파일들 **삭제** (우측 톱니바퀴 → Delete file → Commit).
   - **toeic-words** 폴더가 있는데 안이 꼬여 있으면 → **toeic-words 폴더 통째로 삭제** (폴더 들어가서 파일 하나씩 지우거나, 폴더 전체 삭제).

지울 때 "Commit changes" 할 때 메시지 예: `기존 toeic-words 정리`.

---

## 2. toeic-words 폴더 통째로 올리기

1. 저장소 **루트** 화면에서 **Add file** → **Upload files**.
2. PC에서 **똑패스 → toeic-words 폴더**를 연 다음, **폴더 안의 파일들을 전부 선택** (Ctrl+A) 하고 끌어다가 GitHub 업로드 영역에 **떨군다**.
   - 이렇게 하면 GitHub가 **자동으로 toeic-words 폴더를 만들고** 그 안에 파일들이 들어감.
3. 또는 **toeic-words 폴더 자체를** 끌어다 놓기 (브라우저에 따라 폴더 드래그가 되면 폴더 통째로 올라감).
4. 아래쪽 **Commit changes** 클릭 (메시지 예: `toeic-words 폴더 통째로 업로드`).

---

## 3. api 폴더(루트) 올리기

노션 API 쓰려면 **저장소 루트**에 **api** 폴더가 있어야 함.

1. 저장소 **루트**에서 **Add file** → **Create new file**.
2. 파일 이름에 **api/notion-words.js** 라고 입력 (슬래시 넣으면 api 폴더가 생김).
3. PC에 있는 **똑패스 → api → notion-words.js** 내용을 복사해서 붙여넣기.
4. **Commit new file** 클릭.

(이미 루트에 api/notion-words.js 가 있으면 3번 생략.)

---

## 4. 끝

- Push 했거나 웹에서 올렸으면 Vercel이 자동 배포함.
- 똑패스 앱에서 테스트 링크 주소 바꿨으면 **clasp push** 한 번.

**정리:** 웹에서 기존 꼬인 것 삭제 → toeic-words 내용(또는 폴더) 업로드 → 루트에 api/notion-words.js 있게 하기 → 끝.
