// ============================================================================
// «내 종목» 홈 화면 위젯 브리지 — 웹뷰의 목록을 네이티브 위젯에 넘긴다
// ----------------------------------------------------------------------------
// 설계서: .agent/product/WIDGET-PLAN-2026-09-29.md
//
// 목록은 웹뷰 localStorage(sg-watchlist-v1)에만 있다 → 위젯(iOS WidgetKit · 안드로이드 AppWidget)은 직접 못 읽는다.
// 그래서 앱 안에서만:
//   ① 시작할 때 1회 + 목록·순서·언어가 바뀔 때마다 WidgetBridge.setWatchlist({ tickers, … }) (같은 값이면 안 보낸다)
//   ② 앞 WIDGET_LOGO_MAX 종목의 로고를 «앱이 그리는 그대로» PNG 로 래스터화해 setLogos 로 넘긴다(7일에 한 번).
//      /api/logo 는 종목에 따라 SVG(AMZN 큐레이션·이니셜 폴백)를 주는데 위젯은 SVG 를 못 그린다 — 웹뷰가 그린 그림을 넘기면 된다.
//   ③ 위젯을 누르면 오는 signumhq-app:// 주소를 앱 안 화면으로 바꿔 이동한다(appUrlOpen · 콜드 스타트는 getLaunchUrl).
//
// 안전하게(운영 웹에 먼저 나가도):
//   · 네이티브가 아니거나 WidgetBridge 플러그인이 없는 옛 앱 바이너리 → 아무 일도 하지 않는다(구독조차 하지 않는다).
//   · 플러그인이 «미구현»으로 거절하면 그 뒤로 부르지 않는다. 어떤 실패도 던지지 않는다.
//   · 딥링크 주소는 정규식으로 검사한다 — 티커 모양이 아니면 버린다(주소가 곧 외부 입력이다).
//
// 이 파일은 node 시험에서도 불린다(tests/widgetBridge.test.ts) — 모듈 최상단에서 window 를 만지지 않는다.
// ============================================================================

import { getWatchlistStore, normalizeTicker, type StorageLike, type WatchlistStore } from '@/lib/app/watchlist';
import { tickerName } from '@/lib/app/tickerNames';
import { EARLY_CLOSE_DATES, toWlLocale, type WlLocale } from '@/lib/app/watchlistInsights';
import { US_MARKET_HOLIDAYS } from '@/lib/marketCalendar';
import { resolveAppLocale } from '@/lib/appLocale';
import { noteWatchlistEntry, trackWatchlist } from '@/lib/app/watchlistAnalytics';

export const WIDGET_PLUGIN_NAME = 'WidgetBridge';
/** 위젯 주소 스킴 — iOS Info.plist CFBundleURLTypes · 안드로이드 위젯 인텐트와 같은 값 */
export const WIDGET_URL_SCHEME = 'signumhq-app';
/** 이름을 싣는 앞쪽 종목 수(위젯은 최대 6행 — 순서를 바꿔도 곧바로 이름이 있게 넉넉히) */
export const WIDGET_NAME_MAX = 12;
/** 로고를 넘기는 앞쪽 종목 수 */
export const WIDGET_LOGO_MAX = 12;
/** 같은 종목 로고를 다시 넘기는 간격 — 로고는 거의 안 바뀐다 */
export const WIDGET_LOGO_TTL_MS = 7 * 24 * 3_600_000;
/** 래스터화 크기(px) — 위젯 로고 22~26pt × 3배 */
export const WIDGET_LOGO_PX = 96;
const LOGO_SENT_KEY = 'sg-widget-logos-v1';
const LAUNCH_URL_KEY = 'sg-widget-launch-url';

