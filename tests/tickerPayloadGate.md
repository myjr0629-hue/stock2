# ticker 기본 응답 범위 축소 검증

기준: `perf/ticker-payload-narrow`, 시작 HEAD = 로컬 `origin/main` = `61f2891ee8a4dcf9c09935f2c10a4663fc5d36a2`.

## 변경과 원인

`/api/live/ticker`는 `chain=0`만 체인을 제외하고 기본 요청에는 체인을 전송했다. 기본값을 체인 제외로 바꾸고, 필요한 요청만 `chain=full`로 명시한다. 제외 대상은 `flow.rawChain`, `flow.allExpiryChain` 두 필드뿐이다. `chain=0`은 계속 체인 제외다.

원본 `flowData`의 취득, 거래량 P/C·IV 스큐·Alpha 등의 계산은 유지한다. 체인 계산을 건너뛰는 변경이 아니다. 응답 캐시 HIT와 새 계산/last-good 병합 후 두 출구에 같은 전송 필터를 적용한다. 필터는 복사본에서 두 키만 제외하고 원본 캐시를 바꾸지 않는다.

기존 `skip_alpha=1`은 체인 유무에 관계없이 `lite` 응답 캐시와 last-good을 공유했다. 두 모드의 캐시 키를 분리하고, 체인이 없는 옛 `lite` 캐시가 full 요청에 들어오지 않도록 두 새 키를 사용한다. `useFlowData`의 모듈 캐시도 요청 URL별로 구분한다. 일반 모드의 기존 full/nochain 키는 유지한다.

CMD 파일은 수정하지 않았다. 앱·웹 FLOW와 통합 API는 체인 옵션만 추가했다. 요청 순서, Promise.all, 로딩·오류 처리, 화면 라벨·표시 코드는 그대로다.

## 소비처 전수 검색과 영향

검색식: `allExpiryChain|rawChain|/api/live/ticker|useFlowData|getLiveTicker`. `src` 전체, `scripts`의 소스, iOS/Android 소스를 확인했다. `.env*`는 읽지 않았다. 생성된 Lambda 번들·저장 JSON은 화면 소비처가 아니다.

| 소비 경로 | 실제 의존성과 조치 |
| --- | --- |
| 앱 `app-view/flow/page.tsx` | STRIKE 행사가 표, 체인 거래량, UOA·만기 계산: 기존 ticker 요청에 `chain=full` 추가 |
| 웹 `flow/FlowPageClient.tsx`, `flow/MobileFlowPage.tsx` → `useFlowData` → `FlowRadar` | rawChain 및 allExpiryChain 기반 Flow Map·OI·GEX·OPI·DEX·예상 변동: hook 옵션 `chain: 'full'` 추가 |
| `api/flow/unified` | `liveQuote`를 Flow SSR·FlowRadar·검증 도구에 전달: 내부 ticker 요청에 `chain=full` 추가 |
| `api/dashboard/unified` | 체인 기반 0DTE·예상 변동·순프리미엄·Alpha·IV 스큐: 내부 ticker 요청에 `chain=full` 추가 |
| `LiveTickerDashboard`, `MobileCommandPage`, `usePriceDisplay` | ticker 응답에서 가격·요약값을 사용. 체인 옵션을 추가하지 않음. `usePriceDisplay`는 현재 호출자 없음 |
| IntelClientPage·M7/PhysicalAI TacticalDeck, Intel 10개 섹터 fallback·fast | ticker 응답의 시세·요약값 사용. Intel evidence의 rawChain은 별도 리포트 데이터에서 옴. 기본 응답 유지 |
| undercurrent `fetchMoney`, AI 분석의 `fetchServerPrices`, 예열·이력 경로 | 시세·요약값만 사용. 기본 응답 유지 |
| `IVSkewCurve`, `IVSkewCurveWeb` | 자체 `/api/live/options/atm` 또는 부모 `atmSlice` 사용: 변경 없음 |
| `tickerOverview`, `terminalEnricher`, portfolio/watchlist/alpha/power 엔진, 옵션 chain/trades·debug/hub | CentralDataHub·rawContracts·옵션 전용 API·리포트의 체인 사용: ticker HTTP 기본값 변경의 영향 없음 |
| 체인 진단 스크립트 8개 | 아래 파일의 ticker URL만 `chain=full` 추가. 외부 통신·스크립트 실행은 하지 않음 |

체인 진단 스크립트: `verify_flow_data.js`, `verify_pipeline.js`, `flow_perf_test.js`, `trace_pipeline.js`, `simulate_weekly_squeeze.js`, `flow_payload_audit.js`, `test_squeeze_weekly.js`, `verify_gamma_engine.js`.

`test-opi.js`·`test-0dte.js`의 체인은 별도 `/api/live/options/chain`에서 온다. `audit-field-contract.js`의 체인 검사는 `/api/flow/unified`를 통해 받는다. `verify_atm_iv.js`는 기존부터 지원하지 않는 `ticker=`와 최상위 `rawChain`을 읽으므로 이번의 `flow` 두 필드 변경과 관계없는 기존 결함이다.

## 저장 응답 크기

입력: `/Users/eunhoon/Documents/signum-work/2026-10-19/reg-snapshots/ticker-*-2310.json` 5종. 같은 객체를 `JSON.stringify`한 UTF-8 바이트로 비교했다. 압축·헤더 제외. full은 기존과 동일하다.

