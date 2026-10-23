import { readOptionMetrics } from '@/services/optionMetricsService';
import { applyOptionMetrics } from '@/lib/optionMetrics';
import { readOptionAlpha } from '@/services/optionAlphaService';
import { applyPublishedAlpha } from '@/lib/publishedAlpha';
import { latestOptionsAsOf } from '@/lib/app/intelOptionsBasis';
// ============================================================================
// /api/intel/fast-all — 인텔 섹터 10곳의 «저장된 응답»을 한 번에 준다(가벼운 읽기 전용 경로).
//
// 왜 (2026-10-07 앱 성능 실측): 인텔 화면은 /api/intel/fast 를 섹터마다 «동시에 10번» 불렀다. 서버리스는 같은 함수에
//   동시 요청이 오면 인스턴스를 따로 띄운다 → 응답이 캐시 적중(서버 4ms)인데도 요청마다 0.7~1.2초(콜드스타트: 벤더·AWS·티커
//   라우트까지 끌어오는 무거운 모듈 초기화)가 걸렸고, KPI 는 10곳이 «전부» 와야 계산돼 가장 느린 것에 맞춰졌다.
//   이 라우트는 순수 함수 모듈(intelFastCache)과 Redis 클라이언트만 불러와 콜드스타트가 작고, 한 번에 10곳을 mget 으로 읽는다.
//
// 규칙은 /api/intel/fast 와 «같다»(같은 키·세션 칸·신선도 — lib/cache/intelFastCache). 쓰지는 않는다(쓰기는 무거운 라우트·크론).
//   · 저장본이 없거나 낡았거나 칸이 바뀐 섹터는 sectors 에서 빠지고 missing 에 적힌다 → 화면이 그 섹터만 예전 경로
//     (/api/intel/fast?sector=)로 받는다. 이 라우트가 실패해도 화면은 예전처럼 10번 부른다(안전망).
//   · 식은(stale) 섹터는 «정상본을 먼저 주고» 응답 뒤에 무거운 라우트를 ?refresh=1 로 불러 새로 굽는다(25초 잠금으로 폭주 방지).
// ============================================================================
import { NextResponse, after } from 'next/server';
import { mgetFromCache } from '@/services/redisClient';
import { tryBackgroundLock, releaseBackgroundLock, ageSec } from '@/lib/cache/staleLock';
import { INTEL_FAST_SECTORS, intelFastKey, etPhase, intelFastWindow, usableEnvelope, type IntelFastEnvelope } from '@/lib/cache/intelFastCache';
import { runPool } from '@/lib/asyncPool';
import { governorOff } from '@/lib/intelFastGovernor';

export const dynamic = 'force-dynamic';

/** 식은 섹터를 응답 뒤에 다시 구울 때 동시에 띄우는 수 */
const FAST_ALL_POOL = 2;

function baseUrl(): string {
    // 자기 호출은 «공개 도메인» — 요청 origin 은 보호 경로라 자기 자신을 못 부를 수 있다(signum-warm 과 같은 함정)
    return process.env.NEXT_PUBLIC_SITE_URL || 'https://www.signumhq.com';
}

export async function GET(request: Request) {
    const t0 = Date.now();
    // ★ [2026-10-07 앱 강화 정확성 2차] ?app=1 = 앱 전용 저장본(별도 키 · GEX·P/C 는 DynamoDB 최신 행 한 곳 · 행 시각 포함 · 허용 나이 30분). app 없음 = 예전 그대로.
    const app = new URL(request.url).searchParams.get('app') === '1';
    const ph = etPhase(t0);
    const { fresh, maxStale } = intelFastWindow(ph.open, app);

    let envs: (IntelFastEnvelope | null)[] = INTEL_FAST_SECTORS.map(() => null);
    try { envs = await mgetFromCache<IntelFastEnvelope>(INTEL_FAST_SECTORS.map((sec) => intelFastKey(sec, app))); } catch { /* 전부 missing 으로 — 화면이 예전 경로로 받는다 */ }

    const sectors: Record<string, any> = {};
    const stale: string[] = [];
    const missing: string[] = [];
    INTEL_FAST_SECTORS.forEach((sec, i) => {
        const env = envs[i];
        const ok = usableEnvelope(env, ph.key, t0, maxStale);
        if (!env || !ok) { missing.push(sec); return; }
        const isStale = ok.age > fresh;
        if (isStale) stale.push(sec);
        sectors[sec] = { ...env.body, meta: { ...env.body.meta, cache: isStale ? 'stale' : 'hit', cacheAgeSec: ageSec(ok.age) } };
    });

    if (stale.length > 0) {
        after(async () => {
            const lock = app ? 'perf:lock:intel-fast-all:app1' : 'perf:lock:intel-fast-all';
            if (!(await tryBackgroundLock(lock, 25))) return;
            try {
                const bake = (sec: string) =>
                    fetch(`${baseUrl()}/api/intel/fast?sector=${sec}&refresh=1${app ? '&app=1' : ''}`, {
                        cache: 'no-store', signal: AbortSignal.timeout(50_000), headers: { 'user-agent': 'signum-intel-fast-all' },
                    }).then((r) => r.arrayBuffer()).catch(() => null);
                // ★ [2026-10-13 Intrinio 429] 식은 섹터 «전부»를 같은 초에 따로 띄우면(실측: 10/12 23:18:52 한 번에 9곳 · 429 줄 21~22씩) 한도를 순간에 태운다 →
                //   한 번에 FAST_ALL_POOL 곳씩. 스위치 intel-fast-429:off 가 켜져 있으면 예전 그대로(전부 동시).
                if (await governorOff().catch(() => false)) await Promise.all(stale.map(bake));
                else await runPool(stale, FAST_ALL_POOL, bake);
            } finally { await releaseBackgroundLock(lock); }
        });
    }

    const quotes: any[] = Object.values(sectors).flatMap((s: any) => s.data ?? []);
    const metrics = await readOptionMetrics(quotes.map(q => q.ticker), { cache: true });
    const alpha = await readOptionAlpha(quotes.map(q => q.ticker), metrics, new Map(quotes.map(q => [q.ticker, {
        ...q, alphaSnapshot: { score: q.missingFields?.includes('alphaScore') ? null : q.alphaScore,
            grade: q.grade, capturedAt: q.alphaCapturedAt },
    }])));
    quotes.forEach(q => applyOptionMetrics(q, metrics.get(q.ticker)));
    quotes.forEach(q => applyPublishedAlpha(q, alpha.get(q.ticker)));
    Object.values(sectors).forEach((s: any) => {
        if (app || 'optionsAsOf' in s.meta) s.meta.optionsAsOf = latestOptionsAsOf(s.data ?? []);
    });
    return NextResponse.json({
        success: true,
        sectors,
        missing,
        meta: { phase: ph.key, open: ph.open, count: Object.keys(sectors).length, serverMs: Date.now() - t0, ...(app ? { app: true } : {}) },
    });
}
