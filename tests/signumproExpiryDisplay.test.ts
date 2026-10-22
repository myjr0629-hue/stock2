import { couponSafetyNormalized } from './_couponSafetyBaseline';
/** 날짜 표시 회귀: 실제 GET 3곳·3언어·시각 경계와 수정 전 HTML 바이트 비교. 외부 접근 없음. */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import ts from 'typescript';
import sharp from 'sharp';

let checks = 0;
function check(ok: boolean, label: string) { assert.ok(ok, label); checks++; }
globalThis.fetch = async () => { throw new Error('시험 중 외부 접근 금지'); };
const nsPath = require.resolve('next/server');
const ns = require(nsPath);
require.cache[nsPath] = { id: nsPath, filename: nsPath, loaded: true,
  exports: { ...ns, after: () => {} } } as Module;
const rcPath = require.resolve('../src/services/redisClient');
require.cache[rcPath] = { id: rcPath, filename: rcPath, loaded: true,
  exports: {
    getFromCache: async () => { throw new Error('시험 중 저장소 접근 금지'); },
    setInCache: async () => { throw new Error('시험 중 저장소 쓰기 금지'); },
  } } as Module;

const { GET } = require('../src/app/app/route');
const { couponHtml, couponSubline } = require('../src/lib/marketing/couponHtml');
const { desktopRedeemHtml } = require('../src/lib/marketing/desktopHandoff');
const { previewHtml, isCreatorPromoCode } = require('../src/lib/marketing/linkPreview');
const { GET: promoImage } = require('../src/app/api/og/promo/route');

// 관문 검토 대상 커밋을 메모리에서만 읽는다. 현재 구현을 자기 자신과 비교하지 않는다.
const baselinePaths = new Set([
  'src/lib/marketing/linkPreview.ts', 'src/lib/marketing/couponHtml.ts',
  'src/lib/marketing/desktopHandoff.ts',
]);
const baselineCache = new Map<string, Module>();
function baseline(path: string): any {
  if (baselineCache.has(path)) return baselineCache.get(path)!.exports;
  const source = execFileSync('git', ['show', `95fe06579:${path}`], { encoding: 'utf8' });
  const m = new Module(resolve(path), module);
  m.filename = resolve(path);
  m.paths = module.paths;
  baselineCache.set(path, m);
  const originalRequire = m.require.bind(m);
  m.require = ((id: string) => {
    const dependency = relative(process.cwd(), (Module as any)._resolveFilename(id, m));
    return baselinePaths.has(dependency) ? baseline(dependency) : originalRequire(id);
  }) as typeof m.require;
  (m as any)._compile(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true,
  } }).outputText, m.filename);
  return m.exports;
}

const langs = ['ko', 'en', 'ja'] as const;
const dates = {
  ko: { old: '10/30까지', next: '12/30까지', cardOld: '10/30', cardNext: '12/30' },
  en: { old: 'Until Oct\u00a030', next: 'Until Dec\u00a030', cardOld: 'Oct 30', cardNext: 'Dec 30' },
  ja: { old: '10/30まで', next: '12/30まで', cardOld: '10/30', cardNext: '12/30' },
};
const uas = {
  coupon: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  pc: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36',
  card: 'facebookexternalhit/1.1',
};

