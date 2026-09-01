import { headers, cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales, type Locale } from '@/i18n/routing';
import { ConsentGuard } from '@/components/ConsentGuard';
import { AuthGuard } from '@/components/AuthGuard';
import { DeactivationGuard } from '@/components/DeactivationGuard';
import { TierProvider } from '@/contexts/TierContext';
import { DeviceProvider } from '@/contexts/DeviceContext';
import { WebSocketProvider } from '@/providers/WebSocketProvider';

// Desktop Components
import { LandingHeader } from '@/components/landing/LandingHeader';
import { StickyFoundingBar } from '@/components/landing/StickyFoundingBar';
import { Footer } from '@/components/Footer';
import { CustomTickerBar } from '@/components/CustomTickerBar';
import { AdminVisitorWidget } from '@/components/admin/AdminVisitorWidget';

// Mobile Components
import { MobileHeader } from '@/components/mobile/MobileHeader';
import { MobileBottomNav } from '@/components/mobile/MobileBottomNav';
import { MobileLegalFooter } from '@/components/mobile/MobileLegalFooter';

// Native App (Capacitor — no-op on web)
import { NativeAppProvider } from '@/components/native/NativeAppProvider';
import { NativePullToRefresh } from '@/components/native/NativePullToRefresh';
import { ChunkErrorRecovery } from '@/components/ChunkErrorRecovery';

// ★ 로케일 홈의 메타데이터 (2026-08-22 실측으로 추가)
//   루트 layout 의 `title: "SIGNUM HQ"` 가 전 페이지에 그대로 깔려 있었다.
//   사이트에서 «권위가 가장 높은» 홈이 아무 검색어도 겨냥하지 않고 있었고,
//   /how-it-works 와 /pricing 은 홈과 제목·설명이 «완전히 중복»이라
//   구글이 저품질 중복으로 볼 수 있었다.
//   GSC 상위 질의(dark pool / max pain)를 홈 제목에 넣는다.
//   page.tsx 가 'use client' 라 메타데이터를 export 할 수 없어 레이아웃에서 준다(UC 와 같은 패턴).
const HOME_META: Record<string, { title: string; desc: string }> = {
  ko: {
    title: 'SIGNUM HQ — 미국주식 다크풀·맥스페인·옵션 플로우',
    desc: '기관이 실제로 움직인 자리를 봅니다. 다크풀 비중, 맥스페인, 감마 노출, 옵션 플로우를 매일 무료로. 투자 자문이 아닌 정보 제공입니다.',
  },
  en: {
    title: 'SIGNUM HQ — Dark Pool, Max Pain & Options Flow for US Stocks',
    desc: 'See where institutional money actually moved. Dark pool share, max pain, gamma exposure and options flow — free, refreshed every US session. Information, not investment advice.',
  },
  ja: {
    title: 'SIGNUM HQ — 米国株のダークプール・マックスペイン・オプションフロー',
    desc: '機関投資家が実際に動いた場所を見る。ダークプール比率、マックスペイン、ガンマ、オプションフローを毎日無料で。投資助言ではなく情報提供です。',
  },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const m = HOME_META[locale] || HOME_META.en;
  return {
    title: m.title,
    description: m.desc,
    // RSS 자동발견 — 이 <link> 가 없으면 Feedly 등 리더가 URL 을 직접 쳐야만 찾는다.
    // 즉 피드를 만들어도 «발견»되지 않는다.
    alternates: {
      types: { 'application/rss+xml': [{ url: `/${locale}/feed.xml`, title: m.title }] },
    },
  };
}


export function generateStaticParams() {
    return locales.map((locale) => ({ locale }));
}

