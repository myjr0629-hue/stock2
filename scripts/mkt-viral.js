#!/usr/bin/env node
/* ============================================================================
 * mkt-viral — 바이럴 루프(공유 카드 + 추천 보상) 계측 읽기 · 바이럴 계수 k (2026-10-14, 브랜치 feat/viral-loop)
 *
 *   공유 단추 탭 → 공유 완료 → 받은 쪽 카드 열람 → «앱에서 이어 보기» 사람 클릭 → 앱 첫 실행 도착 → 초대 링크 터치와 매칭 → 초대자 보상 적립 → 번호 배정
 *   k = (그날 매칭된 설치) ÷ (그날 공유를 완료한 서로 다른 초대자 수). 분모가 0 이면 k 는 «—»(null) — 0 으로 지어내지 않는다.
 *   설치는 «IP 로 매칭된 것만» 세므로 k 는 항상 하한이다(IP 가 달라진 설치는 놓친다).
 *
 * 읽는 키(전부 EC2 레디스 — Upstash 명령 0, mkt-gift.js 와 같은 프록시 mget · 읽기 전용 — 쓰지 않는다. 정본: src/lib/invite/metrics.ts 머리말):
 *   share:tap|sent|open:<표면>:<via>:<ET날짜>      표면 = sh_pick·sh_line·sh_earn (+ 선물 gift_set·gift_dash·gift_pop → «gift» 묶음에 합산), via = ios|android|web|na
 *                                                    ※ 선물 gift_* 의 open 은 «1회 안내를 띄움»(gift_pop)이라 카드 열람이 아니다 → 카드 열람 칸에서 뺀다
 *   clk:sg:<태그>:<ET날짜>                          받은 쪽 «앱에서 이어 보기» 사람 클릭 — 필드 «<기기>|human» (태그 share_pick·share_line·share_earn·gift)
 *   clk:coupon:<태그>:<ET날짜>                      쿠폰 화면 — 필드 «<기기>|view:human»
 *   share:arrive:all:<ios|android>:<ET날짜>         앱을 새로 설치해 처음 실행했다고 앱이 알려 온 수(매칭 여부와 무관)
 *   share:match|credit:<표면>:<ios|android>:<ET날짜> 표면 = sh_pick·sh_line·sh_earn·gift
 *   share:mint:all:<ios|android>:<ET날짜>           번호 배정 — 표면을 모르는 시점이라 표면 «all» (합계 칸에만 쓴다)
 *   share:senders:<ET날짜>                          그날 공유를 완료한 서로 다른 초대 id 목록(JSON 배열) — 여기서는 «개수»만 쓰고 id 는 출력하지 않는다
 *
 * 사용: node scripts/mkt-viral.js [일수=3] [--probe] [--json]
 *   --probe = 프리뷰·로컬 시험 키(share:probe:* · clkp:*)   --json = HUD 용 단일 JSON 을 stdout «마지막 줄»에 한 줄로(표 앞에 사람 읽는 표도 같이 나온다)
 *   일부 키를 못 읽으면 JSON 의 err 에 «하한» 경고를 싣고 그 칸은 null(0 아님). 전부 못 읽으면 종료 코드 1.
 * 주의: 날짜는 ET. 매칭은 «보낸 날»이 아니라 «설치한 날»에 잡힌다 → 하루 단위 k 는 출렁인다(기간 k 가 더 믿을 만하다).
 *   번호·토큰·초대 id 값은 출력하지 않는다. .env.local 의 EC2_REDIS_PROXY_KEY 는 읽기만 하고 출력하지 않는다.
 * ========================================================================== */
'use strict';

const BASE = 'http://52.23.98.13:8081';
const VIAS = ['ios', 'android', 'web', 'na'];
const PLATS = ['ios', 'android'];
/** 표면 묶음 — entry = share:tap|sent|open 키의 표면 이름들, sg = clk:sg 태그, cardOpen = share:open 이 «카드 열람» 의미인가 */
const SURFACES = [
    { id: 'sh_pick', entry: ['sh_pick'], sg: 'share_pick', cardOpen: true },
    { id: 'sh_line', entry: ['sh_line'], sg: 'share_line', cardOpen: true },
    { id: 'sh_earn', entry: ['sh_earn'], sg: 'share_earn', cardOpen: true },
    { id: 'gift', entry: ['gift_set', 'gift_dash', 'gift_pop'], sg: 'gift', cardOpen: false },
];
const MAX_DAYS = 14;
const REAL_NS = { share: 'share', clk: 'clk' };
const PROBE_NS = { share: 'share:probe', clk: 'clkp' };

