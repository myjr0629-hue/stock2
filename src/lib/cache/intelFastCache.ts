// ============================================================================
// 인텔 섹터 응답 캐시(perf:intel-fast:v1:<섹터>) — 무거운 라우트(/api/intel/fast)와 가벼운 라우트(/api/intel/fast-all)가
// «같은 규칙»으로 읽고 쓰도록 키·세션 칸·신선도를 한곳에 둔다. 서버 전용이지만 import 는 없다(순수 함수) —
// 가벼운 라우트의 콜드스타트가 무거운 모듈(벤더·AWS·티커 라우트)을 끌어오지 않게 하려는 분리다.
// ============================================================================
import { etDateOf } from '@/lib/marketCalendar';

export const INTEL_FAST_SECTORS = [
    'm7', 'physical_ai', 'silicon_core', 'power_matrix', 'bio_pulse',
    'cyber_shield', 'orbit_defense', 'quantum_edge', 'fintech_pulse', 'cloud_fortress',
] as const;

export const INTEL_FAST_STORE_TTL_SEC = 12 * 3600;

export const intelFastKey = (sector: string): string => `perf:intel-fast:v1:${sector}`;

/** ET «세션 칸» — 시각만으로 정한다(벤더 호출 없음). 칸이 바뀌면 저장본은 쓰지 않는다. */
export function etPhase(now = Date.now()): { key: string; open: boolean } {
    const et = new Date(new Date(now).toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const hm = et.getHours() * 60 + et.getMinutes();
    const dow = et.getDay();
    const phase = hm >= 240 && hm < 570 ? 'pre' : hm >= 570 && hm < 960 ? 'reg' : hm >= 960 && hm < 1200 ? 'post' : 'night';
    // 주말·휴장일에는 칸이 «열려 있는 시각»이어도 값이 안 움직인다 → open 은 평일만(휴장 평일은 신선 기준이 빡빡할 뿐 틀리지 않는다)
    return { key: `${etDateOf(now)}:${phase}`, open: phase !== 'night' && dow >= 1 && dow <= 5 };
}

/** 신선(그대로 응답) · 허용 나이(이 안이면 정상본을 먼저 주고 뒤에서 갱신) — 장중 20초/10분, 장외 5분/12시간 */
export function intelFastWindow(open: boolean): { fresh: number; maxStale: number } {
    return open ? { fresh: 20_000, maxStale: 10 * 60_000 } : { fresh: 5 * 60_000, maxStale: 12 * 3600_000 };
}

export interface IntelFastEnvelope { at: number; phase: string; body: any }

/** 저장본이 «지금 쓸 수 있는가» — 같은 칸 · 성공 본문 · 종목 있음 · 나이가 허용 안 */
export function usableEnvelope(env: IntelFastEnvelope | null | undefined, phaseKey: string, now: number, maxStale: number): { age: number } | null {
    if (!env || env.phase !== phaseKey || !env.body?.success || !Array.isArray(env.body.data) || env.body.data.length === 0) return null;
    const age = now - Number(env.at);
    if (!Number.isFinite(age) || age < 0 || age > maxStale) return null;
    return { age };
}
