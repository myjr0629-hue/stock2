# 실적 영수증 정의 혼재 수리 — 2026-10-21

## 결과 요약

기준 커밋 `df149853d0574ee5209ea8e02cd23eb0710f1bd5`, 작업 브랜치 `fix/receipt-method-mix`.

수리·검증 완료, **커밋 미완료**. 명시한 12개 파일의 `git add`를 시도했으나 공용 Git 경로 `.git/worktrees/fix-receipt-method-mix/index.lock` 생성이 `Operation not permitted`로 거부되었다. 변경은 작업공간에 남아 있으며 스테이징·커밋·push는 이루어지지 않았다.

원인: `8c7ce3bf9` 이후 공용 `impliedMovePct`에는 `event-split` 값이 들어갈 수 있지만, 기록 호출자는 `method`를 저장하지 않았다. 영수증·성적표가 그 `pct`를 ATM 스트래들/현물로 설명하며 그대로 비교했다. 스트래들 8.6%·분리 7.7%·실제 8% 입력은 수정 전 범위 밖, 수정 후 범위 안이다.

수리 기준:

- 기록 당시 `pct`와 `method`를 보존하고, 같은 관측의 분리 전 ATM 비율을 `straddlePct`로 따로 저장한다. 원금액은 센트 단위로 반올림되어 있으므로 새 기록은 원금액 재계산보다 원래 ATM 비율을 우선한다.
- `weekly`·`monthly`는 ATM 기준 `pct`를 사용한다. 별도 ATM 비율과 충돌하면 제외한다.
- `event-split`의 분리값은 판정에 쓰지 않는다. 별도 ATM 비율을 사용하며, 그 필드가 아예 없는 기록만 같은 관측의 `straddle / spot`으로 복원한다. 명시적 null·잘못된 별도 값은 다른 값으로 메우지 않는다.
- `method` 없는 과거 기록은 양수·유한한 `straddle / spot`을 소수 1자리로 계산해 기존 `pct`와 일치할 때만 사용한다. 불일치·원금액 결측은 제외한다. 만기·저장일·출처만으로 정의를 추정하지 않는다. null·미지원 method도 제외한다.
- 영수증은 확정 일정의 모든 행과 유효한 실제 반응을 유지한다. 판정 불가에는 기존 `invalid_expected` 사유를 사용한다. 성적표 집계는 같은 기준으로 불명 기록을 제외한다.
- 같은 숫자라도 method·ATM 비율·원금액·행사가·출처가 바뀌면 새 관측을 저장한다. 관측 내용이 같고 저장 시각만 바뀌면 다시 쓰지 않는다. 수동 보강 함수도 method를 필수 입력으로 받는다.
- 화면·문구·라벨·CSS·OG 소스는 수정하지 않았다. 운영 기록 수정·보강은 실행하지 않았다.

### 기존 수치 변화 목록

운영 영수증 원본은 조회하지 않았다. 아래는 저장소에 남아 있는 기존 보강 입력과 합성 입력의 수정 전후 비교다. 운영 전체 변경 건수로 해석할 수 없다. 수정 전 규칙은 위 기준 커밋의 실제 함수를 메모리에서 실행했다.

기존 입력: `scripts/earnings-actuals-seed-expected.ts`의 정적 6종목, 2026-10-13 장전·10-12 세션·10-16 만기. 실제 반응은 기존 `earningsActuals.test.ts`의 기록값을 사용했다. 과거 형태인 method 없는 기록으로 검사했다. **예상 수치 변화 0/6, 판정 변화 0/6, 제외 0/6**이다. 전부 사후 보강이므로 영수증 사전 집계에는 포함하지 않는다.

| 종목 | 예상폭 수정 전 → 후 | 실제 반응 | 판정 수정 전 → 후 |
|---|---:|---:|---|
| C | 4.0% → 4.0% | −5.6019% | 범위 밖 → 범위 밖 |
| GS | 4.2% → 4.2% | −0.2282% | 범위 안 → 범위 안 |
| JNJ | 3.6% → 3.6% | −5.7331% | 범위 밖 → 범위 밖 |
| JPM | 3.2% → 3.2% | −0.8585% | 범위 안 → 범위 안 |
| UNH | 6.7% → 6.7% | −0.2008% | 범위 안 → 범위 안 |
| WFC | 4.6% → 4.6% | −3.0965% | 범위 안 → 범위 안 |