// ─────────────────────────────────────────────────────────────────────────────
// 순수 부분 (시험이 require 로 쓴다)
// ─────────────────────────────────────────────────────────────────────────────
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
/** null(= 못 읽음) 을 0 으로 바꾸지 않는 덧셈: 둘 다 null 이면 null */
const add = (a, b) => (a == null && b == null ? null : (a || 0) + (b || 0));
const addAll = (arr) => arr.reduce((acc, x) => add(acc, x), null);
const objOf = (v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    if (typeof v === 'string') { try { const j = JSON.parse(v); return j && typeof j === 'object' && !Array.isArray(j) ? j : {}; } catch { return {}; } }
    return {};
};
const idsOf = (v) => {
    let a = v;
    if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = []; } }
    return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : [];
};

const etDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
/** 최신 → 과거 순 ET 날짜. 달력(UTC 정오 기준) 산술이라 서머타임 경계에서도 하루가 겹치거나 빠지지 않는다. */
function etDates(days, now = Date.now()) {
    const [y, m, d] = etDay(new Date(now)).split('-').map(Number);
    return [...Array(days)].map((_, i) => new Date(Date.UTC(y, m - 1, d - i, 12)).toISOString().slice(0, 10));
}

/** 바이럴 계수 k — 분모가 0/없음이면 null (0 으로 지어내지 않는다) */
function kOf(match, senders) {
    if (match == null || senders == null || !(senders > 0)) return null;
    return match / senders;
}
const ratio = (a, b) => (a == null || b == null || !(b > 0) ? null : a / b);

/** 하루가 읽는 키 전부(중복 없음) */
function dayKeys(date, ns) {
    const keys = [];
    for (const s of SURFACES) {
        for (const e of s.entry) for (const v of VIAS) {
            keys.push(`${ns.share}:tap:${e}:${v}:${date}`, `${ns.share}:sent:${e}:${v}:${date}`);
            if (s.cardOpen) keys.push(`${ns.share}:open:${e}:${v}:${date}`);
        }
        keys.push(`${ns.clk}:sg:${s.sg}:${date}`, `${ns.clk}:coupon:${s.sg}:${date}`);
        for (const p of PLATS) keys.push(`${ns.share}:match:${s.id}:${p}:${date}`, `${ns.share}:credit:${s.id}:${p}:${date}`);
    }
    for (const p of PLATS) keys.push(`${ns.share}:arrive:all:${p}:${date}`, `${ns.share}:mint:all:${p}:${date}`);
    keys.push(`${ns.share}:senders:${date}`);
    return keys;
}

/** get(key) → 값 | null(키 없음 = 0) | undefined(못 읽음). 못 읽은 칸은 null 로 남기고 0 으로 채우지 않는다. */
function assembleDay(date, get, ns = REAL_NS) {
    const sumKeys = (keys) => {
        let n = 0, miss = 0;
        for (const k of keys) { const v = get(k); if (v === undefined) miss++; else n += num(v); }
        return { n: keys.length && miss === keys.length ? null : n, miss };
    };
    const surfaces = {};
    for (const s of SURFACES) {
        const keysFor = (e) => s.entry.flatMap((en) => VIAS.map((v) => `${ns.share}:${e}:${en}:${v}:${date}`));
        const sgV = get(`${ns.clk}:sg:${s.sg}:${date}`), cpV = get(`${ns.clk}:coupon:${s.sg}:${date}`);
        const sg = sgV === undefined ? null : objOf(sgV);
        const dev = (d) => (sg ? num(sg[`${d}|human`]) : null);
        const clkIos = dev('ios'), clkAndroid = dev('android'), clkDesktop = dev('desktop');
        let coupon = null;
        if (cpV !== undefined) coupon = Object.entries(objOf(cpV)).reduce((a, [f, n]) => a + (/\|view:human$/.test(f) ? num(n) : 0), 0);
        surfaces[s.id] = {
            tap: sumKeys(keysFor('tap')).n, sent: sumKeys(keysFor('sent')).n,
            open: s.cardOpen ? sumKeys(keysFor('open')).n : null,
            clkIos, clkAndroid, clkDesktop, clk: addAll([clkIos, clkAndroid, clkDesktop]), coupon,
            match: sumKeys(PLATS.map((p) => `${ns.share}:match:${s.id}:${p}:${date}`)).n,
            credit: sumKeys(PLATS.map((p) => `${ns.share}:credit:${s.id}:${p}:${date}`)).n,
        };
    }
    const sv = get(`${ns.share}:senders:${date}`);
    const ids = sv === undefined ? null : idsOf(sv);
    const arriveIos = sumKeys([`${ns.share}:arrive:all:ios:${date}`]).n, arriveAndroid = sumKeys([`${ns.share}:arrive:all:android:${date}`]).n;
    const all = Object.values(surfaces);
    const col = (f) => addAll(all.map((x) => x[f]));
    const keys = dayKeys(date, ns);
    const miss = keys.filter((k) => get(k) === undefined).length;
    const matchMiss = SURFACES.reduce((a, s) => a + PLATS.filter((p) => get(`${ns.share}:match:${s.id}:${p}:${date}`) === undefined).length, 0);
    const day = {
        date, surfaces,
        tap: col('tap'), sent: col('sent'), open: col('open'),
        clkIos: col('clkIos'), clkAndroid: col('clkAndroid'), clkDesktop: col('clkDesktop'), clk: col('clk'), coupon: col('coupon'),
        arrive: add(arriveIos, arriveAndroid), arriveIos, arriveAndroid,
        match: col('match'), credit: col('credit'),
        mint: sumKeys(PLATS.map((p) => `${ns.share}:mint:all:${p}:${date}`)).n,
        senders: ids ? ids.length : null, ids,
        keys: keys.length, miss,
    };
    day.k = kOf(day.match, day.senders);
    day.kLower = day.k != null && matchMiss > 0;       // 분자 일부를 못 읽었다 → k 는 그만큼 더 낮게 보인다
    return day;
}

