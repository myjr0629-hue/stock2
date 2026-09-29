# «내 종목» 홈 화면 위젯 설계서 — 2026-09-29

> 대표 지시(9/29): «위젯까지도 하도록해 … 위젯역시도 완벽하게 만들고 디자인도 그렇고 그렇게 해서 업데이트 작업까지 이어가도록해»
> · «현 디자인에 녹아들게 · 직관적 · 조잡하지 않게 프리미엄» · «티커 심볼은 실제 심볼(로고)이 들어가야» · «무료는 자기 폰에서 가능 — 그게 장점».
> 브랜치 `feat/watchlist-widgets` (운영 main f73d2e775 기준). 스토어 제출·운영 배포는 이 문서 범위 밖(메인이 대표 확인 후).

## 0. 한 줄 결론
앱의 «내 종목»(폰 저장 · 무료 5 / PRO 100)을 **웹뷰 → 네이티브 브리지**로 App Group(iOS)·SharedPreferences(안드로이드)에 넘기고,
위젯이 **앱이 이미 쓰는 요청**으로 값을 받아 **대시보드 «내 종목» 카드와 같은 남색·금색 하트** 모양으로 그린다 —
가격·등락은 앱 공용 시세 `/api/live/quotes`(앱 전체가 쓰는 한 줄기 · 대표 9/30 «즐겨찾기가 별도로 운용할 이유가 없다»),
포지셔닝 바의 옵션 레벨만 기존 `/api/watchlist/batch?mode=price`(바를 그리는 중간·큰 크기만).
새 서버 경로·새 벤더·새 비용 0. 위젯은 **모두에게**(정보 잠금 없음).

## 1. 크기별 화면

| 크기 | 보이는 것 | 누르면 |
|---|---|---|
| iOS systemSmall · 안드로이드 2×2 | 머리(금색 하트 + «내 종목») · 앞 3종목: 로고 · 티커 · 가격(작게) · 등락(초록/빨강) | 위젯 전체 → «내 종목» 화면 |
| iOS systemMedium · 안드로이드 4×2 | 머리 + 기준 라벨(«9/29 장중 · 23:42» / «9/28(월) 종가») · 앞 3종목: 로고 · 티커+이름 · **미니 포지셔닝 바** · 가격 · 등락 | 행 → 그 종목(Flow) · 머리 → «내 종목» |
| iOS systemLarge · 안드로이드 4×4 | 머리 + 기준 라벨 · 앞 6종목: 위와 같고 바 아래 양 끝에 풋 플로어·콜 월 숫자 | 같음 |
| iOS accessoryRectangular(잠금화면) | 앞 3종목 «티커 ▲0.66%» 세 줄(잠금화면은 단색 — 색 대신 ▲▼) | «내 종목» 화면 |

- **목록 순서 = 앱 목록 순서 앞에서부터**(편집 모드에서 끈 순서 그대로). 크기가 허락하는 만큼만 앞에서 자른다.
  - 안드로이드는 칸 높이가 기기·런처마다 달라 **들어가는 만큼**(최대 2×2·4×2 4행 · 4×4 8행) 그린다 — 3·6행에 묶으면 키 큰 칸(픽셀 런처)에서 아래가 빈다. 4×3 으로 줄이면 5행.
- **위젯 고르기 예시**: NVDA·META·AMZN·GOOGL·PLTR(스토어 자료와 같은 종목 · 무료 한도 5) — 안드로이드 미리보기 이름은 기기 언어(ko/ja/en), iOS 갤러리는 앱 언어.
- **미니 포지셔닝 바**: 풋 플로어(왼끝) ─ ◆맥스 페인(금색) ─ ●가격(시안) ─ 콜 월(오른끝). 앱의 지도(PositionMap)와 같은 색·같은 기하.
  - `levelsSource === 'structure'` 이고 앱과 같은 **정의 검사**(콜 월 ∈ (S, 1.2S] · 풋 플로어 ∈ [0.8S, S) · 맥스 페인 |K−S| ≤ 0.2S · 감마 플립 |K−S| ≤ 0.15S)와
    **판본 날짜 검사**(2거래일 이상 늦으면 숨김)를 통과할 때만 그린다. 아니면 **바를 생략**(숫자를 지어내지 않는다 — watchlistInsights.checkLevels 이식).
