'use strict';
/* ============================================================================
 * 데이터 무결성 감시기 — 판정 규칙 (순수 함수 · 네트워크 없음 · 시험 대상)
 *
 * 입력은 «지금 시각 + 진짜 세션(clock.sessionAt) + 기준값 묶음(ref) + 앱 값»이고 출력은 판정 목록(findings)이다.
 *   sev  error   앱이 틀린 값을 보인다(사람이 보기 전에 알려야 한다)
 *        warn    의심스럽지만 기준이 불확실하거나 한 번 더 봐야 한다(다음 회차에도 같으면 error 로 올린다)
 *        delay   공급사 15분 지연으로 설명되는 차이 — 오류가 아니다(따로 센다)
 *        info    오류 아님 — 사유 표시(분할·거래 정지·기준 불일치·체결 없음)
 *
 * 세션별 규칙표(MSTR 사고 10/12 + 2026-09-18·09-25·10-05 사고 이력 기준):
 *   C0 = 마지막으로 끝난 정규장(장중·프리엔 직전 거래일, 16:00 뒤엔 오늘) · C1 = C0 바로 앞 거래일
 *   REG     큰 가격 = 지금가(15분 지연 없음) · 등락 = 지금가 vs C0 종가 · 시간외 칸 = 오늘 PRE CLOSE(09:30~09:47 잠정)
 *   POST    큰 가격 = 오늘 정규장 종가(C0) · 등락 = C0 vs C1 · 시간외 칸 = 오늘 애프터 체결(15분 지연 허용, 첫 15분은 PRE CLOSE 이음)
 *   CLOSED  큰 가격 = C0 종가 · 등락 = C0 vs C1 · 시간외 칸 = C0 의 애프터 종가(통합 테이프 마지막 Form T)
 *   PRE     큰 가격 = C0 종가 · 등락 = C0 vs C1 · 시간외 칸 = 오늘 프리 체결(15분 지연 허용, 첫 15분은 C0 POST 이음)
 *   주말·휴장 = CLOSED 와 같다(C0 = 마지막 거래일)
 *   0·null·음수·전날 값 재사용 = 오류 · 등락률은 두 가격으로 다시 계산한 값과 같아야 한다
 * ========================================================================== */
const { etParts, etToMs, windowOf, shiftDate } = require('./clock');

// ── 허용 오차 ───────────────────────────────────────────────────────────────
const tolClose = (p) => Math.max(0.011, p * 0.0002);        // 공식 종가(센트 반올림)
const tolExt = (p) => Math.max(0.02, p * 0.0015);           // 시간외 체결 대조(체결 흔들림)
const tolLive = (p) => Math.max(0.02, p * 0.0025);          // 정규장 지금가(1분봉 시차)
const TOL_PCT = 0.03;                                       // 등락률 %p
const EXT_DELAY_MS = 15 * 60 * 1000;                        // 공급사 시간외 지연
const EXT_DELAY_SLACK_MS = 6 * 60 * 1000;                   // 우리 수신·야후 분봉 시차
const BOUNDARY_GRACE_S = 90;
const OPEN_PROVISIONAL_S = 18 * 60;                         // 09:30~09:48 — PRE CLOSE 잠정(확정 09:47)
const DELAY_WINDOW_S = 17 * 60 + 30;                        // 세션 시작 뒤 첫 17분 — 지연 피드가 아직 새 세션 체결을 못 줬다

const pos = (x) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null);
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const rel = (a, b) => (b ? Math.abs(a - b) / Math.abs(b) : Infinity);
const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol;
const pctOf = (p, base) => (pos(p) && pos(base) ? ((p - base) / base) * 100 : null);
const r2 = (x) => (typeof x === 'number' ? Math.round(x * 10000) / 10000 : x);
const nearBoundary = (S) => S.sinceBoundary < BOUNDARY_GRACE_S || S.toBoundary < BOUNDARY_GRACE_S;

const F = (sev, code, door, sym, field, app, ref, msg) => ({ sev, code, door, sym, field, app: r2(app), ref: r2(ref), msg });

// ═══════════════════════════════════════════════════════════════════════════
// 기준값 만들기 — 야후·나스닥 원자료 → 판정이 쓰는 모양
// ═══════════════════════════════════════════════════════════════════════════
const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
/** "Oct 12, 2026" · "Data last updated Oct 12, 2026 08:00 PM ET." → '2026-10-12' */
function parseEnDate(s) {
    const m = /([A-Z][a-z]{2})[a-z]*\.? (\d{1,2}), (\d{4})/.exec(String(s || ''));
    return m && MONTHS[m[1]] ? `${m[3]}-${String(MONTHS[m[1]]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}` : null;
}

/**
 * raw = { y1m, yd, nInfo, nPre, nPost }  (각각 refs.js 결과 또는 null)
 * 반환 ref:
 *   ok         가격 판정에 쓸 기준이 하나라도 있다
 *   c0, c1     C0·C1 공식 종가 값(야후 일봉 우선, 나스닥 보조) · c0.conflict = 두 기준이 다르다
 *   live       정규장 «지금가» 기준 {price, ms, band:[lo,hi], n}  (정규장 + 최근 봉이 있을 때)
 *   preClose   오늘 프리마켓 마지막 체결(PRE CLOSE) {price, ms}
 *   postClose  C0 날짜 애프터 마지막 체결 {price, ms, src}
 *   ext(kind,date)  그 세션 체결 목록 [{ms, price, src}] 최신순
 *   events     최근 분할·배당(분할이면 종가 비교를 건너뛴다)
 */
