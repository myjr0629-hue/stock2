// ============================================================================
// IV 랭크 — 정의는 이 파일 하나  [2026-10-04]
//
// 정의: 수집 Lambda(signum-harvest) 가 남긴 signum-gex-history 의 최근 IV_RANK_WINDOW(200)개 표본(≈7일) 중
//   «가장 최근» IV30(30일 고정 만기 ATM IV — harvest_lambda/iv30.js) 보다 낮은 표본의 비율(%) — 이력 기반 백분위.
//   (10/4 저녁까지는 «가장 가까운 만기» ATM IV(atmIv)였다 — 아래 [IV30] 참조) /api/flow/iv-percentile 이 이 함수로만 계산하고,
//   웹(FlowRadar)·앱(app-view/flow) 은 그 응답의 percentile 만 쓴다. 응답이 null 이면 둘 다 «미제공».
//
// [10/4 사고] 같은 «IV Rank» 이름에 정의가 셋이었다.
//   ① iv-percentile(이력 200개 백분위) — 앱은 표본 5개부터, 웹은 10개부터 썼다(문마다 문턱이 달랐다).
//   ② 웹 FlowRadar 폴백 — 이력이 없으면 체인의 ATM 근처 4계약 IV 평균 × 100 을 «IV 백분위»로 띄웠다(GLD «21%» = ATM IV 21%).
//      백분위가 아니라 변동성 수준이다. 같은 칸에서 앱은 «미제공»이었다.
//   ③ (참고·이번 범위 밖) 웹 대시보드 «IV Rank» 카드 = ATM IV × 1.5 — 별도 보고.
// [창 미달] 수집 목록에 새로 든 종목(10/4 ETF 6개)은 첫 몇 회차 표본이 전부 같은 날·같은 EOD 체인이다.
//   표본 수만 보면 5~10개째부터 «IV 랭크 0%»(자기보다 낮은 표본 없음)가 나간다 — 숫자처럼 보이지만 뜻이 없다.
//   → 창(200개)이 다 찬 종목만 계산한다. 기존 수집 종목(이력 수천 건)은 늘 창이 차 있어 값이 바뀌지 않는다.
// [10/4 오후 · 주말·휴장 반복 행] 수집 Lambda 는 주말·휴장·새벽에도 15분마다 같은 EOD 체인으로 행을 남긴다
//   (실측 10/4: SPY·NVDA·MU… 창 200행 중 토 30·일 22·평일 새벽 행이 전부 금요일 마감 값 하나 — 창의 약 30~40%).
//   → «같은 세션 · 같은 값»의 반복 행은 표본 «한 개»로 센다. 세션 = 그 시각 화면이 보여 주는 정규장 날짜
//     (shownRegularSessionDate: 평일 09:30 ET 전·주말·휴장 → 직전 거래일). 창(최근 200행 ≈ 7일)은 그대로 원시 행으로 잰다.
//   ⚠ 이것만으로 «0%»가 사라지지는 않는다 — 금요일 만기 뒤엔 가장 가까운 만기가 다음 주로 넘어가 ATM IV 가 창의 최솟값이
//     되기 때문이다(만기 점프). 그건 정의의 성질이라 여기서 지어내 고치지 않는다(.agent/IMPLIED-MOVE-DEFINITION-2026-09-29.md §7).
// [10/4 · 낡은 창] 수집 목록에서 빠진 종목(DIA: 마지막 행 8/28)도 창 200행은 «차 있어» 8월 값으로 «95%»가 나갔다.
//   → nowMs 를 넘기면(API) 마지막 행이 IV_RANK_MAX_AGE_MS 보다 오래된 창은 계산하지 않는다(stale = 미제공).
// [10/4 저녁 · IV30 — 만기 점프의 근본 수리] atmIv(가장 가까운 만기)는 금요일 만기가 지나면 다음 주 만기로 넘어가
//   그 IV 가 창의 최솟값이 됐다(SPY 금 마감 7.55% = 월요일 1일물 — 같은 체인의 30일 IV 는 12.94%, VIX 15.31).
//   → 수집 Lambda 가 행마다 IV30(30일을 사이에 둔 두 만기의 ATM IV 를 분산·시간 가중 보간)과 정의 표식 iv30Def 를 남긴다.
//   옛 atmIv 행과 섞지 않는다: 창(최근 200행)이 전부 표식 있는 행이 될 때까지는 «수집 중»(collecting) — 값이 아니라
//   «새 정의 축적 중»이다(이력 자체가 없는 «미제공»과 다르다). 차면 자동으로 백분위가 나온다.
//   마지막 행에 표식이 없으면(수집 목록 밖) «미제공». 랭킹 «IV 세션 백분위»(ivSessionPct)는 다른 지표 — 아직 atmIv.
// ============================================================================
import { shownRegularSessionDate } from './marketCalendar';

