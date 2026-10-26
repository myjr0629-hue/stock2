import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

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
const mobileSessionProp = find(mobile, node => ts.isJsxAttribute(node) && node.name.getText(mobile) === 'isRegularSession') as ts.JsxAttribute;
assert.ok(mobileSessionProp.initializer && ts.isJsxExpression(mobileSessionProp.initializer));
const mobileRegular = compile(['q'], `return ${mobileSessionProp.initializer.expression!.getText(mobile)};`);
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
    return compile(['r', 'item', 'wsGetPrice', 'relWsGetPrice', 'isRegularSession', 'isRelatedRegularSession', 'relWsConnected'],
        `${statements.join('\n')}\nreturn [displayPrice, displayChange];`);
}
const mobileDisplay = displayCalculation(mobile, 'wsGetPrice');
const desktopDisplay = displayCalculation(desktop, 'relWsGetPrice');
const official = { ticker: 'GOOGL', price: 320.21, change: -1.24, prevClose: 324.22, closeSession: '2026-10-23' };
const extendedTick = { price: 321.11, changePct: -0.96 };
let tickReads = 0, checks = 0;
function check(calc: Function, regular: boolean, row: any, tick: any, expected: number[], connected = true) {
    const before = tickReads;
    const getPrice = () => { tickReads++; return tick; };
    assert.deepEqual(calc(row, row, getPrice, getPrice, regular, regular, connected), expected);
    if (!regular) assert.equal(tickReads, before, '장외에서는 잔류 WebSocket 틱도 읽지 않음');
    checks++;
}
const states = [
    { session: 'pre', market: 'open', isHoliday: false, quoteSession: 'PRE' },
    { session: 'post', market: 'open', isHoliday: false, quoteSession: 'POST' },
    { session: 'closed', market: 'closed', isHoliday: false, quoteSession: 'CLOSED' },
    { session: 'closed', market: 'closed', isHoliday: false, quoteSession: 'CLOSED', weekend: true },
    { session: 'regular', market: 'closed', isHoliday: true, quoteSession: 'CLOSED' },
];
for (const state of states) {
    const mobileReg = mobileRegular({ session: state.quoteSession });
    const desktopReg = desktopRegular(state);
    assert.equal(mobileReg, false); assert.equal(desktopReg, false);
    for (const [calc, regular] of [[mobileDisplay, mobileReg], [desktopDisplay, desktopReg]] as const) {
        check(calc, regular, official, extendedTick, [320.21, -1.24]);
        check(calc, regular, { ...official, price: 100, change: 0, prevClose: 100 }, { price: 99, changePct: -1 }, [100, 0]);
        check(calc, regular, { ...official, price: 100.56, change: -0.44, prevClose: 101 }, { price: 101.56, changePct: 0.56 }, [100.56, -0.44]);
        check(calc, regular, { ...official, prevClose: undefined }, extendedTick, [320.21, -1.24]);
    }
}
const mobileReg = mobileRegular({ session: 'REG' });
const desktopReg = desktopRegular({ session: 'regular', market: 'open', isHoliday: false });
assert.equal(mobileReg, true); assert.equal(desktopReg, true);
for (const calc of [mobileDisplay, desktopDisplay]) {
    const before = tickReads;
    check(calc, true, official, { ...extendedTick, changePct: 4.4 }, [321.11, -0.96]);
    assert.ok(tickReads > before, '정규장 실시간 가격을 읽고 서버 분모로 등락 계산');
    check(calc, true, official, undefined, [320.21, -1.24]);
    check(calc, true, { ...official, prevClose: undefined }, extendedTick, [321.11, -0.96]);
    check(calc, true, { ...official, price: 100, change: -1, prevClose: 100 }, { price: 100, changePct: -1 }, [100, 0]);
}
check(desktopDisplay, true, official, extendedTick, [320.21, -1.24], false);
console.log(`relatedPeerDisplay: 실제 모바일·웹 계산 ${checks}개 통과 — PRE·POST·CLOSED·주말·휴장 공식 종가, 부호·보합, REG 실시간`);
