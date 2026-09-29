// scripts/test-banner-suppression.ts 전용 가짜 모듈 — esbuild --alias 로
//   react · @capacitor/core · @capacitor/app · @capacitor-community/admob 을 «이 파일 하나»로 바꾼다
//   (실행 명령은 test-banner-suppression.ts 머리말). 운영 코드는 이 파일을 import 하지 않는다.
//
// ① React: useEffect 만 흉내 낸다 — deps 비교, 한 커밋 안에서는 «정리 전부 → 설치 전부» 순서(React 와 같다).
// ② AdMob 배너: 플러그인 원본(@capacitor-community/admob 8.0.0)의 BannerExecutor 동작을 플랫폼별로 옮겼다.
//    iOS     showBanner  기존 뷰를 떼고 새 뷰를 요청 — 광고가 «도착해야» 화면에 붙는다(보임)
//            hideBanner  붙은 뷰가 있으면 isHidden=true, 없으면 아무 일도 없다(요청 중이면 허공)
//            resumeBanner 붙은 뷰가 있으면 isHidden=false, 없으면 reject
//    Android showBanner  뷰(mAdView)가 있으면 새 광고만 싣는다(GONE 그대로) / 없으면 새 뷰(VISIBLE)
//            hideBanner  뷰가 없으면 reject, 있으면 GONE
//            resumeBanner 뷰가 있으면 VISIBLE (없어도 resolve)

// ── 전역(웹뷰 흉내) — adManager.init() 이 window·document·localStorage 를 본다 ─────────────
const g: any = globalThis;
const cssVars: Record<string, string> = {};
const store = new Map<string, string>();
g.window = g;
g.document = {
  querySelector: () => null,
  documentElement: { style: { setProperty: (k: string, v: string) => { cssVars[k] = v; } } },
};
g.getComputedStyle = () => ({ getPropertyValue: (k: string) => cssVars[k] ?? '' });
g.localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
};
export const adSlotHeight = () => cssVars['--app-anchor-ad-height'];

// ── ① React useEffect 런타임 ──────────────────────────────────────────────────────────
type Cleanup = void | (() => void);
interface Slot { deps?: readonly unknown[]; cleanup?: Cleanup }
interface Inst<P> { slots: Slot[]; props: P; comp: (p: P) => void }
let current: Inst<any> | null = null;
let cursor = 0;
let pending: Array<{ inst: Inst<any>; i: number; fn: () => Cleanup; deps?: readonly unknown[] }> = [];
let destroys: Array<() => void> = [];
let batching = 0;

export function useEffect(fn: () => Cleanup, deps?: readonly unknown[]): void {
  if (!current) throw new Error('useEffect called outside a component');
  const inst = current;
  const i = cursor++;
  const prev = inst.slots[i];
  const changed = !prev || !deps || !prev.deps || deps.length !== prev.deps.length
    || deps.some((d, k) => !Object.is(d, prev.deps![k]));
  if (changed) pending.push({ inst, i, fn, deps });
}

function render<P>(inst: Inst<P>) {
  current = inst; cursor = 0;
  try { inst.comp(inst.props); } finally { current = null; }
}

function commit() {
  const q = pending; pending = [];
  const d = destroys; destroys = [];
  for (const f of d) f();                                                      // 언마운트 정리
  for (const e of q) { const c = e.inst.slots[e.i]?.cleanup; if (typeof c === 'function') c(); } // deps 변경 정리
  for (const e of q) e.inst.slots[e.i] = { deps: e.deps, cleanup: e.fn() };  // 설치
}

/** 여러 컴포넌트 변경을 «한 커밋»으로 묶는다(예: 광고 모달 닫기 + 페이월 열기). */
export function act(fn: () => void): void {
  batching++;
  try { fn(); } finally { batching--; }
  if (!batching) commit();
}

export function mount<P>(comp: (p: P) => void, props: P) {
  const inst: Inst<P> = { slots: [], props, comp };
  render(inst);
  if (!batching) commit();
  return {
    update(next: P) { inst.props = next; render(inst); if (!batching) commit(); },
    unmount() {
      for (const s of inst.slots) if (typeof s.cleanup === 'function') destroys.push(s.cleanup as () => void);
      inst.slots = [];
      if (!batching) commit();
    },
  };
}

// ── ② Capacitor core / app ──────────────────────────────────────────────────────────────
export const env = { native: true, platform: 'ios' as 'ios' | 'android' };
export const Capacitor = {
  isNativePlatform: () => env.native,
  getPlatform: () => (env.native ? env.platform : 'web'),
};
const appListeners: Array<(s: { isActive: boolean }) => void> = [];
export const App = {
  addListener: (ev: string, fn: (s: { isActive: boolean }) => void) => {
    if (ev === 'appStateChange') appListeners.push(fn);
    return Promise.resolve({ remove: () => {} });
  },
};
/** 앱이 백그라운드 → 포그라운드로 돌아왔다(Capacitor appStateChange). */
export function emitAppActive(): void { for (const f of appListeners) f({ isActive: true }); }

