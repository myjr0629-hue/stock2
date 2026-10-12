/**
 * UC 새 생성 허용 판정(lib/seo/ucGenGate) · 시험 호출 표식(lib/ai/llmTestSpend) · UC 카운터 키(lib/ai/ucSource) — 2026-10-12
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/ucGenGate.test.ts
 * 네트워크·Redis 를 건드리지 않는다(가짜 저장소).
 */
import assert from 'node:assert/strict';
import { ucGenVerdict, hasCampaignParam, CAMPAIGN_KEYS } from '../src/lib/seo/ucGenGate';
import { cleanTag, recordTestSpend, sumTestSpend, testCallsKey } from '../src/lib/ai/llmTestSpend';
import { bumpUcSrc, ucSrcKey, hourOf } from '../src/lib/ai/ucSource';
import type { LlmStore } from '../src/lib/ai/llmStore';

const H = (o: Record<string, string>) => ({ get: (n: string) => o[n.toLowerCase()] ?? null });
const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const GOOGLEBOT = 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const NAV = { 'accept-language': 'ko-KR,ko;q=0.9', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' };

let passed = 0;
const ok = (name: string, fn: () => void) => { fn(); passed++; console.log('✓ ' + name); };
const okA = async (name: string, fn: () => Promise<void>) => { await fn(); passed++; console.log('✓ ' + name); };

ok('봇 표지(구글봇·빙봇·AI 수집기) = 생성 안 함', () => {
  assert.deepEqual(ucGenVerdict(H({ ...NAV, 'sec-fetch-site': 'none', 'user-agent': GOOGLEBOT })), { allow: false, reason: 'bot' });
  assert.equal(ucGenVerdict(H({ ...NAV, 'user-agent': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36' })).allow, false);
  assert.equal(ucGenVerdict(H({ ...NAV, 'user-agent': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1; +https://openai.com/gptbot)' })).allow, false);
});
ok('브라우저 헤더를 흉내 낸 수집기(직접 방문·리퍼러 없음·캠페인 없음) = 생성 안 함 — 10/11·10/12 실측 사람판정의 99%', () => {
  assert.deepEqual(ucGenVerdict(H({ ...NAV, 'sec-fetch-site': 'none', 'user-agent': WIN })), { allow: false, reason: 'direct' });
  assert.deepEqual(ucGenVerdict(H({ ...NAV, 'sec-fetch-site': 'none', 'user-agent': IPHONE })), { allow: false, reason: 'direct' });
});
ok('검색·소셜·자사 링크로 들어온 사람 = 생성 허용', () => {
  for (const ref of ['https://www.google.com/', 'https://www.bing.com/', 'https://search.naver.com/search.naver?query=x', 'https://x.com/', 'https://www.signumhq.com/ko/rankings', 'https://chatgpt.com/', 'https://some-blog.example/post']) {
    assert.equal(ucGenVerdict(H({ ...NAV, 'sec-fetch-site': 'cross-site', 'user-agent': WIN, referer: ref })).allow, true, ref);
  }
  assert.equal(ucGenVerdict(H({ ...NAV, 'user-agent': WIN, referer: 'https://www.google.com/' })).reason, 'referred');
});
ok('캠페인 링크(?from= · utm_) = 리퍼러가 없어도 허용', () => {
  assert.deepEqual(ucGenVerdict(H({ ...NAV, 'user-agent': IPHONE }), { campaign: true }), { allow: true, reason: 'campaign' });
  assert.equal(hasCampaignParam({ from: 'x_us' }), true);
  assert.equal(hasCampaignParam({ utm_source: 'naver' }), true);
  assert.equal(hasCampaignParam({}), false);
  assert.equal(hasCampaignParam({ from: '' }), false);
  assert.equal(hasCampaignParam(undefined), false);
  assert.ok(CAMPAIGN_KEYS.includes('from'));
});
ok('앱 웹뷰(native) = 항상 허용', () => {
  assert.deepEqual(ucGenVerdict(H({ 'user-agent': 'com.signumhq.app' }), { native: true }), { allow: true, reason: 'native' });
});
ok('prefetch·라우터 fetch·언어 없음·메타 없음 = 허용 안 함(사람 판정과 같은 규칙)', () => {
  assert.equal(ucGenVerdict(H({ ...NAV, 'user-agent': WIN, 'sec-purpose': 'prefetch', referer: 'https://www.google.com/' })).allow, false);
  assert.equal(ucGenVerdict(H({ 'user-agent': WIN, 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', referer: 'https://www.google.com/' })).reason, 'nolang');
  assert.equal(ucGenVerdict(H({ 'accept-language': 'en', 'user-agent': WIN, referer: 'https://www.google.com/' })).reason, 'nometa');
  assert.equal(ucGenVerdict(H({ 'accept-language': 'en', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty', 'sec-fetch-site': 'same-origin', 'user-agent': WIN, referer: 'https://www.signumhq.com/' })).allow, false);
});
ok('카카오톡 인앱(사람)은 리퍼러가 있으면 허용', () => {
  const KAKAO = 'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36;KAKAOTALK 2410430';
  assert.equal(ucGenVerdict(H({ ...NAV, 'user-agent': KAKAO, referer: 'https://talk.kakao.com/' })).allow, true);
});

ok('시험 표식: tag 정리 · 합계(구간·깨진 줄·tag별)', () => {
  assert.equal(cleanTag('AIQ55 harness!'), 'aiq55harness');
  assert.equal(cleanTag(''), 'untagged');
  assert.equal(cleanTag(undefined), 'untagged');
  assert.equal(cleanTag('x'.repeat(40)).length, 24);
  const lines = [
    JSON.stringify({ t: 1000, tag: 'aiq55', usd: 0.5, m: 'm' }), JSON.stringify({ t: 2000, tag: 'aiq55', usd: 0.25, m: 'm' }),
    JSON.stringify({ t: 2500, tag: 'other', usd: 1, m: 'm' }), 'garbage', JSON.stringify({ t: 9000, tag: 'late', usd: 7, m: 'm' }),
  ];
  const s = sumTestSpend(lines, 0, 5000);
  assert.equal(s.usd, 1.75); assert.equal(s.n, 3); assert.deepEqual(s.byTag, { aiq55: 0.75, other: 1 });
});
const fakeStore = () => {
  const lists = new Map<string, string[]>(); const nums = new Map<string, number>();
  const st: LlmStore = {
    async get(k) { return nums.has(k) ? String(nums.get(k)) : null }, async setEx() { }, async del() { },
    async incrByFloat(k, d) { const n = (nums.get(k) || 0) + d; nums.set(k, n); return n; },
    async rpush(k, v) { const a = lists.get(k) || []; a.push(v); lists.set(k, a); },
    async lrange(k) { return lists.get(k) || []; }, async lpushTrim() { },
  };
  return { st, lists, nums };
};
async function main() {
  await okA('recordTestSpend: 시간별 키에 한 줄 · 0 이하는 안 쓴다 · 저장소 예외는 삼킨다', async () => {
    const { st, lists } = fakeStore();
    const now = Date.parse('2026-10-12T13:20:00Z');
    await recordTestSpend('AIQ55', 0.0123456789, 'claude-sonnet-5-5', now, st);
    await recordTestSpend('aiq55', 0, 'm', now, st);
    const arr = lists.get(testCallsKey('2026101213')) || [];
    assert.equal(arr.length, 1);
    const r = JSON.parse(arr[0]); assert.equal(r.tag, 'aiq55'); assert.equal(r.usd, 0.012346); assert.equal(r.t, now);
    const boom = { ...st, rpush: async () => { throw new Error('down'); } } as LlmStore;
    await recordTestSpend('x', 1, 'm', now, boom);   // 던지지 않는다
  });
  await okA('bumpUcSrc: 종류별 시간 키를 1씩 올린다 · 예외는 삼킨다', async () => {
    const { st, nums } = fakeStore();
    const now = Date.parse('2026-10-12T13:20:00Z');
    await bumpUcSrc('gen', now, st); await bumpUcSrc('gen', now, st); await bumpUcSrc('nogen_miss', now, st);
    assert.equal(nums.get(ucSrcKey('2026101213', 'gen')), 2); assert.equal(nums.get(ucSrcKey('2026101213', 'nogen_miss')), 1);
    assert.equal(hourOf(now), '2026101213');
    await bumpUcSrc('gen', now, { ...st, incrByFloat: async () => { throw new Error('down'); } } as LlmStore);
  });
  console.log(`\n${passed} passed`);
}
main().catch((e) => { console.error(e); process.exit(1); });
