import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // Use webpack instead of turbopack for onnxruntime-web compatibility
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
      };
    }

    config.module.rules.push({
      test: /\.onnx$/,
      type: "asset/resource",
    });

    return config;
  },
};

export default nextConfig;
