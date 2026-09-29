/**
 * PRO «내 종목» 알림 — 탐지기·신뢰 게이트·문구·조용한 시간 시험 (순수 함수만)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/watchlistAlerts.detect.test.ts
 *
 * 픽스처는 실측 모양을 따른다:
 *   · 9/28 운영 watchlist/batch 의 MU(현재가 1038.87 · 콜월 1000 · 풋플로어 60 · 감마플립 530) — 정의 위반 3건
 *   · 구조 서비스 응답 모양(options_status·levels·gammaFlipType·gexConfidence·_staleSec·_redisAgeSec)
 *   · Intrinio 5분 봉(t = 봉 시작 ms, 시간외 병합 봉 _ext)
 */
import assert from 'node:assert/strict';
import {
    detectTicker, trustLevels, levelDefinitionOk, percentile, maxPainDivergenceP90, darkPoolBaseline, pickWhale,
    DETECT_DEFAULTS, type DetectContext, type DetectPhases,
} from '../src/lib/alerts/detect';
import { inQuietHours, localMinutes } from '../src/lib/alerts/quiet';
import { formatAlert, formatBundle, fmtSignedPct, fmtUsdCompact } from '../src/lib/alerts/messages';
import { levelSetFromStructure, expiryAfterEarnings, lastCompletedRegularBar, realtimeImpliedMove } from '../src/lib/alerts/inputs';
import { tradingSessionsInclusive, nextTradingDate, prevTradingDate } from '../src/lib/alerts/calendar';
import type { LevelSet, TickerSnapshot, DetectedEvent } from '../src/lib/alerts/types';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };

/** EDT(UTC−4) 날짜의 ET 벽시계 → ms (9~10월 픽스처 전용) */
const et = (date: string, hhmm: string) => {
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = hhmm.split(':').map(Number);
    return Date.UTC(y, m - 1, d, hh + 4, mm);
};
const MIN = 60_000;
const WED = '2026-09-30', TUE = '2026-09-29', THU = '2026-10-01', FRI = '2026-10-02';

const NONE: DetectPhases = { intraday: false, maxPain: false, darkPool: false, whale: false, earnings: false };
const ctxAt = (date: string, hhmm: string, phases: Partial<DetectPhases>): DetectContext => ({
    now: et(date, hhmm) + 30_000,
    session: date,
    prevSession: prevTradingDate(date),
    nextSession: nextTradingDate(date),
    phases: { ...NONE, ...phases },
});

const nvdaLevels = (over: Partial<LevelSet> = {}): LevelSet => ({
    callWall: 250, putFloor: 240, gammaFlip: 245, gammaFlipType: 'EXACT', gexConfidence: 'HIGH',
    maxPain: 242.5, pcr: 0.97, spot: 248.1, asOf: et(WED, '10:00'), expiration: FRI, chainDate: TUE,
    ...over,
});

const snap = (ticker: string, date: string, barEnd: string, close: number, levels: LevelSet | null, extra: Partial<TickerSnapshot> = {}): TickerSnapshot => ({
    ticker, at: et(date, barEnd) + 30_000, session: date,
    bar: { close, endMs: et(date, barEnd), session: date },
    levels, arms: {}, ...extra,
});

