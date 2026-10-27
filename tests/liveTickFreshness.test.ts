import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { HUB_FEED_DELAY_MS, liveWsTick, regularWsUsable, relatedWsTick, screenSessionOf, wsTickSourceMs } from '../src/lib/liveTickFreshness';
import { relatedLivePrevClose, relatedSessionContext, mergeRelatedRow } from '../src/lib/relatedRowMerge';
import { relatedRefreshDue, RELATED_REGULAR_REFRESH_MS } from '../src/hooks/useRegularRelatedRefresh';
import { calcPriceDisplay } from '../src/utils/calcPriceDisplay';

// T31c — 10/27 22:38 KST 정규장 운영 실측 재현(저장 증거 ~/Documents/signum-work/2026-10-27/related-merge/).
//   직접 API(open2236-related-NVDA) GOOGL 318.64 +0.58% 체결 13:35:53.931Z · 야후 1분봉 13:35 318.68 / 13:36 318.58
//   허브 22:38:56 KST 315.70 −0.35% = 야후 13:23 315.91(장전) · 22:47:04 317.69 = 야후 13:31~13:32 — 약 15분 지연, 방송에 체결 시각 없음
let checks = 0;
const ok = (cond: boolean, msg: string) => { assert.ok(cond, msg); checks++; };
const eq = (a: unknown, b: unknown, msg: string) => { assert.deepEqual(a, b, msg); checks++; };

const at = (iso: string) => Date.parse(iso);
const REG_2238 = at('2026-10-27T13:38:56Z');
const REG_2247 = at('2026-10-27T13:47:04Z');
const googlApi = { ticker: 'GOOGL', price: 318.64, change: 0.58, logo: null, prevClose: 316.8, session: '2026-10-27', asOf: 1793108153931 };
eq(new Date(googlApi.asOf).toISOString(), '2026-10-27T13:35:53.931Z', '저장 증거 체결 시각');
// 브라우저가 만드는 허브 틱(WebSocketProvider): 운영 허브는 ts 를 안 보내 priceTime 0, receivedAt = 받은 시각
const hub = (price: number, changePct: number, receivedAt: number, priceTime = 0) => ({ ticker: 'GOOGL', price, changePct, volume: 0, ts: receivedAt, priceTime, receivedAt });

// ── 원천 시각 추정 ──
eq(wsTickSourceMs(hub(1, 0, REG_2238)), REG_2238 - HUB_FEED_DELAY_MS, '체결 시각 없으면 받은 시각 − 15분');
eq(wsTickSourceMs(hub(1, 0, REG_2238, at('2026-10-27T13:38:50Z'))), at('2026-10-27T13:38:50Z'), '체결 시각이 오면 그것');
eq(wsTickSourceMs(hub(1, 0, REG_2238, at('2026-10-27T13:38:50Z') * 1e6)), at('2026-10-27T13:38:50Z'), 'ns 체결 시각');
eq(wsTickSourceMs({ price: 1 }), null, '시각 둘 다 없으면 모름');
eq(wsTickSourceMs(null), null, '틱 없음');

