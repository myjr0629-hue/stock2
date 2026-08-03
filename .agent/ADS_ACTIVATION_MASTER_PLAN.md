# 광고 활성화 마스터 플랜 — 3개 앱 통합 정본 (2026-07-28)

> 이 문서가 **정본**이다. 흩어져 있던 `SIGNUM_V1.1_BINARY_ASSEMBLY.md` · `UC_1.0.1_ASSEMBLY.md` ·
> 메모리(광고 6단계, admob-rejection-cycle, android-webview-safe-area-top)를 여기로 합쳤다.
> 개별 문서는 세부 구현 참조용으로 남긴다.

## 0-A. ★ 최신 상태 (2026-08-03 월, 실측)

### 스토어
| 앱 | Android (Play) | iOS (App Store) |
|---|---|---|
| SIGNUM | ✅ 라이브 | ✅ 라이브 |
| UC | ✅ 라이브 | ✅ 라이브 |
| **WIM** | ✅ **2026-08-02 승인·라이브** | ⏳ **심사 중** (7/25 제출) |

**WIM Android 라이브 실측 확인** — `play.google.com/store/apps/details?id=com.signumhq.wim`이
정식 리스팅 반환(`itemprop="name">Why'd It Move?: Stock Quiz`, `"name":"Signum HQ"`, Rated for/Downloads).
**WIM iOS는 `itunes.apple.com/lookup?bundleId=com.signumhq.wim` 결과 0건** = 아직 미등재.

**IARC 콘텐츠 등급 확정 (2026-08-02)**
```
Global Rating ID : 8b9b266a-4e50-8626-8910-3f70402fc5e0
Product          : Why'd It Move?: Stock Quiz  /  Signum HQ  /  Google Play
```
→ **이 ID는 보관한다.** 다른 IARC 가맹 스토어(원스토어·갤럭시스토어 등)에 올릴 때 이 ID를 넣으면
등급 설문을 다시 하지 않는다. 단 **설문 답이 바뀔 정도의 변경(예: 광고 추가)은 재설문 대상**이다.

### AdMob — 앱 단위 심사 중 (계정 관문은 통과)
4개 앱 전부 `Getting ready` / `Limited ad serving` / `Review in progress`, 각 `3 active` 유닛.

- ✅ **`app-ads.txt` 정상 — 직접 확인함.** `signumhq.com/app-ads.txt` HTTP 200,
  `google.com, pub-1716731715414173, DIRECT, f08c47fec0942fa0` (광고 유닛 ID와 퍼블리셔 일치).
  이게 없으면 검수가 길어지는데 이미 있다. **우리 쪽에서 더 할 게 없다.**
- ⚠️ **`Limited ad serving`이 실제로 무엇을 허용하는지는 «확인되지 않았다».**
  나는 한때 "0이 아니라 감량 송출이니 켜면 지금도 수익"이라고 적었는데 **그건 검증 없는 해석이었다**
  (검색해도 근거가 안 나왔는데 단정했다). **판별 방법은 AdMob → Reports의 노출수(Impressions)뿐이고
  그건 대표만 볼 수 있다.** 0이면 안 나가는 것, 0보다 크면 나가는 것.
- 세금 승인 7/28 → 8/3 기준 **6일 경과.** 길지 않다. **대기.**

### ⚠️ 광고가 나가려면 관문이 «둘»이다 — 혼동 금지
| 관문 | 현재 | 통제 주체 |
|---|---|---|
| **① 우리 스위치** | `ADS_LIVE = false` (UC) · `WIM_ADS_LIVE = false` (WIM, `ads.ts`·`page.tsx` 양쪽) — **실측** | **우리** |
| **② AdMob 앱 심사** | `Review in progress` | 구글 |

**①이 꺼져 있어 구글이 오늘 승인해도 광고는 0개다.** 요청 자체를 안 한다.
반대로 ①만 켜도 ②가 안 끝났으면 얼마나 나갈지 모른다(위 미확인 항목).
→ **승인 대기 후 ①을 켠다. SIGNUM은 웹 배포만으로 즉시 송출, UC·WIM은 바이너리 필요.**

### ★ 대표 판단 (2026-08-03)
**"월요일이니 며칠 더 기다려본다."** → iOS 승인과 AdMob 검수 완료를 기다린 뒤 한 번에 처리한다.

### 대기 중 — 재개 시 여기서 시작

**A. 지금도 가능한 것 (웹 배포, 앱 무관)** — 대표 판단으로 보류 중
| # | 작업 | 비고 |
|---|---|---|
| A-1 | **`/app-wim` 스마트링크** 신설 (`/app`·`/app-uc`와 동형: UA로 Play/App Store 302 + `?from=` 집계) | ⚠️ **미들웨어 matcher에 `app-wim$` 예외 추가 필수** (`/app-uc` 주석 참조) |
| A-2 | UC·SIGNUM 설정에 **WIM 행** 추가 | ⚠️ **iOS 미승인 → iOS에서는 숨김.** `/app-uc`가 반대 상황에서 쓴 그 패턴 그대로. iOS 승인되면 자동 치유 |

