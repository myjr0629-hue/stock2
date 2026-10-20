# 묶음 5 계산 정의·단위·커버리지 인계

기준: `2e4732ca9`, 작업 브랜치 `fix/b5-calc-defs`. 근거 감사 `SESSION-MATRIX-CODEX.md` 전체를 읽었다.

**전체 화면 통합은 미완료다.** 아래에서 실제 서비스에 연결한 변경과 순수 함수만 준비한 변경을 구분한다.
지정된 병행 브랜치의 파일에는 손대지 않았다. 라벨·문구·칸 숨김 변경, 커밋·push·병합·배포·운영 읽기/쓰기는 하지 않았다.
시험에서 사용하는 캐시·구조 조회·HTTP 응답은 전부 메모리 모의 객체다. `.env*` 열람 및 브라우저 접근 없음.

## 확인한 원인과 실제 연결한 변경

1. `computeVolatilityRegime`는 없는 flip을 0, 거리를 0으로 만들어 근접도 15점을 부여했다. GEX·IV·집중도·squeeze도 0으로 채웠다.
   계산을 `src/lib/metrics/volatilityRegime.ts`로 옮기고 필수 6개 입력 전부가 유효할 때만 점수를 반환한다.
   결측이면 `regimeScore/regime`는 null이며, 독립적으로 관측된 나머지 필드는 유지한다.
2. `/api/live/volatility-regime`만 DynamoDB 가격·flip을 섞고 점수를 계산한 뒤 표시 flip을 다시 바꿨다.
   `/api/live/premium-metrics`와 함께 `computeStructureVolatilityRegime(structure, nowMs)`를 호출한다.
   동일 구조 판본을 기존 레벨 게이트에 통과시킨 뒤 한 번 계산한다. 레벨 게이트·세션 달력 자체는 수정하지 않았다.
3. `indexBreadth`는 10개 유효 종가를 평균해도 SMA20으로 반환했고 중간 결측을 filter로 제거했다.
   순수 `indexBreadth`로 분리했다. 최신 20개 날짜와 길이가 맞는 20개 유효 종가를 가진 종목만 센다.
   구성종목 50% 이상이라는 기존 기준을 유지한다. 분모는 계산된 종목 수이며 결측 종목은 커버리지에 남긴다.
   서비스의 0~1 비율과 API의 0~100 퍼센트 변환 모두 메타데이터를 유지한다.
4. `dealerGamma`의 백분위와 flip 거리를 순수 `percentile/flipDistance`로 모았다.
   백분위 분모는 현재 관측을 뺀 과거 유효 관측 수, 최소 10개다. 기간은 실제 저장 표본으로 명시한다.
   거리 분모는 flip 가격이다. 화면용 반올림으로 ±3% 불안정 판정이 달라지지 않게 했다.
   `unifiedDataStream`의 AI 백분위 호출은 가격을 쓰지 않으므로 SPY×10 proxy 가격쌍 전달을 제거했다.
5. Gamma Shield의 `SPY × 10`은 `spyIndexProxy`를 거쳐 계산하며 네 가격 필드에 공통 `priceBasis`를 붙인다.
   새 계산·메모리 캐시·Redis 캐시 응답 모두 `status:proxy`, `observedTarget:false`, 원천 SPY·배수 10·단위를 전달한다.
   기존 호환 스칼라는 유지했다. 화면이 이 표식을 읽어 대용값을 명시하는 연결은 b2 화면 파일과 겹쳐 남겼다.

## 순수 함수 계약과 연결 대기

`Metric`은 `value/status/kind/unit/basis/period/denominator/coverage/inputs/reason/proxy`를 함께 반환한다.
`coverage`는 검증된 원천 입력만 센다. 점수는 필수 입력 100%를 요구하며 실제 0을 유지한다.
지수 breadth는 위의 명시된 50% 구성종목 기준을 사용한다.

