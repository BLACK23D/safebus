import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  // Clickjacking: the app is embeddable by design (preview panels), so we use
  // frame-ancestors (NOT X-Frame-Options) and allow same-origin + https/http
  // embedders. First-party deployments should pin this to their own origin.
  { key: "Content-Security-Policy", value: "frame-ancestors 'self' https: http:; object-src 'none'; base-uri 'self'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Ignored by browsers over plain http; protects https deployments.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // Type errors fail the build — CI runs `tsc --noEmit` as an independent gate.
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  poweredByHeader: false,
  // PWA layer (Task 8): the service worker must never be cached by the browser,
  // and must be allowed to control the whole scope.
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
