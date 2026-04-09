# SIGNUM HQ — 인프라 전체 맵 (MUST READ FIRST)

> **이 파일은 매 세션 시작 시 반드시 읽어야 합니다.**
> AWS/Vercel/Redis 전체 구조, 코드 위치, 배포 방법을 기록합니다.
> 기억 못하면 이 파일 확인. 추측하지 말 것.

## 0. 핵심 개발 철학 (ABSOLUTE RULES — 모든 작업의 대전제)

> **주식 사이트의 3대 원칙: 무결성, 일관성, 속도**
> 이 원칙을 위반하는 코드는 존재해서는 안 된다.

### 🔴 절대 원칙
1. **데이터 무결성**: 모든 지표, 점수, 수치는 정확해야 한다. 근사값, 간이 계산, 하드코딩 0은 허용하지 않는다.
2. **일관성**: 동일한 티커는 어디서든(Lambda/Vercel, CACHE HIT/MISS, 유니버스/비유니버스) **같은 공식으로 같은 결과**를 보여야 한다. 두 개의 엔진이 같은 역할을 하면 안 된다.
3. **속도**: 빛의 속도로 출력될 수 있는 구조. 캐시 우선, SWR 패턴, 불필요한 API 호출 제거.

### 🔴 능동적 자세
- 유저가 물어보기 전에 불일치/비효율을 찾아내야 한다
- 하나를 수정할 때 전체 파이프라인을 추적하여 모든 사용처를 확인해야 한다
- "이 파일만 수정하면 충분하다"는 가정을 하지 말 것 — 반드시 grep으로 전수조사

---

## 1. 프로젝트 기본 정보

- **프로젝트명**: SIGNUM HQ (signumhq.com)
- **기술 스택**: Next.js 15 (App Router) + TypeScript
- **호스팅**: Vercel (프로덕션)
- **도메인**: `signumhq.com` / `www.signumhq.com`
- **로컬 프로젝트 경로**: `c:\Users\seamo\backup\stock2\`
- **Git 리모트**: `git push` → Vercel 자동 배포 (main 브랜치)
- **i18n**: ko, en, ja (next-intl)
- **결제**: Stripe (해외) + PortOne (국내)
- **인증**: Supabase Auth

---

## 2. 전체 아키텍처 (v10 — 2026-04-07 기준)

```
[Polygon API (최고 티어, 무제한)]
        │
        ▼
[AWS Lambda v8 (signum-harvest)]  ← EventBridge 5분마다 (장중)
        │
        ├──→ [DynamoDB: signum-unified-cache]    (영구 저장)
        │
        ├──→ [Redis: cache:analysis:{TICKER}]    (Dashboard/Watchlist/Portfolio용)
        │
        └──→ [Redis: cache:command:unified:{TICKER}]  (Command/Ticker 페이지용)
                    │
                    ▼
        [Vercel SSR / API Routes] ──→ [Frontend UI]
```

### 핵심 원칙
- **Lambda가 유일한 데이터 생산자** — 모든 계산 수행, 3곳에 동시 저장
- **Vercel은 읽기 전용** — Redis/DynamoDB에서 읽기만 (데이터 계산 없음)
- **⚠️ 있으면 캐시, 없으면 실데이터** — 캐시에 null이면 Polygon/FINRA에서 직접 가져옴. 캐시에만 의존하여 빈 카드 방치 금지 (2026-04-08 ROOT FIX)
- **⚠️ Lambda ↔ Vercel 구조 일치 필수** — Lambda가 저장하는 필드와 Vercel이 읽는 필드는 반드시 1:1 일치. 한쪽만 수정 시 데이터 불일치 발생. Lambda 수정 시 반드시 Vercel 읽기 측 확인 필수
- **Fundamentals 보존**: score=null이면 DynamoDB 이전 데이터 보존 (한번 성공한 데이터 절대 안 비어짐) — analyst/earnings/related도 동일
- **warm-analysis, warm-command, morning-briefing cron: 삭제 완료** (2026-04-04)
- **Flow 페이지**: Lambda Raw Cache → Vercel 계산 (2계층 캐시), 35 DTE 제한
- **Flow warm (signum-flow-harvest)**: 옵션 raw 데이터만 저장, 계산은 Vercel 담당 (업계표준 CQRS)
- **Demand-Driven Dynamic Universe**: 비유니버스 종목도 1회 조회 후 Lambda 자동 수집 (2026-04-06)

---

## 3. 사이트 페이지 구조

### 3.1 프론트엔드 페이지 (`src/app/[locale]/`)
| 경로 | 설명 | 인증 |
|------|------|:---:|
| `/` (page.tsx) | 랜딩 페이지 | 🔓 |
| `/dashboard` | 대시보드 (Watchlist + 매크로) | 🔓 Free |
| `/ticker?ticker=TSLA` | 종목 상세 Command 페이지 | 🔓/🔒 |
| `/watchlist` | 관심종목 목록 | 🔓 Free |
| `/portfolio` | 포트폴리오 | 🔓 Free |
| `/flow` | 실시간 옵션 Flow | 🔒 Pro |
| `/intel` | 섹터 Intel 보고서 (M7 등 10개) | 🔓/🔒 |
| `/intel-guardian` | Guardian AI 모니터링 | 🔒 Elite |
| `/pricing` | 가격 플랜 | 🔓 |
| `/settings` | 사용자 설정 | 🔒 |
| `/login` | 로그인 (Supabase) | 🔓 |
| `/how-it-works` | 사용법 | 🔓 |
| `/privacy`, `/terms`, `/refund` | 법적 문서 | 🔓 |

### 3.2 섹터 Intel 보고서 (10개)
| 섹터 ID | 이름 | 핵심 종목 |
|---------|------|-----------|
| `m7` | Magnificent 7 | NVDA, AAPL, MSFT, GOOGL, AMZN, META, TSLA |
| `physical_ai` | Physical AI | SERV, SYM, ISRG, TER, PL, RKLB |
| `silicon_core` | Silicon Core | AMD, AVGO, MRVL, MU, ARM, TSM, ASML |
| `power_matrix` | Power Matrix | CEG, VST, GEV, PWR, CCJ, SMR, ETN |
| `bio_pulse` | Bio Pulse | LLY, NVO, VRTX, REGN, VKTX, AMGN |
| `cyber_shield` | Cyber Shield | CRWD, PANW, FTNT, ZS, S, OKTA |
| `orbit_defense` | Orbit Defense | LMT, RTX, AXON, KTOS, ASTS, LUNR |
| `quantum_edge` | Quantum Edge | IONQ, RGTI, QBTS |
| `fintech_pulse` | Fintech Pulse | PYPL, SOFI, AFRM, HOOD, UPST |
| `cloud_fortress` | Cloud Fortress | SNOW, DDOG, NET, CRM, NOW |

---

## 4. AWS 구성요소

### 4.1 Lambda v8 → v7.1 (signum-harvest) — 2026-04-07 배포 완료
- **코드 위치**: `scripts/deploy-lambda-v7.js` (~105KB, Lambda 전체 코드 포함)
- **배포 명령**: `node scripts/deploy-lambda-v7.js`
  - zip 생성 → UpdateFunctionCode → UpdateFunctionConfiguration 자동
- **설정**: timeout=900s (15분), memory=1024MB
- **Function URL**: `https://76qkndxbhb5zknqt63g2t4cvqd.lambda-url.us-east-1.on.aws/`
- **유니버스**: **1,000종목** (`data/stock_universe_us800.json` 기준)
- **GEX 계산**: **전 1,000종목** (structureService 100% 호환)
- **동시성**: GEX 배치 10종목, RSI+DailyBars 배치 50종목
- **실행 시간**: ~88초 (5분 크론 내 여유)
- **Polygon API**: 최고 티어 (무제한 호출, rate limit 없음)

#### Lambda Step별 처리
| Step | 대상 | 내용 | API 호출 |
|------|------|------|:-------:|
| 1. Price | 1000 | 전종목 snapshot (1 API 호출) | 1 |
| 2. GEX | 1000 | structureService 호환 12개 지표 | ~3,000 |
| 3. SMA | 1000 | SMA50/200 Golden/Dead Cross | ~2,000 |
| 4. Details | 1000 | Analyst(FMP) + Earnings + Fundamentals + Related + **SI%** (Polygon SI+Float) | ~2,500 |
| 5. Alpha | 1000 | 점수 계산 (API 호출 없음) | 0 |
| **5.5. RSI+DailyBars** | **1000** | **Polygon RSI + daily aggs (sparkline/return3d/relVol)** | **~2,000** |
| 6. Unified | 1000 | DynamoDB + Redis 2키 동시 저장 + cache:analysis 빌드 | ~500 |
| RLSI | 1 | 시장 전체 RLSI 지표 | 3 |

#### Step 5.5 상세 (RSI + Daily Bars)
- **RSI**: Polygon `/v1/indicators/rsi/{ticker}?timespan=day&window=14&limit=1`
- **Daily Bars**: Polygon `/v2/aggs/ticker/{ticker}/range/1/day/{from}/{to}?limit=30&adjusted=true&sort=asc`
- 25일치 데이터 → sparkline(last 20 closes), return3d(3일 수익률), relVol(금일/전일 거래량비)
- 배치 50종목 동시 → 1000종목 ~25초

#### GEX 계산 로직 (structureService.ts 호환)
- **만기 필터**: `getWeeklyOptions()` — 주간만기 1개만 (전체 만기 아님)
- **callWall/putFloor**: 현재가 ±20% 범위 내 max OI strike
- **gammaFlip**: 누적 GEX 교차점 (단순 `(cw+pf)/2` 평균 아님)
- **squeezeScore**: 5요인 모델 (netGex, PCR, IV, callWall거리, putFloor거리)
- **ATM IV**: ATM 근처 Call/Put 각각 IV 계산 후 평균
- **gexConfidence**: 감마 커버리지 기반 (80%↑=HIGH, 60%↑=MEDIUM, else LOW)
- **netPremium**: (callOI총합 × callIV평균) - (putOI총합 × putIV평균)

#### Lambda Redis 저장
| Redis 키 | 형식 | 용도 |
|----------|------|------|
| `cache:analysis:{TICKER}` | AnalysisCacheEntry (**31필드**) | Dashboard/Watchlist/Portfolio |
| `cache:command:unified:{TICKER}` | 9개 섹션 전체 데이터 | Command/Ticker 페이지 |
- TTL: 259,200초 (3일)
- 방식: Upstash REST API pipeline (배치 20개씩)
- **cache:analysis**: structure 없어도 항상 기록 (가격/RSI/sparkline만으로도 캐시 HIT 보장)

#### 유니버스 단일 소스
- **소스**: `data/stock_universe_us800.json` (1,000종목)
- **Lambda 변수**: `UNIVERSE` (기존 `UNIVERSE_500` 완전 제거)
- **Vercel 변수**: `src/lib/universe.ts` → `export const UNIVERSE` (us800.json 직접 import)
- **Command 유니버스 판별**: `src/app/api/command/unified/route.ts` → `UNIVERSE.includes(ticker)`

