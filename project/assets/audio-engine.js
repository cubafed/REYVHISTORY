// ── ПОТУЖНОСТЬ РУ — Аудио движок ────────────────────────────────────
// Web Audio API. Синтезирует бас-партии прямо в браузере.
// В realtime-режиме синхронизирует позицию по started_at сервера.

(function (global) {
  'use strict';

  const Radio = global.PotuzhnostRadio;
  const cfg   = global.POTUZHNOST_CONFIG || { enabled: false };
  if (!Radio) { console.warn('PotuzhnostRadio state not loaded'); return; }

  let ctx = null;
  let masterGain = null;
  let analyser = null;
  let analyserData = null;
  let currentSynth = null;
  let trackStartTime = 0;
  let pausedPosition = 0;
  let currentTrack = null;
  let positionUpdateInterval = null;
  let advanceTimer = null;

  // ── ИНИЦИАЛИЗАЦИЯ ────────────────────────────────────────────────────
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

  // ── СИНТЕЗ ТРЕКА ─────────────────────────────────────────────────────
  function createSynthTrack(params) {
    if (!ctx) init();
    const { root, pattern, lp, rev } = params;
    const trackGain = ctx.createGain();
    trackGain.gain.value = 0.8;
    const conv = ctx.createConvolver();
    conv.buffer = createImpulseResponse(rev || 0.4);
    const revGain = ctx.createGain(); revGain.gain.value = 0.25;
    const dryGain = ctx.createGain(); dryGain.gain.value = 0.75;
    const lpFilt = ctx.createBiquadFilter();
    lpFilt.type = 'lowpass'; lpFilt.frequency.value = 4500;
    trackGain.connect(dryGain); trackGain.connect(conv);
    conv.connect(revGain); dryGain.connect(lpFilt); revGain.connect(lpFilt);
    lpFilt.connect(masterGain);

    const oscillators = [];
    const bpm = 78, beatDur = 60 / bpm, stepDur = beatDur / 2;
    const patternLen = pattern.length * stepDur;

    function scheduleBassNote(startTime, midi) {
      const osc = ctx.createOscillator(), subOsc = ctx.createOscillator();
      const g = ctx.createGain(), filt = ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = lp; filt.Q.value = 6;
      osc.type = 'sawtooth'; subOsc.type = 'sine';
      osc.frequency.value = midiToHz(midi); subOsc.frequency.value = midiToHz(midi - 12);
      g.gain.setValueAtTime(0, startTime);
      g.gain.linearRampToValueAtTime(0.42, startTime + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, startTime + beatDur * 0.78);
      osc.connect(g); subOsc.connect(g); g.connect(trackGain);
      osc.start(startTime); subOsc.start(startTime);
      osc.stop(startTime + beatDur); subOsc.stop(startTime + beatDur);
      oscillators.push(osc, subOsc);
    }
    function scheduleKick(startTime) {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(130, startTime);
      osc.frequency.exponentialRampToValueAtTime(38, startTime + 0.13);
      g.gain.setValueAtTime(0.78, startTime);
      g.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18);
      osc.connect(g); g.connect(trackGain);
      osc.start(startTime); osc.stop(startTime + 0.2);
      oscillators.push(osc);
    }
    function scheduleHat(startTime, openness) {
      const noiseBuf = createNoiseBuffer(0.08), src = ctx.createBufferSource();
      const filt = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = noiseBuf; filt.type = 'highpass'; filt.frequency.value = 7000;
      g.gain.setValueAtTime(0.16, startTime);
      g.gain.exponentialRampToValueAtTime(0.001, startTime + (openness ? 0.18 : 0.04));
      src.connect(filt); filt.connect(g); g.connect(trackGain);
      src.start(startTime); src.stop(startTime + 0.25);
      oscillators.push(src);
    }
    function scheduleStab(startTime, midi) {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      const filt = ctx.createBiquadFilter();
      filt.type = 'bandpass'; filt.frequency.value = 900; filt.Q.value = 4;
      osc.type = 'square'; osc.frequency.value = midiToHz(midi + 12);
      g.gain.setValueAtTime(0, startTime);
      g.gain.linearRampToValueAtTime(0.07, startTime + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, startTime + 0.22);
      osc.connect(filt); filt.connect(g); g.connect(trackGain);
      osc.start(startTime); osc.stop(startTime + 0.25);
      oscillators.push(osc);
    }
    function scheduleLoop(loopStartTime) {
      for (let i = 0; i < pattern.length; i++) {
        const t = loopStartTime + i * stepDur;
        scheduleBassNote(t, root + pattern[i]);
        if (i === 0 || i === 4) scheduleKick(t);
        if (i % 2 === 1) scheduleHat(t, i === 3 || i === 7);
        if (i === 2 || i === 6) scheduleStab(t, root + pattern[i] + 7);
      }
    }

    let scheduledUntil = ctx.currentTime, schedulerInterval = null;
    function startScheduler(fromTime) {
      scheduledUntil = fromTime;
      const tick = () => {
        const ahead = 1.5;
        while (scheduledUntil < ctx.currentTime + ahead) {
          scheduleLoop(scheduledUntil); scheduledUntil += patternLen;
        }
      };
      tick(); schedulerInterval = setInterval(tick, 250);
    }
    function stop() {
      if (schedulerInterval) clearInterval(schedulerInterval); schedulerInterval = null;
      oscillators.forEach(o => { try { o.stop(); } catch (e) {} });
      oscillators.length = 0;
      try {
        trackGain.gain.cancelScheduledValues(ctx.currentTime);
        trackGain.gain.setValueAtTime(trackGain.gain.value, ctx.currentTime);
        trackGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      } catch (e) {}
      setTimeout(() => { try { lpFilt.disconnect(); } catch (e) {} }, 200);
    }
    return { start: startScheduler, stop };
  }

  function createImpulseResponse(seconds) {
    const length = ctx.sampleRate * seconds, impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
    }
    return impulse;
  }
  function createNoiseBuffer(seconds) {
    const length = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }
  function midiToHz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  // ── УПРАВЛЕНИЕ ВОСПРОИЗВЕДЕНИЕМ ──────────────────────────────────────
  function startTrack(track, fromPosition) {
    init();
    if (ctx.state === 'suspended') ctx.resume();
    if (currentSynth) { currentSynth.stop(); currentSynth = null; }

    currentTrack = track;
    pausedPosition = fromPosition;
    trackStartTime = ctx.currentTime - fromPosition;
    currentSynth = createSynthTrack(track.synth);
    currentSynth.start(ctx.currentTime);

    if (positionUpdateInterval) clearInterval(positionUpdateInterval);
    positionUpdateInterval = setInterval(() => {
      const pos = ctx.currentTime - trackStartTime;
      if (!cfg.enabled) Radio.setPosition(pos);

      // В realtime-режиме: авто-переход через RPC только в режиме джукбокса
      // В DJ-режиме — DJ сам переключает
      if (pos >= track.duration - 1) {
        if (!cfg.enabled) {
          // Локальный режим: авто-переход
          Engine.next();
        } else if (Radio.state.controller === 'jukebox') {
          // Realtime-джукбокс: запрашиваем следующий у сервера
          if (!advanceTimer) {
            advanceTimer = setTimeout(() => {
              advanceTimer = null;
              Radio.requestAdvance();
            }, Math.max(0, (track.duration - pos) * 1000));
          }
        }
        // DJ-режим: ждём действий DJ
      }
    }, 250);
  }

  function pauseTrack() {
    if (currentSynth) {
      pausedPosition = ctx ? ctx.currentTime - trackStartTime : 0;
      currentSynth.stop(); currentSynth = null;
    }
    if (positionUpdateInterval) { clearInterval(positionUpdateInterval); positionUpdateInterval = null; }
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
  }

  // ── ПОДПИСКА НА СОБЫТИЯ РАДИО (realtime-синхронизация) ───────────────
  Radio.subscribe((type, payload, newState) => {
    if (type === 'track-change' || type === 'sync') {
      if (!ctx) return; // движок не инициализирован — пропускаем
      const track = Radio.getCurrentTrack();
      if (!track) return;
      // Вычислить позицию из started_at (серверное время)
      const pos = cfg.enabled ? Radio.getPosition() : (newState?.position || 0);
      if (track.id !== currentTrack?.id || Math.abs(pos - (ctx.currentTime - trackStartTime)) > 3) {
        // Разная треки или рассинхрон > 3 сек → жёсткий seek
        if (newState?.isPlaying) startTrack(track, Math.max(0, pos));
      }
    }
    if (type === 'play' && currentTrack) {
      const pos = cfg.enabled ? Radio.getPosition() : pausedPosition;
      startTrack(currentTrack, Math.max(0, pos));
    }
    if (type === 'pause') pauseTrack();
  });

  // ── ПУБЛИЧНОЕ API ────────────────────────────────────────────────────
  const Engine = {
    init,

    play() {
      if (!ctx) init();
      const track = Radio.getCurrentTrack();
      const pos = cfg.enabled ? Radio.getPosition() : (Radio.state.position || 0);
      startTrack(track, Math.max(0, pos));
      Radio.play();
    },

    pause() { pauseTrack(); Radio.pause(); },

    toggle() { if (Radio.state.isPlaying) this.pause(); else this.play(); },

    next() {
      const wasPlaying = Radio.state.isPlaying;
      if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
      Radio.nextTrack();
      if (wasPlaying) {
        const track = Radio.getCurrentTrack();
        startTrack(track, 0);
      } else { pauseTrack(); }
    },

    prev() {
      const wasPlaying = Radio.state.isPlaying;
      Radio.prevTrack();
      if (wasPlaying) { const track = Radio.getCurrentTrack(); startTrack(track, 0); }
      else pauseTrack();
    },

    seek(seconds) {
      if (Radio.state.isPlaying) {
        const track = Radio.getCurrentTrack(); startTrack(track, seconds);
      } else { Radio.setPosition(seconds); pausedPosition = seconds; }
    },

    setVolume(v) { Radio.setVolume(v); if (masterGain) masterGain.gain.value = v; },

    getAnalyserData() {
      if (!analyser) return null;
      analyser.getByteFrequencyData(analyserData);
      return analyserData;
    },

    getBassLevel() {
      const data = this.getAnalyserData(); if (!data) return 0;
      let sum = 0; for (let i = 0; i < 6; i++) sum += data[i];
      return sum / (6 * 255);
    },
    getMidLevel() {
      const data = this.getAnalyserData(); if (!data) return 0;
      let sum = 0; for (let i = 6; i < 24; i++) sum += data[i];
      return sum / (18 * 255);
    },
    isReady() { return ctx !== null; },
    getContext() { return ctx; },
  };

  global.PotuzhnostEngine = Engine;

})(window);
