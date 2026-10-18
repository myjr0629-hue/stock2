/** A missing/invalid VWAP is never a zero-dollar price. */
export function normalizeVwap(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** Only an omitted field may fall back; explicit null invalidates older sources. */
export function selectVwap(...sources: unknown[]): number | null {
    return normalizeVwap(sources.find(value => value !== undefined));
}

/** Preserve a measured zero distance; only calculate with valid positive prices. */
export function vwapDistancePct(price: unknown, vwap: unknown, reportedDistance?: unknown): number | null {
    const validVwap = normalizeVwap(vwap);
    if (validVwap === null || typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return null;
    if (typeof reportedDistance === 'number' && Number.isFinite(reportedDistance)) return reportedDistance;
    const distance = ((price - validVwap) / validVwap) * 100;
    return Number.isFinite(distance) ? distance : null;
}

/**
 * 정규장 분봉으로 계산한 세션 VWAP — Σ(전형가격×거래량) ÷ Σ거래량.
 * 원천 스냅샷에는 VWAP 필드가 없다(10/17 가짜 근사치 제거 뒤 장중·주말 모두 «—»였다).
 * 차트(/api/chart 1d)가 이미 캐시한 같은 원천의 봉을 쓰므로 공급사 호출이 늘지 않는다.
 * 1분봉 안의 체결 분포는 원천에 없으므로 봉마다 전형가격(고+저+종)/3 을 그 봉 거래량으로 가중한다 — 분봉 VWAP 의 표준 산식
 * (일봉 하나의 (고+저+종)/3 «가짜 VWAP»과 다르다: 390개 봉이 거래량 분포를 담는다. 오차는 봉 안 가격 폭 이내).
 * 가장 최근 «정규장 봉이 있는» 날짜 하나만 쓴다 — 주말·휴장엔 마지막 거래일, 장중엔 오늘의 누적값.
 */
export function sessionVwapFromBars(rows: unknown): { vwap: number; date: string; bars: number } | null {
    if (!Array.isArray(rows)) return null;
    const reg = rows.filter((b: any) => b && b.session === 'REG' && typeof b.etDate === 'string'
        && Number(b.volume) > 0 && [b.high, b.low, b.close].every(x => typeof x === 'number' && Number.isFinite(x) && x > 0));
    if (!reg.length) return null;
    const date = reg.reduce((m: string, b: any) => (b.etDate > m ? b.etDate : m), '');
    let pv = 0, vol = 0, n = 0;
    for (const b of reg as any[]) {
        if (b.etDate !== date) continue;
        pv += ((b.high + b.low + b.close) / 3) * b.volume; vol += b.volume; n++;
    }
    const vwap = vol > 0 ? Math.round((pv / vol) * 10000) / 10000 : null;
    return vwap !== null && Number.isFinite(vwap) && vwap > 0 ? { vwap, date, bars: n } : null;
}