**B. iOS 승인 + AdMob 검수 완료 후 (한 창에서 같이)**
| # | 작업 | 비고 |
|---|---|---|
| B-1 | WIM 광고 배선 — `wim/page.tsx`가 `wim/ads.ts`를 부르게 | 현재 `ads.ts`는 main에 있으나 **호출 0곳**(실측) |
| B-2 | WIM iOS `NSUserTrackingUsageDescription` + Android `AD_ID` 복원 | **바이너리 필요** |
| B-3 | **선언 연쇄 2건** — Play 광고ID 선언 + "광고 포함", ASC App Privacy 추적 | UC 때 둘 다 제출을 막았다. WIM도 동일하게 온다 |
| B-4 | `ADS_LIVE` / `WIM_ADS_LIVE` 플래그 on + 스토어 선언을 **같은 창에서** | |

**왜 B를 나중에 묶는가**
1. 광고를 켜면 `AD_ID` 권한 때문에 **바이너리 변경**이 필요한데, iOS 승인 전에 Android만 새로 올리면 두 스토어 버전이 엇갈린다
2. AdMob이 아직 `Limited`라 지금 켜서 얻는 수익이 미미하다
3. **선언 연쇄는 제출을 막는다** — 한 번에 처리하는 편이 왕복이 적다

---

## 0. 오늘 바뀐 것 (2026-07-28)
- ✅ **W-8BEN 세금 승인** (결제 프로필 8577-9659-8972, 조약세율 적용: Other copyright 10% / Services 0%)
- ✅ **AdMob 계정 재제출** 완료 → 계정 심사 중
- ✅ **UC를 AdMob에 등록** → App ID 확보
- ✅ WIM Play 프로덕션 제출 (iOS는 7/25 제출, 양쪽 심사 중)

## 1. 실측 현황 (코드 직접 확인, 추측 아님)

> ⚠️ 아래 표의 WIM 열은 2026-07-28 기준. **Android는 8/2 승인·라이브**(§0-A 참조).

| | **SIGNUM** (라이브) | **UC** (라이브) | **WIM** (Android 라이브 / iOS 심사중) |
|---|---|---|---|
| AdMob App ID (iOS) | `~4757602262` **실** ✅ | 샘플 ❌ → **`~6307534807`** | 샘플 ❌ |
| AdMob App ID (Android) | `~8198575283` **실** ✅ | 샘플 ❌ → **`~1198944282`** | 샘플 ❌ |
| 광고 유닛 | 실 유닛 6개, `testMode:false` ✅ | 샘플 ❌ | **광고 모듈 신규 작성됨**(b1a088f9, 미배포) |
| iOS ATT 문구 | 있음 ✅ | **없음** ❌ | **없음** ❌ |
| Android `AD_ID` 권한 | 있음 ✅ | 제거됨 ❌ | 제거됨 ❌ |
| 별점(인앱 평가) | 웹 완료·**플러그인 미탑재** ❌ | ✅ 있음 | ✅ 있음 |
| 푸시 | ✅ 있음 | **없음** ❌ | iOS만 (Android는 google-services.json 부재) |
| 구독 | 웹 완료(IAP_LIVE=false) | 안 함(확정) | 안 함 |
| **광고를 켜려면** | **웹 배포만** ⭐ | **바이너리 필요** | **바이너리 필요** |

**핵심**: SIGNUM만 유일하게 앱 업데이트 없이 광고를 켤 수 있다.

## 2. AdMob App ID / 유닛 (정본 — 코드에 꽂을 값)
```
계정  ca-app-pub-1716731715414173
SIGNUM  iOS ~4757602262 / Android ~8198575283      (유닛 각 3개 = 실 ID, 코드에 반영됨)
UC      iOS ~6307534807 / Android ~1198944282

UC 광고 유닛 (2026-07-28 생성, Partner bidding 전부 미체크 = AdMob 수요 유지)
  UC-iOS-Banner        ca-app-pub-1716731715414173/6846022634
  UC-iOS-Interstitial  ca-app-pub-1716731715414173/3485930345
  UC-iOS-Rewarded      ca-app-pub-1716731715414173/4152410686   (reward: deep_unlock ×1)
  UC-Android-Banner        ca-app-pub-1716731715414173/5046424029
  UC-Android-Interstitial  ca-app-pub-1716731715414173/7900084009
  UC-Android-Rewarded      ca-app-pub-1716731715414173/4415868633   (reward: deep_unlock ×1)
  → 6개 전부 `src/app/[locale]/undercurrent/ads.ts` 에 반영 완료 (ADS_LIVE=false 유지)
WIM     미등록 (심사 통과 후 등록)
```

