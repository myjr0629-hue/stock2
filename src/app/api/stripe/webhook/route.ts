import { NextRequest, NextResponse } from 'next/server';
import { stripe, planFromPriceId } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';

// Supabase service-role — use anon key for now (RLS should allow user_profiles upsert)
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// Disable Next.js body parsing — Stripe needs raw body for signature verification
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    // If webhook secret is configured, verify signature
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event;

    try {
        if (webhookSecret && signature) {
            event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
        } else {
            // During initial setup (no webhook secret yet), parse JSON directly
            event = JSON.parse(body);
            console.warn('[Stripe Webhook] ⚠️ No webhook secret configured — skipping signature verification');
        }
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
                const supabaseUserId = session.metadata?.supabase_user_id;
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
