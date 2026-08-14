import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Explicitly restrict Webpack file watcher to avoid watching parent directories
  // or node_modules, which causes massive CPU spikes.
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      config.watchOptions = {
        ignored: ['**/node_modules', '**/.git', '**/.next'],
      };
    }
    return config;
  },
  // Silence the Turbopack warning about having a custom webpack config
  turbopack: {}
};

export default nextConfig;