## 3. ★ 순서 원칙 (이걸 어기면 정책 위반)
1. **스토어 선언(광고 있음/추적 있음/데이터 안전)은 "광고가 실제로 나가는 시점"과 동시에 바꾼다.**
   미리 바꾸면 "광고 있다고 했는데 없음", 늦게 바꾸면 "광고 있는데 없다고 신고" — 둘 다 위반.
   선언은 **바이너리 없이도 수정 가능**하므로(ASC App Privacy / Play Data safety·Ads), 웹 플래그를 켜는
   그 순간에 함께 갱신하면 된다.
2. **`ADS_LIVE=true` 웹 배포는 절대 미리 하지 않는다.** 라이브 앱에 즉시 반영된다.
3. **바이너리는 AdMob 계정 승인을 기다리지 않는다.** 실 App ID·ATT 문구·AD_ID 권한만 넣고 광고는 꺼둔 채
   제출 → 승인 나면 웹 플래그 + 선언만 갱신. 바이너리를 두 번 올리지 않는 유일한 방법.
4. **심사 중인 앱의 웹은 건드리지 않는다.** WIM은 원격 웹뷰라 배포가 곧 심사 화면 변경이다.

## 4. eCPM 최대화 (효과 순)
1. **CMP(유럽 동의창)** — 없으면 EEA/UK/CH에 비개인화 광고만 → 최고단가 시장에서 반토막.
   플러그인 v8이 UMP API를 노출(`requestConsentInfo`/`showConsentForm`/`showPrivacyOptionsForm`/`resetConsentInfo`)
   → **웹 작업만으로 가능. SIGNUM은 앱 업데이트 불필요.**
2. **iOS ATT** — 동의 없으면 iOS 전체가 비개인화. SIGNUM은 문구 있음, UC·WIM은 1.0.1에서 복원.
3. **"아동 대상" 설정 OFF 유지** — AdMob 앱 설정의 `Child-directed treatment` / `Users under the age of consent`.
   하나라도 켜면 개인화 강제 차단 → eCPM 붕괴. Play 18+ 타깃 선언과 일관.
4. **app-ads.txt** — 이미 정확(`google.com, pub-1716731715414173, DIRECT, f08c47fec0942fa0`, www에서 200). 크롤 대기만.
5. **포맷 배분** — 리워드 > 전면 > 배너.
6. **미디에이션(Meta/AppLovin/Unity)** — +15~35%. **자체 데이터 쌓인 뒤**에.

## 5. 실행 계획

### A. 대표님만 가능 (콘솔)
1. ✅ **UC 광고 유닛 6개 생성 완료** (2026-07-28) — §2에 ID 기록. Partner bidding 전부 미체크.
2. ✅ **CMP 완료** (2026-07-28) — 둘 다 **Published**, 앱 4개 적용:
   - `SIGNUM + UC — GDPR` (32개 언어). **Do not consent = ON**(전 EEA 국가) — 동의율보다 계정 리스크 회피를 택함.
     Settings: 파트너 자동포함 198 · **광고 소스 자동추가 ON**(단가 레버) · Legitimate interest + 기본ON ✅ ·
     RTB 크리에이티브 검사/Consent mode/Special feature 2/Consent syncing 전부 OFF · 자체목적 0
   - `SIGNUM + UC — US states` (3개 언어, opt-out). Settings: active ad partners 331. 미국은 opt-out이라 동의율 영향 없음.
   - ⚠️ **메시지는 UMP SDK를 호출해야 표시된다** → 코드(B-1/B-2)가 들어가기 전까지 사용자에게 안 뜸. 정상.
   - ⚠️ 함정: 메시지 편집기는 **앱·URL 넣고 바로 `Save draft` 하지 않으면 초안이 날아간다**(실제로 1회 유실).
   - ⚠️ `Do not consent`를 미설정으로 두면 **Publish 버튼이 회색으로 잠긴다**(필수값).
3. **AdMob 앱 설정 확인** — 4개 앱 모두 `Child-directed treatment` = **아니오** 유지. ← 남은 콘솔 작업
4. (승인 후) **선언 갱신** — ASC App Privacy·연령등급 / Play Ads·광고ID·데이터안전.
5. (승인 후) **WIM AdMob 등록** — 심사 통과 후.

### B. 내가 하는 것 (코드)
**B-1. SIGNUM — 웹만으로 광고 100% 완성 (앱 업데이트 불필요)**
- CMP 연동을 `adManager.ts`에 추가: `requestConsentInfo` → 필요 시 `showConsentForm` → 그 다음 `initialize`.
  설정 화면에 "광고 개인정보 설정" 행(`showPrivacyOptionsForm`) 추가 — 구글이 요구.