function deriveRef(now, S, raw) {
    const y1 = raw && raw.y1m && raw.y1m.ok ? raw.y1m : null;
    const yd = raw && raw.yd && raw.yd.ok ? raw.yd : null;
    const ni = raw && raw.nInfo && raw.nInfo.ok ? raw.nInfo : null;
    const nPre = raw && raw.nPre && raw.nPre.ok ? raw.nPre : null;
    const nPost = raw && raw.nPost && raw.nPost.ok ? raw.nPost : null;
    const bars = y1 ? y1.bars : [];
    const ref = { ok: false, c0: null, c1: null, live: null, preClose: null, postClose: null, events: [], notes: [], sources: { y1m: !!y1, yd: !!yd, nInfo: !!ni, nPre: !!nPre, nPost: !!nPost } };

    // ── 공식 종가 ──
    const by = {};
    if (yd) for (const d of yd.daily) by[d.date] = d.c;
    const c0y = pos(by[S.lastClosed]), c1y = pos(by[S.prevClosed]);
    const stampDate = ni ? parseEnDate(ni.stamp) : null;
    const nasdaqClosed = ni && pos(ni.price) && stampDate === S.lastClosed && !/open/i.test(String(ni.status || '')) ? ni.price : null;
    // 장중이 아닌데 나스닥이 «오늘 날짜» 체결을 주면 그것이 C0 다(마감 직후 야후 일봉 확정 전). 장중엔 쓰지 않는다.
    const c0n = nasdaqClosed;
    // 야후 일봉 종가가 비는 종목(거래 직후 확정 전·초저가주)을 위한 세 번째 눈: 그 날짜 정규장 마지막 1분봉 종가
    const regLast = (() => { const b = bars.filter((x) => windowOf(x.t, S.lastClosed) === 'regular'); return b.length ? b[b.length - 1] : null; })();
    const c0b = regLast ? pos(regLast.c) : null;
    if (c0y || c0n || c0b) {
        let v, conflict = false;
        if (c0y) { v = c0y; conflict = !!(c0n && Math.abs(c0y - c0n) > tolClose(c0y) && !(c0b && Math.abs(c0y - c0b) <= Math.max(0.02, c0y * 0.002))); }
        else if (c0n && c0b) { if (Math.abs(c0n - c0b) / c0b < 0.01) v = c0n; else { v = c0b; conflict = true; } }   // 나스닥이 낡은 종목(NCPL 10/13) — 분봉을 따른다
        else v = c0n || c0b;
        ref.c0 = { v, y: c0y, n: c0n, b: c0b, conflict };
    }
    if (c1y) ref.c1 = { v: c1y };
    // 마감 직후 5분은 야후 일봉이 확정 전일 수 있다
    ref.c0settling = S.session === 'post' && S.today === S.lastClosed && S.sinceBoundary < 5 * 60;

    // ── 이벤트(분할·배당) — C1 이후에 있으면 종가 비교의 의미가 달라진다 ──
    if (yd) ref.events = yd.events.filter((e) => e.date > S.prevClosed && e.date <= S.today);

    // ── 분봉: 세션 창별 ──
    const _bw = new Map();
    const byWin = (win, date) => { const k = `${win}|${date}`; let v = _bw.get(k); if (!v) { v = bars.filter((b) => windowOf(b.t, date) === win); _bw.set(k, v); } return v; };
    const regToday = S.tradingToday ? byWin('regular', S.today) : [];
    const preToday = S.tradingToday ? byWin('pre', S.today) : [];
    const lastBar = bars.length ? bars[bars.length - 1] : null;
    ref.lastBar = lastBar;

    if (S.session === 'regular' && regToday.length) {
        const last = regToday[regToday.length - 1];
        const tail = regToday.filter((b) => b.t >= last.t - 4 * 60e3);
        ref.live = {
            price: last.c, ms: last.t, ageMs: now - last.t,
            band: [Math.min(...tail.map((b) => b.l)), Math.max(...tail.map((b) => b.h))],
            nasdaq: ni && pos(ni.price) && stampDate === S.today ? ni.price : null,
        };
    }
    // ── 시간외 체결 목록 ──
    const extTrades = (kind, date, nas) => {
        const list = [];
        for (const b of byWin(kind === 'pre' ? 'pre' : 'post', date)) list.push({ ms: b.t, price: b.c, lo: b.l, hi: b.h, src: 'y' });
        if (nas && nas.trades) {
            const asOfDate = parseEnDate(nas.asOf);
            // 나스닥 쪽 날짜가 기대 날짜가 아니면(다음 세션 시작 전 낡은 페이지) 쓰지 않는다
            if (!asOfDate || asOfDate === date) {
                for (const t of nas.trades) {
                    const ms = etToMs(date, t.hms);
                    if (windowOf(ms, date) === (kind === 'pre' ? 'pre' : 'post') || (kind === 'post' && /^(1[6-9]|20):/.test(t.hms))) list.push({ ms, price: t.price, lo: t.price, hi: t.price, src: 'n', size: t.size });
                }
            }
        }
        // 같은 분·같은 가격의 야후 분봉 항목은 나스닥 체결(단주 크기 정보가 있다)과 중복이다 — 크기를 모르는 항목이 «단주뿐인가» 판정을 가리지 않게 뺀다
        const nasList = list.filter((x) => x.src === 'n');
        const dedup = list.filter((x) => !(x.src === 'y' && nasList.some((n) => n.ms >= x.ms && n.ms < x.ms + 60e3 && Math.abs(n.price - x.price) <= Math.max(0.011, x.price * 0.0005))));
        return dedup.sort((a, b) => b.ms - a.ms);
    };
    const _et = new Map();
    ref.extTrades = (kind, date, nas) => { const k = `${kind}|${date}|${nas === nPre ? 'pre' : nas === nPost ? 'post' : 'x'}`; let v = _et.get(k); if (!v) { v = extTrades(kind, date, nas); _et.set(k, v); } return v; };
    ref._nPre = nPre; ref._nPost = nPost;

    // PRE CLOSE: 오늘 프리 마지막 체결(통합 통계는 나스닥 쪽이 정의와 같다)
    if (S.tradingToday) {
        const t = extTrades('pre', S.today, nPre);
        const nl = nPre && pos(nPre.last) && (!parseEnDate(nPre.asOf) || parseEnDate(nPre.asOf) === S.today) ? nPre.last : null;
        if (t.length || nl) ref.preClose = { price: nl || t[0].price, ms: t.length ? t[0].ms : null, trades: t };
    }
    // POST CLOSE: C0 애프터 마지막 체결 — 나스닥 "After-Hours Consolidated Last Trade"
    {
        const t = extTrades('post', S.lastClosed, nPost);
        const nasLastOk = nPost && pos(nPost.last) && (!parseEnDate(nPost.asOf) || parseEnDate(nPost.asOf) === S.lastClosed || S.session === 'post');
        const yPost = byWin('post', S.lastClosed);
        const yLast = yPost.length ? yPost[yPost.length - 1] : null;
        if (nasLastOk || yLast) ref.postClose = { price: nasLastOk ? nPost.last : yLast.c, ms: t.length ? t[0].ms : null, src: nasLastOk ? 'n' : 'y', trades: t, yPrice: yLast ? yLast.c : null };
    }
    ref.ok = !!(ref.c0 || ref.live);
    return ref;
}

// ═══════════════════════════════════════════════════════════════════════════
// 부분 규칙
// ═══════════════════════════════════════════════════════════════════════════

/** 정규장 지금가가 기준 밴드 안인가 → {dev, level} */
function liveDev(price, live) {
    const dBand = price >= live.band[0] && price <= live.band[1] ? 0 : (price < live.band[0] ? (live.band[0] - price) / price : (price - live.band[1]) / price);
    const dNas = live.nasdaq ? rel(price, live.nasdaq) : Infinity;
    const dLast = rel(price, live.price);
    return Math.min(dBand, dNas, dLast);
}

