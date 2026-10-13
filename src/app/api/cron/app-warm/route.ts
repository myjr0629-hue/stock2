import { NextResponse } from 'next/server';
import { tryBackgroundLock, releaseBackgroundLock } from '@/lib/cache/staleLock';
import { runPool } from '@/lib/asyncPool';
import { governorOff } from '@/lib/intelFastGovernor';

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
 *
 * ★ [2026-10-13 Intrinio 429] 인텔 섹터 10곳을 «같은 초에» 따로 띄우던 것을 한 번에 INTEL_POOL 곳씩으로 줄였다(실측: 10/12 24시간 /api/intel/fast 3,496건 중 사람 7건 ·
 *   이 크론 2,160건 · 429 로그 줄 1,910 중 1,383줄). 서버리스는 같은 라우트의 동시 호출마다 인스턴스가 따로 떠서 인스턴스별 동시성 상한이 소용없다 — 호출하는 쪽이 지킨다.
 *   시작 섹터는 주기마다 돌려(앞에 오는 섹터가 늘 같지 않게) 시간 상한에 걸려도 같은 섹터만 굶지 않는다. 스위치 intel-fast-429:off 가 켜져 있으면 «예전 그대로»(10곳 동시).
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SECTORS = [
    'm7', 'physical_ai', 'silicon_core', 'power_matrix', 'bio_pulse',
    'cyber_shield', 'orbit_defense', 'quantum_edge', 'fintech_pulse', 'cloud_fortress',
];

/** 인텔 섹터 갱신을 동시에 몇 곳까지 띄우는가(섹터당 1.5~10초 → 10곳 약 15~30초) */
const INTEL_POOL = 3;
/** 새 섹터를 시작하는 시한(이 함수 maxDuration 60초 − 마지막 한 곳이 끝날 여유) */
const INTEL_START_BUDGET_MS = 38_000;

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
        const others = [
            '/api/ranking?run=all&limit=5&refresh=1',
            '/api/market/movers?refresh=1',
        ];
        // ★ [2026-10-07 앱 강화 정확성 2차] 앱 화면은 앱 전용 저장본(app=1 — 별도 키)을 읽는다 → 그것을 굽는다. 옛 경로(웹 SSR)는 signum-warm 이 굽는다.
        const sectorPaths = SECTORS.map((s) => `/api/intel/fast?sector=${s}&app=1&refresh=1`);
        let results: Array<{ path: string; ok: boolean; ms: number; cache?: string; skipped?: boolean }>;
        const gov = !(await governorOff().catch(() => false));
        if (gov) {
            // 시작 섹터를 주기마다 돌린다(5분 칸 번호 기준) — 시간 상한에 걸려도 같은 섹터만 굶지 않는다.
            const rot = Math.floor(t0 / 300_000) % sectorPaths.length;
            const ordered = sectorPaths.slice(rot).concat(sectorPaths.slice(0, rot));
            const [o, sec] = await Promise.all([
                Promise.all(others.map(bake)),
                runPool(ordered, INTEL_POOL, bake, { deadlineAt: t0 + INTEL_START_BUDGET_MS }),
            ]);
            results = [...o, ...sec.map((r, i) => r ?? { path: ordered[i].split('&refresh')[0], ok: false, ms: 0, skipped: true })];
        } else {
            // 스위치가 켜져 있으면 예전 그대로 — 서로 다른 함수 실행이라 동시에 던져도 서로의 예산을 먹지 않는다(각자 60초). 여기서는 끝나기만 기다린다.
            results = await Promise.all([...others, ...sectorPaths].map(bake));
        }
        const failed = results.filter((r) => !r.ok);
        const skipped = results.filter((r) => r.skipped);
        return NextResponse.json({
            success: true,
            baked: results.length - skipped.length,
            failed: failed.length,
            ...(skipped.length ? { notStarted: skipped.map((f) => f.path) } : {}),
            ...(failed.length ? { failures: failed.map((f) => f.path) } : {}),
            slowest: results.slice().sort((a, b) => b.ms - a.ms).slice(0, 3),
            totalMs: Date.now() - t0,
            pool: gov ? INTEL_POOL : 0,
        });
    } finally {
        await releaseBackgroundLock(LOCK);
    }
}
