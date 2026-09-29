// ============================================================================
// «내 종목» — 앱 전용 기기 저장소 (1단계: 웹뷰 localStorage)
// ----------------------------------------------------------------------------
// 왜 기기인가(대표 원칙 · 기획서 1-2): 앱엔 로그인이 없고(RevenueCat 익명),
//   웹 관심종목(watchlistStore.ts · Supabase)은 로그인 없으면 빈 목록이다.
//   폰에 두면 즉시·서버비 0 이다. 서버에는 «알림 켠 PRO 기기»의 사본만 간다(2단계).
//
// 모양: localStorage['sg-watchlist-v1'] = { v:1, items:[{ t, addedAt, src }] }
//   · 순서 = 배열 순서(편집 모드에서 끌어서 바꾼다)
//   · 한도는 여기서 «판정»만 한다 — 무료 FREE_LIMIT, PRO 는 기기 상한 MAX_ITEMS(판정값은 Infinity, 저장소가 MAX_ITEMS 에서 막는다).
//
// 조용히 틀리지 않게:
//   · 깨진 JSON·이상한 모양 → 빈 목록으로 읽고, 다음 쓰기에서 바로잡는다(던지지 않는다)
//   · 저장소가 막힌 환경(사생활 모드·차단) → 메모리에서 계속 동작한다
//   · 다른 탭/창의 변경('storage' 이벤트)과 같은 탭의 다른 사본(커스텀 이벤트)도 따라온다
//
// 이 파일은 node 시험에서도 불린다(tests/appWatchlist.test.ts) — 모듈 최상단에서
// window 를 만지지 않는다.
// ============================================================================

import { useMemo, useSyncExternalStore } from 'react';
import { useWatchlistPro } from '@/lib/app/proEntitlement';

/** ★ 무료 한도 — 대표 결정(9/29) 5. 바꿀 때는 이 숫자 하나만 고친다. */
export const FREE_LIMIT = 5;
/**
 * ★ PRO 상한 — 대표 결정(9/29 «프로는 100개 · 무료 5개 유료 100개면 충분»). PRO 도 상한이 있다:
 * 문구(«내 종목 100개»·«PRO로 100종목까지»·상한 토스트)는 전부 이 상수를 읽는다 — 바꿀 때는 이 숫자 하나만.
 * 배치 API 는 30개씩 나눠 부른다(useWatchlistData BATCH_MAX).
 */
export const MAX_ITEMS = 100;

export const WATCHLIST_STORAGE_KEY = 'sg-watchlist-v1';
/** 같은 탭 안의 «다른 사본»에 알리는 이벤트 이름(모듈이 두 벌 로드된 경우 대비). */
export const WATCHLIST_CHANGE_EVENT = 'sg:watchlist';

/** 설정 «캐시 지우기»가 남겨야 하는 키 — settings/page.tsx 의 keysToKeep 이 이걸 펼친다. */
export const WATCHLIST_PERSIST_KEYS = [
  WATCHLIST_STORAGE_KEY,
  'sg-watchlist-alerts-v1',   // 종목별 알림 설정(플래그 켜졌을 때만 쓰인다)
  'sg-watchlist-tip-v1',      // «처음 한 번» 안내를 봤는가
  'sg-watchlist-sort-v1',     // 목록 정렬 칩(뷰어 편의)
] as const;

export type WatchlistSource =
  | 'cmd' | 'flow' | 'search' | 'longpress' | 'chip' | 'dash' | 'list' | 'empty' | 'restore';

export interface WatchlistItem {
  /** 티커(대문자) */
  t: string;
  /** 담은 시각(ms) */
  addedAt: number;
  /** 어디서 담았나 — 측정용 */
  src: string;
}

export interface WatchlistDoc {
  v: 1;
  items: WatchlistItem[];
}

export type AddResult =
  | { ok: true; added: boolean; count: number }
  | { ok: false; reason: 'limit' | 'invalid'; count: number; limit: number };

/** remove() 가 돌려주는 되돌리기 표 — restore() 에 그대로 넘긴다. */
export interface UndoToken {
  t: string;
  index: number;
  item: WatchlistItem;
  removedAt: number;
  /** 빼기 «직전» 개수 — 무료 한도보다 많이 가진 목록(PRO 해지·코드 만료)도 방금 뺀 것은 되돌릴 수 있게 */
  prevCount: number;
}

