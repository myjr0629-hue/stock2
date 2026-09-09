// ============================================================================
// Undercurrent cache warmer — the PUSH half of the UC freshness fix.
// ----------------------------------------------------------------------------
// UC data was pull-only (generate-on-visit): with thin traffic every app launch
// showed hours-old cache, then made the user wait ~20-40s for the refresh swap
// — and en/ja were colder than ko (per-locale keys). This cron regenerates the
// feed (all 3 locales) + macro (all 3 locales) on a schedule so Redis always
// holds a ≤15min copy for EVERY locale → launches are instant AND current, and
// the client's _stale bg-refresh path almost never fires.
//
// Order matters: ko FIRST and awaited — its refresh=1 rebuilds the shared feed
// CORE (news + money probe, see feedCore.ts). en/ja then reuse that fresh core
// (AI-only, fast), so the whole cycle costs ONE news+money build. macro has no
// shared core (one small AI call per locale) — plain parallel warm.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // orchestrator: ko feed (~50s worst) + parallel wave (~30s)

const LOCALES = ['ko', 'en', 'ja'] as const;

/**
 * ★ [2026-09-09] 워밍이 하루 560번 «강제 재생성»을 돌려 AI 일일 한도를 태웠다.
 *
 *   실측: WIM 이 ThrottlingException «Too many tokens per day» 로 죽어
 *   「오늘은 데이터가 없어요」가 떴고, UC 일본어 피드도 같은 이유로 비었다.
 *   계산: 평일 uc-warm 80회 × (feed 3 + macro 3 + wim 1) = 560회.
 *   그런데 대부분은 «아직 신선한» 것을 다시 만드는 헛일이었다.
 *
 *   → 먼저 그냥 불러 보고, 응답이 _stale 일 때만 refresh=1 로 재생성한다.
 *     신선하면 AI 를 아예 부르지 않는다.
 */
async function warm(baseUrl: string, path: string): Promise<{ ok: boolean; ms: number; note?: string }> {
  const t0 = Date.now();
  // 1) 신선도만 먼저 확인 — 캐시가 살아 있으면 즉시 돌아온다(AI 호출 없음)
  const probePath = path.replace(/[?&]refresh=1/, (m) => (m === '?refresh=1' ? '' : ''));
  try {
    const peek = await fetch(`${baseUrl}${probePath}`, {
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
      headers: {
        ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
          ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
          : {}),
      },
    });
    if (peek.ok) {
      const b = await peek.json().catch(() => null);
      if (b && b.success !== false && b._stale !== true) {
        return { ok: true, ms: Date.now() - t0, note: 'fresh (AI 생략)' };
      }
    }
  } catch { /* 확인 실패 → 아래에서 정상 경로로 재생성 */ }

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      signal: AbortSignal.timeout(58_000), // within the target route's maxDuration 60
      cache: 'no-store',
      headers: {
        ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
          ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
          : {}),
      },
    });
    const body = await res.json().catch(() => null);
    return {
      ok: res.ok && body?.success !== false,
      ms: Date.now() - t0,
      ...(res.ok ? {} : { note: `HTTP ${res.status}` }),
    };
  } catch (e: any) {
    return { ok: false, ms: Date.now() - t0, note: e?.message || 'fetch failed' };
  }
}

// WIM warm (2026-07-13, WIM_V2_SPEC §5): wim/today is locale-independent (one cache for
// ko/en/ja) but was pull-only — first visitor of a new ET day ate a ~40s cold generation
// (blank hero). Two-step warm keeps the 4h freshness contract WITHOUT forcing a regen
// every 15min (the unit AI call is 8k-token — refresh=1 each cycle would burn ~$ for
// identical content): serve normally, regenerate only when the body says it is stale.
/**
 * ★ [2026-09-10] 같은 «엿보고 필요할 때만 재생성» 을 피드에도 적용한다.
 *
 *   왜 이제야: WIM 만 고쳐 놓고 feed·macro 는 매 실행 refresh=1 로 강제하고
 *   있었다. 피드 캐시 수명은 40분인데 크론은 15분마다 돈다 — **세 번 중 두 번은
 *   멀쩡한 것을 버리고 다시 만들었다.**
 *
 *   토큰보다 «분당 요청 10건»이 문제다(AWS 케이스 178896794200630).
 *   uc-warm 이 15분마다 12건 안팎을 한꺼번에 던지면 그 순간 실사용자 요청까지
 *   같이 스로틀된다. 낭비 재생성을 없애는 것이 곧 사용자 자리를 되찾는 것이다.
 *
 *   macro 는 그대로 강제한다 — 수명이 12분이라 15분 주기에선 어차피 매번 낡았다.
 *   엿보기를 넣어 봐야 왕복만 늘고 아끼는 게 없다.
 */
