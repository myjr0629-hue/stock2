/**
 * 구독 퍼널·스마트링크 유입 계측 시험 — src/lib/app/funnel*.ts · src/lib/marketing/{referrer,clickRef}.ts · scripts/mkt-funnel.js
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/funnel.test.ts
 *
 * 지키는 것:
 *  1) 리퍼러 → 닫힌 분류(무엇이 와도 REF_BUCKETS 밖으로 안 나간다 — 키 공간이 무한히 늘지 않는다)
 *  2) 구매·복원 결과 → 단계·오류 코드(RevenueCat "11" → rc11 등)
 *  3) 새 키(fx:·fxp:·ref:·refp:)는 EC2 전용 — Upstash 복제·폴백 0 (redisClient 의 정책 함수로 직접 확인)
 *  4) 운영/프리뷰 칸 분리(프리뷰가 운영 숫자를 오염시키지 않는다)
 *  5) 읽기 스크립트의 닫힌 목록 = TS 정의
 *  6) 클라이언트: 웹은 보낸다 · 안드로이드 앱은 안 보낸다(Play 데이터 보안) · 핸들러로 잘못 들어온 값은 버린다 ·
 *     «내 종목» 시트 이벤트 연결(열림·PRO 시작), wl_purchase 는 옮기지 않는다(이중 계산 방지) · 식별자 없음
 */
