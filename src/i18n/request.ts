import { getRequestConfig } from 'next-intl/server';
import { routing, locales, type Locale } from './routing';
// i18n config — Guardian guide locale keys updated 2026-02-21

export default getRequestConfig(async ({ requestLocale }) => {
    let locale = await requestLocale;

    // Validate locale
    if (!locale || !locales.includes(locale as Locale)) {
        locale = routing.defaultLocale;
    }

    return {
        locale,
        messages: (await import(`../messages/${locale}.json`)).default
    };
});