/** 백분위를 재는 창 — 최근 표본 개수(signum-gex-history 행). 수집 15분 간격 × 정규장 ≈ 하루 30개 → 약 7일. */
export const IV_RANK_WINDOW = 200;
/** 창 안에서 ATM IV 가 있는(>0) 표본이 이보다 적으면 계산하지 않는다(웹이 쓰던 문턱 10). */
export const IV_RANK_MIN_IV_SAMPLES = 10;
/** 마지막 이력 행이 이보다 오래됐으면 «지금»의 IV 랭크가 아니다(수집 목록 밖) — 4일(긴 주말 + 여유) */
export const IV_RANK_MAX_AGE_MS = 4 * 86_400_000;
/** 재는 값의 정의 표식 — 수집 Lambda(harvest_lambda/iv30.js IV30_DEF)가 행에 적는 값과 같아야 한다 */
export const IV30_DEF = 'cm30-v1';

export type IvHistoryRow = { atmIv?: unknown; iv30?: unknown; iv30Def?: unknown; timestamp?: unknown };

export type IvRankResult =
    | {
        ok: true;
        percentile: number;
        currentIv: number;
        currentIvAt: number | null;
        /** 현재 값의 세션(ET YYYY-MM-DD) — 주말엔 금요일(그 날 마감 체인 값) */
        currentSession: string | null;
        /** 중복(같은 세션·같은 값)을 한 번으로 센 표본 수 */
        sampleSize: number;
        /** 창 안에서 ATM IV 가 있는 원시 행 수(중복 포함) */
        rawIvRows: number;
        windowRows: number;
        min: number;
        max: number;
        median: number;
    }
    | {
        ok: false;
        /** API _source 접미 — 'dynamodb-' + reason. insufficient* 는 «이 종목은 이력이 모자란다»(= 미제공) · stale = 창이 낡았다(= 미제공)
         *  · collecting = 새 정의(IV30) 창을 채우는 중(= «수집 중», 미제공 아님). */
        reason: 'insufficient' | 'insufficient-iv' | 'no-current' | 'stale' | 'collecting';
        sampleSize: number;
        windowRows: number;
        /** collecting 일 때 — 창 안의 새 정의 행 수(IV_RANK_WINDOW 가 되면 값이 나온다) */
        collectingRows?: number;
        /** collecting 일 때 — 가장 최근 IV30(%) — 백분위는 아직 없어도 수준은 맞는 값 */
        currentIv?: number | null;
    };

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * 순수 함수 — 이력 행(순서 무관) → IV 랭크. 행은 최근 IV_RANK_WINDOW 개를 넘겨받는다고 가정한다(넘치면 최근 것만 쓴다).
 *   창 미달(행 < IV_RANK_WINDOW) → insufficient · ATM IV 표본 < IV_RANK_MIN_IV_SAMPLES → insufficient-iv.
 *   «현재» = timestamp 가 가장 큰, ATM IV 가 있는 행(배열 순서에 기대지 않는다 — 같은 이름 getGexHistory 두 개가 정렬이 반대다).
 */
/** 이력 행의 세션 — 그 시각 화면이 보여 주는 정규장 날짜(평일 09:30 ET 전·주말·휴장 → 직전 거래일) */
export function ivSampleSession(ts: number): string | null {
    return Number.isFinite(ts) && ts > 0 ? shownRegularSessionDate(ts) : null;
}

/**
 * 순수 함수 — 창(최근 행) 안의 ATM IV 표본에서 «같은 세션 · 같은 값»의 반복을 한 번만 남긴다(가장 최근 행을 남김).
 * 입력은 timestamp 내림차순이어야 한다.
 */
