/**
 * 공유=선물 기기 장부 — 날짜별 보낸 수·시트/준비에 잡아 둔 몫(hold)·등록 재시도 장부를 «한 덩어리»로 원자적으로 고친다.
 *
 * 왜 IndexedDB 인가: 여러 탭·문서가 같은 기기 한도를 함께 쓴다. localStorage 는 읽고-고치고-쓰기가 탭 사이에서 원자적이지 않고
 * (관문 10222309 ②: 두 탭이 빈 예약을 동시에 보고 둘 다 선물 링크를 보냄), 다른 탭의 쓰기가 늦게 보일 수도 있다.
 * IndexedDB 의 readwrite 트랜잭션은 같은 저장소 범위끼리 브라우저가 직렬로 실행하므로(탭·연결 무관) 한도 검사와 예약이 한 단위가 된다.
 * 클릭 경로(동기 payload)는 이 장부를 읽지 않는다 — 예약은 화면 진입·복귀(비동기 refresh)에서 미리 잡는다.
 * IndexedDB 를 쓸 수 없으면 null → 선물 문구 없이 일반 공유.
 */
export type SentGift = { token: string; at: number; tries: number; last: number };
export type Hold = { token: string; until: number };
export type GiftState = { days: Record<string, number>; holds: Hold[]; sent: SentGift[] };
/** fn 은 동기로 state 를 고친다(같은 트랜잭션 안). 반환값을 그대로 돌려준다. 장부를 열 수 없거나 실패하면 null. */
export type GiftAtomic = <T>(fn: (state: GiftState) => T) => Promise<{ value: T } | null>;

const okToken = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** 저장된 값의 형식만 검사해 정리한다(깨진 항목은 버린다). */
export function normalizeState(raw: unknown): GiftState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const days: Record<string, number> = {};
  if (r.days && typeof r.days === 'object' && !Array.isArray(r.days)) {
    for (const [k, v] of Object.entries(r.days as Record<string, unknown>)) if (DAY.test(k) && Number.isInteger(v) && (v as number) >= 0) days[k] = v as number;
  }
  const holds = Array.isArray(r.holds) ? r.holds.filter((h: any) => okToken(h?.token) && Number.isFinite(h?.until))
    .map((h: any) => ({ token: h.token, until: h.until })) : [];
  const sent = Array.isArray(r.sent) ? r.sent.filter((x: any) => okToken(x?.token) && Number.isSafeInteger(x?.at)
    && Number.isFinite(x?.tries) && Number.isFinite(x?.last)).map((x: any) => ({ token: x.token, at: x.at, tries: x.tries, last: x.last })) : [];
  return { days, holds, sent };
}
/** 보관 상한 — 날짜 4일·잡음 10·재시도 20. */
export function trimState(s: GiftState): GiftState {
  return {
    days: Object.fromEntries(Object.entries(s.days).sort(([a], [b]) => a < b ? -1 : 1).slice(-4)),
    holds: s.holds.slice(-10),
    sent: s.sent.slice(-20),
  };
}

const DB = 'signumhq-gift';
const STORE = 'kv';
const KEY = 'state.v1';

/** 기본 장부: IndexedDB 한 트랜잭션 안에서 읽고-고치고-쓴다. */
export const idbAtomic: GiftAtomic = <T>(fn: (state: GiftState) => T) => new Promise<{ value: T } | null>(resolve => {
  let idb: IDBFactory;
  try { idb = indexedDB; if (!idb) throw new Error(); } catch { resolve(null); return; }
  let open: IDBOpenDBRequest;
  try { open = idb.open(DB, 1); } catch { resolve(null); return; }
  open.onupgradeneeded = () => { try { open.result.createObjectStore(STORE); } catch { /* 이미 있음 */ } };
  open.onerror = () => resolve(null);
  // blocked 는 다른 연결이 닫히면 이어서 success 로 온다(연결은 매번 닫는다) — 여기서 끝내면 끝난 줄 안 트랜잭션이 뒤늦게 돌 수 있다.
  open.onsuccess = () => {
    const db = open.result;
    let out: { value: T } | null = null;
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const get = store.get(KEY);
      get.onsuccess = () => {
        try {
          const state = normalizeState(get.result);
          const value = fn(state);
          store.put(trimState(state), KEY);
          out = { value };
        } catch { try { tx.abort(); } catch { /* 이미 끝남 */ } }
      };
      tx.oncomplete = () => { db.close(); resolve(out); };
      tx.onerror = tx.onabort = () => { db.close(); resolve(null); };
    } catch { try { db.close(); } catch { /* 무시 */ } resolve(null); }
  };
});