export interface WidgetPayload {
  v: 1;
  /** 앱 목록 순서 그대로(위젯은 앞에서부터 자른다) */
  tickers: string[];
  /** 앞 WIDGET_NAME_MAX 종목의 이름(앱 언어) — 없는 종목은 싣지 않는다 */
  names: Record<string, string>;
  locale: WlLocale;
  /** 목록을 만든 시각(ms) */
  updatedAt: number;
  /** 휴장일·조기 폐장일(ET 날짜) — 위젯의 «종가 날짜» 판정용. 네이티브에 내장 표가 있고 이 값이 오면 이것을 쓴다 */
  holidays: string[];
  earlyCloses: string[];
}

export interface WidgetBridgePlugin {
  setWatchlist(payload: WidgetPayload): Promise<unknown>;
  setLogos(opts: { logos: Record<string, string> }): Promise<unknown>;
}

export interface WidgetBridgeDeps {
  /**
   * 네이티브 앱이고 WidgetBridge 플러그인이 등록돼 있으면 그 플러그인, 아니면 null — «동기»로 돌려준다.
   * ⚠️ Capacitor 의 registerPlugin 프록시는 `then` 을 포함한 «모든» 속성에 함수를 돌려주는 thenable 이다.
   *    async 함수로 돌려주거나 await 하면 Promise 가 proxy.then(…) 을 부르고(= 없는 네이티브 메서드 «then» 호출)
   *    영원히 끝나지 않는다 — 안드로이드 실기 웹뷰 시험(9/30)에서 브리지가 첫 전송도 못 하고 멈춘 원인.
   */
  plugin: () => WidgetBridgePlugin | null;
  store: () => WatchlistStore;
  locale: () => WlLocale;
  nameOf?: (t: string, loc: WlLocale) => string;
  now?: () => number;
  /** 로고 한 장 → PNG base64(접두어 없이). 없으면 로고는 넘기지 않는다(위젯이 스스로 받는다) */
  rasterizeLogo?: (t: string) => Promise<string | null>;
  /** 로고를 보낸 기록을 두는 곳(localStorage) */
  storage?: () => StorageLike | null;
  /** 다음 일을 미룬다(시험은 즉시) — 목록 변경이 같은 틱에 여러 번 와도 한 번만 보낸다 */
  defer?: (fn: () => void) => void;
}

// ── 순수 함수 ────────────────────────────────────────────────────────────

/** 지금 목록 → 위젯에 넘길 값 */
export function buildWidgetPayload(tickers: readonly string[], loc: WlLocale, nameOf: (t: string, loc: WlLocale) => string, now: number): WidgetPayload {
  const names: Record<string, string> = {};
  for (const t of tickers.slice(0, WIDGET_NAME_MAX)) {
    const n = (nameOf(t, loc) || '').trim();
    if (n) names[t] = n.slice(0, 40);
  }
  return {
    v: 1,
    tickers: [...tickers],
    names,
    locale: loc,
    updatedAt: now,
    holidays: [...US_MARKET_HOLIDAYS].sort(),
    earlyCloses: [...EARLY_CLOSE_DATES].sort(),
  };
}

/** 같은 값이면 다시 보내지 않기 위한 열쇠(시각은 빼고) */
export function widgetPayloadKey(p: WidgetPayload): string {
  return `${p.locale}|${p.tickers.join(',')}|${Object.keys(p.names).map((k) => `${k}=${p.names[k]}`).join(',')}`;
}

