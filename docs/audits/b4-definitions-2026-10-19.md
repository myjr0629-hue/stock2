# B4 정의 레지스트리 인계 — 2026-10-19

브랜치 `fix/b4-defs-registry`. 근거: `SWEEP-CLOSED.md` A·D절, `b5-calc-defs.md` 및 b5 상세 인계 문서. 운영 원천을 읽거나 쓰지 않고 코드와 오프라인 모의 입력으로 확인했다. 커밋·push·병합·배포 없음. `.env*` 열람·브라우저 접근 없음.

## 적용한 정의와 연결

| 항목 | 원인 | 변경과 확인 |
|---|---|---|
| D01 | Flow가 IV 백분위를 스퀴즈 값으로 대체 | `flow.squeezeScore`만 읽음. IV 백분위 99에서도 구조 점수 5, 구조 결측이면 null. 기존 확률·% 화면 문구는 요청대로 유지 |
| D03 | 콜 거래량 비중을 프리미엄 비중으로 사용 | b5 `optionPremium` 그대로 재사용. CentralDataHub 합·차 및 Flow 콜 비중 연결. NVDA 60.36M / 116.40M = 51.9% |
| D09 | Flow가 잘린 거래 목록을 다시 합산 | 서버 net30d·buyCount·sellCount만 읽음. CMD와 AI도 같은 요약. −415M 목록이 있어도 −306.9M·0B/5S, 관측 0은 0 |
| D20 | 주식 장외 순명목금액이 없으면 옵션 프리미엄으로 합성 | 합성식 삭제. 화면의 고래 순베팅과 AI가 같은 값/결측을 받음. b5 `whaleNetBet` 재사용. AI 해석에도 주식 장외 순명목금액임을 명시 |
| D21 | 맥스페인 거리 분모가 현재가와 맥스페인으로 갈림 | `(price−maxPain)/maxPain×100` 공용 함수. Flow·Watchlist insight/AI 자리표·Intel mobile·AI 보강 연결. NVDA −3.76%, Watchlist 절대 거리 3.8%. 기존 batch `maxPainDist`는 맥스페인 쪽 압력 화살표 계약을 유지하므로 부호만 반대; 새 `maxPainGapPct`가 Flow와 같은 부호의 변위 |
| D22 | RSI 구간과 상태어가 별도 | 숫자 구간은 공용화(70·55·35). 문구 금지 우선: Flow Neutral/Oversold, CMD Stable 등 기존 어휘 유지. **상태어 완전 통일은 미완료**. 사용자에게 기존 어휘 한 벌로의 통일 허용 여부를 질의함 |
| D24 | ACCUMULATION이면 실제 공매도 편차와 관계없이 낮음으로 강제 | 공매도 실제 비중−평균으로 문장 분기. SPY 57/56·AAPL 54/51에서 ‘뿐입니다’ 분기 안 탐. 문장 문자열은 수정하지 않음 |
| D38 | batch/skew는 이력·분석 캐시, Flow는 별도 체인 | structureService가 해당 주간 체인·현물 ±3%의 풋IV/콜IV를 생산. 기존 `computeIVSkew`도 같은 함수로 위임. 공용 optionMetrics가 Flow·CMD·Watchlist·Intel 출력의 atmIv/ivSkew를 덮음. IV30과 근월 ATM IV는 별도 지표로 유지(D02 제외) |
| D41 | 수집 Lambda의 전체 체인·달러 GEX·벽 중간값 flip·별도 squeeze와 구조 판본 혼합 | 정본은 `structure:v2`. 활성 `harvest_lambda/index.js`에서 별도 GEX/벽/flip/스퀴즈/ATM IV/스큐 계산 제거, 저장본 읽기로 위임. OI 35일 집계·IV30 수집은 유지. history GET은 같은 세션의 정본을 우선하며 대체된 원본 행은 `supersededLegacy`에 최대 600개 표본과 전체 `supersededLegacyCount`로 반환. 원본 저장 행은 변경하지 않음. 과거 다른 정의를 structure_v2로 재표기하지 않음. AI 이력 통계는 structure_v2만 사용 |
| D45 | S3 괄호 부호 반대 | 공용 표준 피벗. S3 = L−2(H−PP), 표본 206.71. 지지·저항 순서 검증 |

