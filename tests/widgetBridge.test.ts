/**
 * «내 종목» 홈 화면 위젯 브리지 시험 — src/lib/app/widgetBridge.ts
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/widgetBridge.test.ts
 *
 * 지키는 것:
 *   · 플러그인 없음(웹·옛 앱 바이너리) = 아무 일도 없다 — 호출 0 · 저장소 구독 0
 *   · 플러그인 있음 = 시작 1회 + 목록이 바뀔 때마다 정확히 한 번 · 같은 값이면 보내지 않는다(중복 억제)
 *   · 같은 틱의 연속 변경은 한 번으로 · 미구현 거절 뒤로는 부르지 않는다 · 실패하면 다음 변경에 다시 보낸다
 *   · 로고: 앞 12종목만 · 7일 안에 보낸 것은 다시 안 보냄 · 래스터화 실패 종목은 건너뜀
 *   · 딥링크: 티커 모양만 통과 · 같은 주소 연속 두 번(보존 이벤트 + getLaunchUrl)은 한 번만 · 웹뷰 재로드 때 launch 재이동 없음
 */
import assert from 'node:assert/strict';
import {
  createWatchlistStore, MAX_ITEMS, type StorageLike, type WatchlistStore,
} from '../src/lib/app/watchlist';
import {
  buildWidgetPayload, createWidgetLinkHandler, createWidgetSync, logosToSend, widgetPayloadKey, widgetUrlToPath,
  WIDGET_LOGO_MAX, WIDGET_LOGO_TTL_MS, WIDGET_NAME_MAX, type WidgetBridgePlugin, type WidgetPayload,
} from '../src/lib/app/widgetBridge';
import type { WlLocale } from '../src/lib/app/watchlistInsights';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const ta = async (name: string, fn: () => Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };

class MemStorage implements StorageLike {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
}

class FakePlugin implements WidgetBridgePlugin {
  calls: WidgetPayload[] = [];
  logoCalls: Record<string, string>[] = [];
  failNext: unknown = null;
  async setWatchlist(p: WidgetPayload) {
    if (this.failNext) { const e = this.failNext; this.failNext = null; throw e; }
    this.calls.push(JSON.parse(JSON.stringify(p)));
  }
  async setLogos(o: { logos: Record<string, string> }) { this.logoCalls.push({ ...o.logos }); }
}

/** 구독 수를 셀 수 있는 저장소 감싸개 */
function countingStore(inner: WatchlistStore): WatchlistStore & { subs: number } {
  const w = Object.create(inner) as WatchlistStore & { subs: number };
  w.subs = 0;
  w.subscribe = (l: () => void) => { w.subs++; const u = inner.subscribe(l); return () => { w.subs--; u(); }; };
  w.tickers = () => inner.tickers();
  return w;
}

const immediate = (fn: () => void) => fn();

