/**
 * 옵션 EOD 수집기 — 크론 흐름 전체를 가짜 벤더·가짜 Redis 프록시로 돌린다(2026-10-03 «묶음이 공급사 판을 늦게 따라간다» 수리)
 * 실행: node tests/optionsEodCollector.flow.test.js
 *
 * 수집기를 «운영과 같은 명령»(--auto)으로 자식 프로세스로 띄운다. 바꾸는 것은 주소(INTRINIO_BASE·REDIS_PROXY_URL)와 시계(OPT_NOW_MS)뿐.
 * 지키는 것(한 번도 안 돈 분기를 미리 돈다):
 *   1 저녁 · 대표 종목 미게시 → 아무것도 안 쓴다(벤더 호출 5번)
 *   2 저녁 · 판 첫 확인 → 시각만 적고 안 받는다 / 3 30분 전 → 안 받는다
 *   4 30분 뒤 → 전 종목 받아 묶음(source api, date D, prevDate D-1)을 쓴다 · 기준선·플로우 이력은 그대로
 *   5 같은 저녁 다시 → «이미 D» 로 끝 / 6 밤 · 벌크 D → 대조(전부 같음) 뒤 벌크로 덮고 기준선·이력 확정
 *   7 새 벌크 없음 → 파일을 받지 않고 끝 / 8 주말 저녁 → 저녁 경로 없음
 *   9 지각 종목 1개(1/60) → 묶음엔 D 종목만, 지각 종목은 stale 에 «제 날짜»로 · 지수 ETF 지각 → 안 쓴다
 *   10 덜 찬 벌크(9/28 첫 파일 같은) → 묶음은 저녁 것을 남기고 기준선·이력은 벌크로
 *   11 기준선이 직전 거래일이 아니면 → 저녁 경로가 쓰지 않는다
 *   12 종목 하나가 반쯤만 올라옴(계약 수 직전의 50% 미만) → 지각으로 센다
 */
const assert = require("node:assert/strict");
const http = require("http");
const zlib = require("zlib");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const SCRIPT = path.join(__dirname, "../scripts/intrinio-options-eod.js");
let n = 0;
const ta = async (name, fn) => { await fn(); n++; console.log(`  ✓ ${name}`); };

// ── 가짜 자료: 60종목(지수 ETF 4 포함) × 종목당 220계약 ≥ 정합성 게이트(채택 1만 행) ─────────
const D0 = "2026-10-01", D = "2026-10-02";
const SYMS = ["SPY", "QQQ", "IWM", "DIA", "NVDA", "AAPL", "TSLA"].concat(Array.from({ length: 53 }, (_, i) => `T${String(i).padStart(2, "0")}`));
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const r5 = (x) => Math.round(x * 1e5) / 1e5;
function contractsFor(sym, date, seed) {
    const R = rng(seed + sym.split("").reduce((a, c) => a + c.charCodeAt(0), 0));
    const out = [];
    for (let i = 0; i < 220; i++) {
        const isCall = i % 2 === 0;
        const k = 50 + Math.floor(i / 2) * 2.5;
        const exp = i < 110 ? "2026-10-16" : "2027-01-15";
        const yymmdd = exp.slice(2, 4) + exp.slice(5, 7) + exp.slice(8, 10);
        const code = `${sym}${yymmdd}${isCall ? "C" : "P"}${String(Math.round(k * 1000)).padStart(8, "0")}`;
        const base = Math.floor(R() * 40000) + 60;
        out.push({ code, sym, exp, strike: k, type: isCall ? "call" : "put",
            oi: date === D0 ? base : base + Math.floor((R() - 0.4) * 3000), vol: Math.floor(R() * 9000) + i,
            iv: r5(0.2 + R()), delta: r5(isCall ? R() : -R()), gamma: r5(R() / 100) });
    }
    return out;
}
const DATA = { [D0]: {}, [D]: {} };
for (const s of SYMS) { DATA[D0][s] = contractsFor(s, D0, 1); DATA[D][s] = contractsFor(s, D, 1); }

