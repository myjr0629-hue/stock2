# B4b 대표 결정 반영 — 구현·검증 기록

작업 브랜치: `fix/b4b-ceo-decisions`. 근거는 운영 감사 `SWEEP-CLOSED.md` A절 D02·D10·D30·D34·D35와 10/19 대표 결정이다.

## 결과 요약

- **D02**: IV RANK 라벨 유지. 값은 IV30(`cm30-v1`)의 최근 **252거래일 일별 백분위**, 현재 표시 세션 포함이다. 같은 세션에서는 가장 늦게 관측한 유효 원천 하나만 쓴다. 원천 `iv30Date`와 관측 세션이 다르면 제외한다. 252일 중 하루라도 없거나 최신 세션이 낡으면 결측이다. Flow는 `—`, API는 `percentile:null`과 관측 시각·원천 세션·실제 기간·필요 기간·표본 수를 돌려준다. 실패한 조회는 표본 0으로 표시하지 않는다.
- **D10**: 고래 총량·구성·구성 막대는 고래 옵션 자료만 쓴다. 내부자 순매매·건수는 값을 유지한 별도 기존 영역으로 분리했다. 대표가 허용한 `내부자(공시)` / `Insiders (filings)` / `インサイダー(開示)`를 적용했다.
- **D30**: 대표 리스크의 원천은 **RLSI 한 벌**을 선택했다. RLSI는 높을수록 우호적인 지수이므로 리스크 라벨에는 **`round(100 − RLSI)`**, 높을수록 위험인 방향으로 표시한다. Dash와 Guardian이 동일한 전역 GuardianProvider 스냅샷과 동일 함수를 쓴다. 원래 RLSI 라벨·값은 유지하고 Guardian에 같은 리스크 값을 병기했다. F&G도 별개다. CNN 우선 / 없으면 기존 Guardian VIX 12~35 선형 근사를 공용 함수로 사용한다. CNN·VIX가 모두 없으면 결측, 실제 CNN 0은 유효한 관측이다.
- **D34**: 변경하지 않았다.
- **D35**: 종목 요약은 **만기 남은 정규 계약 전체의 `Σ max(ΔOI,0)`**, 콜·풋을 따로 집계한다. 청산과 상계하지 않는다. 기존과 같이 행사가 기준 명목이 우세한 쪽을 요약 라벨의 콜/풋으로 선택한다. 단일 계약은 **양수 ΔOI가 가장 큰 계약**을 `최대 계약`으로 구분했다. Watchlist·Dash·Today·Flow가 같은 생산자·같은 요약 함수를 쓴다. 합계가 없는 옛 저장본은 합계를 `—`로 유지하고 기존 계약 사실은 보존한다. Watchlist도 기존 칩을 감추지 않고 결측을 표시한다. 관측된 신규 계약 0과 결측을 구별한다.

감사에 나온 RLSI 32를 입력하면 리스크 68이다. 이는 **고정 입력 재현값**이며 오늘 운영 점수를 다시 측정한 값은 아니다. 손실 확률이나 표준 VaR로 표시하지 않는다.

## 원인·결정 근거

### D02

변경 전 `ivRank.ts`는 최근 원시 200행(약 7일)에서 같은 세션·같은 값만 중복 제거했다. 장중 IV가 바뀔 때마다 같은 날이 여러 표본이 됐다. API도 200~600행만 조회했다. 좁은 분포에서 현재값이 높으면 대부분 98~99가 되는 메커니즘이다.

