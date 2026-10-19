NB3 2차 검증 기록 — `fix/nb3-live-badge-basis`

범위: 앱뷰 flow·cmd의 EOD 프리미엄·거래량 날짜 표시. `SWEEP-LIVE.md` 전체, L18/D18 장마감 비교, 운영 API 저장본, `verify-regular-session-before-merge.md`, 1차 보류 원문 `gate-fix_nb3-live-badge-basis-10200159.md`를 읽었다. 브라우저·운영 API 호출·운영 쓰기·커밋·배포는 하지 않았다. `.env*`는 읽지 않았다.

원인과 실시간 경로 확인

- Flow의 기존 세션 배지는 `effectiveSession === 'CLOSED'`만 보며, AI INTEL의 LIVE FLOW는 고정이다. 시장 세션·실시간 Greeks가 EOD 프리미엄을 실시간으로 만들지는 않는다.
- `CentralDataHub._fetchOptionsChain` → `massiveClient` → `intrinioRouter` → `getOptionChainSnapshotIntrinio`는 주간 만기 체인의 EOD `day.volume × day.close × 100`을 합산한다. 실시간 덮어쓰기는 Greeks·IV·합성 호가다. `/api/live/options/trades.sessionAggregate.basis=eod-volume` 역시 EOD 집계다. 연결할 장중 총·순 프리미엄·C/P 실시간 집계 경로는 확인되지 않았다.
- 1차 헬퍼는 `dataFreshness.chainDate`/`chainDate`만 읽었다. 실제 CLOSED flow 저장본의 NVDA·MSFT·WTFC·FITB는 `chainDate:null`이며, 캐시된 슬림 체인은 계약별 날짜도 없다. 금액은 남고 날짜만 사라진다. REG 응답의 세션 문자열만 바꾸는 이전 시험으로는 이 입력을 재현하지 못했다.
- 전체 tsc의 TS2339는 `hasValue`가 `MacroMetric` 전체를 타입 가드의 성공 타입으로 선언한 데서 생겼다. 값이 null인 현재 행도 `MacroMetric`인데 실패 분기에서는 제외되어 `cur?.label`이 `never`가 됐다.

변경

- 기존 수치·라벨·날짜 스타일은 유지한다. 원천 `chainDate`가 있으면 항상 우선하며, 과거 날짜도 그대로 표시한다.
- 원천 날짜가 없는 CLOSED 응답만 제한적으로 보완한다: 대상 지표가 모두 EOD이고, 같은 응답의 `prices.regularDate`와 `baseline.shownSessionET`가 같으며, 정상 응답이어야 한다. 캐시 정상 상태는 `_stale:false/_lastGoodAgeMs:0`, 캐시 표식이 없는 새 응답은 두 필드가 모두 없는 경우다. 부분 표식·stale·오래된 last-good·잘못된 날짜에는 보완하지 않는다.
- **위 보완 날짜는 원천 옵션 날짜를 복원한 실측이 아니다. 명시된 «직전 세션 EOD» 계약과 실측 정규장 기준일을 연결한 추정이다.** 오늘 날짜·기기 시계·실시간 호가 시각·OI `prevDate`는 사용하지 않는다. REG/PRE/POST나 별도 `unified.structure`에는 이 추정을 적용하지 않는다.
- Flow의 혼합/premium/volume 호출자는 같은 ticker 응답을 전달한다. Cmd는 기존 금액 선택과 동일한 원천만 날짜 보완에 사용한다. 관측된 0도 raw flow를 유지하며, structure 금액에 ticker 날짜를 붙이지 않는다.
- `hasValue`의 성공 타입을 `MacroMetric & { value: number }`로 한정했다. 실행 조건과 계산은 바꾸지 않았다. null인 현재 행의 라벨 보존, 정상 0, NaN/Infinity 검사를 추가했다.

공유 코드 호출자 전수 확인

| 공유 코드 | 운영 호출자 전부 | 영향·시험 |
|---|---|---|
| `src/lib/app/optionFlowBasis.ts` | 앱뷰 flow 3곳, cmd 1곳 | 날짜만 보완. 지표별 EOD/REALTIME·원천 우선·stale·세션·날짜 충돌·관측 0·structure 분리 시험 |
| `src/lib/macroLastGood.ts:hasValue` | 같은 파일의 `fillFromLastGood` 3곳, `api/market/economy/route.ts` 4곳 | 타입 선언만 수정. 읽기·저장·날짜 비교의 런타임 조건 그대로. macroLastGood 4건 및 전체 tsc |
| `OptionFlowBasisDate` (이번 재수정 없음) | flow 5곳, cmd 1곳 | 실제 JSX SSR에서 기존 배지·날짜가 함께 출력되는지 검사 |

