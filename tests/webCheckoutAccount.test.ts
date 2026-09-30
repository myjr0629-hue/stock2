/**
 * 웹 결제 ↔ 계정 연결 시험 (2026-09-30, 대표 «웹은 웹 앱은 앱이다» — 웹 Stripe 결함 2건 중 (a))
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/webCheckoutAccount.test.ts
 *
 * 네트워크 없음 · Stripe 운영 키·실결제 없음: 결제 세션 생성은 가짜로 받아 적고, 웹훅 서명만 stripe 패키지의
 * 시험용 서명(generateTestHeaderString)으로 만든다(키·비밀값은 시험 전용 가짜 문자열).
 *
 * 지키는 것:
 *  1) 로그인 안 한 채 결제 버튼(POST) → Stripe 세션을 만들지 않고 로그인 화면(next=결제 이어가기)을 준다
 *  2) 로그인한 결제(POST·GET 이어가기)는 세션에 계정 ID 를 싣는다 — client_reference_id + metadata(+구독 metadata)
 *  3) 로그인 뒤 이어가기(GET): 비로그인 → 로그인으로 · 이미 PRO/ELITE → 요금 페이지(이중 결제 방지) · 오류 → 요금 페이지
 *  4) 웹훅이 그 ID 로 user_profiles.tier 를 붙인다 — client_reference_id 우선, 예전 metadata 도 계속 · 서명 틀리면 400
 *     + 결제 라우트가 만든 세션 값 그대로 웹훅에 넣어 «계정에 등급이 붙는다»를 끝에서 끝까지 고정
 *  5) 로그인 콜백: next(쿼리·쿠키)를 검사한다 — 외부로 나가는 열린 리다이렉트 차단, 결제 이어가기는 통과
 *  6) 로그인 화면: Supabase redirectTo 는 예전 그대로(허용 목록 무관), 돌아갈 곳은 짧은 쿠키
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

// ── 환경(시험 전용 가짜 값 — 실제 키 아님) ──
process.env.STRIPE_SECRET_KEY = 'unit-test-not-a-real-key';
process.env.STRIPE_WEBHOOK_SECRET = 'unit-test-webhook-secret';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'unit-test-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'unit-test-service';

const stub = (p: string, exports: any) => {
  require.cache[p] = { id: p, filename: p, loaded: true, exports } as any;
};

// ── 가짜 Supabase(로그인 사용자·프로필 조회·코드 교환) ──
let authUser: { id: string; email?: string } | null = null;
let profileRow: { tier: string } | null = null;
let profileErr: any = null;
let profileQueries = 0;
const serverClient = {
  auth: {
    getUser: async () => ({ data: { user: authUser }, error: null }),
    exchangeCodeForSession: async (code: string) => ({ error: code === 'bad' ? { message: 'invalid grant' } : null }),
  },
  from: (_table: string) => ({
    select: (_cols: string) => ({
      eq: (_c: string, _v: string) => ({
        maybeSingle: async () => { profileQueries++; return { data: profileRow, error: profileErr }; },
      }),
    }),
  }),
};
stub(require.resolve('../src/lib/supabase/server'), { __esModule: true, createClient: async () => serverClient });

// ── 가짜 next/headers(콜백의 쿠키) ──
let reqCookies: Record<string, string> = {};
const cookieStore = {
  get: (name: string) => (name in reqCookies ? { name, value: reqCookies[name] } : undefined),
  getAll: () => Object.entries(reqCookies).map(([name, value]) => ({ name, value })),
};
stub(require.resolve('next/headers'), { __esModule: true, cookies: async () => cookieStore });

// ── 가짜 서비스 롤 클라이언트(웹훅의 등급 기록) ──
const upserts: { table: string; row: any; opts: any }[] = [];
stub(require.resolve('@supabase/supabase-js'), {
  __esModule: true,
  createClient: () => ({ from: (table: string) => ({ upsert: async (row: any, opts: any) => { upserts.push({ table, row, opts }); return { error: null }; } }) }),
});

// ── Stripe: 세션 생성은 가짜로 받아 적고, 웹훅 서명 검증은 진짜 stripe 패키지 ──
const stripeLibPath = require.resolve('../src/lib/stripe');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const realStripeLib = require('../src/lib/stripe');
const realStripe = realStripeLib.getStripe(); // 생성만 — 네트워크 호출 없음
const created: any[] = [];
let createFails = false;
const fakeStripe = {
  checkout: {
    sessions: {
      create: async (params: any) => {
        if (createFails) throw new Error('stripe down');
        created.push(params);
        return { id: `cs_test_${created.length}`, url: `https://checkout.stripe.com/c/pay/cs_test_${created.length}` };
      },
    },
  },
  webhooks: realStripe.webhooks,
};
require.cache[stripeLibPath]!.exports = { __esModule: true, ...realStripeLib, getStripe: () => fakeStripe };
const { STRIPE_PRICES } = realStripeLib;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const CHECKOUT = require('../src/app/api/stripe/checkout/route');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const WEBHOOK = require('../src/app/api/stripe/webhook/route');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const CALLBACK = require('../src/app/auth/callback/route');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { safeNext, checkoutResumePath, loginPathWithNext, nextCookieString, nextFromCookieValue, NEXT_COOKIE } = require('../src/lib/auth/safeNext');

const SITE = 'https://www.signumhq.com';
const reset = () => { authUser = null; profileRow = null; profileErr = null; profileQueries = 0; created.length = 0; upserts.length = 0; createFails = false; reqCookies = {}; };

const post = async (body: any) => {
  const res = await CHECKOUT.POST(new NextRequest(`${SITE}/api/stripe/checkout`, {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', origin: SITE },
  }));
  return { status: res.status as number, j: (await res.json()) as any };
};
const get = async (qs: string) => {
  const res = await CHECKOUT.GET(new NextRequest(`${SITE}/api/stripe/checkout${qs}`));
  return { status: res.status as number, loc: res.headers.get('location') as string, cc: res.headers.get('cache-control') };
};
const sign = (payload: string, secret = process.env.STRIPE_WEBHOOK_SECRET!) => realStripe.webhooks.generateTestHeaderString({ payload, secret });
const hook = async (event: any, sig?: string) => {
  const payload = JSON.stringify(event);
  const res = await WEBHOOK.POST(new NextRequest(`${SITE}/api/stripe/webhook`, {
    method: 'POST', body: payload, headers: { 'stripe-signature': sig ?? sign(payload) },
  }));
  return { status: res.status as number, j: (await res.json()) as any };
};
const completed = (obj: any) => ({
  id: 'evt_test_1', object: 'event', type: 'checkout.session.completed',
  data: { object: { id: 'cs_test_1', object: 'checkout.session', customer: 'cus_test_1', subscription: 'sub_test_1', ...obj } },
});
const callback = async (qs: string, cookies: Record<string, string> = {}, origin = SITE) => {
  reqCookies = cookies;
  const res = await CALLBACK.GET(new Request(`${origin}/auth/callback${qs}`));
  return { status: res.status as number, loc: res.headers.get('location') as string, next: res.cookies.get(NEXT_COOKIE), res };
};

let n = 0;
const ta = async (name: string, fn: () => Promise<void> | void) => { reset(); await fn(); n++; console.log(`  ✓ ${name}`); };
const RESUME_KO_PRO_M = '/api/stripe/checkout?plan=pro&billing=monthly&locale=ko';

(async () => {
  // 라우트의 로그는 시험 출력만 어지럽힌다 — 끄되 ✓ 줄은 남긴다
  const log = console.log.bind(console);
  console.warn = () => {};
  console.error = () => {};
  console.log = (...a: any[]) => { if (typeof a[0] === 'string' && a[0].startsWith('[Stripe')) return; log(...a); };

  console.log('━━━ 돌아갈 곳(next) 검사 ━━━');
  await ta('같은 사이트 경로만 — 외부·프로토콜 상대·역슬래시·제어문자·과길이는 대체값', () => {
    assert.equal(safeNext('/ko/pricing'), '/ko/pricing');
    assert.equal(safeNext(RESUME_KO_PRO_M), RESUME_KO_PRO_M);
    for (const bad of ['@evil.com', '//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)', '/a\u0000b', '/x'.repeat(300), '', null, undefined]) {
      assert.equal(safeNext(bad as any, 'FB'), 'FB', String(bad));
    }
  });
  await ta('결제 이어가기 주소·로그인 주소·쿠키 문자열 — 인코딩 왕복', () => {
    assert.equal(checkoutResumePath('pro', 'monthly', 'ko'), RESUME_KO_PRO_M);
    const login = loginPathWithNext('ko', RESUME_KO_PRO_M);
    assert.equal(login, `/ko/login?next=${encodeURIComponent(RESUME_KO_PRO_M)}`);
    assert.equal(new URL(login, SITE).searchParams.get('next'), RESUME_KO_PRO_M);
    assert.equal(loginPathWithNext('fr', '/x'), '/en/login?next=%2Fx');
    const c = nextCookieString(RESUME_KO_PRO_M, true);
    assert.match(c, /^shq_next=[^;]+; max-age=1800; path=\/; samesite=lax; secure$/);
    assert.equal(nextFromCookieValue(c.split(';')[0].split('=')[1]), RESUME_KO_PRO_M);
    assert.match(nextCookieString('//evil.com'), /^shq_next=; max-age=0;/, '이상한 값이면 저장 대신 지운다');
    assert.equal(nextFromCookieValue(encodeURIComponent('//evil.com')), '');
    assert.equal(nextFromCookieValue('%E0%A4%A'), '', '깨진 인코딩');
  });

  console.log('━━━ 결제 버튼(POST) ━━━');
  await ta('비로그인 → 세션 안 만듦 · 로그인 화면(next=결제 이어가기)을 준다', async () => {
    const r = await post({ plan: 'pro', billing: 'monthly', locale: 'ko' });
    assert.equal(r.status, 200);
    assert.equal(r.j.loginRequired, true);
    assert.equal(r.j.url, `/ko/login?next=${encodeURIComponent(RESUME_KO_PRO_M)}`);
    assert.equal(created.length, 0, 'Stripe 세션을 만들면 안 된다');
    const ja = await post({ plan: 'elite', billing: 'yearly', locale: 'ja' });
    assert.equal(ja.j.url, `/ja/login?next=${encodeURIComponent('/api/stripe/checkout?plan=elite&billing=yearly&locale=ja')}`);
  });
  await ta('로그인 → 세션에 계정 ID(client_reference_id·metadata·구독 metadata)', async () => {
    authUser = { id: 'user-abc', email: 'a@example.com' };
    const r = await post({ plan: 'pro', billing: 'yearly', locale: 'en' });
    assert.equal(r.status, 200);
    assert.equal(r.j.url, 'https://checkout.stripe.com/c/pay/cs_test_1');
    assert.equal(created.length, 1);
    const p = created[0];
    assert.equal(p.client_reference_id, 'user-abc');
    assert.deepEqual(p.metadata, { plan: 'pro', billing: 'yearly', supabase_user_id: 'user-abc' });
    assert.deepEqual(p.subscription_data.metadata, { plan: 'pro', billing: 'yearly', supabase_user_id: 'user-abc' });
    assert.deepEqual(p.line_items, [{ price: STRIPE_PRICES.pro.yearly, quantity: 1 }], '가격은 예전 그대로');
    assert.equal(p.mode, 'subscription');
    assert.equal(p.customer_email, 'a@example.com');
    assert.equal(p.locale, 'en');
    assert.equal(p.allow_promotion_codes, true);
    assert.match(p.success_url, /\/en\/pricing\?session_id=\{CHECKOUT_SESSION_ID\}&success=true$/);
    assert.equal(profileQueries, 0, '요금 페이지 버튼 경로는 예전처럼 등급 조회 없이');
  });
  await ta('잘못된 요금제·주기 → 400 · 세션 없음', async () => {
    authUser = { id: 'user-abc' };
    for (const body of [{ plan: 'gold', billing: 'monthly' }, { plan: 'pro', billing: 'weekly' }, {}, { plan: 'constructor', billing: 'name' }, { plan: '__proto__', billing: 'toString' }]) {
      const r = await post({ ...body, locale: 'ko' });
      assert.equal(r.status, 400, JSON.stringify(body));
    }
    assert.equal(created.length, 0);
  });

  console.log('━━━ 로그인 뒤 이어가기(GET) ━━━');
  await ta('비로그인 → 로그인 화면으로 303(next 유지) · 세션 없음 · no-store', async () => {
    const r = await get('?plan=pro&billing=monthly&locale=ko');
    assert.equal(r.status, 303);
    assert.equal(r.loc, `${SITE}/ko/login?next=${encodeURIComponent(RESUME_KO_PRO_M)}`);
    assert.equal(r.cc, 'no-store');
    assert.equal(created.length, 0);
  });
  await ta('로그인(무료) → 계정 ID 를 실은 세션을 만들어 Stripe 결제 화면으로 303', async () => {
    authUser = { id: 'user-free', email: 'f@example.com' };
    profileRow = { tier: 'free' };
    const r = await get('?plan=elite&billing=monthly&locale=ja');
    assert.equal(r.status, 303);
    assert.equal(r.loc, 'https://checkout.stripe.com/c/pay/cs_test_1');
    assert.equal(r.cc, 'no-store');
    assert.equal(created[0].client_reference_id, 'user-free');
    assert.equal(created[0].metadata.supabase_user_id, 'user-free');
    assert.equal(created[0].metadata.plan, 'elite');
    assert.deepEqual(created[0].line_items, [{ price: STRIPE_PRICES.elite.monthly, quantity: 1 }]);
    assert.equal(created[0].success_url, `${SITE}/ja/pricing?session_id={CHECKOUT_SESSION_ID}&success=true`);
  });
  await ta('이미 PRO·ELITE → 새 결제 대신 요금 페이지(이중 결제 방지)', async () => {
    authUser = { id: 'user-pro' };
    for (const tier of ['pro', 'elite']) {
      profileRow = { tier };
      const r = await get('?plan=pro&billing=monthly&locale=ko');
      assert.deepEqual([r.status, r.loc], [303, `${SITE}/ko/pricing`], tier);
    }
    assert.equal(created.length, 0);
  });
  await ta('프로필 조회 실패·행 없음 → 막지 않는다(예전처럼 결제로)', async () => {
    authUser = { id: 'user-new' };
    profileErr = { message: 'db down' };
    assert.equal((await get('?plan=pro&billing=monthly&locale=ko')).loc, 'https://checkout.stripe.com/c/pay/cs_test_1');
    profileErr = null; profileRow = null;
    assert.equal((await get('?plan=pro&billing=monthly&locale=ko')).loc, 'https://checkout.stripe.com/c/pay/cs_test_2');
  });
  await ta('잘못된 요금제 → 요금 페이지 · Stripe 오류 → 요금 페이지(?checkout_error=1)', async () => {
    authUser = { id: 'user-free' };
    assert.equal((await get('?plan=gold&billing=monthly&locale=fr')).loc, `${SITE}/en/pricing`);
    createFails = true;
    const r = await get('?plan=pro&billing=monthly&locale=ko');
    assert.deepEqual([r.status, r.loc], [303, `${SITE}/ko/pricing?checkout_error=1`]);
  });
  await ta('왕복: 비로그인 POST 가 준 next 를 로그인 뒤 그대로 열면 결제로 이어진다', async () => {
    const first = await post({ plan: 'pro', billing: 'monthly', locale: 'ko' });
    const next = safeNext(new URL(first.j.url, SITE).searchParams.get('next'), '');
    assert.equal(next, RESUME_KO_PRO_M);
    authUser = { id: 'user-roundtrip' }; // 로그인 완료
    const r = await get(next.slice('/api/stripe/checkout'.length));
    assert.equal(r.loc, 'https://checkout.stripe.com/c/pay/cs_test_1');
    assert.equal(created[0].client_reference_id, 'user-roundtrip');
  });

  console.log('━━━ 웹훅 → 등급 ━━━');
  await ta('client_reference_id 로 user_profiles.tier 를 붙인다(metadata 에 ID 가 없어도)', async () => {
    const r = await hook(completed({ client_reference_id: 'user-abc', metadata: { plan: 'pro', billing: 'monthly' } }));
    assert.deepEqual([r.status, r.j], [200, { received: true }]);
    assert.equal(upserts.length, 1);
    const u = upserts[0];
    assert.equal(u.table, 'user_profiles');
    assert.deepEqual(u.opts, { onConflict: 'user_id' });
    assert.equal(u.row.user_id, 'user-abc');
    assert.equal(u.row.tier, 'pro');
    assert.equal(u.row.stripe_customer_id, 'cus_test_1');
    assert.equal(u.row.stripe_subscription_id, 'sub_test_1');
  });
  await ta('예전 세션(metadata.supabase_user_id 만)도 계속 붙는다', async () => {
    await hook(completed({ client_reference_id: null, metadata: { plan: 'elite', billing: 'yearly', supabase_user_id: 'user-old' } }));
    assert.deepEqual([upserts[0].row.user_id, upserts[0].row.tier], ['user-old', 'elite']);
  });
  await ta('계정 ID 가 없는 세션(예전 비로그인 결제) → 등급을 붙일 곳이 없다(이번 수리의 이유)', async () => {
    const r = await hook(completed({ client_reference_id: null, metadata: { plan: 'pro', billing: 'monthly', supabase_user_id: '' } }));
    assert.equal(r.status, 200);
    assert.equal(upserts.length, 0);
  });
  await ta('구독 변경 → 가격으로 등급 · 구독 해지 → free (구독 metadata 의 ID)', async () => {
    await hook({ id: 'evt_u', object: 'event', type: 'customer.subscription.updated', data: { object: { id: 'sub_test_1', customer: 'cus_test_1', metadata: { supabase_user_id: 'user-abc' }, items: { data: [{ price: { id: STRIPE_PRICES.elite.monthly } }] } } } });
    await hook({ id: 'evt_d', object: 'event', type: 'customer.subscription.deleted', data: { object: { id: 'sub_test_1', metadata: { supabase_user_id: 'user-abc' } } } });
    assert.deepEqual(upserts.map((u) => [u.row.user_id, u.row.tier]), [['user-abc', 'elite'], ['user-abc', 'free']]);
  });
  await ta('서명이 틀리면 400 · 등급 기록 없음', async () => {
    const ev = completed({ client_reference_id: 'user-abc', metadata: { plan: 'pro' } });
    const r = await hook(ev, sign(JSON.stringify(ev), 'some-other-secret'));
    assert.equal(r.status, 400);
    assert.equal(upserts.length, 0);
  });
  await ta('끝에서 끝: 결제 라우트가 만든 세션 값 그대로 → 웹훅 → 그 계정에 등급', async () => {
    authUser = { id: 'user-e2e', email: 'e@example.com' };
    await post({ plan: 'elite', billing: 'monthly', locale: 'ko' });
    const p = created[0];
    await hook(completed({ client_reference_id: p.client_reference_id, metadata: p.metadata }));
    assert.deepEqual([upserts[0].row.user_id, upserts[0].row.tier], ['user-e2e', 'elite']);
  });

  console.log('━━━ 로그인 콜백(next) ━━━');
  await ta('쿼리 next 가 결제 이어가기면 그대로 · 세션 쿠키 전달 · shq_next 는 지운다', async () => {
    const r = await callback(`?code=ok&next=${encodeURIComponent(RESUME_KO_PRO_M)}`, { 'sb-test-auth-token': 'tok', shq_next: 'stale' });
    assert.equal(r.loc, `${SITE}${RESUME_KO_PRO_M}`);
    assert.equal(r.res.cookies.get('sb-test-auth-token')?.value, 'tok', '예전처럼 세션 쿠키를 넘긴다');
    assert.deepEqual([r.next?.value, r.next?.maxAge], ['', 0]);
  });
  await ta('열린 리다이렉트 차단 — @evil.com·//evil.com·https://evil.com → /ko', async () => {
    for (const bad of ['@evil.com', '//evil.com', 'https://evil.com', '/\\evil.com']) {
      const r = await callback(`?code=ok&next=${encodeURIComponent(bad)}`);
      assert.equal(r.loc, `${SITE}/ko`, bad);
    }
  });
  await ta('쿼리가 없으면 로그인 화면이 남긴 쿠키 → 결제 이어가기 · 이상한 쿠키는 무시', async () => {
    const ok = await callback('?code=ok', { shq_next: encodeURIComponent(RESUME_KO_PRO_M) });
    assert.equal(ok.loc, `${SITE}${RESUME_KO_PRO_M}`);
    assert.equal(ok.next?.maxAge, 0);
    const bad = await callback('?code=ok', { shq_next: encodeURIComponent('//evil.com') });
    assert.equal(bad.loc, `${SITE}/ko`);
    const none = await callback('?code=ok');
    assert.equal(none.loc, `${SITE}/ko`, '둘 다 없으면 예전처럼 /ko');
  });
  await ta('코드 교환 실패·코드 없음 → 로그인 오류 화면(예전 그대로) + 쿠키 정리 · localhost 는 자기 origin', async () => {
    const bad = await callback('?code=bad&next=%2Fko%2Fpricing', { shq_next: encodeURIComponent(RESUME_KO_PRO_M) });
    assert.equal(bad.loc, `${SITE}/ko/login?error=auth_error`);
    assert.equal(bad.next?.maxAge, 0);
    assert.equal((await callback('')).loc, `${SITE}/ko/login?error=auth_error`);
    assert.equal((await callback('?code=ok&next=%2Fko%2Fpricing', {}, 'http://localhost:3000')).loc, 'http://localhost:3000/ko/pricing');
  });

  console.log('━━━ 로그인 화면(소스 고정) ━━━');
  await ta('Supabase redirectTo·emailRedirectTo 는 예전 그대로 · 누르기 직전에 돌아갈 곳을 쿠키로', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src/app/[locale]/login/page.tsx'), 'utf8');
    assert.equal(src.split('redirectTo: `${window.location.origin}/auth/callback`,').length - 1, 1);
    assert.equal(src.split('emailRedirectTo: `${window.location.origin}/auth/callback`,').length - 1, 1);
    assert.ok(src.indexOf('rememberNext();') < src.indexOf('signInWithOAuth('), '구글 로그인 전에 저장');
    assert.ok(src.lastIndexOf('rememberNext();') < src.indexOf('supabase.auth.signUp('), '이메일 가입 전에 저장');
    assert.match(src, /const next = nextFromUrl\(\);\s*\n\s*if \(next\.startsWith\('\/api\/'\)\) \{ window\.location\.assign\(next\); return; \}\s*\n\s*router\.push\(next \|\| '\/'\);/);
  });

  console.log = log;
  console.log(`\n✅ webCheckoutAccount: ${n}건 통과`);
})().catch((e) => { process.stderr.write(String(e?.stack || e) + '\n'); process.exit(1); });
