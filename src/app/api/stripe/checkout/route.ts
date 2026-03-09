import { NextRequest, NextResponse } from 'next/server';
import { getStripe, STRIPE_PRICES } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';

// Supabase service-role client for reading user data
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { plan, billing, locale } = body as {
            plan: 'pro' | 'elite';
            billing: 'monthly' | 'yearly';
            locale: string;
        };

        // Validate plan + billing
        const priceId = STRIPE_PRICES[plan]?.[billing];
        if (!priceId) {
            return NextResponse.json({ error: 'Invalid plan or billing' }, { status: 400 });
        }

        // Try to get current user from auth header (cookie-based)
        const authHeader = req.headers.get('cookie') || '';
        let userId: string | undefined;
        let userEmail: string | undefined;

        // Extract Supabase token from cookies
        const tokenMatch = authHeader.match(/sb-[^=]+-auth-token[^=]*=([^;]+)/);
        if (tokenMatch) {
            try {
                const tokenData = JSON.parse(decodeURIComponent(tokenMatch[1]));
                const accessToken = Array.isArray(tokenData) ? tokenData[0] : tokenData?.access_token;
                if (accessToken) {
                    const { data: { user } } = await supabase.auth.getUser(accessToken);
                    if (user) {
                        userId = user.id;
                        userEmail = user.email;
                    }
                }
            } catch {
                // Token parsing failed — continue without user
            }
        }

        // Build Checkout Session params
        const origin = req.headers.get('origin') || 'https://signumhq.com';

        const sessionParams: Record<string, any> = {
            mode: 'subscription',
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${origin}/${locale}/pricing?session_id={CHECKOUT_SESSION_ID}&success=true`,
            cancel_url: `${origin}/${locale}/pricing`,
            metadata: {
                plan,
                billing,
                supabase_user_id: userId || '',
            },
            subscription_data: {
                metadata: {
                    plan,
                    billing,
                    supabase_user_id: userId || '',
                },
            },
            allow_promotion_codes: true,
        };

        // Pre-fill email if known
        if (userEmail) {
            sessionParams.customer_email = userEmail;
        }

        const session = await getStripe().checkout.sessions.create(sessionParams);

        return NextResponse.json({ url: session.url });
    } catch (err: any) {
        console.error('[Stripe Checkout] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
