import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

// ★ 2026-09-13: 여기가 «아펙스»였다. 네이티브 앱의 WebView 는 www.signumhq.com 만
//   자기 호스트로 알기 때문에, 로그인 콜백이 아펙스로 리다이렉트하는 순간
//   Capacitor 가 그 이동을 시스템 브라우저로 넘겼다(앱은 그대로, 크롬만 따로 뜸).
//   아펙스는 www 로 301 되지만, 그 «한 번의 홉»이 이미 앱 밖이다.
const CANONICAL_ORIGIN = 'https://www.signumhq.com';

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/ko'

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
            return response
        }
    }

    // Return the user to an error page with instructions
    return NextResponse.redirect(`${finalOrigin}/ko/login?error=auth_error`)
}
