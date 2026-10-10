/**
 * 크레딧 페이싱 조절기 — 월 $198 을 남김없이, 넘치지 않게 (src/lib/ai/creditPacing.ts · freshTier.ts · llmLadder 의 증가분 등급)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/creditPacing.test.ts
 *
 * 고정하는 것: 안전 범위(원천보다 잦지 않게) · level 0 = 조절기 이전 상수 · 덜 쓰면 올리고 넘치면 내림 · 머무름 시간 · 월말 3일 ·
 *   목표 도달/착륙/크레딧 불가에서 증가분 정지 · 상태가 낡으면 증가분 정지 · 한 달 시뮬레이션(소멸 $2~3 이하·$199 미초과) ·
 *   증가분 등급(AWS 로 넘기지 않음) · 코드 연결(상수가 BASELINE 을 쓴다).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
    PACING_TARGET_USD, LEVEL_MIN, LEVEL_MAX, BOOTSTRAP_LEVEL, BASELINE_KNOBS, KNOB_BOUNDS, HOLD_MS, DAY_MS,
    knobsForLevel, levelScale, weightedHours, activityWeight, inMarketWindow, marketHoursIn, MIN_MARKET_HOURS_TO_RAISE, effectiveDigestIntervalMin, stepPacing, effectiveLevel,
    tickPacing, peekPacing, pacingKnobs, _resetPacingForTest, PACE_STATE_KEY, STATE_STALE_MS, PREWARM_TICKERS, rotateSlice,
    UC_PREWARM_BY_LEVEL, NEWS_PREWARM_BY_LEVEL, type PacingState,
} from '@/lib/ai/creditPacing';
import { LEDGER_CAP_USD, periodId, nextRenewal } from '@/lib/ai/llmPricing';
import { memoryStore } from '@/lib/ai/llmStore';
import { withFreshTier, inFreshTier, isFreshTierSkipped, FreshTierSkipped } from '@/lib/ai/freshTier';
import { summarizeCalls } from '@/lib/ai/llmStats';
import {
    runLadder, LLM_KEYS, LadderRungError, _resetLadderStateForTest, type LadderDeps, type RungResult, type LegacyResult, type CallRecord,
} from '@/lib/ai/llmLadder';

const root = path.join(__dirname, '..');
let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { _resetPacingForTest(); _resetLadderStateForTest(); await fn(); n++; console.log('ok -', name); };
const H = 3_600_000;
const U = (y: number, m: number, d: number, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi);

/** 측정 구간(가중 w)에 쓴 돈 x 로 정확히 ratio=f 가 되게 하는 누적 — 필요 속도는 «쓴 뒤의 남은 예산»으로 계산되므로 풀어서 구한다 */
const spendForRatio = (base: number, w: number, wRem: number, f: number) => base + ((198 - base) * f * w) / (wRem + f * w);
/** 이미 돌고 있던 상태를 만든다 */
function state(over: Partial<PacingState> & { now: number }): PacingState {
    const { now, ...o } = over;
    return { v: 1, period: periodId(new Date(now)), level: 3, changedAt: now - 5 * H, tickAt: now - 10 * 60_000, mode: 'on-pace', ratio: null, snaps: [[now - 5 * H, 100]], reason: '', ...o };
}

