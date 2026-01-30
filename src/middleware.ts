import { type NextRequest, NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { updateSession } from './lib/supabase/middleware';

const intlMiddleware = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
    // First, handle Supabase session refresh
    const supabaseResponse = await updateSession(request);

    // Then, handle i18n routing
    const intlResponse = intlMiddleware(request);

    // Merge cookies from Supabase response to intl response
    supabaseResponse.cookies.getAll().forEach(cookie => {
        intlResponse.cookies.set(cookie.name, cookie.value, cookie);
    });

    return intlResponse;
}

export const config = {
    // Match all pathnames except API, static files, Next.js internals, auth callback
    matcher: ['/((?!api|_next|_vercel|auth|.*\\..*).*)', '/']
};

