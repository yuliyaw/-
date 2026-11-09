/*
 * Второй голос — тренажёр второго голоса и редактор своих песен.
 */
(function () {
  'use strict';

  const VG = window.VG;
  const { M, engine, $, el, clamp } = VG;
  const LIB = window.SongLibrary;
  const EPS = VG.EPS;
  const settings = VG.settings;

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
    countIn: true,
    metronome: false,
    loop: false,
    volMel: STEPS[1].mel,
    volHar: STEPS[1].har,
    modeBy: {},
    transposeBy: {},
  };
  for (const [k, v] of Object.entries(DEFAULTS)) if (settings[k] == null) settings[k] = v;
  for (const k of ['modeBy', 'transposeBy']) if (typeof settings[k] !== 'object') settings[k] = {};

  let userSongs = VG.store.get('vg.songs.v1', []);
  if (!Array.isArray(userSongs)) userSongs = [];
  const best = VG.store.get('vg.best.v1', {}) || {};

  const S = {
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
    transpose: 0,
    lyrics: null,
    playing: false,
    session: null,
    refNote: null,
    refUntil: 0,
  };
  let roll = null;
  let readout = null;

  const applyLevels = () => {
    engine.setLevel('mel', Math.pow(settings.volMel / 100, 2));
    engine.setLevel('har', Math.pow(settings.volHar / 100, 2));
  };
  VG.on('audio-ready', applyLevels);

  // ================= Песни =================
  const allSongs = () => LIB.concat(userSongs);
  const findSong = (id) => allSongs().find((s) => s.id === id);

  function buildSongSelect() {
    const sel = $('song-select');
    sel.textContent = '';
    for (const [g, label] of [
      ['exercise', 'Упражнения'],
      ['song', 'Песни'],
      ['user', 'Мои песни'],
    ]) {
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
    VG.saveSettings();
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
    S.transpose = clamp(settings.transposeBy[def.id] || 0, -12, 12);
    S.lyrics = parseLyrics(def.lyrics, S.melody0.length);
    const saved = settings.modeBy[def.id];
    const validSaved = saved && (saved === 'custom' ? !!S.custom0 : !!M.HARMONY_MODES[saved]);
    S.mode = validSaved ? saved : S.custom0 ? 'custom' : 'third_below';
    $('song-select').value = def.id;
    buildModeSelect();
    rebuild();
    buildPhraseSelect();
    renderKaraoke();
  }

  /** Слоги через пробел, по одному на ноту мелодии; «_» — нота без нового слога. */
  function parseLyrics(text, count) {
    if (!text || !text.trim()) return null;
    const syl = text.trim().split(/\s+/).map((s) => (s === '_' ? '' : s));
    while (syl.length < count) syl.push('');
    return syl.slice(0, count);
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
      S.mode === 'custom' && S.custom0 ? S.custom0 : M.harmonize(S.melody0, S.key0, S.mode, { barLen: S.barLen, anacrusis: S.anacrusis });
    const T = S.transpose;
    S.key = M.transposeKey(S.key0, T);
    S.melody = S.melody0.map((n) => ({ midi: n.midi + T, start: n.start, dur: n.dur }));
    S.harmony = h0.map((n) => ({ midi: n.midi + T, start: n.start, dur: n.dur }));
    S.refNote = null;
    roll.setNotes({ target: S.harmony, guide: S.melody, key: S.key, barLen: S.barLen, anacrusis: S.anacrusis, length: S.length });
    roll.view = currentPhrase().start;
    roll.phrase = currentPhrase();
    $('tr-val').textContent = T > 0 ? '+' + T : String(T);
    readout.reset();
    updateMeta();
  }

  function updateMeta() {
    const box = $('song-meta');
    box.textContent = '';
    const hs = S.harmony.map((n) => n.midi);
    const tempo = Math.round((S.song.bpm * settings.tempo) / 100);
    const key = el('span');
    key.appendChild(el('b', null, VG.keyName(S.key)));
    box.appendChild(key);
    box.appendChild(el('span', 'num', S.meter[0] + '/' + S.meter[1]));
    box.appendChild(el('span', null, '♩ = ' + tempo));
    if (hs.length) {
      box.appendChild(el('span', null, 'Ваша партия: ' + VG.nn(Math.min(...hs), { key: S.key }) + ' — ' + VG.nn(Math.max(...hs), { key: S.key })));
    }
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
      S.phrases.forEach((p, i) => add(i, 'Фраза ' + (i + 1) + ' · такты ' + Math.max(1, barOf(p.start)) + '–' + barOf(p.end - 1e-3)));
    }
    sel.value = String(S.phrase);
  }

  const currentPhrase = () => (S.phrase >= 0 && S.phrases[S.phrase] ? S.phrases[S.phrase] : { start: 0, end: S.length });

  /** Подбирает сдвиг так, чтобы партия легла в ваш удобный диапазон. */
  function fitToVoice() {
    const note = $('fit-note');
    if (!VG.profile) {
      note.textContent = 'Сначала измерьте свой диапазон на странице «Сегодня» — тогда программа подберёт тональность сама.';
      note.hidden = false;
      return;
    }
    const c = VG.comfort();
    const h0 = S.harmony.map((n) => n.midi - S.transpose);
    const lo = Math.min(...h0);
    const hi = Math.max(...h0);
    let bestT = 0;
    let bestScore = Infinity;
    for (let T = -12; T <= 12; T++) {
      const over = Math.max(0, c.lo - (lo + T)) + Math.max(0, hi + T - c.hi);
      const center = Math.abs((lo + hi) / 2 + T - (c.lo + c.hi) / 2);
      const score = over * 10 + center + Math.abs(T) * 0.05;
      if (score < bestScore) {
        bestScore = score;
        bestT = T;
      }
    }
    setTranspose(bestT);
    const fits = lo + bestT >= c.lo && hi + bestT <= c.hi;
    note.textContent = fits
      ? 'Партия сдвинута в ваш удобный диапазон: ' + VG.nn(c.lo) + ' — ' + VG.nn(c.hi) + '.'
      : 'Партия шире вашего удобного диапазона. Я поставил её посередине; крайние ноты пойте мягко или выберите другой второй голос.';
    note.hidden = false;
  }

  function setTranspose(T) {
    stopPlayback(true);
    hideResults();
    S.transpose = clamp(T, -12, 12);
    settings.transposeBy[S.song.id] = S.transpose;
    VG.saveSettings();
    rebuild();
  }

  // ================= Текст песни =================
  let karaokeSpans = [];
  let karaokeCur = -2;
  function renderKaraoke() {
    const box = $('karaoke');
    box.textContent = '';
    karaokeSpans = [];
    karaokeCur = -2;
    box.hidden = !S.lyrics;
    if (!S.lyrics) return;
    S.lyrics.forEach((s, i) => {
      const sp = el('span', 'syl', s);
      if (!s) sp.hidden = true;
      if (i > 0 && s && !/-$/.test(S.lyrics[i - 1] || '')) box.appendChild(document.createTextNode(' '));
      sp.textContent = s.replace(/-$/, '');
      box.appendChild(sp);
      karaokeSpans.push(sp);
    });
  }
  function updateKaraoke(pos) {
    if (!S.lyrics) return;
    const i = VG.noteAt(S.melody, pos);
    let cur = i;
    if (cur >= 0 && !S.lyrics[cur]) while (cur > 0 && !S.lyrics[cur]) cur--;
    if (cur === karaokeCur) return;
    if (karaokeSpans[karaokeCur]) karaokeSpans[karaokeCur].classList.remove('is-now');
    karaokeCur = cur;
    if (karaokeSpans[cur]) {
      karaokeSpans[cur].classList.add('is-now');
      const box = $('karaoke');
      const sp = karaokeSpans[cur];
      const left = sp.offsetLeft - box.clientWidth / 3;
      box.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
    }
  }

  // ================= Шаги =================
  function setStep(n, applyVolumes) {
    settings.step = n;
    VG.qsa('#view-train .step').forEach((b) => {
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
    VG.saveSettings();
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

  function makeSession(withCountIn) {
    const ph = currentPhrase();
    const spb = 60 / ((S.song.bpm * settings.tempo) / 100);
    const events = [];
    let countBeats = 0;
    if (withCountIn) {
      let cs = barlineAtOrBefore(ph.start);
      while ((ph.start - cs) / S.pulse < 3 - EPS) cs -= S.barLen;
      countBeats = ph.start - cs;
      for (let b = cs; b < ph.start - EPS; b += S.pulse) events.push({ type: 'click', beat: b, accent: isDownbeat(b) });
    }
    if (settings.metronome) {
      for (let b = S.anacrusis + Math.ceil((ph.start - S.anacrusis) / S.pulse - EPS) * S.pulse; b < ph.end - EPS; b += S.pulse) {
        events.push({ type: 'click', beat: b, accent: isDownbeat(b) });
      }
    }
    const add = (notes, bus, timbre) => {
      for (const n of notes) {
        if (n.start < ph.start - EPS || n.start >= ph.end - EPS) continue;
        events.push({ type: 'note', bus, timbre, midi: n.midi, beat: n.start, dur: Math.min(n.start + n.dur, ph.end) - n.start });
      }
    };
    add(S.melody, 'mel', 'melody');
    add(S.harmony, 'har', 'harmony');
    return new VG.Session({ start: ph.start, end: ph.end, spb, countBeats, pulse: S.pulse, events, target: S.harmony, guide: S.melody, range: roll.range });
  }

  function attach(session) {
    S.session = session.begin();
    roll.stats = session.stats;
    roll.trace = session.trace;
    roll.playing = true;
  }

  function startPlayback() {
    VG.audio();
    applyLevels();
    engine.stopOneShots();
    hideResults();
    $('fit-note').hidden = true;
    S.refNote = null;
    attach(makeSession(settings.countIn));
    S.playing = true;
    S.totalSec = 0;
    updatePlayButton();
    VG.keepAwake(true);
  }

  function finish(sc, silent) {
    S.playing = false;
    roll.playing = false;
    roll.live = null;
    updatePlayButton();
    VG.keepAwake(false);
    const sec = (S.totalSec || 0) + S.session.seconds();
    if (sec >= 8) VG.journal.add({ kind: 'harmony', title: S.song.title, score: sc ? sc.pct : null, sec });
    if (sc && !silent) showResults(sc);
  }

  function stopPlayback(silent) {
    if (!S.playing) return;
    S.session.stop();
    roll.view = clamp(S.session.pos, -1, S.length);
    const sc = S.session.micUsed ? S.session.score() : null;
    finish(sc && sc.coverage >= 0.35 ? sc : null, silent);
  }

  function passEnd() {
    const sc = S.session.micUsed ? S.session.score() : null;
    S.session.stop();
    if (settings.loop) {
      if (sc) showResults(sc);
      S.totalSec = (S.totalSec || 0) + S.session.seconds();
      attach(makeSession(settings.countIn));
      return;
    }
    roll.view = S.session.start;
    finish(sc, false);
  }

  function updatePlayButton() {
    $('btn-play').classList.toggle('is-playing', S.playing);
    $('btn-play-label').textContent = S.playing ? 'Стоп' : 'Играть';
  }

  function giveNote() {
    VG.audio();
    let i;
    if (S.playing) i = VG.noteAt(S.harmony, S.session.pos);
    else i = VG.firstNoteFrom(S.harmony, Math.max(roll.view, currentPhrase().start));
    if (i < 0) i = VG.firstNoteFrom(S.harmony, currentPhrase().start);
    if (i < 0) return;
    const m = S.harmony[i].midi;
    engine.playNotes(m, S.playing ? 0.8 : 1.6, { timbre: 'harmony' });
    if (!S.playing) {
      S.refNote = m;
      S.refUntil = engine.now + 1.6;
    }
  }

  // ================= Итоги =================
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
        ' В ' + sc.melNotes + ' ' + VG.plural(sc.melNotes, 'ноте', 'нотах', 'нотах') +
        ' вы ушли на мелодию. Убавьте её громкость и пропойте эти места отдельно.';
    }
    $('res-title').textContent = title;
    $('res-text').textContent = text;
    const ul = $('res-list');
    ul.textContent = '';
    for (const w of sc.worst) {
      const li = el('li', null, 'Такт ' + Math.max(1, barOf(w.n.start)) + ': ');
      li.appendChild(el('b', null, VG.nn(w.n.midi, { key: S.key })));
      li.appendChild(document.createTextNode(' — ' + Math.round(w.sc * 100) + ' %'));
      ul.appendChild(li);
    }
    ul.hidden = !sc.worst.length;
    const key = S.song.id + '|' + S.mode + '|' + S.phrase;
    const prev = best[key] || 0;
    let bestText;
    if (sc.pct > prev) {
      best[key] = sc.pct;
      VG.store.set('vg.best.v1', best);
      bestText = prev ? 'Новый рекорд! Было ' + prev + ' %.' : 'Первый результат для этой песни и этого голоса.';
    } else {
      bestText = 'Лучший результат: ' + prev + ' %.';
    }
    $('res-best').textContent = bestText;
    $('results').hidden = false;
  }
  const hideResults = () => ($('results').hidden = true);

  // ================= Кадр =================
  function frame(f) {
    const midi = f ? f.midi : null;
    let info;
    if (S.playing) {
      info = S.session.update(f);
      roll.pos = S.session.pos;
      roll.live = info.cls;
      if (S.session.ended) passEnd();
      roll.dirty = true;
      updateKaraoke(roll.pos);
    } else {
      if (S.refNote != null && engine.now > S.refUntil + 8) S.refNote = null;
      const i = VG.firstNoteFrom(S.harmony, roll.view);
      const tgt = S.refNote != null ? S.refNote : i >= 0 ? S.harmony[i].midi : null;
      const cls = f ? VG.classify(midi, tgt, null, roll.range) : null;
      info = { tgt, cls, countdown: 0 };
      roll.live = cls;
      if (VG.mic.on) roll.dirty = true;
      updateKaraoke(roll.view);
    }
    readout.update({
      key: S.key,
      tgt: info.tgt,
      midi,
      cls: info.cls,
      hint: VG.hintText({
        countdown: info.countdown,
        playing: S.playing,
        midi,
        tgt: info.tgt,
        guide: info.guide,
        cls: info.cls,
        listenOnly: settings.step === 1,
        idle: 'Включите микрофон, чтобы видеть свой голос на ленте.',
      }),
    });
    if (roll.dirty) roll.draw();
  }

  // ================= Запуск раздела =================
  function initTrain() {
    roll = new VG.Roll($('roll'));
    roll.enableDrag(() => (S.refNote = null));
    readout = new VG.Readout($('train-readout'));
    $('train-mic-slot').replaceWith(VG.micButton());

    $('song-select').addEventListener('change', (e) => loadSong(e.target.value));
    $('btn-play').addEventListener('click', () => (S.playing ? stopPlayback(false) : startPlayback()));
    $('btn-ref').addEventListener('click', giveNote);
    $('btn-fit').addEventListener('click', () => {
      VG.audio();
      fitToVoice();
      const i = VG.firstNoteFrom(S.harmony, currentPhrase().start);
      if (i >= 0) engine.playNotes(S.harmony[i].midi, 0.7, { timbre: 'harmony' });
    });
    $('res-close').addEventListener('click', hideResults);
    $('phrase-select').addEventListener('change', (e) => {
      stopPlayback(true);
      hideResults();
      S.phrase = parseInt(e.target.value, 10);
      roll.phrase = currentPhrase();
      roll.view = currentPhrase().start;
      S.refNote = null;
      roll.dirty = true;
    });

    const stepsBox = VG.qs('#view-train .steps');
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
      VG.qs('#view-train .step[data-step="' + n + '"]').focus();
    });

    $('opt-mode').addEventListener('change', (e) => {
      stopPlayback(true);
      hideResults();
      S.mode = e.target.value;
      settings.modeBy[S.song.id] = S.mode;
      VG.saveSettings();
      rebuild();
    });
    const nudge = (d) => {
      VG.audio();
      setTranspose(S.transpose + d);
      const i = VG.firstNoteFrom(S.harmony, currentPhrase().start);
      if (i >= 0) engine.playNotes(S.harmony[i].midi, 0.6, { timbre: 'harmony' });
    };
    $('tr-down').addEventListener('click', () => nudge(-1));
    $('tr-up').addEventListener('click', () => nudge(1));
    $('opt-tempo').value = settings.tempo;
    $('tempo-val').textContent = settings.tempo + ' %';
    $('opt-tempo').addEventListener('input', (e) => {
      settings.tempo = Number(e.target.value);
      $('tempo-val').textContent = settings.tempo + ' %';
      updateMeta();
      VG.saveSettings();
    });
    $('vol-mel').addEventListener('input', (e) => {
      settings.volMel = Number(e.target.value);
      syncVolumes();
      VG.saveSettings();
    });
    $('vol-har').addEventListener('input', (e) => {
      settings.volHar = Number(e.target.value);
      syncVolumes();
      VG.saveSettings();
    });
    $('opt-tol').value = String(settings.tol);
    if (!$('opt-tol').value) {
      settings.tol = 45;
      $('opt-tol').value = '45';
    }
    $('opt-tol').addEventListener('change', (e) => {
      settings.tol = Number(e.target.value);
      VG.saveSettings();
      VG.emit('settings');
    });
    $('opt-names').value = settings.names;
    $('opt-names').addEventListener('change', (e) => {
      settings.names = e.target.value;
      VG.saveSettings();
      readout.reset();
      updateMeta();
      roll.dirty = true;
      VG.emit('settings');
    });
    const check = (id, key, after) => {
      const box = $(id);
      box.checked = !!settings[key];
      box.addEventListener('change', () => {
        settings[key] = box.checked;
        VG.saveSettings();
        if (after) after();
      });
    };
    check('opt-countin', 'countIn');
    check('opt-metro', 'metronome');
    check('opt-loop', 'loop');
    check('opt-fold', 'fold', () => (roll.dirty = true));
    check('opt-phones', 'headphones', async () => {
      if (VG.mic.on) {
        VG.mic.stop();
        await VG.toggleMic(VG.qs('#view-train [data-mic]'));
      }
    });

    document.addEventListener('keydown', (e) => {
      if (VG.current !== 'train' || e.code !== 'Space' || e.repeat) return;
      if (e.target.closest('input, select, textarea, button, a, summary, [role="radio"]')) return;
      e.preventDefault();
      if (S.playing) stopPlayback(false);
      else startPlayback();
    });

    buildSongSelect();
    loadSong(settings.songId);
    setStep(STEPS[settings.step] ? Number(settings.step) : 1, false);
    syncVolumes();
  }

  VG.register('train', {
    init: initTrain,
    enter(params) {
      if (params && params.id && params.id !== (S.song && S.song.id)) loadSong(params.id);
      roll.dirty = true;
    },
    leave() {
      stopPlayback(true);
    },
    frame,
    context() {
      return (
        'Раздел «Второй голос». Песня: ' + S.song.title + ', тональность ' + VG.keyName(S.key) +
        ', второй голос: ' + (S.mode === 'custom' ? 'готовая партия' : M.HARMONY_MODES[S.mode].label) + ', шаг ' + settings.step + '.'
      );
    },
  });

  // ================= Мои песни (редактор) =================
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
        const o = el('option', null, VG.keyName(M.makeKey(t, mode)));
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
    return {
      title: $('ed-name').value.trim(),
      melody,
      harmony,
      lyrics: $('ed-lyrics').value,
      m,
      h,
      meter,
      bpm,
      anacrusis: parseFloat($('ed-pickup').value) || 0,
      keyVal,
      key,
    };
  }

  function errorsText(where, errs) {
    return (
      where + ' не получилось разобрать: ' +
      errs.slice(0, 3).map((e) => '«' + e.token + '» — ' + e.message).join('; ') +
      (errs.length > 3 ? ' и ещё ' + (errs.length - 3) : '') + '.'
    );
  }

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
        'Нот: ' + d.m.notes.length + ' · тактов: ' + bars + ' · тональность: ' + VG.keyName(d.key) +
        (d.keyVal === 'auto' ? ' (определена по мелодии)' : '') + '.';
      const warn = [];
      if (d.h && Math.abs(d.h.length - d.m.length) > EPS) {
        warn.push(
          'Второй голос ' + (d.h.length < d.m.length ? 'короче' : 'длиннее') + ' мелодии на ' +
            VG.fmt(Math.abs(d.h.length - d.m.length), Math.abs(d.h.length - d.m.length) % 1 ? 1 : 0) + ' доли — проверьте длительности.',
        );
      }
      const syl = d.lyrics.trim() ? d.lyrics.trim().split(/\s+/).length : 0;
      if (syl && syl !== d.m.notes.length) {
        warn.push('Слогов в тексте ' + syl + ', а нот ' + d.m.notes.length + '. На каждую ноту нужен один слог или «_».');
      }
      if (warn.length) {
        cls = 'is-warn';
        text += ' ' + warn.join(' ');
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
    VG.audio();
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
      title: d.title || 'Моя песня',
      subtitle: 'Моя песня',
      key: M.keyId(d.key),
      keyAuto: d.keyVal === 'auto',
      meter: d.meter,
      bpm: d.bpm,
      anacrusis: d.anacrusis,
      phraseBars: 4,
      melody: d.melody.trim(),
      harmony: d.harmony.trim(),
      lyrics: d.lyrics.trim(),
    };
    const idx = userSongs.findIndex((s) => s.id === id);
    if (idx >= 0) userSongs[idx] = def;
    else userSongs.push(def);
    VG.store.set('vg.songs.v1', userSongs);
    delete settings.modeBy[id];
    edEditingId = id;
    $('ed-save').textContent = 'Сохранить изменения';
    renderEdList();
    buildSongSelect();
    loadSong(id);
    VG.go('train');
  }

  function edFill(def) {
    edStopListen();
    edEditingId = def ? def.id : null;
    $('ed-name').value = def ? def.title : '';
    $('ed-melody').value = def ? def.melody : '';
    $('ed-harmony').value = def ? def.harmony || '' : '';
    $('ed-lyrics').value = def ? def.lyrics || '' : '';
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
          VG.keyName(M.parseKeyId(s.key)) + ' · ' + s.meter.join('/') + ' · ' +
            (s.harmony ? 'свой второй голос' : 'второй голос строится автоматически') + (s.lyrics ? ' · есть текст' : ''),
        ),
      );
      li.appendChild(title);
      const del = VG.button('Удалить', 'btn-ghost', () => {
        li.textContent = '';
        li.appendChild(el('span', 'ed-item-title confirm', 'Удалить «' + s.title + '»?'));
        const no = VG.button('Отмена', 'btn-ghost', renderEdList);
        li.append(VG.button('Да, удалить', '', () => edDelete(s.id)), no);
        no.focus();
      });
      li.append(
        VG.button('Учить', 'btn-primary', () => VG.go('train', { id: s.id })),
        VG.button('Изменить', '', () => {
          edFill(s);
          $('ed-name').focus();
        }),
        del,
      );
      ul.appendChild(li);
    }
  }

  function edDelete(id) {
    userSongs = userSongs.filter((s) => s.id !== id);
    VG.store.set('vg.songs.v1', userSongs);
    delete settings.modeBy[id];
    delete settings.transposeBy[id];
    VG.saveSettings();
    if (edEditingId === id) edFill(null);
    buildSongSelect();
    if (S.song && S.song.id === id) loadSong(LIB[0].id);
    renderEdList();
  }

  function initEditor() {
    buildKeySelect();
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
    for (const id of ['ed-melody', 'ed-harmony', 'ed-lyrics']) $(id).addEventListener('input', later);
    for (const id of ['ed-key', 'ed-meter', 'ed-pickup']) $(id).addEventListener('change', () => edCheck(true));
    VG.on('settings', () => {
      buildKeySelect();
      renderEdList();
      edCheck(true);
    });
    renderEdList();
    // Пример, чтобы было видно формат записи.
    $('ed-name').value = 'Звёздочка (пример)';
    $('ed-melody').value = 'до до соль соль | ля ля соль:2 | фа фа ми ми | ре ре до:2';
    $('ed-lyrics').value = 'Ти- хо, ти- хо, звёз- доч- ка, спят де- ре- вья, спит ре- ка';
    edCheck(true);
  }

  VG.register('editor', {
    init: initEditor,
    leave: edStopListen,
  });
})();
