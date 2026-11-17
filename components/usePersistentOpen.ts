"use client";

// 📌 Auf-/Zugeklappt-Zustand eines Bereichs im Browser merken (bleibt nach dem Neuladen erhalten).
// Wie beim 📣 Live-Ticker: pro Gerät/Browser, ohne Datenbank.

import { useCallback, useEffect, useState, type SetStateAction } from "react";

export function usePersistentOpen(
  storageKey: string,
  initial = true
): [boolean, (v: SetStateAction<boolean>) => void] {
  const [open, setOpenState] = useState(initial);

  // gespeicherten Zustand erst im Browser lesen (Server kennt ihn nicht)
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(storageKey);
      if (v === "0") setOpenState(false);
      else if (v === "1") setOpenState(true);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const setOpen = useCallback(
    (v: SetStateAction<boolean>) => {
      setOpenState((prev) => {
        const next = typeof v === "function" ? (v as (p: boolean) => boolean)(prev) : v;
        try {
          window.localStorage.setItem(storageKey, next ? "1" : "0");
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [storageKey]
  );

  return [open, setOpen];
}
