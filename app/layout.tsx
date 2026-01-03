import "./globals.css";

export const metadata = {
  title: "Pinball Tournament",
  description: "Pinball Tournament App",

  // ✅ PWA
  manifest: "/manifest.webmanifest",
  themeColor: "#000000",

  // ✅ iOS / iPad Standalone (Vollbild)
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Pinball",
  },

  // ✅ Icons
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