// ─────────────────────────────────────────────────────────────────────
console.log('━━━ 1. 데이터 신뢰 게이트 — 정의(구조 서비스의 선택 범위와 같은 부등호) ━━━');
t('MU 9/28 실측(S=1038.87): 콜월 1000·풋플로어 60·감마플립 530 → 셋 다 정의 위반, 맥스페인 955 통과', () => {
    const r = trustLevels({
        callWall: 1000, putFloor: 60, gammaFlip: 530, gammaFlipType: 'EXACT', gexConfidence: 'HIGH', maxPain: 955,
        pcr: 1.1, spot: 1038.87, asOf: et(WED, '10:00'), expiration: FRI, chainDate: TUE,
    }, 1038.87, et(WED, '10:05'), { session: WED, prevSession: TUE });
    assert.deepEqual(Object.keys(r.usable), ['maxPain']);
    assert.deepEqual(r.reasons.sort(), ['bad_callWall', 'bad_gammaFlip', 'bad_putFloor']);
});
t('경계: 콜월 = 1.2S 통과 · 1.2S 초과 위반 · 콜월 = S 위반 · 풋플로어 = 0.8S 통과 · 풋플로어 = S 위반', () => {
    assert.equal(levelDefinitionOk('callWall', 120, 100), true);
    assert.equal(levelDefinitionOk('callWall', 120.01, 100), false);
    assert.equal(levelDefinitionOk('callWall', 100, 100), false);
    assert.equal(levelDefinitionOk('putFloor', 80, 100), true);
    assert.equal(levelDefinitionOk('putFloor', 100, 100), false);
    assert.equal(levelDefinitionOk('gammaFlip', 115, 100), true);
    assert.equal(levelDefinitionOk('gammaFlip', 115.1, 100), false);
});
t('낡은 레벨(계산 46분 전) → 세트 전체 불신', () => {
    const r = trustLevels(nvdaLevels(), 248.6, et(WED, '10:46'), { session: WED, prevSession: TUE });
    assert.deepEqual(r.usable, {});
    assert.deepEqual(r.reasons, ['stale_levels']);
});
t('만기 지난 체인(어제 만기) → 불신', () => {
    const r = trustLevels(nvdaLevels({ expiration: TUE }), 248.6, et(WED, '10:05'), { session: WED, prevSession: TUE });
    assert.ok(r.reasons.includes('expired_chain'));
});
t('미결제약정 판본이 직전 거래일보다 앞(월요일에 목요일 OI — 57시간 사고의 모양) → 불신', () => {
    const r = trustLevels(nvdaLevels({ chainDate: '2026-09-28' }), 248.6, et(WED, '10:05'), { session: WED, prevSession: TUE });
    assert.ok(r.reasons.includes('stale_chain'));
});
t('chainDate 가 없으면(현 main 구조 응답) 판본 게이트는 판단하지 않는다', () => {
    const r = trustLevels(nvdaLevels({ chainDate: null }), 248.6, et(WED, '10:05'), { session: WED, prevSession: TUE });
    assert.deepEqual(r.reasons, []);
    assert.equal(r.usable.callWall, 250);
});
t('계산 현물과 현재가 5% 넘게 차이 → 불신', () => {
    const r = trustLevels(nvdaLevels(), 262, et(WED, '10:05'), { session: WED, prevSession: TUE });
    assert.deepEqual(r.reasons, ['spot_drift']);
});
t('감마플립 NEAR_ZERO(근사) · gexConfidence LOW → 감마플립만 제외, 나머지 레벨은 쓴다', () => {
    const a = trustLevels(nvdaLevels({ gammaFlipType: 'NEAR_ZERO' }), 248.6, et(WED, '10:05'), { session: WED, prevSession: TUE });
    assert.equal(a.usable.gammaFlip, undefined);
    assert.equal(a.usable.callWall, 250);
    assert.ok(a.reasons.includes('gamma_flip_not_exact'));
    const b = trustLevels(nvdaLevels({ gexConfidence: 'LOW' }), 248.6, et(WED, '10:05'), { session: WED, prevSession: TUE });
    assert.ok(b.reasons.includes('gamma_low_confidence'));
});

// ─────────────────────────────────────────────────────────────────────
console.log('━━━ 2. 5분 종가 교차 — 무장 → 확정(0.2% 여유) ━━━');
const intraday = (hhmm: string) => ctxAt(WED, hhmm, { intraday: true });

