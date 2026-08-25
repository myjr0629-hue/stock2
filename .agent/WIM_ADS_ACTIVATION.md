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

---

## 2026-08-25 (2) — 제출 완료 + 「두 번 세 번 하지 않게」 정밀화

대표 지시: 「안드로이드 ios 모두 완벽하게 광고 위치가 나와야한다 … 처음부터 완벽하게」
「다른 앱에서 문제 되었던 것들이 있으면 그런점이 발생하지 않도록」

### 제출 상태
- **iOS 1.0.1 (build 4) → WAITING_FOR_REVIEW** (심사 대기)
- **Android 1.0.1 (vc 3) → Play 릴리스 저장 완료**, 광고=예 + 데이터 안전성 갱신 완료

### iOS 제출이 «한 번» 막혔던 이유 (기록)
`STATE_ERROR.BINARY_INDICATES_APP_TRACKS_USERS`
바이너리에 `NSUserTrackingUsageDescription` 이 있는데 App Privacy 는 «추적 안 함» 이었다.
→ 기기 ID: 타사 광고 + 앱 기능 / **추적 목적으로 사용됨**, 광고 데이터: 타사 광고 / **추적** 으로
   게시(SIGNUM 과 동일 형태) 후 제출 통과. **ASC API 에 App Privacy 쓰기 경로는 없다 — 웹 UI 다.**

### Play 데이터 안전성은 «CSV 왕복» 이 정답이다
손으로 20여 화면을 찍는 대신 SIGNUM → Export to CSV → 선택값 25개를 WIM CSV 에 이식
(삭제 URL 만 `/en/wim/privacy` 로) → Import. 화면 클릭 실수가 원천 차단된다.
※ 브라우저 확장의 파일 업로드는 «세션이 읽을 수 있는 경로»만 된다 → 스크래치패드로 복사해서 올린다.

### ★ 발견한 라이브 결함 — UC 약관이 «광고 없음» 이라고 말하고 있었다
`AppLegalDocument.applyAdsOn()` 이 **privacy 에만** 걸려 있었다. 그런데 「무료 이용」 문장은
**terms** 에 있다. 그래서 **8/19 부터 광고가 나가고 있는 UC 의 이용약관이 3개 국어 전부**
「현재 버전에는 … 광고도 게재하지 않습니다」 였다. 방침·약관·실동작이 서로 모순 = 심사 리스크.
- fix ①: 스위치를 privacy «와» terms 둘 다에 적용
- fix ②: 완전일치 치환이 0건이면 개발 중 `console.warn` — 문구가 드리프트해도 조용히 안 넘어간다
- 검증: 3언어 × 2앱 × (방침+약관) 전수 스캔 → 「광고 없음」 진술 0건

### ★ 배너 위치 — 숫자를 하드코딩하면 반드시 틀린다
1차 배선에서 내가 `showWimBanner(84)` 로 탭바 높이를 박아 넣었다. 이건 기록된 실패 패턴이다:

| 플랫폼 | 마진 기준선 | 결과 |
|---|---|---|
| iOS | `safeAreaLayoutGuide.bottom` — 세이프가 **이미 빠져 있음** | 세이프를 더하면 이중 → 배너가 뜬다 |
| Android | 플러그인 컨테이너 바닥 = 웹뷰 바닥 | 웹뷰 바닥부터 잰 거리를 그대로 |

(근거 정본: `src/services/adManager.ts` `computeBannerMargin()`, 2026-08-20 양 플랫폼 실측)

고친 방식 — **공식을 베끼지 않고 탭바를 «잰다»**:
- `<nav id="wim-tabbar">` 의 `getBoundingClientRect()` 로 웹뷰 바닥까지의 거리를 실측
- `margin = 거리 + 8px 간격`, iOS 는 여기서 `env(safe-area-inset-bottom)` 을 되뺀다
- 못 재면 탭바 CSS 와 «같은 공식»으로 폴백 (14 + 62 + max(env, --wim-bottom-floor))
- 회전·키보드·인셋 변화 시 `resize`/`orientationchange` 로 재배치
- 탭바가 그려진 뒤에 재도록 rAF 2프레임 대기

**왜 실측인가**: 안드로이드 셸이 `--wim-bottom-floor` 를 물리픽셀로 게시한 전례가 있다
(2026-08-06 삼성 실기기, 48dp 를 126px 로). 공식을 베끼면 탭바와 배너가 «따로» 어긋나지만,
DOM 을 재면 무엇이 오든 둘이 **같이** 움직인다.

- 진단 창구: `wimBannerDiag()` — plat/env/tabTop/inset/margin 을 한 줄로. 안드로이드 기기 차이는
  에뮬로 재현이 안 되므로 숫자를 추측하지 말고 실기기 스크린샷 한 장으로 받는다.

### 그 밖에 미리 막은 것
- **배너 두 겹**: 네이티브는 AdMob 이 웹뷰 «위»에 진짜 배너를 그린다 → 웹 자리표시자는
  `!isNativeShell` 일 때만 렌더. 본문 padding 예약은 양쪽 모두 유지.
- **하이드레이션**: `isNativeShell` 은 SSR/첫 페인트 false → 마운트 후 확정.
- **낡은 주석**: ads.ts 체크리스트가 「방침을 손으로 고쳐라」였는데, 지금은
  `hasRealUnits('wim')` 기준으로 3개 국어가 자동 전환된다. 정정했다.

### 남은 것 (순서 유지)
1. 양 스토어 라이브 확인
2. `REAL_UNIT_IDS.wim = UNITS_2026_08_18.wim` + `WIM_ADS_LIVE = true` → 웹 배포
   (이 한 번으로 방침·약관 3개 국어와 `adsAllowed()` 관문이 같이 열린다)
3. **실기기** 확인 — iOS/Android 각각 배너가 탭바에 붙는지. 시뮬레이터의 "Test mode" 라벨은 정상.
