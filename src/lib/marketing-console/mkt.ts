// ============================================================================
// Marketing Console — shared foundation (keys, targets, caps, audit, gate)
// Reuses existing infra: redisClient (EC2 proxy + Upstash), marketing auth.
// All state lives under `mkt:*` Redis keys. No product/web/app code touched.
// ============================================================================

import { NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { getMarketingAdmin, type MarketingAdmin } from './auth';

// ---- Target accounts / subs (runtime config; scanning only) ---------------
export const X_TARGETS: { handle: string; note: string }[] = [
  { handle: 'unusual_whales', note: '옵션 이상치·플로우' },
  { handle: 'spotgamma', note: '감마·딜러 포지셔닝' },
  { handle: 'KobeissiLetter', note: '매크로·시장' },
  { handle: 'CheddarFlow', note: '옵션 플로우(영수증형 검증)' },
  { handle: 'Barchart', note: '시장 데이터' },
];

export const X_TARGETS_JP: { handle: string; note: string }[] = [
  { handle: 'tapazou29', note: '米国株 코어' },
  { handle: 'KessanMan', note: '캐주얼 반응체' },
  { handle: 'momiage0088', note: '米国株' },
];

export const REDDIT_SUBS: { sub: string; role: string; caution?: string }[] = [
  { sub: 'options', role: '밸류' },
  { sub: 'thetagang', role: '밸류' },
  { sub: 'Daytrading', role: '밸류', caution: 'R4: AI 생성 금지 → 재작성 필수' },
  { sub: 'stocks', role: '카르마 겸용' },
  { sub: 'investing', role: '카르마 겸용' },
];

export const ST_TICKERS = ['NVDA', 'MU', 'TSLA', 'SOXL', 'AAPL', 'SPY', 'QQQ'];

// ---- Volume caps ----------------------------------------------------------
export const DAILY_CAP = 3; // 채널당 하루 상한 (절대) — §0-2
export const X_CHANNELS = { en: 'x-us', ja: 'x-jp', bsky: 'bluesky' } as const;

// ---- ET date (caps reset on ET calendar day) ------------------------------
export function etDate(): string {
  // en-CA gives YYYY-MM-DD; America/New_York for market-day alignment
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// ---- Redis keys -----------------------------------------------------------
export const K = {
  vol: (channel: string) => `mkt:vol:${channel}:${etDate()}`,
  attrHit: (from: string) => `mkt:attr:hit:${from}:${etDate()}`,
  audit: () => `mkt:audit:log`,
  drafts: () => `mkt:drafts:queue`,
  deadman: () => `mkt:deadman:state`,
};

// ---- Volume cap helpers ---------------------------------------------------
export async function getVolume(channel: string): Promise<number> {
  const v = await getFromCache<number>(K.vol(channel));
  return typeof v === 'number' ? v : 0;
}

export async function getAllVolumes(): Promise<Record<string, number>> {
  const [en, ja, bsky] = await Promise.all([
    getVolume(X_CHANNELS.en),
    getVolume(X_CHANNELS.ja),
    getVolume(X_CHANNELS.bsky),
  ]);
  return { [X_CHANNELS.en]: en, [X_CHANNELS.ja]: ja, [X_CHANNELS.bsky]: bsky };
}

/** Increment a channel's daily count. Returns { ok, count }. Rejects at DAILY_CAP. */
export async function bumpVolume(channel: string): Promise<{ ok: boolean; count: number }> {
  const cur = await getVolume(channel);
  if (cur >= DAILY_CAP) return { ok: false, count: cur };
  const next = cur + 1;
  await setInCache(K.vol(channel), next, 60 * 60 * 30); // ~30h TTL covers the ET day
  return { ok: true, count: next };
}

// ---- Audit log (append-only, capped) --------------------------------------
export interface AuditEntry {
  at: number;
  who: string;
  action: string;
  detail?: string;
}

export async function appendAudit(who: string, action: string, detail?: string): Promise<void> {
  try {
    const log = (await getFromCache<AuditEntry[]>(K.audit())) || [];
    log.unshift({ at: Date.now(), who, action, detail });
    await setInCache(K.audit(), log.slice(0, 200)); // keep last 200, no TTL
  } catch {
    /* audit is best-effort; never block the action */
  }
}

export async function readAudit(): Promise<AuditEntry[]> {
  return (await getFromCache<AuditEntry[]>(K.audit())) || [];
}

// ---- Admin API gate (server session; JSON 401 for non-admin) --------------
// Pages use notFound() (404). API routes return 401 JSON so the client can
// react. Both verify the SAME server-side Supabase session — never body-email.
export async function requireMktAdmin(): Promise<
  { admin: MarketingAdmin } | { error: NextResponse }
> {
  const admin = await getMarketingAdmin();
  if (!admin) {
    return { error: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }) };
  }
  return { admin };
}
