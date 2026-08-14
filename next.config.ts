import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Do NOT set `turbopack.root` here. A relative '..' resolves to
  // ~/Downloads, which holds ~400k files across a dozen other projects and
  // their node_modules — Turbopack then roots the workspace there and watches
  // the lot, which pins the CPU and makes dev unusable. This project has its
  // own package-lock.json and no competing lockfile above it, so Next infers
  // the correct root (this directory) on its own.
};

export default nextConfig;
