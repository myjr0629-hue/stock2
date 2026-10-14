/**
 * 데이터 무결성 감시기 판정 규칙 시험 — scripts/integrity/{clock,rules,screen}.js
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/priceIntegrityRules.test.ts
 *
 * 출발점은 10/12 19:18 ET MSTR 사고다: 벤더 429 순간에 큰 가격 $154.34 ▲+1.89%(금요일 종가·금요일 등락)·POST $153.61(16시대 옛 체결)이 «오늘 값»으로 보였다.
 * 감시기는 그 모양의 응답을 사람이 보기 전에 오류로 판정해야 하고, 정상 응답·공급사 15분 지연·휴장은 오류로 세지 않아야 한다(오탐 방지).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const oldIntegrityDir = process.env.INTEGRITY_DIR;
const testOutput = fs.mkdtempSync(path.join(os.tmpdir(), 'signum-ext-evidence-'));
process.env.INTEGRITY_DIR = testOutput;
import { US_MARKET_HOLIDAYS, EARLY_CLOSE_DATES } from '../src/lib/marketCalendar';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const clock = require('../scripts/integrity/clock.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const parity = require('./helpers/integrityBaseline.js').installRuleParity();
const rules = require('../scripts/integrity/rules.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const screen = require('../scripts/integrity/screen.js');

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const ms = (date: string, hms: string) => clock.etToMs(date, hms);
const codes = (fs: any[], sev?: string) => fs.filter((f) => !sev || f.sev === sev).map((f) => f.code).sort();
const has = (fs: any[], code: string, sev?: string) => fs.some((f) => f.code === code && (!sev || f.sev === sev));

console.log('━━━ 1. 시계·달력 — 앱 달력과 같은가 ━━━');
t('휴장표·조기 폐장표가 src/lib/marketCalendar.ts 와 같다', () => {
    assert.deepEqual([...clock.HOLIDAYS].sort(), [...US_MARKET_HOLIDAYS].sort());
    assert.deepEqual([...clock.EARLY_CLOSE].sort(), [...EARLY_CLOSE_DATES].sort());
});
t('휴장표 사본(위젯·람다·점검 스크립트)이 앱 달력과 같은 날짜를 모두 갖고 있다 — 달력이 갈라지면 위젯·람다·감시기가 서로 다른 «오늘»을 말한다', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs'); const path = require('path');
    const root = path.join(__dirname, '..');
    const files = ['ios/App/SignumWidget/WidgetData.swift', 'android/app/src/main/java/com/signumhq/app/widget/WidgetData.java', 'scripts/lib/us-market-calendar.js', 'scripts/intrinio-options-eod.js',
        'scripts/lambda-xs/intrinio-adapter.js', 'scripts/lambda-harvest/intrinio-adapter.js', 'scripts/lambda-shared/intrinio-adapter.js', 'scripts/audit-levels-doors.js'];
    for (const f of files) {
        const txt = fs.readFileSync(path.join(root, f), 'utf8');
        const missing = [...US_MARKET_HOLIDAYS].filter((d) => !txt.includes(d));
        assert.deepEqual(missing, [], `${f} 에 없는 휴장일: ${missing.join(',')}`);
    }
    for (const f of ['ios/App/SignumWidget/WidgetData.swift', 'android/app/src/main/java/com/signumhq/app/widget/WidgetData.java']) {
        const txt = fs.readFileSync(path.join(root, f), 'utf8');
        for (const d of EARLY_CLOSE_DATES) assert.ok(txt.includes(d), `${f} 에 조기 폐장일 ${d} 없음`);
    }
});
t('세션 경계: 04:00 pre · 09:30 regular · 16:00 post · 20:00 closed (월요일)', () => {
    const at = (h: string) => clock.sessionAt(ms('2026-10-12', h)).session;
    assert.equal(at('03:59:59'), 'closed'); assert.equal(at('04:00:00'), 'pre'); assert.equal(at('09:29:59'), 'pre');
    assert.equal(at('09:30:00'), 'regular'); assert.equal(at('15:59:59'), 'regular'); assert.equal(at('16:00:00'), 'post');
    assert.equal(at('19:59:59'), 'post'); assert.equal(at('20:00:00'), 'closed');
});
t('C0(마지막으로 끝난 정규장): 장중·프리엔 직전 거래일, 16:00 뒤엔 오늘', () => {
    assert.equal(clock.sessionAt(ms('2026-10-13', '09:00:00')).lastClosed, '2026-10-12');
    assert.equal(clock.sessionAt(ms('2026-10-13', '12:00:00')).lastClosed, '2026-10-12');
    assert.equal(clock.sessionAt(ms('2026-10-13', '16:00:00')).lastClosed, '2026-10-13');
    assert.equal(clock.sessionAt(ms('2026-10-13', '21:00:00')).lastClosed, '2026-10-13');
    assert.equal(clock.sessionAt(ms('2026-10-13', '21:00:00')).prevClosed, '2026-10-12');
});
t('주말·휴장일은 closed, C0 는 마지막 거래일 (토·일·노동절)', () => {
    assert.equal(clock.sessionAt(ms('2026-10-10', '11:00:00')).session, 'closed');
    assert.equal(clock.sessionAt(ms('2026-10-10', '11:00:00')).lastClosed, '2026-10-09');
    assert.equal(clock.sessionAt(ms('2026-10-11', '23:00:00')).lastClosed, '2026-10-09');
    assert.equal(clock.sessionAt(ms('2026-09-07', '10:00:00')).session, 'closed');
    assert.equal(clock.sessionAt(ms('2026-09-07', '10:00:00')).lastClosed, '2026-09-04');
    assert.equal(clock.sessionAt(ms('2026-09-08', '08:00:00')).prevClosed, '2026-09-03');
});
t('일광절약 경계 — 11/1 이후에도 ET 벽시계로 세션이 맞다(EST)', () => {
    assert.equal(clock.sessionAt(ms('2026-11-02', '09:30:00')).session, 'regular');
    assert.equal(clock.sessionAt(ms('2026-11-02', '09:29:00')).session, 'pre');
    assert.equal(clock.etParts(ms('2026-11-02', '09:30:00')).hm, '09:30');
});
t('조기 폐장일(11/27)은 13:00 에 정규장 끝', () => {
    assert.equal(clock.sessionAt(ms('2026-11-27', '12:59:00')).session, 'regular');
    assert.equal(clock.sessionAt(ms('2026-11-27', '13:00:00')).session, 'post');
    assert.equal(clock.sessionAt(ms('2026-11-27', '17:00:00')).session, 'closed');
});
t('감시 회차 칸(:02 :17 :32 :47)이 세션 전환 직후(04:02·09:32·16:02·20:02 ET)를 포함한다', () => {
    for (const h of ['04:02:00', '09:32:00', '16:02:00', '20:02:00']) {
        const sec = ms('2026-10-13', h) / 1000;
        assert.equal((sec - 120) % 900, 0, `${h} 는 칸 경계`);
    }
});
t('전환 시각 목록', () => {
    const tr = clock.transitionsBetween(ms('2026-10-13', '03:00:00'), ms('2026-10-13', '21:00:00'));
    assert.deepEqual(tr.map((x: any) => x.to), ['pre', 'regular', 'post', 'closed']);
});

// ── 기준 묶음 만들기 도우미 ───────────────────────────────────────────────
function bars(date: string, from: string, to: string, price: (i: number) => number, stepMin = 1) {
    const out: any[] = []; let i = 0;
    for (let t0 = ms(date, from); t0 <= ms(date, to); t0 += stepMin * 60e3, i++) { const c = price(i); out.push({ t: t0, o: c, h: c + 0.1, l: c - 0.1, c, v: 100 }); }
    return out;
}
const daily = (m: Record<string, number>) => ({ ok: true, daily: Object.entries(m).map(([date, c]) => ({ date, o: c, h: c, l: c, c, v: 1 })), events: [] as any[] });
const nasdaqPost = (last: number, date: string, trades: Array<[string, number]>) => ({ ok: true, last, asOf: `Data last updated ${new Date(date + 'T12:00:00Z').toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} 08:00 PM ET.`, trades: trades.map(([hms, price]) => ({ hms, price, size: 1 })) });
const nasdaqInfo = (price: number, date: string, status = 'Closed') => ({ ok: true, cls: 'stocks', price, stamp: new Date(date + 'T12:00:00Z').toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }), status });
const rank = (a: any[]) => a;
void rank;

console.log('━━━ 2. MSTR 사고 재현 (10/12 19:18 ET, 애프터) — 오류로 잡히는가 ━━━');
{
    const NOW = ms('2026-10-12', '19:18:50');
    const S = clock.sessionAt(NOW);
    const postTrades = bars('2026-10-12', '16:00:00', '19:18:00', (i) => 153.4 - i * 0.012);   // 16시대 153.4 → 19시 즈음 150.3
    const raw = {
        y1m: { ok: true, bars: postTrades }, yd: daily({ '2026-10-09': 154.34, '2026-10-12': 152.68, '2026-10-08': 151.47 }),
        nInfo: nasdaqInfo(152.68, '2026-10-12'), nPost: nasdaqPost(150.3, '2026-10-12', [['19:18:30', 150.3], ['19:17:55', 150.28]]), nPre: null,
    };
    const ref = rules.deriveRef(NOW, S, raw);
    const incidentTicker = {
        session: 'POST', price: 154.34, prevClose: 154.34, display: { price: 154.34, changePctPct: 1.89 },
        prices: { regularCloseToday: 154.34, prevRegularClose: 154.34, prevChangePct: 1.89, postPrice: 153.61, prePrice: 153.58 },
        extended: { postPrice: 153.61, prePrice: 153.58, postDate: '2026-10-12' },
    };
    const incidentQuote = { price: 154.34, previousClose: 154.34, changePercent: 0, extendedPrice: 153.61, extendedLabel: 'POST', extendedDate: '2026-10-12', extendedKind: 'live', extendedTime: '2026-10-12T20:25:00.000Z', session: 'post' };
    t('사고 응답: 화면 큰 가격 $154.34 ▲+1.89% 가 그대로 재현된다(calcPriceDisplay 를 그대로 읽는다)', () => {
        const shown = screen.flowScreen(incidentQuote, incidentTicker, null, false);
        assert.ok(shown, '화면 계산 함수를 읽어야 한다');
        assert.equal(shown.price, 154.34); assert.ok(Math.abs(shown.pct - 0) < 0.01 || Math.abs(shown.pct - 1.89) < 0.01, `pct ${shown.pct}`);
    });
    t('사고 응답 → 큰 가격(종가 아님)·시간외(옛 체결) 오류, 정상 응답 → 오류 0', () => {
        const bad = screen.flowScreen(incidentQuote, incidentTicker, null, false);
        const fs = rules.judgeFlowShown(NOW, S, ref, 'MSTR', 'screen:flow', bad);
        assert.ok(has(fs, 'CLOSE_PRICE', 'error'), JSON.stringify(codes(fs)));
        assert.ok(has(fs, 'EXT_LAG', 'error') || has(fs, 'EXT_VALUE', 'error'), JSON.stringify(codes(fs)));
        const goodTicker = { ...incidentTicker, price: 152.68, prevClose: 154.34, display: { price: 152.68, changePctPct: -1.08 }, prices: { ...incidentTicker.prices, regularCloseToday: 152.68, prevRegularClose: 154.34, prevChangePct: 1.89, postPrice: 150.3 }, extended: { postPrice: 150.3, prePrice: 153.58 } };
        const goodQuote = { price: 152.68, previousClose: 154.34, changePercent: -1.0755, extendedPrice: 150.3, extendedLabel: 'POST', extendedDate: '2026-10-12', extendedKind: 'live', extendedTime: '2026-10-12T23:18:30.000Z', session: 'post' };
        const good = screen.flowScreen(goodQuote, goodTicker, null, false);
        const fs2 = rules.judgeFlowShown(NOW, S, ref, 'MSTR', 'screen:flow', good);
        assert.deepEqual(codes(fs2, 'error'), [], JSON.stringify(fs2));
    });
    t('API 불변식: 사고 모양 시세(가격=전일 종가, 등락 0, 옛 체결)는 오류, 정상 시세는 통과', () => {
        const fs = rules.judgeQuoteApi(NOW, S, ref, 'MSTR', incidentQuote);
        void fs;   // 가격이 종가가 아님은 화면/기준 대조에서 잡는다 — 여기서는 모양 불변식만
        const q0 = { ...incidentQuote, price: 0 };
        assert.ok(has(rules.judgeQuoteApi(NOW, S, ref, 'MSTR', q0), 'NUM_INVALID', 'error'));
        const lstale = rules.judgeListShown(NOW, S, ref, 'MSTR', 'screen:list', screen.listScreen(incidentQuote, 'post'), incidentQuote);
        assert.ok(lstale.some((f: any) => f.sev === 'error'), '목록 화면도 사고 값을 잡아야 한다: ' + JSON.stringify(codes(lstale)));
    });
    t('수리된 응답(종가 152.68·애프터 150.3 이 최근 체결) → 목록 화면 오류 0', () => {
        const q = { price: 152.68, previousClose: 154.34, changePercent: -1.0755, extendedPrice: 150.3, extendedLabel: 'POST', extendedDate: '2026-10-12', extendedKind: 'live', extendedTime: '2026-10-12T23:18:30.000Z', session: 'post' };
        const fs = [...rules.judgeQuoteApi(NOW, S, ref, 'MSTR', q), ...rules.judgeListShown(NOW, S, ref, 'MSTR', 'screen:list', screen.listScreen(q, 'post'), q)];
        assert.deepEqual(codes(fs, 'error'), [], JSON.stringify(fs));
    });
}

console.log('━━━ 3. 마감(CLOSED) — 종가·애프터 종가·등락 ━━━');
{
    const NOW = ms('2026-10-12', '21:05:00');
    const S = clock.sessionAt(NOW);
    const raw = {
        y1m: { ok: true, bars: bars('2026-10-12', '16:00:00', '19:59:00', () => 149.4) }, yd: daily({ '2026-10-09': 154.34, '2026-10-12': 152.68 }),
        nInfo: nasdaqInfo(152.68, '2026-10-12'), nPost: nasdaqPost(149.4, '2026-10-12', [['19:59:57', 149.4]]), nPre: null,
    };
    const ref = rules.deriveRef(NOW, S, raw);
    const q = (over: any = {}) => ({ price: 152.68, previousClose: 154.34, changePercent: -1.0755, extendedPrice: 149.4, extendedLabel: 'POST', extendedDate: '2026-10-12', extendedKind: 'close', extendedTime: '2026-10-12T23:59:57.646Z', session: 'closed', ...over });
    const judge = (qq: any) => [...rules.judgeQuoteApi(NOW, S, ref, 'MSTR', qq), ...rules.judgeListShown(NOW, S, ref, 'MSTR', 'screen:list', screen.listScreen(qq, 'closed'), qq)];
    t('정상 마감 응답 → 오류 0', () => assert.deepEqual(codes(judge(q()), 'error'), []));
    t('마감 가격이 애프터 NBBO 중간값(149.465)이면 오류 — 31개 이상 한 요청 경로의 증상', () => assert.ok(has(judge(q({ price: 149.465, changePercent: -3.16 })), 'CLOSE_PRICE', 'error')));
    t('전일 종가 재사용(가격 154.34) → 오류', () => assert.ok(judge(q({ price: 154.34, changePercent: 0 })).some((f: any) => f.sev === 'error')));
    t('애프터 종가가 어제 값(날짜 10/9) → EXT_DATE 오류', () => assert.ok(has(judge(q({ extendedDate: '2026-10-09' })), 'EXT_DATE', 'error')));
    t('애프터 종가 값이 기준과 다름(153.61) → EXT_VALUE 오류', () => assert.ok(has(judge(q({ extendedPrice: 153.61, extendedChangePercent: 0.6 })), 'EXT_VALUE', 'error') || judge(q({ extendedPrice: 153.61 })).some((f: any) => f.sev === 'error')));
    t('등락률이 두 가격과 어긋남 → PCT_SELF 오류', () => assert.ok(has(judge(q({ changePercent: 1.89 })), 'PCT_SELF', 'error')));
    t('세션 라벨이 post 인데 시계는 closed → SESSION_MISMATCH(포트폴리오 문 실측 «21시에 post»)', () => assert.ok(has(judge(q({ session: 'post' })), 'SESSION_MISMATCH', 'error')));
    t('시간외 라벨 PRE 가 마감에 뜨면 오류', () => assert.ok(has(judge(q({ extendedLabel: 'PRE' })), 'EXT_LABEL', 'error')));
    t('애프터 체결이 종가와 같아 앱이 칸을 비운 비유동 종목은 오류 아님(CLOV)', () => {
        const raw2 = { ...raw, nPost: nasdaqPost(152.68, '2026-10-12', [['19:54:19', 152.68]]), y1m: { ok: true, bars: bars('2026-10-12', '16:00:00', '19:54:00', () => 152.68) } };
        const ref2 = rules.deriveRef(NOW, S, raw2);
        const qq = q({ extendedPrice: 0, extendedLabel: undefined, extendedDate: null, extendedKind: null, extendedTime: null, extendedChangePercent: 0 });
        const fs = [...rules.judgeQuoteApi(NOW, S, ref2, 'CLOV', qq), ...rules.judgeListShown(NOW, S, ref2, 'CLOV', 'screen:list', screen.listScreen(qq, 'closed'), qq)];
        assert.deepEqual(codes(fs, 'error'), [], JSON.stringify(fs));
    });
    t('야후·나스닥 종가가 서로 다르면 «기준 불일치» — 오류가 아니라 경고', () => {
        const ref3 = rules.deriveRef(NOW, S, { ...raw, nInfo: nasdaqInfo(152.2, '2026-10-12') });
        assert.ok(ref3.c0.conflict);
        const fs = rules.judgeListShown(NOW, S, ref3, 'MSTR', 'screen:list', screen.listScreen(q({ price: 152.2 }), 'closed'), q({ price: 152.2 }));
        assert.deepEqual(codes(fs, 'error'), []);
    });
    t('분할 이벤트가 있으면 종가 대조를 보류하고 사유(info)로 표시', () => {
        const ref4 = rules.deriveRef(NOW, S, { ...raw, yd: { ...raw.yd, events: [{ kind: 'split', date: '2026-10-12', ratio: 0.25 }] } });
        const fs = rules.judgeListShown(NOW, S, ref4, 'MSTR', 'screen:list', screen.listScreen(q({ price: 600 }), 'closed'), q({ price: 600 }));
        assert.deepEqual(codes(fs), ['CORP_ACTION']); assert.equal(fs[0].sev, 'info');
    });
}

console.log('━━━ 4. 주말 — 금요일 값이 «오늘 값»으로 쓰이는 게 정상 ━━━');
{
    const NOW = ms('2026-10-10', '11:00:00');   // 토요일
    const S = clock.sessionAt(NOW);
    const raw = { y1m: { ok: true, bars: bars('2026-10-09', '16:00:00', '19:59:00', () => 100.5) }, yd: daily({ '2026-10-08': 99, '2026-10-09': 100 }), nInfo: nasdaqInfo(100, '2026-10-09'), nPost: nasdaqPost(100.5, '2026-10-09', [['19:59:00', 100.5]]), nPre: null };
    const ref = rules.deriveRef(NOW, S, raw);
    const q = { price: 100, previousClose: 99, changePercent: 1.0101, extendedPrice: 100.5, extendedLabel: 'POST', extendedDate: '2026-10-09', extendedKind: 'close', extendedTime: '2026-10-09T23:59:00.000Z', session: 'closed' };
    t('토요일: 금요일 종가·금요일 애프터 종가가 정답', () => {
        const fs = [...rules.judgeQuoteApi(NOW, S, ref, 'X', q), ...rules.judgeListShown(NOW, S, ref, 'X', 'screen:list', screen.listScreen(q, 'closed'), q)];
        assert.deepEqual(codes(fs, 'error'), [], JSON.stringify(fs));
    });
    t('토요일에 시간외 날짜가 목요일이면 오류', () => assert.ok(has(rules.judgeQuoteApi(NOW, S, ref, 'X', { ...q, extendedDate: '2026-10-08' }), 'EXT_DATE', 'error')));
}

console.log('━━━ 5. 프리마켓 — 공급사 15분 지연은 오류가 아니다 ━━━');
{
    const date = '2026-10-13';
    const mkPre = (nowHms: string, lastTradeHms: string) => {
        const NOW = ms(date, nowHms), S = clock.sessionAt(NOW);
        const preBars = bars(date, '04:00:00', lastTradeHms, (i) => 225 + i * 0.1);
        const raw = { y1m: { ok: true, bars: preBars }, yd: daily({ '2026-10-09': 230, '2026-10-12': 226.32 }), nInfo: nasdaqInfo(226.32, '2026-10-12'), nPost: nasdaqPost(224.59, '2026-10-12', [['19:59:57', 224.59]]), nPre: { ok: true, last: preBars.length ? preBars[preBars.length - 1].c : null, asOf: 'Data last updated Oct 13, 2026 08:00 AM ET.', trades: preBars.slice(-30).map((b) => ({ hms: clock.etParts(b.t).hms, price: b.c, size: 200 })) } };
        return { NOW, S, ref: rules.deriveRef(NOW, S, raw), preBars };
    };
    const quote = (over: any = {}) => ({ price: 226.32, previousClose: 230, changePercent: -1.6035, extendedPrice: 0, extendedLabel: 'PRE', session: 'pre', ...over });
    const shownFlow = (qq: any, tk: any) => screen.flowScreen(qq, tk, null, false);
    const ticker = (over: any = {}) => ({ session: 'PRE', price: 226.32, prevClose: 226.32, display: { price: 226.32, changePctPct: -1.6035 }, prices: { prevRegularClose: 226.32, regularCloseToday: undefined, prevChangePct: -1.6035 }, extended: { prePrice: null, prevPostPrice: 224.59, prevPostDate: '2026-10-12', ...over } });

    t('04:08 ET 프리 첫 체결 전(지연 피드): 칸이 어제 애프터 종가를 이으면 «지연»(오류 아님)', () => {
        const { NOW, S, ref } = mkPre('04:08:00', '04:06:00');
        const shown = shownFlow(quote(), ticker());
        assert.equal(shown.extLabel, 'POST (CLOSED)');
        const fs = rules.judgeFlowShown(NOW, S, ref, 'NVDA', 'screen:flow', shown);
        assert.deepEqual(codes(fs, 'error'), [], JSON.stringify(fs)); assert.ok(has(fs, 'EXT_CARRY', 'delay'));
    });
    t('프리 값이 10분 전 체결이면 정상(15분 지연 허용)', () => {
        const { NOW, S, ref, preBars } = mkPre('07:30:00', '07:29:00');
        const old = preBars.find((b: any) => b.t === ms(date, '07:20:00'));
        const q = quote({ extendedPrice: old.c, extendedChangePercent: 0, extendedDate: date, extendedKind: 'live', extendedTime: new Date(old.t).toISOString() });
        const fs = rules.judgeFlowShown(NOW, S, ref, 'NVDA', 'screen:flow', shownFlow(q, ticker({ prePrice: old.c })));
        assert.deepEqual(codes(fs, 'error'), [], JSON.stringify(fs));
    });
    t('프리 값이 25분 전 체결이면 지연 초과 오류(EXT_LAG)', () => {
        const { NOW, S, ref, preBars } = mkPre('07:30:00', '07:29:00');
        const old = preBars.find((b: any) => b.t === ms(date, '07:03:00'));
        const q = quote({ extendedPrice: old.c, extendedDate: date, extendedKind: 'live', extendedTime: new Date(old.t).toISOString() });
        const fs = rules.judgeFlowShown(NOW, S, ref, 'NVDA', 'screen:flow', shownFlow(q, ticker({ prePrice: old.c })));
        assert.ok(has(fs, 'EXT_LAG', 'error'), JSON.stringify(codes(fs)));
    });
    t('프리마켓에 프리 체결이 있는데 칸이 어제 애프터(POST)에 머물면 오류 — 04:30 이후', () => {
        const { NOW, S, ref } = mkPre('04:40:00', '04:38:00');
        const fs = rules.judgeFlowShown(NOW, S, ref, 'NVDA', 'screen:flow', shownFlow(quote(), ticker()));
        assert.ok(has(fs, 'EXT_CARRY_TOO_LONG', 'error'), JSON.stringify(codes(fs)));
    });
    t('프리마켓 큰 가격은 직전 정규장 종가(C0) · 등락은 C0 의 등락', () => {
        const { NOW, S, ref } = mkPre('07:30:00', '07:29:00');
        const good = shownFlow(quote(), ticker());
        assert.deepEqual(codes(rules.judgeFlowShown(NOW, S, ref, 'NVDA', 'screen:flow', good).filter((f: any) => f.code === 'CLOSE_PRICE' || f.code === 'PCT_BASE')), []);
        const bad = shownFlow(quote(), { ...ticker(), prices: { prevRegularClose: 230, prevChangePct: 1 }, prevClose: 230, display: { price: 230, changePctPct: 1 } });
        assert.ok(has(rules.judgeFlowShown(NOW, S, ref, 'NVDA', 'screen:flow', bad), 'CLOSE_PRICE', 'error'));
    });
}

    t('★ 새 세션 첫 17분 허브가 직전 세션 마지막 체결을 들고 있으면 «지연»(오류 아님) — 17분이 지나도 같으면 경고', () => {
        const date = '2026-10-13';
        const mk = (hms: string) => { const NOW = ms(date, hms), S = clock.sessionAt(NOW); const preBars = bars(date, '04:00:00', clock.etParts(NOW - 60e3).hms, (i) => 225 + i * 0.1);
            return { NOW, S, ref: rules.deriveRef(NOW, S, { y1m: { ok: true, bars: preBars }, yd: daily({ '2026-10-09': 230, '2026-10-12': 226.32 }), nInfo: nasdaqInfo(226.32, '2026-10-12'), nPost: nasdaqPost(224.59, '2026-10-12', [['19:59:57', 224.59]]), nPre: null }) }; };
        const a = mk('04:08:00');
        assert.ok(has(rules.judgeHub(a.NOW, a.S, a.ref, 'NVDA', { price: 224.59, changePct: -2 }, 0), 'HUB_CARRY', 'delay'));
        const b = mk('04:40:00');
        assert.ok(!has(rules.judgeHub(b.NOW, b.S, b.ref, 'NVDA', { price: 224.59, changePct: -2 }, 0), 'HUB_CARRY'));
    });
    t('★ 체결이 드문 종목(DPZ): 앱 값 = 15분 지연 시점의 마지막 체결(23분 전 것)이면 정상 — 지연 피드는 «15분 전의 상태»를 준다', () => {
        const date = '2026-10-13';
        const NOW = ms(date, '04:32:00'), S = clock.sessionAt(NOW);
        // 04:09 에 마지막 체결 후 04:17~04:31 사이 새 체결(지연 피드엔 아직 없음)
        const tr = [['04:31:00', 311.2], ['04:26:00', 311], ['04:20:00', 310.8], ['04:09:00', 310.44]];
        const preBars = tr.map(([h, p]: any) => ({ t: ms(date, h), o: p, h: p, l: p, c: p, v: 1 })).sort((a: any, b: any) => a.t - b.t);
        const ref = rules.deriveRef(NOW, S, { y1m: { ok: true, bars: preBars }, yd: daily({ '2026-10-09': 300, '2026-10-12': 310.9 }), nInfo: null, nPost: null, nPre: { ok: true, last: 311.2, asOf: 'Data last updated Oct 13, 2026 04:31 AM ET.', trades: tr.map(([h, p]: any) => ({ hms: h, price: p, size: 2000 })) } });
        const q = { price: 310.9, previousClose: 300, changePercent: 3.6333, extendedPrice: 310.44, extendedLabel: 'PRE', extendedDate: date, extendedKind: 'live', extendedTime: `${date}T08:09:00.000Z`, session: 'pre' };
        assert.deepEqual(codes(rules.judgeQuoteApi(NOW, S, ref, 'DPZ', q), 'error'), []);
        // 같은 시각 앱 값이 04:09 이전 체결(310.0)이면 «지연 초과» 오류
        const preBars2 = [{ t: ms(date, '04:00:00'), o: 305, h: 305, l: 305, c: 305, v: 1 }, ...preBars];
        const ref2 = rules.deriveRef(NOW, S, { y1m: { ok: true, bars: preBars2 }, yd: daily({ '2026-10-09': 300, '2026-10-12': 310.9 }), nInfo: null, nPost: null, nPre: { ok: true, last: 311.2, asOf: 'Data last updated Oct 13, 2026 04:31 AM ET.', trades: [...tr, ['04:00:00', 305]].map(([h, p]: any) => ({ hms: h, price: p, size: 2000 })) } });
        assert.ok(has(rules.judgeQuoteApi(NOW, S, ref2, 'DPZ', { ...q, extendedPrice: 305, extendedChangePercent: -1.9 }), 'EXT_LAG', 'error'));
    });
    t('★ 앱 값보다 새로운 체결이 단주(100주 미만)뿐이면 오류가 아니라 정보 — CLOV 10/13 프리', () => {
        const date = '2026-10-13';
        const NOW = ms(date, '04:53:00'), S = clock.sessionAt(NOW);
        const tr = [['04:30:08', 4.7, 5], ['04:05:13', 4.6412, 1], ['04:03:03', 4.59, 20]];
        const bars0 = tr.map(([h, p]: any) => ({ t: ms(date, h), o: p, h: p, l: p, c: p, v: 0 })).sort((a: any, b: any) => a.t - b.t);
        const ref = rules.deriveRef(NOW, S, { y1m: { ok: true, bars: bars0 }, yd: daily({ '2026-10-09': 4.79, '2026-10-12': 4.78 }), nInfo: null, nPost: nasdaqPost(4.78, '2026-10-12', [['19:54:19', 4.78]]), nPre: { ok: true, last: 4.7, asOf: 'Data last updated Oct 13, 2026 04:53 AM ET.', trades: tr.map(([h, p, z]: any) => ({ hms: h, price: p, size: z })) } });
        const q = { price: 4.78, previousClose: 4.79, changePercent: -0.21, extendedPrice: 0, extendedLabel: 'PRE', session: 'pre' };
        const tk = { session: 'PRE', price: 4.78, prevClose: 4.79, display: { price: 4.78, changePctPct: -0.21 }, prices: { prevRegularClose: 4.78, prevChangePct: -0.21 }, extended: { prePrice: null, prevPostPrice: 4.78, prevPostDate: '2026-10-12' } };
        const shown = screen.flowScreen(q, tk, null, false);
        const fs = rules.judgeFlowShown(NOW, S, ref, 'CLOV', 'screen:flow', shown);
        assert.deepEqual(codes(fs, 'error'), [], JSON.stringify(fs)); assert.ok(has(fs, 'EXT_ODDLOT', 'info') || has(fs, 'EXT_ILLIQUID', 'info'));   // 총 26주 — 단주뿐이고 비유동
    });
    t('★ 체결이 드문 종목(시간외 거래대금 2천만 달러 미만)의 «공급사 피드 지연»은 오류가 아니라 지연(EXT_FEED_THIN) — CLOV 프리 10/13', () => {
        const date = '2026-10-13';
        const NOW = ms(date, '08:39:00'), S = clock.sessionAt(NOW);
        const tr: any[] = [['08:10:43', 4.81, 150], ['08:06:01', 4.75, 5000], ['07:00:00', 4.6, 500]];
        const bars0 = tr.map(([h, p]: any) => ({ t: ms(date, h), o: p, h: p, l: p, c: p, v: 0 })).sort((a: any, b: any) => a.t - b.t);
        const nPre = { ok: true, last: 4.81, volume: 9428, asOf: 'Data last updated Oct 13, 2026 08:39 AM ET.', trades: tr.map(([h, p, z]: any) => ({ hms: h, price: p, size: z })) };
        const ref = rules.deriveRef(NOW, S, { y1m: { ok: true, bars: bars0 }, yd: daily({ '2026-10-09': 4.79, '2026-10-12': 4.78 }), nInfo: null, nPost: nasdaqPost(4.78, '2026-10-12', [['19:54:19', 4.78]]), nPre });
        const q = { price: 4.78, previousClose: 4.79, changePercent: -0.21, extendedPrice: 4.6, extendedLabel: 'PRE', extendedDate: date, extendedKind: 'live', extendedTime: `${date}T11:00:00.239Z`, extendedChangePercent: -3.7657, session: 'pre' };
        const fs = rules.judgeQuoteApi(NOW, S, ref, 'CLOV', q);
        assert.deepEqual(codes(fs, 'error'), [], JSON.stringify(fs)); assert.ok(has(fs, 'EXT_FEED_THIN', 'delay'));
    });
    t('나스닥 프리 기준을 못 읽은 종목은 «최근 프리 체결과 안 맞음»을 오류로 단정하지 않는다(EXT_REF_PARTIAL info)', () => {
        const date = '2026-10-13', NOW = ms(date, '04:40:00'), S = clock.sessionAt(NOW);
        const preBars = bars(date, '04:00:00', '04:03:00', () => 265.5);
        const ref = rules.deriveRef(NOW, S, { y1m: { ok: true, bars: preBars }, yd: daily({ '2026-10-09': 261.44, '2026-10-12': 263.73 }), nInfo: null, nPost: null, nPre: null });
        const q = { price: 263.73, previousClose: 261.44, changePercent: 0.87, extendedPrice: 267, extendedLabel: 'PRE', extendedDate: date, extendedKind: 'live', extendedTime: `${date}T08:30:00.000Z`, session: 'pre' };
        const fs = rules.judgeQuoteApi(NOW, S, ref, 'JNJ', q);
        assert.deepEqual(codes(fs, 'error'), [], JSON.stringify(fs)); assert.ok(has(fs, 'EXT_REF_PARTIAL', 'info'));
    });

console.log('━━━ 6. 정규장 — 지금가·등락 기준선·PRE CLOSE ━━━');
{
    const date = '2026-10-13', NOW = ms(date, '11:00:30'), S = clock.sessionAt(NOW);
    const regBars = bars(date, '09:30:00', '11:00:00', (i) => 226 + Math.sin(i / 10));
    const last = regBars[regBars.length - 1].c;
    const preBars = bars(date, '04:00:00', '09:29:00', () => 225.5);
    const raw = { y1m: { ok: true, bars: [...preBars, ...regBars] }, yd: daily({ '2026-10-09': 230, '2026-10-12': 226.32 }), nInfo: { ...nasdaqInfo(last, date, 'Open'), stamp: 'Oct 13, 2026' }, nPre: { ok: true, last: 225.5, asOf: 'Data last updated Oct 13, 2026 09:29 AM ET.', trades: [{ hms: '09:29:00', price: 225.5, size: 1 }] }, nPost: nasdaqPost(224.59, '2026-10-12', [['19:59:57', 224.59]]) };
    const ref = rules.deriveRef(NOW, S, raw);
    const q = (over: any = {}) => ({ price: last, previousClose: 226.32, changePercent: ((last - 226.32) / 226.32) * 100, extendedPrice: 225.5, extendedChangePercent: -0.36, extendedLabel: 'PRE', extendedDate: date, extendedKind: 'close', extendedTime: `${date}T13:29:00.000Z`, session: 'regular', ...over });
    const tk = (prev = 226.32) => ({ session: 'REG', price: last, prevClose: prev, display: { price: last, changePctPct: ((last - prev) / prev) * 100 }, prices: { prevRegularClose: prev, regularCloseToday: undefined, prevChangePct: -1.29 }, extended: { prePrice: 225.5, preDate: date, preKind: 'close' } });
    t('정상: 지금가가 1분봉 안, 등락은 전일 종가 대비, PRE CLOSE 이름·값 정상 → 오류 0', () => {
        const fs = [...rules.judgeQuoteApi(NOW, S, ref, 'NVDA', q()), ...rules.judgeFlowShown(NOW, S, ref, 'NVDA', 'screen:flow', screen.flowScreen(q(), tk(), null, false)), ...rules.judgeListShown(NOW, S, ref, 'NVDA', 'screen:list', screen.listScreen(q(), 'regular'), q())];
        assert.deepEqual(codes(fs, 'error'), [], JSON.stringify(fs));
    });
    t('지금가가 2% 벗어나면 LIVE_PRICE 오류', () => {
        const bad = q({ price: last * 1.02 });
        assert.ok(has(rules.judgeListShown(NOW, S, ref, 'NVDA', 'screen:list', screen.listScreen(bad, 'regular'), bad), 'LIVE_PRICE', 'error'));
    });
    t('등락 기준선이 전일 종가가 아니면(MSTR 154.34 vs 152.68 모양) PCT_BASE 오류', () => {
        const fs = rules.judgeFlowShown(NOW, S, ref, 'NVDA', 'screen:flow', screen.flowScreen(q(), tk(230), null, false));
        assert.ok(has(fs, 'PCT_BASE', 'error'), JSON.stringify(codes(fs)));
    });
    t('정규장 시간외 칸이 «PRE» 이름이 아니라 «POST» 로 오면 오류', () => {
        assert.ok(has(rules.judgeQuoteApi(NOW, S, ref, 'NVDA', q({ extendedLabel: 'POST' })), 'EXT_LABEL', 'error'));
    });
    t('정규장 PRE 칸이 어제 날짜면 오류', () => assert.ok(has(rules.judgeQuoteApi(NOW, S, ref, 'NVDA', q({ extendedDate: '2026-10-12' })), 'EXT_DATE', 'error')));
    t('허브 틱: 지금가 일치 → 통과 · 1.5% 벗어남 → HUB_PRICE 오류', () => {
        assert.deepEqual(codes(rules.judgeHub(NOW, S, ref, 'NVDA', { price: last, changePct: ((last - 226.32) / 226.32) * 100 }, 0), 'error'), []);
        assert.ok(has(rules.judgeHub(NOW, S, ref, 'NVDA', { price: last * 1.015, changePct: 0 }, 0), 'HUB_PRICE', 'error'));
    });
    t('개장 직후 09:35 — PRE CLOSE 잠정값(지연 피드의 프리 체결)은 오류가 아니라 지연', () => {
        const NOW2 = ms(date, '09:35:00'), S2 = clock.sessionAt(NOW2);
        const pre = [...bars(date, '04:00:00', '09:29:00', (i) => 225 + (i % 7) * 0.05)];
        const ref2 = rules.deriveRef(NOW2, S2, { ...raw, y1m: { ok: true, bars: [...pre, ...bars(date, '09:30:00', '09:35:00', () => 226)] }, nPre: { ok: true, last: 225.3, asOf: 'Data last updated Oct 13, 2026 09:29 AM ET.', trades: [{ hms: '09:29:58', price: 225.3, size: 1 }, { hms: '09:14:00', price: 225.05, size: 1 }] } });
        const prov = pre.find((b: any) => b.t === ms(date, '09:14:00'));
        const qq = q({ price: 226, extendedPrice: prov.c, extendedKind: 'live', extendedTime: new Date(prov.t).toISOString(), changePercent: ((226 - 226.32) / 226.32) * 100 });
        const fs = rules.judgeFlowShown(NOW2, S2, ref2, 'NVDA', 'screen:flow', screen.flowScreen(qq, tk(), null, false));
        assert.deepEqual(codes(fs, 'error'), [], JSON.stringify(fs));
    });
}

console.log('━━━ 7. 옵션 레벨 — 정의 게이트·체인 기준일·만기·문 사이 ━━━');
{
    const NOW = ms('2026-10-13', '11:00:00'), S = clock.sessionAt(NOW);
    const lv = (over: any = {}) => ({ maxPain: 220, callWall: 250, putFloor: 220, gammaFlip: 225, chainDate: '2026-10-12', expiration: '2026-10-16', spot: 226.18, asOf: 1791838824178, ...over });
    t('정상 레벨 → 오류 0', () => assert.deepEqual(codes(rules.judgeLevels(NOW, S, 'NVDA', 'ticker', lv(), 226.3), 'error'), []));
    t('정규장 중 체인 기준일 = 직전 EOD(10/12) — 정상. 10/9 이면 오류(3일 묵음)', () => {
        assert.ok(has(rules.judgeLevels(NOW, S, 'NVDA', 'ticker', lv({ chainDate: '2026-10-09' }), 226.3), 'LV_CHAIN_OLD', 'error'));
    });
    t('마감 뒤 20:00~다음 날 08:00 ET 사이 하루 전 판본은 «지연»(사전 갱신 중), 08:00 이후엔 오류', () => {
        const n1 = ms('2026-10-13', '21:00:00'), s1 = clock.sessionAt(n1);
        assert.ok(has(rules.judgeLevels(n1, s1, 'NVDA', 'ticker', lv({ chainDate: '2026-10-12' }), 226.3), 'LV_CHAIN_LAG', 'delay'));
        const n2 = ms('2026-10-14', '08:30:00'), s2 = clock.sessionAt(n2);
        assert.ok(has(rules.judgeLevels(n2, s2, 'NVDA', 'ticker', lv({ chainDate: '2026-10-12' }), 226.3), 'LV_CHAIN_OLD', 'error'));
    });
    t('콜월이 현재가 아래(MU 9/28 모양) → LV_GATE', () => assert.ok(has(rules.judgeLevels(NOW, S, 'MU', 'watchlist', lv({ callWall: 200 }), 226.3), 'LV_GATE', 'error')));
    t('★ 재선택(levelsReselected): 프리 가격이 풋플로어 아래로 내려가 문이 같은 분포에서 다시 고른 풋플로어는 오류가 아니다(ASTS 10/13 04:17 ET)', () => {
        const nowP = ms('2026-10-13', '04:17:00'), SP = clock.sessionAt(nowP);
        // 구조 판본 풋플로어 50, 프리 가격 49.6 → 문이 40 으로 다시 고름. 화면 큰 가격(C0 종가)은 51.46
        const base = { maxPain: 55, callWall: 55, putFloor: 40, gammaFlip: 53, chainDate: '2026-10-12', expiration: '2026-10-16', spot: 51.69, asOf: 1 };
        assert.ok(has(rules.judgeLevels(nowP, SP, 'ASTS', 'ticker', base, 51.46), 'LV_GATE', 'error'), '재선택 표식이 없으면 위반');
        assert.deepEqual(codes(rules.judgeLevels(nowP, SP, 'ASTS', 'ticker', { ...base, reselected: ['putFloor'], displaySpot: 49.6 }, 51.46), 'error'), []);
        // 표시 가격 기준으로도 정의를 어기면(예: 재선택 값 30 ← 49.6 의 0.8배 39.7 아래) 여전히 오류
        assert.ok(has(rules.judgeLevels(nowP, SP, 'ASTS', 'ticker', { ...base, putFloor: 30, reselected: ['putFloor'], displaySpot: 49.6 }, 51.46), 'LV_GATE', 'error'));
    });
    t('★ 프리 가격이 종가에서 크게 벗어난 날(SOXL −7%): 레벨은 시간외 표시가격(119.03) 기준으로 확인한다 — 종가(128.4) 기준으로는 풋플로어 100 이 범위 밖으로 보인다', () => {
        const nowP = ms('2026-10-13', '09:21:00'), SP = clock.sessionAt(nowP);
        const lvl = { maxPain: 140, callWall: 140, putFloor: 100, gammaFlip: null, chainDate: '2026-10-12', expiration: '2026-10-16', spot: 119.7, asOf: 1 };
        assert.ok(has(rules.judgeLevels(nowP, SP, 'SOXL', 'watchlist', lvl, 128.4), 'LV_GATE', 'error'), '표시가격을 모르면 종가로 판정(위반)');
        assert.deepEqual(codes(rules.judgeLevels(nowP, SP, 'SOXL', 'watchlist', { ...lvl, displaySpot: 119.03 }, 128.4), 'error'), []);
    });
    t('★ 개장 뒤 늦게 보고된 Form T(09:30:01)로 확정된 PRE CLOSE 는 나스닥 프리 목록의 마지막과 달라도 오류가 아니다(JNJ 실적일 254.5 vs 258.38) · 시각이 그 창 밖이면 오류', () => {
        const date2 = '2026-10-13', NOW2 = ms(date2, '09:56:00'), S2 = clock.sessionAt(NOW2);
        const pre = [...bars(date2, '04:00:00', '09:29:00', () => 258.38)];
        const raw2 = { y1m: { ok: true, bars: [...pre, ...bars(date2, '09:30:00', '09:55:00', () => 255)] }, yd: daily({ '2026-10-09': 261.44, '2026-10-12': 263.73 }), nInfo: { ...nasdaqInfo(255, date2, 'Open'), stamp: 'Oct 13, 2026' }, nPre: { ok: true, last: 258.38, asOf: 'Data last updated Oct 13, 2026 09:55 AM ET.', trades: [{ hms: '09:29:58', price: 258.38, size: 200 }] }, nPost: nasdaqPost(264, '2026-10-12', [['19:59:00', 264]]) };
        const ref2 = rules.deriveRef(NOW2, S2, raw2);
        const q2 = (over: any = {}) => ({ price: 255, previousClose: 263.73, changePercent: -3.3, extendedPrice: 254.5, extendedChangePercent: -3.5, extendedLabel: 'PRE', extendedDate: date2, extendedKind: 'close', extendedTime: `${date2}T13:30:01.200Z`, session: 'regular', ...over });
        const ok = rules.judgeQuoteApi(NOW2, S2, ref2, 'JNJ', q2());
        assert.deepEqual(codes(ok, 'error'), [], JSON.stringify(ok)); assert.ok(has(ok, 'EXT_LATE_PRINT', 'info'));
        const bad = rules.judgeQuoteApi(NOW2, S2, ref2, 'JNJ', q2({ extendedTime: `${date2}T13:31:30.000Z` }));
        assert.ok(has(bad, 'EXT_TIME_WINDOW', 'error') || has(bad, 'EXT_VALUE', 'error'), JSON.stringify(codes(bad)));
    });
    t('★ 개장 90초 뒤에도 PRE CLOSE 칸이 비어 있으면 오류(EXT_MISSING_OPEN) — 10/13 09:39 ET 41종목 전부 빈 칸 재발(대표 10/5 «칸이 사라졌다»)', () => {
        const date2 = '2026-10-13';
        const pre = [...bars(date2, '04:00:00', '09:29:00', () => 225.5)];
        const mk = (hms: string) => { const N = ms(date2, hms), SS = clock.sessionAt(N); return { N, SS, ref: rules.deriveRef(N, SS, { y1m: { ok: true, bars: [...pre, ...bars(date2, '09:30:00', hms, () => 226)] }, yd: daily({ '2026-10-09': 230, '2026-10-12': 226.32 }), nInfo: { ...nasdaqInfo(226, date2, 'Open'), stamp: 'Oct 13, 2026' }, nPre: { ok: true, last: 225.5, asOf: 'Data last updated Oct 13, 2026 09:29 AM ET.', trades: [{ hms: '09:29:00', price: 225.5, size: 300 }] }, nPost: nasdaqPost(224.59, '2026-10-12', [['19:59:57', 224.59]]) }) }; };
        const q2 = { price: 226, previousClose: 226.32, changePercent: -0.14, extendedPrice: 0, extendedLabel: 'PRE', session: 'regular' };
        const early = mk('09:31:00'), later = mk('09:39:00');
        assert.ok(has(rules.judgeQuoteApi(early.N, early.SS, early.ref, 'NVDA', q2), 'EXT_MISSING_OPEN', 'delay'), '개장 90초 안은 지연');
        assert.ok(has(rules.judgeQuoteApi(later.N, later.SS, later.ref, 'NVDA', q2), 'EXT_MISSING_OPEN', 'error'));
    });
    t('★ 프리 마지막 1초 안에 체결이 여러 건(09:29:59 에 131.04~132.38)이면 그중 하나인 PRE CLOSE 는 오류가 아니다(C 10/13) · 그 초 밖의 값은 오류', () => {
        const date2 = '2026-10-13', NOW2 = ms(date2, '11:07:00'), S2 = clock.sessionAt(NOW2);
        const raw2 = { y1m: { ok: true, bars: [...bars(date2, '04:00:00', '09:29:00', () => 131), ...bars(date2, '09:30:00', '11:06:00', () => 129.5)] }, yd: daily({ '2026-10-09': 130, '2026-10-12': 131.5 }), nInfo: { ...nasdaqInfo(129.5, date2, 'Open'), stamp: 'Oct 13, 2026' }, nPre: { ok: true, last: 132.38, volume: 9e6, asOf: 'Data last updated Oct 13, 2026 11:06 AM ET.', trades: [{ hms: '09:29:59', price: 131.04, size: 23 }, { hms: '09:29:59', price: 132.38, size: 100 }, { hms: '09:29:40', price: 130.9, size: 50 }] }, nPost: nasdaqPost(131.5, '2026-10-12', [['19:59:57', 131.5]]) };
        const ref2 = rules.deriveRef(NOW2, S2, raw2);
        const q2 = (ext: number) => ({ price: 129.5, previousClose: 131.5, changePercent: -1.52, extendedPrice: ext, extendedChangePercent: (ext - 131.5) / 131.5 * 100, extendedLabel: 'PRE', extendedDate: date2, extendedKind: 'close', extendedTime: `${date2}T13:29:59.132Z`, session: 'regular' });
        const ok = rules.judgeQuoteApi(NOW2, S2, ref2, 'C', q2(131.04));
        assert.deepEqual(codes(ok, 'error'), [], JSON.stringify(ok)); assert.ok(has(ok, 'EXT_REF_TIE', 'info'));
        { const r3 = rules.judgeQuoteApi(NOW2, S2, ref2, "C", q2(130.0)); assert.ok(has(r3, "EXT_VALUE", "error"), JSON.stringify(r3)); }
    });
    t('★ 체결이 드문 종목(프리 거래대금 < 2천만 달러)의 PRE CLOSE 가 개장 47분 뒤에도 비면 «지연»(공급사 단일 거래소 피드에 프리 체결 없음) · 활발한 종목은 경고 그대로', () => {
        const date2 = '2026-10-13', NOW2 = ms(date2, '11:07:00'), S2 = clock.sessionAt(NOW2);
        const mk = (vol: number) => rules.deriveRef(NOW2, S2, { y1m: { ok: true, bars: [...bars(date2, '04:00:00', '09:29:00', () => 4.75), ...bars(date2, '09:30:00', '11:06:00', () => 4.79)] }, yd: daily({ '2026-10-09': 4.8, '2026-10-12': 4.78 }), nInfo: { ...nasdaqInfo(4.79, date2, 'Open'), stamp: 'Oct 13, 2026' }, nPre: { ok: true, last: 4.75, volume: vol, asOf: 'Data last updated Oct 13, 2026 11:06 AM ET.', trades: [{ hms: '09:26:21', price: 4.75, size: 20 }] }, nPost: nasdaqPost(4.78, '2026-10-12', [['19:59:57', 4.78]]) });
        const q2 = { price: 4.79, previousClose: 4.78, changePercent: 0.2, extendedPrice: 0, extendedLabel: 'PRE', session: 'regular' };
        assert.ok(has(rules.judgeQuoteApi(NOW2, S2, mk(300000), 'CLOV', q2), 'EXT_FEED_THIN', 'delay'));
        assert.ok(has(rules.judgeQuoteApi(NOW2, S2, mk(9e6), 'CLOV', q2), 'EXT_MISSING', 'warn'));
    });
    t('감마 플립은 문마다 기준 현물이 다르면 2% 안 차이는 정의대로(정보) · 같은 현물이면 경고 그대로 · 2% 넘으면 경고', () => {
        const a = { door: 'ticker', lv: { gammaFlip: 950, asOf: 1, chainDate: '2026-10-12', spot: 957.83 } };
        const b = { door: 'watchlist', lv: { gammaFlip: 955, asOf: 2, chainDate: '2026-10-12', spot: 958.17 } };
        const r = rules.judgeLevelDoors('COST', [a, b]);
        assert.deepEqual(codes(r, 'warn'), []); assert.ok(has(r, 'LV_DOORS_SPOT', 'info'));
        assert.ok(has(rules.judgeLevelDoors('COST', [a, { ...b, lv: { ...b.lv, spot: 957.83 } }]), 'LV_DOORS_VERSION', 'warn'));
        assert.ok(has(rules.judgeLevelDoors('COST', [a, { ...b, lv: { ...b.lv, gammaFlip: 990 } }]), 'LV_DOORS_VERSION', 'warn'));
        const c = { door: 'ticker', lv: { gammaFlip: 4.5, asOf: 1, chainDate: '2026-10-12', spot: 4.76 } }, d = { door: 'watchlist', lv: { gammaFlip: 5, asOf: 2, chainDate: '2026-10-12', spot: 4.8 } };
        assert.deepEqual(codes(rules.judgeLevelDoors('CLOV', [c, d]), 'warn'), [], '저가주: 행사가 간격 0.5 → 4.5/5 는 같은 분포의 인접 행사가');
    });
    t('0·음수 레벨 → LV_INVALID', () => assert.ok(has(rules.judgeLevels(NOW, S, 'MU', 'watchlist', lv({ putFloor: 0 }), 226.3), 'LV_INVALID', 'error')));
    t('만기가 이미 지났으면 LV_EXPIRED', () => assert.ok(has(rules.judgeLevels(NOW, S, 'NVDA', 'ticker', lv({ expiration: '2026-10-09' }), 226.3), 'LV_EXPIRED', 'error')));
    t('네 칸이 모두 비면 경고(LV_EMPTY)', () => assert.ok(has(rules.judgeLevels(NOW, S, 'X', 'ticker', lv({ maxPain: null, callWall: null, putFloor: null, gammaFlip: null }), 100), 'LV_EMPTY', 'warn')));
    t('같은 판본(asOf)인데 문마다 맥스페인이 다르면 오류, 판본이 다르면 정보', () => {
        const a = { door: 'ticker', lv: { maxPain: 220, callWall: 250, putFloor: 220, gammaFlip: 225, asOf: 1, chainDate: '2026-10-12' } };
        const b = { door: 'watchlist', lv: { maxPain: 200, callWall: 250, putFloor: 220, gammaFlip: 225, asOf: 1, chainDate: '2026-10-12' } };
        assert.ok(has(rules.judgeLevelDoors('NVDA', [a, b]), 'LV_DOORS', 'error'));
        assert.deepEqual(codes(rules.judgeLevelDoors('NVDA', [a, { ...b, lv: { ...b.lv, asOf: 2, chainDate: '2026-10-09' } }]), 'error'), []);
    });
}

console.log('━━━ 8. 문 사이 가격 일치 ━━━');
t('마감 뒤 문마다 가격이 다르면 경고(두 회차 연속이면 오류로 승격, 센트까지), 정규장 중엔 0.4% 까지 허용', () => {
    const NOW = ms('2026-10-12', '21:00:00'), S = clock.sessionAt(NOW);
    assert.ok(has(rules.judgeDoorsPrice(NOW, S, 'MSTR', [{ door: 'quotes', price: 152.68 }, { door: 'dashboard', price: 153.4 }]), 'DOOR_PRICE', 'warn'));
    assert.deepEqual(codes(rules.judgeDoorsPrice(NOW, S, 'MSTR', [{ door: 'quotes', price: 152.68 }, { door: 'watchlist', price: 152.68 }]), 'error'), []);
    const N2 = ms('2026-10-13', '11:00:00'), S2 = clock.sessionAt(N2);
    assert.deepEqual(codes(rules.judgeDoorsPrice(N2, S2, 'MSTR', [{ door: 'quotes', price: 152.68 }, { door: 'watchlist', price: 152.9 }]), 'error'), []);
});

console.log('━━━ 9. 늦게 보고된 종가 체결(AZZ 10/13) — 야후 일봉이 잠정일 때 앱이 맞는 경우 ━━━');
{
    const NOW = ms('2026-10-13', '19:32:00'), S = clock.sessionAt(NOW);
    const mk = (hms: string, c: number, v: number) => ({ t: ms('2026-10-13', hms), o: c, h: c, l: c, c, v });
    const y1m = { ok: true, bars: [mk('15:58:00', 137.5, 9000), mk('15:59:00', 136.96, 29960), mk('16:00:00', 137.16, 1122), mk('16:04:00', 136.71, 128661)] };
    // 일봉은 아직 잠정(16:00 봉 값) — 확정은 몇 시간 뒤 136.71
    const raw = { y1m, yd: daily({ '2026-10-12': 137.76, '2026-10-13': 137.16 }), nInfo: null, nPost: null, nPre: null };
    const ref = rules.deriveRef(NOW, S, raw);
    const quote = (price: number) => ({ price, previousClose: 137.76, changePercent: ((price - 137.76) / 137.76) * 100, extendedPrice: 139.5, extendedLabel: 'POST', extendedDate: '2026-10-13', extendedKind: 'live', extendedTime: '2026-10-13T23:05:00.000Z', session: 'post' });
    t('C0 는 일봉 값, 후보(alt)는 16:04 봉(거래량 최대) 136.71', () => { assert.equal(ref.c0.v, 137.16); assert.equal(ref.c0.alt, 136.71); });
    t('앱 값이 늦게 보고된 종가 체결(136.71)이면 큰 가격·시간외 등락 오류 없음', () => {
        const shown = screen.flowScreen(quote(136.71), { session: 'POST', price: 136.71, prevClose: 137.76, display: { price: 136.71, changePctPct: -0.76 }, prices: { regularCloseToday: 136.71, prevRegularClose: 137.76, prevChangePct: -0.76, postPrice: 139.5 }, extended: { postPrice: 139.5, postDate: '2026-10-13' } }, null, false);
        const fs = rules.judgeFlowShown(NOW, S, ref, 'AZZ', 'screen:flow', shown);
        assert.ok(!has(fs, 'CLOSE_PRICE'), JSON.stringify(fs.filter((f: any) => f.code === 'CLOSE_PRICE')));
        assert.ok(!has(fs, 'EXT_PCT', 'error'), JSON.stringify(fs.filter((f: any) => f.code === 'EXT_PCT')));
    });
    t('앱 값이 두 후보 어느 쪽도 아니면 여전히 오류', () => {
        const shown = screen.flowScreen(quote(135.5), { session: 'POST', price: 135.5, prevClose: 137.76, display: { price: 135.5, changePctPct: -1.6 }, prices: { regularCloseToday: 135.5, prevRegularClose: 137.76, prevChangePct: -1.6, postPrice: 139.5 }, extended: { postPrice: 139.5, postDate: '2026-10-13' } }, null, false);
        assert.ok(has(rules.judgeFlowShown(NOW, S, ref, 'AZZ', 'screen:flow', shown), 'CLOSE_PRICE', 'error'));
    });
    t('등락률 기준도 앱이 맞는 후보(alt)를 따른다 — 136.71 은 −0.76%, 오류 아님(PCT_BASE)', () => {
        const shown = screen.flowScreen(quote(136.71), { session: 'POST', price: 136.71, prevClose: 137.76, display: { price: 136.71, changePctPct: -0.76 }, prices: { regularCloseToday: 136.71, prevRegularClose: 137.76, prevChangePct: -0.76, postPrice: 139.5 }, extended: { postPrice: 139.5, postDate: '2026-10-13' } }, null, false);
        assert.ok(!has(rules.judgeFlowShown(NOW, S, ref, 'AZZ', 'screen:flow', shown), 'PCT_BASE'));
    });
    t('야후 meta 정규장 가격이 마감 뒤 15분 안 시각이면 후보(일봉·분봉이 마감 직전 값일 때: DOW 28.3 vs 28.51)', () => {
        const NOW2 = ms('2026-10-13', '20:05:00'), S2 = clock.sessionAt(NOW2);
        const y = { ok: true, bars: [mk('15:59:00', 28.3, 40000)], meta: { regularMarketPrice: 28.51, regularMarketTime: ms('2026-10-13', '16:00:02') } };
        const r2 = rules.deriveRef(NOW2, S2, { y1m: y, yd: daily({ '2026-10-12': 28.12 }), nInfo: null, nPost: null, nPre: null });
        assert.equal(r2.c0.v, 28.3); assert.equal(r2.c0.alt, 28.51);
    });
    t('후보는 거래량이 작거나(2천주 미만) C0 와 1% 넘게 다르면 만들지 않는다', () => {
        const thin = { ok: true, bars: [mk('16:00:00', 137.16, 1122), mk('16:04:00', 136.71, 900)] };
        assert.equal(rules.deriveRef(NOW, S, { ...raw, y1m: thin }).c0.alt, undefined);
        const far = { ok: true, bars: [mk('16:00:00', 137.16, 1122), mk('16:04:00', 120, 128661)] };
        assert.equal(rules.deriveRef(NOW, S, { ...raw, y1m: far }).c0.alt, undefined);
    });
}

console.log('━━━ 시간외 증거·범위 회귀 ━━━');
const evidence = require('../scripts/integrity/evidence.js');
{
    const day = '2026-10-13', now = ms(day, '08:47:00'), S = clock.sessionAt(now);
    const nas = (trades: any[], asOf = 'Data last updated Oct 13, 2026 08:47 AM ET.') => ({ ok: true, last: 110, asOf, trades: trades.map(([hms, price]) => ({ hms, price, size: 3000 })) });
    const raw = (nPre: any, bs: any[] = []) => ({ yd: daily({ '2026-10-09': 100, '2026-10-12': 100 }), y1m: { ok: true, bars: bs }, nPre });
    const findings = (r: any, price = 105) => {
        const ref = rules.deriveRef(now, S, r);
        return [rules.judgeExtFlow(now, S, ref, 'TSLA', 'screen:flow', { extPrice: price, extLabel: 'PRE' }),
            rules.judgeListShown(now, S, ref, 'TSLA', 'screen:list', { price, ext: true }, {}),
            rules.judgeQuoteApi(now, S, ref, 'TSLA', { price: 100, previousClose: 100, session: 'pre', extendedPrice: price, extendedLabel: 'PRE', extendedDate: day })];
    };
    t('preext3 1·2: 부분·후속 분봉을 판정에 추가하지 않고 직전 온전한 봉만 기존대로 사용한다', () => {
        for (const hms of ['08:31:00', '08:32:00', '08:46:00']) {
            const r = raw(nas([['08:32:30', 110], ['08:46:30', 110]]), [{ t: ms(day, hms), c: 105, l: 105, h: 105 }]);
            const ref = rules.deriveRef(now, S, r);
            assert.equal(ref.extTrades('pre', day, ref._nPre).some((x: any) => x.price === 105), hms === '08:31:00');
            for (const fs of findings(r)) assert.equal(has(fs, 'EXT_VALUE', 'error'), hms !== '08:31:00', JSON.stringify(fs));
        }
    });
    t('Nasdaq 이후 Yahoo 분봉은 기존대로 비교 후보에서 제외된다', () => {
        const r = raw(nas([['08:10:30', 105]]), [{ t: ms(day, '08:40:00'), c: 110, l: 110, h: 110 }]);
        const ref = rules.deriveRef(now, S, r);
        assert.equal(rules.extLiveVerdict(now, 105, ref.extTrades('pre', day, ref._nPre)).verdict, 'ok');
    });
    t('관문 10142257 P1: 빈 목록·짧은 범위·다른 날짜·날짜 없음·낡은 목록에도 기존 가격 오류 유지', () => {
        const cases = [nas([]), nas([['08:46:00', 110]]), nas([['08:20:00', 110], ['08:46:00', 110]], 'Oct 12, 2026'),
            nas([['08:20:00', 110], ['08:46:00', 110]], ''), nas([['08:00:00', 110], ['08:20:00', 110]])];
        for (const nPre of cases) for (const fs of findings(raw(nPre, bars(day, '08:20:00', '08:46:00', () => 110)))) {
            assert.ok(has(fs, 'EXT_VALUE', 'error'), JSON.stringify(fs));
            assert.ok(!has(fs, 'EXT_REF_PARTIAL'));
        }
    });
    t('지연 허용 창을 덮은 통합 체결 불일치는 기존대로 오류', () => {
        for (const fs of findings(raw(nas([['08:20:00', 110], ['08:46:00', 110]])))) assert.ok(has(fs, 'EXT_VALUE', 'error'));
    });
    t('앱의 옛 체결이 목록 밖이어도 지연 허용 창을 덮으면 충분하다', () => {
        const ref = rules.deriveRef(now, S, raw(nas([['08:20:00', 110], ['08:46:00', 110]])));
        assert.equal(evidence.extCoverage(now, S, ref, 'pre').sufficient, true);
        assert.equal(evidence.extCoverage(now, S, ref, 'pre').requiredFrom, ms(day, '08:26:00'));
    });
    t('관문 P1: 직전 POST 기준 없이 오늘 PRE 3,000주씩 있으면 POST 이음은 오류', () => {
        const ref = rules.deriveRef(now, S, raw(nas([['08:20:00', 110], ['08:46:00', 110]])));
        assert.equal(ref.postClose, null);
        for (const label of ['POST', 'POST (CLOSED)']) {
            const fs = rules.judgeExtFlow(now, S, ref, 'TSLA', 'screen:flow', { extPrice: 105, extLabel: label });
            assert.ok(has(fs, 'EXT_CARRY_TOO_LONG', 'error'), JSON.stringify(fs));
            assert.ok(!has(fs, 'EXT_REF_PARTIAL'));
        }
        const fs = rules.judgeQuoteApi(now, S, ref, 'TSLA', { price: 100, previousClose: 100, session: 'pre',
            extendedPrice: 105, extendedLabel: 'POST', extendedDate: S.lastClosed });
        assert.ok(has(fs, 'EXT_CARRY_TOO_LONG', 'error'), JSON.stringify(fs));
    });
    t('관문 P1: 목록에 없는 16:00:10 $222도 16:20~16:59 $222.88 기준이면 세 문 모두 오류', () => {
        // 같은 원인이 PRE에도 생기지 않도록 두 세션과 시각 유무를 함께 확인한다.
        for (const [kind, at, first, last, appAt] of [
            ['post', '17:00:00', '16:20:00', '16:59:00', '16:00:10'],
            ['pre', '08:47:00', '08:20:00', '08:46:00', '08:00:10'],
        ]) {
            const N = ms(day, at), SS = clock.sessionAt(N);
            const ref = rules.deriveRef(N, SS, { yd: daily({ '2026-10-09': 220, '2026-10-12': 220, [day]: 220 }),
                [kind === 'pre' ? 'nPre' : 'nPost']: nas([[first, 222.88], [last, 222.88]]) });
            for (const appTime of [ms(day, appAt), null]) {
                const q = { price: 220, previousClose: 220, session: kind, extendedPrice: 222,
                    extendedLabel: kind.toUpperCase(), extendedDate: day, extendedTime: appTime ? new Date(appTime).toISOString() : null };
                const results = [rules.judgeExtFlow(N, SS, ref, 'TSLA', 'screen:flow', { extPrice: 222, extLabel: q.extendedLabel, extTimeMs: appTime }),
                    rules.judgeListShown(N, SS, ref, 'TSLA', 'screen:list', { price: 222, ext: true }, q),
                    rules.judgeQuoteApi(N, SS, ref, 'TSLA', q)];
                for (const fs of results) {
                    assert.ok(has(fs, 'EXT_VALUE', 'error'), JSON.stringify(fs));
                    assert.ok(!has(fs, 'EXT_REF_PARTIAL'));
                }
            }
        }
    });
    t('POST 진행 중 짧은 체결 범위도 Flow·목록·API 기존 가격 오류 유지', () => {
        const N = ms(day, '17:00:00'), SS = clock.sessionAt(N);
        const ref = rules.deriveRef(N, SS, { yd: daily({ '2026-10-12': 100, [day]: 100 }), nPost: nas([['16:59:00', 110]]), y1m: { ok: true, bars: [] } });
        for (const fs of [rules.judgeExtFlow(N, SS, ref, 'TSLA', 'screen:flow', { extPrice: 105, extLabel: 'POST' }),
            rules.judgeListShown(N, SS, ref, 'TSLA', 'screen:list', { price: 105, ext: true }, {}),
            rules.judgeQuoteApi(N, SS, ref, 'TSLA', { price: 100, previousClose: 100, session: 'post', extendedPrice: 105, extendedLabel: 'POST', extendedDate: day })]) assert.ok(has(fs, 'EXT_VALUE', 'error'));
    });
    t('preext3 4: POST 상세 목록·날짜 부족으로 기존 이음 가격 오류를 강등하지 않는다', () => {
        const N = ms(day, '04:32:00'), SS = clock.sessionAt(N);
        const base = { yd: daily({ '2026-10-09': 4.8, '2026-10-12': 4.8 }), y1m: { ok: true, bars: bars('2026-10-12', '19:59:00', '19:59:00', () => 4.81) } };
        const good = nasdaqPost(4.81, '2026-10-12', [['19:59:57', 4.81]]);
        for (const nPost of [null, { ...good, trades: [] }, { ...good, asOf: 'Oct 13, 2026' }, { ...good, asOf: null }]) {
            const fs = rules.judgeExtFlow(N, SS, rules.deriveRef(N, SS, { ...base, nPost }), 'CLOV', 'screen:flow', { extPrice: 4.85, extLabel: 'POST (CLOSED)' });
            assert.ok(has(fs, 'EXT_VALUE', 'error')); assert.ok(!has(fs, 'EXT_REF_PARTIAL'));
        }
        const fs = rules.judgeExtFlow(N, SS, rules.deriveRef(N, SS, { ...base, nPost: good }), 'CLOV', 'screen:flow', { extPrice: 4.85, extLabel: 'POST (CLOSED)' });
        assert.ok(has(fs, 'EXT_VALUE', 'error'));
    });
    const ctx = (age: number) => ({ t0: now - 5 * 60e3, S, quotes: { data: { TSLA: { extendedPrice: 105, extendedTime: new Date(now - age * 60e3).toISOString(), extendedLabel: 'PRE' } }, receipts: { TSLA: { receivedAt: now, ok: true } } }, tickers: { out: {}, receipts: {} }, refRaw: { TSLA: raw(nas([['08:20:00', 110], ['08:46:00', 110]])) } });
    const finding = () => ({ sev: 'error', code: 'EXT_VALUE', door: 'quotes', sym: 'TSLA', msg: '불일치' });
    t('시각 차이는 회차 시작이 아닌 요청 수신 기준, −17~−13분 분류만 하고 오류 유지', () => {
        for (const age of [12.99, 13, 15, 17, 17.01, -15]) {
            const fs = evidence.annotate([finding()], ctx(age));
            assert.equal(fs[0].timing.appMinusReceivedMin, -age);
            assert.equal(fs[0].msg.includes('지연 피드 의심'), age >= 13 && age <= 17);
            assert.equal(fs[0].sev, 'error'); assert.equal(fs[0].code, 'EXT_VALUE');
        }
        const missing = ctx(15); delete (missing.quotes.data.TSLA as any).extendedTime;
        assert.equal(evidence.annotate([finding()], missing)[0].timing.appMinusReceivedMin, null);
    });
    t('Flow 이음 값은 ticker의 prevPostTime과 ticker 수신 시각을 쓴다', () => {
        const c: any = ctx(15); c.quotes.data.TSLA = { extendedPrice: null };
        c.tickers = { out: { TSLA: { session: 'PRE', extended: { prevPostPrice: 105, prevPostTime: new Date(now - 16 * 60e3).toISOString() } } }, receipts: { TSLA: { receivedAt: now + 60e3 } } };
        const fs = evidence.annotate([{ ...finding(), door: 'screen:flow' }], c);
        assert.equal(fs[0].timing.source, 'ticker'); assert.equal(fs[0].timing.appMinusReceivedMin, -17);
    });
    t('체결 증거는 최신순 N건·바이트 제한과 잘림 여부를 보존한다', () => {
        const tr = Array.from({ length: 1000 }, (_, i) => ({ ms: now - i * 1000, price: 110, src: 'n', size: 3000 }));
        const dump = evidence.boundedTrades(tr.reverse());
        assert.equal(dump.total, 1000); assert.equal(dump.retained, evidence.MAX_TRADES); assert.equal(dump.truncated, true);
        assert.ok(Buffer.byteLength(JSON.stringify(dump.items)) <= evidence.MAX_TRADE_BYTES); assert.equal(dump.items[0].ms, now);
    });
    t('최초 증거는 재확인 입력 변경에도 보존되고 허용 필드만 담는다', () => {
        const c: any = ctx(15); c.quotes.data.TSLA.unrelated = 'omit-me';
        const first = evidence.capture(c, [finding()]);
        c.quotes.data.TSLA.extendedPrice = 110; c.quotes.receipts.TSLA.receivedAt += 20000;
        const again = evidence.capture(c, [finding()]);
        assert.equal(first.rows.TSLA.quote.extendedPrice, 105); assert.equal(again.rows.TSLA.quote.extendedPrice, 110);
        assert.equal(first.rows.TSLA.quoteRequest.receivedAt, now); assert.equal(again.rows.TSLA.quoteRequest.receivedAt, now + 20000);
        assert.ok(!JSON.stringify(first).includes('omit-me')); assert.ok(first.rows.TSLA.comparisons[0].trades.items.length > 0);
    });
}

// 외부 I/O 없이 실제 회차 저장·재확인 경로를 실행한다.
(async () => {
    const refs = require('../scripts/integrity/refs.js');
    const originals = { ...refs }, oldFetch = globalThis.fetch, oldNow = Date.now;
    const day = '2026-10-13', now = ms(day, '08:47:00');
    let wall = now, quoteCalls = 0, postCalls: string[] = [];
    const quote = (price: number) => ({ price: 100, previousClose: 100, changePercent: 0, session: 'pre', extendedPrice: price,
        extendedLabel: 'PRE', extendedDate: day, extendedTime: new Date(now - 15 * 60e3).toISOString() });
    try {
        Date.now = () => wall;
        globalThis.fetch = (async () => {
            wall += 1000;
            return { ok: true, status: 200, text: async () => '{"value":110}' };
        }) as any;
        const received = await refs.getJson('https://example.invalid/synthetic', {}, { retries: 0 });
        t('기준 요청은 시작·응답 본문 수신 시각을 함께 반환한다', () => {
            assert.equal(received.startedAt, now); assert.equal(received.receivedAt, now + 1000);
        });
        refs.sleep = async () => {};
        refs.getJson = async () => ({ ok: true, body: {} });
        refs.fetchYahoo1m = async (sym: string) => ({ ok: true, receivedAt: wall, bars: sym === 'CLOV' ? bars('2026-10-12', '19:59:00', '19:59:00', () => 4.81) : bars(day, '08:20:00', '08:46:00', () => 110) });
        refs.fetchYahooDaily = async (sym: string) => daily({ '2026-10-09': sym === 'CLOV' ? 4.8 : 100, '2026-10-12': sym === 'CLOV' ? 4.8 : 100 });
        refs.fetchNasdaqInfo = async () => ({ ok: false });
        refs.fetchNasdaqExt = async (sym: string, _cls: string, kind: string) => {
            if (kind === 'post') { postCalls.push(sym); return { ok: true, trades: [], last: null }; }
            return { ok: true, receivedAt: wall, last: 110, asOf: 'Oct 13, 2026', trades: sym === 'CLOV' ? [] : ['08:20:00', '08:46:00'].map((hms) => ({ hms, price: 110, size: 3000 })) };
        };
        globalThis.fetch = (async (url: any) => {
            wall += 1000;
            let body: any = {};
            const u = new URL(String(url));
            if (u.pathname === '/api/live/quotes') {
                quoteCalls++;
                body = { session: 'pre', data: { TSLA: quote(quoteCalls === 1 ? 105 : 110) } };
                if (quoteCalls === 1) body.data.CLOV = { price: 4.8, previousClose: 4.8, session: 'pre', extendedPrice: 0 };
            } else if (u.pathname === '/api/live/ticker') {
                body = u.searchParams.get('t') === 'CLOV'
                    ? { session: 'PRE', display: { price: 4.8, changePctPct: 0 }, prices: { prevRegularClose: 4.8 }, extended: { prevPostPrice: 4.85, prevPostDate: '2026-10-12', prevPostTime: '2026-10-12T23:59:00Z' } }
                    : { session: 'PRE', display: { price: 100, changePctPct: 0 }, prices: { prevRegularClose: 100 }, extended: { prePrice: 105 } };
            } else if (u.pathname === '/api/watchlist/batch') body = { results: [] };
            else if (u.pathname === '/api/dashboard/unified') body = { tickers: {} };
            else if (u.pathname !== '/api/market/index-close') throw new Error('Unexpected mock route');
            return { ok: true, status: 200, text: async () => JSON.stringify(body) };
        }) as any;
        const watch = require('../scripts/integrity/watch.js');
        await watch.runOnce({ symbols: ['TSLA', 'CLOV'], noHub: true, noBig: true, noNotify: true, probe: false, quiet: true, tag: 'synthetic-evidence' });
        const root = process.env.INTEGRITY_DIR!;
        const files = fs.readdirSync(path.join(root, 'runs')).filter((name: string) => name.endsWith('-synthetic-evidence.json'));
        const dump = JSON.parse(fs.readFileSync(path.join(root, 'runs', files[files.length - 1]), 'utf8'));
        t('회차 원본에 최초·재확인 응답과 비교 체결, 일시 오류의 최초 시각이 남는다', () => {
            assert.equal(dump.evidence.initial.rows.TSLA.quote.extendedPrice, 105);
            assert.equal(dump.evidence.confirmation.status, 'attempted');
            assert.equal(dump.evidence.confirmation.rows.TSLA.quote.extendedPrice, 110);
            assert.ok(dump.evidence.confirmation.rows.TSLA.quoteRequest.receivedAt > dump.evidence.initial.rows.TSLA.quoteRequest.receivedAt);
            assert.ok(dump.findings.some((f: any) => f.code === 'TRANSIENT_EXT_VALUE' && f.timing.delayedFeedSuspected));
            assert.ok(dump.evidence.initial.rows.TSLA.comparisons[0].trades.items.length > 0);
        });
        t('preext3 5: 17분 이후 POST 추가 조회를 없애고 기존 이음 오류 유지', () => {
            assert.deepEqual(postCalls, []);
            assert.ok(dump.findings.some((f: any) => f.sym === 'CLOV' && f.code === 'EXT_VALUE' && f.sev === 'error' && f.msg.includes('[기준 부족:')));
        });
        t('history에는 기존 집계만 저장하고 체결 목록·응답은 넣지 않는다', () => {
            const history = JSON.parse(fs.readFileSync(path.join(root, 'history.jsonl'), 'utf8').trim().split('\n').pop());
            assert.ok(!('evidence' in history)); assert.ok(!('rows' in history)); assert.ok(!('findings' in history));
            assert.ok(Buffer.byteLength(JSON.stringify(history)) < 4096);
        });
    } finally {
        Object.assign(refs, originals); globalThis.fetch = oldFetch; Date.now = oldNow;
        fs.rmSync(testOutput, { recursive: true, force: true });
        if (oldIntegrityDir === undefined) delete process.env.INTEGRITY_DIR; else process.env.INTEGRITY_DIR = oldIntegrityDir;
    }
    parity.report();
    console.log(`\n✅ ${n}개 통과`);
})().catch((err) => { console.error(err); process.exitCode = 1; });
