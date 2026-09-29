// scripts/test-sheet-history.ts 전용 가짜 모듈 — esbuild --alias 로 react · react/jsx-runtime · @capacitor/core 를
//   «이 파일 하나»로 바꾼다(실행 명령은 test-sheet-history.ts 머리말). 운영 코드는 이 파일을 import 하지 않는다.
//
// ① 웹뷰: window.history(항목 쌓기 · back/forward 는 popstate 를 «비동기»로) · document(keydown · activeElement)
// ② React: useEffect·useRef·useCallback 만 흉내 낸다 — 한 커밋 안에서는 «언마운트 정리 → deps 변경 정리 → 설치» 순서(React 와 같다)
const g: any = globalThis;

// ── ① history ───────────────────────────────────────────────────────────────────────────
type Entry = { state: any };
export const hist = { stack: [{ state: { __NA: true } }] as Entry[], index: 0 };
type Fn = (e: any) => void;
const winListeners = new Map<string, Set<Fn>>();
const docListeners = new Map<string, Set<Fn>>();
const on = (m: Map<string, Set<Fn>>, ev: string, fn: Fn) => { if (!m.has(ev)) m.set(ev, new Set()); m.get(ev)!.add(fn); };
const off = (m: Map<string, Set<Fn>>, ev: string, fn: Fn) => { m.get(ev)?.delete(fn); };
g.window = g;
g.addEventListener = (ev: string, fn: Fn) => on(winListeners, ev, fn);
g.removeEventListener = (ev: string, fn: Fn) => off(winListeners, ev, fn);
g.history = {
  get state() { return hist.stack[hist.index].state; },
  pushState(state: any) { hist.stack = hist.stack.slice(0, hist.index + 1); hist.stack.push({ state }); hist.index += 1; },
  replaceState(state: any) { hist.stack[hist.index] = { state }; },
  back() { go(-1); },
  forward() { go(1); },
};
function go(d: number) {
  const next = hist.index + d;
  if (next < 0 || next >= hist.stack.length) return;
  setTimeout(() => {                                   // popstate 는 비동기로 온다
    hist.index = next;
    const ev = { state: hist.stack[hist.index].state };
    Array.from(winListeners.get('popstate') ?? []).forEach((f) => f(ev));
  }, 1);
}
/** 사용자(안드로이드 하드웨어·브라우저) 뒤로가기 */
export const userBack = () => go(-1);
export const userForward = () => go(1);
/** Next router.push 흉내 — 토큰 없는 새 항목 */
export const routerPush = () => g.history.pushState({ __NA: true, page: 'next' });

// ── document ─────────────────────────────────────────────────────────────────────────────
export class El {
  attrs = new Map<string, string>();
  kids: El[] = [];
  constructor(public name: string) {}
  setAttribute(k: string, v: string) { this.attrs.set(k, v); }
  removeAttribute(k: string) { this.attrs.delete(k); }
  hasAttribute(k: string) { return this.attrs.has(k); }
  contains(x: unknown): boolean { return x === this || this.kids.some((k) => k.contains(x)); }
  blur() { if (g.document.activeElement === this) g.document.activeElement = null; }
  focus() { g.document.activeElement = this; }
}
g.document = {
  activeElement: null as unknown,
  body: null,
  addEventListener: (ev: string, fn: Fn) => on(docListeners, ev, fn),
  removeEventListener: (ev: string, fn: Fn) => off(docListeners, ev, fn),
  contains: () => true,
};
/** 키 하나 — 문서 keydown 리스너에 등록 순서대로 보낸다 */
export function keydown(key: string) {
  const e = { key, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  Array.from(docListeners.get('keydown') ?? []).forEach((f) => f(e));
  return e;
}

// ── ② React 훅 몇 개 ─────────────────────────────────────────────────────────────────────
type Cleanup = void | (() => void);
interface Slot { deps?: readonly unknown[]; cleanup?: Cleanup; ref?: { current: unknown }; cb?: unknown }
interface Inst<P> { slots: Slot[]; props: P; comp: (p: P) => void }
let current: Inst<any> | null = null;
let cursor = 0;
let pending: Array<{ inst: Inst<any>; i: number; fn: () => Cleanup; deps?: readonly unknown[] }> = [];
let destroys: Array<() => void> = [];
let batching = 0;
const changed = (prev: Slot | undefined, deps?: readonly unknown[]) =>
  !prev || !deps || !prev.deps || deps.length !== prev.deps.length || deps.some((d, k) => !Object.is(d, prev.deps![k]));

export function useEffect(fn: () => Cleanup, deps?: readonly unknown[]): void {
  const inst = current!; const i = cursor++;
  if (changed(inst.slots[i], deps)) pending.push({ inst, i, fn, deps });
}
export function useRef<T>(v: T): { current: T } {
  const inst = current!; const i = cursor++;
  if (!inst.slots[i]) inst.slots[i] = { ref: { current: v } };
  return inst.slots[i].ref as { current: T };
}
export function useCallback<T>(fn: T, deps?: readonly unknown[]): T {
  const inst = current!; const i = cursor++;
  if (changed(inst.slots[i], deps)) inst.slots[i] = { deps, cb: fn };
  return inst.slots[i].cb as T;
}
// BottomSheet 모듈이 가져오기만 하는 이름들(이 시험에서는 부르지 않는다)
export const useState = (v: unknown) => [typeof v === 'function' ? (v as () => unknown)() : v, () => {}];
export const useId = () => 'id';
export const useMemo = (f: () => unknown) => f();
export const useSyncExternalStore = (_s: unknown, get: () => unknown) => get();
export const Fragment = 'Fragment';
export const jsx = () => null;
export const jsxs = () => null;
const ReactShim = { useEffect, useRef, useCallback, useState, useId, useMemo, useSyncExternalStore };
export default ReactShim;

function render<P>(inst: Inst<P>) { current = inst; cursor = 0; try { inst.comp(inst.props); } finally { current = null; } }
function commit() {
  const q = pending; pending = [];
  const d = destroys; destroys = [];
  for (const f of d) f();                                                                          // 언마운트 정리
  for (const e of q) { const c = e.inst.slots[e.i]?.cleanup; if (typeof c === 'function') c(); } // deps 변경 정리
  for (const e of q) e.inst.slots[e.i] = { ...e.inst.slots[e.i], deps: e.deps, cleanup: e.fn() }; // 설치
}
/** 여러 컴포넌트 변경을 «한 커밋»으로 묶는다(예: 시트와 페이월이 함께 닫힘) */
export function act(fn: () => void): void { batching++; try { fn(); } finally { batching--; } if (!batching) commit(); }
export function mount<P>(comp: (p: P) => void, props: P) {
  const inst: Inst<P> = { slots: [], props, comp };
  render(inst);
  if (!batching) commit();
  return {
    update(next: P) { inst.props = next; render(inst); if (!batching) commit(); },
    unmount() {
      for (const s of inst.slots) if (typeof s?.cleanup === 'function') destroys.push(s.cleanup as () => void);
      inst.slots = [];
      if (!batching) commit();
    },
  };
}

// ── @capacitor/core(useBannerSuppression 이 동적으로 부른다 — 이 시험에서는 웹) ───────────
export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };
