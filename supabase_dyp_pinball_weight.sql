-- 🎱 DYP: Gewicht aller Flipper zusammen bei der Geräteverteilung (jedes Nicht-Flipper-Gerät = 1)
-- Beispiel Kicker / Arcade / Switch / Flipper = 1-1-1-3
alter table tournaments add column if not exists dyp_pinball_weight integer not null default 3;
