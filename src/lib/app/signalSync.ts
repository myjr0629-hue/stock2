// ============================================================================
// «내 종목 이상 신호» — 기기 → 서버 내 종목 사본 동기화 (클라이언트, 2026-10-13)
// ----------------------------------------------------------------------------
// 목록의 원본은 폰(localStorage 'sg-watchlist-v1')이다. 서버에는 «푸시 토큰 레코드에 붙은 종목 이름 목록(최대 100) + 시간대»만 간다 —
// 로그인·계정·기기 식별자(푸시 토큰 말고)·가격·메모 없음. 기존 등록 경로(/api/push/register)를 그대로 쓴다.
//   · 앱을 켤 때마다 가는 등록 POST 에 얹는다(AppFirstRunOnboarding) → 기존 기기는 다음에 앱을 열 때 올라온다.
//   · 앱을 쓰는 중에 목록이 바뀌면(layout 의 useSignalWatchlistSync) 5초 뒤 한 번 다시 보낸다 — 같은 내용·같은 토큰·같은 날이면 보내지 않는다.
//   · 시스템 알림 권한이 없으면 권한을 «묻지 않는다». 권한이 꺼져 있다고만 알린다(notifPerm:false) — 서버는 그 기기에 신호를 보내지 않는다.
// 네이티브(iOS·안드로이드 앱)에서만 동작한다. 웹·프리뷰는 아무 일도 하지 않는다.
// ============================================================================
import { WATCHLIST_STORAGE_KEY, parseWatchlist } from '@/lib/app/watchlist';
import { etDay } from '@/lib/app/funnelSchema';
import { resolveAppLocale } from '@/lib/appLocale';

export const SIGNAL_SYNC_KEY = 'signumhq.sig.sync';
export const PUSH_TOKEN_KEY = 'signumhq.push.token';

/** 이 기기의 내 종목 이름들(저장된 순서, 최대 100) */
export function readWatchlistTickers(): string[] {
  try {
    return parseWatchlist(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).map((i) => i.t);
  } catch { return []; }
}

export function deviceTimeZone(): string | undefined {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined; } catch { return undefined; }
}

/** 등록 POST 본문에 얹는 것 — 종목 사본과 시간대(조용한 시간용) */
export function signalSyncExtras(): { tickers: string[]; tz?: string } {
  const tz = deviceTimeZone();
  return { tickers: readWatchlistTickers(), ...(tz ? { tz } : {}) };
}

/** 같은 내용인지 보는 짧은 지문(보안용 아님) */
export function tickersFingerprint(tickers: readonly string[]): string {
  let h = 5381;
  const s = tickers.join(',');
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${tickers.length}:${(h >>> 0).toString(36)}`;
}

interface LastSync { h: string; d: string; tok: string }

function readLast(): LastSync | null {
  try {
    const o = JSON.parse(window.localStorage.getItem(SIGNAL_SYNC_KEY) || 'null');
    return o && typeof o.h === 'string' && typeof o.d === 'string' && typeof o.tok === 'string' ? o : null;
  } catch { return null; }
}

/** 등록 POST 가 목록을 함께 올렸을 때 기록 — 곧이어 목록 변경 훅이 같은 내용을 또 보내지 않게 */
export function markSignalSynced(tickers: readonly string[], token: string): void {
  try { window.localStorage.setItem(SIGNAL_SYNC_KEY, JSON.stringify({ h: tickersFingerprint(tickers), d: etDay(), tok: token })); } catch { /* 저장소 없음 */ }
}

/** 지금 보낼 필요가 있는가(순수 — 시험용) */
export function needsSync(last: LastSync | null, h: string, tok: string, day: string): boolean {
  return !last || last.h !== h || last.tok !== tok || last.d !== day;
}

/**
 * 앱을 쓰는 중에 목록이 바뀌었을 때의 한 번 보내기. 실패·권한 없음은 조용히 넘어간다(다음 앱 실행의 등록 POST 가 다시 올린다).
 * 반환: 'sent' | 'skip' (보낼 필요 없음/보낼 수 없음)
 */
export async function syncSignalWatchlist(): Promise<'sent' | 'skip'> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return 'skip';
    const token = window.localStorage.getItem(PUSH_TOKEN_KEY);
    if (!token) return 'skip';
    // @ts-ignore — @capacitor/push-notifications is installed at native build time
    const PushMod: any = await import('@capacitor/push-notifications');
    const perm = await PushMod.PushNotifications.checkPermissions();
    if (perm?.receive !== 'granted') return 'skip';     // 권한이 없으면 묻지 않는다
    const { tickers, tz } = signalSyncExtras();
    const h = tickersFingerprint(tickers);
    const day = etDay();
    if (!needsSync(readLast(), h, token, day)) return 'skip';
    const res = await fetch('/api/push/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform: Capacitor.getPlatform(), locale: resolveAppLocale(), tickers, ...(tz ? { tz } : {}), notifPerm: true }),
    });
    if (!res.ok) return 'skip';
    try { window.localStorage.setItem(SIGNAL_SYNC_KEY, JSON.stringify({ h, d: day, tok: token })); } catch { /* 저장소 없음 — 다음에 다시 */ }
    return 'sent';
  } catch { return 'skip'; }
}
