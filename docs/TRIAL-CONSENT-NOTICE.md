# 한국 체험 종료 안내

2026-10-14 · `feat/trial-consent-notice`

근거: 운영 세션이 제공한 `KR-CONSENT-CODEX-2026-10-14.md`와 설치된 `@revenuecat/purchases-capacitor` **13.2.1**의 타입·iOS/Android 플러그인 소스. 운영 계정·배포 바이너리·실제 동의 상태를 조회한 결과가 아니다.

## 원인과 구현 범위

기존 `useProStatus`는 활성 PRO 여부만 화면에 제공한다. 체험 종료일·국가·현재 기간·자동 갱신 여부를 조합한 안내가 없었다. 이번 기능은 SDK에서 이 정보를 별도로 읽고 기존 스토어 구독 관리로 연결한다. 앱에서 동의를 수집하거나 동의 완료를 추정하지 않는다.

기존 설정 화면의 관리 이동 코드를 `openSubscriptionManagement`로 추출했다. 설정의 인자 없는 호출은 기존 `native-ios` 판정과 두 URL을 그대로 유지한다. 새 카드만 확인된 entitlement store를 인자로 전달한다. 기존 문구·라벨·카드 순서는 유지하고 대시보드 히어로 아래에 카드 하나를 추가한다. 기존 `e9Sect`·`e9Surf`와 앱 색상·글꼴 토큰을 재사용한다. 안내문 전체를 한 문단으로 표시하며 좁은 화면에서는 줄바꿈한다. 기존 앱 레이아웃의 버튼 탭 햅틱을 재사용한다.

## 확인한 SDK 계약과 표시 규칙

- `CustomerInfo.entitlements.active.pro`: `isActive`, `willRenew`, `periodType`, `expirationDate`, `latestPurchaseDate`, `store`, `ownershipType`, `productIdentifier`, `productPlanIdentifier`.
- `Purchases.getStorefront()` → `{ countryCode: string }`. 설치된 iOS/Android 플러그인 모두 이 메서드를 구현한다. `KR`·`KOR`만 허용한다. locale은 한국어 문구 대상 여부에만 사용하며 스토어 국가로 대체하지 않는다.
- 네이티브 iOS+`APP_STORE` 또는 Android+`PLAY_STORE`, 한국어 `ko`, KR storefront, 활성 PRO, `willRenew === true`, 유효한 미래 만료일이 모두 필요하다. 웹·국가 불명·가족 공유·해지·만료·스토어 불일치는 제외한다.
- **무료 근거는 `periodType === TRIAL`**이다. SDK는 `INTRO`를 할인 도입 기간으로 정의하며 무료 여부를 제공하지 않는다. 상품 카탈로그의 무료 오퍼가 현재 고객의 실제 거래였다는 보장도 없다. 따라서 `INTRO`·`NORMAL`을 무료라고 추정하지 않는다. 무료 intro/offer도 스토어가 현재 기간을 `TRIAL`로 보고하는 경우 포함된다. `INTRO`·`NORMAL`로 보고되는 무료 오퍼가 있다면 추가 거래 근거가 필요하다.
- 두 스토어 모두 **만료까지 7×24시간 이하**, 만료 순간부터 제외한다.
- Apple은 **현재 무료 기간 시작 후 24시간 이상인 첫 대시보드 노출 1회**도 허용한다. `latestPurchaseDate`는 SDK가 정의한 현재 기간 시작이며, 별도 코드 교환 시각을 검증한 것은 아니다. Google에는 조사 문서의 Apple 24시간 일정을 복제하지 않는다. Google의 실제 동의 기한은 SDK에 없으므로 이번 안내 시점은 요청된 만료 7일 기준이다.
- 카드가 화면에 실제 진입할 때만 초기 노출을 소비한다. 같은 대시보드 방문 중 갱신 조회가 초기 카드를 없애지 않는다. 이후 방문에서는 만료 7일 조건으로 다시 판정한다.
- `willRenew`는 **동의 완료 증거가 아니다**. 이미 동의한 사람도 SDK만으로 구분할 수 없어 안내 대상일 수 있다.

## 가격·로컬 저장·갱신

