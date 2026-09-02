/**
 * 공매도 잔고(Short Interest) — **FINRA 원본으로 복원**.
 *
 * ══════════════════════════════════════════════════════════════════════
 * 「Intrinio Startup 에 없으니 상실」은 절반만 맞았다
 *
 *   실측(2026-09-02, 우리 키):
 *     securities/{t}/short_interest → **403** "insufficient access"
 *       → 엔드포인트는 있으나 Startup 플랜 권한이 없다(Enterprise 전용)
 *     securities/{t}/short_volume   → **404** (Intrinio 에 아예 없음)
 *
 *   그런데 **원본이 FINRA 에 공개돼 있다.** 미국 상장 종목의 공매도 잔고는
 *   법으로 월 2회 보고·공표되고, FINRA 가 무인증 API 로 그대로 준다.
 *   다크풀을 되살린 것과 **같은 경로**다. 벤더는 공개 원본을 재포장해 판다.
 *   (`services/darkPool.ts` 의 regShoDaily 와 한 짝이다.)
 *
 * 무엇을 재는가 — 「잔고」와 「거래량」을 섞지 말 것
 *   · **잔고**(이 파일)     = 특정 시점에 «갚지 않고 남아 있는» 공매도 주식 수.
 *                            월 2회 정산일 기준. 스퀴즈 위험의 재료.
 *   · **거래량**(darkPool)  = 그날 공매도로 «체결된» 물량. 매일. 성격 판별의 재료.
 *   둘은 다른 것이고 갱신 주기도 다르다.
 *
 * ⚠️ 라이선스 — darkPool.ts 와 동일한 FINRA 조건이 그대로 적용된다.
 *   화면에 출처 FINRA 명시 · 이 데이터에 별도 과금 금지 · 재배포 금지 고지.
 * ══════════════════════════════════════════════════════════════════════
 */

const API = 'https://api.finra.org/data/group/otcMarket/name/consolidatedShortInterest';

/** 화면에 그대로 노출해야 하는 출처 표기 */
export const ATTRIBUTION = 'Data source: FINRA';

export interface ShortInterest {
    ticker: string;
    /** 공매도 잔고(주) */
    shortShares: number;
    /** 직전 정산일 잔고(주) */
    prevShortShares: number | null;
    /** 전기 대비 증감률 % — FINRA 가 직접 준다 */
    changePercent: number | null;
    /** 커버에 필요한 일수 — FINRA 가 직접 준다(잔고 ÷ 일평균거래량) */
    daysToCover: number | null;
    /** 일평균 거래량(주) */
    avgDailyVolume: number | null;
    /** 정산일 YYYY-MM-DD */
    settlementDate: string;
    /**
     * 발행주식수 대비 잔고 비율 %.
     * ⚠️ FINRA 는 **주식 수만** 준다. 비율은 분모가 있어야 나오고,
     *    분모는 Intrinio 에서 가져온다. 분모를 못 구하면 **null 로 둔다** —
     *    0 으로 채우면 「공매도 0% = 안전」이라는 틀린 결론이 만들어진다.
     */
    siPercent: number | null;
    /** siPercent 의 분모로 쓴 주식 수 */
    sharesOutstanding: number | null;
}

// ── FINRA 호출 ────────────────────────────────────────────────────────
async function finraPost(body: unknown, timeoutMs = 15000): Promise<string[]> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
        const res = await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: ctl.signal,
            cache: 'no-store',
        });
        if (!res.ok) return [];
        const text = await res.text();
        // 응답은 CSV. 첫 줄은 헤더다.
        return text.split('\n').filter((l) => l.trim().length > 0);
    } catch {
        return [];
    } finally {
        clearTimeout(t);
    }
}

/** 따옴표로 감싼 CSV 한 줄을 필드 배열로. 빈 필드는 '' 로 남는다. */
function parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { inQ = !inQ; continue; }
        if (c === ',' && !inQ) { out.push(cur); cur = ''; continue; }
        cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
}