#### cache:analysis 필드 완전 목록 (2026-04-07)
| 필드 | 소스 | 커버리지 |
|------|------|:---:|
| alphaSnapshot (score/grade/action) | computeAlphaScore() | 100% |
| rsi | Polygon `/v1/indicators/rsi` | 100% |
| return3d | Polygon daily bars (3일 수익률) | 100% |
| sparkline | Polygon daily bars (last 20 closes) | 100% |
| relVol | today/yesterday volume ratio | 100% |
| whaleIndex | **Composite** (GEX+DP+Block+NP 각 25%) | 99% |
| whaleConfidence | 다중 신호 기반 (HIGH/MED/LOW/NONE) | 99% |
| darkPoolPct | rt-metrics (flow-harvest) | 100% |
| volume | Polygon snapshot | 100% |
| vwapDist | Polygon snapshot vwap | 100% |
| ivSkew | callWall-putFloor spread / price | 96.8% |
| impliedMovePct | callWall-putFloor spread / price | 96.8% |
| maxPain | structureService | 100% |
| gex | structureService netGex | 99% |
| pcr | structureService pcRatio | 97.3% |
| iv | structureService atmIv | 99.4% |
| callWall / putFloor | structureService levels | 98%+ |
| squeezeScore | structureService 5요인 | 98% |
| netPremium | structureService | 99.4% |
| expiration | structureService | 100% |

#### Composite WhaleIndex 공식 (2026-04-07)
```
WhaleIndex (0-100) = GEX(25) + DarkPool(25) + BlockTrades(25) + NetPremium(25)

1. GEX (0-25):    |GEX| > 50M=25, >10M=20, >1M=15, >100K=8
2. DarkPool (0-25): DP% >= 60=25, >=45=20, >=30=12, >0=5
3. BlockTrades (0-25): BT >= 10=25, >=5=20, >=2=15, >=1=8
4. NetPremium (0-25): |NP| > 10M=25, >5M=20, >1M=15, >100K=8

Confidence: 4개 중 강한 신호 3+개=HIGH, 2개=MED, 1개=LOW, 0=NONE
```
✅ **완료 (2026-04-07)**: Lambda Composite WhaleIndex가 Vercel 실시간 경로와 100% 통합됨.
`calculateWhaleIndex(gex, darkPoolPct, blockTrades, netPremium)` — Lambda/Vercel 동일 공식.

#### Lambda On-demand 모드
- **URL**: `GET https://76qkndxbhb5zknqt63g2t4cvqd.lambda-url.us-east-1.on.aws/?ticker=BABA`
- **AWS CLI**: `aws lambda invoke --function-name signum-harvest --payload '{"onDemandTicker":"BABA"}'`
- **Node**: `new LambdaClient().send(new InvokeCommand({FunctionName:'signum-harvest',Payload:JSON.stringify({onDemandTicker:'BABA'})}))`
- **저장**: DynamoDB + Redis (cache:analysis + cache:command:unified) 동시

### 4.2 Lambda v2.1 (signum-flow-harvest) — Flow 페이지 전용
- **코드 위치**: `scripts/lambda-flow-harvest/index.js`
- **배포 스크립트**: `scripts/deploy-flow-harvest.js`
- **배포 명령**: `node scripts/deploy-flow-harvest.js`
- **설정**: timeout=600s (10분), memory=1024MB (1GB)
- **런타임**: nodejs20.x
- **EventBridge**: `signum-flow-harvest-5min` (rate(5 minutes), ENABLED)
- **유니버스**: 1,000종목 (`data/stock_universe_us800.json`) + **동적 유니버스** (비유니버스 종목)
- **실행 시간**: ~288초 (4분48초), 1000종목, fail=0
- **완전 독립**: signum-harvest와 코드/스케줄/실행 완전 분리

#### Flow Harvest 아키텍처 (CQRS — Raw Cache Only)
```
[Lambda v2.1] → Polygon API → raw 원본 → Redis 저장 (계산 0, 가공 0)
                                  ↓
[Vercel API]  → Redis에서 raw 읽기 → Max Pain, GEX, Gamma Flip 등 계산
```

#### 저장 키 / TTL
| Redis 키 | TTL (장중) | TTL (장외) | 내용 |
|----------|:---:|:---:|------|
| `polygon:snapshot:probe:{TICKER}` | 10분 | 24h/72h | Polygon 옵션 스냅샷 원본 (probe+exact) |
| `rt-metrics:{TICKER}` | 10분 | 24h/72h | 실시간 메트릭스 (DP%, Short%, Block) |
| `cache:flow:unified:{TICKER}` | 5분 | 24h/72h | 플로우 통합 캐시 |
| `darkpool:{TICKER}` | 5분 | 24h/72h | 다크풀 트레이드 상세 |

#### 장외시간/주말 TTL 보존 (Dynamic TTL)
| 시간대 | TTL | 설명 |
|--------|:---:|------|
| 장중 (8:00-19:00 ET) | 5-10분 | 데이터 신선도 최우선 |
| 장 마감 직후 (19:00-20:00 ET) | **24시간** | 마지막 데이터 보존 |
| 금요일 장 마감 / 주말 | **72시간** | 월요일까지 보존 |

#### Demand-Driven Dynamic Universe (비유니버스 종목)
```
1. 사용자가 AMC(비유니버스) 조회 → Vercel: Polygon 직접 호출 (첫 1회, 느림)
2. Vercel: raw 데이터를 polygon:snapshot:probe:AMC에 저장 (10분 TTL)
3. Vercel: 'flow:dynamic-universe' 리스트에 AMC 등록 (장 마감까지 TTL)
4. Lambda 다음 실행(5분 이내): dynamic-universe 읽기 → AMC 발견 → 수집 시작
5. 이후 AMC = 유니버스 종목과 동일 속도 (5분마다 자동 갱신)
6. 장 마감 → Lambda 정지 → dynamic-universe TTL 만료 → AMC 수집 중단
7. 다음날: 아무도 조회 안 하면 수집 안 함 / 다시 조회하면 다시 등록
```
- Redis 키: `flow:dynamic-universe` (JSON 배열, 장 마감까지 TTL)
- Lambda 코드: 유니버스 처리 완료 후 별도 try/catch 블록에서 실행
- **유니버스 코드 무변경** — 동적 처리는 완전 분리

#### Vercel 측 Cache-First 연동
| 파일 | 변경 내용 |
|------|----------|
| `centralDataHub.ts` | Lambda 캐시 체크 (L425-439) → HIT 시 Polygon 스킵 + Demand-Cache 저장 |
| `structureService.ts` | Lambda 캐시를 Reference API 전에 체크 (L241-260) → HIT 시 3단계 전부 스킵 |
| `FlowPageClient.tsx` | `displayPrice > 0` 블로킹 가드 제거 → Progressive Rendering |

### 4.3 EC2 워커 (52.23.98.13)
| 워커 | 파일 | 역할 |
|------|------|------|
| Guardian Worker | `scripts/ec2-guardian-worker.js` (42KB) | Morning Briefing AI, DynamoDB→Redis |
| Price WebSocket | `scripts/ec2-price-ws.js` (52KB) | 실시간 가격 WebSocket 허브 |
| Redis Proxy | `scripts/ec2-redis-proxy.js` | ElastiCache HTTP 프록시 |
- **Instance ID**: `i-0c8e51d26ddc9b3c1`
- **WebSocket URL**: `wss://ws.signumhq.com`
- **배포**: `bash scripts/ec2-deploy-guardian.sh`

### 4.4 DynamoDB 테이블
| 테이블명 | PK | SK | 용도 |
|---------|----|----|------|
| `signum-unified-cache` | ticker (string) | — | 전체 unified 9섹션 데이터 |
| `signum-gex-history` | ticker | timestamp | GEX 스냅샷 히스토리 |
| `signum-alpha-history` | ticker | date | Alpha Score 일별 (SSR_V46) |
| `signum-flow-history` | ticker | timestamp | 플로우 데이터 히스토리 |
| `signum-sector-daily` | sectorId | date | 섹터 일별 스냅샷 |
| `signum-rlsi-history` | pk='MARKET' | timestamp | RLSI 히스토리 |
| `signum-pattern-db` | pattern | — | ANALYST:, EARNINGS:, FUND:, SI:, RELATED: 패턴 |
| `signum-backtest-results` | — | — | 백테스트 결과 |

### 4.5 DynamoDB 클라이언트 (Vercel 측 읽기)
| 파일 | 역할 |
|------|------|
| `src/lib/aws/dynamoClient.ts` | DynamoDB 연결, TABLES 상수 |
| `src/lib/aws/dynamoDataProvider.ts` | getLatestGex, getLatestPrice 등 |
| `src/lib/aws/unifiedCacheProvider.ts` | `getUnifiedCache()` — DynamoDB fallback 읽기 |
| `src/lib/aws/historyMiddleware.ts` | `recordAlphaDaily()` — fire-and-forget 저장 |
| `src/lib/aws/historyStore.ts` | saveGexSnapshot, GexHistoryItem 타입 |
| `src/lib/aws/flowCacheProvider.ts` | 플로우 캐시 |
| `src/lib/aws/priceCacheStore.ts` | 가격 캐시 |

### 4.6 S3
- **버킷**: `signum-hq-archive`
- **용도**: 보고서 아카이빙

---

## 5. Vercel Cron Jobs (vercel.json)

### 5.1 ✅ 삭제 완료 (2026-04-04)
| 크론 | 상태 |
|------|------|
| `warm-analysis` | ✅ 삭제됨 — Lambda가 cache:analysis 직접 저장 |
| `warm-command` (2개) | ✅ 삭제됨 — Lambda가 cache:command:unified 직접 저장 |
| `morning-briefing` (2개) | ✅ 삭제됨 — EC2 Guardian으로 이관 |

### 5.2 현재 활성 크론 (vercel.json 등록)
| 크론 | 스케줄 (UTC) | 역할 |
|------|-------------|------|
| `report?type=final` | `0 14 * * 1-5` | 장마감 보고서 |
| `report?type=live` | `30 15 * * 1-5` | 장중 보고서 |
| `snapshot?sector=m7~cloud_fortress` | `0-45/5 21 * * 1-5` | 10개 섹터 스냅샷 (5분 간격) |
| `market-feed` | `*/2 * * * *` | 마켓 피드 (VIX, F&G, 국채 등) |
| `warm-news-digest` | `*/15 * * * *` | 뉴스 다이제스트 |
| `event-detect` | `*/5 13-21 * * 1-5` | 이벤트 감지 |
| `track-verify` | `30 21 * * 1-5` | 트랙 레코드 검증 |
| `cross-sector-brief` | `50 21 * * 1-5` | 크로스섹터 브리프 |
| `economic-calendar` | `*/30 13-21 * * 1-5` + `0 */4 * * *` | 경제 캘린더 |
| `daily-content?type=all` | `30 20 * * 1-5` | 일일 콘텐츠 |
| `marketing-dispatch` (10개) | 다양 | 마케팅 자동화 (Buffer API) |

---

## 6. Redis 캐시 키 구조

