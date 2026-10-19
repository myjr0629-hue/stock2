NB3 검증 기록 — `fix/nb3-live-badge-basis`

대상은 이번 지시의 앱뷰 flow·cmd다. `SWEEP-LIVE.md` 전체, L18·D18 장마감 비교, 운영 API 저장 근거와 `verify-regular-session-before-merge.md`를 읽었다. 브라우저·운영 API 호출·운영 쓰기·커밋·배포는 하지 않았다.

확인한 원인:

- Flow의 `opiCalculated.isFallback`은 시장 세션이 CLOSED인지만 본다. Source·OPI 배지는 데이터의 EOD 여부와 별개였고, AI INTEL의 LIVE FLOW는 고정이었다.
- `CentralDataHub._fetchOptionsChain`은 주간 만기 체인의 `day.volume × day.close × 100`으로 프리미엄을 계산한다. `dataFreshness.premium/volume`은 EOD다. `dataSource: LIVE`나 변수명 `hasLiveVolume`은 장중 체결 원천의 증거가 아니다.
- 연결된 `massiveClient → intrinioRouter → getOptionChainSnapshotIntrinio`는 EOD 체인의 `prices.volume/close`를 쓴다. 실시간 덮어쓰기는 Greeks·IV·합성 호가에 한정된다. `/api/live/options/trades`의 `sessionAggregate.basis=eod-volume`도 직전장 집계다. 이 지표에 연결할 실시간 총·순 프리미엄·C/P 집계 경로는 확인되지 않았다.

변경:

- 기존 라벨·배지 문구와 수치 계산은 유지했다. EOD 원천의 `chainDate`로 `10/16 기준`(en: `as of 10/16`, ja: `10/16 時点`)을 표시한다.
- Flow: 히어로 순 프리미엄, OPI 세션 배지, C/P 카드의 주간 만기 거래량 행, 총 프리미엄 Source, AI INTEL LIVE FLOW 옆. 별도 OI 원천에 거래량 날짜가 붙지 않도록 한정했다.
- Cmd: 순 프리미엄 옆. 가격의 MARKET OPEN은 그대로 시장 세션을 뜻한다.
- Cmd 날짜는 기존 금액 선택과 동일하게 `netPremiumOf(flow)`가 관측값이면 그 flow, 아니면 unified.structure를 따른다. 관측된 0도 원천을 유지한다.
- 날짜 없는 원천에 오늘·OI 증감의 prevDate·호가 시각·별도 조회의 날짜를 대신 붙이지 않는다. 지표 자체가 REALTIME인 경우에는 EOD 날짜를 붙이지 않는다.

공용 코드 호출자 전수 확인(`rg -n 'optionFlowBasisLabel|OptionFlowBasisDate' src`):

| 코드 | 운영 호출자 | 영향·시험 |
|---|---|---|
| 새 `src/lib/app/optionFlowBasis.ts` | flow 3곳(혼합·premium·volume), cmd 1곳(premium) | 지표별 원천 날짜 표시만. REG/CLOSED, 혼합 REALTIME/EOD, 관측 0·폴백·잘못된 날짜 시험 |
| 새 `src/components/app/OptionFlowBasisDate.tsx` | flow 5곳, cmd 1곳 | 기존 소형 날짜 표식 스타일. 실제 JSX를 SSR하여 기존 배지와 날짜가 함께 출력되는지 확인 |

기존 공유 함수·API·데스크톱 웹 파일은 수정하지 않았다.

변경 파일:

- `src/app/[locale]/app-view/flow/page.tsx`
- `src/app/[locale]/app-view/cmd/page.tsx`
- `src/lib/app/optionFlowBasis.ts`
- `src/components/app/OptionFlowBasisDate.tsx`
- `tests/nb3FlowBasis.test.ts`
- `tests/cmdMissingScores.test.ts` — 기존 판정문은 유지하고 VM에 실제 날짜 컴포넌트만 등록. 기존 금액 전용 픽스처에는 날짜가 없으므로 null을 전달한다.
- `tests/nb3FlowBasisGate.md`