const URL_RE = /^signumhq-app:\/\/([a-z]+)(?:\/([^?#]*))?(?:[?#].*)?$/i;

/**
 * 위젯 주소 → 앱 안 경로. 모르는 모양은 null(이동하지 않는다).
 *   signumhq-app://ticker/NVDA  → /{loc}/app-view/flow?t=NVDA&from=widget  (알림·«내 종목» 목록 행과 같은 종목 화면)
 *   signumhq-app://watchlist    → /{loc}/app-view/watchlist
 * URL 객체를 쓰지 않는다 — 비특수 스킴의 host 해석이 웹뷰 엔진마다 달랐다(옛 크로미움은 host 를 비웠다).
 */
export function widgetUrlToPath(url: unknown, loc: WlLocale): string | null {
  if (typeof url !== 'string' || url.length > 200) return null;
  const m = URL_RE.exec(url.trim());
  if (!m) return null;
  const kind = m[1].toLowerCase();
  if (kind === 'watchlist') return `/${loc}/app-view/watchlist`;
  if (kind === 'ticker') {
    let raw = m[2] ?? '';
    try { raw = decodeURIComponent(raw); } catch { return null; }
    const t = normalizeTicker(raw);
    return t ? `/${loc}/app-view/flow?t=${encodeURIComponent(t)}&from=widget` : null;
  }
  return null;
}

function readSent(s: StorageLike | null): Record<string, number> {
  if (!s) return {};
  try {
    const d = JSON.parse(s.getItem(LOGO_SENT_KEY) || '{}');
    if (!d || typeof d !== 'object' || Array.isArray(d)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(d)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    return out;
  } catch { return {}; }
}

function writeSent(s: StorageLike | null, sent: Record<string, number>) {
  if (!s) return;
  // 오래된 기록이 끝없이 쌓이지 않게 최근 60종목만
  const keep = Object.entries(sent).sort((a, b) => b[1] - a[1]).slice(0, 60);
  try { s.setItem(LOGO_SENT_KEY, JSON.stringify(Object.fromEntries(keep))); } catch { /* 저장소가 막혀도 동작은 한다(다음에 다시 보낼 뿐) */ }
}

/** 로고를 (다시) 보내야 하는 앞쪽 종목 */
export function logosToSend(tickers: readonly string[], sent: Record<string, number>, now: number): string[] {
  return tickers.slice(0, WIDGET_LOGO_MAX).filter((t) => !(sent[t] && now - sent[t] < WIDGET_LOGO_TTL_MS));
}

// ── 동기화기 ────────────────────────────────────────────────────────────

export interface WidgetSync {
  /** 시작 — 플러그인이 없으면 아무것도 하지 않고 false */
  start(): Promise<boolean>;
  /** 언어가 바뀌었을 수 있다(같으면 아무 일도 없다) */
  refresh(): void;
  /** 시험용 — 진행 중인 전송·로고 작업이 끝날 때까지 */
  idle(): Promise<void>;
  stop(): void;
}

export function createWidgetSync(deps: WidgetBridgeDeps): WidgetSync {
  const now = deps.now ?? (() => Date.now());
  const nameOf = deps.nameOf ?? ((t: string, loc: WlLocale) => tickerName(t, loc, null));
  const defer = deps.defer ?? ((fn: () => void) => { Promise.resolve().then(fn).catch(() => {}); });
  let plugin: WidgetBridgePlugin | null = null;
  let dead = false;
  let lastKey: string | null = null;
  let unsub: (() => void) | null = null;
  let scheduled = false;
  let chain: Promise<void> = Promise.resolve();
  let logoBusy = false;

  const isUnimplemented = (e: unknown) => {
    const code = (e as { code?: unknown })?.code;
    const msg = String((e as { message?: unknown })?.message ?? e ?? '');
    return code === 'UNIMPLEMENTED' || /not implemented|unimplemented/i.test(msg);
  };

  const push = (force: boolean) => {
    if (!plugin || dead) return;
    let payload: WidgetPayload;
    try {
      payload = buildWidgetPayload(deps.store().tickers(), deps.locale(), nameOf, now());
    } catch { return; }
    const key = widgetPayloadKey(payload);
    if (!force && key === lastKey) return;
    lastKey = key;
    const p = plugin;
    chain = chain
      .then(() => p.setWatchlist(payload))
      .then(() => { void syncLogos(payload.tickers); })
      .catch((e) => {
        if (isUnimplemented(e)) { dead = true; return; }
        lastKey = null;   // 실패 — 다음 변경(또는 다음 시작)에 다시 보낸다
      });
  };

  const syncLogos = async (tickers: readonly string[]) => {
    if (!plugin || dead || !deps.rasterizeLogo || logoBusy) return;
    const storage = deps.storage?.() ?? null;
    const sent = readSent(storage);
    const want = logosToSend(tickers, sent, now());
    if (!want.length) return;
    logoBusy = true;
    try {
      const logos: Record<string, string> = {};
      for (const t of want) {
        try {
          const b64 = await deps.rasterizeLogo(t);
          if (b64) logos[t] = b64;
        } catch { /* 이 종목만 건너뛴다 — 위젯이 스스로 받는다 */ }
      }
      const got = Object.keys(logos);
      if (!got.length || !plugin || dead) return;
      await plugin.setLogos({ logos });
      const at = now();
      for (const t of got) sent[t] = at;
      writeSent(storage, sent);
    } catch (e) {
      if (isUnimplemented(e)) dead = true;
    } finally {
      logoBusy = false;
    }
  };

  const onChange = () => {
    if (scheduled) return;
    scheduled = true;
    defer(() => { scheduled = false; push(false); });
  };

  return {
    async start() {
      if (plugin || dead) return !!plugin;
      let p: WidgetBridgePlugin | null = null;
      try { p = deps.plugin(); } catch { p = null; }   // await 하지 않는다 — 프록시가 thenable 이다(위 주석)
      if (!p) return false;
      plugin = p;
      try { unsub = deps.store().subscribe(onChange); } catch { unsub = null; }
      push(true);            // 앱 시작 때 1회 — 같은 값이어도 보낸다(위젯이 앱보다 먼저 설치됐을 수 있다)
      return true;
    },
    refresh() { if (plugin) onChange(); },
    async idle() {
      // 전송 사슬 → 로고 작업까지(로고는 전송 뒤에 시작한다)
      for (let i = 0; i < 20; i++) {
        await chain;
        await new Promise((r) => setTimeout(r, 0));
        if (!logoBusy && !scheduled) break;
      }
    },
    stop() { try { unsub?.(); } catch { /* noop */ } unsub = null; plugin = null; },
  };
}

// ── 로고 래스터화(브라우저) ──────────────────────────────────────────────

/**
 * 앱의 AppTickerLogo 와 같은 그림을 PNG 로: 불투명 정사각 아이콘은 원을 꽉 채우고(cover),
 * 투명·가로형 마크는 밝은 칩 위에 여백을 두고(contain) 그린다. 원으로 잘라 테두리까지 그린 최종 모습.
 */
export async function rasterizeLogoInBrowser(t: string, px = WIDGET_LOGO_PX, timeoutMs = 8_000): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  const img = new Image();
  img.decoding = 'async';
  const loaded = new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    img.onload = () => { clearTimeout(timer); resolve(true); };
    img.onerror = () => { clearTimeout(timer); resolve(false); };
  });
  img.src = `/api/logo/${encodeURIComponent(t)}?v=3`;
  if (!(await loaded)) return null;
  const w = img.naturalWidth || px;
  const h = img.naturalHeight || px;
  const c = document.createElement('canvas');
  c.width = px; c.height = px;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  // AppTickerLogo.decideFit 와 같은 판정
  let cover = false;
  const ar = w / h;
  if (ar >= 0.82 && ar <= 1.22) {
    const N = 12;
    const probe = document.createElement('canvas');
    probe.width = N; probe.height = N;
    const pctx = probe.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings);
    if (pctx) {
      try {
        pctx.drawImage(img, 0, 0, N, N);
        const d = pctx.getImageData(0, 0, N, N).data;
        cover = [0, N - 1, N * (N - 1), N * N - 1].every((i) => d[i * 4 + 3] > 245);
      } catch { cover = false; }
    }
  }
  const r = px / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.clip();
  if (cover) {
    ctx.drawImage(img, 0, 0, px, px);
  } else {
    const g = ctx.createRadialGradient(px * 0.35, px * 0.25, 0, px * 0.35, px * 0.25, px);
    g.addColorStop(0, 'rgba(255,255,255,0.97)');
    g.addColorStop(1, 'rgba(224,231,240,0.92)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, px, px);
    const pad = Math.max(2, Math.round(px * 0.12));
    const box = px - pad * 2;
    const s = Math.min(box / w, box / h);
    const dw = w * s, dh = h * s;
    ctx.drawImage(img, (px - dw) / 2, (px - dh) / 2, dw, dh);
  }
  ctx.restore();
  // 앱 칩의 1px 테두리(22px 로 그릴 때 1px 가 되게)
  const lw = px / 22;
  ctx.beginPath();
  ctx.arc(r, r, r - lw / 2, 0, Math.PI * 2);
  ctx.lineWidth = lw;
  ctx.strokeStyle = cover ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.16)';
  ctx.stroke();
  try {
    const url = c.toDataURL('image/png');
    const i = url.indexOf(',');
    return i > 0 ? url.slice(i + 1) : null;
  } catch {
    return null;   // 캔버스가 오염됐다(다른 출처) — 위젯이 스스로 받는다
  }
}