type Props = {
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({ children, params }: Props) {
    const { locale } = await params;

    // Validate locale
    if (!locales.includes(locale as Locale)) {
        notFound();
    }

    // Load messages for the current locale
    const allMessages = await getMessages();

    // ⚠️ [2026-09-01] 클라이언트로 «사전 전체»를 넘기고 있었다.
    //
    //   실측: /en/flow/NVDA 의 HTML 372KB 중 **332KB(90%)가 이 플라이트 데이터**였다.
    //   실제 마크업은 32KB 뿐이다. 그리고 이 보일러플레이트는 티커 3,585개
    //   페이지에 «똑같이» 실린다 → 구글에겐 전부 중복 페이지로 보이고,
    //   크롤 예산도 거기서 탄다(색인 531/960 · 중복 156 의 유력한 원인).
    //
    //   아래 묶음들은 how-it-works 페이지에서만 쓰이고 그 페이지들은 전부
    //   **서버 컴포넌트**(getTranslations)다 — 클라이언트 프로바이더에 넣을
    //   이유가 없다. 73개 클라이언트 파일이 쓰는 네임스페이스를 전수 조사해
    //   확인했다.
    //
    //   ⚠️ 새 클라이언트 컴포넌트가 이 중 하나를 쓰게 되면 «조용히» 빈 문자열이
    //      된다. 그때는 여기서 빼면 된다.
    const SERVER_ONLY_NAMESPACES = [
        'commandGuide', 'flowGuide', 'guardianGuide', 'intelGuide',
        'dashboardGuide', 'portfolioGuide', 'watchlistGuide',
        'flowRadarGuide', 'howItWorks',
    ];
    //   한 걸음 더: «순수 SEO 경로»(티커 3,585개 · 학습 · 다크풀 등)는 앱 UI
    //   컴포넌트를 아예 렌더하지 않는다. 그 경로에서는 앱 전용 묶음도 뺀다.
    //   ⚠️ `/flow` (티커 없음)는 앱 화면이므로 «제외하지 않는다» —
    //      `/flow/NVDA` 처럼 티커가 붙은 것만 SEO 경로다.
    const seoPath = await (async () => {
        const h = await headers();
        return h.get('x-pathname') || '';
    })();
    const isSeoRoute = /^\/(?:en|ko|ja)?\/?(?:flow\/[A-Z][A-Z0-9.\-]{0,6}|learn|dark-pool|options-flow|tickers|how-it-works)(?:\/|$)/.test(seoPath);
    const APP_ONLY_NAMESPACES = [
        'flowRadarUI', 'sectorSession', 'dashboard', 'signalCoreV3',
        'guardian', 'intel', 'alphaReport', 'tacticalReport', 'command', 'pricing',
    ];
    const dropped = new Set([
        ...SERVER_ONLY_NAMESPACES,
        ...(isSeoRoute ? APP_ONLY_NAMESPACES : []),
    ]);
    const messages = Object.fromEntries(
        Object.entries(allMessages as Record<string, unknown>).filter(([k]) => !dropped.has(k)),
    );

    // SERVER-SIDE MOBILE DETECTION (Absolute DOM Bifurcation)
    // Avoids hydration mismatch and heavy desktop CSS fetching on mobile.
    const headersList = await headers();
    const userAgent = headersList.get('user-agent') || '';
    const isMobileDevice = /iPhone|iPad|iPod|Android|Mobile/i.test(userAgent);

    // [APP-VIEW DETECT] 앱 전용 뷰에서는 모든 웹용 헤더/푸터 및 불필요한 레이아웃 요소를 감추어 모바일 화면을 순수 보장
    const nextUrl = headersList.get('x-middleware-request-next-url') || '';
    const referer = headersList.get('referer') || '';
    const customPathname = headersList.get('x-pathname') || '';
    // The native SIGNUM shell sets a `sig_native` cookie (NativeAppProvider). It is a
    // stable, header-independent app signal that survives client (RSC) re-renders —
    // critical because the iOS WKWebView UA lacks "Capacitor", so a cross-locale
    // push deep-link re-render could otherwise re-evaluate isAppView from ambiguous
    // headers and flash the web site chrome. Web users never set this cookie.
    const nativeCookie = (await cookies()).get('sig_native')?.value === '1';
    const isAppView = nextUrl.includes('/app-view') || referer.includes('/app-view') || customPathname.includes('/app-view') || userAgent.includes('Capacitor') || nativeCookie;

    // [UNDERCURRENT PROTO] The spin-off prototype route renders bare (no site
    // header/footer) but must NOT get the is-app-view class (different theme).
    // Pathname-scoped only (no referer matching) — every existing route keeps
    // identical behavior (hideChrome === isAppView for them).
    const isUndercurrent = nextUrl.includes('/undercurrent') || customPathname.includes('/undercurrent');
    // [WIM PROTO] Why'd It Move? — same isolation as Undercurrent (bare shell,
    // own bright theme, no SIGNUM chrome/ad stack). Pathname-scoped only.
    const isWim = nextUrl.includes('/wim') || customPathname.includes('/wim');
    // [RADAR PROTO] 기관 레이더 — same bare isolation (own dark theme).
    const isRadar = nextUrl.includes('/radar') || customPathname.includes('/radar');
    const hideChrome = isAppView || isUndercurrent || isWim || isRadar;

    return (
        <NextIntlClientProvider messages={messages}>
            <div lang={locale} className={`flex flex-col min-h-screen ${locale === 'en' ? 'font-jakarta' : 'font-body'} ${isAppView ? 'is-app-view' : ''}`}>
                <ChunkErrorRecovery />
                <ConsentGuard>
                    <TierProvider>
                        <DeviceProvider isMobile={isMobileDevice}>
                        <AuthGuard>
                            <DeactivationGuard>
                                
                                {/* 1. HEADER (Bifurcated) */}
                                {!hideChrome && (
                                    isMobileDevice ? (
                                        <MobileHeader />
                                    ) : (
                                        <div className="sticky top-0 z-50">
                                            <LandingHeader />
                                            <CustomTickerBar />
                                        </div>
                                    )
                                )}

                                {/* 2. MAIN CONTENT
                                    Undercurrent is a SEPARATE app with its own shell logic
                                    (locale bootstrap, back handling, LIGHT theme, own ad stack).
                                    NativeAppProvider is SIGNUM-app-only — inside the Undercurrent
                                    shell it initialized SIGNUM's ads (surprise ATT prompt), forced
                                    a dark status bar and double-handled Android back. Skip it. */}
                                <WebSocketProvider>
                                    {isUndercurrent || isWim || isRadar ? (
                                        children
                                    ) : (
                                        <NativeAppProvider>
                                            <NativePullToRefresh>
                                                {children}
                                            </NativePullToRefresh>
                                        </NativeAppProvider>
                                    )}
                                </WebSocketProvider>

                                {/* 3. FOOTER / BOTTOM NAV (Bifurcated) */}
                                {!hideChrome && (
                                    isMobileDevice ? (
                                        <>
                                            <MobileLegalFooter />
                                            <MobileBottomNav />
                                        </>
                                    ) : (
                                        <>
                                            <Footer />
                                            <AdminVisitorWidget />
                                            <StickyFoundingBar />
                                        </>
                                    )
                                )}
                                
                            </DeactivationGuard>
                        </AuthGuard>
                        </DeviceProvider>
                    </TierProvider>
                </ConsentGuard>
            </div>
        </NextIntlClientProvider>
    );
}
