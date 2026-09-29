/**
 * «내 종목» 기기 저장소 시험 — src/lib/app/watchlist.ts
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/appWatchlist.test.ts
 *
 * 지키는 것: 한도(무료 5 · PRO 100 = MAX_ITEMS) · 되돌리기 · 순서 · 깨진 저장소 · 막힌 저장소(사생활 모드) · 다른 탭의 변경
 *           · 별 동작(starActions): 기기 상한(MAX_ITEMS)에서 한도 시트 무한 반복 없음 · 한도보다 많이 가진 목록의 되돌리기
 *             · 연타(이미 담김)는 토스트·진동 없음 · 저장 실패 알림 · 공개 웹 가디언 번들에 «내 종목» 정적 import 없음
 * (6절은 PRO 확인을 기다리는 경로라 2.5초씩 두 번 기다린다)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  createWatchlistStore, parseWatchlist, serializeWatchlist, normalizeTicker, addOutcome, _setWatchlistStoreForTest,
  FREE_LIMIT, MAX_ITEMS, WATCHLIST_STORAGE_KEY, WATCHLIST_PERSIST_KEYS, type StorageLike, type UndoToken,
} from '../src/lib/app/watchlist';
import { addStar, removeStar, undoRemove } from '../src/components/app/watchlist/starActions';
import { WL_COPY } from '../src/components/app/watchlist/copy';
import { wlUI } from '../src/lib/app/watchlistUI';
import { notifyProPurchased } from '../src/lib/app/proEntitlement';
import { noteInAppPath, hasInAppBack, _resetInAppHistoryForTest } from '../src/lib/app/inAppHistory';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const ta = async (name: string, fn: () => Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };

class MemStorage implements StorageLike {
  map = new Map<string, string>();
  writes = 0;
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.writes++; this.map.set(k, v); }
}
class BlockedStorage implements StorageLike {
  getItem(): string | null { throw new Error('SecurityError'); }
  setItem(): void { throw new Error('QuotaExceededError'); }
}

const mk = (s: StorageLike | null = new MemStorage(), clock = { t: 1000 }) =>
  createWatchlistStore({ storage: () => s, now: () => clock.t++ });

console.log('━━━ 1. 모양·정규화 ━━━');
t('FREE_LIMIT 는 대표 결정 5 · 저장 키는 sg-watchlist-v1', () => {
  assert.equal(FREE_LIMIT, 5);
  assert.equal(WATCHLIST_STORAGE_KEY, 'sg-watchlist-v1');
  assert.ok((WATCHLIST_PERSIST_KEYS as readonly string[]).includes('sg-watchlist-v1'), '캐시 지우기가 남길 키에 들어 있어야 한다');
});
t('티커 정규화: 소문자·공백 → 대문자, BRK.B·BF-B 허용, 이상한 값은 null', () => {
  assert.equal(normalizeTicker(' nvda '), 'NVDA');
  assert.equal(normalizeTicker('brk.b'), 'BRK.B');
  assert.equal(normalizeTicker('BF-B'), 'BF-B');
  assert.equal(normalizeTicker(''), null);
  assert.equal(normalizeTicker('1ABC'), null);
  assert.equal(normalizeTicker('<script>'), null);
  assert.equal(normalizeTicker(null), null);
});
t('직렬화 왕복: {v:1, items:[{t, addedAt, src}]}', () => {
  const raw = serializeWatchlist([{ t: 'MU', addedAt: 5, src: 'cmd' }]);
  assert.deepEqual(JSON.parse(raw), { v: 1, items: [{ t: 'MU', addedAt: 5, src: 'cmd' }] });
  assert.deepEqual(parseWatchlist(raw), [{ t: 'MU', addedAt: 5, src: 'cmd' }]);
});

console.log('━━━ 2. 한도·순서 ━━━');
t('담기는 뒤에 붙는다(순서 = 배열 순서) · 같은 종목은 다시 담지 않는다', () => {
  const s = mk();
  assert.deepEqual(s.add('nvda', 'cmd', FREE_LIMIT), { ok: true, added: true, count: 1 });
  s.add('MU', 'flow', FREE_LIMIT);
  assert.deepEqual(s.add('NVDA', 'search', FREE_LIMIT), { ok: true, added: false, count: 2 });
  assert.deepEqual(s.tickers(), ['NVDA', 'MU']);
  assert.equal(s.has('nvda'), true);
});
t('무료: 6번째는 한도 — 별이 채워지지 않는다(목록 그대로)', () => {
  const s = mk();
  for (const x of ['MU', 'NVDA', 'TSLA', 'AAPL', 'AMD']) assert.equal(s.add(x, 'cmd', FREE_LIMIT).ok, true);
  const r = s.add('META', 'cmd', FREE_LIMIT);
  assert.deepEqual(r, { ok: false, reason: 'limit', count: 5, limit: 5 });
  assert.equal(s.count(), 5);
  assert.equal(s.has('META'), false);
});
t('PRO(Infinity): 한도 없음 — 단 기기 안전 상한 MAX_ITEMS', () => {
  const s = mk();
  for (let i = 0; i < 12; i++) assert.equal(s.add(`T${String.fromCharCode(65 + i)}`, 'cmd', Infinity).ok, true);
  assert.equal(s.count(), 12);
  const big = mk();
  for (let i = 0; i < MAX_ITEMS; i++) big.add(`A${i}`, 'x', Infinity);
  assert.equal(big.count(), MAX_ITEMS);
  assert.equal(big.add('ZZZ', 'x', Infinity).ok, false);
});
t('잘못된 티커는 담지 않는다', () => {
  const s = mk();
  assert.equal(s.add('??', 'cmd', FREE_LIMIT).ok, false);
  assert.equal(s.count(), 0);
});
t('move: 끌어서 순서 바꾸기(범위 밖·같은 자리는 무시)', () => {
  const s = mk();
  for (const x of ['A', 'B', 'C', 'D']) s.add(x, 'x', FREE_LIMIT);
  assert.equal(s.move(0, 2), true);
  assert.deepEqual(s.tickers(), ['B', 'C', 'A', 'D']);
  assert.equal(s.move(3, 0), true);
  assert.deepEqual(s.tickers(), ['D', 'B', 'C', 'A']);
  assert.equal(s.move(1, 1), false);
  assert.equal(s.move(-1, 2), false);
  assert.equal(s.move(0, 9), false);
});

console.log('━━━ 3. 빼기 · 되돌리기 ━━━');
t('remove → 표(token) · restore → 원래 자리로', () => {
  const s = mk();
  for (const x of ['MU', 'NVDA', 'TSLA']) s.add(x, 'cmd', FREE_LIMIT);
  const tok = s.remove('nvda');
  assert.ok(tok);
  assert.equal(tok!.index, 1);
  assert.deepEqual(s.tickers(), ['MU', 'TSLA']);
  assert.deepEqual(s.restore(tok!, FREE_LIMIT), { ok: true, added: true, count: 3 });
  assert.deepEqual(s.tickers(), ['MU', 'NVDA', 'TSLA']);
  assert.equal(s.getSnapshot()[1].src, 'cmd', '담았던 출처·시각을 되살린다');
});
t('없는 종목 빼기는 null · 이미 돌아와 있으면 restore 는 아무 일도 안 한다', () => {
  const s = mk();
  s.add('MU', 'cmd', FREE_LIMIT);
  assert.equal(s.remove('AAPL'), null);
  const tok = s.remove('MU')!;
  s.add('MU', 'flow', FREE_LIMIT);
  assert.deepEqual(s.restore(tok, FREE_LIMIT), { ok: true, added: false, count: 1 });
});
t('되돌리기도 한도를 지킨다(빼고 다른 걸 담은 뒤 되돌리면 6개가 되는 틈)', () => {
  const s = mk();
  for (const x of ['A', 'B', 'C', 'D', 'E']) s.add(x, 'x', FREE_LIMIT);
  const tok = s.remove('C')!;
  s.add('F', 'x', FREE_LIMIT);
  assert.deepEqual(s.restore(tok, FREE_LIMIT), { ok: false, reason: 'limit', count: 5, limit: 5 });
  assert.equal(s.restore(tok, Infinity).ok, true, 'PRO 면 되돌린다');
});
t('빼기는 언제나 무료 — 한도를 넘긴 목록(PRO 해지 뒤)도 뺄 수 있다', () => {
  const s = mk();
  for (let i = 0; i < 8; i++) s.add(`X${i}`, 'x', Infinity);
  assert.ok(s.remove('X3'));
  assert.equal(s.count(), 7);
  assert.equal(s.add('NEW', 'x', FREE_LIMIT).ok, false, '무료 한도 밖이면 새로 담지는 못한다');
});

console.log('━━━ 4. 깨진 저장소 · 막힌 저장소 ━━━');
t('깨진 JSON → 빈 목록으로 읽고 던지지 않는다 · 다음 쓰기가 바로잡는다', () => {
  const m = new MemStorage();
  m.map.set(WATCHLIST_STORAGE_KEY, '{"v":1,"items":[{"t":"MU"');
  const s = mk(m);
  assert.deepEqual(s.tickers(), []);
  s.add('NVDA', 'cmd', FREE_LIMIT);
  assert.deepEqual(parseWatchlist(m.map.get(WATCHLIST_STORAGE_KEY)), [{ t: 'NVDA', addedAt: 1000, src: 'cmd' }]);
});
t('다른 버전·이상한 모양 → 빈 목록', () => {
  assert.deepEqual(parseWatchlist('{"v":2,"items":[{"t":"MU"}]}'), []);
  assert.deepEqual(parseWatchlist('[1,2,3]'), []);
  assert.deepEqual(parseWatchlist('null'), []);
  assert.deepEqual(parseWatchlist('"MU"'), []);
});
t('항목 단위로 거른다: 잘못된 티커·중복·숫자 아닌 시각', () => {
  const raw = JSON.stringify({ v: 1, items: [
    { t: 'mu', addedAt: 3, src: 'cmd' }, { t: 'MU', addedAt: 9 }, { t: 42 }, null, 'NVDA',
    { t: 'TSLA', addedAt: 'x', src: 7 },
  ] });
  assert.deepEqual(parseWatchlist(raw), [
    { t: 'MU', addedAt: 3, src: 'cmd' },
    { t: 'TSLA', addedAt: 0, src: '' },
  ]);
});
t('저장소가 막혀도(사생활 모드) 메모리로 계속 동작한다', () => {
  const s = mk(new BlockedStorage());
  assert.deepEqual(s.tickers(), []);
  assert.equal(s.add('MU', 'cmd', FREE_LIMIT).ok, true);
  assert.equal(s.has('MU'), true);
  assert.equal(s.isMemoryOnly(), true);
  const tok = s.remove('MU')!;
  assert.equal(s.restore(tok, FREE_LIMIT).ok, true);
});
t('저장소 자체가 없으면(null) 메모리 전용', () => {
  const s = createWatchlistStore({ storage: () => null });
  assert.equal(s.add('AAPL', 'cmd', FREE_LIMIT).ok, true);
  assert.equal(s.isMemoryOnly(), true);
});

console.log('━━━ 5. 구독 · 다른 탭의 변경 ━━━');
t('바뀔 때만 새 스냅샷 · 구독자에게 알린다', () => {
  const s = mk();
  let calls = 0;
  const off = s.subscribe(() => { calls++; });
  const a = s.getSnapshot();
  s.add('MU', 'cmd', FREE_LIMIT);
  const b = s.getSnapshot();
  assert.notEqual(a, b);
  assert.equal(calls, 1);
  s.add('MU', 'cmd', FREE_LIMIT);            // 이미 있음 → 변화 없음
  assert.equal(s.getSnapshot(), b);
  assert.equal(calls, 1);
  off();
  s.add('NVDA', 'cmd', FREE_LIMIT);
  assert.equal(calls, 1, '구독 해제 뒤엔 알리지 않는다');
});
t('reload: 다른 탭이 쓴 값을 읽고 알린다 · 같으면 조용하다', () => {
  const m = new MemStorage();
  const s = mk(m);
  let calls = 0;
  s.subscribe(() => { calls++; });
  m.map.set(WATCHLIST_STORAGE_KEY, serializeWatchlist([{ t: 'TSLA', addedAt: 1, src: 'dash' }]));
  assert.equal(s.reload(), true);
  assert.deepEqual(s.tickers(), ['TSLA']);
  assert.equal(calls, 1);
  assert.equal(s.reload(), false);
  assert.equal(calls, 1);
});

console.log('━━━ 5-1. 결과 → 화면 반응(addOutcome) · 되돌리기 개수 ━━━');
t('기기 상한(MAX_ITEMS)에 닿은 PRO 는 «limit» 이 아니라 «max» — 한도 시트(구매 권유)를 열 이유가 없다', () => {
  const big = mk();
  for (let i = 0; i < MAX_ITEMS; i++) big.add(`A${i}`, 'x', Infinity);
  assert.equal(addOutcome(big.add('ZZZ', 'x', Infinity)), 'max');
  const tok = big.remove('A5')!;
  big.add('NEW', 'x', Infinity);
  assert.equal(addOutcome(big.restore(tok, Infinity)), 'max', '빼고 다른 걸 담아 상한이 된 뒤의 되돌리기도');
  const s = mk();
  for (const x of ['A', 'B', 'C', 'D', 'E']) s.add(x, 'x', FREE_LIMIT);
  assert.equal(addOutcome(s.add('F', 'x', FREE_LIMIT)), 'limit', '무료 한도는 그대로 한도 시트');
  assert.equal(addOutcome(s.add('A', 'x', FREE_LIMIT)), 'already');
  assert.equal(addOutcome(s.add('??', 'x', FREE_LIMIT)), 'invalid');
});
t('빼기 표(token)는 «빼기 직전 개수»를 들고 있다', () => {
  const s = mk();
  for (const x of ['A', 'B', 'C']) s.add(x, 'x', FREE_LIMIT);
  assert.equal(s.remove('B')!.prevCount, 3);
});
t('무료 한도보다 많이 가진 목록(PRO 해지·코드 만료)도 방금 뺀 것은 원래 자리로 되돌린다 — 구매 시트 없이', () => {
  const s = mk();
  for (let i = 0; i < 8; i++) s.add(`X${i}`, 'x', Infinity);
  const tok = s.remove('X3')!;
  assert.deepEqual(s.restore(tok, FREE_LIMIT), { ok: true, added: true, count: 8 });
  assert.equal(s.tickers()[3], 'X3');
  assert.equal(s.add('NEW', 'x', FREE_LIMIT).ok, false, '한도를 늘리지는 않는다 — 새로 담기는 여전히 막힌다');
});
t('되돌리기 캡은 «빼기 직전 개수»까지 — 빼고 다른 걸 담아 그 개수를 채웠으면 막는다(한도 우회 없음)', () => {
  const s = mk();
  for (let i = 0; i < 8; i++) s.add(`X${i}`, 'x', Infinity);
  const tok = s.remove('X3')!;
  s.add('NEW', 'x', Infinity);
  assert.deepEqual(s.restore(tok, FREE_LIMIT), { ok: false, reason: 'limit', count: 8, limit: FREE_LIMIT });
});

console.log('━━━ 6. 별 동작(starActions) — 토스트·시트 ━━━');
// 화면(WatchlistHost)이 받는 것을 그대로 기록한다
const seen: { toasts: string[]; sheets: string[] } = { toasts: [], sheets: [] };
let lastToast = 0;
let lastSheet = 0;
wlUI.subscribe(() => {
  const st = wlUI.getSnapshot();
  if (st.toast && st.toast.id !== lastToast) { lastToast = st.toast.id; seen.toasts.push(st.toast.kind === 'text' ? `text:${st.toast.text.ko}` : st.toast.kind); }
  if (st.sheet && st.sheet.id !== lastSheet) { lastSheet = st.sheet.id; seen.sheets.push(st.sheet.kind); }
});
const use = (s: ReturnType<typeof mk>) => {
  _setWatchlistStoreForTest(s);
  seen.toasts = []; seen.sheets = [];
  wlUI.closeSheet(); wlUI.dismissToast();
  return s;
};
/** WatchlistHost 의 «한도 시트에서 PRO 가 되면 담으려던 종목을 담는다» 흉내 — 한도 시트가 다시 열리는 한 되풀이(예전엔 끝이 없었다) */
async function hostBecameProLoop(maxRounds = 5): Promise<number> {
  let rounds = 0;
  while (wlUI.getSnapshot().sheet?.kind === 'limit' && rounds < maxRounds) {
    const sh = wlUI.getSnapshot().sheet as { ticker: string };
    wlUI.closeSheet();
    await addStar(sh.ticker, 'restore', null, { sheet: false });
    rounds++;
  }
  return rounds;
}

