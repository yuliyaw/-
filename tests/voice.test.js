// Запуск: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../js/voice.js');

const SR = 48000;

function tone(f0, n, amps, extra) {
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    amps.forEach((a, k) => {
      v += a * Math.sin((2 * Math.PI * f0 * (k + 1) * i) / SR);
    });
    if (extra) v += extra.amp * Math.sin((2 * Math.PI * extra.f * i) / SR);
    buf[i] = 0.2 * v;
  }
  return buf;
}

test('H1–H2: «воздушный» звук больше, «плотный» меньше', () => {
  const soft = V.features(V.spectrumDb(tone(220, 4096, [1, 0.3, 0.2, 0.1])), SR, 4096, 220);
  const pressed = V.features(V.spectrumDb(tone(220, 4096, [0.5, 1, 0.8, 0.6])), SR, 4096, 220);
  assert.ok(Math.abs(soft.h1h2 - 10.46) < 1.5, 'soft ' + soft.h1h2);
  assert.ok(Math.abs(pressed.h1h2 + 6.02) < 1.5, 'pressed ' + pressed.h1h2);
});

test('звон (2–4 кГц) растёт, когда там есть энергия', () => {
  const dull = V.features(V.spectrumDb(tone(220, 4096, [1, 0.5, 0.3])), SR, 4096, 220);
  const bright = V.features(V.spectrumDb(tone(220, 4096, [1, 0.5, 0.3], { f: 3080, amp: 0.4 })), SR, 4096, 220);
  assert.ok(bright.ring - dull.ring > 15, `${dull.ring} → ${bright.ring}`);
  assert.ok(bright.centroid > dull.centroid);
});

test('вибрато: частота и размах находятся, ровный звук — без вибрато', () => {
  const pts = [];
  for (let t = 0; t < 1.6; t += 1 / 60) pts.push({ t, c: 5700 + 40 * Math.sin(2 * Math.PI * 5.5 * t) + 3 * Math.sin(t * 37) });
  const v = V.vibrato(pts);
  assert.ok(v.present);
  assert.ok(Math.abs(v.rate - 5.5) < 0.35, 'rate ' + v.rate);
  assert.ok(Math.abs(v.extent - 40) < 8, 'extent ' + v.extent);
  const flat = [];
  for (let t = 0; t < 1.6; t += 1 / 60) flat.push({ t, c: 5700 + 4 * Math.sin(t * 37) - 10 * t });
  const s = V.vibrato(flat);
  assert.equal(s.present, false);
  assert.ok(s.wobble < 8);
  assert.ok(s.drift < -10 && s.drift > -20, 'drift ' + s.drift);
});

test('разбор записи: диапазон, вибрато, три вида атаки и окончания', async () => {
  const parts = [];
  let seed = 7;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const silence = (s) => {
    const n = Math.round(s * SR);
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) b[i] = 0.0003 * noise();
    parts.push(b);
  };
  const voice = (f0, s, opts) => {
    opts = opts || {};
    const n = Math.round(s * SR);
    const b = new Float32Array(n);
    let ph = 0;
    const air = Math.round((opts.air || 0) * SR);
    const airAfter = Math.round((opts.airAfter || 0) * SR);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      if (i < air || i >= n - airAfter) {
        b[i] = 0.08 * noise();
        continue;
      }
      const f = f0 * Math.pow(2, ((opts.vib || 0) * Math.sin(2 * Math.PI * 5.5 * t)) / 1200);
      ph += (2 * Math.PI * f) / SR;
      let fade = opts.fade ? Math.min(1, (i - air) / (opts.fade * SR)) : 1;
      if (opts.fadeOut) fade *= Math.min(1, (n - airAfter - i) / (opts.fadeOut * SR));
      b[i] = 0.3 * fade * (Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.25 * Math.sin(3 * ph));
    }
    parts.push(b);
  };
  silence(0.4);
  voice(220, 1.6, { air: 0.15, vib: 35 });
  silence(0.5);
  voice(329.63, 1.0, { fadeOut: 0.3 });
  silence(0.5);
  voice(261.63, 1.15, { fade: 0.15, airAfter: 0.15 });
  silence(0.4);
  const total = parts.reduce((s, p) => s + p.length, 0);
  const data = new Float32Array(total);
  let o = 0;
  for (const p of parts) {
    data.set(p, o);
    o += p.length;
  }
  const frames = await V.framesFromBuffer(data, SR, { hop: 0.01 });
  const rep = V.analyze(frames);
  assert.ok(Math.abs(rep.range.lo - 57) < 0.3, 'lo ' + rep.range.lo);
  assert.ok(Math.abs(rep.range.hi - 64) < 0.3, 'hi ' + rep.range.hi);
  assert.equal(rep.onsets.aspirate, 1, JSON.stringify(rep.onsets));
  assert.equal(rep.onsets.glottal, 1, JSON.stringify(rep.onsets));
  assert.equal(rep.onsets.smooth, 1, JSON.stringify(rep.onsets));
  assert.deepEqual(rep.offsets, { glottal: 1, aspirate: 1, smooth: 1 });
  assert.ok(rep.vibrato.share > 0 && rep.vibrato.share < 1, 'vibrato share ' + rep.vibrato.share);
  assert.ok(Math.abs(rep.vibrato.rate - 5.5) < 0.5, 'rate ' + rep.vibrato.rate);
  assert.equal(rep.phrases.count, 3);
  assert.ok(rep.intonation.inTunePct >= 90, 'in tune ' + rep.intonation.inTunePct);
});
