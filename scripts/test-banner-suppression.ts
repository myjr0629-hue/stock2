// 팝업이 열린 동안 네이티브 배너를 내리는 훅(useBannerSuppression) + adManager 되살리기 고정 테스트.
// 대표 지적(2026-09-29): 인텔 «M7 장마감 리포트» 팝업을 열면 하단 배너가 팝업 아래쪽을 가린다.
//
// 실행(저장소 루트에서 — alias 경로가 작업 폴더 기준이다):
//   node_modules/.bin/esbuild scripts/test-banner-suppression.ts --bundle --platform=node --format=cjs \
//     --alias:react=./scripts/test-banner-suppression.shim.ts \
//     --alias:@capacitor/core=./scripts/test-banner-suppression.shim.ts \
//     --alias:@capacitor/app=./scripts/test-banner-suppression.shim.ts \
//     --alias:@capacitor-community/admob=./scripts/test-banner-suppression.shim.ts \
//     --outfile=/tmp/test-banner-suppression.cjs --log-level=warning && node /tmp/test-banner-suppression.cjs
//
// 인자 없이 돌리면 iOS·Android 를 «각각 새 프로세스»로 돌린다(adManager 는 싱글턴이라 init 이 한 번뿐이다).
// 가짜 플러그인은 @capacitor-community/admob 8.0.0 BannerExecutor 의 플랫폼별 동작을 그대로 옮겼다(shim 머리말).
import { spawnSync } from 'node:child_process';
import {
  mount, act, env, native, bannerVisible, finishLoad, autoRefresh, emitAppActive, adSlotHeight,
} from './test-banner-suppression.shim';
import { useBannerSuppression, _bannerSuppressionOpenCountForTest as openCount } from '../src/hooks/useBannerSuppression';
import { adManager } from '../src/services/adManager';

const platformArg = process.argv[2];
if (platformArg !== 'ios' && platformArg !== 'android') {
  // 부모: 플랫폼마다 자식 프로세스
  let failed = 0;
  for (const p of ['ios', 'android']) {
    const r = spawnSync(process.execPath, [__filename, p], { stdio: 'inherit' });
    if (r.status !== 0) failed += 1;
  }
  console.log(failed === 0 ? '\n전체 통과 (iOS + Android)' : `\n실패한 플랫폼 ${failed}개`);
  process.exit(failed === 0 ? 0 : 1);
}

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass += 1; console.log(`  ✅ ${name}`); } else { fail += 1; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}
/** 동적 import · 네이티브 이벤트(setTimeout 0) 가 다 끝날 때까지 돌린다 */
async function flush() { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); }
const state = () => `visible=${bannerVisible()} attached=${native.attached} hidden=${native.hidden} open=${openCount()} calls=[${native.calls.join(',')}]`;

/** 팝업 하나 = 이 훅 하나를 부르는 컴포넌트 */
const Overlay = (p: { open: boolean }) => { useBannerSuppression(p.open); };