분리 작업공간의 로컬 시험 준비로 기존 node_modules에 대한 심볼릭 링크와 표준 Next.js 타입 참조 두 줄의 `next-env.d.ts`를 만들었다(둘 다 git ignore 대상). `.env*`는 읽지 않았다.

재생 시험:

- `reg-snapshots`의 ticker·options-eod·ivp·quotes 23:10 KST(10:10 ET) 저장본: NVDA·AAPL·TSLA·SPY·WTFC, REG와 CLOSED 조건 각각 실행. CLOSED 조건은 저장된 원천 값을 보존하고 시장/티커 세션만 CLOSED로 바꾼 시험이다.
- `integrity-sweep/live/flow_{T}/api.json`의 운영 ticker 응답: 위 5종목 + MSFT·FITB, REG와 CLOSED 조건 각각 실행.
- 실제 페이지 AST의 날짜·세션 배지·원천 선택·거래량·순 프리미엄 표현식을 실행하고, 날짜 인접 JSX를 SSR했다. 5종목의 총·순 프리미엄·콜/풋 거래량·Call Share를 저장본의 고정 기대값과 비교했다. 소형주·TSLA options-eod 결측과 WTFC IVP 이력 0도 포함했다.
- `tests/nb3FlowBasis.test.ts`: **19/19 통과, 실패 0, skip 0**.

재현 명령(저장본은 공개 저장소에 복사하지 않는다):

```sh
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx"}' \
node -r ts-node/register/transpile-only -r tsconfig-paths/register tests/nb3FlowBasis.test.ts \
  /Users/eunhoon/Documents/signum-work/2026-10-19/reg-snapshots \
  /Users/eunhoon/Documents/signum-work/2026-10-19/integrity-sweep
```

기존 회귀 시험과 전체 tsc는 `/usr/bin/lockf -k /tmp/signum-heavy.lock` 안에서 순차 실행했다.

- `premiumFlow` 8건, `flowPcRatio` 13건, `flowIntegrity2` 33건, `flowWhaleIntraday` 6건, `flowNumbers` 10건, `flowTrust` 21건 통과.
- `flowEmptyStates`는 순수 함수 검사 6건 뒤 로컬 HTTP 서버 생성이 샌드박스의 `listen EPERM 127.0.0.1`로 차단되어 종료 1. 해당 시험 파일은 수정하지 않았다.
- `cmdMissingScores` 최초 33/35 통과. 두 실패는 VM에 새 컴포넌트가 없어 발생했다. 기존 판정문을 보존하고 실제 컴포넌트를 등록한 뒤 이 파일만 재확인: **35/35 통과, 실패 0**. 기존 시험 7묶음이 최종 통과했고, 소켓 생성이 차단된 `flowEmptyStates` 1묶음은 미완료다.
- 전체 `node node_modules/typescript/bin/tsc --noEmit` 1회: 종료 2, 오류 **1건**. `src/lib/macroLastGood.ts(34,43): TS2339: Property 'label' does not exist on type 'never'.` 해당 파일은 HEAD와 같고 이번 수정 대상이 아니다(`git diff` 없음). NB3 수정 파일의 진단은 없다. **전체 tsc 0 요건은 충족하지 못했다.** 같은 무거운 명령을 반복하지 말라는 지시에 따라 전체 tsc는 재실행하지 않았다.

남은 한계:

- 브라우저 접근 금지에 따라 실기기·390px 화면의 시각 검증은 하지 않았다. SSR은 날짜 출력과 기존 수치·문구 보존을 검증하며 실제 레이아웃 실측은 아니다.
- 과거 `integrity-sweep/closed` 저장본의 NVDA·MSFT·WTFC·FITB는 `flow.dataFreshness.chainDate`가 null이었다. 그 사본만으로는 이 지표의 날짜를 확정할 수 없다. 이번 장중 저장본 7종목은 모두 2026-10-16이다. 원천이 다시 날짜를 누락하면 날짜 표식을 만들 수 없다.
- L08(신규 OI 세션)·L09(Intel 섹터)은 이번 flow·cmd 수정 범위에 포함하지 않았다.
