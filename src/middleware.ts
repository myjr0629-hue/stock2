import { type NextRequest, NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { updateSession } from './lib/supabase/middleware';

const intlMiddleware = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
    // Pass request URL/pathname in custom headers so that Server Components can read them
    request.headers.set('x-url', request.url);
    request.headers.set('x-pathname', request.nextUrl.pathname);

    // ── Native WebView redirect: prevent landing page flash on app startup ──
    const ua = request.headers.get('user-agent') || '';
    const pathname = request.nextUrl.pathname;
    const isNativeWebView = ua.includes('wv') || ua.includes('com.signumhq.app');
    const isRootOrLocaleOnly = pathname === '/' || /^\/(ko|en|ja)$/.test(pathname);

    if (isNativeWebView && isRootOrLocaleOnly) {
      const locale = pathname === '/' ? 'en' : pathname.replace('/', '');
      return NextResponse.redirect(new URL(`/${locale}/app-view/dash`, request.url));
    }

    // First, handle Supabase session refresh
    const supabaseResponse = await updateSession(request);

    // Then, handle i18n routing
    const intlResponse = intlMiddleware(request);

    // Merge cookies from Supabase response to intl response
    supabaseResponse.cookies.getAll().forEach(cookie => {
        intlResponse.cookies.set(cookie.name, cookie.value, cookie);
    });

    // Also set response headers to ensure propagation
    intlResponse.headers.set('x-url', request.url);
    intlResponse.headers.set('x-pathname', request.nextUrl.pathname);

    return intlResponse;
}

export const config = {
    // Match all pathnames except API, static files, Next.js internals, auth callback, templates
    // `app$` = /app store smart link (src/app/app/route.ts) — must bypass i18n locale rewriting
    matcher: ['/((?!api|app$|_next|_vercel|auth|marketing|templates|.*\\..*).*)' , '/']
};
