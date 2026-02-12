import type { Metadata } from "next";
import "./globals.css";
import { GuardianProvider } from "@/components/guardian/GuardianProvider";

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
        {/* Google Fonts CDN: Plus Jakarta Sans + Inter */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* Pretendard CDN for Korean */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
      <body className="antialiased">
        <GuardianProvider>
          {children}
        </GuardianProvider>
      </body>
    </html>
  );
}
