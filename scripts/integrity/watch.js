#!/usr/bin/env node
'use strict';
/* ============================================================================
 * 데이터 무결성 감시기 (모델 없음) — 2026-10-13 대표 «완전 무결하게 만들어 완벽하게 만들어»
 *
 * 왜: 10/12 애프터마켓에 MSTR 화면이 금요일 종가 +1.89% 를 «오늘 값»으로 보였다(Intrinio 429 순간의 대체 로직).
 *     대표가 먼저 발견했다. 앱이 보여 주는 모든 가격·등락·시간외·옵션 레벨이 어느 세션에서도 맞는지 기계가 계속 보고, 틀리면 사람이 보기 전에 알린다.
 *
 * 무엇을 재나 (약 40종목 = 기본 칩 9 + 칩 밖 23 + 오늘 실적 발표 ≤8):
 *   · /api/live/quotes (30개씩 — 앱·위젯·내 종목과 같은 요청)  → API 불변식 + 화면 «한 숫자»(calcPriceDisplay 그대로)
 *   · /api/live/ticker (Flow·Command)  → 화면 큰 가격 영역 전체(calcPriceDisplay 그대로) + 옵션 레벨
 *   · /api/watchlist/batch?mode=price (내 종목)·/api/dashboard/unified  → 문 사이 일치 + 옵션 레벨
 *   · wss://ws.signumhq.com (가격 허브)  → 정규장 실시간 + 업스트림 연결 + 인증서
 *   기준: 야후 차트(1분봉·일봉)와 나스닥 공개 시세 — 감시 대조용, 화면에 쓰지 않고 감시 결과 파일에만 남긴다.
 *   Intrinio 는 직접 부르지 않는다(429 사고 재발 방지). 우리 API 는 종목 일부만 돌려가며(= 앱이 평소 보내는 호출 범위) 부른다.
 *
 * 실행:
 *   node scripts/integrity/watch.js tick                 launchd 가 1분마다 — 15분 칸(:02 :17 :32 :47 = 세션 전환 04:02·09:32·16:02·20:02 포함)이 오면 한 회차
 *   node scripts/integrity/watch.js run [--force]        지금 한 회차 (--symbols=A,B  --tag=이름  --no-confirm  --no-hub  --base=URL)
 *   node scripts/integrity/watch.js install|uninstall    launchd 등록(com.signumhq.integrity-watch)
 *   node scripts/integrity/watch.js status               마지막 회차 한 줄
 *   node scripts/integrity/watch.js report [N]           최근 N 회차 요약(마크다운)
 * 결과: ~/signum-ego-io/integrity/ (latest.json · history.jsonl · runs/*.json · alert.log) → 관제(127.0.0.1:7788)가 한 줄로 읽는다.
 * ========================================================================== */
const fs = require('fs');
const path = require('path');
const os = require('os');
const tls = require('tls');
const { execFileSync, spawnSync } = require('child_process');
const clock = require('./clock');
const refs = require('./refs');
const rules = require('./rules');
const screen = require('./screen');
const screenprobe = require('./screenprobe');

const HOME = os.homedir();
const OUT = process.env.INTEGRITY_DIR || path.join(HOME, 'signum-ego-io', 'integrity');
const BASE = (process.env.INTEGRITY_BASE || 'https://www.signumhq.com').replace(/\/$/, '');
const HUB_URL = process.env.INTEGRITY_HUB || 'wss://ws.signumhq.com';
const LABEL = 'com.signumhq.integrity-watch';
const UA = 'Mozilla/5.0 (compatible; signum-integrity-watch/1.0)';
const VERSION = 1;

// ── 종목 ────────────────────────────────────────────────────────────────────
const CHIPS = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'SPY', 'QQQ'];       // 앱 빠른 선택 칩(cmd·flow POPULAR_TICKERS)
const OUTSIDE = ['MSTR', 'COIN', 'PLTR', 'AMD', 'MU', 'AVGO', 'SOFI', 'HOOD', 'ASTS', 'RKLB', 'SMCI', 'ARM', 'NFLX', 'COST', 'LLY', 'BRK.B', 'IWM', 'SOXL', 'GME', 'SNDK', 'CLOV', 'BABA', 'TSM'];   // 칩 밖: 고가(MU·SNDK·LLY)·점(BRK.B)·레버리지 ETF·비유동(CLOV)·ADR
const CORE = ['NVDA', 'TSLA', 'SPY', 'MSTR'];                                                // 우리 API 상세 문(ticker·내 종목·대시보드)을 매 회차 재는 종목
const ROT_N = 8;                                                                              // 나머지는 회차마다 8개씩 돌려가며 (≈ 1시간에 전부)
const EARN_MAX = 8;

const sleep = refs.sleep;
const now0 = () => Date.now();
const mkdir = (d) => fs.mkdirSync(d, { recursive: true });
const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const writeJson = (p, o) => { mkdir(path.dirname(p)); const t = p + '.tmp'; fs.writeFileSync(t, JSON.stringify(o)); fs.renameSync(t, p); };

