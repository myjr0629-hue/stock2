# 3앱 전수 감사 — 수정 지시서 (2026-08-10)

> 리포지토리 루트 `$R` = `/Users/eunhoon/.gemini/antigravity/scratch/stock2`
> 아래 모든 파일경로·라인은 **작성 시점에 내가 직접 열어 재확인한 값**이다.
> 태그는 **[웹배포] / [바이너리] / [스토어콘솔]** 3종. 콘솔 항목은 대표만 실행 가능하다.

## 0. 한 줄 요약

**S1 11건 / S2 12건 / S3 24건 = 총 47건. 이 중 34건은 웹 배포만으로 오늘 끝난다.** 나머지는 스토어 콘솔 10건(대표 계정 필요), 바이너리 3건(다음 릴리스 동봉). 두 검증자가 CONFIRMED 판정한 것만 남겼고, 오진 2건(WIM ASC 라벨 «데이터 미수집» 주장, WIM 인앱 알림 스위치 안드로이드 노출 주장)과 과잉 지적 3건(랜딩 인용문, 다크풀 티어링, WIM 짧은설명 키워드)은 제거했다. 검증 불가로 제외된 네이티브 항목은 §6에 있다.

---

## 1. S1 — 즉시 (스토어·정책 리스크)

**S1-1. [스토어콘솔]** App Store / Play — WIM 개발자 웹사이트 (`https://www.signumhq.com/en/wim`)
— AdMob은 이 필드의 **도메인 루트**에서 `app-ads.txt`를 크롤한다. WIM만 경로가 붙어 있어 `https://www.signumhq.com/en/wim/app-ads.txt`(404)를 찾다 영구 미검증. SIGNUM/UC는 베어 도메인이라 정상.
— **바꾸기**: ASC → Why'd It Move? → 앱 정보 → **en/ko/ja 각 현지화의 마케팅 URL**을 `https://www.signumhq.com/en/wim` → `https://www.signumhq.com`. Play Console → 스토어 설정 → 연락처 세부정보 → 웹사이트 동일 교체. **개인정보처리방침 URL(`/en/wim/privacy`)은 그대로 둔다.**
— **검증**: `curl -s 'https://itunes.apple.com/lookup?id=6794356135&country=us' | grep sellerUrl` → `https://www.signumhq.com` 만 나와야 함. AdMob 콘솔 app-ads.txt 상태가 «확인됨»으로 전환되는지 24~48시간 후 재확인.

**S1-2. [스토어콘솔]** App Store id6788779895 — UC가 «추적함»을 선언했는데 ATT를 절대 호출하지 않는다
— 제품페이지 App Privacy = `Data Used to Track You: Identifiers` + `Third-Party Advertising: Identifiers, Device ID`(us/kr/jp 3/3). 그런데 `$R/src/app/[locale]/undercurrent/ads.ts:30` `export const ADS_LIVE = false;` → `:64` `return ADS_LIVE && !!plugin();` 로 ATT 경로가 **배포 번들에서 상수 폴딩(`&&!1`)되어 도달 불가**. 게다가 같은 스토어 페이지가 링크한 방침이 "does not track users"라고 자사 반증까지 한다. SIGNUM이 2026-07-08에 먹은 2.1 리젝과 같은 조항.
— **바꾸기**: ASC → Undercurrent → 앱 개인정보 → **«추적에 사용되는 데이터» 전부 해제**, `Third-Party Advertising` 목적 제거, «사용자와 연결되지 않은 데이터»만 유지. 광고를 켜는 릴리스에서 **ATT 호출을 포함시킨 뒤에만** 되돌린다. **SIGNUM 라벨은 실광고가 돌므로 손대지 말 것.**
— **검증**: `apps.apple.com/us/app/id6788779895` 새로고침 → «사용자를 추적하는 데 사용되는 데이터» 섹션 소멸.

**S1-3. [스토어콘솔]** Play `com.signumhq.undercurrent` — 출고 바이너리에 AD_ID가 병합되는데 Data safety는 «수집 없음»
— `$R/uc-app/android/app/src/main/AndroidManifest.xml:5-8` 주석이 스스로 적어놨다: *"Play's advertising ID declaration must say YES in the same release."* UC 소스에는 WIM(`$R/wim-app/android/app/src/main/AndroidManifest.xml:6-7`)과 달리 `tools:node="remove"`가 **없어서** play-services-ads AAR의 `AD_ID`/`ACCESS_ADSERVICES_AD_ID`가 그대로 병합된다(1.0.1 병합 매니페스트 L16-17에서 확인). 라이브 Play는 `No data collected` / 광고 배지 없음.
— **바꾸기(권장·즉시)**: Play Console → Undercurrent → 앱 콘텐츠 → **광고 ID 사용 = 예**, 데이터 보안에 «기기 또는 기타 ID» 수집 추가. **대안(바이너리)**: `$R/uc-app/android/app/src/main/AndroidManifest.xml`의 `<application>` 태그 바로 위에 `<uses-permission android:name="com.google.android.gms.permission.AD_ID" tools:node="remove" />` + `<uses-permission android:name="android.permission.ACCESS_ADSERVICES_AD_ID" tools:node="remove" />` 2줄 삽입 후 재배포. **이미 라이브 바이너리이므로 콘솔안(A) 권장.**
— **검증**: `play.google.com/store/apps/datasafety?id=com.signumhq.undercurrent` 에 «기기 또는 기타 ID» 행 출현.

**S1-4. [웹배포]** `$R/src/components/app/AppLegalDocument.tsx:204`(ko) / `:390`(en) / `:576`(ja) — WIM 방침이 플랫폼 구분 없이 «매일 1회 알림»을 약속하는데 안드로이드는 물리적으로 불가
— `$R/wim-app/android/app/google-services.json` **부재 확인**(SIGNUM은 존재) → 출고 AAB에 FCM 토큰 발급 경로가 없다. 그런데 방침 3언어와 `/{ko,en,ja}/wim/support` FAQ가 안드로이드 사용자에게도 알림을 안내한다. 동시에 Play Data safety는 «수집 없음»이라 방침과도 어긋난다.
— **바꾸기**: 세 문장 앞에 플랫폼 한정을 명기한다. ko `:204` `'오늘의 새 퀴즈가 준비되면'` → `'iOS에서는 오늘의 새 퀴즈가 준비되면'`, en `:390` `'A device push token is used to send'` → `'On iOS, a device push token is used to send'`, ja `:576` `'新しいクイズが準備できたときに'` → `'iOSでは、新しいクイズが準備できたときに'`. `$R/src/app/[locale]/wim/support/page.tsx` FAQ의 알림 항목에도 동일 한정 추가. **이렇게 하면 Play «수집 없음» 선언이 정합해지므로 Play는 건드리지 않는다.** (애플 라벨은 이미 `Device ID / App Functionality`로 정확 — 손대지 말 것.)
— **검증**: `curl -s https://www.signumhq.com/ko/wim/privacy | grep -o 'iOS에서는'` 히트. 안드로이드 실기기에서 설정 시트에 알림 행이 안 보이는 것은 **이미 정상**(iOS 전용 게이트 확인됨) — 코드 수정 불필요.

**S1-5. [웹배포]** `$R/src/services/adManager.ts:181-186` — 광고를 실제 송출 중인 유일한 앱(SIGNUM)에 UMP 개인정보 옵션 진입점이 없다
— 배포 청크 `_next/static/chunks/1316.e04188927d81b740.js` 실측: `requestConsentInfo` 1건, `showConsentForm` 1건, **`showPrivacyOptionsForm` 0건 / `privacyOptionsRequirement*` 0건**. 코드가 `await AdMob.requestConsentInfo()` → `isConsentFormAvailable && status===REQUIRED && showConsentForm()` 에서 끝난다. Google UMP는 동의 수집 후 **앱 내 상시 철회 진입점**을 요구한다. Play «광고 포함=예»로 라이브인 앱이라 AdMob 계정 심사 중인 지금 특히 나쁘다.
— **바꾸기**: `adManager.ts`에 `privacyOptionsRequired` 필드 + `needsPrivacyOptions()` + `openPrivacyOptions()`(`AdMob.showPrivacyOptionsForm()`)를 추가하고, `$R/src/app/[locale]/app-view/settings/page.tsx:572`(개인정보 처리방침 행) 바로 위에 조건부 행 «광고 개인정보 설정»을 추가한다. UC 구현(`$R/src/app/[locale]/undercurrent/ads.ts:102,112-121`)을 그대로 이식하되 **UC판은 `h()` 도달 불가라 실제로 안 뜬다**는 점에 주의 — SIGNUM은 초기화 경로가 살아 있으므로 게이트를 `adsAvailable()` 뒤에 두지 말고 독립적으로 노출할 것.
— **검증**: iOS 시뮬 콜드스타트 → 설정 화면에 행 노출 → 탭 시 구글 개인정보 옵션 폼 실제 표시(스샷).