/**
 * 시간외 값 대조(프리/애프터 진행 중) — 공급사 15분 지연을 «허용»한다.
 *   값이 [지금−(15분+6분), 지금] 사이 어느 체결과 같으면 정상 · 더 오래된 체결과만 같으면 지연 초과(error) ·
 *   체결이 21분 넘게 없었던 비유동 종목은 마지막 체결과 같으면 정상.
 * 반환 { verdict: 'ok'|'lag'|'stale'|'nomatch'|'noref', matchAgeMin?, lastAgeMin? }
 */
const isOdd = (t) => t.size > 0 && t.size < 100;   // 단주(100주 미만) — 공급사 지연 피드의 «마지막 체결»에 안 들어가는 종목이 있다(CLOV·DPZ 10/13 프리)
function extLiveVerdict(now, price, trades) {
    if (!trades || !trades.length) return { verdict: 'noref' };
    const tol = tolExt(price);
    // 지연 피드는 «15분 전의 상태»를 준다 — 값은 [그 상태 이후의 모든 체결] 또는 [그 상태 시점의 마지막 체결(체결이 드문 종목은 한참 전 것)] 중 하나여야 한다
    const stateLo = now - EXT_DELAY_MS - 4 * 60e3;
    const later = trades.filter((t) => t.ms > stateLo);
    const carry = trades.find((t) => t.ms <= stateLo);                      // trades 는 최신순 — 첫 번째 = 그 시점 이전의 마지막 체결
    const cands = carry ? [...later, carry] : later;
    const hit = (t) => Math.abs(t.price - price) <= tol || (price >= t.lo - tol && price <= t.hi + tol && t.src === 'y');
    if (cands.some(hit)) return { verdict: 'ok' };
    const latest = trades[0];
    // 지연 피드가 «이미 담았어야 할» 체결(15분 전까지) 가운데 앱 값보다 새로운 것이 단주뿐이면 오류가 아니다
    const older = trades.find((t) => Math.abs(t.price - price) <= tol);
    const expected = trades.filter((t) => t.ms <= now - EXT_DELAY_MS + 3 * 60e3 && (!older || t.ms > older.ms));
    if (expected.length && expected.every(isOdd)) return { verdict: 'oddlot', lastAgeMin: Math.round((now - latest.ms) / 60000) };
    if (older) return { verdict: 'stale', matchAgeMin: Math.round((now - older.ms) / 60000), lastAgeMin: Math.round((now - latest.ms) / 60000) };
    return { verdict: 'nomatch', lastAgeMin: Math.round((now - latest.ms) / 60000) };
}

const unverifiedWhy = (ref) => (!ref.ok ? '기준 시세를 못 읽음' : null);