// ── ③ AdMob 플러그인 ───────────────────────────────────────────────────────────────────
export const BannerAdSize = { ADAPTIVE_BANNER: 'ADAPTIVE_BANNER' };
export const BannerAdPosition = { BOTTOM_CENTER: 'BOTTOM_CENTER' };
export const BannerAdPluginEvents = {
  SizeChanged: 'bannerAdSizeChanged', Loaded: 'bannerAdLoaded', FailedToLoad: 'bannerAdFailedToLoad',
};
export const AdmobConsentStatus = { REQUIRED: 'REQUIRED', NOT_REQUIRED: 'NOT_REQUIRED', OBTAINED: 'OBTAINED' };

const BANNER_H = 63;
export const native = {
  attached: false,   // iOS: 뷰가 화면에 붙어 있다 · Android: mAdView 가 있다(레이아웃이 붙어 있다)
  hidden: false,     // iOS isHidden · Android GONE
  loading: false,    // 요청 중인 광고가 있다
  requests: 0,       // 광고 요청 수(showBanner)
  calls: [] as string[],
};
/** 사용자 눈에 배너가 보이는가 */
export const bannerVisible = () => native.attached && !native.hidden;

const listeners = new Map<string, Set<(d?: any) => void>>();
function emit(ev: string, data?: any) {
  // 네이티브 이벤트는 비동기로 온다
  setTimeout(() => { listeners.get(ev)?.forEach((f) => f(data)); }, 0);
}

/** 요청 중인 광고가 도착했다(ok) / 실패했다(!ok). */
export function finishLoad(ok = true): void {
  if (!native.loading) throw new Error('finishLoad: no pending load');
  native.loading = false;
  if (ok) {
    if (env.platform === 'ios') { native.attached = true; native.hidden = false; } // 새 뷰가 isHidden=false 로 붙는다
    emit(BannerAdPluginEvents.SizeChanged, { width: 390, height: BANNER_H });
    emit(BannerAdPluginEvents.Loaded);
  } else {
    native.attached = false; native.hidden = false;                                 // 두 플랫폼 모두 뷰를 버린다
    emit(BannerAdPluginEvents.SizeChanged, { width: 0, height: 0 });
    emit(BannerAdPluginEvents.FailedToLoad, { code: 3, message: 'No fill' });
  }
}

/** 자동 새로고침(붙어 있는 뷰에 새 광고) — iOS/Android 모두 Loaded 가 다시 온다. */
export function autoRefresh(): void {
  if (!native.attached) return;
  emit(BannerAdPluginEvents.Loaded);
}

export const AdMob = {
  trackingAuthorizationStatus: async () => ({ status: 'authorized' }),
  requestTrackingAuthorization: async () => {},
  requestConsentInfo: async () => ({ status: AdmobConsentStatus.NOT_REQUIRED, isConsentFormAvailable: false }),
  showConsentForm: async () => ({}),
  initialize: async () => {},
  prepareInterstitial: async () => ({}),
  prepareRewardVideoAd: async () => ({}),
  showInterstitial: async () => {},
  showPrivacyOptionsForm: async () => {},
  addListener: (ev: string, fn: (d?: any) => void) => {
    if (!listeners.has(ev)) listeners.set(ev, new Set());
    listeners.get(ev)!.add(fn);
    return Promise.resolve({ remove: () => { listeners.get(ev)?.delete(fn); } });
  },
  showBanner: async () => {
    native.calls.push('show');
    native.requests += 1;
    if (env.platform === 'ios') {
      native.attached = false; native.hidden = false; native.loading = true;         // 옛 뷰를 떼고 새 요청
    } else if (native.attached) {
      native.loading = true;                                                          // updateExistingAdView — GONE 그대로
    } else {
      native.attached = true; native.hidden = false; native.loading = true;          // 새 뷰(VISIBLE)
    }
  },
  hideBanner: async () => {
    native.calls.push('hide');
    if (env.platform === 'android' && !native.attached) throw new Error('You tried to hide a banner that was never shown');
    if (native.attached) native.hidden = true;
    emit(BannerAdPluginEvents.SizeChanged, { width: 0, height: 0 });
  },
  resumeBanner: async () => {
    native.calls.push('resume');
    if (native.attached) {
      native.hidden = false;
      emit(BannerAdPluginEvents.SizeChanged, { width: 390, height: BANNER_H });
      return;
    }
    if (env.platform === 'ios') throw new Error('AdMob: not find subView for resumeBanner');
  },
};
