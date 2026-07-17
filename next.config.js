/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `npm run build` runs `tsc --noEmit` first; skip Next's duplicate worker-based typecheck.
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {
    root: __dirname,
  },
  outputFileTracingRoot: __dirname,
  experimental: {
    cpus: 2,
  },
};

module.exports = nextConfig;