- `getProducts`로 활성 entitlement 상품을 조회한다. 그 상품의 `subscriptionPeriod === P1M`일 때만 `priceString`을 그대로 `월 …으로`에 사용한다. Android는 base plan까지 일치해야 한다. 다른 상품·다른 주기·조회 실패·빈 문자열이면 가격 절 전체를 생략한다. 종료일은 한국 시간으로 표시한다.
- 현재 카탈로그 가격과 고객별 가격 유지/다음 청구 가격의 일치는 이 SDK만으로 확인할 수 없다. 가격을 계산하거나 하드코딩하지 않는다.
- 로컬 키: `signumhq.trialConsent.v1`. 저장값은 `earlySeenPeriod`(시작·종료 밀리초 두 값)와 `snoozedUntil`뿐이다. 사용자·기기·거래·상품 식별자는 저장하거나 전송하지 않는다.
- **7일간 보지 않기**는 누른 시각부터 정확히 7×24시간 억제한다. 이후에도 대상 조건을 만족할 때 다시 표시한다. 로컬 저장이 차단되면 현재 앱 실행 동안 메모리로 억제한다. 앱 재설치·저장소 삭제 후 유지되는 선호는 아니다.
- 첫 대시보드 진입·설정 경유 재진입·관리 화면/백그라운드 복귀 모두 **이번 진입에서 `invalidateCustomerInfoCache()` 완료 후 새로 받은 `CustomerInfo`**로 표시 여부를 판정한다. 최초 진입에서 캐시를 그대로 읽어 해지 전 `willRenew=true`가 다시 표시되던 경로를 수정했다.
- 진입은 컴포넌트 마운트 또는 비활성 상태/구독 관리에서 복귀한 시점이다. `visibilitychange`의 숨김과 네이티브 `appStateChange`의 비활성 전환에서 기존 조회를 무효 처리하고 카드를 숨긴다. WebView 가시성이 바뀌지 않는 네이티브 복귀도 포함한다. 관리 버튼 직후에는 복귀까지 조회를 막는다.
- 진입별 새 조회 Promise를 공유한다. SDK 알림·`app:resume`·활성화·로컬 저장 이벤트·60초 주기 조회가 겹쳐도 **캐시 무효화는 진입당 최대 1회**다. 새 조회 실패·시간 초과·대상 없음은 같은 진입에서 재시도하지 않으며 이전 캐시로 표시하지 않는다. 다음 실제 진입에서 다시 시도한다.
- 진입의 새 조회가 성공한 뒤에는 SDK 변경·로컬 저장 변경·활성 화면의 60초 주기와 만료 시각에 재판정한다. 이 후속 조회는 캐시를 다시 무효화하지 않는다. 설정·국가·권한 조회 실패는 숨김, 가격 조회 실패는 가격만 생략한다. 늦게 도착한 이전 진입 응답이 숨김·끄기·해지 상태를 덮어쓰지 못한다.

## 원격 끄기 — 운영 세션 전용

- 읽기 API: `GET /api/app/trial-consent-config` → `{ enabled: boolean }`, `Cache-Control: no-store`.
- 기존 `onb2:off`와 같은 패턴의 EC2 Redis 키 **`trial-consent:off`**. 운영 담당자가 이 키에 `1`을 설정하면 끈다. 키를 삭제하면 다시 기본 켜짐이다. 이 작업에서는 키를 쓰지 않았다.
- 서버 환경 설정 **`TRIAL_CONSENT_OFF=1`**도 끈다. 환경변수 변경의 반영은 배포 환경의 적용 절차를 따른다.
- 켜짐은 **이번 요청의 `getAuthoritativeCache` 결과가 `ok: true`이고 값이 허용된 켜짐 값일 때만** 허용한다. EC2에서 확인한 키 없음(`null`)·빈 문자열·`0`·`false`·문자열 `"0"`/`"false"`는 켜짐, 나머지 값은 꺼짐이다. `getRedisStatus().ecProxyAvailable` 같은 전역 상태로 성공 여부를 추정하지 않는다.
- 공유 `redisClient.ts`에는 `getAuthoritativeCache`가 추가됐고, 내부 `ecProxyGetEx`에는 기본값이 `false`인 `requireResult` 인자가 추가됐다. 새 경로만 엄격한 응답 검증을 켠다. 응답의 `result` 누락·배열·`error` 필드·깨진 문자열·HTTP 오류·쿨다운은 `ok: false`이며 Upstash로 폴백하지 않는다. API의 조회 예외·1.5초 초과도 꺼짐이다.
- 기존 `getFromCache` 호출은 엄격 검증을 켜지 않는다. 기존 반환값·시간 예산·전역 상태 갱신·폴백 순서는 유지한다. 이번 보완에서는 Redis 소스를 추가 수정하지 않았다. 이전 검토의 기존 경로 비교 시험 46개 통과는 검토자가 제공한 결과다.
- 카드가 표시 중인 활성 대시보드의 끄기는 최대 60초 조회 간격 + 요청 완료 시간 후 반영한다. 진입의 새 조회가 실패했거나 대상이 아니었던 화면은 다음 진입에서 다시 판정한다. 클라이언트 설정 조회는 3초, 각 SDK 읽기는 5초 상한이다. 백그라운드 앱은 복귀 시 재검사한다. 배포되지 않은 코드에 스위치만 설정해도 기능이 생기는 것은 아니다.

