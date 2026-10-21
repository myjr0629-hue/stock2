# VWAP 재적용·개장 지연 구간 보조 경로

## 결과 요약

지정한 두 조사 문서를 끝까지 읽었다. 원인은 개장 날짜 전환 뒤 전일 값이 차단되고 Intrinio 당일 분봉이 아직 없다는 것이다. `ad371b89a`만의 회귀라는 근거는 없다.

`6d217db4b`의 역패치를 작업 파일에 적용했다. Git 되돌림 명령은 공용 메타데이터의 쓰기 거부로 실패했으며 파일 패치 적용은 성공했다. 화면·라벨·문구는 수정하지 않았다.

Intrinio 차트·날짜별 분봉·동일 날짜 보관본·직접 조회 순서를 유지하고, 모두 결측일 때만 FMP 당일 1분봉을 확인한다. 정규장 캐시 적중에서도 다시 해석해 Intrinio 자료 도착 시 우선 사용한다. 두 공급사의 자료를 합산하지 않는다.

현재 저장소의 시세 경로에서 재사용 가능한 FMP 최신 체결·당일 분봉 함수는 찾지 못했다. 기존 FMP 자격변수와 `fmpEtToMs`, 거래소 달력, `sessionVwapFromBars`를 재사용했다. 공정시장가인 EquitiesEdge와 최신 체결 한 건은 누적 체결 원천으로 쓰지 않는다.

보조 경로는 오늘 정규장 중에만 작동한다. 09:30부터 최신 봉까지 분 단위 자료가 연속되고 최신 봉이 현재보다 2분 이내일 때만 누적한다. PRE·POST·전일·미래 봉은 제외한다. 역순·동일 중복은 허용하고 충돌 중복·중간 누락·잘못된 수량은 거부한다. 무거래·실패는 null을 유지한다.

산식은 기존 분봉 산식인 `Σ((고가+저가+종가)/3×분봉 거래량)/Σ분봉 거래량`이다. **전체 체결 테이프의 정확한 VWAP이 아니라 분봉 근사값**이다. 공급사 구간 VWAP 의미가 검증되지 않아 임의로 해당 필드를 사용하지 않았다.

FMP 신규 경로의 제한은 공용 원자적 2초 간격(이동 60초당 최대 30회), 종목·날짜별 10초 잠금, 인스턴스 내 진행 중 요청 합류, 유효값 15초·null 5초 캐시, HTTP 제한시간 4초, 자동 재시도 없음이다. 잠금 저장소 장애면 공급사를 호출하지 않는다. 원래 Intrinio 종목·날짜별 60초 잠금은 유지한다.

## 바꾼 파일

- `src/app/api/live/ticker/route.ts`: 기존 수리 재적용, 당일 Intrinio 결측 시 실시간 분봉 보조 경로, 정규장 캐시 적중 시 Intrinio 우선 재확인.
- `src/services/stockApi.ts`: 기존 `getRegularSessionMinuteBars` 복구.
- `src/services/realtimeSessionVwap.ts`: 당일 분봉 검증·누적·호출 상한·분산 잠금·캐시.
- `tests/intrinioVwap.test.ts`: 기존 재적용에 포함된 날짜 문맥 모형 복구.
- `tests/tickerVwapColdCache.test.js`: 기존 시험 복구, 개장 결측·실시간 보조값·Intrinio 전환 시험 추가.
- `tests/realtimeSessionVwap.test.js`: 실제 모듈을 실행하는 오프라인 공급사·동시성·상한·달력 시험.
- `docs/ibm-command-vwap-cold-cache.md`: 원래 수리의 과거 검증 보고서 복구. 이 문서가 이번 작업 결과다.
- 이 보고서.

공유 계산·시간변환·달력·세션 분류 함수의 구현과 인자는 바꾸지 않았다. 복구한 분봉 함수의 운영 호출자는 ticker 라우트 한 곳이다. 공유 `sessionVwapFromBars`는 ticker·세션 보관본 백필·신규 보조 서비스가 사용한다. 기존 차트·백필 계산 동작은 유지된다. 신규 보조 서비스는 차트 캐시와 완료 세션 보관본을 덮지 않는다.

## 돌린 시험과 결과

모든 공급사·저장소 접근은 모형으로 대체했다. 시험 묶음과 타입 검사는 모두 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 실행했다.

- 기존 재적용 검증: `tickerVwapColdCache`·`earlyCloseVwap` 36건 통과.
- 최종 추가 검증: `realtimeSessionVwap`·수정한 `tickerVwapColdCache` 33건 통과. 개장 직후 Intrinio 0봉에서 보조 값·오늘 날짜, 응답 캐시 적중 뒤 Intrinio 도착 시 우선 전환을 확인했다.
- 기존 VWAP·세션 보관본: `intrinioVwap`, `vwapDisplay`, `vwapConsumers`, `sessionVwapFromBars`, `sessionArchive`, `sessionArchiveB3`, `atomicArchiveSave` 합계 100건 통과, 운영 Redis 통합시험 1건 건너뜀.
- 두 인스턴스·동시 20요청: 신규 서비스의 실제 모의 HTTP 합계 1회, 모든 값 동일. 기존 Intrinio 경로의 동시 20요청 시험도 통과했다.
- 종목을 바꿔 1초마다 60회 요청: 실제 모의 HTTP 30회. 빈 응답·429·시간 초과에서는 재시도 없이 null TTL 5초를 확인했다.
- 장외 워밍 밖 IBM·주말·휴장·조기 폐장은 기존 목표 완료 세션 시험 통과. 보조 공급사는 이 구간 호출 0회.
- 전체 타입 검사: `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false` 1회 실행, 종료 코드 0·진단 출력 0바이트.
- 최종 판본 기준 시험 합계: 147건 통과·운영 Redis 통합시험 1건 건너뜀.
- 추적 파일과 신규 파일의 `git diff --check`에서 공백 오류 없음.

## 남은 위험

FMP `stable/historical-chart/1min`의 현재 구독 권한, 실제 지연, 분봉 날짜 의미와 완전성은 운영 호출 없이 확인하지 못했다. **실제 개장 첫 15분의 결측 해소를 실측했다고 보고할 수 없다.** 첫 분봉이 아직 없거나 공급사 지연이 2분보다 크거나 자료가 누락되면 null을 유지한다. 정확한 체결 VWAP이 반드시 필요하면 개장부터 완전한 체결 또는 의미가 검증된 구간 VWAP 원천이 추가로 필요하다.

신규 경로 예산 30회는 다른 기존 FMP 뉴스·수집기 호출 예산과 통합되지 않았다. 계정 전체 잔여 한도는 미확인이다. 공용 예산 경합 시 다른 종목은 잠금·짧은 캐시가 만료된 후 다시 시도한다. Intrinio 분봉 도착 시 사용자 지시대로 그 값을 우선하므로 더 오래된 관측 범위로 바뀔 수 있다.

공용 Git 메타데이터의 `index.lock` 생성이 `Operation not permitted`로 거부돼 `git add`와 커밋은 미완료다. 지정 브랜치는 `fix/vwap-reapply-open-gap`이다. 운영 데이터 쓰기·push·main 병합·배포·브라우저 접근·환경파일 읽기는 하지 않았다.