| 키 패턴 | 소스 | TTL | 용도 |
|---------|------|-----|------|
| `cache:analysis:{TICKER}` | **Lambda 직접** | 3일 | Alpha + 옵션 구조 요약 |
| `cache:command:unified:{TICKER}` | **Lambda 직접** | 3일 | 9섹션 전체 데이터 |
| `cache:command:overview:{TICKER}:{locale}` | Command API 요청 시 | 1h | 번역된 오버뷰 |
| `cnn:feargreed` | market-feed cron | — | Fear & Greed |
| `yahoo:vix3m` | market-feed cron | — | VIX3M |
| `prev-day-pct:{TICKER}` | dashboard/unified | 10min | 전일 대비 변화율 (**Vercel 1h 메모리 캐시**) |
| `macro:snapshot` | market-feed cron | — | 매크로 스냅샷 |
| `polygon:snapshot:probe:{TICKER}` | **Lambda flow-harvest / Vercel on-demand** | 10min~72h | Polygon 옵션 스냅샷 원본 (raw) |
| `rt-metrics:{TICKER}` | **Lambda flow-harvest** | 10min~72h | 실시간 메트릭스 (DP/Short/Block) |
| `cache:flow:unified:{TICKER}` | **Lambda flow-harvest** | 5min~72h | 플로우 통합 캐시 |
| `darkpool:{TICKER}` | **Lambda flow-harvest** | 5min~72h | 다크풀 트레이드 |
| `flow:dynamic-universe` | **Vercel (on-demand)** | 장 마감까지 | 동적 유니버스 목록 (JSON 배열) |
| `flow:ticker:lite:{TICKER}` | Vercel /api/live/ticker | 60초 | API 응답 전체 캐시 |

### ⚠️ Redis 키 접근 규칙
```
✅ 올바른: getAnalysisCache('TSLA')           → 내부적으로 'cache:analysis:TSLA' 사용
❌ 잘못된: getFromCache('analysis:TSLA')       → prefix 누락, 데이터 못 찾음
```
- `cache:analysis:*` → 반드시 `analysisCache.ts`의 함수 사용
- `cache:command:unified:*` → `getFromCache('cache:command:unified:TICKER')` 직접 사용 OK

---

## 7. 핵심 API Routes

### 7.1 통합 API (페이지별 주 데이터 소스)
| 경로 | 역할 | 데이터 소스 |
|------|------|------------|
| `/api/command/unified?t=TSLA&lang=ko` | Command 페이지 | Memory → Redis → DynamoDB → Polygon |
| `/api/dashboard/unified?t=TSLA` | Dashboard | Redis cache:analysis → DynamoDB → **Polygon 라이브 폴백** (VWAP/ShortVol/PCR) |
| `/api/watchlist/batch` (POST) | Watchlist | Redis → structureService fallback |
| `/api/portfolio/batch` (POST) | Portfolio | Redis → structureService fallback |

### 7.2 Live API (sub-API, 개별 데이터)
| 경로 | 역할 |
|------|------|
| `/api/live/options/structure?t=TSLA` | 옵션 구조 (structureService 실시간) |
| `/api/live/options/atm?t=TSLA` | ATM IV |
| `/api/live/volatility-regime?t=TSLA` | 변동성 레짐 |
| `/api/live/overview?t=TSLA&lang=ko` | 종목 오버뷰 |
| `/api/live/analyst?t=TSLA` | 애널리스트 |
| `/api/live/fundamentals?t=TSLA` | 펀더멘털 |
| `/api/live/earnings?t=TSLA` | 실적 일정 |
| `/api/live/sma?t=TSLA` | SMA 50/200 |
| `/api/live/short-squeeze?t=TSLA` | 숏스퀴즈 |
| `/api/live/related?t=TSLA` | 관련 종목 |
| `/api/live/news?t=TSLA` | 뉴스 |
| `/api/live/macd?t=TSLA` | MACD |
| `/api/live/prev-day?t=TSLA` | 전일 가격 |
| `/api/live/prices?symbols=TSLA,AAPL` | 실시간 가격 |
| `/api/live/quotes` | 실시간 호가 (**flow:extended 60s 메모리 캐시**) |
| `/api/live/market` | 마켓 상태 |
| `/api/live/treasury` | 국채 수익률 |
| `/api/live/risk-factors?t=TSLA` | 리스크 팩터 |

### 7.3 기타 API
| 경로 | 역할 |
|------|------|
| `/api/chart?t=TSLA&range=1d` | 차트 데이터 |
| `/api/stock/search?q=tesla` | 종목 검색 |
| `/api/sparkline` | 스파크라인 |
| `/api/logo?ticker=TSLA` | 로고 |
| `/api/og` | OG 이미지 생성 |
| `/api/stripe/*` | Stripe 결제 |
| `/api/guardian/*` | Guardian AI |
| `/api/intel/*` | 섹터 Intel |
| `/api/history/*` | 히스토리 데이터 |

---

## 8. 핵심 서비스 파일

### 8.1 데이터 수집/계산
| 파일 | 역할 |
|------|------|
| `src/services/structureService.ts` | 옵션 구조 12개 지표 계산 (Lambda가 이식) |
| `src/services/stockApi.ts` | getStockData, getOptionsData (Polygon 래퍼) |
| `src/services/massiveClient.ts` | Polygon "Massive" API 클라이언트 |
| `src/services/alphaEngine.ts` | Alpha Score V5 엔진 (32 Gates) |

### 8.2 캐시/프로바이더
| 파일 | 역할 |
|------|------|
| `src/services/analysisCache.ts` | Redis cache:analysis CRUD (AnalysisCacheEntry 타입) |
| `src/services/redisClient.ts` | Redis 클라이언트 (EC2 Proxy + Upstash) |
| `src/services/macroHubProvider.ts` | 매크로 데이터 SSOT |
| `src/services/marketStatusProvider.ts` | 마켓 상태 (pre/regular/post/closed) |

### 8.3 배치 서비스
| 파일 | 역할 |
|------|------|
| `src/services/watchlistBatchService.ts` | Watchlist 배치 (getAnalysisCacheForTickers → fallback 계산) |
| `src/services/portfolioBatchService.ts` | Portfolio 배치 (동일 패턴) |

### 8.4 유니버스
| 파일 | 역할 |
|------|------|
| `src/lib/universe.ts` | UNIVERSE_500 배열 (Vercel용) |
| `src/services/universePolicy.ts` | 유니버스 정책 관리 |
| `data/stock_universe_us800.json` | Lambda용 1000종목 JSON |

---

## 9. 환경 변수 (.env.local — 35개)

### 9.1 AWS
| 변수 | 값 (앞 20자) | 용도 |
|------|-------------|------|
| `AWS_ACCESS_KEY_ID` | `AKIARBHTX7L4WODUFRIF` | IAM 접근 |
| `AWS_SECRET_ACCESS_KEY` | `t5N4C9RJdCnoR0Q9Vf10` | IAM 시크릿 |
| `AWS_DEFAULT_REGION` | `us-east-1` | 리전 |
| `AWS_REGION` | `us-east-1` | 리전 (중복) |
| `AWS_ELASTICACHE_ENDPOINT` | `signum-redis.dhzfzt` | ElastiCache 엔드포인트 |
| `AWS_S3_BUCKET` | `signum-hq-archive` | S3 버킷 |
| `AWS_SECURITY_GROUP_ID` | `sg-09c198387d9c97ce5` | VPC SG |
| `AWS_VPC_ID` | `vpc-05a449f57b868a8a` | VPC |

### 9.2 Redis (Upstash)
| 변수 | 용도 |
|------|------|
| `UPSTASH_REDIS_REST_URL` | Upstash REST API URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash REST 인증 토큰 |

### 9.3 외부 API
| 변수 | 용도 |
|------|------|
| `MASSIVE_API_KEY` | Polygon "Massive" API (⚠️ 이것이 Polygon 키) |
| `POLYGON_API_KEY` | Lambda용 Polygon 키 (deploy 스크립트에 하드코딩 fallback도 있음) |
| `FINNHUB_API_KEY` | Finnhub API (**Vercel Intel 페이지 전용**: Earnings Calendar, Analyst Recommendation; Lambda에서는 미사용) |
| `FMP_API_KEY` | Financial Modeling Prep API |

### 9.4 인증/결제
| 변수 | 용도 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon 키 |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe 공개 키 |
| `NEXT_PUBLIC_PORTONE_STORE_ID` | PortOne 결제 |
| `NEXT_PUBLIC_PORTONE_CHANNEL_KEY` | PortOne 채널 |
| `CRON_SECRET` | Vercel cron 인증 시크릿 |

### 9.5 EC2/웹소켓
| 변수 | 용도 |
|------|------|
| `EC2_INSTANCE_ID` | `i-0c8e51d26ddc9b3c1` |
| `EC2_PUBLIC_IP` | `52.23.98.13` |
| `NEXT_PUBLIC_WEBSOCKET_URL` | `wss://ws.signumhq.com` |
| `NEXT_PUBLIC_GUARDIAN_WS_URL` | `wss://ws.signumhq.com` |

### 9.6 마케팅
| 변수 | 용도 |
|------|------|
| `BUFFER_ACCESS_TOKEN` | Buffer API (SNS 자동 게시) |
| `BUFFER_ORGANIZATION_ID` | Buffer 조직 ID |
| `NEXT_PUBLIC_ADMIN_EMAILS` | `pick8775@gmail.com` |

---

## 10. 배포 방법

### Vercel 배포 (프론트엔드 + API)
```powershell
cd c:\Users\seamo\backup\stock2
git add -A
git commit -m "설명"
git push
```
- `main` 브랜치 push → Vercel 자동 빌드+배포 (2~3분)

### Lambda v8 배포 (데이터 수확기)
```powershell
cd c:\Users\seamo\backup\stock2
node scripts/deploy-lambda-v7.js
```
- zip 생성 → UpdateFunctionCode → UpdateFunctionConfiguration 자동
- env vars (UPSTASH, FINNHUB, FMP) 자동 주입

### EC2 Guardian 배포
```bash
ssh -i ~/.ssh/signum-key.pem ec2-user@52.23.98.13
bash scripts/ec2-deploy-guardian.sh
```

---

## 11. 작업 이력

### 2026-04-08 (Guardian 모닝 브리핑 V8.1 JSON 파서 방어)
1. **문제**: AWS Bedrock(Claude)이 브리핑 텍스트 내부에 이스케이프되지 않은 큰따옴표(`"`)를 사용하거나 줄바꿈(`\n`)을 무단 사용하여 Vercel의 `JSON.parse` 단계에서 500 에러 발생 (Position 420 에러).
2. **증상**: 에러 발생 시 반복 실패 후 ElastiCache에 `source: "error"` 꼬리표와 함께 `temporarily unavailable` 이라는 데이터가 저장되어 프론트엔드에 그대로 노출됨.
3. **해결 (`route.ts`)**: 프롬프트 `<critical_rules>`에 "큰따옴표 문장 내 사용 불가(작은따옴표 대체)" 및 "줄바꿈(엔터) 금지, 단일 문단 작성"을 강력하게 강제하여 파싱 에러 원천 차단.
4. **캐시 소각**: ElastiCache 내부의 구버전 유령 데이터 (`:ko`, `:en`, `:ja`, `legacy`) 4개 키를 일괄 소각하여 프론트엔드의 자가 치유(Self-Healing) 로직이 정상 작동되도록 조치.

