/**
 * 명사+전치사 JSON을 자동사+전치사 시트와 동일 스키마로 통일:
 * keyword = 이름(명사·구), theme = 전치사만 (to, for, …)
 * 실행: node toeic-words/scripts/migrate-noun-prep-to-verb-style.js
 */
const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, '..', 'data', 'noun-prep-collocations.json');

const PREP_LAST = new Set([
  'to', 'for', 'of', 'in', 'on', 'with', 'at', 'about', 'into', 'onto',
  'from', 'by', 'over', 'upon', 'regarding',
]);

function parseHeadPrep(keyword) {
  let k = String(keyword || '').trim();
  if (k.includes(' / ')) k = k.split(' / ')[0].trim();
  const parts = k.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { head: k, prep: '' };
  const lastRaw = parts[parts.length - 1].toLowerCase();
  if (PREP_LAST.has(lastRaw)) {
    return { head: parts.slice(0, -1).join(' '), prep: parts[parts.length - 1] };
  }
  return { head: k, prep: '' };
}

function isLegacyRow(w) {
  return typeof w.theme === 'string' && (w.theme.startsWith('명사+') || w.theme.startsWith('전치사+'));
}

const j = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const words = j.words.map((w) => {
  if (!isLegacyRow(w)) return w;
  const { head, prep } = parseHeadPrep(w.keyword);
  if (!prep) console.warn('prep 비어 있음:', w.keyword);
  return {
    keyword: head,
    meaning: w.meaning,
    example: w.example,
    theme: prep,
  };
});

fs.writeFileSync(jsonPath, JSON.stringify({ setTitle: j.setTitle, words }, null, 2), 'utf8');
console.log('Updated', jsonPath, words.length, 'rows');
