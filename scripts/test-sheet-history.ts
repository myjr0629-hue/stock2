// «내 종목» 시트·검색 팝업·페이월의 히스토리 칸(useBackToClose)과 겹친 층(useLayer) 고정 테스트.
// 지키는 것(안드로이드 뒤로가기 = history.back()):
//   · 두 층(한도 시트 + 페이월)이 한꺼번에 닫혀도(구매 성공·약관 링크) 얹은 칸이 전부 걷힌다 — 뒤로가기가 헛돌지 않는다
//   · 층이 열린 채 다른 화면으로 옮겨 가면, 돌아올 때 뒤로가기 «한 번»에 원래 화면
//   · 검색 팝업 위 한도 시트: 뒤로가기 한 번 · Esc 한 번은 «맨 위 층만» 닫는다 · 아래 층은 inert(초점·키보드가 새지 않는다)
//   · 길게 누르기 → 한도 시트(한 커밋에 닫힘+열림): 늦게 온 popstate 가 새 시트를 닫지 않는다
//
// 실행(저장소 루트에서 — alias 경로가 작업 폴더 기준이다):
//   node_modules/.bin/esbuild scripts/test-sheet-history.ts --bundle --platform=node --format=cjs --jsx=automatic \
//     --loader:.css=empty \
//     --alias:react/jsx-runtime=./scripts/test-sheet-history.shim.ts \
//     --alias:react=./scripts/test-sheet-history.shim.ts \
//     --alias:@capacitor/core=./scripts/test-sheet-history.shim.ts \
//     --outfile=/tmp/test-sheet-history.cjs --log-level=warning && node /tmp/test-sheet-history.cjs
import { act, mount, hist, userBack, userForward, routerPush, keydown, El } from './test-sheet-history.shim';
import { useBackToClose, useLayer, afterSheetHistory } from '../src/components/app/watchlist/BottomSheet';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass += 1; console.log(`  ✅ ${name}`); } else { fail += 1; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** 걷기(history.back 연쇄)가 다 끝날 때까지 */
async function settle() { await wait(30); await afterSheetHistory(); await wait(30); }
const where = () => `index=${hist.index} len=${hist.stack.length} tok=${hist.stack[hist.index].state?.__sgSheet ?? '-'}`;

type P = { open: boolean };
/** 층 하나 = 시트·검색 팝업·페이월이 부르는 두 훅(뒤로가기로 닫힘 → «이름:pop», Esc → «이름:esc») */
function layer(name: string, log: string[], el?: El) {
  const ref = { current: el ?? null };
  return (p: P) => {
    useBackToClose(p.open, () => log.push(`${name}:pop`));
    useLayer(p.open, () => log.push(`${name}:esc`), ref as unknown as { current: HTMLElement | null });
  };
}

async function main() {
  console.log('── 1. 시트 하나: 열기 → X 로 닫기');
  {
    const log: string[] = [];
    const A = mount(layer('A', log), { open: true });
    await settle();
    check('열면 칸 하나', hist.index === 1 && !!hist.stack[1].state.__sgSheet, where());
    A.unmount();
    await settle();
    check('닫으면 걷혀 원래 자리', hist.index === 0, where());
    check('뒤로가기 닫힘 콜백은 불리지 않는다', log.length === 0, log.join());
  }

  console.log('── 2. 한도 시트 + 페이월이 «한꺼번에» 닫힘(구매 성공 · 약관 링크)');
  {
    const log: string[] = [];
    const A = mount(layer('A', log), { open: true });
    await settle();
    const B = mount(layer('B', log), { open: true });
    await settle();
    check('칸 둘', hist.index === 2, where());
    act(() => { A.unmount(); B.unmount(); });
    await afterSheetHistory();
    check('afterSheetHistory 가 풀릴 때 두 칸 다 걷혀 있다(그 뒤 이동해도 되돌려지지 않는다)', hist.index === 0, where());
    check('뒤로가기 닫힘 콜백 없음', log.length === 0, log.join());
  }

  console.log('── 3. 검색 팝업 위 한도 시트 — 뒤로가기 한 번은 시트만');
  {
    const log: string[] = [];
    const S = mount(layer('S', log), { open: true });
    await settle();
    const A = mount(layer('A', log), { open: true });
    await settle();
    userBack();
    await wait(20);
    check('시트만 닫힌다(검색 팝업은 그대로)', log.join() === 'A:pop', log.join());
    A.unmount();
    await settle();
    check('뒤로가기로 닫힌 칸은 다시 걷지 않는다(검색 팝업 칸에 머묾)', hist.index === 1, where());
    S.unmount();
    await settle();
    check('검색 팝업을 닫으면 원래 자리', hist.index === 0, where());
  }

  console.log('── 4. 층 셋이 열린 채 다른 화면으로 이동 → 돌아올 때 뒤로가기 한 번');
  {
    const log: string[] = [];
    const S = mount(layer('S', log), { open: true });
    await settle();
    const A = mount(layer('A', log), { open: true });
    await settle();
    const B = mount(layer('B', log), { open: true });
    await settle();
    routerPush();                                             // 새 화면(약관 등)
    act(() => { S.unmount(); A.unmount(); B.unmount(); });    // 경로가 바뀌어 층이 닫힘
    await settle();
    check('이동한 화면에 머문다', hist.index === 4, where());
    userBack();
    await wait(60);
    await settle();
    check('닫힌 층의 칸 셋을 건너 원래 화면으로', hist.index === 0, where());
    check('뒤로가기 닫힘 콜백 없음(이미 닫힌 층)', log.length === 0, log.join());
  }

  console.log('── 5. 길게 누르기 → 한도 시트(한 커밋에 닫힘 + 열림)');
  {
    const log: string[] = [];
    const L = mount(layer('L', log), { open: true });
    await settle();
    let N: { unmount(): void } | null = null;
    act(() => { L.unmount(); N = mount(layer('N', log), { open: true }); });
    await settle();
    check('칸은 하나(새 시트 것)', hist.index === 1, where());
    check('늦게 온 popstate 가 새 시트를 닫지 않는다', log.length === 0, log.join());
    (N as { unmount(): void } | null)?.unmount();
    await settle();
    check('닫으면 원래 자리', hist.index === 0, where());
  }

  console.log('── 6. 앞으로 가기로 닫힌 층의 칸에 들어가면 곧장 되돌린다');
  {
    const log: string[] = [];
    const A = mount(layer('A', log), { open: true });
    await settle();
    userBack();
    await wait(20);
    A.unmount();
    await settle();
    check('뒤로가기로 닫힘', log.join() === 'A:pop' && hist.index === 0, `${log.join()} ${where()}`);
    userForward();
    await wait(30);
    await settle();
    check('죽은 칸에 머물지 않는다', hist.index === 0, where());
  }

  console.log('── 7. Esc · inert — 맨 위 층만');
  {
    const log: string[] = [];
    const searchEl = new El('search');
    const input = new El('input');
    searchEl.kids.push(input);
    const sheetEl = new El('sheet');
    const S = mount(layer('S', log, searchEl), { open: true });
    input.focus();
    const A = mount(layer('A', log, sheetEl), { open: true });
    const doc = (globalThis as unknown as { document: { activeElement: unknown } }).document;
    check('아래 층 inert · 입력칸 초점을 놓는다(키보드가 시트 위로 오지 않게)',
      searchEl.hasAttribute('inert') && !sheetEl.hasAttribute('inert') && doc.activeElement !== input);
    const e = keydown('Escape');
    check('Esc 한 번 = 맨 위 층만', log.join() === 'A:esc' && e.defaultPrevented, log.join());
    A.unmount();
    check('위 층이 닫히면 inert 가 풀린다', !searchEl.hasAttribute('inert'));
    keydown('Escape');
    check('이제 검색 팝업이 Esc 를 받는다', log.join() === 'A:esc,S:esc', log.join());
    S.unmount();
    await settle();
    check('칸 정리', hist.index === 0, where());
  }

  console.log(fail === 0 ? `\n${pass}/${pass} 통과` : `\n${fail}개 실패 (${pass} 통과)`);
  process.exit(fail === 0 ? 0 : 1);
}

void main();
