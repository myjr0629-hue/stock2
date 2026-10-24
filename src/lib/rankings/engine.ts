// ============================================================================
// 랭킹 엔진 — 공용 뼈대.
//
// 왜 엔진으로 묶는가 (2026-09-01 대표 지시):
//   랭킹이 하나둘 늘 때마다 통계·게이트를 각자 다시 짜면, 어느 날 한쪽에만
//   버그가 남고 그때 어느 쪽이 맞는지 알 수 없게 된다. 그래서 «비교하는 법»은
//   여기 한 곳에만 둔다.
//
// 이 파일에 모인 것들은 전부 실측으로 데인 자리다:
//   ① 대표 스냅샷 — 같은 날 OI 가 20배 널뛴다(실행마다 다른 만기를 본다)
//   ② 만기 롤오버 — 같은 규모의 체인끼리만 비교해야 한다
//   ③ 분모 붕괴 — MAD 가 0 에 붙으면 42σ 같은 불가능한 값이 나온다
//   ④ 시장 교란 — 시장 전체가 조용한 날엔 모든 종목이 «이탈»로 보인다
// ============================================================================

import { cashSessionPhaseAt, etDateOf, etLastClosedSessionDate, etMinutesOf, isNonTradingDay, prevTradingDate, shownRegularSessionDate } from '@/lib/marketCalendar';

// 'anytime' = 세션과 무관하게 성립하는 랭킹(내부자 신고·펀더멘털).
// 장중/마감후로만 나누면 이런 것들이 억지로 한쪽에 붙어 오해를 만든다.
export type Phase = 'intraday' | 'postclose' | 'anytime';

export type Row = { timestamp: number;[k: string]: any };

/** 로버스트 통계 — 평균·표준편차는 이상치 하나에 끌려간다. */
export const median = (a: number[]): number | null => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y); const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const mad = (a: number[], med: number) => median(a.map((v) => Math.abs(v - med)));

// 90일 × 15분 이력(2,160시간)을 종목·지표 간 재사용하되 워커 메모리는 제한한다.
const ET_DAY_CACHE_LIMIT = 4096;
const etDayCache = new Map<number, string>();
// 정규장 마감(13/16 ET)도 UTC 정시 경계다. 이력의 같은 수집 시각을 매번 Intl 변환하지 않는다.
const closedSessionCache = new Map<number, string>();

/** ET 기준 날짜. 날짜 정본은 etDateOf, 반복되는 행의 변환만 UTC 시간별로 기억한다. */
export function etDay(ms: number): string {
    // 표준시 도입 전 뉴욕은 −04:56:02였다. 그때는 UTC 한 시간 안에도 날짜가 바뀐다.
    if (!Number.isFinite(ms) || ms < Date.UTC(1883, 10, 18, 17) || ms > 8.64e15) return etDateOf(ms);
    // Date의 밀리초 절삭과 맞춘다. 이후 ET 자정·DST 전환은 모두 UTC 정시에 있다.
    const hour = Math.floor(Math.trunc(ms) / 3600_000);
    const cached = etDayCache.get(hour);
    if (cached !== undefined) return cached;
    const day = etDateOf(ms);
    if (etDayCache.size >= ET_DAY_CACHE_LIMIT) etDayCache.delete(etDayCache.keys().next().value!);
    etDayCache.set(hour, day);
    return day;
}

/** 원천 날짜가 있는 행은 수집 시각으로 다시 날짜를 만들지 않는다. */
export function optionSessionDate(row: Record<string, any>): string | null {
    if (row.chainDate !== undefined || row.optionBasis !== undefined) {
        const d = row.chainDate;
        const ms = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? Date.parse(d) : NaN;
        return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === d ? d : null;
    }
    // 기존 이력에는 원천 날짜가 없다. 이전 기준선을 보존하되 추정 날짜로 새 원천을 덮지 않는다.
    const ts = Number(row.timestamp);
    return Number.isFinite(ts) ? etDay(ts) : null;
}

