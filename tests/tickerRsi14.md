# H1 종목 RSI14 수리 — 2026-10-23

## 확인한 원인

- `live/ticker`는 달력상 어제까지 30일 범위의 최대 20봉을 받았다. 당일 마감 뒤에도 당일 종가가 빠진다.
- `alphaEngine.computeRSI14`는 마지막 15개 종가의 14개 변동을 단순 평균한다. Wilder 재귀 평활이 아니다.
- batch는 별도 공급사 RSI 지표를 사용했다. 감사의 외부 수치 비교는 AUDIT.md의 측정이며, 이 작업에서 운영 GET을 재실행하지 않았다(GET 내부에 캐시 쓰기가 있음).

## 변경과 영향

- `dailyRsiWindow` / `dailyRsi14`를 종목 GET과 `watchlistBatchService.getStockDataLight`가 함께 사용한다. 두 생산자 외 기존 `computeRSI14` / `calculateRSI` 호출자는 변경하지 않았다.
- 같은 550일 조회 범위에서 완료 정규장 세션까지의 최신 250개 일봉 `c`(Intrinio 어댑터의 `stock_prices.close`)를 오름차순으로 사용한다. 첫 14개 변동의 평균으로 seed를 잡고 `(이전 평균 × 13 + 새 변동) / 14`로 평활한다.
- 장중·PRE는 직전 완료 세션, 마감 뒤는 당일 세션을 사용한다. 기존 거래일·휴장·조기 폐장 달력을 재사용한다. 시간외 가격과 진행 중 일봉은 RSI에 넣지 않는다.
- 자료 부족, 목표 세션 미도착, 잘못된 종가·시각, 중복 날짜는 null이다. 실제 RSI 0/100, 전체 보합의 중립 50은 보존한다. null/0은 last-good RSI로 덮지 않는다.
- 가격 기준선·OC·3D 반환·sparkline용 자료는 이전 20봉/30일 범위를 유지한다. UI 파일·라벨·문구·레이아웃은 수정하지 않았다.
- 공급사 요청 코드상 종목 일봉 1회 유지(범위만 확대), batch 입력 4회 → 3회(별도 RSI 제거). 일봉은 최대 500행의 단일 페이지다. 실제 공급사 트래픽은 측정하지 않았다.
- 종목 응답 캐시 v7 / last-good v6으로 옛 단순평균 캐시와 분리한다. 종목 캐시를 직접 읽는 `intelFastFallback.readIntelTickerCache`도 v7을 읽도록 맞췄다. 호출자는 `api/intel/fast`이며 기존 full/nochain 및 점수 0 회귀시험을 유지했다.
- batch의 기존 분석 캐시를 읽는 경로는 유지한다. 이 캐시의 RSI는 기존 공급사 값이며, 새 일봉 계산 경로는 캐시 복구·Dynamo 보충·캐시 미적중에서 쓰인다.

## 회귀시험

- `dailyRsi.test.js`: 알려진 Wilder 14 표본(70.4641350211 / 62.8807183099), 250봉 warm-up, 역순 입력, 최신 세션, null/0/100/50, 실제 batch 함수의 호출 수와 30일 자료 보존.
- `tickerVwapColdCache.test.js`: 실제 GET을 메모리 I/O로 실행. 감사 마감 시각·정규장·POST·주말·PRE·조기 폐장, full/lite × chain full/summary, 표시값과 Alpha 입력, MISS→HIT, last-good null/0 및 세션 경계.
- `tickerPayload.test.js`: H1의 RSI와 날짜 필드만 이전 응답 비교에서 제외하고 나머지 응답·체인·캐시 모양 계약을 계속 비교한다.
- `intelFastFallback.test.js`, `extStaleRoute.test.ts`, `integrityStructUnify.test.js`: 현재 캐시 키와 공통 함수 의존성을 반영한다.

## 운영 세션의 병합 후 확인용 GET

이 명령은 이 작업에서 실행하지 않았다. 운영 세션에서 배포·캐시 갱신 후 수행할 비교다.

```sh
for t in MSFT TSLA AMZN; do
  curl -s "https://www.signumhq.com/api/live/ticker?t=$t" \
    | python3 -c 'import sys,json; d=json.load(sys.stdin)["display"]; print(d["rsi14"],d.get("rsi14Date"))'
  curl -s "https://www.signumhq.com/api/watchlist/batch?mode=price&tickers=$t" \
    | python3 -c 'import sys,json; v=json.load(sys.stdin)["results"][0]["realtime"]["rsi"]; print(None if v is None else round(v,1))'
done
```

외부 가격 자료와 배당·분할 조정 정책이 다르면 RSI가 달라질 수 있다. 이 수리는 기존 일봉 종가 계열을 통일하며 다른 공급사의 조정 종가로 바꾸지 않는다. 마감 직후 일봉이 아직 도착하지 않으면 완료 세션의 값을 지어내지 않고 null을 반환한다.

제안(미적용): 기존 CMD의 `data.rsi14 > 0` 표시 조건은 실제 RSI 0도 `—`로 그린다. 이 작업은 API의 0을 보존하며, 대표 지시 없는 화면 표시 조건 변경은 하지 않았다.

## 바꾼 파일

- `src/lib/dailyRsi.ts`
- `src/app/api/live/ticker/route.ts`
- `src/services/watchlistBatchService.ts`
- `src/services/intelFastFallback.ts`
- `tests/dailyRsi.test.js`
- `tests/tickerVwapColdCache.test.js`
- `tests/tickerPayload.test.js`
- `tests/intelFastFallback.test.js`
- `tests/extStaleRoute.test.ts`
- `tests/integrityStructUnify.test.js`
- `tests/tickerRsi14.md`

## 검증 기록

- `/usr/bin/lockf -k /tmp/signum-heavy.lock node scripts/run-offline-tests.cjs`: 294개 시험 파일 전부 실행, 290개 통과·4개 실패.
- H1 관련 6개 시험 파일(`dailyRsi`, `tickerVwapColdCache`, `tickerPayload`, `intelFastFallback`, `extStaleRoute`, `integrityStructUnify`) 전부 통과. `tickerVwapColdCache` 40/40, 신규 Wilder/batch 시험 4/4 통과.
- `/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --noEmit --incremental false`: 종료 코드 0, 오류 출력 0.
- `git diff --check`(변경 경로 한정): 종료 코드 0.
- 실패 중 `adviceGuard.test.ts` / `appNoFakeSocialProof.test.ts`는 180초 시간 초과이며, 단언 실패로 분류하지 않았다. 900초 제한의 두 항목 재검사는 다른 작업공간의 공용 잠금 뒤에서 시작 전 대기하다 취소했다. 두 항목을 재검사 통과로 보고하지 않는다.
- `earningsScenario.test.cjs`의 두 단언과 `readCheck.test.cjs`의 한 단언은 과거 기준 커밋 대비 저장소 전체 변경 범위를 고정한 검사다. 시작점 origin/main에도 그 기준 이후 각각 31개·40개·47개 src 변경 파일이 있음을 `git diff <기준> origin/main --name-only`로 확인했다. 이 작업에서 해당 검사나 관련 없는 제품 코드는 완화·수정하지 않았다.
- 커밋·push·병합·배포·운영 쓰기 없음.
