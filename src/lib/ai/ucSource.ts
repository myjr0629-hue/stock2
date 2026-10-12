/**
 * UC 종목 카드 «누가 생성을 불렀나» 시간별 카운터 (2026-10-12) — 전·후를 실측하려고 둔다.
 *   gen        = 사본이 없거나 갱신 요청이라 AI 생성을 시작한 횟수
 *   nogen_hit  = 생성 허용이 아닌 요청(봇·직접 방문)에 저장본을 내준 횟수
 *   nogen_miss = 생성 허용이 아닌 요청인데 저장본이 없어 «생성 없이» 돌려보낸 횟수 (= 아낀 생성 후보)
 * 키 uc:src:<시간>:<종류> · 9일 보존 · Upstash(INCRBYFLOAT) — 응답 뒤(after)에서만 부른다. 읽기: GET /api/admin/ai-ladder?attrib=1
 */
import { upstashStore, type LlmStore } from '@/lib/ai/llmStore';

export type UcSrcKind = 'gen' | 'nogen_hit' | 'nogen_miss';
export const UC_SRC_KINDS: UcSrcKind[] = ['gen', 'nogen_hit', 'nogen_miss'];
export const hourOf = (ms: number): string => new Date(ms).toISOString().slice(0, 13).replace(/[-T]/g, '');
export const ucSrcKey = (hour: string, kind: UcSrcKind): string => `uc:src:${hour}:${kind}`;

export async function bumpUcSrc(kind: UcSrcKind, now = Date.now(), store: LlmStore = upstashStore): Promise<void> {
    try { await store.incrByFloat(ucSrcKey(hourOf(now), kind), 1, 9 * 24 * 3600); } catch { /* 집계 실패는 응답에 닿지 않는다 */ }
}