- **빈 상태**: 담은 종목이 없으면 한 줄 «앱에서 ♡ 로 담으면 여기 보입니다» + «앱 열기» 칩. 새 앱을 아직 한 번도 안 열었으면(목록 미수신) «앱을 열면 내 종목이 여기 보입니다».
- **값 없음**: 가격을 못 받은 종목은 «—»(0.00% 로 그리지 않는다). 네트워크 실패 시 마지막 정상값을 흐리게(앱의 dStale 과 같은 0.5 불투명도) + 기준 라벨은 그 값의 시각.

## 2. 디자인 — «현 디자인에 녹아들게»(새 색·새 모양 없음)

| 요소 | 값(앱 출처) |
|---|---|
| 바탕 | `dSurf` 그대로: linear 158° #111b2e → #0a1220 + 왼쪽 위 금빛 rgba(251,191,36,.07) + 청 rgba(56,102,180,.24) + 보라 rgba(88,58,168,.22) · 안쪽 금색 머리카락선 rgba(251,191,36,.10) |
| 머리 | 채운 금색 하트(#FBBF24 · 선 #F59E0B — 앱 WlIcon heart 경로 그대로) + «내 종목 / My Watchlist / マイ銘柄»(800) |
| 행 | 티커 800 · 이름 #8ea3c2 · 가격 #dbe5f1 표 숫자 · 등락 800 초록 #34d399 / 빨강 #f87171 / 보합 #94a3b8 · 마이너스는 U+2212 · 행 사이 rgba(255,255,255,.055) 선 |
| 로고 | 앱 AppTickerLogo 규칙 그대로: 불투명 정사각 아이콘은 원을 꽉 채움(cover), 투명·가로형 마크는 밝은 칩 위에 여백(contain) · 폴백 이니셜 칩도 같은 색(hashHue) |
| 지도 | 트랙 rgba(148,163,184,.17) 4pt · 양 끝 눈금 #71859f · ◆ #fbbf24 · ● #22d3ee(빛) · 띠는 슬레이트(● 쪽 짙게) — 금색은 ◆ 와 하트에만(C6) |
| 글꼴 | 시스템(iOS SF · 안드로이드 Roboto) · 숫자는 표 숫자(tabular) |
| 모드 | 다크 전용(앱과 같음). iOS 18 틴트/스탠바이에선 하트·머리만 강조색, 나머지는 시스템이 단색화 |

## 3. 데이터 흐름

```
[웹뷰] watchlist store(localStorage sg-watchlist-v1) ──구독──▶ widgetBridge.ts
      │  setWatchlist({v, tickers, names, locale, updatedAt, holidays})   ← 시작 1회 + 목록/언어가 바뀔 때마다(같은 값이면 안 보냄)
      │  setLogos({logos:{T: png base64}})                                ← 앞 12종목, 앱이 그리는 로고 그대로 래스터화(SVG 포함) · 7일에 한 번
      ▼
[네이티브 플러그인 WidgetBridge]  iOS: App Group group.com.signumhq.app (UserDefaults + 로고 파일) → WidgetCenter.reloadAllTimelines()
                                  안드로이드: SharedPreferences + files/widget-logos → 위젯 갱신 작업(WorkManager 1회)
      ▼
[위젯] 가격: GET /api/live/quotes?symbols=앞 N개 (앱 공용 시세 — OnePipe·대시보드와 같은 숫자)
       레벨: GET /api/watchlist/batch?mode=price&tickers=… (중간·큰 크기만 · 프리마켓 등락 null 폴백도 여기서)
       → 행 그리기 · 마지막 정상값 저장(1분 안에 받은 값이면 여러 위젯이 한 번만 묻는다)
       로고: 브리지가 준 PNG → 없으면 /api/logo/<T>?v=3 (PNG 면 앱과 같은 cover/contain 판정 · SVG 면 앱 폴백과 같은 이니셜 칩을 네이티브로)
```

- **로고를 웹이 래스터화하는 이유**: `/api/logo` 는 종목에 따라 **SVG**(AMZN 큐레이션·이니셜 폴백)를 준다(9/29 실측: NVDA·TSLA·MU png · AMZN·미지 종목 svg).
  위젯(iOS UIImage·안드로이드 BitmapFactory)은 SVG 를 못 그린다. 웹뷰는 이미 그 로고를 그리고 있으니 **같은 그림을 PNG 로 넘기면** 서버 변경 0 으로 «앱과 같은 로고»가 된다.
- 옛 앱 바이너리·웹 브라우저에서는 `Capacitor.isPluginAvailable('WidgetBridge')` 가 거짓 → **아무 일도 하지 않는다**(운영 웹에 먼저 나가도 안전).

## 4. 갱신 주기

| | 언제 |
|---|---|
| 앱에서 목록·순서·언어가 바뀜 | 즉시(iOS reloadAllTimelines · 안드로이드 1회 작업) |
| iOS 타임라인 | 정규장(ET 09:30–16:00 거래일) 15분 · 프리마켓 60분(개장 1분 뒤로 당김) · 그 밖 60분 — 하루 약 40회로 WidgetKit 예산 안 |
| 안드로이드 | WorkManager 주기 30분(네트워크 있을 때) + 위젯 추가·크기 변경 때 1회 |

표시값의 뜻은 앱과 같다: 세션 `reg` 면 «장중 + 받은 시각», 그 밖이면 «마지막으로 끝난 정규장 날짜 종가»(휴장 달력은 앱이 브리지로 넘기고, 없으면 내장 2026–27 표).

## 5. 누르면 — 딥링크

- 스킴 `signumhq-app://` (iOS Info.plist CFBundleURLTypes 에 등록 · 안드로이드는 위젯이 MainActivity 로 **명시적 인텐트**(ACTION_VIEW + 같은 URI)를 보내 인텐트 필터 없이 동작).
  - `signumhq-app://ticker/NVDA` → `/{locale}/app-view/flow?t=NVDA&from=widget` (알림·«내 종목» 목록 행과 같은 종목 화면)
  - `signumhq-app://watchlist` → `/{locale}/app-view/watchlist`
- 경로: 네이티브 → Capacitor App 플러그인 `appUrlOpen`(콜드 스타트는 `retainUntilConsumed` + `getLaunchUrl`) → widgetBridge 가 **티커 정규식으로 검사한 뒤** 라우터로 이동.
  콜드 스타트는 푸시 딥링크와 같은 `signumhq.pendingDeepLink`(NativeAppProvider 가 /dash 리다이렉트 뒤 다시 적용)를 쓴다. locale 은 resolveAppLocale()(URL 을 믿지 않는다).

## 6. 언어(ko/en/ja)

| | ko | en | ja |
|---|---|---|---|
| 위젯 이름(갤러리) | 내 종목 | My Watchlist | マイ銘柄 |
| 설명(갤러리) | ♡ 로 담은 종목을 홈 화면에서 | The stocks you ♡, on your Home Screen | ♡で追加した銘柄をホーム画面に |
| 머리 | 내 종목 | My Watchlist | マイ銘柄 |
| 빈 상태 | 앱에서 ♡ 로 담으면 여기 보입니다 | Tap ♡ in the app to see stocks here | アプリで♡を押すとここに表示されます |
| 기준 | 9/29 장중 · 23:42 / 9/28(월) 종가 | Intraday · 11:42 PM / Mon 9/28 close | 9/29 取引中 · 23:42 / 9/28(月) 終値 |

갤러리 글자는 기기 언어(시스템이 고른다), 위젯 안 글자는 **앱에서 고른 언어**(브리지가 넘긴 locale — 없으면 기기 언어).

## 7. 무료 / PRO
위젯은 **모두에게 같은 정보**다(정보 잠금 금지 — 법적 전제). 무료 사용자의 목록은 최대 5종목이라 큰 위젯도 5행까지. PRO 권유 문구를 위젯에 넣지 않는다(설명 최소 원칙).
«무료도 자기 폰에서» = 위젯은 서버 계정 없이 폰 안의 목록만 읽는다 — 이것이 장점이다(설치 즉시·로그인 0).

## 8. 경쟁 앱 관행 — 빌릴 것 · 더 나을 것

| 앱 | 관행(확인 수준) | 빌릴 것 | 우리가 더 나은 것 |
|---|---|---|---|
| Robinhood | Portfolio(소·중) · Holdings & Lists(**중 2줄 · 대 5줄**), 편집으로 목록·밝기 선택 — 공식 지원 문서 확인 | 중·대 = 목록, 목록 순서 그대로 | 가격·등락만 → 우리는 **행마다 옵션 포지셔닝 바**(풋 플로어·맥스 페인·콜 월) |
| Apple 주식 | 관심 목록 위젯은 크기에 따라 종목 수가 달라지고 «더 많은 종목/자세히» 토글 — 공식 문서 확인(정확한 줄 수 미확인) | 잠금화면 직사각형 위젯 · 한눈 숫자 | 레벨 정보 없음 · 한국어 이름 없음 |
| Yahoo Finance · Webull · 토스 | 관심종목 목록형 위젯(스파크라인·가격) 제공 — **세부 크기·줄 수는 미확인(추정)** | 로고+티커+가격+등락 한 줄 문법 | 모국어(한·일) 이름 · 검증된 레벨만 그리는 fail-closed |
| 공통 | 계정 로그인 필요(브로커) | — | **로그인 0** · 폰 저장 목록 · 무료 |

## 9. 구현 파일

| 층 | 파일 |
|---|---|
| 웹 브리지 | `src/lib/app/widgetBridge.ts` · 연결 `src/components/app/watchlist/WatchlistHost.tsx` · 시험 `tests/widgetBridge.test.ts` |
| iOS 앱 | `ios/App/App/WidgetBridgePlugin.swift` · `ios/App/App/MainViewController.swift`(CAPBridgeViewController 하위 — `capacitorDidLoad` 에서 registerPluginInstance) · Main.storyboard customClass · Info.plist URL 스킴 · 엔타이틀먼트 App Group |
| iOS 공용 | `ios/App/Shared/WidgetShared.swift`(App Group 키·저장·로고 파일 — 앱·위젯 두 타깃에 컴파일) |
| iOS 위젯 | `ios/App/SignumWidget/*`(WidgetBundle · Provider · Views · Data · Logos · Info.plist · entitlements · Assets · ko/en/ja 문자열) — 타깃은 `scripts/ios/add-widget-target.rb`(xcodeproj) 로 추가 |
| 안드로이드 | `android/app/src/main/java/com/signumhq/app/widget/*`(WidgetBridgePlugin · WatchlistWidgetProvider(소·중·대) · WidgetRenderer · WidgetDataClient · WidgetRefreshWorker) · res/layout·xml·drawable·values(-ko,-ja) · Manifest · MainActivity.registerPlugin |

안드로이드는 **RemoteViews + 자바**(기존 MainActivity 가 자바, Kotlin 플러그인 없음). Glance 는 Kotlin + Compose 컴파일러를 앱 빌드에 새로 들여야 해서 빼았다.
WorkManager(`androidx.work:work-runtime`)는 AdMob SDK 가 이미 끌어오는 의존성이라 실질 추가 0(명시만 한다).

## 10. 검증 결과(9/30 00~01시 KST)

| 항목 | 결과 |
|---|---|
| 웹 브리지 단위 시험 | `tests/widgetBridge.test.ts` 13/13(9/30 03시 «thenable 프록시» 회귀 시험 추가) · 기존 `appWatchlist` 35/35 · `watchlistInsights` 69/69 · 바뀐 파일 부분 tsc 0 오류 |
| 판정 일치(웹 = iOS = 안드로이드) | 레벨 15사례(정의 위반 4종·출처 없음·메타 없음·2거래일 늦음·휴장일·가격 없음·맥스페인 끝 붙임) · 가격/등락/레벨 숫자 모양 21개 · 기준 라벨(장중·종가·프리·애프터·휴장·조기 폐장) 15개 — **세 구현 완전 일치**(서울·LA 시간대 모두). 안드로이드 반올림 두 곳(1.005·99,999.995)이 웹과 달라 고쳤다 |
| 실데이터 파싱 | 운영 `/api/live/quotes` + `/api/watchlist/batch` 6종목(BRK.B 포함) — 가격은 공용 시세, 레벨은 묶음, 병합 정상 |
| iOS 빌드 | 시뮬레이터 Debug `BUILD SUCCEEDED`(위젯 확장 임베드 · 두 번들 모두 App Group 시뮬레이션 엔타이틀먼트 · 개인정보 매니페스트) |
| iOS 실화면 | 위젯 갤러리 «내 종목» 3크기 실값 렌더 · 홈 화면 큰 위젯 5종목(무료 5) · 앱 대시보드 «내 종목» 카드와 가격 일치 · 위젯 행 탭 → SpringBoard 가 `signumhq-app://ticker/TSLA` 를 앱에 전달(시스템 로그) · 새 바이너리에서 앱 기존 화면 정상(대시보드·배너·탭바) |
| 안드로이드 빌드 | `assembleDebug` 성공 · 수신기 3종·WorkManager 포함 · **권한 목록이 현재 릴리스(1.2.2/7)와 동일** → Data safety 변경 없음 |
| 안드로이드 실화면(9/30 02~03시 · API 33 에뮬레이터 · 픽셀 런처 · 디버그 1.3.0/8) | **실제 브리지**(이 브랜치 웹 코드를 앱 웹뷰에 주입)로: 목록 변경 → 위젯 즉시 갱신 · 로고(AMZN SVG 포함) 웹뷰 래스터화 → 위젯 · 2×2·4×2·4×4·4×3(크기 조절 → 모양·행 수 따라감) · ko/en/ja · 빈 상태·미수신 상태 · 행 탭 `/…/app-view/flow?t=META&from=widget` · 머리 탭 `/…/app-view/watchlist` · **콜드 스타트**(앱 종료 상태에서 행 탭 → `getLaunchUrl` → 같은 경로) · 앱 «내 종목» 카드와 가격 일치(NVDA $228.32 −0.24% 등 3종목) · WorkManager 갱신 SUCCESS · 앱 업데이트 설치 뒤 위젯 약 3초 안에 다시 그림 · 위젯 고르기 미리보기 |
| iOS 끝단 재검증(9/30 05~06시 · 시뮬레이터 디버그 빌드 · 이 브랜치 웹 코드를 앱 웹뷰에 주입) | 앞선 iOS 확인(9/30 00~01시)은 **디버그 실행 인자 `-SGWidgetSeed` 가 네이티브에서 App Group 에 직접 쓴 값**이었다 — 웹 브리지를 거치지 않아 thenable 버그를 못 잡았다. 이번엔 App Group 을 비운 뒤 실제 경로로: 앱 시작 → 브리지 → App Group(목록·이름·휴장 달력·로고 5개) → 위젯 · 빼기(GOOGL) · 순서 바꾸기(손잡이 끌기) · 담기(Flow 하트) · 언어 ko→en→ja(설정 화면) — 모두 App Group 즉시 반영, 홈 위젯 갱신 · 앱 종료 상태에서 행 탭 → `/ja/app-view/flow?t=PLTR&from=widget`, 머리 탭 → `/ja/app-view/watchlist`(이동 1회) · 캡처 `scratchpad/widget-shots/ios-e2e-*.png` |
| 실화면에서 찾아 고친 것 | ① **브리지가 목록을 한 번도 못 넘겼다(치명)** — Capacitor `registerPlugin` 프록시는 `then` 까지 돌려주는 thenable 이라 `await` 하면 영원히 안 끝난다 → 동기 getter 로(iOS 도 같은 코드라 같이 고쳐짐 · 시뮬레이터 검증은 디버그 시드라 못 잡았다) ② 빈 상태의 «앱 열기»가 위젯 바닥에 붙었다 → 문구와 한 덩어리로 가운데 ③ 2×2 한국어 빈 문구가 «보입|니다»로 끊겼다 → 낱말 단위 줄바꿈 ④ 키 큰 칸에서 아래가 비었다 → 들어가는 만큼 행 ⑤ 고르기 미리보기가 게시 기준 탈락 종목(AAPL·TSLA·MU·MSFT·SPY)·영어 이름 → 기준 통과 종목·3언어 ⑥ 레이아웃 언어가 이미 같으면 위젯 언어를 다시 안 봤다 → 늘 다시 보고 같은 값이면 안 보냄 |

## 11. 스토어 준비(실행 전 · 대표 확인 필요)

| | iOS | 안드로이드 |
|---|---|---|
| 번호 | 1.9.2(13) → **1.10.0(14)** — `ios-release.sh` 가 두 타깃(앱·위젯)을 같이 올린다 | 1.2.2(7) → **1.3.0(8)** — `android/app/build.gradle` |
| 선행 | ① **운영 웹에 브리지 먼저**(main 병합·배포) — 없으면 새 앱의 위젯이 «앱을 열면…»에 머문다 ② 애플 계정: App Group `group.com.signumhq.app` 생성 → `com.signumhq.app`·새 App ID `com.signumhq.app.SignumWidget` 에 켜기(ASC API 에 없음 — developer.apple.com 또는 Xcode 자동 서명) ③ `python3 scripts/ios_make_profiles.py`(앱 프로파일 재발급 + 위젯 프로파일) | ① 같은 웹 선행 ② `bundleRelease`(업로드 키·keystore.properties 는 본 저장소 체크아웃에만) |
| 올리기 | `WHATS_NEW_KO=… WHATS_NEW_JA=… ./scripts/ios-release.sh signum 1.10.0 "<en>"` | Play 콘솔(브라우저는 `bash scripts/ego-run.sh`) → 프로덕션 새 버전 → AAB · 노트 3언어 |
| 새로운 기능 | ko «새 홈 화면 위젯: 내 종목의 가격과 옵션 레벨을 한눈에.» · ja «新しいホーム画面ウィジェット：マイ銘柄の株価とオプションレベルをひと目で。» · en «New Home Screen widget: your watchlist's prices and option levels at a glance.» | 같음 |

## 12. 위험 · 대표 할 일
- **순서가 곧 안전**: ① 운영 웹(main)에 브리지·딥링크 먼저 → ② 앱 업데이트. 거꾸로 가면 새 앱의 위젯은 «앱을 열면 내 종목이 여기 보입니다»에 머물고, 위젯 탭은 앱만 연다(해는 없음).
- iOS: App Group `group.com.signumhq.app` 생성 → `com.signumhq.app`·`com.signumhq.app.SignumWidget` 두 App ID 에 켜기(ASC API 에 없는 단계 — developer.apple.com 또는 Xcode 자동 서명) → `scripts/ios_make_profiles.py` 로 두 App Store 프로파일(앱 것은 재발급 — 같은 이름의 옛 파일은 지운다).
- 위젯 확장 버전은 앱과 같아야 업로드가 통과한다(ITMS-90473) — `ios-release.sh` 의 sed 가 두 타깃을 함께 올린다.
- 개인정보: 새 수집 없음(목록은 폰 안 · 요청은 기존 공개 API). iOS 는 «이유가 필요한 API»(UserDefaults·App Group, 1C8F.1)를 매니페스트에 신고했다. 안드로이드 권한 목록은 현재 릴리스와 같다.
- 관찰(서버 쪽 · 위젯과 무관): 같은 종목의 레벨이 몇 분 사이에 바뀌어 온다 — AAPL 330–340 ↔ 327.5–345, TSLA 290–390 ↔ 290–360, NVDA 200–235 ↔ 200–250(9/30 00:37~01:34, `/api/watchlist/batch`). 위젯은 앱 목록과 같은 값을 그대로 보여 준다.
- 겹침: «내 종목»을 앱 공용 실시간 연결(WebSocketProvider)로 옮기는 작업이 따로 진행 중 — 위젯 브리지는 저장소(`getWatchlistStore`)만 구독하므로 가격 경로가 바뀌어도 영향이 없다. 위젯의 가격도 같은 공용 시세(`/api/live/quotes`)라 앱과 숫자가 맞는다.
