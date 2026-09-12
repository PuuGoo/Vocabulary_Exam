/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  output: "standalone",
  experimental: {
    // Worker threads keep production builds reliable on restricted Windows hosts
    // where spawning Next.js child-process workers can fail with EPERM.
    workerThreads: true,
    webpackBuildWorker: false,
  },
};

export default nextConfig;
