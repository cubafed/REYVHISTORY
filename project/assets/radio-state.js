// ── ПОТУЖНОСТЬ РУ — Общее состояние радио ────────────────────────────────
// В локальном режиме (config.enabled=false) — localStorage + события.
// В realtime-режиме (config.enabled=true) — Supabase Realtime.
// Публичный API PotuzhnostRadio одинаков в обоих режимах.

(function (global) {
  'use strict';

  const cfg = global.POTUZHNOST_CONFIG || { enabled: false };

  const KEY     = 'potuzhnost_state_v1';
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
    controller: 'jukebox',   // 'jukebox' | 'dj'
    controllerDj: null,
  };

  const TRACKS = [
    { id: 1, name: 'Дым над Москвой',     artist: 'Lion Of Moscow',      tag: 'DUB',     duration: 372,
      synth: { root: 41, pattern: [0,3,5,7,3,0,7,5],  lp: 220, rev: 0.4 } },
    { id: 2, name: 'Бас в подвале',       artist: 'Подвал Sound System', tag: 'STEPPERS',duration: 288,
      synth: { root: 38, pattern: [0,0,7,0,5,3,0,10], lp: 180, rev: 0.5 } },
    { id: 3, name: 'Чай и хапка',         artist: 'Иван-Заскок',         tag: 'ROOTS',   duration: 450,
      synth: { root: 43, pattern: [0,7,3,5,0,3,7,5],  lp: 280, rev: 0.3 } },
    { id: 4, name: 'Снег на пальмах',     artist: 'Northern Riddim',     tag: 'LOVERS',  duration: 311,
      synth: { root: 40, pattern: [0,5,7,12,7,5,3,0], lp: 320, rev: 0.45 } },
    { id: 5, name: 'Канадский корень',    artist: 'Toronto Junglist',    tag: 'JUNGLE',  duration: 482,
      synth: { root: 36, pattern: [0,0,0,7,0,0,5,3],  lp: 160, rev: 0.6 } },
    { id: 6, name: 'Один Лав, Один Бас',  artist: 'Селектор Иллай',      tag: 'DUB',     duration: 366,
      synth: { root: 42, pattern: [0,7,5,3,0,7,3,5],  lp: 240, rev: 0.5 } },
  ];

  // ── ЛОКАЛЬНОЕ ХРАНИЛИЩЕ ──────────────────────────────────────────────────
  function loadState() {
    try {
      const s = localStorage.getItem(KEY);
      if (!s) return { ...DEFAULT_STATE };
      return { ...DEFAULT_STATE, ...JSON.parse(s) };
    } catch (e) { return { ...DEFAULT_STATE }; }
  }
  function saveState(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  let state = loadState();
  const listeners = new Set();

  function notify(type, payload) {
    listeners.forEach(fn => { try { fn(type, payload, state); } catch (e) {} });
    try { localStorage.setItem(EVT_KEY, JSON.stringify({ type, payload, t: Date.now() })); } catch (e) {}
  }

  window.addEventListener('storage', e => {
    if (e.key === KEY && e.newValue) {
      try { state = JSON.parse(e.newValue); } catch (err) {}
      listeners.forEach(fn => { try { fn('sync', null, state); } catch (err) {} });
    }
  });

  // ── REALTIME АДАПТЕР ─────────────────────────────────────────────────────
  let sb = null;           // Supabase client
  let sbUser = null;       // текущий auth user
  let sbProfile = null;    // профиль с ролью
  let presenceChannel = null;
  let reactionCallbacks = [];
  let reactionChannel = null;
  const VOTER_ID = (() => {
    let id = localStorage.getItem('ptz_voter_id');
    if (!id) { id = Math.random().toString(36).slice(2)+Date.now().toString(36); localStorage.setItem('ptz_voter_id',id); }
    return id;
  })();

  function loadSupabase() {
    return new Promise((resolve, reject) => {
      if (global.supabase) { resolve(global.supabase); return; }
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
      s.onload = () => resolve(global.supabase);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function initRealtime() {
    if (!cfg.enabled || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return;
    const supabaseLib = await loadSupabase();
    sb = supabaseLib.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

    // Текущий пользователь
    const { data: { session } } = await sb.auth.getSession();
    sbUser = session?.user || null;
    if (sbUser) {
      const { data } = await sb.from('profiles').select('*').eq('id', sbUser.id).single();
      sbProfile = data;
    }
    sb.auth.onAuthStateChange((_event, session) => {
      sbUser = session?.user || null;
      if (sbUser) {
        sb.from('profiles').select('*').eq('id', sbUser.id).single()
          .then(({ data }) => { sbProfile = data; notify('auth', { user: sbUser, profile: sbProfile }); });
      } else {
        sbProfile = null;
        notify('auth', { user: null, profile: null });
      }
    });

    // Загружаем начальное состояние
    await syncFromServer();

    // Подписки realtime
    sb.channel('radio_state')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'radio_state' },
        payload => { applyRadioState(payload.new); notify('track-change', payload.new); notify('sync', null, state); })
      .subscribe();

    sb.channel('chat_messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        payload => {
          const msg = payload.new;
          const entry = { id: msg.id, nick: msg.nick, text: msg.text, color: msg.color, isBot: msg.is_bot, at: Date.parse(msg.created_at) };
          state.chat.push(entry);
          if (state.chat.length > (cfg.radio?.maxChatMessages || 50)) state.chat.shift();
          notify('chat-update', entry);
        })
      .subscribe();

    sb.channel('track_requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'track_requests' },
        async () => { await syncQueue(); notify('queue-update', null); })
      .subscribe();

    sb.channel('dj_slots')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dj_slots' },
        () => notify('schedule-update', null))
      .subscribe();

    // Presence (счётчик слушателей)
    presenceChannel = sb.channel('presence:radio', { config: { presence: { key: VOTER_ID } } });
    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const presenceState = presenceChannel.presenceState();
        const count = Object.keys(presenceState).length;
        state.listeners = count;
        notify('listeners', { value: count });
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') await presenceChannel.track({ id: VOTER_ID, joined_at: Date.now() });
      });

    // Broadcast реакции
    reactionChannel = sb.channel('reactions:radio');
    reactionChannel
      .on('broadcast', { event: 'reaction' }, payload => {
        reactionCallbacks.forEach(fn => { try { fn(payload.payload); } catch (e) {} });
      })
      .subscribe();

    console.log('[PotuzhnostRadio] Realtime mode ON');
  }

  async function syncFromServer() {
    if (!sb) return;
    const [rsRes, chatRes, queueRes] = await Promise.all([
      sb.from('radio_state').select('*').single(),
      sb.from('chat_messages').select('*').order('created_at', { ascending: true }).limit(50),
      sb.from('track_requests').select('*').eq('status','pending').order('votes', { ascending: false }).limit(30),
    ]);
    if (rsRes.data) applyRadioState(rsRes.data);
    if (chatRes.data) {
      state.chat = chatRes.data.map(m => ({
        id: m.id, nick: m.nick, text: m.text, color: m.color, isBot: m.is_bot, at: Date.parse(m.created_at)
      }));
    }
    if (queueRes.data) {
      state.queue = queueRes.data.map(r => ({
        id: r.id, nick: r.nick, track: TRACKS.find(t=>t.id===r.track_id)?.name || 'Трек '+r.track_id,
        trackId: r.track_id, comment: r.comment, votes: r.votes, status: r.status
      }));
    }
    notify('sync', null, state);
  }

  async function syncQueue() {
    if (!sb) return;
    const { data } = await sb.from('track_requests').select('*').eq('status','pending')
      .order('votes', { ascending: false }).limit(30);
    if (data) {
      state.queue = data.map(r => ({
        id: r.id, nick: r.nick, track: TRACKS.find(t=>t.id===r.track_id)?.name || 'Трек '+r.track_id,
        trackId: r.track_id, comment: r.comment, votes: r.votes, status: r.status
      }));
    }
  }

  function applyRadioState(rs) {
    if (!rs) return;
    state.currentTrackId  = rs.current_track_id;
    state.isPlaying       = rs.is_playing;
    state.controller      = rs.controller;
    state.controllerDj    = rs.controller_dj;
    // Вычислить позицию из started_at
    if (rs.started_at && rs.is_playing) {
      const elapsed = (Date.now() - Date.parse(rs.started_at)) / 1000;
      state.position = (rs.position_base || 0) + elapsed;
      state._startedAt   = Date.parse(rs.started_at);
      state._positionBase = rs.position_base || 0;
    } else {
      state.position      = rs.position_base || 0;
      state._startedAt    = null;
      state._positionBase = rs.position_base || 0;
    }
  }

  // Запускаем realtime если включено
  if (cfg.enabled) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initRealtime);
    } else {
      initRealtime();
    }
  }

  // ── ПУБЛИЧНОЕ API PotuzhnostRadio ────────────────────────────────────────
  const Radio = {
    TRACKS,
    get state() { return state; },

    getTrack(id) { return TRACKS.find(t => t.id === id) || TRACKS[0]; },
    getCurrentTrack() { return this.getTrack(state.currentTrackId); },

    // Вычислить текущую позицию с учётом started_at (для realtime-режима)
    getPosition() {
      if (cfg.enabled && state._startedAt && state.isPlaying) {
        return (Date.now() - state._startedAt) / 1000 + (state._positionBase || 0);
      }
      return state.position;
    },

    // ── ВОСПРОИЗВЕДЕНИЕ ────────────────────────────────────────────────
    setTrack(id) {
      if (!TRACKS.find(t => t.id === id)) return;
      if (cfg.enabled) {
        // В realtime-режиме — только через DJ-функцию
        sb.rpc('dj_set_track', { track_id_in: id, from_position: 0 }).then(({ data }) => {
          if (data?.error) console.warn('[Radio] dj_set_track:', data.error);
        });
        return;
      }
      state.currentTrackId = id; state.position = 0;
      saveState(state); notify('track-change', { id });
    },

    play() {
      if (cfg.enabled) {
        sb.rpc('dj_toggle_play', { playing: true });
        return;
      }
      state.isPlaying = true; saveState(state); notify('play', null);
    },
    pause() {
      if (cfg.enabled) {
        sb.rpc('dj_toggle_play', { playing: false });
        return;
      }
      state.isPlaying = false; saveState(state); notify('pause', null);
    },
    toggle() { if (state.isPlaying) this.pause(); else this.play(); },

    setVolume(v) {
      state.volume = Math.max(0, Math.min(1, v));
      saveState(state); notify('volume', { value: state.volume });
    },
    setPosition(p) {
      state.position = Math.max(0, p);
      saveState(state); notify('position', { value: state.position });
    },

    nextTrack() {
      if (cfg.enabled) { this.requestAdvance(); return; }
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

    // ── ОЧЕРЕДЬ / ЗАЯВКИ ───────────────────────────────────────────────
    addToQueue(request) {
      if (cfg.enabled && sb) {
        const trackId = request.trackId || (TRACKS.find(t=>t.name.toLowerCase()===request.track?.toLowerCase())?.id) || 1;
        sb.from('track_requests').insert({
          nick: request.nick || 'Анон',
          track_id: trackId,
          comment: request.comment || '',
        }).then(() => syncQueue().then(() => notify('queue-update', null)));
        return { id: Date.now(), ...request };
      }
      const entry = { id: Date.now() + Math.random(), ...request, votes: 1, at: Date.now() };
      state.queue.push(entry);
      saveState(state); notify('queue-update', entry);
      return entry;
    },

    voteQueue(id) {
      if (cfg.enabled && sb) {
        sb.rpc('vote_request', { req_id: id, voter: VOTER_ID })
          .then(() => syncQueue().then(() => notify('queue-update', null)));
        return;
      }
      const item = state.queue.find(q => q.id === id);
      if (item) { item.votes++; saveState(state); notify('queue-update', item); }
    },

    removeFromQueue(id) {
      if (cfg.enabled && sb) {
        sb.from('track_requests').delete().eq('id', id)
          .then(() => syncQueue().then(() => notify('queue-update', null)));
        return;
      }
      state.queue = state.queue.filter(q => q.id !== id);
      saveState(state); notify('queue-update', null);
    },

    // ── ЧАТ ────────────────────────────────────────────────────────────
    addChatMessage(msg) {
      const entry = { id: Date.now() + Math.random(), ...msg, at: Date.now() };
      if (cfg.enabled && sb) {
        sb.from('chat_messages').insert({
          nick: msg.nick || 'Анон', text: msg.text, color: msg.color || '', is_bot: msg.isBot || false
        });
        return entry;
      }
      state.chat.push(entry);
      if (state.chat.length > 50) state.chat.shift();
      saveState(state); notify('chat-update', entry);
      return entry;
    },

    deleteChat(id) {
      if (cfg.enabled && sb) {
        sb.from('chat_messages').delete().eq('id', id);
        return;
      }
      state.chat = state.chat.filter(m => m.id !== id);
      saveState(state); notify('chat-update', null);
    },

    // ── РЕАКЦИИ (эмодзи broadcast) ─────────────────────────────────────
    sendReaction(emoji) {
      if (cfg.enabled && reactionChannel) {
        reactionChannel.send({ type: 'broadcast', event: 'reaction', payload: { emoji, voter: VOTER_ID } });
      } else {
        reactionCallbacks.forEach(fn => { try { fn({ emoji }); } catch (e) {} });
      }
    },
    onReaction(fn) { reactionCallbacks.push(fn); return () => { reactionCallbacks = reactionCallbacks.filter(f=>f!==fn); }; },

    // ── СЛУШАТЕЛИ ──────────────────────────────────────────────────────
    updateListeners(delta) {
      state.listeners = Math.max(50, Math.min(999, state.listeners + delta));
      saveState(state); notify('listeners', { value: state.listeners });
    },
    getListeners() { return state.listeners; },

    // ── ИСТОРИЯ ────────────────────────────────────────────────────────
    addToHistory(trackId) {
      const entry = { trackId, at: Date.now() };
      state.history.unshift(entry);
      if (state.history.length > 15) state.history.pop();
      saveState(state); notify('history-update', entry);
    },

    // ── ДЖУКБОКС: АВТО-ПЕРЕХОД ─────────────────────────────────────────
    requestAdvance() {
      if (cfg.enabled && sb) {
        sb.rpc('advance_if_due').then(({ data }) => {
          if (data?.status === 'advanced') syncFromServer();
        });
        return;
      }
      // Локальный режим
      const idx = TRACKS.findIndex(t => t.id === state.currentTrackId);
      const next = TRACKS[(idx + 1) % TRACKS.length];
      this.addToHistory(state.currentTrackId);
      state.currentTrackId = next.id; state.position = 0; state.isPlaying = true;
      saveState(state); notify('track-change', { id: next.id });
    },

    // ── DJ РОЛЬ ────────────────────────────────────────────────────────
    djSetTrack(trackId, fromPos = 0) {
      if (cfg.enabled && sb) {
        return sb.rpc('dj_set_track', { track_id_in: trackId, from_position: fromPos });
      }
      this.setTrack(trackId);
      return Promise.resolve({ data: { ok: true } });
    },
    djTogglePlay(playing) {
      if (cfg.enabled && sb) {
        return sb.rpc('dj_toggle_play', { playing });
      }
      if (playing) this.play(); else this.pause();
      return Promise.resolve({ data: { ok: true } });
    },

    // Активный DJ-слот прямо сейчас
    async activeSlotNow() {
      if (!cfg.enabled || !sb) return null;
      const { data } = await sb.rpc('active_dj_slot');
      return data;
    },

    // ── DJ ЗАЯВКИ НА ВЫСТУПЛЕНИЕ ───────────────────────────────────────
    async submitDjApplication(form) {
      if (cfg.enabled && sb) {
        const { data, error } = await sb.rpc('submit_dj_application', {
          dj_name_in:     form.djName,
          slot_date_in:   form.slotDate,
          start_time_in:  form.startTime,
          end_time_in:    form.endTime,
          genre_in:       form.genre || '',
          description_in: form.description || '',
          contact_in:     form.contact || '',
        });
        return { id: data, error };
      }
      // Локальный режим — сохранить в localStorage как заявку на рассмотрение
      const entry = { id: Date.now().toString(36), ...form, status: 'pending', at: Date.now() };
      const arr = JSON.parse(localStorage.getItem('dj_applications') || '[]');
      arr.unshift(entry);
      localStorage.setItem('dj_applications', JSON.stringify(arr));
      return { id: entry.id };
    },

    async getDjApplications() {
      if (cfg.enabled && sb) {
        const { data } = await sb.from('dj_slots').select('*').order('created_at', { ascending: false });
        return data || [];
      }
      return JSON.parse(localStorage.getItem('dj_applications') || '[]');
    },

    async getSchedule() {
      if (cfg.enabled && sb) {
        const today = new Date().toISOString().slice(0,10);
        const week  = new Date(Date.now()+7*86400000).toISOString().slice(0,10);
        const { data } = await sb.from('dj_slots').select('*')
          .eq('status','approved').gte('slot_date', today).lte('slot_date', week)
          .order('slot_date').order('start_time');
        return data || [];
      }
      // Локальный режим — возвращаем зашитое расписание (для обратной совместимости)
      return null;
    },

    // ── AUTH ────────────────────────────────────────────────────────────
    async signIn(email) {
      if (!cfg.enabled || !sb) return { error: 'realtime not enabled' };
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } });
      return { error };
    },
    async signOut() {
      if (cfg.enabled && sb) await sb.auth.signOut();
      sbUser = null; sbProfile = null;
      notify('auth', { user: null, profile: null });
    },
    getUser()    { return sbUser; },
    getProfile() { return sbProfile; },
    isAdmin()    { return sbProfile?.role === 'admin'; },
    isDJ()       { return sbProfile?.role === 'dj' || sbProfile?.role === 'admin'; },

    // Admin RPC
    async adminReviewSlot(slotId, approve, note = '') {
      if (!cfg.enabled || !sb) return;
      return sb.rpc('admin_review_slot', { slot_id: slotId, approve, note });
    },
    async adminClearQueue() {
      if (!cfg.enabled || !sb) return;
      return sb.rpc('admin_clear_queue');
    },

    // ── ПОДПИСКА ────────────────────────────────────────────────────────
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    // Геттер клиента Supabase (для продвинутых запросов в UI)
    getSupabase() { return sb; },
    getVoterId()  { return VOTER_ID; },
  };

  global.PotuzhnostRadio = Radio;

})(window);
