// ============================================================================
// «내 종목» 알림 설정(PRO) — 기기 저장 + 서버 사본 동기화
// ----------------------------------------------------------------------------
// ⚠ 이 파일의 모든 동작은 NEXT_PUBLIC_WATCHLIST_ALERTS === '1' 일 때만 불린다(기본 꺼짐).
//   서버 엔드포인트는 feat/watchlist-alerts 브랜치 — 계약은 그쪽과 같다(9/29 확인).
//
// 계약 POST /api/app/watchlist/alerts (JSON)
//   { rcAppUserId, platform:'ios'|'android', deviceToken, locale:'ko'|'en'|'ja',
//     tickers:[{ t, events:string[] }] (최대 50), quiet:{ start:'HH:MM', end:'HH:MM', tz } | null,
//     dailyCap: 1–50 }
//   → 200 {ok:true} | 402 {error:'not_pro'} | 400 | 429 rate_limited
//     | 503 store_unavailable·verify_unavailable·verify_unconfigured | 500 store_error
// DELETE 같은 경로 { rcAppUserId, deviceToken } → 200
// 서버 사본 수명 30일 · 같은 내용은 3일간 쓰기를 건너뛴다 → 앱을 열 때 하루 한 번 다시 보내도 싸다.
// 푸시 토큰이 바뀌면 옛 토큰 사본을 먼저 지우고(DELETE) 새 토큰으로 보낸다.
// 원칙(기획서 1-2): 목록 원본은 폰이다. 서버엔 «알림을 켠 PRO 기기»의 토큰+종목 사본만 간다.
// ============================================================================

export const ALERT_EVENTS = [
  'call_wall_break',
  'put_floor_break',
  'gamma_flip_cross',
  'maxpain_divergence',
  'darkpool_spike',
  'whale_new',
  'earnings_d1',
] as const;
export type AlertEventId = (typeof ALERT_EVENTS)[number];

export interface AlertPrefs {
  v: 1;
  /** 종목별 켠 이벤트 */
  tickers: Record<string, AlertEventId[]>;
  quiet: { on: boolean; start: string; end: string };
  dailyCap: number;
  /** 서버에 아직 못 보낸 변경이 있는가 */
  pendingSync: boolean;
  /** 마지막으로 서버와 맞춘 시각(ms) — 하루 한 번 다시 보낸다 */
  lastSyncAt: number;
  /** 서버 사본이 걸려 있는 푸시 토큰 — 토큰이 바뀌면 옛 사본을 지운다 */
  syncedToken: string | null;
}

export const ALERT_PREFS_KEY = 'sg-watchlist-alerts-v1';
export const DEFAULT_EVENTS: AlertEventId[] = [
  'call_wall_break', 'put_floor_break', 'gamma_flip_cross', 'maxpain_divergence', 'whale_new', 'earnings_d1',
];
export const DAILY_CAP_MIN = 1;
export const DAILY_CAP_MAX = 20;          // 서버는 1–50 을 받는다. 화면은 20 까지만 연다.
/** 알림을 켤 수 있는 종목 수 — 서버가 50 을 넘으면 400 을 준다 */
export const ALERT_TICKER_CAP = 50;
const RESYNC_MS = 24 * 3600_000;

const fresh = (): AlertPrefs => ({
  v: 1,
  tickers: {},
  quiet: { on: true, start: '01:00', end: '07:00' },
  dailyCap: 6,
  pendingSync: false,
  lastSyncAt: 0,
  syncedToken: null,
});

const isEvent = (x: unknown): x is AlertEventId => typeof x === 'string' && (ALERT_EVENTS as readonly string[]).includes(x);
const hhmm = (x: unknown, dflt: string) => (typeof x === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(x) ? x : dflt);

export function readAlertPrefs(): AlertPrefs {
  try {
    const raw = localStorage.getItem(ALERT_PREFS_KEY);
    if (!raw) return fresh();
    const d = JSON.parse(raw);
    const tickers: Record<string, AlertEventId[]> = {};
    if (d && typeof d.tickers === 'object') {
      for (const [t, evs] of Object.entries(d.tickers as Record<string, unknown>)) {
        if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(t) || !Array.isArray(evs)) continue;
        tickers[t] = Array.from(new Set(evs.filter(isEvent)));
      }
    }
    const cap = Number(d?.dailyCap);
    const last = Number(d?.lastSyncAt);
    return {
      v: 1,
      tickers,
      quiet: { on: d?.quiet?.on !== false, start: hhmm(d?.quiet?.start, '01:00'), end: hhmm(d?.quiet?.end, '07:00') },
      dailyCap: Number.isFinite(cap) ? Math.min(DAILY_CAP_MAX, Math.max(DAILY_CAP_MIN, Math.round(cap))) : 6,
      pendingSync: !!d?.pendingSync,
      lastSyncAt: Number.isFinite(last) ? last : 0,
      syncedToken: typeof d?.syncedToken === 'string' ? d.syncedToken : null,
    };
  } catch {
    return fresh();
  }
}

