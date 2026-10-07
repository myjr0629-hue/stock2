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

export const dynamic = 'force-dynamic';

function baseUrl(): string {
    // 자기 호출은 «공개 도메인» — 요청 origin 은 보호 경로라 자기 자신을 못 부를 수 있다(signum-warm 과 같은 함정)
    return process.env.NEXT_PUBLIC_SITE_URL || 'https://www.signumhq.com';
}

export async function GET() {
    const t0 = Date.now();
    const ph = etPhase(t0);
    const { fresh, maxStale } = intelFastWindow(ph.open);

    let envs: (IntelFastEnvelope | null)[] = INTEL_FAST_SECTORS.map(() => null);
    try { envs = await mgetFromCache<IntelFastEnvelope>(INTEL_FAST_SECTORS.map(intelFastKey)); } catch { /* 전부 missing 으로 — 화면이 예전 경로로 받는다 */ }

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
            const lock = 'perf:lock:intel-fast-all';
            if (!(await tryBackgroundLock(lock, 25))) return;
            try {
                await Promise.all(stale.map((sec) =>
                    fetch(`${baseUrl()}/api/intel/fast?sector=${sec}&refresh=1`, {
                        cache: 'no-store', signal: AbortSignal.timeout(50_000), headers: { 'user-agent': 'signum-intel-fast-all' },
                    }).then((r) => r.arrayBuffer()).catch(() => null)));
            } finally { await releaseBackgroundLock(lock); }
        });
    }

    return NextResponse.json({
        success: true,
        sectors,
        missing,
        meta: { phase: ph.key, open: ph.open, count: Object.keys(sectors).length, serverMs: Date.now() - t0 },
    });
}
