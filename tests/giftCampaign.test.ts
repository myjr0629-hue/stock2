// 실행: npx tsx tests/giftCampaign.test.ts
/**
 * 공개 캠페인 링크(/app?camp=…·POST /api/gift/campaign) — 로컬 가짜 저장소만. 실제 Lua 배정·상한·이중 배정은 giftCampaignLua.test.mjs.
 * 범위: 기존 /app 회귀(플래그 꺼짐·목록 밖 id = origin/main 과 동일) · 3언어 화면 · 미리보기 카드 · 마감 · 결과 화면 · 등록 방어 · 계측 닫힌 목록.
 * 외부 접근은 시험 실패. 코드·비밀값을 출력하지 않는다.
 */
import { couponSafetyNormalized } from './_couponSafetyBaseline';
import assert from 'node:assert/strict';
import Module from 'node:module';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { relative } from 'node:path';
import ts from 'typescript';

let externalCalls = 0;
globalThis.fetch = async () => { externalCalls++; throw new Error('시험 중 외부 접근 금지'); };
const nsPath = require.resolve('next/server');
const ns = require(nsPath);
const afterCalls: Array<() => unknown> = [];
require.cache[nsPath] = { id: nsPath, filename: nsPath, loaded: true, exports: { ...ns, after: (fn: () => unknown) => { afterCalls.push(fn); } } } as Module;
const rcPath = require.resolve('../src/services/redisClient');
require.cache[rcPath] = { id: rcPath, filename: rcPath, loaded: true, exports: { getFromCache: async () => null, setInCache: async () => true } } as Module;
const serverPath = require.resolve('../src/lib/giftShare/server');
const server = { ...require(serverPath), giftStore: () => store };
require.cache[serverPath]!.exports = server;
const { giftIdentity } = require('../src/lib/giftShare/http');
const { CAMPAIGN_LUA } = require('../src/lib/giftShare/atomic.cjs');
const { BUMP_LUA, validEvent, validClientEvent } = require('../src/lib/giftShare/funnel.cjs');
const { giftCampaign, campaignUntil, GIFT_CAMPAIGNS } = require('../src/lib/giftShare/campaign');
const { couponHtml, campaignResultHtml } = require('../src/lib/marketing/couponHtml');
const route = require('../src/app/app/route');
const campaignRoute = require('../src/app/api/gift/campaign/route');
const { NextRequest } = ns;

let n = 0;
const t = async (name: string, fn: () => unknown) => { afterCalls.length = 0; await fn(); afterCalls.length = 0; n++; console.log(`통과: ${name}`); };
const ios = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0.0.0 Mobile Safari/537.36';
const androidWebView = 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 KAKAOTALK 10.8.0';
const desktop = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36';
const fakeCode = (os = 'ios') => randomBytes(16).toString('hex').slice(0, os === 'ios' ? 18 : 23).toUpperCase();
const baseHeaders = { 'user-agent': ios, 'accept-language': 'ko-KR', origin: 'https://www.signumhq.com', 'sec-fetch-site': 'same-origin', 'x-real-ip': '192.0.2.10' };
const req = (path: string, opts: Record<string, unknown> = {}) => new NextRequest(`https://www.signumhq.com${path}`, { headers: baseHeaders, ...opts });
let evalCalls = 0;
let lastEval: { keys: string[]; args: (string | number)[] } | null = null;
let answer: unknown = ['empty'];
const store = { eval: async (script: string, keys: string[], args: (string | number)[]) => {
  if (script === BUMP_LUA) return 1;
  evalCalls++;
  assert.equal(script, CAMPAIGN_LUA, '캠페인 등록은 캠페인 Lua 하나만 부른다');
  lastEval = { keys, args };
  if (answer instanceof Error) throw answer;
  return answer;
} };
process.env.GIFT_SHARE_SECRET = randomBytes(32).toString('hex');
process.env.INVITE_IP_SALT = randomBytes(32).toString('hex');
process.env.VERCEL_ENV = 'preview';
const cookie = () => `sg_gift_recipient=${giftIdentity(req('/app')).cookie}`;
const form = (fields: Record<string, string>) => new URLSearchParams(fields);
const post = (ua = ios, fields: Record<string, string> = { camp: 'weekend-1101', from: 'clien', l: 'ko' }, extra: Record<string, string> = {}, path = '/api/gift/campaign') =>
  req(path, { method: 'POST', headers: { ...baseHeaders, 'user-agent': ua, cookie: cookie(), 'content-type': 'application/x-www-form-urlencoded', ...extra }, body: form(fields) });