// ── 우리 API ────────────────────────────────────────────────────────────────
async function app(pathQ, { timeoutMs = 45000 } = {}) {
    const t0 = Date.now();
    try {
        const r = await fetch(BASE + pathQ, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
        const txt = await r.text();
        if (arguments[1] && arguments[1].raw) return { ok: r.ok, status: r.status, ms: Date.now() - t0, body: null, text: txt, err: r.ok ? null : txt.slice(0, 80) };
        let body = null; try { body = JSON.parse(txt); } catch { /* 비 JSON */ }
        return { ok: r.ok && body !== null, status: r.status, ms: Date.now() - t0, body, err: r.ok ? (body === null ? 'non-json' : null) : txt.slice(0, 80) };
    } catch (e) { return { ok: false, status: 0, ms: Date.now() - t0, body: null, err: String(e && e.message || e) }; }
}
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

async function fetchQuotes(symbols) {
    const data = {}; let session = null, ms = 0, ok = true, err = null, calls = 0;
    for (const c of chunk(symbols, 30)) {                          // 앱(useLiveQuotes)과 같은 30개씩 — 31개부터는 서버가 다른(벌크) 경로로 간다
        const r = await app(`/api/live/quotes?symbols=${encodeURIComponent(c.join(','))}`); calls++; ms += r.ms;
        if (!r.ok || !r.body || !r.body.data) { ok = false; err = `HTTP ${r.status} ${r.err || ''}`; continue; }
        Object.assign(data, r.body.data); session = r.body.session || session;
        await sleep(400);
    }
    return { ok, err, ms, calls, data, session };
}
/** 31개 이상을 한 요청에 담았을 때(앱은 30개씩 나눠 보내지만 서버는 어떤 호출자에게도 맞아야 한다) — 서버가 벌크 경로로 가면 마감 뒤 가격이 NBBO 중간값으로 나간다(10/13 실측) */
async function fetchBig(symbols) {
    const list = symbols.slice(0, 31);
    if (list.length < 31) return null;
    const r = await app(`/api/live/quotes?symbols=${encodeURIComponent(list.join(','))}`);
    return { ok: r.ok && !!r.body && !!r.body.data, ms: r.ms, data: (r.body && r.body.data) || {}, list };
}
async function fetchTickers(symbols) {
    const out = {}; let ms = 0, fails = 0, stale = 0;
    for (const s of symbols) {
        const r = await app(`/api/live/ticker?t=${encodeURIComponent(s)}&chain=0`, { timeoutMs: 40000 }); ms += r.ms;
        if (r.ok && r.body && !r.body.error) { out[s] = r.body; if (r.body._stale) stale++; } else { fails++; out[s] = { __error: `HTTP ${r.status} ${r.err || ''}` }; }
        await sleep(900);
    }
    return { out, ms, fails, stale };
}
async function fetchWatchlist(symbols) {
    const r = await app(`/api/watchlist/batch?tickers=${encodeURIComponent(symbols.join(','))}&mode=price`, { timeoutMs: 60000 });
    const out = {};
    if (r.ok && r.body && Array.isArray(r.body.results)) for (const x of r.body.results) if (x && x.ticker) out[x.ticker] = x.realtime || null;
    return { ok: r.ok && !!r.body && Array.isArray(r.body.results), ms: r.ms, out, err: r.err };
}
async function fetchDashboard(symbols) {
    const r = await app(`/api/dashboard/unified?tickers=${encodeURIComponent(symbols.join(','))}`, { timeoutMs: 45000 });
    return { ok: r.ok && !!r.body && !!r.body.tickers, ms: r.ms, out: (r.body && r.body.tickers) || {}, market: r.body && r.body.market, err: r.err };
}

/** 웹 종목 페이지(/flow/SYM)의 «Price» 와 UC 종목 응답의 money.price — 둘 다 «만든 순간의 사본 값»이 낡아 나간 적이 있다(10/13 NVDA $229.28) */
async function fetchWebPrices(symbols) {
    const out = {};
    for (const s of symbols) {
        const o = { page: null, uc: null };
        const pg = await app(`/en/flow/${encodeURIComponent(s)}`, { timeoutMs: 40000, raw: true });
        if (pg.status === 200 && typeof pg.text === 'string') {
            const t = pg.text.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' | ').replace(/(\s*\|\s*)+/g, ' | ');
            const m = /\| Price \| \$([\d,]+(?:\.\d+)?) \|/.exec(t) || /last price, \$([\d,]+(?:\.\d+)?)/.exec(t);
            if (m) o.page = Number(m[1].replace(/,/g, ''));
        }
        const uc = await app(`/api/undercurrent/ticker?t=${encodeURIComponent(s)}&nogen=1`, { timeoutMs: 30000 });
        if (uc.ok && uc.body && uc.body.money) { if (Number(uc.body.money.price) > 0) o.uc = Number(uc.body.money.price); o.ucLv = { maxPain: uc.body.money.maxPain, callWall: uc.body.money.callWall, putFloor: uc.body.money.putFloor }; o.ucGen = uc.body.generatedAt || null; }
        out[s] = o;
        await sleep(600);
    }
    return out;
}

// ── 허브 웹소켓 ─────────────────────────────────────────────────────────────
function tlsDays(host) {
    return new Promise((resolve) => {
        const s = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: 8000 }, () => {
            const c = s.getPeerCertificate(); s.end();
            resolve(c && c.valid_to ? Math.floor((new Date(c.valid_to).getTime() - Date.now()) / 86400000) : null);
        });
        s.on('error', () => resolve(null)); s.on('timeout', () => { s.destroy(); resolve(null); });
    });
}
function hubSample(symbols, listenMs) {
    return new Promise((resolve) => {
        const res = { ok: false, connected: false, polygonConnected: null, ticks: {}, firstMs: null, err: null, msgs: 0 };
        let WS = globalThis.WebSocket;
        if (!WS) { try { WS = require('ws'); } catch { /* 없음 */ } }
        if (!WS) { res.err = 'WebSocket 구현 없음(node 22 필요)'; return resolve(res); }
        const t0 = Date.now(); let ws; let done = false;
        const finish = () => { if (done) return; done = true; try { ws && ws.close(); } catch { /* 닫힘 */ } res.ok = res.connected; resolve(res); };
        try { ws = new WS(HUB_URL); } catch (e) { res.err = String(e && e.message || e); return finish(); }
        const onMsg = (raw) => {
            res.msgs++;
            let m; try { m = JSON.parse(typeof raw === 'string' ? raw : raw.toString()); } catch { return; }
            if (m.type === 'connected') { res.polygonConnected = m.polygonConnected; return; }
            if (m.type === 'prices' && m.ticker) { if (res.firstMs == null) res.firstMs = Date.now() - t0; res.ticks[m.ticker] = { price: m.price, changePct: m.changePct, volume: m.volume, at: Date.now() }; }
        };
        const open = () => { res.connected = true; try { ws.send(JSON.stringify({ type: 'subscribe', tickers: symbols })); } catch { /* 닫힘 */ } setTimeout(finish, listenMs); };
        if (ws.on) { ws.on('open', open); ws.on('message', onMsg); ws.on('error', (e) => { res.err = String(e && e.message || e); finish(); }); ws.on('close', () => finish()); }
        else { ws.onopen = open; ws.onmessage = (ev) => onMsg(ev.data); ws.onerror = () => { res.err = 'ws error'; finish(); }; ws.onclose = () => finish(); }
        setTimeout(finish, listenMs + 8000);
    });
}

