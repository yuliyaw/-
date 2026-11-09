/*
 * Второй голос — ядро приложения: общие настройки, профиль голоса, дневник,
 * микрофон с анализом, разделы и навигация, нотная лента, проигрыватель,
 * табло попадания, клавиатура.
 */
(function (root) {
  'use strict';

  const M = root.Music;
  const P = root.Pitch;
  const V = root.Voice;
  const engine = new root.AudioEngine();
  const VG = (root.VG = { M, P, V, engine });

  const EPS = 1e-6;
  const MIC_LAG = 0.045; // с: окно анализа + задержка микрофона
  VG.EPS = EPS;
  VG.MIC_LAG = MIC_LAG;

  // ---------- Мелочи ----------
  const $ = (VG.$ = (id) => document.getElementById(id));
  VG.qs = (sel, scope) => (scope || document).querySelector(sel);
  VG.qsa = (sel, scope) => Array.from((scope || document).querySelectorAll(sel));
  VG.el = function (tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  VG.button = function (text, cls, onClick) {
    const b = VG.el('button', 'btn' + (cls ? ' ' + cls : ''), text);
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  };
  const clamp = (VG.clamp = (x, a, b) => Math.max(a, Math.min(b, x)));
  VG.plural = (n, one, few, many) => {
    const a = Math.abs(n) % 100;
    const b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  };
  VG.fmt = (x, digits) => {
    if (x == null || !isFinite(x)) return '—';
    return Number(x).toFixed(digits == null ? 0 : digits).replace('.', ',').replace('-', '−');
  };
  VG.shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  VG.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // ---------- Хранилище (только в этом браузере) ----------
  VG.store = {
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

  const SETTINGS_KEY = 'vg.settings.v1';
  VG.settings = Object.assign(
    { names: 'solfege', fold: true, tol: 45, headphones: false, voice: 'high' },
    VG.store.get(SETTINGS_KEY, {}),
  );
  let saveTimer = null;
  VG.saveSettings = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => VG.store.set(SETTINGS_KEY, VG.settings), 200);
  };

  // ---------- События ----------
  const handlers = {};
  VG.on = (name, fn) => (handlers[name] = handlers[name] || []).push(fn);
  VG.emit = (name, data) => (handlers[name] || []).forEach((fn) => fn(data));

  // ---------- Профиль голоса ----------
  VG.VOICE_TYPES = [
    { id: 'bass', name: 'бас', lo: 40, hi: 64 },
    { id: 'baritone', name: 'баритон', lo: 45, hi: 69 },
    { id: 'tenor', name: 'тенор', lo: 48, hi: 72 },
    { id: 'alto', name: 'альт', lo: 53, hi: 77 },
    { id: 'mezzo', name: 'меццо-сопрано', lo: 57, hi: 81 },
    { id: 'soprano', name: 'сопрано', lo: 60, hi: 84 },
  ];
  VG.guessVoiceType = (lo, hi) => {
    let best = null;
    for (const t of VG.VOICE_TYPES) {
      const overlap = Math.min(hi, t.hi) - Math.max(lo, t.lo);
      const score = overlap - 0.6 * (Math.abs(lo - t.lo) + Math.abs(hi - t.hi));
      if (!best || score > best.score) best = { type: t, score };
    }
    return best.type;
  };
  VG.profile = VG.store.get('vg.profile.v1', null);
  VG.setProfile = (p) => {
    VG.profile = p;
    VG.store.set('vg.profile.v1', p);
    VG.emit('profile', p);
  };
  /** Удобный рабочий диапазон: по замеру или по выбору «высокий/низкий». */
  VG.comfort = () => {
    if (VG.profile) return { lo: Math.round(VG.profile.lo) + 2, hi: Math.round(VG.profile.hi) - 2 };
    return VG.settings.voice === 'low' ? { lo: 45, hi: 62 } : { lo: 57, hi: 74 };
  };

  // ---------- Дневник занятий ----------
  const dayKey = (ts) => {
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  VG.dayKey = dayKey;
  VG.journal = {
    list: (() => {
      const l = VG.store.get('vg.log.v1', []);
      return Array.isArray(l) ? l : [];
    })(),
    add(e) {
      const entry = Object.assign({ ts: Date.now() }, e);
      this.list.push(entry);
      if (this.list.length > 3000) this.list.splice(0, this.list.length - 3000);
      VG.store.set('vg.log.v1', this.list);
      VG.emit('journal', entry);
      return entry;
    },
    today() {
      const k = dayKey(Date.now());
      return this.list.filter((e) => dayKey(e.ts) === k);
    },
    byDay() {
      const m = new Map();
      for (const e of this.list) {
        if (e.kind === 'checkin') continue;
        const k = dayKey(e.ts);
        const d = m.get(k) || { sec: 0, n: 0 };
        d.sec += e.sec || 0;
        d.n++;
        m.set(k, d);
      }
      return m;
    },
    streak() {
      const days = this.byDay();
      let n = 0;
      const d = new Date();
      if (!days.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
      while (days.has(dayKey(d.getTime()))) {
        n++;
        d.setDate(d.getDate() - 1);
      }
      return n;
    },
    last(kind, filter) {
      for (let i = this.list.length - 1; i >= 0; i--) {
        const e = this.list[i];
        if (e.kind === kind && (!filter || filter(e))) return e;
      }
      return null;
    },
  };

  // ---------- Цвета темы (для холстов) ----------
  VG.COL = {};
  const COLOR_TOKENS = [
    'bg', 'surface', 'surface-2', 'ink', 'muted', 'line', 'voice1', 'voice2', 'on-voice2', 'tint',
    'good', 'warn', 'mel', 'bad', 'on-status', 'roll-bg', 'roll-alt', 'dim', 'skin', 'tissue', 'air', 'fold', 'airway',
  ];
  VG.readColors = () => {
    const cs = getComputedStyle(document.documentElement);
    for (const t of COLOR_TOKENS) VG.COL[t] = cs.getPropertyValue('--' + t).trim() || '#888';
    VG.emit('colors');
  };
  VG.FONT_BODY = '"Golos Text", system-ui, sans-serif';
  VG.FONT_MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';

  // ---------- Названия нот ----------
  VG.nn = (midi, opts) => {
    opts = opts || {};
    const key = opts.key;
    return M.noteName(midi, {
      style: VG.settings.names,
      flats: opts.flats != null ? opts.flats : key ? M.usesFlats(key) : false,
      octave: opts.octave !== false,
    });
  };
  VG.keyName = (key) => M.keyName(key, VG.settings.names);

  // ---------- Звук ----------
  let audioReady = false;
  VG.audio = () => {
    const ctx = engine.ensure();
    if (!audioReady) {
      audioReady = true;
      VG.emit('audio-ready', ctx);
    }
    return ctx;
  };

  // ---------- Микрофон ----------
  VG.mic = {
    on: false,
    wantSpectrum: false,
    stream: null,
    nodes: [],
    analyser: null,
    buf: null,
    detect: P.createDetector(),
    hist: [],
    history: [],
    last: null,
    async start() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const e = new Error('insecure');
        e.name = 'InsecureContext';
        throw e;
      }
      const ctx = VG.audio();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: !VG.settings.headphones, noiseSuppression: false, autoGainControl: false },
      });
      this.stream = stream;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      // Анализатор подключён к «тихому» выходу: так браузер гарантированно обрабатывает звук.
      const sink = ctx.createGain();
      sink.gain.value = 0;
      source.connect(analyser);
      analyser.connect(sink);
      sink.connect(ctx.destination);
      this.nodes = [source, analyser, sink];
      this.analyser = analyser;
      this.source = source;
      this.buf = new Float32Array(analyser.fftSize);
      this.hist = [];
      this.history = [];
      this.on = true;
      const track = stream.getAudioTracks()[0];
      if (track) {
        track.addEventListener('ended', () => {
          this.stop();
          VG.updateMicUI();
        });
      }
      VG.emit('mic', true);
    },
    stop() {
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
      for (const n of this.nodes) {
        try {
          n.disconnect();
        } catch (e) {
          /* уже отключён */
        }
      }
      this.nodes = [];
      this.stream = this.analyser = this.source = null;
      this.on = false;
      this.last = null;
      VG.emit('mic', false);
    },
    /** Кадр: { t, db, dbFast, midi|null, freq, clarity, h1h2, ring, centroid }. */
    read() {
      if (!this.analyser) return null;
      this.analyser.getFloatTimeDomainData(this.buf);
      const f = V.makeFrame(this.buf, engine.ctx.sampleRate, this.detect, engine.now, this.wantSpectrum);
      if (f.midi != null) {
        this.hist.push(f.midi);
        if (this.hist.length > 3) this.hist.shift();
        const s = this.hist.slice().sort((a, b) => a - b);
        f.midi = s[s.length >> 1];
      } else {
        this.hist.length = 0;
      }
      this.history.push(f);
      while (this.history.length && f.t - this.history[0].t > 8) this.history.shift();
      this.last = f;
      return f;
    },
    recent(seconds) {
      const now = engine.now;
      return this.history.filter((f) => now - f.t <= seconds);
    },
  };

  VG.toggleMic = async (button) => {
    const view = button ? button.closest('.view') : null;
    const notice = view ? view.querySelector('.mic-notice') : null;
    if (VG.mic.on) {
      VG.mic.stop();
      VG.updateMicUI();
      return;
    }
    try {
      await VG.mic.start();
      VG.qsa('.mic-notice').forEach((n) => (n.hidden = true));
    } catch (e) {
      if (notice) {
        notice.textContent = VG.micErrorText(e);
        notice.hidden = false;
      }
    }
    VG.updateMicUI();
  };

  VG.micErrorText = (e) => {
    const name = e && e.name;
    if (name === 'InsecureContext') {
      return 'Браузер не даёт доступ к микрофону на этой странице. Микрофон работает на сайтах с адресом https:// и в файле, открытом на компьютере. Слушать и петь можно и без него, а в «Разборе вокала» можно загрузить запись с диктофона.';
    }
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return 'Доступ к микрофону не разрешён. Разрешите его в настройках сайта (значок замка рядом с адресом) и нажмите «Микрофон» ещё раз. Если программа открыта внутри Claude, микрофон там недоступен: откройте её как обычную страницу. Слушать и петь можно и без микрофона, а в «Разборе вокала» можно загрузить запись с диктофона.';
    }
    if (name === 'NotFoundError') return 'Микрофон не найден. Подключите его и попробуйте снова.';
    return 'Не удалось включить микрофон' + (e && e.message ? ': ' + e.message : '.');
  };

  VG.updateMicUI = () => {
    for (const b of VG.qsa('[data-mic]')) {
      b.setAttribute('aria-pressed', String(VG.mic.on));
      const label = b.querySelector('.mic-label');
      if (label) label.textContent = VG.mic.on ? 'Слушаю' : 'Микрофон';
      b.title = VG.mic.on ? 'Выключить микрофон' : 'Включить микрофон';
    }
  };

  VG.MIC_ICON =
    '<svg class="ico" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zm-5 8a1 1 0 1 0-2 0 7 7 0 0 0 6 6.9V18H7a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-1.1A7 7 0 0 0 17 10a1 1 0 1 0-2 0 5 5 0 0 1-10 0z"/></svg>';
  /** Кнопка микрофона (общая для всех разделов). */
  VG.micButton = () => {
    const b = VG.el('button', 'btn btn-mic');
    b.type = 'button';
    b.setAttribute('data-mic', '');
    b.setAttribute('aria-pressed', String(VG.mic.on));
    b.innerHTML = VG.MIC_ICON + '<span class="mic-label">' + (VG.mic.on ? 'Слушаю' : 'Микрофон') + '</span>';
    return b;
  };

  // ---------- Оценка попадания ----------
  VG.foldToRange = (m, lo, hi) => {
    if (!VG.settings.fold) return m;
    const center = (lo + hi) / 2;
    return m + 12 * Math.round((center - m) / 12);
  };

  /** Куда попадает голос: ok — в ноту, mel — в мелодию/звучащую ноту, off — мимо, free — нота не задана. */
  VG.classify = (midi, tgt, guide, range) => {
    if (midi == null) return null;
    if (tgt == null) return { status: 'free', cents: null, disp: VG.foldToRange(midi, range.lo, range.hi) };
    const c = M.centsOff(midi, tgt, VG.settings.fold);
    const disp = VG.settings.fold ? tgt + c / 100 : midi;
    if (Math.abs(c) <= VG.settings.tol) return { status: 'ok', cents: c, disp };
    if (guide != null && M.mod(guide - tgt, 12) !== 0 && Math.abs(M.centsOff(midi, guide, VG.settings.fold)) <= VG.settings.tol) {
      return { status: 'mel', cents: c, disp };
    }
    return { status: 'off', cents: c, disp };
  };

  VG.statusColor = (s) => (s === 'ok' ? VG.COL.good : s === 'mel' ? VG.COL.mel : s === 'off' ? VG.COL.bad : VG.COL.muted);

  // ---------- Холсты ----------
  const canvases = [];
  VG.fitCanvas = (c, box) => {
    const r = c.getBoundingClientRect();
    const dpr = Math.min(2, root.devicePixelRatio || 1);
    const W = Math.max(1, Math.round(r.width * dpr));
    const H = Math.max(1, Math.round(r.height * dpr));
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    box.w = r.width;
    box.h = r.height;
    box.dpr = dpr;
  };
  /** Следит за размером холста; onResize вызывается при каждом изменении. */
  VG.watchCanvas = (c, box, onResize) => {
    canvases.push({ c, box, onResize });
    if (root.ResizeObserver) {
      const ro = new ResizeObserver(() => {
        VG.fitCanvas(c, box);
        if (onResize) onResize();
      });
      ro.observe(c);
    }
    VG.fitCanvas(c, box);
  };
  VG.roundRect = (g, x, y, w, h, r) => {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  };

  // ---------- Нотная лента ----------
  const BLACK = [1, 3, 6, 8, 10];
  const NATURAL = [0, 2, 4, 5, 7, 9, 11];
  VG.BLACK = BLACK;
  VG.NATURAL = NATURAL;

  /**
   * Нотная лента: серые полосы — то, что звучит рядом (guide), фиолетовые — то, что
   * нужно петь (target). Поверх — линия голоса из микрофона.
   */
  class Roll {
    constructor(canvas) {
      this.canvas = canvas;
      this.g = canvas.getContext('2d');
      this.box = { w: 0, h: 0, dpr: 1 };
      this.target = [];
      this.guide = [];
      this.range = { lo: 55, hi: 72 };
      this.barLen = 4;
      this.anacrusis = 0;
      this.length = 0;
      this.minDur = 1;
      this.key = null;
      this.pos = 0;
      this.view = 0;
      this.playing = false;
      this.stats = [];
      this.trace = [];
      this.live = null;
      this.phrase = null;
      this.dirty = true;
      VG.watchCanvas(canvas, this.box, () => (this.dirty = true));
      VG.on('colors', () => (this.dirty = true));
    }

    setNotes(o) {
      this.target = o.target || [];
      this.guide = o.guide || [];
      this.key = o.key || null;
      this.barLen = o.barLen || 0;
      this.anacrusis = o.anacrusis || 0;
      const ends = this.target.concat(this.guide).map((n) => n.start + n.dur);
      this.length = o.length != null ? o.length : ends.length ? Math.max(...ends) : 0;
      const all = this.target.concat(this.guide).map((n) => n.midi);
      let lo = all.length ? Math.min(...all) - 2 : 55;
      let hi = all.length ? Math.max(...all) + 2 : 72;
      while (hi - lo < 14) {
        lo--;
        if (hi - lo < 14) hi++;
      }
      this.range = { lo, hi };
      this.minDur = Math.min(1, ...this.target.concat(this.guide).map((n) => n.dur));
      this.stats = [];
      this.trace = [];
      this.dirty = true;
    }

    geometry() {
      const { w, h } = this.box;
      const GUT = 50;
      const TOP = this.barLen ? 22 : 10;
      const BOTTOM = 8;
      const rows = this.range.hi - this.range.lo + 1;
      const rowH = (h - TOP - BOTTOM) / rows;
      let ppb = clamp((w - GUT) / 11, 34, 84);
      ppb = Math.max(ppb, 15 / this.minDur);
      ppb = Math.min(ppb, (w - GUT) / 3);
      const px = GUT + (w - GUT) * 0.26;
      const pos = this.playing ? this.pos : this.view;
      const hi = this.range.hi;
      return {
        GUT,
        TOP,
        BOTTOM,
        rowH,
        ppb,
        px,
        pos,
        x: (b) => px + (b - pos) * ppb,
        y: (m) => TOP + (hi - m) * rowH,
        cy: (mf) => TOP + (hi - mf + 0.5) * rowH,
      };
    }

    draw() {
      const g = this.g;
      const { w, h, dpr } = this.box;
      if (!w || !h) return;
      const C = VG.COL;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const G = this.geometry();
      const { GUT, TOP, rowH, x, y, cy } = G;
      const bottom = h - G.BOTTOM;
      const nn = (m, oct) => VG.nn(m, { key: this.key, octave: oct });
      g.fillStyle = C['roll-bg'];
      g.fillRect(0, 0, w, h);

      for (let m = this.range.lo; m <= this.range.hi; m++) {
        const pc = M.mod(m, 12);
        if (BLACK.includes(pc)) {
          g.fillStyle = C['roll-alt'];
          g.fillRect(GUT, y(m), w - GUT, rowH);
        }
        if (pc === 0) {
          g.fillStyle = C.line;
          g.fillRect(GUT, Math.round(y(m) + rowH) - 1, w - GUT, 1);
        }
      }

      const bStart = G.pos - (G.px - GUT) / G.ppb - 1;
      const bEnd = G.pos + (w - G.px) / G.ppb + 1;
      const bars = [];
      if (this.barLen) {
        for (let k = Math.floor((bStart - this.anacrusis) / this.barLen); ; k++) {
          const b = this.anacrusis + k * this.barLen;
          if (b > bEnd) break;
          if (b < -EPS || b > this.length + EPS) continue;
          const xx = Math.round(x(b));
          if (xx < GUT) continue;
          g.fillStyle = C.line;
          g.fillRect(xx, TOP, 1, bottom - TOP);
          if (b < this.length - EPS) bars.push([k + 1, xx]);
        }
        const xEnd = Math.round(x(this.length));
        if (xEnd > GUT && xEnd < w) {
          g.fillStyle = C.muted;
          g.fillRect(xEnd - 3, TOP, 1, bottom - TOP);
          g.fillRect(xEnd, TOP, 2, bottom - TOP);
        }
      }

      const visible = (n) => x(n.start + n.dur) >= GUT && x(n.start) <= w;
      g.fillStyle = C.voice1;
      for (const n of this.guide) {
        if (!visible(n)) continue;
        VG.roundRect(g, x(n.start) + 1, y(n.midi) + rowH * 0.22, Math.max(3, n.dur * G.ppb - 2), rowH * 0.56, rowH * 0.28);
        g.fill();
      }
      g.font = '600 ' + Math.round(clamp(rowH * 0.62, 9, 12)) + 'px ' + VG.FONT_BODY;
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      for (let i = 0; i < this.target.length; i++) {
        const n = this.target[i];
        if (!visible(n)) continue;
        const st = this.stats[i];
        const done = st && st.frames >= 4 && G.pos >= n.start + n.dur;
        let fill = C.voice2;
        let ink = C['on-voice2'];
        if (done) {
          const sc = st.ok / st.frames;
          fill = sc >= 0.7 ? C.good : sc >= 0.4 ? C.warn : C.bad;
          ink = C['on-status'];
        }
        const x0 = x(n.start) + 1;
        const wd = Math.max(3, n.dur * G.ppb - 2);
        const y0 = y(n.midi) + rowH * 0.08;
        const hh = rowH * 0.84;
        g.fillStyle = fill;
        VG.roundRect(g, x0, y0, wd, hh, Math.min(5, hh / 2));
        g.fill();
        if (this.playing && G.pos >= n.start && G.pos < n.start + n.dur) {
          g.strokeStyle = C.ink;
          g.lineWidth = 1.5;
          VG.roundRect(g, x0 - 1, y0 - 1, wd + 2, hh + 2, Math.min(6, hh / 2));
          g.stroke();
        }
        if (rowH >= 12 && wd > 34) {
          g.fillStyle = ink;
          g.fillText(nn(n.midi, false), x0 + 6, y0 + hh / 2 + 0.5);
        }
      }

      if (this.phrase && (this.phrase.start > EPS || this.phrase.end < this.length - EPS)) {
        g.fillStyle = C.dim;
        const xs = x(this.phrase.start);
        const xe = Math.max(GUT, x(this.phrase.end));
        if (xs > GUT) g.fillRect(GUT, TOP, xs - GUT, bottom - TOP);
        if (xe < w) g.fillRect(xe, TOP, w - xe, bottom - TOP);
      }

      const mLo = this.range.lo - 0.45;
      const mHi = this.range.hi + 0.45;
      g.lineWidth = 3;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      let prev = null;
      for (const pt of this.trace) {
        if (pt.b < bStart) {
          prev = pt;
          continue;
        }
        if (pt.b > bEnd) break;
        if (prev && pt.b - prev.b < 0.35 && Math.abs(pt.m - prev.m) < 1.2) {
          g.strokeStyle = VG.statusColor(pt.s);
          g.beginPath();
          g.moveTo(x(prev.b), cy(clamp(prev.m, mLo, mHi)));
          g.lineTo(x(pt.b), cy(clamp(pt.m, mLo, mHi)));
          g.stroke();
        }
        prev = pt;
      }

      g.globalAlpha = 0.7;
      g.fillStyle = C.ink;
      g.fillRect(Math.round(G.px) - 1, TOP - 4, 2, bottom - TOP + 4);
      g.globalAlpha = 1;

      if (this.live) {
        g.fillStyle = VG.statusColor(this.live.status);
        g.beginPath();
        g.arc(G.px, cy(clamp(this.live.disp, mLo, mHi)), 6, 0, Math.PI * 2);
        g.fill();
      }

      g.fillStyle = C['roll-bg'];
      g.fillRect(0, 0, GUT, h);
      if (this.barLen) g.fillRect(GUT, 0, w - GUT, TOP - 4);
      g.fillStyle = C.line;
      g.fillRect(GUT - 1, TOP, 1, bottom - TOP);
      g.font = '500 ' + Math.round(clamp(rowH * 0.7, 9, 11)) + 'px ' + VG.FONT_BODY;
      g.textAlign = 'right';
      for (let m = this.range.lo; m <= this.range.hi; m++) {
        const pc = M.mod(m, 12);
        if (rowH >= 11 ? !NATURAL.includes(pc) : pc !== 0) continue;
        g.fillStyle = pc === 0 ? C.ink : C.muted;
        g.fillText(nn(m, true), GUT - 7, cy(m) + 0.5);
      }
      g.font = '500 10px ' + VG.FONT_MONO;
      g.textAlign = 'left';
      g.fillStyle = C.muted;
      for (const [num, xx] of bars) g.fillText(String(num), xx + 4, TOP / 2 + 1);
      this.dirty = false;
    }

    /** Перетаскивание ленты пальцем или мышью, пока ничего не играет. */
    enableDrag(onSeek) {
      const c = this.canvas;
      let drag = null;
      c.addEventListener('pointerdown', (e) => {
        if (this.playing) return;
        drag = { x: e.clientX, b: this.view };
        try {
          c.setPointerCapture(e.pointerId);
        } catch (err) {
          /* не критично */
        }
        c.classList.add('is-dragging');
      });
      c.addEventListener('pointermove', (e) => {
        if (!drag) return;
        this.view = clamp(drag.b - (e.clientX - drag.x) / this.geometry().ppb, -1, this.length);
        this.dirty = true;
        if (onSeek) onSeek(this.view);
      });
      const end = () => {
        drag = null;
        c.classList.remove('is-dragging');
      };
      c.addEventListener('pointerup', end);
      c.addEventListener('pointercancel', end);
    }
  }
  VG.Roll = Roll;

  VG.noteAt = (notes, beat) => {
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      if (n.start > beat + EPS) break;
      if (beat >= n.start - EPS && beat < n.start + n.dur - EPS) return i;
    }
    return -1;
  };
  VG.firstNoteFrom = (notes, beat) => {
    for (let i = 0; i < notes.length; i++) if (notes[i].start + notes[i].dur > beat + EPS) return i;
    return -1;
  };

  // ---------- Проигрыватель упражнения ----------
  /**
   * Играет список событий и считает попадание в ноты target.
   * opts: { start, end, spb, countBeats, events: [{type:'note'|'chord'|'click', ...}], target, guide, range }
   */
  class Session {
    constructor(o) {
      Object.assign(this, o);
      this.stats = [];
      this.trace = [];
      this.micUsed = false;
      this.ended = false;
      this.pos = o.start - (o.countBeats || 0);
    }
    begin() {
      const ctx = VG.audio();
      this.run = engine.startRun();
      this.t0 = ctx.currentTime + 0.15 + (this.countBeats || 0) * this.spb;
      const at = (b) => this.t0 + (b - this.start) * this.spb;
      for (const e of this.events) {
        if (e.type === 'click') this.run.click(at(e.beat), e.accent);
        else if (e.type === 'chord') this.run.chord(e.bus || 'piano', e.midis, at(e.beat), e.dur * this.spb);
        else this.run.note(e.bus, e.midi, at(e.beat), e.dur * this.spb, e.timbre);
      }
      this.startedAt = Date.now();
      return this;
    }
    stop() {
      if (this.run) this.run.stop();
    }
    position() {
      return this.start + (engine.now - engine.latency() - this.t0) / this.spb;
    }
    /** Вызывать каждый кадр. Возвращает сведения для табло. */
    update(frame) {
      this.pos = this.position();
      const b = this.pos - MIC_LAG / this.spb;
      let tgt = null;
      let guide = null;
      let countdown = 0;
      if (this.pos < this.start) {
        countdown = Math.ceil((this.start - this.pos) / (this.pulse || 1) - EPS);
        const i = VG.firstNoteFrom(this.target, this.start);
        tgt = i >= 0 ? this.target[i].midi : null;
      } else {
        const i = VG.noteAt(this.target, b);
        const j = this.guide ? VG.noteAt(this.guide, b) : -1;
        tgt = i >= 0 ? this.target[i].midi : null;
        guide = j >= 0 ? this.guide[j].midi : null;
      }
      let cls = null;
      if (frame) {
        cls = VG.classify(frame.midi, tgt, guide, this.range);
        if (VG.mic.on && b >= this.start && b < this.end) this.record(b, frame, cls);
      }
      this.ended = this.pos >= this.end + Math.max(0.3, 0.3 / this.spb);
      return { tgt, guide, cls, countdown };
    }
    record(beat, frame, cls) {
      this.micUsed = true;
      const i = VG.noteAt(this.target, beat);
      if (i >= 0) {
        const n = this.target[i];
        const skip = Math.min(0.15 / this.spb, n.dur * 0.3);
        const tail = Math.min(0.06 / this.spb, n.dur * 0.1);
        if (beat >= n.start + skip && beat <= n.start + n.dur - tail) {
          const st = this.stats[i] || (this.stats[i] = { frames: 0, ok: 0, mel: 0 });
          st.frames++;
          if (cls && cls.status === 'ok') st.ok++;
          if (cls && cls.status === 'mel') st.mel++;
        }
      }
      if (cls) this.trace.push({ b: beat, m: cls.disp, s: cls.status });
    }
    score() {
      let wSum = 0;
      let sSum = 0;
      let scored = 0;
      let total = 0;
      let melNotes = 0;
      const per = [];
      this.target.forEach((n, i) => {
        if (n.start < this.start - EPS || n.start >= this.end - EPS) return;
        total++;
        const st = this.stats[i];
        if (!st || st.frames < 4) return;
        scored++;
        const sc = st.ok / st.frames;
        wSum += n.dur;
        sSum += sc * n.dur;
        if (st.mel / st.frames > 0.4) melNotes++;
        per.push({ n, i, sc });
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
    seconds() {
      return Math.round((Date.now() - (this.startedAt || Date.now())) / 1000);
    }
  }
  VG.Session = Session;

  // ---------- Табло попадания ----------
  class Readout {
    constructor(container, labels) {
      labels = labels || {};
      const box = VG.el('aside', 'readout');
      box.setAttribute('aria-label', 'Попадание в ноту');
      box.innerHTML =
        '<div class="ro-row"><div class="ro-cell"><span class="label"></span><strong class="ro-note ro-target">—</strong></div>' +
        '<div class="ro-cell"><span class="label">Вы поёте</span><strong class="ro-note ro-you">—</strong></div></div>' +
        '<div class="meter" aria-hidden="true"><div class="meter-track"><div class="meter-zone"></div><div class="meter-center"></div><div class="meter-needle"></div></div>' +
        '<div class="meter-scale"><span>ниже</span><span>точно</span><span>выше</span></div></div>' +
        '<p class="ro-hint" aria-live="polite"></p>';
      box.querySelector('.label').textContent = labels.target || 'Нужно петь';
      container.appendChild(box);
      this.box = box;
      this.tEl = box.querySelector('.ro-target');
      this.yEl = box.querySelector('.ro-you');
      this.needle = box.querySelector('.meter-needle');
      this.zone = box.querySelector('.meter-zone');
      this.hint = box.querySelector('.ro-hint');
      this.shown = {};
      this.hintAt = 0;
      this.setTol();
      VG.on('settings', () => this.setTol());
    }
    setTol() {
      const half = clamp(VG.settings.tol, 0, 100) / 2;
      this.zone.style.left = 50 - half + '%';
      this.zone.style.right = 50 - half + '%';
    }
    text(node, key, t) {
      if (this.shown[key] !== t) {
        this.shown[key] = t;
        node.textContent = t;
      }
    }
    update(o) {
      const key = o.key || null;
      this.text(this.tEl, 't', o.tgt != null ? VG.nn(o.tgt, { key }) : o.emptyTarget || 'пауза');
      this.text(this.yEl, 'y', o.midi != null ? VG.nn(o.midi, { key }) : '—');
      const st = o.cls && o.tgt != null ? o.cls.status : null;
      for (const n of [this.yEl, this.needle]) {
        n.classList.toggle('is-ok', st === 'ok');
        n.classList.toggle('is-off', st === 'off');
        n.classList.toggle('is-mel', st === 'mel');
      }
      if (o.cls && o.cls.cents != null) {
        this.needle.style.left = 50 + clamp(o.cls.cents, -100, 100) / 2 + '%';
        this.needle.classList.add('is-on');
      } else {
        this.needle.classList.remove('is-on');
      }
      const now = performance.now() / 1000;
      const hint = o.hint || '';
      if (this.shown.h !== hint && (now - this.hintAt > 0.25 || /^Вступление|^Отсчёт/.test(hint))) {
        this.hintAt = now;
        this.text(this.hint, 'h', hint);
      }
    }
    reset() {
      this.shown = {};
    }
  }
  VG.Readout = Readout;

  /** Подсказка под табло. */
  VG.hintText = (o) => {
    if (o.countdown > 0) return 'Вступление через ' + o.countdown + '…';
    if (!VG.mic.on) {
      if (!o.playing) return o.idle || 'Включите микрофон, чтобы видеть свой голос.';
      return o.listenOnly ? 'Слушайте фиолетовую партию.' : 'Пойте фиолетовые ноты.';
    }
    if (o.midi == null) return o.playing && o.tgt != null ? 'Не слышу голоса.' : 'Спойте ноту — покажу, куда вы попадаете.';
    if (o.tgt == null) return 'Пауза, можно вдохнуть.';
    const c = o.cls;
    if (c.status === 'ok') return 'Точно в ноте.';
    if (c.status === 'mel') return (o.melText || 'Вы поёте мелодию.') + ' Ваша нота ' + (o.tgt < o.guide ? 'ниже' : 'выше') + '.';
    return c.cents > 0 ? 'Выше, чем нужно. Опуститесь.' : 'Ниже, чем нужно. Поднимитесь.';
  };

  // ---------- Клавиатура ----------
  class Piano {
    constructor(container, o) {
      this.lo = o.lo;
      this.hi = o.hi;
      this.onPress = o.onPress;
      this.sound = o.sound !== false;
      this.box = VG.el('div', 'piano');
      this.box.setAttribute('role', 'group');
      this.box.setAttribute('aria-label', 'Клавиатура');
      container.appendChild(this.box);
      this.render();
      VG.on('settings', () => this.render());
    }
    setRange(lo, hi) {
      this.lo = lo;
      this.hi = hi;
      this.render();
    }
    render() {
      this.box.textContent = '';
      this.keys = {};
      let lo = this.lo;
      let hi = this.hi;
      if (BLACK.includes(M.mod(lo, 12))) lo--;
      if (BLACK.includes(M.mod(hi, 12))) hi++;
      const whites = [];
      for (let m = lo; m <= hi; m++) if (!BLACK.includes(M.mod(m, 12))) whites.push(m);
      const wPct = 100 / whites.length;
      whites.forEach((m, i) => {
        const k = this.key(m, 'pkey pkey-white');
        k.style.left = i * wPct + '%';
        k.style.width = wPct + '%';
        if (M.mod(m, 12) === 0 || whites.length <= 15) {
          const lab = VG.el('span', 'pkey-label', VG.nn(m, { octave: M.mod(m, 12) === 0 }));
          k.appendChild(lab);
        }
      });
      for (let m = lo; m <= hi; m++) {
        if (!BLACK.includes(M.mod(m, 12))) continue;
        const idx = whites.indexOf(m - 1);
        if (idx < 0) continue;
        const k = this.key(m, 'pkey pkey-black');
        k.style.left = (idx + 1) * wPct - wPct * 0.3 + '%';
        k.style.width = wPct * 0.6 + '%';
      }
    }
    key(m, cls) {
      const b = VG.el('button', cls);
      b.type = 'button';
      b.setAttribute('aria-label', VG.nn(m, { flats: false }));
      b.dataset.midi = m;
      b.addEventListener('click', () => {
        if (this.sound) engine.playNotes(m, 0.7, { timbre: 'piano', bus: 'piano' });
        VG.audio();
        if (this.onPress) this.onPress(m);
      });
      this.box.appendChild(b);
      this.keys[m] = b;
      return b;
    }
    mark(m, cls) {
      if (this.keys[m]) this.keys[m].classList.add(cls);
    }
    clear() {
      for (const k of Object.values(this.keys)) k.classList.remove('is-ok', 'is-bad', 'is-hint', 'is-on');
    }
  }
  VG.Piano = Piano;

  // ---------- Экран не гаснет во время занятия ----------
  let wakeLock = null;
  VG.keepAwake = async (on) => {
    try {
      if (on && !wakeLock && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
      if (!on && wakeLock) {
        wakeLock.release();
        wakeLock = null;
      }
    } catch (e) {
      wakeLock = null;
    }
  };

  // ---------- Разделы ----------
  VG.views = {};
  VG.params = {};
  VG.current = null;
  const ALIASES = { intervals: 'solfege' };
  VG.register = (name, mod) => {
    VG.views[name] = mod;
  };
  VG.go = (name, params) => {
    VG.params[name] = params || null;
    if (VG.current === name) {
      const mod = VG.views[name];
      if (mod && mod.enter) mod.enter(VG.params[name]);
      VG.params[name] = null;
    } else {
      location.hash = '#' + name;
    }
  };

  function route() {
    let v = (location.hash || '').slice(1);
    v = ALIASES[v] || v;
    const name = VG.views[v] && $('view-' + v) ? v : 'home';
    if (VG.current === name) return;
    const prev = VG.views[VG.current];
    if (prev && prev.leave) prev.leave();
    engine.stopOneShots();
    VG.current = name;
    for (const sec of VG.qsa('.view')) sec.hidden = sec.id !== 'view-' + name;
    for (const a of VG.qsa('[data-nav]')) {
      if (a.dataset.nav === name) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    const title = VG.qs('[data-nav="' + name + '"] .nav-text');
    const cur = $('topbar-current');
    if (cur) cur.textContent = title ? title.textContent : '';
    closeMenu();
    const mod = VG.views[name];
    if (mod && mod.enter) mod.enter(VG.params[name]);
    VG.params[name] = null;
    root.scrollTo(0, 0);
    VG.emit('route', name);
  }

  function closeMenu() {
    const nav = $('sidenav');
    const btn = $('menu-btn');
    if (nav) nav.classList.remove('is-open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  // ---------- Главный цикл ----------
  let lastTs = 0;
  function loop(ts) {
    root.requestAnimationFrame(loop);
    const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 1 / 60;
    lastTs = ts;
    const mod = VG.views[VG.current];
    VG.mic.wantSpectrum = !!(mod && mod.spectrum);
    const f = VG.mic.on ? VG.mic.read() : null;
    if (mod && mod.frame) mod.frame(f, dt);
  }

  function init() {
    VG.readColors();
    const mq = root.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', VG.readColors);
    new MutationObserver(VG.readColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });

    const btn = $('menu-btn');
    if (btn) {
      btn.addEventListener('click', () => {
        const nav = $('sidenav');
        const open = !nav.classList.contains('is-open');
        nav.classList.toggle('is-open', open);
        btn.setAttribute('aria-expanded', String(open));
      });
    }
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mic]');
      if (b) VG.toggleMic(b);
      const go = e.target.closest('[data-go]');
      if (go) {
        e.preventDefault();
        VG.go(go.dataset.go, go.dataset.param ? { id: go.dataset.param } : null);
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });

    for (const [name, mod] of Object.entries(VG.views)) {
      if (mod.init) {
        try {
          mod.init();
        } catch (err) {
          console.error('Раздел «' + name + '» не запустился:', err);
        }
      }
    }
    VG.updateMicUI();
    root.addEventListener('hashchange', route);
    route();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => VG.emit('colors'));
    root.requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 0);
})(typeof self !== 'undefined' ? self : this);
