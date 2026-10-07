/**
 * 앱 안 웹 등급 게이트(FeatureGate/ProGate/EliteGate) «항상 통과» 고정 (2026-10-07, 앱 강화 0단계 T6)
 *
 * 앱 Guardian 의 «Gamma Shield AI» 등은 웹용 ProGate(비로그인 guest 등급)로 감싸여 있다. 지금 열려 있는 이유는 FeatureGate 의
 * 게스트 미리보기(쿠키 shq_gv ≤ 5 → 열림)인데, 이 쿠키는 웹 전용 GuestWall 만 올리고 앱 레이아웃엔 GuestWall 이 없어 «항상 0 = 항상 열림»이다 —
 * 의도가 아니라 우연이다. 쿠키가 올라가면 앱 화면이 흐려지고 웹 요금제(/pricing) 링크가 뜬다(애플 3.1.1 위험).
 *
 * 실행: node_modules/.bin/ts-node --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/appProGatePass.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isAppViewPath } from '../src/lib/app/appPath';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log(`  ✓ ${name}`); };
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

t('앱 경로 판정: next-intl 경로(/app-view/…)와 로케일 접두사 경로(/ko/app-view/…) 모두 앱', () => {
  for (const p of ['/app-view/dash', '/app-view/guardian', '/ko/app-view/flow', '/en/app-view/cmd', '/ja/app-view', '/app-view', '/app-view/', '/ko/app-view/dash?brief=1', '/en/app-view/cmd#ai']) {
    assert.equal(isAppViewPath(p), true, p);
  }
});

t('웹 경로는 앱이 아니다 — 웹 게이트 동작은 그대로', () => {
  for (const p of ['/', '/flow', '/ko/flow', '/intel-guardian', '/ko/intel-guardian', '/pricing', '/en/dashboard', '/intel', '/watchlist', '/portfolio', '/app', '/ko/app', '/app-viewer', '/appview', '/app-view-x', '/x/app-views/y', '/flow/app-views']) {
    assert.equal(isAppViewPath(p), false, p);
  }
  assert.equal(isAppViewPath(null), false);
  assert.equal(isAppViewPath(undefined), false);
  assert.equal(isAppViewPath(''), false);
});

t('FeatureGate: 앱 경로면 children 을 그대로 통과(로딩 흐림·잠금 카드·/pricing 링크 없이), 모든 훅 호출 «뒤» · 로딩 분기 «앞»', () => {
  const src = read('src/components/gate/FeatureGate.tsx');
  assert.ok(src.includes("import { isAppViewPath } from '@/lib/app/appPath';"));
  assert.ok(src.includes("import { Link, usePathname } from '@/i18n/routing';"));
  assert.ok(src.includes('const pathname = usePathname();'));
  assert.ok(src.includes('if (isAppViewPath(pathname)) return <>{children}</>;'));
  const iGate = src.indexOf('if (isAppViewPath(pathname)) return');
  const iLoading = src.indexOf('if (loading) {');
  const iHook = Math.max(src.indexOf('const handleClick = useCallback('), src.indexOf('useState(false);', src.indexOf('const [showTooltip')));
  assert.ok(iGate > iHook && iHook > 0, '훅(useState·useCallback)이 모두 앞에 있어야 한다(Rules of Hooks)');
  assert.ok(iGate < iLoading, '로딩 분기보다 앞 — 앱에선 로딩 중에도 흐림 오버레이를 그리지 않는다');
  // 통과 분기보다 앞에 훅 호출이 더 남아 있지 않다(조건부 훅 금지)
  assert.equal(/use(State|Callback|Memo|Effect|Ref|Tier|Translations)\(/.test(src.slice(iGate, src.indexOf('export function ProGate'))), false, '통과 분기 뒤에 훅이 있다');
});

t('ProGate·EliteGate 는 FeatureGate 를 감싼 래퍼라 같은 고정을 받는다', () => {
  const src = read('src/components/gate/FeatureGate.tsx');
  assert.ok(/export function ProGate[\s\S]*<FeatureGate requiredTier="pro"/.test(src));
  assert.ok(/export function EliteGate[\s\S]*<FeatureGate requiredTier="elite"/.test(src));
});

t('Guardian «플로우» 탭의 자체 잠금(Flow Topography Map · ELITE → /pricing)도 앱 경로에서는 항상 통과 — FeatureGate 가 아닌 두 번째 웹 게이트', () => {
  const src = read('src/components/guardian/mobile/MobileGuardianFlow.tsx');
  assert.ok(src.includes("import { Link, usePathname } from '@/i18n/routing';"));
  assert.ok(src.includes("import { isAppViewPath } from '@/lib/app/appPath';"));
  assert.ok(src.includes('const pathname = usePathname();'));
  assert.ok(src.includes('const inApp = isAppViewPath(pathname);'));
  assert.ok(src.includes("const isMapUnlocked = hasAccess('elite') || isMapGuestPreview || inApp;"));
  // 훅은 조건부 반환보다 앞(컴포넌트 최상단 useTier 옆)
  assert.ok(src.indexOf('const pathname = usePathname();') < src.indexOf('const isMapUnlocked'));
  // 앱 안에서 웹 가입 링크를 그리는 곳은 이 한 곳뿐이었다 — 웹용 잠금 카드 문구는 그대로(웹 경로 불변)
  assert.ok(src.includes('<Link href="/pricing"'));
});

t('앱 레이아웃엔 웹 게스트 가입 벽(GuestWall)이 없다 — shq_gv 쿠키 증가 경로가 없다(이 고정이 필요한 이유)', () => {
  const layout = read('src/app/[locale]/app-view/layout.tsx');
  assert.equal(/GuestWall/.test(layout), false);
  assert.equal(/shq_gv/.test(layout), false);
});

console.log(`\n✅ appProGatePass: ${n}건 통과`);
