import { squeezeRiskOf } from '@/lib/metrics/squeeze';

export type FlowSqueezeLevel = 'low' | 'moderate' | 'high';
export interface FlowSqueeze { score: number | null; level: FlowSqueezeLevel | null }

/**
 * [2026-10-31 T37] 흐름 화면 «스퀴즈 분출 확률» 칸의 값.
 * 예전엔 FINRA 비중을 빼고 나면 IV Rank 하나가 그대로 «확률»이 됐다(NVDA IV Rank 98 → «98% 높음», 같은 시각 API 스퀴즈 위험 36·MEDIUM).
 * 이제 칸은 /api/live/ticker 의 flow.squeezeScore·squeezeRisk 만 그린다 — /api/command/unified 의 squeeze.riskScore·status 와
 * 같은 structure:v2 판(shortSqueezeMetrics: 구조 판이 있으면 그 값). IV Rank·공매도 비중은 섞지 않는다. 값이 없으면 null(화면 «—»).
 */
export function flowSqueeze(flow: any): FlowSqueeze {
    const raw = flow?.squeezeScore;
    const score = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 100 ? Math.round(raw) : null;
    if (score === null) return { score: null, level: null };
    const risk = typeof flow?.squeezeRisk === 'string' ? flow.squeezeRisk.toUpperCase() : null;
    const status = risk === 'LOW' || risk === 'MEDIUM' || risk === 'HIGH' || risk === 'EXTREME' || risk === 'CRITICAL' ? risk : squeezeRiskOf(score);
    const level: FlowSqueezeLevel = status === 'LOW' ? 'low' : status === 'MEDIUM' ? 'moderate' : 'high';
    return { score, level };
}
