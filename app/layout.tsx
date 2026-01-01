import "./globals.css";
//import RoutePill from "@/components/RoutePill";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pinball Turnier",
  description: "Kleine Turniersoftware für Matchplay, Round Robin, Swiss"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-neutral-50 text-neutral-900">
        <div className="mx-auto max-w-5xl p-4 md:p-8">
          <div className="mb-6 flex items-center justify-between">
            {/*<div className="text-xl font-semibold">🎱 Pinball Turnier</div> */}
            <Link
              href="/"
              className="text-2xl font-bold hover:opacity-70 transition cursor-pointer select-none"
            >
              Pinball Turnier
            </Link>

            <div className="flex items-center gap-3">
             {/*}
              <RoutePill />
              */}
              <span className="text-sm text-neutral-600"></span>
            </div>
          </div>
          {children}
          <div className="mt-10 text-xs text-neutral-500">
            Tipp: Auf dem iPad in Safari → Teilen → „Zum Home-Bildschirm“, dann fühlt es sich wie eine App an.
          </div>
        </div>
      </body>
    </html>
  );
}