async function main() {
  env.platform = platformArg as 'ios' | 'android';
  console.log(`\n── ${env.platform.toUpperCase()} ──`);

  // 0) 앱 시작: NativeAppProvider 순서 — setPro(false) → init() → 배너 요청 → 도착
  await adManager.setPro(false);
  await adManager.init();
  check('시작: 배너 요청 1건', native.requests === 1, state());
  finishLoad(); await flush();
  check('시작: 광고 도착 → 배너 보임', bannerVisible(), state());
  const slotBefore = adSlotHeight();

  // 1) 대표가 짚은 경우 — 리포트 시트 하나
  const report = mount(Overlay, { open: false });
  const info = mount(Overlay, { open: false });
  const req0 = native.requests;
  report.update({ open: true }); await flush();
  check('리포트 열림 → 배너 숨김', !bannerVisible() && openCount() === 1, state());
  check('숨겨도 광고 자리 높이는 그대로(뒤 화면이 들썩이지 않는다)', adSlotHeight() === slotBefore, `${slotBefore} → ${adSlotHeight()}`);

  // 2) 겹친 팝업 — 리포트 안의 GEX ⓘ
  info.update({ open: true }); await flush();
  check('ⓘ 겹쳐 열림 → 열린 개수 2 · 여전히 숨김', !bannerVisible() && openCount() === 2, state());
  info.update({ open: false }); await flush();
  check('ⓘ 닫힘 → 리포트가 아직 열려 있어 배너는 계속 숨김', !bannerVisible() && openCount() === 1, state());
  report.update({ open: false }); await flush();
  check('리포트까지 닫힘 → 배너 복귀', bannerVisible() && openCount() === 0, state());
  check('복귀는 «새 광고 요청 없이»(resume) — 요청 수 그대로', native.requests === req0, `requests ${req0} → ${native.requests}`);
  check('복귀 뒤에도 광고 자리 높이 그대로', adSlotHeight() === slotBefore, `${slotBefore} → ${adSlotHeight()}`);

  // 3) 같은 값으로 다시 그려도 네이티브 호출이 늘지 않는다(깜빡임 루프 없음)
  report.update({ open: true }); await flush();
  const callsOpen = native.calls.length;
  for (let i = 0; i < 5; i++) report.update({ open: true });
  await flush();
  check('열린 채 재렌더 5회 → 네이티브 호출 0건 추가', native.calls.length === callsOpen, state());

  // 4) 뒤로가기·탭 이동 = 언마운트로 닫힘
  report.unmount(); await flush();
  check('열린 채 언마운트(뒤로가기·라우트 이동) → 배너 복귀', bannerVisible() && openCount() === 0, state());

  // 5) 한 커밋 안의 «닫힘 → 열림»(광고 모달 닫고 페이월 열기) — 개수가 잠깐 0 이 된다
  const adModal = mount(Overlay, { open: true });
  const paywall = mount(Overlay, { open: false });
  await flush();
  const mark = native.calls.length;
  act(() => { adModal.update({ open: false }); paywall.update({ open: true }); });
  await flush();
  const after = native.calls.slice(mark);
  check('같은 커밋 닫힘→열림 → 배너 계속 숨김', !bannerVisible() && openCount() === 1, state());
  check('그 사이 되살리기(resume/show)를 네이티브로 보내지 않는다', !after.includes('resume') && !after.includes('show'), `after=[${after.join(',')}]`);
  act(() => { paywall.unmount(); adModal.unmount(); });
  await flush();
  check('둘 다 닫힘 → 배너 복귀', bannerVisible() && openCount() === 0, state());

  // 6) 팝업이 열린 채 앱이 백그라운드 → 포그라운드(appStateChange) — 억제 중이면 되살리지 않는다
  const sheet = mount(Overlay, { open: true }); await flush();
  emitAppActive(); await flush();
  check('열린 채 포그라운드 복귀 → 배너 계속 숨김', !bannerVisible(), state());
  sheet.update({ open: false }); await flush();
  check('닫힘 → 배너 복귀', bannerVisible(), state());

  // 7) 자동 새로고침(Loaded 재수신) 중에도 상태 유지
  const sheet2 = mount(Overlay, { open: true }); await flush();
  autoRefresh(); await flush();
  check('숨긴 동안 광고 새로고침 → 계속 숨김', !bannerVisible(), state());
  sheet2.update({ open: false }); await flush();
  autoRefresh(); await flush();
  check('보이는 동안 광고 새로고침 → 계속 보임', bannerVisible(), state());

  // 8) 뷰가 없을 때(로드 실패)의 되살리기 + 요청 중에 팝업이 열리는 경합
  const pop = mount(Overlay, { open: true }); await flush();
  autoRefresh(); await flush();                     // (가만히)
  // 붙은 뷰의 다음 로드가 실패했다고 치자 — 두 플랫폼 모두 뷰를 버린다
  native.loading = true; finishLoad(false); await flush();
  pop.update({ open: false }); await flush();
  check('로드 실패 뒤 닫힘 → 새 요청(showBanner)로 되살린다', native.loading === true, state());
  pop.update({ open: true }); await flush();       // 요청이 도착하기 «전에» 다시 열림
  finishLoad(); await flush();                      // 이제 도착
  check('요청 중에 열린 팝업 → 광고가 도착해도 배너가 팝업 위에 뜨지 않는다', !bannerVisible(), state());
  pop.update({ open: false }); await flush();
  check('닫힘 → 배너 복귀', bannerVisible(), state());

  // 9) 뷰가 없을 때 같은 커밋 닫힘→열림 — showBanner 경로도 보내기 직전에 다시 본다
  const x = mount(Overlay, { open: true }); await flush();
  native.loading = true; finishLoad(false); await flush();
  const y = mount(Overlay, { open: false });
  const mark2 = native.calls.length;
  act(() => { x.update({ open: false }); y.update({ open: true }); });
  await flush();
  check('뷰 없음 + 같은 커밋 닫힘→열림 → 새 광고 요청을 보내지 않는다', !native.calls.slice(mark2).includes('show'), `after=[${native.calls.slice(mark2).join(',')}]`);
  y.unmount(); x.unmount(); await flush();
  if (native.loading) finishLoad();
  await flush();
  check('모두 닫힘 → 배너 복귀', bannerVisible(), state());

  // 10) Pro(광고제거) 사용자 — 팝업을 여닫아도 배너가 되살아나지 않는다
  await adManager.setPro(true); await flush();
  check('Pro → 배너 숨김 + 자리 0', !bannerVisible() && adSlotHeight() === '0px', `${state()} slot=${adSlotHeight()}`);
  const proPop = mount(Overlay, { open: true }); await flush();
  proPop.update({ open: false }); await flush();
  check('Pro: 팝업 닫혀도 배너 안 뜸', !bannerVisible(), state());
  // 해지(Pro → 일반): showBanner 경로. Android 는 이미 있는 뷰에 새 광고만 싣고 GONE 을 안 푼다 → 도착 때 맞춘다
  await adManager.setPro(false); await flush();
  if (native.loading) finishLoad();
  await flush();
  check('Pro 해지 → 광고 도착하면 배너 보임(Android GONE 도 풀린다)', bannerVisible(), state());
  proPop.unmount();

  // 11) 웹(비네이티브)에서는 훅이 아무것도 하지 않는다
  env.native = false;
  const webMark = native.calls.length;
  const webPop = mount(Overlay, { open: true }); await flush();
  webPop.update({ open: false }); await flush();
  check('웹: 네이티브 호출 0건', native.calls.length === webMark, state());
  env.native = true;

  console.log(`  ${env.platform}: ${pass}/${pass + fail} 통과`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
