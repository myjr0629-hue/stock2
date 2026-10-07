/**
 * 가디언 «공유 코어» — 언어와 무관한 시장 숫자는 한 번만 계산해 ko·ja·en 이 같이 쓴다 (src/services/guardian/guardianCore.ts)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/guardianCore.test.ts
 *
 * 출발점(2026-10-07 22:41 KST 장중 실측): 같은 시각 RLSI 가 ko 42.7 · ja 43.4 · en 46.3, GEX 가 −26 · −10 · −16.
 * 10/8 00:2x KST 운영 8회 표본: 8회 중 7회 RLSI 가 언어마다 달랐고, en 스냅샷은 내용이 6분(15:17:40) 묵은 채 «신선»으로 나갔다
 *   (워커가 옛 스냅샷에 새 _workerTimestamp 만 다시 찍기 때문), 잠금 중엔 9분 묵은 lastgood(ja ts 15:12:44)가 나갔다.
 */
import assert from 'node:assert/strict';
import {
    CORE_FRESH_CLOSED_MS, CORE_FRESH_MS, CORE_LOCK_MS, CORE_MAX_STALE_MS, VERDICT_TEXTS,
    _resetCoreForTest, deriveLocaleParts, getSharedCore, isUsableCore, overlayCore,
    type CoreDeps, type GuardianCore,
} from '@/services/guardian/guardianCore';

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { _resetCoreForTest(); await fn(); n++; console.log('ok -', name); };

