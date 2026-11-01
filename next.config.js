const path = require("path");

/**
 * transformers.js ships Node-only backends (sharp, onnxruntime-node). The
 * browser bundle uses onnxruntime-web, so stub the Node ones out client-side.
 */
const nodeOnlyStub = { browser: "./src/lib/stubs/empty.js" };

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep Turbopack rooted on this app when a parent-directory lockfile exists.
  turbopack: {
    root: path.join(__dirname),
    resolveAlias: {
      sharp: nodeOnlyStub,
      "onnxruntime-node": nodeOnlyStub,
    },
  },
  // Load these from node_modules at runtime on the server instead of bundling
  // them (native binaries / large ONNX runtime).
  serverExternalPackages: ["@huggingface/transformers", "sharp", "onnxruntime-node"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.scdn.co", pathname: "**" },
      { protocol: "https", hostname: "coverartarchive.org", pathname: "**" },
      { protocol: "https", hostname: "**.archive.org", pathname: "**" },
    ],
  },
};

module.exports = nextConfig;