// ── 딥링크 ──────────────────────────────────────────────────────────────

export interface WidgetLinkDeps {
  locale: () => WlLocale;
  navigate: (path: string) => void;
  /** 페이지가 막 열렸나(콜드 스타트) — 그때만 이동이 다른 첫 이동(언어 자리 잡기)에 덮였는지 한 번 다시 본다 */
  justLoaded?: () => boolean;
  /** 콜드 스타트 이동 뒤 한 번 — 지금 경로가 목표와 다르면 다시 이동한다 */
  recheck?: (path: string, again: () => void) => void;
  session?: () => StorageLike | null;
  now?: () => number;
}

/**
 * 위젯 주소 처리기 — 같은 주소가 잇달아 두 번 오면(보존된 appUrlOpen + getLaunchUrl) 한 번만 이동한다.
 * 푸시 딥링크의 대기 경로(signumhq.pendingDeepLink)는 쓰지 않는다: 그 열쇠는 소비 창(마운트 뒤 2.4초)을 넘기면
 * 세션에 남아 나중에 웹뷰가 다시 불릴 때 엉뚱하게 이동한다. 부팅 주소가 /…/app-view/dash 라 루트 리다이렉트도 없다.
 */
export function createWidgetLinkHandler(deps: WidgetLinkDeps) {
  const now = deps.now ?? (() => Date.now());
  let last: { url: string; at: number } | null = null;
  const session = () => { try { return deps.session?.() ?? null; } catch { return null; } };

  const open = (url: unknown, via: 'event' | 'launch'): boolean => {
    const path = widgetUrlToPath(url, deps.locale());
    if (!path) return false;
    const u = String(url);
    const s = session();
    if (via === 'launch') {
      // getLaunchUrl 은 프로세스가 끝날 때까지 같은 값을 준다 — 웹뷰가 다시 불려도 또 이동하지 않게
      try { if (s?.getItem(LAUNCH_URL_KEY) === u) return false; } catch { /* noop */ }
    }
    if (last && last.url === u && now() - last.at < 2_500) return false;
    last = { url: u, at: now() };
    try { s?.setItem(LAUNCH_URL_KEY, u); } catch { /* noop */ }
    const go = () => { try { deps.navigate(path); } catch { /* noop */ } };
    const isList = path.endsWith('/app-view/watchlist');
    if (isList) noteWatchlistEntry('widget');          // 목록 화면의 wl_view 에 «위젯에서» 가 실린다
    trackWatchlist('wl_widget_open', isList ? { kind: 'watchlist' } : { kind: 'ticker', t: path.split('t=')[1]?.split('&')[0] ?? '' });
    go();
    if (deps.justLoaded?.()) deps.recheck?.(path, go);
    return true;
  };
  return { open };
}

