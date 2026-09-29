import { NextRequest, NextResponse } from 'next/server';
import { getStripe, STRIPE_PRICES } from '@/lib/stripe';
import { createClient } from '@/lib/supabase/server';

/**
 * 웹 신규 결제는 닫혀 있다(2026-09-30). PRO 결제는 앱(App Store·Google Play)에서만 받는다.
 * 왜: 이 라우트는 로그인 없이도 결제 세션을 만든다(supabase_user_id 빈 값) — 화면에서 버튼을 빼도
 *   직접 호출하면 옛 웹 요금제($49·$79, «유료 전용 지표»)를 살 수 있었다. 9/8 법적 전제와 반대다.
 * 코드는 지우지 않는다 — 다시 열려면 환경변수 STRIPE_WEB_CHECKOUT=on (기존 구독자의 포털·해지·웹훅은 그대로).
 */
const webCheckoutOpen = () => process.env.STRIPE_WEB_CHECKOUT === 'on'; // 라우트 파일은 정해진 이름만 export 할 수 있다

export async function POST(req: NextRequest) {
    if (!webCheckoutOpen()) {
        return NextResponse.json({ error: 'web_checkout_closed', message: 'Subscribe in the SIGNUM HQ app' }, { status: 410 });
    }
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
