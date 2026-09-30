// 의회 거래 원천 페이지 넘김·커버리지 고정 테스트 — `node scripts/test-congress-coverage.ts`
// (Node 22.18+ 타입 제거로 바로 돈다. congressTrades.ts 는 import 가 없어 경로 별칭이 필요 없다.)
// FMP 를 흉내낸다: 원마다 공시일 내림차순 행을 만들고 page·limit 으로 잘라 준다.
process.env.FMP_API_KEY = 'test';

type Row = { symbol: string; type: string; transactionDate: string; disclosureDate: string; amount: string; firstName: string; lastName: string; link: string };
const DAY = 86400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const NOW = Date.now();

/** 오늘부터 과거로 perDay 건씩 days 일치 — 공시일 내림차순, 매매일은 공시 lag 일 전 */
function makeRows(days: number, perDay: number, tickers: string[], lag = 20): Row[] {
    const out: Row[] = [];
    for (let d = 0; d < days; d++) {
        for (let i = 0; i < perDay; i++) {
            const disc = NOW - d * DAY;
            out.push({
                symbol: i % 7 === 0 ? '' : tickers[(d + i) % tickers.length], // 티커 없는 행(채권 등)도 섞는다
                type: i % 11 === 0 ? 'Exchange' : i % 3 === 0 ? 'Purchase' : 'Sale (Full)',
                transactionDate: iso(disc - lag * DAY),
                disclosureDate: iso(disc),
                amount: '$1,001 - $15,000',
                firstName: `F${i % 5}`, lastName: `L${i % 5}`,
                link: `https://example.test/${d}/${i}`,
            });
        }
    }
    return out;
}

type Plan = { rows: Row[]; fail?: Record<number, number | 'throw' | 'abort'>; limitCap?: number; offsetBy?: number };
let plans: Record<string, Plan> = {};
const calls: string[] = [];
(globalThis as any).fetch = async (input: any) => {
    const u = new URL(String(input));
    const path = u.pathname.split('/').pop()!;
    const page = Number(u.searchParams.get('page'));
    const limit = Number(u.searchParams.get('limit'));
    calls.push(`${path}:${page}`);
    const p = plans[path];
    const f = p.fail?.[page];
    if (f === 'throw') throw new Error('network');
    if (f === 'abort') { const e: any = new Error('aborted'); e.name = 'AbortError'; throw e; }
    if (typeof f === 'number') return new Response(JSON.stringify({ 'Error Message': 'x' }), { status: f });
    const eff = Math.min(limit, p.limitCap ?? limit);
    const off = page * (p.offsetBy ?? eff);
    return new Response(JSON.stringify(p.rows.slice(off, off + eff)), { status: 200, headers: { 'content-type': 'application/json' } });
};

const m = await import('../src/services/congressTrades.ts');
let fails = 0;
const ok = (cond: boolean, msg: string) => { if (!cond) { fails++; console.log('  ✗', msg); } else console.log('  ✓', msg); };
const win90 = m.windowStart(90, NOW);
const T = ['NVDA', 'TKNO', 'AAPL', 'MSFT', 'GS', 'JPM', 'TSLA'];

async function run(name: string, p: Record<string, Plan>) {
    plans = p; calls.length = 0;
    const r = await m.getCongressTrades();
    console.log(`\n[${name}] calls=${calls.length} ` + r.coverage.chambers.map((c: any) => `${c.chamber}:${c.stop}/p${c.pages}/from=${c.coveredFrom}`).join(' '));
    return r;
}

