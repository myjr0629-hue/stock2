# SIGNUM HQ — 인프라 전체 맵 (MUST READ FIRST)

> **이 파일은 매 세션 시작 시 반드시 읽어야 합니다.**
> AWS/Vercel/Redis 전체 구조, 코드 위치, 배포 방법을 기록합니다.
> 기억 못하면 이 파일 확인. 추측하지 말 것.

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

## 2. 전체 아키텍처 (v9 — 2026-04-06 기준)

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

### 4.1 Lambda v8 (signum-harvest)
- **코드 위치**: `scripts/deploy-lambda-v7.js` (95KB, Lambda 전체 코드 포함)
- **배포 명령**: `node scripts/deploy-lambda-v7.js`
  - zip 생성 → UpdateFunctionCode → UpdateFunctionConfiguration 자동
- **설정**: timeout=900s (15분), memory=2GB
- **Function URL**: `https://76qkndxbhb5zknqt63g2t4cvqd.lambda-url.us-east-1.on.aws/`
- **유니버스**: **1,000종목** (`data/stock_universe_us800.json` 기준)
- **GEX 계산**: **전 1,000종목** (structureService 100% 호환)
- **동시성**: 배치 10종목 (최적화 여지: 15~20 가능)
- **Polygon API**: 최고 티어 (무제한 호출, rate limit 없음)

#### Lambda Step별 처리
| Step | 대상 | 내용 | API 호출 |
|------|------|------|:-------:|
| 1. Price | 1000 | 전종목 snapshot (1 API 호출) | 1 |
| 2. GEX | 1000 | structureService 호환 12개 지표 | ~3,000 |
| 3. SMA | 1000 | SMA50/200 Golden/Dead Cross | ~2,000 |
| 4. Details | 1000 | Analyst(FMP) + Earnings + Fundamentals + Related + SI% | ~2,500 |
| 5. Alpha | 1000 | 점수 계산 (API 호출 없음) | 0 |
| 6. Unified | 1000 | DynamoDB + Redis 2키 동시 저장 | ~500 |
| RLSI | 1 | 시장 전체 RLSI 지표 | 3 |

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
| `cache:analysis:{TICKER}` | AnalysisCacheEntry (15필드) | Dashboard/Watchlist/Portfolio |
| `cache:command:unified:{TICKER}` | 9개 섹션 전체 데이터 | Command/Ticker 페이지 |
- TTL: 259,200초 (3일)
- 방식: Upstash REST API pipeline (배치 20개씩)

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

### 5.1 ⚠️ 제거 필요 (Lambda가 대체)
| 크론 | vercel.json 라인 | 상태 |
|------|:---:|------|
| `warm-analysis` | L85-87 | ❌ Lambda가 cache:analysis 직접 저장 → 제거 필요 |
| `warm-command` (2개) | L72-78 | ❌ Lambda가 cache:command:unified 직접 저장 → 제거 필요 |
| `morning-briefing` (2개) | L89-95 | ❌ EC2 Guardian으로 이관 → 제거 필요 |

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
| `prev-day-pct:{TICKER}` | dashboard/unified | 10min | 전일 대비 변화율 |
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
| `/api/dashboard/unified?t=TSLA` | Dashboard | Redis cache:analysis → DynamoDB |
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
| `/api/live/quotes` | 실시간 호가 |
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
| `FINNHUB_API_KEY` | Finnhub API |
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

### 2026-04-03~04 (Lambda v8 단일 파이프라인 통합)
1. **Phase 1**: Lambda structureService 100% 이식 (12개 지표, ±20% callWall/putFloor)
2. **Phase 2**: 유니버스 509→1000 확장, GEX 99→1000 전체 확장
3. **Phase 3**: Lambda→Redis cache:analysis 직접 저장 (Upstash REST pipeline)
4. **Phase 4**: 전 9개 서비스 Redis 키 검증 (dashboard `analysis:` → `cache:analysis:` 수정)
5. **Phase 5**: warm-analysis/warm-command/morning-briefing cron 역할 제거 확인
6. **Phase 6**: AWS Lambda 배포 + on-demand TSLA 검증 (9/9 필드)
7. **Phase 7**: Lambda→Redis cache:command:unified 직접 저장 (warm-command 완전 대체)

### 검증 결과
- TSLA on-demand: success=true, 964ms, 9/9 필드
- Redis cache:command:unified:TSLA: 9/9 ✅
- Redis cache:analysis:TSLA: callWall=$400, putFloor=$350, maxPain=$375, iv=42% ✅
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

## 12. 미완료 / 향후 작업 (TODO)

### 🔴 즉시
- [ ] **장중 1000종목 전체 harvest 모니터링** — CloudWatch Logs 확인
  - `signum-harvest` + `signum-flow-harvest` 동시 모니터링
  - 실행 시간, 429 에러 여부, 성공률, API 충돌 여부 체크

