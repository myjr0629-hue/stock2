// ============================================================================
// FedWatch(CME) 확률 카드의 «1주 변화»와 «기준 시각».
//
// 출발점(2026-10-07 22:41 KST 장중 실측): 카드가 13.5시간 전 스크랩(10/7 01:06 UTC)을 «현재 확률»로 보여 줬고,
//   «1주 변화»는 세 칸 전부 0.0% 였다.
//
// «1주 변화 0.0%» 의 원인 — 2026-08-07 의 서버측 이식(INFRASTRUCTURE_MAP §43.17)이 스크래퍼의 get1WeekAgoData 를 지우면서
//   "prev* 는 서버가 어차피 Redis 직전값으로 대체"한다고 적었다. 직전값 = «방금 전 스크랩»이다. 스크랩이 몇 시간 간격이고 확률이
//   그대로면 prev == 현재 → 항상 0.0%. 이름은 «1주 변화»인데 계산은 «직전 스크랩 대비»였다.
//   고침: GET 에서 DynamoDB 아카이브(FEDWATCH:latest 스트림 — 스크랩마다 한 행)에서 «7일 이상 된 가장 최근 행»을 읽어 prev* 를 그 값으로
//   바꾼다. 기준 행이 없으면(보관 시작 7일 전·12일 넘게 비어 있음) prev* 는 null → 화면은 «0.0%» 가 아니라 «—».
//
// 이 파일은 순수 함수만 둔다 — 라우트(서버)와 두 카드(클라이언트)가 같이 쓴다. 벤더·DB 를 부르지 않는다.
// ============================================================================

export const WEEK_MS = 7 * 24 * 3600 * 1000;
/** 기준 행이 «1주 전»으로 불릴 수 있는 최대 나이 — 이보다 오래 비어 있었으면 1주 변화가 아니다 */
export const WEEK_MAX_AGE_MS = 12 * 24 * 3600 * 1000;
/** 기준 시각 표식을 «낡음»(호박색)으로 바꾸는 나이 — 평일 4~7회 스크랩 중 이만큼 비면 이상이다 */
export const ASOF_STALE_MS = 6 * 3600 * 1000;

export interface WeekAgo { ease: number; noChange: number; hike: number; at: string }

/**
 * DynamoDB FEDWATCH:latest 행 → 1주 전 기준. 쓸 수 없으면 null.
 *   · 확률 셋이 숫자이고 합이 0 보다 커야 한다(0/0/0 은 «데이터 없음»이지 «전부 0%» 가 아니다)
 *   · 행의 시각이 now−7일 보다 새로우면(= 1주 전이 아니면) 안 쓴다 — 쿼리가 이미 거르지만 한 번 더
 *   · now−12일 보다 오래됐으면 안 쓴다
 */
export function weekAgoFromRow(row: any, nowMs: number): WeekAgo | null {
    if (!row || typeof row !== 'object') return null;
    const ease = Number(row.ease), noChange = Number(row.noChange), hike = Number(row.hike);
    if (![ease, noChange, hike].every((v) => Number.isFinite(v) && v >= 0 && v <= 100)) return null;
    if (ease + noChange + hike <= 0) return null;
    const ts = Number.isFinite(Number(row.timestamp)) && Number(row.timestamp) > 0 ? Number(row.timestamp) : Date.parse(String(row.scrapedAt ?? ''));
    if (!Number.isFinite(ts)) return null;
    const age = nowMs - ts;
    if (age < WEEK_MS - 60_000 || age > WEEK_MAX_AGE_MS) return null;
    return { ease, noChange, hike, at: new Date(ts).toISOString() };
}

/**
 * GET 응답의 prev* 를 «직전 스크랩»이 아니라 «1주 전 값»으로 바꾼다. 기준이 없으면 null(화면은 «—»).
 * 원본은 건드리지 않는다. weekAgoAt 으로 기준 행의 시각을 밝힌다.
 */
export function withWeekBaseline<T extends Record<string, any>>(data: T, base: WeekAgo | null): T & {
    prevEase: number | null; prevNoChange: number | null; prevHike: number | null; weekAgoAt: string | null;
} {
    return {
        ...data,
        prevEase: base ? base.ease : null,
        prevNoChange: base ? base.noChange : null,
        prevHike: base ? base.hike : null,
        weekAgoAt: base ? base.at : null,
    };
}

/** 현재값 − 기준값, 소수 첫째 자리. 기준이 없으면 null (0 으로 메우지 않는다 — 0 은 «변화 없음»이라는 주장이다) */
export function weekDelta(cur: unknown, base: unknown): number | null {
    if (typeof cur !== 'number' || typeof base !== 'number' || !Number.isFinite(cur) || !Number.isFinite(base)) return null;
    return Math.round((cur - base) * 10) / 10;
}

type Loc = 'ko' | 'ja' | 'en';
const asLoc = (l: string): Loc => (l === 'ko' || l === 'ja' ? l : 'en');

/**
 * «기준 시각» 표식 — 뉴욕 시각(FedWatch 는 미국 선물 가격). 예) ko «10/6 21:06 ET 기준» · ja «10/6 21:06 ET時点» · en «as of 10/6 21:06 ET».
 * 시각을 읽을 수 없으면 null (표식을 지어내지 않는다).
 */
export function formatAsOfEt(iso: unknown, locale: string): string | null {
    const ms = typeof iso === 'string' ? Date.parse(iso) : NaN;
    if (!Number.isFinite(ms)) return null;
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    const stamp = `${p.month}/${p.day} ${p.hour}:${p.minute} ET`;
    const l = asLoc(locale);
    return l === 'ko' ? `${stamp} 기준` : l === 'ja' ? `${stamp}時点` : `as of ${stamp}`;
}

/** 기준 시각이 «낡았는가» — 시각을 읽을 수 없으면 true(확인할 수 없는 값은 낡은 것으로 표시) */
export function isAsOfStale(iso: unknown, nowMs: number): boolean {
    const ms = typeof iso === 'string' ? Date.parse(iso) : NaN;
    return !Number.isFinite(ms) || nowMs - ms > ASOF_STALE_MS;
}
