/*
 * Второй голос — «Спросить преподавателя».
 * Работает, только когда программа открыта внутри Claude: тогда страница может
 * задать вопрос Claude от имени ученика. В обычном браузере кнопка не появляется.
 */
(function () {
  'use strict';

  const VG = window.VG;
  const { $, el } = VG;

  const RULES =
    'Ты — внимательный и бережный преподаватель вокала. Ученик занимается сам по приложению «Второй голос»: ' +
    'распевки, дыхание и опора, техника EVT (фигуры Эстилл и шесть качеств голоса), сольфеджио, пение второго голоса, ' +
    'разбор вокала по микрофону. Отвечай по-русски, просто и конкретно, как живой педагог на уроке: короткие абзацы, ' +
    'а если нужно — 2–4 шага упражнения, которое можно сделать прямо сейчас. Объясняй работу голоса через ощущения ' +
    'и бытовые сравнения, без заумных терминов. Не ставь диагнозов: при боли, потере голоса или осиплости дольше двух недель ' +
    'советуй обратиться к ЛОР-фониатру. Помни, что оценки приложения по микрофону приблизительные, и не выдумывай того, ' +
    'чего не знаешь о голосе ученика. Не используй разметку Markdown — только обычный текст.';

  const T = { sample: null, turns: [], ctl: null, busy: false };

  const CHIPS = {
    default: ['Что мне тренировать сегодня?', 'Почему садится голос на высоких нотах?', 'Как петь второй голос и не съезжать на мелодию?'],
    evt: ['Объясни этот урок ещё проще', 'Как понять, что у меня получилось?', 'Что делать, если не получается?'],
    analysis: ['Что из разбора самое важное?', 'Составь план на неделю по этому разбору'],
    solfege: ['Объясни теорию этого урока проще', 'Как быстрее научиться слышать интервалы?'],
    train: ['Как не съезжать на мелодию?', 'Как выучить партию быстрее?'],
    warmup: ['Зачем нужна эта распевка?', 'Какие ошибки бывают в этом упражнении?'],
    breath: ['Что такое опора простыми словами?', 'Почему мне не хватает дыхания?'],
  };

  function context() {
    const mod = VG.views[VG.current];
    let c = '';
    try {
      c = mod && mod.context ? mod.context() : '';
    } catch (e) {
      c = '';
    }
    const p = VG.profile;
    const voice = p ? ' Диапазон ученика: ' + VG.nn(Math.round(p.lo)) + '–' + VG.nn(Math.round(p.hi)) + '.' : '';
    return (c + voice).trim();
  }

  function bubble(cls, text) {
    const b = el('div', 'msg ' + cls, text);
    $('teacher-log').appendChild(b);
    $('teacher-log').scrollTop = $('teacher-log').scrollHeight;
    return b;
  }

  function renderChips() {
    const box = $('teacher-chips');
    box.textContent = '';
    for (const q of CHIPS[VG.current] || CHIPS.default) {
      const c = el('button', 'chip', q);
      c.type = 'button';
      c.addEventListener('click', () => send(q));
      box.appendChild(c);
    }
  }

  function open() {
    $('teacher').hidden = false;
    renderChips();
    if (!T.turns.length && !$('teacher-log').children.length) {
      bubble('msg-teacher', 'Здравствуйте! Спросите что угодно про голос, технику или упражнение. Я вижу, в каком разделе вы сейчас, и учту это.');
    }
    $('teacher-input').focus();
  }

  const ERRORS = {
    not_granted: 'Вы не разрешили приложению обращаться к Claude. Разрешение можно включить в меню «Разрешения» этой страницы.',
    rate_limited: 'Слишком много вопросов подряд. Подождите минуту и спросите снова.',
    prompt_too_large: 'Разговор стал слишком длинным. Закройте окно и начните заново.',
    refused: 'На этот вопрос ответить не получилось. Попробуйте сформулировать иначе.',
  };

  async function send(text) {
    text = (text || '').trim();
    if (!text || !T.sample) return;
    if (T.busy) return;
    $('teacher-input').value = '';
    bubble('msg-user', text);
    const ctx = context();
    T.turns.push({ role: 'user', content: (ctx ? 'Где я сейчас: ' + ctx + '\n\n' : '') + text });
    const out = bubble('msg-teacher', 'Думаю…');
    T.busy = true;
    T.ctl = new AbortController();
    $('teacher-send').textContent = 'Стоп';
    try {
      const res = await T.sample([{ role: 'user', content: RULES }].concat(T.turns.slice(-12)), {
        cache: false,
        signal: T.ctl.signal,
        onText: ({ text: t }) => {
          out.textContent = t;
          $('teacher-log').scrollTop = $('teacher-log').scrollHeight;
        },
      });
      out.textContent = res.text;
      T.turns.push({ role: 'assistant', content: res.text });
    } catch (e) {
      out.textContent = (e && e.text) || '';
      if (!e || e.code !== 'cancelled') bubble('msg-error', (e && ERRORS[e.code]) || 'Не получилось получить ответ. Попробуйте ещё раз чуть позже.');
      if (!out.textContent) out.remove();
      T.turns.pop();
    } finally {
      T.busy = false;
      T.ctl = null;
      $('teacher-send').textContent = 'Спросить';
    }
  }

  function init() {
    $('teacher-close').addEventListener('click', () => ($('teacher').hidden = true));
    $('teacher-open').addEventListener('click', open);
    $('teacher-form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (T.busy) {
        if (T.ctl) T.ctl.abort();
        return;
      }
      send($('teacher-input').value);
    });
    $('teacher-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        $('teacher-form').requestSubmit();
      }
    });
    VG.on('route', renderChips);
    const c = window.claude;
    if (!c || typeof c.use !== 'function') return;
    c.use('sample')
      .then((s) => {
        if (!s) return;
        T.sample = s;
        $('teacher-open').hidden = false;
        VG.teacher = {
          available: true,
          ask(text) {
            open();
            send(text);
          },
        };
      })
      .catch(() => {});
  }

  VG.register('teacher-panel', { init });
})();
