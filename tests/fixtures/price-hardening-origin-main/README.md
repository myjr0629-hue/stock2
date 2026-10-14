# 가격 비교 기준

기준은 작업 시 로컬 `origin/main`인 `64f5a5f8ac811642d86742777fba5850b82be37f`다. fetch하지 않았다.

각 파일은 `git show origin/main:<경로>`의 출력 원문이다.

| 고정 사본 | 원래 경로 |
| --- | --- |
| indexQuoteReconcile.ts.txt | src/lib/indexQuoteReconcile.ts |
| route.ts.txt | src/app/api/cron/market-feed/route.ts |
| intrinioClient.ts.txt | src/services/intrinioClient.ts |
| rules.js.txt | scripts/integrity/rules.js |

`manifest.json`의 SHA-256으로 원문 변경을 검사한다. `.txt`는 앱 빌드·모듈 탐색 대상이 되지 않게 한다.

비교 시험은 실제 지수 함수와 `fetchOneQuote` 본문, Intrinio 모듈 전체, 감시 규칙을 각각 실행한다. 시계·공급사 응답·Redis·계측·after는 메모리 대역이며, 허용하지 않은 의존성은 실패한다.

정답 열은 관문 재현값과 모의 공급사의 체결·공식 종가에서 정한다. 근거 부족 행은 이전 구현과 전체 결과 동일을 강제한다. 이전 구현도 틀린 값이면 그대로 남는다는 뜻이다.
