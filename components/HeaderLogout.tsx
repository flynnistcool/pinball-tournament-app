"use client";

import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

export function HeaderLogout() {
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    supabaseBrowser()
      .auth
      .getUser()
      .then((u) => {
        const email = u.data?.user?.email ?? null;

        if (email === "flo.nestmann@gmx.de") {
          // Diese Mail → Admin
          setUsername("Admin");
        } else if (email) {
          // Jede andere Mail → Besucher
          setUsername("Besucher");
        } else {
          // Falls gar kein User gefunden wird
          setUsername(null);
        }
      });

  }, []);

  return (
    <div className="absolute right-4 top-4 flex items-center gap-3 text-sm">
      <span className="font-medium text-neutral-700">
        👤 {username ?? "Profil"}
      </span>
      <Button
        variant="secondary"
        onClick={async () => {
          await supabaseBrowser().auth.signOut();
          localStorage.clear();
          location.href = "/login";
        }}
        className="rounded-lg bg-red-50 text-red-700 hover:bg-red-100"
      >
        Abmelden
      </Button>
    </div>
  );
}
