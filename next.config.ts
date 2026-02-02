import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for Tauri
  output: "export",
  // Disable image optimization for static export
  images: {
    unoptimized: true,
  },
  // Hide Next.js dev tools indicator in production
  devIndicators: false,
};

export default nextConfig;