// ── 벌크 ZIP(로컬 헤더 하나 + deflate) — 수집기는 첫 로컬 헤더만 읽고 흘린다 ─────────
function bulkZip(date, symsIn) {
    const head = "CONTRACT,SYMBOL,EXPIRATION,STRIKE,TYPE,EXERCISE_STYLE,DATE,CLOSE,VOLUME,OPEN_INTEREST,IMPLIED_VOLATILITY,DELTA,GAMMA";
    const lines = [head];
    for (const s of symsIn) for (const c of DATA[date][s]) {
        const root = c.code.slice(0, c.code.length - 15).padEnd(6, "_");
        lines.push([root + c.code.slice(-15), s, c.exp, c.strike.toFixed(1), c.type, "A", date, "1.0", c.vol || "", c.oi, c.iv, c.delta, c.gamma].join(","));
    }
    // 무관한 종목(유니버스 밖)·조정 기초(AZN1 같은) 행 — 버려져야 한다
    lines.push(["ZZZZ__261016C00010000", "ZZZZ", "2026-10-16", "10.0", "call", "A", date, "1.0", "5", "500", "0.5", "0.5", "0.01"].join(","));
    const csv = Buffer.from(lines.join("\n") + "\n");
    const comp = zlib.deflateRawSync(csv);
    const name = Buffer.from(`options_prices_eod_${date}.csv`);
    const hdr = Buffer.alloc(30);
    hdr.writeUInt32LE(0x04034b50, 0); hdr.writeUInt16LE(20, 4); hdr.writeUInt16LE(0, 6); hdr.writeUInt16LE(8, 8);
    hdr.writeUInt32LE(0, 14); hdr.writeUInt32LE(comp.length, 18); hdr.writeUInt32LE(csv.length, 22);
    hdr.writeUInt16LE(name.length, 26); hdr.writeUInt16LE(0, 28);
    return Buffer.concat([hdr, name, comp]);
}

// ── 가짜 서버(벤더 + Redis 프록시) ─────────────────────────────────────
const S = {
    store: {},            // key → 직렬화된 값(프록시와 같게 JSON.stringify(value))
    apiPublished: {},     // date → Set(종목) 공개된 것
    apiThin: {},          // date → { sym: 남길 계약 수 } 반쯤 올라온 종목
    bulk: {},             // date → Set(종목) 벌크에 든 것
    calls: { api: 0, apiOne: 0, links: 0, files: 0 },
};
function sendJson(res, obj, status = 200) { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); }
const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/get") return sendJson(res, { result: S.store[u.searchParams.get("key")] != null ? JSON.parse(S.store[u.searchParams.get("key")]) : null });
    if (u.pathname === "/set" && req.method === "POST") {
        let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { const { key, value } = JSON.parse(b); S.store[key] = JSON.stringify(value); sendJson(res, { ok: true }); });
        return;
    }
    if (u.pathname === "/bulk_downloads/links") {
        S.calls.links++;
        const links = Object.keys(S.bulk).sort().map((d) => ({ name: `options_prices_eod_${d}.zip`, url: `http://127.0.0.1:${server.address().port}/files/${d}.zip` }));
        return sendJson(res, { bulk_downloads: [{ name: "Intrinio Options EOD - (3am release) Full History", last_updated: "2026-10-03T06:17:00Z", links }] });
    }
    let m = u.pathname.match(/^\/files\/(\d{4}-\d{2}-\d{2})\.zip$/);
    if (m) { S.calls.files++; res.writeHead(200); res.end(bulkZip(m[1], [...S.bulk[m[1]]])); return; }
    m = u.pathname.match(/^\/options\/prices\/by_ticker\/([^/]+)\/eod$/);
    if (m) {
        const sym = decodeURIComponent(m[1]); const date = u.searchParams.get("date"); const ps = Number(u.searchParams.get("page_size"));
        if (ps === 1) S.calls.apiOne++; else S.calls.api++;
        const pub = S.apiPublished[date];
        if (!pub || !pub.has(sym)) return sendJson(res, { prices: [], next_page: null });
        let rows = DATA[date][sym].map((c) => ({
            option: { code: c.code, ticker: sym, expiration: c.exp, strike: c.strike, type: c.type },
            // float32 꼬리(벌크는 소수 5자리) — 수집기가 벌크와 같은 값으로 맞춰야 한다
            price: { date, volume: c.vol || null, open_interest: c.oi, implied_volatility: c.iv + 1e-9, delta: c.delta - 1e-9, gamma: c.gamma + 1e-12 },
        }));
        // 조정 기초 계약(벌크에선 별도 SYMBOL) — 수집기가 버려야 한다
        rows.push({ option: { code: `${sym}1270115C00010000`, ticker: `${sym}1`, expiration: "2027-01-15", strike: 10, type: "call" }, price: { date, volume: 999, open_interest: 99999 } });
        if (S.apiThin[date] && S.apiThin[date][sym] != null) rows = rows.slice(0, S.apiThin[date][sym]);
        if (ps === 1) return sendJson(res, { prices: rows.slice(0, 1), next_page: "more" });
        // 쪽 나눔(100행) — 수집기가 다음 쪽을 따라가야 한다
        const off = Number(u.searchParams.get("next_page") || 0);
        return sendJson(res, { prices: rows.slice(off, off + 100), next_page: off + 100 < rows.length ? String(off + 100) : null });
    }
    sendJson(res, { error: "not found" }, 404);
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "opt-eod-flow-"));
const ENVF = path.join(tmp, ".env");
fs.writeFileSync(ENVF, "INTRINIO_API_KEY=test-key\nREDIS_PROXY_KEY=test-proxy\n");
function run(nowIso, args = ["--max", "400", "--auto"]) {
    return new Promise((resolve) => {
        execFile(process.execPath, [SCRIPT, ...args], {
            env: { ...process.env, ENV_PATH: ENVF, REDIS_PROXY_URL: `http://127.0.0.1:${server.address().port}`, INTRINIO_BASE: `http://127.0.0.1:${server.address().port}`, OPT_NOW_MS: String(Date.parse(nowIso)), REDIS_PROXY_KEY: "", INTRINIO_API_KEY: "" },
            timeout: 120000,
        }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, out: stdout + stderr }));
    });
}
const get = (k) => (S.store[k] != null ? JSON.parse(JSON.parse(S.store[k]) === null ? "null" : typeof JSON.parse(S.store[k]) === "string" ? JSON.parse(S.store[k]) : S.store[k]) : null);
// 수집기는 묶음·기준선을 «JSON 문자열»로 set 한다 → 프록시가 한 번 더 감싼다. 꺼낼 때 두 번 푼다.
const bundle = () => { const v = S.store["intrinio:options:eod"]; if (v == null) return null; const x = JSON.parse(v); return typeof x === "string" ? JSON.parse(x) : x; };
const baseline = () => { const v = S.store["intrinio:options:oi"]; if (v == null) return null; const x = JSON.parse(v); return typeof x === "string" ? JSON.parse(x) : x; };
const flowHist = () => { const v = S.store["intrinio:options:flow:hist"]; if (v == null) return null; const x = JSON.parse(v); return typeof x === "string" ? JSON.parse(x) : x; };
const state = () => { const v = S.store["intrinio:options:eod:api-state"]; return v == null ? null : JSON.parse(v); };

