import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales, type Locale } from '@/i18n/routing';
import { ConsentGuard } from '@/components/ConsentGuard';
import { AuthGuard } from '@/components/AuthGuard';
import { DeactivationGuard } from '@/components/DeactivationGuard';
import { TierProvider } from '@/contexts/TierContext';
import { WebSocketProvider } from '@/providers/WebSocketProvider';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { StickyFoundingBar } from '@/components/landing/StickyFoundingBar';
import { Footer } from '@/components/Footer';
import { BottomNav } from '@/components/mobile/BottomNav';
import { CustomTickerBar } from '@/components/CustomTickerBar';
import { AdminVisitorWidget } from '@/components/admin/AdminVisitorWidget';

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

    return (
        <NextIntlClientProvider messages={messages}>
            <div lang={locale} className={`flex flex-col min-h-screen ${locale === 'en' ? 'font-jakarta' : 'font-body'}`}>
                <ConsentGuard>
                    <TierProvider>
                        <AuthGuard>
                            <DeactivationGuard>
                                {/* Sticky header wrapper — nav + ticker bar persist across page transitions */}
                                <div className="sticky top-0 z-50">
                                    <LandingHeader />
                                    <CustomTickerBar />
                                </div>
                                <WebSocketProvider>
                                    {children}
                                </WebSocketProvider>
                                <Footer />
                                <BottomNav />
                                <AdminVisitorWidget />
                                <StickyFoundingBar />
                            </DeactivationGuard>
                        </AuthGuard>
                    </TierProvider>
                </ConsentGuard>
            </div>
        </NextIntlClientProvider>
    );
}
