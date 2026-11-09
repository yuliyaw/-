/*
 * Второй голос — анализ голоса: спектр, смыкание, звонкость, вибрато,
 * устойчивость, атака звука, полный отчёт по записи.
 * Работает в браузере (window.Voice) и в Node (module.exports) — для тестов.
 *
 * Все оценки приблизительные: это подсказка для самоконтроля, а не диагноз.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./pitch.js'));
  else root.Voice = factory(root.Pitch);
})(typeof self !== 'undefined' ? self : this, function (Pitch) {
  'use strict';

  const LOG10 = Math.log(10);
  const toDb = (x) => (20 * Math.log(x + 1e-12)) / LOG10;
  const median = (arr) => {
    if (!arr.length) return null;
    const s = arr.slice().sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const percentile = (arr, p) => {
    if (!arr.length) return null;
    const s = arr.slice().sort((a, b) => a - b);
    const i = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))));
    return s[i];
  };
  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const std = (arr) => {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    return Math.sqrt(arr.reduce((s, x) => s + (x - m) * (x - m), 0) / (arr.length - 1));
  };

  // ---------- БПФ ----------
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i];
        re[i] = re[j];
        re[j] = t;
        t = im[i];
        im[i] = im[j];
        im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len;
      const wr = Math.cos(ang);
      const wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1;
        let ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k;
          const b = a + len / 2;
          const xr = re[b] * cr - im[b] * ci;
          const xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr;
          im[b] = im[a] - xi;
          re[a] += xr;
          im[a] += xi;
          const nr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr;
          cr = nr;
        }
      }
    }
  }

  const windows = {};
  function hann(n) {
    if (!windows[n]) {
      const w = new Float64Array(n);
      let sum = 0;
      for (let i = 0; i < n; i++) {
        w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
        sum += w[i];
      }
      windows[n] = { w, sum };
    }
    return windows[n];
  }

  /** Амплитудный спектр в дБ (n/2 полос). Длина buf — степень двойки. */
  function spectrumDb(buf) {
    const n = buf.length;
    const { w, sum } = hann(n);
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = buf[i] * w[i];
    fft(re, im);
    const out = new Float32Array(n / 2);
    const scale = 2 / sum;
    for (let k = 0; k < n / 2; k++) out[k] = toDb(Math.hypot(re[k], im[k]) * scale);
    return out;
  }

  function peakDb(spec, binHz, f) {
    const a = Math.max(1, Math.floor((f * 0.85) / binHz));
    const b = Math.min(spec.length - 1, Math.ceil((f * 1.15) / binHz));
    let best = -Infinity;
    for (let k = a; k <= b; k++) if (spec[k] > best) best = spec[k];
    return best;
  }

  function bandDb(spec, binHz, f1, f2) {
    const a = Math.max(1, Math.floor(f1 / binHz));
    const b = Math.min(spec.length - 1, Math.ceil(f2 / binHz));
    let p = 0;
    for (let k = a; k <= b; k++) p += Math.pow(10, spec[k] / 10);
    return 10 * Math.log10(p + 1e-20);
  }

  /**
   * Признаки тембра по спектру при известной основной частоте f0:
   *  h1h2 — разница первой и второй гармоник, дБ. Чем больше, тем мягче и «воздушнее»
   *         смыкание (тонкие или неплотно сомкнутые связки); чем меньше, тем плотнее.
   *  ring — энергия в полосе 2–4 кГц относительно 0–2 кГц, дБ. Это «звон»: твэнг,
   *         певческая форманта, яркость.
   *  centroid — центр тяжести спектра, Гц: тёмный или светлый тембр.
   */
  function features(spec, sampleRate, n, f0) {
    const binHz = sampleRate / n;
    const h1 = peakDb(spec, binHz, f0);
    const h2 = peakDb(spec, binHz, 2 * f0);
    const low = bandDb(spec, binHz, 60, 2000);
    const ring = bandDb(spec, binHz, 2000, 4000);
    let num = 0;
    let den = 0;
    const kMax = Math.min(spec.length - 1, Math.floor(8000 / binHz));
    for (let k = Math.floor(60 / binHz); k <= kMax; k++) {
      const pw = Math.pow(10, spec[k] / 10);
      num += k * binHz * pw;
      den += pw;
    }
    return { h1h2: h1 - h2, ring: ring - low, centroid: den ? num / den : 0 };
  }

  // ---------- Кадры ----------
  /**
   * Один кадр анализа. buf — последние отсчёты (длина — степень двойки, обычно 4096).
   * detect — детектор высоты из Pitch.createDetector().
   */
  function makeFrame(buf, sampleRate, detect, t, wantSpectrum) {
    const n = buf.length;
    const pitchWin = Math.min(n, 2048);
    const body = buf.subarray(n - pitchWin);
    const level = Pitch.rms(body);
    const fast = Pitch.rms(buf.subarray(n - Math.min(n, 512)));
    const p = detect(body, sampleRate);
    const f = {
      t,
      db: toDb(level),
      dbFast: toDb(fast),
      midi: p ? p.midi : null,
      freq: p ? p.freq : null,
      clarity: p ? p.clarity : 0,
      h1h2: null,
      ring: null,
      centroid: null,
    };
    if (p && wantSpectrum && n >= 2048) {
      const ft = features(spectrumDb(buf), sampleRate, n, p.freq);
      f.h1h2 = ft.h1h2;
      f.ring = ft.ring;
      f.centroid = ft.centroid;
    }
    return f;
  }

  /**
   * Разбивает запись на кадры (каждые hop секунд). Работает кусками,
   * чтобы не подвешивать страницу: onProgress(0…1), в конце — resolve(frames).
   */
  function framesFromBuffer(data, sampleRate, opts) {
    opts = opts || {};
    const hop = opts.hop || 0.02;
    const n = 4096;
    // Нормируем громкость: записи с телефона часто тихие.
    let peak = 0;
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
    const gain = peak > 0 ? 0.9 / peak : 1;
    const buf = new Float32Array(n);
    const detect = Pitch.createDetector({ minRms: 0.004 });
    const frames = [];
    const step = Math.max(1, Math.round(hop * sampleRate));
    const total = Math.floor((data.length - 1) / step) + 1;
    return new Promise((resolve) => {
      let i = 0;
      const chunk = () => {
        const until = Math.min(total, i + 150);
        for (; i < until; i++) {
          const end = i * step;
          const start = end - n;
          for (let k = 0; k < n; k++) {
            const idx = start + k;
            buf[k] = idx >= 0 && idx < data.length ? data[idx] * gain : 0;
          }
          frames.push(makeFrame(buf, sampleRate, detect, end / sampleRate, true));
        }
        if (opts.onProgress) opts.onProgress(i / total);
        if (i < total) setTimeout(chunk, 0);
        else resolve(frames);
      };
      chunk();
    });
  }

  // ---------- Вибрато и устойчивость ----------
  /**
   * points: [{t, c}] — высота в центах внутри одной ноты.
   * Возвращает { present, rate (Гц), extent (±центов), wobble (центов), drift (центов) } или null.
   */
  function vibrato(points) {
    if (points.length < 10) return null;
    const t0 = points[0].t;
    const dur = points[points.length - 1].t - t0;
    if (dur < 0.6) return null;
    const dt = 0.01;
    const m = Math.floor(dur / dt);
    const y = new Float64Array(m);
    let j = 0;
    for (let i = 0; i < m; i++) {
      const t = t0 + i * dt;
      while (j < points.length - 2 && points[j + 1].t < t) j++;
      const a = points[j];
      const b = points[j + 1];
      const u = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
      y[i] = a.c + (b.c - a.c) * u;
    }
    // убираем медленный наклон (сползание ноты)
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    for (let i = 0; i < m; i++) {
      sx += i;
      sy += y[i];
      sxx += i * i;
      sxy += i * y[i];
    }
    const slope = (m * sxy - sx * sy) / (m * sxx - sx * sx || 1);
    const icpt = (sy - slope * sx) / m;
    const r = new Float64Array(m);
    for (let i = 0; i < m; i++) r[i] = y[i] - (icpt + slope * i);
    const drift = slope * m;

    let e0 = 0;
    for (let i = 0; i < m; i++) e0 += r[i] * r[i];
    const minLag = Math.round(1 / 8.5 / dt);
    const maxLag = Math.round(1 / 3.2 / dt);
    let bestLag = -1;
    let bestC = 0;
    const cs = [];
    for (let lag = minLag; lag <= maxLag && lag < m - 5; lag++) {
      let s = 0;
      for (let i = 0; i + lag < m; i++) s += r[i] * r[i + lag];
      const c = e0 > 0 ? (s / e0) * (m / (m - lag)) : 0;
      cs[lag] = c;
      if (c > bestC) {
        bestC = c;
        bestLag = lag;
      }
    }
    const arr = Array.from(r);
    const extent = (percentile(arr, 95) - percentile(arr, 5)) / 2;
    const wobble = std(arr);
    if (bestLag < 0 || bestC < 0.3 || extent < 12) {
      return { present: false, rate: null, extent, wobble, drift };
    }
    let lag = bestLag;
    if (cs[lag - 1] != null && cs[lag + 1] != null) {
      const d = cs[lag - 1] + cs[lag + 1] - 2 * cs[lag];
      if (Math.abs(d) > 1e-9) lag += (cs[lag - 1] - cs[lag + 1]) / (2 * d);
    }
    return { present: true, rate: 1 / (lag * dt), extent, wobble, drift, regularity: bestC };
  }

  // ---------- Начало и окончание звука ----------
  /**
   * Находит начала и окончания звука и определяет их тип:
   *  glottal — твёрдое (связки сомкнуты до выдоха, резкий щелчок),
   *  aspirate — с придыханием (сначала воздух, потом тон),
   *  smooth — мягкое (воздух и тон одновременно, плавное нарастание).
   */
  function detectEvents(frames, thrDb) {
    const onsets = [];
    const offsets = [];
    const sound = (f) => f.dbFast > thrDb;
    let inSound = false;
    let quietSince = frames.length ? frames[0].t : 0;
    let start = -1;
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      if (!inSound && sound(f)) {
        if (f.t - quietSince >= 0.12) {
          start = i;
          inSound = true;
          onsets.push(classifyOnset(frames, i));
        } else {
          inSound = true;
          start = -1;
        }
      } else if (inSound && !sound(f)) {
        // ждём, пока тишина продлится
        let k = i;
        while (k < frames.length && !sound(frames[k]) && frames[k].t - f.t < 0.12) k++;
        if (k >= frames.length || frames[k].t - f.t >= 0.12 || !sound(frames[k])) {
          if (start >= 0) {
            const off = classifyOffset(frames, start, i);
            if (off) offsets.push(off);
          }
          inSound = false;
          quietSince = f.t;
        }
      }
    }
    return { onsets, offsets };
  }

  function classifyOnset(frames, i) {
    const t0 = frames[i].t;
    let v = -1;
    for (let k = i; k < frames.length && frames[k].t - t0 < 0.6; k++) {
      if (frames[k].midi != null) {
        v = k;
        break;
      }
    }
    if (v < 0) return { t: t0, type: 'noise', air: null, rise: null };
    const air = frames[v].t - t0;
    let peak = -Infinity;
    for (let k = v; k < frames.length && frames[k].t - frames[v].t < 0.35; k++) peak = Math.max(peak, frames[k].dbFast);
    let reach = v;
    while (reach < frames.length - 1 && frames[reach].dbFast < peak - 4 && frames[reach].t - frames[v].t < 0.35) reach++;
    const rise = frames[reach].t - t0;
    let type;
    if (air >= 0.08) type = 'aspirate';
    else if (rise <= 0.035) type = 'glottal';
    else type = 'smooth';
    return { t: t0, type, air, rise };
  }

  function classifyOffset(frames, start, end) {
    let lastV = -1;
    for (let k = end - 1; k >= start; k--) {
      if (frames[k].midi != null) {
        lastV = k;
        break;
      }
    }
    if (lastV < 0) return null;
    // воздух после тона
    const tail = frames[end - 1].t - frames[lastV].t;
    // как долго звук затихал: от устойчивой громкости до конца тона
    const tEnd = frames[lastV].t;
    const ref = [];
    for (let k = start; k <= lastV; k++) {
      const age = tEnd - frames[k].t;
      if (age > 0.15 && age < 0.6) ref.push(frames[k].dbFast);
    }
    const steady = ref.length ? median(ref) : frames[lastV].dbFast;
    let k = lastV;
    while (k > start && frames[k].dbFast < steady - 3) k--;
    const fade = tEnd - frames[k].t;
    let type;
    if (tail >= 0.08) type = 'aspirate';
    else if (fade < 0.05) type = 'glottal';
    else type = 'smooth';
    return { t: tEnd, type, air: tail, fade };
  }

  // ---------- Ноты (устойчивые участки) ----------
  function segments(frames, opts) {
    opts = opts || {};
    const minDur = opts.minDur || 0.25;
    const out = [];
    let cur = null;
    const close = () => {
      if (cur && cur.t1 - cur.t0 >= minDur) out.push(cur);
      cur = null;
    };
    for (const f of frames) {
      if (f.midi == null) {
        if (cur && f.t - cur.t1 > 0.06) close();
        continue;
      }
      if (cur && Math.abs(f.midi - cur.ref) <= 0.7 && f.t - cur.t1 <= 0.08) {
        cur.pts.push({ t: f.t, c: f.midi * 100 });
        cur.t1 = f.t;
        if (cur.pts.length % 5 === 0) cur.ref = median(cur.pts.slice(-25).map((p) => p.c)) / 100;
      } else {
        close();
        cur = { t0: f.t, t1: f.t, ref: f.midi, pts: [{ t: f.t, c: f.midi * 100 }] };
      }
    }
    close();
    return out.map((s) => {
      const mid = median(s.pts.map((p) => p.c)) / 100;
      return { t0: s.t0, t1: s.t1, dur: s.t1 - s.t0, midi: mid, pts: s.pts, vib: vibrato(s.pts) };
    });
  }

  // ---------- Полный отчёт ----------
  function analyze(frames) {
    const rep = { duration: 0, voiced: 0, notes: [] };
    if (!frames.length) return rep;
    rep.duration = frames[frames.length - 1].t - frames[0].t;
    const dbs = frames.map((f) => f.db);
    const floor = percentile(dbs, 10);
    const thr = Math.max(floor + 12, -60);
    rep.floorDb = floor;
    const voicedF = frames.filter((f) => f.midi != null);
    const hop = frames.length > 1 ? (frames[frames.length - 1].t - frames[0].t) / (frames.length - 1) : 0.02;
    rep.voiced = voicedF.length * hop;
    if (!voicedF.length) return rep;

    const segs = segments(frames);
    rep.notes = segs;
    const stable = segs.length ? segs : [];
    if (stable.length) {
      rep.range = { lo: Math.min(...stable.map((s) => s.midi)), hi: Math.max(...stable.map((s) => s.midi)) };
    } else {
      const ms = voicedF.map((f) => f.midi);
      rep.range = { lo: percentile(ms, 5), hi: percentile(ms, 95) };
    }

    // Интонация: отклонение нот от ближайшего полутона, с поправкой на общий строй.
    if (stable.length) {
      const devs = stable.map((s) => (s.midi - Math.round(s.midi)) * 100);
      let sx = 0;
      let sy = 0;
      for (const d of devs) {
        sx += Math.cos((d / 100) * 2 * Math.PI);
        sy += Math.sin((d / 100) * 2 * Math.PI);
      }
      const offset = (Math.atan2(sy, sx) / (2 * Math.PI)) * 100;
      const rel = stable.map((s) => {
        let d = (s.midi * 100 - offset) % 100;
        if (d > 50) d -= 100;
        if (d < -50) d += 100;
        return d;
      });
      const weights = stable.map((s) => s.dur);
      const wsum = weights.reduce((a, b) => a + b, 0);
      const inTune = rel.reduce((s, d, i) => s + (Math.abs(d) <= 25 ? weights[i] : 0), 0) / wsum;
      const drifts = stable.filter((s) => s.vib).map((s) => s.vib.drift);
      rep.intonation = {
        offset,
        meanAbs: rel.reduce((s, d, i) => s + Math.abs(d) * weights[i], 0) / wsum,
        inTunePct: Math.round(inTune * 100),
        bias: rel.reduce((s, d, i) => s + d * weights[i], 0) / wsum,
        driftDown: drifts.length ? drifts.filter((d) => d < -20).length / drifts.length : 0,
      };
    }

    const longOnes = stable.filter((s) => s.vib);
    const vibs = longOnes.filter((s) => s.vib.present);
    rep.vibrato = {
      longNotes: longOnes.length,
      share: longOnes.length ? vibs.length / longOnes.length : 0,
      rate: vibs.length ? mean(vibs.map((s) => s.vib.rate)) : null,
      extent: vibs.length ? mean(vibs.map((s) => s.vib.extent)) : null,
    };
    const straight = longOnes.filter((s) => !s.vib.present);
    rep.wobble = straight.length ? median(straight.map((s) => s.vib.wobble)) : null;

    const spec = voicedF.filter((f) => f.h1h2 != null);
    rep.closure = {
      h1h2: spec.length ? median(spec.map((f) => f.h1h2)) : null,
      clarity: median(voicedF.map((f) => f.clarity)),
    };
    rep.ring = spec.length ? median(spec.map((f) => f.ring)) : null;
    rep.centroid = spec.length ? median(spec.map((f) => f.centroid)) : null;

    const loud = voicedF.map((f) => f.db);
    rep.dynamics = { soft: percentile(loud, 10), loud: percentile(loud, 90) };
    rep.dynamics.range = rep.dynamics.loud - rep.dynamics.soft;

    // Фразы: звучащие участки между паузами от 0,35 с.
    const phrases = [];
    let ps = null;
    let last = null;
    for (const f of frames) {
      const on = f.db > thr;
      if (on) {
        if (ps == null || (last != null && f.t - last > 0.35)) {
          if (ps != null) phrases.push(last - ps);
          ps = f.t;
        }
        last = f.t;
      }
    }
    if (ps != null && last != null) phrases.push(last - ps);
    const real = phrases.filter((d) => d >= 0.5);
    rep.phrases = { count: real.length, avg: mean(real), max: real.length ? Math.max(...real) : null };

    const ev = detectEvents(frames, thr);
    rep.onsets = { glottal: 0, aspirate: 0, smooth: 0 };
    for (const o of ev.onsets) if (rep.onsets[o.type] != null) rep.onsets[o.type]++;
    rep.offsets = { glottal: 0, aspirate: 0, smooth: 0 };
    for (const o of ev.offsets) if (rep.offsets[o.type] != null) rep.offsets[o.type]++;
    return rep;
  }

  /** Средние признаки по последним кадрам — для сравнения «вариант А / вариант Б». */
  function snapshot(frames) {
    const v = frames.filter((f) => f.midi != null);
    if (v.length < 5) return null;
    const pick = (k) => {
      const xs = v.map((f) => f[k]).filter((x) => x != null);
      return xs.length ? median(xs) : null;
    };
    return {
      midi: pick('midi'),
      db: pick('db'),
      clarity: pick('clarity'),
      h1h2: pick('h1h2'),
      ring: pick('ring'),
      centroid: pick('centroid'),
      wobble: std(v.map((f) => f.midi * 100)),
    };
  }

  return {
    fft,
    spectrumDb,
    features,
    makeFrame,
    framesFromBuffer,
    vibrato,
    detectEvents,
    segments,
    analyze,
    snapshot,
    median,
    percentile,
    mean,
    std,
  };
});
