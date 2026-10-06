// 2s10s 는 «화면 10Y 와 같은 세션»인지와 함께 — 2026-10-05(월) 마감 뒤 사례
// 실행: npx ts-node -T -O '{"moduleResolution":"node","module":"commonjs"}' -P tsconfig.tsnode.json -r tsconfig-paths/register tests/spread2s10sSession.test.ts
//
// 10/6 05:15 KST(10/5 16:15 ET) 앱 대시보드 «マクロ» 실측: «US 10Y 5.31% +3bp» 옆 «2s10s +45bp».
//   10Y  = 야후 ^TNX 10/5 종가 5.311 (10/2 종가 5.277 대비 +3bp)
//   2s10s = 재무부 곡선 10/2 행 5.28 − 4.83 = 45bp      ← 세션이 다른데 표식이 없었다
//   재무부 10/5 행: 10Y 5.31 · 2Y 4.84 → 47bp (10/6 09:0x KST 내려받은 CSV)
// 운영 로그(10/5 15:40~20:10 ET, «[MacroHub] YieldCurve»): 곡선 원천이 요청마다 갈렸다 —
//   FMP 10/5(16:10~) · EC2 Redis 10/2(크론 19:10 ET 전) · FRED 10/1(«FRED Treasury OK: 10Y=5.24%», 16:05 /api/market/macro)
//   → 2s10s 가 45·46·47bp 를 오갔고, FRED 층은 날짜가 ''라 그 10Y(5.24)가 헤드라인에 올라갈 수 있었다.

let total = 0, pass = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
    total++;
    if (cond) pass++;
    else { failures.push(`${name}: ${detail}`); console.log(`  ❌ ${name}: ${detail}`); }
}