- ⚠️ **`ADS_LIVE` 성격의 플래그는 없다**(SIGNUM은 상시 ON) → CMP 코드는 계정 승인 전에 배포해도 무해
  (광고 자체가 노필이라 안 나옴). 단 **실기기/시뮬 검증 후 배포**.

**B-2. UC 1.0.1 바이너리** (양쪽 라이브·심사 중 아님 → 언제든 제출 가능)
- iOS `Info.plist`: `GADApplicationIdentifier` → `ca-app-pub-1716731715414173~6307534807`
  + `NSUserTrackingUsageDescription` 복원 + version/build bump
- Android `AndroidManifest`: `APPLICATION_ID` → `ca-app-pub-1716731715414173~1198944282`
  + `AD_ID`/`ACCESS_ADSERVICES_AD_ID` `tools:node="remove"` **2줄 삭제** + versionCode +1
- 웹 `ads.ts`: UNITS를 실 유닛으로 (**`ADS_LIVE`는 false 유지 — 별도 배포**) + CMP 연동
- **광고 위치 재설계**(대표 지시): 배너=탭바 위 고정 / 전면=스토리 상세 이탈 시 / 리워드=딥레이어 일1회 초과분.
  가드레일 유지(세션 90초 유예·3분 간격·일 8회 캡).
- **Android 상단 인셋** — WIM에서 검증된 `WindowInsetsCompat` 네이티브 실측 방식 이식(추측값 24px 제거)
- **`textZoom=100` 잠금** (SIGNUM v1.1과 공유)
- **푸시 신규 탑재** — 플러그인 + APNs(.p8 재사용) + FCM. 뉴스앱이라 리텐션 핵심.
- 실기기/에뮬 검증 후 제출

**B-3. SIGNUM v1.1 바이너리** (UC와 같은 세션에)
- `@capacitor-community/in-app-review` 추가 + `cap sync` → 별점이 살아남(웹 코드는 이미 배포됨)
- Android 인셋(WIM 방식) + `textZoom=100`
- 1.0→1.1 / build 1→2
- 구독: 실기기 샌드박스 구매 검증 → `IAP_LIVE=true` + RC 키 + 페이월 스샷
- ASO ko/ja 키워드 보강

**B-4. WIM** — 심사 결과 대기. 광고 모듈은 작성 완료(b1a088f9, 미배포). 승인 후 1.0.1에 §8 체크리스트대로.

## 6. 타임라인
```
지금        │ A-1 유닛 생성 · A-2 CMP · A-3 아동설정 확인  ← 대표님
            │ B-1 SIGNUM CMP 코드 · B-2/B-3 바이너리 작업  ← 나
            │
AdMob 승인  │ SIGNUM: 웹 배포 + 선언 갱신 → 즉시 수익 시작
            │ UC 1.0.1 제출 (선언은 출시와 동시 갱신)
            │
WIM 심사통과│ WIM AdMob 등록 → 1.0.1 (광고 + Android 푸시)
```

## 7. 절대 하지 말 것
- `ADS_LIVE=true`를 선언 갱신 전에 배포 (정책 위반)
- 심사 중인 WIM의 웹 배포
- `Child-directed treatment` 켜기 (eCPM 붕괴)
- AppLovin 전환 (기준=세금 승인 후에도 AdMob 거절. 아직 재제출 결과도 안 나옴)
- 실기기/시뮬 검증 없이 라이브 앱 배포


---

## 8. ★ 애드몹 승인이 필요한 것 / 아닌 것 (2026-07-29 대표 확인)
**승인을 기다려야 하는 것은 딱 둘뿐이다.**
| | 승인 필요? |
|---|---|
| `ADS_LIVE=true` 웹 배포 + 스토어 선언 변경 | ⛔ **필요** |
| WIM AdMob 등록 | ⛔ WIM **스토어** 승인 후 (AdMob 승인과 별개) |
| UC 1.0.1 바이너리 전체 (실 App ID·ATT·AD_ID·인셋·푸시) | ✅ 불필요 — App ID는 2026-07-28 확보 완료 |
| SIGNUM v1.1 전체 (구독·별점·인셋) | ✅ 불필요 — 애드몹과 무관 |
| Play 구독 상품 생성 파이프라인 | ✅ 불필요 |
| 코드/설정 화면 작업 전부 | ✅ 불필요 |
→ **지금 만들어두면 승인 당일 웹 배포 1회로 수익 시작.** 기다렸다 시작하면 거기서 심사 2~3주가 더 붙는다.