t('NVDA 콜월 250: 248.60 무장 → 250.20(여유 안, 대기·구조가 벽을 260 으로 재선정해도 250 유지) → 250.70 확정 발화', () => {
    const s1 = snap('NVDA', WED, '10:05', 248.6, nvdaLevels());
    const r1 = detectTicker(null, s1, intraday('10:05'));
    assert.equal(r1.events.length, 0);
    assert.deepEqual(r1.arms.callWall && { level: r1.arms.callWall.level, side: r1.arms.callWall.side }, { level: 250, side: 'below' });
    s1.arms = r1.arms;

    const lv2 = nvdaLevels({ callWall: 260, spot: 250.2, asOf: et(WED, '10:10') });
    const s2 = snap('NVDA', WED, '10:10', 250.2, lv2);
    const r2 = detectTicker(s1, s2, intraday('10:10'));
    assert.equal(r2.events.length, 0, '여유 0.2% 안(250.5 미만)은 확정이 아니다');
    assert.equal(r2.arms.callWall?.level, 250, '확정 대기 중에는 새 벽(260)으로 바꾸지 않는다');
    s2.arms = r2.arms;

    const s3 = snap('NVDA', WED, '10:15', 250.7, nvdaLevels({ callWall: 260, spot: 250.2, asOf: et(WED, '10:10') }));
    const r3 = detectTicker(s2, s3, intraday('10:15'));
    assert.equal(r3.events.length, 1);
    const ev = r3.events[0];
    assert.equal(ev.event, 'call_wall_break');
    assert.equal(ev.facts.level, 250);
    assert.equal(ev.facts.nextWall, 260);
    assert.equal(ev.facts.pcr, 0.97);
    assert.equal(ev.sessionKey, WED);
    assert.equal(ev.timeSensitive, true);
    assert.equal(r3.arms.callWall?.level, 260, '돌파 뒤에는 다음 벽을 무장한다');
});
t('여유폭 미달(250.40 < 250.50)은 발화하지 않는다', () => {
    const s1 = snap('NVDA', WED, '10:05', 248.6, nvdaLevels());
    s1.arms = detectTicker(null, s1, intraday('10:05')).arms;
    const r = detectTicker(s1, snap('NVDA', WED, '10:10', 250.4, nvdaLevels()), intraday('10:10'));
    assert.equal(r.events.filter((e) => e.event === 'call_wall_break').length, 0);
});
t('MU 풋플로어 900 이탈: 905 무장(위) → 897.50 ≤ 898.20 확정 · 맥스페인 970 동봉', () => {
    const mu = (over: Partial<LevelSet> = {}): LevelSet => ({
        callWall: 1000, putFloor: 900, gammaFlip: 950, gammaFlipType: 'EXACT', gexConfidence: 'MEDIUM', maxPain: 970, pcr: 1.12,
        spot: 906, asOf: et(WED, '11:00'), expiration: FRI, chainDate: TUE, ...over,
    });
    const s1 = snap('MU', WED, '11:05', 905, mu());
    s1.arms = detectTicker(null, s1, intraday('11:05')).arms;
    assert.equal(s1.arms.putFloor?.side, 'above');
    const r = detectTicker(s1, snap('MU', WED, '11:10', 897.5, mu({ putFloor: 880, spot: 897.5, asOf: et(WED, '11:09') })), intraday('11:10'));
    const ev = r.events.find((e) => e.event === 'put_floor_break')!;
    assert.ok(ev);
    assert.equal(ev.facts.level, 900);
    assert.equal(ev.facts.direction, 'down');
    assert.equal(ev.facts.maxPain, 970);
});
t('감마플립 교차는 양방향 — 아래로(245 → 244.40)', () => {
    const s1 = snap('NVDA', WED, '10:05', 245.8, nvdaLevels({ spot: 245.8 }));
    s1.arms = detectTicker(null, s1, intraday('10:05')).arms;
    assert.equal(s1.arms.gammaFlip?.side, 'above');
    const r = detectTicker(s1, snap('NVDA', WED, '10:10', 244.4, nvdaLevels({ spot: 245.8 })), intraday('10:10'));
    const ev = r.events.find((e) => e.event === 'gamma_flip_cross')!;
    assert.equal(ev.facts.direction, 'down');
    assert.equal(ev.facts.level, 245);
});
t('같은 봉을 두 번 보면(크론이 봉보다 자주 돌 때) 두 번 발화하지 않는다', () => {
    const s1 = snap('NVDA', WED, '10:05', 248.6, nvdaLevels());
    s1.arms = detectTicker(null, s1, intraday('10:05')).arms;
    const s2 = snap('NVDA', WED, '10:10', 250.8, nvdaLevels());
    const r2 = detectTicker(s1, s2, intraday('10:10'));
    assert.equal(r2.events.length, 1);
    s2.arms = { ...s1.arms };   // 저장 실패로 무장이 남아 있다고 가정
    const r3 = detectTicker(s2, { ...s2, at: s2.at + 60_000 }, ctxAt(WED, '10:11', { intraday: true }));
    assert.equal(r3.events.length, 0);
});
t('봉이 낡았으면(끝난 지 12분 초과) · 다른 세션 봉이면 · 20% 넘게 튀면 발화하지 않는다', () => {
    const s1 = snap('NVDA', WED, '10:05', 248.6, nvdaLevels());
    s1.arms = detectTicker(null, s1, intraday('10:05')).arms;
    const stale = detectTicker(s1, snap('NVDA', WED, '10:10', 251, nvdaLevels()), ctxAt(WED, '10:23', { intraday: true }));
    assert.equal(stale.events.length, 0);
    assert.ok(stale.notes.includes('stale_bar'));
    const other = detectTicker(s1, snap('NVDA', TUE, '15:55', 251, nvdaLevels()), intraday('10:10'));
    assert.ok(other.notes.includes('bar_other_session'));
    const jump = detectTicker(s1, snap('NVDA', WED, '10:10', 310, nvdaLevels()), intraday('10:10'));
    assert.equal(jump.events.length, 0);
    assert.ok(jump.notes.includes('bar_jump'));
});
t('무장이 45분 넘게 묵었으면 발화하지 않는다(그 사이 레벨이 한 번도 신뢰되지 않았다)', () => {
    const s1 = snap('NVDA', WED, '10:05', 248.6, nvdaLevels());
    s1.arms = detectTicker(null, s1, intraday('10:05')).arms;
    const s2 = snap('NVDA', WED, '10:55', 251, null);   // 레벨 없음 → 재무장 불가
    const r = detectTicker(s1, s2, intraday('10:55'));
    assert.equal(r.events.length, 0);
});
t('레벨이 무장 시점에 신뢰되지 않았으면(정의 위반 콜월) 무장도 발화도 없다', () => {
    const bad = nvdaLevels({ callWall: 247 });   // S0 248.1 아래 → 콜월 정의 위반
    const s1 = snap('NVDA', WED, '10:05', 246.5, bad);
    const r1 = detectTicker(null, s1, intraday('10:05'));
    assert.equal(r1.arms.callWall, undefined);
    assert.ok(r1.notes.includes('levels:bad_callWall'));
});
t('어제 세션의 무장은 오늘 쓰지 않는다(갭 상승으로 벽을 건너뛴 경우 — 어제 OI 판본이라 발화하지 않는다)', () => {
    const y = snap('NVDA', TUE, '15:55', 248.6, nvdaLevels({ asOf: et(TUE, '15:50'), chainDate: '2026-09-28', expiration: FRI }));
    y.arms = { callWall: { level: 250, side: 'below', armedAt: et(TUE, '15:55'), session: TUE, levelAsOf: et(TUE, '15:50') } };
    const r = detectTicker(y, snap('NVDA', WED, '09:35', 252, nvdaLevels({ spot: 252, callWall: 260, asOf: et(WED, '09:34') })), intraday('09:35'));
    assert.equal(r.events.length, 0);
});