// ── 정규장: 사고 재현 ──
eq(relatedWsTick(hub(315.7, -0.35, REG_2238), googlApi, REG_2238), undefined, '22:38 허브(장전 체결)는 13:35 직접 API 를 덮지 않는다');
eq(relatedWsTick(hub(317.69, 0.28, REG_2247), googlApi, REG_2247), undefined, '22:47 허브(13:32 추정)는 13:35:53 체결보다 오래됨');
const refreshed = { ...googlApi, price: 318.85, change: 0.65, asOf: at('2026-10-27T13:46:58Z') };
eq(relatedWsTick(hub(317.69, 0.28, REG_2247), refreshed, REG_2247), undefined, '60초 재조회 행(13:46:58)도 허브보다 새롭다');
// 허브가 체결 시각을 보내고 그것이 더 새로우면 허브(실시간 허브 대비)
const fresh = hub(318.9, 0.66, REG_2247, at('2026-10-27T13:47:03Z'));
eq(relatedWsTick(fresh, googlApi, REG_2247), fresh, '체결 시각이 더 새로운 허브는 쓴다');
eq(relatedWsTick(hub(318.9, 0.66, REG_2247, at('2026-10-27T13:20:00Z')), { ...googlApi, asOf: undefined }, REG_2247), undefined, '허브 체결이 장전이면 정규장 가격으로 안 쓴다');
// 비교할 오늘 정규장 관측이 없으면 기존 동작(허브)
const legacy = { ticker: 'GOOGL', price: 321, change: 0.25, prevClose: 320.21, session: '2026-10-27' };
const t1350 = at('2026-10-27T13:50:00Z');
eq(relatedWsTick(hub(319, 0.7, t1350), legacy, t1350), hub(319, 0.7, t1350), '시각 없는 행 → 허브(기존)');
const officialYesterday = { ticker: 'GOOGL', price: 316.8, change: -1.06, prevClose: 320.21, session: '2026-10-26', closeSession: '2026-10-26', asOf: 1793044800000 };
eq(relatedWsTick(hub(319, 0.7, t1350), officialYesterday, t1350), hub(319, 0.7, t1350), '어제 공식 행 → 허브(개장 뒤 체결)');
eq(relatedWsTick(hub(319, 0.7, REG_2238), officialYesterday, REG_2238), undefined, '개장 직후 15분 허브(장전 체결)는 어제 공식 행도 덮지 않는다');
eq(relatedWsTick({ price: 319 }, googlApi, t1350), undefined, '시각 모르는 허브는 오늘 관측을 덮지 않는다');
eq(relatedWsTick({ price: 319 }, legacy, t1350), { price: 319 }, '시각 모르는 허브 + 시각 없는 행 → 기존');
eq(relatedWsTick({ price: 0 }, legacy, t1350), undefined, '가격 0 허브');
eq(relatedWsTick(undefined, googlApi, t1350), undefined, '허브 없음');
ok(regularWsUsable(hub(319, 0.7, t1350, at('2026-10-27T13:35:53.931Z')), googlApi.asOf, t1350), '같은 체결 시각이면 허브(동률)');

// ── 정규장 밖은 판단하지 않는다(장외·장전 동작 불변) ──
for (const [iso, label] of [
    ['2026-10-27T12:00:00Z', 'PRE'], ['2026-10-27T21:00:00Z', 'POST'], ['2026-10-28T03:00:00Z', 'CLOSED 밤'],
    ['2026-10-25T15:00:00Z', '일요일'], ['2026-11-26T16:00:00Z', '추수감사절 휴장'], ['2026-11-27T18:30:00Z', '조기 폐장 13:00 뒤'],
] as const) {
    const now = at(iso);
    ok(regularWsUsable(hub(315.7, -0.35, now), { ...googlApi, asOf: now - 60_000 }.asOf, now), `${label}: 허브 판단 안 함`);
    eq(relatedWsTick(hub(315.7, -0.35, now), googlApi, now)?.price, 315.7, `${label}: 연관 행 판단 안 함`);
}
ok(!regularWsUsable(hub(315.7, -0.35, at('2026-11-27T17:00:00Z')), at('2026-11-27T16:59:30Z'), at('2026-11-27T17:00:00Z')), '조기 폐장일 12:00 ET 는 정규장 — 판단한다');