## 9. 앱별 광고 구조 (코드 실측)
| | 배너 | 전면 | 보상형 | 구독 |
|---|---|---|---|---|
| SIGNUM | 하단 고정 | 있음 | **ValueWall 잠금해제** | $9.99/월 (v1.1) |
| UC | 탭바 위 | 스토리 상세 이탈 시 | **딥머니레이어 해제**(`unlockWithAd`, 무료 1회 초과분) | **안 함(확정)** |
| WIM | 탭바 위 | 하루 1회·정답 공개 후 | 사용자 개시 | 안 함 |
> ⚠️ 대표가 "UC엔 보상형이 없다"고 기억했으나 **코드상 있다.** 없는 것은 **구독**이다. 혼동 주의.

## 10. 스토어 선언 현황과 변경 대상
- **SIGNUM**: 실 광고 유닛 탑재 + **추적=예**로 신고됨 → 광고가 나가도 **선언이 이미 사실**. 변경 불필요.
  - ⚠️ **미확인 1건**: Play "광고 포함" 체크박스가 실제 "예"인지 콘솔 확인 필요. "아니요"면 송출 시작 시 위반.
- **UC**: **"무추적"으로 신고**됨 → 광고 켜는 순간 거짓. **1.0.1 출시와 동시에** 갱신:
  ASC(추적=예·기기ID+광고데이터 / 연령등급 광고=예 / 심사노트 "광고 없음" 삭제) · Play(광고 포함=예 / 광고 ID=예 / 데이터안전 재제출)
- **WIM**: v1.0은 광고 없음이 사실. 1.0.1에서 §8 체크리스트대로 갱신.

## 11. 구독 — 안드로이드가 막힌 진짜 이유 (세금 아님)
- **애플**: 상품 `com.signumhq.app.pro.monthly` 생성·가격·en/ja/ko·132개국 **완료**
- **안드로이드**: **결제 플러그인이 포함된 AAB를 테스트 트랙에 먼저 올려야** Play가 "구독 만들기"를 열어준다. 그게 미완이라 막힌 것.
- 순서: RevenueCat 포함 AAB → Play 테스트 트랙 → 구독 상품 생성 → RevenueCat↔Play 연결(서비스계정 JSON) → **실기기 샌드박스 구매 성공 확인** → `IAP_LIVE=true` → 페이월 스샷 → v1.1 제출
- ⚠️ **실기기 구매 성공 전 `IAP_LIVE=true` 금지** (현 라이브 바이너리에 RC 플러그인 없음 → 구매 크래시 → 3.1.1)
- ⚠️ Play **15% 수수료 등록** + **Mercury 마이크로디포짓 검증**은 구독 라이브 전 필수

## 12. UMP를 넣고/안 넣고의 차이
- **수익**: 2024년부터 구글은 EEA/UK 광고 송출에 **인증 CMP를 요구**. 없으면 개인화 불가 → 비개인화는 통상 단가 절반 이하. 유럽은 미국 다음 시장.
- **UX**: 영향 거의 없음 — **EEA/UK/CH 사용자에게만 첫 실행 1회**. 미국·한국·일본은 `NOT_REQUIRED`로 조용히 통과, 평생 안 봄. 광고 로드 전에 처리돼 화면 끊김 없음.

## 13. 작업 로그
- 2026-07-28 `13ad012a` UC 실 유닛 6개 배선 + `ADS_TESTING=false`
- 2026-07-28 `b1a088f9` WIM 광고 레이어 신규 작성 (미배포·심사중)
- 2026-07-28 `6ccfc53c` **UC에 없던 UMP 동의 흐름 이식** (SIGNUM 구현 이식: ATT 상태확인+900ms 지연 → requestConsentInfo/showConsentForm → initialize) + `needsPrivacyOptions()`/`openPrivacyOptions()` 노출
- 2026-07-29 `bca5c07a` **UC 가짜 네이티브 광고 자리 6개 + 컴포넌트 + ko/en/ja 문구 제거** (플러그인에 네이티브 포맷 없음 → 영원히 못 채움. 현 빌드엔 no-op)
- ✅ 실측 확인: **SIGNUM은 UMP·ATT가 이미 구현돼 있었다** (`adManager.ts` init). 승인 즉시 오늘 만든 CMP가 그대로 뜬다.
- ⏳ 미배포 (WIM 심사 중 + UC는 1.0.1과 함께 나갈 예정)


## 14. v1.1 / 1.0.1 조립 결과 (2026-07-29)

### SIGNUM v1.1 (`89c77867`) — 1.0→1.1, build 1→2, versionCode 1→2
- ✅ `@capacitor-community/in-app-review` 탑재 → **별점이 비로소 동작**(웹 코드는 1.0부터 있었으나 플러그인이 없어 무동작)
- ✅ Android 인셋 네이티브 실측(`--sig-top-floor`/`--sig-bottom-floor`) + `textZoom=100`
  - ⚠️ CSS 폴백은 **기존 24px 유지**. signumhq.com은 **1.0 사용자와 공유**되므로 네이티브 발행기가 없는 그들의 동작이 바뀌면 안 됨.
- ✅ 광고: 손댄 것 없음(이미 실 ID·ATT·UMP 완비)

**빌드 중 발견한 실제 문제 2건**
1. `cap sync`가 **`@capacitor-community/fcm`을 되살림** — 1.0 Android 빌드는 이걸 일부러 제외했었다.
   **양쪽 플랫폼 모두 호출 0**(iOS는 직접 APNs, Android는 `@capacitor/push-notifications`+google-services.json),
   게다가 그 플러그인 build.gradle이 빌드를 깨뜨림 → **패키지째 제거**(재발 방지). 낡은 주석도 정정.
2. 이어서 in-app-review도 같은 이유로 실패 → **SIGNUM만 AGP 9.2.1 / Gradle 9.4.1** 이었고,
   **AGP 9가 `getDefaultProguardFile('proguard-android.txt')`를 제거**했음. Capacitor 커뮤니티 플러그인들이 아직 그 API 사용.
   → **AGP 8.13.0 / Gradle 8.14.3** 으로 정렬(= UC가 같은 저장소·같은 플러그인으로 프로덕션 중인 조합). **빌드 성공(399 tasks)**.
   ⚠️ **AGP를 다시 9로 올리지 말 것** — 플러그인들이 대응할 때까지.

### 구독 부품 판단 (대표 확인, 2026-07-29)
`cap sync`가 RevenueCat을 양쪽에 넣음. **그대로 두기로 결정.**
- **기능은 v1.2 그대로** — 사용자에게 보이는 것 0. 코드 실측: `IAP_LIVE=false`(`src/config/iap.ts:16`),
  `initRevenueCat()` 첫 줄 `if (!IAP_LIVE) return false`, 유일 호출처 `useProStatus`도 `if (!IAP_LIVE) return`,
  플러그인은 동적 import → **한 줄도 실행되지 않음**.
- **이유**: 빼면 v1.2 때 바이너리를 또 올리고 심사를 또 받아야 함. 넣어두면 §11의 관문
  ("Play는 결제 플러그인 든 바이너리를 올려야 구독 상품 생성을 열어줌")이 v1.1로 해제됨.
- **대가**: Play 스토어에 "인앱 구매" 라벨이 붙음(아직 살 것은 없음). 이 트레이드를 수용.

### UC 1.0.1 (`091e10c0`·`442572b5`·`a1668dc6` 외) — 1.0→1.0.1, build 2→3, versionCode 2→3
- ✅ 실 유닛 6개 · UMP 동의 흐름 이식 · 가짜 네이티브 광고 자리 6개 제거
- ✅ iOS 실 App ID + **ATT 문구 복원** / Android 실 App ID + **AD_ID 권한 복원**
- ✅ Android 인셋 실측(`--uc-top-floor`/`--uc-bottom-floor`) + `textZoom=100` — **JDK21 컴파일 성공**
- ✅ 설정 화면 "광고 개인정보" 행(ko/en/ja)
- ⛔ **푸시는 1.0.2로 미룸**(대표 결정) — 가장 큰 작업이라, 광고 준비를 사용자 폰에 먼저 깔기 위해

### 남은 것
- UC·SIGNUM **에뮬레이터/시뮬 실화면 검증** → 그다음 제출
- 설정 화면 버전 표기(SIGNUM `v1.0.0`→`v1.1.0`, UC `1.0.0`→`1.0.1`)는 **바이너리가 라이브 되는 배포와 같은 타이밍**에

## 15. 실화면 검증 결과 (2026-07-29) — ★ 검증이 실제로 버그를 잡았다

### 환경
- **Galaxy A32 실기기 · Android 13** (무선 디버깅으로 연결). 스토어판과 signature 충돌 → UC 디버그에 `applicationIdSuffix '.debug'` 추가해 **나란히 설치**(대표 폰의 앱·데이터 무손상).
  ⚠️ SIGNUM은 `google-services.json`이 패키지명에 묶여 있어 접미사 사용 불가 → 에뮬레이터로만 검증.
- **에뮬레이터 `a15_verify` · Android 15(API 35) · RAM 4GB · `-gpu host`**.
  ⚠️ 기존 `signum_test`(RAM 2.5GB)는 **패키지 서비스가 죽어 설치 자체가 불가**했다. 소프트웨어 렌더링(`swiftshader`)도 `Process system isn't responding` 유발 → **`-gpu host` + RAM 4GB 필수**.

### ★ 발견한 버그 (코드리뷰·컴파일로는 절대 안 잡히는 것)
**1차 수정이 틀렸다.** 인셋을 **DecorView 기준**으로 읽었는데, 창은 웹뷰가 이미 상태바 아래로 밀려 있든 말든 **항상 전체 바 높이를 보고**한다. Android 15에서는 웹뷰가 이미 밀려 있어 **상태바 높이가 두 번 더해졌다.**
- 실측: UC 마스트헤드 y ≈ **185 → 298 → 185** (수정전 → 1차수정(과다) → 2차수정(정상))
- **3개 셸 전부 같은 결함**(WIM이 원본) → 함께 수정
- **해결**: 웹뷰의 화면상 실제 위치를 재서 **아직 안 덮인 만큼만** 발행. 플랫폼이 처리한 환경은 0, 아닌 기기는 부족분만. 안드로이드 버전에 관계없이 자동 보정.

### 검증 통과 항목
| 항목 | 결과 |
|---|---|
| UC · Android 15 상단 물림 | ✅ 정상 |
| UC · Android 15 하단 탭바 ↔ 제스처바 | ✅ 겹침 없음 |
| UC · **시스템 글꼴 150%** | ✅ 레이아웃 유지(115% 상한이 흡수) |
| UC · Android 13 실기기 회귀 | ✅ 스토어판과 동일 |
| SIGNUM · Android 15 온보딩→대시보드 | ✅ 정상, 크래시 없음 |
| 가짜 네이티브 광고 자리 6개 | ✅ 배포본에서 0건 |

### 부수 발견
- **textZoom 100 고정 → 115 상한으로 변경.** A32 실기기에서 대표가 키워둔 시스템 글꼴을 우리가 되돌려버리는 게 눈으로 확인됐다. 레이아웃은 지키되 사용자 설정을 존중.
- **A32(Android 13)로는 이 버그를 재현할 수 없다** — 엣지투엣지 강제는 **Android 15+**에서만 발동. 대표가 "내 폰은 잘 나온다"고 한 것과 일치. 앞선 두 앱의 "기기마다 다르다"는 사실 **안드로이드 버전 차이**였다.
- SIGNUM 대시보드 상태바가 흰 배경+흰 아이콘이라 시각이 잘 안 보임 — **기존 동작, 이번 범위 밖**. 별건으로 처리할 것.

## 16. iOS 시뮬 검증 결과 (2026-07-29) — 4개 플랫폼 전부 통과

### UC iOS (1.0.1 · build 3)
바이너리 실측: 버전 **1.0.1/3** · AdMob **`~6307534807`** · **ATT 문구 존재**. 홈 화면 정상(노치 회피·탭바·가짜 광고 자리 0·크래시 0). iOS는 `env()`가 정상 동작하므로 인셋 변경 영향 없음.

### SIGNUM iOS (1.1 · build 2)
바이너리 실측: **1.1/2** · AdMob **`~4757602262`** · ATT 문구 · **InAppReview 플러그인 탑재 확인**.
- ✅ **ATT 동의 팝업이 실제로 표시됨** — 2026-07-08 2.1 리젝의 바로 그 항목
- ✅ 푸시 권한 요청 정상
- ✅ 온보딩 2단계 → 대시보드 정상, 라이브 데이터 렌더
- ✅ **설정에 "앱 평가하기 — App Store에서 별점 남기기" 행 표시** = v1.1 핵심 기능이 실제로 살아남(v1.0에선 플러그인 부재로 미표시)

### ★ 중간에 잡은 문제: fcm 제거가 iOS 빌드를 깨뜨림
`AppDelegate.swift`가 `FirebaseCore`/`FirebaseMessaging`을 import하는데 그 의존성이 **fcm 플러그인을 통해** 들어온다. 패키지를 지우자 Swift 컴파일이 `unable to resolve module dependency: FirebaseCore`로 실패.
- **되살림**(`8ce91481`). 플러그인은 실제로 죽은 코드지만, 걷어내려면 **라이브 앱의 푸시 등록 경로**를 손대야 하고 거기서 반드시 살아야 하는 `capacitorDidRegisterForRemoteNotifications` 한 줄은 **시뮬레이터로 검증 불가**. 수백 KB 아끼려고 푸시를 걸 수 없다.
- ⚠️ 애초 Android 실패는 fcm 탓이 아니라 **AGP 9의 proguard API 제거** 탓이었다. **AGP 8.13에서는 fcm 포함해도 정상 빌드**(실측).

### ⏳ 제출 후 반드시 할 것
**설정 화면 버전 표기가 아직 옛 값**이다(SIGNUM `v1.0.0`, UC `1.0.0`). 지금 바꾸면 **아직 업데이트 안 한 사용자에게 거짓 표시**가 되므로, **각 앱이 스토어에 라이브된 뒤** 웹 배포로 바꾼다.
- SIGNUM: `src/app/[locale]/app-view/settings/page.tsx` `versionNum` → `v1.1.0`
- UC: `src/app/[locale]/undercurrent/page.tsx` 하단 `{t.stVersion} 1.0.0` → `1.0.1`

## 17. ★ 제출 진행 체크리스트 (2026-07-29 시작) — 여기 보고 이어서 진행
빌드·검증 완료. 산출물 = `~/Desktop/업데이트 제출 (UC 1.0.1 + SIGNUM v1.1)/` (AAB 2개 + 안내문).
AAB 실측: UC(pkg·`~1198944282`·AD_ID·서명 ✅ 7.3MB) / SIGNUM(pkg·`~8198575283`·AD_ID·서명 ✅ 16.5MB)

| # | 작업 | 담당 | 상태 |
|---|---|---|---|
| 1 | UC 안드로이드 AAB (versionCode 3) | 대표 | ✅ **제출** |
| 2 | SIGNUM 안드로이드 AAB (versionCode 2) | 대표 | ✅ **제출** |
| 3 | UC iOS (1.0.1 / build 3) | 대표 | ✅ **제출** (2026-07-29 21:47, 제출ID 3d925ee3-830b-48dd-b390-ca113e44de8d) |
| 4 | SIGNUM iOS (1.1 / build 2) | 대표 | ✅ **제출** (2026-07-29 22:03, 제출ID f2f33f0a-1070-4d13-8fe3-ae60c564a5d9) |

### ✅ 2026-07-29 — 4건 전부 제출 완료. 이제 심사 대기.
- iOS 아카이브는 **내가 `xcodebuild archive`로 만들어 `~/Library/Developer/Xcode/Archives/<날짜>/`에 배치**하면
  대표는 Organizer에서 **Distribute만** 누르면 된다. Archive를 대표가 돌릴 필요 없다(다음에도 이렇게 할 것).
- **SIGNUM 1.0 심사 노트는 원래 비어 있었다** — 대신 첨부파일 `signum-att-verification.mp4`(7/8 ATT 리젝 소명 영상)가 있었다.
  1.1에는 영상 재첨부 불필요(ATT 동작 동일).
- **새 iOS 버전은 프로모션 텍스트가 승계되지 않는다**(UC·SIGNUM 둘 다 빈 칸이었음). 매번 수동 복원 필요.

**★ 제출 중 두 번 걸린 것 — 다음에도 반드시 걸린다**
내가 "이번엔 스토어 신고를 바꾸지 말자"고 했으나, **광고 권한/문구를 복원한 것 자체가 신고를 강제**했다. 두 번 다 미리 못 봤다.
1. **Play**: `AD_ID` 권한 복원 → "광고 ID 사용" 선언 필수. `아니요`로 두면 **구글이 권한을 강제 제거**해 나중 웹 플립이 무력화된다.
   → **`예` + 용도 `Advertising or marketing` 하나만**. (SIGNUM은 이미 선언돼 있어 안 걸림)
2. **ASC**: `NSUserTrackingUsageDescription` 추가 → **App Privacy 추적 답변 필수**(빨간 오류로 제출 차단).
   → **데이터 수집=예 → 식별자 `기기 ID`만 → 목적 `타사 광고`만 → 신원 연결=아니요 → 추적 사용=예**. SIGNUM과 동일 구성.
⚠️ **WIM 1.0.1에서도 똑같이 걸린다**(같은 항목을 복원할 예정). 미리 준비할 것.
⚠️ 연령등급의 "광고" 문항은 **강제되지 않았고 이번에 안 건드림** — 실제 송출 시 변경.

**부수 확인**: UC iOS 새 버전 페이지는 **프로모션 텍스트가 승계되지 않는다**(빈 칸). 수동 복원 필요.
**부수 발견**: UC Play 설치 **0건 / 3개국** → [[uc-needs-aggressive-marketing]]

**진행 원칙(대표 확인)**: 안드로이드 2개 먼저(파일 준비 완료·업로드 단순) → 그 심사가 도는 동안 iOS Archive.
UC를 SIGNUM보다 먼저(SIGNUM이 사용자·수익 모두 크므로 검증된 절차로 나중에).

**이번 제출에서 절대 바꾸지 않는 것**: 스토어 광고/추적 신고. 이번 바이너리는 광고 OFF라 **현재 신고가 사실**이다.
바꾸는 시점은 §10 — AdMob 승인 후 `ADS_LIVE=true` 배포와 **같은 순간**. 미리 바꾸면 "광고 있다고 신고했는데 없음"이 되어 위반.

**출시 노트 3언어**는 Desktop 안내문에 태그 포함으로 준비됨(UC=레이아웃/글꼴 수정, SIGNUM=+별점 추가).

**출시 후 대기 항목**: 설정 화면 버전 표기(SIGNUM `v1.0.0`→`v1.1.0` @ `app-view/settings/page.tsx` versionNum,
UC `1.0.0`→`1.0.1` @ `undercurrent/page.tsx` 하단). **스토어 라이브 확인 후** 웹 배포로.

**미확인 1건**: SIGNUM Play "광고 포함" 체크박스 실제 값 — 광고 켜는 날 콘솔에서 확인 필요.
