/**
 * noun-prep-collocations.json → 루트 명사_콜로케이션_노션_표.csv
 * 자동사+전치사 시트와 동일: 이름, 의미, 예문, 테마 (테마 = 전치사만)
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const jsonPath = path.join(__dirname, '..', 'data', 'noun-prep-collocations.json');
const outPath = path.join(root, '명사_콜로케이션_노션_표.csv');
const tsvPath = path.join(root, '명사_콜로케이션_엑셀붙여넣기.txt');

function esc(s) {
  if (s == null) return '';
  const str = String(s);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

/** 탭 구분: 엑셀에 그대로 붙여넣기용(셀 안 탭·줄바꿈 제거) */
function tsvCell(s) {
  if (s == null) return '';
  return String(s).replace(/\t/g, ' ').replace(/\r?\n/g, ' ').trim();
}

const j = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const lines = ['이름,의미,예문,테마'];
const tsvLines = [['이름', '의미', '예문', '테마'].join('\t')];
for (const w of j.words) {
  lines.push(
    [esc(w.keyword), esc(w.meaning), esc(w.example), esc(w.theme)].join(',')
  );
  tsvLines.push(
    [tsvCell(w.keyword), tsvCell(w.meaning), tsvCell(w.example), tsvCell(w.theme)].join('\t')
  );
}
fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
fs.writeFileSync(tsvPath, '\uFEFF' + tsvLines.join('\r\n'), 'utf8');
console.log('Wrote', outPath, '—', j.words.length, 'rows');
console.log('Wrote', tsvPath, '(BOM·탭 — 엑셀 열기/전체복사 붙여넣기)');