| 새 모듈 | 정의 | 운영 호출 연결 |
|---|---|---|
| `volatilityRegime.ts` | 기존 레짐 가중치, 6개 필수 입력, IV는 명시적 % 단위 | 서비스 및 두 API 연결 |
| `indexBreadth.ts` | SMA20 위 구성종목 / 커버된 구성종목 | 서비스 및 premium API 연결 |
| `percentile.ts` | 현재 제외 경험적 백분위, flip 기준 거리 | dealerGamma 연결, 레짐 거리도 같은 함수 |
| `proxy.ts` | 관측 target 값은 null, `proxyValue`로만 SPY×10 접근; IV 소수/%는 입력 단위로 변환 | SPY proxy만 Shield 연결; IV 소비처 연결 대기 |
| `opi.ts` | `clamp(round(100 − 50 × OI PCR), 10, 95)`; 35일 전 만기 OI만 허용 | Flow 및 OI 원천 파일 겹침으로 대기 |
| `squeeze.ts` | 기존 구조 계산기의 GEX·집중도·DTE·ATM IV·주간 OI PCR 모델; 확률이 아닌 점수 | structureService·Flow·FlowRadar 겹침으로 대기 |
| `whaleNetBet.ts` | 세션이 있는 주식 장외 signed notional만, 옵션 프리미엄 대입 금지 | Flow 및 dark-pool 날짜 전달 파일 겹침으로 대기 |
| `marketRisk.ts` | 기존 제한 가중치 유지, 5개 측정 입력 필수, 높은 값=risk-on | Dash의 중립 대체 및 평균 분모 수정과 함께 연결 필요 |
| `conviction.ts` | CMD의 SMA cross·VWAP 거리·OI PCR·GEX·순프리미엄 기존 가중치, 5개 입력 필수 | CMD 결측 점수 작업과 겹침으로 대기 |
| `alpha.ts` | 포트폴리오 평가액 가중 평균, 양수 평가액 전부의 alpha 필수 | Portfolio 병행 변경과 겹침으로 대기. **개별 V8/XS 엔진을 옮긴 것이 아님** |
| `optionPremium.ts` | 주간 volume×close×100의 콜/풋 합·차·콜 비중; 체결 순매수로 해석 금지 | 원천 centralDataHub 및 Flow/CMD 겹침으로 대기 |
| `optionNotional.ts` | 기존 EOD 명목 정의: 신규 계약×계약 승수×행사가. 옵션 프리미엄과 다른 단위 | EOD/Today/Flow 호출 연결 대기 |
| `uoa.ts` | 거래량 계약 수 / OI 계약 수. 분모 0·결측을 1로 대체하지 않음 | Flow 겹침으로 대기 |
| `portfolioPnl.ts` | TODAY=(세션 가격−그 세션 비교 종가)×수량; 총손익=(현재가−평균매입가)×수량 | Portfolio·가격쌍 전달 파일 겹침으로 대기 |
| `probability.ts` | 관측확률은 성공 수/실제 시행 수, 확률 차이는 %p | FedWatch·이력·AI 소비처 연결 대기 |

연결 대기 함수의 회귀시험 통과는 현재 화면 수리가 끝났다는 뜻이 아니다. 기존 호환 계산기는 아직 남아 있다.
특히 `marketRiskScore({}) === 50`, 개별 alpha의 중립 대체, Flow IV Rank 기반 squeeze는 이 브랜치에서 제거하지 않았다.
원천이 이미 결측을 0으로 채운 경우 새 순수 함수만으로 그 0의 진위를 역추론할 수 없다. 원천 연결 때 커버리지도 넘겨야 한다.

## 감사 묶음 5의 44개 행별 상태

`연결`은 실제 서비스 경로 변경, `준비`는 순수 함수만 추가, `남김`은 기존 경로 미수정이다.

