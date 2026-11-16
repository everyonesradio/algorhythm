
/**
 * transformers.js ships Node-only backends (sharp, onnxruntime-node). The
 * browser bundle uses onnxruntime-web, so stub the Node ones out client-side.
 */
const nodeOnlyStub = { browser: "./src/lib/stubs/empty.js" };

// Report-only until the browser reports are reviewed. Hosts come from the
// code: transformers.js loads CLIP weights from Hugging Face (which redirects
// to its hf.co CDN) and the onnxruntime-web wasm from jsDelivr; covers come
// from Spotify, Cover Art Archive (redirects to archive.org) and Discogs.
const coverHosts =
  "https://i.scdn.co https://coverartarchive.org https://archive.org https://*.archive.org https://i.discogs.com";
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${coverHosts}`,
  "font-src 'self' data:",
  `connect-src 'self' blob: data: https://huggingface.co https://*.huggingface.co https://*.hf.co https://cdn.jsdelivr.net ${coverHosts}`,
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=()",
  },
  { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
