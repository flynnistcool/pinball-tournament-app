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
//     🧊 Favoritensturz, 📸 Fotofinish, 💣 Kantersieg, 🔄 Revanche, 📊 Score-Form (Score vs. eigener Schnitt)
//   Nicht (hängen am zeitlichen Verlauf): 👑 Tabellenführer, 📈 Elo-Meilenstein, ⚔️ Duelle → nur Admin-Seite
//
// sig = die Daten, an denen eine Meldung hängt – ändert sich sig, startet der 10-s-Tippfehler-Schutz neu.

import type { FeedItemInput } from "@/lib/feed";
import { liveLeaderboard, type MmData } from "@/lib/myMatch";
import { rotationProgress, rotationWaveMap } from "@/lib/rotationTurn";
import { roundSummary, rotationWaveSummary, summaryText } from "@/lib/roundSummary";
import { matchWinValue, streakMin, streakMode, streakText } from "@/lib/winStreaks";
import { flawlessMode, flawlessText, flawlessWinners, rotationAllDone, unbeatenStep } from "@/lib/flawless";
import { evaluateEntry, liveEntriesFrom, machineKey, personalKey, type LiveEntry, type PriorRecords } from "@/lib/recordWatch";
import { scoreForm, scoreFormFeedItem } from "@/lib/scoreForm";
import { isWinMilestone } from "@/lib/winMilestones";
import { premiereSlots, slotKey } from "@/lib/premiere";
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

/** age = Runde (bzw. bei Round the Pinball: Durchgang), aus der das Ereignis stammt – der Server trägt
 *  nur Ereignisse der aktuellen und der vorherigen Runde nach (ältere sind nicht mehr aktuell) */
export type FeedCandidate = { item: FeedItemInput; sig: string; age?: number };

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
    const rno = roundNo.get(String(m.round_id)) ?? 0;
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
            age: rno,
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
            age: rno,
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
            age: rno,
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
            age: rno,
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
        body: `${e.playerName} an ${e.machineName ?? "?"} – ${fmtNum(e.score)}` + formSuffixFor(e, pr),
        players: [pid],
        data: { player: e.playerName, machine: e.machineName ?? "?", score: e.score },
      },
      sig: `${e.score}`,
    });
  }
}

/** 📊 Score-Form-Satz zu einem Score (gleiche Rechnung wie die Geräte, lib/scoreForm.ts) */
function formFor(e: LiveEntry, pr: PriorRecords) {
  const a = e.profileId ? pr.personalAvg?.[personalKey(e.profileId, e.machineKey)] : null;
  const form = a ? scoreForm(e.score, a.avg, a.n, `${e.key}|${e.score}`) : null;
  return form && a ? { form, a } : null;
}
function formSuffixFor(e: LiveEntry, pr: PriorRecords): string {
  const f = formFor(e, pr);
  return f ? ` · ${f.form.line}` : "";
}

/** 📊 Score-Form (Turnier-Shortnews): jeder Score im Vergleich zum eigenen Schnitt – außer bei neuem Highscore
 *  (dort hängt der Satz an der Highscore-Meldung). Gleiche Kennung wie components/ScoreFormWatcher.tsx. */
function scoreFormItems(data: MmData, ctx: FeedContext, out: FeedCandidate[]) {
  const pr = ctx.records;
  if (!pr || !pr.enabled) return;
  const excluded = new Set(pr.excludedProfiles ?? []);
  const entries = liveEntriesFrom(data);
  const machineOfMatch = new Map(data.matches.map((m) => [String(m.id), String(m.machine_id ?? "")]));
  const iconOfMachine = new Map(
    (data.machines ?? []).map((m) => [String(m.id), String((m as { icon_emoji?: string | null }).icon_emoji ?? "").trim() || null])
  );
  for (const e of entries) {
    if (!e.profileId || excluded.has(e.profileId)) continue;
    if (evaluateEntry(e, pr, entries)) continue; // neuer Highscore → Satz hängt dort
    const f = formFor(e, pr);
    if (!f) continue;
    const matchId = e.key.split("|")[0];
    out.push({
      item: scoreFormFeedItem({
        entryKey: e.key,
        playerName: e.playerName,
        machineName: e.machineName ?? "?",
        machineIcon: iconOfMachine.get(machineOfMatch.get(matchId) ?? "") ?? null,
        score: e.score,
        avg: f.a.avg,
        n: f.a.n,
        form: f.form,
      }),
      sig: `${e.score}`,
    });
  }
}

