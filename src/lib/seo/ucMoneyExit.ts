/**
 * UC 종목 응답(/api/undercurrent/ticker)이 «사본»에서 나갈 때 money 의 가격·옵션 레벨을 현재 판본으로 바로잡는다 — 순수 함수(시험: tests/ucMoneyExit.test.ts).
 *
 * 사고(10/13 실측): 사본(NVDA·MU·MSTR 등)은 월요일 09:35 ET 에 만들어져 22:00 ET 에도 그대로 나갔다(_stale true).
 *   · money.price 229.28(금요일 종가) — 실제 월요일 종가 226.32 (웹 /flow/NVDA·UC 종목 조회가 «최근가»로 보였다)
 *   · money 레벨 MU 풋플로어 1000(구조 판본 800)·MSTR 풋플로어 142(125)·NVDA 맥스페인 215(220)·ASTS 64/60(55/55)
 *   UC 화면의 레벨 지도(LevelMap)는 이 값을 그대로 그린다. 레벨은 «구조 한 벌»뿐이다(options-levels-five-producers-one-door-rule) —
 *   모든 문은 나가기 직전 저장된 구조 판본(계산 없음)으로 덮는다. 웹 종목 페이지(/flow/[t])는 이미 같은 함수(displayLevels)로 구조를 읽는다.
 * 구조 판본이 없거나 체인이 낡았으면 기존 사본을 둔다. 만기 롤오버 대기를 확인했으면 사본 숫자도 비운다.
 */
import { displayLevels, type OptionLevels } from '@/lib/optionLevelGate';
import { seoPrice } from '@/lib/seo/freshness';
import { isOptionExpiredAt, copyLevelsPastExpiry } from '@/lib/marketCalendar';

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
    const pending = () => {
        out.maxPain = null; out.callWall = null; out.putFloor = null;
        out.levelsPending = true;
        out.levelsChainDate = sl?.levelsChainDate ?? null;
        out.levelsAsOf = sl?.levelsAsOf ?? null;
        return out as T;
    };
    // 레벨 문이 만기 롤오버 대기를 알려 왔으면 사본 숫자로 되살리지 않는다.
    if (sl && (isOptionExpiredAt(sl.levelsExpiration, ctx.now) || (sl.levelsSource === null && sl.levelsStaleReason === 'stale'))) return pending();
    if (sl && sl.levelsExpiration && sl.levelsExpiration >= ctx.todayET && !sl.levelsStaleReason) {
        const dl = displayLevels(sl, null, 'uc/ticker', ctx.now);
        if (dl.maxPain != null || dl.callWall != null || dl.putFloor != null) {
            out.levelsPending = false;
            out.maxPain = dl.maxPain ?? null;
            out.callWall = dl.callWall ?? null;
            out.putFloor = dl.putFloor ?? null;
            return out as T;
        }
    }
    // 구조 판본이 없거나·낡았거나·세 레벨이 모두 비었으면 사본 숫자가 남는다 — 그 사본이 이미 만기가 지난 주간 레벨이면(금 마감 뒤 등) 비운다.
    //   사본은 만기를 싣지 않아 만든 시각으로 가린다(marketCalendar.copyLevelsPastExpiry). 만든 시각을 모르거나 사본에 레벨이 원래 없으면(옵션 없는 종목) 그대로 둔다.
    if ((out.maxPain != null || out.callWall != null || out.putFloor != null) && copyLevelsPastExpiry(ctx.generatedAt, ctx.now)) return pending();
    return out as T;
}