// ── 오늘 실적 발표 종목 (공개 달력 — 종목 고르기 전용) ──────────────────────────
async function earningsOn(date) {
    const r = await refs.getJson(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`, {
        'User-Agent': 'Mozilla/5.0', Accept: 'application/json', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/',
    }, { retries: 1 });
    const rows = r.body && r.body.data && r.body.data.rows;
    if (!Array.isArray(rows)) return [];
    const mc = (x) => Number(String(x.marketCap || '').replace(/[$,]/g, '')) || 0;
    return rows.filter((x) => /^[A-Z]{1,5}$/.test(x.symbol || '') && mc(x) > 3e9).sort((a, b) => mc(b) - mc(a)).map((x) => ({ s: x.symbol, amc: /after/.test(x.time || '') }));
}
/** 오늘 실적 발표 종목 — 16:00 ET 전엔 오늘 발표 상위 8, 그 뒤엔 «오늘 장 마감 후 발표 4 + 다음 거래일 발표 4»(지금 시간외가 움직이는 종목 + 내일 아침 갭 종목) */
async function earningsToday(S) {
    const today = await earningsOn(S.today);
    if (S.et.min < 16 * 60 && S.tradingToday) return today.slice(0, EARN_MAX).map((x) => x.s);
    const next = await earningsOn(clock.nextTradingDay(S.today));
    const a = today.filter((x) => x.amc).slice(0, EARN_MAX / 2).map((x) => x.s);
    const b = next.filter((x) => !a.includes(x.s)).slice(0, EARN_MAX - a.length).map((x) => x.s);
    return [...a, ...b];
}

// ═══════════════════════════════════════════════════════════════════════════
// 한 회차
// ═══════════════════════════════════════════════════════════════════════════
async function runOnce(opts = {}) {
    const t0 = now0();
    const state = readJson(path.join(OUT, 'state.json'), {});
    const S = clock.sessionAt(t0);
    const log = (m) => { if (!opts.quiet) console.log(`[integrity ${clock.kstStamp(Date.now()).slice(11)}] ${m}`); };

    // 종목
    let earn;
    const earnKey = `${S.today}${S.et.min >= 16 * 60 ? 'pm' : 'am'}`;
    if (!state.earn || state.earn.key !== earnKey) { state.earn = { key: earnKey, list: await earningsToday(S).catch(() => []) }; }
    earn = state.earn.list;
    let symbols = opts.symbols && opts.symbols.length ? opts.symbols : [...new Set([...CHIPS, ...OUTSIDE, ...earn])];
    const rest = symbols.filter((s) => !CORE.includes(s) && !earn.includes(s));
    const rot = Number(state.rot || 0);
    const sample = opts.symbols && opts.symbols.length ? symbols : [...new Set([...CORE.filter((s) => symbols.includes(s)), ...earn.slice(0, 1), ...Array.from({ length: Math.min(ROT_N, rest.length) }, (_, i) => rest[(rot + i) % rest.length])])];
    state.rot = (rot + ROT_N) % Math.max(1, rest.length);
    log(`세션 ${S.session} · 종목 ${symbols.length} · 상세 문 ${sample.length} (${sample.join(',')})`);

    // 우리 API
    const stages = {};
    const stg = (k, t) => { stages[k] = Date.now() - t; };
    let t = Date.now();
    const quotes = await fetchQuotes(symbols); stg('quotes', t);
    t = Date.now();
    const big = opts.noBig ? null : await fetchBig(symbols); stg('quotesOver30', t);
    t = Date.now();
    const tickers = await fetchTickers(sample); stg('ticker', t);
    t = Date.now();
    const wl = await fetchWatchlist(sample); stg('watchlist', t);
    t = Date.now();
    const dash = await fetchDashboard(sample.filter((s) => CHIPS.includes(s) || CORE.includes(s)).slice(0, 12)); stg('dashboard', t);

    // 기준값
    t = Date.now();
    const daily = state.daily || {}; const cls = state.cls || {};
    const needExtPost = S.session !== 'regular';                     // 마감·프리·애프터엔 C0 애프터 종가(이음·마감 값)
    const needExtPre = S.session !== 'closed' || true;
    const refRaw = {};
    await Promise.all(symbols.map(async (s) => {
        const r = { y1m: null, yd: null, nInfo: null, nPre: null, nPost: null };
        const dc = daily[s];
        const needDaily = !dc || dc.lastClosed !== S.lastClosed || !dc.ok || (Date.now() - dc.at > 6 * 3600e3);
        const jobs = [refs.fetchYahoo1m(s).then((x) => { r.y1m = x; }), refs.fetchNasdaqInfo(s, cls[s]).then((x) => { r.nInfo = x; if (x && x.ok) cls[s] = x.cls; })];
        if (needDaily) jobs.push(refs.fetchYahooDaily(s).then((x) => { r.yd = x; if (x.ok && !(S.session === 'post' && S.sinceBoundary < 5 * 60)) daily[s] = { lastClosed: S.lastClosed, ok: true, daily: x.daily, events: x.events, at: Date.now() }; }));
        else r.yd = { ok: true, daily: dc.daily, events: dc.events };
        await Promise.all(jobs);
        refRaw[s] = r;
    }));
    // 시간외 체결 목록 (종목당 최대 2회) — cls 가 정해진 뒤
    await Promise.all(symbols.map(async (s) => {
        const r = refRaw[s]; const c = (r.nInfo && r.nInfo.cls) || cls[s] || 'stocks';
        const jobs = [];
        if (S.tradingToday && S.session !== 'closed' || S.session === 'closed') jobs.push(refs.fetchNasdaqExt(s, c, 'post').then((x) => { r.nPost = x; }));
        if (S.tradingToday && (S.session === 'regular' || S.session === 'pre' || S.session === 'post')) jobs.push(refs.fetchNasdaqExt(s, c, 'pre').then((x) => { r.nPre = x; }));
        void needExtPost; void needExtPre;
        await Promise.all(jobs);
    }));
    stg('refs', t);
    state.daily = daily; state.cls = cls;

    // 허브
    t = Date.now();
    let hub = { ok: false, connected: false, ticks: {}, skipped: true };
    const hubSyms = sample.slice(0, 12);
    if (!opts.noHub) { hub = await hubSample(hubSyms, 9000); hub.skipped = false; hub.tlsDays = await tlsDays(new URL(HUB_URL.replace('wss:', 'https:')).host).catch(() => null); }
    stg('hub', t);

    // 실제 화면 읽기(30분에 한 번 · 세션 전환 직후) — 헤드리스 크롬으로 운영 화면의 글자를 읽는다
    t = Date.now();
    let screens = null;
    if (opts.probe) {
        const picks = [...new Set(['MSTR', 'NVDA', ...earn.slice(0, 1)])].filter((x) => symbols.includes(x));
        screens = await screenprobe.probe({ flowSymbols: picks, intel: true, base: BASE }).catch((e) => ({ ok: false, flow: {}, intel: null, errs: [String(e && e.message || e)] }));
        if (!screens) screens = { unavailable: true };
    }
    stg('screens', t);
    t = Date.now();
    let web = null;
    if (opts.probe) web = await fetchWebPrices([...new Set(['NVDA', 'MSTR', ...earn.slice(0, 1)])].filter((x) => symbols.includes(x))).catch(() => null);
    stg('web', t);

    // 판정
    const ctx = { t0, S, symbols, sample, quotes, big, tickers, wl, dash, hub, refRaw, screens, web, tag: opts.tag || null };
    let findings = judgeAll(ctx);

    // 확인 재조회 — 오류로 보인 것은 20초 뒤 한 번 더 (일시 오류와 구분)
    let transient = [];
    if (!opts.noConfirm) {
        const errSyms = [...new Set(findings.filter((f) => f.sev === 'error' && f.sym && symbols.includes(f.sym)).map((f) => f.sym))];
        if (errSyms.length && errSyms.length <= 14) {
            log(`오류 후보 ${errSyms.length}종목 — 20초 뒤 재확인: ${errSyms.join(',')}`);
            await sleep(20000);
            const q2 = await fetchQuotes(errSyms);
            const tk2 = {}; let tkMs = 0;
            for (const s of errSyms.filter((x) => sample.includes(x))) { const r = await app(`/api/live/ticker?t=${encodeURIComponent(s)}&chain=0`); tkMs += r.ms; tk2[s] = r.ok && r.body && !r.body.error ? r.body : { __error: `HTTP ${r.status}` }; await sleep(700); }
            for (const s of errSyms) {                                    // 정규장이면 기준도 새로
                if (S.session === 'regular') refRaw[s].y1m = await refs.fetchYahoo1m(s);
            }
            const ctx2 = { ...ctx, symbols: errSyms, sample: errSyms.filter((x) => sample.includes(x)), quotes: q2, tickers: { out: { ...tickers.out, ...tk2 }, ms: tkMs, fails: 0, stale: 0 }, hub: { ...hub, ticks: hub.ticks }, confirm: true };
            const again = judgeAll(ctx2).filter((f) => f.sev === 'error');
            const key = (f) => `${f.code}|${f.sym}|${f.door}|${f.field}`;
            const stay = new Set(again.map(key));
            const survivors = [];
            for (const f of findings) {
                if (f.sev === 'error' && errSyms.includes(f.sym) && f.door !== 'hub' && !/^screen:real/.test(f.door) && !String(f.door).includes('|') && !stay.has(key(f)) && !(f.door === 'ticker' && !tk2[f.sym])) { transient.push({ ...f, sev: 'warn', code: 'TRANSIENT_' + f.code, msg: `20초 안에 사라진 이상값 — ${f.msg}` }); }
                else survivors.push(f);
            }
            findings = survivors.concat(transient);
        }
    }

    // 경고 승격 — 같은 경고가 두 회차 연속이면 오류
    const prevPending = state.pending || {}; const nextPending = {};
    for (const f of findings) {
        if (f.sev !== 'warn' || /^TRANSIENT_/.test(f.code)) continue;
        const k = `${f.code}|${f.sym}|${f.door}|${f.field}`;
        nextPending[k] = (prevPending[k] || 0) + 1;
        if (nextPending[k] >= 2) { f.sev = 'error'; f.escalated = true; f.msg += ' [경고가 두 회차 연속]'; }
    }
    state.pending = nextPending;

    const sum = summarize(ctx, findings, transient, Date.now() - t0, stages);
    // 알림 — 새 오류가 생겼는가
    const prev = readJson(path.join(OUT, 'latest.json'), null);
    const prevKeys = new Set(((prev && prev.errorList) || []).map((e) => `${e.code}|${e.sym}|${e.door}|${e.field}`));
    const fresh = sum.errorList.filter((e) => !prevKeys.has(`${e.code}|${e.sym}|${e.door}|${e.field}`));
    sum.newErrors = fresh.length;
    persist(sum, findings, ctx, opts);
    if (fresh.length && !opts.noNotify) notify(sum, fresh);
    state.lastRunAt = t0;
    writeJson(path.join(OUT, 'state.json'), state);
    log(sum.line);
    return { sum, findings };
}

// ═══════════════════════════════════════════════════════════════════════════
// 판정 모음
// ═══════════════════════════════════════════════════════════════════════════
function judgeAll(ctx) {
    const { t0, S, symbols, sample, quotes, tickers, wl, dash, hub } = ctx;
    const out = [];
    const now = t0;
    // 문 전체 건강
    if (!ctx.confirm) {
        if (!quotes.ok) out.push({ sev: 'error', code: 'API_DOWN', door: 'quotes', sym: null, field: 'http', msg: `/api/live/quotes 실패: ${quotes.err}` });
        else if (quotes.ms / Math.max(1, quotes.calls) > 12000) out.push({ sev: 'warn', code: 'API_SLOW', door: 'quotes', sym: null, field: 'ms', msg: `/api/live/quotes ${Math.round(quotes.ms / quotes.calls)}ms/호출` });
        if (tickers.fails) out.push({ sev: tickers.fails >= Math.ceil(sample.length / 2) ? 'error' : 'warn', code: 'API_FAIL', door: 'ticker', sym: null, field: 'http', msg: `/api/live/ticker ${tickers.fails}/${sample.length}건 실패` });
        if (tickers.stale) out.push({ sev: 'warn', code: 'API_STALE_FLAG', door: 'ticker', sym: null, field: '_stale', msg: `/api/live/ticker ${tickers.stale}건이 저하(_stale) 응답 — 벤더 429 등으로 마지막 정상값 병합 중` });
        if (!wl.ok) out.push({ sev: 'warn', code: 'API_FAIL', door: 'watchlist', sym: null, field: 'http', msg: `/api/watchlist/batch 실패: ${wl.err}` });
        if (!dash.ok) out.push({ sev: 'warn', code: 'API_FAIL', door: 'dashboard', sym: null, field: 'http', msg: `/api/dashboard/unified 실패: ${dash.err}` });
        if (!hub.skipped) {
            if (!hub.connected) out.push({ sev: 'error', code: 'HUB_DOWN', door: 'hub', sym: null, field: 'connect', msg: `가격 허브 연결 실패: ${hub.err || 'timeout'}` });
            else {
                if (hub.polygonConnected === false && S.session !== 'closed') out.push({ sev: 'error', code: 'HUB_UPSTREAM', door: 'hub', sym: null, field: 'polygonConnected', msg: '가격 허브의 업스트림(Intrinio 실시간) 연결이 끊겼다' });
                if (!Object.keys(hub.ticks).length) out.push({ sev: S.session === 'regular' ? 'error' : 'warn', code: 'HUB_SILENT', door: 'hub', sym: null, field: 'ticks', msg: '허브에 연결됐지만 구독 종목 틱이 하나도 안 왔다' });
            }
            if (hub.tlsDays != null && hub.tlsDays < 14) out.push({ sev: hub.tlsDays < 5 ? 'error' : 'warn', code: 'HUB_TLS', door: 'hub', sym: null, field: 'tls', msg: `ws.signumhq.com 인증서 만료까지 ${hub.tlsDays}일` });
        }
        // 세션 라벨 전체
        if (quotes.ok && quotes.session && String(quotes.session) !== S.session && S.sinceBoundary > 90 && S.toBoundary > 90) out.push({ sev: 'error', code: 'SESSION_MISMATCH', door: 'quotes', sym: null, field: 'session', app: quotes.session, ref: S.session, msg: `서버 세션 «${quotes.session}» ≠ 시계·달력 «${S.session}»` });
        // 기준 읽기 실패 비율
        const refFail = symbols.filter((s) => !(ctx.refRaw[s].y1m && ctx.refRaw[s].y1m.ok) && !(ctx.refRaw[s].nInfo && ctx.refRaw[s].nInfo.ok)).length;
        if (refFail > symbols.length * 0.4) out.push({ sev: 'warn', code: 'REF_DOWN', door: 'ref', sym: null, field: 'coverage', msg: `기준 시세 읽기 실패 ${refFail}/${symbols.length} — 이번 회차 대조가 약하다(앱 오류 아님)` });
    }

    // 31개 이상 한 요청 — 서버 경로가 달라도 값은 같은 세션 규칙을 지켜야 한다
    if (ctx.big && ctx.big.ok && !ctx.confirm) {
        const bad = [];
        for (const s of ctx.big.list) {
            const q = ctx.big.data[s]; if (!q) continue;
            const ref = rules.deriveRef(now, S, ctx.refRaw[s]);
            const fs_ = [...rules.judgeQuoteApi(now, S, ref, s, q, 'quotes>30')];
            const ls = screen.listScreen(q, q.session || S.session);
            if (ls) fs_.push(...rules.judgeListShown(now, S, ref, s, 'quotes>30', ls, q));
            const errs = fs_.filter((f) => f.sev === 'error' && /PRICE|PCT|CLOSE|LIVE|EXT_VALUE/.test(f.code));
            if (errs.length) bad.push({ s, f: errs[0] });
        }
        if (bad.length) out.push({ sev: 'error', code: 'QUOTES_OVER30', door: 'quotes>30', sym: null, field: 'price', app: bad.length, ref: ctx.big.list.length, msg: `/api/live/quotes 를 31개 이상 한 요청에 보내면 ${bad.length}/${ctx.big.list.length}종목 값이 틀린다 — 예: ${bad.slice(0, 4).map((b) => `${b.s} ${b.f.app}≠${b.f.ref}`).join(', ')}` });
    } else if (ctx.big && !ctx.big.ok && !ctx.confirm) out.push({ sev: 'warn', code: 'API_FAIL', door: 'quotes>30', sym: null, field: 'http', msg: '/api/live/quotes 31개 요청 실패' });

    // 실제 화면(헤드리스 크롬)에서 읽은 글자
    if (ctx.screens && !ctx.confirm) {
        const sc = ctx.screens;
        if (sc.unavailable) out.push({ sev: 'warn', code: 'SCREEN_PROBE_UNAVAILABLE', door: 'screen:real', sym: null, field: 'puppeteer', msg: '실제 화면 읽기를 못 한다(puppeteer/크롬 없음)' });
        else {
            for (const e of sc.errs || []) out.push({ sev: 'warn', code: 'SCREEN_PROBE_FAIL', door: 'screen:real', sym: null, field: 'read', msg: `화면 읽기 실패: ${e}` });
            for (const [sym, f] of Object.entries(sc.flow || {})) {
                if (!f) continue;
                const ref = rules.deriveRef(now, S, ctx.refRaw[sym]);
                const shown = { price: f.price, pct: f.pct, extPrice: f.extPrice || 0, extLabel: f.extLabel || '', extPct: f.extPct, extPctKnown: f.extPct != null };
                out.push(...rules.judgeFlowShown(now, S, ref, sym, 'screen:real-flow', shown));
            }
            if (sc.intel && sc.intel.rows) for (const r of sc.intel.rows) {
                if (!ctx.refRaw[r.sym]) continue;
                const ref = rules.deriveRef(now, S, ctx.refRaw[r.sym]);
                out.push(...rules.judgeFlowShown(now, S, ref, r.sym, 'screen:real-intel', { price: r.price, pct: r.pct, extPrice: 0, extLabel: '', extPct: null, extPctKnown: false }, { skipExt: true }));
            }
        }
    }

    // UC 종목 응답의 옵션 레벨 — 구조 한 벌(ticker 문)과 같아야 한다(사본이 12시간 묵어 MU 풋플로어 1000 vs 800 이던 것: 10/13)
    if (ctx.web && !ctx.confirm) {
        for (const [sym, w] of Object.entries(ctx.web)) {
            const tk = ctx.tickers.out[sym]; const fl = tk && tk.flow;
            if (!w.ucLv || !fl) continue;
            for (const [f, g] of [['maxPain', 'maxPain'], ['callWall', 'callWall'], ['putFloor', 'putFloor']]) {
                const a = Number(w.ucLv[f]), b = Number(fl[g]);
                if (a > 0 && b > 0 && a !== b) out.push({ sev: 'error', code: 'LV_UC', door: 'uc:ticker', sym, field: f, app: a, ref: b, msg: `UC 종목 응답 ${f} ${a} ≠ 구조 판본(ticker 문) ${b}${w.ucGen ? ` — 사본 생성 ${w.ucGen}` : ''}` });
            }
        }
    }

    // 웹 종목 페이지·UC 종목 응답의 «최근가» — 마지막 정규장 종가(정규장 중엔 지금가도 허용)여야 한다
    if (ctx.web && !ctx.confirm) {
        for (const [sym, w] of Object.entries(ctx.web)) {
            const ref = rules.deriveRef(now, S, ctx.refRaw[sym]);
            for (const [door, v] of [['web:flow-seo', w.page], ['uc:ticker', w.uc]]) {
                if (!(v > 0) || !ref.ok) continue;
                const c0 = ref.c0 && ref.c0.v;
                const okClose = c0 && Math.abs(v - c0) <= rules.tolClose(c0);
                const okLive = S.session === 'regular' && ref.live && ref.live.ageMs < 8 * 60e3 && rules.liveDev(v, ref.live) <= rules.tolLive(v) / v;
                const split = ref.events.some((e) => e.kind === 'split');
                if (!okClose && !okLive && !split) out.push({ sev: ref.c0 && ref.c0.conflict ? 'warn' : 'error', code: 'WEB_PRICE', door, sym, field: 'price', app: v, ref: c0, msg: `${door} 의 «최근가» ${v} ≠ 마지막 정규장 종가 ${c0}${ctx.refRaw[sym] && v === (ref.c1 && ref.c1.v) ? ' (= 그 전 거래일 종가)' : ''}` });
            }
        }
    }

    const closedMarket = S.session === 'closed';
    for (const s of symbols) {
        const ref = rules.deriveRef(now, S, ctx.refRaw[s]);
        const q = quotes.data[s];
        // ① API 불변식 + 목록 화면
        out.push(...rules.judgeQuoteApi(now, S, ref, s, q, 'quotes'));
        if (q && !q.error) {
            const ls = screen.listScreen(q, q.session || S.session);
            if (ls) out.push(...rules.judgeListShown(now, S, ref, s, 'screen:list', ls, q));
        }
        // ② Flow·Command 화면 (상세 문 표본)
        if (sample.includes(s)) {
            const tk = tickers.out[s];
            if (tk && tk.__error) out.push({ sev: 'warn', code: 'API_FAIL', door: 'ticker', sym: s, field: 'http', msg: `/api/live/ticker ${tk.__error}` });
            else if (tk) {
                const ws = hub.ticks && hub.ticks[s] && S.session === 'regular' ? hub.ticks[s] : null;
                const fs_ = screen.flowScreen(q, tk, ws, closedMarket);
                if (fs_) out.push(...rules.judgeFlowShown(now, S, ref, s, 'screen:flow', fs_));
                else if (!screen.loadCalc()) out.push({ sev: 'warn', code: 'SCREEN_MODEL', door: 'screen:flow', sym: s, field: 'calcPriceDisplay', msg: '화면 계산 함수를 읽지 못했다(typescript 모듈) — 화면 값 재현 불가' });
                if (tk._stale) out.push({ sev: 'warn', code: 'TICKER_STALE', door: 'ticker', sym: s, field: '_stale', msg: `ticker 응답이 저하 상태(_staleReason ${tk._staleReason || '?'})` });
                // 옵션 레벨 (ticker.flow)
                const fl = tk.flow || {};
                const px = (fs_ && fs_.price) || (tk.display && tk.display.price);
                out.push(...rules.judgeLevels(now, S, s, 'ticker', { maxPain: fl.maxPain, callWall: fl.callWall, putFloor: fl.putFloor, gammaFlip: fl.gammaFlipLevel, chainDate: fl.levelsChainDate, expiration: fl.levelsExpiration, spot: fl.levelsSpot, asOf: fl.levelsAsOf, staleReason: fl.levelsStaleReason }, px));
            }
            // 내 종목(워치리스트) 문
            const w = wl.out[s];
            if (w) {
                const wq = { price: w.price, previousClose: null, changePercent: w.changePct, extendedPrice: w.extendedPrice, extendedChangePercent: w.extendedChangePct, extendedLabel: w.extendedLabel, session: w.session };
                if (!(Number(w.price) > 0)) out.push({ sev: 'error', code: 'NUM_INVALID', door: 'watchlist', sym: s, field: 'price', app: w.price, msg: '내 종목 가격이 0/null' });
                out.push(...rules.judgeLevels(now, S, s, 'watchlist', { maxPain: w.maxPain, callWall: w.callWall, putFloor: w.putFloor, gammaFlip: w.gammaFlipLevel, chainDate: w.levelsChainDate, expiration: w.levelsExpiration, spot: w.levelsRefPrice, asOf: w.levelsAsOf, staleReason: w.levelsStaleReason }, w.price));
                // 문 사이 일치
                const rows = [{ door: 'quotes', price: q && q.price, ext: q && q.extendedPrice }, { door: 'watchlist', price: w.price, ext: w.extendedPrice }];
                const ds = dash.out && dash.out[s]; if (ds) rows.push({ door: 'dashboard', price: ds.regularCloseToday > 0 && S.session !== 'regular' ? ds.regularCloseToday : (ds.display && ds.display.price), ext: ds.extended && (ds.extended.postPrice || ds.extended.prePrice) });
                // 정규장 밖에서 quotes 의 PRE/POST 이름이 문마다 달라 ext 비교는 같은 이름끼리만
                if (S.session === 'closed' || S.session === 'post') { rows[0].ext = q && q.extendedLabel === 'POST' ? q.extendedPrice : null; rows[1].ext = w.extendedLabel === 'POST' ? w.extendedPrice : null; if (rows[2]) rows[2].ext = ds && ds.extended && ds.extended.postPrice; }
                else { rows.forEach((r) => { r.ext = null; }); }
                out.push(...rules.judgeDoorsPrice(now, S, s, rows));
                // 레벨 문 사이
                const lvRows = [];
                if (tickers.out[s] && tickers.out[s].flow) { const fl = tickers.out[s].flow; lvRows.push({ door: 'ticker', lv: { maxPain: fl.maxPain, callWall: fl.callWall, putFloor: fl.putFloor, gammaFlip: fl.gammaFlipLevel, asOf: fl.levelsAsOf, chainDate: fl.levelsChainDate } }); }
                lvRows.push({ door: 'watchlist', lv: { maxPain: w.maxPain, callWall: w.callWall, putFloor: w.putFloor, gammaFlip: w.gammaFlipLevel, asOf: w.levelsAsOf, chainDate: w.levelsChainDate } });
                if (ds) lvRows.push({ door: 'dashboard', lv: { maxPain: ds.maxPain, callWall: ds.levels && ds.levels.callWall, putFloor: ds.levels && ds.levels.putFloor, gammaFlip: ds.gammaFlipLevel, asOf: ds.levelsAsOf, chainDate: ds.chainDate } });
                out.push(...rules.judgeLevelDoors(s, lvRows));
            }
            // 대시보드 문 자체 불변식
            const ds = dash.out && dash.out[s];
            if (ds && S.session !== 'regular' && ref.c0 && ref.c0.v && Number(ds.regularCloseToday) > 0 && Math.abs(ds.regularCloseToday - ref.c0.v) > rules.tolClose(ref.c0.v) && !ref.events.some((e) => e.kind === 'split')) {
                out.push({ sev: ref.c0.conflict ? 'warn' : 'error', code: 'CLOSE_PRICE', door: 'dashboard', sym: s, field: 'regularCloseToday', app: ds.regularCloseToday, ref: ref.c0.v, msg: `대시보드 regularCloseToday ${ds.regularCloseToday} ≠ 기준 마지막 정규장 종가 ${ref.c0.v}` });
            }
        }
        // ③ 허브
        if (!hub.skipped && hub.connected && hub.ticks && (hub.ticks[s] || ctx.sample.slice(0, 12).includes(s))) out.push(...rules.judgeHub(now, S, ref, s, hub.ticks[s], null));
        // 분할·정지 사유 표시
        if (!ref.ok && !ctx.confirm) out.push({ sev: 'info', code: 'REF_UNAVAILABLE', door: 'ref', sym: s, field: 'coverage', msg: '기준 시세 없음 — 이 종목은 이번 회차 대조 불가' });
    }
    return out;
}

/** 같은 원인이 문·화면마다 되풀이되어 잡히면 한 건으로 합친다(종목·코드·항목·값이 같음) */
function dedupe(findings) {
    const m = new Map();
    for (const f of findings) {
        const k = `${f.sev}|${f.sym}|${f.code}|${f.field || ''}|${f.app ?? ''}|${f.ref ?? ''}`;
        const g = m.get(k);
        if (g) { if (!g.door.split(',').includes(f.door)) g.door += ',' + f.door; } else m.set(k, { ...f });
    }
    return [...m.values()];
}

function summarize(ctx, findingsRaw, transient, ms, stages) {
    const findings = dedupe(findingsRaw);
    const { t0, S, symbols, quotes, hub, tickers, sample } = ctx;
    const by = (sev) => findings.filter((f) => f.sev === sev);
    const errs = by('error'), warns = by('warn'), delays = by('delay'), infos = by('info');
    const badSyms = new Set(errs.filter((f) => f.sym).map((f) => f.sym));
    const warnSyms = new Set(warns.filter((f) => f.sym).map((f) => f.sym));
    const okSyms = symbols.filter((s) => !badSyms.has(s) && !warnSyms.has(s));
    const globalErrs = errs.filter((f) => !f.sym);
    const short = (f) => `${f.sym || f.door} ${f.field || f.code}`;
    const errLabel = [...new Map(errs.map((f) => [short(f), f])).keys()].slice(0, 6).join(', ');
    const line = `데이터 무결성: 정상 ${okSyms.length} / 오류 ${badSyms.size + globalErrs.length}${errs.length ? `(${errLabel}${errs.length > 6 ? ' 외' : ''})` : ''}` + ` · 지연 ${new Set(delays.map((f) => f.sym)).size} · 경고 ${warnSyms.size} · ${clock.kstHm(t0)} KST ${S.session.toUpperCase()}`;
    const slim = (f) => ({ sev: f.sev, code: f.code, door: f.door, sym: f.sym, field: f.field, app: f.app ?? null, ref: f.ref ?? null, msg: f.msg, escalated: !!f.escalated });
    return {
        version: VERSION, at: t0, atKst: clock.kstStamp(t0), tag: ctx.tag || null,
        session: S.session, today: S.today, lastClosed: S.lastClosed, etHms: S.et.hms,
        symbols: symbols.length, detailed: sample.length, ok: okSyms.length, errorSymbols: badSyms.size, errors: errs.length, warns: warns.length, delays: delays.length, infos: infos.length, transient: transient.length,
        line,
        errorList: errs.map(slim), warnList: warns.slice(0, 40).map(slim), delayList: delays.slice(0, 40).map(slim), infoList: infos.slice(0, 40).map(slim),
        doors: {
            quotes: { ok: quotes.ok, ms: quotes.ms, calls: quotes.calls, session: quotes.session },
            ticker: { n: sample.length, fails: tickers.fails, stale: tickers.stale, ms: tickers.ms },
            screens: ctx.screens ? { ok: !!ctx.screens.ok, flow: Object.keys(ctx.screens.flow || {}).length, intelRows: (ctx.screens.intel && ctx.screens.intel.rows || []).length, errs: ctx.screens.errs || [] } : null,
            hub: { ok: hub.ok, skipped: !!hub.skipped, connected: hub.connected, polygonConnected: hub.polygonConnected, ticks: Object.keys(hub.ticks || {}).length, firstMs: hub.firstMs ?? null, tlsDays: hub.tlsDays ?? null },
        },
        refCoverage: {
            yahoo1m: symbols.filter((s) => ctx.refRaw[s].y1m && ctx.refRaw[s].y1m.ok).length,
            yahooDaily: symbols.filter((s) => ctx.refRaw[s].yd && ctx.refRaw[s].yd.ok).length,
            nasdaqInfo: symbols.filter((s) => ctx.refRaw[s].nInfo && ctx.refRaw[s].nInfo.ok).length,
            nasdaqPost: symbols.filter((s) => ctx.refRaw[s].nPost && ctx.refRaw[s].nPost.ok).length,
            nasdaqPre: symbols.filter((s) => ctx.refRaw[s].nPre && ctx.refRaw[s].nPre.ok).length,
        },
        stagesMs: stages, ms, symbolsList: symbols,
    };
}

function persist(sum, findings, ctx, opts) {
    mkdir(path.join(OUT, 'runs'));
    writeJson(path.join(OUT, 'latest.json'), sum);
    fs.appendFileSync(path.join(OUT, 'history.jsonl'), JSON.stringify({ at: sum.at, atKst: sum.atKst, tag: opts.tag || null, session: sum.session, symbols: sum.symbols, ok: sum.ok, errorSymbols: sum.errorSymbols, errors: sum.errors, warns: sum.warns, delays: sum.delays, infos: sum.infos, transient: sum.transient, errorKeys: sum.errorList.map((e) => `${e.sym || e.door}:${e.code}:${e.field}`), ms: sum.ms }) + '\n');
    const rowsDump = {};
    for (const s of ctx.symbols) {
        const q = ctx.quotes.data[s];
        rowsDump[s] = { quote: q ? { price: q.price, prev: q.previousClose, pct: q.changePercent, ext: q.extendedPrice, extLabel: q.extendedLabel, extDate: q.extendedDate, extKind: q.extendedKind, session: q.session } : null };
    }
    writeJson(path.join(OUT, 'runs', `${new Date(sum.at).toISOString().replace(/[:.]/g, '-')}${opts.tag ? '-' + opts.tag : ''}.json`), { summary: sum, findings, rows: rowsDump });
    // 3일 보관
    try { for (const f of fs.readdirSync(path.join(OUT, 'runs'))) { const p = path.join(OUT, 'runs', f); if (Date.now() - fs.statSync(p).mtimeMs > 3 * 86400e3) fs.unlinkSync(p); } } catch { /* 정리 실패 무시 */ }
}

function notify(sum, fresh) {
    const lines = fresh.slice(0, 6).map((e) => `${e.sym || e.door} ${e.field}: ${e.msg}`);
    fs.appendFileSync(path.join(OUT, 'alert.log'), `[${sum.atKst} KST ${sum.session}] 새 오류 ${fresh.length}건\n${lines.map((l) => '  - ' + l).join('\n')}\n`);
    try {
        const msg = `새 오류 ${fresh.length}건: ${fresh.slice(0, 3).map((e) => `${e.sym || e.door} ${e.field}`).join(', ')}`.replace(/"/g, "'");
        spawnSync('osascript', ['-e', `display notification "${msg}" with title "SIGNUM 데이터 무결성" sound name "Basso"`], { timeout: 5000 });
    } catch { /* 알림 권한 없음 — alert.log·관제가 본 알림이다 */ }
}

// ═══════════════════════════════════════════════════════════════════════════
// tick (launchd) · install · status · report
// ═══════════════════════════════════════════════════════════════════════════
const SLOT_OFFSET_S = 120, SLOT_S = 900;
const slotOf = (ms) => Math.floor((ms / 1000 - SLOT_OFFSET_S) / SLOT_S);

async function tick() {
    mkdir(OUT);
    const lock = path.join(OUT, 'run.lock');
    try { const st = fs.statSync(lock); if (Date.now() - st.mtimeMs < 12 * 60e3) return; } catch { /* 잠금 없음 */ }
    const state = readJson(path.join(OUT, 'state.json'), {});
    const slot = slotOf(Date.now());
    if (state.lastSlot === slot) return;
    fs.writeFileSync(lock, String(process.pid));
    try {
        const s2 = readJson(path.join(OUT, 'state.json'), {});
        s2.lastSlot = slot; writeJson(path.join(OUT, 'state.json'), s2);
        const slotMs = (slot * SLOT_S + SLOT_OFFSET_S) * 1000;
        const transition = clock.transitionsBetween(slotMs - 150e3, slotMs - 100e3).length > 0;   // 04:00·09:30·16:00·20:00 ET 바로 뒤 칸
        await runOnce({ quiet: true, tag: transition ? 'transition' : null, probe: transition || slot % 2 === 0 });
    } finally { try { fs.unlinkSync(lock); } catch { /* 이미 없음 */ } }
}

function plist() {
    const nodePath = process.execPath;
    const script = path.resolve(__filename);
    const out = path.join(OUT, 'launchd.log');
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array><string>${nodePath}</string><string>${script}</string><string>tick</string></array>
  <key>StartInterval</key><integer>60</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${out}</string>
  <key>StandardErrorPath</key><string>${out}</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${path.dirname(nodePath)}:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
</dict></plist>
`;
}
function install() {
    mkdir(OUT);
    const p = path.join(HOME, 'Library', 'LaunchAgents', `${LABEL}.plist`);
    fs.writeFileSync(p, plist());
    const uid = process.getuid();
    try { execFileSync('launchctl', ['bootout', `gui/${uid}/${LABEL}`], { stdio: 'ignore' }); } catch { /* 처음 */ }
    execFileSync('launchctl', ['bootstrap', `gui/${uid}`, p], { stdio: 'inherit' });
    console.log(`등록 완료: ${p}\n  node ${process.execPath}\n  스크립트 ${path.resolve(__filename)}\n  15분 칸(:02 :17 :32 :47 = 세션 전환 직후 포함)마다 한 회차, 결과 ${OUT}`);
}
function uninstall() {
    const p = path.join(HOME, 'Library', 'LaunchAgents', `${LABEL}.plist`);
    try { execFileSync('launchctl', ['bootout', `gui/${process.getuid()}/${LABEL}`], { stdio: 'ignore' }); } catch { /* 없음 */ }
    try { fs.unlinkSync(p); } catch { /* 없음 */ }
    console.log('해제 완료');
}
function status() {
    const s = readJson(path.join(OUT, 'latest.json'), null);
    if (!s) { console.log('아직 회차 없음'); return; }
    console.log(s.line + `  (읽음 ${Math.round((Date.now() - s.at) / 60000)}분 전, ${Math.round(s.ms / 1000)}초 걸림)`);
    for (const e of s.errorList) console.log(`  ✗ ${e.sym || e.door} [${e.door}] ${e.code}: ${e.msg}`);
}
function report(n = 6) {
    const lines = fs.existsSync(path.join(OUT, 'history.jsonl')) ? fs.readFileSync(path.join(OUT, 'history.jsonl'), 'utf8').trim().split('\n').slice(-n) : [];
    console.log('| 시각(KST) | 세션 | 종목 | 정상 | 오류(종목/건) | 경고 | 지연 | 비고 | 오류 항목 |\n|---|---|---|---|---|---|---|---|---|');
    for (const l of lines) { const h = JSON.parse(l); console.log(`| ${h.atKst.replace('T', ' ')} | ${h.session} | ${h.symbols} | ${h.ok} | ${h.errorSymbols}/${h.errors} | ${h.warns} | ${h.delays} | ${h.tag || ''}${h.transient ? ` 일시${h.transient}` : ''} | ${(h.errorKeys || []).slice(0, 6).join(', ')} |`); }
}

/** 오탐 집계 — 첫 이틀 규칙을 다듬는 근거. history.jsonl 의 오류 키를 세고, fp-review.json 에 사람이 매긴 판정(true=진짜 오류 · false=오탐)을 곁들인다 */
function fp(hours = 48) {
    const file = path.join(OUT, 'history.jsonl');
    const since = Date.now() - hours * 3600e3;
    const rows = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((h) => h && h.at >= since) : [];
    const review = readJson(path.join(OUT, 'fp-review.json'), {});
    const cnt = new Map();
    for (const h of rows) for (const k of new Set(h.errorKeys || [])) cnt.set(k, (cnt.get(k) || 0) + 1);
    const withErr = rows.filter((h) => h.errors > 0).length;
    console.log(`최근 ${hours}시간 회차 ${rows.length} · 오류가 있던 회차 ${withErr} · 일시 오류(20초 안에 사라짐) 합 ${rows.reduce((a, h) => a + (h.transient || 0), 0)}`);
    console.log('| 오류 키(종목:코드:항목) | 회차 수 | 판정 | 메모 |\n|---|---|---|---|');
    for (const [k, n] of [...cnt.entries()].sort((a, b) => b[1] - a[1])) { const r = review[k]; console.log(`| ${k} | ${n} | ${r ? (r.verdict === 'true' ? '진짜 오류' : '오탐') : '미판정'} | ${r ? r.note || '' : ''} |`); }
    const judged = [...cnt.keys()].filter((k) => review[k]);
    const falseN = judged.filter((k) => review[k].verdict === 'false').length;
    if (judged.length) console.log(`판정한 ${judged.length}개 키 중 오탐 ${falseN} (${Math.round((falseN / judged.length) * 100)}%)`);
}
function label(key, verdict, note) {
    const f = path.join(OUT, 'fp-review.json');
    const r = readJson(f, {});
    r[key] = { verdict, note: note || '', at: Date.now() };
    writeJson(f, r);
    console.log(`기록: ${key} → ${verdict}`);
}

// ── CLI ──
async function main() {
    const [cmd = 'status', ...rest] = process.argv.slice(2);
    const flag = (k) => rest.find((a) => a === `--${k}` || a.startsWith(`--${k}=`));
    const val = (k) => { const a = flag(k); return a && a.includes('=') ? a.split('=').slice(1).join('=') : null; };
    if (cmd === 'tick') return tick();
    if (cmd === 'run') {
        mkdir(OUT);
        const symbols = (val('symbols') || '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
        const r = await runOnce({ symbols, tag: val('tag'), noConfirm: !!flag('no-confirm'), noHub: !!flag('no-hub'), noNotify: !!flag('no-notify'), noBig: !!flag('no-big'), probe: !flag('no-probe') });
        if (flag('json')) console.log(JSON.stringify(r.sum));
        for (const f of r.findings.filter((x) => x.sev === 'error' || (flag('all') && x.sev !== 'info'))) console.log(`  ${f.sev === 'error' ? '✗' : '·'} ${f.sym || f.door} [${f.door}] ${f.code}: ${f.msg}`);
        return;
    }
    if (cmd === 'install') return install();
    if (cmd === 'uninstall') return uninstall();
    if (cmd === 'status') return status();
    if (cmd === 'report') return report(Number(rest[0]) || 6);
    if (cmd === 'fp') return fp(Number(rest[0]) || 48);
    if (cmd === 'label') return label(rest[0], rest[1] === 'true' ? 'true' : 'false', rest.slice(2).join(' '));
    console.log('사용: tick | fp [시간] | label <키> true|false [메모] | run [--force --symbols=A,B --tag=x --no-confirm --no-hub --all --json] | install | uninstall | status | report [N]');
}
if (require.main === module) main().catch((e) => { console.error('[integrity] 치명적 실패:', e && e.stack || e); process.exit(1); });

module.exports = { judgeAll, runOnce, CHIPS, OUTSIDE, CORE, slotOf };
