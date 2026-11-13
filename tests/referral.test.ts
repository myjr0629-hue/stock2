// 실행: npx tsx tests/referral.test.ts
/**
 * 양면 추천 보상(토큰 귀속 + RC 신규 고객 확인) — 2026-11-13 (브랜치 feat/referral-1113)
 *   ① 서명 토큰: 발급·검증 · 위조(서명·ref 바꿔치기)·만료·형식 → 거절
 *   ② 터치: 토큰이 맞을 때만 초대자 RC 태그(u)를 적는다 · 위조·만료·남의 ref 토큰은 u 없음(= legacy)
 *   ③ 도착(requireToken): 토큰 터치 → 확인 대기(claimed) · 옛 링크 → legacy(보상 0) · 자기 열쇠 → self · 두 번째 → again
 *   ④ RC 확인: 성공 → 크레딧 1 → 선물함 번호 1장 · 자기 초대(같은 RC 고객) · 같은 기기(같은 열쇠) · 같은 RC 고객 두 번 · 같은 IP 두 번 ·
 *      이미 고객(first_seen·옛 구매) · 샌드박스 · 구매 전(pending→나중 성공) · 월 상한 3 초과 · 하루 전체 상한 → 보상 0
 *   ⑤ Lua 원문(순수 JS 해석기) = 메모리 저장소 — 같은 표의 결과·칸 값이 같다
 *   ⑥ 라우트 끝까지: /api/invite/token → 공유 카드 주소(inv) → /app 터치 → /api/invite/arrive → /api/invite/verify → /api/invite/inbox
 * 번호는 시험용 가짜(GZTEST…)만 · RC 응답은 가짜 fetch · 외부 접속 0.
 */
import assert from 'node:assert/strict';
import Module from 'node:module';

let rcCalls = 0;
let rcReply: (uid: string) => { status: number; json?: unknown } = () => ({ status: 503 });
globalThis.fetch = (async (input: unknown) => {
  const url = String(input);
  if (url.startsWith('https://api.revenuecat.com/v1/subscribers/')) {
    rcCalls++;
    const uid = decodeURIComponent(url.split('/').pop() || '');
    const r = rcReply(uid);
    return new Response(r.json === undefined ? null : JSON.stringify(r.json), { status: r.status, headers: { 'content-type': 'application/json' } });
  }
  throw new Error('시험 중 외부 접근 금지');
}) as typeof fetch;
process.env.VERCEL_ENV = 'preview';
process.env.INVITE_TOKEN_SECRET = 'test-secret-referral-1113';
process.env.NEXT_PUBLIC_RC_IOS_KEY = 'appl_test_fake';
process.env.NEXT_PUBLIC_RC_ANDROID_KEY = 'goog_test_fake';
process.env.INVITE_REWARD = '1';

const afterCalls: Array<() => unknown> = [];
const nsPath = require.resolve('next/server');
const realNs = require(nsPath);
require.cache[nsPath] = { id: nsPath, filename: nsPath, loaded: true, exports: { ...realNs, after: (fn: () => unknown) => { afterCalls.push(fn); } } } as unknown as Module;
const flush = async () => { const fns = afterCalls.splice(0); for (const f of fns) await f(); };

const ec2 = new Map<string, unknown>();
const rcPath = require.resolve('../src/services/redisClient');
require.cache[rcPath] = { id: rcPath, filename: rcPath, loaded: true, exports: {
  getFromCache: async (k: string) => (ec2.has(k) ? ec2.get(k) : null),
  setInCache: async (k: string, v: unknown) => { ec2.set(k, v); return true; },
} } as unknown as Module;

import { memoryInviteStore } from '../src/lib/invite/memoryStore';
let mem = memoryInviteStore();
const storePath = require.resolve('../src/lib/invite/store');
const storeMod = { ...require(storePath) };
require.cache[storePath]!.exports = storeMod;
storeMod.upstashInviteStore = () => mem;

import { NextRequest } from 'next/server';
import { inviteRefOf } from '../src/lib/invite/identity';
import { INVITE_TOKEN_TTL_SEC, inviteTokenVerdict, issueInviteToken, rcUidTag, verifyInviteToken } from '../src/lib/invite/token';
import { DAILY_CREDIT_CAP, INVITER_MONTHLY_CAP, arrive, etDay, inbox, inviteKeys, recordTouch, type InviteStore } from '../src/lib/invite/engine';
import { CLICK_SKEW_MS, etMonth, rcNewness, verifyClaim, type RcFetch } from '../src/lib/invite/referral';
import { ARRIVE_CLAIM_LUA, VERIFY_CREDIT_LUA, arriveClaimArgs, verifyCreditArgs } from '../src/lib/invite/referralAtomic';
import { INVITE_TOKEN_RE, buildShareCardUrl, inviteAppHref, withInviteToken } from '../src/lib/invite/kinds';
import { claimDecision, tokenFromStored, CLAIM_WINDOW_MS, VERIFY_GAP_MS } from '../src/lib/invite/tokenClient';
import { INVITE_COPY } from '../src/lib/invite/copy';
import { buildGiftUrl } from '../src/lib/gift/gift';
const { inviteIpHash, inviteSecret } = require('../src/lib/invite/guard') as typeof import('../src/lib/invite/guard');

const tokenRoute = require('../src/app/api/invite/token/route');
const arriveRoute = require('../src/app/api/invite/arrive/route');
const verifyRoute = require('../src/app/api/invite/verify/route');
const inboxRoute = require('../src/app/api/invite/inbox/route');
const sg = require('../src/app/app/route');

