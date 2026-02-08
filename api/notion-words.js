/**
 * Vercel Serverless: 노션 DB 조회 → 앱용 JSON 변환
 * GET /api/notion-words?database_id=xxx  (필수)
 *     &set_title=xxx  (선택, 페이지 제목 오버라이드)
 *
 * 환경 변수: NOTION_API_KEY (필수)
 * 노션 DB는 해당 Integration에 연결(공유)되어 있어야 함.
 */

const NOTION_VERSION = '2022-06-28';

function getPropPlain(page, prop) {
  if (!page || !page.properties || !prop) return '';
  const p = page.properties[prop];
  if (!p) return '';
  if (p.title && p.title[0]) return p.title[0].plain_text || '';
  if (p.rich_text && p.rich_text[0]) return p.rich_text[0].plain_text || '';
  if (p.select && p.select.name) return p.select.name || '';
  return '';
}

function getPropMultiSelect(page, prop) {
  if (!page || !page.properties || !prop) return [];
  const p = page.properties[prop];
  if (!p || !p.multi_select) return [];
  return p.multi_select.map((x) => x.name).filter(Boolean);
}

/** property 이름으로 id 찾기 (스키마 순서대로 첫 매칭) */
function findPropId(schema, names) {
  for (const [id, def] of Object.entries(schema)) {
    const name = (def && def.name) ? String(def.name).trim() : '';
    if (names.some((n) => n === name)) return id;
  }
  return null;
}

/** 이름 우선순위대로 찾기. 인칭대명사에서 주격=앞면·구분=뒷면 쓰려면 keyword는 단어 컬럼 우선 */
function findPropIdByOrder(schema, orderedNames) {
  for (const want of orderedNames) {
    for (const [id, def] of Object.entries(schema)) {
      const name = (def && def.name) ? String(def.name).trim() : '';
      if (name === want) return id;
    }
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = (req.query.database_id || req.query.db || '').trim().replace(/-/g, '');

  if (!apiKey) {
    return res.status(500).json({ error: 'NOTION_API_KEY not set' });
  }
  if (!databaseId) {
    return res.status(400).json({ error: 'database_id or db query required' });
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json'
  };

  try {
    // 1) DB 메타 + 스키마 조회 (property 이름 → id 매핑)
    const dbRes = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, { headers });
    if (!dbRes.ok) {
      const err = await dbRes.json().catch(() => ({}));
      return res.status(dbRes.status).json({ error: 'Notion DB fetch failed', detail: err });
    }
    const db = await dbRes.json();
    const schema = db.properties || {};
    const setTitleFromDb = db.title && db.title[0] ? db.title[0].plain_text : '';

    // 인칭대명사: 단어=앞면, 뜻=뒷면. 격=퀴즈·카드, 분류=필터. 소유대명사·재귀대명사 포함.
    // 표가 "한 행에 주격·목적격·소유격·소유대명사·재귀대명사 컬럼"이면 격별로 펼쳐서 전부 반영.
    const CASE_COLUMN_NAMES = ['주격', '목적격', '소유격', '소유대명사', '재귀대명사'];
    const caseColumnIds = {};
    for (const [id, def] of Object.entries(schema)) {
      const name = (def && def.name) ? String(def.name).trim() : '';
      if (CASE_COLUMN_NAMES.includes(name)) caseColumnIds[name] = id;
    }
    const useWideTable = Object.keys(caseColumnIds).length >= 2;
    const categoryId = findPropIdByOrder(schema, ['분류', '종류', '인칭', '구분']);

    const keyId = useWideTable ? null : findPropIdByOrder(schema, ['키워드', 'keyword', 'Keyword', 'Name', '단어', '주격', '목적격', '소유격', '이름', '제목', '구분']);
    const meaningId = findPropIdByOrder(schema, ['뜻/설명', '뜻', 'meaning', 'Meaning', '구분', '분류', '주격', '소유격', '목적격']);
    const exampleId = findPropId(schema, ['예문', 'example', 'Example', '소유격', '목적격']);
    const themeId = useWideTable ? null : findPropIdByOrder(schema, ['격', 'case', 'Case', '테마', 'theme', 'Theme', '시제', '카테고리', '구분', '분류']);

    const themeLabel = useWideTable ? '격' : (themeId && schema[themeId] && schema[themeId].name ? schema[themeId].name : '테마');
    const categoryLabel = categoryId && schema[categoryId] && schema[categoryId].name ? schema[categoryId].name : '분류';

    if (!useWideTable && !keyId) {
      return res.status(400).json({
        error: 'DB에 키워드(또는 keyword) 컬럼이 없습니다.',
        hint: '노션 DB 속성 이름: 키워드, 뜻, 예문, 테마 (또는 인칭대명사표면 주격·목적격·소유격·소유대명사 컬럼)'
      });
    }

    // 2) DB 쿼리 (페이지 목록)
    const body = { page_size: 100 };
    let allPages = [];
    let cursor = undefined;

    do {
      if (cursor) body.start_cursor = cursor;
      const queryRes = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });
      if (!queryRes.ok) {
        const err = await queryRes.json().catch(() => ({}));
        return res.status(queryRes.status).json({ error: 'Notion query failed', detail: err });
      }
      const data = await queryRes.json();
      allPages = allPages.concat(data.results || []);
      cursor = data.next_cursor || null;
    } while (cursor);

    // 3) 앱용 words 배열. 표가 주격·목적격·소유격·소유대명사 컬럼이면 한 행을 격별로 펼침
    let words;
    if (useWideTable) {
      words = [];
      for (const page of allPages) {
        const categoryVal = categoryId ? getPropPlain(page, categoryId) : '';
        for (const [caseName, propId] of Object.entries(caseColumnIds)) {
          const keyword = getPropPlain(page, propId);
          if (!keyword) continue;
          words.push({
            keyword,
            meaning: caseName,
            example: '',
            theme: caseName,
            category: categoryVal || caseName
          });
        }
      }
    } else {
      words = allPages.map((page) => {
        const keyword = getPropPlain(page, keyId);
        const meaning = meaningId ? getPropPlain(page, meaningId) : '';
        const example = exampleId ? getPropPlain(page, exampleId) : '';
        const multi = themeId ? getPropMultiSelect(page, themeId) : [];
        const singleTheme = themeId && !multi.length ? getPropPlain(page, themeId) : '';
        const categoryMulti = categoryId ? getPropMultiSelect(page, categoryId) : [];
        const categorySingle = categoryId && !categoryMulti.length ? getPropPlain(page, categoryId) : '';

        const word = { keyword, meaning, example };
        if (multi.length) word.themes = multi;
        else if (singleTheme) word.theme = singleTheme;
        if (categoryMulti.length) word.category = categoryMulti[0];
        else if (categorySingle) word.category = categorySingle;
        else if (word.themes && word.themes.length) word.category = word.themes[0];
        else if (word.theme) word.category = word.theme;
        return word;
      }).filter((w) => w.keyword);
    }

    const setTitle = (req.query.set_title || '').trim() || setTitleFromDb || '노션 족보';

    return res.status(200).json({ setTitle, themeLabel, categoryLabel, words });
  } catch (e) {
    console.error('notion-words api error', e);
    return res.status(500).json({ error: 'Server error', message: e.message });
  }
}
