-- ── ПОТУЖНОСТЬ РУ — Supabase Schema ─────────────────────────────────────
-- Выполни в SQL-редакторе Supabase: Database → SQL Editor → New query
-- Поддерживает: realtime, RLS, RPC для защищённых операций

-- ─────────────────────────────────────────────────────────────────────────
-- РАСШИРЕНИЯ
-- ─────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────
-- КАТАЛОГ ТРЕКОВ
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tracks (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  artist      TEXT NOT NULL,
  duration    INTEGER NOT NULL, -- секунды
  tag         TEXT DEFAULT 'DUB',
  synth       JSONB              -- параметры синтеза
);

-- Дефолтные треки (соответствуют TRACKS в radio-state.js)
INSERT INTO tracks (id, name, artist, duration, tag, synth) VALUES
  (1, 'Дым над Москвой',     'Lion Of Moscow',      372, 'DUB',     '{"root":41,"pattern":[0,3,5,7,3,0,7,5],"lp":220,"rev":0.4}'),
  (2, 'Бас в подвале',       'Подвал Sound System', 288, 'STEPPERS','{"root":38,"pattern":[0,0,7,0,5,3,0,10],"lp":180,"rev":0.5}'),
  (3, 'Чай и хапка',         'Иван-Заскок',         450, 'ROOTS',   '{"root":43,"pattern":[0,7,3,5,0,3,7,5],"lp":280,"rev":0.3}'),
  (4, 'Снег на пальмах',     'Northern Riddim',     311, 'LOVERS',  '{"root":40,"pattern":[0,5,7,12,7,5,3,0],"lp":320,"rev":0.45}'),
  (5, 'Канадский корень',    'Toronto Junglist',    482, 'JUNGLE',  '{"root":36,"pattern":[0,0,0,7,0,0,5,3],"lp":160,"rev":0.6}'),
  (6, 'Один Лав, Один Бас',  'Селектор Иллай',      366, 'DUB',     '{"root":42,"pattern":[0,7,5,3,0,7,3,5],"lp":240,"rev":0.5}')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- ПРОФИЛИ ПОЛЬЗОВАТЕЛЕЙ
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  role         TEXT NOT NULL DEFAULT 'listener' CHECK (role IN ('listener','dj','admin')),
  email        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Автоматически создаём профиль при регистрации
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────
-- СОСТОЯНИЕ РАДИО (всегда 1 строка)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS radio_state (
  id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  current_track_id INTEGER NOT NULL DEFAULT 1 REFERENCES tracks(id),
  is_playing      BOOLEAN NOT NULL DEFAULT FALSE,
  started_at      TIMESTAMPTZ DEFAULT NOW(), -- когда трек начал играть
  position_base   FLOAT DEFAULT 0,          -- позиция в секундах в момент started_at
  controller      TEXT NOT NULL DEFAULT 'jukebox' CHECK (controller IN ('jukebox','dj')),
  controller_dj   UUID REFERENCES profiles(id), -- кто из DJ сейчас рулит
  dj_last_action  TIMESTAMPTZ DEFAULT NOW(), -- для timeout-fallback к джукбоксу
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO radio_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- ЧАТ
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id         BIGSERIAL PRIMARY KEY,
  nick       TEXT NOT NULL DEFAULT 'Анон',
  text       TEXT NOT NULL,
  color      TEXT DEFAULT '',     -- цвет для отображения
  is_bot     BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Хранить последние 200 сообщений
CREATE OR REPLACE FUNCTION trim_chat() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM chat_messages
  WHERE id NOT IN (SELECT id FROM chat_messages ORDER BY created_at DESC LIMIT 200);
  RETURN NULL;
END;
$$;
CREATE OR REPLACE TRIGGER trim_chat_trigger
  AFTER INSERT ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION trim_chat();

-- ─────────────────────────────────────────────────────────────────────────
-- ЗАЯВКИ НА ТРЕКИ (джукбокс)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS track_requests (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nick       TEXT NOT NULL DEFAULT 'Анон',
  track_id   INTEGER NOT NULL REFERENCES tracks(id),
  comment    TEXT DEFAULT '',
  votes      INTEGER NOT NULL DEFAULT 1,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','playing','played')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Голоса (1 голос на voter_id)
CREATE TABLE IF NOT EXISTS request_votes (
  request_id UUID NOT NULL REFERENCES track_requests(id) ON DELETE CASCADE,
  voter_id   TEXT NOT NULL, -- anonymous browser fingerprint
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (request_id, voter_id)
);

-- ─────────────────────────────────────────────────────────────────────────
-- DJ СЛОТЫ (заявки на выступление + расписание)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dj_slots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dj_user     UUID REFERENCES profiles(id),
  dj_name     TEXT NOT NULL,
  slot_date   DATE NOT NULL,           -- дата выступления
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  genre       TEXT DEFAULT '',
  description TEXT DEFAULT '',         -- описание сета
  contact     TEXT DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_note  TEXT DEFAULT '',         -- комментарий модератора
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────
-- RLS (Row Level Security)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE tracks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE radio_state     ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_votes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE dj_slots        ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;

-- tracks: all read
CREATE POLICY "tracks_select" ON tracks FOR SELECT USING (true);

-- radio_state: all read, write only via RPC
CREATE POLICY "radio_state_select" ON radio_state FOR SELECT USING (true);

-- chat_messages: all read, all insert (rate limit via function), delete = admin
CREATE POLICY "chat_select" ON chat_messages FOR SELECT USING (true);
CREATE POLICY "chat_insert" ON chat_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "chat_delete" ON chat_messages FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- track_requests: all read/insert, delete = admin
CREATE POLICY "req_select" ON track_requests FOR SELECT USING (true);
CREATE POLICY "req_insert" ON track_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "req_delete" ON track_requests FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin')));
CREATE POLICY "req_update_admin" ON track_requests FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- request_votes: all read/insert
CREATE POLICY "votes_select" ON request_votes FOR SELECT USING (true);
CREATE POLICY "votes_insert" ON request_votes FOR INSERT WITH CHECK (true);

-- dj_slots: all read approved; own pending; admin all
CREATE POLICY "slots_select_approved" ON dj_slots FOR SELECT
  USING (status = 'approved' OR dj_user = auth.uid()
         OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "slots_insert" ON dj_slots FOR INSERT WITH CHECK (true);
CREATE POLICY "slots_update_admin" ON dj_slots FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "slots_delete_admin" ON dj_slots FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- profiles: own read; admin read all
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
  USING (id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "profiles_update_admin" ON profiles FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ─────────────────────────────────────────────────────────────────────────
-- RPC ФУНКЦИИ
-- ─────────────────────────────────────────────────────────────────────────

-- Добавить голос (идемпотентно)
CREATE OR REPLACE FUNCTION vote_request(req_id UUID, voter TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO request_votes (request_id, voter_id) VALUES (req_id, voter)
  ON CONFLICT DO NOTHING;
  IF FOUND THEN
    UPDATE track_requests SET votes = votes + 1 WHERE id = req_id;
  END IF;
END;
$$;

-- Вспомогательная функция: активный DJ-слот прямо сейчас
CREATE OR REPLACE FUNCTION active_dj_slot()
RETURNS dj_slots LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  slot dj_slots;
BEGIN
  SELECT * INTO slot FROM dj_slots
  WHERE status = 'approved'
    AND slot_date = CURRENT_DATE
    AND start_time <= CURRENT_TIME
    AND end_time   >= CURRENT_TIME
  ORDER BY start_time LIMIT 1;
  RETURN slot;
END;
$$;

-- Джукбокс: переключить на следующую заявку (если нет активного DJ-слота)
CREATE OR REPLACE FUNCTION advance_if_due()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  rs          radio_state;
  trk         tracks;
  req         track_requests;
  slot        dj_slots;
  new_track   INTEGER;
  due_time    FLOAT;
BEGIN
  -- Блокируем строку состояния
  SELECT * INTO rs FROM radio_state WHERE id = 1 FOR UPDATE;

  -- Проверяем активный DJ-слот
  SELECT * INTO slot FROM dj_slots
  WHERE status = 'approved'
    AND slot_date = CURRENT_DATE
    AND start_time <= CURRENT_TIME
    AND end_time   >= CURRENT_TIME
  ORDER BY start_time LIMIT 1;

  IF slot IS NOT NULL THEN
    RETURN jsonb_build_object('mode','dj','slot_id',slot.id,'dj',slot.dj_name);
  END IF;

  -- Режим джукбокса
  SELECT duration INTO trk FROM tracks WHERE id = rs.current_track_id;
  due_time := EXTRACT(EPOCH FROM (NOW() - rs.started_at)) + rs.position_base;

  IF rs.is_playing AND trk IS NOT NULL AND due_time < trk.duration - 2 THEN
    RETURN jsonb_build_object('mode','jukebox','status','still_playing','pos',due_time);
  END IF;

  -- Берём топ-заявку
  SELECT * INTO req FROM track_requests
  WHERE status = 'pending'
  ORDER BY votes DESC, created_at ASC
  LIMIT 1;

  IF req IS NOT NULL THEN
    new_track := req.track_id;
    UPDATE track_requests SET status = 'played' WHERE id = req.id;
  ELSE
    -- Случайный трек из каталога
    SELECT id INTO new_track FROM tracks ORDER BY RANDOM() LIMIT 1;
  END IF;

  UPDATE radio_state SET
    current_track_id = new_track,
    is_playing       = TRUE,
    started_at       = NOW(),
    position_base    = 0,
    controller       = 'jukebox',
    controller_dj    = NULL,
    updated_at       = NOW()
  WHERE id = 1;

  RETURN jsonb_build_object('mode','jukebox','status','advanced','track_id',new_track);
END;
$$;

-- DJ устанавливает трек (только во время своего одобренного слота)
CREATE OR REPLACE FUNCTION dj_set_track(track_id_in INTEGER, from_position FLOAT DEFAULT 0)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  slot  dj_slots;
  prof  profiles;
BEGIN
  SELECT * INTO prof FROM profiles WHERE id = auth.uid();
  IF prof IS NULL OR prof.role NOT IN ('dj','admin') THEN
    RETURN jsonb_build_object('error','not_authorized');
  END IF;

  SELECT * INTO slot FROM dj_slots
  WHERE status = 'approved'
    AND slot_date = CURRENT_DATE
    AND start_time <= CURRENT_TIME
    AND end_time   >= CURRENT_TIME
    AND (dj_user = auth.uid() OR prof.role = 'admin')
  ORDER BY start_time LIMIT 1;

  IF slot IS NULL AND prof.role != 'admin' THEN
    RETURN jsonb_build_object('error','no_active_slot');
  END IF;

  UPDATE radio_state SET
    current_track_id = track_id_in,
    is_playing       = TRUE,
    started_at       = NOW(),
    position_base    = from_position,
    controller       = 'dj',
    controller_dj    = auth.uid(),
    dj_last_action   = NOW(),
    updated_at       = NOW()
  WHERE id = 1;

  RETURN jsonb_build_object('ok',TRUE,'track_id',track_id_in);
END;
$$;

-- DJ пауза/стоп
CREATE OR REPLACE FUNCTION dj_toggle_play(playing BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  slot  dj_slots;
  prof  profiles;
  rs    radio_state;
  cur_pos FLOAT;
BEGIN
  SELECT * INTO prof FROM profiles WHERE id = auth.uid();
  IF prof IS NULL OR prof.role NOT IN ('dj','admin') THEN
    RETURN jsonb_build_object('error','not_authorized');
  END IF;

  SELECT * INTO slot FROM dj_slots
  WHERE status = 'approved'
    AND slot_date = CURRENT_DATE
    AND start_time <= CURRENT_TIME
    AND end_time   >= CURRENT_TIME
    AND (dj_user = auth.uid() OR prof.role = 'admin')
  ORDER BY start_time LIMIT 1;

  IF slot IS NULL AND prof.role != 'admin' THEN
    RETURN jsonb_build_object('error','no_active_slot');
  END IF;

  SELECT * INTO rs FROM radio_state WHERE id = 1;
  cur_pos := EXTRACT(EPOCH FROM (NOW() - rs.started_at)) + rs.position_base;

  UPDATE radio_state SET
    is_playing     = playing,
    position_base  = cur_pos,
    started_at     = NOW(),
    controller     = 'dj',
    controller_dj  = auth.uid(),
    dj_last_action = NOW(),
    updated_at     = NOW()
  WHERE id = 1;

  RETURN jsonb_build_object('ok',TRUE,'playing',playing);
END;
$$;

-- Подача заявки DJ на выступление (любой аноним тоже может)
CREATE OR REPLACE FUNCTION submit_dj_application(
  dj_name_in    TEXT,
  slot_date_in  DATE,
  start_time_in TIME,
  end_time_in   TIME,
  genre_in      TEXT DEFAULT '',
  description_in TEXT DEFAULT '',
  contact_in    TEXT DEFAULT ''
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO dj_slots (dj_user, dj_name, slot_date, start_time, end_time, genre, description, contact)
  VALUES (auth.uid(), dj_name_in, slot_date_in, start_time_in, end_time_in, genre_in, description_in, contact_in)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

-- Одобрить/отклонить заявку DJ (только admin)
CREATE OR REPLACE FUNCTION admin_review_slot(slot_id UUID, approve BOOLEAN, note TEXT DEFAULT '')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  prof profiles;
BEGIN
  SELECT * INTO prof FROM profiles WHERE id = auth.uid();
  IF prof IS NULL OR prof.role != 'admin' THEN
    RETURN jsonb_build_object('error','not_authorized');
  END IF;

  UPDATE dj_slots SET
    status     = CASE WHEN approve THEN 'approved' ELSE 'rejected' END,
    admin_note = note,
    updated_at = NOW()
  WHERE id = slot_id;

  RETURN jsonb_build_object('ok',TRUE,'status', CASE WHEN approve THEN 'approved' ELSE 'rejected' END);
END;
$$;

-- Очистить очередь заявок (только admin)
CREATE OR REPLACE FUNCTION admin_clear_queue()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  SELECT * FROM profiles WHERE id = auth.uid() AND role = 'admin';
  IF NOT FOUND THEN RAISE EXCEPTION 'not_authorized'; END IF;
  UPDATE track_requests SET status = 'played' WHERE status = 'pending';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- REALTIME
-- ─────────────────────────────────────────────────────────────────────────
-- Включи Realtime в Supabase Dashboard → Database → Replication для таблиц:
--   radio_state, chat_messages, track_requests, dj_slots
-- Или выполни:
ALTER PUBLICATION supabase_realtime ADD TABLE radio_state;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE track_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE dj_slots;

-- ─────────────────────────────────────────────────────────────────────────
-- ИНДЕКСЫ
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_track_requests_status  ON track_requests(status, votes DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_dj_slots_schedule      ON dj_slots(slot_date, start_time, status);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created  ON chat_messages(created_at DESC);
