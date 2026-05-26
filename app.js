(function () {
  'use strict';

  /** URLSearchParams 없는 구형 WebView 대비 — 예외 없이 쿼리만 파싱 */
  function parseQueryKey(href, key) {
    try {
      var h = String(href || (typeof window !== 'undefined' && window.location && window.location.href) || '');
      var qi = h.indexOf('?');
      if (qi < 0) return '';
      var query = h.slice(qi + 1);
      var segments = query.split('&');
      var pref = key + '=';
      for (var i = 0; i < segments.length; i++) {
        var seg = segments[i];
        if (seg.indexOf(pref) === 0) {
          return decodeURIComponent(seg.slice(pref.length).replace(/\+/g, ' ').split('#')[0]).trim();
        }
      }
    } catch (e) {}
    return '';
  }

  try {
    var _bootInit0 = document.getElementById('initStatus');
    if (_bootInit0) _bootInit0.textContent = '불러오는 중…';
  } catch (e) {}

  // 연결사 전용 페이지(connector.html)면 FORCE_DB_ID 사용, 아니면 URL에서 db 추출
  var _dbIdFromUrl = '';
  if (typeof window !== 'undefined' && window.FORCE_DB_ID) {
    _dbIdFromUrl = String(window.FORCE_DB_ID).trim().replace(/-/g, '');
  } else {
    try {
      var _href = typeof window !== 'undefined' && window.location && window.location.href ? window.location.href : '';
      var _dbRaw = parseQueryKey(_href, 'db') || parseQueryKey(_href, 'database_id');
      _dbIdFromUrl = _dbRaw ? String(_dbRaw).trim().replace(/-/g, '') : '';
    } catch (e) {
      _dbIdFromUrl = '';
    }
  }

  /** 똑패스 앱 iframe으로 열릴 때만 — 부모 WebView에서 네이티브 TTS(postMessage) 사용 */
  var _tokpassNativeTts = false;
  try {
    var _hrefTts = typeof window !== 'undefined' && window.location && window.location.href ? window.location.href : '';
    var _rawTts = parseQueryKey(_hrefTts, 'tokpass_native_tts');
    _tokpassNativeTts = _rawTts === '1' || (_rawTts && String(_rawTts).toLowerCase() === 'true');
    if (!_tokpassNativeTts && _hrefTts && /[?&#]tokpass_native_tts=(?:1|true)\b/i.test(_hrefTts)) {
      _tokpassNativeTts = true;
    }
  } catch (e) {}
  try {
    window._tokpassNativeTts = _tokpassNativeTts;
  } catch (e) {}

  const THEMES = ['현재', '과거', '미래', '현재완료'];
  /** 퀴즈 선택지: 격 퀴즈일 때 항상 이 목록에서 4개 고르기 (소유격만 네 개 나오는 것 방지) */
  const CASE_TYPES = ['주격', '목적격', '소유격', '소유대명사', '재귀대명사'];
  /** 격별 의미(데이터 없음 → 코드로). 구분(category)별 주격/목적격/소유격/소유대명사/재귀대명사 설명 */
  const CASE_MEANINGS = {
    '1인칭 단수': { 주격: '나(는/가)', 목적격: '나(에게/를)', 소유격: '나의', 소유대명사: '나의것', 재귀대명사: '나 스스로' },
    '2인칭 단수,복수': { 주격: '너(은는이가)', 목적격: '너(에게/를)', 소유격: '너의', 소유대명사: '너의것', 재귀대명사: '너 스스로' },
    '2인칭 단수·복수': { 주격: '너(은는이가)', 목적격: '너(에게/를)', 소유격: '너의', 소유대명사: '너의것', 재귀대명사: '너 스스로' },
    '3인칭 남성 단수': { 주격: '그(는/가)', 목적격: '그(에게/를)', 소유격: '그의', 소유대명사: '그의것', 재귀대명사: '그 스스로' },
    '3인칭 여성 단수': { 주격: '그녀(는/가)', 목적격: '그녀(에게/를)', 소유격: '그녀의', 소유대명사: '그녀의것', 재귀대명사: '그녀 스스로' },
    '3인칭 중성 단수(사람X)': { 주격: '그것(은/는)', 목적격: '그것(에게/를)', 소유격: '그것의', 소유대명사: '그것의것', 재귀대명사: '그것 스스로' },
    '1인칭 복수': { 주격: '우리(는/가)', 목적격: '우리(에게/를)', 소유격: '우리의', 소유대명사: '우리의것', 재귀대명사: '우리 스스로' },
    '3인칭 복수': { 주격: '그들(은/는)', 목적격: '그들(에게/를)', 소유격: '그들의', 소유대명사: '그들의것', 재귀대명사: '그들 스스로' }
  };
  function getCaseMeaning(category, caseType) {
    var m = CASE_MEANINGS[category];
    if (m && m[caseType]) return m[caseType];
    for (var key in CASE_MEANINGS) {
      if (category && category.indexOf(key) >= 0) return CASE_MEANINGS[key][caseType];
      if (key.indexOf(category) >= 0) return CASE_MEANINGS[key][caseType];
    }
    return caseType;
  }
  const isConnectorPage = !!(typeof window !== 'undefined' && window.FORCE_DB_ID);
  var CONNECTOR_DB_ID = '2fa6e4c35a0e81cda20ac619508bbeea';
  var PRONOUN_DB_ID = '3016e4c35a0e807ea96af840fc6f6a6a';
  let allWords = [];
  let filteredWords = [];
  let quizWordOrder = []; // 퀴즈 시 매번 셔플된 순서
  let setTitle = '';
  let themeLabel = '시제'; // 격(퀴즈·카드). API에서 '격','구분' 등
  let categoryLabel = '';  // 분류(필터). API에서 '분류','종류' 등. 있으면 필터는 분류(1인칭 단수 등), 퀴즈는 격
  let cardIndex = 0;
  let quizIndex = 0;
  let quizScore = { correct: 0, total: 0 };
  let currentQuizWord = null;
  let quizAnswered = false;
  let quizMode = 'theme'; // 이번 세트는 시제 맞추기만
  /** 퀴즈 정답이 theme이 아니라 category(품사·구 등)인지 — onQuizChoice에서 사용 */
  let quizGradeByCategory = false;
  /** to부정사/(동)명사·전치사+동명사 2지선다 족보 — 기존 품사/연결사 퀴즈와 분리 */
  let quizGradeByPairing = false;
  /** 접속사/전치사/부사 덱: 선택지가 한글 뜻인 경우 */
  let quizGradeByMeaning = false;
  /** 빈칸+명사 분사: 예문 빈칸 + ing/ed 형태 2지선다 */
  let quizGradeByParticipleBlank = false;

  /** 퀴즈 탭에서 품사/뜻 라디오 바꿀 때, 채점 전이면 같은 문항을 새 모드로 즉시 갱신 */
  function bindQuizDimensionLiveRefresh() {
    var row = document.getElementById('quiz-dimension-row');
    if (!row) return;
    row.addEventListener('change', function (ev) {
      var t = ev.target;
      if (!t || t.name !== 'quizDim') return;
      try {
        var vq = document.getElementById('view-quiz');
        if (!vq || vq.classList.contains('hidden')) return;
      } catch (e1) {}
      if (!isPrepConjAdvStyleDeck()) return;
      if (!quizWordOrder.length || quizIndex < 0 || quizIndex >= quizWordOrder.length) return;
      if (quizAnswered) return;
      nextQuiz();
    });
  }

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => el.querySelectorAll(sel);

  /** 구형 WebView(iOS 12 등)에 Array.prototype.flatMap 없음 */
  function arrayFlatMap(arr, fn) {
    if (Array.prototype.flatMap) return arr.flatMap(fn);
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var part = fn(arr[i]);
      if (Array.isArray(part)) {
        for (var j = 0; j < part.length; j++) out.push(part[j]);
      }
    }
    return out;
  }

  function fetchWithTimeout(url, opt, timeoutMs) {
    opt = opt || {};
    timeoutMs = timeoutMs != null ? timeoutMs : 55000;
    if (typeof AbortController !== 'undefined') {
      var ctrl = new AbortController();
      var tid = setTimeout(function () { try { ctrl.abort(); } catch (err) {} }, timeoutMs);
      var merged = Object.assign({}, opt, { signal: ctrl.signal });
      return fetch(url, merged).finally(function () { clearTimeout(tid); });
    }
    return Promise.race([
      fetch(url, opt),
      new Promise(function (_, rej) {
        setTimeout(function () { rej(new Error('요청 시간 초과')); }, timeoutMs);
      })
    ]);
  }

  /** 단어(keyword) 영어 발음 — Android WebView는 speechSynthesis 무음이 잦아 Audio(Google TTS URL) 우선, 폴백은 Web Speech(vocab-app tts.ts와 동일 패턴). */
  var _speakTimer = null;
  var _lastGoogleAudio = null;

  function isAndroidUA() {
    return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');
  }

  function isLikelyInAppBrowser() {
    var ua = navigator.userAgent || '';
    return /KAKAOTALK|Instagram|Line\/|FBAN|FBAV|NAVER\(|Whale/i.test(ua);
  }

  function prepareSpeechSynthesis() {
    try {
      var s = window.speechSynthesis;
      if (!s) return;
      if (s.paused) s.resume();
      s.getVoices();
    } catch (e) {}
  }

  function primeSpeechFromUserTap() {
    try {
      prepareSpeechSynthesis();
      if (typeof window.speechSynthesis === 'undefined' || !window.speechSynthesis) return;
      var u = new SpeechSynthesisUtterance('.');
      u.lang = 'en-US';
      u.volume = 0.01;
      u.rate = 10;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  function unlockSpeechOnFirstInteraction() {
    if (typeof document === 'undefined') return;
    function unlock() {
      prepareSpeechSynthesis();
      try {
        if (window.speechSynthesis) window.speechSynthesis.getVoices();
      } catch (e) {}
      if (isLikelyInAppBrowser()) primeSpeechFromUserTap();
      document.removeEventListener('touchstart', unlock);
      document.removeEventListener('click', unlock);
    }
    document.addEventListener('touchstart', unlock, { passive: true });
    document.addEventListener('click', unlock);
  }
  unlockSpeechOnFirstInteraction();

  function speakViaGoogleAudio(text) {
    return new Promise(function (resolve) {
      try {
        var t = String(text).trim().slice(0, 180);
        if (!t) {
          resolve(false);
          return;
        }
        var q = encodeURIComponent(t);
        var urls = [
          'https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&q=' + q,
          'https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=gtx&q=' + q
        ];
        var i = 0;
        function tryNext() {
          if (i >= urls.length) {
            resolve(false);
            return;
          }
          var audio = new Audio(urls[i++]);
          audio.volume = 1;
          audio.play()
            .then(function () {
              _lastGoogleAudio = audio;
              resolve(true);
            })
            .catch(function () {
              tryNext();
            });
        }
        tryNext();
      } catch (e) {
        resolve(false);
      }
    });
  }

  function buildUtterance(raw, withVoice) {
    var utterance = new SpeechSynthesisUtterance(raw);
    utterance.lang = 'en-US';
    utterance.volume = 1;
    utterance.pitch = 1;
    utterance.rate = 0.9;
    if (withVoice && window.speechSynthesis) {
      var voices = window.speechSynthesis.getVoices();
      var chosen = null;
      var j;
      for (j = 0; j < voices.length; j++) {
        if (voices[j].lang && voices[j].lang.toLowerCase().indexOf('en') === 0) {
          chosen = voices[j];
          break;
        }
      }
      if (!chosen && voices.length) chosen = voices[0];
      if (chosen) utterance.voice = chosen;
    }
    return utterance;
  }

  function speakKeywordWeb(raw) {
    try {
      if (typeof window === 'undefined' || typeof window.speechSynthesis === 'undefined') return;

      prepareSpeechSynthesis();

      function runSpeak(useVoice) {
        try {
          window.speechSynthesis.cancel();
          var utterance = buildUtterance(raw, useVoice);
          var retried = false;
          utterance.onerror = function () {
            if (retried) return;
            retried = true;
            window.setTimeout(function () {
              try {
                var u2 = buildUtterance(raw, false);
                window.speechSynthesis.speak(u2);
              } catch (e) {}
            }, isAndroidUA() ? 200 : 150);
          };
          window.speechSynthesis.speak(utterance);
        } catch (e) {}
      }

      var delay = isAndroidUA() ? 120 : isLikelyInAppBrowser() ? 80 : 40;
      function schedule(useVoice) {
        window.setTimeout(function () { runSpeak(useVoice); }, delay);
      }

      var voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        schedule(true);
        return;
      }

      function onVoices() {
        window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
        schedule(true);
      }
      window.speechSynthesis.addEventListener('voiceschanged', onVoices);
      window.setTimeout(function () {
        if (window.speechSynthesis.getVoices().length > 0) {
          window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
          schedule(true);
        } else {
          window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
          schedule(false);
        }
      }, isAndroidUA() ? 500 : isLikelyInAppBrowser() ? 600 : 400);
    } catch (e) {}
  }

  function speakKeyword(text) {
    if (text == null || text === '') return;
    var clean = String(text).trim();
    if (!clean || clean === '—') return;
    /** 똑패스 iframe(tokpass_native_tts=1): 부모 네이티브 TTS만 사용. Google TTS / Web Speech 경로로 내려가지 않음. */
    if (_tokpassNativeTts) {
      try {
        if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
          window.parent.postMessage({ type: 'tokpass-speak-en', text: clean }, '*');
        }
      } catch (e) {}
      return;
    }
    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    } catch (e) {}
    try {
      if (_lastGoogleAudio) {
        _lastGoogleAudio.pause();
        _lastGoogleAudio = null;
      }
    } catch (e) {}
    prepareSpeechSynthesis();

    if (isAndroidUA()) {
      void speakViaGoogleAudio(clean).then(function (ok) {
        if (!ok) speakKeywordWeb(clean);
      });
      return;
    }
    speakKeywordWeb(clean);
  }

  function scheduleSpeakKeyword(text) {
    if (_speakTimer) clearTimeout(_speakTimer);
    _speakTimer = setTimeout(function () {
      _speakTimer = null;
      speakKeyword(text);
    }, 400);
  }

  /** 부모(똑패스)가 Android에서만 보냄 — 부모 WebView는 Google TTS/speechSynthesis가 막히는 경우가 많아 iframe(Vercel origin)에서 재생 */
  window.addEventListener('message', function (ev) {
    try {
      if (!window.parent || ev.source !== window.parent) return;
      var p = ev.data;
      if (!p || p.type !== 'tokpass-iframe-tts') return;
      var t = String(p.text || '').trim();
      if (!t || t === '—') return;
      function ack(ok) {
        try {
          window.parent.postMessage({ type: 'tokpass-speak-ack', ok: !!ok }, '*');
        } catch (e) {}
      }
      try {
        /** 부모(똑패스)가 translate.google.com 이 막힌 환경용 — Google 요청 없이 Web Speech만 */
        var skipGoogle = !!(p.skipGoogle || p.tokpassSkipGoogle);
        if (isAndroidUA() && skipGoogle) {
          speakKeywordWeb(t);
          ack(true);
        } else if (isAndroidUA()) {
          void speakViaGoogleAudio(t).then(function (ok) {
            if (!ok) speakKeywordWeb(t);
            ack(true);
          });
        } else {
          speakKeywordWeb(t);
          ack(true);
        }
      } catch (e) {
        ack(false);
      }
    } catch (e) {}
  });

  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.addEventListener('voiceschanged', function () {
        window.speechSynthesis.getVoices();
      });
    } catch (e) {}
  }

  function showView(name) {
    $$('.view').forEach(v => v.classList.add('hidden'));
    $$('.nav-link').forEach(l => l.classList.remove('active'));
    const view = $('#view-' + name);
    const link = $('[data-view="' + name + '"]');
    if (view) view.classList.remove('hidden');
    if (link) link.classList.add('active');
    const exitBtn = document.getElementById('btn-exit-quiz');
    if (exitBtn) exitBtn.style.display = (name === 'quiz') ? 'inline-block' : 'none';
    if (name === 'cards') renderCard();
    if (name === 'quiz') {
      syncQuizDimensionRow();
      startQuiz();
    }
  }

  function parseHash() {
    const hash = (window.location.hash || '#cards').slice(1);
    return hash === 'quiz' ? 'quiz' : 'cards';
  }

  window.addEventListener('hashchange', () => showView(parseHash()));

  var CACHE_TTL_MS = 10 * 60 * 1000; // 10분
  var LOCAL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일 (첫 방문 후 다음 방문부터 바로 표시)
  /** Notion API 한 번에 가져올 page_size=100 기준 페이지 수 — 대용량 DB 타임아웃 방지 */
  var NOTION_CHUNK_PAGES_FIRST = 3;
  var NOTION_CHUNK_PAGES_MORE = 4;

  function getNotionApiBase() {
    var origin = window.location.origin || '';
    if (!origin && window.location.href) {
      var a = document.createElement('a');
      a.href = window.location.href;
      origin = a.origin || (a.protocol + '//' + a.host);
    }
    var pathname = (window.location && window.location.pathname) || '';
    var pathParts = pathname.split('/').filter(Boolean);
    var basePath = pathParts.length > 1 ? '/' + pathParts.slice(0, -1).join('/') : '';
    return { origin: origin || '', basePath: basePath };
  }

  function buildNotionWordsApiUrl(dbId, setTitleQ, opts) {
    opts = opts || {};
    var base = getNotionApiBase();
    var url = (base.origin || '') + base.basePath + '/api/notion-words?database_id=' + encodeURIComponent(dbId) +
      (setTitleQ ? '&set_title=' + encodeURIComponent(setTitleQ) : '') + '&t=' + Date.now();
    if (opts.pageLimit) url += '&page_limit=' + encodeURIComponent(String(opts.pageLimit));
    if (opts.startCursor) url += '&start_cursor=' + encodeURIComponent(opts.startCursor);
    return url;
  }

  function setLoadProgressMessage(msg) {
    var s = document.getElementById('initStatus');
    if (!s) return;
    s.textContent = msg;
    s.style.display = 'block';
    s.style.color = '#666';
  }

  function mergeWordLists(existing, incoming) {
    if (!incoming || !incoming.length) return existing ? existing.slice() : [];
    if (!existing || !existing.length) return incoming.slice();
    var byKey = {};
    function absorb(w) {
      if (!w || !w.keyword) return;
      var k = String(w.category || '') + '|' + String(w.keyword).trim();
      if (!byKey[k]) {
        byKey[k] = {
          keyword: w.keyword,
          meaning: w.meaning || '',
          example: w.example || '',
          category: w.category,
          themes: (w.themes && w.themes.slice()) || (w.theme ? [w.theme] : [])
        };
        return;
      }
      var b = byKey[k];
      if (w.themes && w.themes.length) {
        w.themes.forEach(function (t) {
          if (t && b.themes.indexOf(t) === -1) b.themes.push(t);
        });
      } else if (w.theme && b.themes.indexOf(w.theme) === -1) {
        b.themes.push(w.theme);
      }
      if (w.meaning && !b.meaning) b.meaning = w.meaning;
      if (w.example && !b.example) b.example = w.example;
      if (w.category && !b.category) b.category = w.category;
    }
    existing.forEach(absorb);
    incoming.forEach(absorb);
    return Object.keys(byKey).map(function (k) {
      var w = byKey[k];
      if (w.themes && w.themes.length === 1) w.theme = w.themes[0];
      if (w.themes && w.themes.length > 1) w.meaning = w.themes.join(', ');
      return w;
    });
  }

  function applyWordsPayloadToApp(payload, opts) {
    opts = opts || {};
    if (!payload) return;
    if (payload.setTitle) setTitle = payload.setTitle;
    if (payload.themeLabel) themeLabel = String(payload.themeLabel).trim() || themeLabel;
    if (payload.categoryLabel) categoryLabel = String(payload.categoryLabel).trim() || categoryLabel;
    if (payload.words) {
      allWords = payload.words;
      invalidateDeckKindCache();
      applyFilter(!!opts.resetCardIndex);
    }
    if (document.getElementById('pageTitle')) document.getElementById('pageTitle').textContent = setTitle;
    document.title = setTitle + ' · 똑패스';
    if (opts.refreshUi) {
      applyFilterUI();
      syncQuizDimensionRow();
      var view = (window.location.hash || '#cards').slice(1) || 'cards';
      if (view === 'cards') renderCard();
      else if (view === 'quiz') startQuiz();
    }
  }

  async function fetchNotionWordsChunkOnce(dbId, setTitleQ, opts) {
    opts = opts || {};
    var base = getNotionApiBase();
    var url = buildNotionWordsApiUrl(dbId, setTitleQ, {
      pageLimit: opts.pageLimit || NOTION_CHUNK_PAGES_FIRST,
      startCursor: opts.startCursor || ''
    });
    var timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : 55000;
    var res = await fetchWithTimeout(url, { cache: 'no-store', method: 'GET' }, timeoutMs);
    if (!res.ok && base.basePath && res.status === 404) {
      var fallbackUrl = (base.origin || '') + '/api/notion-words?database_id=' + encodeURIComponent(dbId) +
        (setTitleQ ? '&set_title=' + encodeURIComponent(setTitleQ) : '') + '&t=' + Date.now();
      if (opts.pageLimit) fallbackUrl += '&page_limit=' + encodeURIComponent(String(opts.pageLimit));
      if (opts.startCursor) fallbackUrl += '&start_cursor=' + encodeURIComponent(opts.startCursor);
      res = await fetchWithTimeout(fallbackUrl, { cache: 'no-store', method: 'GET' }, timeoutMs);
    }
    if (!res.ok) {
      var err = await res.json().catch(function () { return {}; });
      throw new Error(err.error || err.message || res.statusText);
    }
    return res.json();
  }

  /** 대용량 DB: 첫 청크로 바로 화면 → 나머지는 이어서 병합 */
  async function fetchNotionWordsProgressive(dbId, setTitleQ, onPartial) {
    var mergedWords = [];
    var meta = { setTitle: '', themeLabel: '', categoryLabel: '' };
    var cursor = null;
    var hasMore = true;
    var pass = 0;

    while (hasMore) {
      pass += 1;
      var pageLimit = pass === 1 ? NOTION_CHUNK_PAGES_FIRST : NOTION_CHUNK_PAGES_MORE;
      if (pass === 1) {
        setLoadProgressMessage('불러오는 중… (먼저 일부 표시)');
      } else {
        setLoadProgressMessage('추가 불러오는 중… ' + mergedWords.length + '개');
      }

      var chunk = await fetchNotionWordsChunkOnce(dbId, setTitleQ, {
        pageLimit: pageLimit,
        startCursor: cursor || '',
        timeoutMs: pass === 1 ? 45000 : 55000
      });

      if (chunk.setTitle) meta.setTitle = chunk.setTitle;
      if (chunk.themeLabel) meta.themeLabel = chunk.themeLabel;
      if (chunk.categoryLabel) meta.categoryLabel = chunk.categoryLabel;
      mergedWords = mergeWordLists(mergedWords, chunk.words || []);

      hasMore = !!chunk.hasMore && !!chunk.nextCursor;
      cursor = chunk.nextCursor || null;

      if (typeof onPartial === 'function') {
        onPartial({
          setTitle: meta.setTitle,
          themeLabel: meta.themeLabel,
          categoryLabel: meta.categoryLabel,
          words: mergedWords,
          hasMore: hasMore,
          firstChunk: pass === 1
        });
      }

      if (!hasMore) break;
    }

    return {
      setTitle: meta.setTitle,
      themeLabel: meta.themeLabel,
      categoryLabel: meta.categoryLabel,
      words: mergedWords
    };
  }

  function refreshNotionWordsInBackground(dbId, setTitleQ, cacheKey) {
    fetchNotionWordsProgressive(dbId, setTitleQ, function (partial) {
      applyWordsPayloadToApp(partial, { refreshUi: true, resetCardIndex: false });
      if (!partial.hasMore) {
        tryCacheWordsPayload(cacheKey, {
          setTitle: setTitle,
          themeLabel: themeLabel,
          categoryLabel: categoryLabel,
          words: allWords,
          ts: Date.now()
        });
        hideInitStatus();
      }
    }).catch(function () {});
  }

  function tryCacheWordsPayload(cacheKey, obj) {
    try {
      var payload = JSON.stringify(obj);
      if (payload.length > 4500000) {
        console.warn('words cache skip: payload too large for storage');
        return;
      }
      try {
        sessionStorage.setItem(cacheKey, payload);
      } catch (e1) {
        console.warn('sessionStorage cache failed', e1);
      }
      try {
        localStorage.setItem(cacheKey, payload);
      } catch (e2) {
        console.warn('localStorage cache failed (large DB ok without persistent cache)', e2);
      }
    } catch (e) {}
  }

  async function loadData() {
    try {
      var _hrefLoad = window.location && window.location.href ? window.location.href : '';
      var setTitleQ = parseQueryKey(_hrefLoad, 'set_title');
      var dbId = _dbIdFromUrl || (parseQueryKey(_hrefLoad, 'db') || parseQueryKey(_hrefLoad, 'database_id') || '').trim().replace(/-/g, '');
      let data;

      if (window.location.href.indexOf('db=') >= 0 && !dbId) {
        var errEl = document.getElementById('loadError');
        if (errEl) {
          errEl.innerHTML = 'URL에 db가 있는데 읽지 못했습니다. <strong>Ctrl+Shift+R</strong>(강력 새로고침) 또는 브라우저 캐시 삭제 후 다시 열어보세요.';
          errEl.style.display = 'block';
        }
        if (document.getElementById('pageTitle')) {
          document.getElementById('pageTitle').textContent = '캐시 새로고침 필요';
        }
        return;
      }

      if (dbId) {
        var cacheKey = 'words_cache_v3_' + dbId;
        var instantData = null;

        // 1) 캐시 시도 — sessionStorage(이번 탭) → localStorage(과거 방문). 같은 dbId만 사용해 내용 섞임 없음.
        try {
          var raw = sessionStorage.getItem(cacheKey);
          if (!raw) raw = localStorage.getItem(cacheKey);
          if (raw) {
            var cached = JSON.parse(raw);
            var age = Date.now() - (cached.ts || 0);
            var ttl = age < CACHE_TTL_MS ? CACHE_TTL_MS : LOCAL_CACHE_TTL_MS;
            if (age < ttl && cached.words && cached.words.length > 0) {
              instantData = { setTitle: cached.setTitle || '', themeLabel: cached.themeLabel || '', categoryLabel: cached.categoryLabel || '', words: cached.words };
            }
          }
        } catch (e) {}

        // 2) 캐시 없으면 정적 JSON (연결사·인칭대명사 첫 방문에도 바로 표시)
        if (!instantData && (dbId === CONNECTOR_DB_ID || isConnectorPage)) {
          try {
            var connRes = await fetchWithTimeout('data/connector-words.json?t=' + Date.now(), { cache: 'no-store' }, 45000);
            if (connRes.ok) {
              var localData = await connRes.json();
              if (localData.words && localData.words.length > 0) {
                instantData = { setTitle: localData.setTitle || '연결사(접속부사)', themeLabel: '카테고리', words: localData.words };
              }
            }
          } catch (e) {}
        }
        if (!instantData && dbId === PRONOUN_DB_ID) {
          try {
            var pronRes = await fetchWithTimeout('data/pronoun-words.json?t=' + Date.now(), { cache: 'no-store' }, 45000);
            if (pronRes.ok) {
              var pronData = await pronRes.json();
              if (pronData.words && pronData.words.length > 0) {
                instantData = { setTitle: pronData.setTitle || '인칭대명사표', themeLabel: pronData.themeLabel || '구분', words: pronData.words };
              }
            }
          } catch (e) {}
        }

        if (instantData) {
          data = instantData;
          refreshNotionWordsInBackground(dbId, setTitleQ, cacheKey);
        } else {
          setLoadProgressMessage('불러오는 중…');
          data = await fetchNotionWordsProgressive(dbId, setTitleQ, function (partial) {
            applyWordsPayloadToApp(partial, {
              refreshUi: partial.firstChunk,
              resetCardIndex: partial.firstChunk
            });
            if (!partial.hasMore) hideInitStatus();
          });
          tryCacheWordsPayload(cacheKey, {
            setTitle: data.setTitle || '',
            themeLabel: (data.themeLabel && data.themeLabel.trim()) || '',
            categoryLabel: (data.categoryLabel && data.categoryLabel.trim()) || '',
            words: data.words || [],
            ts: Date.now()
          });
        }
      } else {
        // 없으면 기존 words.json
        const res = await fetchWithTimeout('data/words.json?t=' + Date.now(), { cache: 'no-store' }, 45000);
        data = await res.json();
      }

      setTitle = data.setTitle || '토익 시제부사';
      themeLabel = (data.themeLabel && data.themeLabel.trim()) || (isConnectorPage ? '카테고리' : '시제');
      categoryLabel = (data.categoryLabel && data.categoryLabel.trim()) || '';
      allWords = data.words || [];
      invalidateDeckKindCache();
      applyFilter();
      document.getElementById('pageTitle').textContent = setTitle;
      document.title = setTitle + ' · 똑패스';
      var errEl = document.getElementById('loadError');
      if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
      var initEl = document.getElementById('initStatus');
      if (initEl) initEl.style.display = 'none';
      if (allWords.length === 0) {
        if (errEl) {
          errEl.textContent = isConnectorPage
            ? '연결사 단어가 없습니다. 노션 DB(연결사)가 비어 있거나, 속성 이름이 키워드/뜻·예문·카테고리인지 확인해 주세요.'
            : '단어가 0개입니다. data/words.json을 확인해 주세요.';
          errEl.style.display = 'block';
        }
      }
    } catch (e) {
      console.error('Failed to load words:', e);
      allWords = [];
      filteredWords = [];
      invalidateDeckKindCache();
      if (document.getElementById('pageTitle')) {
        document.getElementById('pageTitle').textContent = '데이터 로드 실패';
      }
      var errEl = document.getElementById('loadError');
      var em = (e && e.message) ? String(e.message) : '';
      var hint504 = /504|502|503|timeout|Timeout|Gateway|FUNCTION_INVOCATION/i.test(em)
        ? '<br><br><b>대용량 DB</b>는 첫 로드에 1분 가까이 걸릴 수 있습니다. 잠시 후 <strong>새로고침</strong>하거나, 네트워크를 확인해 주세요.'
        : '';
      if (errEl) {
        errEl.innerHTML = isConnectorPage
          ? ('연결사 데이터를 불러오지 못했습니다.<br><small>' + em + '</small>' + hint504 + '<br><br>노션 DB(연결사) 연결·<b>NOTION_API_KEY</b>·Vercel 환경 변수를 확인해 주세요.')
          : ('데이터를 불러오지 못했습니다.<br><small>' + em + '</small>' + hint504 + '<br><br>노션 연결·<b>NOTION_API_KEY</b>·(기본품사 등) DB 크기가 크면 서버 시간 제한에 걸릴 수 있습니다. <b>data/words.json</b> 로컬 파일은 GitHub에 있는지도 확인해 주세요.');
        errEl.style.display = 'block';
      }
    }
  }

  function applyFilter(resetCardIndex) {
    const val = ($('#themeFilter') || {}).value || '';
    const useCategoryForFilter = (categoryLabel || categoryColumnLooksLikePartOfSpeech()) &&
      allWords.some(function (w) { return w.category; });
    if (!val) {
      filteredWords = [...allWords];
    } else if (themeLabel === '격' && useCategoryForFilter) {
      // 인칭대명사: 필터는 구분(1인칭 단수 등)으로 → 재귀대명사 단어도 해당 구분 선택 시 함께 노출
      filteredWords = allWords.filter(function (w) { return w.category === val; });
    } else if (themeLabel === '격') {
      filteredWords = allWords.filter(function (w) {
        const themes = (w.themes && w.themes.length) ? w.themes : (w.theme ? [w.theme] : []);
        return themes.includes(val);
      });
    } else if (isBinaryPairingDeck()) {
      filteredWords = allWords.filter(function (w) { return getWordQuizAnswer(w) === val; });
    } else if (isParticipleBlankDeck()) {
      filteredWords = allWords.filter(function (w) {
        var th = getCorrectThemes(w);
        return getWordQuizAnswer(w) === val || th.indexOf(val) >= 0;
      });
    } else if (useCategoryForFilter) {
      filteredWords = allWords.filter(function (w) { return w.category === val; });
    } else {
      filteredWords = allWords.filter(function (w) {
        const themes = (w.themes && w.themes.length) ? w.themes : (w.theme ? [w.theme] : []);
        return themes.includes(val);
      });
    }
    if (resetCardIndex) cardIndex = 0;
  }

  /** answer_logs.tag / 모니터용. 실제 로드된 테스트 제목(setTitle) 우선, 없으면 config·기본값 */
  function getTag() {
    if (isConnectorPage) return (setTitle && setTitle.trim()) || '연결사(접속부사)';
    return (setTitle && setTitle.trim()) || (window.APP_CONFIG && window.APP_CONFIG.TEST_TITLE) || '토익 시제부사';
  }

  // ——— 카드 ———
  function renderCard() {
    applyFilter(false);
    const list = filteredWords;
    const idx = Math.max(0, Math.min(cardIndex, list.length - 1));
    cardIndex = list.length ? idx : 0;
    const word = list[cardIndex];

    const cardEl = $('#card');
    if (cardEl) cardEl.classList.remove('flipped');

    if (!word) {
      if ($('#cardKeyword')) $('#cardKeyword').textContent = '—';
      if ($('#cardMeaning')) $('#cardMeaning').textContent = '—';
      if ($('#cardExample')) $('#cardExample').textContent = '—';
      if ($('#cardThemeBadge')) $('#cardThemeBadge').textContent = '—';
      if ($('#cardThemeLine')) $('#cardThemeLine').textContent = '—';
      if ($('#cardIndex')) $('#cardIndex').textContent = '0 / 0';
      if ($('#cardPrev')) $('#cardPrev').disabled = true;
      if ($('#cardNext')) $('#cardNext').disabled = true;
      return;
    }

    $('#cardKeyword').textContent = word.keyword;
    const themesLabel = getCorrectThemes(word).join(', ');
    var catStr = word.category && String(word.category).trim();
    var badgeEl = $('#cardThemeBadge');
    if (badgeEl) badgeEl.classList.remove('card-theme-badge--hidden');
    if (themeLabel === '격') {
      // 뒷면: 구분만 + 의미(격별 설명, 코드 매핑) + 격
      var cat = word.category && String(word.category).trim() ? word.category : '';
      $('#cardMeaning').textContent = '구분: ' + (cat || '—');
      var themes = getCorrectThemes(word);
      var meaningParts = themes.map(function (t) { return getCaseMeaning(cat, t); });
      $('#cardExample').textContent = '의미: ' + (meaningParts.length ? meaningParts.join(', ') : '—');
      $('#cardThemeLine').textContent = '격: ' + (themesLabel || '—');
      if (badgeEl) badgeEl.textContent = cat || themesLabel || '—';
    } else if (isPrepConjAdvStyleDeck()) {
      if (badgeEl) badgeEl.classList.add('card-theme-badge--hidden');
      $('#cardThemeBadge').textContent = '';
      var catPrep = catStr || '—';
      var lab = categoryLabel ? String(categoryLabel).trim() : '품사';
      $('#cardMeaning').textContent = lab + ': ' + catPrep;
      var meanPrep = word.meaning && String(word.meaning).trim();
      $('#cardExample').textContent = meanPrep ? ('뜻: ' + meanPrep) : '—';
      var exPrep = word.example && String(word.example).trim();
      $('#cardThemeLine').textContent = exPrep ? ('예문: ' + exPrep) : '';
    } else if (isBinaryPairingDeck()) {
      var pairAns = getWordQuizAnswer(word) || catStr || '—';
      if (badgeEl) badgeEl.classList.remove('card-theme-badge--hidden');
      $('#cardThemeBadge').textContent = pairAns;
      $('#cardMeaning').textContent = word.meaning && String(word.meaning).trim() ? word.meaning : '—';
      $('#cardExample').textContent = word.example && String(word.example).trim() ? word.example : '—';
      $('#cardThemeLine').textContent = '짝: ' + pairAns;
    } else {
      $('#cardMeaning').textContent = word.meaning;
      $('#cardExample').textContent = word.example;
      /** 품사·구 DB에서 theme 미입력 시 배지에 category 표시 */
      $('#cardThemeBadge').textContent = themesLabel || (catStr && categoryLabel ? catStr : '—');
      $('#cardThemeLine').textContent = themesLabel
        ? ((themesLabel || '—') + ' ' + (themeLabel + '에 씁니다'))
        : (catStr && categoryLabel ? (categoryLabel + ': ' + catStr) : ((themesLabel || '—') + ' ' + (themeLabel + '에 씁니다')));
    }
    $('#cardIndex').textContent = (cardIndex + 1) + ' / ' + list.length;
    $('#cardPrev').disabled = cardIndex <= 0;
    $('#cardNext').disabled = cardIndex >= list.length - 1;
    scheduleSpeakKeyword(word.keyword);
  }

  function cardPrev() {
    if (cardIndex > 0) {
      cardIndex--;
      renderCard();
    }
  }

  function cardNext() {
    if (cardIndex < filteredWords.length - 1) {
      cardIndex++;
      renderCard();
    }
  }

  function cardFlip() {
    const card = $('#card');
    if (card && filteredWords.length) card.classList.toggle('flipped');
  }

  (function bindCardUi() {
    var tf = $('#themeFilter');
    if (tf) tf.addEventListener('change', function () { applyFilter(true); renderCard(); });
    var prev = $('#cardPrev');
    if (prev) prev.addEventListener('click', cardPrev);
    var next = $('#cardNext');
    if (next) next.addEventListener('click', cardNext);
    var cardEl = $('#card');
    if (cardEl) cardEl.addEventListener('click', cardFlip);
    var btnC = $('#btnCardSpeak');
    if (btnC) btnC.addEventListener('click', function (e) {
      e.stopPropagation();
      primeSpeechFromUserTap();
      var kw = $('#cardKeyword');
      if (kw && kw.textContent) speakKeyword(kw.textContent.trim());
    });
    var btnQ = $('#btnQuizSpeak');
    if (btnQ) btnQ.addEventListener('click', function () {
      if (quizGradeByParticipleBlank) return;
      primeSpeechFromUserTap();
      if (currentQuizWord && currentQuizWord.keyword) speakKeyword(currentQuizWord.keyword);
    });
  })();

  // ——— 퀴즈 ———
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function pickChoices(correctWord, count) {
    const others = filteredWords.filter(w => w.keyword !== correctWord.keyword);
    const shuffled = shuffle(others);
    const choices = [correctWord, ...shuffled.slice(0, count - 1)];
    return shuffle(choices);
  }

  /** theme/themes만 읽음 — 덱 판별(isCategoryDrivenDeck 등) 호출 없음. getQuizClassificationValues 순환 재귀 방지 */
  function getWordThemeValues(word) {
    if (!word) return [];
    if (word.themes && Array.isArray(word.themes) && word.themes.length) {
      return word.themes.map(function (t) { return String(t).trim(); }).filter(Boolean);
    }
    if (word.theme != null && String(word.theme).trim() !== '') {
      return [String(word.theme).trim()];
    }
    return [];
  }

  var _deckKindCache = null;

  function invalidateDeckKindCache() {
    _deckKindCache = null;
  }

  function sortedValueSetMatch(pool, expected) {
    if (pool.length !== expected.length) return false;
    var a = pool.slice().sort();
    var b = expected.slice().sort();
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /** 대용량 DB(1200+)에서 덱 타입·분류값을 한 번만 계산 — 무한 재귀·반복 스캔 방지 */
  function getDeckKindCache() {
    if (_deckKindCache) return _deckKindCache;
    var uniqueCategoryValues = [...new Set(allWords.map(function (w) {
      return w.category && String(w.category).trim();
    }).filter(Boolean))].sort();

    var quizSet = {};
    allWords.forEach(function (w) {
      if (w.category && String(w.category).trim()) quizSet[String(w.category).trim()] = 1;
      getWordThemeValues(w).forEach(function (t) { quizSet[t] = 1; });
    });
    var quizClassificationValues = Object.keys(quizSet).sort();

    var toInfGerund = sortedValueSetMatch(quizClassificationValues, ['to부정사', '(동)명사']);
    var gerundPrep = sortedValueSetMatch(quizClassificationValues, ['동명사와 짝', '동명사와 짝 불가능']);
    var binaryPairing = toInfGerund || gerundPrep;

    var categoryDriven = false;
    if (themeLabel !== '격' && !binaryPairing && uniqueCategoryValues.length >= 2) {
      categoryDriven = !uniqueCategoryValues.every(function (c) { return THEMES.indexOf(c) >= 0; });
    }

    var participleBlank = false;
    if (themeLabel !== '격' && !binaryPairing) {
      var poolLower = quizClassificationValues.map(function (v) {
        return String(v || '').trim().toLowerCase();
      }).filter(Boolean);
      if (poolLower.length >= 2) {
        participleBlank = poolLower.every(function (v) {
          return v === 'ving' || v === 'ved' || v === 'ing' || v === 'ed' || v === '-ing' || v === '-ed';
        });
      }
    }

    var prepConjAdv = false;
    if (categoryDriven && themeLabel !== '격') {
      if (categoryLabel && /품사|\bPOS\b/i.test(String(categoryLabel))) {
        prepConjAdv = true;
      } else if (uniqueCategoryValues.length >= 2) {
        var okPos = { '전치사': 1, '접속사': 1, '부사': 1 };
        prepConjAdv = uniqueCategoryValues.every(function (c) { return okPos[c]; });
      }
    }

    _deckKindCache = {
      uniqueCategoryValues: uniqueCategoryValues,
      quizClassificationValues: quizClassificationValues,
      categoryDriven: categoryDriven,
      binaryPairing: binaryPairing,
      toInfGerund: toInfGerund,
      gerundPrep: gerundPrep,
      participleBlank: participleBlank,
      prepConjAdv: prepConjAdv
    };
    return _deckKindCache;
  }

  /** 단어당 정답 시제. 품사·구 DB(고유 category 2개 이상)는 시제 미입력 시 '현재'로 채우지 않음 — API에 categoryLabel 없어도 동일 적용 */
  /** 전체 DB 기준(카드 필터와 무관) — 퀴즈 선택지·품사 모드 판별에 사용 */
  function getUniqueCategoryValues() {
    return getDeckKindCache().uniqueCategoryValues;
  }

  /** 노션「카테고리」열이 theme으로 매핑된 DB도 포함 — 2지선다 족보용 */
  function getQuizClassificationValues() {
    return getDeckKindCache().quizClassificationValues;
  }

  function isCategoryValueSet(expected, pool) {
    var uc = pool || getQuizClassificationValues();
    return sortedValueSetMatch(uc, expected);
  }

  function isToInfGerundPairDeck() {
    return getDeckKindCache().toInfGerund;
  }

  function isGerundPrepPairDeck() {
    return getDeckKindCache().gerundPrep;
  }

  function isBinaryPairingDeck() {
    return getDeckKindCache().binaryPairing;
  }

  /** 테마·분류 값이 ving/ved(또는 ing/ed)만이면 예문 빈칸 분사 퀴즈 */
  function isParticipleBlankDeck() {
    return getDeckKindCache().participleBlank;
  }

  function normalizePartTheme(raw) {
    var t = String(raw || '').trim().toLowerCase();
    if (t === 'ing' || t === '-ing' || t === 'ving') return 'ving';
    if (t === 'ed' || t === '-ed' || t === 'ved') return 'ved';
    return t;
  }

  function parseExampleEnglish(example) {
    var ex = String(example || '').trim();
    if (!ex) return '';
    var idx = ex.indexOf(' / ');
    if (idx >= 0) return ex.slice(0, idx).trim();
    idx = ex.indexOf('/');
    if (idx >= 0) {
      var before = ex.slice(0, idx).trim();
      var after = ex.slice(idx + 1).trim();
      if (/[a-zA-Z]/.test(before)) return before;
      if (/[a-zA-Z]/.test(after)) return after;
    }
    return ex;
  }

  function blankKeywordInText(text, keyword) {
    if (!text || !keyword) return text || '';
    var kw = String(keyword).trim();
    var escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var re = new RegExp('\\b' + escaped + '\\b', 'i');
    if (!re.test(text)) re = new RegExp(escaped, 'i');
    if (!re.test(text)) return text;
    return text.replace(re, '______');
  }

  /** ving 정답 → -ed 오답, ved 정답 → -ing 오답 (규칙 기반, 수동 짝 없음) */
  function flipParticipleKeyword(keyword, themeRaw) {
    var t = normalizePartTheme(themeRaw);
    var w = String(keyword || '').trim();
    if (!w) return '';
    if (t === 'ving') {
      if (/ying$/i.test(w)) return w.slice(0, -4) + 'ied';
      if (/ing$/i.test(w)) {
        var stem = w.slice(0, -3);
        if (/e$/i.test(stem)) return stem.slice(0, -1) + 'ed';
        return stem + 'ed';
      }
      return w + 'ed';
    }
    if (t === 'ved') {
      if (/ied$/i.test(w)) return w.slice(0, -3) + 'ying';
      if (/ed$/i.test(w)) {
        var withoutD = w.slice(0, -1);
        if (/e$/i.test(withoutD)) return withoutD.slice(0, -1) + 'ing';
        return w.slice(0, -2) + 'ing';
      }
      return w + 'ing';
    }
    return w + 'ed';
  }

  function getParticipleThemeForWord(word) {
    if (!word) return '';
    if (word.category && String(word.category).trim()) return String(word.category).trim();
    var th = getCorrectThemes(word);
    return th.length ? String(th[0]).trim() : '';
  }

  function canParticipleBlankQuiz(word) {
    if (!word || !word.keyword || !word.example) return false;
    var kw = String(word.keyword).trim();
    if (!kw) return false;
    var eng = parseExampleEnglish(word.example);
    if (!eng) return false;
    var blanked = blankKeywordInText(eng, kw);
    if (!blanked || blanked === eng) return false;
    var theme = getParticipleThemeForWord(word);
    if (!normalizePartTheme(theme)) return false;
    var alt = flipParticipleKeyword(kw, theme);
    return !!(alt && alt.toLowerCase() !== kw.toLowerCase());
  }

  function getWordQuizAnswer(word) {
    if (!word) return '';
    if (word.category && String(word.category).trim()) return String(word.category).trim();
    var th = getCorrectThemes(word);
    return th.length ? String(th[0]).trim() : '';
  }

  function isPrepConjAdvStyleDeck() {
    return getDeckKindCache().prepConjAdv;
  }

  function getUniqueMeanings() {
    return [...new Set(allWords.map(function (w) {
      return w.meaning && String(w.meaning).trim();
    }).filter(Boolean))].sort();
  }

  function getQuizDimension() {
    try {
      var row = document.getElementById('quiz-dimension-row');
      if (!row || row.classList.contains('hidden')) return 'pos';
      var inp = row.querySelector('input[name="quizDim"]:checked');
      return inp && inp.value === 'meaning' ? 'meaning' : 'pos';
    } catch (e) {
      return 'pos';
    }
  }

  function syncQuizDimensionRow() {
    var row = document.getElementById('quiz-dimension-row');
    if (!row) return;
    if (isPrepConjAdvStyleDeck()) {
      row.classList.remove('hidden');
    } else {
      row.classList.add('hidden');
    }
  }

  function isCategoryDrivenDeck() {
    return getDeckKindCache().categoryDriven;
  }

  /** 필터/applyFilter용: API에 categoryLabel 없어도 품사 컬럼만 시제 네 종류가 아니면 분류 필터 사용 */
  function categoryColumnLooksLikePartOfSpeech() {
    var catVals = [...new Set(allWords.map(function (w) {
      return w.category && String(w.category).trim();
    }).filter(Boolean))];
    if (catVals.length < 2) return false;
    return !catVals.every(function (c) { return THEMES.indexOf(c) >= 0; });
  }

  /** 단어당 정답 시제. theme 하나 또는 themes 배열(중복 정답). */
  function getCorrectThemes(word) {
    var raw = getWordThemeValues(word);
    if (raw.length) return raw;
    if (isCategoryDrivenDeck()) return [];
    if (categoryLabel && themeLabel !== '시제' && themeLabel !== '격') return [];
    return ['현재'];
  }

  function pickThemeChoices(primaryTheme, count) {
    const others = THEMES.filter(t => t !== primaryTheme);
    const shuffled = shuffle(others);
    const choices = [primaryTheme, ...shuffled.slice(0, count - 1)];
    return shuffle(choices);
  }

  /** 연결사·시제: 전체 DB 기준 고유 theme 값 (퀴즈는 카드 필터 무시) */
  function getUniqueCategories() {
    return [...new Set(arrayFlatMap(allWords, function (w) { return getCorrectThemes(w); }))].filter(Boolean).sort();
  }

  function pickCategoryChoices(primary, allCats, count) {
    if (!allCats.length || !primary) return [];
    var others = allCats.filter(function (c) { return c !== primary; });
    var shuffled = shuffle(others);
    var choices = [primary].concat(shuffled.slice(0, count - 1));
    while (choices.length < count) { choices.push(primary); }
    return shuffle(choices.slice(0, count));
  }

  function startQuiz() {
    /** 퀴즈는 항상 전체 단어 기준(카드에서 품사 필터를 걸어도 동일 문항·동일 선택지 풀) */
    var list = allWords.slice();
    /** 2지선다 족보: 짝(category/theme) 없는 행 제외 */
    if (themeLabel !== '격' && isBinaryPairingDeck()) {
      var withPair = list.filter(function (w) { return getWordQuizAnswer(w); });
      if (withPair.length >= 1) list = withPair;
    } else if (isParticipleBlankDeck()) {
      var pbList = list.filter(canParticipleBlankQuiz);
      if (pbList.length >= 1) list = pbList;
    } else if (themeLabel !== '격' && isCategoryDrivenDeck()) {
      /** 품사·구별 덱: category 없는 행은 퀴즈에서 제외 */
      var withCat = list.filter(function (w) { return w.category && String(w.category).trim(); });
      if (withCat.length >= 1) list = withCat;
    }
    quizWordOrder = shuffle(list);
    quizIndex = 0;
    quizScore = { correct: 0, total: 0 };
    nextQuiz();
  }

  function nextQuiz() {
    const progressEl = document.getElementById('quizProgressLine');
    if (quizWordOrder.length < 1) {
      if (progressEl) progressEl.textContent = '0 / 0 문제';
      $('#quizWord').textContent = isConnectorPage
        ? '연결사 단어가 없습니다. 카드 탭에서 데이터가 로드됐는지 확인하거나, 노션 DB(연결사)를 확인해 주세요.'
        : '단어가 필요합니다.';
      var qm0 = $('#quizMeaning');
      if (qm0) qm0.textContent = '';
      $('#quizChoices').innerHTML = '';
      $('#quizScore').textContent = '0 / 0';
      return;
    }
    /** 인덱스가 범위 밖이면(끝난 직후 등) 재시작하지 않고 대기 — 문항 수 꼬임 방지 */
    if (quizIndex >= quizWordOrder.length) {
      return;
    }
    if (progressEl) progressEl.textContent = (quizIndex + 1) + ' / ' + quizWordOrder.length + ' 문제';
    currentQuizWord = quizWordOrder[quizIndex];
    quizAnswered = false;
    quizGradeByCategory = false;
    quizGradeByPairing = false;
    quizGradeByMeaning = false;
    quizGradeByParticipleBlank = false;
    const correctThemes = getCorrectThemes(currentQuizWord);
    const primaryTheme = correctThemes[0] || '현재';
    let choices;
    let questionText;
    const allCats = getUniqueCategories();
    const uniqueCats = getUniqueCategoryValues();
    const useCategoryQuiz = !!(themeLabel !== '격' && isCategoryDrivenDeck() &&
      currentQuizWord.category && String(currentQuizWord.category).trim());
    var keywordStr = currentQuizWord.keyword && String(currentQuizWord.keyword).trim();
    var meaningQuizMode = !!(isPrepConjAdvStyleDeck() && getQuizDimension() === 'meaning' &&
      currentQuizWord.meaning && String(currentQuizWord.meaning).trim());

    if (themeLabel === '격') {
      // 격 퀴즈: 선택지는 항상 주격·목적격·소유격·소유대명사·재귀대명사 중 4개 (같은 격만 나오는 것 방지)
      var caseChoices = CASE_TYPES.filter(function (c) { return allWords.some(function (w) { var t = getCorrectThemes(w); return t.indexOf(c) >= 0; }); });
      if (caseChoices.length < 2) caseChoices = CASE_TYPES.slice();
      choices = pickCategoryChoices(primaryTheme, caseChoices, 4);
      questionText = '이 단어는 무슨 격에 쓰이나요?';
    } else if (isParticipleBlankDeck() && canParticipleBlankQuiz(currentQuizWord)) {
      quizGradeByParticipleBlank = true;
      var pKw = String(currentQuizWord.keyword).trim();
      var pTheme = getParticipleThemeForWord(currentQuizWord);
      var pAlt = flipParticipleKeyword(pKw, pTheme);
      choices = shuffle([pKw, pAlt]);
      questionText = '빈칸에 알맞은 단어를 고르세요.';
    } else if (meaningQuizMode) {
      quizGradeByMeaning = true;
      var primaryMean = String(currentQuizWord.meaning).trim();
      var allMeans = getUniqueMeanings();
      choices = pickCategoryChoices(primaryMean, allMeans.length ? allMeans : [primaryMean], 4);
      questionText = (keywordStr ? ('「' + keywordStr + '」') : '이 표현') + '의 뜻으로 알맞은 것은?';
    } else if (isToInfGerundPairDeck()) {
      quizGradeByPairing = true;
      quizGradeByCategory = true;
      var pairPool = getQuizClassificationValues();
      var pairAns = getWordQuizAnswer(currentQuizWord);
      choices = pickCategoryChoices(pairAns, pairPool, 2);
      questionText = '이 단어와 어울리는 짝은?';
    } else if (isGerundPrepPairDeck()) {
      quizGradeByPairing = true;
      quizGradeByCategory = true;
      var prepPool = getQuizClassificationValues();
      var prepAns = getWordQuizAnswer(currentQuizWord);
      choices = pickCategoryChoices(prepAns, prepPool, 2);
      questionText = '이 전치사는 동명사와 잘 어울리나요?';
    } else if (useCategoryQuiz) {
      // 기본어휘 품사·구별 등: 노션 category 기준
      quizGradeByCategory = true;
      var primaryCat = String(currentQuizWord.category).trim();
      choices = pickCategoryChoices(primaryCat, uniqueCats, 4);
      var catQ = categoryLabel && String(categoryLabel).trim();
      questionText = '이 단어의 ' + (catQ || '품사·구') + '은(는) 무엇인가요?';
    } else if (themeLabel === '시제' && allCats.length < 2 && !isCategoryDrivenDeck()) {
      choices = pickThemeChoices(primaryTheme, 4);
      questionText = '이 단어는 어느 ' + themeLabel + '에 쓰이나요?';
    } else if (allCats.length >= 2) {
      // 연결사·다중 시제 등: theme 값들로 선택지
      choices = pickCategoryChoices(primaryTheme, allCats, 4);
      questionText = isConnectorPage ? '이 연결사는 어떤 카테고리에 쓰이나요?' : ('이 단어는 어느 ' + themeLabel + '에 쓰이나요?');
    } else if (allCats.length === 1 && !isCategoryDrivenDeck()) {
      // theme 종류가 하나뿐이면 같은 값만 반복되는 것 방지 → 시제 네 가지(현재·과거·미래·현재완료)로 출제
      choices = pickThemeChoices(primaryTheme, 4);
      questionText = '이 단어는 어느 ' + themeLabel + '에 쓰이나요?';
    } else if (isCategoryDrivenDeck() && uniqueCats.length < 2) {
      choices = pickThemeChoices(primaryTheme, 4);
      questionText = '이 단어는 어느 ' + themeLabel + '에 쓰이나요?';
    } else {
      choices = pickThemeChoices(primaryTheme, 4);
      questionText = '이 단어는 어느 ' + themeLabel + '에 쓰이나요?';
    }
    var quizWordEl = $('#quizWord');
    if (quizGradeByParticipleBlank) {
      var engLine = parseExampleEnglish(currentQuizWord.example);
      quizWordEl.textContent = blankKeywordInText(engLine, String(currentQuizWord.keyword).trim()) || engLine;
      quizWordEl.classList.add('quiz-word-sentence');
    } else {
      quizWordEl.textContent = currentQuizWord.keyword;
      quizWordEl.classList.remove('quiz-word-sentence');
    }
    var qm = $('#quizMeaning');
    if (qm) {
      var spoilFreeQuizLine = themeLabel === '격' || isPrepConjAdvStyleDeck() || isBinaryPairingDeck() || quizGradeByParticipleBlank;
      if (spoilFreeQuizLine) {
        qm.textContent = '';
        qm.classList.add('hidden');
      } else {
        var meanShown = currentQuizWord.meaning && String(currentQuizWord.meaning).trim();
        qm.textContent = meanShown || '—';
        qm.classList.remove('hidden');
      }
    }
    $('#quizQuestion').textContent = questionText;
    $('#quizChoices').innerHTML = choices.map(function (t) {
      return '<li data-theme="' + (t || '').replace(/"/g, '&quot;') + '">' + (t || '') + '</li>';
    }).join('');
    $('#quizFeedback').className = 'quiz-feedback hidden';
    $('#quizFeedback').textContent = '';
    var jogboHint = document.getElementById('jogboAppScoreLine');
    if (jogboHint) {
      jogboHint.textContent = '';
      jogboHint.classList.add('hidden');
    }
    var btnQuizSpeak = $('#btnQuizSpeak');
    if (btnQuizSpeak) {
      if (quizGradeByParticipleBlank) btnQuizSpeak.style.display = 'none';
      else btnQuizSpeak.style.display = '';
    }
    $('#quizScore').textContent = quizScore.correct + ' / ' + quizScore.total;
    $$('#quizChoices li').forEach(li => {
      li.addEventListener('click', onQuizChoice);
    });
    if (!quizGradeByParticipleBlank) scheduleSpeakKeyword(currentQuizWord.keyword);
  }

  /** 똑패스 "오늘 족보"에 뜨게 하려면 created_at_kst(KST 문자열) 필수 */
  function nowKstString() {
    const d = new Date();
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    const pad = (n) => (n < 10 ? '0' : '') + n;
    return kst.getUTCFullYear() + '-' + pad(kst.getUTCMonth() + 1) + '-' + pad(kst.getUTCDate()) +
      ' ' + pad(kst.getUTCHours()) + ':' + pad(kst.getUTCMinutes()) + ':' + pad(kst.getUTCSeconds());
  }

  /**
   * 부모 WebView 없이(외부 브라우저 등) 열린 족보: answer_logs만 넣고 끝나면 students.Score가 안 올라감.
   * URL의 student_id가 있을 때 REST로 User_Profile_월 행에 +5 (정답만).
   */
  async function patchJogboScoreToStudents(correct, studentId, cfg) {
    if (!correct || !cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;
    var sid = (studentId && String(studentId).trim()) ? String(studentId).trim() : '';
    if (!sid || sid === 'guest') return;
    var kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    var mo = kst.getUTCMonth() + 1;
    var month = kst.getUTCFullYear() + '-' + (mo < 10 ? '0' : '') + mo;
    var sheet = 'User_Profile_' + month;
    var base = String(cfg.SUPABASE_URL).replace(/\/$/, '');
    var key = cfg.SUPABASE_ANON_KEY;
    var h = {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    };
    var enc = encodeURIComponent;
    try {
      var selUrl =
        base +
        '/rest/v1/students?select=Score&User%20ID=eq.' +
        enc(sid) +
        '&__sheet_name=eq.' +
        enc(sheet);
      var selRes = await fetch(selUrl, { headers: { apikey: key, Authorization: 'Bearer ' + key } });
      if (!selRes.ok) return;
      var rows = await selRes.json();
      if (!Array.isArray(rows) || rows.length === 0) return;
      var cur = parseInt(rows[0].Score, 10);
      if (isNaN(cur)) cur = 0;
      var next = String(cur + 5);
      var patchUrl =
        base + '/rest/v1/students?User%20ID=eq.' + enc(sid) + '&__sheet_name=eq.' + enc(sheet);
      var patchBody = { Score: next, 'Last Active': nowKstString() };
      var patchRes = await fetch(patchUrl, { method: 'PATCH', headers: h, body: JSON.stringify(patchBody) });
      if (!patchRes.ok) console.warn('students Score PATCH failed:', patchRes.status, await patchRes.text().catch(function () { return ''; }));
    } catch (e) {
      console.warn('patchJogboScoreToStudents:', e);
    }
  }

  async function logAnswer(correct) {
    var kw = '';
    var meaning = '';
    if (currentQuizWord) {
      if (currentQuizWord.keyword != null) kw = String(currentQuizWord.keyword);
      if (currentQuizWord.meaning != null) meaning = String(currentQuizWord.meaning);
    }
    var _hrefLog = window.location && window.location.href ? window.location.href : '';
    var studentId = (parseQueryKey(_hrefLog, 'student_id') || parseQueryKey(_hrefLog, 'user') || '').trim();

    var jogboPayload = {
      type: 'tokpass-jogbo-answer',
      correct: !!correct,
      tag: getTag(),
      keyword: kw,
      meaning: meaning
    };
    /** iframe 부모 또는 새 창 opener → 메인 똑패스 saveResult (별도 점수 API 없음) */
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(jogboPayload, '*');
        var hint0 = document.getElementById('jogboAppScoreLine');
        if (hint0) {
          hint0.textContent = correct
            ? '📌 똑패스 전송 · 정답 +5점 반영 대기'
            : '📌 똑패스 전송 · 감점 없음 · 응원할게요!';
          hint0.classList.remove('hidden');
        }
        return;
      }
    } catch (_pm) {}
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(jogboPayload, '*');
        var hint1 = document.getElementById('jogboAppScoreLine');
        if (hint1) {
          hint1.textContent = correct
            ? '📌 똑패스 전송 · 정답 +5점 반영 대기'
            : '📌 똑패스 전송 · 감점 없음 · 응원할게요!';
          hint1.classList.remove('hidden');
        }
        return;
      }
    } catch (_op) {}

    const cfg = window.APP_CONFIG;
    if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;
    const tag = getTag();
    var sidGuest = (studentId && String(studentId).trim()) ? String(studentId).trim() : (parseQueryKey(_hrefLog, 'student_id') || parseQueryKey(_hrefLog, 'user') || 'guest');
    var nameGuest = parseQueryKey(_hrefLog, 'student_name') || parseQueryKey(_hrefLog, 'name') || '';

    try {
      const res = await fetch(cfg.SUPABASE_URL + '/rest/v1/answer_logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': cfg.SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + cfg.SUPABASE_ANON_KEY,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          student_id: sidGuest,
          student_name: nameGuest || null,
          tag: tag,
          correct: correct,
          quiz_type: 'input',
          created_at_kst: nowKstString()
        })
      });
      if (!res.ok) throw new Error(res.statusText);
      await patchJogboScoreToStudents(correct, sidGuest, cfg);
    } catch (e) {
      console.warn('answer_logs insert failed:', e);
    }
  }

  function onQuizChoice(ev) {
    if (quizAnswered) return;
    const li = ev.currentTarget;
    const theme = li.getAttribute('data-theme');
    var correctThemes;
    var correct;
    var correctLabel;
    if (quizGradeByMeaning) {
      var okM = String(currentQuizWord.meaning || '').trim();
      correct = String(theme || '').trim() === okM;
      correctThemes = okM ? [okM] : [];
      correctLabel = okM + ' (뜻)';
    } else if (quizGradeByParticipleBlank) {
      var okKw = String(currentQuizWord.keyword || '').trim();
      correct = String(theme || '').trim().toLowerCase() === okKw.toLowerCase();
      correctThemes = okKw ? [okKw] : [];
      correctLabel = okKw;
    } else if (quizGradeByCategory && (currentQuizWord.category || quizGradeByPairing)) {
      var graded = getWordQuizAnswer(currentQuizWord);
      correctThemes = graded ? [graded] : [];
      correct = correctThemes.includes(theme);
      correctLabel = quizGradeByPairing
        ? correctThemes.join(', ')
        : correctThemes.join(', ') + ' (' + (categoryLabel || '분류') + ')';
    } else {
      correctThemes = getCorrectThemes(currentQuizWord);
      if (!correctThemes.length && !quizGradeByCategory) correctThemes = ['현재'];
      correct = correctThemes.includes(theme);
      correctLabel = correctThemes.join(', ') + ' ' + themeLabel;
    }
    quizAnswered = true;
    quizScore.total++;
    if (correct) quizScore.correct++;

    $$('#quizChoices li').forEach(el => {
      el.classList.add('disabled');
      const elTheme = el.getAttribute('data-theme');
      if (quizGradeByMeaning) {
        var okMm = correctThemes.length ? correctThemes[0] : '';
        if (String(elTheme || '').trim() === okMm && okMm) el.classList.add('correct');
      } else if (quizGradeByParticipleBlank) {
        var okKk = correctThemes.length ? correctThemes[0] : '';
        if (okKk && String(elTheme || '').trim().toLowerCase() === String(okKk).trim().toLowerCase()) el.classList.add('correct');
      } else {
        if (correctThemes.includes(elTheme)) el.classList.add('correct');
      }
      if (el === li && !correct) el.classList.add('wrong');
    });

    const fb = $('#quizFeedback');
    fb.classList.remove('hidden');
    fb.classList.add(correct ? 'correct' : 'wrong');
    var meanLine = '';
    if (currentQuizWord) {
      if (quizGradeByMeaning) {
        var ct = currentQuizWord.category ? String(currentQuizWord.category).trim() : '';
        if (categoryLabel && ct) meanLine = '\n' + categoryLabel + ': ' + ct;
      } else if (themeLabel === '격') {
        var catG = currentQuizWord.category && String(currentQuizWord.category).trim();
        var mp = correctThemes.map(function (t) { return getCaseMeaning(catG, t); });
        if (mp.length) meanLine = '\n의미: ' + mp.join(', ');
      } else if (quizGradeByParticipleBlank) {
        var exPart = parseExampleEnglish(currentQuizWord.example);
        if (exPart) meanLine = '\n예문: ' + exPart;
      } else {
        var m0 = currentQuizWord.meaning && String(currentQuizWord.meaning).trim();
        if (m0) meanLine = '\n뜻: ' + m0;
        var ex0 = currentQuizWord.example && String(currentQuizWord.example).trim();
        if (quizGradeByPairing && ex0) meanLine += '\n예문: ' + ex0;
      }
    }
    fb.textContent = correct
      ? ('✅ 정답! +5점 스코어에 반영돼요.' + meanLine)
      : ('💪 아쉽지만 감점 없어요! 다음엔 맞춰보자.\n정답: ' + correctLabel + meanLine);
    $('#quizScore').textContent = quizScore.correct + ' / ' + quizScore.total;

    logAnswer(correct);
  }

  (function bindQuizNext() {
    var qn = $('#quizNext');
    if (!qn) return;
    qn.addEventListener('click', function () {
      if (quizAnswered && quizIndex < quizWordOrder.length - 1) {
        quizIndex++;
        nextQuiz();
      } else if (quizAnswered && quizIndex >= quizWordOrder.length - 1) {
        const fb = $('#quizFeedback');
        fb.classList.remove('hidden');
        fb.classList.add('correct');
        fb.textContent = '퀴즈 끝! ' + quizScore.correct + ' / ' + quizScore.total + ' 맞음';
        $('#quizChoices').innerHTML = '';
        quizIndex++;
      }
    });
  })();

  bindQuizDimensionLiveRefresh();

  /** 데이터 로드 후: 필터 라벨·옵션. 인칭대명사(격)는 구분(1인칭 단수 등)으로 필터, 퀴즈는 격 유지 */
  function applyFilterUI() {
    if (!allWords.length) return;
    const labelEl = document.querySelector('.filter label');
    const useCategory = (categoryLabel || categoryColumnLooksLikePartOfSpeech()) &&
      allWords.some(function (w) { return w.category; });
    var opts;
    if (themeLabel === '격' && useCategory) {
      if (labelEl) labelEl.textContent = categoryLabel || '구분';
      opts = [...new Set(allWords.map(function (w) { return w.category; }).filter(Boolean))].sort();
    } else if (themeLabel === '격') {
      if (labelEl) labelEl.textContent = themeLabel;
      opts = CASE_TYPES.slice();
    } else if (isBinaryPairingDeck()) {
      if (labelEl) labelEl.textContent = '짝';
      opts = getQuizClassificationValues();
    } else if (isParticipleBlankDeck()) {
      if (labelEl) labelEl.textContent = themeLabel || '테마';
      opts = getUniqueCategories();
    } else {
      if (labelEl) labelEl.textContent = useCategory ? (categoryLabel || '분류') : themeLabel;
      if (useCategory) {
        opts = [...new Set(allWords.map(function (w) { return w.category; }).filter(Boolean))].sort();
      } else {
        opts = [...new Set(arrayFlatMap(allWords, function (w) { return getCorrectThemes(w); }))].filter(Boolean).sort();
      }
    }
    const sel = document.getElementById('themeFilter');
    if (!sel) return;
    sel.innerHTML = '<option value="">전체</option>' + opts.map(function (c) {
      return '<option value="' + String(c).replace(/"/g, '&quot;') + '">' + String(c) + '</option>';
    }).join('');
    syncQuizDimensionRow();
  }

  function hideInitStatus() {
    var s = document.getElementById('initStatus');
    if (s) s.style.display = 'none';
  }

  function getCurrentDbIdFromUrl() {
    try {
      var h = window.location && window.location.href ? window.location.href : '';
      return (parseQueryKey(h, 'db') || '').replace(/-/g, '');
    } catch (e) {
      return '';
    }
  }

  function renderJogboSwitchBar() {
    var bar = document.getElementById('jogbo-switch-bar');
    var sel = document.getElementById('jogbo-test-select-inner');
    if (!bar || !sel) return;
    var tests = window.__tokpassJogboTests;
    if (!tests || !tests.length) return;
    var curDb = getCurrentDbIdFromUrl();
    if (isConnectorPage && window.FORCE_DB_ID) {
      curDb = String(window.FORCE_DB_ID).trim().replace(/-/g, '');
    }
    var selIdx = 0;
    for (var j = 0; j < tests.length; j++) {
      var dbj = String(tests[j].db != null ? tests[j].db : '').replace(/-/g, '');
      if (dbj === curDb) {
        selIdx = j;
        break;
      }
    }
    sel.innerHTML = tests.map(function (t, i) {
      var db = String(t.db != null ? t.db : '').replace(/-/g, '');
      var name = String(t.name || (db || '테스트')).replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return '<option value="' + db.replace(/"/g, '&quot;') + '"' + (i === selIdx ? ' selected' : '') + '>' + name + '</option>';
    }).join('');
    bar.classList.remove('hidden');
  }

  window.addEventListener('message', function (ev) {
    var data = ev.data;
    if (!data || data.type !== 'tokpass-jogbo-config' || !Array.isArray(data.tests)) return;
    window.__tokpassJogboTests = data.tests;
    renderJogboSwitchBar();
  });

  /** 메인 앱(부모·opener)에서 점수 반영 후 보내는 확인 — 해설 아래 고정 줄 + 피드백에도 덧붙임 */
  window.addEventListener('message', function (ev) {
    var data = ev.data;
    if (!data || data.type !== 'tokpass-jogbo-score-ack') return;
    var pts = Number(data.points) || 0;
    var ns = data.newScore != null ? data.newScore : '';
    var line;
    if (data.ok && data.pending) {
      line = '📌 똑패스 점수 반영 중…' + (ns !== '' ? ' (현재 ' + ns + '점)' : '');
    } else if (data.ok) {
      if (pts > 0) {
        line = '📌 정답 +5점 반영!' + (ns !== '' ? ' (누적 ' + ns + '점)' : '');
      } else {
        line = '📌 감점 없음 · 응원해요!' + (ns !== '' ? ' (누적 ' + ns + '점)' : '');
      }
    } else {
      line = '⚠ 앱 점수 반영 실패' + (data.msg ? ': ' + data.msg : '');
    }
    var hint = document.getElementById('jogboAppScoreLine');
    if (hint) {
      hint.textContent = line;
      hint.classList.remove('hidden');
    }
    var fb = document.getElementById('quizFeedback');
    if (fb && !fb.classList.contains('hidden')) {
      fb.textContent = (fb.textContent || '') + '\n' + line;
    }
  });

  (function bindJogboChrome() {
    var jtg = document.getElementById('jogbo-test-go');
    if (jtg) jtg.addEventListener('click', function () {
      var sel = document.getElementById('jogbo-test-select-inner');
      if (!sel) return;
      var db = (sel.value != null ? String(sel.value) : '').trim();
      if (window.parent && window.parent !== window) {
        try {
          window.parent.postMessage({ type: 'tokpass-jogbo-nav', db: db }, '*');
        } catch (e) {}
        return;
      }
      try {
        var u = new URL(window.location.href);
        if (db) u.searchParams.set('db', db.replace(/-/g, ''));
        else u.searchParams.delete('db');
        window.location.assign(u.toString());
      } catch (e2) {
        window.location.reload();
      }
    });
    var exitBtn = document.getElementById('btn-exit-quiz');
    if (exitBtn) exitBtn.addEventListener('click', function () {
      if (window.parent && window.parent !== window) {
        try {
          window.parent.postMessage({ type: 'tokpass-jogbo-close' }, '*');
        } catch (e) {}
        return;
      }
      if (window.opener) {
        try { window.opener.focus(); } catch (e) {}
      }
      window.close();
    });
  })();

  // ——— 초기화 ———
  var _bootStallTimer = setTimeout(function () {
    hideInitStatus();
    var errEl = document.getElementById('loadError');
    if (errEl) {
      errEl.textContent = '데이터 로드가 지연되고 있습니다. 네트워크 확인 후 새로고침해 주세요.';
      errEl.style.display = 'block';
    }
    var s = document.getElementById('initStatus');
    if (s) {
      s.textContent = '로드 지연 — 새로고침해 주세요.';
      s.style.color = '#c00';
      s.style.display = 'block';
    }
  }, 35000);

  loadData().then(() => {
    clearTimeout(_bootStallTimer);
    try {
      applyFilterUI();
      showView(parseHash());
      hideInitStatus();
    } catch (e) {
      console.error('showView error', e);
      hideInitStatus();
      var errEl = document.getElementById('loadError');
      if (errEl) { errEl.textContent = '화면 표시 오류: ' + (e.message || e); errEl.style.display = 'block'; }
      var s = document.getElementById('initStatus');
      if (s) { s.textContent = '화면 오류: ' + (e.message || e); s.style.color = '#c00'; s.style.display = 'block'; }
    }
  }).catch(function (e) {
    clearTimeout(_bootStallTimer);
    console.error('loadData error', e);
    hideInitStatus();
    var errEl = document.getElementById('loadError');
    if (errEl) { errEl.textContent = '로드 오류: ' + (e.message || e); errEl.style.display = 'block'; }
    var s = document.getElementById('initStatus');
    if (s) { s.textContent = '로드 오류: ' + (e.message || e); s.style.color = '#c00'; s.style.display = 'block'; }
  });
})();
