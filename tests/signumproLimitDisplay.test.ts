/** 코드별 한도 회귀: 기준 커밋과 실제 HTML·PNG 비교. 외부 통신·저장소 접근 없음. */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import ts from 'typescript';
import sharp from 'sharp';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let checks = 0;
function check(ok: boolean, label: string) { assert.ok(ok, label); checks++; }
// 2026-10-23 결제 안전 변경(안전 경고 한 줄 · ② 단계 문구 · 옛 «구독 화면이 안 나오면» 줄 삭제)은 이 시험의 대상 밖 — 양쪽에서 같은 자리표시로 바꿔 비교한다.
function couponSafetyNormalized(html: string): string {
  return html.replace(/<p class="step2" id="coupon-warning">[^\n]*?<\/p>\n/g, '')
    .replace(/<p class="step2" id="step2">[^\n]*?<\/p>(\n<p class="help">[^\n]*🎟[^\n]*<\/p>)?/g, '<p class="step2" id="step2">§</p>');
}
globalThis.fetch = async () => { throw new Error('시험 중 외부 통신 금지'); };
const nsPath = require.resolve('next/server');
const ns = require(nsPath);
require.cache[nsPath] = { id: nsPath, filename: nsPath, loaded: true,
  exports: { ...ns, after: () => {} } } as Module;
const redisPath = require.resolve('../src/services/redisClient');
require.cache[redisPath] = { id: redisPath, filename: redisPath, loaded: true, exports: {
  getFromCache: async () => { throw new Error('시험 중 저장소 접근 금지'); },
  setInCache: async () => { throw new Error('시험 중 저장소 쓰기 금지'); },
} } as Module;

const paths = new Set([
  'src/lib/marketing/coupon.ts', 'src/lib/marketing/couponHtml.ts',
  'src/lib/marketing/linkPreview.ts', 'src/lib/marketing/desktopHandoff.ts',
  'src/app/app/route.ts', 'src/app/api/og/promo/route.ts',
  'src/components/landing/PromoCodeChip.tsx',
]);
const cache = new Map<string, Module>();
let chipLang = 'ko';
let chipAndroid = false;
let chipPc = false;
let stateIndex = 0;
// 클라이언트 칩의 마운트 뒤 기기 상태도 DOM 마크업으로 비교한다.
const chipReact = { ...React, useEffect: () => {}, useState: () => [[true, chipPc, chipAndroid][stateIndex++], () => {}] };
function load(path: string, before: boolean): any {
  const key = `${before}:${path}`;
  if (cache.has(key)) return cache.get(key)!.exports;
  const source = before ? execFileSync('git', ['show', `8415c9a2a:${path}`], { encoding: 'utf8' }) : readFileSync(path, 'utf8');
  const m = new Module(resolve(path), module);
  m.filename = resolve(path);
  m.paths = module.paths;
  cache.set(key, m);
  const originalRequire = m.require.bind(m);
  m.require = ((id: string) => {
    if (path.endsWith('PromoCodeChip.tsx')) {
      if (id === 'react') return chipReact;
      if (id === 'next-intl') return { useLocale: () => chipLang };
    }
    const dependency = relative(process.cwd(), (Module as any)._resolveFilename(id, m));
    return paths.has(dependency) ? load(dependency, before) : originalRequire(id);
  }) as typeof m.require;
  (m as any)._compile(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, m.filename);
  return m.exports;
}

const langs = ['ko', 'en', 'ja'] as const;
const uas = {
  coupon: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  pc: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36',
  card: 'facebookexternalhit/1.1',
  android: 'Mozilla/5.0 (Linux; Android 14) Chrome/129.0.0.0 Mobile Safari/537.36',
};
const limits = { ko: '선착순 5,000명', en: 'first 5,000', ja: '先着5,000名' };
const adjust = (html: string, extended: boolean) => extended ? html.replace(/(선착순 |[Ff]irst |先着)500/g, '$15,000') : html;
function adjustCoupon(html: string, extended: boolean, lang: string): string {
  if (!extended) return html;
  let next = adjust(html, true).replace(`https://www.signumhq.com/promo/redeem-card-${lang}.png`, `https://www.signumhq.com/api/og/promo?l=${lang}&code=SIGNUMPRO`);
  if (lang === 'en') next = next.replace(/(<p class="t-sub">[^<]*First )5,000/, '$1<span style="letter-spacing:-1.5px;white-space:nowrap">5,000</span>');
  return next;
}

