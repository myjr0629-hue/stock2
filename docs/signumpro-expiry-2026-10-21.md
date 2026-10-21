# SIGNUMPRO 만료 연장 및 Android 링크 추적

## 결과 요약

- 원인: `isLivePromoCode()`가 채널 목록·형식 규칙에 동일한 만료를 적용했다. SIGNUMPRO도 형식 규칙으로만 통과해 10/31에 유효 판정이 종료되는 구조였다.
- 정규화 후 코드별 만료를 먼저 확인하도록 수정했다. SIGNUMPRO는 `2027-01-01T08:00:00Z` 이전까지 유효하다. 이는 애플 만료일 2026-12-31이 끝나는 태평양시 자정이다. 경계 시각부터는 무효다.
- 기존 채널 8종·형식 규칙의 만료 `2026-10-31T07:00:00Z`와 소문자·공백 정규화는 유지했다.
- 화면 문구·라벨·배치와 Android 동작은 수정하지 않았다.

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

- `tests/signumproExpiry.test.ts`: 159건 통과. SIGNUMPRO 10/31 전·후, 12/31 시작·종료 경계, 최종 만료 직전·정각·직후, 소문자·공백 정규화, 기존 채널 8종·형식 규칙 최소·최대 길이의 10/31 경계, 카드 선택·선물 설정·기존 Play 만료 유지 검증.
- 기존 `tests/redeemLinkPreview.test.ts`: 41건 통과.
- 기존 `tests/gift.test.ts`: 종료 코드 0.
- 기존 `tests/coupon.test.ts`: 32건 통과.
- 시험은 로컬 모의 저장소를 사용했다. 실제 Redis·DB·외부 API 쓰기는 하지 않았다. 기존 코드 값은 소스·기존 시험에서 재사용하며 새 파일·로그에 복제하지 않았다.
- `/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --noEmit --incremental false`: 1회 실행, 종료 코드 0.
- `git diff --check`: 통과.

## 남은 위험

- 기존 쿠폰 화면·프로모션 카드 문구의 `10/30` 날짜는 고정돼 있다. 이번 작업은 표시 변경 금지 조건에 따라 그대로 유지했다. 연장된 SIGNUMPRO의 실제 만료와 화면 문구가 불일치한다.
- SIGNUMFREE 링크에서 설치 후 앱 안 입력까지 이어 주는 전용 안내·자동 전달은 없다. 이번 작업의 Android 범위는 추적·보고뿐이다.
- 운영 기능 설정, 스토어의 실제 코드 적용·결제, 실기기 이동은 확인하지 않았다. 위 Android 결과는 소스의 조건 분기를 추적한 결과다.
