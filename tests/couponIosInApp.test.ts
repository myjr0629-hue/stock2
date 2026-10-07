/**
 * 아이폰 «앱 안 브라우저» 쿠폰 화면 — 적용 단추를 눌렀는데 App Store 로 안 넘어가는 경우를 재고(apply_stay) 안내(2026-10-07, 브랜치 fix/coupon-ios-inapp-stuck)
 *   · 판정 isIosInAppBrowser(실제 UA 예) · 쿠폰 화면 HTML(앱 안 변형만 안내·타이머 — 일반 화면은 «글자 그대로» 예전과 같다) · 닫힌 단추 목록 · /app 라우트가 앱 가족 필드를 센다
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/couponIosInApp.test.ts
 */
import assert from 'node:assert/strict';
import Module from 'node:module';

// ── next/server 의 after 를 가로챈다 + redisClient 를 메모리로 바꾼다(라우트 import 보다 먼저) ──
const afterCalls: Array<() => unknown> = [];
const nsPath = require.resolve('next/server');
const realNs = require(nsPath);
require.cache[nsPath] = { id: nsPath, filename: nsPath, loaded: true, exports: { ...realNs, after: (fn: () => unknown) => { afterCalls.push(fn); } } } as unknown as Module;
const store = new Map<string, unknown>();
const rcPath = require.resolve('../src/services/redisClient');
require.cache[rcPath] = {
  id: rcPath, filename: rcPath, loaded: true,
  exports: { getFromCache: async (k: string) => (store.has(k) ? store.get(k) : null), setInCache: async (k: string, v: unknown) => { store.set(k, JSON.parse(JSON.stringify(v))); return true; } },
} as unknown as Module;

import { NextRequest } from 'next/server';
import { isIosInAppBrowser, IOS_STAY_CHECK_MS } from '../src/lib/marketing/iosInApp';
import { couponHtml } from '../src/lib/marketing/couponHtml';
import { COUPON_TAPS, isCouponTap, iosStayHintFlag } from '../src/lib/marketing/coupon';
const appRoute = require('../src/app/app/route');
const eventRoute = require('../src/app/api/coupon/event/route');

const IW = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const UA = {
  safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1',
  firefoxIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/130.0 Mobile/15E148 Safari/605.1.15',
  threads: `${IW} Barcelona 352.0.0.25.86 (iPhone15,2; iOS 18_0; ko_KR)`,
  instagram: `${IW} Instagram 352.0.0.25.86 (iPhone15,2; iOS 18_0; ko_KR; ko; scale=3.00; 1179x2556; 652000000)`,
  facebook: `${IW} [FBAN/FBIOS;FBAV/485.0.0.40.109;FBBV/650000000;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.0;FBSS/3;FBID/phone;FBLC/ko_KR;FBOP/5]`,
  kakao: `${IW} KAKAOTALK 10.8.5`,
  naver: `${IW} NAVER(inapp; search; 2000; 12.10.3; 15PRO)`,
  line: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1 Line/14.5.0',
  bareWebView: IW,
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.100 Mobile Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
};
const REDEEM = 'https://apps.apple.com/redeem?ctx=offercodes&id=6783130444&code=THREADSPRO';
const PLAYI = 'https://play.google.com/store/apps/details?id=com.signumhq.app&referrer=utm_source%3Dthreads';
const base = { platform: 'ios' as const, lang: 'ko' as const, fromTag: 'threads', code: 'THREADSPRO', appleRedeemUrl: REDEEM, playInstallUrl: PLAYI };

