// Запуск: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/music.js');
const Songs = require('../js/songs.js');

test('разбор нот: латиница, сольфеджио, октавы, знаки, длительности', () => {
  const r = M.parseMelody('C4 до ре:2 | ми4:0,5 F#4 сиb3:1/2 H3 Bb4 R:1 соль\' ля,');
  assert.deepEqual(r.errors, []);
  assert.deepEqual(
    r.notes.map((n) => n.midi),
    [60, 60, 62, 64, 66, 58, 59, 70, 79, 57],
  );
  assert.deepEqual(
    r.notes.map((n) => n.dur),
    [1, 1, 2, 0.5, 1, 0.5, 1, 1, 1, 1],
  );
  // пауза R:1 сдвигает время, но нотой не становится
  assert.equal(r.notes[8].start, r.notes[7].start + 1 + 1);
  assert.equal(r.length, 11);
});

test('разбор нот: кириллические «С», «Е», «А» вместо латинских', () => {
  const r = M.parseMelody('С4 Е4 А4');
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.notes.map((n) => n.midi), [60, 64, 69]);
});

test('разбор нот: ошибки показываются понятно', () => {
  const r = M.parseMelody('до ры ми:x');
  assert.equal(r.errors.length, 2);
  assert.equal(r.errors[0].token, 'ры');
  assert.match(r.errors[1].message, /длительность/);
});

test('ступени и диатонический сдвиг', () => {
  const C = M.makeKey(0, 'major');
  assert.equal(M.shiftDiatonic(64, C, -2), 60); // ми → до
  assert.equal(M.shiftDiatonic(62, C, -2), 59); // ре → си
  assert.equal(M.shiftDiatonic(60, C, -2), 57); // до → ля
  assert.equal(M.shiftDiatonic(60, C, -5), 52); // до → ми (секста ниже)
  assert.equal(M.shiftDiatonic(60, C, 2), 64); // до → ми (терция выше)
  const G = M.makeKey(7, 'major');
  assert.equal(M.shiftDiatonic(69, G, -2), 66); // ля → фа-диез
  const Am = M.makeKey(9, 'minor');
  assert.equal(M.shiftDiatonic(72, Am, -2), 69); // до → ля
  assert.equal(M.shiftDiatonic(68, Am, -2), 64); // соль-диез (вводный тон) → ми
});

test('второй голос терцией ниже приходит к устойчивому звуку в конце', () => {
  const C = M.makeKey(0, 'major');
  const mel = M.parseMelody('E4 D4 C4:2').notes;
  const h = M.harmonize(mel, C, 'third_below');
  assert.deepEqual(h.map((n) => n.midi), [60, 59, 60]); // до си до (унисон в конце)
  const h6 = M.harmonize(mel, C, 'sixth_below');
  assert.deepEqual(h6.map((n) => n.midi), [55, 53, 52]); // соль фа ми
  const h3 = M.harmonize(mel, C, 'third_above');
  assert.deepEqual(h3.map((n) => n.midi), [67, 65, 64]); // соль фа ми
});

test('второй голос никогда не выше мелодии в «нижних» режимах', () => {
  for (const s of Songs) {
    const mel = M.parseMelody(s.melody).notes;
    const key = M.parseKeyId(s.key);
    for (const mode of ['third_below', 'sixth_below']) {
      const h = M.harmonize(mel, key, mode);
      h.forEach((n, i) => assert.ok(n.midi <= mel[i].midi, `${s.id} ${mode} нота ${i}`));
    }
    const up = M.harmonize(mel, key, 'third_above');
    up.forEach((n, i) => assert.ok(n.midi >= mel[i].midi, `${s.id} third_above нота ${i}`));
  }
});

test('бурдон: тоника, одна нота на такт', () => {
  const C = M.makeKey(0, 'major');
  const mel = M.parseMelody('E4 F4 G4 F4 | E4 D4 E4:2').notes;
  const h = M.harmonize(mel, C, 'drone', { barLen: 4, anacrusis: 0 });
  assert.deepEqual(h, [
    { midi: 60, start: 0, dur: 4 },
    { midi: 60, start: 4, dur: 4 },
  ]);
});

test('библиотека: без ошибок, такты ровные, готовые партии совпадают по длине', () => {
  for (const s of Songs) {
    const mel = M.parseMelody(s.melody);
    assert.deepEqual(mel.errors, [], s.id);
    const bar = M.barLength(s.meter);
    const body = mel.length - (s.anacrusis || 0);
    // последний такт вместе с затактом образует целый такт
    assert.equal((body + (s.anacrusis || 0)) % bar, 0, `${s.id}: длина ${mel.length} не кратна такту`);
    if (s.harmony) {
      const h = M.parseMelody(s.harmony);
      assert.deepEqual(h.errors, [], s.id);
      assert.equal(h.length, mel.length, `${s.id}: длина второго голоса`);
      h.notes.forEach((n) => {
        // в готовых партиях второй голос не выше мелодии в тот же момент
        const m = mel.notes.find((x) => x.start <= n.start + 1e-6 && x.start + x.dur > n.start + 1e-6);
        if (m) assert.ok(n.midi <= m.midi, `${s.id}: нота ${n.start}`);
      });
    }
  }
});

test('тональность определяется по мелодии', () => {
  const ode = Songs.find((s) => s.id === 'ode-to-joy');
  assert.deepEqual(M.detectKey(M.parseMelody(ode.melody).notes), M.makeKey(0, 'major'));
  const grace = Songs.find((s) => s.id === 'amazing-grace');
  assert.deepEqual(M.detectKey(M.parseMelody(grace.melody).notes), M.makeKey(7, 'major'));
  const minor = M.parseMelody('A4 B4 C5 D5 E5:2 C5:1 A4 G#4 A4 B4 G#4 A4:4').notes;
  assert.deepEqual(M.detectKey(minor), M.makeKey(9, 'minor'));
});

test('фразы режутся по тактам, хвост короче такта приклеивается', () => {
  assert.deepEqual(M.phrases(64, 4, 4), [
    { start: 0, end: 16 },
    { start: 16, end: 32 },
    { start: 32, end: 48 },
    { start: 48, end: 64 },
  ]);
  assert.deepEqual(M.phrases(18, 4, 4), [{ start: 0, end: 18 }]);
  assert.deepEqual(M.phrases(34, 4, 4).pop(), { start: 16, end: 34 });
  assert.deepEqual(M.phrases(48, 3, 4), [
    { start: 0, end: 12 },
    { start: 12, end: 24 },
    { start: 24, end: 36 },
    { start: 36, end: 48 },
  ]);
});

test('названия нот и тональностей', () => {
  assert.equal(M.noteName(60), 'до4');
  assert.equal(M.noteName(61, { flats: true }), 'ре♭4');
  assert.equal(M.noteName(70, { style: 'letters', flats: true, octave: false }), 'B♭');
  assert.equal(M.keyName(M.makeKey(10, 'major')), 'си-бемоль мажор');
  assert.equal(M.keyName(M.makeKey(6, 'minor')), 'фа-диез минор');
  assert.equal(M.intervalName(-3), 'малая терция');
  assert.equal(M.intervalName(9), 'большая секста');
});

test('отклонение в центах с учётом октавы', () => {
  assert.ok(Math.abs(M.centsOff(60.2, 60, false) - 20) < 1e-6);
  assert.ok(Math.abs(M.centsOff(48.1, 60, true) - 10) < 1e-6);
  assert.ok(Math.abs(M.centsOff(72, 60, false) - 1200) < 1e-6);
});
