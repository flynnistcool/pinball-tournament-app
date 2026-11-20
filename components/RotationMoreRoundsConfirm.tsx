"use client";

// 🧱 Round the Pinball: Rückfrage, bevor weitere Runden nachgelegt werden.
// Erscheint beim Druck auf "Runde erzeugen", wenn schon alle Durchgänge fertig sind.
// Erst nach "Ja, weiter geht's!" kommt das Fenster "Anzahl Flipper" (components/RotationRoundsDialog.tsx).

export default function RotationMoreRoundsConfirm({
  open,
  wavesDone,
  onYes,
  onNo,
}: {
  open: boolean;
  /** bisher gespielte Durchgänge */
  wavesDone: number;
  onYes: () => void;
  onNo: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onNo}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="text-5xl">🏁</div>
        <div className="mt-2 text-xl font-bold">Alle Durchgänge sind gespielt!</div>
        <div className="mt-2 text-sm text-neutral-600">
          {wavesDone > 0 ? `${wavesDone} ${wavesDone === 1 ? "Durchgang" : "Durchgänge"} – ` : ""}
          an allen Flippern sind die Scores eingetragen. Eigentlich wäre das Turnier jetzt zu Ende.
        </div>
        <div className="mt-4 font-semibold">Möchtest du weitermachen und noch weitere Durchgänge hinzufügen?</div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onYes}
            className="rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white hover:bg-emerald-700"
          >
            Ja, weiter geht&apos;s! 🚀
          </button>
          <button
            type="button"
            onClick={onNo}
            className="rounded-xl bg-white px-5 py-2.5 font-semibold text-neutral-700 ring-1 ring-neutral-300 hover:bg-neutral-50"
          >
            Nein, abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}
