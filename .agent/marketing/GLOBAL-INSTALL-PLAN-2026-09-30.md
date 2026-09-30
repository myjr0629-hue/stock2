# 전 세계 앱 설치 확대 계획 — 2026-09-30 (설치 성장 조사관)

> 대표 지시(9/30 11시대): «전방위로, 가장 이상적으로, 최신 마케팅 기술로 — 유입은 반드시 앱 설치여야 하고 극단적으로.»
> 이 문서는 **조사·초안까지**다. 게시·제출·계정 조작·광고비 집행은 하지 않았다(대표 몫과 위임 범위는 항목마다 적었다).
> 원장(`channels.json`)·`HANDOFF.md`·`GROWTH-DOCTRINE.md`·`research/INFLOW-MAX-2026-09-27.md`·스토어 표면 기록(`mkt/store-growth-0930` 브랜치 `store-surfaces/`)을 먼저 읽고, **이미 한 것·막힌 것은 다시 제안하지 않았다.** 바뀐 사실이 있으면 4절에 따로 적었다.
> 표기: [실측] = 오늘 직접 잰 값 · [공식] = 플랫폼 공식 문서 · [외부] = 제3자 보고서 · [추론] = 내 추정(근거와 계산을 같이 적음).

## 결론 네 줄
1. **원장이 «자격 없음»으로 닫아 둔 구글 Play 편집 노출에 공식 폼 두 개가 열려 있고, 우리 자격이 서류상 맞는다** — «Apps Innovation Corner»(미국 Play 홈 앱 탭, 분기 갱신)와 «Featuring Nomination»(출시 4개월 창 — SIGNUM 은 11/13까지). 둘 다 15~30분짜리 폼이다.
2. **애플 추천 7건 중 위젯 추천은 게재 시작일이 제출 이틀 뒤(애플 최소 2~3주)** — 날짜만 고쳐도 검토 대상이 된다. KR/JP 추천 문안은 1.10.0 승인 즉시 «위젯 출시»로 바꾼다.
3. **설치를 «확실히» 사는 길은 광고다** — 애플 JP CPA $3.32(최저)인데 교리 상한 $30/일의 1/5만 쓰는 중 → 상한 안 재배분 + 안드로이드 앱 캠페인 $10/일 2주 시험(대표 승인).
4. **AI 추천(GEO)은 «스토어 등록정보»와 «best X 목록»을 인용한다** — 구글 AI 개요(일본어)는 이미 SIGNUM 을 추천(옛 스토어 제목 덕분), 영어·한국어는 0 → 무빌드 문구·목록 제출로 잡는다. 그리고 **오늘이 안드로이드 개발자 인증 등록 마감**이다(0절).

---

## 0. 먼저 — 오늘(9/30) 마감인 위험 1건

**안드로이드 개발자 인증(Android developer verification) — 오늘이 Play 쪽 마감이다.**
- 구글 공식(2026-06 블로그): Play 개발자는 **«check your Play Console Home page to register any remaining apps by September 30, 2026 to avoid global removal from Google Play»**. 같은 날부터 **브라질·인도네시아·싱가포르·태국**에서 «App registration becomes required for participating stores» — 첫 단계 검사는 «We will begin by verifying app installations from the following stores»의 7곳(Google Play · Galaxy Store · Xiaomi GetApps · vivo V-Appstore · OPPO App Market · HONOR App Market · Transsion Palm Store)에서 받는 설치다. 2027년 이후 전 세계로 넓힌다. 출처: https://android-developers.googleblog.com/2026/06/android-developer-verification.html
- 대부분 자동 등록됐다고 하지만(«over 99% of their apps have been registered») **우리 3앱(SIGNUM·UC·WIM)이 등록됐는지는 확인한 기록이 없다.**
- 할 일(5분, 코디네이터): Play Console **홈** 화면에서 3앱의 «인증/등록» 상태를 눈으로 확인 → 미등록이면 그 화면에서 등록. (같은 글: «You can also use Play Console to register apps you distribute outside of Google Play».)
- 대체 스토어(갤럭시·GetApps·OPPO·vivo 등)에 올릴 APK 는 **Play 앱 서명 키로 서명된 범용 APK**(Play Console → App bundle explorer → 서명된 범용 APK)를 쓴다 — 등록은 패키지 + 서명 키 단위라, 다른 키로 서명하면 «미등록 앱»이 된다[추론: 등록 단위에 대한 해석].

---

## 기준선과 순위 매기는 법(참고)

| 무엇 | 값 | 출처 |
|---|---|---|
| iOS 최근 7일(9/22~28) | 검색 결과 카드 노출 2,939 → 제품 페이지 조회 68(2.3%) → 첫 다운로드 18(조회의 26%) | 대표 브리핑·`store-surfaces/2026-09-30-growth/RESULT.json` |
| Play 28일 | 탐색 노출 2,070 → 방문 29(1.4%) → 설치 클릭 6(21%) · 일반 검색어 14개 노출 0(브랜드만 1위) · 방문 국가 16개(인도 12·한국 10·미국 4·브라질 3…) | 같은 파일 |
| 신규 설치(RevenueCat) | SIGNUM 하루 약 5.4(9/20~26) · 아이폰 3.8/일·안드로이드 1.7/일(9/9~26) | `research/INFLOW-MAX-2026-09-27.md` |
| 애플 광고 | JP 9/29(UTC) $6.63 → 설치 2, CPA $3.32 · KR 9/19 CPA $10.26 · US 9/17 CPA $12.03 · 초기 7일 혼합 CPA $44~68(9/14~15) | 대표 브리핑·HANDOFF §3-61·`ADS-BASELINE.json`·메모리 |
| 평점 | iOS US 1·KR 3·나머지 0 / Play 5.0(6명) · Play 공개 페이지 «50+ Downloads» [실측] | 대표 브리핑·play.google.com 공개 페이지 |

