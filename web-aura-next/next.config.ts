import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 生产环境 standalone 模式，支持独立 Node.js 部署
  output: "standalone",

  // 暴露给客户端的公共环境变量
  env: {
    // NEXT_PUBLIC_ 前缀的变量会被内联到客户端 JS bundle 中
    // 这些变量在构建时确定，客户端模式通过 AURA_SERVER_URL 转发 API 请求
  },

  // 允许的远程图片域名
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;