// ─────────────────────────────────────────────────────────────────────
console.log('━━━ 3. 만기 주간 맥스페인 괴리 ━━━');
t('거래일 세기: 수(9/30)→금(10/2) 만기 = 3 · 금 당일 = 1 · 월→금 = 5', () => {
    assert.equal(tradingSessionsInclusive(WED, FRI), 3);
    assert.equal(tradingSessionsInclusive(FRI, FRI), 1);
    assert.equal(tradingSessionsInclusive('2026-09-28', FRI), 5);
    assert.equal(nextTradingDate(FRI), '2026-10-05');
    assert.equal(prevTradingDate('2026-09-08'), '2026-09-04', '노동절(9/7) 건너뜀');
});
t('백분위(최근접 순위) · 20세션 분포에서 오늘 행은 뺀다', () => {
    assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 9);
    const rows = [
        ...Array.from({ length: 40 }, (_, i) => ({ session: `2026-09-${String(1 + (i % 20)).padStart(2, '0')}`, price: 100 + (i % 10) * 0.2, maxPain: 100 })),
        { session: WED, price: 150, maxPain: 100 },
    ];
    const st = maxPainDivergenceP90(rows, WED)!;
    assert.equal(st.n, 40);
    assert.ok(Math.abs(st.p90 - 0.016) < 1e-9);
});
const aapl = (over: Partial<LevelSet> = {}): LevelSet => ({
    callWall: 345, putFloor: 325, gammaFlip: 335, gammaFlipType: 'EXACT', gexConfidence: 'HIGH', maxPain: 332.5, pcr: 0.88,
    spot: 339.4, asOf: et(WED, '10:28'), expiration: FRI, chainDate: TUE, ...over,
});
t('AAPL 만기 3거래일 전 괴리 +2.1% ≥ 자기 20일 상위 10%(1.8%) → 발화', () => {
    const cur = snap('AAPL', WED, '10:30', 339.48, aapl(), { maxPainStats: { date: WED, p90: 0.018, n: 90 } });
    const r = detectTicker(null, cur, ctxAt(WED, '10:31', { maxPain: true }));
    const ev = r.events.find((e) => e.event === 'maxpain_divergence')!;
    assert.ok(ev);
    assert.equal(ev.facts.maxPain, 332.5);
    assert.ok(Math.abs(ev.facts.divergencePct! - 2.1) < 0.01);
    assert.equal(ev.timeSensitive, false);
});
t('만기 주간이 아니면(월요일, 5거래일 남음) · 분포가 얇으면(30 미만) 발화하지 않는다', () => {
    const mon = '2026-09-28';
    const r1 = detectTicker(null, {
        ...snap('AAPL', mon, '10:30', 339.48, aapl({ asOf: et(mon, '10:28'), chainDate: '2026-09-25' }), { maxPainStats: { date: mon, p90: 0.018, n: 90 } }),
    }, ctxAt(mon, '10:31', { maxPain: true }));
    assert.equal(r1.events.length, 0);
    assert.ok(r1.notes.includes('maxpain:not_expiry_week'));
    const r2 = detectTicker(null, snap('AAPL', WED, '10:30', 339.48, aapl(), { maxPainStats: { date: WED, p90: 0.018, n: 12 } }), ctxAt(WED, '10:31', { maxPain: true }));
    assert.ok(r2.notes.includes('maxpain:no_distribution'));
});

