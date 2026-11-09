/*
 * Второй голос — раздел «Техника EVT»: уроки, анимированные схемы,
 * модель голоса, шкалы по микрофону и сравнение «А / Б».
 */
(function () {
  'use strict';

  const VG = window.VG;
  const { engine, $, el, clamp } = VG;
  const { GROUPS, LESSONS } = window.EVT;
  const V = VG.V;

  const state = VG.store.get('vg.evt.v1', { done: [] }) || { done: [] };
  if (!Array.isArray(state.done)) state.done = [];
  const saveState = () => VG.store.set('vg.evt.v1', state);

  const E = {
    lesson: LESSONS[0],
    variant: null,
    diagram: null,
    box: { w: 0, h: 0, dpr: 1 },
    t0: 0,
    meters: [],
    ab: { a: null, b: null, capturing: null, start: 0 },
    events: { last: 0, list: [], target: 'smooth' },
    enteredAt: Date.now(),
    meterAt: 0,
  };

  // ================= Навигация =================
  function renderNav() {
    const nav = $('evt-nav');
    nav.textContent = '';
    const sel = el('select', 'lesson-select');
    sel.id = 'evt-select';
    sel.setAttribute('aria-label', 'Урок');
    for (const g of GROUPS) {
      nav.appendChild(el('p', 'nav-cap', g.title));
      const box = el('div', 'evt-group');
      const og = document.createElement('optgroup');
      og.label = g.title;
      for (const l of LESSONS.filter((x) => x.group === g.id)) {
        const b = el('button', 'evt-link' + (state.done.includes(l.id) ? ' is-done' : ''));
        b.type = 'button';
        b.appendChild(el('span', null, l.title));
        b.appendChild(el('span', 'done-dot'));
        b.setAttribute('aria-current', String(l.id === E.lesson.id));
        b.addEventListener('click', () => open(l.id));
        box.appendChild(b);
        const o = el('option', null, (state.done.includes(l.id) ? '✓ ' : '') + l.title);
        o.value = l.id;
        og.appendChild(o);
      }
      nav.appendChild(box);
      sel.appendChild(og);
    }
    sel.value = E.lesson.id;
    sel.addEventListener('change', () => open(sel.value));
    nav.prepend(sel);
  }

  // ================= Урок =================
  function blocks(parent, body) {
    for (const b of body) {
      if (typeof b === 'string') parent.appendChild(el('p', null, b));
      else if (b.h) parent.appendChild(el('h3', null, b.h));
      else if (b.analogy) parent.appendChild(el('p', 'analogy', b.analogy));
      else if (b.list) {
        const ul = el('ul');
        for (const x of b.list) ul.appendChild(el('li', null, x));
        parent.appendChild(ul);
      }
    }
  }

  function section(title) {
    const s = el('section', 'panel lesson-section');
    s.appendChild(el('h3', null, title));
    return s;
  }

  function open(id) {
    const l = LESSONS.find((x) => x.id === id) || LESSONS[0];
    logTime();
    E.lesson = l;
    E.enteredAt = Date.now();
    E.ab = { a: null, b: null, capturing: null, start: 0 };
    E.events = { last: engine.now, list: [], target: 'smooth' };
    const main = $('evt-main');
    main.textContent = '';

    const head = el('header', 'lesson-head');
    head.appendChild(el('p', 'lesson-kicker', GROUPS.find((g) => g.id === l.group).title));
    head.appendChild(el('h2', null, l.title));
    head.appendChild(el('p', 'lesson-lead', l.lead));
    main.appendChild(head);

    // схема или модель качества
    if (l.diagram) {
      const sec = el('section', 'panel diagram');
      const cv = document.createElement('canvas');
      cv.setAttribute('role', 'img');
      cv.setAttribute('aria-label', l.diagram.caption);
      sec.appendChild(cv);
      const side = el('div', 'diagram-side');
      const list = el('div', 'variant-list');
      for (const v of l.diagram.variants) {
        const b = el('button', 'variant');
        b.type = 'button';
        b.dataset.id = v.id;
        b.appendChild(el('b', null, v.name));
        b.appendChild(el('span', null, v.sub));
        b.addEventListener('click', () => pickVariant(v, true));
        list.appendChild(b);
      }
      side.appendChild(list);
      side.appendChild(el('p', 'diagram-caption', l.diagram.caption));
      if (l.diagram.kind === 'folds') {
        const lg = el('div', 'legend fold-legend');
        for (const [cls, t] of [
          ['lg-fold', 'голосовые связки'],
          ['lg-tissue', 'ложные связки'],
          ['lg-ring', 'край воронки'],
          ['lg-air', 'воздух'],
        ]) lg.appendChild(el('span', 'lg ' + cls, t));
        side.appendChild(lg);
        side.appendChild(el('p', 'diagram-caption', 'Колебания на схеме замедлены примерно в 200 раз.'));
      }
      if (l.diagram.variants.some((v) => v.demo)) {
        side.appendChild(el('p', 'diagram-caption', 'Нажмите вариант, чтобы увидеть его и услышать на упрощённой компьютерной модели голоса. Модель звучит не как живой человек, но разницу передаёт.'));
      }
      sec.appendChild(side);
      main.appendChild(sec);
      E.diagram = { kind: l.diagram.kind, canvas: cv };
      E.box = { w: 0, h: 0, dpr: 1 };
      VG.watchCanvas(cv, E.box);
      pickVariant(l.diagram.variants[0], false);
    } else {
      E.diagram = null;
      const sec = el('section', 'panel lesson-section');
      sec.appendChild(el('h3', null, 'Рецепт'));
      const wrap = el('div', 'table-scroll');
      const table = el('table', 'recipe');
      for (const [k, v] of l.recipe) {
        const tr = el('tr');
        tr.appendChild(el('th', null, k));
        tr.appendChild(el('td', null, v));
        table.appendChild(tr);
      }
      wrap.appendChild(table);
      sec.appendChild(wrap);
      const foot = el('div', 'lesson-foot');
      foot.style.marginTop = '12px';
      foot.appendChild(VG.button('Послушать на модели голоса', '', () => engine.demoVoice(Object.assign({ dur: 2 }, l.demo))));
      foot.appendChild(el('span', 'muted', 'Упрощённая компьютерная модель: передаёт характер, но не звучит как человек.'));
      sec.appendChild(foot);
      main.appendChild(sec);
    }

    const body = section('Простыми словами');
    const bodyInner = el('div', 'lesson-body');
    blocks(bodyInner, l.body);
    body.appendChild(bodyInner);
    main.appendChild(body);

    if (l.find && l.find.length) {
      const s = section('Найдите у себя');
      const ol = el('ol', 'lesson-body');
      for (const f of l.find) ol.appendChild(el('li', null, f));
      s.appendChild(ol);
      main.appendChild(s);
    }

    if (l.check) main.appendChild(checkSection(l.check));

    if ((l.mistakes && l.mistakes.length) || l.safety) {
      const s = section('Частые ошибки');
      if (l.mistakes && l.mistakes.length) {
        const ul = el('ul', 'lesson-body');
        for (const m of l.mistakes) ul.appendChild(el('li', null, m));
        s.appendChild(ul);
      }
      if (l.safety) s.appendChild(el('p', 'lesson-warn', 'Осторожно: ' + l.safety));
      main.appendChild(s);
    }

    const foot = el('div', 'lesson-foot');
    const isDone = state.done.includes(l.id);
    const doneBtn = VG.button(isDone ? 'Пройдено ✓' : 'Отметить как пройденный', isDone ? '' : 'btn-primary', () => {
      if (!state.done.includes(l.id)) {
        state.done.push(l.id);
        saveState();
        VG.journal.add({ kind: 'evt', title: l.title, sec: Math.min(900, Math.round((Date.now() - E.enteredAt) / 1000)) });
        E.enteredAt = Date.now();
      }
      doneBtn.textContent = 'Пройдено ✓';
      doneBtn.classList.remove('btn-primary');
      renderNav();
    });
    foot.appendChild(doneBtn);
    const idx = LESSONS.indexOf(l);
    if (idx > 0) foot.appendChild(VG.button('← ' + LESSONS[idx - 1].title, 'btn-ghost', () => open(LESSONS[idx - 1].id)));
    if (idx < LESSONS.length - 1) foot.appendChild(VG.button(LESSONS[idx + 1].title + ' →', 'btn-ghost', () => open(LESSONS[idx + 1].id)));
    main.appendChild(foot);

    renderNav();
    if (VG.current === 'evt') window.scrollTo(0, 0);
  }

  function logTime() {
    // время на уроке без отметки «пройдено» тоже идёт в дневник, если больше 2 минут
    const sec = Math.round((Date.now() - E.enteredAt) / 1000);
    if (E.lesson && sec >= 120 && VG.current === 'evt') {
      VG.journal.add({ kind: 'evt', title: E.lesson.title, sec: Math.min(900, sec) });
    }
  }

  function pickVariant(v, play) {
    E.variant = v;
    E.t0 = performance.now() / 1000;
    for (const b of VG.qsa('#evt-main .variant')) b.setAttribute('aria-pressed', String(b.dataset.id === v.id));
    if (play && v.demo) {
      engine.stopOneShots();
      engine.demoVoice(Object.assign({ dur: 1.6 }, v.demo));
    }
  }

  // ================= Проверка по микрофону =================
  const METERS = {
    closure: {
      name: 'Смыкание',
      min: -10,
      max: 22,
      unit: ' дБ',
      digits: 1,
      key: 'h1h2',
      segs: [
        [-10, 0, 'плотно'],
        [0, 10, 'сбалансированно'],
        [10, 22, 'с воздухом'],
      ],
      scale: ['плотно', 'середина', 'воздух'],
      hint: 'Разница основного тона и первого обертона (H1–H2).',
    },
    clarity: {
      name: 'Чистота тона',
      min: 70,
      max: 100,
      unit: ' %',
      key: 'clarity',
      mul: 100,
      segs: [
        [70, 88, 'много шума'],
        [88, 95, 'немного воздуха'],
        [95, 100, 'чистый тон'],
      ],
      scale: ['шум', '', 'чисто'],
    },
    ring: {
      name: 'Звонкость',
      min: -40,
      max: -5,
      unit: ' дБ',
      key: 'ring',
      segs: [
        [-40, -27, 'мягко'],
        [-27, -17, 'немного звона'],
        [-17, -5, 'звонко'],
      ],
      scale: ['мягко', '', 'звон, твэнг'],
      hint: 'Энергия в полосе 2–4 кГц по сравнению с 0–2 кГц.',
    },
    centroid: {
      name: 'Яркость',
      min: Math.log(300),
      max: Math.log(3000),
      key: 'centroid',
      log: true,
      unit: ' Гц',
      segs: [
        [Math.log(300), Math.log(700), 'темнее'],
        [Math.log(700), Math.log(1400), 'средне'],
        [Math.log(1400), Math.log(3000), 'светлее'],
      ],
      scale: ['темно', '', 'светло'],
    },
    loud: {
      name: 'Громкость',
      min: -60,
      max: -5,
      key: 'db',
      unit: ' дБ',
      segs: [
        [-60, -38, 'тихо'],
        [-38, -20, 'средне'],
        [-20, -5, 'громко'],
      ],
      scale: ['тихо', '', 'громко'],
      voicedOnly: false,
    },
  };

  function gauge(kind) {
    const m = METERS[kind];
    const box = el('div', 'gauge');
    const top = el('div', 'gauge-top');
    top.appendChild(el('span', 'label', m.name));
    const word = el('span', 'gauge-word', '—');
    top.appendChild(word);
    box.appendChild(top);
    const value = el('span', 'gauge-value', '—');
    box.appendChild(value);
    const track = el('div', 'gauge-track');
    m.segs.forEach((s, i) => {
      const seg = el('div', 'gauge-seg');
      seg.style.left = ((s[0] - m.min) / (m.max - m.min)) * 100 + '%';
      seg.style.right = 100 - ((s[1] - m.min) / (m.max - m.min)) * 100 + '%';
      seg.style.background = i === 1 ? 'var(--voice2)' : 'var(--voice1)';
      seg.style.opacity = i === 1 ? '0.25' : '0.2';
      track.appendChild(seg);
    });
    const needle = el('div', 'gauge-needle');
    needle.hidden = true;
    track.appendChild(needle);
    box.appendChild(track);
    const sc = el('div', 'gauge-scale');
    for (const s of m.scale) sc.appendChild(el('span', null, s));
    box.appendChild(sc);
    if (m.hint) box.appendChild(el('span', 'muted', m.hint)).style.fontSize = '12px';
    return {
      el: box,
      update(frames) {
        const src = m.voicedOnly === false ? frames : frames.filter((f) => f.midi != null);
        const xs = src.map((f) => f[m.key]).filter((x) => x != null && isFinite(x));
        if (xs.length < 4) {
          needle.hidden = true;
          value.textContent = '—';
          word.textContent = '—';
          return;
        }
        let v = V.median(xs) * (m.mul || 1);
        const pos = m.log ? Math.log(Math.max(1, v)) : v;
        needle.hidden = false;
        needle.style.left = clamp(((pos - m.min) / (m.max - m.min)) * 100, 0, 100) + '%';
        value.textContent = VG.fmt(v, m.digits || 0) + m.unit;
        const s = m.segs.find((g) => pos >= g[0] && pos < g[1]) || (pos < m.min ? m.segs[0] : m.segs[m.segs.length - 1]);
        word.textContent = s[2];
      },
    };
  }

  function pitchGauge() {
    const box = el('div', 'gauge');
    const top = el('div', 'gauge-top');
    top.appendChild(el('span', 'label', 'Нота'));
    const word = el('span', 'gauge-word', '—');
    top.appendChild(word);
    box.appendChild(top);
    const value = el('span', 'gauge-value', '—');
    box.appendChild(value);
    box.appendChild(el('span', 'muted', 'Насколько ровно держится высота за последнюю секунду.')).style.fontSize = '12px';
    return {
      el: box,
      isPitch: true,
      update(frames) {
        const v = frames.filter((f) => f.midi != null);
        if (v.length < 6) {
          value.textContent = '—';
          word.textContent = '—';
          return;
        }
        const m = V.median(v.map((f) => f.midi));
        const sd = V.std(v.map((f) => f.midi * 100));
        value.textContent = VG.nn(m) + ' · ±' + Math.round(sd) + ' ц';
        word.textContent = sd < 10 ? 'ровно' : sd < 25 ? 'немного плавает' : 'качается';
      },
    };
  }

  const EVENT_NAMES = { glottal: 'твёрдое', aspirate: 'придыхательное', smooth: 'мягкое', noise: 'без тона' };

  function eventsBox(kind) {
    const box = el('div', 'gauge');
    box.style.gridColumn = '1 / -1';
    const top = el('div', 'gauge-top');
    top.appendChild(el('span', 'label', kind === 'onset' ? 'Атаки звука' : 'Окончания звука'));
    box.appendChild(top);
    const chips = el('div', 'chips');
    chips.setAttribute('role', 'radiogroup');
    chips.setAttribute('aria-label', 'Что тренируем');
    for (const t of ['glottal', 'aspirate', 'smooth']) {
      const c = el('button', 'chip', 'Тренирую: ' + EVENT_NAMES[t]);
      c.type = 'button';
      c.setAttribute('role', 'radio');
      c.setAttribute('aria-checked', String(E.events.target === t));
      c.addEventListener('click', () => {
        E.events.target = t;
        for (const x of chips.children) x.setAttribute('aria-checked', String(x === c));
        render();
      });
      chips.appendChild(c);
    }
    box.appendChild(chips);
    const log = el('ul', 'onset-log');
    box.appendChild(log);
    const sum = el('p', 'muted');
    sum.style.margin = '0';
    box.appendChild(sum);
    const render = () => {
      log.textContent = '';
      const list = E.events.list.filter((e) => e.kind === kind).slice(-8);
      if (!list.length) log.appendChild(el('li', null, 'пока ничего — пойте короткие звуки с паузами'));
      for (const e of list) {
        const li = el('li', e.type === E.events.target ? 'is-match' : '', EVENT_NAMES[e.type] || e.type);
        li.title = kind === 'onset' ? 'воздух до тона: ' + Math.round((e.air || 0) * 1000) + ' мс' : '';
        log.appendChild(li);
      }
      const all = E.events.list.filter((e) => e.kind === kind);
      const hit = all.filter((e) => e.type === E.events.target).length;
      sum.textContent = all.length ? 'Совпало ' + hit + ' из ' + all.length + '.' : '';
    };
    render();
    return { el: box, update() {}, render, events: true };
  }

  function checkSection(check) {
    const s = section('Проверка по микрофону');
    const p = el('p', 'lesson-body', check.text);
    s.appendChild(p);
    const tools = el('div', 'transport');
    tools.style.marginTop = '0';
    tools.style.marginBottom = '12px';
    tools.appendChild(VG.micButton());
    s.appendChild(tools);
    const notice = el('p', 'notice mic-notice');
    notice.hidden = true;
    notice.setAttribute('role', 'alert');
    s.appendChild(notice);
    const grid = el('div', 'meters');
    E.meters = [];
    for (const k of check.meters) {
      let g;
      if (k === 'pitch') g = pitchGauge();
      else if (k === 'onset' || k === 'offset') g = eventsBox(k);
      else g = gauge(k);
      grid.appendChild(g.el);
      E.meters.push(g);
    }
    s.appendChild(grid);
    if (check.ab) s.appendChild(abBox(check.ab));
    VG.updateMicUI();
    return s;
  }

  // ---------- Сравнение «А / Б» ----------
  const AB_ROWS = [
    ['Нота', (x) => (x.midi != null ? VG.nn(x.midi) : '—')],
    ['Смыкание (H1–H2)', (x) => (x.h1h2 != null ? VG.fmt(x.h1h2, 1) + ' дБ' : '—')],
    ['Чистота тона', (x) => (x.clarity != null ? Math.round(x.clarity * 100) + ' %' : '—')],
    ['Звонкость', (x) => (x.ring != null ? VG.fmt(x.ring, 1) + ' дБ' : '—')],
    ['Яркость', (x) => (x.centroid != null ? Math.round(x.centroid) + ' Гц' : '—')],
  ];
  const AB_THR = { h1h2: 2.5, clarity: 0.015, ring: 3, centroid: 0.08 };

  function abBox(ab) {
    const box = el('div');
    box.style.marginTop = '14px';
    box.appendChild(el('h3', null, 'Сравните два варианта'));
    const grid = el('div', 'ab');
    const cells = {};
    for (const side of ['a', 'b']) {
      const c = el('div', 'ab-cell');
      c.appendChild(el('span', 'label', side === 'a' ? 'Вариант А' : 'Вариант Б'));
      c.appendChild(el('b', null, ab[side]));
      const btn = VG.button(side === 'a' ? 'Записать А' : 'Записать Б', 'btn-small', () => capture(side));
      c.appendChild(btn);
      const dl = el('dl', 'ab-values');
      c.appendChild(dl);
      grid.appendChild(c);
      cells[side] = { c, btn, dl };
    }
    box.appendChild(grid);
    const verdict = el('p', 'ab-verdict', 'Нажмите «Записать А», спойте вариант А две секунды, потом так же вариант Б.');
    box.appendChild(verdict);
    E.abUI = { cells, verdict, cfg: ab };
    return box;
  }

  function capture(side) {
    if (!VG.mic.on) {
      E.abUI.verdict.textContent = 'Сначала включите микрофон.';
      return;
    }
    E.ab.capturing = side;
    E.ab.start = engine.now;
    E.abUI.cells[side].btn.textContent = 'Пойте… 2 с';
    E.abUI.cells[side].btn.disabled = true;
  }

  function abStep() {
    const ab = E.ab;
    if (!ab.capturing || !E.abUI) return;
    const left = 2 - (engine.now - ab.start);
    const side = ab.capturing;
    const ui = E.abUI.cells[side];
    if (left > 0) {
      ui.btn.textContent = 'Пойте… ' + Math.ceil(left) + ' с';
      return;
    }
    ab.capturing = null;
    ui.btn.disabled = false;
    ui.btn.textContent = side === 'a' ? 'Записать А заново' : 'Записать Б заново';
    const frames = VG.mic.history.filter((f) => f.t >= ab.start + 0.3);
    const snap = V.snapshot(frames);
    if (!snap) {
      E.abUI.verdict.textContent = 'Не услышал звука. Спойте громче или ближе к микрофону и запишите ещё раз.';
      return;
    }
    ab[side] = snap;
    ui.c.classList.add('is-set');
    ui.dl.textContent = '';
    for (const [k, f] of AB_ROWS) {
      ui.dl.appendChild(el('dt', null, k));
      ui.dl.appendChild(el('dd', null, f(snap)));
    }
    if (ab.a && ab.b) judge();
    else E.abUI.verdict.textContent = side === 'a' ? 'Теперь запишите вариант Б.' : 'Теперь запишите вариант А.';
  }

  function judge() {
    const cfg = E.abUI.cfg;
    const a = E.ab.a[cfg.metric];
    const b = E.ab.b[cfg.metric];
    if (a == null || b == null) {
      E.abUI.verdict.textContent = 'Не удалось сравнить: в одном из вариантов не было ясного тона.';
      return;
    }
    let ok;
    if (cfg.metric === 'centroid') {
      const r = b / a;
      const thr = AB_THR.centroid;
      ok = cfg.expect === 'b>a' ? r > 1 + thr : cfg.expect === 'a>b' ? r < 1 - thr : Math.abs(r - 1) < thr * 1.5;
    } else {
      const d = b - a;
      const thr = AB_THR[cfg.metric];
      ok = cfg.expect === 'b>a' ? d > thr : cfg.expect === 'a>b' ? -d > thr : Math.abs(d) < thr * 1.5;
    }
    E.abUI.verdict.textContent = ok ? cfg.ok : cfg.no;
    E.abUI.verdict.style.color = ok ? 'var(--good)' : 'var(--warn)';
    if (ok) VG.journal.add({ kind: 'evt', title: E.lesson.title + ': сравнение А/Б', score: 100, sec: 20 });
  }

  // ---------- Атаки и окончания в реальном времени ----------
  function eventsStep() {
    const hasEvents = E.meters.some((m) => m.events);
    if (!hasEvents || !VG.mic.on) return;
    const now = engine.now;
    const frames = VG.mic.history;
    if (frames.length < 30) return;
    const floor = V.percentile(frames.map((f) => f.dbFast), 10);
    const thr = Math.max(floor + 12, -62);
    const ev = V.detectEvents(frames, thr);
    let changed = false;
    for (const o of ev.onsets) {
      if (o.t > E.events.last && o.t < now - 0.5) {
        E.events.list.push(Object.assign({ kind: 'onset' }, o));
        E.events.last = Math.max(E.events.last, o.t);
        changed = true;
      }
    }
    for (const o of ev.offsets) {
      if (o.t > (E.events.lastOff || 0) && o.t < now - 0.3) {
        E.events.list.push(Object.assign({ kind: 'offset' }, o));
        E.events.lastOff = o.t;
        changed = true;
      }
    }
    if (changed) for (const m of E.meters) if (m.render) m.render();
  }

  // ================= Схемы =================
  const MASS = {
    thick: { A: 0.15, cq: 0.55, w: 0.17 },
    thin: { A: 0.11, cq: 0.3, w: 0.085 },
    stiff: { A: 0.05, cq: 0, w: 0.07, gap: 0.05 },
    slack: { A: 0.2, cq: 0.7, w: 0.21, irregular: true },
    pressed: { A: 0.08, cq: 0.82, w: 0.21 },
  };
  const VIS_HZ = 1.3;
  const OPEN = { post: 0.3, open: 0.17 };

  function vib(m, t, amp) {
    const rate = m.irregular ? 0.75 + 0.25 * Math.sin(t * 2.3) : VIS_HZ;
    const ph = (t * rate) % 1;
    const of = 1 - m.cq;
    const o = ph < of ? Math.sin((Math.PI * ph) / of) : 0;
    return { post: m.gap ? m.gap * 0.6 : 0, open: (m.gap || 0) + m.A * o * (amp == null ? 1 : amp), w: m.w };
  }
  const mix = (a, b, k) => ({ post: a.post + (b.post - a.post) * k, open: a.open + (b.open - a.open) * k, w: (a.w || 0.12) + ((b.w || 0.12) - (a.w || 0.12)) * k });
  const ramp = (x, a, b) => clamp((x - a) / (b - a), 0, 1);

  function foldState(p, t) {
    const m = MASS[p.mass || 'thick'];
    const closed = { post: 0, open: 0, w: m.w };
    const pressed = { post: 0, open: 0, w: 0.21 };
    let s;
    let air = 0;
    let flash = null;
    if (p.mode === 'breath') {
      s = Object.assign({ w: 0.12 }, OPEN);
      air = 1;
    } else if (p.mode === 'whisper') {
      s = { post: 0.09, open: 0.015, w: 0.12 };
      air = 0.8;
    } else if (p.mode === 'onset') {
      const tau = t % 3;
      if (tau < 0.4) s = mix(Object.assign({ w: 0.12 }, OPEN), Object.assign({ w: 0.12 }, OPEN), 0);
      if (p.onset === 'glottal') {
        if (tau >= 0.4 && tau < 0.9) s = mix(Object.assign({ w: 0.12 }, OPEN), pressed, ramp(tau, 0.4, 0.6));
        if (tau >= 0.9 && tau < 2.6) {
          s = vib(MASS.thick, tau - 0.9);
          if (tau < 1.05) flash = 'щелчок';
          air = 0.4;
        }
      } else if (p.onset === 'aspirate') {
        if (tau >= 0.4 && tau < 1.2) {
          s = mix(Object.assign({ w: 0.12 }, OPEN), { post: 0.11, open: 0.05, w: 0.15 }, ramp(tau, 0.4, 0.6));
          air = 1;
          if (tau > 0.6) flash = 'х-х';
        }
        if (tau >= 1.2 && tau < 2.6) {
          s = vib(MASS.thick, tau - 1.2, 0.5 + 0.5 * ramp(tau, 1.2, 1.6));
          air = 0.5;
        }
      } else {
        if (tau >= 0.4 && tau < 0.85) s = mix(Object.assign({ w: 0.12 }, OPEN), { post: 0.01, open: 0.01, w: m.w }, ramp(tau, 0.4, 0.85));
        if (tau >= 0.85 && tau < 2.6) {
          s = vib(MASS.thick, tau - 0.85, ramp(tau, 0.85, 1.3));
          air = 0.3;
        }
      }
      if (tau >= 2.6) s = mix(vib(MASS.thick, 0), Object.assign({ w: 0.12 }, OPEN), ramp(tau, 2.6, 2.9));
    } else if (p.mode === 'offset') {
      const tau = t % 3.4;
      if (tau < 0.3) s = mix(Object.assign({ w: 0.12 }, OPEN), closed, ramp(tau, 0, 0.3));
      else if (tau < 1.8) {
        s = vib(MASS.thick, tau - 0.3);
        air = 0.4;
      } else if (p.offset === 'glottal') {
        s = tau < 2.5 ? pressed : mix(pressed, Object.assign({ w: 0.12 }, OPEN), ramp(tau, 2.5, 2.8));
        if (tau < 2.0) flash = 'стоп';
      } else if (p.offset === 'aspirate') {
        s = mix(closed, { post: 0.14, open: 0.07, w: 0.15 }, ramp(tau, 1.8, 2.0));
        air = tau < 2.7 ? 1 : 0.3;
        if (tau < 2.6) flash = 'х-х';
      } else {
        s = tau < 2.6 ? vib(MASS.thick, tau - 0.3, 1 - ramp(tau, 1.8, 2.5)) : mix(closed, Object.assign({ w: 0.12 }, OPEN), ramp(tau, 2.6, 3.0));
      }
    } else {
      s = vib(m, t);
      air = s.open > 0.02 ? 0.45 : 0.05;
      if (p.mass === 'stiff') air = 0.85;
    }
    return { s, air, flash };
  }

  function drawFolds(g, w, h, p, t) {
    const C = VG.COL;
    const u = Math.min(w / 2.5, h / 2.25);
    const cx = w / 2;
    const cy = h / 2 + u * 0.05;
    const { s, air, flash } = foldState(p, t);
    // просвет гортани
    g.fillStyle = C.tissue;
    g.globalAlpha = 0.28;
    g.beginPath();
    g.ellipse(cx, cy, u * 1.05, u * 0.98, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    // край воронки (черпалонадгортанные складки)
    const aes = p.aes === 'narrow' ? 0.66 : 0.9;
    g.lineWidth = u * (p.aes === 'narrow' ? 0.09 : 0.06);
    g.strokeStyle = p.aes ? (p.aes === 'narrow' ? C.voice2 : C.skin) : C.skin;
    g.globalAlpha = p.aes ? 1 : 0.5;
    g.beginPath();
    g.ellipse(cx, cy + u * 0.05, u * 0.8 * aes, u * 0.86 * (p.aes === 'narrow' ? 0.8 : 1), 0, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 1;
    // надгортанник
    g.strokeStyle = C.tissue;
    g.lineWidth = u * 0.13;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx - u * 0.55, cy - u * 0.62);
    g.quadraticCurveTo(cx, cy - u * 1.05, cx + u * 0.55, cy - u * 0.62);
    g.stroke();
    // черпаловидные хрящи
    const post = s.post * u;
    for (const sgn of [-1, 1]) {
      g.fillStyle = C.tissue;
      g.beginPath();
      g.arc(cx + sgn * (u * 0.2 + post), cy + u * 0.66, u * 0.13, 0, Math.PI * 2);
      g.fill();
    }
    // ложные связки
    const fvfOff = { retract: 0.42, mid: 0.3, constrict: 0.13 }[p.fvf || 'mid'];
    g.strokeStyle = C.tissue;
    g.lineWidth = u * 0.17;
    for (const sgn of [-1, 1]) {
      g.globalAlpha = p.fvf ? 0.95 : 0.7;
      g.beginPath();
      g.moveTo(cx + sgn * u * 0.05, cy - u * 0.5);
      g.quadraticCurveTo(cx + sgn * u * (fvfOff + 0.12), cy, cx + sgn * (u * (fvfOff * 0.6 + 0.12) + post), cy + u * 0.52);
      g.stroke();
    }
    g.globalAlpha = 1;
    // голосовая щель и связки
    const A = { x: cx, y: cy - u * 0.56 };
    const yP = cy + u * 0.52;
    const open = s.open * u;
    const fw = (s.w || 0.12) * u;
    g.fillStyle = C.airway;
    g.beginPath();
    g.moveTo(A.x, A.y);
    g.quadraticCurveTo(cx - open * 2, cy, cx - post - u * 0.02, yP);
    g.lineTo(cx + post + u * 0.02, yP);
    g.quadraticCurveTo(cx + open * 2, cy, A.x, A.y);
    g.fill();
    // воздух
    if (air > 0) {
      g.fillStyle = C.air;
      const n = Math.round(14 * air);
      for (let i = 0; i < n; i++) {
        const k = (i * 0.618 + t * 0.9) % 1;
        const yy = yP - k * (yP - A.y);
        const span = Math.max(0, (open * 2 * Math.sin(Math.PI * k) + (post + u * 0.02) * (k)) * 0.8);
        const xx = cx + Math.sin(i * 12.9898 + Math.floor(t * 3)) * span * 0.6;
        if (span > u * 0.008 || p.mode === 'breath') {
          g.globalAlpha = 0.5 + 0.5 * Math.sin(Math.PI * k);
          g.beginPath();
          g.arc(xx, yy, u * 0.025, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.globalAlpha = 1;
    }
    for (const sgn of [-1, 1]) {
      g.fillStyle = C.fold;
      g.beginPath();
      g.moveTo(A.x, A.y);
      g.quadraticCurveTo(cx + sgn * open * 2, cy, cx + sgn * (post + u * 0.02), yP);
      g.lineTo(cx + sgn * (post + u * 0.02 + fw * 0.8), yP);
      g.quadraticCurveTo(cx + sgn * (open * 2 + fw * 2), cy, A.x + sgn * u * 0.02, A.y);
      g.closePath();
      g.fill();
      g.strokeStyle = C.skin;
      g.lineWidth = 1;
      g.stroke();
    }
    if (flash) {
      g.fillStyle = C.voice2;
      g.font = '600 ' + Math.round(u * 0.14) + 'px ' + VG.FONT_BODY;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(flash, cx + u * 0.5, cy);
    }
    // подписи
    g.font = '500 ' + Math.round(clamp(u * 0.1, 10, 13)) + 'px ' + VG.FONT_BODY;
    g.fillStyle = C.muted;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillText('спереди (кадык)', cx, Math.max(14, cy - u * 1.02));
    g.textBaseline = 'bottom';
    g.fillText('сзади', cx, h - 6);
  }

  function drawSide(g, w, h, p, t) {
    const C = VG.COL;
    const s = Math.min(w / 400, h / 300);
    const ox = (w - 400 * s) / 2;
    const oy = (h - 300 * s) / 2;
    g.save();
    g.translate(ox, oy);
    g.scale(s, s);
    const hl = (part) => p.highlight === part;
    const lineCol = C.skin;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const jaw = p.jaw != null ? p.jaw : 0.35;
    const lar = p.larynx || 0;
    const lips = p.lips || 'mid';
    const lipDx = lips === 'protrude' ? -9 : lips === 'spread' ? 4 : 0;
    const ang = (jaw * 15 * Math.PI) / 180;
    const pivot = { x: 232, y: 118 };
    const rot = (x, y) => {
      const dx = x - pivot.x;
      const dy = y - pivot.y;
      return [pivot.x + dx * Math.cos(ang) - dy * Math.sin(ang), pivot.y + dx * Math.sin(ang) + dy * Math.cos(ang)];
    };
    // голова: лоб, нос, верхняя губа; затылок и шея
    g.strokeStyle = lineCol;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(150, 8);
    g.bezierCurveTo(122, 10, 106, 38, 110, 62);
    g.lineTo(104, 74);
    g.lineTo(80, 104);
    g.quadraticCurveTo(86, 114, 100, 116);
    g.lineTo(101, 124);
    g.stroke();
    g.beginPath();
    g.moveTo(150, 8);
    g.bezierCurveTo(232, 0, 304, 24, 312, 92);
    g.bezierCurveTo(318, 140, 300, 170, 282, 192);
    g.lineTo(276, 300);
    g.stroke();
    // губы
    g.strokeStyle = hl('lips') ? C.voice2 : C.tissue;
    g.lineWidth = hl('lips') ? 7 : 6;
    g.beginPath();
    g.moveTo(101, 124);
    g.quadraticCurveTo(92 + lipDx, 128, 96 + lipDx, 136);
    g.stroke();
    // челюсть с нижней губой и подбородком
    const jp = [
      [96 + lipDx, 144],
      [98, 152],
      [100, 172],
      [112, 192],
      [140, 198],
      [178, 206],
    ].map(([x, y]) => rot(x, y));
    g.strokeStyle = hl('jaw') ? C.voice2 : lineCol;
    g.lineWidth = hl('jaw') ? 3.5 : 2;
    g.beginPath();
    g.moveTo(jp[1][0], jp[1][1]);
    g.bezierCurveTo(jp[2][0], jp[2][1], jp[3][0], jp[3][1], jp[4][0], jp[4][1]);
    g.lineTo(jp[5][0], jp[5][1]);
    g.lineTo(184, 232);
    g.lineTo(188, 300);
    g.stroke();
    g.strokeStyle = hl('lips') ? C.voice2 : C.tissue;
    g.lineWidth = hl('lips') ? 7 : 6;
    g.beginPath();
    g.moveTo(jp[0][0], jp[0][1]);
    g.lineTo(jp[1][0] + 3, jp[1][1]);
    g.stroke();
    // зубы и твёрдое нёбо
    g.strokeStyle = lineCol;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(104, 124);
    g.lineTo(196, 120);
    g.stroke();
    // носовая полость
    g.lineWidth = 1.5;
    g.globalAlpha = 0.7;
    g.beginPath();
    g.moveTo(100, 112);
    g.quadraticCurveTo(112, 92, 150, 90);
    g.lineTo(212, 92);
    g.quadraticCurveTo(232, 98, 238, 112);
    g.stroke();
    g.globalAlpha = 1;
    // задняя стенка глотки
    g.beginPath();
    g.moveTo(238, 104);
    g.bezierCurveTo(246, 150, 244, 200, 242, 262);
    g.stroke();
    // мягкое нёбо
    const vel = { high: [234, 108], mid: [228, 128], low: [218, 146] }[p.velum || 'mid'];
    g.strokeStyle = hl('velum') ? C.voice2 : C.tissue;
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(196, 120);
    g.quadraticCurveTo(214, 120, vel[0], vel[1]);
    g.stroke();
    // язык
    const tH = { high: 108, mid: 126, low: 146 }[p.tongue || 'mid'] + jaw * 10;
    const tip = rot(112, 148);
    g.fillStyle = hl('tongue') ? C.voice2 : C.tissue;
    g.globalAlpha = hl('tongue') ? 0.85 : 0.75;
    g.beginPath();
    g.moveTo(tip[0], tip[1]);
    g.bezierCurveTo(140, tH - 6, 196, tH - 10, 214, 168);
    g.quadraticCurveTo(222, 188, 214, 208 - lar * 18);
    g.lineTo(196, 206 - lar * 10);
    const fl = rot(132, 172);
    g.quadraticCurveTo(160, 196, fl[0], fl[1]);
    g.closePath();
    g.fill();
    g.globalAlpha = 1;
    // гортань
    const dy = -lar * 20;
    g.save();
    g.translate(0, dy);
    const larHl = hl('larynx');
    // надгортанник
    g.strokeStyle = C.tissue;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(214, 212);
    g.quadraticCurveTo(212, 196, 222, 190);
    g.stroke();
    // щитовидный хрящ
    g.save();
    if (p.thyroid === 'tilt') {
      g.translate(232, 246);
      g.rotate((-13 * Math.PI) / 180);
      g.translate(-232, -246);
    }
    g.fillStyle = hl('thyroid') || larHl ? C.voice2 : C.skin;
    g.globalAlpha = hl('thyroid') || larHl ? 0.8 : 0.35;
    g.beginPath();
    g.moveTo(200, 214);
    g.lineTo(234, 214);
    g.lineTo(234, 246);
    g.lineTo(206, 250);
    g.quadraticCurveTo(196, 232, 200, 214);
    g.fill();
    g.globalAlpha = 1;
    // связки внутри
    g.strokeStyle = hl('folds') ? C.voice2 : C.fold;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(206, 236);
    g.lineTo(234, 234);
    g.stroke();
    g.restore();
    // перстневидный хрящ
    g.save();
    if (p.cricoid === 'tilt') {
      g.translate(206, 256);
      g.rotate((14 * Math.PI) / 180);
      g.translate(-206, -256);
    }
    g.fillStyle = hl('cricoid') || larHl ? C.voice2 : C.skin;
    g.globalAlpha = hl('cricoid') || larHl ? 0.8 : 0.35;
    VG.roundRect(g, 204, 250, 32, 12, 5);
    g.fill();
    g.globalAlpha = 1;
    g.restore();
    // трахея
    g.strokeStyle = lineCol;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(206, 262);
    g.lineTo(208, 320);
    g.moveTo(234, 262);
    g.lineTo(236, 320);
    g.stroke();
    g.restore();
    // путь звука
    g.strokeStyle = C.air;
    g.lineWidth = 2;
    g.setLineDash([5, 6]);
    g.lineDashOffset = -t * 30;
    g.beginPath();
    g.moveTo(220, 234 + dy);
    g.bezierCurveTo(232, 190, 232, 160, 210, 150);
    g.bezierCurveTo(170, 140 + jaw * 8, 130, 140 + jaw * 10, 84, 140 + jaw * 8);
    g.stroke();
    if (p.velum === 'low' || p.velum === 'mid') {
      g.globalAlpha = p.velum === 'low' ? 1 : 0.5;
      g.beginPath();
      g.moveTo(230, 150);
      g.bezierCurveTo(236, 110, 214, 100, 160, 100);
      g.lineTo(84, 108);
      g.stroke();
      g.globalAlpha = 1;
    }
    g.setLineDash([]);
    // подпись выделенной детали
    const LABELS = {
      thyroid: ['щитовидный хрящ', 250, 228 + dy],
      cricoid: ['перстневидный хрящ', 250, 258 + dy],
      larynx: ['гортань', 250, 240 + dy],
      velum: ['мягкое нёбо', 246, 140],
      tongue: ['язык', 150, tH + 14],
      jaw: ['челюсть', 70, 200],
      lips: ['губы', 58, 140],
    };
    const lab = LABELS[p.highlight];
    if (lab) {
      g.fillStyle = C.voice2;
      g.font = '600 13px ' + VG.FONT_BODY;
      g.textAlign = lab[1] < 100 ? 'right' : 'left';
      g.textBaseline = 'middle';
      g.fillText(lab[0], lab[1] < 100 ? lab[1] + 14 : lab[1], lab[2]);
    }
    g.restore();
  }

  function drawBody(g, w, h, p) {
    const C = VG.COL;
    const s = Math.min(w / 320, h / 300);
    g.save();
    g.translate((w - 320 * s) / 2, (h - 300 * s) / 2);
    g.scale(s, s);
    g.strokeStyle = C.skin;
    g.lineWidth = 2;
    g.fillStyle = C['roll-alt'];
    // голова, шея, корпус
    g.beginPath();
    g.ellipse(160, 46, 30, 36, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(146, 80);
    g.lineTo(144, 106);
    g.lineTo(80, 122);
    g.quadraticCurveTo(64, 128, 66, 150);
    g.lineTo(78, 290);
    g.lineTo(242, 290);
    g.lineTo(254, 150);
    g.quadraticCurveTo(256, 128, 240, 122);
    g.lineTo(176, 106);
    g.lineTo(174, 80);
    g.closePath();
    g.fill();
    g.stroke();
    // руки
    g.beginPath();
    g.moveTo(66, 150);
    g.lineTo(46, 270);
    g.moveTo(254, 150);
    g.lineTo(274, 270);
    g.stroke();
    g.fillStyle = C.voice2;
    g.globalAlpha = 0.55;
    if (p.anchor === 'neck') {
      for (const sgn of [-1, 1]) {
        g.beginPath();
        g.moveTo(160 + sgn * 6, 78);
        g.quadraticCurveTo(160 + sgn * 22, 96, 160 + sgn * 46, 116);
        g.lineTo(160 + sgn * 30, 118);
        g.quadraticCurveTo(160 + sgn * 14, 100, 160 + sgn * 2, 84);
        g.fill();
      }
    }
    if (p.anchor === 'torso') {
      for (const sgn of [-1, 1]) {
        g.beginPath();
        g.moveTo(160 + sgn * 80, 140);
        g.quadraticCurveTo(160 + sgn * 92, 200, 160 + sgn * 64, 262);
        g.lineTo(160 + sgn * 40, 250);
        g.quadraticCurveTo(160 + sgn * 70, 200, 160 + sgn * 60, 146);
        g.fill();
      }
      g.globalAlpha = 0.3;
      for (let y = 150; y <= 220; y += 18) {
        g.fillRect(110, y, 100, 5);
      }
    }
    g.globalAlpha = 1;
    g.fillStyle = C.voice2;
    g.font = '600 13px ' + VG.FONT_BODY;
    g.textBaseline = 'middle';
    if (p.anchor === 'neck') {
      g.textAlign = 'left';
      g.fillText('мышцы шеи и затылка', 212, 96);
    }
    if (p.anchor === 'torso') {
      g.textAlign = 'left';
      g.fillText('широчайшие', 258, 200);
      g.textAlign = 'center';
      g.fillText('межрёберные', 160, 238);
    }
    g.restore();
  }

  function drawDiagram() {
    if (!E.diagram || !E.variant) return;
    const g = E.diagram.canvas.getContext('2d');
    const { w, h, dpr } = E.box;
    if (!w || !h) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = VG.COL['roll-bg'];
    g.fillRect(0, 0, w, h);
    const t = performance.now() / 1000 - E.t0;
    const p = E.variant.params || {};
    if (E.diagram.kind === 'folds') drawFolds(g, w, h, p, t);
    else if (E.diagram.kind === 'side') drawSide(g, w, h, p, t);
    else drawBody(g, w, h, p);
  }

  // ================= Кадр =================
  function frame() {
    drawDiagram();
    if (VG.mic.on) {
      const n = performance.now();
      if (n - E.meterAt > 120) {
        E.meterAt = n;
        const recent = VG.mic.recent(0.7);
        const longer = VG.mic.recent(1.0);
        for (const m of E.meters) m.update(m.isPitch ? longer : recent);
        eventsStep();
      }
      abStep();
    }
  }

  VG.register('evt', {
    spectrum: true,
    init() {
      renderNav();
      open(LESSONS[0].id);
    },
    enter(params) {
      if (params && params.id) open(params.id);
      E.enteredAt = Date.now();
    },
    leave() {
      logTime();
      engine.stopOneShots();
    },
    frame,
    /** Следующий урок для плана дня. */
    next() {
      const l = LESSONS.find((x) => !state.done.includes(x.id)) || LESSONS[LESSONS.length - 1];
      return { id: l.id, title: l.title };
    },
    context() {
      return 'Раздел «Техника EVT», урок «' + E.lesson.title + '». ' + E.lesson.lead;
    },
  });
})();
