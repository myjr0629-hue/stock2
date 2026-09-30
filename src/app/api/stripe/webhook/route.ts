import { NextRequest, NextResponse } from 'next/server';
import { getStripe, planFromPriceId } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';

// Supabase service-role — bypasses RLS for tier upsert
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// Disable Next.js body parsing — Stripe needs raw body for signature verification
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    // 서명 검사는 «항상» 한다(9/30 운영 실측: stripe-signature 헤더만 빼면 비밀값이 있어도 검사를 건너뛰어
    //   서명 없는 가짜 이벤트가 200 으로 처리됐다 — 누구나 등급을 받거나 남의 구독을 끊을 수 있었다).
    //   비밀값이 없거나 서명 헤더가 없으면 처리하지 않는다. 진짜 Stripe 이벤트는 늘 서명 헤더를 싣는다.
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
        console.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET 없음 — 서명 없는 이벤트는 처리하지 않는다');
        return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
    }
    if (!signature) {
        return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 });
    }
    let event;

    try {
        event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
        console.error('[Stripe Webhook] Signature verification failed:', err.message);
        return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 });
    }

    console.log(`[Stripe Webhook] Event: ${event.type} (${event.id})`);

    try {
        switch (event.type) {
            // ── Checkout completed — user just subscribed ──
            case 'checkout.session.completed': {
                const session = event.data.object;
                // 계정 연결: client_reference_id(2026-09-30 결제 세션부터 실림) → 예전 metadata 순
                const supabaseUserId = session.client_reference_id || session.metadata?.supabase_user_id;
                const plan = session.metadata?.plan;
                const stripeCustomerId = session.customer;
                const subscriptionId = session.subscription;

                if (supabaseUserId && plan) {
                    await upsertTier(supabaseUserId, plan, stripeCustomerId, subscriptionId);
                    console.log(`[Stripe Webhook] ✅ Tier set: ${supabaseUserId} → ${plan}`);
                } else {
                    console.warn('[Stripe Webhook] Missing metadata:', { supabaseUserId, plan });
                }
                break;
            }

            // ── Subscription updated (upgrade/downgrade) ──
            case 'customer.subscription.updated': {
                const subscription = event.data.object;
                const supabaseUserId = subscription.metadata?.supabase_user_id;
                const priceId = subscription.items?.data?.[0]?.price?.id;
                const stripeCustomerId = subscription.customer;

                if (supabaseUserId && priceId) {
                    const planInfo = planFromPriceId(priceId);
                    if (planInfo) {
                        await upsertTier(supabaseUserId, planInfo.plan, stripeCustomerId, subscription.id);
                        console.log(`[Stripe Webhook] ✅ Tier updated: ${supabaseUserId} → ${planInfo.plan}`);
                    }
                }
                break;
            }

            // ── Subscription cancelled/expired ──
            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                const supabaseUserId = subscription.metadata?.supabase_user_id;

                if (supabaseUserId) {
                    await upsertTier(supabaseUserId, 'free', null, null);
                    console.log(`[Stripe Webhook] ✅ Tier revoked: ${supabaseUserId} → free`);
                }
                break;
            }

            default:
                // Unhandled event type — acknowledge receipt
                break;
        }
    } catch (err: any) {
        console.error(`[Stripe Webhook] Error handling ${event.type}:`, err.message);
        return NextResponse.json({ error: 'Webhook handler error' }, { status: 500 });
    }

    return NextResponse.json({ received: true });
}

// ── Helper: upsert user_profiles.tier ──
async function upsertTier(
    userId: string,
    tier: string,
    stripeCustomerId: string | null,
    stripeSubscriptionId: string | null,
) {
    const { error } = await supabaseAdmin
        .from('user_profiles')
        .upsert(
            {
                user_id: userId,
                tier,
                stripe_customer_id: stripeCustomerId || undefined,
                stripe_subscription_id: stripeSubscriptionId || undefined,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' },
        );

    if (error) {
        console.error('[Stripe Webhook] Supabase upsert error:', error);
        throw error;
    }
}
