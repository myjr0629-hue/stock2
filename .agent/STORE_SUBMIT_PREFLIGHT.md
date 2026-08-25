# 스토어 제출 프리플라이트 — 「두 번 세 번 하지 않게」

대표 지시(2026-08-25): 「왜 한번에 할수있는것을 두번세번 일을 하게 하냐 신경써서 처음부터 잘해라」

제출을 시작하기 «전에» 이 파일을 연다. 아래는 실제로 우리를 되돌려 세운 항목만 남긴 것이다.
추측 항목은 넣지 않는다 — 전부 한 번씩 당해 본 것들이다.

---

## 0. 광고를 처음 켜는 릴리스인가?  → 이 묶음은 «한 자리에서» 다 한다

한 개만 빠져도 제출 버튼이 막히거나 심사에서 되돌아온다. 순서대로.

**바이너리 (앱 업데이트가 필요한 것 — 웹 배포로 못 고친다)**
- [ ] Android `AndroidManifest.xml` — `AD_ID`·`ACCESS_ADSERVICES_AD_ID` 에서 `tools:node="remove"` 제거
- [ ] Android `build.gradle` — 애드몹 **앱 ID**(`ca-app-pub-…~…`)가 «현재 계정»의 것인지
- [ ] iOS `Info.plist` — `GADApplicationIdentifier` 동일 확인 + `NSUserTrackingUsageDescription` 존재
- [ ] 버전 올렸는가 (Android versionCode, iOS CURRENT_PROJECT_VERSION)
- [ ] 빌드 «산출물»을 열어 확인한다. 소스만 보지 말 것:
      `unzip -q app-release.aab && strings base/manifest/AndroidManifest.xml | grep -E "AD_ID|ca-app-pub|버전"`

**Play Console — 세 곳이다. 「광고=예」 하나로 끝나지 않는다**
- [ ] App content → **Ads** = Yes
- [ ] App content → **Advertising ID** = Yes + 용도 체크 (광고/마케팅, 부정방지·보안)
      ⚠️ 이게 별도 항목이다. 안 하면 «Incomplete advertising ID declaration» 으로 **제출 자체가 막힌다**
- [ ] App content → **Data safety** — 기기 ID 수집·공유 + 목적
      💡 손으로 20화면 찍지 말고 **CSV 왕복**: 이미 올바른 앱에서 Export to CSV →
         선택값을 대상 앱 CSV 에 이식(삭제 URL 만 교체) → Import from CSV
         ※ 확장 업로드는 «세션이 읽을 수 있는 경로»만 된다 → 스크래치패드로 복사

**App Store Connect**
- [ ] 앱이 수집하는 개인정보 → 기기 ID = 타사 광고 / **추적 목적으로 사용됨 = 예**
      ⚠️ 안 하면 제출 API 가 `STATE_ERROR.BINARY_INDICATES_APP_TRACKS_USERS` 로 거부한다
      ⚠️ **ASC API 에 이 쓰기 경로는 없다.** 웹 UI 로 해야 한다
- [ ] 광고 데이터 = 타사 광고 / 추적 = 예

**웹(코드)**
- [ ] `src/config/admob.ts` → `REAL_UNIT_IDS.<app>` 연결 — **스토어 라이브 «후»에**
- [ ] `<app>/ads.ts` → `ADS_LIVE = true`
- [ ] 개인정보처리방침·**이용약관** 3개 국어가 「광고 없음」이라고 말하지 않는지 **전수 스캔**
      (자동 전환되지만, 완전일치 치환이라 문구가 드리프트하면 조용히 실패한다)

---

## 1. 배너 위치 — 숫자를 하드코딩하면 반드시 틀린다

| 플랫폼 | 마진 기준선 |
|---|---|
| iOS | `safeAreaLayoutGuide.bottom` — 세이프가 **이미 빠져 있다**. 더하면 이중 → 배너가 뜬다 |
| Android | 플러그인 컨테이너 바닥 = 웹뷰 바닥. 내비바를 따로 더하면 그만큼 뜬다 |

근거 정본: `src/services/adManager.ts` `computeBannerMargin()` (2026-08-20 양 플랫폼 실측)

- [ ] 탭바 위치를 **계산하지 말고 DOM 으로 잰다**. 안드로이드 셸이 인셋을 물리픽셀로 게시한
      전례가 있어(2026-08-06 삼성) 공식을 베끼면 탭바와 배너가 «따로» 어긋난다
- [ ] 회전·키보드(`resize`/`orientationchange`)에 배너가 따라가는가
- [ ] 네이티브에서 «웹 자리표시자 배너»를 같이 그려 두 겹이 되지 않는가
- [ ] 진단 문자열(`…BannerDiag()`)을 설정 화면에 노출 — 안드로이드 기기 차이는 에뮬로
      재현이 안 된다. **숫자를 추측하지 말고 실기기 스크린샷 한 장으로 받는다**

---

## 2. 판정 규칙

- [ ] 「됐다」는 **실기기 화면**으로만 말한다. 타입체크·curl 은 근거가 아니다
- [ ] 시뮬레이터 배너의 "Test mode" 라벨은 **정상**이다(구글이 시뮬을 자동 테스트기기로 등록).
      실기기에 뜨면 그때가 버그
- [ ] 커밋 전 `git status` 를 눈으로 본다. 무관한 파일은 경로 명시로만 add