export function writeAlertPrefs(p: AlertPrefs) {
  try { localStorage.setItem(ALERT_PREFS_KEY, JSON.stringify(p)); } catch { /* 사생활 모드 — 이번 세션만 */ }
  try { window.dispatchEvent(new CustomEvent('sg:watchlist-alerts')); } catch { /* noop */ }
}

/** 알림을 켠(이벤트가 하나라도 있는) 종목 — 최대 ALERT_TICKER_CAP */
export function alertTickersOn(p: AlertPrefs): string[] {
  return Object.entries(p.tickers).filter(([, evs]) => evs.length > 0).map(([t]) => t).slice(0, ALERT_TICKER_CAP);
}

/** 이 종목을 «새로» 켤 수 있는가(이미 켠 종목은 언제나 바꿀 수 있다) */
export function canEnableMore(p: AlertPrefs, ticker: string): boolean {
  const on = Object.entries(p.tickers).filter(([, evs]) => evs.length > 0).map(([t]) => t);
  return on.includes(ticker) || on.length < ALERT_TICKER_CAP;
}

// ── 기기 식별(푸시 토큰 · RevenueCat 익명 ID) ───────────────────────────

function platformOf(): 'ios' | 'android' | null {
  try {
    const cap = require('@capacitor/core').Capacitor;
    if (!cap?.isNativePlatform?.()) return null;
    return cap.getPlatform() === 'ios' ? 'ios' : 'android';
  } catch {
    return null;
  }
}

function savedToken(): string | null {
  try { return localStorage.getItem('signumhq.push.token'); } catch { return null; }
}

/**
 * 푸시 토큰 — 온보딩·앱 시작 때 등록한 값(localStorage 'signumhq.push.token')을 먼저 쓴다.
 * 권한이 없으면 «지금» 묻는다(기획서: 알림 권한은 첫 🔔 를 켤 때 — 앱 시작 때 묻지 않는다).
 */
export async function ensurePushToken(ask: boolean): Promise<{ token: string | null; denied: boolean }> {
  if (!platformOf()) return { token: null, denied: false };
  try {
    const PushMod: any = await import('@capacitor/push-notifications');
    const P = PushMod.PushNotifications;
    let perm = await P.checkPermissions();
    if (perm?.receive !== 'granted') {
      if (!ask) return { token: null, denied: true };
      perm = await P.requestPermissions();
      if (perm?.receive !== 'granted') return { token: null, denied: true };
    }
    const saved = savedToken();
    if (saved) return { token: saved, denied: false };
    const token = await new Promise<string | null>((resolve) => {
      let settled = false;
      const finish = (v: string | null) => { if (!settled) { settled = true; resolve(v); } };
      P.addListener('registration', (t: { value: string }) => {
        try { localStorage.setItem('signumhq.push.token', t.value); } catch { /* noop */ }
        finish(t.value);
      });
      P.addListener('registrationError', () => finish(null));
      P.register().catch(() => finish(null));
      window.setTimeout(() => finish(null), 8000);
    });
    return { token, denied: false };
  } catch {
    return { token: null, denied: false };
  }
}

export async function rcAppUserId(): Promise<string | null> {
  try {
    const { initRevenueCat } = await import('@/services/revenueCat');
    if (!(await initRevenueCat())) return null;
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    const { appUserID } = await Purchases.getAppUserID();
    return appUserID || null;
  } catch {
    return null;
  }
}

/**
 * ok        : 서버 사본이 맞춰졌다
 * not_pro   : 402 — PRO 가 아니다(권유 시트를 연다)
 * retry     : 429·500·503 — 잠시 후 다시(변경은 기기에 남기고 다음에 다시 보낸다)
 * no_endpoint: 404 — 서버가 아직 없다(같음)
 * no_device : 웹·토큰 없음·RevenueCat 없음
 * denied    : 알림 권한 거부
 * error     : 400 등
 */
export type SyncResult = 'ok' | 'not_pro' | 'retry' | 'no_endpoint' | 'no_device' | 'denied' | 'error';

const ENDPOINT = '/api/app/watchlist/alerts';

