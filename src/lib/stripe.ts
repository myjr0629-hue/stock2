import Stripe from 'stripe';

// ── Stripe server-side client (singleton) ──
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    typescript: true,
});

// ── Price ID Map ──
export const STRIPE_PRICES = {
    pro: {
        monthly: 'price_1T8uDGLZGGASwswELkwJxqRE',   // $49/mo
        yearly: 'price_1T8uIfLZGGASwswEY7Fqx0Em',    // $468/yr
    },
    elite: {
        monthly: 'price_1T8uDgLZGGASwswE8YSMXCSO',   // $79/mo
        yearly: 'price_1T8uJ8LZGGASwswEjAR4CJnt',    // $708/yr
    },
} as const;

// ── Plan metadata from Price ID (reverse lookup) ──
export function planFromPriceId(priceId: string): { plan: 'pro' | 'elite'; billing: 'monthly' | 'yearly' } | null {
    for (const [plan, prices] of Object.entries(STRIPE_PRICES)) {
        for (const [billing, id] of Object.entries(prices)) {
            if (id === priceId) {
                return { plan: plan as 'pro' | 'elite', billing: billing as 'monthly' | 'yearly' };
            }
        }
    }
    return null;
}