/**
 * 담기·되돌리기 결과 → 화면 반응 하나.
 *   added   : 새로 담았다(토스트·진동)
 *   already : 이미 있었다 — PRO 확인을 기다리는 사이 연타가 먼저 담은 경우 포함. 토스트·진동을 내지 않는다
 *   limit   : 무료 한도 — 한도 시트(PRO · 정리하기)
 *   max     : 기기 상한(MAX_ITEMS) — PRO 로도 넘지 못한다. 한도 시트(구매 권유)는 답이 아니다
 *             (PRO 가 200 에서 한도 시트 → «PRO 가 됐다» → 다시 담기 → 한도 시트 … 가 끝없이 돌았다)
 *   invalid : 티커가 아니다
 */
export type AddOutcome = 'added' | 'already' | 'limit' | 'max' | 'invalid';

export function addOutcome(r: AddResult): AddOutcome {
  if (r.ok) return r.added ? 'added' : 'already';
  if (r.reason === 'invalid') return 'invalid';
  return r.count >= MAX_ITEMS || r.limit >= MAX_ITEMS ? 'max' : 'limit';
}

/** 저장소 최소 인터페이스(localStorage 와 같다) — 시험에서 가짜를 꽂는다. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// ── 순수 함수 ────────────────────────────────────────────────────────────

/** 티커 정규화 — 미국 상장 티커 모양(BRK.B·BF-B 포함)만 통과. 아니면 null. */
export function normalizeTicker(raw: unknown): string | null {
  const t = String(raw ?? '').trim().toUpperCase();
  return /^[A-Z][A-Z0-9.\-]{0,9}$/.test(t) ? t : null;
}

/**
 * 저장된 문자열 → 항목 배열. 무엇이 와도 던지지 않는다.
 * 깨진 JSON·다른 버전·이상한 항목은 버리고, 중복은 앞의 것만 남긴다.
 */
