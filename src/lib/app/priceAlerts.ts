// ============================================================================
// PRO «가격 레벨 알림» — 기기 저장 모양과 순수 도우미(네트워크·Capacitor 없음 · 시험: tests/priceAlerts.client.test.ts)
// ----------------------------------------------------------------------------
// 사용자가 종목마다 정한 가격(최대 5개)을 «넘으면(up)/내려가면(down)» 한 번 알린다.
//   · 원본은 기기(localStorage 'sg-price-alerts-v2'). 서버(POST /api/app/watchlist/alerts v:2)는 PRO 기기의 사본만 갖고,
//     매번 «전체 목록»으로 바꾼다. 레벨 하나는 (id, rev)마다 한 번만 울린다 — 다시 켜면 rev 를 올려 다시 무장한다.
//   · 서버가 «울렸다»(fired)고 돌려주면 같은 rev 의 레벨을 끄고 울린 시각·가격을 남긴다.
//   · 무료 «내 종목 이상 신호»(설정 › 알림)와는 별개다 — 이 파일은 그 경로를 건드리지 않는다.
// ============================================================================

export type PriceDir = 'up' | 'down';

export interface PriceLevel {
  id: string;
  dir: PriceDir;
  px: number;
  on: boolean;
  rev: number;
  /** 서버가 이 레벨(같은 rev)을 울린 시각(ms) · 그때 가격 */
  firedAt?: number;
  firedPx?: number;
}

export interface PriceAlertPrefs {
  v: 2;
  tickers: Record<string, PriceLevel[]>;
  pendingSync: boolean;
  lastSyncAt: number;
  syncedToken: string | null;
}

export interface FiredLevel { id: string; rev: number; at: number; px: number }
export interface PayloadLevel { t: string; id: string; dir: PriceDir; px: number; on: boolean; rev: number }

export const PRICE_ALERTS_KEY = 'sg-price-alerts-v2';
export const PRICE_ALERTS_EVENT = 'sg:watchlist-alerts';
export const LEVELS_PER_TICKER = 5;
export const PRICE_ALERT_TICKER_CAP = 100;
export const PRICE_MAX = 1_000_000;

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const ID_RE = /^[a-z0-9]{4,16}$/;

export const emptyPriceAlerts = (): PriceAlertPrefs => ({ v: 2, tickers: {}, pendingSync: false, lastSyncAt: 0, syncedToken: null });

/** 가격 반올림 — 1달러 이상은 센트(2자리), 미만은 4자리 */
export function roundPx(n: number): number {
  const d = Math.abs(n) >= 1 ? 100 : 10_000;
  return Math.round(n * d) / d;
}

/** 입력 글자 → 목표 가격(아니면 null). «$1,234.5» «1234,5»(쉼표 소수점은 받지 않는다 — 천 단위 쉼표로 본다) */
export function parseTarget(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) && input > 0 && input < PRICE_MAX ? roundPx(input) : null;
  if (typeof input !== 'string') return null;
  const s = input.trim().replace(/^\$/, '').replace(/,/g, '');
  if (!/^\d{0,7}(\.\d{0,6})?$/.test(s) || s === '' || s === '.') return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 && n < PRICE_MAX ? roundPx(n) : null;
}

/** 방향 자동 — 지금 가격보다 위면 «넘으면», 아래면 «내려가면». 지금 가격을 모르면 «넘으면» */
export function autoDir(target: number, current: number | null | undefined): PriceDir {
  if (!(typeof current === 'number' && current > 0)) return 'up';
  return target >= current ? 'up' : 'down';
}

function sanitizeLevel(x: any): PriceLevel | null {
  if (!x || typeof x !== 'object') return null;
  const id = typeof x.id === 'string' && ID_RE.test(x.id) ? x.id : null;
  const px = parseTarget(Number(x.px));
  const dir: PriceDir | null = x.dir === 'up' || x.dir === 'down' ? x.dir : null;
  const rev = Number.isInteger(x.rev) && x.rev >= 1 ? x.rev : 1;
  if (!id || px == null || !dir) return null;
  const out: PriceLevel = { id, dir, px, on: x.on !== false, rev };
  if (Number.isFinite(x.firedAt) && x.firedAt > 0) out.firedAt = x.firedAt;
  if (Number.isFinite(x.firedPx) && x.firedPx > 0) out.firedPx = x.firedPx;
  return out;
}

/** 저장 글자 → 모양(깨졌으면 빈 값). 종목당 5개 · 100종목 · 중복 id 제거 */
export function parsePriceAlerts(raw: string | null | undefined): PriceAlertPrefs {
  if (!raw) return emptyPriceAlerts();
  try {
    const d = JSON.parse(raw);
    const tickers: Record<string, PriceLevel[]> = {};
    let n = 0;
    if (d && typeof d.tickers === 'object' && !Array.isArray(d.tickers)) {
      for (const [t, arr] of Object.entries(d.tickers as Record<string, unknown>)) {
        if (!TICKER_RE.test(t) || !Array.isArray(arr)) continue;
        const seen = new Set<string>();
        const lv = arr.map(sanitizeLevel).filter((l): l is PriceLevel => !!l && !seen.has(l.id) && !!seen.add(l.id)).slice(0, LEVELS_PER_TICKER);
        if (!lv.length) continue;
        if (n >= PRICE_ALERT_TICKER_CAP) break;
        tickers[t] = lv;
        n++;
      }
    }
    const last = Number(d?.lastSyncAt);
    return {
      v: 2,
      tickers,
      pendingSync: !!d?.pendingSync,
      lastSyncAt: Number.isFinite(last) ? last : 0,
      syncedToken: typeof d?.syncedToken === 'string' ? d.syncedToken : null,
    };
  } catch {
    return emptyPriceAlerts();
  }
}

