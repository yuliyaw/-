/*
 * Второй голос — распевка и дыхание.
 */
(function () {
  'use strict';

  const VG = window.VG;
  const { M, engine, $, el, clamp } = VG;

  // ================= Распевка =================
  // pattern — ступени в полутонах от тоники; durs — длительности в долях.
  const WARMUPS = [
    {
      id: 'lip-trill',
      title: 'Губная трель',
      sub: '«брр» по пяти нотам · мягко',
      pattern: [0, 2, 4, 5, 7, 5, 4, 2, 0],
      dur: 0.5,
      bpm: 104,
      how: 'Сомкните губы свободно и выдувайте воздух так, чтобы они вибрировали, как у лошадки: «бррр». Голос звучит одновременно с трелью. Если трель обрывается, слегка придержите щёки указательными пальцами.',
      why: 'Губы создают сопротивление на выходе воздуха, и связкам становится легче: они смыкаются мягко и ровно. Самая бережная распевка, с неё удобно начинать.',
    },
    {
      id: 'hum',
      title: 'Мычание',
      sub: '«м-м» · мягко',
      pattern: [0, 2, 4, 2, 0],
      dur: 1,
      bpm: 92,
      how: 'Губы сомкнуты, зубы разомкнуты, язык лежит свободно. Мычите так, чтобы вибрация чувствовалась в губах и носу, а не в горле.',
      why: 'Мычание собирает звук «в маску» — вибрация ощущается в передней части лица — и разогревает голос почти без нагрузки.',
    },
    {
      id: 'siren',
      title: 'Сирена на «у»',
      sub: 'скольжение вверх и вниз',
      pattern: [0, 7, 12, 7, 0],
      dur: 1,
      bpm: 76,
      how: 'Пойте «у» и плавно скользите от ноты к ноте без разрывов, как сирена или как будто удивлённо тянете «у-у?». Не нажимайте на верх, пусть голос становится лёгким.',
      why: 'Плавно соединяет низ и верх голоса, помогает пройти переходные ноты без «щелчка».',
    },
    {
      id: 'vowels',
      title: 'Ми-мэ-ма-мо-му',
      sub: 'гласные на спуске',
      pattern: [7, 5, 4, 2, 0],
      dur: 1,
      bpm: 100,
      how: 'На каждую ноту — новый слог: ми, мэ, ма, мо, му. Рот меняет форму, а звук остаётся одинаково ярким и близким.',
      why: 'Учит не терять звук при смене гласных: «а» не проваливается вглубь, «и» не зажимается.',
    },
    {
      id: 'arpeggio',
      title: 'Арпеджио на «а»',
      sub: 'скачки по аккорду',
      pattern: [0, 4, 7, 12, 7, 4, 0],
      dur: 0.75,
      bpm: 100,
      how: 'Пойте «а» по звукам аккорда: до — ми — соль — до и обратно. Попадайте в каждую ноту сразу, без подъезда снизу.',
      why: 'Скачки учат точно попадать в ноту и держать опору на высоких звуках.',
    },
    {
      id: 'staccato',
      title: 'Стаккато «ха»',
      sub: 'отрывисто, опора',
      pattern: [0, 4, 7, 4, 0],
      dur: 0.5,
      staccato: true,
      bpm: 96,
      how: 'Короткие отрывистые звуки, как весёлый смех: «ха! ха! ха!». На каждом «ха» живот слегка толкается внутрь, горло остаётся свободным.',
      why: 'Включает опору: работают мышцы живота, связки смыкаются точно и коротко.',
    },
    {
      id: 'octave',
      title: 'Скачок на октаву',
      sub: '«а», вверх и гаммой вниз',
      pattern: [0, 12, 11, 9, 7, 5, 4, 2, 0],
      durs: [1, 1, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1],
      bpm: 96,
      how: 'Прыгните на октаву вверх лёгким звуком и спуститесь по гамме. Верхнюю ноту не толкайте, представьте, что она «падает» сверху.',
      why: 'Тренирует переход между грудным и головным звучанием (регистрами).',
    },
    {
      id: 'scale9',
      title: 'Гамма на «ла»',
      sub: '9 нот на одном дыхании · сложно',
      pattern: [0, 2, 4, 5, 7, 9, 11, 12, 14, 12, 11, 9, 7, 5, 4, 2, 0],
      dur: 0.5,
      bpm: 112,
      how: 'Пропойте всю фразу на одном дыхании, слог «ла» на каждую ноту. Звук ровный и на верху, и на низу.',
      why: 'Длинная фраза тренирует опору и ровность звука по всему диапазону.',
    },
  ];
  const ROUTINE = ['lip-trill', 'hum', 'siren', 'vowels', 'arpeggio'];

  const W = { cur: WARMUPS[0], roll: null, readout: null, session: null, routine: null, timer: null };

  function durs(w) {
    return w.durs || w.pattern.map(() => w.dur);
  }

  /** Собирает всю распевку: аккорд, фраза, пауза — и так по полутонам вверх и вниз. */
  function buildSession(w, short) {
    const c = VG.comfort();
    const pmin = Math.min(...w.pattern);
    const pmax = Math.max(...w.pattern);
    const startT = c.lo + 1 - pmin;
    let topT = Math.max(startT, c.hi - pmax);
    topT = Math.min(topT, startT + (short ? 4 : 7));
    const keys = [];
    for (let t = startT; t <= topT; t++) keys.push(t);
    for (let t = topT - 1; t >= startT; t--) keys.push(t);
    const ds = durs(w);
    const tempo = Number($('warm-tempo').value) / 100;
    const spb = 60 / (w.bpm * tempo);
    const events = [];
    const target = [];
    const guide = $('warm-guide').checked;
    let b = 0;
    for (const T of keys) {
      const root = T >= 60 ? T - 12 : T;
      events.push({ type: 'chord', midis: [root - 12, root, root + 4, root + 7], beat: b, dur: 1 });
      b += 1;
      w.pattern.forEach((p, i) => {
        let d = ds[i];
        if (i === w.pattern.length - 1) d *= 2;
        const len = w.staccato ? d * 0.5 : d;
        target.push({ midi: T + p, start: b, dur: len });
        if (guide) events.push({ type: 'note', bus: 'piano', timbre: 'piano', midi: T + p, beat: b, dur: len });
        b += d;
      });
      b += 1;
    }
    W.roll.setNotes({ target, guide: [], barLen: 0, length: b });
    W.roll.view = 0;
    return new VG.Session({ start: 0, end: b, spb, countBeats: 0, events, target, guide: null, range: W.roll.range, keys });
  }

  function renderInfo() {
    const w = W.cur;
    const box = $('warm-info');
    box.textContent = '';
    box.appendChild(el('h2', null, w.title));
    box.appendChild(el('p', null, w.how));
    box.appendChild(el('p', 'warm-why', w.why));
    for (const b of VG.qsa('#warm-list .warm-item')) b.setAttribute('aria-current', String(b.dataset.id === w.id));
  }

  function select(id) {
    stop(true);
    W.cur = WARMUPS.find((w) => w.id === id) || WARMUPS[0];
    renderInfo();
    buildSession(W.cur, false);
    W.roll.dirty = true;
    $('warm-status').textContent = '';
  }

  function play(short) {
    VG.audio();
    engine.setLevel('piano', 1);
    engine.stopOneShots();
    W.session = buildSession(W.cur, short).begin();
    W.roll.stats = W.session.stats;
    W.roll.trace = W.session.trace;
    W.roll.playing = true;
    setPlaying(true);
    $('warm-status').textContent = W.routine ? 'Комплекс: упражнение ' + (W.routine.i + 1) + ' из ' + ROUTINE.length + '.' : '';
    VG.keepAwake(true);
  }

  function setPlaying(on) {
    const b = $('warm-play');
    b.classList.toggle('is-playing', on);
    b.querySelector('.play-label').textContent = on ? 'Стоп' : 'Начать';
  }

  function stop(silent) {
    clearTimeout(W.timer);
    if (!W.session) {
      W.routine = null;
      return;
    }
    W.session.stop();
    const s = W.session;
    W.session = null;
    W.roll.playing = false;
    W.roll.live = null;
    W.roll.dirty = true;
    setPlaying(false);
    VG.keepAwake(false);
    if (!silent && s.seconds() > 10) logDone(s, false);
    W.routine = null;
  }

  function logDone(s, full) {
    const sc = s.micUsed ? s.score() : null;
    VG.journal.add({ kind: 'warmup', title: W.routine ? 'Комплекс: ' + W.cur.title : W.cur.title, score: sc ? sc.pct : null, sec: s.seconds() });
    $('warm-status').textContent =
      (full ? 'Готово.' : 'Остановлено.') + (sc ? ' Точность: ' + sc.pct + ' %.' : ' Включите микрофон, чтобы видеть точность.');
  }

  function finished() {
    const s = W.session;
    W.session = null;
    s.stop();
    W.roll.playing = false;
    W.roll.view = 0;
    W.roll.dirty = true;
    setPlaying(false);
    VG.keepAwake(false);
    if (W.routine) {
      VG.journal.add({ kind: 'warmup', title: 'Комплекс: ' + W.cur.title, score: s.micUsed && s.score() ? s.score().pct : null, sec: s.seconds() });
      W.routine.i++;
      if (W.routine.i < ROUTINE.length) {
        const next = WARMUPS.find((w) => w.id === ROUTINE[W.routine.i]);
        $('warm-status').textContent = 'Отдохните пару секунд. Следующее: ' + next.title + '.';
        W.cur = next;
        renderInfo();
        buildSession(next, true);
        W.timer = setTimeout(() => {
          if (W.routine && VG.current === 'warmup') play(true);
        }, 4000);
      } else {
        W.routine = null;
        $('warm-status').textContent = 'Комплекс распевки готов. Голос разогрет — можно переходить к технике или песне.';
      }
    } else {
      logDone(s, true);
    }
  }

  function frame(f) {
    const midi = f ? f.midi : null;
    let info = { tgt: null, cls: null, countdown: 0 };
    if (W.session) {
      info = W.session.update(f);
      W.roll.pos = W.session.pos;
      W.roll.live = info.cls;
      W.roll.dirty = true;
      if (W.session.ended) finished();
    } else {
      const i = VG.firstNoteFrom(W.roll.target, W.roll.view);
      info.tgt = i >= 0 ? W.roll.target[i].midi : null;
      info.cls = f ? VG.classify(midi, info.tgt, null, W.roll.range) : null;
      W.roll.live = info.cls;
      if (VG.mic.on) W.roll.dirty = true;
    }
    W.readout.update({
      tgt: info.tgt,
      midi,
      cls: info.cls,
      hint: VG.hintText({ playing: !!W.session, midi, tgt: info.tgt, cls: info.cls, idle: 'Нажмите «Начать» и пойте вместе с фортепиано.' }),
    });
    if (W.roll.dirty) W.roll.draw();
  }

  VG.register('warmup', {
    init() {
      const list = $('warm-list');
      for (const w of WARMUPS) {
        const b = el('button', 'warm-item');
        b.type = 'button';
        b.dataset.id = w.id;
        b.setAttribute('role', 'listitem');
        b.appendChild(el('b', null, w.title));
        b.appendChild(el('span', null, w.sub));
        b.addEventListener('click', () => select(w.id));
        list.appendChild(b);
      }
      W.roll = new VG.Roll($('warm-roll'));
      W.roll.enableDrag();
      W.readout = new VG.Readout($('warm-readout'));
      $('warm-mic-slot').replaceWith(VG.micButton());
      $('warm-play').addEventListener('click', () => (W.session ? stop(false) : play(false)));
      $('warm-routine').addEventListener('click', () => {
        stop(true);
        W.routine = { i: 0 };
        W.cur = WARMUPS.find((w) => w.id === ROUTINE[0]);
        renderInfo();
        play(true);
      });
      $('warm-tempo').addEventListener('input', (e) => ($('warm-tempo-val').textContent = e.target.value + ' %'));
      $('warm-guide').addEventListener('change', () => {
        if (!W.session) buildSession(W.cur, false);
      });
      VG.on('profile', () => {
        if (!W.session) buildSession(W.cur, false);
      });
      select(WARMUPS[0].id);
    },
    enter(params) {
      if (params && params.id === 'routine') {
        $('warm-routine').click();
      } else if (params && params.id) {
        select(params.id);
      } else {
        buildSession(W.cur, false);
      }
      W.roll.dirty = true;
    },
    leave() {
      stop(true);
    },
    frame,
    context() {
      return 'Раздел «Распевка». Упражнение: ' + W.cur.title + '. ' + W.cur.how;
    },
  });

  // ================= Дыхание =================
  const BREATHS = [
    {
      id: 'pace',
      title: 'Дыхание животом',
      sub: 'вдох 4 · выдох 6 · без микрофона',
      mic: false,
      text: [
        'Певческий вдох — низкий: воздух опускается вниз, живот и бока мягко расширяются, плечи не поднимаются.',
        'Положите ладонь на живот, другую — на грудь. На вдохе двигается нижняя ладонь, верхняя почти нет.',
        'Вдыхайте носом, пока круг растёт. Выдыхайте тонкой струйкой на «ф-ф-ф», пока круг сжимается. 6 циклов.',
      ],
    },
    {
      id: 'hiss',
      title: 'Долгий выдох «с-с-с»',
      sub: 'как долго и ровно хватает воздуха',
      mic: true,
      text: [
        'Сделайте низкий вдох и выдыхайте на «с-с-с» тонкой ровной струйкой, как будто сдувается шина.',
        'Не выталкивайте воздух — сдерживайте его, рёбра и бока остаются расширенными как можно дольше.',
        'Нажмите «Начать», секунду помолчите (программа слушает тишину), потом шипите. Цель — 20–30 секунд и ровная линия.',
      ],
    },
    {
      id: 'tone',
      title: 'Ровный долгий звук',
      sub: 'одна нота, без качания',
      mic: true,
      text: [
        'Программа даст удобную ноту. Сделайте вдох и тяните её на «а» или «у» как можно дольше, не меняя высоту и громкость.',
        'Линия высоты должна быть прямой, линия громкости — ровной. Остановитесь, как только звук начнёт дрожать или зажиматься: тянуть «до последнего» не нужно.',
      ],
    },
    {
      id: 'pulse',
      title: 'Толчки «ф! ф! ф!»',
      sub: 'опора в ритме метронома',
      mic: true,
      text: [
        'На каждый щелчок метронома делайте короткий резкий выдох «ф!». Живот на каждом толчке слегка подтягивается внутрь, грудь и плечи неподвижны.',
        'Между толчками вдох происходит сам. 16 толчков. Программа покажет, насколько вы попадаете в ритм.',
      ],
    },
    {
      id: 'messa',
      title: 'Филировка',
      sub: 'тихо → громко → тихо',
      mic: true,
      text: [
        'Тяните одну ноту на «а»: начните тихо, за 4 секунды плавно усильте звук, следующие 4 секунды так же плавно уменьшите до тишины.',
        'Ваша линия громкости должна идти за пунктирной. Высота при этом не меняется: на усилении звук не лезет вверх, на затихании не проваливается.',
      ],
    },
  ];

  const B = { cur: BREATHS[0], box: { w: 0, h: 0, dpr: 1 }, run: null, best: VG.store.get('vg.breath.v1', {}) || {} };

  function bSelect(id) {
    bStop(true);
    B.cur = BREATHS.find((b) => b.id === id) || BREATHS[0];
    const box = $('breath-text');
    box.textContent = '';
    box.appendChild(el('h2', null, B.cur.title));
    const ol = el('ul');
    for (const t of B.cur.text) ol.appendChild(el('li', null, t));
    box.appendChild(ol);
    for (const b of VG.qsa('#breath-list .warm-item')) b.setAttribute('aria-current', String(b.dataset.id === B.cur.id));
    renderStats(null);
    bDraw();
  }

  function stat(label, value) {
    const d = el('div');
    d.appendChild(el('span', 'label', label));
    d.appendChild(el('strong', 'ro-note', value));
    return d;
  }

  function renderStats(r) {
    const box = $('breath-stats');
    box.textContent = '';
    const best = B.best[B.cur.id];
    const id = B.cur.id;
    if (id === 'pace') {
      box.append(stat('Цикл', r ? r.cycle + ' из 6' : '—'), stat('Фаза', r ? r.phase : '—'), stat('Осталось', r ? r.left + ' с' : '—'));
    } else if (id === 'hiss') {
      box.append(
        stat('Выдох', r ? VG.fmt(r.dur, 1) + ' с' : '—'),
        stat('Ровность', r && r.even != null ? r.even : '—'),
        stat('Рекорд', best ? VG.fmt(best, 1) + ' с' : '—'),
      );
    } else if (id === 'tone') {
      box.append(
        stat('Звук', r ? VG.fmt(r.dur, 1) + ' с' : '—'),
        stat('Высота', r && r.pitch != null ? '±' + Math.round(r.pitch) + ' ц' : '—'),
        stat('Рекорд', best ? VG.fmt(best, 1) + ' с' : '—'),
      );
    } else if (id === 'pulse') {
      box.append(stat('Толчков', r ? r.count + ' из 16' : '—'), stat('В ритм', r && r.pct != null ? r.pct + ' %' : '—'), stat('Рекорд', best ? best + ' %' : '—'));
    } else {
      box.append(stat('Точность', r && r.pct != null ? r.pct + ' %' : '—'), stat('Высота', r && r.pitch != null ? '±' + Math.round(r.pitch) + ' ц' : '—'), stat('Рекорд', best ? best + ' %' : '—'));
    }
  }

  function bStart() {
    if (B.run) {
      bStop(false);
      return;
    }
    if (B.cur.mic && !VG.mic.on) {
      const n = VG.qs('#view-breath .mic-notice');
      n.textContent = 'Для этого упражнения нужен микрофон: нажмите «Микрофон».';
      n.hidden = false;
      return;
    }
    VG.audio();
    const now = engine.now;
    B.run = { id: B.cur.id, t0: now, pts: [], startedAt: Date.now(), result: null };
    const r = B.run;
    if (r.id === 'hiss') r.phase = 'quiet';
    if (r.id === 'tone' || r.id === 'messa') {
      const c = VG.comfort();
      r.note = Math.round(c.lo + (c.hi - c.lo) * 0.35);
      engine.playNotes(r.note, 1.2, { timbre: 'piano', bus: 'piano' });
      r.t0 = now + 1.4;
    }
    if (r.id === 'pulse') {
      r.spb = 60 / 80;
      r.run = engine.startRun();
      r.t0 = now + 0.3 + 4 * r.spb;
      for (let i = -4; i < 16; i++) r.run.click(r.t0 + i * r.spb, i % 4 === 0);
      r.hits = [];
      r.lastOn = false;
    }
    $('breath-go').textContent = 'Стоп';
    VG.keepAwake(true);
  }

  function bStop(silent) {
    const r = B.run;
    if (!r) return;
    if (r.run) r.run.stop();
    B.run = null;
    $('breath-go').textContent = 'Начать';
    VG.keepAwake(false);
    if (!silent) finishBreath(r);
  }

  function finishBreath(r) {
    const sec = Math.round((Date.now() - r.startedAt) / 1000);
    let score = null;
    let title = B.cur.title;
    const res = r.result;
    if (r.id === 'hiss' && res && res.dur > 1) {
      if (!B.best.hiss || res.dur > B.best.hiss) B.best.hiss = res.dur;
      title += ': ' + VG.fmt(res.dur, 1) + ' с';
    }
    if (r.id === 'tone' && res && res.dur > 1) {
      if (!B.best.tone || res.dur > B.best.tone) B.best.tone = res.dur;
      title += ': ' + VG.fmt(res.dur, 1) + ' с';
    }
    if ((r.id === 'pulse' || r.id === 'messa') && res && res.pct != null) {
      score = res.pct;
      if (!B.best[r.id] || res.pct > B.best[r.id]) B.best[r.id] = res.pct;
    }
    VG.store.set('vg.breath.v1', B.best);
    if (sec >= 5) VG.journal.add({ kind: 'breath', title, score, sec });
    renderStats(res);
  }

  function bFrame(f, dt) {
    const r = B.run;
    if (!r) {
      if (VG.mic.on) bDraw();
      return;
    }
    const now = engine.now;
    const t = now - r.t0;
    if (r.id === 'pace') {
      const cyc = 10;
      const cycle = Math.floor(Math.max(0, t) / cyc);
      const ph = Math.max(0, t) - cycle * cyc;
      r.phaseName = ph < 4 ? 'вдох' : 'выдох «ф»';
      r.level = ph < 4 ? ph / 4 : 1 - (ph - 4) / 6;
      r.result = { cycle: Math.min(6, cycle + 1), phase: r.phaseName, left: Math.ceil(ph < 4 ? 4 - ph : cyc - ph) };
      if (cycle >= 6) {
        bStop(false);
        return;
      }
      renderStatsThrottled(r.result);
    } else if (f) {
      r.pts.push({ t, db: f.dbFast, midi: f.midi });
      if (r.id === 'hiss') hissStep(r, f, t);
      else if (r.id === 'tone') toneStep(r, f, t);
      else if (r.id === 'pulse') pulseStep(r, f, t);
      else if (r.id === 'messa') messaStep(r, f, t);
    }
    bDraw();
  }

  let statsAt = 0;
  function renderStatsThrottled(res) {
    const n = performance.now();
    if (n - statsAt > 150) {
      statsAt = n;
      renderStats(res);
    }
  }

  function hissStep(r, f, t) {
    if (r.phase === 'quiet') {
      if (t > 1) {
        const q = r.pts.filter((p) => p.t <= 1).map((p) => p.db);
        r.thr = VG.V.median(q) + 12;
        r.phase = 'wait';
      }
      return;
    }
    const on = f.dbFast > r.thr;
    if (r.phase === 'wait' && on) {
      r.phase = 'hiss';
      r.hs = t;
      r.lastOn = t;
    } else if (r.phase === 'hiss') {
      if (on) r.lastOn = t;
      else if (t - r.lastOn > 0.35) {
        r.phase = 'done';
        r.result = hissResult(r);
        bStop(false);
        return;
      }
      r.result = hissResult(r);
      renderStatsThrottled(r.result);
    }
  }
  function hissResult(r) {
    const dur = (r.lastOn || r.hs) - r.hs;
    const seg = r.pts.filter((p) => p.t >= r.hs + 0.3 && p.t <= r.lastOn - 0.2).map((p) => p.db);
    const sd = seg.length > 10 ? VG.V.std(seg) : null;
    const even = sd == null ? null : sd < 2 ? 'отлично' : sd < 4 ? 'хорошо' : 'неровно';
    return { dur, even };
  }

  function toneStep(r, f, t) {
    if (t < 0) return;
    if (f.midi != null) {
      if (r.ts == null) r.ts = t;
      r.lastV = t;
    } else if (r.ts != null && t - r.lastV > 0.35) {
      r.result = toneResult(r);
      bStop(false);
      return;
    }
    if (r.ts != null) {
      r.result = toneResult(r);
      renderStatsThrottled(r.result);
    }
  }
  function toneResult(r) {
    const seg = r.pts.filter((p) => p.midi != null && p.t >= r.ts + 0.4);
    const cents = seg.map((p) => p.midi * 100);
    return { dur: (r.lastV || r.ts) - r.ts, pitch: cents.length > 10 ? VG.V.std(cents) : null };
  }

  function pulseStep(r, f, t) {
    const thr = (r.thr = r.thr || (r.pts.length > 20 ? VG.V.percentile(r.pts.slice(0, 20).map((p) => p.db), 50) + 14 : -40));
    const on = f.dbFast > thr;
    if (on && !r.lastOn && t > -r.spb * 0.5) r.hits.push(t);
    r.lastOn = on;
    const beats = r.hits.filter((h) => h > -0.3 && h < 16 * r.spb);
    let good = 0;
    for (let i = 0; i < 16; i++) if (beats.some((h) => Math.abs(h - i * r.spb) < 0.12)) good++;
    const done = Math.max(0, Math.min(16, Math.floor(t / r.spb) + 1));
    r.result = { count: Math.min(16, beats.length), pct: done ? Math.round((good / 16) * 100) : null };
    renderStatsThrottled(r.result);
    if (t > 16 * r.spb + 0.4) bStop(false);
  }

  const messaTarget = (t) => (t < 0 ? 0 : t < 4 ? t / 4 : t < 8 ? 1 - (t - 4) / 4 : 0);
  function messaStep(r, f, t) {
    if (t > 8.6) {
      const pts = r.pts.filter((p) => p.t >= 0 && p.t <= 8);
      const loud = pts.map((p) => p.db);
      const top = VG.V.percentile(loud, 95);
      const floor = top - 30;
      let err = 0;
      for (const p of pts) err += Math.abs(clamp((p.db - floor) / 30, 0, 1) - messaTarget(p.t));
      const voiced = pts.filter((p) => p.midi != null).map((p) => p.midi * 100);
      r.result = { pct: pts.length ? Math.max(0, Math.round(100 - (err / pts.length) * 200)) : null, pitch: voiced.length > 10 ? VG.V.std(voiced) : null };
      bStop(false);
    }
  }

  function bDraw() {
    const c = $('breath-canvas');
    const g = c.getContext('2d');
    const { w, h, dpr } = B.box;
    if (!w) return;
    const C = VG.COL;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = C['roll-bg'];
    g.fillRect(0, 0, w, h);
    const r = B.run;
    const id = B.cur.id;
    g.font = '500 13px ' + VG.FONT_BODY;
    g.textBaseline = 'middle';
    if (id === 'pace') {
      const lvl = r ? r.level : 0.3;
      const rad = 20 + lvl * (Math.min(w, h) / 2 - 30);
      g.fillStyle = C.tint;
      g.beginPath();
      g.arc(w / 2, h / 2, Math.min(w, h) / 2 - 10, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = C.voice2;
      g.globalAlpha = 0.85;
      g.beginPath();
      g.arc(w / 2, h / 2, rad, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = C['on-voice2'];
      g.textAlign = 'center';
      g.font = '600 16px ' + VG.FONT_BODY;
      if (r) g.fillText(r.phaseName, w / 2, h / 2);
      return;
    }
    // временной график громкости (и высоты для «тона»)
    const span = id === 'pulse' ? 16 * 0.75 + 1 : id === 'messa' ? 9 : 30;
    const pts = r ? r.pts : VG.mic.on ? VG.mic.recent(4).map((f) => ({ t: f.t - engine.now + 4, db: f.dbFast, midi: f.midi })) : [];
    const tNow = r ? engine.now - r.t0 : 4;
    const t0 = id === 'pulse' || id === 'messa' ? (id === 'pulse' ? -3 : -0.5) : Math.max(0, tNow - span);
    const x = (t) => 10 + ((t - t0) / span) * (w - 20);
    const dbTop = -10;
    const dbBot = -75;
    const y = (db) => 10 + ((dbTop - clamp(db, dbBot, dbTop)) / (dbTop - dbBot)) * (h - 30);
    g.fillStyle = C.line;
    g.fillRect(10, h - 20, w - 20, 1);
    g.fillStyle = C.muted;
    g.textAlign = 'left';
    g.font = '11px ' + VG.FONT_MONO;
    for (let s = Math.ceil(t0); s <= t0 + span; s += id === 'hiss' || id === 'tone' ? 5 : 1) {
      if (s < 0) continue;
      g.fillRect(x(s), h - 22, 1, 4);
      g.fillText(s + ' с', x(s) + 3, h - 9);
    }
    if (id === 'pulse' && r) {
      for (let i = 0; i < 16; i++) {
        g.fillStyle = C.line;
        g.fillRect(x(i * r.spb), 10, 1, h - 30);
      }
      for (const hit of r.hits) {
        const good = [...Array(16).keys()].some((i) => Math.abs(hit - i * r.spb) < 0.12);
        g.fillStyle = good ? C.good : C.bad;
        g.beginPath();
        g.arc(x(hit), 26, 6, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (id === 'messa') {
      g.strokeStyle = C.muted;
      g.setLineDash([5, 5]);
      g.lineWidth = 2;
      g.beginPath();
      for (let s = 0; s <= 8; s += 0.1) {
        const v = messaTarget(s);
        const yy = h - 20 - v * (h - 40);
        if (s === 0) g.moveTo(x(s), yy);
        else g.lineTo(x(s), yy);
      }
      g.stroke();
      g.setLineDash([]);
    }
    if (r && r.thr != null && (id === 'hiss' || id === 'pulse')) {
      g.fillStyle = C.warn;
      g.globalAlpha = 0.6;
      g.fillRect(10, y(r.thr), w - 20, 1);
      g.globalAlpha = 1;
    }
    g.lineWidth = 2;
    g.strokeStyle = C.voice2;
    g.beginPath();
    let first = true;
    let top = -Infinity;
    if (id === 'messa' && r) top = VG.V.percentile(r.pts.filter((p) => p.t > 0).map((p) => p.db), 95) || -20;
    for (const p of pts) {
      if (p.t < t0) continue;
      const yy = id === 'messa' && r ? h - 20 - clamp((p.db - (top - 30)) / 30, 0, 1) * (h - 40) : y(p.db);
      if (first) g.moveTo(x(p.t), yy);
      else g.lineTo(x(p.t), yy);
      first = false;
    }
    g.stroke();
    if (id === 'tone' && r && r.ts != null) {
      const seg = r.pts.filter((p) => p.midi != null);
      const med = VG.V.median(seg.map((p) => p.midi)) || 0;
      g.strokeStyle = C.good;
      g.fillStyle = C.muted;
      g.fillText('высота (±50 центов)', 14, 18);
      g.beginPath();
      first = true;
      for (const p of seg) {
        if (p.t < t0) continue;
        const yy = h / 2 - clamp((p.midi - med) * 100, -50, 50) * ((h - 60) / 100);
        if (first) g.moveTo(x(p.t), yy);
        else g.lineTo(x(p.t), yy);
        first = false;
      }
      g.stroke();
    }
    if (r && r.id === 'hiss' && r.phase === 'quiet') {
      g.fillStyle = C.ink;
      g.textAlign = 'center';
      g.font = '600 15px ' + VG.FONT_BODY;
      g.fillText('Тишина… слушаю фон', w / 2, h / 2);
    }
  }

  VG.register('breath', {
    init() {
      const list = $('breath-list');
      for (const b of BREATHS) {
        const btn = el('button', 'warm-item');
        btn.type = 'button';
        btn.dataset.id = b.id;
        btn.setAttribute('role', 'listitem');
        btn.appendChild(el('b', null, b.title));
        btn.appendChild(el('span', null, b.sub));
        btn.addEventListener('click', () => bSelect(b.id));
        list.appendChild(btn);
      }
      $('breath-mic-slot').replaceWith(VG.micButton());
      $('breath-go').addEventListener('click', bStart);
      VG.watchCanvas($('breath-canvas'), B.box, bDraw);
      VG.on('colors', bDraw);
      bSelect('pace');
    },
    enter(params) {
      bSelect(params && params.id ? params.id : B.cur.id);
    },
    leave() {
      bStop(true);
    },
    frame: bFrame,
    context() {
      return 'Раздел «Дыхание и опора». Упражнение: ' + B.cur.title + '. ' + B.cur.text.join(' ');
    },
  });
})();