### 🟡 단기
- [ ] **GammaFlip 가격 변동 원인 정밀 조사**:
  - Lambda(누적 GEX 교차점) vs Vercel(structureService) 계산 차이 가능성
  - 양쪽 로직 비교 + Redis 캐시 갱신 타이밍 정밀 조사
- [ ] **Lambda 동시성 튜닝** (장중 테스트 결과에 따라):
  - 현재: 배치 10종목 동시, 목표: 15~20
- [ ] **Vercel `warm-flow` 폴더 삭제** — Lambda 이관 완료 확인 후 제거

### 🟢 중기
- [ ] 모바일 최적화 (앱 수준 UX)
- [ ] 짜잘한 UI 버그 전수 조사 및 수정

### ✅ 완료
- [x] **`signum-flow-harvest` Lambda 배포 및 검증 완료 (2026-04-05)**:
  - Lambda 함수: `signum-flow-harvest` (nodejs20.x, 600s, 1024MB)
  - EventBridge: `signum-flow-harvest-5min` (rate(5 minutes), ENABLED)
  - 1000종목 완전 독립 warm — 249초(4분9초)에 1000종목 처리, fail=0
  - Redis 키: `rt-metrics:{TICKER}`, `cache:flow:unified:{TICKER}`, `darkpool:{TICKER}`
  - 프로덕션 검증: NVDA cached:true DP:56.6%, AAPL cached:true DP:22.3%, META cached:true DP:19.9%
  - Vercel 코드 수정 0줄 — 기존 API가 Redis-first이므로 자동 캐시 히트
  - `signum-data-harvest` 영향 0 — 완전 독립 파이프라인
- [x] vercel.json cron 5개 삭제 (2026-04-04)
- [x] Flow 35 DTE 최적화 — SPY 21초→1.9초 실측 확인 (2026-04-04)
- [x] whale-trades 캐시 항상 저장 (2026-04-04)
- [x] 포트폴리오 종목 추가 즉시 반영 수정 (2026-04-04)
- [x] warm-flow 병목 분석 완료 — 실측 데이터 기반 보고서 작성 (2026-04-04)
- [x] Dashboard 장마감 라벨 비어있는 문제 — 코드 버그 아님, MCD 등 post-market 데이터 없는 종목 정상 동작 확인 (2026-04-04)
- [x] GammaFlip 카드 깜빡임 수정 — `underlyingPrice=0` falsy 판정으로 SHORT/LONG 라벨 소멸 + fetchPriceOnly 0가격 덮어쓰기 방어 (2026-04-04)
- [x] Intel SectorCommand Holiday/Weekend 인식 — `useMarketStatus()` SSOT 통합, Holiday 라벨 + Weekend 표시 + 카운트다운 숨김 (2026-04-05)
- [x] 미사용 cron 폴더 3개 삭제 — `warm-command`, `warm-analysis`, `morning-briefing` (2026-04-05)

### 2026-04-05~06 (Flow 페이지 성능 최적화 — Lambda Raw Cache + Demand-Driven Dynamic Universe)
1. **Lambda v2.1 (signum-flow-harvest)**: Polygon 옵션 스냅샷 raw 데이터를 Redis에 사전 캐싱
   - 원본 데이터만 저장 (계산 0), 업계표준 CQRS 패턴
   - 계산(Max Pain, GEX 등)은 Vercel 기존 코드 100% 사용 → 정합성 100%
2. **Vercel Cache-First 연동**: centralDataHub + structureService에서 Redis 먼저 체크
   - HIT 시 Polygon Reference(1-2초) + Snapshot(1-2초) + Exact(1-2초) 전부 스킵
3. **Progressive Rendering**: `displayPrice > 0` 블로킹 가드 제거 → FlowRadar 즉시 마운트
4. **장외시간/주말 TTL 동적 조절**: 장중 5-10분, 장외 24h, 주말 72h
   - 기존 문제: TTL 10분 → 장 마감 10분 후 모든 데이터 소멸
   - 수정: `getEffectiveTTL()` 함수로 시간대별 자동 조절
5. **Demand-Driven Dynamic Universe**: 비유니버스 종목 1회 조회 후 Lambda 자동 수집
   - Vercel: raw 캐시 저장 + `flow:dynamic-universe` 리스트 등록
   - Lambda: 유니버스 처리 후 dynamic list 읽어서 추가 수집 (완전 분리)
   - 장 마감 → 리스트 TTL 만료 → 자동 소멸 (다음날 재조회 시만 재등록)

#### 성능 검증 결과
| 종목 | Before (Cold) | After (Lambda Hit) | 개선율 |
|------|:---:|:---:|:---:|
| TSLA (유니버스) | 13,543ms | **1,616ms** | **88%↓** |
| NVDA (유니버스) | 3,829ms | **692ms** | **82%↓** |
| AMC (비유니버스 1회차) | 7,468ms | 7,468ms | 변동없음 |
| AMC (비유니버스 2회차+) | 7,468ms | **유니버스 동일** | Lambda 자동 수집 |

---

*마지막 업데이트: 2026-04-06T00:56 KST*