| 행 | 상태와 남은 작업 |
|---|---|
| D06 | 남김: CNN F&G와 VIX 추정 분리. Dash(b1a)와 Guardian/RLSI(b2) 소비처 조정 필요 |
| D07 | 준비: marketRisk. Dash의 평균 분모·ready·결측 표시까지 같이 연결 필요(b1a) |
| D09 | 준비: optionNotional. institutionalFlow/EOD/카드의 계약별 집계 연결 남김 |
| D10 | 연결: dealerGamma 백분위·flip 거리·입력/단위/분모. Dash 라벨은 유지 |
| D11 | 남김: rotation 엔진 점수/백분위 메타 통합 및 Dash 연결 |
| D12 | 연결: SMA20 breadth 기간·커버리지·단위. NDX/DOW 화면 소비처 통합은 남김 |
| F07 | 준비: optionPremium. 프리미엄 원천·Flow 호출 연결 남김 |
| F08 | 남김: 주간 체인 거래량 집계·분모; Flow 파일 b1b/B3와 겹침 |
| F09 | 남김: OI 35일 분모 및 asOf 전달; B3와 겹침 |
| F10 | 준비: opi. 초기화·티커 교체·실제 OI basis 연결; b1b/B3/CMD 작업과 겹침 |
| F11 | 준비: squeeze·명시적 IV 단위 변환. Flow/structureService 겹침 |
| F13 | 준비: optionNotional. EOD 날짜·계약 승수·확정/추정 구분 연결은 B3와 겹침 |
| F15 | 준비: whaleNetBet·uoa. 주식/옵션 대체 제거와 날짜 입력 연결은 Flow/B4와 겹침 |
| F16 | 남김: 9요인 종합 점수·confidence·pin 근거 필드 연결. Flow/CMD 작업과 겹침 |
| F17 | 남김: 생성 체인 제거는 b1b, 실제 체인의 지지/저항·범위 정의 연결 필요 |
| C05 | 준비: 명시적 IV 단위 변환. IV/RV·ATR·BB·ADX 소비처 통합은 CMD와 겹침 |
| C06 | 준비: 공용 volatilityRegime·conviction. CMD 본문은 결측 점수 브랜치와 겹침 |
| C07 | 남김: OBV slope 단위·SMA 결측. CMD 및 라벨 대표 결정 필요 |
| C08 | 남김: 애널리스트 분모·목표가 상승여력, CMD 연결과 함께 처리 필요 |
| C09 | 남김: 부분 목표가 결측은 CMD 작업과 겹침 |
| C10 | 남김: 재무 점수 입력 커버리지·세부 점수 계약 및 CMD 연결 필요 |
| C11 | 남김: 실적 surprise/YoY 단위·기간과 CMD 연결 필요 |
| C12 | 남김: IVSkewCurve와 원천 API는 b1c와 겹침 |
| C15 | 남김: 13F 분기·금액·비중·내부자/의원 집계, CMD 연결 필요 |
| C16 | 준비: 관측확률/백분위. 5일 tape·GEX 이력의 실제 호출 연결은 CMD/b2와 함께 처리 필요 |
| I03 | 남김: 섹터 평균·상승/하락 분모는 intel-zero-narrow와 겹침 |
| I04 | 남김: 섹터 옵션 집계는 intel-zero-narrow/structureService와 겹침 |
| I05 | 준비: gamma squeeze. WHALE/LIQUIDITY/IV SKEW·개별 alpha 엔진은 미통합 |
| I06 | 남김: 구조 레벨 정의·basis 전달은 B3/B4 및 옵션 게이트 작업과 함께 필요 |
| I07 | 남김: implied move 및 기준 세션은 Intel/b2와 겹침 |
| I08 | 남김: 리포트 커버리지·평균 PCR/alpha·GEX 분모는 Intel 작업과 겹침 |
| G01 | 남김: RLSI 순수화·모든 세션 동일 입력·커버리지, rlsiEngine은 b2와 겹침 |
| G03 | 남김: 선물/현물 상품 분리와 Guardian/OracleHeader 연결, b1a/b2와 겹침 |
| G08 | 남김: liquidity/safeHaven 원천은 rlsiEngine(b2), 화면 단위 연결 필요 |
| G09 | 준비: probabilityChange %p·observedProbability. FedWatch 모형확률은 관측확률과 별도로 계약 필요 |
| G10 | 남김: What-if 기준 점수 결측 및 RLSI 연결; b2와 함께 처리 필요 |
| G11 | 남김: Shield의 SPY/QQQ GEX·squeeze 결측을 0으로 합산하는 경로는 유지. nullable 결과를 받는 b2 화면/RLSI와 함께 수정 필요 |
| G12 | 연결: Shield proxy 표식. 실제 S&P 관측으로 표시하지 않도록 b2 화면 연결·대표 문구 결정은 남김 |
| G13 | 남김: rotation 실제 0·3-day velocity/5-day return 정의·분모와 원천 세션은 b2/RLSI와 함께 수정 필요 |
| P02 | 준비: portfolioPnl. price/referenceClose 같은 세션 쌍을 넘기는 Portfolio 연결은 b2/별도 Portfolio 작업과 겹침 |
| P04 | 준비: portfolioPnl. 매입가 대체 평가 제거와 총합 커버리지는 Portfolio 작업과 겹침 |
| P05 | 남김: 결측 평가액의 비중·집중도·차트 분모는 Portfolio 작업과 겹침 |
| P06 | 준비: portfolioAlpha. 화면 산술평균/50 대체·action/confidence 및 개별 V8/XS 엔진은 미통합 |
| X03 | 남김: AI 문장 숫자를 `Metric.inputs`에 연결하는 프롬프트·출력 검증은 미구현. 준비 함수만으로 자유 생성 숫자를 보증하지 않음 |

## 파일 겹침과 인계 대상

`git diff --name-only HEAD...<branch>`로 확인한 관련 파일이다. 아래 파일은 변경하지 않았다.

