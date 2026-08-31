// ============================================================================
// SIGNUM 앱 캐시 워머 — 「이관 후 로딩이 느려졌다」의 실제 해법.
// ----------------------------------------------------------------------------
// 대표 지적: 「이전과 비교했을 때 로딩이 느려졌다」
//
// 실측(2026-08-31 프로덕션):
//   /api/dashboard/unified   웜 243~274ms  ·  콜드 2.1s / 3.5s / **6.5s**
//   /api/command/unified     웜 227ms      ·  콜드 741ms
//   /api/live/ticker         웜 277ms      ·  콜드 665ms
//   → 느린 호출은 전부 «콜드»였다. 응답은 7KB·redis-hit 인데도 초가 걸린다.
//     서버리스 함수가 트래픽이 얇으면 금방 식고, 폰에서 앱을 새로 열 때마다
//     사용자가 그 콜드스타트를 그대로 맞는다.
//
// UC 가 겪은 것과 같은 문제다(uc-warm 참조). 해법도 같다 —
// 스케줄로 계속 두드려 **함수와 Redis 를 둘 다 데워 둔다.**
//
// ⚠️ 목적은 «데우기»이지 데이터 생성이 아니다. 응답은 버리고, 실패해도
//    조용히 넘어간다. 이 라우트가 앱 동작에 영향을 주면 안 된다.
// ============================================================================
import { NextResponse } from 'next/server';
import { setInCache } from '@/services/redisClient';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 칩에 먼저 뜨는 순서와 같다(cmd/flow 의 POPULAR_TICKERS 상위).
// 전부 데우면 크론이 길어진다 — 실제로 가장 많이 눌리는 앞쪽만.
const WARM_TICKERS = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL'];
const WARM_LOCALES = ['ko', 'en', 'ja'] as const;

function baseUrl(): string {
    // ⚠️ 내부 self-call 은 «공개 도메인»으로 쳐야 한다. 크론은 보호된 호스트에서
    //    돌기 때문에 request origin 을 쓰면 자기 자신을 못 부른다(전에 겪었다).
    return process.env.NEXT_PUBLIC_SITE_URL || 'https://www.signumhq.com';
}

// ══════════════════════════════════════════════════════════════
// [2026-08-31] 데우는 김에 «값도 본다».
//
// 대표 지적: 「왜 말할 때마다 찾는 것이야? 처음부터 완벽하게 하도록 해」
//   검사기를 만들어 놓고 «부르면 돌리는» 상태면 결국 대표가 먼저 발견한다.
//   워머는 이미 49개 엔드포인트의 응답을 받고 있다 — 버리지 말고 검사한다.
//
// 항목은 우리가 실제로 겪은 실패에서 왔다. 위반은 Redis(`signum:audit:last`)에
// 남겨 어느 세션에서든 즉시 읽을 수 있게 한다.
// ══════════════════════════════════════════════════════════════
function inspect(path: string, body: any): string[] {
    const bad: string[] = [];
    const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : null);
    if (!body || typeof body !== 'object') return [`${path} 본문이 JSON 이 아니다`];
    if ((body as any).error) return [`${path} error: ${String(JSON.stringify((body as any).error)).slice(0, 80)}`];

    if (path.startsWith('/api/live/ticker')) {
        const base = n(body.prices?.prevRegularClose);
        const price = n(body.price);
        const vw = n(body.vwap);
        if (!base) bad.push(`${path} 기준선이 없다`);
        // 기준선이 한 세션 밀리면 여기서 걸린다 (2026-08-31 실제 사고)
        if (base && price && Math.abs(price - base) / base > 0.25) bad.push(`${path} 가격이 기준선에서 25% 이상`);
        // VWAP 이 종가의 1/3 로 «지어지던» 사고
        if (vw && price && Math.abs(price / vw - 3) < 0.25) bad.push(`${path} VWAP 이 가격의 1/3`);
        const bd = body.baseline?.dateET;
        if (bd) { const d = new Date(`${bd}T12:00:00Z`).getUTCDay(); if (d === 0 || d === 6) bad.push(`${path} 기준선 날짜가 주말(${bd})`); }
    }
    if (path.startsWith('/api/debug/guardian')) {
        const s = JSON.stringify(body);
        for (const k of ['rlsi', 'RLSI', 'breadth', 'marketBreadth']) {
            const m = s.match(new RegExp(`"${k}":\\s*([-\\d.]+)`));
            if (m && Number(m[1]) === 0) bad.push(`${path} ${k} 가 0`);
        }
    }
    if (path.startsWith('/api/intel/snapshot')) {
        const s = JSON.stringify(body);
        if (/"tickers":\s*\[\s*\]/.test(s) || /"items":\s*\[\s*\]/.test(s)) bad.push(`${path} 종목 목록이 비었다`);
    }
    if (path.startsWith('/api/market/movers')) {
        const up = (body as any).gainers || [], dn = (body as any).losers || [];
        if (!up.length && !dn.length) bad.push(`${path} 상승·하락이 둘 다 비었다`);
        if (up.some((r: any) => (n(r.changePercent) ?? 0) < 0)) bad.push(`${path} 상승 목록에 하락 종목`);
        if (dn.some((r: any) => (n(r.changePercent) ?? 0) > 0)) bad.push(`${path} 하락 목록에 상승 종목`);
    }
    return bad;
}