/** 일자 배열(최신→과거) → 기간 요약. 분모(초대자)를 하루라도 못 읽으면 기간 k 는 null — 낮게 센 분모로 k 를 부풀리지 않는다. */
function summarize(days) {
    const col = (f) => addAll(days.map((d) => d[f]));
    const surfaces = SURFACES.map((s) => {
        const c = (f) => addAll(days.map((d) => d.surfaces[s.id][f]));
        return { id: s.id, tap: c('tap'), sent: c('sent'), open: c('open'), clkIos: c('clkIos'), clkAndroid: c('clkAndroid'), clkDesktop: c('clkDesktop'), clk: c('clk'), coupon: c('coupon'), match: c('match'), credit: c('credit') };
    });
    const sendersUnread = days.filter((d) => d.senders == null).length;
    const uniq = new Set(); let idSum = null;
    for (const d of days) if (d.ids) { d.ids.forEach((x) => uniq.add(x)); idSum = add(idSum, d.ids.length); }
    const readAny = days.some((d) => d.ids);
    const sendersUnique = readAny ? uniq.size : null;
    const total = {
        tap: col('tap'), sent: col('sent'), open: col('open'),
        clkIos: col('clkIos'), clkAndroid: col('clkAndroid'), clkDesktop: col('clkDesktop'), clk: col('clk'), coupon: col('coupon'),
        arrive: col('arrive'), arriveIos: col('arriveIos'), arriveAndroid: col('arriveAndroid'),
        match: col('match'), credit: col('credit'), mint: col('mint'),
        sendersUnique, sendersDaySum: idSum, sendersUnread,
    };
    total.k = sendersUnread ? null : kOf(total.match, sendersUnique);
    const phoneClk = add(total.clkIos, total.clkAndroid);
    const unread = days.reduce((a, d) => a + d.miss, 0), keys = days.reduce((a, d) => a + d.keys, 0);
    return {
        total, surfaces,
        conv: { sentToClick: ratio(total.clk, total.sent), clickToMatch: ratio(total.match, phoneClk), matchToCredit: ratio(total.credit, total.match) },
        keys, unread,
    };
}

/** 대표용 한 줄 — 값이 못 읽힌 칸은 «–», k 분모 0 이면 «—» */
function headline(sum) {
    const t = sum.total, f = (n) => (n == null ? '–' : String(n));
    return `바이럴 k ${t.k == null ? '—' : t.k.toFixed(2)} · 초대자 ${f(t.sendersUnique)}명 → 공유 ${f(t.sent)} → 카드 열람 ${f(t.open)} → 앱 클릭 ${f(t.clk)} → 설치 매칭 ${f(t.match)} → 보상 ${f(t.credit)}`;
}

