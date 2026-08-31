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

async function warm(path: string): Promise<{ path: string; ok: boolean; ms: number }> {
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
        await res.arrayBuffer();          // 본문을 버린다 — 파싱할 이유가 없다
        return { path, ok: res.ok, ms: Date.now() - t0 };
    } catch {
        return { path, ok: false, ms: Date.now() - t0 };
    }
}

export async function GET() {
    const t0 = Date.now();

    const paths: string[] = [
        '/api/dashboard/unified',
        `/api/live/quotes?symbols=${WARM_TICKERS.join(',')}`,
    ];
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
    const results: { path: string; ok: boolean; ms: number }[] = [];
    for (let i = 0; i < paths.length; i += 6) {
        results.push(...await Promise.all(paths.slice(i, i + 6).map(warm)));
    }

    const failed = results.filter((r) => !r.ok);
    return NextResponse.json({
        success: true,
        warmed: results.length,
        failed: failed.length,
        slowest: results.slice().sort((a, b) => b.ms - a.ms).slice(0, 3),
        ...(failed.length ? { failures: failed.map((f) => f.path) } : {}),
        totalMs: Date.now() - t0,
    });
}
