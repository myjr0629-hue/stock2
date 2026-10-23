/**
 * 캐시가 들고 있는 «가격 파생값»을 최신 종가로 맞춘다 — 감사 10/23 M1·M7·M9.
 *
 * 모든 읽기는 이미 적재된 EOD(벌크·세션 캡처·20거래일 종가 행렬)뿐이다 — 벤더 API 콜 0.
 * 필요한 종가가 없으면 원래 값을 그대로 돌려준다(빈칸을 만들지 않는다).
 */
import { peekCloseOn, peekLatestCloseRow, peekOfficialSessionClose } from './intrinioClient';
import { isPriceBasis, makePriceBasis, rebaseFundamentals, valuationBasisDate } from '@/lib/valuationRebase';
import { etDateOf, etLastClosedSessionDate, etMinutesOf, isNonTradingDay, prevTradingDate, sessionCloseMinutes } from '@/lib/marketCalendar';

/** 막 읽은 원천 값(f)에 기준을 붙인다. readAtMs 로 기준일을 못 정하면 f 그대로. */
export async function stampFreshValuation<T>(ticker: string, f: T, readAtMs: number, raw: Record<string, number | null> = {}): Promise<T> {
    try {
        const date = valuationBasisDate(readAtMs);
        if (!date || !f) return f;
        const basis = makePriceBasis(f, date, await peekCloseOn(ticker, date), raw);
        return basis ? { ...(f as any), _priceBasis: basis } : f;
    } catch { return f; }
}

/**
 * 기준이 없는 DynamoDB 재무(f)에 기준을 붙인다 — 같은 값(P/E·P/S·P/B·FCF 수익률·D/E·ROE)을 담은 일일 수확 기록(pattern-db FUND)이
 * 있을 때만, 그 기록이 «원천을 읽은 시각»으로 기준일을 정한다. 기록이 없거나 값이 하나라도 다르면 붙이지 않는다(원래 값 그대로).
 * 판본 timestamp 는 보존된 옛 재무에도 갱신되므로 기준일 추정에 쓰지 않는다.
 */
export async function stampHarvestedValuation<T>(ticker: string, f: T): Promise<T> {
    try {
        const src: any = f;
        if (!src || isPriceBasis(src._priceBasis)) return f;
        const fund = await harvestRecord(ticker.toUpperCase());
        if (!fund || !sameHarvestValues(src, fund)) return f;
        const date = valuationBasisDate(Number(fund.timestamp));
        if (!date) return f;
        const basis = makePriceBasis(src, date, await peekCloseOn(ticker, date), {}, true);
        return basis ? { ...src, _priceBasis: basis } : f;
    } catch { return f; }
}

/** FUND 수확 기록(하루 1회 갱신) — unified 는 요청마다 지나가므로 인스턴스 메모리에 10분 둔다. */
const _fundMemo = new Map<string, { at: number; fund: any }>();
async function harvestRecord(sym: string): Promise<any> {
    const hit = _fundMemo.get(sym);
    if (hit && Date.now() - hit.at < 10 * 60_000) return hit.fund;
    const { getFundamentalsData } = await import('@/lib/aws/dynamoDataProvider');
    const fund = await getFundamentalsData(sym);
    if (_fundMemo.size > 500) _fundMemo.clear();
    _fundMemo.set(sym, { at: Date.now(), fund: fund ?? null });
    return fund;
}

function sameHarvestValues(f: any, fund: any): boolean {
    let matched = 0;
    for (const k of ['pe', 'ps', 'pb', 'fcfYield', 'de', 'roe', 'marketCap']) {
        const a = f?.[k], b = fund?.[k];
        const na = typeof a === 'number' && Number.isFinite(a), nb = typeof b === 'number' && Number.isFinite(b);
        if (na !== nb) { if (k === 'marketCap') continue; return false; }   // 수확 기록의 marketCap 은 비어 있을 수 있다
        if (!na) continue;
        if (a !== b) return false;
        matched++;
    }
    return matched >= 3;
}

/** 최신 «끝난» 정규장 종가 — 마감 전 15:57 캡처(오늘 날짜)는 쓰지 않는다. */
async function latestClosedRow(ticker: string, nowMs = Date.now()) {
    const row = await peekLatestCloseRow(ticker);
    if (!row || !(row.close > 0) || row.date > etLastClosedSessionDate(nowMs)) return null;
    return row;
}

/** 기준이 붙은 재무를 최신 종가로 환산한다. */
export async function repriceFundamentals<T>(ticker: string, f: T): Promise<T> {
    try {
        if (!f || !isPriceBasis((f as any)?._priceBasis)) return f;
        return rebaseFundamentals(f, await latestClosedRow(ticker));
    } catch { return f; }
}

/**
 * [M9] unified 캐시의 연관 종목 가격·등락 — 최신 «끝난» 정규장 D 의 종가로 바꾸는 것은 그 행이 D 이전 세션 값일 때만이다.
 *   · 행의 직전 종가 = D 종가(공식이면 반 센트 · 캡처면 0.3 % 안) → D 다음 세션 값일 수 있다(장중 보충·보합일 포함) → 그대로
 *   · 행의 직전 종가 = D 전일 종가(반 센트)뿐 → D 세션 값(장중 가격) → D 종가로
 *   · 둘 다 아니면 판본이 D 마감 전에 만들어졌을 때만
 * EOD 가 최신 끝난 정규장을 아직 못 따라왔으면 아무것도 바꾸지 않는다.
 */
export async function repriceRelated(related: any, cachedAtMs: number): Promise<any> {
    try {
        const list = related?.topRelated;
        if (!Array.isArray(list) || !list.length) return related;
        let changed = false;
        const next = await Promise.all(list.map(async (item: any) => {
            if (!item || typeof item.ticker !== 'string') return item;
            const row = await latestClosedRow(item.ticker).catch(() => null);
            if (!row || row.prevClose === null || row.date !== etLastClosedSessionDate(Date.now())) return item;
            const pc = Number(item.prevClose);
            const ok = Number.isFinite(pc) && pc > 0;
            const isNextSession = ok && (row.provisional ? Math.abs(pc - row.close) / row.close <= 0.003 : Math.abs(pc - row.close) < 0.005);
            const isSameSession = ok && Math.abs(pc - row.prevClose) < 0.005;
            // 다음 세션 값일 수 있으면(두 종가가 같은 보합일 포함) 최신 행을 보존한다 — 덮지 않는다.
            if (isNextSession) return item;
            if (!isSameSession && !(sessionCloseMs(row.date) > cachedAtMs)) return item;
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
            // 기준이 없는 옛 재무는 live/fundamentals 와 같은 규칙(같은 값을 담은 FUND 수확 기록)으로 기준을 붙인 뒤 환산 — 붙인 기준은 응답에만.
            sym && data.fundamentals ? stampHarvestedValuation(sym, data.fundamentals).then(f => repriceFundamentals(sym, f))
                .then(f => (f === data.fundamentals || (f as any)?._repricedTo ? f : data.fundamentals)) : data.fundamentals,
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
