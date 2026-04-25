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

    return (
        <NextIntlClientProvider messages={messages}>
            <div lang={locale} className={`flex flex-col min-h-screen ${locale === 'en' ? 'font-jakarta' : 'font-body'}`}>
                <ConsentGuard>
                    <TierProvider>
                        <DeviceProvider isMobile={isMobileDevice}>
                        <AuthGuard>
                            <DeactivationGuard>
                                
                                {/* 1. HEADER (Bifurcated) */}
                                {isMobileDevice ? (
                                    <MobileHeader />
                                ) : (
                                    <div className="sticky top-0 z-50">
                                        <LandingHeader />
                                        <CustomTickerBar />
                                    </div>
                                )}

                                {/* 2. MAIN CONTENT */}
                                <WebSocketProvider>
                                    {children}
                                </WebSocketProvider>

                                {/* 3. FOOTER / BOTTOM NAV (Bifurcated) */}
                                {isMobileDevice ? (
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
