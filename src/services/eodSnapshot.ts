/**
 * 전 종목 EOD 스냅샷(`intrinio:eod:snapshot`, 12,512종목) — 그 세션의 «확정 정규장 종가·등락률·거래량».
 * 벌크 EOD 는 T+1 이다(마감 직후엔 전날치) — 쓰는 쪽이 날짜(date)를 반드시 대조한다.
 *
 * /api/market/movers 안에 있던 것을 그대로 옮겼다(2026-09-28). WIM 이 «마지막으로 끝난 세션»의
 * 무버를 장중에도 고를 수 있어야 해서다(장중엔 무버 API 가 오늘 값을 준다).
 * 읽기는 EC2 프록시만 — 큰 값(수백 KB)이라 Upstash 폴백으로 대역폭을 쓰지 않는다.
 */
export const EOD_SNAPSHOT_KEY = 'intrinio:eod:snapshot';
export type EodCloses = { date: string; rows: Map<string, { c: number; chgPct: number; v: number }> };
let _eodCache: { at: number; data: EodCloses | null } | null = null;

export async function readEodCloses(): Promise<EodCloses | null> {
    if (_eodCache && Date.now() - _eodCache.at < 5 * 60_000) return _eodCache.data;
    let data: EodCloses | null = null;
    try {
        const proxy = process.env.EC2_REDIS_PROXY_URL || 'http://52.23.98.13:8081';
        const auth = process.env.REDIS_PROXY_KEY || process.env.EC2_REDIS_PROXY_KEY || '';
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4000);
        try {
            const res = await fetch(`${proxy}/get?key=${encodeURIComponent(EOD_SNAPSHOT_KEY)}`, {
                headers: { Authorization: `Bearer ${auth}` }, signal: ctrl.signal, cache: 'no-store',
            });
            if (res.ok) {
                const raw = await res.json();
                const v = typeof raw?.result === 'string' ? JSON.parse(raw.result) : (raw?.result ?? raw?.value);
                if (v?.date && Array.isArray(v.rows)) {
                    const rows = new Map<string, { c: number; chgPct: number; v: number }>();
                    // 행 모양: [ticker, o, h, l, c, v, chg, chgPct]
                    for (const r of v.rows) {
                        const t = String(r?.[0] || '').toUpperCase();
                        const c = Number(r?.[4]);
                        if (t && Number.isFinite(c) && c > 0) rows.set(t, { c, chgPct: Number(r?.[7]) || 0, v: Number(r?.[5]) || 0 });
                    }
                    data = { date: String(v.date), rows };
                }
            }
        } finally { clearTimeout(timer); }
    } catch { data = null; }
    _eodCache = { at: Date.now(), data };
    return data;
}
