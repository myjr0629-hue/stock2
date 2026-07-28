# 광고 활성화 마스터 플랜 — 3개 앱 통합 정본 (2026-07-28)

> 이 문서가 **정본**이다. 흩어져 있던 `SIGNUM_V1.1_BINARY_ASSEMBLY.md` · `UC_1.0.1_ASSEMBLY.md` ·
> 메모리(광고 6단계, admob-rejection-cycle, android-webview-safe-area-top)를 여기로 합쳤다.
> 개별 문서는 세부 구현 참조용으로 남긴다.

## 0. 오늘 바뀐 것 (2026-07-28)
- ✅ **W-8BEN 세금 승인** (결제 프로필 8577-9659-8972, 조약세율 적용: Other copyright 10% / Services 0%)
- ✅ **AdMob 계정 재제출** 완료 → 계정 심사 중
- ✅ **UC를 AdMob에 등록** → App ID 확보
- ✅ WIM Play 프로덕션 제출 (iOS는 7/25 제출, 양쪽 심사 중)

## 1. 실측 현황 (코드 직접 확인, 추측 아님)

| | **SIGNUM** (라이브) | **UC** (라이브) | **WIM** (양쪽 심사중) |
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
1. **UC 광고 유닛 6개 생성** — iOS/Android 각각 배너·전면·리워드. 이름 규칙 `UC-iOS-Banner` 식.
2. **CMP 메시지 생성** — Privacy & messaging → GDPR 메시지, 앱 4개(SIGNUM×2, UC×2) 전부. 미국 주법(CCPA) 메시지도 같이.
3. **AdMob 앱 설정 확인** — 4개 앱 모두 `Child-directed treatment` = **아니오** 유지.
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
