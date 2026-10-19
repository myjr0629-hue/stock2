# INTEG3 프리미엄 소비처 점검 (2026-10-19)

## 결과와 범위

- 관문 기록 10190549·10190650 모두 읽음. 브랜치 `fix/integ3-cmd-defaults`, 시작 HEAD `9e7362a3f`.
- 변경 전 `rg -n 'netPremium|optionsCount|dataSource' src --glob '*.{ts,tsx,js}'`: 75개 파일·373곳. 아래 목록은 검색 일치 파일 전부이며, 정적 점검과 실행 시험을 구분했다. 모든 75개 파일을 동적 실행했다고 주장하지 않는다.
- 직접 원인: drawer의 `netPremium || 0`과 무조건적인 0→marketClosedNoFlow 분기. Terminal의 null/complete:false를 무시했다.
- 수정: 유한수+complete:true만 현재 관측으로 채택한다. 관측된 0은 스냅샷으로 덮지 않는다. 결측 금액·설명은 기존 `—`. 기존 마감 문장은 관측 0+liveQuote의 명시적 POST/CLOSED일 때만 표시한다. PRE/REG/미상은 마감이라고 단정하지 않는다.
- 보고서 스냅샷은 생성부가 결측도 0으로 저장하므로, 출처를 구분할 수 없는 스냅샷 0은 미채택한다. 유한한 양수·음수 스냅샷은 기존 snapshotTimeData 문구로 유지한다. 실제 0 스냅샷도 구분 불가하여 `—`가 될 수 있다.
- 고정 라벨·번역 파일·문구 변경 없음. 칸 유지. 공급사 요청 추가 없음. 커밋·push·배포·운영 데이터 쓰기 없음. 환경 파일 및 브라우저 미접근.

## 호출자 영향

- 수정한 로컬 공유 함수 `processTickerData` 호출은 Intel의 FINAL 탭 `/api/live/ticker` 폴링 내 1곳. 세션 기반 가격 계산은 기존대로 두고, 반환 session만 원본의 미상 상태(null)를 보존한다. 전에는 미상을 CLOSED로 제조했다.
- `liveQuotes` 소비처인 가격 병합/LiveAlphaAssessment와 drawer를 확인했다. 가격·등락률·시간외 라벨 계산은 동일. 새 세션 조건은 drawer만 사용한다. 실제 호출 JSX와 REG/PRE/POST/CLOSED/누락 세션을 소스 추출 실행으로 시험했다.
- Hub/Terminal/FlowSniper 등 다른 공유 함수는 이번에 변경하지 않았다.

## 실행 검증

- `tests/cmdMissingScores.test.ts`: 최종 24/24 통과. 추가 6건은 실제 실패 Hub→Terminal→Intel JSX, 3개 언어, 결측/비유한수/불완전, 관측 0과 충돌 스냅샷, 유효 스냅샷, 정상 부호 HTML 유지, 세션 누락/호출 JSX를 다룬다.
- `tests/vwapConsumers.test.ts`: 22/22 통과. 앞선 관문 소비처 회귀 유지.
- `tests/premiumFlow.test.ts`: 내부 검사 8건 통과(Node runner에서는 파일 1건으로 집계).
- 첫 회귀 실행 45/46: 새 시험이 영어 마감 문장 내부의 `—`까지 결측으로 오인했다. 정확한 `>—</span>` 요소 검사로 시험만 보정 후 cmd 24건 재실행 통과. 제품 코드 실패가 아니었다.
- 시험은 설치된 의존성을 임시 node_modules 링크로 참조하고 ts-node/register로 오프라인 실행했다. 네트워크·캐시 쓰기 의존성은 stub 처리했다.
- 타입 검사: `/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false` 1회 실행, 종료 코드 0·진단 0건으로 통과. `git diff --check`도 통과.

## 추가 잔존 (이번 수정 범위 밖)