| 병행 작업 | 관련 겹치는 파일 |
|---|---|
| b1a | `app-view/dash/page.tsx`, `components/guardian/OracleHeader.tsx` |
| b1b | `app-view/flow/page.tsx`, `api/live/ticker/route.ts`, `services/intrinioClient.ts` |
| b1c | `components/IVSkewCurve.tsx`, `api/live/options/atm/route.ts`, `lib/ivSkew.ts`, `services/intrinioClient.ts` |
| session-archive(B3) | `app-view/flow/page.tsx`, `api/app/oi-pcr/route.ts`, `api/flow/options-eod/route.ts`, `api/live/ticker/route.ts`, `services/structureService.ts`, `services/guardian/breadthEngine.ts`, `services/guardian/intelligenceNode.ts` |
| intel-zero-narrow | `app-view/intel/page.tsx`, `api/intel/fast/route.ts`, `hooks/useIntelSharedData.ts`, `services/watchlistBatchService.ts` |
| Command 결측 점수 / b5-option-gate | `app-view/cmd/page.tsx`, `app-view/flow/page.tsx`, `services/structureService.ts`, `services/centralDataHub.ts`, `services/terminalEnricher.ts`, `lib/premiumFlow.ts`, AI deepSnapshot/route/components |
| b2-session-unify | `services/guardian/rlsiEngine.ts`, `components/FlowRadar.tsx`, `components/guardian/{GammaShield,mobile/MobileGammaShield}.tsx`, `components/history/GexTimeline.tsx`, `hooks/useOnePipe.ts`, 공용 가격/달력 함수 |
| b4-source-stamp(추가 보존) | `hooks/usePortfolio.ts`, `lib/optionMetrics.ts`, `lib/app/intelOptionsBasis.ts`, `api/flow/dark-pool-trades/route.ts`, app-view Flow/CMD/Intel |
| 별도 fix/integ2-portfolio(추가 보존) | `portfolio/{MobilePortfolioPage,PortfolioClientPage}.tsx`, `components/portfolio/{MobileHoldingCard,MobilePortfolioOverview,MobilePortfolioRisk,PortfolioCharts}.tsx`, `hooks/usePortfolio.ts` |

## 공유 함수 호출자와 시험 영향

- `computeVolatilityRegime`: 이전 운영 직접 호출자는 위 두 live API뿐. 지금 두 API는 `computeStructureVolatilityRegime`를 거쳐 같은 순수 함수를 사용한다. 기존 서비스 export는 유지한다.
- `indexBreadth` 서비스: `computeIndexBreadth` → `getIndexBreadth` → `/api/live/premium-metrics` 및 `guardian/unifiedDataStream`의 `ma20Breadth`. 기존 비율 필드는 유지하며 별도 metric을 추가한다.
- `dealerGamma`: `getDealerGamma/DealerGammaSignal` → `/api/live/premium-metrics` 및 `guardian/unifiedDataStream`의 AI 백분위 입력. 기존 스칼라 및 ±3% 판정은 유지하며 metric을 추가한다. unifiedDataStream은 백분위만 소비하므로 단위가 다른 Shield proxy 가격 전달을 제거했다. 실제 호출 AST로 SPY 인수 하나만 넘기는지 확인한다.
- `gammaShieldEngine`: `unifiedDataStream`, `guardianCore`, `rlsiEngine` 및 desktop/mobile `GammaShield`의 타입/값 소비에 영향. 값/표시 라벨은 유지하며 대용 표식이 추가된다. 소비처는 병행 변경 때문에 미수정.
- 나머지 새 모듈의 운영 호출자는 아직 없다. 시험에서만 호출된다. 기존 화면의 수리 완료로 집계하지 않는다.

## 대표 결정 필요

- F&G CNN 관측과 VIX 추정의 구분 문구.
- Flow의 “스퀴즈 확률/%”을 gamma squeeze 점수로 표시하는 문구·단위.
- 주식 장외 순명목금액, 옵션 프리미엄 및 “고래”의 의미 구분.
- Shield S&P 라벨에 SPY×10 대용임을 명시하는 문구. 실제 S&P 관측과 혼용하지 않기.
- FedWatch 확률 차이 `%p`, OBV 기울기와 누적 거래량 구분, velocity의 실제 기간 표기.
- 결측 점수의 해석 문구·action/confidence를 표시하는 방식. 중립 50·5를 새로 만들지 않기.

## 시험·남은 위험

- `node --test tests/b5MetricDefinitions.test.cjs`: 최종 14/14 통과. 순수 함수·두 실제 GET의 모의 입출력·서비스 어댑터를 실행했다.
- PRE·REG·POST·주말·추수감사절 고정 시계에서 동일 구조 입력의 두 API 결과가 같다. 실제 운영 날짜 보유 여부를 확인한 시험은 아니다.
- 필수 입력 각각의 undefined/null/NaN/Infinity/문자열, 실제 0, 분모 0, IV 100% 초과, 반올림 경계, 부분 가격/alpha, 손익 100→110의 $10, proxy 표식을 확인했다.
- `/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`: 전체 타입 검사 1회, 종료 코드 0. 이후 Guardian의 불필요한 선택 인수 제거는 최종 AST 시험으로 확인했다. 같은 전체 검사를 반복하지 않았다.
- `git diff --check`: 수정 파일 공백 오류 없음. 신규 파일도 `git diff --no-index /dev/null <file>`로 저장을 확인했다.
- 실제 화면 렌더링·운영 원천/캐시 날짜·AI 출력은 미확인이다. 화면/API 전면 통합과 무결점 달성을 보증하지 않는다.