/** HUD 가 읽는 단일 JSON 객체(id 목록은 싣지 않는다) */
function toJson(days, sum, meta) {
    const slim = (d) => ({
        date: d.date, senders: d.senders, tap: d.tap, sent: d.sent, open: d.open,
        clkIos: d.clkIos, clkAndroid: d.clkAndroid, clkDesktop: d.clkDesktop, clk: d.clk, coupon: d.coupon,
        arrive: d.arrive, arriveIos: d.arriveIos, arriveAndroid: d.arriveAndroid, match: d.match, credit: d.credit, mint: d.mint,
        k: d.k, kLower: d.kLower, unread: d.miss,
    });
    const daily = days.map(slim);
    const pick = (d) => (d ? { date: d.date, k: d.k, senders: d.senders, match: d.match, sent: d.sent } : null);
    let err = null;
    if (sum.unread) err = `키 ${sum.keys}개 중 ${sum.unread}개를 못 읽음 — 못 읽은 칸은 null 이고 읽은 칸의 합은 «하한»이다${sum.total.sendersUnread ? ' · 초대자 수를 못 읽은 날이 있어 기간 k 는 비운다' : ''}`;
    return {
        kind: 'viral', v: 1, at: meta.at, probe: !!meta.probe, days: days.length,
        etFrom: days[days.length - 1].date, etTo: days[0].date,
        today: pick(daily[0]), yesterday: pick(daily[1]),
        daily, total: sum.total, surfaces: sum.surfaces, conv: sum.conv,
        line: headline(sum), keys: sum.keys, unread: sum.unread, err,
    };
}

module.exports = { SURFACES, VIAS, PLATS, REAL_NS, PROBE_NS, num, add, addAll, kOf, ratio, etDates, dayKeys, assembleDay, summarize, headline, toJson };

