(function () {
  'use strict';

  const THEMES = ['현재', '과거', '미래', '현재완료'];
  let allWords = [];
  let filteredWords = [];
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
    if (name === 'cards') renderCard();
    if (name === 'quiz') startQuiz();
  }

  function parseHash() {
    const hash = (window.location.hash || '#cards').slice(1);
    return hash === 'quiz' ? 'quiz' : 'cards';
  }

  window.addEventListener('hashchange', () => showView(parseHash()));

  async function loadData() {
    try {
      const params = new URLSearchParams(window.location.search);
      const dbId = (params.get('db') || params.get('database_id') || '').trim();
      let data;

      if (dbId) {
        // 노션 DB ID 있으면 API 경유 (Vercel /api/notion-words)
        const apiUrl = '/api/notion-words?database_id=' + encodeURIComponent(dbId.replace(/-/g, '')) +
          (params.get('set_title') ? '&set_title=' + encodeURIComponent(params.get('set_title')) : '') +
          '&t=' + Date.now();
        const res = await fetch(apiUrl, { cache: 'no-store' });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || err.message || res.statusText);
        }
        data = await res.json();
      } else {
        // 없으면 기존 words.json
        const res = await fetch('data/words.json?t=' + Date.now(), { cache: 'no-store' });
        data = await res.json();
      }

      setTitle = data.setTitle || '토익 시제부사';
      allWords = data.words || [];
      applyFilter();
      document.getElementById('pageTitle').textContent = setTitle;
    } catch (e) {
      console.error('Failed to load words:', e);
      allWords = [];
      filteredWords = [];
      if (document.getElementById('pageTitle')) {
        document.getElementById('pageTitle').textContent = '데이터 로드 실패';
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

  function getTag() {
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
    $('#cardThemeLine').textContent = (themesLabel || '—') + ' 시제에 씁니다';
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

  function startQuiz() {
    applyFilter(true);
    quizIndex = 0;
    quizScore = { correct: 0, total: 0 };
    nextQuiz();
  }

  function nextQuiz() {
    if (filteredWords.length < 1) {
      $('#quizWord').textContent = '단어가 필요합니다.';
      $('#quizChoices').innerHTML = '';
      $('#quizScore').textContent = '0 / 0';
      return;
    }
    if (quizIndex >= filteredWords.length) {
      startQuiz();
      return;
    }
    currentQuizWord = filteredWords[quizIndex];
    quizAnswered = false;
    const correctThemes = getCorrectThemes(currentQuizWord);
    const primaryTheme = correctThemes[0];
    const choices = pickThemeChoices(primaryTheme, 4);
    $('#quizWord').textContent = currentQuizWord.keyword;
    $('#quizQuestion').textContent = '이 부사는 어느 시제에 쓰이나요?';
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
    const correctLabel = correctThemes.join(', ') + ' 시제';
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
    if (quizAnswered && quizIndex < filteredWords.length - 1) {
      quizIndex++;
      nextQuiz();
    } else if (quizAnswered && quizIndex >= filteredWords.length - 1) {
      const fb = $('#quizFeedback');
      fb.classList.remove('hidden');
      fb.classList.add('correct');
      fb.textContent = '퀴즈 끝! ' + quizScore.correct + ' / ' + quizScore.total + ' 맞음';
      $('#quizChoices').innerHTML = '';
      quizIndex++;
    } else if (quizIndex >= filteredWords.length) {
      startQuiz();
    }
  });

  // ——— 초기화 ———
  loadData().then(() => {
    showView(parseHash());
  });
})();
