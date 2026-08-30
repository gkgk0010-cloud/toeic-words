# 부사족보 — Notion DB 가이드

## Notion DB 만들기

1. 노션에서 **테이블 - 인라인** 생성
2. DB 이름: **`부사족보`**
3. 아래 4개 속성 생성 (이름 **정확히** 맞출 것)

| 속성 이름 | 타입 | 용도 |
|-----------|------|------|
| **키워드** | Title | 카드 중앙 영어 부사 |
| **뜻** | Text | 탭(뒤집기) 시 한글 뜻 |
| **예문** | Text | 탭(뒤집기) 시 예문 |
| **종류** | Select | 퀴즈 정답 · 카드 상단 배지 |

### 종류 Select 옵션 (3개만)

```
숫자부사
very형부사
비교급강조부사
```

> 앱 퀴즈 선택지가 이 3가지로 자동 출제됩니다.

---

## 데이터 넣기

### 방법 A — CSV 임포트 (추천)

1. `data/adverb-words.csv` 파일 열기
2. 노션 DB 우측 상단 **⋯ → Import → CSV**
3. 컬럼 매핑: 키워드→키워드, 뜻→뜻, 예문→예문, 종류→종류

### 방법 B — 수동 입력

| 종류 | 키워드 | 뜻 (요약) |
|------|--------|-----------|
| **숫자부사** | approximately, around, about | 대략 · 약 |
| | nearly, almost, roughly | 거의 · 대략 |
| | over, more than | 이상 (초과) |
| | under, less than | 이하 (미만) |
| | up to | 최대 |
| | at least | 최소 |
| | only, just | 겨우 · 단 |
| | exactly | 정확히 |
| **very형부사** | very, relatively, extremely, highly, somewhat, too, quite, so | 정도·강조 부사 |
| **비교급강조부사** | much, even, still, far, considerably, significantly, substantially | 비교급 앞 강조 |

총 **30개**

---

## Integration 연결 & 앱 URL

1. https://www.notion.so/my/integrations → Integration 생성 (기존 toeic-words 연동 재사용 가능)
2. `부사족보` DB 페이지 → **연결 추가** → Integration 선택
3. URL에서 DB ID(32자) 복사
4. Vercel `NOTION_API_KEY` 설정 (기존 toeic-words와 동일)

**등록된 DB ID:** `3ad6e4c35a0e80b4a5d5df43aefa58b9`  
**Notion URL:** [부사족보 DB](https://butter-humidity-670.notion.site/3ad6e4c35a0e80b4a5d5df43aefa58b9?v=3ad6e4c35a0e809ebffa000cf9dc0b6a)

```
https://toeic-words-b5vc.vercel.app/?db=3ad6e4c35a0e80b4a5d5df43aefa58b9&set_title=부사족보
```

---

## 앱 동작 (코드 수정 없음)

수량사고 족보와 동일한 `category` 퀴즈 패턴을 사용합니다.

| 화면 | 동작 |
|------|------|
| **카드 앞** | 상단 배지 = `종류` (숫자부사 / very형부사 / 비교급강조부사), 중앙 = `키워드` |
| **카드 뒤 (탭)** | 종류 + 뜻 + 예문 |
| **퀴즈** | 키워드 보고 **종류 3지선다** |

---

## 똑패스 메인앱 연동

Google Sheet **`단어테스트`** 탭에 한 줄 추가:

| A (이름) | B (Notion DB ID) |
|----------|------------------|
| 부사족보 | `3ad6e4c35a0e80b4a5d5df43aefa58b9` |

또는 `gas_src/index.html` / `www/index.html` 기본 목록에 추가:

```javascript
{ name: '부사족보', db: 'NOTION_DB_ID_32자' }
```

---

## 숫자부사 세부 의미 (뜻 컬럼 참고)

| 의미 | 해당 키워드 |
|------|-------------|
| 대략 · 약 | approximately, around, about, roughly |
| 거의 | nearly, almost |
| 이상 | over, more than |
| 이하 | under, less than |
| 최대 | up to |
| 최소 | at least |
| 겨우 | only, just |
| 정확히 | exactly |

퀴즈는 **3종류 구분**만 출제하고, 세부 의미(이상/이하 등)는 카드 **뜻**에서 학습합니다.

---

## 배포

Notion DB + Sheet 등록만으로 동작합니다. toeic-words Vercel 재배포는 **CSV/문서만 추가**한 경우 불필요합니다.  
(앱 코드 변경 시에만 `git push` → Vercel 자동 배포)
