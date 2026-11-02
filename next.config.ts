import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import { randomUUID } from "node:crypto";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: false,
  manifestTransforms: [async (entries) => ({ manifest: [...entries, { url: "/offline", revision: randomUUID(), size: 0 }], warnings: [] })],
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@google/genai", "better-sqlite3", "web-push", "sharp"],
};

export default withSerwist(nextConfig);
