NB3 3차 검증 기록 — `fix/nb3-live-badge-basis`

결과와 검증 범위

- flow·cmd의 기존 라벨·수치·날짜 스타일을 유지하고 옵션 원천 날짜를 표시한다. 실시간 Greeks/IV/호가와 EOD 프리미엄·거래량을 구분한다.
- `SWEEP-LIVE.md` 전체(특히 L18 및 D18 마감 비교), `SWEEP-CLOSED.md`, 관문 `10200159`·`10200214` 원문, `verify-regular-session-before-merge.md`를 읽었다.
- 장중 저장본과 실제 CLOSED 저장본을 재생했다. 브라우저·운영 API·Redis·DB에 접근하지 않았고 `.env*`를 읽지 않았다. 커밋·push·병합·배포·운영 쓰기는 하지 않았다.
- **CLOSED 저장본 자체의 누락 날짜는 확정할 수 없다.** 이번 수리는 기존 옵션 캐시의 날짜 있는 동일 값 사본과 대조해 날짜를 복원한다. 운영 Redis에 그 사본이 실제로 존재하는지는 미실측이다. 원천 캐시가 없거나 값이 다르면 날짜를 만들지 않으며 기존 수치는 유지한다. 무조건 기준일이 표시된다고 판정하지 않는다.

원인 메커니즘과 실시간 원천 확인

1. 배지는 시장 세션(`CLOSED` 여부)으로 결정되고 AI INTEL의 LIVE FLOW는 고정이다. 그러나 `CentralDataHub._fetchOptionsChain` → `massiveClient` → `intrinioRouter` → `getOptionChainSnapshotIntrinio`는 EOD `day.volume × day.close × 100`을 합산한다. 실시간 덮어쓰기는 Greeks·IV·합성 호가뿐이다. trades의 `sessionAggregate.basis=eod-volume`도 같은 EOD 집계다. 연결 가능한 장중 총·순 프리미엄/C·P 실시간 집계 경로는 확인되지 않았다.
2. 1차 관문: 실제 CLOSED flow·cmd NVDA/MSFT/WTFC/FITB는 옵션 `chainDate:null`이다. REG 입력의 세션 문자열만 바꾸는 기존 시험은 이 형태를 다루지 않았다.
3. 2차 관문: 이전 보완은 주가 `prices.regularDate === baseline.shownSessionET`를 옵션 날짜로 사용했다. 별도로 최대 72시간 보존하는 옵션 캐시가 10/15여도 주가가 10/16이면 10/16로 오표시한다. `_stale:false`는 주가 응답 상태이며 옵션 날짜 증거가 아니다.
4. 정상 응답에도 `goodAt = Date.now()`와 뒤의 `Date.now() - goodAt` 사이에 1ms가 경과할 수 있다. 이전의 `_lastGoodAgeMs === 0` 조건은 이 정상 응답의 날짜를 누락시킨다.
5. 수리 전 커밋 `f3b381d1a`의 실제 헬퍼를 메모리에서 실행해 위 오표시(10/16)와 age=1 날짜 누락(null)을 재현했다. 파일 롤백은 하지 않았다. 영구 회귀 시험은 과거 Git 이력에 의존하지 않고 수정 후 동작을 검증한다.

수리

- `optionFlowBasisLabel`에서 주가 날짜·응답 age에 따른 추정을 제거했다. 날짜는 해당 옵션 값의 `dataFreshness.chainDate`/`chainDate`에서만 받는다. 날짜가 있으면 과거 날짜도 보존한다. 지표가 REALTIME이면 기존처럼 날짜를 붙이지 않는다.
- `live/ticker.withExitLevels`에서 날짜가 없는 EOD 옵션 값만 `restoreOptionFlowDate`로 보완한다. 이 출구는 60초 응답 캐시 적중과 새 계산/last-good 병합 응답 모두 통과한다.
- 기존 수집기/벤더 캐시를 한 번의 mget으로 읽는다. 추가 공급사 호출·캐시 쓰기·갱신은 없다. 날짜가 이미 있거나 EOD가 아닌 응답은 추가 읽기도 없다.
  - `intrinio:chain:{ticker}:{weeklyExpiry}` — 기존 수집기의 EOD 원문.
  - `intrinio:resp:v1:options/chain/{ticker}/{weeklyExpiry}/eod::{}` — 기존 Vercel 벤더 응답 캐시.
  - `polygon:snapshot:probe:{ticker}` — 기존 수집기/직접 조회의 날짜 있는 주간 체인.
