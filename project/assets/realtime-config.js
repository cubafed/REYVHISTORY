// ── ПОТУЖНОСТЬ РУ — Конфигурация Supabase Realtime ──────────────────────
// Заполни supabaseUrl и supabaseAnonKey из supabase.com → Project Settings → API.
// Если оставить enabled:false — сайт работает в локальном режиме как раньше.
//
// КАК НАСТРОИТЬ (один раз):
//   1. Зайди на supabase.com, создай бесплатный проект.
//   2. В SQL-редакторе выполни файл supabase/schema.sql из репозитория.
//   3. Скопируй Project URL и anon key в поля ниже, поставь enabled:true.
//   4. Зарегистрируй себя как admin: отправь magic-link на свой email, потом
//      выполни в SQL: UPDATE profiles SET role='admin' WHERE email='твой@email.com';

window.POTUZHNOST_CONFIG = {
  enabled: true,

  supabaseUrl:     'https://woxystwyudfjegzgzrr.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndveHlzdHd5dWRmamVnemd6enJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwODU2OTUsImV4cCI6MjA5NTY2MTY5NX0.uWUNDutmcMxN4cKxAIvQXjlftxgeilp8r9tAs-j9bOI',

  // Настройки эфира
  radio: {
    defaultTrackId: 1,       // трек по умолчанию если очередь пуста
    djTimeoutSec: 120,       // через сколько секунд без действий от DJ включается джукбокс
    maxChatMessages: 50,     // сколько хранить в памяти
    maxQueueItems: 30,       // лимит заявок в очереди
  },
};
