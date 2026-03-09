import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { locale } = body as { locale: string };

        // Get current user from auth cookie
        const authHeader = req.headers.get('cookie') || '';
        const tokenMatch = authHeader.match(/sb-[^=]+-auth-token[^=]*=([^;]+)/);

        if (!tokenMatch) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        let userEmail: string | undefined;
        try {
            const tokenData = JSON.parse(decodeURIComponent(tokenMatch[1]));
            const accessToken = Array.isArray(tokenData) ? tokenData[0] : tokenData?.access_token;
            if (accessToken) {
                const { data: { user } } = await supabase.auth.getUser(accessToken);
                userEmail = user?.email;
            }
        } catch {
            return NextResponse.json({ error: 'Auth token invalid' }, { status: 401 });
        }

        if (!userEmail) {
            return NextResponse.json({ error: 'User email not found' }, { status: 401 });
        }

        // Find Stripe customer by email
        const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
        if (customers.data.length === 0) {
            return NextResponse.json({ error: 'No Stripe customer found' }, { status: 404 });
        }

        const origin = req.headers.get('origin') || 'https://signumhq.com';

        // Create Customer Portal session
        const portalSession = await stripe.billingPortal.sessions.create({
            customer: customers.data[0].id,
            return_url: `${origin}/${locale}/settings`,
        });

        return NextResponse.json({ url: portalSession.url });
    } catch (err: any) {
        console.error('[Stripe Portal] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