// 초기 상태: 어제(D0) 벌크로 만든 묶음·기준선 — 운영과 같은 모양(직렬화 문자열)
function seed() {
    S.store = {}; S.apiPublished = {}; S.apiThin = {}; S.bulk = {}; S.calls = { api: 0, apiOne: 0, links: 0, files: 0 };
    // 유니버스 재료: [sym, …, 가격, 거래량]
    S.store["intrinio:eod:snapshot"] = JSON.stringify({ rows: SYMS.map((s, i) => [s, 0, 0, 0, 100 + i, 1e6]) });
}
async function seedYesterdayViaBulk() {
    // 어제 판을 «벌크 경로로» 실제로 만든다(기준선 D0 · 묶음 D0) — 그 전날 기준선이 없으니 첫 실행과 같다
    S.bulk[D0] = new Set(SYMS);
    const r = await run("2026-10-02T06:20:00Z", ["--max", "400", "--source", "bulk"]);
    assert.equal(r.code, 0, r.out);
    assert.equal(bundle().date, D0); assert.equal(baseline().date, D0);
}

(async () => {
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    try {
        seed(); await seedYesterdayViaBulk();
        const b0 = bundle();

        await ta("1 저녁·대표 종목 미게시 → 아무것도 안 쓴다", async () => {
            const before = JSON.stringify(S.store);
            const r = await run("2026-10-02T21:20:00Z");
            assert.equal(r.code, 0, r.out);
            assert.match(r.out, /새 벌크 없음/); assert.match(r.out, /판 아직 — 대표 종목 미게시/);
            assert.equal(JSON.stringify(S.store), before);
            assert.equal(S.calls.api, 0);
        });

        S.apiPublished[D] = new Set(SYMS);
        await ta("2 저녁·판 첫 확인 → 시각만 적고 받지 않는다", async () => {
            const r = await run("2026-10-02T21:35:00Z");
            assert.match(r.out, /판 첫 확인/);
            assert.equal(bundle().date, D0); assert.equal(state().firstSeenAt, Date.parse("2026-10-02T21:35:00Z"));
            assert.equal(S.calls.api, 0);
        });
        await ta("3 첫 확인 15분 뒤 → 아직 받지 않는다", async () => {
            const r = await run("2026-10-02T21:50:00Z");
            assert.match(r.out, /판 첫 확인 15분 전/);
            assert.equal(bundle().date, D0); assert.equal(S.calls.api, 0);
        });
        await ta("4 30분 뒤 → 전 종목 받아 저녁 묶음(D) · 기준선·이력은 그대로", async () => {
            const histBefore = S.store["intrinio:options:flow:hist"];
            const r = await run("2026-10-02T22:05:00Z");
            assert.equal(r.code, 0, r.out);
            assert.match(r.out, /저녁 묶음 적재 완료 · 2026-10-02 · 60종목/);
            const b = bundle();
            assert.equal(b.date, D); assert.equal(b.prevDate, D0); assert.equal(b.source, "api");
            assert.equal(Object.keys(b.tickers).length, 60); assert.equal(b.stale, undefined);
            assert.equal(baseline().date, D0);                                  // 기준선은 벌크가 확정한다
            assert.equal(S.store["intrinio:options:flow:hist"], histBefore);
            assert.ok(S.calls.api >= 60 * 3);                                   // 종목당 3쪽(100행씩)
            assert.equal(state().done, true);
            // 조정 기초 계약은 버렸다(계약 수 = 220)
            assert.equal(b.tickers.NVDA.contracts, 220);
        });
        const apiBundle = bundle();

        await ta("5 같은 저녁 다시 → «이미 D» 로 끝(벤더 전체 수집 없음)", async () => {
            const c0 = S.calls.api;
            const r = await run("2026-10-02T22:20:00Z");
            assert.match(r.out, /묶음이 이미 2026-10-02\(api\)/);
            assert.equal(S.calls.api, c0);
        });

        S.bulk[D] = new Set(SYMS);
        await ta("6 밤·벌크 D → 저녁 묶음과 대조(전부 같음) 뒤 벌크로 덮고 기준선·이력 확정", async () => {
            const r = await run("2026-10-03T06:20:00Z");
            assert.equal(r.code, 0, r.out);
            assert.match(r.out, /저녁 묶음 대조 2026-10-02: 공통 60 중 같음 60 · 다름 0 · 저녁만 0 · 벌크만 0/);
            const b = bundle();
            assert.equal(b.source, "bulk"); assert.equal(b.date, D); assert.equal(b.prevDate, D0);
            // 같은 판 = 같은 값(종목 키 순서만 다를 수 있다)
            for (const s of SYMS) assert.deepEqual(b.tickers[s], apiBundle.tickers[s], s);
            assert.equal(baseline().date, D);
            assert.equal(flowHist().points.slice(-1)[0].date, D);
        });

        await ta("7 새 벌크 없음 → 파일을 받지 않고 끝", async () => {
            const f0 = S.calls.files;
            const r = await run("2026-10-03T06:35:00Z");
            assert.match(r.out, /새 벌크 없음 — 최신 2026-10-02 · 기준선 2026-10-02/);
            assert.equal(S.calls.files, f0);
        });

        await ta("8 주말 저녁 → 저녁 경로 없음", async () => {
            const r = await run("2026-10-03T22:05:00Z");
            assert.match(r.out, /대상 세션이 없다/);
        });

        // ── 지각 종목 ─────────────────────────────────────────────
        seed(); await seedYesterdayViaBulk();
        await ta("9 지각 1종목(1/60) → 묶음엔 D 종목만, 지각은 stale 에 제 날짜로 · 지수 ETF 지각이면 안 쓴다 · 대표 종목 지각이면 전체 수집도 안 한다", async () => {
            S.apiPublished[D] = new Set(SYMS.filter((s) => s !== "QQQ"));
            S.store["intrinio:options:eod:api-state"] = JSON.stringify({ date: D, attempts: 0, firstSeenAt: Date.parse("2026-10-02T21:00:00Z") });
            const c0 = S.calls.api;
            const r0 = await run("2026-10-02T21:50:00Z");
            assert.match(r0.out, /대표 종목 미게시 QQQ \(빈 응답\)/); assert.equal(S.calls.api, c0);
            S.apiPublished[D] = new Set(SYMS.filter((s) => s !== "IWM"));   // 지수 ETF 지만 대표 종목은 아니다(대표 관문을 지나 «지수 누락»까지 간다)
            S.store["intrinio:options:eod:api-state"] = JSON.stringify({ date: D, attempts: 0, firstSeenAt: Date.parse("2026-10-02T21:00:00Z") });
            const r1 = await run("2026-10-02T22:05:00Z");
            assert.match(r1.out, /지수 누락 IWM/); assert.match(r1.out, /덜 갖춰졌다/);
            assert.equal(bundle().date, D0); assert.equal(state().attempts, 1);
            // 지수가 아닌 종목 하나만 지각 → 98.3% → 쓴다
            S.apiPublished[D] = new Set(SYMS.filter((s) => s !== "T07"));
            const r2 = await run("2026-10-02T22:35:00Z");
            assert.equal(r2.code, 0, r2.out);
            const b = bundle();
            assert.equal(b.date, D); assert.equal(b.tickers.T07, undefined);
            assert.equal(b.stale.T07.date, D0); assert.equal(b.stale.T07.prevDate, b0.prevDate ?? null);
            assert.deepEqual({ ...b.stale.T07, date: undefined, prevDate: undefined }, { ...b0.tickers.T07, date: undefined, prevDate: undefined });
            // 밤 벌크(전 종목)가 오면 지각이 메워지고 stale 이 사라진다
            S.bulk[D] = new Set(SYMS);
            const r3 = await run("2026-10-03T06:20:00Z");
            assert.match(r3.out, /벌크만 1 \(T07\)/);
            assert.equal(bundle().source, "bulk"); assert.equal(bundle().stale, undefined); assert.ok(bundle().tickers.T07);
        });

        // ── 덜 찬 벌크 ───────────────────────────────────────────
        seed(); await seedYesterdayViaBulk();
        await ta("10 덜 찬 벌크 → 묶음은 저녁 것 유지, 기준선·이력은 벌크로", async () => {
            S.apiPublished[D] = new Set(SYMS);
            const r1 = await run("2026-10-02T23:00:00Z", ["--max", "400", "--source", "api", "--session", D]);
            assert.equal(r1.code, 0, r1.out); assert.equal(bundle().source, "api");
            S.bulk[D] = new Set(SYMS.slice(0, 50));    // 10종목 빠진 첫 파일
            const r2 = await run("2026-10-03T06:20:00Z");
            assert.equal(r2.code, 0, r2.out);
            assert.match(r2.out, /벌크가 저녁 묶음보다 덜 찼다/);
            assert.equal(bundle().source, "api"); assert.equal(Object.keys(bundle().tickers).length, 60);
            assert.equal(baseline().date, D);
        });

        // ── 기준선이 직전 거래일이 아님 ───────────────────────────
        seed(); await seedYesterdayViaBulk();
        await ta("11 기준선이 직전 거래일이 아니면(벌크 하루 빠짐) 저녁 경로가 쓰지 않는다", async () => {
            S.apiPublished["2026-10-05"] = new Set(SYMS); DATA["2026-10-05"] = DATA[D];
            S.store["intrinio:options:eod:api-state"] = JSON.stringify({ date: "2026-10-05", attempts: 0, firstSeenAt: 1 });
            const r = await run("2026-10-05T22:05:00Z");                // 월요일 저녁, 기준선은 10/01(금 10/02 벌크 없음)
            assert.match(r.out, /기준선 2026-10-01 ≠ 직전 거래일 2026-10-02/);
            assert.equal(bundle().date, D0);
        });

        // ── 반쯤 올라온 종목 ─────────────────────────────────────
        seed(); await seedYesterdayViaBulk();
        await ta("12 반쯤 올라온 종목(직전 계약 수의 50% 미만) → 지각으로 센다", async () => {
            S.apiPublished[D] = new Set(SYMS);
            S.apiThin[D] = { T11: 90 };
            const r = await run("2026-10-02T23:00:00Z", ["--max", "400", "--source", "api", "--session", D]);
            assert.equal(r.code, 0, r.out);
            assert.match(r.out, /덜 올라온 종목 1 — T11\(\d+\/220\)/);
            assert.equal(bundle().tickers.T11, undefined); assert.equal(bundle().stale.T11.date, D0);
        });
    } finally {
        server.close();
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    console.log(`\n${n}개 통과`);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