/** 🎰 Flipper-Premiere (Ankündigung, sobald aktiv) + 🌟 Premieren-Sieg (Sieger des fertigen Matches) */
function premiereItems(data: MmData, ctx: FeedContext, out: FeedCandidate[], after: FeedCandidate[]) {
  const pr = ctx.records;
  if (!pr || !pr.enabled) return;
  const nm = nameMap(data);
  const slots = premiereSlots(data, pr);
  const bySlot = new Map(slots.map((x) => [slotKey(x.matchId, x.playerId), x]));
  for (const x of slots) {
    if (!x.active) continue;
    out.push({
      item: {
        key: `premiere|${x.matchId}|${x.playerId}`,
        kind: "premiere",
        icon: "🌟",
        title: "Flipper-Premiere",
        body: `${nm.get(x.playerId) ?? "?"} spielt gleich zum ersten Mal ${x.machineName}!`,
        players: [x.playerId],
        data: { player: nm.get(x.playerId) ?? "?", machine: x.machineName, score: null },
      },
      sig: "1",
    });
  }
  // 🌟 Sieger eines fertigen Matches, der dort Premiere hatte
  const mode = momentMode(data.tournament.format);
  if (mode === "none") return;
  const by = mpsByMatch(data);
  for (const id of completedMatchIds(data, mode)) {
    const mps = by.get(id) ?? [];
    let winners: string[] = [];
    if (mode === "positions") winners = mps.filter((x) => Number(x.position) === 1).map((x) => String(x.player_id));
    else {
      const sc = mps.filter((x) => entered(x.score)).map((x) => ({ pid: String(x.player_id), s: Number(x.score) }));
      const best = Math.max(...sc.map((x) => x.s));
      const top = sc.filter((x) => x.s === best);
      winners = top.length === 1 ? [top[0].pid] : [];
    }
    for (const pid of winners) {
      const slot = bySlot.get(slotKey(id, pid));
      if (!slot) continue;
      const own = mps.find((x) => String(x.player_id) === pid);
      const score = own && entered(own.score) ? Number(own.score) : null;
      const name = nm.get(pid) ?? "?";
      after.push({
        item: {
          key: `premiereWin|${id}|${pid}`,
          kind: "premiereWin",
          icon: "🌟",
          title: "Premieren-Sieg",
          body:
            score != null
              ? `${name} spielt zum ersten Mal ${slot.machineName} und gewinnt sofort – mit ${fmtNum(score)} Punkten!`
              : `${name} spielt zum ersten Mal ${slot.machineName} und gewinnt sofort!`,
          players: [pid],
          data: { player: name, machine: slot.machineName, score },
        },
        sig: mps.map((x) => `${x.player_id}:${x.position ?? ""}:${x.score ?? ""}`).join(","),
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
  const premiereWins: FeedCandidate[] = [];
  if (ctx) {
    premiereItems(data, ctx, out, premiereWins);
    recordItems(data, ctx, out);
    scoreFormItems(data, ctx, out);
    winItems(data, ctx, out);
    momentItems(data, ctx, out);
  }
  out.push(...premiereWins);
  out.push(...done);
  endItems(data, out);
  annotateAge(data, out);
  return sortForTicker(out);
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

/** Alter (Runde bzw. Durchgang) aus der Kennung ableiten, falls nicht schon gesetzt */
function annotateAge(data: MmData, cands: FeedCandidate[]) {
  const rotation = String(data.tournament.format ?? "") === "rotation";
  if (rotation) {
    const waveOf = rotationWaveMap(
      data.matches.map((m) => String(m.id)),
      data.match_players as Parameters<typeof rotationWaveMap>[1]
    );
    for (const c of cands) {
      if (c.age != null) continue;
      const t = c.item.key.split("|");
      if (t[0] === "rotWave") c.age = Number(t[1]);
      else if (t.length >= 3) {
        const w = waveOf.get(`${t[1]}|${t[2]}`);
        if (w != null) c.age = w;
      }
    }
    return;
  }
  const roundNoById = new Map(data.rounds.map((r) => [String(r.id), Number(r.number ?? 0)]));
  const roundOfMatch = new Map(data.matches.map((m) => [String(m.id), roundNoById.get(String(m.round_id)) ?? 0]));
  for (const c of cands) {
    if (c.age != null) continue;
    for (const tok of c.item.key.split("|")) {
      const r = roundNoById.get(tok) ?? roundOfMatch.get(tok);
      if (r != null) {
        c.age = Math.max(c.age ?? 0, r);
      }
    }
  }
}

/** aktuelle Runde (bzw. bei Round the Pinball: aktueller Durchgang) */
export function currentAge(data: MmData): number {
  if (String(data.tournament.format ?? "") === "rotation") {
    const ids = data.matches.map((m) => String(m.id));
    if (!ids.length) return 0;
    const p = rotationProgress(ids, data.match_players as Parameters<typeof rotationProgress>[1]);
    return p.current;
  }
  return Math.max(0, ...data.rounds.map((r) => Number(r.number ?? 0)));
}

/**
 * Eintragsreihenfolge wie bei den Geräten: Runde für Runde (bzw. Durchgang für Durchgang);
 * innerhalb einer Runde erst Ankündigungen (Runde generiert, Premiere), dann Ereignisse, dann der Abschluss;
 * Turnierende + Flawless Victory ganz zum Schluss. (Sortierung ist stabil → sonst bleibt alles wie berechnet.)
 */
function sortForTicker(cands: FeedCandidate[]): FeedCandidate[] {
  const phase = (k: string) => (k === "roundStart" || k === "premiere" ? 0 : k === "roundDone" ? 2 : 1);
  const isEnd = (k: string) => k === "tournamentEnd" || k === "flawless";
  return cands
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const ea = isEnd(a.c.item.kind) ? 1 : 0;
      const eb = isEnd(b.c.item.kind) ? 1 : 0;
      if (ea !== eb) return ea - eb;
      const ga = a.c.age ?? 0;
      const gb = b.c.age ?? 0;
      if (ga !== gb) return ga - gb;
      const pa = phase(a.c.item.kind);
      const pb = phase(b.c.item.kind);
      if (pa !== pb) return pa - pb;
      return a.i - b.i;
    })
    .map((x) => x.c);
}
