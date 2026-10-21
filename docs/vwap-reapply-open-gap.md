# VWAP 재적용·개장 지연 관문 수리

## 결과 요약

관문 원문 `gate-fix_vwap-reapply-open-gap-10220106.md`와 사고 기록 `intrinio-429-flood.md`를 끝까지 읽었다.

지연 원인은 응답 캐시에 적중해도 `resolveTargetSessionVwap`가 직접 분봉 복구를 기다린다는 것이다. Intrinio 빈 응답 뒤에도 60초 잠금이 남고, 다음 요청이 이를 진행 중 조회로 해석해 200ms씩 25회 대기했다. 공급사 보조값이 이미 있어도 이 대기를 먼저 거쳤다.

캐시 적중과 정규장 결측 요청은 이제 목표일 Intrinio 저장본·FMP 저장본만 읽고 응답한다. 값이 없으면 해당 요청은 null이다. 복구는 Next.js `after`에서 수행하며 완료된 값은 다음 요청부터 사용한다. Intrinio 분봉이 도착하면 기존처럼 그 값을 우선한다. 장외 콜드 요청의 완료 세션 직접 복구는 유지한다. 두 서비스의 잠금 경합 폴링은 제거했다.

공급사 조회의 보호 조건은 다음과 같다.

- Intrinio: 종목·목표일별 공유 `SET NX EX` 60초 잠금. 보조 경로까지 하나의 진행 중 작업으로 합친다. 기존 `newBgCtx`·`runWithBg`의 `noRetry429: true`, `tripOn429: true`를 적용한다. 첫 429 뒤 Intrinio 재시도와 해당 흐름의 FMP 전환을 중단한다.
- FMP: 기존 종목·날짜별 공유 원자 잠금 10초, 공용 원자 예산 2초 간격(이동 60초당 HTTP 최대 30회), HTTP 제한시간 4초, 자동 재시도 없음, 정상값 15초·null 5초 캐시를 유지한다. 이미 닫힌 배경 관문이면 호출하지 않으며 FMP 429도 같은 관문을 닫는다.
- 잠금 저장소 장애·경합은 공급사별 선점을 우회하지 않는다. 새 인스턴스도 같은 잠금 키를 사용한다.

화면·라벨·문구·표시 방식, 분봉 누적 산식, 목표 정규장 날짜 선택은 바꾸지 않았다. 계산은 기존 `Σ((고가+저가+종가)/3×분봉 거래량)/Σ분봉 거래량`이며 체결 테이프의 정확한 VWAP이 아닌 분봉 근사값이다.

## 바꾼 파일

- `src/app/api/live/ticker/route.ts`: 저장본 읽기와 배경 복구 분리, 잠금 폴링 제거, 기존 429 중단 관문 적용.
- `src/services/realtimeSessionVwap.ts`: 공급사를 부르지 않는 `readRealtimeSessionVwap` 추가, 진행 중 조회와 응답 분리, 잠금 폴링 제거, 배경 중단 표식 준수.
- `tests/tickerVwapColdCache.test.js`: 네 응답 형태의 관문 지연 재현, 미완료 공급사와 응답 분리, 두 인스턴스 경합, 실제 Intrinio→라우터→분봉의 429 시험. 기존 시험은 첫 null·배경 완료 뒤 값이라는 새 동작을 검증하도록 조정했다.
- `tests/realtimeSessionVwap.test.js`: 저장본 읽기·미완료 HTTP 분리, 두 인스턴스 경합·후속 요청, FMP 429·이미 닫힌 관문 시험.
- `tests/tickerPayload.test.js`: 새 서비스 의존성 모형과 같은 날짜의 준비된 VWAP 저장본을 제공해 기존 체인 응답 계약을 재검증.
- 이 보고서.

호출자 검색 결과, 변경한 실시간 서비스와 추가 저장본 읽기 함수의 운영 호출자는 ticker 라우트 한 곳이다. 복구한 `getRegularSessionMinuteBars`의 운영 호출자도 이 라우트 한 곳이며 이번에는 구현을 바꾸지 않았다. 라우트 내부 해석 함수는 캐시 적중·새 계산에서 호출한다. `skip_alpha` 두 가지 × 체인 두 가지의 네 응답 형태를 시험했다. 공통 `sessionVwapFromBars`, 달력, 시간 변환, Intrinio 클라이언트, 기존 배경 관문의 구현은 변경하지 않았다.

