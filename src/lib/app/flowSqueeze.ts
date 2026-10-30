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

/**
 * [T37] 구조 점수가 없을 때의 보충 — 커맨드 squeeze 카드와 같은 문(/api/live/short-squeeze · shortSqueezeMetrics).
 * 요청·본문 전체를 limitMs 상한으로 묶는다(abort + 타이머 경쟁) — 본문이 멈춰도 호출자(갱신 흐름·AI 재료 준비)는 상한 뒤 진행한다.
 * 돌려주는 값: 그 종목의 응답 { score, risk } · 실패·시간 초과·다른 종목 = null.
 */
export async function fetchSqueezeFallback(
    ticker: string,
    deps: { fetch: typeof fetch; setTimeout: (fn: () => void, ms: number) => any; clearTimeout: (id: any) => void },
    limitMs = 6000,
): Promise<{ score: unknown; risk: unknown } | null> {
    const t = String(ticker || '').toUpperCase();
    const ctl = new AbortController();
    let tm: any = null;
    const limit = new Promise<null>((resolve) => { tm = deps.setTimeout(() => { ctl.abort(); resolve(null); }, limitMs); });
    try {
        const j: any = await Promise.race([
            (async () => {
                const r = await deps.fetch(`/api/live/short-squeeze?t=${encodeURIComponent(t)}`, { signal: ctl.signal, cache: 'no-store' });
                return r && r.ok ? r.json() : null;
            })(),
            limit,
        ]);
        if (!j || String(j.ticker ?? '').toUpperCase() !== t) return null;
        return { score: j.riskScore, risk: j.status };
    } catch {
        return null;
    } finally {
        deps.clearTimeout(tm);
    }
}
