# 구독(광고제거) 완성 상태 — 2026-09-02

목표: SIGNUM HQ 월 $9.99 광고제거 구독. **iOS + Android 둘 다.**

## ✅ 끝난 것

### App Store Connect
- 구독 그룹 `SIGNUM Pro` (22205273)
- 상품 `com.signumhq.app.pro.monthly` · ONE_MONTH · **$9.99**
- 로컬라이즈 en/ja/ko · 132개국
- 계약/세금/은행 전부 Active (Mercury)

### RevenueCat (프로젝트 `a3ecb903`)
- 앱 2개: **App Store** `app7f551606c7` · **Play Store** `appd4dec97703`
- 공개 SDK 키 (클라이언트용, 노출 안전):
  - iOS `appl_NKiYruEquwITCAhjAMISlSwxRLp`
  - Android `goog_LpSnGzIPoxIhCshiLAgQRtKNHQg`
- **인앱 구매 키(StoreKit 2)** `87QMN2Z3Z9.p8` — Valid ✅ (이게 없으면 v5+ 에서 거래가 기록 안 됨)
- **App Store Connect API 키** `2LD2B7366M` — **Valid ✅ (2026-09-02 내가 등록)**
- 상품 `com.signumhq.app.pro.monthly` 등록 ✅
- Entitlement **`pro`** ← 상품 연결 ✅ (코드의 `PRO_ENTITLEMENT_ID` 와 일치)
- Offering **`default`** / 패키지 **`$rc_monthly`** → 상품 ✅
  (코드가 `offerings.current` 에서 `packageType==='MONTHLY'` 로 찾는다)

### 코드 (이미 완성돼 있던 것)
- `@revenuecat/purchases-capacitor ^13.2.1` 설치
- `src/config/iap.ts` — `IAP_LIVE` 단일 게이트, 상품ID, `LAUNCH_PLANS=['monthly']`
- `src/hooks/useProStatus.ts` — isPro/offers/purchase/restore + 실시간 리스너
- `src/services/revenueCat.ts` — 패키지 매칭(타입 → 상품ID 순)
- `adManager.setPro()` — 구독자에겐 광고 억제(콜드스타트 깜빡임까지 방지)
- 설정 화면에 업그레이드/복원/관리 행

## ✅ 2026-09-02 밤에 추가로 끝낸 것

### 페이월 화면 (`src/components/app/ProPaywall.tsx`)
- 결제 «전에» 한 화면에 전부: 상품명·기간·가격·포함내용·자동갱신/해지·복원·약관·개인정보·닫기(44×44)
- **글래스모피즘** — 반투명 + `backdrop-filter: blur(30px) saturate(150%)` + 상단 안쪽 하이라이트.
  뒤에 앱 화면이 비쳐서 «떠 있는 카드»로 읽힌다. CTA 만 불투명하게 남겨 누를 곳을 분명히 했다.
- 가운데 뜨는 **팝업 카드**(전체화면 시트 아님) — 광고 제거 하나 사는 데 전체화면은 무겁다
- CTA 문구 = **결과**(「광고 없이 보기」/「Go ad-free」) — 조사상 「구독하기」류보다 전환이 높다
- ko/en/ja · `IAP_LIVE=false` 인 동안 렌더 안 됨

### 진입점 — 설정 하나뿐이던 것을 «마찰이 일어난 자리»로 옮김
- **ValueWall**(cmd·dash·flow·guardian 4개 화면에 붙어 있음)의 «광고 없이 보기» → 페이월
  광고가 실제로 방해한 순간이 전환이 일어나는 자리다
- 설정 행 → 페이월 (기존 «바로 결제» 는 3.1.2 위반이라 제거)

### ⚠️ 고친 컴플라이언스 버그 2개
1. **ValueWall 에 `월 $9.99` 가 하드코딩**돼 있었다 → 한국은 ₩13,000 인데 $9.99 로 표시하면
   가격표시 위반. 문구에서 가격을 빼고 페이월이 스토어 값을 보여주게 했다.
2. **ASC 구독 설명이 「모든 프리미엄 지표 잠금 해제」** 라고 돼 있었다 → 우리는 광고만 제거하고
   잠기는 지표가 없다. 허위 기재이자 페이월 문구와 모순. 3개 로케일 전부 사실대로 수정.
   (영문 설명은 **55자 제한** — `Removes every ad. Same data, same features.` 43자)

