# WIM 광고 활성화 — 작업 기록 (2026-08-25 시작)

대표 지시: 「wim도 이제 광고 활성화 시켜야 할듯하다 홍보를 하는데 안할 이유가 없다」

## 착수 전 실측 (기억이 아니라 대조)

| 앱 | iOS 라이브 | Android 라이브 | 8/18 새 앱ID 포함 | 광고 |
|---|---|---|---|---|
| SIGNUM | 1.4 (8/23) | 1.2.1 (8/23) | ✅ | **이미 켜짐(8/19)** |
| Undercurrent | 1.0.2 (8/18) · 1.0.3 심사중 | 1.0.3 (8/23) | ✅ | **이미 켜짐(8/19)** |
| **WIM** | **1.0 (7/24)** | **1.0 (8/17)** | **❌** | **꺼짐** |

→ 즉 «WIM만» 남아 있었다. 그리고 더 큰 문제가 있었다:

## ★ WIM 은 광고 «연동 코드» 자체가 없었다

`src/app/[locale]/wim/ads.ts` 는 완성돼 있었는데 **아무도 import 하지 않았다.**
`page.tsx` 가 같은 이름의 **로컬 상수** `const WIM_ADS_LIVE = false` 를 따로 선언해서
겉보기엔 «스위치가 꺼져 있을 뿐»처럼 보였지만, 실제로는 모듈 전체가 죽은 코드였다.
스위치를 true 로 바꿔도 광고는 영원히 안 나왔을 것이다.

## 오늘 한 것 (코드)

1. `page.tsx` → `./ads` 를 실제로 import, 로컬 중복 상수 제거
2. 배너: 네이티브에서만 `initWimAds()` → `showWimBanner(84)` (탭바 위 84px 앵커),
   언마운트 시 `hideWimBanner()`
3. 인터스티셜: 예약돼 있던 슬롯(`closeQuiz(finishedAll)`)에서 `showWimInterstitial()` 호출.
   **정답 공개 «뒤», 세트 완료로 나가는 순간에만.** 하루 1회 상한 + 설치 3일 침묵은
   ads.ts 가 강제한다 (`.agent/WIM_DIRECTION.md` §4)
4. Android `AD_ID` / `ACCESS_ADSERVICES_AD_ID` 권한의 `tools:node="remove"` 제거
   — 그대로 두면 광고 ID 를 못 읽어 노필
5. 버전 1.0 → **1.0.1** (Android vc 3 / iOS build 3)

타입체크 통과.

## 자동으로 따라오는 것 (이미 설계돼 있음)

- **개인정보처리방침이 3개국어 전부 자동 전환된다.** `AppLegalDocument` 의
  `adsOn = hasRealUnits('wim')` → `applyAdsOn()`. 따로 문구를 고칠 필요가 없다.
- `adsAllowed()` 관문도 같은 조건으로 열린다.
- `public/app-ads.txt` 는 이미 `pub-9554397112094712` 로 라이브 배포 확인.

## 남은 순서 (이 순서를 지켜야 한다)

1. [나] WIM 1.0.1 빌드 (Android AAB + iOS archive)
2. [스토어] 양쪽 제출 → **라이브가 될 때까지 기다린다**
3. [스토어 선언 — 광고를 켜는 «같은 창»에서] 
   - Play: 광고=예 + 데이터 안전성(광고 ID 수집·공유, 용도=광고/부정방지)
   - ASC: App Privacy — 기기 ID, 추적 목적 사용=예
4. [나] `src/config/admob.ts` 의 `REAL_UNIT_IDS.wim = UNITS_2026_08_18.wim`
5. [나] `wim/ads.ts` 의 `WIM_ADS_LIVE = true` → 웹 배포
6. [검증] 실기기에서 배너 확인. **시뮬레이터는 실유닛이어도 "Test mode" 라벨이 뜬다 —
   그건 정상이다**(구글이 시뮬을 자동 테스트기기로 등록). 실기기에 뜨면 그때가 버그.

⛔ 4·5 를 2 보다 «먼저» 하면 안 된다. 라이브 바이너리가 옛 회사계정 앱 ID 를 들고 있어
   앱ID·유닛 게시자가 어긋나면 노필이거나 정책 위반이 된다.