- **실행 확인**: M7OptionsPulse는 모든 입력이 netPremium:null/complete:false여도 집계 0을 만든다. netPremium 집계 표시에서 0과 결측이 구분되지 않는다.
- **실행 확인**: buildDeepSnapshot은 null/NONE 프리미엄을 AI 재료의 netPremium:0으로 바꾼다.
- **정적 확인**: Command 히어로 mapper, 별도 섹터 라우트/집계/AI 재료에도 firstNonZero·||0 기본값이 남아 있다. 이번 drawer 계약 수정만으로 이 별도 계약까지 해결되지는 않는다.
- 실제 운영 발생 빈도·브라우저·실기기 화면 미확인. 세션은 기존 live/ticker 폴링의 마지막 성공 응답을 사용하므로 폴링 실패 시 이전 세션이 남을 수 있다.

## 검색 일치 파일 전수 목록

| 파일 | 점검/시험 결과 |
| --- | --- |
| `src/app/[locale]/app-view/cmd/page.tsx` | 확신도 실행 시험 통과. 별도 히어로 premium mapper의 firstNonZero는 실제 0을 폴백 후보로 넘기는 처리 잔존(정적 확인). |
| `src/app/[locale]/app-view/flow/page.tsx` | 실행 시험: 실패 표식 우선, null은 오래된 금액/콜 비중에서 복원하지 않음, 실제 0 보존. |
| `src/app/[locale]/app-view/intel/page.tsx` | 별도 IntelQuote/섹터/앱 계약. 값 폴백·합산·서술을 정적 점검; Terminal complete 전달 계약 없음. 숫자 기본값의 일반 결측 문제는 별도 잔존 범위. |
| `src/app/[locale]/how-it-works/command/flow-radar/page.tsx` | 설명/용어/영상 스크립트. 이번 실패 응답 소비처 아님. |
| `src/app/[locale]/how-it-works/intel/page.tsx` | 설명/용어/영상 스크립트. 이번 실패 응답 소비처 아님. |
| `src/app/[locale]/intel/IntelClientPage.tsx` | 수정·실행 시험: 결측/불완전→—, 관측 0 보존, POST/CLOSED에서만 마감 문장. 표 행은 complete로 차단, alphaItems는 null 별칭이면 undefined. |
| `src/app/[locale]/ticker/page.tsx` | 프리미엄 전달/참조 또는 지표명 매핑 정적 점검. 별도 데이터 계약; 외부 서비스 호출 시험 미실행. |
| `src/app/[locale]/wim/page.tsx` | 프리미엄 전달/참조 또는 지표명 매핑 정적 점검. 별도 데이터 계약; 외부 서비스 호출 시험 미실행. |
| `src/app/api/command/deep-analysis/route.ts` | 프리미엄 전달/참조 또는 지표명 매핑 정적 점검. 별도 데이터 계약; 외부 서비스 호출 시험 미실행. |
| `src/app/api/command/unified/route.ts` | 프리미엄 전달/참조 또는 지표명 매핑 정적 점검. 별도 데이터 계약; 외부 서비스 호출 시험 미실행. |
| `src/app/api/cron/signum-warm/route.ts` | 프리미엄 전달/참조 또는 지표명 매핑 정적 점검. 별도 데이터 계약; 외부 서비스 호출 시험 미실행. |
| `src/app/api/dashboard/unified/route.ts` | 프리미엄 전달/참조 또는 지표명 매핑 정적 점검. 별도 데이터 계약; 외부 서비스 호출 시험 미실행. |
| `src/app/api/debug/hub/route.ts` | 프리미엄 전달/참조 또는 지표명 매핑 정적 점검. 별도 데이터 계약; 외부 서비스 호출 시험 미실행. |
| `src/app/api/flow/unified/route.ts` | dataSource 명칭 참조. 옵션 소스/라우트 설명이며 Terminal 프리미엄 표시 처리 아님. |
| `src/app/api/intel/biopulse/route.ts` | 별도 섹터/배치 계약. 기본값 netPremium:0 또는 ||0 잔존(정적 확인); Terminal complete 소비처 아님. |
| `src/app/api/intel/cloudfortress/route.ts` | 별도 섹터/배치 계약. 기본값 netPremium:0 또는 ||0 잔존(정적 확인); Terminal complete 소비처 아님. |
| `src/app/api/intel/cybershield/route.ts` | 별도 섹터/배치 계약. 기본값 netPremium:0 또는 ||0 잔존(정적 확인); Terminal complete 소비처 아님. |
| `src/app/api/intel/fast/route.ts` | 프리미엄 전달/참조 또는 지표명 매핑 정적 점검. 별도 데이터 계약; 외부 서비스 호출 시험 미실행. |
| `src/app/api/intel/fintechpulse/route.ts` | 별도 섹터/배치 계약. 기본값 netPremium:0 또는 ||0 잔존(정적 확인); Terminal complete 소비처 아님. |
| `src/app/api/intel/m7/route.ts` | 별도 섹터/배치 계약. 기본값 netPremium:0 또는 ||0 잔존(정적 확인); Terminal complete 소비처 아님. |
| `src/app/api/intel/orbitdefense/route.ts` | 별도 섹터/배치 계약. 기본값 netPremium:0 또는 ||0 잔존(정적 확인); Terminal complete 소비처 아님. |
| `src/app/api/intel/perplexity-analysis/route.ts` | 프리미엄 전달/참조 또는 지표명 매핑 정적 점검. 별도 데이터 계약; 외부 서비스 호출 시험 미실행. |
| `src/app/api/intel/physicalai/route.ts` | 별도 섹터/배치 계약. 기본값 netPremium:0 또는 ||0 잔존(정적 확인); Terminal complete 소비처 아님. |
| `src/app/api/intel/powermatrix/route.ts` | 별도 섹터/배치 계약. 기본값 netPremium:0 또는 ||0 잔존(정적 확인); Terminal complete 소비처 아님. |
| `src/app/api/intel/quantumedge/route.ts` | 별도 섹터/배치 계약. 기본값 netPremium:0 또는 ||0 잔존(정적 확인); Terminal complete 소비처 아님. |
| `src/app/api/intel/siliconcore/route.ts` | 별도 섹터/배치 계약. 기본값 netPremium:0 또는 ||0 잔존(정적 확인); Terminal complete 소비처 아님. |
| `src/app/api/live/ticker/route.ts` | 정적 확인: Hub 체인 전달, 실패시 NONE/error, 지표 DynamoDB 폴백은 프리미엄 관측 보장이 아님. 공급사 호출 실행 안 함. |
| `src/components/AIDeepAnalysis.tsx` | 타입 선언/계약. nullable와 기존 number 선언 혼재 확인; 이번 변경 없음. |
| `src/components/CommandInsight.tsx` | liveQuote 프리미엄 임계값 신호. ||0 잔존(정적 확인); 금액 0 렌더 경로와 구분, 실패 표식 일반화는 미수정. |
| `src/components/DecisionGate.tsx` | liveQuote 프리미엄 임계값 신호. ||0 잔존(정적 확인); 금액 0 렌더 경로와 구분, 실패 표식 일반화는 미수정. |
| `src/components/FlowRadar.tsx` | 프리미엄 전달/참조 또는 지표명 매핑 정적 점검. 별도 데이터 계약; 외부 서비스 호출 시험 미실행. |
| `src/components/FlowSniper.tsx` | 실행 시험: NONE/error→결측, 숫자 0 보존, 양수/음수/균형 HTML 비교. |
| `src/components/LiveTickerDashboard.tsx` | FlowSniper props 실행 시험 통과. 별도 신호 계산 및 AI 재료에는 ||0 잔존(정적 확인). |
| `src/components/TacticalSidebar.tsx` | 프리미엄 전달/참조 또는 지표명 매핑 정적 점검. 별도 데이터 계약; 외부 서비스 호출 시험 미실행. |
| `src/components/app/metricGlossary.ts` | 설명/용어/영상 스크립트. 이번 실패 응답 소비처 아님. |
| `src/components/intel/M7OptionsPulse.tsx` | 추가 오프라인 실행: netPremium:null/complete:false 입력의 totalNetPremium=0. 미수정 잔존. |
| `src/components/intel/M7RankingRow.tsx` | 별도 IntelQuote/섹터/앱 계약. 값 폴백·합산·서술을 정적 점검; Terminal complete 전달 계약 없음. 숫자 기본값의 일반 결측 문제는 별도 잔존 범위. |
| `src/components/intel/PhysicalAIOptionsPulse.tsx` | 별도 IntelQuote/섹터/앱 계약. 값 폴백·합산·서술을 정적 점검; Terminal complete 전달 계약 없음. 숫자 기본값의 일반 결측 문제는 별도 잔존 범위. |
| `src/components/intel/SectorCommandCenter.tsx` | 별도 IntelQuote/섹터/앱 계약. 값 폴백·합산·서술을 정적 점검; Terminal complete 전달 계약 없음. 숫자 기본값의 일반 결측 문제는 별도 잔존 범위. |
| `src/components/intel/SectorRankingRow.tsx` | 별도 IntelQuote/섹터/앱 계약. 값 폴백·합산·서술을 정적 점검; Terminal complete 전달 계약 없음. 숫자 기본값의 일반 결측 문제는 별도 잔존 범위. |
| `src/components/intel/SectorSessionGrid.tsx` | 별도 IntelQuote/섹터/앱 계약. 값 폴백·합산·서술을 정적 점검; Terminal complete 전달 계약 없음. 숫자 기본값의 일반 결측 문제는 별도 잔존 범위. |
| `src/components/intel/mobile/MobileCmdFlow.tsx` | FlowSniper props 실행 시험: null 및 실패 표식 전달. |
| `src/components/intel/mobile/MobileCmdMetrics.tsx` | 별도 IntelQuote/섹터/앱 계약. 값 폴백·합산·서술을 정적 점검; Terminal complete 전달 계약 없음. 숫자 기본값의 일반 결측 문제는 별도 잔존 범위. |
| `src/components/intel/mobile/MobileCmdOptions.tsx` | FlowSniper props 실행 시험: null 및 실패 표식 전달. |
| `src/components/intel/mobile/MobileCmdOverview.tsx` | 별도 IntelQuote/섹터/앱 계약. 값 폴백·합산·서술을 정적 점검; Terminal complete 전달 계약 없음. 숫자 기본값의 일반 결측 문제는 별도 잔존 범위. |
| `src/components/intel/mobile/MobileCommandPage.tsx` | 별도 IntelQuote/섹터/앱 계약. 값 폴백·합산·서술을 정적 점검; Terminal complete 전달 계약 없음. 숫자 기본값의 일반 결측 문제는 별도 잔존 범위. |
| `src/components/intel/mobile/MobileSectorCommand.tsx` | 별도 IntelQuote/섹터/앱 계약. 값 폴백·합산·서술을 정적 점검; Terminal complete 전달 계약 없음. 숫자 기본값의 일반 결측 문제는 별도 잔존 범위. |
| `src/components/intel/mobile/MobileTickerDetail.tsx` | 별도 IntelQuote/섹터/앱 계약. 값 폴백·합산·서술을 정적 점검; Terminal complete 전달 계약 없음. 숫자 기본값의 일반 결측 문제는 별도 잔존 범위. |
| `src/components/intel/mobile/MobileTickerSheet.tsx` | 별도 IntelQuote/섹터/앱 계약. 값 폴백·합산·서술을 정적 점검; Terminal complete 전달 계약 없음. 숫자 기본값의 일반 결측 문제는 별도 잔존 범위. |
| `src/hooks/useIntelSharedData.ts` | 별도 IntelQuote/섹터/앱 계약. 값 폴백·합산·서술을 정적 점검; Terminal complete 전달 계약 없음. 숫자 기본값의 일반 결측 문제는 별도 잔존 범위. |
| `src/lib/ai/deepSnapshot.ts` | 추가 오프라인 실행: null/NONE 입력의 snapshot.flow.netPremium=0. 미수정 잔존. |
| `src/lib/ai/flowTokens.ts` | 유한수 변환으로 NET_PREM 자리표 생성. 원본 결측과 상위에서 제조한 0은 구분할 수 없음. |
| `src/lib/app/intelQuoteFromBatch.ts` | 별도 IntelQuote/섹터/앱 계약. 값 폴백·합산·서술을 정적 점검; Terminal complete 전달 계약 없음. 숫자 기본값의 일반 결측 문제는 별도 잔존 범위. |
| `src/lib/app/intelSectorBrief.ts` | 별도 IntelQuote/섹터/앱 계약. 값 폴백·합산·서술을 정적 점검; Terminal complete 전달 계약 없음. 숫자 기본값의 일반 결측 문제는 별도 잔존 범위. |
| `src/lib/app/intelSectorFacts.ts` | 별도 IntelQuote/섹터/앱 계약. 값 폴백·합산·서술을 정적 점검; Terminal complete 전달 계약 없음. 숫자 기본값의 일반 결측 문제는 별도 잔존 범위. |
| `src/lib/app/intelStockBrief.ts` | 별도 IntelQuote/섹터/앱 계약. 값 폴백·합산·서술을 정적 점검; Terminal complete 전달 계약 없음. 숫자 기본값의 일반 결측 문제는 별도 잔존 범위. |
| `src/lib/aws/dynamoDataProvider.ts` | 별도 수집/배치/저장 계약. 프리미엄 전달·null 보존 경로 및 폴백 정적 점검; 운영 호출/쓰기 미실행. |
| `src/lib/aws/historyMiddleware.ts` | 별도 수집/배치/저장 계약. 프리미엄 전달·null 보존 경로 및 폴백 정적 점검; 운영 호출/쓰기 미실행. |
| `src/lib/aws/historyStore.ts` | 타입 선언/계약. nullable와 기존 number 선언 혼재 확인; 이번 변경 없음. |
| `src/lib/premiumFlow.ts` | 기존 오프라인 프리미엄 검사 8건 통과. 총액 유효성/정의 검사이며 Terminal complete 소비처는 아님. |
| `src/remotion/kit/scripts.ts` | 설명/용어/영상 스크립트. 이번 실패 응답 소비처 아님. |
| `src/services/alphaEngine.ts` | 계산/집계 입력. null을 중립 방향 0으로 사용하는 기존 처리 확인; Terminal complete 직접 소비처 아님. |
| `src/services/analysisCache.ts` | 타입 선언/계약. nullable와 기존 number 선언 혼재 확인; 이번 변경 없음. |
| `src/services/centralDataHub.ts` | 실행 시험: 실패·빈 체인→null/NONE, 실제 균형 프리미엄 0 및 optionsCount>0 보존. |
| `src/services/forensicService.ts` | dataSource 명칭 참조. 옵션 소스/라우트 설명이며 Terminal 프리미엄 표시 처리 아님. |
| `src/services/guardian/sectorEngine.ts` | 계산/집계 입력. null을 중립 방향 0으로 사용하는 기존 처리 확인; Terminal complete 직접 소비처 아님. |
| `src/services/portfolioBatchService.ts` | 별도 수집/배치/저장 계약. 프리미엄 전달·null 보존 경로 및 폴백 정적 점검; 운영 호출/쓰기 미실행. |
| `src/services/powerEngine.ts` | 정적 확인: flow 점수는 flow.complete가 참일 때만 계산. 가격 레이어의 netFlow 기본 0은 별도 기존 처리. |
| `src/services/reportScheduler.ts` | 정적 확인: snapshotData.netPremium ||0 저장. 기존 스냅샷 0은 관측/결측 구분 불가 → 이번 drawer에서 0 스냅샷은 채택하지 않음. |
| `src/services/structureService.ts` | 별도 수집/배치/저장 계약. 프리미엄 전달·null 보존 경로 및 폴백 정적 점검; 운영 호출/쓰기 미실행. |
| `src/services/terminalEnricher.ts` | 실행 시험: NONE/error/비유한수→null 별칭, complete는 유효 프리미엄+optionsCount>0. buildFlowEvidence 호출 1곳. |
| `src/services/tickerOverview.ts` | 실행 시험: NONE/error+잔존 rawChain을 OK로 승격하지 않음. |
| `src/services/watchlistBatchService.ts` | 별도 수집/배치/저장 계약. 프리미엄 전달·null 보존 경로 및 폴백 정적 점검; 운영 호출/쓰기 미실행. |
| `src/types/intel.ts` | 타입 선언/계약. nullable와 기존 number 선언 혼재 확인; 이번 변경 없음. |
| `src/types/sector.ts` | 타입 선언/계약. nullable와 기존 number 선언 혼재 확인; 이번 변경 없음. |
