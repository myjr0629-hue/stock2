export type FlowSqueezeLevel = 'low' | 'moderate' | 'high';
export interface FlowSqueeze { score: number | null; level: FlowSqueezeLevel | null }

/**
 * [2026-10-31 T37] 흐름 화면 «스퀴즈 분출 확률» 칸의 값.
 * 예전엔 FINRA 비중을 빼고 나면 IV Rank 하나가 그대로 «확률»이 됐다(NVDA IV Rank 98 → «98% 높음», 같은 시각 API 스퀴즈 위험 36·MEDIUM).
 * 이제 칸은 /api/live/ticker 의 flow.squeezeScore·squeezeRisk 만 그린다 — /api/command/unified 의 squeeze.riskScore·status 와
 * 같은 structure:v2 판(shortSqueezeMetrics: 구조 판이 있으면 그 값). 구조 점수가 없으면 화면이 /api/live/short-squeeze(커맨드 squeeze 카드와 같은 문)로 보충한다.
 * IV Rank·공매도 비중은 섞지 않는다. 점수가 없으면 null(화면 «—») · 등급이 없으면 등급만 null(지어내지 않는다 — 상태 줄 «—»).
 */
export function flowSqueeze(flow: any): FlowSqueeze {
    const raw = flow?.squeezeScore;
    const score = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 100 ? Math.round(raw) : null;
    if (score === null) return { score: null, level: null };
    const risk = typeof flow?.squeezeRisk === 'string' ? flow.squeezeRisk.toUpperCase() : null;
    const level: FlowSqueezeLevel | null = risk === 'LOW' ? 'low' : risk === 'MEDIUM' ? 'moderate'
        : risk === 'HIGH' || risk === 'EXTREME' || risk === 'CRITICAL' ? 'high' : null;
    return { score, level };
}
