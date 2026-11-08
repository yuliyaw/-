// Запуск: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/pitch.js');

function synth(freq, sr, n, harmonics, noise) {
  const buf = new Float32Array(n);
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < n; i++) {
    let v = 0;
    harmonics.forEach((a, k) => {
      v += a * Math.sin((2 * Math.PI * freq * (k + 1) * i) / sr + k);
    });
    buf[i] = 0.3 * v + (noise || 0) * rand();
  }
  return buf;
}

const cents = (f, ref) => 1200 * Math.log2(f / ref);

test('YIN находит высоту чистого тона и «голоса» с обертонами', () => {
  const detect = P.createDetector();
  const voice = [1, 0.6, 0.4, 0.25, 0.15, 0.1];
  for (const sr of [44100, 48000]) {
    for (const f of [82.41, 110, 196, 261.63, 329.63, 440, 659.25, 880]) {
      for (const h of [[1], voice]) {
        const r = detect(synth(f, sr, 2048, h, 0.01), sr);
        assert.ok(r, `нет результата для ${f} Гц @${sr}`);
        assert.ok(Math.abs(cents(r.freq, f)) < 8, `${f} Гц @${sr}: получили ${r.freq.toFixed(2)}`);
      }
    }
  }
});

test('YIN не путает октаву при слабой основной гармонике', () => {
  const detect = P.createDetector();
  const r = detect(synth(220, 48000, 2048, [0.4, 1, 0.7, 0.3], 0), 48000);
  assert.ok(r);
  assert.ok(Math.abs(cents(r.freq, 220)) < 8, `получили ${r.freq}`);
});

test('тишина и шум не дают высоты', () => {
  const detect = P.createDetector();
  assert.equal(detect(new Float32Array(2048), 48000), null);
  const noise = synth(0, 48000, 2048, [0], 0.3);
  assert.equal(detect(noise, 48000), null);
});
