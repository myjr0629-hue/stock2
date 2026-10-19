/**
 * 묶음 2 «세션 판정 통일» 최소 범위 — 기존(기준 커밋 adf81d2c4) ↔ 신규 동등 시험.
 * 실행: NODE_PATH=$PWD/node_modules node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/sessionMin.test.ts
 *
 * 네트워크·Redis·.env 없음. 기존 구현은 git 기준 커밋에서 «원문 그대로» 꺼내 vm 에서 돌린다(복사본 아님).
 *   ① 평일 정상 거래일(조기 폐장·휴장 아님)·주말: 모든 판정 함수가 하루 1,440분 전부 기존과 완전히 같다.
 *   ② 휴장·조기 폐장: 달력대로 바뀐다 — 경계 시각을 하나씩 못 박는다.
 *   ③ marketStatusProvider: 어댑터(getMarketStatusIntrinio) → 제공자 연쇄 전체를 기존·신규로 돌려 market·session 이 서로 맞는지.
 *   ④ 원천 상태가 60초 캐시에 남은 채 경계를 넘을 때 — 평일은 기존과 같고, 조기 폐장 13:00 이후만 extended-hours.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const BASE = 'adf81d2c4';
const root = path.resolve(__dirname, '..');

// ── 시계 고정 ─────────────────────────────────────────────────────────────
const RealDate = Date;
let NOW = 0;
class FakeDate extends RealDate {
    constructor(...a: any[]) { if (a.length === 0) super(NOW); else super(...(a as [any])); }
    static now() { return NOW; }
}
(globalThis as any).Date = FakeDate;

// 신규 모듈은 Date 를 바꾼 뒤 불러온다(호출 시점에 전역 Date 를 본다)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cal = require('../src/lib/marketCalendar') as typeof import('../src/lib/marketCalendar');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ms = require('../src/lib/marketSession') as typeof import('../src/lib/marketSession');

const baseSrc = (rel: string) => execFileSync('git', ['show', `${BASE}:${rel}`], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
const headSrc = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

/** 소스에서 `function name(` 선언 하나를 중괄호 짝으로 잘라낸다 */
function extractFn(src: string, name: string): string {
    const re = new RegExp(`(export\\s+)?function\\s+${name}\\s*\\(`);
    const m = re.exec(src);
    if (!m) throw new Error(`function ${name} not found`);
    let i = src.indexOf('{', src.indexOf(')', m.index));
    // 반환 타입 주석 안의 중괄호({ … })를 건너뛰기 위해 «) :» 뒤 첫 «{»가 본문이 아닐 수 있다 → 본문은 줄 끝 «{»
    const sig = src.slice(m.index, i);
    if (/\)\s*:\s*$/.test(sig)) i = src.indexOf('{', src.indexOf('}', i) + 1);
    let depth = 0, j = i;
    for (; j < src.length; j++) {
        const ch = src[j];
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) break; }
    }
    return src.slice(m.index, j + 1).replace(/^export\s+/, '');
}

