/*
 * Второй голос — звук: синтезатор голосов, фортепиано, метроном,
 * «модель голоса» для демонстраций техники. Всё звучит через Web Audio, без файлов.
 */
(function (root) {
  'use strict';

  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const TIMBRES = {
    // Первый голос (мелодия): мягкий, «флейтовый».
    melody: { type: 'triangle', peak: 0.34, filter: 0, vibrato: true },
    // Второй голос: ярче, с «язычковым» оттенком, чтобы его было легко отличить.
    harmony: { type: 'sawtooth', peak: 0.15, filter: 3.2, vibrato: true },
    // Справочные ноты и подсказки.
    tone: { type: 'triangle', peak: 0.3, filter: 0, vibrato: true },
    // Фортепиано для распевок и сольфеджио.
    piano: { piano: true, peak: 0.32 },
  };

  // Гласные: форманты F1–F4 (Гц) взрослого голоса.
  const VOWELS = {
    a: [750, 1200, 2600, 3500],
    o: [500, 900, 2500, 3400],
    u: [330, 800, 2400, 3300],
    e: [550, 1800, 2550, 3500],
    i: [300, 2200, 3000, 3600],
  };

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.buses = {};
      this.oneShots = new Set();
      this.waves = {};
      this.noiseBuf = null;
    }

    /** Создаёт или будит аудио-контекст. Вызывать из обработчика нажатия. */
    ensure() {
      if (!this.ctx) {
        const AC = root.AudioContext || root.webkitAudioContext;
        const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 3;
        comp.attack.value = 0.005;
        comp.release.value = 0.2;
        comp.connect(ctx.destination);
        this.master = ctx.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(comp);
        for (const name of ['mel', 'har', 'click', 'ui', 'piano']) {
          const g = ctx.createGain();
          g.connect(this.master);
          this.buses[name] = g;
        }
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }

    get now() {
      return this.ctx ? this.ctx.currentTime : 0;
    }

    /** Задержка вывода звука — чтобы картинка совпадала с тем, что слышно. */
    latency() {
      if (!this.ctx) return 0;
      const l = this.ctx.outputLatency || this.ctx.baseLatency || 0;
      return Math.min(0.3, Math.max(0, l));
    }

    setLevel(bus, value) {
      if (!this.ctx) return;
      const g = this.buses[bus];
      if (g) g.gain.setTargetAtTime(Math.max(0, value), this.ctx.currentTime, 0.03);
    }

    /** Группа запланированных звуков, которую можно разом остановить. */
    startRun() {
      const ctx = this.ensure();
      const outs = {};
      const nodes = [];
      for (const name of Object.keys(this.buses)) {
        const g = ctx.createGain();
        g.connect(this.buses[name]);
        outs[name] = g;
      }
      const engine = this;
      let stopped = false;
      return {
        outs,
        nodes,
        note(bus, midi, t, dur, timbre) {
          const tb = TIMBRES[timbre] || TIMBRES.tone;
          if (tb.piano) engine._piano(outs[bus], nodes, midi, t, dur, tb);
          else engine._voice(outs[bus], nodes, midi, t, dur, tb);
        },
        chord(bus, midis, t, dur) {
          for (const m of midis) engine._piano(outs[bus], nodes, m, t, dur, { peak: 0.2 });
        },
        click(t, accent) {
          engine._click(outs.click, nodes, t, accent);
        },
        get stopped() {
          return stopped;
        },
        stop() {
          if (stopped) return;
          stopped = true;
          const now = ctx.currentTime;
          for (const g of Object.values(outs)) {
            g.gain.cancelScheduledValues(now);
            g.gain.setTargetAtTime(0, now, 0.015);
          }
          for (const n of nodes) {
            try {
              n.stop(now + 0.1);
            } catch (e) {
              /* уже остановлен */
            }
          }
          setTimeout(() => {
            for (const g of Object.values(outs)) g.disconnect();
          }, 250);
        },
      };
    }

    /** Одна нота (или аккорд) прямо сейчас — для кнопок «Дать ноту», «Подсказка». */
    playNotes(midis, dur, opts) {
      opts = opts || {};
      const ctx = this.ensure();
      const run = this.startRun();
      const t = ctx.currentTime + (opts.delay || 0) + 0.03;
      const list = Array.isArray(midis) ? midis : [midis];
      list.forEach((m, i) => run.note(opts.bus || 'ui', m, t + i * (opts.stagger || 0), dur, opts.timbre || 'tone'));
      this._keep(run, dur + (opts.delay || 0) + list.length * (opts.stagger || 0));
      return run;
    }

    _keep(run, seconds) {
      this.oneShots.add(run);
      setTimeout(() => this.oneShots.delete(run), (seconds + 1) * 1000);
    }

    stopOneShots() {
      for (const r of this.oneShots) r.stop();
      this.oneShots.clear();
    }

    _voice(out, nodes, midi, t, dur, tb) {
      const ctx = this.ctx;
      const f = midiToFreq(midi);
      const osc = ctx.createOscillator();
      osc.type = tb.type;
      osc.frequency.value = f;
      const env = ctx.createGain();
      env.gain.value = 0;
      let head = osc;
      if (tb.filter) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = Math.min(5200, f * tb.filter);
        lp.Q.value = 0.8;
        osc.connect(lp);
        head = lp;
      }
      head.connect(env);
      env.connect(out);

      // Лёгкое вибрато, как у живого голоса: появляется не сразу.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.2;
      const depth = ctx.createGain();
      depth.gain.value = 0;
      lfo.connect(depth);
      depth.connect(osc.frequency);
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(f * 0.0058, t + Math.min(0.4, dur * 0.7));

      const attack = 0.035;
      const end = t + Math.max(0.07, dur - 0.03);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(tb.peak, t + attack);
      env.gain.setTargetAtTime(tb.peak * 0.78, t + attack, 0.12);
      env.gain.setTargetAtTime(0, end, 0.025);

      osc.start(t);
      lfo.start(t);
      osc.stop(end + 0.2);
      lfo.stop(end + 0.2);
      nodes.push(osc, lfo);
    }

    _wave(key, amps) {
      if (!this.waves[key]) {
        const real = new Float32Array(amps.length + 1);
        const imag = new Float32Array(amps.length + 1);
        amps.forEach((a, i) => {
          imag[i + 1] = a;
        });
        this.waves[key] = this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
      }
      return this.waves[key];
    }

    _piano(out, nodes, midi, t, dur, tb) {
      const ctx = this.ctx;
      const f = midiToFreq(midi);
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(this._wave('piano', [1, 0.55, 0.28, 0.18, 0.1, 0.07, 0.04, 0.03]));
      osc.frequency.value = f;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.min(6000, f * 6);
      const env = ctx.createGain();
      const peak = tb.peak || 0.3;
      // высокие ноты фортепиано гаснут быстрее
      const decay = Math.max(0.35, 1.6 - (midi - 48) * 0.025);
      const end = t + Math.max(0.08, dur);
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(peak, t + 0.006);
      env.gain.setTargetAtTime(peak * 0.25, t + 0.01, decay);
      env.gain.setTargetAtTime(0.0001, end, 0.06);
      osc.connect(lp);
      lp.connect(env);
      env.connect(out);
      osc.start(t);
      osc.stop(end + 0.4);
      nodes.push(osc);
    }

    _click(out, nodes, t, accent) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = accent ? 1660 : 1180;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(accent ? 0.38 : 0.24, t + 0.002);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      osc.connect(env);
      env.connect(out);
      osc.start(t);
      osc.stop(t + 0.07);
      nodes.push(osc);
    }

    _noise() {
      if (!this.noiseBuf) {
        const n = this.ctx.sampleRate * 2;
        const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
        const d = b.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        this.noiseBuf = b;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      return src;
    }

    /**
     * «Модель голоса» для демонстраций техники: источник (связки) + фильтр (резонатор).
     * o: { midi, dur, vowel, tilt, breath, twang, larynx, nasal, onset, offset, vibrato, creak, loud }
     *  tilt   — наклон спектра: 0.7 плотное смыкание, 1.3 обычное, 2.2 тонкие/жёсткие связки;
     *  breath — доля воздуха (0…1); twang — звон (0…1); larynx — гортань −1 низко … +1 высоко;
     *  nasal  — носовой оттенок (0…1); onset/offset — glottal | aspirate | smooth.
     */
    demoVoice(o) {
      const ctx = this.ensure();
      const run = this.startRun();
      const out = run.outs.ui;
      const nodes = run.nodes;
      const t = ctx.currentTime + 0.05;
      const dur = o.dur || 1.6;
      const f0 = midiToFreq(o.midi || 57);
      const tilt = o.tilt == null ? 1.3 : o.tilt;
      const amps = [];
      for (let k = 1; k <= 48; k++) amps.push(Math.pow(k, -tilt));
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(this._wave('glottal' + tilt.toFixed(2), amps));
      osc.frequency.value = f0;

      // вибрато и «неровность» для вокального фрая
      const lfo = ctx.createOscillator();
      lfo.frequency.value = o.creak ? 9 : 5.3;
      const depth = ctx.createGain();
      depth.gain.value = f0 * ((o.vibrato || 0) / 1730 + (o.creak ? 0.08 : 0));
      lfo.connect(depth);
      depth.connect(osc.frequency);

      const voiceGain = ctx.createGain();
      voiceGain.gain.value = 0;
      osc.connect(voiceGain);

      const noise = this._noise();
      const nf = ctx.createBiquadFilter();
      nf.type = 'bandpass';
      nf.frequency.value = 2200;
      nf.Q.value = 0.5;
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0;
      noise.connect(nf);
      nf.connect(noiseGain);

      // резонатор: параллельные форманты
      const sum = ctx.createGain();
      const bank = ctx.createGain();
      voiceGain.connect(bank);
      noiseGain.connect(bank);
      const base = VOWELS[o.vowel] || VOWELS.a;
      const scale = (1 + 0.08 * (o.larynx || 0)) * ((o.midi || 57) > 62 ? 1.1 : 1);
      const tw = o.twang || 0;
      const gains = [1, 0.55, 0.25 * (1 + 3 * tw), 0.15 * (1 + 3 * tw)];
      base.forEach((F, i) => {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = F * scale;
        bp.Q.value = (F * scale) / (60 + 40 * i);
        const g = ctx.createGain();
        g.gain.value = gains[i] * 6;
        bank.connect(bp);
        bp.connect(g);
        g.connect(sum);
      });
      let tail = sum;
      if (tw > 0) {
        const pk = ctx.createBiquadFilter();
        pk.type = 'peaking';
        pk.frequency.value = 3100;
        pk.Q.value = 2;
        pk.gain.value = 12 * tw;
        tail.connect(pk);
        tail = pk;
      }
      if (o.nasal) {
        const nz = ctx.createBiquadFilter();
        nz.type = 'peaking';
        nz.frequency.value = 270;
        nz.Q.value = 2;
        nz.gain.value = 10 * o.nasal;
        const anti = ctx.createBiquadFilter();
        anti.type = 'notch';
        anti.frequency.value = 950;
        anti.Q.value = 3 * o.nasal;
        tail.connect(nz);
        nz.connect(anti);
        tail = anti;
      }
      const master = ctx.createGain();
      master.gain.value = 0.22 * (o.loud || 1);
      tail.connect(master);
      master.connect(out);

      // атака
      const v = voiceGain.gain;
      const nG = noiseGain.gain;
      const breath = o.breath || 0;
      let vStart = t;
      if (o.onset === 'aspirate') {
        nG.setValueAtTime(0, t);
        nG.linearRampToValueAtTime(0.5, t + 0.05);
        vStart = t + 0.28;
        nG.setValueAtTime(0.5, vStart);
        nG.linearRampToValueAtTime(breath * 0.6, vStart + 0.12);
        v.setValueAtTime(0, vStart);
        v.linearRampToValueAtTime(1, vStart + 0.06);
      } else if (o.onset === 'glottal') {
        v.setValueAtTime(0, t);
        v.linearRampToValueAtTime(1.25, t + 0.004);
        v.setTargetAtTime(1, t + 0.01, 0.03);
        nG.setValueAtTime(0.9, t);
        nG.linearRampToValueAtTime(breath * 0.6, t + 0.02);
      } else {
        v.setValueAtTime(0, t);
        v.linearRampToValueAtTime(1, t + 0.14);
        nG.setValueAtTime(0, t);
        nG.linearRampToValueAtTime(breath * 0.6, t + 0.14);
      }
      // окончание
      const end = t + dur;
      let stopAt = end + 0.05;
      if (o.offset === 'aspirate') {
        v.setTargetAtTime(0, end, 0.02);
        nG.setValueAtTime(0.45, end);
        nG.linearRampToValueAtTime(0, end + 0.3);
        stopAt = end + 0.35;
      } else if (o.offset === 'glottal') {
        v.setTargetAtTime(0, end, 0.003);
        nG.setTargetAtTime(0, end, 0.003);
      } else {
        v.setTargetAtTime(0, end - 0.15, 0.1);
        nG.setTargetAtTime(0, end - 0.15, 0.1);
        stopAt = end + 0.4;
      }
      for (const s of [osc, lfo, noise]) {
        s.start(t);
        s.stop(stopAt);
        nodes.push(s);
      }
      this._keep(run, stopAt - t);
      return { run, start: t, voiceStart: vStart, end };
    }
  }

  root.AudioEngine = AudioEngine;
})(typeof self !== 'undefined' ? self : this);