/** 새 레벨 id(8자 · 소문자+숫자) */
export function newLevelId(rand: () => number = Math.random): string {
  let s = '';
  while (s.length < 8) s += Math.floor(rand() * 36).toString(36);
  return s.slice(0, 8);
}

export type AddError = 'bad' | 'per_ticker' | 'tickers' | 'dup';

/** 레벨 더하기 — 같은 방향·같은 가격이 이미 있으면 'dup'(꺼져 있었으면 다시 켠다) */
export function addLevel(p: PriceAlertPrefs, ticker: string, px: number, dir: PriceDir, id: string = newLevelId()): { prefs: PriceAlertPrefs; error?: AddError } {
  const target = parseTarget(px);
  if (!TICKER_RE.test(ticker) || target == null || (dir !== 'up' && dir !== 'down')) return { prefs: p, error: 'bad' };
  const cur = p.tickers[ticker] || [];
  const same = cur.find((l) => l.dir === dir && l.px === target);
  if (same) {
    if (same.on) return { prefs: p, error: 'dup' };
    return { prefs: toggleLevel(p, ticker, same.id) };
  }
  if (cur.length >= LEVELS_PER_TICKER) return { prefs: p, error: 'per_ticker' };
  if (!cur.length && Object.keys(p.tickers).length >= PRICE_ALERT_TICKER_CAP) return { prefs: p, error: 'tickers' };
  return { prefs: { ...p, tickers: { ...p.tickers, [ticker]: [...cur, { id, dir, px: target, on: true, rev: 1 }] }, pendingSync: true } };
}

/** 켜기/끄기 — 다시 켤 때는 rev 를 올리고 울린 기록을 지운다(다시 무장 · 서버는 새 기준점부터 본다) */
export function toggleLevel(p: PriceAlertPrefs, ticker: string, id: string): PriceAlertPrefs {
  const cur = p.tickers[ticker];
  if (!cur) return p;
  const next = cur.map((l) => {
    if (l.id !== id) return l;
    if (l.on) return { ...l, on: false };
    const rest: PriceLevel = { ...l, on: true, rev: l.rev + 1 };
    delete rest.firedAt;
    delete rest.firedPx;
    return rest;
  });
  return { ...p, tickers: { ...p.tickers, [ticker]: next }, pendingSync: true };
}

export function removeLevel(p: PriceAlertPrefs, ticker: string, id: string): PriceAlertPrefs {
  const cur = p.tickers[ticker];
  if (!cur) return p;
  const next = cur.filter((l) => l.id !== id);
  const tickers = { ...p.tickers };
  if (next.length) tickers[ticker] = next; else delete tickers[ticker];
  return { ...p, tickers, pendingSync: true };
}

/** 내 종목에서 뺀 종목의 레벨을 걷는다 */
export function dropTicker(p: PriceAlertPrefs, ticker: string): PriceAlertPrefs {
  if (!p.tickers[ticker]) return p;
  const tickers = { ...p.tickers };
  delete tickers[ticker];
  return { ...p, tickers, pendingSync: true };
}

/** 서버로 보낼 목록(계약 v:2 levels) — 꺼진 레벨도 보낸다(서버가 같은 rev 의 울림 기록을 지키게) */
export function payloadLevels(p: PriceAlertPrefs): PayloadLevel[] {
  const out: PayloadLevel[] = [];
  for (const [t, arr] of Object.entries(p.tickers)) {
    for (const l of arr.slice(0, LEVELS_PER_TICKER)) out.push({ t, id: l.id, dir: l.dir, px: l.px, on: l.on, rev: l.rev });
  }
  return out;
}

/** 서버의 «울렸다» → 같은 id·같은 rev 레벨만 끄고 시각·가격을 남긴다(그 사이 사용자가 다시 켰으면 rev 가 달라 그대로 둔다) */
export function mergeFired(p: PriceAlertPrefs, fired: unknown): PriceAlertPrefs {
  if (!Array.isArray(fired) || !fired.length) return p;
  const byId = new Map<string, FiredLevel>();
  for (const f of fired) {
    if (f && typeof f.id === 'string' && Number.isInteger(f.rev) && Number.isFinite(f.at)) byId.set(f.id, { id: f.id, rev: f.rev, at: f.at, px: Number(f.px) || 0 });
  }
  if (!byId.size) return p;
  let changed = false;
  const tickers: Record<string, PriceLevel[]> = {};
  for (const [t, arr] of Object.entries(p.tickers)) {
    tickers[t] = arr.map((l) => {
      const f = byId.get(l.id);
      if (!f || f.rev !== l.rev || (l.firedAt === f.at && !l.on)) return l;
      changed = true;
      return { ...l, on: false, firedAt: f.at, ...(f.px > 0 ? { firedPx: f.px } : {}) };
    });
  }
  return changed ? { ...p, tickers } : p;
}

/** 켜진 레벨이 하나라도 있는 종목 */
export function tickersWithAlertsOn(p: PriceAlertPrefs): Set<string> {
  return new Set(Object.entries(p.tickers).filter(([, arr]) => arr.some((l) => l.on)).map(([t]) => t));
}

/** 같은 목록인가(보낸 뒤 바뀌었는지 — 바뀌었으면 «못 보낸 변경»으로 남긴다) */
export function samePayload(a: PayloadLevel[], b: PayloadLevel[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
