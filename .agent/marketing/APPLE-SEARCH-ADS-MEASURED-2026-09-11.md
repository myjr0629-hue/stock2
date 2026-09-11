# Apple Search Ads — 콘솔 실측 기록 (2026-09-11)

**추측이 아니라 Apple 콘솔에서 직접 읽은 값만 적는다.** 캠페인 생성 플로우의
키워드 도구(제품 추천 + 인기도)와 광고그룹의 «추천 기본 최대 CPT»가 출처다.

## 0. 계정 상태
- Apple Ads **Advanced**, 조직 `Signum HQ`, 계정 `Signum HQ_ads`, 통화 **USD**
- 카드 등록됨(MC ···9536, 만료 1/31, 청구지 Newark DE = 법인 주소와 일치)
- **프로모션 크레딧: 2026-09-02 적용됨** (금액은 콘솔에 표시되지 않음)
- 캠페인 **0개**, 송장 **0건**(누적 지출 없음)

## 1. ★ Apple 이 추천하는 «기본 최대 CPT» — 국가 격차가 핵심이다
| 스토어프론트 | 추천 기본 최대 CPT | 미국 대비 |
|---|---|---|
| 미국 | **$6.33** | 1.00× |
| 한국 | **$5.55** | 0.88× |
| **일본** | **$0.94** | **0.15×** |

→ 보고서는 「한국 CPT $0.30~$0.45」「일본은 미국의 47%」라고 했다. **둘 다 틀렸다.**
   한국은 미국과 **12% 차이**뿐이고, 일본이 **6.7배 싸다.**

## 2. ★ 키워드 검색 인기도 (Apple 1~5 척도, 콘솔 실측)

### 미국
| 인기도 | 키워드 |
|---|---|
| 5 | cash app, paypal |
| 4 | cashapp, bible, klarna, sonic, apple pay |
| 3 | stocks, stock, aktien / (AI 앱군) cloud ai, perplexity ai |
| 2 | **options trading**, options, **optionstrat**, **stocktwits**, forex, plus 500 |
| 1 | **dark pool**, **options flow**, ai stock, premarket, earnings, stock options, options ai, thinkorswim papermoney |
| — | `gex` · `gamma exposure` · `max pain` · `finra short volume` → **추천에 아예 안 나온다** |

- ⚠️ `gamma` 검색 결과는 **옵션 감마가 아니라 AI 프레젠테이션 앱 "Gamma"**(3/5)다.
  `cloud ai`·`perplexity ai`·`claude ai gratuit` 가 같이 나온다.
  보고서대로 `gamma exposure`·`gamma squeeze` 에 확장검색을 걸면 **AI 앱 찾는 사람에게 돈이 나간다.**
- ⚠️ `unusual whales` 는 **일치 결과가 없다.** 대신 `optionstrat`(2)·`stocktwits`(2) 가 나온다.
  → 얇은 니치에서는 **경쟁사 브랜드어가 우리 카테고리어보다 볼륨이 크다.**

### 한국
`코스피` 2 · `미국주식` **1** · `실시간 주가` 1 · `s p500` 1 · `증시` 1 · `주식차트` 1 ·
`주식정보` 1 · **`다크풀` 1(연관어 0)** · **`서학개미` 1(연관어 0)**

### 일본 — 전 시장 최고 볼륨
| 인기도 | 키워드 |
|---|---|
| **3** | **株価**, **株価アプリ** |
| 2 | 株価チャート, かぶ, 株式, 株アプリ, **米国株** |
| 1 | 株チャート, オプション, 決算, 日本株, 日本株アプリ, 松井証券アプリ, sbi 外国株 |

## 3. ★ Apple 은 우리 앱을 «전혀 다른 것»으로 이해하고 있다
키워드 도구가 우리 앱에 추천한 «제품 추천» 목록:
- 미국: `cash app` `paypal` `cashapp` **`bible`** `klarna` **`sonic`** `apple pay`
- 한국: `zalo` `paypal` `alipay` `didi` `gcash` `vneid` `my viettel`
- 일본: `paypal` `alipay` `didi` `zalo` `gcash` `vneid` `my viettel`

성경·소닉·베트남 결제앱이다. 즉 **Apple 에게 우리는 «그냥 금융 카테고리 앱»이다.**
관련성 점수는 CPT 승수이므로 이건 조용히 우리 입찰을 비싸게 만든다.
→ 다음 빌드에서 로케일별 키워드 필드를 고쳐야 한다(이름·부제·키워드는 **새 빌드 필수**).

## 4. 스토어 리스팅은 이미 현지화돼 있다 (itunes lookup 실측)
| 스토어 | 앱 이름 |
|---|---|
| US | SIGNUM HQ: Premarket Earnings |
| KR | SIGNUM HQ: 서학개미 미국증시 실적 |
| **JP** | **SIGNUM HQ: 米国株リアルタイム決算** |
언어: EN·JA·KO / v1.8 / 무료. 설명문도 3개국어 전부 현지화됨.
→ **일본 이름에 `米国株`(2/5)·`決算` 이 이미 들어가 있다.** 이름-키워드 일치는
   관련성 점수를 올려 CPT 를 더 낮춘다. 일본이 두 번 유리한 이유다.
- ⚠️ 미국 이름의 `Premarket`·`Earnings` 는 둘 다 **1/5** 다. 뚫린 자리이긴 하나 볼륨도 없다.
- `株価`(3/5)는 일본 이름에 **없다** → 다음 빌드 후보.

