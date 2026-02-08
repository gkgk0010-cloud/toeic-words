(function () {
  'use strict';

  // 연결사 전용 페이지(connector.html)면 FORCE_DB_ID 사용, 아니면 URL에서 db 추출
  var _dbIdFromUrl = '';
  if (typeof window !== 'undefined' && window.FORCE_DB_ID) {
    _dbIdFromUrl = String(window.FORCE_DB_ID).trim().replace(/-/g, '');
  } else {
    var _href = typeof window !== 'undefined' && window.location && window.location.href ? window.location.href : '';
    var _search = (typeof window !== 'undefined' && window.location && window.location.search) ? window.location.search : '';
    if (!_search && _href.indexOf('?') >= 0) { _search = '?' + _href.split('?').slice(1).join('?'); }
    var _params = _search ? new URLSearchParams(_search) : null;
    _dbIdFromUrl = (_params && (_params.get('db') || _params.get('database_id'))) ? String(_params.get('db') || _params.get('database_id')).trim().replace(/-/g, '') : '';
  }

  const THEMES = ['현재', '과거', '미래', '현재완료'];
  const isConnectorPage = !!(typeof window !== 'undefined' && window.FORCE_DB_ID);
  let allWords = [];
  let filteredWords = [];
  let quizWordOrder = []; // 퀴즈 시 매번 셔플된 순서
  let setTitle = '';
  let cardIndex = 0;
  let quizIndex = 0;
  let quizScore = { correct: 0, total: 0 };
  let currentQuizWord = null;
  let quizAnswered = false;
  let quizMode = 'theme'; // 이번 세트는 시제 맞추기만

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => el.querySelectorAll(sel);

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
    if (name === 'quiz') startQuiz();
  }

  function parseHash() {
    const hash = (window.location.hash || '#cards').slice(1);
    return hash === 'quiz' ? 'quiz' : 'cards';
  }

  window.addEventListener('hashchange', () => showView(parseHash()));

  var CACHE_TTL_MS = 10 * 60 * 1000; // 10분

  async function loadData() {
    try {
      var search = window.location.search;
      if (!search && window.location.href.indexOf('?') >= 0) {
        search = '?' + window.location.href.split('?').slice(1).join('?');
      }
      var params = new URLSearchParams(search);
      var dbId = _dbIdFromUrl || (params.get('db') || params.get('database_id') || '').trim().replace(/-/g, '');
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
        // 연결사: 시제부사처럼 로컬 JSON 먼저 로드 (바로 나오게)
        if (isConnectorPage) {
          try {
            var staticRes = await fetch('data/connector-words.json?t=' + Date.now(), { cache: 'no-store' });
            if (staticRes.ok) {
              var localData = await staticRes.json();
              if (localData.words && localData.words.length > 0) {
                data = { setTitle: localData.setTitle || '연결사(접속부사)', words: localData.words };
              }
            }
          } catch (e) {}
        }

        if (!data) {
          var cacheKey = 'words_cache_' + dbId;
          var useCache = false;
          try {
            var raw = sessionStorage.getItem(cacheKey);
            if (raw) {
              var cached = JSON.parse(raw);
              var age = Date.now() - (cached.ts || 0);
              if (age < CACHE_TTL_MS && cached.words && cached.words.length > 0) {
                data = { setTitle: cached.setTitle || '', words: cached.words };
                useCache = true;
              }
            }
          } catch (e) {}

          if (!useCache) {
          if (document.getElementById('pageTitle')) {
            document.getElementById('pageTitle').textContent = isConnectorPage ? '연결사 로드 중…' : '로드 중…';
          }
          var origin = window.location.origin || '';
          if (!origin && window.location.href) {
            var a = document.createElement('a');
            a.href = window.location.href;
            origin = a.origin || (a.protocol + '//' + a.host);
          }
          var pathname = (window.location && window.location.pathname) || '';
          var pathParts = pathname.split('/').filter(Boolean);
          var basePath = '';
          if (pathParts.length > 1) {
            pathParts.pop();
            basePath = '/' + pathParts.join('/');
          }
          var apiUrl = (origin || '') + basePath + '/api/notion-words?database_id=' + encodeURIComponent(dbId) +
            (params.get('set_title') ? '&set_title=' + encodeURIComponent(params.get('set_title')) : '') +
            '&t=' + Date.now();
          var res = await fetch(apiUrl, { cache: 'no-store', method: 'GET' });
          if (!res.ok && basePath && res.status === 404) {
            res = await fetch((origin || '') + '/api/notion-words?database_id=' + encodeURIComponent(dbId) +
              (params.get('set_title') ? '&set_title=' + encodeURIComponent(params.get('set_title')) : '') +
              '&t=' + Date.now(), { cache: 'no-store', method: 'GET' });
          }
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || err.message || res.statusText);
          }
          data = await res.json();
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify({
              setTitle: data.setTitle || '',
              words: data.words || [],
              ts: Date.now()
            }));
          } catch (e) {}
          }
        }
      } else {
        // 없으면 기존 words.json
        const res = await fetch('data/words.json?t=' + Date.now(), { cache: 'no-store' });
        data = await res.json();
      }

      setTitle = data.setTitle || '토익 시제부사';
      allWords = data.words || [];
      applyFilter();
      document.getElementById('pageTitle').textContent = setTitle;
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
      if (document.getElementById('pageTitle')) {
        document.getElementById('pageTitle').textContent = '데이터 로드 실패';
      }
      var errEl = document.getElementById('loadError');
      if (errEl) {
        errEl.innerHTML = isConnectorPage
          ? '연결사 데이터를 불러오지 못했습니다.<br><small>' + (e && e.message ? e.message : '') + '</small><br><br>노션 DB(연결사) 연결·<b>NOTION_API_KEY</b>·Vercel 환경 변수를 확인해 주세요.'
          : '데이터를 불러오지 못했습니다.<br><small>' + (e && e.message ? e.message : '') + '</small><br><br>GitHub에 <b>data/words.json</b> 파일이 있는지 확인해 주세요.';
        errEl.style.display = 'block';
      }
    }
  }

  function applyFilter(resetCardIndex) {
    const theme = ($('#themeFilter') || {}).value || '';
    if (!theme) {
      filteredWords = [...allWords];
    } else {
      filteredWords = allWords.filter(function (w) {
        const themes = (w.themes && w.themes.length) ? w.themes : (w.theme ? [w.theme] : []);
        return themes.includes(theme);
      });
    }
    if (resetCardIndex) cardIndex = 0;
  }

  /** answer_logs.tag / 모니터용. 연결사 페이지는 API에서 받은 setTitle(DB 제목) 사용, 시제부사는 config 또는 setTitle */
  function getTag() {
    if (isConnectorPage) return setTitle || '연결사(접속부사)';
    return (window.APP_CONFIG && window.APP_CONFIG.TEST_TITLE) || setTitle || '토익 시제부사';
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
    $('#cardMeaning').textContent = word.meaning;
    $('#cardExample').textContent = word.example;
    const themesLabel = getCorrectThemes(word).join(', ');
    $('#cardThemeBadge').textContent = themesLabel || '—';
    $('#cardThemeLine').textContent = (themesLabel || '—') + (isConnectorPage ? ' 카테고리에 씁니다' : ' 시제에 씁니다');
    $('#cardIndex').textContent = (cardIndex + 1) + ' / ' + list.length;
    $('#cardPrev').disabled = cardIndex <= 0;
    $('#cardNext').disabled = cardIndex >= list.length - 1;
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

  $('#themeFilter')?.addEventListener('change', () => { applyFilter(true); renderCard(); });
  $('#cardPrev')?.addEventListener('click', cardPrev);
  $('#cardNext')?.addEventListener('click', cardNext);
  $('#card')?.addEventListener('click', cardFlip);

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

  /** 단어당 정답 시제. theme 하나 또는 themes 배열(중복 정답) */
  function getCorrectThemes(word) {
    if (word.themes && Array.isArray(word.themes) && word.themes.length) return word.themes;
    const t = word.theme || '현재';
    return [t];
  }

  function pickThemeChoices(primaryTheme, count) {
    const others = THEMES.filter(t => t !== primaryTheme);
    const shuffled = shuffle(others);
    const choices = [primaryTheme, ...shuffled.slice(0, count - 1)];
    return shuffle(choices);
  }

  /** 연결사: 데이터에서 나온 카테고리 목록 (중복 제거) */
  function getUniqueCategories() {
    return [...new Set(filteredWords.flatMap(function (w) { return getCorrectThemes(w); }))].filter(Boolean).sort();
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
    applyFilter(true);
    quizWordOrder = shuffle([...filteredWords]);
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
      $('#quizChoices').innerHTML = '';
      $('#quizScore').textContent = '0 / 0';
      return;
    }
    if (quizIndex >= quizWordOrder.length) {
      startQuiz();
      return;
    }
    if (progressEl) progressEl.textContent = (quizIndex + 1) + ' / ' + quizWordOrder.length + ' 문제';
    currentQuizWord = quizWordOrder[quizIndex];
    quizAnswered = false;
    const correctThemes = getCorrectThemes(currentQuizWord);
    const primaryTheme = correctThemes[0];
    let choices;
    let questionText;
    if (isConnectorPage) {
      const allCats = getUniqueCategories();
      choices = pickCategoryChoices(primaryTheme, allCats, 4);
      questionText = '이 연결사는 어떤 카테고리에 쓰이나요?';
    } else {
      choices = pickThemeChoices(primaryTheme, 4);
      questionText = '이 부사는 어느 시제에 쓰이나요?';
    }
    $('#quizWord').textContent = currentQuizWord.keyword;
    $('#quizQuestion').textContent = questionText;
    $('#quizChoices').innerHTML = choices.map((t) =>
      '<li data-theme="' + (t || '').replace(/"/g, '&quot;') + '">' + (t || '') + '</li>'
    ).join('');
    $('#quizFeedback').className = 'quiz-feedback hidden';
    $('#quizFeedback').textContent = '';
    $('#quizScore').textContent = quizScore.correct + ' / ' + quizScore.total;
    $$('#quizChoices li').forEach(li => {
      li.addEventListener('click', onQuizChoice);
    });
  }

  async function logAnswer(correct) {
    const cfg = window.APP_CONFIG;
    if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;
    const tag = getTag();
    const params = new URLSearchParams(window.location.search);
    const studentId = params.get('student_id') || params.get('user') || 'guest';
    const studentName = params.get('student_name') || params.get('name') || '';

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
          student_id: studentId,
          student_name: studentName || null,
          tag: tag,
          correct: correct,
          quiz_type: 'input'
        })
      });
      if (!res.ok) throw new Error(res.statusText);
    } catch (e) {
      console.warn('answer_logs insert failed:', e);
    }
  }

  function onQuizChoice(ev) {
    if (quizAnswered) return;
    const li = ev.currentTarget;
    const theme = li.getAttribute('data-theme');
    const correctThemes = getCorrectThemes(currentQuizWord);
    const correct = correctThemes.includes(theme);
    const correctLabel = correctThemes.join(', ') + (isConnectorPage ? ' 카테고리' : ' 시제');
    quizAnswered = true;
    quizScore.total++;
    if (correct) quizScore.correct++;

    $$('#quizChoices li').forEach(el => {
      el.classList.add('disabled');
      const elTheme = el.getAttribute('data-theme');
      if (correctThemes.includes(elTheme)) el.classList.add('correct');
      else if (el === li && !correct) el.classList.add('wrong');
    });

    const fb = $('#quizFeedback');
    fb.classList.remove('hidden');
    fb.classList.add(correct ? 'correct' : 'wrong');
    fb.textContent = correct ? '정답!' : '오답. 정답: ' + correctLabel;
    $('#quizScore').textContent = quizScore.correct + ' / ' + quizScore.total;

    logAnswer(correct);
  }

    $('#quizNext')?.addEventListener('click', () => {
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
    } else if (quizIndex >= quizWordOrder.length) {
      startQuiz();
    }
  });

  /** 연결사 페이지: 필터 라벨·옵션을 카테고리로 변경 */
  function applyConnectorFilterUI() {
    if (!isConnectorPage || !allWords.length) return;
    const cats = [...new Set(allWords.flatMap(function (w) { return getCorrectThemes(w); }))].filter(Boolean).sort();
    const labelEl = document.querySelector('.filter label');
    if (labelEl) labelEl.textContent = '카테고리';
    const sel = document.getElementById('themeFilter');
    if (!sel) return;
    sel.innerHTML = '<option value="">전체</option>' + cats.map(function (c) {
      return '<option value="' + String(c).replace(/"/g, '&quot;') + '">' + String(c) + '</option>';
    }).join('');
  }

  function hideInitStatus() {
    var s = document.getElementById('initStatus');
    if (s) s.style.display = 'none';
  }

  // 나가기: 똑패스에서 연 창이면 닫고, 아니면 그냥 닫기 시도
  document.getElementById('btn-exit-quiz')?.addEventListener('click', function () {
    if (window.opener) {
      try { window.opener.focus(); } catch (e) {}
    }
    window.close();
  });

  // ——— 초기화 ———
  loadData().then(() => {
    try {
      applyConnectorFilterUI();
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
    console.error('loadData error', e);
    hideInitStatus();
    var errEl = document.getElementById('loadError');
    if (errEl) { errEl.textContent = '로드 오류: ' + (e.message || e); errEl.style.display = 'block'; }
    var s = document.getElementById('initStatus');
    if (s) { s.textContent = '로드 오류: ' + (e.message || e); s.style.color = '#c00'; s.style.display = 'block'; }
  });
})();
