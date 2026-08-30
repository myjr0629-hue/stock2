// ============================================================================
// config/admob — 3앱의 «애드몹 게시자 + 유닛 ID 단일 출처»
// ----------------------------------------------------------------------------
// 왜 한 곳에 모았나 (2026-08-13):
//   애드몹 계정이 5회 반려됐고, 개인 계정으로 갈아탈 가능성이 있다. 그때
//   pub ID 와 유닛 ID 12개가 세 파일에 흩어져 있으면 교체가 사고를 부른다.
//   여기 하나만 고치면 3앱이 동시에 따라오게 만든다.
//
// ⛔ 교체 절차 — 2026-08-18 정정. «웹 배포만으로 끝난다»는 틀렸다.
//
//    애드몹 식별자는 «두 종류»이고 사는 곳이 다르다:
//      · 앱 ID   (ca-app-pub-XXXX~YYYY)  → **바이너리 안**
//        Android: android/app/build.gradle 의 adMobAppId (→ AndroidManifest meta-data)
//        iOS:     ios/App/App/Info.plist 의 GADApplicationIdentifier
//        구글 모바일 광고 SDK 가 «초기화할 때» 읽는다. 웹에서 못 바꾼다.
//      · 유닛 ID (ca-app-pub-XXXX/ZZZZ)  → 이 파일. 웹 배포로 바뀐다.
//
//    게시자를 갈아타면 «둘 다» 바뀐다. 그래서 순서가 이렇다:
//      1. [대표] 애드몹에서 앱 등록 + 광고 단위 발급
//      2. [나]   각 네이티브 프로젝트의 «앱 ID» 6개 교체 (3앱 × 2플랫폼)
//      3. [대표] 6개 바이너리 재빌드 + 스토어 제출 — ★ 이 단계가 빠져 있었다
//         (이때 광고는 여전히 꺼져 있다: 아래 REAL_UNIT_IDS 가 null →
//          adsAllowed() 가 막는다. 그래서 «미리 내보내도» 안전하다)
//      4. [나]   바이너리가 라이브가 된 뒤 REAL_UNIT_IDS 를 채운다
//      5. [나]   public/app-ads.txt 의 pub ID 확인 ← 잊으면 광고가 안 나온다
//      6. [나]   각 앱의 ADS_LIVE / WIM_ADS_LIVE 를 true 로 → 웹 배포
//
//    ⚠️ WIM 은 3 번 전에 개인정보처리방침(«No ads or tracking») 3개국어 수정이
//       선행돼야 한다. 스토어 데이터 안전성 / App Privacy 도 같이 갱신한다.
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
 * 신규 = 승인된 개인 애드센스(myjr0629)와 «같은» 게시자 계정.
 * ✅ 2026-08-18 승인 완료 — 앱 6개 등록됨(3앱 × 2스토어), 전부 «준비됨/광고 게재 사용 설정됨».
 *    남은 것: 광고 단위 발급 → 아래 REAL_UNIT_IDS 채우기 (+ 바이너리의 앱 ID 교체, 위 절차 참조).
 */
export const PUBLISHER = 'ca-app-pub-9554397112094712';

/** 구글 공식 테스트 게시자 — 실계정이 없을 때 이걸 쓴다 */
export const TEST_PUBLISHER = 'ca-app-pub-3940256099942544';

export type Platform = 'ios' | 'android';
export type Slot = 'banner' | 'interstitial' | 'rewarded';
export type AppKey = 'signum' | 'uc' | 'wim';

/**
 * 유닛 표. 같은 모양을 두 군데서 쓰는데 «담기는 값»이 다르다 —
 *   TEST_UNITS        : 전체 ID (`ca-app-pub-…/1234`)
 *   UNITS_2026_08_18  : 슬래시 «뒤» 숫자만 (`1234`) — 접두사는 unitsFor 가 붙인다
 */
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
 * ★ 2026-08-18 개인 계정에서 발급받은 «실» 유닛 18개. 값은 여기 보존한다.
 *
 * ⛔ 아직 REAL_UNIT_IDS 에 연결하지 «않는다». 스토어에 올라가 있는 바이너리 6개가
 *    폐쇄된 회사 계정의 앱 ID 를 들고 있기 때문이다. 앱 ID 와 유닛 ID 의 게시자가
 *    어긋난 채로 광고를 요청하면 노필이 나거나 정책 문제가 된다.
 *    새 앱 ID 를 담은 바이너리가 «라이브가 된 뒤» 아래 REAL_UNIT_IDS 를 이걸로 바꾼다.
 *    (절차 정본 = 파일 상단 주석 + .agent/SIGNUM_V1.2_BINARY_TODO.md §0)
 */