async function del(uid: string, token: string): Promise<boolean> {
  try {
    const r = await fetch(ENDPOINT, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rcAppUserId: uid, deviceToken: token }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

function classify(status: number): SyncResult {
  if (status >= 200 && status < 300) return 'ok';
  if (status === 402) return 'not_pro';
  if (status === 429 || status === 503 || status === 500 || status === 502 || status === 504) return 'retry';
  if (status === 404 || status === 405) return 'no_endpoint';
  return 'error';
}

/**
 * 서버 사본을 맞춘다. 켠 종목이 없으면 DELETE(구독 해지).
 * 성공하면 prefs 의 lastSyncAt·syncedToken·pendingSync 를 갱신해 저장한다.
 */
export async function syncAlertPrefs(p: AlertPrefs, locale: string, opts: { askPermission: boolean }): Promise<SyncResult> {
  const platform = platformOf();
  if (!platform) return 'no_device';
  const on = alertTickersOn(p);
  let token = savedToken();
  if (on.length > 0) {
    // 권한은 opts.askPermission 일 때만 묻는다(처음 켤 때) — 저장된 토큰이 없다고 해서 다시 묻지 않는다.
    // 권한이 이미 있으면 묻지 않고 토큰만 받아 온다. 끝내 토큰이 없으면 아래에서 no_device.
    const r = await ensurePushToken(opts.askPermission);
    if (r.denied) return 'denied';
    token = r.token ?? token;
  }
  const uid = await rcAppUserId();
  if (!uid) return 'no_device';

  // 토큰이 바뀌었으면 옛 토큰의 사본부터 지운다(두 기기처럼 두 번 울리지 않게)
  if (p.syncedToken && token && p.syncedToken !== token) {
    await del(uid, p.syncedToken);
  }
  if (!token) return on.length ? 'no_device' : 'ok';

  const loc = locale === 'ko' || locale === 'ja' ? locale : 'en';
  let tz = 'UTC';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { /* noop */ }
  let result: SyncResult;
  try {
    if (on.length) {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rcAppUserId: uid,
          platform,
          deviceToken: token,
          locale: loc,
          tickers: on.map((t) => ({ t, events: p.tickers[t] })),
          quiet: p.quiet.on ? { start: p.quiet.start, end: p.quiet.end, tz } : null,
          dailyCap: Math.min(50, Math.max(1, Math.round(p.dailyCap))),
        }),
      });
      result = classify(res.status);
    } else {
      result = (await del(uid, token)) ? 'ok' : 'retry';
    }
  } catch {
    result = 'retry';
  }
  if (result === 'ok') {
    writeAlertPrefs({ ...p, pendingSync: false, lastSyncAt: Date.now(), syncedToken: on.length ? token : null });
  } else {
    writeAlertPrefs({ ...p, pendingSync: true });
  }
  return result;
}

/** 앱을 열 때(플래그 켜짐): 하루가 지났거나 · 못 보낸 변경이 있거나 · 토큰이 바뀌었으면 다시 보낸다(권한은 묻지 않는다) */
export async function maybeResyncAlerts(locale: string): Promise<SyncResult | 'skip'> {
  const p = readAlertPrefs();
  const on = alertTickersOn(p);
  const token = savedToken();
  const tokenChanged = !!(p.syncedToken && token && p.syncedToken !== token);
  if (!on.length && !p.syncedToken) return 'skip';
  if (!p.pendingSync && !tokenChanged && Date.now() - p.lastSyncAt < RESYNC_MS) return 'skip';
  return syncAlertPrefs(p, locale, { askPermission: false });
}

/** 안드로이드 알림 채널 — 보통(watchlist_alerts)·조용한 시간(watchlist_quiet, 소리·진동 없음) */
export async function ensureAndroidAlertChannels(locale: string): Promise<void> {
  if (platformOf() !== 'android') return;
  try {
    const PushMod: any = await import('@capacitor/push-notifications');
    const P = PushMod.PushNotifications;
    const ko = locale === 'ko', ja = locale === 'ja';
    await P.createChannel({
      id: 'watchlist_alerts',
      name: ko ? '내 종목 알림' : ja ? 'マイ銘柄の通知' : 'Watchlist alerts',
      description: ko ? '콜월·풋플로어·감마 플립 등 내 종목 레벨 알림' : ja ? 'コールウォール・プットフロア・ガンマフリップなどのレベル通知' : 'Call wall, put floor, gamma flip and other level alerts',
      importance: 4,
      visibility: 1,
      vibration: true,
    });
    await P.createChannel({
      id: 'watchlist_quiet',
      name: ko ? '내 종목 알림(조용한 시간)' : ja ? 'マイ銘柄の通知(おやすみ時間)' : 'Watchlist alerts (quiet hours)',
      description: ko ? '조용한 시간에는 소리·진동 없이 알림 센터에만' : ja ? 'おやすみ時間は音・振動なしで通知センターのみ' : 'No sound or vibration during quiet hours',
      importance: 2,
      visibility: 1,
      vibration: false,
    });
  } catch { /* 옛 바이너리·플러그인 없음 — 기본 채널로 온다 */ }
}
