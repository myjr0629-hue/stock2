# SIGNUM v1.1 — Native Binary Assembly (turnkey)

**Status as of 2026-07-10:** All *web* pieces of v1.1 are DONE, deployed, and dormant.
This doc is the remaining *native binary* work — it needs a real device and cannot be
finished from the web alone. Do it in ONE pass when ready to ship v1.1.

Shell repo root = SIGNUM shell (`capacitor.config.ts`, `appId com.signumhq.app`).
Loads remote `https://www.signumhq.com/en/app-view/dash` (remote webview).

---

## What already shipped to web (live now, inert until this binary)

1. **Ad-removal subscription UI** — `ValueWall.tsx` + `settings/page.tsx`, all gated by
   `IAP_LIVE` in `src/config/iap.ts` (currently `false`). RevenueCat via
   `@revenuecat/purchases-capacitor` (already in root `package.json`). Verified inert on
   the simulator: no Pro card renders while `IAP_LIVE=false`.
2. **In-app review** — `capacitorBridge.ts` (`canRequestReview/requestAppReview/maybePromptReview`)
   via the runtime `Capacitor.Plugins.InAppReview` bridge. Settings "Rate app" row +
   dash auto-prompt (3rd/8th distinct day). **No-op until the plugin below is compiled in.**
3. **Push cold-start deep-link hardening** — `app-view/layout.tsx` persists the tapped
   target to `sessionStorage['signumhq.pendingDeepLink']`; `NativeAppProvider.tsx` polls
   ~2.4s after launch and re-applies it so the root→/dash launch redirect can't clobber it.
   (Plugin already buffers the tap: `retainUntilConsumed:true` in the push plugin — so the
   native event is NOT lost; the bug was the redirect race, fixed in JS. **Confirm on device.**)

---

## Native step 1 — add the in-app-review plugin

```bash
cd <repo root>            # SIGNUM shell
npm i @capacitor-community/in-app-review@^8.0.0
npx cap sync ios
npx cap sync android
```

