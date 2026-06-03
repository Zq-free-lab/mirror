import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mirror / 镜 —— AI 眼中的你",
  description: "Mirror 展示 AI 把你理解成了什么样的人，并把改写这个理解的权力交还给你。",
  openGraph: {
    title: "Mirror / 镜 —— AI 眼中的你",
    description: "导入你与 AI 的对话，看 Mirror 重建「AI 眼中的你」，并亲手校准它。",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
