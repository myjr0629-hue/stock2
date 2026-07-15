# UC 1.0.1 조립 계획 — AdMob 활성화 + SIGNUM v1.1 필요항목 번들 (2026-07-15, Mac)

> **목적**: UC 광고 활성화 업데이트에 "필요한 것 전부"를 한 번에 담아 **재제출 1회**로 끝낸다.
> **정본**: 이 문서 + UC 워크로그(메모리 undercurrent-prototype-worklog). SIGNUM 짝 = `.agent/SIGNUM_V1.1_BINARY_ASSEMBLY.md`.
> **실측 상태(2026-07-15)**: UC iOS ✅승인(24h 내 라이브)·Android ⏳in review · 광고 휴면(ADS_LIVE=false·샘플ID) · 별점 이미 있음.
> ⚠️ **네이티브 변경은 새 빌드에만 반영**(라이브 웹뷰 무영향). **단 `ADS_LIVE=true`(웹)는 절대 main에 미리 배포 금지** — 라이브 UC에 깨진 광고슬롯+선언 불일치. 실행은 선행조건 충족 후 1회.

## 0. 선행조건 (이거 다 돼야 착수)
1. UC 양쪽 스토어 **라이브** (iOS 24h / Android 심사 완료)
2. **AdMob 계정(Signum Hq LLC) 재승인** — 세금승인→프로필→재신청. **SIGNUM과 공유하는 그 계정.**
3. AdMob 콘솔에 **UC 앱 2개(iOS·Android) 등록** + 스토어링크 연결 → **실 App ID·유닛 ID 발급**

## 1. SIGNUM v1.1 ↔ UC 대조 (실측)
| 항목 | UC 현재 | UC 1.0.1 |
|---|---|---|
| 별점(@capacitor-community/in-app-review) | ✅ 있음(2nd/7th 에디션 자동+설정행) | **스킵(완료)** |
| AdMob SDK(@capacitor-community/admob@8) | ✅ 배선(휴면) | **활성화** |
| textZoom=100 잠금 | ❌ 없음(SIGNUM도 없음) | **넣기(공유 v1.1)** |
| Android safe-area-top | iOS contentInset 처리 · Android top 미확인 | **확인** |
| 푸시 | ❌ 없음 | **결정(§2-D)** |
| IAP 구독 | 없음 | **스킵(UC 구독 안 함)** |
| iOS 푸시 콜드스타트 fix | 푸시 자체 없음 | 푸시 넣으면 처음부터 반영 |

## 2. UC 1.0.1 변경 목록 (정확·순서)

### A. AdMob 활성화 [핵심] — 메모리 6단계 체크리스트
**네이티브(uc-app):**
- `uc-app/ios/App/App/Info.plist` L50 `GADApplicationIdentifier` 샘플(ca-app-pub-3940256099942544~…) → **`[UC-iOS-AppID]`** + **`NSUserTrackingUsageDescription` 재삽입**(현재 없음 — ATT 팝업용) + version/CURRENT_PROJECT_VERSION bump
- `uc-app/android/app/src/main/AndroidManifest.xml` L18 `APPLICATION_ID` 샘플 → **`[UC-Android-AppID]`** + **L8~9 AD_ID/ACCESS_ADSERVICES_AD_ID `tools:node="remove"` 2줄 삭제** + versionCode +1

**웹:**
- `src/app/[locale]/undercurrent/ads.ts` L26 `ADS_LIVE=true` · L27 `ADS_TESTING=false` · UNITS를 **실 유닛 ID `[슬롯]`** 으로 (현재 샘플 ca-app-pub-3940…)

**설문:**
- **ASC**: App Privacy 추적=예 + 광고데이터 수집 · 연령등급 "광고"=예 · 심사노트 "no ads served" 제거
- **Play**: 데이터안전 갱신 · "광고 포함"=예 · "광고 ID"=예

### B. textZoom=100 잠금 [신규 · SIGNUM v1.1과 공유]
- 폰트 크게 보는 사용자 레이아웃 깨짐 방지. uc-app Android WebView `settings.textZoom=100`(MainActivity 또는 상응).
- ⚠️ **네이티브 빌드로 실검증 필수(blind 금지)** — SIGNUM v1.1 assembly와 **같이 구현·검증**(둘 다 없음).

### C. Android 상단 위치(safe-area/status-bar) 수정 [확정 — SIGNUM v1.1과 동일]
- **UC Android도 SIGNUM과 같은 리모트 웹뷰 구조 → 같은 "상단 물림" 이슈 해당** (SIGNUM `SIGNUM_V1.1_BINARY_ASSEMBLY.md §2.5`의 "상단 위치" 수정과 동일 건). 지금은 UC 미승인이라 실기 확인 불가하나 **구조가 같으므로 UC 1.0.1에 포함 확정**(사용자 지시 2026-07-15).
- 실행: SIGNUM v1.1과 **같이** — `@capacitor-community/safe-area` 플러그인 + UC 루트(`.uc-slideup`/masthead)에 실측 인셋 적용, `textZoom=100`(§B)과 한 세션. **UC 승인 후 안드로이드 에뮬로 상단 갭·물림 0 실확인.** (참고: memory android-webview-safe-area-top)

### D. 푸시 [결정 필요]
- 현재 UC 푸시 **없음**(@capacitor/push-notifications 부재, "준비 중" 표기만). 딥링크는 ready.
- 넣으면: 플러그인 추가 + **UC 번들(com.signumhq.undercurrent) APNs .p8 / FCM** + 콜드스타트 딥링크(SIGNUM 인프라 재사용 — [[ios-push-via-apns-not-fcm]]). 용도=속보 알림.
- **판단**: UC는 뉴스앱 → 푸시는 리텐션 핵심. **번들 권장**(따로 하면 또 심사 1회). 단 이번 조립 최대 작업.
- 옵션: (a) 1.0.1 번들 [권장] / (b) 1.0.2 분리(ads 먼저)

## 3. 스킵 (UC엔 불필요)
- **IAP 구독** — UC 구독 안 함(확정). purchases 플러그인 부재 유지.

## 4. 이미 완료 (재작업 금지)
- **별점** = @capacitor-community/in-app-review, 2nd/7th 에디션 자동 + 설정행(무보상). ✅
- **AdMob SDK 배선** = @capacitor-community/admob@8.0.0 (iOS/Android 빌드검증). 휴면만.

## 5. 실행 순서 (계정 승인 후 1회, 기계적)
1. UC 앱 AdMob 등록 → 실 App ID·유닛 ID 확보
2. §A 슬롯(`[UC-iOS-AppID]`/`[UC-Android-AppID]`/유닛)에 실 ID 꽂기
3. §B textZoom + §C safe-area 구현 → **네이티브 빌드 실검증**(SIGNUM v1.1과 동시)
4. (§D 결정 시) 푸시 구현·검증
5. 설문 갱신(ASC+Play) → iOS 아카이브 / Android AAB → **재제출**

## 6. 준비 완료분 (이 문서 = prep)
- 대조·변경목록·슬롯·순서 확정. **막힌 것 = 선행조건(계정 승인+UC 라이브)뿐.**
- textZoom/safe-area는 SIGNUM v1.1 조립과 **묶어서** 한 번에(둘 다 신규·공유).