async function main() {
  console.log('날짜 표시 시험: 수정 전 기준 HTML 로드');
  const oldCoupon = baseline('src/lib/marketing/couponHtml.ts');
  const oldDesktop = baseline('src/lib/marketing/desktopHandoff.ts');
  const oldPreview = baseline('src/lib/marketing/linkPreview.ts');
  // 기존 채널·형식 시험의 값을 메모리에서 재사용한다. 값은 로그·새 파일에 복제하지 않는다.
  const source = readFileSync(resolve('src/lib/marketing/linkPreview.ts'), 'utf8');
  const list = source.match(/const LIVE_PROMO_CODES = new Set\(\[([^\]]+)\]\)/)![1];
  const channels = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const fixtures = readFileSync(resolve('tests/redeemLinkPreview.test.ts'), 'utf8');
  const creators = [...fixtures.matchAll(/'([A-Za-z0-9]+)'/g)].map((m) => m[1])
    .filter((code) => isCreatorPromoCode(code) && code !== 'SIGNUMPRO');
  const legacyCodes = [...new Set([...channels, ...creators])];
  for (const code of [...legacyCodes, 'SIGNUMPRO']) for (const lang of langs) {
    const d = dates[lang];
    const extended = code === 'SIGNUMPRO';
    const adjustLimit = (html: string) => html.replace(/(선착순 |[Ff]irst |先着)500/g, '$15,000');
    const adjust = (html: string) => extended ? adjustLimit(html.split(d.old).join(d.next)) : html;
    for (const platform of ['ios', 'android'] as const) {
      for (const fromTag of [null, 'gift', 'cr_test', 'threads']) {
        const opts = { platform, lang, fromTag, code, appleRedeemUrl: '#', playInstallUrl: '#' };
        const expected = oldCoupon.couponHtml(opts);
        let next = platform === 'ios' ? adjust(expected) : expected;
        if (extended && platform === 'ios') {
          next = next.replace(`https://www.signumhq.com/promo/redeem-card-${lang}.png`, `https://www.signumhq.com/api/og/promo?l=${lang}&code=SIGNUMPRO`);
          if (lang === 'en') next = next.replace(/(<p class="t-sub">[^<]*First )5,000/, '$1<span style="letter-spacing:-1.5px;white-space:nowrap">5,000</span>');
        }
        check(couponSafetyNormalized(couponHtml(opts)) === couponSafetyNormalized(next), '쿠폰 HTML: 날짜·한도 숫자·해당 이미지 주소 외 바이트 동일');
      }
    }
    const opts = { lang, fromTag: null, code, coupon: true, redeemUrl: '#' };
    check(await desktopRedeemHtml(opts) === adjust(await oldDesktop.desktopRedeemHtml(opts)), 'PC HTML: 해당 날짜 외 바이트 동일');
    const canonical = `https://www.signumhq.com/app?code=${code}`;
    const expected = oldPreview.previewHtml('signum', lang, canonical, '#', true);
    const expectedCard = extended ? adjustLimit(expected.split(d.cardOld).join(d.cardNext))
      .split(`https://www.signumhq.com/promo/redeem-card-${lang}.png`)
      .join(`https://www.signumhq.com/api/og/promo?l=${lang}&code=SIGNUMPRO`) : expected;
    check(previewHtml('signum', lang, canonical, '#', true) === expectedCard, '카드 HTML: 해당 날짜·이미지 주소 외 바이트 동일');
    if (!extended) check(couponSubline('ios', lang, null, code).includes(d.old), '기존 코드의 10/30 표시 유지');
  }
  console.log('날짜 표시 시험: 기존 HTML 비교 완료, 카드 이미지 검증');
  for (const lang of langs) {
    const original = readFileSync(resolve(`public/promo/redeem-card-${lang}.png`));
    const image = await promoImage(new ns.NextRequest(`https://www.signumhq.com/api/og/promo?l=${lang}&code=SIGNUMPRO`));
    const png = Buffer.from(await image.arrayBuffer());
    const meta = await sharp(png).metadata();
    check(image.status === 200 && meta.width === 1200 && meta.height === 675, '카드 이미지 GET: 3언어 PNG 크기 유지');
    const before = await sharp(original).ensureAlpha().raw().toBuffer();
    const after = await sharp(png).ensureAlpha().raw().toBuffer();
    // 날짜·한도 숫자를 포함한 배지 안 작은 영역만 바뀌었는지 픽셀 단위로 검증한다.
    let changed = 0;
    let outside = 0;
    for (let y = 0; y < 675; y++) for (let x = 0; x < 1200; x++) {
      const i = (y * 1200 + x) * 4;
      if (!before.subarray(i, i + 4).equals(after.subarray(i, i + 4))) {
        changed++;
        // 숫자부터 배지 오른쪽 끝까지(숫자가 길어진 만큼 뒤 조각·배지 끝이 밀린다) — 배지 행 안, 왼쪽 라벨·카드 나머지는 그대로
        const badgeTail = x >= 218 && x < 520 && y >= 88 && y < 135;
        if (!badgeTail) outside++;
      }
    }
    check(changed > 0 && outside === 0, '카드 이미지: 날짜·한도 숫자 영역 이외 원본 픽셀 동일');
    const legacy = await promoImage(new ns.NextRequest(`https://www.signumhq.com/api/og/promo?l=${lang}`));
    check(Buffer.from(await legacy.arrayBuffer()).equals(original), '기본 만료 카드 이미지: 원본 PNG 바이트 동일');
  }
  // 표시 함수·카드 URL 입력에서 소문자·공백 정규화도 유지한다.
  for (const lang of langs) for (const code of ['signumpro', '  signumpro  ']) {
    check(couponSubline('ios', lang, null, code).includes(dates[lang].next), '표시용 코드 정규화');
    check(previewHtml('signum', lang, `https://www.signumhq.com/app?code=${encodeURIComponent(code)}`, '#', true)
      .includes(dates[lang].cardNext), '카드 URL 코드 정규화');
  }
  console.log('날짜 표시 시험: 실제 GET의 시각·언어 분기 검증');

  const savedNow = Date.now;
  const savedAndroid = process.env.COUPON_ANDROID;
  const savedGift = process.env.GIFT_SHARE_ENABLED;
  process.env.COUPON_ANDROID = '1';
  delete process.env.GIFT_SHARE_ENABLED;
  try {
    const expiry = Date.parse('2027-01-01T08:00:00Z');
    for (const now of [
      Date.parse('2026-10-21T00:00:00Z'), Date.parse('2026-11-15T00:00:00Z'),
      Date.parse('2026-12-30T08:00:00Z'), expiry - 1, expiry, expiry + 1,
    ]) {
      Date.now = () => now;
      for (const lang of langs) for (const [surface, ua] of Object.entries(uas)) {
        const r = await GET(new ns.NextRequest(`https://www.signumhq.com/app?code=SIGNUMPRO&l=${lang}`, {
          headers: { 'user-agent': ua, 'accept-language': lang },
        }));
        const html = await r.text();
        const d = dates[lang];
        const shown = surface === 'card' ? d.cardNext : d.next;
        if (now < expiry) {
          check(r.status === 200 && html.includes(shown), '유효 SIGNUMPRO 실제 GET: 3곳·3언어의 12/30 표시');
          check(!html.includes(surface === 'card' ? d.cardOld : d.old), '유효 SIGNUMPRO의 고정 10/30 표시 제거');
        } else {
          check(!html.includes(shown) && !html.includes(d.old) && !html.includes(d.cardOld), '만료 실제 GET: 프로모션 날짜 없음');
          check(r.status === (surface === 'coupon' ? 302 : 200), '만료 뒤 기존 응답 분기 유지');
        }
      }
      // Android에는 연장된 애플 날짜를 적용하지 않는다. 기존 Play 종료 뒤에는 설치로 간다.
      if (now >= Date.parse('2026-10-31T00:00:00Z')) {
        const r = await GET(new ns.NextRequest('https://www.signumhq.com/app?code=SIGNUMPRO', {
          headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/129.0.0.0 Mobile Safari/537.36' },
        }));
        check(r.status === 302 && (r.headers.get('location') || '').startsWith('https://play.google.com/'), '기존 Play 만료 유지');
      }
    }
  } finally {
    Date.now = savedNow;
    if (savedAndroid === undefined) delete process.env.COUPON_ANDROID; else process.env.COUPON_ANDROID = savedAndroid;
    if (savedGift === undefined) delete process.env.GIFT_SHARE_ENABLED; else process.env.GIFT_SHARE_ENABLED = savedGift;
  }
  console.log(`SIGNUMPRO 날짜 표시 회귀 시험: ${checks}건 통과`);
}
main().catch((e) => { console.error(`SIGNUMPRO 날짜 표시 회귀 시험 실패: ${e.message}`); process.exitCode = 1; });
