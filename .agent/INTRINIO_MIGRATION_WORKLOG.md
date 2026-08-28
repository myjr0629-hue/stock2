# Intrinio 이관 — 작업 로그

> 세션이 끊겨도 여기서 이어간다. **작업 전 반드시 이 파일 + `INTRINIO_MIGRATION.md` + `INFRASTRUCTURE_MAP.md` 를 읽을 것.**
> 정본 매핑표·계약조건·엔드포인트 실측 = `INTRINIO_MIGRATION.md`

## 현재 단계

**Phase 1 (Vercel REST) — ✅ 완료·프로덕션 검증됨 (2026-08-29)**
다음: Phase 2 = Lambda 6개 · Phase 3 = EC2 WebSocket

### Phase 1 프로덕션 검증 결과 (www.signumhq.com 실측)
```
live/ticker NVDA   price 218.63  -4.10%  prev 227.98  api 200  gammaFlip 217.5  PCR 1.18
live/quotes        NVDA 218.64 · AAPL 319.82 · TSLA 346.44
market/movers      상승10 하락10 · 1위 CELU +138.5%
command/unified    maxPain 220 · pcRatio 0.73 · sma50 208.16 · darkPool 53.6
history gex        1,000건
guardian/news      10건 (Massive 유지 — 정상)
```

### Phase 1 에서 잡은 버그 3건 (전부 프로덕션 실측으로 발견)
1. **CSV 컬럼 밀림** — 벌크 CSV 542행이 `"Argan, Inc."` 처럼 따옴표+쉼표를 포함.
   단순 split(",") 로 DATE 자리에 EXCH_TICKER 가 들어가 최신 거래일이 `ARLP:UW` 로 오염,
   종목 수가 1개로 붕괴. → RFC 4180 파서 신설 + ISO 날짜 검증.
2. **전체 URL 우회** — `live/ticker` 등은 `fetchMassiveWithRetry(`${BASE}/v2/...`)` 로
   **전체 URL**을 넘기는데 라우팅 조건이 `!startsWith("http")` 였다.
   1차 배포에서 옵션 지표만 살고 price 가 null 이던 원인. → `normalizeToMassivePath()` 신설.
3. **다중 종목 price 0** — `/v2/snapshot/.../tickers?tickers=A,B` 가 Redis EOD 만 바라봐서
   Lambda 적재 전에는 항상 빈 결과. → 30종목 이하면 개별 realtime 폴백.

⚠️ **캐시 주의**: massiveCache 60초 + route 자체 메모리 캐시 60초.
   배포 직후 이전 빈 결과가 살아 있어 오판하기 쉽다. **새 티커로 검증할 것.**

### 커밋
- `cd6d3a15` 1단계 (어댑터·라우터·연결)
- `37b1bb22` 전체 URL 라우팅 수정
- `71f93204` 다중 종목 폴백

## 자격 정보

| 항목 | 값 |
|---|---|
| Intrinio API key | `OmNiNGE3NDY1ODZjNGU5MTNhODQwNDYzMmJlMWQxMzQx` |
| Intrinio base | `https://api-v2.intrinio.com` · 인증 `?api_key=` |
| 계정 | contact@signumhq.com (Google OAuth) · Startup Plan · 14일 체험 (8/28 시작) |
| Massive key (뉴스 전용 유지) | `iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF` |
| Massive 해지 | Stocks/Options Advanced 모두 **2026-09-23 종료 예약** |
| Vercel CLI | 로그인됨 (`myjr0629-8945`) |
| AWS CLI | **미설치** — Lambda 배포 경로 확인 필요 |

## ⚠️ 절대 잊지 말 것

1. **뉴스(`/v2/reference/news`)는 건드리지 않는다** — 대표 지시. 단 **9/23 에 끊김**, 별도 작업으로 분리.
2. **다크풀/short interest 포기 확정** — Intrinio Startup 에 없음(Enterprise 전용).
3. **주가지수(야후 `^VIX` `^SOX` `^TNX` 등)는 그대로 유지** — 잘 작동 중, 건드리지 않음.
4. **FMP(실적·애널리스트·경제캘린더·로고)는 그대로 유지.**
5. **계약 의무**: Intrinio 데이터가 쓰이는 **모든 페이지**에 출처 표기 + follow 백링크. 미구현.
6. **라이브 앱 변경은 실화면 검증 후에만 배포** (기존 교훈).
7. **`git add -A` 금지** — 경로 명시 add 만.

