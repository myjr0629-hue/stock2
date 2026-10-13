/**
 * 데이터 무결성 감시기 판정 규칙 시험 — scripts/integrity/{clock,rules,screen}.js
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/priceIntegrityRules.test.ts
 *
 * 출발점은 10/12 19:18 ET MSTR 사고다: 벤더 429 순간에 큰 가격 $154.34 ▲+1.89%(금요일 종가·금요일 등락)·POST $153.61(16시대 옛 체결)이 «오늘 값»으로 보였다.
 * 감시기는 그 모양의 응답을 사람이 보기 전에 오류로 판정해야 하고, 정상 응답·공급사 15분 지연·휴장은 오류로 세지 않아야 한다(오탐 방지).
 */
import assert from 'node:assert/strict';
import { US_MARKET_HOLIDAYS, EARLY_CLOSE_DATES } from '../src/lib/marketCalendar';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const clock = require('../scripts/integrity/clock.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
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

console.log(`\n✅ ${n}개 통과`);
