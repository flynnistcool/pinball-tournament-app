// 📣 Reihenfolge im Live-Ticker (Browser): Abschluss einer Runde/eines Durchgangs kommt verzögert
// (nach den Einzelmeldungen mit 10-s-Tippfehler-Schutz). Ankündigungen der NÄCHSTEN Runde
// (Runde generiert, Flipper-Premiere) dürfen erst danach eingetragen werden – sonst stünden sie
// im Ticker unter dem Abschluss der vorherigen Runde.

/** Ticker-Eintrag "Runde abgeschlossen" / "Durchgang geschafft" erst nach den anderen Meldungen der Runde */
export const FEED_DONE_DELAY_MS = 12_000;

let doneDueAt = 0;

/** Abschluss-Eintrag verzögert eintragen (und merken, bis wann Ankündigungen warten müssen) */
export function scheduleDoneFeed(post: () => void) {
  doneDueAt = Math.max(doneDueAt, Date.now() + FEED_DONE_DELAY_MS);
  window.setTimeout(post, FEED_DONE_DELAY_MS);
}

/**
 * Ankündigung eintragen, aber erst NACH einem noch ausstehenden Abschluss-Eintrag.
 * Kurze Vorlaufzeit, weil Abschluss und Ankündigung aus derselben Datenänderung stammen können
 * und die Reihenfolge, in der die Seite sie erkennt, nicht feststeht.
 */
export function afterPendingDone(post: () => void) {
  window.setTimeout(() => {
    const wait = doneDueAt - Date.now();
    if (wait > 0) window.setTimeout(post, wait + 400);
    else post();
  }, 1_500);
}
