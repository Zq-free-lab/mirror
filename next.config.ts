import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @xenova/transformers runs in the browser (Web Worker) — exclude from server bundle
  serverExternalPackages: ["@xenova/transformers"],

  // Explicit Turbopack config (Next.js 16 default bundler)
  turbopack: {},

  // Required for SharedArrayBuffer (WASM SIMD threads) in the browser
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