- 만기·옵션 수·기여 계약 수·콜/풋/총/순 프리미엄·콜/풋 거래량이 모두 일치해야 한다. 금액은 원래 계산식과 합산 순서를 사용하며 부동소수점 합산 순서 차이 수준의 오차만 허용한다. 화면용 반올림 금액과는 대조하지 않는다.
- flow처럼 계약이 있으면 만기·콜풋·행사가·거래량·종가의 전체 목록도 비교한다. cmd의 `chain=0`은 위 독립 합계 전체로 비교한다. 원문 EOD 행은 모든 날짜가 같고 페이지가 완결되어야 한다. 날짜가 다른 동일 값 사본이 둘 있으면 보완하지 않는다.
- OI로 계산한 `CALCULATED`, 빈 표본, 잘못된 날짜, 다른 만기, 부분 체인, 날짜 혼합, 금액/거래량 불일치는 거부한다. 원본 입력을 수정하거나 수치를 지우지 않는다.
- 세션(REG/PRE/POST/CLOSED), `_stale`, age=0/1은 옵션 날짜 판정에 사용하지 않는다. 오래된 값도 그 값에 붙은 실제 날짜를 표시한다.
- cmd는 기존 금액 선택과 동일한 원천의 날짜만 쓴다. 관측된 0도 raw flow를 유지하고 별도 structure의 금액에 ticker 날짜를 붙이지 않는다.

공유 함수 호출자와 영향

| 함수 | 운영 호출자 전부 | 영향·검증 |
|---|---|---|
| `optionFlowBasisLabel` | app-view/flow 3곳(혼합·premium·volume), app-view/cmd 1곳(premium) | 세션 추정 제거. 기존 지표별 EOD/REALTIME, 날짜 검증, 금액 원천 선택, 실제 JSX SSR 및 REG/CLOSED 재생 |
| `restoreOptionFlowDate` | `api/live/ticker.withExitLevels` 1곳 | 날짜 메타만 보완. 캐시 실패/미스/충돌/값 불일치에서 입력 보존. 출력 함수 실행 시험 |
| `withExitLevels` | 같은 라우트의 캐시 HIT 반환 1곳, finalPayload 반환 1곳 | 새 계산·응답 캐시·last-good 모두 같은 출구. 원래 가격·GEX·OI 계산은 유지 |
| `optionDate` | `matchingOptionDate`, `datedEodChain`, `restoreOptionFlowDate` | 유효 YYYY-MM-DD만 허용. 잘못된 달력 날짜 시험 |
| `matchingOptionDate`, `datedEodChain` | `restoreOptionFlowDate` | 전체 계약/독립 합계·EOD 날짜 일치 시험 |
| `OptionFlowBasisDate` (이번 변경 없음) | flow 5곳, cmd 1곳 | 기존 배지·날짜 동시 출력 SSR |

공유 API 메타 영향도 확인했다. `dataFreshness.chainDate` 직접 소비처는 앱의 위 4곳, `components/FlowRadar.tsx:1052`(levelsChainDate 우선, 없을 때 옵션 날짜), `api/dashboard/unified/route.ts:1386`(날짜 선택)이다. 라우트 내부 `levelsChainDate` 폴백은 `withExitLevels`보다 앞서 계산되므로 이번 보완을 입력으로 받지 않는다. 데스크톱 화면 파일은 수정하지 않았다. 날짜 외 금액·거래량·주가·세션·알파 필드는 변경하지 않는다. 외부 호출 증가는 없고, 날짜 없는 경우에만 Redis 3키 읽기가 추가된다.

바꾼 파일(이번 3차)

- `src/lib/app/optionFlowBasis.ts`
- `src/lib/optionFlowDate.ts` (추가)
- `src/services/optionFlowDate.ts` (추가)
- `src/app/api/live/ticker/route.ts`
- `src/app/[locale]/app-view/flow/page.tsx`
- `src/app/[locale]/app-view/cmd/page.tsx`
- `tests/nb3FlowBasis.test.ts`
- `tests/nb3FlowBasisGate.md`
- `tests/nb3FlowBasisTests.log` (추가)
- `tests/nb3FlowBasisTsc.log`

