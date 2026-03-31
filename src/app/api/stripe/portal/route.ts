import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { locale } = body as { locale: string };

        // Use Supabase SSR server client (handles chunked cookies automatically)
        const supabase = await createClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user?.email) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        // Find Stripe customer by email
        const customers = await getStripe().customers.list({ email: user.email, limit: 1 });
        if (customers.data.length === 0) {
            return NextResponse.json({ error: 'No Stripe customer found' }, { status: 404 });
        }

        const origin = req.headers.get('origin') || 'https://signumhq.com';

        // Create Customer Portal session
        const portalSession = await getStripe().billingPortal.sessions.create({
            customer: customers.data[0].id,
            return_url: `${origin}/${locale}/settings`,
        });

        return NextResponse.json({ url: portalSession.url });
    } catch (err: any) {
        console.error('[Stripe Portal] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
