import { type NextRequest, NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing, locales, defaultLocale } from './i18n/routing';
import { shouldMakeLocaleRedirectPermanent } from './lib/seo/localeRedirect';
import { updateSession } from './lib/supabase/middleware';
import { nativeRootRedirectPath } from './lib/native/nativeRootRedirect';

const intlMiddleware = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
    // Pass request URL/pathname in custom headers so that Server Components can read them
    request.headers.set('x-url', request.url);
    request.headers.set('x-pathname', request.nextUrl.pathname);

    // ── Native WebView redirect: prevent landing page flash when OUR app reaches `/` or `/{locale}` ──
    // Decided ONLY by markers unique to our shells (sig_native cookie set by NativeAppProvider,
    // X-Requested-With: com.signumhq.*, or a com.signumhq. UA token) — never by the generic
    // Android WebView `wv` token. ★ 2026-10-04: `wv` sent every Android in-app browser
    // (KakaoTalk, Instagram, NAVER, LINE, Facebook, Threads — real people) to /app-view/dash,
    // so they never saw the home page or the install buttons. See lib/native/nativeRootRedirect.
    const pathname = request.nextUrl.pathname;
    const nativeTarget = nativeRootRedirectPath(pathname, {
        userAgent: request.headers.get('user-agent'),
        requestedWith: request.headers.get('x-requested-with'),
        nativeCookie: request.cookies.get('sig_native')?.value,
    });
    if (nativeTarget) {
      return NextResponse.redirect(new URL(nativeTarget, request.url));
    }

    // First, handle Supabase session refresh
    const supabaseResponse = await updateSession(request);

    // Then, handle i18n routing
    const intlResponse = intlMiddleware(request);

    // 언어 선호가 없는 요청(크롤러)의 «언어 없는 주소 → /en/…» 이동은 영구(308)로 — 구글이 두 주소를 따로 색인하지 않게(lib/seo/localeRedirect)
    if (shouldMakeLocaleRedirectPermanent({
        status: intlResponse.status,
        location: intlResponse.headers.get('location'),
        pathname,
        acceptLanguage: request.headers.get('accept-language'),
        hasLocaleCookie: request.cookies.has('NEXT_LOCALE'),
        locales,
        defaultLocale,
    })) {
        const permanent = NextResponse.redirect(new URL(intlResponse.headers.get('location')!, request.url), 308);
        permanent.headers.set('cache-control', 'public, max-age=0, must-revalidate');
        return permanent;
    }

    // Merge cookies from Supabase response to intl response
    supabaseResponse.cookies.getAll().forEach(cookie => {
        intlResponse.cookies.set(cookie.name, cookie.value, cookie);
    });

    // Also set response headers to ensure propagation
    intlResponse.headers.set('x-url', request.url);
    intlResponse.headers.set('x-pathname', request.nextUrl.pathname);

    // ★ [2026-09-10] 사용자 화면에서 Vercel Toolbar 를 지운다.
    //
    //   대표: 「완성품 앱에서 이런것이 나온다는것이 말이되냐?」 — 맞는 말이다.
    //   9/7 iOS 빌드에 프리뷰 주소가 «x-vercel-set-bypass-cookie=true» 와 함께 박혀 나갔다.
    //   그 파라미터가 _vercel_jwt 쿠키를 심고, 그 쿠키가 개발자용 Toolbar 를 띄운다.
    //   프로젝트 보호를 껐으므로 새 설치엔 더 이상 안 심긴다. 그런데 **이미 설치된 폰엔
    //   쿠키가 남아** 앱을 지웠다 깔지 않는 한 계속 뜬다. 그래서 서버가 지워 준다.
    //   (HttpOnly 라 앱 쪽 자바스크립트로는 못 지운다 — 응답 헤더로만 지워진다)
    if (request.cookies.has('_vercel_jwt')) {
        for (const domain of [undefined, request.nextUrl.hostname]) {
            intlResponse.cookies.set({
                name: '_vercel_jwt', value: '', path: '/', maxAge: 0,
                ...(domain ? { domain } : {}),
            });
        }
    }

    return intlResponse;
}

export const config = {
    // Match all pathnames except API, static files, Next.js internals, auth callback, templates
    // `app$`/`app-uc$`/`app-wim$` = store smart links (src/app/{app,app-uc,app-wim}/route.ts) — must bypass i18n locale rewriting
    matcher: ['/((?!api|app$|app-uc$|app-wim$|_next|_vercel|auth|marketing|templates|.*\\..*).*)' , '/']
};