이전 차수의 `macroLastGood.hasValue` 타입 가드 수정은 유지한다. 공유 호출자는 같은 파일의 `fillFromLastGood` 3곳 및 `api/market/economy/route.ts` 4곳이며, runtime 조건은 변경하지 않았다. macroLastGood 4건을 다시 통과했다.

재생 시험의 실측과 모의 입력 구분

- REG 23:10 KST(10:10 ET): ticker/options-eod/ivp/quotes 5종목 저장본을 그대로 읽는다. 스윕 live 운영 API 7종목도 재생한다. 기존 REG→CLOSED 세션 변경 시험은 유지한다.
- 실제 CLOSED: 스윕 closed의 flow·cmd 7종목×2화면 원형 입력을 읽고, 캐시 age=0 및 1을 각각 대조한다. 금액은 두 화면 모두, C/P·Call Share는 flow에서 고정 기대값과 비교한다.
- **CLOSED 날짜 복원 시험의 캐시 입력은 모의다.** 실제 저장된 live ticker의 날짜 있는 `rawChain`을 기존 probe-cache 모양으로 재구성해 주입한다. CLOSED와 독립적인 저장 응답의 실제 수치·실제 날짜를 사용하지만, 그 모양의 운영 Redis 캐시를 저장해 온 것은 아니다. 이 시험은 동일 값 사본이 있을 때 API 출구부터 JSX까지의 수리를 검증한다.
- 10/15 캐시가 10/16 CLOSED에도 남는 경계, age=1, 캐시 없음/장애/충돌/다른 값/부분 체인/날짜 혼합 등은 합성 입력으로 시험했다.
- 저장본은 공개 저장소에 복사하지 않았다. 테스트의 기본 fetch·Redis 접근은 차단하고 모든 캐시 입력을 주입했다.

시험 명령과 결과

모든 시험 묶음과 전체 tsc는 `/usr/bin/lockf -k /tmp/signum-heavy.lock` 안에서 순차 실행했다. 최종 소스 수정 후 tsc는 1회만 실행했다. 실제 실행 시각·명령·종료 코드는 `nb3FlowBasisTests.log`, `nb3FlowBasisTsc.log`에 남겼다.

재현 가능한 재생 명령:

```sh
/usr/bin/lockf -k /tmp/signum-heavy.lock env \
  TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx"}' \
  node -r ts-node/register/transpile-only -r tsconfig-paths/register \
  tests/nb3FlowBasis.test.ts \
  /Users/eunhoon/Documents/signum-work/2026-10-19/reg-snapshots \
  /Users/eunhoon/Documents/signum-work/2026-10-19/integrity-sweep

/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --noEmit
```

- NB3 재생 **40/40 통과**, fail 0, skip 0.
- 기존 회귀: macroLastGood **4/4**, premiumFlow **8/8**, flowPcRatio **13/13**, flowIntegrity2 **33/33**, flowWhaleIntraday **6/6**, flowNumbers **10/10**, flowTrust **21/21**, cmdMissingScores **35/35** 통과.
- `flowEmptyStates`: 순수 함수 **6건 통과** 후 `listen EPERM 127.0.0.1`, 종료 1. 기존 소켓 제한이며 파일은 변경하지 않았다. 나머지 3건은 미검증.
- 전체 `tsc --noEmit`: **종료 0, 진단 0건**, 최종 소스 변경 후 1회 실행. lock 획득 후 실행 30.333초. UTC 2026-10-19 17:26:13~17:26:43(KST 10/20 02:26:13~02:26:43).

남은 위험

- **날짜 있는 동일 값 옵션 원천 캐시가 없는 응답에서는 날짜 누락이 남는다.** 주가 날짜를 대신 표시하면 2차 관문 오표시가 재발하므로 그 추정을 제거했다. 해당 캐시의 운영 존재/내용과 실제 화면 반영은 Claude 운영 세션의 후속 확인이 필요하다. 이 제한 때문에 대표의 «모든 상황에서 날짜 표시»를 달성했다고 보고하지 않는다.
- 날짜 없는 응답의 추가 mget 3키 읽기 지연은 운영 미실측이다. 공급사 호출·운영 쓰기 증가는 없다.
- 브라우저 금지로 390px 모바일 실제 배치와 운영 화면은 미검증이다. JSX SSR은 글자 출력 검사다.
- L08(신규 OI 세션)·L09(Intel 섹터)는 이번 flow·cmd 수정 범위 밖이다.
