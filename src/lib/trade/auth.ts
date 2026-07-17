import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================================
// Trade Console auth gate — STRICTER than the marketing gate by design.
// Exactly ONE operator may pass: pick8775@gmail.com (hardcoded per the
// operator's 2026-07-17 instruction — no env override, so a misconfigured env
// can never widen access to a money-moving surface).
// Pages must render 404 (existence hiding); API routes return 401 JSON.
// ============================================================================

const TRADE_OPERATOR = 'pick8775@gmail.com';

export interface TradeAdmin { email: string }

export async function getTradeAdmin(): Promise<TradeAdmin | null> {
  try {
    const supabase = await createClient();
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('auth timeout')), 7000)),
    ]);
    const user = result?.data?.user;
    if (!user) return null;
    const email = (user.email || '').toLowerCase();
    if (email !== TRADE_OPERATOR) return null;
    return { email };
  } catch {
    return null; // fail closed
  }
}

export async function requireTradeAdmin(): Promise<{ admin: TradeAdmin } | { error: NextResponse }> {
  const admin = await getTradeAdmin();
  if (!admin) {
    return { error: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }) };
  }
  return { admin };
}