/** 새 원천 행은 이미 끝난 정규장 EOD인지 검사한다. 표식 없는 옛 행은 기존 규칙을 유지한다.
 * 다음 날 PRE에 재수집한 전날 EOD는 유효하다. 당일 PRE를 전날로 바꾸지는 않는다.
 */
export function isCompleteOptionEod(row: Record<string, any>): boolean {
    if (row.partial === true || (row.optionBasis !== undefined && row.optionBasis !== 'eod')) return false;
    if (row.chainDate === undefined && row.optionBasis === undefined) return true;
    const d = row.chainDate ? optionSessionDate(row) : null;
    const ts = Number(row.timestamp);
    if (!d || !Number.isFinite(ts) || isNonTradingDay(d)) return false;
    const hour = Math.floor(ts / 3600_000);
    let closed = closedSessionCache.get(hour);
    if (closed === undefined) {
        closed = etLastClosedSessionDate(ts);
        if (closedSessionCache.size >= ET_DAY_CACHE_LIMIT) closedSessionCache.delete(closedSessionCache.keys().next().value!);
        closedSessionCache.set(hour, closed);
    }
    return d <= closed;
}

function sourceHistoryStart(items: Array<Record<string, any>>, usable: (row: Record<string, any>) => boolean): string | null {
    return items.reduce<string | null>((first, row) => {
        // 원천 존재와 기준군 적격성은 별개다. 부분 원천도 PRE 레거시의 재등장을 막는다.
        const d = row.chainDate && Number.isFinite(Number(row.timestamp)) && usable(row) ? optionSessionDate(row) : null;
        return d && (!first || d < first) ? d : first;
    }, null);
}

/**
 * 지금이 미국 정규장 안인가 — 랭킹의 «단계»를 정한다.
 * 달력이 정본이다 — 고정 −4시간은 11월(EST)에 한 시간 밀리고, 휴장일을 «장중»으로 본다.
 */
export function sessionPhase(now = Date.now()): { phase: Phase; etTime: string; regularOpen: boolean } {
    const hm = etMinutesOf(now);
    const regularOpen = cashSessionPhaseAt(now) === 'regular';
    return {
        phase: regularOpen ? 'intraday' : 'postclose',
        etTime: `${String(Math.floor(hm / 60)).padStart(2, '0')}:${String(hm % 60).padStart(2, '0')}`,
        regularOpen,
    };
}

// ══════════════════════════════════════════════════════════════════════
// 마감 후(FINRA 장외) 랭킹의 «세션 시계» — 옵션 수집 시계가 아니라 «달력»으로 잰다.
//
//   [2026-09-28 대표 보고] 앱 랭킹 «장 마감 후» 3종이 «아직 안 들어옴 — 보유분
//   2026-09-25, 옵션은 2026-09-28 세션»에서 채워지는 걸 본 적이 없다.
//   게이트가 다크풀 날짜를 «옵션 스냅샷의 최신 날짜»와 견줬다. 그런데
//     · 옵션 수집은 주말 포함 «매일» 04:03 ET 부터 그 달력 날짜로 행을 쓴다
//       (9/21~9/28 실측 — flow 04:03~20:48 · gex 09:30~16:47, 토·일도 똑같이)
//     · 다크풀은 마감 뒤 17:45 ET 에 그날치가 들어온다(EC2 크론 21:45 UTC ·
//       9/8~9/25 14세션 전부 첫 실행에서 같은 날짜 분모로 계산)
//   그래서 둘이 맞는 건 평일 17:46 → 다음 날 04:03 ET 뿐이었다(한국 화~토 06:46~17:03).
//   평일 04:03~17:46 ET(장중 전체)와 토 04:03 → 월 17:46 ET 는 통째로 빈칸이었다.
//
//   마감 후 자료가 말하는 것은 «마지막으로 끝난 정규장»이다. 장중에 그걸 보여 주는 건
//   어제 것을 오늘인 척하는 게 아니다 — 날짜를 달면 사실 그대로다.
//     fresh   다크풀 날짜 = 마지막으로 끝난 정규장
//     pending 한 세션 뒤 — 마감(16:00)부터 적재 예정(18:00 ET)까지의 정상 대기
//     late    한 세션 뒤인데 적재 예정이 지났다 — 보여 주되 «지연»을 밝힌다
//     stale   두 세션 이상 뒤 — 적재가 멈췄다. 순위에 넣지 않는다
// ══════════════════════════════════════════════════════════════════════