(async () => {
    // ───────────── 상수 · 안전 범위 ─────────────
    await t('목표 $198 · 내부 상한 $199 · 단계 −3~8', () => {
        assert.equal(PACING_TARGET_USD, 198);
        assert.equal(LEDGER_CAP_USD, 199);
        assert.ok(PACING_TARGET_USD < LEDGER_CAP_USD, '목표는 안전망(상한) 아래');
        assert.equal(LEVEL_MIN, -3); assert.equal(LEVEL_MAX, 8); assert.ok(BOOTSTRAP_LEVEL >= 0 && BOOTSTRAP_LEVEL <= 2, '시작은 보수적으로');
    });
    await t('level 0 = 조절기 이전 상수 (다이제스트 15분 · 피드 40분 · 매크로 12분 · 코어 15분 · 종목 10분 · 예열 0)', () => {
        assert.deepEqual(knobsForLevel(0), BASELINE_KNOBS);
        assert.deepEqual(BASELINE_KNOBS, { digestIntervalMin: 15, ucFeedFreshSec: 2400, ucMacroFreshSec: 720, ucCoreFreshSec: 900, ucTickerFreshSec: 600, ucPrewarmTickers: 0, tickerNewsPrewarm: 0 });
    });
    await t('안전 범위: 어떤 단계에서도 최소(원천 주기)보다 잦지 않고 최대보다 느리지 않다 — 다이제스트 5~30분 · UC 수명 ≥ 5분', () => {
        for (let l = LEVEL_MIN - 3; l <= LEVEL_MAX + 3; l++) {
            const k = knobsForLevel(l);
            for (const key of Object.keys(KNOB_BOUNDS) as Array<keyof typeof KNOB_BOUNDS>) {
                const [lo, hi] = KNOB_BOUNDS[key];
                assert.ok(k[key] >= lo && k[key] <= hi, `${key}@${l}=${k[key]} 범위 ${lo}~${hi}`);
            }
            assert.ok(k.digestIntervalMin >= 5 && k.ucCoreFreshSec >= 300 && k.ucFeedFreshSec >= 300 && k.ucMacroFreshSec >= 300 && k.ucTickerFreshSec >= 300);
        }
        assert.equal(knobsForLevel(99).digestIntervalMin, 5); assert.equal(knobsForLevel(-99).digestIntervalMin, 30);
    });
    await t('단계가 오를수록 주기는 짧아지고(같거나) 예열 범위는 넓어진다 · 음수 단계에서는 예열 0', () => {
        let prev = knobsForLevel(LEVEL_MIN);
        for (let l = LEVEL_MIN + 1; l <= LEVEL_MAX; l++) {
            const k = knobsForLevel(l);
            assert.ok(k.digestIntervalMin <= prev.digestIntervalMin && k.ucFeedFreshSec <= prev.ucFeedFreshSec && k.ucMacroFreshSec <= prev.ucMacroFreshSec && k.ucTickerFreshSec <= prev.ucTickerFreshSec && k.ucCoreFreshSec <= prev.ucCoreFreshSec, `단조 ${l}`);
            assert.ok(k.ucPrewarmTickers >= prev.ucPrewarmTickers && k.tickerNewsPrewarm >= prev.tickerNewsPrewarm, `예열 단조 ${l}`);
            prev = k;
        }
        for (let l = LEVEL_MIN; l <= 1; l++) assert.equal(knobsForLevel(l).ucPrewarmTickers + knobsForLevel(l).tickerNewsPrewarm, 0, `level ${l} 예열 0`);
        assert.equal(knobsForLevel(LEVEL_MAX).ucPrewarmTickers, UC_PREWARM_BY_LEVEL[LEVEL_MAX]);
        assert.equal(knobsForLevel(LEVEL_MAX).tickerNewsPrewarm, NEWS_PREWARM_BY_LEVEL[LEVEL_MAX]);
        assert.ok(PREWARM_TICKERS.length >= NEWS_PREWARM_BY_LEVEL[LEVEL_MAX] && PREWARM_TICKERS.length >= UC_PREWARM_BY_LEVEL[LEVEL_MAX]);
        assert.ok(PREWARM_TICKERS.every((x) => /^[A-Z]{1,5}$/.test(x)) && new Set(PREWARM_TICKERS).size === PREWARM_TICKERS.length, '티커 형식·중복 없음');
        assert.ok(levelScale(1) < 1 && levelScale(-1) > 1 && levelScale(0) === 1);
    });
    await t('다이제스트: 장중이 아니면(밤·주말) 기본 15분보다 잦아지지 않는다 · 장중 평일은 조절값 그대로', () => {
        const high = knobsForLevel(5);
        assert.equal(high.digestIntervalMin, 5);
        assert.equal(effectiveDigestIntervalMin(high, U(2026, 10, 12, 15)), 5, '월요일 15시 UTC = 장중');
        assert.equal(effectiveDigestIntervalMin(high, U(2026, 10, 10, 15)), 15, '토요일은 기본');
        assert.equal(effectiveDigestIntervalMin(high, U(2026, 10, 12, 3)), 15, '평일 새벽은 기본');
        assert.equal(effectiveDigestIntervalMin(knobsForLevel(-3), U(2026, 10, 10, 15)), 30, '넘칠 때(느린 쪽)는 그대로 늦춘다');
        assert.ok(inMarketWindow(U(2026, 10, 12, 11)) && !inMarketWindow(U(2026, 10, 12, 23)) && !inMarketWindow(U(2026, 10, 11, 15)));
    });
    await t('가중 시간: 평일 장중 1.0 · 평일 그 밖 0.5 · 주말 0.4 — 구간 경계도 비례', () => {
        assert.equal(activityWeight(U(2026, 10, 12, 15)), 1); assert.equal(activityWeight(U(2026, 10, 12, 3)), 0.5); assert.equal(activityWeight(U(2026, 10, 10, 15)), 0.4);
        assert.ok(Math.abs(weightedHours(U(2026, 10, 12, 15), U(2026, 10, 12, 17)) - 2) < 1e-9);
        assert.ok(Math.abs(weightedHours(U(2026, 10, 12, 15, 30), U(2026, 10, 12, 16, 15)) - 0.75) < 1e-9);
        assert.ok(Math.abs(weightedHours(U(2026, 10, 10), U(2026, 10, 12)) - 48 * 0.4) < 1e-9);
        assert.equal(weightedHours(100, 100), 0); assert.equal(weightedHours(200, 100), 0);
    });

    // ───────────── 한 걸음 ─────────────
    const NOW = U(2026, 10, 14, 15);      // 수요일 장중 — 주기 끝(11/6)까지 22일
    await t('처음 켜면(상태 없음) 보수적인 시작 단계 · 스냅샷 기록 · 오늘 목표 속도 = (198−누적)÷남은 일수', () => {
        const { state: s, decision: d } = stepPacing({ now: NOW, spent: 18, creditOk: true, state: null });
        assert.equal(s.level, BOOTSTRAP_LEVEL); assert.equal(s.mode, 'bootstrap'); assert.equal(s.snaps.length, 1); assert.equal(s.changedAt, NOW);
        const days = (U(2026, 11, 6) - NOW) / DAY_MS;
        assert.ok(Math.abs(d.todayTargetUsd - (198 - 18) / days) < 0.01, `${d.todayTargetUsd}`);
        assert.equal(d.ratio, null, '구간이 모자라면 속도 판단 없음');
        assert.equal(d.endgame, false);
    });
    await t('덜 쓰고 있으면 올린다: 목표 속도의 절반 미만 → +2 · 90% 미만 → +1', () => {
        const wRem = weightedHours(NOW, U(2026, 11, 6));
        const w = weightedHours(NOW - 5 * H, NOW);
        const mk = (frac: number) => stepPacing({ now: NOW, spent: spendForRatio(100, w, wRem, frac), creditOk: true, state: state({ now: NOW, level: 3 }) });
        const a = mk(0.3); assert.equal(a.state.level, 5); assert.equal(a.state.mode, 'raising'); assert.ok(a.decision.ratio! < 0.5);
        const b = mk(0.8); assert.equal(b.state.level, 4);
        const c = mk(1.0); assert.equal(c.state.level, 3); assert.equal(c.state.mode, 'on-pace');
        assert.ok(a.decision.projectedUsedPct! < 100, '덜 쓰는 속도면 월말 예상이 100% 미만');
    });
    await t('넘치면 내린다: 110% 초과 → −1 · 130% 초과 → −2 · 150% 초과는 머무름 시간 중에도 즉시', () => {
        const wRem = weightedHours(NOW, U(2026, 11, 6));
        const w = weightedHours(NOW - 5 * H, NOW);
        const run = (frac: number, st?: Partial<PacingState>, win = w) => stepPacing({ now: NOW, spent: spendForRatio(100, win, wRem, frac), creditOk: true, state: state({ now: NOW, level: 4, ...st }) }).state;
        assert.equal(run(1.2).level, 3); assert.equal(run(1.2).mode, 'lowering');
        assert.equal(run(1.4).level, 2);
        const w35 = weightedHours(NOW - 3.5 * H, NOW);
        const hold = { changedAt: NOW - 3.5 * H, snaps: [[NOW - 3.5 * H, 100]] as Array<[number, number]> };
        assert.equal(run(1.2, hold, w35).level, 4, '머무름(4시간) 중에는 일반 초과로 내리지 않는다');
        assert.equal(run(1.7, hold, w35).level, 2, '머무름 중이어도 크게 넘치면 즉시 −2');
        assert.equal(run(1.0).level, 4);
    });
    await t('머무름 시간: 바꾼 지 4시간이 안 됐으면 (크게 넘치는 경우 외에는) 그대로 · 측정 구간이 3시간 미만이면 판단하지 않는다', () => {
        const wRem = weightedHours(NOW, U(2026, 11, 6));
        const snaps: Array<[number, number]> = [[NOW - 3.5 * H, 100]];
        const w = weightedHours(NOW - 3.5 * H, NOW);
        const held = stepPacing({ now: NOW, spent: spendForRatio(100, w, wRem, 0.3), creditOk: true, state: state({ now: NOW, level: 3, changedAt: NOW - 3.5 * H, snaps }) });
        assert.equal(held.state.level, 3, `${HOLD_MS / H}시간 머무름`);
        const early = stepPacing({ now: NOW, spent: 100, creditOk: true, state: state({ now: NOW, level: 3, changedAt: NOW - 1 * H, snaps: [[NOW - 1 * H, 100]] }) });
        assert.equal(early.state.level, 3); assert.equal(early.decision.ratio, null);
    });
    await t('월말 3일(endgame): 목표 속도에 조금만 못 미쳐도 올린다 · 5% 초과도 내린다', () => {
        const end = U(2026, 11, 3, 15);        // 11/6 까지 2.4일
        const wRemE = weightedHours(end, U(2026, 11, 6));
        const w = weightedHours(end - 3 * H, end);
        const run = (frac: number) => stepPacing({ now: end, spent: spendForRatio(150, w, wRemE, frac), creditOk: true, state: state({ now: end, level: 3, changedAt: end - 3 * H, snaps: [[end - 3 * H, 150]] }) });
        assert.equal(run(0.99).decision.endgame, true);
        assert.equal(run(0.9).state.level, 5, 'ratio<0.97 → +2'); assert.equal(run(0.99).state.level, 4, 'ratio<1 → +1');
        assert.equal(run(1.1).state.level, 2, '1.2 미만 → −1 … 1.1 은 −1');
        assert.equal(run(1.3).state.level, 1, '1.2 초과 → −2');
        // 같은 비율 0.99 가 월중이면 유지(월말만 공격적)
        const mid = stepPacing({ now: NOW, spent: spendForRatio(100, weightedHours(NOW - 5 * H, NOW), weightedHours(NOW, U(2026, 11, 6)), 0.99), creditOk: true, state: state({ now: NOW, level: 3 }) });
        assert.equal(mid.state.level, 3);
    });
    await t('올리기는 장중 증거가 있어야 한다: 주말·밤에 낮게 쓴 것만으로는 올리지 않는다(월요일 장중 폭주 방지) · 내리기는 언제나', () => {
        assert.ok(Math.abs(marketHoursIn(U(2026, 10, 12, 10), U(2026, 10, 12, 14)) - 3) < 1e-9 && marketHoursIn(U(2026, 10, 10, 11), U(2026, 10, 10, 23)) === 0);
        const SAT = U(2026, 10, 10, 20);       // 토요일 — 장중 0시간
        const wRem = weightedHours(SAT, U(2026, 11, 6));
        const w = weightedHours(SAT - 8 * H, SAT);
        const lowSpend = spendForRatio(10, w, wRem, 0.2);
        const weekend = stepPacing({ now: SAT, spent: lowSpend, creditOk: true, state: state({ now: SAT, level: 1, changedAt: SAT - 8 * H, snaps: [[SAT - 8 * H, 10]] }) });
        assert.equal(weekend.state.level, 1, '장중 0시간 — 올리지 않는다'); assert.match(weekend.state.reason, /장중/); assert.ok(weekend.decision.ratio! < 0.5);
        // 같은 비율이어도 측정 구간에 장중이 충분하면(수요일 장중) 올린다
        const WED = U(2026, 10, 14, 18);
        const w2 = weightedHours(WED - 8 * H, WED), wRem2 = weightedHours(WED, U(2026, 11, 6));
        assert.ok(marketHoursIn(WED - 8 * H, WED) >= MIN_MARKET_HOURS_TO_RAISE);
        assert.equal(stepPacing({ now: WED, spent: spendForRatio(10, w2, wRem2, 0.2), creditOk: true, state: state({ now: WED, level: 1, changedAt: WED - 8 * H, snaps: [[WED - 8 * H, 10]] }) }).state.level, 3);
        // 내리기는 장중 증거 없이도(주말에도 크게 넘치면 즉시)
        const over = stepPacing({ now: SAT, spent: spendForRatio(10, w, wRem, 2.0), creditOk: true, state: state({ now: SAT, level: 4, changedAt: SAT - 8 * H, snaps: [[SAT - 8 * H, 10]] }) });
        assert.equal(over.state.level, 2);
    });
    await t('목표 도달(done) → 최대한 늦춘다 · 남은 예산 $0.8 이하(landing) → 증가분 끈다 · 크레딧 불가(credit-off) → 증가분 끈다', () => {
        const done = stepPacing({ now: NOW, spent: 198.2, creditOk: true, state: state({ now: NOW, level: 6 }) });
        assert.equal(done.state.mode, 'done'); assert.equal(done.state.level, LEVEL_MIN);
        const land = stepPacing({ now: NOW, spent: 197.4, creditOk: true, state: state({ now: NOW, level: 6 }) });
        assert.equal(land.state.mode, 'landing'); assert.ok(land.state.level <= 0);
        const off = stepPacing({ now: NOW, spent: 50, creditOk: false, state: state({ now: NOW, level: 6 }) });
        assert.equal(off.state.mode, 'credit-off'); assert.ok(off.state.level <= 0);
        assert.deepEqual([knobsForLevel(off.state.level).ucPrewarmTickers, knobsForLevel(off.state.level).tickerNewsPrewarm], [0, 0]);
        // 이미 음수(절약 중)였으면 크레딧 불가에서도 그 단계를 유지(더 올리지 않는다)
        assert.equal(stepPacing({ now: NOW, spent: 50, creditOk: false, state: state({ now: NOW, level: -2 }) }).state.level, -2);
    });
    await t('다른 주기(11/6 이후)의 상태는 쓰지 않는다 — 새 주기는 처음부터 · 스냅샷은 5일치까지만', () => {
        const old = state({ now: U(2026, 10, 20, 15), level: 7 });
        const fresh = stepPacing({ now: U(2026, 11, 6, 1), spent: 0.4, creditOk: true, state: old });
        assert.equal(fresh.state.mode, 'bootstrap'); assert.equal(fresh.state.level, BOOTSTRAP_LEVEL); assert.equal(fresh.state.period, '2026-11');
        assert.equal(effectiveLevel(old, U(2026, 11, 6, 1)), 0, '읽는 쪽도 다른 주기 상태는 level 0');
        const longSnaps: Array<[number, number]> = Array.from({ length: 400 }, (_, i) => [NOW - (400 - i) * 30 * 60_000, i * 0.1] as [number, number]);
        const s = stepPacing({ now: NOW, spent: 41, creditOk: true, state: state({ now: NOW, snaps: longSnaps }) }).state;
        assert.ok(s.snaps.every(([ts]) => NOW - ts <= 5 * DAY_MS) && s.snaps.length <= 241);
    });
    await t('읽는 쪽 안전: 상태가 12시간 넘게 갱신되지 않으면 증가분을 끈다(level ≤ 0) · 정상이면 저장된 단계', () => {
        const live = state({ now: NOW, level: 5, tickAt: NOW - 20 * 60_000 });
        assert.equal(effectiveLevel(live, NOW), 5);
        const stale = state({ now: NOW, level: 5, tickAt: NOW - STATE_STALE_MS - 1 });
        assert.equal(effectiveLevel(stale, NOW), 0);
        assert.equal(effectiveLevel({ ...stale, level: -2 }, NOW), -2, '절약 중인 음수 단계는 유지');
        assert.equal(effectiveLevel(null, NOW), 0);
    });

    // ───────────── 한 달 시뮬레이션 ─────────────
    /** 10분 단위로 주기 전체를 돌린다. 지출 모델: 가중 시간당 c0 × (1 + slope×level) (음수는 완만) × 수요 변동(±) · 상한 도달 시 정지 */
    function simulate(opts: { c0: number; slope: number; start: number; noise?: number; shock?: { from: number; to: number; mult: number } }) {
        const end = nextRenewal(new Date(opts.start)).getTime();
        let spent = 0.3, st: PacingState | null = null, seed = 12345, maxSpent = 0, hitCap = 0;
        const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
        const levels: number[] = [];
        let capAt = -1;
        for (let now = opts.start; now < end; now += 10 * 60_000) {
            const r = stepPacing({ now, spent, creditOk: spent < LEDGER_CAP_USD, state: st });
            st = r.state; levels.push(st.level);
            const L = st.level;
            const mult = L >= 0 ? 1 + opts.slope * L : 1 + 0.25 * L;
            let inc = opts.c0 * mult * activityWeight(Math.floor(now / H) * H) / 6;
            inc *= 1 + (opts.noise ?? 0.25) * (rnd() - 0.5) * 2;
            if (opts.shock && now >= opts.shock.from && now < opts.shock.to) inc *= opts.shock.mult;
            spent += inc;
            if (spent >= LEDGER_CAP_USD) { hitCap++; if (capAt < 0) capAt = now; spent = LEDGER_CAP_USD; }
            maxSpent = Math.max(maxSpent, spent);
        }
        return { spent, maxSpent, hitCap, levels, capAt, daysAtMax: levels.filter((l) => l === LEVEL_MAX).length / 144 };
    }
    const START = U(2026, 10, 10, 13);      // 오늘 13Z — 실제 시작과 같은 시각
    await t('시뮬레이션: 기본 지출이 낮은($0.08/가중시간≈월 $39)·보통·높은 세 경우 모두 월말 소멸 ≤ $3 · $199 미초과', () => {
        for (const c0 of [0.08, 0.11, 0.2]) {
            const r = simulate({ c0, slope: 0.9, start: START });
            assert.ok(r.spent >= 195 && r.maxSpent < LEDGER_CAP_USD, `c0=${c0}: 최종 $${r.spent.toFixed(2)} (소멸 $${(198 - r.spent).toFixed(2)}) 최대 $${r.maxSpent.toFixed(2)} 상한도달 ${r.hitCap}회`);
        }
    });
    await t('시뮬레이션: 기본이 이미 목표를 넘는 높은 지출($0.6/가중시간)은 단계를 내려 $199 를 넘기지 않는다', () => {
        const r = simulate({ c0: 0.6, slope: 0.9, start: START });
        assert.ok(r.maxSpent < LEDGER_CAP_USD, `최대 $${r.maxSpent.toFixed(2)}`);
        assert.ok(r.levels.some((l) => l < 0), '음수 단계(주기 늘리기)를 썼다');
        assert.ok(r.spent >= 185, `너무 일찍 멈춰 남기지 않는다: $${r.spent.toFixed(2)}`);
    });
    await t('시뮬레이션: 중간에 수요가 3배로 튀는 이틀이 있어도 $199 를 넘지 않고 월말에 거의 다 쓴다', () => {
        const r = simulate({ c0: 0.11, slope: 0.9, start: START, shock: { from: U(2026, 10, 20), to: U(2026, 10, 22), mult: 3 } });
        assert.ok(r.maxSpent < LEDGER_CAP_USD && r.spent >= 193, `최종 $${r.spent.toFixed(2)} 최대 $${r.maxSpent.toFixed(2)}`);
    });
    await t('시뮬레이션: 증가분이 아무리 커도(기울기 2) 상한에 박지 않고 착륙한다 — 상한 도달 0회', () => {
        const r = simulate({ c0: 0.11, slope: 2.0, start: START });
        assert.equal(r.hitCap, 0, `상한 도달 ${r.hitCap}회`);
        assert.ok(r.spent >= 193, `$${r.spent.toFixed(2)}`);
    });

    // ───────────── 저장소 입출력 ─────────────
    const mkDeps = (now: number, over: Partial<{ hasKey: boolean }> = {}) => {
        const store = memoryStore();
        return { store, deps: { store, now: () => now, hasKey: () => over.hasKey !== false } };
    };
    await t('tickPacing: 첫 판단은 저장 · 9분 안 재판단은 저장값 그대로(스냅샷도 안 늘림) · force 는 무시하고 판단', async () => {
        const { store, deps } = mkDeps(NOW);
        store.data.set(LLM_KEYS.cost(periodId(new Date(NOW))), '20');
        const a = await tickPacing(deps);
        assert.equal(a.level, BOOTSTRAP_LEVEL); assert.ok(store.data.has(PACE_STATE_KEY));
        const saved1 = store.data.get(PACE_STATE_KEY);
        const b = await tickPacing({ ...deps, now: () => NOW + 5 * 60_000 });
        assert.equal(store.data.get(PACE_STATE_KEY), saved1, '9분 안은 저장하지 않는다');
        assert.equal(b.level, a.level);
        await tickPacing({ ...deps, now: () => NOW + 31 * 60_000 });
        assert.notEqual(store.data.get(PACE_STATE_KEY), saved1);
        const p = await peekPacing(deps);
        assert.equal(p.targetUsd, 198); assert.equal(p.capUsd, 199); assert.equal(p.spentUsd, 20); assert.ok(p.knobs.digestIntervalMin <= 15);
    });
    await t('tickPacing: 키 없음·a55 서킷 열림·킬 스위치·상한 도달이면 credit-off (증가분 정지)', async () => {
        const base = async (setup: (s: ReturnType<typeof memoryStore>) => void, hasKey = true) => {
            const { store, deps } = mkDeps(NOW, { hasKey });
            store.data.set(PACE_STATE_KEY, JSON.stringify(state({ now: NOW, level: 6, tickAt: NOW - 20 * 60_000 })));
            setup(store);
            return tickPacing(deps);
        };
        assert.equal((await base(() => undefined, false)).mode, 'credit-off');
        assert.equal((await base((s) => s.data.set('llm:cb:a55', String(NOW + 60_000)))).mode, 'credit-off');
        assert.equal((await base((s) => s.data.set('llm:ladder:off', '*'))).mode, 'credit-off');
        assert.equal((await base((s) => s.data.set('llm:ladder:off', JSON.stringify(['UC'])))).mode, 'credit-off');
        assert.equal((await base((s) => s.data.set('llm:ladder:off', JSON.stringify(['FlowAI'])))).mode === 'credit-off', false, '다른 용도의 킬 스위치는 조절기와 무관');
        const cap = await base((s) => s.data.set(LLM_KEYS.cost(periodId(new Date(NOW))), '199.1'));
        assert.equal(cap.mode, 'credit-off'); assert.ok(cap.level <= 0);
        assert.equal(LLM_KEYS.breaker('a55'), 'llm:cb:a55'); assert.equal(LLM_KEYS.off, 'llm:ladder:off');
    });
    await t('pacingKnobs: 저장소가 느리거나 죽으면 기본 값(= 조절기 이전 동작) · 60초 캐시 · 정상이면 저장된 단계', async () => {
        const slow: any = { ...memoryStore(), get: () => new Promise((r) => setTimeout(() => r(null), 2000)) };
        const t0 = Date.now();
        assert.deepEqual(await pacingKnobs({ store: slow, now: () => NOW, hasKey: () => true }, 100), BASELINE_KNOBS);
        assert.ok(Date.now() - t0 < 1000, '느린 저장소를 기다리지 않는다');
        _resetPacingForTest();
        const dead: any = { ...memoryStore(), get: () => Promise.reject(new Error('down')) };
        assert.deepEqual(await pacingKnobs({ store: dead, now: () => NOW, hasKey: () => true }), BASELINE_KNOBS);
        _resetPacingForTest();
        const { store, deps } = mkDeps(NOW);
        store.data.set(PACE_STATE_KEY, JSON.stringify(state({ now: NOW, level: 4, tickAt: NOW - 60_000 })));
        assert.deepEqual(await pacingKnobs(deps), knobsForLevel(4));
        store.data.set(PACE_STATE_KEY, JSON.stringify(state({ now: NOW, level: 0 })));
        assert.deepEqual(await pacingKnobs(deps), knobsForLevel(4), '60초 안은 캐시');
    });
    await t('rotateSlice: 커서부터 한 바퀴 — 모자란 개수·음수·빈 목록도 안전', () => {
        assert.deepEqual(rotateSlice(['a', 'b', 'c', 'd'], 3, 2), ['c', 'd', 'a']);
        assert.deepEqual(rotateSlice(['a', 'b'], 5, 0), ['a', 'b']);
        assert.deepEqual(rotateSlice([], 3, 1), []); assert.deepEqual(rotateSlice(['a'], 0, 1), []); assert.deepEqual(rotateSlice(['a', 'b'], 1, -1), ['b']);
    });

    // ───────────── 증가분 등급 (AWS 로 넘기지 않는다) ─────────────
    const ok = (text: string): RungResult => ({ modelUsed: 'claude-haiku-5-5', parsed: { text, stopReason: 'end_turn', refusalCategory: null, hadThinking: false, usage: { input: 1000, output: 500, cacheWrite: 0, cacheRead: 0 } } });
    const mkL = (opts: { allow?: Record<string, any>; key?: string | undefined; a?: () => RungResult; } = {}) => {
        const store = memoryStore();
        const c = { a: 0, b: 0, legacy: 0 };
        const deps: Partial<LadderDeps> = {
            store, now: () => U(2026, 10, 10, 12), anthropicKey: () => ('key' in opts ? opts.key : 'sk-test'), hasAws: () => true,
            allowlist: () => opts.allow ?? { UC: {} }, log: () => undefined,
            callAnthropic: async () => { c.a++; return (opts.a ?? (() => ok('A55')))(); },
            callBedrock55: async () => { c.b++; return ok('B55'); },
        };
        const legacy = async (): Promise<LegacyResult> => { c.legacy++; return { text: 'LEGACY', model: 'claude-haiku-4.5', priceModel: 'haiku-4.5', usage: { input: 1000, output: 500, cacheWrite: 0, cacheRead: 0 } }; };
        const rq = { purpose: 'UC', system: 'S', userPrompt: 'U', maxTokens: 500 } as any;
        const recs = (): CallRecord[] => { const o: CallRecord[] = []; for (const [k, v] of store.data) if (k.startsWith('llm:calls:')) for (const x of v) o.push(JSON.parse(x)); return o; };
        return { store, c, deps, legacy, rq, recs };
    };
    await t('증가분 등급: 크레딧(①)이 되면 그대로 쓰고 기록에 fr:1 이 붙는다 — 일반 호출은 fr 없음', async () => {
        const m = mkL();
        assert.equal(inFreshTier(), false);
        const o = await withFreshTier(async () => { assert.equal(inFreshTier(), true); return runLadder(m.rq, m.legacy, m.deps); });
        assert.equal(o.provider, 'a55'); assert.equal(m.recs()[0].fr, 1); assert.equal(inFreshTier(), false);
        const m2 = mkL(); await runLadder(m2.rq, m2.legacy, m2.deps); assert.equal(m2.recs()[0].fr, undefined);
        assert.equal(summarizeCalls([...m.recs(), ...m2.recs()])[0].freshN, 1);
    });
    await t('증가분 등급: 크레딧이 실패(429)해도 Bedrock 5.5·현행 Haiku 4.5 를 부르지 않고 건너뛴다 — 일반 호출은 예전처럼 넘어간다', async () => {
        const fail = () => { throw new LadderRungError('rate', 60, '429'); };
        const m = mkL({ a: fail });
        await assert.rejects(() => withFreshTier(() => runLadder(m.rq, m.legacy, m.deps)), (e: any) => isFreshTierSkipped(e) && e instanceof FreshTierSkipped);
        assert.equal(m.c.b, 0, 'Bedrock 5.5 안 부름'); assert.equal(m.c.legacy, 0, '현행(AWS) 안 부름');
        const r = m.recs()[0]; assert.equal(r.fr, 1); assert.equal(r.ok, 0); assert.ok(r.tr.includes('fresh:skip'));
        const normal = mkL({ a: fail });
        const o = await runLadder(normal.rq, normal.legacy, normal.deps);
        assert.equal(o.provider, 'b55', '일반 호출은 ② 로'); assert.equal(normal.c.legacy, 0);
    });
    await t('증가분 등급: 월 상한 도달·키 없음·킬 스위치·허용 목록 밖·서킷 열림 모두 AWS 를 부르지 않고 건너뛴다', async () => {
        const skipCase = async (setup: (m: ReturnType<typeof mkL>) => void, over: Parameters<typeof mkL>[0] = {}) => {
            _resetLadderStateForTest();
            const m = mkL(over); setup(m);
            await assert.rejects(() => withFreshTier(() => runLadder(m.rq, m.legacy, m.deps)), isFreshTierSkipped);
            assert.equal(m.c.b, 0); assert.equal(m.c.legacy, 0); assert.equal(m.c.a, 0);
        };
        await skipCase((m) => m.store.data.set(LLM_KEYS.cost('2026-10'), '199.5'));
        await skipCase(() => undefined, { key: undefined });
        await skipCase((m) => m.store.data.set(LLM_KEYS.off, '*'));
        await skipCase(() => undefined, { allow: {} });
        await skipCase((m) => m.store.data.set(LLM_KEYS.breaker('a55'), String(U(2026, 10, 10, 13))));
    });
    await t('증가분 등급: 추적 밖 용도도 건너뛴다(예전 코드 경로로 AWS 를 부르지 않는다)', async () => {
        const m = mkL(); m.rq.purpose = 'SomethingElse';
        await assert.rejects(() => withFreshTier(() => runLadder(m.rq, m.legacy, m.deps)), isFreshTierSkipped);
        assert.equal(m.c.legacy, 0);
    });

    // ───────────── 코드 연결(소스 대조) ─────────────
    const src = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
    await t('연결: 라우트의 기본 수명이 BASELINE_KNOBS 를 쓰고(값 두 곳 따로 두지 않음) 수명은 조절기에서 받는다', () => {
        assert.match(src('src/app/api/undercurrent/feed/route.ts'), /const FEED_TTL_SEC = BASELINE_KNOBS\.ucFeedFreshSec/);
        assert.match(src('src/app/api/undercurrent/feed/route.ts'), /freshSec: knobs\.ucFeedFreshSec, baselineFreshSec: FEED_TTL_SEC/);
        assert.match(src('src/app/api/undercurrent/feed/route.ts'), /getFreshCore\(origin, knobs\.ucCoreFreshSec\)/);
        assert.match(src('src/app/api/undercurrent/macro/route.ts'), /const TTL_SEC = BASELINE_KNOBS\.ucMacroFreshSec/);
        assert.match(src('src/app/api/undercurrent/macro/route.ts'), /freshSec: knobs\.ucMacroFreshSec, baselineFreshSec: TTL_SEC/);
        assert.match(src('src/app/api/undercurrent/ticker/route.ts'), /const TTL_SEC = BASELINE_KNOBS\.ucTickerFreshSec/);
        assert.match(src('src/app/api/undercurrent/ticker/route.ts'), /freshSec: knobs\.ucTickerFreshSec, baselineFreshSec: TTL_SEC/);
        assert.match(src('src/app/api/undercurrent/feedCore.ts'), /const CORE_FRESH_SEC = 15 \* 60;/);
        assert.equal(BASELINE_KNOBS.ucCoreFreshSec, 15 * 60);
    });
    await t('연결: 증가분 호출 지점이 FreshTierSkipped 를 삼키지 않고 위로 올린다(옛 사본 유지) — 매크로·종목·언어 보정·다이제스트·종목 뉴스', () => {
        for (const f of ['src/app/api/undercurrent/macro/route.ts', 'src/app/api/undercurrent/ticker/route.ts', 'src/app/api/undercurrent/shared.ts', 'src/app/api/guardian/news-digest/route.ts', 'src/app/api/live/ticker-news/route.ts']) {
            assert.match(src(f), /isFreshTierSkipped\(e\)\) throw e/, f);
        }
        assert.match(src('src/app/api/undercurrent/shared.ts'), /withFreshTier\(generate\)/);
        assert.match(src('src/app/api/live/ticker-news/route.ts'), /withFreshTier\(\(\) => build\(ticker, t0\)\)/);
    });
    await t('연결: 크론 — 다이제스트 5분 틱 + 주기 게이트 · UC 평일 5분 틱 · pace-warm 등록 · 매크로도 엿보기', () => {
        const v = JSON.parse(src('vercel.json')).crons as Array<{ path: string; schedule: string }>;
        const has = (p: string, s: string) => v.some((c) => c.path === p && c.schedule === s);
        assert.ok(has('/api/cron/warm-news-digest', '*/5 * * * *'));
        assert.ok(has('/api/cron/uc-warm', '*/5 8-23 * * 1-5') && has('/api/cron/uc-warm', '*/30 0-7 * * 1-5') && has('/api/cron/uc-warm', '7 * * * 0,6'));
        assert.ok(has('/api/cron/pace-warm', '*/10 11-22 * * 1-5') && has('/api/cron/pace-warm', '17 * * * *'));
        assert.equal(new Set(v.map((c) => `${c.path}|${c.schedule}`)).size, v.length, '중복 항목 없음');
        assert.match(src('src/app/api/cron/warm-news-digest/route.ts'), /effectiveDigestIntervalMin\(knobs, startTime\)/);
        assert.match(src('src/app/api/cron/warm-news-digest/route.ts'), /news-digest\?refresh=1\$\{extra \? '&pace=1' : ''\}/);
        assert.match(src('src/app/api/cron/uc-warm/route.ts'), /warmFresh\(baseUrl, `\/api\/undercurrent\/macro\?locale=\$\{l\}`/);
    });
    await t('연결: 관리자 엔드포인트가 pacing(목표·누적·오늘 속도·단계·용도별 주기)을 싣고 pace-tick 을 받는다', () => {
        const a = src('src/app/api/admin/ai-ladder/route.ts');
        assert.match(a, /pacing: \{ \.\.\.pacing, byPurpose: byPurpose\(pacing\) \}/); assert.match(a, /action === 'pace-tick'/);
    });

    // ───────────── 관제 콘솔 칸 ─────────────
    await t('관제: 스냅샷 → «AI 크레딧: 누적 / 목표 · 오늘 속도 · 다음 갱신일» 값 · 파일 없음/깨짐은 null(숫자를 지어내지 않는다)', async () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const SRC = require(path.join(root, 'scripts/hud/sources.js'));
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { pick } = require(path.join(root, 'scripts/hud/ai-credit.js'));
        const os = await import('node:os');
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-ai-'));
        const f = path.join(dir, 'hud-ai-credit.json');
        assert.equal(SRC.loadAiCredit({ file: f }), null, '파일 없음 = null');
        fs.writeFileSync(f, '{깨진');
        assert.equal(SRC.loadAiCredit({ file: f }), null, '깨짐 = null');
        const api = {
            status: { killSwitch: null, spentUsd: 99 },
            pacing: { spentUsd: 41.25, targetUsd: 198, capUsd: 199, level: 4, mode: 'raising', renewsAt: '2026-11-06T00:00:00.000Z', apiKey: 'sk-should-not-be-copied',
                decision: { todayTargetUsd: 7.31, last24hUsd: 6.02, ratio: 0.82, projectedEndUsd: 181.4, projectedUsedPct: 91.6, daysLeft: 21.4 } },
        };
        const snap = pick(api, Date.UTC(2026, 9, 11, 3));
        assert.ok(!JSON.stringify(snap).includes('sk-'), '응답의 다른 필드(비밀 모양)는 복사하지 않는다');
        fs.writeFileSync(f, JSON.stringify(snap));
        const v = SRC.loadAiCredit({ file: f, now: Date.UTC(2026, 9, 11, 3, 30) });
        assert.equal(v.spentUsd, 41.25); assert.equal(v.targetUsd, 198); assert.equal(v.todayTargetUsd, 7.31); assert.equal(v.last24hUsd, 6.02);
        assert.equal(v.level, 4); assert.equal(v.mode, 'raising'); assert.equal(v.renewsAt, '2026-11-06T00:00:00.000Z'); assert.equal(v.ageMin, 30);
        assert.throws(() => pick({ pacing: null }), /pacing/);
        fs.rmSync(dir, { recursive: true, force: true });
        const html = fs.readFileSync(path.join(root, 'scripts/hud/index.html'), 'utf8');
        assert.match(html, /AI 크레딧 · 누적 \/ \$'\+nf\(C\.targetUsd\)\+' 목표/); assert.match(html, /오늘 목표 속도/); assert.match(html, /다음 갱신일/);
        assert.match(fs.readFileSync(path.join(root, 'scripts/hud/server.js'), 'utf8'), /aiCredit: SRC\.loadAiCredit\(\)/);
    });

    console.log(`\n${n} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