### 2026-04-07~08 (Dashboard 데이터 무결성 ROOT FIX)

> **근본 원칙**: "있으면 캐시, 없으면 실데이터" — 캐시 null 시 빈 카드 방치 금지

1. **Market Status Badge 수정**: API 캐시 의존 → **클라이언트 ET 시간 직접 계산**
   - 이전: `market?.marketStatus` (API null → CLOSED 표시 버그)
   - 이후: `getETSession()` 클라이언트 함수 (ET 시간 기반 PRE/OPEN/AFTER/CLOSED)
   - 파일: `DashboardClient.tsx`
2. **Stale V3 Cache 감지**: V3.1 필드 없는 분석 캐시 자동 재계산
   - `isStaleV3Cache = analysis && !('shortVolPct' in analysis)` → FULL 경로 강제
   - 파일: `watchlistBatchService.ts`
3. **Dashboard Unified API 라이브 폴백 (ROOT FIX)**:
   - **VWAP**: `ac.vwap` → `snap.day.vw` → `snap.prevDay.vw` → **Polygon 스냅샷 API**
   - **Short Vol %**: `ac.shortVolPct` → **`fetchShortVolumeData()` 라이브 호출**
   - **Volume PCR**: `ac.volumePcr` → `ac.pcr` (OI 기반 폴백)
   - 파일: `unified/route.ts` (Lines 592-626, 710-715)
4. **Pre-market 데이터 폴백 (watchlistBatchService)**:
   - VWAP: `day.vw || prevDay.vw` (전일 VWAP 폴백)
   - Volume PCR: 볼륨=0 → OI 기반 PCR 폴백
   - 파일: `watchlistBatchService.ts` (Lines 106, 480-503)
5. **DynamoDB VWAP 미저장 발견**: `priceCacheStore.ts`에 VWAP 필드 없음
   - 해결: Polygon 스냅샷 API 직접 호출 (`/v2/snapshot/locale/us/markets/stocks/tickers`)

#### 수정 전후 비교 (ASTS 기준)
| 필드 | 수정 전 | 수정 후 |
|------|---------|--------|
| Market Badge | CLOSED (프리마켓 중) | LIVE PRE / LIVE OPEN |
| VWAP | — (null) | $91.76 |
| Short Vol % | — (null) | 54.1% HIGH |
| P/C RATIO | — — (null) | 0.79 Balanced |
| Dark Pool % | — (null) | 64.7% |

#### 커밋 이력
- `013bfe1e` Market badge + stale analysis cache fix
- `1772f93c` VWAP/PCR pre-market fallback
- `275e964c` ROOT FIX: 캐시 없으면 실데이터 원칙
- `ae5eeb46` ROOT FIX: VWAP from Polygon snapshot

### 2026-04-06~07 (cache:analysis 완전 복원 + Composite WhaleIndex)
1. **RSI 추가**: Polygon `/v1/indicators/rsi` — Step 5.5로 배치 호출 (995/1000)
2. **Daily Bars 추가**: Polygon `/v2/aggs/range/1/day` — sparkline/return3d/relVol 계산
3. **ivSkew/impliedMovePct 수정**: OMR 방식 → callWall-putFloor spread 방식으로 변경
4. **WhaleIndex Composite 전환**: GEX-only(버그) → GEX+DarkPool+BlockTrades+NetPremium
5. **Lambda 성능 최적화**: RSI+DailyBars 배치 10→50, 총 실행 380초→88초
6. **전체 유니버스 감사**: 994/1000 (99.4%), 전 필드 96%+ 커버리지 확인
7. **디버그 로그 정리**: TSLA OMR 디버그 제거, 타임아웃 로그 수정 (600s→900s)

#### 감사 결과 (2026-04-07)
- 유니버스: 994/1000 (99.4%) — 누락 6: ANSS,NGD,PARA,PEAK,SQ,TGNA (Polygon 미제공)
- alpha: 100%, rsi: 100%, return3d: 100%, sparkline: 100%, relVol: 100%
- whaleIndex: 99%, darkPoolPct: 100%, volume: 100%, vwapDist: 100%
- ivSkew/impliedMovePct: 96.8%, maxPain: 100%, gex: 99%, pcr: 97.3%

### 2026-04-03~04 (Lambda v8 단일 파이프라인 통합)
1. **Phase 1**: Lambda structureService 100% 이식 (12개 지표, ±20% callWall/putFloor)
2. **Phase 2**: 유니버스 509→1000 확장, GEX 99→1000 전체 확장
3. **Phase 3**: Lambda→Redis cache:analysis 직접 저장 (Upstash REST pipeline)
4. **Phase 4**: 전 9개 서비스 Redis 키 검증 (dashboard `analysis:` → `cache:analysis:` 수정)
5. **Phase 5**: warm-analysis/warm-command/morning-briefing cron 역할 제거 확인
6. **Phase 6**: AWS Lambda 배포 + on-demand TSLA 검증 (9/9 필드)
7. **Phase 7**: Lambda→Redis cache:command:unified 직접 저장 (warm-command 완전 대체)
### 2026-04-04 (Flow 최적화 + 정리)
1. **vercel.json cron 5개 삭제** — warm-command(×2), warm-analysis(×1), morning-briefing(×2)
2. **Flow 페이지 35 DTE 최적화** — `centralDataHub.ts` probe API에 `expiration_date.lte` 추가
   - 실측: SPY 21,378ms → **1,914ms** (91%↓), TSLA 8,697ms → 5,547ms (36%↓)
   - NVDA 7,915ms → 4,019ms (49%↓), PLTR 5,595ms → 3,267ms (42%↓)
3. **whale-trades 캐시 수정** — 0건이어도 Redis 저장 (perpetual cold start 해결)
4. **포트폴리오 반응성 수정** — AddHoldingModal이 hook의 `addHolding` 사용으로 즉시 반영

### 2026-04-02
1. Dashboard 가격 flickering 수정 (immutable cache fill)
2. POST badge session-aware 수정
3. 가격 표시 PHASE 2 완료

---

## 12. 배포 가이드 (ALL PLATFORMS)

> **배포 누락 방지**: 코드 변경 시 어떤 플랫폼에 배포해야 하는지 반드시 확인할 것.

### 12.1 Vercel (프론트엔드 + API Routes + Cron)
```powershell
# 1) 빌드 확인
npx tsc --noEmit
# 2) 커밋 & 배포 (main 브랜치 push = 자동 배포)
git add -A; git commit -m "설명"; git push
```
- **영향 범위**: `src/` 하위 모든 파일, `vercel.json` (cron)
- **확인**: Vercel Dashboard → Deployments

### 12.2 Lambda: signum-harvest (메인 데이터 수집)
```powershell
node scripts/deploy-lambda-v7.js
```
- **영향 범위**: `scripts/deploy-lambda-v7.js` (~105KB, Lambda 전체 코드 내장)
- **동작**: zip 생성 → UpdateFunctionCode → UpdateFunctionConfiguration 자동
- **Function**: `signum-harvest` (us-east-1)

### [2026-04-08] 실시간 시세 Websocket 세션 분리 및 UI 동기화 완료
* **이슈:** 본장 전후(Pre/Post) 시간에 LiveTickerDashboard와 Watchlist의 가격 및 등락률이 본장 가격을 덮어쓰거나, UI에 세션 라벨(PRE/POST)이 반영되지 않는 문제.
* **해결 (dashboardStore.ts & DashboardClient.tsx):**
  * `dashboardStore.ts`의 `updateRealtimePrice`를 세션 기반으로 분리하여, 프리마켓/애프터마켓 가격이 본장 가격(`underlyingPrice`)을 덮어쓰지 않도록 격리. `prevChangePct`, `intradayChangePct` 필드를 보존.
  * `DashboardClient.tsx`의 워치리스트 헤더(extHeaderLabel) 연산을 `market.marketStatus`에 반응형으로 연동하여 실시간 세션에 맞게 동적으로 표시되도록 수정.
  * API(`live/quotes/route.ts`)에서 PRE 세션 fallback 누수를 차단.

### [2026-04-08] Watchlist AWS Cache 무결성 확보 및 프리마켓 null 초기화 폭탄 제거 (Lambda v8.1)
* **이슈:** Watchlist 접속 시 10~20초 로딩 지연 현상(Full Compute 병목) 및 특정 시간대(프리마켓/애프터마켓)에 GEX, IV, Whale Index 등의 지표가 `FLAT`이나 `-`로 나오는 대규모 데이터 소실 현상.
* **원인 추적 결과:** 
  1. **백엔드(Lambda):** `deploy-lambda-v7.js` 내부에서 정규장(`isRegular`) 시간이 아니면 옵션/지표 연산을 스킵하면서, 기존 캐시를 보존하지 않고 전체 옵션 필드를 `null`로 덮어쓰는 치명적 폭탄 로직 발견.
  2. **프론트엔드(Vercel):** `watchlistBatchService.ts`에서 불완전한 캐시(예: `shortVolPct` 부재)를 받으면 즉시 Vercel 서버가 Polygon API를 직접 호출해 1,000종목을 강제 재계산(`isStaleV3Cache`)하느라 API Timeout(504) 및 UI 렌더링 지연 발생.
* **해결 (lambda-harvest & watchlistBatchService.ts):**
  * **프론트엔드:** `isStaleV3Cache` 폐기 로직을 전면 제거하여, Lambda가 서빙하는 `cache:analysis` 통함 데이터를 워치리스트가 100% 신뢰하고 즉시 로딩하도록 변경 (0.01초 렌더링 확보).
  * **백엔드(Lambda 수술 및 배포):** Lambda 스크립트 내부의 `if (isRegular)` 시간 제한을 철폐하여, 언제 어느 시간(Pre-Market, Post-Market)이든 항상 이전 종가 기준 옵션 데이터 기반으로 파생 지표(Whale Index, Squeeze Score 등)가 무결점으로 100% 채워져 Redis로 들어가도록 구조 수술 후 AWS 즉각 배포 완료.

---
*(이 문서는 프로젝트 진행에 따라 지속적으로 업데이트됩니다)*

### 12.3 Lambda: signum-flow-harvest (Flow 데이터 수집)
```powershell
node scripts/deploy-flow-harvest.js
```
- **영향 범위**: `scripts/lambda-flow-harvest/index.js`
- **Function**: `signum-flow-harvest` (us-east-1)

### 12.4 EC2 Guardian Worker (Morning Briefing + RLSI + 알림)
```powershell
# SSH 키: signum-websocket-key.pem (프로젝트 루트)
# EC2 IP: 52.23.98.13 (Instance: i-0c8e51d26ddc9b3c1, t3.small)

# 방법 A: SCP + PM2 (수동)
scp -i "signum-websocket-key.pem" scripts/ec2-guardian-worker.js ec2-user@52.23.98.13:/home/ec2-user/guardian/ec2-guardian-worker.js
ssh -i "signum-websocket-key.pem" ec2-user@52.23.98.13 "pm2 restart guardian-worker"

# 방법 B: 배포 스크립트 (3개 워커 일괄)
bash scripts/ec2-deploy-guardian.sh
```
- **영향 범위**: `scripts/ec2-guardian-worker.js` (42KB)
- **디렉토리**: `/home/ec2-user/guardian/`
- **PM2 프로세스명**: `guardian-worker`
- **확인**: `ssh ... "pm2 logs guardian-worker --lines 10 --nostream"`