**S1-6. [웹배포]** `$R/src/messages/en.json:2741,2746,2830` / `ko.json:2659,2664,2748` / `ja.json:2741,2746,2830` — «영구 가격» 약속이 자사 이용약관과 정면 충돌
— 전제: `POST /api/stripe/checkout` → 200 + **`cs_live_…`** (테스트 아님, 두 검증자가 각각 재현). 즉 이 문구는 계획이 아니라 **현행 표시광고**다. `en:2741` "pricing is permanent — no price increase, ever" / `en:2830` "locked in forever" ↔ `$R/src/app/[locale]/terms/_content-en.tsx:99` "may modify subscription pricing with at least 30 days' prior notice".
— **바꾸기**: 마케팅을 계약에 맞춘다. `en.json:2741` → `"Founding Member pricing is held for as long as your subscription remains active. Price changes follow Article 5 of the Terms (30 days' prior notice)."`, `:2830` a1 → `"Your Founding Member rate is held while your subscription stays active; if you cancel and resubscribe, regular pricing applies."` ko `:2659`/`:2748`, ja `:2741`/`:2830` 동일 취지로 교체. **약관에 예외 조항을 넣는 반대 방향은 영구 채무를 자초하므로 금지.**
— **검증**: `curl -s https://www.signumhq.com/en/pricing | grep -c 'ever\|forever'` → 0.

**S1-7. [웹배포]** `$R/src/messages/en.json:2718` / `ko.json:2636` / `ja.json:2718` — $0 요금제 버튼이 «Start Free Trial»
— 렌더 위치 `$R/src/app/[locale]/pricing/page.tsx:435,442` (`href="/login"`). 체험이 아니라 영구 무료이고 결제수단도 안 받는다 = **라벨이 사실이 아니다**. "Free Trial"은 ROSCA·전상법 자동결제 고지의무 트리거.
— **바꾸기**: `"Start Free Trial"` → `"Start Free"`, `"무료 체험 시작"` → `"무료로 시작"`, `"無料体験を始める"` → `"無料ではじめる"`.
— **검증**: `curl -s https://www.signumhq.com/ko/pricing | grep -c '무료 체험'` → 0.

**S1-8. [웹배포]** `$R/src/app/[locale]/privacy/_content-{en,ko,ja}.tsx:111`(en) 및 `:135,140,145`, `:250` — «판매하지 않는다»면서 맞춤 AdMob 광고 운영 + 처리자표에 Stripe·AdMob·푸시 전무
— `:111` "We do not sell personal information." ↔ `:250` "advertisements served by **Google AdMob** … IDFA … AAID … Ads may be personalized". CPRA에서 광고 식별자를 광고 네트워크에 넘긴 맞춤광고는 sale/share에 해당한다. 처리자 표는 `:135` Supabase / `:140` Vercel / `:145` Google LLC **3행뿐** — 문서 전체에 `Stripe` 0건(라이브 결제인데!), `push token` 0건.
— **바꾸기**: ① `:111` → `"We do not sell personal information for monetary consideration. We share advertising identifiers with Google AdMob for cross-context behavioral advertising; California residents may opt out via the device-level control (iOS ATT / Android Ads settings)."` ② 처리자 표에 3행 추가 — `Google AdMob (ad serving & measurement, USA)`, `Stripe, Inc. (payment processing, USA)`, `Apple APNs / Google FCM (push delivery)`. ③ 수집 항목에 «푸시 알림 디바이스 토큰» 추가. ko/ja 동일 조항 병행.
— **검증**: `curl -s https://www.signumhq.com/en/privacy | grep -c Stripe` → ≥1.

**S1-9. [웹배포]** 신규 파일 `$R/src/app/[locale]/legal/tokushoho/page.tsx` (+ `$R/src/app/[locale]/legal/business-info/page.tsx`) — 일본 소비자에게 정기과금을 파는데 特定商取引法に基づく表記가 사이트 전체에 없다
— `/ja/refund`, `/ja/terms`, `/ja/pricing`, `/ja` 4개 페이지 `特定商取引` **0건**. `/ko/refund` `통신판매업`·`사업자등록` **0건**. 라이브 Stripe 결제라 特商法 제11조 적용.
— **바꾸기**: 최소 기재 — 販売事業者 `SIGNUM HQ, LLC` / 소재지 `131 Continental Dr Ste 305, Newark, DE, USA` / 연락처 `contact@signumhq.com` / 대표자명 / 판매가격(USD 표시, 환산은 카드사 환율) / 대금지불시기(신청 즉시 과금·매월 자동갱신) / 서비스 제공시기(결제 즉시) / 반품·해지 조건(약관 제7조 링크). `/ja/pricing` 하단과 공통 푸터에 링크 추가.
— **검증**: `curl -s -o /dev/null -w '%{http_code}' https://www.signumhq.com/ja/legal/tokushoho` → 200, 본문에 `特定商取引法に基づく表記`.

**S1-10. [스토어콘솔]** Play `com.signumhq.app` — Data safety «데이터 삭제 요청 불가» ↔ 자사 방침 «이메일로 삭제 요청 가능»
— Play 원문: "The developer doesn't provide a way for you to request that your data be deleted". 링크된 `/en/app-view/privacy`: "you may request access to or deletion of any information … by emailing contact@signumhq.com".
— **바꾸기**: Play Console → SIGNUM → 데이터 보안 → «사용자가 데이터 삭제를 요청할 수 있음» 체크 + 삭제 요청 연락처 `contact@signumhq.com` 기재.
— **검증**: `play.google.com/store/apps/datasafety?id=com.signumhq.app` 에서 해당 문장 소멸.

**S1-11. ⛔ 이 지적은 «틀렸다» — 적용하면 프로덕션이 죽는다 (2026-08-19 실증)**
— 2026-08-18 에 이 지적대로 `requireDebugAuth()` 를 넣었더니 **가디언 화면이 통째로 죽었다**(RLSI 0 · 지표 전부 «---» · Breadth 50/50). `GuardianProvider.tsx:105` 가 이 라우트를 앱의 데이터 공급원으로 쓴다. 경로가 `/api/debug/` 아래라 디버그로 보였을 뿐이다.
— **가드를 넣지 말 것.** 앱에 계정이 없고 가디언은 전 사용자 무료 화면이라 이 값들은 이미 UI 로 공개된다. 페이월이 생기는 날 «앱 인증»으로 풀어야 할 문제지 가드로 막을 문제가 아니다.
— 교훈: 감사 지적은 «가설»이다. 적용 전에 소비자를 grep 한다.

~~**S1-11. [웹배포]** `$R/src/app/api/debug/guardian/route.ts:28` — 유료 상품 데이터가 무인증으로 공개~~
— `curl https://www.signumhq.com/api/debug/guardian` → **200 / 약 24KB**, `rlsi.score·level·regime·zScore·gexIndex·mcClellanOsc·breadthPct·squeezeRisk` 등 내부 계산값 전량 반환. 같은 디렉터리의 나머지 10개 라우트는 전부 403/401로 차단돼 있다(가드 헬퍼가 이미 존재).
— **바꾸기**: `$R/src/app/api/debug/kv/route.ts:4-8`과 동일하게 2줄 추가 — 파일 상단에 `import { requireDebugAuth } from '@/lib/debugAuth';`, `export async function GET(request: Request) {` 첫 줄에 `const authError = requireDebugAuth(); if (authError) return authError;`.
— **검증**: `curl -s -o /dev/null -w '%{http_code}' https://www.signumhq.com/api/debug/guardian` → **403**. `x-debug-secret` 헤더를 넣으면 200.