const location = (r: Response) => r.headers.get('location') || '';

const baselinePaths = new Set(['src/app/app/route.ts', 'src/lib/marketing/couponHtml.ts', 'src/lib/marketing/desktopHandoff.ts', 'src/lib/marketing/linkPreview.ts']);
const baselineCache = new Map<string, Module>();
function baseline(path: string): any {
  if (baselineCache.has(path)) return baselineCache.get(path)!.exports;
  const source = execFileSync('git', ['show', `origin/main:${path}`], { encoding: 'utf8' });
  const m = new Module(`${process.cwd()}/${path}`, module);
  m.filename = `${process.cwd()}/${path}`; m.paths = module.paths;
  baselineCache.set(path, m);
  const originalRequire = m.require.bind(m);
  m.require = ((id: string) => {
    const dependency = relative(process.cwd(), (Module as any)._resolveFilename(id, m));
    return baselinePaths.has(dependency) ? baseline(dependency) : originalRequire(id);
  }) as typeof m.require;
  (m as any)._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true } }).outputText, m.filename);
  return m.exports;
}
const same = async (path: string, ua: string, method = 'GET') => {
  const opts = { method, headers: { ...baseHeaders, 'user-agent': ua } };
  const a = await route.GET(req(path, opts));
  const b = await baseline('src/app/app/route.ts').GET(req(path, opts));
  assert.equal(a.status, b.status, path);
  assert.deepEqual([...a.headers].filter(([k]) => k !== 'set-cookie'), [...b.headers].filter(([k]) => k !== 'set-cookie'), path);
  assert.equal(couponSafetyNormalized(await a.text()), couponSafetyNormalized(await b.text()), path);
};
const human = { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' };

(async () => {
  await t('플래그 꺼짐: ?camp= 가 붙어도 origin/main /app 과 상태·헤더·본문 동일(4 UA × 3언어 × GET/HEAD)', async () => {
    delete process.env.GIFT_SHARE_ENABLED;
    for (const ua of [ios, android, desktop, 'facebookexternalhit/1.1']) for (const l of ['ko', 'en', 'ja']) for (const m of ['GET', 'HEAD']) {
      await same(`/app?camp=weekend-1101&from=clien&l=${l}`, ua, m);
    }
    assert.equal(evalCalls, 0);
  });
  process.env.GIFT_SHARE_ENABLED = '1';
  await t('켜짐 + 목록 밖 id·형식 오류: origin/main /app 과 동일', async () => {
    for (const camp of ['weekend-9999', 'WEEKEND-1101', '../x', '']) for (const ua of [ios, android, desktop]) {
      await same(`/app?camp=${encodeURIComponent(camp)}&from=clien&l=ko`, ua);
    }
    assert.equal(evalCalls, 0);
  });
  await t('정의·마감 표기: weekend-1101 = iOS 40·안드 20/일 · 11/30(ko·ja)·Nov 30(en)', () => {
    const c = giftCampaign('weekend-1101');
    assert.ok(c); assert.deepEqual(c.day, { ios: 40, android: 20 });
    assert.equal(campaignUntil(c, 'ko'), '11/30'); assert.equal(campaignUntil(c, 'ja'), '11/30'); assert.equal(campaignUntil(c, 'en'), 'Nov 30');
    assert.equal(giftCampaign('toString'), null); assert.equal(giftCampaign('__proto__'), null); assert.equal(giftCampaign(1), null);
    assert.equal(Object.keys(GIFT_CAMPAIGNS).length, 1);
  });
  await t('3언어 폰 화면: 번호 가림·캠페인 폼(camp·from·l)·채널 부제·마감일 · 선착순/남은 수 없음 · GET 재고 무호출 · 서명 쿠키', async () => {
    const want = { ko: ['클리앙 회원 전용', '11/30까지', '쿠폰 적용하고 무료로 시작', '내 쿠폰 받기'], en: ['Until Nov', 'Apply coupon', 'Get my coupon'], ja: ['11/30まで', 'クーポンを適用', '自分のクーポンを受け取る'] } as const;
    for (const l of ['ko', 'en', 'ja'] as const) for (const [ua, os] of [[ios, 'ios'], [android, 'android']] as const) {
      const r = await route.GET(req(`/app?camp=weekend-1101&from=clien&l=${l}`, { headers: { ...baseHeaders, 'user-agent': ua, ...human } }));
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('cache-control'), 'private, no-store, max-age=0');
      assert.equal(r.headers.get('referrer-policy'), 'same-origin');
      assert.match(r.headers.get('set-cookie') || '', /^sg_gift_recipient=/);
      const html = await r.text();
      assert.match(html, new RegExp(`<html lang="${l}">`));
      assert.ok(html.includes(`<form method="post" action="/api/gift/campaign${os === 'ios' ? '?gift_os=ios' : ''}"`));
      assert.ok(html.includes('name="camp" value="weekend-1101"') && html.includes('name="from" value="clien"') && html.includes(`name="l" value="${l}"`));
      assert.ok(html.includes('•••• •••• •••• ••••'));
      assert.ok(!/선착순|First \d|先着/.test(html), '가짜 희소성·한도 표기 없음');
      assert.ok(!html.includes('/api/gift/claim') && !html.includes('name="gift"'));
      const words = want[l].filter(w => os === 'ios' ? !/받기|Get my|受け取る/.test(w) : !/적용하고|Apply coupon|適用/.test(w));
      for (const w of words) assert.ok(html.includes(w) || html.replace(/<[^>]+>/g, '').includes(w), `${l}/${os}: ${w}`);
      if (os === 'android') assert.ok(!html.includes('<script>'), '안드 폼은 선물과 같이 스크립트 없이 동작');
    }
    assert.equal(evalCalls, 0);
  });
  await t('초대·선물 태그(from=gift·share_pick)를 붙여도 «친구가 보낸 선물»로 보이지 않는다', async () => {
    for (const from of ['gift', 'share_pick']) {
      const html = await (await route.GET(req(`/app?camp=weekend-1101&from=${from}&l=ko`, { headers: { ...baseHeaders, ...human } }))).text();
      assert.ok(!html.includes('친구가 보낸 선물') && !html.includes('친구 초대 혜택'));
      assert.ok(html.includes('name="from" value=""'));
    }
  });
  await t('PC: 같은 캠페인 링크 QR(via=qr)·iPad 이동(gift_os=ios) · 맥 UA iPad 힌트 → iOS 폼', async () => {
    const html = await (await route.GET(req('/app?camp=weekend-1101&from=clien&l=ja', { headers: { ...baseHeaders, 'user-agent': desktop, ...human } }))).text();
    assert.ok(html.includes('data-scan="https://www.signumhq.com/app?camp=weekend-1101&amp;from=clien&amp;l=ja&amp;via=qr"'));
    assert.ok(html.includes('"https://www.signumhq.com/app?camp=weekend-1101&from=clien&l=ja&gift_os=ios"'));
    assert.ok(html.includes('11/30まで'));
    const ipad = await (await route.GET(req('/app?camp=weekend-1101&from=clien&l=ja&gift_os=ios', { headers: { ...baseHeaders, 'user-agent': desktop, ...human } }))).text();
    assert.ok(ipad.includes('action="/api/gift/campaign?gift_os=ios"'));
  });
  await t('미리보기 봇: 카드만(제목 «PRO 1개월 무료 쿠폰»·양 OS 설명) · 쿠키·폼·재고 호출 없음', async () => {
    for (const l of ['ko', 'en', 'ja']) {
      const r = await route.GET(req(`/app?camp=weekend-1101&from=clien&l=${l}`, { headers: { ...baseHeaders, 'user-agent': 'facebookexternalhit/1.1' } }));
      const html = await r.text();
      assert.equal(r.headers.get('set-cookie'), null);
      assert.ok(!html.includes('<form'));
      assert.ok(html.includes(l === 'ko' ? 'SIGNUM HQ PRO 1개월 무료 쿠폰' : l === 'ja' ? 'SIGNUM HQ PRO 1か月無料クーポン' : 'SIGNUM HQ PRO 1-month free coupon'));
      assert.ok(html.includes(l === 'ko' ? '아이폰·안드로이드 모두' : l === 'ja' ? 'iPhone・Androidどちらでも' : 'Works on iPhone and Android'));
      assert.ok(!/선착순|First \d|先着/.test(html));
    }
    assert.equal(evalCalls, 0);
  });
  await t('마감 뒤 GET(관문 11010908 ②): «지금은 쿠폰을 발급할 수 없습니다» + «이미 받은 쿠폰 다시 보기» 폼 → 이미 받은 기기는 같은 코드 복구 · PC 는 안내만', async () => {
    const { campaignLanding } = require('../src/lib/giftShare/landing');
    const c = giftCampaign('weekend-1101');
    const recover = { ko: '이미 받은 쿠폰 다시 보기', en: 'Show the coupon I already got', ja: '受け取ったクーポンをもう一度表示' } as const;
    for (const l of ['ko', 'en', 'ja'] as const) for (const ua of [ios, android]) {
      const html = await (await campaignLanding(req(`/app?camp=weekend-1101&l=${l}`, { headers: { ...baseHeaders, 'user-agent': ua, ...human } }), c, c.endsAt)).text();
      assert.ok(html.includes(recover[l]));
      assert.ok(html.includes('action="/api/gift/campaign') && html.includes('name="camp" value="weekend-1101"'));
      assert.ok(!html.includes('•••• •••• •••• ••••'));
      if (l === 'ko') { assert.ok(html.includes('지금은 쿠폰을 발급할 수 없습니다')); assert.ok(html.includes('쿠폰 없이 앱만 설치하기')); }
    }
    const pc = await (await campaignLanding(req('/app?camp=weekend-1101&l=ko', { headers: { ...baseHeaders, 'user-agent': desktop, ...human } }), c, c.endsAt)).text();
    assert.ok(pc.includes('지금은 쿠폰을 발급할 수 없습니다') && !pc.includes('<form'));
    const code = fakeCode('ios'); answer = ['again', code];
    const r = await campaignRoute.POST(post());
    assert.equal(r.status, 303); assert.ok(location(r).endsWith(`code=${code}`));
  });
  await t('등록 iOS new·again → 애플 등록 주소 303(원탭) · 키는 시험 접두·IP/기기 가명 · 인자에 코드 없음', async () => {
    for (const status of ['new', 'again']) {
      const code = fakeCode('ios'); answer = [status, code];
      const r = await campaignRoute.POST(post());
      assert.equal(r.status, 303);
      assert.equal(location(r), `https://apps.apple.com/redeem?ctx=offercodes&id=6783130444&code=${code}`);
      assert.ok(lastEval!.keys.every(k => k.startsWith('promo:pv:gift:v1:')));
      assert.ok(!lastEval!.keys.join(' ').includes('192.0.2.10'));
      assert.ok(lastEval!.keys.some(k => k.includes(':camp:weekend-1101:day:') && k.endsWith(':ios')));
      assert.equal(lastEval!.args[1], 'ios'); assert.equal(lastEval!.args[3], 40); assert.equal(lastEval!.args[8], 'clien');
      assert.ok(!lastEval!.args.includes(code));
    }
  });
  await t('등록 안드 new·again → 내 쿠폰 번호 화면(복사·Play 등록·② 구독) · again 안내 · 앱 안 브라우저는 intent', async () => {
    for (const l of ['ko', 'en', 'ja']) for (const status of ['new', 'again']) {
      const code = fakeCode('android'); answer = [status, code];
      const r = await campaignRoute.POST(post(android, { camp: 'weekend-1101', from: 'clien', l }));
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('cache-control'), 'private, no-store, max-age=0');
      const html = await r.text();
      assert.ok(html.includes(`<p class="t-code long" id="code">${code}</p>`));
      assert.ok(html.includes(`href="https://play.google.com/redeem?code=${code}"`));
      assert.ok(html.includes('id="step2"') && html.includes('id="copy"'));
      assert.equal(html.includes('id="again"'), status === 'again');
      assert.equal(lastEval!.args[3], 20);
    }
    answer = ['new', fakeCode('android')];
    const html = await (await campaignRoute.POST(post(androidWebView))).text();
    assert.ok(html.includes('href="intent://'));
  });
  await t('결과 안내: recipient·cap(다음 배정 시각)·empty·total·off·ip·저장소 장애 → 사실대로 문구 + 설치 · 코드 없음', async () => {
    const cases: Array<[unknown, string, string]> = [
      [['recipient'], '이 기기는 이미 PRO 무료 쿠폰을 받았습니다', 'recipient'],
      [['cap'], '오늘 몫 쿠폰이 모두 나갔습니다 — 내일 다시 와 주세요', 'cap'],
      [['empty'], '쿠폰이 모두 소진되었습니다', 'empty'],
      [['total'], '쿠폰이 모두 소진되었습니다', 'total'],
      [['off'], '지금은 쿠폰을 발급할 수 없습니다', 'off'],
      [['ip'], '지금은 쿠폰을 발급할 수 없습니다', 'ip'],
      [['reserve'], '지금은 쿠폰을 발급할 수 없습니다', 'reserve'],
      [new Error('장애'), '잠시 후 다시 시도해 주세요', 'error'],
      [['bogus'], '잠시 후 다시 시도해 주세요', 'invalid'],
    ];
    for (const [value, text] of cases) for (const ua of [ios, android]) {
      answer = value;
      const r = await campaignRoute.POST(post(ua));
      assert.equal(r.status, 200);
      const html = await r.text();
      assert.ok(html.includes(text), text);
      assert.ok(html.includes('쿠폰 없이 앱만 설치하기'));
      assert.ok(!/redeem\?/.test(html));
      if (text.startsWith('오늘')) assert.match(html, /id="next" data-at="\d+"/);
      if (text.startsWith('잠시')) assert.ok(html.includes('action="/api/gift/campaign'), '다시 시도 폼');
    }
    for (const l of ['en', 'ja']) {
      answer = ['recipient'];
      const html = await (await campaignRoute.POST(post(ios, { camp: 'weekend-1101', from: 'clien', l }))).text();
      assert.ok(html.includes(l === 'en' ? 'This device already received a free PRO coupon' : 'この端末はすでにPRO無料クーポンを受け取っています'));
    }
  });
  await t('등록 방어: 출처·UA·봇·PC·본문·목록 밖 id → 재고 무호출 설치 303 · 쿠키 없음 → 새 쿠키 + 다시 시도 · 꺼짐 → 발급 불가', async () => {
    const before = evalCalls;
    for (const extra of [{ origin: 'https://evil.example' }, { origin: 'null' }, { 'sec-fetch-site': 'cross-site' }, { 'user-agent': 'curl/8.0' }, { 'user-agent': `${ios} bot` }]) {
      const r = await campaignRoute.POST(post(ios, undefined, extra));
      assert.equal(r.status, 303); assert.ok(!location(r).includes('redeem'));
    }
    assert.equal((await campaignRoute.POST(post(desktop))).status, 303);
    assert.equal((await campaignRoute.POST(post(ios, undefined, { 'content-type': 'text/plain' }))).status, 303);
    assert.equal((await campaignRoute.POST(post(ios, { camp: 'weekend-9999', from: 'clien', l: 'ko' }))).status, 303);
    const noCookie = await campaignRoute.POST(req('/api/gift/campaign', { method: 'POST', headers: { ...baseHeaders, 'content-type': 'application/x-www-form-urlencoded' }, body: form({ camp: 'weekend-1101' }) }));
    assert.equal(noCookie.status, 200);
    assert.match(noCookie.headers.get('set-cookie') || '', /^sg_gift_recipient=/);
    assert.ok((await noCookie.text()).includes('action="/api/gift/campaign'));
    const forged = await campaignRoute.POST(post(ios, undefined, { cookie: 'sg_gift_recipient=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.bad' }));
    assert.equal(forged.status, 200);
    assert.equal(evalCalls, before);
    delete process.env.GIFT_SHARE_ENABLED;
    const off = await campaignRoute.POST(post());
    assert.ok((await off.text()).includes('지금은 쿠폰을 발급할 수 없습니다'));
    assert.equal(evalCalls, before);
    process.env.GIFT_SHARE_ENABLED = '1';
  });
  await t('계측 닫힌 목록: 서버 지점 open·redeem·claim 만 camp · 클라이언트 비콘 camp 거부 · 기존 선물 판정 그대로', () => {
    for (const d of ['new', 'again', 'recipient', 'cap', 'empty', 'off', 'total', 'ip', 'reserve', 'error', 'cookie']) assert.ok(validEvent('claim', 'camp', 'ios', d), d);
    assert.ok(validEvent('open', 'camp', 'desktop', 'all')); assert.ok(validEvent('redeem', 'camp', 'android', 'all'));
    assert.ok(!validEvent('issue', 'camp', 'ios', 'new')); assert.ok(!validEvent('claim', 'camp', 'ios', 'clien')); assert.ok(!validEvent('open', 'camp', 'ios', 'x'));
    for (const s of ['visible', 'tap', 'copy', 'gate']) assert.ok(!validClientEvent(s, 'camp', 'ios', s === 'gate' ? 'off' : 'all'));
    assert.ok(validClientEvent('tap', 'gift_set', 'ios', 'all')); assert.ok(validEvent('claim', 'all', 'ios', 'taken'));
  });
  await t('GET 열람 계측: 사람 폰 열람만 open|camp 묶음에 들어간다(응답 뒤)', async () => {
    afterCalls.length = 0;
    await route.GET(req('/app?camp=weekend-1101&from=clien&l=ko', { headers: { ...baseHeaders, ...human } }));
    assert.ok(afterCalls.length >= 1, '응답 뒤 작업 예약(채널 클릭·열람)');
  });
  await t('결과 화면 단독: 안드 번호 형식이 틀리면 번호를 그리지 않는다', () => {
    const html = campaignResultHtml({ platform: 'android', lang: 'ko', view: 'code', campaign: { id: 'weekend-1101', from: null, sub: '' }, installUrl: '#', code: '<b>' });
    assert.ok(!html.includes('<b>') && !html.includes('id="code"'));
    assert.ok(couponHtml({ platform: 'ios', lang: 'ko', fromTag: null, code: 'X', appleRedeemUrl: '#', playInstallUrl: '#' }).includes('href="#"'));
  });
  assert.equal(externalCalls, 0);
  console.log(`캠페인 시험 ${n}개 통과`);
})().catch((e) => { console.error('실패:', e?.message || e); process.exitCode = 1; });