/** 그날 FINRA 자료가 늦어도 들어와 있어야 하는 시각(ET 분). 17:31 게시 · 17:45 적재 + 여유 */
export const AFTER_CLOSE_DUE_MIN = 18 * 60;

export type AfterCloseState = 'fresh' | 'pending' | 'late' | 'stale';

export function afterCloseState(dataDate: string | null | undefined, now = Date.now()): {
    state: AfterCloseState;
    /** 마지막으로 끝난 정규장 (16:00 ET 전이면 직전 거래일) */
    lastClosed: string;
} {
    const today = etDateOf(now);
    const min = etMinutesOf(now);
    const lastClosed = !isNonTradingDay(today) && min >= 16 * 60 ? today : prevTradingDate(today);
    let state: AfterCloseState;
    // 달력보다 앞선 날짜(목록에 없는 휴장 해제 등)는 «낡음»이 아니다
    if (dataDate && dataDate >= lastClosed) state = 'fresh';
    else if (dataDate && dataDate === prevTradingDate(lastClosed)) {
        state = lastClosed === today && min < AFTER_CLOSE_DUE_MIN ? 'pending' : 'late';
    } else state = 'stale';
    return { state, lastClosed };
}

const measured = (v: unknown) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v));

/**
 * 하루의 «대표 스냅샷».
 *
 * ⚠️ 실측: 같은 날 NVDA 콜 미결제약정이 107,121 ~ 1,985,592 로 찍힌다.
 *    미결제약정은 하루 한 번 갱신되므로 이건 장중 변화가 아니라 harvest 가
 *    실행마다 «맨 앞 만기»를 다시 고르기 때문이다.
 *    「그날 마지막 값」을 쓰면 어느 만기가 걸렸느냐가 곧 결과가 된다.
 *    → 그날 총 OI 가 가장 큰 스냅샷 하나를 골라 «모든 지표를 거기서» 읽는다.
 *       날짜 간 비교가 성립하고, 한 카드 안 숫자들이 같은 체인에서 나온다.
 *       완결 EOD를 부분 행보다 우선한다. OI 동률이면 프리미엄 측정을 보존하고,
 *       같은 계산 기준에서는 더 큰 프리미엄을 보존한다(작은 늦은 행의 덮어쓰기 방지).
 *       structure-build의 프리미엄 없는 행이 FlowWarm 측정을 지우지 않게 한다.
 */
export function dailySnapshots(items: Row[]) {
    const byDay = new Map<string, Row & { _oi: number; _d: string }>();
    const sourceStart = sourceHistoryStart(items, r => {
        const oi = Number(r.totalCallOI || 0) + Number(r.totalPutOI || 0);
        return Number.isFinite(oi) && oi > 0;
    });
    for (const it of items) {
        const ts = Number(it.timestamp);
        if (!Number.isFinite(ts)) continue;
        const d = optionSessionDate(it);
        if (!d || (!it.chainDate && sourceStart && d >= sourceStart)) continue;
        const oi = Number(it.totalCallOI || 0) + Number(it.totalPutOI || 0);
        if (!(oi > 0) || !Number.isFinite(oi)) continue; // OI 없는 행은 비교 기준을 못 준다
        const prev = byDay.get(d);
        const hasPremium = measured(it.totalPremium), prevHasPremium = measured(prev?.totalPremium);
        const complete = isCompleteOptionEod(it), prevComplete = prev ? isCompleteOptionEod(prev) : false;
        // 실제 거래량 측정을 OI 대체보다 우선한다. 다른 기준의 금액끼리는 비교하지 않는다.
        const basisQuality = (r: Row) => r.premiumBasis === 'volume-close' ? 2 : r.premiumBasis === 'oi-prev-close' ? 1 : 0;
        let replace = !prev;
        if (prev) {
            if (complete !== prevComplete) replace = complete;
            else if (oi !== prev._oi) replace = oi > prev._oi;
            else if (it.chainDate) {
                if (hasPremium !== prevHasPremium) replace = hasPremium;
                else if (hasPremium && it.premiumBasis === prev.premiumBasis && Number(it.totalPremium) !== Number(prev.totalPremium)) {
                    replace = Number(it.totalPremium) > Number(prev.totalPremium);
                } else if (hasPremium && it.premiumBasis !== prev.premiumBasis) {
                    replace = basisQuality(it) > basisQuality(prev)
                        || (basisQuality(it) === basisQuality(prev) && ts < Number(prev.timestamp));
                } else replace = ts > Number(prev.timestamp);
            }
        }
        if (replace) {
            byDay.set(d, { ...it, _oi: oi, _d: d });
        }
    }
    return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, r]) => r);
}

