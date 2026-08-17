// ============================================================================
// config/admob — 3앱의 «애드몹 게시자 + 유닛 ID 단일 출처»
// ----------------------------------------------------------------------------
// 왜 한 곳에 모았나 (2026-08-13):
//   애드몹 계정이 5회 반려됐고, 개인 계정으로 갈아탈 가능성이 있다. 그때
//   pub ID 와 유닛 ID 12개가 세 파일에 흩어져 있으면 교체가 사고를 부른다.
//   여기 하나만 고치면 3앱이 동시에 따라오게 만든다.
//
// 교체 절차 (승인 후 몇 분이면 끝난다):
//   1. PUBLISHER 를 새 pub ID 로 바꾼다
//   2. UNITS 의 12개 숫자를 새 계정에서 발급받은 값으로 바꾼다
//   3. public/app-ads.txt 의 pub ID 도 같이 바꾼다   ← 잊으면 광고가 안 나온다
//   4. 각 앱의 ADS_LIVE / WIM_ADS_LIVE 를 true 로
//   5. 웹 배포 — 앱 재빌드도 스토어 재심사도 필요 없다
//
// ⚠️ 유닛 ID 는 «비밀이 아니다». 공개 식별자라 코드에 있어도 된다.
// ⚠️ 스토어 개발자 계정과 애드몹 계정 명의가 «같을 필요는 없다» —
//    소유권은 app-ads.txt 위임으로 증명된다(2026-08-13 구글 문서 확인).
//    단, 스토어의 «개발자 웹사이트»는 경로 없는 베어 도메인이어야 한다.
//    2026-08-18: WIM 이 /en/wim 이던 것을 대표가 베어 도메인으로 수정 — 3앱 모두 정상.
// ============================================================================

/**
 * 현재 게시자. 계정을 갈아타면 여기 한 줄만 바꾼다.
 *
 * 2026-08-17 교체: 회사 계정(pub-1716731715414173)은 5연속 거절 후 8/15 폐쇄.
 * 원인 = 외국인 소유 단일멤버 LLC 는 세금 서식이 반드시 개인 명의(W-8BEN)라
 * 「법인 계정인데 세금·수취인이 개인」 → 기존 개인 애드센스 보유자의 «중복»으로
 * 자동 거절. 구조적으로 고칠 수 없어 개인 게시자로 이전했다.
 * 신규 = 승인된 개인 애드센스(myjr0629)와 «같은» 게시자 계정. 본인확인 심사 중.
 */
export const PUBLISHER = 'ca-app-pub-9554397112094712';

/** 구글 공식 테스트 게시자 — 실계정이 없을 때 이걸 쓴다 */
export const TEST_PUBLISHER = 'ca-app-pub-3940256099942544';

export type Platform = 'ios' | 'android';
export type Slot = 'banner' | 'interstitial' | 'rewarded';
export type AppKey = 'signum' | 'uc' | 'wim';

type UnitTable = Record<Slot, Record<Platform, string>>;

/**
 * 구글 공식 «테스트» 유닛. 실유닛이 없는 앱은 이걸 쓴다.
 * 실계정에 테스트 광고를 요청하면 정책 위반이라, 둘을 절대 섞지 않는다.
 */
const TEST_UNITS: UnitTable = {
  banner: { ios: `${TEST_PUBLISHER}/2934735716`, android: `${TEST_PUBLISHER}/6300978111` },
  interstitial: { ios: `${TEST_PUBLISHER}/4411468910`, android: `${TEST_PUBLISHER}/1033173712` },
  rewarded: { ios: `${TEST_PUBLISHER}/1712485313`, android: `${TEST_PUBLISHER}/5224354917` },
};

/**
 * 앱별 «실» 유닛 — 숫자 부분만 담는다. 게시자 접두사는 PUBLISHER 가 붙인다.
 * null = 아직 발급 안 됨 → 자동으로 테스트 유닛으로 폴백한다.
 */
const REAL_UNIT_IDS: Record<AppKey, Record<Slot, Record<Platform, string>> | null> = {
  // ⚠️ 2026-08-17: 구 계정 폐쇄로 «12개 유닛이 전부 죽었다». 새 계정 승인 후
  //    앱 3개를 등록하고 유닛을 재발급받아 여기 채운다. 그전까지는 null =
  //    구글 테스트 유닛 폴백이라 «죽은 유닛을 요청하는» 사고가 구조적으로 안 난다.
  //
  //    구 유닛(폐기, 복구 불가):
  //      signum banner 1878755113/9374101756 · int 9818357259/5687540555 · rew 5712012740/6011395643
  //      uc     banner 6846022634/5046424029 · int 3485930345/7900084009 · rew 4152410686/4415868633
  signum: null,
  uc: null,
  wim: null,
};

/** 앱의 유닛 표. 실유닛이 없으면 테스트 유닛을 돌려준다. */
export function unitsFor(app: AppKey): UnitTable {
  const ids = REAL_UNIT_IDS[app];
  if (!ids) return TEST_UNITS;
  return {
    banner: { ios: `${PUBLISHER}/${ids.banner.ios}`, android: `${PUBLISHER}/${ids.banner.android}` },
    interstitial: { ios: `${PUBLISHER}/${ids.interstitial.ios}`, android: `${PUBLISHER}/${ids.interstitial.android}` },
    rewarded: { ios: `${PUBLISHER}/${ids.rewarded.ios}`, android: `${PUBLISHER}/${ids.rewarded.android}` },
  };
}

/** 이 앱이 «실» 유닛을 쓰고 있는가 — 테스트 광고 요청 여부를 여기서 판단한다 */
export function hasRealUnits(app: AppKey): boolean {
  return REAL_UNIT_IDS[app] !== null;
}

/**
 * ★ 이 앱이 «광고를 요청해도 되는가» — 모든 광고 호출의 최상위 관문.
 *
 * 2026-08-18 실사고에서 나온 규칙이다. 8/17 에 구 계정 폐쇄로 REAL_UNIT_IDS 를
 * 전부 null 로 되돌렸는데, 그 폴백이 «구글 테스트 유닛»이라 **라이브 SIGNUM 앱에
 * "Test mode" 배너가 실사용자에게 그대로 나갔다**(대표가 실기기에서 발견).
 * 그전에는 (죽은) 실유닛을 요청해 노필로 조용히 안 보였을 뿐이라 증상이 없었다.
 *
 * 테스트 유닛 폴백은 «죽은 유닛 요청»은 막아줬지만 «프로덕션 테스트 광고»라는
 * 더 나쁜 문을 열었다. 그래서 관문을 하나 더 둔다:
 *   실유닛이 없으면 → 광고를 **아예 요청하지 않는다**. 수익이 0인데 화면을
 *   가리고 "Test mode" 를 사용자에게 보여줄 이유가 없다.
 *
 * 개발·QA 에서 테스트 광고를 «보고 싶을 때»만 NEXT_PUBLIC_ADMOB_TEST_MODE=true
 * 로 명시적으로 연다. 기본값이 «닫힘»이어야 사고가 안 난다.
 */
export function adsAllowed(app: AppKey): boolean {
  if (process.env.NEXT_PUBLIC_ADMOB_TEST_MODE === 'true') return true;
  return hasRealUnits(app);
}

/** app-ads.txt 에 들어가야 하는 줄 — 파일과 코드가 어긋나는 사고를 막는다 */
export const APP_ADS_TXT_LINE =
  `google.com, ${PUBLISHER.replace('ca-app-', '')}, DIRECT, f08c47fec0942fa0`;
