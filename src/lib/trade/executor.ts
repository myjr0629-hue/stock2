// ============================================================================
// Executor client — HMAC-signed calls from Vercel to the fixed-IP EC2 executor
// (the only host on Toss's IP allowlist). Vercel itself never holds Toss keys.
// Env: EXECUTOR_URL (http://52.23.98.13:8090), EXECUTOR_SECRET.
// ============================================================================

import crypto from 'crypto';
import { getFromCache, setInCache } from '@/services/redisClient';

const URL_ = () => (process.env.EXECUTOR_URL || '').trim();
const SECRET = () => (process.env.EXECUTOR_SECRET || '').trim();

export function executorConfigured(): boolean {
  return Boolean(URL_() && SECRET());
}

export interface TossCall {
  path: string;
  method?: 'GET' | 'POST' | 'DELETE';
  query?: Record<string, string>;
  body?: Record<string, unknown>;
}

export async function callToss(call: TossCall): Promise<{ status: number; data: unknown }> {
  if (!executorConfigured()) return { status: 503, data: { error: 'EXECUTOR_URL / EXECUTOR_SECRET 미설정' } };
  const raw = JSON.stringify(call);
  const ts = String(Date.now());
  const sign = crypto.createHmac('sha256', SECRET()).update(ts + '.' + raw).digest('hex');
  try {
    const r = await fetch(`${URL_()}/toss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Exec-Ts': ts, 'X-Exec-Sign': sign },
      body: raw,
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    });
    const data = await r.json().catch(() => ({ error: 'invalid executor response' }));
    return { status: r.status, data };
  } catch (e) {
    return { status: 502, data: { error: `executor 연결 실패: ${(e as Error).message}` } };
  }
}

export async function executorHealth(): Promise<{ up: boolean; configured: boolean }> {
  if (!URL_()) return { up: false, configured: false };
  try {
    const r = await fetch(`${URL_()}/health`, { signal: AbortSignal.timeout(6000), cache: 'no-store' });
    const j = (await r.json()) as { ok?: boolean; configured?: boolean };
    return { up: Boolean(j.ok), configured: Boolean(j.configured) };
  } catch {
    return { up: false, configured: false };
  }
}

// ── Vercel-side order caps + journal (first line; executor re-checks) ───────
export const TRADE_MAX_ORDER_USD = 2000;
export const TRADE_MAX_ORDERS_DAY = 40;

function etDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export async function getTradeKill(): Promise<boolean> {
  const v = await getFromCache<string>('trade:killswitch');
  return v === '1';
}
export async function setTradeKill(on: boolean): Promise<void> {
  await setInCache('trade:killswitch', on ? '1' : '0');
}

export async function bumpTradeCount(): Promise<{ ok: boolean; count: number }> {
  const key = `trade:vol:${etDate()}`;
  const cur = (await getFromCache<number>(key)) || 0;
  if (cur >= TRADE_MAX_ORDERS_DAY) return { ok: false, count: cur };
  await setInCache(key, cur + 1, 60 * 60 * 30);
  return { ok: true, count: cur + 1 };
}

export interface JournalEntry {
  at: number;
  who: string;
  action: string; // order-buy / order-sell / order-cancel / kill-on / kill-off
  detail: string;
  orderId?: string;
  clientOrderId?: string;
}

export async function tradeJournal(entry: JournalEntry): Promise<void> {
  try {
    const list = (await getFromCache<JournalEntry[]>('trade:journal')) || [];
    list.unshift(entry);
    await setInCache('trade:journal', list.slice(0, 300));
  } catch { /* journal is best-effort; the executor + Toss both keep records */ }
}

export async function readTradeJournal(): Promise<JournalEntry[]> {
  return (await getFromCache<JournalEntry[]>('trade:journal')) || [];
}
