import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const CANONICAL_ORIGIN = 'https://signumhq.com';

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