변경 파일(이번 재수정)

- `src/app/[locale]/app-view/flow/page.tsx`
- `src/app/[locale]/app-view/cmd/page.tsx`
- `src/lib/app/optionFlowBasis.ts`
- `src/lib/macroLastGood.ts`
- `tests/nb3FlowBasis.test.ts`
- `tests/macroLastGood.test.ts`
- `tests/nb3FlowBasisGate.md`
- `tests/nb3FlowBasisTsc.log` — 전체 tsc 실행 시각·명령·종료 코드·진단

API·데스크톱 웹·수집기는 수정하지 않았다. 외부 호출 증가는 없다. 기존 라벨 문구와 금액 계산도 수정하지 않았다.

재현·회귀 시험

- 실제 CLOSED 저장본을 읽는 재현 시험을 추가했다. HEAD의 원본 헬퍼를 메모리에서 대입하면 NVDA·MSFT·WTFC·FITB의 날짜 누락이 다시 발생한다. 저장본을 공개 저장소로 복사하지 않았다.
- REG 23:10 KST(10:10 ET) ticker·options-eod·ivp·quotes 저장본 5종목을 재생한다. 스윕 live 운영 ticker 7종목도 재생한다. 기존의 REG→CLOSED 세션 변경 시험은 보존했다.
- 별도로 `integrity-sweep/closed/{flow,cmd}_{T}/api.json`의 실제 CLOSED 응답 7종목×2화면을 원형 그대로 재생한다. Cmd의 `chain=0` 응답은 체인 거래량을 검증하지 않고 실제 소비하는 총·순 금액·세션·날짜 JSX를 검증한다. Flow는 C/P·Call Share까지 고정 기대값과 비교한다.
- 페이지 AST에서 실제 날짜·세션·금액 표현식을 실행하고 해당 JSX를 SSR한다. 원본 저장값이 바뀌지 않았는지도 확인한다. 새 추정 분기의 제한 조건과 기존 원천 날짜 우선도 검사한다.

명령:

```sh
/usr/bin/lockf -k /tmp/signum-heavy.lock env \
  TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx"}' \
  node -r ts-node/register/transpile-only -r tsconfig-paths/register \
  tests/nb3FlowBasis.test.ts \
  /Users/eunhoon/Documents/signum-work/2026-10-19/reg-snapshots \
  /Users/eunhoon/Documents/signum-work/2026-10-19/integrity-sweep
```

최종 결과 (KST 2026-10-20):

- NB3 재생 **35/35 통과**, 실패 0, skip 0. 실제 CLOSED 7종목×2화면 모두 기존 금액과 `10/16 기준`이 함께 출력된다.
- 원본 헬퍼의 실제 날짜 누락은 NVDA·MSFT·WTFC·FITB × flow·cmd **8건**이다.
- 전체 `tsc --noEmit`은 lock 안에서 이번 재수정 후 **1회** 실행, **종료 0·진단 0건**. 실행 시각·명령은 [nb3FlowBasisTsc.log](nb3FlowBasisTsc.log)에 첨부했다. 명령의 경과 68.766초에는 lock 대기 시간이 포함된다.

- 기존 회귀는 같은 lock 안에서 순차 실행: macroLastGood **4/4**, premiumFlow **8/8**, flowPcRatio **13/13**, flowIntegrity2 **33/33**, flowWhaleIntraday **6/6**, flowNumbers **10/10**, flowTrust **21/21**, cmdMissingScores **35/35** 통과.
- `flowEmptyStates`: 순수 함수 **6건 통과** 뒤 HTTP 서버 생성에서 기존과 같은 `listen EPERM 127.0.0.1`, 종료 1. 시험 파일은 변경하지 않았다. 소켓에 의존하는 나머지 3건은 미검증이다.

남은 위험

- 옵션 원천 날짜가 없는 응답에서 EOD가 독립적으로 더 오래된 옵션 캐시를 뜻한다면 정규장 기준일과 실제 옵션 날짜가 다를 수 있다. 두 정규장 필드는 옵션 날짜의 독립 증거가 아니며, 이번 보완은 명시된 EOD 계약에 의존한다. 원천 날짜가 있는 경우에는 그 날짜를 유지한다.
- 브라우저 접근 금지로 390px 실기기 레이아웃·운영 화면은 미검증이다. SSR은 출력 내용 검사이며 시각 실측이 아니다.
- L08(신규 OI 세션)·L09(Intel 섹터)는 이번 flow·cmd 수정 범위 밖이다.
