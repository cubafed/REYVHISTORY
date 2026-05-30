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
  enabled: false,            // ← поставь true после заполнения ключей

  supabaseUrl:     '',       // https://xxxxxxxx.supabase.co
  supabaseAnonKey: '',       // eyJ...

  // Настройки эфира
  radio: {
    defaultTrackId: 1,       // трек по умолчанию если очередь пуста
    djTimeoutSec: 120,       // через сколько секунд без действий от DJ включается джукбокс
    maxChatMessages: 50,     // сколько хранить в памяти
    maxQueueItems: 30,       // лимит заявок в очереди
  },
};
