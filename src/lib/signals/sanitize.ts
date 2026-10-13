/**
 * 요청 입력 정리 — 순수 함수, node 모듈 없음(클라이언트 번들에서도 안전). 푸시 등록 POST 의 종목·시간대를 거른다.
 */
import { SIG_CFG, TICKER_RE } from './types';

/** 요청의 종목 목록 → 정규화(대문자·모양 검사·중복 제거·상한). 배열이 아니면 null(= «보내지 않았다» — 기존 값을 건드리지 않는다) */
export function sanitizeTickers(raw: unknown, max: number = SIG_CFG.maxTickersPerDevice): string[] | null {
    if (!Array.isArray(raw)) return null;
    const seen = new Set<string>();
    const out: string[] = [];
    for (const x of raw) {
        const t = typeof x === 'string' ? x.trim().toUpperCase() : '';
        if (!TICKER_RE.test(t) || seen.has(t)) continue;
        seen.add(t);
        out.push(t);
        if (out.length >= max) break;
    }
    return out;
}

/** IANA 시간대 이름 — 모르는 이름이면 null */
export function sanitizeTz(raw: unknown): string | null {
    if (typeof raw !== 'string' || raw.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(raw)) return null;
    try { new Intl.DateTimeFormat('en-US', { timeZone: raw }); return raw; } catch { return null; }
}