export function dedupeIvSamples<T extends { iv: number; ts: number }>(desc: T[]): T[] {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const x of desc) {
        const key = `${ivSampleSession(x.ts) ?? 'na'}|${r2(x.iv)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(x);
    }
    return out;
}

export function ivRankFromHistory(rows: IvHistoryRow[] | null | undefined, opts: { nowMs?: number } = {}): IvRankResult {
    const all = Array.isArray(rows) ? rows : [];
    const sorted = all
        .map((h) => ({ iv: Number(h?.iv30), ts: Number(h?.timestamp), def: h?.iv30Def === IV30_DEF }))
        .sort((a, b) => (Number.isFinite(b.ts) ? b.ts : -Infinity) - (Number.isFinite(a.ts) ? a.ts : -Infinity))
        .slice(0, IV_RANK_WINDOW);
    const windowRows = sorted.length;
    // 새 정의(IV30) 행만 표본 — 옛 atmIv(가장 가까운 만기) 행은 값이 있어도 세지 않는다
    const rawWithIv = sorted.filter((x) => x.def && Number.isFinite(x.iv) && x.iv > 0);
    const withIv = dedupeIvSamples(rawWithIv);
    const sampleSize = withIv.length;
    if (!windowRows) return { ok: false, reason: 'insufficient', sampleSize, windowRows };
    if (opts.nowMs != null && Number.isFinite(sorted[0]?.ts) && opts.nowMs - sorted[0].ts > IV_RANK_MAX_AGE_MS) {
        return { ok: false, reason: 'stale', sampleSize, windowRows };
    }
    // 마지막 행에 표식이 없다 = 이 종목은 IV30 을 수집하지 않는다(수집 목록 밖) → 미제공
    if (!sorted[0]?.def) return { ok: false, reason: 'insufficient', sampleSize, windowRows };
    const collectingRows = sorted.filter((x) => x.def).length;
    if (collectingRows < IV_RANK_WINDOW) {
        return { ok: false, reason: 'collecting', sampleSize, windowRows, collectingRows, currentIv: rawWithIv[0] ? r2(rawWithIv[0].iv) : null };
    }
    if (sampleSize < IV_RANK_MIN_IV_SAMPLES) return { ok: false, reason: 'insufficient-iv', sampleSize, windowRows };
    const cur = withIv[0];
    if (!cur || !(cur.iv > 0)) return { ok: false, reason: 'no-current', sampleSize, windowRows };
    const vals = withIv.map((x) => x.iv).sort((a, b) => a - b);
    const below = vals.filter((v) => v < cur.iv).length;
    return {
        ok: true,
        percentile: Math.round((below / vals.length) * 100),
        currentIv: r2(cur.iv),
        currentIvAt: Number.isFinite(cur.ts) ? cur.ts : null,
        currentSession: ivSampleSession(cur.ts),
        sampleSize,
        rawIvRows: rawWithIv.length,
        windowRows,
        min: r2(vals[0]),
        max: r2(vals[vals.length - 1]),
        median: r2(vals[Math.floor(vals.length / 2)]),
    };
}

type Loc = 'ko' | 'en' | 'ja';
const NOT_PROVIDED: Record<Loc, string> = { ko: '미제공', en: 'N/A', ja: '未提供' };
const COLLECTING: Record<Loc, string> = { ko: '수집 중', en: 'Collecting', ja: '収集中' };
const locOf = (l?: string | null): Loc => (l === 'ko' || l === 'ja' ? l : 'en');
/** IV 랭크가 없는 칸의 글자(앱 flowEmptyStates.notProvidedText 와 같은 글자). */
export function ivRankNotProvidedText(locale?: string | null): string {
    return NOT_PROVIDED[locOf(locale)];
}
/** 새 정의(IV30) 창을 채우는 중인 칸의 글자 — «미제공»(이력 없음)과 다르다. */
export function ivRankCollectingText(locale?: string | null): string {
    return COLLECTING[locOf(locale)];
}
/** /api/flow/iv-percentile 응답이 «수집 중»(새 정의 창 축적)인가 — 실패·시간 초과·미제공은 거짓. */
export function ivRankIsCollecting(resp: unknown): boolean {
    if (!resp || typeof resp !== 'object') return false;
    const r = resp as { percentile?: unknown; _source?: unknown };
    return r.percentile == null && r._source === 'dynamodb-collecting';
}
