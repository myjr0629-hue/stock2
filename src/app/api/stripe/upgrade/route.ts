import { NextRequest, NextResponse } from 'next/server';
import { getStripe, STRIPE_PRICES, planFromPriceId } from '@/lib/stripe';
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
 * Handles:
 * - Pro→Elite upgrade (immediate, prorated)
 * - Elite→Pro downgrade (immediate, no proration)
 * - Same plan billing change: monthly↔yearly (immediate, prorated)
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
        const currentPriceId = subscription.items.data[0]?.price?.id;

        if (!currentItemId) {
            return NextResponse.json({ error: 'No subscription item found' }, { status: 404 });
        }

        // Check if already on the same price
        if (currentPriceId === targetPriceId) {
            return NextResponse.json({ error: 'Already on this plan and billing', alreadySame: true }, { status: 400 });
        }

        // Determine change type
        const currentPlan = planFromPriceId(currentPriceId || '');
        const isUpgrade = targetPlan === 'elite' && profile.tier === 'pro';
        const isDowngrade = targetPlan === 'pro' && profile.tier === 'elite';
        const isBillingChange = targetPlan === profile.tier; // same plan, different billing

        if (!isUpgrade && !isDowngrade && !isBillingChange) {
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
                // All changes: immediate with proration
                proration_behavior: 'create_prorations',
                metadata: {
                    plan: targetPlan,
                    billing,
                    supabase_user_id: userId,
                },
            },
        );

        let changeType: string;
        if (isUpgrade) changeType = 'upgrade';
        else if (isDowngrade) changeType = 'downgrade';
        else changeType = 'billing_change';

        return NextResponse.json({
            success: true,
            type: changeType,
            effectiveFrom: 'now',
        });
    } catch (err: any) {
        console.error('[Stripe Upgrade] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
