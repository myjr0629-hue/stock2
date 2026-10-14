// Local-only fake React runtime, timers and AdMob bridge. No SDK/network requests.
export const env = { native: true, platform: 'ios' };
export const Capacitor = { isNativePlatform: () => env.native, getPlatform: () => env.platform };
export const App = { addListener: async () => ({ remove: async () => {} }) };
export const AdmobConsentStatus = { REQUIRED: 'REQUIRED' };
export const BannerAdPluginEvents = { SizeChanged: 'bannerAdSizeChanged', Loaded: 'bannerAdLoaded', FailedToLoad: 'bannerAdFailedToLoad' };
export const BannerAdSize = { ADAPTIVE_BANNER: 'ADAPTIVE_BANNER' };
export const BannerAdPosition = { BOTTOM_CENTER: 'BOTTOM_CENTER' };
export const RewardAdPluginEvents = {
  Rewarded: 'onRewardedVideoAdReward', Dismissed: 'onRewardedVideoAdDismissed',
  FailedToShow: 'onRewardedVideoAdFailedToShow', FailedToLoad: 'onRewardedVideoAdFailedToLoad',
};
export function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export async function flush() { for (let i = 0; i < 50; i++) await Promise.resolve(); }

let now = Date.now();
let serial = 0;
const timers = new Map<number, { at: number; fn: () => void; interval?: number }>();
const g: any = globalThis;
Date.now = () => now;
g.setTimeout = (fn: () => void, ms = 0) => { const id = ++serial; timers.set(id, { at: now + ms, fn }); return id; };
g.clearTimeout = (id: number) => timers.delete(id);
g.setInterval = (fn: () => void, ms: number) => { const id = ++serial; timers.set(id, { at: now + ms, fn, interval: ms }); return id; };
g.clearInterval = g.clearTimeout;
export function advance(ms: number) {
  now += ms;
  for (const [id, timer] of [...timers]) {
    if (timer.at > now) continue;
    if (timer.interval) timer.at = now + timer.interval;
    else timers.delete(id);
    timer.fn();
  }
}
export const timeoutCount = () => [...timers.values()].filter(t => !t.interval).length;
export const storage = new Map<string, string>();
export const writes: string[] = [];
g.localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); writes.push(key); },
  removeItem: (key: string) => storage.delete(key),
};
const events = new EventTarget();
g.window = g;
g.addEventListener = events.addEventListener.bind(events);
g.removeEventListener = events.removeEventListener.bind(events);
g.dispatchEvent = events.dispatchEvent.bind(events);
g.document = { querySelector: () => null, documentElement: { style: { setProperty: () => {} } } };
g.getComputedStyle = () => ({ getPropertyValue: () => '' });

export class FakeAdMob {
  listeners = new Map<string, Set<(data?: any) => void>>();
  registrations: string[] = [];
  removed = 0;
  prepareRewardCalls = 0;
  prepareInterstitialCalls = 0;
  rewardShows = 0;
  interstitialShows = 0;
  onRegister?: (event: string) => Promise<void>;
  onPrepare: () => Promise<unknown> = async () => ({});
  onShow: () => Promise<unknown> = () => new Promise(() => {});
  trackingAuthorizationStatus = async () => ({ status: 'authorized' });
  requestTrackingAuthorization = async () => {};
  requestConsentInfo = async () => ({ status: 'NOT_REQUIRED' });
  initialize = async () => {};
  hideBanner = async () => {};
  showBanner = async () => {};
  resumeBanner = async () => {};
  async addListener(event: string, callback: (data?: any) => void) {
    this.registrations.push(event);
    await this.onRegister?.(event);
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(callback);
    return { remove: async () => { this.listeners.get(event)!.delete(callback); this.removed++; } };
  }
  emit(event: string, data?: any) { for (const fn of [...(this.listeners.get(event) ?? [])]) fn(data); }
  count() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
  async prepareRewardVideoAd() { this.prepareRewardCalls++; return this.onPrepare(); }
  async prepareInterstitial() { this.prepareInterstitialCalls++; return this.onPrepare(); }
  showRewardVideoAd() { this.rewardShows++; return this.onShow(); }
  showInterstitial() { this.interstitialShows++; return this.onShow(); }
}
export const AdMob = new FakeAdMob();
g.Capacitor = { ...Capacitor, Plugins: { AdMob } };

// Only the hook primitives used by the two ValueWalls; render commits effects.
let current: { slots: any[]; effects: Array<() => void>; updates: number } | null = null;
let cursor = 0;
export function useState<T>(initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] {
  const inst = current!, i = cursor++;
  if (!(i in inst.slots)) inst.slots[i] = typeof initial === 'function' ? (initial as () => T)() : initial;
  return [inst.slots[i], (next) => {
    const value = typeof next === 'function' ? (next as (prev: T) => T)(inst.slots[i]) : next;
    if (!Object.is(inst.slots[i], value)) inst.updates++;
    inst.slots[i] = value;
  }];
}
export function useRef<T>(value: T) { return useState(() => ({ current: value }))[0]; }
export function useCallback<T>(fn: T, _deps: unknown[]) { return fn; }
export function useEffect(fn: () => void | (() => void), deps: unknown[]) {
  const inst = current!, i = cursor++, prev = inst.slots[i];
  if (prev && deps.every((d, j) => Object.is(d, prev.deps[j]))) return;
  inst.effects.push(() => { prev?.cleanup?.(); inst.slots[i] = { deps, cleanup: fn() }; });
}
export function mount<T>(component: () => T) {
  const inst = { slots: [] as any[], effects: [] as Array<() => void>, updates: 0 };
  return {
    get updates() { return inst.updates; },
    render() {
      current = inst; cursor = 0;
      const result = component(); current = null;
      inst.effects.splice(0).forEach(fn => fn());
      return result;
    },
    unmount() { inst.slots.forEach(slot => slot?.cleanup?.()); },
  };
}
export const Fragment = 'Fragment';
export const jsx = (type: any, props: any) => ({ type, props });
export const jsxs = jsx;
export default { createElement: (type: any, props: any, ...children: any[]) => jsx(type, { ...props, children }) };
export const useProStatus = () => ({ isPro: false, iapAvailable: true, purchase: async () => ({}), restore: async () => ({}) });
export const useBannerSuppression = () => {};
export const AdFreeIcon = () => null;
export const ProPaywall = () => null;
export const RedeemCodeLink = () => null;
