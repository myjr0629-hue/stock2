/**
 * EC2 크론 이전 — «EC2 가 방금 해냈으면 Vercel 은 건너뛴다» 판정 (2026-10-20)
 *
 * 배경: Vercel 10월 청구의 대부분이 Fluid Active CPU·Provisioned Memory 였고, 그중 매분 도는 크론(market-feed 등)을
 *   EC2 워커가 같은 서비스 함수·같은 Redis 키로 직접 수행하도록 옮겼다(scripts/ec2-cron/).
 *
 * 안전 장치(라우트는 지우지 않는다):
 *   · EC2 워커는 일을 «끝까지» 해낸 뒤(쓰기 + 주 저장소 다시 읽기 확인) 표식 cron:ec2:success:{job} 를 남긴다.
 *   · Vercel 크론은 표식이 신선하면(기본 120초 안) 즉시 200 으로 끝낸다.
 *   · 표식이 없거나·낡았거나·읽기에 실패하거나·미래 시각이면 → 예전과 똑같이 전부 실행(EC2 가 죽으면 자동 복귀).
 *   · EC2 가 일부만 실패했으면(failed 목록) → Vercel 은 그것만 채운다(부분 복귀).
 *   · 스위치: 환경변수 CRON_EC2_JOBS — 비우거나 'off'/'none'/'0' 이면 넘김 전부 끔(Vercel 이 항상 실행).
 *     설정하지 않으면 기본 목록(DEFAULT_EC2_JOBS)을 쓴다. 쉼표로 작업 이름을 나열하면 그 작업만 넘긴다.
 *
 * 표식은 ElastiCache(EC2 프록시)에만 있다(cron: 접두사는 Upstash 복제·폴백 대상이 아님). 프록시가 죽으면 표식도
 * 못 읽으므로 Vercel 이 실행하고, 그때 쓰기는 예전처럼 Upstash 로 간다 — 장애 때 동작이 이전과 같다.
 */

export const DEFAULT_EC2_JOBS: readonly string[] = ['market-feed'];

export interface Ec2SuccessMarker {
    /** 완료 시각(ms, EC2 시계) */
    at: number;
    /** 확인된 쓰기 수 */
    okCount?: number;
    /** 실패 항목(작업별 식별자 — market-feed 는 야후 심볼·'F&G') */
    failed?: string[];
    /** 기록한 워커 정보(관측용) */
    host?: string;
    version?: string;
    tookMs?: number;
}

export type HandoffDecision =
    | { action: 'run'; reason: string }
    | { action: 'skip'; reason: string; ageSec: number }
    | { action: 'partial'; reason: string; ageSec: number; only: string[] };

export function ec2MarkerKey(job: string): string {
    return `cron:ec2:success:${job}`;
}

/** CRON_EC2_JOBS 해석 — 순수 함수 */
export function ec2JobsFromEnv(raw: string | undefined): Set<string> {
    if (raw === undefined) return new Set(DEFAULT_EC2_JOBS);
    const v = raw.trim().toLowerCase();
    if (v === '' || v === 'off' || v === 'none' || v === '0' || v === 'false') return new Set();
    return new Set(v.split(',').map((s) => s.trim()).filter(Boolean));
}

/**
 * 순수 함수 — 표식을 보고 Vercel 이 할 일을 정한다.
 * @param maxAgeMs 이보다 오래된 표식은 «EC2 가 멈췄다»로 본다
 * @param partialMax 실패 항목이 이보다 많으면 부분이 아니라 전부 실행
 */
export function decideHandoff(marker: unknown, now: number, maxAgeMs: number, partialMax: number): HandoffDecision {
    if (!marker || typeof marker !== 'object') return { action: 'run', reason: 'no-marker' };
    const m = marker as Ec2SuccessMarker;
    if (typeof m.at !== 'number' || !Number.isFinite(m.at)) return { action: 'run', reason: 'bad-marker' };
    const age = now - m.at;
    if (age < -60_000) return { action: 'run', reason: 'future-marker' };   // 시계가 크게 어긋났다 → 믿지 않는다
    if (age > maxAgeMs) return { action: 'run', reason: 'stale-marker' };
    const ageSec = Math.max(0, Math.round(age / 1000));
    const failed = Array.isArray(m.failed) ? m.failed.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
    if (failed.length === 0) return { action: 'skip', reason: 'ec2-fresh', ageSec };
    if (failed.length > partialMax) return { action: 'run', reason: 'ec2-mostly-failed' };
    return { action: 'partial', reason: 'ec2-partial', ageSec, only: failed };
}

/**
 * 라우트에서 부른다. 읽기는 주 저장소(EC2 프록시) 권위 읽기 한 번 — 실패하면 «실행».
 * redisClient 는 판정이 필요할 때만 불러온다(무거운 import 를 넘김 판정 뒤로).
 */
export async function checkEc2Handoff(job: string, opts: { maxAgeMs?: number; partialMax?: number } = {}): Promise<HandoffDecision> {
    const jobs = ec2JobsFromEnv(process.env.CRON_EC2_JOBS);
    if (!jobs.has(job)) return { action: 'run', reason: 'switch-off' };
    try {
        const { getAuthoritativeCache } = await import('@/services/redisClient');
        const r = await getAuthoritativeCache<Ec2SuccessMarker>(ec2MarkerKey(job));
        if (!r.ok) return { action: 'run', reason: 'marker-read-failed' };
        return decideHandoff(r.value, Date.now(), opts.maxAgeMs ?? 120_000, opts.partialMax ?? 6);
    } catch {
        return { action: 'run', reason: 'marker-read-error' };
    }
}
