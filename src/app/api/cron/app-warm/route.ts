import { NextResponse } from 'next/server';
import { tryBackgroundLock, releaseBackgroundLock } from '@/lib/cache/staleLock';

/**
 * /api/cron/app-warm — 앱 화면의 «첫 숫자»를 늦추던 무거운 응답 3종을 미리 굽는다.
 *
 * 왜 (2026-10-07 앱 성능 실측, 운영·폰 UA):
 *   - 랭킹 /api/ranking?run=all     캐시 10분 → 식은 뒤 첫 사용자가 7~13초 계산을 기다림(화면 첫 숫자 12~15초)
 *   - 대시 /api/market/movers       캐시 60초 → 같은 8~9초
 *   - 인텔 /api/intel/fast ×10      응답 캐시 없음 → 섹터당 0.7~4.5초, KPI 는 10곳이 «전부» 와야 계산(3~20초)
 *   트래픽이 얇은 앱이라 «식은 뒤 첫 사람»이 곧 대부분의 사용자다 → 사람이 오기 전에 구워 둔다.
 *   각 라우트는 `?refresh=1` 이면 캐시·정상본을 읽지 않고 새로 계산해 저장한다(응답은 여기서 버린다).
 *   사용자 요청은 그 저장본을 즉시 받고(식었으면 «정상본 즉시 + 응답 뒤 갱신»), 이 크론은 그 저장본이 낡지 않게 한다.
 *
 * 주기(vercel.json, UTC): 평일 08~23시 5분마다(ET 04:00~19:59 = 프리~애프터) · 평일 00~07시와 주말 20분마다.
 *   라우트의 정상본 허용 나이(장중 10~30분 · 장외 12시간)가 이 주기보다 길어 «사용자가 계산을 기다리는 일»이 거의 없다.
 *
 * ⚠️ 목적은 «굽기»뿐이다. 실패해도 조용히 넘어간다(다음 주기·사용자 요청이 같은 일을 한다). 앱 동작에 영향을 주면 안 된다.
 * ⚠️ 자기 호출은 «공개 도메인»으로 — 요청 origin 은 크론이 도는 보호 경로라 자기 자신을 못 부른다(signum-warm 과 같은 함정).
 * ⚠️ 이 주소는 인증 없이 열려 있다(다른 워머와 같다) — 겹쳐 불리는 것을 막으려고 45초 잠금을 둔다.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SECTORS = [
    'm7', 'physical_ai', 'silicon_core', 'power_matrix', 'bio_pulse',
    'cyber_shield', 'orbit_defense', 'quantum_edge', 'fintech_pulse', 'cloud_fortress',
];

function baseUrl(): string {
    return process.env.NEXT_PUBLIC_SITE_URL || 'https://www.signumhq.com';
}

async function bake(path: string): Promise<{ path: string; ok: boolean; ms: number; cache?: string }> {
    const t0 = Date.now();
    try {
        const res = await fetch(`${baseUrl()}${path}`, {
            cache: 'no-store',
            signal: AbortSignal.timeout(55_000),
            headers: {
                'user-agent': 'signum-app-warm',
                ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
                    ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
                    : {}),
            },
        });
        // 본문은 버린다(굽는 것이 목적). 상태만 본다.
        await res.arrayBuffer();
        return { path: path.split('&refresh')[0], ok: res.ok, ms: Date.now() - t0 };
    } catch {
        return { path: path.split('&refresh')[0], ok: false, ms: Date.now() - t0 };
    }
}

export async function GET() {
    const t0 = Date.now();
    const LOCK = 'perf:lock:app-warm';
    if (!(await tryBackgroundLock(LOCK, 45))) {
        return NextResponse.json({ success: true, skipped: 'locked' });
    }
    try {
        const paths = [
            '/api/ranking?run=all&limit=5&refresh=1',
            '/api/market/movers?refresh=1',
            ...SECTORS.map((s) => `/api/intel/fast?sector=${s}&refresh=1`),
        ];
        // 서로 다른 함수 실행이라 동시에 던져도 서로의 예산을 먹지 않는다(각자 60초). 여기서는 끝나기만 기다린다.
        const results = await Promise.all(paths.map(bake));
        const failed = results.filter((r) => !r.ok);
        return NextResponse.json({
            success: true,
            baked: results.length,
            failed: failed.length,
            ...(failed.length ? { failures: failed.map((f) => f.path) } : {}),
            slowest: results.slice().sort((a, b) => b.ms - a.ms).slice(0, 3),
            totalMs: Date.now() - t0,
        });
    } finally {
        await releaseBackgroundLock(LOCK);
    }
}
