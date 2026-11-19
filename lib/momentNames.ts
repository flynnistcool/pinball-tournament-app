// 💣 📸 🔄 Match-Momente im Ticker: Spielernamen im Text fett (nur Anzeige).
// Dazu allgemein boldNameParts(): Namen aus data.player/other/victim fett (Serie beendet, Führung …).
//
// Texte kommen aus lib/matchMoments.ts momentText():
//   blowout: "X zerlegt an <Flipper> Y – 4,2× so viele Punkte (…)"
//   photo:   "X gewinnt an <Flipper> hauchdünn gegen Y – nur 1,2 % Vorsprung (…)"
//   revenge: "X revanchiert sich an <Flipper> bei Y – in Runde 2 hatte Y noch gewonnen"
// Namen kommen aus data.player / data.other; fehlen sie, wird der Verlierer über den Flippernamen bzw.
// "gegen"/"bei" gesucht. Passt nichts, bleibt der Text unverändert (null).

export type TextPart = { text: string; bold: boolean };

const VERB: Record<string, string> = {
  blowout: " zerlegt",
  photo: " gewinnt",
  revenge: " revanchiert sich",
};

/** Verlierer ohne data.other aus dem Text holen */
function guessLoser(kind: string, body: string, from: number, machine: string): string | null {
  let pos = from;
  if (machine) {
    const at = body.indexOf(machine, pos);
    if (at >= 0) pos = at + machine.length;
    else if (kind === "blowout") return null;
  } else if (kind === "blowout" && body.startsWith(" an ", pos)) return null;
  let start: number;
  if (kind === "blowout") start = body.charAt(pos) === " " ? pos + 1 : -1;
  else {
    const pre = kind === "photo" ? " gegen " : " bei ";
    const i = body.indexOf(pre, pos);
    start = i >= 0 ? i + pre.length : -1;
  }
  if (start < 0) return null;
  const dash = body.indexOf(" – ", start);
  const name = body.slice(start, dash >= 0 ? dash : body.length).trim();
  return name || null;
}

export function momentNameParts(
  kind: string,
  body: string,
  data?: { player?: unknown; other?: unknown; machine?: unknown } | null
): TextPart[] | null {
  const verb = VERB[kind];
  if (!verb || !body) return null;
  const w = body.indexOf(verb);
  if (w <= 0) return null;
  const winner = body.slice(0, w);
  const other = typeof data?.other === "string" && data.other.trim() ? data.other.trim() : null;
  const machine = typeof data?.machine === "string" ? data.machine.trim() : "";
  const loser = other ?? guessLoser(kind, body, w + verb.length, machine);

  const parts: TextPart[] = [{ text: winner, bold: true }];
  let rest = body.slice(w);
  if (loser) {
    // jedes Vorkommen des Verlierers als ganzes Wort fett (Revanche nennt ihn zweimal)
    let i = rest.indexOf(loser);
    while (i >= 0) {
      const before = i === 0 ? " " : rest.charAt(i - 1);
      const after = rest.charAt(i + loser.length);
      const whole = /\s/.test(before) && (after === "" || /[\s,.!–)]/.test(after));
      if (whole) {
        if (i > 0) parts.push({ text: rest.slice(0, i), bold: false });
        parts.push({ text: loser, bold: true });
        rest = rest.slice(i + loser.length);
        i = rest.indexOf(loser);
      } else i = rest.indexOf(loser, i + 1);
    }
  }
  if (rest) parts.push({ text: rest, bold: false });
  return parts;
}

/** Spielernamen, die eine Meldung in data mitbringt (data.player / data.other / data.victim) */
export function namesFromData(data?: Record<string, unknown> | null): string[] {
  const out: string[] = [];
  for (const k of ["player", "other", "victim"]) {
    const v = data?.[k];
    if (typeof v === "string" && v.trim() && !out.includes(v.trim())) out.push(v.trim());
  }
  // mehrere Sieger/Verlierer (⚖️ "Janos und Gerd setzen sich durch")
  for (const k of ["winnerNames", "loserNames"]) {
    const arr = data?.[k];
    if (Array.isArray(arr)) for (const v of arr) if (typeof v === "string" && v.trim() && !out.includes(v.trim())) out.push(v.trim());
  }
  return out;
}

/** 🅱️ Allgemein: alle genannten Spielernamen (als ganze Wörter) im Text fett; null = keiner gefunden */
export function boldNameParts(body: string, names: readonly string[]): TextPart[] | null {
  if (!body || !names.length) return null;
  // längere Namen zuerst, damit "Marco P." vor "Marco" greift
  const list = names.slice().sort((a, b) => b.length - a.length);
  const isEdge = (c: string) => c === "" || /[\s,.!?:;–()„“"']/.test(c);
  const parts: TextPart[] = [];
  let plain = "";
  let i = 0;
  let found = false;
  while (i < body.length) {
    const hit = list.find((n) => body.startsWith(n, i) && isEdge(i === 0 ? "" : body.charAt(i - 1)) && isEdge(body.charAt(i + n.length)));
    if (hit) {
      if (plain) parts.push({ text: plain, bold: false });
      parts.push({ text: hit, bold: true });
      plain = "";
      i += hit.length;
      found = true;
    } else {
      plain += body.charAt(i);
      i++;
    }
  }
  if (plain) parts.push({ text: plain, bold: false });
  return found ? parts : null;
}
