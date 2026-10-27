import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { mergeRelatedRow, relatedLivePrevClose, relatedSessionContext } from '../src/lib/relatedRowMerge';

// 연관 종목 행 병합 — 실제 화면 콜백(웹 unified·웹 직접 API·앱 직접 API·앱 unified)을 소스에서 꺼내 실행한다.
// React·네트워크·환경 파일 없음. 시계는 Date 를 가짜로 넘겨 고정한다.
function parse(file: string) {
    return ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function findAll(root: ts.SourceFile, predicate: (node: ts.Node) => boolean): ts.Node[] {
    const out: ts.Node[] = [];
    (function visit(node: ts.Node) { if (predicate(node)) out.push(node); ts.forEachChild(node, visit); })(root);
    return out;
}
function compileFn(ast: ts.SourceFile, node: ts.Node, args: string[]) {
    const js = ts.transpileModule(`module.exports = ${node.getText(ast)};`, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    return (env: Record<string, unknown>) => {
        const mod = { exports: undefined as any };
        new Function('module', ...args, js)(mod, ...args.map((a) => env[a]));
        return mod.exports;
    };
}
const fakeDate = (ms: number) => ({ now: () => ms });
const key = (r: any) => [r.ticker, r.price, r.change, r.prevClose, r.session, r.closeSession, r.asOf];

const web = parse('src/components/LiveTickerDashboard.tsx');
const mobile = parse('src/components/intel/mobile/MobileCmdOverview.tsx');
const webUnifiedNode = findAll(web, (n) => ts.isVariableDeclaration(n) && n.name.getText(web) === 'updatedList'
    && !!n.initializer && ts.isCallExpression(n.initializer))[0] as ts.VariableDeclaration;
assert.ok(webUnifiedNode, '웹 unified 병합 콜백');
const webUnified = compileFn(web, (webUnifiedNode.initializer as ts.CallExpression).arguments[0], ['prev', 'mergeRelatedRow', 'Date']);
const webDirectNode = findAll(web, (n) => ts.isCallExpression(n) && n.expression.getText(web) === 'data.topRelated.map')[0] as ts.CallExpression;
assert.ok(webDirectNode, '웹 직접 API 병합 콜백');
const webDirect = compileFn(web, webDirectNode.arguments[0], ['prev', 'mergeRelatedRow', 'Date']);
const mobileDirectNode = findAll(mobile, (n) => ts.isCallExpression(n) && n.expression.getText(mobile) === 'data.topRelated.map')[0] as ts.CallExpression;
assert.ok(mobileDirectNode, '앱 직접 API 병합 콜백');
const mobileDirect = compileFn(mobile, mobileDirectNode.arguments[0], ['prev', 'mergeRelatedRow', 'Date']);
const mobileUnifiedNode = findAll(mobile, (n) => ts.isCallExpression(n) && n.expression.getText(mobile) === 'setRelatedData'
    && n.getText(mobile).includes('unifiedRelatedRows'))[0] as ts.CallExpression;
assert.ok(mobileUnifiedNode, '앱 unified 병합(요청 추가 없음)');
const mobileUnified = compileFn(mobile, mobileUnifiedNode.arguments[0], ['unifiedRelatedRows', 'mergeRelatedRow', 'Date']);

/** 네 경로 모두 같은 결과인지 확인하고 그 결과를 돌려준다 */
function merge(oldItem: any, newItem: any, nowMs: number) {
    const Date = fakeDate(nowMs);
    const a = webUnified({ prev: { topRelated: oldItem ? [oldItem] : [] }, mergeRelatedRow, Date })(newItem);
    const b = webDirect({ prev: { topRelated: oldItem ? [oldItem] : [] }, mergeRelatedRow, Date })(newItem);
    const c = mobileDirect({ prev: oldItem ? [oldItem] : [], mergeRelatedRow, Date })(newItem);
    const d = oldItem ? mobileUnified({ unifiedRelatedRows: [newItem], mergeRelatedRow, Date })([oldItem])[0] : mergeRelatedRow(oldItem, newItem, nowMs);
    for (const other of [b, c]) assert.deepEqual(other, a, '웹·앱 병합 경로가 같은 값');
    assert.deepEqual(key(d), key(a), '앱 unified 경로도 같은 값');
    assert.deepEqual(a, mergeRelatedRow(oldItem, newItem, nowMs));
    return a;
}
const v = (row: any) => [row.price, row.change, row.prevClose];
const pct = (price: number, base: number) => Math.round((price - base) / base * 10000) / 100;

// 시각(2026-10 은 EDT, ET = UTC−4)
const FRI_REG = Date.parse('2026-10-23T18:00:00Z');   // 금 14:00 ET 정규장
const FRI_POST = Date.parse('2026-10-23T20:30:00Z');  // 금 16:30 ET
const SUN = Date.parse('2026-10-26T02:55:00Z');       // 일 22:55 ET — 운영 실측 10/26 11:55 KST
const MON_0359 = Date.parse('2026-10-26T07:59:00Z');
const MON_0401 = Date.parse('2026-10-26T08:01:00Z');
const MON_PRE = Date.parse('2026-10-26T12:00:00Z');   // 월 08:00 ET
const MON_REG = Date.parse('2026-10-26T14:00:00Z');   // 월 10:00 ET
const MON_POST = Date.parse('2026-10-26T21:00:00Z');  // 월 17:00 ET
const FRI_CLOSE = Date.parse('2026-10-23T20:00:00Z');

// 문맥 — 달력이 정본
assert.deepEqual(relatedSessionContext(SUN), { regular: false, date: '2026-10-23' });
assert.deepEqual(relatedSessionContext(MON_PRE), { regular: false, date: '2026-10-23' });
assert.deepEqual(relatedSessionContext(MON_REG), { regular: true, date: '2026-10-26' });
assert.deepEqual(relatedSessionContext(MON_POST), { regular: false, date: '2026-10-26' });
assert.deepEqual(relatedSessionContext(Date.parse('2026-11-26T17:00:00Z')), { regular: false, date: '2026-11-25' }, '휴장');
assert.deepEqual(relatedSessionContext(Date.parse('2026-11-27T18:30:00Z')), { regular: false, date: '2026-11-27' }, '조기 폐장 13:00 뒤');

// 운영 실측 행(10/23 GOOGL 공식 320.21 · 전일 324.22 · 장후 321.11)
const official = { ticker: 'GOOGL', price: 320.21, change: -1.24, prevClose: 324.22, logo: null,
    session: '2026-10-23', closeSession: '2026-10-23', asOf: FRI_CLOSE };
const extended = { ticker: 'GOOGL', price: 321.11, change: -0.96, prevClose: 324.22, logo: null,
    session: '2026-10-23', asOf: Date.parse('2026-10-23T23:59:00Z') };

// ── 운영 사고(10/26) + 관문 1206 ② — 장외엔 공식 종가가 늦은 시간외 행보다 양방향 우선(조회 복구 순서 무관)
for (const at of [FRI_POST, SUN, MON_0359, MON_PRE]) {
    assert.deepEqual(key(merge(extended, official, at)), key(official), '시간외 → 공식: 공식 한 묶음');
    assert.deepEqual(key(merge(official, extended, at)), key(official), '공식 → 늦은 시간외: 공식 유지(asOf 로 비교하지 않음)');
    assert.deepEqual(v(merge(official, { ...extended, asOf: SUN }, at)), [320.21, -1.24, 324.22], '요청 시각 asOf 도 이기지 못함');
}

// ── 관문 1010 — 같은 기준에서 늦게 온 옛 응답이 새 분모를 덮지 않는다(실패 행을 사이에 둬도). 정규장·장외 모두.
for (const [at, session] of [[MON_REG, '2026-10-26'], [MON_0401, '2026-10-23'], [SUN, '2026-10-23']] as const) {
    const fresh = { ticker: 'XYZ', price: 100.56, change: 0.56, prevClose: 100, logo: null, session, asOf: at - 1000 };
    const late = { ...fresh, change: -0.44, prevClose: 101, asOf: at - 120_000 };
    assert.deepEqual(v(merge(fresh, late, at)), [100.56, 0.56, 100], '늦은 옛 응답 거절');
    for (const failed of [{ ticker: 'XYZ', price: 0, change: 0 }, { ticker: 'XYZ', price: 0, change: 0, prevClose: 0, asOf: null },
        { ticker: 'XYZ', price: 0, change: 0, asOf: undefined, closeSession: session }]) {
        const kept = merge(fresh, failed, at);
        assert.deepEqual(v(kept), v(fresh), '가격 0 실패 행은 이전 행 유지(공식 표식도 우회 못 함)');
        assert.equal(kept.asOf, fresh.asOf, '실패 뒤에도 비교 시각 유지');
        const after = merge(kept, late, at);
        assert.deepEqual(v(after), [100.56, 0.56, 100], '실패 → 옛 응답에도 부호 유지(+0.56%)');
        assert.equal(pct(after.price, after.prevClose), 0.56);
    }
    assert.deepEqual(v(merge(late, fresh, at)), v(fresh), '새 시각 행 채택');
    assert.deepEqual(v(merge(fresh, { ...late, asOf: fresh.asOf }, at)), v(late), '동일 시각은 도착 순서');
    // 한쪽 시각이 없으면 기존 도착 순서·분모 보충(관문 10250519)
    for (const bad of [undefined, null, 0, -1, NaN, Infinity, '2026-10-26T08:00:00Z']) {
        assert.deepEqual(v(merge(fresh, { ...late, asOf: bad }, at)), v(late));
        assert.deepEqual(v(merge({ ...fresh, asOf: bad }, late, at)), v(late));
    }
    assert.equal(merge(fresh, { ...late, asOf: undefined, prevClose: 0 }, at).prevClose, 100, '같은 기준 분모 보충');
}

// ── 관문 1305 ③ — 지난 거래일 공식 종가가 새 거래일 행을 막지 않는다(공식 표식 날짜 확인). 월요일 POST, 월요일 EOD 조회 실패.
const friOfficialCached = { ...official };
const monday = { ticker: 'GOOGL', price: 325, change: 1.5, prevClose: 320.21, logo: null, session: '2026-10-26', asOf: Date.parse('2026-10-26T20:00:00Z') };
assert.deepEqual(v(merge(friOfficialCached, monday, MON_POST)), [325, 1.5, 320.21], '금요일 공식 → 월요일 행 채택');
assert.deepEqual(v(merge(monday, friOfficialCached, MON_POST)), [325, 1.5, 320.21], '월요일 행 → 늦게 온 금요일 공식 거절');
const monOfficial = { ...monday, price: 324.8, change: 1.43, closeSession: '2026-10-26', asOf: Date.parse('2026-10-26T20:00:00Z') };
assert.deepEqual(v(merge(monday, monOfficial, MON_POST)), [324.8, 1.43, 320.21], '월요일 공식 게시 뒤 공식 우선');
assert.deepEqual(v(merge(monOfficial, { ...monday, asOf: MON_POST }, MON_POST)), [324.8, 1.43, 320.21]);

// ── 관문 1305 ② / 밤 검토 — 정상 보합 0% 는 유효값
const ssrOfficial = { ...official };
const regFlat = { ticker: 'GOOGL', price: 320.21, change: 0, prevClose: 320.21, logo: null, session: '2026-10-26', asOf: MON_REG - 5000 };
assert.deepEqual(v(merge(ssrOfficial, regFlat, MON_REG)), [320.21, 0, 320.21], 'SSR −1.24% → 정규장 직접 응답 0% (웹 직접 경로 포함)');
const falling = { ...official, price: 99, change: -1, prevClose: 100, closeSession: undefined, asOf: undefined };
const officialFlat = { ...official, price: 100, change: 0, prevClose: 100 };
assert.deepEqual(v(merge(falling, officialFlat, SUN)), [100, 0, 100], '장외 공식 보합');
assert.deepEqual(v(merge(officialFlat, { ...falling, asOf: SUN }, SUN)), [100, 0, 100], '공식 보합 뒤 늦은 비공식 −1% 거절');
assert.deepEqual(v(merge({ ...falling, asOf: 1 }, { ...falling, price: 100, change: 0, asOf: 2 }, SUN)), [100, 0, 100], '분모 있는 비공식 0% 도 유효');
// 분모·공식 표식 없는 0 은 «등락 모름» — 같은(또는 모르는) 기준의 이전 등락 유지(옛 V2 규칙)
assert.deepEqual(v(merge({ ticker: 'AMZN', price: 248, change: -0.95, prevClose: 250.38 }, { ticker: 'AMZN', price: 248.1, change: 0 }, SUN)), [248.1, -0.95, 250.38]);

// ── 정규장 실시간 유지 — 지연 도착한 직전 공식 종가·옛 캐시가 새 정규장 행을 덮지 않는다
const live = { ticker: 'GOOGL', price: 321.11, change: 0.28, prevClose: 320.21, logo: null, session: '2026-10-26', asOf: MON_REG - 30_000 };
assert.deepEqual(key(merge(live, official, MON_REG)), key(live), '공식(10/23) < 정규장(10/26)');
assert.deepEqual(key(merge(official, live, MON_REG)), key(live));
assert.deepEqual(key(merge(live, extended, MON_REG)), key(live), '지난 거래일 시간외 캐시 거절');
assert.deepEqual(key(merge(live, { ...live, price: 300, asOf: live.asOf - 1000 }, MON_REG)), key(live), '같은 날 옛 실시간 거절');
const harvest = { ticker: 'GOOGL', price: 310, change: 2, logo: null };
assert.deepEqual(v(merge(live, harvest, MON_REG)), v(live), '기준 날짜 없는 수확본도 정규장 행을 덮지 않음');
// 다른 기준의 분모를 섞지 않는다 — 분모 없는 새 정규장 행에 지난 공식 행의 분모(324.22)를 보충하지 않는다
assert.equal(merge(official, { ...live, prevClose: 0 }, MON_REG).prevClose, 0);
// 오늘 정규장 중 «같은 날짜»면 실시간이 공식보다 새 값
assert.deepEqual(v(merge({ ...official, session: '2026-10-26', closeSession: '2026-10-26' }, live, MON_REG)), v(live));

// ── 정규장 → 장후(같은 날): 정규장 실시간 행 → 서버가 공식으로 맞춘 행
const monClose = { ...live, price: 323.5, change: 1.03, closeSession: '2026-10-26', asOf: Date.parse('2026-10-26T20:00:00Z') };
assert.deepEqual(v(merge({ ...live, asOf: MON_POST }, monClose, MON_POST)), [323.5, 1.03, 320.21], 'REG→POST 공식 종가로 전환');

// ── 실시간 분모(웹·앱 화면 공용)
assert.equal(relatedLivePrevClose(official, MON_REG), 320.21, 'PRE 에 받은 금요일 공식 행 → 월요일 정규장 분모 = 금요일 공식 종가(관문 1305 ①)');
assert.equal(pct(321.11, relatedLivePrevClose(official, MON_REG)), 0.28);
assert.equal(relatedLivePrevClose(live, MON_REG), 320.21, '오늘 실시간 행 → 공급사 전일 종가');
assert.equal(relatedLivePrevClose({ ...official, closeSession: '2026-10-22', session: '2026-10-22' }, MON_REG), 0, '오래된 공식 행 → 분모 모름');
assert.equal(relatedLivePrevClose(extended, MON_REG), 0, '지난 거래일 시간외 행 → 분모 모름(324.22 로 계산 금지)');
assert.equal(relatedLivePrevClose(harvest, MON_REG), 0, '분모 없는 수확본');
assert.equal(relatedLivePrevClose({ ...harvest, prevClose: 305 }, MON_REG), 305, '기준 모르는 옛 행은 기존 동작');
assert.equal(relatedLivePrevClose({ ...official, price: 0 }, MON_REG), 0);
assert.equal(relatedLivePrevClose(null, MON_REG), 0);
assert.equal(relatedLivePrevClose({ ...official, session: '2026-09-04', closeSession: '2026-09-04', price: 200 }, Date.parse('2026-09-08T15:00:00Z')), 200, '노동절 다음 날 분모 = 직전 거래일(금) 공식 종가');
assert.equal(relatedLivePrevClose(official, FRI_REG), 0, '그날 정규장 중 그날 공식 표식은 분모가 아니다');

// ── 이전 행 없음·불변
assert.deepEqual(key(merge(undefined, official, SUN)), key(official));
assert.deepEqual(v(merge({ ...official, price: 0, change: 0 }, extended, SUN)), v(extended), '실패했던 이전 행은 정상 값으로 회복');
const o1 = structuredClone(official), o2 = structuredClone(extended);
merge(official, extended, SUN); merge(extended, official, MON_REG);
assert.deepEqual(official, o1); assert.deepEqual(extended, o2);

// 앱 unified 병합 — 목록은 직접 API 그대로, 바뀐 것이 없으면 같은 배열(재렌더 0)
{
    const Date = fakeDate(SUN);
    const prev = [official, { ...live, ticker: 'AMD' }];
    const same = mobileUnified({ unifiedRelatedRows: [extended], mergeRelatedRow, Date })(prev);
    assert.equal(same, prev, '공식 행 유지 → 같은 배열');
    const next = mobileUnified({ unifiedRelatedRows: [official, { ticker: 'NEW', price: 1, change: 0 }], mergeRelatedRow, Date })([extended]);
    assert.deepEqual(next.map((r: any) => r.ticker), ['GOOGL'], '목록 추가 없음');
    assert.deepEqual(next[0], official);
    const empty: any[] = [];
    assert.equal(mobileUnified({ unifiedRelatedRows: [official], mergeRelatedRow, Date })(empty), empty);
}

// ── T31b(밤 검토 1027) — 정규장 중 날짜 없는 행. 시각은 화요일 10/27(EDT).
{
    const TUE_PRE = Date.parse('2026-10-27T12:00:00Z');    // 08:00 ET
    const TUE_OPEN = Date.parse('2026-10-27T13:30:30Z');   // 09:30:30 ET 개장 직후
    const TUE_REG = Date.parse('2026-10-27T14:00:00Z');    // 10:00 ET
    const TUE_CLOSE1 = Date.parse('2026-10-27T20:00:30Z'); // 16:00:30 ET 장후 시작
    const MON_CLOSE = Date.parse('2026-10-26T20:00:00Z');
    assert.deepEqual(relatedSessionContext(Date.parse('2026-10-27T13:29:30Z')), { regular: false, date: '2026-10-26' }, '09:29:30 ET 은 장전');
    assert.deepEqual(relatedSessionContext(TUE_OPEN), { regular: true, date: '2026-10-27' });
    assert.deepEqual(relatedSessionContext(TUE_CLOSE1), { regular: false, date: '2026-10-27' });
    // 운영 실측(10/27 10:0x KST): 장전에 받은 월요일 공식 행 = 직접 API·unified 출구 모두 이 모양
    const monOff = { ticker: 'GOOGL', price: 316.8, change: -1.06, prevClose: 320.21, logo: null,
        session: '2026-10-26', closeSession: '2026-10-26', asOf: MON_CLOSE };
    // 운영 Redis 원본(unified 캐시 NVDA, 10/22 23:40 ET 저장) — session·asOf 없음. 정규장엔 출구 보정이 없어 이대로 나간다.
    const staleCache = { ticker: 'GOOGL', price: 324.2, change: -3.15, prevClose: 334.76, logo: null };
    const todayLive = { ticker: 'GOOGL', price: 318.4, change: 0.51, prevClose: 316.8, logo: null, session: '2026-10-27', asOf: TUE_REG - 20_000 };
    for (const at of [TUE_OPEN, TUE_REG]) {
        // ① 나이 모르는 캐시 행은 정규장에서도 계속 거절(«오늘»으로 치면 5일 전 값·분모가 덮는다)
        assert.deepEqual(key(merge(monOff, staleCache, at)), key(monOff), '장전 공식 행 위에 옛 캐시 행 거절');
        assert.deepEqual(key(merge(todayLive, staleCache, at)), key(todayLive), '오늘 실시간 행 위에 옛 캐시 행 거절');
        assert.equal(relatedLivePrevClose(merge(monOff, staleCache, at), at), 316.8, '실시간 분모는 월요일 공식 종가 유지(334.76 아님)');
        // ② 표식을 단 unified 정규장 행(수리 뒤 모양)은 채택 — 코덱스 재현(320.21 −1.24% 위에 325 +1.50%)의 오늘판
        const unifiedFresh = { ticker: 'GOOGL', price: 321.55, change: 1.5, prevClose: 316.8, logo: null, session: '2026-10-27', asOf: at - 5000 };
        assert.deepEqual(v(merge(monOff, unifiedFresh, at)), [321.55, 1.5, 316.8], '오늘 날짜 unified 행 채택');
        assert.equal(relatedLivePrevClose(merge(monOff, unifiedFresh, at), at), 316.8);
        // ③ session 없이 원천 시각만 오늘인 행(일봉 폴백 등)도 오늘 관측 — 지난 기준의 분모를 섞지 않는다
        const asOfOnly = { ticker: 'GOOGL', price: 321.55, change: 1.5, logo: null, session: null, asOf: at - 5000 };
        const m = merge(monOff, asOfOnly, at);
        assert.deepEqual([m.price, m.change], [321.55, 1.5], '원천 시각 오늘 → 채택');
        assert.equal(m.prevClose, undefined, '다른 기준(월요일 공식 행의 분모 320.21) 보충 안 함');
        assert.equal(relatedLivePrevClose(m, at), 0, '분모 모름 → 화면은 무분모 경로');
        assert.deepEqual(v(merge(monOff, { ...asOfOnly, prevClose: 316.8 }, at)), [321.55, 1.5, 316.8]);
        // 같은 날 비교는 원천 시각 — 늦게 온 옛 응답 거절
        assert.deepEqual(v(merge(unifiedFresh, { ...asOfOnly, price: 300, asOf: at - 60_000 }, at)), v(unifiedFresh));
        // ④ 원천 시각이 지난 날이면 여전히 나이 모름
        assert.deepEqual(key(merge(monOff, { ...staleCache, asOf: Date.parse('2026-10-23T03:40:00Z') }, at)), key(monOff), '어제 시각 행 거절');
    }
    // ⑤ 장외 문맥은 그대로 — 장전·장후·휴장에 원천 시각만 있는 행은 공식 행을 못 이긴다
    const preTrade = { ticker: 'GOOGL', price: 317.9, change: 0.35, prevClose: 316.8, logo: null, asOf: TUE_PRE - 60_000 };
    assert.deepEqual(key(merge(monOff, preTrade, TUE_PRE)), key(monOff), '장전: 월요일 공식 유지');
    const tueOff = { ...monOff, price: 319.9, change: 0.98, prevClose: 316.8, session: '2026-10-27', closeSession: '2026-10-27', asOf: Date.parse('2026-10-27T20:00:00Z') };
    assert.deepEqual(key(merge(tueOff, { ...preTrade, asOf: TUE_CLOSE1 }, TUE_CLOSE1)), key(tueOff), '장후: 화요일 공식 유지');
    const THANKS = Date.parse('2026-11-26T17:00:00Z');
    const wedOff = { ...monOff, session: '2026-11-25', closeSession: '2026-11-25', asOf: Date.parse('2026-11-25T21:00:00Z') };
    assert.deepEqual(key(merge(wedOff, { ...preTrade, asOf: THANKS - 1000 }, THANKS)), key(wedOff), '휴장: 수요일 공식 유지');
    assert.deepEqual(key(merge(wedOff, staleCache, THANKS)), key(wedOff));
}

// unified 스냅샷 경로(tryDynamoFast) — 정규장 행은 직접 API 와 같은 기준 표식(session·asOf·prevClose)을 단다
{
    const unifiedSrc = fs.readFileSync('src/app/api/command/unified/route.ts', 'utf8');
    const i = unifiedSrc.indexOf("cashSessionPhaseAt(Date.now()) === 'regular') {\n                                        const rd = td?._intrinio?.regularDate;");
    assert.ok(i > 0, 'unified 정규장 연관 행 표식 분기');
    const block = unifiedSrc.slice(i, i + 700);
    for (const f of ['prevClose:', 'session:', 'asOf:', 'relatedSourceTimeMs(td?.lastTrade?.t)']) assert.ok(block.includes(f), f);
    // 관문 10271018 — 정규장 표식 행의 가격은 직접 API 와 같은 선택(체결가 먼저). day.c(덧입히기 실패 때 전일 값)에 체결 시각을 붙이지 않는다.
    const head = unifiedSrc.slice(i - 600, i);
    assert.match(head, /const livePrice = td\?\.lastTrade\?\.p \|\| td\?\.day\?\.c \|\| 0;/);
    assert.match(unifiedSrc.slice(i, i + 900), /price: Math\.round\(livePrice \* 100\) \/ 100/);
    const relatedSrc = fs.readFileSync('src/app/api/live/related/route.ts', 'utf8');
    assert.match(relatedSrc, /const currentPrice = tickerData\?\.lastTrade\?\.p \|\| tickerData\?\.day\?\.c \|\| 0;/, '직접 API 의 같은 선택');
}

// 화면 소스가 이 함수를 그대로 쓰는가
const webSrc = fs.readFileSync('src/components/LiveTickerDashboard.tsx', 'utf8');
const mobileSrc = fs.readFileSync('src/components/intel/mobile/MobileCmdOverview.tsx', 'utf8');
assert.equal((webSrc.match(/mergeRelatedRow\(oldItem, newItem, Date\.now\(\)\)/g) || []).length, 2, '웹 두 경로 같은 병합');
assert.match(webSrc, /const validPrevClose = relatedLivePrevClose\(item, Date\.now\(\)\);/);
assert.match(mobileSrc, /const validPrevClose = relatedLivePrevClose\(r, Date\.now\(\)\);/);
console.log('relatedRowMerge: 운영 사고·관문 1010/1206/1305 반례·밤 검토 2건·T31b 정규장 날짜 없는 행·정규장 실시간·가격 0 보호·분모 규칙 통과(웹·앱 4경로 동일)');