[Barchart의 IV Percentile 설명](https://www.barchart.com/education/iv_rank_vs_iv_percentile)은 252거래일 중 현재 IV보다 낮았던 날의 비율을 정의한다. 대표 결정에 따라 라벨은 유지하고 이 일별 백분위 정의를 적용했다. 최근월 만기 ATM IV는 섞지 않는다. `harvest_lambda/iv30.js`의 `rowFields`가 남기는 실제 체인 날짜 `iv30Date`도 확인했다. 수집 실행 날짜로 원천 날짜를 대체하지 않는다.

조회는 기존 DynamoDB 표의 같은 종목을 기간 조건·필드 projection·페이지 넘김으로 읽는다. 기존 범용 `getGexHistory`는 변경하지 않았다. 새 캐시 접두 `v4-daily252`가 옛 계산 캐시와 분리된다. 2025년까지 걸치는 252일 창의 휴장일도 계산 전용으로 보완했다.

### D30

| 기존 값 | 정의·입력 | 방향·선택 |
|---|---|---|
| Dash 리스크 | 50 + 선물 등락×7 + 현물 등락×4 + 섹터 양수 비중 + F&G − VIX 상승 페널티. 요인별 상한 있음 | 높을수록 risk-on. 단기 등락·심리 합성으로 리스크 라벨 방향과 반대 |
| Guardian RLSI | 교차자산 모멘텀 20%, breadth/McClellan 15%, 감마 구조 15%, 유동성 10%, VIX 수준·기간구조 10%, 회전 10%, 심리 10%, 역발상 z-score 5%, buffer·금리 페널티·VIX 감쇠 | 세 후보 중 시장 폭·변동성 구조·감마·안전자산 흐름을 함께 반영하므로 원천으로 선택. 리스크 표시 방향만 역전 |
| F&G | CNN 심리 지수, 없으면 VIX 선형 근사 | 심리 지수이므로 별개 유지 |

기존 두 근사식은 Dash `100-(VIX-10)×3.3`과 Guardian `100-(VIX-12)/23×100`이었다. 후자를 공용 `fearGreedScore`로 통합했다. RLSI 계산 실패 시 `available:false`로 표시해 실패 기본 50을 새 리스크의 관측값으로 내지 않는다. RLSI 내부의 기존 중립 가중치 정책 전부를 바꾼 작업은 아니다.

### D35

변경 전 Watchlist는 상위 12개 계약의 증가분 합, Today/Dash/Flow는 단일 계약의 증가분이었다. 게다가 저장 시 상위 12개로 절단하고 직전 OI 기준선에서 작은 OI를 빼므로, 표시 함수만 합산하면 종목 전체를 복원할 수 없었다.

[Unusual Whales FAQ의 OI Chain Explorer 설명](https://unusualwhales.com/faq)은 계약별 OI 변화와 종목별 전체 체인 OI 변화를 구분한다. [Market Chameleon 계약별 보고서](https://marketchameleon.com/Reports/OpenInterestByOptionContract)도 계약 단위 변화·종목 총량을 별도 열로 다룬다. [Market Chameleon 도구 설명](https://marketchameleon.com/Instructional-Stock-and-Options-Trading-Videos/444/Analyzing-Options-Open-Interest-Using-Market-Chameleon)은 만기별 총 OI와 콜·풋 구분을 설명한다. **집계 수준을 구분하는 이 관행과 대표의 양수 신규 증가 합계 지시**를 구현 근거로 삼았다. 이 자료들이 모두 같은 양수 합계 공식을 쓴다고 단정한 것은 아니다.

수집기의 벌크·저녁 API 공용 집계 함수에서 상위 12개 절단 전에 만기별 콜·풋 양수 ΔOI와 최대 계약을 저장한다. 전체 OI 기준선(0·작은 OI 포함)이 확인된 종목만 새 합계를 제공한다. 기준선에 없던 계약은 완전한 기준선이 있을 때만 전일 OI 0으로 본다. 비교 날짜가 직전 거래일이 아니면 신규 일별 합계를 내지 않는다.

기존 저장 Today 문서는 읽을 때 같은 EOD 원천과 대조한다. 저장·AI 재생성 없이 새 합계를 반영하고, 계약·세션이 바뀌면 이전 AI 설명을 결정형 설명으로 바꾼다. 관측 0은 과거 최대 계약으로 설명하지 않는다. 새 API 정의 표식과 쿼리 버전이 옛 CDN 응답의 합계를 새 정의로 오인하지 않게 한다.

## 공유 함수·호출자 영향

- **IV**: 계산기 직접 호출은 `api/flow/iv-percentile`. 새 전용 조회의 호출자도 이 API 하나다. 기존 범용 조회는 보존했다. 응답 소비자는 `useFlowData/useIvPercentile` → `FlowRadar`·`MobileMetricsTab`, 웹 Dashboard, 앱 Flow·Cmd, warm cron이다. `ivLevelForRank`의 Cmd 호출은 유효한 현재 IV30만 받으며 stale은 결측이다. 데스크톱 화면 파일은 수정하지 않았다.
- **리스크/F&G**: `marketDownsideRisk`는 앱 Dash·Guardian. `fearGreedScore`는 앱 Dash·Guardian와 `rlsiEngine`. 엔진을 받는 `guardianCore`·`unifiedDataStream` 및 Guardian 소비처는 기존 RLSI 값 방향을 유지한다. nullable 심리와 계산 실패 표식을 추가했다.
- **고래**: `createAggregator/finalizeTickers`는 동일 수집기의 벌크·저녁 API 두 경로가 사용한다. `summarizeWhaleOpening`은 options-eod API·todayPicks 선별·저장본 읽기가 사용한다. API `all=1` 소비자인 Watchlist, Undercurrent, live/premium-metrics는 이제 더 넓은 전체 계약 합계를 받을 수 있다. 그중 Watchlist는 새 정의 표식을 검증하고 결측 상태도 전달한다. Today 공용 문장/뷰는 앱 카드·Today·웹/SEO/공유에도 영향을 준다. 기존 단일 계약 리스트는 유지했다.

## 바꾼 파일

구현 18개:

- `src/lib/ivRank.ts`, `src/lib/aws/dynamoDataProvider.ts`, `src/app/api/flow/iv-percentile/route.ts`
- `src/lib/marketIndicators.ts`(신규), `src/services/guardian/rlsiEngine.ts`, `src/hooks/useMacroSnapshot.ts`
- `src/lib/whaleOpening.ts`(신규), `scripts/intrinio-options-eod.js`, `src/app/api/flow/options-eod/route.ts`
- `src/lib/todayPicks/{types,select,copy}.ts`, `src/services/todayPicksService.ts`
- `src/components/app/watchlist/useWatchlistData.ts`, `src/lib/app/watchlistInsights.ts`
- `src/app/[locale]/app-view/{dash,flow,guardian}/page.tsx`

시험 5개: `tests/b4bCeoDecisions.test.cjs`(신규), `tests/ivRank.iv30.test.ts`, `tests/etfFollowup.test.ts`, `tests/todayPicks.test.ts`, `tests/watchlistData.test.ts`. 기록은 이 파일이다.

## 돌린 시험과 결과

- 신규 오프라인 재현 17/17 통과: 감사의 짧은 IV 표본, 원천 날짜, 252일 누락·노후·오류, 실제 DynamoDB 페이지 조회(모의), 리스크 두 화면의 실제 계산문 실행, 상위 12개 밖의 OI·작은 OI·신규 계약·만기·청산, API all/단일 종목 값 일치, Today 저장본 읽기·결측 칩 등.
- `ivRank.iv30.test.ts`: 11/11 통과. 옛 200행 정책 시험을 252일 정책으로 갱신했다.
- `etfFollowup.test.ts`: 10/10 통과. IV 정책 갱신, 감마 관련 시험 유지.
- `todayPicks.test.ts`: 43/43 통과. 바뀐 합계/최대 계약/결측 문장 기대값 갱신.
- `watchlistData.test.ts`: 50/50 통과. 새 정의 없는 캐시 거절·결측 전달 추가.
- 합계 **131건 통과**. 네트워크·Redis·DB·AI는 모의했고 수집기 main은 실행하지 않았다.
- 전체 `tsc --noEmit --incremental false`를 공용 `lockf` 안에서 한 번 실행해 통과했다. 다른 작업공간의 잠금 해제를 기다렸다. 마지막 결측 보강을 포함한 수정 TypeScript 17개와 필요한 Next 전역 선언의 범위 타입 검사도 공용 잠금 아래 통과했다. 범위 검사 임시 설정의 생성 파일·전역 선언 누락은 설정을 바로잡은 뒤 재확인했다(제품 소스 오류가 아니었다).
- `node --check scripts/intrinio-options-eod.js`, JSX 파싱, `git diff --check` 통과.

## 남은 위험·운영 인계

1. 운영 데이터·화면 재측정과 브라우저 검증은 하지 않았다. 131건은 고정 입력/모의 원천 시험 결과다.
2. 수집기·소비처는 아직 운영에 반영하지 않았다. 전체 OI 기준선이 없는 기존 판은 합계 결측이다. 운영 세션에서 수집기 반영 후 완전한 연속 거래일 기준선을 확보해야 전체 합계가 나온다. 그 전에도 기존 칸과 계약 사실은 유지된다.
3. IV30 252일 보유 여부를 운영에서 조회하지 않았다. 부족하면 `—`가 의도한 동작이다. 전체 기간 조회의 운영 소요시간은 미측정이며, 5초/총량 제한·부분 조회는 완전성 검사로 결측 처리한다.
4. 전체 OI 보존으로 기준선 맵이 커진다. 운영 수집기 메모리·시간·페이로드 크기 실측이 남았다.
5. 커밋·push·main 병합·배포·운영 쓰기·브라우저/계정 접근·`.env*` 읽기 없음.
