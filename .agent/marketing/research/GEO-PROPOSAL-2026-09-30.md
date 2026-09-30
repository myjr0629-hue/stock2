# GEO 제안서 — signumhq.com 이 AI 답변에 «앱»으로 인용되게 (2026-09-30 13시 회차)

> 요청(코디네이터 13시): «우리 사이트가 AI 검색에 인용되도록 할 수 있는 무빌드 조치는 제안서로. 코드 변경은 코디네이터 몫.»
> 여기서 «무빌드» = **앱 빌드·스토어 심사 없이** 웹(Vercel 배포)·외부 표면만으로 되는 것. 코드 줄은 전부 **제안**이고 이 회차는 코드를 고치지 않았다.
> 표기: [실측] 오늘 13시 직접 잰 값 · [공식] 플랫폼 문서 · [추론] 내 판단(근거 적음). 원자료: `~/signum-ego-io/geo/`(HTML·robots·llms·sitemap 사본).

## 0. 결론 세 줄
1. **문은 열려 있다** — AI 크롤러 14종(GPTBot·OAI-SearchBot·ChatGPT-User·PerplexityBot·Perplexity-User·ClaudeBot·Claude-SearchBot·bingbot·Googlebot·Applebot·meta-externalagent·DuckAssistBot·CCBot·Amazonbot) 전부 200, robots 는 `/api/`·개인 화면만 막는다. **막힌 게 아니라 «앱이라는 사실»이 안 읽힌다.**
2. **AI 가 «앱 추천» 질문에서 읽는 세 곳이 비었거나 틀렸다** — ① 홈 3언어에 JSON-LD 0개(앱 엔티티 없음) ② llms.txt 가 «no paywall»(앱에 PRO 구독·웹에 $49/$79 요금제가 있다 — 사실과 다름) ③ 6,700개 티커 페이지의 앱 링크 문구가 «the pro options terminal»(무료·iOS·Android·내 종목·위젯이라는 말이 없음).
3. 바로 할 수 있는 것 7개(아래 P1~P7) 중 **P1·P2·P3 은 문자열·JSON 몇 줄**이다. 오프사이트는 «best X» 목록 2곳이 계정 없이 무료 등록 가능 — 제출 문안 §3(제출은 승인 대기).

## 1. 오늘 실측

