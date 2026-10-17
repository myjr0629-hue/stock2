import { NextResponse, after } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getFromCache, setInCache } from '@/services/redisClient';
import { callBedrock } from '@/services/bedrockClient';
import { withFreshTier } from '@/lib/ai/freshTier';
import { tryBackgroundLock, releaseBackgroundLock } from '@/lib/cache/staleLock';
import { selectTodayEconomicEvent, selectNextMajorEvent } from '@/lib/todayPicks/summary';
import { EE_PURPOSE, EE_SYSTEM, buildEconUserPrompt, checkEconLine } from '@/lib/ai/econEventLine';

export const dynamic = 'force-dynamic';

// FMP is already fetched by cron/economic-calendar (4h, Redis TTL 6h).
// This route only reads that US-only snapshot; no supplier call.
const readCalendar = unstable_cache(
  async () => getFromCache<{ events?: unknown }>('fmp:econ-calendar'),
  ['today-summary-fmp-calendar-v1'],
  { revalidate: 15 * 60 },
);

const aiKey = (ev: { etDate: string; etTime: string; event: string }) =>
  `today-summary:econ-ai:v1:${ev.etDate}T${ev.etTime}:${ev.event.slice(0, 80)}`;

/** AI 한 줄은 사용자 요청을 기다리게 하지 않는다 — 없으면 응답 뒤(after)에 한 번 만들어 캐시(48h)하고, 화면은 잠시 뒤 다시 읽는다. */
async function generate(key: string, event: string): Promise<void> {
  if (!(await tryBackgroundLock(key + ':lock', 90))) return;
  try {
    const res = await withFreshTier(() => callBedrock({
      system: EE_SYSTEM, userPrompt: buildEconUserPrompt(event), maxTokens: 300, temperature: 0.2, timeoutMs: 15_000,
      label: EE_PURPOSE, purpose: EE_PURPOSE, expectJson: true, locale: 'multi',
      validate: (text: string) => { const r = checkEconLine(text); return { ok: r.ok, reasons: r.reasons }; },
    }));
    const chk = checkEconLine(res.text);
    if (chk.ok && chk.text) await setInCache(key, { text: chk.text, at: Date.now() }, 48 * 3600);
  } catch { /* 줄을 숨긴다 */ } finally { await releaseBackgroundLock(key + ':lock'); }
}

export async function GET() {
  try {
    const cached = await readCalendar();
    const now = Date.now();
    const next = selectNextMajorEvent(cached?.events, now);
    let ai: Record<string, string> | null = null;
    if (next) {
      const key = aiKey(next);
      const hit = await getFromCache<{ text: Record<string, string> }>(key);
      if (hit?.text) ai = hit.text; else after(() => generate(key, next.event));
    }
    // economicEvent(오늘~다음 거래일 HIGH)는 예전 응답 필드 — 다른 소비자를 위해 남긴다.
    return NextResponse.json({ economicEvent: selectTodayEconomicEvent(cached?.events, now), nextEvent: next, ai, source: 'FMP' },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ economicEvent: null, nextEvent: null, ai: null, source: 'FMP' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
