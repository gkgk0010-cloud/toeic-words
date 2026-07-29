# 수량사고 족보 — Notion DB 가이드

## Notion DB 만들기

1. 노션에서 **테이블 - 인라인** 생성
2. DB 이름: **`수량사고`**
3. 아래 4개 속성 생성 (이름 **정확히** 맞출 것)

| 속성 이름 | 타입 | 용도 |
|-----------|------|------|
| **키워드** | Title | 카드 중앙 영어 표현 |
| **뜻** | Text | 탭(뒤집기) 시 한글 뜻 |
| **예문** | Text | 탭(뒤집기) 시 예문 |
| **종류** | Select | 퀴즈 정답 · 카드 상단 배지 |

### 종류 Select 옵션 (4개만)

```
단수
복수
불가산
복수&불가산
```

> 앱 퀴즈 선택지가 이 4가지로 자동 출제됩니다.

---

## 데이터 넣기

### 방법 A — CSV 임포트 (추천)

1. `data/quantifier-words.csv` 파일 열기
2. 노션 DB 우측 상단 **⋯ → Merge with CSV** 또는 **Import → CSV**
3. 컬럼 매핑: 키워드→키워드, 뜻→뜻, 예문→예문, 종류→종류

### 방법 B — 수동 입력

| 종류 | 키워드 |
|------|--------|
| **단수** (가산 단수명사) | one, each, every, another |
| **복수** (복수명사) | various, many, multiple, several, numerous, a few, few, both, a number of, a variety of, a series of, a selection of, a collection of, a range of, an array of, a list of |
| **불가산** (불가산 명사) | much, a little, little, an amount of |
| **복수&불가산** | all, most, some, other, more |

총 **29개** (one 중복 제외)

---

## Integration 연결 & 앱 URL

1. https://www.notion.so/my/integrations → Integration 생성
2. `수량사고` DB 페이지 → **연결 추가** → Integration 선택
3. URL에서 DB ID(32자) 복사
4. Vercel `NOTION_API_KEY` 설정 (기존 toeic-words와 동일)

```
https://toeic-words-xxx.vercel.app/?db=여기DB_ID&set_title=수량사고
```

---

## 앱 동작 (코드 수정 없음)

기존 족보 `category` 퀴즈 패턴을 그대로 사용합니다.

| 화면 | 동작 |
|------|------|
| **카드 앞** | 상단 배지 = `종류` (단수/복수/불가산/복수&불가산), 중앙 = `키워드` |
| **카드 뒤 (탭)** | 종류 + 뜻 + 예문 |
| **퀴즈** | 키워드 보고 **종류 4지선다** |

---

## 똑패스 메인앱 연동 (선택)

`gas_src/index.html` 또는 `www/index.html` 테스트 목록에 추가:

```javascript
{ title: '수량사고', url: WORDS_APP_URL + '?db=수량사고_DB_ID&set_title=수량사고' }
```

---

## 로컬 JSON (Notion 없이 테스트)

```
https://toeic-words-xxx.vercel.app/?db=quantifier_local&set_title=수량사고
```

→ `app.js`에 quantifier DB ID 분기 추가 전까지는 CSV→Notion 임포트 방식 사용.
