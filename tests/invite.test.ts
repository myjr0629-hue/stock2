/**
 * 공유 카드 + 추천 보상(바이럴 루프) — 2026-10-14 (브랜치 feat/viral-loop)
 *   동기 SHA-256(node:crypto 와 같은 값) · 익명 초대 신원(비공개 열쇠 → 공개 id, 기존 선물 ref 형식 통과) · 링크 규칙 ·
 *   추천 엔진(터치 → 도착 매칭 → 초대자 크레딧 → 선물함 번호 배정 · 부정 방지: 같은 기기·같은 IP·자기 초대·초대자 상한·하루 상한·풀 예비분) ·
 *   API 가드(우리 앱 fetch 만) · /api/invite/{arrive,inbox,config} · /app 터치 기록 · share-hit 새 표면·초대자 목록 · 문구 규칙(가짜 희소성·가격 숫자 없음) · 도착 판정·알림 판정
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/invite.test.ts
 *
 * 번호는 «시험용 가짜»만 쓴다(애플 일회용 형식 GZTEST…, Play 일회용 23자 ZZTEST…) — 진짜 번호는 저장소 어디에도 쓰지 않는다.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import Module from 'node:module';

// ── next/server 의 after 를 가로챈다(라우트 import 보다 먼저) ──
const afterCalls: Array<() => unknown> = [];
const nsPath = require.resolve('next/server');
const realNs = require(nsPath);
require.cache[nsPath] = { id: nsPath, filename: nsPath, loaded: true, exports: { ...realNs, after: (fn: () => unknown) => { afterCalls.push(fn); } } } as unknown as Module;
const flush = async () => { const fns = afterCalls.splice(0); for (const f of fns) await f(); };

// ── 가짜 EC2 레디스(지표·클릭 집계) ──
const ec2 = new Map<string, unknown>();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rc = require('../src/services/redisClient');
rc.getFromCache = async (k: string) => (ec2.has(k) ? ec2.get(k) : null);
rc.setInCache = async (k: string, v: unknown) => { ec2.set(k, v); return true; };

// ── 가짜 Upstash(추천 저장소) — 라우트가 부르는 upstashInviteStore 만 바꾼다 ──
import { memoryInviteStore } from '../src/lib/invite/memoryStore';
const mem = memoryInviteStore();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const storeMod = require('../src/lib/invite/store');
storeMod.upstashInviteStore = () => mem;

import { NextRequest } from 'next/server';
import { sha256Hex, sha256Bytes } from '../src/lib/invite/sha256';
import {
  INVITE_KEY_RE, getInviteKey, getInviteRef, hasInviteShared, inviteRefOf, markInviteShared, newInviteKey, normalizeInviteKey,
  INVITE_KEY_STORAGE, INVITE_SHARED_KEY,
} from '../src/lib/invite/identity';
import { GIFT_REF_RE, normalizeGiftRef } from '../src/lib/gift/gift';
import {
  SHARE_FROM, SHARE_SURFACE, buildShareCardUrl, inviteAppHref, isInviteFrom, isShareKind, normalizeShareTicker, surfaceOfFrom, toInviteLang,
} from '../src/lib/invite/kinds';
import {
  ANDROID_REWARD_POOL_RESERVE, DAILY_CREDIT_CAP, INVITER_LIFETIME_CAP, TOUCH_TTL_SEC, arrive, etDay, inbox, inviteConfig, inviteKeys, recordTouch, touchPlan,
} from '../src/lib/invite/engine';
import { couponKeys } from '../src/lib/marketing/coupon';
import { hashFromRaw } from '../src/lib/invite/store';
import { ipFamily, ipLooseFamily, inviteClientIp, inviteDenyReason, inviteIpHash, inviteLooseHash, inviteOs } from '../src/lib/invite/guard';
import { INVITE_COPY } from '../src/lib/invite/copy';
import { ARRIVED_KEY, arrivalDecision, newItems } from '../src/lib/invite/inboxClient';
import { parseInviteConfig } from '../src/lib/invite/useInvite';
import { audienceLine } from '../src/lib/marketing/coupon';
import { previewHtml, inviteCardCopy } from '../src/lib/marketing/linkPreview';
import { SHARE_ORIGIN } from '../src/lib/share/share';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const arriveRoute = require('../src/app/api/invite/arrive/route');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const inboxRoute = require('../src/app/api/invite/inbox/route');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const configRoute = require('../src/app/api/invite/config/route');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sg = require('../src/app/app/route');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const shareHit = require('../src/app/api/share-hit/route');

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  iphoneWebView: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  kakaoScrap: 'facebookexternalhit/1.1; kakaotalk-scrap/1.0; +https://devtalk.kakao.com/t/scrap/33984',
};
const NAV = { 'accept-language': 'ko-KR,ko;q=0.9', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', 'sec-fetch-site': 'cross-site', 'sec-fetch-user': '?1' };
const APPFETCH = { 'accept-language': 'ko-KR,ko;q=0.9', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', 'x-invite': '1' };

const HOST = 'https://www.signumhq.com';
const getReq = (path: string, ua: string, extra: Record<string, string> = NAV) => new NextRequest(`${HOST}${path}`, { headers: { 'user-agent': ua, ...extra } });
const postReq = (path: string, ua: string, body: unknown, extra: Record<string, string> = {}) =>
  new NextRequest(`${HOST}${path}`, { method: 'POST', headers: { 'user-agent': ua, ...APPFETCH, ...extra }, body: JSON.stringify(body) });

// 시험용 가짜 번호
const APPLE = (i: number) => `GZTEST${String(i).padStart(4, '0')}`;          // 애플 일회용 형식(8~24자 대문자·숫자)
const PLAY = (i: number) => `ZZTEST${String(i).padStart(17, '0')}`;           // Play 일회용 형식(23자)
const KEY_A = 'abcdefghjkmnpqrstuvw2345';   // 초대자(24자)
const KEY_B = 'mnpqrstuvwxyz2345abcdefg';   // 친구
const KEY_C = 'zyxwvutsrqpnmkjhgfedcba6';
const REF_A = inviteRefOf(KEY_A);
const REF_B = inviteRefOf(KEY_B);
const IPH = (n: number) => `iph${String(n).padStart(21, '0')}`;
const K = inviteKeys('preview');
const NOW = Date.parse('2026-10-14T12:00:00Z');

const resetAll = () => { ec2.clear(); afterCalls.length = 0; };
let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };

(async () => {
  // ─────────────────────────── SHA-256 ───────────────────────────
  await t('동기 SHA-256 은 node:crypto 와 같은 값(빈 문자열·긴 글·다국어·경계 길이 55~65바이트)', () => {
    const samples = ['', 'abc', 'signum-invite-ref-v1|abcdefghjkmnpqrstuvw2345', '가나다라마바사 — 美国株', '😀 emoji', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(63), 'x'.repeat(64), 'x'.repeat(65), 'y'.repeat(1000)];
    for (let i = 0; i < 40; i++) samples.push(crypto.randomBytes(1 + (i * 7) % 90).toString('base64'));
    for (const s of samples) assert.equal(sha256Hex(s), crypto.createHash('sha256').update(s, 'utf8').digest('hex'), s.slice(0, 20));
    assert.equal(sha256Bytes('abc').length, 32);
  });

  // ─────────────────────────── 익명 초대 신원 ───────────────────────────
  await t('열쇠: 24자·글자판 31자만·형식 검사 · ref 는 열쇠에서 늘 같은 10자 · 기존 선물 ref 형식(GIFT_REF_RE: 숫자 1자 이상)을 통과 · 다른 열쇠는 다른 ref', () => {
    let seed = 7;
    const lcg = (max: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % max; };
    const refs = new Set<string>();
    for (let i = 0; i < 1500; i++) {
      const k = newInviteKey(lcg);
      assert.equal(k.length, 24); assert.ok(INVITE_KEY_RE.test(k), k);
      assert.ok(!/[il o01]/.test(k), '헷갈리는 글자 없음');
      const r = inviteRefOf(k);
      assert.equal(r.length, 10); assert.ok(GIFT_REF_RE.test(r), r); assert.equal(normalizeGiftRef(r), r);
      assert.equal(inviteRefOf(k), r, '결정적');
      refs.add(r);
    }
    assert.ok(refs.size > 1490, `충돌 거의 없음: ${refs.size}`);
    assert.notEqual(REF_A, REF_B);
    assert.ok(!KEY_A.startsWith(REF_A) && !KEY_A.includes(REF_A), 'ref 는 열쇠 조각이 아니다(한 방향)');
    for (const bad of ['', 'short', 'ABCDEFGHJKMNPQRSTUVW2345X'.slice(0, 5), 'abcdefghjkmnpqrstuvw234i', 'a'.repeat(33), 'abc def ghjkmnpqrstuvw2345']) assert.equal(normalizeInviteKey(bad), null, bad);
    assert.equal(normalizeInviteKey(`  ${KEY_A.toUpperCase()} `), KEY_A);
    // 숫자가 하나도 없는 해시도 숫자를 넣는다(난수 대신 열쇠 두 개를 직접 고르기 어려우니 규칙을 많은 열쇠로 검증)
    for (let i = 0; i < 3000; i++) assert.ok(/\d/.test(inviteRefOf(newInviteKey(lcg))));
  });
  await t('기기 저장: 처음엔 만들어 저장 · 다음엔 같은 열쇠 · 깨진 값은 새로 · 저장소가 막혀도 화면이 열려 있는 동안 같은 값 · «공유했다» 표식', () => {
    const mem2 = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => mem2.get(k) ?? null, setItem: (k: string, v: string) => { mem2.set(k, v); } };
    const a = getInviteKey(); assert.ok(INVITE_KEY_RE.test(a)); assert.equal(mem2.get(INVITE_KEY_STORAGE), a);
    assert.equal(getInviteKey(), a); assert.equal(getInviteRef(), inviteRefOf(a));
    mem2.set(INVITE_KEY_STORAGE, 'BAD VALUE'); const b = getInviteKey(); assert.ok(INVITE_KEY_RE.test(b)); assert.notEqual(b, 'BAD VALUE');
    assert.equal(hasInviteShared(), false); markInviteShared(123); assert.equal(mem2.get(INVITE_SHARED_KEY), '123'); assert.equal(hasInviteShared(), true);
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    const c = getInviteKey(); assert.ok(INVITE_KEY_RE.test(c)); assert.equal(getInviteKey(), c); assert.equal(hasInviteShared(), false); markInviteShared();
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  // ─────────────────────────── 링크 규칙 ───────────────────────────
  await t('공유 카드 링크: 운영 www · /<언어>/s/<종류>/<티커>?from=share_<종류>&ref=…&via=… · 형식 밖 ref 는 붙이지 않는다 · 언어는 ko·ja·en 만', () => {
    assert.equal(SHARE_ORIGIN, 'https://www.signumhq.com');
    assert.equal(buildShareCardUrl('pick', { locale: 'ko', ticker: 'nvda', ref: REF_A, via: 'ios' }), `${SHARE_ORIGIN}/ko/s/pick/NVDA?from=share_pick&ref=${REF_A}&via=ios`);
    assert.equal(buildShareCardUrl('line', { locale: 'ja', ticker: 'AAPL', ref: REF_A, via: 'android' }), `${SHARE_ORIGIN}/ja/s/line/AAPL?from=share_line&ref=${REF_A}&via=android`);
    assert.equal(buildShareCardUrl('earn', { locale: 'zz', ticker: 'BRK.B', ref: null, via: 'weird' }), `${SHARE_ORIGIN}/en/s/earn/BRK.B?from=share_earn&via=web`);
    assert.equal(buildShareCardUrl('pick', { locale: 'en', ticker: 'MSFT', ref: 'google' }), `${SHARE_ORIGIN}/en/s/pick/MSFT?from=share_pick&via=web`);
    assert.deepEqual(SHARE_FROM, { pick: 'share_pick', line: 'share_line', earn: 'share_earn' });
    assert.deepEqual(SHARE_SURFACE, { pick: 'sh_pick', line: 'sh_line', earn: 'sh_earn' });
    for (const f of Object.values(SHARE_FROM)) assert.ok(/^[a-z0-9_]{1,24}$/.test(f), '스마트링크 태그 형식(FROM_RE)');
  });
  await t('앱으로 잇는 주소: /app?from=share_<종류>[&code][&ref][&l] — 영어는 l 생략 · 코드는 형식 맞을 때만 대문자로', () => {
    assert.equal(inviteAppHref('pick', { lang: 'ko', ref: REF_A, code: 'giftpro' }), `${SHARE_ORIGIN}/app?from=share_pick&code=GIFTPRO&ref=${REF_A}&l=ko`);
    assert.equal(inviteAppHref('earn', { lang: 'en', ref: REF_A }), `${SHARE_ORIGIN}/app?from=share_earn&ref=${REF_A}`);
    assert.equal(inviteAppHref('line', { lang: 'ja', ref: null, code: 'A B' }), `${SHARE_ORIGIN}/app?from=share_line&l=ja`);
  });
  await t('초대 태그 판정: gift·share_* 만 · 표면 매핑 · 종류·티커 검사', () => {
    for (const f of ['gift', 'share_pick', 'share_line', 'share_earn', 'GIFT', 'Share_Pick']) assert.equal(isInviteFrom(f), true, f);
    for (const f of ['share', 'share_x', 'home', 'threads', '', null, undefined, 'giftx']) assert.equal(isInviteFrom(f as never), false, String(f));
    assert.equal(surfaceOfFrom('share_line'), 'sh_line'); assert.equal(surfaceOfFrom('gift'), 'gift'); assert.equal(surfaceOfFrom('home'), null);
    assert.equal(isShareKind('pick'), true); assert.equal(isShareKind('gift'), false);
    assert.equal(normalizeShareTicker(' nvda '), 'NVDA'); assert.equal(normalizeShareTicker('BRK.B'), 'BRK.B');
    for (const bad of ['', '1ABC', 'TOOLONGTICKER', 'A B', 'A/B', '<x>', null, 5]) assert.equal(normalizeShareTicker(bad as never), null, String(bad));
    assert.equal(toInviteLang('ko'), 'ko'); assert.equal(toInviteLang('fr'), 'en'); assert.equal(toInviteLang(undefined), 'en');
  });

  // ─────────────────────────── 가드 ───────────────────────────
  await t('IP 가족: IPv4 그대로 · IPv6 는 앞 64비트(4칸) · ::ffff:v4 는 v4 · 축약(::)을 풀어 같은 /64 는 같은 값', () => {
    assert.equal(ipFamily('203.0.113.7'), '203.0.113.7');
    assert.equal(ipFamily('::ffff:203.0.113.7'), '203.0.113.7');
    assert.equal(ipFamily('2001:db8:aaaa:bbbb:1111:2222:3333:4444'), '2001:db8:aaaa:bbbb::/64');
    assert.equal(ipFamily('2001:db8:aaaa:bbbb::1'), '2001:db8:aaaa:bbbb::/64');
    assert.equal(ipFamily('2001:0db8:AAAA:bbbb:ffff:ffff:ffff:ffff'), '2001:db8:aaaa:bbbb::/64');
    assert.equal(ipFamily('2001:db8::1'), '2001:db8:0:0::/64');
    assert.equal(inviteIpHash('2001:db8:aaaa:bbbb:1::1', 's'), inviteIpHash('2001:db8:aaaa:bbbb:ffff::2', 's'), '같은 /64 → 같은 해시');
    assert.notEqual(inviteIpHash('2001:db8:aaaa:cccc::1', 's'), inviteIpHash('2001:db8:aaaa:bbbb::1', 's'));
    assert.equal(inviteIpHash('203.0.113.7', 'k1').length, 24);
    assert.notEqual(inviteIpHash('203.0.113.7', 'k1'), inviteIpHash('203.0.113.7', 'k2'), '열쇠가 다르면 해시도 다르다');
    assert.ok(!inviteIpHash('203.0.113.7', 'k1').includes('203'), '원문 조각이 없다');
  });
  await t('느슨한 IP 가족: IPv4 는 앞 3칸(/24) · IPv6 는 /48 · 같은 /24 는 같은 느슨한 해시 · 정확한 해시와 접두사가 달라 섞이지 않는다', () => {
    assert.equal(ipLooseFamily('203.0.113.7'), '203.0.113.0/24'); assert.equal(ipLooseFamily('::ffff:203.0.113.200'), '203.0.113.0/24');
    assert.equal(ipLooseFamily('2001:db8:aaaa:bbbb:1::1'), '2001:db8:aaaa::/48'); assert.equal(ipLooseFamily('2001:db8:aaaa:cccc::9'), '2001:db8:aaaa::/48');
    assert.equal(inviteLooseHash('203.0.113.7', 's'), inviteLooseHash('203.0.113.250', 's')); assert.notEqual(inviteLooseHash('203.0.113.7', 's'), inviteLooseHash('203.0.114.7', 's'));
    assert.notEqual(inviteLooseHash('203.0.113.0', 's'), inviteIpHash('203.0.113.0', 's'), '정확한 해시와 값이 다르다');
    assert.equal(inviteLooseHash('203.0.113.7', 's').length, 24);
  });
  await t('HGETALL 응답 정리: 배열(필드·값 번갈아 — automaticDeserialization 끔)도 객체(예전 모양)도 같은 객체로 — 운영 e2e 에서 번호가 «1»로 보이던 결함의 고정', () => {
    assert.deepEqual(hashFromRaw(['GZTEST0001', '{"os":"ios","at":1}', 'GZTEST0002', '{"os":"ios","at":2}']), { GZTEST0001: '{"os":"ios","at":1}', GZTEST0002: '{"os":"ios","at":2}' });
    assert.deepEqual(hashFromRaw({ GZTEST0001: '{"os":"ios","at":1}' }), { GZTEST0001: '{"os":"ios","at":1}' });
    assert.deepEqual(hashFromRaw([]), {}); assert.deepEqual(hashFromRaw(null), {}); assert.deepEqual(hashFromRaw(['홀수']), {});
  });
  await t('IP 읽기: 운영은 x-invite-test-ip 를 절대 듣지 않는다 · 미리보기는 듣는다 · Vercel 헤더 우선', () => {
    const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
    assert.equal(inviteClientIp(h({ 'x-invite-test-ip': '9.9.9.9', 'x-vercel-forwarded-for': '1.2.3.4' }), 'production'), '1.2.3.4');
    assert.equal(inviteClientIp(h({ 'x-invite-test-ip': '9.9.9.9', 'x-vercel-forwarded-for': '1.2.3.4' }), 'preview'), '9.9.9.9');
    assert.equal(inviteClientIp(h({ 'x-real-ip': '5.6.7.8' }), 'production'), '5.6.7.8');
    assert.equal(inviteClientIp(h({ 'x-forwarded-for': '7.7.7.7, 8.8.8.8' }), 'production'), '7.7.7.7');
    assert.equal(inviteClientIp(h({}), 'production'), null);
  });
  await t('API 가드: 우리 앱 fetch(x-invite·JSON·same-origin)만 통과 · 봇·언어 없음·헤더 없음·교차 출처·폼 이동은 거절', () => {
    const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
    const ok = { 'user-agent': UA.iphoneWebView, ...APPFETCH };
    assert.equal(inviteDenyReason(h(ok), 'www.signumhq.com'), null);
    assert.equal(inviteDenyReason(h({ ...ok, 'user-agent': 'python-requests/2.31' }), 'www.signumhq.com'), 'bot');
    assert.equal(inviteDenyReason(h({ ...ok, 'user-agent': UA.kakaoScrap }), 'www.signumhq.com'), 'bot');
    assert.equal(inviteDenyReason(h({ ...ok, 'accept-language': '' }), 'www.signumhq.com'), 'bot');
    assert.equal(inviteDenyReason(h({ ...ok, 'x-invite': '0' }), 'www.signumhq.com'), 'origin');
    assert.equal(inviteDenyReason(h({ ...ok, 'content-type': 'text/plain' }), 'www.signumhq.com'), 'origin');
    assert.equal(inviteDenyReason(h({ ...ok, 'sec-fetch-site': 'cross-site' }), 'www.signumhq.com'), 'origin');
    assert.equal(inviteDenyReason(h({ ...ok, 'sec-fetch-mode': 'navigate' }), 'www.signumhq.com'), 'origin');
    const noSf = { ...ok } as Record<string, string>; delete noSf['sec-fetch-site']; delete noSf['sec-fetch-mode'];
    assert.equal(inviteDenyReason(h({ ...noSf, origin: 'https://www.signumhq.com' }), 'www.signumhq.com'), null, 'Sec-Fetch 없는 옛 브라우저는 Origin 이 같은 호스트면');
    assert.equal(inviteDenyReason(h({ ...noSf, origin: 'https://evil.example' }), 'www.signumhq.com'), 'origin');
    assert.equal(inviteOs(h({ 'user-agent': UA.iphoneWebView })), 'ios'); assert.equal(inviteOs(h({ 'user-agent': UA.android })), 'android'); assert.equal(inviteOs(h({ 'user-agent': UA.mac })), null);
  });

  // ─────────────────────────── 엔진: 터치 ───────────────────────────
  await t('터치 계획: 초대 태그·형식 맞는 ref·폰·사람·IP 가 모두 있을 때만 — 하나라도 빠지면 쓰지 않는다', () => {
    const ok = { ref: REF_A, from: 'share_pick', os: 'ios' as const, ipHash: IPH(1), human: true };
    assert.deepEqual(touchPlan(ok), { ref: REF_A, os: 'ios', ipHash: IPH(1), from: 'share_pick' });
    assert.ok(touchPlan({ ...ok, from: 'gift', os: 'android' }));
    for (const bad of [{ human: false }, { ipHash: null }, { os: 'desktop' as const }, { from: 'home' }, { from: null }, { ref: 'google' }, { ref: null }, { ref: 'k7' }]) {
      assert.equal(touchPlan({ ...ok, ...bad } as never), null, JSON.stringify(bad));
    }
  });
  await t('터치 기록: 같은 IP·기기 종류의 칸에 «가장 최근 링크»가 이긴다 · 72시간 TTL · 다른 기기 종류는 다른 칸', async () => {
    const s = memoryInviteStore();
    assert.equal(await recordTouch(s, { ref: REF_A, from: 'share_pick', os: 'ios', ipHash: IPH(1), human: true, now: NOW, vercelEnv: 'preview' }), true);
    assert.equal(await recordTouch(s, { ref: REF_B, from: 'gift', os: 'ios', ipHash: IPH(1), human: true, now: NOW + 1000, vercelEnv: 'preview' }), true);
    assert.equal(await recordTouch(s, { ref: REF_A, from: 'gift', os: 'android', ipHash: IPH(1), human: true, now: NOW, vercelEnv: 'preview' }), true);
    const d = s.dump() as { kv: Record<string, string>; ttl: Record<string, number> };
    const rec = JSON.parse(d.kv[K.touch('ios', IPH(1))]); assert.equal(rec.r, REF_B); assert.equal(rec.f, 'gift');
    assert.equal(d.ttl[K.touch('ios', IPH(1))], TOUCH_TTL_SEC); assert.equal(TOUCH_TTL_SEC, 72 * 3600);
    assert.ok(d.kv[K.touch('android', IPH(1))]);
    assert.equal(await recordTouch(s, { ref: REF_A, from: 'home', os: 'ios', ipHash: IPH(2), human: true, vercelEnv: 'preview' }), false);
    assert.ok(!d.kv[K.touch('ios', IPH(2))]);
  });

  // ─────────────────────────── 엔진: 도착 매칭 ───────────────────────────
  const touchFor = (s: ReturnType<typeof memoryInviteStore>, ref: string, ip: number, os: 'ios' | 'android' = 'ios', from = 'share_pick', at = NOW) =>
    recordTouch(s, { ref, from, os, ipHash: IPH(ip), human: true, now: at, vercelEnv: 'preview' });
  const arr = (s: ReturnType<typeof memoryInviteStore>, key: string, ip: number, os: 'ios' | 'android' = 'ios', now = NOW + 60_000) =>
    arrive(s, { key, os, ipHash: IPH(ip), now, vercelEnv: 'preview' });

  await t('도착: 터치가 없으면 none · 터치가 있으면 매칭+초대자에게 크레딧 1(친구 수도 1) · 같은 기기의 두 번째 호출은 again(다시 세지 않는다)', async () => {
    const s = memoryInviteStore();
    assert.deepEqual(await arr(s, KEY_B, 1), { matched: false, reason: 'none' });
    await touchFor(s, REF_A, 2);
    const s2 = memoryInviteStore();
    await touchFor(s2, REF_A, 2);
    const r = await arr(s2, KEY_B, 2);
    assert.deepEqual(r, { matched: true, credited: true, from: 'share_pick', inviterRef: REF_A });
    assert.equal(await s2.get(K.credit(REF_A)), '1'); assert.equal(await s2.get(K.friends(REF_A)), '1'); assert.equal(await s2.get(K.cnt(REF_A)), '1');
    assert.deepEqual(await arr(s2, KEY_B, 2), { matched: false, reason: 'again' }, '같은 기기 평생 1회');
    assert.equal(await s2.get(K.credit(REF_A)), '1');
  });
  await t('도착: 기기 종류가 다르면(아이폰 터치 ↔ 안드 도착) 매칭 안 함 · 72시간이 지난 터치는 무효 · 형식 밖 열쇠·IP 없음은 bad', async () => {
    const s = memoryInviteStore();
    await touchFor(s, REF_A, 3, 'ios');
    assert.deepEqual(await arr(s, KEY_B, 3, 'android'), { matched: false, reason: 'none' });
    const s2 = memoryInviteStore();
    await touchFor(s2, REF_A, 3, 'ios', 'gift', NOW);
    assert.deepEqual(await arr(s2, KEY_B, 3, 'ios', NOW + TOUCH_TTL_SEC * 1000 + 1), { matched: false, reason: 'none' });
    const s3 = memoryInviteStore();
    await touchFor(s3, REF_A, 3, 'ios', 'gift', NOW);
    assert.equal((await arr(s3, KEY_B, 3, 'ios', NOW + TOUCH_TTL_SEC * 1000 - 1)).matched, true, '72시간 직전은 유효');
    assert.deepEqual(await arrive(s3, { key: 'nope', os: 'ios', ipHash: IPH(3), now: NOW, vercelEnv: 'preview' }), { matched: false, reason: 'bad' });
    assert.deepEqual(await arrive(s3, { key: KEY_C, os: 'ios', ipHash: null, now: NOW, vercelEnv: 'preview' }), { matched: false, reason: 'bad' });
    assert.deepEqual(await arrive(s3, { key: KEY_C, os: 'desktop', ipHash: IPH(1), now: NOW, vercelEnv: 'preview' }), { matched: false, reason: 'bad' });
  });
  await t('느슨한 매칭: 정확한 IP 터치가 없으면 같은 /24 의 가장 최근 터치로 맞춘다(loose 표시) · 정확한 터치가 있으면 그것이 이긴다 · 다른 /24 는 안 맞는다', async () => {
    const L = (ip: string) => inviteLooseHash(ip, 's');
    const touchL = (s: ReturnType<typeof memoryInviteStore>, ref: string, ip: number, loose: string, os: 'ios' | 'android' = 'ios') =>
      recordTouch(s, { ref, from: 'share_pick', os, ipHash: IPH(ip), looseHash: loose, human: true, now: NOW, vercelEnv: 'preview' });
    const s = memoryInviteStore();
    await touchL(s, REF_A, 30, L('198.51.100.10'));
    const r = await arrive(s, { key: KEY_B, os: 'ios', ipHash: IPH(31), looseHash: L('198.51.100.77'), now: NOW + 1000, vercelEnv: 'preview' });
    assert.deepEqual(r, { matched: true, credited: true, from: 'share_pick', inviterRef: REF_A, loose: true });
    // 정확한 터치가 있으면 loose 가 아니다
    const s2 = memoryInviteStore();
    await touchL(s2, REF_A, 32, L('198.51.100.10'));
    const e = await arrive(s2, { key: KEY_B, os: 'ios', ipHash: IPH(32), looseHash: L('198.51.100.10'), now: NOW + 1000, vercelEnv: 'preview' });
    assert.equal((e as { loose?: boolean }).loose, undefined); assert.equal(e.matched, true);
    // 다른 /24 · 다른 기기 종류는 안 맞는다
    const s3 = memoryInviteStore();
    await touchL(s3, REF_A, 33, L('198.51.100.10'));
    assert.deepEqual(await arrive(s3, { key: KEY_B, os: 'ios', ipHash: IPH(34), looseHash: L('198.51.101.10'), now: NOW + 1000, vercelEnv: 'preview' }), { matched: false, reason: 'none' });
    const s4 = memoryInviteStore();
    await touchL(s4, REF_A, 35, L('198.51.100.10'));
    assert.deepEqual(await arrive(s4, { key: KEY_B, os: 'android', ipHash: IPH(36), looseHash: L('198.51.100.20'), now: NOW + 1000, vercelEnv: 'preview' }), { matched: false, reason: 'none' });
    // loose 로 맞아도 부정 방지 관문은 그대로 — 같은 «정확한 IP» 는 30일에 한 번만 적립
    const s5 = memoryInviteStore();
    await touchL(s5, REF_A, 37, L('198.51.100.10'));
    assert.equal(((await arrive(s5, { key: newInviteKey(), os: 'ios', ipHash: IPH(38), looseHash: L('198.51.100.11'), now: NOW + 1000, vercelEnv: 'preview' })) as { credited: boolean }).credited, true);
    await touchL(s5, REF_A, 37, L('198.51.100.10'));
    const dup = await arrive(s5, { key: newInviteKey(), os: 'ios', ipHash: IPH(38), looseHash: L('198.51.100.12'), now: NOW + 2000, vercelEnv: 'preview' });
    assert.deepEqual({ m: dup.matched, c: (dup as { credited?: boolean }).credited, r: (dup as { reason?: string }).reason }, { m: true, c: false, r: 'ip' });
  });
  await t('부정 방지: 자기 초대(터치 ref = 내 ref)는 적립 없음 · 같은 IP 는 30일에 한 번만 적립 · 초대자 평생 3건 상한 · 하루 상한', async () => {
    const s = memoryInviteStore();
    await touchFor(s, REF_B, 4);
    assert.deepEqual(await arr(s, KEY_B, 4), { matched: false, reason: 'self' });
    assert.equal(await s.get(K.credit(REF_B)), null);

    // 같은 IP 에서 서로 다른 친구 둘 → 첫째만 적립(둘째는 매칭은 세되 ip)
    const s2 = memoryInviteStore();
    await touchFor(s2, REF_A, 5);
    const k1 = newInviteKey(), k2 = newInviteKey();
    assert.equal(((await arr(s2, k1, 5)) as { credited: boolean }).credited, true);
    await touchFor(s2, REF_A, 5, 'ios', 'share_line');
    const r2 = await arr(s2, k2, 5);
    assert.deepEqual(r2, { matched: true, credited: false, reason: 'ip', from: 'share_line', inviterRef: REF_A });
    assert.equal(await s2.get(K.credit(REF_A)), '1');

    // 초대자 상한: 다른 IP 4명 → 3건만 적립 + 4번째는 inviter_cap(카운터가 상한을 넘지 않는다)
    const s3 = memoryInviteStore();
    const outs = [];
    for (let i = 0; i < INVITER_LIFETIME_CAP + 1; i++) { await touchFor(s3, REF_A, 10 + i); outs.push(await arr(s3, newInviteKey(), 10 + i)); }
    assert.deepEqual(outs.map((o) => (o as { credited?: boolean }).credited), [true, true, true, false]);
    assert.equal((outs[3] as { reason: string }).reason, 'inviter_cap');
    assert.equal(await s3.get(K.credit(REF_A)), String(INVITER_LIFETIME_CAP)); assert.equal(await s3.get(K.cnt(REF_A)), String(INVITER_LIFETIME_CAP));

    // 하루 상한: 서로 다른 초대자 26명 → 25건 적립 + 26번째 day_cap(초대자 카운터도 되돌린다)
    const s4 = memoryInviteStore();
    let last: unknown = null;
    for (let i = 0; i < DAILY_CREDIT_CAP + 1; i++) {
      const inviter = inviteRefOf(newInviteKey());
      await touchFor(s4, inviter, 100 + i);
      last = await arr(s4, newInviteKey(), 100 + i);
      if (i < DAILY_CREDIT_CAP) assert.equal((last as { credited: boolean }).credited, true, `#${i + 1}`);
    }
    assert.equal((last as { reason: string }).reason, 'day_cap');
    assert.equal(await s4.get(K.day(etDay(NOW + 60_000))), String(DAILY_CREDIT_CAP), '하루 카운터는 상한에서 멈춘다');
  });

  // ─────────────────────────── 엔진: 선물함 ───────────────────────────
  const seedPool = async (s: ReturnType<typeof memoryInviteStore>, ios: number, play: number) => {
    for (let i = 0; i < ios; i++) await s.sadd(K.poolIos, APPLE(i));
    for (let i = 0; i < play; i++) await s.sadd(couponKeys('preview').pool, PLAY(i));
  };
  await t('선물함: 크레딧이 없으면 빈 목록 · 크레딧 1 → 아이폰은 애플 풀에서 번호 1개 · 같은 번호가 두 번 나가지 않는다 · 두 번째 조회는 새로 안 뽑는다', async () => {
    const s = memoryInviteStore(); await seedPool(s, 3, 0);
    assert.deepEqual(await inbox(s, { key: KEY_A, os: 'ios', now: NOW, vercelEnv: 'preview' }), { items: [], minted: 0, waiting: 0, friends: 0 });
    await touchFor(s, REF_A, 20); await arr(s, KEY_B, 20);
    const r1 = (await inbox(s, { key: KEY_A, os: 'ios', now: NOW, vercelEnv: 'preview' }))!;
    assert.equal(r1.minted, 1); assert.equal(r1.items.length, 1); assert.equal(r1.waiting, 0); assert.equal(r1.friends, 1);
    assert.ok(/^GZTEST\d{4}$/.test(r1.items[0].code)); assert.equal(r1.items[0].os, 'ios');
    const r2 = (await inbox(s, { key: KEY_A, os: 'ios', now: NOW + 5, vercelEnv: 'preview' }))!;
    assert.equal(r2.minted, 0); assert.deepEqual(r2.items.map((i) => i.code), r1.items.map((i) => i.code));
    assert.equal(await s.scard(K.poolIos), 2, '풀에서 한 장만 빠졌다');
  });
  await t('선물함: 남의 열쇠로는 못 연다(다른 열쇠 → 다른 칸) · 열쇠 형식 밖 → null · 기기 종류가 다르면 다른 풀(안드는 Play 풀 · 예비분 60장 이하면 멈춘다)', async () => {
    const s = memoryInviteStore(); await seedPool(s, 2, ANDROID_REWARD_POOL_RESERVE + 2);
    await touchFor(s, REF_A, 21); await arr(s, KEY_B, 21);
    assert.equal((await inbox(s, { key: KEY_C, os: 'ios', now: NOW, vercelEnv: 'preview' }))!.items.length, 0, '다른 사람은 못 본다');
    assert.equal(await inbox(s, { key: 'nope', os: 'ios', vercelEnv: 'preview' }), null);
    assert.equal(await inbox(s, { key: KEY_A, os: 'desktop', vercelEnv: 'preview' }), null);
    const a = (await inbox(s, { key: KEY_A, os: 'android', now: NOW, vercelEnv: 'preview' }))!;
    assert.equal(a.minted, 1); assert.equal(a.items[0].os, 'android'); assert.ok(/^ZZTEST\d{17}$/.test(a.items[0].code));
    assert.equal(await s.scard(couponKeys('preview').pool), ANDROID_REWARD_POOL_RESERVE + 1);
    // 예비분: 풀이 60장 «이하»면 안드 보상은 번호를 못 뽑고 크레딧을 그대로 둔다(친구 쿠폰이 먼저)
    const s2 = memoryInviteStore(); await seedPool(s2, 0, ANDROID_REWARD_POOL_RESERVE);
    await touchFor(s2, REF_A, 22); await arr(s2, KEY_B, 22);
    const w = (await inbox(s2, { key: KEY_A, os: 'android', now: NOW, vercelEnv: 'preview' }))!;
    assert.equal(w.minted, 0); assert.equal(w.items.length, 0); assert.equal(w.waiting, 1);
    assert.equal(await s2.scard(couponKeys('preview').pool), ANDROID_REWARD_POOL_RESERVE, '친구용 풀은 건드리지 않았다');
  });
  await t('선물함: 애플 풀이 비면 크레딧을 «그대로» 둔다(waiting) · 풀을 채우면 다음 조회에 번호가 나간다 · 형식 틀린 번호는 따로 치우고 건너뛴다 · 보상 끄기(mint:false)면 새로 안 뽑는다', async () => {
    const s = memoryInviteStore();
    await touchFor(s, REF_A, 23); await arr(s, KEY_B, 23);
    const w = (await inbox(s, { key: KEY_A, os: 'ios', now: NOW, vercelEnv: 'preview' }))!;
    assert.equal(w.minted, 0); assert.equal(w.waiting, 1); assert.equal(w.friends, 1);
    await s.sadd(K.poolIos, 'bad code!'); await s.sadd(K.poolIos, APPLE(9));
    assert.equal((await inbox(s, { key: KEY_A, os: 'ios', mint: false, now: NOW, vercelEnv: 'preview' }))!.minted, 0, '보상 꺼짐');
    const r = (await inbox(s, { key: KEY_A, os: 'ios', now: NOW, vercelEnv: 'preview' }))!;
    assert.equal(r.minted, 1); assert.equal(r.items[0].code, APPLE(9)); assert.equal(await s.scard(`${K.poolIos}:bad`), 1);
  });
  await t('선물함: 동시에 두 번 조회해도 크레딧 1건에 번호는 1장 — 풀에서 두 장이 빠지지 않는다', async () => {
    const s = memoryInviteStore(); await seedPool(s, 5, 0);
    await touchFor(s, REF_A, 24); await arr(s, KEY_B, 24);
    const [x, y] = await Promise.all([inbox(s, { key: KEY_A, os: 'ios', now: NOW, vercelEnv: 'preview' }), inbox(s, { key: KEY_A, os: 'ios', now: NOW, vercelEnv: 'preview' })]);
    assert.equal(x!.minted + y!.minted, 1);
    assert.equal(await s.scard(K.poolIos), 4);
    assert.equal(Number(await s.get(K.credit(REF_A))), 0);
  });
  await t('설정: INVITE_SHARE_OFF=1 이면 공유 단추 꺼짐 · INVITE_REWARD=1 일 때만 보상 켜짐(기본 꺼짐)', () => {
    assert.deepEqual(inviteConfig({}), { share: true, rewards: false });
    assert.deepEqual(inviteConfig({ INVITE_SHARE_OFF: '1', INVITE_REWARD: '1' }), { share: false, rewards: true });
    assert.deepEqual(inviteConfig({ INVITE_REWARD: ' 1 ' }), { share: true, rewards: true });
    assert.deepEqual(inviteConfig({ INVITE_REWARD: 'true' }), { share: true, rewards: false });
    assert.equal(parseInviteConfig({ share: true, rewards: true })?.rewards, true);
    assert.deepEqual(parseInviteConfig({ share: false }), { share: false, rewards: false });
    for (const bad of [null, undefined, {}, { rewards: true }, 'x', { share: 'yes' }]) assert.equal(parseInviteConfig(bad), null, JSON.stringify(bad));
  });

  // ─────────────────────────── 라우트 ───────────────────────────
  const resetStore = () => { const fresh = memoryInviteStore(); Object.assign(mem, fresh); return mem; };
  void resetStore;

  await t('/app 터치: 폰·사람 + 초대 태그 + 형식 맞는 ref 만 기록 · 일반 링크·PC·봇·ref 없음은 한 칸도 안 쓴다 · 기존 사람 클릭 집계는 그대로', async () => {
    resetAll();
    const ipHdr = (ip: string) => ({ ...NAV, 'x-invite-test-ip': ip });
    const dump = () => (mem.dump() as { kv: Record<string, string> }).kv;
    const before = Object.keys(dump()).length;
    for (const [path, ua, hdr] of [
      ['/app?from=home', UA.iphone, ipHdr('198.51.100.1')],
      [`/app?from=share_pick`, UA.iphone, ipHdr('198.51.100.1')],                       // ref 없음
      [`/app?from=share_pick&ref=google`, UA.iphone, ipHdr('198.51.100.1')],            // 형식 밖
      [`/app?from=share_pick&ref=${REF_A}`, UA.mac, ipHdr('198.51.100.1')],             // PC
      [`/app?from=share_pick&ref=${REF_A}`, UA.kakaoScrap, ipHdr('198.51.100.1')],      // 미리보기 봇
      [`/app?from=threads&ref=${REF_A}`, UA.iphone, ipHdr('198.51.100.1')],             // 초대 태그 아님
    ] as const) { const res = await sg.GET(getReq(path, ua, hdr as never)); assert.ok([200, 302, 307].includes(res.status), path); await flush(); }
    assert.equal(Object.keys(dump()).length, before, '터치 칸이 늘지 않았다');

    const r1 = await sg.GET(getReq(`/app?from=share_earn&ref=${REF_A}&l=ko`, UA.iphone, ipHdr('198.51.100.2')));
    assert.ok([200, 302, 307].includes(r1.status)); await flush();
    const r2 = await sg.GET(getReq(`/app?from=gift&code=GIFTTESTPRO&ref=${REF_B}`, UA.android, ipHdr('198.51.100.3')));
    assert.ok([200, 302, 307].includes(r2.status)); await flush();
    const keys = Object.keys(dump()).filter((k) => k.startsWith('promo:pv:inv:t:'));
    assert.equal(keys.length, 2, keys.join(','));
    const ios = JSON.parse(dump()[keys.find((k) => k.includes(':ios:'))!]); assert.deepEqual({ r: ios.r, f: ios.f }, { r: REF_A, f: 'share_earn' });
    const and = JSON.parse(dump()[keys.find((k) => k.includes(':android:'))!]); assert.deepEqual({ r: and.r, f: and.f }, { r: REF_B, f: 'gift' });
    assert.ok(!keys.some((k) => k.includes('198.51.100')), 'IP 원문이 키에 없다');
    // 기존 집계(사람 클릭)도 그대로 센다
    assert.ok([...ec2.keys()].some((k) => k.startsWith('clkp:sg:share_earn:')), 'clk:sg 사람 클릭');
  });
  await t('/api/invite/arrive: 앱 fetch 만 · 매칭되면 {matched:true}(초대자 정보는 안 돌려준다) · 두 번째는 matched:false · 지표 arrive/match/credit 이 EC2 에 쌓인다', async () => {
    resetAll(); resetStore();
    const ip = '198.51.100.20';
    const g = await sg.GET(getReq(`/app?from=share_pick&ref=${REF_A}`, UA.iphone, { ...NAV, 'x-invite-test-ip': ip })); assert.ok(g.status); await flush();
    // 봇·헤더 없음 → 403 (저장소를 건드리지 않는다)
    const bad = await arriveRoute.POST(new NextRequest(`${HOST}/api/invite/arrive`, { method: 'POST', headers: { 'user-agent': UA.iphoneWebView, 'content-type': 'application/json', 'accept-language': 'ko' }, body: JSON.stringify({ key: KEY_B }) }));
    assert.equal(bad.status, 403);
    // PC → device
    assert.equal((await arriveRoute.POST(postReq('/api/invite/arrive', UA.mac, { key: KEY_B }, { 'x-invite-test-ip': ip }))).status, 403);
    // IP 없음(운영 모드가 아니어도 test-ip 헤더가 없고 Vercel 헤더도 없다) → noip
    const noip = await arriveRoute.POST(postReq('/api/invite/arrive', UA.iphoneWebView, { key: KEY_B }));
    assert.equal(noip.status, 403); assert.equal((await noip.json()).reason, 'noip');
    // 열쇠 형식 밖 → 400
    assert.equal((await arriveRoute.POST(postReq('/api/invite/arrive', UA.iphoneWebView, { key: 'nope' }, { 'x-invite-test-ip': ip }))).status, 400);
    // 정상
    const ok = await arriveRoute.POST(postReq('/api/invite/arrive', UA.iphoneWebView, { key: KEY_B }, { 'x-invite-test-ip': ip }));
    assert.equal(ok.status, 200); assert.equal(ok.headers.get('cache-control'), 'private, no-store, max-age=0');
    const body = await ok.json(); assert.deepEqual(body, { ok: true, matched: true }); assert.ok(!JSON.stringify(body).includes(REF_A), '초대자 id 를 돌려주지 않는다');
    await flush();
    const day = etDay();
    assert.equal(ec2.get(`share:probe:arrive:all:ios:${day}`), 1);
    assert.equal(ec2.get(`share:probe:match:sh_pick:ios:${day}`), 1);
    assert.equal(ec2.get(`share:probe:credit:sh_pick:ios:${day}`), 1);
    const again = await (await arriveRoute.POST(postReq('/api/invite/arrive', UA.iphoneWebView, { key: KEY_B }, { 'x-invite-test-ip': ip }))).json();
    assert.deepEqual(again, { ok: true, matched: false }); await flush();
    assert.equal(ec2.get(`share:probe:arrive:all:ios:${day}`), 1, '두 번째 호출은 도착으로 다시 세지 않는다');
  });
  await t('/api/invite/arrive: 터치와 도착의 IP 가 같은 /24 안에서 달라도 매칭된다(이동통신 CGNAT) — match 와 matchloose 지표가 같이 쌓인다 · 다른 /24 는 안 맞는다', async () => {
    resetAll(); resetStore();
    const g = await sg.GET(getReq(`/app?from=gift&code=GIFTTESTPRO&ref=${REF_A}`, UA.iphone, { ...NAV, 'x-invite-test-ip': '198.51.100.10' })); assert.ok(g.status); await flush();
    const far = await (await arriveRoute.POST(postReq('/api/invite/arrive', UA.iphoneWebView, { key: KEY_C }, { 'x-invite-test-ip': '198.51.101.10' }))).json();
    assert.deepEqual(far, { ok: true, matched: false });
    const near = await (await arriveRoute.POST(postReq('/api/invite/arrive', UA.iphoneWebView, { key: KEY_B }, { 'x-invite-test-ip': '198.51.100.222' }))).json();
    assert.deepEqual(near, { ok: true, matched: true }); await flush();
    const day = etDay();
    assert.equal(ec2.get(`share:probe:match:gift:ios:${day}`), 1); assert.equal(ec2.get(`share:probe:matchloose:gift:ios:${day}`), 1);
    assert.equal(ec2.get(`share:probe:arrive:all:ios:${day}`), 2);
  });
  await t('/api/invite/inbox: 열쇠로만 열림 · 번호 + 기기에 맞는 «코드 사용» 주소 · mint 지표 · INVITE_REWARD≠1 이면 새로 안 뽑는다 · 남의 열쇠는 빈 목록', async () => {
    resetAll(); const s = resetStore();
    for (let i = 0; i < 3; i++) await s.sadd(K.poolIos, APPLE(i));
    const ip = '198.51.100.30';
    await sg.GET(getReq(`/app?from=gift&code=GIFTTESTPRO&ref=${REF_A}`, UA.iphone, { ...NAV, 'x-invite-test-ip': ip })); await flush();
    await arriveRoute.POST(postReq('/api/invite/arrive', UA.iphoneWebView, { key: KEY_B }, { 'x-invite-test-ip': ip })); await flush();
    const prev = process.env.INVITE_REWARD;
    delete process.env.INVITE_REWARD;
    const off = await (await inboxRoute.POST(postReq('/api/invite/inbox', UA.iphoneWebView, { key: KEY_A }))).json();
    assert.equal(off.ok, true); assert.equal(off.rewards, false); assert.equal(off.minted, 0); assert.equal(off.waiting, 1); assert.deepEqual(off.items, []); assert.equal(off.friends, 1);
    process.env.INVITE_REWARD = '1';
    const on = await (await inboxRoute.POST(postReq('/api/invite/inbox', UA.iphoneWebView, { key: KEY_A }))).json();
    assert.equal(on.rewards, true); assert.equal(on.minted, 1); assert.equal(on.items.length, 1);
    assert.equal(on.items[0].url, `https://apps.apple.com/redeem?ctx=offercodes&id=6783130444&code=${on.items[0].code}`);
    assert.equal(on.items[0].os, 'ios');
    await flush();
    assert.equal(ec2.get(`share:probe:mint:all:ios:${etDay()}`), 1);
    const other = await (await inboxRoute.POST(postReq('/api/invite/inbox', UA.iphoneWebView, { key: KEY_C }))).json();
    assert.deepEqual(other.items, []);
    assert.equal((await inboxRoute.POST(postReq('/api/invite/inbox', UA.iphoneWebView, { key: 'nope' }))).status, 400);
    assert.equal((await inboxRoute.POST(postReq('/api/invite/inbox', UA.mac, { key: KEY_A }))).status, 403);
    assert.equal((await inboxRoute.POST(new NextRequest(`${HOST}/api/invite/inbox`, { method: 'POST', headers: { 'user-agent': UA.iphoneWebView, 'accept-language': 'ko' }, body: '{}' }))).status, 403);
    if (prev === undefined) delete process.env.INVITE_REWARD; else process.env.INVITE_REWARD = prev;
  });
  await t('저장소 설정이 없으면(운영 환경변수 누락) arrive·inbox 는 503 — 번호·크레딧을 건드리지 않는다', async () => {
    const real = storeMod.upstashInviteStore;
    storeMod.upstashInviteStore = () => null;
    assert.equal((await arriveRoute.POST(postReq('/api/invite/arrive', UA.iphoneWebView, { key: KEY_B }, { 'x-invite-test-ip': '198.51.100.40' }))).status, 503);
    assert.equal((await inboxRoute.POST(postReq('/api/invite/inbox', UA.iphoneWebView, { key: KEY_A }))).status, 503);
    storeMod.upstashInviteStore = real;
  });
  await t('/api/invite/config: {share,rewards,code,android} · 선물 코드가 꺼져 있으면 code:null · 환경변수의 코드 외엔 안 샌다 · CDN 60초', async () => {
    const keep = { ...process.env };
    delete process.env.GIFT_PROMO_CODE; delete process.env.INVITE_REWARD; delete process.env.INVITE_SHARE_OFF; delete process.env.COUPON_ANDROID;
    let j = await (await configRoute.GET()).json(); assert.deepEqual(j, { share: true, rewards: false, code: null, android: false });
    process.env.GIFT_PROMO_CODE = 'GIFTTESTPRO'; process.env.INVITE_REWARD = '1'; process.env.COUPON_ANDROID = '1';
    const r = await configRoute.GET(); j = await r.json();
    assert.deepEqual(j, { share: true, rewards: true, code: 'GIFTTESTPRO', android: true }); assert.match(r.headers.get('cache-control') || '', /s-maxage=60/);
    process.env.INVITE_SHARE_OFF = '1'; assert.equal((await (await configRoute.GET()).json()).share, false);
    for (const k of ['GIFT_PROMO_CODE', 'INVITE_REWARD', 'INVITE_SHARE_OFF', 'COUPON_ANDROID']) { if (keep[k] === undefined) delete process.env[k]; else process.env[k] = keep[k]; }
  });
  await t('share-hit: 새 표면 sh_pick·sh_line·sh_earn 만 받는다 · 공유 완료(sent)에 형식 맞는 r 이 실리면 «그날 서로 다른 초대자» 목록에 한 번씩 · tap 의 r 은 무시', async () => {
    resetAll();
    const hit = async (q: string) => { const r = await shareHit.POST(new NextRequest(`${HOST}/api/share-hit?${q}`, { method: 'POST', headers: { 'user-agent': UA.iphone } })); assert.equal(r.status, 204); await flush(); };
    const day = etDay();
    await hit('e=tap&s=sh_pick&v=ios'); await hit(`e=sent&s=sh_pick&v=ios&r=${REF_A}`); await hit(`e=sent&s=sh_line&v=android&r=${REF_A}`); await hit(`e=sent&s=sh_earn&v=ios&r=${REF_B}`);
    await hit(`e=tap&s=sh_pick&v=ios&r=${REF_B}`); await hit('e=sent&s=sh_pick&v=ios&r=google'); await hit('e=sent&s=nope&v=ios');
    assert.equal(ec2.get(`share:probe:tap:sh_pick:ios:${day}`), 2);
    assert.equal(ec2.get(`share:probe:sent:sh_pick:ios:${day}`), 2);
    assert.equal(ec2.get(`share:probe:sent:sh_line:android:${day}`), 1);
    assert.equal(ec2.get(`share:probe:sent:sh_earn:ios:${day}`), 1);
    assert.ok(![...ec2.keys()].some((k) => k.includes(':nope:')));
    assert.deepEqual(ec2.get(`share:probe:senders:${day}`), [REF_A, REF_B]);
  });

  // ─────────────────────────── 링크 카드·쿠폰 화면 ───────────────────────────
  await t('쿠폰 화면 부제: share_* 태그는 «친구 초대 혜택»(구독자 전용·채널 문구로 새지 않는다) · 선물·다른 채널 문구는 그대로', () => {
    for (const f of ['share_pick', 'share_line', 'share_earn']) {
      assert.equal(audienceLine(f, 'GIFTTESTPRO', 'ko'), '친구 초대 혜택'); assert.equal(audienceLine(f, 'GIFTTESTPRO', 'ja'), '友だち招待特典'); assert.equal(audienceLine(f, 'GIFTTESTPRO', 'en'), 'A friend’s invite');
    }
    assert.equal(audienceLine('gift', 'GIFTTESTPRO', 'ko'), '친구가 보낸 선물');
    assert.equal(audienceLine('threads', 'THREADSPRO', 'ko'), 'Threads 독자 전용');
    assert.equal(audienceLine('share_other', 'GIFTTESTPRO', 'ko'), '구독자 전용', '목록 밖 share_ 는 예전 규칙');
  });
  await t('선물·초대 링크 카드: 안드 쿠폰이 켜져 있으면 «아이폰·안드로이드 모두» · 꺼져 있으면 «아이폰» · «선착순»·남은 수·타이머 없음 · 예전 카드는 그대로(invite=false)', () => {
    const banned = /선착순|先着|first \d|limited|hurry|남았|残り|500/i;
    for (const lang of ['ko', 'ja', 'en'] as const) {
      const both = inviteCardCopy(lang, true), ios = inviteCardCopy(lang, false);
      for (const c of [both, ios]) { assert.ok(!banned.test(c.title) && !banned.test(c.desc), `${lang}: ${c.title}`); assert.ok(/자동 갱신|auto-renews|自動更新/.test(c.desc) && /해지|cancel|解約/.test(c.desc), '자동 갱신 고지'); }
      assert.ok(/아이폰·안드로이드|iPhone and Android|iPhone・Android/.test(both.desc), lang);
      assert.ok(!/안드로이드|Android/.test(ios.desc), `${lang}: 안드가 꺼져 있으면 안드를 말하지 않는다`);
    }
    const html = previewHtml('signum', 'ko', 'https://www.signumhq.com/app?from=gift&code=GIFTPRO', 'https://apps.apple.com/x', true, { android: true });
    assert.ok(html.includes('/api/og/invite?l=ko&amp;a=1') || html.includes('/api/og/invite?l=ko&a=1'), html.slice(0, 600));
    assert.ok(!html.includes('redeem-card-ko.png'));
    assert.ok(previewHtml('signum', 'ko', 'u', 's', true, { android: false }).includes('a=0'));
    const old = previewHtml('signum', 'ko', 'u', 's', true);
    assert.ok(old.includes('redeem-card-ko.png') && old.includes('선착순 500명'), '초대가 아닌 코드 링크는 예전 카드 그대로');
    assert.equal(previewHtml('signum', 'ko', 'u', 's', false, { android: true }), previewHtml('signum', 'ko', 'u', 's', false), '코드 없는 링크는 한 글자도 안 바뀐다');
  });
  await t('/app 링크 카드: 선물(from=gift) 카드는 전용 카드 · 다른 채널 코드 카드는 예전 그대로', async () => {
    const prev = { a: process.env.COUPON_ANDROID };
    process.env.COUPON_ANDROID = '1';
    const gift = await (await sg.GET(getReq('/app?from=gift&code=WEBPRO&ref=' + REF_A + '&l=ko', UA.kakaoScrap, { 'accept-language': 'ko' }))).text();
    assert.ok(gift.includes('/api/og/invite?l=ko'), '선물 링크 카드는 전용 이미지'); assert.ok(gift.includes('친구가 보낸 선물'));
    assert.ok(!gift.includes('선착순'));
    const ch = await (await sg.GET(getReq('/app?from=threads&code=THREADSPRO&l=ko', UA.kakaoScrap, { 'accept-language': 'ko' }))).text();
    assert.ok(ch.includes('redeem-card-ko.png') && ch.includes('선착순 500명'));
    if (prev.a === undefined) delete process.env.COUPON_ANDROID; else process.env.COUPON_ANDROID = prev.a;
  });

  // ─────────────────────────── 문구 ───────────────────────────
  await t('문구(한·일·영): 가짜 희소성·가격 숫자·투자 권유 없음 · 공유 문구는 «화면의 줄»을 싣되 140자에서 자른다 · 링크는 본문에 없다(shareOrCopy 가 끝에 붙인다) · 자동 갱신 고지는 «무료» 문장 안', () => {
    const banned = /선착순|先着|first \d|limited|hurry|남았|残り|急い|서두|[₩¥$]\s?\d|\d,\d{3}|매수|매도|사세요|buy now|guaranteed|보장|수익/i;
    const must = { ko: ['자동 갱신', '해지'], ja: ['自動更新', '解約'], en: ['auto-renews', 'cancel'] } as const;
    const long = '가'.repeat(300);
    for (const lang of ['ko', 'ja', 'en'] as const) {
      const c = INVITE_COPY[lang];
      for (const kind of ['pick', 'line', 'earn'] as const) {
        const withLine = c.shareText[kind]('NVDA', 'Max Pain $215 · 6.6%'); assert.ok(withLine.includes('NVDA') && withLine.includes('6.6%'), `${lang}/${kind}`);
        assert.ok(!c.shareText[kind]('NVDA', null).includes('null') && !c.shareText[kind]('NVDA', null).includes('undefined'));
        assert.ok(c.shareText[kind]('NVDA', long).length < 220, '긴 줄은 잘린다'); assert.ok(!/https?:\/\//.test(withLine));
        assert.ok(!banned.test(c.shareText[kind]('NVDA', null)) && !banned.test(c.shareAria[kind]('NVDA')), `${lang}/${kind}: 문구 틀에 금지 표현(데이터 줄의 \$ 레벨 값은 화면 그대로라 제외)`);
        assert.ok(c.shareAria[kind]('NVDA').includes('NVDA'));
      }
      assert.ok(c.shareTitle('AAPL').includes('AAPL'));
      const b = c.box;
      for (const f of [b.title, b.empty, b.friends(2), b.waiting(1), b.noticeTitle, b.noticeSub, b.itemLabel, b.use, b.pasteHint, b.fineIos, b.fineAndroid, b.rowSub, b.rowSubCodes(2), c.copied, c.rewardHint]) { assert.ok(f.length > 0); assert.ok(!banned.test(f), `${lang}: ${f}`); }
      for (const w of must[lang]) { assert.ok(b.fineIos.toLowerCase().includes(w.toLowerCase()), `${lang} iOS 고지 ${w}`); assert.ok(b.fineAndroid.toLowerCase().includes(w.toLowerCase()), `${lang} Android 고지 ${w}`); }
    }
  });

  // ─────────────────────────── 앱 쪽 판정 ───────────────────────────
  await t('도착 알림 판정: 새 설치(첫 안내 전)만 보낸다 · 기존 사용자는 skip 표식 · done·skip 은 다시 안 함 · 실패해 pending 이면 72시간 안에만 재시도', () => {
    const T0 = 1_000_000_000_000;
    assert.equal(arrivalDecision(null, false, T0), 'send');
    assert.equal(arrivalDecision(null, true, T0), 'skip', '이 기능 이전부터 쓰던 사람');
    assert.equal(arrivalDecision('done', false, T0), 'wait'); assert.equal(arrivalDecision('skip', false, T0), 'wait');
    assert.equal(arrivalDecision(`pending:${T0 - 3600_000}`, true, T0), 'send', '안 보낸 새 설치는 첫 안내를 마친 뒤에도 재시도');
    assert.equal(arrivalDecision(`pending:${T0 - 73 * 3600_000}`, true, T0), 'skip', '72시간이 지나면 포기');
    assert.equal(arrivalDecision('pending:abc', true, T0), 'skip');
    assert.equal(ARRIVED_KEY, 'signumhq.inv.arrived.v1');
  });
  await t('선물함 알림 판정: 이미 보여 준 번호는 다시 알리지 않는다(번호마다 한 번)', () => {
    const it = (code: string) => ({ code, os: 'ios' as const, at: 1, url: 'u' });
    assert.deepEqual(newItems([it('A1'), it('B2'), it('C3')], ['B2']).map((i) => i.code), ['A1', 'C3']);
    assert.deepEqual(newItems([], ['x']), []); assert.deepEqual(newItems([it('A1')], ['A1']), []);
  });

  // ─────────────────────────── 화면 규칙(소스 고정) ───────────────────────────
  const fs = require('node:fs'); const pathMod = require('node:path');
  const read = (f: string) => fs.readFileSync(pathMod.join(__dirname, '..', f), 'utf8') as string;
  const noComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
  await t('공유 단추: 눌림 번쩍임 없음(대표 10/13) — :active·:hover 배경·확대·애니메이션 없음 · 탭 강조 투명 · 햅틱은 앱 레이아웃이 한 번(단추 안에서 또 부르지 않는다) · 아이콘 하나(글자 라벨 없음)', () => {
    const css = noComments(read('src/components/app/InviteShareButton.module.css'));
    assert.equal(/:active|:hover|animation|transition|transform/.test(css), false, '눌림 표시·움직임 없음');
    assert.ok(/-webkit-tap-highlight-color:\s*transparent/.test(css) && /-webkit-touch-callout:\s*none/.test(css));
    const tsx = read('src/components/app/InviteShareButton.tsx');
    assert.equal(/hapticImpact\(|capacitorBridge|Haptics/.test(tsx), false, '햅틱은 layout.tsx 의 위임 리스너 한 곳');
    assert.ok(/<button\s+type="button"/.test(tsx) && /aria-label=\{c\.shareAria\[kind\]\(ticker\)\}/.test(tsx) && /<ShareIcon size=\{15\}/.test(tsx), '아이콘 단추 + 접근성 이름');
    const layout = read('src/app/[locale]/app-view/layout.tsx');
    assert.ok(/closest\('button, a, \[role="button"\]/.test(layout), '모든 버튼 클릭에 햅틱 한 번');
    assert.ok(layout.includes('<InviteHost />') && (layout.match(/<InviteHost/g) || []).length === 1, '선물함 알림 자리는 레이아웃에 하나');
  });
  await t('공유 단추 3곳: 행 «형제» 단추(버튼 안에 버튼 없음) · 하단 내비·광고 자리·페이월 파일은 건드리지 않았다', () => {
    const pick = read('src/components/app/TodayPicksCard.tsx');
    assert.ok(/<TodayPickRow p=\{p\} ui=\{ui\} onOpen=\{onOpen\} \/>\s*\n\s*<InviteShareButton kind="pick"/.test(pick), 'pick: 행 다음 형제');
    const wl = read('src/app/[locale]/app-view/watchlist/page.tsx');
    assert.ok(/<div className=\{p\.aiw\}>[\s\S]{0,400}<InviteShareButton kind="line"[\s\S]{0,200}<p className=\{p\.ai\}>/.test(wl), 'line: .aiw 안, 글(.ai) 앞 형제 — 글 칸 폭은 그대로');
    const earn = read('src/app/[locale]/app-view/earnings/page.tsx');
    assert.ok(/<\/a>\s*\n\s*\{shareOn && e\.implied && \(\s*\n\s*<InviteShareButton kind="earn"/.test(earn), 'earn: <a> 행 다음 형제');
    assert.ok(/e\.implied/.test(earn.split('<InviteShareButton kind="earn"')[0].slice(-200)), '변동폭 값이 있는 행에만');
  });
  await t('범위 밖 0: 이번 작업은 하단 내비(AppBottomNav)·광고 자리(AppAnchorAd)·페이월(ProPaywall)·가격 무결성 파일을 건드리지 않는다', () => {
    const { execSync } = require('node:child_process');
    let changed = '';
    try { changed = execSync('git diff --name-only origin/main...HEAD; git diff --name-only; git ls-files --others --exclude-standard', { cwd: pathMod.join(__dirname, '..'), encoding: 'utf8' }); } catch { return; }
    const forbidden = /AppBottomNav|AppAnchorAd|ProPaywall\.(tsx|module\.css)|src\/lib\/integrity|price-integrity|priceIntegrity/;
    const hits = changed.split('\n').filter((f) => forbidden.test(f));
    assert.deepEqual(hits, [], hits.join(','));
  });

  await t('개인정보 안내(10/14) — 앱 개인정보처리방침에 «익명 초대 열쇠·IP 해시(72시간·30일)·판매/광고 아님» 항목이 3개 언어로 있다', () => {
    const d: string = require('node:fs').readFileSync(pathMod.join(__dirname, '../src/components/app/AppLegalDocument.tsx'), 'utf8');
    for (const phrase of [
      '익명 초대 열쇠', '요청 IP 주소의 해시값', 'IP 원문은 저장하지 않고', '72시간', '30일', '판매나 광고 목적으로 사용하지 않습니다',
      'an anonymous invite key generated on your device', 'a hash of the request IP address', 'the raw IP address is not stored', '72 hours', 'none of this is used for sale or advertising',
      '匿名の招待キー', 'リクエスト元IPアドレスのハッシュ値', 'IPアドレスの原文は保存せず', '72時間', '販売や広告の目的では使用しません',
    ]) assert.ok(d.includes(phrase), phrase);
    // 코드의 실제 보관 기간과 문구가 어긋나지 않게: 터치 72시간·같은 IP 보상 방지 30일·보상 내역 400일(약 13개월)
    const e: string = require('node:fs').readFileSync(pathMod.join(__dirname, '../src/lib/invite/engine.ts'), 'utf8');
    assert.ok(/TOUCH_TTL_SEC = 72 \* 3600/.test(e) && /IP_CREDIT_TTL_SEC = 30 \* 24 \* 3600/.test(e) && /LONG_TTL = 400 \* 24 \* 3600/.test(e));
  });

  console.log(`\n${n} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
