"use client";

import { usePathname } from "next/navigation";

function labelFromPath(path: string) {
  // hübschere Labels für die wichtigsten Seiten
  if (path === "/") return "ROOT";
  if (path === "/t") return "T • Start";
  if (path.startsWith("/t/")) return "T • Turnier";
  if (path.startsWith("/s/")) return "S • Summary";
  if (path.startsWith("/p/")) return "P • Spielerprofil";
  if (path.startsWith("/public")) return "PUBLIC";
  if (path === "/login") return "LOGIN";
  return path; // fallback: zeig den Pfad direkt
}

export default function RoutePill() {
  const pathname = usePathname() || "/";
  const label = labelFromPath(pathname);

  return (
    <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
      {label}
    </span>
  );
}