const SECRET = process.env.INVITE_TOKEN_SECRET!;
const KEY_A = 'abcdefghjkmnpqrstuvw2345';   // 초대자
const KEY_B = 'mnpqrstuvwxyz2345abcdefg';   // 친구 1
const KEY_C = 'zyxwvutsrqpnmkjhgfedcba6';   // 친구 2
const KEY_D = 'hjkmnpqrstuvwxyz23456789';   // 친구 3
const REF_A = inviteRefOf(KEY_A);
const REF_B = inviteRefOf(KEY_B);
const UID_A = '$RCAnonymousID:' + 'a'.repeat(32);
const UID_B = '$RCAnonymousID:' + 'b'.repeat(32);
const UID_C = '$RCAnonymousID:' + 'c'.repeat(32);
const UID_D = '$RCAnonymousID:' + 'd'.repeat(32);
const K = inviteKeys('preview');
const NOW = Date.parse('2026-11-13T15:00:00Z');
const HEX = (n: number) => n.toString(16).padStart(24, '0');
const APPLE = (i: number) => `GZTEST${String(i).padStart(4, '0')}`;
const iso = (ms: number) => new Date(ms).toISOString();

/** RC v1 subscriber 가짜 응답 */
function subscriber(o: { first: number; buys?: Array<{ at: number; orig?: number; sandbox?: boolean; store?: string; tx?: string }> }) {
  const subscriptions: Record<string, unknown> = {};
  (o.buys || []).forEach((b, n) => {
    subscriptions[`signum_pro_monthly${n ? `_${n}` : ''}`] = {
      purchase_date: iso(b.at), original_purchase_date: iso(b.orig ?? b.at), expires_date: iso(b.at + 30 * 86400_000),
      is_sandbox: b.sandbox ?? false, store: b.store ?? 'app_store', period_type: 'trial', ...(b.tx ? { store_transaction_id: b.tx } : {}),
    };
  });
  return { subscriber: { first_seen: iso(o.first), original_app_user_id: 'x', subscriptions, non_subscriptions: {}, entitlements: {} } };
}

let passed = 0;
const failures: string[] = [];
async function t(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push(name); console.log(`  ✗ ${name}\n    ${(e as Error).message.split('\n').slice(0, 6).join('\n    ')}`); }
}

/** 친구가 토큰 링크를 열고(터치) 앱을 처음 실행(도착)한 상태까지 */
async function clickAndArrive(store: InviteStore, p: { inviterKey?: string; inviterUid?: string; friendKey: string; ip: string; at: number; token?: string | null }) {
  const ref = inviteRefOf(p.inviterKey ?? KEY_A);
  const token = p.token === undefined ? issueInviteToken({ ref, uidTag: rcUidTag(p.inviterUid ?? UID_A, SECRET), nowMs: p.at - 3600_000, secret: SECRET }) : p.token;
  await recordTouch(store, { ref, from: 'share_pick', os: 'ios', ipHash: p.ip, human: true, now: p.at, vercelEnv: 'preview', inv: token, tokenSecret: SECRET });
  return arrive(store, { key: p.friendKey, os: 'ios', ipHash: p.ip, now: p.at + 60_000, vercelEnv: 'preview', requireToken: true });
}
const rcFixed = (json: unknown): RcFetch => async () => ({ kind: 'ok', json });
const verify = (store: InviteStore, key: string, uid: string, ip: string, now: number, rc: RcFetch) =>
  verifyClaim(store, { key, rcUid: uid, os: 'ios', ipHash: ip, now, vercelEnv: 'preview', secret: SECRET, rc });

