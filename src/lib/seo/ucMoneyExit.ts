/**
 * UC 종목 응답(/api/undercurrent/ticker)이 «사본»에서 나갈 때 money 의 가격·옵션 레벨을 현재 판본으로 바로잡는다 — 순수 함수(시험: tests/ucMoneyExit.test.ts).
 *
 * 사고(10/13 실측): 사본(NVDA·MU·MSTR 등)은 월요일 09:35 ET 에 만들어져 22:00 ET 에도 그대로 나갔다(_stale true).
 *   · money.price 229.28(금요일 종가) — 실제 월요일 종가 226.32 (웹 /flow/NVDA·UC 종목 조회가 «최근가»로 보였다)
 *   · money 레벨 MU 풋플로어 1000(구조 판본 800)·MSTR 풋플로어 142(125)·NVDA 맥스페인 215(220)·ASTS 64/60(55/55)
 *   UC 화면의 레벨 지도(LevelMap)는 이 값을 그대로 그린다. 레벨은 «구조 한 벌»뿐이다(options-levels-five-producers-one-door-rule) —
 *   모든 문은 나가기 직전 저장된 구조 판본(계산 없음)으로 덮는다. 웹 종목 페이지(/flow/[t])는 이미 같은 함수(displayLevels)로 구조를 읽는다.
 * 구조 판본이 없거나 낡았다는 표식(levelsStaleReason)이 있거나 만기가 지났으면 레벨은 건드리지 않는다(사본보다 나쁜 값을 내지 않는다).
 */
import { displayLevels, type OptionLevels } from '@/lib/optionLevelGate';
import { seoPrice } from '@/lib/seo/freshness';

export interface UcExitCtx {
    generatedAt: string | null | undefined;
    lastClosed: string;
    now: number;
    regularNow: boolean;
    todayET: string;
    eod: { date: string; close: number } | null | undefined;
    levels: OptionLevels | null | undefined;
}

export function ucMoneyAtExit<T extends Record<string, any> | null | undefined>(money: T, ctx: UcExitCtx): T {
    if (!money || typeof money !== 'object') return money;
    const out: Record<string, any> = { ...money };
    if (money.price != null) {
        out.price = seoPrice({ payloadPrice: money.price, generatedAt: ctx.generatedAt, lastClosed: ctx.lastClosed, eod: ctx.eod, now: ctx.now, regularNow: ctx.regularNow });
    }
    const sl = ctx.levels;
    if (sl && sl.levelsExpiration && sl.levelsExpiration >= ctx.todayET && !sl.levelsStaleReason) {
        const dl = displayLevels(sl, null, 'uc/ticker');
        if (dl.maxPain != null || dl.callWall != null || dl.putFloor != null) {
            out.maxPain = dl.maxPain ?? null;
            out.callWall = dl.callWall ?? null;
            out.putFloor = dl.putFloor ?? null;
        }
    }
    return out as T;
}