// ── 앱에서 한 번 켠다 ────────────────────────────────────────────────────

let started = false;
let sync: WidgetSync | null = null;
let navigateRef: ((path: string) => void) | null = null;
let localeRef: WlLocale | null = null;

/**
 * 앱 레이아웃(WatchlistHost)이 부른다. 여러 번 불려도(언어 바뀜으로 레이아웃이 다시 붙어도) 페이지당 한 번만 시작한다.
 * 돌려주는 정리 함수는 이동 함수만 뗀다 — 동기화는 페이지가 살아 있는 동안 계속한다.
 */
export function startWidgetBridge(opts: { navigate: (path: string) => void; locale: string }): () => void {
  navigateRef = opts.navigate;
  localeRef = toWlLocale(opts.locale);
  if (typeof window === 'undefined') return () => {};
  if (started) { sync?.refresh(); return () => { if (navigateRef === opts.navigate) navigateRef = null; }; }
  started = true;
  void (async () => {
    let core: typeof import('@capacitor/core') | null = null;
    try { core = await import('@capacitor/core'); } catch { core = null; }
    const C = core?.Capacitor;
    if (!C?.isNativePlatform?.() || !C.isPluginAvailable?.(WIDGET_PLUGIN_NAME)) return;   // 웹 · 옛 앱 바이너리
    const plugin = core!.registerPlugin<WidgetBridgePlugin>(WIDGET_PLUGIN_NAME);
    // 위젯 글자·딥링크의 언어 = 앱이 고른 언어(저장된 선택 → 기기 언어). 콜드 스타트의 URL(/en 부팅)을 믿지 않는다 — appLocale.ts
    const loc = (): WlLocale => { try { return toWlLocale(resolveAppLocale()); } catch { return localeRef ?? 'en'; } };
    sync = createWidgetSync({
      plugin: () => plugin,
      store: getWatchlistStore,
      locale: loc,
      rasterizeLogo: (t) => rasterizeLogoInBrowser(t),
      storage: () => { try { return window.localStorage; } catch { return null; } },
      defer: (fn) => { window.setTimeout(fn, 0); },
    });
    await sync.start();

    // 위젯을 눌러 들어왔다 — 앱 안 화면으로
    const links = createWidgetLinkHandler({
      locale: loc,
      navigate: (path) => { navigateRef?.(path); },
      justLoaded: () => { try { return performance.now() < 20_000; } catch { return false; } },
      // 콜드 스타트: 레이아웃의 언어 자리 잡기(router.replace)와 겹쳐도 목표 화면에 닿게 — 1.5초 뒤 한 번만 다시 본다
      recheck: (path, again) => {
        window.setTimeout(() => {
          try { if (window.location.pathname !== path.split('?')[0]) again(); } catch { /* noop */ }
        }, 1_500);
      },
      session: () => { try { return window.sessionStorage; } catch { return null; } },
    });
    try {
      const { App } = await import('@capacitor/app');
      await App.addListener('appUrlOpen', ({ url }) => { links.open(url, 'event'); });
      const launch = await App.getLaunchUrl().catch(() => undefined);
      if (launch?.url) links.open(launch.url, 'launch');
    } catch { /* App 플러그인 없음 — 누르면 앱만 열린다 */ }
  })();
  return () => { if (navigateRef === opts.navigate) navigateRef = null; };
}

/** 앱 언어가 바뀌었다(WatchlistHost 의 locale) — 위젯 글자도 따라간다 */
export function setWidgetLocale(locale: string) {
  localeRef = toWlLocale(locale);
  // 늘 다시 본다 — 보낼 언어는 앱이 고른 언어(resolveAppLocale)라 레이아웃 언어와 어긋날 수 있다. 같은 값이면 refresh 가 보내지 않는다
  sync?.refresh();
}
