import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { safeNext, NEXT_COOKIE, nextFromCookieValue } from '@/lib/auth/safeNext'

// ★ 2026-09-13: 여기가 «아펙스»였다. 네이티브 앱의 WebView 는 www.signumhq.com 만
//   자기 호스트로 알기 때문에, 로그인 콜백이 아펙스로 리다이렉트하는 순간
//   Capacitor 가 그 이동을 시스템 브라우저로 넘겼다(앱은 그대로, 크롬만 따로 뜸).
//   아펙스는 www 로 301 되지만, 그 «한 번의 홉»이 이미 앱 밖이다.
const CANONICAL_ORIGIN = 'https://www.signumhq.com';

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    // 2026-09-30: next 를 검사한다 — 예전엔 `${origin}${next}` 로 그대로 붙여 next="@evil.com" 이면 외부로 나갔다(열린 리다이렉트).
    //   쿼리가 없으면 로그인 화면이 남긴 짧은 쿠키(shq_next — 예: 웹 결제 이어가기)를 본다. 둘 다 없으면 예전처럼 /ko.
    const next = safeNext(searchParams.get('next'), '') || nextFromCookieValue((await cookies()).get(NEXT_COOKIE)?.value) || '/ko'

    // Use canonical domain in production, fallback to request origin for localhost
    const finalOrigin = origin.includes('localhost') ? origin : CANONICAL_ORIGIN;

    if (code) {
        const supabase = await createClient()
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
            const response = NextResponse.redirect(`${finalOrigin}${next}`)
            // Forward session cookies to the redirect response
            const cookieStore = await cookies()
            cookieStore.getAll().forEach((cookie) => {
                response.cookies.set(cookie.name, cookie.value, cookie)
            })
            response.cookies.set(NEXT_COOKIE, '', { path: '/', maxAge: 0 }) // 한 번 쓰고 지운다
            return response
        }
    }

    // Return the user to an error page with instructions
    const failed = NextResponse.redirect(`${finalOrigin}/ko/login?error=auth_error`)
    failed.cookies.set(NEXT_COOKIE, '', { path: '/', maxAge: 0 })
    return failed
}
