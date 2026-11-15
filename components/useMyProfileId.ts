"use client";

// ⭐ Welches Spielerprofil gehört zum angemeldeten Login? (profile_links, über /api/profile-links)
// Einmal pro Seitenaufruf geladen und geteilt – für "du"-Markierungen in Ranglisten & Co.

import { useEffect, useState } from "react";

let cached: Promise<string | null> | null = null;

function loadMyProfileId(): Promise<string | null> {
  if (!cached) {
    cached = fetch(`/api/profile-links?ts=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j?.profile_id ? String(j.profile_id) : null))
      .catch(() => null);
  }
  return cached;
}

export function useMyProfileId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadMyProfileId().then((v) => {
      if (alive) setId(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  return id;
}