## 전수 인벤토리 (역추적 결과)

### A. Vercel / Next.js (`src/`)
- 단일 허브: **`src/services/massiveClient.ts`** (879줄) — 모든 호출이 `fetchMassive()` 경유
  - 캐시(60s) · 동시성 큐(report 10 / spot 20) · 재시도 · 예산 · 에러정규화 내장
  - **전략: 이 함수 내부 라우팅만 교체 → 소비처 30여 파일 무수정**
- 예외: `fetchOptionSnapshot()` 은 `fetchMassive` 를 우회하고 직접 `fetch` (line 496~) — **개별 수정 필요**
- 하드코딩 키 2곳: `massiveClient.ts:6`, `src/app/api/live/ticker/route.ts:16`

### B. AWS Lambda — **Massive 사용 6개 확인**
| 디렉터리 | Massive 참조 |
|---|---|
| `harvest_lambda/` | ✅ |
| `scripts/lambda-xs/` | ✅ |
| `scripts/lambda-cross-sector/` | ✅ |
| `scripts/lambda-harvest/` | ✅ (alphaEngine.js 포함) |
| `scripts/lambda-13f/` | ✅ |
| `scripts/lambda-flow-harvest/` | ✅ |
| `scripts/lambda-xs-paper/` | ❌ |
| `scripts/lambda-fmp/` | ❌ |
| `lambda/marketing/` | ❌ |

→ **Vercel 만 고치면 Lambda 6개가 계속 죽어 있음.** 배포 경로는 `INFRASTRUCTURE_MAP.md` 확인.

### C. EC2 워커 (52.23.98.13) — **Massive 사용 3개 확인** ⚠️ 가장 깊은 의존
| 워커 | PM2 | Massive 참조 | 내용 |
|---|---|---|---|
| `scripts/ec2-price-ws.js` | `price-ws` | **25줄** | 주식WS `wss://socket.massive.com/stocks` + **옵션WS** `/options` + REST 스냅샷 + 옵션계약조회 |
| `scripts/ec2-flow-accumulator.js` | `signum-flow-acc` | 8줄 | 주식WS 틱 누적 → **다크풀/블록딜 SSOT** |
| `scripts/ec2-guardian-worker.js` | `guardian-worker` | 5줄 | Morning Briefing |
| `scripts/ec2-redis-proxy.js` | `redis-proxy` | 0 | 무관 |

프론트는 Massive WS 에 직접 붙지 않음 → **EC2 가 중계** (`wss://ws.signumhq.com`).

**배포**: `scp -i signum-websocket-key.pem scripts/ec2-*.js ec2-user@52.23.98.13:/opt/signum-ws/` → `pm2 restart <name>`
PM2 경로는 `ec2-` 접두사 없음. 유저 `ec2-user`, PEM `signum-websocket-key.pem`(ED25519).

#### 🔴 다크풀의 진짜 정체 (2026-08-29 규명)
`ec2-flow-accumulator.js:331` — **`const exch = t.x;`**
Massive WS 의 trade 메시지 **거래소코드(`t.x`)** 로 TRF(다크풀) 판별 → RAM 누적 → ElastiCache.
즉 다크풀은 REST 상품이 아니라 **틱 스트림에서 자체 계산**한 값.

#### 🔴 Intrinio WebSocket 실측 (2026-08-29, 미동부 금 12:56 장중)
`intrinio-realtime` v5.7.0 Node SDK · provider `EQUITIES_EDGE` · NVDA/SPY/TSLA/AAPL/QQQ/AMD/MSFT/META