// A. 정상 — 하원은 하루 40건(=104일에 17쪽이 필요하지만 상한 12쪽) … 먼저 상한에 안 걸리는 양으로
{
    const r = await run('A 정상', { 'senate-latest': { rows: makeRows(200, 5, T) }, 'house-latest': { rows: makeRows(200, 20, T) } });
    const [s, h] = r.coverage.chambers;
    ok(s.stop === 'cutoff' && h.stop === 'cutoff', '두 원 모두 cutoff 에서 멈춘다');
    ok(h.pages === Math.ceil((104 + 1) * 20 / 250) || h.pages === Math.ceil((104 + 1) * 20 / 250) + 1, `하원 페이지 수가 창(104일)만큼 — ${h.pages}쪽`);
    ok(r.coverage.complete === true, 'complete=true');
    ok(r.coverage.coveredFrom !== null && r.coverage.coveredFrom <= win90, `coveredFrom(${r.coverage.coveredFrom}) ≤ 창 시작(${win90})`);
    ok(s.outOfOrder === 0 && h.outOfOrder === 0, '정렬 어긋남 0');
    ok(calls.length === s.pages + h.pages, `FMP 호출 = 페이지 수(${calls.length})`);
    // 페이지 넘김이 창 안 거래를 하나도 안 놓쳤나: 원본에서 직접 센 것과 같아야 한다
    const all = [...makeRows(200, 5, T), ...makeRows(200, 20, T)];
    for (const tk of ['TKNO', 'NVDA']) {
        const truth = all.filter((x) => x.symbol === tk && !/exchange/i.test(x.type) && x.transactionDate >= win90).length;
        const sig = m.foldByTicker(r.trades, 90).find((x: any) => x.ticker === tk)!;
        const rows = r.trades.filter((t: any) => t.ticker === tk && m.inWindow(t, win90)).length;
        ok(sig.buys + sig.sells === truth && rows === truth, `${tk}: 신호 ${sig.buys}+${sig.sells} = 행 ${rows} = 원본 ${truth}`);
    }
    // 순서: 공시일 내림차순, 같은 날은 매매일 내림차순
    const sorted = r.trades.every((t: any, i: number, a: any[]) => i === 0 || a[i - 1].disclosureDate > t.disclosureDate || (a[i - 1].disclosureDate === t.disclosureDate && a[i - 1].transactionDate >= t.transactionDate));
    ok(sorted, '공시일↓·매매일↓ 정렬');
}

// B. 하원 3쪽에서 429 → 받은 데까지 쓰고 불완전
{
    const r = await run('B 429', { 'senate-latest': { rows: makeRows(200, 5, T) }, 'house-latest': { rows: makeRows(200, 20, T), fail: { 3: 429 } } });
    const h = r.coverage.chambers[1];
    ok(h.stop === 'rate-limited' && h.pages === 3, `하원 rate-limited, 3쪽까지(${h.pages})`);
    ok(r.coverage.complete === false, 'complete=false');
    ok(h.coveredFrom !== null && h.coveredFrom > win90, `하원 coveredFrom(${h.coveredFrom})은 창 시작보다 뒤`);
    ok(r.trades.some((t: any) => t.chamber === 'house'), '받은 하원 행은 버리지 않는다');
}

// C. 첫 페이지가 빈 배열 → «공시 0건»이 아니라 실패
{
    const r = await run('C 빈 첫 페이지', { 'senate-latest': { rows: [] }, 'house-latest': { rows: makeRows(200, 20, T) } });
    const s = r.coverage.chambers[0];
    ok(s.stop === 'empty' && s.coveredFrom === null, '상원 empty · coveredFrom=null');
    ok(r.coverage.complete === false && r.coverage.coveredFrom === null, '전체 complete=false');
}

// D. 원천이 limit 을 안 지킨다(100건만 주고 오프셋은 250씩) → 사이가 빈다 → 보장 없음
{
    const r = await run('D 짧은 페이지 뒤 행', { 'senate-latest': { rows: makeRows(200, 5, T), limitCap: 100, offsetBy: 250 }, 'house-latest': { rows: makeRows(200, 20, T) } });
    const s = r.coverage.chambers[0];
    ok(s.coveredFrom === null, `상원 coveredFrom=null (pageRows=${s.pageRows.join(',')})`);
    ok(r.coverage.complete === false, 'complete=false');
}