**순위 점수 = 주당 기대 설치(중앙값) ÷ 수고.** 수고: 1 = 30분 안팎(대표 5분 이내) · 2 = 반나절 또는 대표 계정 1개 · 3 = 1~2일 또는 빌드 동반 · 5 = 여러 날 + 외부 심사.
피처링처럼 «되면 크고 안 되면 0»인 것은 **확률 × 피처링 시 주당 설치**로 가중했다(둘 다 [추론], 계산식을 항목에 적음). 참고로 피처링 효과의 공개 실측은 오래됐다 — Sensor Tower(2018): 오늘의 앱 다음 주 다운로드 +685%, 스토리 +222%, 리스트 +240%(https://techcrunch.com/2018/04/20/ios-11s-new-app-store-boosts-downloads-by-800-for-featured-apps).

---

## 1. 상위 15개 기회 (점수 순)

| # | 기회 | 어디 | 주당 기대 설치(중앙) | 수고 | 점수 | 누가 | 돈 |
|---|---|---|---|---|---|---|---|
| 1 | 애플 피처링 추천 정비 + 1월 신규 추천 | App Store 전역(KR·JP 우선) | 35 (확률 가중) | 1 | **35** | 에이전트(API) | 0 |
| 2 | Google Play «Apps Innovation Corner» 신청 | Play **미국 홈 앱 탭** | 30 (확률 가중) | 1 | **30** | 제출 1회(위임/대표) | 0 |
| 3 | Google 앱 캠페인(안드로이드 설치) 소액 시험 | US·JP·MX·PH·CA | 50 | 2 | **25** | 대표(계정·결제) + 에이전트 | $70/주 |
| 4 | 애플 광고 재배분 — 기존 상한 $30/일 안 | JP↑·KR 재가동·US 검색결과 | 12 | 1 | **12** | 대표 승인 1줄 + 에이전트 | ≤$210/주 |
| 5 | Google Play «Featuring Nomination» — 신규 출시 4개월 창 | Play US·KR·JP | 15 (확률 가중) | 2 | **7.5** | 제출 1회(위임/대표) | 0 |
| 6 | iOS 27 «검색 결과 크리에이티브 에셋» + 검색어별 CPP | App Store KR·JP·US | 8 | 2 | **4** | 에이전트 | 0 |
| 7 | 갤럭시 스토어(한국 우선) + 원스토어 | KR 안드로이드(+BR·IN 삼성) | 6 | 2 | **3** | 대표 로그인 1회 + 에이전트 | 0 |
| 8 | iOS 로케일 확장(en-GB 등) + 미국 교차 로케일 | IN·SEA·중동·UK·CA·AU + US | 3 | 1 | **3** | 에이전트(다음 빌드) | 0 |
| 9 | GEO — AI 답변이 인용하는 두 표면 공략 | EN·KO·JA AI 검색 | 5 | 2 | **2.5** | 에이전트 + 대표 로그인 1회 | 0 |
| 10 | 웹→앱: PC 착지·앱 전용 훅·대기 브랜치 | 자사 웹(from=home 1위) | 5 | 2 | **2.5** | 에이전트(위임 범위 배포) | 0 |
| 11 | 애플 광고 Basic — «설치당 상한가» 묶음 | en-GB 기본 스토어 + BR·MX | 5 | 2 | **2.5** | 대표(계정·결제) | ≤$150/월 |
| 12 | Product Hunt — 위젯 출시로 1회 | 글로벌(PC 비중 큼) | 5 | 2 | **2.5** | 대표(계정, 1주 전) + 에이전트 | 0 |
| 13 | 공유 루프 합치기(feat/share-loop) | 기존 사용자 → 지인 폰 | 2 | 1 | **2** | 에이전트(위임 범위 배포) | 0 |
| 14 | 인도·동남아 스토어: Indus + 샤오미 GetApps(+OPPO·vivo) | IN·ID·TH·VN·PH | 3.5 | 2 | **1.75** | 대표(가입·KYC) + 에이전트 | 0 |
| 15 | ChatGPT 앱 디렉터리(읽기 전용 MCP + 앱 링크) | ChatGPT 사용자 전역 | 2 | 5 | **0.4** | 대표(조직 인증) + 에이전트 | 0 |

> 1~5번만 합쳐도 중앙값으로 **주 +140 안팎**(지금 주 약 38) — 단 1·2·5번은 «선정되면»이라 분산이 크다. 확실하게 쌓이는 것은 3·4번(돈)과 6·8·10번(스토어·웹 전환)이다.

### #1 애플 피처링 추천 정비 + 1월 신규 추천 — 점수 35
- **어디**: App Store 전역, 편집 효과가 큰 KR·JP 우선(우리 UI 가 한·일 원어). iPhone.
- **근거 숫자**
  - [실측, ASC API 오늘 조회] 제출된 추천 7건. 그중 **`55c33c21`(«SIGNUM HQ 1.10 - Home Screen watchlist widgets», 12개 언어)의 게재 시작일이 2026-10-02 = 제출(9/30) 뒤 이틀**. 애플은 «minimum of two weeks notice»(https://developer.apple.com/app-store/getting-featured/)·도움말은 «minimum lead time of 3 weeks»(https://developer.apple.com/help/app-store-connect/manage-featuring-nominations/nominate-your-app-for-featuring/) → 그 날짜로는 검토 대상이 되기 어렵다.
  - [실측] **`111bf9bc`(KR/JP, 10/21~11/30)의 문안은 위젯을 «Coming next»로 적었다** — 1.10.0 승인 뒤엔 사실과 어긋난다. 나머지 NEW_CONTENT 3건(WIM·UC·SIGNUM 실적, 9/17 제출·10/06 시작 = 리드 19일)은 2주 기준을 넘으니 그대로 둔다.
  - [공식] 제출 뒤에도 «유형·관련 앱»만 못 바꾸고 나머지(날짜·문안)는 고칠 수 있다 · 인앱 이벤트는 «승인 또는 게시» 상태면 붙일 수 있고 «as early as possible» 권장(같은 도움말). 권장 리드 «up to three months in advance»(getting-featured).
  - [공식] 편집 기준에 «Localization: High-quality support for multiple languages with culturally relevant … content» — 한·일 원어 UI 는 우리 강점.
- **실행 단계**
  1. 오늘: `55c33c21` → `publishStartDate` 2026-10-21, `publishEndDate` 2026-12-31 (PATCH `/v1/nominations/{id}`). 문안 중 «My Watchlist now updates prices live inside the app»는 실시간 공용 연결이 운영에 들어가 있는지 확인하고, 아니면 그 줄을 뺀다(과장 금지).
  2. (확인만) 10/06 시작 3건은 손대지 않는다 — 게재 창이 이미 열리는 중이다.
  3. 1.10.0 승인 즉시: `111bf9bc` 문안 교체(초안 **§2-A-1**) → 위젯 인앱 이벤트(`release-1.10.0/event-widget-spec.json`) 생성·승인 → 두 추천에 연결(`scripts/asc_nomination.py` 재실행 — 같은 이름이면 이어 쓴다).
  4. **10/11까지 새 NEW_CONTENT 추천** «Q4 실적 시즌»(게재 2027-01-05~02-12, 초안 **§2-A-3**) — 1월은 «새해 돈 관리» 편성 시즌이고 대형 은행 실적으로 시즌이 열린다. 인앱 이벤트(최대 31일·14일 전 예고)는 12월에 만들어 연결.
- **누가**: 에이전트(ASC API — 대표 9/30 위임 범위). 대표 할 일 없음.
- **비용·위험**: 0. 편집 판단이라 결과 보장 없음. 문안은 사실만(예측·투자 권유 금지).
- **측정**: ASC 분석 소스별 «App Store 탐색» 노출·첫 다운로드(9/22~28 주 기준), 국가별 투데이·컬렉션 화면 캡처, RevenueCat KR·JP 일별 신규. **판정: 탐색 소스 첫 다운로드가 기준 주의 3배 이상이거나 편집 노출이 화면으로 확인되면 승.**
- **기대치 계산[추론]**: 8주 안 어떤 편집 노출 확률 ~10% × 노출 주 200~500설치 = 주 20~50(중앙 35).

### #2 Google Play «Apps Innovation Corner» — 점수 30 · **원장 «자격 없음» 재개**
- **어디**: Google Play **미국 홈 «앱» 탭**의 스타트업 컬렉션(분기 갱신). 안드로이드 미국.
- **근거 숫자**
  - [공식] «The collection would appear on the apps tab on the U.S. homepage and would be refreshed at least quarterly.» 자격: «team size 1-30 people … self-funded or has a small outside investment» · «user rating of 4.0 stars or higher» · «app launched no later than 2 years before submission date» · «developer based in the United States». 출처: https://support.google.com/googleplay/android-developer/answer/16412111?hl=en · 폼: https://support.google.com/googleplay/contact/indie_corners?hl=en
  - [실측] Play 공개 등록정보의 «About the developer» = 델라웨어 법인 **미국 주소**(오늘 play.google.com 확인) · Play 평점 5.0(콘솔) · 출시 2026-07-13 → 네 조건 모두 서류상 충족.
  - [실측] 우리 Play 미국 일반 검색 14개 노출 0 — 검색 밖에서 들어오는 문이 필요하다. 홈 앱 탭은 미국 Play 에서 가장 넓은 면.
- **실행 단계**: 폼 13칸(초안 **§2-B-2**) — App/Game=App · 회사명 · 팀 규모 · 외부 투자 «$0-$5M» · 연락처 · 앱 이름 · 패키지 `com.signumhq.app` · 단계 «Released» · 모델 «F2P» · 출시일 · 기기 Phone · «Other significant updates»(1.3.0 위젯) → 제출 → 확인 메일 → 분기 갱신 때 컬렉션(https://play.google.com/store/apps/streamchild/promotion_indie_apps_corner) 확인. WIM·UC 도 콘솔 평점이 4.0 이상이면 각각 제출 가능.
- **누가**: 제출 버튼 = 코디네이터(위임 범위, 구글 로그인 세션 필요) 또는 대표. 초안은 이 문서.
- **비용·위험**: 0. «미국 기반»을 운영 소재지로 해석하면 탈락 가능(손실 없음).
- **측정**: 컬렉션 포함 여부, Play Console «Google Play explore» 미국 노출·설치 클릭 급증. **판정: 포함되면 승.**
- **기대치[추론]**: 선정 20~30% × 선정 시 주 50~300 → 중앙 30.

### #3 Google 앱 캠페인(안드로이드 설치) 소액 시험 — 점수 25 · 대표 승인 필요
- **어디**: 구글 «금융 서비스 인증» 대상국 **밖**부터 — 미국·일본·멕시코·필리핀·캐나다.
- **근거 숫자**
  - [외부] Adjust «The finance app insights report: 2025 edition»(2025 상반기): 금융 앱 CPI 전 세계 $1.13 · 북미 $2.92 · APAC $0.51(인도 $0.18·필리핀 $0.25) · 중남미 $0.83(브라질 $0.59·멕시코 $0.83) · 사우디 $0.65 · 튀르키예 $0.32 · 프랑스 $5.37 · 독일 $7.71. 보도자료: https://www.morningstar.com/news/business-wire/20251029280342/new-adjust-report-finds-global-finance-app-market-shifting-from-rapid-expansion-to-sustainable-growth-in-2025 · 원문 PDF 사본: https://investgame.net/wp-content/uploads/2025/12/2025-12-17-finance-app-insights-report-2025.pdf
  - [공식] 구글 광고 금융 서비스 인증 대상국: 인도·브라질·인도네시아·한국·대만·태국·말레이시아·싱가포르·영국·호주·뉴질랜드·튀르키예·EEA 등(https://support.google.com/adspolicy/answer/12390454?hl=en). 인도 범위에 «Investment, brokerages & day trading» 포함(https://support.google.com/adspolicy/answer/15332527?hl=en&co=GENIE.CountryCode%3DIN) → 데이터 앱도 걸릴 수 있어 **처음엔 비대상국만**.
  - [실측] 안드로이드 신규 하루 약 1.7. Play 검색 순위는 평점·설치 수에 묶여 있다(메모리 play-broad-search-is-gated-by-ratings) — 설치가 늘어야 검색 문이 열린다.
- **실행 단계**
  1. 대표: Google Ads 계정(회사 contact@) 생성 + 결제수단 등록 → Play Console «연결된 서비스»에서 Google Ads 연결 승인.
  2. 에이전트: 앱 캠페인(설치) — 목표 CPI $1.00 · 일 $10 · 국가 US/JP/MX/PH/CA · 언어 en/ja/es · 텍스트 5줄×3언어 · 이미지 1200×628·1200×1200(운영 실화면 캡처, «보이는 영역» 게이트·예측 문구 0) · 동영상 소재는 없음(유튜브 채널 금지 원칙 유지).
  3. 중단 규칙[추론 기준]: 3일째 국가별 CPI > $2 → 그 국가 제외 · 7일째 D1 잔존 < 15% → 제외 · 2주 뒤 대표에게 결과 보고.
- **비용·위험**: $70/주. 저품질 설치(잔존 낮음) 위험 · 금융 광고 정책 거절 가능 · 광고 설치는 스마트링크 태그가 안 붙으므로 Google Ads·Play 획득 보고서로만 잰다.
- **측정**: Google Ads 설치·CPI, Play Console 획득 «Google Ads», RevenueCat 안드로이드 신규(국가별), Play D1/D7. **판정: 2주 평균 CPI ≤ $1.00 이고 D7 잔존 ≥ 10%면 증액 제안, 아니면 중단.**
- **기대치[추론]**: $70 ÷ CPI $0.7~2.0 = 주 35~100(중앙 50). 벤치마크는 대형 광고주 평균이라 신규 앱은 더 비쌀 수 있다.

### #4 애플 광고 재배분 — 기존 상한 $30/일 안 — 점수 12 · 대표 승인 1줄
- **어디**: JP 증액 · KR 재가동 · US 검색 결과(검색 탭은 계속 0).
- **근거 숫자**: [실측] JP CPA $3.32(9/29, 설치 2) · KR $10.26(9/19) · US $12.03(9/17) · 초기 혼합 $44~68 · 지금 실지출은 JP 하루 $6 안팎(교리 상한 $30의 약 1/5). [외부] AppTweak 2025 미국 금융: CPT $4.17 · CPI $9.65 · 탭→설치 50.7%(https://www.apptweak.com/en/aso-blog/apple-ads-benchmarks) · Adapty 2026 국가별(전 카테고리) CPA: 미국 $2.51 · 영국 $2.02 · 일본 $1.49 · 캐나다 $1.58 · 호주 $1.89(https://adapty.io/blog/apple-ads-benchmarks-2026/).
- **실행 단계**: JP 일 $5→$10 · KR $10 재가동(광고 변형 = CPP «ko naver»(키워드 «미장»)) · US 검색 결과 $10(광고 변형 = 키워드 CPP `4043aec3`) · 입찰 $2 캡 유지(교리 §13) · 7일 뒤 CPA > $25 캠페인 정지.
- **누가**: 대표 «상한 안에서 재배분 승인» 한 줄 → 설정은 에이전트(광고 콘솔 세션 필요).
- **비용**: 최대 $210/주(상한 그대로 — 증액 아님, 실지출 증가).
- **측정**: 콘솔 캠페인별 설치·CPA(오늘 기간으로 고정해 읽기). **판정: 7일 혼합 CPA ≤ $15 이고 주 10설치 이상.**
- **기대치[추론]**: CPA $15~30 → 주 7~20(중앙 12).

### #5 Google Play «Featuring Nomination» — 신규 출시 4개월 창 — 점수 7.5 · **원장 «자격 없음» 재개**
- **어디**: Google Play US·KR·JP(폼에서 지역·언어 선택).
- **근거 숫자**: [공식] 폼(https://support.google.com/googleplay/contact/featuring_review?hl=en): 앱은 «Should be launched within 4 months of your desired featuring date» · «Minimum Rating Requirements for featuring is 3.0 or higher» · «Simultaneously launch your app across key mobile platforms» · «minimum of three weeks ahead (eight weeks for newly launched apps)» · «APK/AAB must be available in Play Console». 원장이 본 구글 가이드의 폼(forms.gle/S7JFv…)은 유료 앱 할인용이 맞다 — **이 폼은 별개**다.
  - [실측] SIGNUM 안드로이드 출시 2026-07-13(iOS 7/9 승인 — 사실상 동시) → **희망 피처링일 ≤ 2026-11-13.** 오늘 + 3주 = 10/21 → 창이 열린 마지막 달. «8주» 조항을 신규 출시 전체에 적용하면 11/25가 돼 창 밖이다 — 해석이 갈리지만 **손실 없는 시도**. WIM(7/28 출시)은 11/28까지.
- **실행 단계**: ① 에이전트가 피치덱 PDF 5장(문제·위젯·현지화·지표·로드맵) 제작 → 공개 링크(자사 웹 또는 GitHub Pages; 구글 드라이브 «선호»일 뿐 필수 아님) ② 폼 작성(초안 **§2-B-1**, 선호 언어 영어 — 한국어·일본어도 선택 가능) ③ 희망일 11/9~11/13 ④ 늦어도 **10/23 제출**(권장 이번 주).
- **누가**: 제출 = 코디네이터(위임 범위) 또는 대표. 리텐션(D1·D7·D30)은 Play Console 값을 그 자리에서 입력.
- **비용·위험**: 0. 규정 해석상 제외될 수 있음.
- **측정**: Play Console explore 노출·설치 급증, 편집 노출 화면 확인.
- **기대치[추론]**: 5% × 주 300 = 15.

### #6 iOS 27 «검색 결과 크리에이티브 에셋» + 검색어별 CPP — 점수 4
- **어디**: App Store KR·JP·US 검색 결과(iOS 27 이상 사용자).
- **근거 숫자**: [실측] 우리 병목 = 검색 결과 카드(노출→조회 2.3%). [공식] «Creative assets appear across the App Store in iOS 27 … including your product page, in search results» · 제출은 «alongside a new app version, or in your Asset Library» · «Use creative assets on your custom product pages» · «must meet a 4+ age rating»(https://developer.apple.com/app-store/asset-best-practices/). CPP 앱당 70개·키워드 지정 시 그 검색 결과에 기본 페이지 대신 노출(https://developer.apple.com/app-store/custom-product-pages/). 주간 학습(9/29) 1번과 같은 레버인데 «Asset Library 메뉴 확인» 이후 실행 기록이 없다.
- **실행 단계**: ① ASC 웹에서 Asset Library 메뉴 확인(웹 세션) ② 애플 템플릿으로 KR·JP·EN 검색 결과 에셋(정적 이미지) — 첫 장 = 내 종목 위젯/옵션 지도 실화면(게이트 통과 종목만) ③ Asset Library 단독 심사 제출 ④ 이미 이긴 검색어에 맞춘 CPP 3개: KR «실적발표일정·기업실적·증시캘린더»(#1 문), JP «決算カレンダー·決算発表», US «premarket·0dte» — 키워드 조합은 페이지마다 하나 ⑤ 7일 비교.
- **누가**: 에이전트(제출 = 위임 범위).
- **비용·위험**: 0. 정확한 픽셀 규격은 템플릿으로 확인해야 한다(문서에 수치 없음).
- **측정**: ASC 노출→조회율 2.3% → **3.0% 이상(7일)** · CPP별 첫 다운로드(5건부터 표시).
- **기대치[추론]**: 조회율 +0.7%p × 주 노출 2,939 × 조회→다운로드 26% ≈ 주 +5, 에셋·CPP 합쳐 5~15(중앙 8).

### #7 갤럭시 스토어(한국 우선) + 원스토어 — 점수 3
- **어디**: 한국 안드로이드(삼성 비중 큼), 이어서 삼성 비중 큰 브라질·인도.
- **근거 숫자**: [실측·원장] 셀러 계정·Developer API 살아 있음, Commercial 승격 신청 9/18 제출, 등록 앱 0, 포털 세션 만료. [공식] 갤럭시 스토어는 개발자 인증 7개 참여 스토어(위 0절). [공식] 삼성 블로그 «Integrating RevenueCat with Samsung In-App Purchase»(2026-08-13, https://developer.samsung.com/galaxy-store/blog/en/2026/08/13/integrating-revenuecat-with-samsung-in-app-purchase-for-galaxy-store-applications) — 우리 결제 구조(RevenueCat)로 구독도 붙일 길이 있다. 한국은 신규 설치 2위 국가(RevenueCat 9/8~27, 33건)인데 한국 안드로이드는 Play 검색에서 막혀 있다.
- **실행 단계**: ① 대표: seller.samsungapps.com 삼성 계정 로그인 1회 → Commercial 상태 확인 ② 에이전트: Play 서명 범용 APK 업로드 · 등록정보 ko/en/ja(Play 재사용, «미국주식» 붙여쓰기) · 첫 판은 무료+광고(구독 노출 정책 확인 뒤 Samsung IAP 연동) ③ 원스토어는 대표 개발자 등록 뒤 같은 절차(원장 `onestore`).
- **비용·위험**: 0. 스토어 결제 정책 때문에 구독 버튼 분기가 필요할 수 있다(빌드).
- **측정**: 셀러 포털 다운로드(스토어 설치라 from 태그 불가). **판정: 4주 누적 30설치 이상이면 유지·확대.**
- **기대치[추론]**: 주 3~15(중앙 6).

### #8 iOS 로케일 확장(en-GB·en-AU·en-CA) + 미국 교차 로케일(ar·zh-Hans·ru) — 점수 3
- **어디**: en-GB 가 «기본 언어»인 인도·싱가포르·인도네시아·필리핀·베트남·태국·말레이시아·UAE·사우디·튀르키예·나이지리아·남아공·영국 + 미국.
- **근거 숫자**: [공식] 애플 표(https://developer.apple.com/help/app-store-connect/reference/app-store-localizations/): **en-GB 는 위 13개국의 기본 언어**이고 한국·브라질·멕시코·독일·프랑스·홍콩·대만·스페인·이탈리아·네덜란드·스웨덴·스위스·아르헨티나·칠레·콜롬비아·호주·뉴질랜드의 추가 언어 · **미국 추가 언어 = 아랍어·중국어(간체·번체)·프랑스어·한국어·포르투갈어(BR)·러시아어·스페인어(MX)·베트남어** · 일본 = 일본어 + 영어(미국). [외부] 교차 로케일 키워드는 그 스토어 검색에 쓰이되 «로케일끼리 단어를 조합하지 않는다»(https://aso.dev/metadata/cross-localization/ · https://www.mobileaction.co/blog/app-store-cross-localization/). [실측] 우리 12개 로케일에 en-GB·en-AU·en-CA·ar·zh-Hans·ru 없음. Play 방문 1위가 인도인데, iOS 인도 스토어는 en-GB 가 없어 기본 문구(영어-미국)로 대신 표시된다[추론: 애플 대체 표시 규칙].
- **실행 단계**: 다음 iOS 버전에 ① `store-surfaces/2026-09-30-growth/ios-next-locales-proposal.json`(en-GB·en-AU·en-CA) 적용 — en-GB 문구는 «US stocks / Wall Street overnight» 틀(인도·동남아는 미국 시장을 «남의 나라 장»으로 찾는다) ② ar·zh-Hans·ru 로케일에 **영어** 이름·부제·키워드(미국용 롱테일: «options flow app·max pain·dark pool·stock widget» — 이름·부제와 겹치는 토큰 금지) ③ 적용 전 `aso-thin-door.js` 에 gb·in·sg·au·ca 추가해 순위 실측.
- **누가**: 에이전트(메타데이터 — 버전 게이트라 다음 빌드와 함께).
- **비용·위험**: 0. 러·아랍·중국어(간체) 기기 사용자에게 영어가 보인다(영어 앱이라 허용 범위).
- **측정**: ASC 국가별 노출(IN·SG·PH·GB·CA·AU) 4주 전후 · 미국 롱테일 검색 순위.
- **기대치[추론]**: 주 2~6(중앙 3).

### #9 GEO — AI 답변이 인용하는 «두 표면»을 잡는다 — 점수 2.5
- **어디**: 구글 AI 개요·빙(코파일럿)·퍼플렉시티·ChatGPT(빙 색인) — 영어·한국어·일본어.
- **근거 숫자 — 오늘 실측(비로그인 우선, 원자료 `~/Documents/signum-work/2026-09-30/growth/geo/`)**

| 질의 | 엔진 | 추천된 앱 | 인용 출처 | SIGNUM |
|---|---|---|---|---|
| best options flow app | 구글 AI 개요 | Unusual Whales · Cheddar Flow · BullFlow · BlackBoxStocks | unusualwhales.com 자사 비교 페이지 · tradealgo · tradeecho(경쟁사 제작) · aistockpickerapps · robinflow · pineify · r/options | 없음 |
| best options flow app | 빙 코파일럿 답변 | Cheddar Flow · FlowAlgo · Unusual Whales · BlackBoxStocks · Optionsonar | 각 사 사이트 · optionstrading.org · bestfinancesites.com | 없음 |
| 옵션 플로우 앱 추천 | 구글 AI 개요 | ImpliedOptions · RowFlow · OptionsFlow · ADVFN | **Google Play·App Store 등록정보** | 없음 |
| 米国株 オプション 分析 アプリ おすすめ | 구글 AI 개요(«개인화 안 됨» 표시) | moomoo証券 · TradingView · **SIGNUM HQ(3번째)** | **우리 App Store 일본 페이지**(색인된 제목이 옛 이름 «SIGNUM HQ: 米国株オプション分析アプリ», 표기 날짜 2026/08/24) | **있음** |
| 米国株 オプション 分析 アプリ おすすめ | 퍼플렉시티(비로그인) | moomoo証券 · 株オプション取引アプリ · BBAE | App Store·Play 등록정보 | 없음 |
| best options flow app / 옵션 플로우 앱 추천 | 퍼플렉시티(비로그인) | 답변 거부 — «가입한 뒤 요청을 다시 보내주세요» | — | 측정 불가 |

  - 뜻: **«앱 추천» 질문에서 AI 는 (1) 스토어 등록정보 페이지와 (2) «best X» 목록 페이지를 인용한다.** 일본어는 우리 스토어 제목이 질의와 같아서 이미 인용됐다. 그런데 **지금 ja 이름은 «米国株リアルタイム決算», 부제에도 オプション 이 없다** → 구글이 다시 긁으면 그 인용 근거가 약해진다.
  - [외부] 2026-06 대규모 측정: «best-of» 목록이 AI 인용의 약 21%, 소형 브랜드의 AI 답변 등장률 11%(https://arxiv.org/abs/2606.20065) · ChatGPT 인용의 87%가 빙 상위 10과 일치(https://www.seerinteractive.com/insights/87-percent-of-searchgpt-citations-match-bings-top-results) · [공식] 구글: «You don't need to create new machine readable files, AI text files, or markup to appear in these features»(https://developers.google.com/search/docs/appearance/ai-features).
- **실행 단계(빌드 없는 것부터)**
  1. iOS 홍보문구(170자, 무심사) en/ko/ja 첫 문장을 질의 그대로(초안 **§2-D**) — 애플 검색은 홍보문구를 색인하지 않으니 애플 순위 손실 없음.
  2. Play 전체 설명 첫 줄 같은 원칙(짧은 설명의 «무료·가격 표현 금지»는 유지).
  3. 다음 iOS 버전: ja 설명 첫 줄에 «米国株オプション分析アプリ»(설명도 애플 검색 비색인), ko 에 «미국주식 옵션 플로우 앱», en 에 «options flow app».
  4. **aistockpickerapps.com «Submit a Tool»** — 구글 AI 개요가 «best options flow app» 답에 인용한 사이트이고 «AI Options Tools»·«Free Tools» 분류가 있다(https://aistockpickerapps.com/submit). 제출문 초안 §2-D.
  5. 자사 비교 페이지 3언어(«Options flow apps compared, 2026»/«옵션 플로우 앱 비교»/«米国株 オプション分析アプリ比較») — 공개 가격·무료 등급·플랫폼 표, 날짜 표기, «이 페이지는 SIGNUM HQ 가 만들었다» 고지(tradeecho 가 같은 방식으로 인용되고 있다), 비방·순위 조작 없음. 운영 배포는 위임 범위.
  6. 빙 웹마스터 도구 — 대표 contact@ 로그인 1회(원장 `bing_webmaster`) → GSC 가져오기·사이트맵.
  7. 월 1회 같은 6개 질의 재실측(스크립트 `geo/geo-check*.mjs`).
- **누가**: 에이전트(1·2·3·5·7) · 대표(6 로그인) · 4는 외부 양식 제출 = 코디네이터(위임) 또는 대표.
- **비용·위험**: 0. 비교 페이지는 사실·날짜·고지로 공정성 유지.
- **측정**: 같은 질의에서 SIGNUM 언급 수(엔진별), ASC «웹 추천» 소스, 스마트링크 from 태그(비교 페이지 CTA `from=compare`). **판정: 8주 안에 영어·한국어 질의 중 1개 이상에서 SIGNUM 이 답에 등장.**
- **기대치[추론]**: 4~8주 뒤 주 2~8(중앙 5).

### #10 웹→앱: PC 착지·앱 전용 훅·대기 브랜치 — 점수 2.5
- **어디**: 자사 웹(from=home 유입 1위, 폰 80%) + 소셜에서 온 PC 방문(78~81%).
- **근거 숫자**: [실측·기록] PC→폰 QR 넘겨주기 1/315 · 오늘 스마트 앱 배너 `<head>` 고정·평점 요청 운영 반영 · `fix/home-hero-smartlink`(첫 CTA 배지가 스토어 직링크라 from·Play 리퍼러 누락) **미합침**. [실측] 지금 PC 착지(/app, 데스크톱)는 «QR + 스토어 바로 열기» 뿐 — 안드로이드 사용자가 **PC 에서 바로 폰에 설치할 수 있다는 안내가 없다.** [공식] 구글: PC 브라우저의 play.google.com 에서 «Install → 기기 선택»으로 폰에 설치(https://support.google.com/googleplay/answer/14274288?hl=en). [공식·외부] 안드로이드 인스턴트 앱은 2025-12 종료(https://www.androidauthority.com/google-killing-android-instant-apps-3567211/) — «설치 없이 맛보기» 길은 없다.
- **실행 단계**: ① `fix/home-hero-smartlink` 최신 main 합치기 → 실화면 확인 → 배포(위임 범위) ② PC /app: 안드로이드 버튼 문구를 «PC에서 Google Play 열기 → [설치] → 내 휴대폰 선택»으로 + 메신저 «나에게 보내기» 버튼(LINE Keep·WhatsApp «나에게»·Telegram «저장한 메시지» — 공유 URL 만, 개인정보 수집 없음; 카카오 «나와의 채팅»은 SDK 키 필요라 2차) + 버튼별 태그 ③ 종목 페이지 CTA 에 오늘 출시된 앱 전용 기능을 박는다: «이 종목을 홈 화면 위젯으로 — 앱 전용» ④ 다음 안드로이드 빌드: Play 설치 리퍼러에 종목을 실어 «설치 직후 그 종목 자동 담기»(제3자 없이 되는 지연 딥링크).
- **누가**: 에이전트(브랜치 → 실화면 검증 → 배포, 위임 범위).
- **비용·위험**: 0. 카카오는 앱 키 발급(대표 계정)이 필요해 뒤로.
- **측정**: PC /app 방문 대비 버튼별 클릭 → 같은 태그의 폰 도착, Play «웹사이트» 획득, from=home iOS 탭. **판정: PC 착지의 폰 전환 0.3% → 2% 이상.**
- **기대치[추론]**: 주 3~10(중앙 5).

### #11 애플 광고 Basic — «설치당 상한가»로 영어권·아시아 스토어 묶음 — 점수 2.5 · 대표(계정·결제)
- **근거 숫자**: [공식] «Pay only for installs at a price you set» · 월 한도 «$10,000 (U.S.) per app, per month» · 캠페인당 최대 60개 국가·지역(https://ads.apple.com/app-store/help/apple-ads-basic/0039-promote-an-app-with-basic · https://ads.apple.com/app-store/basic). en-GB 기본 스토어들(8번)에 지금 광고 0. Advanced 계정과 같은 앱을 병행할 수 있는지는 문서에 없다 → 콘솔에서 확인.
- **실행 단계**: 대표 ① Basic 캠페인 생성 가능 여부 확인·결제 ② 최대 CPI $1.50~2.00 · 월 $150 · 국가 IN·SG·PH·MY·AE·SA·GB·CA·AU·NZ·ZA·NG·BR·MX. 에이전트 ③ 주 1회 설치·CPI 기록.
- **비용·위험**: 월 $150 이내, 설치가 없으면 0원(상한가 아래로는 집행 안 됨).
- **측정**: Basic 대시보드 설치·CPI, RevenueCat 국가별 iOS 신규. **판정: 4주 누적 40설치 이상.**
- **기대치[추론]**: 주 0~20(중앙 5).

### #12 Product Hunt — 위젯 출시로 한 번 — 점수 2.5
- **근거**: 원장 `producthunt` 규칙 실측(메이커 계정은 런치 약 1주 전부터 있어야 함, 태그라인 60자, 6개월 내 재런치는 «메이저 업데이트» 심사). 준비물(스크린샷·OG·태그라인) 있음. 한계: 청중이 PC 중심 → 설치 전환은 제한적(우리 소셜 클릭 78~81% PC).
- **실행**: 대표 메이커 계정 생성(오늘) → 1주 뒤 위젯 출시 런치(태그라인 예: «Your US-stock watchlist, mapped by the options market»), 링크는 스마트링크 `from=producthunt` 한 개, 런치 페이지 첫 이미지를 **QR 이 든 폰 화면**으로.
- **누가**: 대표(메이커 계정 생성 — 계정 생성은 대표 몫) · 에이전트(런치 페이지·이미지·첫 댓글 초안).
- **비용·위험**: 0. 규칙: 태그라인 과장·이모지 금지, 6개월 안 재런치 제한 — 한 번에 제대로. 예측·수익 암시 문구 금지.
- **측정**: from=producthunt 폰 클릭, RevenueCat 당일·익일 신규. **판정: 런치 48시간 신규 20 이상.** **기대치[추론]**: 1회 10~40 → 월 평균 주 5.

### #13 공유 루프 합치기(`feat/share-loop`, 대표 할 일 66) — 점수 2
- **근거**: 브랜치 준비 완료(9/29, 앱 4화면 공유 → 받은 사람용 공개 페이지 → 스마트링크 `from=share`). 메신저로 받은 링크는 폰에서 열린다[추론] — PC 문제를 비껴가는 몇 안 되는 경로.
- **실행**: 최신 main 합치기 → 실화면(iOS 공유 시트 «복사» 링크 포함 확인) → 배포(위임 범위).
- **누가**: 에이전트(대표 9/30 위임 — 배포는 실화면 검증 뒤).
- **비용·위험**: 0. 공유 문구에 수치를 넣을 땐 «보이는 영역» 게이트 통과 종목만.
- **측정**: `mkt:attr:hit:share` 폰 클릭, 기기별 · RevenueCat 신규. **판정: 2주에 from=share 폰 클릭 10 이상.** **기대치[추론]**: 주 1~5(중앙 2).

### #14 인도·동남아 안드로이드 스토어: Indus Appstore + 샤오미 GetApps(+OPPO·vivo 후순위) — 점수 1.75
- **근거 숫자**: [외부·공식] Indus: 등록 무료·국가 무관·첫해 등재 무료(이후 소액 연회비)·인앱 결제 수수료 0(https://www.phonepe.com/press/phonepe-announces-the-launch-of-the-indus-appstore-developer-platform/), 1억 기기(2026-01, https://indianstartupnews.com/article/why-indian-app-developers-are-ditching-old-school-app-stores-for-phonepes-indus-appstore-10975905), 발행 전 신분·주소·사업 증빙(https://developer.indusappstore.com/web/developer-policy). GetApps: 인도·인니 등 MAU 2억+, 9/30부터 실명 인증(https://global.developer.mi.com/ · https://en.xiaomi-miui.gr/xiaomi-getapps-developer-verification-2026/). OPPO: 무료·해외 개발자 가능(https://developers.oppomobile.com/) · vivo: 법인은 사업자 서류 또는 Play Console 앱 목록 캡처(https://developer.vivo.com/). [실측] Play 방문 1위 인도(12/42).
- **실행**: 대표 가입·KYC(각 10~20분) → 에이전트 Play 서명 범용 APK·영어 등록정보(인도 = 영어, «US stocks» 틀). GetApps·OPPO·vivo 는 인도네시아·태국 설치 검사 대상 스토어(0절)라 서명 키 일치가 필수.
- **누가**: 대표(계정 생성·신분/사업 증빙 업로드) · 에이전트(업로드·등록정보·스크린샷).
- **비용·위험**: Indus 2년차 연회비(금액 비공개). 우리 앱의 인도 수요 근거는 방문 12명뿐 — Indus 1곳부터 작게 시작하고 4주 결과로 GetApps 여부를 정한다.
- **측정**: 각 스토어 콘솔 다운로드. **판정: 4주 누적 20설치 이상이면 다음 스토어로 확대.** **기대치[추론]**: 스토어당 주 1~5.

### #15 ChatGPT 앱 디렉터리 — 읽기 전용 «종목 옵션 지도» + 앱 링크 — 점수 0.4(전략 과제)
- **근거**: [공식] 2025-12-17부터 앱 제출·심사·디렉터리(https://openai.com/index/developers-can-now-submit-apps-to-chatgpt/) · 가이드라인: 거래 실행 금지, 구독 권유 금지(요금 «정보 페이지 링크»는 가능), 인증된 개인·조직만(https://developers.openai.com/apps-sdk/app-submission-guidelines).
- **실행**: 설계서(무료 공개 데이터 — 맥스페인·콜월·풋플로어·다크풀 비율·실적일, 답에 «앱에서 위젯으로 보기» 링크) → MCP 서버(읽기 전용) → 개인정보 문단 → 대표 OpenAI 조직 인증 → 제출. 1분기 과제.
- **누가**: 대표(OpenAI 플랫폼 조직 인증 — 신분 확인) · 에이전트(설계·서버·심사 자료).
- **비용·위험**: 서버 운영비 소액. 투자 권유로 읽히는 답 금지(도구는 수치·정의만 돌려준다), 구독 권유 금지(가이드라인).
- **측정**: 디렉터리 등재 여부, 도구 호출 수, 앱 링크 `from=chatgpt` 폰 클릭. **판정: 등재 후 4주에 폰 클릭 20 이상.**
- **기대치[추론]**: 수개월 뒤 주 0~20(중앙 2).

---

## 2. 피처링 — 공식 경로·양식·마감·요건·제출 문안

### 2-0. 한눈 표

| 경로 | 공식 URL | 대상·요건 | 마감·리드 | 우리 상태 |
|---|---|---|---|---|
| 애플 Featuring Nominations | https://developer.apple.com/app-store/getting-featured/ · https://developer.apple.com/help/app-store-connect/manage-featuring-nominations/nominate-your-app-for-featuring/ | 유형 3개(App Launch·App Enhancements·New Content) · 역할 Account Holder/Admin/App Manager/Marketing · 보충 URL 5개 · 관련 앱 10개 · 인앱 이벤트(승인·게시 상태) 연결 · 설명 1000자(우리 실측) | 최소 2주(개발자 페이지)·3주(도움말), 최대 3개월 전 권장 | 7건 제출 — 날짜·문안 정비 필요(#1) |
| 구글 Play Featuring Nomination | https://support.google.com/googleplay/contact/featuring_review?hl=en | 앱: 희망일 4개월 이내 출시 · 평점 3.0+ · 동시 출시 · APK/AAB 콘솔 · 피치덱 링크 | 3주 전(신규 출시 8주) | **미제출 — SIGNUM 창 11/13까지** |
| 구글 Play Apps Innovation Corner | https://support.google.com/googleplay/contact/indie_corners?hl=en · https://support.google.com/googleplay/android-developer/answer/16412111?hl=en | 팀 1–30·자기자본/소액 투자·평점 4.0+·출시 2년 이내·미국 기반 개발자 · 미국 홈 앱 탭·분기 갱신 | 상시(분기 갱신) | **미제출 — 자격 서류상 충족** |
| 구글 Play 프로모션 콘텐츠 | https://support.google.com/googleplay/android-developer/answer/12932541?hl=en | 앱은 «Premium growth tools» 자격(예: 3개월 MAU 160만+ 등, https://google.play/business/guides/premium-growth-tools/) | — | 불가(원장 그대로) |
| 구글 Play Apps Accelerator | https://android-developers.googleblog.com/2025/10/grow-your-app-with-google-play-apps.html | 12주 멘토링 | 2026 기수 마감 2026-01-07, 3월 시작(https://android-developers.googleblog.com/2026/03/meet-class-of-2026-for-google-play-apps.html) | 다음 모집 공고 대기(작년은 10월 공고) |

### 2-A. 애플 — 제출 문안

**A-1. `111bf9bc`(KR/JP) 교체 문안 — 1.10.0 승인 직후 (영어로 제출, 약 900자)**
```
My Watchlist (Korean: 내 종목, Japanese: マイ銘柄) turns a plain price list into an options map for every US stock you follow. With version 1.10 it also lives on the Home Screen.

- Home Screen widgets in small, medium and large sizes. Medium and large show where each price sits between its put floor, max pain and call wall, without opening the app.
- One tap on the gold heart adds a stock. Each row adds the one fact that matters today: an earnings date, new whale options or a gamma flip crossing.
- No account: the list stays on the device. Free for 5 stocks; PRO holds up to 100.
- Labels, explanations and the daily AI market brief are written natively in Korean and Japanese, for investors who follow the US session during their night.

In-App Events: "My Watchlist" (Major Update) and "Watchlist Widgets".

Options positioning is usually sold as a professional data subscription. SIGNUM HQ shows it free, in the reader's language.
```
한국어(내부 확인·현지 자료용):
```
내 종목은 평범한 가격 목록을, 관심 있는 미국 종목마다 «옵션 지도»로 바꿉니다. 1.10 부터는 홈 화면에도 있습니다.
- 홈 화면 위젯 소·중·대. 중·대형은 종목마다 가격이 풋 플로어·맥스페인·콜 월 사이 어디쯤인지 앱을 열지 않아도 보여 줍니다.
- 금색 하트 한 번으로 담습니다. 행마다 오늘 볼 한 가지 — 실적일, 새 고래 옵션, 감마 플립 통과 — 가 붙습니다.
- 가입 없이, 목록은 이 폰에 저장. 5종목 무료, PRO 는 100종목.
- 용어·설명·매일 아침 AI 시장 브리핑을 한국어와 일본어로 처음부터 썼습니다 — 밤에 미국장을 보는 투자자를 위해.
옵션 포지셔닝은 보통 전문가용 유료 데이터입니다. SIGNUM HQ 는 그것을 읽는 사람의 언어로, 무료로 보여 줍니다.
```
日本語:
```
マイ銘柄は、ただの株価リストを、フォローする米国株ごとの「オプションの地図」に変えます。バージョン1.10からはホーム画面にも。
・ホーム画面ウィジェット（小・中・大）。中・大サイズは、株価がプットフロア・マックスペイン・コールウォールの間のどこにあるかをアプリを開かずに表示。
・金色のハートをひとタップで追加。各行に今日見るべき一点（決算日、新しい大口オプション、ガンマフリップの通過）。
・アカウント不要、リストは端末に保存。5銘柄まで無料、PROは100銘柄まで。
・用語・解説・毎朝のAIマーケットブリーフは日本語と韓国語でゼロから作成 — 夜に米国市場を追う投資家のために。
オプションのポジショニングは通常、プロ向けの有料データです。SIGNUM HQはそれを読み手の言語で、無料で届けます。
```

**A-2. `55c33c21`(위젯, 12개 언어)** — 문안 유지, **날짜만** `publishStartDate` 2026-10-21 · `publishEndDate` 2026-12-31. «My Watchlist now updates prices live inside the app» 줄은 운영 실측으로 사실일 때만 남긴다.

**A-3. 신규 NEW_CONTENT — «Q4 실적 시즌»(10/11까지 제출, 게재 2027-01-05~02-12)**
- 이름: `SIGNUM HQ — Q4 earnings season on your Home Screen (EN/KO/JA)`
```
The fourth-quarter earnings season opens in mid-January with the large US banks. SIGNUM HQ turns it into a daily glance for people who follow US stocks:

- An earnings calendar in English, Korean and Japanese: each report's date, whether it lands before the open or after the close, and what to watch on the day.
- My Watchlist shows each stock's next earnings date on its row and on the Home Screen widget, next to where the options market is positioned (put floor, max pain, call wall).
- A morning AI brief summarises what moved after the previous session's reports.

The In-App Event "Q4 Earnings Season" will run for 31 days from the first major bank report. No account is needed; the app is free, with an optional ad-free subscription.
```
- 보충 URL: 3언어 how-it-works/watchlist + 실적 캘린더 페이지(en/ko/ja). notes: «Priority: high. Localization: native KO/JA UI for investors who follow the US session at night.»
- 인앱 이벤트 문안(12월 생성): en «Q4 Earnings Season» / ko «4분기 실적 시즌» / ja «第4四半期 決算シーズン»(30자 이내), 짧은 설명 en «Earnings dates for your watchlist, on one screen» / ko «내 종목 실적일을 한 화면에서» / ja «マイ銘柄の決算日をひとつの画面で». deepLink 에 `?from=iap_event_q4` 를 **생성 시점에** 넣는다(승인 후 잠김 — 원장 교훈).

### 2-B. 구글 — 제출 문안

**B-1. Featuring Nomination (SIGNUM, 영어 — 한국어·일본어 선택 가능)**
- App · 최소 요건 충족 Yes · New launch **Yes**(출시 2026-07-13) · Families No
- Company: Signum Hq, LLC · Contact: (대표 이름) · Email: contact@signumhq.com · 선호 언어: English
- App name: SIGNUM HQ · Package: com.signumhq.app · Channel: Production · Version code: (1.3.0 의 코드 — 콘솔 값)
- Desired feature date: **2026-11-09** · Device: Phone · Regions: Americas(US) · Asia Pacific(KR·JP) · Languages: English·Korean·Japanese
- Launch date: 2026-07-13(시각·시간대는 콘솔 출시 기록대로 입력) · SimShip(iOS 2026-07-09 승인)
- **Why featuring matters now**:
```
SIGNUM HQ launched on Google Play on July 13, 2026. Version 1.3.0, released this week, adds My Watchlist with a home screen widget: tap the gold heart on any US stock and the widget shows its price and where it sits between the options market's put floor, max pain and call wall. Retail investors usually pay a professional subscription for this data; we show it free, with no account, and the list stays on the device. The app is written natively in English, Korean and Japanese for people who follow the US session during their night. Roughly half of our Android installs so far come from our own website and links rather than from Play itself; editorial visibility during the launch window would let Play users discover the app directly.
```
- **Success reasoning**:
```
Rated 5.0 on Google Play by early users; the in-app rating prompt appears only after a success moment, through the official API. Store listing visitors came from 16 countries in the last 28 days. The daily content (AI market brief, earnings calendar, options levels for 2,000+ US tickers) refreshes every trading day, so there is a reason to open the app every morning, and the widget keeps it on the home screen.
```
- **Marketing/UA plan**(사실만 — 승인 전 예산은 쓰지 않는다):
```
Always-on content in English, Korean and Japanese (Bluesky, Threads, note, Naver Blog, X), 6,700+ daily-updated ticker pages on signumhq.com with store links, Apple Search Ads under a fixed daily cap, and an Android app-install campaign test in November if approved.
```
- Pitch materials: 피치덱 PDF 공개 링크(에이전트 제작) · Soft launch 칸: Play Console D1/D7/D30 값 입력 · 수익 모델: $0 upfront + Ads + Subscription.
- 한국어로 낼 경우 «지금 필요한 이유» 요지: «SIGNUM HQ 는 7/13 Play 출시, 이번 주 1.3.0 에서 내 종목과 홈 화면 위젯을 더했습니다. 하트 한 번이면 위젯이 종목마다 가격과 옵션 시장의 풋 플로어·맥스페인·콜 월 사이 위치를 보여 줍니다. 보통 유료 전문 데이터인 것을 가입 없이 무료로, 한국어·영어·일본어로 처음부터 썼습니다. 지금까지 안드로이드 설치의 절반가량은 Play 밖(자사 웹·링크)에서 왔습니다 — 출시 창의 편집 노출은 Play 사용자가 직접 찾게 해 줍니다.»
- 일본어로 낼 경우: «SIGNUM HQは7月13日にGoogle Playで公開、今週の1.3.0でマイ銘柄とホーム画面ウィジェットを追加しました。ハートをタップするだけで、ウィジェットが銘柄ごとに株価とオプション市場のプットフロア・マックスペイン・コールウォールの間の位置を表示します。通常は有料のプロ向けデータを、アカウント不要・無料で、日本語・英語・韓国語でゼロから作りました。これまでのAndroidインストールの約半分はPlayの外（自社サイトやリンク）経由です — ローンチ期間の編集露出で、Playユーザーが直接見つけられるようになります。»

**B-2. Apps Innovation Corner (영어)**
- App · Developer: Signum Hq, LLC · Team size: (실제 인원) · Outside investment: $0-$5M(자기자본) · Contact · App name: SIGNUM HQ · Package: com.signumhq.app · Stage: Released · Model: F2P · Launch date: 2026-07-13 · Device: Phone
- Other significant updates:
```
Sep 30, 2026 - v1.3.0: My Watchlist home screen widget. Each stock shows its price and where it sits between its put floor, max pain and call wall. Sep 29, 2026 - My Watchlist: no account, stored on the device, free for 5 stocks. UI written natively in English, Korean and Japanese; daily AI market brief and earnings calendar.
```

### 2-C. 피처링에 유리한 다음 빌드 재료(선택)
애플 편집 기준의 «Innovation: New technologies…»(getting-featured)에 맞춰, 다음 버전에 잠금 화면 위젯·App Intents(9/14 영어 베타, 한·일 10월 — 주간 학습 기록)를 넣으면 추천 문안이 강해진다. 빌드 과제라 순위표 밖.

### 2-D. GEO·디렉터리 제출 문안
- iOS 홍보문구 첫 문장(나머지 문구는 기존 유지, 전체 170자 이내)
  - en: `Options flow, max pain and dark pool app for US stocks. NEW: My Watchlist widgets — each stock between its put floor and call wall. No signup.`
  - ko: `미국주식 옵션 플로우·맥스페인·다크풀 앱. NEW 내 종목 위젯 — 종목마다 풋 플로어와 콜 월 사이 지금 위치를 홈 화면에서. 가입 없이 바로.`
  - ja: `米国株オプション分析アプリ。NEW マイ銘柄ウィジェット — 銘柄ごとにプットフロアとコールウォールの間の位置をホーム画面で。登録不要。`
- Play 전체 설명 첫 줄
  - en: `SIGNUM HQ is an options flow, max pain and dark pool app for US stocks — with a watchlist widget, earnings calendar and premarket movers.`
  - ko: `SIGNUM HQ 는 미국주식 옵션 플로우·맥스페인·다크풀 앱입니다 — 내 종목 위젯, 실적발표 일정, 프리마켓 시세까지.`
  - ja: `SIGNUM HQは米国株オプション分析アプリです。オプションフロー・マックスペイン・ダークプール、マイ銘柄ウィジェット、決算カレンダー、プレマーケットまで。`
- aistockpickerapps.com «Submit a Tool»(분류: AI Options Tools / Free Tools):
```
SIGNUM HQ - free iOS and Android app for US-stock options positioning: max pain, call wall and put floor for each stock, gamma exposure, options flow and FINRA dark-pool share, plus a daily AI market brief in English, Korean and Japanese. Watchlist with a home screen widget; no account needed.
```
  링크는 사이트 규칙을 먼저 읽고 추적 파라미터가 허용되면 `https://www.signumhq.com/app?from=aistockpickerapps`, 아니면 `https://www.signumhq.com`(태그 등록 먼저 — 원장 교훈).

---

## 3. 이번 주 바로 실행할 5개 + 준비물

| 순서 | 무엇 | 언제 | 누가 | 준비물 |
|---|---|---|---|---|
| 1 | **안드로이드 개발자 인증 등록 확인(0절) + Apps Innovation Corner 제출(#2)** | **오늘** | 코디네이터(콘솔 확인·폼 제출) / 막히면 대표 | §2-B-2 문안 · Play Console 로그인 세션 · 팀 인원 수(대표 확인 1줄) |
| 2 | **애플 추천 정비(#1)** — `55c33c21` 날짜, 1.10.0 승인 즉시 `111bf9bc` 문안·위젯 이벤트 연결, 1월 신규 추천 제출 | 오늘~10/11 | 에이전트(ASC API) | §2-A 문안 · `scripts/asc_nomination.py`(스토어 성장 브랜치) · 위젯 재캡처(게이트 종목) |
| 3 | **Google Play Featuring Nomination 제출(#5)** | 10/3 권장, 늦어도 10/23 | 에이전트(덱) → 코디네이터/대표(제출) | 피치덱 PDF 5장 + 공개 링크 · §2-B-1 문안 · 1.3.0 버전 코드 · Play D1/D7/D30 값 |
| 4 | **유료 시험 승인 요청(#3·#4)** — 애플 광고 $30 상한 안 재배분 + 구글 앱 캠페인 $10/일×14일 | 이번 주 | 대표: 승인 1줄 + Google Ads 계정·결제·Play 연결 / 에이전트: 소재·설정·중단 규칙 | 텍스트 3언어×5줄 · 이미지 1200×628·1200×1200(게이트 통과 실화면) · 중단 규칙(#3) · 광고 콘솔 세션 |
| 5 | **검색 결과 «첫 모습» 묶음(#6 + #9-1·2)** — ASC Asset Library 확인·KR/JP/EN 검색 결과 에셋 제출 + iOS 홍보문구·Play 설명 첫 줄 GEO 문장 | 이번 주 | 에이전트(무빌드, 위임 범위) | 애플 에셋 템플릿 · §2-D 문안 · 게이트 통과 캡처(NVDA·META·AMZN·GOOGL·PLTR) |

같이 걸어 둘 대표 1분짜리: 빙 웹마스터 로그인(#9-6) · 갤럭시 셀러 포털 로그인(#7) · Product Hunt 메이커 계정 생성(#12 — 1주 숙성이 필요해 오늘 만들어야 10월 둘째 주 런치 가능).

---

## 4. 막힌 채널 — 새로 열린 길(또는 닫아야 할 것)

| 원장 id | 원장 상태 | 오늘 확인한 것 | 조치 제안 |
|---|---|---|---|
| `google_play_featuring` | 자격 없음(«추천 폼은 유료 앱 할인용») | **다른 공식 폼 2개가 열려 있다** — Featuring Nomination(출시 4개월 창, https://support.google.com/googleplay/contact/featuring_review?hl=en) · **Apps Innovation Corner**(미국 기반·평점 4.0+, https://support.google.com/googleplay/contact/indie_corners?hl=en) | **재개** — enabled true, until 2026-10-23(#2·#5) |
| `amazon_appstore` | enabled **true**, 게이트 «계정» | **안드로이드 기기용 아마존 앱스토어는 2025-08-20 종료, 신규 앱 제출은 2025-02-20 중단** — Fire 태블릿·TV 만 남음(https://developer.amazon.com/apps-and-games/blogs/2025/02/upcoming-changes-to-amazon-appstore-for-android-devices-and-coins-program) | **닫기**(폰 설치 채널 아님) — enabled false, 사유 기록 |
| `apple_featuring` | 심사대기 | 추천 7건 중 리드 미달 1건(`55c33c21`, 제출 2일 뒤 시작)·1.10.0 승인 뒤 사실과 어긋날 문안 1건(`111bf9bc`) | note 갱신 + #1 실행 |
| `play_promotional_content` | 자격 없음 | 앱은 «Premium growth tools» 자격 필요(3개월 MAU 160만+ 등) — 원장 판단이 맞다 | 유지(근거 URL 추가) |
| `google_play_featuring`(Apps Accelerator, 대표 할 일 ㊴) | 모집 일정 미표기 | 2026 기수 1/7 마감·3월 시작, 작년 공고 10월 | 10월 공고 뜨면 신청서 초안(대표 결정) |
| `bing_webmaster` | 계정(대표) | ChatGPT 인용 87%가 빙 상위 10과 일치(Seer) | **우선순위 상향** — 대표 로그인 1회 |
| `llms_txt` | 조건부 유지 | 구글 «별도 파일 불필요» | 유지만, 추가 투자 없음 |
| `aptoide`·`android_alt_stores` | 계정·메일 승인 | 첫 단계 검사는 7개 참여 스토어에서 받는 설치(«We will begin by verifying app installations from the following stores») — APKPure·Uptodown·Aptoide 설치는 이번 단계 밖이지만 «2027 and beyond» 전 세계 확대 예정 | 지금부터 **Play 서명 범용 APK**로 통일(확대 때 막히지 않게) |
| `galaxy_store` | 로그인(대표) | 인증 참여 스토어 · RevenueCat→Samsung IAP 공식 연동 가이드(2026-08) | #7 — 첫 판 무료+광고, 구독은 후속 |
| (신규) | — | Indus · GetApps · OPPO · vivo · 애플 광고 Basic · 구글 앱 캠페인 · aistockpickerapps · ChatGPT 앱 디렉터리 · Android Central 포럼(앱당 스레드 1개, Play 링크 필수, 새 회원은 글 2개 뒤 링크 — https://forums.androidcentral.com/threads/app-and-developer-forum-rules-guidelines.827832/) · Android-Hilfe.de 앱 소개 게시판(https://www.android-hilfe.de/forum/app-vorstellungen.1351/) | 원장에 항목 추가(이번 커밋은 계획서만) |

---

## 5. 나라별 한눈 요약

| 나라 | 가장 큰 두 수 | 비고 |
|---|---|---|
| 미국 | Apps Innovation Corner(#2) · 구글 앱 캠페인 US(#3) | 애플 US 검색결과 $10(#4) · 영어 GEO(#9) |
| 한국 | 애플 추천 KR/JP(#1) · 갤럭시 스토어(#7) | 애플 광고 KR 재가동 + CPP «미장»(#4) · 검색 결과 에셋 KR(#6) · «옵션 플로우 앱» 문구(#9) |
| 일본 | 애플 광고 JP 증액(최저 CPA, #4) · 애플 추천(#1) | 구글 앱 캠페인 JP(비인증국, #3) · 구글 AI 개요에 이미 인용 — ja 설명 첫 줄로 지킨다(#9) |
| 인도 | en-GB(iOS 기본 언어, #8) · Indus·GetApps(#14) | Play 국가 맞춤 등록정보는 이미 있음(스토어 성장 브랜치) · 구글 광고는 금융 인증국이라 보류 · 애플 Basic(#11) |
| 브라질 | 갤럭시 스토어(#7) · 애플 Basic(#11) | 구글 광고 금융 인증국 → 보류 · 오늘부터 인증 스토어 규칙(0절) |
| 동남아(PH·ID·TH·VN·MY·SG) | en-GB(#8) · 구글 앱 캠페인 PH(#3) | GetApps·OPPO·vivo(#14) · ID·TH·SG 인증 규칙(0절) |
| 독일·유럽 | de-DE 메타 있음 · 애플 Basic 확장 여지 | 구글 광고는 EEA 금융 인증(2026-07 확대) → 보류 · UI 가 한·영·일뿐이라 효율 낮음 |

---

## 6. 검토했지만 제외(근거)

- **클리앙**: 사이트 규칙 «바이럴마케팅이나 전문적인 판매, 홍보(블로그, 동영상, 앱 등)를 위한 활동은 금지됩니다»(https://www.clien.net/service/board/rule/10707403) — 유료 «직접홍보» 게시판만 가능.
- **XDA «Android Apps and Games»**: 상업 앱 불가(포럼 설명, https://xdaforums.com/f/android-apps-and-games.530/) — 우리 앱은 광고+구독.
- **LINE 오픈채팅**: «本サービスを商業目的や広告目的に利用することは禁止» · 위반 시 LINE 계정 정지까지(https://openchat-jp.line.me/other/prohibited_activities).
- **카카오 오픈채팅**: 사전 동의 없는 광고성 정보 전송 금지 · 위반 시 «카카오톡 전체 서비스» 이용 제한 가능(https://talksafety.kakao.com/policy).
- **일본 iOS 대체 마켓**(MSCA, iOS 26.2+, https://developer.apple.com/news/?id=074b3wzz): 사용자 규모가 작아 보류.
- **안드로이드 인스턴트 앱**: 2025-12 종료.
- **소셜 게시 확대로 설치 늘리기**: 클릭 두 배에도 설치 그대로였다(메모리 clicks-doubled-installs-flat) — 이번 계획은 «폰이 있는 면(스토어·광고·자사 웹)»에 무게를 둔다.
- **유튜브·StockTwits·해커뉴스·AI 금지 레딧 서브**: 금지 원칙 그대로.

---

## 7. 이번 조사에서 남긴 흔적(투명성)

- ego 작업 공간 **5번**(«GEO 실측 — AI 답변 추천 앱(읽기 전용)»)을 열어 퍼플렉시티·빙·구글 검색 결과만 읽었다(입력·클릭·로그인·동의 없음, 쿠키 배너도 누르지 않음). 지시대로 `finish()` 는 부르지 않았다.
- PC 착지 화면을 확인하려고 스마트링크를 데스크톱 UA 로 **1회** 열었다: `from=geo_test_probe_ignore&l=ko`(9/30 11:5x KST) — 클릭 집계에서 이 태그는 빼 주면 된다.
- ASC API 는 **읽기(GET)만** 했다(추천 목록·앱 이름/부제). 제출·수정은 하지 않았다.
- 원자료: `~/Documents/signum-work/2026-09-30/growth/geo/`(스크립트 2개·결과 JSON 2개).