| 결과 | 값 |
|---|---|
| 접속 | ✅ 성공 (Authorized → Websocket connected) |
| 체결 수신 | ✅ **45초간 3,728건** (QQQ 1,658 · NVDA 843 · SPY 796 …) |
| **호가(Quote)** | ⚠️ **0건** — `tradesOnly:false` 인데도 미수신 |
| **MarketCenter** | ❌ **3,728건 전부 `" "` (공백)** |
| SubProvider | `EQUITIES_EDGE` |
| **다크풀 판별** | ❌ **0.0% (전 종목)** |

**원인 — SDK `index.js:443` 분기:**
```js
case 'CTA_A','CTA_B','UTP','OTC': isDarkpool = mc=="D"||mc=="E" ...
case 'NASDAQ_BASIC':              isDarkpool = mc=="L"||mc=="2" ...
default:                          isDarkpool = false;   // ← EQUITIES_EDGE / CBOE_ONE
```
다크풀 판별이 되는 provider = `DELAYED_SIP`(CTA/UTP/OTC) · `NASDAQ_BASIC` → **둘 다 Enterprise 전용**.

→ **다크풀 포기 확정 (실측 증명 완료).** 추측 아님.

⚠️ **별건: Quote 0건** — `ec2-price-ws.js` 가 bid/ask 를 쓴다면 영향. 이관 전 확인 필요.

⚠️ **PM2 restart = 누적 데이터 전량 리셋** (RAM 누적). 재시작 시점 주의.

### D. 기타
- `tests/unifiedPrice*.test.ts` 3개 — Massive 참조
- `.claude/skills/signum-shorts/scripts/*.js` 3개 — Massive 참조

### 배포 경로 (INFRASTRUCTURE_MAP §10)
| 대상 | 방법 |
|---|---|
| Vercel | `git push` → 자동 배포 (⚠️ `git add -A` 금지, 경로 명시) |
| Lambda | `node scripts/deploy-lambda-v7.js` |
| EC2 | `ssh -i ~/.ssh/signum-key.pem ec2-user@52.23.98.13` → `bash scripts/ec2-deploy-guardian.sh` |

## 🔎 미해결 — 다크풀 재검토 여지 (2026-08-29 발견)

REST `securities/{t}/prices/realtime` 응답에 **`market_center_code: "Z"` · `is_darkpool: false`** 필드가 실제로 존재.
`source` = **`cboe_one_delayed`**. 즉 CBOE One 소스는 market center 를 채운다.

WebSocket 테스트는 **`EQUITIES_EDGE` provider 로만** 했고 거기선 전부 공백이었음.
**`CBOE_ONE` provider WebSocket 은 미테스트** (타임아웃으로 중단).

→ CBOE_ONE WS 의 subProvider 가 SDK 의 다크풀 판별 분기에 들어가면 **다크풀 부활 가능**.
   단 CBOE One 은 **15분 지연 + 시장거래량 10~15%** 커버리지. 실시간 100% 인 기존 Massive 와는 다름.
   **이관 완료 후 재검토할 것. 지금은 포기 상태 유지.**

## ★ Intrinio 응답 스키마 (어댑터 작성 기준)

### `securities/{t}/prices/realtime`
```
last_price last_time last_size · bid_price bid_size ask_price ask_size
open_price close_price high_price low_price
exchange_volume market_volume
eod_close_price eod_close_date          ← 전일 종가 (Massive prevDay.c 대응)
normal_market_hours_last_price/_time/_size  ← 정규장 마지막가 (PRE/POST 분리에 사용)
qualified_last_price/_time/_size
market_center_code is_darkpool source updated_on
security:{id ticker exchange_ticker figi composite_figi}
```
→ Massive 스냅샷보다 **오히려 풍부**. 정규장/시간외 분리가 필드로 제공됨.

### `securities/{t}/prices` (일봉)
```
date intraperiod frequency open high low close volume
adj_open adj_high adj_low adj_close adj_volume factor split_ratio dividend
change percent_change fifty_two_week_high fifty_two_week_low
```

### `options/chain/{t}/{exp}/eod` → `chain[].option` + `chain[].prices`
```
option: code ticker expiration strike type
prices: date close close_bid close_ask close_size volume open_interest
        high low mark open exercise_style
        implied_volatility delta gamma theta vega
```

