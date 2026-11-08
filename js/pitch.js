/*
 * Второй голос — определение высоты голоса (алгоритм YIN).
 * Работает в браузере (window.Pitch) и в Node (module.exports) — для тестов.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Pitch = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function rms(buf) {
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / buf.length);
  }

  /**
   * YIN: de Cheveigné & Kawahara, 2002.
   * Возвращает { freq, clarity } или null, если в сигнале нет ясной высоты.
   */
  function yin(buf, sampleRate, opts, scratch) {
    opts = opts || {};
    const minF = opts.minFreq || 65;
    const maxF = opts.maxFreq || 1100;
    const threshold = opts.threshold || 0.15;
    const n = buf.length;
    const maxTau = Math.min(Math.floor(sampleRate / minF), Math.floor(n / 2));
    const minTau = Math.max(2, Math.floor(sampleRate / maxF));
    const W = n - maxTau - 1;
    if (W < maxTau / 2) return null;

    const cmnd = scratch && scratch.length >= maxTau + 1 ? scratch : new Float32Array(maxTau + 1);
    cmnd[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= maxTau; tau++) {
      let sum = 0;
      for (let i = 0; i < W; i++) {
        const d = buf[i] - buf[i + tau];
        sum += d * d;
      }
      running += sum;
      cmnd[tau] = running > 0 ? (sum * tau) / running : 1;
    }

    let tauEst = -1;
    for (let tau = minTau; tau <= maxTau; tau++) {
      if (cmnd[tau] < threshold) {
        while (tau + 1 <= maxTau && cmnd[tau + 1] < cmnd[tau]) tau++;
        tauEst = tau;
        break;
      }
    }
    if (tauEst < 0) {
      let best = minTau;
      for (let tau = minTau + 1; tau <= maxTau; tau++) if (cmnd[tau] < cmnd[best]) best = tau;
      if (cmnd[best] > 0.3) return null;
      tauEst = best;
    }

    let refined = tauEst;
    if (tauEst > 1 && tauEst < maxTau) {
      const s0 = cmnd[tauEst - 1];
      const s1 = cmnd[tauEst];
      const s2 = cmnd[tauEst + 1];
      const denom = s0 + s2 - 2 * s1;
      if (Math.abs(denom) > 1e-12) refined = tauEst + (s0 - s2) / (2 * denom);
    }
    return { freq: sampleRate / refined, clarity: 1 - cmnd[tauEst] };
  }

  /**
   * Детектор для живого звука: при высокой частоте дискретизации
   * сначала прореживает сигнал вдвое (так в 4 раза быстрее, точность не страдает).
   */
  function createDetector(opts) {
    opts = opts || {};
    let dec = null;
    let scratch = null;
    const minRms = opts.minRms || 0.006;
    return function detect(buf, sampleRate) {
      const level = rms(buf);
      if (level < minRms) return null;
      let input = buf;
      let sr = sampleRate;
      if (sampleRate > 30000) {
        const n2 = buf.length >> 1;
        if (!dec || dec.length !== n2) dec = new Float32Array(n2);
        for (let i = 0; i < n2; i++) dec[i] = 0.5 * (buf[2 * i] + buf[2 * i + 1]);
        input = dec;
        sr = sampleRate / 2;
      }
      if (!scratch) scratch = new Float32Array(input.length);
      const r = yin(input, sr, opts, scratch);
      if (!r || r.clarity < (opts.minClarity || 0.75)) return null;
      return { freq: r.freq, midi: 69 + 12 * Math.log2(r.freq / 440), clarity: r.clarity, rms: level };
    };
  }

  return { rms, yin, createDetector };
});
