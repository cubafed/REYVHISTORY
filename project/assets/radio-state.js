// ── ПОТУЖНОСТЬ РУ — Общее состояние радио ────────────────────────────
// Хранилище состояния между страницами через localStorage + события

(function (global) {
  'use strict';

  const KEY = 'potuzhnost_state_v1';
  const EVT_KEY = 'potuzhnost_evt';

  const DEFAULT_STATE = {
    currentTrackId: 1,
    isPlaying: false,
    volume: 0.65,
    position: 0,
    listeners: 142,
    queue: [],
    history: [],
    chat: [],
  };

  // Каталог треков с синтезированными бас-партиями
  const TRACKS = [
    { id: 1, name: 'Дым над Москвой',     artist: 'Lion Of Moscow',      tag: 'DUB',     duration: 372,
      synth: { root: 41,  pattern: [0,3,5,7,3,0,7,5], lp: 220, rev: 0.4 } },
    { id: 2, name: 'Бас в подвале',       artist: 'Подвал Sound System', tag: 'STEPPERS',duration: 288,
      synth: { root: 38,  pattern: [0,0,7,0,5,3,0,10],lp: 180, rev: 0.5 } },
    { id: 3, name: 'Чай и хапка',         artist: 'Иван-Заскок',         tag: 'ROOTS',   duration: 450,
      synth: { root: 43,  pattern: [0,7,3,5,0,3,7,5], lp: 280, rev: 0.3 } },
    { id: 4, name: 'Снег на пальмах',     artist: 'Northern Riddim',     tag: 'LOVERS',  duration: 311,
      synth: { root: 40,  pattern: [0,5,7,12,7,5,3,0],lp: 320, rev: 0.45 } },
    { id: 5, name: 'Канадский корень',    artist: 'Toronto Junglist',    tag: 'JUNGLE',  duration: 482,
      synth: { root: 36,  pattern: [0,0,0,7,0,0,5,3], lp: 160, rev: 0.6 } },
    { id: 6, name: 'Один Лав, Один Бас',  artist: 'Селектор Иллай',      tag: 'DUB',     duration: 366,
      synth: { root: 42,  pattern: [0,7,5,3,0,7,3,5], lp: 240, rev: 0.5 } },
  ];

  function loadState() {
    try {
      const s = localStorage.getItem(KEY);
      if (!s) return { ...DEFAULT_STATE };
      const parsed = JSON.parse(s);
      return { ...DEFAULT_STATE, ...parsed };
    } catch (e) {
      return { ...DEFAULT_STATE };
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {}
  }

  let state = loadState();
  const listeners = new Set();

  function notify(type, payload) {
    listeners.forEach(fn => {
      try { fn(type, payload, state); } catch (e) {}
    });
    // Сообщаем другим вкладкам
    try {
      localStorage.setItem(EVT_KEY, JSON.stringify({ type, payload, t: Date.now() }));
    } catch (e) {}
  }

  // Синхронизация между вкладками
  window.addEventListener('storage', e => {
    if (e.key === KEY && e.newValue) {
      try { state = JSON.parse(e.newValue); } catch (err) {}
      listeners.forEach(fn => {
        try { fn('sync', null, state); } catch (err) {}
      });
    }
  });

  // ── API ─────────────────────────────────────────────────────────────
  const Radio = {
    TRACKS,

    get state() { return state; },

    getTrack(id) {
      return TRACKS.find(t => t.id === id) || TRACKS[0];
    },

    getCurrentTrack() {
      return this.getTrack(state.currentTrackId);
    },

    setTrack(id) {
      if (!TRACKS.find(t => t.id === id)) return;
      state.currentTrackId = id;
      state.position = 0;
      saveState(state);
      notify('track-change', { id });
    },

    play() {
      state.isPlaying = true;
      saveState(state);
      notify('play', null);
    },

    pause() {
      state.isPlaying = false;
      saveState(state);
      notify('pause', null);
    },

    toggle() {
      if (state.isPlaying) this.pause(); else this.play();
    },

    setVolume(v) {
      state.volume = Math.max(0, Math.min(1, v));
      saveState(state);
      notify('volume', { value: state.volume });
    },

    setPosition(p) {
      state.position = Math.max(0, p);
      saveState(state);
      notify('position', { value: state.position });
    },

    nextTrack() {
      const idx = TRACKS.findIndex(t => t.id === state.currentTrackId);
      const next = TRACKS[(idx + 1) % TRACKS.length];
      this.addToHistory(state.currentTrackId);
      this.setTrack(next.id);
    },

    prevTrack() {
      const idx = TRACKS.findIndex(t => t.id === state.currentTrackId);
      const prev = TRACKS[(idx - 1 + TRACKS.length) % TRACKS.length];
      this.setTrack(prev.id);
    },

    addToHistory(trackId) {
      const entry = { trackId, at: Date.now() };
      state.history.unshift(entry);
      if (state.history.length > 15) state.history.pop();
      saveState(state);
      notify('history-update', entry);
    },

    addToQueue(request) {
      // request: { nick, track, comment }
      const entry = {
        id: Date.now() + Math.random(),
        ...request,
        votes: 1,
        at: Date.now()
      };
      state.queue.push(entry);
      saveState(state);
      notify('queue-update', entry);
      return entry;
    },

    voteQueue(id) {
      const item = state.queue.find(q => q.id === id);
      if (item) {
        item.votes++;
        saveState(state);
        notify('queue-update', item);
      }
    },

    removeFromQueue(id) {
      state.queue = state.queue.filter(q => q.id !== id);
      saveState(state);
      notify('queue-update', null);
    },

    addChatMessage(msg) {
      // msg: { nick, text, isBot }
      const entry = {
        id: Date.now() + Math.random(),
        ...msg,
        at: Date.now()
      };
      state.chat.push(entry);
      if (state.chat.length > 50) state.chat.shift();
      saveState(state);
      notify('chat-update', entry);
      return entry;
    },

    updateListeners(delta) {
      state.listeners = Math.max(50, Math.min(999, state.listeners + delta));
      saveState(state);
      notify('listeners', { value: state.listeners });
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  global.PotuzhnostRadio = Radio;

})(window);
