/*
 * Второй голос — приложение: проигрывание, микрофон, оценка, нотная лента,
 * разминка на интервалы и редактор своих мелодий.
 */
(function () {
  'use strict';

  const M = window.Music;
  const LIB = window.SongLibrary;
  const P = window.Pitch;
  const engine = new window.AudioEngine();

  const $ = (id) => document.getElementById(id);
  const EPS = 1e-6;
  const MIC_LAG = 0.045; // c: окно анализа + задержка микрофона
  const HOLD_TO_PASS = 0.75; // c: сколько держать ноту в разминке
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const BODY_FONT = '"Golos Text", system-ui, sans-serif';
  const MONO_FONT = '"JetBrains Mono", ui-monospace, Menlo, monospace';

  // ---------- Хранилище: только удобства этого браузера ----------
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        /* хранилище недоступно — работаем без него */
      }
    },
  };
  const KEYS = { settings: 'vg.settings.v1', songs: 'vg.songs.v1', best: 'vg.best.v1' };

  const STEPS = {
    1: { mel: 55, har: 100, hint: 'Слушайте, как два голоса звучат вместе. Ваша партия — фиолетовые ноты, мелодия — серые.' },
    2: { mel: 40, har: 90, hint: 'Пойте второй голос вместе с подсказкой. Если трудно, сбавьте темп до 70–80 %.' },
    3: { mel: 85, har: 30, hint: 'Подсказка звучит едва слышно. Опирайтесь на свой слух и следите за цветом линии.' },
    4: { mel: 90, har: 0, hint: 'Звучит только мелодия, второй голос полностью ваш. Включите микрофон, чтобы получить оценку.' },
  };

  const DEFAULTS = {
    songId: LIB[0].id,
    step: 1,
    tempo: 100,
    tol: 45,
    names: 'solfege',
    countIn: true,
    metronome: false,
    fold: true,
    headphones: false,
    loop: false,
    volMel: STEPS[1].mel,
    volHar: STEPS[1].har,
    ivType: '-2',
    ivRange: 'high',
    ivHide: false,
    modeBy: {},
    transposeBy: {},
  };
  const settings = Object.assign({}, DEFAULTS, store.get(KEYS.settings, {}));
  for (const k of ['modeBy', 'transposeBy']) if (!settings[k] || typeof settings[k] !== 'object') settings[k] = {};
  let saveTimer = null;
  function saveSettings() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store.set(KEYS.settings, settings), 200);
  }
  let userSongs = store.get(KEYS.songs, []);
  if (!Array.isArray(userSongs)) userSongs = [];
  const best = store.get(KEYS.best, {}) || {};

  // ---------- Состояние тренировки ----------
  const S = {
    view: null,
    song: null,
    key0: null,
    melody0: [],
    custom0: null,
    key: null,
    melody: [],
    harmony: [],
    mode: 'third_below',
    meter: [4, 4],
    barLen: 4,
    pulse: 1,
    anacrusis: 0,
    length: 0,
    phrases: [],
    phrase: -1,
    minDur: 1,
    transpose: 0,
    range: { lo: 55, hi: 72 },
    playing: false,
    run: null,
    pos: 0,
    viewBeat: 0,
    trace: [],
    stats: [],
    micUsed: false,
    refNote: null,
    refUntil: 0,
    dirty: true,
  };

  const COL = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    for (const t of ['ink', 'muted', 'line', 'voice1', 'voice2', 'on-voice2', 'good', 'warn', 'mel', 'bad', 'on-status', 'roll-bg', 'roll-alt', 'dim']) {
      COL[t] = cs.getPropertyValue('--' + t).trim() || '#888';
    }
    S.dirty = true;
    IV.dirty = true;
  }

  const nn = (midi, octave, key) => {
    const k = key || S.key;
    return M.noteName(midi, { style: settings.names, flats: k ? M.usesFlats(k) : false, octave: octave !== false });
  };

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  let audioReady = false;
  function audio() {
    const ctx = engine.ensure();
    if (!audioReady) {
      audioReady = true;
      applyLevels();
    }
    return ctx;
  }
  function applyLevels() {
    engine.setLevel('mel', Math.pow(settings.volMel / 100, 2));
    engine.setLevel('har', Math.pow(settings.volHar / 100, 2));
  }

  // ================= Песни =================
  const allSongs = () => LIB.concat(userSongs);
  const findSong = (id) => allSongs().find((s) => s.id === id);

  function buildSongSelect() {
    const sel = $('song-select');
    sel.textContent = '';
    const groups = [
      ['exercise', 'Упражнения'],
      ['song', 'Песни'],
      ['user', 'Мои песни'],
    ];
    for (const [g, label] of groups) {
      const items = allSongs().filter((s) => s.group === g);
      if (!items.length) continue;
      const og = document.createElement('optgroup');
      og.label = label;
      for (const s of items) {
        const o = el('option', null, s.title);
        o.value = s.id;
        og.appendChild(o);
      }
      sel.appendChild(og);
    }
    sel.value = S.song ? S.song.id : settings.songId;
  }

  function loadSong(id) {
    stopPlayback(true);
    hideResults();
    let def = findSong(id) || LIB[0];
    let mel = M.parseMelody(def.melody);
    if (!mel.notes.length) {
      def = LIB[0];
      mel = M.parseMelody(def.melody);
    }
    S.song = def;
    settings.songId = def.id;
    saveSettings();
    const har = def.harmony && def.harmony.trim() ? M.parseMelody(def.harmony) : null;
    S.melody0 = mel.notes;
    S.custom0 = har && har.notes.length ? har.notes : null;
    S.key0 = def.key && def.key !== 'auto' ? M.parseKeyId(def.key) : M.detectKey(S.melody0);
    S.meter = def.meter || [4, 4];
    S.barLen = M.barLength(S.meter);
    S.pulse = M.pulseLength(S.meter);
    S.anacrusis = def.anacrusis || 0;
    S.length = Math.max(mel.length, har ? har.length : 0);
    S.phrases = M.phrases(S.length, S.barLen, def.phraseBars || 4);
    S.phrase = -1;
    S.minDur = Math.min(1, ...S.melody0.map((n) => n.dur), ...(S.custom0 || []).map((n) => n.dur));
    S.transpose = clamp(settings.transposeBy[def.id] || 0, -12, 12);
    const saved = settings.modeBy[def.id];
    const validSaved = saved && (saved === 'custom' ? !!S.custom0 : !!M.HARMONY_MODES[saved]);
    S.mode = validSaved ? saved : S.custom0 ? 'custom' : 'third_below';
    $('song-select').value = def.id;
    buildModeSelect();
    rebuild();
    buildPhraseSelect();
  }

  function buildModeSelect() {
    const sel = $('opt-mode');
    sel.textContent = '';
    const add = (v, text) => {
      const o = el('option', null, text);
      o.value = v;
      sel.appendChild(o);
    };
    if (S.custom0) add('custom', S.song.group === 'user' ? 'Мой второй голос' : 'Готовая партия');
    for (const [k, d] of Object.entries(M.HARMONY_MODES)) add(k, d.label + ' — ' + d.hint);
    sel.value = S.mode;
  }

  function rebuild() {
    const h0 =
      S.mode === 'custom' && S.custom0
        ? S.custom0
        : M.harmonize(S.melody0, S.key0, S.mode, { barLen: S.barLen, anacrusis: S.anacrusis });
    const T = S.transpose;
    S.key = M.transposeKey(S.key0, T);
    S.melody = S.melody0.map((n) => ({ midi: n.midi + T, start: n.start, dur: n.dur }));
    S.harmony = h0.map((n) => ({ midi: n.midi + T, start: n.start, dur: n.dur }));
    const all = S.melody.concat(S.harmony).map((n) => n.midi);
    let lo = Math.min(...all) - 2;
    let hi = Math.max(...all) + 2;
    while (hi - lo < 14) {
      lo--;
      if (hi - lo < 14) hi++;
    }
    S.range = { lo, hi };
    S.stats = [];
    S.trace = [];
    S.refNote = null;
    S.viewBeat = currentPhrase().start;
    $('tr-val').textContent = T > 0 ? '+' + T : String(T);
    updateMeta();
    S.dirty = true;
  }

  function updateMeta() {
    const box = $('song-meta');
    box.textContent = '';
    const hs = S.harmony.map((n) => n.midi);
    const tempo = Math.round((S.song.bpm * settings.tempo) / 100);
    const key = el('span');
    key.appendChild(el('b', null, M.keyName(S.key, settings.names)));
    box.appendChild(key);
    box.appendChild(el('span', 'num', S.meter[0] + '/' + S.meter[1]));
    box.appendChild(el('span', null, '♩ = ' + tempo));
    if (hs.length) box.appendChild(el('span', null, 'Ваша партия: ' + nn(Math.min(...hs)) + ' — ' + nn(Math.max(...hs))));
    if (S.song.subtitle) box.appendChild(el('span', 'meta-sub', S.song.subtitle));
  }

  const barOf = (b) => Math.floor((b - S.anacrusis) / S.barLen + EPS) + 1;

  function buildPhraseSelect() {
    const sel = $('phrase-select');
    sel.textContent = '';
    const add = (v, text) => {
      const o = el('option', null, text);
      o.value = String(v);
      sel.appendChild(o);
    };
    add(-1, 'Вся песня');
    if (S.phrases.length > 1) {
      S.phrases.forEach((p, i) => {
        add(i, 'Фраза ' + (i + 1) + ' · такты ' + Math.max(1, barOf(p.start)) + '–' + barOf(p.end - 1e-3));
      });
    }
    sel.value = String(S.phrase);
  }

  function currentPhrase() {
    return S.phrase >= 0 && S.phrases[S.phrase] ? S.phrases[S.phrase] : { start: 0, end: S.length };
  }

  // ================= Шаги =================
  function setStep(n, applyVolumes) {
    settings.step = n;
    document.querySelectorAll('.step').forEach((b) => {
      const on = Number(b.dataset.step) === n;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    $('step-hint').textContent = STEPS[n].hint;
    if (applyVolumes) {
      settings.volMel = STEPS[n].mel;
      settings.volHar = STEPS[n].har;
      syncVolumes();
    }
    saveSettings();
  }

  function syncVolumes() {
    $('vol-mel').value = settings.volMel;
    $('vol-har').value = settings.volHar;
    $('vol-mel-val').textContent = settings.volMel + ' %';
    $('vol-har-val').textContent = settings.volHar + ' %';
    applyLevels();
  }

  // ================= Проигрывание =================
  const barlineAtOrBefore = (b) => S.anacrusis + Math.floor((b - S.anacrusis) / S.barLen + EPS) * S.barLen;
  function isDownbeat(b) {
    const r = M.mod(b - S.anacrusis, S.barLen);
    return r < 1e-4 || S.barLen - r < 1e-4;
  }

  function schedulePass(withCountIn) {
    const ctx = audio();
    const ph = currentPhrase();
    const spb = 60 / ((S.song.bpm * settings.tempo) / 100);
    const run = engine.startRun();
    let countBeats = 0;
    if (withCountIn) {
      let cs = barlineAtOrBefore(ph.start);
      while ((ph.start - cs) / S.pulse < 3 - EPS) cs -= S.barLen;
      countBeats = ph.start - cs;
    }
    const t0 = ctx.currentTime + 0.15 + countBeats * spb;
    const at = (b) => t0 + (b - ph.start) * spb;
    if (withCountIn) {
      for (let b = ph.start - countBeats; b < ph.start - EPS; b += S.pulse) run.click(at(b), isDownbeat(b));
    }
    if (settings.metronome) {
      for (let b = S.anacrusis + Math.ceil((ph.start - S.anacrusis) / S.pulse - EPS) * S.pulse; b < ph.end - EPS; b += S.pulse) {
        run.click(at(b), isDownbeat(b));
      }
    }
    const sched = (notes, bus, timbre) => {
      for (const n of notes) {
        if (n.start < ph.start - EPS || n.start >= ph.end - EPS) continue;
        const dur = Math.min(n.start + n.dur, ph.end) - n.start;
        run.note(bus, n.midi, at(n.start), dur * spb, timbre);
      }
    };
    sched(S.melody, 'mel', 'melody');
    sched(S.harmony, 'har', 'harmony');
    S.run = { run, t0, spb, ph, countBeats };
    S.pos = ph.start - countBeats;
    S.stats = [];
    S.trace = [];
    S.micUsed = false;
  }

  function startPlayback() {
    audio();
    engine.stopOneShots();
    hideResults();
    S.refNote = null;
    schedulePass(settings.countIn);
    S.playing = true;
    updatePlayButton();
    requestWakeLock();
  }

  function stopPlayback(silent) {
    if (!S.playing) return;
    S.run.run.stop();
    S.playing = false;
    S.viewBeat = clamp(S.pos, -1, S.length);
    updatePlayButton();
    releaseWakeLock();
    S.dirty = true;
    if (!silent && S.micUsed) {
      const sc = computeScore();
      if (sc && sc.coverage >= 0.35) showResults(sc);
    }
  }

  function passEnd() {
    const sc = S.micUsed ? computeScore() : null;
    S.run.run.stop();
    if (settings.loop) {
      if (sc) showResults(sc);
      schedulePass(settings.countIn);
      return;
    }
    S.playing = false;
    // Возвращаем ленту к началу фрагмента: видно, какие ноты получились.
    S.viewBeat = S.run.ph.start;
    S.dirty = true;
    updatePlayButton();
    releaseWakeLock();
    if (sc) showResults(sc);
  }

  function updatePlayButton() {
    const b = $('btn-play');
    b.classList.toggle('is-playing', S.playing);
    $('btn-play-label').textContent = S.playing ? 'Стоп' : 'Играть';
  }

  function noteAt(notes, beat) {
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      if (n.start > beat + EPS) break;
      if (beat >= n.start - EPS && beat < n.start + n.dur - EPS) return i;
    }
    return -1;
  }
  function firstNoteFrom(notes, beat) {
    for (let i = 0; i < notes.length; i++) if (notes[i].start + notes[i].dur > beat + EPS) return i;
    return -1;
  }

  function giveNote() {
    audio();
    let i;
    if (S.playing) i = noteAt(S.harmony, S.pos);
    else i = firstNoteFrom(S.harmony, Math.max(S.viewBeat, currentPhrase().start));
    if (i < 0) i = firstNoteFrom(S.harmony, currentPhrase().start);
    if (i < 0) return;
    const m = S.harmony[i].midi;
    engine.playNotes(m, S.playing ? 0.8 : 1.6, { timbre: 'harmony' });
    if (!S.playing) {
      S.refNote = m;
      S.refUntil = engine.now + 1.6;
    }
  }

  // ================= Микрофон =================
  const mic = {
    on: false,
    stream: null,
    source: null,
    analyser: null,
    sink: null,
    buf: null,
    detect: P.createDetector(),
    hist: [],
    async start() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const e = new Error('insecure');
        e.name = 'InsecureContext';
        throw e;
      }
      const ctx = audio();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: !settings.headphones, noiseSuppression: false, autoGainControl: false },
      });
      this.stream = stream;
      this.source = ctx.createMediaStreamSource(stream);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0;
      // Анализатор подключён к «тихому» выходу: так браузер гарантированно обрабатывает звук.
      this.sink = ctx.createGain();
      this.sink.gain.value = 0;
      this.source.connect(this.analyser);
      this.analyser.connect(this.sink);
      this.sink.connect(ctx.destination);
      this.buf = new Float32Array(this.analyser.fftSize);
      this.hist = [];
      this.on = true;
      const track = stream.getAudioTracks()[0];
      if (track) {
        track.addEventListener('ended', () => {
          this.stop();
          updateMicUI();
        });
      }
    },
    stop() {
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
      for (const n of [this.source, this.analyser, this.sink]) {
        try {
          if (n) n.disconnect();
        } catch (e) {
          /* уже отключён */
        }
      }
      this.stream = this.source = this.analyser = this.sink = null;
      this.on = false;
    },
    read() {
      if (!this.analyser) return null;
      this.analyser.getFloatTimeDomainData(this.buf);
      const r = this.detect(this.buf, engine.ctx.sampleRate);
      if (!r) {
        this.hist.length = 0;
        return null;
      }
      this.hist.push(r.midi);
      if (this.hist.length > 3) this.hist.shift();
      const sorted = this.hist.slice().sort((a, b) => a - b);
      return { midi: sorted[Math.floor(sorted.length / 2)], freq: r.freq };
    },
  };

  async function toggleMic(noticeId) {
    if (mic.on) {
      mic.stop();
      updateMicUI();
      return;
    }
    try {
      await mic.start();
      $('mic-notice').hidden = true;
      $('iv-notice').hidden = true;
    } catch (e) {
      showMicError(e, noticeId);
    }
    updateMicUI();
  }

  function showMicError(e, noticeId) {
    let msg;
    const name = e && e.name;
    if (name === 'InsecureContext') {
      msg = 'Браузер не даёт доступ к микрофону на этой странице. Микрофон работает на сайтах с адресом https:// и в файле, открытом на компьютере. Слушать и петь можно и без него.';
    } else if (name === 'NotAllowedError' || name === 'SecurityError') {
      msg = 'Доступ к микрофону не разрешён. Разрешите его в настройках сайта (значок замка рядом с адресом) и нажмите «Микрофон» ещё раз. Если программа открыта внутри Claude, микрофон там недоступен: откройте её как обычную страницу. Слушать и петь можно и без микрофона.';
    } else if (name === 'NotFoundError') {
      msg = 'Микрофон не найден. Подключите его и попробуйте снова.';
    } else {
      msg = 'Не удалось включить микрофон' + (e && e.message ? ': ' + e.message : '.');
    }
    const box = $(noticeId);
    box.textContent = msg;
    box.hidden = false;
  }

  function updateMicUI() {
    for (const id of ['btn-mic', 'iv-mic']) {
      const b = $(id);
      b.setAttribute('aria-pressed', String(mic.on));
      b.querySelector('span').textContent = mic.on ? 'Слушаю' : 'Микрофон';
      b.title = mic.on ? 'Выключить микрофон' : 'Включить микрофон';
    }
    S.dirty = true;
    IV.dirty = true;
  }

  // ================= Оценка =================
  function foldToRange(m, lo, hi) {
    if (!settings.fold) return m;
    const center = (lo + hi) / 2;
    return m + 12 * Math.round((center - m) / 12);
  }

  /** Куда попадает голос: ok — в ноту, mel — в мелодию, off — мимо, free — нота не задана. */
  function classify(p, tgt, mel, range) {
    if (!p) return null;
    if (tgt == null) return { status: 'free', cents: null, disp: foldToRange(p.midi, range.lo, range.hi) };
    const c = M.centsOff(p.midi, tgt, settings.fold);
    const disp = settings.fold ? tgt + c / 100 : p.midi;
    if (Math.abs(c) <= settings.tol) return { status: 'ok', cents: c, disp };
    if (mel != null && M.mod(mel - tgt, 12) !== 0 && Math.abs(M.centsOff(p.midi, mel, settings.fold)) <= settings.tol) {
      return { status: 'mel', cents: c, disp };
    }
    return { status: 'off', cents: c, disp };
  }

  function record(beat, p) {
    S.micUsed = true;
    const i = noteAt(S.harmony, beat);
    const j = noteAt(S.melody, beat);
    const tgt = i >= 0 ? S.harmony[i] : null;
    const c = classify(p, tgt ? tgt.midi : null, j >= 0 ? S.melody[j].midi : null, S.range);
    if (tgt) {
      const spb = S.run.spb;
      const skip = Math.min(0.15 / spb, tgt.dur * 0.3);
      const tail = Math.min(0.06 / spb, tgt.dur * 0.1);
      if (beat >= tgt.start + skip && beat <= tgt.start + tgt.dur - tail) {
        const st = S.stats[i] || (S.stats[i] = { frames: 0, ok: 0, mel: 0 });
        st.frames++;
        if (c && c.status === 'ok') st.ok++;
        if (c && c.status === 'mel') st.mel++;
      }
    }
    if (c) S.trace.push({ b: beat, m: c.disp, s: c.status });
  }

  function computeScore() {
    const ph = S.run.ph;
    let wSum = 0;
    let sSum = 0;
    let scored = 0;
    let total = 0;
    let melNotes = 0;
    const per = [];
    S.harmony.forEach((n, i) => {
      if (n.start < ph.start - EPS || n.start >= ph.end - EPS) return;
      total++;
      const st = S.stats[i];
      if (!st || st.frames < 4) return;
      scored++;
      const sc = st.ok / st.frames;
      wSum += n.dur;
      sSum += sc * n.dur;
      if (st.mel / st.frames > 0.4) melNotes++;
      per.push({ n, sc });
    });
    if (!scored) return null;
    per.sort((a, b) => a.sc - b.sc);
    return {
      pct: Math.round((100 * sSum) / wSum),
      coverage: scored / total,
      melNotes,
      worst: per.filter((p) => p.sc < 0.6).slice(0, 3),
    };
  }

  const plural = (n, one, few, many) => {
    const a = Math.abs(n) % 100;
    const b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  };

  function showResults(sc) {
    const step = settings.step;
    $('res-num').textContent = sc.pct;
    let title;
    let text;
    if (sc.pct >= 85) title = 'Отлично!';
    else if (sc.pct >= 65) title = 'Хорошо получается';
    else if (sc.pct >= 40) title = 'Уже кое-что получается';
    else title = 'Пока трудно, и это нормально';
    if (sc.pct >= 85 && step < 4) text = 'Переходите к следующему шагу: подсказка станет тише.';
    else if (sc.pct >= 85) text = 'Вы держите второй голос сами. Попробуйте полный темп или другую песню.';
    else if (sc.pct < 50 && step >= 3) text = 'Вернитесь на шаг 2 и сбавьте темп до 70 %.';
    else if (sc.pct < 50) text = 'Сбавьте темп и учите партию по фразам: выберите фрагмент и включите «По кругу».';
    else text = 'Повторите ещё пару раз: с каждым проходом точность растёт.';
    if (sc.melNotes > 0) {
      text +=
        ' В ' + sc.melNotes + ' ' + plural(sc.melNotes, 'ноте', 'нотах', 'нотах') +
        ' вы ушли на мелодию. Убавьте её громкость и пропойте эти места отдельно.';
    }
    $('res-title').textContent = title;
    $('res-text').textContent = text;
    const ul = $('res-list');
    ul.textContent = '';
    for (const w of sc.worst) {
      const li = el('li', null, 'Такт ' + Math.max(1, barOf(w.n.start)) + ': ');
      li.appendChild(el('b', null, nn(w.n.midi)));
      li.appendChild(document.createTextNode(' — ' + Math.round(w.sc * 100) + ' %'));
      ul.appendChild(li);
    }
    ul.hidden = !sc.worst.length;
    const key = S.song.id + '|' + S.mode + '|' + S.phrase;
    const prev = best[key] || 0;
    let bestText;
    if (sc.pct > prev) {
      best[key] = sc.pct;
      store.set(KEYS.best, best);
      bestText = prev ? 'Новый рекорд! Было ' + prev + ' %.' : 'Первый результат для этой песни и этого голоса.';
    } else {
      bestText = 'Лучший результат: ' + prev + ' %.';
    }
    $('res-best').textContent = bestText;
    $('results').hidden = false;
  }

  function hideResults() {
    $('results').hidden = true;
  }

  // ================= Нотная лента =================
  const roll = { canvas: null, g: null, w: 0, h: 0, dpr: 1 };
  const GUTTER = 50;
  const TOP = 22;
  const BOTTOM = 8;
  const BLACK = [1, 3, 6, 8, 10];
  const NATURAL = [0, 2, 4, 5, 7, 9, 11];

  function fitCanvas(c, box) {
    const r = c.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(1, Math.round(r.width * dpr));
    const H = Math.max(1, Math.round(r.height * dpr));
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    box.w = r.width;
    box.h = r.height;
    box.dpr = dpr;
  }

  function geometry() {
    const { w, h } = roll;
    const rows = S.range.hi - S.range.lo + 1;
    const rowH = (h - TOP - BOTTOM) / rows;
    let ppb = clamp((w - GUTTER) / 11, 34, 84);
    ppb = Math.max(ppb, 15 / S.minDur);
    ppb = Math.min(ppb, (w - GUTTER) / 3);
    const px = GUTTER + (w - GUTTER) * 0.26;
    const pos = S.playing ? S.pos : S.viewBeat;
    return {
      rowH,
      ppb,
      px,
      pos,
      x: (b) => px + (b - pos) * ppb,
      y: (m) => TOP + (S.range.hi - m) * rowH,
      cy: (mf) => TOP + (S.range.hi - mf + 0.5) * rowH,
    };
  }

  function roundRect(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  const statusColor = (s) => (s === 'ok' ? COL.good : s === 'mel' ? COL.mel : s === 'off' ? COL.bad : COL.muted);

  function drawRoll(p) {
    const g = roll.g;
    const { w, h, dpr } = roll;
    if (!w || !h) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const G = geometry();
    const { rowH, x, y, cy } = G;
    const bottom = h - BOTTOM;
    g.fillStyle = COL['roll-bg'];
    g.fillRect(0, 0, w, h);

    // Строки: «чёрные клавиши» темнее, линия под каждой нотой до.
    for (let m = S.range.lo; m <= S.range.hi; m++) {
      const pc = M.mod(m, 12);
      if (BLACK.includes(pc)) {
        g.fillStyle = COL['roll-alt'];
        g.fillRect(GUTTER, y(m), w - GUTTER, rowH);
      }
      if (pc === 0) {
        g.fillStyle = COL.line;
        g.fillRect(GUTTER, Math.round(y(m) + rowH) - 1, w - GUTTER, 1);
      }
    }

    // Такты.
    const bStart = G.pos - (G.px - GUTTER) / G.ppb - 1;
    const bEnd = G.pos + (w - G.px) / G.ppb + 1;
    g.font = '500 10px ' + MONO_FONT;
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    for (let k = Math.floor((bStart - S.anacrusis) / S.barLen); ; k++) {
      const b = S.anacrusis + k * S.barLen;
      if (b > bEnd) break;
      if (b < -EPS || b > S.length + EPS) continue;
      const xx = Math.round(x(b));
      if (xx < GUTTER) continue;
      g.fillStyle = COL.line;
      g.fillRect(xx, TOP, 1, bottom - TOP);
      if (b < S.length - EPS) {
        g.fillStyle = COL.muted;
        g.fillText(String(k + 1), xx + 4, TOP / 2 + 1);
      }
    }
    const xEnd = Math.round(x(S.length));
    if (xEnd > GUTTER && xEnd < w) {
      g.fillStyle = COL.muted;
      g.fillRect(xEnd - 3, TOP, 1, bottom - TOP);
      g.fillRect(xEnd, TOP, 2, bottom - TOP);
    }

    const visible = (n) => x(n.start + n.dur) >= GUTTER && x(n.start) <= w;

    // Мелодия — тонкие серые полосы.
    g.fillStyle = COL.voice1;
    for (const n of S.melody) {
      if (!visible(n)) continue;
      roundRect(g, x(n.start) + 1, y(n.midi) + rowH * 0.22, Math.max(3, n.dur * G.ppb - 2), rowH * 0.56, rowH * 0.28);
      g.fill();
    }

    // Второй голос — широкие фиолетовые полосы; спетые окрашиваются по точности.
    const fontPx = Math.round(clamp(rowH * 0.62, 9, 12));
    g.font = '600 ' + fontPx + 'px ' + BODY_FONT;
    for (let i = 0; i < S.harmony.length; i++) {
      const n = S.harmony[i];
      if (!visible(n)) continue;
      const st = S.stats[i];
      const done = st && st.frames >= 4 && G.pos >= n.start + n.dur;
      let fill = COL.voice2;
      let ink = COL['on-voice2'];
      if (done) {
        const sc = st.ok / st.frames;
        fill = sc >= 0.7 ? COL.good : sc >= 0.4 ? COL.warn : COL.bad;
        ink = COL['on-status'];
      }
      const x0 = x(n.start) + 1;
      const wd = Math.max(3, n.dur * G.ppb - 2);
      const y0 = y(n.midi) + rowH * 0.08;
      const hh = rowH * 0.84;
      g.fillStyle = fill;
      roundRect(g, x0, y0, wd, hh, Math.min(5, hh / 2));
      g.fill();
      if (S.playing && G.pos >= n.start && G.pos < n.start + n.dur) {
        g.strokeStyle = COL.ink;
        g.lineWidth = 1.5;
        roundRect(g, x0 - 1, y0 - 1, wd + 2, hh + 2, Math.min(6, hh / 2));
        g.stroke();
      }
      if (rowH >= 12 && wd > 34) {
        g.fillStyle = ink;
        g.textBaseline = 'middle';
        g.fillText(nn(n.midi, false), x0 + 6, y0 + hh / 2 + 0.5);
      }
    }

    // Затемняем всё вне выбранного фрагмента.
    const ph = S.playing ? S.run.ph : currentPhrase();
    if (ph.start > EPS || ph.end < S.length - EPS) {
      g.fillStyle = COL.dim;
      const xs = x(ph.start);
      const xe = x(ph.end);
      if (xs > GUTTER) g.fillRect(GUTTER, TOP, xs - GUTTER, bottom - TOP);
      if (xe < w) g.fillRect(Math.max(GUTTER, xe), TOP, w - Math.max(GUTTER, xe), bottom - TOP);
    }

    // Линия голоса.
    const mLo = S.range.lo - 0.45;
    const mHi = S.range.hi + 0.45;
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    let prev = null;
    for (const pt of S.trace) {
      if (pt.b < bStart) {
        prev = pt;
        continue;
      }
      if (pt.b > bEnd) break;
      if (prev && pt.b - prev.b < 0.35 && Math.abs(pt.m - prev.m) < 1.2) {
        g.strokeStyle = statusColor(pt.s);
        g.beginPath();
        g.moveTo(x(prev.b), cy(clamp(prev.m, mLo, mHi)));
        g.lineTo(x(pt.b), cy(clamp(pt.m, mLo, mHi)));
        g.stroke();
      }
      prev = pt;
    }

    // Курсор.
    g.globalAlpha = 0.7;
    g.fillStyle = COL.ink;
    g.fillRect(Math.round(G.px) - 1, TOP - 4, 2, bottom - TOP + 4);
    g.globalAlpha = 1;

    // Живая точка голоса.
    if (p && mic.on) {
      const c = liveClass;
      const m = c ? c.disp : foldToRange(p.midi, S.range.lo, S.range.hi);
      g.fillStyle = c ? statusColor(c.status) : COL.muted;
      g.beginPath();
      g.arc(G.px, cy(clamp(m, mLo, mHi)), 6, 0, Math.PI * 2);
      g.fill();
    }

    // Поле с названиями нот.
    g.fillStyle = COL['roll-bg'];
    g.fillRect(0, 0, GUTTER, h);
    g.fillRect(GUTTER, 0, w - GUTTER, TOP - 4);
    g.fillStyle = COL.line;
    g.fillRect(GUTTER - 1, TOP, 1, bottom - TOP);
    g.font = '500 ' + Math.round(clamp(rowH * 0.7, 9, 11)) + 'px ' + BODY_FONT;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let m = S.range.lo; m <= S.range.hi; m++) {
      const pc = M.mod(m, 12);
      if (rowH >= 11 ? !NATURAL.includes(pc) : pc !== 0) continue;
      g.fillStyle = pc === 0 ? COL.ink : COL.muted;
      g.fillText(nn(m), GUTTER - 7, cy(m) + 0.5);
    }
    // перерисовываем номера тактов поверх полосы
    g.font = '500 10px ' + MONO_FONT;
    g.textAlign = 'left';
    for (let k = Math.floor((bStart - S.anacrusis) / S.barLen); ; k++) {
      const b = S.anacrusis + k * S.barLen;
      if (b > bEnd) break;
      if (b < -EPS || b >= S.length - EPS) continue;
      const xx = Math.round(x(b));
      if (xx < GUTTER) continue;
      g.fillStyle = COL.muted;
      g.fillText(String(k + 1), xx + 4, TOP / 2 + 1);
    }
  }

  function bindRollDrag() {
    const c = roll.canvas;
    let drag = null;
    c.addEventListener('pointerdown', (e) => {
      if (S.playing) return;
      drag = { x: e.clientX, b: S.viewBeat };
      try {
        c.setPointerCapture(e.pointerId);
      } catch (err) {
        /* не критично */
      }
      c.classList.add('is-dragging');
    });
    c.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const G = geometry();
      S.viewBeat = clamp(drag.b - (e.clientX - drag.x) / G.ppb, -1, S.length);
      S.refNote = null;
      S.dirty = true;
    });
    const end = () => {
      drag = null;
      c.classList.remove('is-dragging');
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }

  // ================= Табло попадания =================
  const shown = {};
  function setText(id, text) {
    if (shown[id] !== text) {
      shown[id] = text;
      $(id).textContent = text;
    }
  }
  function setStatusClass(node, status) {
    node.classList.toggle('is-ok', status === 'ok');
    node.classList.toggle('is-off', status === 'off');
    node.classList.toggle('is-mel', status === 'mel');
  }
  let hintAt = 0;
  function setHint(id, text, now) {
    if (shown[id] === text) return;
    if (now - hintAt < 0.25 && shown[id] && !shown[id].startsWith('Вступление')) return;
    hintAt = now;
    setText(id, text);
  }

  let liveClass = null;
  function updateReadout(p) {
    const now = performance.now() / 1000;
    let tgt = null;
    let mel = null;
    let countdown = 0;
    if (S.playing) {
      const R = S.run;
      if (S.pos < R.ph.start) {
        countdown = Math.ceil((R.ph.start - S.pos) / S.pulse - EPS);
        const i = firstNoteFrom(S.harmony, R.ph.start);
        tgt = i >= 0 ? S.harmony[i].midi : null;
      } else {
        const b = S.pos - MIC_LAG / R.spb;
        const i = noteAt(S.harmony, b);
        const j = noteAt(S.melody, b);
        tgt = i >= 0 ? S.harmony[i].midi : null;
        mel = j >= 0 ? S.melody[j].midi : null;
      }
    } else if (S.refNote != null) {
      tgt = S.refNote;
    } else {
      const i = firstNoteFrom(S.harmony, S.viewBeat);
      tgt = i >= 0 ? S.harmony[i].midi : null;
    }
    const c = classify(p, tgt, mel, S.range);
    liveClass = c;

    setText('ro-target', tgt != null ? nn(tgt) : 'пауза');
    const you = $('ro-you');
    setText('ro-you', p ? nn(p.midi) : '—');
    setStatusClass(you, c && tgt != null ? c.status : null);

    const needle = $('ro-needle');
    if (c && c.cents != null) {
      needle.style.left = 50 + clamp(c.cents, -100, 100) / 2 + '%';
      needle.classList.add('is-on');
      setStatusClass(needle, c.status);
    } else {
      needle.classList.remove('is-on');
    }

    let hint;
    if (countdown > 0) hint = 'Вступление через ' + countdown + '…';
    else if (!mic.on) {
      if (!S.playing) hint = 'Включите микрофон, чтобы видеть свой голос на ленте.';
      else hint = settings.step === 1 ? 'Слушайте фиолетовую партию.' : 'Пойте фиолетовые ноты.';
    } else if (!p) hint = S.playing && tgt != null ? 'Не слышу голоса.' : 'Спойте ноту — покажу, куда вы попадаете.';
    else if (tgt == null) hint = 'Пауза, можно вдохнуть.';
    else if (c.status === 'ok') hint = 'Точно в ноте.';
    else if (c.status === 'mel') hint = 'Вы поёте мелодию. Ваша нота ' + (tgt < mel ? 'ниже' : 'выше') + '.';
    else hint = c.cents > 0 ? 'Выше, чем нужно. Опуститесь.' : 'Ниже, чем нужно. Поднимитесь.';
    setHint('ro-hint', hint, now);
  }

  function updateTolZone() {
    const half = clamp(settings.tol, 0, 100) / 2;
    const zone = $('ro-zone');
    zone.style.left = 50 - half + '%';
    zone.style.right = 50 - half + '%';
  }

  // ================= Разминка на интервалы =================
  const IV = {
    task: null,
    hold: 0,
    streak: 0,
    total: 0,
    solved: false,
    hinted: false,
    trail: [],
    canvas: null,
    g: null,
    w: 0,
    h: 0,
    dpr: 1,
    timer: null,
    dirty: true,
  };
  const IV_TONICS = [0, 2, 3, 5, 7, 8, 10];
  const IV_LABELS = { '-2': 'Терция вниз', 2: 'Терция вверх', '-5': 'Секста вниз', '-3': 'Кварта вниз', '-4': 'Квинта вниз' };

  function ivNewTask() {
    audio();
    clearTimeout(IV.timer);
    if (IV.task && !IV.solved) IV.streak = 0;
    const type = settings.ivType;
    const options = [-2, 2, -5, -3, -4];
    const steps = type === 'mix' ? options[Math.floor(Math.random() * options.length)] : parseInt(type, 10);
    const key = M.makeKey(IV_TONICS[Math.floor(Math.random() * IV_TONICS.length)], 'major');
    const shift = settings.ivRange === 'low' ? -12 : 0;
    const lo = 55 + shift;
    const hi = 74 + shift;
    const cands = [];
    for (let m = lo; m <= hi; m++) {
      if (!M.inKey(m, key)) continue;
      const t = M.shiftDiatonic(m, key, steps);
      if (t < lo || t > hi || Math.abs(t - m) % 12 === 6) continue;
      if (IV.task && m === IV.task.ref && t === IV.task.target) continue;
      cands.push({ ref: m, target: t });
    }
    const c = cands[Math.floor(Math.random() * cands.length)];
    IV.task = { key, steps, ref: c.ref, target: c.target };
    IV.hold = 0;
    IV.solved = false;
    IV.hinted = false;
    IV.trail = [];
    ivRender();
    ivPlay();
  }

  function ivPlay() {
    const t = IV.task;
    if (!t) return;
    audio();
    engine.stopOneShots();
    const root = t.ref - M.mod(t.ref - t.key.tonic, 12);
    engine.playNotes([root, root + 4, root + 7], 0.9, { timbre: 'tone' });
    engine.playNotes(t.ref, 2.4, { delay: 1.05, timbre: 'melody' });
  }

  function ivHint() {
    if (!IV.task) return;
    audio();
    engine.stopOneShots();
    IV.hinted = true;
    engine.playNotes(IV.task.target, 1.5, { timbre: 'harmony' });
    ivRender();
  }

  function ivSolved() {
    IV.solved = true;
    IV.total++;
    if (!IV.hinted) IV.streak++;
    engine.stopOneShots();
    engine.playNotes([IV.task.ref, IV.task.target], 1.4, { timbre: 'harmony' });
    ivRender();
    setText('iv-status', 'Есть! Это ' + M.intervalName(IV.task.target - IV.task.ref) + '.');
    IV.timer = setTimeout(() => {
      if (S.view === 'intervals') ivNewTask();
    }, 2300);
  }

  function ivRender() {
    const t = IV.task;
    const reveal = t && (!settings.ivHide || IV.solved || IV.hinted);
    setText('iv-ref', t ? nn(t.ref, true, t.key) : '—');
    setText('iv-target', t ? (reveal ? nn(t.target, true, t.key) : '?') : '—');
    setText(
      'iv-interval',
      t ? IV_LABELS[String(t.steps)] + (reveal ? ': ' + M.intervalName(t.target - t.ref) : '') + ' · ' + M.keyName(t.key, settings.names) : '',
    );
    setText('iv-streak', String(IV.streak));
    setText('iv-total', String(IV.total));
    if (!t) setText('iv-status', 'Нажмите «Новое задание».');
    else if (!mic.on && !IV.solved) setText('iv-status', 'Включите микрофон или проверяйте себя кнопкой «Подсказка».');
    IV.dirty = true;
  }

  function ivFrame(p, dt) {
    const t = IV.task;
    const now = engine.now;
    let c = null;
    if (p) {
      const range = t ? { lo: Math.min(t.ref, t.target) - 4, hi: Math.max(t.ref, t.target) + 4 } : { lo: 55, hi: 74 };
      c = classify(p, t ? t.target : null, t ? t.ref : null, range);
      IV.trail.push({ time: now, m: c.disp, s: c.status });
    }
    while (IV.trail.length && now - IV.trail[0].time > 3.2) IV.trail.shift();

    if (t && !IV.solved && mic.on) {
      if (c && c.status === 'ok') IV.hold += dt;
      else IV.hold = Math.max(0, IV.hold - dt * 1.5);
      $('iv-hold-bar').style.width = Math.min(100, (IV.hold / HOLD_TO_PASS) * 100) + '%';
      let msg;
      if (!c) msg = 'Спойте ноту.';
      else if (c.status === 'ok') msg = 'Держите…';
      else if (c.status === 'mel') msg = 'Это звучащая нота. Нужна другая, ' + (t.target < t.ref ? 'ниже' : 'выше') + '.';
      else msg = c.cents > 0 ? 'Выше, чем нужно.' : 'Ниже, чем нужно.';
      setHint('iv-status', msg, performance.now() / 1000);
      if (IV.hold >= HOLD_TO_PASS) ivSolved();
    } else if (!t || IV.solved) {
      $('iv-hold-bar').style.width = IV.solved ? '100%' : '0%';
    }
    if (mic.on || IV.dirty) {
      ivDraw(c);
      IV.dirty = false;
    }
  }

  function ivDraw(live) {
    const g = IV.g;
    const { w, h, dpr } = IV;
    if (!w || !h) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = COL['roll-bg'];
    g.fillRect(0, 0, w, h);
    const t = IV.task;
    if (!t) {
      g.fillStyle = COL.muted;
      g.font = '500 14px ' + BODY_FONT;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('Здесь появятся звучащая нота, нужная нота и ваш голос', w / 2, h / 2);
      return;
    }
    const lo = Math.min(t.ref, t.target) - 4;
    const hi = Math.max(t.ref, t.target) + 4;
    const rowH = (h - 16) / (hi - lo + 1);
    const cy = (m) => 8 + (hi - m + 0.5) * rowH;
    const gut = GUTTER;
    for (let m = lo; m <= hi; m++) {
      if (BLACK.includes(M.mod(m, 12))) {
        g.fillStyle = COL['roll-alt'];
        g.fillRect(gut, cy(m) - rowH / 2, w - gut, rowH);
      }
    }
    const reveal = !settings.ivHide || IV.solved || IV.hinted;
    // звучащая нота
    g.fillStyle = COL.voice1;
    roundRect(g, gut + 6, cy(t.ref) - rowH * 0.25, w - gut - 12, rowH * 0.5, rowH * 0.25);
    g.fill();
    // нужная нота
    if (reveal) {
      g.globalAlpha = IV.solved ? 1 : 0.85;
      g.fillStyle = IV.solved ? COL.good : COL.voice2;
      roundRect(g, gut + 6, cy(t.target) - rowH * 0.42, w - gut - 12, rowH * 0.84, rowH * 0.3);
      g.fill();
      g.globalAlpha = 1;
    }
    // след голоса: справа «сейчас», влево — последние 3 секунды
    const now = engine.now;
    const pps = (w - gut - 20) / 3;
    const xr = w - 14;
    g.lineWidth = 3;
    g.lineCap = 'round';
    let prev = null;
    for (const pt of IV.trail) {
      if (prev && pt.time - prev.time < 0.15 && Math.abs(pt.m - prev.m) < 1.2) {
        g.strokeStyle = statusColor(pt.s);
        g.beginPath();
        g.moveTo(xr - (now - prev.time) * pps, cy(clamp(prev.m, lo - 0.45, hi + 0.45)));
        g.lineTo(xr - (now - pt.time) * pps, cy(clamp(pt.m, lo - 0.45, hi + 0.45)));
        g.stroke();
      }
      prev = pt;
    }
    if (live) {
      g.fillStyle = statusColor(live.status);
      g.beginPath();
      g.arc(xr, cy(clamp(live.disp, lo - 0.45, hi + 0.45)), 6, 0, Math.PI * 2);
      g.fill();
    }
    // подписи
    g.fillStyle = COL['roll-bg'];
    g.fillRect(0, 0, gut, h);
    g.fillStyle = COL.line;
    g.fillRect(gut - 1, 0, 1, h);
    g.font = '500 ' + Math.round(clamp(rowH * 0.7, 9, 11)) + 'px ' + BODY_FONT;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let m = lo; m <= hi; m++) {
      const isRef = m === t.ref;
      const isTgt = m === t.target && reveal;
      if (!isRef && !isTgt && !NATURAL.includes(M.mod(m, 12))) continue;
      g.fillStyle = isTgt ? COL.voice2 : isRef ? COL.ink : COL.muted;
      g.fillText(nn(m, true, t.key), gut - 7, cy(m) + 0.5);
    }
  }

  // ================= Редактор =================
  let edEditingId = null;
  let edRun = null;
  let edTimer = null;
  let edCheckTimer = null;

  function buildKeySelect() {
    const sel = $('ed-key');
    const prev = sel.value || 'auto';
    sel.textContent = '';
    const auto = el('option', null, 'Определить по мелодии');
    auto.value = 'auto';
    sel.appendChild(auto);
    for (const [mode, label] of [
      ['major', 'Мажор'],
      ['minor', 'Минор'],
    ]) {
      const og = document.createElement('optgroup');
      og.label = label;
      for (let t = 0; t < 12; t++) {
        const o = el('option', null, M.keyName(M.makeKey(t, mode), settings.names));
        o.value = t + ':' + mode;
        og.appendChild(o);
      }
      sel.appendChild(og);
    }
    sel.value = prev;
  }

  function edCollect() {
    const melody = $('ed-melody').value;
    const harmony = $('ed-harmony').value;
    const m = M.parseMelody(melody);
    const h = harmony.trim() ? M.parseMelody(harmony) : null;
    const meter = $('ed-meter').value.split('/').map(Number);
    const bpm = clamp(parseInt($('ed-bpm').value, 10) || 90, 30, 220);
    const keyVal = $('ed-key').value;
    const key = keyVal === 'auto' ? (m.notes.length ? M.detectKey(m.notes) : M.makeKey(0, 'major')) : M.parseKeyId(keyVal);
    return { title: $('ed-name').value.trim(), melody, harmony, m, h, meter, bpm, anacrusis: parseFloat($('ed-pickup').value) || 0, keyVal, key };
  }

  function errorsText(where, errs) {
    return (
      where + ' не получилось разобрать: ' +
      errs.slice(0, 3).map((e) => '«' + e.token + '» — ' + e.message).join('; ') +
      (errs.length > 3 ? ' и ещё ' + (errs.length - 3) : '') + '.'
    );
  }

  const fmtBeats = (b) => String(Math.round(b * 100) / 100).replace('.', ',');

  /** Проверяет форму и пишет итог под ней. Возвращает данные или null. */
  function edCheck(quietIfEmpty) {
    const d = edCollect();
    const st = $('ed-status');
    let cls = 'is-error';
    let text;
    if (!d.melody.trim() && quietIfEmpty) {
      st.textContent = '';
      st.className = 'ed-status';
      return null;
    }
    if (d.m.errors.length) text = errorsText('В мелодии', d.m.errors);
    else if (d.h && d.h.errors.length) text = errorsText('Во втором голосе', d.h.errors);
    else if (!d.m.notes.length) text = 'Впишите хотя бы несколько нот мелодии.';
    else {
      cls = 'is-ok';
      const bars = Math.ceil((d.m.length - d.anacrusis) / M.barLength(d.meter) - EPS);
      text =
        'Нот: ' + d.m.notes.length + ' · тактов: ' + bars + ' · тональность: ' + M.keyName(d.key, settings.names) +
        (d.keyVal === 'auto' ? ' (определена по мелодии)' : '') + '.';
      if (d.h && Math.abs(d.h.length - d.m.length) > EPS) {
        cls = 'is-warn';
        text +=
          ' Второй голос ' + (d.h.length < d.m.length ? 'короче' : 'длиннее') + ' мелодии на ' +
          fmtBeats(Math.abs(d.h.length - d.m.length)) + ' доли — проверьте длительности.';
      }
    }
    st.textContent = text;
    st.className = 'ed-status ' + cls;
    return cls === 'is-error' ? null : d;
  }

  function edListen() {
    if (edRun) {
      edStopListen();
      return;
    }
    const d = edCheck(false);
    if (!d) return;
    audio();
    engine.stopOneShots();
    const opts = { barLen: M.barLength(d.meter), anacrusis: d.anacrusis };
    const har = d.h && d.h.notes.length ? d.h.notes : M.harmonize(d.m.notes, d.key, 'third_below', opts);
    const spb = 60 / d.bpm;
    const t0 = engine.now + 0.1;
    edRun = engine.startRun();
    for (const n of d.m.notes) edRun.note('ui', n.midi, t0 + n.start * spb, n.dur * spb, 'melody');
    for (const n of har) edRun.note('ui', n.midi, t0 + n.start * spb, n.dur * spb, 'harmony');
    const total = Math.max(d.m.length, d.h ? d.h.length : 0) * spb;
    $('ed-listen').textContent = 'Остановить';
    edTimer = setTimeout(edStopListen, (total + 0.6) * 1000);
  }

  function edStopListen() {
    clearTimeout(edTimer);
    if (edRun) edRun.stop();
    edRun = null;
    $('ed-listen').textContent = 'Послушать';
  }

  function edSave(e) {
    e.preventDefault();
    const d = edCheck(false);
    if (!d) return;
    edStopListen();
    const id = edEditingId || 'u-' + Date.now().toString(36);
    const def = {
      id,
      group: 'user',
      title: d.title || 'Моя мелодия',
      subtitle: 'Моя мелодия',
      key: M.keyId(d.key),
      keyAuto: d.keyVal === 'auto',
      meter: d.meter,
      bpm: d.bpm,
      anacrusis: d.anacrusis,
      phraseBars: 4,
      melody: d.melody.trim(),
      harmony: d.harmony.trim(),
    };
    const idx = userSongs.findIndex((s) => s.id === id);
    if (idx >= 0) userSongs[idx] = def;
    else userSongs.push(def);
    store.set(KEYS.songs, userSongs);
    delete settings.modeBy[id];
    edEditingId = id;
    $('ed-save').textContent = 'Сохранить изменения';
    renderEdList();
    buildSongSelect();
    loadSong(id);
    location.hash = '#train';
  }

  function edFill(def) {
    edStopListen();
    edEditingId = def ? def.id : null;
    $('ed-name').value = def ? def.title : '';
    $('ed-melody').value = def ? def.melody : '';
    $('ed-harmony').value = def ? def.harmony || '' : '';
    $('ed-key').value = def && !def.keyAuto ? def.key : 'auto';
    $('ed-meter').value = def ? def.meter.join('/') : '4/4';
    $('ed-bpm').value = def ? def.bpm : 90;
    $('ed-pickup').value = def ? String(def.anacrusis || 0) : '0';
    $('ed-save').textContent = def ? 'Сохранить изменения' : 'Сохранить и учить';
    edCheck(true);
  }

  function renderEdList() {
    const ul = $('ed-list');
    ul.textContent = '';
    $('ed-empty').hidden = userSongs.length > 0;
    for (const s of userSongs) {
      const li = el('li');
      const title = el('span', 'ed-item-title', s.title);
      title.appendChild(
        el(
          'span',
          'ed-item-meta',
          M.keyName(M.parseKeyId(s.key), settings.names) + ' · ' + s.meter.join('/') + ' · ' +
            (s.harmony ? 'свой второй голос' : 'второй голос строится автоматически'),
        ),
      );
      li.appendChild(title);
      const learn = el('button', 'btn btn-primary', 'Учить');
      learn.type = 'button';
      learn.addEventListener('click', () => {
        loadSong(s.id);
        location.hash = '#train';
      });
      const edit = el('button', 'btn', 'Изменить');
      edit.type = 'button';
      edit.addEventListener('click', () => {
        edFill(s);
        $('ed-name').focus();
      });
      const del = el('button', 'btn btn-ghost', 'Удалить');
      del.type = 'button';
      del.addEventListener('click', () => {
        li.textContent = '';
        li.appendChild(el('span', 'ed-item-title confirm', 'Удалить «' + s.title + '»?'));
        const yes = el('button', 'btn', 'Да, удалить');
        yes.type = 'button';
        yes.addEventListener('click', () => edDelete(s.id));
        const no = el('button', 'btn btn-ghost', 'Отмена');
        no.type = 'button';
        no.addEventListener('click', renderEdList);
        li.append(yes, no);
        no.focus();
      });
      li.append(learn, edit, del);
      ul.appendChild(li);
    }
  }

  function edDelete(id) {
    userSongs = userSongs.filter((s) => s.id !== id);
    store.set(KEYS.songs, userSongs);
    delete settings.modeBy[id];
    delete settings.transposeBy[id];
    saveSettings();
    if (edEditingId === id) edFill(null);
    buildSongSelect();
    if (S.song && S.song.id === id) loadSong(LIB[0].id);
    renderEdList();
  }

  // ================= Разделы =================
  const VIEWS = ['train', 'intervals', 'editor', 'help'];
  function route() {
    const v = (location.hash || '').slice(1);
    const view = VIEWS.includes(v) ? v : 'train';
    if (S.view === view) return;
    if (S.view === 'train') stopPlayback(true);
    if (S.view === 'editor') edStopListen();
    if (S.view === 'intervals') clearTimeout(IV.timer);
    S.view = view;
    for (const name of VIEWS) $('view-' + name).hidden = name !== view;
    document.querySelectorAll('.tab').forEach((t) => {
      if (t.dataset.view === view) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
    if (view === 'train') {
      fitCanvas(roll.canvas, roll);
      S.dirty = true;
    }
    if (view === 'intervals') {
      fitCanvas(IV.canvas, IV);
      ivRender();
    }
  }

  // ================= Главный цикл =================
  let lastTs = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 1 / 60;
    lastTs = ts;
    const p = mic.on ? mic.read() : null;
    if (S.view === 'train') trainFrame(p);
    else if (S.view === 'intervals') ivFrame(p, dt);
  }

  function trainFrame(p) {
    if (S.playing) {
      const R = S.run;
      S.pos = R.ph.start + (engine.now - engine.latency() - R.t0) / R.spb;
      const userBeat = S.pos - MIC_LAG / R.spb;
      if (mic.on && userBeat >= R.ph.start && userBeat < R.ph.end) record(userBeat, p);
      if (S.pos >= R.ph.end + Math.max(0.3, 0.3 / R.spb)) passEnd();
      S.dirty = true;
    } else if (mic.on) {
      S.dirty = true;
    }
    if (S.refNote != null && !S.playing && engine.now > S.refUntil + 8) S.refNote = null;
    updateReadout(p);
    if (S.dirty) {
      drawRoll(p);
      S.dirty = false;
    }
  }

  // ================= Экран не гаснет во время пения =================
  let wakeLock = null;
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) {
      wakeLock = null;
    }
  }
  function releaseWakeLock() {
    try {
      if (wakeLock) wakeLock.release();
    } catch (e) {
      /* не критично */
    }
    wakeLock = null;
  }

  // ================= Запуск =================
  function bind() {
    $('song-select').addEventListener('change', (e) => loadSong(e.target.value));
    $('btn-play').addEventListener('click', () => (S.playing ? stopPlayback(false) : startPlayback()));
    $('btn-ref').addEventListener('click', giveNote);
    $('btn-mic').addEventListener('click', () => toggleMic('mic-notice'));
    $('res-close').addEventListener('click', hideResults);

    $('phrase-select').addEventListener('change', (e) => {
      stopPlayback(true);
      hideResults();
      S.phrase = parseInt(e.target.value, 10);
      S.viewBeat = currentPhrase().start;
      S.refNote = null;
      S.dirty = true;
    });

    const stepsBox = document.querySelector('.steps');
    stepsBox.addEventListener('click', (e) => {
      const b = e.target.closest('.step');
      if (b) setStep(Number(b.dataset.step), true);
    });
    stepsBox.addEventListener('keydown', (e) => {
      const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!d) return;
      e.preventDefault();
      const n = ((settings.step - 1 + d + 4) % 4) + 1;
      setStep(n, true);
      document.querySelector('.step[data-step="' + n + '"]').focus();
    });

    $('opt-mode').addEventListener('change', (e) => {
      stopPlayback(true);
      hideResults();
      S.mode = e.target.value;
      settings.modeBy[S.song.id] = S.mode;
      saveSettings();
      rebuild();
    });
    const transpose = (d) => {
      stopPlayback(true);
      hideResults();
      S.transpose = clamp(S.transpose + d, -12, 12);
      settings.transposeBy[S.song.id] = S.transpose;
      saveSettings();
      rebuild();
      const i = firstNoteFrom(S.harmony, currentPhrase().start);
      if (i >= 0) engine.playNotes(S.harmony[i].midi, 0.6, { timbre: 'harmony' });
    };
    $('tr-down').addEventListener('click', () => {
      audio();
      transpose(-1);
    });
    $('tr-up').addEventListener('click', () => {
      audio();
      transpose(1);
    });
    $('opt-tempo').addEventListener('input', (e) => {
      settings.tempo = Number(e.target.value);
      $('tempo-val').textContent = settings.tempo + ' %';
      updateMeta();
      saveSettings();
    });
    $('vol-mel').addEventListener('input', (e) => {
      settings.volMel = Number(e.target.value);
      syncVolumes();
      saveSettings();
    });
    $('vol-har').addEventListener('input', (e) => {
      settings.volHar = Number(e.target.value);
      syncVolumes();
      saveSettings();
    });
    $('opt-tol').addEventListener('change', (e) => {
      settings.tol = Number(e.target.value);
      updateTolZone();
      saveSettings();
    });
    $('opt-names').addEventListener('change', (e) => {
      settings.names = e.target.value;
      saveSettings();
      for (const k of Object.keys(shown)) delete shown[k];
      updateMeta();
      buildKeySelect();
      renderEdList();
      ivRender();
      edCheck(true);
      S.dirty = true;
    });
    const check = (id, key, after) => {
      const box = $(id);
      box.checked = !!settings[key];
      box.addEventListener('change', () => {
        settings[key] = box.checked;
        saveSettings();
        if (after) after();
      });
    };
    check('opt-countin', 'countIn');
    check('opt-metro', 'metronome');
    check('opt-loop', 'loop');
    check('opt-fold', 'fold', () => {
      S.dirty = true;
    });
    check('opt-phones', 'headphones', async () => {
      if (mic.on) {
        mic.stop();
        await toggleMic('mic-notice');
      }
    });

    $('iv-new').addEventListener('click', ivNewTask);
    $('iv-again').addEventListener('click', () => (IV.task ? ivPlay() : ivNewTask()));
    $('iv-hint').addEventListener('click', ivHint);
    $('iv-mic').addEventListener('click', async () => {
      await toggleMic('iv-notice');
      ivRender();
    });
    $('iv-type').addEventListener('change', (e) => {
      settings.ivType = e.target.value;
      saveSettings();
      ivNewTask();
    });
    $('iv-range').addEventListener('change', (e) => {
      settings.ivRange = e.target.value;
      saveSettings();
      ivNewTask();
    });
    $('iv-hide').addEventListener('change', (e) => {
      settings.ivHide = e.target.checked;
      saveSettings();
      ivRender();
    });

    $('ed-form').addEventListener('submit', edSave);
    $('ed-listen').addEventListener('click', edListen);
    $('ed-new').addEventListener('click', () => {
      edFill(null);
      $('ed-name').focus();
    });
    const later = () => {
      clearTimeout(edCheckTimer);
      edCheckTimer = setTimeout(() => edCheck(true), 300);
    };
    for (const id of ['ed-melody', 'ed-harmony']) $(id).addEventListener('input', later);
    for (const id of ['ed-key', 'ed-meter', 'ed-pickup']) $(id).addEventListener('change', () => edCheck(true));

    document.addEventListener('keydown', (e) => {
      if (S.view !== 'train' || e.code !== 'Space' || e.repeat) return;
      if (e.target.closest('input, select, textarea, button, a, summary, [role="radio"]')) return;
      e.preventDefault();
      if (S.playing) stopPlayback(false);
      else startPlayback();
    });

    window.addEventListener('hashchange', route);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', readColors);
    new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    const ro = new ResizeObserver(() => {
      fitCanvas(roll.canvas, roll);
      fitCanvas(IV.canvas, IV);
      S.dirty = true;
      IV.dirty = true;
    });
    ro.observe(roll.canvas);
    ro.observe(IV.canvas);
  }

  function init() {
    roll.canvas = $('roll');
    roll.g = roll.canvas.getContext('2d');
    IV.canvas = $('iv-canvas');
    IV.g = IV.canvas.getContext('2d');
    readColors();

    $('opt-tempo').value = settings.tempo;
    $('tempo-val').textContent = settings.tempo + ' %';
    $('opt-tol').value = String(settings.tol);
    if (!$('opt-tol').value) {
      settings.tol = 45;
      $('opt-tol').value = '45';
    }
    $('opt-names').value = settings.names;
    $('iv-type').value = settings.ivType;
    $('iv-range').value = settings.ivRange;
    $('iv-hide').checked = !!settings.ivHide;
    updateTolZone();

    bind();
    bindRollDrag();
    buildSongSelect();
    buildKeySelect();
    loadSong(settings.songId);
    setStep(settings.step in STEPS ? Number(settings.step) : 1, false);
    syncVolumes();
    renderEdList();
    // Пример в редакторе, чтобы было видно формат записи.
    $('ed-name').value = 'Звёздочка (пример)';
    $('ed-melody').value = 'до до соль соль | ля ля соль:2 | фа фа ми ми | ре ре до:2';
    edCheck(true);
    route();
    ivRender();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        S.dirty = true;
        IV.dirty = true;
      });
    }
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
