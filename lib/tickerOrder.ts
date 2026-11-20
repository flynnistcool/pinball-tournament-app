// 📜 Ticker-Reihenfolge je Match (nur Anzeige, die Datenbank bleibt unverändert).
//
// Zu einem Match melden drei Wächter getrennt (je 10 s Tippfehler-Schutz, aber nicht im selben Takt):
// 🏁 Ergebnis, 🎉 Matchsieg-Meilenstein / 🌟 Premieren-Sieg, 🧊 📸 💣 🔄 Match-Momente.
// Wer zuerst eingetragen wird, ist Zufall. Hier werden Meldungen zum SELBEN Match, die kurz hintereinander
// kamen, in die logische Reihenfolge gebracht: zuerst Ergebnis, dann Sieg, dann Moment.
// Der Ticker zeigt neueste oben → oben steht der Moment, darunter der Sieg, ganz unten das Ergebnis.
// Serien/Tabellenführung (hängen am Spieler) rücken über die Match-Meldungen, "Runde abgeschlossen" über alles davon
// Score-Meldungen (Score-Form, Highscores) stehen unter "alle Scores"/"geschafft"/"startet" (10 s Tippfehler-Schutz).
// "Runde generiert"/"Los geht's!" rutscht unter die Ankündigungen der neuen Runde (Premiere, Gegner-Hinweis, Messers Schneide).
// (jeweils nur, wenn sie höchstens 60 s auseinander liegen).
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
  // ⚖️ Auf Messers Schneide – entschieden (closeMatch|<id>|result; die Ankündigung vor dem Match liegt zeitlich weit davor)
  closeMatch: 2,
};

/** Folgen eines Ergebnisses, die am Spieler hängen (ohne Match-Kennung) – stehen über den Match-Meldungen */
const AFTER_MATCH = ["streak", "streakEnd", "unbeaten", "unbeatenEnd", "leader"];

/** Meldungen zu einem einzelnen Score (10 s Tippfehler-Schutz → kommen oft erst NACH dem Runden-/Durchgangs-Abschluss) */
// + 📈 Elo-Marke: Folge der Ergebnisse – steht unter dem Runden-/Durchgangs-Abschluss
const SCORE_KINDS = ["scoreForm", "record", "month", "personal", "eloMark"];

/** Ankündigungen einer neuen Runde – stehen über "Runde generiert" / "Los geht's!" */
const PRE_MATCH = ["premiere", "rivalryInsight", "closeMatch"];

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
  const timeOf = (x: T) => {
    const t = Date.parse(x.at);
    return Number.isFinite(t) ? t : 0;
  };
  /** Meldung an Platz i über die direkt darüberstehenden Meldungen der Arten `past` schieben (≤ CLUSTER_MS) */
  const liftOver = (kind: string | ((x: T) => boolean), past: (k: string) => boolean) => {
    for (let i = 1; i < out.length; i++) {
      const x = out[i];
      if (typeof kind === "string" ? x.kind !== kind : !kind(x)) continue;
      let j = i;
      while (j > 0 && past(out[j - 1].kind) && Math.abs(timeOf(out[j - 1]) - timeOf(x)) <= CLUSTER_MS) j--;
      if (j < i) {
        out.splice(i, 1);
        out.splice(j, 0, x);
      }
    }
  };
  // 🔥 Folgen eines Ergebnisses (Serie, Tabellenführung …) hängen am Spieler, nicht am Match:
  // sie kommen nach den Meldungen zum Match → über diese rücken
  for (const k of AFTER_MATCH) liftOver(k, (o) => o in RANK);
  const isScore = (o: string) => SCORE_KINDS.includes(o);
  // 🎱 Round the Pinball: "Durchgang X: alle Scores" kommt nach den Meldungen zu den einzelnen Scores
  liftOver("waveShort", isScore);
  // 🏁 "Runde abgeschlossen" / "Durchgang geschafft" kommt nach allem zum letzten Match/Score der Runde
  liftOver("roundDone", (o) => o in RANK || AFTER_MATCH.includes(o) || isScore(o) || o === "waveShort");
  // 🔵 "Durchgang startet" / "Runde generiert" kommt nach dem Abschluss der vorigen Runde samt ihrer Meldungen
  liftOver("roundStart", (o) => o in RANK || AFTER_MATCH.includes(o) || isScore(o) || o === "waveShort" || o === "roundDone");
  // 🎬 "Runde generiert" / "Los geht's!" / "Durchgang startet" kommt VOR den Ankündigungen der neuen Runde
  //    (🌟 Flipper-Premiere, ⚔️ Gegner-Hinweis, ⚖️ Auf Messers Schneide) → unter diese rutschen
  const isAnnouncement = (x: T) =>
    PRE_MATCH.includes(x.kind) && !(x.kind === "closeMatch" && String(x.key ?? "").endsWith("|result"));
  /** Meldungen, auf die `which` zutrifft, unter die direkt darunterstehenden Meldungen der Arten `past` schieben */
  const sinkUnder = (which: (x: T) => boolean, past: (x: T) => boolean) => {
    for (let i = out.length - 2; i >= 0; i--) {
      const x = out[i];
      if (!which(x)) continue;
      let j = i;
      while (j + 1 < out.length && past(out[j + 1]) && Math.abs(timeOf(out[j + 1]) - timeOf(x)) <= CLUSTER_MS) j++;
      if (j > i) {
        out.splice(i, 1);
        out.splice(j, 0, x);
      }
    }
  };
  // 🌟 Ankündigungen der NEUEN Runde/des neuen Durchgangs (Premiere "spielt gleich", Gegner-Hinweis, Messers Schneide)
  //    werden schon beim letzten Score verschickt – "geschafft"/"alle Scores" kommen absichtlich ~12 s später.
  //    Logisch stehen sie über allem, was zur vorigen Runde gehört, und über "startet".
  liftOver(
    isAnnouncement,
    (o) => (o in RANK && o !== "closeMatch") || AFTER_MATCH.includes(o) || isScore(o) || o === "waveShort" || o === "roundDone" || o === "roundStart"
  );
  sinkUnder((x) => x.kind === "roundStart", isAnnouncement);
  // 📊 Score-Meldungen (Score-Form, Highscores) gehören zum Score davor → unter "alle Scores" / "geschafft" /
  //    "startet" / Ankündigungen der neuen Runde rutschen (sie kommen nur wegen 10 s Tippfehler-Schutz später)
  const ROUND_FLOW = ["waveShort", "roundDone", "roundStart"];
  sinkUnder(
    (x) => isScore(x.kind),
    (x) => ROUND_FLOW.includes(x.kind) || isAnnouncement(x)
  );
  return out;
}
