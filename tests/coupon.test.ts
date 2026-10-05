/**
 * 리딤 «쿠폰 경험»(2026-10-05) — 공용 정의 · 쿠폰 화면 HTML · 안드로이드 개인 번호 배정(원자성·같은 IP·하루 상한·소진) ·
 *   배정 API(가짜 Upstash REST 로 실제 명령 모양까지) · 단추 비콘 API · 앱 «코드 입력» 뒤 PRO 새로 읽기 순서
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/coupon.test.ts
 *
 * 번호는 전부 «가짜»(ZZTEST…)다 — 진짜 Play·애플 일회용 번호는 저장소 어디에도 쓰지 않는다.
 */
import assert from 'node:assert/strict';
import Module from 'node:module';

// ── next/server 의 after 를 가로챈다(라우트 import 보다 먼저) — 응답 뒤 집계는 «무엇을 하려는지»만 본다 ──
const afterCalls: Array<() => unknown> = [];
const nsPath = require.resolve('next/server');
const realNs = require(nsPath);
require.cache[nsPath] = { id: nsPath, filename: nsPath, loaded: true, exports: { ...realNs, after: (fn: () => unknown) => { afterCalls.push(fn); } } } as unknown as Module;

// ── 가짜 Upstash REST(문자열·집합·해시 + 파이프라인 + base64 응답 인코딩) — @upstash/redis 가 보내는 «실제 명령 모양»을 그대로 받는다 ──
process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
const S = new Map<string, string>(); const SETS = new Map<string, Set<string>>(); const H = new Map<string, Map<string, string>>(); const TTL = new Map<string, number>();
const cmdLog: string[] = [];
let upstashDown = false;
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
function run(c: (string | number)[]): unknown {
  const op = String(c[0]).toUpperCase(); const k = String(c[1]);
  cmdLog.push(op);
  switch (op) {
    case 'GET': return S.has(k) ? b64(S.get(k)!) : null;
    case 'SET': {
      const opts = c.slice(3).map((x) => String(x).toUpperCase());
      if (opts.includes('NX') && S.has(k)) return null;
      S.set(k, String(c[2]));
      const ex = opts.indexOf('EX'); if (ex >= 0) TTL.set(k, Number(c[3 + ex + 1]));
      return 'OK';
    }
    case 'INCR': { const n = Number(S.get(k) || 0) + 1; S.set(k, String(n)); return n; }
    case 'DECR': { const n = Number(S.get(k) || 0) - 1; S.set(k, String(n)); return n; }
    case 'EXPIRE': TTL.set(k, Number(c[2])); return 1;
    case 'SPOP': { const s = SETS.get(k); if (!s || !s.size) return null; const v = [...s][Math.floor(Math.random() * s.size)]; s.delete(v); return b64(v); }
    case 'SADD': { const s = SETS.get(k) || new Set(); let n = 0; for (const m of c.slice(2)) if (!s.has(String(m))) { s.add(String(m)); n++; } SETS.set(k, s); return n; }
    case 'HSET': { const h = H.get(k) || new Map(); for (let i = 2; i < c.length; i += 2) h.set(String(c[i]), String(c[i + 1])); H.set(k, h); return 1; }
    default: throw new Error('unexpected op ' + op);
  }
}
(globalThis as any).fetch = async (input: any, init?: any) => {
  const url = String(input);
  if (!url.startsWith('https://upstash.test')) throw new Error('unexpected fetch ' + url);
  if (upstashDown) throw new TypeError('fetch failed');
  const body = JSON.parse(init?.body || '[]');
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
  if (url.endsWith('/pipeline')) return json((body as (string | number)[][]).map((c) => ({ result: run(c) })));
  return json({ result: run(body) });
};
const resetStore = () => { S.clear(); SETS.clear(); H.clear(); TTL.clear(); cmdLog.length = 0; };

import { NextRequest } from 'next/server';
import {
  androidCouponFlag, androidCouponLive, androidDailyCap, kstDay, nextKstMidnight, audienceLine, couponKeys,
  PLAY_ONE_TIME_RE, playRedeemUrl, isCouponTap, PLAY_PROMO_END, ANDROID_POOL_SIZE, APPLE_CODE_LIMIT,
} from '../src/lib/marketing/coupon';
import { couponHtml, couponSubline } from '../src/lib/marketing/couponHtml';
import { claimPlayCoupon, claimDenyReason, clientIp, ipHash, type CouponStore } from '../src/lib/marketing/couponClaim';
import { refreshProAfterRedeem } from '../src/lib/app/redeem';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const claimRoute = require('../src/app/api/coupon/claim/route');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const eventRoute = require('../src/app/api/coupon/event/route');