async function warmFresh(baseUrl: string, path: string, refreshPath: string): Promise<{ ok: boolean; ms: number; note?: string }> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      signal: AbortSignal.timeout(58_000),
      cache: 'no-store',
      headers: {
        ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
          ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
          : {}),
      },
    });
    const body = await res.json().catch(() => null);
    // 못 읽었으면 «없다»고 보고 확실히 만든다 — 빈 화면보다 낫다
    if (!res.ok || body?.success === false) return await warm(baseUrl, refreshPath);
    if (body?._stale) return await warm(baseUrl, refreshPath);
    return { ok: true, ms: Date.now() - t0, note: 'fresh' };
  } catch (e: any) {
    return { ok: false, ms: Date.now() - t0, note: e?.message || 'fetch failed' };
  }
}

async function warmWim(baseUrl: string): Promise<{ ok: boolean; ms: number; note?: string }> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${baseUrl}/api/wim/today`, {
      signal: AbortSignal.timeout(58_000),
      cache: 'no-store',
      headers: {
        ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
          ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
          : {}),
      },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || body?.success === false) return { ok: false, ms: Date.now() - t0, note: `HTTP ${res.status}` };
    if (body?._stale) return await warm(baseUrl, '/api/wim/today?refresh=1'); // >4h old → regenerate
    return { ok: true, ms: Date.now() - t0 }; // fresh (or cold path just generated inline)
  } catch (e: any) {
    return { ok: false, ms: Date.now() - t0, note: e?.message || 'fetch failed' };
  }
}

export async function GET(req: NextRequest) {
  // Security: CRON_SECRET check (same pattern as the other cron routes)
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const { searchParams } = new URL(req.url);
  const secretParam = searchParams.get('secret');
  if (process.env.NODE_ENV === 'production' && cronSecret) {
    const isHeaderValid = authHeader === `Bearer ${cronSecret}`;
    const isParamValid = secretParam === cronSecret;
    if (!isHeaderValid && !isParamValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const startTime = Date.now();
  const baseUrl = req.url.split('/api/')[0];
  const out: Record<string, { ok: boolean; ms: number; note?: string }> = {};

  // ★ [2026-09-09] WIM 을 «맨 앞»으로. 예전엔 마지막 병렬 파도에 있었는데,
  //   AI 일일 토큰이 바닥나면 항상 WIM 부터 굶어 「오늘은 데이터가 없어요」가 됐다.
  //   WIM 은 신선도 4시간이라 실제 재생성은 드물다 — 앞에 둬도 비용이 거의 없고,
  //   드물게 필요할 때 확실히 받는다.
  out['wim:today'] = await warmWim(baseUrl);

  // 1) feed ko — awaited alone so the shared core is rebuilt exactly once
  out['feed:ko'] = await warmFresh(baseUrl, '/api/undercurrent/feed?locale=ko&limit=12', '/api/undercurrent/feed?locale=ko&limit=12&refresh=1');

  // ★ [2026-09-09] 일본어 피드만 503 이 나 앱이 통째로 비어 있었다.
  //   ko/en 은 200·12건인데 ja 만 «unavailable». refresh=1 로는 21초에 정상
  //   생성되므로 생성 능력의 문제가 아니라 **워밍이 실패해 키가 사라진** 것이다.
  //   ja 는 en 과 함께 6개 병렬 파도에 섞여 있었고, 일본어는 토큰이 가장 무거워
  //   경쟁에 밀리면 대상 라우트의 maxDuration(60s)을 넘긴다. 그러면 키가
  //   안 써지고, 물리 TTL 이 지나면 남은 것도 없어 503 이 된다.
  //   → ko 처럼 **따로 기다려** 데운다. (ko ~50s + ja ~25s + 나머지 ~30s < 300s)
  out['feed:ja'] = await warmFresh(baseUrl, '/api/undercurrent/feed?locale=ja&limit=12', '/api/undercurrent/feed?locale=ja&limit=12&refresh=1');

  // 3) feed en + macro ×3 + wim (locale-independent) — 나머지는 병렬
  const wave = await Promise.all([
    warmFresh(baseUrl, '/api/undercurrent/feed?locale=en&limit=12', '/api/undercurrent/feed?locale=en&limit=12&refresh=1'),
    ...LOCALES.map((l) => warm(baseUrl, `/api/undercurrent/macro?locale=${l}&refresh=1`)),
  ]);
  out['feed:en'] = wave[0];
  LOCALES.forEach((l, i) => { out[`macro:${l}`] = wave[1 + i]; });

  const failures = Object.entries(out).filter(([, v]) => !v.ok).map(([k]) => k);
  const summary = { success: failures.length === 0, failures, targets: out, totalMs: Date.now() - startTime };
  console.log(`[Cron/UCWarm] ${summary.success ? '✅' : '⚠️'} ${JSON.stringify({ failures, totalMs: summary.totalMs })}`);
  // Always 200: partial failures self-heal next cycle (SWR keeps last-known-good),
  // and a 5xx would only make Vercel cron noise without changing behavior.
  return NextResponse.json(summary);
}