// ── 재무부 CSV 원문 (daily_treasury_yield_curve 2026, 10/6 09:0x KST 내려받음) ──
const HEADER = 'Date,"1 Mo","1.5 Month","2 Mo","3 Mo","4 Mo","6 Mo","1 Yr","2 Yr","3 Yr","5 Yr","7 Yr","10 Yr","20 Yr","30 Yr"';
const CSV = [
    '10/05/2026,4.05,4.10,4.13,4.22,4.27,4.30,4.47,4.84,4.97,5.06,5.19,5.31,5.70,5.66',
    '10/02/2026,4.04,4.09,4.11,4.19,4.26,4.27,4.46,4.83,4.96,5.06,5.17,5.28,5.67,5.63',
    '10/01/2026,4.06,4.10,4.13,4.17,4.26,4.27,4.44,4.78,4.91,5.01,5.12,5.24,5.64,5.61',
    '09/30/2026,4.02,4.13,4.16,4.20,4.29,4.33,4.54,4.88,5.00,5.09,5.19,5.29,5.68,5.64',
];
const cols = HEADER.split(',').map((h) => h.replace(/"/g, ''));
const iso = (mdy: string) => `${mdy.slice(6, 10)}-${mdy.slice(0, 2)}-${mdy.slice(3, 5)}`;
const ust = CSV.map((line) => {
    const c = line.split(',');
    const v = (name: string) => Number(c[cols.indexOf(name)]);
    return { date: iso(c[0]), y2: v('2 Yr'), y5: v('5 Yr'), y10: v('10 Yr'), y30: v('30 Yr') };
});
const U = Object.fromEntries(ust.map((r) => [r.date, r]));

/** 그 날짜 행으로 만든 매크로 허브 곡선 (fetchYieldCurveData 모양) */
function curveOf(date: string, prevDate: string | null, source = 'US_TREASURY') {
    const r = U[date];
    return {
        us2y: r.y2, us10y: r.y10, spread2s10s: Math.round((r.y10 - r.y2) * 100) / 100, trend: 'NORMAL' as const,
        date, source,
        ...(prevDate ? { prevDate, prevUs10y: U[prevDate].y10 } : {}),
    };
}

// 야후 ^TNX (chart API 10/6 09:0x KST): 10/5 종가 5.311 · 10/2 종가 5.277 · regularMarketTime 18:59:51Z
const TNX = {
    level: 5.311, chgAbs: 0.034, chgPct: 0.6443, label: 'US 10Y', source: 'YAHOO' as const, status: 'OK' as const,
    symbolUsed: '^TNX', marketTime: '2026-10-05T18:59:51.000Z', updatedAt: '2026-10-05T20:14:30.000Z', feedSource: 'YAHOO' as any,
};

// 화면 쪽 판정을 대시보드와 똑같이 — page.tsx 의 2s10s 칸
async function dashCells(snapUs10y: any, yieldCurve: any) {
    const { yieldChangeBp, fmtBp, pairSpreadWith10y } = await import('../src/lib/yieldChange');
    const { sessionYmd, monthDay, closeLabel, etDateOfIso } = await import('../src/lib/marketSession');
    const pair = pairSpreadWith10y(yieldCurve, snapUs10y?.sessionDate ?? etDateOfIso(snapUs10y?.marketTime));
    const d = sessionYmd(pair.asOf);
    return {
        us10y: `${Number(snapUs10y.level).toFixed(2)}% ${fmtBp(yieldChangeBp(snapUs10y))}`,
        spread: fmtBp(pair.bp),
        asOf: d ? monthDay(d) : null,
        asOfKo: d ? closeLabel(d, 'ko') : null,
        pair,
    };
}

/** 운영 macroHubProvider.fetchMacroSnapshotFresh 의 10Y·곡선 결정 부분과 같은 순서 */
async function buildHeadline(fetched: any, prevSnapshotCurve: any, nowMs: number) {
    const { unifyUs10y, tnxSessionIsNewer, pickSnapshotCurve } = await import('../src/services/macroHubProvider');
    const { etDateOfIso } = await import('../src/lib/marketSession');
    const yc = pickSnapshotCurve(fetched, prevSnapshotCurve, nowMs);
    const tnxIsNewer = tnxSessionIsNewer(TNX.marketTime, yc?.date);
    const unified = unifyUs10y(TNX as any, yc as any, tnxIsNewer);
    const session = !tnxIsNewer && yc ? (yc.date || '') : (etDateOfIso(unified.marketTime) || '');
    const us10y = session && unified.sessionDate !== session ? { ...unified, sessionDate: session } : unified;
    return { yc, tnxIsNewer, us10y };
}

// ── fetch 대역(FMP · EC2 Redis 프록시 · FRED) — 실제 네트워크는 안 나간다 ──
type Net = { fmp: 'fail' | string; redis: 'fail' | string; fred: Record<string, Array<[string, number]>> | 'fail' };
const net: Net = { fmp: 'fail', redis: 'fail', fred: 'fail' };
const fmpRows = (upTo: string) => ust.filter((r) => r.date <= upTo).map((r) => ({ date: r.date, year2: r.y2, year5: r.y5, year10: r.y10, year30: r.y30 }));
const redisRows = (upTo: string) => ust.filter((r) => r.date <= upTo).map((r) => ({
    date: r.date, yield_2_year: r.y2, yield_5_year: r.y5, yield_10_year: r.y10, yield_30_year: r.y30,
}));
const calls: string[] = [];
(globalThis as any).fetch = async (url: string) => {
    const u = String(url);
    const json = (body: unknown, status = 200) => ({ ok: status === 200, status, json: async () => body });
    if (u.includes('financialmodelingprep.com')) {
        calls.push('fmp');
        return net.fmp === 'fail' ? json({}, 500) : json(fmpRows(net.fmp));
    }
    if (u.includes('/get?key=treasury%3Acurve')) {
        calls.push('redis');
        return net.redis === 'fail' ? json({}, 500) : json({ result: JSON.stringify({ results: redisRows(net.redis) }) });
    }
    if (u.includes('api.stlouisfed.org')) {
        calls.push('fred');
        const id = /series_id=([A-Z0-9]+)/.exec(u)?.[1] || '';
        if (net.fred === 'fail') return json({}, 500);
        const obs = (net.fred[id] || []).map(([date, value]) => ({ date, value: String(value) }));
        return json({ observations: obs });
    }
    calls.push(`?${u.slice(0, 60)}`);
    return json({}, 404);
};

// 시계 — 10/5 16:15 ET(= 20:15Z). 곡선 나이 제한(7일)이 «오늘» 기준이라 시험을 언제 돌려도 같게 고정한다.
const realNow = Date.now;
const AT_1615_ET = Date.parse('2026-10-05T20:15:00Z');
Date.now = () => AT_1615_ET;

async function main() {
    process.env.FRED_API_KEY = 'test';           // fedApiClient 는 이 값을 «불러올 때» 읽는다 → import 전에
    process.env.FMP_API_KEY = 'test';
    process.env.EC2_REDIS_PROXY_URL = 'http://redis.test';
    process.env.REDIS_PROXY_KEY = 'test';
    const { getTreasuryYields, pickFredTreasuryRow } = await import('../src/services/fedApiClient');
    const { getTreasuryCurveOfficial } = await import('../src/services/intrinioClient');
    const { curveSpreadBp, fresherCurve, changeFromPrev } = await import('../src/lib/yieldChange');

    console.log('━━━ 0. 원본 대조 — 재무부 10/5·10/2 행 ━━━');
    check('10/5 2s10s = 5.31 − 4.84 = 47bp', curveSpreadBp({ us10y: U['2026-10-05'].y10, us2y: U['2026-10-05'].y2 }) === 47);
    check('10/2 2s10s = 5.28 − 4.83 = 45bp (화면에 뜬 값)', curveSpreadBp({ us10y: U['2026-10-02'].y10, us2y: U['2026-10-02'].y2 }) === 45);
    check('10/5 10Y 변화 = +3bp (5.28 → 5.31)', changeFromPrev(5.31, 5.28)?.chgAbs === 0.03);
    check('spread2s10s 만 있어도 같은 bp', curveSpreadBp({ spread2s10s: 0.47 }) === 47 && curveSpreadBp({ spread2s10s: 0.4699999 }) === 47);

    console.log('━━━ 1. 16:15 ET — 곡선은 아직 10/2(EC2 Redis), 10Y 는 ^TNX 10/5 ━━━');
    {
        const h = await buildHeadline(curveOf('2026-10-02', '2026-10-01'), null, AT_1615_ET);
        const cell = await dashCells(h.us10y, h.yc);
        check('^TNX 세션(10/5)이 곡선(10/2)보다 새롭다', h.tnxIsNewer === true);
        check('10Y 칸 «5.31% +3bp»(^TNX)', cell.us10y === '5.31% +3bp', cell.us10y);
        check('10Y 세션일 2026-10-05', h.us10y.sessionDate === '2026-10-05', String(h.us10y.sessionDate));
        check('2s10s 값은 그대로 «+45bp»(10/2 행 — 칸은 숨기지 않는다)', cell.spread === '+45bp', cell.spread);
        check('세션이 다르다고 판정', cell.pair.sameSession === false);
        check('«10/2» 표식이 붙는다', cell.asOf === '10/2', String(cell.asOf));
        check('풀어 쓴 표식 «10/2(금) 마감 기준»', cell.asOfKo === '10/2(금) 마감 기준', String(cell.asOfKo));
    }

    console.log('━━━ 2. 재무부 10/5 게시 뒤(FMP 16:10 ET~) — 10Y·변화·2s10s 모두 재무부 10/5 ━━━');
    {
        const h = await buildHeadline(curveOf('2026-10-05', '2026-10-02'), curveOf('2026-10-02', '2026-10-01'), Date.parse('2026-10-06T00:05:00Z'));
        const cell = await dashCells(h.us10y, h.yc);
        check('헤드라인 = 곡선(^TNX 가 더 새롭지 않다)', h.tnxIsNewer === false);
        check('10Y 칸 «5.31% +3bp»(재무부 5.28 → 5.31)', cell.us10y === '5.31% +3bp', cell.us10y);
        check('10Y 출처 UST:10Y', h.us10y.symbolUsed === 'UST:10Y', h.us10y.symbolUsed);
        check('10Y 세션일 = 곡선 10/5', h.us10y.sessionDate === '2026-10-05', String(h.us10y.sessionDate));
        check('2s10s «+47bp»', cell.spread === '+47bp', cell.spread);
        check('같은 세션 → 표식 없음', cell.pair.sameSession === true && cell.asOf === null, String(cell.asOf));
        // 화면이 암시하는 2Y(10Y − 스프레드)가 재무부 10/5 2Y 와 같아야 한다
        check('암시된 2Y = 4.84', Math.abs((Number(h.us10y.level) - 0.47) - U['2026-10-05'].y2) < 1e-9, String(Number(h.us10y.level) - 0.47));
    }

    console.log('━━━ 3. 곡선은 직전 스냅숏보다 뒤로 가지 않는다 (16:10~19:44 ET 45↔47 깜빡임) ━━━');
    {
        const at2005 = Date.parse('2026-10-06T00:05:00Z'); // 10/5 20:05 ET
        const c5 = curveOf('2026-10-05', '2026-10-02'), c2 = curveOf('2026-10-02', '2026-10-01');
        const fred1 = curveOf('2026-10-01', '2026-09-30', 'FRED');
        const h = await buildHeadline(c2, c5, at2005);      // FMP 실패 → Redis 10/2 로 다시 만든 스냅숏
        const cell = await dashCells(h.us10y, h.yc);
        check('Redis 10/2 가 직전 10/5 를 못 덮는다', h.yc?.date === '2026-10-05', String(h.yc?.date));
        check('그래서 2s10s «+47bp» 그대로·표식 없음', cell.spread === '+47bp' && cell.asOf === null, `${cell.spread} ${cell.asOf}`);
        const h2 = await buildHeadline(fred1, c5, at2005);  // FRED 10/1 로 다시 만든 스냅숏
        check('FRED 10/1 도 10/5 를 못 덮는다', h2.yc?.date === '2026-10-05', String(h2.yc?.date));
        check('새 곡선은 그대로 이긴다(10/5 > 직전 10/2)', fresherCurve(c5, c2)?.date === '2026-10-05');
        check('같은 날짜면 방금 받은 것', fresherCurve(c5, { ...c5 }) === c5);
        check('방금 받은 게 없으면 직전 것', fresherCurve(null, c5) === c5);
        check('날짜 없는 곡선은 날짜 있는 곡선을 못 이긴다', fresherCurve({ ...fred1, date: '' }, c2)?.date === '2026-10-02');
        check('«미래» 날짜 직전 곡선은 버린다', fresherCurve(c2, { ...c5, date: '2026-10-07' }, '2026-10-05')?.date === '2026-10-02');
    }

    console.log('━━━ 4. FRED 층 — 관측일을 단다 (16:05 ET /api/market/macro 가 FRED 10/1 로 만들어졌다) ━━━');
    {
        // 16:05 ET 의 FRED: 10/2 는 아직 미게시 → 최신 10/1
        const fredAt1605 = {
            DGS2: [['2026-10-01', 4.78], ['2026-09-30', 4.88]] as Array<[string, number]>,
            DGS5: [['2026-10-01', 5.01], ['2026-09-30', 5.09]] as Array<[string, number]>,
            DGS10: [['2026-10-01', 5.24], ['2026-09-30', 5.29]] as Array<[string, number]>,
            DGS30: [['2026-10-01', 5.61], ['2026-09-30', 5.64]] as Array<[string, number]>,
        };
        net.fmp = 'fail'; net.redis = 'fail'; net.fred = fredAt1605;
        calls.length = 0;
        const t = await getTreasuryYields();
        check('원천 FRED(재무부 층 실패 → 폴백)', t.source === 'FRED' && calls.includes('fred'), `${t.source} ${calls.join(',')}`);
        check('관측일 2026-10-01 (예전엔 \'\')', t.date === '2026-10-01', JSON.stringify(t.date));
        check('2Y 4.78 · 10Y 5.24 · 2s10s 0.46', t.us2y === 4.78 && t.us10y === 5.24 && t.spread2s10s === 0.46, `${t.us2y} ${t.us10y} ${t.spread2s10s}`);
        check('직전 10Y 도 같은 계열(9/30 5.29)', t.prev?.date === '2026-09-30' && t.prev?.us10y === 5.29, JSON.stringify(t.prev));

        const fredCurve = { us2y: t.us2y!, us10y: t.us10y!, spread2s10s: t.spread2s10s!, trend: 'NORMAL' as const, date: t.date, source: t.source,
            prevDate: t.prev?.date, prevUs10y: t.prev?.us10y };
        const h = await buildHeadline(fredCurve, null, AT_1615_ET);
        const cell = await dashCells(h.us10y, h.yc);
        check('헤드라인은 ^TNX 10/5 «5.31% +3bp» — FRED 10/1 의 5.24 가 아니다', cell.us10y === '5.31% +3bp', cell.us10y);
        check('2s10s «+46bp» + «10/1» 표식', cell.spread === '+46bp' && cell.asOf === '10/1', `${cell.spread} ${cell.asOf}`);

        // 회귀 기준 — 예전 FRED 층(날짜 '')이면 ^TNX 가 «더 새롭지 않다»로 읽혀 5.24 가 헤드라인에 올랐다
        const { unifyUs10y, tnxSessionIsNewer } = await import('../src/services/macroHubProvider');
        const old = unifyUs10y(TNX as any, { ...fredCurve, date: '', prevDate: undefined, prevUs10y: undefined } as any, tnxSessionIsNewer(TNX.marketTime, ''));
        check('(회귀 기준) 날짜 없는 FRED → 헤드라인 5.24 + ^TNX 변화', old.level === 5.24 && old.chgAbs === 0.034, `${old.level} ${old.chgAbs}`);

        // 계열마다 최신일이 다르면 «둘 다 있는» 날짜로 — 날짜를 섞지 않는다
        const mixed = pickFredTreasuryRow({
            y2: [{ date: '2026-10-01', value: 4.78 }],
            y10: [{ date: '2026-10-02', value: 5.28 }, { date: '2026-10-01', value: 5.24 }],
        });
        check('10Y 만 10/2 → 둘 다 있는 10/1 행', mixed?.date === '2026-10-01' && mixed?.us10y === 5.24 && mixed?.us2y === 4.78, JSON.stringify(mixed));
        const tenOnly = pickFredTreasuryRow({ y2: [], y10: [{ date: '2026-10-02', value: 5.28 }] });
        check('2Y 가 없으면 10Y 만(2Y null — 스프레드를 만들지 않는다)', tenOnly?.date === '2026-10-02' && tenOnly?.us2y === null, JSON.stringify(tenOnly));
        check('10Y 가 없으면 null', pickFredTreasuryRow({ y2: [{ date: '2026-10-01', value: 4.78 }], y10: [] }) === null);
    }

    console.log('━━━ 5. 재무부 층 — 이 인스턴스가 본 새 곡선을 FMP 실패 한 번에 잃지 않는다 ━━━');
    {
        net.fred = 'fail';
        net.redis = '2026-10-02'; net.fmp = '2026-10-05';            // 16:10 ET~: FMP 10/5, Redis(크론 전) 10/2
        const a = await getTreasuryCurveOfficial();
        check('FMP 10/5 > Redis 10/2 → 10/5', a?.[0]?.date === '2026-10-05', String(a?.[0]?.date));
        net.fmp = 'fail';                                             // 다음 요청: FMP 실패(가짜 타임아웃 등)
        const b = await getTreasuryCurveOfficial();
        check('FMP 실패해도 10/5 유지(예전: Redis 10/2 로 후퇴)', b?.[0]?.date === '2026-10-05', String(b?.[0]?.date));
        const y = await getTreasuryYields();
        check('getTreasuryYields 도 10/5 — 2s10s 0.47 · 직전 10/2 5.28', y.date === '2026-10-05' && y.spread2s10s === 0.47 && y.prev?.us10y === 5.28,
            `${y.date} ${y.spread2s10s} ${JSON.stringify(y.prev)}`);
        net.redis = '2026-10-05';                                     // 19:10 ET 크론 뒤
        const c = await getTreasuryCurveOfficial();
        check('Redis 가 따라오면 그대로 10/5', c?.[0]?.date === '2026-10-05', String(c?.[0]?.date));
        // 7일이 지나면 메모리 사본은 안 쓴다(Redis 와 같은 나이 제한)
        Date.now = () => Date.parse('2026-10-13T20:15:00Z');
        net.redis = 'fail'; net.fmp = 'fail';
        const d = await getTreasuryCurveOfficial();
        check('8일 지난 메모리 사본은 버린다', d === null, String(d?.[0]?.date));
        Date.now = () => AT_1615_ET;
    }

    Date.now = realNow;
    console.log();
    console.log(`결과: ${pass}/${total} 통과`);
    if (failures.length) { console.log(failures.join('\n')); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