import assert from 'node:assert/strict';
import { REF_BUCKETS, refBucketFromHost, refBucketFromUrl, isRefBucket } from '../src/lib/marketing/referrer';
import {
  FUNNEL_STAGES, FUNNEL_SRCS, FUNNEL_PLATFORMS, outcomeStage, normalizeVersion, normalizeCode, funnelNs, funnelKeys, isFunnelSrc,
} from '../src/lib/app/funnelSchema';
import { decideReplicate, shouldFallbackToUpstash } from '../src/services/redisClient';
import { refKey, refBucketFor, refDevice } from '../src/lib/marketing/clickRef';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const ta = async (name: string, fn: () => Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('━━━ 1. 리퍼러 분류 ━━━');
  t('주요 호스트', () => {
    const cases: Array<[string, string]> = [
      ['https://www.google.com/', 'google'], ['https://www.google.co.kr/', 'google'], ['https://www.google.co.jp/search?q=x', 'google'],
      ['android-app://com.google.android.googlequicksearchbox/', 'google'], ['https://gemini.google.com/app', 'ai'],
      ['https://play.google.com/store/apps/details?id=x', 'play'], ['https://apps.apple.com/us/app/id1', 'appstore'],
      ['https://chatgpt.com/', 'ai'], ['https://www.perplexity.ai/search/x', 'ai'],
      ['https://t.co/abc', 'x'], ['https://x.com/signumhq', 'x'], ['https://bsky.app/profile/x', 'bluesky'],
      ['https://l.facebook.com/l.php?u=x', 'facebook'], ['https://lnkd.in/abc', 'linkedin'], ['https://www.linkedin.com/feed/', 'linkedin'],
      ['https://m.search.naver.com/search.naver?query=x', 'naver'], ['https://blog.naver.com/x', 'naver'], ['https://search.daum.net/', 'daum'],
      ['https://news.hada.io/topic?id=1', 'geeknews'], ['https://news.ycombinator.com/', 'hackernews'], ['https://okky.kr/articles/1', 'okky'],
      ['https://note.com/x', 'note'], ['https://medium.com/@x', 'medium'], ['https://www.reddit.com/r/x', 'reddit'], ['https://out.reddit.com/x', 'reddit'],
      ['https://www.threads.net/@x', 'threads'], ['https://www.threads.com/@x', 'threads'], ['https://l.instagram.com/?u=x', 'instagram'],
      ['https://myjr0629-hue.github.io/options-market-structure-daily/', 'github'], ['https://huggingface.co/datasets/x', 'huggingface'],
      ['https://www.signumhq.com/en/flow/NVDA', 'self'], ['https://signumhq.com/', 'self'],
      ['', 'none'], ['   ', 'none'], ['not a url', 'other'], ['https://example.com/', 'other'], ['ftp://google.com/', 'other'],
      ['https://google.evil.com/', 'other'], ['https://notgoogle.com/', 'other'],
    ];
    for (const [u, want] of cases) assert.equal(refBucketFromUrl(u), want, u);
  });
  t('무엇이 와도 닫힌 목록 안(키 공간 고정)', () => {
    const junk = ['https://' + 'a'.repeat(300) + '.com', 'https://xn--80ak6aa92e.com/', 'https://[::1]/', 'javascript:alert(1)', 'data:text/html,x', '\u0000', 'https://.'];
    for (const u of junk) assert.ok(isRefBucket(refBucketFromUrl(u)), u);
    assert.equal(refBucketFromHost(null), 'none');
    assert.equal(new Set(REF_BUCKETS).size, REF_BUCKETS.length);
    for (const b of REF_BUCKETS) assert.match(b, /^[a-z_]{1,16}$/);
  });

  console.log('━━━ 2. 결과 → 단계 ━━━');
  t('구매', () => {
    assert.deepEqual(outcomeStage('buy', { ok: true, isPro: true }), { stage: 'buy_ok' });
    assert.deepEqual(outcomeStage('buy', { ok: true, isPro: false }), { stage: 'buy_ok', code: 'noent' });
    assert.deepEqual(outcomeStage('buy', { ok: false, isPro: false, cancelled: true }), { stage: 'buy_cancel' });
    assert.deepEqual(outcomeStage('buy', { ok: false, isPro: false, error: 'Invalid Play Store credentials', code: 'rc11' }), { stage: 'buy_err', code: 'rc11' });
    assert.deepEqual(outcomeStage('buy', { ok: false, isPro: false, error: 'iap_unavailable' }), { stage: 'buy_err', code: 'iap' });
    assert.deepEqual(outcomeStage('buy', { ok: false, isPro: false, error: 'no_offering' }), { stage: 'buy_err', code: 'nooffer' });
    assert.deepEqual(outcomeStage('buy', { ok: false, isPro: false, error: 'boom' }), { stage: 'buy_err', code: 'x' });
  });
  t('복원', () => {
    assert.deepEqual(outcomeStage('restore', { ok: true, isPro: true }), { stage: 'restore_ok' });
    assert.deepEqual(outcomeStage('restore', { ok: true, isPro: false }), { stage: 'restore_none' });
    assert.deepEqual(outcomeStage('restore', { ok: false, isPro: false, code: 'rc10' }), { stage: 'restore_err', code: 'rc10' });
  });
  t('버전·코드 정규화', () => {
    assert.equal(normalizeVersion('1.9.2'), '1.9.2'); assert.equal(normalizeVersion('2.0'), '2.0');
    assert.equal(normalizeVersion('1.9.2-beta'), 'na'); assert.equal(normalizeVersion(''), 'na'); assert.equal(normalizeVersion('1.2.3.4.5'), 'na');
    assert.equal(normalizeCode('rc11'), 'rc11'); assert.equal(normalizeCode('RC2'), 'rc2'); assert.equal(normalizeCode('rc123'), 'x');
    assert.equal(normalizeCode('drop table'), 'x'); assert.equal(normalizeCode('nooffer'), 'nooffer');
  });

  console.log('━━━ 3·4. 키 — EC2 전용·운영/프리뷰 분리 ━━━');
  t('운영 fx·ref / 프리뷰·로컬 fxp·refp', () => {
    assert.equal(funnelNs('production'), 'fx'); assert.equal(funnelNs('preview'), 'fxp'); assert.equal(funnelNs(undefined), 'fxp');
    assert.equal(refKey('sg', 'home', '2026-09-30', 'production'), 'ref:sg:home:2026-09-30');
    assert.equal(refKey('uc', 'home', '2026-09-30', 'preview'), 'refp:uc:home:2026-09-30');
    const k = funnelKeys('fx', '2026-09-30', 'open', 'settings', 'ios');
    assert.deepEqual(k, { main: 'fx:open:settings:ios:2026-09-30', ver: 'fx:v:2026-09-30', code: 'fx:c:2026-09-30' });
  });
  t('새 키는 Upstash 로 복제되지 않고(skip) 폴백 읽기도 없다', () => {
    const keys = ['fx:open:settings:ios:2026-09-30', 'fx:v:2026-09-30', 'fx:c:2026-09-30', 'fxp:cta:preview:web:2026-09-30',
      'ref:sg:home:2026-09-30', 'refp:wim:home:2026-09-30'];
    for (const k of keys) {
      assert.equal(decideReplicate(k, 60 * 60 * 24 * 45, true), 'skip', k);
      assert.equal(shouldFallbackToUpstash(k, true), false, k);
    }
    // 대조: 기존 클릭 카운터(mkt:)는 복제 대상 — 새 칸을 mkt: 로 쓰지 않은 이유
    assert.equal(decideReplicate('mkt:attr:hit:home:2026-09-30', 60 * 60 * 24 * 45, true), 'replicate');
  });
  t('스마트링크: ?ref= 가 닫힌 목록이면 우선, 아니면 Referer', () => {
    const req = (ref: string | null, referer: string | null) => ({
      nextUrl: { searchParams: new URLSearchParams(ref === null ? '' : `ref=${ref}`) },
      headers: { get: (h: string) => (h.toLowerCase() === 'referer' ? referer : null) },
    }) as any;
    assert.equal(refBucketFor(req('google', 'https://www.signumhq.com/en')), 'google');
    assert.equal(refBucketFor(req('none', 'https://www.signumhq.com/en')), 'none');
    assert.equal(refBucketFor(req('evil_value', 'https://bsky.app/')), 'bluesky');
    assert.equal(refBucketFor(req(null, 'https://t.co/x')), 'x');
    assert.equal(refBucketFor(req(null, null)), 'none');
    assert.equal(refDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)'), 'ios');
    assert.equal(refDevice('Mozilla/5.0 (Linux; Android 14)'), 'android');
    assert.equal(refDevice('Mozilla/5.0 (Macintosh)'), 'desktop');
  });

  console.log('━━━ 5. 읽기 스크립트 목록 ━━━');
  t('scripts/mkt-funnel.js 의 닫힌 목록 = funnelSchema.ts', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const r = require('../scripts/mkt-funnel.js');
    assert.deepEqual(r.STAGES, [...FUNNEL_STAGES]);
    assert.deepEqual(r.SRCS, [...FUNNEL_SRCS]);
    assert.deepEqual(r.PLATS, [...FUNNEL_PLATFORMS]);
  });

  console.log('━━━ 6. 클라이언트 전송 ━━━');
  const beacons: string[] = [];
  const g = globalThis as any;
  g.window = { Capacitor: undefined };
  Object.defineProperty(globalThis, 'navigator', { value: { sendBeacon: (u: string) => { beacons.push(u); return true; } }, configurable: true, writable: true });
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const wa = require('../src/lib/app/watchlistAnalytics');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const f = require('../src/lib/app/funnel');
  const q = (u: string) => Object.fromEntries(new URL('https://x' + u).searchParams);

  await ta('웹: 열림 → /api/funnel-hit 에 닫힌 값만(식별자 없음)', async () => {
    beacons.length = 0;
    f.trackFunnel('open', { src: 'preview' });
    await sleep(30);
    assert.equal(beacons.length, 1);
    assert.ok(beacons[0].startsWith('/api/funnel-hit?'));
    assert.deepEqual(q(beacons[0]), { st: 'open', s: 'preview', p: 'web', v: 'na' });
  });
  await ta('결과: 오류 코드가 붙는다(rc11)', async () => {
    beacons.length = 0;
    f.trackFunnelOutcome('buy', { ok: false, isPro: false, error: 'x', code: 'rc11' }, 'settings');
    await sleep(30);
    assert.deepEqual(q(beacons[0]), { st: 'buy_err', s: 'settings', p: 'web', v: 'na', c: 'rc11' });
  });
  await ta('핸들러로 잘못 들어온 값(클릭 이벤트 등)은 버리고 최근 출처를 쓴다', async () => {
    beacons.length = 0;
    f.noteFunnelSrc('dash_gate');
    f.trackFunnel('cta', { src: { type: 'click' } as any });
    await sleep(30);
    assert.equal(q(beacons[0]).s, 'dash_gate');
    assert.equal(isFunnelSrc({ type: 'click' }), false);
  });
  await ta('«내 종목» 연결: 한도 시트 열림·PRO 시작은 옮기고, wl_purchase 는 옮기지 않는다', async () => {
    beacons.length = 0;
    wa.trackWatchlist('wl_limit_sheet', { src: 'star', t: 'NVDA', count: 5 });
    wa.trackWatchlist('wl_cta', { sheet: 'limit', cta: 'pro_start' });
    wa.trackWatchlist('wl_purchase', { sheet: 'limit', ok: false, cancelled: true });
    wa.trackWatchlist('wl_cta', { sheet: 'alerts', cta: 'restore' });
    wa.trackWatchlist('wl_star_add', { src: 'row', t: 'AAPL', count: 3 });
    await sleep(30);
    assert.deepEqual(beacons.map((b) => [q(b).st, q(b).s]), [['open', 'wl_limit'], ['cta', 'wl_limit']]);
    assert.equal(f.currentFunnelSrc(), 'wl_upsell'); // 복원 버튼 → 결과가 이 출처로 세진다
    for (const b of beacons) {
      assert.ok(Object.keys(q(b)).every((k) => ['st', 's', 'p', 'v', 'c'].includes(k)), '닫힌 매개변수만: ' + b);
      assert.ok(!/NVDA|AAPL/.test(b), '종목은 싣지 않는다: ' + b);
    }
  });
  await ta('안드로이드 앱은 보내지 않는다(Play 데이터 보안 선언 전)', async () => {
    beacons.length = 0;
    g.window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
    f.trackFunnel('open', { src: 'settings' });
    f.trackFunnelOutcome('buy', { ok: true, isPro: true }, 'settings');
    await sleep(50);
    assert.equal(f.FUNNEL_SEND_ANDROID, false);
    assert.equal(beacons.length, 0);
  });
  await ta('iOS 앱은 보낸다 — 버전을 못 재면 지어내지 않고 na(1.5초 안에)', async () => {
    beacons.length = 0;
    g.window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };
    f.trackFunnel('open', { src: 'settings' });
    await sleep(1800);
    assert.equal(beacons.length, 1);
    const v = q(beacons[0]);
    assert.equal(v.p, 'ios'); assert.equal(v.st, 'open'); assert.ok(v.v === 'na' || /^\d/.test(v.v));
  });

  console.log(`\n✅ funnel: ${n}건 통과`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