export type DeviationGates = {
    minSessions?: number;      // 기준선을 믿으려면 필요한 최소 세션 수
    regimeLo?: number;         // 「같은 규모의 체인」 하한 (오늘 OI 대비)
    regimeHi?: number;
    minRegimeDays?: number;
    minRelDispersion?: number; // 산포/중앙값 하한 — 분모 붕괴 방지
    minZ?: number;
    minRatio?: number;
};
export const DEFAULT_GATES: Required<DeviationGates> = {
    minSessions: 8, regimeLo: 0.5, regimeHi: 2.0, minRegimeDays: 6,
    minRelDispersion: 0.03, minZ: 3, minRatio: 1.35,
};

export type DevResult = {
    today: number; baseline: number; ratio: number; z: number; sessions: number; date: string; partial: boolean;
} | null;

/** 두 API 공통: 옛 이력은 보존하고 명시된 부분·비EOD 및 다른 금액 계산 기준을 제외한다. */
export function deviationSeries(snaps: Row[], key: string) {
    const today = snaps[snaps.length - 1];
    if (!today || !measured(today[key])) return [];
    const premium = /premium/i.test(key);
    const basis = typeof today.premiumBasis === 'string' ? today.premiumBasis.trim() : '';
    return snaps.filter((r, i) => measured(r[key]) && (i === snaps.length - 1 || (
        isCompleteOptionEod(r) && (!premium || !basis || !r.premiumBasis || r.premiumBasis === today.premiumBasis)
    ))).map(r => ({ d: r._d as string, v: Number(r[key]), oi: r._oi as number, partial: !isCompleteOptionEod(r) }));
}

/**
 * 한 지표의 «평소 대비 이탈». 통과 못 하면 null 과 사유를 준다 —
 * 사유를 안 남기면 「왜 아무것도 안 나오지」를 영원히 못 푼다.
 */
export function deviationOf(
    snaps: Array<Row & { _oi: number; _d: string }>,
    key: string,
    gates: DeviationGates = {},
): { ok: DevResult; reason?: string } {
    const g = { ...DEFAULT_GATES, ...gates };
    // The latest snapshot must own a measurement; never promote a past day to today.
    if (!snaps.length || !measured(snaps[snaps.length - 1][key])) return { ok: null, reason: '이력부족' };
    const series = deviationSeries(snaps, key);
    if (series.length < g.minSessions + 1) return { ok: null, reason: '이력부족' };

    const today = series[series.length - 1];
    // 만기 롤오버 방어 — 오늘과 «같은 규모의 체인»만 비교 대상으로 삼는다.
    const cmp = series.slice(0, -1).filter(
        (x) => today.oi > 0 && x.oi > 0 && x.oi >= today.oi * g.regimeLo && x.oi <= today.oi * g.regimeHi,
    );
    if (cmp.length < g.minRegimeDays) return { ok: null, reason: '비교일부족(만기롤오버)' };

    const past = cmp.map((x) => x.v);
    const med = median(past);
    if (med === null || !(med > 0)) return { ok: null, reason: '기준선없음' };
    const sp = mad(past, med) ?? 0;
    const scale = 1.4826 * sp;
    if (!(scale > 0)) return { ok: null, reason: '산포0' };
    if (sp / Math.abs(med) < g.minRelDispersion) return { ok: null, reason: '너무안변함' };

    const z = (today.v - med) / scale;
    if (!Number.isFinite(z) || Math.abs(z) < g.minZ) return { ok: null, reason: '유의하지않음' };
    const ratio = today.v / med;
    if (!(ratio >= g.minRatio || ratio <= 1 / g.minRatio)) return { ok: null, reason: '배수작음' };

    return { ok: { today: today.v, baseline: med, ratio, z, sessions: cmp.length, date: today.d, partial: today.partial } };
}