---

## 2. S2 — 사용자에게 잘못된 정보가 보이는 것

**S2-1. [웹배포]** `$R/src/app/layout.tsx:78` — 사이트의 X/트위터 카드가 영구히 «S&P 500 +0.00% / VIX 0.0 CALM»
— `images: ['/api/og/market?type=pulse&format=tweet']` — **데이터 파라미터가 하나도 없다.** 렌더러 `$R/src/app/api/og/market/route.tsx:128-131`은 `parseFloat(searchParams.get('spy') || '0')`, `vix … || '0'`, `dp … || '0'` 이므로 파라미터가 없으면 그대로 0을 그린다(`:87 fmt()` → `+0.00%`, `:101 vixInfo()` → `CALM`, `:275` → `—`). 검증자가 실제 PNG를 픽셀로 열어 확인했고, 정규장 개장 26분 후에도 동일했다. `type=morning/spotlight/closing` 4종 전부.
— **바꾸기**: ① `layout.tsx:78`을 정적 카드로 교체 — `images: ['/og-brand.png']`. ② 렌더러에 발행 게이트: `route.tsx:124` GET 진입부에서 `spy`·`vix`·`dp` 파라미터가 **모두 부재이거나 전부 0이면** 수치 블록 대신 «Last session» 라벨 또는 브랜드 카드로 폴백(0.00%·0.0·부유 글리프를 절대 그리지 않는다). ③ `:130` 기본값을 `'0'` → `null`로 바꿔 «값 없음»과 «실제 0»을 구분.
— **검증**: `curl -s 'https://www.signumhq.com/api/og/market?type=pulse&format=tweet' -o /tmp/og.png && open /tmp/og.png` — **PNG를 눈으로 열 것.** 200/Content-Type 확인으로는 이번 결함이 그대로 통과했다.

**S2-2. [웹배포]** `$R/src/app/[locale]/undercurrent/page.tsx:639-667` 및 `:2487-2494` — UC 프로덕션에 안드로이드 인셋 진단 패널이 살아 있다
— 게이트가 `Capacitor.getPlatform()==='android'` 뿐이라 **안드로이드 사용자 전원**의 설정 시트 맨 아래에 `inner 412x915 · screen … · dpr 2.625 · floor 126px · safe 48px · lift 14px · nav h=… bottom=… gapToVh=…` 모노스페이스 문자열이 노출된다. `setInterval(read, 4000)`도 영구 실행. 배포 청크 `page-a9541689040b77b3.js`에 `gapToVh=` 문자열이 그대로 실려 있음을 확인. 코드 주석 자신이 "원인 확정 후 이 블록은 제거한다"고 적어놨고, 원인은 `$R/src/utils/androidBottomInset.ts`로 이미 해결됐다.
— **바꾸기**: `:639` `const [diag, setDiag] = useState('');` 부터 `:667` `}, []);` 까지 useEffect 블록 전체 삭제 + `:2483-2494` 렌더 블록(`{diag && (…)}`) 삭제.
— **검증**: 배포 후 `curl -s https://www.signumhq.com/en/undercurrent | grep -o 'page-[a-f0-9]*\.js'` 로 새 청크명 획득 → 그 청크에 `grep -c gapToVh` → 0.

**S2-3. [웹배포]** 신규 `$R/src/app/[locale]/undercurrent/support/page.tsx` — UC만 지원 페이지가 없다 (404)
— `/{en,ko,ja}/undercurrent/support` 전부 **404** 실측. App Store id6788779895에서 노출되는 자사 URL은 `https://www.signumhq.com`(SIGNUM 마케팅 홈)과 방침 2건뿐. UC 배포 번들에 `mailto:` **0건**, `contact@signumhq.com` **0건** → 방침이 안내하는 문의 경로가 앱 안에 없다. (Play UC 리스팅에는 지원 이메일이 있어 위반은 아니나, 애플 심사자는 지원 URL을 실제로 연다.)
— **바꾸기**: `$R/src/app/[locale]/wim/support/page.tsx`를 복제해 UC 팔레트·UC FAQ(에디션 갱신 주기, 괴리 스코어 의미, 언어 전환, 광고 없음, 알림 곧 제공)로 교체 생성. `$R/src/app/[locale]/undercurrent/page.tsx:1229`(약관 버튼) 다음에 지원 링크 버튼 추가. ASC → UC → 지원 URL을 `https://www.signumhq.com/en/undercurrent/support`로 설정.
— **검증**: `for l in en ko ja; do curl -s -o /dev/null -w "$l %{http_code}\n" https://www.signumhq.com/$l/undercurrent/support; done` → 전부 200.

**S2-4. [웹배포]** `$R/src/components/app/AppLegalDocument.tsx` ko privacy 3세트(default `:37~`, uc `:98~`, wim `:160~`) — 한국어 앱 내 방침이 PIPA 필수 기재사항 미충족
— 3종 ko 문서 전문 추출 결과 「개인정보 보호책임자」 0건, 「권익침해」 0건, 「분쟁조정」 0건, 「1833-6972」·「118」 0건, 파기 절차·보유기간 숫자 없음. 스토어에 등록된 방침 URL이 웹이 아니라 **이 앱 내 문서**라서 법적 노출면이 미달 문서 쪽이다. 3앱 전부 KR 라이브.
— **바꾸기**: ko privacy 배열 3세트 각각 끝에 공통 2섹션 추가 — ①`{ title: '개인정보 보호책임자', body: '성명 … / 직책 … / 이메일 contact@signumhq.com' }` ②`{ title: '권익침해 구제방법', body: '개인정보분쟁조정위원회 1833-6972 / 개인정보침해신고센터 118 / 대검찰청 1301 / 경찰청 182' }`. 기존 «데이터 보관» 섹션에 보유기간을 숫자로 명기. **웹 `/ko/privacy`에도 권익침해 조항이 없으므로(DPO만 있음) 같은 2섹션을 `$R/src/app/[locale]/privacy/_content-ko.tsx`에도 추가할 것.**
— **검증**: `curl -s https://www.signumhq.com/ko/wim/privacy | grep -c '1833-6972'` → ≥1 (3앱 전부).

**S2-5. [웹배포]** `$R/src/components/app/AppLegalDocument.tsx:200`(ko) / `:386`(en) / `:572`(ja) — WIM 방침이 «분석 SDK 미사용»이라고 단언하는데 바이너리에 Firebase가 병합돼 있다
— 병합 매니페스트에 `FirebaseInstallationsRegistrar`(FID 식별자 생성), `FirebaseMessagingService`, `TransportRegistrar` + AdMob의 `MobileAdsInitProvider`/`AdActivity`/`AdService`가 들어 있다. **«광고 미표시»·«AAID 미사용»은 현재 사실**(안드로이드는 `AD_ID`를 실제로 제거함) — 거짓인 부분은 **«분석 SDK»** 조항이고, 광고를 켜는 순간 나머지도 전부 허위가 된다.
— **바꾸기**: 세 줄에서 분석 SDK 부인을 제거하고 SDK 동봉 사실을 밝힌다. en `:386` → `'This version does not display ads and does not use advertising identifiers (IDFA/AAID) or user tracking. The app bundle includes advertising and messaging SDKs that remain inactive in this version; if advertising is introduced, this policy will be updated first.'`, ko `:200` / ja `:572` 동일 취지. **광고를 켜는 배포보다 이 문구 배포가 반드시 먼저 나가야 한다.**
— **검증**: `curl -s https://www.signumhq.com/ko/wim/privacy | grep -c '분석 SDK를 사용하지 않습니다'` → 0.

**S2-6. [웹배포]** `$R/src/messages/ko.json:2756` / `ja.json:2838` / `en.json:2838` — FAQ가 화면에 없는 기능을 있다고 말한다
— "UI에 원화/엔화 참고 환산이 표시됩니다." / "UIに円・ウォン参考換算が表示されます。" / "Local currency estimates (KRW/JPY) are shown for reference." 실측: `/ko/pricing` `₩` 0건, `/ja/pricing` `¥` 0건(`円`은 이 FAQ 문장 자신 1건), `/en/pricing` 0건.
— **바꾸기(둘 중 하나)**: ① 카드 가격 아래에 실제 환산 표기 추가(`≈ ₩68,000 / ¥7,500 (참고, 실제 청구는 카드사 환율)`), 또는 ② 문장을 잘라낸다 — ko `:2756` → `"USD 단일 가격이며, 결제 시 카드사 환율로 자동 환산됩니다."`, ja/en 동일. **②가 즉시 가능.**
— **검증**: `curl -s https://www.signumhq.com/ko/pricing | grep -c '참고 환산'` → 0.

**S2-7. [웹배포]** `$R/src/messages/en.json:2742,2746` / `ko.json:2660,2664` / `ja.json:2742,2746` — 종료일 없는 «조기 마감» + 청구 이력 없는 정가 취소선
— 마크업 `class="line-through …">$69` / `$149` 실존. 본문이 "prices will **restore** to regular rates"라고 미래형으로 말한다 = 그 정가는 아직 존재한 적 없을 수 있다. 종료일·정원 없는 "enrollment may close early"는 그 자체로 거짓 희소성(FTC Guides 233.1 / 표시광고법).
— **바꾸기**: ① `foundingUrgency` 3언어에 **실제 종료일 또는 정원**을 넣는다 — 예 `"⚡ Founding Member enrollment closes 2026-09-30"`. 못 정하면 키를 삭제하고 렌더에서 제거. ② **착수 전 대표 확인 1건**: Stripe 대시보드에서 `$69`/`$149`로 실제 청구된 이력이 있는지. **없으면** 취소선을 제거하고 `foundingRestore`를 `"Founding Member rate $49 (regular price will be $69)"` 형태 미래형으로 교체. 있으면 취소선은 유지하고 ①만 처리.
— **검증**: `curl -s https://www.signumhq.com/en/pricing | grep -c 'close early'` → 0 또는 날짜 포함 문자열로 대체.

**S2-8. [웹배포]** `$R/src/app/[locale]/pricing/page.tsx:310-315` + `$R/src/messages/en.json:1311` / `ko.json:1229` / `ja.json:1311` — 경쟁사 가격표가 자사 다른 페이지와 모순 + 출처 없음
— `/pricing` "SpotGamma **$99–249/mo**" ↔ `/how-it-works/command` "SpotGamma-tier (**$300+/mo**)". 같은 도메인에 두 숫자가 동시 게시 중. 표에는 출처 URL도 조회일도 없다(표시광고법 제5조 실증제도 / 景表法 제7조).
— **바꾸기**: ① `en.json:1311`·`ko.json:1229`·`ja.json:1311`의 `$300+/월`·`$300+/mo`를 표와 동일한 `$99–249/mo`로 통일. ② `pricing/page.tsx:310-315` 각 항목에 출처 각주 추가(예: `note: "SpotGamma pricing page, retrieved 2026-08-10"`). ③ **«$450+/mo» 관련 주의**: 이 숫자의 실제 출처는 경쟁사 표가 아니라 랜딩의 자사 «$150 + $200 + $100 value» 태그다. 표는 4곳뿐이므로 `/pricing`의 «6 competitors» 류 표현을 표에 실제로 있는 4곳으로 맞추거나 «자사 가치 산정»임을 명시할 것. (합계로 바꾸라는 원 지적은 틀렸다 — 최대 조합 $597이라 «$450+»는 산술적으로 성립한다.)
— **검증**: `curl -s https://www.signumhq.com/en/how-it-works/command | grep -c '\$300'` → 0.

**S2-9. [웹배포]** `$R/src/components/app/AppLegalDocument.tsx:45`(ko) / `:234`(en) / `:420`(ja) — SIGNUM 약관이 존재하지 않는 «광고 제거 옵션»을 서술
— "광고 제거 옵션은 광고 노출을 줄이기 위한 기능입니다" / "ad-removal options are designed to reduce ad exposure" / "広告削除オプションは…". 실제로는 `IAP_LIVE=false`이고 App Store·Play 3앱 전부 **In-App Purchases 표기 0건**.
— **바꾸기**: 세 문장에서 광고 제거/유료 옵션 절만 삭제한다. ko `:45` `'…열람하기 위한 수단이며, 광고 제거 옵션은 광고 노출을 줄이기 위한 기능입니다.'` → `'…열람하기 위한 수단입니다.'`, en `:234` `'…for a limited time, and ad-removal options are designed to reduce ad exposure.'` → `'…for a limited time.'`, ja `:420` 동일.
— **검증**: `curl -s https://www.signumhq.com/ko/app-view/terms | grep -c '광고 제거'` → 0.

**S2-10. [웹배포]** `$R/src/app/[locale]/page.tsx:536` + `$R/src/messages/{en,ko,ja}.json:84` — 앱이 3개인데 랜딩은 «두 앱»이고 WIM 링크가 한 개도 없다
— 랜딩 원문 HTML 전체 링크 목록에 `app-wim`·`id6794356135`·`com.signumhq.wim` **0건**. 앱 카드는 `:525` `/app?from=home`, `:536` `/app-uc?from=home` 2개뿐. `appFamilyNote` = "Both apps free" / "두 앱 모두 무료" / "2つのアプリ、無料". WIM은 8/8부터 양대 스토어 라이브이고 `/app-wim` 스마트링크는 **이미 정상 동작**(302 → id6794356135) — 랜딩이 안 부를 뿐이다.
— **바꾸기**: `:536` 카드 다음에 세 번째 카드 `<a href="/app-wim?from=home">` 추가(라벨 `Why'd It Move?` / "Today's market, as a quiz"). `en.json:84` → `"All three apps free · iOS & Android"`, `ko.json:84` → `"세 앱 모두 무료 · iOS & Android"`, `ja.json:84` → `"3つのアプリ、無料 · iOS & Android"`.
— **검증**: `curl -s https://www.signumhq.com/ko | grep -c 'app-wim'` → ≥1.

**S2-11. [웹배포]** `$R/src/app/layout.tsx:57-79` (특히 `:61 url`) — 전 페이지가 SIGNUM OG 카드를 뒤집어쓴다
— `/en/wim`, `/en/wim/support`, `/en/undercurrent` 전부 `og:title = SIGNUM HQ — Institutional Intelligence, Democratized`, `og:url = https://signumhq.com`(페이지 무관 고정 + apex 307). `/en/undercurrent`는 `<title>`까지 `SIGNUM HQ` — `$R/src/app/[locale]/undercurrent/`에 `layout.tsx`가 **아예 없다**(ads.ts / page.tsx / privacy / terms 뿐). WIM은 «Education, not investment advice»로 심사를 통과한 앱인데 공유 카드가 옵션 플로우·AI 판정을 광고한다.
— **바꾸기**: ① `$R/src/app/[locale]/undercurrent/layout.tsx` 신규 생성 + `generateMetadata`에 UC 전용 title/description/openGraph. ② `$R/src/app/[locale]/wim/layout.tsx`(이미 존재, `generateMetadata` 있음)에 `openGraph`/`twitter` 오버라이드 추가. ③ `layout.tsx:61`의 `url: 'https://signumhq.com'` 삭제(각 페이지 `alternates.canonical`에 위임). **`/flow/[ticker]`는 이미 페이지별 og:title/description/url + canonical이 정상이므로 손대지 말 것.**
— **검증**: `curl -s https://www.signumhq.com/en/wim | grep 'og:title'` → WIM 문구.

**S2-12. [바이너리]** `$R/uc-app/ios/App/App/Info.plist`, `$R/wim-app/ios/App/App/Info.plist` (+ 3앱 `.lproj`) — App Store 언어가 «영어»뿐인데 설명문은 3언어 완전 지원이라고 광고
— `itunes lookup` 3앱 × us/kr/jp **9/9 전부 `languageCodesISO2A: ['EN']`**. 설명문은 "한국어·영어·일본어 완전 지원." / "日本語・英語・韓国語に完全対応。". **핵심**: SIGNUM은 이미 `$R/ios/App/App/Info.plist:17-22`에 `CFBundleLocalizations = en, ko, ja`가 있는데도 «영어»로 표시된다 → **plist 선언만으로는 반영되지 않음이 실측으로 확인됐다.** 3앱 모두 `.lproj`는 `Base.lproj` 하나뿐이고 `knownRegions = (en, Base)`.
— **바꾸기**: 각 앱 타깃에 실제 리소스 `ko.lproj/InfoPlist.strings`, `ja.lproj/InfoPlist.strings`(최소 `CFBundleDisplayName` 1줄, ATT 문구 있는 앱은 `NSUserTrackingUsageDescription` 번역 포함)를 추가하고 Xcode 프로젝트 `knownRegions`에 `ko`, `ja` 등록. UC/WIM Info.plist에는 SIGNUM과 동일한 `CFBundleLocalizations` 배열도 신규 추가(현재 키 자체가 없음).
— **검증**: 아카이브 업로드 후 `curl -s 'https://itunes.apple.com/lookup?id=<id>&country=kr' | grep languageCodesISO2A` → `EN,KO,JA`. **선언만으로 안 된다는 전례가 있으므로 반드시 실제 스토어 반영으로 검증할 것.**

---

## 3. S3 — 마감 품질

**S3-1. [웹배포]** Cloudflare Scrape Shield — 원본 HTML의 연락처가 `[email protected]`
`__cf_email__` 실측 건수: `/en`1 `/ko`1 `/ja`1 `/en/pricing`1 `/en/privacy`**3** `/en/terms`**4** `/en/refund`2 `/en/wim/support`1 `/en/wim/privacy`3 `/en/undercurrent/privacy`3. **실브라우저에서는 정상 렌더됨을 확인**(DOM `.__cf_email__` 0개, 본문에 `contact@signumhq.com` 3회) → 사용자 노출 결함 아님. 남는 리스크는 JS 미실행 크롤러(스토어 정책 스캐너·아카이브)에 연락처가 안 보이는 것. / **바꾸기**: Cloudflare → Scrape Shield → **Email Address Obfuscation OFF**(토글 1회로 10개 페이지 동시 해결). / **검증**: `curl -s https://www.signumhq.com/en/wim/support | grep -c __cf_email__` → 0.

**S3-2. [웹배포]** `$R/src/app/robots.ts:13` — 차단 규칙이 하나도 안 먹는다 (로케일 프리픽스 누락)
`disallow: ['/api/', '/admin/', '/app-view/', '/login', '/settings']` 인데 실경로는 전부 `/{locale}/…`. 실측 `/en/app-view/cmd` 200(319KB) · `/en/login` 200 · `/en/settings` 200 · `/en/admin/health` 200, **4/4 모두 `X-Robots-Tag`·meta robots 없음 = 완전 색인 가능**. / **바꾸기**: `['/api/', '/*/admin/', '/*/app-view/', '/*/login', '/*/settings', '/marketing/', '/templates/']`. / **검증**: `curl -s https://www.signumhq.com/robots.txt`.

**S3-3. [웹배포]** `$R/src/app/marketing/templates/layout.tsx`, `$R/src/app/templates/layout.tsx` — 내부 운영 템플릿이 공개 색인 대상
`/marketing/templates/audit` 200(한국어 내부 화면 "📊 OG Image Audit — 전체 21개 템플릿 … 실시간 미리보기"), `/marketing/templates/story` 200, `/templates/og/pulse` 200, `/templates/og/morning` 200, `/marketing/templates/story/morning` 200 — **5/5 meta robots 없음**. / **바꾸기**: 두 레이아웃에 `export const metadata = { robots: { index: false, follow: false } };` + S3-2의 robots 경로. / **검증**: `curl -s https://www.signumhq.com/marketing/templates/audit | grep -c 'noindex'` → ≥1.

**S3-4. [웹배포]** `$R/src/app/sitemap.ts:10` + 각 페이지 metadata — canonical 0건 / sitemap 누락
전 페이지 `<link rel="canonical">` **0건**(`/en/flow/NVDA`만 1건). sitemap 513개 = 3 × (STATIC 4 + 티커 167)이고 `STATIC_PATHS = ['', '/undercurrent', '/how-it-works', '/pricing']` — **WIM은 단 한 줄도 없다.** / **바꾸기**: `STATIC_PATHS`에 `'/wim','/wim/support','/how-it-works/command','/how-it-works/flow','/how-it-works/intel','/how-it-works/guardian','/how-it-works/dashboard','/how-it-works/portfolio','/how-it-works/watchlist','/privacy','/terms','/refund'` 추가 + 각 페이지 metadata에 `alternates.canonical`. **hreflang 추가 작업은 하지 말 것** — HTTP `Link` 헤더에 ko/en/ja/x-default가 이미 나가고 있어 중복이 된다(`sitemap.ts:6-7`의 x-default 주석은 사실과 다르므로 주석만 수정). / **검증**: `curl -sI https://www.signumhq.com/en | grep -i '^link:'` (이미 정상) + `curl -s https://www.signumhq.com/en/pricing | grep -c 'rel="canonical"'` → 1.

**S3-5. [웹배포]** `$R/next.config.*` headers — 보안 헤더 전무 + 마케팅 페이지 CDN 캐시 금지
`curl -I https://www.signumhq.com/en` → `strict-transport-security` **하나뿐**(CSP / X-Frame-Options / X-Content-Type-Options / Referrer-Policy / Permissions-Policy 전부 부재). `cache-control: private, no-cache, no-store…` + `x-vercel-cache: MISS`, 356KB, TTFB 0.647s. / **바꾸기**: `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()` 추가. 마케팅·법률 라우트에 `export const revalidate = 3600`(앱 셸·API는 현행 유지). / **검증**: `curl -sI https://www.signumhq.com/en/pricing | grep -ci 'x-frame-options'` → 1.

**S3-6. [웹배포]** `$R/src/app/layout.tsx:29-35` — 공개 마케팅 사이트에 핀치 줌 차단
`maximumScale: 1, userScalable: false` (WCAG 1.4.4). 앱 WebView에는 타당하나 공개 웹에까지 적용됨. / **바꾸기**: 루트에서 두 속성 제거하고 `$R/src/app/[locale]/app-view/layout.tsx`(및 uc/wim 셸 라우트)의 viewport에만 내린다. / **검증**: `curl -s https://www.signumhq.com/en | grep -c 'user-scalable=no'` → 0, `/en/app-view/cmd`는 ≥1 유지.

**S3-7. [웹배포]** `$R/src/app/layout.tsx:89` — 전 페이지가 `<html lang="ko">`
`/en`, `/ja`, `/ko`, `/en/pricing`, `/en/wim` **5/5** 동일. 스크린리더가 영문을 한국어 음성엔진으로 읽는다(WCAG 3.1.1). / **바꾸기**: `<html lang="ko" …>` → `<html lang="en" …>`로 두고 `$R/src/app/[locale]/layout.tsx`에서 로케일별로 덮어쓰거나, 루트를 로케일 파라미터로 렌더. / **검증**: `curl -s https://www.signumhq.com/ja | grep -o '<html lang="[a-z]*"'` → `ja`.

**S3-8. [웹배포]** `$R/src/app/not-found.tsx:5-7` — 404가 로케일을 무시한다
`/ko/nonexistent-xyz` → 상태는 정상 404지만 본문이 영어("404 - Page Not Found / The page you are looking for does not exist. / Go back home"), 링크는 `href="/"` 하나(→ 307 재협상). `$R/src/app/[locale]/not-found.tsx`가 존재하지만 **이것도 영어이고 렌더되는 쪽은 루트 파일이다**. / **바꾸기**: 두 파일 모두 3언어 문구 + 홈·가이드·가격 3개 링크 제공, 로케일 세그먼트에서 `notFound()`가 `[locale]/not-found.tsx`로 도달하도록 라우팅 확인. / **검증**: `curl -s https://www.signumhq.com/ko/zzz | grep -c '페이지를 찾을 수 없'` → 1.

**S3-9. [웹배포]** `$R/src/app/[locale]/undercurrent/page.tsx:1` (`'use client'`) — `/en/undercurrent` SSR 가시 텍스트 **175자**
전량이 "Undercurrent BY SIGNUM HQ / The money moving behind the news / Mon, August 10 ET · Morning edition / Reading the money flow… / Home Macro Diverge Whales Stories Search". 대조: `/en` 2,577 · `/en/pricing` 5,134 · `/en/wim` 1,075 · `/en/flow/NVDA` 3,807. sitemap에는 3건 등재 → 구글 soft-404 취급 위험. UC는 설치 0건이라 마케팅이 가장 급한 앱이다. / **바꾸기**: S2-11의 신규 `undercurrent/layout.tsx`에 metadata + `<noscript>` 요약, 가능하면 서버 렌더 히어로(제품 설명 + 스토어 배지 + 오늘의 스토리 3건). / **검증**: `curl -s https://www.signumhq.com/en/undercurrent | sed 's/<[^>]*>//g' | wc -c` → 1,000 이상.

**S3-10. [웹배포]** `$R/src/app/[locale]/page.tsx:557-559` — KO/JA 랜딩에 영어 면책이 그대로
"A market research workspace for price, options, sector, and session analytics. Built for informational and educational use only. No brokerage, execution, custody, or investment advisory services." 하드코딩(`t()` 미사용). 면책은 소비자가 읽을 수 있어야 효력이 있다. / **바꾸기**: 메시지 키로 분리하고 ko/ja 번역 추가. / **검증**: `curl -s https://www.signumhq.com/ko | grep -c 'market research workspace'` → 0.

**S3-11. [웹배포]** `$R/src/messages/ja.json:94` — 일본어판만 예측형 문구
"…リアルタイムで捕捉。**スマートマネーの方向を先に読み取りましょう。**" ↔ `en.json:94` "Monitor institutional positioning across multiple venues." / `ko.json:94` "기관 포지셔닝을 다중 매체에서 모니터링합니다." 3언어 불일치는 실재하나, 이는 방향 추천이 아니라 관찰 권유이므로 **金商法 이슈가 아니라 일관성·사내 «예측형 프레이밍 금지» 규칙 문제**다. / **바꾸기**: `ja.json:94` 끝문장 → `"機関投資家のポジショニングを複数の取引venueにわたって観測できます。"` / **검증**: `curl -s https://www.signumhq.com/ja | grep -c '先に読み取り'` → 0.

**S3-12. [웹배포]** `$R/src/messages/{ko,ja,en}.json` 기능 명칭 — 로케일 간 제품명이 다르다
en "Institutional Flow (Large Block Sweeps)" / "Institutional Activity Index" ↔ ko "Classified Flow (고래 스윕)" / "Smart Money Index"(ja도 Smart Money Index). / **바꾸기**: 기능명은 3로케일 동일 영문 고유명으로 고정하고 설명만 번역. / **검증**: `/en/pricing`·`/ko/pricing`·`/ja/pricing`에서 기능명 문자열이 동일하게 grep됨.

**S3-13. [웹배포]** `$R/src/components/app/AppLegalDocument.tsx:35,224,410` — SIGNUM 앱 문서 최종 갱신이 2026년 6월 (v1.1·실광고 가동 이전)
UC는 8월(`:99,285,471`), WIM은 7월(`:162,348,534`). / **바꾸기**: S2-9·S2-4 수정과 **함께** `'최종 업데이트: 2026년 6월'` → `'2026년 8월'`, `'Last updated: June 2026'` → `'August 2026'`, `'最終更新: 2026年6月'` → `'2026年8月'`. / **검증**: `curl -s https://www.signumhq.com/en/app-view/privacy | grep -c 'June 2026'` → 0.

**S3-14. [웹배포+스토어콘솔]** `$R/src/components/app/AppLegalDocument.tsx:644` 외 — 회사명·저작권 표기 3종 혼재
앱 내 푸터 `SIGNUM HQ, LLC` / `$R/src/app/[locale]/wim/support/page.tsx` `company: 'Signum Hq, LLC'`(ko/en/ja 3곳) / `$R/src/app/[locale]/undercurrent/page.tsx:1230,2480` `SIGNUM HQ, LLC`. 스토어 저작권도 갈림: SIGNUM·UC `© 2026 SIGNUM HQ, LLC` vs **WIM `© 2026 Signum Hq, LLC`**. / **바꾸기**: 코드 전부 `SIGNUM HQ, LLC`로 통일 + ASC → WIM → 저작권을 `2026 SIGNUM HQ, LLC`로. 판매자명 `Signum Hq, LLC` 자체는 법인 등기 표기라 유지. / **검증**: `curl -s https://www.signumhq.com/ko/wim/support | grep -c 'Signum Hq'` → 0.

**S3-15. [웹배포]** `$R/src/components/app/AppLegalDocument.tsx` 약관 3세트 + `$R/src/app/[locale]/terms/_content-en.tsx:194` — 앱 내 약관에 준거법 전무 / 웹 «18세 이상»이 4+ 등급과 충돌
앱 내 약관은 섹션 5개뿐(준거법·분쟁해결·연령·지식재산 전무). 웹 약관 `:194` "intended for users **aged 18 and above**", `:239-241` 델라웨어 준거법. 3앱 전부 App Store **4+** / Play **Everyone**, WIM은 카테고리가 **Education**. / **바꾸기**: ① 앱 내 약관 3세트에 준거법·분쟁해결 1문단 추가(웹 `:239` 문구 이식) ② 웹 `:194`를 "The paid subscription and account services are intended for users aged 18 and above."로 범위 축소. / **검증**: `curl -s https://www.signumhq.com/en/app-view/terms | grep -c 'Delaware'` → ≥1.

**S3-16. [웹배포]** `$R/src/app/[locale]/wim/page.tsx:28` + `$R/src/app/[locale]/wim/ads.ts:38,39` — WIM 광고 배선이 배포물에 존재하지 않는다 (개발자 함정)
플래그가 2중이다: `ads.ts:38 export const WIM_ADS_LIVE = false` **와** `page.tsx:28 const WIM_ADS_LIVE = false`(로컬 재선언, 임포트 아님). 그 결과 `wim/ads.ts`를 임포트하는 파일이 0개이고, 배포 WIM 청크에 `initWimAds/showWimBanner/wimAdsAvailable/showWimInterstitial` **0건**, `ca-app-pub-` **0건**. `page.tsx:458,633,808`의 `adBanner`("광고 영역"/"Ad space"/"広告スペース")는 번역 사전에만 남아 있고 **참조하는 렌더 코드도 없다.** AdMob 승인 직후 «플래그만 켜면 된다»고 판단하면 그날 하루를 날린다. / **바꾸기**: `page.tsx:28`의 로컬 상수를 삭제하고 `import { WIM_ADS_LIVE, wimAdsAvailable, initWimAds, showWimBanner, maybeShowWimInterstitial } from './ads';`로 교체. 배너 슬롯(`page.tsx:4145`의 `WIM_ADS_LIVE ? 158 : 104` 패딩 분기 지점)에 실제 `showWimBanner()` 호출 + 배너 높이 스페이서 연결. 실 유닛 교체와 동시에 `ads.ts:39 ADS_TESTING = true` → `false`. / **검증**: 플래그를 로컬에서 true로 켜고 시뮬 실행 → 실제 테스트 배너가 뜨는지 스샷.

**S3-17. [스토어콘솔]** ASC — SIGNUM 앱 이름이 스토어·국가마다 3종, iOS KR/JP만 영문
iOS us `SIGNUM HQ: Stock Market Intel` / kr `SIGNUM HQ: Stock AI Intel` / jp `SIGNUM HQ: Options & AI Intel` ↔ Play ko `SIGNUM HQ: AI 시장 인텔리전스` / ja `SIGNUM HQ：AI市場インテル`. (UC·WIM은 양 스토어 일치 — 정상) / **바꾸기**: ASC ko 이름을 `SIGNUM HQ: AI 시장 인텔리전스`, ja를 `SIGNUM HQ：AI市場インテル`로. **이름 변경은 애플 유일성·상표 재검사를 유발하므로 한 로케일씩 저장할 것**(과거 실측된 함정). / **검증**: `itunes lookup?country=kr` `trackName`.