| 종목 | 기존 응답 B | 새 기본 B | chain=full B | 감소율 |
| --- | ---: | ---: | ---: | ---: |
| AAPL | 204,256 | 5,751 | 204,256 | 97.18% |
| NVDA | 230,763 | 4,687 | 230,763 | 97.97% |
| SPY | 506,789 | 5,785 | 506,789 | 98.86% |
| TSLA | 277,715 | 4,742 | 277,715 | 98.29% |
| WTFC | 19,501 | 5,473 | 19,501 | 71.93% |

SPY의 제거 대상 배열 본문은 rawChain 91,701B·allExpiryChain 409,273B다. 차이는 객체 키와 구분자도 포함한다. 실제 전송 지연 개선은 측정하지 않았다.

## 시험

`tests/tickerPayload.test.js`는 외부 서비스를 import하기 전에 모든 의존성을 대역으로 바꾸며, 원본 서비스 구현·운영 Redis/DB·벤더 API를 호출하지 않는다.

- 저장 응답 5종: 실제 출구 필터 결과가 두 키만 제거한 원본과 deepEqual. full 원본 동일, 입력 불변.
- 원본 `origin/main`과 변경 후의 실제 GET 실행 비교: 5종 × HIT/MISS/last-good 병합 × Alpha 포함/제외. 기본 응답은 두 체인 필드만 제외, full은 원본 GET 전체와 동일, `chain=0`은 새 기본과 동일.
- 서버의 요약/Alpha 계산에 원본 체인이 전달되는지 확인.
- 4개 응답 모드의 응답/last-good 캐시 분리와 MISS→HIT 확인.
- 실제 hook의 요청 URL·모듈 캐시 분리, 앱 STRIKE·웹 FLOW·통합 API의 요청식에서 full을 평가하고 원본 체인 수신 확인.
- CMD 원본 동일, FLOW 관련 코드는 옵션 추가 외 원본 동일, 진단 스크립트도 URL 변경 외 원본 동일.

| 실행한 검증 | 결과 |
| --- | --- |
| `/usr/bin/lockf -k /tmp/signum-heavy.lock node tests/tickerPayload.test.js` | 40개 통과, 종료 0 |
| `/usr/bin/lockf -k /tmp/signum-heavy.lock node_modules/.bin/tsc --noEmit` | 오류 0, 종료 0. 전체 tsc는 한 번 실행 |
| `/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/ts-node/dist/bin.js --transpile-only -O '{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx"}' tests/flowIntegrity2.test.ts` | 26개 통과·7개 실패, 종료 1. 아래 기존 기대값 불일치 |
| 변경 JS 8개 + 신규 JS 시험의 `node --check` | 통과. 진단 스크립트 본체는 실행하지 않음 |
| 변경 파일의 `git diff --check` | 통과 |

첫 신규 시험 실행에서 API URL 템플릿 추출기가 `${baseUrl}` 뒤의 경로를 찾지 못했다. 시험의 추출기를 보정한 뒤 위 40개가 통과했다. 기존 FLOW 시험의 첫 호출은 `node_modules/.bin/ts-node` 링크가 없어 실행되지 않았고, 설치된 패키지 진입점으로 실행했다. 공유 node_modules는 수정하지 않았다.

기존 FLOW 시험의 7개 실패는 모두 한국어 데이터 없음 문구를 `—`로 기대하지만 실제 JSX가 `집계 관측 없음`을 반환하는 불일치다. `origin/main`과 현재 페이지의 `formatCompactMoney(whaleDayTotal, 1)`·`formatCompactMoney(whaleTotalVol, 2)`를 포함하는 **실제 JSX 표현식**을 각각 추출·실행해 둘 다 같은 문구를 반환함을 확인했다. `whaleMeta == null` 등의 분기에서 금액 포매터 호출 전에 반환된다. 문구·표시 방식은 수정하지 않았다.

또한 전체 FLOW 페이지는 `&chain=full`을 제거하면 원본과 완전히 같고, 관련 `api/live/options/trades`·`flowWhaleSession`·`flowIntegrity2.test.ts`도 원본과 완전히 같음을 확인했다. 원본 전체 FLOW 시험 묶음을 재실행하지는 않았다. 따라서 **신규 시험 40개·전체 tsc는 통과했지만 기존 FLOW 묶음 전체 통과로 보고하지 않는다.**

## 남은 위험

운영·브라우저·실기기 화면, 네트워크 시간, 실제 벤더 장애·동시 요청은 검증하지 않았다. `skip_alpha=1`의 새 캐시 키는 첫 요청에서 기존 lite 캐시·last-good을 재사용하지 않으므로 초기에 캐시 미스가 발생할 수 있다. 저장 응답은 외부 로컬 사본을 사용하므로 재현할 때 같은 파일이 필요하다. 서버의 체인 취득·계산 비용은 유지된다. 기존 FLOW 시험 7개의 문구 기대값 불일치가 남아 있다.

커밋·push·main 병합·배포·운영 데이터 쓰기는 하지 않았다. 의존성은 기존 설치본으로 읽기 전용 심볼릭 링크를 연결했고 `node_modules`·tsc의 `tsconfig.tsbuildinfo`는 git ignore 대상임을 확인했다.
