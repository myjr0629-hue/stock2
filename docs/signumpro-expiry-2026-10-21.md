# SIGNUMPRO 만료 연장 및 Android 링크 추적

## 결과 요약

- 원인: `isLivePromoCode()`가 채널 목록·형식 규칙에 동일한 만료를 적용했다. SIGNUMPRO도 형식 규칙으로만 통과해 10/31에 유효 판정이 종료되는 구조였다.
- 정규화 후 코드별 만료 정보로 판정하도록 수정했다. SIGNUMPRO는 `2027-01-01T08:00:00Z` 이전까지 유효하다. 이는 애플 만료일 2026-12-31이 끝나는 태평양시 자정이다. 경계 시각부터는 무효다.
- 기존 채널 8종·형식 규칙의 만료 `2026-10-31T07:00:00Z`와 소문자·공백 정규화는 유지했다.
- 관문 보류 수리: 쿠폰 화면·PC 안내·링크 카드 제목 및 카드 이미지의 날짜를 코드별 애플 만료 정보에서 계산한다. SIGNUMPRO는 12/30, 기존 코드는 10/30이다. 문구 틀·라벨·배치는 유지한다. Android는 기존 Play 만료와 10/30 표시를 유지한다.

## 관문 보류 수리: 날짜 표시

- 확인한 원인: 유효 판정은 연장됐지만 `couponSubline()`의 언어별 부제와 `PROMO_COPY` 제목은 고정된 10/30을 사용했다. 정적 `redeem-card-*.png`에도 10/30이 들어 있었다.
- `promoExpiry.ts`에 애플 만료일과 기존 유효 판정을 모았다. SIGNUMPRO의 애플 만료일은 2026-12-31, 유효 판정 경계는 이전 커밋과 같은 2027-01-01 08:00 UTC다. 기존 코드는 애플 만료일 2026-10-31, 경계 2026-10-31 07:00 UTC다. 표시만 애플 만료일의 전날을 PT 달력 기준으로 계산한다.
- 영어 쿠폰·PC 부제는 기존 NBSP, 카드 제목은 일반 공백을 유지한다. 날짜 외 HTML은 수정 전 커밋 `95fe06579`의 템플릿과 메모리에서 비교한다. 기존 채널 코드·형식 시험 값은 파일·로그로 복제하지 않는다.
- SIGNUMPRO 카드 이미지는 `/api/og/promo`가 원본 PNG 위 날짜 영역만 계산해 그린다. 기존 코드의 이미지 주소·PNG 파일은 그대로다. 배지 밖 문구·화면 캡처·배치에는 변경이 없다. 이미지에 코드를 새로 쓰지 않는다.

| 공유 함수의 직접 호출자 | 영향 및 검증 |
| --- | --- |
| `promoExpiry()` → `isLivePromoCode()`, `promoExpiryDate()` | 유효 판정과 날짜 표시가 같은 만료 정의를 사용한다. 기존 만료 경계 회귀 시험으로 판정 유지 확인. |
| `promoExpiryDate()` → `promoCopy()`, 카드 이미지 주소 선택, `couponSubline()`, 새 이미지 GET | SIGNUMPRO 날짜만 12/30으로 계산. ko/en/ja의 기존 날짜 문구 바이트 비교. |
| `couponSubline()` → `couponHtml()`, `desktopRedeemHtml()` | 쿠폰 화면·PC 안내에 같은 날짜가 전달된다. Android는 기존 별도 만료를 사용한다. |
| `previewHtml()` → `/app`, `/app-uc`, `/app-wim`, `giftShare/landing.ts` | `/app`의 일반 프로모션만 canonical URL의 코드를 읽어 날짜·이미지를 선택한다. UC·WIM 및 프로모션이 아닌 선물 토큰 카드는 기존 경로다. |
| `couponHtml()`, `desktopRedeemHtml()` → `/app`, `giftShare/landing.ts` | 일반 코드 링크만 날짜가 바뀐다. 선물 토큰은 기존 날짜 없는 전용 부제·카드를 유지한다. |
| `isLivePromoCode()` → `/app`의 봇·모바일·PC 분기, `giftConfig()` | 유효 판정 경계는 이전과 같다. 하단의 모든 기존 호출자·간접 호출자 추적도 유효하다. |

