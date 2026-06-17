import type { Metadata, Viewport } from "next";
import "./globals.css";
import { GuardianProvider } from "@/components/guardian/GuardianProvider";
import { Inter, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
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

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',  // iOS safe area support
  themeColor: '#050a14',
};

export const metadata: Metadata = {
  title: "SIGNUM HQ",
  description: "Institutional Intelligence, Democratized — GEX · Dark Pool · Options Flow · AI Verdicts",
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SIGNUM HQ',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192x192.png', type: 'image/png' },
    ],
    apple: '/apple-icon.png',
  },
  openGraph: {
    title: 'SIGNUM HQ — Institutional Intelligence, Democratized',
    description: 'Real-time GEX, Dark Pool, Options Flow & AI Verdicts. See what others cannot.',
    url: 'https://signumhq.com',
    siteName: 'SIGNUM HQ',
    images: [
      {
        url: '/og-brand.png',
        width: 1200,
        height: 630,
        alt: 'SIGNUM HQ - Institutional Intelligence, Democratized',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SIGNUM HQ — Institutional Intelligence, Democratized',
    description: 'Real-time GEX, Dark Pool, Options Flow & AI Verdicts. See what others cannot.',
    images: ['/api/og/market?type=pulse&format=tweet'],
    creator: '@signumhq',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning className={`${inter.variable} ${plusJakarta.variable} ${jetbrainsMono.variable}`}>
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
        suppressHydrationWarning
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
        {/* Service Worker Registration (PWA) */}
        <Script id="sw-register" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(function(){});
          }
        `}</Script>
      </body>
    </html>
  );
}
