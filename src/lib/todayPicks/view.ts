/**
 * «✦ AI 오늘 볼 것» — 화면용 한 언어 묶음 · 푸시 한 줄 선택(순수 함수). 시험: tests/todayPicks.test.ts
 */
import { PUSH_LINE_MAX } from '@/lib/push/aiLine';
import { checkPushLine } from '@/lib/ai/todayPicksLine';
import { viewOf } from './copy';
import type { Loc, PickKind, Slot, TodayPicksDoc } from './types';

export interface PickView {
    id: string; ticker: string; kind: PickKind; label: string; asOf: string; what: string; why: string; ai: boolean;
}
export interface PicksView {
    off: boolean;
    slot?: Slot;
    etDate?: string;
    /** 선별한 시각 «10/12 17:55» (ET) */
    pickedAt?: string;
    at?: number;
    items: PickView[];
    /** 다크풀(FINRA) 항목이 있다 → 출처 표기가 필요하다 */
    hasFinra: boolean;
}

/** ET 벽시계 «10/12 17:55» */
export function pickedAtLabel(at: number): string {
    const d = new Date(at).toLocaleString('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return d.replace(',', '');
}

export function buildView(doc: TodayPicksDoc | null, loc: Loc, off = false): PicksView {
    if (!doc || off) return { off, items: [], hasFinra: false };
    return {
        off: false, slot: doc.slot, etDate: doc.etDate, at: doc.at, pickedAt: pickedAtLabel(doc.at),
        items: doc.items.map((p) => viewOf(p, loc)),
        hasFinra: doc.items.some((p) => p.kind === 'darkpool'),
    };
}

/**
 * 마감 푸시 본문에 붙일 «1번 항목 한 줄» — 오늘(ET) 문서만. 길이 상한·금지어·예측어·언어는 기존 푸시 규칙(PUSH_LINE_MAX · lib/push/aiLine)을 그대로 따른다.
 * 하나라도 걸리면 null(= 줄을 붙이지 않는다).
 */
export function pushPickLine(doc: TodayPicksDoc | null, loc: Loc, todayEt: string): { line: string | null; reason: string } {
    if (!doc || !doc.items.length) return { line: null, reason: 'no-doc' };
    if (doc.etDate !== todayEt) return { line: null, reason: 'not-today' };
    const line = doc.items[0].push?.[loc];
    if (typeof line !== 'string' || !line) return { line: null, reason: 'no-line' };
    const bad = checkPushLine(line, loc, PUSH_LINE_MAX[loc]);
    if (bad.length) return { line: null, reason: `guard:${bad[0]}` };
    return { line, reason: 'ok' };
}

// ── 웹 «오늘 볼 것» 페이지의 앱 연결 링크 ──────────────────────────────────────
/** 언어별 코드·착지는 실적 주간 페이지와 같다(대표 10/11 지시). from 태그만 따로 — 이 페이지의 클릭을 따로 센다(coupon.ts BY_TAG 가 «SIGNUM 웹»으로 읽는다). */
export const TODAY_APP_FROM = 'today_picks';
export { APP_CODE as TODAY_APP_CODE } from '@/lib/earningsWeek';