export function parseWatchlist(raw: string | null | undefined): WatchlistItem[] {
  if (!raw) return [];
  let doc: unknown;
  try { doc = JSON.parse(raw); } catch { return []; }
  if (!doc || typeof doc !== 'object') return [];
  const d = doc as { v?: unknown; items?: unknown };
  if (d.v !== 1 || !Array.isArray(d.items)) return [];
  const seen = new Set<string>();
  const out: WatchlistItem[] = [];
  for (const it of d.items) {
    if (!it || typeof it !== 'object') continue;
    const o = it as { t?: unknown; addedAt?: unknown; src?: unknown };
    const t = normalizeTicker(o.t);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    const addedAt = typeof o.addedAt === 'number' && Number.isFinite(o.addedAt) ? o.addedAt : 0;
    const src = typeof o.src === 'string' ? o.src.slice(0, 24) : '';
    out.push({ t, addedAt, src });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

export function serializeWatchlist(items: readonly WatchlistItem[]): string {
  const doc: WatchlistDoc = { v: 1, items: items.map((i) => ({ t: i.t, addedAt: i.addedAt, src: i.src })) };
  return JSON.stringify(doc);
}

// ── 저장소 ──────────────────────────────────────────────────────────────

export interface WatchlistStore {
  /** 불변 스냅샷 — 바뀔 때만 새 배열(useSyncExternalStore 용) */
  getSnapshot(): readonly WatchlistItem[];
  subscribe(listener: () => void): () => void;
  has(t: string): boolean;
  count(): number;
  tickers(): string[];
  add(t: string, src: string, limit: number): AddResult;
  remove(t: string): UndoToken | null;
  restore(token: UndoToken, limit: number): AddResult;
  /** from 번째를 to 자리로 옮긴다(편집 모드 끌기) */
  move(from: number, to: number): boolean;
  /** 저장소를 다시 읽는다(다른 탭·다른 사본의 변경) — 바뀌었으면 알린다 */
  reload(): boolean;
  /** 저장소 쓰기가 막혀 메모리로만 동작 중인가 */
  isMemoryOnly(): boolean;
}

export function createWatchlistStore(opts: {
  storage?: () => StorageLike | null;
  now?: () => number;
  key?: string;
  /** 쓰기 뒤 호출 — 브라우저 싱글톤이 커스텀 이벤트를 쏘는 데 쓴다 */
  onPersist?: () => void;
} = {}): WatchlistStore {
  const key = opts.key ?? WATCHLIST_STORAGE_KEY;
  const now = opts.now ?? (() => Date.now());
  const storageOf = (): StorageLike | null => {
    try { return opts.storage ? opts.storage() : null; } catch { return null; }
  };

  let memoryOnly = false;
  let lastRaw: string | null = null;
  let items: readonly WatchlistItem[] = Object.freeze([]);
  const listeners = new Set<() => void>();

  const read = (): string | null => {
    const s = storageOf();
    if (!s) { memoryOnly = true; return null; }
    try { return s.getItem(key); } catch { memoryOnly = true; return null; }
  };

  // 첫 읽기
  lastRaw = read();
  items = Object.freeze(parseWatchlist(lastRaw));

  const emit = () => { listeners.forEach((l) => { try { l(); } catch { /* 한 구독자의 실패가 나머지를 막지 않게 */ } }); };

  const commit = (next: WatchlistItem[]) => {
    items = Object.freeze(next.slice(0, MAX_ITEMS));
    const raw = serializeWatchlist(items);
    const s = storageOf();
    if (s) {
      try { s.setItem(key, raw); lastRaw = raw; memoryOnly = false; }
      catch { memoryOnly = true; }     // 사생활 모드·용량 초과 — 메모리로 계속 간다
    } else {
      memoryOnly = true;
    }
    emit();
    try { opts.onPersist?.(); } catch { /* noop */ }
  };

  const indexOf = (t: string) => items.findIndex((i) => i.t === t);

  return {
    getSnapshot: () => items,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    has(t) {
      const n = normalizeTicker(t);
      return !!n && indexOf(n) >= 0;
    },
    count: () => items.length,
    tickers: () => items.map((i) => i.t),
    add(t, src, limit) {
      const n = normalizeTicker(t);
      if (!n) return { ok: false, reason: 'invalid', count: items.length, limit };
      if (indexOf(n) >= 0) return { ok: true, added: false, count: items.length };
      const cap = Math.min(limit, MAX_ITEMS);
      if (items.length >= cap) return { ok: false, reason: 'limit', count: items.length, limit };
      commit([...items, { t: n, addedAt: now(), src: String(src || '').slice(0, 24) }]);
      return { ok: true, added: true, count: items.length };
    },
    remove(t) {
      const n = normalizeTicker(t);
      if (!n) return null;
      const idx = indexOf(n);
      if (idx < 0) return null;
      const item = items[idx];
      const prevCount = items.length;
      const next = items.slice();
      next.splice(idx, 1);
      commit(next);
      return { t: n, index: idx, item, removedAt: now(), prevCount };
    },
    restore(token, limit) {
      const n = normalizeTicker(token?.t);
      if (!n) return { ok: false, reason: 'invalid', count: items.length, limit };
      if (indexOf(n) >= 0) return { ok: true, added: false, count: items.length };
      // 되돌리기도 한도를 지킨다 — 빼고 다른 걸 담은 뒤 되돌리면 한도를 넘을 수 있다.
      // 단 «빼기 직전 개수»까지는 되돌린다: 무료 한도보다 많이 가진 목록(PRO 해지·코드 만료)에서
      // 방금 뺀 것을 되돌리려는데 구매 시트가 뜨면 안 된다(빼기 전 상태로 돌아갈 뿐 한도를 늘리지 않는다).
      const prev = typeof token?.prevCount === 'number' && Number.isFinite(token.prevCount) ? token.prevCount : 0;
      const cap = Math.min(Math.max(limit, prev), MAX_ITEMS);
      if (items.length >= cap) return { ok: false, reason: 'limit', count: items.length, limit };
      const next = items.slice();
      const at = Math.max(0, Math.min(token.index, next.length));
      next.splice(at, 0, { t: n, addedAt: token.item?.addedAt ?? now(), src: token.item?.src ?? 'restore' });
      commit(next);
      return { ok: true, added: true, count: items.length };
    },
    move(from, to) {
      if (!Number.isInteger(from) || !Number.isInteger(to)) return false;
      if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return false;
      const next = items.slice();
      const [it] = next.splice(from, 1);
      next.splice(to, 0, it);
      commit(next);
      return true;
    },
    reload() {
      const raw = read();
      if (raw === lastRaw) return false;
      lastRaw = raw;
      const parsed = parseWatchlist(raw);
      const same = parsed.length === items.length && parsed.every((p, i) => p.t === items[i].t);
      if (same) return false;
      items = Object.freeze(parsed);
      emit();
      return true;
    },
    isMemoryOnly: () => memoryOnly,
  };
}

// ── 브라우저 싱글톤 ─────────────────────────────────────────────────────

let singleton: WatchlistStore | null = null;
const INSTANCE_ID = Math.random().toString(36).slice(2);

/** 시험 전용 — 별 동작(starActions)을 node 에서 가짜 저장소로 돌린다. null 이면 다음 호출에서 새로 만든다. */
export function _setWatchlistStoreForTest(store: WatchlistStore | null) {
  singleton = store;
}

/** 앱 전체가 공유하는 저장소 하나. 서버 렌더에서는 메모리 전용 빈 저장소. */
export function getWatchlistStore(): WatchlistStore {
  if (singleton) return singleton;
  const isBrowser = typeof window !== 'undefined';
  singleton = createWatchlistStore({
    storage: () => (isBrowser ? window.localStorage : null),
    onPersist: () => {
      if (!isBrowser) return;
      try {
        window.dispatchEvent(new CustomEvent(WATCHLIST_CHANGE_EVENT, { detail: { from: INSTANCE_ID } }));
      } catch { /* 오래된 웹뷰 — 같은 사본 안에서는 구독자가 이미 알림을 받았다 */ }
    },
  });
  if (isBrowser) {
    const store = singleton;
    // 다른 탭/창: storage 이벤트는 «다른» 문서에서만 온다
    window.addEventListener('storage', (e) => {
      if (e.key === null || e.key === WATCHLIST_STORAGE_KEY) store.reload();
    });
    // 같은 탭의 다른 사본(모듈 중복 로드): 자기가 쏜 건 무시한다
    window.addEventListener(WATCHLIST_CHANGE_EVENT, (e) => {
      const from = (e as CustomEvent<{ from?: string }>).detail?.from;
      if (from !== INSTANCE_ID) store.reload();
    });
    // 앱이 앞으로 돌아왔을 때(다른 화면·위젯이 바꿨을 수 있다)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') store.reload();
    });
  }
  return singleton;
}

const EMPTY: readonly WatchlistItem[] = Object.freeze([]);
const getServerSnapshot = () => EMPTY;

export interface AppWatchlist {
  items: readonly WatchlistItem[];
  tickers: string[];
  count: number;
  /** 무료 FREE_LIMIT · PRO Infinity(저장소가 MAX_ITEMS 에서 막는다 — 담기 결과 'max') */
  limit: number;
  isPro: boolean;
  /** PRO 여부를 아직 확인 중인가(한도 판정 전에 기다릴지 결정) */
  proReady: boolean;
  has(t: string): boolean;
  add(t: string, src: WatchlistSource | string): AddResult;
  remove(t: string): UndoToken | null;
  restore(token: UndoToken): AddResult;
  move(from: number, to: number): boolean;
}

/**
 * 컴포넌트용 훅. 커맨드·플로우·목록·검색·대시보드가 «같은 저장소»를 읽는다 —
 * 한 곳에서 담으면 모든 곳에 ★ 가 선다.
 */
export function useAppWatchlist(): AppWatchlist {
  const store = getWatchlistStore();
  const items = useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
  const pro = useWatchlistPro();
  const limit = pro.isPro ? Infinity : FREE_LIMIT;
  return useMemo(() => {
    const set = new Set(items.map((i) => i.t));
    return {
      items,
      tickers: items.map((i) => i.t),
      count: items.length,
      limit,
      isPro: pro.isPro,
      proReady: pro.ready,
      has: (t: string) => { const n = normalizeTicker(t); return !!n && set.has(n); },
      add: (t: string, src: string) => store.add(t, src, limit),
      remove: (t: string) => store.remove(t),
      restore: (token: UndoToken) => store.restore(token, limit),
      move: (from: number, to: number) => store.move(from, to),
    };
  }, [items, limit, pro.isPro, pro.ready, store]);
}