// ── 머리말: useLivePrice 가 폴링 값(체결 시각)을 골랐을 때 ──
const restLive = { price: 318.64, changePercent: 0.58, source: 'rest', priceTime: googlApi.asOf };
eq(liveWsTick(hub(315.7, -0.35, REG_2238), restLive, REG_2238), undefined, '머리말: 지연 허브는 최신 폴링 값을 덮지 않는다');
eq(liveWsTick(fresh, restLive, REG_2247), fresh, '머리말: 더 새로운 허브 체결은 쓴다');
eq(liveWsTick(hub(315.7, -0.35, REG_2238), { ...restLive, source: 'ws' }, REG_2238)?.price, 315.7, '훅이 허브를 골랐으면 그대로');
eq(liveWsTick(hub(315.7, -0.35, REG_2238), null, REG_2238)?.price, 315.7, '폴링 값 없으면 허브(기존)');
eq(liveWsTick(hub(315.7, -0.35, REG_2238), { ...restLive, priceTime: null }, REG_2238)?.price, undefined, '시각 없는 폴링 + 장전 체결 허브 → 폴링');
eq(liveWsTick(hub(319, 0.7, t1350), { ...restLive, priceTime: null }, t1350)?.price, 319, '시각 없는 폴링 + 개장 뒤 허브 → 허브(기존)');
eq(liveWsTick(hub(315.7, -0.35, at('2026-10-27T21:00:00Z')), restLive, at('2026-10-27T21:00:00Z'))?.price, 315.7, 'POST: 머리말 기존 동작');
// 머리말 대입 모양(4곳): `wsPrice?.price || livePrice?.price` — 허브가 빠지면 폴링 값
{
    const wsPrice = liveWsTick(hub(315.7, -0.35, REG_2238), restLive, REG_2238);
    eq((wsPrice?.price || restLive.price), 318.64, '머리말 가격 = 직접 체결');
}
// useLivePrice 훅이 같은 판정을 쓴다(정규장 지연 허브면 폴링 반환·source/priceTime 표식)
{
    const src = fs.readFileSync('src/hooks/useLivePrice.ts', 'utf8');
    ok(/const wsFresh = !\(restQuote\?\.price > 0\) \|\| regularWsUsable\(wsPrice, restTime, Date\.now\(\)\);/.test(src), '훅: 폴링 체결 시각과 비교');
    ok(src.includes('if (wsPrice && wsPrice.price > 0 && wsTrustworthy && wsFresh) {'), '훅: 오래된 허브면 폴링 경로');
    ok(src.includes("source: 'ws',") && src.includes("source: 'rest',"), '훅: 원천 표식');
}
for (const f of ['src/components/LiveTickerDashboard.tsx', 'src/components/intel/mobile/MobileCommandPage.tsx', 'src/components/intel/mobile/MobileCmdChart.tsx',
    'src/components/intel/mobile/MobileCmdOptions.tsx', 'src/app/[locale]/app-view/cmd/page.tsx', 'src/app/[locale]/app-view/flow/page.tsx']) {
    const src = fs.readFileSync(f, 'utf8');
    ok(/const wsPrice = liveWsTick\(/.test(src), `${f}: 머리말 허브 값은 판정을 거친다`);
}

// ── 연관 종목 실제 화면 계산(모바일 웹·웹·앱 셸) ──
function parse(file: string) {
    return ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function findAll(root: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node[] {
    const out: ts.Node[] = [];
    (function visit(node: ts.Node) { if (predicate(node)) out.push(node); ts.forEachChild(node, visit); })(root);
    return out;
}
function compile(args: string[], body: string) {
    const js = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    return new Function(...args, js);
}
function displayBlock(file: string, marker: string) {
    const ast = parse(file);
    const blocks = findAll(ast, node => ts.isBlock(node) && node.statements.some(st =>
        ts.isVariableStatement(st) && st.declarationList.declarations.some(d => d.name.getText(ast) === 'wsPrice' && !!d.initializer?.getText(ast).includes(marker)))) as ts.Block[];
    assert.equal(blocks.length, 1, `${file}: 연관 종목 계산 블록 하나`);
    const statements: string[] = [];
    for (const st of blocks[0].statements) { if (ts.isReturnStatement(st)) break; statements.push(st.getText(ast)); }
    return compile(['r', 'item', 'wsGetPrice', 'relWsGetPrice', 'isRegularSession', 'isRelatedRegularSession', 'relWsConnected', 'relatedLivePrevClose', 'Date', 'relatedWsTick', 'relatedSessionContext'],
        `${statements.join('\n')}\nreturn [displayPrice, displayChange];`);
}
const screens = [
    ['모바일 웹', displayBlock('src/components/intel/mobile/MobileCmdOverview.tsx', 'wsGetPrice(r.ticker)')],
    ['웹', displayBlock('src/components/LiveTickerDashboard.tsx', 'relWsGetPrice')],
    ['앱 셸', displayBlock('src/app/[locale]/app-view/cmd/page.tsx', 'wsGetPrice(r.ticker)')],
] as const;
function show(calc: Function, row: any, tick: any, nowMs: number) {
    const regular = relatedSessionContext(nowMs).regular;
    const get = () => tick;
    return calc(row, row, get, get, regular, regular, true, relatedLivePrevClose, { now: () => nowMs }, relatedWsTick, relatedSessionContext);
}
for (const [name, calc] of screens) {
    // 사고 재현: 22:38 / 22:47 — 직접 API 318.64 +0.58% 유지(옛 코드: 315.7 −0.35% / 317.69 +0.28%)
    eq(show(calc, googlApi, hub(315.7, -0.35, REG_2238), REG_2238), [318.64, 0.58], `${name}: 22:38 직접 API 유지`);
    eq(show(calc, googlApi, hub(317.69, 0.28, REG_2247), REG_2247), [318.64, 0.58], `${name}: 22:47 직접 API 유지`);
    eq(show(calc, refreshed, hub(317.69, 0.28, REG_2247), REG_2247), [318.85, 0.65], `${name}: 재조회 행`);
    // 실시간 허브(체결 시각이 더 새로움)는 행의 전일 종가 분모로
    eq(show(calc, googlApi, fresh, REG_2247), [318.9, Number((((318.9 - 316.8) / 316.8) * 100).toFixed(2))], `${name}: 새 체결 허브`);
    // 시각 없는 옛 행(허브 개장 뒤) → 기존과 같다
    eq(show(calc, legacy, hub(322, 4.4, t1350), t1350), [322, 0.56], `${name}: 시각 없는 행 기존 동작`);
    eq(show(calc, googlApi, undefined, REG_2247), [318.64, 0.58], `${name}: 허브 없음`);
}
// 장외: 모바일 웹·웹은 기존(허브 안 읽음) · 앱 셸은 웹과 같은 규칙으로 맞춤(장외 허브가 공식 행을 덮어 등락 분모가 두 세션 전이 되던 것)
const PRE = at('2026-10-27T12:00:00Z');
for (const [name, calc] of screens) {
    eq(show(calc, officialYesterday, hub(317.2, 0.13, PRE), PRE), [316.8, -1.06], `${name}: 장전 공식 행`);
}

// ── 앱 셸: 정규장에 열어 둔 화면이 마감을 지나면 unified 공식 종가 행으로 넘어간다(관문 10280530 보류 수리) ──
{
    const ast = parse('src/app/[locale]/app-view/cmd/page.tsx');
    const effects = findAll(ast, node => ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect'
        && node.arguments[0]?.getText(ast).includes('unifiedRelatedRows.find')) as ts.CallExpression[];
    assert.equal(effects.length, 1, '앱 셸 unified 병합 효과 하나');
    const fn = effects[0].arguments[0] as ts.ArrowFunction;
    const effect = compile(['unifiedRelatedRows', 'setRelatedData', 'mergeRelatedRow', 'Date'], `(${fn.getText(ast)})();`);
    const runEffect = (prev: any[], unifiedRows: any, nowMs: number) => {
        let out: any[] = prev;
        effect(unifiedRows, (u: (p: any[]) => any[]) => { out = u(prev); }, mergeRelatedRow, { now: () => nowMs });
        return out;
    };
    const intraday = { ticker: 'GOOGL', price: 99, change: -1, prevClose: 100, session: '2026-10-27', asOf: at('2026-10-27T19:59:30Z') };
    const officialClose = { ticker: 'GOOGL', price: 103, change: 3, prevClose: 100, session: '2026-10-27', closeSession: '2026-10-27', asOf: at('2026-10-27T20:00:00Z') };
    const other = { ticker: 'AMD', price: 50, change: 1, prevClose: 49.5, session: '2026-10-27', asOf: at('2026-10-27T19:59:00Z') };
    for (const iso of ['2026-10-27T20:05:00Z', '2026-10-28T03:00:00Z', '2026-10-28T12:00:00Z']) {
        const out = runEffect([intraday, other], [officialClose], at(iso));
        eq([out[0].price, out[0].change], [103, 3], `${iso}: 마감 뒤 공식 종가 행`);
        eq(out[1], other, `${iso}: unified 에 없는 종목은 그대로`);
    }
    // 정규장 중엔 오늘 직접 API 행이 지난 세션 unified 행에 밀리지 않는다(T31b 순위 그대로)
    const staleUnified = { ticker: 'GOOGL', price: 316.8, change: -1.06, prevClose: 320.21, session: '2026-10-26', closeSession: '2026-10-26', asOf: 1793044800000 };
    eq(runEffect([googlApi], [staleUnified], REG_2247)[0].price, 318.64, '정규장: 오늘 직접 API 유지');
    const prevList = [googlApi];
    ok(runEffect(prevList, [staleUnified], REG_2247) === prevList, '바뀐 것 없으면 같은 목록(재렌더 0)');
    ok(runEffect([], [officialClose], at('2026-10-27T20:05:00Z')).length === 0, '직접 목록 전엔 손대지 않음');
}

// ── 60초 재조회 시점 ──
const open0930 = at('2026-10-27T13:30:20Z');
ok(!relatedRefreshDue(open0930, open0930 - 10 * 60_000), '09:30 ET대는 묻지 않음(장전 캐시)');
ok(relatedRefreshDue(at('2026-10-27T13:31:05Z'), at('2026-10-27T13:20:00Z')), '09:31 이후 첫 점검에 묻는다');
ok(!relatedRefreshDue(REG_2247, REG_2247 - 30_000), '60초 안엔 안 묻는다');
ok(relatedRefreshDue(REG_2247, REG_2247 - RELATED_REGULAR_REFRESH_MS), '60초 지나면 묻는다');
ok(relatedRefreshDue(REG_2247, REG_2247 - 20_000, true), '화면 복귀는 15초 지나면');
ok(!relatedRefreshDue(REG_2247, REG_2247 - 5_000, true), '화면 복귀도 15초 안엔 안 묻는다');
for (const iso of ['2026-10-27T12:00:00Z', '2026-10-27T21:00:00Z', '2026-10-25T15:00:00Z', '2026-11-26T16:00:00Z', '2026-11-27T18:30:00Z']) {
    ok(!relatedRefreshDue(at(iso), 0, true), `${iso}: 장외 요청 0`);
}
// 재조회 행은 기존 병합으로 합쳐진다 — 오늘 체결이 늦게 온 옛 응답을 덮지 않는다
eq(mergeRelatedRow(refreshed, googlApi, REG_2247).price, 318.85, '늦게 도착한 옛 응답 거절');
eq(mergeRelatedRow(officialYesterday, googlApi, REG_2238).price, 318.64, '어제 공식 행 → 오늘 실시간 행');

// ── 세션 표식: 장전에 연 모바일 웹 화면이 정규장에 PRE 로 남지 않는다 ──
const st = (market: string, isHoliday = false) => ({ market, isHoliday });
eq(screenSessionOf(st('open'), 'PRE', REG_2238), 'REG', '정규장: SSR PRE → REG');
eq(screenSessionOf(st('open'), 'pre', at('2026-10-27T13:30:00Z')), 'REG', '09:30:00 ET 즉시');
eq(screenSessionOf(st('extended-hours'), 'PRE', at('2026-10-27T13:29:59Z')), 'PRE', '09:29:59 장전 그대로');
eq(screenSessionOf(st('extended-hours'), 'post', at('2026-10-27T21:00:00Z')), 'POST', '애프터 기존 값');
eq(screenSessionOf(st('extended-hours'), 'REG', at('2026-10-27T21:00:00Z')), 'REG', '애프터: 기존 값 그대로(이번 범위 밖)');
eq(screenSessionOf(st('closed'), 'PRE', REG_2238), 'CLOSED', '시장 닫힘 → CLOSED');
eq(screenSessionOf(st('open', true), 'REG', at('2026-11-26T16:00:00Z')), 'CLOSED', '휴장 → CLOSED');
eq(screenSessionOf(st('open'), null, at('2026-11-26T16:00:00Z')), 'CLOSED', '휴장 달력은 REG 아님');
eq(screenSessionOf(st('open'), 'REG', at('2026-11-27T18:30:00Z')), 'REG', '조기 폐장 뒤엔 기존 값');
eq(screenSessionOf(st('open'), 'PRE', at('2026-11-27T17:00:00Z')), 'REG', '조기 폐장일 12:00 ET 정규장');
{
    const src = fs.readFileSync('src/components/intel/mobile/MobileCommandPage.tsx', 'utf8');
    ok(src.includes('const effectiveSession = screenSessionOf(marketStatus, effectiveQuote.session, Date.now());'), '모바일 웹 머리말 세션');
}
// 계산기: 같은 입력(살아 있는 PRE 값)에 세션만 REG 로 바뀌면 «PRE» → «PRE CLOSE», 머리말 = 실시간 가격
const calcIn = (session: string) => calcPriceDisplay({
    livePrice: 218.9, liveChangePct: 1.34, liveExtPrice: 217.7, liveExtChangePct: 0.79, liveExtLabel: 'PRE',
    apiDisplayPrice: 216, apiDisplayChangePct: 2.39, session, prevRegularClose: 216, prevClose: 216, fallbackChangePct: 2.39, lastTrade: 216,
});
eq([calcIn('PRE').activeExtLabel, calcIn('PRE').displayPrice], ['PRE', 216], '옛 동작(장전 고정): PRE 배지·전일 종가 머리말');
eq([calcIn(screenSessionOf(st('open'), 'PRE', REG_2238)).activeExtLabel, calcIn('REG').displayPrice], ['PRE CLOSE', 218.9], '수리: PRE CLOSE·실시간 머리말');

console.log(`liveTickFreshness: ${checks}개 통과 — 정규장 지연 허브 vs 최신 체결(직접 API·폴링) · 장전 체결 거부 · 장외·장전·휴장·조기 폐장 불변 · 연관 종목 3화면 실제 계산 · 60초 재조회 · 세션 표식 PRE→REG`);
