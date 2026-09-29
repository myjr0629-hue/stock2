/**
 * «내 종목» 기기 저장소 시험 — src/lib/app/watchlist.ts
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/appWatchlist.test.ts
 *
 * 지키는 것: 한도(무료 5 · PRO 무제한) · 되돌리기 · 순서 · 깨진 저장소 · 막힌 저장소(사생활 모드) · 다른 탭의 변경
 */
import assert from 'node:assert/strict';
import {
  createWatchlistStore, parseWatchlist, serializeWatchlist, normalizeTicker,
  FREE_LIMIT, MAX_ITEMS, WATCHLIST_STORAGE_KEY, WATCHLIST_PERSIST_KEYS, type StorageLike,
} from '../src/lib/app/watchlist';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };

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

console.log(`\n${n}/${n} 통과`);
