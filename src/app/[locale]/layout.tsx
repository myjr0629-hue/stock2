import { headers } from 'next/headers';
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
    const messages = await getMessages();

    // SERVER-SIDE MOBILE DETECTION (Absolute DOM Bifurcation)
    // Avoids hydration mismatch and heavy desktop CSS fetching on mobile.
    const headersList = await headers();
    const userAgent = headersList.get('user-agent') || '';
    const isMobileDevice = /iPhone|iPad|iPod|Android|Mobile/i.test(userAgent);

    // [APP-VIEW DETECT] 앱 전용 뷰에서는 모든 웹용 헤더/푸터 및 불필요한 레이아웃 요소를 감추어 모바일 화면을 순수 보장
    const nextUrl = headersList.get('x-middleware-request-next-url') || '';
    const referer = headersList.get('referer') || '';
    const customPathname = headersList.get('x-pathname') || '';
    const isAppView = nextUrl.includes('/app-view') || referer.includes('/app-view') || customPathname.includes('/app-view') || userAgent.includes('Capacitor');

    return (
        <NextIntlClientProvider messages={messages}>
            <div lang={locale} className={`flex flex-col min-h-screen ${locale === 'en' ? 'font-jakarta' : 'font-body'} ${isAppView ? 'is-app-view' : ''}`}>
                <ConsentGuard>
                    <TierProvider>
                        <DeviceProvider isMobile={isMobileDevice}>
                        <AuthGuard>
                            <DeactivationGuard>
                                
                                {/* 1. HEADER (Bifurcated) */}
                                {!isAppView && (
                                    isMobileDevice ? (
                                        <MobileHeader />
                                    ) : (
                                        <div className="sticky top-0 z-50">
                                            <LandingHeader />
                                            <CustomTickerBar />
                                        </div>
                                    )
                                )}

                                {/* 2. MAIN CONTENT */}
                                <WebSocketProvider>
                                    <NativeAppProvider>
                                        <NativePullToRefresh>
                                            {children}
                                        </NativePullToRefresh>
                                    </NativeAppProvider>
                                </WebSocketProvider>

                                {/* 3. FOOTER / BOTTOM NAV (Bifurcated) */}
                                {!isAppView && (
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