### App Store Connect — 구독 필수 항목 전부 채움
| 항목 | 상태 |
|---|---|
| 로컬라이제이션 ko/en/ja | ✅ (설명 사실대로 수정) |
| 가격 | ✅ 175개국 |
| **판매 국가(availability)** | ✅ **비어 있었다 — 이게 진짜 원인** |
| **심사 스크린샷** | ✅ 페이월 1179×2556 업로드, `COMPLETE` |
| **심사 메모(reviewNote)** | ✅ 광고만 제거함을 명시 + 화면 찾는 경로 |

### ★★ 그리고 마지막 열쇠 — 구독 «그룹» 로컬라이제이션

상품 쪽을 전부 채워도 `MISSING_METADATA` 가 안 풀렸다. 그룹이 비어 있었다
(`/subscriptionGroups/22205273/subscriptionGroupLocalizations` → **0건**).
en-US/ko/ja 3개를 만들자마자 **`READY_TO_SUBMIT`** 으로 바뀌었다.

**구독은 «상품»과 «그룹» 두 층이다. 상품만 보면 영원히 못 찾는다.**

> **현재 상태: `READY_TO_SUBMIT`** ✅ (2026-09-02 확인)

### Android
RevenueCat 플러그인(`purchases-hybrid-common 18.18.0`)이 Play Billing 을 **자동으로 끌어온다**.
병합 매니페스트에 `com.android.vending.BILLING` 이 **이미 있다**(실측). 코드 변경 불필요 —
이 빌드를 아무 트랙에나 올리면 Play 에서 구독상품 생성이 열린다.

### 스크린샷 다시 찍는 법
```bash
npm run dev
node scripts/_shoot-paywall.js /tmp/paywall-en.png http://localhost:3000/en/paywall-preview
```
`/[locale]/paywall-preview` 는 **운영에서 렌더되지 않는다**(NODE_ENV 가드).

## ✅ Android 도 완료 (2026-09-02)

### ★ 새 빌드가 필요 없었다
Play 구독상품 생성이 막혀 있다고 알고 있었는데(«빌링 빌드가 먼저» 라는 기록),
실제로 열려 있었다. 이유:

| 시점 | 일 |
|---|---|
| 2026-07-29 | RevenueCat 플러그인을 `capacitor.settings.gradle` 에 등록 |
| 2026-08-20 | versionCode 4 빌드 → **Play 라이브 1.2.1** |

**라이브 빌드가 플러그인 등록 «이후»에 만들어졌다** → Play Billing 이 이미 들어있다.
(병합 매니페스트에 `com.android.vending.BILLING` 실측 확인)

### Play Console
- 구독 `com.signumhq.app.pro.monthly` 생성
- 기본 요금제 `monthly` · 월간 자동갱신 · 유예 7일 · 계정보류 53일
- 가격 **$9.99** → 177개국 자동 환산(호주 AUD 14.99 등)
- **상태: Active** ✅

### RevenueCat
- Play 상품 `com.signumhq.app.pro.monthly:monthly` 등록
- Entitlement `pro` 에 연결
- Offering `default` 의 `$rc_monthly` 패키지에 **iOS·Android 둘 다** 연결 ✅

### ★ 이 앱은 «원격 웹셸» 이다
`capacitor.config.ts` 의 `server.url = https://www.signumhq.com/en/app-view/dash`.
→ **페이월 UI 는 Vercel 배포만으로 즉시 반영된다.** 네이티브 빌드는 결제 플러그인 때문에만 필요하고,
그건 이미 라이브에 들어있다.

### Vercel 환경변수
`NEXT_PUBLIC_RC_IOS_KEY` · `NEXT_PUBLIC_RC_ANDROID_KEY` → production/preview/development 6건 등록 ✅

> ⚠️ **`vercel link` 가 자동으로 `env pull` 을 돌린다.** `.env.local` 이 덮인다.
> 이번엔 내용이 같아서 무사했지만, 다음엔 **링크 전에 `.env.local` 을 백업**할 것.

## ✅ iOS 빌드·제출 완료 (2026-09-02)

```
1.5 (build 6) → WAITING_FOR_REVIEW
```