// ═══════════════════════════════════════════════════════════════════════════
// ① API 불변식 — /api/live/quotes 한 종목 (위젯·내 종목·대시보드가 읽는 원본)
// ═══════════════════════════════════════════════════════════════════════════
function judgeQuoteApi(now, S, ref, sym, q, door = 'quotes') {
    const out = [];
    if (!q || q.error) { out.push(F('error', 'NO_QUOTE', door, sym, 'row', null, null, `시세 행 없음${q && q.error ? ` (${q.error})` : ''}`)); return out; }
    const price = num(q.price), prev = num(q.previousClose ?? q.prevClose);
    // 0·null·음수
    if (!pos(price)) out.push(F('error', 'NUM_INVALID', door, sym, 'price', price, null, '가격이 0/null/음수'));
    if (!pos(prev)) out.push(F('error', 'NUM_INVALID', door, sym, 'previousClose', prev, null, '전일 종가가 0/null/음수'));
    if (q.extendedPrice != null && (!Number.isFinite(Number(q.extendedPrice)) || Number(q.extendedPrice) < 0)) out.push(F('error', 'NUM_INVALID', door, sym, 'extendedPrice', q.extendedPrice, null, '시간외 가격이 음수/NaN'));
    if (q.changePercent !== null && q.changePercent !== undefined && !Number.isFinite(Number(q.changePercent))) out.push(F('error', 'NUM_INVALID', door, sym, 'changePercent', q.changePercent, null, '등락률 NaN'));
    if (!pos(price) || !pos(prev)) return out;

    // 세션 라벨
    const appSess = String(q.session || '').toLowerCase();
    const wantSess = S.session;
    if (appSess !== wantSess) {
        out.push(nearBoundary(S)
            ? F('info', 'SESSION_BOUNDARY', door, sym, 'session', appSess, wantSess, `세션 경계(±${BOUNDARY_GRACE_S}초) — 앱 ${appSess} / 시계 ${wantSess}`)
            : F('error', 'SESSION_MISMATCH', door, sym, 'session', appSess, wantSess, `앱 세션 «${appSess}» ≠ 시계·달력 «${wantSess}»`));
    }
    // 등락률 = 두 가격으로 다시 계산한 값
    const sessEff = appSess;
    const pct = num(q.changePercent);
    if (pct != null) {
        const re = pctOf(price, prev);
        if (re != null && Math.abs(re - pct) > TOL_PCT) out.push(F('error', 'PCT_SELF', door, sym, 'changePercent', pct, re, `등락률 ${r2(pct)} ≠ (가격−전일)/전일 ${r2(re)}`));
    }
    // 시간외 칸 불변식
    const ext = pos(num(q.extendedPrice));
    const lab = String(q.extendedLabel || '');
    if (ext) {
        const wantLab = (S.session === 'regular' || S.session === 'pre') ? 'PRE' : 'POST';
        if (lab !== wantLab && !nearBoundary(S)) out.push(F('error', 'EXT_LABEL', door, sym, 'extendedLabel', lab, wantLab, `${S.session} 세션인데 시간외 라벨이 «${lab}» (기대 «${wantLab}»)`));
        const wantDate = (S.session === 'regular' || S.session === 'pre' || S.session === 'post') ? S.today : S.lastClosed;
        if (q.extendedDate && q.extendedDate !== wantDate && !nearBoundary(S)) out.push(F('error', 'EXT_DATE', door, sym, 'extendedDate', q.extendedDate, wantDate, `시간외 값 날짜 ${q.extendedDate} ≠ 기대 ${wantDate} (지난 날짜 값)`));
        if (!q.extendedDate) out.push(F('warn', 'EXT_DATE_MISSING', door, sym, 'extendedDate', null, wantDate, '시간외 값에 날짜가 없다'));
        // 시간외 등락률 = 두 가격
        const base = (lab === 'PRE' && S.session !== 'pre') ? prev : price;   // 정규장 중 PRE CLOSE 는 전일 종가 대비, 그 밖엔 가격(C0 종가) 대비
        const reE = pctOf(ext, base);
        const gotE = num(q.extendedChangePercent);
        if (reE != null && gotE != null && Math.abs(reE - gotE) > TOL_PCT) out.push(F('error', 'EXT_PCT_SELF', door, sym, 'extendedChangePercent', gotE, reE, `시간외 등락률 ${r2(gotE)} ≠ 두 가격 계산 ${r2(reE)}`));
        // 체결 시각이 세션 창 안인가
        if (q.extendedTime && q.extendedDate) {
            const tms = Date.parse(q.extendedTime);
            if (Number.isFinite(tms)) {
                if (tms > now + 60e3) out.push(F('error', 'EXT_TIME_FUTURE', door, sym, 'extendedTime', q.extendedTime, null, '시간외 체결 시각이 미래'));
                else {
                    const w = windowOf(tms, q.extendedDate);
                    const okWin = lab === 'PRE' ? w === 'pre' : (w === 'post' || /^(1[6-9]|20):/.test(etParts(tms).hms));
                    if (!okWin && !nearBoundary(S)) out.push(F('error', 'EXT_TIME_WINDOW', door, sym, 'extendedTime', q.extendedTime, null, `${lab} 값의 체결 시각 ${etParts(tms).hms} ET 가 ${lab} 창 밖`));
                }
            }
        }
    }
    // 시간외 값 자체를 기준과 대조 — 화면 모델(Flow)이 아닌 종목도, 위젯·내 종목이 읽는 원본 값이 맞아야 한다
    if (ref && ref.ok && pos(price) && !q.error) {
        const lab2 = !ext ? '' : (S.session === 'regular' ? 'PRE CLOSE' : (S.session === 'closed' ? 'POST (CLOSED)' : lab));
        out.push(...judgeExtFlow(now, S, ref, sym, door, { extPrice: ext || 0, extLabel: lab2, extPct: num(q.extendedChangePercent), extPctKnown: false, apiOnly: true }));
    }
    return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// ② 화면 값 판정 — screen.flowScreen / listScreen 결과 vs 기준
// ═══════════════════════════════════════════════════════════════════════════

/** 시간외 칸 판정(Flow). shown = {extPrice, extLabel, extPct, carry} */
function judgeExtFlow(now, S, ref, sym, door, shown) {
    const out = [];
    const ext = pos(shown.extPrice), lab = String(shown.extLabel || '');
    const c0 = ref.c0 && ref.c0.v;
    const delayWin = (S.session === 'pre' || S.session === 'post') && S.sinceBoundary < DELAY_WINDOW_S;
    const sess = S.session;

    // ─ 정규장: 오늘 PRE CLOSE ─
    if (sess === 'regular') {
        const pc = ref.preClose;
        if (!ext) {
            if (pc && pc.price) out.push(F(S.sinceBoundary < OPEN_PROVISIONAL_S ? 'delay' : 'warn', 'EXT_MISSING', door, sym, 'extPrice', null, pc.price, `PRE CLOSE 칸이 비었다(기준 PRE ${r2(pc.price)})`));
            return out;
        }
        if (lab !== 'PRE CLOSE') out.push(F('error', 'EXT_LABEL', door, sym, 'extLabel', lab, 'PRE CLOSE', `정규장인데 시간외 칸 이름이 «${lab}»`));
        if (!pc) out.push(F('info', 'EXT_UNVERIFIED', door, sym, 'extPrice', ext, null, '기준에 오늘 프리 체결이 없다(PRE CLOSE 대조 불가)'));
        else {
            const ok = near(ext, pc.price, tolExt(ext));
            if (!ok) {
                // 개장 직후 잠정값: 지연 피드의 프리 체결 중 하나면 정상
                const prov = S.sinceBoundary < OPEN_PROVISIONAL_S && pc.trades.some((t) => near(ext, t.price, tolExt(ext)));
                out.push(prov ? F('delay', 'EXT_PROVISIONAL', door, sym, 'extPrice', ext, pc.price, 'PRE CLOSE 잠정값(확정 09:47 ET 전) — 지연 피드의 프리 체결')
                    : F('error', 'EXT_VALUE', door, sym, 'extPrice', ext, pc.price, `PRE CLOSE ${r2(ext)} ≠ 기준 오늘 프리 마지막 체결 ${r2(pc.price)}`));
            }
        }
    }
    // ─ 프리마켓 진행 중 ─
    else if (sess === 'pre') {
        const trades = ref.extTrades('pre', S.today, ref._nPre);
        if (lab === 'POST (CLOSED)' || lab === 'POST') {
            // 이음(carry): 프리 첫 체결 전, C0 애프터 종가여야 한다
            const pcl = ref.postClose;
            if (!delayWin && trades.some((x) => x.ms <= now - EXT_DELAY_MS - EXT_DELAY_SLACK_MS) && !trades.filter((x) => x.ms <= now - EXT_DELAY_MS - EXT_DELAY_SLACK_MS).every(isOdd)) {
                out.push(F('error', 'EXT_CARRY_TOO_LONG', door, sym, 'extLabel', lab, 'PRE', `프리마켓에 오늘 프리 체결이 있는데(${etParts(trades[0].ms).hm} ET) 칸이 어제 애프터(POST)에 머물러 있다`));
            } else if (!delayWin && trades.some((x) => x.ms <= now - EXT_DELAY_MS - EXT_DELAY_SLACK_MS)) {
                out.push(F('info', 'EXT_ODDLOT', door, sym, 'extLabel', lab, 'PRE', '프리 체결이 단주(100주 미만)뿐이라 공급사 지연 피드가 아직 마지막 체결을 주지 않았다 — 직전 애프터 종가를 잇는 중'));
            } else if (pcl && !near(ext, pcl.price, tolExt(ext))) {
                out.push(F('error', 'EXT_VALUE', door, sym, 'extPrice', ext, pcl.price, `이음 값 ${r2(ext)} ≠ 직전 애프터 종가 ${r2(pcl.price)} (오래된/틀린 애프터)`));
            } else if (delayWin || !trades.length) out.push(F('delay', 'EXT_CARRY', door, sym, 'extLabel', lab, 'PRE', trades.length ? '프리 첫 체결 전(공급사 15분 지연) — 직전 애프터 종가를 잇는 중' : '오늘 프리 체결 없음 — 직전 애프터 종가를 잇는 중'));
        } else if (lab === 'PRE') {
            const v = ext ? extLiveVerdict(now, ext, trades) : { verdict: 'none' };
            if (!ext) out.push(F(delayWin || !trades.length ? 'delay' : 'warn', 'EXT_MISSING', door, sym, 'extPrice', null, null, '프리 칸이 비었다'));
            else if (v.verdict === 'oddlot') out.push(F('info', 'EXT_ODDLOT', door, sym, 'extPrice', ext, trades[0].price, '앱 값보다 새로운 프리 체결이 단주(100주 미만)뿐 — 공급사 지연 피드는 단주를 마지막 체결로 주지 않는다'));
            else if (v.verdict === 'stale') out.push(F('error', 'EXT_LAG', door, sym, 'extPrice', ext, trades[0].price, `프리 값이 ${v.matchAgeMin}분 전 체결 — 허용 15분 초과(최신 체결 ${v.lastAgeMin}분 전)`));
            else if (v.verdict === 'nomatch') out.push(F(ref.sources.nPre ? 'error' : 'info', ref.sources.nPre ? 'EXT_VALUE' : 'EXT_REF_PARTIAL', door, sym, 'extPrice', ext, trades[0].price, `프리 값 ${r2(ext)} 이(가) 최근 어떤 프리 체결과도 안 맞는다(최신 ${r2(trades[0].price)})${ref.sources.nPre ? '' : ' — 나스닥 프리 기준을 못 읽어 야후 분봉만으로는 단정하지 않는다'}`));
            else if (v.verdict === 'noref') out.push(F('info', 'EXT_UNVERIFIED', door, sym, 'extPrice', ext, null, '기준에 프리 체결이 없다'));
        } else if (ext) out.push(F('error', 'EXT_LABEL', door, sym, 'extLabel', lab, 'PRE', `프리마켓인데 시간외 칸 이름이 «${lab}»`));
    }
    // ─ 애프터 진행 중 ─
    else if (sess === 'post') {
        const trades = ref.extTrades('post', S.today, ref._nPost);
        if (lab === 'PRE CLOSE' || lab === 'PRE') {
            const pc = ref.preClose;
            if (!delayWin && trades.some((x) => x.ms <= now - EXT_DELAY_MS - EXT_DELAY_SLACK_MS)) out.push(F('error', 'EXT_CARRY_TOO_LONG', door, sym, 'extLabel', lab, 'POST', `애프터에 오늘 애프터 체결이 있는데(${etParts(trades[0].ms).hm} ET) 칸이 PRE CLOSE 에 머물러 있다`));
            else if (pc && !near(ext, pc.price, tolExt(ext))) out.push(F('error', 'EXT_VALUE', door, sym, 'extPrice', ext, pc.price, `이음 값 ${r2(ext)} ≠ 오늘 PRE CLOSE ${r2(pc.price)}`));
            else out.push(F('delay', 'EXT_CARRY', door, sym, 'extLabel', lab, 'POST', '애프터 첫 체결 전(공급사 15분 지연) — 오늘 PRE CLOSE 를 잇는 중'));
        } else if (lab === 'POST') {
            const v = ext ? extLiveVerdict(now, ext, trades) : { verdict: 'none' };
            if (!ext) out.push(F(delayWin || !trades.length ? 'delay' : 'warn', 'EXT_MISSING', door, sym, 'extPrice', null, null, '애프터 칸이 비었다'));
            else if (v.verdict === 'oddlot') out.push(F('info', 'EXT_ODDLOT', door, sym, 'extPrice', ext, trades[0].price, '앱 값보다 새로운 애프터 체결이 단주(100주 미만)뿐 — 공급사 지연 피드는 단주를 마지막 체결로 주지 않는다'));
            else if (v.verdict === 'stale') out.push(F('error', 'EXT_LAG', door, sym, 'extPrice', ext, trades[0].price, `애프터 값이 ${v.matchAgeMin}분 전 체결 — 허용 15분 초과(최신 체결 ${v.lastAgeMin}분 전)`));
            else if (v.verdict === 'nomatch') out.push(F(ref.sources.nPost ? 'error' : 'info', ref.sources.nPost ? 'EXT_VALUE' : 'EXT_REF_PARTIAL', door, sym, 'extPrice', ext, trades[0].price, `애프터 값 ${r2(ext)} 이(가) 최근 어떤 애프터 체결과도 안 맞는다(최신 ${r2(trades[0].price)})${ref.sources.nPost ? '' : ' — 나스닥 애프터 기준을 못 읽어 야후 분봉만으로는 단정하지 않는다'}`));
            else if (v.verdict === 'noref') out.push(F('info', 'EXT_UNVERIFIED', door, sym, 'extPrice', ext, null, '기준에 애프터 체결이 없다'));
        } else if (ext) out.push(F('error', 'EXT_LABEL', door, sym, 'extLabel', lab, 'POST', `애프터인데 시간외 칸 이름이 «${lab}»`));
    }
    // ─ 마감·주말·휴장: C0 애프터 종가 ─
    else {
        const pcl = ref.postClose;
        if (!ext) {
            if (pcl && pcl.price && !near(pcl.price, c0, tolClose(pcl.price))) out.push(F('warn', 'EXT_MISSING', door, sym, 'extPrice', null, pcl.price, `애프터 칸이 비었다(기준 애프터 종가 ${r2(pcl.price)} ≠ 종가 ${r2(c0)})`));
            return out;
        }
        if (!/^POST/.test(lab) && !/^PRE/.test(lab)) out.push(F('error', 'EXT_LABEL', door, sym, 'extLabel', lab, 'POST (CLOSED)', `마감인데 시간외 칸 이름이 «${lab}»`));
        if (/^PRE/.test(lab) && pcl && pcl.price && !near(pcl.price, c0, tolClose(pcl.price))) out.push(F('error', 'EXT_LABEL', door, sym, 'extLabel', lab, 'POST (CLOSED)', `마감인데 애프터 종가(${r2(pcl.price)}) 대신 «${lab}» 가 뜬다`));
        if (pcl) {
            if (!near(ext, pcl.price, tolExt(ext))) {
                // 20:00~20:17 ET 확정 전: 마지막 체결이 아직 흔들릴 수 있다
                const settling = S.session === 'closed' && S.today === S.lastClosed && S.sinceBoundary < 17 * 60;
                out.push(F(settling ? 'delay' : 'error', settling ? 'EXT_SETTLING' : 'EXT_VALUE', door, sym, 'extPrice', ext, pcl.price, settling ? `애프터 종가 확정 전(20:17 ET) — ${r2(ext)} vs 기준 ${r2(pcl.price)}` : `애프터 종가 ${r2(ext)} ≠ 기준(통합 테이프 마지막 체결) ${r2(pcl.price)}`));
            }
        } else out.push(F('info', 'EXT_UNVERIFIED', door, sym, 'extPrice', ext, null, '기준에 애프터 체결이 없다'));
    }

    // 시간외 등락률 = (시간외 − C0 종가)/C0 종가 (Flow 의 PRE·POST 배지 모두 C0 대비)
    if (ext && c0 && shown.extPctKnown) {
        const re = pctOf(ext, c0);
        // PRE CLOSE(정규장 중) 는 전일 종가 대비 = C0 대비와 같다(C0 = 직전 거래일)
        if (re != null && Math.abs(re - shown.extPct) > TOL_PCT && !(ref.c0.conflict)) out.push(F('error', 'EXT_PCT', door, sym, 'extPct', shown.extPct, re, `시간외 등락 ${r2(shown.extPct)}% ≠ 기준 종가로 계산한 ${r2(re)}%`));
    }
    return out;
}

/** Flow·Command 큰 가격 판정 */
function judgeFlowShown(now, S, ref, sym, door, shown, opts = {}) {
    const out = [];
    if (!shown) return out;
    if (!pos(shown.price)) { out.push(F('error', 'NUM_INVALID', door, sym, 'displayPrice', shown.price, null, '화면 큰 가격이 0/null')); return out; }
    if (!ref.ok) { out.push(F('info', 'REF_UNAVAILABLE', door, sym, 'displayPrice', shown.price, null, unverifiedWhy(ref))); return out; }
    const events = ref.events.filter((e) => e.kind === 'split');
    const c0 = ref.c0 && ref.c0.v, c1 = ref.c1 && ref.c1.v;

    if (S.session === 'regular') {
        if (ref.live) {
            if (ref.live.ageMs > 8 * 60e3) out.push(F('info', 'REF_STALE', door, sym, 'displayPrice', shown.price, ref.live.price, `기준 마지막 체결이 ${Math.round(ref.live.ageMs / 60000)}분 전 — 거래 정지/무거래 가능`));
            else {
                const d = liveDev(shown.price, ref.live);
                if (d > tolLive(shown.price) / shown.price) {
                    out.push(F('error', 'LIVE_PRICE', door, sym, 'displayPrice', shown.price, ref.live.price, `정규장 지금가 ${r2(shown.price)} ≠ 기준 ${r2(ref.live.price)} (${r2(d * 100)}% 이탈, 밴드 ${r2(ref.live.band[0])}~${r2(ref.live.band[1])})`));
                }
            }
        }
        if (c0 && !events.length) {
            const re = pctOf(shown.price, c0);
            if (re != null && Math.abs(re - shown.pct) > TOL_PCT) out.push(F(ref.c0.conflict ? 'warn' : 'error', 'PCT_BASE', door, sym, 'displayPct', shown.pct, re, `정규장 등락 ${r2(shown.pct)}% ≠ 기준 전일 종가(${r2(c0)}) 대비 ${r2(re)}% (화면 기준선이 전일 종가가 아니다)`));
        }
    } else {
        // PRE·POST·CLOSED — 큰 가격 = C0 종가
        if (!c0) { out.push(F('info', 'REF_UNAVAILABLE', door, sym, 'displayPrice', shown.price, null, 'C0 종가 기준 없음')); }
        else if (events.length) out.push(F('info', 'CORP_ACTION', door, sym, 'displayPrice', shown.price, c0, `분할 이벤트(${events[0].date}) — 종가 대조 보류`));
        else if (!near(shown.price, c0, tolClose(c0))) {
            const sev = ref.c0.conflict ? 'warn' : (ref.c0settling ? 'delay' : 'error');
            out.push(F(sev, 'CLOSE_PRICE', door, sym, 'displayPrice', shown.price, c0, `${S.session} 큰 가격 ${r2(shown.price)} ≠ 오늘/마지막 정규장 종가 ${r2(c0)}${shown.price === (ref.c1 && ref.c1.v) ? ' (= 그 전 거래일 종가 — 어제 값 재사용)' : ''}`));
        } else if (c1 && !events.length) {
            const re = pctOf(c0, c1);
            if (re != null && Math.abs(re - shown.pct) > TOL_PCT) out.push(F('error', 'PCT_BASE', door, sym, 'displayPct', shown.pct, re, `${S.session} 등락 ${r2(shown.pct)}% ≠ 기준 (C0 종가 ${r2(c0)} vs C1 종가 ${r2(c1)}) ${r2(re)}%`));
        }
    }
    if (!opts.skipExt) out.push(...judgeExtFlow(now, S, ref, sym, door, shown));
    return out;
}

/** 대시보드·내 종목·위젯 목록 «한 숫자» 판정 */
function judgeListShown(now, S, ref, sym, door, shown, q) {
    const out = [];
    if (!shown) return out;
    if (!pos(shown.price)) { out.push(F('error', 'NUM_INVALID', door, sym, 'listPrice', shown.price, null, '목록 가격이 0/null')); return out; }
    if (!ref.ok) { out.push(F('info', 'REF_UNAVAILABLE', door, sym, 'listPrice', shown.price, null, unverifiedWhy(ref))); return out; }
    const c0 = ref.c0 && ref.c0.v, c1 = ref.c1 && ref.c1.v;
    const splits = ref.events.filter((e) => e.kind === 'split');
    if (splits.length) { out.push(F('info', 'CORP_ACTION', door, sym, 'listPrice', shown.price, c0, `분할 이벤트(${splits[0].date}) — 대조 보류`)); return out; }
    if (S.session === 'regular') {
        if (ref.live && ref.live.ageMs <= 8 * 60e3) {
            const d = liveDev(shown.price, ref.live);
            if (d > tolLive(shown.price) / shown.price) out.push(F('error', 'LIVE_PRICE', door, sym, 'listPrice', shown.price, ref.live.price, `정규장 목록 가격 ${r2(shown.price)} ≠ 기준 ${r2(ref.live.price)}`));
        }
        if (c0 && shown.pct != null) { const re = pctOf(shown.price, c0); if (re != null && Math.abs(re - shown.pct) > TOL_PCT) out.push(F('error', 'PCT_BASE', door, sym, 'listPct', shown.pct, re, `목록 등락 ${r2(shown.pct)}% ≠ 전일 종가 대비 ${r2(re)}%`)); }
    } else if (!c0) {
        out.push(F('info', 'REF_UNAVAILABLE', door, sym, 'listPrice', shown.price, null, 'C0 종가 기준 없음'));
    } else if (shown.ext) {
        // 시간외 체결가를 그린다 — pre: C0 대비 · post: C1(전일) 대비
        const base = S.session === 'pre' ? c0 : c1;
        const trades = ref.extTrades(S.session === 'pre' ? 'pre' : 'post', S.today, S.session === 'pre' ? ref._nPre : ref._nPost);
        const v = extLiveVerdict(now, shown.price, trades);
        if (v.verdict === 'oddlot') out.push(F('info', 'EXT_ODDLOT', door, sym, 'listPrice', shown.price, trades[0] && trades[0].price, '앱 값보다 새로운 체결이 단주(100주 미만)뿐'));
        else if (v.verdict === 'stale') out.push(F('error', 'EXT_LAG', door, sym, 'listPrice', shown.price, trades[0] && trades[0].price, `목록 시간외 값이 ${v.matchAgeMin}분 전 체결 — 허용 15분 초과`));
        else if (v.verdict === 'nomatch') { const haveNas = S.session === 'pre' ? ref.sources.nPre : ref.sources.nPost; out.push(F(haveNas ? 'error' : 'info', haveNas ? 'EXT_VALUE' : 'EXT_REF_PARTIAL', door, sym, 'listPrice', shown.price, trades[0] && trades[0].price, `목록 시간외 값 ${r2(shown.price)} 이(가) 최근 시간외 체결과 안 맞는다${haveNas ? '' : ' — 나스닥 기준을 못 읽어 단정하지 않는다'}`)); }
        if (base && shown.pct != null) { const re = pctOf(shown.price, base); if (re != null && Math.abs(re - shown.pct) > TOL_PCT) out.push(F('error', 'PCT_BASE', door, sym, 'listPct', shown.pct, re, `목록 시간외 등락 ${r2(shown.pct)}% ≠ 기준 ${r2(re)}%`)); }
    } else {
        if (!near(shown.price, c0, tolClose(c0))) {
            const sev = ref.c0.conflict ? 'warn' : (ref.c0settling ? 'delay' : 'error');
            out.push(F(sev, 'CLOSE_PRICE', door, sym, 'listPrice', shown.price, c0, `${S.session} 목록 가격 ${r2(shown.price)} ≠ 마지막 정규장 종가 ${r2(c0)}`));
        } else if (c1 && shown.pct != null) {
            const re = pctOf(c0, c1);
            if (re != null && Math.abs(re - shown.pct) > TOL_PCT) out.push(F('error', 'PCT_BASE', door, sym, 'listPct', shown.pct, re, `${S.session} 목록 등락 ${r2(shown.pct)}% ≠ 기준 ${r2(re)}%`));
        }
    }
    return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// ③ 허브 웹소켓
// ═══════════════════════════════════════════════════════════════════════════
function judgeHub(now, S, ref, sym, tick, hubAgeMs) {
    const out = [];
    if (!tick) { out.push(F('warn', 'HUB_NO_TICK', 'hub', sym, 'price', null, null, '구독 후 틱이 안 왔다')); return out; }
    if (!pos(tick.price)) { out.push(F('error', 'NUM_INVALID', 'hub', sym, 'price', tick.price, null, '허브 가격이 0/null')); return out; }
    if (!ref.ok) return out;
    if (S.session === 'regular') {
        if (ref.live && ref.live.ageMs <= 8 * 60e3) {
            const d = liveDev(tick.price, ref.live);
            if (d > tolLive(tick.price) / tick.price) out.push(F('error', 'HUB_PRICE', 'hub', sym, 'price', tick.price, ref.live.price, `허브 가격 ${r2(tick.price)} ≠ 정규장 기준 ${r2(ref.live.price)} (${r2(d * 100)}% 이탈)`));
        }
    } else {
        // 시간외: 허브는 마지막 체결(15분 지연) — 시간외 체결 중 하나이거나 종가여야 한다
        const kind = S.session === 'pre' ? 'pre' : 'post';
        const date = S.session === 'closed' ? S.lastClosed : S.today;
        const trades = ref.extTrades(kind, date, kind === 'pre' ? ref._nPre : ref._nPost);
        const c0 = ref.c0 && ref.c0.v;
        const okClose = c0 && near(tick.price, c0, tolClose(c0));
        // 새 세션 첫 17분 — 15분 지연 피드가 아직 새 세션 체결을 못 줘서 허브가 직전 세션의 마지막 체결을 그대로 든다(공급사 지연 · 오류 아님)
        const prevLast = S.session === 'pre' ? (ref.postClose && ref.postClose.price) : (S.session === 'post' ? (ref.preClose && ref.preClose.price) : null);
        if (!okClose && (S.session === 'pre' || S.session === 'post') && S.sinceBoundary < DELAY_WINDOW_S && prevLast && near(tick.price, prevLast, tolExt(prevLast))) {
            out.push(F('delay', 'HUB_CARRY', 'hub', sym, 'price', tick.price, prevLast, `새 세션 첫 체결 전(공급사 15분 지연) — 허브가 직전 세션 마지막 체결 ${r2(prevLast)} 을 들고 있다`));
        } else if (!okClose && trades.length) {
            const v = extLiveVerdict(S.session === 'closed' ? trades[0].ms + 60e3 : now, tick.price, trades);
            if (v.verdict === 'nomatch' || v.verdict === 'stale') out.push(F('info', 'HUB_EXT', 'hub', sym, 'price', tick.price, trades[0].price, `허브 가격 ${r2(tick.price)} 이(가) ${kind} 최근 체결(${r2(trades[0].price)})·종가(${r2(c0)})와 안 맞는다`));
        }
    }
    if (tick.changePct != null && ref.c0 && S.session === 'regular') {
        const re = pctOf(tick.price, ref.c0.v);
        if (re != null && Math.abs(re - tick.changePct) > 0.06) out.push(F('warn', 'HUB_PCT', 'hub', sym, 'changePct', tick.changePct, re, `허브 등락 ${r2(tick.changePct)}% ≠ 전일 종가 대비 ${r2(re)}%`));
    }
    return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// ④ 옵션 레벨
// ═══════════════════════════════════════════════════════════════════════════
const BANDS = { callWallMax: 1.2, putFloorMin: 0.8, gammaFlip: 0.15, maxPain: 0.35 };   // src/lib/optionLevelGate.ts 와 같다
function levelViolations(lv, spot) {
    const s = pos(spot); if (!lv || !s) return [];
    const eps = s * 1e-9, bad = [];
    const cw = pos(lv.callWall), pf = pos(lv.putFloor), gf = pos(lv.gammaFlip), mp = pos(lv.maxPain);
    if (cw != null && !(cw > s && cw <= s * BANDS.callWallMax + eps)) bad.push('callWall');
    if (pf != null && !(pf < s && pf >= s * BANDS.putFloorMin - eps)) bad.push('putFloor');
    if (gf != null && !(Math.abs(gf - s) <= s * BANDS.gammaFlip + eps)) bad.push('gammaFlip');
    if (mp != null && !(Math.abs(mp - s) <= s * BANDS.maxPain + eps)) bad.push('maxPain');
    return bad;
}
/** S.lastClosed 는 16:00 뒤에 오늘이 되지만 EOD 체인은 20:00 뒤에야 오늘 것 */
function chainExpectation(S) {
    const afterEod = S.tradingToday && S.et.min >= 20 * 60;
    const strict = afterEod ? S.today : (S.lastClosed === S.today ? S.prevClosed : S.lastClosed);
    // 20:00~다음 날 08:00 ET 는 EOD 갱신(사전 갱신 크론 20:05~)이 도는 중 — 하루 전 판본은 «지연»으로 본다
    return { strict, lagWindow: afterEod || (S.tradingToday && S.et.min < 8 * 60) };
}
/**
 * lv = {maxPain, callWall, putFloor, gammaFlip, chainDate, expiration, spot, asOf, staleReason, dropped}
 */
function judgeLevels(now, S, sym, door, lv, price) {
    const out = [];
    if (!lv) return out;
    const vals = { maxPain: lv.maxPain, callWall: lv.callWall, putFloor: lv.putFloor, gammaFlip: lv.gammaFlip };
    let any = 0;
    for (const [k, v] of Object.entries(vals)) {
        if (v === null || v === undefined || v === '') continue;
        any++;
        if (!pos(Number(v))) out.push(F('error', 'LV_INVALID', door, sym, k, v, null, `${k} 값이 0/음수/NaN`));
    }
    if (!any) {
        out.push(F('warn', 'LV_EMPTY', door, sym, 'levels', null, null, `옵션 레벨 네 칸이 모두 비었다${lv.staleReason ? ` (사유 ${lv.staleReason})` : ''}`));
        return out;
    }
    const spots = [lv.spot, price].map(pos).filter(Boolean);
    const bad = new Set();
    for (const s of spots) for (const f of levelViolations(vals, s)) bad.add(f);
    // 표시 가격이 레벨을 넘어(실제 돌파 — 프리·애프터 가격이 풋플로어 아래로 내려간 경우 등) 문이 같은 분포에서 «표시 가격 기준으로 다시 고른» 필드는 정상 동작이다(levelsReselected)
    //   그 필드는 문의 표시 가격(displaySpot)에 대해서만 정의를 확인한다 — 화면 큰 가격(C0 종가)이 아니라 시간외 가격이 기준이다.
    const resel = new Set(Array.isArray(lv.reselected) ? lv.reselected.map((x) => (x === 'gammaFlipLevel' ? 'gammaFlip' : x)) : []);
    if (resel.size) {
        const ds = pos(lv.displaySpot);
        for (const f of [...bad]) if (resel.has(f)) { bad.delete(f); if (ds && levelViolations({ [f]: vals[f] }, ds).length) bad.add(f); }
    }
    for (const f of bad) out.push(F('error', 'LV_GATE', door, sym, f, vals[f], spots[0], `${f} ${r2(vals[f])} 이(가) 정의 범위 밖(현물 ${spots.map(r2).join('/')})`));
    if (lv.chainDate) {
        const ex = chainExpectation(S);
        if (lv.chainDate < ex.strict) {
            const gap = Math.round((Date.parse(ex.strict) - Date.parse(lv.chainDate)) / 86400000);
            const oneBehind = lv.chainDate === require('./clock').prevTradingDay(ex.strict);
            out.push(oneBehind && ex.lagWindow
                ? F('delay', 'LV_CHAIN_LAG', door, sym, 'chainDate', lv.chainDate, ex.strict, `체인 ${lv.chainDate} — 새 EOD(${ex.strict}) 사전 갱신 중(허용 창: ET 20:00~08:00)`)
                : F('error', 'LV_CHAIN_OLD', door, sym, 'chainDate', lv.chainDate, ex.strict, `옵션 체인 기준일 ${lv.chainDate} < 최신 EOD ${ex.strict} (${gap}일 묵음)`));
        }
    } else out.push(F('warn', 'LV_CHAIN_UNKNOWN', door, sym, 'chainDate', null, null, '체인 기준일 표식이 없다'));
    if (lv.expiration) {
        const exp = String(lv.expiration);
        const expired = exp < S.today || (exp === S.today && S.tradingToday && S.et.min >= 16 * 60 + 5);
        if (expired) out.push(F('error', 'LV_EXPIRED', door, sym, 'expiration', exp, S.today, `레벨 만기 ${exp} 가 이미 지났다`));
    }
    const sp = pos(lv.spot), px = pos(price);
    if (sp && px && rel(sp, px) > 0.08) out.push(F('warn', 'LV_SPOT_FAR', door, sym, 'spot', sp, px, `레벨 계산 현물 ${r2(sp)} 이(가) 지금 가격 ${r2(px)} 과 ${r2(rel(sp, px) * 100)}% 벌어졌다`));
    return out;
}

/** 같은 종목의 문들이 레벨을 다르게 말하는가: 같은 판본(asOf)인데 값이 다르면 error, 판본이 다르면 info */
function judgeLevelDoors(sym, rows) {
    const out = [];
    const fields = ['maxPain', 'callWall', 'putFloor', 'gammaFlip'];
    const have = rows.filter((r) => r && r.lv && fields.some((f) => pos(r.lv[f])));
    for (let i = 0; i < have.length; i++) for (let j = i + 1; j < have.length; j++) {
        const a = have[i], b = have[j];
        for (const f of fields) {
            const x = pos(a.lv[f]), y = pos(b.lv[f]);
            if (x == null || y == null || x === y) continue;
            const sameVersion = a.lv.asOf != null && b.lv.asOf != null && Number(a.lv.asOf) === Number(b.lv.asOf);
            const sameChain = a.lv.chainDate && a.lv.chainDate === b.lv.chainDate;
            out.push(sameVersion
                ? F('error', 'LV_DOORS', `${a.door}|${b.door}`, sym, f, x, y, `같은 판본인데 문마다 ${f} 가 다르다: ${a.door} ${x} / ${b.door} ${y}`)
                : F(sameChain ? 'warn' : 'info', 'LV_DOORS_VERSION', `${a.door}|${b.door}`, sym, f, x, y, `${f}: ${a.door} ${x} / ${b.door} ${y} (판본 시각이 다르다)`));
        }
    }
    return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ 문 사이 일치(같은 순간 같은 종목) — 정규장 밖에서 가격·시간외는 센트까지 같아야 한다
// ═══════════════════════════════════════════════════════════════════════════
function judgeDoorsPrice(now, S, sym, rows) {
    const out = [];
    const live = rows.filter((r) => r && pos(r.price));
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        const tol = S.session === 'regular' ? Math.max(0.03, a.price * 0.004) : tolClose(a.price);
        if (Math.abs(a.price - b.price) > tol) out.push(F('warn', 'DOOR_PRICE', `${a.door}|${b.door}`, sym, 'price', a.price, b.price, `문마다 가격이 다르다: ${a.door} ${r2(a.price)} / ${b.door} ${r2(b.price)}`));
    }
    const exts = rows.filter((r) => r && pos(r.ext));
    for (let i = 0; i < exts.length; i++) for (let j = i + 1; j < exts.length; j++) {
        const a = exts[i], b = exts[j];
        if (Math.abs(a.ext - b.ext) > tolExt(a.ext) && !(S.session === 'pre' || S.session === 'post')) out.push(F('warn', 'DOOR_EXT', `${a.door}|${b.door}`, sym, 'ext', a.ext, b.ext, `문마다 시간외 값이 다르다: ${a.door} ${r2(a.ext)} / ${b.door} ${r2(b.ext)}`));
    }
    return out;
}

module.exports = {
    tolClose, tolExt, tolLive, TOL_PCT, EXT_DELAY_MS, DELAY_WINDOW_S, OPEN_PROVISIONAL_S, BANDS,
    parseEnDate, deriveRef, liveDev, extLiveVerdict, levelViolations, chainExpectation,
    judgeQuoteApi, judgeFlowShown, judgeListShown, judgeExtFlow, judgeHub, judgeLevels, judgeLevelDoors, judgeDoorsPrice,
};
