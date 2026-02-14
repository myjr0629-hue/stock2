import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales, type Locale } from '@/i18n/routing';
import { ConsentGuard } from '@/components/ConsentGuard';
import { AuthGuard } from '@/components/AuthGuard';
import { DeactivationGuard } from '@/components/DeactivationGuard';
import { LandingHeader } from '@/components/landing/LandingHeader';

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
            <ConsentGuard>
                <AuthGuard>
                    <DeactivationGuard>
                        <LandingHeader />
                        {children}
                    </DeactivationGuard>
                </AuthGuard>
            </ConsentGuard>
        </NextIntlClientProvider>
    );
}