### 12.5 EC2 기타 워커
| 워커 | 파일 | EC2 경로 | PM2 이름 |
|------|------|---------|---------|
| Guardian Worker | `scripts/ec2-guardian-worker.js` | `/home/ec2-user/guardian/` | `guardian-worker` |
| Price WebSocket | `scripts/ec2-price-ws.js` | `/home/ec2-user/signum/` | — |
| Redis Proxy | `scripts/ec2-redis-proxy.js` | `/home/ec2-user/signum/` | — |

### 12.6 변경 → 배포 대상 매핑
| 수정한 파일 | 배포 대상 |
|-------------|----------|
| `src/**/*.ts`, `src/**/*.tsx` | **Vercel** (`git push`) |
| `vercel.json` | **Vercel** (`git push`) |
| `scripts/deploy-lambda-v7.js` | **Lambda signum-harvest** (`node scripts/deploy-lambda-v7.js`) |
| `scripts/lambda-flow-harvest/**` | **Lambda signum-flow-harvest** (`node scripts/deploy-flow-harvest.js`) |
| `scripts/ec2-guardian-worker.js` | **EC2** (`scp` + `pm2 restart`) |
| `scripts/ec2-price-ws.js` | **EC2** (`scp` + `pm2 restart`) |

---

## 13. 미완료 / 향후 작업 (TODO)

### 🔴 즉시
- [x] **Composite WhaleIndex → Alpha Score 연결 (2026-04-07 완료)**
  - Vercel `alphaEngine.ts` `calculateWhaleIndex(gex)` → `(gex, darkPoolPct, blockTrades, netPremium)` Composite 교체
  - 변경: `alphaEngine.ts`, `watchlistBatchService.ts`, `powerEngine.ts`, `dashboard/unified/route.ts`, `live/ticker/route.ts`
- [x] **Alpha Score V4.6 엔진 통일 (2026-04-07 완료)**
  - Lambda 간단 3요인 `computeAlphaScore` → CACHE HIT에서도 Vercel V4.6로 재계산
  - 유니버스/비유니버스/CACHE HIT/MISS 모두 동일 V4.6 엔진 사용
  - 변경: `watchlistBatchService.ts`, `portfolioBatchService.ts` CACHE HIT 경로
  - macroData 항상 fetch (CACHE HIT에서 Regime pillar용)
- [ ] **장중 1000종목 전체 harvest 모니터링** — CloudWatch Logs 확인
  - `signum-harvest` + `signum-flow-harvest` 동시 모니터링
- [x] **Morning Briefing 재시도 로직 추가 (2026-04-07 완료)**
  - EC2 Worker: 3회 재시도 (0s/15s/30s 간격) + 전 실패 시 데이터 기반 템플릿 fallback
  - Vercel Self-Healing: 2회 재시도 (10s 간격) + rate limit 10분→5분 단축
  - "temporarily unavailable" 에러 메시지 완전 제거 — 유저에게 에러 노출 금지
  - **배포 완료**: Vercel (`git push`) + EC2 (`scp` + `pm2 restart`)
  - 수동 테스트: POST `/api/guardian/briefing/generate` → Status 200, 16초, 5뉴스, 3캘린더
- [ ] **Morning Briefing 정상 생성 확인 (2026-04-07 KST 21:00 = ET 08:00)**
  - 재시도 로직 적용 후 첫 자동 생성 결과 모니터링
- [x] **Cross-Sector Intelligence Self-Healing 추가 (2026-04-07 완료)**
  - ROOT CAUSE: 4/4(금) Vercel 크론이 sector snapshot 10개 전부 미실행 → Redis 캐시 없음
  - GET `/api/intel/cross-sector-brief`: 캐시 없으면 자동으로 POST 트리거 (2회 재시도, 5분 rate limit)
  - 유저에게 빈 화면 절대 노출 금지 — Self-Healing으로 자동 복구
  - **배포 완료**: Vercel (`git push`)
- [x] **Dashboard Fix V3: POST 가격 불일치 + 카드 깜빡임 해결 (2026-04-07 완료)**
  - ROOT CAUSE: `buildResponseFromAnalysisCache`에서 DynamoDB miss 시 quotes API 데이터 유실
  - Fix 1 (`unified/route.ts`): DynamoDB miss → quotes API fallback으로 가격/세션/extended 직접 추출
  - Fix 2 (`dashboardStore.ts`): deepMergeTicker에서 price=0이 기존 유효값 덮어쓰기 방지
  - 결과: POST 가격 14종목 전부 일관 표시, Gamma Flip/GEX 슬라이더 깜빡임 제거
  - **배포 완료**: Vercel (`git push`)
- [x] **Dashboard ROOT FIX: 빈 카드 완전 해결 (2026-04-08 완료)**
  - ROOT CAUSE: `buildResponseFromAnalysisCache`가 캐시 null이면 그대로 반환 → UI '—' 표시
  - 원칙: **"있으면 캐시, 없으면 실데이터"** — Polygon/FINRA 라이브 폴백
  - Fix 1 (`unified/route.ts`): VWAP → Polygon 스냅샷 API 폴백
  - Fix 2 (`unified/route.ts`): shortVolPct → `fetchShortVolumeData()` 라이브 호출
  - Fix 3 (`unified/route.ts`): volumePcr → `ac.pcr` OI 기반 폴백
  - Fix 4 (`DashboardClient.tsx`): Market badge → 클라이언트 ET 시간 직접 계산
  - Fix 5 (`watchlistBatchService.ts`): Pre-market VWAP/PCR prevDay/OI 폴백
  - 결과: ASTS 포함 전 종목 VWAP/ShortVol/PCR/DarkPool 100% 표시
  - **배포 완료**: Vercel (`git push`, 4 commits)
- [x] **Redis 요금 최적화 (2026-04-08 완료)** — `f5cfc053`
  - 문제: 개발자 1명 브라우저로 월 134M Redis GET ($26/월)
  - 원인: `quotes/route.ts` 매 2초 14개 Redis GET (메모리 캐시 없음)
  - Fix 1: `quotes/route.ts` — `flow:extended` 60초 메모리 캐시 (420→14 GET/분, -96.7%)
  - Fix 2: `unified/route.ts` — `prev-day-pct` 1시간 메모리 캐시 (28→0.23 GET/분, -99%)
  - EventBridge 변경: **불필요** (두 Lambda 모두 자체 장외/주말 스킵 로직 내장)
  - 예상 효과: 134M→15M GET/월, $26→$5/월 (-80%)
  - 기능 영향: **없음** (확정 데이터를 메모리에서 재전달하는 것뿐)
- [x] **POST-MARKET REPORT 타임스탬프 KST→ET 버그 수정 (2026-04-08 완료)** — `4b5035af`
  - 문제: M7 POST-MARKET REPORT 시간이 `04. 08. 06:00 ET`로 표시 (실제 ET는 5:00 PM)
  - 원인: `TacticalReportDeck.tsx` L447 `toLocaleString('ko-KR')` → timeZone 미지정 → 브라우저 KST 사용
  - Fix: `toLocaleString('en-US', { timeZone: 'America/New_York' })` 추가
  - 영향: 전 10개 섹터 POST-MARKET REPORT 타임스탬프 정확화
- [x] **Dashboard POST 가격 즉시 표시 (2026-04-08 완료)** — `3dfc6496`
  - 문제: CLOSED 세션에서 POST 컬럼이 일부 종목만 표시, 나머지는 느리게 나타남
  - 원인: `afterHours.p` (Polygon 일부만 제공) + `flow:extended` (Command 방문 시에만 캐시)
  - Fix: `quotes/route.ts` — `lastTrade.p ≠ day.c`이면 시간외 거래 감지 → POST 즉시 표시
  - Fallback 순서: `afterHours.p` → `lastTrade vs dayClose diff` → `flow:extended` Redis

- [x] **Dashboard PRE/POST UI 깜빡임 및 데이터 분리 완벽 해결 (2026-04-08 완료)**
  - 문제: PRE/POST 마켓 시간 중 웹소켓 가격이 무조건 본장 `underlyingPrice`를 덮어씌웠고, 이후 2초 가격 폴링이 어제 종가로 되돌리면서 수익률이 +5.18% ↔ +0.00%로 미친 듯이 깜빡이는 현상 (Watchlist 헤더 오류 포함).
  - Fix 1 (`DashboardClient.tsx`): 워치리스트 헤더(`extHeaderLabel`)의 react `useMemo` 캐싱 의존성을 제거하여 접속 즉시 로컬 ET 시간에 기반해 `PRE` / `POST` 로 강제 동기화.
  - Fix 2 (`dashboardStore.ts`): 30초 인디케이터 데이터 병합 지점에서 `prevChangePct`, `intradayChangePct` 변수를 `INDICATOR_FIELDS` 허용 목록에 추가. 30초마다 이전 장 변화율이 0%로 날아가는 버그 차단.
  - Fix 3 (`dashboardStore.ts`): 웹소켓(`updateRealtimePrice`) 전용 라우터 구축. 세션(`session`) 감지 로직을 도입해 프리마켓/애프터마켓 실시간 데이터를 본장 필드 대신 `extended.prePrice/postPrice`로만 흐르게 격리.
  - Fix 4 (`quotes/route.ts`): Polygon의 엉뚱한 PRE마켓 `todaysChangePerc`가 스토어를 덮어씌우지 못하게 `null` 폴백.
  - 원칙 실현: 본장 데이터는 어제의 결과를 유지하며, 확장 세션(Extended Session) 컬럼만 완전히 독립적으로 실시간 업데이트.

- [x] **워치리스트 히트맵 성능 최적화** (2026-04-08)
  - ECharts treemap → 순수 CSS squarify 알고리즘으로 교체 (~800KB 번들 제거)
  - SessionStatusCard 분리 → 1초 타이머가 StatsBar 전체 리렌더 방지
  - TickerHeatmap `memo` 적용 + `ResizeObserver` 기반 반응형 레이아웃
  - 렌더 시간 ~200-400ms → ~30-50ms 예상

### [2026-04-09] PRE/POST 시간외 가격 웹소켓 미연동 원인 분석 및 UX 착시 현상 규명
- **이슈**: 대시보드는 PRE/POST 가격이 실시간으로 업데이트되는 반면, COMMAND 페이지는 5초 갱신으로 느리게 체감되는 현상.
- **분석 확인**: 대시보드와 COMMAND 페이지 **둘 다 PRE/POST 웹소켓 연동이 없으며, 동일하게 5초 주기 API 폴링(`/api/live/quotes`)**으로 시간외 가격을 갱신 중임.
- **백엔드 구조 한계**: EC2 `WebSocketProvider` 페이로드에는 오직 정규장 데이터(`price`, `changePct`)만 스트리밍되며 `extendedPrice`는 웹소켓 서버 구조상 내려주지 않음.
- **UX 착시 (역체감) 원인**:
  - **대시보드**: 다수(15~20개)의 종목이 제각각 5초 단위의 비동기 API 통신을 통해 화면 곳곳에서 릴레이식 점멸(깜빡임)을 일으켜 웹소켓처럼 느껴진 미세한 착시 현상.
  - **COMMAND 페이지**: 상단 헤더에 단일 종목만 노출되며, 장중 0.1초마다 엄청나게 점멸하던 정규장 가격 움직임과 대비되어 5초 갱신이 상대적으로 끊긴 것처럼 역체감됨.