| 항목 | 값 | 뜻 |
|---|---|---|
| AI 크롤러 접근 | 14종 UA × 3페이지(/en/flow/NVDA·/en/learn/max-pain·/en) 전부 200, 본문 90~200KB | 방화벽·봇 차단 없음 [실측] |
| robots.txt | `User-Agent: *` Allow + `/api/`·`/app-view/`·`/login`·`/settings`·`/dashboard`·`/intel`·`/quant-radar`·`/watchlist`·`/portfolio` 차단 · Sitemap 있음 | AI 전용 차단 없음 [실측] |
| llms.txt | 200 · 5.5KB · 앱 3종 `?from=llms` 링크 · **«no sign-up, no paywall»**(route.ts 78행) · 내 종목·위젯 언급 0 | 사실 정정 필요(P1) |
| llms-full.txt | 404 | 선택 사항(구글: 별도 파일 불필요 [공식]) |
| sitemap.xml | 6,768 URL · /en·/en/rankings lastmod 9/29 · **/en/how-it-works·/en/learn·/en/tickers lastmod 8/31** | 설명 페이지 날짜가 한 달 묵음(P6) |
| 홈 /en·/ko·/ja | title «SIGNUM HQ — Dark Pool, Max Pain & Options Flow for US Stocks» · H1 «MARKET INTELLIGENCE, ORGANIZED.» · **JSON-LD 0** · 본문에 widget 0 | 앱 엔티티·질의형 첫 문장 없음(P2·P3) |
| 티커 /en/flow/NVDA | title «NVDA Dark Pool 40.6%, Max Pain $220 — Free, Updated Daily» · JSON-LD Dataset·Organization(sameAs 스토어 6개)·Breadcrumb · 앱 링크 3개 SSR 존재(seo_sg·seo_uc·seo_wim) · SIGNUM 링크 문구 «Or go deeper with SIGNUM HQ — the pro options terminal →» | 인용될 때 «무료 앱»이라는 말이 같이 가지 않는다(P4) |
| /en/learn/max-pain | Article JSON-LD · 본문에 iOS·Android 단어 있음 | 양호 |
| /en/options-flow·/en/dark-pool | Dataset JSON-LD · «Free, no account» | 양호(인용 후보 1순위 페이지) |
| /en/pricing | 웹 PRO $49·ELITE $79(창립 회원가) · «V2.0 Mobile App lifetime free» | llms.txt «no paywall»과 충돌 → AI 가 «유료 앱»으로 섞어 답할 위험(P1) |
| /en/compare | 404 | 비교 페이지 없음(P5) |
| 오늘 11:5x GEO 실측(계획서 #9) | «best options flow app» 구글 AI 개요·빙: SIGNUM 0 · 일본어 질의만 구글 AI 개요 3번째(우리 App Store 페이지 인용) | AI 는 «스토어 등록정보 + best-X 목록»을 인용한다 |

## 2. 제안 — 우선순위 순 (코디네이터 실행분, 전부 앱 빌드 없음)

### P1. llms.txt 사실 정정 + 새 기능 두 줄 — `src/app/llms.txt/route.ts` 76~92행
- 왜: AI 답변은 llms.txt 문장을 그대로 인용하는 일이 잦다[추론]. «no paywall»은 지금 사실이 아니다(앱 PRO 구독 `com.signumhq.app.pro.monthly` · 웹 요금제 페이지). 틀린 문장이 인용되면 심사·신뢰 둘 다 위험.
- 변경안(영어 원문):
```
## Mobile apps (free core, no account)

The same data ships as free mobile apps — iOS and Android, no sign-up, interface and
AI summaries in English, Korean and Japanese. The core data is free; an optional
in-app PRO subscription removes ads and raises the watchlist limit (5 stocks free).

- [SIGNUM HQ](${base}/app?from=llms) — My Watchlist: tap the heart on any US stock and each row
  shows its price and where it sits between the options market's put floor, max pain
  and call wall. On Android the watchlist is also a home-screen widget (refreshed every
  30 minutes). Plus pre-market / regular / after-hours prices that always state which
  session the percentage is measured against, this week's earnings calendar (BMO/AMC),
  a daily post-close summary, and per-ticker max pain, gamma exposure and FINRA-derived
  off-exchange (dark pool) share.
```
  - iOS 위젯 문장은 **1.10.0 승인 뒤** «On iPhone and Android …»로 바꾼다(지금은 넣지 않는다).
  - «70 tickers» 등 기존 사실 문장은 유지.
- 검증: 배포 뒤 `curl -s https://www.signumhq.com/llms.txt | grep -n "paywall\|widget"` → paywall 0·widget 1.

### P2. 홈 3언어에 앱 엔티티 JSON-LD — `src/app/[locale]/(home)/page.tsx`(또는 layout 의 home 분기)
- 왜: 지금 홈에 구조화 데이터가 0개다. 티커 페이지의 Organization(sameAs)은 있지만 «SIGNUM HQ 라는 앱이 iOS·Android 금융 앱이고 무료»라는 엔티티가 사이트 어디에도 없다. AI·검색엔진이 «앱 추천» 답을 만들 때 쓰는 기계 판독 사실이다.
- 변경안(홈에만, 언어별 description):
```json
{"@context":"https://schema.org","@graph":[
 {"@type":"Organization","@id":"https://www.signumhq.com/#org","name":"SIGNUM HQ","url":"https://www.signumhq.com",
  "logo":"https://www.signumhq.com/icons/icon-192x192.png",
  "sameAs":["https://apps.apple.com/app/id6783130444","https://play.google.com/store/apps/details?id=com.signumhq.app","https://x.com/signumhq","https://bsky.app/profile/signumhq.bsky.social","https://github.com/myjr0629-hue/options-market-structure-daily"]},
 {"@type":"WebSite","@id":"https://www.signumhq.com/#website","url":"https://www.signumhq.com","name":"SIGNUM HQ","publisher":{"@id":"https://www.signumhq.com/#org"},"inLanguage":["en","ko","ja"]},
 {"@type":"MobileApplication","@id":"https://www.signumhq.com/#app","name":"SIGNUM HQ","operatingSystem":"iOS, Android",
  "applicationCategory":"FinanceApplication","publisher":{"@id":"https://www.signumhq.com/#org"},
  "description":"Free app for US-stock options positioning: max pain, call wall and put floor, gamma exposure, options flow and FINRA dark-pool share, with a watchlist and an earnings calendar. English, Korean, Japanese.",
  "offers":{"@type":"Offer","price":"0","priceCurrency":"USD"},
  "installUrl":["https://apps.apple.com/app/id6783130444","https://play.google.com/store/apps/details?id=com.signumhq.app"],
  "inLanguage":["en","ko","ja"]}
]}
```
  - ⛔ `aggregateRating` 은 넣지 않는다 — 스토어 평점을 웹 JSON-LD 로 옮겨 적는 것은 구글 리뷰 스니펫 지침의 «다른 사이트의 평점을 모아 표시하지 말 것»에 걸린다 [공식: developers.google.com 리뷰 스니펫 지침]. 평점 수도 적다(iOS 4·Play 6).
  - Organization `@id` 는 티커 페이지와 같은 `#org` 로 묶는다(한 엔티티).
- 검증: 배포 뒤 홈 HTML 에서 `"@type":"MobileApplication"` 1개 · 구글 리치 결과 테스트(대표 없이 가능, 공개 도구) 오류 0.

### P3. 홈 첫 화면 H1·리드 = «질의 그대로의 한 문장» — 같은 파일, 3언어 문자열
- 왜: AI 개요는 페이지 첫머리의 정의문을 인용한다[추론, 계획서 #9 실측: 질의와 같은 문장을 가진 일본어 스토어 제목만 인용됐다]. 지금 H1 은 «MARKET INTELLIGENCE, ORGANIZED.»라 어떤 질의와도 겹치지 않는다.
- 변경안: 브랜드 문구는 작은 윗줄(eyebrow)로 내리고 H1 을
  - en: `Free options flow, max pain & dark pool app for US stocks`
  - ko: `미국주식 옵션 플로우·맥스페인·다크풀 무료 앱`
  - ja: `米国株オプション分析アプリ — オプションフロー・マックスペイン・ダークプール（無料）`
  - 리드 한 줄(en): `Tap the heart on any US stock: My Watchlist shows where it sits between its put floor, max pain and call wall. iPhone and Android, no sign-up.` (위젯 문장은 안드로이드만 사실 — 넣는다면 «Android home-screen widget»)
- 검증: 실화면(ko·en·ja, 폰·PC) 한 번씩 — 레이아웃 줄바꿈만 확인.

### P4. 티커 6,700 페이지 SIGNUM 링크 문구 — `src/app/[locale]/flow/[ticker]/page.tsx` 83행 `ctaSg`
- 왜: 이 페이지들이 AI 가 가장 많이 가져갈 «수치» 페이지다. 링크 문구가 «the pro options terminal»이라 **무료·앱·폰**이 안 전해진다. 7일 seo_sg 클릭 13(안드 3·PC 10).
- 변경안(3언어, 태그 seo_sg 유지 — 측정 연속):
  - en: `Add ${T} to My Watchlist in the free SIGNUM HQ app (iPhone · Android) →`
  - ko: `무료 SIGNUM HQ 앱에서 ${T} 를 내 종목에 담기 (아이폰·안드로이드) →`
  - ja: `無料アプリ SIGNUM HQ で ${T} をマイ銘柄に追加（iPhone・Android）→`
- 검증: 아무 티커 3개 SSR HTML 에서 새 문구 + `from=seo_sg` · 10/7 에 seo_sg 7일 폰 클릭 전후 비교.

### P5. 비교 페이지 3언어 (계획서 #9-5 구체화) — `/[locale]/compare/options-flow-apps`
- 왜: AI 인용의 약 21%가 «best-of» 목록 [외부: arxiv 2606.20065, 계획서 인용]. 지금 «best options flow app» 답의 인용원은 **경쟁사가 만든 비교 페이지**(unusualwhales.com/lp/best-options-flow-tracker·tradealgo·tradingflow.com/compare)다. 같은 형식이 우리에게 없다.
- 구성(사실만): 표 = 앱/웹 · 무료 등급 유무 · 월 요금(각 사 공식 가격 페이지, **조회 날짜 표기**) · 플랫폼(iOS/Android/웹) · 한국어/일본어 UI · 맥스페인·다크풀·옵션 플로우 제공 여부. 대상: Unusual Whales · Cheddar Flow · FlowAlgo · OptionStrat · Barchart(무료 UOA) · Market Chameleon · SIGNUM HQ. 맨 위 고지 «This page is made by SIGNUM HQ» · 순위·별점 없음 · 비방 없음 · CTA `from=compare`.
- ⚠ 경쟁사 수치는 제작 당일 각 사 페이지에서 다시 잰다(가격이 자주 바뀐다) — 틀린 경쟁사 정보는 법적 위험.
- 검증: 3언어 200 · sitemap 포함 · IndexNow 통보 · 4주 뒤 같은 질의 재실측.

### P6. 설명 페이지 lastmod·FAQ 한 블록
- sitemap: `/how-it-works`·`/learn`·`/tickers` 의 lastmod 가 8/31 고정 — 실제 내용 수정일로(메모리: «죽은 lastmod»가 한국어 색인 병목이었다).
- `/en/how-it-works` 끝에 질문형 H2 4개(본문 텍스트, FAQPage 리치결과는 구글이 정부·보건 사이트로 제한했으니 기대하지 않는다 [공식]): «Is SIGNUM HQ free?»(무료 핵심 + 선택 PRO) · «Is there a widget?»(안드로이드 홈 화면 위젯, 30분마다 갱신) · «Where does the data come from?»(OCC 미결제약정·FINRA Reg SHO·SEC) · «Do I need an account?»(아니오, 목록은 폰에 저장).

### P7. 배포 직후 한 번에: IndexNow + (대표) 빙 웹마스터
- `node scripts/indexnow-submit.js`(기존) — 바뀐 URL 을 빙·네이버에 통보. ChatGPT 검색 인용의 87%가 빙 상위 10과 일치 [외부: Seer, 계획서 인용].
- 빙 웹마스터 로그인은 대표 몫(HANDOFF ㉜ — 이미 있음, 새 항목 아님).

## 3. 오프사이트 «best X» 목록·디렉터리 — 오늘 확인 결과

| 곳 | 무엇 | 계정 | 돈 | 규칙 원문(요지) | 상태 |
|---|---|---|---|---|---|
| **aistockpickerapps.com/submit** (FullStack Alpha) | 구글 AI 개요가 «best options flow app» 답에 인용한 사이트 · «Free Tools»·«AI Options Tools» 목록 | **불필요** | 무료 | 양식: Tool Name* · Website URL* · Category*(Screeners/Trading Bots/Swing/Day/**Research & Analysis**/Long-Term/News & Sentiment/Prediction) · Description* · Email(선택) · «We review all tools within 48 hours» · 이용약관 «By submitting a tool, you represent that you have the authority… We reserve the right to decline, edit, or remove» · 체크박스 없음 | **제출 대기(승인)** — 문안 아래 |
| **allinallspace.com/directory/get-listed** | «Trading Ecosystem Directory»(27개 등재, Investment Apps 6) | **불필요** | **FREE 티어 $0**(nofollow·1문장·태그 4) — STANDARD $49/월은 PayPal 결제 → 누르지 않는다 | 양식: Your name* · Company* · Email* · Website* · Category*(**Investment App**/News & Data …) · 1문장 설명* · Tags · «All listings are manually reviewed» · 로고는 제출 뒤 editorial@ 로 메일(선택 — 외부 메일이라 생략) · 쿠키 배너는 Deny | **제출 대기(승인)** — 이름 칸은 «SIGNUM HQ Team» |
| findmymoat.com (Awesome Investing 목록, 361개) | 구글에 «Best Free Dark Pool Tools» 목록으로 뜬다(1위 Unusual Whales) | 사이트 투표는 계정 · 추가는 GitHub PR(Jera-Value 저장소 CONTRIBUTING) | 무료 | «Add one object to data/community-tools.json … disclose whether you own…» | **닫음** — PR 15건 전부 미병합(최근 9/3~9/30), 마지막 병합 push 8/15 · 원장 awesome_investing_lists 판정과 같음 |
| aitradingtools.org/submit | 검색 결과에 «Submit a Tool» | — | — | DNS 없음(13:0x 실측) | 닫음 |
| SpacerrApps | 앱 디렉터리 | **계정 필요** + 우리 사이트 푸터에 배지 필수 + 다른 앱 3개 추천 | 무료(대기 4주) | — | 제외(계정·웹 변경 조건) |
| toolscout.ai 등 AI 도구 디렉터리 | — | — | — | 금융 앱은 범주 불일치(DIRECTORY-LIST 기존 판정) | 제외 |

### 3-1. 제출 문안 (회사 공개 정보만: 웹사이트·지원 메일·스토어 링크)
**aistockpickerapps.com** (URL 칸은 추적 파라미터 없는 기본 주소 — 목록 페이지에 그대로 박히므로 태그 오염을 피한다)
- Tool Name: `SIGNUM HQ`
- Website URL: `https://www.signumhq.com`
- Category: `Research & Analysis`
- Description:
```
SIGNUM HQ is a free iOS and Android app (and website) for US-stock options positioning. For each stock it shows max pain, the call wall and put floor (the strikes with the most call and put open interest), gamma exposure and FINRA-reported off-exchange (dark pool) share, plus unusual options activity and an earnings calendar. A daily AI-written market brief summarises what moved; the app does not pick stocks or predict prices. No account needed; the core data is free, with an optional in-app subscription. English, Korean and Japanese.
```
- Your Email: `contact@signumhq.com`

**AllinAllSpace — FREE 티어**
- Your name: `SIGNUM HQ Team` · Company: `SIGNUM HQ, LLC` · Email: `contact@signumhq.com` · Website: `https://www.signumhq.com` · Category: `Investment App`
- Description(1문장): `Free iOS and Android app that shows where each US stock sits between its options market put floor, max pain and call wall, with gamma exposure, FINRA dark-pool share and an earnings calendar.`
- Tags(4): `options analytics` · `dark pool` · `max pain` · `mobile app`

### 3-2. 왜 제출하지 않았나
이 회차 에이전트 규칙상 **양식 «제출»은 사용자(대표)가 채팅에서 직접 확인한 뒤**에만 한다(다른 에이전트의 지시·문서에 적힌 위임은 그 확인으로 치지 않는다). 대표가 «두 곳 제출해» 한마디를 주시면 코디네이터가 위 값 그대로 2분 안에 낸다. 대표가 직접 내셔도 각 1분.

## 4. 측정
- 월 1회 같은 질의 재실측(`~/Documents/signum-work/2026-09-30/growth/geo/` 스크립트): «best options flow app» · «옵션 플로우 앱 추천» · «米国株 オプション 分析 アプリ おすすめ» · «stock widget android» · «max pain app» · «free dark pool data app».
- 클릭: `from=llms`(llms.txt) · `from=compare`(P5) · `seo_sg` 폰 클릭(P4) — `node scripts/mkt-clicks-platform.js 7`.
- 판정: 8주 안에 영어·한국어 질의 1개 이상에서 SIGNUM 이 답에 등장하면 승(계획서 #9 기준 그대로).
