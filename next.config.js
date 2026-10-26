/** @type {import('next').NextConfig} */
const nextConfig = {
  // The SSLCommerz SDK is CommonJS and does not survive being bundled and
  // minified into a server route — the minified build threw
  // "i is not a function" the moment a payment was started, while `next dev`
  // (which doesn't minify the same way) worked fine, so this only ever broke
  // in production. Keeping it external makes Next require() it at runtime,
  // exactly as plain Node does.
  experimental: {
    serverComponentsExternalPackages: ["sslcommerz-lts"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" }, // blocks clickjacking (site can't be iframed)
          { key: "X-Content-Type-Options", value: "nosniff" }, // stops MIME-sniffing attacks
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
