/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Versionsanzeige (components/VersionBadge.tsx): wird beim Bauen festgeschrieben.
  // VERCEL_GIT_COMMIT_SHA stellt Vercel automatisch bereit; lokal gibt es sie nicht → "dev".
  env: {
    NEXT_PUBLIC_APP_VERSION: (process.env.VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 7),
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
};

export default nextConfig;
