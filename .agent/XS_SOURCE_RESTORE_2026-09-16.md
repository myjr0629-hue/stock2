# XS(알파스코어) 원천 복구 — 2026-09-16

> 정본: 「XS 엔진이 지금 무엇을 어디서 읽는가, 어떻게 배포·검증·감시하는가」.
> 배경 진단은 `ALPHA_SCORE_FULL_REPORT_2026-09-16.md` §5-2 · §8 P0. 접근 방법은 `ACCESS-RUNBOOK.md`.

## 0. 한 줄 결론

`signum-xs` 가 9/1 부터 매일 `universe too small: 0` 으로 죽은 원인은 **원천 테이블의
생산자가 이관 때 은퇴한 것**(`signum-unified-cache` 대량 기록 = 옛 signum-harvest
`v8-structureService`, 마지막 8/28 13:05)이다. 엔진의 점수식은 그대로 두고 **입력 배관만**
살아 있는 파이프라인으로 옮겼다(`scripts/lambda-xs/source-adapter.js`). SPY 종가·체결가는
Intrinio 세션 호가로 복구했고, CloudWatch 알람 5종을 기존 SNS 경로에 걸었다.

## 1. 무엇이 어디서 오는가 (엔진 입력 13개 + 유니버스)

| 입력 | 살아 있는 원천 | 갱신 | 비고 |
|---|---|---|---|
| 유니버스·가격(px)·netGex·pcr·squeeze | Upstash `structure:part:v2:{0..7}` — Vercel 크론 `/api/cron/structure-build` (화면과 **같은 함수** `getStructureData`) | 13/15/17/19/21:05 UTC | 1,992행. netGex 부호 규칙이 옛 기록기와 동일(call −1 / put +1, 코드 대조 완료) |
| iv (ATM IV) | EC2 Redis `polygon:snapshot:probe:{T}` 원시 체인(flow-harvest 적재) → 옛 기록기와 같은 ATM 규칙으로 재계산 | ≤20분 | 폴백: alpha-history 당일행 → gex-history 최신행(≤4일) |
| darkPool % · shortVol % | EC2 Redis `finra:offexchange` (FINRA regShoDaily, 12.7k 종목) | 매일 21:45/22:45 UTC | 22:10 실행 시점엔 **전일 세션** (행마다 `d` 로 날짜 보존, 4일 초과면 null) |
| daysToCover | FINRA `consolidatedShortInterest` 최신 정산일 벌크 (5,000행 페이징, 무인증) | 월 2회 | 22,569행. `fields` 로 3개 열만 |
| bullishPct | DynamoDB `signum-pattern-db` `ANALYST:{T}` (signum-fmp) | 매일 13:30 UTC | ≤10일 |
| peers | DynamoDB `signum-pattern-db` `RELATED:{T}` | **8/28 동결** | 벤더에 related-companies 가 없다. 정적 피어 그래프로 사용 |
| marketCap | Intrinio `securities/{T}/data_point/marketcap` → 엔진 자기 테이블 `_SRC_` 행에 캐시 | 종목당 주 1회 | ETF 는 404 → 제외(예전에도 fundamentals.marketCap 이 없어 제외됐다). 벤더 장애 시 폴백 = 동결 unified 행 × 가격비 |
| smaDist | (SMA50−SMA200)/SMA200×100 — `_SRC_` 행의 200세션 종가 링에서 계산 | 매일 | 링은 Intrinio 일별가(adj_close)로 1회 시드, 이후 EC2 `intrinio:eod:history`(공식 종가, T+1)+당일 px 로 연장. 분할 의심(±40%↑)이면 재시드 |
| blockTrades | **없음** | — | Intrinio Startup 에 체결 피드가 없다. null → 엔진이 횡단면에서 그 팩터를 건너뛴다(<40 종목) |
| revChg·revRet3·dGex5·analystRev | 엔진 자체 링(_STATE_) | — | 아래 §3 |

좀비 가드(4일)는 유지: **구조 bake 가 4일 이내** + **공식 EOD 종가가 최근 4세션 안에 있음** 둘 다여야 편입.

## 2. 파일

| 파일 | 역할 |
|---|---|
| `scripts/lambda-xs/source-adapter.js` | 위 표를 그대로 구현. 엔진에 옛날과 **같은 모양**의 스냅샷 Map 을 준다 |
| `scripts/lambda-xs/index.js` (= `scripts/xs-engine.js`) | 1단계(unified-cache 스캔)만 어댑터 호출로 교체 + 링 위생 + `_SRC_` 행 저장 + `{dry:true}` 이벤트 |
| `scripts/lambda-xs-paper/index.js` | §4 |
| `scripts/xs-src-backfill.js` | `_SRC_` 행(시총·종가 링) 일괄 시드. 장 마감 후 로컬에서 1회 (Intrinio 900/min) |
| `scripts/deploy-xs-code-only.js` | 코드만 올린다(env 보존 검증, `--timeout 900`). ⚠ `deploy-xs.js` 는 powershell + env 통째 치환이라 **쓰지 말 것** |
| `scripts/setup-xs-alarms.js` | §5 |

## 3. 엔진에서 바꾼 것 / 안 바꾼 것 (검증 헌법 §42.3)

- **안 바꿈**: 팩터 정의·사전확률·가중·앙상블·피어잔차·EMA·백분위·라벨러·게이트. 2단계 이후 코드는 손대지 않았다.
- **바꿈(입력 배관)**: ① 1단계 원천 ② 출력 `_SRC_` 캐시 행 ③ **링 위생** — 2주 공백 뒤 첫 실행에서
  «1일 반전»이 8/31 종가 대비가 되는 것을 막는다. 자기 종가 링은 공식 EOD 로 빈 세션을 채우고,
  7칸짜리 GEX·애널리스트 링은 14일 넘은 항목을 버린다(그 링은 정상이면 14일을 못 넘는다).
  건강한 날엔 no-op. EMA 상태는 손대지 않았다(입력이 아니라 엔진 상태).
- IV 단위: 옛 Lambda 는 `raw>1` 이면 퍼센트로 봤는데 IV 100%↑ 종목에서 깨진다(NVDA 1.298→1.3).
  화면 서비스의 규칙(`raw<5` 면 소수)을 따랐다. 순위 변환이라 크기는 무관, 순서만 맞으면 된다.

## 4. 페이퍼 엔진(`signum-xs-paper`) — SPY 종가·체결 복구

- 원인: `signum-alpha-history` 의 open/close/high/low 를 쓰던 harvest 경로가 8/28 에 멈춤 →
  `spyClose` null, 체결가 없음(«no open px — order lapsed»), NAV 동결.
- 조치: 체결·청산·평가·SPY 벤치마크의 OPEN/CLOSE 를 **Intrinio 세션 호가**
  (`securities/{t}/prices/realtime` 의 `open_price`/`close_price`, 마지막 체결이 **오늘(ET)** 인 행만)에서.
  실측: SPY `close_price` 757.39 == EOD `adj_close` 757.39 (9/15). alpha-history 행은 폴백.
- 유니버스 가격·시총은 동결된 unified-cache 대신 **XS 엔진 자기 행**(`cache:xs:scores` 의 날짜)에서.
- 거래일 판정: SPY 세션(오늘 ET·거래량>0)이 1차, 옛 중앙값 규칙은 벤더 불통 시 폴백.
  (옛 규칙은 9/14 월요일을 «휴장»으로 오판했다 — SSR 행이 66개뿐이라 표본이 얇았다.)
- 전략 상수(§2 PREREG)는 그대로. 버전만 PAPER-1.0.1.

## 5. 알림 — CloudWatch → SNS `signum-lambda-alerts` (contact@signumhq.com, 확인됨)

| 알람 | 조건 | 뜻 |
|---|---|---|
| `signum-xs-errors` | Lambda Errors ≥1 /1h | 실행 실패 |
| `signum-xs-universe-low` | 로그 `[XS] source snapshots: N tickers` 의 N < 40 | 원천 비었음/낡음 |
| `signum-xs-scores-missing` | 페이퍼가 매일 22:40 찍는 `[PAPER] xs-scores-present N` 의 N < 1 | Redis 키 없음 = 앱이 V8 로 폴백 중 |
| `signum-xs-scores-stale` | `[PAPER] xs-scores-age-days N` ≥ 4 | 키는 있는데 갱신이 멈춤(월요일은 3) |
| `signum-xs-paper-errors` | Lambda Errors ≥1 /1h | 페이퍼 실패 |

데이터 없음 = notBreaching(주말). 로그 필터에서 `[XS]` 는 대괄호가 구분자라 `tag="XS"` 로 매칭한다.
텔레그램은 마케팅용(비활성)·슬랙 없음 → 기존 운영 경로(SNS 이메일) 사용.

## 6. 절차

```bash
# 1) 코드만 배포 (env 개수 전후 대조 · Timeout 900)
node scripts/deploy-xs-code-only.js xs --timeout 900
node scripts/deploy-xs-code-only.js paper
# 2) 검증 — 아무것도 안 쓰는 실행
node -e "…InvokeCommand({FunctionName:'signum-xs', Payload:'{\"dry\":true}', LogType:'Tail'})"
#    로그에 [XS] source snapshots: 1,7xx tickers · [XS-SRC] coverage {...}
# 3) 알람 (멱등)
node scripts/setup-xs-alarms.js
# 4) _SRC_ 시드가 비었을 때만 (예: 테이블 재생성)
node scripts/xs-src-backfill.js
```

## 7. 실측 (2026-09-16 복구 당일)

<!-- 아래 숫자는 복구 검증 시점의 실측. 갱신 시 날짜를 함께 고칠 것. -->
- 백필(로컬, 04:20 UTC): 구조행 1,992 → 살아있는 종목 1,962 · Intrinio 시총 1,769 OK / 404(ETF) 193 · 종가 링 시드 1,962 · `_SRC_` 1,962행 기록 (382초, 900/min)
- Lambda DRY(`{"dry":true}`, 04:36 UTC, 25초): `[XS] source snapshots: 1757 tickers` · scored 1,754 · 커버리지
  `{gex:1139, pcr:1139, squeeze:1139, iv:1148, darkPool:1752, shortVol:1752, analyst:1340, sma:1738, dtc:1752, peers≥3:1065, belowMcap:12, noMcap(ETF):193}`
  · 링 위생 1,757종목 · 라벨 0(예상 — 마지막 점수가 8/31 이라 12일 창 밖) · 가중·변형 IC 이력 그대로(frozen 28d 0.034 · clean 25d 0.054)
- 배포: `signum-xs` 23→34KB, env 8개 보존, Timeout 600→900 · `signum-xs-paper` 5→7KB, env 6개 보존 (04:35 UTC)
- 앱: 04:40 UTC 시점 `engineVersion "8.0.0"` — **정식 발행은 당일 22:10 UTC 예약 실행이 한다**(수동 실운영 실행은 권한 정책으로 막혀 하지 않았다). 다음날 확인: `curl -s 'https://www.signumhq.com/api/command/unified?t=AAPL' | grep -o '"engineVersion":"[^"]*"'` → `XS-2.0.0/…`
- 알람: 5종 생성, 로그 메트릭 필터 3종 설치(샘플 추출 검증), 첫 데이터포인트 전까지 INSUFFICIENT_DATA
- 동시 작업 주의: 04:28 UTC 에 다른 세션/사람이 4개 Lambda(signum-xs·xs-paper·harvest·flow-harvest) env 에 `REDIS_PROXY_KEY`·`EC2_REDIS_PROXY_KEY`(64자)를 추가했다(프록시 키 회전으로 보임). 어댑터는 env 를 우선 읽으므로 호환. `deploy-xs.js` 를 누가 돌리면 env 가 3개로 치환된다 — 쓰지 말 것.

## 8. 남은 한계 (정직하게)

- blockTrades 팩터는 원천이 없다(사전확률 0 · clean/frozen 가중 없음 → 주 점수에 영향 없음, anti 변형에만).
- peers 는 8/28 정적. 벤더가 바뀌기 전엔 갱신 수단이 없다.
- darkPool/shortVol 은 하루 지연(FINRA 공표 시각). 두 팩터 모두 사전확률 0.
- SMA 링은 첫 시드가 adj_close, 이후 원시 종가 — 분할 감지로 재시드하나 배당 조정 차이는 무시한다(200일 평균에 무의미).
- 이관 전후 팩터 IC 대조(BACKLOG §②)는 이 복구로 **측정이 다시 시작된 것**이지 끝난 게 아니다.
