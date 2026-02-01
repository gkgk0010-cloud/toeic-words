# 노션 API 연동 (toeic-words)

노션 DB를 단어 앱에서 직접 불러오려면 아래 순서대로 설정하면 됩니다.

---

## 1. 노션 Integration 만들기

1. **https://www.notion.so/my/integrations** 접속
2. **New integration** 클릭
3. 이름 입력 (예: `똑패스 단어앱`) → **Submit**
4. **Internal Integration Secret** 복사 (`secret_xxx...`) → 이게 **NOTION_API_KEY** 입니다.

---

## 2. 노션 DB에 Integration 연결

1. 단어 데이터가 들어 있는 **노션 데이터베이스** 페이지를 연다.
2. 오른쪽 위 **⋯** → **Add connections** → 방금 만든 Integration 선택
3. 연결하면 해당 DB를 API로 조회할 수 있습니다.

---

## 3. 노션 DB 속성 이름

앱이 찾는 컬럼 이름(한글 또는 영문):

| 용도   | 한글  | 영문(대안) |
|--------|-------|------------|
| 키워드 | 키워드 | keyword   |
| 뜻     | 뜻     | meaning   |
| 예문   | 예문   | example   |
| 시제   | 테마   | theme (Select 또는 Multi-select) |

- **테마**는 **Select**(단일) 또는 **Multi-select**(여러 시제) 둘 다 가능합니다.

---

## 4. DB ID 확인

1. 노션에서 해당 **데이터베이스 페이지**를 연다.
2. 주소창 URL을 복사한다.  
   예: `https://www.notion.so/workspace/abc123def456...?v=...`
3. **`?` 앞까지**가 페이지 ID. 그 중 **32자리 영문+숫자** 부분이 **Database ID** 입니다.  
   (URL에 `-`가 있으면 제거해도 됩니다. 앱에서 자동으로 제거합니다.)

---

## 5. Vercel 환경 변수

1. **Vercel** → 해당 프로젝트(toeic-words) → **Settings** → **Environment Variables**
2. 추가:
   - **Name:** `NOTION_API_KEY`
   - **Value:** 1단계에서 복사한 **Internal Integration Secret** (`secret_xxx...`)
   - **Environment:** Production (필요하면 Preview도 체크)
3. **Save** 후 **Redeploy** 한 번 실행.

---

## 6. 단어 앱에서 사용하는 URL

- **기존 (JSON만):**  
  `https://toeic-words-xxx.vercel.app/`  
  → `data/words.json` 사용

- **노션 DB 사용:**  
  `https://toeic-words-xxx.vercel.app/?db=노션DB_ID`  
  또는  
  `https://toeic-words-xxx.vercel.app/?database_id=노션DB_ID`

- **제목 바꾸기 (선택):**  
  `?db=xxx&set_title=시제일치`  
  → 화면 제목을 "시제일치"로 표시

---

## 7. 똑패스에서 노션 DB로 테스트 열기

노션 DB를 쓰는 테스트만 열고 싶다면:

- **gas_src/index.html** 의 **WORDS_APP_URL** 을  
  `https://toeic-words-xxx.vercel.app/?db=노션DB_ID`  
  형태로 바꾸면, "관련 테스트 보기" 시 해당 노션 DB 데이터로 퀴즈가 열립니다.

---

## 8. 문제 해결

| 증상 | 확인할 것 |
|------|------------|
| "NOTION_API_KEY not set" | Vercel 환경 변수에 `NOTION_API_KEY` 넣었는지, Redeploy 했는지 |
| 404 / DB fetch failed | 노션 DB 페이지에서 **Add connections** 로 Integration 연결했는지 |
| "키워드 컬럼이 없습니다" | 노션 DB에 **키워드**(또는 keyword) 속성 이름이 있는지 |
| 데이터가 안 나옴 | DB ID가 URL의 32자리 부분이 맞는지, `-` 제거한 값으로 넣었는지 |

이대로 설정하면 노션에서 수정한 내용이 앱에 바로 반영됩니다.