D02·D10·D30·D34·D35는 변경하지 않았다. 번역 사전 `TRANSLATIONS`·`APP_FLOW_COPY`·`WHALE_DP_COPY`는 HEAD와 AST 대조로 동일함을 확인했다. 화면 칸을 숨기는 변경 없음. AI 프롬프트의 지표 설명과 캐시 버전은 새 정의에 맞췄다.

## 파일 묶음

- 정의: `src/lib/defs/{market,optionStructure,gexHistory}.ts`.
- b5 재사용: `src/lib/metrics/{contract,optionPremium,whaleNetBet}.ts` — b5 파일과 동일, 별도 산식 추가 없음. 통합 때 같은 이름의 파일은 중복 생성하지 말 것.
- 앱: `src/app/[locale]/app-view/{flow,cmd}/page.tsx`, `src/components/intel/mobile/MobileTickerDetail.tsx`.
- 공용 소비/생산: `src/lib/{premiumFlow,optionMetrics,optionLevelGate,darkPoolRead}.ts`, `src/lib/app/{watchlistInsights,watchlistAiLine}.ts`, `src/services/{centralDataHub,structureService,alphaEngine,gexHistoryService}.ts`.
- AI: `src/lib/ai/{deepSnapshot,flowTrust,deepTrust,flowTokens,aiqTrust}.ts`, `src/app/api/{flow/ai-analysis,command/deep-analysis}/route.ts`.
- 이력: `src/lib/aws/historyStore.ts`, `src/app/api/{history,cron/harvest-history}/route.ts`, `harvest_lambda/{index,structure-read}.js`.
- 시험: `tests/b4Definitions.test.cjs` 및 정의 변경에 맞춘 기존 회귀 시험 4개.

## 공유 함수 호출자와 영향

- `applyOptionMetrics`/`applyUnifiedOptionMetrics`: live/ticker 출구, command/unified 출구, watchlistBatchService, intel/fast 및 같은 옵션 metrics를 입력받는 optionAlphaService. 결측 구조를 이력 GEX/skew로 대체하지 않는다. 구조의 0은 유지한다.
- `computeIVSkew` 호환 export: live/ticker의 화면·알파 경로, watchlistBatchService의 치유·전체 계산, portfolioBatchService, powerEngine. ±3% 풋IV평균/콜IV평균 정의는 같고 숫자가 아닌 입력·무한대는 배제한다. 화면 파일을 직접 수정하지 않은 호출자도 이 영향을 받는다.
- `applyLevelsToRealtime` 거리: watchlistBatchService, portfolioBatchService, intel/fast와 structureService의 overlayLevelsOnQuotes. hooks/useWatchlist·usePortfolio, 데스크톱 watchlist/portfolio, MobileWatchlistTabs가 거리 필드를 읽는다. 기존 압력 방향 부호는 유지했고 분모만 공용화했다. 근접도 abs 임계값 경계는 정의 변경에 따라 달라질 수 있다.
- `readDarkPool`: `app-view/cmd/page.tsx`, 웹 `flow/[ticker]/page.tsx` 및 `services/darkPool.ts`, `components/app/watchlist/useWatchlistData.ts` 공용 소비처에 해석 분기가 적용된다. 기존 번역 문장·라벨은 유지한다.
- `buildDeepSnapshot`/`computeGexStats`: 앱 CMD 및 deepWarmService(서버 예열). 현행 레짐은 현재 snapshot의 구조에서 읽고, 구형 이력은 현재 구조 통계에 섞지 않는다. `gexHistoryService.buildHistoryContext`의 Intel 과거 비교도 canonical 행만 사용한다.
- `fillAiLine`: Watchlist AI 서비스·앱 한 줄 렌더와 기존 시험. MP 자리표만 맥스페인 분모, CW/PF/GF 일반 레벨 거리는 기존 가격 분모를 유지한다.

## 시험

