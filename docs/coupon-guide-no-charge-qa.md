# 쿠폰 코드 등록·구독 분리 — 실기기 확인표

상태: 전 항목 미실행. 대표 승인과 실기기 확인 전 운영 병합·배포 금지.
실제 쿠폰 번호·계정·결제 식별자는 이 문서에 기록하지 않는다.

## 변경과 확인 범위

- 안드로이드: Play 코드 등록 → 사용자 적용 확인 체크 → 기존 월간 구매.
- 코드 등록 화면을 열거나 복귀한 것만으로 체크하거나 무료 적용 완료로 표시하지 않는다.
- ‘계속’은 처음에도 보이지만 비활성이다. 등록 화면 열기와 사용자 확인이 모두 있어야 활성화한다.
- 등록 화면 열기 실패·확인 불가(응답 10초 없음 포함)는 지정 안내 한 줄로 끝낸다. 해당 시트의 등록 버튼·체크는 비활성, 구독 버튼은 미노출이며 구매 핸들러도 차단한다.
- 새 화면 문구는 ‘코드 등록 화면을 열 수 없습니다 — Play 스토어 앱에서 직접 등록’의 ko/en/ja 한 항목뿐이다.
- 무료 요약은 ‘30일 무료가 보이면 구독’ 조건이다. 앱·웹 모두 무료 미표시 시 구독 금지 경고를 표시한다.
- 사용자 체크는 SDK의 적용 검증이 아니다. 실제 Play 결제 창의 30일 무료 표시가 최종 확인 조건이다.
- 결제 SDK·일반 페이월·iOS 코드 등록 동작은 수정하지 않았다.

공유 함수 호출자: `runCouponPurchase`는 `CouponGuideSheet` 한 곳이다.
`couponGuideCopy`는 시트와 설정 화면에서 사용하며, 설정의 `settingsSub`는 보존했다.
`couponHtml`은 `/app` 라우트와 `giftShare/landing`에서 사용한다. 안드로이드 일반·인앱·선물에 경고를 추가했고 iOS 출력은 보존했다.

## P1 수리: 등록 화면 열기 실패를 성공으로 처리

- 원인: `openExternalUrl`은 `Browser.open` 실패 후 `window.open`이 `null`이어도 정상 반환했고, 시트가 정상 반환을 열기 성공으로 간주했다.
- 수리: URL 함수가 `opened` / `unconfirmed` / `failed`를 반환한다. 네이티브 `Browser.open` 성공만 `opened`이고, `window.open`의 객체 반환은 실제 외부 화면 열기 증거가 없어 `unconfirmed`다. 시트는 `opened`만 허용한다.
- 실패·예외·확인 불가 시 사용자 확인을 초기화하고 구매 경로를 차단한다. 응답이 10초 넘게 없거나 이후 성공 응답이 도착해도 해당 시트의 구매를 허용하지 않는다. 이전 활성 구매 핸들러를 다시 호출해도 차단한다.
- 공유 함수 전체 호출자 확인: `CouponGuideSheet`, `redeem.ts`의 iOS URL 폴백, `subscriptionManagement`, 설정의 UC/WIM 링크, `RealityCheck`의 UC 링크, 브리지 내부 `openSystemUrl`·`openStoreReview`. 시트 외에는 결과값을 판단하지 않으며 기존 URL·열기·폴백 동작을 유지한다.
- `openSubscriptionManagement`는 `await`로 결과를 소모해 기존 `Promise<void>` 계약을 보존했다. 호출자는 설정과 `TrialConsentNotice`다. `couponGuideCopy`의 기존 문구·설정 행은 보존했다.

## 로컬 자동 확인

