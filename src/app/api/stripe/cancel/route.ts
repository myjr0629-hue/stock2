import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const supabaseService = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/**
 * POST /api/stripe/cancel
 * 
 * Sets cancel_at_period_end = true on the user's Stripe subscription.
 * The subscription remains active until the end of the current billing period.
 * Stripe webhook (customer.subscription.deleted) will auto-downgrade to 'free'.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { reason, reasonDetail } = body as {
            reason?: string;
            reasonDetail?: string;
        };

        const supabase = await createClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { data: profile } = await supabaseService
            .from('user_profiles')
            .select('stripe_subscription_id, tier')
            .eq('user_id', user.id)
            .maybeSingle();

        if (!profile?.stripe_subscription_id) {
            return NextResponse.json({ error: 'No active subscription found' }, { status: 404 });
        }

        if (profile.tier === 'free') {
            return NextResponse.json({ error: 'Already on free plan' }, { status: 400 });
        }

        // Set cancel_at_period_end — subscription stays active until period end
        const subscription = await getStripe().subscriptions.update(
            profile.stripe_subscription_id,
            {
                cancel_at_period_end: true,
                metadata: {
                    cancel_reason: reason || 'not_specified',
                    cancel_detail: reasonDetail || '',
                    cancelled_at: new Date().toISOString(),
                    supabase_user_id: user.id,
                },
            },
        ) as any;

        // Store cancellation reason in Supabase for analytics (non-critical)
        try {
            await supabaseService
                .from('user_profiles')
                .update({
                    cancel_reason: reason || null,
                    cancel_detail: reasonDetail || null,
                    cancel_requested_at: new Date().toISOString(),
                })
                .eq('user_id', user.id);
        } catch { /* non-critical */ }

        const periodEnd = subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null;

        console.log(`[Stripe Cancel] ✅ Subscription set to cancel at period end for user ${user.id} (reason: ${reason})`);

        return NextResponse.json({
            success: true,
            activeUntil: periodEnd,
            cancelAtPeriodEnd: true,
        });
    } catch (err: any) {
        console.error('[Stripe Cancel] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

/**
 * GET /api/stripe/cancel
 * 
 * Returns the current subscription status including renewal date.
 */
export async function GET(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { data: profile } = await supabaseService
            .from('user_profiles')
            .select('stripe_subscription_id, tier')
            .eq('user_id', user.id)
            .maybeSingle();

        if (!profile?.stripe_subscription_id || profile.tier === 'free') {
            return NextResponse.json({ tier: 'free', hasSubscription: false });
        }

        const subscription = await getStripe().subscriptions.retrieve(profile.stripe_subscription_id) as any;
        const periodEnd = subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null;

        return NextResponse.json({
            tier: profile.tier,
            hasSubscription: true,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            activeUntil: periodEnd,
            status: subscription.status,
        });
    } catch (err: any) {
        console.error('[Stripe Cancel GET] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