## 바꾼 파일: 관문 보류 수리

- `src/lib/marketing/promoExpiry.ts`: 코드별 애플 만료·기존 유효 경계·날짜 계산.
- `src/lib/marketing/linkPreview.ts`: 코드별 카드 제목·이미지 선택 및 공통 만료 정의 사용.
- `src/lib/marketing/couponHtml.ts`: 날짜 값만 계산해 기존 언어별 부제에 삽입.
- `src/app/api/og/promo/route.ts`: 원본 카드 이미지의 날짜 영역만 생성.
- `tests/signumproExpiry.test.ts`: 코드별 날짜가 반영된 카드 기대값.
- `tests/signumproExpiryDisplay.test.ts`: 이전 HTML 바이트 비교·실제 GET·카드 픽셀 회귀.
- `docs/signumpro-expiry-2026-10-21.md`: 원인·호출자 영향·시험·권한 차단 기록.

## 관문 2차 보류 수리: canonical 파싱

- 확인한 원인: `previewHtml()`의 일반 SIGNUM 프로모션 분기가 `new URL(canonical)`을 보호 없이 실행했다. 기존 `invite.test.ts`의 상대 값 입력은 여기서 예외가 발생해 뒤의 추천 시험까지 중단됐다.
- 파싱이 실패하면 코드 값을 `null`로 유지해 기존 기본 프로모션 제목·이미지로 내려간다. canonical 자체와 반환 HTML 템플릿은 바꾸지 않았다. 정상 SIGNUMPRO 링크의 ko/en/ja 12/30 표시는 유지한다.
- 운영 직접 호출자 전체는 `/app`, `/app-uc`, `/app-wim`, `giftShare/landing.ts`의 4곳이다. `/app`만 프로모션 코드 파싱을 사용하며, UC·WIM·선물 토큰 경로는 기존 카드 분기를 유지한다. 추천·스마트링크·카드·선물 회귀와 앱·언어·분기별 HTML 비교로 영향을 검증했다.
- 이번 수정 파일은 `src/lib/marketing/linkPreview.ts`, `tests/linkPreviewCanonical.test.ts`, 이 문서다.
- `tests/invite.test.ts`: 추천 시험 전체 104개 통과. 시험 파일은 origin/main과 바이트 동일하다.
- 신규 만료·날짜 시험은 기존 건수를 유지해 159+494=653건 통과했다. 별도 canonical 회귀 270건은 빈 값·상대 경로·비정상 URL의 HTML을 origin/main과 바이트 비교했다(앱 3종·언어 3종·프로모션 여부·초대 분기).
- 추가 회귀: 카드 41건·PC 안내 5건·쿠폰 32건·스마트링크 21건·선물 경로 18건 통과. `inviteLanding.test.ts`, `gift.test.ts`는 종료 코드 0이다. 모든 시험은 잠금으로 직렬 실행했으며 실제 저장소·외부 API 쓰기는 하지 않았다.
- `/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --noEmit --incremental false`: 이번 수리에서 1회 실행, 종료 코드 0. 변경 파일 3개의 비밀값 검사와 `git diff --check`도 통과했다.
- origin/main 별도 임시 사본의 전체 추천 실행은 종료 코드 1로 끝났다. 실행 결과 수집에서 실패 상세를 보존하지 못해 원인과 통과 건수 직접 대조는 미완료다. 임시 사본의 의존성 초기화 성공까지만 추가 확인했으며 같은 시험 묶음은 재실행하지 않았다. 현재 브랜치의 104개 통과 및 HTML 270건 바이트 비교와 구분한다.
- 이번 수리도 `git add`가 공용 Git 디렉터리의 `worktrees/feat-signumpro-expiry/index.lock` 생성 권한 오류(`Operation not permitted`)로 차단됐다. 커밋은 생성하지 못했으며 수정 파일은 작업공간에 보존했다. push는 하지 않았다.

## Android 동작: 코드로 확인한 사실

대상은 `gift` 등 다른 매개변수가 없는 `/app?code=SIGNUMPRO`, `/app?code=SIGNUMFREE`다. 운영 환경변수와 실기기는 확인하지 않았다.

