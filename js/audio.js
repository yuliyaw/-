/*
 * Второй голос — звук: синтезатор двух голосов, метроном, отдельные ноты.
 * Всё звучит через Web Audio, без загрузки файлов.
 */
(function (root) {
  'use strict';

  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const TIMBRES = {
    // Первый голос (мелодия): мягкий, «флейтовый».
    melody: { type: 'triangle', peak: 0.34, filter: 0 },
    // Второй голос: ярче, с «язычковым» оттенком, чтобы его было легко отличить.
    harmony: { type: 'sawtooth', peak: 0.15, filter: 3.2 },
    // Справочные ноты и подсказки.
    tone: { type: 'triangle', peak: 0.3, filter: 0 },
  };

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.buses = {};
      this.oneShots = new Set();
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
        for (const name of ['mel', 'har', 'click', 'ui']) {
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
      return {
        note(bus, midi, t, dur, timbre) {
          engine._voice(outs[bus], nodes, midi, t, dur, TIMBRES[timbre] || TIMBRES.tone);
        },
        click(t, accent) {
          engine._click(outs.click, nodes, t, accent);
        },
        stop() {
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
      this.oneShots.add(run);
      setTimeout(() => this.oneShots.delete(run), (dur + (opts.delay || 0) + 1) * 1000);
      return run;
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
  }

  root.AudioEngine = AudioEngine;
})(typeof self !== 'undefined' ? self : this);