/**
 * 필요한 필드를 «한 행에 모두» 가진 가장 최근 스냅샷.
 *
 * ⚠️ 생산자가 여럿이라 행마다 필드 구성이 다르다. GEX 루프는 OI 를 쓰고
 *    FlowWarm 은 프리미엄을 쓴다. 「대표 스냅샷(OI 최대)」 하나만 보면
 *    프리미엄과 OI 를 «같이» 요구하는 랭킹이 영원히 0건이 된다(실제로 그랬다).
 *    서로 다른 행에서 가져와 짝지으면 다른 만기를 섞는 것이라 더 나쁘다.
 *    → 둘 다 든 행을 찾아 쓴다. 없으면 그 종목은 그냥 빠진다.
 */
export function latestWith(items: Row[], keys: string[]): (Row & { _d: string }) | null {
    let best: Row | null = null, bestTs = -1, bestDate = '';
    const sourceStart = sourceHistoryStart(items, r => keys.every(k => measured(r[k]) && Number(r[k]) > 0));
    for (const it of items) {
        const ts = Number(it.timestamp);
        const d = optionSessionDate(it);
        if (!Number.isFinite(ts) || !d || (!it.chainDate && sourceStart && d >= sourceStart)) continue;
        if (d < bestDate || (d === bestDate && ts <= bestTs)) continue;
        if (keys.every((k) => Number.isFinite(Number(it[k])) && Number(it[k]) > 0)) { best = it; bestTs = ts; bestDate = d; }
    }
    return best ? { ...best, _d: bestDate } : null;
}

/** 같은 세션 구조 EOD 와의 일치 허용 오차 — 콜·풋 OI 각각 ±2%(10/23 실측 일치 10종목은 0%). */
export const MONEY_OI_MATCH_TOLERANCE = 0.02;

/**
 * «돈과 포지션의 불일치»용 — 필요한 필드를 한 행에 모두 가진 «가장 최신 세션의 완결 행».
 *
 * latestWith 의 이력 시작점(sourceStart) 규칙은 구조 행(chainDate 있음)이 생긴 날부터 옛 흐름 행을 잘라
 * 10/23 세션에 10/21 행(2세션 전)을 쓰게 했다(운영 결함). 프리미엄을 가진 행은 전부 표식 없는 흐름 행이라
 * 그 규칙을 쓰지 않고, 같은 세션 구조 EOD(chainDate·optionBasis 'eod'·partial 아님)가 있으면 그것으로 검증한다.
 *   ① 같은 세션 구조 EOD 가 있으면 콜·풋 OI 가 각각 ±2% 안인 행만(어긋난 행 = 다른 수집 범위·부분 → 제외).
 *      맞는 행이 없으면 그 세션을 건너뛰고 직전 세션으로.
 *   ② 같은 세션 구조 EOD 가 없으면 그 세션의 최신 완결 행.
 *      ⚠ 직전 세션 대비 OI 감소로 «부분»을 판정하지 않는다 — 10/23 실측: 구조 EOD 가 있는 10종목 모두 구조 EOD =
 *        장 마감 뒤 마지막 흐름 행이었고 직전 대비 0.41~2.25배(주간 만기 소멸 뒤 다음 주 만기). 10/16 은 전 종목 0.14~0.58배.
 *        감소로 제외하면 종목마다 다른 만기를 섞는다.
 *   ③ 표식 없는 흐름 행이 정규장 개장(09:30 ET) 전·휴장일에 찍혔으면 그 날짜 세션으로 쓰지 않는다(직전 세션 자료다).
 *   ④ 생산자가 partial·비EOD 로 밝힌 행은 같은 세션에 완결 행이 없을 때만 쓰고 partial 로 운반(오늘을 과거로 대체하지 않는 원칙).
 * 고르기: 최신 세션 → 같은 세션 안에서 «일치» > 완결 > 밝힌 부분 → 최신 시각.
 */