- **차후 백엔드 개발 과제**: 시간외 가격의 완전한 실시간성 확보를 원할 경우, 프론트엔드가 아닌 **EC2 웹소켓 서버단에서 폴리곤의 POST/PRE 페이로드(`extendedPrice`)를 추가 파싱 및 구조화하여 브로드캐스트** 하도록 서버 아키텍처 확장이 요구됨.

### 🟡 단기
- [ ] **WhaleIndex → 적절한 이름 리네이밍** (예: Flow Score, Smart Flow)
  - 현재 4가지 흐름 종합 지표인데 이름이 "Whale"이라 부정확
  - UI 표시명 + 코드 변수명 리팩토링 (영향 범위 넓음: ~50파일)
- [ ] **UNIVERSE_500 변수명 정리** — `UNIVERSE` 또는 `ALL_TICKERS`로 통일 (25곳)
- [ ] **GammaFlip 가격 변동 원인 정밀 조사**

### 🟢 중기
- [ ] 모바일 최적화 (앱 수준 UX)
- [ ] 짜잘한 UI 버그 전수 조사 및 수정
- [ ] **사용자 증가 시 유니버스 확장 검토** (1000 → 1500+)
  - signum-harvest: 현재 88초/900초 한도 → 여유 충분
  - signum-flow-harvest: 종목당 ~0.29초, 여유 312초 → 1000종목 추가 가능

### ✅ 완료
- [x] **`signum-flow-harvest` Lambda 배포 및 검증 완료 (2026-04-05)**:
  - Lambda 함수: `signum-flow-harvest` (nodejs20.x, 600s, 1024MB)
  - EventBridge: `signum-flow-harvest-5min` (rate(5 minutes), ENABLED)
  - 1000종목 완전 독립 warm — 249초(4분9초)에 1000종목 처리, fail=0
  - Redis 키: `rt-metrics:{TICKER}`, `cache:flow:unified:{TICKER}`, `darkpool:{TICKER}`
  - 프로덕션 검증: NVDA cached:true DP:56.6%, AAPL cached:true DP:22.3%, META cached:true DP:19.9%
  - Vercel 코드 수정 0줄 — 기존 API가 Redis-first이므로 자동 캐시 히트
---

## 12. Massive (Polygon) API 전체 엔드포인트 레퍼런스

> **최고 티어** — 무제한 호출, rate limit 없음
> Base URL: `https://api.polygon.io`

### 12.1 시장 데이터 (Market Data)
| 엔드포인트 | 설명 | 현재 사용처 |
|---|---|---|
| `/v3/snapshot` | Unified Snapshot (다양한 자산) | — |
| `/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}` | Single Ticker Snapshot | Lambda Step 1 |
| `/v2/snapshot/locale/us/markets/stocks/tickers` | Full Market Snapshot (10,000+) | massiveClient |
| `/v2/snapshot/locale/us/markets/stocks/{direction}` | Top Movers (gainers/losers) | massiveClient |
| `/v2/aggs/ticker/{ticker}/range/{mult}/{timespan}/{from}/{to}` | Custom OHLC Bars | Lambda Step 5.5 |
| `/v2/aggs/grouped/locale/us/market/stocks/{date}` | Daily Market Summary | — |
| `/v1/open-close/{ticker}/{date}` | Daily Ticker Summary | — |
| `/v2/aggs/ticker/{ticker}/prev` | Previous Day Bar | — |

### 12.2 기술 지표 (Technical Indicators)
| 엔드포인트 | 설명 | 현재 사용처 |
|---|---|---|
| `/v1/indicators/sma/{ticker}` | SMA | Lambda Step 3 |
| `/v1/indicators/ema/{ticker}` | EMA | — |
| `/v1/indicators/macd/{ticker}` | MACD | — |
| `/v1/indicators/rsi/{ticker}` | RSI | Lambda Step 5.5 |

### 12.3 종목 참조 (Reference)
| 엔드포인트 | 설명 | 현재 사용처 |
|---|---|---|
| `/v3/reference/tickers` | All Tickers 목록 | — |
| `/v3/reference/tickers/{ticker}` | Ticker Overview (name/sector/CIK) | Lambda Step 4c |
| `/v3/reference/tickers/types` | Ticker Types | — |
| `/v1/related-companies/{ticker}` | Related Tickers | Lambda Step 4d |
| `/v3/reference/exchanges` | Exchanges 목록 | — |
| `/v1/marketstatus/upcoming` | Market Holidays | — |
| `/v1/marketstatus/now` | Market Status (open/closed) | massiveClient |
| `/v3/reference/conditions` | Condition Codes | — |
| `/vX/reference/tickers/{id}/events` | Ticker Events | — |

### 12.4 재무 데이터 (Financials)
| 엔드포인트 | 설명 | 현재 사용처 |
|---|---|---|
| `/stocks/financials/v1/ratios` | **Ratios** (PE/PB/PS/DE/ROE/FCF) | Lambda Step 4c |
| `/stocks/financials/v1/income-statements` | Income Statements | — |
| `/stocks/financials/v1/balance-sheets` | Balance Sheets | — |
| `/stocks/financials/v1/cash-flow-statements` | Cash Flow Statements | — |
| `/vX/reference/financials` | vX Financials (revenue/margin/quarterly) | Lambda Step 4c |

### 12.5 공매도/유동주식 (Short Interest / Float)
| 엔드포인트 | 설명 | 현재 사용처 |
|---|---|---|
| `/stocks/v1/short-interest` | **Short Interest** (FINRA 격월 보고) | ✅ Lambda Step 4e + On-demand |
| `/stocks/v1/short-volume` | **Short Volume** (일일 FINRA 보고) | ✅ Lambda 5분 크론 |
| `/stocks/vX/float` | **Float** (유동주식수, free_float) | ✅ Lambda Step 4e + On-demand |

### 12.6 옵션 (Options)
| 엔드포인트 | 설명 | 현재 사용처 |
|---|---|---|
| `/v3/reference/options/contracts` | All Option Contracts | — |
| `/v3/reference/options/contracts/{ticker}` | Contract Overview | — |
| `/v3/snapshot/options/{underlyingAsset}` | **Option Chain Snapshot** (Greeks/OI/IV) | Lambda Step 2 + massiveClient |
| `/v3/snapshot/options/{asset}/{contract}` | Option Contract Snapshot | massiveClient |
| `/v3/trades/{optionsTicker}` | Option Trades (tick-level) | massiveClient |
| `/v2/last/trade/{optionsTicker}` | Last Option Trade | massiveClient |
| `/v1/open-close/{optionsTicker}/{date}` | Option Daily Summary | — |

### 12.7 주식 거래/호가 (Trades / Quotes)
| 엔드포인트 | 설명 | 현재 사용처 |
|---|---|---|
| `/v3/trades/{stockTicker}` | Stock Trades (tick-level) | — |
| `/v2/last/trade/{stocksTicker}` | Last Trade | — |
| `/v3/quotes/{stockTicker}` | NBBO Quotes | — |
| `/v2/last/nbbo/{stocksTicker}` | Last Quote (NBBO) | — |

### 12.8 기업 공시/이벤트 (SEC / Corporate)
| 엔드포인트 | 설명 | 현재 사용처 |
|---|---|---|
| `/stocks/filings/vX/risk-factors` | Risk Factors (SEC) | — |
| `/stocks/taxonomies/vX/risk-factors` | Risk Categories | — |
| `/stocks/filings/10-K/vX/sections` | 10-K Sections | — |
| `/stocks/filings/8-K/vX/text` | 8-K Text | — |
| `/vX/reference/ipos` | IPO Calendar | — |
| `/stocks/v1/splits` | Stock Splits | — |
| `/stocks/v1/dividends` | Dividends | — |

### 12.9 뉴스/매크로 (News / Macro)
| 엔드포인트 | 설명 | 현재 사용처 |
|---|---|---|
| `/v2/reference/news` | News (sentiment 포함) | massiveClient |
| `/fed/v1/treasury-yields` | Treasury Yields | — |
| `/fed/v1/inflation` | Inflation (CPI/PCE) | — |
| `/fed/v1/inflation-expectations` | Inflation Expectations | — |
---

## 14. 세션 핸드오프 (2026-04-08T03:54 KST)

### 현재 상태
- **Dashboard 가격 파이프라인 분리 배포됨** — Vercel `a28995f7` + Lambda v7.1
- **시장 배지 수정 완료** — CLOSED 버그 → LIVE PRE/OPEN 정상 표시
- Lambda v7.1 운영 정상 (SI% + Fundamentals 보존 + WhaleIndex Composite + V3.1 필드 추가)
- Vercel 배포 완료 (013bfe1e → ... → ae5eeb46 → a28995f7)

### ⚠️ 핵심 규칙 (반드시 기억)
1. **「1필드 = 1생산자」원칙** — 가격은 quotes/WS만, 인디케이터는 unified만 (2026-04-08 확립)
2. **Lambda ↔ Vercel 구조 일치 필수** — 한쪽 필드 수정 시 반드시 다른 쪽 확인
3. **DynamoDB priceCacheStore에는 VWAP 없음** — VWAP은 항상 Polygon 스냅샷 또는 분석 캐시에서
4. **변수명 `whaleIndex` 유지** — `flowScore`로 리네이밍 하지 않음 (기억만)
5. **INFRASTRUCTURE_MAP.md가 SSOT** — 구조 변경 전 반드시 여기 확인

### 🔴 Dashboard 데이터 파이프라인 V4 (2026-04-09 재작성)
```
[가격 업데이트] (2초/즉시) — fetchPriceOnly + updateRealtimePrice
  → ONLY writes: underlyingPrice, changePercent, display, extended, session, prevClose
  → NEVER writes: indicator fields (netGex, maxPain, pcr, etc.)

[인디케이터 업데이트] (30초) — fetchDashboardData
  → ONLY writes: INDICATOR_FIELDS (netGex, maxPain, pcr, levels, alpha, etc.)
  → NEVER writes: price fields
  → EXCEPTION: 첫 로드 시 store에 가격 없으면 unified에서 가져옴

[WebSocket] — updateRealtimePrice (즉시)
  → underlyingPrice, changePercent, display만 write
  → 기존 ticker가 store에 있을 때만 (new ticker는 무시)

[차트] — /api/chart → 30초 자체 SWR (store 무관, 독립)

★ deepMergeTicker 삭제 — 구조적으로 충돌 불가
★ INDICATOR_FIELDS 상수로 필드 분리 명시적 보장
★ catch (e) {} 제거 — 모든 에러 console.error로 출력
```

### 수정 이력 (2026-04-08)

