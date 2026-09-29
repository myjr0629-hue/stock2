/**
 * 웹 «지금의 PRO» 정렬 시험 — src/lib/marketing/proOffer.ts · pricing 화면 · PC 하단 띠 · 홈 배지
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/proOffer.test.ts
 *
 * 지키는 것(2026-09-30):
 *  1) 가격 = 스토어 실측가(App Store·Play 동일: $9.99 · ₩11,900 · ¥1,280)
 *  2) 옛 웹 요금제 흔적 없음 — FOUNDING·ELITE·$49·$69·$79·$149·«잠금/lock/unlock»(지표 잠금 문구)
 *  3) 화면 코드(요금 페이지·하단 띠·홈)에 Stripe 결제 호출이 없다 — 결제는 앱에서만
 *  4) 버튼은 스마트링크 /app?from=<태그>&l=<언어>, 태그는 [a-z0-9_] (클릭 카운터 규칙)
 *  5) 3개 언어 모두 빈 문구 없음, 띠 한 줄은 짧게(트리거만)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PRO_COPY, PRO_MONTHLY_PRICE, FREE_PRICE, proAppHref, offerLocale } from '../src/lib/marketing/proOffer';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

t('가격 = 스토어 실측가', () => {
  assert.deepEqual(PRO_MONTHLY_PRICE, { en: '$9.99', ko: '₩11,900', ja: '¥1,280' });
  assert.deepEqual(FREE_PRICE, { en: '$0', ko: '₩0', ja: '¥0' });
});

t('언어 판정 — 모르는 값은 en', () => {
  assert.equal(offerLocale('ko'), 'ko'); assert.equal(offerLocale('ja'), 'ja');
  assert.equal(offerLocale('de'), 'en'); assert.equal(offerLocale(undefined), 'en');
});

t('스마트링크 형식·태그 규칙', () => {
  for (const loc of ['ko', 'en', 'ja'] as const) {
    const h = proAppHref('pricing', loc);
    assert.equal(h, `/app?from=pricing&l=${loc}`);
    assert.match(new URLSearchParams(h.split('?')[1]).get('from')!, /^[a-z0-9_]{1,24}$/);
  }
  assert.match('pc_bar', /^[a-z0-9_]{1,24}$/);
});

t('3개 언어 모두 채워져 있고 띠 한 줄은 짧다', () => {
  const keys = Object.keys(PRO_COPY.en) as (keyof typeof PRO_COPY.en)[];
  for (const loc of ['ko', 'en', 'ja'] as const) {
    for (const k of keys) assert.ok(PRO_COPY[loc][k] && PRO_COPY[loc][k].trim().length > 0, `${loc}.${k} 비어 있음`);
    assert.ok(PRO_COPY[loc].line.length <= 32, `${loc} 띠 문구가 길다: ${PRO_COPY[loc].line}`);
    assert.ok(PRO_COPY[loc].title.length <= 32, `${loc} 제목이 길다`);
  }
});

const BANNED = /FOUNDING|파운딩|ファウンディング|ELITE|\$49|\$69|\$79|\$149|\$450|잠금|잠긴|ロック|\block(ed)?\b|unlock/i;
t('옛 웹 요금제·지표 잠금 문구가 없다(문구 모듈)', () => {
  const all = JSON.stringify(PRO_COPY);
  assert.equal(BANNED.test(all), false, all.match(BANNED)?.[0]);
});

t('화면 코드에 옛 문구·Stripe 결제 호출이 없다', () => {
  for (const f of ['src/app/[locale]/pricing/page.tsx', 'src/components/landing/StickyFoundingBar.tsx']) {
    const src = read(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '') // 주석 제외
      .replace(/tier\s*===\s*["']elite["']/g, '') // 기존 웹 구독자 판정 코드(화면 문구 아님)
      .replace(/StickyFoundingBar/g, ''); // 컴포넌트 이름(레이아웃·CSS 가 쓰는 이름이라 유지)
    assert.equal(/\/api\/stripe\//.test(src), false, `${f}: Stripe 결제 호출이 남아 있다`);
    assert.equal(BANNED.test(src), false, `${f}: ${src.match(BANNED)?.[0]}`);
  }
  const meta = read('src/app/[locale]/pricing/layout.tsx');
  assert.equal(BANNED.test(meta.replace(/\/\/.*$/gm, '')), false, 'pricing 메타데이터');
  for (const p of ['₩11,900', '$9.99', '¥1,280']) assert.ok(meta.includes(p), `메타데이터에 ${p} 없음`);
});

t('홈 배지는 옛 «$450+/월» 줄을 그리지 않는다', () => {
  const home = read('src/app/[locale]/(home)/page.tsx');
  assert.equal(home.includes("t('home.priceStrikethrough')"), false);
  assert.ok(home.includes('PRO_COPY[offerLocale(locale)].line'));
});

t('Stripe 서버 코드는 지우지 않았다(최소 삭제)', () => {
  for (const f of ['src/app/api/stripe/checkout/route.ts', 'src/app/api/stripe/webhook/route.ts', 'src/app/api/stripe/portal/route.ts', 'src/app/api/stripe/cancel/route.ts', 'src/lib/stripe.ts']) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', f)), `${f} 가 없다`);
  }
});

console.log(`\n✅ proOffer: ${n}건 통과`);
