// 📡 Live-Ticker über den Server: aus den Turnierdaten NACHRECHNEN, was im Ticker stehen muss – reine Logik.
//
// Statt "vorher/nachher beobachten" (Admin-Seite) wird das Turnier in Spielreihenfolge nachgespielt.
// Kennungen (key) und Texte sind GLEICH wie bei der Admin-Seite (RoundSplash, RotationTurnSplash,
// RecordCelebration, FlawlessCelebration, postEndFeed) → beim Umschalten entsteht nichts doppelt.
//
// Abgedeckt (siehe serverHandlesKind in lib/notifications.ts):
//   Schritt 1 – nur Turnierdaten: 🎲 Runde generiert (inkl. "Los geht's!"), ✅ Runde abgeschlossen /
//     Durchgang geschafft (mit Rückblick), 🔥 On fire, 🧯 Serie beendet, 🛡️ Noch unbesiegt, 💔 Traum geplatzt
//     (nicht Round the Pinball), 🥋 Flawless Victory, 🏁 Turnier beendet
//   Schritt 2 – mit Zusatzdaten (FeedContext): 🏆 🥇 💪 Highscores, 🎰 Flipper-Premiere, 🎉 Matchsieg-Meilenstein,
//     🧊 Favoritensturz, 📸 Fotofinish, 💣 Kantersieg, 🔄 Revanche
//   Nicht (hängen am zeitlichen Verlauf): 👑 Tabellenführer, 📈 Elo-Meilenstein, ⚔️ Duelle → nur Admin-Seite
//
// sig = die Daten, an denen eine Meldung hängt – ändert sich sig, startet der 10-s-Tippfehler-Schutz neu.

import type { FeedItemInput } from "@/lib/feed";
import { liveLeaderboard, type MmData } from "@/lib/myMatch";
import { rotationProgress, rotationWaveMap } from "@/lib/rotationTurn";
import { roundSummary, rotationWaveSummary, summaryText } from "@/lib/roundSummary";
import { matchWinValue, streakMin, streakMode, streakText } from "@/lib/winStreaks";
import { flawlessMode, flawlessText, flawlessWinners, rotationAllDone, unbeatenStep } from "@/lib/flawless";
import { evaluateEntry, liveEntriesFrom, machineKey, personalKey, type PriorRecords } from "@/lib/recordWatch";
import { isWinMilestone } from "@/lib/winMilestones";
import { completedMatchIds, MOMENT_ICON, MOMENT_TITLE, momentData, momentMode, momentsForMatch, momentText } from "@/lib/matchMoments";

/** Zusatzdaten für Schritt 2 (vom Server geladen: lib/feedContextServer.ts) */
export type FeedContext = {
  /** bisherige Rekorde + persönliche Bestwerte + "schon gespielt" (enabled=false: keine Location / Timeplay / DYP) */
  records: (PriorRecords & { enabled: boolean }) | null;
  /** bisherige Matchsiege je Profil (andere Turniere) + ausgeschlossene Profile (Bots/Platzhalter) */
  priorWins: { wins: Record<string, number>; excluded: string[] } | null;
  /** Elo zu Turnierbeginn je Profil */
  startElo: Record<string, number> | null;
};

const fmtNum = (n: number) => n.toLocaleString("de-DE");

export type FeedCandidate = { item: FeedItemInput; sig: string };

const entered = (v: unknown) => v != null && v !== "" && Number.isFinite(Number(v));

function nameMap(data: MmData) {
  return new Map(data.players.map((p) => [String(p.id), String(p.name ?? "?")]));
}

function mpsByMatch(data: MmData) {
  const m = new Map<string, MmData["match_players"]>();
  for (const mp of data.match_players) {
    const k = String(mp.match_id);
    const list = m.get(k);
    if (list) list.push(mp);
    else m.set(k, [mp]);
  }
  return m;
}