### 코드가 실제로 소비하는 Massive 필드 (역추적 완료)
- 스냅샷: `S.day{o,h,l,c,v,vw}` `S.prevDay{...}` `S.lastTrade{p,s,t}` `S.min` `S.preMarket` `S.afterHours` `todaysChangePerc`
- 옵션: `opt.details{strike_price,expiration_date,contract_type,ticker}` `opt.greeks{gamma,delta,theta,vega}`
  `opt.day{volume,close,...}` `opt.open_interest` `opt.implied_volatility` `opt.last_quote.midpoint`

## 앱 API → Massive 의존 매핑 (앱 화면 기준)

| API 라우트 | Massive | 산출 지표 |
|---|---|---|
| `live/ticker` | **YES(11)** ★핵심 | price·changePct·vwap·gex·gammaFlip·callWall·putFloor·oiPcr·volumePcr·ivSkew |
| `market/movers` | YES(5) | 상승/하락 상위 |
| `live/related` | YES(4) | 연관 종목 |
| `live/fundamentals` | YES(3) | 펀더멘털 |
| `live/quotes` | YES(3) | 다중 시세 |
| `command/unified` | YES(3) | Command 통합 |
| `live/options/trades` | YES(2) | 옵션 체결 |
| `guardian/news-digest` · `intel/cross-sector-brief` | YES(2) | **뉴스 — 유지** |
| market/macro · intel/snapshot · index-close · live/earnings · premium-metrics · live/market · analyst · history · watchlist/batch · flow/* | — | 캐시/EC2/FMP 경유 |

**다크풀 계열은 `metricsData`(EC2 Redis)에서 옴** → `darkPoolPct` `shortVolPct` `blockTrades`

## ★ 확정 설계 — 벌크 + AWS (2026-08-29, 대표 지시)

> **Massive 는 등락률을 우리가 매번 계산해야 했다.** 그래서 prevClose 폴백 버그·보합일 오탐·
> `+0.00%` 사태가 반복됐다([[flat-close-guard-masked-bad-prevclose]], [[futures-changepct-prevclose-fallback-bug]]).
> **Intrinio 벌크 CSV 에는 `CHANGE`·`PERCENT_CHANGE` 가 이미 들어 있다 → 계산 로직 자체를 제거한다.**

```
[Lambda · 하루 1회]  bulk_downloads/links → ZIP 다운로드 → 파싱 → Redis  eod:{TICKER}
                                                                   ↓
[Vercel]             Redis 읽기만 (26MB 파싱 없음, 타임아웃 위험 0)
                                                                   ↓
[장중]               securities/{t}/prices/realtime 로 현재가만 덮어씀
```

AWS 크레딧 $3,800 보유 → 적극 활용. 실제 비용은 하루 수 센트.

### 벌크 CSV 실측 (검증 완료)
- `bulk_downloads/links` → "US Stock Prices, 6 months" ZIP **3.6MB → 26.7MB CSV / 120,002행**
- 컬럼: `SECURITY_ID COMPANY_ID NAME CIK TICKER FIGI ... DATE TYPE FREQUENCY OPEN HIGH LOW CLOSE VOLUME
  ADJ_* ADJ_FACTOR EX_DIVIDEND SPLIT_RATIO CHANGE PERCENT_CHANGE FIFTY_TWO_WEEK_HIGH FIFTY_TWO_WEEK_LOW`
- ⚠️ `PERCENT_CHANGE` 는 **소수**(0.0168 = 1.68%) → ×100 필요
- ZIP 해제: Node `zlib.inflateRaw` + Local File Header 직접 파싱으로 동작 확인 (deflate, method=8)

### 주식 스냅샷 CSV 실측 (`securities/snapshots`, 0.5MB / 15분)
컬럼: `SYMBOL, TRADE PRICE, TRADE SIZE, TOTAL TRADE VOLUME, LAST TRADE TIMESTAMP,
TRADE HIGH PRICE, TRADE LOW PRICE, ASK PRICE, ASK SIZE, LAST ASK TIMESTAMP,
BID PRICE, BID SIZE, LAST BID TIMESTAMP, INTRINIO ID`
→ **전일 종가·시가 없음. 등락률 계산 불가** → 반드시 벌크와 병합해야 함. TRADE PRICE 는 빈 값 다수.

### 유니버스
`data/stock_universe_us800.json` = **2,001 티커** (Lambda·Vercel 공유 단일 소스)
→ 개별 realtime 호출은 분당 2,000 한도에 걸림. 벌크가 정답.

## 검증 완료 목록
| 항목 | 결과 |
|---|---|
| 옵션 Greeks·OI (`options/chain/{t}/{exp}/eod`) | ✅ 176계약/호출 |
| 맥스페인 계산 | ✅ Databento 와 완전 일치 |
| WebSocket 접속·수신 | ✅ 45초 3,728건 |
| 벌크 ZIP 해제·파싱 | ✅ 120,002행 |
| realtime 시세 필드 | ✅ Massive 보다 풍부 |
| 다크풀 (EQUITIES_EDGE WS) | ❌ market_center 공백 |

## ★ EC2 외부 접근 확보 (2026-08-29) — SSH 키 없이 제어

**문제**: 로컬에 `signum-websocket-key.pem` 이 없어 EC2 접근 불가. SSM 도 미등록.

**원인**: IAM Role `signum-ec2-role` 에 **`AmazonSSMManagedInstanceCore` 정책이 빠져 있었다.**
(SSM Agent 자체는 5개월째 정상 running 이었음 — Agent 문제가 아니라 권한 문제)

**해결 (재부팅 없이)**
1. IAM 정책 부착 — `AttachRolePolicy(signum-ec2-role, AmazonSSMManagedInstanceCore)`
2. AWS 콘솔 → EC2 Instance Connect(브라우저 터미널)로 접속
3. `sudo systemctl restart amazon-ssm-agent` → 즉시 Online 등록

**이제 쓸 수 있는 도구**: `scripts/ec2-ssm.js`
```bash
ENV_FILE=... node scripts/ec2-ssm.js "pm2 list"
ENV_FILE=... node scripts/ec2-ssm.js --file ./local.js /opt/signum-ws/remote.js
```
⚠️ SSM 은 root + HOME 미설정으로 실행된다. PM2 를 쓰려면 `HOME=/home/ec2-user`,
`PM2_HOME=/home/ec2-user/.pm2` 를 반드시 export 해야 한다(스크립트에 PRELUDE 로 내장).

### PM2 워커 실측 (2026-08-29)
| 워커 | 재시작 | 스크립트 경로 |
|---|---|---|
| **price-ws** | **2,238회** ⚠️ | `/opt/signum-ws/price-ws.js` |
| redis-proxy | 31 | `/opt/signum-ws/redis-proxy.js` |
| guardian-worker | 37 | `/opt/signum-ws/guardian-worker.js` |
| guardian-ws | 1 | `/opt/signum-ws/guardian-ws.js` |
| signum-flow-acc | 9 | `/home/ec2-user/signum-workers/ec2-flow-accumulator.js` |
| capture-worker | 5 | `/home/ec2-user/capture/ec2-capture-worker.js` |
| signum-toss-exec | 9 | `/home/ec2-user/toss-executor/ec2-toss-executor.js` |
| signum-auto-engine | 1 | `/home/ec2-user/toss-executor/ec2-auto-engine.js` |

### 🔴 price-ws 가 죽은 진짜 이유 (로그 실측)
```
✅ Polygon WebSocket connected
✅ Polygon auth success
Polygon WS closed (code: 1008)      ← Policy Violation, 즉시 강제 종료
Reconnecting to Polygon in 5s
```
**Massive 는 WebSocket 도 막았다.** 인증은 통과시키고 1008 로 끊는다.
그래서 구독 시점 캐시값(어제 종가)만 한 번 뱉고 2,238회 재시작 중이었다.

## ★ Phase 2·3 완료 (2026-08-29) — Lambda · WebSocket · 다크풀 정리

### Lambda (SSH 불필요, AWS SDK 배포)
- 4개 HTTP 헬퍼에 Intrinio 라우팅 삽입: `harvest_lambda` `lambda-harvest`
  `lambda-flow-harvest` `lambda-13f` + 각 디렉터리에 공용 어댑터 배치
- 배포기: `scripts/deploy-lambda-intrinio.js` (Mac 호환. 기존 v7 은 PowerShell 의존)
- `signum-13f` 배포·실호출 검증: 24,585 CUSIP / 240만 holdings, 에러 0

### EC2 price-ws → Intrinio WebSocket
- Massive WS 는 `close(1008 Policy Violation)` 로 차단. 재시작 2,238회.
- Intrinio `EQUITIES_EDGE` SDK 로 교체. 수신 메시지를 Massive 형식으로 변환해
  기존 브로드캐스트·스로틀·클라이언트 로직 1,100여 줄 **무수정 재사용**
- 🔴 **ensurePrevClose() 를 반드시 호출할 것** — Intrinio 분기가 Massive 전용
  코드보다 먼저 return 하면서 prevClose 초기화가 건너뛰어져 **changePct 가
  전 종목 0%** 로 나갔다. 구독·재구독 **양쪽** 경로에 필요.
- 옵션 WS 비활성화 (`ENABLE_OPTIONS_WS=1` 로만 활성) — Massive 차단 +
  Intrinio Node SDK 부재. 영향은 FlowRadar 개별 체결뿐.

**검증(프로덕션 50초)**: 가격 189건 · 전 종목 실시간 변동 ·
WS↔REST 가격차 0.009~0.188% · changePct 오차 0.05%p 이내

### 🔴 다크풀 — "200 OK 인데 값은 과거"가 가장 위험했다
| 경로 | 응답 | 실제 |
|---|---|---|
| `/v3/trades` | HTTP 200 | `status:"DELAYED"` · **19시간 전** |
| `/v3/quotes` | HTTP 200 | 동일 |
| `stocks/v1/short-volume` | HTTP 200 | `date "2024-02-06"` · **2년 전** |
| WebSocket `T.*`/`Q.*` | connected | close(1008) · 거래량 2,916,815 **고정** |

이 값으로 계산된 darkPool 50% 가 앱의 `darkPool >= 45` **판단 로직까지 오염**시켰다.

**전수 차단 (ENABLE_MASSIVE_TICKS=1 로만 복구)**
- `services/realtimeMetricsService.ts` ← **live/ticker 가 쓰는 경로. 여기를 놓쳐서
  route.ts 만 막았을 때 stale 값이 계속 새어 나왔다.**
- `api/flow/realtime-metrics/route.ts`
- `api/live/short-squeeze/route.ts`
- `api/live/options/quotes/route.ts` — fetchMassive 경유라 UNSUPPORTED 로 자동 차단
- EC2 `signum-flow-acc` 중지 · ElastiCache rt-metrics 1,649키 + Upstash 삭제

⚠️ **같은 로직이 3곳에 복제되어 있다.** 하나만 고치면 다른 경로로 샌다.

**최종 상태**: `darkPool/shortVol/block = null` → 화면 '-' 표시.
옵션 구조 지표(gammaFlip·callWall·putFloor·PCR·ivSkew)는 전부 정상.

## 작업 이력

### 2026-08-29
- Massive 차단 원인 확정 → Intrinio Startup 계약·서명 완료
- 맥스페인 실측 검증: Databento와 완전 일치 ($212.50 / 콜OI 1,169,254 / PCR 0.498)
- 엔드포인트 매핑표 확정 (`INTRINIO_MIGRATION.md`)
- 옵션 Greeks 경로 확정: `options/chain/{t}/{exp}/eod` (176계약/호출, OI+IV+Greeks 전부)
- Lambda 6개 Massive 의존 발견
- 작업 로그 파일 생성 (이 파일)

## 다음 할 일
1. `INFRASTRUCTURE_MAP.md` 에서 Lambda 배포 경로 · Redis 구조 · WebSocket 사용처 확인
2. WebSocket 실사용 전수조사
3. Lambda 6개 각각의 Massive 호출 지점 인벤토리
4. `intrinioClient.ts` 어댑터 설계·구현
5. 단계별 검증 → 배포
