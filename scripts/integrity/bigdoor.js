'use strict';
/* ============================================================================
 * 31개 이상 한 요청 문(/api/live/quotes?symbols=31개+) 판정 — 순수 함수 (시험: tests/integrityBigDoor.test.ts)
 *
 * 이 문의 일은 «경로가 달라도 값은 같은 규칙을 지키는가»다(벌크 경로가 호가 중간값·묵은 CSV 를 내던 사고, 10/13).
 * 10/14 보강 두 가지 (수리 뒤 첫 회차들에서 나온 잔여 오류 두 부류에 대한 계측 정리 — 규칙 완화가 아니라 «문 단위 귀속»):
 *   1) 같은 피드 편차: 31개 문이 기준과 어긋나도 «30개 이하 목록 문(앱·위젯·내 종목이 쓰는 경로)»이 같은 종목에서 같은 오류면
 *      그건 문 경로 결함이 아니라 공급사 피드(단일 거래소 체결이 드문 종목의 마지막 체결) 편차다 — 목록 문의 LIVE_PRICE 가 따로 오류로 보고한다.
 *      31개 문에서는 info(QUOTES_OVER30_SAMEFEED)로만 남긴다(보이게 두되 같은 원인을 두 번 세지 않는다). 목록 문은 맞는데 31개 문만 틀린 종목은 그대로 오류.
 *   2) 확인 재조회: 다른 문의 오류는 20초 뒤 다시 읽어 살아남을 때만 오류인데, 이 문은 심볼이 없어 재조회 대상이 아니었다(빠르게 움직이는 종목의 일시 어긋남이 오류로 남았다).
 * ========================================================================== */
const rules = require('./rules');
const screen = require('./screen');

const PRICE_CODES = /PRICE|PCT|CLOSE|LIVE|EXT_VALUE|EXT_LAG/;
const EXT_CODES = /EXT_VALUE|EXT_LAG/;

/** 한 문의 한 종목 응답 q → 가격 관련 오류들. 시간외 값 비교는 호가 중간값 때문에 0.5% 안 차이를 호가 폭으로 본다(GME 27.105 vs 27.04). */
function doorErrors(now, S, ref, s, q, door) {
    const fs_ = [...rules.judgeQuoteApi(now, S, ref, s, q, door)];
    const ls = screen.listScreen(q, q.session || S.session);
    if (ls) fs_.push(...rules.judgeListShown(now, S, ref, s, door, ls, q));
    return fs_.filter((f) => f.sev === 'error' && PRICE_CODES.test(f.code)
        && !(EXT_CODES.test(f.code) && Number(f.app) > 0 && Number(f.ref) > 0 && Math.abs(Number(f.app) - Number(f.ref)) / Number(f.ref) <= 0.005));
}

/**
 * @param {object} a
 *   now, S           시각·세션(clock.sessionAt)
 *   list             31개 요청의 심볼
 *   data             31개 요청 응답 data
 *   listData         30개 이하 목록 문 응답 data (없으면 같은 피드 판정을 건너뛴다)
 *   refOf(sym)       기준(rules.deriveRef 결과)
 *   nasdaqPrint(sym, session)  시간외 거래 드문 종목 판정용 나스닥 체결(없어도 됨)
 *   only             이 종목들만 판정(확인 재조회용)
 * @returns {{bad: Array<{s:string,f:object}>, carry: string[], sameFeed: Array<{s:string,f:object}>}}
 */
function judgeBig(a) {
    const { now, S, list, data, listData, refOf, nasdaq, only } = a;
    const bad = [], carry = [], sameFeed = [];
    for (const s of list) {
        if (only && !only.includes(s)) continue;
        const q = data[s]; if (!q) continue;
        const ref = refOf(s);
        const errs = doorErrors(now, S, ref, s, q, 'quotes>30');
        if (!errs.length) continue;
        // 새 세션 첫 17분 — 31개 경로의 호가 중간값 캐시가 아직 직전 세션 값이다(공급사 갱신 지연 · 오류 아님) — 끝나고도 낡으면 오류
        const carryWin = (S.session === 'pre' || S.session === 'post') && S.sinceBoundary < rules.DELAY_WINDOW_S;
        // 체결이 드문 종목(그 세션 시간외 거래대금 2천만 달러 미만)은 호가 중간값과 체결이 크게 벌어진다 — 31개 경로의 시간외 값 비교에서 뺀다
        const nx = nasdaq ? nasdaq(s, S.session) : null;
        const px0 = Number(q && q.price) || 0;
        const illiquid = !!(nx && nx.ok && Number(nx.volume) > 0 && Number(nx.volume) * px0 < 20e6);
        const onlyExt = errs.every((f) => EXT_CODES.test(f.code));
        if (illiquid && onlyExt) continue;
        if (carryWin && onlyExt) { carry.push(s); continue; }
        // 같은 피드 편차 — 목록 문(30개 이하)이 같은 종목에서 같은 오류면 문 경로 결함이 아니다
        const lq = listData && listData[s];
        if (lq && doorErrors(now, S, ref, s, lq, 'quotes').length) { sameFeed.push({ s, f: errs[0] }); continue; }
        bad.push({ s, f: errs[0] });
    }
    return { bad, carry, sameFeed };
}

/** judgeBig 결과 → findings (감시기 형식) */
function toFindings(v, total) {
    const out = [];
    if (v.carry.length) out.push({ sev: 'delay', code: 'QUOTES_OVER30_CARRY', door: 'quotes>30', sym: null, field: 'ext', app: v.carry.length, ref: total, msg: `31개 이상 요청: 새 세션 첫 17분 — ${v.carry.length}종목 시간외 값이 직전 세션 호가 중간값(공급사 갱신 지연)` });
    if (v.bad.length) out.push({ sev: 'error', code: 'QUOTES_OVER30', door: 'quotes>30', sym: null, field: 'price', app: v.bad.length, ref: total, syms: v.bad.map((b) => b.s), msg: `/api/live/quotes 를 31개 이상 한 요청에 보내면 ${v.bad.length}/${total}종목 값이 틀린다 — 예: ${v.bad.slice(0, 4).map((b) => `${b.s} ${b.f.app}≠${b.f.ref}`).join(', ')}` });
    if (v.sameFeed.length) out.push({ sev: 'info', code: 'QUOTES_OVER30_SAMEFEED', door: 'quotes>30', sym: null, field: 'price', app: v.sameFeed.length, ref: total, msg: `31개 이상 요청: ${v.sameFeed.length}종목은 30개 이하 목록 문도 같은 값으로 기준과 어긋난다 — 공급사 피드 편차(문 경로 문제 아님 · 목록 문이 따로 보고) — 예: ${v.sameFeed.slice(0, 4).map((b) => `${b.s} ${b.f.app}≠${b.f.ref}`).join(', ')}` });
    return out;
}

module.exports = { judgeBig, toFindings, doorErrors };