async function actions() {
  await ta('연타: PRO 확인을 기다리는 사이 두 번 눌러도 두 번째는 «already» — 담기 토스트는 한 번', async () => {
    const s = use(mk());
    const [a, b] = await Promise.all([addStar('NVDA', 'cmd'), addStar('NVDA', 'cmd')]);
    assert.deepEqual([a, b], ['added', 'already']);
    assert.deepEqual(seen.toasts, ['added']);
    assert.equal(s.count(), 1);
  });
  await ta('저장소에 못 쓰면(사생활 모드) 담기 토스트 대신 «기기에 저장하지 못했습니다»', async () => {
    use(mk(new BlockedStorage()));
    assert.equal(await addStar('MU', 'cmd'), 'added');
    assert.deepEqual(seen.toasts, [`text:${WL_COPY.ko.saveFail}`]);
  });
  await ta('★ E7 저장소에 못 쓰면 빼기 토스트는 그대로(되돌리기 유지) + «기기에 저장하지 못함» 한 줄 표시', async () => {
    const s = use(mk(new BlockedStorage()));
    s.add('MU', 'x', FREE_LIMIT);
    assert.equal(removeStar('MU', 'list'), 'removed');
    const st = wlUI.getSnapshot().toast;
    assert.ok(st && st.kind === 'removed');
    assert.equal((st as { unsaved?: boolean }).unsaved, true);
    assert.deepEqual(seen.toasts, ['removed'], '되돌리기 토스트를 경고 토스트로 바꾸지 않는다');
    // 저장이 되면 표시 없음
    const ok = use(mk());
    ok.add('NVDA', 'x', FREE_LIMIT);
    removeStar('NVDA', 'list');
    assert.equal((wlUI.getSnapshot().toast as { unsaved?: boolean }).unsaved, undefined);
  });
  await ta('무료 한도보다 많이 가진 목록: 빼고 «되돌리기» → 구매 시트 없이 원래 자리(권한 확인 대기 2.5초 뒤 무료로 판정돼도)', async () => {
    const s = mk();
    for (let i = 0; i < 7; i++) s.add(`X${i}`, 'x', Infinity);
    use(s);
    assert.equal(removeStar('X2', 'list'), 'removed');
    const st = wlUI.getSnapshot().toast;
    assert.ok(st && st.kind === 'removed');
    assert.equal(await undoRemove((st as { undo: UndoToken }).undo), 'added');
    assert.deepEqual(seen.sheets, []);
    assert.equal(s.tickers()[2], 'X2');
  });
  await ta('자동 담기(sheet:false)는 무료 한도에 걸려도 한도 시트를 다시 열지 않는다(재진입 차단)', async () => {
    const s = mk();
    for (const x of ['A', 'B', 'C', 'D', 'E']) s.add(x, 'x', FREE_LIMIT);
    use(s);
    assert.equal(await addStar('F', 'restore', null, { sheet: false }), 'limit');
    assert.deepEqual(seen.sheets, []);
    assert.deepEqual(seen.toasts, [`text:${WL_COPY.ko.limitTitle(FREE_LIMIT)}`]);
  });

  notifyProPurchased(true);   // 여기부터 PRO(이 프로세스에서 되돌릴 수 없다 — 무료 경로 시험은 위에 둔다)
  await ta('PRO 가 기기 상한(MAX_ITEMS=100)에서 ☆ → 한도 시트 없이 «최대 100종목» 토스트 · «PRO 가 됐다 → 다시 담기» 반복 0회', async () => {
    const s = mk();
    for (let i = 0; i < MAX_ITEMS; i++) s.add(`A${i}`, 'x', Infinity);
    use(s);
    assert.equal(await addStar('NEW', 'cmd'), 'max');
    assert.equal(await hostBecameProLoop(), 0);
    assert.deepEqual(seen.sheets, [], '한도 시트를 한 번도 열지 않는다');
    assert.deepEqual(seen.toasts, [`text:${WL_COPY.ko.maxItems(MAX_ITEMS)}`]);
    assert.equal(s.count(), MAX_ITEMS);
  });
  await ta('PRO 상한: 빼고 다른 걸 담은 뒤 되돌리기도 한도 시트가 아니라 토스트', async () => {
    const s = mk();
    for (let i = 0; i < MAX_ITEMS; i++) s.add(`A${i}`, 'x', Infinity);
    use(s);
    const tok = s.remove('A7')!;
    s.add('NEW', 'x', Infinity);
    assert.equal(await undoRemove(tok), 'max');
    assert.deepEqual(seen.sheets, []);
  });
  _setWatchlistStoreForTest(null);

  console.log('━━━ 7. 공개 웹 번들 ━━━');
  t('공개 웹 가디언 흐름(MobileGuardianFlow)은 «내 종목» 모듈을 정적으로 가져오지 않는다(앱에서만 동적으로)', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/components/guardian/mobile/MobileGuardianFlow.tsx'), 'utf8');
    assert.equal(/^\s*import\s[^;]*?from\s+['"]@\/components\/app\/watchlist\//m.test(src), false);
    assert.ok(/import\(\s*['"]@\/components\/app\/watchlist\/useLongPress['"]\s*\)/.test(src));
  });

  console.log('━━━ 8. «뒤로» — 앱 안 이동 기록(B12) ━━━');
  {
    // 브라우저 흉내: 주소·히스토리 길이·popstate
    const pop: Array<() => void> = [];
    const w = { location: { pathname: '/ko/app-view/dash' }, history: { length: 1 }, addEventListener: (ty: string, fn: () => void) => { if (ty === 'popstate') pop.push(fn); } };
    (globalThis as any).window = w;
    const push = (full: string, app: string) => { w.location.pathname = full; w.history.length += 1; noteInAppPath(app); };
    const back = (full: string, app: string) => { w.location.pathname = full; pop.forEach((f) => f()); noteInAppPath(app); };
    _resetInAppHistoryForTest();
    t('앱을 켠 첫 화면(딥링크·새로고침 포함)은 뒤에 앱 화면이 없다 → Dashboard 로 바꿔 간다', () => {
      noteInAppPath('/app-view/watchlist');
      w.location.pathname = '/ko/app-view/watchlist';
      w.history.length = 3;   // 앞으로 가기 칸·앱 이전 칸이 있어도(history.length 판정이 틀리던 경우)
      assert.equal(hasInAppBack(), false);
    });
    t('Dashboard → 내 종목(앱 안 이동) → 뒤에 앱 화면이 있다 · 뒤로 온 뒤엔 다시 없다', () => {
      _resetInAppHistoryForTest();
      w.location.pathname = '/ko/app-view/dash'; w.history.length = 1;
      noteInAppPath('/app-view/dash');
      push('/ko/app-view/watchlist', '/app-view/watchlist');
      assert.equal(hasInAppBack(), true);
      back('/ko/app-view/dash', '/app-view/dash');
      assert.equal(hasInAppBack(), false);
    });
    t('시트를 닫는 popstate(주소 그대로) 뒤의 새 이동은 «뒤로»가 아니라 «앞으로»로 센다', () => {
      _resetInAppHistoryForTest();
      w.location.pathname = '/ko/app-view/dash'; w.history.length = 2;
      noteInAppPath('/app-view/dash');
      pop.forEach((f) => f());                          // 시트가 얹은 칸을 걷음 — 경로 변화 없음
      push('/ko/app-view/watchlist', '/app-view/watchlist');
      assert.equal(hasInAppBack(), true);
    });
    t('같은 경로(언어 바꾸기·?t= 바꾸기·?edit=1 지우기)는 세지 않는다', () => {
      _resetInAppHistoryForTest();
      w.location.pathname = '/en/app-view/watchlist'; w.history.length = 2;
      noteInAppPath('/app-view/watchlist');
      w.location.pathname = '/ko/app-view/watchlist';
      noteInAppPath('/app-view/watchlist');
      assert.equal(hasInAppBack(), false);
    });
    delete (globalThis as any).window;
  }

  console.log(`\n${n}/${n} 통과`);
}

actions().catch((e) => { console.error(e); process.exit(1); });