## 계측 계약

기존 `lib/app/funnel.ts` → `/api/funnel-hit` 경로를 사용한다. 새 source는 **`trial_notice`**다.

| stage | 의미 |
|---|---|
| `trial_notice_show` | 카드가 화면에 진입함. 대시보드 방문마다 기간·안내 시점별 중복 억제 |
| `trial_notice_manage` | `구독 관리에서 확인` 탭. 관리 화면 열림 성공·동의 완료를 뜻하지 않음 |
| `trial_notice_snooze` | `7일간 보지 않기` 탭 |

키: `fx:<stage>:trial_notice:<ios|android>:<ET 날짜>`. 로컬/프리뷰는 기존대로 `fxp:`. 기존 버전 분해표 `fx:v:<ET 날짜>`에도 누적한다. 기존 45일 TTL을 따른다. 전송 필드는 `st`, `s`, `p`, `v`뿐이며 국가·가격·종료일·고객 식별자를 추가하지 않는다.

`scripts/mkt-funnel.js`의 닫힌 목록을 동기화하고 안내 횟수·관리 탭/표시 비율을 별도 표로 추가했다. 기존 구매 퍼널의 분모·분자에 섞지 않는다. **이 비율은 고유 사용자 전환율·동의 확인율·실제 유료 갱신율이 아니다.** 기존 집계가 read-modify-write이므로 동시 요청 시 일부 손실 가능성이 있다. 실제 동의·유료 전환 통계는 조사 문서의 서버 알림/구독 상태 대조가 별도로 필요하다. 집계 스크립트의 운영 실행은 하지 않았다.

## 공유 코드 영향과 시험 범위

- 이번 변경의 `createTrialConsentController` 실행 호출자는 `TrialConsentNotice` 1곳이며, 컴포넌트는 앱 대시보드 1곳에서 사용한다. `loadTrialConsentSnapshot`의 제품 코드 호출도 이 컴포넌트가 컨트롤러에 전달하는 1곳이다. 첫 진입·복귀·중복 알림·실패·늦은 응답 시험을 추가/갱신했다. 구독 관리·결제·PRO 판정·Redis 구현과 화면 문구/스타일은 이번 보완에서 변경하지 않았다.
- `getAuthoritativeCache`의 제품 코드 호출자는 `/api/app/trial-consent-config` 1곳이다. 기존 Redis 소비자는 새 엄격 조회를 사용하지 않는다. 스위치의 조회 실패·잘못된 응답·시간 초과·다른 조회와의 경합은 모의 회귀 시험으로 검증한다.

