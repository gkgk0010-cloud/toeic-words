/**
 * 배포 전/빌드 시 노션에서 인칭대명사 데이터를 가져와 data/pronoun-words.json 에 씁니다.
 * 그러면 첫 방문에도 연결사처럼 바로 표시됩니다.
 *
 * 환경 변수:
 *   NOTION_API_KEY (필수)
 *   PRONOUN_DB_ID  (선택, 기본값: 인칭대명사 노션 DB ID)
 *
 * 로컬: NOTION_API_KEY=secret_xxx node scripts/fetch-pronoun-words.js
 * Vercel: Build Command에 이 스크립트를 넣으면 배포 시 자동 실행.
 */

const fs = require('fs');
const path = require('path');

const PRONOUN_DB_ID = (process.env.PRONOUN_DB_ID || '3016e4c35a0e807ea96af840fc6f6a6a').trim().replace(/-/g, '');
const NOTION_API_KEY = (process.env.NOTION_API_KEY || '').trim();

if (!NOTION_API_KEY) {
  console.warn('NOTION_API_KEY 없음. data/pronoun-words.json 은 갱신되지 않습니다.');
  process.exit(0);
}

const handler = require('../api/notion-words.js');
const req = {
  method: 'GET',
  query: { database_id: PRONOUN_DB_ID }
};
const outputPath = path.join(__dirname, '..', 'data', 'pronoun-words.json');
const res = {
  _status: 200,
  _headers: {},
  setHeader(k, v) { this._headers[k] = v; },
  status(n) { this._status = n; return this; },
  json(body) {
    const payload = {
      setTitle: body.setTitle || '인칭대명사표',
      themeLabel: body.themeLabel || '구분',
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
    console.error('fetch-pronoun-words error:', err);
    process.exit(1);
  }
})();