// ─────────────────────────────────────────────────────────────────────
console.log('━━━ 4. 장외(다크풀) 비중 급변 — FINRA 날짜 게이트 ━━━');
const dates20 = ['2026-09-02', '2026-09-03', '2026-09-04', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-14', '2026-09-15', '2026-09-16',
    '2026-09-17', '2026-09-18', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-28', '2026-09-29', WED];
const tslaPct = [91.6, 90.1, 88.0, 87.5, 44, 45, 43, 46, 44.5, 45.5, 44, 43.5, 46, 45, 44, 45, 44.2, 45.8, 44.9, 58];
t('기준선은 관측일(오늘) 칸·분모 수리(9/09) 이전 날짜를 뺀다 — 9/02~9/08 의 90% 대 오류값이 평균을 끌어올리지 않는다', () => {
    const b = darkPoolBaseline({ dates: dates20, pct: tslaPct }, WED)!;
    assert.equal(b.n, 15);
    assert.ok(Math.abs(b.mean - 44.6933) < 0.001, `mean=${b.mean}`);
});
t('TSLA 장외 비중 58% (20일 평균 44.7%, +2σ 이상) → 발화 · 문구에 1.3배', () => {
    const cur = snap('TSLA', WED, '15:55', 250, null, { darkPool: { date: WED, pct: 58, series: { dates: dates20, pct: tslaPct } } });
    const r = detectTicker(null, cur, ctxAt(WED, '18:05', { darkPool: true }));
    const ev = r.events.find((e) => e.event === 'darkpool_spike')!;
    assert.ok(ev);
    assert.equal(ev.sessionKey, WED);
    assert.ok(ev.facts.sigma! >= 2);
    assert.equal(formatAlert(ev, 'ko', WED).body.startsWith('20일 평균 44.7%의 1.3배'), true);
});
t('자료 날짜가 오늘이 아니면(FINRA 적재 전 — 어제 값·이월 행) 발화하지 않는다', () => {
    const cur = snap('TSLA', WED, '15:55', 250, null, { darkPool: { date: TUE, pct: 58, series: { dates: dates20, pct: tslaPct } } });
    const r = detectTicker(null, cur, ctxAt(WED, '18:05', { darkPool: true }));
    assert.equal(r.events.length, 0);
    assert.ok(r.notes.includes(`darkpool:date_${TUE}`));
});
t('기준선이 얇으면(15 미만) 발화하지 않는다', () => {
    const cur = snap('TSLA', WED, '15:55', 250, null, { darkPool: { date: WED, pct: 58, series: { dates: dates20.slice(10), pct: tslaPct.slice(10) } } });
    const r = detectTicker(null, cur, ctxAt(WED, '18:05', { darkPool: true }));
    assert.ok(r.notes.includes('darkpool:thin_baseline'));
});

// ─────────────────────────────────────────────────────────────────────
console.log('━━━ 5. 고래 신규 포지션 · 실적 D-1 ━━━');
t('MU 10/2 $600 풋 +3,477계약(명목 $209M) — 명목 1위 · $10M 이상 → 발화, 문구는 화면과 같은 숫자', () => {
    const cur = snap('MU', WED, '09:00', 1000, null, {
        whale: {
            date: TUE, contracts: [
                { type: 'call', strike: 1100, expiration: '2026-10-16', oiChange: 900, notional: 99_000_000 },
                { type: 'put', strike: 600, expiration: FRI, oiChange: 3477, notional: 208_620_000 },
                { type: 'put', strike: 700, expiration: TUE, oiChange: 9000, notional: 630_000_000 },   // 어제 만기 — 신규가 아니다
            ],
        },
    });
    const r = detectTicker(null, cur, ctxAt(WED, '09:05', { whale: true }));
    const ev = r.events.find((e) => e.event === 'whale_new')!;
    assert.equal(ev.facts.contract!.strike, 600);
    assert.equal(ev.sessionKey, TUE);
    const c = formatAlert(ev, 'ko', WED);
    assert.equal(c.title, 'MU 고래 신규 포지션');
    assert.ok(c.body.startsWith('10/2 $600 풋 +3,477계약(명목 $209M)'), c.body);
});
t('명목 < $10M 이고 ΔOI < 10,000 → 발화 안 함 · ΔOI ≥ 10,000 이면 명목이 작아도 발화(화면 uoaAlert 와 같다)', () => {
    assert.equal(pickWhale([{ type: 'call', strike: 20, expiration: FRI, oiChange: 4000, notional: 8_000_000 }], WED), null);
    assert.equal(pickWhale([{ type: 'call', strike: 5, expiration: FRI, oiChange: 12000, notional: 6_000_000 }], WED)?.oiChange, 12000);
});
t('고래 자료가 직전 세션 것이 아니면(적재 전·휴장 lastgood) 발화하지 않는다', () => {
    const cur = snap('MU', WED, '09:00', 1000, null, { whale: { date: '2026-09-28', contracts: [{ type: 'put', strike: 600, expiration: FRI, oiChange: 3477, notional: 208_620_000 }] } });
    const r = detectTicker(null, cur, ctxAt(WED, '09:05', { whale: true }));
    assert.equal(r.events.length, 0);
});
t('실적 D-1: 다음 거래일이 실적일 → 발화 · «MU 내일 장 마감 후 실적» + «옵션 내재 변동 ±7.9%»', () => {
    const cur = snap('MU', WED, '10:30', 1000, null, { earnings: { date: THU, timing: 'amc', impliedMovePct: 7.9 } });
    const r = detectTicker(null, cur, ctxAt(WED, '10:31', { earnings: true }));
    const ev = r.events[0];
    assert.equal(ev.event, 'earnings_d1');
    assert.deepEqual(formatAlert(ev, 'ko', WED), { title: 'MU 내일 장 마감 후 실적', body: '옵션 내재 변동 ±7.9%' });
    assert.deepEqual(formatAlert(ev, 'en', WED), { title: 'MU reports tomorrow after the close', body: 'Options imply ±7.9%' });
    assert.deepEqual(formatAlert(ev, 'ja', WED), { title: 'MU 明日引け後に決算', body: 'オプション織り込み変動 ±7.9%' });
});
t('금요일에 월요일 실적 → D-1(다음 거래일) · 문구는 «내일»이 아니라 날짜', () => {
    const cur = snap('NKE', FRI, '10:30', 80, null, { earnings: { date: '2026-10-05', timing: 'bmo', impliedMovePct: null } });
    const r = detectTicker(null, cur, ctxAt(FRI, '10:31', { earnings: true }));
    assert.equal(r.events.length, 1);
    assert.deepEqual(formatAlert(r.events[0], 'ko', FRI), { title: 'NKE 10/5(월) 장 시작 전 실적', body: '발표일 10/5(월)' });
});
t('실적이 이틀 뒤면 D-1 이 아니다', () => {
    const cur = snap('MU', WED, '10:30', 1000, null, { earnings: { date: FRI, timing: 'amc', impliedMovePct: 7.9 } });
    assert.equal(detectTicker(null, cur, ctxAt(WED, '10:31', { earnings: true })).events.length, 0);
});

// ─────────────────────────────────────────────────────────────────────
console.log('━━━ 6. 문구 — 숫자와 사실만(예측·권유·광고 없음) ━━━');
const ev = (e: Partial<DetectedEvent>): DetectedEvent => ({ ticker: 'NVDA', event: 'call_wall_break', sessionKey: WED, timeSensitive: true, facts: {}, ...e });
t('기획 예문 그대로: «NVDA 콜월 250 돌파 · 다음 벽 260 · 풋콜 0.97»', () => {
    const c = formatAlert(ev({ facts: { level: 250, direction: 'up', price: 250.7, nextWall: 260, pcr: 0.97 } }), 'ko', WED);
    assert.equal(c.title, 'NVDA 콜월 250 돌파');
    assert.equal(c.body, '다음 벽 260 · 풋콜 0.97 · 현재 250.70 · 5분 종가 기준');
});
t('«MU 풋플로어 900 이탈 · 맥스페인 970» (한·영·일)', () => {
    const e = ev({ ticker: 'MU', event: 'put_floor_break', facts: { level: 900, direction: 'down', price: 897.5, maxPain: 970 } });
    assert.equal(formatAlert(e, 'ko', WED).title, 'MU 풋플로어 900 이탈');
    assert.equal(formatAlert(e, 'ko', WED).body, '맥스페인 970 · 현재 897.50 · 5분 종가 기준');
    assert.equal(formatAlert(e, 'en', WED).title, 'MU fell below put floor 900');
    assert.equal(formatAlert(e, 'ja', WED).title, 'MU プットフロア900を下抜け');
});
t('다음 벽·풋콜이 없으면 문구에서 빠진다(없는 값을 만들지 않는다)', () => {
    const c = formatAlert(ev({ facts: { level: 1100, direction: 'up', price: 1103.2, nextWall: null, pcr: null } }), 'en', WED);
    assert.equal(c.title, 'NVDA broke above call wall 1,100');
    assert.equal(c.body, 'Last 1,103.20 · 5-min close');
});
t('모든 이벤트·언어 문구에 권유·예측·광고 단어가 없다', () => {
    const all: DetectedEvent[] = [
        ev({ facts: { level: 250, direction: 'up', price: 250.7, nextWall: 260, pcr: 0.97 } }),
        ev({ event: 'put_floor_break', facts: { level: 900, direction: 'down', price: 897.5, maxPain: 970 } }),
        ev({ event: 'gamma_flip_cross', facts: { level: 225, direction: 'down', price: 224.4 } }),
        ev({ event: 'maxpain_divergence', timeSensitive: false, facts: { maxPain: 332.5, price: 339.48, divergencePct: 2.1, expiration: FRI } }),
        ev({ event: 'darkpool_spike', timeSensitive: false, facts: { pct: 58, mean: 44.6, ratio: 1.3, sigma: 2.4, date: WED } }),
        ev({ event: 'whale_new', timeSensitive: false, facts: { contract: { type: 'put', strike: 600, expiration: FRI, oiChange: 3477, notional: 208_620_000 }, date: TUE } }),
        ev({ event: 'earnings_d1', timeSensitive: false, facts: { earningsDate: THU, timing: 'amc', impliedMovePct: 7.9 } }),
    ];
    const banned = /매수|매도|추천|사세요|파세요|오를|내릴|전망|기회|구독|무료|할인|광고|buy|sell|recommend|opportunity|subscribe|discount|free|will rise|will fall|買い|売り|推奨|おすすめ|購読|無料/i;
    for (const l of ['ko', 'en', 'ja'] as const) {
        for (const e of all) {
            const c = formatAlert(e, l, WED);
            assert.ok(c.title && c.body, `${l} ${e.event} empty`);
            assert.ok(!banned.test(c.title + ' ' + c.body), `${l} ${e.event}: ${c.title} / ${c.body}`);
        }
    }
});
t('요약 한 통(3종목 이상) — «내 종목 알림 4건» + 제목 3줄 + «외 1종목»', () => {
    const g = (T: string) => [ev({ ticker: T, facts: { level: 100, direction: 'up', price: 101 } })];
    const c = formatBundle([g('AAA'), g('BBB'), g('CCC'), g('DDD')], 'ko', WED);
    assert.equal(c.title, '내 종목 알림 4건');
    assert.equal(c.body, 'AAA 콜월 100 돌파 / BBB 콜월 100 돌파 / CCC 콜월 100 돌파 외 1종목');
});
t('숫자 형식: 부호 퍼센트 · 명목 축약', () => {
    assert.equal(fmtSignedPct(2.1), '+2.1%');
    assert.equal(fmtSignedPct(-0.84), '−0.8%');
    assert.equal(fmtUsdCompact(208_620_000), '$209M');
    assert.equal(fmtUsdCompact(1_234_000_000), '$1.2B');
    assert.equal(fmtUsdCompact(12_300_000), '$12.3M');
});

// ─────────────────────────────────────────────────────────────────────
console.log('━━━ 7. 조용한 시간(기기 현지 시각) ━━━');
t('Asia/Seoul 23:00~07:00: 한국 23:30(=ET 10:30) 무음 · 한국 07:00 정각은 창 밖 · 22:59 창 밖', () => {
    const q = { start: '23:00', end: '07:00', tz: 'Asia/Seoul' };
    assert.equal(inQuietHours(q, Date.UTC(2026, 8, 30, 14, 30)), true);    // 23:30 KST
    assert.equal(inQuietHours(q, Date.UTC(2026, 8, 30, 22, 0)), false);    // 07:00 KST
    assert.equal(inQuietHours(q, Date.UTC(2026, 8, 30, 13, 59)), false);   // 22:59 KST
    assert.equal(inQuietHours(q, Date.UTC(2026, 8, 30, 15, 0)), true);     // 00:00 KST — 자정이 «24»로 읽히지 않는다
    assert.equal(localMinutes('Asia/Seoul', Date.UTC(2026, 8, 30, 15, 0)), 0);
});
t('자정을 넘지 않는 창(13:00~14:00 America/New_York) · 창 없음(null) · 잘못된 tz → 무음 아님', () => {
    const q = { start: '13:00', end: '14:00', tz: 'America/New_York' };
    assert.equal(inQuietHours(q, et(WED, '13:30')), true);
    assert.equal(inQuietHours(q, et(WED, '14:00')), false);
    assert.equal(inQuietHours(null, et(WED, '13:30')), false);
    assert.equal(inQuietHours({ start: '00:00', end: '23:59', tz: 'Mars/Olympus' }, et(WED, '13:30')), false);
});

// ─────────────────────────────────────────────────────────────────────
console.log('━━━ 8. 응답 → 입력(구조 서비스 나이 표식·5분 봉·실적 뒤 만기·실시간 내재 변동) ━━━');
const now = et(WED, '10:20');
const structure = (over: any = {}) => ({
    ticker: 'NVDA', options_status: 'OK', expiration: FRI, availableExpirations: [WED, FRI, '2026-10-09', '2026-10-16'],
    underlyingPrice: 248.1, pcr: 0.97, maxPain: 242.5, gammaFlipLevel: 245, gammaFlipType: 'EXACT', gexConfidence: 'HIGH',
    levels: { callWall: 250, putFloor: 240, pinZone: 242.5 }, ...over,
});
t('나이 표식: 방금 계산 → asOf=now · lastgood 1,800초 → 30분 전 · 공유 캐시 40초 · 메모리 캐시(장중 60초 가정/그 밖 모름)', () => {
    assert.equal(levelSetFromStructure(structure(), now).levels!.asOf, now);
    assert.equal(levelSetFromStructure(structure({ cached: true, _staleSec: 1800 }), now).levels!.asOf, now - 1800_000);
    assert.equal(levelSetFromStructure(structure({ cached: true, _redisAgeSec: 40 }), now).levels!.asOf, now - 40_000);
    assert.equal(levelSetFromStructure(structure({ cached: true }), now, { cachedAgeSec: 60 }).levels!.asOf, now - 60_000);
    assert.equal(levelSetFromStructure(structure({ cached: true }), now).levels!.asOf, null);
});
t('계산 실패(PENDING)·옵션 없음 → 레벨 없음(다른 생산자 값으로 메우지 않는다), 만기 목록은 남는다', () => {
    const r = levelSetFromStructure(structure({ options_status: 'PENDING', levels: { callWall: null, putFloor: null } }), now);
    assert.equal(r.levels, null);
    assert.equal(r.expirations.length, 4);
});
t('구조 결과를 그대로 옮긴다 — 콜월·풋플로어·감마플립·맥스페인·풋콜·만기(재계산 없음)', () => {
    const lv = levelSetFromStructure(structure(), now).levels!;
    assert.deepEqual([lv.callWall, lv.putFloor, lv.gammaFlip, lv.maxPain, lv.pcr, lv.expiration, lv.spot], [250, 240, 245, 242.5, 0.97, FRI, 248.1]);
});
t('5분 봉: 진행 중 봉·시간외(_ext)·다른 날 봉은 빼고 «완료된 정규장 봉» 중 마지막', () => {
    const bars = [
        { t: et(WED, '10:15'), c: 251.1 },                 // 10:20 에 끝나야 완료 — now=10:20:00 → 완료
        { t: et(WED, '10:20'), c: 251.5 },                 // 진행 중
        { t: et(WED, '10:10'), c: 250.7 },
        { t: et(WED, '08:00'), c: 247, _ext: true },
        { t: et(TUE, '15:55'), c: 248 },
    ];
    assert.deepEqual(lastCompletedRegularBar(bars, WED, et(WED, '10:20')), { close: 251.1, endMs: et(WED, '10:20'), session: WED });
    assert.equal(lastCompletedRegularBar([{ t: et(WED, '16:00'), c: 250 }], WED, et(WED, '16:30')), null, '16:00 이후 시작 봉은 정규장이 아니다');
});
t('실적 뒤 첫 만기: 장 마감 후(amc) → 다음 만기 · 장 시작 전(bmo) → 당일 만기부터', () => {
    const exps = ['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-09'];
    assert.equal(expiryAfterEarnings(exps, THU, 'amc'), FRI);
    assert.equal(expiryAfterEarnings(exps, THU, 'bmo'), THU);
    assert.equal(expiryAfterEarnings(exps, THU, 'unknown'), FRI);
    assert.equal(expiryAfterEarnings(exps, '2026-10-20', 'amc'), null);
});
t('실시간 내재 변동: _rtGreeks 계약의 midpoint 만 · EOD(mark 와 같은 값)·지연 계약은 버린다', () => {
    const contract = (type: string, k: number, mid: number, rt: boolean, vwap = 0) => ({
        details: { contract_type: type, strike_price: k }, last_quote: { midpoint: mid }, day: { close: 99, vwap }, _rtGreeks: rt,
    });
    const compute = (chain: any[], price: number) => {
        const c = chain.find((x) => x.details.contract_type === 'call')?.last_trade?.price;
        const p = chain.find((x) => x.details.contract_type === 'put')?.last_trade?.price;
        return c && p ? Math.round(((c + p) / price) * 1000) / 10 : null;
    };
    assert.equal(realtimeImpliedMove([contract('call', 1000, 40, true), contract('put', 1000, 39, true)], 1000, compute), 7.9);
    assert.equal(realtimeImpliedMove([contract('call', 1000, 40, false), contract('put', 1000, 39, false)], 1000, compute), null, '실시간이 아니면 없음 — 전일 종가로 메우지 않는다');
    assert.equal(realtimeImpliedMove([contract('call', 1000, 40, true, 40), contract('put', 1000, 39, true)], 1000, compute), null, 'midpoint = EOD mark 인 다리는 버린다');
});

console.log(`\n${n} passed`);