/** Turnierdaten nur bis einschließlich dieser Runde (für den Rückblick "wie stand es damals") */
function upToRound(data: MmData, roundNo: number): MmData {
  const rounds = data.rounds.filter((r) => Number(r.number ?? 0) <= roundNo);
  const rIds = new Set(rounds.map((r) => String(r.id)));
  const matches = data.matches.filter((m) => rIds.has(String(m.round_id)));
  const mIds = new Set(matches.map((m) => String(m.id)));
  return { ...data, rounds, matches, match_players: data.match_players.filter((mp) => mIds.has(String(mp.match_id))) };
}

// ── 🎲 / ✅ Runden (Matchplay & Co.) ─────────────────────────────────────────
// done = "Runde abgeschlossen" (wird nach den Einzelmeldungen angehängt → steht im Ticker darüber)
function roundItems(data: MmData, out: FeedCandidate[], doneOut: FeedCandidate[] = out) {
  const by = mpsByMatch(data);
  const rounds = data.rounds.slice().sort((a, b) => Number(a.number ?? 0) - Number(b.number ?? 0));
  for (const r of rounds) {
    const id = String(r.id);
    const matches = data.matches.filter((m) => String(m.round_id) === id);
    if (!matches.length) continue;
    const machines = new Set(matches.map((m) => String(m.machine_id ?? ""))).size;
    out.push({
      item: {
        key: `roundStart|${id}`,
        kind: "roundStart",
        icon: "🎲",
        title: Number(r.number) === 1 ? "Los geht's! Runde 1 generiert" : `Runde ${r.number} generiert`,
        body: `${matches.length} ${matches.length === 1 ? "Match" : "Matches"} an ${machines} ${machines === 1 ? "Flipper" : "Flippern"} – viel Spaß!`,
      },
      sig: `${matches.length}`,
    });
    const done = matches.every((m) => {
      const mps = by.get(String(m.id)) ?? [];
      return mps.length > 0 && mps.every((mp) => mp.position != null && Number.isFinite(Number(mp.position)));
    });
    if (!done) continue;
    const sum = roundSummary(upToRound(data, Number(r.number ?? 0)), id);
    const sig = matches
      .map((m) => (by.get(String(m.id)) ?? []).map((mp) => `${mp.player_id}:${mp.position}`).join(","))
      .join("|");
    doneOut.push({
      item: {
        key: `roundDone|${id}`,
        kind: "roundDone",
        icon: "✅",
        title: `Runde ${r.number} abgeschlossen`,
        body: summaryText(sum) || "Alle Plätze vergeben.",
      },
      sig,
    });
  }
}

// ── 🏁 / ✅ Round the Pinball: Start + Durchgänge ────────────────────────────
function rotationItems(data: MmData, out: FeedCandidate[], done: FeedCandidate[] = out) {
  const matchIds = data.matches.map((m) => String(m.id));
  if (!matchIds.length) return;
  const mps = data.match_players as Parameters<typeof rotationProgress>[1];
  const prog = rotationProgress(matchIds, mps);
  const total = prog.total;
  if (total < 1) return;
  const machines = new Set(data.matches.map((m) => String(m.machine_id ?? m.id))).size;
  out.push({
    item: {
      key: `rotStart|${total}`,
      kind: "roundStart",
      icon: "🏁",
      title: "Los geht's!",
      body: `Round the Pinball: ${total} ${total === 1 ? "Durchgang" : "Durchgänge"}${
        machines ? ` an ${machines} ${machines === 1 ? "Flipper" : "Flippern"}` : ""
      } – viel Spaß!`,
    },
    sig: `${total}`,
  });

  const waveOf = rotationWaveMap(matchIds, mps);
  for (let w = 1; w <= total; w++) {
    const inWave = data.match_players.filter((mp) => waveOf.get(`${mp.match_id}|${mp.player_id}`) === w);
    if (!inWave.length || !inWave.every((mp) => entered(mp.score))) continue;
    // Stand damals: Scores späterer Durchgänge ausblenden
    const then: MmData = {
      ...data,
      match_players: data.match_players.map((mp) =>
        (waveOf.get(`${mp.match_id}|${mp.player_id}`) ?? 0) > w ? { ...mp, score: null, position: null } : mp
      ),
    };
    const s = rotationWaveSummary(then, w);
    done.push({
      item: {
        key: `rotWave|${w}|${total}`,
        kind: "roundDone",
        icon: "✅",
        title: `Durchgang ${w} / ${total} geschafft`,
        body: summaryText(s, true) || "Alle Scores des Durchgangs sind da.",
      },
      sig: inWave.map((mp) => `${mp.match_id}:${mp.player_id}:${mp.score}`).join(","),
    });
  }
}