(async () => {
  console.log('① 서명 토큰');
  await t('발급·검증 — ref·u·만료 7일 · 형식은 링크 정규식 통과 · 길이 ≤ 64', () => {
    const tok = issueInviteToken({ ref: REF_A, uidTag: rcUidTag(UID_A, SECRET), nowMs: NOW, secret: SECRET })!;
    assert.ok(INVITE_TOKEN_RE.test(tok)); assert.ok(tok.length <= 64, `len ${tok.length}`);
    const c = verifyInviteToken(tok, SECRET, NOW + 1000)!;
    assert.equal(c.ref, REF_A); assert.equal(c.u, rcUidTag(UID_A, SECRET));
    assert.equal(c.exp, Math.floor(NOW / 1000) + INVITE_TOKEN_TTL_SEC);
    assert.ok(!tok.includes(UID_A) && !tok.includes('a'.repeat(32)), 'RC ID 원문 없음');
  });
  await t('위조 — 서명 한 글자 · ref 바꿔치기 · u 바꿔치기 · 다른 비밀 → sig', () => {
    const tok = issueInviteToken({ ref: REF_A, uidTag: rcUidTag(UID_A, SECRET), nowMs: NOW, secret: SECRET })!;
    const [r, u, e, s] = tok.split('.');
    const flip = s.slice(0, -1) + (s.endsWith('A') ? 'B' : 'A');
    assert.equal(inviteTokenVerdict(`${r}.${u}.${e}.${flip}`, SECRET, NOW).reason, 'sig');
    assert.equal(inviteTokenVerdict(`${REF_B}.${u}.${e}.${s}`, SECRET, NOW).reason, 'sig');
    assert.equal(inviteTokenVerdict(`${r}.${rcUidTag(UID_B, SECRET)}.${e}.${s}`, SECRET, NOW).reason, 'sig');
    assert.equal(inviteTokenVerdict(tok, 'other-secret', NOW).reason, 'sig');
    assert.equal(verifyInviteToken(`${r}.${u}.${e}.${flip}`, SECRET, NOW), null);
  });
  await t('만료 — 7일 지나면 expired · 형식 밖(대문자·짧음·비밀 없음) → format', () => {
    const tok = issueInviteToken({ ref: REF_A, uidTag: rcUidTag(UID_A, SECRET), nowMs: NOW, secret: SECRET })!;
    assert.equal(inviteTokenVerdict(tok, SECRET, NOW + INVITE_TOKEN_TTL_SEC * 1000 + 1000).reason, 'expired');
    assert.equal(inviteTokenVerdict(tok.toUpperCase(), SECRET, NOW).reason, 'format');
    assert.equal(inviteTokenVerdict('abc', SECRET, NOW).reason, 'format');
    assert.equal(inviteTokenVerdict(tok, '', NOW).reason, 'format');
    assert.equal(issueInviteToken({ ref: 'bad', uidTag: rcUidTag(UID_A, SECRET), secret: SECRET }), null);
  });
  await t('링크 — 공유 카드·앱 이어 보기·선물 링크에 inv 는 ref 가 있을 때만 · 형식 밖 토큰은 안 붙는다 · 없으면 예전 주소 그대로', () => {
    const tok = issueInviteToken({ ref: REF_A, uidTag: rcUidTag(UID_A, SECRET), nowMs: NOW, secret: SECRET })!;
    const card = new URL(buildShareCardUrl('pick', { locale: 'ko', ticker: 'NVDA', ref: REF_A, via: 'ios', inv: tok }));
    assert.equal(card.searchParams.get('inv'), tok);
    assert.equal(buildShareCardUrl('pick', { locale: 'ko', ticker: 'NVDA', ref: REF_A, via: 'ios' }), buildShareCardUrl('pick', { locale: 'ko', ticker: 'NVDA', ref: REF_A, via: 'ios', inv: 'x.y' }));
    assert.equal(new URL(buildShareCardUrl('pick', { locale: 'ko', ticker: 'NVDA', ref: null, via: 'ios', inv: tok })).searchParams.has('inv'), false);
    assert.equal(new URL(inviteAppHref('pick', { lang: 'ko', ref: REF_A, inv: tok })).searchParams.get('inv'), tok);
    assert.equal(new URL(buildGiftUrl('GIFTTESTPRO', REF_A, 'ko', tok)).searchParams.get('inv'), tok);
    assert.equal(buildGiftUrl('GIFTTESTPRO', REF_A, 'ko'), buildGiftUrl('GIFTTESTPRO', REF_A, 'ko', null));
    assert.equal(withInviteToken('https://www.signumhq.com/app?x=1', 'nope'), 'https://www.signumhq.com/app?x=1');
  });
  await t('클라이언트 판정 — 저장 토큰은 ref 가 같고 만료 전일 때만 · 확인 대기는 3분 간격·7일', () => {
    const tok = issueInviteToken({ ref: REF_A, uidTag: rcUidTag(UID_A, SECRET), nowMs: NOW, secret: SECRET })!;
    const raw = JSON.stringify({ t: tok, exp: NOW + 86400_000 });
    assert.equal(tokenFromStored(raw, REF_A, NOW)?.token, tok);
    assert.equal(tokenFromStored(raw, REF_B, NOW), null);
    assert.equal(tokenFromStored(raw, REF_A, NOW + 2 * 86400_000), null);
    assert.equal(tokenFromStored('{', REF_A, NOW), null);
    assert.equal(claimDecision(null, NOW), 'stop'); assert.equal(claimDecision('done', NOW), 'stop');
    assert.equal(claimDecision(`pending:${NOW}`, NOW), 'call');
    assert.equal(claimDecision(`pending:${NOW}:${NOW}`, NOW + VERIFY_GAP_MS - 1), 'wait');
    assert.equal(claimDecision(`pending:${NOW}:${NOW}`, NOW + VERIFY_GAP_MS), 'call');
    assert.equal(claimDecision(`pending:${NOW}`, NOW + CLAIM_WINDOW_MS + 1), 'stop');
  });
  await t('문구 — 시트 보상 한 줄 3개 언어 · 조건(설치)·월 3 · 가격·희소성 단어 없음', () => {
    for (const l of ['ko', 'en', 'ja'] as const) {
      const s = INVITE_COPY[l].referralLine;
      assert.ok(s && /3/.test(s), l); assert.ok(!/[$₩¥]|선착순|first come|先着|lifetime|평생|永久/i.test(s), l);
    }
  });

  console.log('② 터치 · ③ 도착');
  await t('토큰 터치 → 도착은 «확인 대기»(claimed) · 적립 0 · 대기 기록에 RC ID·열쇠·IP 원문 없음', async () => {
    mem = memoryInviteStore(() => NOW);
    const r = await clickAndArrive(mem, { friendKey: KEY_B, ip: HEX(1), at: NOW });
    assert.deepEqual(r, { matched: true, credited: false, reason: 'claimed', from: 'share_pick', inviterRef: REF_A });
    assert.equal(await mem.get(K.credit(REF_A)), null);
    const claim = (await mem.get(K.claim(REF_B)))!;
    assert.ok(claim && !claim.includes(UID_A) && !claim.includes(KEY_B) && !claim.includes(KEY_A));
    assert.equal(JSON.parse(claim).u, rcUidTag(UID_A, SECRET));
  });
  await t('옛 링크(토큰 없음)·위조 토큰·만료 토큰·남의 ref 토큰 → legacy(보상 경로 없음)', async () => {
    const tok = issueInviteToken({ ref: REF_A, uidTag: rcUidTag(UID_A, SECRET), nowMs: NOW - 3600_000, secret: SECRET })!;
    const forged = tok.slice(0, -2) + (tok.endsWith('AA') ? 'BB' : 'AA');
    const expired = issueInviteToken({ ref: REF_A, uidTag: rcUidTag(UID_A, SECRET), nowMs: NOW - 8 * 86400_000, secret: SECRET });
    const other = issueInviteToken({ ref: REF_B, uidTag: rcUidTag(UID_B, SECRET), nowMs: NOW - 3600_000, secret: SECRET });
    for (const [n, token] of [[1, null], [2, forged], [3, expired], [4, other]] as const) {
      mem = memoryInviteStore(() => NOW);
      const r = await clickAndArrive(mem, { friendKey: KEY_B, ip: HEX(n), at: NOW, token });
      assert.equal((r as { reason?: string }).reason, 'legacy', `case ${n}`);
      assert.equal(await mem.get(K.claim(REF_B)), null);
      assert.equal(await mem.get(K.credit(REF_A)), null);
    }
  });
  await t('같은 기기(초대자 열쇠로 도착) → self · 두 번째 도착 → again · 터치 없음 → none', async () => {
    mem = memoryInviteStore(() => NOW);
    assert.deepEqual(await clickAndArrive(mem, { friendKey: KEY_A, ip: HEX(5), at: NOW }), { matched: false, reason: 'self' });
    assert.equal(await mem.get(K.claim(REF_A)), null);
    mem = memoryInviteStore(() => NOW);
    await clickAndArrive(mem, { friendKey: KEY_B, ip: HEX(6), at: NOW });
    assert.deepEqual(await arrive(mem, { key: KEY_B, os: 'ios', ipHash: HEX(6), now: NOW + 120_000, vercelEnv: 'preview', requireToken: true }), { matched: false, reason: 'again', claim: true });
    assert.deepEqual(await arrive(mem, { key: KEY_C, os: 'ios', ipHash: HEX(7), now: NOW, vercelEnv: 'preview', requireToken: true }), { matched: false, reason: 'none' });
  });

  console.log('④ RC 확인');
  await t('귀속 성공 → 크레딧 1 → 선물함 번호 1장(기존 mintOne·풀) · 결론 뒤 다시 불러도 그대로', async () => {
    mem = memoryInviteStore(() => NOW);
    await mem.sadd(K.poolIos, APPLE(1));
    await clickAndArrive(mem, { friendKey: KEY_B, ip: HEX(10), at: NOW });
    const rc = rcFixed(subscriber({ first: NOW + 90_000, buys: [{ at: NOW + 300_000, tx: '2000000111' }] }));
    assert.deepEqual(await verify(mem, KEY_B, UID_B, HEX(10), NOW + 400_000, rc), { state: 'credited' });
    assert.equal(await mem.get(K.credit(REF_A)), '1'); assert.equal(await mem.get(K.friends(REF_A)), '1');
    assert.equal(await mem.get(K.month(REF_A, etMonth(NOW + 400_000))), '1');
    assert.deepEqual(await verify(mem, KEY_B, UID_B, HEX(10), NOW + 500_000, rc), { state: 'final', reason: 'credited' });
    const box = (await inbox(mem, { key: KEY_A, os: 'ios', now: NOW + 600_000, vercelEnv: 'preview' }))!;
    assert.equal(box.minted, 1); assert.equal(box.items.length, 1); assert.equal(box.waiting, 0);
  });
  await t('코디네이터 결정(조건 = 기존 문구 «설치하면»): 구매·체험 없이도 클릭 뒤 첫 실행 무렵 처음 생긴 비샌드박스 RC 고객이면 credited', async () => {
    mem = memoryInviteStore(() => NOW);
    await clickAndArrive(mem, { friendKey: KEY_B, ip: HEX(11), at: NOW });
    assert.deepEqual(await verify(mem, KEY_B, UID_B, HEX(11), NOW + 200_000, rcFixed(subscriber({ first: NOW + 90_000 }))), { state: 'credited' });
    assert.equal(await mem.get(K.credit(REF_A)), '1');
  });
  await t('첫 실행 60분 창 밖에서 처음 생긴 RC 고객(나중에 따로 만든 ID) → late · 적립 0 · RC 기록 없음(404) → pending', async () => {
    mem = memoryInviteStore(() => NOW);
    await clickAndArrive(mem, { friendKey: KEY_B, ip: HEX(18), at: NOW });   // 도착 기록 = NOW + 60초
    assert.deepEqual(await verify(mem, KEY_B, UID_B, HEX(18), NOW + 3 * 3600_000, async () => ({ kind: 'missing' })), { state: 'pending', reason: 'missing' });
    assert.deepEqual(await verify(mem, KEY_B, UID_B, HEX(18), NOW + 3 * 3600_000, rcFixed(subscriber({ first: NOW + 60_000 + 61 * 60_000 }))), { state: 'final', reason: 'late' });
    assert.equal(await mem.get(K.credit(REF_A)), null);
    mem = memoryInviteStore(() => NOW);
    await clickAndArrive(mem, { friendKey: KEY_B, ip: HEX(19), at: NOW });
    assert.deepEqual(await verify(mem, KEY_B, UID_B, HEX(19), NOW + 3 * 3600_000, rcFixed(subscriber({ first: NOW + 60_000 + 59 * 60_000 }))), { state: 'credited' });
  });
  await t('자기 초대 — 친구 RC 고객 = 초대자 RC 고객(같은 기기에서 열쇠만 새로) → self · RC 호출 0 · 적립 0', async () => {
    mem = memoryInviteStore(() => NOW);
    await clickAndArrive(mem, { friendKey: KEY_B, ip: HEX(12), at: NOW });
    const before = rcCalls;
    let called = 0;
    const r = await verify(mem, KEY_B, UID_A, HEX(12), NOW + 300_000, async () => { called++; return { kind: 'ok', json: subscriber({ first: NOW + 90_000, buys: [{ at: NOW + 200_000 }] }) }; });
    assert.deepEqual(r, { state: 'final', reason: 'self' }); assert.equal(called, 0); assert.equal(rcCalls, before);
    assert.equal(await mem.get(K.credit(REF_A)), null);
  });
  await t('이미 고객 — first_seen 이 클릭 전 · 클릭 전 옛 구매(복원) → existing · 적립 0', async () => {
    for (const [n, json] of [
      [13, subscriber({ first: NOW - CLICK_SKEW_MS - 60_000, buys: [{ at: NOW + 300_000 }] })],
      [14, subscriber({ first: NOW + 90_000, buys: [{ at: NOW + 300_000, orig: NOW - 30 * 86400_000 }] })],
      [16, subscriber({ first: NOW - 5 * 60_000, buys: [{ at: NOW + 300_000 }] })],   // 클릭 5분 전에 이미 설치(관문 11131202 ②)
      [17, subscriber({ first: NOW + 90_000, buys: [{ at: NOW - 5 * 60_000 }] })],    // 클릭 5분 전 구매
    ] as const) {
      mem = memoryInviteStore(() => NOW);
      await clickAndArrive(mem, { friendKey: KEY_B, ip: HEX(n), at: NOW });
      assert.deepEqual(await verify(mem, KEY_B, UID_B, HEX(n), NOW + 400_000, rcFixed(json)), { state: 'final', reason: 'existing' }, `case ${n}`);
      assert.equal(await mem.get(K.credit(REF_A)), null);
    }
  });
  await t('시험(샌드박스) 고객 → sandbox · 적립 0 · 결론 뒤 운영 구매가 생겨도 그대로', async () => {
    mem = memoryInviteStore(() => NOW);
    await clickAndArrive(mem, { friendKey: KEY_B, ip: HEX(15), at: NOW });
    assert.deepEqual(await verify(mem, KEY_B, UID_B, HEX(15), NOW + 400_000, rcFixed(subscriber({ first: NOW + 90_000, buys: [{ at: NOW + 300_000, sandbox: true }] }))), { state: 'final', reason: 'sandbox' });
    assert.deepEqual(await verify(mem, KEY_B, UID_B, HEX(15), NOW + 900_000, rcFixed(subscriber({ first: NOW + 90_000, buys: [{ at: NOW + 800_000 }] }))), { state: 'final', reason: 'sandbox' });
    assert.equal(await mem.get(K.credit(REF_A)), null);
  });
  await t('같은 RC 고객이 다른 열쇠로 두 번(재설치) · 같은 스토어 거래 두 번 · 같은 IP 두 번 → 1건만', async () => {
    mem = memoryInviteStore(() => NOW);
    const rc = (tx: string) => rcFixed(subscriber({ first: NOW + 90_000, buys: [{ at: NOW + 300_000, tx }] }));
    await clickAndArrive(mem, { friendKey: KEY_B, ip: HEX(20), at: NOW });
    await clickAndArrive(mem, { friendKey: KEY_C, ip: HEX(21), at: NOW });
    await clickAndArrive(mem, { friendKey: KEY_D, ip: HEX(20), at: NOW + 1000 });
    assert.deepEqual(await verify(mem, KEY_B, UID_B, HEX(20), NOW + 400_000, rc('tx-1')), { state: 'credited' });
    assert.deepEqual(await verify(mem, KEY_C, UID_B, HEX(21), NOW + 400_000, rc('tx-2')), { state: 'final', reason: 'dup' }, '같은 RC 고객');
    mem = memoryInviteStore(() => NOW);
    await clickAndArrive(mem, { friendKey: KEY_B, ip: HEX(22), at: NOW });
    await clickAndArrive(mem, { friendKey: KEY_C, ip: HEX(23), at: NOW });
    await clickAndArrive(mem, { friendKey: KEY_D, ip: HEX(22), at: NOW + 1000 });
    assert.deepEqual(await verify(mem, KEY_B, UID_B, HEX(22), NOW + 400_000, rc('tx-9')), { state: 'credited' });
    assert.deepEqual(await verify(mem, KEY_C, UID_C, HEX(23), NOW + 400_000, rc('tx-9')), { state: 'final', reason: 'dup' }, '같은 거래');
    assert.deepEqual(await verify(mem, KEY_D, UID_D, HEX(22), NOW + 400_000, rc('tx-10')), { state: 'final', reason: 'ip' }, '같은 IP');
    assert.equal(await mem.get(K.credit(REF_A)), '1');
  });
  await t('같은 기기·같은 망 — 친구 첫 실행 IP = 초대자가 토큰을 받은 IP → same_ip(RC 호출 0 · 적립 0) · 다른 IP 는 통과', async () => {
    mem = memoryInviteStore(() => NOW);
    const { noteInviterIp } = await import('../src/lib/invite/referral');
    await noteInviterIp(mem, K.tokenIps(REF_A), HEX(50));
    await clickAndArrive(mem, { friendKey: KEY_B, ip: HEX(50), at: NOW });
    let called = 0;
    const rc: RcFetch = async () => { called++; return { kind: 'ok', json: subscriber({ first: NOW + 90_000, buys: [{ at: NOW + 300_000 }] }) }; };
    assert.deepEqual(await verify(mem, KEY_B, UID_B, HEX(50), NOW + 400_000, rc), { state: 'final', reason: 'same_ip' });
    assert.equal(called, 0); assert.equal(await mem.get(K.credit(REF_A)), null);
    await clickAndArrive(mem, { friendKey: KEY_C, ip: HEX(51), at: NOW });
    assert.deepEqual(await verify(mem, KEY_C, UID_C, HEX(51), NOW + 400_000, rc), { state: 'credited' });
    for (let n = 0; n < 7; n++) await noteInviterIp(mem, K.tokenIps(REF_A), HEX(60 + n));
    const kept = JSON.parse((await mem.get(K.tokenIps(REF_A)))!);
    assert.equal(kept.length, 5); assert.equal(kept[4], HEX(66));
  });
  await t('도착 응답 유실 → 다시 온 첫 실행은 again + claim(확인을 시작할 수 있게) · 대기 없는 again 은 claim 없음', async () => {
    mem = memoryInviteStore(() => NOW);
    await clickAndArrive(mem, { friendKey: KEY_B, ip: HEX(52), at: NOW });
    assert.deepEqual(await arrive(mem, { key: KEY_B, os: 'ios', ipHash: HEX(52), now: NOW + 90_000, vercelEnv: 'preview', requireToken: true }), { matched: false, reason: 'again', claim: true });
    await clickAndArrive(mem, { friendKey: KEY_C, ip: HEX(53), at: NOW, token: null });
    assert.deepEqual(await arrive(mem, { key: KEY_C, os: 'ios', ipHash: HEX(53), now: NOW + 90_000, vercelEnv: 'preview', requireToken: true }), { matched: false, reason: 'again' });
  });
  await t(`초대자 월 상한 ${INVITER_MONTHLY_CAP} 초과 → inviter_cap(적립 0) · 다음 달 칸은 따로`, async () => {
    mem = memoryInviteStore(() => NOW);
    await mem.set(K.month(REF_A, etMonth(NOW)), String(INVITER_MONTHLY_CAP), 40 * 86400);
    await clickAndArrive(mem, { friendKey: KEY_B, ip: HEX(30), at: NOW });
    assert.deepEqual(await verify(mem, KEY_B, UID_B, HEX(30), NOW + 400_000, rcFixed(subscriber({ first: NOW + 90_000, buys: [{ at: NOW + 300_000 }] }))), { state: 'final', reason: 'inviter_cap' });
    assert.equal(await mem.get(K.credit(REF_A)), null);
    assert.notEqual(etMonth(Date.parse('2026-12-01T12:00:00Z')), etMonth(NOW));
    assert.equal(etMonth(Date.parse('2026-12-01T03:00:00Z')), '2026-11', 'ET 기준(UTC 03시 = ET 전날 22시)');
  });
  await t(`하루 전체 상한 ${DAILY_CREDIT_CAP} → pending(day_cap · 결론 없음 — 다음 날 재시도)`, async () => {
    mem = memoryInviteStore(() => NOW);
    await mem.set(K.day(etDay(NOW + 400_000)), String(DAILY_CREDIT_CAP), 3 * 86400);
    await clickAndArrive(mem, { friendKey: KEY_B, ip: HEX(31), at: NOW });
    assert.deepEqual(await verify(mem, KEY_B, UID_B, HEX(31), NOW + 400_000, rcFixed(subscriber({ first: NOW + 90_000, buys: [{ at: NOW + 300_000 }] }))), { state: 'pending', reason: 'day_cap' });
    assert.equal(await mem.get(K.credit(REF_A)), null); assert.equal(await mem.get(K.claimDone(REF_B)), null);
  });
  await t('확인 대기 없음(초대로 오지 않은 기기)·형식 밖 RC ID → none / null · RC 호출 0', async () => {
    mem = memoryInviteStore(() => NOW);
    let called = 0; const rc: RcFetch = async () => { called++; return { kind: 'unavailable' }; };
    assert.deepEqual(await verify(mem, KEY_B, UID_B, HEX(40), NOW, rc), { state: 'none' });
    assert.equal(await verify(mem, KEY_B, 'bad id!', HEX(40), NOW, rc), null);
    assert.equal(called, 0);
  });
  await t('RC 장애·429 → pending(결론 없음) · 예산 초과(친구 ref 10분 6회) → limited', async () => {
    mem = memoryInviteStore(() => NOW);
    await clickAndArrive(mem, { friendKey: KEY_B, ip: HEX(41), at: NOW });
    assert.deepEqual(await verify(mem, KEY_B, UID_B, HEX(41), NOW + 1000, async () => ({ kind: 'unavailable' })), { state: 'pending', reason: 'unavailable' });
    assert.deepEqual(await verify(mem, KEY_B, UID_B, HEX(41), NOW + 2000, async () => ({ kind: 'limited' })), { state: 'pending', reason: 'limited' });
    for (let n = 0; n < 4; n++) await verify(mem, KEY_B, UID_B, HEX(41), NOW + 3000, async () => ({ kind: 'unavailable' }));
    assert.deepEqual(await verify(mem, KEY_B, UID_B, HEX(41), NOW + 4000, rcFixed(subscriber({ first: NOW + 90_000, buys: [{ at: NOW + 3000 }] }))), { state: 'pending', reason: 'limited' });
    assert.equal(await mem.get(K.credit(REF_A)), null);
  });
  await t('rcNewness — 거래 중복키: 운영 스토어·환불 아님만(환불·스토어 밖은 txn 없음) · 응답 모양이 이상하면 pending', () => {
    const base = subscriber({ first: NOW + 1, buys: [{ at: NOW + 2, tx: 'T1' }] }) as any;
    assert.deepEqual(rcNewness(base, NOW), { verdict: 'verified', txn: 'T1' });
    const sub = Object.values(base.subscriber.subscriptions)[0] as any;
    sub.refunded_at = iso(NOW + 3); assert.deepEqual(rcNewness(base, NOW), { verdict: 'verified', txn: null });
    delete sub.refunded_at; sub.store = 'promotional'; assert.deepEqual(rcNewness(base, NOW), { verdict: 'verified', txn: null });
    assert.deepEqual(rcNewness(subscriber({ first: NOW + 1 }), NOW), { verdict: 'verified', txn: null });
    assert.equal(rcNewness(null, NOW).verdict, 'pending'); assert.equal(rcNewness({ subscriber: {} }, NOW).verdict, 'pending');
  });

  console.log('⑤ Lua 원문 = 메모리 저장소');
  await t('ARRIVE_CLAIM_LUA·VERIFY_CREDIT_LUA 를 JS Lua 해석기로 — 같은 표의 결과가 메모리 저장소와 같다', async () => {
    const { mockRedis } = await import('./_giftLuaMock.mjs');
    const redis = mockRedis();
    const luaStore = {
      arriveClaim: async (i: any) => redis.eval(ARRIVE_CLAIM_LUA, 2, ...i.keys, ...arriveClaimArgs(i)),
      verifyCredit: async (i: any) => redis.eval(VERIFY_CREDIT_LUA, 9, ...i.keys, ...verifyCreditArgs(i)),
      get: async (k: string) => (await redis.get(k)) ?? null,
      set: async (k: string, v: string) => { await redis.set(k, v); },
    };
    const m = memoryInviteStore(() => NOW);
    const claimIn = (self: string, decision: any) => ({ keys: [`arr:${self}`, `clm:${self}`] as [string, string], now: NOW, decision, claim: decision === 'claim' ? '{"r":"a"}' : '', arriveTtl: 100, claimTtl: 100 });
    for (const [self, d, want] of [['b', 'claim', 'claimed'], ['b', 'claim', 'again'], ['c', 'legacy', 'legacy'], ['c', 'claim', 'again'], ['d', 'self', 'self'], ['e', 'none', 'none'], ['f', 'loose_ambiguous', 'loose_ambiguous']] as const) {
      assert.equal(await luaStore.arriveClaim(claimIn(self, d)), want, `lua ${self} ${d}`);
      assert.equal(await m.arriveClaim(claimIn(self, d)), want, `mem ${self} ${d}`);
    }
    const vin = (self: string, rc: string, ip: string, hasTxn = false, tx = 'tx') => ({
      keys: [`clm:${self}`, `done:${self}`, `rcu:${rc}`, hasTxn ? `rctx:${tx}` : `rctx:n${rc}`, `ipc:${ip}`, 'mon:a', 'day', 'cr:a', 'fr:a'] as any,
      now: NOW, inviterRef: 'a', monthCap: 2, dailyCap: 5, hasTxn, rcTtl: 9, ipTtl: 9, longTtl: 9, dayTtl: 9, monthTtl: 9, doneTtl: 9,
    });
    for (const s of ['g', 'h', 'i', 'j', 'k']) { await luaStore.set(`clm:${s}`, '{}'); await m.set(`clm:${s}`, '{}', 100); }
    const table: Array<[any, string]> = [
      [vin('b', 'u1', 'p1', true, 't1'), 'credited'], [vin('b', 'u1', 'p1'), 'again'], [vin('zz', 'u9', 'p9'), 'none'],
      [vin('g', 'u1', 'p2'), 'dup'], [vin('h', 'u2', 'p3', true, 't1'), 'dup'], [vin('i', 'u3', 'p1'), 'ip'],
      [vin('j', 'u4', 'p4'), 'credited'], [vin('k', 'u5', 'p5'), 'inviter_cap'],
    ];
    for (const [input, want] of table) {
      assert.equal(await luaStore.verifyCredit(input), want, `lua ${input.keys[0]}`);
      assert.equal(await m.verifyCredit(input), want, `mem ${input.keys[0]}`);
    }
    for (const k of ['cr:a', 'fr:a', 'mon:a', 'day']) { assert.equal(await luaStore.get(k), '2', `lua ${k}`); assert.equal(await m.get(k), '2', `mem ${k}`); }
    // 소수 카운터: Lua 도 쓰기 전에 거절(메모리는 예외) — RC·IP 표식이 남지 않는다(관문 11131202 ⑥)
    const r3 = mockRedis(); await r3.set('clm:w', '{}'); await r3.set('cr:a', '1.5');
    const fx = vin('w', 'u8', 'p8');
    assert.equal(await r3.eval(VERIFY_CREDIT_LUA, 9, ...fx.keys, ...verifyCreditArgs(fx)), 'invalid');
    assert.equal(await r3.get('rcu:u8'), null); assert.equal(await r3.get('ipc:p8'), null);
    const m3 = memoryInviteStore(() => NOW); await m3.set('clm:w', '{}', 9); await m3.set('cr:a', '1.5', 9);
    await assert.rejects(m3.verifyCredit(fx)); assert.equal(await m3.get('rcu:u8'), null);
    // 하루 상한: 결론 표식 없이 day_cap
    const r2 = mockRedis(); await r2.set('clm:q', '{}'); await r2.set('day', '5');
    const dc = vin('q', 'u7', 'p7'); dc.monthCap = 9;
    assert.equal(await r2.eval(VERIFY_CREDIT_LUA, 9, ...dc.keys, ...verifyCreditArgs(dc)), 'day_cap');
    assert.equal(await r2.get('done:q'), null);
  });

  console.log('⑥ 라우트 끝까지');
  await t('/api/invite/token → 카드 주소 inv → /app 터치 → arrive(claim:true) → verify(done) → inbox 번호 1장 · 지표 tissue·tclick·claim·rverify·reward·mint', async () => {
    mem = memoryInviteStore(); ec2.clear(); afterCalls.length = 0;
    await mem.sadd(K.poolIos, APPLE(7));
    const HOST = 'https://www.signumhq.com';
    const APPFETCH = { 'accept-language': 'ko-KR,ko;q=0.9', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', 'x-invite': '1' };
    const NAV = { 'accept-language': 'ko-KR,ko;q=0.9', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', 'sec-fetch-site': 'cross-site', 'sec-fetch-user': '?1' };
    const WV = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
    const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
    const post = (path: string, body: unknown, ip: string, ua = WV) => new NextRequest(`${HOST}${path}`, { method: 'POST', headers: { 'user-agent': ua, ...APPFETCH, 'x-invite-test-ip': ip }, body: JSON.stringify(body) });
    // 초대자: 토큰
    assert.equal((await tokenRoute.POST(post('/api/invite/token', { key: KEY_A, rcUid: 'bad id' }, '203.0.113.1'))).status, 400);
    const tr = await tokenRoute.POST(post('/api/invite/token', { key: KEY_A, rcUid: UID_A }, '203.0.113.1'));
    assert.equal(tr.status, 200); const tj = await tr.json(); assert.ok(INVITE_TOKEN_RE.test(tj.token)); assert.ok(!JSON.stringify(tj).includes(UID_A));
    await flush();
    const day = etDay();
    assert.equal(ec2.get(`share:probe:tissue:all:ios:${day}`), 1);
    // 친구: 카드 → 앱 이어 보기 주소(inv 유지) → /app
    const card = buildShareCardUrl('pick', { locale: 'ko', ticker: 'NVDA', ref: REF_A, via: 'ios', inv: tj.token });
    const appHref = inviteAppHref('pick', { lang: 'ko', ref: new URL(card).searchParams.get('ref'), inv: new URL(card).searchParams.get('inv') });
    const friendIp = '198.51.100.77';
    const g = await sg.GET(new NextRequest(appHref.replace(HOST, HOST), { headers: { 'user-agent': SAFARI, ...NAV, 'x-invite-test-ip': friendIp } }));
    assert.ok(g.status >= 200 && g.status < 400); await flush();
    assert.equal(ec2.get(`share:probe:tclick:sh_pick:ios:${day}`), 1);
    // 첫 실행
    const ar = await (await arriveRoute.POST(post('/api/invite/arrive', { key: KEY_B }, friendIp))).json();
    assert.deepEqual(ar, { ok: true, matched: true, claim: true }); await flush();
    assert.equal(ec2.get(`share:probe:claim:sh_pick:ios:${day}`), 1);
    assert.equal(ec2.has(`share:probe:credit:sh_pick:ios:${day}`), false);
    // 확인: RC 기록 아직 없음(404) → pending · 첫 실행 RC 신규 고객(구매 없음) → done + reward
    const clickAt = Date.now();
    rcReply = () => ({ status: 404 });
    let vr = await (await verifyRoute.POST(post('/api/invite/verify', { key: KEY_B, rcUid: UID_B }, friendIp))).json();
    assert.deepEqual(vr, { ok: true, state: 'pending' }); await flush();
    rcReply = (uid) => (uid === UID_B ? { status: 200, json: subscriber({ first: clickAt + 1000 }) } : { status: 404 });
    vr = await (await verifyRoute.POST(post('/api/invite/verify', { key: KEY_B, rcUid: UID_B }, friendIp))).json();
    assert.deepEqual(vr, { ok: true, state: 'done' }); await flush();
    assert.equal(ec2.get(`share:probe:reward:all:ios:${day}`), 1);
    assert.equal(ec2.get(`share:probe:rverify:credited:ios:${day}`), 1);
    assert.equal(ec2.get(`share:probe:rverify:p_missing:ios:${day}`), 1);
    // 초대자 선물함
    const ib = await (await inboxRoute.POST(post('/api/invite/inbox', { key: KEY_A }, '203.0.113.1'))).json();
    assert.equal(ib.minted, 1); assert.equal(ib.items.length, 1); assert.equal(ib.friends, 1);
    await flush(); assert.equal(ec2.get(`share:probe:mint:all:ios:${day}`), 1);
    // 지표 키에 토큰·열쇠·RC ID·번호 없음
    const keys = [...ec2.keys()].join('|');
    for (const secret of [tj.token, KEY_A, KEY_B, UID_A, UID_B, APPLE(7)]) assert.ok(!keys.includes(secret), '지표 키에 민감값 없음');
    // 봇·헤더 없음 → 403 · 데스크톱 → device
    assert.equal((await verifyRoute.POST(new NextRequest(`${HOST}/api/invite/verify`, { method: 'POST', headers: { 'user-agent': WV, 'content-type': 'application/json', 'accept-language': 'ko' }, body: '{}' }))).status, 403);
    assert.equal((await tokenRoute.POST(post('/api/invite/token', { key: KEY_A, rcUid: UID_A }, '203.0.113.1', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36'))).status, 403);
  });
  await t('/api/invite/token 한도 — 같은 ref 하루 30 초과 → 429', async () => {
    mem = memoryInviteStore();
    const HOST = 'https://www.signumhq.com';
    const h = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148', 'accept-language': 'ko', 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors', 'content-type': 'application/json', 'x-invite': '1', 'x-invite-test-ip': '203.0.113.9' };
    let last = 0;
    for (let n = 0; n < 31; n++) last = (await tokenRoute.POST(new NextRequest(`${HOST}/api/invite/token`, { method: 'POST', headers: h, body: JSON.stringify({ key: KEY_A, rcUid: UID_A }) }))).status;
    assert.equal(last, 429);
    afterCalls.length = 0;
  });

  console.log(failures.length ? `\n추천 보상 시험 실패 ${failures.length}건: ${failures.join(' / ')}` : `\n추천 보상 시험 ${passed}개 통과.`);
  if (failures.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
