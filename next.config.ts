import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for Tauri
  output: "export",
  // Disable image optimization for static export
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