#### P0 FIX: Dashboard Price Pipeline Separation (a28995f7)
| 파일 | 변경 내용 |
|------|----------|
| `api/live/quotes/route.ts` | Redis 2s 캐시 제거 (2s 폴링과 충돌 → 동일 데이터 반복 반환 방지) |
| `stores/dashboardStore.ts` | fetchDashboardData에서 unified 응답의 가격 필드 strip 후 merge (stale 가격 덮어쓰기 방지) |
| `scripts/deploy-lambda-v7.js` | analysisEntry에 `vwap`, `volumePcr`, `volumePcrCallVol`, `volumePcrPutVol` 추가 |

#### 이전 ROOT FIX: Cache-First, Live-Fallback (ae5eeb46)
| 파일 | 변경 내용 |
|------|----------|
| `DashboardClient.tsx` | Market status badge → 클라이언트 ET 시간 직접 계산 |
| `watchlistBatchService.ts` | VWAP prevDay 폴백, OI 기반 PCR 폴백, isStaleV3Cache 감지 |
| `dashboard/unified/route.ts` | VWAP/ShortVol/PCR 라이브 폴백 체인 (Polygon API) |

### ⚠️ 대시보드 장중 검증 필요 (V4 재작성 완료, 장마감 상태에서만 검증)
> **장중(PRE~POST)에 반드시 확인해야 할 항목:**

1. **2초 폴링으로 사이드바 가격이 실시간 업데이트되는지** — 장마감에서는 고정값이라 확인 불가
2. **30초 unified 응답이 가격을 덮어쓰지 않는지** — V4의 핵심 수정. 장중에만 확인 가능
3. **WebSocket 가격이 store에 즉시 반영되는지** — wss://ws.signumhq.com 상태 미확인
4. **PRE→REG 세션 전환 시 가격/배지 표시 전환** — 프리마켓에서만 확인 가능
5. **종목 클릭 전환 시 모든 카드 데이터가 전환되는지**
6. **워치리스트에서 종목 추가/제거 후 데이터 로딩**
7. **탭 이동 후 복귀 시 데이터 유지**
8. **P/C Ratio VOLUME 바 게이지** — Lambda에 callVol/putVol 추가 완료, 실제 바 표시 확인

### 📋 미완료 TODO
1. ~~Composite WhaleIndex → Alpha Score 연결~~ ✅ **완료 (2026-04-07)**
2. ~~Dashboard 빈 카드 (VWAP/ShortVol/PCR)~~ ✅ **완료 (2026-04-08)**
3. ~~Dashboard 가격 파이프라인 분리~~ ✅ **V4 전면 재작성 완료 (2026-04-09)** — 장중 검증 필요
4. **⏳ Redis 요금 최적화** — 코드 분석 완료, 실행 미착수 (위 P0 섹션 참조)
5. **⏳ 대시보드 장중 전수 검증** — 위 체크리스트
6. **UNIVERSE_500 변수명 정리** — 실제 1000종목이므로 혼란
7. **WhaleIndex UI 배치** — Command/Flow 페이지에 게이지 형태로 배치 검토
8. **DynamoDB priceCacheStore에 VWAP 추가 검토** — 현재 Polygon 폴백으로 우회 중

### 🔴 다음 작업 — 우선순위순

> **대원칙 (가장 단순한 원칙)**
> 1. **가격은 항상 실시간** — WebSocket 우선, 폴링 보조
> 2. **유니버스 종목 = 빛의 속도** — AWS 캐시에 이미 있으니 1회 GET → 즉시 렌더링
> 3. **비유니버스 종목 = API 호출이든 뭐든 빠르게** — 방법 불문, UI에 최대한 빠르게 렌더링
> 4. **기능에 문제가 생기는 방식은 절대 하면 안 됨** — 최적화가 기능을 깨뜨리면 안 됨

#### ✅ P0 완료: Dashboard V4 전면 재작성 (2026-04-09, commit ec0c6865)
- `dashboardStore.ts` 전면 재작성 (692줄 → 587줄, deepMergeTicker 완전 삭제)
- `fetchPriceOnly`: 155줄 → 50줄 (세션 분기 단순화, 에러 로깅 추가)
- `fetchDashboardData`: 95줄 → 45줄 (INDICATOR_FIELDS만 write)
- `DashboardClient.tsx` 폴링 로직 정리 (.then() 체인 제거, 독립 intervals)
- **가격/인디케이터 구조적 분리** — INDICATOR_FIELDS 상수로 명시적 보장
- TypeScript 에러 0개, 프로덕션 빌드 성공
- **외부 페이지 영향 0%** — 4개 consumer 전수 확인 (Portfolio, Watchlist, MobileHoldingCard, Command)
  - 모두 `toggleDashboardTicker`, `dashboardTickers`만 사용 → 인터페이스 100% 유지
- **API 라우트 변경 0건** — unified/route.ts, quotes/route.ts 동작에 문제 없어 건드리지 않음
- **백업 위치**: `c:\Users\seamo\backup\stock2\_backup_dashboard_20260408\`
- **⚠️ 장마감 상태에서만 검증됨** — 장중 실시간 동작 검증 필요

#### P0: Redis 요금 폭탄 최적화 ($26→$3) — 미착수
- **현재 상태**: $14.67 → $26.21 (두 배 폭등), Commands 140.4M, Bandwidth 271.6GB
- **목표**: 월 Redis 명령 수 90% 감소 (140M → 15M 이하), $3-5 수준

**⚠️ 참고: 대시보드 V4 재작성 시 같이 하겠다고 했으나 미착수. 별도 작업 필요.**

---

**팩트 체크 결과:**

| 원인 | 상태 | 설명 |
|------|:----:|------|
| 1. Lambda "1000번 노가다 쓰기" | 반만 맞음 | 이미 `redisPipeline` 20개 배치 사용 중 (L107-108). 하루 ~3만 명령. 합리적 수준 |
| 2. 프론트엔드 "무지성 새로고침" | **주범 (90%)** | Vercel API에서 Redis GET 폭주. 아래 상세 |
| 3. EventBridge 24/7 가동 | 맞음 | `rate(5 minutes)` — 장마감/주말에도 계속 실행 |

**원인 2 상세 (프론트엔드 Redis 폭주):**
```
fetchPriceOnly (2초): 14종목 × ~5 Redis calls = 70 calls/2초 = 35 calls/초
fetchDashboardData (30초): 14종목 × ~15 Redis calls = 210 calls/30초 = 7 calls/초
합계: ~42 Redis calls/초/유저

42 × 3600 × 24 = 하루 360만 calls (브라우저 1명으로!)
개발 중 브라우저 1개만 열어도 하루 360만 calls → 이게 1억 4천만의 정체
```

**요금 명세 추정:**

| 출처 | 명령/일 | 비중 |
|------|---------|:----:|
| Vercel 프론트엔드 (1 유저) | ~360만 | 90% |
| Lambda 쓰기 | ~3만 | 1% |
| EC2 Worker (Guardian 등) | ~5만 | 1% |
| Vercel cron/SWR 백그라운드 | ~30만 | 8% |

**즉시 조치 3가지 (우선순위순):**

| # | 조치 | 파일 | 방법 | 예상 효과 |
|---|------|------|------|----------|
| 1 | unified API Redis GET → 서버 메모리 캐시 | `unified/route.ts` | `Map<string, {data, expiry}>` 30초 TTL. Redis 1회 bulk GET → Map 저장 → 재사용 | **요금 -80%** (최대 효과) |
| 2 | quotes API extended cache GET 제거 | `quotes/route.ts` L78-86 | `flow:extended:{ticker}` 14종목 GET/2초 → 메모리 캐시 또는 완전 제거 | 요금 -10% |
| 3 | EventBridge cron 장중 제한 | AWS EventBridge | `cron(0/5 8-24,0-1 ? * MON-FRI *)` UTC = PRE(04:00ET)~POST(20:00ET) | 요금 -5% |

**추가 최적화 (선택):**

| # | 조치 | 파일 | 효과 |
|---|------|------|------|
| 4 | `prev-day-pct:` Redis 캐시 TTL 600s→3600s | `unified/route.ts` L15-55 | -3% |
| 5 | `analysisCache` 메모리 캐시 30s 추가 | `analysisCache.ts` | -2% |

**Lambda Pipeline 상태 (이미 최적화됨 — 추가 조치 불필요):**
```js
// deploy-lambda-v7.js L107-108, L1344-1346
for (let i = 0; i < redisBatch.length; i += 20) {
    const batch = redisBatch.slice(i, i + 20);
    await redisPipeline(batch);  // 1회 HTTP로 20개 SET
}
// 1000종목 × 2 = 2000 SET → 100회 pipeline (개별 SET 대비 1/20)
```

**코드 분석 결과 (현재 Redis 호출 지도):**
```
[2초마다 — quotes/route.ts] 대시보드 1명 접속 시:
  L80-86: 14종목 × getFromCache("flow:extended:{ticker}") = 14 Redis GET
  합계: 14 GET / 2초 = 420 GET/분 ★ 가장 빈번한 호출

[30초마다 — unified/route.ts] 대시보드 1명 접속 시:
  L925: getFromRedisCache (1 GET) — in-memory hit이면 스킵
  L835: getAnalysisCacheForTickers (1 bulk GET) — 14종목 일괄
  L24: getDailyChangeBatch → 종목당 getFromCache("prev-day-pct:{ticker}") = 14 GET
  L54: getDailyChangeBatch → miss 시 setInCache = 최대 14 SET
  L207: writeToRedisCache (1 SET)
  합계: miss 시 ~30 GET+SET / 30초

[참고] unified/route.ts L161에 이미 `const cache: Map<string, CacheEntry>` 존재
  → 2분(memoryMs=120000) TTL. 보통 in-memory hit → Redis 0회
  → 문제는 cold start 또는 Vercel 인스턴스 교체 시 Redis fallback 발생
```

**실행 계획 (코드 레벨):**

```
작업 1: quotes/route.ts — flow:extended 메모리 캐시 (10분, 효과 -50% 전체)
  위치: L78-86
  변경: 파일 상단에 `const extMemoryCache = new Map()` 추가
       Redis GET 전에 메모리 캐시 확인 (60초 TTL)
       Redis hit 시 메모리에 저장 → 60초간 재사용
  효과: 14 Redis GET/2초 → 14 Redis GET/60초 (96.7% 감소)

작업 2: unified/route.ts — prev-day-pct 메모리 캐시 (15분, 효과 -5%)
  위치: L15-55 (getDailyChangeBatch 함수)
  변경: 함수 밖에 `const prevDayCache = new Map()` 추가 (1시간 TTL)
       daily bars는 하루 한번만 바뀌므로 1시간 캐시 안전
  효과: 14 Redis GET/30초 → 14 Redis GET/3600초

작업 3: EventBridge cron 제한 (5분, 효과 -5%)
  위치: AWS EventBridge 콘솔
  변경: rate(5 minutes) → cron(0/5 8-24,0-1 ? * MON-FRI *) UTC
       = PRE(04:00ET) ~ POST(20:00ET) 커버. 본장만이 아닌 PRE~POST 전체
  효과: 주말+야간(POST 이후) Lambda 정지 → Redis write -40%
