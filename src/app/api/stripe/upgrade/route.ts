import { NextRequest, NextResponse } from 'next/server';
import { getStripe, STRIPE_PRICES } from '@/lib/stripe';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

// Service-level client for reading user_profiles (not tied to user session)
const supabaseService = createServiceClient(
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

        // Use Supabase SSR server client (handles chunked cookies automatically)
        const supabase = await createClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const userId = user.id;

        // Get user's Stripe subscription ID from user_profiles
        const { data: profile } = await supabaseService
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
        await getStripe().subscriptions.update(
            profile.stripe_subscription_id,
            {
                items: [{
                    id: currentItemId,
                    price: targetPriceId,
                }],
                // Upgrade: immediate with proration
                // Downgrade: at period end (user keeps Elite until renewal)
                proration_behavior: isUpgrade ? 'create_prorations' : 'none',
                metadata: {
                    plan: targetPlan,
                    billing,
                    supabase_user_id: userId,
                },
            },
        );

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
