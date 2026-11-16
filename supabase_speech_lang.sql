-- 🔊 Sprache der Sprachausgabe pro Turnier ("en" = Englisch, Standard | "de" = Deutsch)
-- Additiv und rückwärtskompatibel: alle bestehenden Turniere bekommen "en" (wie bisher).
alter table public.tournaments
  add column if not exists speech_lang text not null default 'en';

alter table public.tournaments
  drop constraint if exists tournaments_speech_lang_check;
alter table public.tournaments
  add constraint tournaments_speech_lang_check check (speech_lang in ('en', 'de'));
