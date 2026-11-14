-- ⚙️ Einstellungen der App (z. B. Stellschrauben der KI-Bots aus dem Bot-Labor)
-- Neue, eigene Tabelle – bestehende Tabellen und Daten bleiben unverändert.
-- Solange hier nichts gespeichert ist, nutzt die App ihre eingebauten Standardwerte.
-- Kann gefahrlos mehrfach ausgeführt werden (if not exists).

create table if not exists public.app_settings (
  key text primary key,            -- z. B. 'bot_settings'
  value jsonb not null,            -- die Werte
  updated_at timestamptz not null default now()
);

-- 🔒 Zugriff nur über die App-Server (Service-Role umgeht RLS); direkter Zugriff
-- mit dem öffentlichen Schlüssel ist damit gesperrt (keine Policies = kein Zugriff).
alter table public.app_settings enable row level security;
