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

  /** 정답/오답 효과음 — iframe이면 부모 WebView에만 재생, 단독(Vercel)이면 자체 oscillator */
  var _jogboAudioCtx = null;
  var _jogboMasterGain = null;
  var JOGBO_CORRECT_PEAK = 0.38;
  var JOGBO_WRONG_PEAK = 0.42;
  var JOGBO_PRONUNCIATION_GAIN = 6.5;
  var JOGBO_MASTER_GAIN = 1.2;

  function jogboSharedAudioContext() {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!_jogboAudioCtx || _jogboAudioCtx.state === 'closed') {
      _jogboAudioCtx = new Ctx();
      _jogboMasterGain = null;
    }
    return _jogboAudioCtx;
  }

  function jogboQuizSfxContext() {
    return jogboSharedAudioContext();
  }

  function jogboTtsAudioContext() {
    return jogboSharedAudioContext();
  }

  function jogboMasterGainNode(ctx) {
    if (!_jogboMasterGain || _jogboMasterGain.context !== ctx) {
      _jogboMasterGain = ctx.createGain();
      _jogboMasterGain.gain.setValueAtTime(JOGBO_MASTER_GAIN, ctx.currentTime);
      _jogboMasterGain.connect(ctx.destination);
    }
    return _jogboMasterGain;
  }

  function jogboEnsureAudioRunning(ctx) {
    if (!ctx || ctx.state === 'closed') return Promise.resolve(false);
    if (ctx.state === 'running') return Promise.resolve(true);
    if (ctx.state === 'suspended') {
      return ctx.resume().then(function () { return ctx.state === 'running'; }).catch(function () { return false; });
    }
    return Promise.resolve(false);
  }

  function jogboResumeAudioCtx(ctx, fn) {
    if (!ctx) return;
    jogboEnsureAudioRunning(ctx).then(function (ok) {
      if (ok) fn();
    });
  }

  function jogboPlayAudioUrlWithGain(url, gainVal, speakGen) {
    return new Promise(function (resolve, reject) {
      if (speakGen != null && speakGen !== _jogboSpeakGen) {
        reject(new Error('cancelled'));
        return;
      }
      var ctx = jogboTtsAudioContext();
      if (!ctx) {
        var plain = new Audio(url);
        plain.volume = 1;
        _lastGoogleAudio = plain;
        plain.addEventListener('ended', function () {
          if (_lastGoogleAudio === plain) _lastGoogleAudio = null;
          resolve(true);
        }, { once: true });
        plain.addEventListener('error', function () { reject(new Error('audio failed')); }, { once: true });
        plain.play().catch(function () { reject(new Error('audio play failed')); });
        return;
      }
      var dest = jogboMasterGainNode(ctx);
      var peakGain = gainVal;

      function playBuffer(buf) {
        if (speakGen != null && speakGen !== _jogboSpeakGen) {
          reject(new Error('cancelled'));
          return;
        }
        var src = ctx.createBufferSource();
        var g = ctx.createGain();
        g.gain.setValueAtTime(peakGain, ctx.currentTime);
        src.buffer = buf;
        src.connect(g);
        g.connect(dest);
        _jogboActiveStop = function () {
          try { src.stop(0); src.disconnect(); g.disconnect(); } catch (_d) {}
        };
        src.onended = function () {
          if (_jogboActiveStop) _jogboActiveStop = null;
          try { src.disconnect(); g.disconnect(); } catch (_d) {}
          if (speakGen != null && speakGen !== _jogboSpeakGen) {
            reject(new Error('cancelled'));
            return;
          }
          resolve(true);
        };
        src.start(0);
      }

      function playViaCaptureStream() {
        var audio = new Audio(url);
        audio.volume = 1;
        audio.preload = 'auto';
        _lastGoogleAudio = audio;
        audio.addEventListener('error', function () { reject(new Error('audio failed')); }, { once: true });
        audio.play()
          .then(function () {
            if (speakGen != null && speakGen !== _jogboSpeakGen) {
              reject(new Error('cancelled'));
              return;
            }
            var capture = audio.captureStream || audio.mozCaptureStream;
            if (!capture) throw new Error('no captureStream');
            var stream = capture.call(audio);
            var msrc = ctx.createMediaStreamSource(stream);
            var g = ctx.createGain();
            g.gain.setValueAtTime(peakGain, ctx.currentTime);
            msrc.connect(g);
            g.connect(dest);
            _jogboActiveStop = function () {
              try { audio.pause(); msrc.disconnect(); g.disconnect(); } catch (_dc) {}
            };
            audio.addEventListener('ended', function () {
              if (_jogboActiveStop) _jogboActiveStop = null;
              if (_lastGoogleAudio === audio) _lastGoogleAudio = null;
              try { msrc.disconnect(); g.disconnect(); } catch (_dc) {}
              if (speakGen != null && speakGen !== _jogboSpeakGen) {
                reject(new Error('cancelled'));
                return;
              }
              resolve(true);
            }, { once: true });
          })
          .catch(function () { playViaMediaElement(); });
      }

      function playViaMediaElement() {
        var audio = new Audio(url);
        audio.volume = 1;
        _lastGoogleAudio = audio;
        audio.addEventListener('error', function () { reject(new Error('audio failed')); }, { once: true });
        try {
          var msrc = ctx.createMediaElementSource(audio);
          var g = ctx.createGain();
          g.gain.setValueAtTime(peakGain, ctx.currentTime);
          msrc.connect(g);
          g.connect(dest);
          _jogboActiveStop = function () {
            try { audio.pause(); msrc.disconnect(); g.disconnect(); } catch (_dm) {}
          };
          audio.addEventListener('ended', function () {
            if (_jogboActiveStop) _jogboActiveStop = null;
            if (_lastGoogleAudio === audio) _lastGoogleAudio = null;
            try { msrc.disconnect(); g.disconnect(); } catch (_dm) {}
            if (speakGen != null && speakGen !== _jogboSpeakGen) {
              reject(new Error('cancelled'));
              return;
            }
            resolve(true);
          }, { once: true });
          audio.play().catch(function (e) { reject(e); });
        } catch (_me) {
          audio.addEventListener('ended', function () {
            if (_lastGoogleAudio === audio) _lastGoogleAudio = null;
            resolve(true);
          }, { once: true });
          audio.play().catch(function () { reject(new Error('audio play failed')); });
        }
      }

      jogboResumeAudioCtx(ctx, function () {
        fetch(url, { mode: 'cors', credentials: 'omit', cache: 'default' })
          .then(function (res) {
            if (!res.ok) throw new Error('fetch ' + res.status);
            return res.arrayBuffer();
          })
          .then(function (ab) { return ctx.decodeAudioData(ab.slice(0)); })
          .then(playBuffer)
          .catch(function () { playViaCaptureStream(); });
      });
    });
  }

  var _jogboSfxLockUntil = 0;

  function isJogboEmbeddedInTokpass() {
    try {
      return !!(window.parent && window.parent !== window);
    } catch (_e) {
      return true;
    }
  }

  var _jogboQuizBeepUrls = null;
  var _jogboQuizSfxAudio = null;

  function jogboBuildBeepWavObjectUrl(freqHz, durationMs) {
    var sampleRate = 22050;
    var numSamples = Math.max(1, Math.floor(sampleRate * durationMs / 1000));
    var dataSize = numSamples * 2;
    var buffer = new ArrayBuffer(44 + dataSize);
    var view = new DataView(buffer);
    function writeStr(off, s) {
      for (var i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
    }
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);
    var attack = Math.floor(sampleRate * 0.018);
    var peak = 0.9;
    for (var si = 0; si < numSamples; si++) {
      var env = Math.min(1, si / Math.max(1, attack)) * Math.max(0, 1 - si / numSamples);
      var sample = Math.sin(2 * Math.PI * freqHz * (si / sampleRate)) * peak * env;
      var s16 = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
      view.setInt16(44 + si * 2, s16, true);
    }
    return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  }

  function jogboGetQuizBeepUrl(isCorrect) {
    if (!_jogboQuizBeepUrls) _jogboQuizBeepUrls = {};
    var key = isCorrect ? 'correct' : 'wrong';
    if (!_jogboQuizBeepUrls[key]) {
      _jogboQuizBeepUrls[key] = jogboBuildBeepWavObjectUrl(isCorrect ? 784 : 196, isCorrect ? 150 : 110);
    }
    return _jogboQuizBeepUrls[key];
  }

  function playQuizFeedbackSoundOscillator(isCorrect) {
    try {
      var ctx = jogboQuizSfxContext();
      if (!ctx) return;
      jogboEnsureAudioRunning(ctx).then(function (ok) {
        if (!ok) return;
        try {
          var osc = ctx.createOscillator();
          var g = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = isCorrect ? 784 : 196;
          var peak = isCorrect ? JOGBO_CORRECT_PEAK : JOGBO_WRONG_PEAK;
          var t0 = ctx.currentTime;
          var tEnd = isCorrect ? 0.15 : 0.11;
          g.gain.setValueAtTime(0.001, t0);
          g.gain.linearRampToValueAtTime(peak, t0 + 0.018);
          g.gain.linearRampToValueAtTime(0.001, t0 + tEnd);
          osc.connect(g);
          g.connect(jogboMasterGainNode(ctx));
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + (isCorrect ? 0.15 : 0.11));
          osc.onended = function () {
            try { osc.disconnect(); g.disconnect(); } catch (_dw) {}
          };
        } catch (_r) {}
      });
    } catch (_s) {}
  }

  function playQuizFeedbackSound(isCorrect) {
    var now = Date.now();
    if (now < _jogboSfxLockUntil) return;
    _jogboSfxLockUntil = now + 320;
    if (isJogboEmbeddedInTokpass()) {
      try {
        window.parent.postMessage({ type: 'tokpass-jogbo-sfx', correct: !!isCorrect }, '*');
      } catch (_pm) {}
      return;
    }
    try {
      var vol = isCorrect ? JOGBO_CORRECT_PEAK : JOGBO_WRONG_PEAK;
      try {
        if (_jogboQuizSfxAudio) {
          _jogboQuizSfxAudio.pause();
          try { _jogboQuizSfxAudio.currentTime = 0; } catch (_rt) {}
        }
      } catch (_pa) {}
      var audio = new Audio(jogboGetQuizBeepUrl(isCorrect));
      audio.volume = Math.min(1, vol);
      try { audio.setAttribute('playsinline', ''); } catch (_pi) {}
      _jogboQuizSfxAudio = audio;
      var played = audio.play();
      if (played && typeof played.catch === 'function') {
        played.catch(function () { playQuizFeedbackSoundOscillator(isCorrect); });
      }
    } catch (_s) {
      playQuizFeedbackSoundOscillator(isCorrect);
    }
  }

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
  /** 부모 앱(?set_title=) 또는 학습인증용 표시명 */
  var _setTitleFromUrl = '';
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

  /** Recall 패턴 청크 세션 (CHUNK_SIZE=10) */
  var CHUNK_SIZE = 10;
  var sessionId = null;
  var sessionCompletionSaved = false;
  var sessionActive = false;
  var sessionQuestionLimit = null;
  var defaultQuestionLimit = null;
  var selectedQuestionCount = '20';
  var fullDeck = [];
  var chunkIndex = 0;
  var activeDeck = [];
  var activeIdx = 0;
  var chunkRetryRound = false;
  var retryBannerCount = 0;
  var roundWrongById = {};
  var sessionWrongIds = {};
  var attemptByQuestionId = {};
  /** 세션 통계용: question_id → 첫 시도(비재출제 라운드) 정답 여부 */
  var firstAttemptByQuestionId = {};
  var staticDeckKey = '';
  var queuePolicy = 'shuffle';
  var completingSessionWrongIds = {};
  var cumulativeWrongRows = [];
  var wrongManageSelectedIds = {};
  var quizModalEnterHandler = null;

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
      if (!sessionActive || !activeDeck.length) return;
      if (activeIdx < 0 || activeIdx >= activeDeck.length) return;
      if (quizAnswered) return;
      presentQuestion();
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
  var _jogboSpeakGen = 0;
  var _jogboSpeakScheduleTimer = null;
  var _jogboActiveStop = null;

  function jogboStopActiveAudio() {
    if (_jogboActiveStop) {
      try { _jogboActiveStop(); } catch (_st) {}
      _jogboActiveStop = null;
    }
    try {
      if (_lastGoogleAudio) {
        _lastGoogleAudio.pause();
        _lastGoogleAudio = null;
      }
    } catch (_la) {}
  }

  function cancelJogboSpeakLocal() {
    _jogboSpeakGen++;
    if (_jogboSpeakScheduleTimer) {
      clearTimeout(_jogboSpeakScheduleTimer);
      _jogboSpeakScheduleTimer = null;
    }
    if (_speakTimer) {
      clearTimeout(_speakTimer);
      _speakTimer = null;
    }
    jogboStopActiveAudio();
    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    } catch (_sc) {}
  }

  function cancelJogboSpeak() {
    cancelJogboSpeakLocal();
    if (_tokpassNativeTts) {
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: 'tokpass-speak-cancel' }, '*');
        }
      } catch (_pm) {}
    }
  }

  function isAndroidUA() {
    return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');
  }

  function isIosUA() {
    return typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
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

  function jogboGoogleTtsUrls(text) {
    var q = encodeURIComponent(String(text || '').trim().slice(0, 180));
    return [
      'https://translate.google.com/translate_tts?ie=UTF-8&tl=en-US&client=tw-ob&q=' + q,
      'https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&q=' + q,
      'https://translate.google.com/translate_tts?ie=UTF-8&tl=en-US&client=gtx&q=' + q,
      'https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=gtx&q=' + q
    ];
  }

  var _jogboGoogleBufCache = {};

  function prefetchGoogleTts(text) {
    var t = String(text || '').trim().slice(0, 180);
    if (!t || _jogboGoogleBufCache[t]) return;
    var ctx = jogboTtsAudioContext();
    if (!ctx) return;
    _jogboGoogleBufCache[t] = { pending: true };
    fetch(jogboGoogleTtsUrls(t)[0], { mode: 'cors', credentials: 'omit', cache: 'force-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('fetch ' + res.status);
        return res.arrayBuffer();
      })
      .then(function (ab) { return ctx.decodeAudioData(ab.slice(0)); })
      .then(function (buf) {
        _jogboGoogleBufCache[t] = { buf: buf };
      })
      .catch(function () {
        delete _jogboGoogleBufCache[t];
      });
  }

  function playGoogleTtsCached(text, speakGen) {
    var t = String(text || '').trim().slice(0, 180);
    if (!t) return Promise.resolve(false);
    if (speakGen != null && speakGen !== _jogboSpeakGen) return Promise.resolve(false);
    var entry = _jogboGoogleBufCache[t];
    if (!entry || !entry.buf) return Promise.resolve(false);
    return new Promise(function (resolve) {
      var ctx = jogboTtsAudioContext();
      if (!ctx) {
        resolve(false);
        return;
      }
      jogboEnsureAudioRunning(ctx).then(function (ok) {
        if (!ok || (speakGen != null && speakGen !== _jogboSpeakGen)) {
          resolve(false);
          return;
        }
        try {
          var src = ctx.createBufferSource();
          var g = ctx.createGain();
          g.gain.setValueAtTime(JOGBO_PRONUNCIATION_GAIN, ctx.currentTime);
          src.buffer = entry.buf;
          src.connect(g);
          g.connect(jogboMasterGainNode(ctx));
          _jogboActiveStop = function () {
            try { src.stop(0); src.disconnect(); g.disconnect(); } catch (_st) {}
          };
          src.onended = function () {
            if (_jogboActiveStop) _jogboActiveStop = null;
            try { src.disconnect(); g.disconnect(); } catch (_d) {}
            resolve(true);
          };
          src.start(0);
        } catch (_e) {
          resolve(false);
        }
      });
    });
  }

  function speakViaGoogleAudio(text, speakGen) {
    return new Promise(function (resolve) {
      try {
        var t = String(text).trim().slice(0, 180);
        if (!t) {
          resolve(false);
          return;
        }
        if (speakGen != null && speakGen !== _jogboSpeakGen) {
          resolve(false);
          return;
        }
        playGoogleTtsCached(t, speakGen).then(function (played) {
          if (played) {
            resolve(true);
            return;
          }
          var urls = jogboGoogleTtsUrls(t);
          var i = 0;
          function tryNext() {
            if (speakGen != null && speakGen !== _jogboSpeakGen) {
              resolve(false);
              return;
            }
            if (i >= urls.length) {
              resolve(false);
              return;
            }
            jogboPlayAudioUrlWithGain(urls[i++], JOGBO_PRONUNCIATION_GAIN, speakGen)
              .then(function (ok) {
                resolve(!!ok);
              })
              .catch(function () {
                tryNext();
              });
          }
          tryNext();
        });
      } catch (e) {
        resolve(false);
      }
    });
  }

  function pickBestEnglishVoice(voices) {
    if (!voices || !voices.length) return null;
    var prefs = [
      'Google US English', 'Samantha', 'Aaron', 'Karen', 'Daniel',
      'Microsoft Zira', 'Microsoft Jenny', 'Microsoft David', 'English United States'
    ];
    var pi, vi;
    for (pi = 0; pi < prefs.length; pi++) {
      for (vi = 0; vi < voices.length; vi++) {
        var v = voices[vi];
        if (!v || !v.lang || v.lang.toLowerCase().indexOf('en') !== 0) continue;
        if ((v.name || '').toLowerCase().indexOf(prefs[pi].toLowerCase()) >= 0) return v;
      }
    }
    for (vi = 0; vi < voices.length; vi++) {
      if (voices[vi].lang && voices[vi].lang.toLowerCase().indexOf('en-us') === 0) return voices[vi];
    }
    for (vi = 0; vi < voices.length; vi++) {
      if (voices[vi].lang && voices[vi].lang.toLowerCase().indexOf('en') === 0) return voices[vi];
    }
    return voices[0] || null;
  }

  function buildUtterance(raw, withVoice) {
    var utterance = new SpeechSynthesisUtterance(raw);
    utterance.lang = 'en-US';
    utterance.volume = 1;
    utterance.pitch = 1;
    utterance.rate = 0.9;
    if (withVoice && window.speechSynthesis) {
      var chosen = pickBestEnglishVoice(window.speechSynthesis.getVoices());
      if (chosen) utterance.voice = chosen;
    }
    return utterance;
  }

  function speakKeywordWeb(raw, speakGen) {
    try {
      if (typeof window === 'undefined' || typeof window.speechSynthesis === 'undefined') return;
      if (speakGen != null && speakGen !== _jogboSpeakGen) return;

      prepareSpeechSynthesis();

      function runSpeak(useVoice) {
        if (speakGen != null && speakGen !== _jogboSpeakGen) return;
        try {
          window.speechSynthesis.cancel();
          var utterance = buildUtterance(raw, useVoice);
          var retried = false;
          utterance.onerror = function () {
            if (retried) return;
            retried = true;
            window.setTimeout(function () {
              if (speakGen != null && speakGen !== _jogboSpeakGen) return;
              try {
                var u2 = buildUtterance(raw, false);
                window.speechSynthesis.speak(u2);
              } catch (e) {}
            }, isAndroidUA() ? 120 : 60);
          };
          window.speechSynthesis.speak(utterance);
        } catch (e) {}
      }

      var voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        runSpeak(true);
        return;
      }

      function onVoices() {
        window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
        runSpeak(true);
      }
      window.speechSynthesis.addEventListener('voiceschanged', onVoices);
      window.setTimeout(function () {
        window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
        if (speakGen != null && speakGen !== _jogboSpeakGen) return;
        if (window.speechSynthesis.getVoices().length > 0) runSpeak(true);
        else runSpeak(false);
      }, isAndroidUA() ? 280 : isIosUA() ? 40 : 120);
    } catch (e) {}
  }

  function speakKeyword(text, speakGen) {
    if (text == null || text === '') return;
    var clean = String(text).trim();
    if (!clean || clean === '—') return;
    if (speakGen == null) {
      cancelJogboSpeak();
      speakGen = _jogboSpeakGen;
    }
    if (speakGen !== _jogboSpeakGen) return;
    /** 똑패스 iframe(tokpass_native_tts=1): 부모 TTS 브릿지 */
    if (_tokpassNativeTts) {
      try {
        if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
          window.parent.postMessage({ type: 'tokpass-speak-en', text: clean, seq: speakGen }, '*');
        }
      } catch (e) {}
      return;
    }
    jogboStopActiveAudio();
    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    } catch (e) {}
    prepareSpeechSynthesis();

    if (isIosUA()) {
      speakKeywordWeb(clean, speakGen);
      return;
    }

    void speakViaGoogleAudio(clean, speakGen).then(function (ok) {
      if (speakGen !== _jogboSpeakGen) return;
      if (!ok) speakKeywordWeb(clean, speakGen);
    });
  }

  function scheduleSpeakKeyword(text) {
    if (_jogboSpeakScheduleTimer) {
      clearTimeout(_jogboSpeakScheduleTimer);
      _jogboSpeakScheduleTimer = null;
    }
    _jogboSpeakScheduleTimer = setTimeout(function () {
      _jogboSpeakScheduleTimer = null;
      cancelJogboSpeak();
      speakKeyword(text, _jogboSpeakGen);
    }, 420);
  }

  /** 부모(똑패스)가 Google TTS 실패 시 iframe에서 재생 요청 */
  window.addEventListener('message', function (ev) {
    try {
      if (!window.parent || ev.source !== window.parent) return;
      var p = ev.data;
      if (!p) return;
      if (p.type === 'tokpass-speak-cancel') {
        cancelJogboSpeak();
        return;
      }
      if (p.type !== 'tokpass-iframe-tts') return;
      var t = String(p.text || '').trim();
      if (!t || t === '—') return;
      cancelJogboSpeak();
      var gen = _jogboSpeakGen;
      function ack(ok) {
        try {
          window.parent.postMessage({ type: 'tokpass-speak-ack', ok: !!ok }, '*');
        } catch (e) {}
      }
      try {
        var skipGoogle = !!(p.skipGoogle || p.tokpassSkipGoogle);
        if (skipGoogle || isIosUA()) {
          speakKeywordWeb(t, gen);
          ack(true);
        } else {
          void speakViaGoogleAudio(t, gen).then(function (ok) {
            if (gen !== _jogboSpeakGen) {
              ack(false);
              return;
            }
            if (!ok) speakKeywordWeb(t, gen);
            ack(true);
          });
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
      resetSessionUiForSetup();
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
          themes: (w.themes && w.themes.slice()) || (w.theme ? [w.theme] : []),
          question_id: w.question_id || '',
          notion_page_id: w.notion_page_id || ''
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
      allWords = ensureQuestionIds(payload.words, staticDeckKey || _dbIdFromUrl || 'deck');
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
      else if (view === 'quiz' && !sessionActive) resetSessionUiForSetup();
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
      applyWordsPayloadToApp(partial, { refreshUi: !sessionActive, resetCardIndex: false });
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
      _setTitleFromUrl = setTitleQ ? String(setTitleQ).trim() : '';
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
        staticDeckKey = dbId;
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
          staticDeckKey = 'connector';
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
          staticDeckKey = 'pronoun';
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
        staticDeckKey = 'words.json';
        // 없으면 기존 words.json
        const res = await fetchWithTimeout('data/words.json?t=' + Date.now(), { cache: 'no-store' }, 45000);
        data = await res.json();
      }

      setTitle = data.setTitle || '토익 시제부사';
      themeLabel = (data.themeLabel && data.themeLabel.trim()) || (isConnectorPage ? '카테고리' : '시제');
      categoryLabel = (data.categoryLabel && data.categoryLabel.trim()) || '';
      allWords = data.words || [];
      allWords = ensureQuestionIds(allWords, staticDeckKey || dbId || 'deck');
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

  var BASIC_WORDS_DB_ID = '31a6e4c35a0e80dfad37f2231f41438d';

  /** Notion DB 제목이 "학습용데이터" 등일 때 학습인증·오답 tag용 표시명 */
  function resolveCertTagTitle() {
    var urlT = _setTitleFromUrl && String(_setTitleFromUrl).trim();
    if (urlT && urlT !== '학습용데이터') return urlT;
    var st = setTitle && String(setTitle).trim();
    if (st && st !== '학습용데이터') return st;
    var dbKey = (_dbIdFromUrl || staticDeckKey || '').replace(/-/g, '');
    if (!dbKey || dbKey === 'words.json') return '시제·부사';
    if (dbKey === PRONOUN_DB_ID || staticDeckKey === 'pronoun') return '인칭대명사표';
    if (dbKey === CONNECTOR_DB_ID || staticDeckKey === 'connector') return '연결사(접속부사)';
    if (dbKey === BASIC_WORDS_DB_ID) return '기본어휘품사구별';
    if (st) return st;
    return (window.APP_CONFIG && window.APP_CONFIG.TEST_TITLE) || '토익 시제부사';
  }

  /** answer_logs.tag / 모니터용 */
  function getTag() {
    if (isConnectorPage) return resolveCertTagTitle() || '연결사(접속부사)';
    return resolveCertTagTitle();
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
      return String(word.theme).trim().split(/[,，/·]/).map(function (t) { return t.trim(); }).filter(Boolean);
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
    if (!primary) return [];
    var pool = [];
    var seen = {};
    [primary].concat(allCats || []).forEach(function (c) {
      if (!c || seen[c]) return;
      seen[c] = true;
      pool.push(c);
    });
    if (!pool.length) return [];
    var choices = [primary];
    shuffle(pool.filter(function (c) { return c !== primary; })).forEach(function (c) {
      if (choices.length >= count) return;
      choices.push(c);
    });
    if (choices.length < count && themeLabel === '격') {
      shuffle(CASE_TYPES.slice()).forEach(function (c) {
        if (choices.length >= count) return;
        if (choices.indexOf(c) === -1) choices.push(c);
      });
    }
    return shuffle(choices.slice(0, Math.min(count, choices.length)));
  }

  /** 격 퀴즈: 같은 영어형(he/she/it 등)에 여러 격 정답이 있으면 모두 인정 */
  function getAcceptableQuizThemes(word) {
    var themes = getCorrectThemes(word);
    if (themeLabel !== '격' || !word) return themes;
    var kw = String(word.keyword || '').trim().toLowerCase();
    if (!kw) return themes;
    var cat = word.category && String(word.category).trim();
    var equiv = themes.slice();
    allWords.forEach(function (w) {
      if (!w || String(w.keyword || '').trim().toLowerCase() !== kw) return;
      if (cat && w.category && String(w.category).trim() !== cat) return;
      getCorrectThemes(w).forEach(function (t) {
        if (t && equiv.indexOf(t) === -1) equiv.push(t);
      });
    });
    return equiv;
  }

  function staticQuestionId(deckKey, word) {
    var dk = String(deckKey || 'deck').trim();
    var kw = word && word.keyword != null ? String(word.keyword).trim() : '';
    var cat = word && word.category != null ? String(word.category).trim() : '';
    var th = word && word.theme != null ? String(word.theme).trim() : '';
    if (word && word.themes && word.themes.length) th = String(word.themes[0]).trim();
    return 'static:' + dk + ':' + kw + ':' + cat + ':' + th;
  }

  function ensureQuestionIds(words, deckKey) {
    if (!words || !words.length) return [];
    return words.map(function (w) {
      if (!w) return w;
      if (w.question_id && String(w.question_id).trim()) return w;
      var copy = Object.assign({}, w);
      copy.question_id = staticQuestionId(deckKey, w);
      return copy;
    });
  }

  function newSessionId() {
    try {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) {}
    return 'sess-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);
  }

  function wordKeyForSession(word) {
    if (!word) return '';
    if (word.question_id && String(word.question_id).trim()) return String(word.question_id).trim();
    return staticQuestionId(staticDeckKey || getCurrentDbIdFromUrl() || 'deck', word);
  }

  function getDeckKindName() {
    if (themeLabel === '격') return 'case';
    if (isPrepConjAdvStyleDeck()) return 'prepConjAdv';
    if (isBinaryPairingDeck()) return 'pairing';
    if (isParticipleBlankDeck()) return 'participle';
    if (isCategoryDrivenDeck()) return 'category';
    return 'theme';
  }

  function buildMlFeatures(attemptInChunk) {
    return {
      app: 'jogbo',
      db_id: getCurrentDbIdFromUrl() || staticDeckKey || '',
      deck_kind: getDeckKindName(),
      chunk_index: chunkIndex,
      chunk_size: CHUNK_SIZE,
      attempt_in_chunk: attemptInChunk,
      is_chunk_retry_round: !!chunkRetryRound,
      quiz_dimension: isPrepConjAdvStyleDeck() ? getQuizDimension() : 'theme',
      session_question_limit: sessionQuestionLimit == null ? 'all' : sessionQuestionLimit,
      queue_policy: queuePolicy || 'shuffle'
    };
  }

  function bumpAttempt(questionId) {
    var qid = questionId || '';
    var n = (attemptByQuestionId[qid] || 0) + 1;
    attemptByQuestionId[qid] = n;
    return n;
  }

  function chunkBoundsLabel() {
    var total = fullDeck.length;
    if (total <= 0) return '';
    var startAbs = chunkIndex * CHUNK_SIZE + 1;
    var chunkEnd = Math.min((chunkIndex + 1) * CHUNK_SIZE, total);
    return startAbs + '-' + chunkEnd + ' / ' + total;
  }

  function getEligibleQuizPool() {
    var list = allWords.slice();
    if (themeLabel !== '격' && isBinaryPairingDeck()) {
      var withPair = list.filter(function (w) { return getWordQuizAnswer(w); });
      if (withPair.length >= 1) list = withPair;
    } else if (isParticipleBlankDeck()) {
      var pbList = list.filter(canParticipleBlankQuiz);
      if (pbList.length >= 1) list = pbList;
    } else if (themeLabel !== '격' && isCategoryDrivenDeck()) {
      var withCat = list.filter(function (w) { return w.category && String(w.category).trim(); });
      if (withCat.length >= 1) list = withCat;
    }
    return list;
  }

  function resolveSessionLimit(raw, poolLen) {
    if (raw === 'all' || raw == null || raw === '') return poolLen;
    var n = parseInt(String(raw), 10);
    if (!Number.isFinite(n) || n <= 0) return poolLen;
    return Math.min(n, poolLen);
  }

  function getStudentContext() {
    var href = (window.location && window.location.href) ? window.location.href : '';
    return {
      id: (parseQueryKey(href, 'student_id') || parseQueryKey(href, 'user') || '').trim(),
      name: (parseQueryKey(href, 'student_name') || parseQueryKey(href, 'name') || '').trim()
    };
  }

  async function fetchJogboQuestionHistory(studentId, tag, questionIds) {
    var cfg = window.APP_CONFIG;
    if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return {};
    if (!studentId || !questionIds || !questionIds.length) return {};
    try {
      var res = await fetch(cfg.SUPABASE_URL + '/rest/v1/rpc/get_jogbo_question_history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': cfg.SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + cfg.SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          p_student_id: String(studentId),
          p_tag: String(tag || ''),
          p_question_ids: questionIds
        })
      });
      if (!res.ok) {
        var errText = await res.text().catch(function () { return ''; });
        console.warn('get_jogbo_question_history failed:', res.status, errText);
        return {};
      }
      var rows = await res.json();
      var map = {};
      if (Array.isArray(rows)) {
        rows.forEach(function (r) {
          if (r && r.question_id) map[String(r.question_id)] = r.last_answered_at || '';
        });
      }
      return map;
    } catch (e) {
      console.warn('get_jogbo_question_history failed:', e);
      return {};
    }
  }

  async function buildOrderedDeckFromPool(pool, limit) {
    var student = getStudentContext();
    var tag = getTag();
    var qids = pool.map(function (w) { return wordKeyForSession(w); }).filter(Boolean);
    if (!student.id || !qids.length) {
      queuePolicy = 'shuffle';
      return shuffle(pool).slice(0, limit);
    }
    var historyMap = await fetchJogboQuestionHistory(student.id, tag, qids);
    var unseen = [];
    var seen = [];
    pool.forEach(function (w) {
      var qid = wordKeyForSession(w);
      var lastAt = historyMap[qid];
      if (lastAt === undefined || lastAt === null || lastAt === '') {
        unseen.push(w);
      } else {
        seen.push({ word: w, lastAt: String(lastAt) });
      }
    });
    unseen = shuffle(unseen);
    seen.sort(function (a, b) {
      if (a.lastAt < b.lastAt) return -1;
      if (a.lastAt > b.lastAt) return 1;
      return 0;
    });
    var ordered = unseen.concat(seen.map(function (x) { return x.word; }));
    queuePolicy = unseen.length > 0 ? 'unseen_first' : 'review_oldest';
    return ordered.slice(0, limit);
  }

  function getFirstAttemptSessionStats() {
    var keys = Object.keys(firstAttemptByQuestionId);
    var correctCount = 0;
    keys.forEach(function (k) {
      if (firstAttemptByQuestionId[k]) correctCount++;
    });
    return {
      question_count: keys.length,
      correct_count: correctCount
    };
  }

  function buildSessionCompletionRow(isFullComplete) {
    var student = getStudentContext();
    if (!student.id || !sessionId) return null;
    var stats = getFirstAttemptSessionStats();
    if (stats.question_count <= 0) return null;
    return {
      user_id: String(student.id),
      tag: getTag(),
      session_id: sessionId,
      question_count: stats.question_count,
      correct_count: stats.correct_count,
      is_full_complete: isFullComplete !== false,
      created_at_kst: nowKstString()
    };
  }

  function notifyParentSessionEnd(row) {
    if (!row) return;
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'tokpass-jogbo-session-end', row: row }, '*');
      }
    } catch (_pm) {}
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: 'tokpass-jogbo-session-end', row: row }, '*');
      }
    } catch (_op) {}
  }

  function recordSessionCompletion(isFullComplete) {
    var row = buildSessionCompletionRow(isFullComplete);
    if (!row) return Promise.resolve(false);
    notifyParentSessionEnd(row);
    var inIframe = !!(window.parent && window.parent !== window);
    if (inIframe) return Promise.resolve(true);
    var cfg = window.APP_CONFIG;
    if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return Promise.resolve(false);
    return fetch(cfg.SUPABASE_URL + '/rest/v1/jogbo_session_completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': cfg.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + cfg.SUPABASE_ANON_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(row)
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          console.warn('jogbo_session_completions insert failed:', res.status, t);
          return false;
        });
      }
      return true;
    }).catch(function (e) {
      console.warn('jogbo_session_completions insert failed:', e);
      return false;
    });
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setQuizSubview(id) {
    ['quiz-session-setup', 'quiz-session-complete', 'quiz-session-play', 'quiz-wrong-manage'].forEach(function (sid) {
      var el = document.getElementById(sid);
      if (el) el.classList.add('hidden');
    });
    if (id) {
      var show = document.getElementById(id);
      if (show) show.classList.remove('hidden');
    }
  }

  function getWordByQuestionIdMap() {
    var map = {};
    getEligibleQuizPool().forEach(function (w) {
      var k = wordKeyForSession(w);
      if (k) map[k] = w;
    });
    return map;
  }

  async function fetchJogboWrongQuestions(studentId, tag) {
    var cfg = window.APP_CONFIG;
    if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return [];
    if (!studentId) return [];
    try {
      var res = await fetch(cfg.SUPABASE_URL + '/rest/v1/rpc/get_jogbo_wrong_questions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': cfg.SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + cfg.SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          p_student_id: String(studentId),
          p_tag: String(tag || '')
        })
      });
      if (!res.ok) {
        console.warn('get_jogbo_wrong_questions failed:', res.status, await res.text().catch(function () { return ''; }));
        return [];
      }
      var rows = await res.json();
      if (!Array.isArray(rows)) return [];
      return rows.filter(function (r) { return r && r.question_id; });
    } catch (e) {
      console.warn('get_jogbo_wrong_questions failed:', e);
      return [];
    }
  }

  async function refreshCumulativeWrongUi() {
    var card = document.getElementById('quizCumulativeWrongCard');
    var line = document.getElementById('quizCumulativeWrongLine');
    var student = getStudentContext();
    if (!card || !line) return;
    if (!student.id) {
      cumulativeWrongRows = [];
      card.classList.add('hidden');
      return;
    }
    var rows = await fetchJogboWrongQuestions(student.id, getTag());
    var wordMap = getWordByQuestionIdMap();
    cumulativeWrongRows = rows.filter(function (r) { return wordMap[r.question_id]; });
    if (cumulativeWrongRows.length <= 0) {
      card.classList.add('hidden');
      return;
    }
    line.textContent = '📋 누적 오답: ' + cumulativeWrongRows.length + '개';
    card.classList.remove('hidden');
  }

  async function dismissWrongQuestions(questionIds) {
    var cfg = window.APP_CONFIG;
    var student = getStudentContext();
    if (!cfg || !student.id || !questionIds || !questionIds.length) return false;
    var tag = getTag();
    var rows = questionIds.map(function (qid) {
      return { user_id: String(student.id), tag: tag, question_id: String(qid) };
    });
    try {
      var res = await fetch(cfg.SUPABASE_URL + '/rest/v1/jogbo_wrong_dismissed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': cfg.SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + cfg.SUPABASE_ANON_KEY,
          'Prefer': 'return=minimal,resolution=ignore-duplicates'
        },
        body: JSON.stringify(rows)
      });
      if (!res.ok) {
        console.warn('jogbo_wrong_dismissed insert failed:', res.status, await res.text().catch(function () { return ''; }));
        return false;
      }
      return true;
    } catch (e) {
      console.warn('jogbo_wrong_dismissed insert failed:', e);
      return false;
    }
  }

  function updateWrongManageTitle() {
    var title = document.getElementById('quizWrongManageTitle');
    if (title) title.textContent = getTag() + ' - 누적 오답 ' + cumulativeWrongRows.length + '개';
  }

  function renderWrongManageList() {
    var list = document.getElementById('quizWrongList');
    if (!list) return;
    var wordMap = getWordByQuestionIdMap();
    if (!cumulativeWrongRows.length) {
      list.innerHTML = '<li style="justify-content:center;color:#6b7280;padding:16px;">누적 오답이 없습니다.</li>';
      return;
    }
    list.innerHTML = cumulativeWrongRows.map(function (row) {
      var w = wordMap[row.question_id];
      var kw = w && w.keyword ? String(w.keyword).trim() : row.question_id;
      var mean = w && w.meaning ? String(w.meaning).trim() : '';
      var qidEsc = escapeHtml(row.question_id);
      var checked = wrongManageSelectedIds[row.question_id] ? ' checked' : '';
      return '<li><input type="checkbox" class="quiz-wrong-check" data-qid="' + qidEsc + '"' + checked + '>' +
        '<div><span class="wrong-kw">' + escapeHtml(kw) + '</span>' +
        (mean ? '<br><span class="wrong-mean">' + escapeHtml(mean) + '</span>' : '') +
        '</div></li>';
    }).join('');
    var selectAll = document.getElementById('quizWrongSelectAll');
    if (selectAll) {
      selectAll.checked = cumulativeWrongRows.length > 0 &&
        cumulativeWrongRows.every(function (r) { return wrongManageSelectedIds[r.question_id]; });
    }
    var retryAll = document.getElementById('quizWrongRetryAll');
    if (retryAll) retryAll.textContent = '모두 다시 풀기 (' + cumulativeWrongRows.length + '개)';
  }

  async function showWrongManageScreen() {
    var student = getStudentContext();
    if (!student.id) {
      alert('로그인 후 이용할 수 있습니다.');
      return;
    }
    setQuizSubview('quiz-wrong-manage');
    cumulativeWrongRows = await fetchJogboWrongQuestions(student.id, getTag());
    var wordMap = getWordByQuestionIdMap();
    cumulativeWrongRows = cumulativeWrongRows.filter(function (r) { return wordMap[r.question_id]; });
    wrongManageSelectedIds = {};
    updateWrongManageTitle();
    renderWrongManageList();
  }

  function getWrongManageSelectedIds() {
    return Object.keys(wrongManageSelectedIds).filter(function (k) { return wrongManageSelectedIds[k]; });
  }

  async function beginCumulativeWrongSession(questionIds, policy) {
    if (!questionIds || !questionIds.length) return;
    var wordMap = getWordByQuestionIdMap();
    var words = [];
    questionIds.forEach(function (id) {
      if (wordMap[id]) words.push(wordMap[id]);
    });
    if (!words.length) {
      alert('선택한 오답을 덱에서 찾을 수 없습니다.');
      return;
    }
    await beginSession({
      pool: words,
      limit: words.length,
      queuePolicy: policy
    });
  }

  function closeQuizAnswerModal() {
    var modal = document.getElementById('quiz-answer-modal');
    if (modal) modal.classList.add('hidden');
    if (quizModalEnterHandler) {
      document.removeEventListener('keydown', quizModalEnterHandler);
      quizModalEnterHandler = null;
    }
  }

  function showQuizAnswerModal(correct, detail) {
    var modal = document.getElementById('quiz-answer-modal');
    var verdict = document.getElementById('quizModalVerdict');
    var keyword = document.getElementById('quizModalKeyword');
    var meaning = document.getElementById('quizModalMeaning');
    var extra = document.getElementById('quizModalExtra');
    var nextBtn = document.getElementById('quizModalNext');
    if (!modal || !verdict) return;
    detail = detail || {};
    verdict.textContent = correct ? '✅ 정답! +5점' : '❌ 오답';
    verdict.className = 'quiz-modal-verdict ' + (correct ? 'correct' : 'wrong');
    if (keyword) keyword.textContent = detail.keyword || '—';
    if (meaning) {
      meaning.textContent = detail.meaning || '';
      meaning.style.display = detail.meaning ? '' : 'none';
    }
    if (extra) {
      extra.textContent = detail.extra || '';
      extra.style.display = detail.extra ? '' : 'none';
    }
    modal.classList.remove('hidden');
    if (quizModalEnterHandler) document.removeEventListener('keydown', quizModalEnterHandler);
    quizModalEnterHandler = function (ev) {
      if (ev.key === 'Enter' && modal && !modal.classList.contains('hidden')) {
        ev.preventDefault();
        advanceToNextQuestion();
      }
    };
    document.addEventListener('keydown', quizModalEnterHandler);
    if (nextBtn) {
      window.setTimeout(function () {
        try { nextBtn.focus(); } catch (e) {}
      }, 0);
    }
  }

  function advanceToNextQuestion() {
    closeQuizAnswerModal();
    if (!quizAnswered || !sessionActive) return;
    activeIdx++;
    if (activeIdx >= activeDeck.length) {
      advanceAfterRoundComplete();
      return;
    }
    presentQuestion();
  }

  function getQuestionCountOptions(poolLen) {
    var n = Math.max(0, parseInt(String(poolLen), 10) || 0);
    if (n <= 0) return [];
    var allLabel = '전체(' + n + '개)';
    if (n < 20) return [{ count: 'all', label: allLabel }];
    if (n < 50) {
      return [
        { count: '20', label: '20문제' },
        { count: 'all', label: allLabel }
      ];
    }
    if (n < 100) {
      return [
        { count: '20', label: '20문제' },
        { count: '50', label: '50문제' },
        { count: 'all', label: allLabel }
      ];
    }
    return [
      { count: '20', label: '20문제' },
      { count: '50', label: '50문제' },
      { count: '100', label: '100문제' },
      { count: 'all', label: allLabel }
    ];
  }

  function normalizeQuestionCountForPool(poolLen, pick) {
    var opts = getQuestionCountOptions(poolLen);
    if (!opts.length) return 'all';
    var allowed = opts.map(function (o) { return o.count; });
    var raw = String(pick != null ? pick : '20');
    if (allowed.indexOf(raw) >= 0) return raw;
    if (defaultQuestionLimit != null && !window.__jogboCountUserPicked) {
      var def = String(defaultQuestionLimit);
      if (allowed.indexOf(def) >= 0) return def;
      var numeric = parseInt(def, 10);
      if (!isNaN(numeric)) {
        var best = null;
        allowed.forEach(function (c) {
          if (c === 'all') return;
          var cn = parseInt(c, 10);
          if (cn <= poolLen && cn <= numeric && (best == null || cn > best)) best = cn;
        });
        if (best != null) return String(best);
      }
    }
    if (allowed.indexOf('20') >= 0) return '20';
    return 'all';
  }

  function renderQuestionCountOptions(poolLen) {
    var grid = document.getElementById('quizCountGrid');
    if (!grid) return;
    var opts = getQuestionCountOptions(poolLen);
    grid.innerHTML = opts.map(function (o) {
      var c = String(o.count).replace(/"/g, '&quot;');
      return '<button type="button" class="quiz-count-btn" data-count="' + c + '">' + o.label + '</button>';
    }).join('');
    grid.classList.toggle('quiz-count-grid--single', opts.length === 1);
    selectedQuestionCount = normalizeQuestionCountForPool(poolLen, selectedQuestionCount);
    syncQuestionCountSelectionUi();
  }

  function savePartialSessionCompletionIfNeeded() {
    if (sessionCompletionSaved || !sessionActive || !sessionId) return Promise.resolve(false);
    var stats = getFirstAttemptSessionStats();
    if (stats.question_count <= 0) return Promise.resolve(false);
    sessionCompletionSaved = true;
    return recordSessionCompletion(false);
  }

  function resetSessionUiForSetup() {
    savePartialSessionCompletionIfNeeded();
    closeQuizAnswerModal();
    sessionActive = false;
    sessionId = null;
    sessionCompletionSaved = false;
    completingSessionWrongIds = {};
    wrongManageSelectedIds = {};
    setQuizSubview('quiz-session-setup');
    var poolLine = document.getElementById('quizSetupPoolLine');
    var poolLen = getEligibleQuizPool().length;
    if (poolLine) poolLine.textContent = poolLen > 0 ? ('풀 수 있는 문항: ' + poolLen + '개') : '단어가 없습니다.';
    renderQuestionCountOptions(poolLen);
    var startBtn = document.getElementById('quizSessionStart');
    if (startBtn) startBtn.disabled = poolLen <= 0;
    refreshCumulativeWrongUi().catch(function (e) { console.warn('refreshCumulativeWrongUi:', e); });
  }

  function syncQuestionCountSelectionUi() {
    var poolLen = getEligibleQuizPool().length;
    var pick = selectedQuestionCount;
    if (defaultQuestionLimit != null && !window.__jogboCountUserPicked) {
      pick = normalizeQuestionCountForPool(poolLen, String(defaultQuestionLimit));
    } else {
      pick = normalizeQuestionCountForPool(poolLen, pick);
    }
    selectedQuestionCount = pick;
    $$('.quiz-count-btn').forEach(function (btn) {
      var c = btn.getAttribute('data-count');
      if (String(c) === String(pick)) btn.classList.add('selected');
      else btn.classList.remove('selected');
    });
  }

  function showSessionPlay() {
    closeQuizAnswerModal();
    setQuizSubview('quiz-session-play');
  }

  function showSessionComplete() {
    closeQuizAnswerModal();
    if (!sessionCompletionSaved) {
      sessionCompletionSaved = true;
      recordSessionCompletion(true);
    }
    sessionActive = false;
    completingSessionWrongIds = Object.assign({}, sessionWrongIds);
    var wrongN = Object.keys(completingSessionWrongIds).length;
    setQuizSubview('quiz-session-complete');
    var sum = document.getElementById('quizCompleteSummary');
    if (sum) {
      sum.textContent = '정답 ' + quizScore.correct + ' / ' + quizScore.total + ' (세션 ' + (fullDeck.length || 0) + '문항)\n틀린 문항(누적): ' + wrongN + '개';
    }
    var retryBtn = document.getElementById('quizSessionRetryWrong');
    if (retryBtn) {
      if (wrongN > 0) {
        retryBtn.textContent = '이번 세션 틀린 ' + wrongN + '개 다시 풀기';
        retryBtn.classList.remove('hidden');
      } else {
        retryBtn.classList.add('hidden');
      }
    }
  }

  function updateQuizProgressLine() {
    var progressEl = document.getElementById('quizProgressLine');
    if (!progressEl) return;
    if (!sessionActive || !fullDeck.length) {
      progressEl.textContent = '0 / 0 문제';
      return;
    }
    var chunkLabel = chunkBoundsLabel();
    var inChunk = activeDeck.length > 0 ? Math.min(activeIdx + 1, activeDeck.length) : 0;
    var inChunkTotal = activeDeck.length;
    progressEl.textContent = '청크 ' + chunkLabel + ' · ' + inChunk + '/' + inChunkTotal;
    var banner = document.getElementById('quizChunkRetryBanner');
    if (banner) {
      if (chunkRetryRound && retryBannerCount > 0) {
        banner.textContent = '틀린 ' + retryBannerCount + '개 다시 풀기';
        banner.classList.remove('hidden');
      } else {
        banner.textContent = '';
        banner.classList.add('hidden');
      }
    }
  }

  function buildAnswerLogPayload(correct) {
    var qid = wordKeyForSession(currentQuizWord);
    var attemptCount = bumpAttempt(qid);
    var attemptInChunk = attemptCount;
    return {
      type: 'tokpass-jogbo-answer',
      correct: !!correct,
      tag: getTag(),
      keyword: currentQuizWord && currentQuizWord.keyword != null ? String(currentQuizWord.keyword) : '',
      meaning: currentQuizWord && currentQuizWord.meaning != null ? String(currentQuizWord.meaning) : '',
      question_id: qid,
      session_id: sessionId,
      attempt_count: attemptCount,
      ml_features: buildMlFeatures(attemptInChunk)
    };
  }

  function buildAnswerLogRestRow(payload, studentId, studentName) {
    var row = {
      student_id: studentId,
      student_name: studentName || null,
      tag: payload.tag,
      correct: payload.correct,
      quiz_type: 'input',
      created_at_kst: nowKstString()
    };
    var ml = (payload.ml_features && typeof payload.ml_features === 'object') ? Object.assign({}, payload.ml_features) : {};
    if (payload.session_id) row.session_id = String(payload.session_id);
    if (payload.attempt_count != null) {
      var ac = parseInt(String(payload.attempt_count), 10);
      if (!isNaN(ac)) row.attempt_count = ac;
    }
    if (payload.question_id != null && String(payload.question_id).trim()) {
      var qidStr = String(payload.question_id).trim();
      if (/^\d+$/.test(qidStr)) {
        row.question_id = parseInt(qidStr, 10);
      } else {
        ml.question_id = qidStr;
      }
    }
    if (Object.keys(ml).length) row.ml_features = ml;
    return row;
  }

  async function beginSession(opts) {
    opts = opts || {};
    var pool = opts.pool || getEligibleQuizPool();
    if (pool.length < 1) {
      alert(isConnectorPage ? '연결사 단어가 없습니다.' : '풀 수 있는 단어가 없습니다.');
      return;
    }
    var limit = opts.limit != null ? opts.limit : resolveSessionLimit(selectedQuestionCount, pool.length);
    var deck;
    var fixedOrder = opts.queuePolicy === 'session_wrong_only'
      || opts.queuePolicy === 'cumulative_wrong_selected'
      || opts.queuePolicy === 'cumulative_wrong_all';
    if (fixedOrder) {
      queuePolicy = opts.queuePolicy;
      deck = shuffle(pool.slice()).slice(0, Math.min(limit, pool.length));
    } else {
      deck = await buildOrderedDeckFromPool(pool, limit);
    }
    if (!deck.length) {
      alert('시작할 문항이 없습니다.');
      return;
    }
    sessionQuestionLimit = deck.length;
    sessionId = newSessionId();
    sessionActive = true;
    sessionCompletionSaved = false;
    fullDeck = deck;
    chunkIndex = 0;
    chunkRetryRound = false;
    retryBannerCount = 0;
    roundWrongById = {};
    sessionWrongIds = {};
    attemptByQuestionId = {};
    firstAttemptByQuestionId = {};
    quizScore = { correct: 0, total: 0 };
    var firstLen = Math.min(CHUNK_SIZE, fullDeck.length);
    activeDeck = shuffle(fullDeck.slice(0, firstLen));
    activeIdx = 0;
    showSessionPlay();
    presentQuestion();
  }

  async function beginWrongOnlySession() {
    var wrongKeys = Object.keys(completingSessionWrongIds);
    if (!wrongKeys.length) return;
    var pool = getEligibleQuizPool();
    var wordByKey = {};
    pool.forEach(function (w) {
      wordByKey[wordKeyForSession(w)] = w;
    });
    var wrongWords = [];
    wrongKeys.forEach(function (k) {
      if (wordByKey[k]) wrongWords.push(wordByKey[k]);
    });
    if (!wrongWords.length) {
      alert('틀린 문항을 덱에서 찾을 수 없습니다.');
      return;
    }
    await beginSession({
      pool: wrongWords,
      limit: wrongWords.length,
      queuePolicy: 'session_wrong_only'
    });
  }

  function advanceAfterRoundComplete() {
    var wrongKeys = Object.keys(roundWrongById);
    if (wrongKeys.length > 0) {
      var wrongWords = wrongKeys.map(function (k) { return roundWrongById[k]; });
      roundWrongById = {};
      chunkRetryRound = true;
      retryBannerCount = wrongWords.length;
      activeDeck = shuffle(wrongWords);
      activeIdx = 0;
      var fb = $('#quizFeedback');
      if (fb) {
        fb.classList.remove('hidden', 'wrong');
        fb.classList.add('correct');
        fb.textContent = '청크 클리어 전 — 틀린 ' + wrongWords.length + '개 다시 풀기';
      }
      presentQuestion();
      return;
    }
    chunkRetryRound = false;
    retryBannerCount = 0;
    var nextChunk = chunkIndex + 1;
    if (nextChunk * CHUNK_SIZE >= fullDeck.length) {
      showSessionComplete();
      return;
    }
    chunkIndex = nextChunk;
    var start = chunkIndex * CHUNK_SIZE;
    var slice = fullDeck.slice(start, Math.min(start + CHUNK_SIZE, fullDeck.length));
    activeDeck = shuffle(slice);
    activeIdx = 0;
    var fbClear = $('#quizFeedback');
    if (fbClear) {
      fbClear.classList.remove('hidden', 'wrong');
      fbClear.classList.add('correct');
      fbClear.textContent = '청크 ' + (chunkIndex + 1) + ' 시작!';
    }
    window.setTimeout(function () {
      if (fbClear) {
        fbClear.classList.add('hidden');
        fbClear.textContent = '';
      }
      presentQuestion();
    }, 450);
  }

  function startQuiz() {
    beginSession().catch(function (e) { console.warn('beginSession failed:', e); });
  }

  function presentQuestion() {
    const progressEl = document.getElementById('quizProgressLine');
    if (!sessionActive || !activeDeck.length) {
      if (progressEl) progressEl.textContent = '0 / 0 문제';
      if (!sessionActive) return;
      advanceAfterRoundComplete();
      return;
    }
    if (activeIdx >= activeDeck.length) {
      advanceAfterRoundComplete();
      return;
    }
    updateQuizProgressLine();
    currentQuizWord = activeDeck[activeIdx];
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
      li.addEventListener('click', onQuizChoice, { once: true });
    });
    if (!quizGradeByParticipleBlank) {
      prefetchGoogleTts(currentQuizWord.keyword);
      scheduleSpeakKeyword(currentQuizWord.keyword);
      if (activeIdx + 1 < activeDeck.length) {
        var nextWord = activeDeck[activeIdx + 1];
        if (nextWord && nextWord.keyword) prefetchGoogleTts(nextWord.keyword);
      }
    }
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
    var payload = buildAnswerLogPayload(correct);
    var _hrefLog = window.location && window.location.href ? window.location.href : '';
    var studentId = (parseQueryKey(_hrefLog, 'student_id') || parseQueryKey(_hrefLog, 'user') || '').trim();

    /** iframe 부모 또는 새 창 opener → 메인 똑패스 saveResult (별도 점수 API 없음) */
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(payload, '*');
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
        window.opener.postMessage(payload, '*');
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
        body: JSON.stringify(buildAnswerLogRestRow(payload, sidGuest, nameGuest))
      });
      if (!res.ok) {
        var errText = await res.text().catch(function () { return ''; });
        throw new Error(res.status + ' ' + errText);
      }
      await patchJogboScoreToStudents(correct, sidGuest, cfg);
    } catch (e) {
      console.warn('answer_logs insert failed:', e);
    }
  }

  function onQuizChoice(ev) {
    if (quizAnswered) return;
    quizAnswered = true;
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
      correctThemes = themeLabel === '격' ? getAcceptableQuizThemes(currentQuizWord) : getCorrectThemes(currentQuizWord);
      if (!correctThemes.length && !quizGradeByCategory) correctThemes = ['현재'];
      correct = correctThemes.includes(theme);
      correctLabel = correctThemes.join(', ') + ' ' + themeLabel;
    }
    quizScore.total++;
    if (correct) quizScore.correct++;
    playQuizFeedbackSound(correct);

    var qKey = wordKeyForSession(currentQuizWord);
    if (!chunkRetryRound && !Object.prototype.hasOwnProperty.call(firstAttemptByQuestionId, qKey)) {
      firstAttemptByQuestionId[qKey] = !!correct;
    }
    if (!correct) {
      roundWrongById[qKey] = currentQuizWord;
      sessionWrongIds[qKey] = true;
    } else if (roundWrongById[qKey]) {
      delete roundWrongById[qKey];
    }

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
    fb.classList.add('hidden');
    fb.textContent = '';
    var meanLine = '';
    if (currentQuizWord) {
      if (quizGradeByMeaning) {
        var ct = currentQuizWord.category ? String(currentQuizWord.category).trim() : '';
        if (categoryLabel && ct) meanLine = categoryLabel + ': ' + ct;
      } else if (themeLabel === '격') {
        var catG = currentQuizWord.category && String(currentQuizWord.category).trim();
        var mp = correctThemes.map(function (t) { return getCaseMeaning(catG, t); });
        if (mp.length) meanLine = '의미: ' + mp.join(', ');
      } else if (quizGradeByParticipleBlank) {
        var exPart = parseExampleEnglish(currentQuizWord.example);
        if (exPart) meanLine = '예문: ' + exPart;
      } else {
        var m0 = currentQuizWord.meaning && String(currentQuizWord.meaning).trim();
        if (m0) meanLine = '뜻: ' + m0;
        var ex0 = currentQuizWord.example && String(currentQuizWord.example).trim();
        if (quizGradeByPairing && ex0) meanLine += (meanLine ? '\n' : '') + '예문: ' + ex0;
      }
    }
    var kw = currentQuizWord && currentQuizWord.keyword ? String(currentQuizWord.keyword).trim() : '—';
    var modalMeaning = '';
    if (quizGradeByMeaning) {
      modalMeaning = correctThemes.length ? correctThemes[0] : (currentQuizWord.meaning ? String(currentQuizWord.meaning).trim() : '');
    } else {
      modalMeaning = currentQuizWord && currentQuizWord.meaning ? String(currentQuizWord.meaning).trim() : '';
    }
    var modalExtra = '';
    if (!correct) {
      modalExtra = '정답: ' + correctLabel;
      if (meanLine && meanLine.indexOf('뜻:') !== 0) modalExtra += '\n' + meanLine;
    } else if (meanLine) {
      modalExtra = meanLine;
    } else {
      modalExtra = '스코어에 +5점 반영';
    }
    $('#quizScore').textContent = quizScore.correct + ' / ' + quizScore.total;
    logAnswer(correct);
    showQuizAnswerModal(correct, {
      keyword: kw,
      meaning: modalMeaning,
      extra: modalExtra
    });
  }

  (function bindQuizAnswerModal() {
    var nextBtn = document.getElementById('quizModalNext');
    if (nextBtn) nextBtn.addEventListener('click', advanceToNextQuestion);
  })();

  (function bindQuizNext() {
    var qn = $('#quizNext');
    if (!qn) return;
    qn.addEventListener('click', advanceToNextQuestion);
  })();

  (function bindSessionSetupUi() {
    var countGrid = document.getElementById('quizCountGrid');
    if (countGrid) {
      countGrid.addEventListener('click', function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest('.quiz-count-btn') : null;
        if (!btn) return;
        window.__jogboCountUserPicked = true;
        selectedQuestionCount = btn.getAttribute('data-count') || '20';
        syncQuestionCountSelectionUi();
      });
    }
    var startBtn = document.getElementById('quizSessionStart');
    if (startBtn) {
      startBtn.addEventListener('click', function () {
        if (startBtn.disabled) return;
        startBtn.disabled = true;
        var prevLabel = startBtn.textContent;
        startBtn.textContent = '준비 중…';
        beginSession().catch(function (e) {
          console.warn('beginSession failed:', e);
          alert('세션을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        }).finally(function () {
          startBtn.disabled = false;
          startBtn.textContent = prevLabel;
        });
      });
    }
    var retryWrongBtn = document.getElementById('quizSessionRetryWrong');
    if (retryWrongBtn) {
      retryWrongBtn.addEventListener('click', function () {
        if (retryWrongBtn.disabled) return;
        retryWrongBtn.disabled = true;
        beginWrongOnlySession().catch(function (e) {
          console.warn('beginWrongOnlySession failed:', e);
          alert('틀린 문항 세션을 시작하지 못했습니다.');
        }).finally(function () {
          retryWrongBtn.disabled = false;
        });
      });
    }
    var finishBtn = document.getElementById('quizSessionFinish');
    if (finishBtn) {
      finishBtn.addEventListener('click', function () {
        resetSessionUiForSetup();
      });
    }
    var manageWrongBtn = document.getElementById('quizManageWrongBtn');
    if (manageWrongBtn) {
      manageWrongBtn.addEventListener('click', function () {
        showWrongManageScreen().catch(function (e) {
          console.warn('showWrongManageScreen:', e);
          alert('누적 오답을 불러오지 못했습니다.');
        });
      });
    }
    var wrongBackBtn = document.getElementById('quizWrongManageBack');
    if (wrongBackBtn) {
      wrongBackBtn.addEventListener('click', function () {
        resetSessionUiForSetup();
      });
    }
    var wrongList = document.getElementById('quizWrongList');
    if (wrongList) {
      wrongList.addEventListener('change', function (ev) {
        var t = ev.target;
        if (!t || !t.classList || !t.classList.contains('quiz-wrong-check')) return;
        var qid = t.getAttribute('data-qid');
        if (!qid) return;
        wrongManageSelectedIds[qid] = !!t.checked;
        var selectAll = document.getElementById('quizWrongSelectAll');
        if (selectAll) {
          selectAll.checked = cumulativeWrongRows.length > 0 &&
            cumulativeWrongRows.every(function (r) { return wrongManageSelectedIds[r.question_id]; });
        }
      });
    }
    var wrongSelectAll = document.getElementById('quizWrongSelectAll');
    if (wrongSelectAll) {
      wrongSelectAll.addEventListener('change', function () {
        var on = !!wrongSelectAll.checked;
        cumulativeWrongRows.forEach(function (r) {
          wrongManageSelectedIds[r.question_id] = on;
        });
        renderWrongManageList();
      });
    }
    var wrongDismissBtn = document.getElementById('quizWrongDismissSelected');
    if (wrongDismissBtn) {
      wrongDismissBtn.addEventListener('click', function () {
        var ids = getWrongManageSelectedIds();
        if (!ids.length) {
          alert('삭제할 항목을 선택해 주세요.');
          return;
        }
        wrongDismissBtn.disabled = true;
        dismissWrongQuestions(ids).then(function (ok) {
          if (!ok) alert('삭제 처리에 실패했습니다.');
          return showWrongManageScreen();
        }).finally(function () {
          wrongDismissBtn.disabled = false;
          refreshCumulativeWrongUi().catch(function () {});
        });
      });
    }
    var wrongRetrySelBtn = document.getElementById('quizWrongRetrySelected');
    if (wrongRetrySelBtn) {
      wrongRetrySelBtn.addEventListener('click', function () {
        var ids = getWrongManageSelectedIds();
        if (!ids.length) {
          alert('다시 풀 항목을 선택해 주세요.');
          return;
        }
        wrongRetrySelBtn.disabled = true;
        beginCumulativeWrongSession(ids, 'cumulative_wrong_selected').catch(function (e) {
          console.warn(e);
          alert('세션을 시작하지 못했습니다.');
        }).finally(function () {
          wrongRetrySelBtn.disabled = false;
        });
      });
    }
    var wrongRetryAllBtn = document.getElementById('quizWrongRetryAll');
    if (wrongRetryAllBtn) {
      wrongRetryAllBtn.addEventListener('click', function () {
        if (!cumulativeWrongRows.length) return;
        var ids = cumulativeWrongRows.map(function (r) { return r.question_id; });
        wrongRetryAllBtn.disabled = true;
        beginCumulativeWrongSession(ids, 'cumulative_wrong_all').catch(function (e) {
          console.warn(e);
          alert('세션을 시작하지 못했습니다.');
        }).finally(function () {
          wrongRetryAllBtn.disabled = false;
        });
      });
    }
    try {
      var _hrefCount = window.location && window.location.href ? window.location.href : '';
      var countQ = parseQueryKey(_hrefCount, 'jogbo_count');
      if (countQ) selectedQuestionCount = countQ;
    } catch (e) {}
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

  function filterJogboTestsByQuery(tests, q) {
    q = String(q || '').trim().toLowerCase();
    if (!q) return tests;
    return tests.filter(function (t) {
      return String(t.name || '').toLowerCase().indexOf(q) >= 0;
    });
  }

  function renderJogboSwitchBar() {
    var bar = document.getElementById('jogbo-switch-bar');
    var sel = document.getElementById('jogbo-test-select-inner');
    var searchEl = document.getElementById('jogbo-test-search-inner');
    if (!bar || !sel) return;
    var tests = window.__tokpassJogboTests;
    if (!tests || !tests.length) return;
    var query = searchEl ? String(searchEl.value || '') : '';
    var filtered = filterJogboTestsByQuery(tests, query);
    var curDb = getCurrentDbIdFromUrl();
    if (isConnectorPage && window.FORCE_DB_ID) {
      curDb = String(window.FORCE_DB_ID).trim().replace(/-/g, '');
    }
    var selIdx = 0;
    for (var j = 0; j < filtered.length; j++) {
      var dbj = String(filtered[j].db != null ? filtered[j].db : '').replace(/-/g, '');
      if (dbj === curDb) {
        selIdx = j;
        break;
      }
    }
    if (!filtered.length) {
      sel.innerHTML = '<option value="">' + (query ? '검색 결과 없음' : '족보 없음') + '</option>';
    } else {
      sel.innerHTML = filtered.map(function (t, i) {
        var db = String(t.db != null ? t.db : '').replace(/-/g, '');
        var name = String(t.name || (db || '테스트')).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return '<option value="' + db.replace(/"/g, '&quot;') + '"' + (i === selIdx ? ' selected' : '') + '>' + name + '</option>';
      }).join('');
    }
    bar.classList.remove('hidden');
    if (searchEl && !searchEl.dataset.jogboWired) {
      searchEl.dataset.jogboWired = '1';
      searchEl.addEventListener('input', renderJogboSwitchBar);
    }
  }

  window.addEventListener('message', function (ev) {
    var data = ev.data;
    if (!data || data.type !== 'tokpass-jogbo-config') return;
    if (Array.isArray(data.tests)) {
      window.__tokpassJogboTests = data.tests;
      renderJogboSwitchBar();
    }
    if (data.default_jogbo_question_count != null && data.default_jogbo_question_count !== '') {
      var rawCnt = data.default_jogbo_question_count;
      if (rawCnt === 'all' || rawCnt === 0 || String(rawCnt) === '0') {
        if (!window.__jogboCountUserPicked) {
          defaultQuestionLimit = 'all';
          selectedQuestionCount = 'all';
          renderQuestionCountOptions(getEligibleQuizPool().length);
        }
      } else {
        var parsedCnt = parseInt(String(rawCnt), 10);
        if (!isNaN(parsedCnt)) {
          defaultQuestionLimit = parsedCnt;
          if (!window.__jogboCountUserPicked) {
            selectedQuestionCount = normalizeQuestionCountForPool(getEligibleQuizPool().length, String(parsedCnt));
            renderQuestionCountOptions(getEligibleQuizPool().length);
          }
        }
      }
    }
  });

  /** 부모(똑패스)가 iframe 닫기 전 중간 저장 요청 — 독해훈련소와 동일하게 부분 세션도 인증에 반영 */
  window.addEventListener('message', function (ev) {
    var data = ev.data;
    if (!data || data.type !== 'tokpass-jogbo-request-save') return;
    savePartialSessionCompletionIfNeeded().finally(function () {
      try {
        if (ev.source && typeof ev.source.postMessage === 'function') {
          ev.source.postMessage({ type: 'tokpass-jogbo-session-saved', ok: true }, '*');
        }
      } catch (_ack) {}
    });
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
      savePartialSessionCompletionIfNeeded().finally(function () {
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
