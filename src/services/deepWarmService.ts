/**
 * 딥 분석 예열 — 서버가 «앱 Command 화면과 같은 재료»를 모아 /api/command/deep-analysis 를 부른다 (2026-10-12)
 *
 * 9/10 첫 예열은 빈 재료로 불러 «데이터 부재» 글이 캐시에 앉았다(그래서 꺼 두었다 — ai-warm 머리말).
 * 이번에는 화면이 부르는 같은 엔드포인트(live/ticker·command/unified·command/insider·live/technicals·market/macro·history gex)를 읽고,
 * 화면과 같은 함수(lib/ai/deepSnapshot.buildDeepSnapshot·computeGexStats)로 재료를 만든다. 라우트의 재료 완결 게이트·가격 대조·
 * 출구 게이트(gateDeepAnalysis)는 그대로 지난다 — 예열이라고 우회하는 검사는 없다.
 * 재료가 덜 왔으면(시세 없음·unified 부분 응답·지표 그룹 3개 미만) 부르지 않는다.
 */
import { buildDeepSnapshot, computeGexStats } from '@/lib/ai/deepSnapshot';

export type WarmOutcome = 'hit' | 'gen' | 'nomaterial' | 'fail' | 'budget' | 'cached';

export interface WarmResult { ticker: string; outcome: WarmOutcome; ms: number; model?: string; reason?: string }

function siteBase(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://www.signumhq.com';
}
function bypassHeaders(): Record<string, string> {
  return process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {};
}

async function getJson(url: string, timeoutMs = 12_000): Promise<any | null> {
  try {
    const r = await fetch(url, { headers: bypassHeaders(), cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/** 화면과 같은 재료 — 못 모으면 null(이유와 함께) */
export async function buildWarmMaterial(ticker: string, base = siteBase()): Promise<{ snapshot: any; gexStats: any } | { error: string }> {
  const T = String(ticker).toUpperCase();
  const [t, u, ins, tech, macro, gex] = await Promise.all([
    getJson(`${base}/api/live/ticker?t=${T}&chain=0`),
    getJson(`${base}/api/command/unified?t=${T}&lang=ko`),
    getJson(`${base}/api/command/insider?ticker=${T}`),
    getJson(`${base}/api/live/technicals?t=${T}`),
    getJson(`${base}/api/market/macro`),
    getJson(`${base}/api/history?type=gex&ticker=${T}&days=30`),
  ]);
  const price = Number(t?.display?.price ?? t?.price);
  if (!(price > 0)) return { error: 'no-price' };
  if (!u || u._source === 'unavailable' || u._isPartial === true) return { error: 'unified-partial' };
  // 화면: effectiveSession = (휴장·마감이면 CLOSED) 아니면 live/ticker 의 session
  const session = String(t?.session || 'CLOSED').toUpperCase();
  const snapshot = buildDeepSnapshot({
    ticker: T,
    price,
    priceChange: Number(t?.display?.changePctPct ?? t?.display?.changePct ?? 0) || 0,
    session,
    unified: u,
    rawTickerData: t,
    insider: ins?.insider ?? null,
    technicals: tech && !tech.error ? tech : null,
    creditSpread: macro?.creditSpread ?? null,
  });
  return { snapshot, gexStats: computeGexStats(gex?.data || []) };
}

/** 한 종목 — 재료를 모아 라우트를 부른다(인증된 WARM: 크레딧으로만, 실패해도 사용자 쿨다운 키를 쓰지 않는다) */
export async function warmDeepOne(ticker: string, base = siteBase()): Promise<WarmResult> {
  const t0 = Date.now();
  const T = String(ticker).toUpperCase();
  const m = await buildWarmMaterial(T, base);
  if ('error' in m) return { ticker: T, outcome: 'nomaterial', ms: Date.now() - t0, reason: m.error };
  try {
    const r = await fetch(`${base}/api/command/deep-analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...bypassHeaders(), ...(process.env.CRON_SECRET ? { Authorization: `Bearer ${process.env.CRON_SECRET}` } : {}) },
      // ⚠️ PRICE_MOVE·GAMMA_FLIP·MANUAL_REFRESH 는 캐시를 무시한다 — 예열은 WARM(캐시가 살아 있으면 그대로 돌려받는다)
      body: JSON.stringify({ ticker: T, locale: 'ko', snapshot: m.snapshot, triggerReason: 'WARM', gexStats: m.gexStats }),
      signal: AbortSignal.timeout(62_000),
    });
    const j: any = await r.json().catch(() => null);
    const ms = Date.now() - t0;
    if (!r.ok || !j) return { ticker: T, outcome: 'fail', ms, reason: `HTTP${r.status}${j?.error ? ` ${String(j.error).slice(0, 60)}` : ''}` };
    // «기본 관측» 폴백(생성 실패) — usedFallback 은 «모델 대체(Haiku)»라 실패가 아니다
    if (j.triggerReason === 'FALLBACK' || j.model === 'fallback') return { ticker: T, outcome: 'fail', ms, reason: 'fallback' };
    return { ticker: T, outcome: j.fromCache ? 'hit' : 'gen', ms, model: j.model };
  } catch (e: any) {
    return { ticker: T, outcome: 'fail', ms: Date.now() - t0, reason: e?.name === 'TimeoutError' ? 'timeout' : 'err' };
  }
}