export function latestCompleteWith(items: Row[], keys: string[]): (Row & { _d: string; _oiCheck: 'match' | 'unverified' }) | null {
    const refs = new Map<string, { c: number; p: number; ts: number }>();
    for (const r of items) {
        if (!r.chainDate || r.optionBasis !== 'eod' || r.partial === true) continue;
        const d = optionSessionDate(r);
        const c = Number(r.totalCallOI), p = Number(r.totalPutOI), ts = Number(r.timestamp);
        if (!d || !(c > 0) || !(p > 0) || !Number.isFinite(ts)) continue;
        const prev = refs.get(d);
        if (!prev || ts > prev.ts) refs.set(d, { c, p, ts });
    }
    let best: Row | null = null, bestDate = '', bestMatch = -1, bestTs = -1;
    for (const it of items) {
        const ts = Number(it.timestamp);
        const d = optionSessionDate(it);
        if (!Number.isFinite(ts) || !d) continue;
        if (!keys.every((k) => Number.isFinite(Number(it[k])) && Number(it[k]) > 0)) continue;
        if (!it.chainDate && (isNonTradingDay(d) || etMinutesOf(ts) < 570)) continue;
        const c = Number(it.totalCallOI), p = Number(it.totalPutOI);
        const same = refs.get(d);
        // 2 = 같은 세션 구조 EOD 와 일치 · 1 = 완결 · 0 = 생산자가 밝힌 부분/비EOD
        const complete = isCompleteOptionEod(it);
        let match = complete ? 1 : 0;
        if (same) {
            if (Math.abs(c - same.c) > MONEY_OI_MATCH_TOLERANCE * same.c || Math.abs(p - same.p) > MONEY_OI_MATCH_TOLERANCE * same.p) continue;
            if (complete) match = 2;
        }
        if (d < bestDate || (d === bestDate && (match < bestMatch || (match === bestMatch && ts <= bestTs)))) continue;
        best = it; bestDate = d; bestMatch = match; bestTs = ts;
    }
    return best ? { ...best, _d: bestDate, _oiCheck: bestMatch === 2 ? 'match' : 'unverified' } : null;
}

/**
 * 랭킹의 «준비 상태».
 *
 * 왜 이런 게 필요한가: 어떤 랭킹은 오늘 코드를 다 짜도 **자료가 아직 안 쌓여**
 * 동작하지 못한다(IV 랭크는 그 종목 IV 이력의 백분위라 20세션이 필요하다).
 * 그때 «빈 랭킹»을 내보내면 쓰는 쪽이 「고장났나」 하고, 반대로 억지로 채우면
 * 그게 거짓말이 된다.
 *   → 랭킹이 필요한 필드와 세션 수를 «선언»하고, 엔진이 진행률을 보고한다.
 *     자료가 차면 코드 수정 없이 저절로 켜진다.
 */
export type Readiness = {
    ready: boolean; have: number; need: number; field: string;
    /** 마지막 관측일. 오늘 세션과 다르면 «쌓였지만 멈춘» 것이다 */
    lastDate?: string | null; stale?: boolean; note?: string;
};

/**
 * 하루에 값 하나 — «세션» 단위 시계열.
 *
 * ⚠️ [2026-09-01 실측] 이걸 안 하면 원시 행을 그대로 센다. 스냅샷이 15분마다
 *    쌓이므로 «20세션»이 순식간에 «1,312 표본»이 되고, 「20세션 백분위」라고
 *    써 놓은 값이 실제로는 «몇 시간치 스냅샷 백분위»가 된다(실제로 그랬다).
 *    라벨이 세션이면 데이터도 세션이어야 한다.
 */
