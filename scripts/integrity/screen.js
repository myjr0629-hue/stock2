'use strict';
/* ============================================================================
 * 데이터 무결성 감시기 — «화면이 실제로 계산하는 값» 재현
 *
 * 화면(Flow·Command·대시보드·내 종목·위젯 목록)은 API 값을 그대로 쓰지 않고 src/utils/calcPriceDisplay.ts 의 순수 함수로 다시 고른다.
 * MSTR 사고(10/12)도 API 한 필드가 아니라 «API 값 → calcPriceDisplay → 화면 숫자»의 끝에서 보였다.
 * 그래서 감시기는 그 함수를 «그대로» 읽어(타입스크립트 → 자바스크립트 변환, 앱 코드 수정 없음) 같은 입력으로 돌려 본다.
 *   · 함수가 바뀌면 다음 회차부터 바뀐 함수로 잰다(복사본을 따로 두지 않는다).
 *   · 못 읽으면(typescript 모듈 없음 등) null — 호출부가 «화면 재현 불가» 경고를 낸다(조용히 건너뛰지 않는다).
 * ========================================================================== */
const fs = require('fs');
const path = require('path');

const CALC_FILE = path.join(__dirname, '..', '..', 'src', 'utils', 'calcPriceDisplay.ts');
let _calc;

function loadCalc() {
    if (_calc !== undefined) return _calc;
    try {
        const ts = require('typescript');
        const src = fs.readFileSync(CALC_FILE, 'utf8');
        const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
        const mod = { exports: {} };
        new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
        _calc = typeof mod.exports.calcPriceDisplay === 'function' ? mod.exports : null;
    } catch { _calc = null; }
    return _calc;
}

const sessionKey = (s) => { const v = String(s || '').toLowerCase(); return v === 'regular' || v === 'reg' || v === 'rth' || v === 'open' || v === 'market' ? 'reg' : (v === 'pre' || v === 'post' || v === 'closed' ? v : null); };

/**
 * Flow·Command 큰 가격 영역 — src/app/[locale]/app-view/flow/page.tsx 의 calcPriceDisplay 호출과 같은 입력 매핑.
 *   quote   /api/live/quotes 의 그 종목(= 화면의 livePrice)
 *   ticker  /api/live/ticker 응답(= tickerData)
 *   ws      허브 틱 {price, changePct} 또는 null
 *   closedMarket  시장이 닫힘(주말·휴장·장외 closed)이면 true — 화면의 marketStatus.market === 'closed'
 */
function flowScreen(quote, ticker, ws, closedMarket) {
    const C = loadCalc(); if (!C) return null;
    if (!ticker) return null;
    const eff = closedMarket ? 'CLOSED' : String(ticker.session || 'CLOSED').toUpperCase();
    const lp = quote || {};
    const T = ticker;
    const r = C.calcPriceDisplay({
        livePrice: (ws && ws.price) || lp.price,
        liveChangePct: (ws && ws.changePct) || lp.changePercent,
        liveExtPrice: lp.extendedPrice,
        liveExtChangePct: lp.extendedChangePercent,
        liveExtLabel: lp.extendedLabel ? (eff === 'CLOSED' ? `${lp.extendedLabel} (CLOSED)` : lp.extendedLabel) : undefined,
        liveExtKind: lp.extendedKind,
        liveExtTime: lp.extendedTime,
        apiDisplayPrice: (T.display && T.display.price) || T.price || 0,
        apiDisplayChangePct: (T.display && T.display.changePctPct) || (typeof T.changePct === 'number' ? T.changePct * 100 : 0) || 0,
        session: eff,
        prevRegularClose: (T.prices && T.prices.prevRegularClose) || T.prevClose || null,
        prevClose: T.prevClose || null,
        regularCloseToday: (T.prices && T.prices.regularCloseToday) || undefined,
        prevChangePct: T.prices && T.prices.prevChangePct,
        fallbackChangePct: (T.display && T.display.changePctPct) || 0,
        lastTrade: (T.prices && T.prices.lastTrade) || T.price || 0,
        extended: T.extended || {},
        prices: T.prices || {},
    });
    return { kind: 'flow', session: eff, price: r.displayPrice, pct: r.displayChangePct, extPrice: r.activeExtPrice, extLabel: r.activeExtLabel, extPct: r.activeExtPct, extPctKnown: r.activeExtPctKnown, extAsOf: r.activeExtAsOf, carry: r.activeExtCarry };
}

/** 대시보드·내 종목·위젯 목록 «한 숫자» — oneNumberFromQuote(q, 세션) */
function listScreen(quote, session) {
    const C = loadCalc(); if (!C || !quote) return null;
    const s = sessionKey(session || quote.session);
    const r = C.oneNumberFromQuote(quote, s);
    if (!r) return { kind: 'list', session: s, price: null, pct: null, ext: false };
    return { kind: 'list', session: s, price: r.price, pct: r.changePct, ext: r.ext };
}

module.exports = { loadCalc, flowScreen, listScreen, sessionKey, CALC_FILE };
