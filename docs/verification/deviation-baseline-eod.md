# deviation 기준군 수리 — 2026-10-23

## 확인한 원인과 변경

기존 두 API는 과거 행의 완결성과 premiumBasis를 검사하지 않고 오늘 OI의 0.5~2배인 행을 비교했다. 부분 오늘의 OI가 작아지면 부분 과거 행으로 기준군이 바뀔 수 있었다. 같은 날짜·OI에서 최신 시각만 우선하는 d78 규칙은 작은 늦은 프리미엄으로 큰 측정을 덮었다. 지표·OI가 없는 원천 행도 레거시 이력 전환 시작점을 앞당겼다.

- 평소: 검증된 chainDate, optionBasis=eod, partial 아님, 거래일이며 수집 당시 이미 마감한 세션만 허용한다. 날짜 없는 레거시는 대표 조회에는 보존하되 평소로 추정하지 않는다. 다음 날 PRE에 재수집한 전날 EOD는 허용한다.
- 대표: 완결성 → 총 OI → 프리미엄 측정 보유 순으로 선택한다. 같은 premiumBasis·OI에서는 큰 프리미엄을 보존하고, 금액도 같으면 최신 행을 고른다. 서로 다른 기준의 금액은 크기로 비교하지 않는다. volume-close를 OI 대체보다 우선한다.
- 프리미엄 평소: 오늘과 동일한 명시적 premiumBasis만 허용한다. 기준 미상끼리도 같은 계산법으로 추정하지 않는다. OI·PCR 축에는 프리미엄 기준 제한을 걸지 않는다.
- 오늘: 최신 세션을 과거 측정으로 대체하지 않는다. 부분 자료는 항목·블록·응답의 partial로 전달한다. 별도 API의 조각 저장·병합에도 전달한다. 후보가 없어도 부분 자료 표식을 남긴다.
- 전환 시작점: 해당 집계가 사용할 측정과 완결 EOD가 있는 원천 행으로만 정한다.
- 생산자: FlowWarm exact/probe의 다음 페이지 잔여, GEX 수집의 20페이지 상한을 partial로 기록한다. GEX 프리미엄은 실제 산식에 맞춰 volume-trade-or-close로 기록해 FlowWarm volume-close와 섞지 않는다. 호출 수·페이지 상한·계산식은 유지한다.
- 캐시: 공용 v13, 별도 응답 v12, 별도 조각 v11. 운영 캐시 변경은 실행하지 않았다.

## 공유 함수의 모든 운영 코드 호출자와 영향

| 함수 | 호출자·영향 | 검증 |
|---|---|---|
| dailySnapshots | /api/ranking의 Flow·GEX 이력과 /api/ranking/deviation. deviation·multi-axis 대표, 구조 랭킹 fallback, optionSession에 영향 | 실제 GET 메모리 대역, 구조·날짜·대표·부분 행 시험 |
| deviationOf / deviationSeries | 공용 API의 deviation·multi-axis / 별도 API의 옵션 축. 완결성·동일 기준 필터 공통화 | 양쪽 GET, 프리미엄 결측·실측 0, 같은 기준 양방향 비교 |
| sourceHistoryStart | dailySnapshots, latestWith, dailyValues, sessionValues에서 호출. 각 집계에 사용할 수 없는 원천 행의 이력 제거 방지 | OI 없는 원천 행 추가 전후 17개 대표 보존, 요청 필드 없는 행·IV 시계열 |
| latestWith | /api/ranking money-vs-oi. 한 행의 프리미엄·OI 유지, 부분 표식 전달 | 실제 GET·같은 행 지표 보존 |
| dailyValues | readinessOf → /api/ranking volatility-bet 준비도 | GEX 준비도·원천 날짜·이력 개수 |
| sessionValues | /api/ranking volatility-bet IV 세션 백분위 | IV 세션 날짜·마지막 값·세션 개수 |
| getAllOptions | harvestGex, computeIvSurface. 배열에 partial 메타만 추가 | 실제 두 함수 메모리 대역, 금액·OI·IV 수치와 페이지 호출 수 |
| rankingCacheKey | /api/ranking, aiqContextService, scripts/ai-quality-55/harness | 소비자가 공용 기본 키를 계속 읽는 시험 |

표의 호출자는 src, scripts, harvest_lambda에서 검색했다. isCompleteOptionEod는 엔진 내부와 두 API에서 사용하며 신규 완결성 판정을 담당한다. 화면 파일·라벨·표시 방식 변경은 없다.

## 합성 재현과 시험

| 조사 조건 | 수리 후 확인 |
|---|---|
| 새 날짜 부분 행의 OI 감소 | 취약한 계산은 43,302,986 → 111,623. 수리 후 작은 부분 기준군은 제외되고 완결 OI 비교군 부족 사유를 반환 |
| d78 전·후 대표 규칙 | 동률이 없는 같은 합성 입력에서 두 취약 대표 규칙 모두 동일 급락. 수리 후 공통 기준군 필터로 차단 |
| 같은 세션·OI의 작은 늦은 프리미엄 | 입력 순서를 뒤집어도 큰 완결 측정 유지. 더 큰 OI의 부분 행도 완결 행을 덮지 않음 |
| OI 없는 원천 행 추가 | 레거시 대표 17개 유지. IV·latestWith에서도 요청 필드 없는 행이 이력을 밀어내지 않음 |

추가로 일반·조기 폐장 경계, PRE·장중·휴장·날짜 불명 제외, 서로 다른 premiumBasis 분리, 부분 응답의 조각 병합, 공급사 페이지 잘림·probe 대체를 검사했다. 모든 I/O는 메모리 대역 또는 오프라인 차단이다. 숫자는 운영 AVGO 자료가 아닌 합성 자료다.

실행 명령:

```sh
/usr/bin/lockf -k /tmp/signum-heavy.lock node --require ./scripts/offline-test-preload.cjs --test tests/rankingSessionDate.test.cjs tests/rankingEtDay.test.cjs
/usr/bin/lockf -k /tmp/signum-heavy.lock node scripts/run-offline-tests.cjs
/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --noEmit --incremental false
```

개별 합성·날짜 시험 44/44 통과. 전체 오프라인 296개 파일 모두 통과(기존 실패로 언급된 integrityAudit2Fund·readCheck·structureWarm도 통과). 랭킹 파일은 Badge 168, SessionDate 38, EtDay 6, LivePrice 32, Format 10건 통과다. 전체 결과는 커밋하지 않는 .logs/ux-gate/results.json에 있다. 타입 검사는 종료 코드 0·오류 0건이다. 무거운 명령은 각각 한 번만 실행했고 공용 잠금으로 직렬화했다.

작업공간 준비로 기존 설치 node_modules를 연결하고 무시 대상 next-env.d.ts에 표준 Next 타입 참조만 생성했다. 환경 파일은 읽지 않았다. 전체 build·브라우저·운영 API·운영 쓰기·커밋·push·병합·배포는 실행하지 않았다.

## 남은 위험

운영 AVGO의 실제 원인·영향 종목 수는 미측정이다. 날짜·계산 기준이 불명인 과거 행은 기준군에서 제외되므로 충분한 적격 이력이 없는 축은 후보가 줄 수 있다. 과거 EOD 행에 부분 메타가 없으면 날짜·수집 시각 외의 체인 누락을 소급 판별할 수 없다. 새 생산자 메타는 이 작업만으로 운영에 적용되지 않는다. 부분 오늘은 OI가 맞는 완결 과거가 충분할 때만 비교되며, 결과의 partial은 자료 상태를 알리는 표식이다.
