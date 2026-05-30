// ── ПОТУЖНОСТЬ РУ — Данные афиши ─────────────────────────────────────────
// Единый источник данных для afisha/index.html, afisha/archive.html
// и afisha/admin.html. Хранит состояние в localStorage, синхронизирует
// между вкладками через событие storage.
(function (global) {
  'use strict';

  const KEYS = {
    events:   'afisha_events_v1',
    archive:  'afisha_archive_v1',
    requests: 'afisha_requests_v1',
  };

  // ── Вспомогательные функции дат ───────────────────────────────────────────
  // Дата хранится как ISO-строка, при чтении парсится в Date-объект.
  function toISO(d) {
    if (d instanceof Date) return d.toISOString();
    if (typeof d === 'string') return d;
    // new Date(year, monthIndex, day, h, m) → ISO
    return new Date(d).toISOString();
  }
  function fromISO(s) {
    if (s instanceof Date) return s;
    return new Date(s);
  }
  function eventsFromStorage(arr) {
    return arr.map(e => ({ ...e, date: fromISO(e.date) }));
  }
  function eventsToStorage(arr) {
    return arr.map(e => ({ ...e, date: toISO(e.date) }));
  }

  // ── Дефолтные данные ─────────────────────────────────────────────────────
  const DEFAULT_EVENTS_RAW = [
    { id:'kornevoi-7', date:new Date(2026,5,13,22,0), title:'КОРНЕВОЙ БАС', sub:'vol.7',
      venue:'Подвал на Курской', price:1500, seatsLeft:34, ticketType:'paid',
      lineup:['Иван-Заскок','Lion of Toronto','Northern Riddim','Подвал Sound System'],
      tags:[{t:'DUB',c:'g'},{t:'STEPPERS',c:'r'}], soldOut:false },
    { id:'ognevaya', date:new Date(2026,5,20,23,0), title:'ОГНЕВАЯ ЦЕРЕМОНИЯ', sub:null,
      venue:'Артемьева, 13', price:2000, seatsLeft:8, ticketType:'paid',
      lineup:['Подвал Selecta','JahMobile','Sister Bass','Огневой Дед'],
      tags:[{t:'ROOTS',c:'y'},{t:'SKA',c:''}], soldOut:false },
    { id:'dym', date:new Date(2026,5,27,18,0), title:'ДЫМ НАД РЕКОЙ', sub:'Open Air',
      venue:'Берег Строгино', price:0, seatsLeft:0, ticketType:'free',
      lineup:['Дед-Хаусман','Onezvuk','Гнусь Dub Family','Хор Подмосковный'],
      tags:[{t:'LOVERS',c:'y'},{t:'OPEN AIR',c:'r'},{t:'FREE',c:'g'}], soldOut:true },
    { id:'tysiacha', date:new Date(2026,6,4,22,0), title:'ТЫСЯЧА ВАТТ', sub:null,
      venue:'Завод «Ритм»', price:2500, seatsLeft:120, ticketType:'paid',
      lineup:['Tundra Jungle','BassMonk','ICEcave','DJ Карелия'],
      tags:[{t:'JUNGLE',c:'g'},{t:'DnB',c:'r'}], soldOut:false },
    { id:'solnechnyi', date:new Date(2026,6,11,16,0), title:'СОЛНЕЧНЫЙ ДЖА', sub:'All Day Open Air',
      venue:'Серебряный Бор', price:500, seatsLeft:240, ticketType:'donation',
      lineup:['Подвал All Stars','Иван-Заскок','Lion of Toronto','Tundra Jungle','Sister Bass','Onezvuk','BassMonk','JahMobile'],
      tags:[{t:'ALL DAY',c:'y'},{t:'OPEN AIR',c:'r'},{t:'ДОНЕЙШН',c:'g'}], soldOut:false },
    { id:'noch-kornya', date:new Date(2026,6,18,23,30), title:'НОЧЬ КОРНЯ', sub:null,
      venue:'Подвал-2, Электрозаводская', price:1500, seatsLeft:52, ticketType:'paid',
      lineup:['Иван-Заскок','Подвал Sound System','Гнусь Dub Family'],
      tags:[{t:'DUB',c:'g'}], soldOut:false },
  ];

  const DEFAULT_ARCHIVE_RAW = [
    { id:'kb6', date:new Date(2026,4,2), title:'КОРНЕВОЙ БАС', sub:'vol.6', venue:'Подвал на Курской',
      lineup:['Иван-Заскок','Northern Riddim','Подвал Sound System','Sister Bass'],
      tags:[{t:'DUB',c:'g'},{t:'STEPPERS',c:'r'}], people:320, hours:8, year:2026, featured:true,
      bgColors:['#0f3d22','#1d6a3b','#e8b13a'], shape:'rings' },
    { id:'zimroot', date:new Date(2026,2,14), title:'ЗИМНИЙ КОРЕНЬ', sub:null, venue:'Завод «Ритм», цех 3',
      lineup:['Tundra Jungle','BassMonk','Дед-Хаусман'],
      tags:[{t:'DUB',c:'g'},{t:'DnB',c:'r'}], people:180, hours:7, year:2026,
      bgColors:['#1a1a2e','#16213e','#e8b13a'], shape:'wave' },
    { id:'feb26', date:new Date(2026,1,7), title:'НОЧЬ КОРНЯ', sub:'#4', venue:'Подвал-2, Электрозаводская',
      lineup:['Подвал Sound System','Гнусь Dub Family','JahMobile'],
      tags:[{t:'DUB',c:'g'},{t:'LOVERS',c:'y'}], people:210, hours:7, year:2026,
      bgColors:['#1a1208','#2b1c0a','#c8362a'], shape:'dots' },
    { id:'kb5', date:new Date(2025,10,15), title:'КОРНЕВОЙ БАС', sub:'vol.5', venue:'Подвал на Курской',
      lineup:['Иван-Заскок','Lion of Toronto','Northern Riddim','Подвал Sound System','Sister Bass'],
      tags:[{t:'ROOTS',c:'y'},{t:'DUB',c:'g'},{t:'STEPPERS',c:'r'}], people:390, hours:8, year:2025, featured:false,
      bgColors:['#0f3d22','#c8362a','#e8b13a'], shape:'rays' },
    { id:'autumn25', date:new Date(2025,9,4), title:'ОСЕННИЙ СТЕППЕР', sub:null, venue:'Артемьева, 13',
      lineup:['Подвал Selecta','JahMobile','Огневой Дед'],
      tags:[{t:'STEPPERS',c:'r'},{t:'SKA',c:''}], people:160, hours:6, year:2025,
      bgColors:['#2b1c0a','#e8b13a','#1a1208'], shape:'lines' },
    { id:'solar25', date:new Date(2025,7,16), title:'СОЛНЕЧНЫЙ ДЖА', sub:'Фестиваль', venue:'Серебряный Бор',
      lineup:['Подвал All Stars','Иван-Заскок','Lion of Toronto','Tundra Jungle','Sister Bass','Onezvuk','BassMonk','JahMobile','Дед-Хаусман','Northern Riddim'],
      tags:[{t:'ALL DAY',c:'y'},{t:'OPEN AIR',c:'r'},{t:'ROOTS',c:'g'}], people:680, hours:10, year:2025,
      bgColors:['#c8362a','#e8b13a','#1d6a3b'], shape:'sun' },
    { id:'jun25', date:new Date(2025,5,28), title:'ДЫМ НАД РЕКОЙ', sub:'vol.2', venue:'Берег Строгино',
      lineup:['Дед-Хаусман','Onezvuk','Гнусь Dub Family'],
      tags:[{t:'LOVERS',c:'y'},{t:'OPEN AIR',c:'r'}], people:240, hours:8, year:2025,
      bgColors:['#1d6a3b','#0f3d22','#e8b13a'], shape:'wave' },
    { id:'kb4', date:new Date(2025,4,10), title:'КОРНЕВОЙ БАС', sub:'vol.4', venue:'Подвал на Курской',
      lineup:['Иван-Заскок','Northern Riddim','Подвал Sound System'],
      tags:[{t:'DUB',c:'g'},{t:'STEPPERS',c:'r'}], people:300, hours:8, year:2025,
      bgColors:['#0f3d22','#1d6a3b','#c8362a'], shape:'rings' },
    { id:'mar25', date:new Date(2025,2,22), title:'ВЕСНА В ПОДВАЛЕ', sub:null, venue:'Завод «Ритм»',
      lineup:['BassMonk','ICEcave','DJ Карелия','Sister Bass'],
      tags:[{t:'JUNGLE',c:'g'},{t:'DnB',c:'r'}], people:210, hours:7, year:2025,
      bgColors:['#1a1a2e','#c8362a','#e8b13a'], shape:'dots' },
    { id:'nyeve25', date:new Date(2025,0,4), title:'НОВОГОДНИЙ БАС', sub:null, venue:'Подвал на Курской',
      lineup:['Иван-Заскок','Подвал Sound System','JahMobile','Northern Riddim'],
      tags:[{t:'DUB',c:'g'},{t:'ROOTS',c:'y'}], people:280, hours:9, year:2025,
      bgColors:['#1a1208','#0f3d22','#e8b13a'], shape:'rays' },
    { id:'kb3', date:new Date(2024,11,7), title:'КОРНЕВОЙ БАС', sub:'vol.3', venue:'Подвал на Курской',
      lineup:['Иван-Заскок','Lion of Toronto','Подвал Sound System'],
      tags:[{t:'DUB',c:'g'},{t:'STEPPERS',c:'r'}], people:310, hours:8, year:2024, featured:false,
      bgColors:['#0f3d22','#e8b13a','#c8362a'], shape:'rings' },
    { id:'solar24', date:new Date(2024,7,10), title:'СОЛНЕЧНЫЙ ДЖА', sub:'24', venue:'Берег Строгино',
      lineup:['Подвал All Stars','Иван-Заскок','Lion of Toronto','BassMonk','JahMobile'],
      tags:[{t:'ALL DAY',c:'y'},{t:'OPEN AIR',c:'r'}], people:520, hours:10, year:2024,
      bgColors:['#c8362a','#e8b13a','#0f3d22'], shape:'sun' },
    { id:'kb2', date:new Date(2024,5,15), title:'КОРНЕВОЙ БАС', sub:'vol.2', venue:'Подвал на Курской',
      lineup:['Иван-Заскок','Northern Riddim','Подвал Sound System','Sister Bass'],
      tags:[{t:'DUB',c:'g'},{t:'ROOTS',c:'y'}], people:270, hours:7, year:2024,
      bgColors:['#1d6a3b','#c8362a','#e8b13a'], shape:'wave' },
    { id:'kb1', date:new Date(2024,3,6), title:'КОРНЕВОЙ БАС', sub:'vol.1', venue:'Подвал на Курской',
      lineup:['Иван-Заскок','Подвал Sound System'],
      tags:[{t:'DUB',c:'g'}], people:120, hours:6, year:2024,
      bgColors:['#0f3d22','#1d6a3b','#f1e1bd'], shape:'dots' },
  ];

  // ── Хранение ─────────────────────────────────────────────────────────────
  function load(key, defaults, transform) {
    try {
      const s = localStorage.getItem(key);
      if (!s) return defaults.map(e => ({ ...e }));
      return transform(JSON.parse(s));
    } catch (e) {
      return defaults.map(e => ({ ...e }));
    }
  }

  function save(key, arr, transform) {
    try { localStorage.setItem(key, JSON.stringify(transform(arr))); } catch (e) {}
  }

  function loadRequests() {
    try {
      const s = localStorage.getItem(KEYS.requests);
      return s ? JSON.parse(s) : [];
    } catch (e) { return []; }
  }

  function saveRequests(arr) {
    try { localStorage.setItem(KEYS.requests, JSON.stringify(arr)); } catch (e) {}
  }

  function notify(type) {
    try { localStorage.setItem('afisha_evt', JSON.stringify({ type, t: Date.now() })); } catch (e) {}
  }

  // ── API ───────────────────────────────────────────────────────────────────
  const AfishaData = {

    getEvents() {
      return load(KEYS.events, DEFAULT_EVENTS_RAW, eventsFromStorage);
    },

    saveEvents(arr) {
      save(KEYS.events, arr, eventsToStorage);
      notify('events-updated');
    },

    resetEvents() {
      localStorage.removeItem(KEYS.events);
      notify('events-updated');
    },

    getArchive() {
      return load(KEYS.archive, DEFAULT_ARCHIVE_RAW, eventsFromStorage);
    },

    saveArchive(arr) {
      save(KEYS.archive, arr, eventsToStorage);
      notify('archive-updated');
    },

    resetArchive() {
      localStorage.removeItem(KEYS.archive);
      notify('archive-updated');
    },

    getRequests() { return loadRequests(); },

    addRequest(obj) {
      const arr = loadRequests();
      const entry = { ...obj, id: Date.now() + Math.random(), at: new Date().toISOString(), done: false };
      arr.unshift(entry);
      saveRequests(arr);
      notify('requests-updated');
      return entry;
    },

    updateRequest(id, patch) {
      const arr = loadRequests().map(r => r.id === id ? { ...r, ...patch } : r);
      saveRequests(arr);
      notify('requests-updated');
    },

    deleteRequest(id) {
      saveRequests(loadRequests().filter(r => r.id !== id));
      notify('requests-updated');
    },

    exportAll() {
      return {
        events:   eventsToStorage(this.getEvents()),
        archive:  eventsToStorage(this.getArchive()),
        requests: this.getRequests(),
        exportedAt: new Date().toISOString(),
      };
    },

    importAll(json) {
      try {
        const data = typeof json === 'string' ? JSON.parse(json) : json;
        if (data.events)   save(KEYS.events,  data.events,   x => x);
        if (data.archive)  save(KEYS.archive,  data.archive,  x => x);
        if (data.requests) saveRequests(data.requests);
        notify('import');
        return true;
      } catch (e) { return false; }
    },

    // Генерирует код для вставки в index.html / archive.html
    generateCode() {
      const evts = eventsToStorage(this.getEvents());
      const arch = eventsToStorage(this.getArchive());
      const fmtDate = iso => {
        const d = new Date(iso);
        const args = [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]
          .filter((v, i) => i < 3 || v > 0);
        return `new Date(${args.join(',')})`;
      };
      const fmtEvt = e => {
        const parts = [
          `  { id:${JSON.stringify(e.id)}, date:${fmtDate(e.date)}, title:${JSON.stringify(e.title)}, sub:${JSON.stringify(e.sub)}`,
          `    venue:${JSON.stringify(e.venue)}, price:${e.price}, seatsLeft:${e.seatsLeft}, ticketType:${JSON.stringify(e.ticketType)}`,
          `    lineup:${JSON.stringify(e.lineup)}`,
          `    tags:${JSON.stringify(e.tags)}, soldOut:${e.soldOut} }`,
        ];
        return parts.join(',\n');
      };
      const fmtArc = e => {
        const parts = [
          `  { id:${JSON.stringify(e.id)}, date:${fmtDate(e.date)}, title:${JSON.stringify(e.title)}, sub:${JSON.stringify(e.sub)}, venue:${JSON.stringify(e.venue)}`,
          `    lineup:${JSON.stringify(e.lineup)}`,
          `    tags:${JSON.stringify(e.tags)}, people:${e.people}, hours:${e.hours}, year:${e.year}${e.featured?', featured:true':''}`,
          `    bgColors:${JSON.stringify(e.bgColors)}, shape:${JSON.stringify(e.shape)} }`,
        ];
        return parts.join(',\n');
      };
      return {
        events:  `const EVENTS = [\n${evts.map(fmtEvt).join(',\n')}\n];`,
        archive: `const ARCHIVE = [\n${arch.map(fmtArc).join(',\n')}\n];`,
      };
    },

    subscribe(fn) {
      const handler = e => {
        if (e.key === 'afisha_evt') {
          try { fn(JSON.parse(e.newValue)); } catch (_) {}
        }
      };
      window.addEventListener('storage', handler);
      return () => window.removeEventListener('storage', handler);
    },
  };

  global.AfishaData = AfishaData;

})(window);