| 링크·조건 | 응답과 다음 동작 |
| --- | --- |
| SIGNUMPRO + `COUPON_ANDROID=1` + `2026-10-31T00:00:00Z` 이전 | 200 쿠폰 HTML. «내 쿠폰 받기»가 `/api/coupon/claim`에 별도 일회용 Play 번호를 요청한다. SIGNUMPRO를 Play에서 사용하는 흐름이 아니다. |
| SIGNUMPRO + 위 조건 불충족 | 일반 Android 브라우저는 Play 앱 상세 설치 주소로 302. 판별된 외부 앱 내 브라우저는 200 설치 안내 HTML에서 «Play 스토어에서 열기»를 제공한다. |
| SIGNUMFREE | 유효 애플 코드 목록·형식 규칙에 포함되지 않는다. Android 쿠폰 기능이 켜져 있어도 위 설치 경로로 간다. |
| 두 링크의 설치 경로 | 코드 값을 Play로 전달하지 않는다. 질문의 URL처럼 `from`도 없으면 설치 리퍼러 없이 앱 상세 주소로 간다. `from`이 있으면 출처 리퍼러와 `utm_content=code`만 붙는다. |

쿠폰 화면 생성에 실패해도 설치 경로로 내려간다. 외부 앱 내 설치 안내 생성까지 실패하면 Play 상세 주소로 302한다. 자체 네이티브 앱 요청은 외부 앱 내 브라우저 판별에서 제외한다.

따라서 10/31 00:00 UTC부터 Android의 SIGNUMPRO도 설치 경로다. 이번 애플 코드 연장은 기존 일회용 Play 프로모션 종료를 연장하지 않는다.

SIGNUMFREE는 사용자 제공 조건상 Play 맞춤 코드이므로 앱 안에서 사용해야 한다. 현재 링크는 해당 코드의 자동 적용이나 전용 입력 안내를 제공하지 않는다. 기존 앱의 경로는 다음과 같다.

1. PRO 미구독 상태의 네이티브 앱에서 설정 → «쿠폰 코드 입력».
2. `openRedeem()`의 Android 분기가 안내 시트를 연다.
3. «계속» → 기존 월간 구독 구매 경로 → Google 결제 창.
4. 결제 수단 → 코드 사용 → SIGNUMFREE 입력 → 무료 기간 확인 → 구독.

확인 위치: `src/app/app/route.ts`의 코드 정규화·쿠폰 분기·Android 설치 분기, `src/lib/marketing/coupon.ts`의 `androidCouponLive()`, `src/lib/marketing/couponHtml.ts`의 개인 번호 발급 화면, `src/lib/marketing/androidInApp.ts`의 설치 안내, `src/lib/marketing/storeRedirect.ts`의 리퍼러 구성, `src/app/[locale]/app-view/settings/page.tsx`, `src/lib/app/redeem.ts`, `src/components/app/CouponGuideSheet.tsx`, `src/lib/app/couponGuide.ts`.

## 모든 직접 호출자와 영향

| 호출자 | 영향·검증 |
| --- | --- |
| `src/app/app/route.ts`: 봇 카드의 `promo` | SIGNUMPRO 프로모션 카드 판정만 연말까지 연장. 새 시험에서 이전·이후·최종 경계의 카드 선택 확인. |
| 같은 라우트: 모바일 쿠폰 화면 조건 | iOS 쿠폰 화면 판정 연장. Android는 별도 기능·만료 조건을 계속 적용. 기존 쿠폰 시험 통과. |
| 같은 라우트: PC의 `coupon`, `androidCoupon` | PC 쿠폰 안내 판정 연장. Android 조건은 유지. |
| `src/lib/gift/giftConfig.ts`: 선물 코드 유효 판정 | 설정된 코드가 SIGNUMPRO일 경우에만 연장. 실제 설정값은 조회하지 않음. 새 시험에서 SIGNUMPRO 설정의 정규화·만료 검증, 기존 선물 시험 통과. |
| `tests/redeemLinkPreview.test.ts`, `tests/gift.test.ts`, 새 만료 시험 | 운영 호출자가 아닌 회귀 검증 호출자. 모두 통과. |