// E. 원천이 창보다 짧다 → 빈 페이지에서 exhausted, 전부 받음
{
    const r = await run('E 원천 끝', { 'senate-latest': { rows: makeRows(30, 10, T) }, 'house-latest': { rows: makeRows(200, 20, T) } });
    const s = r.coverage.chambers[0];
    ok(s.stop === 'exhausted' && s.coveredFrom === '', `상원 exhausted · coveredFrom="" (pageRows=${s.pageRows.join(',')})`);
    ok(r.coverage.complete === true, 'complete=true');
}

// F. 하원이 너무 많아 상한(12쪽)에 걸린다 → 창을 못 덮으면 불완전
{
    const r = await run('F 페이지 상한', { 'senate-latest': { rows: makeRows(200, 5, T) }, 'house-latest': { rows: makeRows(200, 60, T) } });
    const h = r.coverage.chambers[1];
    ok(h.stop === 'page-cap' && h.pages === 12, `하원 page-cap 12쪽(${h.pages})`);
    ok(r.coverage.complete === false, `complete=false (coveredFrom=${r.coverage.coveredFrom})`);
    ok(calls.filter((c) => c.startsWith('house')).length === 12, '하원 호출은 상한 12회를 넘지 않는다');
}

// G. 정렬이 어긋난 행 → outOfOrder 로 세고, cutoff 에서 멈췄으면 여유를 믿고 목표일까지만 보장
{
    const rows = makeRows(200, 5, T);
    const moved = rows.splice(260, 1)[0]; // 2쪽 행 하나를 뒤(3쪽)로
    rows.splice(560, 0, moved);
    const r = await run('G 정렬 어긋남', { 'senate-latest': { rows }, 'house-latest': { rows: makeRows(200, 20, T) } });
    const s = r.coverage.chambers[0];
    ok(s.outOfOrder > 0, `outOfOrder=${s.outOfOrder}`);
    ok(s.stop === 'cutoff' && s.coveredFrom === r.coverage.target, `coveredFrom = 목표일(${r.coverage.target})`);
}

// H. 첫 페이지 네트워크 실패/시간초과
{
    const r = await run('H 첫 페이지 실패', { 'senate-latest': { rows: makeRows(200, 5, T), fail: { 0: 'abort' } }, 'house-latest': { rows: makeRows(200, 20, T), fail: { 0: 500 } } });
    ok(r.trades.length === 0, '행 0 → 라우트가 실패 기억·마지막 정상본으로 간다');
    ok(r.coverage.chambers[0].stop === 'timeout' && r.coverage.chambers[1].stop === 'http-error', 'timeout · http-error');
}

// I. 같은 인스턴스의 동시 캐시 미스는 수집 1회를 나눠 쓴다
{
    plans = { 'senate-latest': { rows: makeRows(200, 5, T) }, 'house-latest': { rows: makeRows(200, 20, T) } };
    calls.length = 0;
    const [a, b, c] = await Promise.all([m.getCongressTrades(), m.getCongressTrades(), m.getCongressTrades()]);
    const pages = a.coverage.chambers.reduce((s: number, x: any) => s + x.pages, 0);
    ok(a === b && b === c && calls.length === pages, `동시 3요청 → 호출 ${calls.length}회(=한 번 수집 ${pages}쪽)`);
    await m.getCongressTrades();
    ok(calls.length === pages * 2, '끝난 뒤의 새 요청은 새로 수집한다');
}

// J. coversWindow: 창이 넓어지면 불완전
{
    const cov = { coveredFrom: m.windowStart(104, NOW) };
    ok(m.coversWindow(cov, 90, NOW) === true && m.coversWindow(cov, 104, NOW) === true && m.coversWindow(cov, 200, NOW) === false, 'coversWindow 90·104=참, 200=거짓');
    ok(m.coversWindow({ coveredFrom: null }, 90, NOW) === false && m.coversWindow(null, 90, NOW) === false, 'null 은 거짓');
}

console.log(fails ? `\n❌ ${fails}건 실패` : '\n✅ 전부 통과');
process.exit(fails ? 1 : 0);
