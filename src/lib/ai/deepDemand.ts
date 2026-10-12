/**
 * 딥 분석 «실제 열람» 수요 집계 (2026-10-12) — 예열(/api/cron/ai-warm) 대상을 고정 20종목에서 «사용자가 실제로 연 종목 상위»로 바꾸기 위한 계측.
 *
 * 무엇을 세나: 사용자 요청 중 재료가 완결된 것(= 화면에서 AI 딥 분석을 연 것)만. 예열(WARM)·탐침(재료 미완결)은 세지 않는다.
 * 어떻게: ET 거래일별 JSON 한 개 deep:demand:<YYYY-MM-DD> = {"NVDA":3,...} (Upstash · 10일). 하루 약 70건이라 읽고-더하고-쓰기의 경합 손실은 무시할 수준이다.
 *        응답 뒤(after)에서만 쓴다 — 딥 분석 대기 시간에 영향 없음.
 * 어떻게 뽑나: 오늘(지금까지) + 지난 6일, 하루 지날 때마다 0.8배 — 점수 1 이상인 종목만, 점수 내림차순·같으면 이름순 상위 N.
 *        수요가 확인된 종목만 나온다(없으면 빈 목록 — 예열은 아무것도 하지 않는다).
 */
import { upstashStore, type LlmStore } from '@/lib/ai/llmStore';

export const demandKey = (etDay: string): string => `deep:demand:${etDay}`;
export const DEMAND_TTL_SEC = 10 * 24 * 3600;
export const DEMAND_DECAY = 0.8;
export const DEMAND_DAYS = 7;

export const cleanDemandTicker = (t: unknown): string | null => {
    const s = String(t ?? '').toUpperCase();
    return /^[A-Z][A-Z0-9.]{0,6}$/.test(s) ? s : null;
};

type Counts = Record<string, number>;

/** 한 번의 열람을 더한다. 던지지 않는다. */
export async function noteDeepView(ticker: unknown, etDay: string, store: LlmStore = upstashStore): Promise<void> {
    const T = cleanDemandTicker(ticker);
    if (!T) return;
    try {
        const raw = await store.get(demandKey(etDay));
        let cur: Counts = {};
        if (raw) { try { const j = JSON.parse(raw); if (j && typeof j === 'object' && !Array.isArray(j)) cur = j as Counts; } catch { cur = {}; } }
        cur[T] = (Number(cur[T]) || 0) + 1;
        await store.setEx(demandKey(etDay), JSON.stringify(cur), DEMAND_TTL_SEC);
    } catch { /* 계측 실패는 응답에 닿지 않는다 */ }
}

/** days[0] = 오늘(가장 최근), days[1] = 어제 … 의 집계로 상위 n. 순수 함수. */
export function topDemand(days: Array<Counts | null | undefined>, n = 10, minScore = 1): Array<{ ticker: string; score: number }> {
    const score = new Map<string, number>();
    days.forEach((m, age) => {
        if (!m) return;
        const w = Math.pow(DEMAND_DECAY, age);
        for (const [t, c] of Object.entries(m)) {
            const T = cleanDemandTicker(t);
            const k = Number(c);
            if (!T || !(k > 0)) continue;
            score.set(T, (score.get(T) || 0) + k * w);
        }
    });
    return [...score.entries()]
        .filter(([, s]) => s >= minScore - 1e-9)
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .slice(0, Math.max(0, n))
        .map(([ticker, s]) => ({ ticker, score: Math.round(s * 1000) / 1000 }));
}

/** 직전 DEMAND_DAYS 일의 집계를 읽어 상위 n. etDays = [오늘, 어제, …] (달력 날짜 문자열). 읽기 실패한 날은 비어 있는 것으로 본다. */
export async function loadDemandTop(etDays: string[], n = 10, store: LlmStore = upstashStore): Promise<Array<{ ticker: string; score: number }>> {
    const maps = await Promise.all(etDays.slice(0, DEMAND_DAYS).map(async (d) => {
        try { const raw = await store.get(demandKey(d)); const j = raw ? JSON.parse(raw) : null; return j && typeof j === 'object' && !Array.isArray(j) ? (j as Counts) : null; } catch { return null; }
    }));
    return topDemand(maps, n);
}