- `node --test tests/b4Definitions.test.cjs`: 20/20 통과. 폐쇄 모듈 로더: 미지 외부 모듈·실제 네트워크 금지. 모의 Redis/Dynamo/HTTP만 사용.
- 실제 History GET과 `harvestGex` 함수를 실행해 legacy −14M/flip182.5와 canonical +4.79M/flip null 충돌을 재현. canonical +4.79M/풋205/스퀴즈5/스큐1.08이 나가는지 확인.
- 같은 판본에서 Flow·CMD·Watchlist·Intel·AI 어댑터 값 비교, PRE·REG·POST·주말·추수감사절 고정 시계, 0·결측·잘린 내부자 목록·분모0·RSI 경계·S3 순서·다크풀 3개 언어 분기 확인.
- 전체 타입 검사: `/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false` 1회 종료 코드 0. 정의 모듈의 별도 strict 타입 검사도 종료 코드 0. 최종 계약 9개 루트와 의존성의 프로젝트 설정 상속 검사도 종료 코드 0. 추가 검사 첫 명령은 저장소 별칭 설정이 없어 실패했으며, 설정 보정 후 전역 잠금 대기를 거쳐 통과했다. 전체 타입 검사는 반복하지 않았다.
- History GET 최종 추가 확인: 구형 행 2,001개에서도 표본 600개와 전체 개수 2,001을 전달(응답 크기 상한). 해당 사례 재실행 1/1 통과.
- 기존 회귀: flowTokens 25개, flowTrust(최종 재실행), optionLevelGate 61개, watchlistAiLine 28개, deepWarm 12개 통과. FlowTrust의 구 가격/플립 레짐 추론 기대값은 UNKNOWN으로 갱신하고 flip 없는 구조 LONG 사례를 추가했다.
- 최종 계약 검사: `/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc -p /tmp/signum-b4-contracts.tsconfig.json --pretty false` 종료 코드 0. `tsconfig.json`을 상속하고 defs·metrics·optionMetrics·optionLevelGate·watchlistAiLine의 9개 루트 및 의존성만 검사했다. 잠금 보유 실행을 건드리지 않았고, 대기 취소 직전에 자연 종료되어 취소 신호도 보내지 않았다.
- `node --check` Lambda 두 파일 및 `git diff --check` 실행. 저장 확인용 git diff를 생성했고 신규 파일도 별도 확인한다.

## 남은 위험과 운영 인계

1. D22의 Neutral/Stable, Oversold/Cool 상태어 불일치는 문구 금지 때문에 남는다. 숫자 구간 통일만으로 상태어가 같아졌다고 보고하지 않는다.
2. 실제 화면 렌더·운영 API·실제 AI 글 생성은 미확인. 운영 세션이 배포 후 NVDA/AAPL/TSLA/SPY/MSFT/WTFC/FITB에서 장중·마감·휴일 대조를 해야 한다.
3. 기존 structure:v2 저장본에는 새 `ivSkew`가 없다. operator가 새 structureService 판본으로 정상 갱신한 뒤 새 수집기·소비처를 적용해야 한다. 구형 이력 skew를 다시 살리는 대체는 하지 않았다. 캐시·이력·운영 데이터의 실제 갱신은 이 작업에서 하지 않았다.
4. 과거 legacy GEX를 정본 산식으로 소급 복원하지 않았다. 원천 체인을 확보한 재계산은 별도 운영 작업이다. canonical 일수가 2일 미만이면 AI 이력 통계는 없음이며 과거 다른 정의로 기간을 채우지 않는다.
5. 새 구조 판본에는 Greeks 기준과 구조 세션을 별도 기록한다. 장중 live Greeks는 현행 세션, EOD Greeks는 체인 세션이며 OI chainDate와 섞지 않는다. 이력 시각은 기존 거래일 달력의 조기폐장을 반영한다. 이 표식이 없는 옛 판본은 기존 impliedMove 기준을 사용하므로 운영 원천 시각 대조가 남는다. 오래된 다른 날짜 legacy 행은 basis가 명시된 상태로 유지된다.
6. 고래 장외 순명목금액은 값·정의·원천 세션을 모두 증명해야 한다. 현재 플랜의 비제공은 결측이다. 옵션 프리미엄이나 EOD 옵션 명목총량으로 대체하지 않는다. 화면의 기존 ‘확률/%’·‘고래’ 문구의 의미 한계는 대표의 문구 결정 범위다.
7. 활성 배포 소스는 `scripts/deploy-harvest-code-only.js`가 지정한 `harvest_lambda`로 확인했다(스크립트 실행 안 함). 오래된 `scripts/lambda-harvest/index.js`의 다른 구조 계산은 보존했다. 이 과거 소스를 재배포하면 정의가 회귀할 수 있다.
8. b5/다른 병행 브랜치와 flow/cmd/structure/AI 파일이 겹친다. 통합 시 이 보고서의 정의와 시험을 유지해야 한다. 배포 스크립트·main·운영 데이터는 손대지 않았다.