**S3-18. [스토어콘솔]** ASC — iOS KR/JP 설명문이 Play판의 절반 이하 (한도 4000자 중 8~9%)
실측 desc 길이: SIGNUM en **1616** / ko **360** / ja **338** (같은 앱 Play ko 773 / ja 751). UC iOS 650/615 vs Play 683/651. WIM iOS 729/680 vs Play 992/881. SIGNUM ko/ja는 «주요 기능» 5줄에서 끝나 사실상 기능 미고지. / **바꾸기**: ASC ko/ja 설명을 이미 승인된 Play ko/ja 본문으로 교체(예측·수익보장 문구 없어 그대로 이식 가능). / **검증**: `itunes lookup` `description` 길이 700자 이상.

**S3-19. [스토어콘솔+웹배포]** Play — 방침 URL이 3앱 모두 `/en/` 고정 (ko/ja 스토어에서도 영문)
Play 3앱 × en/ko/ja **9/9** 전부 `/en/…`. iOS는 kr→`/ko/…`, jp→`/ja/…`로 정상 분기. / **바꾸기**: 로케일 미지정 진입점(예 `/privacy/undercurrent`)을 만들어 `Accept-Language`로 분기시키고 Play에 그 URL 등록. 루트 `/`가 이미 Accept-Language 분기를 하고 있으므로 같은 미들웨어 패턴 재사용. / **검증**: `curl -H 'Accept-Language: ko-KR' -sI <새URL> | grep location` → `/ko/…`.

**S3-20. [스토어콘솔]** Play 개발자 정보 — 개인 휴대폰이 3앱 전부 공개
`+82 10-5716-0111`(ASC 심사 연락처와 동일)이 en/ko/ja 9개 리스팅의 «About the developer»에 렌더됨. 정책 위반은 아니나 스팸·사칭 표적. / **바꾸기**: Play Console → 개발자 계정 → 연락처를 전용 번호(Google Voice 등)로 교체. / **검증**: Play 리스팅 재수집.

**S3-21. [스토어콘솔]** Play — SIGNUM ja 짧은 설명이 반각 마침표로 끝남
`AI市場インテル：オプション・ガンマ、ダークプール、資金フロー、セクター分析**.**` / **바꾸기**: 마지막 문자 `.` → `。` / **검증**: Play ja 리스팅.

**S3-22. [스토어콘솔]** Play — 짧은 설명 80자 예산 미사용 (현지어만 방치)
실측: SIGNUM en 70 / ko **35** / ja **39**; UC en 79 / ko **37** / ja **31**; WIM en 80 / ko 67 / ja 58. / **바꾸기**: ko/ja를 60~80자로 재작성하며 실검색어(«미국주식», «나스닥», «옵션») 포함. WIM ko/ja는 명사 나열체를 문장형으로 다듬어 같은 작업에 포함(정책 리스크는 아니고 ASO 품질 문제). / **검증**: Play 리스팅 `aria-label` 길이.

**S3-23. [바이너리]** `$R/ios/App/App/Info.plist:104`, `$R/uc-app/ios/App/App/Info.plist:33`, `$R/wim-app/ios/App/App/Info.plist:33` — `UIRequiredDeviceCapabilities = armv7`
최소 iOS 15.0(arm64 전용 기기)인데 32비트 능력을 요구하는 모순 선언(Capacitor 기본값). 현재 배포에 실피해는 없다. / **바꾸기**: `<string>armv7</string>` → `<string>arm64</string>` 3파일. / **검증**: 아카이브 후 supportedDevices 목록 유지 확인.

**S3-24. [바이너리]** `$R/wim-app/ios/App/App/Info.plist:51`, `$R/wim-app/android/app/src/main/AndroidManifest.xml:17` — WIM에 구글 **테스트** AdMob 앱 ID가 들어 있다
iOS `ca-app-pub-3940256099942544~1458002511`, Android `ca-app-pub-3940256099942544~3347511713`. 대조: SIGNUM `~4757602262`, UC `~6307534807`(둘 다 실 pub `1716731715414173`, `app-ads.txt`와 일치). 광고를 켜는 순간까지 방치하면 수익이 0으로 나간다. / **바꾸기**: 두 값을 `ca-app-pub-1716731715414173~<WIM 실 앱ID>`로 교체. 동시에 SIGNUM의 릴리즈 가드(`$R/android/app/build.gradle:34-37`, 테스트 ID면 `GradleException`)를 UC/WIM gradle에도 이식해 재발을 막는다. / **검증**: 릴리즈 빌드가 가드를 통과 + AdMob 콘솔에서 노출 카운트 발생.

---

## 4. 바이너리에 담을 것

### SIGNUM v1.2
1. **S2-12** — `ko.lproj`/`ja.lproj` `InfoPlist.strings` 실제 리소스 추가 + `knownRegions`에 ko/ja 등록. (plist `CFBundleLocalizations`는 이미 `$R/ios/App/App/Info.plist:17-22`에 있으나 **그것만으로는 스토어에 반영되지 않음이 실측됨** — 이 릴리스가 그 반증 실험이다.)
2. **S3-23** — `$R/ios/App/App/Info.plist:104` `armv7` → `arm64`.
3. (부수) UC/WIM에 이식할 릴리즈 테스트-ID 가드의 원본은 `$R/android/app/build.gradle:34-37`.

### Undercurrent 1.0.2
1. **S2-12** — `$R/uc-app/ios/App/App/Info.plist`에 `CFBundleLocalizations = [en, ko, ja]` 신규 추가 + `ko.lproj`/`ja.lproj` `InfoPlist.strings`(`NSUserTrackingUsageDescription` 번역 포함 — 현재 `:52`가 영어 하드코딩) + `knownRegions`.
2. **S3-23** — `$R/uc-app/ios/App/App/Info.plist:33` `armv7` → `arm64`.
3. **S1-3 대안을 택한 경우에만** — `$R/uc-app/android/app/src/main/AndroidManifest.xml`에 `AD_ID`/`ACCESS_ADSERVICES_AD_ID` `tools:node="remove"` 2줄. **콘솔안(광고 ID = 예)을 택했다면 이 항목은 빼고, 광고를 실제로 켜는 릴리스에서 반대로 처리한다.**

### Why'd It Move? 1.0.1
1. **S3-24** — 실 AdMob 앱 ID 2곳 교체(`Info.plist:51`, `AndroidManifest.xml:17`). **AdMob 수익화의 전제.**
2. **S2-12** — `$R/wim-app/ios/App/App/Info.plist`에 `CFBundleLocalizations` 신규 + `ko.lproj`/`ja.lproj`.
3. **S3-23** — `$R/wim-app/ios/App/App/Info.plist:33` `armv7` → `arm64`.
4. **선택 — 안드로이드 푸시를 살릴지 여기서 결정한다.** `$R/wim-app/android/app/google-services.json`을 추가하면 FCM이 살아나므로 **같은 릴리스에서 Play Data safety에 «기기 또는 기타 ID / 앱 기능» 수집을 선언하고 S1-4의 «iOS 한정» 문구를 되돌려야 한다.** 추가하지 않으면 S1-4의 웹 문구 수정만으로 3자(바이너리·Play 선언·방침)가 정합한다. **둘을 섞으면 안 된다.**

> 광고를 실제로 켜는 릴리스에서는 **S1-1(WIM 웹사이트 베어 도메인) → S3-24(실 ID) → Play «광고 포함»+Data safety → UC 애플 «추적함» 복원+ATT 호출**을 한 창에서 함께 처리한다.

---

## 5. 이번에 확인했으나 «문제 없음»으로 확정된 것