정의 혼재 합성 15개: **변경 10/15 = 수치 교정 3개 + 판정 제외 7개**, 그중 범위 밖→안 반전 2개. 모든 15개 행·실제 가격을 유지했다. 나머지 5개는 변화 없다.

| 사례 | 근거 | 예상폭 수정 전 → 후 | 실제 반응 | 판정 수정 전 → 후 |
|---|---|---:|---:|---|
| A03 | event-split, 별도 ATM 8.6% | 7.7% → 8.6% | 8% | 범위 밖 → 범위 안 |
| A04 | event-split, 별도 필드 없음, 같은 관측 원금액 ATM 8.6% | 7.7% → 8.6% | 8% | 범위 밖 → 범위 안 |
| A05 | event-split, ATM 근거 결측 | 7.7% → 판정 제외 | 8% | 범위 밖 → 판정 제외 |
| A07 | method 없음, 기존 pct와 ATM 비율 불일치 | 7.7% → 판정 제외 | 8% | 범위 밖 → 판정 제외 |
| A08 | method 없음, 원금액 결측 | 7.7% → 판정 제외 | 8% | 범위 밖 → 판정 제외 |
| A09 | 미지원 method | 8.6% → 판정 제외 | 8% | 범위 안 → 판정 제외 |
| A10 | method null | 8.6% → 판정 제외 | 8% | 범위 안 → 판정 제외 |
| A12 | event-split, 별도 ATM null | 7.7% → 판정 제외 | 8% | 범위 밖 → 판정 제외 |
| A13 | monthly pct와 별도 ATM 충돌 | 8.6% → 판정 제외 | 8% | 범위 안 → 판정 제외 |
| A15 | 원금액 반올림 경계, 직접 보존한 ATM 8.6% 사용 | 7.7% → 8.6% | 8.65% | 범위 밖 → 범위 밖 |

동일 입력의 영수증 사전 집계와 성적표: 15쌍·범위 안 8·밖 7 → 유효 8쌍·안 7·밖 1·판정 제외 7. 성적표 예상 중앙값·최대 이탈도 필터링된 ATM 값으로 계산한다.

## 바꾼 파일

- 기록·정의: `src/lib/earnings/earningsActuals.ts`, `src/services/earningsActualsService.ts`, `src/services/impliedMoveService.ts`
- 판정: `src/lib/earnings/earningsReceipts.ts`, `src/lib/earnings/earningsScorecard.ts`
- 수동 보강 입력: `scripts/earnings-actuals-seed-expected.ts` (실행하지 않음)
- 시험: `tests/earningsReceiptMethod.test.ts`, `tests/earningsActuals.test.ts`, `tests/earningsWeeklyEvent.test.ts`, `tests/earningsScorecardRoute.test.ts`, `tests/earningsReceiptsPage.test.ts`
- 결과 문서: 이 파일

### 공유 함수 호출자·영향·시험

| 공유 함수 | 실제 호출자 전체 | 영향·검증 |
|---|---|---|
| `readImpliedMoveRows` 내부 행 변환 | options/implied-move 라우트, earningsActualsService, earningsWeekService, earningsImpliedService, todayPicksService, signalAlertsService, guruLens/service | 실적 요청에 ATM 필드만 추가. 기존 분리값·만기·선택 규칙 유지. 주간·묶음·직접 조회·만기 이월·오늘 볼 것·렌즈·신호 실행기 회귀시험과 tsc로 확인 |
| `parseRecord` | earningsActualsService의 readActualRecords, earningsReceipts의 buildEarningsReceipts, earningsScorecardService의 readEarningsScorecard, earningsScorecard의 aggregateScorecard | method·ATM 비율 보존. 주간 서비스의 expectedAtReport는 기존 pct 유지. 기록·영수증·성적표·API·3언어 SSR 시험, 두 번 파싱·JSON 왕복 검사 |
| `sameExpected` | runActualsCycle | 정의·판정 근거 변경 누락 방지. 같은 pct의 method 전환·ATM 비율 변경·동일 관측 쓰기 0 시험 |
| `seedExpected` | earnings-actuals-seed-expected 스크립트 | method 필수. 고정 입력 monthly 명시. 모의 저장 시험과 정적 6종목 수치 비교 |
| `atmReceiptExpectedPct` (신규) | buildEarningsReceipts, aggregateScorecard | 두 판정 경로의 정의 통일. 재현·혼재·결측·충돌·반올림·비유한값 검사 |