// ─────────────────────────────────────────────────────────────────────────────
// 실행부 (직접 실행할 때만)
// ─────────────────────────────────────────────────────────────────────────────
if (require.main === module) {
    const fs = require('fs');
    const path = require('path');
    const ROOT = path.resolve(__dirname, '..');
    let KEY;
    try { KEY = (fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').match(/^EC2_REDIS_PROXY_KEY=(.+)$/m) || [])[1]?.trim(); } catch { /* 아래에서 처리 */ }
    if (!KEY) { console.error('.env.local 에 EC2_REDIS_PROXY_KEY 가 없다.'); process.exit(1); }

    const argv = process.argv.slice(2);
    const PROBE = argv.includes('--probe'), JSON_OUT = argv.includes('--json');
    const daysArg = Number(argv.find((a) => /^\d+$/.test(a)) || 3);
    const days = Math.min(MAX_DAYS, Math.max(1, daysArg || 3));
    const NS = PROBE ? PROBE_NS : REAL_NS;
    const dates = etDates(days);

    /** 60개씩 mget — 못 읽은 묶음의 칸은 undefined(0 이 아니다) */
    async function mget(keys) {
        const out = [];
        for (let i = 0; i < keys.length; i += 60) {
            const part = keys.slice(i, i + 60);
            let res = null;
            for (let k = 0; k < 3 && !res; k++) {
                try {
                    const r = await fetch(`${BASE}/mget?keys=${part.map(encodeURIComponent).join(',')}`, { headers: { Authorization: 'Bearer ' + KEY }, signal: AbortSignal.timeout(20000) });
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    const j = await r.json();
                    if (!Array.isArray(j.results) || j.results.length !== part.length) throw new Error('응답 모양');
                    res = j.results;
                } catch { await new Promise((z) => setTimeout(z, 300 * (k + 1))); }
            }
            out.push(...(res || part.map(() => undefined)));
        }
        return out;
    }

    (async () => {
        const keys = [...new Set(dates.flatMap((d) => dayKeys(d, NS)))];
        const vals = await mget(keys);
        const map = new Map(keys.map((k, i) => [k, vals[i]]));
        const get = (k) => map.get(k);
        const dayList = dates.map((d) => assembleDay(d, get, NS));
        const sum = summarize(dayList);
        const js = toJson(dayList, sum, { at: Date.now(), probe: PROBE });

        const f = (n) => (n == null ? '–' : String(n));
        const p = (n, w) => f(n).padStart(w);
        const kTxt = (k, lower) => (k == null ? '—' : k.toFixed(2) + (lower ? '↑' : ''));
        const pct = (r) => (r == null ? '–' : (r * 100).toFixed(r < 0.1 && r > 0 ? 1 : 0) + '%');
        const dw = (t) => [...t].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);     // 한글은 두 칸
        const row = (label, x) => `   ${label}${' '.repeat(Math.max(1, 10 - dw(label)))}${p(x.tap, 4)} ${p(x.sent, 5)} ${p(x.open, 5)}   ${p(x.clk, 4)} (${f(x.clkIos)}·${f(x.clkAndroid)}·${f(x.clkDesktop)})   ${p(x.coupon, 4)} ${p(x.match, 5)} ${p(x.credit, 5)}`;
        const HEAD = '   표면        탭  공유  열람   앱클릭(아이폰·안드·PC)   쿠폰  매칭  적립';
        const nonzero = (x) => [x.tap, x.sent, x.open, x.clk, x.coupon, x.match, x.credit].some((n) => n);

        {
            console.log(`바이럴 루프 · 최근 ${days}일(ET ${dates[dates.length - 1]} ~ ${dates[0]}) · 키 ${NS.share}:* ${NS.clk}:*${PROBE ? '  ← 시험 키(--probe)' : ''}`);
            if (sum.unread) console.log(`⛔ 키 ${sum.keys}개 중 ${sum.unread}개를 못 읽었다 — 못 읽은 칸은 «–», 아래 합은 «하한»이다. 다시 돌릴 것.`);
            console.log(`\n한 줄: ${headline(sum)}\n`);

            console.log('① 일자별 (표면: sh_pick·sh_line·sh_earn = 공유 카드, gift = 선물 링크. 열람 «–» = 선물은 카드 페이지가 없다)');
            for (const d of dayList) {
                console.log(`${d.date}  초대자 ${f(d.senders)} · 도착 ${f(d.arrive)} (아이폰 ${f(d.arriveIos)}·안드 ${f(d.arriveAndroid)}) · 번호 배정 ${f(d.mint)} · k ${kTxt(d.k, d.kLower)}${d.k == null && d.match ? `  (매칭 ${d.match}, 초대자 ${f(d.senders)} → k 없음)` : ''}`);
                const active = SURFACES.filter((s) => nonzero(d.surfaces[s.id]));
                if (active.length) {
                    console.log(HEAD);
                    for (const s of active) console.log(row(s.id, d.surfaces[s.id]));
                    console.log(row('합계', d));
                } else console.log('   (활동 없음)');
            }

            console.log(`\n② 기간 합계 (${days}일)`);
            console.log(HEAD);
            for (const s of sum.surfaces) console.log(row(s.id, s));
            console.log(row('합계', sum.total));
            const t = sum.total;
            console.log(`   도착 ${f(t.arrive)} (아이폰 ${f(t.arriveIos)}·안드 ${f(t.arriveAndroid)}) · 번호 배정 ${f(t.mint)} · 초대자 ${f(t.sendersUnique)}명(기간 중 서로 다른 id, 일별 합 ${f(t.sendersDaySum)})`);
            console.log(`   k(기간) = 매칭 ${f(t.match)} ÷ 초대자 ${f(t.sendersUnique)} = ${kTxt(t.k, false)}${t.sendersUnread ? '  ← 초대자 수를 못 읽은 날이 있어 비움' : ''}`);
            console.log(`   전환: 공유 완료 ${f(t.sent)} → 사람 클릭 ${f(t.clk)} (${pct(sum.conv.sentToClick)}) → 설치 매칭 ${f(t.match)} (폰 클릭 대비 ${pct(sum.conv.clickToMatch)}) → 적립 ${f(t.credit)} (매칭 대비 ${pct(sum.conv.matchToCredit)})`);
            console.log('\n   k 는 «IP 로 매칭된 설치»만 센 하한이다 — IP 가 달라진 설치는 빠진다. 매칭은 설치한 날에 잡히므로 하루 k 는 출렁인다(기간 k 를 볼 것).');
            console.log('   앱 클릭에는 PC 가 포함돼 있다(설치로 이어질 수 없음) — 클릭→매칭 전환은 폰 클릭만 분모로 쓴다. 열람 칸은 공유 카드 3종만 센다.');
        }
        if (JSON_OUT) console.log(JSON.stringify(js));     // 반드시 마지막 줄 한 줄
        if (sum.unread >= sum.keys) process.exitCode = 1;   // 전부 못 읽음 — 수집기가 «이전 값 + err» 로 처리한다
    })().catch((e) => {
        const msg = String(e && e.message || e).split('\n')[0].slice(0, 120);
        if (JSON_OUT) console.log(JSON.stringify({ kind: 'viral', v: 1, at: Date.now(), err: '실행 실패: ' + msg }));
        else console.error('실행 실패:', msg);
        process.exitCode = 1;
    });
}