- **UC 방침·약관 오배정은 이미 수정·배포 완료** — 커밋 `e02ca7e9` 이후 `/{en,ko,ja}/undercurrent/{privacy,terms}`가 UC 전용 본문을 렌더한다(3언어 실측).
- **6개 스토어 방침 URL이 전부 올바른 앱 문서를 가리킨다** — 엉뚱한 앱 문서를 링크하는 곳은 하나도 없다(App Store·Play × 3앱 전수).
- **iOS 앱 버전 3/3이 스토어 실측과 일치** — SIGNUM 1.1 / UC 1.0.1 / WIM 1.0. (Play 웹 리스팅은 버전을 노출하지 않으므로 Play 축은 애초에 검증 불가였다.)
- **`app-ads.txt` 파일 자체는 정상** — 루트 200 / `text/plain` / `google.com, pub-1716731715414173, DIRECT, f08c47fec0942fa0` 한 줄, apex 307→www, 서브패스 사본 없음. WIM 문제는 파일이 아니라 스토어 URL 필드다(S1-1).
- **`ads.txt`가 404인 것은 정상** — 웹 광고를 팔지 않으므로 있으면 안 된다.
- **디버그 API 11개 중 10개가 이미 차단** — `kv/hub/audit/report-status/raw-connection/options-probe/guardian-test/generate-jan9/sync-report` 403, `push-status` 401. 예외는 guardian 하나(S1-11).
- **크롬 격리 정상** — UC/WIM 법률 페이지에 SIGNUM 웹 헤더·`MobileLegalFooter`가 새지 않는다.
- **네이티브 판정 격리 정상** — UC/WIM 셸에 `sig_native` 쿠키·SIGNUM 실광고·ATT가 새는 경로 없음(두 앱 번들에 `sig_native` 0건).
- **UC/WIM 언어 전환 정상** — 각각 `undercurrent.locale` / `wim.locale`을 셀프라우팅과 스위처가 **같은 키로** 읽고 쓴다. 과거의 «셀프라우팅 함정»은 두 앱 모두에서 막혀 있다.
- **`IAP_LIVE=false` 3중 정합 + 스토어 IAP 표기 0건** — 구매 불가 가격이 노출되지 않는다. Apple 3.1.1 리스크 없음.
- **앱 안에서 `/pricing`·Stripe로 유도하는 코드 0건** — `app-view/**` 전수 grep. 외부결제 유도 조항 안전.
- **WIM 안드로이드 AD_ID 권한은 실제로 제거돼 있다** — `$R/wim-app/android/app/src/main/AndroidManifest.xml:6-7` `tools:node="remove"`. UC와 정반대 상태이며 WIM 쪽이 옳다.
- **WIM 애플 App Privacy는 이미 `Device ID / App Functionality`를 선언 중** — «ASC가 데이터 미수집으로 돼 있을 것»이라는 지적은 오진이었다. 손댈 것 없음.
- **WIM 인앱 알림 스위치는 이미 iOS 전용 게이트** — 안드로이드에서는 행 자체가 렌더되지 않는다. «안드로이드에서 숨겨라»는 지시는 할 일이 없다.
- **`/en/flow/{ticker}`는 OG·canonical이 이미 페이지별로 정상** — og:title/description/url + canonical 1건. sitemap 501건이 SIGNUM 카드를 뒤집어쓴다는 서술은 사실이 아니다.
- **flow 티커 페이지 SSR은 실데이터** — NVDA 3,807자(Max pain, 다크풀 48% 등). soft-404 아님.
- **hreflang은 이미 HTTP `Link` 헤더로 제공 중** — ko/en/ja/x-default 4종. 추가 구현은 중복이 된다.
- **로케일 협상 정상** — `Accept-Language: en-US`→`/en`, `ja-JP`→`/ja`, 헤더 없을 때만 `/ko`. 미국 심사자가 한국어 페이지를 보는 일은 없다.
- **라우트 가용성 전수 200 · 죽은 링크 0 · 404는 진짜 404** — soft-200 없음.
- **스토어 스마트링크 3/3 정상** — `/app`→id6783130444, `/app-uc`→id6788779895, `/app-wim`→id6794356135.
- **연락처 주소 자체는 정확하고 실브라우저에서 정상 렌더** — `contact@signumhq.com`. Cloudflare 난독화는 사용자 노출 결함이 아니다(S3-1은 크롤러 가시성 문제).
- **`/en/admin/health`는 SSR 본문에 관리자 데이터를 노출하지 않는다** — 색인 가능성만 문제(S3-2).
- **연령등급 3앱 × 2스토어 전부 4+ / Everyone 일관**, Play 카테고리도 iOS와 일치(FINANCE/FINANCE/EDUCATION), 부제 3앱×3언어 전부 존재·30자 이내.
- **iOS 스크린샷 3앱 × us/kr/jp 전부 현지화 완료**(1284×2778). iPad 스크린샷 부재는 `TARGETED_DEVICE_FAMILY=1`이라 정상.
- **App Store 제품페이지에 «앱 지원» 링크가 안 보이는 것은 애플 웹 사양** — 대조군 Robinhood도 동일. (WIM은 실제로 지원 URL이 실려 있다.)
- **SIGNUM Play «광고 포함» 배지·Data safety가 실제 광고 송출과 일치** — 광고 켜진 앱에만 배지가 있고 UC/WIM엔 없다.

---

## 6. 감사 자체의 사각지대

1. **실기기·시뮬레이터 검증이 0이다.** 이번 감사는 라이브 URL, 배포된 JS 청크, 스토어 API/HTML, 리포지토리 파일만 봤다. **콜드스타트 실화면으로만 확인되는 것** — 한국어 단말의 실제 `navigator.language` 값, ATT 시트 실제 표시, 푸시 수신, 가로 회전 시 레이아웃 붕괴, 안드로이드 하단 인셋 실측 — 은 전부 미확인이다. 라이브 앱 변경은 시뮬 실화면 확인 후에만 배포한다는 원칙이 여기에 그대로 적용된다.
2. **네이티브 프로젝트 항목 일부가 «확인도 반증도 안 된» 채 제외됐다.** 검증자 두 명 중 한 명은 리포지토리에 접근하지 못했고(작업 디렉터리가 다른 프로젝트였다), 다른 한 명은 TASK C·D만 담당했다. 그 결과 다음 5건은 **틀렸다고 판명된 게 아니라 검증되지 않아서** 이 지시서에서 빠졌다 — ①WIM iOS Release 서명이 개발용 APNs 엔타이틀먼트를 쓴다는 지적(`wim-app/ios/App/App.xcodeproj/project.pbxproj` Release 항목) ②WIM Info.plist에 `NSUserTrackingUsageDescription`이 없어 광고 활성화 시 즉시 강제종료된다는 지적 ③UC/WIM이 가로모드를 허용한다는 지적(Info.plist·AndroidManifest `screenOrientation`) ④ATT 문구가 한/일 사용자에게 영어로 뜬다는 지적 ⑤WIM 안드로이드에 죽은 푸시 플러그인이 실려 있다는 지적. **전부 파일 5개를 열면 10분 안에 확정된다. 다음 바이너리 작업 시작 시 첫 순서로 확인할 것** — ②는 사실이라면 광고 활성화 당일 앱이 죽는다.
3. **스토어 콘솔 내부 값은 외부 관측으로 추정했다.** ASC/Play Console 폼에 실제로 무엇이 체크돼 있는지는 공개 제품페이지에 렌더되는 항목으로만 역산했다. 심사 메모, 데이터 삭제 요청 URL 필드, 광고 ID 선언 라디오 버튼 같은 **비공개 필드는 대표가 콘솔을 열어야만 확인된다.**
4. **Stripe 대시보드를 못 봤다.** S2-7의 «$69/$149로 실제 청구된 이력이 있는가»는 이 감사로 판정 불가다. 취소선을 지울지 남길지는 대표가 대시보드를 확인한 뒤 갈린다.
5. **«200이면 정상»이라는 검증이 이번에도 한 번 뚫렸다.** 첫 감사는 OG 이미지를 `HTTP 200 + image/png 91KB`로 확인하고 «깨지지 않음»으로 분류했는데, 실제 PNG를 열어보니 전 지표가 0이었다(S2-1). **발행물은 앞으로 반드시 렌더된 산출물을 열어서 검수한다** — 상태코드·Content-Type·파일크기는 이 결함을 전부 통과시켰다.
6. **동적 데이터의 시점 의존성.** 감사는 2026-08-10 프리마켓~장중 초반에 수행됐다. 세션 상태에 따라 값이 달라지는 항목(지수 변화율, 다크풀 %, VIX)은 다른 시간대에 재현하면 다르게 보일 수 있다. 다만 S2-1은 개장 26분 후에도 0이었으므로 세션 문제가 아니다.