import { NextResponse, after } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getFromCache, setInCache } from '@/services/redisClient';
import { callBedrock } from '@/services/bedrockClient';
import { withFreshTier, isFreshTierSkipped } from '@/lib/ai/freshTier';
import { upstashMeterStore } from '@/lib/intrinioMeter';
import { selectTodayEconomicEvent, selectNextMajorEvent } from '@/lib/todayPicks/summary';
import { fmtVal } from '@/lib/econCalendarNames';
import { buildEconCompareSentence } from '@/lib/ai/econEventLine';
import { interpretationText } from '@/lib/ai/econInterpretations';
import * as definition from '@/lib/ai/econEventDefinition';

export const dynamic = 'force-dynamic';

// FMP is already fetched by cron/economic-calendar (4h, Redis TTL 6h).
// This route only reads that US-only snapshot; no supplier call.
const readCalendar = unstable_cache(
  async () => getFromCache<{ events?: unknown }>('fmp:econ-calendar'),
  ['today-summary-fmp-calendar-v1'],
  { revalidate: 15 * 60 },
);

const STATUS_KEY = 'today-summary:econ-ai:last-status';
async function generate(key: string, event: string): Promise<void> {
  const check = definition.checkEconLine;
  // 실패 뒤 30분 쉼표 — 요청마다 다시 부르지 않는다(관문 10/18)
  if (await getFromCache(key + ':cooldown').catch(() => null)) return;
  // 원자적 선점(SET NX EX) — 동시 캐시 미스 여러 건이어도 모델 호출은 한 번(관문 10/18)
  if (!(await upstashMeterStore.setNxEx(key + ':lock', String(Date.now()), 90).catch(() => false))) return;
  // 잠금 뒤 캐시 재확인 — 앞선 생성이 이미 썼으면 부르지 않는다
  // 캐시가 «지금 가드»를 통과할 때만 이미 있는 것으로 본다 — 거절된 옛 캐시는 다시 만든다(관문 10/18)
  const existing = await getFromCache<{ text?: unknown }>(key).catch(() => null);
  const stored = existing?.text;
  if (stored && check(JSON.stringify(stored)).ok) return;
  const cool = () => setInCache(key + ':cooldown', { at: Date.now() }, 30 * 60).catch(() => false);
  let last: string[] = [];
  const note = (reason: string) => setInCache(STATUS_KEY, { reason: reason.slice(0, 160), at: Date.now(), event }, 6 * 3600).catch(() => false);
  try {
    const res = await withFreshTier(() => callBedrock({
      system: definition.EE_SYSTEM, userPrompt: definition.buildEconUserPrompt(event), maxTokens: 300, temperature: 0.2, timeoutMs: 15_000,
      label: definition.EE_PURPOSE, purpose: definition.EE_PURPOSE, expectJson: true, locale: 'multi',
      validate: (text: string) => { const r = check(text); last = r.reasons; return { ok: r.ok, reasons: r.reasons }; },
    }));
    const chk = check(res.text);
    if (chk.ok) {
      const value = { text: chk.text };
      await setInCache(key, { ...value, at: Date.now() }, 48 * 3600); await note('ok');
    }
    else { await note('guard:' + chk.reasons.join(',')); await cool(); }
  } catch (e) {
    await cool();
    // 실패 사유만 남긴다(관제·점검용 — 비밀값 없음).
    await note(isFreshTierSkipped(e) ? 'skipped:' + (last.join(',') || String((e as Error).message).slice(0, 120)) : 'error:' + String((e as Error)?.message || e).slice(0, 120));
  } finally { /* 성공·실패 모두 잠금은 90초 자연 만료 — 즉시 해제하면 동시 요청이 곧바로 다시 부른다 */ }
}

export async function GET() {
  try {
    const cached = await readCalendar();
    const now = Date.now();
    const next = selectNextMajorEvent(cached?.events, now);
    let ai: Record<string, string> | null = null;
    let aiPending = false;
    let aiStatus: unknown = null;
    if (next) {
      const hasComparison = next.estimate != null && next.previous != null;
      const estimate = hasComparison ? fmtVal(next.estimate, next.unit) : '';
      const previous = hasComparison ? fmtVal(next.previous, next.unit) : '';
      const fixed = interpretationText(next.event, next.unit, /^(?:gdp growth rate qoq|retail sales mom)(?:\s*\([^)]*\))?\s*$/i.test(next.event.trim()) ? '%' : estimate);
      let detail: Record<string, string> | null = fixed;
      if (!fixed) {
        const key = `today-summary:econ-ai:v1:${next.etDate}T${next.etTime}:${next.event.slice(0, 80)}`;
        const hit = await getFromCache<{ text?: Record<string, string> }>(key).catch(() => null);
        const recheck = hit?.text ? definition.checkEconLine(JSON.stringify(hit.text)) : null;
        if (recheck?.ok && recheck.text) detail = recheck.text;
        if (!recheck?.ok) {
          aiStatus = await getFromCache(STATUS_KEY).catch(() => null);
          if (!(await getFromCache(key + ':cooldown').catch(() => null))) {
            after(() => generate(key, next.event));
            aiPending = true;
          }
        }
      }
      if (hasComparison) {
        ai = Object.fromEntries((['ko', 'en', 'ja'] as const).map(loc => [loc,
          buildEconCompareSentence(next.event, estimate, previous, loc, next.unit) + (detail?.[loc] ? ` ${detail[loc]}` : '')]));
      } else ai = detail;
    }
    // economicEvent(오늘~다음 거래일 HIGH)는 예전 응답 필드 — 다른 소비자를 위해 남긴다.
    return NextResponse.json({ economicEvent: selectTodayEconomicEvent(cached?.events, now), nextEvent: next, ai, aiPending, aiStatus, source: 'FMP' },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ economicEvent: null, nextEvent: null, ai: null, aiPending: false, source: 'FMP' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
