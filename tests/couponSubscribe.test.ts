/**
 * «쿠폰 → 구독 → PRO» 흐름(2026-10-06) — 안드로이드 «🎟 쿠폰 코드 입력»이 Play 코드 사용 화면 대신 앱 안 구독 결제 창으로 가는지,
 *   [계속] 뒤 순서(계측·구매·PRO 알림·다시 읽기·취소·실패) · 복귀 때 밖-구매 동기화(10분 1회·PRO 면 안 함·결제 창 중엔 안 함) ·
 *   안내 문구(한·영·일 «구독» 단계·가격은 스토어 문자열·무료 일수는 Play 프로모션 기간에만) · 쿠폰 화면 안드로이드판 «② 구독» 단계.
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/couponSubscribe.test.ts
 *
 * 번호는 전부 «가짜»다 — 진짜 Play·애플 일회용 번호·맞춤 코드 값은 저장소 어디에도 쓰지 않는다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';

// ── @capacitor/core 를 «안드로이드 앱»으로 가로챈다(redeem.ts 의 platformOf 는 부를 때 require 한다) ──
let capPlatform: 'android' | 'ios' | 'web' = 'android';
const capPath = require.resolve('@capacitor/core');
require.cache[capPath] = {
  id: capPath, filename: capPath, loaded: true,
  exports: { Capacitor: { isNativePlatform: () => capPlatform !== 'web', getPlatform: () => capPlatform } },
} as unknown as Module;

// 브라우저 흉내(최소) — 안내 시트 상태가 쓰는 document.activeElement · 화면 언어(경로)
const g = globalThis as any;
const opened: string[] = [];
g.window = { location: { pathname: '/ja/app-view/settings', href: 'https://www.signumhq.com/ja/app-view/settings', hostname: 'www.signumhq.com', search: '' }, open: (u: string) => { opened.push(u); return null; } };
g.document = { activeElement: null, body: {}, addEventListener: () => {}, visibilityState: 'visible' };

import { couponGuide, couponGuideCopy, runCouponPurchase, freeDaysNow, PLAY_FREE_DAYS, toCgLocale } from '../src/lib/app/couponGuide';
import { openRedeem, refreshProAfterRedeem, redeemIsAndroid } from '../src/lib/app/redeem';
import { foregroundProSync, shouldForegroundSync, FOREGROUND_SYNC_MIN_GAP_MS } from '../src/lib/app/foregroundProSync';
import { PLAY_PROMO_END } from '../src/lib/marketing/coupon';
import { couponHtml } from '../src/lib/marketing/couponHtml';
import { FUNNEL_STAGES } from '../src/lib/app/funnelSchema';

const ROOT = path.join(__dirname, '..');
const src = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const textOf = (html: string) => html.replace(/<wbr>/g, '').replace(/<[^>]+>/g, '');

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };

(async () => {
  const BEFORE = Date.parse('2026-10-06T00:00:00Z');
  console.log('━━━ 1. 안내 문구(한·영·일) ━━━');
  await t('세 언어 모두 3단계 · 마지막 단계 = «구독»(구글 결제 창 버튼) · 둘째 단계 = 결제 수단 → 코드 사용', () => {
    const ko = couponGuideCopy('ko', BEFORE), en = couponGuideCopy('en', BEFORE), ja = couponGuideCopy('ja', BEFORE);
    assert.equal(ko.steps.length, 3); assert.equal(en.steps.length, 3); assert.equal(ja.steps.length, 3);
    assert.ok(ko.steps[2].includes('«구독»') && en.steps[2].includes('“Subscribe”') && ja.steps[2].includes('「定期購入」'));
    assert.ok(ko.steps[1].includes('결제 수단') && ko.steps[1].includes('«코드 사용»'));
    assert.ok(en.steps[1].includes('payment method') && en.steps[1].includes('“Redeem code”'));
    assert.ok(ja.steps[1].includes('お支払い方法') && ja.steps[1].includes('「コードを利用」'));
    assert.ok(ko.steps[0].includes('[계속]') && ko.cta === '계속' && en.cta === 'Continue' && ja.cta === '続ける');
    // 요점(대표 10/6): «구독»까지 해야 PRO
    assert.ok(ko.lede.includes('«구독»까지 눌러야 PRO가 켜집니다') && en.lede.includes('PRO starts only after you tap “Subscribe”') && ja.lede.includes('「定期購入」まで押すとPROが有効になります'));
  });
  await t('무료·가격·해지 고지: 첫 30일 0원 · 이후 월 «스토어 가격» 자동 갱신 · 30일 안에 해지하면 0원 · 해지 위치', () => {
    const ko = couponGuideCopy('ko', BEFORE), en = couponGuideCopy('en', BEFORE), ja = couponGuideCopy('ja', BEFORE);
    assert.equal(ko.freeHead, '첫 30일 0원'); assert.equal(en.freeHead, 'First 30 days free'); assert.equal(ja.freeHead, '最初の30日間0円');
    assert.equal(ko.after('₩11,900'), '이후 월 ₩11,900 자동 갱신');
    assert.equal(en.after('$9.99'), 'then $9.99/mo, auto-renews');
    assert.equal(ja.after('¥1,280'), '以降は月額¥1,280で自動更新');
    assert.ok(ko.fine.startsWith('30일 안에 해지하면 0원') && ko.fine.includes('Play 스토어 → 결제 및 정기 결제'));
    assert.ok(en.fine.startsWith('Cancel within 30 days and pay nothing') && ja.fine.startsWith('30日以内に解約すれば0円'));
    for (const c of [ko, en, ja]) assert.ok(!/[₩¥$]\s?\d/.test(c.lede + c.steps.join('') + c.freeHead + c.fine + c.saved), '가격 숫자를 문구에 박지 않는다(스토어 문자열만)');
  });
  await t('무료 일수는 Play 프로모션 기간에만(10/31 00:00 GMT 전) — 뒤엔 일수 없이 «무료 기간»', () => {
    assert.equal(PLAY_FREE_DAYS, 30);
    assert.equal(freeDaysNow(PLAY_PROMO_END - 1), 30); assert.equal(freeDaysNow(PLAY_PROMO_END), null);
    const ko = couponGuideCopy('ko', PLAY_PROMO_END), en = couponGuideCopy('en', PLAY_PROMO_END);
    assert.ok(!/30/.test(ko.lede + ko.steps.join('') + ko.freeHead + ko.fine + ko.settingsSub));
    assert.ok(ko.steps[2].includes('«구독»') && en.steps[2].includes('“Subscribe”'), '«구독» 단계는 그대로');
  });
  await t('설정 행 아래 한 줄(안드로이드) — «결제 창에서 코드 입력 → 구독»', () => {
    assert.equal(couponGuideCopy('ko', BEFORE).settingsSub, '결제 창에서 코드 입력 → «구독» · 첫 30일 0원');
    assert.equal(couponGuideCopy('en', BEFORE).settingsSub, 'Enter it at checkout → “Subscribe” · first 30 days free');
    assert.equal(couponGuideCopy('ja', BEFORE).settingsSub, '購入画面でコード入力 →「定期購入」・最初の30日間0円');
    assert.equal(toCgLocale('de'), 'en'); assert.equal(toCgLocale(null), 'en');
  });

  console.log('━━━ 2. 안드로이드 «쿠폰 코드 입력» = 안내 시트(Play 코드 사용 화면을 열지 않는다) ━━━');
  await t('안드 앱: openRedeem → «guide» · 시트 상태(출처·언어) · Play 주소로 이동·새 탭 0', async () => {
    capPlatform = 'android';
    const seen: number[] = [];
    const off = couponGuide.subscribe(() => seen.push(1));
    const r = await openRedeem('settings', 'ko');
    assert.equal(r, 'guide');
    const s = couponGuide.getSnapshot();
    assert.ok(s && s.src === 'settings' && s.locale === 'ko' && s.id > 0);
    assert.equal(seen.length, 1);
    assert.deepEqual(opened, [], 'window.open 없음');
    assert.equal(g.window.location.href, 'https://www.signumhq.com/ja/app-view/settings', '웹뷰를 play.google.com/redeem 으로 보내지 않는다');
    couponGuide.close(s!.id + 999); assert.ok(couponGuide.getSnapshot(), '다른 id 로는 안 닫힌다');
    couponGuide.close(s!.id); assert.equal(couponGuide.getSnapshot(), null);
    off();
    assert.equal(redeemIsAndroid(), true);
  });
  await t('언어를 안 넘기면 화면 경로의 언어(/ja/app-view/…)', async () => {
    const r = await openRedeem('wl_limit');
    assert.equal(r, 'guide');
    assert.equal(couponGuide.getSnapshot()!.locale, 'ja');
    couponGuide.close();
  });

  console.log('━━━ 3. [계속] 뒤 순서 ━━━');
  const flow = (buy: () => Promise<{ ok: boolean; isPro: boolean; cancelled?: boolean; error?: string }>, recheck = async () => false) => {
    const log: string[] = [];
    return { log, deps: {
      purchase: async () => { log.push('purchase'); return buy(); },
      recheck: async () => { log.push('recheck'); return recheck(); },
      notifyPro: () => { log.push('notify'); },
      track: (st: string) => { log.push(st); },
    } };
  };
  await t('구매 → PRO: code_cta → 구매 → 공용 상태 알림 → code_pro', async () => {
    const f = flow(async () => ({ ok: true, isPro: true }));
    assert.equal(await runCouponPurchase(f.deps as any), 'pro');
    assert.deepEqual(f.log, ['code_cta', 'purchase', 'notify', 'code_pro']);
  });
  await t('결제는 됐는데 권한이 아직(noent) → 다시 읽기 → PRO 면 알림·code_pro / 끝까지 아니면 pending(알림 없음)', async () => {
    const a = flow(async () => ({ ok: true, isPro: false }), async () => true);
    assert.equal(await runCouponPurchase(a.deps as any), 'pro');
    assert.deepEqual(a.log, ['code_cta', 'purchase', 'recheck', 'notify', 'code_pro']);
    const b = flow(async () => ({ ok: true, isPro: false }), async () => false);
    assert.equal(await runCouponPurchase(b.deps as any), 'pending');
    assert.deepEqual(b.log, ['code_cta', 'purchase', 'recheck']);
  });
  await t('취소 = 조용히(cancelled) · 실패 = error · 구매가 던져도 error · 어느 쪽도 PRO 알림 없음', async () => {
    const c = flow(async () => ({ ok: false, isPro: false, cancelled: true }));
    assert.equal(await runCouponPurchase(c.deps as any), 'cancelled'); assert.deepEqual(c.log, ['code_cta', 'purchase']);
    const e = flow(async () => ({ ok: false, isPro: false, error: 'iap_unavailable' }));
    assert.equal(await runCouponPurchase(e.deps as any), 'error'); assert.deepEqual(e.log, ['code_cta', 'purchase']);
    const x = flow(async () => { throw new Error('boom'); });
    assert.equal(await runCouponPurchase(x.deps as any), 'error'); assert.ok(!x.log.includes('notify'));
  });
  await t('다시 읽기 = refreshProAfterRedeem(«sheet») 순서 — 즉시·3초·8초, syncPurchases 없음', async () => {
    const log: string[] = []; let c = 0;
    const ok = await refreshProAfterRedeem('sheet', {
      check: async () => { log.push('check'); return ++c >= 3; }, sync: async () => { log.push('sync'); }, wait: async (ms) => { log.push(`wait${ms}`); },
    });
    assert.equal(ok, true); assert.deepEqual(log, ['check', 'wait3000', 'check', 'wait8000', 'check']);
  });
  await t('퍼널 단계 code_cta 는 닫힌 목록 안(code_open 과 code_pro 사이)', () => {
    const i = FUNNEL_STAGES.indexOf('code_cta' as any);
    assert.ok(i > 0 && FUNNEL_STAGES[i - 1] === 'code_open' && FUNNEL_STAGES[i + 1] === 'code_pro');
  });

  console.log('━━━ 4. 복귀 때 밖-구매 동기화(안드로이드) ━━━');
  const T0 = Date.parse('2026-10-06T01:00:00Z');
  await t('간격 판정: 처음은 돈다 · 10분 안은 안 돈다 · 10분 지나면 돈다 · 도는 중·결제 창 중엔 안 돈다', () => {
    assert.equal(FOREGROUND_SYNC_MIN_GAP_MS, 600_000);
    assert.equal(shouldForegroundSync({ now: T0, lastAt: null, inflight: false, storeFlow: false }), true);
    assert.equal(shouldForegroundSync({ now: T0 + 599_999, lastAt: T0, inflight: false, storeFlow: false }), false);
    assert.equal(shouldForegroundSync({ now: T0 + 600_000, lastAt: T0, inflight: false, storeFlow: false }), true);
    assert.equal(shouldForegroundSync({ now: T0, lastAt: null, inflight: true, storeFlow: false }), false);
    assert.equal(shouldForegroundSync({ now: T0, lastAt: null, inflight: false, storeFlow: true }), false);
  });
  const fdeps = (o: { pro: boolean[]; storeFlow?: boolean; syncThrows?: boolean; now: () => number }) => {
    const log: string[] = []; let i = 0;
    return { log, deps: {
      isPro: async () => { const v = o.pro[Math.min(i, o.pro.length - 1)]; i++; log.push(`isPro:${v}`); return v; },
      sync: async () => { log.push('sync'); if (o.syncThrows) throw new Error('net'); },
      notifyPro: () => { log.push('notify'); },
      storeFlow: () => !!o.storeFlow,
      now: o.now,
    } };
  };
  await t('PRO 가 아니면 syncPurchases 한 번 → 다시 읽어 PRO 면 공용 상태에 알림 · 10분 안의 복귀는 건너뜀 · 10분 뒤 다시', async () => {
    let now = T0; const st = { lastAt: null as number | null, inflight: false };
    const a = fdeps({ pro: [false, true], now: () => now });
    assert.equal(await foregroundProSync(a.deps, st), 'synced_pro');
    assert.deepEqual(a.log, ['isPro:false', 'sync', 'isPro:true', 'notify']); assert.equal(st.lastAt, T0);
    now = T0 + 5 * 60_000;
    const b = fdeps({ pro: [false], now: () => now });
    assert.equal(await foregroundProSync(b.deps, st), 'skip'); assert.deepEqual(b.log, [], '10분 안 — getCustomerInfo 도 안 부른다');
    now = T0 + 10 * 60_000;
    const c = fdeps({ pro: [false, false], now: () => now });
    assert.equal(await foregroundProSync(c.deps, st), 'synced'); assert.deepEqual(c.log, ['isPro:false', 'sync', 'isPro:false']);
  });
  await t('이미 PRO 면 syncPurchases 를 부르지 않는다(간격 시계도 그대로)', async () => {
    const st = { lastAt: null as number | null, inflight: false };
    const a = fdeps({ pro: [true], now: () => T0 });
    assert.equal(await foregroundProSync(a.deps, st), 'already_pro'); assert.deepEqual(a.log, ['isPro:true']); assert.equal(st.lastAt, null);
  });
  await t('구글 결제 창이 떠 있는 중(앱 안 구매·복원 진행)엔 건너뜀 — 끝난 뒤 복귀에 돈다', async () => {
    const st = { lastAt: null as number | null, inflight: false };
    const a = fdeps({ pro: [false], storeFlow: true, now: () => T0 });
    assert.equal(await foregroundProSync(a.deps, st), 'skip'); assert.deepEqual(a.log, []); assert.equal(st.lastAt, null);
  });
  await t('동시에 두 번 울려도 한 번만(도는 중) · 동기화가 실패해도 시도로 센다(10분 안 재시도 없음)', async () => {
    const st = { lastAt: null as number | null, inflight: false };
    let release!: () => void; const gate = new Promise<void>((r) => { release = r; });
    const log: string[] = [];
    const deps = {
      isPro: async () => { log.push('isPro'); await gate; return false; },
      sync: async () => { log.push('sync'); }, notifyPro: () => {}, storeFlow: () => false, now: () => T0,
    };
    const p1 = foregroundProSync(deps, st);
    const r2 = await foregroundProSync(deps, st);
    assert.equal(r2, 'skip');
    release(); assert.equal(await p1, 'synced'); assert.equal(log.filter((x) => x === 'sync').length, 1);
    const st2 = { lastAt: null as number | null, inflight: false };
    const e = fdeps({ pro: [false], syncThrows: true, now: () => T0 });
    assert.equal(await foregroundProSync(e.deps, st2), 'error'); assert.equal(st2.inflight, false); assert.equal(st2.lastAt, T0);
    const e2 = fdeps({ pro: [false], now: () => T0 + 60_000 });
    assert.equal(await foregroundProSync(e2.deps, st2), 'skip');
  });

  console.log('━━━ 5. 쿠폰 화면 안드로이드판 — «② 구독» 단계 ━━━');
  const REDEEM = 'https://apps.apple.com/redeem?ctx=offercodes&id=6783130444&code=THREADSPRO';
  const PLAYI = 'https://play.google.com/store/apps/details?id=com.signumhq.app&referrer=utm_source%3Dthreads';
  await t('ko: ① Play 스토어에서 적용 → ② «구독»(30일 안에 해지하면 0원) → 구독 화면이 안 나오면 앱 안 경로 → 손입력(그다음 ②) 순서', () => {
    const h = couponHtml({ platform: 'android', lang: 'ko', fromTag: 'threads', code: 'THREADSPRO', appleRedeemUrl: REDEEM, playInstallUrl: PLAYI });
    const x = textOf(h);
    const i1 = x.indexOf('① Play 스토어에서 적용');
    const i2 = x.indexOf('② 이어서 «구독»을 눌러야 PRO가 시작됩니다 — 30일 안에 해지하면 0원');
    const i3 = x.indexOf('구독 화면이 안 나오면: SIGNUM HQ 앱 → 설정 → 🎟\u00a0쿠폰 코드 입력 → 계속 → «구독»');
    const i4 = x.indexOf('Play 스토어 → 결제 및 정기 결제 → 코드 사용에 직접 입력해도 됩니다(그다음 ②)');
    assert.ok(i1 > 0 && i2 > i1 && i3 > i2 && i4 > i3, `${i1} ${i2} ${i3} ${i4}`);
    assert.ok(h.includes('<p class="step2" id="step2">'));
    assert.ok(x.includes('30일 무료 뒤 월 ₩11,900 자동 갱신 · 언제든 해지'), '«무료» 문장 안 자동 갱신 가격은 그대로');
    assert.ok(!/[A-Z0-9]{23}/.test(h), '번호는 서버 HTML 에 실리지 않는다');
  });
  await t('en·ja 도 같은 단계(“Subscribe” · 「定期購入」) · 앱 안 경로의 이름이 앱 설정 문구와 같다', () => {
    const en = textOf(couponHtml({ platform: 'android', lang: 'en', fromTag: 'x_us', code: 'XPRO', appleRedeemUrl: REDEEM, playInstallUrl: PLAYI }));
    assert.ok(en.includes('① Apply in Play Store') && en.includes('② Then tap “Subscribe” to start PRO — cancel within 30 days and pay nothing'));
    assert.ok(en.includes('No subscribe screen? SIGNUM HQ app → Settings → 🎟\u00a0Redeem a code → Continue → “Subscribe”'));
    const ja = textOf(couponHtml({ platform: 'android', lang: 'ja', fromTag: 'note', code: 'NOTEJP', appleRedeemUrl: REDEEM, playInstallUrl: PLAYI }));
    assert.ok(ja.includes('① Playストアで適用') && ja.includes('② 続けて「定期購入」を押すとPROが始まります — 30日以内に解約すれば0円'));
    assert.ok(ja.includes('購入画面が出ない場合: SIGNUM HQアプリ → 設定 → 🎟\u00a0クーポンコードを使う → 続ける →「定期購入」'));
    // 앱 문구와 같은 이름(설정 행 이름 · 시트 [계속])
    assert.ok(en.includes(couponGuideCopy('en').cta) && ja.includes(couponGuideCopy('ja').cta));
  });
  await t('아이폰 화면은 그대로(② 단계 없음 — 애플 창의 «사용» = 구독 시작)', () => {
    const h = couponHtml({ platform: 'ios', lang: 'ko', fromTag: 'threads', code: 'THREADSPRO', appleRedeemUrl: REDEEM, playInstallUrl: PLAYI });
    assert.ok(!h.includes('id="step2"') && h.includes('쿠폰 적용하고 무료로 시작') && h.includes('1개월 무료 뒤 월 ₩11,900 자동 갱신 · 언제든 해지'));
  });

  console.log('━━━ 6. 배선(소스) ━━━');
  await t('redeem.ts: 안드로이드는 안내 시트만 연다 — Play 코드 사용 화면으로 웹뷰를 보내는 코드 0 · restorePurchases 0', () => {
    const r = src('src/lib/app/redeem.ts');
    assert.ok(r.includes("couponGuide.open({ src, locale })") && r.includes("return 'guide'"));
    assert.ok(!r.includes('openViaSystem') && !/location\.href\s*=/.test(r), 'Play 로 보내는 이동 없음');
    assert.ok(!/restorePurchases\s*\(/.test(r.replace(/\/\/.*$/gm, '')));
  });
  await t('시트: 기존 구매 경로(useProStatus().purchase(«monthly»)) · noent 다시 읽기(«sheet») · 공용 상태 알림 · 복원 호출 0', () => {
    const s = src('src/components/app/CouponGuideSheet.tsx');
    assert.ok(s.includes("purchase('monthly', req.src)") && s.includes("refreshProAfterRedeem('sheet')") && s.includes('notifyProPurchased(true)'));
    assert.ok(s.includes('useBackToClose(true, onClose)') && s.includes('useLayer(true, onClose, sheetRef)'));
    // 배너: 설정 화면(자체 setBannerSuppressed — 훅 개수 밖)에선 훅을 걸지 않는다 — 닫힐 때 설정 위로 배너가 되살아나지 않게
    assert.ok(s.includes('useBannerSuppression(!onSettings)') && /\\\/app-view\\\/settings/.test(s));
    assert.ok(!/restore(Purchases)?\s*\(/.test(s.replace(/\/\/.*$/gm, '')));
    assert.ok(src('src/components/app/CouponGuideHost.tsx').includes("import('./CouponGuideSheet')"), '열릴 때만 불러온다');
    assert.ok(src('src/app/[locale]/app-view/layout.tsx').includes('<CouponGuideHost />'), '앱 레이아웃에 하나');
  });
  await t('복귀 동기화: 안드로이드에서만 시작(NativeAppProvider) · app:resume · syncPurchases(복원 아님) · 결제 창 표시 플래그(purchasePro·restorePro)', () => {
    const nap = src('src/components/native/NativeAppProvider.tsx');
    assert.ok(/if \(_platform === 'android'\) \{\s*import\('@\/lib\/app\/foregroundProSync'\)\.then\(\(m\) => m\.startForegroundProSync\(\)\)/.test(nap));
    const f = src('src/lib/app/foregroundProSync.ts');
    assert.ok(f.includes("addEventListener('app:resume'") && f.includes('Purchases.syncPurchases()') && f.includes("getPlatform() === 'android'"));
    assert.ok(!/restorePurchases\s*\(/.test(f.replace(/\/\/.*$/gm, '').replace(/«[^»]*»/g, '')));
    const rc = src('src/services/revenueCat.ts');
    assert.equal((rc.match(/storeFlows \+= 1;/g) || []).length, 2, 'purchasePro·restorePro 둘 다');
    assert.equal((rc.match(/storeFlows = Math\.max\(0, storeFlows - 1\);/g) || []).length, 2, 'finally 에서 내린다');
  });
  await t('설정 페이월 안의 클릭이 설정 바깥막(handleClose)까지 올라가지 않는다 — 쿠폰 안내가 화면 이동으로 닫히던 결함(9/2~)', () => {
    const st = src('src/app/[locale]/app-view/settings/page.tsx');
    assert.ok(/<div onClick=\{\(e\) => e\.stopPropagation\(\)\}>\s*<ProPaywall locale=\{locale\} src="settings"/.test(st));
  });
  await t('입구 셋 모두 언어를 넘긴다(설정·작은 링크·«내 종목» 시트)', () => {
    assert.ok(src('src/app/[locale]/app-view/settings/page.tsx').includes("openRedeem('settings', locale)"));
    assert.ok(src('src/components/app/RedeemCodeLink.tsx').includes('openRedeem(src, locale)'));
    assert.ok(src('src/components/app/watchlist/ProUpsellSheet.tsx').includes("openRedeem(mode === 'limit' ? 'wl_limit' : 'wl_upsell', loc)"));
  });

  console.log(`\n✅ couponSubscribe: ${n}건 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
