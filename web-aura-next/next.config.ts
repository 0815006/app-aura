import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 服务端部署用 standalone，Tauri 客户端也用 standalone
  // Tauri 构建脚本会从 .next/server/app/ 提取预渲染的静态 HTML 页面
  output: "standalone",

  // 暴露给客户端的公共环境变量（构建时内联到客户端 JS bundle）
  env: {
    AURA_MODE: process.env.AURA_MODE,
    AURA_SERVER_URL: process.env.AURA_SERVER_URL,
  },

  // 允许的远程图片域名
  images: {
    remotePatterns: [],
  },

  // 排除含原生模块 / 动态 require 的包，避免 Turbopack standalone 构建时
  // chunk 依赖解析异常（Module factory is not available）
  serverExternalPackages: [
    "bcryptjs",
    "jose",
    "drizzle-orm",
    "pg",
  ],
};

export default nextConfig;
