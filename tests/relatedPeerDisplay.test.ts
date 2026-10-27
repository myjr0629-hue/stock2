import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { relatedLivePrevClose, relatedSessionContext } from '../src/lib/relatedRowMerge';
import { relatedWsTick } from '../src/lib/liveTickFreshness';

// 두 화면의 실제 표시 계산을 실행한다. React·브라우저·네트워크·환경 파일 접근 없음.
function parse(file: string) {
    return ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function find(root: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node {
    let result: ts.Node | undefined;
    function visit(node: ts.Node) {
        if (predicate(node)) result = node;
        ts.forEachChild(node, visit);
    }
    visit(root);
    assert.ok(result, '실제 화면 계산 코드 존재');
    return result;
}
function compile(args: string[], body: string) {
    const js = ts.transpileModule(body, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    return new Function(...args, js);
}
const mobile = parse('src/components/intel/mobile/MobileCmdOverview.tsx');
const desktop = parse('src/components/LiveTickerDashboard.tsx');
// 앱: 부모 세션 문자열이 아니라 렌더 시각의 달력 판정(관문 10261523 — SSR 은 소문자 'reg'·초기값 고정)
const mobileSessionDecl = find(mobile, node => ts.isVariableDeclaration(node) && node.name.getText(mobile) === 'isRegularSession') as ts.VariableDeclaration;
const mobileRegularAt = compile(['relatedSessionContext', 'Date'], `return ${mobileSessionDecl.initializer!.getText(mobile)};`);
assert.doesNotMatch(fs.readFileSync('src/components/intel/mobile/MobileCmdOverview.tsx', 'utf8'), /q\.session === 'REG'/, '부모 세션 문자열 의존 제거');
function declaration(name: string) {
    const node = find(desktop, node => ts.isVariableDeclaration(node) && node.name.getText(desktop) === name) as ts.VariableDeclaration;
    return `const ${name} = ${node.initializer!.getText(desktop)};`;
}
const desktopRegular = compile(['marketStatus'], `${declaration('isClosed')}\n${declaration('isRelatedRegularSession')}\nreturn isRelatedRegularSession;`);

function displayCalculation(ast: ts.SourceFile, getter: string) {
    const block = find(ast, node => ts.isBlock(node) && node.statements.some(statement =>
        ts.isVariableStatement(statement) && statement.declarationList.declarations.some(d =>
            d.name.getText(ast) === 'wsPrice' && !!d.initializer?.getText(ast).includes(getter)))) as ts.Block;
    const statements: string[] = [];
    for (const statement of block.statements) {
        if (ts.isReturnStatement(statement)) break;
        statements.push(statement.getText(ast));
    }
    return compile(['r', 'item', 'wsGetPrice', 'relWsGetPrice', 'isRegularSession', 'isRelatedRegularSession', 'relWsConnected', 'relatedLivePrevClose', 'Date', 'relatedWsTick'],
        `${statements.join('\n')}\nreturn [displayPrice, displayChange];`);
}
const mobileDisplay = displayCalculation(mobile, 'wsGetPrice');
const desktopDisplay = displayCalculation(desktop, 'relWsGetPrice');
const SUN = Date.parse('2026-10-26T02:55:00Z');      // 일요일 CLOSED(운영 실측 10/26 11:55 KST)
const MON_REG = Date.parse('2026-10-26T14:00:00Z');  // 월 10:00 ET 정규장
// 서버 공식 행(10/23 GOOGL 공식 320.21 · 전일 324.22)
const official = { ticker: 'GOOGL', price: 320.21, change: -1.24, prevClose: 324.22, session: '2026-10-23', closeSession: '2026-10-23' };
const extendedTick = { price: 321.11, changePct: -0.96 };
let tickReads = 0, checks = 0;
function check(calc: Function, regular: boolean, row: any, tick: any, expected: number[], connected = true, nowMs = regular ? MON_REG : SUN) {
    const before = tickReads;
    const getPrice = () => { tickReads++; return tick; };
    assert.deepEqual(calc(row, row, getPrice, getPrice, regular, regular, connected, relatedLivePrevClose, { now: () => nowMs }, relatedWsTick), expected);
    if (!regular) assert.equal(tickReads, before, '장외에서는 잔류 WebSocket 틱도 읽지 않음');
    checks++;
}
const states = [
    { session: 'pre', market: 'open', isHoliday: false, at: Date.parse('2026-10-26T12:00:00Z') },
    { session: 'post', market: 'open', isHoliday: false, at: Date.parse('2026-10-26T21:00:00Z') },
    { session: 'closed', market: 'closed', isHoliday: false, at: Date.parse('2026-10-27T03:00:00Z') },
    { session: 'closed', market: 'closed', isHoliday: false, at: SUN },
    { session: 'regular', market: 'closed', isHoliday: true, at: Date.parse('2026-11-26T17:00:00Z') },
];
for (const state of states) {
    const mobileReg = mobileRegularAt(relatedSessionContext, { now: () => state.at });
    const desktopReg = desktopRegular(state);
    assert.equal(mobileReg, false); assert.equal(desktopReg, false);
    for (const [calc, regular] of [[mobileDisplay, mobileReg], [desktopDisplay, desktopReg]] as const) {
        // 관문 1206 ① — 장외엔 WebSocket 321.11 이 와도 공식 320.21 −1.24%
        check(calc, regular, official, extendedTick, [320.21, -1.24]);
        check(calc, regular, { ...official, price: 100, change: 0, prevClose: 100 }, { price: 99, changePct: -1 }, [100, 0]);
        check(calc, regular, { ...official, price: 100.56, change: -0.44, prevClose: 101 }, { price: 101.56, changePct: 0.56 }, [100.56, -0.44]);
        check(calc, regular, { ...official, prevClose: undefined }, extendedTick, [320.21, -1.24]);
    }
}
const mobileReg = mobileRegularAt(relatedSessionContext, { now: () => MON_REG });
// SSR 이 소문자 'reg' 를 넘기거나 PRE 에 고정돼도 정규장 시각이면 실시간(관문 10261523)
assert.equal(mobileRegularAt(relatedSessionContext, { now: () => Date.parse('2026-10-26T13:30:00Z') }), true, '09:30 ET 개장 즉시');
assert.equal(mobileRegularAt(relatedSessionContext, { now: () => Date.parse('2026-11-27T18:00:00Z') }), false, '조기 폐장 13:00 뒤');
const desktopReg = desktopRegular({ session: 'regular', market: 'open', isHoliday: false });
assert.equal(mobileReg, true); assert.equal(desktopReg, true);
const liveRow = { ticker: 'GOOGL', price: 321, change: 0.25, prevClose: 320.21, session: '2026-10-26' };
for (const calc of [mobileDisplay, desktopDisplay]) {
    const before = tickReads;
    // 관문 1305 ① — PRE 에 받은 금요일 공식 행이 그대로 정규장에 들어가도 분모는 금요일 공식 종가 320.21 → +0.28%(−0.96% 아님)
    check(calc, true, official, { ...extendedTick, changePct: 4.4 }, [321.11, 0.28]);
    assert.ok(tickReads > before, '정규장 실시간 가격을 읽는다');
    check(calc, true, { ...official, prevClose: undefined }, extendedTick, [321.11, 0.28]);
    // 정규장 실시간 행 — 공급사 전일 종가 분모
    check(calc, true, liveRow, { price: 322, changePct: 4.4 }, [322, 0.56]);
    check(calc, true, liveRow, undefined, [321, 0.25], true);
    check(calc, true, { ...liveRow, price: 320.21, change: 0 }, { price: 320.21, changePct: 0 }, [320.21, 0], true);
    // 기준이 오래된 행(지난 거래일 시간외 캐시)은 그 분모(324.22)로 계산하지 않는다 → 기존 무분모 경로
    check(calc, true, { ...official, price: 321.11, change: -0.96, closeSession: undefined }, { price: 322, changePct: 0.56 }, [322, 0.56]);
    check(calc, true, { ...official, price: 321.11, change: -0.96, closeSession: undefined }, { price: 322, changePct: 0 }, [322, -0.96]);
    check(calc, true, official, undefined, [320.21, -1.24]);
}
check(desktopDisplay, true, official, extendedTick, [320.21, -1.24], false);
console.log(`relatedPeerDisplay: 실제 모바일·웹 계산 ${checks}개 통과 — PRE·POST·CLOSED·주말·휴장 공식 종가, PRE→REG 분모 재설정, 부호·보합, REG 실시간`);
