import { NextRequest, NextResponse } from 'next/server';
import { getStripe, STRIPE_PRICES } from '@/lib/stripe';
import { createClient } from '@/lib/supabase/server';
import { checkoutResumePath, loginPathWithNext } from '@/lib/auth/safeNext';

// ============================================================================
// 웹 결제 세션 (2026-09-30 수리: 결제가 계정에 연결되지 않던 결함)
// ----------------------------------------------------------------------------
// 예전: 로그인 없이도 세션을 만들었고 metadata.supabase_user_id 가 빈 값이었다 → 결제해도
//   웹훅이 «Missing metadata»로 끝나 웹 유료 등급이 붙지 않았다(돈은 받고 등급은 없음).
// 이제:
//   POST(요금 페이지 버튼) — 로그인 안 했으면 { url: 로그인 화면(next=결제 이어가기) } 를 준다.
//     요금 페이지의 기존 코드가 `window.location.href = data.url` 이라 화면 코드는 그대로 둔다.
//   GET(로그인 뒤 next 목적지) — 로그인돼 있으면 세션을 만들어 Stripe 결제 화면으로 303, 아니면 다시 로그인으로.
//     이미 PRO·ELITE 면 새 결제 대신 요금 페이지로(이중 결제 방지).
//   세션에 계정 ID 를 싣는다: client_reference_id + metadata.supabase_user_id(+ 구독 metadata).
//   웹훅은 client_reference_id → metadata 순으로 계정을 찾아 등급을 붙인다(webhook/route.ts).
// 가격·등급·요금 페이지는 바꾸지 않았다(대표 9/30 «웹은 웹 앱은 앱이다»).
// ============================================================================

type Plan = 'pro' | 'elite';
type Billing = 'monthly' | 'yearly';

function normLocale(l: string | null | undefined): 'ko' | 'en' | 'ja' {
    return l === 'ko' || l === 'ja' ? l : 'en';
}

function priceIdFor(plan: unknown, billing: unknown): string | null {
    // 목록에 있는 값만 — STRIPE_PRICES['constructor']['name'] 같은 프로토타입 값이 가격 ID 로 새지 않게
    if ((plan !== 'pro' && plan !== 'elite') || (billing !== 'monthly' && billing !== 'yearly')) return null;
    return STRIPE_PRICES[plan][billing] || null;
}

async function currentUser() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return { supabase, user: user && user.id ? user : null };
}

/** 로그인 뒤 이어가기에서 이미 PRO·ELITE 인 계정이면 새 결제를 만들지 않는다(이중 결제 방지) → 요금 페이지(업·다운그레이드 화면).
 *  조회가 실패하면 막지 않는다(예전 동작 = 확인 없이 결제). */
async function alreadyPaid(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<boolean> {
    try {
        const { data, error } = await supabase.from('user_profiles').select('tier').eq('user_id', userId).maybeSingle();
        if (error || !data) return false;
        return data.tier === 'pro' || data.tier === 'elite';
    } catch {
        return false;
    }
}

async function createSession(args: { plan: Plan; billing: Billing; locale: 'ko' | 'en' | 'ja'; priceId: string; userId: string; email?: string | null; origin: string }) {
    const { plan, billing, locale, priceId, userId, email, origin } = args;
    const sessionParams: Record<string, any> = {
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/${locale}/pricing?session_id={CHECKOUT_SESSION_ID}&success=true`,
        cancel_url: `${origin}/${locale}/pricing`,
        locale,
        // 계정 연결 — 웹훅이 이 값으로 user_profiles.tier 를 붙인다
        client_reference_id: userId,
        metadata: { plan, billing, supabase_user_id: userId },
        subscription_data: { metadata: { plan, billing, supabase_user_id: userId } },
        allow_promotion_codes: true,
    };
    if (email) sessionParams.customer_email = email;
    return getStripe().checkout.sessions.create(sessionParams);
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { plan, billing } = body as { plan: Plan; billing: Billing; locale: string };
        const locale = normLocale(body?.locale);

        const priceId = priceIdFor(plan, billing);
        if (!priceId) {
            return NextResponse.json({ error: 'Invalid plan or billing' }, { status: 400 });
        }

        const { user } = await currentUser();
        if (!user) {
            // 결제 전에 로그인 — 끝나면 GET 으로 돌아와 결제를 이어간다
            return NextResponse.json({
                url: loginPathWithNext(locale, checkoutResumePath(plan, billing, locale)),
                loginRequired: true,
            });
        }

        const origin = req.headers.get('origin') || 'https://signumhq.com';
        const session = await createSession({ plan, billing, locale, priceId, userId: user.id, email: user.email, origin });
        return NextResponse.json({ url: session.url });
    } catch (err: any) {
        console.error('[Stripe Checkout] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

/** 로그인 뒤 목적지(next) — 결제를 이어간다. 브라우저 이동이라 JSON 이 아니라 리다이렉트로 답한다. */
export async function GET(req: NextRequest) {
    const q = req.nextUrl.searchParams;
    const plan = q.get('plan') as Plan;
    const billing = q.get('billing') as Billing;
    const locale = normLocale(q.get('locale'));
    const origin = req.nextUrl.origin;
    const noStore = { headers: { 'Cache-Control': 'no-store' } };

    const priceId = priceIdFor(plan, billing);
    if (!priceId) return NextResponse.redirect(`${origin}/${locale}/pricing`, { status: 303, ...noStore });

    try {
        const { supabase, user } = await currentUser();
        if (!user) {
            return NextResponse.redirect(`${origin}${loginPathWithNext(locale, checkoutResumePath(plan, billing, locale))}`, { status: 303, ...noStore });
        }
        if (await alreadyPaid(supabase, user.id)) {
            return NextResponse.redirect(`${origin}/${locale}/pricing`, { status: 303, ...noStore });
        }
        const session = await createSession({ plan, billing, locale, priceId, userId: user.id, email: user.email, origin });
        if (!session.url) throw new Error('no session url');
        return NextResponse.redirect(session.url, { status: 303, ...noStore });
    } catch (err: any) {
        console.error('[Stripe Checkout] Resume error:', err.message);
        return NextResponse.redirect(`${origin}/${locale}/pricing?checkout_error=1`, { status: 303, ...noStore });
    }
}