async function main() {
  console.log('widgetBridge');

  // ── 1. 순수 함수 ──
  t('payload: 순서 그대로 · 이름은 앞 12종목만 · 휴장 달력 포함', () => {
    const tickers = Array.from({ length: 20 }, (_, i) => `T${String.fromCharCode(65 + i)}`);
    const p = buildWidgetPayload(tickers, 'ko', (x) => `이름${x}`, 123);
    assert.deepEqual(p.tickers, tickers);
    assert.equal(Object.keys(p.names).length, WIDGET_NAME_MAX);
    assert.equal(p.names.TA, '이름TA');
    assert.equal(p.locale, 'ko');
    assert.equal(p.updatedAt, 123);
    assert.ok(p.holidays.includes('2026-11-26') && p.holidays.includes('2027-12-24'));
    assert.ok(p.earlyCloses.includes('2026-11-27'));
    // 이름이 없는 종목은 싣지 않는다
    const q = buildWidgetPayload(['NVDA', 'ZZZZ'], 'en', (x) => (x === 'NVDA' ? 'NVIDIA' : ''), 1);
    assert.deepEqual(q.names, { NVDA: 'NVIDIA' });
  });

  t('payload 열쇠: 시각은 무시 · 순서·언어·이름이 바뀌면 달라진다', () => {
    const nm = (x: string) => x.toLowerCase();
    const a = widgetPayloadKey(buildWidgetPayload(['A', 'B'], 'ko', nm, 1));
    assert.equal(a, widgetPayloadKey(buildWidgetPayload(['A', 'B'], 'ko', nm, 999)));
    assert.notEqual(a, widgetPayloadKey(buildWidgetPayload(['B', 'A'], 'ko', nm, 1)));
    assert.notEqual(a, widgetPayloadKey(buildWidgetPayload(['A', 'B'], 'ja', nm, 1)));
  });

  t('딥링크 주소 → 경로: 티커·목록만 · 모양이 틀리면 null', () => {
    assert.equal(widgetUrlToPath('signumhq-app://ticker/NVDA', 'ko'), '/ko/app-view/flow?t=NVDA&from=widget');
    assert.equal(widgetUrlToPath('signumhq-app://ticker/brk.b?src=widget', 'ja'), '/ja/app-view/flow?t=BRK.B&from=widget');
    assert.equal(widgetUrlToPath('signumhq-app://ticker/BF-B', 'en'), '/en/app-view/flow?t=BF-B&from=widget');
    assert.equal(widgetUrlToPath('signumhq-app://watchlist', 'en'), '/en/app-view/watchlist');
    assert.equal(widgetUrlToPath('SIGNUMHQ-APP://WATCHLIST?x=1', 'ko'), '/ko/app-view/watchlist');
    for (const bad of [
      'signumhq-app://ticker/', 'signumhq-app://ticker/..%2Fsettings', 'signumhq-app://ticker/NVDA/extra',
      'signumhq-app://ticker/<script>', 'signumhq-app://settings', 'https://www.signumhq.com/ko/app-view/flow?t=NVDA',
      'javascript:alert(1)', 'signumhq://ticker/NVDA', '', null, 42, 'signumhq-app://ticker/%E0%A4%A',
      `signumhq-app://ticker/${'A'.repeat(300)}`,
    ]) {
      assert.equal(widgetUrlToPath(bad, 'ko'), null, String(bad));
    }
  });

  t('로고 대상: 앞 12종목 · 7일 안에 보낸 것 제외', () => {
    const tickers = Array.from({ length: 15 }, (_, i) => `L${i}`);
    const now = 10 * WIDGET_LOGO_TTL_MS;
    const sent = { L0: now - 1000, L1: now - WIDGET_LOGO_TTL_MS - 1, L14: now };
    const want = logosToSend(tickers, sent, now);
    assert.equal(want.length, WIDGET_LOGO_MAX - 1);
    assert.ok(!want.includes('L0') && want.includes('L1') && !want.includes('L12') && !want.includes('L14'));
  });

  // ── 2. 플러그인 없음 = 아무 일도 없다 ──
  await ta('플러그인 없음(웹·옛 앱): 호출 0 · 구독 0 · 로고 0', async () => {
    const store = countingStore(createWatchlistStore({ storage: () => new MemStorage() }));
    let rasterized = 0;
    const sync = createWidgetSync({
      plugin: () => null, store: () => store, locale: () => 'ko', defer: immediate,
      rasterizeLogo: async () => { rasterized++; return 'x'; },
    });
    assert.equal(await sync.start(), false);
    assert.equal(store.subs, 0);
    store.add('NVDA', 'test', 5);
    sync.refresh();
    await sync.idle();
    assert.equal(rasterized, 0);
  });

  await ta('플러그인 조회가 던져도 조용히 false', async () => {
    const store = createWatchlistStore({ storage: () => new MemStorage() });
    const sync = createWidgetSync({ plugin: () => { throw new Error('boom'); }, store: () => store, locale: () => 'ko' });
    assert.equal(await sync.start(), false);
  });

  // ── 3. 플러그인 있음 = 변경마다 한 번 · 중복 억제 ──
  await ta('시작 1회 + 담기/빼기/순서 바꾸기마다 정확히 한 번 · 같은 값은 안 보냄', async () => {
    const mem = new MemStorage();
    const store = countingStore(createWatchlistStore({ storage: () => mem }));
    store.add('NVDA', 'test', 5);
    store.add('MU', 'test', 5);
    const plugin = new FakePlugin();
    let loc: WlLocale = 'ko';
    const sync = createWidgetSync({ plugin: () => plugin, store: () => store, locale: () => loc, defer: immediate, now: () => 1 });
    assert.equal(await sync.start(), true);
    await sync.idle();
    assert.equal(store.subs, 1);
    assert.equal(plugin.calls.length, 1, '시작 1회');
    assert.deepEqual(plugin.calls[0].tickers, ['NVDA', 'MU']);
    assert.equal(plugin.calls[0].names.NVDA, '엔비디아');

    store.add('AAPL', 'test', 5); await sync.idle();
    assert.equal(plugin.calls.length, 2);
    assert.deepEqual(plugin.calls[1].tickers, ['NVDA', 'MU', 'AAPL']);

    store.add('AAPL', 'test', 5); await sync.idle();           // 이미 있음 — 저장소가 알리지도 않는다
    assert.equal(plugin.calls.length, 2);

    sync.refresh(); await sync.idle();                          // 같은 값으로 새로 고침 — 보내지 않는다
    assert.equal(plugin.calls.length, 2, '중복 억제');

    store.move(2, 0); await sync.idle();
    assert.equal(plugin.calls.length, 3);
    assert.deepEqual(plugin.calls[2].tickers, ['AAPL', 'NVDA', 'MU']);

    store.remove('NVDA'); await sync.idle();
    assert.equal(plugin.calls.length, 4);
    assert.deepEqual(plugin.calls[3].tickers, ['AAPL', 'MU']);

    loc = 'ja'; sync.refresh(); await sync.idle();              // 언어가 바뀌면 한 번(이름도 그 언어)
    assert.equal(plugin.calls.length, 5);
    assert.equal(plugin.calls[4].locale, 'ja');
    assert.equal(plugin.calls[4].names.AAPL, 'アップル');

    sync.refresh(); await sync.idle();
    assert.equal(plugin.calls.length, 5);

    sync.stop();
    assert.equal(store.subs, 0);
    store.add('TSLA', 'test', 5); await sync.idle();
    assert.equal(plugin.calls.length, 5, '멈춘 뒤엔 보내지 않는다');
  });

  await ta('Capacitor 프록시(모든 속성이 함수 = thenable)여도 멈추지 않고 보낸다 — 9/30 안드로이드 실기에서 찾은 멈춤', async () => {
    const store = createWatchlistStore({ storage: () => new MemStorage() });
    store.add('NVDA', 'test', 5);
    const calls: { method: string; arg: unknown }[] = [];
    // registerPlugin 이 돌려주는 모양: 알 수 없는 속성(then 포함)마다 «네이티브 메서드 호출» 함수를 돌려준다
    const proxy = new Proxy({}, {
      get(_t, prop) {
        return (arg: unknown) => {
          calls.push({ method: String(prop), arg });
          return prop === 'setWatchlist' || prop === 'setLogos'
            ? Promise.resolve({})
            : new Promise(() => {});   // 네이티브에 없는 메서드(then) — 끝나지 않는다
        };
      },
    }) as unknown as WidgetBridgePlugin;
    const sync = createWidgetSync({ plugin: () => proxy, store: () => store, locale: () => 'en', defer: immediate });
    const started = await Promise.race([sync.start(), new Promise<string>((r) => setTimeout(() => r('HANG'), 1500))]);
    assert.equal(started, true, '시작이 멈추면 안 된다');
    await sync.idle();
    assert.ok(calls.some((c) => c.method === 'setWatchlist'), 'setWatchlist 가 불려야 한다');
    assert.ok(!calls.some((c) => c.method === 'then'), '프록시의 then 을 부르면 안 된다');
    sync.stop();
  });

  await ta('같은 틱의 연속 변경은 마지막 모양 한 번으로', async () => {
    const store = createWatchlistStore({ storage: () => new MemStorage() });
    const plugin = new FakePlugin();
    const queue: (() => void)[] = [];
    const sync = createWidgetSync({ plugin: () => plugin, store: () => store, locale: () => 'en', defer: (fn) => queue.push(fn) });
    await sync.start(); await sync.idle();
    assert.equal(plugin.calls.length, 1);
    store.add('A', 't', 5); store.add('B', 't', 5); store.add('C', 't', 5);
    assert.equal(queue.length, 1, '미룬 일은 하나');
    queue.shift()!();
    await sync.idle();
    assert.equal(plugin.calls.length, 2);
    assert.deepEqual(plugin.calls[1].tickers, ['A', 'B', 'C']);
  });

  await ta('미구현 거절 뒤로는 부르지 않는다 · 일반 실패는 다음 변경에 다시 보낸다', async () => {
    const store = createWatchlistStore({ storage: () => new MemStorage() });
    const plugin = new FakePlugin();
    const sync = createWidgetSync({ plugin: () => plugin, store: () => store, locale: () => 'en', defer: immediate });
    plugin.failNext = new Error('network');
    await sync.start(); await sync.idle();
    assert.equal(plugin.calls.length, 0);
    sync.refresh(); await sync.idle();                          // 실패한 값은 «보낸 것»으로 치지 않는다
    assert.equal(plugin.calls.length, 1);

    const p2 = new FakePlugin();
    const s2 = createWidgetSync({ plugin: () => p2, store: () => store, locale: () => 'en', defer: immediate });
    p2.failNext = Object.assign(new Error('"WidgetBridge" plugin is not implemented on ios'), { code: 'UNIMPLEMENTED' });
    await s2.start(); await s2.idle();
    store.add('Z', 't', 5); await s2.idle();
    sync.stop();
    assert.equal(p2.calls.length, 0, '미구현이면 더 부르지 않는다');
  });

  await ta('로고: 목록 전송 뒤 앞 12종목만 · 실패 종목 건너뜀 · 7일 안엔 다시 안 보냄', async () => {
    const mem = new MemStorage();
    const store = createWatchlistStore({ storage: () => mem });
    for (let i = 0; i < 14; i++) store.add(`K${String.fromCharCode(65 + i)}`, 't', MAX_ITEMS);
    const plugin = new FakePlugin();
    const logoStore = new MemStorage();
    let clock = 1_000;
    const asked: string[] = [];
    const sync = createWidgetSync({
      plugin: () => plugin, store: () => store, locale: () => 'en', defer: immediate, now: () => clock,
      storage: () => logoStore,
      rasterizeLogo: async (x) => { asked.push(x); return x === 'KB' ? null : `png-${x}`; },
    });
    await sync.start(); await sync.idle();
    assert.equal(asked.length, WIDGET_LOGO_MAX);
    assert.equal(plugin.logoCalls.length, 1);
    assert.equal(Object.keys(plugin.logoCalls[0]).length, WIDGET_LOGO_MAX - 1);
    assert.equal(plugin.logoCalls[0].KA, 'png-KA');
    assert.ok(!('KB' in plugin.logoCalls[0]) && !('KM' in plugin.logoCalls[0]));

    // 순서가 바뀌어 KM 이 앞 12 안으로 — 그 종목과 실패했던 KB 만 다시 묻는다
    store.move(12, 0); await sync.idle();
    assert.deepEqual(asked.slice(WIDGET_LOGO_MAX).sort(), ['KB', 'KM']);
    assert.equal(plugin.logoCalls.length, 2);
    assert.deepEqual(Object.keys(plugin.logoCalls[1]), ['KM']);

    // 7일이 지나면 다시
    clock += WIDGET_LOGO_TTL_MS + 1;
    store.move(0, 1); await sync.idle();
    assert.equal(plugin.logoCalls.length, 3);
    assert.equal(Object.keys(plugin.logoCalls[2]).length, WIDGET_LOGO_MAX - 1);
  });

  // ── 4. 딥링크 처리기 ──
  t('딥링크: 이동 1회 · 같은 주소 연속(보존 이벤트 + launch)은 한 번 · 재로드 때 launch 재이동 없음', () => {
    const session = new MemStorage();
    const moves: string[] = [];
    let clock = 0;
    let rechecks = 0;
    const mk = () => createWidgetLinkHandler({
      locale: () => 'ko', navigate: (p) => moves.push(p), session: () => session, now: () => clock,
      justLoaded: () => true, recheck: () => { rechecks++; },
    });
    const h = mk();
    assert.equal(h.open('signumhq-app://ticker/NVDA', 'event'), true);
    assert.equal(h.open('signumhq-app://ticker/NVDA', 'launch'), false, '같은 주소 연속');
    assert.deepEqual(moves, ['/ko/app-view/flow?t=NVDA&from=widget']);
    assert.equal(rechecks, 1, '콜드 스타트는 한 번 다시 본다');

    // 웹뷰가 다시 불렸다(같은 세션) — getLaunchUrl 이 같은 값을 줘도 이동하지 않는다
    clock += 60_000;
    const h2 = mk();
    assert.equal(h2.open('signumhq-app://ticker/NVDA', 'launch'), false);
    // 그러나 사용자가 위젯을 다시 누르면(이벤트) 이동한다
    assert.equal(h2.open('signumhq-app://ticker/NVDA', 'event'), true);
    assert.equal(h2.open('signumhq-app://watchlist', 'event'), true);
    assert.equal(h2.open('https://evil.example/x', 'event'), false);
    assert.equal(h2.open('signumhq-app://ticker/..', 'event'), false);
    assert.deepEqual(moves, ['/ko/app-view/flow?t=NVDA&from=widget', '/ko/app-view/flow?t=NVDA&from=widget', '/ko/app-view/watchlist']);
  });

  t('딥링크: 저장소가 막혀도(사생활 모드) 던지지 않고 이동한다', () => {
    const moves: string[] = [];
    const h = createWidgetLinkHandler({
      locale: () => 'en', navigate: (p) => moves.push(p),
      session: () => { throw new Error('SecurityError'); },
    });
    assert.equal(h.open('signumhq-app://ticker/TSLA', 'launch'), true);
    assert.deepEqual(moves, ['/en/app-view/flow?t=TSLA&from=widget']);
  });

  console.log(`\n${n}개 통과`);
}

main().catch((e) => { console.error(e); process.exit(1); });