// ── 🔥 🧯 🛡️ 💔 Serien + Unbesiegt (Matchplay & Co.) – in Spielreihenfolge nachspielen ──
function streakItems(data: MmData, out: FeedCandidate[]) {
  const format = data.tournament.format;
  const sMode = streakMode(format);
  const fMode = flawlessMode(format);
  if (sMode !== "wins" && fMode !== "wins") return;
  const min = streakMin("wins");
  const step = unbeatenStep("wins");
  const nm = nameMap(data);
  const by = mpsByMatch(data);
  const roundNo = new Map(data.rounds.map((r) => [String(r.id), Number(r.number ?? 0)]));
  const order = new Map(data.matches.map((m, i) => [String(m.id), i]));
  const sorted = data.matches
    .slice()
    .sort(
      (a, b) =>
        (roundNo.get(String(a.round_id)) ?? 0) - (roundNo.get(String(b.round_id)) ?? 0) ||
        (order.get(String(a.id)) ?? 0) - (order.get(String(b.id)) ?? 0)
    );

  const streak = new Map<string, number>();
  const runStart = new Map<string, string>();
  const run = new Map<string, { played: number; beaten: number; allWon: boolean }>();

  for (const m of sorted) {
    const mid = String(m.id);
    const mps = by.get(mid) ?? [];
    if (mps.length < 2 || !mps.every((x) => Number(x.position) > 0)) continue; // noch nicht fertig
    const gain = matchWinValue(mps);
    const winners = mps.filter((x) => Number(x.position) === 1).map((x) => String(x.player_id));
    const sig = mps.map((x) => `${x.player_id}:${x.position}`).join(",");
    for (const mp of mps) {
      const pid = String(mp.player_id);
      const won = Number(mp.position) === 1;
      const oldStreak = streak.get(pid) ?? 0;
      const oldRun = run.get(pid) ?? { played: 0, beaten: 0, allWon: true };
      const newRun = {
        played: oldRun.played + 1,
        beaten: oldRun.beaten + (won ? gain : 0),
        allWon: oldRun.allWon && won,
      };
      run.set(pid, newRun);
      const wasUnbeaten = fMode === "wins" && oldRun.allWon && oldRun.beaten >= step;
      let unbeatenKey: string | null = null;

      if (fMode === "wins") {
        if (wasUnbeaten && !newRun.allWon) {
          // 💔 erste Niederlage nach makelloser Strecke (ersetzt "Serie beendet")
          const breakers = winners.filter((x) => x !== pid);
          if (breakers.length) {
            const breakerName = breakers.map((b) => nm.get(b) ?? "?").join(" & ");
            out.push({
              item: {
                key: `unbeatenEnd|${pid}|${mid}`,
                kind: "unbeatenEnd",
                icon: "💔",
                title: "Traum geplatzt",
                body: `${breakerName} stoppt ${nm.get(pid) ?? "?"} nach ${oldRun.beaten} Siegen – der Traum von der Flawless Victory ist geplatzt`,
                players: breakers,
                data: { player: breakerName, victim: nm.get(pid) ?? "?", n: oldRun.beaten, mode: "wins", machine: null },
              },
              sig,
            });
          }
        } else if (newRun.allWon && newRun.beaten >= step && Math.floor(newRun.beaten / step) > Math.floor(oldRun.beaten / step)) {
          // 🛡️ neue Stufe (4, 8, 12 … Siege) ohne Niederlage
          const level = Math.floor(newRun.beaten / step) * step;
          unbeatenKey = `${pid}|${level}`;
          out.push({
            item: {
              key: `unbeaten|${unbeatenKey}`,
              kind: "unbeaten",
              icon: "🛡️",
              title: "Noch unbesiegt",
              body: `${nm.get(pid) ?? "?"}: ${newRun.beaten} Siege ohne Niederlage (${newRun.played} Matches) – schafft er die Flawless Victory oder wird er noch gestoppt?`,
              players: [pid],
              data: { player: nm.get(pid) ?? "?", n: newRun.beaten, matches: newRun.played, mode: "wins" },
            },
            sig,
          });
        }
      }

      if (sMode !== "wins") continue;
      if (won) {
        const n = oldStreak + gain;
        streak.set(pid, n);
        if (oldStreak === 0) runStart.set(pid, mid);
        // 🔥 jede neue Stufe ab 3 – außer sie wurde gerade als "Noch unbesiegt" gemeldet
        if (n >= min && unbeatenKey !== `${pid}|${n}`) {
          out.push({
            item: {
              key: `streak|${pid}|${runStart.get(pid) ?? mid}|${n}`,
              kind: "streak",
              icon: "🔥",
              title: "On fire!",
              body: `${nm.get(pid) ?? "?"}: ${streakText("wins", n)} im Turnier`,
              players: [pid],
              data: { player: nm.get(pid) ?? "?", n, mode: "wins" },
            },
            sig,
          });
        }
      } else {
        streak.set(pid, 0);
        runStart.delete(pid);
        // 🧯 Serie ab 3 beendet (nicht zusätzlich, wenn schon "Traum geplatzt")
        if (oldStreak >= min && !(wasUnbeaten && !newRun.allWon)) {
          const breakers = winners.filter((x) => x !== pid);
          if (breakers.length) {
            const breakerName = breakers.map((b) => nm.get(b) ?? "?").join(" & ");
            out.push({
              item: {
                key: `streakEnd|${pid}|${mid}`,
                kind: "streakEnd",
                icon: "🧯",
                title: "Serie beendet",
                body: `${breakerName} beendet die Siegesserie von ${nm.get(pid) ?? "?"} (${oldStreak} Siege in Folge)`,
                players: breakers,
                data: { player: breakerName, victim: nm.get(pid) ?? "?", n: oldStreak },
              },
              sig,
            });
          }
        }
      }
    }
  }
}

// ── 🏁 Turnierende + 🥋 Flawless Victory ─────────────────────────────────────
function endItems(data: MmData, out: FeedCandidate[]) {
  const finished = data.tournament.status === "finished";
  if (finished) {
    try {
      const rows = liveLeaderboard(data).rows;
      const medal = ["🏆", "🥈", "🥉"];
      const top = rows.filter((r) => r.place <= 3).slice(0, 5);
      out.push({
        item: {
          key: "tournamentEnd",
          kind: "tournamentEnd",
          icon: "🏁",
          title: "Turnier beendet",
          body: top.map((r) => `${medal[r.place - 1] ?? ""} ${r.name}`).join(" · ") || "Danke fürs Mitspielen!",
          players: top.map((r) => r.id),
        },
        sig: "finished",
      });
    } catch {
      /* unvollständige Daten → beim nächsten Mal */
    }
  }
  const mode = flawlessMode(data.tournament.format);
  if (mode === "none") return;
  const ended = finished || (mode === "leads" && rotationAllDone(data));
  if (!ended) return;
  const nm = nameMap(data);
  // zuletzt anhängen → steht als Abschluss ganz oben im Ticker
  for (const w of flawlessWinners(data, mode)) {
    const name = nm.get(w.playerId) ?? "?";
    out.push({
      item: {
        key: `flawless|${w.playerId}`,
        kind: "flawless",
        icon: "🥋",
        title: "Flawless Victory",
        body: `${name} – ${flawlessText(mode, w.run)} – kein einziges Duell verloren`,
        players: [w.playerId],
        data: { player: name, n: w.run.played, beaten: w.run.beaten, mode },
      },
      sig: `${w.run.played}|${w.run.beaten}`,
    });
  }
}

// ── Schritt 2: Highscores, Premiere, Matchsieg-Meilensteine, Match-Momente ──