// ── 고정 시계 ─────────────────────────────────────────────────────────────────
const T0 = Date.parse('2026-10-07T15:19:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

// ── 코어 재료 ─────────────────────────────────────────────────────────────────
function makeCore(over: { at?: number; score?: number; nq?: number; gex?: number; sq?: number; session?: string; level?: string;
    dir?: string; conv?: string; rvol?: number | null; rvolStatus?: string; sectors?: any[]; us10yChg?: number; vectors?: any[]; targetId?: string } = {}): GuardianCore {
    const score = over.score ?? 42.7;
    const sectors = over.sectors ?? [
        { id: 'XLK', name: 'Technology', change: -0.9, volume: 1, topConstituents: [
            { symbol: 'NVDA', price: 1, change: -1.1, volume: 1 }, { symbol: 'MSFT', price: 1, change: 0.3, volume: 1 }, { symbol: 'AAPL', price: 1, change: 0.2, volume: 1 }] },
        { id: 'XLE', name: 'Energy', change: 0.8, volume: 1 },
    ];
    return {
        v: 1,
        timestamp: iso(over.at ?? T0),
        session: over.session ?? 'REG',
        rlsi: { score, level: over.level ?? 'NEUTRAL', session: over.session ?? 'REG', regime: 'NEUTRAL', zScore: null, zSignal: null, gammaAdjustment: 0,
            components: { gexIndex: over.gex ?? -9, squeezeRisk: over.sq ?? 47, breadthPct: 16, adRatio: 0.2, volumeBreadth: 48, breadthSignal: 'BEARISH', breadthDivergent: false } } as any,
        market: { nqChangePercent: over.nq ?? -0.73, vix: 15.71, factors: { us10y: { level: 5.33, chgPct: over.us10yChg ?? 0.4 } } } as any,
        sectors: sectors as any,
        vectors: (over.vectors ?? [{ sourceId: 'XLK', targetId: 'XLE', strength: 12, rank: 1 }]) as any,
        sourceId: 'XLK',
        targetId: over.targetId ?? 'XLE',
        rvol: { ndx: { ticker: 'QQQ', rvol: over.rvol === undefined ? 0.9 : over.rvol, status: over.rvolStatus ?? 'OPEN' } as any, dow: { ticker: 'DIA', rvol: 1, status: 'OPEN' } as any },
        ma20Breadth: { ndx: { pctAbove20: 44, covered: 100, universe: 100, asOf: '2026-10-07' }, dow: { pctAbove20: 40, covered: 30, universe: 30, asOf: '2026-10-07' } },
        rotationIntensity: { score: 61, direction: over.dir ?? 'RISK_OFF', topInflow: [], topOutflow: [], breadth: 38.4, conviction: over.conv ?? 'MEDIUM', regime: 'MIXED' } as any,
        breadth: { advancers: 80, decliners: 420, unchanged: 5, totalTickers: 505, breadthPct: 16, adRatio: 0.2, volumeBreadth: 48, signal: 'BEARISH', isDivergent: false, hasData: true },
        rlsiHistory: [{ time: iso(T0 - 60000), score: Math.round(score) }],
        gammaShield: { gexIndex: over.gex ?? -9, gexLevel: 'NEUTRAL', gexLabel: 'NEUTRAL ZONE', squeezeRisk: over.sq ?? 47, squeezeLevel: 'HIGH' } as any,
        news: ['headline'],
    };
}

/** 언어별 컨텍스트 — 계산 경로(computeGuardianSnapshot)가 만드는 모양을 코어에서 그대로 조립한다 */
function ctxOf(core: GuardianCore, locale: 'ko' | 'en' | 'ja', verdict?: any): any {
    const p = deriveLocaleParts(core, locale);
    return {
        rlsi: core.rlsi, market: core.market, sectors: core.sectors, vectors: core.vectors,
        verdict: verdict ?? { title: 'TACTICAL INSIGHT', description: `AI-${locale}`, sentiment: 'NEUTRAL', realityInsight: `R-${locale}`, gammaInsight: `G-${locale}` },
        divergence: p.divCase, verdictSourceId: core.sourceId, verdictTargetId: core.targetId, marketStatus: p.marketStatus,
        rvol: core.rvol, ma20Breadth: core.ma20Breadth, rotationIntensity: core.rotationIntensity, ruleVerdict: p.ruleVerdict, tripleA: p.tripleA,
        breadth: core.breadth, rlsiHistory: core.rlsiHistory, gammaShield: core.gammaShield,
        timestamp: iso(Date.parse(core.timestamp) + 3000), coreAt: core.timestamp,
    };
}

// ── 가짜 의존(Redis·잠금·배경 예약) ───────────────────────────────────────────
function makeDeps(init: { redis?: GuardianCore | null; lockAt?: number | null; now?: () => number; session?: string; compute?: (force: boolean) => Promise<GuardianCore>;
    background?: boolean; bgLockOk?: boolean; redisFails?: boolean } = {}) {
    const state = { redis: init.redis ?? null, lockAt: init.lockAt ?? null, computes: 0, writes: 0, locksWritten: 0, bgJobs: [] as Array<() => Promise<void>>, bgLocks: 0, bgUnlocks: 0, logs: [] as string[] };
    const clock = init.now ?? (() => T0);
    const deps: CoreDeps = {
        now: clock,
        session: () => init.session ?? 'REG',
        read: async () => { if (init.redisFails) throw new Error('redis down'); return state.redis; },
        write: async (core) => { if (init.redisFails) throw new Error('redis down'); state.writes++; state.redis = core; },
        readLock: async () => { if (init.redisFails) throw new Error('redis down'); return state.lockAt; },
        writeLock: async (at) => { state.locksWritten++; state.lockAt = at; },
        compute: async (force) => { state.computes++; return init.compute ? init.compute(force) : makeCore({ at: clock() }); },
        background: init.background === false ? undefined : (job) => { state.bgJobs.push(job); return true; },
        bgLock: async () => { state.bgLocks++; return init.bgLockOk !== false; },
        bgUnlock: async () => { state.bgUnlocks++; },
        log: (m) => state.logs.push(m),
    };
    return { deps, state };
}

(async () => {
    // ═══ A. 파생(deriveLocaleParts) — 옛 인라인 계산과 같은 결과 ═══════════════════════════════════
    await t('파생: 10/7 장중(나스닥 −0.73%·RLSI 42.7) = 괴리 없음 «N» — 세 언어 문장에 같은 숫자(RLSI 43·−0.73%)', () => {
        const core = makeCore();
        const ko = deriveLocaleParts(core, 'ko'), en = deriveLocaleParts(core, 'en'), ja = deriveLocaleParts(core, 'ja');
        assert.equal(ko.divCase.caseId, 'N');
        assert.equal(ko.divCase.verdictDesc, 'NASDAQ -0.73%, RLSI 43. 지수와 유동성 흐름이 동기화 상태. 이상 징후 미관측.');
        assert.equal(en.divCase.verdictDesc, 'NASDAQ -0.73%, RLSI 43. Index and liquidity flows are aligned. No divergence detected.');
        assert.equal(ja.divCase.verdictDesc, 'NASDAQ -0.73%、RLSI 43。指数と流動性フローが同期状態。乖離は未観測。');
        assert.equal(ko.divCase.verdictTitle, 'MARKET SYNCHRONIZED');
    });

    await t('파생: 괴리 A(지수↑·RLSI<40) / B(지수↓·RLSI>60) / C / D 경계 — 옛 코드와 같다', () => {
        const a = deriveLocaleParts(makeCore({ nq: 0.31, score: 39.6 }), 'ko').divCase;
        assert.equal(a.caseId, 'A'); assert.equal(a.isDivergent, true); assert.equal(a.score, 90);
        assert.equal(a.verdictDesc, 'NASDAQ +0.31% 상승 중이나 RLSI 40(40 미만)으로 유동성 지표는 약세. 지수 표면의 강세와 내부 유동성 흐름의 괴리 관측.');
        assert.equal(deriveLocaleParts(makeCore({ nq: 0.3, score: 30 }), 'ko').divCase.caseId, 'N');            // nq > 0.3 이어야 A
        const b = deriveLocaleParts(makeCore({ nq: -0.21, score: 61 }), 'en').divCase;
        assert.equal(b.caseId, 'B'); assert.equal(b.verdictTitle, 'STEALTH INFLOW'); assert.equal(b.isDivergent, true);
        assert.equal(deriveLocaleParts(makeCore({ nq: -0.2, score: 70 }), 'en').divCase.caseId, 'N');            // nq < −0.2 이어야 B
        const c = deriveLocaleParts(makeCore({ nq: 0.51, score: 71 }), 'ja').divCase;
        assert.equal(c.caseId, 'C'); assert.equal(c.isDivergent, false); assert.equal(c.verdictTitle, 'MOMENTUM SURGE');
        const d = deriveLocaleParts(makeCore({ nq: -0.51, score: 29 }), 'ko').divCase;
        assert.equal(d.caseId, 'D'); assert.equal(d.verdictTitle, 'MOMENTUM DEPLETION');
        assert.equal(VERDICT_TEXTS.RETAIL_TRAP.ko.title, 'DIVERGENCE DETECTED');
    });

    await t('파생: marketStatus — OPTIMAL=GO · DANGER=STOP · 그 외 RLSI ≥ 50 이면 GO', () => {
        assert.equal(deriveLocaleParts(makeCore({ level: 'OPTIMAL', score: 10 }), 'ko').marketStatus, 'GO');
        assert.equal(deriveLocaleParts(makeCore({ level: 'DANGER', score: 90 }), 'ko').marketStatus, 'STOP');
        assert.equal(deriveLocaleParts(makeCore({ level: 'NEUTRAL', score: 50 }), 'ko').marketStatus, 'GO');
        assert.equal(deriveLocaleParts(makeCore({ level: 'NEUTRAL', score: 49.9 }), 'ko').marketStatus, 'WAIT');
    });

    await t('파생: Triple-A — 체크리스트 값(RLSI 43·−0.73%·섹터·RVOL·10Y)과 5개 조건, 세 언어 라벨만 다르다', () => {
        const core = makeCore();
        const ko = deriveLocaleParts(core, 'ko').tripleA, en = deriveLocaleParts(core, 'en').tripleA, ja = deriveLocaleParts(core, 'ja').tripleA;
        assert.equal(ko.regime, 'NEUTRAL'); assert.equal(ko.isTargetLock, false);
        assert.deepEqual(ko.checklist.conditions.map((c) => c.current), ['43', '-0.73%', 'Energy +0.80%', '0.90x', '+0.40%']);
        assert.deepEqual(en.checklist.conditions.map((c) => c.current), ko.checklist.conditions.map((c) => c.current));   // 숫자는 언어와 무관
        assert.deepEqual(ja.checklist.conditions.map((c) => c.current), ko.checklist.conditions.map((c) => c.current));
        assert.notEqual(ko.checklist.conditions[1].label, en.checklist.conditions[1].label);                               // 라벨만 다르다
        assert.equal(ko.checklist.message, 'STANDBY :: 관망 구간');
        assert.equal(ko.checklist.passedCount, 1);   // RLSI<55 ✗ · 나스닥<0 ✗ · 섹터 정렬(regime≠BULL) ✗ · RVOL 0.9<1.2·벡터 12<25 ✗ · 금리 안정 ✓ → 1
        assert.equal(ko.checklist.totalCount, 5);
    });

    await t('파생: RVOL 측정 불가(장외)면 «—» (0.00x 단정 금지) · 강세 잠금 조건', () => {
        const off = deriveLocaleParts(makeCore({ rvol: null, rvolStatus: 'CLOSED' }), 'ko').tripleA.checklist.conditions.find((c) => c.id === 'rvol')!;
        assert.equal(off.current, '—');
        // BULL + 섹터 정렬 + 가속(벡터 강도 30) + 매집(상위3 중 2개 상승) + 금리 안정 → 잠금
        const lock = deriveLocaleParts(makeCore({ score: 60, nq: 0.5, dir: 'RISK_ON', targetId: 'XLK', vectors: [{ sourceId: 'XLE', targetId: 'XLK', strength: 30, rank: 1 }],
            sectors: [{ id: 'XLK', name: 'Technology', change: 1.2, volume: 1, topConstituents: [
                { symbol: 'NVDA', price: 1, change: 1.1, volume: 1 }, { symbol: 'MSFT', price: 1, change: 0.3, volume: 1 }, { symbol: 'AAPL', price: 1, change: -0.2, volume: 1 }] }] }), 'en').tripleA;
        assert.equal(lock.regime, 'BULL'); assert.equal(lock.isTargetLock, true); assert.equal(lock.checklist.message, 'TARGET LOCKED :: Bull market conditions met');
        // 회전이 RISK_OFF·HIGH 면 BULL → NEUTRAL 로 꺾인다(겉은 강세·속은 약세)
        const override = deriveLocaleParts(makeCore({ score: 60, nq: 0.5, dir: 'RISK_OFF', conv: 'HIGH' }), 'en').tripleA;
        assert.equal(override.regime, 'NEUTRAL');
    });

    await t('파생: 규칙 판정 — 강세/약세/중립 세 갈래와 문구', () => {
        const bull = deriveLocaleParts(makeCore({ score: 60, nq: 0.4, dir: 'RISK_ON' }), 'ko').ruleVerdict;
        assert.equal(bull.status, 'BULLISH'); assert.deepEqual(bull.keyMetrics, ['RLSI 60 (양호)', '순환매: RISK_ON', 'NASDAQ +0.40%']);
        const bear = deriveLocaleParts(makeCore({ score: 40, dir: 'RISK_OFF', conv: 'HIGH' }), 'en').ruleVerdict;
        assert.equal(bear.status, 'BEARISH'); assert.deepEqual(bear.keyMetrics, ['RLSI 40 (Danger)', 'Rotation: RISK_OFF (HIGH)', 'Advance Ratio 38%']);
        const neu = deriveLocaleParts(makeCore({ score: 45, dir: 'NEUTRAL', conv: 'LOW' }), 'ja').ruleVerdict;
        assert.equal(neu.status, 'NEUTRAL'); assert.deepEqual(neu.keyMetrics, ['RLSI 45', 'ローテーション: NEUTRAL (LOW)', 'Breadth 38%']);
    });

    // ═══ B. 응답 출구(overlayCore) — 어느 경로로 온 컨텍스트든 숫자는 같은 코어 ═══════════════════
    await t('출구: 10/7 사고 재현 — 세 언어가 서로 다른 시점의 코어(RLSI 42.7·43.4·46.3 / GEX −26·−10·−16)를 들고 있어도 최신 코어로 맞춘다', () => {
        const stale = {
            ko: ctxOf(makeCore({ at: T0 - 360000, score: 42.7, gex: -26, nq: -0.80 }), 'ko'),
            ja: ctxOf(makeCore({ at: T0 - 120000, score: 43.4, gex: -10, nq: -0.76 }), 'ja'),
            en: ctxOf(makeCore({ at: T0 - 540000, score: 46.3, gex: -16, nq: -0.70 }), 'en'),
        };
        const latest = makeCore({ at: T0, score: 42.2, gex: -9, sq: 47, nq: -0.68 });
        const out = { ko: overlayCore(stale.ko, latest, 'ko'), ja: overlayCore(stale.ja, latest, 'ja'), en: overlayCore(stale.en, latest, 'en') };
        for (const l of ['ko', 'ja', 'en'] as const) {
            assert.equal(out[l].rlsi.score, 42.2, `${l} RLSI`);
            assert.equal(out[l].gammaShield.gexIndex, -9, `${l} GEX`);
            assert.equal(out[l].gammaShield.squeezeRisk, 47, `${l} squeeze`);
            assert.equal(out[l].market.nqChangePercent, -0.68, `${l} 나스닥`);
            assert.equal(out[l].coreAt, latest.timestamp);
            // 숫자가 박힌 파생 문장도 같은 숫자
            assert.equal(out[l].tripleA.checklist.conditions[0].current, '42');
            assert.equal(out[l].tripleA.checklist.conditions[1].current, '-0.68%');
            assert.match(out[l].divergence.verdictDesc, /-0\.68%/);
            assert.match(out[l].divergence.verdictDesc, /RLSI 42/);
            assert.equal(out[l].breadth.breadthPct, 16);
        }
        // 숫자 필드 전체가 세 언어에서 깊은 동일
        assert.deepEqual(JSON.stringify([out.ko.rlsi, out.ko.market, out.ko.sectors, out.ko.gammaShield, out.ko.breadth, out.ko.rotationIntensity, out.ko.rvol]),
            JSON.stringify([out.en.rlsi, out.en.market, out.en.sectors, out.en.gammaShield, out.en.breadth, out.en.rotationIntensity, out.en.rvol]));
        assert.deepEqual(JSON.stringify([out.ko.rlsi, out.ko.gammaShield]), JSON.stringify([out.ja.rlsi, out.ja.gammaShield]));
    });

    await t('출구: AI 글은 언어별로 그대로(문장만 언어별) — 본문·realityInsight·gammaInsight 불변', () => {
        const stale = ctxOf(makeCore({ at: T0 - 300000 }), 'ja');
        const out = overlayCore(stale, makeCore({ at: T0, score: 50 }), 'ja');
        assert.equal(out.verdict.description, 'AI-ja'); assert.equal(out.verdict.realityInsight, 'R-ja'); assert.equal(out.verdict.gammaInsight, 'G-ja');
    });

    await t('출구: 이미 같은(또는 더 새) 코어로 만든 컨텍스트는 되돌리지 않는다 — 같은 객체를 돌려준다', () => {
        const core = makeCore({ at: T0 });
        const ctx = ctxOf(core, 'ko');
        assert.equal(overlayCore(ctx, core, 'ko'), ctx);
        const older = makeCore({ at: T0 - 60000, score: 10 });
        assert.equal(overlayCore(ctx, older, 'ko'), ctx);
        assert.equal(ctx.rlsi.score, 42.7);
    });

    await t('출구: coreAt 이 없는 옛 컨텍스트(워커가 다시 쓴 사본·lastgood)는 항상 코어로 맞춘다', () => {
        const ctx = ctxOf(makeCore({ at: T0 - 540000, score: 46.3 }), 'en');
        delete ctx.coreAt;
        const out = overlayCore(ctx, makeCore({ at: T0, score: 42.2 }), 'en');
        assert.equal(out.rlsi.score, 42.2);
    });

    await t('출구: 판정 제목·감정은 «새 괴리»에 맞춘다(괴리 해소 → TACTICAL INSIGHT·NEUTRAL, 괴리 발생 → DIVERGENCE DETECTED·BEARISH)', () => {
        const divCore = makeCore({ at: T0 - 200000, nq: 0.4, score: 35 });                  // 괴리 A
        const divCtx = ctxOf(divCore, 'ko', { title: 'DIVERGENCE DETECTED', description: 'AI', sentiment: 'BEARISH', realityInsight: 'R', gammaInsight: 'G' });
        const calm = overlayCore(divCtx, makeCore({ at: T0, nq: 0.1, score: 45 }), 'ko');
        assert.equal(calm.verdict.title, 'TACTICAL INSIGHT'); assert.equal(calm.verdict.sentiment, 'NEUTRAL');
        assert.equal(calm.verdict.description, 'AI');
        const calmCtx = ctxOf(makeCore({ at: T0 - 200000, nq: 0.1, score: 45 }), 'en');
        const hot = overlayCore(calmCtx, makeCore({ at: T0, nq: 0.4, score: 35 }), 'en');
        assert.equal(hot.verdict.title, 'DIVERGENCE DETECTED'); assert.equal(hot.verdict.sentiment, 'BEARISH');
        // 비정규장이면 괴리라도 TACTICAL INSIGHT 유지(옛 계산과 같다: isDivergent && session==='REG')
        const post = overlayCore(calmCtx, makeCore({ at: T0, nq: 0.4, score: 35, session: 'POST' }), 'en');
        assert.equal(post.verdict.title, 'TACTICAL INSIGHT');
        // 다른 제목(SYSTEM STABLE 등 — 괴리 경로가 아닌 판정)은 건드리지 않는다
        const stable = ctxOf(makeCore({ at: T0 - 200000 }), 'ko', { title: 'SYSTEM STABLE', description: 'x', sentiment: 'NEUTRAL' });
        assert.equal(overlayCore(stable, makeCore({ at: T0, nq: 0.4, score: 35 }), 'ko').verdict.title, 'SYSTEM STABLE');
    });

    await t('출구: AI 실패 폴백 판정(본문 = 괴리 문장)은 새 숫자의 같은 문장으로 바꾼다', () => {
        const oldCore = makeCore({ at: T0 - 200000, nq: 0.4, score: 35 });
        const ctx = ctxOf(oldCore, 'ko');
        ctx.verdict = { title: ctx.divergence.verdictTitle, description: ctx.divergence.verdictDesc, sentiment: 'BEARISH' };
        const out = overlayCore(ctx, makeCore({ at: T0, nq: 0.45, score: 36 }), 'ko');
        assert.equal(out.verdict.description, out.divergence.verdictDesc);
        assert.match(out.verdict.description, /\+0\.45%/);
        assert.match(out.verdict.description, /RLSI 36/);
    });

    // ═══ C. 코어 저장소(getSharedCore) ═══════════════════════════════════════════════════════
    await t('저장소: 신선한 코어가 Redis 에 있으면 계산하지 않는다(세 언어가 연달아 와도 계산 0회·예약 0회)', async () => {
        const fresh = makeCore({ at: T0 - 10_000 });
        const { deps, state } = makeDeps({ redis: fresh });
        const a = await getSharedCore(deps, { mode: 'swr' }), b = await getSharedCore(deps, { mode: 'fresh' });
        assert.equal(a, fresh); assert.equal(b, fresh); assert.equal(state.computes, 0); assert.equal(state.bgJobs.length, 0);
    });

    await t('저장소: 코어가 없으면(콜드) fresh 는 한 번만 계산 — 동시에 온 세 요청이 한 계산을 같이 기다린다(단일 비행)', async () => {
        const { deps, state } = makeDeps({ compute: async () => { await new Promise((r) => setTimeout(r, 30)); return makeCore({ at: T0 }); } });
        const [x, y, z] = await Promise.all([getSharedCore(deps), getSharedCore(deps), getSharedCore(deps, { mode: 'fresh' })]);
        assert.equal(state.computes, 1);
        assert.equal(x!.timestamp, y!.timestamp); assert.equal(y!.timestamp, z!.timestamp);
        assert.equal(state.writes, 1); assert.equal(state.locksWritten, 1);
        assert.equal(state.redis!.timestamp, x!.timestamp);
    });

    await t('저장소: 낡은 코어(45초 초과) + fresh 모드 = 계산해서 새 코어를 저장한다', async () => {
        const old = makeCore({ at: T0 - CORE_FRESH_MS - 5_000 });
        const { deps, state } = makeDeps({ redis: old });
        const c = await getSharedCore(deps, { mode: 'fresh' });
        assert.equal(state.computes, 1); assert.equal(c!.timestamp, iso(T0)); assert.equal(state.redis!.timestamp, iso(T0));
    });

    await t('저장소: swr — 낡은 코어를 «즉시» 받고(계산 0회) 갱신은 응답 뒤로 예약, 예약된 일을 돌리면 그때 계산·저장·잠금 해제', async () => {
        const old = makeCore({ at: T0 - 90_000 });
        const { deps, state } = makeDeps({ redis: old });
        const c = await getSharedCore(deps, { mode: 'swr' });
        assert.equal(c, old); assert.equal(state.computes, 0); assert.equal(state.bgJobs.length, 1);
        await state.bgJobs[0]();
        assert.equal(state.computes, 1); assert.equal(state.redis!.timestamp, iso(T0)); assert.equal(state.bgLocks, 1); assert.equal(state.bgUnlocks, 1);
        assert.equal((await getSharedCore(deps, { mode: 'swr' }))!.timestamp, iso(T0));        // 다음 요청부터 새 코어
    });

    await t('저장소: swr — 콜드(코어 없음)여도 기다리지 않는다: null 을 즉시 주고 계산은 응답 뒤로(응답 숫자는 스냅샷 그대로)', async () => {
        const { deps, state } = makeDeps({});
        const c = await getSharedCore(deps, { mode: 'swr' });
        assert.equal(c, null); assert.equal(state.computes, 0); assert.equal(state.bgJobs.length, 1);
        await state.bgJobs[0]();
        assert.equal(state.computes, 1); assert.equal(state.writes, 1);
        assert.equal((await getSharedCore(deps, { mode: 'swr' }))!.timestamp, iso(T0));
    });

    await t('저장소: swr — 같은 인스턴스에서 계산이 돌고 있으면 예약을 중복하지 않는다 · 다른 인스턴스가 갱신 중(배경 잠금)이면 일을 하지 않고 끝낸다', async () => {
        let release: (() => void) | null = null;
        const slow = makeDeps({ redis: makeCore({ at: T0 - 90_000 }), compute: () => new Promise((res) => { release = () => res(makeCore({ at: T0 })); }) });
        await getSharedCore(slow.deps, { mode: 'swr' });
        assert.equal(slow.state.bgJobs.length, 1);
        const running = slow.state.bgJobs[0]();                       // 계산 시작(끝나지 않음)
        await new Promise((r) => setTimeout(r, 5));
        await getSharedCore(slow.deps, { mode: 'swr' });             // 계산 중 — 또 예약하지 않는다
        assert.equal(slow.state.bgJobs.length, 1);
        release!(); await running;
        assert.equal(slow.state.computes, 1);
        _resetCoreForTest();
        const locked = makeDeps({ redis: makeCore({ at: T0 - 90_000 }), bgLockOk: false });
        await getSharedCore(locked.deps, { mode: 'swr' });
        await locked.state.bgJobs[0]();
        assert.equal(locked.state.computes, 0);
    });

    await t('저장소: swr — 배경 갱신이 실패하면 20초 쉰다(벤더 장애 중 요청마다 두드리지 않는다) · 가진 코어는 계속 얹는다', async () => {
        let clock = T0;
        const old = makeCore({ at: T0 - 90_000 });
        const { deps, state } = makeDeps({ redis: old, now: () => clock, compute: async () => { throw new Error('vendor down'); } });
        assert.equal(await getSharedCore(deps, { mode: 'swr' }), old);
        await state.bgJobs[0]();                                      // 실패
        assert.ok(state.logs.some((l) => /vendor down/.test(l)));
        clock += 5_000;
        assert.equal(await getSharedCore(deps, { mode: 'swr' }), old);
        assert.equal(state.bgJobs.length, 1);                         // 쉬는 중 — 새 예약 없음
        clock += 20_000;
        await getSharedCore(deps, { mode: 'swr' });
        assert.equal(state.bgJobs.length, 2);                         // 쉬는 시간이 지나면 다시
    });

    await t('저장소: swr — 15분을 넘게 낡은 코어는 «없는 것»(낡은 숫자를 라이브처럼 얹지 않는다) · 갱신은 예약', async () => {
        const { deps, state } = makeDeps({ redis: makeCore({ at: T0 - CORE_MAX_STALE_MS - 1_000 }) });
        assert.equal(await getSharedCore(deps, { mode: 'swr' }), null);
        assert.equal(state.bgJobs.length, 1); assert.equal(state.computes, 0);
    });

    await t('저장소: swr 인데 배경 예약을 못 하는 환경(스크립트)이면 직접 계산하지 않고 가진 것만 준다 — 요청을 붙잡지 않는다', async () => {
        const old = makeCore({ at: T0 - 90_000 });
        const { deps, state } = makeDeps({ redis: old, background: false });
        assert.equal(await getSharedCore(deps, { mode: 'swr' }), old);
        assert.equal(state.computes, 0);
    });

    await t('저장소: 다른 인스턴스가 20초 안에 계산을 시작했으면(잠금) fresh 도 또 계산하지 않고 가진 코어를 준다 — 모든 언어에 같은 코어', async () => {
        const old = makeCore({ at: T0 - 100_000 });
        const { deps, state } = makeDeps({ redis: old, lockAt: T0 - 5_000, background: false });
        const a = await getSharedCore(deps, { mode: 'fresh' }), b = await getSharedCore(deps, { mode: 'swr' });
        assert.equal(a, old); assert.equal(b, old); assert.equal(state.computes, 0);
        // 잠금이 20초를 넘으면 계산한다
        _resetCoreForTest();
        const { deps: d2, state: s2 } = makeDeps({ redis: old, lockAt: T0 - CORE_LOCK_MS - 1_000, background: false });
        await getSharedCore(d2, { mode: 'fresh' });
        assert.equal(s2.computes, 1);
    });

    await t('저장소: 세션이 바뀌면(REG → POST) 낡은 것으로 보고 계산한다 — 단 잠금 중이면 가진 것을 준다', async () => {
        const reg = makeCore({ at: T0 - 5_000, session: 'REG' });
        const { deps, state } = makeDeps({ redis: reg, session: 'POST', background: false, compute: async () => makeCore({ at: T0, session: 'POST' }) });
        const c = await getSharedCore(deps, { mode: 'fresh' });
        assert.equal(state.computes, 1); assert.equal(c!.session, 'POST');
        _resetCoreForTest();
        const { deps: d2, state: s2 } = makeDeps({ redis: reg, session: 'POST', lockAt: T0 - 2_000, background: false });
        assert.equal(await getSharedCore(d2, { mode: 'fresh' }), reg); assert.equal(s2.computes, 0);
    });

    await t('저장소: 장외(CLOSED)는 120초까지 신선 — 벤더 호출을 줄인다', async () => {
        const closed = makeCore({ at: T0 - 100_000, session: 'CLOSED' });
        const { deps, state } = makeDeps({ redis: closed, session: 'CLOSED' });
        assert.equal(await getSharedCore(deps, { mode: 'fresh' }), closed); assert.equal(state.computes, 0);
        assert.ok(CORE_FRESH_CLOSED_MS > CORE_FRESH_MS);
        _resetCoreForTest();
        const { deps: d2, state: s2 } = makeDeps({ redis: makeCore({ at: T0 - CORE_FRESH_CLOSED_MS - 1000, session: 'CLOSED' }), session: 'CLOSED', background: false });
        await getSharedCore(d2, { mode: 'fresh' });
        assert.equal(s2.computes, 1);
    });

    await t('저장소: fresh — 계산이 실패해도 쓸 만한(15분 안) 사본이 있으면 그것을, 15분 넘게 낡았거나 없으면 던진다', async () => {
        const old = makeCore({ at: T0 - 100_000 });
        const boom = async () => { throw new Error('vendor down'); };
        const { deps, state } = makeDeps({ redis: old, compute: boom, background: false });
        assert.equal(await getSharedCore(deps, { mode: 'fresh' }), old);
        assert.ok(state.logs.some((l) => /vendor down/.test(l)));
        _resetCoreForTest();
        const ancient = makeDeps({ redis: makeCore({ at: T0 - CORE_MAX_STALE_MS - 5_000 }), compute: boom });
        await assert.rejects(() => getSharedCore(ancient.deps, { mode: 'fresh' }), /vendor down/);
        _resetCoreForTest();
        const none = makeDeps({ compute: boom });
        await assert.rejects(() => getSharedCore(none.deps, { mode: 'fresh' }), /vendor down/);
    });

    await t('저장소: 섹터가 빈 반쪽 코어는 캐시·기억하지 않는다(MAP FLAP FIX) — 쓸 사본이 있으면 그것을', async () => {
        const half = makeCore({ at: T0, sectors: [] });
        assert.equal(isUsableCore(half), false);
        const good = makeCore({ at: T0 - 100_000 });
        const { deps, state } = makeDeps({ redis: good, compute: async () => half, background: false });
        const c = await getSharedCore(deps, { mode: 'fresh' });
        assert.equal(c, good); assert.equal(state.writes, 0);
        // 사본이 없으면 fresh 는 한 번만 그대로(옛 «serving once only»)
        _resetCoreForTest();
        const { deps: d2, state: s2 } = makeDeps({ compute: async () => half });
        assert.equal(await getSharedCore(d2, { mode: 'fresh' }), half); assert.equal(s2.writes, 0);
        // 배경 갱신이 반쪽 코어를 받으면 실패로 보고 쉰다
        _resetCoreForTest();
        const bg = makeDeps({ compute: async () => half });
        await getSharedCore(bg.deps, { mode: 'swr' });
        await bg.state.bgJobs[0]();
        assert.equal(bg.state.writes, 0);
        await getSharedCore(bg.deps, { mode: 'swr' });
        assert.equal(bg.state.bgJobs.length, 1);
    });

    await t('저장소: Redis 가 죽어도 이 인스턴스의 기억으로 버틴다(1.5초 안은 Redis 를 다시 치지 않고, 45초 안은 기억을 신선으로)', async () => {
        let clock = T0;
        const { deps, state } = makeDeps({ redisFails: true, now: () => clock, compute: async () => makeCore({ at: clock }) });
        const a = await getSharedCore(deps, { mode: 'fresh' });
        assert.equal(state.computes, 1);
        clock += 1_000;
        const b = await getSharedCore(deps, { mode: 'fresh' });
        assert.equal(b, a); assert.equal(state.computes, 1);
        clock += 20_000;                                   // Redis 는 계속 죽어 있고 기억은 45초 안 — 재계산 폭주 없이 기억을 쓴다
        const c = await getSharedCore(deps, { mode: 'swr' });
        assert.equal(c, a); assert.equal(state.computes, 1);
    });

    await t('저장소: force 는 신선해도 새로 계산한다(디버그·크론 harvest-history)', async () => {
        const { deps, state } = makeDeps({ redis: makeCore({ at: T0 - 1_000 }) });
        const c = await getSharedCore(deps, { force: true });
        assert.equal(state.computes, 1); assert.equal(c!.timestamp, iso(T0));
    });

    await t('저장소: 새 코어의 Redis TTL — 정규장 120초 · 그 밖 600초', async () => {
        const ttls: number[] = [];
        const { deps } = makeDeps({ compute: async () => makeCore({ at: T0, session: 'REG' }) });
        deps.write = async (_c, ttl) => { ttls.push(ttl); };
        await getSharedCore(deps, { force: true });
        _resetCoreForTest();
        const { deps: d2 } = makeDeps({ session: 'CLOSED', compute: async () => makeCore({ at: T0, session: 'CLOSED' }) });
        d2.write = async (_c, ttl) => { ttls.push(ttl); };
        await getSharedCore(d2, { force: true });
        assert.deepEqual(ttls, [120, 600]);
    });

    // ═══ C2. prefer 모드 — 계산 경로가 코어를 «혼자» 밀지 않는다 ═══════════════════════════════════
    await t('prefer: 같은 세션의 낡은 코어가 있으면 그것을 쓰고(계산 0회) 갱신은 응답 뒤로 — 계산 경로가 코어를 앞으로 밀지 않는다', async () => {
        const old = makeCore({ at: T0 - 70_000 });
        const { deps, state } = makeDeps({ redis: old });
        const c = await getSharedCore(deps, { mode: 'prefer' });
        assert.equal(c, old); assert.equal(state.computes, 0); assert.equal(state.bgJobs.length, 1);
        await state.bgJobs[0]();
        assert.equal(state.computes, 1); assert.equal(state.redis!.timestamp, iso(T0));
    });

    await t('prefer: 코어가 없거나·15분 넘게 낡았거나·세션이 바뀌었거나·force 면 fresh 처럼 계산한다', async () => {
        const cold = makeDeps({});
        assert.equal((await getSharedCore(cold.deps, { mode: 'prefer' }))!.timestamp, iso(T0)); assert.equal(cold.state.computes, 1);
        _resetCoreForTest();
        const ancient = makeDeps({ redis: makeCore({ at: T0 - CORE_MAX_STALE_MS - 1000 }) });
        await getSharedCore(ancient.deps, { mode: 'prefer' }); assert.equal(ancient.state.computes, 1);
        _resetCoreForTest();
        const sess = makeDeps({ redis: makeCore({ at: T0 - 70_000, session: 'REG' }), session: 'POST', background: false, compute: async () => makeCore({ at: T0, session: 'POST' }) });
        assert.equal((await getSharedCore(sess.deps, { mode: 'prefer' }))!.session, 'POST'); assert.equal(sess.state.computes, 1);
        _resetCoreForTest();
        const forced = makeDeps({ redis: makeCore({ at: T0 - 70_000 }) });
        await getSharedCore(forced.deps, { mode: 'prefer', force: true }); assert.equal(forced.state.computes, 1);
    });

    await t('prefer: 신선하면 그대로(계산·예약 0회)', async () => {
        const fresh = makeCore({ at: T0 - 10_000 });
        const { deps, state } = makeDeps({ redis: fresh });
        assert.equal(await getSharedCore(deps, { mode: 'prefer' }), fresh); assert.equal(state.computes, 0); assert.equal(state.bgJobs.length, 0);
    });

    await t('불일치 재현(운영 12회 중 1회): 한 언어의 스냅샷 재계산이 «혼자» 코어를 밀면 같은 순간 세 언어가 갈린다 — prefer 로는 세 언어가 같은 코어', async () => {
        const old = makeCore({ at: T0 - 70_000, score: 40.8, nq: -0.407 });
        const slowNew = async () => { await new Promise((r) => setTimeout(r, 25)); return makeCore({ at: T0, score: 40.8, nq: -0.415 }); };
        // (옛 동작) 계산 경로 = fresh: 같은 순간 ko 는 새 코어를 받고, 출구(swr)로 온 ja·en 은 옛 코어를 받는다
        const a = makeDeps({ redis: old, background: false, compute: slowNew });
        const [koOld, jaOld, enOld] = await Promise.all([getSharedCore(a.deps, { mode: 'fresh' }), getSharedCore(a.deps, { mode: 'swr' }), getSharedCore(a.deps, { mode: 'swr' })]);
        assert.deepEqual([koOld!.market.nqChangePercent, jaOld!.market.nqChangePercent, enOld!.market.nqChangePercent], [-0.415, -0.407, -0.407]);   // 갈렸다(재현)
        // (지금) 계산 경로 = prefer: 같은 순간 세 언어가 같은 (옛) 코어 — 갱신이 끝난 뒤엔 셋 다 새 코어
        _resetCoreForTest();
        const b = makeDeps({ redis: old, compute: slowNew });
        const [ko, ja, en] = await Promise.all([getSharedCore(b.deps, { mode: 'prefer' }), getSharedCore(b.deps, { mode: 'swr' }), getSharedCore(b.deps, { mode: 'swr' })]);
        assert.deepEqual([ko!.market.nqChangePercent, ja!.market.nqChangePercent, en!.market.nqChangePercent], [-0.407, -0.407, -0.407]);
        assert.equal(b.state.computes, 0); assert.equal(b.state.bgJobs.length, 1);
        await b.state.bgJobs[0]();                                                                        // 응답 뒤 갱신이 끝났다
        const after = await Promise.all([getSharedCore(b.deps, { mode: 'prefer' }), getSharedCore(b.deps, { mode: 'swr' }), getSharedCore(b.deps, { mode: 'swr' })]);
        assert.deepEqual(after.map((c) => c!.market.nqChangePercent), [-0.415, -0.415, -0.415]);
    });

    await t('갱신 예약: 같은 인스턴스에서 동시에 온 요청은 한 번만 예약 · 예약한 일이 끝나지 못했어도 60초 뒤엔 다시 예약한다(함수가 먼저 멈춘 경우)', async () => {
        let clock = T0;
        const { deps, state } = makeDeps({ redis: makeCore({ at: T0 - 70_000 }), now: () => clock });
        await Promise.all([getSharedCore(deps, { mode: 'swr' }), getSharedCore(deps, { mode: 'swr' }), getSharedCore(deps, { mode: 'prefer' })]);
        assert.equal(state.bgJobs.length, 1);
        clock += 30_000; await getSharedCore(deps, { mode: 'swr' });          // 예약한 일이 아직 안 돌았다(30초) — 중복 예약 없음
        assert.equal(state.bgJobs.length, 1);
        clock += 31_000; await getSharedCore(deps, { mode: 'swr' });          // 60초 넘음 — 잊고 다시 예약
        assert.equal(state.bgJobs.length, 2);
    });

    // ═══ D. 종단 — 세 언어가 같은 시각에 요청해도 숫자가 같다 ═══════════════════════════════════
    await t('종단: 코어 한 개 + 언어별 스냅샷 세 개(서로 다른 시점) → 같은 시각 세 응답의 숫자가 전부 같다', async () => {
        const fresh = makeCore({ at: T0 - 8_000, score: 42.2, gex: -9, nq: -0.68 });
        const { deps } = makeDeps({ redis: fresh });
        const snapshots = {
            ko: ctxOf(makeCore({ at: T0 - 30_000, score: 42.7, gex: -26 }), 'ko'),
            ja: ctxOf(makeCore({ at: T0 - 540_000, score: 43.4, gex: -10 }), 'ja'),     // 9분 묵은 lastgood
            en: ctxOf(makeCore({ at: T0 - 360_000, score: 46.3, gex: -16 }), 'en'),     // 워커가 도장만 새로 찍은 6분 묵은 스냅샷
        };
        const res = await Promise.all((['ko', 'ja', 'en'] as const).map(async (l) => overlayCore(snapshots[l], (await getSharedCore(deps, { mode: 'swr' }))!, l)));
        assert.deepEqual(res.map((r) => r.rlsi.score), [42.2, 42.2, 42.2]);
        assert.deepEqual(res.map((r) => r.gammaShield.gexIndex), [-9, -9, -9]);
        assert.deepEqual(res.map((r) => r.market.nqChangePercent), [-0.68, -0.68, -0.68]);
        assert.deepEqual(res.map((r) => r.coreAt), [fresh.timestamp, fresh.timestamp, fresh.timestamp]);
        assert.equal(new Set(res.map((r) => r.tripleA.checklist.conditions.map((c) => c.current).join('|'))).size, 1);
    });

    console.log(`\n${n} passed`);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
