// 📜 Ticker-Reihenfolge je Match (nur Anzeige, die Datenbank bleibt unverändert).
//
// Zu einem Match melden drei Wächter getrennt (je 10 s Tippfehler-Schutz, aber nicht im selben Takt):
// 🏁 Ergebnis, 🎉 Matchsieg-Meilenstein / 🌟 Premieren-Sieg, 🧊 📸 💣 🔄 Match-Momente.
// Wer zuerst eingetragen wird, ist Zufall. Hier werden Meldungen zum SELBEN Match, die kurz hintereinander
// kamen, in die logische Reihenfolge gebracht: zuerst Ergebnis, dann Sieg, dann Moment.
// Der Ticker zeigt neueste oben → oben steht der Moment, darunter der Sieg, ganz unten das Ergebnis.
// "Runde abgeschlossen" rückt über Match-Meldungen, die kurz davor/danach kamen.
// Andere Meldungen bleiben genau an ihrem Platz.

/** Rang = zeitliche Reihenfolge innerhalb eines Matches (klein = früher) */
const RANK: Record<string, number> = {
  matchShort: 0,
  wins: 1,
  premiereWin: 1,
  upset: 2,
  photo: 2,
  blowout: 2,
  revenge: 2,
};

/** Meldungen desselben Matches gelten als zusammengehörig, wenn sie höchstens so weit auseinander liegen */
const CLUSTER_MS = 60_000;

type TickerLike = { key: string; kind: string; at: string };

/** Match-Kennung aus der Meldungs-Kennung ("matchShort|<id>", "wins|<id>|…", "upset|<id>" …) */
function matchIdOf(x: TickerLike): string | null {
  if (!(x.kind in RANK)) return null;
  const id = String(x.key ?? "").split("|")[1];
  return id ? id : null;
}

/** Liste (neueste zuerst) → gleiche Liste, nur Meldungen je Match logisch sortiert */
export function orderTickerByMatch<T extends TickerLike>(list: readonly T[]): T[] {
  const out = list.slice();
  const groups = new Map<string, number[]>();
  list.forEach((x, i) => {
    const id = matchIdOf(x);
    if (!id) return;
    const g = groups.get(id);
    if (g) g.push(i);
    else groups.set(id, [i]);
  });
  const time = (i: number) => {
    const t = Date.parse(list[i].at);
    return Number.isFinite(t) ? t : 0;
  };
  for (const idx of Array.from(groups.values())) {
    if (idx.length < 2) continue;
    // nach Zeit ordnen und in Gruppen teilen, die kurz hintereinander kamen
    const byTime = idx.slice().sort((a, b) => time(a) - time(b) || b - a);
    const clusters: number[][] = [];
    for (const i of byTime) {
      const last = clusters[clusters.length - 1];
      if (last && time(i) - time(last[last.length - 1]) <= CLUSTER_MS) last.push(i);
      else clusters.push([i]);
    }
    for (const c of clusters) {
      if (c.length < 2) continue;
      const slots = c.slice().sort((a, b) => a - b); // Plätze in der Liste (oben = neuer)
      // höchster Rang nach oben; gleicher Rang → bisherige Reihenfolge
      const items = c.slice().sort((a, b) => RANK[list[b].kind] - RANK[list[a].kind] || a - b);
      slots.forEach((slot, k) => {
        out[slot] = list[items[k]];
      });
    }
  }
  // 🏁 "Runde abgeschlossen" kommt nach den Meldungen zum letzten Match der Runde:
  // stehen Match-Meldungen kurz davor/danach ÜBER ihr, rückt sie über diese.
  const timeOf = (x: T) => {
    const t = Date.parse(x.at);
    return Number.isFinite(t) ? t : 0;
  };
  for (let i = 1; i < out.length; i++) {
    const done = out[i];
    if (done.kind !== "roundDone") continue;
    let j = i;
    while (j > 0 && out[j - 1].kind in RANK && Math.abs(timeOf(out[j - 1]) - timeOf(done)) <= CLUSTER_MS) j--;
    if (j < i) {
      out.splice(i, 1);
      out.splice(j, 0, done);
    }
  }
  return out;
}