- P1 수리 후: `couponSubscribe` 26건, `couponGuideSheet` 19건, `externalUrl` 8건, `coupon` 32건, `couponIosInApp` 14건, `gift` 22건, `giftShare` 18건, `trialConsentIntegration` 13건: 합계 152건 통과.
- 컴포넌트 시험은 실제 JSX·이벤트 핸들러·URL 함수를 연결한다. React 훅·Capacitor 플랫폼 API·`Browser.open`·`window.open`·구매 SDK는 대역이다. ko/en/ja 각각 네이티브 실패 후 폴백 null·객체·예외를 재현해 안내·구독 미노출·구매 0회를 검증한다. 응답 지연은 가상 타이머로 확인했다. 브라우저·실기기 시험은 아니다.
- `externalUrl`은 네이티브 성공과 웹·네이티브 폴백 6경로 및 실제 구독 관리 함수를 검증한다. `trialConsentIntegration`은 구독 관리 호출자의 플랫폼별 기존 이동을 검증한다.
- `/usr/bin/lockf -k /tmp/signum-heavy.lock node scripts/run-offline-tests.cjs couponGuideSheet.test.ts externalUrl.test.ts couponSubscribe.test.ts coupon.test.ts couponIosInApp.test.ts gift.test.ts giftShare.test.ts trialConsentIntegration.test.ts`: 8파일 통과. 기존 오프라인 실행기로 환경 파일 읽기·외부 소켓 통신·기본 fetch를 차단했다. Redis/API 시험은 메모리 대역이며 실제 구매·운영 쓰기는 실행하지 않았다.
- 웹·선물 회귀 시험은 추가한 지정 경고 한 줄만 제외하고 기존 응답·템플릿을 비교했다. iOS 출력은 그대로 비교했다.
- P1 수리 후 `/usr/bin/lockf -k /tmp/signum-heavy.lock node --require ./scripts/offline-test-preload.cjs node_modules/typescript/bin/tsc --noEmit --incremental false`: 1회 실행, 종료 0, 오류 0. 회귀 시험 묶음에도 같은 잠금을 적용했다.
- `git diff --check`: 통과. 커밋·운영 병합·배포 없음.

## 실기기 확인

| 항목 | 기대 결과 | 결과 |
|---|---|---|
| 설정·공통 페이월·선물함에서 시트 진입 | 등록 버튼 먼저 노출, ‘계속’ 비활성, 무료 적용 완료 표시 없음 | 미실행 |
| 등록 화면을 열고 번호 없이 취소·복귀 | 사용자 확인 미체크, ‘계속’ 비활성, 구매 호출 없음 | 미실행 |
| 등록 화면 열기 실패·확인 불가·응답 없음 | 지정 안내, 등록 버튼·사용자 확인 비활성, 구독 버튼 미노출, 구매 호출 없음 | 미실행 |
| 유효한 일회용 코드 등록·복귀 | 자동 구매·자동 체크 없음; 사용자 확인 후에만 ‘계속’ 활성 | 미실행 |
| 사용자 확인 후 ‘계속’ | 기존 월간 Play 결제 창, 30일 무료 표시 확인; 무료 미표시 시 승인하지 않고 닫기 | 미실행 |
| 다른 Play 계정·만료·사용한 코드·적용 실패 | 무료 완료 표시 없음; 무료 미표시 경고 확인, 최종 구독 승인하지 않기 | 미실행 |
| 결제 창 취소·오류·권한 반영 지연 | 사용자 확인 초기화, 취소 시 완료 표시 없음, 지연 시 기존 대기 안내 | 미실행 |
| 등록 버튼 재실행·시트 재진입·앱 재시작 | 이전 체크 재사용 없음 | 미실행 |
| ko/en/ja 및 작은 화면·큰 글자 | 등록·확인·구독 순서, 경고 가독성, 스크롤·뒤로가기·닫기 확인 | 미실행 |
| 웹 일반·인앱·선물 쿠폰 | 등록 → 경고 → 구독 안내 순서, 앱 폴백에서도 동일 확인 절차 | 미실행 |
| iOS | 기존 코드 사용 시트·URL 폴백 동작 유지 | 미실행 |

## 승인 기록

- 실기기 확인자·일시·앱 버전: 미기록
- 무료 표시·승인 전 금액 확인: 미실행
- 대표 운영 병합 승인: 미승인

위 확인 전 ‘정가 결제 0건 보장’으로 판정하지 않는다.