## 돌린 시험과 결과

공급사·저장소는 오프라인 모형을 사용했다. 운영 자격값 없이 실행했으며 환경파일은 읽지 않았다. 시험 묶음·전체 타입 검사는 모두 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 직렬 실행했다.

- 기존 관련 10개 시험 파일 전부: `realtimeSessionVwap`, `tickerVwapColdCache`, `earlyCloseVwap`, `intrinioVwap`, `vwapDisplay`, `vwapConsumers`, `sessionVwapFromBars`, `sessionArchive`, `sessionArchiveB3`, `atomicArchiveSave`. 최종 TAP 결과 159건 통과·실패 0·로컬 Redis 실행파일 부재에 따른 선택 통합시험 1건 건너뜀. 보관본 두 파일 내부 자체 시험은 각각 40건·12건 통과했다.
- 추가 재현 12건 포함. 유지된 Intrinio 잠금과 FMP 저장본을 둔 캐시 HIT는 최종 모형에서 네 응답 형태 모두 0.3~0.4ms였다. 500ms 상한도 검증했다. 운영 지연 실측은 아니다.
- Intrinio 또는 FMP 응답을 미완료 상태로 두어도 첫·후속 캐시 HIT가 null로 끝나고, 배경 작업 완료 후 같은 세션 값이 나오는 것을 확인했다.
- 정규장 동시 20요청·두 인스턴스: 응답 전 추가 분봉 조회 0회, 배경 Intrinio 조회 합계 1회. FMP 단독 동시 20요청·두 인스턴스도 HTTP 합계 1회이며 경합 요청은 null, 후속 요청은 같은 값이다.
- 실제 Intrinio 클라이언트→라우터→기존 분봉 함수를 연결한 429 모형: 기본 재시도 상한 2에서도 HTTP 1회, 이후 재시도·FMP 0회. 오류 전파와 오류를 삼킨 빈 응답 모두 확인했다.
- 기존 `intelFast429.test.ts`: 32건 통과. 기존 사용자 경로의 재시도 규칙과 배경 관문 회귀를 확인했다.
- 기존 `tickerPayload.test.js`: 저장된 다섯 종목 응답으로 40건 통과. 전체 체인·요약·캐시·소비처 요청 계약을 확인했다. 준비된 동일 날짜 VWAP 저장본을 모형에 제공했고 결측 동작은 별도 재현 시험으로 확인했다.
- 전체 타입 검사 `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`: 1회 실행, 종료 코드 0·진단 출력 0바이트. 이후 운영 소스 변경 없음.
- `git diff --check` 통과.

## 남은 위험

FMP의 실제 구독 권한·지연·당일 분봉 완전성과 운영 개장 구간 응답 지연은 확인하지 않았다. 운영 실측이나 사고 원인 확정으로 보고하지 않는다. 원천 봉이 없거나 분봉 누락·지연 조건을 통과하지 못하면 null을 유지하며, 배경 작업 완료 전 요청도 null이다.

저장소 읽기와 기존 옵션 출구 처리 시간은 여전히 응답에 포함된다. 제거한 것은 공급사 조회·진행 중 작업·잠금 폴링을 기다리는 추가 지연이다. FMP 신규 경로의 공용 예산은 기존 FMP 뉴스·다른 수집기의 계정 전체 예산과 통합되지 않았다. 이번 수정은 VWAP 경로에 한정되며 사고 기록의 watchlist·공통 요청 합치기 후보는 수정하지 않았다.

브랜치는 `fix/vwap-reapply-open-gap`이다. push·main 병합·배포·운영 데이터 쓰기·브라우저 접근은 하지 않았다.

지시된 브랜치에서 `git add`를 시도했으나 공용 Git 메타데이터의 `.git/worktrees/fix-vwap-reapply-open-gap/index.lock` 생성이 `Operation not permitted`로 거부됐다. 커밋은 생성되지 않았다. 수정 6개 파일은 작업공간에 저장돼 있으며 권한 우회는 시도하지 않았다.
