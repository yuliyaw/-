/*
 * Второй голос — разбор вокала: запись с микрофона или файл,
 * график высоты и громкости, показатели, советы, история.
 */
(function () {
  'use strict';

  const VG = window.VG;
  const { engine, $, el, clamp } = VG;
  const V = VG.V;
  const MAX_SEC = 180;

  const A = { rec: null, report: null, frames: null, plot: { box: { w: 0, h: 0, dpr: 1 }, hover: null }, url: null };
  let history = VG.store.get('vg.analysis.v1', []);
  if (!Array.isArray(history)) history = [];

  // ================= Запись =================
  async function toggleRec() {
    if (A.rec) {
      stopRec();
      return;
    }
    if (!VG.mic.on) {
      await VG.toggleMic($('an-rec'));
      if (!VG.mic.on) return;
    }
    VG.audio();
    A.rec = { frames: [], start: engine.now, chunks: [], recorder: null };
    try {
      if (window.MediaRecorder && VG.mic.stream) {
        const r = new MediaRecorder(VG.mic.stream);
        r.ondataavailable = (e) => e.data && e.data.size && A.rec && A.rec.chunks.push(e.data);
        r.start(500);
        A.rec.recorder = r;
      }
    } catch (e) {
      /* без записи для прослушивания — анализ всё равно работает */
    }
    $('an-rec').classList.add('is-recording');
    $('an-rec-label').textContent = 'Остановить';
    $('an-status').textContent = 'Пойте. Запись остановится сама через 3 минуты.';
    VG.keepAwake(true);
  }

  function stopRec() {
    const r = A.rec;
    A.rec = null;
    $('an-rec').classList.remove('is-recording');
    $('an-rec-label').textContent = 'Записать';
    $('an-timer').textContent = '';
    VG.keepAwake(false);
    const finish = (blob) => {
      if (A.url) URL.revokeObjectURL(A.url);
      A.url = blob ? URL.createObjectURL(blob) : null;
      const frames = r.frames.map((f) => Object.assign({}, f, { t: f.t - r.start }));
      process(frames, 'Запись с микрофона');
    };
    if (r.recorder && r.recorder.state !== 'inactive') {
      r.recorder.onstop = () => finish(r.chunks.length ? new Blob(r.chunks, { type: r.recorder.mimeType }) : null);
      r.recorder.stop();
    } else finish(null);
  }

  async function loadFile(file) {
    if (!file) return;
    if (A.rec) stopRec();
    const ctx = VG.audio();
    $('an-status').textContent = 'Читаю файл «' + file.name + '»…';
    $('an-progress').hidden = false;
    $('an-progress-bar').style.width = '0%';
    try {
      const buf = await file.arrayBuffer();
      const audio = await new Promise((res, rej) => {
        const p = ctx.decodeAudioData(buf.slice(0), res, rej);
        if (p && p.then) p.then(res, rej);
      });
      const n = Math.min(audio.length, Math.round(MAX_SEC * audio.sampleRate));
      const data = new Float32Array(n);
      for (let c = 0; c < audio.numberOfChannels; c++) {
        const ch = audio.getChannelData(c);
        for (let i = 0; i < n; i++) data[i] += ch[i] / audio.numberOfChannels;
      }
      $('an-status').textContent = 'Слушаю запись' + (audio.duration > MAX_SEC ? ' (первые 3 минуты)' : '') + '…';
      const frames = await V.framesFromBuffer(data, audio.sampleRate, {
        hop: 0.02,
        onProgress: (p) => ($('an-progress-bar').style.width = Math.round(p * 100) + '%'),
      });
      if (A.url) URL.revokeObjectURL(A.url);
      A.url = URL.createObjectURL(file);
      process(frames, file.name);
    } catch (e) {
      $('an-status').textContent = 'Не получилось прочитать файл. Подойдут обычные аудиозаписи: m4a, mp3, wav, ogg. Попробуйте другой файл.';
    }
    $('an-progress').hidden = true;
    $('an-file').value = '';
  }

  // ================= Отчёт =================
  function process(frames, source) {
    const rep = V.analyze(frames);
    A.frames = frames;
    A.report = rep;
    if (rep.voiced < 2) {
      $('an-status').textContent = 'В записи почти не слышно пения (меньше двух секунд голоса). Запишите хотя бы 15–20 секунд и держите микрофон ближе.';
      $('an-report').hidden = true;
      return;
    }
    $('an-status').textContent = 'Готово: ' + source + ', ' + fmtTime(rep.duration) + '.';
    render(rep, source);
    const item = {
      ts: Date.now(),
      dur: Math.round(rep.duration),
      lo: rep.range ? rep.range.lo : null,
      hi: rep.range ? rep.range.hi : null,
      inTune: rep.intonation ? rep.intonation.inTunePct : null,
      wobble: rep.wobble,
      h1h2: rep.closure.h1h2,
      clarity: rep.closure.clarity,
      vib: rep.vibrato.share,
      phrase: rep.phrases.avg,
    };
    history.push(item);
    if (history.length > 40) history.shift();
    VG.store.set('vg.analysis.v1', history);
    VG.journal.add({ kind: 'analysis', title: 'Запись ' + fmtTime(rep.duration), score: item.inTune, sec: Math.round(rep.duration) });
    renderHistory();
  }

  const fmtTime = (s) => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');

  function metric(name, value, word, cls, text) {
    const m = el('div', 'metric');
    m.appendChild(el('span', 'metric-name', name));
    m.appendChild(el('span', 'metric-value', value));
    if (word) m.appendChild(el('span', 'metric-word' + (cls ? ' is-' + cls : ''), word));
    if (text) m.appendChild(el('p', null, text));
    return m;
  }

  /** Оценки по отчёту: слово, статус и пояснение. */
  function assess(r) {
    const out = {};
    if (r.intonation) {
      const it = r.intonation;
      const word = it.inTunePct >= 80 ? 'чисто' : it.inTunePct >= 60 ? 'местами мимо' : 'часто мимо';
      const cls = it.inTunePct >= 80 ? 'good' : it.inTunePct >= 60 ? 'warn' : 'bad';
      let text = 'Нот точнее ±25 центов: ' + it.inTunePct + ' %. Среднее отклонение — ' + Math.round(it.meanAbs) + ' центов.';
      if (Math.abs(it.bias) >= 8) text += ' Чаще ' + (it.bias < 0 ? 'ниже' : 'выше') + ' нужного.';
      if (Math.abs(it.offset) > 25) text += ' Весь строй сдвинут на ' + Math.round(it.offset) + ' центов от стандартного «ля = 440 Гц»: без аккомпанемента это не ошибка.';
      out.int = { word, cls, text, value: it.inTunePct + ' %' };
    }
    if (r.wobble != null) {
      const w = r.wobble;
      out.stab = {
        value: '±' + Math.round(w) + ' ц',
        word: w < 10 ? 'ровно' : w < 20 ? 'немного плавает' : 'качается',
        cls: w < 10 ? 'good' : w < 20 ? 'warn' : 'bad',
        text:
          'Насколько ровно держится высота на длинных нотах без вибрато.' +
          (r.intonation && r.intonation.driftDown > 0.3 ? ' К концу нот голос часто опускается — признак того, что опора к концу звука ослабевает.' : ''),
      };
    }
    const vb = r.vibrato;
    if (vb.longNotes) {
      let word;
      let cls = '';
      let text;
      if (!vb.rate) {
        word = 'нет';
        text = 'На длинных нотах звук ровный, без вибрато. Это не ошибка: в хоре и во втором голосе ровный звук даже ценится.';
      } else if (vb.rate > 7.2) {
        word = 'частое, дрожащее';
        cls = 'warn';
        text = 'Вибрато быстрее 7 колебаний в секунду похоже на дрожание (тремоло). Часто это зажим или нехватка опоры.';
      } else if (vb.rate < 4.3 || vb.extent > 90) {
        word = vb.rate < 4.3 ? 'медленное, «плавающее»' : 'широкое, качающееся';
        cls = 'warn';
        text = 'Слишком медленное или широкое вибрато звучит как качание голоса. Часто это усталость или давление дыхания.';
      } else {
        word = 'естественное';
        cls = 'good';
        text = 'Ровное вибрато около 5–6 колебаний в секунду — признак свободного голоса.';
      }
      out.vib = {
        value: vb.rate ? VG.fmt(vb.rate, 1) + ' Гц · ±' + Math.round(vb.extent) + ' ц' : Math.round(vb.share * 100) + ' % нот',
        word,
        cls,
        text: text + ' Вибрато есть на ' + Math.round(vb.share * 100) + ' % длинных нот.',
      };
    }
    if (r.closure.h1h2 != null || r.closure.clarity != null) {
      const h = r.closure.h1h2;
      const c = r.closure.clarity;
      let word = 'сбалансированное';
      let cls = 'good';
      let text = 'Связки смыкаются полностью, но без давления.';
      if ((c != null && c < 0.88) || (h != null && h > 12)) {
        word = 'с воздухом';
        cls = 'warn';
        text = 'В звуке много воздуха: связки смыкаются не до конца. Если это не специальный приём, тренируйте мягкую атаку и толстые связки.';
      } else if (h != null && h < -2) {
        word = 'плотное, возможно сдавленное';
        cls = 'warn';
        text = 'Связки смыкаются очень плотно. Если горло устаёт — поработайте над разведением ложных связок.';
      }
      out.closure = { value: (h != null ? 'H1–H2 ' + VG.fmt(h, 1) + ' дБ · ' : '') + 'чистота ' + Math.round((c || 0) * 100) + ' %', word, cls, text };
    }
    if (r.ring != null) {
      const g = r.ring;
      out.ring = {
        value: VG.fmt(g, 0) + ' дБ',
        word: g < -28 ? 'мягкий, без звона' : g < -17 ? 'умеренный звон' : 'звонкий, яркий',
        cls: '',
        text: 'Энергия в полосе 2–4 кГц — «звон», который делает голос слышным. Его добавляет твэнг. Для второго голоса умеренный звон лучше яркого.',
      };
    }
    const on = r.onsets;
    const nOn = on.glottal + on.aspirate + on.smooth;
    if (nOn >= 3) {
      let word = 'разнообразная';
      let cls = 'good';
      if (on.glottal / nOn > 0.5) {
        word = 'часто твёрдая';
        cls = 'warn';
      } else if (on.aspirate / nOn > 0.5) {
        word = 'часто с придыханием';
        cls = 'warn';
      } else if (on.smooth / nOn > 0.6) word = 'в основном мягкая';
      out.onset = { value: on.smooth + ' мягких · ' + on.glottal + ' твёрдых · ' + on.aspirate + ' с воздухом', word, cls, text: 'Как начинаются звуки после пауз. Для большинства пения лучше мягкая атака, твёрдая — для акцентов.' };
    }
    if (r.phrases.count) {
      const avg = r.phrases.avg || 0;
      out.phr = {
        value: r.phrases.count + ' ' + VG.plural(r.phrases.count, 'фраза', 'фразы', 'фраз') + ' · в среднем ' + VG.fmt(avg, 1) + ' с',
        word: avg < 3 ? 'короткие фразы' : 'хватает дыхания',
        cls: avg < 3 ? 'warn' : 'good',
        text: 'Длина звучащих отрезков между вдохами. Самая длинная — ' + VG.fmt(r.phrases.max || 0, 1) + ' с.',
      };
    }
    if (r.dynamics && r.dynamics.range != null) {
      const d = r.dynamics.range;
      out.dyn = {
        value: Math.round(d) + ' дБ',
        word: d < 6 ? 'почти без оттенков' : 'есть оттенки',
        cls: d < 6 ? 'warn' : 'good',
        text: 'Разница между тихими и громкими местами. Музыка живёт оттенками: громче к кульминации, тише в конце фраз.',
      };
    }
    return out;
  }

  function recommendations(r, a) {
    const recs = [];
    const add = (text, links) => recs.push({ text, links });
    if (a.int && a.int.cls !== 'good') {
      add('Интонация: пойте ступени и интервалы в сольфеджио и распевки с включённым микрофоном — линия должна быть зелёной.', [
        ['solfege', 's-alldeg', 'Все ступени мажора'],
        ['solfege', 's-sing-int', 'Спой интервал'],
      ]);
    }
    if (a.stab && a.stab.cls !== 'good') add('Устойчивость: тяните ровный долгий звук и включайте опору корпуса.', [['breath', 'tone', 'Ровный долгий звук'], ['evt', 'torso', 'Опора корпуса']]);
    if (a.vib && a.vib.cls === 'warn') add('Вибрато: не изображайте его специально. Учитесь держать ровный звук, вибрато вернётся само, когда голос освободится.', [['breath', 'tone', 'Ровный долгий звук'], ['evt', 'false-folds', 'Ложные связки']]);
    if (a.closure && a.closure.word === 'с воздухом') add('Смыкание: уберите лишний воздух — мягкая атака без «х» и более «толстые» связки.', [['evt', 'onset', 'Начало звука'], ['evt', 'mass', 'Масса связок']]);
    if (a.closure && /плотное/.test(a.closure.word)) add('Смыкание: освободите горло — беззвучный смех перед звуком и губная трель.', [['evt', 'false-folds', 'Ложные связки'], ['warmup', 'lip-trill', 'Губная трель']]);
    if (a.onset && a.onset.word === 'часто твёрдая') add('Атака: многие звуки начинаются с удара. Потренируйте мягкое начало.', [['evt', 'onset', 'Начало звука']]);
    if (a.onset && a.onset.word === 'часто с придыханием') add('Атака: перед звуком часто выходит воздух. Ищите одновременное начало.', [['evt', 'onset', 'Начало звука']]);
    if (a.phr && a.phr.cls === 'warn') add('Дыхание: фразы короткие. Тренируйте долгий ровный выдох и опору.', [['breath', 'hiss', 'Долгий выдох «с-с-с»'], ['evt', 'torso', 'Опора корпуса']]);
    if (a.dyn && a.dyn.cls === 'warn') add('Оттенки: голос звучит на одной громкости. Попробуйте филировку.', [['breath', 'messa', 'Филировка']]);
    if (r.ring != null && r.ring < -32 && !(a.closure && a.closure.cls !== 'good')) add('Звонкость: голос мягкий и может теряться. Немного твэнга сделает его слышнее без нажима.', [['evt', 'aes', 'Твэнг']]);
    if (!recs.length) add('Отличная запись: явных проблем не видно. Возьмите песню посложнее или поработайте над вторым голосом.', [['train', '', 'Второй голос']]);
    return recs;
  }

  function render(r, source) {
    const box = $('an-report');
    box.textContent = '';
    box.hidden = false;
    const a = assess(r);

    const top = el('section', 'panel');
    const head = el('div', 'panel-head');
    head.appendChild(el('h2', null, 'Высота и громкость'));
    head.appendChild(el('span', 'muted num', fmtTime(r.duration)));
    top.appendChild(head);
    const cv = document.createElement('canvas');
    cv.className = 'an-plot';
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', 'График высоты голоса по времени, ниже — громкость');
    top.appendChild(cv);
    const legend = el('div', 'legend');
    legend.style.borderTop = '0';
    legend.style.padding = '8px 0 0';
    for (const [cls, t] of [
      ['lg-you', 'в ноте (±25 центов)'],
      ['lg-mel', 'рядом (±50)'],
      ['lg-bad', 'мимо'],
      ['lg-v1', 'громкость'],
    ]) legend.appendChild(el('span', 'lg ' + cls, t));
    top.appendChild(legend);
    if (A.url) {
      const au = document.createElement('audio');
      au.className = 'an-player';
      au.controls = true;
      au.src = A.url;
      top.appendChild(au);
    }
    box.appendChild(top);
    A.plot.canvas = cv;
    A.plot.box = { w: 0, h: 0, dpr: 1 };
    VG.watchCanvas(cv, A.plot.box, drawPlot);
    bindPlot(cv);

    const grid = el('div', 'an-metrics');
    if (r.range) {
      const span = Math.round(r.range.hi - r.range.lo);
      grid.appendChild(metric('Диапазон в записи', VG.nn(Math.round(r.range.lo)) + ' — ' + VG.nn(Math.round(r.range.hi)), span + ' ' + VG.plural(span, 'полутон', 'полутона', 'полутонов'), '', 'Самая низкая и самая высокая устойчивая нота, которую вы спели.'));
    }
    const order = [
      ['int', 'Интонация'],
      ['stab', 'Устойчивость'],
      ['vib', 'Вибрато'],
      ['closure', 'Смыкание связок'],
      ['ring', 'Звонкость'],
      ['onset', 'Атака звука'],
      ['phr', 'Дыхание и фразы'],
      ['dyn', 'Динамика'],
    ];
    for (const [k, name] of order) if (a[k]) grid.appendChild(metric(name, a[k].value, a[k].word, a[k].cls, a[k].text));
    box.appendChild(grid);

    const recBox = el('section', 'panel');
    recBox.appendChild(el('h2', null, 'Что тренировать'));
    const ol = el('ol', 'recs');
    for (const rc of recommendations(r, a)) {
      const li = el('li', null, rc.text + ' ');
      rc.links.forEach(([view, id, label], i) => {
        if (i) li.appendChild(document.createTextNode(' · '));
        const link = el('a', null, label);
        link.href = '#' + view;
        link.dataset.go = view;
        if (id) link.dataset.param = id;
        li.appendChild(link);
      });
      ol.appendChild(li);
    }
    recBox.appendChild(ol);
    recBox.appendChild(el('p', 'muted', 'Оценки приблизительные: программа слышит звук, но не видит вас. Сравнивайте разборы между собой — по ним видно, как меняется голос.')).style.margin = '12px 0 0';
    if (VG.teacher && VG.teacher.available) {
      const ask = VG.button('Спросить преподавателя об этом разборе', '', () => VG.teacher.ask('Разбери мою запись и скажи, над чем работать в первую очередь.\n\n' + summary(r, a)));
      ask.style.marginTop = '12px';
      recBox.appendChild(ask);
    }
    box.appendChild(recBox);
  }

  /** Текстовая сводка для преподавателя. */
  function summary(r, a) {
    const lines = ['Длительность: ' + fmtTime(r.duration) + ', пения: ' + Math.round(r.voiced) + ' с.'];
    if (r.range) lines.push('Диапазон: ' + VG.nn(Math.round(r.range.lo)) + '–' + VG.nn(Math.round(r.range.hi)) + '.');
    const names = { int: 'Интонация', stab: 'Устойчивость', vib: 'Вибрато', closure: 'Смыкание', ring: 'Звонкость', onset: 'Атака', phr: 'Фразы', dyn: 'Динамика' };
    for (const [k, n] of Object.entries(names)) if (a[k]) lines.push(n + ': ' + a[k].value + ' — ' + a[k].word + '.');
    return lines.join('\n');
  }

  function drawPlot() {
    const P = A.plot;
    const r = A.report;
    const frames = A.frames;
    if (!P.canvas || !r || !frames) return;
    const g = P.canvas.getContext('2d');
    const { w, h, dpr } = P.box;
    if (!w || !h) return;
    const C = VG.COL;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const L = 46;
    const R = 10;
    const top = 8;
    const split = Math.round(h * 0.74);
    const bottom = h - 18;
    const voiced = frames.filter((f) => f.midi != null);
    const lo = Math.floor(Math.min(...voiced.map((f) => f.midi))) - 1;
    const hi = Math.ceil(Math.max(...voiced.map((f) => f.midi))) + 1;
    const dur = Math.max(1, r.duration);
    const x = (t) => L + (t / dur) * (w - L - R);
    const y = (m) => top + ((hi - m) / (hi - lo)) * (split - top - 8);
    const rows = hi - lo;
    g.font = '10px ' + VG.FONT_BODY;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let m = Math.ceil(lo); m <= hi; m++) {
      const pc = VG.M.mod(m, 12);
      const show = rows <= 26 ? VG.NATURAL.includes(pc) : pc === 0 || pc === 7;
      if (!show) continue;
      g.fillStyle = C.line;
      g.fillRect(L, Math.round(y(m)), w - L - R, 1);
      g.fillStyle = pc === 0 ? C.ink : C.muted;
      g.fillText(VG.nn(m), L - 6, y(m));
    }
    // время
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillStyle = C.muted;
    const step = dur > 120 ? 30 : dur > 40 ? 10 : 5;
    for (let s = 0; s <= dur; s += step) g.fillText(fmtTime(s), x(s), h - 4);
    // высота, окрашенная по точности
    const off = r.intonation ? r.intonation.offset : 0;
    const dev = (m) => {
      let d = (m * 100 - off) % 100;
      if (d > 50) d -= 100;
      if (d < -50) d += 100;
      return Math.abs(d);
    };
    g.lineWidth = 2;
    g.lineCap = 'round';
    let prev = null;
    for (const f of frames) {
      if (f.midi == null) {
        prev = null;
        continue;
      }
      if (prev && f.t - prev.t < 0.08) {
        const d = dev(f.midi);
        g.strokeStyle = d <= 25 ? C.good : d <= 50 ? C.mel : C.bad;
        g.beginPath();
        g.moveTo(x(prev.t), y(prev.midi));
        g.lineTo(x(f.t), y(f.midi));
        g.stroke();
      }
      prev = f;
    }
    // громкость — отдельная панель снизу
    const dbLo = -60;
    const dbHi = Math.max(-10, ...frames.map((f) => f.db));
    const yd = (db) => bottom - 4 - ((clamp(db, dbLo, dbHi) - dbLo) / (dbHi - dbLo)) * (bottom - split - 8);
    g.fillStyle = C.line;
    g.fillRect(L, bottom - 4, w - L - R, 1);
    g.fillStyle = C.voice1;
    g.globalAlpha = 0.55;
    g.beginPath();
    g.moveTo(x(0), bottom - 4);
    for (const f of frames) g.lineTo(x(f.t), yd(f.db));
    g.lineTo(x(frames[frames.length - 1].t), bottom - 4);
    g.closePath();
    g.fill();
    g.globalAlpha = 1;
    g.fillStyle = C.muted;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    g.fillText('громк.', L - 6, (split + bottom) / 2);
    // наведение
    if (P.hover != null) {
      const t = P.hover;
      const i = frames.findIndex((f) => f.t >= t);
      const f = frames[Math.max(0, i)];
      g.fillStyle = C.ink;
      g.globalAlpha = 0.5;
      g.fillRect(Math.round(x(t)), top, 1, bottom - top);
      g.globalAlpha = 1;
      if (f && f.midi != null) {
        g.fillStyle = C.ink;
        g.beginPath();
        g.arc(x(f.t), y(f.midi), 4, 0, Math.PI * 2);
        g.fill();
      }
      let d = f && f.midi != null ? (f.midi * 100 - off) % 100 : null;
      if (d != null) {
        if (d > 50) d -= 100;
        if (d < -50) d += 100;
      }
      const text = fmtTime(t) + ' · ' + (f && f.midi != null ? VG.nn(f.midi) + ', ' + (d >= 0 ? '+' : '−') + Math.abs(Math.round(d)) + ' ц' : 'нет тона') + ' · ' + Math.round(f ? f.db : dbLo) + ' дБ';
      g.font = '500 12px ' + VG.FONT_BODY;
      const tw = g.measureText(text).width + 16;
      const tx = clamp(x(t) + 10, L, w - tw - 2);
      g.fillStyle = C.surface;
      g.strokeStyle = C.line;
      VG.roundRect(g, tx, top, tw, 22, 6);
      g.fill();
      g.stroke();
      g.fillStyle = C.ink;
      g.textAlign = 'left';
      g.fillText(text, tx + 8, top + 11);
    }
    P.geom = { L, R, w, dur };
  }

  function bindPlot(cv) {
    const pick = (e) => {
      const G = A.plot.geom;
      if (!G) return;
      const rect = cv.getBoundingClientRect();
      const xx = e.clientX - rect.left;
      A.plot.hover = xx < G.L ? null : clamp(((xx - G.L) / (G.w - G.L - G.R)) * G.dur, 0, G.dur);
      drawPlot();
    };
    cv.addEventListener('pointermove', pick);
    cv.addEventListener('pointerdown', pick);
    cv.addEventListener('pointerleave', () => {
      A.plot.hover = null;
      drawPlot();
    });
  }

  function renderHistory() {
    const ul = $('an-hist-list');
    ul.textContent = '';
    $('an-hist-empty').hidden = history.length > 0;
    const items = history.slice(-8).reverse();
    items.forEach((h, i) => {
      const li = el('li');
      const when = new Date(h.ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
      li.appendChild(el('span', null, when + ' · ' + fmtTime(h.dur) + (h.lo != null ? ' · ' + VG.nn(Math.round(h.lo)) + '–' + VG.nn(Math.round(h.hi)) : '')));
      const prev = items[i + 1];
      let trend = '';
      if (prev && h.inTune != null && prev.inTune != null) {
        const d = h.inTune - prev.inTune;
        if (Math.abs(d) >= 3) trend = d > 0 ? ' ↑' + d : ' ↓' + Math.abs(d);
      }
      li.appendChild(el('span', 'num', (h.inTune != null ? 'интонация ' + h.inTune + ' %' + trend : '') + (h.phrase ? ' · фразы ' + VG.fmt(h.phrase, 1) + ' с' : '')));
      ul.appendChild(li);
    });
  }

  VG.register('analysis', {
    spectrum: true,
    init() {
      $('an-rec').addEventListener('click', toggleRec);
      $('an-file').addEventListener('change', (e) => loadFile(e.target.files[0]));
      VG.on('colors', drawPlot);
      renderHistory();
    },
    leave() {
      if (A.rec) stopRec();
    },
    frame(f) {
      if (!A.rec) return;
      if (f) A.rec.frames.push(f);
      const t = engine.now - A.rec.start;
      $('an-timer').textContent = fmtTime(t);
      if (t >= MAX_SEC) stopRec();
    },
    context() {
      return A.report ? 'Раздел «Разбор вокала». Последний разбор:\n' + summary(A.report, assess(A.report)) : 'Раздел «Разбор вокала», разборов пока нет.';
    },
  });
})();
