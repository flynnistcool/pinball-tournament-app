// 🔊 Alle Ansage-Texte der Sprachausgabe – Englisch und Deutsch nebeneinander.
// Sprache pro Turnier: tournaments.speech_lang ("en" Standard | "de").
// Texte hier ändern = Ansage ändert sich überall.

export type SpeechLang = "en" | "de";

export function speechLangOf(v: unknown): SpeechLang {
  return v === "de" ? "de" : "en";
}

/** BCP-47-Sprachcode für die Stimme */
export const SPEECH_LOCALE: Record<SpeechLang, string> = { en: "en-US", de: "de-DE" };

// ── Rundenansage (Matchplay, Swiss, Round Robin) ─────────────────────────────
export const roundSpeech = {
  intro: (lang: SpeechLang, roundNo: number | string) => (lang === "de" ? `Runde ${roundNo}.` : `Round ${roundNo}.`),
  match: (lang: SpeechLang, nr: number, machine: string, players: string) =>
    lang === "de"
      ? `Match ${nr} an ${machine}, Reihenfolge: ${players}.`
      : `Match ${nr} on machine ${machine} with the playing order: ${players}.`,
  favorite: (lang: SpeechLang, reason: "winrate" | "elo", name: string) =>
    lang === "de"
      ? reason === "winrate"
        ? ` Favorit in diesem Match, mit den besten Siegquoten, ist ${name}.`
        : ` Favorit in diesem Match, mit der höchsten Elo, ist ${name}.`
      : reason === "winrate"
      ? ` The favorite in this match, with the best win rates, is ${name}.`
      : ` The favorite in this match, with the highest Elo, is ${name}.`,
  unknownMachine: (lang: SpeechLang) => (lang === "de" ? "unbekanntem Flipper" : "Unknown machine"),
};

// ── Round the Pinball (Timer) ────────────────────────────────────────────────
export const rotationSpeech = {
  getReady: (lang: SpeechLang) => (lang === "de" ? "Macht euch bereit, gleich geht's los!" : "Get ready, it starts in a few seconds!"),
  letsGo: (lang: SpeechLang) => (lang === "de" ? "Los geht's, viel Spaß!" : "Let's go and have fun!"),
  halftime: (lang: SpeechLang) =>
    lang === "de"
      ? "Halbzeit! Gebt Gas, geht Risiko – oder bleibt für immer Angsthasen."
      : "Hurry up and try harder, take risks or stay pussies forever.",
  oneMinute: (lang: SpeechLang) => (lang === "de" ? "Achtung, nur noch eine Minute." : "Attention, only one minute left."),
  timesUp: (lang: SpeechLang) =>
    lang === "de"
      ? "Zeit ist um! Sofort aufhören zu spielen und die Highscores eintragen! Danke!"
      : "Time's up! Stop playing pinball immediately and enter your high scores! Thank you!",
};

// ── Elimination (Fall kommt vom Server: set-score → speak.case) ──────────────
export type EliminationSpeechCase = "final" | "closeLoss" | "firstNext" | "next";

export function eliminationSpeech(
  lang: SpeechLang,
  c: EliminationSpeechCase,
  name: string,
  scorerName?: string | null
): string {
  const scorer = scorerName || (lang === "de" ? "Spieler" : "Player");
  if (lang === "de") {
    switch (c) {
      case "final":
        return `Wow, was für eine Leistung, ${name}! Du hast brillant gespielt, deine Flipper-Künste sind außergewöhnlich! Lass dich feiern – ${name}, du hast das Turnier gewonnen!`;
      case "closeLoss":
        return `${scorer}, das war knapp. Nächstes Mal klappt's mit einem höheren Score. ${name}, du bist in der nächsten Runde. Versuch, am nächsten Flipper den Grenz-Score zu schlagen, um im Spiel zu bleiben.`;
      case "firstNext":
        return `Stark gespielt, ${name}! Du bist als Erster in der nächsten Runde. Geh zum nächsten Flipper und leg einen Score vor.`;
      case "next":
        return `Sehr gut gespielt, ${name}! Du bist in der nächsten Runde. Versuch, am nächsten Flipper den Grenz-Score zu schlagen, um im Spiel zu bleiben.`;
    }
  }
  switch (c) {
    case "final":
      return `Wow, what a performance! ${name}! You played brilliantly, your pinball skills are exceptional! Let yourself be celebrated! ${name}, you won the tournament!`;
    case "closeLoss":
      return `${scorer}, that was close. Next time you'll get a higher score. ${name}. You're in the next round. Try to beat the cutoff score on the next round's pinball machine to stay in the game.`;
    case "firstNext":
      return `Great play! ${name}. You're the first player in the next round. Go to the next round's pinball machine and set your score.`;
    case "next":
      return `Very well played! ${name}. You're in the next round. Try to beat the cutoff score on the next round's pinball machine to stay in the game.`;
  }
}

// ── Stimme wählen ────────────────────────────────────────────────────────────
/**
 * Englisch: Windows-Stimme "Vicki/Vicky" bevorzugt (wie bisher), sonst en-US / en-*.
 * Deutsch: de-DE, sonst irgendeine de-* Stimme (Windows z. B. Hedda/Katja, iPad z. B. Anna).
 * Keine passende Stimme → null (Browser nimmt seine Standardstimme, lang wird trotzdem gesetzt).
 */
export function pickSpeechVoice(voices: readonly SpeechSynthesisVoice[], lang: SpeechLang): SpeechSynthesisVoice | null {
  const list = voices ?? [];
  if (lang === "en") {
    const vicky = list.find((v) => /vicki|vicky/i.test(v.name || "") || /vicki|vicky/i.test(v.voiceURI || ""));
    if (vicky) return vicky;
  }
  const locale = SPEECH_LOCALE[lang];
  return (
    list.find((v) => v.lang === locale) ||
    list.find((v) => (v.lang || "").toLowerCase().replace("_", "-").startsWith(lang)) ||
    null
  );
}
