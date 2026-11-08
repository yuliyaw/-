/*
 * Второй голос — музыкальная часть.
 * Разбор нотной записи, тональности, построение второго голоса.
 * Работает в браузере (window.Music) и в Node (module.exports) — для тестов.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Music = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
  };

  const NAMES = {
    solfege: {
      sharp: ['до', 'до♯', 'ре', 'ре♯', 'ми', 'фа', 'фа♯', 'соль', 'соль♯', 'ля', 'ля♯', 'си'],
      flat: ['до', 'ре♭', 'ре', 'ми♭', 'ми', 'фа', 'соль♭', 'соль', 'ля♭', 'ля', 'си♭', 'си'],
    },
    letters: {
      sharp: ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'],
      flat: ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'],
    },
  };

  const KEY_TONIC_RU = {
    major: ['до', 'ре-бемоль', 'ре', 'ми-бемоль', 'ми', 'фа', 'фа-диез', 'соль', 'ля-бемоль', 'ля', 'си-бемоль', 'си'],
    minor: ['до', 'до-диез', 'ре', 'ми-бемоль', 'ми', 'фа', 'фа-диез', 'соль', 'соль-диез', 'ля', 'си-бемоль', 'си'],
  };
  const KEY_TONIC_LAT = {
    major: ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'],
    minor: ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'],
  };
  const FLAT_KEYS = { major: [1, 3, 5, 8, 10], minor: [0, 2, 3, 5, 7, 10] };

  const INTERVAL_NAMES = [
    'унисон', 'малая секунда', 'большая секунда', 'малая терция', 'большая терция',
    'чистая кварта', 'тритон', 'чистая квинта', 'малая секста', 'большая секста',
    'малая септима', 'большая септима', 'октава',
  ];

  /** Как строится второй голос: сдвиг в ступенях гаммы. */
  const HARMONY_MODES = {
    third_below: { steps: -2, label: 'Терция ниже', hint: 'самый частый второй голос' },
    sixth_below: { steps: -5, label: 'Секста ниже', hint: 'для низких голосов' },
    third_above: { steps: 2, label: 'Терция выше', hint: 'подголосок сверху' },
    drone: { steps: 0, label: 'Держать тонику', hint: 'одна опорная нота' },
  };

  const EPS = 1e-6;
  const mod = (n, m) => ((n % m) + m) % m;
  const round6 = (x) => Math.round(x * 1e6) / 1e6;

  // ---------- Частоты ----------
  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);

  /** Отклонение в центах; при fold — без учёта октавы (−600…+600). */
  function centsOff(userMidi, targetMidi, fold) {
    let c = (userMidi - targetMidi) * 100;
    if (fold) c = mod(c + 600, 1200) - 600;
    return c;
  }

  // ---------- Тональности ----------
  function makeKey(tonic, mode) {
    return { tonic: mod(Math.round(tonic), 12), mode: mode === 'minor' ? 'minor' : 'major' };
  }
  function parseKeyId(id) {
    const p = String(id).split(':');
    return makeKey(parseInt(p[0], 10) || 0, p[1]);
  }
  const keyId = (key) => key.tonic + ':' + key.mode;
  const transposeKey = (key, semis) => makeKey(key.tonic + semis, key.mode);
  const usesFlats = (key) => FLAT_KEYS[key.mode].includes(key.tonic);

  function keyName(key, style) {
    const tonic = (style === 'letters' ? KEY_TONIC_LAT : KEY_TONIC_RU)[key.mode][key.tonic];
    return tonic + ' ' + (key.mode === 'minor' ? 'минор' : 'мажор');
  }

  function noteName(midi, opts) {
    opts = opts || {};
    const set = NAMES[opts.style === 'letters' ? 'letters' : 'solfege'][opts.flats ? 'flat' : 'sharp'];
    const m = Math.round(midi);
    const name = set[mod(m, 12)];
    return opts.octave === false ? name : name + (Math.floor(m / 12) - 1);
  }

  function intervalName(semis) {
    const s = Math.abs(Math.round(semis));
    return INTERVAL_NAMES[s > 12 ? (s % 12 === 0 ? 12 : s % 12) : s];
  }

  // ---------- Ступени ----------
  /** Нота → ступень гаммы (с учётом октавы) и знак альтерации. */
  function midiToDegree(midi, key) {
    const scale = SCALES[key.mode];
    const rel = midi - key.tonic;
    const oct = Math.floor(rel / 12);
    const pc = mod(rel, 12);
    let idx = scale.indexOf(pc);
    let alt = 0;
    if (idx < 0) {
      idx = scale.indexOf(pc - 1);
      alt = 1;
      if (idx < 0) {
        idx = scale.indexOf(pc + 1);
        alt = -1;
      }
    }
    return { deg: oct * 7 + idx, alt };
  }

  function degreeToMidi(deg, key) {
    const scale = SCALES[key.mode];
    return key.tonic + Math.floor(deg / 7) * 12 + scale[mod(deg, 7)];
  }

  const shiftDiatonic = (midi, key, steps) => degreeToMidi(midiToDegree(midi, key).deg + steps, key);
  const inKey = (midi, key) => SCALES[key.mode].includes(mod(midi - key.tonic, 12));

  // ---------- Нотная запись ----------
  // Пишем ноты через пробел: до ре ми:2 | C4 D4:0.5 E4 … (см. справку в редакторе).
  const SOLFEGE = [['соль', 7], ['сол', 7], ['до', 0], ['ре', 2], ['ми', 4], ['фа', 5], ['ля', 9], ['си', 11]];
  const LETTERS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 };
  // Кириллические буквы, похожие на латинские (частая опечатка на русской раскладке).
  const LOOKALIKE = { 'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'Н': 'H', 'а': 'A', 'с': 'C', 'е': 'E' };
  const REST_WORDS = ['r', 'z', 'п', 'пауза'];

  function parseDuration(str) {
    const s = String(str).trim().replace(',', '.');
    let v;
    if (s.includes('/')) {
      const p = s.split('/');
      v = Number(p[0]) / Number(p[1]);
    } else {
      v = s === '' ? NaN : Number(s);
    }
    return isFinite(v) && v > 0 && v <= 64 ? v : NaN;
  }

  function parseToken(tok) {
    let body = tok;
    let durStr = null;
    const ci = tok.indexOf(':');
    if (ci >= 0) {
      body = tok.slice(0, ci);
      durStr = tok.slice(ci + 1);
    }
    const res = { rest: false, midi: null, dur: null };
    if (durStr !== null) {
      res.dur = parseDuration(durStr);
      if (isNaN(res.dur)) return { error: 'не понимаю длительность «' + durStr + '»' };
    }
    const low = body.toLowerCase();
    if (REST_WORDS.includes(low)) {
      res.rest = true;
      return res;
    }
    if (!body) return { error: 'нет названия ноты' };

    let pc = null;
    let rest = '';
    for (const [name, val] of SOLFEGE) {
      if (low.startsWith(name)) {
        pc = val;
        rest = body.slice(name.length);
        break;
      }
    }
    if (pc === null) {
      const ch = LOOKALIKE[body[0]] || body[0].toUpperCase();
      if (Object.prototype.hasOwnProperty.call(LETTERS, ch)) {
        pc = LETTERS[ch];
        rest = body.slice(1);
      }
    }
    if (pc === null) return { error: 'не узнаю ноту «' + body + '»' };

    let acc = 0;
    while (rest.length) {
      const c = rest[0];
      if (c === '#' || c === '♯') acc++;
      else if (c === 'b' || c === '♭' || c === 'б') acc--;
      else break;
      rest = rest.slice(1);
    }
    let octave = 4;
    const m = /^\d+/.exec(rest);
    if (m) {
      octave = parseInt(m[0], 10);
      rest = rest.slice(m[0].length);
    }
    while (rest.length && "',’".includes(rest[0])) {
      octave += rest[0] === ',' ? -1 : 1;
      rest = rest.slice(1);
    }
    if (rest.length) return { error: 'лишние символы «' + rest + '»' };
    const midi = (octave + 1) * 12 + pc + acc;
    if (midi < 24 || midi > 108) return { error: 'нота вне диапазона' };
    res.midi = midi;
    return res;
  }

  /**
   * Текст → ноты. Длительность в долях (четвертях); если не указана — четверть (1).
   * Возвращает { notes: [{midi, start, dur}], length, errors: [{index, token, message}] }.
   */
  function parseMelody(text) {
    const tokens = String(text || '').split(/[\s|]+/).filter(Boolean);
    const notes = [];
    const errors = [];
    let t = 0;
    tokens.forEach((tok, index) => {
      const r = parseToken(tok);
      if (r.error) {
        errors.push({ index, token: tok, message: r.error });
        return;
      }
      const dur = r.dur || 1;
      if (!r.rest) notes.push({ midi: r.midi, start: round6(t), dur });
      t = round6(t + dur);
    });
    return { notes, length: t, errors };
  }

  // ---------- Второй голос ----------
  /**
   * Строит второй голос по мелодии.
   * mode: third_below | sixth_below | third_above | drone.
   * opts: { barLen, anacrusis } — нужны для режима drone (нота повторяется в каждом такте).
   */
  function harmonize(notes, key, mode, opts) {
    if (!notes.length) return [];
    if (mode === 'drone') return drone(notes, key, opts || {});
    const def = HARMONY_MODES[mode] || HARMONY_MODES.third_below;
    const out = notes.map((n) => ({ midi: shiftDiatonic(n.midi, key, def.steps), start: n.start, dur: n.dur }));
    cadence(notes, out, key, def.steps < 0);
    return out;
  }

  /**
   * Если мелодия заканчивается на тонике, второй голос приходит к ближайшему звуку
   * тонического трезвучия (часто — в унисон с мелодией), а не к случайной ступени.
   */
  function cadence(mel, out, key, below) {
    const L = mel.length - 1;
    const last = mel[L];
    if (mod(last.midi - key.tonic, 12) !== 0) return;
    let k = L;
    while (k > 0 && mel[k - 1].midi === last.midi && Math.abs(mel[k - 1].start + mel[k - 1].dur - mel[k].start) < EPS) k--;
    const prev = k > 0 ? out[k - 1].midi : out[L].midi;
    const s = SCALES[key.mode];
    const triad = [0, s[2], s[4]];
    let best = null;
    let bestD = Infinity;
    for (let m = last.midi - 12; m <= last.midi + 12; m++) {
      if (!triad.includes(mod(m - key.tonic, 12))) continue;
      if (below ? m > last.midi : m < last.midi) continue;
      const d = Math.abs(m - prev);
      if (d < bestD || (d === bestD && m !== last.midi)) {
        best = m;
        bestD = d;
      }
    }
    if (best !== null) for (let i = k; i <= L; i++) out[i].midi = best;
  }

  /** Тоника под мелодией, повторяется в каждом такте. */
  function drone(notes, key, opts) {
    const sorted = notes.map((n) => n.midi).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const tonic = median - mod(median - key.tonic, 12);
    const barLen = opts.barLen || 4;
    const ana = opts.anacrusis || 0;
    const out = [];
    for (const n of notes) {
      const bar = Math.floor((n.start - ana + EPS) / barLen);
      const cur = out[out.length - 1];
      if (cur && cur.bar === bar && Math.abs(cur.start + cur.dur - n.start) < EPS) {
        cur.dur = round6(n.start + n.dur - cur.start);
      } else {
        out.push({ midi: tonic, start: n.start, dur: n.dur, bar });
      }
    }
    return out.map((o) => ({ midi: o.midi, start: o.start, dur: o.dur }));
  }

  // ---------- Определение тональности (Крумхансл — Шмуклер) ----------
  const KK = {
    major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    minor: [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
  };

  function pearson(a, b) {
    const n = a.length;
    const ma = a.reduce((s, x) => s + x, 0) / n;
    const mb = b.reduce((s, x) => s + x, 0) / n;
    let num = 0;
    let da = 0;
    let db = 0;
    for (let i = 0; i < n; i++) {
      num += (a[i] - ma) * (b[i] - mb);
      da += (a[i] - ma) ** 2;
      db += (b[i] - mb) ** 2;
    }
    return da && db ? num / Math.sqrt(da * db) : 0;
  }

  function detectKey(notes) {
    if (!notes.length) return makeKey(0, 'major');
    const hist = new Array(12).fill(0);
    for (const n of notes) hist[mod(n.midi, 12)] += n.dur;
    const lastPc = mod(notes[notes.length - 1].midi, 12);
    let best = null;
    for (const mode of ['major', 'minor']) {
      for (let t = 0; t < 12; t++) {
        const prof = hist.map((_, i) => KK[mode][mod(i - t, 12)]);
        let r = pearson(hist, prof);
        if (lastPc === t) r += 0.25;
        if (!best || r > best.r) best = { r, tonic: t, mode };
      }
    }
    return makeKey(best.tonic, best.mode);
  }

  // ---------- Размер и фразы ----------
  const barLength = (meter) => (meter[0] * 4) / meter[1];
  /** Счётная доля: в 6/8, 9/8, 12/8 считаем четвертями с точкой. */
  const pulseLength = (meter) => (meter[1] === 8 && meter[0] % 3 === 0 ? 1.5 : 4 / meter[1]);

  function phrases(length, barLen, phraseBars) {
    const size = barLen * (phraseBars || 4);
    const out = [];
    for (let s = 0; s < length - EPS; s = round6(s + size)) out.push({ start: s, end: Math.min(length, round6(s + size)) });
    if (out.length > 1) {
      const tail = out[out.length - 1];
      if (tail.end - tail.start < barLen - EPS) out[out.length - 2].end = out.pop().end;
    }
    return out;
  }

  return {
    SCALES,
    HARMONY_MODES,
    mod,
    midiToFreq,
    freqToMidi,
    centsOff,
    makeKey,
    parseKeyId,
    keyId,
    keyName,
    transposeKey,
    usesFlats,
    noteName,
    intervalName,
    midiToDegree,
    degreeToMidi,
    shiftDiatonic,
    inKey,
    parseDuration,
    parseToken,
    parseMelody,
    harmonize,
    detectKey,
    barLength,
    pulseLength,
    phrases,
  };
});
