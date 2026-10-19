import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, ".."),
};

export default nextConfig;
