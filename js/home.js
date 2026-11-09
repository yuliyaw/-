/*
 * Второй голос — «Сегодня»: самочувствие голоса, урок дня, прогресс,
 * а также замер диапазона и типа голоса.
 */
(function () {
  'use strict';

  const VG = window.VG;
  const { M, $, el } = VG;

  const CHECKIN = {
    good: { text: 'Отлично! Занимайтесь по плану ниже.', plan: 'full' },
    tired: {
      text: 'Сегодня мягкий день: дыхание, губная трель и мычание на тихом звуке, сольфеджио. Без громких и высоких упражнений, не дольше 15 минут.',
      plan: 'light',
    },
    hoarse: {
      text: 'Голосу нужен покой: сегодня без пения. Можно тренировать слух, читать теорию EVT и разбирать старые записи. Если осиплость держится больше двух недель, покажитесь ЛОР-фониатру.',
      plan: 'rest',
      alert: true,
    },
    pain: {
      text: 'Не пойте сегодня: боль — сигнал остановиться. Если болит больше пары дней или больно глотать, обратитесь к врачу, лучше к ЛОР-фониатру.',
      plan: 'rest',
      alert: true,
    },
  };

  const KIND_TITLES = {
    breath: 'Дыхание',
    warmup: 'Распевка',
    evt: 'Техника EVT',
    solfege: 'Сольфеджио',
    harmony: 'Второй голос',
    analysis: 'Разбор вокала',
    range: 'Замер диапазона',
  };

  function todayCheckin() {
    const e = VG.journal.last('checkin');
    return e && VG.dayKey(e.ts) === VG.dayKey(Date.now()) ? e.state : null;
  }

  function renderCheckin() {
    const state = todayCheckin();
    for (const c of VG.qsa('#checkin-chips .chip')) c.setAttribute('aria-checked', String(c.dataset.state === state));
    const adv = $('checkin-advice');
    const info = CHECKIN[state];
    adv.textContent = info ? info.text : 'Отметьте, как звучит голос. От этого зависит, сколько и как заниматься сегодня.';
    adv.classList.toggle('is-alert', !!(info && info.alert));
    if (info && info.alert) {
      adv.appendChild(document.createTextNode(' '));
      const a = el('a', null, 'Как беречь голос');
      a.href = '#health';
      adv.appendChild(a);
    }
  }

  function plan() {
    const state = todayCheckin();
    const mode = state ? CHECKIN[state].plan : 'full';
    const evt = VG.views.evt && VG.views.evt.next ? VG.views.evt.next(mode === 'full') : null;
    const sol = VG.views.solfege && VG.views.solfege.next ? VG.views.solfege.next(mode !== 'rest') : null;
    const items = [];
    if (mode !== 'rest') {
      items.push({ kind: 'breath', title: 'Дыхание', what: 'Долгий выдох на «с-с-с» и ровный звук', min: 3, go: 'breath', param: 'hiss' });
      items.push(
        mode === 'light'
          ? { kind: 'warmup', title: 'Мягкая распевка', what: 'Губная трель и мычание, тихо', min: 4, go: 'warmup', param: 'lip-trill' }
          : { kind: 'warmup', title: 'Распевка', what: 'Комплекс на 5 минут', min: 5, go: 'warmup', param: 'routine' },
      );
    }
    if (evt) items.push({ kind: 'evt', title: 'Техника EVT', what: evt.title, min: 7, go: 'evt', param: evt.id });
    if (sol) items.push({ kind: 'solfege', title: 'Сольфеджио', what: sol.title, min: 5, go: 'solfege', param: sol.id });
    if (mode === 'full') {
      const song = VG.settings.songId && window.SongLibrary.find((s) => s.id === VG.settings.songId);
      items.push({ kind: 'harmony', title: 'Второй голос', what: song ? song.title : 'Песня или упражнение', min: 7, go: 'train' });
      const lastAn = VG.journal.last('analysis');
      if (!lastAn || Date.now() - lastAn.ts > 7 * 864e5 || VG.dayKey(lastAn.ts) === VG.dayKey(Date.now())) {
        items.push({ kind: 'analysis', title: 'Разбор вокала', what: 'Раз в неделю: запишите куплет и посмотрите, что изменилось', min: 3, go: 'analysis' });
      }
    }
    if (mode === 'rest') items.push({ kind: 'health', title: 'Голос и здоровье', what: 'Что помогает голосу восстановиться', min: 3, go: 'health' });
    return items;
  }

  function renderPlan() {
    const list = $('plan-list');
    list.textContent = '';
    const today = VG.journal.today();
    const items = plan();
    let done = 0;
    items.forEach((it, i) => {
      const isDone = today.some((e) => e.kind === it.kind);
      if (isDone) done++;
      const li = el('li', 'plan-item' + (isDone ? ' is-done' : ''));
      li.appendChild(el('span', 'plan-mark', isDone ? '✓' : String(i + 1)));
      const what = el('div', 'plan-what');
      what.appendChild(el('b', null, it.title));
      what.appendChild(el('span', null, it.what + ' · ~' + it.min + ' мин'));
      li.appendChild(what);
      const b = VG.button(isDone ? 'Ещё раз' : 'Начать', isDone ? 'btn-small btn-ghost' : 'btn-small', () => VG.go(it.go, it.param ? { id: it.param } : null));
      li.appendChild(b);
      list.appendChild(li);
    });
    $('plan-progress').textContent = done + ' из ' + items.length;
  }

  function renderVoice() {
    const box = $('myvoice');
    box.textContent = '';
    const p = VG.profile;
    if (p) {
      const t = VG.VOICE_TYPES.find((x) => x.id === p.type);
      const name = t ? t.name : '';
      box.appendChild(el('p', 'voice-type', name ? name[0].toUpperCase() + name.slice(1) : '—'));
      box.appendChild(el('p', null, 'Диапазон: ' + VG.nn(Math.round(p.lo)) + ' — ' + VG.nn(Math.round(p.hi)) + ' (' + Math.round(p.hi - p.lo) + ' ' + VG.plural(Math.round(p.hi - p.lo), 'полутон', 'полутона', 'полутонов') + ')'));
      const bar = el('div', 'voice-range-bar');
      const fill = el('div', 'voice-range-fill');
      const lo = 36;
      const hi = 88;
      fill.style.left = ((p.lo - lo) / (hi - lo)) * 100 + '%';
      fill.style.right = ((hi - p.hi) / (hi - lo)) * 100 + '%';
      bar.appendChild(fill);
      box.appendChild(bar);
      const scale = el('div', 'voice-range-scale');
      for (const m of [36, 48, 60, 72, 84]) scale.appendChild(el('span', null, VG.nn(m)));
      box.appendChild(scale);
      const when = new Date(p.at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
      box.appendChild(el('p', 'muted', 'Измерено ' + when + '. Повторяйте замер раз в месяц.'));
      box.appendChild(VG.button('Измерить заново', '', () => VG.go('range')));
    } else {
      box.appendChild(el('p', null, 'Диапазон ещё не измерен. Замер займёт минуту: программа найдёт вашу нижнюю и верхнюю ноту и подберёт тональности под вас.'));
      box.appendChild(VG.button('Измерить диапазон', 'btn-primary', () => VG.go('range')));
      const f = el('label', 'field');
      f.style.marginTop = '12px';
      f.appendChild(el('span', 'label', 'Пока без замера мой голос'));
      const sel = document.createElement('select');
      sel.id = 'voice-default';
      for (const [v, t] of [
        ['high', 'высокий (женский, детский)'],
        ['low', 'низкий (мужской)'],
      ]) {
        const o = el('option', null, t);
        o.value = v;
        sel.appendChild(o);
      }
      sel.value = VG.settings.voice;
      sel.addEventListener('change', () => {
        VG.settings.voice = sel.value;
        VG.saveSettings();
      });
      f.htmlFor = 'voice-default';
      f.appendChild(sel);
      box.appendChild(f);
    }
  }

  // ---------- Прогресс ----------
  const chart = { box: { w: 0, h: 0, dpr: 1 }, bars: [], hover: -1 };

  function renderProgress() {
    const days = VG.journal.byDay();
    const streak = VG.journal.streak();
    let week = 0;
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const v = days.get(VG.dayKey(d.getTime()));
      if (v) week += v.sec;
    }
    const total = VG.journal.list.filter((e) => e.kind !== 'checkin').length;
    const row = $('stat-row');
    row.textContent = '';
    const stat = (num, cap) => {
      const s = el('div', 'stat');
      s.appendChild(el('span', 'stat-num', String(num)));
      s.appendChild(el('span', 'stat-cap', cap));
      row.appendChild(s);
    };
    stat(streak, VG.plural(streak, 'день', 'дня', 'дней') + ' подряд');
    stat(Math.round(week / 60), 'минут за неделю');
    stat(total, VG.plural(total, 'занятие', 'занятия', 'занятий') + ' всего');

    chart.bars = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const v = days.get(VG.dayKey(d.getTime()));
      chart.bars.push({ date: d, min: v ? v.sec / 60 : 0, n: v ? v.n : 0 });
    }
    drawChart();

    const ul = $('recent-list');
    ul.textContent = '';
    const recent = VG.journal.list.filter((e) => e.kind !== 'checkin').slice(-5).reverse();
    if (!recent.length) {
      ul.appendChild(el('li', 'muted', 'Здесь появятся ваши занятия: что делали и с каким результатом.'));
    }
    for (const e of recent) {
      const li = el('li');
      li.appendChild(el('span', null, (KIND_TITLES[e.kind] || '') + (e.title ? ': ' + e.title : '')));
      const when = new Date(e.ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
      li.appendChild(el('span', 'num', (e.score != null ? e.score + ' % · ' : '') + when));
      ul.appendChild(li);
    }
  }

  function drawChart() {
    const c = $('activity-chart');
    const g = c.getContext('2d');
    const { w, h, dpr } = chart.box;
    if (!w) return;
    const C = VG.COL;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const left = 28;
    const bottom = h - 18;
    const top = 8;
    const max = Math.max(10, ...chart.bars.map((b) => b.min));
    const step = max > 40 ? 20 : 10;
    const yMax = Math.ceil(max / step) * step;
    const y = (v) => bottom - (v / yMax) * (bottom - top);
    g.font = '10px ' + VG.FONT_MONO;
    g.textBaseline = 'middle';
    g.textAlign = 'right';
    for (let v = 0; v <= yMax; v += step) {
      g.fillStyle = C.line;
      g.fillRect(left, Math.round(y(v)), w - left, 1);
      g.fillStyle = C.muted;
      g.fillText(String(v), left - 6, y(v));
    }
    const slot = (w - left) / chart.bars.length;
    const bw = Math.max(4, Math.min(22, slot - 6));
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    chart.bars.forEach((b, i) => {
      const x = left + slot * i + (slot - bw) / 2;
      b.x0 = left + slot * i;
      b.x1 = b.x0 + slot;
      if (b.min > 0) {
        const top2 = y(b.min);
        const hh = Math.max(2, bottom - top2);
        g.fillStyle = C.voice2;
        g.globalAlpha = chart.hover >= 0 && chart.hover !== i ? 0.55 : 1;
        VG.roundRect(g, x, bottom - hh, bw, hh + 4, 4);
        g.save();
        g.beginPath();
        g.rect(x - 1, top - 1, bw + 2, bottom - top + 1);
        g.clip();
        VG.roundRect(g, x, bottom - hh, bw, hh + 4, 4);
        g.fill();
        g.restore();
        g.globalAlpha = 1;
      }
      const isToday = i === chart.bars.length - 1;
      if (isToday || i % 2 === 1 || slot > 30) {
        g.fillStyle = isToday ? C.ink : C.muted;
        g.font = (isToday ? '600 ' : '') + '10px ' + VG.FONT_MONO;
        g.fillText(isToday ? 'сег.' : String(b.date.getDate()), x + bw / 2, h - 4);
      }
    });
    if (chart.hover >= 0) {
      const b = chart.bars[chart.hover];
      const text =
        b.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) + ': ' +
        (b.min ? Math.max(1, Math.round(b.min)) + ' мин, ' + b.n + ' ' + VG.plural(b.n, 'занятие', 'занятия', 'занятий') : 'без занятий');
      g.font = '500 12px ' + VG.FONT_BODY;
      const tw = g.measureText(text).width + 16;
      const tx = Math.min(w - tw, Math.max(left, (b.x0 + b.x1) / 2 - tw / 2));
      g.fillStyle = C.surface;
      g.strokeStyle = C.line;
      VG.roundRect(g, tx, 0, tw, 22, 6);
      g.fill();
      g.stroke();
      g.fillStyle = C.ink;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(text, tx + 8, 11);
    }
  }

  function bindChart() {
    const c = $('activity-chart');
    VG.watchCanvas(c, chart.box, drawChart);
    const pick = (e) => {
      const r = c.getBoundingClientRect();
      const x = e.clientX - r.left;
      const i = chart.bars.findIndex((b) => x >= b.x0 && x < b.x1);
      if (i !== chart.hover) {
        chart.hover = i;
        drawChart();
      }
    };
    c.addEventListener('pointermove', pick);
    c.addEventListener('pointerdown', pick);
    c.addEventListener('pointerleave', () => {
      chart.hover = -1;
      drawChart();
    });
    VG.on('colors', drawChart);
  }

  function renderHome() {
    const d = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
    $('home-title').textContent = 'Сегодня, ' + d;
    renderCheckin();
    renderPlan();
    renderVoice();
    renderProgress();
  }

  VG.register('home', {
    init() {
      $('checkin-chips').addEventListener('click', (e) => {
        const c = e.target.closest('.chip');
        if (!c) return;
        VG.journal.add({ kind: 'checkin', state: c.dataset.state });
        renderCheckin();
        renderPlan();
      });
      bindChart();
      VG.on('journal', () => {
        if (VG.current === 'home') renderHome();
      });
      VG.on('profile', renderVoice);
    },
    enter: renderHome,
    context() {
      const p = VG.profile;
      const st = todayCheckin();
      return (
        'Страница «Сегодня». ' + (p ? 'Диапазон ученика: ' + VG.nn(Math.round(p.lo)) + '–' + VG.nn(Math.round(p.hi)) + '. ' : 'Диапазон не измерен. ') +
        (st ? 'Самочувствие голоса сегодня: ' + { good: 'отлично', tired: 'устал', hoarse: 'хрипит', pain: 'больно' }[st] + '. ' : '') +
        'Занятий подряд: ' + VG.journal.streak() + ' дней.'
      );
    },
  });

  // ================= Диапазон =================
  const R = { lo: null, hi: null, hold: [], piano: null, startedAt: 0 };

  function rangeReset() {
    R.lo = null;
    R.hi = null;
    R.hold = [];
    R.startedAt = Date.now();
    $('range-lo').textContent = '—';
    $('range-hi').textContent = '—';
    $('range-type').textContent = '—';
    $('range-save').disabled = true;
    if (R.piano) R.piano.clear();
  }

  function rangeFrame(f) {
    const now = f ? f.t : 0;
    if (f && f.midi != null) {
      $('range-now').textContent = VG.nn(f.midi);
      R.hold.push({ t: now, m: f.midi });
    } else {
      $('range-now').textContent = '—';
      R.hold.length = 0;
    }
    while (R.hold.length && now - R.hold[0].t > 0.45) R.hold.shift();
    // нота засчитывается, если держится 0,4 с в пределах ±40 центов
    if (R.hold.length > 10 && now - R.hold[0].t > 0.38) {
      const ms = R.hold.map((h) => h.m);
      const spread = Math.max(...ms) - Math.min(...ms);
      if (spread < 0.8) {
        const m = VG.V.median(ms);
        let changed = false;
        if (R.lo == null || m < R.lo) {
          R.lo = m;
          changed = true;
        }
        if (R.hi == null || m > R.hi) {
          R.hi = m;
          changed = true;
        }
        if (changed) rangeShow();
      }
    }
  }

  function rangeShow() {
    $('range-lo').textContent = R.lo != null ? VG.nn(R.lo) : '—';
    $('range-hi').textContent = R.hi != null ? VG.nn(R.hi) : '—';
    const ok = R.lo != null && R.hi - R.lo >= 5;
    $('range-save').disabled = !ok;
    $('range-type').textContent = ok ? VG.guessVoiceType(R.lo, R.hi).name : '—';
    if (R.piano) {
      R.piano.clear();
      if (R.lo != null) for (let m = Math.round(R.lo); m <= Math.round(R.hi); m++) R.piano.mark(m, 'is-hint');
      if (R.lo != null) {
        R.piano.mark(Math.round(R.lo), 'is-on');
        R.piano.mark(Math.round(R.hi), 'is-on');
      }
    }
  }

  function rangeSave(lo, hi, measured) {
    const t = VG.guessVoiceType(lo, hi);
    VG.setProfile({ lo, hi, type: t.id, at: Date.now() });
    VG.journal.add({
      kind: 'range',
      title: VG.nn(Math.round(lo)) + ' — ' + VG.nn(Math.round(hi)) + ', ' + t.name,
      sec: measured ? Math.round((Date.now() - R.startedAt) / 1000) : 0,
    });
    VG.go('home');
  }

  VG.register('range', {
    init() {
      $('range-mic-slot').replaceWith(VG.micButton());
      R.piano = new VG.Piano($('range-piano'), { lo: 40, hi: 84 });
      $('range-reset').addEventListener('click', rangeReset);
      $('range-save').addEventListener('click', () => rangeSave(R.lo, R.hi, true));
      const lo = $('range-manual-lo');
      const hi = $('range-manual-hi');
      for (let m = 36; m <= 88; m++) {
        const a = el('option', null, VG.nn(m));
        a.value = m;
        lo.appendChild(a);
        hi.appendChild(a.cloneNode(true));
      }
      lo.value = '55';
      hi.value = '74';
      $('range-manual-save').addEventListener('click', () => {
        const a = Number(lo.value);
        const b = Number(hi.value);
        if (b - a >= 5) rangeSave(Math.min(a, b), Math.max(a, b), false);
      });
    },
    enter() {
      rangeReset();
      if (VG.profile) {
        $('range-manual-lo').value = String(Math.round(VG.profile.lo));
        $('range-manual-hi').value = String(Math.round(VG.profile.hi));
      }
    },
    frame: rangeFrame,
  });
})();