const UNITS_2026_08_18: Record<AppKey, UnitTable> = {
  signum: {
    banner: { ios: '2475761692', android: '5676640109' },
    interstitial: { ios: '5496676704', android: '3872603840' },
    rewarded: { ios: '7237133789', android: '3681032159' },
  },
  uc: {
    banner: { ios: '3829155637', android: '5840291635' },
    interstitial: { ios: '3461540300', android: '9288582059' },
    rewarded: { ios: '9244350024', android: '5501329953' },
  },
  wim: {
    banner: { ios: '8406745226', android: '3401830554' },
    interstitial: { ios: '5780581884', android: '9584095526' },
    rewarded: { ios: '2058472067', android: '9392523836' },
  },
};

/**
 * 앱별 «실» 유닛 — 숫자 부분만 담는다. 게시자 접두사는 PUBLISHER 가 붙인다.
 * null = 아직 «켜지 않음» → adsAllowed() 가 광고 요청 자체를 막는다.
 */
const REAL_UNIT_IDS: Record<AppKey, UnitTable | null> = {
  // ✅ 2026-08-19 SIGNUM / UC 켬. 켜기의 «유일한» 조건이었던 「새 앱 ID 를 담은 바이너리가
  //    스토어에 라이브」가 이날 충족됐다. 근거는 기억이 아니라 대조다 — 스토어에 표시된
  //    버전·빌드번호가 저장소 값과 4개 전부 일치했다:
  //      SIGNUM iOS 1.2 (빌드 3)   · SIGNUM Android 1.2 (vc 3)
  //      UC     iOS 1.0.2 (빌드 4) · UC     Android 1.0.2 (vc 4)
  //    스토어 선언도 «같은 창»에서 맞췄다(어긋난 채로 광고를 내면 정책 위반):
  //      Play — SIGNUM 광고=예(기존) / UC 광고=예 + 데이터 보안(기기 ID 수집·공유,
  //             용도=광고·부정방지) 제출
  //      ASC  — 양쪽 모두 「기기 ID · 추적 목적으로 사용됨」 게시됨
  signum: UNITS_2026_08_18.signum,
  uc: UNITS_2026_08_18.uc,
  // ✅ 2026-08-30 WIM 켬. 켜기의 유일한 조건이었던 「새 앱 ID 를 담은 바이너리가
  //    양 스토어 라이브」가 충족됐다. 근거는 기억이 아니라 실측이다:
  //      iOS     1.0.1 (build 4) READY_FOR_SALE  — ASC API
  //      Android 1.0.1 (vc 3)    Play 공개 리스팅 2026-08-25 갱신
  //      앱 ID 는 8/18 커밋(7ca04f53) → 8/25 빌드에 포함 = 라이브 바이너리가
  //      개인 계정 ID 를 들고 있음  (iOS ~6742792269 / Android ~2356875029)
  //    스토어 선언도 «같은 창»에서 맞춘 것을 확인했다:
  //      ASC  — 연령등급 advertising=True (3앱 전부 · UC 2.3.6 반려의 그 항목)
  //      Play — 광고=예 + 데이터 안전성(광고 ID 수집·공유) 2026-08-25 제출
  //      app-ads.txt — www 에서 200 text/plain · pub-9554397112094712
  wim: UNITS_2026_08_18.wim,
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

/**
 * ★ 구글 공식 «테스트» 유닛을 꺼내는 유일한 경로 (2026-08-19).
 *
 * 실유닛을 채우자마자 unitsFor() 는 더 이상 테스트 유닛을 돌려주지 않는다.
 * 그런데 QA 는 여전히 테스트 광고를 봐야 한다 — 실유닛에 테스트 트래픽을 태우면
 * «무효 트래픽»으로 애드몹 계정이 정지된다(수익이 아니라 계정을 잃는다).
 * 그래서 강제 테스트 경로는 반드시 이 함수를 통해 테스트 유닛을 집어야 한다.
 */
export function testUnits(): UnitTable {
  return TEST_UNITS;
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
