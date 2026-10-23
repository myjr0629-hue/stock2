/**
 * 캐시가 들고 있는 «가격 파생값»을 최신 종가로 맞춘다 — 감사 10/23 M1·M7·M9.
 *
 * 모든 읽기는 이미 적재된 EOD(벌크·세션 캡처·20거래일 종가 행렬)뿐이다 — 벤더 API 콜 0.
 * 필요한 종가가 없으면 원래 값을 그대로 돌려준다(빈칸을 만들지 않는다).
 */
import { peekCloseOn, peekLatestCloseRow, peekOfficialSessionClose } from './intrinioClient';
import { harvestBasisDate, isPriceBasis, makePriceBasis, rebaseFundamentals, valuationBasisDate } from '@/lib/valuationRebase';
import { etDateOf, etMinutesOf, isNonTradingDay, prevTradingDate, sessionCloseMinutes } from '@/lib/marketCalendar';

/** 막 읽은 원천 값(f)에 기준을 붙인다. readAtMs 로 기준일을 못 정하면 f 그대로. */
export async function stampFreshValuation<T>(ticker: string, f: T, readAtMs: number, raw: Record<string, number | null> = {}): Promise<T> {
    try {
        const date = valuationBasisDate(readAtMs);
        if (!date || !f) return f;
        const basis = makePriceBasis(f, date, await peekCloseOn(ticker, date), raw);
        return basis ? { ...(f as any), _priceBasis: basis } : f;
    } catch { return f; }
}

/** 기준이 없는 DynamoDB 재무(기록 시각 recordTs)에 수확 일정으로 추정한 기준을 붙인다. */
export async function stampHarvestedValuation<T>(ticker: string, f: T, recordTs: number): Promise<T> {
    try {
        if (!f || isPriceBasis((f as any)._priceBasis)) return f;
        const date = harvestBasisDate(recordTs);
        if (!date) return f;
        const basis = makePriceBasis(f, date, await peekCloseOn(ticker, date), {}, true);
        return basis ? { ...(f as any), _priceBasis: basis } : f;
    } catch { return f; }
}

/** 기준이 붙은 재무를 최신 종가로 환산한다. */
export async function repriceFundamentals<T>(ticker: string, f: T): Promise<T> {
    try {
        if (!f || !isPriceBasis((f as any)?._priceBasis)) return f;
        const latest = await peekLatestCloseRow(ticker);
        return rebaseFundamentals(f, latest);
    } catch { return f; }
}

/**
 * [M9] unified 캐시(timestamp = 만든 시각)의 연관 종목 가격·등락 — 만든 뒤에 끝난 정규장이 있으면 그 종가·등락으로 바꾼다.
 * 캐시가 최신 종가보다 새로우면(장중에 만든 값 등) 손대지 않는다.
 */
export async function repriceRelated(related: any, cachedAtMs: number): Promise<any> {
    try {
        const list = related?.topRelated;
        if (!Array.isArray(list) || !list.length || !(Number.isFinite(cachedAtMs) && cachedAtMs > 0)) return related;
        let changed = false;
        const next = await Promise.all(list.map(async (item: any) => {
            if (!item || typeof item.ticker !== 'string') return item;
            const row = await peekLatestCloseRow(item.ticker).catch(() => null);
            if (!row || row.prevClose === null || !(row.close > 0)) return item;
            if (!(sessionCloseMs(row.date) > cachedAtMs)) return item;
            changed = true;
            return {
                ...item,
                price: Math.round(row.close * 100) / 100,
                prevClose: row.prevClose,
                change: Math.round(((row.close - row.prevClose) / row.prevClose) * 10000) / 100,
            };
        }));
        return changed ? { ...related, topRelated: next } : related;
    } catch { return related; }
}

/**
 * [M1·M9] command/unified 의 모든 출구 공통 — 판본(data)의 재무 밸류에이션은 기준 종가(_priceBasis)가 적힌 경우만 최신 종가로,
 * 연관 종목은 판본을 만든 뒤(data.timestamp) 끝난 정규장이 있으면 그 종가·등락으로. 바뀐 게 없으면 data 그대로.
 */
export async function repriceCachedDerived(data: any, ticker?: string | null): Promise<any> {
    if (!data || typeof data !== 'object') return data;
    try {
        const sym = String(ticker || data.ticker || data.fundamentals?.ticker || '').toUpperCase();
        const [fundamentals, related] = await Promise.all([
            sym && data.fundamentals ? repriceFundamentals(sym, data.fundamentals) : data.fundamentals,
            data.related ? repriceRelated(data.related, Number(data.timestamp)) : data.related,
        ]);
        if (fundamentals === data.fundamentals && related === data.related) return data;
        return { ...data, fundamentals, related };
    } catch { return data; }
}

/** 'YYYY-MM-DD' 정규장 마감 시각(ms) — ET 오프셋은 그날 정오의 오프셋으로 정한다. */
function sessionCloseMs(date: string): number {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
    if (!m) return Number.POSITIVE_INFINITY;
    const noonUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], 12);
    const etNoonMin = etMinutesOf(noonUtc);           // 12:00 UTC 의 ET 분 (EDT 480 · EST 420)
    const offsetMin = 12 * 60 - etNoonMin;            // UTC − ET
    return Date.UTC(+m[1], +m[2] - 1, +m[3]) + (sessionCloseMinutes(date) + offsetMin) * 60_000;
}

/**
 * [M7] 마감 뒤 만든 섹터 스냅샷의 close_price·change_pct 를 그 세션의 «공식» 종가로 맞춘다.
 * 만들 때(17시대 ET)는 벤더 일봉 게시 전이라 «정규장 마지막 체결»이 종가 자리에 앉는다(MSFT 521.62 ↔ 종가 521.08).
 * 공식 종가가 적재되기 전이거나 스냅샷이 장중에 만들어졌으면 그대로 둔다.
 */
export async function officialCloseForSnapshot(snapshotTsIso: unknown): Promise<null | ((ticker: string) => Promise<{ close: number; prevClose: number } | null>)> {
    const ts = typeof snapshotTsIso === 'string' ? Date.parse(snapshotTsIso) : NaN;
    if (!Number.isFinite(ts)) return null;
    const date = etDateOf(ts);
    if (isNonTradingDay(date) || etMinutesOf(ts) < sessionCloseMinutes(date)) return null;
    const prev = prevTradingDate(date);
    return (ticker: string) => peekOfficialSessionClose(ticker, date, prev).catch(() => null);
}