`cap sync` auto-registers the plugin. Verify it landed:
- iOS: `ios/App/App/capacitor.config.json` plugins list gains `InAppReviewPlugin`; SPM
  `Package.swift` gains `CapacitorCommunityInAppReview` (mirror UC's `uc-app/ios/...`).
- Android: `android/app/src/main/.../MainActivity` or the generated plugin list includes it.

No JS changes needed — the runtime bridge in `capacitorBridge.ts` picks it up automatically
(the settings row + auto-prompt become live once the plugin is present).

⚠️ `cap sync` pollutes `ios/App/build*` (SPM). Do NOT `git add -A` after a device build —
stage only `package.json`, `package-lock.json`, `ios/App/App/capacitor.config.json`,
`ios/App/App/Podfile*`/`Package.swift`, `android/` plugin registration. `.gitignore`
already excludes `uc-app/ios/App/build-device/`; make sure the SIGNUM `ios/App/build*` is
ignored too before committing.

---

## Native step 2 — version bump

`ios/App/App.xcodeproj/project.pbxproj` (both Debug+Release config blocks):
- `MARKETING_VERSION = 1.0` → `1.1`
- `CURRENT_PROJECT_VERSION = 1` → `2`

Android `android/app/build.gradle`: `versionCode` +1, `versionName "1.1"`.

Also flip the settings footer: `settings/page.tsx` `versionNum` `v1.0.0` → `v1.1.0`
(do this in the SAME deploy that the v1.1 binary goes live, not before — web is shared
with current v1.0 users).

---

## Native step 2.5 — Android WebView 하드닝 (2026-07-14, 사용자 요청)

두 개의 Android-전용 WebView 이슈를 이 바이너리에서 근본 해결. **iOS는 무관**(WKWebView가 알아서 처리).

**(a) ★ 큰 폰트 사용자 레이아웃 깨짐 → `textZoom = 100` 고정 (사용자 확정 = "가장 깔끔")**
- 증상: 시스템 글꼴 크기를 크게 설정한 사용자에게 고정 px 레이아웃(헤더·카드·행)이 넘침·겹침·잘림.
- 원인: **Android WebView는 시스템 글꼴 배율을 웹 콘텐츠에 곱함**(iOS 웹뷰는 기본 무시 → 그래서 안드만 터짐).
- 수정: `android/app/src/main/java/.../MainActivity.java` `onCreate`에서 bridge 준비 후
  **`this.bridge.getWebView().getSettings().setTextZoom(100);`** 한 줄 → 시스템 배율 무시, CSS px 그대로.
- 트레이드오프: 큰글씨 접근성 선호를 무시(레이아웃 우선) = 밀집 데이터앱의 표준 선택. **웹만으로는 불가**(네이티브 전용 — `text-size-adjust`로 못 막음).

**(b) 상태바 세이프에어리어 — 항구책 (선택, 관련 항목)**
- 현재: `native-app.css`의 `html.native-android .app-viewport { padding-top: max(env, 24px) }` = 무업데이트 웹 임시책(배포됨). Android WebView가 `env(safe-area-inset-top)=0` 보고라 **24px는 추측값** → 기종별 오차 가능.
- 항구책: `@capacitor-community/safe-area` 플러그인 추가(`npm i` + `npx cap sync android` + 초기화) → 실 WindowInsets를 CSS 변수로 주입 → 추측 제거. 추가 후 `.app-viewport`의 24px 하드코딩을 그 변수로 교체.

**검증**: 안드로이드 **에뮬레이터(또는 실기기)** 에서 ①시스템 글꼴 최대 ②다른 상태바 높이/컷아웃 기종으로 확인. iOS 시뮬처럼 **안드 에뮬을 검증 루프에 편입**할 것(2026-07-14 논의 — 안드는 파편화라 "보면서" 확인이 iOS보다 더 필요).

> ⚠️ **UC(Undercurrent) Android 빌드도 동일 두 이슈 해당** — 같은 리모트 웹뷰 구조. UC 네이티브 업데이트 시 (a)textZoom + (b)세이프에어리어(UC 루트 `.uc-slideup`) 함께 적용.

---

## ✅ RevenueCat 사전 셋업 진행 상태 (2026-07-13, Mac 세션에서 사용자와 함께 완료)

RevenueCat 프로젝트 "SIGNUM HQ" (기존에 계정·iOS 앱은 이미 있었음 — iOS: `com.signumhq.app`,
App Store 연동됨). **오늘 완료한 것:**
- **Android 앱(Play Store) 추가**: RevenueCat Apps에 `SIGNUM HQ (Play Store)` / `com.signumhq.app`,
  App ID `appd4dec97703`. 서비스계정 JSON 업로드 완료.
- **GCP 서비스 계정 생성**: 프로젝트 `signumhq-app`(=운영/Firebase 프로젝트)에
  `revenuecat@signumhq-app.iam.gserviceaccount.com` + JSON 키(파일 `signumhq-app-d6db45751c90.json`,
  사용자 로컬 보관 — 리포/채팅에 절대 넣지 말 것). Google Play Android Developer API + Cloud Pub/Sub
  API 둘 다 이미 Enabled 확인.
- **Play Console 권한 부여**: 위 서비스계정을 Users&permissions에 초대, Account permissions =
  ①View financial data, orders, and cancellation survey responses ②Manage orders and subscriptions
  2개만 부여. 상태 Active. **→ 구글 권한 전파 타이머 시작(24~36h). 그 사이 RevenueCat 자격증명 경고는
  정상, 전파 완료되면 자동 초록불.**
- **RevenueCat 공개 API 키 2개(iOS/Android)**: Apps 화면 "Show key"에 있음 — v1.1 조립 시 Vercel env
  (`NEXT_PUBLIC_RC_IOS_KEY`/`_ANDROID_KEY`, 정확한 이름은 src/config/iap.ts 확인)에 넣을 것. Custom URL
  Scheme(rc-d4dec97703)은 딥링크용 선택사항.

**아직 안 한 것 (v1.1 조립일):** Entitlement `pro` 생성 + 양쪽 상품 연결(iOS 상품은 등록됨,
Android 상품 `pro_monthly`는 결제빌드 업로드 후에야 생성 가능 — 아래 참조). SDK는 이미 코드에 있음.

## ⚠️ Play 구독 상품 등록 — v1.0 상태에선 불가 (2026-07-13 실측)

Play Console → Monetize → Subscriptions가 "Upload a new APK"를 요구함: **결제 라이브러리
(com.android.vending.BILLING)가 포함된 빌드가 올라와 있어야 구독 상품 생성 가능** — 애플(바이너리
없이 상품 생성 가능, 이미 완료)과 반대. 따라서 Android 상품 등록은 v1.1 조립 절차의 일부:
1. Step 1(RevenueCat 플러그인 추가)+Step 2(버전 범프) 후 `bundleRelease` AAB 생성
2. **내부 테스트 트랙에 업로드** (프로덕션 아님) → Subscriptions 메뉴 잠금 해제
3. 구독 생성: ID `pro_monthly` · Base plan `monthly`(자동갱신) · $9.99 · 3언어 문구(ASC 재사용)
4. RevenueCat entitlement `pro`에 양쪽 상품 연결 → 내부 테스트 트랙에서 실기기 결제 테스트(Step 3)
5. 통과 후 같은 AAB를 프로덕션으로 승격 + iOS 제출 (Step 4)
RevenueCat 프로젝트 생성·iOS 연결·Play 서비스계정 연동은 빌드와 무관 — AdMob 대기 중 선처리 가능.

## Native step 3 — device test (StoreKit sandbox + real push) — THE GATE

Do ALL of these on a real device before flipping `IAP_LIVE` or submitting:

1. **IAP purchase+restore** (StoreKit sandbox account):
   - `IAP_LIVE=true` locally, RC keys set, product `com.signumhq.app.pro.monthly` live.
   - Buy → banner + interstitials disappear immediately; settings shows "✓ Active".
   - Delete+reinstall → Restore returns Pro. Cancel mid-purchase → no error toast.
2. **In-app review**: settings "Rate app" row appears and shows the native sheet.
3. **Push cold-start**: fully kill the app → send a `type:closing` push → tap it →
   lands on Intel (not stuck on dash). Repeat `type:morning` → Guardian brief overlay.
   Warm tap (app open) still deep-links. This validates the JS race fix on device.
4. **iOS cold-start onboarding/locale**: confirm the deep-link doesn't fight the
   first-run locale redirect.

---

## Native step 4 — go live (only AFTER step 3 passes)

1. Flip `IAP_LIVE=false → true` in `src/config/iap.ts`, set RC public keys in Vercel env
   (`NEXT_PUBLIC_RC_IOS_KEY` / `_ANDROID_KEY` — confirm exact names in `iap.ts`), deploy.
   **Never flip this before the cap-synced binary is the live build** — v1.0 users would
   get a purchase button that crashes (no RC plugin) → App Store 3.1.1 risk.
2. Paywall review screenshot for App Store Connect (the ValueWall Pro CTA + settings card).
3. Archive in Xcode (Release), upload, submit v1.1. Android: `bundleRelease` AAB, upload.
4. App Privacy unchanged (tracking = YES stays — real ad units).

---

## ASO refinement — DO THIS at the v1.1 submission (user-requested 2026-07-10)

Metadata is editable with each version, so v1.1 is the moment to reinforce the store listing
for the initial-buff. Current live listing is already solid (verified 2026-07-10):
- Name: `SIGNUM HQ: Stock Market Intel` (strong — name is the #1 search-weighted field).
- Subtitle (US): `Stocks, options & AI insights` (strong — #2 field, 3 keywords).
- Description: strong converter. NOTE: iOS does NOT index the description for search (unlike
  Play) — it only drives conversion. So keyword effort goes to name + subtitle + keyword field.

**The one field to actually improve = the hidden 100-char Keyword field** (per localization,
not public). Rule: do NOT repeat words already in that locale's name/subtitle (wasted chars);
pack differentiated high-intent terms. Ready-to-paste (each <100 chars, no space after commas):

- **en** (US/UK/global-English):
  `options flow,dark pool,gamma,GEX,max pain,unusual,whale,premarket,put call,trading,investing,ticker`
- **ja**:
  `米国株,オプション,ダークプール,ガンマ,決算,相場,投資,デイトレ,出来高,ティッカー,プレマーケット,先物,ボラティリティ,マックスペイン,空売り,クジラ`
- **ko**:
  `시그넘,미국주식,옵션,다크풀,감마,실적,급등주,프리마켓,투자,종목,선물,변동성,세력,공매도,옵션플로우,고래`
  (⚠️ 실사용 확인 2026-07-10: 토스 게시판 유입 사용자가 "시그넘HQ" 한글 검색 시 미노출 — 영문
  `signumhq`로만 검색됨. 한글 브랜드명 `시그넘`을 키워드 1순위로. ja도 동일 이슈 가능 → `シグナム` 추가:)
- **ja (보강)**:
  `シグナム,米国株,オプション,ダークプール,ガンマ,決算,相場,投資,デイトレ,出来高,ティッカー,プレマーケット,先物,マックスペイン,空売り,クジラ`

(`米国株`/`미국주식` = "US stocks" — highest-intent term for the JP/KR audience; keep it.)
Compare with whatever is currently in each locale's keyword field and swap if these are denser.
Also consider a secondary category (Business) and refreshing Promotional text (editable anytime,
no review) for launch messaging.

**Bigger buff lever than keywords** for a brand-new app = ratings + download velocity → that's
exactly why the v1.1 in-app review prompt matters. Micro-tuning keywords is secondary to that.

## Gotchas / invariants

- `IAP_LIVE` must stay airtight: every subscription entry point is `{IAP_LIVE && ...}`.
  Confirmed no leak with the flag off (sim-verified 2026-07-10).
- adManager banner is driven by `setPro`/`wantBanner` gated on `useProStatus().ready`
  in NativeAppProvider — a Pro user never sees a cold-start banner flash. Don't reintroduce
  an unconditional `showBanner()` in the mount effect.
- The review auto-prompt keys off `signumhq.review.days` / `.prompted` — StoreKit throttles
  to ≤3/yr anyway; never prompt on first launch (it's distinct-day gated).
