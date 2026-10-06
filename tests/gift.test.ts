/**
 * «친구에게 PRO 1개월 선물» v1 (2026-10-06, 브랜치 feat/gift-pro) —
 *   익명 초대자 id · 선물 링크 · 문구 규칙(자동 갱신 고지·가짜 희소성 금지) · 서버 설정(킬 스위치·만료) · /api/gift/config ·
 *   /app?from=gift 라우트(쿠폰 화면 부제·초대자별 사람 클릭만 · 형식 밖 ref 무시) · 쿠폰 단추 비콘의 초대자별 집계 · 선물 아닌 화면은 «글자 하나 안 바뀜»
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/gift.test.ts
 *
 * 코드 값은 «시험용 가짜»를 쓴다 — 진짜 선물 코드 값은 저장소 어디에도 쓰지 않는다(GIFTTESTPRO 는 형식 규칙만 맞춘 가짜).
 */
import assert from 'node:assert/strict';
import Module from 'node:module';

// ── next/server 의 after 를 가로챈다(라우트 import 보다 먼저) ──
const afterCalls: Array<() => unknown> = [];
const nsPath = require.resolve('next/server');
const realNs = require(nsPath);
require.cache[nsPath] = { id: nsPath, filename: nsPath, loaded: true, exports: { ...realNs, after: (fn: () => unknown) => { afterCalls.push(fn); } } } as unknown as Module;

// ── 가짜 레디스(clk 집계를 실제로 돌려 «어떤 키에 무엇이 쌓이는지» 본다) — redisClient 의 두 함수만 바꾼다 ──
const store = new Map<string, unknown>();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rc = require('../src/services/redisClient');
rc.getFromCache = async (k: string) => (store.has(k) ? store.get(k) : null);
rc.setInCache = async (k: string, v: unknown) => { store.set(k, v); return true; };
const flush = async () => { const fns = afterCalls.splice(0); for (const f of fns) await f(); };
const etDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const giftKeys = () => [...store.keys()].filter((k) => k.startsWith('clkp:gift:')).sort();
const slotKey = (ref: string, day: string) => `clkp:gift:${ref[0]}:${day}`;   // 초대자 칸 = 첫 글자 버킷(lib/gift/giftClick.ts)

import { NextRequest } from 'next/server';
import {
  GIFT_FROM, GIFT_REF_RE, GIFT_COPY, normalizeGiftRef, newGiftRef, buildGiftUrl, giftShareText, getGiftRef, GIFT_REF_STORAGE_KEY,
} from '../src/lib/gift/gift';
import { giftConfig } from '../src/lib/gift/giftConfig';
import { giftRefSlot, recordGiftRef } from '../src/lib/gift/giftClick';
import { parseGiftConfig, loadGiftConfig } from '../src/lib/gift/useGift';
import { shareOrCopy } from '../src/lib/share/share';
import { REF_BUCKETS } from '../src/lib/marketing/referrer';
import { audienceLine } from '../src/lib/marketing/coupon';
import { couponHtml, couponSubline } from '../src/lib/marketing/couponHtml';
import { isLivePromoCode } from '../src/lib/marketing/linkPreview';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sg = require('../src/app/app/route');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cfgRoute = require('../src/app/api/gift/config/route');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const evRoute = require('../src/app/api/coupon/event/route');

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  headless: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0.0.0 Safari/537.36',
  kakaoScrap: 'facebookexternalhit/1.1; kakaotalk-scrap/1.0; +https://devtalk.kakao.com/t/scrap/33984',
};
const NAV = { 'accept-language': 'ko-KR,ko;q=0.9', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', 'sec-fetch-site': 'cross-site', 'sec-fetch-user': '?1' };
const req = (path: string, ua: string, extra: Record<string, string> = NAV) => new NextRequest(`https://www.signumhq.com${path}`, { headers: { 'user-agent': ua, ...extra } });

const CODE = 'GIFTTESTPRO';          // 형식 규칙(^[A-Z]{4,13}PRO$)만 맞춘 «가짜» — 진짜 코드 값이 아니다
const REF = 'k7m2q9x4tb';           // 형식 맞는 익명 id(10자·숫자 포함)
const NOW = Date.parse('2026-10-07T00:00:00Z');

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };

(async () => {
  // ─────────────────────────── 익명 초대자 id ───────────────────────────
  await t('id 형식: 소문자·숫자 8~16자 + 숫자 1자 이상 — 대문자·공백은 소문자·트림 뒤 판정, 그 밖은 null', () => {
    assert.equal(normalizeGiftRef(REF), REF);
    assert.equal(normalizeGiftRef('  K7M2Q9X4TB '), REF);
    for (const bad of ['', 'abc', 'abcdefgh', 'google', 'duckduckgo', 'a1', 'k7m2q9x4tb_', 'k7m2-q9x4tb', 'k7m2q9x4tbk7m2q9x4tb', null, undefined, 123, {}]) {
      assert.equal(normalizeGiftRef(bad as never), null, String(bad));
    }
  });
  await t('id 와 /app 의 ?ref=<분류 이름>은 절대 안 겹친다 — 분류 이름엔 숫자가 없고 id 규칙은 숫자를 요구한다', () => {
    for (const b of REF_BUCKETS) assert.equal(normalizeGiftRef(b), null, b);
  });
  await t('새 id: 10자·형식 통과 · 숫자가 하나도 안 나온 난수열도 숫자 1자를 끼운다 · 1000개 중복 없음', () => {
    let seed = 7; const lcg = (max: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % max; };
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) { const id = newGiftRef(lcg); assert.ok(GIFT_REF_RE.test(id), id); assert.equal(id.length, 10); ids.add(id); }
    assert.equal(ids.size, 1000);
    // 난수가 전부 0 → 알파벳 첫 글자(a)만 나오는 최악: 숫자가 끼워져야 한다
    const id = newGiftRef(() => 0);
    assert.ok(/\d/.test(id) && GIFT_REF_RE.test(id), id);
    assert.ok(!/[il o01]/.test(newGiftRef()), '헷갈리는 글자 없음');
  });
  await t('기기 저장: 처음엔 만들어 저장 · 다음엔 같은 값 · 깨진 값은 새로 · 저장소가 막히면 메모리 값(같은 값)', () => {
    const mem = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
    const a = getGiftRef(); assert.ok(GIFT_REF_RE.test(a)); assert.equal(mem.get(GIFT_REF_STORAGE_KEY), a);
    assert.equal(getGiftRef(), a);
    mem.set(GIFT_REF_STORAGE_KEY, 'BAD VALUE'); const b = getGiftRef(); assert.ok(GIFT_REF_RE.test(b)); assert.equal(mem.get(GIFT_REF_STORAGE_KEY), b);
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    const c = getGiftRef(); assert.ok(GIFT_REF_RE.test(c)); assert.equal(getGiftRef(), c);
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  // ─────────────────────────── 링크 · 문구 ───────────────────────────
  await t('선물 링크: 운영 www 도메인 · from=gift&code=…&ref=… 순서 · 한·일만 &l= · 영어는 안 붙임', () => {
    assert.equal(buildGiftUrl(CODE, REF), `https://www.signumhq.com/app?from=gift&code=${CODE}&ref=${REF}`);
    assert.equal(buildGiftUrl(CODE, REF, 'en'), `https://www.signumhq.com/app?from=gift&code=${CODE}&ref=${REF}`);
    assert.equal(buildGiftUrl(CODE, REF, 'ko'), `https://www.signumhq.com/app?from=gift&code=${CODE}&ref=${REF}&l=ko`);
    assert.equal(buildGiftUrl(CODE, REF, 'ja'), `https://www.signumhq.com/app?from=gift&code=${CODE}&ref=${REF}&l=ja`);
    assert.equal(buildGiftUrl(CODE, null), `https://www.signumhq.com/app?from=gift&code=${CODE}`);
    assert.equal(GIFT_FROM, 'gift');
  });
  await t('문구(한·일·영): 자동 갱신 고지가 «무료» 문장 안 · 가짜 희소성(선착순·남은 수·타이머·숫자 한도) 없음 · 가격 숫자 없음', () => {
    const must = { ko: ['무료', '자동 갱신', '해지'], ja: ['無料', '自動更新', '解約'], en: ['free', 'auto-renews', 'cancel'] } as const;
    const banned = /선착순|먼저|한정|마감|남았|서두|500|first \d|only \d|limited|hurry|left|先着|限定|残り|急い|[₩¥$]\s?\d|\d,\d{3}/i;
    for (const lang of ['ko', 'ja', 'en'] as const) {
      for (const android of [true, false]) {
        const txt = giftShareText(lang, android);
        for (const w of must[lang]) assert.ok(txt.toLowerCase().includes(w.toLowerCase()), `${lang}:${w}`);
        assert.ok(!banned.test(txt), `${lang} 문구에 금지 표현: ${txt}`);
        assert.ok(!/https?:\/\//.test(txt), '링크는 본문에 없다(shareOrCopy 가 끝에 붙인다)');
      }
      const c = GIFT_COPY[lang];
      for (const f of [c.title, c.sub, c.subIosOnly, c.cta, c.shareTitle, c.copied, c.dashLabel]) { assert.ok(f.length > 0); assert.ok(!banned.test(f), `${lang}: ${f}`); }
      for (const w of must[lang]) assert.ok(c.sub.toLowerCase().includes(w.toLowerCase()), `카드 부제 ${lang}:${w}`);   // 카드 부제도 «무료 + 자동 갱신 + 해지» 한 문장
    }
    assert.ok(giftShareText('ko', false).includes('아이폰') && !giftShareText('ko', true).includes('아이폰'), '안드 쿠폰이 꺼졌을 때만 «아이폰» 명시');
    assert.ok(GIFT_COPY.ko.subIosOnly.includes('아이폰') && !GIFT_COPY.ko.sub.includes('아이폰'));
  });
  await t('공유 문자열: Web Share 로 «text 하나»(링크가 맨 끝) 가 간다 — url 을 따로 주지 않는다(iOS «복사»가 링크를 떨구는 함정)', async () => {
    let got: { text?: string; url?: string; title?: string } | null = null;
    Object.defineProperty(globalThis, 'navigator', { value: { share: async (p: { text?: string; url?: string; title?: string }) => { got = p; } }, configurable: true });
    const url = buildGiftUrl(CODE, REF, 'ko');
    const out = await shareOrCopy({ title: GIFT_COPY.ko.shareTitle, text: giftShareText('ko', true), url });
    assert.equal(out, 'shared');
    assert.ok(got);
    const g = got as unknown as { text?: string; url?: string; title?: string };
    assert.equal(g.url, undefined);
    assert.ok(g.text!.endsWith(`\n${url}`), g.text);
    assert.ok(g.text!.includes('자동 갱신'));
    assert.equal(g.title, GIFT_COPY.ko.shareTitle);
    delete (globalThis as { navigator?: unknown }).navigator;
  });

  // ─────────────────────────── 서버 설정(킬 스위치·만료) ───────────────────────────
  await t('서버 설정: 변수 없음·빈값·형식 밖 → 꺼짐 · 형식 맞으면 켜짐(대문자로) · 안드 쿠폰은 COUPON_ANDROID=1 일 때만 true', () => {
    assert.deepEqual(giftConfig({}, NOW), { live: false });
    assert.deepEqual(giftConfig({ GIFT_PROMO_CODE: '  ' }, NOW), { live: false });
    for (const bad of ['gift', 'GIFT', 'GIFT PRO', 'ABC', 'GIFT-PRO', 'GIFTTESTPRO1', 'WAYTOOLONGGIFTCODEPRO', 'ZZ']) assert.deepEqual(giftConfig({ GIFT_PROMO_CODE: bad }, NOW), { live: false }, bad);
    assert.deepEqual(giftConfig({ GIFT_PROMO_CODE: CODE }, NOW), { live: true, code: CODE, android: false });
    assert.deepEqual(giftConfig({ GIFT_PROMO_CODE: ` ${CODE.toLowerCase()} `, COUPON_ANDROID: '1' }, NOW), { live: true, code: CODE, android: true });
    assert.deepEqual(giftConfig({ GIFT_PROMO_CODE: CODE, COUPON_ANDROID: '0' }, NOW), { live: true, code: CODE, android: false });
  });
  await t('서버 설정: 애플 코드 만료(2026-10-31 07:00Z) 뒤엔 꺼진다 · 안드 쿠폰은 Play 종료(10/31 00:00Z) 뒤 false', () => {
    assert.equal(giftConfig({ GIFT_PROMO_CODE: CODE }, Date.parse('2026-10-31T06:59:59Z')).live, true);
    assert.equal(giftConfig({ GIFT_PROMO_CODE: CODE }, Date.parse('2026-10-31T07:00:00Z')).live, false);
    const c = giftConfig({ GIFT_PROMO_CODE: CODE, COUPON_ANDROID: '1' }, Date.parse('2026-10-31T03:00:00Z'));
    assert.deepEqual(c, { live: true, code: CODE, android: false });
  });
  await t('/api/gift/config: 환경변수 있을 때 {live,code,android} · 없을 때 {live:false} · CDN 60초(s-maxage) · 코드 외 다른 값은 안 샌다', async () => {
    const prev = process.env.GIFT_PROMO_CODE; const prevAnd = process.env.COUPON_ANDROID;
    delete process.env.GIFT_PROMO_CODE; delete process.env.COUPON_ANDROID;
    let r = await cfgRoute.GET();
    assert.equal(r.status, 200); assert.deepEqual(await r.json(), { live: false });
    process.env.GIFT_PROMO_CODE = CODE;
    r = await cfgRoute.GET();
    assert.deepEqual(await r.json(), { live: true, code: CODE, android: false });
    assert.match(r.headers.get('cache-control') || '', /s-maxage=60/);
    process.env.COUPON_ANDROID = '1';
    assert.equal(((await (await cfgRoute.GET()).json()) as { android: boolean }).android, true);
    if (prev === undefined) delete process.env.GIFT_PROMO_CODE; else process.env.GIFT_PROMO_CODE = prev;
    if (prevAnd === undefined) delete process.env.COUPON_ANDROID; else process.env.COUPON_ANDROID = prevAnd;
  });
  await t('클라이언트 설정 해석: live·형식 맞는 코드만 켜짐 · 그 밖(꺼짐·깨진 응답·소문자 코드)은 null', () => {
    assert.deepEqual(parseGiftConfig({ live: true, code: CODE, android: true }), { code: CODE, android: true });
    assert.deepEqual(parseGiftConfig({ live: true, code: CODE }), { code: CODE, android: false });
    for (const bad of [null, undefined, {}, { live: false }, { live: true }, { live: true, code: 'gift' }, { live: true, code: 'A B' }, { live: 'yes', code: CODE }, 'x']) assert.equal(parseGiftConfig(bad), null, JSON.stringify(bad));
  });
  await t('클라이언트 설정 읽기: 한 번 가져오면 10분 캐시(두 번째는 네트워크 0) · 실패는 캐시 안 함', async () => {
    let calls = 0;
    (globalThis as { fetch?: unknown }).fetch = async () => { calls++; return { ok: true, json: async () => ({ live: true, code: CODE, android: false }) }; };
    assert.deepEqual(await loadGiftConfig(), { code: CODE, android: false });
    assert.deepEqual(await loadGiftConfig(), { code: CODE, android: false });
    assert.equal(calls, 1);
  });

  // ─────────────────────────── 쿠폰 화면 부제 ───────────────────────────
  await t('쿠폰 부제: from=gift 는 «친구가 보낸 선물 · 선착순 500명 · 10/30까지» — 다른 태그·채널 문구는 예전 그대로', () => {
    assert.equal(audienceLine('gift', CODE, 'ko'), '친구가 보낸 선물');
    assert.equal(audienceLine('gift', CODE, 'ja'), '友だちからのプレゼント');
    assert.equal(audienceLine('gift', CODE, 'en'), 'A gift from a friend');
    assert.equal(couponSubline('ios', 'ko', 'gift', CODE), '친구가 보낸 선물 · 선착순 500명 · 10/30까지');
    assert.equal(couponSubline('ios', 'en', 'gift', CODE), 'A gift from a friend · First 500 · Until Oct\u00a030');   // 날짜 «Oct 30» 은 줄바꿈 방지 NBSP
    assert.equal(audienceLine('threads', 'THREADSPRO', 'ko'), 'Threads 독자 전용');
    assert.equal(audienceLine(null, 'USGUIDEPRO', 'ko'), '구독자 전용');
    assert.equal(audienceLine('cr_usguide', 'USGUIDEPRO', 'en'), 'For subscribers only');
  });
  await t('쿠폰 화면 HTML: ref 없으면(선물 아닌 화면) 글자 하나 안 바뀜 — 비콘·청구 본문에 r·ref 없음 / ref 있으면 비콘에 &r= · 청구 본문에 ref', () => {
    const base = { lang: 'ko' as const, fromTag: 'threads', code: 'THREADSPRO', appleRedeemUrl: 'https://apps.apple.com/redeem?ctx=offercodes&id=6783130444&code=THREADSPRO', playInstallUrl: 'https://play.google.com/store/apps/details?id=com.signumhq.app' };
    for (const platform of ['ios', 'android'] as const) {
      const plain = couponHtml({ ...base, platform });
      assert.ok(!plain.includes('&r=') && !plain.includes('"r":') && !plain.includes('ref:C.r'), platform);
      const withNull = couponHtml({ ...base, platform, ref: null });
      assert.equal(withNull, plain, `ref:null 은 ref 없음과 같아야 한다(${platform})`);
      const gift = couponHtml({ ...base, platform, fromTag: 'gift', code: CODE, ref: REF });
      assert.ok(gift.includes(`"r":"${REF}"`) && gift.includes("(C.r?'&r='+encodeURIComponent(C.r):'')"), platform);
      assert.ok(gift.includes('친구가 보낸 선물'), platform);
    }
    assert.ok(couponHtml({ ...base, platform: 'android', fromTag: 'gift', code: CODE, ref: REF }).includes('{from:C.f,code:C.c,l:C.l,ref:C.r}'));
    assert.ok(couponHtml({ ...base, platform: 'android' }).includes('body:JSON.stringify({from:C.f,code:C.c,l:C.l})'));
  });

  // ─────────────────────────── /app?from=gift 라우트 ───────────────────────────
  await t('초대자 칸: id 첫 글자 버킷(clk:gift:<첫 글자>:<날짜>)에 «<ref>|<기기>|<종류>» 필드 · 형식 밖 id 는 칸을 만들지 않는다', async () => {
    assert.deepEqual(giftRefSlot(REF), { ref: REF, bucket: 'k' });
    assert.equal(giftRefSlot('google'), null); assert.equal(giftRefSlot(null), null);
    store.clear();
    await recordGiftRef(REF, ['ios|human', 'ios|tap:apply']); await recordGiftRef(REF, ['ios|human']); await recordGiftRef('bad id', ['ios|human']);
    assert.deepEqual(giftKeys(), [slotKey(REF, etDay())]);
    assert.deepEqual(store.get(slotKey(REF, etDay())), { [`${REF}|ios|human`]: 2, [`${REF}|ios|tap:apply`]: 1 });
    store.clear();
  });
  await t('/app 선물 링크(아이폰): 쿠폰 화면 200 · 코드 번호·«친구가 보낸 선물»·애플 적용 주소 · 초대자 칸에 «<ref>|ios|human» 1 · 태그 합계(clkp:sg:gift)도 그대로', async () => {
    store.clear(); afterCalls.length = 0;
    // 선물 코드는 «살아 있는» 코드여야 쿠폰 화면이 나온다(형식 규칙 + 만료 전) — 가짜 GIFTTESTPRO 가 그 규칙을 통과하는지부터
    assert.equal(isLivePromoCode(CODE), true);
    const r = await sg.GET(req(`/app?from=gift&code=${CODE}&ref=${REF}&l=ko`, UA.iphone));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'private, no-store, max-age=0'); assert.equal(r.headers.get('vary'), 'User-Agent');
    const html = await r.text();
    assert.ok(html.includes(CODE) && html.includes('친구가 보낸 선물') && html.includes('선착순 500명'));
    assert.ok(html.includes(`https://apps.apple.com/redeem?ctx=offercodes&amp;id=6783130444&amp;code=${CODE}`));
    assert.ok(html.includes('PRO 1개월 무료 쿠폰') && html.includes('자동 갱신'), '무료 문장 안 자동 갱신 고지(기존)');
    await flush();
    const day = etDay();
    assert.deepEqual(giftKeys(), [slotKey(REF, day)]);
    assert.deepEqual(store.get(slotKey(REF, day)), { [`${REF}|ios|human`]: 1 });
    const sgv = store.get(`clkp:sg:gift:${day}`) as Record<string, number>;
    assert.equal(sgv['ios|human'], 1);
    const codev = store.get(`clkp:code:gift:${day}`) as Record<string, number>;
    assert.equal(codev['ios|human'], 1);
    const cpn = store.get(`clkp:coupon:gift:${day}`) as Record<string, number>;
    assert.equal(cpn['ios|view:human'], 1);
  });
  await t('/app 선물 링크: 같은 초대자의 두 번째 클릭은 같은 필드에 더해진다 · 첫 글자가 다른 초대자는 다른 칸 · 안드·PC 도 기기별 필드', async () => {
    afterCalls.length = 0;
    await sg.GET(req(`/app?from=gift&code=${CODE}&ref=${REF}`, UA.iphone));
    await sg.GET(req(`/app?from=gift&code=${CODE}&ref=${REF}`, UA.mac));
    await sg.GET(req(`/app?from=gift&code=${CODE}&ref=p3d8w6v2ha`, UA.android));
    await flush();
    const day = etDay();
    assert.deepEqual(store.get(slotKey(REF, day)), { [`${REF}|ios|human`]: 2, [`${REF}|desktop|human`]: 1 });
    assert.deepEqual(store.get(slotKey('p3d8w6v2ha', day)), { 'p3d8w6v2ha|android|human': 1 });   // 다른 첫 글자 → 다른 칸
  });
  await t('/app 선물 링크: 봇·헤드리스·미리보기 봇은 초대자 키를 만들지 않는다 · 형식 밖 ref·선물 아닌 태그의 ref 도 무시', async () => {
    store.clear(); afterCalls.length = 0;
    await sg.GET(req(`/app?from=gift&code=${CODE}&ref=${REF}`, UA.headless));                 // 헤드리스 → bot
    await sg.GET(req(`/app?from=gift&code=${CODE}&ref=${REF}`, UA.iphone, { 'user-agent': UA.iphone }));   // Accept-Language·Sec-Fetch 없음 → nolang
    const pv = await sg.GET(req(`/app?from=gift&code=${CODE}&ref=${REF}`, UA.kakaoScrap, {}));   // 미리보기 봇 → 카드(집계 이전에 반환)
    assert.equal(pv.status, 200);
    for (const bad of ['google', 'abcdefgh', 'A', 'k7m2q9x4tb_zz', 'k7m2-q9x4tb', '<script>1']) await sg.GET(req(`/app?from=gift&code=${CODE}&ref=${encodeURIComponent(bad)}`, UA.iphone));
    await sg.GET(req(`/app?from=threads&code=THREADSPRO&ref=${REF}`, UA.iphone));            // 선물 아닌 태그
    await sg.GET(req(`/app?from=home&ref=${REF}`, UA.iphone));
    await flush();
    assert.deepEqual(giftKeys(), [], `초대자 키가 생기면 안 된다: ${giftKeys().join(',')}`);
  });
  await t('/app 선물 링크: 쿠폰 화면 스크립트에 ref 가 실린다(아이폰·안드 크롬) · ref 없는 선물 링크·선물 아닌 링크는 예전 화면 그대로', async () => {
    const prevFlag = process.env.COUPON_ANDROID; process.env.COUPON_ANDROID = '1';
    try {
      for (const ua of [UA.iphone, UA.android]) {
        const html = await (await sg.GET(req(`/app?from=gift&code=${CODE}&ref=${REF}`, ua))).text();
        assert.ok(html.includes(`"r":"${REF}"`), ua.slice(0, 30));
        const noRef = await (await sg.GET(req(`/app?from=gift&code=${CODE}`, ua))).text();
        assert.ok(!noRef.includes('"r":') && !noRef.includes('&r='), 'ref 없는 선물 링크');
        const other = await (await sg.GET(req(`/app?from=threads&code=THREADSPRO&ref=${REF}`, ua))).text();
        assert.ok(!other.includes('"r":') && !other.includes('&r=') && !other.includes(REF), '선물이 아닌 태그의 ref 는 화면에 안 실린다');
      }
    } finally { if (prevFlag === undefined) delete process.env.COUPON_ANDROID; else process.env.COUPON_ANDROID = prevFlag; }
  });
  await t('/app 선물 링크 미리보기 카드(봇): 코드가 살아 있으면 «PRO 1개월 무료» 카드 · l=ko 면 한국어', async () => {
    const r = await sg.GET(req(`/app?from=gift&code=${CODE}&ref=${REF}&l=ko`, UA.kakaoScrap, {}));
    const html = await r.text();
    assert.ok(html.includes('SIGNUM HQ PRO 1개월 무료') && html.includes('og:image') && html.includes('redeem-card-ko.png'));
    const en = await (await sg.GET(req(`/app?from=gift&code=${CODE}&ref=${REF}`, UA.kakaoScrap, {}))).text();
    assert.ok(en.includes('SIGNUM HQ PRO — 1 month free'));
  });

  // ─────────────────────────── 쿠폰 단추 비콘 · 청구 ───────────────────────────
  const post = (url: string, ua: string, h: Record<string, string> = { 'accept-language': 'ko-KR' }) =>
    new NextRequest(`https://www.signumhq.com${url}`, { method: 'POST', headers: { 'user-agent': ua, ...h } });
  await t('쿠폰 단추 비콘: f=gift&r=<ref> 면 초대자 칸에도 «<ref>|ios|tap:apply» · 형식 밖 r·선물 아닌 f·봇은 안 센다 · 응답은 항상 204', async () => {
    store.clear(); afterCalls.length = 0;
    let r = await evRoute.POST(post(`/api/coupon/event?ev=apply&f=gift&r=${REF}`, UA.iphone));
    assert.equal(r.status, 204);
    await evRoute.POST(post(`/api/coupon/event?ev=copy&f=gift&r=${REF}`, UA.android));
    await evRoute.POST(post('/api/coupon/event?ev=apply&f=gift&r=google', UA.iphone));
    await evRoute.POST(post(`/api/coupon/event?ev=apply&f=threads&r=${REF}`, UA.iphone));
    r = await evRoute.POST(post(`/api/coupon/event?ev=apply&f=gift&r=${REF}`, UA.headless));
    assert.equal(r.status, 204);
    await evRoute.POST(post(`/api/coupon/event?ev=zzz&f=gift&r=${REF}`, UA.iphone));
    await flush();
    const day = etDay();
    assert.deepEqual(giftKeys(), [slotKey(REF, day)]);
    assert.deepEqual(store.get(slotKey(REF, day)), { [`${REF}|ios|tap:apply`]: 1, [`${REF}|android|tap:copy`]: 1 });
    assert.deepEqual(store.get(`clkp:coupon:gift:${day}`), { 'ios|tap:apply': 2, 'android|tap:copy': 1 });   // 태그 합계는 기존 그대로 — ref 가 형식 밖(r=google)인 한 번도 태그 합계엔 센다
  });

  console.log(`\ngift: ${n} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
