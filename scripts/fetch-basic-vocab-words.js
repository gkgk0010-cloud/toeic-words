/**
 * 배포 시 노션에서 기본어휘품사구별 데이터를 가져와 data/basic-vocab-words.json 에 씁니다.
 * 첫 방문에도 바로 표시됩니다.
 *
 * 환경 변수:
 *   NOTION_API_KEY (필수)
 *   BASIC_VOCAB_DB_ID (선택, 기본값: 기본어휘품사구별 노션 DB ID)
 *
 * Vercel: Build Command에 이 스크립트를 넣으면 배포 시 자동 실행.
 */

const fs = require('fs');
const path = require('path');

const BASIC_VOCAB_DB_ID = (process.env.BASIC_VOCAB_DB_ID || '31a6e4c35a0e80dfad37f2231f41438d').trim().replace(/-/g, '');
const NOTION_API_KEY = (process.env.NOTION_API_KEY || '').trim();

if (!NOTION_API_KEY) {
  console.warn('NOTION_API_KEY 없음. data/basic-vocab-words.json 은 갱신되지 않습니다.');
  process.exit(0);
}

const handler = require('../api/notion-words.js');
const req = {
  method: 'GET',
  query: { database_id: BASIC_VOCAB_DB_ID }
};
const outputPath = path.join(__dirname, '..', 'data', 'basic-vocab-words.json');
const res = {
  _status: 200,
  _headers: {},
  setHeader(k, v) { this._headers[k] = v; },
  status(n) { this._status = n; return this; },
  json(body) {
    const payload = {
      setTitle: body.setTitle || '기본어휘품사구별',
      themeLabel: body.themeLabel || '품사',
      categoryLabel: body.categoryLabel || '',
      words: Array.isArray(body.words) ? body.words : []
    };
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
    console.log('Wrote', outputPath, '—', payload.words.length, 'words');
  }
};

(async function () {
  try {
    await handler(req, res);
  } catch (err) {
    console.error('fetch-basic-vocab-words error:', err);
    process.exit(1);
  }
})();