### 절차 (그대로 재현 가능)
```bash
# 버전 범프: project.pbxproj 의 MARKETING_VERSION / CURRENT_PROJECT_VERSION
cd ios/App
xcodebuild -project App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath /tmp/X.xcarchive archive -allowProvisioningUpdates
xcodebuild -exportArchive -archivePath /tmp/X.xcarchive -exportPath /tmp/X-export \
  -exportOptionsPlist /tmp/ExportOptions.plist -allowProvisioningUpdates
xcrun altool --upload-app -f /tmp/X-export/App.ipa -t ios \
  --apiKey 2LD2B7366M --apiIssuer ede31c44-c5ac-437b-ab19-ad5d581ef6f9
```

### ★ 함정 1 — 아카이브는 «개발» 서명으로 나온다
`codesign -dvvv .../App.app` 이 `Apple Development` 를 보여준다. 정상이다.
export 단계에서 배포 서명으로 «재서명»되는데, `signingStyle=automatic` 은
낡은 프로파일(`iOS Team Store Provisioning Profile`)을 집어 실패한다:

> Provisioning profile ... doesn't include signing certificate "Apple Distribution: ..."

**해결: 프로파일을 명시한다.**
```xml
<key>signingStyle</key><string>manual</string>
<key>signingCertificate</key><string>Apple Distribution</string>
<key>provisioningProfiles</key><dict>
  <key>com.signumhq.app</key><string>SIGNUM HQ AppStore 2026</string>
</dict>
```
프로파일은 `~/Library/Developer/Xcode/UserData/Provisioning Profiles/` 에 있다
(구 경로 `~/Library/MobileDevice/…` 는 **비어 있다** — 여기만 보면 «0개»로 오진한다).
**export 후 반드시 `codesign -dvvv` 로 `Apple Distribution` 확인.**

### ★ 함정 2 — 업로드한 빌드가 «안 보인다»
`/apps/{id}/builds` 에는 새 빌드가 안 나온다. 10분을 기다려도 안 나왔다.
**`/builds?filter[app]={id}&sort=-uploadedDate` 로 조회하면 바로 보인다.**

### ★ 함정 3 — 구독은 API 로 제출에 못 넣는다
`reviewSubmissionItems` 에 subscription 관계가 **없다**(`subscription`,
`subscriptions`, `inAppPurchase`, `inAppPurchaseV2` 전부 거부).
앱 버전만 제출되고 구독은 `READY_TO_SUBMIT` 에 남는다.
→ 애플이 버전 심사 때 함께 볼 수도 있고, 아니면 **웹 UI 에서 한 번 체크**해야 한다.

## ⛔ 남은 것

| # | 무엇 | 누가 | 비고 |
|---|---|---|---|
| 1 | **페이월 화면** | 나 | 지금은 설정에서 «바로 결제» — 애플 3.1.2 위반. 가격·기간·약관을 결제 전에 보여야 한다 |
| 2 | Vercel 환경변수 2개 | 나 | `NEXT_PUBLIC_RC_IOS_KEY` · `NEXT_PUBLIC_RC_ANDROID_KEY` |
| 3 | ASC `MISSING_METADATA` 해소 | 나 | 심사용 스크린샷 필요 |
| 4 | **Android Play Billing** | 나 | 빌드에 빌링 라이브러리 → 그래야 Play 에서 구독상품 «생성 버튼»이 열린다 |
| 5 | Play 구독상품 생성 | 나 | 4번 빌드를 아무 트랙에나 올린 뒤 |
| 6 | 실기기 구매·복원 테스트 | 나+대표 | 시뮬/에뮬로 1차, 실기기 최종 |
| 7 | `IAP_LIVE = true` | 나 | 위가 전부 검증된 뒤에만 |

## ⚠️ 설계 결정 — 무료체험은 «넣지 않는다»

애플이 2026-01부터 트라이얼 페이월을 **3.1.2 로 대량 반려**한다(명시 CTA + 3행
타임라인 필수, 그리고 **5일차 알림을 실제로 보내야** 한다). 체험 없이 월정액만
내보내면 요건이 «가격·기간·해지 안내» 로 단순해지고 심사 표면적이 줄어든다.
체험은 나중에 별도 실험으로 붙인다. [[paywall-hard-gates-ios-trial-and-korea-law]]

## ⚠️ 한국 — 과금 전 선결 (내가 못 하는 것)

유료 티어가 «유사투자자문업» 인지 변호사 판단이 필요하다.
구조적 방어 = 유료 티어를 **단방향**으로 유지(인앱 채팅·1:1 Q&A 금지).