/** Matches in Spielreihenfolge (Rundennummer, dann Reihenfolge der Daten) */
function sortedMatches(data: MmData) {
  const roundNo = new Map(data.rounds.map((r) => [String(r.id), Number(r.number ?? 0)]));
  const order = new Map(data.matches.map((m, i) => [String(m.id), i]));
  return data.matches
    .slice()
    .sort(
      (a, b) =>
        (roundNo.get(String(a.round_id)) ?? 0) - (roundNo.get(String(b.round_id)) ?? 0) ||
        (order.get(String(a.id)) ?? 0) - (order.get(String(b.id)) ?? 0)
    );
}

/** 🏆 🥇 💪 Highscores – gleiche Bewertung wie die Geräte (lib/recordWatch evaluateEntry) */
function recordItems(data: MmData, ctx: FeedContext, out: FeedCandidate[]) {
  const pr = ctx.records;
  if (!pr || !pr.enabled) return;
  const entries = liveEntriesFrom(data);
  const meta = {
    record: { icon: "🏆", title: "Allzeit-Highscore!" },
    month: { icon: "🥇", title: "30-Tage-Highscore" },
    personal: { icon: "💪", title: "Persönlicher Highscore" },
  } as const;
  for (const e of entries) {
    const c = evaluateEntry(e, pr, entries);
    if (!c) continue;
    const pid = String(e.key).split("|").pop() ?? "";
    out.push({
      item: {
        key: `${c.kind}|${e.key}|${e.score}`,
        kind: c.kind,
        icon: meta[c.kind].icon,
        title: meta[c.kind].title,
        body: `${e.playerName} an ${e.machineName ?? "?"} – ${fmtNum(e.score)}`,
        players: [pid],
        data: { player: e.playerName, machine: e.machineName ?? "?", score: e.score },
      },
      sig: `${e.score}`,
    });
  }
}

/** 🎰 Flipper-Premiere: erstes Spiel eines Profils an einem Flipper (Location: alle Turniere dort + dieses) */
function premiereItems(data: MmData, ctx: FeedContext, out: FeedCandidate[]) {
  const pr = ctx.records;
  if (!pr || !pr.enabled) return;
  const excluded = new Set(pr.excludedProfiles ?? []);
  const played = new Set(pr.played ?? []);
  const nm = nameMap(data);
  const profOf = new Map(data.players.map((p) => [String(p.id), p.profile_id ? String(p.profile_id) : null]));
  const machineName = new Map(data.machines.map((m) => [String(m.id), m.name ?? null]));
  const by = mpsByMatch(data);
  const seen = new Set<string>(); // in diesem Turnier schon gespielt (Profil|Flipper)
  for (const m of sortedMatches(data)) {
    const mid = String(m.id);
    const mName = machineName.get(String(m.machine_id ?? "")) ?? null;
    const mk = machineKey(mName);
    if (!mk) continue;
    for (const mp of by.get(mid) ?? []) {
      const hasScore = entered(mp.score);
      if (!hasScore && mp.position == null) continue; // noch nicht gespielt
      const pid = String(mp.player_id);
      const prof = profOf.get(pid);
      if (!prof) continue;
      const pk = personalKey(prof, mk);
      if (seen.has(pk)) continue;
      seen.add(pk);
      if (pk in pr.personal || played.has(pk) || excluded.has(prof)) continue;
      const score = hasScore ? Number(mp.score) : null;
      out.push({
        item: {
          key: `premiere|${mid}|${pid}`,
          kind: "premiere",
          icon: "🎰",
          title: "Flipper-Premiere",
          body:
            score != null
              ? `${nm.get(pid) ?? "?"} spielt zum ersten Mal ${mName ?? "?"} – Einstand mit ${fmtNum(score)} Punkten!`
              : `${nm.get(pid) ?? "?"} spielt zum ersten Mal ${mName ?? "?"}!`,
          players: [pid],
          data: { player: nm.get(pid) ?? "?", machine: mName ?? "?", score },
        },
        sig: `${mp.score ?? ""}:${mp.position ?? ""}`,
      });
    }
  }
}

