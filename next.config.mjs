
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
    root: import.meta.dirname,
    resolveAlias: {
      sharp: nodeOnlyStub,
      "onnxruntime-node": nodeOnlyStub,
    },
  },
  // Load these from node_modules at runtime on the server instead of bundling
  // them (native binaries / large ONNX runtime).
  serverExternalPackages: ["@huggingface/transformers", "sharp", "onnxruntime-node"],
  // The server runs CLIP on CPU for scan-triggered catalog ingest. Keep the
  // deployed function small: onnxruntime-node ships every platform plus a
  // ~340MB CUDA provider we never load.
  // The tracer follows the .node binding but not the shared library it
  // dlopens at runtime; without this, server-side embedding crashes on
  // Vercel with "libonnxruntime.so.1: cannot open shared object file".
  outputFileTracingIncludes: {
    "/api/**": [
      "node_modules/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime.so.1",
      "node_modules/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime_providers_shared.so",
    ],
    // Fonts the album share-preview image reads from disk at runtime.
    "/api/og/**": [
      "public/fonts/EightBitDragon-anqx.ttf",
      "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf",
    ],
  },
  outputFileTracingExcludes: {
    "*": [
      "node_modules/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime_providers_cuda.so",
      "node_modules/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime_providers_tensorrt.so",
      "node_modules/onnxruntime-node/bin/napi-v3/linux/arm64/**",
      "node_modules/onnxruntime-node/bin/napi-v3/darwin/**",
      "node_modules/onnxruntime-node/bin/napi-v3/win32/**",
      "node_modules/@huggingface/transformers/dist/*.web.*",
      "node_modules/@huggingface/transformers/dist/*.min.*",
    ],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.scdn.co", pathname: "**" },
      { protocol: "https", hostname: "coverartarchive.org", pathname: "**" },
      { protocol: "https", hostname: "**.archive.org", pathname: "**" },
    ],
  },
};

export default nextConfig;
