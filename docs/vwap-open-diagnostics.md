# 개장 VWAP 내부 진단

`GET /api/internal/vwap-diag?t=IBM`

기존 `adminAuthorized`를 그대로 쓴다. `Authorization: Bearer` 또는
`x-cron-secret` 헤더로 인증하며 URL 쿼리 인증은 받지 않는다.
운영에서 인증 설정이 없으면 401이다. 응답은 `private, no-store`다.
비밀값을 URL·명령 출력·문서에 적지 않는다.

## 동작과 범위

진단 GET은 저장본만 읽는다. FMP 호출, 잠금 예약, 캐시 쓰기를 하지 않는다.
기존 배경 복구가 실행될 때만 그 결과를 별도 진단 키에 600초 보관한다.
VWAP 산식·수락 조건, 성공 15초/실패 5초 캐시, 종목 10초 잠금,
전체 2초 호출 간격, ticker 응답 필드·화면은 유지한다.
진단 저장 실패는 기존 계산 결과에 반영하지 않는다.

| 필드 | 해석 |
| --- | --- |
| `fmpKeyPresent` | 현재 인스턴스의 키 존재 여부만 boolean |
| `session`, `eligible` | 현재 정규장 단계와 기존 복구 경로 실행 가능 여부 |
| `cache.hit` | 조회 시점에 만료 전 VWAP 캐시 엔트리가 있는지. null 음성 캐시도 적중 |
| `cache.valuePresent` | 적중 엔트리에 실제 VWAP 값이 있는지 |
| `cache.expiresAt` | VWAP 엔트리 만료 시각(epoch ms) |
| `observationState` | `observed` 또는 `not_observed` |
| `observation.observedAt` | 마지막 관측 완료 시각(epoch ms), 현재 조회 시각과 구별 |
| `observation.outcome` | 마지막 복구 시도의 수락·거절·호출 생략·오류 분류 |
| `observation.httpAttempted`, `httpStatus` | 그 시도에서 실제 HTTP를 실행했는지와 HTTP 상태. 실행하지 않았거나 응답 전에 실패하면 상태는 null |
| `observation.validation.barCount` | HTTP 성공 JSON 배열의 전체 봉 수. 배열이 아니면 null |
| `regularMinuteCount` | 미래·다른 날짜·장외 봉을 제외한 고유 정규장 분 수. 무효 HLCV 봉도 개수에는 포함 |
| `firstBarET`, `latestBarET` | 위 정규장 분 범위. `America/New_York`, 분 단위로 정규화 |
| `missingMinutesET` | 09:30부터 최신 관측 분까지 없는 분 목록 |
| `latestLagMinutes` | 현재 ET 분과 최신 관측 분의 차이. 끝부분 지연은 이 필드로 확인 |
| `rejected` | 누적값 수락을 막은 조건 목록 |
| `skipped` | `invalidTime`, `future`, `otherDate`, `outsideRegular`별 제외 봉 수. 이것만으로 전체를 거절하지는 않음 |

`validation`의 하위 필드는 모두 `observation.validation` 안에 있다.
HTTP 비정상·파싱 오류·HTTP 생략 시에는 validation이 null이다.
원천 응답 본문·URL·오류 메시지·원본 시각 문자열·키 값은 저장하거나 반환하지 않는다.

## 사유 코드

- 검증: `not_array`, `date_mismatch`, `outside_regular_session`,
  `invalid_price`, `invalid_volume`, `conflicting_duplicate`, `no_regular_minutes`,
  `missing_open_minute`, `missing_middle_minutes`, `stale_latest_minute`,
  `session_vwap_unavailable`(거래량 전부 0 또는 무효 누적 결과).
- 시도: `accepted`, `validation_rejected`, `missing_fmp_key`,
  `symbol_lock_unavailable`, `budget_unavailable`, `background_tripped`,
  `http_error`, `fetch_timeout`, `fetch_error`, `parse_error`,
  `validation_error`, `cache_read_error`, `symbol_lock_error`, `budget_error`, `cache_write_error`.
- 잠금·예산 저장소의 false는 경합과 저장소 사용 불가를 구별하지 못하므로
  `unavailable`로 보고한다. 캐시 래퍼가 장애를 null로 바꾸면 조회 미스와 구별할 수 없다.

## 관측 한계와 운영 확인

진단은 종목·당일별 마지막 시도 한 건이며 전체 이력이 아니다. 이후 잠금·예산 탈락이
앞선 HTTP 관측을 대체할 수 있다. 동시 인스턴스에서는 마지막 저장이 이긴다.
캐시 적중·진행 중 작업 합류는 새 시도로 기록하지 않는다.
배경 복구에는 진단용 저장 1회가 추가되며 저장 지연이 작업 완료를 늦출 수 있다.

배포 전 발생한 실패, 600초가 지난 관측, 진단 저장소 장애,
ticker가 Intrinio 429 뒤 FMP 함수에 도달하기 전에 반환한 경우는
`not_observed`일 수 있다. 이 응답만으로 FMP 정상·장애 또는 upstream 차단을 단정하지 않는다.

운영 반영 뒤 기존 ticker 복구가 발생하는 동안 같은 종목의 진단 GET을 관측한다.
GET만 반복해서 FMP를 새로 실행시키지는 않는다. 이번 작업에서는 운영 GET·공급사 요청·
운영 저장소 쓰기를 실행하지 않는다. 운영 병합·배포는 장 마감 뒤 운영 세션에서 수행한다.

## 호출자와 검증 범위

서비스의 기존 호출자는 `src/app/api/live/ticker/route.ts`의 배경 복구
`getRealtimeSessionVwap`와 저장본 읽기 `readRealtimeSessionVwap` 두 곳이다.
`realtimeVwapFromMinutes`의 반환형은 유지하며, 실제 공급사 경로도 동일한 검증 함수를 사용한다.
기존 ticker 라우트·응답 투영 회귀, 공급사 예산·캐시 TTL·배경 차단 회귀,
각 검증 사유·인증·비밀 미반환·진단 GET 무호출·무쓰기·인스턴스 간 진단 공유를
모형으로 시험한다. 환경파일·실제 공급사·운영 저장소는 사용하지 않는다.
