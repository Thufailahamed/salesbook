import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: false,
  images: { unoptimized: true },
  transpilePackages: ["@shopbooks/shared"],
  reactStrictMode: true,
  typedRoutes: false,
};

export default nextConfig;