let pass = 0, fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try { await fn(); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n    ', (e as Error).message); }
}
const textOf = (h: string) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const flush = async () => { const fns = afterCalls.splice(0); await Promise.all(fns.map((f) => f())); };
const get = (qs: string, ua: string) => appRoute.GET(new NextRequest(`https://www.signumhq.com/app?${qs}`, {
  headers: { 'user-agent': ua, 'accept-language': 'ko-KR,ko;q=0.9', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', 'sec-fetch-site': 'cross-site' },
}));

(async () => {
  console.log('━━━ 1. 판정(실제 UA 예) ━━━');
  await t('앱 안(true): Threads·Instagram·Facebook·카톡·네이버·LINE(Safari 표지 있어도)·표지 없는 WKWebView', () => {
    for (const k of ['threads', 'instagram', 'facebook', 'kakao', 'naver', 'line', 'bareWebView'] as const) assert.equal(isIosInAppBrowser(UA[k]), true, k);
  });
  await t('앱 안 아님(false): Safari·iOS Chrome·iOS Firefox·안드로이드·맥', () => {
    for (const k of ['safari', 'chromeIos', 'firefoxIos', 'androidChrome', 'mac'] as const) assert.equal(isIosInAppBrowser(UA[k]), false, k);
    assert.equal(isIosInAppBrowser(''), false);
  });

  console.log('━━━ 2. 쿠폰 화면 HTML ━━━');
  await t('일반 아이폰 화면은 «글자 그대로» 예전과 같다(옵션 없음 = false = 앱 안 아님) — 안내·타이머·apply_stay 0', () => {
    const a = couponHtml(base); const b = couponHtml({ ...base, iosInApp: false });
    assert.equal(a, b);
    assert.ok(!a.includes('apply_stay') && !a.includes('id="stay"') && !a.includes('setTimeout'));
    assert.ok(a.includes("document.getElementById('go').addEventListener('click',function(){sgBeacon('apply')});"), '예전 클릭 처리 그대로');
  });
  await t('앱 안 변형(기본 = 측정만): 화면엔 아무 줄도 안 늘고, 적용 클릭 2.5초 뒤에도 화면이 보이면 apply_stay 비콘만', () => {
    const h = couponHtml({ ...base, iosInApp: true });
    assert.ok(!h.includes('id="stay"') && !h.includes('앱스토어가 안 열리면'), '보이는 안내 없음');
    assert.ok(h.includes("sgBeacon('apply');setTimeout(function(){if(!document.hidden){sgBeacon('apply_stay');}},2500)"), '타이머 + 비콘만');
    assert.ok(!h.includes('s.hidden=false'));
    assert.ok(IOS_STAY_CHECK_MS === 2500);
    // 일반 화면과의 차이는 클릭 스크립트 한 줄뿐(보이는 부분은 같다)
    const plain = couponHtml(base);
    assert.equal(h.replace(/sgBeacon\('apply'\);setTimeout[^\n]*?2500\)\}\);/, "sgBeacon('apply')});"), plain);
  });
  await t('앱 안 변형 + 안내 켬(iosStayHint): 숨은 줄 + 2.5초 뒤 보임 · 나머지는 같다', () => {
    const h = couponHtml({ ...base, iosInApp: true, iosStayHint: true });
    assert.ok(h.includes('id="stay"') && /id="stay"[^>]*\bhidden\b/.test(h), '처음엔 숨김');
    assert.ok(h.includes("sgBeacon('apply');setTimeout(function(){if(!document.hidden){sgBeacon('apply_stay');var s=document.getElementById('stay');if(s)s.hidden=false}},2500)"), '타이머');
    assert.ok(h.includes('앱스토어가 안 열리면') && h.includes('Safari로 열기'));
    assert.ok(h.includes(`href="${REDEEM.replace(/&/g, '&amp;')}">쿠폰 적용하고 무료로 시작</a>`) && h.includes('1개월 무료 뒤 월 ₩11,900 자동 갱신 · 언제든 해지'));
    assert.ok(h.length < 12_500, `가볍게(${h.length}B)`);
    // iosStayHint 만 있고 iosInApp 이 아니면 아무 것도 안 바뀐다
    assert.equal(couponHtml({ ...base, iosStayHint: true }), couponHtml(base));
  });
  await t('플래그: COUPON_IOS_STAY_HINT 는 정확히 "1" 일 때만 켜짐(기본 꺼짐)', () => {
    assert.equal(iosStayHintFlag(undefined), false); assert.equal(iosStayHintFlag(''), false); assert.equal(iosStayHintFlag('0'), false);
    assert.equal(iosStayHintFlag('true'), false); assert.equal(iosStayHintFlag(' 1 '), true); assert.equal(iosStayHintFlag('1'), true);
  });
  await t('ja·en 안내 문구', () => {
    assert.ok(textOf(couponHtml({ ...base, lang: 'ja', iosInApp: true, iosStayHint: true })).includes('App Storeが開かない場合'));
    assert.ok(textOf(couponHtml({ ...base, lang: 'en', iosInApp: true, iosStayHint: true })).includes('App Store not opening?'));
  });
  await t('안드로이드 화면은 iosInApp 을 줘도 안 바뀐다', () => {
    const a = couponHtml({ ...base, platform: 'android' }); const b = couponHtml({ ...base, platform: 'android', iosInApp: true });
    assert.equal(a, b);
  });
  await t('단추 닫힌 목록: apply_stay 가 들어왔고 모르는 이름은 여전히 거절', () => {
    assert.ok(COUPON_TAPS.includes('apply_stay') && isCouponTap('apply_stay'));
    assert.ok(!isCouponTap('apply_stay2') && !isCouponTap('stay'));
  });

  console.log('━━━ 3. /app 라우트 집계 ━━━');
  const keyOf = (from: string) => { const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); return `clkp:coupon:${from}:${d}`; };   // 시험 환경(VERCEL_ENV≠production)은 clkp:
  await t('아이폰 Threads 앱 안 → 쿠폰 화면 + view:human 과 app:threads 한 칸씩 · 안내 줄은 플래그가 켜져야', async () => {
    store.clear(); afterCalls.length = 0;
    const r = await get('from=zz_t1&code=THREADSPRO', UA.threads); await flush();
    assert.equal(r.status, 200); const html = await r.text();
    assert.ok(!html.includes('id="stay"') && html.includes("sgBeacon('apply_stay')"), '기본(플래그 꺼짐): 안내 줄 없음 · 측정 타이머만');
    const v = store.get(keyOf('zz_t1')) as Record<string, number>;
    assert.equal(v['ios|view:human'], 1); assert.equal(v['ios|app:threads'], 1);
    process.env.COUPON_IOS_STAY_HINT = '1';
    try { const r2 = await get('from=zz_t1b&code=THREADSPRO', UA.threads); await flush(); assert.ok((await r2.text()).includes('id="stay"'), '플래그 켜면 안내 줄'); }
    finally { delete process.env.COUPON_IOS_STAY_HINT; }
  });
  await t('아이폰 Safari → 화면은 예전 그대로(안내 없음) · app 필드 없음', async () => {
    store.clear(); afterCalls.length = 0;
    process.env.COUPON_IOS_STAY_HINT = '1';
    let r; try { r = await get('from=zz_t2&code=THREADSPRO', UA.safari); await flush(); } finally { delete process.env.COUPON_IOS_STAY_HINT; }
    const html = await r.text(); assert.ok(!html.includes('id="stay"') && !html.includes('apply_stay'), '플래그가 켜져도 Safari 는 그대로');
    const v = store.get(keyOf('zz_t2')) as Record<string, number>;
    assert.equal(v['ios|view:human'], 1); assert.ok(!Object.keys(v).some((k) => k.includes('app:')));
  });
  await t('Instagram·카톡·LINE 가족 필드 / 표지 없는 WebView 는 other', async () => {
    store.clear(); afterCalls.length = 0;
    for (const [k, fam] of [['instagram', 'instagram'], ['kakao', 'kakao'], ['line', 'line'], ['bareWebView', 'other']] as const) {
      await get(`from=zz_t3&code=THREADSPRO&n=${k}`, UA[k]); await flush();
    }
    const v = store.get(keyOf('zz_t3')) as Record<string, number>;
    for (const fam of ['instagram', 'kakao', 'line', 'other']) assert.equal(v[`ios|app:${fam}`], 1, fam);
  });
  await t('안드로이드 Chrome → 아이폰 앱 안 처리 안 탐(app: 필드 없음)', async () => {
    store.clear(); afterCalls.length = 0;
    await get('from=zz_t4&code=THREADSPRO', UA.androidChrome); await flush();
    const v = (store.get(keyOf('zz_t4')) || {}) as Record<string, number>;
    assert.ok(!Object.keys(v).some((k) => k.startsWith('ios|app:')));
  });
  await t('비콘 API: ev=apply_stay 는 «ios|tap:apply_stay» 로 센다(봇·남의 오리진은 안 센다)', async () => {
    store.clear(); afterCalls.length = 0;
    const ev = (qs: string, ua: string, h: Record<string, string> = {}) => eventRoute.POST(new NextRequest(`https://www.signumhq.com/api/coupon/event?${qs}`, { method: 'POST', headers: { 'user-agent': ua, 'accept-language': 'ko-KR', ...h } }));
    let r = await ev('ev=apply_stay&f=zz_t5', UA.threads); assert.equal(r.status, 204); await flush();
    assert.equal((store.get(keyOf('zz_t5')) as Record<string, number>)['ios|tap:apply_stay'], 1);
    afterCalls.length = 0;
    await ev('ev=apply_stay&f=zz_t6', 'Mozilla/5.0 (iPhone) HeadlessChrome/129.0.0.0'); await flush();
    await ev('ev=apply_stay&f=zz_t7', UA.threads, { origin: 'https://evil.example' }); await flush();
    assert.equal(store.get(keyOf('zz_t6')), undefined); assert.equal(store.get(keyOf('zz_t7')), undefined);
  });

  console.log(`\n${fail ? '✗' : '✓'} ${pass} 통과 · ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})();
