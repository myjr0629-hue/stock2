import type { Metadata } from "next";
import "./globals.css";
import { GuardianProvider } from "@/components/guardian/GuardianProvider";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";

// [PERF] next/font: 빌드 시 다운로드 → 셀프호스팅 (외부 CDN 렌더 블로킹 제거)
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
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
    <html lang="ko" suppressHydrationWarning className={`${inter.variable} ${plusJakarta.variable}`}>
      <head>
        {/* [PERF] Pretendard: preload for early download + afterInteractive to avoid render blocking */}
        <link
          rel="preload"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
          as="style"
          crossOrigin="anonymous"
        />
        <noscript>
          <link
            rel="stylesheet"
            href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
          />
        </noscript>
      </head>
      <body
        className="antialiased"
      >
        <GuardianProvider>
          {children}
        </GuardianProvider>
        {/* [PERF] Pretendard: activate preloaded CSS after hydration */}
        <Script id="load-pretendard" strategy="afterInteractive">{`
          var l=document.createElement('link');l.rel='stylesheet';
          l.href='https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css';
          document.head.appendChild(l);
        `}</Script>
      </body>
    </html>
  );
}
