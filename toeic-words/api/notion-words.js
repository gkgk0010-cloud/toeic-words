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

/** property 이름(한글/영어)으로 id 찾기 */
function findPropId(schema, names) {
  for (const [id, def] of Object.entries(schema)) {
    const name = (def && def.name) ? String(def.name).trim() : '';
    if (names.some((n) => n === name)) return id;
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

    const keyId = findPropId(schema, ['키워드', 'keyword', 'Keyword', 'Name', '이름', '제목']);
    const meaningId = findPropId(schema, ['뜻/설명', '뜻', 'meaning', 'Meaning']);
    const exampleId = findPropId(schema, ['예문', 'example', 'Example']);
    const themeId = findPropId(schema, ['테마', 'theme', 'Theme', '시제', '카테고리']);

    if (!keyId) {
      return res.status(400).json({
        error: 'DB에 키워드(또는 keyword) 컬럼이 없습니다.',
        hint: '노션 DB 속성 이름: 키워드, 뜻, 예문, 테마 (또는 keyword, meaning, example, theme)'
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

    // 3) 앱용 words 배열로 변환 (property id 사용)
    const words = allPages.map((page) => {
      const keyword = getPropPlain(page, keyId);
      const meaning = meaningId ? getPropPlain(page, meaningId) : '';
      const example = exampleId ? getPropPlain(page, exampleId) : '';
      const multi = themeId ? getPropMultiSelect(page, themeId) : [];
      const singleTheme = themeId && !multi.length ? getPropPlain(page, themeId) : '';

      const word = { keyword, meaning, example };
      if (multi.length) word.themes = multi;
      else if (singleTheme) word.theme = singleTheme;
      return word;
    }).filter((w) => w.keyword);

    const setTitle = (req.query.set_title || '').trim() || setTitleFromDb || '노션 족보';

    return res.status(200).json({ setTitle, words });
  } catch (e) {
    console.error('notion-words api error', e);
    return res.status(500).json({ error: 'Server error', message: e.message });
  }
}