function compileFn<T>(src: string, name: string, deps: Record<string, unknown>): T {
    const code = ts.transpileModule(`${extractFn(src, name)}\nmodule.exports = ${name};`, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const module = { exports: {} as any };
    vm.runInNewContext(code, { module, exports: module.exports, Date: FakeDate, Intl, ...deps });
    return module.exports as T;
}

/** 모듈 하나를 vm 에서 통째로 — require 는 주어진 것만 */
function loadModule(src: string, requires: Record<string, unknown>): any {
    const code = ts.transpileModule(src, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    const module = { exports: {} as any };
    vm.runInNewContext(code, {
        module, exports: module.exports, Date: FakeDate, Intl,
        console: { log() {}, warn() {}, error() {} },
        require(id: string) {
            if (Object.prototype.hasOwnProperty.call(requires, id)) return requires[id];
            throw new Error(`Unexpected dependency: ${id}`);
        },
    });
    return module.exports;
}

// ── 기존(기준 커밋) 구현 ─────────────────────────────────────────────────────
const B = {
    session: baseSrc('src/lib/marketSession.ts'),
    calendar: baseSrc('src/lib/marketCalendar.ts'),
    intrinio: baseSrc('src/services/intrinioClient.ts'),
    liveQuote: baseSrc('src/utils/liveQuote.ts'),
    rlsi: baseSrc('src/services/guardian/rlsiEngine.ts'),
    guardian: baseSrc('src/services/guardian/marketSessionUtils.ts'),
    useMS: baseSrc('src/hooks/useMarketStatus.ts'),
    provider: baseSrc('src/services/marketStatusProvider.ts'),
};
const H = {
    intrinio: headSrc('src/services/intrinioClient.ts'),
    liveQuote: headSrc('src/utils/liveQuote.ts'),
    rlsi: headSrc('src/services/guardian/rlsiEngine.ts'),
    guardian: headSrc('src/services/guardian/marketSessionUtils.ts'),
    useMS: headSrc('src/hooks/useMarketStatus.ts'),
    provider: headSrc('src/services/marketStatusProvider.ts'),
};

// 기준 커밋의 marketCalendar 휴장표가 지금과 같은지(같아야 «달력 위임»이 평일 동등의 전제가 된다)
{
    const oldCal = loadModule(B.calendar, {});
    assert.deepEqual([...oldCal.US_MARKET_HOLIDAYS].sort(), [...cal.US_MARKET_HOLIDAYS].sort());
    assert.deepEqual([...oldCal.EARLY_CLOSE_DATES].sort(), [...cal.EARLY_CLOSE_DATES].sort());
}

const old = {
    cashPhase: compileFn<(c: any) => string>(B.session, 'cashPhase', {
        isTradingDate: ms.isTradingDate, REG_OPEN_MIN: 570, REG_CLOSE_MIN: 960,
    }),
    lastClosed: compileFn<(t: number) => string>(B.session, 'lastClosedSessionDate', {
        etClock: ms.etClock, isTradingDate: ms.isTradingDate, REG_CLOSE_MIN: 960,
        prevTradingDate: compileFn(B.session, 'prevTradingDate', { shiftDate: ms.shiftDate, isTradingDate: ms.isTradingDate }),
    }),
    prevTradingDate: compileFn<(d: string) => string>(B.session, 'prevTradingDate', { shiftDate: ms.shiftDate, isTradingDate: ms.isTradingDate }),
    etLastClosed: compileFn<(t: number) => string>(B.calendar, 'etLastClosedSessionDate', {
        etDateOf: cal.etDateOf, etMinutesOf: cal.etMinutesOf, isNonTradingDay: cal.isNonTradingDay, shiftDay: ms.shiftDate,
    }),
    adapter: compileFn<() => any>(B.intrinio, 'getMarketStatusIntrinio', { US_MARKET_HOLIDAYS: cal.US_MARKET_HOLIDAYS }),
    isRegularEt: compileFn<() => boolean>(B.intrinio, 'isRegularSessionEt', {}),
    clockSession: compileFn<(t: number) => string>(B.liveQuote, 'clockSession', {
        isNonTradingDay: cal.isNonTradingDay, etDateOf: cal.etDateOf, etMinutesOf: cal.etMinutesOf,
    }),
    rlsi: compileFn<() => string>(B.rlsi, 'getMarketSession', {}),
    guardian: compileFn<() => string>(B.guardian, 'getClientETSession', {}),
    initial: compileFn<() => any>(B.useMS, 'computeInitialSession', {}),
};
const neu = {
    cashPhase: ms.cashPhase,
    lastClosed: ms.lastClosedSessionDate,
    prevTradingDate: ms.prevTradingDate,
    etLastClosed: cal.etLastClosedSessionDate,
    adapter: compileFn<() => any>(H.intrinio, 'getMarketStatusIntrinio', {
        US_MARKET_HOLIDAYS: cal.US_MARKET_HOLIDAYS, usEquitySessionForEt: cal.usEquitySessionForEt,
    }),
    isRegularEt: compileFn<() => boolean>(H.intrinio, 'isRegularSessionEt', { usEquitySessionAt: cal.usEquitySessionAt }),
    clockSession: compileFn<(t: number) => string>(H.liveQuote, 'clockSession', { usEquitySessionAt: cal.usEquitySessionAt }),
    rlsi: compileFn<() => string>(H.rlsi, 'getMarketSession', { usEquitySessionAt: cal.usEquitySessionAt }),
    guardian: compileFn<() => string>(H.guardian, 'getClientETSession', { etClock: ms.etClock, usEquitySessionForEt: cal.usEquitySessionForEt }),
    initial: compileFn<() => any>(H.useMS, 'computeInitialSession', {
        etClock: ms.etClock, usEquitySessionForEt: cal.usEquitySessionForEt, REG_CLOSE_MIN: ms.REG_CLOSE_MIN,
    }),
};

// 제공자: 어댑터 → getMarketStatusSSOT 연쇄. 실패 모드(어댑터 예외)는 FALLBACK 경로.
function providerOf(src: string, adapter: () => any, isNew: boolean) {
    let fail = false;
    let stale: any = null; // massiveClient 60초 캐시에 남은 원천 상태를 흉내 낸다
    const massive = {
        CACHE_POLICY: { LIVE: 'LIVE' },
        fetchMassive: async (p: string) => {
            if (fail) throw new Error('offline');
            if (p === '/v1/marketstatus/now') return stale ?? adapter();
            if (p === '/v1/marketstatus/upcoming') return [];
            throw new Error(`unexpected ${p}`);
        },
    };
    const req: Record<string, unknown> = { './massiveClient': massive };
    if (isNew) { req['@/lib/marketCalendar'] = cal; req['@/lib/marketSession'] = ms; }
    let mod = loadModule(src, req);
    return {
        get: (f: boolean) => { fail = f; return mod.getMarketStatusSSOT(); },
        /** 15초 메모리 캐시를 비운다(모듈을 새로 띄운다) — 시각을 거꾸로 돌릴 때 */
        fresh: () => { mod = loadModule(src, req); },
        setStale: (v: any) => { stale = v; },
    };
}
const oldProv = providerOf(B.provider, old.adapter, false);
const newProv = providerOf(H.provider, neu.adapter, true);
// 캐시(15초)를 피하려고 매 호출 시각이 1분씩 전진한다 — 같은 시각을 두 번 묻지 않는다.

const pick = (r: any) => ({
    market: r.market, session: r.session, isHoliday: r.isHoliday, holidayName: r.holidayName,
    isHolidaySession: r.isHolidaySession, holidaySessionName: r.holidaySessionName, asOfET: r.asOfET, source: r.source,
});

async function snapshot(t: number, which: 'old' | 'new', fail: boolean) {
    NOW = t;
    const f = which === 'old' ? old : neu;
    const c = ms.etClock(t);
    const a = f.adapter();
    const init = f.initial();
    return {
        cashPhase: f.cashPhase(c),
        lastClosed: f.lastClosed(t),
        etLastClosed: f.etLastClosed(t),
        prevTradingDate: f.prevTradingDate(c.date),
        adapterMarket: a.market, adapterExch: JSON.stringify(a.exchanges),
        isRegularEt: f.isRegularEt(),
        clockSession: f.clockSession(t),
        rlsi: f.rlsi(),
        guardian: f.guardian(),
        initial: `${init.market}/${init.session}/${init.isHoliday}/${init.isHolidaySession}`,
        provider: JSON.stringify(pick(await (which === 'old' ? oldProv : newProv).get(fail))),
    };
}

let checks = 0;
const ok = (name: string, cond: boolean, detail = '') => { checks++; assert.ok(cond, `${name} ${detail}`); };

async function main() {
    // ① 평일 정상 거래일 + 주말 — 1,440분 × 판정 11종 × 제공자(정상·FALLBACK) 완전 동등
    const NORMAL = [
        '2026-03-09', // DST 시작 다음 월요일
        '2026-10-19', '2026-10-20', '2026-10-23', // 월·화·금
        '2026-11-02', // DST 끝 다음 월요일
        '2026-11-25', // 추수감사절 전날(정상 마감)
        '2026-12-31', '2027-07-02', // 휴장 전 금요일 정상 마감
        '2026-10-24', '2026-10-25', // 토·일
    ];
    let minutes = 0;
    for (const d of NORMAL) {
        const start = ms.etWallTimeToMs(d, 0);
        // 날짜를 바꿀 때 시계가 거꾸로 갈 수 있다 → 15초 메모리 캐시를 비운다(관문 10191642 P2)
        oldProv.fresh(); newProv.fresh();
        for (let i = 0; i < 1440; i++) {
            const t = start + i * 60_000;
            // FALLBACK 을 먼저 묻는다 — 정상 호출이 먼저 캐시를 채우면 같은 시각의 FALLBACK 이 캐시를 받는다(관문 10191642 P2).
            //   FALLBACK 은 캐시를 쓰지 않고, 1분 뒤엔 15초 캐시가 늘 만료돼 있다 → 두 경로 모두 매분 실제로 돈다(source 로 확인).
            for (const fail of [true, false]) {
                const o = await snapshot(t, 'old', fail);
                const n = await snapshot(t, 'new', fail);
                const src = JSON.parse(n.provider).source;
                ok(`${d} ${i} path fail=${fail}`, src === (fail ? 'FALLBACK' : 'INTRINIO') && JSON.parse(o.provider).source === src, src);
                for (const k of Object.keys(o) as (keyof typeof o)[]) {
                    ok(`${d} ${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')} ${k} fail=${fail}`, o[k] === n[k], `old=${o[k]} new=${n[k]}`);
                }
            }
            minutes++;
        }
    }
    console.log(`  ✓ 평일 정상·주말 ${NORMAL.length}일 × 1,440분 = ${minutes}분: 판정 11종 + 제공자(정상 INTRINIO·FALLBACK 경로 각각 실행 확인) 기존과 완전 동등`);

    // 지정 경계(평일) — 값 자체도 못 박는다
    const at = (d: string, hhmm: string) => ms.etWallTimeToMs(d, +hhmm.slice(0, 2) * 60 + +hhmm.slice(3));
    const P = async (d: string, hhmm: string, fail = false) => { NOW = at(d, hhmm); newProv.fresh(); return pick(await newProv.get(fail)); };
    const exp: [string, string, string, string][] = [
        // 날짜, 시각, session, market
        ['2026-10-20', '03:59', 'closed', 'closed'],
        ['2026-10-20', '04:00', 'pre', 'extended-hours'],
        ['2026-10-20', '09:29', 'pre', 'extended-hours'],
        ['2026-10-20', '09:30', 'regular', 'open'],
        ['2026-10-20', '15:59', 'regular', 'open'],
        ['2026-10-20', '16:00', 'post', 'extended-hours'],
        ['2026-10-20', '19:59', 'post', 'extended-hours'],
        ['2026-10-20', '20:00', 'closed', 'closed'],
        ['2026-10-20', '00:00', 'closed', 'closed'],
        ['2026-10-21', '00:00', 'closed', 'closed'],
        // 조기 폐장(11/27 금, 12/24 목)
        ['2026-11-27', '09:30', 'regular', 'open'],
        ['2026-11-27', '12:59', 'regular', 'open'],
        ['2026-11-27', '13:00', 'post', 'extended-hours'],
        ['2026-11-27', '13:30', 'post', 'extended-hours'],
        ['2026-11-27', '16:59', 'post', 'extended-hours'],
        ['2026-11-27', '19:59', 'post', 'extended-hours'],
        ['2026-11-27', '20:00', 'closed', 'closed'],
        ['2026-12-24', '13:00', 'post', 'extended-hours'],
        // 주말
        ['2026-10-24', '10:00', 'closed', 'closed'],
        ['2026-10-25', '18:30', 'closed', 'closed'],
        // 월요일 휴장(노동절 9/7) → 화요일 PRE
        ['2026-09-07', '04:00', 'closed', 'closed'],
        ['2026-09-07', '10:00', 'closed', 'closed'],
        ['2026-09-08', '04:00', 'pre', 'extended-hours'],
        ['2026-09-08', '09:29', 'pre', 'extended-hours'],
        ['2026-09-08', '09:30', 'regular', 'open'],
        // 2027 — 연도 없는 옛 휴장표가 틀리던 날
        ['2027-01-18', '10:00', 'closed', 'closed'],
        ['2027-01-19', '10:00', 'regular', 'open'],
    ];
    for (const [d, hhmm, s, m] of exp) {
        for (const fail of [false, true]) {
            const r = await P(d, hhmm, fail);
            ok(`provider ${d} ${hhmm} fail=${fail}`, r.session === s && r.market === m, JSON.stringify(r));
        }
        NOW = at(d, hhmm);
        const live = cal.usEquitySessionAt(NOW);
        ok(`calendar ${d} ${hhmm}`, live === s, live);
        ok(`clockSession ${d} ${hhmm}`, neu.clockSession(NOW) === (s === 'regular' ? 'reg' : s));
        ok(`rlsi ${d} ${hhmm}`, neu.rlsi() === ({ pre: 'PRE', regular: 'REG', post: 'POST', closed: 'CLOSED' } as any)[s]);
        ok(`guardian ${d} ${hhmm}`, neu.guardian() === neu.rlsi());
        ok(`isRegularEt ${d} ${hhmm}`, neu.isRegularEt() === (s === 'regular'));
        ok(`adapter ${d} ${hhmm}`, neu.adapter().market === m, neu.adapter().market);
    }
    console.log(`  ✓ 경계 ${exp.length}개(09:29/09:30/15:59/16:00/19:59/20:00/자정·조기 폐장 12:59/13:00/16:59·주말·휴장 다음 화요일 PRE·2027 MLK): 제공자·어댑터·판정 6종 일치`);

    // ② 조기 폐장 13:00 이후 — market 과 session 이 갈리지 않는다(시간외 가격이 정규장 가격으로 가던 경로)
    for (const d of ['2026-11-27', '2026-12-24', '2027-11-26']) {
        const start = ms.etWallTimeToMs(d, 0);
        newProv.fresh();
        for (let i = 0; i < 1440; i++) {
            NOW = start + i * 60_000;
            for (const fail of [true, false]) {
                const r = await newProv.get(fail);
                ok(`early ${d} ${i} path`, r.source === (fail ? 'FALLBACK' : 'INTRINIO'), r.source);
                const want = r.session === 'regular' ? 'open' : r.session === 'closed' ? 'closed' : 'extended-hours';
                ok(`early ${d} ${i} market↔session`, r.market === want, JSON.stringify(pick(r)));
                ok(`early ${d} ${i} 13:00`, (i >= 780 && i < 1200) === (r.session === 'post'));
            }
            // 첫 추정(useMarketStatus) — 13:00~16:00 은 open 이 아니다(그 구간에서 open 이면 시간외 체결이 정규장 가격으로 간다)
            const init = neu.initial();
            if (i >= 780 && i < 960) ok(`initial ${d} ${i}`, init.market === 'extended-hours' && init.session === 'post', JSON.stringify(init));
        }
    }
    // 기존은 같은 구간을 정규장으로 판정했다(수리 대상이 실제로 있었다는 증거)
    NOW = at('2026-11-27', '13:30');
    oldProv.fresh();
    const oldEarly = pick(await oldProv.get(false));
    ok('기존 조기 폐장 13:30 = regular/open (결함 재현)', oldEarly.session === 'regular' && oldEarly.market === 'open', JSON.stringify(oldEarly));
    console.log('  ✓ 조기 폐장 3일 × 1,440분: 13:00~20:00 POST · market↔session 일치 (기존 13:30 regular/open 재현)');

    // cashPhase 조기 폐장 · 완료일 규칙(16:00 유지)
    ok('cashPhase 11/27 12:59', ms.cashPhase(ms.etClock(at('2026-11-27', '12:59'))) === 'regular');
    ok('cashPhase 11/27 13:00', ms.cashPhase(ms.etClock(at('2026-11-27', '13:00'))) === 'after-close');
    // 완료일(16:00 규칙)은 기존 그대로 — WIM·SEO 등 16:00 을 따로 든 호출자와 엇갈리지 않게(관문 10191732 P2)
    ok('lastClosed 11/27 13:30 (16:00 규칙 유지)', ms.lastClosedSessionDate(at('2026-11-27', '13:30')) === '2026-11-25');
    ok('etLastClosed 11/27 13:30 (16:00 규칙 유지)', cal.etLastClosedSessionDate(at('2026-11-27', '13:30')) === '2026-11-25');
    ok('lastClosed 11/27 16:00', ms.lastClosedSessionDate(at('2026-11-27', '16:00')) === '2026-11-27');
    ok('lastClosed 11/27 16:00', ms.lastClosedSessionDate(at('2026-11-27', '16:00')) === '2026-11-27');
    ok('lastClosed 9/8 04:00 (휴장 다음 화요일)', ms.lastClosedSessionDate(at('2026-09-08', '04:00')) === '2026-09-04');

    // 관문 10191642 P1 — 11/27 13:30 벌크 보정(live/quotes)이 전 거래일(11/25) EOD 종가로 오늘 값을 덮지 않는다
    {
        //   live/quotes 는 벌크 보정 완료일로 marketCalendar.etLastCompletedSessionDate(조기 폐장 반영 — sessionArchive.lastCompletedSessionDate 와 같은 규칙)를 쓴다.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { correctBulkSnapshot } = require('../src/lib/bulkQuoteClose');
        const route = headSrc('src/app/api/live/quotes/route.ts');
        ok('route 벌크 보정 = etLastCompletedSessionDate', /const lastClosed = etLastCompletedSessionDate\(Date\.now\(\)\);\s*\n\s*results = results\.map\(\(r\) => \(r\.snapshot && r\.snapshot\._eodDate \? \{ \.\.\.r, snapshot: correctBulkSnapshot\(r\.snapshot, lastClosed\)/.test(route));
        const lastCompleted = cal.etLastCompletedSessionDate;
        const archiveCompleted = compileFn<(t: number) => string>(headSrc('src/lib/sessionArchive.ts'), 'lastCompletedSessionDate', {
            etDateOf: cal.etDateOf, etMinutesOf: cal.etMinutesOf, isNonTradingDay: cal.isNonTradingDay,
            sessionCloseMinutes: cal.sessionCloseMinutes, prevTradingDate: cal.prevTradingDate,
        });
        const snap = { day: { c: 110 }, prevDay: { c: 100 }, _eodDate: '2026-11-25', _eodClose: 100, _eodChg: 5 };
        const out = correctBulkSnapshot(snap, lastCompleted(at('2026-11-27', '13:30')));
        ok('P1 조기 폐장 13:30 벌크 보정 = 11/25 종가로 덮지 않음(110 유지)', out.day.c === 110 && !out._closeCorrected, JSON.stringify(out));
        const same = correctBulkSnapshot({ ...snap, _eodDate: '2026-11-27', _eodClose: 111, _eodChg: 1 }, lastCompleted(at('2026-11-27', '13:30')));
        ok('P1 오늘 자 EOD 가 오면 그 종가로', same.day.c === 111 && same._closeCorrected === true, JSON.stringify(same));
        // 평일·주말·휴장은 두 완료일이 1,440분 내내 같다(라우트 동작 평일 동등)
        for (const d of ['2026-10-19', '2026-10-20', '2026-10-24', '2026-09-07', '2026-09-08', '2026-11-25']) {
            const st = ms.etWallTimeToMs(d, 0);
            for (let i = 0; i < 1440; i++) ok(`completed==lastClosed ${d} ${i}`, lastCompleted(st + i * 60_000) === cal.etLastClosedSessionDate(st + i * 60_000));
        }
        // 조기 폐장 반영 완료일 두 구현(달력·sessionArchive)이 같은 규칙인가
        for (const d of ['2026-11-27', '2026-12-24', '2026-10-20', '2026-10-24', '2026-09-07']) {
            const st = ms.etWallTimeToMs(d, 0);
            for (let i = 0; i < 1440; i++) ok(`completed==archive ${d} ${i}`, lastCompleted(st + i * 60_000) === archiveCompleted(st + i * 60_000));
        }
    }

    // 휴장일 이름표 = 휴장 날짜 집합
    for (const d of cal.US_MARKET_HOLIDAYS) ok(`name ${d}`, cal.usMarketHolidayName(d) !== null && cal.usMarketHolidayName(d) !== 'Market Holiday');
    ok('name 평일 null', cal.usMarketHolidayName('2026-10-20') === null);
    // 선물 거래일 휴장(일요일 18:00 이후 → 월요일) — 기존과 같은 이름
    NOW = at('2026-09-06', '18:30');
    newProv.fresh();
    const sun = pick(await newProv.get(false));
    ok('노동절 전날 일 18:30 isHolidaySession', sun.isHolidaySession === true && sun.holidaySessionName === 'Labor Day', JSON.stringify(sun));

    // ④ 원천 상태가 massiveClient 60초 캐시에 «open» 으로 남은 채 경계를 넘는 경우
    //   평일 16:00:30 — 기존과 같다(post/open: 기존 경계 지연 그대로, 동등 유지) · 조기 폐장 13:00:30 — post/extended-hours
    const staleOpen = { market: 'open', exchanges: { nasdaq: 'open', nyse: 'open', otc: 'open' } };
    for (const [d, hhmm] of [['2026-10-20', '16:00'], ['2026-10-20', '09:30'], ['2026-11-27', '16:00']] as const) {
        NOW = at(d, hhmm) + 30_000;
        oldProv.fresh(); newProv.fresh(); oldProv.setStale(staleOpen); newProv.setStale(staleOpen);
        const o = pick(await oldProv.get(false)), n = pick(await newProv.get(false));
        ok(`stale open ${d} ${hhmm}:30 동등`, JSON.stringify(o) === JSON.stringify(n), `${JSON.stringify(o)} vs ${JSON.stringify(n)}`);
    }
    NOW = at('2026-11-27', '13:00') + 30_000;
    newProv.fresh(); newProv.setStale(staleOpen);
    const st = pick(await newProv.get(false));
    ok('stale open 11/27 13:00:30 → post/extended-hours', st.session === 'post' && st.market === 'extended-hours', JSON.stringify(st));
    oldProv.setStale(null); newProv.setStale(null);
    console.log('  ✓ 원천 60초 캐시 «open» 잔존: 평일 16:00·09:30 경계 기존과 동등 · 조기 폐장 13:00:30 post/extended-hours');

    console.log(`\n  sessionMin: ${checks} checks passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
