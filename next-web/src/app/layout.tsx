import type { Metadata } from 'next';
import './globals.css';
import { ToastHost } from '@/components/Toast';

export const metadata: Metadata = {
  title: '星选 AI 购物管家',
  description: '真实数据驱动的电商 Agent 演示项目',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500&family=Noto+Serif+SC:wght@500;600;700&family=Noto+Sans+SC:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <ToastHost />
      </body>
    </html>
  );
}
