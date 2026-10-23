# 쿠폰 경고 현지 가격 수정 확인표

2026-10-23 · 기준 `0565f3011` · 작업 브랜치 `fix/coupon-warning-local-price`.

## 결과 요약

- 원인: 앱·웹 공통 `COUPON_SAFETY`의 원화 리터럴. 시트는 월간 오퍼를 이미 받지만 경고에 전달하지 않았다.
- 시트 경고는 페이월과 같은 `offers.find(plan === 'monthly').priceString`을 그대로 사용한다. 언어로 통화를 추정하거나 가격을 재조합하지 않는다.
- 무료 표시는 `30일 무료` / `free for 30 days` / `30日間無料`. 가격 없음·null·빈 문자열·공백이면 경고의 금액만 생략하며 즉시 청구 시 취소 조건은 유지한다.
- 서버 웹 안내는 RevenueCat 스토어 가격을 읽지 못하므로 금액 없는 경고를 사용한다. 경고 밖의 기존 갱신 가격·문구는 변경하지 않았다.
- 한국어에서 KRW 월간 오퍼는 `금액(월 ₩11,900)`으로 표시한다. 무료·즉시 청구 취소 조건은 동일하다.
- CSS·레이아웃·버튼·구매 조건·일반 페이월·결제 SDK 변경 없음. 커밋·push·병합·배포·운영 쓰기 없음.

## 공유 함수와 호출자 영향

| 공유 항목 | 제품 호출자 전부 | 영향과 시험 |
|---|---|---|
| `couponSafetyCopy` | `couponGuideCopy`, `COUPON_SAFETY` 초기화 | ko/en/ja × KRW/JPY/USD/가격 없음, 통화와 언어 교차 조합 검증 |
| `couponGuideCopy` | `CouponGuideSheet`, 앱 설정 페이지 | 선택 인자에 월간 가격 추가. 설정은 기존 인자로 `settingsSub` 사용. 경고 외 문구·갱신 줄 유지 검증 |
| `COUPON_SAFETY` | `couponHtml` | 웹 일반·인앱·선물은 금액 생략. 등록 → 경고 → 구독 순서, 일본어 구두점 줄바꿈 검증 |

`couponHtml`의 호출자는 `/app` route와 `giftShare/landing`이다. 기존 날짜·한도·선물 HTML 회귀 시험도 통과했다. 시험 보조 호출자는 `_couponSafetyBaseline`과 `giftShare`이며 금액 없는 웹 경고 계약을 유지한다.

## 돌린 시험과 결과

- 모든 무거운 명령은 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 직렬 실행했다. `.env*` 읽기·외부 통신을 차단하는 기존 offline preload를 사용했다.
- `node scripts/run-offline-tests.cjs <아래 32파일>`: 32파일 통과, 실패 0. 시트 24건·쿠폰 흐름 29건 포함.
- 실행 파일: `androidInApp`, `appNoFakeSocialProof`, `appWatchlist`, `coupon`, `couponGuideSheet`, `couponIosInApp`, `couponSubscribe`, `desktopHandoff`, `externalUrl`, `funnel`, `gift`, `giftAnnounce`, `giftShare`, `giftShareLua`, `guruLensProAccess`, `guruLensProGate`, `invite`, `inviteLanding`, `nativeRootRedirect`, `paywallButtonHeight`, `promoCodeChip`, `redeemLinkPreview`, `signumproExpiry`, `signumproExpiryDisplay`, `signumproLimitDisplay`, `smartLink`, `trialConsent`, `trialConsentIntegration`, `trialConsentLifecycle`, `trialConsentRegression`, `uxTimeoutsPaywall`, `webCheckoutAccount`의 기존 시험.
- `node --require ./scripts/offline-test-preload.cjs node_modules/typescript/bin/tsc --noEmit --incremental false`: 1회 실행, 종료 0·오류 0.
- `git diff --check`: 통과.
- `giftShareLua`: 모의 시험 12건 통과. 로컬 Redis 실행 파일이 없어 실제 Redis 시험 1건 skip.

## 남은 위험

- 브라우저 접근 금지에 따라 375px 실제 넘침·실기기 결제 창은 미측정이다. 기존 일본어 줄바꿈 구두점과 CSS 보존은 코드·HTML 시험으로 확인했으며 실제 넘침 0을 실측했다고 주장하지 않는다.
- 시트 시험은 실제 JSX·핸들러를 실행하지만 React 훅·스토어·구매는 대역이다. 실제 RevenueCat 현지 가격과 결제 창 일치는 운영 세션 확인이 남는다.