/** 🎉 Matchsieg-Meilensteine (1, 10, 25, 50, 100 …): bisherige Siege + Siege in diesem Turnier */
function winItems(data: MmData, ctx: FeedContext, out: FeedCandidate[]) {
  const pw = ctx.priorWins;
  if (!pw) return;
  const excluded = new Set(pw.excluded);
  const nm = nameMap(data);
  const profOf = new Map(data.players.map((p) => [String(p.id), p.profile_id ? String(p.profile_id) : null]));
  const by = mpsByMatch(data);
  const live = new Map<string, number>();
  for (const m of sortedMatches(data)) {
    const mid = String(m.id);
    for (const mp of by.get(mid) ?? []) {
      if (Number(mp.position) !== 1) continue;
      const pid = String(mp.player_id);
      const prof = profOf.get(pid);
      if (!prof || excluded.has(prof)) continue;
      const cnt = (live.get(prof) ?? 0) + 1;
      live.set(prof, cnt);
      const n = (pw.wins[prof] ?? 0) + cnt;
      if (!isWinMilestone(n)) continue;
      out.push({
        item: {
          key: `wins|${mid}|${pid}|${n}`,
          kind: "wins",
          icon: "🎉",
          title: `${n}. Matchsieg`,
          body: `${nm.get(pid) ?? "?"} feiert den ${n}. Matchsieg`,
          players: [pid],
          data: { player: nm.get(pid) ?? "?", n },
        },
        sig: (by.get(mid) ?? []).map((x) => `${x.player_id}:${x.position}`).join(","),
      });
    }
  }
}

/** 🧊 📸 💣 🔄 Match-Momente – gleiche Rechnung wie die Geräte (lib/matchMoments) */
function momentItems(data: MmData, ctx: FeedContext, out: FeedCandidate[]) {
  const mode = momentMode(data.tournament.format);
  if (mode === "none") return;
  const nm = nameMap(data);
  const eloStart: Record<string, number | null> = {};
  for (const p of data.players) {
    const e = p.profile_id ? ctx.startElo?.[String(p.profile_id)] : undefined;
    eloStart[String(p.id)] = typeof e === "number" ? e : null;
  }
  const by = mpsByMatch(data);
  for (const id of completedMatchIds(data, mode)) {
    for (const m of momentsForMatch(data, id, mode, eloStart)) {
      const winnerName = nm.get(m.winnerId) ?? "?";
      const loserName = nm.get(m.loserId) ?? "?";
      out.push({
        item: {
          key: `${m.kind}|${id}`,
          kind: m.kind,
          icon: MOMENT_ICON[m.kind],
          title: MOMENT_TITLE[m.kind],
          body: momentText(m, winnerName, loserName),
          players: [m.winnerId],
          data: { player: winnerName, other: loserName, ...momentData(m) },
        },
        sig: (by.get(id) ?? []).map((x) => `${x.player_id}:${x.position}:${x.score}`).join(","),
      });
    }
  }
}

/** Alle Meldungen, die nach dem aktuellen Stand im Ticker stehen müssten (Reihenfolge = Eintragsreihenfolge) */
export function feedCandidates(data: MmData, ctx?: FeedContext | null): FeedCandidate[] {
  const out: FeedCandidate[] = [];
  const done: FeedCandidate[] = []; // Runde abgeschlossen / Durchgang geschafft – nach den Einzelmeldungen
  const rotation = String(data.tournament.format ?? "") === "rotation";
  if (rotation) rotationItems(data, out, done);
  else roundItems(data, out, done);
  if (!rotation) streakItems(data, out);
  if (ctx) {
    premiereItems(data, ctx, out);
    recordItems(data, ctx, out);
    winItems(data, ctx, out);
    momentItems(data, ctx, out);
  }
  out.push(...done);
  endItems(data, out);
  return out;
}

/** kleiner, schneller Fingerabdruck des Turnierstands (gleich = nichts geändert) */
export function feedFingerprint(data: MmData): string {
  const parts: string[] = [String(data.tournament.status ?? ""), String(data.tournament.format ?? "")];
  for (const r of data.rounds) parts.push(`${r.id}:${r.status ?? ""}`);
  for (const mp of data.match_players) parts.push(`${mp.match_id}:${mp.player_id}:${mp.position ?? ""}:${mp.score ?? ""}`);
  let h = 5381;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${h >>> 0}`;
}
