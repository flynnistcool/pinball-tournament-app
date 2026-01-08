// @ts-nocheck
import "./globals.css";
// import RoutePill from "@/components/RoutePill";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pinball Turnier",
  description: "Kleine Turniersoftware für Matchplay, Round Robin, Swiss",

  manifest: "/manifest.webmanifest",
  themeColor: "#000000",

  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Pinball Turnier",
  },

  other: {
    "mobile-web-app-capable": "yes",
  },

  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png" }],
  },
};

// ✅ Mobile: korrektes Scaling + "notch safe area" (iPhone)
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-neutral-50 text-neutral-900">
        {/*
          Mobile-Polish:
          - etwas weniger Rand auf kleinen Screens
          - safe-area padding (iPhone Notch/Homebar)
        */}
        <div className="mx-auto max-w-5xl p-3 sm:p-4 md:p-8 pt-[calc(12px+env(safe-area-inset-top))] pb-[calc(12px+env(safe-area-inset-bottom))]">
          <div className="mb-6 flex items-center justify-between">
            {/* <div className="text-xl font-semibold">🎱 Pinball Turnier</div> */}
<Link
  href="/"
  className="flex items-center gap-3 font-bold hover:opacity-70 transition cursor-pointer select-none"
>
  <img
    src="/icon-192.png"
    alt="Pinball Icon"
    className="h-10 w-10 sm:h-12 sm:w-12 rounded-md"
  />
  <span className="text-xl sm:text-2xl">Pinball Turnier</span>
</Link>

            <div className="flex items-center gap-3">
              {/* <RoutePill /> */}
              <span className="text-sm text-neutral-600"></span>
            </div>
          </div>

          {children}
          {/*}
          <div className="mt-10 text-xs text-neutral-500">
            Tipp: Auf dem iPad in Safari → Teilen → „Zum Home-Bildschirm“, dann fühlt es sich wie eine App an.
          </div>
          */}   
        </div>
      </body>
    </html>
  );
}