const UA = {
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  kakaoAnd: 'Mozilla/5.0 (Linux; Android 13; SM-S911N Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36;KAKAOTALK 2410430',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  headlessAnd: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0.0.0 Mobile Safari/537.36',
};
/** 우리 쿠폰 화면의 fetch 가 보내는 헤더(안드 Chrome·카톡 인앱 웹뷰 공통) */
const FETCH = (ua: string, extra: Record<string, string> = {}) => ({
  'user-agent': ua, 'accept-language': 'ko-KR,ko;q=0.9', 'content-type': 'application/json', 'x-coupon': '1',
  'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty', origin: 'https://www.signumhq.com', host: 'www.signumhq.com', ...extra,
});
const Hd = (o: Record<string, string>) => new Headers(o);
const claimReq = (headers: Record<string, string>, body: unknown = { from: 'threads', code: 'THREADSPRO', l: 'ko' }) =>
  new NextRequest('https://www.signumhq.com/api/coupon/claim', { method: 'POST', headers, body: JSON.stringify(body) });

/** 메모리 가짜 저장소 — 경합(동시 요청) 재현용으로 setNxEx 를 가로챌 수 있다 */
function memStore(): CouponStore & { strings: Map<string, string>; sets: Map<string, Set<string>>; hashes: Map<string, Map<string, string>>; onSetNx?: (k: string) => void } {
  const strings = new Map<string, string>(); const sets = new Map<string, Set<string>>(); const hashes = new Map<string, Map<string, string>>();
  const st: any = {
    strings, sets, hashes,
    get: async (k: string) => strings.get(k) ?? null,
    incrEx: async (k: string) => { const n = Number(strings.get(k) || 0) + 1; strings.set(k, String(n)); return n; },
    decr: async (k: string) => { const n = Number(strings.get(k) || 0) - 1; strings.set(k, String(n)); return n; },
    spop: async (k: string) => { const s = sets.get(k); if (!s || !s.size) return null; const v = [...s][0]; s.delete(v); return v; },
    sadd: async (k: string, m: string) => { const s = sets.get(k) || new Set(); s.add(m); sets.set(k, s); return 1; },
    setNxEx: async (k: string, v: string) => { st.onSetNx?.(k); if (strings.has(k)) return false; strings.set(k, v); return true; },
    hsetEx: async (k: string, f: string, v: string) => { const h = hashes.get(k) || new Map(); h.set(f, v); hashes.set(k, h); return 1; },
  };
  return st;
}
const FAKE = (i: number) => `ZZTEST${String(i).padStart(17, '0')}`;   // 23자 가짜 번호
/** 태그를 걷어낸 글 — 일본어 구두점 묶음(<span class="nw">·<wbr>)이 있어도 문장으로 대조 */
const textOf = (html: string) => html.replace(/<wbr>/g, '').replace(/<[^>]+>/g, '');

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };

(async () => {
  console.log('━━━ 1. 공용 정의 ━━━');
  await t('켜기: COUPON_ANDROID 가 정확히 "1" 일 때만 · Play 종료(10/31 00:00 GMT) 뒤 꺼짐', () => {
    assert.equal(androidCouponFlag(undefined), false); assert.equal(androidCouponFlag(''), false); assert.equal(androidCouponFlag('0'), false);
    assert.equal(androidCouponFlag('true'), false); assert.equal(androidCouponFlag('1'), true); assert.equal(androidCouponFlag(' 1 '), true);
    assert.equal(androidCouponLive(Date.parse('2026-10-05T00:00:00Z'), true), true);
    assert.equal(androidCouponLive(PLAY_PROMO_END - 1, true), true);
    assert.equal(androidCouponLive(PLAY_PROMO_END, true), false);
    assert.equal(androidCouponLive(Date.parse('2026-10-05T00:00:00Z'), false), false);
  });
  await t('하루 상한: 기본 60 · 1~1000 정수만 덮어쓴다', () => {
    assert.equal(androidDailyCap(undefined), 60); assert.equal(androidDailyCap('3'), 3); assert.equal(androidDailyCap('0'), 60);
    assert.equal(androidDailyCap('abc'), 60); assert.equal(androidDailyCap('2.5'), 60); assert.equal(androidDailyCap('5000'), 60);
  });
  await t('KST 날짜·다음 자정: 2026-10-05 14:59Z = KST 23:59 · 15:00Z = 다음 날 0시', () => {
    assert.equal(kstDay(Date.parse('2026-10-05T14:59:59Z')), '2026-10-05');
    assert.equal(kstDay(Date.parse('2026-10-05T15:00:00Z')), '2026-10-06');
    assert.equal(nextKstMidnight(Date.parse('2026-10-05T05:00:00Z')), Date.parse('2026-10-05T15:00:00Z'));
    assert.equal(nextKstMidnight(Date.parse('2026-10-05T15:00:00Z')), Date.parse('2026-10-06T15:00:00Z'));
  });
  await t('채널 줄: 태그 → 사람이 읽는 이름 · 모르는 태그는 코드의 채널 · 둘 다 모르면 null · 웹은 «방문자»', () => {
    assert.equal(audienceLine('threads', 'THREADSPRO', 'ko'), 'Threads 독자 전용');
    assert.equal(audienceLine('threads_jp', 'THREADSPRO', 'ja'), 'Threads読者限定');
    assert.equal(audienceLine('x_us', 'XPRO', 'en'), 'For X readers only');
    assert.equal(audienceLine('bluesky_post', 'BSKYPRO', 'en'), 'For Bluesky readers only');
    assert.equal(audienceLine('naver_blog', 'NAVERPRO', 'ko'), '네이버 블로그 독자 전용');
    assert.equal(audienceLine('note', 'NOTEJP', 'ja'), 'note読者限定');
    assert.equal(audienceLine('indiehackers', 'IHPRO', 'en'), 'For Indie Hackers readers only');
    assert.equal(audienceLine('home_hero_code', 'WEBPRO', 'ko'), 'SIGNUM 웹 방문자 전용');
    assert.equal(audienceLine('g2check', 'THREADSPRO', 'ko'), 'Threads 독자 전용', '시험 태그 → 코드의 채널');
    assert.equal(audienceLine(null, 'XJPPRO', 'ja'), 'X読者限定');
    assert.equal(audienceLine('zz_unknown', 'ABCD1234', 'ko'), null);
  });
  await t('부제: «채널 · 실제 한도 · 10/30» — 아이폰 500(애플 코드 한도) · 안드 200(서버 풀)', () => {
    assert.equal(APPLE_CODE_LIMIT, 500); assert.equal(ANDROID_POOL_SIZE, 200);
    assert.equal(couponSubline('ios', 'ko', 'threads', 'THREADSPRO'), 'Threads 독자 전용 · 선착순 500명 · 10/30까지');
    assert.equal(couponSubline('android', 'ko', 'threads', 'THREADSPRO'), 'Threads 독자 전용 · 선착순 200명 · 10/30까지');
    assert.equal(couponSubline('ios', 'en', 'x_us', 'XPRO'), 'For X readers only · First 500 · Until Oct 30');
    assert.equal(couponSubline('ios', 'ja', 'zz', 'ABCD1234'), '先着500名 · 10/30まで', '채널을 모르면 앞 조각만 뺀다');
  });
  await t('저장 키: 운영 promo:play:* · 미리보기·로컬 promo:pv:play:*(같은 레디스에서 진짜 풀을 안 건드린다)', () => {
    const p = couponKeys('production'); const v = couponKeys('preview'); const l = couponKeys(undefined);
    assert.equal(p.pool, 'promo:play:pool'); assert.equal(p.claims, 'promo:play:claims'); assert.equal(p.ip('ab'), 'promo:play:ip:ab'); assert.equal(p.day('2026-10-05'), 'promo:play:day:2026-10-05');
    assert.equal(v.pool, 'promo:pv:play:pool'); assert.equal(l.pool, 'promo:pv:play:pool');
  });
  await t('번호 형식(23자)·Play 적용 주소·단추 닫힌 목록', () => {
    assert.ok(PLAY_ONE_TIME_RE.test(FAKE(1))); assert.ok(!PLAY_ONE_TIME_RE.test('THREADSPRO')); assert.ok(!PLAY_ONE_TIME_RE.test(FAKE(1).toLowerCase()));
    assert.equal(playRedeemUrl(FAKE(7)), `https://play.google.com/redeem?code=${FAKE(7)}`);
    for (const e of ['apply', 'play', 'copy', 'install']) assert.ok(isCouponTap(e));
    for (const e of ['claim', 'x', '', null]) assert.ok(!isCouponTap(e));
  });
  await t('IP 해시: 24자 · 같은 입력 같은 값 · 비밀값이 다르면 다른 값 · 원문 없음', () => {
    const a = ipHash('203.0.113.7', 's1');
    assert.match(a, /^[0-9a-f]{24}$/); assert.equal(a, ipHash('203.0.113.7', 's1')); assert.notEqual(a, ipHash('203.0.113.7', 's2'));
    assert.ok(!a.includes('203'));
  });

  console.log('━━━ 2. 쿠폰 화면 HTML ━━━');
  const REDEEM = 'https://apps.apple.com/redeem?ctx=offercodes&id=6783130444&code=THREADSPRO';
  const PLAYI = 'https://play.google.com/store/apps/details?id=com.signumhq.app&referrer=utm_source%3Dthreads%26utm_medium%3Dsmartlink%26utm_campaign%3Dsignumhq_web%26utm_content%3Dcode';
  await t('아이폰: 🎟 제목 · 채널·한도·날짜 · 쿠폰 번호 크게 · 주 단추 = 애플 적용 주소 · «무료» 문장 안 자동 갱신 가격', () => {
    const h = couponHtml({ platform: 'ios', lang: 'ko', fromTag: 'threads', code: 'THREADSPRO', appleRedeemUrl: REDEEM, playInstallUrl: PLAYI });
    assert.ok(h.includes('<h1 class="t-title" id="ct">🎟 SIGNUM HQ PRO <span class="nw">1개월 무료 쿠폰</span></h1>'), '제목 뒤쪽은 한 덩어리(접히면 통째로)');
    assert.ok(h.includes('Threads 독자 전용 · 선착순 500명 · 10/30까지'));
    assert.ok(h.includes('<p class="t-code" id="code">THREADSPRO</p>'));
    assert.ok(h.includes(`<a class="cta" id="go" href="${REDEEM.replace(/&/g, '&amp;')}">쿠폰 적용하고 무료로 시작</a>`));
    assert.ok(h.includes('앱이 없으면 설치부터 이어집니다'));
    assert.ok(h.includes('1개월 무료 뒤 월 ₩11,900 자동 갱신 · 언제든 해지'));
    assert.ok(h.includes("sgBeacon('apply')") && h.includes('/api/coupon/event?ev='));
    assert.ok(!h.includes('play.google.com') && !h.includes('/api/coupon/claim'), '아이폰 화면엔 Play·배정 API 없음');
    assert.ok(h.length < 12_000, `가볍게(${h.length}B)`);
  });
  await t('아이폰 ja·en: 가격·문구가 언어별(¥1,280 · US$9.99)', () => {
    const ja = couponHtml({ platform: 'ios', lang: 'ja', fromTag: 'note', code: 'NOTEJP', appleRedeemUrl: REDEEM, playInstallUrl: PLAYI });
    const jt = textOf(ja);
    assert.ok(jt.includes('🎟 SIGNUM HQ PRO 1か月無料クーポン') && jt.includes('1か月無料、以降は月額¥1,280で自動更新・いつでも解約可') && jt.includes('note読者限定'));
    assert.ok(ja.includes('<span class="nw">1か月無料、</span><wbr><span class="nw">以降は月額¥1,280で自動更新・</span><wbr>'), 'ja 는 구두점 뒤에서만 접힌다');
    const en = couponHtml({ platform: 'ios', lang: 'en', fromTag: 'x_us', code: 'XPRO', appleRedeemUrl: REDEEM, playInstallUrl: PLAYI });
    assert.ok(en.includes('Apply coupon &amp; start free') && en.includes('then US$9.99/mo (regular price) — auto-renews, cancel anytime'));
  });
  await t('안드로이드: «내 쿠폰 받기» → 배정 API · 번호 칸은 가림 · 복사·Play 적용·손입력 경로 · 30일 무료 고지 · 쿠폰 없이 설치(리퍼러)', () => {
    const h = couponHtml({ platform: 'android', lang: 'ko', fromTag: 'threads', code: 'THREADSPRO', appleRedeemUrl: REDEEM, playInstallUrl: PLAYI });
    assert.ok(textOf(h).includes('🎟 SIGNUM HQ PRO 30일 무료 쿠폰') && h.includes('Threads 독자 전용 · 선착순 200명 · 10/30까지'));
    assert.ok(h.includes('<button class="cta" id="claim" type="button">내 쿠폰 받기</button>'));
    assert.ok(h.includes("fetch('/api/coupon/claim'") && h.includes("'x-coupon':'1'"));
    assert.ok(h.includes('Play 스토어에서 적용') && h.includes('Play 스토어 → 결제 및 정기 결제 → 코드 사용에 직접 입력해도 됩니다'));
    assert.ok(h.includes('30일 무료 뒤 월 ₩11,900 자동 갱신 · 언제든 해지'));
    assert.ok(h.includes(`href="${PLAYI.replace(/&/g, '&amp;')}">쿠폰 없이 앱만 설치하기</a>`));
    assert.ok(!h.includes(REDEEM.replace(/&/g, '&amp;')), '안드로이드 화면엔 애플 적용 주소 없음');
    assert.ok(!/[A-Z0-9]{23}/.test(h), '번호(23자)는 서버 HTML 에 실리지 않는다 — 누른 뒤 API 로만');
  });
  await t('스크립트 안 값은 </script> 로 끊기지 않게 이스케이프', () => {
    const h = couponHtml({ platform: 'android', lang: 'en', fromTag: 'threads', code: 'THREADSPRO', appleRedeemUrl: REDEEM, playInstallUrl: PLAYI });
    const script = h.slice(h.indexOf('<script>'));
    assert.equal((script.match(/<\/script>/g) || []).length, 1);
  });

  console.log('━━━ 3. 배정 규칙(메모리 저장소) ━━━');
  const keysPv = couponKeys('preview');
  const NOW = Date.parse('2026-10-05T05:00:00Z');
  await t('새 번호 → 같은 IP 는 같은 번호(again) → 다른 IP 는 다른 번호 · 기록(해시)에 출처·시각·IP 해시', async () => {
    const st = memStore(); st.sets.set(keysPv.pool, new Set([FAKE(1), FAKE(2), FAKE(3)]));
    const a = await claimPlayCoupon(st, { ipHash: 'ipA', from: 'threads', appleCode: 'THREADSPRO', cap: 60, now: NOW, vercelEnv: 'preview' });
    assert.equal(a.kind, 'new');
    const a2 = await claimPlayCoupon(st, { ipHash: 'ipA', from: 'threads', appleCode: 'THREADSPRO', cap: 60, now: NOW + 1000, vercelEnv: 'preview' });
    assert.deepEqual(a2, { kind: 'again', code: (a as any).code });
    const b = await claimPlayCoupon(st, { ipHash: 'ipB', from: 'x_us', appleCode: 'XPRO', cap: 60, now: NOW, vercelEnv: 'preview' });
    assert.equal(b.kind, 'new'); assert.notEqual((b as any).code, (a as any).code);
    const rec = JSON.parse(st.hashes.get(keysPv.claims)!.get((a as any).code)!);
    assert.deepEqual(rec, { from: 'threads', at: new Date(NOW).toISOString(), ip: 'ipA', ac: 'THREADSPRO' });
    assert.equal(st.strings.get(keysPv.day('2026-10-05')), '2', '하루 수 = 새 번호 2장(again 은 안 센다)');
    assert.equal(st.sets.get(keysPv.pool)!.size, 1);
  });
  await t('하루 상한: cap 장 뒤엔 cap(resetAt = 다음 KST 자정) · 상한 거절은 하루 수를 늘리지 않는다 · 다음 날 다시', async () => {
    const st = memStore(); st.sets.set(keysPv.pool, new Set([FAKE(1), FAKE(2), FAKE(3), FAKE(4)]));
    for (const ip of ['i1', 'i2']) assert.equal((await claimPlayCoupon(st, { ipHash: ip, from: 'threads', appleCode: null, cap: 2, now: NOW, vercelEnv: 'preview' })).kind, 'new');
    const c = await claimPlayCoupon(st, { ipHash: 'i3', from: 'threads', appleCode: null, cap: 2, now: NOW, vercelEnv: 'preview' });
    assert.deepEqual(c, { kind: 'cap', resetAt: Date.parse('2026-10-05T15:00:00Z') });
    assert.equal(st.strings.get(keysPv.day('2026-10-05')), '2', '거절은 보정(DECR)');
    assert.equal((await claimPlayCoupon(st, { ipHash: 'i1', from: 'threads', appleCode: null, cap: 2, now: NOW, vercelEnv: 'preview' })).kind, 'again', '상한이어도 이미 받은 사람은 같은 번호');
    assert.equal((await claimPlayCoupon(st, { ipHash: 'i3', from: 'threads', appleCode: null, cap: 2, now: Date.parse('2026-10-05T15:00:01Z'), vercelEnv: 'preview' })).kind, 'new', 'KST 다음 날');
  });
  await t('소진: 풀이 비면 empty(하루 수 보정) · 형식이 틀린 값은 내주지 않고 :bad 로 치운다', async () => {
    const st = memStore(); st.sets.set(keysPv.pool, new Set(['oops-not-a-code']));
    const e = await claimPlayCoupon(st, { ipHash: 'iX', from: null, appleCode: null, cap: 60, now: NOW, vercelEnv: 'preview' });
    assert.deepEqual(e, { kind: 'empty' });
    assert.ok(st.sets.get(`${keysPv.pool}:bad`)!.has('oops-not-a-code'));
    assert.equal(st.strings.get(keysPv.day('2026-10-05')), '0');
  });
  await t('같은 IP 동시 요청 경합: SET NX 에서 진 쪽은 번호를 풀에 돌려놓고 이긴 쪽 번호를 준다(한 사람 1장)', async () => {
    const st = memStore(); st.sets.set(keysPv.pool, new Set([FAKE(1), FAKE(2)]));
    // 이 요청이 SET NX 하기 직전에 «다른 요청»이 같은 IP 키를 먼저 잡는다
    st.onSetNx = (k) => { if (!st.strings.has(k)) st.strings.set(k, FAKE(9)); st.onSetNx = undefined; };
    const r = await claimPlayCoupon(st, { ipHash: 'ipR', from: 'threads', appleCode: null, cap: 60, now: NOW, vercelEnv: 'preview' });
    assert.deepEqual(r, { kind: 'again', code: FAKE(9) });
    assert.equal(st.sets.get(keysPv.pool)!.size, 2, '꺼냈던 번호는 풀로 돌아갔다');
    assert.equal(st.strings.get(keysPv.day('2026-10-05')), '0', '하루 수 보정');
    assert.ok(!st.hashes.get(keysPv.claims), '기록 없음(진 쪽)');
  });

  console.log('━━━ 4. 사람·출처 판정 · IP ━━━');
  await t('통과: 안드 Chrome·카톡 인앱 웹뷰의 같은 출처 fetch', () => {
    assert.equal(claimDenyReason(Hd(FETCH(UA.android)), 'www.signumhq.com'), null);
    assert.equal(claimDenyReason(Hd(FETCH(UA.kakaoAnd)), 'www.signumhq.com'), null);
  });
  await t('거절: 봇·헤드리스·언어 없음 → bot · 아이폰·PC → device · 전용 헤더/JSON/같은 출처 아님·폼 이동·비콘 → origin', () => {
    assert.equal(claimDenyReason(Hd(FETCH(UA.headlessAnd)), 'www.signumhq.com'), 'bot');
    assert.equal(claimDenyReason(Hd(FETCH('python-requests/2.31')), 'www.signumhq.com'), 'bot');
    assert.equal(claimDenyReason(Hd({ ...FETCH(UA.android), 'accept-language': '' }), 'www.signumhq.com'), 'bot');
    assert.equal(claimDenyReason(Hd(FETCH(UA.iphone)), 'www.signumhq.com'), 'device');
    assert.equal(claimDenyReason(Hd(FETCH(UA.mac)), 'www.signumhq.com'), 'device');
    const { 'x-coupon': _x, ...noHeader } = FETCH(UA.android); void _x;
    assert.equal(claimDenyReason(Hd(noHeader), 'www.signumhq.com'), 'origin');
    assert.equal(claimDenyReason(Hd({ ...FETCH(UA.android), 'content-type': 'text/plain' }), 'www.signumhq.com'), 'origin');
    assert.equal(claimDenyReason(Hd({ ...FETCH(UA.android), 'sec-fetch-site': 'cross-site' }), 'www.signumhq.com'), 'origin');
    assert.equal(claimDenyReason(Hd({ ...FETCH(UA.android), 'sec-fetch-mode': 'navigate' }), 'www.signumhq.com'), 'origin');
    assert.equal(claimDenyReason(Hd({ ...FETCH(UA.android), 'sec-fetch-mode': 'no-cors' }), 'www.signumhq.com'), 'origin');
  });
  await t('Sec-Fetch 없는 옛 브라우저: Origin 이 같은 호스트면 통과, 없거나 다르면 origin', () => {
    const { 'sec-fetch-site': _a, 'sec-fetch-mode': _b, 'sec-fetch-dest': _c, ...old } = FETCH(UA.android); void _a; void _b; void _c;
    assert.equal(claimDenyReason(Hd(old), 'www.signumhq.com'), null);
    assert.equal(claimDenyReason(Hd({ ...old, origin: 'https://evil.example' }), 'www.signumhq.com'), 'origin');
    const { origin: _o, ...noOrigin } = old; void _o;
    assert.equal(claimDenyReason(Hd(noOrigin), 'www.signumhq.com'), 'origin');
  });
  await t('IP: Vercel 헤더 순서 · 시험용 x-coupon-test-ip 는 운영에서 무시 · 없으면 null', () => {
    assert.equal(clientIp(Hd({ 'x-real-ip': '198.51.100.2', 'x-forwarded-for': '198.51.100.9, 10.0.0.1' }), 'production'), '198.51.100.2');
    assert.equal(clientIp(Hd({ 'x-forwarded-for': '198.51.100.9, 10.0.0.1' }), 'production'), '198.51.100.9');
    assert.equal(clientIp(Hd({ 'x-vercel-forwarded-for': '198.51.100.5', 'x-real-ip': '198.51.100.2' }), 'production'), '198.51.100.5');
    assert.equal(clientIp(Hd({ 'x-coupon-test-ip': 'tester-1', 'x-real-ip': '198.51.100.2' }), 'production'), '198.51.100.2', '운영은 시험 헤더를 안 듣는다');
    assert.equal(clientIp(Hd({ 'x-coupon-test-ip': 'tester-1', 'x-real-ip': '198.51.100.2' }), 'preview'), 'tester-1');
    assert.equal(clientIp(Hd({}), 'production'), null);
  });

  console.log('━━━ 5. 배정 API(가짜 Upstash REST — 실제 명령 모양) ━━━');
  process.env.VERCEL_ENV = 'preview';
  const day = kstDay();
  await t('꺼짐(COUPON_ANDROID 없음) → 404 off · 저장소 명령 0', async () => {
    delete process.env.COUPON_ANDROID; resetStore();
    const r = await claimRoute.POST(claimReq(FETCH(UA.android, { 'x-coupon-test-ip': 'a1' })));
    assert.equal(r.status, 404); assert.deepEqual(await r.json(), { ok: false, reason: 'off' });
    assert.equal(r.headers.get('cache-control'), 'private, no-store, max-age=0');
    assert.equal(cmdLog.length, 0);
  });
  process.env.COUPON_ANDROID = '1';
  await t('켜짐: 200 번호·Play 주소 → 같은 IP 재요청 again(같은 번호) → 다른 IP 다른 번호 · 집계 예약(claim:new/again)', async () => {
    resetStore(); SETS.set('promo:pv:play:pool', new Set([FAKE(1), FAKE(2), FAKE(3)]));
    afterCalls.length = 0;
    let r = await claimRoute.POST(claimReq(FETCH(UA.android, { 'x-coupon-test-ip': 'a1' })));
    assert.equal(r.status, 200);
    const j1 = await r.json();
    assert.equal(j1.ok, true); assert.ok(PLAY_ONE_TIME_RE.test(j1.code)); assert.equal(j1.url, playRedeemUrl(j1.code)); assert.equal(j1.again, false);
    assert.ok(cmdLog.includes('SPOP') && cmdLog.includes('SET') && cmdLog.includes('HSET') && cmdLog.includes('EXPIRE'), cmdLog.join(','));
    assert.equal(S.get(`promo:pv:play:day:${day}`), '1');
    assert.ok(TTL.get(`promo:pv:play:day:${day}`)! > 0, '하루 키에 만료가 붙는다');
    r = await claimRoute.POST(claimReq(FETCH(UA.kakaoAnd, { 'x-coupon-test-ip': 'a1' })));
    const j2 = await r.json(); assert.equal(r.status, 200); assert.equal(j2.code, j1.code); assert.equal(j2.again, true);
    r = await claimRoute.POST(claimReq(FETCH(UA.android, { 'x-coupon-test-ip': 'a2' })));
    const j3 = await r.json(); assert.notEqual(j3.code, j1.code);
    assert.equal(afterCalls.length, 3, '요청마다 집계 1건(응답 뒤)');
    assert.ok([...H.get('promo:pv:play:claims')!.keys()].length === 2);
    assert.ok(![...S.keys()].some((k) => k.startsWith('promo:play:')), '미리보기는 운영 키를 건드리지 않는다');
  });
  await t('하루 상한(COUPON_ANDROID_DAILY_CAP=2) → 429 cap + resetAt · 소진 → 410 empty', async () => {
    resetStore(); SETS.set('promo:pv:play:pool', new Set([FAKE(1), FAKE(2), FAKE(3)]));
    process.env.COUPON_ANDROID_DAILY_CAP = '2';
    for (const ip of ['c1', 'c2']) assert.equal((await claimRoute.POST(claimReq(FETCH(UA.android, { 'x-coupon-test-ip': ip })))).status, 200);
    let r = await claimRoute.POST(claimReq(FETCH(UA.android, { 'x-coupon-test-ip': 'c3' })));
    assert.equal(r.status, 429); const j = await r.json(); assert.equal(j.reason, 'cap'); assert.equal(j.resetAt, nextKstMidnight());
    delete process.env.COUPON_ANDROID_DAILY_CAP;
    resetStore(); SETS.set('promo:pv:play:pool', new Set());
    r = await claimRoute.POST(claimReq(FETCH(UA.android, { 'x-coupon-test-ip': 'e1' })));
    assert.equal(r.status, 410); assert.deepEqual(await r.json(), { ok: false, reason: 'empty' });
  });
  await t('거절: 아이폰 403 device · 헤드리스 403 bot · 전용 헤더 없음 403 origin — 저장소 명령 0', async () => {
    resetStore();
    assert.deepEqual(await (await claimRoute.POST(claimReq(FETCH(UA.iphone)))).json(), { ok: false, reason: 'device' });
    assert.deepEqual(await (await claimRoute.POST(claimReq(FETCH(UA.headlessAnd)))).json(), { ok: false, reason: 'bot' });
    const { 'x-coupon': _x, ...noHeader } = FETCH(UA.android); void _x;
    const r = await claimRoute.POST(claimReq(noHeader)); assert.equal(r.status, 403);
    assert.equal(cmdLog.length, 0);
  });
  await t('저장소 장애·설정 없음 → 503 unavailable(번호를 «소진»이라 속이지 않는다)', async () => {
    resetStore(); SETS.set('promo:pv:play:pool', new Set([FAKE(1)]));
    upstashDown = true;
    let r = await claimRoute.POST(claimReq(FETCH(UA.android, { 'x-coupon-test-ip': 'd1' })));
    assert.equal(r.status, 503); assert.equal((await r.json()).reason, 'unavailable');
    upstashDown = false;
    const url = process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_URL;
    r = await claimRoute.POST(claimReq(FETCH(UA.android, { 'x-coupon-test-ip': 'd2' })));
    assert.equal(r.status, 503);
    process.env.UPSTASH_REDIS_REST_URL = url;
  });
  await t('운영(VERCEL_ENV=production)은 promo:play:* 를 쓰고 시험 IP 헤더를 듣지 않는다', async () => {
    process.env.VERCEL_ENV = 'production'; resetStore(); SETS.set('promo:play:pool', new Set([FAKE(5)]));
    const r = await claimRoute.POST(claimReq(FETCH(UA.android, { 'x-coupon-test-ip': 'spoof', 'x-real-ip': '198.51.100.77' })));
    assert.equal(r.status, 200); assert.equal((await r.json()).code, FAKE(5));
    const secret = process.env.UPSTASH_REDIS_REST_TOKEN || '';
    assert.equal(S.get(`promo:play:ip:${ipHash('198.51.100.77', secret)}`), FAKE(5), 'IP 해시는 실제 IP 로');
    assert.ok(![...S.keys()].some((k) => k.includes(ipHash('spoof', secret))));
    process.env.VERCEL_ENV = 'preview';
  });

  console.log('━━━ 6. 단추 비콘 API ━━━');
  await t('닫힌 목록 단추 + 태그 + 사람 → 집계 1건 · 모르는 단추·태그 없음·봇 → 0건 · 항상 204', async () => {
    const ev = (q: string, ua: string, extra: Record<string, string> = {}) => eventRoute.POST(new NextRequest(`https://www.signumhq.com/api/coupon/event?${q}`, { method: 'POST', headers: { 'user-agent': ua, 'accept-language': 'ko', ...extra } }));
    afterCalls.length = 0;
    let r = await ev('ev=apply&f=threads', UA.iphone); assert.equal(r.status, 204); assert.equal(afterCalls.length, 1);
    r = await ev('ev=play&f=threads', UA.android); assert.equal(afterCalls.length, 2);
    r = await ev('ev=claim&f=threads', UA.android); assert.equal(r.status, 204); assert.equal(afterCalls.length, 2, 'claim 은 단추 목록 밖(배정 API 가 센다)');
    r = await ev('ev=copy', UA.android); assert.equal(afterCalls.length, 2, '태그 없음');
    r = await ev('ev=copy&f=threads', UA.headlessAnd); assert.equal(afterCalls.length, 2, '봇');
    r = await ev('ev=copy&f=threads', UA.android, { origin: 'https://evil.example' }); assert.equal(afterCalls.length, 2, '남의 오리진');
  });

  console.log('━━━ 7. 앱 «코드 입력» 뒤 PRO 새로 읽기 순서 ━━━');
  const flow = (proAt: number) => { const log: string[] = []; let checks = 0;
    return { log, deps: {
      check: async () => { checks++; log.push('check'); return checks >= proAt; },
      sync: async () => { log.push('sync'); },
      wait: async (ms: number) => { log.push(`wait${ms}`); },
    } }; };
  await t('iOS 시트: 바로 PRO 면 한 번 읽고 끝 · syncPurchases 안 부름', async () => {
    const f = flow(1); assert.equal(await refreshProAfterRedeem('sheet', f.deps), true); assert.deepEqual(f.log, ['check']);
  });
  await t('iOS 시트: 늦게 반영되면 3초·8초 뒤 다시 읽기만(sync 없음) · 끝까지 아니면 false', async () => {
    const f = flow(99); assert.equal(await refreshProAfterRedeem('sheet', f.deps), false);
    assert.deepEqual(f.log, ['check', 'wait3000', 'check', 'wait8000', 'check']);
  });
  await t('iOS URL 경로: 문서대로 돌아오자마자 syncPurchases → 다시 읽기', async () => {
    const f = flow(2); assert.equal(await refreshProAfterRedeem('url', f.deps), true); assert.deepEqual(f.log, ['check', 'sync', 'check']);
  });
  await t('안드 Play: SDK 가 앞으로 올 때 동기화 — 3초·8초 뒤에도 아니면 그때만 syncPurchases 한 번', async () => {
    const f = flow(99); assert.equal(await refreshProAfterRedeem('play', f.deps), false);
    assert.deepEqual(f.log, ['check', 'wait3000', 'check', 'wait8000', 'check', 'sync', 'check']);
    const g = flow(2); assert.equal(await refreshProAfterRedeem('play', g.deps), true); assert.deepEqual(g.log, ['check', 'wait3000', 'check']);
  });

  console.log(`\n✅ coupon: ${n}건 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
