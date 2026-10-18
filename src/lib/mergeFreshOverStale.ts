import { shownRegularSessionDate } from './marketCalendar';
import { normalizeVwap } from './vwap';

/** 응답의 기존 생성 시각으로 정규장 날짜를 판정한다. PRE·주말·휴장은 직전 정규장. */
function responseSessionDate(payload: any): string | null {
    const ms = payload?.tsServer;
    return typeof ms === 'number' && Number.isFinite(ms) && ms > 0
        ? shownRegularSessionDate(ms) : null;
}

/**
 * 종목 라우트의 부분 응답을 마지막 정상본에 병합한다.
 * VWAP만 세션 한정: 같은 정규장 날짜일 때만 옛 값을 유지한다.
 * vwapSessionDate를 함께 보존해, 응답 시각이 갱신돼도 값의 날짜는 바뀌지 않는다.
 * 날짜 필드가 없는 기존 캐시는 tsServer로 판정하고, 날짜를 모르면 재사용하지 않는다.
 */
export function mergeFreshOverStale(stale: any, fresh: any): any {
    // 정상본이 없으면 새 응답의 null·빈 배열을 포함한 모양을 그대로 보존한다.
    const out: any = { ...(stale ?? fresh) };
    for (const [k, v] of Object.entries(stale == null ? {} : (fresh || {}))) {
        if (v === null || v === undefined) continue;
        if (Array.isArray(v)) { if (v.length) out[k] = v; continue; }
        if (typeof v === 'object') {
            const inner: any = { ...(stale?.[k] || {}) };
            for (const [k2, v2] of Object.entries(v as any)) {
                if (v2 === null || v2 === undefined) continue;
                if (typeof v2 === 'number' && v2 === 0 && inner[k2]) continue;
                inner[k2] = v2;
            }
            out[k] = inner;
            continue;
        }
        if (typeof v === 'number' && v === 0 && stale?.[k]) continue;
        out[k] = v;
    }

    const freshDate = responseSessionDate(fresh);
    // 명시된 값의 날짜가 있으면 응답 생성 시각보다 우선한다(null도 추정으로 덮지 않는다).
    const staleDate = stale?.vwapSessionDate !== undefined
        ? stale.vwapSessionDate : responseSessionDate(stale);
    const freshVwap = normalizeVwap(fresh?.vwap);
    const sameSession = freshDate !== null && freshDate === staleDate;
    out.vwap = freshVwap ?? (sameSession ? normalizeVwap(stale?.vwap) : null);
    out.vwapSessionDate = out.vwap === null ? null : freshDate;
    return out;
}
