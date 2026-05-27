// ── ПОТУЖНОСТЬ РУ — Аудио движок ────────────────────────────────────
// Web Audio API. Поскольку MP3 файлов нет — синтезирует
// бас-партии прямо в браузере по параметрам трека.

(function (global) {
  'use strict';

  const Radio = global.PotuzhnostRadio;
  if (!Radio) {
    console.warn('PotuzhnostRadio state not loaded');
    return;
  }

  let ctx = null;
  let masterGain = null;
  let analyser = null;
  let analyserData = null;
  let currentSynth = null;
  let trackStartTime = 0; // ctx.currentTime когда трек начал играть
  let pausedPosition = 0; // в секундах
  let currentTrack = null;
  let positionUpdateInterval = null;

  // ── ИНИЦИАЛИЗАЦИЯ ───────────────────────────────────────────────────
  function init() {
    if (ctx) return ctx;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = Radio.state.volume;

    analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.78;
    analyserData = new Uint8Array(analyser.frequencyBinCount);

    masterGain.connect(analyser);
    analyser.connect(ctx.destination);
    return ctx;
  }

  // ── СИНТЕЗ ТРЕКА ────────────────────────────────────────────────────
  // Создаёт зацикленную раста-партию: бас + бочка + перкуссия + offbeat скрипка
  function createSynthTrack(params) {
    if (!ctx) init();
    const { root, pattern, lp, rev } = params;

    const trackGain = ctx.createGain();
    trackGain.gain.value = 0.8;

    // Реверб
    const conv = ctx.createConvolver();
    conv.buffer = createImpulseResponse(rev || 0.4);
    const revGain = ctx.createGain();
    revGain.gain.value = 0.25;
    const dryGain = ctx.createGain();
    dryGain.gain.value = 0.75;

    // Lowpass на общем выходе
    const lpFilt = ctx.createBiquadFilter();
    lpFilt.type = 'lowpass';
    lpFilt.frequency.value = 4500;

    trackGain.connect(dryGain);
    trackGain.connect(conv);
    conv.connect(revGain);
    dryGain.connect(lpFilt);
    revGain.connect(lpFilt);
    lpFilt.connect(masterGain);

    const oscillators = [];
    const bpm = 78;
    const beatDur = 60 / bpm;
    const stepDur = beatDur / 2; // 16-е
    const patternLen = pattern.length * stepDur;

    // ── Бас-партия ────────────────────────────────────────────────────
    function scheduleBassNote(startTime, midi) {
      const osc = ctx.createOscillator();
      const subOsc = ctx.createOscillator();
      const g = ctx.createGain();
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = lp;
      filt.Q.value = 6;

      osc.type = 'sawtooth';
      subOsc.type = 'sine';
      osc.frequency.value = midiToHz(midi);
      subOsc.frequency.value = midiToHz(midi - 12);

      g.gain.setValueAtTime(0, startTime);
      g.gain.linearRampToValueAtTime(0.42, startTime + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, startTime + beatDur * 0.78);

      osc.connect(g);
      subOsc.connect(g);
      g.connect(trackGain);
      osc.start(startTime);
      subOsc.start(startTime);
      osc.stop(startTime + beatDur);
      subOsc.stop(startTime + beatDur);
      oscillators.push(osc, subOsc);
    }

    // ── Бочка ─────────────────────────────────────────────────────────
    function scheduleKick(startTime) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(130, startTime);
      osc.frequency.exponentialRampToValueAtTime(38, startTime + 0.13);
      g.gain.setValueAtTime(0.78, startTime);
      g.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18);
      osc.connect(g);
      g.connect(trackGain);
      osc.start(startTime);
      osc.stop(startTime + 0.2);
      oscillators.push(osc);
    }

    // ── Хай-хет шум ───────────────────────────────────────────────────
    function scheduleHat(startTime, openness) {
      const noiseBuf = createNoiseBuffer(0.08);
      const src = ctx.createBufferSource();
      const filt = ctx.createBiquadFilter();
      const g = ctx.createGain();
      src.buffer = noiseBuf;
      filt.type = 'highpass';
      filt.frequency.value = 7000;
      g.gain.setValueAtTime(0.16, startTime);
      g.gain.exponentialRampToValueAtTime(0.001, startTime + (openness ? 0.18 : 0.04));
      src.connect(filt);
      filt.connect(g);
      g.connect(trackGain);
      src.start(startTime);
      src.stop(startTime + 0.25);
      oscillators.push(src);
    }

    // ── Offbeat скрипка / стэб ────────────────────────────────────────
    function scheduleStab(startTime, midi) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const filt = ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.value = 900;
      filt.Q.value = 4;
      osc.type = 'square';
      osc.frequency.value = midiToHz(midi + 12);
      g.gain.setValueAtTime(0, startTime);
      g.gain.linearRampToValueAtTime(0.07, startTime + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, startTime + 0.22);
      osc.connect(filt);
      filt.connect(g);
      g.connect(trackGain);
      osc.start(startTime);
      osc.stop(startTime + 0.25);
      oscillators.push(osc);
    }

    // ── Расписание петли ──────────────────────────────────────────────
    function scheduleLoop(loopStartTime) {
      for (let i = 0; i < pattern.length; i++) {
        const t = loopStartTime + i * stepDur;
        // Бас на каждом степе паттерна
        scheduleBassNote(t, root + pattern[i]);
        // Бочка на 1 и 5
        if (i === 0 || i === 4) scheduleKick(t);
        // Хет на каждые 2-е
        if (i % 2 === 1) scheduleHat(t, i === 3 || i === 7);
        // Стэб на 3 и 7 (offbeat)
        if (i === 2 || i === 6) scheduleStab(t, root + pattern[i] + 7);
      }
    }

    // Расписываем петли вперёд
    let scheduledUntil = ctx.currentTime;
    let schedulerInterval = null;

    function startScheduler(fromTime) {
      scheduledUntil = fromTime;
      const tick = () => {
        const ahead = 1.5; // секунд вперёд
        while (scheduledUntil < ctx.currentTime + ahead) {
          scheduleLoop(scheduledUntil);
          scheduledUntil += patternLen;
        }
      };
      tick();
      schedulerInterval = setInterval(tick, 250);
    }

    function stop() {
      if (schedulerInterval) clearInterval(schedulerInterval);
      schedulerInterval = null;
      oscillators.forEach(o => {
        try { o.stop(); } catch (e) {}
      });
      oscillators.length = 0;
      try {
        trackGain.gain.cancelScheduledValues(ctx.currentTime);
        trackGain.gain.setValueAtTime(trackGain.gain.value, ctx.currentTime);
        trackGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      } catch (e) {}
      setTimeout(() => {
        try { lpFilt.disconnect(); } catch (e) {}
      }, 200);
    }

    return { start: startScheduler, stop };
  }

  function createImpulseResponse(seconds) {
    const length = ctx.sampleRate * seconds;
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
      }
    }
    return impulse;
  }

  function createNoiseBuffer(seconds) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  function midiToHz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // ── УПРАВЛЕНИЕ ВОСПРОИЗВЕДЕНИЕМ ─────────────────────────────────────
  function startTrack(track, fromPosition = 0) {
    init();
    if (ctx.state === 'suspended') ctx.resume();

    if (currentSynth) {
      currentSynth.stop();
      currentSynth = null;
    }

    currentTrack = track;
    pausedPosition = fromPosition;
    trackStartTime = ctx.currentTime - fromPosition;
    currentSynth = createSynthTrack(track.synth);
    currentSynth.start(ctx.currentTime);

    if (positionUpdateInterval) clearInterval(positionUpdateInterval);
    positionUpdateInterval = setInterval(() => {
      const pos = ctx.currentTime - trackStartTime;
      Radio.setPosition(pos);
      if (pos >= track.duration) {
        Engine.next();
      }
    }, 250);
  }

  function pauseTrack() {
    if (currentSynth) {
      pausedPosition = ctx ? ctx.currentTime - trackStartTime : 0;
      currentSynth.stop();
      currentSynth = null;
    }
    if (positionUpdateInterval) {
      clearInterval(positionUpdateInterval);
      positionUpdateInterval = null;
    }
  }

  // ── ПУБЛИЧНОЕ API ───────────────────────────────────────────────────
  const Engine = {
    init,

    play() {
      if (!ctx) init();
      const track = Radio.getCurrentTrack();
      const pos = Radio.state.position || 0;
      startTrack(track, pos);
      Radio.play();
    },

    pause() {
      pauseTrack();
      Radio.pause();
    },

    toggle() {
      if (Radio.state.isPlaying) this.pause();
      else this.play();
    },

    next() {
      const wasPlaying = Radio.state.isPlaying;
      Radio.nextTrack();
      if (wasPlaying) {
        const track = Radio.getCurrentTrack();
        startTrack(track, 0);
      } else {
        pauseTrack();
      }
    },

    prev() {
      const wasPlaying = Radio.state.isPlaying;
      Radio.prevTrack();
      if (wasPlaying) {
        const track = Radio.getCurrentTrack();
        startTrack(track, 0);
      } else {
        pauseTrack();
      }
    },

    seek(seconds) {
      if (Radio.state.isPlaying) {
        const track = Radio.getCurrentTrack();
        startTrack(track, seconds);
      } else {
        Radio.setPosition(seconds);
        pausedPosition = seconds;
      }
    },

    setVolume(v) {
      Radio.setVolume(v);
      if (masterGain) masterGain.gain.value = v;
    },

    getAnalyserData() {
      if (!analyser) return null;
      analyser.getByteFrequencyData(analyserData);
      return analyserData;
    },

    getBassLevel() {
      const data = this.getAnalyserData();
      if (!data) return 0;
      // Среднее по первым 6 бинам (низы)
      let sum = 0;
      for (let i = 0; i < 6; i++) sum += data[i];
      return sum / (6 * 255);
    },

    getMidLevel() {
      const data = this.getAnalyserData();
      if (!data) return 0;
      let sum = 0;
      for (let i = 6; i < 24; i++) sum += data[i];
      return sum / (18 * 255);
    },

    isReady() {
      return ctx !== null;
    },

    getContext() {
      return ctx;
    },
  };

  global.PotuzhnostEngine = Engine;

})(window);
