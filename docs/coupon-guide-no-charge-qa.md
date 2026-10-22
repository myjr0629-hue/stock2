# 쿠폰 등록 → 구독 시작 — 설계 B 확인표

상태: 로컬 자동 시험 28파일 통과, 전체 타입 검사 오류 0. 브라우저·실기기 미실행. 운영 병합·배포 금지.
실제 쿠폰 번호·계정·결제 식별자는 기록하지 않는다.

## 원인과 구현

- 운영 세션 제공 실측: 10/6 대표 실기기에서 Play 코드 등록은 코드를 저장했지만 구독을 시작하지 않았다. 10/19 안드 쿠폰 사용자는 구독 결제 창을 승인해 PRO를 시작했다(RC Direct 구독 price 0).
- 따라서 r3(904c34334·539c728be)의 구매 제거는 필요한 구독 단계도 없앤다. r1·r2의 등록 선행·사용자 확인·기존 월간 구매 경로를 복구했다.
- `git revert --no-edit 539c728be 904c34334`는 샌드박스가 `.git/worktrees/fix-coupon-guide-no-charge/sequencer` 생성을 거부해 실패했다. 두 커밋의 합산 역패치를 작업 파일에 적용했다. 실제 revert 커밋은 생성되지 않았다.
- ① «Play 스토어에서 코드 등록»을 먼저 보여 준다. 네이티브 `Browser.open`의 성공(`opened`)만 열기 성공으로 인정한다. 등록 화면 열기·복귀는 무료 적용 완료의 증거가 아니다.
- ② «구독 시작»은 처음부터 보이되 비활성이다. ① 열기 성공 + 기존 사용자 확인 체크 + 월간 상품이 모두 필요하다(기존 프리뷰 예외 유지).
- 등록 실패·확인 불가·10초 무응답이면 등록과 확인, 구독 단추 모두 비활성이다. 구독 칸을 숨기지 않는다. 뒤늦은 성공이나 이전 활성 핸들러도 구매를 허용하지 않는다.
- ② 바로 위 강조 경고(ko/en/ja 공통 항목): «결제 창에 ₩0 · 30일 무료가 보일 때만 승인하세요. 금액(월 11,900원)이 바로 청구되는 화면이면 취소하세요.» 기존 무료 미표시 경고를 교체했다.
- 등록 열기 성공과 체크를 순수 구매 함수에서도 요구한다. 구매 중 중복 실행을 차단하며, 취소·오류·권한 지연 후 사용자 확인을 초기화한다.
- 구매는 기존 `useProStatus().purchase('monthly', src)` 경로다. 일반 페이월·공유 결제 SDK·iOS 코드 등록 동작은 수정하지 않았다.
- 웹 일반·인앱·선물 안내는 등록 → 같은 경고 → 구독 및 앱 설정 경로 순서다. 선물은 스토어로 이동하기 전에도 경고·구독 안내를 표시한다. 웹에는 별도 구매 호출이 없다.
- r3의 설정 안내 줄 «Play 스토어 → 결제 및 정기 결제 → 코드 사용»은 ko/en/ja 모두 유지했다.

## 자동 환불 안내의 제한

설치된 `@revenuecat/purchases-capacitor` 13.2.1이 내보내는 `CustomerInfo.subscriptionsByProductIdentifier`의 `PurchasesSubscriptionInfo`에는 실제 결제 금액 `price`가 없다. 상품의 `price`는 정가이므로 실제 청구 여부의 증거로 사용하지 않는다. 따라서 price>0 감지에 따른 자동 환불 시트는 구현하지 않았다. SDK 계약만으로 무료·유료 시작을 확정할 수 없다.

## 공유 함수 영향과 시험 범위

| 변경한 공유 항목 | 모든 제품 호출자 | 영향·시험 |
|---|---|---|
| `runCouponPurchase` | `CouponGuideSheet` | 등록 열기 성공과 사용자 확인 모두 필수. 미확인·누락 입력의 구매/계측 0, 성공·취소·오류·권한 지연 시험 |
| `couponGuideCopy` | `CouponGuideSheet`, 앱 설정 | 단계 이름·경고 교체, 설정 줄 유지. ko/en/ja 동일 구조 시험 |
| `COUPON_SAFETY` | `couponGuideCopy`, `couponHtml` | 앱·웹 경고 1항목 교체. 지정 번역·위치 검증 |
| `couponHtml` | `/app` route, `giftShare/landing` (`couponSubline`은 `desktopHandoff`도 사용) | 안드 일반·인앱·선물 순서와 경고. iOS 및 날짜·한도·선물 HTML 회귀 확인 |

`openExternalUrl`은 r1·r2 구현을 유지한다. 호출자는 쿠폰 시트, `redeem.ts` iOS URL 폴백, `subscriptionManagement`, 설정 UC/WIM 링크, `RealityCheck` UC 링크, 브리지 내부 `openSystemUrl`·`openStoreReview`다. 반환값에 따라 구매를 허용하는 곳은 쿠폰 시트뿐이다. 외부 URL·구독 관리 시험을 포함한다.

## 관문 지시서에 그대로 전달

«구매 경로 존재 자체»는 Play 프로모션 구조상 필수이므로 결함으로 보지 않는다. 판정 기준은 ① 코드 등록 단계를 건너뛰는 진입 경로 0 ② ② 단계 경고가 결제 창 직전에 항상 보임 ③ 일반 페이월 무변경.

## 로컬 자동 확인

