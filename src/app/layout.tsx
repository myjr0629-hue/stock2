import type { Metadata, Viewport } from "next";
import "./globals.css";
import { GuardianProvider } from "@/components/guardian/GuardianProvider";
import { Inter, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import { headers } from 'next/headers';

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
  metadataBase: new URL('https://www.signumhq.com'),
  // ⛔ 2026-08-20 실측: 티커 페이지 501개는 generateMetadata 에서 hreflang 을 내보내는데,
  //    홈·/undercurrent·/wim·/how-it-works·/pricing 는 «0개»였다. 3개국어를 완비해 놓고
  //    정작 사람이 가장 먼저 닿는 페이지들에서만 검색엔진에 안 알리고 있었다.
  //    여기서 로케일 루트를 잡아주고, 각 페이지는 필요 시 자기 canonical 로 덮어쓴다.
  alternates: {
    languages: {
      en: '/en',
      ko: '/ko',
      ja: '/ja',
      'x-default': '/en',
    },
  },
  // Google Discover 노출 자격 요건. 없으면 큰 이미지 프리뷰가 아예 후보에서 빠진다.
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
  },
  manifest: '/manifest.json',
  // iOS Safari Smart App Banner (App Store id — live since 2026-07). WKWebView(native app) ignores this.
  itunes: {
    appId: '6783130444',
  },
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

// ============================================================================
// <html lang> 은 «실제 로케일»이어야 한다 (2026-08-22 GSC 실측으로 발견)
// ----------------------------------------------------------------------------
// 여기가 "ko" 로 하드코딩돼 있어서 /en/flow/NIO 도 /ja/flow/NIO 도 전부
// lang="ko" 로 선언되고 있었다. 제목까지 세 로케일이 영어로 동일하다 보니
// 구글은 «같은 언어의 동일 문서 3개»로 보고 **/ko/flow/* 150건을
// "Duplicate without user-selected canonical" 로 색인에서 제외**했다.
// (canonical 자체는 각자 자기를 가리키고 있었는데도 중복 판정을 받았다.)
//
// headers() 호출이 여기서 «공짜»인 이유: [locale]/layout.tsx 가 이미
// await headers() 를 무조건 호출해 이 앱 전체가 이미 동적 렌더다.
// 실측으로도 /en/learn/* 응답이 cache-control: no-store 였다.
const LOCALES = ['en', 'ko', 'ja'] as const;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const h = await headers();
  const path = h.get('x-pathname') || h.get('x-middleware-request-next-url') || '';
  const seg = path.match(/^\/(en|ko|ja)(?:\/|$)/)?.[1];
  // 로케일 접두어가 없는 경로(루트 리다이렉트 전 등)는 기존 동작을 유지한다.
  const lang = (LOCALES as readonly string[]).includes(seg || '') ? (seg as string) : 'en';

  return (
    <html lang={lang} suppressHydrationWarning className={`${inter.variable} ${plusJakarta.variable} ${jetbrainsMono.variable}`}>
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
            // ★ [2026-08-30] 버전을 붙여 등록한다.
            //   예전엔 '/sw.js' 로 등록했고 SW 안의 CACHE_NAME 도 'signum-hq-v1' 고정이라,
            //   배포해도 브라우저가 «같은 SW»로 보고 activate 를 안 돌렸다.
            //   그러면 캐시가 영원히 안 지워지고 **사용자는 옛 JS 를 계속 실행**한다.
            //   (실측: 웹 배포로 고친 지표가 화면에 안 떠서 SW 캐시를 지우니 바로 나왔다)
            //   URL 이 바뀌면 브라우저가 새 SW 로 인식 → install → activate → 옛 캐시 삭제.
            var v = '${process.env.NEXT_PUBLIC_BUILD_STAMP || 'dev'}';
            navigator.serviceWorker.register('/sw.js?v=' + v).then(function(reg){
              // 새 버전이 대기 중이면 즉시 넘긴다 (탭을 다 닫아야 갱신되는 일 방지)
              if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
              reg.addEventListener('updatefound', function(){
                var sw = reg.installing;
                if (!sw) return;
                sw.addEventListener('statechange', function(){
                  if (sw.state === 'installed' && navigator.serviceWorker.controller) {
                    sw.postMessage({ type: 'SKIP_WAITING' });
                  }
                });
              });
            }).catch(function(){});
            // 새 SW 가 제어권을 잡으면 한 번만 새로고침 — 옛 청크로 계속 도는 것을 막는다
            var reloaded = false;
            navigator.serviceWorker.addEventListener('controllerchange', function(){
              if (reloaded) return;
              reloaded = true;
              location.reload();
            });
          }
        `}</Script>
      </body>
    </html>
  );
}
