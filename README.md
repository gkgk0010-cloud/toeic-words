# 토익 단어 앱 (toeic-words)

노션 시제부사 등 단어 세트를 **카드**로 보기 + **4지선다 퀴즈**로 풀기.  
정답 시 **answer_logs** (quiz_type: input, tag: 노션 제목)에 기록해 모니터·CCTV와 연동.

## 로컬에서 실행

1. `data/words.json` 에 단어가 있음 (setTitle + words 배열).
2. `index.html` 을 브라우저로 열거나, 로컬 서버로 연다.
   - 예: `npx serve .` 또는 VS Code Live Server.
3. 주소창에 `#cards` / `#quiz` 로 카드·퀴즈 전환.

## 모니터·CCTV 연동 (answer_logs 기록)

1. `config.example.js` 를 참고해 `config.js` 에 다음을 채운다.
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`: monitor-app 과 동일한 Supabase 프로젝트.
   - `TEST_TITLE`: **노션 제목**(테스트 이름) → answer_logs.tag, last_answer_tag 에 들어감.
2. 똑패스에서 넘어올 때 `?student_id=xxx&student_name=yyy` 로 넘기면 해당 값으로 로그 저장.

## 데이터 형식 (data/words.json)

```json
{
  "setTitle": "토익 시제부사",
  "words": [
    { "keyword": "currently", "meaning": "현재·지금", "example": "...", "theme": "현재" },
    { "keyword": "once", "meaning": "한때·이전에", "example": "...", "themes": ["과거", "현재완료"] }
  ]
}
```

- **setTitle**: 이 세트의 테스트 이름(노션 제목). config.TEST_TITLE 없으면 여기 값을 tag 로 씀.
- **theme**: 시제 하나 (현재/과거/미래/현재완료). 카드 필터·퀴즈 정답에 사용.
- **themes**: (선택) 시제가 여러 개면 배열로. 퀴즈에서 이 중 아무거나 고르면 정답. 카드에는 "현재, 현재완료 시제에 씁니다" 처럼 모두 표시.

## 노션 DB에서 중복 정답(여러 시제) 넣는 법

노션 데이터베이스에 단어를 관리할 때, **중복 정답**이 되는 단어는 **테마(시제) 컬럼을 Multi-select(다중 선택)** 로 두면 된다.

1. 노션 DB에서 **테마** (또는 시제) 컬럼을 연다.
2. 속성 유형을 **Select** 가 아니라 **Multi-select** 로 설정한다.
3. 옵션에 **현재, 과거, 미래, 현재완료** 를 넣어 둔다.
4. 시제가 하나인 단어 → 해당 시제 **하나만** 선택.
5. 시제가 여러 개인 단어(예: once) → **과거, 현재완료** 처럼 **여러 개** 선택.

나중에 노션 API로 데이터를 가져올 때, Multi-select 값은 **배열**로 오므로 그대로 `themes` 로 매핑하면 된다. Select(단일)면 `theme` 하나로 매핑.

## 배포

정적 파일만 있으므로 Vercel, Netlify, 또는 똑패스 도메인 하위 경로(`/words`)에 올리면 됨.
