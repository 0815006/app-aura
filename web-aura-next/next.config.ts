import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 生产环境 standalone 模式，支持独立 Node.js 部署
  output: "standalone",
  // 环境变量在客户端暴露白名单
  env: {},
};

export default nextConfig;
