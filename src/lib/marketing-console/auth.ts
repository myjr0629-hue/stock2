import { createClient } from '@/lib/supabase/server';

// ============================================================================
// Marketing Console auth gate (C-2.5 access rules)
// - Server-side Supabase session verification ONLY (no client checks, no body-email)
// - Admin allowlist comes from server env MARKETING_ADMIN_EMAILS (comma-separated);
//   falls back to existing NEXT_PUBLIC_ADMIN_EMAILS so no new env is required.
// - Callers must render 404 (existence hiding) when this returns null.
// ============================================================================

const ADMIN_EMAILS = (
  process.env.MARKETING_ADMIN_EMAILS ||
  process.env.NEXT_PUBLIC_ADMIN_EMAILS ||
  ''
)
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export interface MarketingAdmin {
  email: string;
}

/** Returns the admin identity, or null when the request is not an authenticated admin. */
export async function getMarketingAdmin(): Promise<MarketingAdmin | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const email = (user.email || '').toLowerCase();
    if (!email || !ADMIN_EMAILS.includes(email)) return null;

    return { email };
  } catch {
    // Fail closed: any auth error behaves as "not admin"
    return null;
  }
}
