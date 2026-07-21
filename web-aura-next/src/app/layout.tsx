import type { Metadata } from "next";
import "./globals.css";
import { Layout } from "@/components/layout/Layout";
import { AuthProvider } from "@/lib/auth/auth-context";

export const metadata: Metadata = {
  title: "Aura - 多场景通用智能体工作台",
  description: "基于 Next.js + Vercel AI SDK + DeepSeek 的全栈智能体平台",
  icons: {
    icon: "/aura.svg",
    shortcut: "/aura.svg",
    apple: "/aura.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="h-full">
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__AURA_MODE__="${process.env.AURA_MODE || ""}";window.__AURA_SERVER_URL__="${process.env.AURA_SERVER_URL || ""}";`,
          }}
        />
        <AuthProvider>
          <Layout>{children}</Layout>
        </AuthProvider>
      </body>
    </html>
  );
}
