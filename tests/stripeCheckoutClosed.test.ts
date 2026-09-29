/**
 * 웹 신규 결제 닫힘 시험 — src/app/api/stripe/checkout/route.ts
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/stripeCheckoutClosed.test.ts
 * 지키는 것: 기본(환경변수 없음)은 410 — Stripe·Supabase 를 부르기 «전에» 끝난다 · STRIPE_WEB_CHECKOUT=on 이면 예전 흐름으로 들어간다
 * (열린 경우는 잘못된 plan 으로 400 에서 멈추게 해 Stripe 를 부르지 않는다 — 외부 호출 0)
 */
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/stripe/checkout/route';

(async () => {
  const req = (body: unknown) => new NextRequest('https://www.signumhq.com/api/stripe/checkout', { method: 'POST', body: JSON.stringify(body) });
  delete process.env.STRIPE_WEB_CHECKOUT;
  const r1 = await POST(req({ plan: 'pro', billing: 'monthly', locale: 'ko' }));
  assert.equal(r1.status, 410);
  assert.equal((await r1.json()).error, 'web_checkout_closed');
  process.env.STRIPE_WEB_CHECKOUT = 'yes'; // on 이 아닌 값도 닫힘
  assert.equal((await POST(req({ plan: 'pro', billing: 'monthly', locale: 'ko' }))).status, 410);
  process.env.STRIPE_WEB_CHECKOUT = 'on';
  const r3 = await POST(req({ plan: 'nope', billing: 'monthly', locale: 'ko' }));
  assert.equal(r3.status, 400, '열리면 예전 검증(잘못된 plan → 400)으로 들어간다');
  delete process.env.STRIPE_WEB_CHECKOUT;
  console.log('✅ stripeCheckoutClosed: 3건 통과');
})().catch((e) => { console.error(e); process.exit(1); });
