/**
 * 족보에서 메인 앱 postMessage 없이도 점수 반영 (삼성 인터넷 등 opener 끊김 대비)
 * Vercel 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JOGBO_SCORE_SECRET (메인 index.html 과 동일 값)
 */
function monthStrKst() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.getUTCFullYear() + '-' + String(kst.getUTCMonth() + 1).padStart(2, '0');
}

function todayKstYmd() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return (
    kst.getUTCFullYear() +
    '-' +
    String(kst.getUTCMonth() + 1).padStart(2, '0') +
    '-' +
    String(kst.getUTCDate()).padStart(2, '0')
  );
}

function nowKorString() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  const h = String(kst.getUTCHours()).padStart(2, '0');
  const min = String(kst.getUTCMinutes()).padStart(2, '0');
  const s = String(kst.getUTCSeconds()).padStart(2, '0');
  return y + '-' + m + '-' + d + ' ' + h + ':' + min + ':' + s;
}

function djb2PairHex(s) {
  var h1 = 5381;
  var h2 = 52711;
  for (var i = 0; i < s.length; i++) {
    h1 = ((h1 << 5) + h1 + s.charCodeAt(i)) | 0;
    h2 = ((h2 << 5) - h2 + s.charCodeAt(i)) | 0;
  }
  return ('00000000' + (h1 >>> 0).toString(16)).slice(-8) + ('00000000' + (h2 >>> 0).toString(16)).slice(-8);
}

function signSession(uid, secret) {
  const day = todayKstYmd();
  const payload = String(uid).trim() + '|' + day + '|' + String(secret);
  return djb2PairHex(payload);
}

function verifySig(uid, sig, secret) {
  if (!uid || !sig || !secret) return false;
  return signSession(uid, secret) === String(sig).trim();
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = (process.env.JOGBO_SCORE_SECRET || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');

  if (!secret || !serviceKey || !supabaseUrl) {
    return res.status(503).json({
      error: 'not_configured',
      hint: 'Vercel에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JOGBO_SCORE_SECRET 설정'
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
  }

  const uid = String(body.uid || '').trim();
  const correct = !!body.correct;
  const jogboSig = String(body.jogbo_sig || '').trim();

  if (!uid || !jogboSig) {
    return res.status(400).json({ error: 'uid and jogbo_sig required' });
  }
  if (!verifySig(uid, jogboSig, secret)) {
    return res.status(403).json({ error: 'invalid_signature' });
  }

  const sheetName = 'User_Profile_' + monthStrKst();
  const headers = {
    apikey: serviceKey,
    Authorization: 'Bearer ' + serviceKey,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };

  const selUrl =
    supabaseUrl +
    '/rest/v1/students?User%20ID=eq.' +
    encodeURIComponent(uid) +
    '&__sheet_name=eq.' +
    encodeURIComponent(sheetName) +
    '&select=Score';

  try {
    const sel = await fetch(selUrl, { headers: { ...headers, Prefer: 'return=representation' } });
    if (!sel.ok) {
      const t = await sel.text();
      return res.status(500).json({ error: 'select_failed', detail: t });
    }
    const rows = await sel.json();
    if (!rows || !rows.length) {
      return res.status(404).json({ error: 'user_not_found' });
    }

    const currentScore = Number(rows[0].Score) || 0;
    const newScore = correct ? currentScore + 5 : currentScore;

    const patchBody = {
      Score: String(newScore),
      'Last Active': nowKorString()
    };

    const patchUrl =
      supabaseUrl +
      '/rest/v1/students?User%20ID=eq.' +
      encodeURIComponent(uid) +
      '&__sheet_name=eq.' +
      encodeURIComponent(sheetName);

    const patch = await fetch(patchUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(patchBody)
    });

    if (!patch.ok) {
      const t = await patch.text();
      return res.status(500).json({ error: 'update_failed', detail: t });
    }

    return res.status(200).json({ ok: true, newScore: newScore });
  } catch (e) {
    console.error('jogbo-score error', e);
    return res.status(500).json({ error: 'Server error', message: e.message || '' });
  }
};
