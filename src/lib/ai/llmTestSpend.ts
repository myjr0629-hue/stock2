/**
 * 시험 호출 지출 표식 (2026-10-12) — /api/admin/ai-ab 가 쓴 크레딧은 월 원장(llm:cost)에는 더해지지만 호출 기록(llm:calls)에는 없어
 *   «추적 안 되는 지출»로 보였다(10/12 실측: 24시간 원장 $20.8 중 호출 기록 $11.2 — 나머지 $9.3 은 전부 이 길의 시험 호출).
 * 이제 시험 호출마다 시간별 목록 llm:testcalls:<시간> 에 {t, tag, usd, m} 한 줄을 남긴다(9일). tag 는 요청 본문의 tag(없으면 'untagged').
 * 읽기: GET /api/admin/ai-ladder?attrib=1 → attribution.testUsd · byTag. 원장·페이싱 계산은 그대로(시험도 실제 크레딧이다).
 */
import { upstashStore, type LlmStore } from '@/lib/ai/llmStore';

export const testCallsKey = (hour: string): string => `llm:testcalls:${hour}`;
const hourOf = (ms: number): string => new Date(ms).toISOString().slice(0, 13).replace(/[-T]/g, '');

export function cleanTag(t: unknown): string {
    const s = String(t ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);
    return s || 'untagged';
}

export interface TestSpendRecord { t: number; tag: string; usd: number; m: string }

export async function recordTestSpend(tag: unknown, usd: number, model: string, now = Date.now(), store: LlmStore = upstashStore): Promise<void> {
    if (!(usd > 0)) return;
    const rec: TestSpendRecord = { t: now, tag: cleanTag(tag), usd: Math.round(usd * 1e6) / 1e6, m: String(model).slice(0, 32) };
    try { await store.rpush(testCallsKey(hourOf(now)), JSON.stringify(rec), 9 * 24 * 3600); } catch { /* 표식 실패는 호출에 영향 없음 */ }
}

/** 줄들을 [sinceMs, untilMs) 로 걸러 합친다. 깨진 줄은 건너뛴다. */
export function sumTestSpend(lines: string[], sinceMs: number, untilMs: number): { usd: number; n: number; byTag: Record<string, number> } {
    let usd = 0, n = 0;
    const byTag: Record<string, number> = {};
    for (const l of lines) {
        try {
            const r = JSON.parse(l) as TestSpendRecord;
            if (!(r.t >= sinceMs && r.t < untilMs) || !(r.usd > 0)) continue;
            usd += r.usd; n++; byTag[r.tag] = Math.round(((byTag[r.tag] || 0) + r.usd) * 1e6) / 1e6;
        } catch { /* skip */ }
    }
    return { usd: Math.round(usd * 1e6) / 1e6, n, byTag };
}