async function warm(path: string): Promise<{ path: string; ok: boolean; ms: number; bad: string[] }> {
    const t0 = Date.now();
    try {
        const res = await fetch(`${baseUrl()}${path}`, {
            signal: AbortSignal.timeout(20_000),
            cache: 'no-store',
            headers: {
                ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
                    ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
                    : {}),
            },
        });
        // 검사 대상만 파싱한다 — 나머지는 데우기만 하면 되므로 본문을 버린다
        const CHECKED = /\/api\/(live\/ticker|debug\/guardian|intel\/snapshot|market\/movers)/;
        let bad: string[] = [];
        if (CHECKED.test(path)) {
            const body = await res.json().catch(() => null);
            bad = res.ok ? inspect(path, body) : [`${path} HTTP ${res.status}`];
        } else {
            await res.arrayBuffer();
        }
        return { path, ok: res.ok, ms: Date.now() - t0, bad };
    } catch {
        return { path, ok: false, ms: Date.now() - t0, bad: [] };
    }
}

export async function GET() {
    const t0 = Date.now();

    const paths: string[] = [
        // Dashboard 화면
        '/api/dashboard/unified',
        '/api/live/market',
        '/api/market/index-close',
        '/api/market/movers',
        '/api/market/macro',
        `/api/live/quotes?symbols=${WARM_TICKERS.join(',')}`,
        // Guardian 화면
        '/api/debug/guardian',
        '/api/guardian/briefing',
        '/api/guardian/economic-calendar',
        '/api/guardian/fedwatch',
        '/api/guardian/news-digest',
        // Intel 화면 — 섹터별로 캐시가 갈린다
        '/api/intel/cross-sector-brief',
        ...['m7', 'silicon_core', 'power_matrix', 'bio_pulse', 'cloud_fortress'].map((s) => `/api/intel/snapshot?sector=${s}`),
    ];
    // Flow 화면 (대표 종목 하나면 함수가 데워진다)
    paths.push('/api/flow/dark-pool-trades?ticker=NVDA&limit=10');
    paths.push('/api/flow/iv-percentile?t=NVDA');
    paths.push('/api/command/insider?ticker=NVDA');

    for (const t of WARM_TICKERS) {
        paths.push(`/api/live/ticker?t=${t}&chain=0`);
        paths.push(`/api/live/analyst?t=${t}`);
        paths.push(`/api/live/fundamentals?t=${t}`);
        paths.push(`/api/live/earnings?t=${t}`);
    }
    // command/unified 는 로케일별로 캐시가 갈린다 — 셋 다 데워야 ko 만 빠르지 않다.
    for (const t of WARM_TICKERS.slice(0, 3)) {
        for (const l of WARM_LOCALES) paths.push(`/api/command/unified?t=${t}&lang=${l}`);
    }

    // 한꺼번에 다 쏘면 스스로를 느리게 만든다 — 6개씩 끊어서.
    const results: { path: string; ok: boolean; ms: number; bad: string[] }[] = [];
    for (let i = 0; i < paths.length; i += 6) {
        results.push(...await Promise.all(paths.slice(i, i + 6).map(warm)));
    }

    const failed = results.filter((r) => !r.ok);
    const violations = results.flatMap((r) => r.bad);

    // 대표가 화면에서 발견하기 전에 잡히게 — 로그와 Redis 양쪽에 남긴다.
    if (violations.length) {
        console.error(`[signum-warm] ⚠ 정합성 위반 ${violations.length}건`, violations.slice(0, 10));
    }
    try {
        await setInCache('signum:audit:last', {
            at: Date.now(), checked: results.length, violations,
        }, 3600);
    } catch { /* 워머가 이것 때문에 죽으면 안 된다 */ }

    return NextResponse.json({
        success: true,
        warmed: results.length,
        failed: failed.length,
        violations,
        slowest: results.slice().sort((a, b) => b.ms - a.ms).slice(0, 3),
        ...(failed.length ? { failures: failed.map((f) => f.path) } : {}),
        totalMs: Date.now() - t0,
    });
}
