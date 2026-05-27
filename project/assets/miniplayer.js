// ── ПОТУЖНОСТЬ РУ — Мини-плеер для подстраниц ───────────────────────
// Подключается на taro/chai/shar/zalipay. Появляется в правом нижнем углу.

(function (global) {
  'use strict';

  const Radio = global.PotuzhnostRadio;
  const Engine = global.PotuzhnostEngine;
  if (!Radio || !Engine) return;

  // ── СТИЛИ ───────────────────────────────────────────────────────────
  const css = `
    .pt-mini{position:fixed;right:20px;bottom:20px;z-index:9000;
      width:320px;background:#1a1208;color:#f1e1bd;
      border:2px solid #e8b13a;
      box-shadow:0 8px 28px rgba(0,0,0,.6), 0 0 0 1px rgba(232,177,58,.3);
      font-family:'Special Elite','Courier New',monospace;
      transition:transform .3s cubic-bezier(.2,.9,.3,1.2);
      transform:translateY(0);
    }
    .pt-mini.hidden{transform:translateY(calc(100% - 38px))}
    .pt-mini-head{
      display:flex;align-items:center;justify-content:space-between;
      padding:8px 12px;background:#c8362a;
      border-bottom:2px solid #1a1208;cursor:pointer;
      font-size:11px;letter-spacing:.18em;text-transform:uppercase;
    }
    .pt-mini-head .live{display:flex;align-items:center;gap:6px}
    .pt-mini-head .live-dot{
      width:8px;height:8px;border-radius:50%;background:#1a1208;
      animation:ptMiniPulse 1.4s ease-in-out infinite;
    }
    .pt-mini-head.playing .live-dot{background:#1d6a3b;box-shadow:0 0 8px #1d6a3b}
    @keyframes ptMiniPulse{
      0%,100%{opacity:1;transform:scale(1)}
      50%{opacity:.4;transform:scale(.7)}
    }
    .pt-mini-head .toggle{font-size:14px;line-height:1;color:#f1e1bd;background:none;border:none;cursor:pointer;padding:0 4px}
    .pt-mini-body{padding:12px}
    .pt-mini-track{margin-bottom:10px}
    .pt-mini-name{font-family:'Yeseva One',Georgia,serif;font-size:16px;color:#e8b13a;line-height:1.2}
    .pt-mini-artist{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#dcc28a;opacity:.7;margin-top:3px}
    .pt-mini-progress{height:5px;background:rgba(241,225,189,.15);position:relative;cursor:pointer;margin:8px 0}
    .pt-mini-progress-fill{position:absolute;left:0;top:0;height:100%;background:repeating-linear-gradient(45deg,#e8b13a 0 3px,#c8362a 3px 6px);transition:width .3s linear}
    .pt-mini-controls{display:flex;align-items:center;gap:6px;margin-top:8px}
    .pt-mini-controls button{
      background:transparent;border:1.5px solid #f1e1bd;color:#f1e1bd;
      width:30px;height:30px;cursor:pointer;display:grid;place-items:center;
      transition:all .15s;font-family:inherit;
    }
    .pt-mini-controls button:hover{background:#e8b13a;color:#1a1208;border-color:#e8b13a}
    .pt-mini-controls .play-btn{width:38px;height:38px;background:#1d6a3b;border-color:#1d6a3b}
    .pt-mini-controls .play-btn:hover{background:#e8b13a;border-color:#e8b13a}
    .pt-mini-viz{display:flex;align-items:flex-end;gap:1.5px;height:18px;flex:1;margin-left:6px}
    .pt-mini-viz span{flex:1;background:#e8b13a;min-height:2px;transition:height .08s}
    .pt-mini-home{
      display:inline-block;font-size:9px;letter-spacing:.22em;text-transform:uppercase;
      color:#1d6a3b;text-decoration:none;margin-top:6px;border-bottom:1px dashed #1d6a3b;padding-bottom:1px;
    }
    .pt-mini-home:hover{color:#e8b13a;border-color:#e8b13a}
    @media (max-width:480px){
      .pt-mini{right:10px;bottom:10px;width:calc(100vw - 20px)}
    }
  `;

  function injectCSS() {
    if (document.getElementById('pt-mini-css')) return;
    const style = document.createElement('style');
    style.id = 'pt-mini-css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── HTML МИНИ-ПЛЕЕРА ────────────────────────────────────────────────
  function buildHTML() {
    const homePath = guessHomePath();
    return `
      <div class="pt-mini-head" id="ptMiniHead">
        <div class="live"><span class="live-dot"></span><span id="ptMiniStatus">ОФЛАЙН</span></div>
        <button class="toggle" id="ptMiniToggle" title="Свернуть">─</button>
      </div>
      <div class="pt-mini-body">
        <div class="pt-mini-track">
          <div class="pt-mini-name" id="ptMiniName">—</div>
          <div class="pt-mini-artist" id="ptMiniArtist">потужность ру</div>
        </div>
        <div class="pt-mini-progress" id="ptMiniProgress">
          <div class="pt-mini-progress-fill" id="ptMiniFill" style="width:0%"></div>
        </div>
        <div class="pt-mini-controls">
          <button id="ptMiniPrev" title="Назад">⏮</button>
          <button class="play-btn" id="ptMiniPlay" title="Играть">▶</button>
          <button id="ptMiniNext" title="Вперёд">⏭</button>
          <div class="pt-mini-viz" id="ptMiniViz"></div>
        </div>
        <a class="pt-mini-home" href="${homePath}">★ В эфир →</a>
      </div>
    `;
  }

  function guessHomePath() {
    // Если мы в /vintage/ или /taro/ — путь ../vintage/index.html
    const path = window.location.pathname;
    if (path.includes('/vintage/')) return 'index.html';
    return '../vintage/index.html';
  }

  // ── ЛОГИКА ──────────────────────────────────────────────────────────
  function mount() {
    if (document.querySelector('.pt-mini')) return; // уже есть
    injectCSS();

    const el = document.createElement('div');
    el.className = 'pt-mini hidden'; // по умолчанию свёрнут
    el.innerHTML = buildHTML();
    document.body.appendChild(el);

    const head    = el.querySelector('#ptMiniHead');
    const toggle  = el.querySelector('#ptMiniToggle');
    const playBtn = el.querySelector('#ptMiniPlay');
    const prevBtn = el.querySelector('#ptMiniPrev');
    const nextBtn = el.querySelector('#ptMiniNext');
    const nameEl  = el.querySelector('#ptMiniName');
    const artEl   = el.querySelector('#ptMiniArtist');
    const statusEl= el.querySelector('#ptMiniStatus');
    const fillEl  = el.querySelector('#ptMiniFill');
    const progEl  = el.querySelector('#ptMiniProgress');
    const vizEl   = el.querySelector('#ptMiniViz');

    // Создаём бары визуализатора
    const VIZ_BARS = 12;
    const bars = [];
    for (let i = 0; i < VIZ_BARS; i++) {
      const b = document.createElement('span');
      b.style.height = '2px';
      vizEl.appendChild(b);
      bars.push(b);
    }

    // ── Сворачивание ──────────────────────────────────────────────────
    function setExpanded(expanded) {
      el.classList.toggle('hidden', !expanded);
      toggle.textContent = expanded ? '─' : '▴';
    }
    head.addEventListener('click', e => {
      if (e.target === toggle) return;
      setExpanded(el.classList.contains('hidden'));
    });
    toggle.addEventListener('click', () => setExpanded(el.classList.contains('hidden')));

    // ── Обновление UI ─────────────────────────────────────────────────
    function refreshTrack() {
      const t = Radio.getCurrentTrack();
      nameEl.textContent = t.name;
      artEl.textContent = t.artist;
    }
    function refreshPlayState() {
      const playing = Radio.state.isPlaying;
      playBtn.textContent = playing ? '❚❚' : '▶';
      statusEl.textContent = playing ? 'В ЭФИРЕ' : 'ОФЛАЙН';
      head.classList.toggle('playing', playing);
    }
    function refreshProgress() {
      const t = Radio.getCurrentTrack();
      const pct = Math.min(100, (Radio.state.position / t.duration) * 100);
      fillEl.style.width = pct + '%';
    }

    refreshTrack();
    refreshPlayState();
    refreshProgress();

    // ── Управление ────────────────────────────────────────────────────
    playBtn.addEventListener('click', () => {
      setExpanded(true);
      Engine.toggle();
    });
    prevBtn.addEventListener('click', () => Engine.prev());
    nextBtn.addEventListener('click', () => Engine.next());

    progEl.addEventListener('click', e => {
      const r = progEl.getBoundingClientRect();
      const t = Radio.getCurrentTrack();
      Engine.seek(((e.clientX - r.left) / r.width) * t.duration);
    });

    // ── Подписка на изменения ─────────────────────────────────────────
    Radio.subscribe((type) => {
      if (type === 'track-change' || type === 'sync') refreshTrack();
      if (type === 'play' || type === 'pause' || type === 'sync') refreshPlayState();
      if (type === 'position' || type === 'sync') refreshProgress();
    });

    // ── Анимация визуализатора ────────────────────────────────────────
    function animate() {
      const data = Engine.getAnalyserData();
      if (data && Radio.state.isPlaying) {
        for (let i = 0; i < VIZ_BARS; i++) {
          const idx = Math.floor((i / VIZ_BARS) * 32);
          const v = data[idx] / 255;
          bars[i].style.height = Math.max(2, v * 16) + 'px';
        }
      } else {
        for (let i = 0; i < VIZ_BARS; i++) {
          bars[i].style.height = '2px';
        }
      }
      requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);

    // Авто-разворачивание если играет
    if (Radio.state.isPlaying) setExpanded(true);
  }

  // Монтируем после загрузки DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

})(window);