const num = (s: string | undefined): number | null => {
    if (s === undefined || s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
};

/**
 * 최신 «가용» 정산일을 찾는다.
 *
 * ⚠️ FINRA API 는 `sortFields` 를 쓰려면 파티션키(settlementDate)를 EQUAL 로
 *    지정해야 한다. 즉 **「최신 것 주세요」가 안 된다.** 후보일을 만들어
 *    하나씩 두드려야 한다.
 *
 * 정산일은 매월 15일·말일(휴일이면 직전 영업일)이고, 공표까지 8영업일쯤
 * 걸린다. 그래서 오늘로부터 **거슬러 올라가며** 첫 응답이 있는 날을 쓴다.
 * (실측 2026-09-02 기준 최신 = 2026-08-14. 8/31분은 아직 미공표였다.)
 */
export async function findLatestSettlementDate(probeTicker = 'AAPL'): Promise<string | null> {
    const cands: string[] = [];
    const now = new Date();
    // 최근 3개월치 후보를 최신순으로 만든다. 15일·말일 ±3영업일.
    for (let m = 0; m < 3; m++) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1));
        const y = d.getUTCFullYear();
        const mo = d.getUTCMonth();
        const eom = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
        for (const base of [eom, 15]) {
            for (let back = 0; back <= 3; back++) {
                const day = base - back;
                if (day < 1) continue;
                cands.push(`${y}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
            }
        }
    }
    // 최신순 정렬 후, 미래 날짜는 버린다.
    const today = new Date().toISOString().slice(0, 10);
    const ordered = [...new Set(cands)].filter((d) => d <= today).sort().reverse();

    for (const d of ordered) {
        const rows = await finraPost({
            limit: 1,
            compareFilters: [
                { fieldName: 'settlementDate', fieldValue: d, compareType: 'equal' },
                { fieldName: 'symbolCode', fieldValue: probeTicker, compareType: 'equal' },
            ],
        }, 12000);
        if (rows.length > 1) return d;   // 헤더 + 최소 1행
    }
    return null;
}

/**
 * 한 종목의 공매도 잔고.
 * @param sharesOutstanding siPercent 계산용 분모. 없으면 siPercent 는 null 이다.
 */
export async function getShortInterest(
    ticker: string,
    opts: { settlementDate?: string; sharesOutstanding?: number | null } = {}
): Promise<ShortInterest | null> {
    const sym = ticker.toUpperCase();
    const date = opts.settlementDate || (await findLatestSettlementDate());
    if (!date) return null;

    const rows = await finraPost({
        limit: 2,
        compareFilters: [
            { fieldName: 'settlementDate', fieldValue: date, compareType: 'equal' },
            { fieldName: 'symbolCode', fieldValue: sym, compareType: 'equal' },
        ],
    });
    if (rows.length < 2) return null;

    const head = parseCsvLine(rows[0]);
    const cols = parseCsvLine(rows[1]);
    const get = (name: string) => {
        const i = head.indexOf(name);
        return i >= 0 ? cols[i] : undefined;
    };

    const shortShares = num(get('currentShortPositionQuantity'));
    if (shortShares === null) return null;

    const so = opts.sharesOutstanding ?? null;
    // 분모가 없으면 비율을 **지어내지 않는다.**
    const siPercent = so && so > 0 ? Math.round((shortShares / so) * 10000) / 100 : null;

    return {
        ticker: sym,
        shortShares,
        prevShortShares: num(get('previousShortPositionQuantity')),
        changePercent: num(get('changePercent')),
        daysToCover: num(get('daysToCoverQuantity')),
        avgDailyVolume: num(get('averageDailyVolumeQuantity')),
        settlementDate: get('settlementDate') || date,
        siPercent,
        sharesOutstanding: so,
    };
}

/**
 * siPercent 분모(발행주식수)를 Intrinio 에서 가져온다.
 *
 * ⚠️ `securities/{t}/data_point/shares_outstanding` 은 우리 플랜에서
 *    "Cannot look up this item/identifier combination" 이다(실측).
 *    작동하는 것은 `companies/{t}/data_point/weightedavedilutedsharesos` 다.
 *    희석 가중평균이라 유통주식수(float)와 정확히 같지는 않지만,
 *    공매도 잔고 비율의 분모로는 업계 관행상 허용 범위다.
 *    **float 이 아니라는 점을 라벨에 반영할 것.**
 */
export async function fetchSharesOutstanding(ticker: string): Promise<number | null> {
    const key = process.env.INTRINIO_API_KEY;
    if (!key) return null;
    try {
        const res = await fetch(
            `https://api-v2.intrinio.com/companies/${encodeURIComponent(ticker.toUpperCase())}/data_point/weightedavedilutedsharesos?api_key=${key}`,
            { cache: 'no-store' }
        );
        if (!res.ok) return null;
        const t = (await res.text()).trim();
        const n = Number(t);
        return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
        return null;
    }
}