## 돌린 시험과 결과

최종 **시험 17개 파일 통과**, 전체 tsc 1회 오류 0건(종료 0), 공백 검사 통과. 회귀 묶음은 전역 잠금으로 16개 파일을 한 번 순차 실행했다. 페이지 시험은 7개 통과 뒤 기존의 수리 대상 소스 변경 금지 검사에서 멈췄다. 그 검사를 화면·문구·OG·읽기 서비스·라우트 보존 검사로 바꾼 뒤 `--from=8`로 남은 5개만 재실행해 통과했다. 대형 묶음이나 전체 tsc는 반복하지 않았다.

| 시험 파일 | 최종 결과 |
|---|---:|
| earningsReceiptMethod | 6건 통과 |
| earningsActuals | 30건 통과 |
| earningsReceipts | 11건 통과 |
| earningsScorecard | 8건 통과 |
| earningsScorecardRoute | 7건 통과 |
| earningsReceiptsPage | 12건 통과(앞 7 + 뒤 5) |
| earningsWeeklyEvent | 23사례 통과 |
| earningsEventRules | 9경계 검증 통과 |
| earningsImplied | 12건 통과 |
| earningsWeek | 24건 통과 |
| earningsProbeBudget | 4건 통과 |
| earningsMoveDirect | 7건 통과 |
| impliedMoveExpiryRoll | 13건 통과 |
| todayPicks | 46건 통과 |
| guruLensReadOnly | 실제 어댑터·모의 Redis 읽기 8회 통과 |
| signals.run | 23건 통과 |
| earningsScorecardPost | 7건 통과 |

전체 타입 검사 명령:

```sh
/usr/bin/lockf -k /tmp/signum-heavy.lock node --max-old-space-size=3072 node_modules/typescript/bin/tsc --noEmit --incremental false
```

전체 검사 뒤 추가한 비유한 비율 방어는 정의 혼재 시험과 `earningsActuals.ts` 의존 경로만 대상으로 한 별도 tsc로 최종 검증했다. 별도 검사도 같은 전역 잠금에서 오류 0건(종료 0)이었다.

의존성은 기존 저장소 node_modules의 로컬 링크를 사용했다. Next의 기본 타입 참조 파일만 작업공간에 생성했다(둘 다 git 제외). 설치·빌드·개발 서버 실행·환경 파일 읽기는 없었다. 시험은 모의 네트워크와 메모리 저장소만 사용했다. API 시험에서 운영 쓰기·공급사 호출 0회, OG 시험에서 외부 글꼴 요청 차단과 실제 PNG 응답을 확인했다.

## 남은 위험

- 요청한 브랜치 커밋은 Git 메타데이터 쓰기 권한 거부로 미완료다. 이번 세션에서는 권한을 올리거나 잠금을 우회하지 않았다.
- 운영 Redis·API 원본을 읽지 않았으므로 실제 운영 영수증의 변경 건수·티커 목록은 미확인이다. 위 6종목·합성 15개 결과만 측정했다.
- method 없는 과거 기록의 원금액이 결측이거나 센트 반올림 경계에서 pct와 어긋나면, 실제 ATM 기록이어도 보수적으로 판정에서 제외될 수 있다. 다른 정의나 현재 옵션 값으로 보강하지 않는다.
- 120일 보관, 기존 세션·관측시각·실제 반응 검증 규칙은 그대로다. 배포 뒤 첫 정상 관측부터 새 필드가 저장되며, 발표가 끝난 과거 기록을 자동 덮어쓰지 않는다.
- 브라우저·계정·운영 접속·운영 쓰기·push·main 병합·배포는 수행하지 않았다. 환경 파일은 읽지 않았다.