```

#### P1: 메인 대시보드 워치리스트 데이터 누락
- 현상: 데이터가 한번에 다 표시 안 됨 — 일부만 먼저 표시
- 현상: 다른 페이지 갔다 오면 일부 자료 누락
- 원인: unified API 응답이 불완전하거나, store merge 시 데이터 유실 추정
- 점검: 종목별 필드 누락 패턴 파악, unified API ↔ store ↔ UI 완전 추적

#### P1: Lambda 유니버스 + Flow Lambda 데이터 인입 파이프 전수 점검
- `deploy-lambda-v7.js` (signum-harvest): 1000종목 데이터 수집 → Redis/DynamoDB 저장 파이프 점검
- `deploy-flow-harvest.js` (signum-flow-harvest): Flow 데이터 수집 파이프 점검
- 점검 항목:
  - 각 Step(1-6)에서 수집하는 데이터가 빠짐없이 Redis/DynamoDB에 저장되는지
  - 저장된 필드와 Vercel이 읽는 필드가 1:1 매칭되는지
  - EventBridge 스케줄 최적화 (장중만 실행)
  - Pipeline 배치 크기 최적화
  
### 🚀 런칭 마무리 TODO
1. **사이트 전체 버그 전수조사** — 모든 페이지 돌면서 버그 리스트업
2. **모바일 UI 최적화** — 롤백 기반, 망가뜨리지 않도록 단계적 수정
3. 발견된 버그 수정 (우선순위순)
4. 최종 프로덕션 검증

### Finnhub 사용 현황 (참고)
- **Lambda**: Finnhub **미사용** (키만 주입, 실제 호출 없음)
- **Vercel Intel 페이지**: Finnhub 사용 중 (`finnhubClient.ts`)
  - Earnings Calendar, Analyst Recommendation, Insider Transactions, Price Target
  - 사용 위치: `/api/intel/*-calendar/route.ts` (10개 섹터), `/api/live/earnings/route.ts`
  - 무료 티어 (60 calls/min) — 현재 동작 정상

### Polygon (Massive) API 사용 현황
- **Lambda**: 옵션/가격/SMA/RSI/SI%/Float/Ratios/Financials/Related/News
- **Vercel**: massiveClient.ts 통해 fallback으로 사용 (DynamoDB miss 시)
- **Dashboard unified**: VWAP 폴백 (`/v2/snapshot`), ShortVol 폴백 (`/stocks/v1/short-volume`)
- **Dashboard quotes** (2s 폴링): `/v2/snapshot/locale/us/markets/stocks/tickers` — Redis 캐시 없음 (직접 호출)
- 전체 엔드포인트: 섹션 12 참조 (50+ endpoints)

### 외부 API 키 구조
| API | Lambda 키 | Vercel 키 | 비고 |
|---|---|---|---|
| Polygon | `iKNEA...` (하드코딩 fallback) | `MASSIVE_API_KEY` / `POLYGON_API_KEY` | 같은 계정, 같은 티어 |
| FMP | `FMP_API_KEY` (env 주입) | `FMP_API_KEY` | Lambda Step 4a,4b |
| Finnhub | `FINNHUB_API_KEY` (env 주입) | `FINNHUB_API_KEY` | Vercel만 실사용 |

*마지막 업데이트: 2026-04-08T09:31 KST*

---

## 🔄 세션 핸드오프 (2026-04-09 세션 종료 시점)

### 완료된 작업 (2026-04-09 추가 반영)
| 작업 | commit | 상태 |
|------|--------|:----:|
| Dashboard V4 Store 전면 재작성 | `ec0c6865` | ✅ 배포됨 |
| DashboardClient 폴링 로직 정리 | `ec0c6865` | ✅ 배포됨 |
| Redis 요금 분석 + 실행 계획 문서화 | `e992d690` | ✅ 기록됨 |
| Guardian Morning Briefing 큰따옴표 파싱 에러 복구 | 최신 | ✅ 배포됨 |
| Command Fundamental Grid 가독성/레이아웃 복구 (6열 구조) | 최신 | ✅ 배포됨 |
| 전역 타겟 Price Flash 엔진 교체 (Premium Solid Hybrid) | 최신 | ✅ 배포됨 |
| 인텔 M7 Session Grid 전용 CSS 애니메이션 동기화 제거 | `6be63649` | ✅ 배포됨 |

### 다음 세션 즉시 할 작업 (우선순위순)
1. **대시보드 장중 실시간 검증** — PRE~POST 동안 위 체크리스트 8개 항목 확인
2. **Redis 최적화 실행** — 3가지 (quotes 메모리 캐시 → unified prev-day-pct 캐시 → EventBridge cron)
   - 작업 1: `quotes/route.ts` L78-86에 `Map` 메모리 캐시 추가 (60초 TTL) → 효과 -50%
   - 작업 2: `unified/route.ts` getDailyChangeBatch에 `Map` 메모리 캐시 추가 (1시간 TTL) → 효과 -5%
   - 작업 3: AWS EventBridge `rate(5 minutes)` → `cron(0/5 8-24,0-1 ? * MON-FRI *)` → PRE~POST만
3. **워치리스트 데이터 누락 점검** — 데이터 일부만 먼저 표시되는 현상 조사

### 건드리면 안 되는 것
- `LiveTickerDashboard.tsx` — Command 페이지 공유 컴포넌트
- `WebSocketProvider.tsx` — 전역 provider
- `TickerData` 인터페이스 — 변경 시 4개 페이지 동시 깨짐
- API 라우트 (unified/quotes) — 정상 동작 중, Redis 최적화 시에만 가볍게 터치

### 아키텍처 핵심 기억사항
- **Lambda는 1000종목 → Redis/DynamoDB 전부 push (정상: pre-compute 설계)**
- **요금 주범은 Lambda WRITE가 아니라 Vercel READ** (quotes API 2초마다 14종목 Redis GET)
- **unified/route.ts에는 이미 in-memory cache 있음** (L161 `const cache: Map`)
- **quotes/route.ts에는 메모리 캐시 없음** ← 이것이 요금 폭탄의 핵심 원인
- **장중 = PRE(04:00 ET) ~ POST(20:00 ET)** — 본장만이 아님

---

## 📈 [NEXT PHASE] 소셜 마케팅 자동화 파이프라인 확장 제안 (Growth Hacking)
> **대상 파일:** `src/lib/marketing/aiContentEngine.ts` & `marketing-dispatch/route.ts`
> **목적:** 3개국어(EN/KO/JA) 자동 배포 엔진의 노출 도달률(Reach) 및 CTR 폭발적 증가

1. **글로벌 옵션 Ticker 태깅 엔진 추가 ($Cashtag 타겟팅)**
   - **구현 방식:** AI 프롬프트에 당일 주도주(핫 티커)의 Cashtag(예: `$TSLA`, `$NVDA`)를 첫 줄에 강제 주입.
   - **효과:** X(트위터) 및 Bluesky 검색 해시태그 알고리즘 노출을 통한 오가닉 트래픽 펌핑.
2. **인터랙티브 숏폼 제네레이터 구축 (Reels / Shorts / TikTok)**
   - **구현 방식:** 기존의 정적이고 지루한 AI 영상 탈피. 줌인(Zoom-in) 카메라 무빙, 수치 롤링 아웃, 타이포그래피의 타격감, 비트에 맞춘 효과음 등 **숏폼 전용 도파민 메커니즘** 렌더링 적용. 
   - **효과:** "프리미엄 지표 + 숏폼 특유의 시각적 인터랙션" 결합으로 1.5초 이탈 방어 및 폭발적 바이럴 유도.
3. **소셜 노출용 OG Image 'Premium Glassmorphism' 전면 개편**
   - **구현 방식:** 현재 데이터 구조는 유지하되, 렌더링 디자인을 웹사이트 본판과 동일한 '고급 크리스탈 마감, 다크모드 네온 글로우, 솔리드 텍스트' 질감으로 대수술 (`/api/og/market` 수정).
   - **효과:** 타임라인 스크롤 중 시선을 잡아채는 럭셔리한 브랜드 이미지 구축 및 클릭 유도(CTR 극대화).
4. **'승률 통계(Statistical Win-rate)' 폴백 강제 삽입**
   - **구현 방식:** "지표 충족 시 역사적 3일 내 상승 확률 78%" 와 같은 백테스팅 통계 숫자를 AI 요약본에 강제 주입.
   - **효과:** 직관적 숫자로 인한 유저의 호기심 극대화 및 사이트로의 클릭 전환.

---

## 🐳 [NEXT PHASE] Whale Index 리빌딩: "Smart Flow" 시그니처 지표 승격
> **대상 파일:** `src/components/Command/...` (UI 계기판), `src/lib/utils/formatters.ts` (라벨링), `src/app/[locale]/guide/...` (가이드)
> **목적:** 기존 Whale Index를 기관급 지표인 'Smart Flow'로 네이밍을 변경하고, Command 페이지 최상단에 반원형 RPM 게이지(HUD) 형태로 시각화하여 플랫폼 핵심 결제 유도 트리거 및 마케팅 셀링 포인트로 활용.

### 1. Smart Flow (스마트 플로우) 계급 체계 및 프리미엄 라벨링
컴플라이언스 리스크(주가 예측)를 방어하면서 기관 트레이더들이 쓰는 극도로 세련된 단어로 리빌딩 적용:
- **80 ~ 100점**: `HEAVY ACCUMULATION` (강력 매집 / 스마트머니 폭주) — 진한 에메랄드 네온 글로우
- **60 ~ 79점**: `INFLOW TREND` (지속 유입 / 긍정적 흐름) — 밝은 초록색
- **40 ~ 59점**: `NEUTRAL RANGE` (방향 탐색 / 관망 대기) — 슬레이트 / 회색
- **20 ~ 39점**: `OUTFLOW TREND` (자금 유출 / 하방 압력) — 앰버/주황색
- **0 ~ 19점**: `HEAVY DISTRIBUTION` (대규모 청산 / 헷지 붕괴) — 크림슨 레드 (핏빛 점멸)

### 2. UI/UX 시각화 방안 (Dashboard HUD)
- **RPM 게이지**: Command 페이지 최상단 가격/알파스코어 옆에 반원형 게이지를 배치. 바늘이 0~100 사이를 가리키며 점수에 맞는 컬러 불빛을 뿜어냄.
- **Teasing (Free Tier)**: 무료 유저에게는 게이지 뼈대만 보여주고 수치/라벨을 블러 처리. "Pro로 업그레이드하고 실시간 스마트 플로우를 확인하세요" 문구로 강력한 결제 전환 유도.

### 3. 가이드 페이지(Guide Page) 문서화 작업
- **가이드라인 추가**: "수치만 보면 알 수 없다"는 페인 포인트를 해결하기 위해 `/guide` 페이지 내에 단독 섹션을 신설.
- **포함 내용**: Smart Flow가 GEX, Dark Pool, Block Trades, Net Premium 4가지를 융합한 시그니처 지표임을 강조하고, 위 5단계 계급 체계를 컬러 차트와 함께 직관적으로 설명. 마케팅(숏폼)에서 "스마트 플로우 하나만 보라"고 교육할 때 랜딩되는 공식 매뉴얼 역할 수행.
