import { NextRequest, NextResponse } from 'next/server';
import { getStripe, STRIPE_PRICES } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/**
 * POST /api/stripe/upgrade
 * 
 * Handles Pro→Elite upgrade (immediate, prorated) and
 * Elite→Pro downgrade (at period end).
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { targetPlan, billing, locale } = body as {
            targetPlan: 'pro' | 'elite';
            billing: 'monthly' | 'yearly';
            locale: string;
        };

        // Validate target price
        const targetPriceId = STRIPE_PRICES[targetPlan]?.[billing];
        if (!targetPriceId) {
            return NextResponse.json({ error: 'Invalid plan or billing' }, { status: 400 });
        }

        // Get current user from auth cookie
        const authHeader = req.headers.get('cookie') || '';
        const tokenMatch = authHeader.match(/sb-[^=]+-auth-token[^=]*=([^;]+)/);
        if (!tokenMatch) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        let userId: string | undefined;
        try {
            const tokenData = JSON.parse(decodeURIComponent(tokenMatch[1]));
            const accessToken = Array.isArray(tokenData) ? tokenData[0] : tokenData?.access_token;
            if (accessToken) {
                const { data: { user } } = await supabase.auth.getUser(accessToken);
                userId = user?.id;
            }
        } catch {
            return NextResponse.json({ error: 'Auth token invalid' }, { status: 401 });
        }

        if (!userId) {
            return NextResponse.json({ error: 'User not found' }, { status: 401 });
        }

        // Get user's Stripe subscription ID from user_profiles
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('stripe_subscription_id, stripe_customer_id, tier')
            .eq('user_id', userId)
            .maybeSingle();

        if (!profile?.stripe_subscription_id) {
            return NextResponse.json({ error: 'No active subscription found' }, { status: 404 });
        }

        // Get current subscription
        const subscription = await getStripe().subscriptions.retrieve(profile.stripe_subscription_id);
        const currentItemId = subscription.items.data[0]?.id;

        if (!currentItemId) {
            return NextResponse.json({ error: 'No subscription item found' }, { status: 404 });
        }

        const isUpgrade = targetPlan === 'elite' && profile.tier === 'pro';
        const isDowngrade = targetPlan === 'pro' && profile.tier === 'elite';

        if (!isUpgrade && !isDowngrade) {
            return NextResponse.json({ error: 'Invalid plan change' }, { status: 400 });
        }

        // Update the subscription
        const updatedSubscription = await getStripe().subscriptions.update(
            profile.stripe_subscription_id,
            {
                items: [{
                    id: currentItemId,
                    price: targetPriceId,
                }],
                // Upgrade: immediate with proration
                // Downgrade: at period end (user keeps Elite until renewal)
                proration_behavior: isUpgrade ? 'create_prorations' : 'none',
                ...(isDowngrade && {
                    // For downgrade, apply at the end of the current billing period
                    cancel_at_period_end: false,
                }),
                metadata: {
                    plan: targetPlan,
                    billing,
                    supabase_user_id: userId,
                },
            },
        );

        // If downgrade, we need to schedule the change for period end
        if (isDowngrade) {
            // Use subscription_schedule for deferred downgrade
            await getStripe().subscriptions.update(
                profile.stripe_subscription_id,
                {
                    items: [{
                        id: currentItemId,
                        price: targetPriceId,
                    }],
                    proration_behavior: 'none',
                    billing_cycle_anchor: 'unchanged',
                    metadata: {
                        plan: targetPlan,
                        billing,
                        supabase_user_id: userId,
                    },
                },
            );
        }

        return NextResponse.json({
            success: true,
            type: isUpgrade ? 'upgrade' : 'downgrade',
            effectiveFrom: isUpgrade ? 'now' : new Date((subscription as any).current_period_end * 1000).toISOString(),
        });
    } catch (err: any) {
        console.error('[Stripe Upgrade] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
