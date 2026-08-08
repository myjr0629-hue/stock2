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
    // `wv` is an ANDROID-only UA token and iOS WKWebView adds nothing of its own,
    // so UA matching left iOS unprotected: whenever the iOS app reached `/` or a
    // bare `/{locale}` it was served the marketing WEBSITE instead of the app
    // (Android was correctly redirected — verified against production). iOS gives
    // no way to tell a WKWebView from Safari by UA, which is exactly why the shell
    // sets the `sig_native` cookie (NativeAppProvider, native-only). Use it here so
    // iOS behaves like Android. Web visitors never have this cookie — the WebView
    // cookie jar is separate from Safari's — so the website is untouched.
    const ua = request.headers.get('user-agent') || '';
    const pathname = request.nextUrl.pathname;
    const isNativeWebView = ua.includes('wv') || ua.includes('com.signumhq.app')
        || request.cookies.get('sig_native')?.value === '1';
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
    // `app$`/`app-uc$`/`app-wim$` = store smart links (src/app/{app,app-uc,app-wim}/route.ts) — must bypass i18n locale rewriting
    matcher: ['/((?!api|app$|app-uc$|app-wim$|_next|_vercel|auth|marketing|templates|.*\\..*).*)' , '/']
};