- 실행 환경: `scripts/run-offline-tests.cjs`와 기존 preload로 `.env*` 읽기·외부 통신을 차단한다. 구매·API는 대역이며 운영 쓰기를 실행하지 않는다. Lua 시험의 실제 로컬 Redis 항목은 건너뛰었고 모의 시험은 통과했다.
- 모든 시험 묶음과 전체 타입 검사는 `/usr/bin/lockf -k /tmp/signum-heavy.lock` 아래 직렬 실행한다.
- 결제·페이월·쿠폰 관련 최종 28파일 통과: `couponGuideSheet` 22건, `couponSubscribe` 27건, `coupon` 32건 포함. `giftShareLua`는 12건 통과·실제 로컬 Redis 1항목 skip.
- 실행 파일: `couponGuideSheet`, `couponSubscribe`, `coupon`, `couponIosInApp`, `externalUrl`, `funnel`, `gift`, `giftAnnounce`, `giftShare`, `giftShareLua`, `invite`, `inviteLanding`, `paywallButtonHeight`, `promoCodeChip`, `redeemLinkPreview`, `signumproExpiry`, `signumproExpiryDisplay`, `signumproLimitDisplay`, `trialConsent`, `trialConsentIntegration`, `trialConsentLifecycle`, `trialConsentRegression`, `uxTimeoutsPaywall`, `appWatchlist`, `guruLensProAccess`, `guruLensProGate`, `appNoFakeSocialProof`, `nativeRootRedirect`의 기존 시험.
- 최초 시트 시험 실패 2회는 새 검증 코드의 CSS 기본 내보내기 대역과 React 자식 복제 뒤 객체 동일성 비교 때문이었다. 시험을 수정한 뒤 해당 파일만 재실행해 22/22 통과했다. 같은 대형 묶음을 반복하지 않았다.
- 전체 타입 검사 1회: `/usr/bin/lockf -k /tmp/signum-heavy.lock node --require ./scripts/offline-test-preload.cjs node_modules/typescript/bin/tsc --noEmit --incremental false` → 종료 0, 오류 0.
- `git diff --check` 통과. r2 기준 일반 페이월·공유 결제 SDK·구매 상태·URL 브리지 파일의 차이 없음. `redeem.ts`는 주석만 갱신했다.
- 시트 시험은 실제 JSX·이벤트 핸들러·URL 함수를 사용하며 React 훅·Capacitor·구매 SDK는 대역이다. 화면 배치·실제 Play 결제 창을 확인한 것은 아니다.
- 날짜·한도·선물 HTML 시험은 허용된 경고와 단계 이름만 정규화한 뒤 과거 커밋 출력과 비교한다. iOS·나머지 바이트 보존 계약을 유지한다.

## 실기기 확인표

| 항목 | 기대 결과 | 결과 |
|---|---|---|
| 설정·페이월·내 종목·선물함에서 진입 | ① 먼저, ② 비활성, 경고 표시 | 미실행 |
| ① 미실행 | 체크·② 비활성, 구매 0 | 미실행 |
| ① 열기 실패·확인 불가·무응답 | 기존 실패 안내, ② 비활성·노출 유지, 구매 0 | 미실행 |
| ① 열고 번호 없이 복귀 | 자동 체크·구매·무료 완료 표시 없음 | 미실행 |
| 유효한 일회용 코드 등록 후 사용자 확인 → ② | 경고 바로 아래에서 기존 월간 Play 결제 창 진입. ₩0·30일 무료 확인 후에만 승인 | 미실행 |
| 결제 창의 결제 수단 → 코드 사용 | 코드 입력 후 ₩0·30일 무료가 보일 때만 승인 | 미실행 |
| 만료·사용한 코드·다른 계정·즉시 정가 청구 화면 | 경고에 따라 취소, 무료 완료 표시 없음 | 미실행 |
| 취소·오류·권한 지연 | 기존 동작·안내, 사용자 확인 초기화 | 미실행 |
| 재진입·재시작·등록 재실행 | 이전 확인 재사용 없음 | 미실행 |
| ko/en/ja·375폭·큰 글자 | 단계 순서, 경고 가독성, 스크롤·뒤로가기·닫기 확인 | 미실행 |
| 웹 일반·인앱·선물 | 등록 → 같은 경고 → 구독 안내, 앱 폴백도 동일 절차 | 미실행 |
| 일반 페이월·iOS | 기존 동작 유지 | 미실행 |

## 남은 위험과 승인 기록

- 앱은 실제 결제 창의 무료 적용 여부를 검증하지 못한다. 사용자가 최종 금액을 확인해야 하며 정가 승인 0건을 보장하지 않는다.
- 환불 안내 자동 감지는 미구현이다. 실제 기기에서 무료 시작·정가 화면 취소·권한 반영을 운영 세션이 확인해야 한다.
- 브라우저·실기기 확인자·일시·앱 버전: 미기록.
- 대표 운영 병합 승인: 미승인. 병합·배포·push 없음.

## 바꾼 파일

- 앱: `src/components/app/CouponGuideSheet.tsx`, `src/components/app/CouponGuideSheet.module.css`, `src/lib/app/couponGuide.ts`, `src/lib/app/redeem.ts`(주석).
- 웹·공통 경고: `src/lib/marketing/couponHtml.ts`, `src/lib/marketing/couponSafety.ts`.
- 시험: `tests/couponGuideSheet.test.ts`, `tests/couponSubscribe.test.ts`, `tests/coupon.test.ts`, `tests/giftShare.test.ts`, `tests/signumproExpiryDisplay.test.ts`, `tests/signumproLimitDisplay.test.ts`, `tests/_couponSafetyBaseline.ts`.
- 확인표: `docs/coupon-guide-no-charge-qa.md`.
