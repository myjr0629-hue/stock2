import { NextRequest, NextResponse } from 'next/server';
import { getStripe, STRIPE_PRICES } from '@/lib/stripe';
import { createClient } from '@/lib/supabase/server';

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

        // Use Supabase SSR server client (handles chunked cookies automatically)
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        const userId = user?.id;
        const userEmail = user?.email;

        // Build Checkout Session params
        const origin = req.headers.get('origin') || 'https://signumhq.com';

        const stripeLocale = locale === 'ko' ? 'ko' : locale === 'ja' ? 'ja' : 'en';

        const sessionParams: Record<string, any> = {
            mode: 'subscription',
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${origin}/${locale}/pricing?session_id={CHECKOUT_SESSION_ID}&success=true`,
            cancel_url: `${origin}/${locale}/pricing`,
            locale: stripeLocale,
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
