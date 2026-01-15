import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { GuardianProvider } from "@/components/guardian/GuardianProvider";

// Inter for numeric data (dashboard numbers)
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "SIGNUM HQ",
  description: "Market Signal Command Center - 옵션 · 다크풀 · 고래 통합 분석",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* Pretendard from CDN */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
      <body
        className={`${inter.variable} antialiased`}
        style={{ fontFamily: 'Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif' }}
      >
        <GuardianProvider>
          {children}
        </GuardianProvider>
      </body>
    </html>
  );
}