## 5. 콘솔 동작 — 함정 4개 (실측)
1. **`Maximize Conversions` 는 Search Match 를 강제한다**(화면에 명시). 비용 통제하려면 `입찰 관리`(수동).
2. **Search Match 는 기본 ON.** 광고그룹마다 직접 꺼야 한다.
3. **기본 최대 CPT 를 먼저 입력하지 않으면 키워드를 추가할 수 없다**(「키워드를 추가하기 전에 CPT 입찰가를 입력하십시오」).
4. **국가 선택 필터 입력창은 필터링이 안 된다** — 타이핑하면 「일치하는 결과가 없습니다」가 뜬다. 목록에서 직접 찾아야 한다.
5. `맞춤형 제품 페이지(CPP)` 를 광고 탭 대상으로 고를 수 있다(ASC 에서 먼저 만들어야 함).
6. ⚠️ **시간대별 집행(dayparting)은 Apple Ads 에 없다.** 시작일/종료일만 있다.
   보고서의 「ET 07~16시만 집행」은 이 플랫폼에서 실행 불가.

## 6. 결론 — 일본 한 곳에 집중한다
보고서의 미국 키워드 계획(`gex`·`gamma exposure`·`dark pool`·`options flow`·
`finra short volume`)은 **전부 1/5 이거나 추천에 존재하지 않는다.**
완전일치로만 걸면 노출이 거의 안 뜨고, 대표 목적인 **트래픽이 0에 가깝다.**

| 시장 | 최상위 «관련» 키워드 | 인기도 | 추천 CPT | 동일 예산의 상대 탭수 |
|---|---|---|---|---|
| 미국 | options trading | 2 | $6.33 | 1.0× |
| 한국 | 코스피(의도 불일치) / 미국주식 | 2 / 1 | $5.55 | 1.1× |
| **일본** | **株価 / 株価アプリ / 米国株** | **3 / 3 / 2** | **$0.94** | **6.7×** |

일본은 ①볼륨이 가장 크고 ②CPT 가 1/6.7 이고 ③앱 이름이 이미 목표어와 일치한다.
**1단계는 일본 100%.** 미국은 $3/일로는 하루 0.5~1탭이라 아무것도 배울 수 없으므로,
일본에서 CVR·CPI 실측을 확보한 뒤 재배분한다.

---

# 2차 실측 — 이름 필드 교정용 전수 측정 (같은 날 이어서)

## ★ 정정: 키워드 필드는 비어 있지 않다
`scripts/asc-dump-metadata.py` 로 ASC 에서 실제 값을 읽었다. v1.8 기준:
```
en-US (97/100)  free,realtime,movers,gappers,unusual,options,flow,gamma,darkpool,maxpain,0dte,nasdaq,tesla,nvidia
ko    (97/100)  미국주식,미장,증시,시황,오늘의증시,증시캘린더,실적발표일정,기업실적,배당주,나스닥,테슬라,엔비디아,주가,종목,무료,실시간,속보,리포트,공시,해외주식,장마감,종목분석,실시간주가
ja    (89/100)  ニュース,決算発表,決算カレンダー,テスラ,エヌビディア,ナスダック,株価,個別株,銘柄,速報,経済指標,市況,相場,出来高,需給,オプション,ガンマ,オルカン,決算,時間外取引
```
→ **「Apple 이 우리를 cash app·bible 로 이해한다」는 1차 해석은 과잉이었다.**
   키워드 도구의 «제품 추천»은 우리 메타데이터를 읽은 결과가 아니라
   **해당 스토어의 금융 카테고리 상위 검색어**를 보여주는 것뿐이다. 정정한다.

## ★ 실제 결함은 «이름 칸»과 «en-US 키워드의 볼륨어 부재»다

### 미국 인기도 전수 (Apple 1~5, 콘솔 실측)
| 인기도 | 키워드 |
|---|---|
| 3 | **stock market**, **trading**, **stocks**, **investing**, trading view(브랜드), etoro, xtb, vanguard australia, sharesies, aktien |
| 2 | stock, **options trading**, options, optionstrat, stocktwits, stocks tracker, forex, plus500, 인베스팅닷컴, 코인마켓캡, hatch invest, krypto, azioni |
| 1 | dark pool, options flow, ai stock, premarket, earnings, stock alerts, stock portfolio, stock options, options ai, thinkorswim papermoney, options trading simulator, trading broker, papermoney |
| 없음 | gex, gamma exposure, max pain, finra short volume, unusual whales (추천에 미출현) |

### ⚠️ 의도가 «납치된» 단어 2개 — 이름·키워드에 넣으면 안 된다
- **`gamma`** → 옵션 감마가 아니라 **AI 프레젠테이션 앱 "Gamma"**(3). 동반 추천이
  `cloud ai`·`perplexity ai`·`claude ai gratuit`. **우리 en-US 키워드에 `gamma` 가 들어 있다.**
- **`watchlist`** → **영화 앱**이 점령(`letterbox` 3, `moviebase`, `film visti`, `letterboxed`).

### 현재 en-US 지면이 색인되는 단어
이름 `Premarket Earnings` + 부제 `After Hours, Calendar & Alerts` + 키워드 14개
→ **`stock` / `stocks` / `stock market` / `trading` / `investing` 이 «한 곳에도 없다».**
   즉 인기도 3짜리 단어 전부를 비워 두고, 1짜리(premarket·earnings)에 이름 30자를 썼다.
   이것이 미국에서 노출이 안 나오는 구조적 이유다. 일본은 반대로 이름에 `米国株`(2)가 있다.