async function main() {
  const { promoCodeLimit, APPLE_CODE_LIMIT } = require('../src/lib/marketing/promoLimit');
  const oldCoupon = load('src/lib/marketing/couponHtml.ts', true);
  const coupon = load('src/lib/marketing/couponHtml.ts', false);
  const oldDesktop = load('src/lib/marketing/desktopHandoff.ts', true);
  const desktop = load('src/lib/marketing/desktopHandoff.ts', false);
  const oldPreview = load('src/lib/marketing/linkPreview.ts', true);
  const preview = load('src/lib/marketing/linkPreview.ts', false);
  const oldRoute = load('src/app/app/route.ts', true);
  const route = load('src/app/app/route.ts', false);
  const oldOg = load('src/app/api/og/promo/route.ts', true);
  const og = load('src/app/api/og/promo/route.ts', false);
  const oldChip = load('src/components/landing/PromoCodeChip.tsx', true);
  const chip = load('src/components/landing/PromoCodeChip.tsx', false);
  // 기존 코드값은 메모리로만 재사용하며 로그·새 파일에 복제하지 않는다.
  const source = readFileSync('src/lib/marketing/linkPreview.ts', 'utf8');
  const list = source.match(/const LIVE_PROMO_CODES = new Set\(\[([^\]]+)\]\)/)![1];
  const channels = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const fixtures = readFileSync('tests/redeemLinkPreview.test.ts', 'utf8');
  const creators = [...fixtures.matchAll(/'([A-Za-z0-9]+)'/g)].map((m) => m[1])
    .filter((code) => preview.isCreatorPromoCode(code));
  const codes = [...new Set([...channels, ...creators, '', 'SIGNUMPRO'])];
  const savedNow = Date.now;
  const savedAndroid = process.env.COUPON_ANDROID;
  const savedGift = process.env.GIFT_SHARE_ENABLED;
  Date.now = () => Date.parse('2026-10-21T00:00:00Z');
  process.env.COUPON_ANDROID = '1';
  delete process.env.GIFT_SHARE_ENABLED;
  const artifacts = process.env.SIGNUMPRO_RENDER_DIR;
  if (artifacts) mkdirSync(artifacts, { recursive: true });
  try {
    check(APPLE_CODE_LIMIT === 500 && promoCodeLimit(null) === 500, '기본 한도 유지');
    for (const code of codes) for (const lang of langs) {
      const extended = code === 'SIGNUMPRO';
      check(promoCodeLimit(code) === (extended ? 5000 : 500), '코드별 한도');
      for (const platform of ['ios', 'android'] as const) for (const fromTag of [null, 'gift', 'cr_test', 'threads']) {
        const opts = { platform, lang, fromTag, code, appleRedeemUrl: '#', playInstallUrl: '#' };
        check(couponSafetyNormalized(coupon.couponHtml(opts)) === couponSafetyNormalized(adjustCoupon(oldCoupon.couponHtml(opts), extended && platform === 'ios', lang)), '쿠폰: 한도 숫자·숫자 자간·해당 이미지 주소(·결제 안전 안내) 이외 HTML 바이트 동일');
      }
      for (const gift of [undefined, 'SIGNUMPRO']) for (const androidCoupon of [false, true]) {
        const opts = { lang, fromTag: null, code, coupon: true, redeemUrl: '#', gift, androidCoupon };
        check(await desktop.desktopRedeemHtml(opts) === adjust(await oldDesktop.desktopRedeemHtml(opts), extended && !gift), 'PC 안내·선물: 한도 숫자 이외 HTML 바이트 동일');
      }
      const canonical = `https://www.signumhq.com/app?code=${code}`;
      for (const invite of [false, { android: false }, { android: true }]) {
        check(preview.previewHtml('signum', lang, canonical, '#', true, invite) === adjust(oldPreview.previewHtml('signum', lang, canonical, '#', true, invite), extended && !invite), '링크 카드·초대: 한도 숫자 이외 HTML 바이트 동일');
      }
      check(JSON.stringify(preview.PROMO_COPY[lang]) === JSON.stringify(oldPreview.PROMO_COPY[lang]), 'PROMO_COPY 기본 제목·설명 바이트 동일');
      for (const android of [false, true]) for (const pc of [false, true]) {
        chipLang = lang; chipAndroid = android; chipPc = pc;
        const props = { href: `/app?code=${encodeURIComponent(code)}` };
        stateIndex = 0;
        const before = renderToStaticMarkup(React.createElement(oldChip.PromoCodeChip, props));
        stateIndex = 0;
        const after = renderToStaticMarkup(React.createElement(chip.PromoCodeChip, props));
        check(after === adjust(before, extended && !android), '칩: 기기별 한도 숫자 이외 마크업 바이트 동일');
      }
      for (const [surface, ua] of Object.entries(uas)) {
        const req = () => new ns.NextRequest(`${canonical}&l=${lang}`, { headers: { 'user-agent': ua, 'accept-language': lang } });
        const before = await oldRoute.GET(req());
        const after = await route.GET(req());
        const beforeHtml = await before.text();
        const afterHtml = await after.text();
        check(after.status === before.status, '실제 GET 응답 상태 유지');
        const expected = surface === 'coupon' ? adjustCoupon(beforeHtml, extended, lang) : adjust(beforeHtml, extended && surface !== 'android');
        check(couponSafetyNormalized(afterHtml) === couponSafetyNormalized(expected), '실제 GET: 3언어·4기기 허용된 숫자 변경(·결제 안전 안내) 이외 바이트 동일');
        check(JSON.stringify([...after.headers]) === JSON.stringify([...before.headers]), '실제 GET 응답 헤더 유지');
        if (extended && surface !== 'android') {
          check(afterHtml.toLowerCase().includes(limits[lang]), 'SIGNUMPRO 실제 GET 5,000 표시');
          if (artifacts) writeFileSync(resolve(artifacts, `${surface}-${lang}.html`), afterHtml);
        }
      }
      if (!extended) {
        const req = () => new ns.NextRequest(`https://www.signumhq.com/api/og/promo?l=${lang}&code=${encodeURIComponent(code)}`);
        const before = Buffer.from(await (await oldOg.GET(req())).arrayBuffer());
        const after = Buffer.from(await (await og.GET(req())).arrayBuffer());
        check(after.equals(before), '기존 코드 OG PNG 전체 바이트 동일');
      }
    }
    for (const lang of langs) {
      const req = () => new ns.NextRequest(`https://www.signumhq.com/api/og/promo?l=${lang}&code=SIGNUMPRO`);
      const before = await sharp(Buffer.from(await (await oldOg.GET(req())).arrayBuffer())).ensureAlpha().raw().toBuffer();
      const png = Buffer.from(await (await og.GET(req())).arrayBuffer());
      const { data: after, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      check(info.width === 1200 && info.height === 675, 'OG PNG 크기 유지');
      // 배지 행(원본 실측 88~)에서 숫자 시작부터 늘어난 배지 끝까지만 바뀐다
      const box = { ko: [222, 88, 298, 41], en: [218, 88, 302, 44], ja: [222, 88, 298, 47] }[lang];
      let changed = 0; let outside = 0;
      for (let y = 0; y < 675; y++) for (let x = 0; x < 1200; x++) {
        const i = (y * 1200 + x) * 4;
        if (!before.subarray(i, i + 4).equals(after.subarray(i, i + 4))) {
          changed++;
          if (x < box[0] || x >= box[0] + box[2] || y < box[1] || y >= box[1] + box[3]) outside++;
        }
      }
      check(changed > 0 && outside === 0, 'SIGNUMPRO OG: 숫자 영역 이외 픽셀 동일·넘침 없음');
      // 숫자 사이·뒤 라벨 조각(명·까지·Until·名·まで 등)은 원본 픽셀을 그대로 옮긴 것이다(가로 이동만)
      const orig = await sharp(readFileSync(resolve(`public/promo/redeem-card-${lang}.png`))).ensureAlpha().raw().toBuffer();
      const seg = { ko: [[264, 302], [358, 412]], en: [[263, 338], [411, 427]], ja: [[272, 319], [396, 455]] }[lang];
      for (const [from, to] of seg) {
        let found = -1;
        for (let dx = 0; dx <= 80 && found < 0; dx++) {
          let same = true;
          for (let y = box[1]; y < box[1] + box[3] && same; y++) for (let x = from; x < to; x++) {
            const i = (y * 1200 + x) * 4, j = (y * 1200 + x + dx) * 4;
            if (!orig.subarray(i, i + 4).equals(after.subarray(j, j + 4))) { same = false; break; }
          }
          if (same) found = dx;
        }
        check(found > 0, `SIGNUMPRO OG: 라벨 조각 ${from}-${to} 원본 픽셀 그대로 이동(${found}px)`);
      }
      if (artifacts) writeFileSync(resolve(artifacts, `og-${lang}.png`), png);
      for (const code of ['signumpro', '  signumpro  ']) {
        check(promoCodeLimit(code) === 5000, '소문자·공백 한도 정규화');
        check(coupon.couponSubline('ios', lang, null, code).toLowerCase().includes(limits[lang]), '쿠폰 부제 정규화');
        check(preview.promoCopy(lang, code).title.includes(limits[lang]), '링크 제목 정규화');
      }
    }
    // 초대 OG는 한도 표시가 없으며 이번 작업에서 원본을 바꾸지 않는다.
    check(readFileSync('src/app/api/og/invite/route.tsx', 'utf8') === execFileSync('git', ['show', '8415c9a2a:src/app/api/og/invite/route.tsx'], { encoding: 'utf8' }), '초대 OG 소스 바이트 동일');
  } finally {
    Date.now = savedNow;
    if (savedAndroid === undefined) delete process.env.COUPON_ANDROID; else process.env.COUPON_ANDROID = savedAndroid;
    if (savedGift === undefined) delete process.env.GIFT_SHARE_ENABLED; else process.env.GIFT_SHARE_ENABLED = savedGift;
  }
  console.log(`SIGNUMPRO 한도 표시 회귀 시험: ${checks}건 통과`);
}
main().catch((e) => { console.error(`SIGNUMPRO 한도 표시 회귀 시험 실패: ${e.message}`); process.exitCode = 1; });
