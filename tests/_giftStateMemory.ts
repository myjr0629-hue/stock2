/**
 * 시험용 공유=선물 기기 장부.
 * - memoryAtomic: 한 출처(여러 문서·탭이 함께 쓰는) 장부. 호출마다 한 번 양보한 뒤 직렬로 실행 — IndexedDB readwrite 트랜잭션과 같은 보장.
 * - fakeIndexedDB: idbAtomic 자체를 돌리기 위한 최소 IndexedDB(open·transaction·objectStore get/put·oncomplete·abort).
 *   같은 저장소의 readwrite 트랜잭션을 연결과 무관하게 한 줄로 세운다(명세의 직렬 실행 보장).
 */
import { normalizeState, trimState, type GiftAtomic, type GiftState } from '../src/lib/giftShare/state';

export function memoryAtomic() {
  let state: GiftState = normalizeState({});
  let queue: Promise<unknown> = Promise.resolve();
  const box = { calls: 0, fail: false, get state() { return state; } };
  const atomic: GiftAtomic = <T>(fn: (s: GiftState) => T) => {
    box.calls++;
    const run = queue.then(async () => {
      await new Promise(r => setImmediate(r));
      if (box.fail) return null;
      const s = normalizeState(JSON.parse(JSON.stringify(state)));
      try { const value = fn(s); state = trimState(s); return { value }; } catch { return null; }
    });
    queue = run.then(() => {}, () => {});
    return run;
  };
  return Object.assign(box, { atomic });
}

export function fakeIndexedDB() {
  const data = new Map<string, unknown>();
  let stores = new Set<string>();
  let txQueue: Promise<void> = Promise.resolve();
  const later = (fn: () => void) => setImmediate(fn);
  const stats = { transactions: 0, maxConcurrent: 0, running: 0 };
  const db = {
    transaction(name: string, mode: string) {
      if (!stores.has(name) || mode !== 'readwrite') throw new Error('시험 IDB: 저장소·모드');
      stats.transactions++;
      const tx: any = { oncomplete: null, onerror: null, onabort: null, aborted: false };
      const pending: Array<() => void> = [];
      let writes = new Map<string, unknown>();
      tx.abort = () => { tx.aborted = true; };
      tx.objectStore = () => ({
        get(key: string) {
          const req: any = { onsuccess: null, result: undefined };
          pending.push(() => { req.result = writes.has(key) ? writes.get(key) : structuredClone(data.get(key)); req.onsuccess?.(); });
          return req;
        },
        put(value: unknown, key: string) { writes.set(key, structuredClone(value)); return {}; },
      });
      // 트랜잭션은 앞 트랜잭션이 끝난 뒤에만 시작한다(직렬).
      txQueue = txQueue.then(() => new Promise<void>(done => later(() => {
        stats.running++; stats.maxConcurrent = Math.max(stats.maxConcurrent, stats.running);
        while (pending.length) pending.shift()!();
        stats.running--;
        if (tx.aborted) { writes = new Map(); later(() => { tx.onabort?.(); done(); }); return; }
        for (const [k, v] of writes) data.set(k, v);
        later(() => { tx.oncomplete?.(); done(); });
      })));
      return tx;
    },
    close() {},
    createObjectStore(name: string) { stores.add(name); },
  };
  const factory = {
    open() {
      const req: any = { onsuccess: null, onupgradeneeded: null, onerror: null, onblocked: null, result: db };
      later(() => { if (!stores.size) req.onupgradeneeded?.(); req.onsuccess?.(); });
      return req;
    },
  };
  return { factory, data, stats, reset() { data.clear(); stores = new Set(); } };
}