- `openSubscriptionManagement`: 호출자는 설정 `handleManageSub`와 신규 카드 2곳. iOS/Android 기존 기본 이동과 명시 store 이동을 모의시험한다.
- `funnelSchema`: 기존 함수 구현은 유지하고 허용 stage/source만 추가한다. 실행 호출자는 `funnel.ts`의 `outcomeStage`, `funnelBeacon.ts`의 정규화·validator, `/api/funnel-hit`의 validator·키·날짜 함수, `signalTap.ts`의 `isFunnelSrc`, 앱 `layout.tsx`·`signalSync.ts`의 `etDay`다. 타입 참조는 `ProPaywall`, `RedeemCodeLink`, `ValueWall`, `useProStatus`, `couponGuide`, `firstRunValue`, `onboardingConfig`, `redeem`에도 있다. 구매·복원·푸시 출처 동작은 기존 시험으로 검증한다. `mkt-funnel.js` 목록 동등성도 기존 시험 대상이다.
- 신규 시험: `tests/trialConsent.test.ts`(판정·문구·가격·7일 저장·비동기 경합), `tests/trialConsentIntegration.test.ts`(SDK·서버 스위치·관리 이동·비콘·집계 라우트), `tests/trialConsentRegression.test.ts`(캐시 무효화·진입 수명·스위치 실패 및 경합), `tests/trialConsentLifecycle.test.ts`(컴포넌트의 네이티브/가시성 이벤트 연결·중복 억제·리스너 정리). SDK·Redis·네트워크는 모두 모의 객체를 사용한다.
- 관련 회귀: `funnel`, `couponSubscribe`, `coupon`, `todayPicks`, `firstRunValue`, `pushAiLine`, `signals.copy`, `signals.app`.
- 브라우저·실기기·실결제·스토어 동의 시트 검증은 작업 제한으로 수행하지 않는다. `.env*` 읽기·운영 쓰기·push·배포도 하지 않는다.

## 이전 작업의 로컬 검증 기록

- 신규 판정·문구·컨트롤러 시험 25개, SDK·스위치·계측 통합 시험 13개 통과.
- 관련 기존 시험 217개 통과: `funnel` 15, `couponSubscribe` 24, `coupon` 32, `todayPicks` 40, `firstRunValue` 44, `pushAiLine` 28, `signals.copy` 18, `signals.app` 16. 합계 **255개 통과**.
- 신규 TypeScript 소스·퍼널 스키마·신규 시험 ESLint, `node --check scripts/mkt-funnel.js`, `git diff --check` 통과. 시험 프로세스에서 실제 네트워크와 `.env*` 파일 읽기를 차단했다.
- 전체 타입 검사: `/usr/bin/lockf -k /tmp/signum-heavy.lock npx tsc --noEmit -p .`를 재개 작업에서 **한 번만** 실행했다. 종료 코드 2, 새 오류 **0건**. 사전에 알려진 `src/remotion/kit/scripts.ts:5004`의 `TS2307` (`./scripts-jpweek` 모듈 누락) **1건**만 출력됐다. 이 기존 오류 때문에 전체 tsc 자체가 성공한 것은 아니다.
- 관련 시험 묶음과 ESLint도 같은 `/tmp/signum-heavy.lock`을 사용해 순차 실행했다. 브라우저·스토어·운영 데이터 접근 없이 검증했다.

## 이번 보완의 로컬 검증 결과

- 설정 경유 해지 후 첫 진입 재현 시험: 수정 전에는 무효화 없이 `getCustomerInfo`만 호출하여 실패함을 확인했다.
- 수정 후 관련 시험 **73개 통과**: 판정/컨트롤러 25, SDK/서버 통합 13, 캐시/스위치 회귀 17, 컴포넌트 이벤트 3, 퍼널 15. 최초 진입·설정 경유 재진입·관리/백그라운드 복귀·중복 이벤트·무효화 실패·시간 초과·이전 진입의 늦은 응답을 포함한다.
- 변경 TypeScript 파일 5개의 ESLint와 `git diff --check` 통과. 시험·ESLint는 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 순차 실행했고, 실제 네트워크 및 `.env*` 읽기를 차단한 상태에서 검증했다.
- 전체 타입 검사: `/usr/bin/lockf -k /tmp/signum-heavy.lock node -r /tmp/trial-consent-offline-guard.cjs node_modules/typescript/bin/tsc --noEmit -p .`를 **1회** 실행했다. 종료 코드 2. 출력은 기존 `src/remotion/kit/scripts.ts:5004`의 `TS2307` (`./scripts-jpweek` 누락) 1건뿐이며 이번 변경 오류는 없었다. 전체 타입 검사 성공으로 보고하지 않는다.
