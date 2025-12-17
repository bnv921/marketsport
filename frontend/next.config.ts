import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Явно указываем использование webpack вместо Turbopack
  // Turbopack имеет проблемы с некоторыми модулями (например, @solana-program/system)
  experimental: {
    // Отключаем Turbopack
  },
  webpack: (config, { isServer }) => {
    // Игнорируем проблемные модули на сервере, если они не нужны
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        '@solana-program/system': 'commonjs @solana-program/system',
      });
    }
    return config;
  },
};

export default nextConfig;