export function dailyValues(rows: Array<Record<string, any>>, field: string) {
    const byDay = new Map<string, { ts: number; v: number }>();
    const sourceStart = sourceHistoryStart(rows, r => measured(r[field]) && Number(r[field]) !== 0);
    for (const r of rows) {
        const v = Number(r?.[field]);
        if (!Number.isFinite(v) || v === 0) continue;      // NULL·0 은 «측정 안 됨»으로 본다
        const ts = Number(r.timestamp);
        if (!Number.isFinite(ts)) continue;
        const d = optionSessionDate(r);
        if (!d || (!r.chainDate && sourceStart && d >= sourceStart)) continue;
        const prev = byDay.get(d);
        if (!prev || ts > prev.ts) byDay.set(d, { ts, v });  // 그날 마지막 관측
    }
    return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([d, x]) => ({ d, v: x.v }));
}

/**
 * ★ [2026-10-04] 정규장 «세션» 단위 시계열 — dailyValues 와 같되 날짜 열쇠가 ET 달력일이 아니라 «그 시각 화면이 보여 주는
 *   정규장»(shownRegularSessionDate: 평일 09:30 ET 전·주말·휴장 → 직전 거래일)이다.
 *   수집 Lambda 는 주말·휴장·새벽에도 금요일(직전 세션) EOD 체인으로 행을 남긴다 — ET 달력일로 묶으면 토·일이 «세션»
 *   두 개가 되어 같은 값이 세 번 세어졌다(10/4 실측: 창의 약 30%). 그 세션의 마지막 관측 = 그 세션 마감 체인 값.
 *   원천 날짜가 있는 이력은 두 함수 모두 그 날짜를 쓴다. 옛 행만 기존 달력 규칙을 유지한다.
 */
export function sessionValues(rows: Array<Record<string, any>>, field: string) {
    const bySession = new Map<string, { ts: number; v: number }>();
    const sourceStart = sourceHistoryStart(rows, r => measured(r[field]) && Number(r[field]) !== 0);
    for (const r of rows) {
        const v = Number(r?.[field]);
        if (!Number.isFinite(v) || v === 0) continue;
        const ts = Number(r.timestamp);
        if (!Number.isFinite(ts)) continue;
        const sourceDate = optionSessionDate(r);
        if (!sourceDate || (!r.chainDate && sourceStart && sourceDate >= sourceStart)) continue;
        const d = r.chainDate ? sourceDate : shownRegularSessionDate(ts);
        const prev = bySession.get(d);
        if (!prev || ts > prev.ts) bySession.set(d, { ts, v });
    }
    return [...bySession.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([d, x]) => ({ d, v: x.v }));
}

export function readinessOf(
    perTicker: Record<string, Array<Record<string, any>>>,
    field: string,
    need: number,
): Readiness {
    // 종목마다 이력이 다르므로 «중앙값 종목»을 기준으로 본다 —
    // 최대치로 재면 한 종목만 차도 «준비됨»이 되어 나머지가 빈다.
    const series = Object.values(perTicker).map((rows) => dailyValues(rows, field));
    const counts = series.map((s2) => s2.length).sort((a, b) => a - b);
    const have = counts.length ? counts[counts.length >> 1] : 0;
    // 마지막 관측일 — 세션 수만 보면 «쌓였지만 며칠 전에 멈춘» 것을 못 잡는다.
    const lastDate = series.reduce<string | null>(
        (m, s2) => { const d = s2.length ? s2[s2.length - 1].d : null; return d && (!m || d > m) ? d : m; }, null);
    return { ready: have >= need, have, need, field, lastDate };
}

/** Reciprocal-symmetric distance = tanh(|log(r)|/2), with the exact limit 1 at measured zero. */
export const ratioDistance = (r: number): number | null => {
    if (!Number.isFinite(r) || r < 0) return null;
    return Math.abs(r - 1) / (r + 1);
};
