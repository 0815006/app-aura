import type { Metadata } from "next";
import "./globals.css";
import { Layout } from "@/components/layout/Layout";

export const metadata: Metadata = {
  title: "Aura - 多场景通用智能体工作台",
  description: "基于 Next.js + Vercel AI SDK + DeepSeek 的全栈智能体平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="h-full">
        <Layout>{children}</Layout>
      </body>
    </html>
  );
}