`giftConfig()`를 실제 호출하는 곳은 `/api/gift/config`, `/api/invite/config`, `src/app/[locale]/s/[kind]/[ticker]/page.tsx`의 공유 상세 페이지다. 선물 설정이 SIGNUMPRO인 경우 API 응답과 공유 페이지에서 전달하는 선물 설정도 연장된 유효 판정을 따른다. 다른 코드의 동작은 그대로다. `src/lib/invite/landing.ts`는 전달받은 선물 설정을 사용하며 `giftConfig()`를 직접 호출하지 않는다. `/app-uc`, `/app-wim`은 링크 미리보기 모듈을 쓰지만 `isLivePromoCode()` 호출자는 아니다.

## 돌린 시험과 결과

### 이번 관문 보류 수리

- `tests/signumproExpiryDisplay.test.ts`: 494건 통과. 실제 `/app` GET으로 SIGNUMPRO 10/21·11/15·12/30·최종 만료 직전·정각·직후의 쿠폰 화면·PC 안내·카드를 ko/en/ja 모두 검증했다.
- 기존 채널 8종·형식 시험의 기존 코드에 대해 3개 언어 쿠폰·PC·카드 전체 HTML이 수정 전 커밋과 바이트 동일함을 검증했다. SIGNUMPRO는 날짜와 카드 이미지 주소 외 바이트 동일하다. Android의 기존 10/30 표시·별도 만료는 유지한다.
- 새 카드 이미지 GET은 3개 언어 PNG 생성 및 1200×675 크기를 검증했다. 원본과 픽셀 비교해 날짜 영역 밖 변경이 0임을 확인했다. 기본 만료 응답의 PNG는 원본과 바이트 동일하다. 생성한 PNG 3개 언어는 로컬 이미지로 확인했다(브라우저 접근 없음).
- `tests/signumproExpiry.test.ts`: 159건 통과.
- 공유 호출자 회귀: 카드 41건·PC 안내 5건·쿠폰 32건·스마트링크 21건 통과. `gift.test.ts`, `giftShare.test.ts` 종료 코드 0.
- `/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --noEmit --incremental false`: 이번 수리에서 1회 실행, 종료 코드 0. 회귀 묶음도 같은 잠금으로 직렬 실행했으며 외부 작업공간의 점유는 대기했다.
- `git diff --check` 및 새 파일 3개의 공백·마지막 개행 검사 통과.

### 기존 만료 연장 작업

- `tests/signumproExpiry.test.ts`: 159건 통과. SIGNUMPRO 10/31 전·후, 12/31 시작·종료 경계, 최종 만료 직전·정각·직후, 소문자·공백 정규화, 기존 채널 8종·형식 규칙 최소·최대 길이의 10/31 경계, 카드 선택·선물 설정·기존 Play 만료 유지 검증.
- 기존 `tests/redeemLinkPreview.test.ts`: 41건 통과.
- 기존 `tests/gift.test.ts`: 종료 코드 0.
- 기존 `tests/coupon.test.ts`: 32건 통과.
- 시험은 로컬 모의 저장소를 사용했다. 실제 Redis·DB·외부 API 쓰기는 하지 않았다. 기존 코드 값은 소스·기존 시험에서 재사용하며 새 파일·로그에 복제하지 않았다.
- `/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --noEmit --incremental false`: 1회 실행, 종료 코드 0.
- `git diff --check`: 통과.

## 남은 위험

- 브랜치는 `feat/signumpro-expiry`로 확인했다. `git add`는 공용 Git 디렉터리의 `worktrees/feat-signumpro-expiry/index.lock` 생성에서 `Operation not permitted`로 차단됐다. 작업 파일은 보존했으며 커밋은 생성하지 못했다.
- 새 카드 이미지 GET의 로컬 PNG 생성·날짜 외 픽셀 동일성은 확인했다. Vercel의 파일 추적·실제 배포 응답·외부 서비스의 기존 카드 캐시 갱신은 미확인이다.
- SIGNUMFREE 링크에서 설치 후 앱 안 입력까지 이어 주는 전용 안내·자동 전달은 없다. 이번 작업의 Android 범위는 추적·보고뿐이다.
- 운영 기능 설정, 스토어의 실제 코드 적용·결제, 실기기 이동은 확인하지 않았다. 위 Android 결과는 소스의 조건 분기를 추적한 결과다.
