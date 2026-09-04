# SIGNUM HQ iOS 앱 — 디자인 재구축 감사 (DESIGN_REBUILD_AUDIT)

- 작성: 2026-09-04 · 금융 프로덕트 디자인 디렉터 역할 · 코드 무수정(읽기 전용) 감사
- 대상: iOS 앱 `com.signumhq.app` v1.6(7) — Capacitor 셸이 프로덕션 웹 `https://www.signumhq.com/{locale}/app-view/*` 를 WKWebView 로 렌더 (`capacitor.config.ts:20`). 따라서 캡처된 화면 = **라이브 서버의 앱뷰 라우트 + 네이티브 셸(스플래시·상태바·ATT·푸시·AdMob 배너)**.
- 진행 상태: **0~5단계 전부 완료.** 4단계는 대표 승인(2026-09-04) 후 진행했다. 마지막 다섯 절(바꾸지 말아야 할 것 · 기억되려면 · 범위 밖 관찰 · 확인하지 못한 것 · 효과가 큰 5가지)까지 포함한 최종본이다.
- 라벨 규약
  - 근거 등급: **[확실]** 캡처 또는 소스에서 직접 확인 · **[추정]** 근거는 있으나 직접 확인 못 함 · **[미확인]** 확인 못 했고 무엇을 못 봤는지 명시
  - 층: **[정밀층]** 가격·지표값·만기·손익·확률·표·차트 축/눈금(판독성 절대 우선) · **[표현층]** 그 외 전부(과감함이 기준)
  - 캡처 인용: `design_audit_captures/{화면명}_{상태}_{기기}.png` 의 파일명(확장자 생략) · 코드 인용: `파일:라인`
- 문서 규칙: 1단계는 **기술만** 한다(평가 없음). 평가·제안은 4·5단계에서만.

---

## 0단계 — 앱 실행·화면 수집 보고

### 0-1. 실행 환경 [확실]

| 항목 | 값 |
|---|---|
| 호스트 | macOS 26.4.1 (25E253) · Xcode 26.6 (17F113) |
| 시뮬레이터 런타임 | iOS 26.5 (23F77) |
| 큰 기기 | iPhone 17 Pro Max — 440×956 pt, @3x → 캡처 1320×2868 px, udid 7ED89576… |
| 작은 기기 | iPhone 17e — 390×844 pt, @3x → 캡처 1170×2532 px, udid CA709E99… (iOS 26.5 런타임에 SE 클래스 기기가 없어 현행 최소 폭 기기인 17e 를 사용) |
| 앱 빌드 | `App.app` Debug, CFBundleShortVersionString 1.6 / CFBundleVersion 7 (설정 화면 표기 v1.6 과 일치) |
| 로드 URL | `https://www.signumhq.com/en/app-view/dash` → 네이티브 로케일 리다이렉트로 `/ko/app-view/dash` (시뮬레이터 언어 한국어) |
| 상태 표시줄 | `xcrun simctl status_bar <udid> override --time "9:41" --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3` 두 기기 모두 적용 |
| 테마 전환 | `xcrun simctl ui <udid> appearance light|dark` |
| 최초 실행 재현 | `xcrun simctl uninstall` → `install` → `launch` (17e) |
| 조작 방식 | 시뮬레이터 MCP 의 기기 접근 권한이 부여되지 않아, macOS 접근성으로 시뮬레이터 창에 좌표 클릭(System Events) + CGEvent 드래그(JXA)로 직접 조작. 창→디바이스 좌표 변환은 탭바 탭으로 두 기기에서 검증 |
| 캡처 명령 | `xcrun simctl io <udid> screenshot` (PNG, 네이티브 해상도) |
| 캡처 시각 | 2026-09-03 21:30 ET ~ 09-04 00:30 ET — **정규장·애프터마켓 모두 종료 후**. 모든 세션 배지 CLOSED |
| 데이터 상태 | 라이브 프로덕션 데이터(당일 9/3 마감가). 시뮬레이터는 AdMob 이 자동 테스트기기로 취급해 배너에 「Test mode」 라벨이 얹힘(실기기에는 없음, 배너 크기·위치는 동일) |

### 0-2. 캡처 목록 — 총 115장 (0~3단계 89장 + 4단계 추가 18장 + 보정·프로브 8장) · `./design_audit_captures/` · 약 130MB

파일명 규칙 `{화면명}_{상태}_{기기}.png`. 기기: `promax` = iPhone 17 Pro Max, `17e` = iPhone 17e. `ZOOM-*` 은 원본에서 `sips` 로 잘라낸 **네이티브 해상도 확대 크롭**(재촬영 아님).

| 화면 | 상태 | promax | 17e |
|---|---|---|---|
| **최초 실행** (삭제 후 재설치) | 스플래시 | — | `firstrun_00-splash` |
| | ATT 시스템 대화상자(영문 사유) | — | `firstrun_01-att` |
| | 동의 게이트 1/2 (필수 고지, 체크 전) | `onboarding_consent-1of2` | `firstrun_02-consent-1of2`, `onboarding_consent-1of2` |
| | 동의 체크 후(CTA 활성) | — | `firstrun_03-consent-checked` |
| | 「앱 약관」 링크 → 약관 페이지 / 그 위에 광고 배너 | — | `firstrun_03-terms-page`, `firstrun_04-terms-page-ad-overlay` |
| | 2/2 알림 설정 | — | `firstrun_04-step-2of2` |
| | 「시작하기」 직후 iOS 알림 권한 대화상자 | — | `firstrun_05-after-start`, `firstrun_06-landing-8s`, `firstrun_07-landing-16s` (대화상자 유지) |
| | 권한 거절 후 첫 대시보드 3s / 10s / 20s | — | `firstrun_08-landing-3s`, `firstrun_09-landing-10s`, `firstrun_10-landing-20s` |
| | 첫 실행 12s 시점(빈 화면) / 90s(ATT 가 동의 게이트 위) / 라이트 모드 첫 실행 | `dash_first-launch`, `dash_first-launch-90s`, `dash_first-launch-LIGHT` | 같은 3종 |
| | 재실행 타임랩스(ATT 대화상자에 오염 — 참고용) | — | `dash_relaunch-2s/4s/7s/10s/15s/20s` |
| **Dashboard** | 기본 상단/중단/하단 | `dash_default-top/mid/bottom` | `dash_default-top/mid/bottom` |
| | 시스템 라이트 모드(앱은 다크 유지) | `dash_LIGHT-top` | `dash_LIGHT-top` |
| | 확대 크롭 | — | `dash_ZOOM-pulse-cards`, `dash_ZOOM-macro-board` |
| **Guardian** | 기본 상단(AI 요약 탭) | `guardian_default`(스크롤 중간), `guardian_default-top-recheck`(최상단) | `guardian_default-top` |
| | 중단/하단 | `guardian_default-bottom` | `guardian_default-mid/bottom` |
| | 탭: 시장 현황 / 방어 지표 / 기관 플로우 | `guardian_tab-market/defense/instflow` | — |
| | 라이트 모드 | `guardian_LIGHT-top` | — |
| | 확대 크롭 | — | `guardian_ZOOM-risk-strip`, `guardian_ZOOM-gauge-rows` |
| **Command** (종목 상세) | 기본 상단/중단/하단 (NVDA) | `cmd_default-top/mid/bottom` | `cmd_default-top/mid/bottom` |
| | 탭: AI(잠금) / QUANT / HOLDERS | `cmd_tab-ai/quant/holders` | — |
| | 차트 1M / 1Y (MSFT) | `cmd_chart-1m/1y` | — |
| | 라이트 모드 | `cmd_LIGHT-top` | `cmd_LIGHT-top` |
| | 확대 크롭 | `cmd_ZOOM-metric-grid` | `cmd_ZOOM-darkpool-tiles` |
| **Flow** (옵션 플로우) | 기본 상단/중단/하단 (NVDA) | `flow_default-top/mid/bottom` | `flow_default-top/mid/bottom` |
| | 탭: AI INTEL / WHALE / STRIKE | `flow_tab-aiintel/whale/strike` | — |
| | 확대 크롭 | `flow_ZOOM-strike-map` | `flow_ZOOM-hero-tiles` |
| **Intel** (섹터) | 기본 상단/중단/하단 | `intel_default-top/mid/bottom` | `intel_default-top/mid/bottom` |
| | 섹터 상세(M7) 상단 / 하단 2장 | `intel_sector-m7`, `intel_sector-m7-detail`, `intel_sector-m7-detail2` | — |
| | 라이트 모드 | `intel_LIGHT-top` | — |
| | 확대 크롭 | `intel_ZOOM-ticker-grid` | `intel_ZOOM-sector-card` |
| **설정** (바텀시트) | 기본 / 하단 | `settings_default`, `settings_bottom` | — |
| **광고·탭바 겹침** 확대 | — | — | `firstrun_ZOOM-ad-over-content` |
| 보정·프로브(감사 근거 아님) | `_calib_guardian_17e`, `_probe_*` 6장 | | |

**4단계에서 추가한 캡처 18장** (전부 17e 또는 Pro Max, 위 규칙과 동일한 파일명)

| 목적 | 파일 | 무엇을 확인했나 |
|---|---|---|
| 깨끗한 재실행 타임랩스 | `dash_relaunch-clean-1s/2s/3s/5s/8s/12s_17e` | 1s 검정 → 3~5s 로고 스플래시 → **8s 영어 스켈레톤** → 12s 한국어 완성 (0-5 #16) |
| 접근성 설정 | `dash_A11Y-textXXXL-top_17e` · `dash_A11Y-textXXXL-contrast-top_17e` · `dash_A11Y-contrast-top_17e` | 글자 최대(AX5)·대비 증가 ON 에서 앱 픽셀 변화 0 (0-5 #17) |
| 블러 식별 테스트 (σ=짧은 변 2%) | `dash_default-top_BLUR_17e` · `guardian/cmd/flow/intel_default-top_BLUR_17e` · `firstrun_10-landing-20s_BLUR_17e` | 3초 첫인상 대용, 에지·밝기 최대 블록 측정 (4-1-2, 4-1-10) |
| 확대 크롭 | `dash_ZOOM-macro-board_17e` · `guardian_ZOOM-gauge-rows_17e` · `flow_ZOOM-strike-map_promax` · `firstrun_ZOOM-ad-over-content_17e` | 라벨 겹침·축 중복·광고 오버레이 실측 |
| 푸시 | `push_00-banner_promax` · `push_01-notification-center_promax` | `simctl push`(type=morning) 결과 — 배지 «1» 만 확인, 배너 [미확인] (0-5 #21) |

두 기기 모두 캡처한 것: 5개 탭 화면의 상단·중단·하단, 첫 실행 빈 화면·ATT, 동의 게이트, 라이트 모드(dash·cmd). Pro Max 만: 서브탭 전부, 차트 범위, 섹터 상세, 설정. 17e 만: 최초 실행 전 과정, 알림 권한, 신규 사용자 첫 대시보드.

### 0-3. 캡처하지 못한 것 [미확인 — 무엇을 못 봤는지]

| 항목 | 못 본 것 | 이유 |
|---|---|---|
| 라이트 모드 **화면** | 라이트 팔레트로 렌더된 화면 | 시스템 외관을 light 로 바꿔 캡처했으나 앱이 그대로 다크로 렌더됨(`*_LIGHT-top_*`). 코드에도 전환 메커니즘이 없다(1-9). 즉 «못 캡처»가 아니라 **존재하지 않음** [확실] |
| 장중(LIVE) 상태 | 현물 LIVE 배지, 틱 플래시(liveBlink·flashUp/Down), 실시간 WS 오버레이, PRE/POST 세션 카드의 실시간 변동 | 캡처 시각이 정규장·애프터마켓 종료 후. 선물만 FUTURES LIVE 로 관측 |
| 설정 시트 이하의 서브 화면 | 언어 아코디언 펼침, 캐시 삭제 다이얼로그·토스트, 앱 평가 시트, 이용약관/개인정보 화면(설정 경유) | 시간 배분상 미조작. 약관 본문은 온보딩 경유로 캡처(`firstrun_03-terms-page`) |
| 무버스 화면(`/app-view/movers`) | 20행 랭킹·3탭 | 미진입 |
| 광고 시청 → 잠금 해제 후 화면 | ValueWall 해제 리빌, 기관 시그널 4카드, cmd AI 딥 분석, Guardian GAMMA SHIELD, flow GEX 레짐·고래 덱 | 리워드 광고 재생을 실제로 트리거하는 것은 광고 노출(외부 서비스 상호작용)이라 실행하지 않음 |
| ⓘ 팝업(MetricInfo), 검색 모달, 8-K 팝업, 리포트 전체화면 시트 | 팝업·모달 레이어 | 미조작 |
| 하락 종목의 Command/Flow 히어로 | 하락 시 히어로 카드 틴트·차트 색 | 캡처 시점 주요 종목 전부 상승 |
| Intel 종목 상세 카드(GEX/PCR/SQUEEZE 그리드) | 섹터 상세 안 종목 행 탭 후 카드 | 섹터 상세 상단·하단만 캡처, 종목 행 미탭 |
| Android | 전부 | iOS 감사 범위 |

### 0-4. 재현하지 못한 상태 [미확인]

| 상태 | 시도 / 결과 | 대안 근거 |
|---|---|---|
| 네트워크 오류·오프라인 | `simctl` 에 네트워크 차단 기능 없음. 호스트 Wi-Fi 끄기·Network Link Conditioner·`/etc/hosts` 편집은 «시스템 설정 변경·파일 수정 금지» 규칙에 해당해 실행하지 않음 | 코드: 오프라인 필 `NetworkStatus.tsx:32`(bottom 140px 적색 필), flow 티커 없음 → amber 「데이터 재연결 중」 카드 `flow/page.tsx:2291`. **화면 미확인** |
| 느린 로딩 | 스로틀 불가. 단, 최초 설치 실행에서 **12초 이상 완전 빈 화면**(`dash_first-launch_promax/17e`)과 재실행 시 8초 내 완전 페인트(`_probe_relaunch_promax`)는 관측 | **정정(4단계 실측):** 깨끗한 재실행 타임랩스(`dash_relaunch-clean-1s~12s_17e`)에서 8초 시점에 **스켈레톤 화면이 존재**한다 — 단 영어 라벨(«MARKET STATE / INDEX FUTURES / CASH INDICES»)이고 헤더가 상태바 위에 겹친다(세이프에어리어 미적용). 순서: 1s 검정 → 3~5s 흰 로고 스플래시 → 8s 영어 스켈레톤 → 12s 한국어 완성 화면 [확실]. 최초 설치 실행에서는 12초+ 빈 화면만 관측(`dash_first-launch_17e`) |
| 데이터 일부 실패 | 특정 API 만 실패시키는 안전한 수단 없음 | 코드상 빈 상태 처리는 1-7 표 |
| 시스템 폰트 크기(Dynamic Type) 확대 | 미시도 | — |
| 로그인/로그아웃 | 앱에 계정·로그인 없음 → 해당 없음 [확실] | — |

### 0-5. 수집 중 관측된 사실 (평가 없이 기록 — 4·5단계 입력)

1. 최초 실행: 스플래시(단색) → **12초 이상 빈 다크 화면** → ATT 시스템 대화상자(사유 문구 **영문**, `ios/App/App/Info.plist:37-38`; `ko.lproj/InfoPlist.strings` 에 해당 키 없음) 가 한국어 동의 게이트 위에 겹침 (`dash_first-launch-90s_17e`, `firstrun_01-att_17e`) [확실].
2. 동의 게이트 1/2 → 2/2(알림 설정) → 「시작하기」 → iOS 알림 권한 대화상자 → 거절 → **3초 내 완성된 대시보드**. 신규 사용자용 안내·투어·빈 상태 없음, 재방문 사용자와 동일 화면 (`firstrun_08-landing-3s_17e` ≒ `dash_default-top_17e`) [확실].
3. 온보딩 도중 「앱 약관」 링크로 열린 약관 페이지 위에 **광고 배너가 얹힘** (`firstrun_04-terms-page-ad-overlay_17e`) [확실].
4. AdMob 배너: 흰 배경, 탭바 바로 위 플로팅, **콘텐츠 위에 오버레이**(스크롤 중간 위치에서 콘텐츠를 덮고, 콘텐츠는 탭바 뒤로도 이어짐) (`firstrun_ZOOM-ad-over-content_17e`, `guardian_default-top-recheck_promax`) [확실]. 첫 랜딩 3초 시점에 이미 표시 [확실].
5. Guardian 리스크 스트립 「S&P 500 F **−0.00%**」 적색, 대시보드에도 「▼ −0.00%」 (`guardian_ZOOM-risk-strip_17e`, `dash_default-top_17e`) [확실].
6. 17e 에서 타일 라벨 줄바꿈: cmd 「GAMMA FLIP」「TOTAL PREMIUM」「DAY RANGE」, flow 「TOTAL PREMIUM」「DAY RANGE」「상회 (+3.84%)」 → 세 타일의 값 기준선이 서로 어긋남 (`cmd_ZOOM-darkpool-tiles_17e`, `flow_ZOOM-hero-tiles_17e`). Pro Max 에서도 「TOTAL PREMIUM」 2줄 (`cmd_default-top_promax`) [확실].
7. 대시보드 선물 카드 라벨 말줄임 「NASDAQ10…」「RUSSELL2…」 — **두 기기 모두** (`dash_default-top_17e`, `_probe_relaunch_promax`) [확실].
8. Guardian 「NASDAQ 100」 라벨 끝과 라이브 도트가 겹침 (`guardian_ZOOM-risk-strip_17e`) [확실].
9. Command AI 탭 = ValueWall 잠금 카드, CTA 가 탭바 뒤로 잘림 (`cmd_tab-ai_promax`) [확실].
10. ValueWall 「오늘 **14.2K** 잠금해제」 — 정적 문자열(코드 3곳 이상) 이 화면에 그대로 (`dash_default-bottom_promax`) [확실].
11. Guardian 첫 모듈 순서는 두 기기 동일(GRAVITY GAUGE → BRIEFING/WHAT-IF → FOMC, `MobileGuardianOverview.tsx:135,168,234`). 첫 Pro Max 캡처(`guardian_default_promax`)가 FOMC 부터 보인 것은 스크롤 위치 차이 [확실].
12. 시뮬레이터 세션 중, 설정 시트에서의 탭 하나가 SFSafariViewController 를 열고 「주소가 유효하지 않기 때문에 Safari 가 해당 페이지를 열 수 없습니다」 알럿이 떴다 (`_probe_*` 계열). 어느 행인지 특정하지 못함 — [추정] 컴패니언 앱 스토어 링크(시뮬레이터에 App Store 없음). → 「범위 밖 관찰」로 이관.
13. 같은 「장마감」 상태의 표기가 화면마다 다름: dash 「CLOSED」 회색 필 / cmd 「MARKET CLOSED」 필 + 「POST (CLOSED)」 카드 / flow 헤더 「● CLOSED」 / guardian 「CLOSED」 필 2곳 [확실].
14. 시각 표기: cmd 「9/3, 22:14 ET」(24시간) 와 「9/4, 00:04 ET」, 뉴스 티커 「6h·10h·11h」 [확실].
15. 라이트 모드로 전환해도 앱은 다크 유지 — 흰 광고 배너와 iOS 시스템 대화상자만 라이트로 바뀜 [확실].
16. (4단계 추가) 재실행 시퀀스 17e: 1s 검정 → 3~5s 로고 스플래시 → **8s 영어 스켈레톤**(«MARKET STATE·INDEX FUTURES·CASH INDICES·MACRO BOARD», 헤더가 상태바 «9:41» 위에 겹침, 시장 상태 3박스 주황 «—») → 12s 한국어 완성 (`dash_relaunch-clean-1s/3s/5s/8s/12s_17e`) [확실]. 부팅 URL 이 `/en/app-view/dash`(capacitor.config.ts:20)라 로케일 리다이렉트 전 영어가 노출된다.
17. (4단계 추가) iOS 접근성 «글자 크기 최대(AX5)»·«대비 증가 ON» 모두 앱 UI 변화 0 (`dash_A11Y-textXXXL-top_17e`, `dash_A11Y-contrast-top_17e`) [확실]. 같은 재실행 10초 시점에 시장 상태 3박스만 «—»(펄스 카드는 값 있음) — 블록별 데이터 도착 시차가 «—»로 노출 [확실].
18. (4단계 추가) MARKET PULSE 9카드의 스파크라인은 전부 **하드코딩 DEMO 배열**이다: 현물 `DEMO_INDICES[i].spark`(dash/page.tsx:107-109), 선물 `DEMO_FUTURES[i].spark`(:1293-1295), ETF `DEMO_ETFS[i].spark`(:1498-1518). 캡처에서 S&P500 F 와 S&P 500 의 선 모양이 동일하고 NASDAQ 과 RUSSELL 이 동일하다(`dash_default-top_17e`) [확실]. 코드 주석(:1276-1278)은 «가짜 숫자는 빈칸보다 나쁘다»고 쓰면서 선은 남겨 두었다.
19. (4단계 추가) 픽셀 실측 대비(`dash_default-top_17e`): 뉴스 시각 «6h» 4.1:1 · 「CLOSED」 5.0 · 「시장 상태」 6.4 · 「지수 선물」 6.5 · 「+0.15%」 칩 6.3 · 「FUTURES LIVE」 8.6 · 탭바 라벨 7.1~7.9 · 카드 이름 14.5 · 값 17.1. 코드 크기: 세션 필 800 9px(dash.module.css:112), 탭바 라벨 600 10px(app-view.css:588,622), 뉴스 시각 11px 모노(:1152), 카드 심볼 800 11px(:243) [확실].
20. (4단계 추가) 첫 뷰포트 면적(`firstrun_10-landing-20s_17e`): 데이터 카드 62.7% · 광고 배너 7.1%(60pt) · 크롬(상태바+헤더+탭바) 25.7%. σ2% 블러 후 에지·밝기 최대 블록이 둘 다 광고 배너 위치(`firstrun_10-landing-20s_BLUR_17e`) [확실]. 기어 버튼 `.headerBtn` 30×30px, `min-height:30px !important`(dash.module.css:58-70) [확실].
21. (4단계 추가) 시뮬레이터 푸시(`simctl push`, type=morning) 전송 시 앱 아이콘 배지 «1»만 표시되고 배너는 뜨지 않음(`push_00-banner_promax`) — 알림 표시 방식은 [미확인].

---

## 1단계 — 현 상태 파악 (기술만, 평가 없음)

두 층으로 기술한다. **1-A** 는 캡처에서 직접 읽은 화면 실측, **1-B** 는 소스 코드 인벤토리(수치·파일:라인). 1-B 끝의 «캡처 대조표»가 둘을 잇는다.

### 1-A. 화면 실측 (캡처 기준)

#### 1-A-1. 첫 화면(Dashboard) 구성 — 위에서 아래 순서 [확실]

| # | 블록 | 내용 | 17e 첫 뷰포트(스크롤 전) | Pro Max 첫 뷰포트 |
|---|---|---|---|---|
| 1 | 스티키 헤더 | 로고 심볼(백색 원형) + 「SIGNUM**HQ**」(HQ 시안) + 「DARK POOL INTEL」 자간 넓은 소형 대문자 + 우측 기어 버튼 | 보임 | 보임 |
| 2 | 뉴스 티커 바 | 배지(「시그널」 amber / 「지표」 시안 / 「속보」 적색) + 헤드라인 1줄 말줄임 + 「6h」 | 보임 | 보임 |
| 3 | 시장 상태 카드 | 「시장 상태」 + 「Risk-On 우위」(녹색 대형) + 설명 1줄 말줄임 + 박스 3개(선물 중립 +0.08% / 현물 상방 +1.21% / 리스크 69) | 보임 | 보임 |
| 4 | MARKET PULSE | 헤더(세로 시안 바 + 제목 + 「● FUTURES LIVE」 필) → 「지수 선물 / FUTURES LIVE」 행 3카드 → 「현물 지수 / CLOSED」 3카드 → 「ETF / 변동성 / CLOSED」 3카드. 카드 = 배지 원(FUT/NDX/500/DJI/100/C) + 이름 + 값(모노) + ▲/▼ 변화율 칩 + 스파크라인 | 2.5행(ETF 행 하단이 광고 배너에 가림) | 3행 전부 |
| 5 | MACRO BOARD | 4열 2행: BTC $81.0K / GOLD $4,514 / OIL $92.1 / SOX 11,352 / (2행) US10Y·DXY·2s10s·F&G | 안 보임 | 1행 (값 절반이 탭바 뒤) |
| 6 | TOP MOVERS | 토글(거래대금/상승률/하락률) + 「VIEW ALL >」 + 가로 스냅 카드 | 안 보임 | 안 보임 |
| 7 | SECTOR HEATMAP | 4×2 셀 + 세션 필 | 안 보임 | 안 보임 |
| 8 | 브리핑 카드 | 모드 토글 + 뉴스 5건 + 「시장 모니터 현황 보기 →」(amber 좌측 바) | 안 보임 | 안 보임 |
| 9 | ValueWall | 「무료 미리보기 · 기관급 펄스 / $62.3B · 4개 중 1개」 헤더 + 자물쇠 원(amber conic) + 「기관급 마켓 펄스」 + 설명 + amber→orange CTA 「▶ 광고 보고 1시간 해제」 + 「오늘 14.2K 잠금해제」 + 면책 | 안 보임 | 안 보임 |
| 10 | 푸터 | 앱 이용약관 · 앱 개인정보처리방침 / 지원: contact@signumhq.com / 면책 / © 2026 SIGNUM HQ. ALL RIGHTS RESERVED. | 안 보임 | 안 보임 |

첫 뷰포트에서 **한국어 라벨**: 시장 상태·선물·현물·리스크·지수 선물·현물 지수·ETF / 변동성·중립·상방 (9개). **영어 라벨/토큰**: DARK POOL INTEL, MARKET PULSE, FUTURES LIVE ×2, CLOSED ×2, Risk-On, NASDAQ10…, S&P500 F, RUSSELL2…, NASDAQ, S&P 500, DOW, QQQ, SPY, VIX, 탭바 Dashboard/Guardian/Command/Flow/Intel (약 20개) [확실 `dash_default-top_17e`].

#### 1-A-2. 각 탭의 기본 화면(스크롤 전) 실측 [확실]

| 탭 | 헤더 | 기본 노출 블록 | 서브 내비 | 잠금 |
|---|---|---|---|---|
| Guardian | 「GUARDIAN / 매크로 리스크 감시」 + 「CLOSED」 필 + 우측 「RLSI 39」 박스(적색 값) | 「리스크 스트립」 4카드(공포·탐욕 35 amber / VIX 14.3 / S&P 500 F / NASDAQ 100) → 「신용 스프레드 ⓘ 2.66% 20D −0.09 [위험 선호] 1년 백분위 4 / 채권시장은 위험을 낮게 봄」 → 탭 4개 → GRAVITY GAUGE(반원 게이지 RLSI 39, 「심리 약세 · 관망 구간」, 5 분해 바, 「강세 ×3 약세 ×2」, SCORE TIMELINE) | 「AI 요약 · 시장 현황 · 방어 지표 · 기관 플로우」 아이콘+라벨 필 4개 | 방어 지표 탭 ValueWall |
| Command | 「‹ / [로고] NVDA / 🔍」 → 티커 칩 가로 스크롤(활성 시안 테두리) | 히어로 카드(로고 44 / NVDA / NVIDIA CORP / 「MARKET CLOSED」 / 「9/3, 22:14 ET」 / $228.45 32px 모노 / ▲ +1.80% / POST (CLOSED) $229.62 +0.51% / 배경 스파크라인) → 다크풀 카드(37.3% 대형 녹색, 시장 평균 41% −3.2%p, 물량 1.1×, 해석 1줄 + 「해석 ▾」, 「은밀 매집」 필) → 3타일(MAX PAIN ⓘ $218 +5.03% 괴리 / GAMMA FLIP ⓘ $220.00 상회 (+3.84%) / TOTAL PREMIUM ⓘ $68.7M 콜 우세) → 3타일(RSI 14 49.3 Stable 바 / VWAP $227.88 상회 +0.25% 바 / DAY RANGE 레일 LOW $224.8 HIGH $230.4) → 변동성 스트립(0.8× 평소 수준, 오늘 폭 2.5% (ATR 3.3%)) → 세그 탭 | 「OVERVIEW · AI ✱ · QUANT ✱ · HOLDERS ✱」(AI 는 보라 그라디언트 텍스트) | AI·QUANT·HOLDERS 각 ValueWall |
| Flow | 「∿ 실시간 옵션 플로우 / 🔍 / ● CLOSED」 → 티커 칩(NVDA 활성 = 브랜드 라임 테두리) | 히어로(cmd 와 같은 모듈: $228.45, POST (CLOSED)) → 3타일(MAX PAIN/GAMMA FLIP/TOTAL PREMIUM — ⓘ 없음) → 3타일(RSI 14 52.3 Neutral 시안 바 / VWAP / DAY RANGE) → 세그 탭 → 「주간 스트라이크 맵 / 09-04 주간 만기」… | 「OVERVIEW · AI INTEL · WHALE · STRIKE」(AI INTEL 보라 그라디언트) | GEX 레짐 카드, AI 상세, 고래 덱 |
| Intel | 헤더 카드(INTEL 키커 + 세션) → 2×2 요약 타일(강세/약세/커버리지 70 주요 종목/평균 변동 2.4% 실시간 + 스냅샷) | 「섹터 / 장마감 리포트」 세그 → 섹터 카드 10장(아이콘 · 「M7 테크 M7 TECH」 · 설명 · 스파크라인 · 변화 필 · GEX/PCR/NET …) | 세그 2개 | 리포트 시트 일부 |
| 섹터 상세(M7) | 「← 닫기」 → 히어로(⚡ M7 Tech / M7 테크 / 설명 / +2.5% 녹색 필 / GEX −201.46M · PCR 0.62 · W/L 7/0 · SCORE 67 · REGIME SHORT / 등락 폭 바 ▲7 0▼ / 시장 감정 BULLISH / 등급 A 원) → 「핵심 종목 (7)」 행(로고 · TSLA · RSI 51 바 · 스파크 · $374.54 · +4.91% · 등급 원 C/S/D/A) | | |
| 설정 | 바텀시트(88dvh, 상단 딤) | 언어(🇰🇷 한국어 ˅) / 알림 토글 3개 / 캐시 초기화 / 앱 평가하기 / 이용약관 / 개인정보 처리방침 / Undercurrent / Why'd It Move? / 「SIGNUM**HQ** v1.6」 | | |

#### 1-A-3. 색 — 화면에서 실제로 보이는 것 [확실, 픽셀 근접 매칭 실측]

캡처 픽셀을 코드 팔레트 값과 근접 매칭(허용오차 채널합 42)한 결과. 같은 «의미»에 여러 값이 **한 화면 안에서 동시에** 보인다.

| 캡처 | 적색 계열(하락·위험) | 녹색 계열(상승) | 시안 계열 | 기타 |
|---|---|---|---|---|
| `guardian_default-top_17e` | **#f43f5e**(rose) 670 · #f87171 128 | #34d399 1544 · #10b981 1070 | #06b6d4 125 · #22d3ee 90 | amber #f59e0b 522 · blue #3b82f6 545 |
| `guardian_default_promax` | **#ef4444** 1443 · #fb7185 134 · #f87171 115 | #34d399 803 · #10b981 695 | #06b6d4 1539 · #67e8f9 295 · #22d3ee 114 | amber 524 |
| `flow_default-mid_17e` | **#ef4444 708 + #f43f5e 542 동시** | #10b981 1499 · #34d399 560 | #06b6d4 1747 · #22d3ee 327 | amber 1463 · #fbbf24 118 |
| `cmd_default-top_17e` | #ef4444 312 | #34d399 1366 · #10b981 1228 | #22d3ee 467 · #06b6d4 41 · #38bdf8 19 | #facc15 24 |
| `dash_default-top_17e` | #ef4444 376 · #fb7185 7 | #10b981 2011 | #22d3ee 615 | — |
| `dash_default-mid_17e` | — | #10b981 550 · **#5eead4** 719 | #22d3ee 261 | amber 1044 |
| `intel_default-top_promax` | #ef4444 524 | #10b981 1355 · #34d399 456 | #22d3ee 523 · #67e8f9 84 · #06b6d4 60 | amber 375 |
| `flow_default-top_promax` | #ef4444 188 | #10b981 1242 | #22d3ee 362 | **blue #3b82f6 2737**(스트라이크 탭 포커스 링) · purple #a855f7 467 |

- 적색: Guardian·Flow 는 rose(#f43f5e) 와 red(#ef4444) 가 **같은 화면**에 공존, Dashboard·Command·Intel 은 red 만.
- 녹색: #10b981 · #34d399 · #5eead4 세 값이 화면별로 섞임. 시안: #22d3ee · #06b6d4 · #67e8f9 · #38bdf8.
- 배경: 페이지 `#0b111e` 계열 네이비-블랙 위에 카드가 화면마다 다른 베이스 — Dashboard 거의 투명(흰 3%), Guardian 더 어두운 반투명 + HUD 코너 브래킷, Command 파란 기운 글래스 + 녹색 라디얼 틴트, Intel 진한 네이비 그라디언트 22px 라운드. 육안으로 구분됨 (`dash_default-top_17e` vs `guardian_default-top_17e` vs `cmd_default-top_17e` vs `intel_default-top_17e`).
- 광고 배너 흰색(#fff 계열)은 화면 유일의 대면적 라이트 요소.

#### 1-A-4. 타이포 — 화면에서 보이는 것 [확실]

- 가격·지표값·변화율: **고정폭(모노) 서체**, 굵게. 예 「$228.45」 「29,571」 「+1.80%」 「2.66%」. 자릿수 정렬 유지.
- 라벨·문장: 산세리프(한국어 Pretendard 계열). 눈썹 라벨(MAX PAIN, RSI 14, DAY RANGE, MARKET PULSE, GRAVITY GAUGE)은 **소형 대문자 + 넓은 자간**.
- 크기 대비(17e 네이티브 크롭 기준): 히어로 가격 ≈32px, 다크풀 % ≈24px, 타일 값 ≈17–18px, 타일 라벨 ≈10px, 타일 서브 ≈11px, 뉴스 티커 ≈13px. 라벨 10px 급은 확대 크롭에서 판독 가능하나, 3열 타일 폭(17e 약 95pt)에서 두 단어 라벨이 **줄바꿈**(0-5 항목 6).
- 부호: 「▲ +1.40%」 「▼ −5.79%」 — 삼각형과 +/− 부호를 함께 표기. 「−0.00%」 존재.
- 대소문자·언어 혼합: 「M7 테크 M7 TECH」, 「Risk-On 우위」, 「RSI 14 49.3 Stable」, 「상회 (+3.84%)」.

#### 1-A-5. 여백·모서리·프레임 — 화면에서 보이는 것 [확실]

- 페이지 좌우 여백 ≈16pt, 카드 내부 패딩 ≈16pt, 카드 간격 ≈12pt. 카드 라운드 ≈12–14pt(dash·cmd·flow), 섹터 카드·온보딩 ≈22–28pt, 필 999.
- 탭바: 플로팅 아일랜드(라운드 ≈28pt), 5탭 아이콘(선형) + 영어 라벨, 활성 탭 = 시안 채움 필 + 시안 아이콘·라벨. 하단 세이프에어리어 위에 떠 있음.
- 광고 배너: 탭바 위 ≈50pt 높이 흰 띠, 좌측 ⓘ + 광고주명 2줄 + 우측 「열기 ›」 CTA. 콘텐츠는 그 뒤로 계속 스크롤.
- 헤더: 5개 탭 모두 다른 헤더 구성 — dash(브랜드 로고+워드마크+서브라인+기어), guardian(제목+서브+세션 필+RLSI 박스), cmd(뒤로+티커 캡슐+검색), flow(아이콘+제목+검색+세션 텍스트), intel(키커 카드).
- 장식: Guardian 카드에 HUD 코너 브래킷·스캔라인·격자, cmd/flow 히어로 배경 스파크라인, 섹터 상세 좌측 시안 세로 바.

#### 1-A-6. 밀도 — 첫 뷰포트에 보이는 «값»의 수 [확실]

| 화면(17e 첫 뷰포트) | 수치 값 | 라벨/배지 | 인터랙티브 요소(탭 가능) |
|---|---|---|---|
| Dashboard | 3(시장 상태) + 9카드×2(값·%) = **21** | ≈30 | 기어, 티커 바, 9카드, 탭바 5 |
| Guardian | RLSI 1 + 스트립 4×2 + 스프레드 4 + 게이지 1 + 분해 5 = **23** | ≈35 | 탭 4, ⓘ, 게이지, 탭바 5 |
| Command | 가격 2 + % 2 + 다크풀 6 + 타일 6×2 + 변동성 3 = **25** | ≈30 | 뒤로·검색·칩 5+·ⓘ 6·해석·세그 4·탭바 5 |
| Flow | ≈**20** | ≈25 | 검색·칩·세그 4·탭바 5 |
| Intel | 4 + 카드 1장×(%·GEX·PCR·NET…) ≈ **10** | ≈15 | 세그 2·카드·탭바 5 |

#### 1-A-7. 상태 표현 — 화면에서 보이는 것 [확실]

- 세션: 「CLOSED」 표기 4가지 변형(0-5 항목 13). 선물 「FUTURES LIVE」 시안 필 + 카드 테두리 녹색 글로우.
- 잠금: 자물쇠 원(amber conic ring) + 제목 + 설명 + amber CTA + 「오늘 14.2K 잠금해제」 + 면책. 잠긴 콘텐츠는 뒤에 블러.
- 로딩: 최초 설치 실행은 12초+ 빈 화면(`dash_first-launch_17e`). 재실행은 1s 검정 → 3~5s 로고 스플래시 → **8s 영어 스켈레톤(헤더가 상태바에 겹침, 카드 자리 회색 블록, 뉴스 티커 없음)** → 12s 한국어 완성(`dash_relaunch-clean-*_17e`). 부팅 셸이 `/en` 이라 영어→한국어 전환이 화면에 보인다 [확실].
- 빈 상태: 캡처 중 «—» 폴백 미관측(데이터 전부 채워짐).
- 등급/판정 토큰: 「Stable / Neutral / Warm」, 「BULLISH」, 「SHORT」, 「은밀 매집」, 「위험 선호」, 「심리 약세 · 관망 구간」, 등급 원 A/S/C/D.

#### 1-A-8. 첫 실행 흐름 — 화면 순서 [확실 `firstrun_00~10_17e`]

1. 스플래시: 최초 설치 실행 캡처(`firstrun_00-splash_17e`)는 단색 다크였고, 재실행 타임랩스 3~5초(`dash_relaunch-clean-3s/5s_17e`)에는 중앙 흰 «S» 파형 로고 + 부드러운 글로우가 보인다 — 스플래시에 로고가 있으나 첫 설치 실행에서는 로고 단계가 캡처 시점과 어긋났다 [확실: 두 캡처 모두].
2. 빈 다크 화면 12초 이상 (`dash_first-launch_17e`) → 동의 게이트가 뜨기 전 ATT 시스템 대화상자(영문) (`firstrun_01-att_17e`).
3. 동의 1/2: 「1 / 2 · 필수 고지」 → amber 테두리 박스 「금융 데이터 고지」 + 본문 3줄 → 시안 불릿 4개 → 체크박스 행 「SIGNUM HQ 앱 약관과 금융 고지를 읽고 동의합니다.」 → 링크 「앱 약관 · 앱 개인정보 처리방침」 → 비활성 「계속」(회색). 체크 후 CTA 가 시안→녹색 그라디언트로 활성.
4. 2/2: 「2 / 2 · 알림 설정」 → 카드 3장(장마감 리포트 / 시장 브리프 / 데이터 잠금해제 — 「데이터 잠금해 / 제」 2줄 꺾임) → amber 박스 「리포트 알림」 → 링크 → 「이전 / 시작하기」.
5. 「시작하기」 → iOS 알림 권한 대화상자(한국어, 시스템 문구) → 거절 → 대시보드 완성 상태(3초), 광고 배너 표시, 별도 환영 없음.
6. 약관 링크: 앱 내 페이지(「뒤로」 + 「SIGNUM HQ APP」 + 섹션 카드 서비스 성격/광고 기반 무료 모델/앱스토어 및 업데이트/데이터와 책임/문의), 광고 배너 표시됨.

### 1-B. 코드 인벤토리 (소스 기준 — 리더 6명 추출 + 토큰 인벤토리; 수치·파일:라인은 [확실], «보이는 모습» 서술은 [추정])


> 범위·방법: 아래 내용은 전부 소스 코드(리더 6명 추출 + 토큰 인벤토리)에서 나온 것이다. 실제 캡처와 대조하지 않았으므로, **보이는 모습**에 대한 서술은 [추정], 소스에서 **센 숫자·파일 존재**는 [확실]로 표기한다. 각 요소는 [정밀층](가격·지표값·만기·확률·표·차트 눈금)과 [표현층](첫 화면·온보딩·빈/로딩 상태·전환·헤더·카드 프레임·여백·타이포 성격·일러스트·마이크로인터랙션·피드백·카피 톤)으로 분류한다. 리포지토리 루트: `/Users/eunhoon/.gemini/antigravity/scratch/stock2`.

대상 화면 6종(키): `dash`(Dashboard) · `guardian`(Guardian) · `cmd`(Command 종목상세) · `flow`(옵션 플로우) · `intel`(섹터 인텔) · `shell`(앱 셸·온보딩·설정·무버스·페이월).

---

#### 1-1. 색 체계

##### 토큰 (src/styles/app-tokens.css, 단일 `:root` 블록) [확실]

| 토큰 | 값 | 비고 |
|---|---|---|
| `--bg` | `#0b111e` | 베이스 배경 (app-tokens.css:5). 단, viewport `themeColor`·manifest·StatusBar 는 `#050a14` (src/app/layout.tsx:36, NativeAppProvider.tsx:125-127) |
| `--bg-elev` | `#121926` | :6 |
| `--surface-1/2/3` | rgba(255,255,255,0.03 / 0.045 / 0.06) | :7-9 |
| `--border` / `--border-strong` | rgba(255,255,255,0.06 / 0.10) | :10-11 (globals.css:78,108 에 hsl 값의 같은 이름 `--border` 가 별도 정의됨) |
| `--cyan` / `--cyan-dim` | `#22d3ee` / rgba(34,211,238,0.14) | :12-13 |
| `--amber` / `--amber-dim` | `#f59e0b` / rgba(245,158,11,0.14) | :14-15 |
| `--green` / `--green-dim` | `#10b981` / rgba(16,185,129,0.14) | :16-17 |
| `--red` / `--red-dim` | `#ef4444` / rgba(239,68,68,0.14) | :18-19 |
| `--text` / `--text-dim` / `--text-muted` | `#f8fafc` / `#e2e8f0` / `#94a3b8` | :20-22 |
| `--glow-cyan/green/red/amber` | 0 0 12~18px 각 색 0.45 | :47-50 |
| `--ext-session` | `var(--amber)` | :56 |

- 토큰 파일이 import 되는 곳은 2곳뿐: `app-view/layout.tsx:12`, `app-view/onboarding/page.tsx:6` [확실].
- 앱 표면 전체 색 리터럴: **3,853개, 고유 915개** (hex 1,679 / rgba 2,174 / hsl 0) [확실]. 토큰 `var(--…)` 참조는 색 관련 상위 항목 기준 `--text-muted` 192, `--cyan` 90, `--text-dim` 86, `--green` 71, `--text` 67, `--red` 60, `--amber` 36 [확실].
- 토큰과 값이 같은 리터럴이 동시에 쓰인다: `#10b981` 191회, `#f59e0b` 189회, `#ef4444` 128회, `#22d3ee` 102회, `#94a3b8` 71회 [확실].

##### 역할별 고유 색 (화면별) [확실]

| 역할 | 대표 값 | dash | guardian | cmd | flow | intel | shell |
|---|---|---|---|---|---|---|---|
| 상승(semantic-up) | `#10b981`, `#34d399`, `#5eead4`, `#10f2b0`(flow), `#4ade80`(intel), `#6ee7c7`(cmd flash) | green 7 + rgba 계열 16종 | `#34d399` 6, `#10b981` 4 | `#10b981` 12, `#34d399` 5 | `#10b981` 44, `#10f2b0` 8 | `#10b981` 65 | `#10b981` 10 |
| 하락(semantic-down) | `#ef4444`, `#f43f5e`, `#f87171`, `#fb7185`, `#fda4af`(dash), `#fca5a5`(cmd flash) | red 6 + rgba 15종 | `#f43f5e` 4, `#ef4444` 3, `#f87171` 1 | `#ef4444` 5, `#f87171` 4, `#f43f5e` 3 | `#f43f5e` 29, `#ef4444` 15, `#fb7185` 7 | `#ef4444` 62, `#f43f5e` 2 | `#ef4444` 2, `#f87171` 3 |
| 액센트 cyan | `#22d3ee`, `#06b6d4`, `#38bdf8`, `#67e8f9` | cyan 18 + rgba(34,211,238,α) 18종 | `#22d3ee` 1 + rgba 다수 | `#22d3ee` 17, `#06b6d4` 5, `#38bdf8` 4 | `var(--cyan)` 29, `#22d3ee` 11 | `#22d3ee` 24, `#06b6d4` 7, `#67e8f9` 4 | `#22d3ee` 14, `#67e8f9` 3 |
| 액센트 amber | `#f59e0b`, `#fbbf24`, `#facc15` | amber 8 | `#fbbf24` 3, `#f59e0b` 3 | `#f59e0b` 10, `#fbbf24` 4 | `#f59e0b` 29, `#fbbf24` 5 | `#f59e0b` 50, `#fbbf24` 4 | `#f59e0b` 6, `#fbbf24` 3 |
| 액센트 violet/purple | `#8b5cf6`, `#a78bfa`, `#a855f7`, `#c084fc`, `#818cf8` | `#8b5cf6` 1 | `#a78bfa` 1 | `#a855f7` 4, `#8b5cf6` 2 | `#a855f7` 2, `#a78bfa` 2, `#818cf8` 2 | `#a78bfa` 5, `#8b5cf6` 3, `#6366f1` 1 | — |
| 텍스트 | `#f8fafc`, `#e2e8f0`, `#94a3b8`, `#cbd5e1`, `#91a6ca`(flow), `#b4c6ef`(flow) | text 8, text-dim 11, text-muted 13 | `#94a3b8` 5 | `#94a3b8` 5 | `var(--text-muted)` 59, `#91a6ca` 9, `#b4c6ef` 6 | `#94a3b8` 14, `#ffffff` 7 | `#f8fafc` 5, `#f1f5f9` 5, `#94a3b8` 6 |
| 흰색 계열 서피스/보더 | rgba(255,255,255,α) | α 11종(0.02~0.08) | α 8종 | **α 128회, 0.012~0.96** | α 14종 (0.08 14회, 0.03 14회) | 0.04 26회, 0.06 13회, 0.02 12회 | α 20종 32회 |
| 어두운 카드 베이스 | rgba(15,23,42,α), rgba(2,6,23,α), rgba(22,32,54,0.45), rgba(10,14,20,0.85/1), rgba(30,41,59,α) | rgba(15,23,42) 10종 | rgba(10,14,20) 8회, rgba(2,6,23) 8종 | rgba(22,32,54) 6, rgba(15,23,42) 8 | rgba(15,23,42,0.78) 7 | rgba(2,6,23) 10종 11회, rgba(15,23,42) 다수 | rgba(15,23,42) 13종 17회 |

- **화면별 색 리터럴 총량** [확실]: flow/page.tsx 677 · intel/page.tsx 646 · cmd.module.css 357 · dash.module.css 172 · cmd/page.tsx 139 · guardian/page.tsx 113 · movers.module.css 93.
- **카드 배경·보더 고유값**: rgba(255,255,255,α) 보더/서피스만 앱 전체 α 변형 ~20종 이상 [확실]; 카드 베이스 그라디언트 문자열은 cmd `.card` rgba(22,32,54,0.45), dash `.app-card` var(--surface-1), guardian rgba(10,14,20,0.85), intel rgba(16,27,46,0.93)→rgba(3,8,17,0.99), flow rgba(15,23,42,0.78) 등 화면마다 다른 베이스를 쓴다 [확실].
- 화면별 **hex+2자리 알파 접미 템플릿**(`${color}55` 등): flow 46회(접미 35종), intel 28패턴, cmd `${colorVal}55/33/18/66/30/12/20`, movers `${color}1a/3d` [확실]. cmd/page.tsx:1021 은 `'var(--green)' + '55'` 형태로 만들어 무효 CSS가 된다 [확실]; cmd/page.tsx:3125-3128 주석은 이를 알고 rgb 삼중항으로 우회한다 [확실].
- 동일 개념의 색이 화면마다 다르다 [확실]: 하락색이 guardian/flow 는 rose(`#f43f5e`), cmd/intel/dash 는 red(`#ef4444`); GammaShield 는 `text-red-400`, 같은 Guardian 의 page/Flow 는 `text-rose-400`.
- 브랜드 외 색: 무버스 티커 칩 브랜드색 NVDA `#76b900`, TSLA `#cc0000`, AAPL `#a2aaad`, SPY `#0ea5e9` (flow/page.tsx:2052-2058) [확실]; dash 매크로 배지 `#0284c7 #dc2626 #0891b2 #1e1b4b #f97316 #eab308 #4b5563 #8b5cf6 #06b6d4` (dash.module.css:266-487) [확실]; intel 섹터 10색 (`#22d3ee #10b981 #ef4444 #f59e0b #8b5cf6 #ec4899 #f43f5e #3b82f6 #6366f1 #14b8a6`) [확실]; AppAnchorAd 는 토큰에 없는 indigo 팔레트 [확실].

##### 그라디언트 목록 (요약) [확실]

| 화면 | 개수 | 대표 |
|---|---|---|
| dash | 17 | 히트맵 셀 동적 gradient(page.tsx:301-310), instTone 4종 90deg 바, regimeStrip 135deg, macroCell.live 145deg, us10yBadge `#ef4444→#3b82f6` |
| guardian | 30+ | 스티키 헤더 180deg, 헤더 카드 145deg + 2 radial, 탭 활성 `rgba(6,182,212,0.22)→rgba(52,211,153,0.15)`, HUD 24px 그리드, Tactical Verdict BULLISH/BEARISH/NEUTRAL 3종 |
| cmd | 30+ | `.p2Card` 2 radial(녹색 틴트 고정, css:1225), `.verticalRuler` 5-stop 180deg, 검색 다이얼로그 3층, `AI ✱` 탭 텍스트 `#a855f7→#ec4899→#3b82f6`, SVG areaUp/Down/Pre/Post |
| flow | 52 (고유 48) | 카드 시트 radial 0.12 ×3, OPI 게이지 SVG `#f43f5e→#fbbf24→#10b981`, AI 슬라이더 4-stop, 스트라이크 바 put/call 4종, ruler tick repeating-linear |
| intel | 37 (31 linear + 6 radial) | 페이지 배경 4층(page.tsx:2607-2612), 섹터 카드 `${sec.color}2f`, 감마 터널 3-stop + tick repeating, 헤더 카드 145deg + 3 오버레이 |
| shell | 44 (27 linear, 16 radial, 1 conic) | CTA `#22d3ee→#10b981` (온보딩·AppFirstRun), ValueWall CTA `#f59e0b→#f97316`, 자물쇠 conic ring, paywall CTA `#12c98d→#0da271`, 탭바 180deg |

[정밀층] 관련: 상승/하락 색은 가격·변화율에 직접 쓰이므로 정밀층 색이다. [표현층]: 그 외 카드 베이스·글로우·그라디언트 전부.

---

#### 1-2. 타이포 스케일

##### 로드되는 폰트 [확실]

| 폰트 | 로드 경로 | 비고 |
|---|---|---|
| Inter 400/500/600/700 | next/font/google `--font-inter` (src/app/layout.tsx:9-14) | |
| Plus Jakarta Sans 400-800 | next/font/google `--font-jakarta` (:16-21) | |
| JetBrains Mono 400/500/700/800 | next/font/google `--font-jetbrains` (:23-28) | `--font-jetbrains` 는 quant-radar 에서만 참조, 앱 표면 미사용 |
| Pretendard static | jsDelivr CSS preload + Script (src/app/layout.tsx:132-157) | |
| Inter / JetBrains Mono / Plus Jakarta Sans (Google Fonts @import) | app-tokens.css:1 | 앱뷰 라우트에서 next/font 와 **이중 로드** |
| Pretendard Variable dynamic subset | app-tokens.css:2 | |

- 토큰 스택: `--f-sans` = -apple-system → Plus Jakarta Sans → Pretendard (app-tokens.css:31); en 은 Plus Jakarta/Inter, ko/ja 는 Pretendard 로 교체 (app-view.css:75-84); native-ios 는 SF Pro (native-app.css:197-198) [확실].
- `--f-mono` = JetBrains Mono, ui-monospace… (app-tokens.css:43). 그러나 TSX 에서 **`var(--font-mono)` 66회 참조되는데 정의가 없다** (intel/page.tsx 60회, `'var(--font-mono), monospace'` 42 + `'var(--font-mono, monospace)'` 23) [확실] → 실제로는 시스템 monospace 로 떨어질 것 [추정].
- 모듈 CSS 에서 `'Inter'` 리터럴 하드코딩: dash.module.css 20회, settings/movers/ValueWall 42회 [확실]; 인라인 `'Pretendard, sans-serif'` 18회, `'Plus Jakarta Sans, system-ui'` 6회 [확실].
- 폰트 굵기 사용: 400·500·600·650·700·750·760·800·820·850·900·950 (flow: 900 ×65, 800 ×49, 950 ×37; intel: 800 ×55, 700 ×41, 900 ×36, 950 ×15) [확실].
- letter-spacing 고유값: dash 11종(0.13em~-0.01em), guardian Tailwind tracking 16종 + 인라인 7종, flow 0.04em ×24 등 9종, intel 0.06em ×24 등 12종 [확실].

##### 폰트 크기 값표 [확실]

앱 표면 고유 font-size = **82종** (CSS 23 + 인라인 51 + Tailwind 8; CSS `font:` 축약 조합 ~140종 별도).

| 값 | dash | guardian | cmd | flow | intel(page) | shell | 비고 |
|---|---|---|---|---|---|---|---|
| ≤ 7.5px | 5.5px ×2, 6px 1, 7px 1 | — | — | — | 5px ×3, 7.5px 1, svg 7 ×3 | — | |
| 8 / 8.5px | 8px 1 | 8px 1, 8.5px 인라인 2 | 8px 3, 8.5px 4 | **8px 30**, 8.5px 3 | 8px 2, 8.5px 2 | 8px 2, 8.5px 2 | |
| 9 / 9.5px | 9px 7, 9.5px 1 | 9px 26, 9.5px 4 | 9px 14, 9.5px 3 | 9px 27, 9.5px 2 | 9px 19, 9.5px 11 | 9px 4, 9.5px 2 | |
| 10 / 10.5px | 10px 10 | **10px 30**, 10.5px 8 | 10px 31, 10.5px 5 | 10px 27, 10.5px 1 | **10px 40**, 10.5px 5 | 10px 14, 10.5px 1 | |
| 11 / 11.5px | 11px 6, 11.5px 1, `--f-micro` 3 | 11px 16, 11.5px 4, `--f-micro` 6 | 11px 31, 11.5px 7, `--f-micro` 17 | 11px 13, `--f-micro` **63** | 11px 25, 11.5px 5, `--f-micro` 7 | 11px 10, `--f-micro` 2 | `--f-micro` = 600 11px/1.3 |
| 12 / 12.5px | 12px 6 | 12px 29, 12.5px 2 | 12px 17, 12.5px 5 | 12px 10, 12.5px 3 | 12px 30, 12.5px 6, 12.2px 1 | 12px 13, 12.5px 4 | |
| 13 / 13.5px | 13px 2, 13.5px 인라인 2 | 13px 20, 13.5px 2 | 13px 19, 13.5px 1, `--f-small` 4 | 13px 4, `--f-small` 9 | 13px 32, 13.5px 1, `--f-small` 2 | 13px 15, 13.5px 2, `--f-small` 3 | |
| 14 / 14.5px | 14px 2 | 14px 7 + text-sm 5 | 14px 6 | 14px 3 | 14px 7 | 14px 8, 14.5px 1 | |
| 15px | 15px 3, `--f-body` 1 | 15px 4, `--f-h3` 1 | 15px 3 | 15px 7, `--f-body` 9 | 15px 12 | 15px 5, `--f-h3` 1 | `--f-body` = 400 15px/1.45 |
| 16–19px | 16px 3, 17px 1 | 16px 6, 17px 2, 18px 4, 19px 2 | 16px 4, 18px 2, `--f-h2` 1 | 16px 1, 17px 5, 18px 3, `--f-h2` 3 | 16px 3, 17px 1, 18px 3, `--f-h2` 1 | 16px 1, 17px 1, 18px 4 | |
| 20–25px | — | text-xl 2, 25px 1 | 20px 2, 22px 3, 24px 1, `--f-h1` 1 | 20px 2, 22px 3, 24px 1 | 22px 1, 25px 1, `--f-h1` 1 | 22px 1, 24px 1, `--f-h1` 1 | |
| ≥ 27px | — | 32px 1 | 28px 2, 32px 2, `--f-display` 1 | 28px 1, 30px 1, `--f-display`(30px 로 override) 1 | 28px(dead) 1 | 27px 1, 28px 1, 33px 1 | |

- Tailwind 텍스트 유틸(앱 표면 합계): text-xs 179, text-sm 97, text-lg 29, text-base 22, text-xl 16, text-3xl 7, text-2xl 7, text-4xl 3 [확실].
- 최다 인라인 값: '10px' 67, '9px' 45, '12px' 45, '11px' 40, '13px' 37, '8px' 33 [확실].

##### tabular-nums [확실]

사용됨: 앱 표면 217행 — CSS 모듈 `font-variant-numeric: tabular-nums` 49 (cmd.module.css 37: 213, 230, 396, 467, 472 등; dash.module.css 8), 인라인 `fontVariantNumeric` 13 (cmd/page.tsx:1448,1472,3410,3419; intel/page.tsx:4569), Tailwind `tabular-nums` 105 (flow/page.tsx 57행, MobileGammaShield 19), `className="tnum"` 62 (flow 55, guardian page 6, intel 1). 정의: app-view.css:143 `.tnum`, app-view.css:52 `.app-viewport { font-feature-settings: 'tnum' 1, 'cv01' 1 }`, globals.css:277-278 `@utility font-num`. 인벤토리는 `grep '\.tnum\b'` 로 정의를 못 찾았다고 기록했으나 dash 리더는 app-view.css:143 을 `.tnum` 정의로 인용함 — 위치 재확인 필요.

##### 11px 미만이 **내용(값·라벨)** 에 쓰인 곳 (file:line) [확실]

| 화면 | 위치 | 크기 | 용도 |
|---|---|---|---|
| dash | dash.module.css (symbolBadge 등) | 5.5px ×2, 6px, 7px, 8px, 9px ×7 | 배지 글자·라벨 [표현층] |
| dash | page.tsx:2083,2087 | 13.5px 인라인 | 브리핑 본문(토큰 15px 을 override) |
| guardian | 6파일 | text-[9px] 26, text-[8px] 1, 인라인 8.5px 2 ("800 8.5px/1.08 'Inter'"), 9px 2, 9.5px 2 | 라벨·배지·크레딧 스프레드 % 접미(fontSize 9) [정밀층 일부] |
| guardian | page.tsx:596 | `font: var(--f-micro)` → `fontSize:'9px'`, `fontWeight:900` | 탭 라벨 |
| cmd | page.tsx 다수 | 8px 3, 8.5px 4, 9px 14, 9.5px 3, 10px 31 | NBBO 'Est.' 8px(opacity 0.5, :450) [정밀층], 레벨맵 라벨, SignalCard 서브 |
| flow | page.tsx 인라인 | **8px 30회**, 8.5px 3, 9px 27, 9.5px 2, 10px 27 | 눈썹 라벨·칩·축 라벨·스트라이크 서브(`#c6d3ea`) [정밀층 일부: 스트라이크 축·OI 값] |
| intel | page.tsx 인라인 | 5px ×3(불릿), 7.5px 1, 8px 2, 8.5px 2, 9px 19, 9.5px 11, 10px 40; svg fontSize 7 ×3 (context gauge) | 벤토 타일 라벨, 게이지 눈금 [정밀층: 게이지] |
| shell | settings 진단 박스 9.5px, movers rangeBottom 8.5px, ValueWall 5px~ | 8px 2, 8.5px 2, 9px 4, 9.5px 2, 10px 14 | |

[정밀층]: 가격(cmd `.p2Price` 32px mono, flow 동일 모듈), 변화율(`p2Chg` 16px), 지표값(`--f-micro` 11px 600 이 압도적: flow 63회, cmd 17회). [표현층]: 눈썹 라벨·배지의 8~10px 군.

---

#### 1-3. 여백·모서리·그림자 리듬

##### 토큰 [확실]
`--s1..--s8` = 4/8/12/16/20/24/32/48px (app-tokens.css:39-40); `--r-card` 12px, `--r-btn` 8px, `--r-pill` 999px; `--shadow` 0 4px 24px rgba(0,0,0,0.4), `--shadow-lg`; `--glass` blur(20px) saturate(180%); `--ease-spring`.
토큰 참조: `--s4` 47, `--s3` 47, `--s2` 26, `--s1` 3, `--s5` 2, `--s6` 2; `--r-pill` 14, `--r-card` 13, `--r-btn` 9; `--shadow` 5 [확실].

##### 여백 고유값 [확실]

| 화면 | 방식 | 고유 gap 값 | 고유 padding/margin 조합 | 비고 |
|---|---|---|---|---|
| dash | CSS 모듈 | 2,3,4,5,6,8,10,12px + `--s1/--s2` (11종) | padding 조합 ~22종, margin ~15종, 인라인 11건 | `.app-card` padding 16px, margin 0 16px 12px |
| guardian | Tailwind + 인라인 | gap-1~gap-4 7종(gap-2 ×22) + 인라인 3~12 (10종) | p-0.5~p-4 6종, px 8종, py 8종, mt 8종(mt-1 ×22), mb 5종; 인라인 padding 문자열 16종 | 탭 콘텐츠 gap 12px |
| cmd | CSS 모듈 + 인라인 + Tailwind | CSS 8px ×16, 6px ×16, `--s2` ×10, `--s3` ×9, 5px ×8… (13종); 인라인 3 ×7 등 8종 | CSS padding 조합 ~40종, margin ~25종; 인라인 padding 12종, margin 20종+; Tailwind 30종+ | 카드 margin `0 var(--s4) var(--s3)`; hero `var(--s3) var(--s4) 12px` |
| flow | 인라인 | 8px ×23, 12px ×13, 10px ×7, 6px ×8, 7px ×6, 9px ×5, 4px ×5, 5px (8종) | **padding 조합 ~80종**, marginTop 20종(4px ×16, 3px ×9, 5px ×6…), marginBottom 16종 | 페이지 하단 padding 160px |
| intel | 인라인 | 문자열 spacing: '8px' 55, '10px' 35, '6px' 31, '4px' 29, '12px' 21, '7px' 15, '5px' 12, '14px' 11 … | 단일 사용 조합 ~55종 (예: '-4px 0 10px 26px', '16px 16px calc(env(safe-area-inset-bottom) + 28px)') | 토큰은 `--s4` 만 `.page`/`.app-card` 경유로 도달 |
| shell | 모듈 CSS | 2,3,4,6,7,8,9,10,12px + `--s3/--s4` (11종) | padding 조합 ~45종, margin-top 20종 | 온보딩 safe-area `max(22px, env(...))` |

##### 모서리 [확실] — 앱 표면 고유값 116종 (CSS 37 + 인라인 51 + Tailwind 29)

| 화면 | 사용값 |
|---|---|
| dash | 999px ×7, 50% ×6, 4px ×3, `--r-card` ×2, `--r-btn` ×2, 8px ×2, 20/14/12/10/3/2px, 0, inherit (14종) |
| guardian | 인라인 18, '18px 18px 13px 13px', 14, 12, 11, 10 ×2, 9, 4, 999, 50% ×4; Tailwind rounded-lg 29, -xl 22, -full 22, -md 10, rounded 7, -2xl 3, -sm 1 (18종) |
| cmd | 8px ×11, `--r-pill`/999px ×21, 10px ×9, 50% ×8, 4px ×7, `--r-card` ×8, 2px ×6, `--r-btn` ×5, 6/5/3/12px ×3, 16/13/11px ×2, 14/9/20/2.5px, calc(var(--r-card) - 4px), 비대칭 6종, `0 !important` ×2 + '0px' ×5 (연결 카드), Tailwind 7종, SVG rx 4종 (35종+) |
| flow | 999px ×22, 50% ×14, 12px ×21, 10px ×16, 14px ×7, 4px ×15, 8px ×10, 11px ×6, 9px ×5, 6px ×3, 2px ×3, 16/13px, 0px (17종) |
| intel(page) | '999px' 22, '10px' 16, '8px' 10, '50%' 10, '12px' 8, '4px' 7, '14px' 6, '6px' 5, '16px' 5, 9/7/5/22/15/11px ×2, 20/3/2/13px, '18px 18px 0 0', '0 14px 14px 0', '0 10px 10px 0', '0 0 16px 16px', `--r-btn` (28종) |
| shell | 2,5,6,7,8,10,11,12,13,14,15,16,18,20,24,26,28px, 50%, 999, `--r-card`, `--r-btn` + 조합 4종 (25종) |

##### 그림자·글로우 [확실]

| 화면 | 개수 | 특징 |
|---|---|---|
| dash | box/text-shadow 선언 ~45, `@keyframes` 9개 중 6개가 글로우 애니 (pulseCyan, liveBlinkUp/Down, macroLiveBlink, flashUpGreen/Red) | 매크로 배지 8종 각각 고유 0 0 6px 글로우; `.badgeBreaking` 이 존재하지 않는 `pulseNeon` 키프레임 참조 (css:1138) |
| guardian | 인라인 12 + Tailwind shadow-[…] 20종 + drop-shadow 3 + 글로벌 클래스 3 | GEX 값 크기별 글로우 4단계(≥40, ≥20, −40..−20, ≤−40) |
| cmd | CSS 모듈 ~60 선언 + 인라인 8 템플릿 | backdrop-filter 5종(`--glass` 12, blur 8/10/12/18/30px); `--glow-*` 토큰 사용 |
| flow | 인라인 ~45 + style-jsx 키프레임 6 | 스타일 대부분 `inset 0 1px 0 rgba(255,255,255,0.04~0.12)` 상단 하이라이트 + 큰 드롭섀도 조합 |
| intel(page) | 26종 (text-shadow 0) | 헤더 카드 `0 22px 52px rgba(0,0,0,0.38)`, 모달 시트 `0 -12px 48px rgba(0,0,0,0.5)` |
| shell | 33종 | 탭바 3중 섀도(app-view.css:535-538), CTA 글로우 `0 14px 34px rgba(34,211,238,0.24)` |

[표현층]: 위 항목 전부. 예외 [정밀층]: 스트라이크 바·게이지 바·레벨맵 마커의 글로우는 값 위치를 나타내므로 정밀층 경계에 있음.

---

#### 1-4. 컴포넌트 종류

##### 공유 컴포넌트 (실제 import 되어 재사용) [확실]

| 컴포넌트 | 파일 | 사용 화면 |
|---|---|---|
| MobileAppFooter (Tailwind) | src/components/mobile/MobileAppFooter.tsx | dash, guardian, cmd, flow, intel, movers |
| AdBanner (`return null`) | src/components/app/AdBanner.tsx:1-3 | dash, guardian, cmd, flow, intel |
| ValueWall + RewardedAdModal + ProPaywall | src/components/app/ValueWall.tsx, ValueWall.module.css, ProPaywall.tsx | dash(기관 펄스), guardian(Shield 탭), cmd(AI/QUANT/HOLDERS), flow(GEX·AI·고래덱), settings |
| AppTickerLogo | src/components/app/AppTickerLogo.tsx | dash, cmd, flow, intel(page), movers |
| Sparkline | src/components/app/Sparkline.tsx | dash, movers |
| MetricInfo + metricGlossary(43항) | src/components/app/MetricInfo.tsx, metricGlossary.ts | cmd, guardian(page), intel |
| SwipeableTabs | src/components/app/SwipeableTabs.tsx | guardian, cmd, flow |
| AppGexTimeline / App5DayTape / DisclosureBadge | src/components/app/* | cmd (DisclosureBadge 는 intel 도) |
| IVSkewCurve / MobileCmd13F / MobileCongressCard | src/components/IVSkewCurve.tsx, intel/mobile/* | cmd |
| GuardianProvider, GravityGauge(ECharts), MarketBreadthPanel, RealityCheck, WhatIfSimulator, EconomicCalendarWidget, MobileSmartMoneyMap, MobileGammaShield, GuardianTooltip, FeatureGate(ProGate) | src/components/guardian/* , gate/FeatureGate.tsx | guardian |
| FlashPrice / PriceDisplayCard, SectorIcon, useIntelSharedDataForApp | src/components/ui/PriceDisplay.tsx, intel/mobile/SectorIcon.tsx | intel |
| AppBottomNav, NetworkStatus, AppAnchorAd, AppFirstRunOnboarding | src/components/app/* | 셸 레이아웃 |
| 글로벌 CSS 클래스 `.app-card/.app-card-head/.app-card-title/.app-skeleton/.app-header/.tnum/.app-pressable/.app-intel-surface/.app-brief-toggle` | src/styles/app-view.css:143-350 | dash(composes), guardian, flow, intel |

##### 화면별 재구현 (같은 개념을 따로 만든 것) [확실]

| 개념 | dash | guardian | cmd | flow | intel | shell |
|---|---|---|---|---|---|---|
| **메트릭 타일** | `.macroCell`, `.regimeMetric`, `.instCell` (dash.module.css) | 인라인 macro card (page.tsx:445-479), Overview FOMC 타일, GammaShield 30D `h-[88px]` 타일 | `.heroMetricCard`, `.p2Vital`, `.fundItem`, SignalCard(page.tsx:1723) | cmd 모듈 `s.heroMetricCard/p2Vital` 재사용 + 인라인 stat cell rgba(30,41,59,0.2) ×4 | 인라인 summary tile(page.tsx:2713), 섹터카드 GEX/PCR 박스, 벤토 2×5, MobileTickerDetail `MC`, SectorSessionGrid quad | movers 없음 |
| **카드 프레임** | `.app-card` composes (surface-1, 12px) + `.pulseCard` 12px + `.moverCard` | `.app-intel-surface`, shadow-2xl Tailwind 카드 rgba(10,14,20,0.85), 인라인 헤더 카드 radius 18 | `.card`(rgba(22,32,54,0.45) glass), `.p2Card` 14px, `.premiumCard` 16px, `.c2Card` | style-jsx `.premium-card` 12px + 인라인 카드 ~10종 (14px) | 인라인 섹터카드 22px, 헤더카드, 디테일 히어로 blur 20px, 리포트 시트 | settings `.card` 14px, movers `.card` 18px 하단, ValueWall vault 16px, ProPaywall sheet 24px, 온보딩 24/28px |
| **배지/필** | `.sessionPill`, `.pulseLiveBadge`, `.badgeSignal/Econ/Breaking`, 매크로 배지 8종 | 인라인 session badge(999), Tailwind rounded-full ×22, LIVE/STANDBY 필 | `.headerBadge`, `.badgeGold`, `.premGradeBadge`, `s.badgeAmber/Green` | cmd 배지 재사용 + 인라인 999px ×22 | 인라인 '999px' ×22 (세션·감성·톤·커버리지·CTX) | movers `sessionPill`, 온보딩 pill, ValueWall teaserChip |
| **게이지** | — | GravityGauge(ECharts), RealityCheck DualGauge/MiniGauge, GammaShield 스피도미터(SVG 니들, 1.3s), 트리거 밴드 슬라이더 | 레벨맵 세로 ruler(320px), day-range rail, GEX 퍼센타일 게이지(AppGexTimeline) | OPI 반원 SVG 182×100(needle 1.2s), 현재가 ruler, AI 바이폴라 슬라이더, 레인 레일 | 반원 감마 레짐 게이지(cross-sector), 70px SVG context gauge, GAMMA TUNNEL 트랙(18px), MobileTickerDetail 56px 링 | — |
| **차트** | Sparkline(60×22) + DEMO 정적 배열 | GravityGauge SCORE TIMELINE, GammaShield 7D 스파크라인, SmartMoneyMap SVG 버블 | CandleChart(page.tsx:207, LINE/CANDLE, VWAP/SMA), SparklineBg, IVSkewCurve, AppGexTimeline 96px area | SparklineBg(flow 로컬 복제, page.tsx:624), 스트라이크 바 리스트 | Sparkline(60×18) + ExpandedSparkline(300×50) 로컬, MobileTickerDetail/SectorSessionGrid 각각 MiniSparkline | movers Sparkline 공유 |
| **로고** | AppTickerLogo | Flow 탭 `/api/logo/` img 직접 | AppTickerLogo + MobileCmd13F clearbit | AppTickerLogo | AppTickerLogo(page) vs parqet URL 직접(MobileTickerDetail, SectorSessionGrid) | AppTickerLogo |
| **세션 판정** | ET 시계 헬퍼(page.tsx:183-243) | isCmeGlobexActive/isVixSessionActive(page.tsx:153-173) + getEffectiveSession | useMarketStatus + calcPriceDisplay | effectiveSession(page.tsx:862-864) | useMarketStatus(page) vs 클라이언트 시계(SectorSessionGrid:452-470) | movers useMarketStatus |
| **온보딩** | — | — | — | — | — | AppFirstRunOnboarding(2단계, 레이아웃 마운트) vs /app-view/onboarding 페이지(3단계, 링크 없음) — 2벌 |

- 로컬 복제 예: flow/page.tsx 의 `SparklineBg`(L624-677) 는 cmd/page.tsx:786 과 같은 구현 [확실]. intel 의 `MobileTickerDetail`·`SectorSessionGrid` 는 웹 /intel 전용이며 앱 intel 페이지가 import 하지 않는다 [확실].
- 정의만 있고 미사용: cmd `GexBarChart`(851-905), `genCandles`; flow `renderDarkPoolCard`(L1966-2050), `handleUnlock` 등 20여 심볼; dash `brandIcon/pulseDivider/skelMacro/tnum` 클래스; guardian `getInsightText` [확실].

---

#### 1-5. 화면별 정보 밀도

| 화면 | LOC | 스타일 방식 (비율) | 메트릭 타일 수 | 기본 노출 기능 | 탭/모달/잠금 뒤 기능 | 호출 API 수 |
|---|---|---|---|---|---|---|
| dash | 3,696 (page 2,211 + css 1,485) | CSS 모듈 ~86% (171 className vs 28 inline), 클래스 146, keyframes 9 | 31 (regime 4, 펄스 9카드, 매크로 8, 무버 4, 섹터 8+필, 브리핑, 뉴스, 기관 4, 티저) | 17 | 5 (AI 브리핑 모드, 기관 4카드, 리워드 모달, AdBanner=null, 리뷰 프롬프트) | 9 |
| guardian | 3,690 (6파일) | Tailwind ~82% / 인라인 17% / 모듈 <1% (page.tsx 는 인라인 49 vs 9) | 42+ (헤더 1, 리스크 4, 크레딧 1, Overview 8, Reality 4, Shield/Gamma 15, Flow 9) | 11 (헤더·RLSI·리스크 스트립·크레딧·탭 4개·스와이프·알림·모닝브리프·속보·Overview 3카드·푸터) | 12 (Reality 2, Shield 3, Flow 3, 툴팁, ProGate) | 8+ |
| cmd | 6,860 (page 4,046 + css 2,814) | 모듈 54% / 인라인 30% / Tailwind 16% (325 className, 137 inline); 클래스 317, keyframes 13 | 36 (히어로 옵션 3, 바이탈 3, 가격·확장 2, 다크풀, 변동성, NBBO, 차트, 애널리스트, 펀더멘털, 어닝, 5-DAY, 개요, 피어, QUANT 8, 레벨맵, IV skew, GEX timeline, AI 5, 13F 3, 인사이더, 8-K) | 20 (OVERVIEW 탭 전체 + 헤더/칩/히어로) | 14 (AI·QUANT·HOLDERS 탭 각 ValueWall 잠금, 검색 모달, 8-K 팝업, MetricInfo) | 15+ |
| flow | 4,669 (단일 파일) | 인라인 ~74% (486 `style={{` vs 168 className); cmd 모듈 55 클래스 차용; style-jsx 2블록 | 60+ (히어로 6, 브리핑 칩 3, OPI 7, PCR 3, 프리미엄 6, ruler 4, GEX 6, AI 8+, 고래 12, 스트라이크 10) | 20 (OVERVIEW 탭: 헤더·검색·칩·가격카드·바이탈·세그·브리핑·OPI·PCR·프리미엄·ruler·GEX(잠금)·푸터) | 15 (AI INTEL 2카드, WHALE 5, STRIKE 2, UOA 배너, 확장시간 카드, 검색폼, 팝오버 8종) | 6 |
| intel | 7,286 (page 5,794 + 2 미사용 파일 1,492) | page.tsx 인라인 ~97% (509 `style={{` vs 15 className) | 70+ (page 요약 4, 섹터카드 ×10 각 9, cross-sector 6, 리포트 시트 4+, 스코어보드 5, 벤토 10, 터널·게이지 등) | 6 (헤더카드·요약타일·탭바·섹터카드 10·푸터·광고 인터스티셜 트리거) | 20+ (리포트 탭 전체, 리포트 시트, 섹터 디테일·아코디언 4, 벤토, AI 브리프, 인터스티셜 모달) + dead `{false &&}` 6블록 | 4 |
| shell | 3,534 (12파일; 조합 포함 5,563) | 모듈 76% / 인라인 18% / 리터럴 6% (Footer Tailwind, 탭바·앵커 글로벌 CSS) | movers 행 7 + 세션 필, ValueWall 3, paywall 1, settings 3 | 셸: 탭바·앵커광고(웹)·첫실행 온보딩; movers: 헤더·탭·리스트 20행·푸터; settings: 언어·알림·캐시·평가·약관·크로스프로모·버전 | Pro 카드/페이월(IAP_LIVE=false 로 미렌더), 광고 프라이버시, 안드로이드 진단, 오프라인 필, 리워드 모달 | movers 1 |

- 폴링 주기 [확실]: dash 30s(7 엔드포인트)+무버 10s+티커 5s; guardian 30s + WS; cmd 30s + AI 30분 쿨다운; flow 30s; intel 스냅샷 10개 병렬 + perplexity 45s 타임아웃; movers 15s.

---

#### 1-6. 화면별 기능 목록 (코드에서 찾은 것)

##### dash

| 기능 | 하는 일 | 기본 노출 | file:line |
|---|---|---|---|
| 브랜드 헤더 (SVG 로고 30px + 'SIGNUM HQ' + 'DARK POOL INTEL') [표현층] | 스티키 `.app-header` 내 정적 브랜딩 | 예 | dash/page.tsx:1620 |
| 설정 버튼 (기어 30px 원) [표현층] | `/app-view/settings` 로 push | 예 | :1641 |
| 라이브 뉴스 티커 바 [표현층] | 5s 회전, 배지 시그널/지표/속보, 탭→guardian?tab=reality; 뉴스 0건이면 미렌더 | 예 | :1651 |
| Market State 스트립 (regimeStrip) [정밀층] | 리스크 톤 헤드라인 + 선물/현물/리스크 3박스 | 예 | :1695 |
| Market Pulse 상태 배지 [표현층] | LIVE/FUTURES LIVE/VIX LIVE/CLOSED 필 + pulseGlow | 예 | :1728 |
| Market Pulse 3×3 그리드 [정밀층] | 9카드 104px: 배지·가격·▲▼%·스파크라인(정적 DEMO); 세션 중 liveBlink 1.8s; ETF 행 WS 플래시 | 예 | :1736 |
| Macro Board 4열 8셀 [정밀층] | BTC/GOLD/OIL/SOX/US10Y/DXY/2s10s/F&G; live 셀 macroLiveBlink 2.2s | 예 | :1833 |
| Top Movers 토글 거래대금/상승률/하락률 [정밀층] | 재조회 `/api/market/movers?type=`; 10s 폴링 | 예 | :1873 |
| 'VIEW ALL >' [표현층] | `/app-view/movers` 이동 | 예 | :1894 |
| 무버 가로 스냅 스크롤러 4카드 [정밀층] | 로고·심볼·변화칩·가격·채움 스파크라인; 탭→cmd?t= | 예 | :1912 |
| 섹터 히트맵 4×2 + 세션 필 [정밀층] | 동적 그라디언트 셀, teal/rose 텍스트, WS 오버레이 | 예 | :1959 |
| 브리핑 카드 모드 토글 브리핑/실시간 [표현층] | 기본 'news' 모드 | 예 | :2024 |
| 실시간 뉴스펄스 5건 + CTA [표현층] | 각 행→guardian?tab=reality | 예 | :2101 |
| AI 모닝브리핑 모드 (속보 2 + HTML 본문 + CTA) [표현층] | dangerouslySetInnerHTML, 13.5px | 아니오 | :2040 |
| 기관급 마켓 펄스 ValueWall 잠금 [표현층] | 블러 2×2 + 자물쇠 + '광고 보고 1시간 해제' + '오늘 14.2K 잠금해제' | 예 | :2140 |
| 기관 시그널 카드 ×4 (해제 후) [정밀층] | 값 17px 850 + 5px 진행바 + 인사이트 | 아니오 | :2179 |
| 리워드 광고 모달 30s [표현층] | 카운트다운 후 '계속' | 아니오 | ValueWall.tsx:362 |
| AdBanner | `return null` | 아니오 | AdBanner.tsx:1 |
| MobileAppFooter [표현층] | 약관/개인정보/지원메일/면책/저작권 | 예 | MobileAppFooter.tsx:44 |
| WS 오버레이 + 틱 플래시 [정밀층] | 1.2s flashUp/Down; 현물 행은 `flashClass=''` 고정으로 미적용 | 예 | :540, :1772 |
| 폴링/재시도 | fetchAll 30s, 무버 10s, index-close 2.5s 재시도, macro 1.2/3.5/8s | 예 | :1196 |
| 앱스토어 리뷰 프롬프트 | maybePromptReview() 마운트 시 | 아니오 | :556 |

##### guardian

| 기능 | 하는 일 | 기본 노출 | file:line |
|---|---|---|---|
| 스티키 커맨드 헤더 (GUARDIAN, 링/도트, 세션 배지) [표현층] | z 100, blur 24px, 세션 HOLIDAY/LIVE/PRE/AFTER/CLOSED | 예 | guardian/page.tsx:350 |
| RLSI 점수 필 [정밀층] | ≥60/≥40 색 분기, 글로우 | 예 | :409 |
| 리스크 스트립 4카드 (공포·탐욕/VIX/S&P F/NASDAQ 100) [정밀층] | 세션 활성 시 `.app-live-index-pulse` | 예 | :445 |
| 신용 스프레드 행 + ⓘ [정밀층] | HY OAS, 20D, 레짐 배지, 1Y 백분위; WIDENING 시 적색 글로우 | 예 | :507 |
| 탭 4개 (AI 요약/시장 현황/방어 지표/기관 플로우) [표현층] | vibrate(10), ?tab= 동기화, scrollIntoView | 예 | :565 |
| 스와이프 탭 전환 [표현층] | 50px/500ms | 예 | :622 |
| 알림 배너 [표현층] | alerts>0 일 때만 | 예(조건) | :615 |
| AI 모닝브리핑 배너+모달 [표현층] | ?brief=1 자동 오픈; 30자 미만이면 null | 예(조건) | :629 |
| 급변동 속보 카드 [표현층] | 120s SWR; 없으면 null | 예(조건) | :632 |
| Overview: Gravity Gauge 카드 (ProGate peek) [정밀층] | ECharts 게이지 + 5 분해 바 + 타임라인, HUD 장식 | 예 | MobileGuardianOverview.tsx:136 |
| Overview: BRIEFING/WHAT-IF 세그먼트 [정밀층] | RLSIInsightPanel ↔ WhatIfSimulator | 예 | :172 |
| Overview: FOMC 경로 & 유동성 카드 [정밀층] | D-day, 확률 바, 인하/동결/인상, 유동성/안전자산 | 예 | :235 |
| Reality: REALITY CHECK 카드 [정밀층] | DualGauge + 5 MiniGauge, 매크로 경보/뉴스 펄스 | 아니오 | MobileGuardianReality.tsx:33 |
| Reality: 경제 캘린더 [정밀층] | FALLBACK_EVENTS 즉시 렌더 | 아니오 | :68 |
| Shield: ValueWall 광고 잠금 [표현층] | 티저 + '오늘 14.2K 잠금해제' | 아니오 | MobileGuardianShield.tsx:567 |
| Shield: GAMMA SHIELD 카드 [정밀층] | 헤드라인, GEX, SPY/QQQ, 니들 게이지, 트리거 밴드, 30D 6타일 | 아니오 | MobileGammaShield.tsx:863 |
| Shield: GAMMA SHIELD AI 카드 (ProGate blur) [표현층] | 핵심 결론, 3-LAYER 근거, AI 해석 접기 | 아니오 | MobileGuardianShield.tsx:591 |
| Flow: Flow Topography Map [정밀층] | SVG 버블 맵, 핀치/팬, TARGET LOCKED, ELITE 잠금 폴백 | 아니오 | MobileGuardianFlow.tsx:299 |
| Flow: TACTICAL VERDICT (ProGate blur) [표현층] | 핵심 판단, 근거 칩, ROTATION/MOMENTUM/TARGET LOCK | 아니오 | :356 |
| Flow: SECTOR INTEL [정밀층] | Top Movers 5, 5일 추세 바, 라이브 티커 표→cmd | 아니오 | :580 |
| GuardianTooltip 호버 | CSS 호버 280px | 아니오 | :303 |
| ProGate 티어 게이팅 | guest 쿠키 방문 ≤5 회 오픈; 영어 title | 예 | FeatureGate.tsx:147 |
| AdBanner + 푸터 | null / 푸터 | 예 | guardian/page.tsx:668 |

##### cmd

| 기능 | 하는 일 | 기본 노출 | file:line |
|---|---|---|---|
| 핀 헤더 (뒤로·티커 캡슐·검색) [표현층] | sticky z-100 glass | 예 | cmd/page.tsx:2977 |
| 퀵픽 티커 칩 (최근 6 + 9 인기) [표현층] | 활성 칩 cyan 글로우 | 예 | :3000 |
| 앰비언트 배경 글로우 3개 [표현층] | fixed 장식 | 예 | :2970 |
| 히어로 신원 행 (44px 로고, TICK 칩, 세션 배지, ET 시계) [표현층/정밀층] | MARKET OPEN/PRE-MARKET/AFTER HOURS/CLOSED | 예 | :3042 |
| 큰 가격 + 변화율 [정밀층] | 32px mono, 450ms 플래시 | 예 | :3078 |
| 확장시간 카드 [정밀층] | PRE/POST, breathe·플래시 950ms | 예(조건) | :3086 |
| 히어로 배경 스파크라인 [표현층] | 티커 시드 의사난수 40점 | 예 | :3039 |
| 8-K 공시 필 → 팝업 [표현층] | 7일 내 highImpact 첫 건 | 아니오 | :3101 |
| 다크풀 히어로 카드 [정밀층] | 24px %, 레짐 태그, 'Why' 토글 | 예(조건) | :3112 |
| MAX PAIN/GAMMA FLIP/TOTAL PREMIUM 타일 [정밀층] | 3열, ⓘ | 예 | :3243 |
| 바이탈 RSI/VWAP/DAY RANGE [정밀층] | 바·레일·핀 | 예 | :3292 |
| 변동성 스트립 [정밀층] | IV−RV, ATR 비율 칩 | 예(조건) | :3364 |
| 세그 탭 OVERVIEW/AI ✱/QUANT ✱/HOLDERS ✱ + 스와이프 [표현층] | 슬라이딩 필, 그라디언트 텍스트 | 예 | :3437 |
| OVERVIEW › 캔들/라인 차트 [정밀층] | NBBO Est., 크로스헤어, VWAP/SMA 토글, 세션 밴드, 1D~1Y | 예 | :3497 |
| OVERVIEW › 5-DAY 테이프 [정밀층] | 5 필 | 예 | App5DayTape.tsx:70 |
| OVERVIEW › 애널리스트 컨센서스 [정밀층] | 스택 바, 12M 타겟, 변경 내역 접기 | 예 | :910 |
| OVERVIEW › 펀더멘털 카드 [정밀층] | 등급·점수·비율 필 | 예 | :1176 |
| OVERVIEW › 어닝 카드 [정밀층] | 카운트다운, 진행바, Beat/Miss, Forward | 예(조건) | :1327 |
| OVERVIEW › 회사 개요 [표현층] | 12.5px 본문 | 예(조건) | :3522 |
| OVERVIEW › 관련 종목 4 [정밀층] | WS 오버레이, 탭→cmd | 예(조건) | :1672 |
| AI 탭 › ValueWall [표현층] | '30초 광고… 1시간' | 아니오 | :3549 |
| AI 탭 › AI Deep Analysis [표현층] | 갱신 30분 쿨다운, verdict/insight/RISK/CONFIDENCE/아코디언 | 아니오 | :3593 |
| QUANT › SignalCard 8종 [정밀층] | DARK POOL/VOL REGIME/CONVICTION/VOL SQUEEZE/INSIDER/TREND/FLOW PULSE/FUNDAMENTAL | 아니오 | :3708 |
| QUANT › IV Skew Curve [정밀층] | 듀얼 커브, ATM, 호버 | 아니오 | IVSkewCurve.tsx:416 |
| QUANT › 레벨 맵 [정밀층] | 320px 세로 ruler, 피벗+감마 마커 | 아니오 | :1504 |
| QUANT › GEX Timeline 30D [정밀층] | 96px area, 백분위 게이지 | 아니오 | AppGexTimeline.tsx:275 |
| HOLDERS › 13-F/내부자 [정밀층] | 토글, 요약 3타일, 보유자 카드 | 아니오 | MobileCmd13F.tsx:271 |
| MetricInfo ⓘ 팝업 [표현층] | 포털 다이얼로그 | 아니오 | MetricInfo.tsx:42 |
| 광고 슬롯 (null, 래퍼 div 잔존) | padding·margin 은 렌더 | 예 | :3985 |
| 푸터 | | 예 | MobileAppFooter.tsx:44 |
| 검색 모달 [표현층] | 오버레이 + glass 다이얼로그 | 아니오 | :3993 |
| 티커 영속·스크롤 리셋 | localStorage app-active-ticker | 예 | :2055 |
| 데이터 페칭 (5 병렬 + 부가 6) | 30s, 부분 응답 8s 재시도, CMD_CACHE 10분 | 예 | :2183 |
| 실시간 가격 오버레이 | calcPriceDisplay | 예 | :2466 |
| 진입 애니메이션 | fadeInUp 0.4s delay1~7 | 예 | cmd.module.css:885 |

##### flow

| 기능 | 하는 일 | 기본 노출 | file:line |
|---|---|---|---|
| 스티키 헤더 (심전도 아이콘 + 실시간 옵션 플로우) [표현층] | | 예 | flow/page.tsx:2063 |
| 검색 토글 버튼 / 검색 폼 [표현층] | 44px 입력, FLOW 필, 힌트 도트 3 | 예 / 아니오 | :2075 / :2121 |
| 세션 배지 LIVE/PRE-MKT/POST-MKT/CLOSED [표현층] | 6px 도트 + 글로우 | 예 | :2104 |
| 퀵픽 티커 칩 (브랜드 5색) [표현층] | 최근 6 + POPULAR 9 | 예 | :2236 |
| ?t= 딥링크·localStorage | | 예 | :702 |
| 가격 카드 히어로 (cmd 모듈 재사용) [정밀층] | 5개 티커 회사명 하드코딩 폴백 | 예 | :2313 |
| 확장시간 카드 [정밀층] | | 예(조건) | :2388 |
| 히어로 옵션 3타일 [정밀층] | MAX PAIN/GAMMA FLIP/TOTAL PREMIUM | 예 | :2400 |
| 바이탈 RSI/VWAP/DAY RANGE [정밀층] | VWAP·고저 미존재 시 price×0.995/1.015/0.985 **합성** | 예 | :2454 |
| 라이브 플래시 | 450ms/950ms | 예 | :943 |
| 세그 탭 OVERVIEW/AI INTEL/WHALE/STRIKE + 스와이프 [표현층] | | 예 | :2517, :2757 |
| UOA 알림 배너 [정밀층] | ≥$10M 또는 OI ≥10K; uoaPulse 2.8s | 아니오(조건) | :2569 |
| Overview: Flow Briefing 카드 [표현층] | 컨빅션 배지, 42px 아이콘, 3칩, 액션 스트립 | 예 | :2763 |
| Overview: OPI 반원 게이지 [정밀층] | 니들 1.2s, 장중/장마감 칩 | 예 | :2873 |
| Overview: OPI 구성 요인 레일 3 [정밀층] | | 예 | :2962 |
| Overview: PCR 요약 행 [정밀층] | volRegime 원문 enum 표시 | 예 | :2989 |
| ⓘ 팝오버 8종 [표현층] | 18px 버튼, 클릭 외부 닫기 | 예(버튼)/아니오(내용) | :1720 |
| Overview: Pressure Pair 카드 [정밀층] | 종합 수급 지수, 결론 원, 스퀴즈 확률 | 예 | :3016 |
| Overview: C/P RATIO (VOLUME+OI) [정밀층] | | 예 | :3092 |
| Overview: 총 프리미엄 카드 [정밀층] | 8px 콜/풋 바, Source 칩 | 예 | :3160 |
| Overview: 현재가 위치 ruler [정밀층] | PUT FLOOR/CALL WALL 앵커(미존재 시 ×0.95/1.05 합성) | 예 | :3216 |
| Overview: GEX 레짐 카드 (ValueWall compact) [정밀층] | 잠금 티저 'FREE PREVIEW · GEX 레짐' | 예(잠금) | :3368 |
| AI Intel: AI VERDICT 카드 [정밀층] | 바이폴라 슬라이더, 3칩, 엔진 축 3그룹 | 아니오 | :3636 |
| AI Intel: AI 플로우 인텔리전스 [표현층] | 근거 3행, ValueWall 상세 시나리오 | 아니오 | :3715 |
| Whale: 이상 옵션 활동 8행 [정밀층] | OI 변화 기준 | 아니오(조건) | :3813 |
| Whale: 기관 플로우 총량 [정밀층] | 28px 명목총액, 구성 바 | 아니오 | :3896 |
| Whale: 심리 판독 카드 [정밀층] | 확신도 %, 순방향 원 | 아니오 | :3984 |
| Whale: 고래/내부자 서브탭 + 미리보기 stat 3 [정밀층] | | 아니오 | :4022 |
| Whale: 가로 스냅 덱 (ValueWall) [정밀층] | 잠금 시 2카드 12% opacity blur 3px | 아니오 | :4073 |
| Whale: 맥스 페인 레벨 행 [정밀층] | isLocked 시 blur 5px | 아니오 | :4146 |
| Strike: 주간 스트라이크 맵 [정밀층] | 레인 레일, 12행 바, rawChain 없으면 **더미 12 스트라이크 합성**(L4300-4318) | 아니오 | :4386 |
| Strike: 근접 레벨 카드 [정밀층] | 4셀 | 아니오 | :4639 |
| 광고 해제 플로우 | 1h localStorage | 예 | ValueWall.tsx:232 |
| 30s 백그라운드 새로고침 | | 예 | :1239 |
| AdBanner + 푸터 | | 예 | :4665 |

##### intel

| 기능 | 하는 일 | 기본 노출 | file:line |
|---|---|---|---|
| 헤더 카드 (INTEL 키커 + Brain + 세션 배지) [표현층] | | 예 | intel/page.tsx:2618 |
| 2×2 요약 타일 (강세/약세/커버리지/평균 변동) [정밀층] | 강세·약세는 버튼 | 예 | :2713 |
| 탭 섹터 / 장마감 리포트 [표현층] | | 예 | :2907 |
| 섹터 카드 10장 [정밀층+표현층] | 아이콘·이름·스파크라인·변화 필·AI 해석 2줄·감마 펄스(**상수**)·주도 종목·GEX/PCR/NET·칩 | 예 | :4248 |
| 인터스티셜 광고 게이트 (3회째 클릭) [표현층] | 웹은 2.5s 목업 모달 | 아니오 | :1723 |
| 리뷰 프롬프트 | 4·11회 | 아니오 | :1717 |
| 리포트 탭 로딩 플레이스홀더 [표현층] | 스피너 | 아니오 | :2949 |
| 크로스섹터 브리프 카드 [정밀층] | 매크로 타일, VIX 텀, 옵션 스냅샷 게이지, 로테이션 바, 뉴스 임팩트, 엣지 알림 | 아니오 | :2967 |
| 섹터별 마감 리포트 행 10 [정밀층] | 소스 필, W/L, 감성 필 | 아니오 | :3446 |
| 전체화면 리포트 시트 (portal) [표현층/정밀층] | z 4000, 브리프·뉴스 다이제스트·리스크·핵심 종목 | 아니오 | :3626 |
| 섹터 디테일 뒤로 [표현층] | | 아니오 | :4797 |
| 섹터 디테일 히어로 [정밀층] | 5열 스코어보드, 등락폭 바, 등급 원 | 아니오 | :4831 |
| Key Stocks 아코디언 (기본 열림) [정밀층] | RSI 바, 스파크, FlashPrice | 아니오 | :4975 |
| 확장 종목 벤토 [정밀층] | 2×5 타일 + ⓘ, 8-K, GAMMA TUNNEL, INTRADAY, AI 브리프 | 아니오 | :5102 |
| 종목별 AI 분석 fetch | perplexity 최대 10종, 45s | 아니오 | :1652 |
| AI Intelligence 아코디언 [표현층] | context gauge, QUANT COMMANDER 인용 | 아니오 | :5429 |
| Key Catalysts 아코디언 [표현층] | | 아니오 | :5526 |
| Earnings Calendar 아코디언 [정밀층] | 날짜가 **인덱스·점수로 계산**(fetch 아님, :5623-5628) | 아니오 | :5619 |
| 라이브 시세 병합 | /api/watchlist/batch | 아니오 | :2097 |
| AdBanner + 푸터 | | 예 | :5753 |
| 인터스티셜 목업 모달 (웹) [표현층] | 영어 본문, CLICK COUNTER | 아니오 | :5757 |
| dead `{false &&}` 블록 6개 | | 아니오 | :2813, 3950, 3981, 4055, 4099, 4618 |
| (미사용 파일) MobileTickerDetail 헤더/히어로/링/MC/터널/AI/CTA | 웹 /intel 전용 | — | MobileTickerDetail.tsx:207-450 |
| (미사용 파일) SectorSessionGrid 헤더/4열 카드/푸터 | 웹 /intel 전용 | — | SectorSessionGrid.tsx:677-983 |

##### shell (레이아웃·온보딩·설정·무버스·페이월)

| 기능 | 하는 일 | 기본 노출 | file:line |
|---|---|---|---|
| 셸 뷰포트 + 스크롤 컨테이너 [표현층] | max-width 430px, 하단 패딩 = 탭바 72 + lift 12 + 광고 50 + gap 8 + safe | 예 | app-view/layout.tsx:210 |
| 하단 탭바 5개 (영어 라벨) [표현층] | glass 아일랜드, 활성 cyan 필; 문서/설정 라우트 숨김 | 예 | AppBottomNav.tsx:76 |
| 웹 전용 앵커 광고 미리보기 [표현층] | 'SPONSOR · Apex Clearing…' 정적 | 예(웹) | AppAnchorAd.tsx:58 |
| 오프라인 필 [표현층] | bottom 140, 적색 | 아니오 | NetworkStatus.tsx:32 |
| 첫 실행 온보딩 오버레이 2단계 [표현층] | 체크박스·약관 링크·푸시 권한 | 예(최초) | AppFirstRunOnboarding.tsx:297 |
| 온보딩 시 배너 억제 + html class | | 아니오 | :149 |
| 푸시 토큰 재등록 | | 아니오 | :175 |
| 네이티브 로케일 리다이렉트 | | 아니오 | layout.tsx:29 |
| 푸시 탭 딥링크 | morning→guardian, closing→intel | 아니오 | :56 |
| 글로벌 햅틱 | button/a/[role=button]/[role=tab]/.info-btn | 아니오 | :101 |
| 안드로이드 하단 인셋 동기화 | `--app-bottom-safe` | 아니오 | :150 |
| 풀투리프레시 차단 | | 아니오 | :165 |
| 독립 온보딩 페이지 3단계 [표현층] | 진행 도트, Skip; **어디서도 링크되지 않음** | 예(직접 진입 시) | onboarding/page.tsx:146 |
| 설정 바텀시트 + 딤 [표현층] | 88dvh, 스와이프 120px 닫기 → dash 로 push | 예 | settings/page.tsx:409 |
| 설정: SIGNUM Pro 카드 | IAP_LIVE=false → 미렌더 | 아니오 | :432 |
| 설정: 언어 아코디언 | English/日本語/한국어 | 예 | :470 |
| 설정: 알림 토글 + 서브 2 | 52×32 토글 | 예 | :511 |
| 설정: 캐시 삭제 + 다이얼로그 + 토스트 | 1.5s 후 reload | 예 | :553 |
| 설정: 평가 행 | openStoreReview | 예 | :571 |
| 설정: 약관/개인정보 행 | | 예 | :585 |
| 설정: 광고 프라이버시 행 | UMP 필요 시 | 아니오 | :608 |
| 설정: 컴패니언 앱 2 (Undercurrent, WIM) | 외부 링크 | 예 | :632 |
| 설정: 버전 박스 | 'SIGNUM HQ' + v1.1 폴백 | 예 | :662 |
| 설정: 안드로이드 진단 박스 | 9.5px mono | 아니오 | :671 |
| 설정: ProPaywall 마운트 | IAP 게이트 | 아니오 | :706 |
| 무버스: 헤더 + 뒤로 [표현층] | 'Live Market Movers' | 예 | movers/page.tsx:327 |
| 무버스: 3탭 (Value/Gainers/Losers) [표현층] | 탭별 색 var, 2px 언더라인 | 예 | :338 |
| 무버스: 리스트 카드 헤드 + 세션 필 [표현층] | | 예 | :375 |
| 무버스: 랭킹 20행 [정밀층] | 메달 1-3, 로고, 이유 칩, 진행바, 스파크라인, 가격, 변화 | 예 | :271 |
| 무버스: WS 오버레이 | 120s 신선도 | 예 | :248 |
| 무버스: 15s 폴링 | | 예 | :107 |
| 무버스: 푸터 | | 예 | :394 |
| ValueWall 잠금 게이트 [표현층] | blur 11px/opacity 0.6, conic 자물쇠, amber CTA | 예(소비 화면) | ValueWall.tsx:284 |
| ValueWall Pro CTA/복원 | IAP 게이트 | 아니오 | :319 |
| RewardedAdModal [표현층] | 30s; **참조 클래스 8개가 module.css 에 없음** | 아니오 | :362 |
| ValueWall 해제 리빌 | vaultReveal | 아니오 | :275 |
| ProPaywall 시트 [표현층] | 344px, 가격 '···'/'Not available' | 아니오 | ProPaywall.tsx:188 |
| MobileAppFooter [표현층] | | 예 | MobileAppFooter.tsx:44 |
| MetricInfo ⓘ + 용어집 [표현층] | 43항 ko/en/ja | 아니오 | MetricInfo.tsx:42 |
| AdBanner | null | 아니오 | AdBanner.tsx:1 |

---

#### 1-7. 빈 상태·로딩 상태 처리 (코드 기준)

| 화면 | 빈 데이터 렌더 (file:line) | 로딩 렌더 (file:line) |
|---|---|---|
| dash | Market State '—' (page.tsx:1699,1706,1710,1714); 선물 심볼 누락 시 **행에서 제거**, 2개 미만이면 스켈레톤 영구 (:1290, 1303-1307); VIX '—' (:1817,1820), SPY/QQQ 는 이전값→DEMO 폴백 (:1509-1519); 매크로 '—' (:285, 1858), 2s10s/F&G 셀 생략 (:1375, 1390-1413); 무버 '—' + 빈 배열이면 **메시지 없는 빈 스크롤러** (:1912-1955); 섹터 히트맵 **빈 상태 없음, DEMO 상수 폴백** (:1456-1471); 뉴스 티커 미렌더 (:1651); 뉴스펄스 '수신된 뉴스가 없습니다.' 12px muted (:2124-2128); 기관 시그널 '—' + NO_DATA (:1077-1119, inst 만 정적 설명) ; 티저 '— · 4개 중 1개' (:2146) | 펄스 행 3× `.skelPulse` 72px (:1743,1766,1798; css:776); 매크로 6× skel (8셀 대비, :1841); 무버 4× `.skelMoverCard` 100px (:1905-1910); 섹터 `.skelSector` 120px (:1964); 브리핑 카드 `.skelBriefing` 100px (:2007) + 본문 3바 14px (:2087-2090); 기관 그리드 **쉬머 없는** 180px div (:2177); Market State 는 스켈레톤 없이 '—'; 뉴스 티커 스켈레톤 없음 |
| guardian | verdict 없음 → '시스템 초기화 중...' (page.tsx:270-277); 매크로 카드 '—' 인데 F&G 서브는 '극단적 공포' 표시 (:222, 306-307), VIX 서브 '+0.0%' 적색 (:317-319); RLSI 필 **'0'** (:246, 419); 크레딧 행 null (:509); FedWatch '—' / 'FedWatch 데이터 대기 중' (Overview:250-302); 유동성 `?? 50` → '50 우호적', 안전자산 `?? 0` → '0.00 안정' (Overview:124-125); MiniGauge '—' + '데이터 없음' (RealityCheck.tsx:205-221); GammaShield null → '옵션 데이터 수집 중...' / 'Regular Session Only' h-120 (MobileGammaShield.tsx:826-841); TriggerBand '데이터 수집 중...' (:435-441); 30D 섹션 생략 (:1148); Flow rotation `\|\| 50` → 50%, momentum `\|\| 1` → 0.0%, tripleA → 'SEARCHING' (Flow:468-527); 'Loading live data...' / 'SELECT A SECTOR ON MAP' 영어 (Flow:693, 705); Breadth 비활성 시 opacity 0.4 saturate 0.5 (MarketBreadthPanel:558, 623-636) | Suspense: h1 '가디언' + '로딩 중…' 텍스트, 스켈레톤 없음 (page.tsx:678-684); 헤더 링에 `.app-skeleton` 쉬머 **항상** (:379); `loading` prop 이 Shield/Flow 에서 미사용 (Shield:551, Flow:227); GravityGauge '--' + 5행 pulse 사각 (GravityGauge.tsx:367-369, 494-513); FeatureGate 티어 로딩 blur 8px opacity 0.4 (FeatureGate.tsx:114-130); 니들 350ms 후 1.3s 애니 (Gamma:350-357); MorningBrief/BreakingCard null until data; 캘린더 FALLBACK 즉시 |
| cmd | 전체 실패 → DEMO (price 0 → '$0.00', '▲ +0.00%') (page.tsx:2380-2382, 122-153); MAX PAIN '$—' (:3247), GAMMA FLIP '$—' (:2313), TOTAL PREMIUM '—' 인데 서브 '콜 우세' (:3277-3287); RSI/VWAP/RANGE '—' (:3298, 3312, 3335); 다크풀 카드·변동성 스트립 미렌더 (:3113, 3370); 어닝 null (:1331), 'TBD'; 애널리스트 DEMO 시 '0명…0%', '$0.00', **'-100.0%'** (:960-1001); 개요·피어 숨김 (:3522, 3542); 차트 빈 SVG, 텍스트 없음 (:246-249, 296-297); NBBO 는 **합성값 항상 렌더** (:306-315); QUANT VOL SQUEEZE '—' + '측정 대기' (:3812, 3828), INSIDER '30일 내 공시 없음' (insiderSignal.ts:89), TREND 'SMA 50/200 · +%' (:3875), FUNDAMENTAL 'C' 폴백 (:3910); VOL REGIME/CONVICTION 은 **항상 계산** (5/100 CALM, 50/100 C); AI 없음 → 'Loading AI Analytical Verdict...' 영어 (:3686-3694); IV Skew < 2 스트라이크 → **시뮬레이션 체인 렌더** (IVSkewCurve.tsx:192-216); GEX 히스토리 부족 → 로컬라이즈 박스 (AppGexTimeline.tsx:243-249); 13F 'No institutional 13-F data available' (MobileCmd13F.tsx:103, 204) | Suspense 'Command' + 'Loading…' (page.tsx:4037-4041); 초기 헤더 'Loading…' + `.skeletonBlock` 3× 180px 쉬머 (:2934-2949; css:898-920); 캐시 히트 시 스켈레톤 없음 (:2183-2192); CandleChart 로딩 표시 없음 (:240-256); AI 탭 스피너 링 + '생성 중...' (:3581-3591); dynamic 플레이스홀더 'LOADING SKEW CURVE...' / 'LOADING HOLDERS & INSIDERS...' 180px 영어 (:1493, 1498); MobileCmd13F Loader2 (:102, 203); GEX 스켈레톤 96+56×2 (AppGexTimeline.tsx:231-241); 애널리스트 바 200ms, 어닝 300ms 후 채움 (:918, 1329) |
| flow | 티커 없음 → amber 카드 '데이터 재연결 중' (page.tsx:2291-2311); 고래 덱 '현재 표시할 기관성 체결이 없습니다' (:4122); 내부자 덱 noData + 분류 라인 (:4127-4140); '—' 20곳 (gamma flip :894/2427, max pain '$—' :2414, squeeze :3081, IV Rank/Skew :3447/3451, oiChange :3874, 내부자 :3946/3961, 숏 :3970…); '--' 15곳 (gammaDistance :1680, 스트라이크 칩 :4420-4422, nearest :4643-4646); **0 값 폴백** OPI '0.0 / BEARISH' (:2950), P/C '0.00 강한 풋 우위' (:3117-3127), 총 프리미엄 '$0.0M' (:3164), call/put share '50.0%' (:3193); **합성 폴백** VWAP/고저 (:924-941), floor/wall ×0.95/1.05 (:3218-3219), 스트라이크 더미 12개 (:4300-4318); 두 블록 `display:'none'` 영구 (:4388-4397, 4454-4459) | 초기 로드만 `.app-skeleton` 4블록 180/44/200/150px (page.tsx:2278-2289; app-view.css:345-354); 콘텐츠 전체가 `!loading && tickerData` 게이트 (:2313); 부가 fetch 는 타임아웃 조용히 실패, 타일 스피너 없음 (:1055-1064); SparklineBg opacity 0 until mounted (:664-669); ET 시각 '' until mounted (:2369-2377); 니들 1.2s, 바 0.4s |
| intel | 리포트 탭 빈 캐시 → 스피너 + reportLoading (page.tsx:2949-2964); Sparkline <2 → 점선 opacity 0.15 (:1043-1049); '—' (GEX/PCR/LIQ), '-' (기타) `#94a3b8` (:1129-1172, 4341-4347, 5144-5153); 리더/래거드 '-' (:2730-2741) 그러나 시세 없으면 **m7 이 둘 다** (:2739); 커버리지는 정적 55 (:2749); 티커 칩 심볼만 (:4556-4574); quotes 없으면 grade 'B' score 50 정적 종목 (:2271-2276); 'Awaiting signal...' (:1361-1365), 'No verdict available.' (:1591, 2400); 크로스섹터 서브섹션 각 숨김 (:3082-3440); 등급 원 avgScore 0 → 'D' 적색 (:4960); 레짐 배지 'NEUTRAL GAMMA' (:5405); 어닝 캘린더 항상 1행/종목 합성 (:5623) | 리포트 시트 syncing 배너 + `.app-skeleton` 72×7 (:3678-3699); 디테일 `loading` 300px 카드 — 그러나 `loading=false` 즉시 세팅되어 사실상 미도달 (:4823-4827, 1560); AI 브리프 13px 링 + 'AI ANALYZING' 필 (:5351-5361); 인터스티셜 64px 링 (:5757-5791); FlashPrice 0.05s→0.8s (PriceDisplay.tsx:163-172); 리포트 탭은 캐시 선채움 후 fetch (:2466-2472) |
| shell | movers fetch 실패 → 빈 리스트, **메시지 없음** (`t.errorNotice` 미참조) (movers/page.tsx:124-126, 392); normalizeMover `\|\| 0` 로 '—' 분기 미도달 → '$0.00', '+0.00%' 녹색 (:49-52, 262, 291); 세션 필 'CLOSED' (:105); ProPaywall '···' → 'Not available right now' (ProPaywall.tsx:219, 227); IAP 게이트 요소 미렌더 (settings:432, 706; ValueWall:319-333, 422); NetworkStatus/AppAnchorAd/AppBottomNav/AppFirstRunOnboarding/MetricInfo/AdBanner → null (각 파일) ; 설정 pre-mount 빈 그라디언트 (settings:406) | movers 초기 24px 스피너 + '실시간 데이터를 받아오는 중...' (movers/page.tsx:211-218; css:497-515), Suspense 는 스피너만 (:402-406), 15s 새로고침 표시 없음; 설정 버전 '1.1' 폴백 (:211, 295); ValueWall CTA 'Please wait' (ValueWall.tsx:310-314); RewardedAdModal 'Please wait...' + 진행바 — 참조 클래스 미정의로 **unstyled** (:405-416); ProPaywall 'Working…' (:229); AppFirstRunOnboarding mounted 전 null (:212) |

---

#### 1-8. 다국어 처리

##### 방식 [확실]

| 화면 | 메커니즘 | next-intl 사용 |
|---|---|---|
| dash | 인라인 `copy` ko/en/ja (page.tsx:629-720) + `safeDashCopy` Object.assign (:722-776), `gateCopy` (:777-841), `L3()` 27회, `locale === 'ko' ? … : 'ja' ? …` 삼항 (ko 18, ja 15) | useLocale 만; useTranslations 0 |
| guardian | page TRANSLATIONS (:25-127) + 컴포넌트별 dict 6종 + 삼항 | useTranslations('gate'), ('guardian') 일부 |
| cmd | **114 인라인 삼항**, `tl()` AI 응답 객체 | useTranslations('dashboard')(conv*/vol*), ('common')('search'); ('indicators') 선언만 |
| flow | 모듈 dict 3종(TRANSLATIONS 35키, APP_FLOW_COPY ~72키, WHALE_DP_COPY 50키) + `isSafeLocaleCopy` **모지바케 감지 시 영어 폴백**(L679-699) + 50 삼항 + `L()` 14 + 렌더 스코프 `ui`/`strikeCopy` | ('indicators') 선언만 미사용 |
| intel | in-file dict 8종 (TRANSLATIONS, EARNINGS_APP_COPY, APP_INTEL_COPY, SECTOR_APP_COPY, APP_COMPLIANCE_COPY, COMMANDER_LOG_COPY, reportLabels, tunnelCopy) + 삼항 83 | useTranslations 0 (SectorSessionGrid 만 'sectorSession' 사용) |
| shell | 컴포넌트별 자체 dict 9종 (onboarding COPY, settings T, movers t, AppFirstRun COPY, VALUE_WALL_COPY, ProPaywall COPY, APP_FOOTER_COPY, NetworkStatus LABELS, AppAnchorAd COPY) + metricGlossary 43×3 | MobileAppFooter `t('footer.copyright')` 만 — 세 언어 모두 동일 영어 문자열 (messages/*.json) |

##### 한국어 화면에 렌더되는 영어 (file:line, 발췌) [확실]

| 화면 | 항목 |
|---|---|
| dash | 'DARK POOL INTEL' (:1637); 카드 제목 'Market Pulse' (:1726), 'Macro Board' (:1837), 'TOP MOVERS' (:1870), 'SECTOR HEATMAP' (:1961); 'VIEW ALL >' (:1902); ko 테이블 안의 'FUTURES LIVE'/'LIVE'/'CLOSED'/'HOLIDAY' (:634-637), 'VIX LIVE' (:866,869), 'PRE/REGULAR/POST' (:874-878); 매크로 라벨 BTC/GOLD/OIL/SOX/US 10Y/DXY/2s10s/F&G (:1315-1407); 배지 STEEP/INVERT/FLAT/NORMAL (:1381), EXTREME GREED…(:337-343); 섹터명 Tech/Energy/… (:1463-1470); 'Risk-On 우위' 혼용 (:643,645); 'CALL 62%' (:1078), 'NDX 55 · DOW 48' (:1116); ja 로케일에서 티커 배지 'SIGNAL/ECON/BREAKING' 폴백 (:1659-1667) |
| guardian | 'GUARDIAN' (:386), 'RLSI' (:417), 세션 배지 (:295-299), '20D' (:540); Overview 'BRIEFING'/'WHAT-IF' (:190), 'FOMC' (:251); 'MARKET ESSENCE'/'Gathering Pulse...' (Reality:56-57); RealityCheck 'REALITY CHECK', 'GAUGES/RADAR', 'DIVERGENCE/ALIGNED', 'NDX 20D…' (:164-221); Shield 'GAMMA SHIELD AI', 'CLAUDE', '3-LAYER AI' (:472-500); GammaShield ko dict 안의 'LONG GAMMA','SHORT GAMMA','HIGH CONVICTION','FRAGILE'… (:114-160), 'Regular Session Only' (:838), '7D GEX' (:979), 'Compression' (:1032); Flow 'TACTICAL VERDICT' (:394), 'CLAUDE S4' (:400), 'ROTATION'/'MOMENTUM'/'TARGET LOCK' (:461-499), 'Last session analysis' (:561), 'Regular Session 09:30-16:00 ET' (:571), 'SECTOR INTEL' (:583), 'Loading live data...' (:693), 'SELECT A SECTOR ON MAP' (:705), "Today's Top Movers" (:714); GravityGauge 'Gravity Gauge', 'SCORE TIMELINE', 'NOW', 'P95/P75/P25/P5'; ProGate title 영어 리터럴 7종 |
| cmd | 'Loading…'/'Command' (:2941, 4039-4040); 세션 'MARKET OPEN/PRE-MARKET/AFTER HOURS/MARKET CLOSED' (:2952-2955); '▲ TICK' (:3051); 타일 'MAX PAIN/GAMMA FLIP/TOTAL PREMIUM' (:3245-3274), 'RSI 14/VWAP/DAY RANGE/LOW/HIGH' (:3294-3348), 'Hot/Warm/Cool/Stable' (:3301); 탭 'OVERVIEW/AI ✱/QUANT ✱/HOLDERS ✱' (:3451-3477); 차트 'LINE/CANDLE', 'NBBO Est.', 'Spread', 'O/H/L/C', 'SMA 7/20', '✦ Golden Cross', '1D…1Y' (:424-770); 'Buy/Hold/Sell' (:989-991); 'TBD' (:1334), ja 에서 'AMC/BMO/DMH' (:1346-1350), 'Beat/Miss', 'EPS', 'YoY' (:1425-1472); 레벨맵 'TECHNICAL & GAMMA LEVELS MAP', 'RESISTANCE/SUPPORT', 'Call Wall/Put Floor/Gamma Flip', 'CURRENT PRICE' (:1528-1632); AI 'AI Deep Analysis', 'CLAUDE S4', 'RISK', 'CONFIDENCE', raw 'HIGH/MEDIUM/LOW', 'NEUTRAL' (:2886, 3609-3643); 'Loading AI Analytical Verdict...' (:3691); 'LOADING SKEW CURVE...' (:1493, 1498); IVSkewCurve/MobileCmd13F 전면 영어 |
| flow | 세션 'LIVE/PRE-MKT/POST-MKT/CLOSED' (:2106-2109), 'MARKET OPEN…' (:2315-2318); 타일 (:2412-2506); 'Hot/Warm/Oversold…' (:2461); 탭 'OVERVIEW/AI INTEL/WHALE/STRIKE' (:2543-2566); 'BULLISH/NEUTRAL/BEARISH' (:1446); 'OPI SCORE' (:2955); volRegime enum 'STABLE/LOADED/ERUPTING' (:3010); 'C/P RATIO', 'VOLUME', 'OI' (:3096-3140); 'PUT FLOOR (지지선)' 혼용 (:3343); 'IV Rank/IV Skew/Volume P/C' (:3446-3454); 'AI VERDICT', 'Claude' (:3644, 3742); ko dict 값이 영어: 'FLOW'(:155), 'OPTIONS FLOW OVERVIEW'(:157), 'Pressure Pair'(:163), 'Call Share'(:166), 'LIVE FLOW'/'ESTIMATED'(:169-170), 'HIGH CONVICTION'/'WATCH'/'NEUTRAL'(:180-182), 'LONG GAMMA (안정적 레짐)'(:217), 'LEVEL 3 FLOW'(:454), 'BEP'(:488), 'HIGH/MED/LOW'(:494-496), 'CLOSED DATA/DELAYED'(:498-501); AI 탭 ui 'Bullish Bias/Confidence/Conflict Risk/Flow/Volatility/Positioning' (:3517-3523), 'FREE PREVIEW · AI 맥락' (:3531), 'FREE PREVIEW · GEX 레짐' (:3391); formatCompactMoney 항상 `$` (:608-616) |
| intel | 'INTEL' (:1199); 세션 배지 (:2597-2602); '{time} ET' (:3053, 3589); 'VIX TERM STRUCTURE' (:3125); raw 'BULLISH/BEARISH/NEUTRAL/LONG/SHORT' (:3040, 3397, 3614, 3662, 3781, 3822, 4028, 4957); 'SCORE' (:3767), '{n}pts' (:4192), 'CW/PF' (:4217); 섹터카드 라벨 NET PREM/LIQ/WHALE/SQUEEZE/PCR/GEX 세 언어 동일 (:4272-4304); 스코어보드 GEX/PCR/W/L/SCORE/REGIME/'NEU' (:4908-4912); 'RSI N' (:5067); 'PRE/POST' (:5127); 벤토 라벨 10종 (:5144-5153); 'GAMMA TUNNEL/Put Floor/Call Wall/MaxPain' 세 언어 동일 (:5185-5188); 'INTRADAY' (:5302); 'CLAUDE/AI ANALYZING/STRUCTURAL', 'STRUCTURAL READ', 'CLAUDE BRIEF' (:5034-5041); '{regime} GAMMA', 'WHALE N', 'LIQ N' (:5405-5415); 'AI INTELLIGENCE' (:5445), 'CTX N' (:5457), 'CONTEXT' (:5490), 'QUANT COMMANDER' (:5497), 'KEY CATALYSTS' (:5543), 'BMO/AMC' (:5626), 'D-N' (:5732); 'Awaiting signal...' (:1361), 'No verdict available.' (:1591, 2400); ja 갭: 'CALL/PUT' (:3181), 'LEADERS/LAGGARDS' (:3202, 3222), 'CATALYSTS/RISKS' (:3272, 3285); 디테일 히어로는 영어 섹터명 18px 이 주, 현지어 10px 이 부 (:4873-4880) |
| shell | 탭바 'Dashboard/Guardian/Command/Flow/Intel' (AppBottomNav.tsx:7-11, 의도 주석); movers 세션 필 (:100-105); 'SIGNUM HQ APP' (AppFirstRunOnboarding:34); 'SIGNUM PRO' (ProPaywall:56); settings 'SIGNUM Pro'(:68), 'App Store에서 별점 남기기'(:59), 'Undercurrent'/"Why'd It Move?"(:640, 652), 'SIGNUM HQ'(:663); AppAnchorAd 'SPONSOR · Apex Clearing Intelligence Feed' 전 로케일 (:9-10); 푸터 'contact@signumhq.com' + 영어 저작권 (:57, 64); 온보딩 ko 불릿 '기본 언어는 영어' 진술 (:80, 117); MetricInfo 'i' (:62) |

- 날짜/숫자 포맷: cmd 어닝 ko-KR 이지만 ja 는 en-US (page.tsx:1341); App5DayTape/AppGexTimeline 은 ko-KR/ja-JP/en-US; flow `formattedBlockCount` 만 toLocaleString 로케일 지정 (:1377) [확실].
- 폰트: app-view.css 가 lang 별로 `--f-sans` 를 바꾸지만 settings/movers/ValueWall/dash 모듈 CSS 가 'Inter' 를 62회 하드코딩 [확실].

---

#### 1-9. 테마 지원 현황

**라이트 모드 전환 메커니즘 없음** [확실]. 근거:

| 항목 | 결과 | 위치 |
|---|---|---|
| `prefers-color-scheme` | src 전체 0건 | grep |
| `data-theme` | 0건 | grep |
| `color-scheme` | 1건, 관리자 콘솔 `color-scheme: light` | src/app/[locale]/admin/marketing/marketing-console.css:32 |
| next-themes / ThemeProvider / useTheme | 0건; package.json 에 없음 | grep |
| `.dark` 클래스 정의 | globals.css:90-111 `.dark` 블록, :127-129 `.dark body`, :329-334 `.dark .body-premium` 존재 | globals.css |
| `.dark` 적용 | `<html>` className 은 next/font 변수 3개뿐 (src/app/layout.tsx:129); `documentElement.classList` 추가는 `is-app-view` (app-view/layout.tsx:166), `native-app`/`native-<platform>` (NativeAppProvider.tsx:190-191), `app-onboarding-open` (AppFirstRunOnboarding.tsx:149) 만 | — |
| Tailwind `@custom-variant dark` / `darkMode` | 0건; `tailwind.config.*` 없음 | globals.css, postcss.config.mjs |
| Tailwind `dark:` 변형 사용 (앱 표면) | 0건 | grep |
| 앱 팔레트 | app-tokens.css:4-58 단일 `:root` 다크값; `--m-*` (globals.css:142-179) 도 단일 다크 세트, 768px 이하 미디어쿼리 안 | — |
| 고정 다크 크롬 | viewport themeColor `#050a14` (layout.tsx:36); manifest theme/background `#050a14`; `StatusBar.setStyle(Style.Dark)` + `setBackgroundColor('#050a14')` (NativeAppProvider.tsx:125-127) | — |
| 설정 화면 테마 토글 | 0건 (`theme|light.?mode|dark.?mode` grep) | settings/page.tsx |
| 웹사이트 body | 라이트 그라디언트 `#CFEBF8→#F0F3F7→#F1DCC9` (globals.css:119-125) — 앱뷰 `.app-viewport` 는 `var(--bg)` 로 덮음 (app-view.css:18-58) | — |

즉, globals.css 에 라이트 팔레트(`:root` hsl, :61-88)와 `.dark` 오버라이드가 **정의는 되어 있으나** 앱 표면은 그것과 무관한 자체 다크 토큰을 쓰고, 전환 트리거가 없다 [확실].

---


### 1-C. 코드 ↔ 캡처 대조표 (1-B 끝의 «캡처로 확인해야 할 것» 20항목에 대한 답)

| # | 코드에서 나온 의문 | 캡처 결과 | 등급 |
|---|---|---|---|
| 1 | `var(--font-mono)` 66회 미정의 → 어떤 모노 폰트가 보이나 | 정지 스크린샷으로 서체 식별 불가. 수치가 고정폭으로 렌더되는 것만 확인 | 코드 미정의 [확실] · 실제 폰트 [미확인] |
| 2 | `.badgeBreaking` 의 `pulseNeon` 키프레임 부재 | 「속보」 배지는 보임(`firstrun_10-landing-20s_17e`). 애니메이션 여부는 정지 이미지로 판별 불가 | [미확인: 애니] |
| 3 | RewardedAdModal 참조 클래스 8개 미정의 | 광고 시청 미실행 | [미확인] |
| 4 | `.tnum` 정의 위치 불일치 | flow·cmd·dash 의 수치는 자릿수 정렬 유지(`flow_ZOOM-hero-tiles_17e`) | 정렬 [확실] |
| 5 | cmd `'var(--green)'+'55'` 무효 CSS | 애널리스트 카드 테두리를 확대 확인하지 않음 | [미확인] |
| 6 | 카드 베이스 5종·보더 α 20종 | 화면 간 카드 밝기·테두리·라운드 차이 육안 구분됨(1-A-3) | [확실] |
| 7 | 8–10px 텍스트 판독 | 눈썹 라벨 판독 가능. 단 3열 타일에서 2단어 라벨 줄바꿈 + 값 기준선 어긋남(0-5 항목 6) | [확실] |
| 8 | rose vs red 혼용 | 같은 화면 공존 실측(1-A-3: guardian_17e rose 670 / promax red 1443; flow_mid 둘 다) | [확실] |
| 9 | dash 선물 행 결손 가능성 | 3카드 전부 렌더. 라벨 말줄임 「NASDAQ10…」「RUSSELL2…」 두 기기 모두 | 결손 없음 [확실] · 말줄임 [확실] |
| 10 | 합성값 노출(스트라이크 더미·NBBO·VWAP 합성·히트맵 DEMO) | 스트라이크 맵 축 「$220 · $220 · $230」(풋 플로어=감마 플립 동일 값, `flow_tab-strike_promax`); NBBO 「Est. $509.38 / Spread / $509.92」 표시(`cmd_chart-1m_promax`). 합성인지 실측인지는 화면으로 구분 불가 | 표시 [확실] · 합성 여부 [추정] |
| 11 | 무버스 빈 리스트 · `$0.00` 폴백 | 무버스 화면 미진입. dash TOP MOVERS 는 값 있음 | [미확인] |
| 12 | Guardian 헤더 링 상시 쉬머 | 정지 이미지 | [미확인] |
| 13 | 로딩 순간(스켈레톤) | 최초 설치 실행은 12s+ 빈 화면. **재실행 8초 시점 영어 스켈레톤 존재**(`dash_relaunch-clean-8s_17e`: 회색 블록 + 영어 라벨 + 헤더가 상태바 위) → 12초 한국어 완성 | [확실: 스켈레톤 관측·언어 전환 관측] |
| 14 | 「오늘 14.2K 잠금해제」 정적 문자열 | dash ValueWall 에 표시(`dash_default-bottom_promax`). cmd AI 탭은 탭바에 가려 문구 미확인 | [확실 1곳] |
| 15 | 이중 폰트 로드 → FOUT | 정지 이미지 | [미확인] |
| 16 | 한국어 화면의 영어 라벨 | 첫 뷰포트 영어 ≈20 vs 한국어 9(1-A-1); cmd 첫 뷰포트 영어 라벨 15종 | [확실] |
| 17 | 히어로 녹색 라디얼 틴트가 하락 종목에서도 | 하락 종목 미캡처. 상승 종목 녹색 틴트는 확인 | [미확인] |
| 18 | 두 온보딩 중 어느 것이 뜨나 | 2단계 오버레이(AppFirstRunOnboarding). 3단계 페이지는 어디서도 안 뜸 | [확실] |
| 19 | 앵커 광고 웹 vs 네이티브 | 네이티브 AdMob 배너(흰 배경, 탭바 위, 콘텐츠 오버레이) | [확실] |
| 20 | 탭바 중복 선언의 승자 | 최종 렌더: 플로팅 아일랜드 + 활성 시안 필. 어느 블록이 이겼는지는 판별 불가 | 렌더 [확실] · 원인 블록 [미확인] |

---

## 2단계 — 레퍼런스 조사

> **방법·범위 메모(디렉터).** 웹 조사는 «후보 발굴 → 1차 자료(공식 사이트·App Store 리스팅·디자인 시스템 토큰·릴리스 노트·DOM 실측) 읽기 → 항목별 독립 팩트체커가 반박 시도 → 반박 반영해 종합» 4단계로 수행했다(에이전트 27, 도구 호출 377회, 2026-09-04). 아래 본문은 종합 결과이며, 팩트체커가 뒤집은 주장은 본문 안에 «수정»으로 남겨 두었다. 수량: 금융 6(리테일 증권·기관 터미널·옵션플로우·딜러포지셔닝·데이터 인텔리전스·예측시장) + 금융 밖 5 + 첫 화면 11 + 2026 방향 11. 별도로 «관행적 금융 앱» 기준선(Robinhood·Unusual Whales·Bloomberg·TradingView·일본 리테일 증권·Public.com) 6종을 같은 방식으로 검증해 **2-8** 에 수록했다.
>
> 본문 첫 단락의 «현 구현 #06090f + purple→cyan gradient + glassmorphism»은 조사 브리프 문구다. 1단계 실측으로 바로잡으면: 토큰 배경 `--bg #0b111e`(app-tokens.css:5), 네이티브 크롬·스플래시 `#050a14`, 액센트는 시안 `#22d3ee`(purple 은 AI 탭 텍스트·일부 배지에 한정), 카드 glass 는 cmd/flow 히어로·탭바·헤더에 사용. 방향성 판단에는 영향 없다.


대상: SIGNUM HQ(미국 주식 옵션 인텔리전스 — options flow·dark pool %·GEX·max pain·whale index·IV skew·sweeps·AI 코멘터리; iOS/Android Capacitor + web; ko/en/ja). 현 구현(#06090f 다크 + purple→cyan gradient + glassmorphism)은 «현재 상태»일 뿐 제약이 아니다. 아래 모든 판단은 팩트체커 수정본을 반영했고, 원 조사가 틀렸던 자리는 본문에서 고쳐 썼다. 테마 선택 이유 중 1차 자료가 없는 것은 전부 (추정)으로 표기했다. confidence=low 항목은 없었고, Fiscal.ai 와 토스증권(1차 조사분)은 medium 이었다.

※ 토스증권은 조사 파이프라인에서 두 번 독립 조사됐다(1차 medium, 2차 high). 아래에서는 하나로 합치고, 두 조사의 수정사항을 모두 적용했다.

---

### 2-1. 금융 카테고리 레퍼런스 (6개)

**① Quant Data (v3, quantdata.us / iOS+Android)** — 2026년 현재 운영 중인 options-flow/GEX 도구 가운데 SIGNUM 과 «모양»이 가장 가까운 제품이라 택했다. 데이터 기둥 세 개(options flow·dark pool·dealer GEX/DEX/VEX/CHEX)에 max pain·IV skew·news sentiment·alerts 를 얹고, web + native iOS/Android 앱이 레이아웃을 동기화한다는 전달 형태까지 같다(https://quantdata.us/ , https://apps.apple.com/us/app/quant-data/id1602108613 , https://help.quantdata.us/en/collections/10324504-quant-data-v3). 2026-04-07 v3.0.0, 2026-07-19 v3.0.9(Quant IQ)로 올해 재구축돼 UI 가 현행이다. 비교 축은 정보구조(Exposure / Flow Analysis / Dark Pool / Open Interest·Max Pain / Volatility·Skew 페이지 ≈ SIGNUM 의 flow·dark pool %·GEX·max pain·IV skew·sweeps), 차트 어휘(strike 별 GEX 바·strike×expiry 히트맵·Interval Map 버블·Dark Flow 이중축), «KPI 스트립 → 테이블» 패턴, 모바일 밀도 결정, 페이월 위치다(https://quantdata.us/cdn/images/features/gamma_exposure.webp , https://quantdata.us/cdn/images/features/heat_map.webp , https://help.quantdata.us/en/articles/11133167-mastering-the-interval-map-visualizing-greeks-exposure-in-real-time). 비교 불가 축: AI(Quant IQ 는 대시보드를 «만들어» 주고 시장을 해석하진 않는다), 로컬라이즈(영어·미국 전용), 브랜드 톤(Discord 커뮤니티 주도, 기관적이지 않음). 색 체계는 Unusual Whales 보다 절제돼 있다(시맨틱 green/red + 컨트롤용 blue 하나 + 차트당 «특수» 시리즈에만 purple; https://quantdata.us/cdn/images/slideshow/dark_flow.webp). 단 팩트체커 수정: 날짜 pill 은 중립 회색이고 blue 가 아니며, 세션 스크러버(재생/일시정지+타임스탬프)는 Exposure by Strike 와 Heat Map 두 스냅샷 차트에만 있고 Interval Map·Net Drift 는 range-brush, Dark Flow 는 둘 다 없다. 'Electric Blue'·'Key Lime Pie' 같은 테마명은 어디서도 확인되지 않아 미검증으로 둔다. 차순위였던 Cheddar Flow(Trustpilot 4.2/17건, "Very clean interface for options flow" 2026-06-09; https://www.trustpilot.com/review/www.cheddarflow.com)는 web-only 이고 사이트가 비브라우저 fetch 를 전부 막아 UI 를 직접 검증할 수 없었다.

**② MenthorQ (3.0 web app, 2026-07-08 출시)** — flow tape 가 아닌 «딜러 포지셔닝» 순수 제품이 2026년 7월 전면 재설계를 출시하고, 날짜가 찍힌 1차 스크린샷과 가이드(2026-07-27~30)를 공개했기 때문에 택했다(https://menthorq.com/guide/menthorq-app-general-navigation/ , https://menthorq.com/guide/ticker-summary-page-your-complete-market-dashboard-for-faster-smarter-trading-decisions/ , https://menthorq.com/wp-content/uploads/2026/07/MQ-3-summary.png). 비교 축은 딜러 포지셔닝·변동성 축이다: strike×expiry Net GEX 히트맵, gamma regime(positive/negative), Call Resistance·Put Support·HVL 레벨 태그 ≈ SIGNUM 의 GEX·max pain·IV skew; QUIN AI 사이드 패널 ≈ SIGNUM AI 코멘터리; 종목 Summary 페이지 ≈ SIGNUM Command 화면(https://menthorq.com/wp-content/uploads/2026/07/NEt-Gex-heatmap-2.png , https://menthorq.com/feature/quin-ai/ , https://menthorq.com/guide/levels-backtesting-add-historical-probability-to-every-key-trading-level/). 비교 불가: sweeps/tape·whale index·dark pool % 가 없고 데스크톱 web 전용이다. 팩트체커의 «중대 수정»: 원 조사가 «다크 단일 테마, 토글 없음»이라 썼으나 실제 3.0 앱(dashboard.menthorq.io)은 next-themes `defaultTheme: "light"`, themes `["light","dark"]`, 계정 메뉴에 «Dark Mode» 항목이 있다. 라이트 토큰 `--background #f1f1f5 / --card #fbfcfd / --primary #0f46e1 / --positive #009767 / --negative #e40014`, 다크 토큰 `--background #090c11 / --card #0f1319 / --primary #235efa / --positive #00d294 / --negative #ff6568`. 가이드 스크린샷이 전부 다크로 캡처됐을 뿐이다. 가격: Premium $129/mo, Pro $349/mo, 실시간 선물 애드온 $69/mo·$399/yr 공개(https://menthorq.com/pricing/). Trustpilot 3.4/68건, 네비게이션 혼란·실시간 요금 불만(https://www.trustpilot.com/review/menthorq.com). 차순위 SpotGamma 는 Bullish Bears(2026-04-21 갱신)가 "no UI or design coherence" 라 평했고 대시보드 루트가 비로그인으로 읽히지 않았다(https://bullishbears.com/spotgamma-review/ , https://dashboard.spotgamma.com/); Volland 은 크롤러 차단 + 자체 유튜브가 이전 UI 를 'Legacy Interface' 로 표기해 현행 화면을 검증할 수 없었다(https://www.wizofops.com/volland.html).

**③ LSEG Workspace (Refinitiv Eikon 후속)** — Bloomberg 가 당연한 인용이지만 디자인이 닫혀 있고 룩이 레거시다. Workspace 는 Bloomberg 급 터미널 중 유일하게 바닥부터 재구축됐고(Eikon 2025-06-30 종료; https://www.waterstechnology.com/trading-tech/7952541/lseg-officially-sunsets-eikon), 2026년에 실제 출하 중이며(데스크톱 1.26.7 MR2 2026-08-22, 1.26.8 노트 2026-09-05 예정; https://www.lseg.com/content/dam/data-analytics/en_us/documents/support/workspace/release-notes.pdf), 무엇보다 디자인 시스템 Halo 를 오픈소스 Element Framework(@refinitiv-ui v7.15.7, 2026-08)로 공개해 색·굵기·밀도 결정을 «눈대중이 아니라 토큰 파일로» 검증할 수 있다(https://github.com/Refinitiv/refinitiv-ui , https://raw.githubusercontent.com/Refinitiv/refinitiv-ui/v7/packages/halo-theme/src/variants/dark/overrides.less , https://raw.githubusercontent.com/Refinitiv/refinitiv-ui/v7/packages/halo-theme/src/palettes/visualisation.less). 비교 축: «돈을 거는 실시간 다자산 숫자를 다크 중립 캔버스 위에 시맨틱 방향색으로, 한국어·일본어 포함 다국어 청중에게»라는 문제 자체. 표면 3단(#0D0D0D 캔버스 / #1A1A1A 패널·그리드 헤더 / #262626), 본문 텍스트 #CCCCCC(순백 아님), 액션 블루 #334BFF(다크 데이터비즈에선 #6678FF), tick 색이 상수가 아니라 «지역 프로파일»(American/European green up·red down, Asian1 red up·green down, Asian2 는 다크 변형에서만 yellow #FFC800 up), UI 팔레트와 별개인 시각화 팔레트(다크 26색·라이트 25색), Proxima Nova Fin 12px 기본체(https://raw.githubusercontent.com/Refinitiv/refinitiv-ui/v7/packages/halo-theme/src/palettes/core.less , https://cdn.ppe.refinitiv.com/public/apps/elf-docs/book/en/styles/typography.html). 비교 불가: 데스크 우선(27인치 다중 모니터), 범위(모든 것 터미널), 온보딩(관리자가 레이아웃을 밀어주는 훈련된 사용자). 팩트체커 수정: 원 조사의 «모바일이 데스크톱보다 뒤처진다(iOS 2024-07)»는 틀렸다 — iOS 1.31.0 은 2026-07-18, Android 는 2026-07-13 갱신(https://apps.apple.com/us/app/lseg-workspace/id1481442629 , https://apprecs.com/android/com.refinitiv.android/lseg-workspace). 가격 추정치(~$22k/년)는 어느 자료에서도 확인되지 않아 미검증.

**④ 토스증권 (Toss 슈퍼앱 «증권» 탭 + tossinvest.com WTS)** — SIGNUM 의 실제 사용자가 «다른 손에 들고 있는» 앱이다: 2026-07 누적계좌 1,000만·MAU 650만(https://www.fnnews.com/news/202608061121458205), FY2025 해외주식 수수료 4,494억 원으로 국내 1위(미래에셋 4,318억; https://www.straightnews.co.kr/news/articleView.html?idxno=296342), 2024년 오픈서베이 1,000명 조사에서 증권앱 5종 중 UX 최고점 73.2(평균 66.7; https://blog.opensurvey.co.kr/article/ux-finance-app-3/). 미국 옵션은 2025-11-03 사전신청자 소프트오픈 → 11-07 정식 출시 연기 → 12-11 «내년으로» 연기 → 2026년 중 운영(2026-08-21 계좌개설 의무교육 흐름 확인; https://www.news1.kr/finance/general-stock/5968996 , https://namu.wiki/w/%ED%86%A0%EC%8A%A4%EC%A6%9D%EA%B6%8C). 정확한 2026 정식 출시월 기사는 못 찾았다. 비교 축은 «데이터 축»이 아니라 «청중 축»: 한국 사용자에게 라이브 가격과 색깔 변화율을 보이는 방식(red=상승/blue=하락, KRW/USD 병기, tabular 숫자), 관심종목-우선 홈과 탭식 종목 상세, 종목별 AI «왜 움직였나» 텍스트, 한국 리테일 대상 옵션 온보딩. 디자인 시스템이 토큰 수준으로 공개돼 있다: TDS 2025 색 업데이트(OKLCH 기반 시맨틱 토큰, 다크 전용 명도 스케일 — 라이트 토큰 재사용 시 «다크에서만 너무 시끄러웠다»; https://toss.tech/article/tds-color-system-update), Toss Product Sans 의 숫자 규칙(실시간 갱신 값은 고정폭, 히어로 숫자만 비례폭; 1/4/5/6/7/9 와 금융 기호를 «UI 아이콘처럼» 재설계; https://toss.im/tossfeed/article/beginning-of-tps). 비교 불가: 토스는 계좌·잔고·주문이 있는 «체결 장소»이고 SIGNUM 은 주문 없는 인텔리전스 전용. 팩트체커 수정: «내 주식 / 발견» 2탭 홈 구조는 2022-06 개편 보도(https://www.asiae.co.kr/article/2022061313210533785)에만 근거하고 2026 스크린샷·기사로 확인되지 않아 미검증; «캔들 색을 미국식으로 뒤집는 설정»은 어떤 도움말에도 없어 미검증(커뮤니티는 고정이라고 함); «너무 가볍다·절대 P&L 이 없다» 비판은 2021-09 Plus X 분석(https://brunch.co.kr/@plusx/71)이고 2025 비판이 아니다; #8E8E93·#FF3B30 등 hex 는 제3자 리디자인 제안(https://brunch.co.kr/@f5fd52a3153e46a/6)이라 폐기. 추가 맥락: 2026-08-26 금감원 «엄중 경고»(반복된 투자자보호 미비), 2026-08-27~29 MTS 장애 반복으로 첫 현장 IT 컨설팅 — 신뢰성 자체가 규제 주제가 됐다.

**⑤ Fiscal.ai Terminal (구 FinChat/Stratosphere)** — Fey 는 2025 Wealthsimple 인수 후 신규 가입이 닫혀 «현재 운영» 기준에 미달하고(https://fey.com), Koyfin 은 2026-02 여섯 테마를 라이트 기본으로 통합한 Bloomberg-lite 다(https://www.koyfin.com/help/theme-update-light-and-dark-modes-in-koyfin/). Fiscal.ai 는 2026년에 살아 있는 데이터-인텔리전스 터미널 중 가장 강한 인용 대상이다: 주간 출하(v5.9.7 2026-08-27; https://fiscal.ai/changelog/), Mantine 기반의 일관된 다크 시스템(`<html data-mantine-color-scheme="dark">`, 비로그인은 prefers-color-scheme:light 를 에뮬레이트해도 다크 강제 — 2026-09-04 실측), 1급 «출처 UI»(가격 옆 '15 min delay', 비율 tooltip 에 공식, 클릭하면 10-K 페이지가 오버레이로 열려 숫자를 하이라이트하는 source-to-filing; https://fiscal.ai/company/NYSE-SPGI/ , https://fiscal.ai/blog/ultimate-guide-to-using-fiscal-AI/), 사용자가 «행(기업)과 열(지표) 양쪽을 조합»하는 관심종목 홈(https://a.storyblok.com/f/107812/1269x851/b886aedc67/how-to-create-a-dashboard-on-fiscal-ai.png). 비교 축은 «숫자를 믿게 하는 문제»와 홈 화면 패턴: 둘 다 다크 기본 리서치 대시보드, 색깔 변화율이 있는 사용자 구성 테이블이 첫 화면, 데이터 빈티지·출처를 보여야 하고, 큰 notional 에 단위·소수·통화 토글이 필요하다. 비교 불가: 15분 지연 펀더멘털/공시 vs 장중 옵션 플로우, 데스크톱 web-only(2026-06~07 리뷰 기준 네이티브 앱 없음). 색 예산: #1C1C21 바닥, #2C2C35 표면, #40404F 테두리, 텍스트 white→#AFAFB6→#94949E, 신호색은 green #0BD28B·red #FF5050 둘과 «선택됨» 다크 그린 #1C6E4F 뿐(라이브 CSS 실측). 팩트체커 수정: «blue #3A7DFF 링크색»은 비로그인 UI 에서 0개 — 미검증; barebone.ai 의 "desktop terminal squeezed onto a small screen" 은 TIKR 에 대한 말이라 인용 철회; 가격(Pro $39/$49, Max $79/$99)은 fiscal.ai/pricing 이 아니라 제3자 리뷰(https://www.euinvestinghub.com/articles/fiscal-ai-review/ , https://www.matchmybroker.com/tools/fiscal-ai-review)에만 근거. confidence=medium.

**⑥ Kalshi Pro (pro.kalshi.com, 2026-07-13 베타) + Kalshi 소비자앱(반례)** — Polymarket 이 당연한 이름이지만, 2026년에 «전용 프로 터미널»을 출시하고 리뷰어가 "the best flow terminal a US prediction market has ever put out" 이라 평한 곳은 Kalshi 다(https://predictionmarketspicks.com/articles/kalshi-pro-review-july-2026 , https://news.kalshi.com/p/kalshi-pro-trading-terminal). 같은 회사가 2026-08 소비자앱 리디자인을 되돌린 기록도 있어(App Store 리뷰 단일 출처 — 언론 보도 없음; https://apps.apple.com/us/app/kalshi-trade-events-sports/id1632713844?see-all=reviews) 실돈을 거는 제품의 «성공/실패 쌍»을 한 곳에서 볼 수 있다. 비교 축은 데이터 축: 시장이 암시하는 확률적 숫자(센트=확률, spread, 5분 볼륨, buy-skew, trade tape ≈ max pain·dark pool %·GEX·whale index·sweeps)를 다크·고밀도·실시간으로; Pro 의 Markets 스크리너+라이브 테이프는 SIGNUM 의 flow/sweeps 피드에, Canvas 타일은 다중 종목 워치에 직접 대응한다(https://kalshi.com/pro/help/markets-scanning-filtering-searching , https://kalshi.com/pro/help/canvas-workspace , https://kalshi.com/pro/help/charts). 비교 불가: 체결 장소(호가창·주문 패널·마진), 데스크톱 우선 — 주문 입력 패턴은 이전되지 않는다. 핵심 인용: "we show a dash rather than invent a number", step line("between trades the price is genuinely flat"), 시맨틱 색 한 쌍(green Yes/up, red No/down)과 절제된 amber(https://kalshi.com/pro/help/charts , https://kalshi.com/pro/help/order-book-views). 팩트체커 수정: 로그인 페이지 배경은 #0E1116(순흑 아님); Canvas 는 «최대 30 타일»(12 는 Watchlist 뷰 한도); 저장된 Canvas 뷰는 계정 동기화되고 설정만 브라우저별(https://kalshi.com/pro/help/canvas-views-and-starter , https://kalshi.com/pro/help/specs-and-browser-support); "desktop-first, data-dense" 는 specs 페이지 문구; $178B 연환산 볼륨은 2026-04 기준; Polymarket Android 는 현재 4.5★(2.2 는 구자료) — Polymarket 이 약한 이유는 소셜피드-우선 설계이지 평점이 아니다; 하단 탭 실종 비판은 oddsassist.com 출처(https://oddsassist.com/prediction-markets/kalshi/).

---

### 2-2. 금융 밖 레퍼런스 (5개)

**① Windy.com (Windyty SE)** — 여러 모델(ECMWF·GFS·ICON 등 15+)에서 나온 숫자를 조종사·요트인이 안전 결정에 쓰는 소비자 제품이고, 2026 EMS Technology Achievement Award 가 2026-03-31 발표됐다(정식 수여는 2026-09-06~11 Utrecht 총회; https://www.emetsoc.org/ems-technology-achievement-award-2026-for-windy-com/). iOS 4.8★/79K, v51(2026-08; https://apps.apple.com/us/app/windy-com/id1161387262). SIGNUM 이 가져갈 표현 기법은 넷이다. (a) **열 헤더당 예측가능성 점**: 요일·날짜 옆에 green/orange/red/burgundy 점(퍼센트는 hover tooltip; https://www.windy.com/articles/43904) — GEX regime·max pain·whale index 각 신호에 «벤더 합치도 + 데이터 신선도»로 계산한 확신 점을 붙여, 낡거나 불일치한 숫자가 신선한 숫자와 같은 확신으로 보이지 않게 한다. (b) **출처를 UI 에 인쇄**: 표에 'Source: ECMWF', 모델 셀렉터에 격자해상도('ECMWF 9km / GFS 22km / ICON 13km'), 위치 블록에 «모델 고도 91m vs 실제 26m»(2026-09-04 DOM 실측; https://www.windy.com/35.180/129.076?35.180,129.076,7) — 'Intrinio · 15-min', 'FINRA · daily' 를 지표 옆에 같은 방식으로. (c) **범례와 셀이 하나의 ramp 를 공유 + 비선형 구간**: kt 범례 0·5·10·20·30·40·60(15 없음, 실측), 색은 blue→green→yellow→red→purple(강풍 끝이 purple) — whale-index 티어·IV-skew 밴드처럼 «결정이 바뀌는 문턱»에 구간을 두고 히트맵과 표 셀이 같은 ramp 를 쓴다. (d) **Compare 뷰**: 같은 표 형식을 모델별로 쌓아 불일치를 «시각으로» 읽게 한다(https://community.windy.com/topic/26304/understanding-the-compare-forecast-feature-in-windy-com) — max pain/GEX 를 계산법·벤더별로 나란히. 테마 수정: 원 조사 «다크 없음»은 낡았다 — v49(2026-02) 릴리스노트가 "Unified Dark Mode across the app" 이고 크롬·플러그인 패널은 다크로 통합됐다; 없는 것은 «지점 예보 표의 다크 옵션»(2026-09 현재 web 은 흰색, Greasy Fork 유저스크립트가 2026-08-13 까지 갱신됨). 'Classic / AI-enhanced' 문구는 어디서도 확인되지 않아 미검증; 실제 선택지는 Source 드롭다운의 'meteoblue AI' 항목이다.

**② Gentler Streak (Gentler Stories d.o.o., iOS/watchOS)** — 2024 Apple Design Award(Social Impact) 수상, Apple Watch App of the Year 2022, 4.7★/8.8K(https://apps.apple.com/us/app/gentler-streak-workout-tracker/id1576857102 , https://developer.apple.com/news/?id=3m0ht22s). v5.12.10(2026-08), Liquid Glass 재구축 2025-09-11. 가져갈 기법: (a) **밴드 대 선 regime 차트** — Activity Path 는 light→dark green 그라디언트 «정상 밴드» 위에 실제 활동을 white 점선으로 그리고 오늘 점을 굵게 표시; 지시문이 문자 그대로 "keep the white line within the green path" 다(https://docs.gentler.app/understanding-your-activity-path/what-is-the-activity-path). GEX·IV rank·dark pool %·whale index 각각을 «해당 종목의 trailing window 로 계산한 자기 밴드» 위에 고대비 점선으로 그리면 숫자를 읽기 전에 안/위/아래가 읽힌다. (b) **바이탈 타일 스펙** — 아이콘 + 큰 값 + 절반 크기 굵은 단위 + 미니 스파크라인(음영 = 본인 60일 Normal Range; 탭하면 14일 상세 그래프) + 범위 안이면 green 끝점, 밖이면 red 구간·점; 5개가 한 줄에 들어간다(https://docs.gentler.app/tracking-your-wellness/analyze-your-body-metric-trends-over-time). IV skew·put/call·OI 변화·sweep 수·dark pool % 신호 스트립에 그대로 이식 가능. (c) **비교 기준을 명시한 상태 pill** — 'Normal', 'As Usual', 'Above Typical Saturday' + 각주 'vs. typical Saturday - 6684 steps'. SIGNUM 의 모든 z-score/백분위에 «vs. 60-session median 1.9M» 식 기준을 붙인다. (d) **판정 우선 위계** — 데이터로 생성된 한 문장('Great Effort Today') → 두 줄 설명 → 차트 → 리스트. SIGNUM AI 코멘터리는 이 3초 자리에 있어야 한다(폴드 아래가 아니라). 팩트체커 수정: 탭바는 Streak / Activities / Insights 3개(2025-03 v5.3 이 4→3 으로 통합, Wellbeing 은 Streak 탭의 For You 섹션), 바이탈 카드는 스크롤 아래에 있으며, 마스코트 Yorhart 는 설정에서 «No Yorhart» 로 제거 가능. 어조(만화 마스코트·'Kudos'·컨페티)는 절대 가져오지 않는다.

**③ Sofascore** — Sensor Tower 2026: 2025년 다운로드 세계 6위·MAU 5위(https://www.sofascore.com/news/sofascore-among-top-sports-apps-in-2026); Play 100M+/4.5★/1.15M 리뷰, iOS 4.9★/77K, v26.08.24. 가져갈 기법: (a) **잠긴 시맨틱 색 척도** — 평점 6구간을 hex 로 공개하고 변형을 금지: red #DC0C00(3.0–5.9), orange #ED7E07, gold #D9AF00, green #00C424, cyan #00ADC4, blue #374DF5(9.0–10.0), gray #A4A9B3(무평점)(https://www.sofascore.com/rating-guidelines). whale index / GEX regime / IV rank 의 «7.4 green» 배지가 모든 화면·공유 이미지·푸시에서 같은 뜻이 되게. (b) **Attack Momentum 형태** — 321×80px SVG, 분당 2.5px 바 95개, 홈은 중앙선 위·어웨이는 아래, 하프타임 세로 구분선, 축 텍스트 0, 골 시점은 «같은 색 25% 알파»로 강조(`--colors-home-away-home-primary-highlight = rgba(11,179,42,0.25)`; 2026-09-04 라이브 DOM 실측, https://www.sofascore.com/football/match/toulouse-lille/THsGI#id:16416340 , https://www.sofascore.com/news/how-sofascores-attack-momentum-changed-sport-analysis). 옵션 플로우로: 시간 버킷당 얇은 바, 콜은 위·풋은 아래, 세션 구분선(PRE/REG/POST), 핵심 이벤트는 새 색이 아니라 알파로. 375px 에서 한눈에 읽히고 SIGNUM 의 purple-cyan 그라디언트 area 차트를 대체한다. (c) **미러 행 + 중앙 라벨 + 함의 병기** — '54% | Ball possession | 46%', '3.75 = 27%'. 'Call $ | Net premium | Put $' 행과 «GEX, dark pool % 옆에 implied reading». (d) **압축·tabular 숫자체** — Sofascore Sans Condensed 700 + `font-variant-numeric: tabular-nums`(Hot Type 2022; https://hottype.co/projects/sofascore). 옵션 체인·strike ladder 에 필요한 정확히 그것. 팩트체커 수정: 앱은 네이티브(Swift/Android), Capacitor 가 아니다; 원 조사의 하단바(Matches/Search/Fantasy/Favourites/Profile)는 모바일 web 이고 네이티브는 Sport/Favourites/Feed/Fantasy(https://www.sofascore.com/news/sofascores-new-home-screen-a-smarter-faster-way-to-follow-sports); 승자 점수는 bold 가 아니라 «full ink vs 70% 알파»; 헤더 상단바는 #2C3EC4, 스포츠바가 #374DF5; FotMob 은 Tiki Taka 가 «전술 통계는 더 깊다»고 평했다(https://www.tikitaka.gg/articles/fotmob-vs-sofascore-vs-flashscore-vs-tiki-taka-best-football).

**④ NTS Radio (iOS/Android + nts.live)** — 2011 Hackney 창립 독립 라디오, 월 ~600만 청취자(2025-12), 광고 0, iOS 4.9★/~2K, v5.12.0 2026-09-02(https://apps.apple.com/us/app/nts-radio/id1204567739 , https://en.wikipedia.org/wiki/NTS_Radio). 2026-06 Atonemo 가 NTS 아이콘 체계만으로 스크린 없는 하드웨어 플레이어를 만들었다(https://mixmag.asia/read/atonemo-nts-radio-player-infinite-mixtapes-wifi-streamer-tech). 가져갈 기법: (a) **홈의 데이터 모델을 «방송 편성표»로** — API(https://www.nts.live/api/v2/live)가 채널당 now + next1…17 블록을 ISO 시작/종료로 내주고, 앱은 '14:00 - 15:00' 을 사용자 현지시간으로 찍는다. SIGNUM: 세션 상태 PRE/REGULAR/POST/CLOSED 와 KST/ET 시간창, 다음 촉매(실적·CPI·FOMC)를 'Next on' 으로 — 레이아웃은 바뀌지 않는데 홈은 매시간 새롭고, 시간창이 인쇄돼 있어 낡음에 정직하다. (b) **'live' 에만 한 색** — red #e81717 은 LIVE 점과 라이브 상태에만(스타일시트 35회), 나머지는 #000/#fff/회색 계열(https://www.nts.live/css/style.min.5eb6b8e09ade1844.css). SIGNUM: 실시간 피드 상태(연결·마지막 틱 나이)에 한 색만 쓰고 장식용 그라디언트를 끊는다. (c) **타임스탬프를 1급 왼쪽 열로** — 트랙리스트 행이 고정폭 경과시간('1:03:40')으로 시작하고 행마다 '+' 저장 액션. 모든 sweep/flow 행이 HH:MM:SS ET 고정폭 열로 시작하고 같은 자리에 watch 액션. (d) **메타데이터는 색 칩이 아니라 절제된 활자 라벨** — 도시 코드(LDN/LA/NYC/KIN), dd.mm.yy, ≤3~4 개 outline 태그(1px 흰 테두리 사각형), 사진 위엔 glass 가 아니라 «검은 라벨판». 거래소 코드·데이터소스 태그(OPRA/FINRA/Intrinio)·보고서 날짜를 이렇게 쓰면 'app-store' 가 아니라 'institutional' 로 읽힌다. 팩트체커 수정: 스타일시트 최다 색은 #fff 392·#000 251·#999 123·#666 111·#ccc 95·#4c4c4c 83(6위)·#e81717 35(7위) — «#4c4c4c 최다, 단일 회색 계열» 주장은 틀렸다; 채널 카드의 도시는 «그 쇼의 송출지»이고 채널 고정 스튜디오가 아니다.

**⑤ Tide Guide: Charts & Tables (Condor Digital / Tucker MacDonald)** — 2026 Apple Design Award **Visuals and Graphics 수상** + Interaction 파이널리스트(2026-06-02; https://www.apple.com/newsroom/2026/06/apple-reveals-winners-of-the-2026-apple-design-awards/ , https://developer.apple.com/design/awards/), Apple Liquid Glass 쇼케이스 세션(https://developer.apple.com/videos/play/meet-with-apple/257/), US 4.7★/9.8K, KR 4.9★/35, JP 4.4★/48, 한국어·일본어 포함 15개 로컬라이즈(https://apps.apple.com/kr/app/tide-guide-charts-tables/id1406371071). 이름 자체가 'Charts & Tables' — «연속 예측 곡선 + 표 형태 레벨을 폰에서»라는 SIGNUM 의 문제다. Apple 의 표현: 스코틀랜드 해안경비대와 알래스카 피오르 카약 투어 리더가 쓴다(https://apps.apple.com/us/mac/story/id1728306221). 가져갈 기법: (a) **상태 우선 히어로** — 큰 tabular 숫자 + 방향 글리프 + 평문 상태 + 다음 변곡 카운트다운('4.7′ ↑ Rising Tide · High in 3 hr, 35 min'). SIGNUM Command: 'GEX +$1.2B ↑ · Long-gamma regime · flip at 5,420 (−0.8%)' 또는 'Max pain 5,400 · 2d 4h to expiry'. (b) **시간을 색으로 부호화한 곡선** — 과거 구간은 탈색 회백, 미래는 채도 높은 blue + 면 채움, «지금»은 화면에 유일한 red 점, 극값은 선 위에 직접 라벨(시각 굵게·값 흐리게)이라 축이 없다. 장중 누적 프리미엄·GEX-by-time·IV term curve 에 «realized vs projected» 를 이 분할만으로 전달. (c) **스크럽 마이크로인터랙션** — 누르고 끌면 세로 룰 + glass 버블(값·시각·요일) + 곡선 아래 하이라이트 + 햅틱. strike ladder·gamma profile·dark-pool 히스토리의 정적 tooltip 대체. (d) **기기별 밀도** — Watch 는 숫자 하나+곡선, 잠금화면 링 게이지는 사이클 위치, 폰은 히어로+곡선, iPad/Mac 은 사이드바(Today/Overview/Tables)+2열 일별 카드 그리드("super simple and glanceable on Apple Watch … more informationally dense layouts on iPad and Mac", 위 세션 verbatim). 팩트체커 수정: «2026 유일한 Weather 카테고리 수상»은 거짓 — Moonlitt(Weather)이 Interaction 을 받았다; 가격은 App Store IAP 목록(1개월 $3.99/$4.99, 12개월 $19.99/$29.99, Lifetime $150; tideguide.com/pricing 은 가격 미공개); Vision Pro 스크린샷만 passthrough 위 glass 창이라 «전부 navy» 는 iPhone/iPad/Mac/Watch 에 한정. Liquid Glass 재질 자체는 네이티브 SwiftUI 효과라 Capacitor WebView 에 backdrop-filter 로 흉내내지 말고 «정보 기법»만 가져온다.

---

### 2-3. 첫 화면 분석 (11개)

**Quant Data (모바일 Home, v3.0.9)** — 3초 전달: «테이프가 지금 움직이고 있고 오늘의 편향은 이것» — Sentiment 칩(Bearish + 도넛 링) + Put/Call Ratio 50.93% + 라이브 플로우 카드('SPY $643 P … $42.32K in green · SWEEP AUTO · 10:23 am')(https://apps.apple.com/us/app/quant-data/id1602108613). 밀어붙이는 액션: 플로우 카드 탭 / 필터 열기 / 위젯 '+' 로 내 페이지 만들기(커스터마이즈가 핵심 루프); 신규 설치는 구독 게이트 껍데기에 착륙. SIGNUM 결핍: «판정 → 증거» 순서의 KPI 스트립이 첫 화면에 없다 — 동급 가중치 타일이 먼저 온다.

**MenthorQ 3.0 (Ticker Summary, 기본 SPX)** — 3초 전달: 숫자를 읽기 전 세 질문 — regime 은 무엇인가(색 단어: Positive gamma / Fair / Elevated / Put Bias), 가격은 딜러 레벨 대비 어디인가(차트 가격축에 CR/PS/HVL 태그), 4행 Q-Score 는 bullish 인가 bearish 인가; 헤더가 신선도를 주장한다(green dot OPEN + 'Real-time' 배지)(https://menthorq.com/guide/menthorq-app-general-navigation/ , https://menthorq.com/wp-content/uploads/2026/07/MQ-3-summary.png). 액션: Cmd-K 종목 로드 → Summary → Options(Heatmap/Exposure) → Chart 하강, 또는 우측 QUIN 에 질문; 지연 계정엔 데이터상태 배지가 업그레이드 넛지. SIGNUM 결핍: 셸에 상시 붙은 «두 단어 신선도 신호»(세션 상태 + 데이터 상태)가 없다.

**LSEG Workspace (역할 맞춤 Home)** — 3초 전달: «네 데스크는 이미 차려져 있고 필요한 건 검색 한 번» — 연속성(레이아웃·워치리스트·알림 동기화) + 단일 진입점(자연어·RIC 겸용 검색바)(https://www.lseg.com/content/dam/lseg/learning-centre/documents/workspace-quick-start-guide.pdf). 액션: 검색바 타이핑 / Tab 스마트검색 / '+' 탭으로 레이아웃 구성. SIGNUM 결핍: 모든 화면 상단에 «종목·자연어 겸용 커맨드바»가 없어 깊은 메뉴에 의존한다(단, 역할별 자가 구성 홈은 SIGNUM 사용자에게 부적합 — 설정 0 으로 오늘의 답을 봐야 한다).

**토스증권 («증권» 탭 홈)** — 3초 전달: «지금 나는 올랐나 내렸나» — 수익률 한 숫자 한 색, 보유종목 행에 현재가 vs 내 평단과 색깔 수익; «오늘 뭐가 움직이나»는 한 스와이프 거리(2022 개편 보도 기준, 2026 구조는 미검증; https://www.asiae.co.kr/article/2022061313210533785). 액션: 종목 탭 → 하단 고정 red '구매하기'(1,000원 단위 금액 매수, 10/25/50/최대 버튼) — 2~3탭 안에 주문; 비계좌자는 계좌개설(1~3분). SIGNUM 결핍: 첫 줄에 «사용자가 앱을 연 이유인 스칼라 하나»가 없고, 최근 본 종목 자동 노출이 없다.

**Fiscal.ai (/dashboard)** — 3초 전달: 세 박자 — «네 종목이 여기 있고 오늘 이렇게 움직였다»(색깔 Daily %/YTD 열 + 지수 pill), «이 표는 네가 만든다»(회사 검색·지표 검색 두 입력과 칩), «다가오는 게 있다»(Earnings Date 열 + 알림 벨)(https://a.storyblok.com/f/107812/1269x851/b886aedc67/how-to-create-a-dashboard-on-fiscal-ai.png , https://fiscal.ai/dashboard). 액션: 회사/ETF 와 지표 추가 → 주식수 입력 → 통계·도넛 채움; 비로그인은 SIGN UP/LOGIN 게이트(51개 em-dash 그리드). SIGNUM 결핍: 열(지표)을 사용자가 고르는 축이 없고, 「데이터 나이」 스탬프가 헤더에 없다.

**Kalshi Pro (Markets)** — 3초 전달: «이건 터미널이지 체크아웃이 아니다 — 거래소에서 지금 움직이는 것과 네 현금이 여기 있다» — 정렬 가능한 라이브 표(Yes/No, TOB 사이즈, spread, 24h 볼륨, Yes-buy 비율, 24h 스파크라인, Live 플래그) + 상시 잔고 + 주문 레일(https://kalshi.com/pro/help/get-started , https://kalshi.com/pro/help/markets-scanning-filtering-searching). 액션: 행 클릭 → 차트+호가+주문 뷰, 또는 Canvas 로 드롭; Review → Submit → Done 이 «같은 자리». 소비자앱: «가장 뜨거운 이벤트와 확률 — Yes 냐 No 냐». SIGNUM 결핍: 행마다 «지금 움직이는 것» 열(5분 프리미엄·사이드 skew·깊이)과 행 내 스파크라인이 없고, 없는 값에 대시(—) 대신 폴백 상수가 나가는 경로가 있었다.

**Windy.com** — 3초 전달: «이게 지금 네 위치의 바람이고, 움직이고 있다» — 풀블리드 애니메이션 입자 지도 + 도시 라벨 위 실온 숫자 + 범례; 깊이(레이어 레일·모델 셀렉터·15일 타임라인)는 가장자리에 보이되 주의를 요구하지 않는다(https://www.windy.com/ , 2026-09-04 실측). 액션: 암묵적 — 지도를 만지거나 타임라인을 스크럽(화면 전체가 어포던스); 명시 CTA 는 작은 yellow 'Upgrade to Premium' 과 'Log in' 뿐, 소프트 페이월은 나중에. SIGNUM 결핍: 첫 페인트에 «살아 있음»을 증명하는 움직임+숫자+범례 삼박자가 없고, 상업 CTA 가 데이터보다 크다.

**Gentler Streak (Streak 탭)** — 3초 전달: «내 몸은 오늘 green 밴드 안에 있나, 밀어야 하나 쉬어야 하나» — 밴드 대 선 위치 + 한 줄 판정('Great Effort Today') + 마스코트 포즈가 숫자 없이 답한다(https://apps.apple.com/us/app/gentler-streak-workout-tracker/id1576857102). 액션: 오늘의 readiness 에 따른 'Go Gentler' 운동 제안/휴식 수락, 오늘 활동 카드 검토; 보조로 Today/10 Days/30 Days 전환. SIGNUM 결핍: 데이터에서 «생성된» 판정 문장이 차트 위 첫 자리에 없다(과거엔 하드코딩 상수였다).

**Sofascore (Matches 탭, 2025-10-16 개편)** — 3초 전달: «내 종목에 지금 라이브가 몇 개고, 내 팀은 이겼나» — red 'Live (74)' 칩이 즉시 카운트, '< Today >' 스테퍼가 오늘을 고정, 즐겨찾기 리그가 상단, 승자 full-ink/패자 70% 알파로 숫자를 읽기 전 승패가 읽힌다(https://www.sofascore.com/ 2026-09-04 375px 실측, https://www.sofascore.com/news/sofascores-new-home-screen-a-smarter-faster-way-to-follow-sports). 액션: 매치 행 탭 → Overview(모멘텀·평점·통계), 별 탭 → 팔로우·상단 고정·알림. SIGNUM 결핍: 상태 칩에 «경고색으로 찍힌 라이브 카운트», 날짜 스테퍼, 접이식 섹션 헤더의 카운트 pill 같은 «홈 트리아지» 장치가 없다.

**NTS Radio (LIVE 탭)** — 3초 전달: «지금 두 가지가 일어나고 있고, 실제 도시의 실제 사람이 이 시각까지 진행한다 — 하나를 골라라» — 풀블리드 인물사진 카드 2장, red 점 + 채널 번호 박스 + 도시 대문자 + 시간창('14:00 - 15:00') + 큰 흰 재생 삼각형; 인사·피드·프로모·숫자 없음(https://apps.apple.com/us/app/nts-radio/id1204567739 , https://ntslive.freshdesk.com/support/solutions/articles/77000569502-live-radio). 액션: 재생 한 탭; 보조로 캘린더-하트 버튼(다음 편성·팔로우 호스트). SIGNUM 결핍: «세션 시간창 + 다음 촉매»라는 편성표 모델이 홈에 없어, 화면이 매시간 새롭지도 않고 낡음에 정직하지도 않다(반대로 숫자 0 인 홈은 SIGNUM 에 이전 불가).

**Tide Guide (Today 탭)** — 3초 전달: 의식적으로 읽기 전 세 질문 — 물이 지금 얼마나 높은가(큰 숫자 하나), 어느 방향인가(화살표 + 'Rising Tide'), 언제 돌아서나(다음 고/저조 카운트다운) — 그리고 아래 곡선이 «지금»이 사이클 어디인지 축 없이 보인다(https://apps.apple.com/us/app/tide-guide-charts-tables/id1406371071 , https://apps.apple.com/us/mac/story/id1728306221). 액션: 곡선 터치/스크럽(red 점과 발광 링이 상호작용을 신호), 스테이션 pill 탭; 판매 CTA 없음, Pro 업셀은 무료 범위(오늘 조석·4일·24H 차트)를 넘을 때만. SIGNUM 결핍: «값 + 방향 + 다음 변곡 카운트다운 + now 표시 곡선»으로 된 상태 우선 히어로가 없다.

---

### 2-4. 2026 디자인 방향

중복 항목(glass 2건, tabular 숫자 2건, AI 코멘터리 2건, 위계/표현적 형태 2건)은 합쳤다. 실제 제품 사례가 없는 방향은 싣지 않았다.

| 방향 | 실제 사례(제품+URL) | 적용 화면 | 층위 | 적용 방법 | 판독성·신뢰 리스크 |
|---|---|---|---|---|---|
| **Glass 는 셸에만, 데이터 표면은 불투명** — iOS 26 Liquid Glass 는 «콘텐츠 위에 떠 있는 층»(탭바·툴바·플로팅 버튼)에만; HIG 명문 "Don't use Liquid Glass in the content layer", glass 위 glass 금지, 텍스트가 있으면 regular 변형, clear 변형은 35% 디밍 필수 | iOS 26 시스템앱(Stocks/Safari/Mail/Maps) https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/ ; HIG Materials https://developer.apple.com/design/human-interface-guidelines/materials ; WWDC25 219/356 https://developer.apple.com/videos/play/wwdc2025/219/ , https://developer.apple.com/videos/play/wwdc2025/356/ ; NN/g 가독성 실패 기록 https://www.nngroup.com/articles/liquid-glass/ ; Android M3 Expressive 는 알림 셰이드 뒤에만 blur https://blog.google/products/android/material-3-expressive-android-wearos-launch/ ; Tide Guide(ADA 2026, glass 는 pill·탭바, 데이터는 단색 곡선) https://developer.apple.com/videos/play/meet-with-apple/257/ | 모든 화면의 크롬(하단 탭바·스티키 상단바·플로우/인텔 리스트 위 플로팅 필터 칩 한 줄); dashboard·command·guardian 카드 프레임은 glass → 불투명 | 표현층 | 콘텐츠 컨테이너(KPI 카드·플로우 행·옵션 체인·인텔 카드) 전부에서 `backdrop-filter` 제거. 반투명은 하단 탭바(스크롤 시 축소)·스티키 종목/세션 헤더·플로팅 필터 칩 한 줄에만. 카드 경계는 톤 스케일의 1px border, 스티키 헤더는 hard line 대신 scroll-edge blur. `prefers-reduced-transparency` 와 Android WebView 에서는 단색 폴백(CSS blur 는 Capacitor 에서 프레임 비용) | 반투명 바 아래로 지나가는 숫자가 «보는 순간» 대비를 잃음; 스크롤 위치마다 같은 red 변화율이 다르게 보임; 카드 아래 스파크라인이 위 카드 숫자와 겹쳐 위장(NN/g 문서화 실패); iOS/Android 가 갈라짐; 콘텐츠층 glass 는 «소비자 앱» 신호라 기관적 브랜드를 깎는다 |
| **OKLCH/LCH 로 생성한 톤 중립 스케일; 깊이는 단계+border, gradient·glow 아님** — 12(또는 10)단 스케일에서 1–2 배경, 3–5 인터랙티브 fill, 6–8 border/focus, 9–10 solid accent, 11–12 텍스트; 라이트/다크가 같은 3~4 변수에서 | Linear(LCH 3변수 base/accent/contrast) https://linear.app/now/how-we-redesigned-the-linear-ui ; Radix Colors(step 11/12 가 step 2 위에서 APCA Lc60/Lc90) https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale ; Vercel Geist 10단·P3 https://vercel.com/geist/colors ; Coinbase DS Gray0–20 + bgElevation https://cds.coinbase.com/getting-started/colors ; Tailwind v4 OKLCH https://tailwindcss.com/blog/tailwindcss-v4 ; Evil Martians https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl ; 토스 TDS 2025(OKLCH, 다크 전용 명도 스케일) https://toss.tech/article/tds-color-system-update ; LSEG Halo 3단 표면 #0D0D0D/#1A1A1A/#262626 https://raw.githubusercontent.com/Refinitiv/refinitiv-ui/v7/packages/halo-theme/src/variants/dark/overrides.less | 전 화면; dashboard·flow(다크 위 텍스트 최다) → guardian·command 순 | 정밀층 | #06090f + purple→cyan 을 «살짝 물든 중립 OKLCH 스케일»(hue 250–260, chroma ≤0.02) CSS 변수로 교체: 1 페이지, 2 카드, 3 행 hover, 6/7 border, 11 보조 텍스트, 12 주 텍스트. 크로마는 시맨틱에만: 손익(로케일 매핑)·call/put·warning·브랜드 accent 하나. 라이트는 같은 변수에서 생성. 실제 쓰는 최소 크기(11–12px 축 라벨·표 캡션)에서 APCA 검사. 카드 elevation = +1 단계 + 1px border, glow 없음 | 물든 중립색이 red/green(한국 red/blue) 인지에 편향을 줄 수 있음; P3 의존 OKLCH 가 sRGB Android 에서 다르게 클립; 16px 통과가 11px 에서 실패; gradient 를 빼면 현재 브랜드가 평평해져 accent 하나와 타이포가 정체성을 짊어져야 함 |
| **숫자를 별도 타입 스타일로: tabular lining figures, 식별자만 mono, slashed zero, ko/en/ja 한 숫자 체계** — SF 는 기본 proportional 이라 시스템 폰트 상속 Capacitor 앱은 `tnum` 명시 없이는 가격이 요동친다 | Apple SF "Numbers have proportional widths by default" https://developer.apple.com/fonts/ ; Inter tnum/zero/ss https://rsms.me/inter/ ; Pretendard tnum·ss01–08·PretendardJP(CJK 6.25% 축소) https://cactus.tistory.com/306 ; Geist Sans/Mono https://vercel.com/font ; CSS font-variant-numeric https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric ; SwiftUI monospacedDigit https://developer.apple.com/documentation/swiftui/font/monospaceddigit() ; HIG 11pt 최소·Light 굵기 회피 https://developer.apple.com/design/human-interface-guidelines/typography ; **Toss Product Sans**(실시간 값 고정폭, 히어로만 비례) https://toss.im/tossfeed/article/beginning-of-tps ; **Sofascore Sans Condensed + tabular-nums** https://hottype.co/projects/sofascore ; Fiscal.ai DM Mono 재무제표 https://fiscal.ai/company/NYSE-SPGI/ ; LSEG Proxima Nova Fin https://cdn.ppe.refinitiv.com/public/apps/elf-docs/book/en/styles/typography.html | flow 표, command(옵션 체인·max pain·GEX ladder), dashboard KPI 타일, guardian 지표 그리드, 모든 차트 축 | 정밀층 | `.num` 스타일 하나: `font-variant-numeric: tabular-nums lining-nums slashed-zero`; 지표별 고정 소수(가격 2, IV 1, GEX $M 1, 확률 0); 숫자 열 우측 정렬 + 단위는 헤더에; 종목/strike/expiry 만 mono(Geist Mono 또는 SF Mono, x-height 매칭). ko/ja 폴백(Pretendard·Noto Sans KR/JP)이 tnum 을 실제 노출하는지 확인, 아니면 라틴 숫자 폰트를 앞에 서브셋. 라이브 값에 고정 문자 슬롯(가격 8, 변화율 7). 프로즈·AI 코멘터리엔 mono·tnum 금지 | 전부 mono 면 «해커 터미널 = 리테일 밈»으로 표류; tnum 없는 CJK 폰트는 ko/ja 에서 가격 폭이 요동; 폰트 파일 추가는 콜드스타트 지연; 375pt 에서 mono 는 truncation/가로 스크롤 유발(Yahoo Finance 리뷰의 압축 워치리스트 불만 https://apps.apple.com/us/app/yahoo-finance-stock-market/id328412701); tnum 을 프로즈에 적용하면 렌더 버그로 읽힘 |
| **숫자는 깜박이지 않고 «굴러간다»: 방향성 digit transition + reduced-motion 게이트** | NumberFlow(trend·Group·respectMotionPreference) https://number-flow.barvian.me/ ; SwiftUI numericText(countsDown:) https://developer.apple.com/documentation/swiftui/contenttransition/numerictext(countsdown:) ; M3 Expressive 스프링 모션 https://blog.google/products/android/material-3-expressive-android-wearos-launch/ ; WWDC25 219(Reduce Motion 시 glass 탄성 제거) https://developer.apple.com/videos/play/wwdc2025/219/ | dashboard 헤더(가격·변화율·GEX 총계·whale index), command 종목 헤더, flow 피드 새 행 진입, guardian regime 점수 | 표현층 | 톱라인 숫자만 digit-roll 컴포넌트로, 방향 = 델타 부호; 가격과 변화율은 그룹으로 함께 굴림; 300–400ms 상한; 행 배경 플래시 ≤300ms 후 톤 단계로 복귀; 표는 새 행 slide-in 외 애니메이션 없음; **모든 애니메이션을 실제 데이터 타임스탬프에 바인딩**(캐시된 낡은 페이로드가 굴러가면 안 됨); `prefers-reduced-motion` 이면 정적 | 전환 중 숫자는 읽을 수 없어 한눈 읽기가 틀린 값을 잡을 수 있음; 애니메이션은 «살아 있음»을 신호하는데 200 OK 인 낡은 데이터엔 그 신호가 거짓(신뢰 조작); flow 표 상시 플래시는 브랜드가 피해야 할 카지노 패턴; iOS WebView 동시 애니메이션 다수 = re-render flood → 탭 불량(SIGNUM 기존 관측) |
| **위계는 크기·형태·그룹핑에서, 장식이 아니라; 표현적 형태·모션은 first-run·empty·피드백에만** — Google 연구(46 연구·18,000+ 참가자·아이트래킹): 핵심 요소 최대 4배 빠르게 포착, 45+ 연령 격차 소멸, 단 «익숙한 리스트 구조를 바꾸면 사용성 하락», «뱅킹 앱 맥락엔 부적합», "no amount of emotion can compensate for a lack of clarity"; Apple 은 굵은 좌정렬 제목·캡슐 컨트롤·동심 corner radius, 바 위계는 «배경색·border 아닌 그룹핑»으로 | M3 Expressive 연구 https://design.google/library/expressive-material-design-google-research ; Android 16 Gmail/Photos/Fitbit https://blog.google/products/android/material-3-expressive-android-wearos-launch/ ; WWDC25 356 https://developer.apple.com/videos/play/wwdc2025/356/ ; Public.com·Trade Republic(큰 한 문장 + 조용한 활자) https://public.com/ , https://traderepublic.com/ ; MenthorQ 3.0 이 2025년 11박스 KPI 스트립을 «질문별 그룹»으로 교체 https://menthorq.com/wp-content/uploads/2025/07/app.png vs https://menthorq.com/wp-content/uploads/2026/07/MQ-3-summary.png ; Tide Guide 히어로 ~40pt + 나머지 13–15pt https://apps.apple.com/us/app/tide-guide-charts-tables/id1406371071 | onboarding, dashboard 첫 화면(히어로 지표 하나), 섹션 헤더, empty-state, paywall, 알림 생성 성공/실패 피드백 | 표현층 | 화면당 히어로 숫자 하나(dashboard: 시장 regime + 한 문장; command: 가격 + GEX 부호)를 display cut 으로 2–3단 크게, 나머지는 단일 굵기로 강등; CTA·필터 칩은 캡슐; 중첩 카드는 동심 radius(inner = outer − padding); onboarding/empty 는 굵은 좌정렬 헤드라인 + 일러스트 하나 + 강조 액션 하나 + 스프링 전환, 이 흐름에서 종목 3개와 언어를 골라 첫 대시보드가 채워진 상태로; 리스트·표 구조는 관습대로; 숫자엔 스프링 금지; 'calm mode' 토글 | 표 안의 표현적 형태·크기는 375px 밀도를 파괴; 형태 놀이는 기관적 톤과 충돌; Google 자체 결론 = 리스트 구조 신기함은 사용성 하락; 큰 활자는 ko/ja 줄바꿈을 늘려 데이터를 폴드 아래로; onboarding 스타일이 dashboard 로 새는 것이 Google 이 경고한 바로 그 실패 |
| **라이트 테마를 동등하게, 같은 토큰에서 생성, 기본 = 시스템** — NN/g: 양극성(밝은 배경 어두운 글자)이 작은 글자·밝은 환경의 글랜스 데이터에 유리, 다크는 수정체 혼탁 사용자에 유리; Android 가이드는 Light/Dark/System 중 System 권장 | NN/g https://www.nngroup.com/articles/dark-mode/ ; Android 다크 테마 가이드 https://developer.android.com/develop/ui/views/theming/darktheme ; Coinbase DS 이중 스펙트럼 https://cds.coinbase.com/getting-started/colors ; Linear https://linear.app/now/how-we-redesigned-the-linear-ui ; Trade Republic·Public(라이트 표면) https://traderepublic.com/ , https://public.com/ ; Google Finance 2025-08 라이트/다크 https://blog.google/products/search/google-finance-ai/ ; **MenthorQ 3.0 이 라이트 기본 + 다크 토글**(next-themes defaultTheme light; https://menthorq.com/) ; **LSEG Halo 가 라이트에서 tick 색을 어둡게 재조정**(everglade #246B3E / chestnut-rose #B63243) https://raw.githubusercontent.com/Refinitiv/refinitiv-ui/v7/packages/halo-theme/src/variants/light/overrides.less ; Koyfin 2026-02 라이트 기본 https://www.koyfin.com/help/theme-update-light-and-dark-modes-in-koyfin/ | 전 화면; dashboard·intel(긴 텍스트) 먼저, flow·command 표 다음 | 정밀층 | 같은 OKLCH 변수로 라이트 생성(1 near white, 12 near black); 손익·call/put 시맨틱 색은 테마별 명도 재튠(흰 배경에서 다른 명도 필요); 흰 배경에서 실패하는 cyan/purple accent 는 더 어두운 브랜드 accent 하나로; 기본 시스템 + 설정 토글; 차트 gridline·선 색을 테마별 재생성; 스토어 스크린샷·OG 이미지는 리스팅이 보여주는 테마와 일치 | cyan·purple gradient 는 흰 배경에서 대비 실패; 한국식 red-up 은 흰 배경에 괜찮지만 연한 blue-down 이 AA 아래로 떨어질 수 있음; 시각 QA 가 두 배(토큰층이 아니라 화면마다·테마마다); 다크 스토어 스크린샷 + 라이트 첫 실행 = «다른 앱»으로 읽힘 |
| **AI 코멘터리는 경계 있는·인용된·신선도 스탬프 달린 다이제스트 — 히어로 아님, «call» 아님** — 2025–26 살아남은 금융 AI 텍스트의 공통 프레임: 요약하는 데이터 옆의 별도 컨테이너, 출처 표기, 결정 지원 라벨, 끄기 가능, 조건부 시나리오·레벨로 표현 | Google Finance(AI 답 + 웹 출처, classic 토글) https://blog.google/products/search/google-finance-ai/ ; Robinhood Cortex "so you can decide your next move" + "terms and limitations apply" https://robinhood.com/us/en/gold/ , https://en.wikipedia.org/wiki/Robinhood_Markets ; Public Alpha "not investment research or a recommendation" https://public.com/alpha ; Unusual Whales Mr. Whale(브리핑 + 같은 데이터 API/MCP) https://unusualwhales.com/ ; **MenthorQ QUIN 우측 패널** https://menthorq.com/feature/quin-ai/ ; **토스 AI 시그널(종목/산업별 «왜 움직였나»)·AI 어닝콜(원문+요약 병치)** https://www.fnnews.com/news/202607211050291075 ; **Gentler Streak 판정 문장 우선** https://docs.gentler.app/understanding-your-activity-path/interpret-the-activity-path | intel(섹터 브리프), command AI 패널, dashboard 모닝 브리프, 장전/마감 푸시 카피 | 표현층 | step-2 카드 + 브랜드 accent 좌측 룰 + 헤더 'AI brief · 09:31 ET · from GEX / flow / dark pool'(각 입력은 해당 지표로 딥링크하는 칩); 불릿 우선 3–5줄, 확장 가능; 면책은 헤더 바로 아래 step-11 텍스트('참고용 · 투자 권유 아님', ko/ja/en); **본문 숫자는 화면이 렌더하는 같은 JSON 에서**(모델이 재진술 금지); 다음 단계는 레벨·조건('452 위면 gamma flip 이 양전환; 438 아래면 max pain 이 당김')으로, 매수/매도 금지; 비례폰트; 설정에서 숨김 토글 | 프로즈가 숫자와 주의를 다투고 독자는 표보다 문장을 믿음; 실수치 옆 환각 숫자 하나가 전부를 오염(SIGNUM 은 이미 하드코딩·불일치 AI 카피를 출하한 이력); 한국 투자권유 규정상 면책은 «보이는 곳»; 카드마다 반복되는 면책은 소음; AI 텍스트가 숫자보다 늦게 오면 layout shift 가 불안정으로 읽힘; 긴 ko/ja 프로즈가 표를 폴드 아래로 |
| **차트 정밀도는 의도별: 축 없는 프리뷰 / 격자 있는 상세, 색은 유일 인코더가 아님, 로케일별 손익색, 이산 데이터는 step line** | WWDC22 'Design an effective chart'(Health 트렌드 플래터 vs 상세; 지역별 red/green 의미 차이) https://developer.apple.com/videos/play/wwdc2022/110340/ ; Robinhood Legend https://robinhood.com/us/en/legend/ ; Bloomberg Terminal https://en.wikipedia.org/wiki/Bloomberg_Terminal ; Google Finance 캔들·지표 https://blog.google/products/search/google-finance-ai/ ; **Kalshi Pro step line("between trades the price is genuinely flat") + 대시("we show a dash rather than invent a number")** https://kalshi.com/pro/help/charts ; **Quant Data 축 제목에 단위 'Gamma Exposure (Per 1% Move)' + 'Underlying ($689.39)' 범례** https://quantdata.us/cdn/images/features/gamma_exposure.webp ; **LSEG Halo tick 프로파일 American/Asian1/Asian2** https://raw.githubusercontent.com/Refinitiv/refinitiv-ui/v7/packages/halo-theme/src/variants/dark/overrides.less ; **Tide Guide 과거 회색/미래 blue/now red** https://apps.apple.com/us/app/tide-guide-charts-tables/id1406371071 ; **Sofascore 모멘텀(축 0, 같은 색 25% 알파 강조)** https://www.sofascore.com/news/how-sofascores-attack-momentum-changed-sport-analysis | command(GEX ladder·max pain·IV skew), guardian(breadth·regime), dashboard 스파크라인, flow(미니 call/put 바) | 정밀층 | dashboard 스파크라인: 축·격자 없음, 선 하나, 마지막 값 라벨만. command 상세: step-6 색 격자 4–7개, 11px 이상 tabular 축 라벨, y 범위는 데이터에서 + GEX 바는 0 고정, **y축 제목에 단위·범례에 spot 인쇄**. call/put 은 색 + C/P 글리프 또는 해치. 손익색은 로케일별 시맨틱 토큰(ko: red up / blue down; en·ja 는 시장 관습) — 컴포넌트 안에 색 이름 리터럴 금지. max pain·OI·일별 dark pool 같은 이산 시리즈는 spline 아닌 step. 없는 값은 em-dash + 'no data' 라벨. VoiceOver 차트 설명, 터치 타깃은 차트 전체 높이 | 축 없는 프리뷰는 없는 정밀도를 암시; 로케일 토큰 오매핑은 blue 를 손실로 읽는 한국 사용자에게 의미를 뒤집음; 물든 다크 단계 위 격자는 사라짐; 375px 에 격자 과다는 라벨 혼잡; 색만으로 call/put 은 색약 사용자에게 실패; 희소·불규칙 데이터(sweeps·dark-pool prints)를 예쁜 파도로 smoothing 하면 거짓말 |
| **확률 우선 프레이밍: 센트=퍼센트, 고정 0–100 수평 바, 가격축 위 expected-move 밴드, 변화는 previous → last** | Robinhood Prediction Markets(센트=확률, 수평 확률 바) https://robinhood.com/us/en/prediction-markets/ , https://apps.apple.com/us/app/robinhood-investing-trading/id938003185 ; Kalshi API previous_price/last_price·캔들 https://docs.kalshi.com/llms.txt ; Polymarket 마켓 모델 https://docs.polymarket.com/concepts/markets-events ; Options AI(가격 차트 위 손익 zone·expected move) https://www.optionsai.com/ ; HIG Charts 고정 vs 동적 축 https://developer.apple.com/design/human-interface-guidelines/charts ; **MenthorQ Low–Fair–High 그라디언트 슬라이더 + 백테스트 Regime Hold Rate 89%** https://menthorq.com/wp-content/uploads/2026/07/Volatility-insight.png , https://menthorq.com/guide/levels-backtesting-add-historical-probability-to-every-key-trading-level/ ; **Windy 예측가능성 점(모델 합치도)** https://www.windy.com/articles/43904 ; **Gentler Streak 'vs. typical Saturday - 6684 steps' 기준 명시** https://apps.apple.com/us/app/gentler-streak-workout-tracker/id1576857102 | command(max pain·GEX flip·IV-implied expected move on strike ladder), flow(sweep 의 방향 읽기), guardian(regime shift), dashboard whale-index 타일 | 정밀층 | command 에서 max pain 과 gamma flip 을 spot 과 같은 축의 수평 참조선으로, ±1σ expected-move 밴드에 실제 달러 범위와 적용 만기 라벨('±$4.10 to 09/19'); whale index·put/call skew·모든 점수형 지표는 고정 0–100 바(HIG: min·max 가 의미 있으면 고정) + 전 세션 값을 얇은 tick 으로; 확률은 근거와 함께('68% band, IV-implied'), 설명 없는 점수 금지; 레벨마다 확신 숫자(hit rate, 비교 규모 n, 윈도우) | 한국 리테일은 68% 밴드를 보장으로 읽음; 퍼센트는 IV 추정이 갖지 않은 정밀도를 암시; 색 신뢰 위험 — 한국 red=상승 vs 미국 green=상승이라 red 확률 바가 ko 에겐 bullish, en 에겐 bearish → 색은 절대 유일 방향 캐리어가 아님; 이미 빽빽한 strike ladder 에 밴드 추가는 판독 한계 초과 — 밴드마다 토글, 기본 최대 2 오버레이; 얇은 OI 종목에서 자기이력 밴드는 터무니없는 z(SIGNUM 실측 z 138) — 윈도우와 n 을 항상 인쇄 |
| **리테일용 데스크 밀도: 의도별 프리셋, 연결된 위젯, 카드별 신선도, 서브초 갱신** | Robinhood Legend("presets optimized for stock trading, options trading, or market monitoring", 연결 위젯, 서브초) https://robinhood.com/us/en/legend/ ; Unusual Whales(11K+ 종목, Market Maker Exposure) https://unusualwhales.com/ ; **Kalshi Pro Markets 표(5분 볼륨·spread·depth band·buy-skew, 좁은 폭에서 덜 중요한 열 자동 접힘, 이름 열 유지)** https://kalshi.com/pro/help/markets-scanning-filtering-searching ; **Quant Data 스냅샷 차트의 9:30–16:00 스크러버 + 타임스탬프 배지** https://help.quantdata.us/en/articles/6544052-what-is-the-options-heat-map ; **MenthorQ OPEN + 'Real-time' 배지, 2025 빌드 'Timestamp: 2025-07-01'** https://menthorq.com/guide/menthorq-app-general-navigation/ , https://menthorq.com/wp-content/uploads/2025/07/app.png ; **Fiscal.ai '15 min delay' + 단위/소수/기간 툴바(v5.9.7 페이지 간 유지)** https://fiscal.ai/changelog/ ; **LSEG 한 검색바 = 내비게이션** https://www.lseg.com/content/dam/lseg/learning-centre/documents/workspace-quick-start-guide.pdf | dashboard(프리셋: Options / Flow / Monitor), command, flow, intel | 정밀층 | 자유 커스터마이즈 대신 프리셋 3개: Options(GEX·max pain·IV skew·expected move), Flow(sweeps·whale index·dark pool %), Monitor(지수·섹터·guardian regime). 종목·세션을 하나의 공유 상태로 잡아 헤더·체인·플로우 표·AI 카드가 함께 바뀌고 종목 전환 시 뷰 상태를 리셋(SIGNUM 기존 버그 클래스). 모든 카드에 'as of hh:mm:ss' + 세션 배지(PRE/REG/POST/CLOSED), 기대 주기보다 오래됐을 때만 색. 플로우 표는 폰에서 4–5열 상한, 나머지는 행 확장 뒤로; 단위·소수·기간 토글은 표 위 툴바 하나에 두고 페이지 간 유지; 스냅샷 차트엔 세션 스크러버. 웹소켓 페인트는 디스플레이 주기로 스로틀 | 위계 없는 밀도는 375pt 에서 숫자 벽 — 답은 «작은 글자»가 아니라 «적은 열»; 데스크 미학은 «진짜 실시간» 기대를 올리는데 SIGNUM 피드 일부는 지연/캐시 — 빠졌거나 틀린 신선도 스탬프는 없는 것보다 나쁨; 로케일별로 지표 순서가 바뀌는 프리셋은 ko/en 사이 근육기억을 깨뜨림; 'Real-time' 배지를 달고 실시간을 애드온으로 팔면 신뢰 사고(MenthorQ Trustpilot 1★ 사례) |
| **첫 로드에만 구조적 스켈레톤; 빈 프레임 대신 «마지막 정상값 + 타임스탬프»; AI 브리핑이 empty-state 대체** — NN/g: 스켈레톤은 최종 레이아웃을 그대로, ~10초 미만 전체 로드에만, 헤더/푸터만 있는 빈 가운데는 스피너보다 나쁨, 부분 갱신엔 혼란 | NN/g https://www.nngroup.com/articles/skeleton-screens/ ; Google Finance AI-first 진입 https://blog.google/products/search/google-finance-ai/ ; Unusual Whales 일일 브리핑 https://unusualwhales.com/ ; Yahoo Finance 리뷰 https://apps.apple.com/us/app/yahoo-finance-stock-market/id328412701 ; **Fiscal.ai 비로그인 51개 em-dash 그리드(반례)** https://fiscal.ai/company/NYSE-SPGI/ ; **Quant Data 신규 설치 = 페이월 껍데기(반례)** https://apps.apple.com/us/app/quant-data/id1602108613 ; **Tide Guide 로그인 없이 마지막 스테이션으로 직행** https://apps.apple.com/us/app/tide-guide-charts-tables/id1406371071 | onboarding, empty-state, dashboard/flow/intel 로딩, 장전 플로우 리스트, 콜드스타트 | 표현층 | 실제 카드와 같은 그리드·tabular 숫자 슬롯으로 스켈레톤을 만들어 데이터가 와도 아무것도 안 움직이게; 콜드스타트에만(SIGNUM 콜드 ~6.5s vs 웜 ~250ms), 1초 미만은 생략. 웜 복귀는 마지막 캐시값을 감광 + 'as of 15:58 ET' 로 그리고 제자리 갱신. 장전 플로우는 빈 표 대신 '장 개장까지 2h 13m' + 전일 상위 sweep 5개. 첫 실행은 채워진 대시보드 + 지표 칩 달린 짧은 생성 브리핑으로 끝남(빈 워치리스트 아님). 페이월 앞에 지연/샘플 스냅샷을 보인다 | 감광 캐시값이 라이브로 오인 — SIGNUM 은 이미 '200 OK 인데 19시간 전' 을 여섯 경로로 출하했으니 스탬프는 요청이 아니라 «데이터»에서 계산; 빠른 로드의 스켈레톤 플래시는 jank; 뒷받침 못 하는 신호를 약속하는 empty-state 브리핑은 첫 실망을 예약 |
| **글랜스 알림 표면: 세션에 묶인 Live Activities, 굵은 값 2~3개** — HIG: 시작·끝이 있고 8시간 이하 이벤트(정규장 6.5시간 적합), 한눈에 유용한 것만, medium 이상 굵기, 잠금화면에 민감정보 금지, compact/minimal/expanded | HIG Live Activities https://developer.apple.com/design/human-interface-guidelines/live-activities ; iOS 26(기기 간 Live Activities) https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/ ; **Tide Guide 잠금화면 링 게이지(마지막 저조→다음 고조) + Live Activity 스트립, Watch 는 숫자 하나** https://developer.apple.com/videos/play/meet-with-apple/257/ ; **NTS 'My Schedule'(팔로우 호스트 다음 방송)** https://ntslive.freshdesk.com/support/solutions/articles/77000570021-upcoming-schedule — 증권사 앱의 Live Activities 출하는 이번 조사에서 미확인 | alerts(unusual sweep·GEX flip 교차·whale index 문턱), guardian regime 변화, 세션 개장/마감; command 로 딥링크 | 표현층 | 정규장 개장에 Live Activity 하나 시작·마감에 종료: compact = 주 종목 + 변화율, expanded = whale index·gamma flip 레벨 vs spot·dark pool %, 전부 tabular semibold 이상. 알림은 푸시를 쌓지 않고 같은 activity 를 갱신. P&L·포지션 크기는 절대 표시 금지. 탭하면 해당 종목 command 화면 — 콜드스타트 딥링크 생존 필수(SIGNUM 미해결 이슈) | 잠금화면 포트폴리오 숫자는 Apple 정의와 한국 사용자 기대 모두에서 민감; compact 공간은 4자리 가격+변화율을 잘라 사전 포맷 필수; 잦은 갱신은 시스템 예산을 넘겨 조용히 멈춤; Android 엔 동등 표면이 없어 삼성 ko 사용자의 알림 경험이 갈라짐 — 패리티는 설계해야 함 |

---

### 2-5. 종합 비교표

| 서비스명 | 카테고리 | 포지션 | 기본 테마(다크·라이트·양쪽) | 테마를 그렇게 택한 이유(추정) | 색 전략 | 정보 밀도 | 데이터 표현 방식 | 첫 화면 전략 | 우리가 참고할 지점 | 참고하면 안 되는 지점 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Quant Data** (quantdata.us, iOS/Android) | options-flow + 딜러 포지셔닝(GEX/DEX/VEX/CHEX) 리테일 터미널; web + 네이티브 앱 레이아웃 동기화 | 중가 올인원 챌런저($74.99/mo, 연 $749.99=월 $62.50, 7일 트라이얼); Discord 15K+; iOS 4.5★/43, Play 10K+; 2026 Trade Echo «리테일 플로우 트레이더의 원-앱» | 양쪽·다크(네이비) 기본 — 흰 테마는 v3.0.5(2026-04-27) 추가, web 은 자유 컬러피커+공유 테마 | (추정) 함께 쓰는 TradingView·브로커의 터미널 관습에 맞추고, 채도 높은 green/red 바와 흰 tabular 숫자가 네이비에서 대비 유지; 흰 테마는 수요 대응형 후속(단 «도움말 스크린샷이 라이트»는 거짓 — 전부 다크) | 엄격 시맨틱, gradient·glass 없음. 컨트롤 blue 하나(종목·지표·단위·간격·필터·활성탭; 날짜 pill 은 중립 회색), green/red 는 방향만, purple 은 차트당 «특수» 시리즈 하나(MVC·dark-pool notional), 유일한 red 컨트롤 = 리셋 버튼(결함) | 높음 — web 12열×20+행 + 4-KPI 스트립; 히트맵 셀마다 숫자; 폰도 밀도 안 줄여 칩 잘림('Put / Call Volu…')·축 라벨 잘림('rike Price') | 셀마다 숫자 있는 표; GEX by strike(0 위 green/아래 red, spot 점선, y축 제목에 단위); strike×expiry 히트맵(폰 15×5); Interval Map 버블; 이중축 프리미엄 선; Exposure·Heat Map 에만 9:30–16:00 스크러버+재생+타임스탬프; KPI 칩 = 도넛 링+라벨+값; 주문유형 텍스트 칩(SWEEP/BLOCK); 감성 = 점+단어 | 위젯 스택 Home: 'Consolidated Order Flow' 칩 줄 → KPI 칩 3개(Sentiment/PCR/PC Volume) → 라이브 플로우 카드; 판정 후 증거; 신규 설치는 구독 게이트 | KPI 스트립 → 표; 스냅샷 차트 세션 스크러버(«낡았나?»에 답); 차트 자체에 단위·spot 인쇄; 방향 이중 인코딩(점+단어, B/A 문자, 텍스트 칩); purple 은 «하이라이트»로만 | 폰을 축소 데스크톱으로(위젯마다 5칩 툴바); 폰 히트맵 셀마다 숫자; 모든 컨트롤이 같은 blue pill(위계 0) + 유일 red 가 리셋; 사용자 공유 테마가 시맨틱 색 무력화; 첫 실행 하드 페이월에 샘플 없음 |
| **MenthorQ 3.0** (dashboard.menthorq.io, 2026-07-08) | 딜러 포지셔닝/GEX 퀀트 분석(Net GEX by strike×expiry, gamma regime, CR/PS/HVL, IV/skew/term 분류, Q-Score, 레벨 백테스트) + AI QUIN; 데스크톱 web + 차트 플랫폼 피드; tape·dark pool 없음 | SpotGamma 와 Unusual Whales 사이 중가(Premium $129, Pro $349, 실시간 선물 $69/mo 애드온, 무료=지연); 7k+ Active Traders; Trustpilot 3.4/68 | 양쪽·**라이트 기본**, 다크 토글(next-themes defaultTheme light; 계정 메뉴 'Dark Mode') — 가이드 스크린샷은 전부 다크 캡처 | (추정) 라이트 기본은 «기관 리서치 문서» 톤과 데스크톱 낮 사용; 다크는 TradingView 차트 라이브러리 임베드·트레이더 관습용 병행. 원 조사의 «단일 다크» 추론은 폐기 | 라이트 토큰 bg #f1f1f5/card #fbfcfd/primary #0f46e1/positive #009767/negative #e40014; 다크 bg #090c11/card #0f1319/panel #161b22/primary #235efa/positive #00d294/negative #ff6568/border rgba(182,190,203,.08). 크로마는 의미에만: green/red 부호, blue = «여기 있음»(히트맵 현재가 행 외곽선·spot 밴드·'+' 버튼); 분류 단어별 tint(Fair 흰/Elevated 노랑/Put Bias 빨강); 만기 그룹 태그 4색; 브랜드 purple 은 로고에만 | 높음이나 단계적: Summary 패널은 «분류 단어 + 숫자 + 스파크라인/슬라이더» 4행; 한 단계 아래 히트맵 ~20행×10+열; 프리셋 뒤 다수 선택 열('100+' 는 미검증); 리뷰어(GEX Levels·Lucas Propfirm 2026-07) «초보엔 압도» | 우측 정렬 K/M 축약(274.21K, −1.47M), 부호색 텍스트, 0 은 중립 회색, 결측 em-dash, 히트맵 셀 크기별 tint; 드롭다운으로 같은 그리드가 7개 렌즈(Net GEX/DEX/OI/Volume/Abs GEX/Abs DEX/IV×OI), '10 strikes ±', Intraday/EOD; 차트 가격축에 CR/PS/HVL 태그; Q-Score 4행 라벨+step 스파크라인; Volatility Insight 단어 우선 카드 + Low–Fair–High 슬라이더; 백테스트 Regime Hold Rate %; 게이지 없음 | Ticker Summary(기본 SPX): 상단 종목 칩(Cmd-K)+OPEN 녹색점+'Real-time' 배지; 좌 사이드바 3그룹; 중앙 큰 가격 + 캔들(CR/PS/HVL 태그) + Gamma/Volatility Insight; 우측 QUIN/QSCORE/NEWS/BACKTEST 탭; 아이콘 레일로 Intraday Liquidity Summary | 단어 우선 regime 칩(라벨+숫자+슬라이더); 가격축 핀 레벨 태그(범례 불필요); «한 그리드 7렌즈»; 셸 상시 신선도 두 단어(세션+데이터 상태) + 차트 아래 타임스탬프; 레벨마다 확신 숫자(hold rate·comeback·평균/중앙/최악) | 9항목 사이드바+탭 우측열+아이콘 레일을 폰에 이식; 실시간을 애드온으로 팔면서 'Real-time' 배지; 2025 빌드의 11박스 KPI 스트립(3.0 이 질문별 그룹으로 교체); 64+ 모델·다수 열을 기본으로; ~9–10px 대문자 회색 마이크로 라벨(375px·ko/ja 에서 실패) |
| **LSEG Workspace** (Eikon 후속; 데스크톱 HERE Core/Electron + web + iOS/Android) | 기관 다자산 시세·분석 터미널 | Bloomberg 다음 세계 2위 전문 터미널; 세일즈&트레이딩·애널리스트·IB·WM 지명 사용자 과금(공개 가격 없음; 제3자 추정치 미검증); Eikon 2025-06-30 종료로 전원 이관; 데스크톱 1.26.7 MR2(2026-08-22), iOS 1.31.0(2026-07-18), Android 2026-07-13 | 양쪽·다크 기본(Settings > FRAMEWORK > Colors & Themes; Halo 는 dark/light 2변형, 앱은 한 번에 하나) | (추정) 다중 모니터 세션 내내 보는 데스크에서 #0D0D0D(순흑 아님)가 눈부심을 줄이고 tick 색·액션 blue 가 신호로 읽힘; Eikon 다크 유산과 연속성; 라이트는 Excel·Word·인쇄 옆에서 일하는 리서치/IB/WM 용이라 tick 색을 어둡게 재조정 | 순중립 표면 램프 + 액션 hue 하나 + 시맨틱 두 hue; gradient·glass 없음. 다크: 캔버스 #0D0D0D, 패널·탭바·그리드 헤더 #1A1A1A, 다음 단 #262626, 본문 #CCCCCC, 액션 #334BFF(dataviz #6678FF). tick: emerald #39C46E/carnation #F5475B(다크), everglade #246B3E/chestnut-rose #B63243(라이트). **방향색은 지역 프로파일**(American/European, Asian1 red up, Asian2 yellow up — 다크만). 차트는 별도 시각화 팔레트(다크 26·라이트 25) — hue 유지, 명도만 반전 | 높음 — 기본 글자 12px('Body 3'), 창당 탭 8개, 탭당 다중 앱 레이아웃, WS 메뉴+햄버거+탭스트립+검색바+Explore 바+북마크 바; 2026 가이드 «기관·전문팀용, 일반 리테일 아님» | Proxima Nova Fin(tabular lining, LSEG 전용 라이선스) 그리드; 강조는 크기 아닌 굵기(400/500–600), 이탤릭 금지; tick 텍스트는 색 셀 위; 컴포넌트로 sparkline·led-gauge·swing-gauge·heatmap·tornado-chart·interactive-chart·counter·pill; 그리드 헤더 별도 표면; 모바일은 «최적화 데이터 뷰» | 역할 맞춤 Home: WS 메뉴·햄버거·탭 8개·자연어/RIC 겸용 검색바(★ 북마크)·Alerts/Help/Save·Explore 바·북마크 바; 홈은 앱 하나 또는 레이아웃(App menu > Set as Home); 데스크톱·web·모바일 동기화 | 3단 중립 램프 + 순백 아닌 본문색 + 액션 blue 하나 → 모든 hue 가 의미를 가짐; **tick 방향색을 로케일 프로파일로**(ko 뒤집기); UI 팔레트와 차트 팔레트 분리(테마 간 hue 유지·명도 반전); 숫자 강조는 굵기·tabular 로; 화면마다 종목·자연어 겸용 커맨드바 | 3중 내비 크롬(27인치용); 역할별 자가 구성 홈(SIGNUM 은 설정 0 으로 오늘의 답); 12px 본문 기본(iPhone 한국 사용자는 행동하는 숫자 ≥14px); ※ 원 조사의 «모바일이 데스크톱보다 뒤처짐» 은 오류 — 삭제 |
| **토스증권** (Toss 슈퍼앱 «증권» 탭 + tossinvest.com WTS) | 한국 리테일 증권(KR+US 주식, 1,000원 소수점, US 옵션 — 2025-11 소프트오픈 후 2026 정식, AI 시그널·AI 어닝콜·실시간 이슈) | 국내 최대 리테일 증권앱: 누적계좌 1,000만·MAU 650만(2026-07), FY2025 해외주식 수수료 1위(4,494억), 2024 오픈서베이 UX 1위(73.2 vs 66.7); 40+ 가 43%; 파워유저는 «보는 건 토스, 매매는 영웅문»(clien 2026-04); 2026-08 금감원 엄중 경고(투자자보호) + MTS 장애로 현장 IT 컨설팅 | 양쟁·라이트 기본 — 모바일 앱은 OS 설정 따름(2020-02 다크 도입; 2026-09 App Store «다크 모드에서도 보기 편하게»); PC WTS 는 2024-07 출시 때 다크 포함(5월 베타 피드백 반영) | (추정) 결제·뱅킹 슈퍼앱 안의 탭이라 «흰 여백 + blue 하나»가 은행형 신뢰 언어; 토스가 밝힌 다크 도입 이유는 사생활(대중교통에서 숫자 노출)·눈 피로·OLED 배터리이고 «트레이더 터미널» 미학이 아님 | 흰/회색 중립 바닥, 장식 그래픽 거의 없음; 색은 의미에만 — 한국 관습 red=상승/매수, blue=하락/매도(사용자 전환 불가, TDS 도 WTS 에서 red 가 primary 라고 명기; «캔들 미국식 반전 설정»은 미검증); 하단 고정 red '구매' 버튼 하나; 주문 화면은 액션 패널을 어두운 블록으로 띄우고 호가창을 참조로 강등; TDS 2025 OKLCH 시맨틱 토큰(target×role×variant) + 다크 전용 명도 스케일; gradient·glass·glow 없음 | 모바일 낮~중(스칼라 하나 → 단순 리스트 행, 상세는 차트/호가/뉴스/커뮤니티 탭 분할); PC WTS 중~높(2025-10: 경제지표·실적일정·지수·실시간 거래량 차트·나스닥100 E-mini; '차트 4개'는 미확인). 「가볍다·전문적이지 않다」비판은 2021 Plus X | Toss Product Sans: 실시간 갱신 값 고정폭, 히어로만 비례폭, 1/4/5/6/7/9·금융기호를 «UI 아이콘처럼»; 부호 값+% red/blue; US 종목 한글/영문 + USD/KRW 병기; 차트에 내 평단선·매매 마커; 재무 단순 바 차트; 호가창 거래비율 red/blue 바; 랭킹은 단순 리스트(실시간 TOP100); AI 는 텍스트(AI 시그널 «왜 움직였나», AI 어닝콜 원문+요약 병치); 게이지·스파크라인 없음 | «증권» 탭 → 수익률 한 숫자 → 보유종목(현재가 vs 평단, 색 수익) → 관심종목(+최근 본 종목) → 지수 → 발견/랭킹 → 커뮤니티(2022 개편 보도 기준, 2026 구조 미검증); 종목 → red '구매하기'(1,000원부터, 10/25/50/최대), 비계좌자는 1~3분 개설 | Toss Product Sans 숫자 규칙 그대로(라이브 열 tabular, 히어로만 비례); 파생 레벨을 표가 아니라 가격 차트 위 라벨 선으로; ko 로케일 red=상승/blue=하락 + OKLCH 다크 전용 명도; AI 코멘터리를 «설명하는 숫자 옆에 종목별로»; 위계는 색이 아니라 elevation·굵기로; 최근 본 종목 자동 노출; 일상어 검색(새우깡→농심) | 옵션을 «오를까요/내릴까요» 이진·상방 레버리지만('5%→214%' 등 변형 여럿)·수익률순 정렬·'옵션 박사' 컨페티(금감원 조사·출시 연기); 현금 % 기준 빠른 배분 버튼(쇼핑 프레이밍); 의무 교육 영상 숨기기(2026-08 철회); 정확한 용어를 친근어로(미수→외상); 진지 사용자가 떠나는 과단순화 |
| **Fiscal.ai Terminal** (구 FinChat; web-only) | 펀더멘털 터미널 + 스크리너 + 커스텀 대시보드 + AI 코파일럿; 뒤에 Data Feed API/MCP 사업 | Koyfin/TIKR 대비 중가 챌런저(Pro $39/49·Max $79/99 — 제3자 리뷰 근거; 7일 트라이얼); 350K+ 사용자(2025-06), $10M Series A; S&P MI 데이터; Perplexity·Google Finance·KPMG·VanEck 로고; 2026-06-02 ChatGPT/Codex 플러그인; 네이티브 앱 없음 | 양쪽·다크 기본 — 비로그인은 `data-mantine-color-scheme="dark"` 강제(prefers-color-scheme:light 에뮬레이트해도 다크); 2023 부터 설정 토글 존재 | (추정) 긴 데스크톱 리서치 세션에서 흰 숫자 표의 눈부심 저감; Koyfin/TIKR 사이에서 «Bloomberg 급 터미널» 신호; 브랜드 자산(amber 하이라이트·공시 오버레이)이 다크 위에 아트디렉션됨; 로그인 사용자 기본값은 미검증 | 저크로마 차콜: #1C1C21 바닥, #2C2C35 카드/입력, #40404F border/hover(Mantine dark-9/8/7), 텍스트 white→#AFAFB6→#94949E; 신호 green #0BD28B(양), 다크 green #1C6E4F(선택), red #FF5050/#EB0000(음·파괴); 지수 카드는 채운 red/green pill; 차트는 amber/orange 바 + navy 선; gradient·glass 없음(마케팅만 amber+사진); UI Plus Jakarta Sans, 표는 DM Mono; «blue #3A7DFF 링크» 미검증 | 높음 — 홈에 검색바+뷰 탭 4개+지수 카드 6+지표 칩+단위/통화 토글+~11열 워치리스트+저장 대시보드 스트립; 기업 페이지 11탭 + 51개 항목 통계 카드; 2026 리뷰 «학습곡선·길 잃음·지표 많으면 느려짐» | 표 우선, 차트 다음. 우측 정렬 그리드(로고+이름+거래소:티커, 인라인 편집 주식수/평단, MV·%Chg·YTD·Fwd EV/EBIT·Price·Daily %·Earnings Date), % 열 green/red; 표 위 전역 토글(K/M/B, .0/.00, USD/Local, Annual/Quarterly/LTM, Standardized/As-Reported, v5.9.7 부터 페이지 간 유지); 재무제표 DM Mono + LTM + QoQ/YoY; 바+선 콤보·날짜 슬라이더·차트 아래 데이터 표; 추정 기간은 스트라이프(2026-04); 가격 옆 '15 min delay'; 7일 내 실적 배지; 비율 tooltip 에 공식; source-to-filing 오버레이; 도넛; 캔들 TA(2026-05) | 로그인 → /dashboard 직행("your investing homescreen"): 'Search 50,000+ companies' 바 → Summary/Performance/News(+Markets) → 지수 카드 6개(red/green pill) → 지표 검색·회사 검색 입력 → 칩 → 토글 → 워치리스트 표 → 하단 저장 대시보드 스트립(활성 green); 비로그인은 SIGN UP/LOGIN + em-dash 그리드 | 행(회사)과 열(지표) 양축 조합 워치리스트; 표 위 단위·소수·기간 툴바 하나 + 페이지 간 유지; **출처가 UI 기능**('15 min delay', 'Source: … – Sep 02, 2026', 공식 tooltip, source-to-filing); 차콜 위 엄격 색 예산(신호 2색+선택 1색); 추정/파생 구간 스트라이프; 우측 정렬 mono 숫자 + 실적 배지 | 데스크톱 전용 11열 밀도(폰은 행당 2–3 지표 + 교체); 점진 노출 없는 기능 팽창(9항목 사이드바·11탭·51항목); em-dash 벽으로 게이팅 + 'Analysis(MSFT)' 플레이스홀더; 공식 문서에 세대 다른 스크린샷 혼재; 20+ 조각·8px 라벨 도넛; 제품이 안 보이는 랜딩 히어로(2026-06 B2B 피벗) |
| **Kalshi Pro** (pro.kalshi.com, 2026-07-13 베타) + 소비자앱(반례) | CFTC 규제 예측시장 — 전문 데스크톱 터미널 + 소비자 iOS/Android | 미국 규제 예측시장 최대(~89–95% 점유, 연환산 $178B — 2026-04 기준); 소비자앱 4.8★/493K; Pro 는 «가장 몰입한 리테일·샤프·소규모 데스크» 대상 무료 베타; 2026-07 리뷰 «미국 예측시장이 내놓은 최고의 플로우 터미널» | Pro 다크 전용(로그인 #0E1116, 설정에 테마 토글 없음); 소비자 web 은 라이트 기본, 앱은 기기 테마 + 수동 스위치 | (추정) Pro 는 TradingView/Bloomberg 류 옆에서 대형 모니터에 수 시간 열어두는 데스크 관습; near-black 위에서 시맨틱 두 색과 depth 바가 경쟁 크롬 없이 신호를 짊어짐; 다크/라이트 분할이 «pro/소비자 모드» 신호로 겹침; 브랜드 킷에 lightmode/darkmode green 별도(보고) | near-black 바닥 + 얇은 회색 구분선 + 흰/회색 비시맨틱 텍스트; 브랜드 hue 하나 turquoise-green(#4DE4B2 보고; 워드마크·Yes·상승·양 P&L), red/pink = No·하락; amber 는 절제(knockout 차트 참조선, 일부 볼륨 값); 데이터 표면에 gradient·glass·purple 없음(민트 gradient 는 마케팅 히어로만) | 높음(Pro; specs 페이지 "desktop-first, data-dense") — Markets 행에 이름·Yes/No·TOB 사이즈·spread·24h 볼륨·Yes-buy 비율·24h 스파크라인; Canvas 최대 30 타일(각 호가창·차트·주문 티켓) + 하단 blotter; 소비자앱은 의도적 중저밀도(«remarkably uncluttered») | 센트 1–99¢ = 확률; Yes/No 항상 2열; 스크리너 정렬(5분 볼륨·spread·depth 밴드·buy-skew ≥60%); **step line** + 볼륨 히스토그램 + LIVE/1H/…/ALL 칩 + 상단 볼륨/OI 스탯 줄; 호가창 1-sided/2-sided/Maker/Taker, Yes 99¢·No 1¢ 같은 행 정렬, depth 는 green/red 수평 바; **결측은 대시**("we show a dash rather than invent a number"); 포트폴리오는 큰 tabular 잔고 + 색 델타; 게이지·글래스 없음 | Pro: 상단바 Markets·Canvas·Perpetuals·Portfolio + 현금 잔고 + 'Kalshi classic' 링크; Markets = 정렬 가능 라이브 표(Live 플래그·시작시간) + 필터 패널 + 카테고리 칩; Canvas 첫 방문은 Starter(비트코인 타일 + ghost 타일 + 우측 주문 레일 + 하단 blotter). 소비자: 카테고리 줄 + 확률 %·Yes/No 큰 버튼 카드 | 숫자를 지어내지 않기(em-dash + 'no data'); 이산 시리즈는 step line + 히스토그램 + 스탯 줄; 시맨틱 색 한 쌍·나머지 중립·amber 절제·브랜드색은 워드마크만; «지금 움직이는 것» 열(5분 프리미엄·사이드 skew·깊이) 정렬 + 좁은 폭에서 열 자동 접힘(이름 유지); 다단계 플로우에서 주 액션 «같은 자리» + 행 내 스파크라인 | 2026-08 소비자앱 리디자인(App Store 리뷰: 화면에 안 맞는 «eye candy» 버튼, 잘린 제목, 멈춘 통계, 라이브 페이지에서 사라진 수익 추적 → 되돌림); 상세에서 사라지는 하단 내비(oddsassist); «fair value 없는 flow»(모든 열이 «움직임»만 답함 — 기준선/백분위 병기 필요); 히스토리를 데스크톱으로 미루기·설정 브라우저별 저장(뷰는 계정 동기화됨); 스포츠베팅 에너지의 마케팅 표면 |
| **Windy.com** (Windyty SE) | 기상 데이터 시각화/예보 인텔리전스(web+iOS+Android+watch), 비금융 | 프라하; 조종사·요트인·기상학자·일반; 15+ 모델·50+ 레이어·meteoblue MultiModel; iOS 4.8★/79K v51(2026-08-26), Android 51.1.2; EMS Technology Achievement Award 2026(3/31 발표, 9월 수여); Premium iOS $2.99–29.99 / web 연 $34.99 | 라이트 기본(지점 예보 표 흰색) + v49(2026-02) «Unified Dark Mode» 로 크롬·플러그인 패널은 다크 통합; 지도 크롬은 반투명 다크 회색 | (추정) 데이터 레이어가 hue 전 범위를 소비하므로 표는 중립 흰색, 크롬은 반투명으로 물러나 색 예산 전부를 데이터에; 스태프 발언(2024): 다크는 «예보 상세의 색 범위를 제한» | 색은 데이터에만, 크롬엔 없음. 레이어당 순차 ramp 하나(바람: blue→green→yellow→red→purple, purple 이 강풍 끝) 범례(우하단)와 값 자리에서 재사용; 예측가능성 4단(green/orange/red/burgundy — Windy 표기); 첫 화면 유일 채도 비데이터색 = yellow 'Upgrade to Premium'; 경고 배지는 중립 회백 pill; 범례 구간 비선형 0·5·10·20·30·40·60 kt | 높음 — 3시간 열 × 최대 14일 표, 6–8행(기온·체감·풍속/풍향·돌풍·강수·아이콘) + 수십 레이어 지도; 셀이 숫자이자 ramp 색이고 열이 시간 정렬, 크롬 최소, 깊이(meteogram·airgram·Skew-T·비교)는 탭/드롭다운 뒤 | 애니메이션 입자 streamline(밀도·꼬리=속도) + 색 ramp 오버레이 + 도시 라벨에 실온 숫자; 하단 타임라인(red now·재생); 일 헤더 요일+날짜+예측가능성 점(% 는 hover); 3시간 열마다 숫자; 'Feels like' 행; 풍향 화살표+kt; 'Source: ECMWF'; 모델 셀렉터에 격자해상도(ECMWF 9km/GFS 22km/ICON 13km/MSM 5km); 위치 블록에 «모델 고도 91m vs 실제 26m»; 인근 관측소(관측 vs 예보); Compare(같은 표 모델별 스택); 게이지·스파크라인 없음 — 색 표가 차트 | 풀블리드 애니 바람 지도(현 위치); 좌상 검색; 좌측 버튼 스택의 현황 pill('26° 12kt'); 우측 레이어 pill ~12; 하단 15일 타임라인(7일 이후 Premium 크라운); 우하단 줌/3D·모델 셀렉터·범례; 우상 작은 yellow Premium pill + Log in; 지도 탭 → 핀 팝업 → 예보 표 | 헤더당 예측가능성 점(벤더 합치도+신선도); 출처·해상도·«모델 vs 실제»를 UI 에 인쇄; 범례와 셀이 하나의 ramp + 결정 문턱 비선형 구간; Compare 뷰(계산법/벤더 병치) + AI 예보 vs 원 모델 라벨 | 풀블리드 레인보우 ramp 를 기본 표면으로(비공간 데이터·색약 적대); 접근성 이름 없는 아이콘 폰트 컨트롤('L','&','Q'); 핵심 신호의 «해상도» 게이팅(1h vs 3h) — 돈 결정엔 거친 뷰가 다른 답; 라이트용 ramp 를 다크에 그대로 들어오기 |
| **Gentler Streak** (Gentler Stories d.o.o., iOS/watchOS) | HealthKit 기반 readiness/회복 추적, 비금융 | 슬로베니아 인디; 2024 ADA(Social Impact), Watch App of the Year 2022, ADA 2023 파이널리스트; 4.7★/8.8K; iOS 전용; $8.99/mo·$39.99/yr·lifetime; 활동 로깅 무료, Path 뷰 대부분 Premium | 양쪽·라이트 기본(Streak·Wellbeing 흰색, Steps amber tint, Sleep 만 deep purple, watch 는 검정); iOS 시스템 따름 | (추정) 밝은 바닥이 green 밴드와 green/red 점을 «경보»가 아니라 «평온»으로 읽히게 하고 일러스트 중심 소프트 톤에 맞음; 다크는 의미상 밤(수면)·OLED 운동 중 글랜스(watch)에만 | 흰/연회색 바닥 + 정체성 색 하나(orange, 마스코트·Streak 아이콘); Activity Path 밴드는 light→dark green gradient(밴드 내 위치가 읽힘), 실제 시리즈는 white/black 점선; green/red 는 범위 안/밖에만(스파크라인 끝점·pill); 모듈별 ambient tint(amber Steps·purple Sleep·blue hypnogram); watch 는 다색 HR 존 바 | 중 — 화면당 4–6 숫자, 각각 단위+기준 대비 상태+(Body Metrics) 미니 스파크라인+정상범위 밴드; «상세 원치 않는 사용자는 압도되지 않음»; 2026 리뷰 «clean, editorial-grade, calm, legible» 4.2/5 | Activity Path(밴드 vs 점선, 오늘 굵게, Today/10 Days/30 Days); 상단 한 줄 판정('Great Effort Today') + 2줄 설명; Body Metrics 타일 5개 한 줄(아이콘·큰 값·절반 굵은 단위·미니 스파크라인 + 60일 Normal Range 음영 + green/red 끝점; 탭하면 14일 그래프); 큰 숫자/작은 단위('8h 19m'); 기준 명시 pill('Above Typical Saturday' + 'vs. typical Saturday - 6684 steps'); 장중 누적 vs «typical day» 회색선; Sleep 은 형용사 헤드라인 → 문단 → 4 스탯 → hypnogram; 게이지·0–100 점수 없음 | Streak 탭: 일러스트 하늘 + 마스코트(제거 가능) → 굵은 판정 → 설명 → Activity Path → Today's Activities 카드; 아래 스크롤에 For You(바이탈·수면·주기); 탭바 Streak/Activities/Insights 3개 | 밴드 대 선 regime 차트(종목 자기 trailing 밴드 + 고대비 점선 + 오늘 점); 바이탈 타일 스펙(값+단위+스파크라인+정상범위+끝점); 기준 명시 상태 pill; 판정 우선 위계(데이터에서 생성된 문장); 장중 누적 vs typical 참조선 | 마스코트/일러스트 정서 레지스터('Kudos', 컨페티) — 실돈 화면엔 리테일 밈; 숫자를 형용사로 완전 대체('Excellent' — 2026 리뷰 «vague»); 모듈별 풀블리드 ambient tint(방향 red/green 과 충돌); 표본 수·윈도우 안 보이는 자기이력 60일 밴드(얇은 OI 에서 z 138); 5–6색 HR 램프를 부호만 중요한 IV/GEX 에 |
| **Sofascore** (iOS/Android 네이티브 + web) | 스포츠 라이브 스코어·통계(25+ 종목), 축구 우선 최심 분석 | 자그레브; Sensor Tower 2026: 2025 다운로드 세계 6위·MAU 5위; Play 100M+/4.5★/1.15M, iOS 4.9★/77K v26.08.24; 통계형 팬·판타지·베터의 세컨드 스크린; Remove Ads/Plus/Analyst(AI 프리매치 인사이트) 티어; 리뷰어 «가장 넓고 평점 중심», FotMob 은 «더 깔끔·전술통계는 더 깊다(Tiki Taka)» | 양쪽·라이트 기본(web `sofa.theme=auto`, html.light: 페이지 #EDF1F6·카드 #FFFFFF·잉크 #222226; App Store 스크린샷 6장 모두 라이트; 'Dark Interface' 접근성 표기; 다크 2018 옵트인) | (추정) 낮·야외·직사광 글랜스 사용; 시맨틱 색(평점 6단·홈/어웨이 green/blue·라이브 red)이 흰 카드에서 의미 유지; 다크는 저녁 경기·OLED 용 시스템 따름, 브랜드 정체성은 아님 | 중립 섀시 + 시맨틱 데이터. 표면 #EDF1F6/#FFFFFF, 잉크 #222226(보조 45% 알파); 브랜드 blue #374DF5(스포츠바·활성탭·링크·즐겨찾기) + 상단바 #2C3EC4; 라이브 red #CB1818; 홈 green #0BB32A vs 어웨이 blue; **평점 6단 hex 잠금**(#DC0C00/#ED7E07/#D9AF00/#00C424/#00ADC4/#374DF5, 무평점 #A4A9B3, 변형 금지); 강조는 새 hue 아닌 알파(골 분 25%); gradient·glass 없음 | 높음 — 매치 Overview 한 화면에 핸디캡 배당·모멘텀·타임라인·POTM·핵심 통계·미디어·투표·순위·1X2 배당(함의 %)·경기장/심판·판타지·AI형 요약; 흰 카드 + 'View all' 로 버티지만 2026 리뷰 «캐주얼엔 압도» | Sofascore Sans/Condensed(400/500/700, Hot Type 2022) 스코어 28px/700, 평점 배지 Condensed 700 + tabular-nums, 매치 평점 1소수·평균 2소수; Attack Momentum 321×80 SVG 분당 2.5px 바 95개·중앙선·하프타임 구분선·축 텍스트 0·골 분 25% 알파; 미러 행('54% | Ball possession | 46%', '3.46 | xG | 1.21'); 배당 항상 함의 % 병기('3.75 = 27%'); 피치 라인업 칩 오버레이(평점/나이/시장가치/키); 승부확률·히트맵·샷맵·4팀 비교; 스코어 승자 full-ink·패자 70% 알파 | Matches 탭(2025-10-16 개편): blue 헤더 + 가로 스포츠바 → '< Today >' 스테퍼 + Odds 토글 → 상태 칩 All(검정)/**Live (74) red**/Finished/Upcoming → 회색 페이지 위 흰 리그 카드(로고·이름·국기·카운트 pill·접기) → 매치 행(시간/상태 회색, 크레스트+팀, 우측 스코어, 별); 즐겨찾기 상단; 네이티브 하단 Sport/Favourites/Feed/Fantasy | 헤드라인 점수용 «공개·잠긴 시맨틱 색 척도»(hex 6단·1소수·변형 금지); Attack Momentum 형태를 옵션 플로우로(콜 위/풋 아래·세션 구분선·같은 색 알파 강조·축 0); 미러 행 + 중앙 라벨 + 원값 옆 평문 번역; 압축 tabular 숫자체; 홈 트리아지(경보색 라이브 카운트 칩·날짜 스테퍼·고정 그룹·카운트 pill·View all) | X 눌러도 링크 열리는 전면 광고(2026-04 Play 최다 불만); 하나의 Overview 에 전부 쌓기; 군중 감성('Who will win? 76%')을 통계 출력 옆에 벽 없이; 숫자 판독값 0 인 차트(SIGNUM 사용자는 화면으로 사이징); 의존하던 지표의 사후 페이월화($40/mo 티어·Plus/Analyst 이동, 2026-08 리뷰) |
| **NTS Radio** (iOS/Android + nts.live) | 독립 24/7 온라인 라디오 + 아카이브(미디어, 비금융) | 2011 Hackney; 2채널(런던·LA 스튜디오, 송출은 80+ 국), 700+ 레지던트(대부분 스톡옵션); 월 ~600만(2025-12); 광고 0, 'NTS Supporters' 자발 구독(£3.99~); iOS 4.9★/~2K, v5.12.0(2026-09-02); UMG 최대 소수주주; 2026-06 Atonemo 하드웨어 플레이어($179/£129) | 다크 전용(앱 UI #000, `html{color:#fff}`, theme-color #000000; 릴리스노트에 테마 토글 없음) | (추정) 클럽 플라이어·인쇄물의 흑백 포스터 미학(Univers Condensed 대문자); 홈이 풀블리드 인물사진/영상 스틸이라 검정이 UI 를 «프레임»으로 사라지게 함; 야행성 lean-back 매체에 검정 OLED 가 가장 덜 침입적; «Don't Assume»·«알고리즘보다 인간 큐레이션» 포지셔닝이 단색·비게임화에서 더 믿김 | 엄격 단색 크롬 + 기능 accent 하나. 스타일시트 색 빈도 #fff 392·#000 251·#999 123·#666 111·#ccc 95·#4c4c4c 83·**#e81717 35(LIVE 점·라이브 상태 전용)**; 브랜드 gradient·glass/blur 없음, 사진 위 텍스트는 검은 라벨판; 장르 태그 1px 흰 테두리 사각형(채움 없음); 채운 흰색은 재생 삼각형·일시정지·스케줄 버튼·'FIND EPISODES' | 중~높 — Live 홈은 카드 2장이지만 각 6필드(라이브 점·채널 박스·도시·제목·HH:MM–HH:MM·재생); 에피소드/플레이어는 타임스탬프 트랙리스트·태그·설명·Up Next 를 여백 없이; accent 하나·활자 하나로 평온 | 차트·게이지·스파크라인 없음. 복잡성은 «편성표»와 «타임스탬프»로: API(now + next1..17, ISO 시작/종료, location_short LDN/LA/NYC/KIN, 장르 ≤4) → '14:00 - 15:00' 현지시간; 트랙리스트 행은 고정폭 경과시간('1:03:40') + 행별 '+'; 플레이어 '1:08:30 / 2:00:13' + 얇은 진행바; 날짜 dd.mm.yy 와 dd.mm.yyyy 혼용; 장르는 중점(·) 구분 텍스트; Explore 는 카운트 없는 텍스트 행; 라이브 트랙리스트·타임스탬프가 유료 Supporter 특전 | LIVE 탭(하단 LIVE·DISCOVERY·SEARCH·MIXTAPES·MY NTS): 채널당 풀블리드 인물 카드 — '● 1 LONDON' / 2줄 대문자 압축 제목 / '14:00 - 15:00' / 큰 흰 재생; 카드 사이 캘린더-하트 플로팅 버튼(다음 편성·My Schedule); 인사·피드·프로모·숫자 없음 | 홈 데이터 모델 = 편성표(세션 상태 PRE/REG/POST/CLOSED + 시간창 + 'Next on' 촉매) — 레이아웃 불변·매시간 새롬·낡음에 정직; «live» 에만 hue 하나(실시간 피드 상태); 타임스탬프를 1급 왼쪽 고정폭 열로 + 행별 액션; 메타데이터는 색 칩 아닌 절제된 활자 라벨(거래소·데이터소스·날짜); 2주 간격 소출하·콘텐츠 회전으로 홈을 낡지 않게 | 풀블리드 사진 카드 배경(SIGNUM 엔 얼굴·아트가 없어 빈 검정 사각형 — image 슬롯은 데이터여야); 폴드 위 숫자 0(옵션 트레이더는 3초 안에 가격·변화·신선도); 전대문자 압축 서체(한글·가나에 대문자 없음·숫자 판독 저하); 홈에서 신선도(타임스탬프)를 페이월; 1px 흰 헤어라인만으로 구분된 무테 검정 카드(Android LCD·한국 낮 야외에서 위계 붕괴) |
| **Tide Guide: Charts & Tables** (Condor Digital, Apple 전용) | 조석+해양 기상 예보(iPhone/iPad/Mac/Watch/Vision Pro; Apple ADA 페이지는 tvOS 도 표기), Weather 카테고리 | 1인 개발 인디(2018~); **2026 ADA Visuals and Graphics 수상** + Interaction 파이널리스트(Weather 카테고리 수상 2개 중 하나 — 다른 하나 Moonlitt), 2023 ADA 파이널리스트, Liquid Glass 갤러리·쇼케이스; US 4.7★/9.8K #94 Weather, KR 4.9★/35, JP 4.4★/48, 15개 언어(ko·ja 포함); NOAA·UKHO·Apple Weather·Storm Glass; Pro $3.99–4.99/mo·$19.99–29.99/yr·Lifetime $150(App Store IAP) | 다크 기본(iPhone/iPad/Mac/Watch 공식 스크린샷 전부 deep navy→teal gradient; 라이트 UI 스크린샷 없음; 사용자 선택 «themes/backgrounds» 존재; Vision Pro 만 passthrough 위 glass 창) — 하늘색에 따라 hue 가 시각별로 변함 | (추정) 어두운 물 같은 gradient 가 조석 곡선을 «수면»으로 읽히게 하는 문자적 은유; 주 사용 맥락이 새벽/황혼 야외(낚시·보트·해변)라 어두운 바닥 + 밝은 곡선 하나가 판독 유지; 다크 바닥이 유일한 채도 blue(미래)와 유일한 red 점(지금)에 주의를 몰아줌; Apple: «팔레트가 하루 동안 하늘색에 맞춰 변함» | 크롬은 hue 한 계열(navy ~#0b1f3a → cerulean/teal), 같은 계열의 반투명 Liquid Glass pill·카드, 흰 주 텍스트·~55–60% 보조; 데이터색은 시맨틱·극소: 곡선 과거 = 탈색 회백, 미래 = 채도 blue + 면 채움, **지금 = 화면 유일 red 점**, 스크럽 커서 = 발광 blue 링, 경보 amber, 태양 warm orange·달 purple 아이콘, 기온 범위 yellow→orange 작은 바, 바람 light-blue/돌풍 연한 선; 방향 글리프(↑↓)는 blue-on-blue — 색이 숫자를 도덕화하지 않음 | 중 — Today 에 ~16 숫자(조건 칩 4, 높이+방향+카운트다운, 일출/월출 4, 극값 4)+풀폭 차트지만 큰 숫자는 하나(~40pt), 나머지 13–15pt 정렬 열 + 넉넉한 여백; Charts 는 x축 공유 소형 다중 3패널(24H/2D/3D/5D/10D); «Watch 는 super simple·glanceable, iPad/Mac 은 informationally dense»(Apple 세션 verbatim) | 바/게이지 아닌 연속 곡선: 하단 ~40% 풀블리드 사인 곡선, 극값을 선 위에 라벨(시각 굵게·높이 흐리게)이라 축 없음; red now 점; 누르고 끌기 → 세로 룰 + glass 버블('4.8′ 5:15p Today') + 곡선 아래 하이라이트 + 햅틱; 2열 리스트(아이콘·시각·높이, 과거 행 ~40% 감광); Tables 는 일별 카드(미니 곡선·기온 범위 바·일출/월출 4·화살표/시각/높이 4) + 10일/월간 칩; Charts 는 x축 공유 소형 다중(기온+체감·풍속+돌풍+데이터 점 위 풍향 화살표·스웰+주기), 우측 정렬 y 라벨, today 밴드; 위젯 링 게이지(마지막 저조→다음 고조) + Live Activity; Solunar 고도 아크 | Today 탭(로그인 없음, 마지막 스테이션 직행): 좌 파형 아이콘(스테이션 리스트)·중앙 glass pill(부표 아이콘+스테이션명+셰브론)·우 재생 버튼(기능 미검증) → 조건 칩 4개(기온·수온·풍속/풍향·스웰/UV) + amber '⚠ Small Craft Advisory' → 히어로 '4.7′ ↑ / Rising Tide / High in 3 hr, 35 min' → 일출/월출 → 조석 4이벤트(과거 감광) → 풀블리드 곡선 → Liquid Glass 탭바 Today·Charts·Tables·Solunar; 판매 CTA 없음 | 상태 우선 히어로(큰 tabular 숫자+방향+평문 상태+다음 변곡 카운트다운); 시간 부호화 곡선(과거 회색/미래 blue/now red, 극값 라벨 온-라인); 스크럽 마이크로인터랙션(룰+버블+하이라이트+햅틱); 색 규율(크롬 한 계열, accent 하나=미래/활성, red=지금, amber=경보, 방향 화살표 blue-on-blue); 기간별 카드+미니 곡선+정렬 셀; x축 공유 소형 다중 + 하나의 범위 컨트롤 + 데이터 점 위 2차 차원; 기기/표면별 밀도 | 풍경 은유(하늘 gradient·해/달 아이콘·«Ocean Companion» 온기)와 희소 데이터 spline smoothing; 확정 언어('High in 3 hr, 35 min' 은 천문학적 결정론 — max pain·GEX flip·whale index 는 추정/모델 라벨+타임스탬프 필수); Liquid Glass 재질을 Capacitor WebView 에서 CSS backdrop-filter 로 모사(프레임 비용·iOS 탭 신뢰성); 핵심 숫자 게이팅(24H 초과 차트·4일 초과 표 Pro) — 깊이를 게이트하고 헤드라인은 열어둠; 라이트 테마 필요/불필요의 근거로 삼기 |

---

### 2-6. 테마 분포 관찰 (2.5단계의 입력)

사실만 기록한다. 테마 결정은 여기서 하지 않는다.

**금융 카테고리 (6개)**
- 다크 전용: **Kalshi Pro**(Pro 표면만; 같은 회사의 소비자 web 은 라이트 기본, 앱은 기기 테마 따름 + 수동 스위치)
- 양쪽 · 다크 기본: **Quant Data**(네이비; 흰 테마 2026-04 추가 + 사용자 컬러피커), **LSEG Workspace**(Halo dark/light 2변형, 설정에서 전환), **Fiscal.ai**(비로그인 다크 강제, 설정 토글 존재)
- 양쪽 · 라이트 기본: **MenthorQ 3.0**(next-themes defaultTheme light, 'Dark Mode' 토글 — 단 자사 가이드 스크린샷은 전부 다크 캡처), **토스증권**(모바일 앱은 OS 따름 → 사실상 라이트; PC WTS 는 2024-07 출시부터 다크 포함)
- 라이트 전용: 없음

**금융 밖 (5개)**
- 다크 전용: **NTS Radio**(#000, 토글 없음), **Tide Guide**(iPhone/iPad/Mac/Watch 스크린샷 전부 navy gradient; 사용자 «backgrounds» 선택은 있으나 라이트 UI 증거 없음)
- 양쪽 · 라이트 기본: **Gentler Streak**(시스템 따름; Sleep 만 deep purple, watch 는 검정), **Sofascore**(`theme: auto` → 라이트 머신에서 라이트; 스크린샷 전부 라이트; 'Dark Interface' 표기)
- 라이트 기본 + 부분 다크: **Windy.com**(지점 예보 표는 흰색 고정; 지도 크롬은 반투명 다크; v49 2026-02 부터 로그인·동의·구독·컨텍스트 메뉴 등 플러그인 패널이 «Unified Dark Mode»)

**중립적으로 보이는 패턴**
1. 11개 중 «단일 테마»는 3개(Kalshi Pro·NTS·Tide Guide)뿐이고 8개는 양쪽을 제공한다. 양쪽 제공 8개 중 기본값은 다크 3 : 라이트 5.
2. «옵션/딜러 포지셔닝» 축의 직접 경쟁 제품 두 개가 갈린다 — Quant Data 는 다크 기본, MenthorQ 3.0 은 라이트 기본(2026-07 재설계에서). 원 조사가 MenthorQ 를 «다크 단일»로 오판한 것은 마케팅·가이드 이미지가 전부 다크로 캡처됐기 때문이며, 이는 «스크린샷의 테마 ≠ 제품 기본 테마»라는 관측 자체가 하나의 사실이다.
3. 데스크톱 우선 «데스크/터미널» 제품(LSEG·Fiscal.ai·Kalshi Pro·Quant Data)은 전부 다크 기본 또는 다크 전용. 모바일 우선 대중 소비자 제품(토스·Sofascore·Gentler Streak·Windy)은 전부 라이트 기본 + 시스템 추종. Tide Guide(모바일 우선·다크)와 MenthorQ(데스크톱·라이트)가 이 상관의 예외다.
4. SIGNUM 의 실제 사용자가 «다른 손에 든» 앱(토스증권)은 라이트 기본이며, 그 사용자층은 40대 이상이 43% 다(2026-07). 반면 같은 사용자가 참조할 가능성이 있는 옵션 도구(Quant Data·Unusual Whales)는 다크다.
5. 다크를 택한 제품들이 공유하는 것은 «검정 #000» 이 아니라 «순흑이 아닌 near-black(#0D0D0D·#090c11·#0E1116·#1C1C21·navy) + 순백이 아닌 텍스트(#CCCCCC·#AFAFB6) + gradient/glass 0» 이다. 유일한 gradient 사용자 Tide Guide 는 크롬 한 hue 계열 안에서만 쓴다. 현 SIGNUM(#06090f + purple→cyan gradient + glass)과 같은 조합을 쓰는 레퍼런스는 11개 중 0개다.
6. 라이트를 기본으로 두면서 다크를 «덧붙인» 제품(토스·MenthorQ·Windy)은 모두 다크용 명도/색을 따로 재조정했다고 밝히거나(토스 TDS «다크에서만 시끄러웠다», LSEG 라이트 tick 색 어둡게, Windy «ramp 가 라이트에 튠됨») 그 필요를 인정했다. 두 테마를 «같은 토큰에서 생성한다»는 원칙과 «시맨틱 색은 테마별 재튠»이 함께 등장한다.
7. 한국 방향색(red=상승/blue=하락)을 실제 출하한 제품은 토스 하나이고, 그것을 «지역 프로파일 토큰»으로 구조화한 제품은 LSEG Halo 하나다. 나머지 9개는 미국식 green/red 또는 비방향 시맨틱이다.

---

### 2-7. 제외된 레퍼런스

팩트체크 단계의 공식 DROPPED 목록은 비어 있다(제출된 11개 항목 전부 채택, 다만 토스증권 2건은 1건으로 병합). 각 항목의 «whyChosen» 안에서 검토 후 밀려난 후보들만 한 줄씩 남긴다.

- **Unusual Whales** — 카테고리 대표(iOS 4.6★/676)이지만 색 체계가 Quant Data 보다 덜 절제돼 «참고할 시스템»으로 약함; 트렌드표에서 Mr. Whale·MME·API 사례로만 인용(https://unusualwhales.com/apps).
- **Cheddar Flow** — 2026 Trustpilot 4.2/17 «Very clean interface» 이나 web-only 이고 사이트가 비브라우저 fetch 를 전부 차단해 UI 를 직접 검증 불가(https://www.trustpilot.com/review/www.cheddarflow.com).
- **SpotGamma** — Bloomberg 연동이지만 Bullish Bears(2026-04-21) «no UI or design coherence», 라이트 마케팅 + 다크 대시보드 혼재, 대시보드 루트 비로그인 판독 불가(https://bullishbears.com/spotgamma-review/).
- **Volland (vol.land)** — 크롤러 차단 + 자체 유튜브가 이전 UI 를 'Legacy Interface' 로 표기해 현행 화면 미검증(https://www.wizofops.com/volland.html).
- **Bloomberg Terminal** — 당연한 인용이나 디자인이 닫혀 있고 룩이 레거시; LSEG Workspace 가 «공개 토큰이 있는 Bloomberg 급»으로 대체(https://en.wikipedia.org/wiki/Bloomberg_Terminal).
- **Robinhood / Robinhood Legend** — 슬롯의 당연한 선택이나 토스증권이 «같은 청중 + 공개 디자인 토큰»으로 우세; Legend·Cortex·Prediction Markets 는 트렌드표 사례로 인용(https://robinhood.com/us/en/legend/).
- **Koyfin** — Bloomberg-lite; 2026-02 여섯 테마를 라이트 기본으로 통합한 점만 테마 분포 근거로 사용(https://www.koyfin.com/help/theme-update-light-and-dark-modes-in-koyfin/).
- **Fey** — 디자이너 선호 제품이나 2025 Wealthsimple 인수 후 신규 가입 종료로 «현재 운영» 기준 미달(https://fey.com).
- **Polymarket** — 소셜피드-우선 설계라 기관적 의도의 참조로 약함(Android 평점은 현재 4.5★로 원 조사의 2.2 는 구자료; 제외 이유는 설계 방향)(https://www.thelines.com/prediction-markets/polymarket/app/).
- **Family (crypto wallet)** — 디자인 커뮤니티 애호작이나 Aave 가 2026-02 종료 발표, 2026-04-01 신규 온보딩 중단(기존 사용자 2027-04 까지 제한 접근)(https://apps.apple.com/us/app/family-crypto-wallet/id1606779267).
- **알파스퀘어** — 다크·TradingView 형, 4.6★/383, v26.2.5(2026-08)이나 11인 니치 도구로 청중 대표성 부족(https://alphasquare.co.kr/).
- **증권플러스(두나무)** — 2.9★, 평범하고 빽빽한 UI 로 참조 가치 낮음(https://apps.apple.com/kr/app/%EC%A6%9D%EA%B6%8C%ED%94%8C%EB%9F%AC%EC%8A%A4-%EB%AA%A8%EB%93%A0-%ED%88%AC%EC%9E%90-%EC%A0%95%EB%B3%B4%EB%A5%BC-%ED%95%9C-%EA%B3%B3%EC%97%90%EC%84%9C/id913934976).
- **미래에셋 M-STOCK** — MAU 373만(2026-03)으로 국내 최다이나 레거시 증권사 UI(https://m.ceoscoredaily.com/page/view/2026050715075969166).
- **moomoo Japan** — 2026-06-19~09-18 관동재무국 «신규 계좌 모집 부분 정지» + 업무개선명령 중(전면 정지는 아님)이라 참조 부적절.
- **WHOOP / Oura** — 하드웨어 종속 + WHOOP 은 이미 다크·점수 우선이라 SIGNUM 에 새로 가르치는 것이 적음; Gentler Streak 이 대체(https://www.925studios.co/blog/whoop-design-breakdown , https://ouraring.com/blog/new-app-design/).
- **FotMob** — 더 깔끔하고 평점 높으나(Tiki Taka 는 전술 통계가 더 깊다고 평) 색 척도·모멘텀 차트처럼 «검증 가능한 문서화된 기법»이 Sofascore 보다 적음(https://www.tikitaka.gg/articles/fotmob-vs-sofascore-vs-flashscore-vs-tiki-taka-best-football).
- **Apple Sports** — 위계는 탁월하나 의도적으로 얕고 Apple 전용, 디자인 비평이 2024년에 머묾(https://lickability.com/blog/apple-sports/).
- **Tidal** — 가장 가까운 «프리미엄 다크» 음악 앱이나 2026-03~05 플레이어 리디자인이 «압도적 비판»(PiunikaWeb)을 받아 올해 인용 부적절(https://piunikaweb.com/2026/05/06/tidal-ios-music-player-redesign-rolling-out/).
- **Spotify / Apple Music** — 당연한 이름이지만 개인화 피드 중심이라 «편성표 모델 홈»이라는 NTS 의 기법을 보여주지 못함.
- **Carrot Weather / Apple Weather / Grafana / Tableau / Datadog** — 당연한 후보이나 Windy·Tide Guide 가 «불확실성·출처·기기별 밀도»를 더 검증 가능한 형태로 보여줌.
### 2-8. 기준선 보강 — «관행적 금융 앱» 6종 (독립 검증 완료)

> 2-1~2-7 이 «참고할 만한» 레퍼런스를 골랐다면, 이 절은 SIGNUM 사용자가 이미 알고 있는 **관행**을 재는 기준선이다. 같은 방식(프로필 → 독립 팩트체커 반박)으로 검증했고(에이전트 12, 도구 호출 766회), 팩트체커가 뒤집은 주장은 표 안에 «✎» 로 표기했다. 두 건(Robinhood·Public)은 **«라이트 기본»이라는 핵심 주장이 1차 자료로 지지되지 않아 기본값을 «미상»으로 강등**했다 — 이 자체가 2-6 #2 의 관측(«스크린샷의 테마 ≠ 제품 기본 테마»)을 다시 확인한다.

| 서비스명 | 카테고리 | 포지션 | 기본 테마 | 테마 이유(추정) | 색 전략 | 정보 밀도 | 데이터 표현 | 첫 화면 전략 | 참고할 지점 | 참고 안 할 지점 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Robinhood** (iOS v2026.35.0, 평가 482만·4.29) + **Legend**(데스크톱 터미널) | 미국 대중 리테일 브로커리지 | «누구나 첫 주식을 사게 하는» 대중 앱 + 액티브 트레이더는 Legend 로 흡수 | **양쪽 · 기본값 미문서화** ✎ — 설정에 Light / Dark / **Market hours**(장중 라이트·장후 다크) / 시스템 4프리셋 + 색약용 «Accessible colors» + 미리보기. 공식 문서는 기본값을 말하지 않고, 열람 가능한 공식 시각자료(App Store 스크린샷 6장·Legend 이미지·2025 비평 스크린샷)는 **전부 다크** | (추정) 대중·초심자 포지션이 밝은 표면을, 액티브 표면(Legend)은 어두운 «Aura» 배경(세션·포트폴리오 방향이 배경색)을 택함 | 2024-10 리브랜드(PORTO ROCHA): 흑·백·중립 + «Robin Neon» 옐로그린 포인트, Phonic 산세리프 + Martina Plantijn 세리프. 상승 green / 하락 red, 캔들 bull green·bear red. ✎ 스크린샷에서 상승률·불 캔들이 Robin Neon 으로 렌더 → 앱 안에서는 **브랜드 액센트 = 상승색**(분리 운용 주장 철회). Buy 버튼이 종목 등락색을 입음(Pratt 2025) | 낮(모바일) / 매우 높음(Legend: 8차트·9레이아웃·위젯 그리드) | 홈 = 큰 포트폴리오 총액 + 오늘 손익 + 단일 라인차트(1D~MAX) + 카드 캐러셀 + Lists. 종목엔 «Legend Charts on Mobile»(2025-06, 80+ 지표) 탭 하나로 진입. 옵션체인은 한 번에 2지표(리뷰 지적) | 숫자 하나 → 차트 하나 → 리스트 3층. 알림성 카드는 리스트 «위» 가로 캐러셀로 격리. 신규는 «Pick your stock» 리워드로 빈 포트폴리오를 첫 행동으로 대체. ✎ 하단 5탭 명칭은 2차 출처 1건뿐 | «배경이 세션을 말한다»(Market hours 테마·Aura) — 다크 고정이라도 PRE/REG/POST/CLOSED 를 톤·띠로; 첫 화면 3층 서열; 색약 대체 팔레트 + 미리보기; 깊이의 계층화(기본 차트 → 탭 하나로 프로 차트) | 라이트 표면을 «대중 앱이니까» 따라가기; 옵션체인 2지표·매크로 맥락 부재 같은 정보 손실형 단순화; Buy 버튼까지 등락색을 입히는 감정 자극 |
| **Unusual Whales** (web + iOS v24.2.78·4.56 / Play 4.6) | 옵션 플로우·다크풀 리테일 데이터 터미널 — **SIGNUM 직접 경쟁** | Retail Basic $50 / Pro $75 / Max $120 월; «11K+ 티커·1B+ 데이터포인트·10만 커뮤니티» | **다크 전용** [확실 — DOM 실측: `data-theme` 없음, body oklch(0.141 0.005 285.8) ≈ zinc-950] | (추정) 테이프·표 중심 트레이더 관습; 문서에 라이트 토글 언급 없음 | 무채색 다크 단일 톤 + 하늘색 액센트 #53A5D5(링크·CTA). ✎ 라이브 표에서 green #33B890 / red #EC4B5E 쌍은 **DTE 열**에 적용되고, Side 열은 노랑(BID)·보라(ASK) — «green=콜/red=풋» 문구는 알림 카드 문서에만 | 매우 높음 — 플로우 피드 기본 열 ✎ Time·Ticker·Side·Contract·DTE·Stock·Bid-Ask·Spot·Fill vs Spread·Size·Premium·Volume·OI·Chain Bid/Ask·Legs·Code·Flags·Tags(18열), 12.8px·행 36px, 페이지당 50~250행 | 테이블형 실시간 테이프(체결 1건=1행, Live Flow 일시정지, CSV, Muted, 저장 필터). 셀 안에 숫자 + **이모지 어휘**(🐂🐻 감성·🦴🛍️ 사이드·플래그) + «Emojis are an estimation» 면책. Flow Status Indicator(GREEN/YELLOW/RED)·«Viewing data from 2 days ago» 배너 | 웹 로그아웃 홈 = 마케팅 히어로 → 캐러셀(✎ Congressional Trading / Follow the Flow / Market Maker Exposure) → 후기 → «Mr. Whale» AI → 스크리너 라이브 표 데모. ✎ 무료 플로우 뷰는 빈 표가 아니라 15분 지연 50행 + 비구독 배너 | **데이터 신선도를 UI 상태로**(상태 표시등·일시정지·«N일 전 데이터» 배너) — 우리 «200 OK 인데 옛값» 문제의 화면 언어; 필터 프리셋 = 상품(Universe 16종, 저장 필터 수가 티어 차별); 방향을 색이 아닌 어휘(아이콘/약어)로 | 16~18열 표를 모바일에 축소 이식(«clunky», 정보 겹침, iPad 가로 미지원 리뷰); 어디를 눌러도 업그레이드 벽이 먼저 나오는 잠금 밀도; 이모지 과장 |
| **Bloomberg Terminal** + 소비자 앱 **Bloomberg: Business News Daily**(v6.66.0·4.59/5.5만) | 기관 터미널 + 소비자 뉴스·시세 앱 | 40년 락인 기관 표준 / 소비자 앱은 편집 뉴스 우선 | **Terminal 다크 전용**(amber-on-black) [확실] / 소비자 앱 ✎ 현행 스크린샷은 흑백 모노크롬 크롬 | 1982년 컬러 모니터 부재 → «orange or green on black» 표준 → Mike Bloomberg 가 «플로어 어디서든 알아볼» 브랜드로 의도적 유지(Ted Merz). 공식 UX 글: «Amber is Bloomberg's base font color» | 검정 + 앰버 = **비의미 정보 전용**, 의미색은 상승/하락에만(기본 red/green, 색약용 blue/red 스킴을 PDFU COLORS <GO> 로 전환). 앰버 hex 공식 미공개. ✎ 소비자 앱은 흑백 + red(Live 배지·하락)·green(상승), 블루 액센트 없음 | 매우 높음(Terminal: 탭 패널 모델, 수천 함수, «86페이지 매뉴얼») / 중(소비자) | 텍스트 표 중심 앰버 단색 + 의미색만 컬러. 명령줄 «티커 + 함수 + <GO>», Launchpad 영구 작업공간. ✎ 소비자 앱 Markets 지수 상세 = 흰 라인차트 + «Rolling 50-day range» 밴드, Watchlist = 1D Heatmap 트리맵 + SYMBOL/PRICE/CHANGE 정렬 표 | Terminal: 명령줄 패널 + Launchpad 로 «매일 같은 상태로 시작». ✎ 소비자 앱 홈 = 카테고리 스트립(Top News·Latest·Markets…) → 사진 히어로 스토리 → 인라인 티커 칩(«NVDA ▼-1.27%») → 헤드라인; 하단 탭 Home / For You / Markets / Watchlist / Media | «단색 기본 + 의미색만 컬러» 규칙; 밀도를 줄이지 않고 **일관된 레이아웃 규약 + 진입점 하나(검색/명령)** 로 감당; 시각 변경은 «매달 조금씩» 단계 배포 | 앰버-온-블랙 색 모사(1980년대 제약의 산물, 이미 업계 표준이라 차별화 0); 명령줄·암기 의존 UI 를 모바일에 |
| **TradingView** (web + iOS v2.139.0·4.84/40.7만) | 차트 우선 마켓 데이터·소셜 플랫폼 | «1억 트레이더» 네트워크, 브로커 연동 | **양쪽 · 라이트 기본** [확실 ✎ — 로그아웃 홈 `<html class="theme-light" data-theme="light">`, Advanced Charts 문서 «The default value is light»; 데스크톱만 시스템 추종 기본] | 라이트 기본 + 다크는 «더 편안한 보기»용 옵트인(헬프센터 어조); 마케팅 히어로(우주 캠페인)는 별도 다크 섹션 | 흑·백 1차 + 블루 2톤(✎ `--color-tv-blue-500 #2962ff`) + 터쿼이즈·오렌지·퍼플 3차(양 테마 차트용). 캔들 기본 ✎ up #089981(teal) / down #F23645 — 순수 초록이 아닌 teal 로 흰·다크 양쪽 대비 확보 | 매우 높음(웹 Supercharts 4방향 툴바·110+ 드로잉·우측 패널 15종) / 모바일은 3단계 밀도 | 캔들 중심 + 21종 차트타입. 워치리스트 = 행 표(로고·티커·현재가·변화·%·거래량·프리/포스트 세션 값) → **«미니멀 모드»(심볼+가격+변화)를 공식적으로 «모바일 앱 모양»으로 정의**하고 웹에 역이식 | 웹 홈 = 히어로 → «Where the world does markets» → Market summary → Community ideas → Indicators → Top stories. 모바일 = 워치리스트(스캔) → Symbol screen(요약) → 고급 차트(도구); Buy/Sell 패널 기본 숨김 | 앱 표면 테마와 홍보 표면 테마를 **따로** 판단; 밀도 3단계(미니멀/표/고급) 중 가장 얇은 단계가 모바일 정본; 첫 화면은 «판단»이 아니라 «스캔»용 | 4방향 툴바 «도구 상자» 밀도(사용자가 스스로 쌓는 플랫폼이라 정당화됨); 커뮤니티 피드를 홈 상단에(네트워크 효과 전제 — 신생 앱은 빈 피드) |
| **iSPEED**(楽天証券, iOS JP v11.9.1·4.50/15.5만, ファイナンス 20위) | 일본 리테일 증권 트레이딩 앱 | 국내주식·米国株·CFD; 8개 후보 중 6탭을 사용자가 구성 | **양쪽 · 초회 로그인 시 사용자 선택**(スモーキーブラック / スノーホワイト / オリジナル) ✎ — 프리셀렉트 공식 미문서화; **다크가 정본 이미지**(현행 스크린샷 10장 중 8장 다크 UI, 2020 세미나 자료 75장 중 70장 다크) | (추정) 트레이더 관습 + 순검정 배경에서 赤/緑 전일비가 강하게 읽힘; 리디자인 때 옛 색(オリジナル)을 옵션으로 남겨 이탈 방지(6.1.0 노트) | 순검정 + 짙은 회색 구분. **赤=上昇 · 緑=下落**(일본 관습, 매수전표 赤·매도전표 青 유래) — 영어권 리뷰는 «red for profit» 을 불편으로 지적. 「現在値カラー」로 직전 약정 대비 틱 색 반영 선택. 액션색(매수 赤·매도 青 버튼)과 데이터색(상승 赤·하락 緑)을 **자리**로 구분 | 매우 높음 — 종목 요약 8수치 2열 표 + 일봉·MA·거래량 + 12개 스와이프 탭; ✎ «1画面で100銘柄» 은 iPad 모드 | My Page 타일 대시보드(1×2~5×1 그리드: 큰 현재가+전일비+고저시종 또는 5分足 미니차트), 리스트 5종 표시 모드, 호가창 10단(米国 30단)·武蔵 풀판 | 하단 6탭 TODAY / お気に入り / 検索 / 注文 / 資産・照会 / メニュー; TODAY 안에 My Page / Market Today / トウシル 세그먼트. 신규는 초기설정(자동로그인·Face ID·컬러) 후 **초기 템플릿 6종이 미리 깔린 My Page** — «커스터마이즈 없이도 사용 가능» | ja 로케일 **赤=上昇 반전은 선택이 아니라 필수**(설정은 차트·호가·전일비 전체에 일관 적용); 액션색·데이터색의 자리 분리; 리디자인 시 «이전 팔레트 유지» 옵션 | «片付けのされていないデスクトップ» 비판(30종 파츠·12탭·6탭바·3세그먼트 겹침, 2024 1★); 한 화면에 다 보이던 뷰를 쪼개는 리디자인(iPad 판 종료 1★) |
| **Public.com** (iOS v5.4.1, 평가 8.5만) | 미국 리테일 멀티에셋(주식·옵션·채권·크립토·고금리 현금) + AI 에이전트 | 디자인 지향 리테일; 2025-06 소셜 피드 종료(«AI has cannibalized social») | **양쪽 · 기본 미상** ✎ — 현행 스크린샷 10장 중 7장 라이트 UI·3장 다크(Active Trading 표면); 1차 자료에 외관 토글·기본값 문서 없음(help 검색 «dark mode» 0건) | (추정) «터미널이 아닌 편집물» 톤: 흰 표면 + 딥블루 단색 + 세리프 숫자 | 흰 바탕(웹 body #fff), theme-color #00379a 딥블루. ✎ 모바일 주 CTA 는 **검정 필**(Trade·Checkout), 데이터 강조는 네이비 바·블루 링크, 다크 Active Trading 표면엔 teal/cyan. ✎ 옵션 상세 캔들·Bid/Ask 블록은 red/green 채움, 상태(Complete/Rejected) green/red — «등락색을 면으로 안 칠한다» 주장 철회 | 중 — «large, easy-to-read fonts», «clean, easy to scan… on the basic side»(리뷰 3건 일치) | 라인차트 위에 AI «Key moments» 주석을 직접 얹음; 종목 페이지 스와이프 → Alpha(자연어 리서치); **숫자에 세리프**(NerdWallet «Times New Roman-esque», 웹 Denton 300 + Inter). ✎ 옵션 상세엔 캔들, «Options rebate tracker» 아크 게이지 존재 | 로그인 후 홈 = **Portfolio 탭**(첫 하단 탭). 탐색·매수는 Markets 탭(지구 아이콘) → 종목 → 우하단 Buy/Trade. 소셜 피드 탭은 삭제, 그 사용사례(실적 콜 요약·일일 시장 업데이트)를 AI 콘텐츠로 대체 | «숫자만 세리프» + 단색 액센트로 터미널 톤과 구별되는 편집물 톤 — 라이트 표면을 검토할 때 가장 구체적 레퍼런스; **AI 를 탭이 아니라 데이터가 있는 자리에**(차트 위 Key moments, 스크리너 안 «Just ask»); 옵션 UI 를 조각(체인 열 커스터마이즈·Strategy Builder·Queue·Rolling)으로 나눠 밀도를 사용자가 올림 | 커뮤니티/소셜 피드(이미 공식 폐기된 설계); 기술지표·스트리밍·그릭스 없는 얕은 옵션 UI(StockBrokers 2026-07) — SIGNUM 핵심과 정반대 |

**2-8 이 2-6(테마 분포)에 더하는 것**

- 기준선 6종: 다크 전용 2(Unusual Whales·Bloomberg Terminal) · 양쪽 4(TradingView 라이트 기본 [확실], iSPEED 사용자 선택·다크 정본, Robinhood 기본 미문서화·공개 자료 전부 다크, Public 기본 미상·스크린샷 7/10 라이트).
- **SIGNUM 의 직접 경쟁(Unusual Whales)은 다크 전용**이고, 2-1 의 Quant Data 도 다크 기본 — 옵션 플로우·딜러 포지셔닝 축에서 라이트 기본은 MenthorQ 하나뿐이라는 2-6 #2 관측이 유지된다.
- 대중 리테일 브로커(Robinhood·Public·TradingView)는 라이트 쪽으로 기울지만, **세 곳 중 두 곳의 «라이트 기본»은 1차 자료로 확정되지 않았다**(팩트체커 강등). «스크린샷 ≠ 기본값» 이 이 절에서도 두 번 반복됐다.
- 2.5 판정에 미치는 영향: **없음.** (a) 를 지지하는 근거 1·2·8(정밀층 팔레트·glass 원인·실행 비용)은 기준선과 무관하고, 근거 3(카테고리 기억은 다크)은 Unusual Whales 로 오히려 강화된다. 단 Robinhood «Market hours» 테마와 Legend Aura(배경이 세션을 말함), iSPEED «이전 팔레트 유지» 옵션은 4·5단계의 개선 방향 후보로 넘긴다.
- ja 로케일 관습(赤=上昇)은 iSPEED 로 재확인 — LSEG Halo «지역 프로파일 토큰»(2-1 ③)과 함께 5단계 «값의 정직성/색» 항목의 근거가 된다.


---

## 2.5단계 — 테마 판정

> **방법 메모(디렉터).** 네 선택지 각각에 «가장 강한 옹호자» 에이전트를 붙여 캡처·코드·2단계 레퍼런스만으로 논거를 세우게 하고, 세 심사자(정밀층 판독 / 표현층·브랜드 / 실행 비용·리스크)가 논거의 **근거 등급**을 채점한 뒤 종합했다(에이전트 8, 도구 호출 150회). 아래는 그 종합이며 디렉터로서 검토·채택한다. 판정문 안의 인용 두 곳은 별도로 확인했다: OG 이미지 라우트 배경 `#06090f` 는 `src/app/api/og/{leaders,market,level}/route.tsx:21,12,16` 에 실재하고, 스플래시·상태바 `#050a14` 는 `capacitor.config.ts` SplashScreen/StatusBar 블록에 실재한다 [확실]. 판정문의 «심사 렌즈 픽셀 실측»(#121825→#15323e 틴트, slate-600 7회)은 심사 에이전트 측정값이라 [추정] 등급으로 읽을 것.
>
> **디렉터 검토 의견.** 결론 (a) 를 채택한다. 단 세 가지를 강조한다. ① 이 판정은 «지금 화면 유지»가 아니다 — «단일 다크의 의무» 6항이 이행되지 않으면 판정의 근거 1·2·5·6 은 성립하지 않는다. ② 근거 4(사용 시간대)는 푸시 시각에서 추론한 것이고 실제 세션 시각 분포는 없다. «판정의 전제 1»이 말하는 실측이 붙으면 재심한다. ③ (c) 를 기각한 이유는 «양쪽이 나쁘다»가 아니라 «순서»다 — 토큰이 UI 를 지배하기 전에 두 번째 팔레트를 여는 것이 위험하다는 것이고, 린트가 그린이 된 뒤의 (c) 는 정당한 후속 후보다.


**결론: (a) 다크 유지(단일) — 단, «지금의 다크를 그대로 두는 것»이 아니라 915개 색 리터럴을 ~40개 다크 토큰으로 수렴하고 콘텐츠층 glass 를 걷어내 «밤의 터미널»을 완성하는 것이며, 낮(07:00 KST 장마감 리포트·미국 주간) 판독은 아래 «단일 다크의 의무» 6항으로 방어한다.**

#### 판정 근거

1. **[확실] 현 정밀층 팔레트는 다크에서만 이미 AA 를 넘고, 라이트는 «토글»이 아니라 «두 번째 팔레트»다.** 앱 표면 라벨을 지배하는 텍스트 토큰 `--text-muted #94a3b8`(var 192회 + 리터럴 71회, DESIGN_REBUILD_AUDIT.md 1-1)은 다크 카드 #121825 위 6.9:1 이지만 흰 배경 2.56:1·near-white #f1f1f5 위 2.28:1 로 실패한다. 시맨틱 4색도 같다 — 다크 카드 위 red 4.7 / green 7.0 / amber 8.3 / cyan 9.8 → 흰 배경 3.8 / 2.5 / 2.2 / 1.8(본 세션 WCAG 재계산, src/styles/app-tokens.css:12-22 코드값). (b)(d) 가 «재튠 없이 라벨이 좋아진다»고 든 slate-600 #475569 는 앱 표면 7회뿐이고 대부분 라벨이 아니다(심사 렌즈1 실측). 라이트 착지점으로 인용된 MenthorQ positive #009767 조차 흰 배경 3.73:1 로 미달이다. 즉 라이트는 텍스트 3단·시맨틱 4색·액센트·차트 팔레트를 전부 새로 뽑는 일이다.

2. **[확실] 캡처에서 실측된 라벨 대비 결함의 원인은 테마가 아니라 glass·틴트다.** `cmd_ZOOM-darkpool-tiles_17e` 에서 히어로 배경 스파크라인이 «시장 평균 41% −3.2%p» 텍스트 뒤를 관통하고, MAX PAIN / TOTAL PREMIUM 라벨의 실측 대비는 ~4.1–4.3:1 인데 라벨 색이 아니라 카드가 라디얼 틴트로 #121825→#15323e 까지 밝아진 탓이다(심사 렌즈1 픽셀 실측; cmd.module.css `.p2Card` 녹색 틴트 고정 :1225, backdrop-filter 5종 — 1-3). 불투명 near-black 카드 + glass 0 이 정밀층의 가장 큰 단일 개선이고, 이것은 테마를 하나 더 얹어도 안 고쳐지고 다크 하나 안에서 끝난다. HIG "Don't use Liquid Glass in the content layer"(step2_refs 2-4 첫 행)와 같은 방향.

3. **[확실] 레퍼런스 테마 분포(2-6):** 11개 중 단일 테마 3(Kalshi Pro·NTS·Tide Guide)·양쿽 8, 양쪽 8개의 기본값은 다크 3 : 라이트 5. 그러나 SIGNUM 이 서 있는 «데스크/터미널» 군(LSEG·Fiscal.ai·Kalshi Pro·Quant Data)은 4/4 다크 기본 또는 전용이고, 금융 6개 중 라이트 전용은 0 이다. 결정적 사실은 2-6 #2 — 옵션·딜러 포지셔닝 축의 유일한 라이트 기본 MenthorQ 3.0 조차 가이드·마케팅 이미지를 전부 다크로 찍어 조사자가 다크 단일로 오판했다. 이 카테고리에서 «기억되는 이미지»는 기본값이 라이트여도 다크다. 모바일 우선 대중앱(토스·Sofascore·Gentler Streak·Windy)이 라이트 기본인 상관은 인정하되, 모바일 우선·다크 단일 Tide Guide 가 2026 ADA Visuals 를 받았다(2-2 ⑤)는 예외가 «모바일=라이트» 를 법칙에서 관찰로 격하시킨다.

4. **[확실 — 시각 / 추정 — 조명] 사용 시간대는 갈려 있고, «살아 있는 데이터»는 밤에 있다.** vercel.json: 모닝브리프 12:10/13:10 UTC = 21:10/22:10 KST(한국 저녁, 08:10/09:10 ET 미국 아침), 장마감 리포트 22:00–22:40 UTC = 07:00–07:40 KST(한국 아침, 18:00 ET). 미국 정규장 = 22:30–05:00 KST. 실시간 플로우·GEX·FUTURES LIVE 글로우(`dash_default-top_17e` 의 LIVE 카드만 녹색 테두리 글로우, CLOSED 행은 무광)가 의미를 갖는 시간 전부가 한국의 밤이다. 아침 07:00 착지 화면(intel 장마감 리포트)은 텍스트 다이제스트라 조명 조건이 달라도 «Lc 높은 본문 15px+» 로 방어 가능한 종류다. 조명 환경 자체는 미측정(0-3 장중·실기기 미캡처)이므로 [추정].

5. **[확실] 정밀층 판독(대비·소형 라벨) 개선 항목은 전부 테마 중립이다.** slate-500 #64748b(75회, 3.7:1)·slate-600(2.3:1) 라벨 폐기, 11px 미만 내용 텍스트(flow 8px 30회·intel 10px 40회·guardian 9px 26회, 1-2 표) 상향, 3열 타일 라벨 줄바꿈으로 값 기준선이 어긋나는 결함(0-5 #6, `cmd_ZOOM-darkpool-tiles_17e`) — 어느 것도 라이트를 요구하지 않는다. NN/g 의 «밝은 환경·작은 글자에 양극성 유리»(2-4)는 «라이트를 추가하라»가 아니라 «다크에서 8~10px 와 2.3:1 을 없애라»로 읽는 것이 정밀층 우선에 맞다.

6. **[확실] 표현층·브랜드:** 현 조합(#06090f + purple→cyan 그라디언트 + glass)을 쓰는 레퍼런스는 0/11(2-6 #5). 다크를 택한 제품이 공유하는 것은 near-black + 순백 아닌 텍스트 + gradient/glass 0 이며, 여기에 «한 색만 살아 있게»(NTS red #e81717 LIVE 35회, Tide Guide 유일 red 점, Sofascore 알파 강조 — 2-2) 문법을 얹으면 FUTURES LIVE 글로우가 화면에서 유일하게 빛나는 것이 된다. 이 문법은 어두운 바닥에서만 성립한다 — 흰 배경에서 글로우는 소멸한다. 그리고 (a)만이 스토어 스크린샷(다크) → 스플래시 #050a14 → 첫 화면 → OG 3라우트 #06090f → 푸시 착지를 한 룩으로 유지한다(capacitor.config.ts:45-57, layout.tsx:36, og/*/route.tsx). 그라디언트 17~52개/화면을 «세션 상태 1색 + 방향 2색 + 브랜드 액센트 1색»으로 줄이는 것은 절제가 아니라 대비를 극대화하는 과감함이다.

7. **[확실] 플랫폼(iOS 26):** WKWebView 콘텐츠는 시스템 외관을 따르지 않고(`dash_LIGHT-top_17e` — 시스템 라이트에서도 전면 #0b111e 다크, 흰 배너와 시스템 대화상자만 라이트), 코드에 전환 메커니즘이 0 이다(1-9: prefers-color-scheme 0건·data-theme 0건·color-scheme 1건 marketing-console.css:32). iOS 26 이 «기억될 디자인»의 전제로 외관 추종을 요구하지 않음은 Tide Guide 의 Liquid Glass 쇼케이스 등재(2-2 ⑤)가 보여준다. 다크 단일의 플랫폼 의무는 «외관 추종»이 아니라 «계약 선언»이다 — 루트 `color-scheme: dark` 와 시스템 대화상자 외관 고정(아래 의무 ⑤).

8. **[확실] 실행 비용(915 리터럴):** 3,853개 리터럴(고유 915)·토큰 import 2곳(app-view/layout.tsx:12, onboarding/page.tsx:6)·같은 화면에 하락색 #ef4444 708 + #f43f5e 542 공존(`flow_default-mid_17e`, 1-A-3). 이 수렴은 네 옵션의 공통 선행 비용이지만, 남은 리터럴 하나의 결과가 옵션마다 정반대다 — (a)에서는 «지금 색 그대로»라 새 결함이 없고, 라이트를 지닌 (b)(c)(d)에서는 #f8fafc 텍스트·rgba(255,255,255,α) 표면 20종+ 이 «흰 글자/흰 카드»가 되어 값이 조용히 사라진다(이 코드베이스가 반복 출하한 «200 OK 빈칸»의 테마판). (a)는 «1토큰=1값»이라 자리마다 테마 판단이 없고 QA 표면이 1개(5탭 × 2기기 × CLOSED/LIVE/빈상태)다.

9. **[추정] 흰 AdMob 배너:** `firstrun_ZOOM-ad-over-content_17e` — 흰 ~50pt 띠가 ETF 변화율 칩 바로 아래를 오버레이. 크리에이티브 색은 광고주가 정하므로 어떤 테마도 흰 슬래브 자체를 없애지 못한다. 다크에서는 «화면 유일의 대면적 라이트 요소»(1-A-3)라 광고와 데이터가 혼동될 여지가 없다는 이점은 있으나 실측은 없다. (a)에서 할 일은 오버레이를 불투명 다크 «광고 선반»(예약 슬롯)으로 바꾸는 것이고, 이것으로 «해결»이라고 쓰지는 않는다.

#### 단일 다크의 의무 — 반대 조명 조건(낮·야외)에서 앱이 해야 할 것

1. 순흑 회피: 페이지 바닥 L*≥6(현 `--bg #0b111e` 유지), 카드는 +1단 불투명 near-black 1종 — 화면별 카드 베이스 5종(cmd rgba(22,32,54,0.45)·guardian rgba(10,14,20,0.85)·intel 그라디언트·flow rgba(15,23,42,0.78)·dash surface-1) 폐기, 콘텐츠층 backdrop-filter 0.
2. 텍스트 3단 전부 카드 위 ≥7:1(주 #f8fafc 16.9:1 유지 / 보조·라벨은 #94a3b8 6.9:1 이상으로 재정의), slate-500/600 라벨 폐기.
3. 크기 하한: 내용 텍스트 12px 이상, 눈썹 라벨 11px·600 이상, 11px 미만 0(flow 8px 30회·intel 10px 40회·guardian 9px 26회 전부 상향), 3열 타일 라벨 1줄 강제.
4. 07:00 KST 착지 화면(intel 장마감 리포트) 본문 15px 이상·APCA Lc≥75, 굵기 400 미만 금지.
5. 계약 선언: 루트 `color-scheme: dark`(웹뷰 내부 폼·스크롤바·셀렉트의 틈새 라이트 제거) + 앱이 띄우는 시스템 대화상자(ATT·알림 권한) 외관을 다크로 고정(`firstrun_01-att_17e` 의 «라이트 ATT 위 다크 게이트» 제거; Info.plist 현 상태는 [추정]·미검증) + 설정 시트에 «야간 데이터 판독용 다크 전용» 명시.
6. 검증 게이트: 실기기·고조도(야외 또는 최대 밝기)·07:00 KST 장마감 리포트 화면·17e/Pro Max·Dynamic Type +2단 — 0-3 이 «장중·실기기 미캡처»라 이 검증은 지금 0 이다. 여기서 실패한 화면은 출하 차단.

#### 기각한 선택지와 이유

**(b) 라이트 기본(단일)** — 가장 강한 논거는 맞다: QA 표면이 1개고, 흰 AdMob 배너·iOS 시스템 대화상자의 이질감이 사라지며, 1차 청중이 다른 손에 든 토스는 라이트고 40대 이상 43%다(2-6 #4). 그러나 단일 라이트는 22:30–05:00 KST 라이브 세션 사용자에게 흰 화면을 강제하고 도피처가 없으며, 지배 텍스트 토큰 #94a3b8(2.56:1)·시맨틱 4색 전부(1.8~3.8:1)·인용한 착지점 #009767(3.73:1)까지 흰 배경에서 미달이라 «재튠 강제»가 아니라 «팔레트 전면 신설»이다. 출하된 브랜드 자산 전부(스토어 3로케일·OG·스플래시·HQ 시안 워드마크)를 폐기하고 «다크 리스팅 + 라이트 첫 실행 = 다른 앱» 구간을 스스로 만들며, 이 카테고리의 기억은 라이트 기본 제품에서도 다크다(2-6 #2).

**(c) 양쪽 지원·다크 기본** — 가장 강한 논거를 인정한다: 한국 진입 시각의 절반(07:00 KST)이 아침이고, `dash_LIGHT-top_17e` 가 보여주는 «시스템은 라이트, 앱만 다크»를 없애는 유일한 구조가 OS 추종이며, 다크 기본이라 스토어·OG 자산 증분이 0 이다. 기각 이유는 안전성이 아니라 순서와 증거다: 토큰이 2개 파일에서만 살아 있는 지금 두 번째 값 세트를 얹으면 미이관 리터럴 하나가 라이트를 켠 사용자에게 «흰 글자/흰 카드»로 값을 지우고(근거 8), «(c)만 이관 완료를 검사 가능하게 한다»는 핵심 주장은 리터럴 금지 린트·픽셀 근접 매칭이 두 번째 테마 없이 같은 검사를 하므로 성립하지 않는다. 그리고 (c) 스스로 적은 실패 모드 «토글 미발견 → 효과 0»이 절충의 지문이다 — 비용(~40값 재튠·QA 97→190장·차트 팔레트 2벌·크롬 동적화)은 확정인데 행동 변화는 1회 안내의 효과 크기[추정]에 걸려 있고, 다크 쪽 라벨 결함의 실제 원인(glass 틴트)은 짚지 않았다. (c)가 하려는 일의 전부가 (a)를 선행 조건으로 갖는다 — 지금 (c)를 고르는 것은 (a)를 건너뛰는 게 아니라 첫 테마가 토큰의 지배를 받기 전에 두 번째 표면을 여는 것이다.

**(d) 양쪽 지원·라이트 기본** — 가장 기억될 아이디어를 낸 안이다(«라이트 화면 안에서 다크풀 카드만 유일한 다크 표면 → 앱 이름이 곧 디자인»), 시스템 추종으로 07:00 라이트/22:30 다크가 저절로 되고, 현 브랜드 세 기둥이 흰 배경에서 살 수 없어 표현층 재구축을 «강제»한다는 지적은 (a)의 가장 큰 실행 리스크와 정확히 맞물린다. 그러나 «재튠 없이 라벨 대비 3배»는 지배 텍스트 토큰에 대해 거짓이고(6.9→2.56), 가장 몰입한 야간 라이브 사용자가 «파생 테마»를 받으며, 네 옵션 중 절대 비용·파급이 최대(스토어 3로케일 재촬영·OG·스플래시 2벌·로고·액센트 폐기·QA ≈180장)라 실패 시 «두 번 바꾼 앱»이 된다. 21:10/22:10 KST 모닝브리프를 «밝은 환경»으로 [확실] 처리한 것도 과대등급이다 — vercel.json 이 증명하는 것은 시각이지 조명이 아니다.

#### 이 판정이 바꾸는 사용자 행동

22:30 KST 미국장 개장에 어두운 방에서 앱을 켠 한국 사용자가 눈부심 없이 첫 3초에 시장 상태(Risk-On·선물 3카드·FUTURES LIVE 글로우 — 화면에서 유일하게 빛나는 것)를 읽고, 라벨 ≥7:1·8~10px→12px·불투명 카드 덕분에 17e 3열 타일의 MAX PAIN / GAMMA FLIP / TOTAL PREMIUM 세 값을 확대·재응시 없이 한 번의 시선 이동으로 비교하며, 스토어 스크린샷에서 본 그 화면이 그대로 열리므로 «다른 앱인가» 하는 첫 3초의 의심이 생기지 않는다.

#### 실패 가능성과 되돌리는 비용

- **실패 1 — 낮 사용자의 판독 불리(구조적).** 07:00–07:40 KST 장마감 리포트·출근길 야외, 미국 사용자의 08:10 ET 모닝브리프에서 양극성(밝은 바탕)이 유리하다는 NN/g 조건은 남는다. 의무 1~4·6 으로 방어하되 «라이트였다면 더 편했을» 사용자가 존재한다는 사실은 인정한다. 관측 지표: 스토어 리뷰의 «라이트 모드» 요청 빈도, 시간대별 세션 분포(현재 텔레메트리 없음).
- **실패 2 — 40대 이상·저시력 세그먼트의 halation.** 다크 위 얇은 밝은 글자는 빛번짐이 크다. 굵기 400 미만 금지·9px 이하 전면 제거·Dynamic Type +2단 검증(현재 미시도, 0-4)이 없으면 (a)의 «판독성 우선» 약속이 이 세그먼트에서 깨진다.
- **실패 3 — 가장 큰 실제 리스크: «더 좋게»가 «그대로»로 미끄러지는 실행 실패.** 토큰 수렴을 화면 단위로 끝내지 않으면 rose/red 공존·2.3:1 라벨·glass 카드가 남아 근거 1·2·5·6 이 전부 무효가 된다. 게이트: 앱 표면 색 리터럴 0 을 CI 린트로 강제(fail-closed), 화면별 고유 색 수를 픽셀 근접 매칭으로 재측정, 검사 단위는 화면(5탭 × 2기기 × CLOSED/LIVE/빈상태).
- **실패 4 — 흰 배너는 남는다.** 광고 선반으로 오버레이는 없애지만 흰 슬래브 자체는 광고주 소관이다.
- **되돌리는 비용: 최저.** 현 상태가 다크 단일이므로 되돌릴 테마가 없다. (a)의 산출물(토큰 수렴·불투명 카드·타이포 하한·color-scheme 선언·린트)은 전부 (c)의 선행 조건이라 매몰이 0 이며, 훗날 라이트를 얹는 비용(~40 두 번째 값 + 시맨틱 재튠 + QA 2배 + 스토어 자산 결정)은 지금 하는 것과 같고, 린트가 살아 있는 상태에서 하므로 «흰 글자/흰 카드» 회귀 위험은 지금보다 작다. (c)가 주장한 «라이브 운영 중 추가가 더 비싸다»는 비대칭은 성립하지 않는다 — 어느 변경도 라이브 운영 중에 한다. 반대로 (b)(d)로 갔다가 되돌리면 라이트 팔레트·스토어 3로케일·OG·로고·테마 상태 코드가 매몰되고 «바꿨다가 되돌린 앱»이 된다(Kalshi 소비자앱 2026-08 사례, 2-1 ⑥).

#### 판정의 전제 (무엇이 달라지면 결론이 바뀌는가)

1. **사용자 시간대 실측.** 지금은 vercel.json 의 푸시 시각만 있고 세션 시각 텔레메트리가 없다(0-3). 세션 시작 시각 히스토그램(푸시 탭 vs 자연 진입)을 붙여, 07:00–18:00 KST(또는 미국 주간) 진입이 전체의 1/3 을 넘으면 (c)로 전환한다 — (a)의 산출물이 그대로 (c)의 1단계이므로 전환 비용은 두 번째 값 세트와 QA 2배뿐이다.
2. **청중 축의 이동.** 브랜드 브리프의 1차 청중이 한국 리테일에서 미국(en)으로 바뀌면 두 푸시(08:10 ET·18:00 ET)가 전부 주간이 되어 근거 4 가 뒤집힌다.
3. **린트 그린.** 앱 표면 색 리터럴 0 이 CI 에서 유지되는 순간 근거 8 의 비대칭(잔존 리터럴의 «흰 글자/흰 카드»)이 사라진다 — 그때부터 (c)는 «절충»이 아니라 «~40값 + QA» 로 셀 수 있는 후속이 된다. 이 판정은 «(a) 지금, (c)는 린트 뒤에만 재심»이다.
4. **스토어 전환율·리뷰.** 스토어 리뷰에서 «라이트 모드» 요청이 상위 3 주제에 들거나, 라이트 스크린샷 A/B 가 전환 우위를 보이면 근거 3·6(카테고리 기억은 다크)을 재검한다 — 단 2-6 #2 는 반대 방향을 가리키므로 실측이 있어야만 움직인다.
5. **저시력·Dynamic Type 검증 실패.** 의무 6 의 실기기·+2단 검증에서 40대 이상 세그먼트의 halation 이 크기·굵기 하한으로 안 잡히면 그 세그먼트를 위해 (c)를 앞당긴다.
6. **광고 모델 종료.** 배너가 없어지면 근거 9 가 사라지지만 결론은 바뀌지 않는다 — 근거 1·2·8 이 독립적으로 (a)를 지지한다.

#### 심사 점수표 (3 렌즈 × 4 옵션)

| 렌즈 | (a) 다크 유지 | (b) 라이트 단일 | (c) 양쪽·다크 기본 | (d) 양쪽·라이트 기본 | 렌즈의 결정적 사실 |
|---|---|---|---|---|---|
| 정밀층 판독성 | **8** | 4 | 7 | 5 | 지배 텍스트 토큰 #94a3b8 이 다크 6.9:1 / 흰 2.56:1; 실측 라벨 결함의 원인은 glass 틴트(#121825→#15323e), 테마 아님 |
| 표현층·브랜드 기억 | **8** | 4 | 7 | 5 | 2-6 #2: 라이트 기본 MenthorQ 조차 기억은 다크로 판다; Tide Guide(모바일·다크 단일) ADA 2026 Visuals |
| 실행 비용·리스크 | **9** | 4 | 6 | 3 | 잔존 리터럴 1개의 결과 — (a) «지금 색 그대로» vs (b)(c)(d) «흰 글자/흰 카드» 조용한 값 실종 |
| 합계 (30) | **25** | 12 | 20 | 13 | — |
| 근거 등급 | 11 확실 / 2 추정 | mixed | mixed | mixed(15 중 5 추정) | — |

(a)와 (c)의 5점 차는 «안전함»이 아니라 순서에서 난다 — (c)가 하려는 모든 일이 (a)를 먼저 요구하고, (a)를 끝낸 뒤의 (c)는 지금의 (c)보다 싸고 덜 위험하다.
---

## 3단계 — 평가 기준

> **방법 메모(디렉터).** 세 렌즈(정밀층 판독·기본기 / 기능 전달·신뢰·판단 흐름 / 표현층 개성·2026 언어)로 각각 6~8개 초안을 세우고(24개), **초안이 인용한 출처 24건 전부를 별도 에이전트가 원문을 열어 반박 시도**(refuted 0·접근 불가 0, 축소 해석 9건은 «제외한 출처» 절에 기록)한 뒤 10개로 병합했다(에이전트 28, 도구 호출 196회). 요건 대조: 기준 수 10(6~10 ✓) · 측정 가능(모두 측정 절차 + 수치 합격선 ✓) · 표현층 기준 3개(#6 정보 향기, #8 식별성, #9 표현 문법 ✓) · «기능이 제대로 전달되는가» 2개(#5 라벨 언어·전문어, #6 정보 향기 ✓) · «이 앱만의 것이라고 알아볼 수 있는가» 1개(#8 ✓). 층 분포: 정밀층 2(#1·#4) · 표현층 3(#6·#8·#9) · 양쪽 5(#2·#3·#5·#7·#10).
>
> **적용 시 한계(미리 밝힘).** #6·#8 은 평가자 5인 패널을 요구한다. 4·5단계를 내가 단독으로 수행할 때는 «디렉터 1인 + 블러 이미지 실측» 으로 대체하고 그 결과는 [추정] 등급을 넘지 못한다 — 대표가 패널을 붙일 수 있으면 [확실] 로 승격된다. #3 의 60fps 녹화·#10 의 접근성 설정 4종은 시뮬레이터에서 실행 가능하므로 4·5단계에서 실측한다. #4 의 «비실측 값 구별» 은 코드 확인 목록(1-B)이 있어 실측 가능하다.

### 3단계 — 평가 기준 (10개)


| # | 기준 | 층 | 종류 | 무엇을 재나 | 측정 방법 | 합격선 | 출처 |
|---|---|---|---|---|---|---|---|
| 1 | 정밀 대비 — 텍스트 4.5:1 · 정보 그래픽 3:1 | 정밀층 | 판독성·기본기 | 가격·만기·단위·시각·축 라벨과 게이지·스파크라인·축·경계선이 «실제로 놓인» 배경 위에서 갖는 명도 대비 | 3x 캡처 글리프·인접 배경 픽셀 샘플링(그라디언트·글래스는 글자 위치 중앙색) + 코드 색 리터럴을 rgba .03~.06→#0b111e 알파 합성해 재계산, 24px/18.5px 크기 분류 | 일반 텍스트 ≥4.5:1 · 큰 글자 ≥3:1 · 정보 그래픽 ≥3:1(히트맵 <3:1 이면 셀 수치 필수, 경계 <3:1 이면 행 간격 ≥0.5×글자높이) · 정밀층 위반 0건, 1건이라도 <3:1 → 화면 불합격 | WCAG 2.2 SC 1.4.3 (+SC 1.4.11) |
| 2 | 정밀 조판 기본기 — 크기·말줄임·히트 타깃·tabular 정렬 | 양쪽 | 판독성·기본기 | 정밀 라벨 최소 크기, 라벨 잘림, 정밀 데이터 진입 컨트롤의 히트 영역, 숫자 폭·소수점·기준선 정렬 | font-size grep(rem→16px) + cap-height 역산 대조; 390·430pt 폭 말줄임 집계; 컨트롤 시각 박스 pt 실측 + 코드 히트 박스; 글리프 전진폭 차·소수점 x 편차·3타일 기준선 y 차 | 텍스트 ≥11pt·값 ≥13pt·8~10px 선언 0건 · 390pt 말줄임 0(명시 약어만) · 컨트롤 ≥44×44pt(28~44 는 간격 ≥12pt 조건부, <28 불합격) · 숫자 100% tabular·소수점 편차 ≤1px·기준선 차 ≤1pt·타일 라벨 2줄 0 | Apple HIG Typography (+HIG Accessibility, Butterick Practical Typography) |
| 3 | 데이터 우선 — 빈 화면·배너·탭바가 데이터를 앞서거나 덮지 않음 | 양쪽 | 신뢰·판단 흐름 | 콜드 스타트 무피드백 시간과, 배너·탭바·안전영역이 값·표 마지막 행·CTA·동의 흐름을 덮는 겹침 | 60fps 녹화 프레임 분석(T0 탭~T4 첫 탭 가능) + 5탭×스크롤 3위치×2기기 캡처 겹침 px, 온보딩·약관 배너 O/X, CTA 가시율, padding-bottom 코드 확인 | 무피드백 빈 화면 ≤1.0s · 첫 실측 수치 ≤10s 콜드/≤3s 웜 · 스켈레톤 ≥1 · 배너는 첫 수치 뒤 · 정밀 요소 겹침 0px(모든 위치) · 동의·온보딩 화면 광고 0 · CTA 가시율 100% · 빈 화면 >10s 또는 겹침 >0px 1프레임이면 불합격 | NN/g Response Times · Apple HIG Layout (+NN/g Most Hated Advertising Techniques) |
| 4 | 값의 정직성 — 기준 시각·세션 어휘·부호/영값·실측/합성 | 정밀층 | 신뢰·판단 흐름 | 숫자가 «언제의·어느 상태의·어느 방향의·실측인» 값인지 스스로 말하는가 | 수치 모듈별 기준 시각·시간대 표기 표, 세션 상태 «의미→표기» 표, −0.00·이중 부호 전수 카운트 + 포맷 유틸 입력 테스트, 비실측 값 A/B/C 분류 + ⓘ 출처 문구 | 수치 모듈 100% 기준 시각·ET 단독 0·상대시간은 24h 이내만 · 상태별 표기 1종·상태 토큰 100% 기준 시각 동반 · «−0.00»류 0건·부호 규칙 1종(▲ +1.40% 이중 부호 불합격)·마이너스 글리프 1종 · 구별 불가 비실측 값 0·정적 사회적 증거 0 | NN/g Trustworthiness in Web Design (+International Web Usability, Heuristic #4, MDN signDisplay) |
| 5 | 라벨 언어·미설명 전문어 밀도 | 양쪽 | 기능 전달 | ko 첫 화면 라벨이 UI 언어인지, 전문어가 같은 화면 안에서 설명되는지 | ko(대조 ja) 5탭 첫 뷰포트 라벨 전수 전사 → 비UI언어 비율, 뷰포트/1탭 거리 ⓘ 에 설명 없는 전문어 수, 권한 대화상자 사유 언어 | 미설명 전문어 ≤2/뷰포트 · 비UI언어 라벨 ≤20%(티커·고유명사 제외) · 권한 사유 100% UI 언어 · 한 뷰포트 ≥5 또는 >50% 면 불합격 | NN/g Plain Language Is for Everyone, Even Experts |
| 6 | 내비·섹션 라벨 정보 향기 — 5초 라벨 예측 테스트 | 표현층 | 기능 전달 | 탭바·섹션 헤더만 보고 아래 콘텐츠를 예측할 수 있는가 | 콘텐츠 마스킹 크롭을 평가자 5인에게 5초 노출 → 자유응답, 명사 일치 채점; 은유형 라벨의 콘텐츠 명사 부제 O/X | 탭바 5라벨 정답률 ≥80% · 섹션 헤더 평균 ≥70% · 은유형 라벨 100% 콘텐츠 명사 부제 · 탭바 라벨 ≤40% 1개면 불합격 | NN/g Information Scent |
| 7 | 첫 뷰포트 위계 예산 — what→so-what · 장식 면적 · 블러 첫 시선 | 양쪽 | 신뢰·판단 흐름 | 첫 화면이 값만 나열하는지, 해석이 상위 위계에 있는지, 장식·광고가 시선을 뺏는지 | 요소 what/why/so-what 태깅 + 픽셀 4분류(데이터·장식·크롬·광고) + σ=2% 블러 라플라시안 최대 블롭 판정 | so-what ≥1(위계 상위 3)·what:so-what ≤10:1·노출 단계 ≤2·잠금 so-what 미리보기 1줄 100% · 장식 8~20%·광고 ≤6% · 블러 첫 시선=핵심 데이터 ≥4/5탭, 광고 0탭 · so-what 이 광고 잠금 뒤에만 있으면 불합격 | NN/g Progressive Disclosure (+Google Expressive Design Research) |
| 8 | 식별성 — 흐려도 SIGNUM 인가 (블러 패널 + 서명 자산 그리드) | 표현층 | 개성·기억 | 세부를 지워도 경쟁 5앱과 구별되고 5탭이 한 앱으로 묶이는가, 반복되고 우리만 쓰는 요소가 있는가 | σ=2% 블러 30장 블라인드 패널(평가자 5인 식별·묶기) + 후보 요소 fame×uniqueness 사분면 | 평균 적중 ≥4/5·오검출 ≤1/인·5탭 중 ≥4 묶음 · Use-or-Lose ≥2·Avoid 면적 <50% · 적중 ≤2/5 또는 Use-or-Lose 0 이면 불합격 | Ehrenberg-Bass «Brands of Distinction» (+LukeW Squint Test) |
| 9 | 한 벌의 표현 문법 — 프레임·층·색/크기 토큰 | 표현층 | 2026 언어 | 카드·헤더·탭바가 한 규칙(서피스·테두리·반경·층 재질)을 쓰고, 의미 하나에 색·크기 하나인가 | 4튜플 픽셀 실측(ΔE2000<3, 반경 ±2px), 동심성 10쌍, 탭바 ΔL*, 하락/상승/경고/액센트 색 군집, hue·크기 고유값, 토큰 참조 비율 | 프레임 튜플 ≤2·반경 ≤3·헤더 패턴 ≤2·동심성 위반 ≤1/10 · 탭바 비침 ΔL≥2 5/5·콘텐츠 층 글래스 카드 0·기능 층 불투명 이물질 0 · 의미당 색 1(hue 차 불허)·hue ≤6·크기 ≤8·토큰 참조 ≥90% | Apple HIG Materials (+WWDC25 «Get to know the new design system», W3C Design Tokens Format Module) |
| 10 | 시스템 외관·설정 응답 — 다크 선언·200%·대비 증가·투명도 감소·동작 줄이기 | 양쪽 | 2026 언어 | 다크 전용 선택이 시스템에 선언되고, 접근성 설정 4종에 정밀층·표현층이 응답하는가 | 라이트 시스템에서 ATT·알림·공유 시트·키보드 캡처, 설정 ON/OFF 대조 캡처·3초 녹화, viewport·text-size-adjust·단위 grep, 200% 재캡처 | 라이트 시스템 표면 0(또는 라이트 외관 제공) · 대비 증가 ON 정밀 라벨 ≥7:1 · 투명도 감소 ON 반투명 0 · 동작 줄이기 ON 장식 루프 0(OFF ≤1) · 줌 잠금 0·상대 단위 ≥90%·200% 잘림·겹침 0 | Apple HIG Dark Mode (+WCAG 2.2 SC 1.4.4, HIG Accessibility, HIG Motion) |


---

**1. 정밀 대비 — 텍스트 4.5:1 · 정보 그래픽 3:1** (초안 «정밀 텍스트 대비» + «비텍스트 대비» 병합)
정의 — 정밀층 텍스트(가격·지표값·만기·단위·시각·표 헤더·축 라벨)와 값을 읽는 데 필요한 그래픽(RLSI 게이지 채움/트랙, 스파크라인 선, 축·눈금·0선·VWAP·MAX PAIN 마커, 히트맵 셀 경계, 표 구분선)이 실제 배경 위에서 갖는 대비율. 로고·비활성·순수 장식(시안 글로우·스캔라인·HUD 브래킷)은 채점 제외, 단 글로우가 겹친 지점은 겹친 픽셀로 측정.
측정 절차 — ① 5탭 첫 뷰포트 + Command/Flow 히어로·3타일·표·차트 축 3x 캡처에서 글리프 중심색과 인접 배경색을 샘플링해 WCAG 상대명도 공식으로 계산(Command 파란 글래스·Intel 네이비 그라디언트는 글자 위치 중앙색을 배경으로). ② 코드 교차검증: 텍스트·stroke·border 색 리터럴(#94a3b8·#64748b·#475569·#ef4444·#f43f5e 등)을 카드 rgba(255,255,255,.03~.06)→#0b111e 알파 합성 실효색과 대비. ③ 계산 font-size <24px(굵게 <18.5px)이면 일반 텍스트. 요소별 (색·배경·크기·대비율·합격) 표로 기록.
합격선 — 일반 텍스트 ≥4.5:1, 큰 글자 ≥3:1, 정보 그래픽 ≥3:1(히트맵 인접 셀 <3:1 이면 셀 안 수치 텍스트 필수; 표·타일 경계 <3:1 이면 행 간격 ≥ 글자 높이 0.5배). 정밀층 위반 0건, 한 요소라도 <3:1 이면 화면 불합격.
이 앱에서 왜 필요한가 — (10) slate-600 #475569 가 카드 위 2.3:1, slate-500 3.7:1 인데 둘 다 만기·단위·시각 라벨에 쓰이고, (1)(6) 카드 경계 rgba .03~.06 은 #0b111e 위 ≈1.1:1 이라 표·타일 구분이 여백에만 의존; 한국·일본 사용자는 야간(22:30~05:00 KST)에 본다.
출처 — WCAG 2.2 Understanding SC 1.4.3 (https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): "contrast ratio of at least 4.5:1 … Large-scale text … at least 3:1" — 18pt/14pt 굵게 ≈ 24px/18.5px; 부수적 텍스트·로고는 요건 없음. 보조: SC 1.4.11 Non-text Contrast (https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) — 내용 이해에 필요한 그래픽 부분 ≥3:1, 장식 제외.

**2. 정밀 조판 기본기 — 크기·말줄임·히트 타깃·tabular 정렬** (초안 «정밀 라벨 최소 11pt·말줄임 0» + «터치 타깃 44pt» + «Tabular 숫자·열/기준선 정렬» 병합)
정의 — 정밀층의 값·단위·만기·표 헤더·타일 라벨·축 눈금이 iOS 최소 가독 크기 이상으로 조판되고 잘리지 않으며, 정밀 데이터에 도달하는 컨트롤(서브탭·만기/필터 칩·표 행·섹터 카드·탭바·잠금 해제 CTA)이 최소 히트 영역을 갖고, 숫자가 tabular 로 세로 정렬되며 같은 행의 값이 한 기준선에 놓이는가.
측정 절차 — ① Dashboard·Guardian·Command/Flow·Intel 컴포넌트 font-size grep(rem 은 16px 환산) → 11px 미만 건수·위치; 3x 캡처 cap-height ÷3 ÷0.7 로 역산해 대조. ② 390pt·430pt 두 폭에서 «…»·clip 라벨 건수(선물 카드·3타일·표 헤더), `text-overflow: ellipsis`·`nowrap` 위치와 약어 규칙 유무. ③ 컨트롤 시각 박스 pt 실측 + 코드 height/padding/hit-slop 로 히트 박스 산출, 인접 간격 pt. ④ 같은 열 «1»/«0» 글리프 전진폭 차, TOP MOVERS·MACRO·WHALE·STRIKE 소수점 x 최대 편차, 3타일(MAX PAIN/GAMMA FLIP/TOTAL PREMIUM, RSI/VWAP/DAY RANGE) 값 기준선 y 차·라벨 줄 수; `tabular-nums`/모노 지정 범위와 숫자 셀 `text-align`.
합격선 — 정밀 텍스트 ≥11pt(8~10px 선언 0건), 값 본체 ≥13pt; 390pt 정밀 라벨 말줄임 0(명시 약어 규칙만 허용: NASDAQ 100→NDX); 컨트롤 ≥44×44pt(28~44 는 인접 간격 ≥12pt 조건부, <28 불합격); 정밀 숫자 100% tabular(폭 차 0px), 소수점 편차 ≤1px, 같은 행 기준선 차 ≤1pt, 타일 라벨 2줄 꺾임 0.
이 앱에서 왜 필요한가 — (3) 폰트 크기 고유값 82종, flow 8px 30회·intel 10px 40회, 17e 에서 GAMMA FLIP/TOTAL PREMIUM/DAY RANGE 라벨 2줄 꺾임으로 값 기준선 어긋남, 선물 카드 «NASDAQ10…» «RUSSELL2…» 말줄임이 두 기기 모두; (4) 값은 모노 tabular 라 합격 후보지만 표의 소수점 정렬은 미실측; (12) 첫 뷰포트 수치 21~25개 밀집에서 오탭은 곧 값 오독이다.
출처 — Apple HIG Typography (https://developer.apple.com/design/human-interface-guidelines/typography): iOS·iPadOS "17 pt (Default size) … 11 pt (Minimum size)" — Caption 2 = 11pt, 스크롤 영역에서 나머지를 볼 수단 없이 잘라내지 말 것(HIG 는 잘림 «최소화» 를 권고하므로 «0» 은 이 감사의 상향 기준). 보조: Apple HIG Accessibility (https://developer.apple.com/design/human-interface-guidelines/accessibility) "44x44 pt (default control size) … 28x28 pt (minimum control size)", 베젤 요소 약 12pt 여백; Butterick Practical Typography (https://practicaltypography.com/alternate-figures.html) "Tabular figures are essential for one purpose: vertically aligned columns".

**3. 데이터 우선 — 빈 화면·배너·탭바가 데이터를 앞서거나 덮지 않음** (초안 «최초 실행 피드백» + «가림 없음 — 배너·탭바·안전영역» + «광고·잠금 요소의 콘텐츠 침범 0» 병합)
정의 — 시간축: 콜드 스타트에서 «시스템이 살아 있다» 신호와 첫 실측 수치까지의 시간, 그 사이 스켈레톤·진행 표시 존재. 공간축: AdMob 배너·플로팅 탭바·홈 인디케이터가 정밀 값·표 마지막 행·CTA·동의/온보딩 흐름을 덮거나 밀어내지 않는가. 둘 다 «데이터보다 먼저, 데이터 위에 서는 것이 없는가» 를 잰다.
측정 절차 — ① 17e·Pro Max 콜드/웜 스타트 60fps 녹화: T0 아이콘 탭, T1 첫 앱 픽셀, T2 첫 로딩 피드백, T3 첫 실측 수치, T4 첫 탭 가능; 무피드백 최장 연속 구간(초), 스켈레톤 장수·스피너 유무, 배너 첫 노출 시점과 T3 선후, 권한·동의 대화상자가 로딩을 가리는지. ② 5탭 × 스크롤 3위치(최상단·중간·최하단) × 2기기 캡처에서 배너·탭바 사각형과 가장 가까운 콘텐츠 사각형의 겹침 px, 정밀 요소를 덮는 프레임 수; 온보딩 1/2·2/2·약관 화면 배너 O/X; ValueWall CTA 가시 높이/전체 높이(%). ③ 코드: 스크롤 컨테이너 padding-bottom 이 탭바+배너+env(safe-area-inset-bottom) 을 포함하고 배너 로드 상태에 따라 갱신되는지, 배너가 예약 인셋인지 콘텐츠 위 오버레이인지.
합격선 — 무피드백 빈 화면 ≤1.0s, 10s 초과 구간 진행 표시 100%, 첫 실측 수치 ≤10s(콜드)/≤3s(웜), 스켈레톤 ≥1, 배너 노출은 첫 실측 수치 렌더 이후; 모든 스크롤 위치에서 정밀 요소 겹침 0px, 동의·온보딩·약관 화면 광고 0, CTA 가시율 100%, 하단 패딩 코드 보장. 불합격: 빈 화면 >10s, 또는 수치·표·차트 위 겹침 >0px 프레임 1개, 또는 동의 화면 위 광고 1회.
이 앱에서 왜 필요한가 — (8) 단색 스플래시 → 12초+ 완전 빈 다크 화면(스켈레톤 0장) → ATT → 동의 → 알림 → 대시보드인데 (7) 흰 배너 ≈50pt 는 3초 시점에 이미 떠 있어 «광고는 뜨는데 데이터는 없다» 는 첫인상을 만들고, 스크롤 중간 콘텐츠와 온보딩 약관 위를 덮으며 (9) Command AI 탭 ValueWall CTA 는 탭바 뒤로 잘린다 — 화면 유일의 대면적 라이트 요소가 데이터를 덮는다.
출처 — NN/g Response Times: The 3 Important Limits (https://www.nngroup.com/articles/response-times-3-important-limits/): "10 seconds is about the limit for keeping the user's attention focused on the dialogue" — 1초는 사고 흐름 한계, 10초 초과 작업은 완료 예상 피드백·퍼센트 진행 표시 권고. Apple HIG Layout (https://developer.apple.com/design/human-interface-guidelines/layout): 안전영역은 "the area within a view that isn't covered by a toolbar, tab bar, or other views" — 컨트롤·탭바는 콘텐츠 «위에» 얹히므로 레이아웃이 감안해야. 보조: NN/g Most Hated Advertising Techniques (https://www.nngroup.com/articles/most-hated-advertising-techniques/) — 452명 조사에서 모바일은 콘텐츠를 덮는 모달·로딩 중 콘텐츠를 밀어내는 인콘텐츠 광고가 다른 모든 광고보다 유의하게 더 싫어하는 형식.

**4. 값의 정직성 — 기준 시각·세션 어휘·부호/영값·실측/합성** (초안 «기준 시각의 사용자 시간대 번역» + «세션 상태 어휘의 단일성» + «부호·영값 표기 규범» + «합성·추정·데모 값의 출처 공개» 병합)
정의 — 화면의 숫자가 자기 자신에 대해 네 가지를 정직하게 말하는가: ⓐ 언제의 값인지(기준 시각이 사용자 시간대로 읽히는지), ⓑ 어느 세션 상태의 값인지(같은 상태가 한 표기로만 나타나는지), ⓒ 어느 방향인지(반올림 0 이 하락으로 읽히지 않고 부호 규칙이 하나인지), ⓓ 실측인지(추정·합성·데모·상수가 실측과 구별되는지).
측정 절차 — ⓐ 5탭 첫 뷰포트+스크롤 1회분에서 수치 모듈(가격 히어로·3타일·MACRO BOARD·TOP MOVERS·히트맵·RLSI·신용 스프레드·브리핑·뉴스·리포트)을 행으로, 기준 시각 존재 O/X · 시간대 표기{ET 단독/현지/오프셋 병기/없음} · 상대시간 24h 초과 시 절대일자 노출 · ko/ja 로케일 시각 형식을 열로 표 작성. ⓑ 5탭+서브탭(Guardian 4·Command 4·Flow 4·Intel) 캡처를 전사해 세션 상태 토큰 «의미→표기» 표, 상태별 변형 수(대소문자·아이콘·괄호 포함), 상태 토큰 옆 기준 시각 동반 O/X. ⓒ «−0.00»·«-0.0»·«+0.00» 문자열과 색 전수 카운트; 포맷 유틸 grep(toFixed·Intl.NumberFormat·signDisplay·Math.abs) 후 −0.004·−0·0·+0.004 입력으로 출력·색 분기 조건(`<0` vs `<=0` vs 반올림 후 판정) 확인; 부호 운반자(▲/▼, +/−, 색) 표와 마이너스 글리프(U+2212 vs 하이픈) 혼용 기록. ⓓ 코드 확인 비실측 목록(DEMO 스파크라인·NBBO Est.·스트라이크 더미·VWAP 합성·«오늘 14.2K 잠금해제» 상수)을 기준으로 캡처를 찍어 A=라벨 명시 / B=시각 구분만 / C=구별 불가 분류, 모든 ⓘ·툴팁의 출처 문구 유무.
합격선 — 수치 모듈 100% 기준 시각, ET 단독 0건(현지시각 또는 GMT/KST 오프셋 병기), 상대시간은 24h 이내만 단독; 상태별 표기 변형 1개, 상태 토큰 100% 기준 시각 동반; «−0.00»류 0건·반올림 0 은 무부호+중립색·변화율 부호 규칙 앱 전체 1종(«▲ +1.40%» 이중 부호 불합격)·마이너스 글리프 1종; C(구별 불가) 0건, 하드코딩 사회적 증거 0건, 정적 수치에 «오늘» 시제어 0건.
이 앱에서 왜 필요한가 — (13) «9/3, 22:14 ET»·뉴스 «6h» 만 있어 한국·일본 야간 사용자는 «어제 마감값인가 지금 값인가» 를 매번 환산해야 하고, (5) 같은 장마감이 CLOSED / MARKET CLOSED / POST (CLOSED) / ● CLOSED 네 가지, (4) «−0.00%» 적색·«▲ +1.40%» 이중 부호, (14)(9) DEMO 스파크라인·NBBO Est.·VWAP 합성·«오늘 14.2K» 상수가 실측과 같은 스타일 — 메모리의 «200 OK 인데 값은 19시간 전»·«avgDarkPool || 48» 사고는 화면에 단서가 없으면 사용자가 발견할 수 없음을 보여준다.
출처 — NN/g Trustworthiness in Web Design: 4 Credibility Factors (https://www.nngroup.com/articles/trustworthy-design/): "people appreciate when sites are upfront with all information that relates to the customer experience" — 4요인 중 Upfront Disclosure·Comprehensive/Correct/Current(원 조사는 가격·배송 등 상거래 정보 맥락; 데이터 출처 공개로의 확장은 이 감사의 적용). 보조: NN/g International Web Usability (https://www.nngroup.com/articles/international-web-usability/) "Time zone abbreviations (e.g, EDT) are not universally understood" — GMT 오프셋 병기, 주요 지역 현지시각 번역; NN/g Heuristic #4 (https://www.nngroup.com/articles/consistency-and-standards/) "should not have to wonder whether different words … mean the same thing"; MDN Intl.NumberFormat (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/NumberFormat) — signDisplay "auto"(기본) 는 −0 에도 부호, "negative" 만 −0 제외(MDN 은 이를 «결함» 으로 규정하지 않음).

**5. 라벨 언어·미설명 전문어 밀도**
정의 — 각 첫 뷰포트의 라벨이 UI 언어로 쓰여 있는지, 도메인 전문어(MAX PAIN·GAMMA FLIP·RLSI·NBBO·VWAP·DARK POOL)가 같은 화면 안(부제·ⓘ·범례·툴팁)에서 설명되는지. 라벨을 읽고도 «이 칸이 무엇인가» 를 모르면 값이 정확해도 기능이 전달되지 않는다.
측정 절차 — ko 로케일(대조군 ja) 5탭 첫 뷰포트 캡처에서 라벨 토큰(섹션 헤더·타일 라벨·탭·배지·시스템 대화상자 사유 문구 포함, 티커·고유명사 제외)을 전수 전사. ① 비UI언어 라벨 수 / 전체 라벨 수. ② 전문어 목록(옵션·마이크로스트럭처·자체 지표명) 중 같은 뷰포트 또는 1탭 거리 ⓘ 에 한 줄 설명이 없는 «미설명 전문어» 수. ③ ATT·알림 등 권한 대화상자 사유 문구 언어 = UI 언어 O/X.
합격선 — 뷰포트당 미설명 전문어 ≤2, 비UI언어 라벨 ≤20%, 권한 대화상자 사유 100% UI 언어. 불합격: 어느 한 뷰포트에서 미설명 전문어 ≥5 또는 비UI언어 라벨 >50%.
이 앱에서 왜 필요한가 — (5) 한국어 첫 화면에 영어 라벨 ≈20 vs 한국어 9(DARK POOL INTEL·MARKET PULSE·FUTURES LIVE·CLOSED·Risk-On·탭바 5개), (8) ATT 대화상자 사유가 영문, Command·Flow 3타일과 Guardian RLSI 는 설명 없는 전문어·자체 지표명 — 메모리의 「AI 해석이 이해가 안 된다」 지적이 라벨 층에서도 재현된다.
출처 — NN/g Plain Language Is for Everyone, Even Experts (https://www.nngroup.com/articles/plain-language-experts/): "even highly educated online readers crave succinct information that is easy to scan" — 과학·기술·의료 도메인 전문가 대상 정성 사용성 조사; «평이한 언어는 지적인 독자를 무시한다» 는 통념과 어긋남.

**6. 내비·섹션 라벨 정보 향기 — 5초 라벨 예측 테스트**
정의 — 탭바 라벨과 섹션 헤더만 보고 그 아래(또는 탭 이후)에 무엇이 나올지 예측할 수 있는가. 은유형 이름(Guardian·Command·Intel)은 기억에는 남지만 첫 방문자에게 정보 향기가 없어 탐색 실패를 만든다.
측정 절차 — 탭바 5라벨과 각 화면 섹션 헤더(MARKET PULSE·MACRO BOARD·DARK POOL INTEL·TOP MOVERS·SECTOR HEATMAP·RLSI·WHALE·STRIKE·ValueWall 카드 제목 등)를 콘텐츠를 가린 크롭으로 만든다. 목표 사용자 또는 대리 평가자 5명에게 5초 노출 후 «누르면/아래에 무엇이 보이나» 자유응답 → 실제 콘텐츠와 명사 수준 일치면 정답(라벨별 정답률). 병행 규칙 검사: 라벨이 콘텐츠 명사(«옵션 플로우»·«종목 상세»·«섹터»)를 포함하는지, 은유형이면 부제나 첫 화면 헤더가 콘텐츠 명사를 명시하는지 O/X.
합격선 — 탭바 5라벨 모두 정답률 ≥80%(4/5), 섹션 헤더 평균 ≥70%, 은유형 라벨 100% 콘텐츠 명사 부제 동반. 불합격: 탭바 라벨 중 정답률 ≤40% 1개 이상.
이 앱에서 왜 필요한가 — (11) 탭바가 Dashboard/Guardian/Command/Flow/Intel 영어 라벨이고 Guardian(리스크 게이지)·Command(종목 상세)·Intel(섹터·리포트)은 내용을 드러내지 않는 은유형, (8) 신규 안내·투어가 없어 라벨이 유일한 길잡이, (6) 헤더 구성이 5탭 전부 달라 학습 전이가 안 된다.
출처 — NN/g Information Scent (https://www.nngroup.com/articles/information-scent/): 링크 라벨은 "a succinct yet accurate description of what the page is about" — 서술이 사용자 목표와 맞아떨어질 때 정보 향기가 높아져 클릭하고, 모호한 라벨은 좋은 정보원을 놓치게 한다.

**7. 첫 뷰포트 위계 예산 — what→so-what · 장식 면적 · 블러 첫 시선** (초안 «판단 순서 위계» + «표현 예산» 병합)
정의 — 첫 뷰포트가 값(what)만 나열하는지, 해석·행동 단서(so-what)가 상위 위계에 하나 이상 있고 근거(why)는 요청 시 펼치는 구조인지; 비데이터 표현(글로우·스캔라인·그라디언트·배경 스파크라인·브래킷)의 면적이 «무난» 과 «소음» 사이 과감한 대역에 있으며, 흐린 상태에서 첫 시선이 광고·장식이 아니라 핵심 데이터에 가는지.
측정 절차 — ① 5탭 첫 뷰포트(17e) 요소를 시각 위계(크기·대비·위치) 순으로 번호 매기고 what/why/so-what 태깅: what 개수, so-what 개수·위계 순위, so-what 미존재 시 도달 탭 수와 광고 잠금 여부, 잠금 so-what 의 헤드라인 미리보기 O/X. ② 같은 캡처를 픽셀 4분류 — (a) 정밀 데이터 (b) 표현층 장식 (c) 크롬·여백 (d) 광고 — 비율 산출. ③ σ=짧은 변 2% 블러 후 라플라시안 분산 최대 블롭 위치가 (a)/(b)/(d) 중 어디인지 판정. (CTA 가림은 기준 3 에서 채점.)
합격선 — 5탭 모두 첫 뷰포트 so-what ≥1(위계 상위 3), what:so-what ≤10:1, 노출 단계 ≤2(첫 화면 + 요청 시 1단계), 잠금 so-what 미리보기 1줄 이상 100%; (b) 장식 8~20%(<8% «무난·제네릭» 결함, >20% «소음» 결함), (d) 광고 ≤6%; 블러 최대 블롭 = 핵심 데이터(32px 가격·RLSI 게이지·MARKET PULSE 그리드) ≥4/5탭, 광고 배너 0탭. 불합격: so-what 이 광고 잠금 뒤에만 있는 화면 1개 이상.
이 앱에서 왜 필요한가 — (12) 첫 뷰포트 수치가 Dashboard 21·Guardian 23·Command 25·Flow ≈20 으로 what 이 압도하고 Command AI·QUANT·HOLDERS 와 Flow AI INTEL 이 광고 잠금; (15)(6) 장식이 Guardian 에만 몰려 탭 간 표현 예산 편차가 크고 (7) 흰 배너가 유일한 대면적 라이트 요소라 블러 시 첫 시선을 독점할 위험.
출처 — NN/g Progressive Disclosure (https://www.nngroup.com/articles/progressive-disclosure/): "Initially, show users only a few of the most important options." — 파워와 단순함을 동시에 만족시키는 «가장 좋은 방법 중 하나», 노출 단계 2단계 초과 시 사용성 저하(합격선 «≤2» 의 근거). 보조: Google Design, Expressive Design: Google's UX Research (https://design.google/library/expressive-material-design-google-research) — 46건·18,000명, 핵심 UI 요소 최대 4배 빨리 발견, 단 "No amount of expressive design will beat basic functionality".

**8. 식별성 — 흐려도 SIGNUM 인가 (블러 패널 + 서명 자산 그리드)** (초안 «블러 식별 패널» + «서명 자산 그리드» 병합; 이 목록의 유일한 «이 앱만의 것» 기준)
정의 — 문자·수치 세부를 지운 뒤 남는 형태·색 덩어리·배치만으로 경쟁 앱과 구별되고 5탭이 «한 앱» 으로 묶이는가; 브랜드명·로고를 제외하고 이 앱을 떠올리게 하는 시각 요소가 «자주 나오고(fame)» «우리만 쓰는가(uniqueness)». 블러 상태에서 경쟁 앱과 섞이면 «제네릭 다크 핀테크» 다.
측정 절차(테스트 프로토콜) — ① 5탭 첫 뷰포트(17e 390×844 @3x)에서 상태바·브랜드 문자·로고를 마스킹하고 가우시안 블러 σ=짧은 변 2%(≈24px @3x). 경쟁 5앱(Robinhood·Webull·Yahoo Finance·Unusual Whales·토스증권) 동급 화면 각 5장을 같은 처리 → 총 30장 무작위 배열. 앱을 60초만 훑어본 평가자 5인이 (a) SIGNUM 5장 골라내기 (b) 같은 앱끼리 묶기; 인당 적중(0~5)·오검출·SIGNUM 5탭이 한 묶음에 든 수 기록. ② 5탭+온보딩 2장+ValueWall 잠금 카드에서 브랜드 문자를 가리고 후보 요소(HUD 코너 브래킷·스캔라인·시안 글로우·amber conic 자물쇠·플로팅 아일랜드 탭바·32px 모노 가격·3×3 MARKET PULSE 그리드·그라디언트 CTA) 열거; 각 fame = 등장 탭 수(0~5), uniqueness = 경쟁 5앱 중 거의 같은 처리가 보이는 앱 수(0~5) → 사분면 Use-or-Lose(fame≥3 & uniq=0) / Invest(fame≤2 & uniq=0) / Avoid(uniq≥1) / Test.
합격선 — 평균 적중 ≥4/5 AND 오검출 ≤1/인 AND 5탭 중 ≥4탭 한 묶음 AND Use-or-Lose ≥2 AND Avoid 요소가 첫 뷰포트 표현층 면적 50% 미만. 평균 적중 ≤2/5 → «경쟁 앱과 구별 불가» 불합격; 묶음 ≤3탭 → «내부 일관성 결함» 별도 불합격; Use-or-Lose 0 → «기억될 자산 없음» 불합격(Invest 요소는 확장 후보로 기록).
이 앱에서 왜 필요한가 — (1) #0b111e + 시안/녹/적 액센트는 다크 핀테크 표준형이라 블러 시 경쟁 앱과 같은 덩어리가 되고, (6)(15) HUD 브래킷·스캔라인은 Guardian 한 탭뿐(fame=1), 시안 글로우·그라디언트 CTA 는 경쟁도 쓰는 어법, 5탭에 반복되는 요소는 플로팅 탭바 정도; (7) 블러 후 «앱의 서명» 이 흰 광고 배너가 될 위험, (8) 첫 실행 12초 빈 화면·동의 2장에 서명 노출 0.
출처 — Ehrenberg-Bass Institute, Jenni Romaniuk, Brands of Distinction (https://marketingscience.info/brands-of-distinction/ — http 에서 https 로 수정): "few managers can identify the distinctive assets of their brands, let alone quantify their strength" — 고유 자산 = unique(그 브랜드만 떠올림) + famous(모두가 알아봄), Distinctive Asset Grid. 보조: LukeW, Evaluating User Interfaces with the Squint Test (https://www.lukew.com/ff/entry.asp?2013=) "blur the design just enough to quickly identify if the important elements stand out" — 블러 후 «색 덩어리만 남는다» 는 표현은 원문이 아닌 이 감사의 추론.

**9. 한 벌의 표현 문법 — 프레임·층·색/크기 토큰** (초안 «한 벌의 프레임 문법» + «층 분리» + «의미 하나에 색 하나» 병합)
정의 — 콘텐츠 층 컨테이너(카드·타일·헤더)가 앱 전체에서 한 벌의 규칙(서피스·테두리·코너 반경·장식)을 쓰고 중첩 반경이 동심으로 맞물리는가; 기능 층(탭바·헤더)은 뒤가 비치는 재질로 떠 있고 콘텐츠 층은 글래스를 쓰지 않는가; 같은 의미(상승·하락·경고·액센트)와 같은 역할(라벨·값·제목)에 색·크기 값이 단 하나인가. 탭마다 다른 프레임은 «다섯 개의 앱» 으로 기억된다.
측정 절차 — ① 5탭 첫 뷰포트 모든 카드·타일·헤더의 4튜플(배경색·알파, 테두리색·두께, 반경 px @3x, 장식 모티프) 픽셀 실측(색 ΔE2000<3 동일, 반경 ±2px) → 고유 튜플·고유 반경·헤더 패턴 수; 중첩 도형 10쌍에서 내부 반경 = 외부 반경 − 패딩(±2px) 확인. ② 밝은 카드가 탭바 아래를 지나는 두 스크롤 위치에서 탭바 내부 동일 좌표 20점 평균 L* 차 ΔL(≥2 = 비침); 콘텐츠 층 카드 중 반투명 백드롭·글래스 처리 수; 탭바 상단 120pt 내 시스템 외 불투명 표면 수. ③ «하락» 픽셀(−·▼·적색)을 ΔE2000<3 로 군집 → 고유 색 수, 상승·경고·액센트 동일; 표현층 고유 hue(±8°) 수; 대문자 소제목·값·제목 캡하이트로 고유 크기 수; 코드 색 리터럴의 토큰 변수 참조 비율.
합격선 — 카드 프레임 고유 튜플 ≤2(기본+강조), 코너 반경 고유값 ≤3, 헤더 패턴 ≤2(홈형·상세형), 동심성 위반 ≤1/10; 탭바·헤더 ΔL≥2 5/5탭, 콘텐츠 층 글래스 카드 0, 기능 층 영역 시스템 외 불투명 이물질 0(광고는 콘텐츠 층 예약 공간에); 의미당 고유 색 1(알파 변형만, hue 차 불허 — #ef4444 와 #f43f5e 공존 불합격), 표현층 hue ≤6, 첫 뷰포트 텍스트 크기 고유값 ≤8, 토큰 참조 ≥90%.
이 앱에서 왜 필요한가 — (6) 대시 3% 투명 서피스 / Guardian 반투명+HUD 브래킷·스캔라인 / Command 파란 글래스+녹색 라디얼 / Intel 네이비 그라디언트 22px — 5탭 5종 프레임에 헤더도 전부 다르고 Command 콘텐츠 카드가 글래스라 층 구분이 흐려짐; (2) 색 리터럴 3,853/고유 915, 토큰 import 2곳, 하락 #ef4444·#f43f5e 와 녹색 3종 공존 픽셀 실측; (3) 폰트 크기 82종.
출처 — Apple HIG Materials (https://developer.apple.com/design/human-interface-guidelines/materials): "Don't use Liquid Glass in the content layer." — 기능 층은 콘텐츠 위에 떠 위계를 만들고, 콘텐츠 층 글래스는 위계를 혼란시키며 맞춤 컨트롤엔 아껴 쓸 것. 보조: WWDC25 Get to know the new design system (https://developer.apple.com/videos/play/wwdc2025/356/) — 동심 반경 = 부모 반경 − 패딩, "Rely on layout and grouping to express hierarchy rather than unnecessary decoration"; W3C DTCG Design Tokens Format Module (https://www.designtokens.org/TR/drafts/format/) — "expressing design decisions in a platform-agnostic way so that they can be shared", 단일 원천.

**10. 시스템 외관·설정 응답 — 다크 선언·200%·대비 증가·투명도 감소·동작 줄이기** (초안 «다크 전용이라면 끝까지» + «텍스트 200% 확대 대응» + «모션 언어» 의 설정 응답 부분 병합)
정의 — 다크 전용을 택했다면 그 선택이 시스템에 선언되어 시스템 대화상자·시트·키보드가 같은 외관으로 뜨는가; 사용자가 텍스트를 200% 키우거나 «대비 증가»·«투명도 감소»·«동작 줄이기» 를 켰을 때 정밀층·표현층이 응답하는가 — 적응형 외관의 최소 요건.
측정 절차 — ① 시스템 라이트 모드에서 ATT·알림 권한·공유 시트·키보드가 앱 위에 뜨는 4장면 캡처 → 앱과 외관이 다른 시스템 표면 수. ② «대비 증가» ON/OFF 캡처 대조(라벨·테두리 픽셀 변화), «투명도 감소» ON 에서 탭바·글래스 불투명 전환 여부, «동작 줄이기» ON/OFF 정지 화면 3초 녹화로 상시 반복 장식 모션 수·진폭. ③ 코드: viewport `user-scalable=no`/`maximum-scale=1`, `-webkit-text-size-adjust`, 정밀 font-size 상대 단위 비율, 고정 height+overflow:hidden 정밀 컨테이너 수. ④ iOS «더 큰 텍스트» 최대 또는 텍스트 200% 로 Command 히어로·3타일·TOP MOVERS·STRIKE 표 재캡처 → 잘림·겹침·기준선 붕괴 건수(불가 시 ③만으로 판정하고 «미검증» 표기).
합격선 — 라이트 시스템 표면 0(UIUserInterfaceStyle=Dark 선언) 또는 앱이 라이트 외관 제공; «대비 증가» ON 모든 정밀 라벨 ≥7:1(OFF 도 ≥4.5:1 — 기준 1 과 연동); «투명도 감소» ON 반투명 표면 0; «동작 줄이기» ON 장식 루프 0(OFF 에서도 동시 ≤1); 줌 잠금 선언 0, 정밀 font-size 상대 단위 ≥90%, 잘림 위험 정밀 컨테이너 0, 200% 재캡처 잘림·겹침 0.
이 앱에서 왜 필요한가 — (1) 시스템 라이트로 바꿔도 다크 유지, prefers-color-scheme 0건 — 미국 사용자는 주간에 쓰는데 선언 없는 다크 고정이고 (8) ATT 대화상자가 앱 위에 뜨는 지점에서 외관 불일치가 드러나며, (10) #475569 2.3:1·#64748b 3.7:1 라벨은 다크 전용 최소 대비 미달, (3) px 고정 82종·8~10px 라벨이라 확대가 유일한 구제책인데 웹뷰는 시스템 텍스트 크기를 자동으로 따르지 않고, (15) 스캔라인·글로우가 상시 장식 모션 후보다.
출처 — Apple HIG Dark Mode (https://developer.apple.com/design/human-interface-guidelines/dark-mode): "strive for a contrast ratio of 7:1, especially in small text" — 사람들은 모든 앱이 외관 선택을 따르길 기대, 다크 전용은 UI 가 물러나야 하는 드문 경우, Increase Contrast·Reduce Transparency 를 켠 상태로 판독성 검증. 보조: WCAG 2.2 SC 1.4.4 Resize Text (https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) "text can be resized without assistive technology up to 200 percent", ACT 규칙 «Meta viewport allows for zoom»; Apple HIG Accessibility "ensure your app or game responds by reducing automatic and repetitive animations"(Reduce Motion 문구는 Motion 페이지가 아닌 이 페이지 소재); Apple HIG Motion (https://developer.apple.com/design/human-interface-guidelines/motion) "Add motion purposefully, supporting the experience without overshadowing it."

---

### 제외한 출처

- **반박(refuted) 0건 · 접근 불가 0건.** 24개 초안의 출처 전부 원문 확인. Apple HIG 6쪽(Typography·Accessibility·Layout·Materials·Dark Mode·Motion)은 HTML 이 JS 셸이라 같은 페이지의 data JSON 으로 본문을 확보했고, marketingscience.info 는 http→https 로 승격돼 표기 URL 을 수정했다.
- **병합으로 표에서 «보조» 로 내려간 출처(측정 항목은 유지):** WCAG 1.4.11 → 기준 1 · Apple HIG Accessibility(44pt)·Butterick → 기준 2 · NN/g Most Hated Advertising Techniques → 기준 3 · NN/g International Web Usability·Heuristic #4·MDN signDisplay → 기준 4 · Google Expressive Design Research → 기준 7 · LukeW Squint Test → 기준 8 · WWDC25 356·Design Tokens Format Module → 기준 9 · WCAG 1.4.4·HIG Accessibility(Reduce Motion)·HIG Motion → 기준 10.
- **검증에서 축소돼 원문 그대로 쓰지 않은 주장:** MDN 은 −0 표기를 «결함» 이라 하지 않음(옵션 의미만 서술) · Squint Test 원문에 «색 덩어리만 남는다» 없음(이 감사의 추론) · Progressive Disclosure 는 «가장 좋은 방법 중 하나» 이며 2단계 초과를 경고(합격선 ≤2 로 반영) · Response Times 의 진행 표시는 «필수» 아닌 «권고» · Trustworthy Design 의 조사 맥락은 가격·배송 등 상거래 정보(데이터 출처 공개로의 일반화는 이 감사의 적용) · Plain Language 는 참가자 수 미기재 정성 조사 · Hated Ads 는 데스크톱에서 4자 공동 1위, 모바일에서만 두 형식이 단독 최상위 · Motion 페이지에 Reduce Motion 문구 없음(Accessibility 페이지로 귀속) · Typography 는 잘림 «최소화» 권고(«말줄임 0» 은 이 감사의 상향 기준) · WCAG 1.4.3 은 부수적 텍스트·로고 예외를 둠(채점 제외로 반영).
- **이번 회차 측정에서 뺀 항목:** «모션 언어» 초안의 전이 지속 200~400ms·하드컷 0 — 브리프에 모션 관측 기록이 없어 근거 없는 합격선이 되므로 보류; 60fps 전이 녹화가 확보되면 기준 10 에 추가한다.
---

## 4단계 — 첫 화면 집중 감사 (Dashboard)

> **승인 기록.** 대표가 2026-09-04 「승인한다. 4단계 진행해라」로 승인. 이하 4·5단계는 승인 후 작업이다.
>
> **방법.** ① 추가 실측(0-5 항목 16~21): 재실행 타임랩스, 접근성 설정 2종, 픽셀 대비, 면적 4분류, σ2% 블러, 스파크라인 출처 코드 추적. ② 첫인상 패널: 서로 다른 평가자 3인(한국 40대 서학개미 / 미국 옵션 트레이더 / 디자인 디렉터)이 캡처 7장만 보고 «3초에 읽힌 것·이 앱이 무엇인가·먼저 누를 것·혼란·신뢰/불신 신호·블러 후 기억»을 독립 기록 → 회의론자 3인이 캡처를 다시 열어 **주장마다 사실 검증**(반박 12건·확인 80여 건). ③ 지적 목록: 차원별 발굴 35건 → 지적마다 독립 검증자가 캡처· 을 다시 열어 반박 시도 → **34건 채택 · 1건 반박**(4-2-7 — 초안의 «3단계 반복» 전제가 코드로 반증돼 문안·심각도를 다시 씀, 해당 항목에 표시). ④ 재설계: 3안 경쟁 → 3렌즈 심사 → 2안. 패널은 «5인 평가자» 기준(3단계 #6·#8)에 못 미치므로 패널 결과는 [추정] 상한, 픽셀·코드로 재확인한 항목만 [확실].
>
> **첫 화면 정의.** 신규·재방문 모두 `/app-view/dash` 에 착지(코드·캡처 동일). 실제 첫 화면은 광고 배너가 포함된 `firstrun_10-landing-20s_17e`; 배너 없는 상태는 `dash_default-top_17e`.

### 4-0. 첫 화면 기본기 (3단계 기준 #1·#2·#3·#4·#10)

> 4-1 이 «무엇이 읽히는가»라면 이 절은 «읽을 수 있는 상태인가»다. 열 건 모두 캡처 또는 `파일:라인`으로 검증됐고, 검증자가 반박한 1건(첫 실행 스플래시 로고 유무)은 절 끝에 남겼다.

**4-0-1. MARKET PULSE 스파크라인 9장 전부가 하드코딩 DEMO 배열 — «오늘의 흐름»처럼 보이는 선이 데이터가 아니다 — [정밀층] [확실] · 심각도 높음 · 비용 중 · 기준 #4 (+#3)**
- **관측:** dash_default-top_17e 의 9카드 스파크라인이 전부 상수: 현물 DEMO_INDICES[i].spark(page.tsx:107-109), 선물 DEMO_FUTURES[i].spark(:1293-1295), ETF DEMO_ETFS[i].spark(:1498-1518); Sparkline.tsx:10-44 는 받은 배열을 그대로 폴리라인으로 그린다. 캡처에서 S&P500 F 와 S&P 500 의 선 모양이 동일하고 NASDAQ100 F 와 DOW 가 동일. S&P500 F 카드는 «▼ −0.00%» 적색인데 스파크라인은 «우상향하는 적색 선» — 색은 오늘 값, 모양은 데모라 한 카드 안에서 서로 모순. 같은 파일 :1274-1278 주석은 «가짜 숫자는 빈칸보다 나쁘다»고 선언하며 숫자 폴백은 지웠지만 선은 남겼다. 선 슬롯은 카드 104px 중 26px(.pulseSparkline height 20 + margin-top 6, dash.module.css:361-366) — 첫 뷰포트 데이터 면적 62.7% 의 약 1/4 이 비실측 그래픽이다. (`dash_default-top_17e` · `dash_ZOOM-pulse-cards_17e` · `dash_A11Y-textXXXL-top_17e` / `dash/page.tsx:107-109` · `dash/page.tsx:1293-1295` · `dash/page.tsx:1498-1518` · `components/app/Sparkline.tsx:10-44` · `dash/dash.module.css:361-366`)
- **바꾸는 사용자 행동:** 데모 선이 사라지고 그 자리에 «기준 시각»이 오면 → 사용자가 «오늘 흐름»을 선에서 읽으려다 실제 값과 어긋나는 경험을 하지 않고 → 숫자 하나하나가 언제·어느 상태의 값인지 알고 판단한다.
- **개선 방향 ①** 즉시 제거: 9카드에서 .pulseSparkline 을 삭제하고 카드 높이 104→78px 로 줄여 26px 를 카드 간 여백·다음 카드(MACRO BOARD) 노출로 환원한다. 색 대비(적색 카드+우상향 선) 모순도 함께 사라진다. — 트레이드오프: 3×3 그리드가 «표»처럼 평평해져 표현층 활력이 줄고, 카드가 낮아지면 첫 뷰포트에 MACRO BOARD 첫 행이 광고 배너 뒤로 들어간다(B-08 과 연동 필요). ／ **개선 방향 ②** **[과감]** 거짓 요소를 «없던 정직 요소»로 치환: 스파크라인 슬롯 20px 를 행 단위 «기준 시각 행»으로 바꾼다. 행 메타의 세션 상태(FUTURES LIVE/CLOSED) 옆에 이미 파싱하지만 화면엔 쓰지 않는 페이로드 updatedAt(page.tsx:259-275) 을 «21:14 ET» 로 렌더하고 카드 안 슬롯은 비운다. 기능 추가 없이(이미 받는 응답) #4 의 «기준 시각 100%» 와 «비실측 값 0» 을 한 자리에서 해결한다. — 트레이드오프: 9카드가 공유하던 균일한 시각 리듬이 사라지고 시각 정보는 행마다 1개뿐이라 카드 내부가 «값+칩» 두 줄로 단순해진다. · 실패 가능성: updatedAt 이 없는 페이로드(현물 지수 클로즈 경로)가 있으면 «—» 가 또 생긴다 → 그 행은 세션 라벨만 남기고 시각을 숨기는 규칙을 먼저 정해야 한다. · 되돌리는 비용: 소 — 슬롯 삭제이므로 되돌림은 CSS·JSX 수십 줄
- **출처:** 3단계 #4 — NN/g Trustworthiness in Web Design, Nielsen Heuristic #4(일관성·표준); #3 Apple HIG Layout

**4-0-2. 부호 규칙이 셋: «▲ +1.40%» 이중 부호, «▼ −0.00%» 음의 영, 시장 상태 «중립 +0.08%» — 한 화면에서 보합이 하락으로 읽힌다 — [정밀층] [확실] · 심각도 높음 · 비용 소 · 기준 #4**
- **관측:** dash_default-top_17e: S&P500 F 카드 «▼ −0.00%» 적색 테두리+적색 칩(반올림 전 chg −0.00x 를 `up: chg >= 0` 로 판정 — page.tsx:1288-1290; ETF 는 :1503-1506). 9카드 전부 «▲ +1.40%» 처럼 삼각형+부호 이중 표기(:1751, :1782, :1820 — `{p.up ? '▲' : '▼'} {p.up ? '+' : ''}…toFixed(2)`). 시장 상태 3박스는 fmtChg(:145-148) 가 0 에도 '+' 를 붙여 «중립 +0.08%» — 텍스트는 «중립», 숫자는 «+». 합격선 «−0.00 류 0건·부호 규칙 1종(이중 부호 불합격)» 대비 세 규칙이 공존한다. 마이너스 글리프는 toFixed 의 hyphen-minus(U+002D). (`dash_default-top_17e` · `dash_ZOOM-pulse-cards_17e` / `dash/page.tsx:145-148` · `dash/page.tsx:1288-1290` · `dash/page.tsx:1751` · `dash/page.tsx:1782` · `dash/page.tsx:1820`)
- **바꾸는 사용자 행동:** 부호 규칙이 1종(±, 영값은 무부호·중립색)이 되면 → 사용자가 «−0.00%»를 하락으로 읽지 않고 → 보합 세션에서 «선물이 밀린다»는 잘못된 방향 판단을 하지 않는다.
- **개선 방향 ①** 포맷터 1개로 통일: 반올림 후 부호 판정, Intl.NumberFormat signDisplay:'exceptZero', 0.00 은 회색 «0.00%», 마이너스는 U+2212 로 고정, 삼각형 글리프 제거(색+부호 글리프가 이미 방향을 두 채널로 전달). — 트레이드오프: 삼각형이 주던 «아이콘 크기의 방향 신호»가 사라져 칩이 작아 보이고, 색약 사용자는 +/− 글리프에만 의존한다(WCAG 1.4.1 상 충분). ／ **개선 방향 ②** **[과감]** 변동률 칩에서 방향을 빼내 카드 구조로 옮긴다: 카드 왼쪽 4px 세로 «방향 막대»(위쪽 채움=상승, 아래쪽 채움=하락, 중앙 점=보합) 가 방향을 말하고, 칩은 부호 없는 절댓값 «1.40%» 만 tabular 로 표기. 부호·영값·이중 표기 문제가 구조적으로 소멸하고 9카드가 한 세로선에서 방향을 비교된다. — 트레이드오프: 스크린샷·공유 시 절댓값만 실려 방향이 안 실린다; 막대 4px 는 #1 정보그래픽 3:1 을 넘기기 위해 채도가 높아져야 해서 «네온» 인상이 강해진다. · 실패 가능성: 막대가 카드 테두리 색과 겹쳐 «두 번 말하기»가 되면 테두리 색을 중립으로 되돌려야 한다 — 그러면 live 깜빡임(liveBlinkUp/Down, dash.module.css:312-334)의 색 기반도 재설계 대상. · 되돌리는 비용: 소 — 카드 CSS 1블록·칩 포맷 1줄
- **출처:** 3단계 #4 — MDN Intl.NumberFormat signDisplay, NN/g Trustworthiness in Web Design

**4-0-3. 첫 뷰포트에 8~10px 선언 9곳 + 뱃지 글자 5.5px — «지수 선물/CLOSED/시장 상태/NDX/500» 이 전부 최소 크기 미달 — [양쪽] [확실] · 심각도 높음 · 비용 중 · 기준 #2**
- **관측:** dash_ZOOM-pulse-cards_17e 에서 원형 뱃지 안 «FUT/NDX/500/DJI» 는 3배 확대에서야 읽힌다. 코드 선언: .brandSub 10px(dash.module.css:45-49 «DARK POOL INTEL») · .sessionPill 9px(:104-116) · MARKET PULSE 헤더 필 인라인 10px(page.tsx:1730 «FUTURES LIVE») · .pulseRowMeta span/em 10px(:1049-1054 — «지수 선물» «FUTURES LIVE» «CLOSED» «현물 지수» «ETF / 변동성») · .regimeKicker 10px(:1180-1186 «시장 상태») · .regimeNote 10px(:1209-1216) · .regimeMetric span 9px(:1250-1257 «선물/현물/리스크») · .symbolBadge 6px, .dow 7px, .nasdaq/.sp500 5.5px, .vix 8px(:254-291) · 탭바 라벨 10px(app-view.css:587-593). 합격선 «8~10px 선언 0건» 대비 9건, 그중 5.5px 는 텍스트 최소 11pt 의 절반. 실측 대비(FUTURES LIVE 8.6·CLOSED 5.0·시장 상태 6.4)는 통과하지만 크기 때문에 실효 판독성이 낮다. (`dash_ZOOM-pulse-cards_17e` · `dash_default-top_17e` / `dash/dash.module.css:45-49` · `dash/dash.module.css:104-116` · `dash/dash.module.css:254-291` · `dash/dash.module.css:1049-1054` · `dash/dash.module.css:1250-1257` · `dash/page.tsx:1730`)
- **바꾸는 사용자 행동:** 행 라벨과 세션 토큰이 11pt 이상이 되고 뱃지 글자가 사라지면 → 사용자가 «지수 선물 / 현물 지수» 행 구분과 어느 행이 LIVE 인지 눈을 가까이 대지 않고 읽고 → 지금 움직이는 값(선물)과 멈춘 값(현물)을 즉시 구분해 판단한다.
- **개선 방향 ①** 전 라벨 최소 11px 로 상향하고 letter-spacing 0.11em→0.06em 으로 폭을 보정; 뱃지 글자는 8px 이하이므로 뱃지 지름 14→20px + 글자 9→11px 로 확대하거나 글자를 뺀다. — 트레이드오프: 행 메타·카드 심볼 행이 각 +2~3px 높아져 3행 합계 약 +10px, 카드 라벨 «NASDAQ100 F» 말줄임이 한 글자 더 늘어난다(B-05 와 동시 처리 필요). ／ **개선 방향 ②** **[과감]** 라벨 «종»을 없앤다: 원형 텍스트 뱃지를 색+형태 부호(원=현물 지수, 마름모=선물, 링=ETF/변동성)로 바꿔 5.5~8px 글자를 폐지하고, 행 메타 «지수 선물 · FUTURES LIVE» 는 카드 위 한 줄이 아니라 3행 왼쪽 세로 레일의 아이콘 1개+세션 점(●/○)으로 옮긴다. 남는 텍스트 라벨은 카드 심볼(11px 800)과 값뿐이라 8~10px 선언이 0 이 된다. — 트레이드오프: 형태 부호는 학습이 필요하고 첫 방문 사용자에게 설명이 없다; 행 이름(«지수 선물»)이 화면에서 사라져 한국어 라벨 수(현재 9)가 더 준다. · 실패 가능성: 색약 사용자가 14px 원/마름모 차이를 못 읽으면 부호가 무력화된다 → 형태 크기 ≥16px·윤곽선 1.5px 를 조건으로 건다. · 되돌리는 비용: 소 — getSymBadge 컴포넌트 1개+CSS
- **출처:** 3단계 #2 — Apple HIG Typography(최소 11pt), HIG Accessibility

**4-0-4. 광고 배너와 유리 탭바가 값을 덮는다 — ETF 행 하단 절반이 광고 뒤, MACRO 값이 탭바 뒤에 반투명하게 잘려 보인다 — [양쪽] [확실] · 심각도 높음 · 비용 중 · 기준 #3**
- **관측:** firstrun_10-landing-20s_17e: 흰 광고 배너(60pt, 뷰포트 7.1%)가 ETF 행 카드의 하단(스파크라인·테두리)을 덮고 «+1.19% / +1.05% / −5.79%» 칩이 배너 상단 모서리에 2~3px 붙어 있다(firstrun_ZOOM-ad-over-content_17e). 탭바(높이 72px·backdrop blur 34px, app-view.css:517-540) 뒤로 MACRO BOARD 값 «$81.0K / $4,514 / $92.1 / 11,352» 가 반투명하게 잘려 비친다(_probe_relaunch_promax, dash_default-top_promax 하단). 코드: .app-main 은 height:100% 스크롤 컨테이너이고 padding-bottom 만으로 하단 여백을 만든다(app-view.css:96-103, native 오버라이드 :546-554; 스택 순서 layout.tsx:210-218 main→AppAnchorAd→AppBottomNav) → 스크롤 끝에서만 겹침 0, 그 외 모든 위치에서 두 고정 오버레이가 값 위를 지난다. 웹 프리뷰 광고 .app-anchor-ad 는 position:fixed(:397-404), 네이티브에선 null(AppAnchorAd.tsx:54-55)이고 AdMob 오버레이가 같은 슬롯을 쓴다. 블러 실측에서 에지·밝기 최대 블록이 둘 다 광고(y≈660pt). 0-5 #3 의 «약관 페이지 위 광고» 는 본 감사에서 캡처를 열지 않아 인용만 한다. (`firstrun_10-landing-20s_17e` · `firstrun_ZOOM-ad-over-content_17e` · `_probe_relaunch_promax` · `dash_default-top_promax` · `firstrun_10-landing-20s_BLUR_17e` / `styles/app-view.css:96-103` · `styles/app-view.css:397-404` · `styles/app-view.css:517-540` · `styles/app-view.css:546-554` · `layout.tsx:210-218` · `components/app/AppAnchorAd.tsx:54-55`)
- **바꾸는 사용자 행동:** 값이 광고·탭바 아래로 지나가지 않으면 → 사용자가 ETF 행이나 MACRO 첫 행을 읽으려고 «조금만 더» 스크롤하는 동작을 하지 않고 → 첫 뷰포트에서 본 값을 그 자리에서 판단한다.
- **개선 방향 ①** 스크롤 컨테이너의 하단을 padding 이 아니라 inset 으로 — .app-main 의 bottom 을 탭바+광고+세이프에어리어만큼 줄이고 그 아래 바닥을 불투명 --bg 로 채워 «독(dock)» 화. 어떤 스크롤 위치에서도 콘텐츠가 오버레이 밑을 지나지 않는다. — 트레이드오프: 탭바의 유리 효과(뒤로 비치는 콘텐츠)와 «떠 있는 섬» 연출이 사라지고 가시 높이가 약 −144pt(광고 60+탭바 72+lift 12). ／ **개선 방향 ②** **[과감]** 하단 광고를 독에서 빼내 콘텐츠 흐름 안 «네 번째 카드»로 옮긴다(MARKET PULSE 다음, 같은 반경·60pt·«광고» 태그). 하단 독은 탭바만 남아 첫 뷰포트에 60pt 의 데이터가 돌아오고 온보딩·약관 화면에는 광고가 구조적으로 뜰 수 없다. — 트레이드오프: 앵커 대비 인피드 배너의 가시율·수익 변동(범위 밖 관찰)과 AdMob 정책상 콘텐츠와 구별되는 라벨 필요; 스크롤 시 광고가 시야에서 사라진다. · 실패 가능성: 인피드 광고가 카드와 같은 반경·배경을 쓰면 데이터 카드로 오인돼 오탭이 늘어난다 → 흰 배경·«광고» 라벨을 유지해 오히려 이질감을 남겨야 한다. · 되돌리는 비용: 중 — 네이티브 셸(AdMob 배너 위치)과 웹 슬롯 CSS 둘 다 되돌려야 함
- **출처:** 3단계 #3 — Apple HIG Layout, NN/g Most Hated Advertising Techniques

**4-0-5. iOS 글자 크기 최대·대비 증가에 앱이 0 반응 — 전 글꼴 px 절대값 + text-size-adjust 잠금 + prefers-contrast 0건 — [양쪽] [확실] · 심각도 높음 · 비용 대 · 기준 #10 (+#2)**
- **관측:** dash_A11Y-textXXXL-top_17e(AX5)와 dash_default-top_17e 의 타이포가 픽셀 단위로 동일하고, 대비 증가 ON(dash_A11Y-contrast-top_17e, 제공된 실측)도 동일 — WKWebView 콘텐츠가 시스템 설정을 전혀 따르지 않는다. 코드: 첫 뷰포트 글꼴이 전부 px 절대값(dash.module.css:39-49, 104-116, 242-251, 293-299, 336-344, 1049-1054, 1151-1156, 1180-1186, 1209-1216, 1250-1265; app-view.css:587-593); globals.css:702-705 `-webkit-text-size-adjust:100%` 로 시스템 확대를 명시적으로 차단; `prefers-contrast` 미디어쿼리 0건(grep 결과 app-view.css:336·globals.css:663 은 reduced-motion 뿐). 합격선 «상대 단위 ≥90%·대비 증가 ON 정밀 라벨 ≥7:1» 대비 상대 단위 0%·응답 없음. B-03 의 9~10px 라벨은 이 상태에서 사용자가 키울 방법이 없다. (`dash_A11Y-textXXXL-top_17e` · `dash_A11Y-contrast-top_17e` · `dash_default-top_17e` / `app/globals.css:702-705` · `dash/dash.module.css:1049-1054` · `dash/dash.module.css:1250-1265` · `styles/app-view.css:587-593` · `styles/app-view.css:336`)
- **바꾸는 사용자 행동:** 앱 글자가 iOS 글자 크기·대비 증가를 따라오면 → 노안·저시력 사용자가 시스템 설정 한 번으로 «6h» «CLOSED» 같은 9~10px 라벨을 읽고 → 핀치 확대나 눈을 가까이 대는 동작 없이 값을 판단한다.
- **개선 방향 ①** :root 에 `font: -apple-system-body` 로 Dynamic Type 기준 크기를 받아 첫 뷰포트 타입 스케일 13종을 rem 으로 전환, text-size-adjust 잠금 해제, `@media (prefers-contrast: more)` 에서 --text-muted/--text-dim 을 7:1 이상으로 승격. — 트레이드오프: AX 크기에서 9~10px 계열 라벨이 2줄·말줄임으로 폭증하므로 B-03·B-05 를 먼저 끝내야 하고, 카드 고정 높이(104px)가 넘친다. ／ **개선 방향 ②** **[과감]** 크기를 «키우는» 대신 «재배치»한다: xL 이상 등급에서 3×3 펄스 그리드를 1열 리스트(행당 심볼·값·변동, 스파크 슬롯 없음)로 재구성하고 시장 상태 3박스는 세로 스택, 탭바는 아이콘 전용 44pt 로 전환 — 확대가 레이아웃을 깨는 대신 레이아웃이 확대에 답한다. — 트레이드오프: 레이아웃 2벌을 유지해야 하고 AX 사용자는 첫 뷰포트에서 3행 9값 대신 3~4값만 본다. · 실패 가능성: 임계값을 xxxL 로 두면 xL~xxL 구간에서 2열이 되며 카드 라벨이 다시 잘린다 → 임계를 xL 로 낮춰 조기 전환. · 되돌리는 비용: 중 — 컨테이너 쿼리/미디어쿼리 분기와 리스트 컴포넌트
- **출처:** 3단계 #10 — WCAG 2.2 SC 1.4.4, Apple HIG Accessibility(Dynamic Type), HIG Dark Mode

**4-0-6. 기준 시각 0 · 세션 토큰 5개 — «FUTURES LIVE» 가 한 카드에 두 번, «CLOSED» 두 번, 그런데 «언제 값인지»는 어디에도 없다 (+ «Risk-On 우위» 라벨과 «—» 3박스가 한 프레임에) — [양쪽] [확실] · 심각도 높음 · 비용 중 · 기준 #4 (+#3)**
- **관측:** dash_default-top_17e: MARKET PULSE 카드 안에 «● FUTURES LIVE»(헤더 필, page.tsx:1728-1732) 와 «FUTURES LIVE»(행 메타 :1740) 가 30px 간격으로 2회, «CLOSED» 가 현물·ETF 행 메타(:1763, :1795)에 2회 — 한 화면 상태 토큰 5개, 기준 시각 0. 폴링은 30s(7 엔드포인트, :1196-1203)+무버 10s 인데 화면은 «as of» 를 말하지 않고 뉴스 «6h/7h»(:1683-1687) 만 상대시간. 페이로드 updatedAt 은 파싱되나(:259-275) 렌더되지 않는다. dash_A11Y-textXXXL-top_17e(재실행 10초): «시장 상태 Risk-On 우위» 라벨은 떠 있는데 바로 아래 선물·현물·리스크 3박스는 «—» — 코드상 라벨과 리스크 박스는 같은 regimeReady(:865, :1699, :1714)로 묶여 있어 같은 프레임에서 갈릴 이유를 코드에서 찾지 못했다(원인 미확인, 관측은 확실). «—» 는 펄스 카드의 스켈레톤(.skelPulse :1743)과 달리 «아직»인지 «없음»인지 구별되지 않는다. 합격선 «수치 모듈 100% 기준 시각·상태별 표기 1종·상태 토큰 100% 기준 시각 동반» 전부 미달. (`dash_default-top_17e` · `dash_A11Y-textXXXL-top_17e` · `firstrun_10-landing-20s_17e` / `dash/page.tsx:259-275` · `dash/page.tsx:865` · `dash/page.tsx:1196-1203` · `dash/page.tsx:1699` · `dash/page.tsx:1714` · `dash/page.tsx:1728-1732`)
- **바꾸는 사용자 행동:** 카드 묶음마다 «21:14 ET 기준» 한 줄이 서고 상태 토큰이 1개로 줄면 → 사용자가 «CLOSED 인데 값이 움직이는» 상황을 «언제 값인지»로 해석하고 → 장외 시간에 본 숫자를 지금 시세로 착각해 결정하지 않는다.
- **개선 방향 ①** MARKET PULSE 헤더 필을 «FUTURES LIVE · 21:14 ET» 하나로 통합(이미 받는 updatedAt 사용), 행 메타의 상태 토큰 3개는 점(●/○)으로 축소; «—» 는 «아직»이면 스켈레톤, «없음»이면 «자료 없음» 텍스트로 이원화하고 regimeStrip 라벨과 3박스가 같은 준비 신호를 공유하도록 한다. — 트레이드오프: 행별 상태 차이(선물 live·현물 closed)를 필 하나가 다 담지 못해 점 부호에 의존하게 된다. ／ **개선 방향 ②** **[과감]** 상태를 텍스트가 아니라 «시간 축»으로: regimeStrip 을 24시간 세션 타임라인 바(프리·정규·애프터·글로벡스 구간 + 현재 위치 마커 + 마지막 갱신 마커, ET/KST 이중 눈금)로 바꿔 «CLOSED/LIVE» 어휘와 기준 시각을 그래픽 하나가 동시에 말하게 하고, 카드 안 상태 토큰은 전부 제거한다. — 트레이드오프: 타임라인은 학습 비용이 있고 «시장 상태 Risk-On 우위» 같은 판정 문구가 강조 자리를 잃는다; 첫 뷰포트에 새 정보그래픽이 하나 늘어 밀도가 오른다. · 실패 가능성: 바의 구간 색이 #1 정보그래픽 3:1 을 못 넘겨 장식으로 전락한다 → 구간 경계에 텍스트 눈금을 반드시 남긴다. · 되돌리는 비용: 중 — 컴포넌트 신규·regimeStrip 대체
- **출처:** 3단계 #4 — NN/g Trustworthiness in Web Design, International Web Usability(시간대 표기), Nielsen Heuristic #4

**4-0-7. 선물 카드 라벨 «NASDAQ…» «RUSSELL…» 두 기기 모두 말줄임 + 시장 상태 설명문도 17e 에서 잘린다 — [양쪽] [확실] · 심각도 중간 · 비용 소 · 기준 #2**
- **관측:** dash_default-top_17e(390pt): «NASDAQ…» «RUSSELL…»; _probe_relaunch_promax·dash_default-top_promax(430pt): «NASDAQ10…» «RUSSELL2…» — 두 폭 모두 잘린다. 원문 'NASDAQ100 F' 'Russell2k F'(page.tsx:1293-1295) 를 .pulseSym `white-space:nowrap; overflow:hidden; text-overflow:ellipsis`(dash.module.css:242-251) 가 자르고, 11px 800 uppercase + letter-spacing 0.04em 이 폭을 더 먹는다. 같은 화면 «정규장 밖에도 선물 흐름은 ET 기준으로 추…»(.regimeNote :1209-1216, nowrap+ellipsis) 는 17e 에서 문장 목적어가 사라지고 Pro Max 에서만 완전 표시. 합격선 «390pt 말줄임 0(명시 약어만)» 미달. (`dash_default-top_17e` · `dash_default-top_promax` · `_probe_relaunch_promax` / `dash/page.tsx:1293-1295` · `dash/dash.module.css:242-251` · `dash/dash.module.css:1209-1216`)
- **바꾸는 사용자 행동:** 선물 라벨이 잘리지 않으면 → 사용자가 «NASDAQ…»가 100 인지 종합인지 두 번 보지 않고 → 선물 행과 현물 행의 같은 열을 한 쌍으로 즉시 비교한다.
- **개선 방향 ①** 명시 약어로 교체: CME 루트 «NQ» «ES» «RTY» + 기존 FUT 뱃지 유지(약어는 확정 어휘라 잘림 0); .regimeNote 문장은 «ET 기준» 4자 칩으로 축약해 nowrap 을 유지. — 트레이드오프: NQ/ES/RTY 는 선물 경험자에게만 익숙하고 «NASDAQ 100 선물» 임을 라벨이 스스로 말하지 않는다. ／ **개선 방향 ②** **[과감]** 라벨을 카드 밖으로: 그리드가 이미 열 기준 정렬(page.tsx:80-85 — col1 Nasdaq 계열, col2 S&P 계열)이므로 열 머리 «NASDAQ 100 / S&P 500» 을 그리드 위에 한 번만 두고 카드 안에는 행 마커(F·현물·ETF)만 남긴다. 라벨 폭 문제가 열 폭 문제로 바뀌어 130px 카드 안에서 잘릴 텍스트가 없어진다. — 트레이드오프: 3열(RUSSELL F / DOW / VIX)은 계열이 달라 열 머리를 세울 수 없다 → 3열만 카드 안 라벨을 유지해 규칙 2종이 공존한다. · 실패 가능성: 사용자가 3열을 «기타»로 오독하거나 열 머리를 1행(선물)의 라벨로만 읽는다 → 열 머리를 3행 높이의 세로 구분선과 묶어 «열»임을 시각화해야 한다. · 되돌리는 비용: 소 — 그리드 헤더 1행 추가·카드 라벨 조건부
- **출처:** 3단계 #2 — Apple HIG Typography, Butterick Practical Typography

**4-0-8. 한 행 안에서 소수 자릿수·통화 접두가 섞인다 — «29,532 / 7,754.50 / 2,969.50», «$717.67 / $773.17 / 14.32» — [정밀층] [확실] · 심각도 중간 · 비용 소 · 기준 #2**
- **관측:** dash_ZOOM-pulse-cards_17e: 선물 행 «29,532 / 7,754.50 / 2,969.50»(소수 0·2·2), 현물 행 «26,584 / 7,747.71 / 53,686»(0·2·0). fmtPrice(page.tsx:139-143)가 ≥10,000 이면 소수 0, 미만이면 2 로 갈라 같은 행 세 카드의 소수점 x 위치가 제각각이고 글자 수(6 vs 8)도 다르다. ETF 행은 «$717.67 / $773.17 / 14.32» 로 $ 접두 유무까지 섞인다(:1817 — VIX 만 toFixed(2), 나머지 `$${fmtPrice}`). 값 글꼴은 ui-monospace 14px(dash.module.css:293-299)라 글리프 폭은 균일하지만 소수점 정렬은 없고, 변동률 칩만 tabular-nums(:336-344). 합격선 «소수점 편차 ≤1px» 미달. (`dash_ZOOM-pulse-cards_17e` · `dash_default-top_17e` / `dash/page.tsx:139-143` · `dash/page.tsx:1817` · `dash/dash.module.css:293-299` · `dash/dash.module.css:336-344`)
- **바꾸는 사용자 행동:** 한 행의 소수 자릿수와 접두 규칙이 하나가 되면 → 사용자가 세 값을 좌우로 훑을 때 자릿수를 세지 않고 → 어느 카드가 큰 수인지, 지수인지 가격인지 오독하지 않는다.
- **개선 방향 ①** 행 단위 규칙으로 고정: 선물·현물 지수는 소수 0(«7,755» «2,970»), ETF 는 $+소수 2, VIX 는 소수 2 무접두 — 규칙을 «ETF=$, 지수·변동성=무접두»로 명문화하고 fmtPrice 의 크기 분기(≥10,000)를 «행 종류» 분기로 바꾼다. — 트레이드오프: 선물 틱(0.25) 정보가 사라져 장중 선물 사용자가 «7,754.50 vs 7,754.75» 를 구분 못 한다. ／ **개선 방향 ②** **[과감]** 값을 «정수부 14px + 소수부 위첨자 11px» 두 스팬으로 나누고 카드 내부 값을 우측 정렬한다 — 9카드의 소수점이 한 세로선에 서고 정수부가 시각적으로 지배해 «29,532» 와 «7,754.50» 이 같은 무게로 읽힌다. 통화 접두는 소수부와 같은 11px 로 내려 값 글리프 폭에서 뺀다. — 트레이드오프: 우측 정렬은 현재 좌측 정렬된 심볼·칩과 축이 달라져 카드 안에 두 정렬 축이 생긴다; 소수부 11px 는 #2 최소 크기의 하한. · 실패 가능성: 소수부가 안 읽혀 사용자가 «7,754» 로만 기억한다 → 소수부를 12px 로 올리면 정수부와 차이가 작아져 정렬 효과가 반감된다. · 되돌리는 비용: 소 — 스팬 2개·CSS 1블록
- **출처:** 3단계 #2 — Butterick Practical Typography(tabular figures), Apple HIG Typography

**4-0-9. 뉴스 티커 상대시각 «6h» 4.1:1 — 정밀층 텍스트 4.5 미달, 유일하게 «언제»를 말하는 요소가 가장 흐리다 — [정밀층] [확실] · 심각도 중간 · 비용 소 · 기준 #1**
- **관측:** dash_default-top_17e 티커 우측 «7h»(firstrun_10 «6h») 실측 4.1:1 — .tickerTime 이 var(--text-muted) 에 opacity 0.7 을 곱한다(dash.module.css:1151-1156, 11px 400 JetBrains Mono). 같은 화면 실측: DARK POOL INTEL 7.4 · «시장 상태» 6.4 · 설명문 6.7 · «지수 선물» 6.5 · FUTURES LIVE 8.6 · CLOSED 5.0(.pulseRowMeta em rgba(148,163,184,.82) :1060-1063) · 칩 6.3 · 카드 이름 14.5 · 값 17.1 · 탭바 7.1/7.9 — 텍스트 중 «6h» 하나만 4.5 미달이고 CLOSED 는 0.5 여유. 광고 CTA «열기» 는 흰 글자 on 진회색 필로 측정 실패(1.0), 육안 판독 가능하나 수치는 미확인. 합격선 «정밀층 위반 0건» 미달(4.1 은 3:1 이상이라 화면 불합격은 아님). (`dash_default-top_17e` · `firstrun_10-landing-20s_17e` / `dash/dash.module.css:1151-1156` · `dash/dash.module.css:1060-1063`)
- **바꾸는 사용자 행동:** «6h» 가 4.5:1 이상 실색으로 놓이면 → 사용자가 헤드라인을 읽기 전에 «얼마나 묵은 뉴스인지»를 먼저 판단하고 → 6시간 전 속보를 지금 일어난 일로 오해해 반응하지 않는다.
- **개선 방향 ①** opacity 0.7 제거 + 색 토큰을 --text-dim 으로, 11→12px. CLOSED 는 rgba 알파 .82→1 로 올려 5.0→6 대 확보. — 트레이드오프: 티커 오른쪽 무게가 늘어 헤드라인 말줄임이 1~2자 더 생긴다. ／ **개선 방향 ②** **[과감]** 상대시각을 «신선도 칩»으로 바꾼다: 1h 이내 시안 테두리·4h 이내 회색·그 이상 저채도 앰버 테두리 안에 «6h» 를 100% 흰색으로 넣어 시간을 색+수치로 이중 부호화하고, 4h 를 넘긴 항목은 티커 회전 순서에서 뒤로 보낸다(표시 순서 규칙, 기능 아님). — 트레이드오프: 티커 한 줄에 배지가 둘(속보/신선도)이 되어 시선 경쟁이 생기고 한국어 헤드라인 폭이 12~16px 더 줄어든다. · 실패 가능성: 앰버가 «경고»로 읽혀 묵은 뉴스가 오히려 강조된다 → 앰버를 버리고 채도 0 회색 테두리+«6h 전» 텍스트로 후퇴. · 되돌리는 비용: 소 — CSS 1블록·클래스 분기 1줄
- **출처:** 3단계 #1 — WCAG 2.2 SC 1.4.3 (+SC 1.4.11)

**4-0-10. 설정 기어 30×30 — `min-height:30px !important` 로 44pt 최소치를 명시적으로 눌러쓴 유일한 첫 화면 컨트롤 — [정밀층] [확실] · 심각도 낮음 · 비용 소 · 기준 #2**
- **관측:** dash_default-top_17e 헤더 우측 기어는 30×30 원(dash.module.css:58-72: width/height 30px, `min-height:30px !important; min-width:30px !important`, SVG 16px). 주변 간격은 12pt 이상이라 «28~44 조건부» 구간이지만 <44 임은 확실하고, !important 는 전역 44 규칙을 의도적으로 무력화한 흔적이다. 대조: 탭바 탭은 flex:1·높이 72px(app-view.css:517-568)로 통과. 펄스 카드 9장은 104px 카드 모양이지만 onClick 이 없고(page.tsx:1744-1826 에 핸들러 없음) 뉴스 티커 바는 전체가 탭 가능(:1650)하나 셰브론 등 어포던스가 없다 — 둘은 범위 밖 관찰로만 남긴다. (`dash_default-top_17e` · `firstrun_10-landing-20s_17e` / `dash/dash.module.css:58-72` · `dash/page.tsx:1641-1646` · `styles/app-view.css:517-568`)
- **바꾸는 사용자 행동:** 기어 히트 영역이 44pt 가 되면 → 엄지로 한 번에 설정에 들어가고 → 첫 화면에서 알림·언어 설정으로 가는 유일한 경로의 빗나감(재탭)이 사라진다.
- **개선 방향 ①** 시각 30px 원은 유지하고 히트 박스만 44×44(투명 padding 7px, !important 제거). — 트레이드오프: 헤더 우측 여백이 7px 줄어 브랜드 블록과의 간격이 조여 보일 수 있다. ／ **개선 방향 ②** **[과감]** 기어를 없애고 헤더 우측 44pt 영역을 «세션·기준 시각 칩»(예: CLOSED · 21:14 ET, 우측 셰브론)으로 두어 그것을 설정 진입점으로 삼는다 — 화면에 없던 기준 시각을 44pt 컨트롤로 가져오는 대신 설정 아이콘 관습을 버린다. — 트레이드오프: 설정 발견성이 떨어지고(기어 관습 상실), 칩이 «정보»로만 읽혀 탭하지 않을 수 있다. · 실패 가능성: 칩이 상태 토큰을 하나 더 늘려 B-09 와 충돌한다 → 카드 안 토큰을 모두 제거한 뒤에만 도입. · 되돌리는 비용: 소 — 헤더 우측 요소 1개
- **출처:** 3단계 #2 — Apple HIG Accessibility(44×44pt), HIG Layout

---

### 4-1. 첫인상 — 3초 판정

#### 4-1-A. 패널 결과 (검증 반영)

| | 한국 40대 서학개미 | 미국 옵션 트레이더 | 디자인 디렉터 |
|---|---|---|---|
| 3초에 읽힌 것 | «오늘 미국 장이 올랐구나»(초록 카드 3줄·«Risk-On 우위» 색으로 추측) | 현물 CLOSED +1%대 마감, 선물 LIVE 보합, VIX 14.32 −5.79% — 숫자는 읽힘 | «지금 위험선호 쪽»(판정 1줄) + «현물 +1.21%·선물 보합» |
| 이 앱이 무엇인가 | «미국 지수 상황판 + 광고 보면 기관 데이터 잠깐 여는 앱» | «TradingView 워치리스트로 이미 보는 것»; 핵심(다크풀·감마)은 자물쇠 뒤라 «무엇을 더 주는지» 확인 불가 | «공개 시세 요약 4블록 + 스크롤 끝 자물쇠» — «시장이 어떤가»는 3초에 읽히고 «이 앱이 무엇인가»는 3초에 오독 |
| 먼저 누르고 싶은 것 | 잘린 «속보» 티커(금리) → 잘린 «NASDAQ…» 카드. 탭바는 «뭘 하는지 몰라 손이 안 감» | 탭 «Flow»(옵션 흐름을 찾으러) → 주황 «광고 보고 1시간 해제» | «리스크 69»(척도 없는 판정 숫자) → 탭 «Flow»(헤더가 약속한 다크풀을 찾으러) |
| 신뢰 신호(확인됨) | 소수점·▲▼·색 일치, CLOSED/FUTURES LIVE, 실제 뉴스, 아는 종목 로고, 약관·지원 메일 | 두 캡처 사이 선물만 움직이고 현물은 고정(라벨과 데이터 거동 일치), 선물 소수가 틱 크기와 일치, VIX 방향 정합 | 숫자 서식 일관·고정폭, 판정과 근거가 같은 카드 |
| 불신 신호(확인됨) | «Test mode» 딱지, 같은 스파크라인, «−0.00%» 적색, SPY 두 가격, «$62.3B» 무라벨, 잘린 이름, 무관한 광고 | 기준 시각·출처 0, «LIVE» 지연 수준 불명, 헤더와 내용 불일치, 잘린 UI 3곳 | «속보» 태그가 6h 기사에, 면책 반복, 섹터 8개뿐, «오늘 14.2K» |
| 블러 후 기억 | 첫 줄 «초록 1·빨강 2 발광 격자» | 같은 격자(신호등) | 같은 격자 + «시장 상태» 띠; 그 아래는 «어느 다크 트레이딩 앱과도 구분 안 됨» |
| 식별성 판정 | generic | generic | somewhat-distinct |
| 내일 다시 열 이유 | 없음(«나»가 없음, 브리핑 시각 안내 없음) | 없음(핵심은 잠금 뒤, 1시간 잠금은 재방문 비용) | 약함(«Risk-On» 1줄·FUTURES LIVE 는 습관 후보; 내일 무엇이 다를지 예고 없음) |

회의론자가 **반박한 주장**(본 감사에서 채택하지 않음): «스파크라인 9장 전부 동일»(픽셀 대조 결과 5개 형태, 완전 동일 쌍은 NASDAQ선물≡DOW · S&P500 F≡S&P 500 · RUSSELL≡NASDAQ현물 3쌍) · «자물쇠 뒤에 다크풀이 있다»(캡처 어디에도 «다크풀» 단어는 헤더 외 0회) · «FUTURES LIVE 두 표시가 20px 간격»(실측 ≈60px) · «블록마다 LIVE/CLOSED 표시»(TOP MOVERS 는 없음) · «동의 박스와 불릿 4개가 같은 내용»(2개만 중복) · «상태바 9:41 = 동일 시점»(고정 상태바라 증거 불가).

#### 4-1-B. 첫인상 지적

**4-1-1. MARKET PULSE 스파크라인이 데이터가 아니라 «형태 상수»다 — [정밀층] [확실] · 심각도 높음 · 비용 소 · 기준 #4**
- **관측:** 현물 3카드 `DEMO_INDICES[i].spark`(`dash/page.tsx:107-109`), 선물 3카드 `DEMO_FUTURES[i].spark`(`:1293-1295`), ETF 3카드 `DEMO_ETFS[i].spark`(`:1498-1518`), 무버 `t.spark || [5,6,7,8,9]`(`:1153`). 캡처 `dash_default-top_17e` 에서 회의론자 픽셀 대조: NASDAQ선물≡DOW, S&P500 F≡S&P 500, RUSSELL≡NASDAQ현물(편차 ≤0.005). `dash_default-mid_17e` 의 NVDA·TSLA·SPY 세 선이 동일. 하락 카드(«−0.00%», «−0.01%»)의 선이 우상향. 코드 주석(`:1276-1278`)은 «가짜 숫자는 빈칸보다 나쁘다»고 쓰면서 선은 남겼다.
- **바꾸는 사용자 행동:** 선이 사라지거나 «히스토리 없음»으로 정직해지면 → 사용자가 카드의 선을 «오늘 흐름»으로 읽고 방향을 오판하는 일이 없어지고 → 숫자·색·선 세 채널이 같은 말을 해 카드 하나를 한 번에 믿는다.
- **개선 방향 ①** 스파크라인 제거, 카드를 «값 + 변화율 칩» 2요소로 — 트레이드오프: 카드가 납작해져 «살아 있음» 신호가 줄어든다(FUTURES LIVE 글로우가 대신 짊어져야 함). **②** [과감] 선 자리에 «전일 종가 대비 위치 막대»(prevClose 와 현재가는 이미 있음) 1개 — 트레이드오프: 막대는 «범위»가 아니라 «방향·크기»만 말하므로 라벨(«전일比»)이 필수; 실패 가능성: 막대를 또 차트로 오독; 되돌리는 비용 소. **③** 실측 히스토리를 붙이는 것은 데이터 작업이므로 «범위 밖 관찰»로 이관.
- **출처:** Kalshi Pro «we show a dash rather than invent a number»(2-1 ⑥) · 3단계 #4 «구별 불가 비실측 값 0».

**4-1-2. 첫 시선이 데이터가 아니라 흰 광고 배너에 간다 — [표현층] [확실] · 심각도 높음 · 비용 중 · 기준 #3·#7**
- **관측:** `firstrun_10-landing-20s_17e` 면적 4분류: 광고 7.1%(60pt) — 기준 #7 상한 6% 초과. σ2% 블러(`firstrun_10-landing-20s_BLUR_17e`)에서 에지·밝기 최대 블록이 모두 배너 위치(y≈660pt). 배너는 첫 랜딩 3초에 이미 떠 있고(`firstrun_08-landing-3s_17e`), ETF 행 스파크라인을 덮으며(`firstrun_ZOOM-ad-over-content_17e`), 온보딩 약관 위에도 뜬다(`firstrun_04-terms-page-ad-overlay_17e`). 패널 3인 모두 첫 3초 인상에 배너를 언급. 「Test mode」 라벨은 시뮬레이터 전용이나 흰 슬래브 자체는 실기기와 동일.
- **바꾸는 사용자 행동:** 배너가 «콘텐츠 위 오버레이»가 아니라 «예약된 어두운 선반»이 되면 → 첫 3초 시선이 시장 상태·펄스 그리드로 가고 → 스크롤 어느 위치에서도 값이 가려지지 않아 화면 끝까지 읽는다.
- **개선 방향 ①** 배너 슬롯을 스크롤 컨테이너 하단 «예약 인셋»으로(콘텐츠 padding-bottom 에 배너 높이 포함, `layout.tsx:210`) + 슬롯 배경을 페이지색으로 — 트레이드오프: 광고 크리에이티브가 흰색이면 슬래브는 남는다. **②** [과감] 배너를 탭바 «아래»(홈 인디케이터 위) 대신 **첫 뷰포트 밖**(첫 스크롤 후 나타나는 인라인 선반)으로 — 트레이드오프: 노출 수·수익 감소 가능; 실패 가능성: 광고 정책상 «가시성» 요건; 되돌리는 비용 소(위치만). **③** 온보딩·약관·동의 화면에서는 배너 억제(`AppFirstRunOnboarding.tsx:149` 억제 로직이 약관 페이지엔 미적용 [추정]).
- **출처:** NN/g Most Hated Advertising Techniques(콘텐츠를 덮는 모바일 광고) · HIG Layout(탭바는 콘텐츠 «위»에 얹히므로 레이아웃이 감안) · 3단계 #3.

**4-1-3. «이 앱이 무엇을 해주는가»가 첫 화면에 없다 — 간판(DARK POOL INTEL)과 내용(지수 요약)의 불일치 — [표현층] [확실] · 심각도 높음 · 비용 중 · 기준 #6·#7**
- **관측:** 헤더 부제 «DARK POOL INTEL»(`dash/page.tsx:1637`)인데 첫 뷰포트에 다크풀·옵션·기관 값이 0개(`firstrun_10-landing-20s_17e`). 첫 뷰포트 요소 태깅: what(값) 21개, so-what 1개(«Risk-On 우위» — 단 척도·근거 캡션이 잘림). 앱의 차별 신호(기관 신규 포지션·딜러 감마·섹터 순환·시장 폭)는 스크롤 최하단 자물쇠 카드(`dash_default-bottom_17e`, `:2140`)에만. 패널 3인 모두 «TradingView·토스·네이버에서 보던 것»으로 규정. 회의론자 확인: «다크풀»이라는 단어는 헤더 외 캡처 어디에도 없다.
- **바꾸는 사용자 행동:** 첫 뷰포트에 «이 앱만 주는 값» 하나가 잠금 미리보기 형태로라도 올라오면 → 사용자가 3초 안에 «지수판이 아니라 기관 흐름 앱»으로 분류하고 → Flow·Guardian 탭을 «약속된 것을 찾으러» 누른다(패널 2인의 첫 탭 동기가 정확히 이것).
- **개선 방향 ①** 시장 상태 카드의 세 번째 셀(«리스크 69»)을 «기관 신호 1개 미리보기»(이미 있는 `$62.3B` 등)로 바꾸고 나머지 3개는 잠금 표시 — 트레이드오프: 리스크 점수가 뷰포트 밖으로. **②** [과감] 헤더 부제를 화면이 실제로 보여주는 것으로(예: «US MARKET · 기관 흐름 인텔») 바꾸거나, 반대로 첫 뷰포트를 부제에 맞춰 «기관급 펄스 미리보기»가 MARKET PULSE 보다 위에 오게 — 트레이드오프: 무료 사용자에게 잠금이 더 일찍 보임(«장벽» 인상); 실패 가능성: 잠금 카드가 첫 뷰포트에 오면 이탈; 되돌리는 비용 소(순서 변경). **③** 탭바 은유형 라벨(Guardian·Command·Intel)에 콘텐츠 명사 부제(기준 #6) — 4-3 에서 다룸.
- **출처:** NN/g Information Scent · NN/g Progressive Disclosure(so-what 상위) · Gentler Streak 판정 우선 위계(2-2 ②) · 3단계 #7 «so-what 이 광고 잠금 뒤에만 있으면 불합격».

**4-1-4. «▼ −0.00%» 적색 + 우상향 선 — 색·부호·형태가 서로 다른 말을 한다 — [정밀층] [확실] · 심각도 높음 · 비용 소 · 기준 #4**
- **관측:** `dash_default-top_17e` S&P500 F 카드 «▼ −0.00%» 적색, 카드 테두리 적색 글로우, 선은 우상향; RUSSELL «▼ −0.01%» 동일. Guardian 리스크 스트립 «−0.00%»(`guardian_ZOOM-risk-strip_17e`). 판정 `up: chg >= 0`(`:1287`, 현물 `:107-109`, 무버 `:1152`)는 반올림 전 값으로 부호를 정하고 표시는 소수 2자리로 반올림 → «−0.00».
- **바꾸는 사용자 행동:** 반올림 0 이 무부호·중립색이 되면 → 사용자가 보합을 하락으로 오독하지 않고 → 적색 카드 수를 «오늘 내린 것의 수»로 세는 습관이 안전해진다.
- **개선 방향 ①** 표시값 기준으로 부호·색 판정(«0.00%» 중립, 부호 없음), 마이너스는 U+2212 하나로 — 트레이드오프: 없음(순수 정밀층). **②** ▲/▼ 와 +/− 중복(«▲ +1.40%») 중 하나만 — 삼각형은 색약 대비용으로 남기고 부호 삭제 — 트레이드오프: 텍스트 복사 시 부호 소실; 대안은 부호를 남기고 삼각형 삭제.
- **출처:** MDN `Intl.NumberFormat` signDisplay(«negative» 만 −0 제외) · 3단계 #4.

**4-1-5. 판정 숫자에 척도가 없고, 판정의 근거 문장이 잘린다 — [정밀층] [확실] · 심각도 중간 · 비용 소 · 기준 #4·#5**
- **관측:** «리스크 69»(범위·방향·정의 없음, `:1712-1714`), 캡션 «정규장 밖에도 선물 흐름은 ET 기준으로 추…» 말줄임(`firstrun_10-landing-20s_17e`, `dash_default-top_17e` 모두). 패널 3인 모두 «리스크 69 = 좋은가 나쁜가»를 물었고 디렉터 페르소나는 이것을 첫 탭 대상으로 꼽았다. 두 캡처 사이 69→68 로 움직이지만 무엇이 움직였는지 화면이 말하지 않는다.
- **바꾸는 사용자 행동:** «리스크 69 / 100 · 높을수록 위험» 한 줄과 캡션 완문이 보이면 → 사용자가 «Risk-On 우위»와 «리스크 69»를 한 문장으로 읽고 → 탭 없이 판정을 신뢰하거나 반박할 수 있다.
- **개선 방향 ①** 셀을 «69 / 100» + 방향 글리프 + 얇은 0–100 바(3단계 #9 확률 우선 프레이밍) — 트레이드오프: 셀 높이 +8pt. **②** 캡션을 말줄임 대신 2줄 허용 또는 «ⓘ»로 이동 — 트레이드오프: ⓘ 는 탭 1회 비용.
- **출처:** HIG Charts(고정 축) · MenthorQ Low–Fair–High 슬라이더(2-1 ②) · Gentler Streak 기준 명시 pill(2-2 ②).

**4-1-6. 첫 뷰포트 라벨의 언어와 이름이 사용자 언어가 아니다 — [표현층] [확실] · 심각도 중간 · 비용 중 · 기준 #5·#6**
- **관측:** 한국어 뷰포트에 영어 라벨 ≈20 vs 한국어 9(1-A-1). «Risk-On 우위» 혼종, «DARK POOL INTEL», 탭바 Dashboard/Guardian/Command/Flow/Intel(`AppBottomNav.tsx:7-11`, 의도 주석). 서학개미 페르소나: «탭 이름만으로 무엇을 하는지 하나도 짐작 못 함 → 손이 안 감»; «Risk-On 이 좋은 뜻인지 색으로만 추측». ATT 사유 영문(`Info.plist:37-38`).
- **바꾸는 사용자 행동:** 탭바 라벨이 콘텐츠 명사(예: 리스크 / 종목 / 옵션 흐름 / 섹터)가 되고 «Risk-On»에 «위험선호» 병기가 붙으면 → 첫 방문자가 탭을 «찾으러» 누르고 → 첫 세션에서 5탭 중 3탭 이상을 열어 본다(기준 #6 정답률 80% 목표).
- **개선 방향 ①** 탭바 라벨 로케일화 + 은유형 이름은 부제로 강등(«Guardian» 은 작은 눈썹, «리스크 감시»가 주 라벨) — 트레이드오프: 브랜드 고유명 노출 감소. **②** [과감] 5탭 라벨 전부를 «사용자 질문형»(지금 시장은? / 이 종목은? / 누가 사나? / 어느 섹터?)으로 — 트레이드오프: 라벨 길이(17e 5열 폭 78pt)에서 2줄 위험; 실패 가능성: 앱스토어·마케팅 이름과 불일치; 되돌리는 비용 소(문자열).
- **출처:** NN/g Plain Language · NN/g Information Scent · 3단계 #5 «권한 사유 100% UI 언어».

**4-1-7. 첫 실행의 처음 30초: 12초 빈 화면 → 영문 ATT → 가치 제안 없는 동의 → 광고 먼저 — [표현층] [확실] · 심각도 높음 · 비용 중 · 기준 #3·#5·#7**
- **관측:** `dash_first-launch_17e`(12s 빈 화면), `firstrun_01-att_17e`(영문), `firstrun_02-consent-1of2_17e`(«1 / 2 · 필수 고지», 앱이 무엇을 해주는지 한 줄 없음, 4번째 불릿이 «광고 시청»을 먼저 말함), `firstrun_08-landing-3s_17e`(대시보드 3초 완성 + 광고). 재실행은 영어 스켈레톤 경유(0-5 #16). 신규·재방문 화면 동일(개인화·투어 0).
- **바꾸는 사용자 행동:** 스플래시 직후 «구조적 스켈레톤(한국어 라벨·상태바 인셋 적용)»과 동의 화면 상단 «이 앱은 기관 옵션 흐름을 보여줍니다» 한 줄이 생기면 → 사용자가 12초를 «죽음»이 아니라 «준비 중»으로 견디고 → 동의 체크를 «무엇에 동의하는지» 알고 누른다.
- **개선 방향 ①** 최초 설치 실행에도 재실행과 같은 스켈레톤 경로(현재는 최초 실행에서만 빈 화면 — 원인 [추정]: 온보딩 마운트 전 `null`, `AppFirstRunOnboarding.tsx:212`) — 트레이드오프: 없음. **②** 부팅 셸 `/en` 을 저장 로케일로 먼저 리다이렉트해 영어 스켈레톤 노출 제거(`capacitor.config.ts:20`, `layout.tsx:29`) — 트레이드오프: 첫 실행은 로케일 미저장이라 여전히 기본 로케일. **③** [과감] 동의 1/2 위에 «가치 한 줄 + 실제 오늘 값 1개»(예: 오늘 기관 순매수 $62.3B) — 트레이드오프: 동의 전 데이터 노출의 법무 검토; 실패 가능성: 심사 규정(3.1.2·5.1.1) 재검; 되돌리는 비용 소.
- **출처:** NN/g Response Times(10초 한계·진행 표시) · NN/g Skeleton Screens · Tide Guide «로그인 없이 마지막 스테이션 직행»(2-2 ⑤) · 3단계 #3.

**4-1-8. «마감이 덜 된 화면» 신호 7개가 한 화면에 — [정밀층+표현층] [확실] · 심각도 중간 · 비용 소 · 기준 #2·#4·#9**
- **관측(전부 캡처):** ① «NASDAQ…»«RUSSELL…» 말줄임(두 기기, `.pulseSym` 800 11px `dash.module.css:243`) ② «S&P500 F» vs «S&P 500» 표기 불일치 ③ «FUTURES LIVE» 60px 간격 중복(필 `:1728-1730`, 행 라벨 `:1740`) ④ «속보» 배지가 6h 기사에(`firstrun_10`) ⑤ 탭바 아래로 매크로 스트립 조각이 비침(`firstrun_10`, `dash_default-top_17e`) ⑥ «시장 모니터 현황 보기 →» 탭바에 반 가림(`dash_default-mid_17e`) ⑦ 푸터 아래 ≈335px 빈 어둠(`dash_default-bottom_17e`). 패널 2인이 이를 «숫자 검수도 덜 됐을 것»이라는 연상으로 연결.
- **바꾸는 사용자 행동:** 일곱 개가 사라지면 → 사용자가 «미완성»이라는 메타 판단을 하지 않고 → 화면의 숫자를 검증 대상이 아니라 참고 대상으로 읽는다.
- **개선 방향 ①** 심볼 약어 규칙(NASDAQ 100→NDX, RUSSELL 2000→RTY)로 말줄임 0 + 표기 통일(«S&P 500 F») — 트레이드오프: 약어 학습 비용(ⓘ 1회). **②** 세션 라벨은 «행 라벨»에만, 카드 헤더 필은 «● LIVE 3» 카운트로(Sofascore 트리아지 칩) — 트레이드오프: 카운트는 «무엇이 라이브인지»를 행이 말해야 함. **③** 하단 인셋 계산을 «탭바 + 배너 + safe»로 정확히(`layout.tsx:210`) — 탭바 뒤 비침·반 가림·푸터 여백 세 개가 같은 원인.
- **출처:** HIG Typography(잘림 최소화) · Sofascore 홈 트리아지(2-2 ③) · 3단계 #2 «390pt 말줄임 0».

**4-1-9. 기준 시각이 0개, 같은 화면에 SPY 가격이 둘 — [정밀층] [확실] · 심각도 높음 · 비용 소 · 기준 #4**
- **관측:** 4개 대시보드 캡처 어디에도 «as of» 없음(있는 것은 티커 «6h/7h»뿐 — 회의론자 확인: 뉴스펄스 5건에는 시각 없음). TOP MOVERS SPY «$773.43»(`dash_default-mid_17e`) vs ETF 행 SPY «$773.17»(`dash_default-top_17e`) — 캡처 시점은 수 분 차이일 수 있어 «동시 불일치»는 [추정], «한 화면에 다른 두 값이 표시된다»는 [확실]. TOP MOVERS 블록만 LIVE/CLOSED 표시 없음.
- **바꾸는 사용자 행동:** 블록마다 «HH:MM ET · 현지 HH:MM» 스탬프가 붙으면 → 사용자가 두 값의 차이를 «시각 차이»로 이해하고 → «어느 쪽이 맞나»를 묻지 않는다.
- **개선 방향 ①** 카드 헤더 우측 세션 필 옆에 기준 시각(현지시각 기본, ET 병기) — 트레이드오프: 헤더 폭(17e)에서 필+시각이 2줄 위험 → 시각은 필 안에 흡수(«CLOSED 16:00 ET»). **②** 두 소스가 다른 값을 낼 수 있으면 화면은 한 소스만 쓰기 — 데이터 경로 문제이므로 «범위 밖 관찰»로.
- **출처:** NN/g International Web Usability(시간대 약어) · Fiscal.ai «15 min delay» 출처 UI(2-1 ⑤) · Unusual Whales Flow Status Indicator(2-8) · 3단계 #4.

**4-1-10. 블러하면 «다크 트레이딩 앱 일반형» — 서명 요소가 상태 의존적이다 — [표현층] [추정(패널 3인)] · 심각도 중간 · 비용 대 · 기준 #8**
- **관측:** 패널 판정 generic 2 / somewhat-distinct 1. 셋 모두 기억한 형태는 «첫 줄 초록 1·빨강 2 발광 격자»인데, 회의론자 지적대로 이것은 그날의 등락에 따라 바뀌는 상태(`firstrun_10` 에서는 3장 전부 초록)이지 고정 서명이 아니다. 첫 뷰포트에서 반복·고유 요소 후보: 플로팅 탭바(경쟁도 씀), 시안 세로 바 제목(범용), FUTURES LIVE 글로우(NTS 식 «한 색만 살아 있게»의 씨앗 — 유일한 후보). Guardian 의 HUD 브래킷·스캔라인은 첫 화면에 없다.
- **바꾸는 사용자 행동:** 첫 뷰포트에 상태와 무관하게 반복되는 서명 하나(예: 세션 시간축 띠, 또는 «살아 있는 값에만 붙는 한 색» 규칙)가 생기면 → 사용자가 블러·썸네일·스토어 스크린샷에서 이 앱을 골라내고 → 5탭이 한 앱으로 묶인다.
- **개선 방향 ①·②** 4-5 재설계 2안에서 다룸(세션 편성표 척추 / 판정 우선 히어로).
- **출처:** Ehrenberg-Bass 고유 자산 · LukeW Squint Test · 2-6 #5.

#### 4-1-C. 첫 화면에서 «바꾸지 말아야 할 것» (패널·검증 일치)
- 판정 1줄(«Risk-On 우위»)이 첫 뷰포트 최상단에 있다는 구조 — 위계의 방향은 맞다(척도·근거만 없다).
- 세션 상태를 블록마다 라벨로 구분하는 원칙(FUTURES LIVE / CLOSED) — 표기만 하나로 통일하면 된다.
- 고정폭 숫자·자산별 소수 자릿수 일관(«7,754.50» «26,584» «14.32»).
- 라이브 카드에만 붙는 테두리 글로우 — «한 색만 살아 있게» 문법의 씨앗. 확장하되 없애지 말 것.
- 한국어 뉴스 5건 + 배지(시그널/지표/속보) 구조 — 태그 규칙과 시각만 고치면 된다.

---

### 4-2. 반복 사용 — 세 시나리오

> (A) 22:30 KST 미국장 개장 직후 어두운 방 · (B) 07:00 KST 장마감 리포트 푸시 후 아침 · (C) 낮에 잠깐 종목 하나 확인. 장중(LIVE) 화면은 캡처가 없어 코드 기준 [추정]으로 표기한다.

**4-2-1. «지금»이 없다 — 첫 뷰포트에 기준 시각 0, 유일한 시간 단서는 뉴스 «6h» — [양쪽] [확실] · 심각도 높음 · 비용 중 · 기준 #4, #7**
- **관측:** dash_default-top_17e·dash_default-top_promax 첫 뷰포트에 «언제의 값»을 말하는 요소가 하나도 없다. 세션 토큰은 «CLOSED»(5.0:1 회색 필, 9px 800, dash.module.css:112) 와 «FUTURES LIVE»(헤더 필 + 행 메타 2회 중복) 뿐이고 닫힌 시각·갱신 시각은 어디에도 없다. 시장 상태 카드의 설명문 자리(page.tsx:1701 regimeNote)는 정적 안내문 «정규장 밖에도 선물 흐름은 ET 기준으로 추…»(page.tsx:642) 이 들어가 17e 에서 말줄임된다(dash.module.css:1209-1216, 10px nowrap ellipsis). 화면에서 시간을 말하는 유일한 글자는 뉴스 티커의 «6h/7h»(11px 모노, opacity .7, 실측 대비 4.1:1, dash.module.css:1151-1156). 폴링은 30s(page.tsx:1599)·무버 10s(:1187) 로 돌지만 feedMeta 의 updatedAt/marketTime(:266-281) 은 화면에 렌더되지 않는다. 낮에 잠깐 연 사용자(시나리오 C)에게 현물·ETF·히트맵은 전부 어젯밤 마감값인데 «CLOSED» 는 그 사실을 «언제»로 말하지 않고, 22:30 개장 직후(A) 사용자는 «LIVE» 가 몇 초 전 값인지 알 수 없다. (`dash_default-top_17e` · `dash_default-top_promax` / `dash/page.tsx:642` · `dash/page.tsx:1701` · `dash/page.tsx:866-867` · `dash/page.tsx:1599` · `dash/dash.module.css:1151-1156` · `dash/dash.module.css:1209-1216`)
- **바꾸는 사용자 행동:** «CLOSED» 회색 필 자리에 «9/3 16:00 ET 마감 · 12h 전» 이 오고 설명문 자리에 «선물 22:31:05 ET 갱신 · 30초마다» 가 오면 → 낮에 연 사용자가 첫 3초에 '이건 어젯밤 값' 임을 판별하고 눈을 선물 행으로 옮긴다 → 옛 값을 지금 값으로 오독하는 일과 «이거 갱신되는 거 맞나» 하는 당겨서 새로고침 시도가 사라진다.
- **개선 방향 ①** regimeNote(정적 안내문) 를 «기준 시각 라인» 으로 교체 — 모노 tabular 한 줄 «현물 9/3 16:00 ET 마감 · 선물 22:31 ET 갱신» + KST 병기; 세션 필 «CLOSED» 는 «CLOSED 16:00 ET» 로 시각을 동반하고, 헤더 필과 행 메타의 «FUTURES LIVE» 중복은 행 메타만 남긴다. feedMeta 의 marketTime 이 이미 상태에 있으므로 데이터 추가 없음. — 트레이드오프: 한 줄에 두 시각이 들어가면 17e 390pt 에서 말줄임 위험 → 약어 규칙(ET 단독 금지 기준과 충돌하므로 «16:00 ET / 05:00 KST» 두 값 고정) 이 필요하고, 설명문이 주던 «선물은 ET 기준» 안내는 ⓘ 로 이동한다. ／ **개선 방향 ②** **[과감]** 헤더 서브라인 «DARK POOL INTEL» 태그라인을 «세션 시계» 로 바꾼다 — 로고 옆에 «NY 09:31:05 · OPEN +1m» 형태의 실시간 시계(장중 카운트업 / 장외 «CLOSED 16:00 · 다음 개장 12h 29m» 카운트다운) 가 상시 뜬다. 매일 여는 사용자에게 헤더의 살아있는 시계가 «지금» 의 정본이자 이 앱만의 서명 요소가 되고, 아래 모든 «LIVE/CLOSED» 토큰은 이 시계를 기준으로 읽힌다. — 트레이드오프: 브랜드 태그라인 상실(스토어 스크린샷·마케팅 자산과 불일치), 1초 리렌더는 헤더 한 노드로 국한해야 하며, 어두운 방에서 계속 바뀌는 숫자가 주의를 끌 수 있어 초 단위는 장중에만 표시한다. · 실패 가능성: 백그라운드에서 돌아온 직후 시계가 멈춘 채 «LIVE» 를 표시하면 «오래된 값을 자신 있게 신선하다고 말하는» 최악의 형태가 된다 → visibilitychange 재동기화 + 폴링 실패 시 시계 색을 회색으로 강등하는 규칙이 전제. · 되돌리는 비용: 헤더 컴포넌트 span 1개 교체, 소.
- **출처:** NN/g Trustworthiness in Web Design(3단계 #4) · NN/g Progressive Disclosure(#7) · Apple HIG Typography(말줄임 최소화)

**4-2-2. 아홉 장의 «오늘의 선» 이 매일 같다 — 스파크라인 전부 DEMO 배열, 재방문 시 달라지는 건 색뿐 — [정밀층] [확실] · 심각도 높음 · 비용 중 · 기준 #4, #7**
- **관측:** MARKET PULSE 9카드의 스파크라인이 전부 하드코딩이다: 현물 DEMO_INDICES[i].spark(page.tsx:107-109), ETF DEMO_ETFS[i].spark(:1498-1518), Sparkline.tsx:10-45 는 받은 배열을 그대로 그린다. 캡처로 확인: dash_default-top_17e(11:08)·firstrun_10-landing-20s_17e(13:18)·_probe_relaunch_promax(13:14) 에서 값은 바뀌는데(S&P500 F −0.00%→+0.04%→+0.04%) 9개 선의 모양은 동일하다. dash_ZOOM-pulse-cards_17e 에서 S&P500 F «▼ −0.00%»·RUSSELL «▼ −0.01%» 카드가 적색인데 그 안의 선은 우상향한다 — 값과 그림이 서로 반대다. 재방문 사용자가 «어제와 무엇이 달랐나» 를 읽을 유일한 시각 요소가 매일 같은 그림이며, 카드 높이의 약 1/3(22px + 여백) 이 이 고정 그림에 쓰인다(1-A-1: 17e 첫 뷰포트에서 ETF 행이 잘리는 원인의 일부). (`dash_ZOOM-pulse-cards_17e` · `dash_default-top_17e` · `firstrun_10-landing-20s_17e` · `_probe_relaunch_promax` / `dash/page.tsx:107-109` · `dash/page.tsx:1498-1518` · `components/app/Sparkline.tsx:10-45`)
- **바꾸는 사용자 행동:** 스파크라인이 사라지고 실측값 하나로 그리는 «전일 대비 바» 만 남으면 → 재방문 사용자가 어제와 다른 것을 선의 방향(늘 같음) 이 아니라 바의 길이·방향으로 읽는다 → 같은 그림에 익숙해져 9카드를 통째로 건너뛰던 눈이 다시 값에 머문다.
- **개선 방향 ①** 선을 지우고 그 22px 를 «전일 대비 수평 바» 로 대체 — 0선 중앙, chg 값 하나로 좌우 길이를 그리고(±3% 풀스케일) 같은 행 3카드가 같은 스케일을 공유. 지금 있는 실측값(chg) 만으로 그릴 수 있어 정직하고, 부호 이중 표기(▲ +) 는 바의 방향이 대신하므로 칩은 «+1.40%» 로 단순화된다. — 트레이드오프: «차트가 있는 금융앱» 인상이 약해진다(표현층 기억 요소 손실) — 바의 색·두께 규칙을 이 앱 고유의 문법으로 밀어야 보상된다. 실측 인트라데이 스파크 도입은 데이터 파이프라인이라 «범위 밖 관찰» 로만 남긴다. ／ **개선 방향 ②** **[과감]** 9카드 3행을 «지수 밴드» 1행으로 압축한다 — 카드마다 값+칩만 남긴 타이포 타일(높이 절반, 그림 0) 을 가로 스냅 한 줄에 놓고, 행 구분(선물/현물/ETF) 은 밴드 안 세로 구분선과 약어 라벨로. 첫 뷰포트에 MACRO 1행·2행(F&G FEAR 포함) 이 통째로 올라와 «값 나열» 이 아니라 «판정(시장 상태) + 근거(밴드) + 매크로 판정» 3층이 한 화면에 선다. — 트레이드오프: 가로 스크롤은 9개 중 5~6개만 첫눈에 보이므로 나머지는 한 번 밀어야 한다; 카드 배지(FUT/NDX/500) 의 식별 역할이 약어 텍스트로 옮겨간다. · 실패 가능성: 밴드가 가로 스크롤이면 «VIX» 가 접혀 들어가 공포 지표가 첫 뷰포트에서 빠질 수 있다 → 밴드 순서를 VIX·S&P500 F·NASDAQ F 우선으로 고정해야 한다. · 되돌리는 비용: 레이아웃 컴포넌트 1개 되돌림(카드 마크업은 유지), 중.
- **출처:** NN/g Trustworthiness in Web Design — 비실측 값 구별 불가 0(3단계 #4) · Google Expressive Design Research(#7)

**4-2-3. 3초 판정이 서로 다투고 척도가 없다 — «Risk-On 우위» vs 한 스크롤 아래 «FEAR», 리스크 60/61/68/69 가 캡처마다 흔들림 — [양쪽] [확실] · 심각도 높음 · 비용 중 · 기준 #4, #7**
- **관측:** 첫 뷰포트의 유일한 so-what 은 «Risk-On 우위» + 리스크 정수 하나다. 같은 현물 +1.21% 를 두고 리스크 값이 dash_default-top_17e(11:08) 68 · dash_default-top_promax(10:56) 61 · _probe_relaunch_promax(13:14) 60 · firstrun_10-landing-20s_17e(13:18) 69 — 4분 차 두 기기에서 9점 차이가 나는데 화면엔 척도(0~100?)·전일 값·구성 요소가 없어 «68 이 어제보다 나은지» 를 매일 오는 사용자도 알 수 없다. riskScore 는 futuresAvg·cashAvg·breadth·F&G·VIX 변화의 가중합(page.tsx:855) 이라 입력 도착 여부에 따라 흔들리는 것으로 보인다[추정]. 한 스크롤 아래 MACRO 2행의 F&G 는 35.3 «FEAR» amber 배지(dash_default-mid_promax) — 첫 뷰포트 «Risk-On» 과 다음 뷰포트 «FEAR» 가 화해 없이 공존한다. 재실행 10초 시점(dash_A11Y-textXXXL-top_17e) 에는 «Risk-On 우위» 가 녹색으로 떠 있는데 그 근거인 선물·현물·리스크 3박스는 «—» — 판정이 근거보다 먼저 온다. 소스(page.tsx:1699·:1714) 는 둘 다 regimeReady(:865) 로 게이트돼 있어 이 조합을 만들 수 없으므로 캡처된 빌드와 소스의 불일치는 [미확인] 으로 남긴다. (`dash_default-top_17e` · `dash_default-top_promax` · `_probe_relaunch_promax` · `firstrun_10-landing-20s_17e` · `dash_default-mid_promax` · `dash_A11Y-textXXXL-top_17e` / `dash/page.tsx:855-867` · `dash/page.tsx:1695-1716`)
- **바꾸는 사용자 행동:** 리스크 숫자 옆에 0–100 트랙과 «어제 마커(고스트)» 가 붙고 F&G 도 같은 칩 문법으로 첫 뷰포트에 오면 → 매일 여는 사용자가 숫자를 기억하지 않고도 «어제보다 오른쪽/왼쪽» 과 «Risk-On 인데 심리는 FEAR» 를 한눈에 읽는다 → 첫 3초에 '변화' 와 '모순' 을 정보로 얻고 Guardian 으로 내려갈지 여기서 끝낼지 결정한다.
- **개선 방향 ①** 리스크 박스를 «게이지 칩» 으로: 6px 트랙(0–100, 42/58 경계 눈금) 위 현재 마커 + 전일 마감 시점 값의 고스트 마커, 숫자 옆 «▲3» 델타. 전일 값은 로컬 저장(하루 1회 기록) 으로 충분. «Risk-On 우위» 헤드라인엔 «(선물·현물·폭·심리·VIX 5요소)» 캡션을 붙여 무엇의 판정인지 말한다. — 트레이드오프: 박스 폭(17e 약 95pt) 에 트랙+숫자+델타가 들어가면 라벨 «리스크» 는 위로 밀려 카드 높이 +10pt; 전일 값이 없는 첫날은 고스트가 비어 있다. ／ **개선 방향 ②** **[과감]** 시장 상태 카드와 MACRO 의 판정 셀(F&G·2s10s) 을 하나의 «판정 스트립» 으로 합쳐 첫 뷰포트 한 줄에 놓는다: «Risk-On 68 ▲3 · 심리 35 FEAR · 커브 NORMAL». 서로 다른 말이 한 줄에 나란히 있으면 모순이 숨겨진 결함이 아니라 «읽을 정보» 가 되고, MACRO 보드에서 판정 배지 2개가 빠져 그 자리는 값 전용 그리드로 단순해진다. — 트레이드오프: «Risk-On 우위» 한 단어의 헤드라인 임팩트가 줄고, 스트립 한 줄 밀도가 17e 390pt 에서 말줄임 위험 → 3항목 고정·약어 규칙 필요; MACRO 2행이 6셀로 줄어 그리드 균형(4열) 이 깨진다. · 실패 가능성: 세 판정이 한 줄에서 서로 반대 색(녹·amber·회) 으로 나란히 서면 첫눈에 «신호등 오류» 처럼 보일 수 있다 → 판정 색은 한 hue 의 명도 3단으로만 쓰고 방향은 글자로 말해야 한다. · 되돌리는 비용: 스트립 컴포넌트 제거 + MACRO 셀 2개 복원, 중.
- **출처:** NN/g Trustworthiness in Web Design(척도·기준 없는 점수, 3단계 #4) · NN/g Progressive Disclosure — so-what 이 위계 상위(#7) · Google Expressive Design Research

**4-2-4. 매 세션 같은 자리에 흰 60pt 띠가 VIX 위에 앉는다 — 광고가 첫 시선이자 유일한 라이트 면 — [양쪽] [확실] · 심각도 높음 · 비용 중 · 기준 #3, #7**
- **관측:** firstrun_10-landing-20s_17e: 첫 랜딩 3초 시점부터 흰 배경 60pt 배너가 탭바 위에 플로팅하며 ETF 행(QQQ/SPY/VIX) 의 스파크라인 영역을 덮는다(firstrun_ZOOM-ad-over-content_17e 에서 «+1.19% / +1.05% / −5.79%» 칩 바로 아래에 흰 띠). VIX 는 첫 뷰포트에서 공포를 읽는 유일한 카드인데 매 세션 그 하단이 가려진다. 첫 뷰포트 면적 광고 7.1%(기준 #7 ≤6% 초과), 크롬 25.7%, 데이터 62.7%. σ2% 블러(firstrun_10-landing-20s_BLUR_17e) 에서 에지·밝기 최대 블록이 둘 다 배너 — 다크 화면에서 유일한 대면적 라이트 요소라 22:30 어두운 방에서 가장 밝은 픽셀이 광고다. 네이티브 배너는 adManager.ts:320-325 ADAPTIVE_BANNER·BOTTOM_CENTER·margin 으로 콘텐츠 «위» 에 떠 있고, app-main 의 padding-bottom(app-view.css:96-102, :546-554) 은 광고 높이를 더하지만 스크롤 중간 위치에서는 여전히 콘텐츠를 덮는다(0-5 항목 4). 반복 사용자는 매번 같은 60pt 를 밀어 올려야 VIX 선과 MACRO 1행을 본다. (`firstrun_10-landing-20s_17e` · `firstrun_ZOOM-ad-over-content_17e` · `firstrun_10-landing-20s_BLUR_17e` · `dash_default-top_17e` / `services/adManager.ts:312-325` · `styles/app-view.css:87-103` · `styles/app-view.css:546-554`)
- **바꾸는 사용자 행동:** 배너가 카드 위에 떠 있지 않고 콘텐츠 흐름 안의 어두운 프레임 슬롯에 들어가면 → 사용자가 매 세션 VIX 를 보려고 60pt 를 스크롤하는 손동작이 사라지고 어두운 방에서 첫 시선이 광고가 아니라 시장 상태로 간다 → 첫 3초 안에 공포 지표까지 읽고 끝낸다.
- **개선 방향 ①** 배너를 «인라인 슬롯» 으로 — MARKET PULSE 와 MACRO BOARD 사이 고정 높이(60pt) 자리에 두어 스크롤과 함께 움직이고 아무것도 덮지 않게 한다. 슬롯은 카드와 같은 반경·1px 테두리의 다크 프레임 안에 넣어 흰 면적을 «카드 하나» 로 읽히게 하고 «SPONSOR» 8pt 라벨을 프레임에 단다. AdMob 인라인 어댑티브 배너는 UI 옵션이지만 뷰어빌리티·수익 영향은 «범위 밖 관찰». — 트레이드오프: 스크롤하면 광고가 화면에서 나가므로 노출 시간이 줄어 eCPM 이 떨어질 수 있다; 슬롯이 첫 뷰포트 안에 있으면 광고 면적 비율(≤6%) 은 그대로라 카드 압축(4-2-02) 과 함께 가야 한다. ／ **개선 방향 ②** **[과감]** 탭바와 배너를 하나의 «하단 독» 으로 합친다 — 배너를 탭바 아일랜드 «안쪽 상단» 12pt 라운드 컨테이너에 넣고(독 총 높이 = 배너 60 + 탭 72 + lift), app-main padding-bottom 에 독 높이를 정확히 더해 어느 스크롤 위치에서도 겹침 0. 광고가 «데이터 위 이물질» 이 아니라 크롬의 일부로 읽히고, 첫 뷰포트에서 데이터와 광고의 경계가 한 줄로 정리된다. — 트레이드오프: 독 높이 130pt+ 로 첫 뷰포트 데이터 면적이 −7%p → 4-2-02 의 밴드 압축 없이는 17e 에서 ETF 행이 완전히 접힌다; 흰 배너를 다크 아일랜드 안에 넣으면 광고주 크리에이티브와의 대비가 커져 오히려 더 튈 수 있어 컨테이너 안쪽에 2pt 다크 마진과 8% 딤 오버레이(정책 허용 범위 내) 규칙이 필요하다. · 실패 가능성: 어댑티브 배너 실제 높이가 기기별로 50~90pt 로 달라지면 독 높이 계산이 어긋나 «탭바 위 틈» 또는 «겹침» 이 생긴다 → 배너 onSize 콜백으로 CSS 변수를 갱신하는 연결이 전제. · 되돌리는 비용: 레이아웃 변수 2개 + 컨테이너 1개 되돌림, 소~중.
- **출처:** NN/g Most Hated Advertising Techniques · Apple HIG Layout(3단계 #3) · NN/g Progressive Disclosure — 블러 첫 시선=핵심 데이터, 광고 ≤6%(#7)

**4-2-5. 07:00 아침 진입의 목적지가 첫 화면에 없다 — 마감 리포트 링크 0, «AI 모닝브리핑» 은 9시간 전 저녁 것, 시각 없음 — [양쪽] [확실] · 심각도 높음 · 비용 중 · 기준 #4, #6, #7**
- **관측:** 장마감 푸시는 22:00·22:20·22:40 UTC = 07:00~07:40 KST(vercel.json:100-108), 탭 시엔 layout.tsx:75-79 가 intel 로 딥링크하지만 배지만 뜬 경우(0-5 항목 21) 아이콘으로 열면 dash 다. dash 에는 intel 로 가는 링크가 없다(라우팅 전수: guardian?tab=reality :1652·2066·2116·2131, cmd :1931, guardian?tab=briefing :2094). 첫 뷰포트엔 어젯밤 마감 변화율(현물 3카드) 만 있고 «리포트» 라는 단어는 스크롤 ≈1 화면 아래(dash_default-mid_17e 에서 TOP MOVERS→히트맵 다음) 브리핑 카드에 처음 나오는데, 제목이 «AI 모닝브리핑»(page.tsx:2018) — 모닝 푸시는 12:10/13:10 UTC = 21:10/22:10 KST(vercel.json:92-96) 전날 저녁에 생성된 미국 프리마켓 브리핑이라 07:00 KST 사용자에겐 ~9시간 전 것이며, API 가 주는 generatedAt(api/guardian/briefing/route.ts:63) 은 화면에 표시되지 않는다. CTA «전체 리포트 읽기 →»(:2094) 는 guardian 브리핑으로 가지 마감 리포트(Intel) 로는 가지 않는다. 시나리오 B 사용자는 «어젯밤 어떻게 끝났고 리포트는 어디» 두 질문 중 두 번째 답을 첫 3화면 안에서 못 찾는다. (`dash_default-top_17e` · `dash_default-mid_17e` · `dash_default-bottom_17e` · `vercel.json:92-108` / `layout.tsx:75-79` · `dash/page.tsx:2018` · `dash/page.tsx:2094` · `app/api/guardian/briefing/route.ts:63`)
- **바꾸는 사용자 행동:** 헤더 아래 첫 줄이 «▶ 9/3 장마감 리포트 · 07:00 발행 · 미열람» 이 되고 브리핑 카드 제목에 «프리마켓 브리핑 · 9/4 07:10 ET(21:10 KST)» 처럼 시각이 박히면 → 아침에 배지만 보고 연 사용자가 Intel 탭을 뒤지지 않고 한 탭에 리포트로 가고, 9시간 전 브리핑을 «오늘 아침 것» 으로 오해하지 않는다 → 푸시 배지 진입의 리포트 도달률이 오른다.
- **개선 방향 ①** 브리핑 카드 제목을 «세션 명사 + 발행 시각» 으로 바꾼다(«장마감 브리핑 · 9/3 16:00 ET / 05:00 KST», «프리마켓 브리핑 · 07:10 ET») — generatedAt 을 제목 줄에 렌더하고 «AI 모닝» 같은 시간대 은유 라벨을 없앤다. 카드 CTA 를 두 개로 나눠 «마감 리포트 →»(intel) 와 «프리마켓 브리핑 →»(guardian) 을 각각 잇고, 07:00~12:00 KST 에는 브리핑 카드를 시장 상태 카드 바로 아래로 올리는 시간대별 블록 순서를 둔다(순서만 바꾸는 레이아웃 규칙). — 트레이드오프: 블록 순서가 시간대별로 바뀌면 «늘 같은 자리» 라는 반복 사용의 안정감이 흔들린다 → 바뀌는 건 브리핑 카드 한 블록만, 나머지 순서는 고정해야 한다; 제목이 길어져 17e 에서 두 줄. ／ **개선 방향 ②** **[과감]** 헤더 바로 아래 뉴스 티커 줄을 «오늘의 리포트 줄» 로 바꾼다 — 그 한 줄이 사용자의 다음 행동을 지시한다: «▶ 9/3 장마감 리포트 · 07:00 발행 · 미열람» / 장중엔 «● 프리마켓 브리핑 07:10 ET · 읽음 ✓» / 리포트 없는 시간엔 «다음 발행 07:00 KST». 열람 여부는 로컬 저장. 뉴스 티커는 브리핑 카드 안 «실시간» 탭으로 내려간다(이미 그 카드에 뉴스 5건이 있다, page.tsx:2101-2130). 첫 뷰포트에서 «리포트 앱» 이라는 정체성이 헤더 다음 줄에 선다. — 트레이드오프: 속보(urgency≥8) 노출이 첫 뷰포트에서 빠져 «속보» 배지의 즉시성이 사라진다 → 속보 발생 시에만 리포트 줄을 30초간 속보로 덮는 예외가 필요; 티커 탭 → guardian?tab=reality 경로가 한 단계 깊어진다. · 실패 가능성: 주말·휴일에 «다음 발행 월 07:00» 이 3일 내내 같은 문장으로 서 있으면 첫 줄이 죽은 줄이 된다 → 휴일엔 줄을 접고 시장 상태 카드가 위로 붙어야 한다. · 되돌리는 비용: 컴포넌트 위치 교환(티커 ↔ 리포트 줄), 소.
- **출처:** NN/g Information Scent(은유형 라벨에 콘텐츠 명사 부제, 3단계 #6) · NN/g Trustworthiness — 기준 시각 100%(#4) · NN/g Progressive Disclosure(#7)

**4-2-6. 22:30 어두운 방에서 LIVE 는 «테두리 점멸» 로만 온다 — 9카드 동시 호흡 + −0.00% 적색 점멸 + 동작 줄이기 미적용 — [양쪽] [추정] · 심각도 중간 · 비용 소 · 기준 #10, #4, #3**
- **관측:** 장중 캡처가 없어 코드로 추정한다: .pulseCard.live.up/.down 에 liveBlinkUp/Down 1.8s infinite(dash.module.css:311-338) — 50% 지점 border-color alpha 1.0 + box-shadow 16px 0.5 + inset 8px; pulseDot 2s(:182); macroCell.live 2.2s(:401-409); WS 틱마다 flashUp/Down 1.2s(:1414-1442). 정규장에는 선물 3 + 현물 3 + ETF 3 + 매크로 셀이 서로 다른 주기(1.8/2.0/2.2s) 로 동시에 점멸한다. 캡처로 확실한 부분: dash_ZOOM-pulse-cards_17e 에서 «▼ −0.00%» S&P500 F 카드가 적색 테두리·적색 글로우(live.down → liveBlinkDown 적용 조건) — 보합이 «급락 경보» 색으로 숨쉰다. prefers-reduced-motion 처리는 app-view.css:336-341 세 클래스(.app-brief-toggle, .app-live-index-pulse) 뿐이며 dash 모듈의 점멸·플래시는 제외된다. 22:30 개장 직후 어두운 방에서 «어디가 움직였나» 를 3초에 잡아야 하는 사용자에게, 모든 카드가 같은 세기로 숨쉬면 움직인 곳과 멈춘 곳이 구별되지 않는다. (`dash_ZOOM-pulse-cards_17e` · `dash_default-top_17e` / `dash/dash.module.css:311-338` · `dash/dash.module.css:182` · `dash/dash.module.css:401-409` · `dash/dash.module.css:1414-1442` · `styles/app-view.css:336-341` · `dash/page.tsx:1744-1758`)
- **바꾸는 사용자 행동:** 9장이 동시에 숨쉬지 않고 «값이 바뀐 카드만 1회 번쩍» 이며 ±0.05% 이내는 중립색이면 → 22:30 개장 직후 사용자가 움직인 카드만 눈으로 좇아 3초 안에 «지금 어디가 움직이나» 를 잡는다 → 화면 전체를 다시 훑거나 −0.00% 적색에 놀라 Guardian 으로 건너가는 헛동작이 준다.
- **개선 방향 ①** 상시 점멸(liveBlink*·macroLiveBlink) 을 제거하고 LIVE 는 정적 시안 도트 + 시각(4-2-01) 으로만 표시; 틱 플래시(flashUp/Down) 만 남기되 1.2s 1회·1초 스로틀. 변화율 ±0.05% 이내는 up/down 색 대신 중립(회색) 클래스, «−0.00» 은 «0.00» 으로 부호 제거(page.tsx:1750-1752 의 up 판정과 포맷 1곳). dash.module.css 에 prefers-reduced-motion 블록을 추가해 남은 플래시도 끈다. — 트레이드오프: «살아있다» 는 상시 신호가 약해져 틱이 뜸한 시간대(프리마켓 초반) 엔 앱이 멈춘 것처럼 보일 수 있다 → 헤더 시계(4-2-01 radical) 가 그 역할을 대신해야 한다. ／ **개선 방향 ②** **[과감]** 테두리·글로우 애니메이션을 전부 없애고 «숫자 자체가 움직이는» 단일 모션만 둔다 — 값이 바뀌면 자릿수가 오도미터처럼 굴러가고(200ms), 바뀐 자릿수만 0.6s 동안 밝아졌다 가라앉는다. 카드 프레임은 정지·무광. 어두운 방에서 눈은 밝기 변화가 있는 «숫자» 로만 가고, 정지한 값은 정지해 보인다. 이 앱의 «표현 문법» 이 «프레임이 아니라 숫자가 산다» 로 정리된다. — 트레이드오프: 틱이 잦은 정규장 개장 5분간은 여러 카드의 숫자가 계속 굴러 오히려 산만해질 수 있어 1초 스로틀과 «같은 방향 연속 틱은 합치기» 가 필요; 모노 폰트의 자릿수 롤 구현 비용. · 실패 가능성: 동작 줄이기 ON 사용자에게 롤이 그대로 돌면 #10 위반 그대로다 → reduce-motion 에서는 롤 대신 색만 바뀌게 분기해야 한다. · 되돌리는 비용: 숫자 컴포넌트 1개를 span 으로 되돌림, 소.
- **출처:** Apple HIG Motion·HIG Accessibility(동작 줄이기, 3단계 #10) · MDN signDisplay(−0.00 부호, #4) · NN/g Most Hated Advertising Techniques(자동 재생·점멸 주의 탈취, #3)

**4-2-7. 홈이 «내가 마지막에 본 종목»을 알고 있는데 화면에 꺼내지 않는다 — [양쪽] [확실] · 심각도 낮음 · 비용 소 · 기준 #7**
- **관측(검증 후 재작성):** dash 첫 뷰포트에서 탭 가능한 것은 기어(30×30px, `dash.module.css:58-70` 의 `min-height:30px !important` 로 44pt 규칙을 명시적으로 무력화)·뉴스 티커(`page.tsx:1651` → guardian)·탭바 5개뿐이고, MARKET PULSE 9카드와 시장 상태 카드는 `onClick` 이 없다(`page.tsx:1744/1775/1811`, `:1695-`). 종목으로 가는 시각적 손잡이는 TOP MOVERS 카드인데 약 0.2~0.3 뷰포트 아래에 있다(`dash_default-mid_17e`). 한편 Command 는 마지막 종목과 최근 5종목을 이미 기억한다(`cmd/page.tsx:2055` 의 `searchParams.get('t') || localStorage.getItem('app-active-ticker') || 'NVDA'`, 칩 스트립 `:2999-3006`)는데 **dash 는 그 값을 읽지 않는다**(dash 에 `localStorage` 사용 0건).
- **먼저, 이 지적의 초안이 틀렸던 부분:** 초안은 «매 세션 홈 → Command → 검색 → 입력 3단계가 반복된다»고 썼고 검증에서 반증됐다. `AppBottomNav.tsx:91` 이 쿼리 없이 이동해도 `cmd/page.tsx:2055` 의 폴백이 걸리므로 **Command 탭 1탭이 곧 «어제 본 종목»**이고, 최근 5종목은 2탭이다. 따라서 홈에 칩 스트립을 두어 얻는 실제 절감은 «마지막 종목 0탭 · 그 외 최근 종목 2→1탭»이지 3→1 이 아니다. 심각도를 중간에서 **낮음**으로 내리고 문안을 다시 썼다.
- **바꾸는 사용자 행동:** 헤더의 30px 기어가 44pt 로 커지고 그 옆에 최근 종목 칩이 보이면 → 낮에 잠깐 연 사용자가 홈에서 두 번째 종목으로 바로 가고(2탭 → 1탭) → 기어를 눌러 설정에 들어갈 때 빗나가 재탭하는 일이 없어진다.
- **개선 방향 ①** 기어 히트 영역을 44×44pt 로(시각 크기는 30px 유지, `!important` 제거) — 트레이드오프: 헤더 우측 여백이 줄어 워드마크와의 간격 재조정이 필요하다. ／ **개선 방향 ②** 뉴스 티커 아래에 Command 의 최근 티커 칩 스트립을 그대로 재사용(같은 localStorage 키를 읽기만 함) — 트레이드오프: 첫 뷰포트에 44pt 행이 하나 더 들어가 MARKET PULSE 세 번째 행이 폴드 아래로 내려간다 · 절감이 크지 않으므로(위 문단) 우선순위는 낮다.
- **출처:** Apple HIG Accessibility(44×44pt) · 3단계 #2·#7 · Fiscal.ai «관심종목이 첫 화면»(2-1 ⑤).

**4-2-8. 잠금 카드가 매일 같은 말을 한다 — «오늘 14.2K 잠금해제» 정적 문자열, 해제 상태는 첫 뷰포트에 흔적 0 — [양쪽] [확실] · 심각도 중간 · 비용 소 · 기준 #4, #7**
- **관측:** dash_default-bottom_17e: ValueWall 은 스크롤 ≈2 화면 아래 페이지 바닥에 있고 «오늘 14.2K 잠금해제» 는 코드 상수(page.tsx:785·801·817·833, ValueWall.tsx:336 에서 렌더) 라 매일·매 시간 같은 숫자다. 재방문 사용자는 어제도 «14.2K», 오늘도 «14.2K» 를 본다 — 3단계 #4 «정적 사회적 증거 0» 위반이며 반복 노출될수록 «이 숫자는 가짜» 라는 학습이 쌓인다. 1시간 해제(UNLOCK_KEY, ValueWall.tsx:9·141-146) 뒤 다음 세션에 다시 오면 첫 뷰포트에는 «열려 있다/닫혔다/남은 시간» 단서가 전혀 없고(해제 배너 «1시간 동안 잠금해제됨» 은 카드 안에서만, :54), 티저 «$62.3B · 4개 중 1개» 는 실측이지만 역시 바닥에서만 보인다. 광고를 보고 열었던 사용자가 다음 날 같은 자물쇠·같은 문구·같은 CTA 를 같은 자리에서 다시 만나는 것이 반복 사용의 마모 지점이다. 탭 전환 5회마다 전면광고 시도(useInterstitialAd.ts:17, 첫 세션 제외; adManager.ts:187-189 1분 유예·3분 간격·세션 3회) 는 정책이라 «범위 밖 관찰» 로만 남긴다. (`dash_default-bottom_17e` · `dash_default-bottom_promax` / `dash/page.tsx:785` · `dash/page.tsx:2140-2150` · `components/app/ValueWall.tsx:336` · `components/app/ValueWall.tsx:54` · `components/app/ValueWall.tsx:141-146` · `hooks/useInterstitialAd.ts:17`)
- **바꾸는 사용자 행동:** 잠금 요소가 시장 상태 카드의 4번째 박스(«기관 $62.3B 🔒 / 열림 42분 남음») 로 첫 뷰포트에 오고 정적 «14.2K» 가 «내 이력» 한 줄로 바뀌면 → 어제 해제한 사용자가 오늘 열자마자 닫혔는지 열려 있는지 보고 결정한다 → 바닥까지 스크롤해 같은 카드를 다시 만나는 일이 없고, 매일 같은 가짜 숫자를 보며 쌓이던 불신이 멈춘다.
- **개선 방향 ①** «오늘 14.2K 잠금해제» 를 지우고 그 줄을 «내 상태» 로 바꾼다: 미해제 시 «어제 22:40 해제함 · 오늘 미해제», 해제 중엔 «42:10 남음» 카운트다운(UNLOCK_KEY 의 unlockedUntil 로 계산 가능). 자물쇠 원의 amber conic 링을 남은 시간 게이지로 재사용한다. — 트레이드오프: 사회적 증거가 주던 «남들도 한다» 설득이 사라져 보상형 전환율이 변할 수 있다(범위 밖); 첫 방문자는 이력이 없어 줄이 비므로 그때만 «광고 1편 = 1시간» 규칙 문장을 둔다. ／ **개선 방향 ②** **[과감]** ValueWall 을 페이지 바닥에서 떼어 «시장 상태 카드의 4번째 박스» 로 올린다 — 선물·현물·리스크 옆에 «기관 $62.3B 🔒»(티저 값은 이미 실측 institutionalSignals[0], page.tsx:2146). 잠긴 동안은 값 + 자물쇠 아이콘만, 탭하면 잠금 시트(CTA·면책·Pro) 가 뜨고, 해제된 1시간 동안은 같은 자리에 값 + 남은 시간이 산다. 매일 보는 첫 뷰포트에 «열림/닫힘» 이 상시 보이고, 바닥의 대형 amber 카드(첫 시선 경쟁 요소) 는 사라진다. — 트레이드오프: 17e 폭에서 4박스는 각 80pt 가 안 돼 «중립 +0.02%» 같은 값이 말줄임된다 → 2×2 그리드로 전환하면 카드 높이 +48pt; 광고 CTA 가 첫 뷰포트에 «아이콘» 으로만 있어도 #7 의 «광고 ≤6%» 와 «so-what 이 잠금 뒤에만» 판정에 걸릴 수 있어 4박스 중 1개만, 값은 실측 노출이 조건. · 실패 가능성: 잠금 박스가 리스크 박스와 같은 문법(라벨+숫자) 으로 보이면 사용자가 «$62.3B» 를 시장 판정의 일부로 오독한다 → 자물쇠 아이콘과 점선 테두리로 «다른 종류» 임을 분명히 해야 하고, 실패하면 4-2-04 의 판정 혼선을 키운다. · 되돌리는 비용: 박스 1개 제거 + ValueWall 위치 복원, 소.
- **출처:** NN/g Trustworthiness in Web Design — 정적 사회적 증거 0(3단계 #4) · NN/g Progressive Disclosure — 잠금 so-what 미리보기 1줄 100%(#7)

### 4-3. 기능 노출 — «이 앱이 무엇을 해주는가»

**4-3-1. 헤더 서브타이틀 «DARK POOL INTEL» 이 약속하는 것과 첫 화면이 보여주는 것이 다르다 — 대시보드 전체에 다크풀 0회 — [표현층] [확실] · 심각도 높음 · 비용 소 · 기준 #6, #7**
- **관측:** dash_default-top_17e 헤더 2행 «DARK POOL INTEL»(10px 800 자간 .13em, text-muted, 실측 대비 7.4). 그 아래 첫 뷰포트는 뉴스 티커 · 시장 상태(선물/현물/리스크) · 지수 선물 3 · 현물 지수 3 · ETF/변동성 3. 스크롤 끝까지(dash_default-mid_17e: 매크로·무버·히트맵·뉴스펄스, dash_default-bottom_17e: ValueWall·푸터) «다크풀» 이라는 단어도 값도 0개. 앱에서 다크풀이 실제로 보이는 곳은 Command 히어로(별도 탭)뿐. 코드 :1636 주석은 «다크풀이 복원돼 다시 사실이 됐다»고 하지만 이 화면에선 사실이 아니다. Pro Max 재실행(_probe_relaunch_promax)도 동일. 반면 시장 상태 카드 옆 문장은 «선물 흐름 추적»을 말해, 헤더는 다크풀·본문은 선물·지수로 첫 3초의 정체가 둘로 갈린다. (`dash_default-top_17e` · `dash_default-mid_17e` · `dash_default-bottom_17e` · `_probe_relaunch_promax` / `dash/page.tsx:1636-1637` · `dash/dash.module.css:46-50`)
- **바꾸는 사용자 행동:** 헤더 서브라인이 «지금 이 화면이 보여주는 것»이거나 다크풀로 가는 문이 되면 → 사용자가 «다크풀은 어디서 보나»를 헤더에서 바로 찾거나 첫 화면을 그 자체로 이해하고 → 헤더의 약속과 화면 내용이 어긋나는 첫인상이 사라진다.
- **개선 방향 ①** 서브라인을 화면 서술로 교체: ko «시장 상태 · 선물 라이브» / en «MARKET STATE · LIVE FUTURES», 세션에 따라 이미 있는 pulseStatusLabel(:866)을 재사용해 자동 갱신. — 트레이드오프: 브랜드 포지셔닝 문구(다크풀)가 첫 화면에서 사라져 스토어 리스팅·OG 와 앱 톤이 달라진다. ／ **개선 방향 ②** **[과감]** 헤더에서 서브타이틀을 없애고 로고+워드마크만 남긴 뒤, 기어 옆에 «다크풀 41% ›» 진입 칩을 둔다 — Command 가 이미 갖고 있는 시장평균 다크풀 값을 칩 값으로 쓰고 탭하면 Command 로 이동. 헤더가 «약속»이 아니라 «문»이 된다. — 트레이드오프: 390pt 헤더 폭에서 칩+기어 공존 — 기어를 44pt 로 올리면 칩 폭이 압박되고, 값 로딩 전엔 «—»가 헤더에 뜬다. · 실패 가능성: 칩이 광고 배지처럼 읽혀 무시되거나, 값이 stale 이면 «헤더가 틀린 숫자를 상시 노출»하는 4-4 유형 결함이 된다. · 되돌리는 비용: 헤더 블록 1개(:1620-1648) 복원, 라우트 변경 없음, 중.
- **출처:** NN/g Information Scent — 라벨은 «page is about»의 정확한 서술(3단계 #6 출처); NN/g Trustworthiness in Web Design — Upfront·Correct(#4 보조)

**4-3-2. 탭바 5라벨이 전부 영어 은유형이고 콘텐츠 명사 부제가 0/5 — 차별 기능으로 가는 유일한 경로가 «Guardian·Command·Flow·Intel» — [표현층] [확실] · 심각도 높음 · 비용 소 · 기준 #6, #5**
- **관측:** firstrun_10-landing-20s_17e·dash_default-top_17e 탭바 «Dashboard · Guardian · Command · Flow · Intel», 600 10px Inter(app-view.css:587-593), 아이콘은 방패·터미널 창·파형·게이지. AppBottomNav.tsx:6-12 에 라벨 하드코딩, :79-81 주석 «Brand/feature names — kept in English across all locales». 각 탭이 실제로 여는 것은 그 페이지 안에서만 한국어로 선언된다: Guardian «매크로 리스크 감시»(guardian/page.tsx:34), Flow «실시간 옵션 플로우»(flow/page.tsx:39), Intel «섹터 인텔리전스 / AI 섹터 리포트 · 옵션/컨텍스트/수급 흐름 통합»(intel/page.tsx:1198-1200). 즉 옵션 플로우·다크풀·AI 섹터 리포트·매크로 리스크라는 명사는 탭을 눌러야 처음 나온다. 3단계 #6 «은유형 라벨 100% 콘텐츠 명사 부제» 기준으로 Guardian·Command·Intel 0/3, Flow 도 «무엇의 흐름»인지 없음. (`firstrun_10-landing-20s_17e` · `dash_default-top_17e` / `components/app/AppBottomNav.tsx:6-12` · `components/app/AppBottomNav.tsx:79-81` · `styles/app-view.css:587-593` · `guardian/page.tsx:34` · `flow/page.tsx:39` · `intel/page.tsx:1198-1200`)
- **바꾸는 사용자 행동:** 탭 라벨에 콘텐츠 명사(옵션·다크풀·리스크·섹터)가 붙으면 → 신규 사용자가 탭바만 보고 «옵션 플로우가 있구나»를 알고 맞는 탭을 고르며 → 잘못된 탭 진입·이탈이 줄고 핵심 기능 도달률이 오른다.
- **개선 방향 ①** 라벨 2줄: 영어 브랜드 위 + 한국어 콘텐츠 명사 아래(«Flow / 옵션», «Command / 종목», «Guardian / 리스크», «Intel / 섹터») — 각 페이지 ko 사전의 기존 문자열을 그대로 쓴다. — 트레이드오프: 탭바 72px 안에 아이콘 22px + 2줄 → 아이콘 축소 또는 탭바 높이 +8px(하단 패딩 계산 app-view.css:97-98 재조정). ／ **개선 방향 ②** **[과감]** 은유 이름을 탭바에서 완전히 빼고 UI 언어 콘텐츠 명사 단일 라벨로: «홈 · 리스크 · 종목 · 옵션 · 섹터»(en Home·Risk·Ticker·Options·Sectors). Guardian·Intel 같은 브랜드 명사는 각 페이지 헤더에만 남긴다. — 트레이드오프: 마케팅·스토어 스크린샷·푸시 딥링크가 «Guardian/Intel»을 쓰므로 «누른 탭 이름 ≠ 도착 페이지 이름» 구간이 생기고, 3언어 × 5 문자열을 새로 정한다. · 실패 가능성: «종목»처럼 너무 일반적인 명사를 고르면 Command 의 다크풀 정체성이 사라져 정보 향기가 오히려 평탄해진다 — 5초 라벨 예측 테스트로 명사를 골라야 한다. · 되돌리는 비용: AppBottomNav.tsx 한 파일, 소. ／ **개선 방향 ③** **[과감]** 아이콘을 기능 명사형으로 교체: 방패(Guardian)→반원 게이지, 터미널 창(Command)→다크풀 % 원, 파형(Flow)→콜/풋 대칭 막대, 나침반(Intel)→섹터 4분면 — 라벨 없이도 아래 콘텐츠를 예측하게 한다. — 트레이드오프: 커스텀 아이콘 5종 제작과 다크 배경 22px 판독 검증 비용. · 실패 가능성: 22px 에서 «다크풀 %»·«콜/풋 막대»가 형태 구분이 안 돼 아이콘 5개가 서로 닮아 보인다. · 되돌리는 비용: TabIcon SVG 5개 되돌리기, 소.
- **출처:** NN/g Information Scent(3단계 #6 합격선 «탭바 5라벨 정답률 ≥80% · 은유형 라벨 100% 콘텐츠 명사 부제»)

**4-3-3. 첫 뷰포트에서 «해볼 수 있는 기능»이 0 — 데이터 카드 12개 전부 막다른 길, 옵션 플로우로 가는 인앱 링크는 대시보드 전체에 없다 — [양쪽] [확실] · 심각도 높음 · 비용 중 · 기준 #6, #7**
- **관측:** dash_default-top_17e 첫 뷰포트에서 탭 가능한 것은 기어(설정, dash/page.tsx:1641) · 뉴스 티커(→ guardian?tab=reality, :1652 — 화살표·밑줄 등 시각 어포던스 0, 우측엔 «6h»뿐) · 탭바 5개. 시장 상태 카드(:1695-1717)와 MARKET PULSE 9카드(:1745-1823)에는 onClick 이 없다. 종목 화면(Command = 다크풀·맥스페인)으로 가는 인앱 링크는 두 화면 아래 TOP MOVERS 카드(:1931)와 VIEW ALL(:1898)뿐이고, 옵션 플로우(Flow)로 가는 router.push 는 대시보드 파일 전체(:1641-2131)에 하나도 없다. 즉 첫 화면은 «보기만 하는» 화면이고, 이 앱의 차별 기능은 탭바의 영어 은유 라벨(4-3-02)을 찍어서 찾아야 한다. _probe_relaunch_promax(Pro Max)도 동일 — 큰 화면에서도 첫 뷰포트 안에 진입점이 늘지 않는다. (`dash_default-top_17e` · `_probe_relaunch_promax` · `dash_default-mid_17e` / `dash/page.tsx:1641` · `dash/page.tsx:1652` · `dash/page.tsx:1695-1717` · `dash/page.tsx:1745-1823` · `dash/page.tsx:1898` · `dash/page.tsx:1931`)
- **바꾸는 사용자 행동:** 첫 뷰포트의 카드가 각자 «다음 화면»으로 열리면(지수·ETF 카드→그 종목의 Command, 시장 상태→Guardian, 티커→표시된 화살표) → 사용자가 눈앞의 숫자를 눌러 원인을 파고들고 → 탭바 이름을 해독하지 않고도 다크풀·옵션·리스크 기능에 도달한다.
- **개선 방향 ①** 진입 어포던스 추가: 시장 상태 카드 우측 «›» + 탭 → Guardian, 뉴스 티커 우측 «›», SPY/QQQ/현물 지수 카드 탭 → cmd?t=SYM(무버 카드가 이미 쓰는 :1931 라우트 재사용). 선물 3카드는 Command 에 종목 페이지가 없으므로 비활성 모양으로 구분. — 트레이드오프: 9카드 대부분이 탭 가능해지면 스크롤 중 오탭이 늘고, 선물 3카드만 «눌러도 안 되는» 예외가 된다. ／ **개선 방향 ②** **[과감]** 첫 뷰포트를 «기능 진입 3행»으로 재구성: 시장 상태 아래에 «오늘의 다크풀(Command 시장평균 값) → 옵션 플로우(Flow 총 프리미엄 값) → 섹터 리포트(Intel 최신 발행)» 각 1행 요약 + 탭 진입을 두고, MARKET PULSE 9카드는 그 아래로 내린다. 기존 데이터와 기존 라우트만 쓴다. — 트레이드오프: 지수 그리드가 첫 뷰포트에서 절반 밀려나 «시세판»을 기대하는 재방문 사용자의 반발 가능; 3행 값이 블록별 도착 시차로 «—» 를 노출(0-5 #17 유형). · 실패 가능성: 3행이 광고 배너 바로 위에 놓이면 흰 배너와 시각 경쟁해 블러 첫 시선이 여전히 광고에 간다(기준 #7 «광고 0탭»). · 되돌리는 비용: 대시 JSX 블록 순서 + 3행 컴포넌트 1개, 라우트 변경 없음, 중.
- **출처:** NN/g Progressive Disclosure — «Initially, show users only a few of the most important options»(3단계 #7); NN/g Information Scent(#6)

**4-3-4. 유일한 so-what «Risk-On 우위»가 위계 상위가 아니고 근거 문장이 없다 + «리스크 69» 라벨이 의미를 뒤집는다 — [양쪽] [확실] · 심각도 높음 · 비용 중 · 기준 #7, #5**
- **관측:** 첫 뷰포트에서 해석에 해당하는 요소는 «Risk-On 우위»(900 16px, dash.module.css:1188-1194) 하나다. 이 글자는 아래 9카드의 가격(모노 굵게, 실측 대비 17.1)·우상단 «FUTURES LIVE» 시안 필과 크기가 같거나 작고, 카드 면적은 시장 상태 ≈12% 대 MARKET PULSE ≈50%. dash_default-top_BLUR_17e 에서 남는 덩어리는 9카드 그리드와 시안 필, firstrun_10-landing-20s_BLUR_17e 에선 흰 광고 배너(y≈660pt)이고 해석 문구는 작은 녹색 점이다. 근거(why)는 없다: 옆 문장은 판정 이유가 아니라 데이터 상태 문구(pulseStatusNote :867 «정규장 밖에도 선물 흐름은 ET 기준으로 추적됩니다»)이고 17e 에선 «…추…»로 잘린다(regimeNote nowrap+ellipsis :1209-1216). «리스크 69»는 riskScore ≥58 이면 녹색 positive(:1698, :1712) = 위험 «선호»인데 라벨이 «리스크»라 «위험도 69»로 읽히며 눈금(0~100)·방향 표기가 없다. 재실행 10초엔 3박스가 «—»인데 «Risk-On 우위»는 이미 떠 있어(dash_A11Y-textXXXL-top_17e) 판정이 값보다 먼저 나온다. (`dash_default-top_17e` · `dash_default-top_BLUR_17e` · `firstrun_10-landing-20s_BLUR_17e` · `dash_A11Y-textXXXL-top_17e` / `dash/page.tsx:856` · `dash/page.tsx:867` · `dash/page.tsx:1698` · `dash/page.tsx:1712` · `dash/dash.module.css:1188-1194` · `dash/dash.module.css:1209-1216`)
- **바꾸는 사용자 행동:** 해석 1줄이 첫 뷰포트에서 가장 큰 글자가 되고 바로 아래에 «왜(현물 +1.21% 상방이 이끈다)»가 붙으면 → 사용자가 숫자 21개를 스캔하지 않고 «오늘은 위험 선호, 이유는 현물 강세»를 3초 안에 읽고 → 다음 행동(어느 탭을 열지)을 근거를 갖고 고른다.
- **개선 방향 ①** «Risk-On 우위»를 22~24px 로 올리고, 라벨 «리스크» → «위험 선호도 69/100», 근거 문장은 이미 계산돼 있는 cashTone/futuresTone(:856-858)으로 자동 생성(«현물 +1.21% 상방이 이끕니다»), 데이터 상태 문구는 ⓘ 뒤로 보낸다. 값 미도착 시 판정도 «—». — 트레이드오프: 카드 높이 +16px → 17e 첫 뷰포트에서 ETF 행이 더 잘린다. ／ **개선 방향 ②** **[과감]** 첫 뷰포트를 «판정 히어로»로 뒤집기: 상단 40% 를 riskTone 한 줄(32px) + 근거 3칩(선물·현물·폭) + 기준 시각으로 채우고, MARKET PULSE 는 1행만 보이는 접힘 상태로 시작한다. 값 도착 전엔 히어로가 스켈레톤. — 트레이드오프: 시세판 스캔을 원하는 사용자는 한 번 더 눌러야 하고, 흰 광고 배너가 어두운 히어로와 대비돼 더 도드라질 수 있다. · 실패 가능성: riskScore 가 척도 포화·오염 상태(메모리: 만점에 붙은 점수)면 «틀린 판정을 32px 로» 내보낸다 — 4-4 정직성 게이트와 함께 가야 한다. · 되돌리는 비용: 대시 상단 JSX 재배치, 중.
- **출처:** NN/g Progressive Disclosure + Google Design «Expressive Design: Google's UX Research»(핵심 UI 요소 발견 속도 — 3단계 #7 출처)

**4-3-5. ValueWall 이 «상품»이 아니라 «장벽»으로 읽힌다 — 잠긴 4신호는 형체가 없고 자물쇠·주황 CTA·정적 14.2K 만 보인다 — [표현층] [확실] · 심각도 높음 · 비용 중 · 기준 #7, #4**
- **관측:** dash_default-bottom_17e·dash_default-bottom_promax: 카드에 섹션 헤더가 없고(다른 카드는 «MARKET PULSE»류 제목 보유) 첫 요소가 «무료 미리보기 · 기관급 펄스 / $62.3B · 4개 중 1개» 티저 → 44px 자물쇠 원(amber conic, ValueWall.module.css:145-159) → «기관급 마켓 펄스» → 설명 → 주황 그라디언트 CTA «▶ 광고 보고 1시간 해제»(:176-195) → «오늘 14.2K 잠금해제» → 면책. 잠긴 4신호(기관 신규 포지션·딜러 감마·섹터 순환·시장 폭)는 blur 11px + opacity .6(:99-110) 위에 veil 그라디언트 0.42→0.95(:112-121)가 덮여 캡처에서 형체 0 — «무엇을 사는지»가 안 보인다. 티저 값 «$62.3B»는 institutionalSignals[0](기관 신규 포지션 notional, dash/page.tsx:1071-1081, :2144-2147)인데 라벨은 «기관급 펄스»라 어느 신호의 얼마인지 없다. «오늘 14.2K 잠금해제»는 정적 문자열(:785). 온보딩 2/2 는 첫 화면보다 먼저 «데이터 잠금해제 — 광고 기반 미리보기 안내»(AppFirstRunOnboarding.tsx:60, firstrun_04-step-2of2_17e)를 예고해 사용자가 가치를 보기 전에 «잠금»부터 배운다. 첫 뷰포트엔 ValueWall 이 없으므로(1-A-1 #9) 잠금 so-what 미리보기 1줄은 첫 뷰포트에서 0. (`dash_default-bottom_17e` · `dash_default-bottom_promax` · `firstrun_04-step-2of2_17e` / `components/app/ValueWall.module.css:99-121` · `components/app/ValueWall.module.css:145-159` · `components/app/ValueWall.module.css:176-195` · `dash/page.tsx:785` · `dash/page.tsx:1071-1081` · `dash/page.tsx:2144-2147`)
- **바꾸는 사용자 행동:** 잠긴 카드가 4신호의 «이름 + 오늘 값 1개씩»을 블러 없이 먼저 보여주고 자물쇠·CTA 를 그 아래 한 행으로 내리면 → 사용자가 «딜러 감마가 숏이구나, 해석을 보려면 광고»를 이해하고 해제를 «구매»로 결정하며 → 광고 CTA 가 벽이 아니라 상품 카탈로그로 읽혀 해제율과 신뢰가 함께 오른다.
- **개선 방향 ①** 티저 1행을 4행으로: 각 신호 «라벨 + kicker(«변동성을 누르나 키우나») + 값»은 노출하고 «insight 문장·백분위·막대»만 잠근다. 자물쇠 원 삭제, CTA 는 카드 하단 1행, 정적 «14.2K» 제거. 카드에 다른 카드와 같은 섹션 제목을 단다. — 트레이드오프: 가치의 절반을 무료로 주면 해제 동기가 줄 수 있다 — «값은 보이되 해석·추이는 잠금» 선을 지켜야 한다. ／ **개선 방향 ②** **[과감]** 자물쇠·블러·앰버 글로우·소셜프루프를 전부 폐기하고 «기관 4신호»를 다른 카드와 같은 문법(제목 + 4셀 그리드)으로 그리되, 잠긴 셀만 값 자리에 «▶ 1시간 보기» 텍스트 버튼을 둔다 — 잠금이 «카드의 상태»가 아니라 «셀의 값 하나»로 축소된다. — 트레이드오프: 광고 CTA 노출 면적이 1/5 로 줄어 광고 수익이 줄 수 있고, 잠금 카드의 «프리미엄 룩»이 사라진다. · 실패 가능성: 텍스트 버튼이 «값 없음(—)»과 혼동된다 — 버튼 스타일이 셀 값과 명확히 달라야 한다. · 되돌리는 비용: ValueWall 렌더 분기 + dash 사용처, Command/Guardian/Flow 의 ValueWall 4곳에 파급, 중.
- **출처:** NN/g Progressive Disclosure(3단계 #7 «잠금 so-what 미리보기 1줄 100%»); NN/g Trustworthiness in Web Design(#4 «정적 사회적 증거 0»)

**4-3-6. 첫 화면이 암시하는 «실시간 흐름»의 유일한 시각 증거 — 스파크라인 9개 — 가 전부 하드코딩 DEMO 배열이다 — [정밀층] [확실] · 심각도 높음 · 비용 소 · 기준 #4, #7**
- **관측:** dash_ZOOM-pulse-cards_17e: S&P500 F 와 S&P 500 의 선 형태가 동일하고 NASDAQ(현물)과 RUSSELL2… 도 동일하다. S&P500 F 는 «▼ −0.00%»인데 우상향 선이 적색으로만 바뀌어 그려진다. 코드: 현물 spark = DEMO_INDICES[i].spark(dash/page.tsx:107-109), 선물 = DEMO_FUTURES[i].spark(:1292-1295 — 바로 위 주석 :1274-1278 «가짜 숫자는 빈칸보다 나쁘다»는 숫자만 고치고 선은 남겼다), ETF = DEMO_ETFS[i].spark(:1498, :1506, :1518). Sparkline.tsx:10-27 는 축·시간·기준선 없이 polyline 하나만 그린다. 첫 뷰포트 9카드 × 60×22px 선은 첫 화면에서 «움직임»을 뜻하는 유일한 그래픽이고, 이 앱의 «흐름(Flow)·펄스» 약속을 시각화하는 요소가 합성이다. 신규 사용자 첫 3초(firstrun_08-landing-3s_17e)에도 같은 선이 뜬다. (`dash_ZOOM-pulse-cards_17e` · `dash_default-top_17e` · `firstrun_08-landing-3s_17e` / `dash/page.tsx:107-109` · `dash/page.tsx:1274-1278` · `dash/page.tsx:1292-1295` · `dash/page.tsx:1498` · `dash/page.tsx:1506` · `dash/page.tsx:1518`)
- **바꾸는 사용자 행동:** 스파크라인이 실측이거나 사라지면 → 사용자가 «오늘 하루 어떻게 움직였나»를 선으로 읽거나(실측 시) 우상향 선을 보고 잘못 읽지 않게 되고(제거 시) → 첫 화면의 방향 판단이 진짜 데이터에만 근거한다.
- **개선 방향 ①** DEMO 선 제거 → 카드 22px 축소, «▲ +1.40%» 칩을 값 옆으로 올려 3행→2행. 실측 인트라데이 배열이 이미 있는 종목만 선을 되살린다(범위 밖 관찰: Command 히어로 배경 스파크라인의 데이터 소스가 재사용 가능한지 확인 필요). — 트레이드오프: 카드가 «표»처럼 밋밋해지고 첫 뷰포트에 ETF 행이 더 들어와 광고 배너와 겹치는 행이 바뀐다. ／ **개선 방향 ②** **[과감]** 스파크라인 자리에 «세션 진행 바»(정규장 09:30–16:00 ET 폭, 현재 세션 위치를 점으로, 마감 후엔 회색 100%)를 두어 «지금이 어느 세션이고 이 값이 언제 것인지»를 그래픽으로 말하게 한다 — 4-4 의 «as of 부재»까지 한 요소로 해결. — 트레이드오프: «상승 곡선»이 주던 활기가 사라져 첫 화면이 더 정적으로 보이고, ET/KST 병기 규칙이 필요하다. · 실패 가능성: 진행 바가 «성과 게이지»로 오독된다 — 양 끝 시각 라벨(09:30·16:00)이 없으면 실패. · 되돌리는 비용: Sparkline 대체 컴포넌트 1개, 소.
- **출처:** NN/g Trustworthiness in Web Design — Correct/Current(3단계 #4 «구별 불가 비실측 값 0»)

**4-3-7. 첫 뷰포트 라벨 언어 — 티커 제외 영어 12 : 한국어 11(52%)로 #5 «>50% 불합격»; 한 카드 안에 «제목 영어·행 한국어·상태 영어» 3층 혼합 — [양쪽] [확실] · 심각도 중간 · 비용 소 · 기준 #5**
- **관측:** dash_default-top_17e 첫 뷰포트 전사(티커·배지 원·SIGNUMHQ 워드마크 제외). 영어: DARK POOL INTEL, Risk-On, MARKET PULSE, FUTURES LIVE(필), FUTURES LIVE(행 메타), CLOSED, CLOSED, Dashboard, Guardian, Command, Flow, Intel = 12. 한국어: 지표, 시장 상태, 우위, 선물, 중립, 현물, 상방, 리스크, 지수 선물, 현물 지수, 변동성 = 11. 비UI언어 52%. 코드에서 의도된 혼합이다: ko 사전이 futuresLive/regularLive/closed/holiday 를 영어로 고정(dash/page.tsx:635-638), riskOn 은 «Risk-On 우위» 혼합(:645), 섹션 제목 'Market Pulse'(:1726)·'Macro Board'(:1837)는 .app-card-title uppercase(app-view.css:172-177)로 영어 대문자, 탭바는 영어 고정(AppBottomNav.tsx:79-81). 같은 MARKET PULSE 카드 안에서 제목(영) → 행 메타 «지수 선물»(한) → 상태 «FUTURES LIVE / CLOSED»(영) 순으로 언어가 3번 바뀐다. ATT 사유 문구까지 영문(Info.plist:37-38, firstrun_01-att_17e)이라 첫 실행 전체가 «영어 앱» 인상을 준다. (`dash_default-top_17e` · `firstrun_01-att_17e` / `dash/page.tsx:635-638` · `dash/page.tsx:645` · `dash/page.tsx:1726` · `dash/page.tsx:1837` · `styles/app-view.css:172-177` · `components/app/AppBottomNav.tsx:79-81`)
- **바꾸는 사용자 행동:** 상태 토큰과 섹션 제목이 UI 언어로 통일되면 → 한국어 사용자가 «CLOSED / FUTURES LIVE / Risk-On»을 머릿속에서 번역하지 않고 시장 상태를 읽고 → 첫 화면 판독 시간이 줄고 «이 앱은 영어 앱»이라는 첫인상이 사라진다.
- **개선 방향 ①** 상태 토큰만 UI 언어화: 마감 / 선물 라이브 / 휴장, «Risk-On 우위» → «위험 선호 우위»(Guardian 이 이미 «위험 선호»를 쓴다, 1-A-2), 섹션 제목 «마켓 펄스 / 매크로 보드 / 상위 거래 / 섹터 히트맵». 사전 1곳(:629-651)만 고치고 CSS uppercase 는 라틴 전용으로 제한. — 트레이드오프: «Risk-On»은 국내 투자자에게도 통용어라 번역이 더 낯설 수 있고, 한글 3~5자로 상태 필 폭이 달라져 카드 레이아웃 재검증이 필요하다. ／ **개선 방향 ②** **[과감]** «첫 뷰포트에서 영어는 워드마크와 티커뿐» 규칙: 영어 대문자·넓은 자간 눈썹 라벨 체계(.app-card-title) 자체를 폐기하고 한국어 소제목 위계(굵기·크기 2단)로 교체, 탭바·상태 필·섹션 제목 100% UI 언어. ja/en 도 같은 규칙으로 검사. — 트레이드오프: 현 «터미널 룩»의 상당 부분이 영어 대문자 눈썹 라벨에서 오므로 표현층 재설계(2.5단계 의무 6항)와 한 번에 가야 한다. · 실패 가능성: 한국어 소제목이 자간·굵기 규칙 없이 놓이면 값과 제목의 위계가 무너져 기준 #7 이 악화된다. · 되돌리는 비용: 전역 CSS 1블록 + 5화면 사전, 중.
- **출처:** NN/g Plain Language Is for Everyone, Even Experts(3단계 #5 합격선 «비UI언어 라벨 ≤20%, >50% 불합격»)

**4-3-8. 앱의 유일한 자기소개 문장이 전역 CSS 로 숨겨진다 — 온보딩 2단계 전체에 «이 앱이 무엇을 하는지» 0문장 — [표현층] [확실] · 심각도 중간 · 비용 소 · 기준 #6, #7**
- **관측:** AppFirstRunOnboarding.tsx:299-308 은 `<header className={styles.hero}>` 안에 키커 «SIGNUM HQ APP» + 28px 제목 + 부제 «SIGNUM HQ는 교육과 리서치를 위한 시장 데이터 앱입니다.»(:36)를 렌더하지만, app-view.css:497-505 `.is-app-view header:not(.app-header) … { display:none !important }`(데스크톱 헤더 숨김용 «Safety Override»)가 이 `<header>`를 통째로 지운다. firstrun_02-consent-1of2_17e·firstrun_04-step-2of2_17e 모두 패널이 «1 / 2 · 필수 고지»로 시작하고 키커·제목·부제가 없다 — 대신 amber 박스가 같은 제목을 반복(:316). 남는 온보딩 텍스트는 1/2 법적 고지 4불릿 + 2/2 알림 3장(«장마감 리포트 · 시장 브리프 · 데이터 잠금해제» :58-60)뿐이라, 옵션·다크풀·GEX·AI 라는 단어가 첫 실행 전체(ATT→동의→알림→대시보드)에 0회 등장한다. 신규와 재방문의 첫 화면이 동일(firstrun_08-landing-3s_17e ≒ dash_default-top_17e). 부제가 살아난다 해도 «시장 데이터 앱»은 카테고리명일 뿐 차별점을 말하지 않는다. (`firstrun_02-consent-1of2_17e` · `firstrun_04-step-2of2_17e` · `firstrun_08-landing-3s_17e` / `components/app/AppFirstRunOnboarding.tsx:36` · `components/app/AppFirstRunOnboarding.tsx:58-60` · `components/app/AppFirstRunOnboarding.tsx:299-308` · `components/app/AppFirstRunOnboarding.tsx:316` · `styles/app-view.css:497-505` · `components/app/AppFirstRunOnboarding.module.css:23-26`)
- **바꾸는 사용자 행동:** 온보딩 첫 패널 상단에 «무엇을 해주는 앱인지» 1줄(다크풀·옵션 플로우·AI 섹터 리포트)이 보이면 → 사용자가 동의·알림 허용을 «이걸 위해» 하는 결정으로 하고 → 첫 대시보드에서 은유형 탭 라벨을 만나도 «Flow=옵션»을 이미 알고 진입한다.
- **개선 방향 ①** 숨김 규칙에서 온보딩 헤더를 제외(hero 를 div 로 바꾸거나 선택자에 :not 추가)하고, 부제를 차별 기능 명사 1줄로 교체(«다크풀 · 옵션 플로우 · AI 섹터 리포트 — 미국 주식의 기관 흐름을 봅니다», 3언어). 제목은 28px→20px. — 트레이드오프: 제목+부제가 살아나면 17e 에서 패널이 100dvh−32px 를 넘어 스크롤(module.css:23-26)돼 «계속» CTA 가 첫 뷰포트 밖으로 밀릴 수 있다(기준 #3 «CTA 가시율 100%» 위반 위험). ／ **개선 방향 ②** **[과감]** 2/2 알림 카드 3장을 «기능 3장»으로 치환: 다크풀(Command 시장평균 값 1개) · 옵션 플로우(Flow 값 1개) · AI 리포트(다음 발행 시각 — vercel.json:92-108 크론 기준 «07:00 KST») 카드 안에 알림 스위치를 넣어, 사용자가 «무엇에 대한 알림인지»를 값으로 보고 켠다. — 트레이드오프: 온보딩이 네트워크 값에 의존해 12초 빈 화면(0-5 #1) 뒤에 또 «—»를 볼 수 있고, «광고 기반 미리보기 안내» 문구 위치 변경은 법무 확인이 필요하다. · 실패 가능성: 값 미도착 시 카드가 빈 껍데기가 된다 — 정적 명사 라벨 + 값 «—» 구조를 강제해야 한다. · 되돌리는 비용: 온보딩 2단계 JSX + 데이터 훅 1개, 중.
- **출처:** NN/g Information Scent(3단계 #6); Google Design «Expressive Design: Google's UX Research» — «No amount of expressive design will beat basic functionality»(#7 보조)

### 4-4. 진입 상태별 첫 화면

**4-4-1. 최초 실행: 스플래시 뒤 12초+ 빈 화면 → 영문 사유 ATT 가 한국어 동의 게이트 위에 겹침 — 첫 3초에 사용자가 얻는 것이 0 — [양쪽] [확실] · 심각도 높음 · 비용 중 · 기준 #3, #5**
- **관측:** dash_first-launch_17e: 상태바만 있는 완전한 다크 빈 화면(스켈레톤·스피너·로고 0). firstrun_01-att_17e: 그 뒤 처음 나타나는 «우리 화면»은 「1 / 2 · 필수 고지」 한국어 카드인데, 그 위에 iOS ATT 시스템 창이 겹치고 사유 문구는 영문(«SIGNUM HQ uses the device advertising identifier…»). 코드: ATT 는 온보딩 상태와 무관하게 광고 초기화 시점에 요청된다(src/services/adManager.ts:246-250, 호출 NativeAppProvider.tsx:196); 한국어 InfoPlist.strings 에는 CFBundleDisplayName 만 있고 NSUserTrackingUsageDescription 키가 없다(ios/App/App/ko.lproj/InfoPlist.strings; 원문 ios/App/App/Info.plist:37-38). 네이티브 스플래시는 3초 뒤 자동 숨김(capacitor.config.ts:46 launchShowDuration 3000)이고 JS 쪽 hide 도 «셸 도착 또는 6초 경과» 로 내려간다(NativeAppProvider.tsx:147) — 그래서 셸이 늦으면 «아무것도 없는 화면»이 남는다. 신규 사용자 첫 세션의 시퀀스는 빈 화면 → 시스템 창(영어) → 우리 카드(한국어) 순으로, 앱이 자기 목소리를 내기 전에 시스템이 먼저 말한다. (`dash_first-launch_17e` · `firstrun_01-att_17e` · `firstrun_02-consent-1of2_17e` / `services/adManager.ts:246-250` · `components/native/NativeAppProvider.tsx:147` · `ios/App/App/Info.plist:37-38` · `ios/App/App/ko.lproj/InfoPlist.strings:6` · `capacitor.config.ts:46`)
- **바꾸는 사용자 행동:** 첫 1초 안에 브랜드 스켈레톤+진행 표시가 보이고 ATT 사유가 UI 언어로 우리 카드 «뒤에» 순서대로 오면 → 사용자가 '앱이 죽었나' 하고 홈으로 나가지 않고 게이트 2장을 끝까지 통과한다 → 첫 세션 이탈이 줄고 추적·알림 허용률이 오른다
- **개선 방향 ①** ko.lproj/InfoPlist.strings 에 NSUserTrackingUsageDescription 한국어(ja 도) 추가 + 스플래시 hide 조건을 «셸 존재»가 아니라 «첫 스켈레톤 페인트»로 바꾸고 6초 타임아웃을 브랜드 로고+진행 바 화면으로 대체 + ATT 요청을 동의 2/2 「시작하기」 이후로 순서 이동 — 트레이드오프: ATT 가 늦어져 첫 배너 1회가 비개인화로 시작(수익 −); 스플래시 유지 시간이 길어져 «빈 화면»이 «로고 화면»으로 바뀔 뿐 총 대기 시간은 그대로 ／ **개선 방향 ②** **[과감]** 첫 실행을 3막 «우리 화면 우선» 구조로 재구성: ① 네이티브 스플래시 자체에 실시간 한 줄(«S&P 500 F ▲+0.04% · 06:14 KST»)을 얹어 0초부터 데이터가 보이게 ② 한국어 동의 1/2·2/2 ③ 추적·알림은 각각 우리 프리프롬프트 카드(«광고를 맞춤으로 볼까요?» / «07:00 장마감 리포트를 알려드릴까요?») 뒤에 시스템 창 — 시스템 창이 «우리 카드의 확인창»으로 읽히도록 — 트레이드오프: 게이트가 2장→4장으로 늘어 완주율이 떨어질 수 있음; 스플래시 라이브 한 줄은 네이티브 코드(Swift) 작업 · 실패 가능성: 프리프롬프트 문구가 인센티브·유도(«허용하면 무료 해제»)로 읽히면 ATT 가이드 위반으로 심사 반려; 스플래시 데이터가 캐시 실패로 «—» 면 첫 인상이 더 나빠짐 · 되돌리는 비용: 온보딩 컴포넌트 1개 되돌리기 소 / 스플래시 라이브 줄은 네이티브라 중
- **출처:** NN/g Response Times: The 3 Important Limits (1s·10s 한계) · Apple HIG Accessibility / Privacy: «request permission at a moment that makes sense, in the user's language» · 3단계 기준 #3(빈 화면 ≤1.0s, 스켈레톤 ≥1)·#5(권한 사유 100% UI 언어)

**4-4-2. 웜 재실행: 8초 «영어 스켈레톤(헤더가 상태바 위에 겹침)» → 12초 한국어 완성 — 같은 화면이 두 번 다른 언어로 그려진다 — [양쪽] [확실] · 심각도 높음 · 비용 중 · 기준 #3, #5, #9**
- **관측:** dash_relaunch-clean-8s_17e: 라벨이 전부 영어(«MARKET STATE / FUTURES / CASH / RISK / INDEX FUTURES / CASH INDICES / ETF / VOLATILITY / MACRO BOARD»), 시장 상태 3박스는 주황 «—», 카드 자리는 회색 블록 9+6개, 뉴스 티커 없음, 그리고 SIGNUMHQ 헤더가 상태바 «9:41» 과 같은 y 에 겹쳐 «S:41» 로 읽힌다(세이프에어리어 인셋이 스켈레톤 단계에 미적용). dash_relaunch-clean-12s_17e: 한국어 라벨·값·티커·정상 인셋으로 완성. 원인은 부팅 URL 이 `/en/app-view/dash` 로 고정(capacitor.config.ts:20)이고 저장 로케일로의 교체가 클라이언트 라우터에서 뒤늦게 일어나기 때문(src/app/[locale]/app-view/layout.tsx:40-52 router.replace). Pro Max 는 8초에 이미 완성(_probe_relaunch_promax)이라 기기·네트워크에 따라 사용자가 «영어 앱이 떴다가 한국어로 바뀌는» 장면을 보거나 못 본다 — 재방문 첫 3초에 보이는 것이 «다른 언어의 빈 틀». (`dash_relaunch-clean-8s_17e` · `dash_relaunch-clean-12s_17e` · `_probe_relaunch_promax` / `capacitor.config.ts:20` · `layout.tsx:40-52` · `dash/page.tsx:1743` · `styles/app-view.css:345-350`)
- **바꾸는 사용자 행동:** 재실행 첫 프레임부터 한국어 라벨과 «마지막 정상값(흐림)»이 정상 인셋으로 보이면 → 사용자가 '다른 앱인가·업데이트됐나' 하고 멈추지 않고 곧장 선물 카드로 눈이 간다 → 재방문 3초 안에 판단이 시작된다
- **개선 방향 ①** 스켈레톤 라벨을 로케일 사전(copy ko/en/ja, page.tsx:630-720)에서 그리고, 스켈레톤 단계에도 헤더 safe-area 인셋을 적용해 상태바 겹침 제거; 부팅 URL 을 로케일 없는 루트(`/app-view/dash`)로 두고 서버 리다이렉트 1회로 언어 확정 — 트레이드오프: 서버 리다이렉트 1회 추가(콜드 +100~300ms); 스켈레톤이 «우리 말»이 되지만 여전히 회색 블록 ／ **개선 방향 ②** **[과감]** «스켈레톤 폐지 — 마지막 화면이 첫 프레임» : 종료 직전 dash 의 lastGood* 값(page.tsx 모듈 스코프)을 localStorage 에 스냅샷하고 재실행 첫 페인트를 그 값으로 40% 밝기(dim)에 «이전 값 · 21:14 KST» 라벨 1줄과 함께 그린다; 새 값 도착 시 카드 단위로 100% 로 «켜진다». 회색 블록·«—»·언어 전환 장면이 전부 사라진다 — 트레이드오프: 옛 값을 보여주는 순간이 생겨 «기준 시각 라벨»이 필수(#4); dim 상태의 대비가 3:1 미만이면 #1 위반 — dim 은 채도만 낮추고 명도는 유지해야 함 · 실패 가능성: 장 전환 시점(마감→선물 개장)에 옛 값이 새 세션 값으로 오인; 로컬 스냅샷이 깨져 빈 값이면 스켈레톤보다 나쁜 «빈 카드» · 되돌리는 비용: 소 — 스켈레톤 분기(!futuresReady/!indicesReady)로 복귀 ／ **개선 방향 ③** 헤더를 스켈레톤 단계에서 «브랜드 없이 상태 한 줄만»(«불러오는 중 · 06:14 KST 기준값 준비») 으로 축소하고 완성 시 브랜드가 슬라이드 인 — 겹침 문제를 «헤더가 늦게 오는 것»으로 해결 — 트레이드오프: 브랜드 노출이 0.5초 늦음
- **출처:** Apple HIG Launching: «the launch screen … the first screen of the app, not a splash» + HIG Layout(안전영역) · NN/g Response Times · 3단계 기준 #3(웜 첫 실측 수치 ≤3s)·#5(비UI언어 라벨 ≤20%)

**4-4-3. 시스템 라이트 모드: 다크 선언이 없어 최초 실행 빈 화면이 «밝은 회색»이고 ATT 가 라이트 창으로 뜬다 — 라이트 사용자의 첫 화면은 회색 → 검정 → 흰 배너 3톤 — [양쪽] [확실] · 심각도 높음 · 비용 소 · 기준 #10, #3, #9**
- **관측:** dash_first-launch-LIGHT_17e: 화면 상단 ~90% 가 밝은 회색(웹뷰 기본 라이트 배경 + ATT 딤), 하단 ~10% 만 네이티브 다크(#050a14), 그 위에 라이트 크롬 ATT 창(영문 사유). 즉 라이트 시스템에서는 12초 빈 화면이 «흰 화면» 이고, 그 뒤 앱이 검정으로 «뒤집힌다». 코드가 스스로 이를 증언한다: NativeAppProvider.tsx:139-141 주석 «흰 로딩 화면은 다크 테마 CSS 적용 전 body 기본 흰 배경 단계» — 그래서 스플래시를 «배경이 흰색이 아닐 때까지» 붙잡지만 6초 타임아웃(:147)이 먼저 끝나면 흰 화면이 노출된다. `color-scheme`·`prefers-color-scheme` 선언은 src/styles·globals.css·layout 에 0건(grep: prefers-reduced-motion·text-size-adjust 만). 완성 후(dash_LIGHT-top_17e)는 앱이 다크 그대로이고 흰 AdMob 배너(GARCIA vs BENN)만 라이트 — 2.5단계 판정(단일 다크)이 «시스템에 선언되지 않은 채» 운영되고 있다. (`dash_first-launch-LIGHT_17e` · `dash_LIGHT-top_17e` · `firstrun_01-att_17e` / `components/native/NativeAppProvider.tsx:139-147` · `app/globals.css:703-704` · `capacitor.config.ts:30`)
- **바꾸는 사용자 행동:** 다크가 시스템에 선언되고 첫 페인트 배경이 다크 토큰이면 → 라이트 모드 사용자가 첫 실행에서 회색→검정 플래시를 겪지 않고 시스템 창(ATT·알림)이 다크로 떠 «내 앱이 띄운 창»으로 읽힌다 → 권한 창에서의 반사적 «거부»가 줄고 첫 인상이 한 톤으로 남는다
- **개선 방향 ①** `:root{color-scheme:dark}` + `<meta name="color-scheme" content="dark">` + html/body 배경을 CSS 로드 전 인라인 스타일로 #050a14 + Info.plist `UIUserInterfaceStyle=Dark` — 2.5단계 «단일 다크 의무 6항»의 선언 항목 이행 — 트레이드오프: iOS 시스템 시트·키보드·공유 시트까지 전부 다크로 고정 — 라이트 선호 사용자에겐 이질감; 웹(브라우저) 사용자에게도 같은 선언이 적용됨 ／ **개선 방향 ②** **[과감]** 라이트 시스템 감지 시 «데이라이트 다크» 변형 1벌: 배경 #0b111e→#141c2e(+12% 명도), 뮤트 텍스트 대비 상향, 글로우·스캔라인 0, 흰 배너를 앱 프레임(카드 톤 6pt 인셋)으로 감싸 «흰 띠»가 아니라 «카드 안 광고»로 — 다크 판정을 지키면서 낮·야외 조건(2.5단계 의무)에 응답 — 트레이드오프: 토큰 2벌 유지 비용; AdMob 크리에이티브 자체 색은 제어 불가라 흰 면적이 줄 뿐 사라지지 않음 · 실패 가능성: 변형 토큰이 한 곳이라도 빠지면 라이트 시스템에서 «두 앱» 얼룩; 배너 인셋이 AdMob 정책(광고 가림 금지)과 충돌 · 되돌리는 비용: 소 — 미디어쿼리 블록 1개 삭제
- **출처:** Apple HIG Dark Mode: «declare the appearance… avoid offering an app-specific appearance setting unless…» · WWDC Materials(시스템 시트 외관 계승) · 3단계 기준 #10(라이트 시스템 표면 0 또는 라이트 외관 제공)·#3(빈 화면)

**4-4-4. 접근성 설정 무반응: 글자 최대(AX5)·대비 증가 ON 에서 앱 픽셀 변화 0 — 9~10px 정밀 라벨(세션 필·탭바·상태 문장)이 그대로이고 text-size-adjust 가 100% 로 잠겨 있다 — [양쪽] [확실] · 심각도 높음 · 비용 중 · 기준 #10, #2, #1**
- **관측:** dash_A11Y-textXXXL-top_17e(글자 최대)·dash_A11Y-contrast-top_17e(대비 증가)·dash_A11Y-textXXXL-contrast-top_17e(둘 다): 세 캡처의 레이아웃·글자 크기·색이 dash_default-top_17e 와 픽셀 단위로 동일(시스템 상태바만 설정 반영). 코드: `-apple-system-body`·`prefers-contrast` 0건(grep src/styles·globals.css·layout), globals.css:703-704 `text-size-adjust:100%` 로 WKWebView 텍스트 확대 차단, 정밀 라벨은 절대 px — 세션 필 9px(dash.module.css:112), 탭바 라벨 10px(app-view.css:587), 상태 문장 10px(dash.module.css:1210), 시장 상태 키커 10px(:1181). 대비 증가 ON 에서도 뉴스 «6h» 4.1:1·«CLOSED» 5.0:1(측정값)이 그대로 — 기준 #10 합격선(대비 증가 ON 정밀 라벨 ≥7:1)에 미달. 첫 3초에 저시력 사용자가 얻는 것은 «남들과 같은 10px». (`dash_A11Y-textXXXL-top_17e` · `dash_A11Y-contrast-top_17e` · `dash_A11Y-textXXXL-contrast-top_17e` · `dash_default-top_17e` / `app/globals.css:703-704` · `dash/dash.module.css:112` · `dash/dash.module.css:1181` · `dash/dash.module.css:1210` · `styles/app-view.css:587`)
- **바꾸는 사용자 행동:** 앱 글자가 시스템 글자 크기·대비 설정을 따르면 → 노안·저시력 사용자가 잠긴 핀치줌 대신 자기 설정으로 첫 화면의 변화율 칩(+0.15%)과 «CLOSED» 를 읽는다 → 첫 3초 판독 실패로 앱을 닫는 일이 줄어든다
- **개선 방향 ①** 정밀층 텍스트를 `font: -apple-system-body` 기준 rem 으로 전환(9·10px 선언 0건 목표, 최소 11pt) + `@media (prefers-contrast: more)` 에서 --text-muted 상향·카드 테두리 .055→.25·글로우 0 + text-size-adjust 잠금 해제; AX 크기에서 펄스 3열→2열→1열 재배치 — 트레이드오프: AX5 에서 첫 뷰포트 값 수 21→약 6, 스크롤 길이 3배; 브랜드 «작고 촘촘한 터미널» 인상 약화 ／ **개선 방향 ②** **[과감]** «두 밀도 모드» — 시스템 글자 크기 ≥ xLarge 를 감지하면 첫 화면을 «큰 글자 대시보드»로 통째 교체: 시장 상태 1장(헤드라인 28pt) + 펄스는 1열 리스트(값 20pt, 스파크라인 제거, 변화율 칩→텍스트) + 탭바 라벨 12pt; 대비 증가 ON 이면 글래스·반투명·글로우 전부 끄고 실선 프레임·불투명 카드. 접근성 설정이 «같은 화면의 확대»가 아니라 «다른 레이아웃»을 받는다 — 트레이드오프: 두 레이아웃 유지 비용과 기능 드리프트(한쪽에만 추가되는 모듈); 스파크라인 제거로 «흐름» 정보 상실(단, 현재 스파크는 DEMO 배열이라 실손실 0) · 실패 가능성: 감지(matchMedia/네이티브 브리지) 실패 시 잘못된 모드에 갇힘; 두 모드 간 위치 기억 불일치 · 되돌리는 비용: 소~중 — 분기 1개 제거, 큰 글자 컴포넌트 삭제
- **출처:** WCAG 2.2 SC 1.4.4 Resize Text(200%)·SC 1.4.6 Enhanced Contrast(7:1) · Apple HIG Accessibility «support Dynamic Type… Increase Contrast» · 3단계 기준 #10(대비 증가 ON ≥7:1·200% 잘림 0·상대 단위 ≥90%)·#2(8~10px 선언 0건)

**4-4-5. 신규·재방문 첫 화면이 동일하고, 신규 첫 3초에 «무엇을 먼저 보라»는 단서가 0 — 대신 흰 광고 배너가 3초 시점에 이미 떠 있고 블러 첫 시선이 배너다 — [양쪽] [확실] · 심각도 높음 · 비용 중 · 기준 #7, #3, #8**
- **관측:** firstrun_08-landing-3s_17e(동의 완료 3초): 완성 대시보드 위에 흰 60pt 배너(«보카트레인 … 열기 ›», Test mode)가 ETF 행 하단을 덮은 채 이미 표시; firstrun_10-landing-20s_17e 도 동일. firstrun_10-landing-20s_BLUR_17e(σ2%): 화면에서 가장 밝고 에지가 강한 블록이 배너(y≈660pt) — 신규 사용자의 첫 시선이 데이터가 아니라 광고로 간다. 면적: 광고 7.1%(기준 #7 합격선 ≤6% 초과)·크롬 25.7%·데이터 62.7%. dash_default-top_17e(재방문)와 구성이 동일하며 환영·투어·«오늘 먼저 볼 것» 1줄·빈 상태 어느 것도 없다. 코드: 배너는 온보딩 수락 여부와 무관하게 앱 셸에 항상 마운트(src/app/[locale]/app-view/layout.tsx:219 `{!hideAd && <AppAnchorAd />}`)되고 네이티브 배너는 init 직후 즉시 show(src/services/adManager.ts:305, ADAPTIVE_BANNER BOTTOM_CENTER :320-324); 온보딩 저장 키(AppFirstRunOnboarding.tsx:30,140)는 오버레이만 제어하고 첫 화면 구성에는 쓰이지 않는다. (`firstrun_08-landing-3s_17e` · `firstrun_10-landing-20s_17e` · `firstrun_10-landing-20s_BLUR_17e` · `firstrun_ZOOM-ad-over-content_17e` · `dash_default-top_17e` / `layout.tsx:219` · `services/adManager.ts:305` · `services/adManager.ts:320-324` · `components/app/AppFirstRunOnboarding.tsx:140`)
- **바꾸는 사용자 행동:** 최초 세션의 첫 화면에서 배너가 «첫 실측 수치 렌더 + 첫 스크롤» 뒤에야 나타나고 그 자리에 «오늘 먼저 볼 것 1줄»이 있으면 → 신규 사용자의 첫 시선과 첫 탭이 광고 «열기»가 아니라 시장 상태 헤드라인과 카드로 간다 → 첫 세션에서 데이터 화면을 «본» 사용자 비율이 오른다
- **개선 방향 ①** 첫 세션(온보딩 수락 후 N분)만 배너를 «첫 실측 수치 도착 + 첫 스크롤 이후»로 지연하고, 배너 컨테이너를 흰 띠가 아니라 앱 표면색 프레임 안 50pt 표준으로; 광고 면적 7.1%→≤6% 로 기준 #7 충족 — 트레이드오프: 신규 사용자당 배너 노출 −1~2회(첫 세션 광고 수익 감소); 지연 표시 순간 콘텐츠가 위로 밀리는 점프(오버레이라면 점프 대신 가림) ／ **개선 방향 ②** **[과감]** 신규 첫 화면을 «한 장 요약 모드»로 — 시장 상태 카드가 첫 뷰포트 상단 60% 를 차지(헤드라인 28pt + 3박스 대형 + «지금 볼 것: 선물 보합·현물 강세 마감» 1줄), 펄스 9카드 그리드는 그 아래로 내려가며, 3번째 세션부터 자동으로 현재 밀도로 복귀(토글 없이 세션 카운트). 배너는 요약 모드에서 표시하지 않음 — 트레이드오프: 신규 화면이 «내용이 적다»로 읽혀 앱 깊이를 과소평가할 수 있음; 두 레이아웃 유지; 첫 2세션 광고 0 · 실패 가능성: 세션 카운트가 초기화(캐시 삭제)되면 재방문자가 요약 모드로 되돌아가 «앱이 퇴화했다»고 느낌; so-what 1줄이 AI 문장이면 미도착 시 빈 줄 · 되돌리는 비용: 소 — 세션 카운트 분기 1개 제거
- **출처:** NN/g Most Hated Advertising Techniques(콘텐츠 덮는 모바일 광고) · NN/g Progressive Disclosure · LukeW Squint Test · 3단계 기준 #7(광고 ≤6%·블러 첫 시선=핵심 데이터·광고 0탭)·#3(배너는 첫 실측 수치 뒤)

**4-4-6. 재실행 10초: 헤드라인은 «Risk-On 우위» 인데 그 아래 3박스는 «—» — 빈 상태 토큰이 값과 같은 자리·같은 굵기로 놓여 «없음»이 «값»처럼 읽힌다 — [양쪽] [확실] · 심각도 중간 · 비용 소 · 기준 #3, #4, #7**
- **관측:** dash_A11Y-textXXXL-top_17e(재실행 10초): 시장 상태 카드에 «Risk-On 우위»(녹색 16px 900) 헤드라인과 설명문은 있는데 선물·현물·리스크 3박스가 흰 굵은 «—» 이고, 바로 아래 MARKET PULSE 9카드는 값·칩·스파크라인이 전부 있다. dash_relaunch-clean-8s_17e 에서는 같은 «—» 가 주황으로 보인다 — 같은 «미도착»이 두 색으로 나타난다. 코드는 셀별 준비 플래그로 «—» 를 찍는다(page.tsx:1706 futuresReady·:1710 indicesReady·:1714 regimeReady, 헤드라인 :1699); 헤드라인이 먼저 채워지고 박스가 «—» 인 캡처 상태는 이 조건만으로는 재현되지 않아 도착 순서·재계산 프레임 차로 [추정]. 어느 경우든 화면의 «—» 는 «왜 비었는지·언제 오는지·마지막 값이 무엇이었는지»를 하나도 말하지 않으며, 폰트·크기·위치가 실제 값과 동일하다. (`dash_A11Y-textXXXL-top_17e` · `dash_relaunch-clean-8s_17e` / `dash/page.tsx:1699` · `dash/page.tsx:1706-1714` · `dash/page.tsx:865` · `dash/dash.module.css:1204-1207`)
- **바꾸는 사용자 행동:** 빈 박스가 «—» 대신 값 폭의 펄스 바 + «집계 중 · 선물 도착» 처럼 진행을 말하면 → 사용자가 새로고침·재실행을 반복하지 않고 1~2초를 기다린다 → 첫 판단이 «데이터가 깨졌다»가 아니라 «오고 있다»가 된다
- **개선 방향 ①** «—» 를 없애고 미도착 셀은 값 높이의 `.app-skeleton` 펄스 바(app-view.css:345)로 통일, 헤드라인은 두 피드가 다 오기 전엔 숨기지 말고 마지막 정상값을 채도 40% 로; «—» 의 색(주황/흰) 분기도 삭제해 한 표기로 — 트레이드오프: 펄스 바가 «값이 곧 온다»는 약속이라 피드가 영구 실패하면 거짓말이 됨 → 8초 후엔 «불러오지 못함 · 다시 시도» 텍스트 상태 필요 ／ **개선 방향 ②** **[과감]** 시장 상태 스트립을 «도착 순서로 켜지는 계기판»으로 — 3박스는 처음엔 윤곽선만(채움 0), 피드가 도착한 박스부터 테두리→채움→값 순으로 300ms 에 켜지고, 헤드라인은 «▮▮▯ 집계 중»(3칸 중 도착 수) 문자 진행 표시로 시작해 두 피드 완료 시 «Risk-On 우위» 로 교체; 색은 최종 판정 색 하나만 사용 — 트레이드오프: 모션이 늘어 «동작 줄이기» ON 에서 정적 버전 별도 필요(#10); 첫 완성이 300ms 늦어 보임 · 실패 가능성: 프리페치 성공으로 세 박스가 동시에 켜지면 애니메이션이 오히려 «지연»처럼 느껴짐; 진행 3칸이 실제 요청 수(7 엔드포인트)와 불일치 · 되돌리는 비용: 소 — 컴포넌트 1개 분기 제거
- **출처:** NN/g Skeleton Screens 101 / Progress Indicators · Apple HIG Loading: «show placeholder content … make it clear that content is loading» · 3단계 기준 #3(스켈레톤 ≥1)·#4(정적/미측정 값 구별)

**4-4-7. 푸시 착지: 아침 브리프는 리포트가 자동으로 열리지만, 장마감 푸시(07:00 KST)는 Intel «섹터» 탭에 떨어져 리포트가 한 탭 뒤에 있고, 착지 화면 어디에도 «알림에서 왔다»는 표식이 없다 — [양쪽] [미확인] · 심각도 중간 · 비용 중 · 기준 #6, #3, #7**
- **관측:** 캡처 없음(시뮬레이터 push_00-banner_promax 는 배지 «1» 만 표시, 배너 미표시 — 0-5 #21). 코드로 기술: 탭 핸들러는 morning → `/{loc}/app-view/guardian?tab=overview&brief=1`, closing → `/{loc}/app-view/intel`(파라미터 없음)(src/app/[locale]/app-view/layout.tsx:77-82). Guardian 은 `brief` 를 읽어 리포트 오버레이를 자동으로 연다(guardian/page.tsx:178). Intel 은 세그 초기값이 `'sector'` 이고 searchParams 를 읽지 않는다(intel/page.tsx:1482, grep 결과 searchParams 0건) — 즉 장마감 푸시 착지 화면은 «섹터 카드 10장» 이고 「장마감 리포트」 세그를 사용자가 찾아 눌러야 한다. 콜드 스타트 탭이면 부팅 `/en/app-view/dash` → 스켈레톤(4-4-02) → NativeAppProvider.tsx:87-103 의 150ms 폴링이 2.4초 안에 sessionStorage 대상을 읽어 router.replace — 사용자는 대시보드를 잠깐 본 뒤 Intel 로 «튀는» 장면을 본다 [추정]. 크론: morning 12:10/13:10 UTC(=21:10/22:10 KST), closing 22:00/22:20/22:40 UTC(=07:00/07:20/07:40 KST)(vercel.json:92-108) — 한국 사용자 기준 «출근 전 07:00 알림 → 섹터 그리드» 가 실제 첫 화면. (`push_00-banner_promax` · `vercel.json:92-108` / `layout.tsx:77-82` · `guardian/page.tsx:178` · `intel/page.tsx:1482` · `components/native/NativeAppProvider.tsx:87-103`)
- **바꾸는 사용자 행동:** 장마감 푸시를 탭했을 때 리포트가 이미 펼쳐진 채 상단에 «07:00 장마감 리포트 · 알림에서 열림» 1줄이 보이면 → 사용자가 섹터 카드를 지나 세그를 찾지 않고 바로 읽는다 → 푸시→읽기 전환이 한 탭 줄고 «알림 눌렀는데 엉뚱한 화면» 이탈이 사라진다
- **개선 방향 ①** closing 딥링크를 `/intel?tab=report&from=push` 로 바꾸고 Intel 이 `tab` 을 읽어 세그 초기값을 정하며, `from=push` 일 때 헤더 카드 아래 «알림에서 열림 · 07:00 KST 발행» 배지 1줄을 세션 동안 유지(morning 도 동일 배지) — 트레이드오프: 배지 1줄만큼 첫 뷰포트 데이터 면적 감소; 리포트 미발행(크론 실패) 시 «리포트 없음» 빈 상태 화면이 필요 ／ **개선 방향 ②** **[과감]** 푸시 착지를 «탭 화면»이 아니라 «리포트 시트» 하나로 통일 — morning/closing 모두 MorningBrief 와 동형인 전면 시트로 착지하고(뒤에는 사용자가 마지막에 보던 탭), 시트 헤더에 발행 시각 KST·ET 병기, ‹ 이전 리포트 › 페이저, 닫으면 원래 자리. 대시보드·Intel 이 아니라 «리포트»가 착지 컨테이너가 된다 — 트레이드오프: 시트 컴포넌트 1개를 양쪽 리포트 형식에 맞춰야 함; Intel 의 섹터 컨텍스트(카드→상세)는 시트 닫은 뒤에야 보임 · 실패 가능성: 콜드 스타트 리다이렉트(NativeAppProvider.tsx:97)와 시트 오픈이 경쟁해 시트가 두 번 열리거나 빈 시트; 리포트 미발행 시 빈 시트가 첫 화면 · 되돌리는 비용: 소 — 딥링크 대상 2줄 되돌리기
- **출처:** NN/g Information Scent(라벨·착지 일치) · Apple HIG Notifications: «take people directly to the content the notification is about» · 3단계 기준 #6(라벨 예측)·#3(첫 실측 수치)

**4-4-8. 장마감(전 캡처) vs 장중(코드): 세션이 바뀌어도 첫 화면은 라벨 몇 개만 바뀌고 위계·행 순서가 고정 — 그리고 «지금 어떤 상태인지» 말해주는 유일한 문장은 17e 에서 잘린다 — [양쪽] [추정] · 심각도 중간 · 비용 중 · 기준 #4, #5, #7**
- **관측:** [확실] dash_default-top_17e: 상태 설명문 «정규장 밖에도 선물 흐름은 ET 기준으로 추…» 말줄임(dash.module.css:1209-1215 nowrap+ellipsis, 10px) — Pro Max(_probe_relaunch_promax)에서만 완문. 같은 뷰포트에 «FUTURES LIVE» 가 배지(:1729)와 행 메타(:1740) 두 번, «CLOSED» 가 두 번, 세션 토큰은 전부 영어 대문자이며 KST 기준 시각은 0개. [추정, 장중 캡처 없음] 코드상 정규장이 되면 바뀌는 것은 배지 «LIVE»·행 메타 «LIVE»·설명문 «정규장 실시간 흐름을 반영합니다.»(page.tsx:866-869, copy :641-643) 뿐이고, 행 순서는 선물→현물→ETF 로 고정(:1736-1770), 카드 크기·색·글로우 규칙도 동일(live 클래스만 :1744). 즉 «살아있는 값이 어느 행인가»를 사용자가 라벨을 읽어 알아내야 하며, 그 라벨은 영어 9px 필이다. 장마감 첫 화면과 장중 첫 화면이 «같은 화면에 다른 필»이라 상태 간 일관성은 있으나 «상태가 바뀌었다»는 신호가 첫 3초 안에 없다. (`dash_default-top_17e` · `_probe_relaunch_promax` · `dash_ZOOM-pulse-cards_17e` / `dash/page.tsx:866-869` · `dash/page.tsx:1736-1770` · `dash/page.tsx:641-643` · `dash/dash.module.css:1209-1215` · `dash/dash.module.css:112`)
- **바꾸는 사용자 행동:** 세션 상태가 한 자리에 한국어+KST 시각으로 한 번만 보이고(«장마감 · 05:00 KST 기준 / 선물 실시간»), 살아있는 행이 시각적으로 앞서면 → 사용자가 카드마다 «이 숫자 살아있나»를 확인하지 않고 첫 행만 읽고 판단한다
- **개선 방향 ①** 설명문 nowrap 해제(2줄 허용, 12px) 또는 문장을 «선물 실시간 · 현물 05:00 KST 마감» 처럼 값 없는 상태 요약으로 축약; «FUTURES LIVE» 배지와 행 메타 중 하나만 남기고, 세션 토큰을 한국어(«실시간»/«마감»)+기준 시각으로 통일(0-5 #13 의 4변형도 함께) — 트레이드오프: 영어 대문자 토큰이 주던 «터미널» 인상이 약해짐(#8 식별성과 상충 가능) — 모노 숫자와 세로 시안 바가 그 역할을 대신해야 함 ／ **개선 방향 ②** **[과감]** «세션이 첫 뷰포트를 재배열한다» — 정규장엔 현물 지수 행이 1행·전폭 카드(값 24px), 장외엔 선물 행이 1행; 닫힌 행은 채도 40%+«마감 05:00 KST» 워터마크로 뒤로, 살아있는 행만 글로우. 상태 문장은 헤더 «DARK POOL INTEL» 자리에 «장마감 · 선물 실시간 · 06:14 KST» 로 올라가고 브랜드 태그라인은 로고에 흡수 — 트레이드오프: 브랜드 서브라인 노출 상실; 행 순서가 바뀌어 위치 기억이 깨짐(장 전환 순간 레이아웃 점프) · 실패 가능성: 휴장·프리마켓처럼 «둘 다 반쯤 살아있는» 상태에서 규칙이 모호해 잘못된 행이 앞으로 옴; 전환 애니메이션 없이 순서가 바뀌면 «버그»로 보임 · 되돌리는 비용: 소 — 정렬 조건 1개·헤더 텍스트 1개
- **출처:** NN/g Heuristic #4 Consistency and Standards · NN/g International Web Usability(시간대 표기) · Apple HIG Typography(잘림 최소화) · 3단계 기준 #4(상태별 표기 1종·기준 시각 동반·ET 단독 0)·#7(what→so-what 위계)

**4-4-9. 알림 권한: 2/2 «알림 설정» 카드 3장에 선택 수단이 없어 사용자가 아무것도 고르지 않은 채 「시작하기」 직후 시스템 창을 만난다 — 설정 시트에 이미 있는 토글 3개가 온보딩엔 없다 — [표현층] [확실] · 심각도 중간 · 비용 소 · 기준 #6, #3**
- **관측:** firstrun_04-step-2of2_17e: 「2 / 2 · 알림 설정」 아래 카드 3장(장마감 리포트 / 시장 브리프 / 데이터 잠금해제 — «데이터 잠금해 / 제» 2줄 꺾임)이 제목+한 줄 설명뿐이고 체크·토글·선택 상태가 없다 → «설정» 이라는 제목과 달리 설정할 수 있는 것이 없다. 이어 amber 박스 «리포트 알림» 면책 → 「시작하기」 → firstrun_05-after-start_17e: 시스템 알림 권한 창이 그 카드 위에 겹친다(AppFirstRunOnboarding.tsx:267 finish 시 requestPermissions). 반면 설정 시트에는 알림 토글 3개가 존재(1-A-2 설정 행) — 같은 선택이 온보딩에서는 «보여주기만», 설정에서는 «고르기». 신규 사용자가 첫 3초에 얻는 것은 «내가 무엇에 동의했는지 모르는 시스템 창». (`firstrun_04-step-2of2_17e` · `firstrun_05-after-start_17e` / `components/app/AppFirstRunOnboarding.tsx:267` · `components/app/AppFirstRunOnboarding.tsx:356-368`)
- **바꾸는 사용자 행동:** 2/2 카드가 «켜짐» 기본값의 토글이고 「시작하기」 라벨이 «알림 2개 켜고 시작» 처럼 선택을 되비추면 → 사용자가 시스템 창을 «내가 고른 것의 확인»으로 받아들여 «허용»을 누른다 → 알림 허용률과 첫 리포트 도달률이 오른다
- **개선 방향 ①** 카드 3장을 설정 시트와 같은 토글 행으로(기본 ON, 상태가 로컬 설정에 저장), CTA 라벨을 선택 수를 반영(«알림 3개 켜고 시작»), «데이터 잠금해제» 는 «잠금 해제 알림» 으로 줄여 2줄 꺾임 제거; 시스템 창은 하나라도 ON 일 때만 요청 — 트레이드오프: 온보딩이 «읽기»에서 «조작»으로 바뀌어 체류 시간 +5~10초; 모두 OFF 면 권한을 아예 묻지 않아 나중 재요청 경로가 필요 ／ **개선 방향 ②** **[과감]** 알림 권한 요청을 온보딩에서 완전히 빼고, 첫 리포트 발행 직후 재방문(07:00 KST 이후 첫 실행)에 Intel 리포트 위에 «어제 장마감 리포트가 나왔어요 — 다음엔 알려드릴까요?» 컨텍스트 카드로 옮긴다(2/2 는 «무엇이 오는지» 미리보기 화면으로만 남김) — 트레이드오프: 첫날 푸시를 못 받는 사용자 발생(허용 시점이 하루 늦음); 재방문하지 않는 사용자에게는 영영 안 묻게 됨 · 실패 가능성: 컨텍스트 카드가 리포트 위에 얹혀 4-4-08 의 «덮는 요소» 문제를 재생산; 리포트 미발행일엔 트리거가 없음 · 되돌리는 비용: 소 — 호출 위치 1개 되돌리기
- **출처:** Apple HIG Privacy: «request permission in context… pre-alert screen»(사전 안내 허용) · NN/g Information Scent(«설정» 라벨 vs 실제 조작 가능성) · 3단계 기준 #6(라벨 예측)·#3(동의 흐름)

---

### 4-5. 첫 화면 재설계 2안 (텍스트 와이어프레임, 390×844pt)

> **선정 방법.** 3안(판정 수평선 / 세션 편성표 / 데스크 그리드)을 3렌즈(정밀층 판독·정직성 / 표현층 과감함·식별성 / 기능 전달·실행 비용)로 독립 채점한 결과 합계 **A 판정 수평선 22 · C 데스크 그리드 18 · B 세션 편성표 16**(30점 만점, 표는 절 끝). 세션 편성표는 표현층 렌즈 1위(8)였으나 히어로의 가장 큰 숫자 «3h 56m»이 **현재 데이터 세트에 없는 새 계산값(기능 추가)** 이고, 조기 폐장·임시 휴장에서 세션 상수로 만든 카운트다운·«마감값 9/3 16:00 ET» 파생 스탬프가 **틀린 숫자를 인쇄**(제안자 스스로 인정)하므로 하드 제약(기능 변경 금지·데이터 없는 값 지어내지 않기) 위반으로 탈락시켰다. 표현층 8점은 하드 제약 실격을 넘지 못한다. 남은 두 안에 심사자의 «접목할 최고 아이디어» 3건을 붙이되 각 안의 테제를 깨지 않는 범위로 제한했고, 심사가 지적한 규칙 위반(경미)은 전부 수정했다. **접목 후 재채점은 하지 않았다** — 점수는 실화면 캡처로만 오른다.
>
> **표기.** [정] 정밀층 · [표] 표현층. 와이어프레임 값은 `dash_default-top_17e`(2026-09-03 밤 ET, 현물·ETF 마감 + 선물 라이브) 실측치. **시각(00:04 ET 등)은 캡처에 인쇄되어 있지 않으므로(4-1-9) 필드의 예시값** — 실제 값은 `marketTime` 에서 온다. 고정폭 박스는 한글을 2칸으로 그려 정렬이 근사다. 셸 상수(두 안 공통·[추정] 캡처 역산): 상태바 47 · 광고 선반 60 · 탭바 셸 106(아일랜드 64 + 위 여백 8 + 홈 인디케이터 세이프 34).

---

#### 안 A — «판정 수평선» (Verdict Horizon): 한 문장이 먼저, 표는 그 아래

**한 줄 테제.** 지금 시장은 위험을 사고 있나 피하고 있나 — 어느 세 숫자가, 언제 값으로 그렇게 말하나.

**각도.** 첫 뷰포트 상단(y91~279)을 코드가 이미 계산하는 판정 `riskTone`(`dash/page.tsx:856`)과 근거 3숫자(`cashAvg`·`futuresAvg`·`riskScore`, `:846-855`)로 **규칙 생성된 한 문장**에 주고, 그 아래에 판정의 문턱(42·58)이 인쇄된 0–100 자를 풀블리드로 긋는다. 9종목은 3×3 글로우 카드(`dash_default-top_17e`)가 아니라 헤어라인 표로 위계를 내린다. 카드·글래스·그라디언트·DEMO 스파크라인·▲▼ 이중 부호·FUTURES LIVE 필 2개를 걷어내고, 첫 뷰포트에서 살아 있는 색은 방향 2색(녹·적) + 라이브 점 1색(시안)뿐이다.

**와이어프레임 (390×844pt · iPhone 17e · ko · 좌우 여백 16, 내부 폭 358)**

```
 y     [h]  ┌────────────────────────────────────────────────────────┐
   0   [47] │ 9:41                                       ▪▪▪ ᯤ ▮     │ 상태바(시스템). 헤더는 env(safe-area-inset-top) 아래서 시작
  47   [44] │ (S) SIGNUM HQ                                    [ ⚙ ] │ 헤더 [표] 워드마크 15px/700 · 기어 히트박스 44×44(아이콘 20) · 스티키 불투명
  91  [188] │ 장마감 · 선물 실시간 · 기준 09/04 00:04 ET · 13:04 KST     │ ① 눈썹 16 [정] 11px/600 보조잉크 — 세션어 + 라이브 그룹 + 판정 입력 중 실측 marketTime 최신값(선물)
            │                                                        │   (gap 8)
            │ 위험 선호 우위                                          │ ② 판정어 48 [정+표] 40px/900 display · 방향색(선호=녹 / 회피=적 / 혼조=흰) · 1줄 고정
            │                                                        │   (gap 8)
            │ 현물 +1.21% 상방 · 선물 +0.02% 중립 · 리스크 68/100        │ ③ 근거 문장 44(2줄 상한) [정] 15px — 숫자 700 tabular 방향색, 말 400 보조잉크 토큰
            │                                                        │   (gap 12)
            │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░▒▒▒▒▒▒●▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒│ ④ 리스크 자 12 [정+표] 풀블리드 x=0→390 = 0→100 · 3구간 평면 틴트(회피 적α.14 / 혼조 중립α.06 / 선호 녹α.14) · 마커 3×16 방향색 = 화면 유일의 «위치가 바뀌는 것»
            │ 0        위험 회피      42     혼조     58      위험 선호     100 │   척도 라벨 16 · 11px/600 — 문턱 42·58 = :856 의 실제 분기값을 그대로 인쇄
 279    [8] │                                                        │
 287  [354] │ 지수 선물                          ◉ 실시간 · 00:04 ET   │ ⑤ 표 [정] 카드 없음 · 페이지 바닥 위 헤어라인 표. 그룹 눈썹 22 · 11px/600 · 우측 = 세션어 + 그룹 marketTime 최신값
            │ NASDAQ 100 F                 29,532            +0.02%  │ 행 32(비인터랙티브): 이름 열 150pt 13px/600 전체명 · 가격 15px/600 tabular 우정렬 · 변화 15px/700 tabular 우정렬 방향색
            │ S&P 500 F                  7,754.50             0.00%  │ 반올림 0 → 무부호 «0.00%» 중립 회색(현행 «▼ −0.00%» 적색 소멸)
            │ RUSSELL 2000 F             2,969.50            −0.01%  │ − = U+2212 · ▲▼ 없음
            │ ─────────────────────────────────────────────────────  │ 헤어라인 1px rgba(255,255,255,.08) — 카드 테두리 대신
            │ 현물 지수                                      장마감   │ 시각 필드 없는 그룹 = 세션어만(갱신 시각을 «기준»으로 찍지 않음)
            │ NASDAQ                       26,584            +1.40%  │
            │ S&P 500                    7,747.71            +1.06%  │
            │ DOW                          53,686            +1.18%  │
            │ ─────────────────────────────────────────────────────  │
            │ ETF · 변동성                                   장마감   │
            │ QQQ                         $717.67            +1.19%  │
            │ SPY                         $773.17            +1.05%  │
            │ VIX                           14.32            −5.79%  │ noData → «—» · 스파크라인 없음(DEMO 배열 = 선 없음)
 641   [32] │ 매크로 · 8                                              │ ⑥ 다음 섹션 눈썹만 폴드 위(10 gap + 22) — 카운트 «8» = 스크롤 단서. 첫 매크로 셀은 폴드 아래(반쪽 노출 0)
 673    [5] │                                                        │
 678   [60] │ ▒▒▒▒▒▒ 광고 선반 — 불투명 다크 슬롯(흰 배너 50 + 거터 5×2) ▒▒▒▒▒ │ ⑦ 예약 슬롯 [표]: 로드 전에도 높이 고정 · 스크롤 컨테이너 하단 = 선반 상단(클립) → 겹침 0px
 738  [106] │   ▣ 대시보드   ◇ 리스크   ▭ 종목   ∿ 옵션 플로우   ◎ 섹터   │ ⑧ 탭바 셸(플로팅 아일랜드 64, 반투명 유지) — 라벨·활성색은 «공통 전제»
 844        └────────────────────────────────────────────────────────┘
```

첫 뷰포트 합계: 47 + 44 + 188 + 8 + 354 + 32 + 5 + 60 + 106 = **844** (심사가 지적한 «832≠844» 예산 오류 수정: 행 30→32pt).
**속보 행이 있을 때**(urgency ≥ 8 이고 ageMinutes ≤ 180): 히어로 하단 패딩 −4(188→184) + 속보 행 40(y275~315, 탭 → `guardian?tab=reality` 기존 경로) → 표 y323~677 → 광고 선반 678. 매크로 눈썹·gap(37pt)은 폴드 아래로. 합계 47+44+184+40+8+354+1+60+106 = 844.
첫 뷰포트 수치 값: 3(문장) + 18(표) = **21**(현행 21 과 동일, `1-A-6`) · what:so-what = 18:3 · 비티커 영어 라벨 **0**(현행 ≈20, `dash_default-top_17e`) · hue 3(녹·적·시안).

**폴드 아래 순서.** ① 매크로 8 (4×2 불투명 near-black 카드 1종, 라벨 11px 1줄 — 최장 «US 10Y», 값 15px tabular, 2s10s·F&G 배지는 활자 라벨, 셀별 marketTime 없으면 «—») ② 섹터 히트맵 8 (잠긴 5구간 램프 ≤−1.0 / −1.0~−0.3 / ±0.3 / 0.3~1.0 / ≥1.0, 방향 2색 알파 2단 + 중립, 하단 범례 인쇄, 셀 수치 항상 인쇄) ③ 무버 상위 (캡슐 토글 거래대금/상승률/하락률 + 가로 스냅 4카드, **스파크라인 0** — `movers/route.ts:7-11` `getSpark` 가 방향별 상수 배열을 항상 돌려주므로 «API 가 주면 그린다» 규칙은 폐기하고 열 자체를 뺀다, «전체 보기 ›» 44pt) ④ 뉴스 5 / AI 브리핑 (캡슐 토글, 뉴스 행 44pt + ageMinutes, 브리핑은 좌측 룰 카드 + 면책 1줄 상단 — 2-4 «경계 있는 다이제스트») ⑤ 기관 시그널 4 (ValueWall 잠금 유지, 잠금 위에 teaser 값 «$62.3B · 4개 중 1개» 1줄 so-what, «오늘 14.2K 잠금해제» 정적 문구 삭제 — `dash_default-bottom_17e`, 0-5 #10) ⑥ 푸터.

**3초 판정 요소.**
1. 판정어 «위험 선호 우위» — 40px/900, 방향색 1덩어리 (`riskTone`).
2. 근거 한 문장 — 숫자 «+1.21% / +0.02% / 68» 만 굵고 방향색, 말은 보조잉크 (`cashAvg`·`futuresAvg`·`riskScore`).
3. 리스크 자 — 풀블리드 0~100 위 마커 68, 문턱 42·58 인쇄.

**표현층 서명 요소 — 왜 우리만의 것인가.**
- **리스크 수평선(Verdict Horizon).** 카드를 무시하고 화면 폭 390pt 를 가로지르는 12pt 띠(3구간 평면 틴트) 위에 마커 하나와 «42·58» 문턱 눈금. Quant Data 는 도넛, MenthorQ 는 색 단어, CNN F&G·우리 Guardian(`guardian_default-top_17e` 반원 게이지)은 게이지이고 셋 다 «판정이 바뀌는 문턱»을 숨긴다. 우리만의 것인 이유: 눈금 42·58 은 장식이 아니라 `dash/page.tsx:856` 의 실제 분기값이라 **디자인이 곧 공식의 정직성**이 되고, 같은 자를 Guardian RLSI·섹터 점수·푸시 이미지·OG 에 «문턱 인쇄된 0–100 자»로 재사용하면(2-4 #9 «점수형 지표는 고정 0–100 바») 5탭을 묶는 식별 자산이 된다. 4pt 트랙이 σ2% 블러에서 소멸한다는 심사 지적을 받아 **12pt 3구간 띠**로 키웠다 — 블러 후 «큰 색 단어 + 그 아래 가로 띠 위의 밝은 점 하나»가 남는다.
- **숫자 굵고 말 가는 문장(Numbers-bold prose).** 기계 생성 근거 문장에서 숫자는 700 tabular 방향색, 단어는 400 보조잉크 토큰. Sofascore 의 «승자 풀잉크 / 패자 감광»을 «값 / 말»로 옮긴 것. 금융 앱은 예외 없이 «라벨 굵은 대문자 + 숫자 보통»(KPI 타일)이거나 «전부 굵은 문장»이라 이 역전이 식별점이며, 문장의 모든 수치가 아래 표와 같은 JSON 에서 오므로 프로즈가 표를 배신하지 않는다.
- **편성표 눈썹(Schedule eyebrow).** 모든 수치 블록의 첫 줄을 «세션어 · 기준 MM/DD HH:MM ET · HH:MM KST» 고정 순서로 인쇄(NTS 의 시간창 + Windy 의 출처 인쇄). 미국 앱은 KST 를 찍지 않고 한국 증권앱은 ET 를 앞세우지 않는다 — «미국장을 한국 밤에 읽는 사람»이라는 청중 정의가 활자로 드러나는 자리. 히어로·그룹 3·매크로에 같은 형식이 반복돼 기억된다. (탈락한 세션 편성표 안의 «레일»을 텍스트로 축약해 살린 자리이기도 하다.)
- **라이브 점 하나의 글로우.** 4-1-C «라이브 글로우는 확장하되 없애지 말 것»에 따라, 그룹 눈썹의 ◉(시안)에 반경 6pt 정적 글로우 1개 — 첫 뷰포트에서 유일한 글로우·유일한 시안. 깜박임 0.

**정밀층 규칙.**
1. 크기 하한: 판정어 40px/900(en 은 34px 로 1줄 강제) · 근거 문장 15px(숫자 700 tabular) · 표 이름 13px/600 · 가격 15px/600 · 변화율 15px/700 · 눈썹·척도 라벨·그룹 상태 11px/600 · 11px 미만 선언 0.
2. 대비: 히어로·표는 카드 없이 페이지 바닥 `#0b111e` 위 — 주 #f8fafc 17:1, 보조잉크는 #94a3b8(6.9:1, 2.5 의무 ②)을 한 단 밝힌 토큰 ≥7:1, 녹 #10b981 ≈7.3:1. 적색은 현 #ef4444 가 4.8:1 이라 15px 텍스트에 못 쓴다 → 텍스트용 적 토큰 1값을 ≥7:1 로 재정의(Guardian 의 rose/red 공존 `guardian_default-top_17e` 도 이 토큰으로 수렴). **감광은 알파가 아니라 토큰**(탈락 안 접목): 문장의 «말»도 70% 알파가 아니라 실측 ≥7:1 토큰값으로 고정.
3. 숫자 전부 `font-variant-numeric: tabular-nums` — 문장 안 숫자 포함. 표는 가격·변화율 우정렬로 소수점 열 정렬(편차 ≤1px). 프로즈(뉴스·브리핑)엔 tnum 금지.
4. 부호 규칙 1종: «+/−»만, ▲/▼ 폐기, 마이너스 U+2212. **반올림 후 부호**: `fmtChg`(`:146-149`, `n >= 0 ? '+' : ''` + `toFixed(2)`)와 `up: chg >= 0`(`:1284`) 둘 다 표시값 기준으로 교체 → |chg| < 0.005 는 «0.00%» 무부호·중립 회색, «−0.00%» 0건(`dash_default-top_17e` S&P500 F 카드, `guardian_ZOOM-risk-strip_17e`).
5. 기준 시각: 실측 필드가 있을 때만 인쇄. 선물 = `marketTime`(`feedMetaForItem` `:266-282`), VIX = `marketTime`, 히어로 = 판정 입력 중 marketTime 이 있는 최신 피드(선물)의 값. **`updatedAt` 은 기준 시각으로 쓰지 않는다** — `index-close/route.ts:24-25,64-70` 의 updatedAt 은 5분 캐시 갱신 시각이고 DEFAULT 폴백은 now 를 찍으므로 마감값에 갱신 시각이 «기준»으로 붙는 오표기가 된다(심사 지적 수용). 현물·ETF 그룹은 세션어 «장마감»만. 시각 없으면 «—», 절대 현재 시각으로 대체하지 않음. 뉴스 상대시간은 24h 이내만, 초과는 «—».
6. 사용자 시간대: ko=KST · ja=JST 고정이 아니라 **`Intl` 로 기기 시간대**(DST 자동, 탈락 안 접목); 기기 tz 가 America/New_York 이면 단일 시계(«09:30 ET · 09:30 EDT» 중복 방지).
7. 세션 어휘 1종/로케일: ko 프리마켓·정규장·애프터마켓·장마감·휴장 / en PRE·REG·POST·CLOSED·HOLIDAY / ja プレ·通常·アフター·引け後·休場. `copy.ko` 의 `futuresLive:'FUTURES LIVE'`·`regularLive:'LIVE'`·`closed:'CLOSED'`·`holiday:'HOLIDAY'`(`:635-638` — ko 사전인데 값이 영어)를 사전값만 교체. 라이브 여부는 그룹 눈썹 «◉ 실시간» 한 표기(현행 «FUTURES LIVE» 60px 간격 2회 `:1728,:1740` → 1회).
8. **◉ 게이트(데스크 그리드 접목):** 라이브 점은 «세션 활성 AND 신선» — `feedMetaForItem(..., {requireFresh:true})` 의 `live`(`:274`, `isFreshFeedFactor` `:245-262`, marketAgeSec ≤ REDIS_FEED_FRESH_SEC)일 때만 켜진다. 세션은 열렸는데 피드가 낡으면 점은 꺼지고 «기준 HH:MM ET» 스탬프만 남는다 — «200 OK 인데 19시간 전»의 화면 방어선. 선물 3행이 현재 `requireFresh:false`(`:1289`)로 들어오는 것은 표시 판정에서만 true 로 올린다(데이터 변경 0).
9. 라벨 1줄·말줄임 0: 3열 카드 폐지 → 이름 열 150pt 에 «NASDAQ 100 F / RUSSELL 2000 F» 전체 표기(`sym` 내부값 유지, 표시명 매핑만). 「NASDAQ10…」「RUSSELL2…」(`dash_default-top_17e`, `_probe_relaunch_promax`) 구조적으로 소멸. 말줄임은 뉴스 제목 1곳만.
10. 스파크라인: 실측 시리즈가 없으면 선을 그리지 않는다. 첫 화면 9종목(`DEMO_INDICES` `:107-109`, `DEMO_FUTURES` `:1292-1294`, `DEMO_ETFS` `:1498-1518`)·무버 4(`:1153` 폴백 + 라우트 상수) 전부 선 0. `<Sparkline>` 호출 `:1754,:1785,:1823,:1950` 제거.
11. 히트 타깃: 기어 44×44(`.headerBtn` 30×30 `min-height:30px !important` `dash.module.css:58-70` 제거) · 속보 행 40 전폭 · 뉴스 행 44 · «전체 보기» 44 · 토글 캡슐 36 + 간격 ≥12. 표 행(32)은 비인터랙티브라 예외.
12. 빈 상태: `regimeReady=false`(`:865`) → 판정어 «—» + 문장 «선물·현물 값 도착 전» + 자는 띠·눈금만(마커 없음). 주황 «—» 박스 3개(`dash_relaunch-clean-8s_17e`) 폐기. 스켈레톤은 최종 레이아웃과 같은 슬롯에 **숫자·시각 자리부터**(로케일 무관) 찍고 라벨 자리는 빈 바(탈락 안 접목) — 부팅 URL `/en`(`capacitor.config.ts:20`)이 남아 있는 동안의 웹 배포용 방어.
13. 광고: 탭바 위 60pt 불투명 다크 «광고 선반» + 스크롤 컨테이너 하단 = 선반 상단 → 정밀 요소 겹침 0px(`firstrun_ZOOM-ad-over-content_17e` 의 ETF 행 덮음 소멸) · 로드 전에도 높이 고정(CLS 0) · **첫 실측 수치 렌더 후에만 show**(`adManager.ts:177 wantBanner` 에 조건 1개 추가 — 기준 #3, 심사 지적 수용) · 온보딩·약관 화면 광고 0.
14. 색 예산: hue 3 — 방향 녹/적(판정어·변화율·마커·띠 알파 공유) + 시안(라이브 점). 혼조는 흰색(amber 폐기). 워드마크 «HQ» 시안은 로고(기준 #1·#8 채점 제외)로 유지 — «공통 전제» 참조.
15. ko 뷰포트 비티커 영어 라벨 0: `riskOn/mixed/riskOff` 사전값을 «위험 선호 우위 / 혼조 / 위험 회피 경계»(ja リスクオン優勢 / まちまち / リスクオフ警戒)로 교체(`:645-647`). 티커·고유명사·단위(ET·KST)만 라틴. 헤더 «DARK POOL INTEL»(`:1637`, 4-1-3 간판 불일치) 삭제.
16. 동작: 판정어·숫자 스프링·롤링·펄스 0. 마커 이동은 refresh 시 즉시 치환. `liveBlink 1.8s` 폐기. 글로우 1개는 정적(reduced-motion 무관).
17. **ⓘ 공식 툴팁은 넣지 않는다**(심사가 «와이어프레임 밖 소형 UI 추가»로 지적) — 척도 라벨(회피 ┃42 혼조 58┃ 선호)이 설명을 대신한다. 공식 노출은 범위 밖 관찰로.

**실측 결함 → 이 안의 처리.**

| 결함 (캡처) | 처리 |
|---|---|
| 라벨 줄바꿈(0-5 #6, `cmd_ZOOM-darkpool-tiles_17e`) | 첫 화면 3열 카드 폐지 → 표; 매크로 4열 라벨 ≤6자(«US 10Y») 1줄 |
| 말줄임 «NASDAQ10…»(`dash_default-top_17e`) | 이름 열 150pt 전체명 |
| «▼ −0.00%» 적색(`dash_default-top_17e`) | 반올림 후 부호 판정 → «0.00%» 무부호 중립 |
| 이중 부호 «▲ +1.40%» | ▲▼ 폐기, +/− 만, U+2212 |
| DEMO 스파크라인(0-5 #18, 4-1-1) | 첫 화면 9 + 무버 4 전부 선 0 |
| 기준 시각 0개(4-1-9) | 히어로·선물 그룹·매크로 셀에 실측 marketTime 만 인쇄, 없으면 세션어/«—» |
| 영어 라벨 ≈20/뷰포트(1-A-1) | copy 사전값 교체 + 탭바 라벨(공통 전제) → 0 |
| 광고가 콘텐츠 덮음(`firstrun_ZOOM-ad-over-content_17e`) | 예약 선반 60 + 컨테이너 클립 + 첫 수치 뒤 show |
| 30px 기어(0-5 #20) | 44×44 |
| 영어 스켈레톤 8초·헤더가 상태바 위(`dash_relaunch-clean-8s_17e`) | safe-area 헤더 + 숫자-우선 스켈레톤(웹) / 부팅 URL 은 셸(공통 전제) |
| FUTURES LIVE 2회(4-1-8 ③) | 그룹 눈썹 1표기 |
| «속보» 배지가 6h 기사에(`firstrun_10-landing-20s_17e`) | 속보 행은 urgency≥8 AND ageMinutes≤180 일 때만(데이터 동일, 표시 규칙만) |

**사용 데이터 (전부 기존).** `riskScore`(clampPct) · `riskTone`(≥58/≤42) `:855-856` · `futuresAvg`/`futuresTone`, `cashAvg`/`cashTone`(±0.15) `:846-847,:857-858` · `regimeReady`·`futuresReady`·`indicesReady` `:865` · `marketSession`·`isMarketHoliday`·`futuresLive`(`isCmeGlobexActive`)·`equityExtendedLive`·`volatilityLive` `:844-845,:866-870` · PulseItem 9(sym·px·chg·noData·live·marketTime·updatedAt·feedSource·isStale — 선물 `:1279-1294`, 현물 `:107-109`, ETF `:1498-1518`) · copy 사전 ko/en/ja `:629-776` · `fmtPrice`/`fmtChg` `:140-149`(부호 규칙만 교체) · newsItems(headline·summaryKR/JP/EN·urgency·category·ageMinutes `:1657-1686`) · MacroItem 8(`:1315-1413`, 라벨 BTC·GOLD·OIL·SOX·US 10Y·DXY·2s10s·F&G) · sectors 8(name·pct) · movers(sym·px·chg + 토글 3; spark 미사용) · briefing·briefingReady·briefingMode · institutionalSignals 4 + gateCopy(«14.2K» 미사용) · 설정 라우트 `:1641` · AdMob 배너(위치·슬롯·show 시점만) · 탭바 5탭. **새 API·새 필드·새 계산 0.**

**이 안이 바꾸는 사용자 행동.** 22:30 KST 에 앱을 연 한국 사용자는 스크롤·확대 없이 첫 3초에 «위험 선호 우위 / +1.21% / +0.02% / 68» 네 토큰을 읽고 «오늘은 사는 장인가»에 답을 얻는다 — 현행처럼 같은 크기 숫자 21개를 훑고(`dash_default-top_17e`) Guardian 으로 넘어가 레짐을 찾는 왕복(4-1-A 패널: «리스크 69 → 첫 탭 대상»)이 사라진다. 07:00 KST 사용자는 눈썹 «장마감 · 선물 실시간 · 기준 …»과 그룹의 «장마감»으로 «이 숫자는 어젯밤 마감값이고 선물만 살아 있다»를 읽는 순간 알아, 마감값을 실시간으로 오독하지 않는다.

**트레이드오프.**
- 첫 화면 스파크라인 9개가 사라져 «차트가 많은 앱» 인상이 준다 — 잃는 정보는 0(전부 DEMO). 실측 히스토리가 생기면 표 행 우측 60pt 에 축 없는 미니 선을 되살릴 자리는 남긴다(데이터 작업 = 범위 밖).
- «DARK POOL INTEL» 서브라인 삭제 — 태그라인은 스플래시·온보딩·설정 v 표기로. 대표가 첫 화면에 남기길 원하면 헤더 44 안 워드마크 아래 11px 1줄로 복귀 가능(예산 +0).
- 뉴스 티커 5초 회전이 첫 뷰포트에서 사라지고 속보만 조건부 행 — 일반 뉴스는 한 스크롤 아래. `guardian?tab=reality` 유입은 줄 수 있다.
- 판정어 «Risk-On 우위» → «위험 선호 우위»: 외래 용어에 익숙한 사용자에겐 낯설 수 있으나 Guardian 이 이미 «위험 선호»(`guardian_default-top_17e`)를 쓰고 있어 앱 안 어휘가 통일된다.
- 문턱 42·58 인쇄는 «왜 58 인가»를 부른다 — 공식(선물×7 + 현물×4 + 폭×0.35 + F&G×0.25 − VIX×2.5)이 휴리스틱임이 드러나는 것은 정직성의 대가. ⓘ 를 넣지 않았으므로 답은 «공식 공개»가 아니라 «척도 라벨»뿐이다.
- amber 를 첫 화면에서 없애 «혼조»가 흰색 — 혼조는 «신호 없음»이라 무채색이 맞다.
- 9행 표는 카드보다 «터미널»처럼 보이고 탭 어포던스가 없다 — 현행 카드도 탭 불가(1-A-6)라 기능 손실 0.
- 적 텍스트 토큰을 밝히면 Guardian·Flow 의 적색과 잠시 불일치 — 토큰 수렴(2.5 의무 ①②) 완료 시 해소.

**실패 가능성.**
- 피드 한쪽이 오래 비면 `regimeReady=false` 로 «헤드라인 없는 첫 화면». 2-4 #11 «마지막 정상값 + 타임스탬프»가 방어선이지만 히어로용 lastGood 은 지금 없다(데이터 작업) — 콜드스타트 동안 이 안은 현행보다 더 비어 보일 수 있다. 관측: `dash_relaunch-clean-*_17e` 재캡처.
- riskScore 가 문턱 근처에서 30초 폴링마다 흔들리면 판정어가 «위험 선호 우위 ↔ 혼조»로 토글 — 자에 문턱이 인쇄돼 «59→57» 이동은 정직하게 읽히지만 히스테리시스는 넣지 않는다(로직 변경 금지).
- σ2% 블러의 최대 밝기 블롭은 여전히 흰 광고 배너일 수 있다(`firstrun_10-landing-20s_BLUR_17e`) — 40pt 판정어 잉크(≈4,800pt²)가 358×50 흰 슬래브(≈17,900pt²)를 못 이긴다. 광고 선반은 «덮음»을 없애지 «시선»을 없애지 못한다. 어떤 첫 화면 안도 공유하는 실패.
- 기준 #7 «장식 8~20%»를 픽셀 면적으로 재면 이 안은 띠·마커·글로우·헤어라인뿐이라 8% 미만(«무난» 결함 판정 가능). 판정어·자가 형태로 식별을 담당한다는 베팅이며, #8 블러 패널 적중 ≤2/5 면 띠를 24pt 로 넓힌다(새 데이터 0).
- ko/ja 40px display × Dynamic Type +2단은 미검증(0-4; 0-5 #17 현 앱은 AX 크기에 반응 0) — «위험 회피 경계» 6자·«リスクオフ警戒» 7자는 358pt 에 들어가지만 AX 크기에선 2줄 가능 [추정].
- 속보 행이 하루 종일 걸리면 첫 화면이 늘 40pt 짧아진다 — ageMinutes≤180 게이트로 완화.
- 대표가 «표 = 다운그레이드»로 볼 위험 — 9카드+글로우+스파크라인이 «풍성함»으로 읽혀 온 이력. 대응은 실화면 A/B 캡처(현행 vs 안)를 블러·정밀 두 층으로 나란히 보이는 것뿐.
- 라이브 세션(22:30 KST) 화면은 캡처가 없어(0-3) ◉ 가 세 그룹 전부에 켜졌을 때 «점 3개»로 희석되는지 미확인.

**되돌리는 비용 · 비용.** 되돌림 **낮음** — 서버·API·데이터 변경 0. 구 regimeStrip + 3×3 그리드 + 티커 바를 플래그 하나 뒤에 보존하면 플래그 off 1배포(웹, 심사 불필요). 포맷 유틸(U+2212·«0.00%»·ET/현지 스탬프)·광고 선반·44pt 기어·safe-area 헤더는 되돌려도 남기는 것이 이득이라 실질 되돌림 대상은 히어로·표 두 컴포넌트. **비용 중** — 히어로·표 2컴포넌트 + 포맷 유틸 1 + copy 사전 3로케일 + adManager 조건 1 + 탭바 문자열(공통).

**차용한 레퍼런스.** Gentler Streak(판정 우선 위계: 문장→설명→차트→리스트, 비교 기준 명시=문턱 인쇄) · Tide Guide(상태 우선 히어로 ~40pt + 나머지 13–15pt, «지금»은 화면 유일의 밝은 마커 1개) · NTS Radio(live 에만 한 색, 편성표식 시간창 인쇄, 색 칩 대신 활자 라벨) · Windy(출처·기준 인쇄, 범례와 셀이 한 램프 + «결정이 바뀌는 문턱»에 구간) · Sofascore(잠긴 색 척도, 승자 풀잉크/패자 감광 → 숫자/말, 카운트 필 «매크로 · 8») · Kalshi Pro(대시 아니면 지어내지 않음) · Robinhood Market hours(«배경이 세션을 말한다» → 세션어 + 라이브 점으로 축소 번역) · 2-4 #5(히어로 하나 display cut) · #9(고정 0–100 수평 바) · #11(빈 프레임 대신 마지막 정상값 + 타임스탬프) · #7(AI 브리핑은 폴드 아래 다이제스트 — 히어로 문장은 규칙 생성이라 충돌 없음).

**접목·수정 기록.** ① 데스크 그리드의 «◉ = 세션 활성 AND 신선» 게이트(렌즈 3 차선 접목) ② 데스크 그리드의 탭바 콘텐츠 명사 라벨(렌즈 3 1순위 접목 → 공통 전제) ③ 세션 편성표의 Intl 기기 시간대·토큰 감광·숫자-우선 스켈레톤 ④ 심사 지적 수정: 무버 스파크 폐기(getSpark 상수) · updatedAt 을 기준 시각에서 배제 · 히어로 눈썹을 선물 실측 시각으로(16:00≠21:14 자기모순 해소) · 예산 844 재계산 · 광고 «첫 수치 뒤» 게이트 · ⓘ 삭제 · 영어 스켈레톤 «0» 주장을 «웹 방어 + 셸 수정 필요»로 정정 · 4pt 트랙 → 12pt 띠 · 정적 점 → 글로우 1개(4-1-C).

---

#### 안 B — «데스크 그리드 + 판정 자»: 한 표 · 한 색 · 한 시각

**한 줄 테제.** 지금 시장은 어느 쪽으로 기울어 있고, 화면의 숫자 중 무엇이 지금 움직이는 값인가 — 22:30 KST 에 연 사람이 판정 행 → 변화 열의 부호 패턴 → 상태 열의 시안 점 순으로 3초에 답을 얻는다.

**각도.** LSEG Halo / Kalshi Pro 식 기관 밀도를 390pt 에 옮긴다. 무채 near-black 3단 + «살아 있는 값»에만 쓰는 시안 1색 + 상승/하락 2색, 그 외 색 0(amber·purple·그라디언트·글로우·glass 전부 제거). 첫 뷰포트는 카드가 아니라 **한 장의 판**: 판정 행(0행) + 리스크 자(접목) → 9지수 한 표(종목·값·변화·상태) → 뉴스 1행. 심사가 지적한 «매크로 테이프 8칸이 첫 뷰포트를 what 36개·전문어 ≥5 로 밀어 넣는다»를 받아 매크로는 폴드 아래로 내리고 눈썹 «매크로 · 8»만 남겼다. 절제의 총량이 곧 과감함이라는 베팅 — 블러하면 회색 격자 위 우측 가장자리의 시안 점 3~4개, 좌상단의 색 단어 하나, 그 아래 가로 띠만 남는다.

**와이어프레임 (390×844pt · iPhone 17e · ko · 좌우 여백 16, 내부 폭 358 · 열폭 140/88/72/58)**

```
 y     [h]  ┌────────────────────────────────────────────────────────┐
   0   [47] │ 9:41                                       ▪▪▪ ᯤ ▮     │ 상태바(시스템)
  47   [44] │ (S) SIGNUM HQ         현재 00:04 ET · 13:04 KST   [ ⚙ ] │ ① 데스크 바 [정] 시계 = marketStatus.serverTime(ET + 기기 시간대) 12px tabular — 라벨은 «현재»(«기준» 아님, 심사 수정) · ⚙ 44×44 · 불투명 패널 + 하이라인 1px
  91   [88] │ 위험선호 우위                            리스크      68 │ ② 판정 행 = 표의 0행 [정+표] riskTone 22px/700 방향색 · 68 = Math.round(riskScore) 22px tabular, 값 열 우측선(x=244)에 정렬
            │ 선물 중립 +0.02% · 현물 상방 +1.21% · 3지수 평균          │    근거 13px(숫자 700 tabular, 심사 지적 12→13px) · 기준 명시 «3지수 평균»
            │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░▒▒▒▒▒▒●▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒│ ③ 리스크 자 12 [정+표] (안 A 에서 접목) 풀블리드 0→100 · 3구간 평면 틴트 · 마커 3×16 방향색 · 눈금 42·58
            │ 0        위험 회피      42     혼조     58      위험 선호     100 │    척도 라벨 12 · 11px/600
 179   [22] │ 종목                          값       변화     상태 ET │ ④ 열머리 [정] 11px/600 눈썹 · 단위(ET)는 열머리에
 201  [390] │ 지수 선물 · 실시간                                       │ 그룹행 22 [정] 세션 토큰 1종(futuresLive)
            │ NASDAQ 100 F               29,532    +0.02%   ◉ 00:04  │ 행 36: 종목 13px/600 전체명 · 값 14px/600 tabular 우측 · 변화 13px/700 tabular 방향색 · 상태 12px tabular
            │ S&P 500 F                7,754.50     0.00%   ◉ 00:04  │ 반올림 0 → 무부호 «0.00%» 중립
            │ RUSSELL 2000 F           2,969.50    −0.01%   ◉ 00:04  │ ◉ = 세션 활성 AND 신선(isFreshFeedFactor)일 때만 시안 + 글로우 6pt(화면 유일)
            │ 현물 지수 · 장마감                                       │ 그룹행 (marketSession=closed)
            │ NASDAQ                     26,584    +1.40%      마감  │ index-close 에 실측 시각 필드 없음(updatedAt 은 캐시 갱신 시각) → 세션 토큰(보조잉크), 시각을 지어내지 않음
            │ S&P 500                  7,747.71    +1.06%      마감  │
            │ DOW                        53,686    +1.18%      마감  │
            │ ETF · 변동성 · 장마감                                    │ 그룹행 (equityExtendedLive=false)
            │ QQQ                       $717.67    +1.19%      마감  │
            │ SPY                       $773.17    +1.05%      마감  │
            │ VIX                         14.32    −5.79%     hh:mm  │ VIX 는 marketTime 필드 있음 → 있으면 시각(보조잉크), VIX 세션 활성+신선이면 ◉
 591   [10] │                                                        │ 간격(하이라인 없음)
 601   [40] │ 지표 │ 미국 기업 4개사가 한국의 반도체, 첨단소재, 에너지…   7h │ ⑤ 뉴스 1행 [표] 배지 11px 아웃라인(채움 0) · 헤드라인 13px 1줄 · 시각 12px ≥7:1 · newsItems[0] 고정(5초 회전 삭제, 심사 수정)
 641   [22] │ 매크로 · 8                                              │ ⑥ 스크롤 단서 눈썹만(테이프는 폴드 아래로, 심사 수정)
 663   [15] │                                                        │
 678   [60] │ ▒▒▒▒▒▒ 광고 선반 — 하이라인 1px + 불투명 다크 슬롯 60 ▒▒▒▒▒▒ │ ⑦ 예약 슬롯 [셸] 스크롤 컨테이너 하단 = 선반 상단 · 첫 실측 수치 렌더 후 show · 미채움 시 접힘은 첫 열림 1회만
 738  [106] │   ▣ 대시보드   ◇ 리스크   ▭ 종목   ∿ 옵션 플로우   ◎ 섹터   │ ⑧ 탭바 셸 — 플로팅 아일랜드 반투명 «유지»(원안의 불투명 탭바는 기준 #9 위반이라 기각) · 라벨·활성색은 공통 전제
 844        └────────────────────────────────────────────────────────┘
```

첫 뷰포트 합계: 47 + 44 + 88 + 22 + 390 + 10 + 40 + 22 + 15 + 60 + 106 = **844**.
첫 뷰포트 수치 값: 3(판정 행) + 18(표) = **21** + 시계 2 · what:so-what = 18:2(원안 매크로 테이프 포함 시 ≈17:1 → 매크로 하향으로 ≤10:1) · 미설명 전문어: 리스크(척도 라벨로 설명)·VIX(티커) → ≤2 · 비티커 영어 라벨 0(«상태 ET» 의 ET 는 단위).

**폴드 아래 순서.** ⑨ 매크로 8 — 2단×4 테이프(셀 36×89.5: 라벨 11px 눈썹 + 변화 **13px**(심사 지적 12→13) tabular 방향색 / 값 13px tabular; 한 줄 스크롤은 4.5칸을 제스처 뒤로 숨기고 자동 마퀴는 낡은 값에 «살아 있음» 거짓 신호라 기각) · BTC 는 24/7 이라 live 면 ◉ 허용 · 2s10s/F&G 배지(STEEP·GREED…)는 UI 언어 무채 활자 ⑩ 상위 무버 — 같은 표 문법(종목 | 가격 | 변화), 토글 텍스트 세그 44pt, «전체 보기» 우측, **스파크 열 없음**(`movers/route.ts:7-11` 상수) ⑪ 섹터 8 — 4×2, 셀 = 이름 12px + 변화 13px tab, 채움은 방향색 알파 단계(Sofascore), 그룹행 세션 토큰 ⑫ 브리핑 / 실시간 뉴스 5 — 패널 1종, 본문 14px 비례폰트, 뉴스 5행 = ageMinutes 좌측 고정폭 열(NTS) + 헤드라인; 브리핑엔 시각 필드가 없어 시각을 붙이지 않음(API 갭으로 기록) ⑬ 기관 시그널 4(광고 잠금) — 4행 표: 라벨 | 값(잠긴 행 «잠김» + 티저 1개 `institutionalSignals[0].value` «$62.3B» 노출), CTA «광고 보고 1시간 해제» 흰 무채 44pt, «오늘 14.2K 잠금해제»(`dash_default-bottom_17e`) 삭제 ⑭ 푸터 12px ≥7:1.

**3초 판정 요소.**
1. 판정 행 «위험선호 우위 · 리스크 68» 22px + 바로 아래 리스크 자의 마커 — so-what 이 표의 0행(위계 1위)이고 척도가 붙는다(4-1-5 해소).
2. 9행의 변화 열 — 부호(+/−)와 방향색 9개가 우측 정렬로 세로 한 줄에 서서 «전체 방향 패턴»이 숫자를 읽기 전에 보인다.
3. 상태 열의 시안 점(실시간 행 3개) + 데스크 바 시계 — «무엇이 지금 값이고 언제 값인가».

**표현층 서명 요소 — 왜 우리만의 것인가.**
- **«시안은 살아 있는 값에만».** 첫 화면에서 시안이 존재하는 자리는 상태 열의 ◉(과 24/7 BTC ◉)뿐. 활성 탭·배지·글로우·카드 테두리에서 시안을 전부 회수한다(NTS 의 red #e81717 = LIVE 전용 문법). 이 점은 신선도(`isFreshFeedFactor`)가 깨지면 꺼지므로 **브랜드 서명이 곧 데이터 정직성**이다. UW·Robinhood·토스·Quant Data 는 액센트가 차트·칩·CTA 에 퍼져 블러 시 «색 덩어리»가 되고, 우리는 «점»이다. (워드마크 «HQ» 시안은 로고로 예외 — 공통 전제.)
- **판정이 표의 0행 + 값 열 우측선(숫자 척추) + 그 밑의 자.** 22px 판정문과 리스크 점수가 9행 표와 같은 열 격자에 앉아 값 열 우측 정렬선(x=244)이 판정→선물 3→현물 3→ETF 3 까지 10행을 관통하고, 그 척추의 첫 마디 아래에 풀블리드 리스크 자가 놓인다. 블러 시 화면 우측 1/3 에 세로로 선 밝은 숫자 기둥 + 상단 가로 띠 하나 — 현행 3×3 카드(`dash_default-top_17e`)·경쟁 앱의 카드/캐러셀 첫 화면과 구조 자체가 다르다. 자는 안 A 와 **같은 자산**(같은 기하·같은 눈금)이라 두 안 중 무엇을 택해도 Guardian RLSI 로 확장되는 문법이 된다.
- **첫 뷰포트에 카드 0 · 라운드 0 · 하이라인만.** 첫 화면은 한 장의 판이고 프레임 튜플은 앱 전체 1종(불투명 채움 + 1px 하이라인), 반경은 보드 0 / 폴드 아래 패널 8 두 값. 카드 5종·반경 116종·그라디언트 17~52개/화면(1-B)인 현행과 정반대. LSEG Halo 3단 표면(#0D0D0D/#1A1A1A/#262626)·Bloomberg «단색 기본 + 의미색만»의 모바일 번역.

**정밀층 규칙.**
1. 크기: 판정 22px/700 · 값 14px/600 · 종목 13px/600 · 변화 13px/700 · 근거 문장 숫자 13px/700 · 상태·시계·뉴스 시각 12px · 뉴스 13px · 눈썹(열머리·그룹행·매크로 라벨·배지) 11px/600 자간 0.06em · 11px 미만 0건 · 매크로 셀 라벨은 1단어라 줄바꿈 0(«GAMMA FLIP»류 2줄 결함 구조적으로 소멸).
2. 대비: 텍스트 3단(주 #f8fafc / 보조·라벨은 #94a3b8 를 한 단 밝혀 패널 위 ≥7:1) · 방향 2색도 텍스트로 쓰이므로 ≥7:1(상승 #10b981 유지, 하락 #ef4444 → 밝기 상향 1값) · 시안 1값 ≥7:1 · 하이라인은 정보 운반자가 아니며(1.1~1.9:1) 행 구분은 행 간격 ≥0.5×글자높이(36pt 행에 14px 글자)로 보장(기준 #1 «경계 <3:1 이면 행 간격» 조항). 마감 행 감광은 알파가 아니라 **≥7:1 보조잉크 토큰**.
3. tabular: 모든 숫자 `tabular-nums lining-nums`, 우측 정렬, 고정 슬롯(값 8·변화 7·상태 5자) · 소수 고정(지수 ≥10,000 정수 / 그 외 2 · 변화 2 · 매크로는 기존 `fmtMacroValue`) · ko/ja 폴백(Pretendard/Noto)이 tnum 을 실제 노출하는지 글리프 전진폭 실측을 출하 게이트로 · 프로즈엔 tnum 금지.
4. 부호: +/− 단일 운반자(U+2212 1종), ▲▼ 폐기 · 반올림 후 부호 → −0.004 는 «0.00%» 무부호·중립 · `fmtChg`/`pulseChg` 두 경로를 유틸 1개로 통합(`:146-149`, `:1284`).
5. 기준 시각·상태 열: 데스크 바 시계는 `marketStatus.serverTime`(ET + 기기 시간대, Intl DST 자동) — **«현재 HH:MM»으로 라벨**(화면 수치의 기준이 아니라 시계임을 명시; 심사 수정). 상태 열은 행별 `marketTime` 이 **있을 때만** HH:MM, 없으면 세션 토큰 — `index-close` 의 `updatedAt` 은 캐시 갱신 시각이라 쓰지 않는다(원안의 «필드 없음» 오진을 «갱신 시각이라 부적합»으로 정정; 결론 동일). 시각을 합성하지 않음. ◉ 는 세션 활성 AND 신선 둘 다일 때만, 하나라도 깨지면 시각은 남고 시안만 꺼진다. 뉴스는 ageMinutes(24h 초과 시 절대 일자). 브리핑은 시각 필드 부재 → 표기하지 않음.
6. 세션 어휘: 상태→표기 1:1 토큰 6개 {실시간·프리마켓·정규장·애프터마켓·장마감·휴장}(en LIVE·PRE·REG·POST·CLOSED·HOLIDAY, ja 대응 1종) — 그룹행 3·탭 어디서나 같은 단어. FUTURES LIVE / VIX LIVE / CLOSED / ● CLOSED / MARKET CLOSED(0-5 #13) 변형 전부 폐기. 그룹행 토큰은 `marketSession`·`futuresLive`·`equityExtendedLive`·`volatilityLive`(`:844-845,:869`)에서만 파생.
7. 상태 열 어휘: «◉ HH:MM»(라이브·신선) / «HH:MM»(시각 있음·비라이브) / «마감·휴장»(시각 필드 없음). 한 열에 시각과 토큰이 섞이는 부담은 인정하되 열머리를 «상태 ET»로 두어 «값의 상태»라는 하나의 의미로 묶는다.
8. 타깃: ⚙ 44×44(`dash.module.css:58-70` !important 제거) · 탭 5 · 토글 세그 · 잠금 CTA 전부 ≥44pt · 표 행은 비인터랙티브 36pt(인터랙티브로 바꾸는 순간 44).
9. 말줄임: 종목 열 140pt 에 전체명(NASDAQ 100 F / RUSSELL 2000 F / S&P 500 F) — `sym` 을 표시명 표로 매핑, «…» 0건(`dash_default-top_17e` 결함 소멸); 뉴스 헤드라인 1줄만 예외.
10. 스파크라인: 첫 화면·무버·섹터 전부 열 자체를 두지 않음 — «가짜 선 0».
11. 빈값·준비 상태: 값 없음 = «—» + 회색(Kalshi) · 스켈레톤은 같은 표 같은 슬롯에 «—» + 숫자·시각 자리 선출력(로케일 무관) → 데이터 도착 시 레이아웃 이동 0 · 부팅 URL `/en` 은 셸(공통 전제).
12. 색 예산: 무채 3단 + 시안 1 + 상승 1 + 하락 1 = hue 3 · amber/violet/purple 0 · 그라디언트 0 · 글로우는 ◉ 1종(6pt, 정적) · 콘텐츠층 backdrop-filter 0 · 프레임 튜플 1 · 반경 {0, 8} · 리터럴 금지 린트로 고정. 리스크 자의 3구간 틴트는 방향 2색의 알파 변형(«알파 변형만 허용» 조항 안).
13. 광고 선반: 하이라인 + 60pt 예약 슬롯, 스크롤 컨테이너 padding-bottom = 선반 + 탭바 + safe-area(겹침 0px) · 첫 실측 수치 렌더 후 show · «미채움 시 접힘 → 채움 시 밀림» 레이아웃 점프는 세션 내 첫 1회만 허용, 이후 고정 · 동의·약관 화면 광고 0.
14. 동작: 뉴스 5초 회전·liveBlink·macroLiveBlink 폐기 · 틱 플래시는 실제 marketTime 변경에만 · reduced-motion 시 글로우 정적.

**실측 결함 → 이 안의 처리.**

| 결함 (캡처) | 처리 |
|---|---|
| 라벨 줄바꿈(0-5 #6) | 첫 화면 3열 카드 0 → 표; 매크로 셀 라벨 1단어 |
| 말줄임 «NASDAQ10…»(`dash_default-top_17e`) | 종목 열 140pt 전체명 |
| «▼ −0.00%» 적색 | 반올림 후 부호 → «0.00%» 무부호 중립 |
| 이중 부호 | +/− 만, U+2212 |
| DEMO 스파크라인(4-1-1) | 첫 화면·무버·섹터 열 자체 없음 |
| 기준 시각 0개(4-1-9) | 행별 상태 열(실측 marketTime 만) + 그룹행 세션 토큰 + 데스크 바 «현재» 시계 |
| 영어 라벨 ≈20/뷰포트 | 열머리·그룹행·판정 전부 UI 언어, 탭바(공통) → 0 |
| 광고 덮음(`firstrun_ZOOM-ad-over-content_17e`) | 예약 선반 + 컨테이너 클립 + 첫 수치 뒤 show |
| 30px 기어 | 44×44 |
| 영어 스켈레톤 8초·헤더 겹침(`dash_relaunch-clean-8s_17e`) | 같은 표 «—» 스켈레톤 + safe-area 데스크 바 / 부팅 URL 은 셸 |
| FUTURES LIVE 2회 | 그룹행 1표기 |
| SPY 가격 둘(4-1-9, `dash_default-mid_17e` vs `top`) | 두 값 모두 상태 열 시각을 달아 «시각 차»로 읽히게(소스 통일은 범위 밖) |

**사용 데이터 (전부 기존).** `riskTone`·`riskScore`·`futuresTone/Avg`·`cashTone/Avg` `:846-858` · `useMarketStatus` → session·isHoliday·serverTime·asOfET(`src/hooks/useMarketStatus.ts:18-30`) · `futuresLive`·`equityExtendedLive`·`volatilityLive` `:844-845,:869` · 선물 3 `sym/px/chg + marketTime/updatedAt/marketAgeSec/feedSource/isStale`(`feedMetaForItem` `:266-282`, `:1279-1294`) · 현물 3(`buildIndexItems` `:105-111` ← `/api/market/index-close`) · ETF/VIX 3(`:1498-1518`, VIX `marketTime`) · 매크로 8(`:1315-1413`) · newsItems(category·urgency·summary·ageMinutes `:1657-1686`) · movers(sym·px·chg + 토글) · sectors 8 + `sectorSessionLabel` · briefing 3종 · institutionalSignals 4 + gateCopy · 설정 라우트 `:1641` · AdMob 배너(위치·인셋·show 시점). **새 API·새 필드·새 계산 0.**

**이 안이 바꾸는 사용자 행동.** 22:30 KST 사용자가 스크롤·확대·재응시 없이 한 번의 시선 이동(판정 행 → 변화 열 → 상태 열)으로 «어느 쪽으로, 무엇이 지금 값인지»를 확정하고, Guardian 리스크 스트립으로 넘어가 같은 숫자를 다시 확인하는 2번째 탭을 하지 않는다. 07:00 KST 진입자는 «마감» 토큰 6개와 «◉ HH:MM» 선물 3행이 한 표에 있어 어젯밤 마감값과 지금 움직이는 값을 헷갈리지 않는다.

**트레이드오프.**
- 스파크라인 제거 → «움직임의 느낌» 손실. 대가로 S&P500 F ≡ S&P 500 같은 DEMO 선(4-1-1) 0.
- 카드 → 표: 40대 이상 리테일에게 «엑셀·터미널» 인상. 완화 = 22px 판정 행 + 자(접목)가 위계 1위, 36pt 행, 그룹행 3, 폴드 아래는 패널 유지. 판정 크기는 안 A 의 40px 보다 작다 — 이 안은 «문장»이 아니라 «격자»가 서명이므로 감수.
- 시안을 활성 탭·배지·CTA 에서 회수: 워드마크는 예외(공통 전제)라 스토어·OG·스플래시 재촬영은 발생하지 않는다.
- amber 제거: ValueWall 주황 CTA → 흰 무채 버튼, 보상형 광고 전환율 하락 위험(실측 없음). A/B 로 확인.
- 매크로를 폴드 아래로 내려 원안의 «한 판에 매크로까지» 밀도를 포기 — 대신 what:so-what 17:1 → ≤10:1, 전문어 ≥5 → ≤2 (기준 #5·#7 합격선).
- 상태 열에 시각/토큰 두 어휘가 섞인다 — 규칙으로 통제하되 부담은 남는다.
- 세션 어휘·Risk-On 을 UI 언어로: 「LIVE」「Risk-On」에 익숙한 기존 사용자에게 1회 적응 비용.
- 원안의 불투명 탭바·콘텐츠 명사 탭 라벨 중 **불투명은 기각**(기준 #9 «탭바 비침 ΔL≥2»·2-4 «glass 는 셸에만» 위반), 라벨은 채택(공통 전제).

**실패 가능성.**
- 표 밀도가 «숫자 벽»으로 읽혀 체류·스크롤 깊이가 떨어진다 — 텔레메트리가 없어 스토어 리뷰·기준 #8 블러 패널로만 관측.
- 기준 #7 장식 면적 8% 하한 미달 가능(원안 스스로 인정) — 자(접목)가 더해졌어도 픽셀 면적으로는 작다. #8 적중 ≤2/5 면 값 열 배경 +1단(원안의 폴백)으로 «숫자 척추»를 강화한다.
- 블러 패널에서 Kalshi Pro·LSEG 모바일과 구별 실패 가능(렌즈 2 의 핵심 지적) — «시안 점 + 색 단어 + 가로 띠»의 3요소가 그 둘에 없다는 것이 방어이며, 실측 전엔 [추정].
- ko/ja 폴백 폰트가 tnum 을 노출하지 않으면 «숫자 척추»가 무너진다 → 글리프 전진폭 실측을 출하 게이트로.
- 신선도 게이트를 구현에서 빠뜨리면 멈춘 시각 옆에 ◉ 가 남아 서명이 거짓말을 한다 — 게이트를 상태 열 컴포넌트 안에 두고 스탬프는 데이터 필드에서만 계산.
- 하락 적색을 7:1 로 밝히면 «분홍»으로 읽혀 방향 인지가 약해질 수 있음 → 토큰 1값을 실기기·고조도에서 확정(2.5 의무 ⑥).
- 세션 토큰 파생 로직(VIX 라이브·휴장·프리/애프터)이 어긋나면 «마감» 옆에 ◉ 같은 모순이 노출 — 현행보다 «보이는» 오류라 발견은 빠르다.
- 광고 «접힘 → 열림» 1회 점프를 사용자가 «불안정»으로 읽을 수 있음.

**되돌리는 비용 · 비용.** 되돌림 **낮음** — 변경이 `app-view/dash` 의 JSX 구조·CSS 모듈·포맷 유틸·토큰이라 리버트 1커밋 + Vercel 1배포, 심사 불필요. 데이터·API·캐시 키·응답 형태 무변경. 토큰 수렴·부호 유틸·세션 어휘 맵·광고 인셋은 2.5 «단일 다크의 의무» 이행분이라 어느 안에서도 그대로 쓰인다(매몰 0). **비용 중** — 표 컴포넌트 1 + 상태 열 게이트 + 판정 행/자 + 포맷 유틸 통합 + 세션 어휘 맵 3로케일 + 탭바 문자열(공통). 안 A 보다 조금 무겁다(상태 열의 3분기 + 열 격자 정렬 검증).

**차용한 레퍼런스.** LSEG Workspace / Halo(3단 무채 표면·순백 아닌 본문·12px 기본체·의미색 지역 프로파일 토큰) · Kalshi Pro(대시 아니면 지어내지 않음, 행 내 Live 플래그 열, 좁은 폭에서 덜 중요한 열 접힘 = 매크로 하향의 근거) · NTS Radio(live 에만 한 색, 타임스탬프를 1급 열로, 아웃라인 활자 태그) · Windy(출처·시각 인쇄, 신선하지 않은 값이 신선한 값과 같은 확신으로 보이지 않게 = ◉ 게이트) · Gentler Streak(판정 우선 0행, 비교 기준 «3지수 평균») · Tide Guide(상태 우선 히어로를 표의 첫 행으로 흡수) · Sofascore(잠긴 시맨틱 색 척도, 실시간 행 풀잉크 / 마감 행 감광) · Robinhood Market hours(«배경이 세션을 말한다» → 상태 열 톤·그룹행 토큰) · Bloomberg(단색 기본 + 의미색만) · Unusual Whales / Fiscal.ai(신선도를 UI 상태로) · Apple HIG Materials / WWDC25(콘텐츠층 glass 0, 위계는 그룹핑).

**접목·수정 기록.** ① 안 A 의 «문턱 인쇄된 0–100 리스크 자»를 판정 행 밑에 접목(렌즈 1 1순위 접목 — 4-1-5 «리스크 68 척도 없음» 해소, 새 데이터 0, «하이라인만·시안은 라이브 점에만» 문법 유지: 마커는 방향색, 띠는 알파) ② 세션 편성표의 숫자-우선 스켈레톤·Intl 기기 시간대 ③ 심사 지적 수정: 매크로 테이프 폴드 아래로(what:so-what·전문어 밀도) · 근거 숫자·매크로 변화 12→13px · 뉴스 5초 회전 삭제 · 데스크 바 «기준»→«현재» · «index-close 시각 필드 없음» 오진을 «갱신 시각이라 부적합»으로 정정 · 불투명 탭바 기각(기준 #9) · 워드마크 시안 회수 철회(공통 전제).

---

#### 두 안의 공통 전제 (어느 안을 택해도 먼저 또는 함께 해야 하는 것)

1. **토큰 수렴(2.5 의무 ①②③)이 선행.** 915 리터럴 → ~40 다크 토큰, 앱 표면 색 리터럴 0 을 CI 린트로(fail-closed). 두 안이 요구하는 «≥7:1 텍스트 적 토큰 1값»·«보조잉크 ≥7:1»·«카드 불투명 near-black 1종·backdrop-filter 0»은 첫 화면만 고치면 Guardian·Flow(`flow_default-mid_17e` #ef4444 708 + #f43f5e 542 공존)와 즉시 불일치하므로, 토큰이 먼저 바뀌고 첫 화면이 그것을 «처음 쓰는 화면»이 된다.
2. **광고 선반.** AdMob 배너를 오버레이(`layout.tsx:214 <AppAnchorAd/>`, `adManager.ts:312-324 showBanner margin`)에서 «불투명 다크 60pt 예약 슬롯»으로: 스크롤 컨테이너 하단 = 선반 상단(클립), 로드 전에도 높이 고정, `wantBanner`(`adManager.ts:177`)에 «첫 실측 수치 렌더 후» 조건 1개, 온보딩·약관 화면 억제(`firstrun_04-terms-page-ad-overlay_17e`). 흰 슬래브 자체는 남는다(2.5 실패 4) — 어느 안도 이것을 «해결»이라 쓰지 않는다.
3. **기준 시각 규칙 1종.** 인쇄 가능한 시각 = `marketTime`(선물·VIX·매크로 live 셀)뿐. `updatedAt`(캐시 갱신)·`serverTime`(현재 시각)·세션 경계 상수는 «기준»으로 인쇄 금지. 표기 «MM/DD HH:MM ET · HH:MM {기기 시간대}»(Intl, DST 자동, tz==America/New_York 이면 단일). 없으면 세션어 또는 «—».
4. **세션 어휘 1종/로케일 + 라이브 표기 1종.** `copy.ko` 의 영어 값(`:635-638`) 교체, 0-5 #13 의 CLOSED 4변형·FUTURES LIVE/VIX LIVE/LIVE 폐기 → 5탭 헤더가 같은 사전을 쓴다(5단계 과제).
5. **◉ 게이트 = 세션 활성 AND 신선.** `feedMetaForItem` 의 `live`(`:274`)를 표시 판정의 단일 소스로. 이것이 «한 색만 살아 있게»를 정직성에 묶는다.
6. **시안의 자리.** 첫 뷰포트에서 시안 = ◉ 뿐. **워드마크 «HQ» 시안은 로고로 유지** — 기준 #1(로고 채점 제외)·#8(블러 패널은 브랜드 문자·로고를 마스킹)에서 측정 대상이 아니고, 회수하면 스토어 3로케일·OG 3라우트·스플래시 재촬영(2.5 근거 6)이 따라오기 때문. 탭바 활성색은 `AppBottomNav.tsx:15` `var(--cyan)` → 주 잉크(웹 컴포넌트 1줄).
7. **탭바 라벨 = 콘텐츠 명사, 3로케일.** `AppBottomNav.tsx:6-12` 의 하드코딩 영어 `label` 5개는 웹 컴포넌트 문자열이라 네이티브 빌드·심사 불필요(원안 A 의 «셸 이슈 이관»은 오진). ko 대시보드 / 리스크 / 종목 / 옵션 플로우 / 섹터(«플로우» 단독은 전문어라 «옵션 플로우»), en Dashboard / Risk / Ticker / Options Flow / Sectors, ja 相場 / リスク / 銘柄 / オプションフロー / セクター. 은유명(Guardian·Command·Intel)은 각 탭 헤더의 눈썹으로 강등(4-1-6 ①). 플로팅 아일랜드·반투명은 유지(기준 #9).
8. **부호·영값 유틸 1개.** `fmtChg`/`pulseChg`/`up` 판정을 «반올림 후 부호» 유틸로 통합, U+2212, ▲▼ 0, «−0.00%» 0 — Guardian 스트립(`guardian_ZOOM-risk-strip_17e`)도 같은 유틸.
9. **스파크라인 0 원칙.** DEMO 배열·`getSpark` 상수를 쓰는 모든 `<Sparkline>` 제거. 실측 히스토리가 붙을 때만 복귀(데이터 작업 = 범위 밖 관찰).
10. **스켈레톤·부팅.** 최종 레이아웃과 같은 슬롯, 숫자·시각 자리부터(로케일 무관) — 웹 방어. 영어 8초의 뿌리인 부팅 URL `/en`(`capacitor.config.ts:20`)은 **셸 빌드**라 별도 배포·별도 롤백으로 분리 표기(두 안 모두 «영어 스켈레톤 0»을 웹 배포만으로 주장하지 않는다).
11. **safe-area 헤더.** `env(safe-area-inset-top)` 적용으로 재실행 스켈레톤이 «9:41» 위에 겹치는 결함(`dash_relaunch-clean-8s_17e`) 제거.
12. **검증 게이트(2.5 의무 ⑥ + 3단계).** 실기기·고조도·07:00 KST·22:30 KST(라이브 세션 캡처 — 현재 0장, 0-3)·17e/Pro Max·Dynamic Type +2단(0-5 #17: 현 앱은 AX 크기 반응 0)·ko/ja tnum 글리프 실측·σ2% 블러 패널 5인. 여기서 실패한 안은 출하하지 않는다.
13. **리스크 자 = 공유 자산.** 두 안이 같은 기하(풀블리드 12pt 띠 · 3구간 알파 · 마커 3×16 · 눈금 42·58)를 쓰므로, 어느 안을 택해도 이 자를 Guardian RLSI·섹터 점수·푸시 이미지·OG 에 «문턱 인쇄된 0–100 자»로 확장한다(2-4 #9; 새 데이터 0 — 이미 있는 점수의 표현만).

#### 탈락 안(세션 편성표 홈)에서 살린 것 · 자른 것

**살린 것**
- **이중 시계의 «사용자 시간대»를 Intl 로**(ko=KST 하드코딩이 아니라 기기 tz, DST 자동, tz==ET 이면 단일 시계) → 두 안의 시각 규칙 3.
- **감광은 알파가 아니라 토큰**(70% 알파는 7:1 을 깰 수 있다) → 안 A 근거 문장의 «말», 안 B 마감 행.
- **스켈레톤은 라벨 자리를 빈 바로, 로케일 무관 숫자·시각부터** → 두 안의 웹 배포용 영어 스켈레톤 방어.
- **스크롤 컨테이너 하단 = 광고 상단(클립)** → 공통 전제 2.
- **글로우는 «지금»에만 1개** → 두 안의 ◉ 글로우(4-1-C «확장하되 없애지 말 것»과 일치).
- **편성표 눈썹** — 레일이 말하려던 «세션 · 경계 시각 · 두 시계»를 안 A 의 텍스트 눈썹(«장마감 · 선물 실시간 · 기준 … ET · … KST»)이 그대로 인쇄한다. 그래픽 레일은 상태 API 가 조기 폐장 달력을 주게 되면(현재 `marketStatusProvider` 는 사후 감지만) Guardian 헤더 후보로 5단계에서 재검.
- **레이아웃 불변·잉크만 바뀐다**(NTS: 편성표는 불변, 내용만 새롭다) → 안 B 의 «22:30 KST 는 세 행 전부 색, 07:00 KST 는 선물 행만 색».

**자른 것과 이유**
- **카운트다운 «3h 56m» / «다음 · 프리마켓 04:00 ET»** — 현재 데이터 세트에 없는 새 계산값(기능 추가) + 조기 폐장·임시 휴장에서 틀린 숫자 인쇄(제안자 인정). 하드 제약 위반.
- **시간 비례 세션 레일 + 커서** — 커서 위치가 기기 시계·세션 상수 산술이라 같은 결함을 공유하고, 74pt 로 시각 8개만 담아 정보 밀도가 준다.
- **«마감값 9/3 16:00 ET» 파생 스탬프** — 세션 경계에서 합성한 시각을 실측 시각과 같은 슬롯·서체로 인쇄. Kalshi 규칙 위반. 두 안은 세션어만 인쇄.
- **«F» 접미 삭제** — «S&P 500» 동일 라벨이 선물·현물 두 행에 병존. 두 안은 «S&P 500 F» 유지.
- **변화율·리스크 점수 12px** — 값 ≥13pt 미달.
- **마감 행 방향색 제거** — 07:00 KST 리포트 진입자가 가장 먼저 보는 현물 마감 방향이 사라진다. 두 안은 부호+방향색 유지.

#### 심사 점수표 (3 렌즈 × 3 안)

| 렌즈 | A 판정 수평선 | B 데스크 그리드 | C 세션 편성표 | 렌즈의 결정적 사실 |
|---|---|---|---|---|
| 정밀층 판독성·정직성 (#1·#2·#4) | 7 | **8** | 4 (규칙 위반 상한) | B 만 «세션 활성 AND 신선» 게이트·유틸 통합·getSpark 상수 함정 회피; A 는 무버 스파크 위임·updatedAt 을 기준 시각으로·눈썹 16:00≠21:14 자기모순(전부 접목·수정으로 해소); C 는 카운트다운·파생 스탬프가 합성값 |
| 표현층 과감함·식별성 (#7·#8·#9) | 7 | 4 | **8** | C 만 «구조»가 새롭고 상태 무관 고정 형태(4-1-10 해소); A 는 «큰 문장 + 조용한 활자 + 표»가 2025-26 관용구, 4pt 트랙 블러 소멸(→12pt 띠로 수정); B 는 블러 시 «제네릭 다크 터미널», 불투명 탭바가 #9 위반(→기각) |
| 기능 전달·실행 비용 (#3·#5·#6 + 3초 «무엇을 해주는 앱») | **8** | 6 | 4 (규칙 위반 상한) | A 만 3초에 «시장이 위험을 사는지 판정해 주는 앱»으로 읽힘, 되돌림 최저; B 는 what 36개·전문어 ≥5(→매크로 하향으로 해소), 시안 회수의 자산 재촬영 비용(→워드마크 유지로 해소); C 는 신규 클라이언트 로직·엣지 케이스 최다, 3초 인상이 «편성표·시계 앱» |
| **합계 (30)** | **22** | **18** | 16 | — |
| 하드 제약 | 경미 3 → 전부 수정 | 경미 2 + 셸 범위 → 수정 | **기능 추가 1 · 합성값 2 → 탈락** | 표현층 8 은 하드 제약 실격을 넘지 못한다 |
| 접목 후 | 리스크 자 12pt 띠 · ◉ 신선도 게이트 · 탭바 명사 · Intl 시계 · 숫자-우선 스켈레톤 | 리스크 자 접목 · 매크로 하향 · 13px · 회전 삭제 · 탭바 반투명 유지 | 눈썹·Intl·토큰 감광·스켈레톤·클립·글로우 1개를 두 안에 이식 | **재채점하지 않음** — 점수는 공통 전제 12 의 실화면 캡처로만 오른다 |

**디렉터 권고 순위.** 1순위 **안 A(판정 수평선)** — 세 렌즈 합계 최고, 하드 제약 위반 0, 4-1-C 첫 항목(판정 최상단 위계)을 가장 강하게 지키며 되돌림 최저. 2순위 **안 B(데스크 그리드 + 판정 자)** — 정밀층 최강이지만 표현층 식별은 블러 패널 실측 전엔 [추정]이고, 패널이 «표 = 다운그레이드»를 어떻게 받는지가 관건. 두 안은 상단 히어로(문장 vs 0행)만 다르고 표·자·눈썹·게이트·광고 선반·탭바를 공유하므로, 승인 시 **공통 전제 1~11 을 먼저 구현하고 히어로만 플래그로 A/B 실화면 캡처**(17e·Pro Max × 22:30 KST 라이브 / 07:00 KST 마감 × 블러)를 만든 뒤 최종 선택을 대표에게 올린다.
---

## 5단계 — 전체 화면 감사

> **방법.** 4단계와 같은 절차를 5화면(Guardian · Command · Flow · Intel · 셸)에 적용했다. 단 5단계 착수 시점에 병렬 발굴 워크플로가 모델 사용 한도로 전부 실패해, **이 절은 디렉터가 캡처와 소스를 직접 열어 작성**했다(에이전트 발굴 없음). 그래서 4단계보다 건수가 적고, 대신 **모든 지적을 캡처와 `파일:라인` 양쪽에서 확인**했다. 6개 차원(기능 전달력 / 신뢰도 / 데이터 판독성 / 개성 / 판단 흐름 / 기본기)을 화면마다 훑되, 4단계에서 이미 다룬 «전 화면 공통» 결함은 5-6 에 한 번만 쓰고 화면별로 반복하지 않는다.

### 5-1. Guardian (매크로 리스크)

**5-1-1. 한국어 화면의 잠금 카드 면책이 영어다 — 원인은 `locale` 프롭 하나 — [정밀층] [확실] · 신뢰도 · 심각도 높음 · 비용 소 · 기준 #5**
- **관측:** 방어 지표 탭의 «감마 방어 엔진 잠금해제» 카드 하단 면책이 «Educational market-data research only. Not investment advice or a buy/sell recommendation…» 영문이다(`guardian_tab-defense_promax`). 같은 컴포넌트가 대시보드에서는 한국어로 나온다(«교육 및 리서치용 시장 데이터입니다…», `dash_default-bottom_promax`). 원인: `ValueWall` 은 `resolveValueWallLocale(locale)` 로 카피를 고르고 **ko/ja 가 아니면 en 으로 떨어진다**(`components/app/ValueWall.tsx:104-107`, 영어 카피 `:69`, 한국어 `:48`). 호출부 8곳 중 dash `:2140`·cmd `:3549/:3700/:3961`·flow `:3378/:3761/:4078` 은 `locale` 을 넘기고, **Guardian 만 안 넘긴다**(`components/guardian/mobile/MobileGuardianShield.tsx:568-582` — props 는 compact·title·subtitle·teaser·ctaLabel·adFreeLabel·previewChipLabel·socialProof·lockedPreview 뿐). 같은 카드의 제목·CTA·«오늘 14.2K 잠금해제»는 한국어인데 법적 문구만 영어라, 화면에서는 «번역이 덜 된 곳»이 아니라 «법적 문구만 남의 것»으로 읽힌다.
- **바꾸는 사용자 행동:** 면책이 한국어가 되면 → 한국 사용자가 잠금 카드를 «영문 약관이 붙은 외국 서비스»가 아니라 «내 언어로 고지하는 서비스»로 읽고 → 광고 시청 CTA 앞에서 멈칫하는 이유가 하나 줄어든다.
- **개선 방향 ①** 호출부에 `locale={localeKey}` 한 줄 추가 — 트레이드오프: 없음(순수 버그). ／ **개선 방향 ②** **[과감]** `resolveValueWallLocale` 의 폴백을 en 이 아니라 «폴백 금지»로 바꾼다 — locale 이 없으면 개발 빌드에서 던지고 프로덕션에선 `document.documentElement.lang` 을 읽는다. 같은 «조용한 영어 폴백»이 AI 요약에서도 반복됐으므로(메모리 `ai-localization-silent-english-fallback`) 유형을 끊는다 — 트레이드오프: 전역 폴백 변경은 다른 호출부의 회귀를 부를 수 있어 8곳 전수 확인이 선행돼야 한다 · 실패 가능성: `lang` 이 부팅 셸의 `/en` 을 반영하는 순간이 있어(4-4-2) 초기 렌더에서 여전히 영어일 수 있다 · 되돌리는 비용: 소.
- **출처:** 3단계 #5 «권한·법적 문구 100% UI 언어» · 메모리 `ai-localization-silent-english-fallback`.

**5-1-2. RLSI 가 한 화면에 두 번, 구성 요소 5개는 척도가 없고 하나는 100 에 붙어 있다 — [정밀층] [확실] · 데이터 판독성 · 심각도 중간 · 비용 중 · 기준 #4·#9**
- **관측:** 헤더 우측 «RLSI 39» 필(`guardian/page.tsx:409`)과 GRAVITY GAUGE 안 대형 «39»(`MobileGuardianOverview.tsx:135`)가 같은 값을 두 번 말한다(`guardian_default-top-recheck_promax`; 다른 시점 캡처는 38/38, `guardian_tab-defense_promax`). 게이지 아래 분해 5행은 «모멘텀 64 양호 · 참여도 80 매우 강함 · 가격 추세 **100 매우 강함** · 순환 강도 4 취약 · 시장 심리 35 주의 필요» — 다섯 값 모두 척도(0–100 인지, 높을수록 좋은지)가 인쇄돼 있지 않고 하나는 상한에 붙어 있다. 그 아래 «강세 ×3 약세 ×2» 가 다섯 개를 이분해 요약한다. 만점에 붙은 값이 아무 말도 못 한다는 것은 이 저장소가 이미 겪은 유형이다(메모리 `saturated-score-says-nothing`).
- **바꾸는 사용자 행동:** 헤더 필을 «RLSI 39/100 · 심리 약세»로 만들고 게이지 안 숫자를 지우면 → 스크롤해도 남는 헤더 하나만 보고 판정을 읽게 되고 → 같은 숫자를 두 번 확인하려고 위아래로 오가지 않는다.
- **개선 방향 ①** 헤더 필에 척도(«/100»)와 구간명을 붙이고 게이지 중앙 숫자는 제거, 분해 5행에 얇은 0–100 트랙 + 자기이력 백분위 — 트레이드오프: 게이지의 시각적 무게가 줄어 «대표 지표»라는 인상이 약해진다. ／ **개선 방향 ②** **[과감]** 반원 게이지를 4-5 안 A 의 «판정 자»(풀블리드 0–100 띠 + 문턱 인쇄)로 교체해 대시보드·Guardian·섹터 점수가 **같은 자**를 쓰게 한다 — 트레이드오프: ECharts 게이지 제거로 Guardian 의 시각적 개성 하나가 사라진다(대신 5탭 공통 서명이 생긴다) · 실패 가능성: 판정 문턱이 공개되면 «왜 39 인가»를 묻는 문의가 늘고 공식이 자기이력 백분위라 설명이 길어진다 · 되돌리는 비용: 중.
- **출처:** 2-4 «점수형 지표는 고정 0–100 바» · Gentler Streak 기준 명시 pill(2-2 ②) · 메모리 `saturated-score-says-nothing`.

**5-1-3. 리스크 스트립 라벨이 라이브 도트와 겹치고, 보합이 적색으로 나온다 — [정밀층] [확실] · 기본기 · 심각도 중간 · 비용 소 · 기준 #2·#4**
- **관측:** «NASDAQ 100» 라벨 끝과 우측 라이브 도트가 붙어 렌더된다(`guardian_ZOOM-risk-strip_17e` — 17e 폭에서 라벨 마지막 글자와 도트 사이 여백 0). 같은 확대 캡처에서 «S&P 500 F **−0.00%**» 가 적색이고 그 아래 값 «7,755» 도 적색이다(다른 시점 캡처 `guardian_default-top-recheck_promax` 에서는 «+0.02%» 녹색). 4-0-2 의 부호 결함이 Guardian 에서도 같은 모양으로 반복된다 — 화면별 버그가 아니라 **공용 포맷 유틸이 없다는 뜻**이다.
- **바꾸는 사용자 행동:** 라벨이 도트와 8pt 이상 떨어지고 반올림 0 이 중립색이 되면 → 어두운 방에서 스트립 4장을 훑을 때 «적색 = 내린 것»으로만 세게 되고 → 보합을 하락으로 잘못 세는 일이 없어진다.
- **개선 방향 ①** 카드 헤더를 «라벨 / 도트» 2열 그리드로 고정(도트 폭 예약) + 부호·색 판정을 표시값 기준 공용 유틸 하나로 — 트레이드오프: 긴 라벨(«NASDAQ 100»)은 도트 폭만큼 더 줄어 약어(NDX)가 필요하다. ／ **개선 방향 ②** 도트를 카드 밖 그룹 눈썹으로 올리고 카드에서 제거 — 트레이드오프: 카드별 라이브 여부가 다를 때 표현할 자리가 없어진다(현재 4장은 항상 같은 세션이라 문제 없으나 VIX 세션이 갈리는 경우는 [미확인]).
- **출처:** 3단계 #2(겹침 0) · #4(부호 규칙 1종).

**5-1-4. Guardian 만 가진 HUD 장식이 첫 화면에는 없다 — 개성이 한 탭에 갇혔다 — [표현층] [확실] · 개성 · 심각도 중간 · 비용 중 · 기준 #8·#9**
- **관측:** GRAVITY GAUGE 카드에만 코너 브래킷·스캔라인·격자 오버레이가 있다(`guardian_default-top-recheck_promax`; 코드 `MobileGuardianOverview.tsx:135-166` 의 절대배치 브래킷 4개 + `bg-[url('/scanline.png')] opacity-5`). 다른 4탭에는 없고(1-A-3 카드 프레임 5종), 대시보드 첫 화면에도 없다(4-1-10: 블러 후 남는 것은 상태 의존적인 «신호등 격자»뿐). 이 앱에서 가장 서명에 가까운 시각 장치가 **5탭 중 1탭의 1카드**에만 있다.
- **바꾸는 사용자 행동:** 브래킷 문법이 5탭의 «판정 카드»에 일관되게 붙으면 → 사용자가 탭을 옮겨도 «판정은 브래킷 안에 있다»는 규칙을 학습하고 → 새 화면에서 먼저 볼 곳을 찾는 시간이 줄어든다.
- **개선 방향 ①** 브래킷을 «판정을 담는 카드»의 전용 문법으로 승격해 대시보드 판정 히어로·Command 다크풀 카드·Intel 섹터 히어로에 같은 규격으로 적용 — 트레이드오프: 남용하면 장식이 되어 오히려 위계가 사라진다(적용 대상을 화면당 1개로 못박아야 함). ／ **개선 방향 ②** **[과감]** 반대로 브래킷·스캔라인을 전부 제거하고 4-5 의 «판정 자 + 편성표 눈썹»을 유일 서명으로 삼는다 — 트레이드오프: Guardian 의 «전술 HUD» 톤이 사라져 이 탭을 좋아하던 사용자에게는 다운그레이드로 읽힌다 · 실패 가능성: 장식을 걷어낸 뒤 남는 것이 «제네릭 다크»면 식별성이 0 이 된다(블러 패널로 먼저 검증) · 되돌리는 비용: 소.
- **출처:** Ehrenberg-Bass 고유 자산(fame×uniqueness) · 3단계 #8·#9.

**이 화면에서 바꾸지 말아야 할 것**
- **신용 스프레드 행** «신용 스프레드 ⓘ 2.66% · 20D −0.09 · [위험 선호] · 1년 백분위 4 / 채권시장은 위험을 낮게 봄»(`guardian_ZOOM-risk-strip_17e`) — 값·변화·판정·백분위·평문 해석이 **한 줄에 다 있는 앱 안의 유일한 사례**다. 유지 조건: 백분위의 기준 창(1년)을 계속 인쇄할 것, 평문 문장을 값과 다른 소스에서 만들지 말 것.
- **탭 4개의 아이콘+한국어 라벨**(AI 요약 / 시장 현황 / 방어 지표 / 기관 플로우) — 앱에서 유일하게 **콘텐츠 명사로 된 내비게이션**이다(하단 탭바는 전부 영어 은유형, 4-3-2). 유지 조건: 5탭 탭바를 고칠 때 이 어휘를 정본으로 삼을 것.

### 5-2. Command (종목 상세)

**5-2-1. 같은 종목·같은 지표인데 화면마다 상태 어휘와 임계가 다르다 — [정밀층] [확실] · 신뢰도 · 심각도 높음 · 비용 소 · 기준 #4·#9**
- **관측:** NVDA RSI 가 Command 에서 «49.3 **Stable**»(`cmd_default-top_promax`), Flow 에서 «52.3 **Neutral**»(`flow_tab-whale_promax`)로 나온다. 값 차이는 캡처 시각차(22:14 ET vs 00:04 ET)로 설명되지만 **어휘와 임계가 다르다**: cmd 는 `Hot ≥70 / Warm ≥55 / Cool ≤35 / else Stable`(`cmd/page.tsx:3301`), flow 는 `Hot ≥70 / Warm ≥60 / Oversold ≤30 / Cool ≤40 / else Neutral`(`flow/page.tsx:2461`). 같은 RSI 57 이 한 화면에서는 «Warm», 다른 화면에서는 «Neutral» 이 된다. 두 화면은 히어로 모듈까지 공유하므로 사용자에게는 «같은 카드»로 보인다.
- **바꾸는 사용자 행동:** 임계·어휘가 한 벌로 통일되면 → 사용자가 Command 에서 본 «Warm» 을 Flow 에서 그대로 신뢰하고 → 두 화면을 오갈 때 상태 라벨을 다시 해석하지 않는다.
- **개선 방향 ①** RSI 구간·라벨을 단일 유틸로 추출해 두 화면이 같은 함수를 부르게 하고 라벨은 UI 언어로(«과열 / 강함 / 중립 / 약함 / 침체») — 트레이드오프: 기존 사용자가 익힌 영어 라벨이 바뀐다(1회 안내 필요). ／ **개선 방향 ②** 구간 라벨을 지우고 «RSI 49.3 · 60일 백분위 38%»처럼 기준을 인쇄 — 트레이드오프: 라벨 한 단어로 읽던 속도가 줄어든다.
- **출처:** NN/g Heuristic #4(일관성·표준) · 3단계 #4·#9.

**5-2-2. 같은 3타일이 Command 에는 ⓘ 가 있고 Flow 에는 없다 — [양쪽] [확실] · 기능 전달력 · 심각도 중간 · 비용 소 · 기준 #5**
- **관측:** MAX PAIN / GAMMA FLIP / TOTAL PREMIUM 세 타일이 Command 에서는 각각 ⓘ 를 달고 있고(`cmd_default-top_promax`, `cmd_tab-quant_promax`), Flow 의 같은 세 타일에는 없다(`flow_tab-whale_promax`, `flow_ZOOM-hero-tiles_17e`). RSI·VWAP 도 마찬가지다. 즉 «맥스페인이 뭔가»를 물을 수 있는지가 **어느 탭으로 들어왔는지에 달려 있다**. 용어집은 43항으로 이미 존재한다(`components/app/metricGlossary.ts`).
- **바꾸는 사용자 행동:** Flow 타일에도 같은 ⓘ 가 붙으면 → 옵션 용어를 모르는 사용자가 Flow 에서 처음 만난 «GAMMA FLIP» 을 그 자리에서 읽고 → Command 로 되돌아가 확인하는 왕복이 없어진다.
- **개선 방향 ①** 히어로 타일을 공용 컴포넌트로 올려 ⓘ 를 기본 포함 — 트레이드오프: 타일 폭이 ⓘ 만큼 줄어 17e 라벨 줄바꿈(4-0-5)이 악화되므로 라벨 약어 규칙이 선행돼야 한다. ／ **개선 방향 ②** ⓘ 를 타일마다 두지 말고 카드 헤더에 «용어 보기» 하나로 모아 시트로 — 트레이드오프: 특정 지표를 바로 묻는 동선이 한 단계 길어진다.
- **출처:** NN/g Plain Language · 3단계 #5.

**5-2-3. 세 유료 탭이 전부 잠금이고 CTA 가 탭바 뒤로 잘린다 — [표현층] [확실] · 판단 흐름 · 심각도 높음 · 비용 중 · 기준 #3·#7**
- **관측:** AI ✱ / QUANT ✱ / HOLDERS ✱ 세 탭을 누르면 세 번 다 같은 자물쇠 카드가 나오고, 카드의 주황 CTA 는 첫 화면에서 **탭바 뒤로 잘린다**(`cmd_tab-ai_promax`, `cmd_tab-quant_promax` — 자물쇠 원까지만 보이고 CTA·설명은 탭바 아래). 세그 탭은 잠금 여부를 «✱» 하나로만 표시해 누르기 전에는 무엇이 잠겼는지 알 수 없고, 잠긴 콘텐츠의 형체도 보이지 않는다.
- **바꾸는 사용자 행동:** 탭을 누르면 CTA 가 온전히 보이고 잠긴 콘텐츠 한 줄이 미리보기로 뜨면 → 사용자가 «광고를 볼지»를 한 화면에서 결정하고 → 세 탭을 차례로 눌러 «또 자물쇠»를 세 번 만나는 경험이 없어진다.
- **개선 방향 ①** 잠금 카드 진입 시 스크롤 위치를 CTA 가 보이는 곳으로 고정 + 하단 인셋 계산(탭바+배너+safe)을 정확히 — 트레이드오프: 자동 스크롤은 사용자의 스크롤 의도와 충돌할 수 있다. ／ **개선 방향 ②** **[과감]** 세 탭을 각각 잠그지 말고 **하나의 «프로 리서치» 탭**으로 합쳐 한 번만 해제하게 한다(현재도 해제 단위는 1시간 공통) — 트레이드오프: AI/QUANT/HOLDERS 의 성격이 섞여 탭 라벨이 모호해진다 · 실패 가능성: 세 탭 각각의 노출 지표가 합쳐져 어느 콘텐츠가 해제를 유발했는지 측정이 흐려진다 · 되돌리는 비용: 중.
- **출처:** 3단계 #3(CTA 가시율 100%)·#7(잠금 so-what 미리보기).

**5-2-4. 차트 위 NBBO 가 «Est.» 한 단어로 합성값임을 말한다 — [정밀층] [확실] · 신뢰도 · 심각도 중간 · 비용 소 · 기준 #4**
- **관측:** 1M 차트 상단에 «NBBO **Est.** $509.38 / Spread / $509.92»(`cmd_chart-1m_promax`)가 라이브 호가처럼 보이는 자리에 놓여 있다. 코드상 이 값은 현재가에서 스프레드를 합성한다(`cmd/page.tsx:306-315`). 표시는 8px «Est.» + opacity 0.5(1-B 1-2 표) — **합성이라는 사실이 화면에서 가장 작고 가장 흐린 글자**로 고지된다. 같은 화면의 «MARKET CLOSED · 9/3, 22:14 ET» 는 정확한데 그 옆 호가만 추정값이다.
- **바꾸는 사용자 행동:** «Est.» 가 라벨 크기로 올라오고 «추정 스프레드»로 풀려 쓰이면 → 사용자가 이 두 숫자를 체결 가능 호가로 오인하지 않고 → 스프레드를 근거로 진입을 판단하는 오용이 줄어든다.
- **개선 방향 ①** «Est.» 를 11px 이상 라벨로 올리고 문구를 «추정»으로 로컬라이즈, 값 색을 중립으로 — 트레이드오프: 차트 상단이 텍스트로 더 붐빈다. ／ **개선 방향 ②** 장마감 세션에서는 NBBO 행 자체를 숨기고 «장마감 — 호가 없음»으로 — 트레이드오프: 장마감에 차트 상단이 비어 허전해진다.
- **출처:** Kalshi Pro «대시를 보이지 값을 지어내지 않는다»(2-1 ⑥) · Fiscal.ai «15 min delay» 출처 UI(2-1 ⑤) · 3단계 #4.

**이 화면에서 바꾸지 말아야 할 것**
- **히어로의 «현재가 + POST(CLOSED) 병치 + 세션 배지 + ET 시각»**(`cmd_default-top_promax`) — 앱에서 **기준 시각을 인쇄하는 유일한 히어로**다. 유지 조건: 시각을 ET 단독으로 두지 말고 현지시각을 병기할 것(3단계 #4).
- **다크풀 카드의 «값 → 비교 → 해석 → 접기»** 순서(37.3% / 시장 평균 41% −3.2%p / 평문 해석 / «해석 ▾») — 판정 우선 위계가 앱에서 가장 잘 구현된 카드다. 유지 조건: 해석 문장이 말줄임되지 않게 2줄을 허용할 것(현재 «…그쳤습…» 으로 잘림, `cmd_ZOOM-darkpool-tiles_17e`).

### 5-3. Flow (옵션 플로우)

**5-3-1. 고래 행에서 가장 큰 숫자에 단위가 없고, 같은 행의 두 숫자가 서로 모순된다 — [정밀층] [확실] · 신뢰도 · 심각도 높음 · 비용 소 · 기준 #4**
- **관측:** «이상 옵션 활동» 첫 행이 «[신규 진입] P $100 01-15 … **+138,840** / 거래 138 · OI 185,341»(`flow_tab-whale_promax`). 우측 대형 숫자는 코드상 **OI 변화**(`flow/page.tsx:3874` 부근 `c.oiChange`)인데 화면에 단위 라벨이 없고, 바로 아래 «거래 138» 과 나란히 놓여 **거래량 138 계약으로 미결제약정이 138,840 늘었다**는 읽기가 성립한다. 둘째 행도 «+93,455 / 거래 912» 로 같은 모양이다. 사용자가 산수를 하는 순간 화면의 신뢰가 무너지는 자리다.
- **바꾸는 사용자 행동:** 대형 숫자에 «OI 변화» 라벨과 기준 기간이 붙으면 → 사용자가 «거래 138 vs +138,840» 을 모순이 아니라 «전일 대비 미결제 증가»로 읽고 → 이 행을 근거로 삼을지 스스로 판단한다.
- **개선 방향 ①** 대형 숫자 위에 11px 라벨 «OI 변화 (전일 대비)» 를 붙이고 거래·OI 는 같은 행 우측 정렬 tabular 로 — 트레이드오프: 행 높이가 늘어 첫 화면 노출 행이 4→3 으로 줄어든다. ／ **개선 방향 ②** **[과감]** 행의 주 숫자를 OI 변화가 아니라 **프리미엄(달러)** 으로 바꾸고 OI 변화는 부 지표로 내린다 — «고래»라는 이름이 약속하는 것은 계약 수가 아니라 금액이다 — 트레이드오프: 프리미엄이 없는 행은 표시할 값이 없어진다([미확인] — 필드 존재 여부 미확인) · 실패 가능성: 프리미엄 필드가 일부 종목에서 비면 «—» 행이 늘어난다 · 되돌리는 비용: 소.
- **출처:** 3단계 #4 · Quant Data «축 제목에 단위 인쇄»(2-1 ①).

**5-3-2. 스트라이크 맵 축에 같은 값이 다른 이름으로 두 번 찍힌다 — [정밀층] [확실] · 데이터 판독성 · 심각도 중간 · 비용 소 · 기준 #4**
- **관측:** 주간 스트라이크 맵 하단 축이 «$220 · $220 · $228.4(현재가) · $230» 로, **풋 플로어와 감마 플립이 같은 $220 인데 축에 두 번** 찍힌다(`flow_tab-strike_promax` — 상단 카드 «풋 플로어 $220 / 압축 폭 4.4% / 콜 월 $230», 우측 «감마 플립 · 플립 위 $220.00»). 사용자는 서로 다른 두 레벨이 우연히 겹친 것인지 한 값을 두 이름으로 부른 것인지 알 수 없다.
- **바꾸는 사용자 행동:** 두 레벨이 겹칠 때 «풋 플로어 = 감마 플립 $220» 한 눈금으로 합쳐지면 → 사용자가 축의 눈금 수를 그대로 «주의할 가격대 수»로 세고 → 같은 가격을 두 번 계산하지 않는다.
- **개선 방향 ①** 축 눈금 병합 규칙(같은 값이면 라벨 결합) + 겹침 표시 — 트레이드오프: 결합 라벨이 길어져 17e 축에서 잘린다(약어 필요). ／ **개선 방향 ②** 축에는 현재가만 남기고 레벨은 카드 안 리스트로 분리 — 트레이드오프: «가격이 레벨 사이 어디에 있는가»라는 공간 정보가 사라진다.
- **출처:** 3단계 #4 · Tide Guide «극값을 선 위에 직접 라벨»(2-2 ⑤).

**5-3-3. Command 와 같은 히어로를 쓰는데 다크풀·변동성 카드가 없어 «같은 종목의 두 얼굴»이 된다 — [양쪽] [확실] · 판단 흐름 · 심각도 중간 · 비용 중 · 기준 #6·#7**
- **관측:** Flow 히어로는 Command 의 CSS 모듈을 그대로 차용한다(1-B 1-4 «화면별 재구현» 표; `flow/page.tsx:2313` 이 `cmd.module.css` 클래스 사용). 두 화면의 상단은 같은 카드로 보이는데 Command 에는 다크풀 카드·변동성 스트립·ⓘ 가 있고 Flow 에는 없다(`cmd_default-top_promax` vs `flow_tab-whale_promax`). NVDA 를 Command 에서 보다 Flow 로 넘어오면 «같은 화면인데 카드 두 개가 사라진» 경험이 된다.
- **바꾸는 사용자 행동:** 두 화면의 히어로가 명시적으로 다른 옷을 입으면(Flow 는 옵션 지표 중심, Command 는 가격·다크풀 중심) → 사용자가 탭 전환을 «같은 화면의 변형»이 아니라 «다른 질문»으로 이해하고 → 무엇이 사라졌는지 찾지 않는다.
- **개선 방향 ①** 히어로를 공용 컴포넌트로 승격하되 «Flow 변형»에 눈썹(«옵션 관점»)을 붙여 차이를 선언 — 트레이드오프: 공용화 비용(두 화면의 인라인 스타일 정리)이 든다. ／ **개선 방향 ②** Flow 히어로를 가격 카드가 아니라 플로우 요약(콜/풋 프리미엄 비·OPI·세션)으로 교체 — 트레이드오프: 가격 확인을 위해 Command 로 가야 한다 · 어떤 값을 보일지는 기능 결정이므로 «범위 밖 관찰»에도 기록.
- **출처:** NN/g Information Scent · 3단계 #6·#7.

**이 화면에서 바꾸지 말아야 할 것**
- **«이상 옵션 활동 [2026-09-02 · 마감 기준]» 칩**(`flow_tab-whale_promax`) — **앱 전체에서 기준 시각(날짜)을 명시한 유일한 블록**이다. 4-1-9·5-6-3 이 요구하는 «기준 시각 인쇄»의 사내 선례가 이미 여기 있다. 유지 조건: 이 칩의 형식(«YYYY-MM-DD · 기준»)을 전 화면 표준으로 승격할 것.
- **행의 방향 이중 인코딩** — «P/C» 문자 + 색 + «신규 진입» 텍스트 칩(색만으로 방향을 나르지 않는다). 유지 조건: 색약 대비를 위해 문자 인코딩을 계속 유지할 것.

### 5-4. Intel (섹터 인텔 · 섹터 상세)

**5-4-1. 실적 캘린더의 날짜가 데이터가 아니라 계산이다 — [정밀층] [확실] · 신뢰도 · 심각도 높음 · 비용 중 · 기준 #4**
- **관측:** «실적 발표 캘린더 [예정]»(`intel_sector-m7-detail_promax`)의 행 날짜는 API 응답이 아니라 **인덱스·점수로 계산**된다(`intel/page.tsx:5619-5628`; 1-B 1-6 표에 «날짜가 인덱스·점수로 계산(fetch 아님)»으로 기록). 화면에는 «예정» 배지만 있고 이 날짜가 추정이라는 표시가 없다. 실적일은 사용자가 포지션을 잡거나 접는 근거라, 틀린 날짜는 다른 어떤 오차보다 직접적인 피해를 만든다.
- **바꾸는 사용자 행동:** 계산된 날짜가 사라지거나 «추정»으로 표시되면 → 사용자가 이 캘린더를 근거로 만기·진입 시점을 정하지 않고 → 실제 공시 일정으로 교차 확인한다.
- **개선 방향 ①** 실측 실적일이 없는 종목은 «날짜 미확인»으로 표시(값을 지어내지 않음) — 트레이드오프: 대부분 행이 «미확인»이 되어 섹션이 비어 보인다. ／ **개선 방향 ②** **[과감]** 섹션을 «다음 촉매»로 바꿔 실측 소스가 있는 것(FOMC·CPI 등 매크로 일정)만 남긴다 — 트레이드오프: 종목별 실적일이라는 원래 가치가 사라진다 · 실패 가능성: 매크로 일정도 소스가 없으면 섹션이 통째로 빈다 · 되돌리는 비용: 소. ／ 실적 일정 소스를 붙이는 것은 데이터 작업이므로 «범위 밖 관찰»로 이관.
- **출처:** 3단계 #4(구별 불가 비실측 값 0) · Kalshi Pro(2-1 ⑥).

**5-4-2. 섹터 상세 하단이 «영어 아코디언 2 + 한국어 1» 이고 CTX 에 척도가 없다 — [양쪽] [확실] · 기능 전달력 · 심각도 중간 · 비용 소 · 기준 #4·#5**
- **관측:** 섹터 상세 최하단 세 아코디언이 «AI INTELLIGENCE [CTX 67] › / KEY CATALYSTS (5) › / 실적 발표 캘린더 [예정] ›»(`intel_sector-m7-detail_promax`) — 둘은 영어, 하나는 한국어다. «CTX 67» 은 척도·정의가 없고 코드에서도 라벨은 세 언어 동일 상수다(1-B 1-8 표: «AI INTELLIGENCE» :5445, «CTX N» :5457, «KEY CATALYSTS» :5543).
- **바꾸는 사용자 행동:** 세 제목이 같은 언어의 콘텐츠 명사가 되고 CTX 에 «/100» 이 붙으면 → 사용자가 접힌 상태에서 «무엇이 들어 있는지»를 읽고 → 셋 중 필요한 것만 펼친다.
- **개선 방향 ①** 아코디언 제목 3개 로컬라이즈 + CTX 를 «맥락 점수 67/100» 으로 — 트레이드오프: 한국어 제목이 길어져 배지와 충돌(17e 줄바꿈 위험). ／ **개선 방향 ②** 세 아코디언을 «AI 브리핑 / 촉매 / 일정» 3칩 세그먼트로 바꿔 한 번에 하나만 보이게 — 트레이드오프: 세 섹션을 동시에 비교할 수 없다.
- **출처:** 3단계 #5·#6 · NN/g Progressive Disclosure.

**5-4-3. 섹터 상세 푸터 아래에 화면 1/4 이 빈 어둠이다 — [표현층] [확실] · 기본기 · 심각도 낮음 · 비용 소 · 기준 #2·#3**
- **관측:** «© 2026 SIGNUM HQ» 아래로 탭바까지 약 400px(≈133pt)이 비어 있다(`intel_sector-m7-detail_promax`). 대시보드 하단에서도 같은 여백이 관측된다(`dash_default-bottom_17e`, 4-1-8 ⑦). 하단 인셋 계산이 «탭바+배너+safe» 를 이중으로 더한 결과로 보인다(`app-view/layout.tsx:210`, [추정]).
- **바꾸는 사용자 행동:** 여백이 탭바 높이만큼으로 줄면 → 사용자가 스크롤 끝에서 «아직 더 있나»를 의심하지 않고 → 마지막 섹션을 끝으로 인식한다.
- **개선 방향 ①** 하단 패딩을 배너 실제 로드 상태에 따라 동적으로(배너 없으면 배너 높이 제외) — 트레이드오프: 배너 로드 타이밍에 따라 레이아웃 시프트가 생겨 슬롯 높이 고정이 함께 필요하다. ／ **개선 방향 ②** 푸터를 마지막 카드에 붙여 여백을 콘텐츠로 채운다 — 트레이드오프: 푸터가 콘텐츠처럼 보여 법적 문구의 위계가 올라간다.
- **출처:** 3단계 #3 · HIG Layout.

**이 화면에서 바꾸지 말아야 할 것**
- **섹터 상세 히어로의 5열 스코어보드**(GEX −201.46M · PCR 0.62 · W/L 7/0 · SCORE 67 · REGIME SHORT) + 등락 폭 바(▲7 / 0▼) + 시장 감정 배지 + 등급 원(`intel_sector-m7_promax`) — 판정·근거·분포·등급이 한 화면에 층으로 쌓인 앱 최고의 밀도 설계다. 유지 조건: SCORE·등급의 척도를 인쇄할 것, GEX 단위(M)를 라벨로 명시할 것.
- **핵심 종목 행의 «로고 · 티커 · RSI + 바 · 스파크라인 · 가격 · 변화율 · 등급 원»** — 7개 열이 한 행에 정렬돼 들어간 유일한 표다. 유지 조건: 이 행의 스파크라인이 실측인지 확인해 DEMO 면 제거할 것([미확인] — 대시보드와 달리 Intel 은 실데이터 경로로 보이나 확인 못 함).

### 5-5. 셸 (탭바 · 설정 · 온보딩 · 광고)

**5-5-1. 온보딩·약관 화면 위에도 광고가 뜬다 — [표현층] [확실] · 신뢰도 · 심각도 높음 · 비용 소 · 기준 #3**
- **관측:** 동의 흐름에서 «앱 약관» 링크로 열린 약관 페이지 위에 흰 광고 배너가 얹혀 있다(`firstrun_04-terms-page-ad-overlay_17e`). 배너 억제 로직은 온보딩 오버레이에만 걸려 있고(`components/app/AppFirstRunOnboarding.tsx:149` 의 html class 토글) 약관 페이지에는 미적용으로 보인다([추정] — 억제 조건을 라우트가 아니라 오버레이 마운트 상태로 잡음). 법적 고지를 읽는 화면에 상업 배너가 겹치는 것은 심사·규제 양쪽에서 위험하다.
- **바꾸는 사용자 행동:** 약관·개인정보·동의 화면에서 배너가 사라지면 → 사용자가 법적 문구를 방해 없이 읽고 → «이 앱은 동의도 광고와 함께 받는다»는 인상이 생기지 않는다.
- **개선 방향 ①** 배너 억제를 라우트 기준으로(약관·개인정보·온보딩·동의) — 트레이드오프: 없음. ／ **개선 방향 ②** 법적 화면에서는 배너 슬롯을 «비어 있는 다크 슬롯»으로 유지해 레이아웃 시프트를 막는다 — 트레이드오프: 빈 슬롯 60pt 가 낭비된다.
- **출처:** NN/g Most Hated Advertising Techniques · 3단계 #3.

**5-5-2. 설정에 테마·글자 크기 항목이 없어 다크 전용이 «선택»이 아니라 «상태»로 남는다 — [표현층] [확실] · 기능 전달력 · 심각도 중간 · 비용 중 · 기준 #10**
- **관측:** 설정 시트 항목은 언어 / 알림 3종 / 캐시 초기화 / 앱 평가하기 / 이용약관 / 개인정보 처리방침 / 컴패니언 앱 2개 / 버전(`settings_default_promax`, `settings_bottom_promax`)이고 **외관·글자 크기 항목이 없다**. 앱은 시스템 라이트에서도 다크로 렌더되고(`dash_LIGHT-top_17e`) iOS 글자 크기·대비 증가에 반응하지 않는다(4-0-8). 사용자는 «왜 이 앱만 어두운가»를 물을 곳도, 조정할 곳도 없다.
- **바꾸는 사용자 행동:** 설정에 «화면: 다크 전용(야간 데이터 판독용)» 한 줄과 «글자 크기» 항목이 생기면 → 사용자가 다크를 «앱이 고장난 것»이 아니라 «의도»로 읽고 → 글자가 작다고 느낄 때 앱을 지우는 대신 설정을 연다.
- **개선 방향 ①** 2.5 판정의 «의무 ⑤»(계약 선언)를 설정 화면에 노출: 다크 전용 표기 + 앱 내 글자 크기 3단 — 트레이드오프: 웹뷰 루트 폰트 스케일링이라 5탭 전체 레이아웃 회귀 검증이 필요하다. ／ **개선 방향 ②** **[과감]** 시스템 Dynamic Type 를 그대로 따르게 하고(px→rem 전환) 설정 항목을 두지 않는다 — 트레이드오프: 82종 px 절대값 전환은 5탭 전면 회귀 · 실패 가능성: 3열 타일·표가 큰 글자에서 무너진다(3단계 #2 의 «200% 잘림 0» 이 선행 조건) · 되돌리는 비용: 대.
- **출처:** Apple HIG Dark Mode · WCAG 1.4.4 · 3단계 #10.

**5-5-3. 설정의 부제·크로스프로모가 영어와 한국어를 섞는다 — [표현층] [확실] · 기능 전달력 · 심각도 낮음 · 비용 소 · 기준 #5**
- **관측:** «앱 평가하기 / App Store에서 별점 남기기», «Undercurrent / 뉴스 뒤의 돈 · 무료», «Why'd It Move? / 오늘 왜 움직였는지 퀴즈로 · 무료», 하단 «SIGNUMHQ v1.6»(`settings_default_promax`, `settings_bottom_promax`). 제품명은 원어가 맞지만 부제는 한국어인데 상위 라벨이 영어인 행이 섞여 있다.
- **바꾸는 사용자 행동:** 부제 언어가 통일되면 → 사용자가 설정 목록을 한 번에 훑고 → 컴패니언 앱 두 줄이 «광고인지 우리 앱인지»를 헷갈리지 않는다.
- **개선 방향 ①** 제품명(고유명사)만 원어, 나머지 부제·설명은 UI 언어로 통일 — 트레이드오프: 없음. ／ **개선 방향 ②** 컴패니언 앱 2행을 «SIGNUM 의 다른 앱» 그룹 헤더 아래로 묶어 출처를 명시 — 트레이드오프: 설정이 한 그룹 길어진다.
- **출처:** 3단계 #5.

**이 화면에서 바꾸지 말아야 할 것**
- **설정 시트의 정보 순서**(언어 → 알림 → 유지보수 → 법적 → 컴패니언 → 버전) — 빈도·중요도 순서가 맞다. 유지 조건: 테마·글자 크기를 추가할 때 «언어» 바로 아래(화면 설정 그룹)에 넣을 것.
- **동의 게이트의 amber 경고 박스 + 시안 불릿 4개 + 비활성 CTA** 구조(`firstrun_02-consent-1of2_17e`) — 법적 고지의 위계가 분명하고 체크 전 CTA 비활성이 정직하다. 유지 조건: 4-4-9(2/2 카드에 선택 수단 없음)를 고칠 때 이 화면의 위계 문법을 유지할 것.

### 5-6. 화면을 가로지르는 결함 (5탭 공통)

한 화면의 문제가 아니라 **같은 뿌리가 5탭에 퍼진 것**이다. 화면별로 고치면 다시 갈라지므로 «종류»로 묶는다(작업 원칙 `fix-the-class-not-the-instance`).

| # | 결함 | 퍼진 범위(캡처) | 뿌리 | 기준 |
|---|---|---|---|---|
| 5-6-1 | **하락색이 두 값**(#ef4444 / #f43f5e) + 녹색 3종 | Guardian·Flow 는 한 화면에 둘 다, dash·cmd·intel 은 red 만(1-A-3 픽셀 실측) | 토큰 파일이 2곳만 import, 색 리터럴 3,853개(1-B 1-1) | #9 «의미당 색 1» |
| 5-6-2 | **카드 프레임 5종·헤더 5종** | 5탭 전부(1-A-3, 1-A-5) | 화면마다 카드 개념을 재구현(1-B 1-4) | #9 «프레임 튜플 ≤2» |
| 5-6-3 | **기준 시각 없음** | 전 화면. 예외 2곳뿐 — cmd 히어로 «9/3, 22:14 ET», flow 고래 «2026-09-02 · 마감 기준» | 응답의 `updatedAt/marketTime` 을 렌더하지 않음(`dash/page.tsx:259-275`) | #4 «수치 모듈 100% 기준 시각» |
| 5-6-4 | **세션 어휘 4종** | dash «CLOSED» / cmd «MARKET CLOSED»+«POST (CLOSED)» / flow «● CLOSED» / guardian «CLOSED» ×2 | 화면마다 세션 판정 헬퍼를 따로 구현(1-B 1-4) | #4 «상태별 표기 1종» |
| 5-6-5 | **8~10px 라벨** | flow 8px 30회·intel 10px 40회·guardian 9px 26회·cmd 다수(1-B 1-2) | 크기 고유값 82종, 하한 규칙 없음 | #2 «11pt 미만 0» |
| 5-6-6 | **광고 배너가 콘텐츠를 덮음** | 5탭 전부 — Guardian 은 SCORE TIMELINE 위(`guardian_default-top-recheck_promax`), dash 는 ETF 행 위(`firstrun_ZOOM-ad-over-content_17e`) | 배너가 예약 인셋이 아니라 오버레이(`app-view/layout.tsx:210`) | #3 «겹침 0px» |
| 5-6-7 | **접근성 설정 무반응** | dash 실측, 나머지는 같은 웹뷰라 [추정] | px 절대값 + `text-size-adjust:100%`(4-0-8) | #10 |
| 5-6-8 | **잠금 카드의 «오늘 14.2K 잠금해제» 상수** | dash·cmd·guardian·flow 4화면 공용(`ValueWall.tsx`) | 정적 문자열 | #4 «정적 사회적 증거 0» |
| 5-6-9 | **합성·추정값에 표시 없음** | dash 스파크라인 9 · cmd NBBO·IV Skew · flow VWAP/고저·스트라이크 더미 · intel 실적일 | «값이 없으면 만들어서라도 채운다»는 폴백 관행 | #4 |

**5-6 이 말하는 것.** 아홉 개 중 여섯(1·2·3·4·5·9)은 **디자인 결정이 아니라 «공유되지 않은 규칙»** 이다. 색·프레임·시각·세션어·크기·정직성 각각에 정본이 없어 화면마다 다시 정해졌다. 2.5 판정의 «단일 다크의 의무»(토큰 수렴·불투명 카드·타이포 하한)와 4-5 의 «공통 전제»가 이 여섯을 동시에 겨냥한다 — 첫 화면 재설계는 첫 화면만의 작업이 아니다.

---

## ■ 바꾸지 말아야 할 것 (앱 전체)

화면별 «바꾸지 말아야 할 것»은 각 절 끝에 있다. 여기에는 **전 화면을 관통하는, 재설계에서 반드시 살아남아야 할 다섯 가지**만 적는다.

1. **판정을 화면 맨 위에 두는 구조.** 대시보드 «Risk-On 우위», Guardian «RLSI + 심리 약세·관망 구간», Command 다크풀 «37.3% → 시장 평균 대비 → 평문 해석», Intel 섹터 히어로 «SCORE + REGIME + 등급». 네 화면이 이미 «값 → 판정» 이 아니라 «판정 → 값» 순서다. 4-5 두 안이 다투는 것은 이 구조가 아니라 **판정에 척도와 기준 시각이 없다는 것**뿐이다.
2. **세션을 블록마다 라벨로 구분하는 원칙.** FUTURES LIVE / CLOSED 를 행 단위로 붙여 «어느 숫자가 살아 있는가»를 말한다. 표기가 4종이라는 것(5-6-4)은 결함이지만 원칙 자체는 레퍼런스 11곳 중 어디보다 촘촘하다.
3. **고정폭 숫자와 자산별 소수 자릿수.** «7,754.50 / 26,584 / $717.67 / 14.32» — 세 평가자 모두 이것을 신뢰 신호로 꼽았다. tabular 정렬은 재설계에서 강화하되 절대 되돌리지 말 것.
4. **라이브 카드에만 붙는 테두리 글로우.** 화면에서 유일하게 «지금 움직이는 것»을 가리키는 장치다. NTS 의 «live 에만 한 색» 문법(2-2 ④)으로 확장할 씨앗이며, 이것까지 걷어내면 남는 것은 제네릭 다크다.
5. **법적 고지의 위치와 위계.** 동의 게이트의 amber 박스, 잠금 카드 하단 면책, 푸터 3중 고지. 한국 자본시장법·앱스토어 3.1.2 양쪽을 이미 통과한 구성이다(메모리 `subscription-needs-eula-link-in-description`, `paywall-hard-gates-ios-trial-and-korea-law`). **언어만 고치고 구조는 건드리지 말 것**(5-1-1).

---

## ■ 이 앱이 시각적으로 기억되려면

**지금 상태의 진단.** 세 평가자의 블러 판정은 generic 2 : somewhat-distinct 1 이었고, 셋 다 같은 것을 기억했다 — «첫 줄의 초록·빨강 발광 격자». 그런데 회의론자가 지적했듯 그 형태는 **그날의 등락에 따라 바뀌는 상태**다(같은 화면이 어떤 날은 세 장 모두 초록). 즉 지금 이 앱에는 **상태와 무관하게 반복되는 시각 서명이 하나도 없다.** 2-6 #5 의 관측과도 맞물린다 — 현 조합(다크 + 시안/보라 그라디언트 + glass)을 쓰는 레퍼런스는 검증한 11곳 중 0곳인데, 그것이 «독창적»이어서가 아니라 **아무도 그 조합을 서명으로 쓰지 않기 때문**이다.

**기억되기 위해 필요한 것은 셋뿐이다.**

1. **문턱이 인쇄된 하나의 자(尺).** 0–100 위에 판정 문턱(42·58)을 눈금으로 찍고 마커 하나를 놓는 12pt 띠. 대시보드 리스크, Guardian RLSI, Intel 섹터 SCORE, 푸시 이미지, OG 카드가 **같은 자**를 쓰면 «이 앱은 점수를 이렇게 보여준다»가 자산이 된다. 게이지(Guardian)·도넛(Quant Data)·색 단어(MenthorQ)는 전부 문턱을 숨기지만 이 자는 공식을 화면에 드러낸다 — 정직성이 곧 형태가 되는 드문 경우다.
2. **편성표 눈썹.** 모든 수치 블록의 첫 줄을 «세션어 · 기준 MM/DD HH:MM ET · HH:MM KST» 고정 순서로 인쇄. 미국 앱은 KST 를 찍지 않고 한국 증권앱은 ET 를 앞세우지 않는다. **«미국장을 한국 밤에 읽는 사람»이라는 청중 정의가 활자로 드러나는 자리**이며, 5-6-3(기준 시각 부재)을 고치는 일과 서명을 만드는 일이 같은 작업이 된다.
3. **한 색만 살아 있게.** 라이브 상태에만 시안 한 색과 글로우 하나. 나머지는 방향 2색과 중립. 지금은 시안·보라·amber·rose·red·3종 녹색이 동시에 빛나서 «무엇이 지금인가»가 색으로 읽히지 않는다. NTS 가 red #e81717 을 LIVE 에만 쓰듯(2-2 ④), 색 예산을 하나로 줄이는 절제가 이 카테고리에서는 과감함이다.

**하지 말아야 할 것.** 새 장식을 더하는 방향(브래킷을 5탭에 뿌리기, 그라디언트 늘리기)으로는 기억되지 않는다. 검증한 레퍼런스에서 기억되는 제품은 예외 없이 **하나의 구조적 장치**로 기억됐다 — Sofascore 의 모멘텀 파형, Tide Guide 의 시간 부호화 곡선, NTS 의 시간창, Windy 의 예측가능성 점. 장식이 아니라 «데이터를 다루는 방식»이 서명이었다.

---

## ■ 범위 밖 관찰 (기능·데이터 변경이 필요해 이 감사의 범위를 벗어나는 것)

디자인으로 고칠 수 없고 기능·데이터 결정이 필요한 항목이다. **제안이 아니라 관찰**이며, 대표 판단 대상이다.

1. **같은 화면에 SPY 가격이 둘.** TOP MOVERS «$773.43» vs ETF 행 «$773.17»(`dash_default-mid_17e` vs `dash_default-top_17e`). 두 블록이 다른 소스를 쓴다는 뜻이고, 어느 쪽이 정본인지 화면이 말할 수 없다. 디자인은 «기준 시각 인쇄»까지만 할 수 있다.
2. **스파크라인에 실측 히스토리가 없다.** 4-0-1 의 개선안은 «선을 지우거나 정직하게 표시»까지다. 실제 일중 히스토리를 붙이는 것은 데이터 작업이다.
3. **실적 일정 소스 부재.** 5-4-1. 캘린더가 인덱스 계산이라면 소스를 붙이거나 섹션을 접어야 하는데, 둘 다 기능 결정이다.
4. **첫 화면에 다크풀·기관 값이 하나도 없다.** 4-1-3 은 «순서와 라벨»까지만 다룬다. 무료층에 어떤 값을 얼마나 보일지는 수익 모델 결정이다.
5. **Flow 히어로가 무엇을 보여야 하는가.** 5-3-3 ②는 가격 카드 대신 플로우 요약을 제안하지만, 어떤 지표를 히어로에 올릴지는 제품 결정이다.
6. **개인화(관심종목·알림 대상)가 없다.** 세 평가자 모두 «내일 다시 열 이유»의 부재를 이것으로 설명했다. Command 는 마지막 종목을 기억하지만(`localStorage app-active-ticker`) 첫 화면에는 손잡이가 없다.
7. **흰 광고 배너의 색.** 크리에이티브는 광고주 소관이라 «슬롯 처리»까지만 디자인의 몫이다.
8. **«오늘 14.2K 잠금해제»를 실제 카운트로.** 상수를 지우는 것은 디자인이지만, 실수치를 붙이는 것은 계측 작업이다.
9. **설정의 컴패니언 앱 링크가 시뮬레이터에서 «주소가 유효하지 않음» 알럿을 띄운다.** 실기기(App Store 존재)에서는 정상일 가능성이 높아 [미확인]으로 남긴다 — 실기기 확인 필요.
10. **푸시 페이로드의 착지 지점.** 장마감 푸시가 Intel 탭 최상단으로 가는데(`layout.tsx:79`), 리포트는 «장마감 리포트» 세그먼트 뒤에 있다. 딥링크에 세그먼트 파라미터를 넣는 것은 라우팅 변경이다.

---

## ■ 확인하지 못한 것

무엇을 못 봤는지 명시한다. 이 목록에 있는 항목에 대한 이 문서의 서술은 전부 [추정] 또는 [미확인]이다.

| 항목 | 못 본 것 | 이유 |
|---|---|---|
| **장중(LIVE) 화면** | 틱 플래시·liveBlink·WS 오버레이·PRE/POST 카드의 실시간 거동 | 캡처 시각이 정규장·애프터마켓 종료 후(0-1). 4-2-3 은 코드 기준 [추정] |
| **오프라인·느린 네트워크·부분 실패** | NetworkStatus 필, «데이터 재연결 중» 카드, 일부 API 실패 시 «—» 분포 | 시뮬레이터에 네트워크 차단 수단 없음. 호스트 설정 변경은 이 세션의 금지 범위(0-4) |
| **광고 시청 후 해제 화면** | 기관 시그널 4카드, Command AI 딥분석, Guardian GAMMA SHIELD, Flow GEX·고래 덱 — 앱의 «상품» 전체 | 리워드 광고 재생은 외부 서비스 상호작용이라 실행하지 않음 |
| **무버스 화면**(`/app-view/movers`) | 20행 랭킹·3탭 | 미진입 |
| **모달·팝업 레이어** | ⓘ 팝업, 검색 모달, 8-K 팝업, Intel 리포트 전체화면 시트, 리워드 모달 | 미조작 |
| **하락 종목의 히어로** | 하락 시 카드 틴트·차트 색(`cmd.module.css:1225` 의 녹색 라디얼이 하락에서도 녹색인지) | 캡처 시점 주요 종목 전부 상승 |
| **Intel 종목 상세 카드** | 섹터 상세 안 종목 행을 탭한 뒤의 카드 | 미탭 |
| **Intel 스파크라인의 실측 여부** | 섹터 카드·핵심 종목 행의 선이 실데이터인지 | 코드 경로 미추적 |
| **Flow 고래 행의 프리미엄 필드** | 5-3-1 ②가 전제하는 필드 존재 여부 | 미확인 |
| **푸시 알림의 실제 표시** | 배너·잠금화면 표시, 탭 후 착지 화면 | `simctl push` 로 배지 «1» 만 확인됨(0-5 #21). 알림 센터 캡처는 홈 화면만 잡힘 |
| **5인 평가자 패널** | 기준 #6(정보 향기 정답률)·#8(블러 식별 적중)의 정식 측정 | 평가자 3인(모의) + 회의론자 검증으로 대체 — 두 기준의 결과는 [추정] 상한 |
| **접근성 설정의 나머지 탭** | 글자 최대·대비 증가 상태의 Guardian/Command/Flow/Intel | dash 만 실측, 나머지는 같은 웹뷰라 [추정] |
| **Android** | 전부 | iOS 감사 범위 |
| **Dynamic Type·200% 확대 후 레이아웃** | 3열 타일·표의 붕괴 여부 | 앱이 시스템 설정에 반응하지 않아 «확대된 화면» 자체가 만들어지지 않음(4-0-8) |

---

## ■ 지금 손대면 효과가 가장 큰 5가지

우선순위 기준: **(a) 사용자가 잘못 판단할 위험을 줄이는가 · (b) 비용 대비 효과 · (c) 다른 개선의 선행 조건인가.**

**1. 화면이 지어낸 값을 전부 지우거나 «추정»으로 표시한다** — 비용 소 · 위험 감소 최대
스파크라인 9장(4-0-1), NBBO «Est.»(5-2-4), Flow VWAP/고저·스트라이크 더미, Intel 실적일(5-4-1), «오늘 14.2K»(5-6-8). 이 다섯은 **같은 종류**다 — «값이 없으면 만들어서라도 채운다». 코드에 이미 «가짜 숫자는 빈칸보다 나쁘다»(`dash/page.tsx:1274-1278`)고 써 놓고 선은 남긴 것이 지금 상태다. 지우는 데 드는 비용은 며칠이고, 사용자가 데모 선을 보고 방향을 오판할 위험은 그날로 사라진다. **다른 어떤 개선보다 먼저 할 것.**

**2. 부호·세션·기준 시각을 공용 유틸 하나로 만든다** — 비용 소~중 · 아홉 개 결함이 동시에 닫힘
«▼ −0.00%»(4-0-2, 5-1-3), 세션 어휘 4종(5-6-4), 기준 시각 부재(5-6-3), RSI 라벨 두 벌(5-2-1). 넷 다 «공유되지 않은 규칙»이고, 포맷 유틸 3개(부호·세션·시각)로 한 번에 닫힌다. Flow 고래 카드의 «2026-09-02 · 마감 기준» 칩이 이미 사내 정답이다 — 그 형식을 전 화면 표준으로 승격하면 된다.

**3. 광고 배너를 «콘텐츠 위 오버레이»에서 «예약된 다크 슬롯»으로 바꾼다** — 비용 중 · 첫인상 최대 개선
평가자 3인 모두 첫 3초 인상에 배너를 언급했고, 블러 후 첫 시선도 배너였다(4-1-2). 겹침은 5탭 전부에서 값을 덮고 있으며(5-6-6), 약관 화면 위에도 뜬다(5-5-1). 슬롯화 + 라우트별 억제 + 하단 인셋 정정은 같은 작업 하나이고, 부수적으로 «푸터 아래 빈 어둠»(5-4-3)과 «탭바 뒤 비침»(4-1-8)도 함께 닫힌다.

**4. 2.5 판정의 «단일 다크의 의무» 6항을 실행한다** — 비용 대 · 나머지 전부의 선행 조건
915개 색 리터럴을 약 40개 토큰으로 수렴, 콘텐츠층 glass 제거, 카드 프레임 1종, 텍스트 ≥7:1, 11px 미만 0, `color-scheme: dark` 선언. 5-6 의 아홉 결함 중 여섯이 여기서 닫히고, 4-5 두 재설계안 모두 이것을 전제로 한다. **가장 비싸지만 이것을 건너뛰면 나머지 개선이 화면마다 다시 갈라진다.** 게이트는 CI 린트(앱 표면 색 리터럴 0)로 걸 것.

**5. 첫 화면에 «판정 + 척도 + 기준 시각»을 세우고 탭바를 사용자 언어로 바꾼다** — 비용 중 · 재방문 이유를 만든다
4-5 안 A(판정 수평선)의 상단 히어로와 탭바 로케일화(4-3-2)다. 세 평가자 모두 «내일 다시 열 이유가 화면에 없다»고 했고, 탭 라벨이 은유형 영어라 차별 기능으로 가는 길이 막혀 있다(4-3-2·4-3-4). 4-5 의 «공통 전제 1~11»을 먼저 구현하고 히어로만 A/B 로 실화면 캡처를 만든 뒤 최종안을 고르는 순서를 권한다.

**이 다섯이 아닌 것.** 새 장식·새 애니메이션·새 차트 타입은 목록에 없다. 지금 이 앱의 문제는 «심심하다»가 아니라 **«화면이 자기 숫자에 대해 말하지 않는다»** 이고, 1·2·4 가 그것을 고친다. 표현층의 과감함은 3·5 가 자리를 비운 뒤에 들어가야 효과가 난다.

---

## ■ 2차 검토 — Opus 5 의 독립 재평가

> **왜 이 절이 있나.** 대표 지시: «페이블 조사를 엎는 것이 아니라 이어서 조사를 전부 하고, 전체를 너 스스로 다시 평가해 개선 방향을 말해라». 위 0~5단계는 **그대로 둔다**. 이 절은 그것을 읽는 사람이 아니라 **검토하는 사람**의 눈으로 다시 본 결과다. 동의하는 것, 동의하지 않는 것, 빠진 것, 그리고 내가 권하는 순서를 적는다.
>
> 검토자 표기: 0~4단계는 Fable 5.1(다중 에이전트 + 지적별 독립 반박), 5단계·마무리·이 절은 Opus 5(디렉터 직접 확인).

### R-1. 가장 큰 구조적 결함 — 기준 10개를 만들어 놓고 채점하지 않았다

3단계는 기준마다 **수치 합격선**을 정했다(«정밀층 위반 0건», «390pt 말줄임 0», «비UI언어 라벨 ≤20%», «장식 8~20%·광고 ≤6%»). 그런데 4·5단계는 지적 옆에 «기준 #4» 라고 **라벨만 붙였을 뿐, 어느 화면이 어느 기준에 합격/불합격인지 한 번도 판정하지 않았다.** 기준이 측정 도구가 아니라 분류 태그로 쓰인 것이다. 감사의 목적이 «다음에 다시 재서 나아졌는지 확인»하는 것이라면 이건 빠져서는 안 되는 산출물이다.

**그래서 지금 있는 실측만으로 첫 화면(Dashboard)을 채점했다.** 새 측정은 하지 않았고 문서 안의 수치만 썼다.

| 기준 | 합격선 | 실측 | 판정 |
|---|---|---|---|
| **#1 정밀 대비** | 텍스트 ≥4.5:1 · 정보 그래픽 ≥3:1 · 위반 0 | 뉴스 시각 **4.14:1**, 카드 경계 rgba(255,255,255,.03~.06) on #0b111e **≈1.1:1**, 코드상 라벨 slate-600 **2.3:1** | **불합격** |
| **#2 정밀 조판** | ≥11pt · 말줄임 0 · 44×44pt · 기준선 ≤1pt | 8~10px 선언 9곳 + 뱃지 5.5px, «NASDAQ…»«RUSSELL…» 말줄임(두 기기), 기어 30×30(간격 조건부), 3열 타일 기준선 어긋남 | **불합격** |
| **#3 데이터 우선** | 무피드백 ≤1.0s · 겹침 0px · 동의 화면 광고 0 | 최초 실행 **12s+ 빈 화면**, 광고가 ETF 행·탭바가 매크로 값 덮음, **약관 화면 위 광고** | **불합격** |
| **#4 값의 정직성** | 기준 시각 100% · «−0.00» 0 · 부호 1종 · 비실측 구별 100% | 기준 시각 **2곳뿐**(cmd 히어로·flow 고래), «−0.00%» 존재, 부호 규칙 **3종**, 스파크라인 9장·NBBO·VWAP·실적일이 **구별 불가** | **불합격** |
| **#5 라벨 언어** | 비UI언어 ≤20% · 미설명 전문어 ≤2 | 첫 뷰포트 영어 12 : 한국어 11 = **52%**, ATT 사유 영문, Guardian 잠금 면책 영문 | **불합격** |
| **#6 정보 향기** | 탭바 정답률 ≥80% | 평가자 5인 패널 미실시 | **미측정** |
| **#7 위계 예산** | so-what ≥1 상위 3 · 장식 8~20% · 광고 ≤6% · 블러 첫 시선 = 데이터 | so-what 1개 있으나 척도·근거 없음, **광고 7.1%**, **블러 첫 시선 = 광고** | **불합격** |
| **#8 식별성** | 블러 적중 ≥4/5 · 서명 자산 ≥2 | 5인 패널 미실시(모의 3인: generic 2 : somewhat-distinct 1) | **미측정**([추정] generic) |
| **#9 표현 문법** | 프레임 튜플 ≤2 · 의미당 색 1 · 토큰 참조 ≥90% | 프레임 **5종**, 하락색 **2값**·녹색 **3값**, 색 리터럴 **3,853개**(토큰 참조율 한참 미달) | **불합격** |
| **#10 시스템 응답** | 라이트 표면 0 · 대비 증가 ≥7:1 · 200% 잘림 0 | ATT 가 라이트 창, 대비 증가 ON 에도 픽셀 변화 0, **확대 자체가 불가** | **불합격** |

**첫 화면 채점 결과: 합격 0 · 불합격 8 · 미측정 2.**

이 표가 감사의 진짜 결론이다. 개별 지적 45건보다 이 한 줄이 더 정확하다 — **지금 첫 화면은 우리가 스스로 세운 기준을 하나도 통과하지 못한다.** 동시에 이 표는 «다음에 다시 재는 법»이기도 하다. 어떤 개선을 하든 이 열 줄을 다시 채워서 «불합격 8 → 몇»으로 말할 수 있어야 한다.

### R-2. Fable 조사에서 동의하는 것 (재확인)

1. **테마 판정 (a) 다크 유지 — 동의한다. 단 주된 이유는 다르다.** 판정문은 «사용 시간대»(근거 4)를 크게 썼는데, 그 근거는 푸시 크론 시각에서 추론한 것이고 실제 세션 시각 데이터가 없다(판정문 스스로 [추정] 표기). 내가 보기에 (a)를 지지하는 결정적 이유는 **비대칭 위험** 하나다: 지금 토큰이 UI 를 지배하지 못하는 상태(리터럴 3,853개)에서 두 번째 팔레트를 열면, 미이관 리터럴 하나가 라이트에서 «흰 글자/흰 카드»가 되어 **값이 조용히 사라진다.** 이 저장소가 반복해서 겪은 «200 OK 인데 값만 없음»의 테마판이다. 시간대 논거가 흔들려도 이 논거는 흔들리지 않는다.
2. **«실측 라벨 결함의 원인은 다크가 아니라 glass·틴트»** — 캡처로 확인했고 동의한다. 이건 판정의 핵심이자 가장 실용적인 통찰이다.
3. **DEMO 스파크라인 추적** — 이 감사에서 단일로 가장 값어치 있는 발견이다. 화면만 봐서는 «그럴듯한 선»이고, 코드까지 따라가야만 드러난다.
4. **지적별 독립 반박 검증** — 실제로 작동했다. 4-2-7 이 반증됐고(«3단계 반복»이 틀림), 첫인상 패널의 주장 12건이 걸러졌다. 검증 없이 문서에 들어갔다면 대표가 잘못된 전제로 판단할 뻔했다.

### R-3. 동의하지 않거나 약하다고 보는 것

1. **«효과가 큰 5가지»의 4번을 «나머지 전부의 선행 조건»이라고 쓴 것은 과장이다(내가 쓴 문장).** 토큰 수렴은 5-6-1·2·5(색·프레임·크기)의 선행 조건이지, 1번(지어낸 값 제거)·2번(포맷 유틸)·3번(광고 슬롯)과는 **독립**이다. 셋은 토큰 작업을 기다릴 이유가 없다. 순서는 그대로 두되 «4번을 기다리지 말 것»을 명시한다.
2. **재설계 2안은 «선택할 수 있는 상태»가 아니다.** 두 안 모두 텍스트 와이어프레임이고, 정작 두 안을 가르는 기준 #8(블러 식별)은 **실화면 없이는 잴 수 없다.** 4-5 스스로 «점수는 실화면 캡처로만 오른다»고 썼는데 맞는 말이다. 지금 상태에서 A/B 중 하나를 고르는 것은 근거 없는 선택이다.
3. **«이 앱이 무엇을 해주는가»에 대한 모든 판정에 큰 단서가 붙어야 한다.** 세 평가자가 «TradingView 로 이미 보는 것»이라 한 것은 사실이지만, **그들이 본 것은 잠금 앞의 무료층뿐**이다. 이 앱의 차별 데이터(기관 신규 포지션·딜러 감마·GEX·고래 덱)는 전부 광고 시청 뒤에 있고 감사는 그것을 한 번도 보지 못했다. «첫 화면이 차별 기능을 전달하지 못한다»는 결론은 유효하지만, «앱이 차별성이 없다»로 읽으면 틀린다.
4. **5단계의 검증 밀도가 4단계에 못 미친다.** 5단계 15건은 내가 캡처와 코드 양쪽에서 확인했지만 **독립 반박자를 거치지 않았다.** 4-2-7 사례가 보여주듯 한 사람의 확인은 «구조는 맞고 인과가 틀린» 실수를 못 잡는다. 5단계 지적을 실행에 옮기기 전에 4단계와 같은 반박 검증을 한 번 돌리는 것을 권한다.

### R-4. 감사 자체에서 빠진 것 (다음에 다시 한다면)

| 빠진 것 | 왜 중요한가 | 어떻게 메우나 |
|---|---|---|
| **잠금 해제 후 화면 전체** | 앱의 «상품»을 한 번도 보지 못했다. 유료·광고 해제층의 디자인 품질은 미감사 | 개발 플래그로 해제 상태를 만들거나, 실기기에서 실제 광고를 한 번 시청해 캡처 |
| **장중(LIVE) 화면** | 이 앱의 존재 이유가 «지금 움직이는 것»인데 정지 상태만 봤다 | 22:30~05:00 KST 사이 재캡처 |
| **5인 평가자 패널** | 기준 #6·#8 이 미측정이라 «식별성»에 대한 모든 서술이 [추정] | 목표 사용자 5명에게 블러 30장 + 라벨 5초 테스트(프로토콜은 3단계에 이미 있음) |
| **기준 채점표(R-1)** | 개선 전후를 숫자로 말할 수 없었다 | 이 절의 표를 baseline 으로 고정, 개선마다 재채점 |
| **Android** | 사용자의 절반가량 | 별도 감사 |

### R-5. 내가 권하는 개선 방향

**원칙 하나: «화면이 자기 숫자에 대해 말하게 만든다»가 먼저고, 새 디자인은 그 다음이다.** 지금 이 앱의 가장 큰 문제는 심심한 것도, 다크인 것도 아니다. 화면이 **언제의 값인지·실측인지·어느 방향인지**를 말하지 않는다는 것이다. 세 평가자가 공통으로 든 불신 신호가 전부 이 범주였다.

**1단계 — 정직성 (며칠, 위험 낮음, 코드 변경 작음)**
지어낸 값 제거(스파크라인 9·NBBO Est.·VWAP 합성·스트라이크 더미·실적일·«14.2K»)와 포맷 유틸 3개(부호·세션어·기준 시각). 기준 #4 가 불합격에서 합격으로 갈 수 있는 유일한 단계이고, 다른 어떤 작업도 기다릴 필요가 없다. **여기까지만 해도 «신뢰를 깎는 요소»의 대부분이 사라진다.**

**2단계 — 가림 해소 (1~2주)**
광고를 예약 다크 슬롯으로, 하단 인셋 정정(탭바+배너+safe), 라우트별 배너 억제(약관·동의), 잠금 CTA 가시성. 기준 #3 과 #7 의 광고 항목이 함께 닫히고, 부수적으로 푸터 빈 여백·탭바 뒤 비침도 해결된다.

**3단계 — 규칙 만들기 (3~4주, 가장 비쌈)**
토큰 수렴(915→~40) + 콘텐츠층 glass 제거 + 카드 프레임 1종 + 타이포 하한(11px) + `color-scheme: dark` 선언 + **CI 린트로 앱 표면 색 리터럴 0 강제**. 기준 #1·#2·#9·#10 이 여기서 움직인다. 린트가 없으면 6개월 뒤 같은 감사를 다시 하게 된다.

**4단계 — 그 다음에야 재설계 (측정 후 결정)**
4-5 의 «공통 전제 1~11»을 구현하고 히어로만 A/B 로 만들어 **실화면을 캡처한 뒤** 블러 패널 5인으로 고른다. 지금 문서만 보고 A 나 B 를 고르는 것은 권하지 않는다.

**병행 — 측정을 습관으로**
R-1 표를 baseline 으로 두고 각 단계 후 재채점. 특히 «색 리터럴 수»·«11px 미만 선언 수»·«기준 시각 없는 수치 모듈 수» 세 개는 스크립트로 자동 측정이 되므로 CI 에 붙일 수 있다. 이 감사가 남길 가장 오래가는 산출물은 지적 60건이 아니라 **다시 잴 수 있는 열 줄**이다.

### R-6. 이 문서를 읽는 순서 (대표용)

1. **R-1 채점표** — 지금 상태를 한 장으로.
2. **«지금 손대면 효과가 가장 큰 5가지»** — 무엇부터 할지.
3. **2.5단계 테마 판정** — 다크를 유지하되 무엇을 의무로 지는지.
4. **4-1-C·5-x «바꾸지 말아야 할 것»** — 재설계에서 지켜야 할 것.
5. 나머지(0~5단계 본문)는 **실행할 때 해당 화면만** 펼쳐 보면 된다.

---

## ■ 문서 상태

| 단계 | 상태 | 산출물 |
|---|---|---|
| 0 앱 실행·화면 수집 | 완료 | 캡처 115장(`design_audit_captures/`), 못 캡처·못 재현 목록 |
| 1 현 상태 파악 | 완료 | 화면 실측(1-A) + 코드 인벤토리(1-B) + 대조표(1-C) |
| 2 레퍼런스 조사 | 완료 | 금융 6 + 금융 밖 5 + 첫 화면 11 + 2026 방향 11 + 기준선 6(2-8), 전부 독립 검증 |
| 2.5 테마 판정 | 완료 | **(a) 다크 유지 + 단일 다크의 의무 6항** |
| 3 평가 기준 | 완료 | 10개(표현층 3·기능 전달 2·식별성 1), 출처 24건 원문 검증 |
| 4 첫 화면 집중 감사 | 완료 | 기본기 10 + 첫인상 10 + 반복 사용 8 + 기능 노출 8 + 진입 상태 9 + 재설계 2안 |
| 5 전체 화면 감사 | 완료 | 화면별 15건 + 공통 결함 9종 + 화면별 «바꾸지 말아야 할 것» |
| 마무리 | 완료 | 바꾸지 말아야 할 것 · 기억되려면 · 범위 밖 관찰 · 확인하지 못한 것 · 효과가 큰 5가지 |
| **2차 검토(재평가)** | 완료 | 기준 10개 채점표(합격 0·불합격 8·미측정 2) · 동의/이견 · 감사에서 빠진 것 · 4단계 개선 로드맵 |

**이 세션에서 수정한 파일:** `DESIGN_REBUILD_AUDIT.md` 와 `design_audit_captures/` 뿐이다. 앱 코드·설정은 한 줄도 건드리지 않았다(절대 규칙 2).

**작성 주체 기록.** 0~4단계는 Fable 5.1 이 다중 에이전트로 발굴·검증하고 디렉터가 채택했다. 5단계와 이 마무리는 Fable 사용 한도 소진 후 **Opus 5 가 캡처·소스를 직접 열어 작성**했다. 두 구간의 검증 밀도가 다르므로(4단계는 지적마다 독립 반박 검증, 5단계는 디렉터 자체 확인) 등급 라벨을 그대로 신뢰할 것.
