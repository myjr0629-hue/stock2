# 오늘 돈의 지도 — 3차 관문 제출 기록 (2026-10-20)

## 결과 요약

- **실측:** 2차 관문 보류 2건을 추가 5시험으로 재현했다. 수정 전 기존 39 통과 / 추가 5 실패, 수정 후 **44/44 통과**다. 1차 관문 회귀와 PRE·REG·POST·CLOSED·주말 × ko/en/ja 렌더 15시험을 포함한다.
- **마감 전 시세 오인:** 마감 20분 이내 장중 값도 확정 종가처럼 허용하던 조건이 원인이었다. POST·CLOSED·주말 순위는 해당 정규장 날짜의 `kind: close`만 사용한다. 확정 종가와 장중 값 사이의 상대강도·종목 대비 계산도 허용하지 않는다. 장중 관측값 자체는 날짜가 붙은 직전 값 영역에 유지한다.
- **옵션 거래일 혼합:** 실제 날짜 `structure.chainDate` 대신 boolean `debug.chainDateInferred`를 읽어 관측일 합산으로 떨어지던 것이 원인이었다. 같은 측정 순프리미엄인 경우 실제 체인 날짜를 전달해 날짜별로 합산한다. 다른 측정값의 구조 캐시는 날짜를 빌려주지 않고 관측일 표식을 유지한다.
- 재현 사례: 10/19 15:45 ET의 SMH +2% / SPY +1%가 18:00 ET 현재 순위에 남던 경우, 10/19에 캐시한 10/15 +10과 10/16 −4가 +6으로 합쳐지던 경우다. 수정 후 전자는 직전 값으로 유지되고 후자는 최신 실제 거래일 10/16의 −4만 표시된다.
- 기존 Intel 카드·라벨·messages는 이번 수리에서 수정하지 않았다. 브랜치 `feat/money-map`에서 작업했고 커밋·push·병합·배포·운영 쓰기·새 AI 호출·브라우저 접근은 하지 않았다. `.env*`는 읽지 않았다.

## 바꾼 파일

| 이번 수리 파일 | 변경 |
|---|---|
| `src/lib/app/moneyMap.ts` | 마감 순위는 확정 종가만 사용, 종가/장중 혼합 비교 차단 |
| `src/app/api/intel/money-map/route.ts` | 실제 `structure.chainDate`를 옵션 합산에 전달 |
| `tests/moneyMap.test.cjs` | 2차 관문 회귀 5시험 추가, 마감 정상 렌더 입력은 확정 종가로 명시 |
| `docs/MONEY-MAP-1019.md` | 이번 실행 기록 |

영향·호출자:

- 변경한 `comparable/currentValue`는 moneyMap 내부 전용이다. `buildMoneyMap`의 제품 호출자는 `TodayMoneyMap` 1곳이고 결과는 `MoneyMapCards`가 표시한다. 동일 날짜·종류끼리만 비교하므로 미확정 장중 값과 확정 종가가 섞인 종목의 섹터 대비도 비운다. 날짜가 붙은 실제 값은 유지한다. 함수 시그니처·다른 화면·시세 원천 계산은 바꾸지 않았다.
- `aggregateMapPremium`의 제품 호출자는 money-map GET 1곳이다. 함수 본문은 바꾸지 않고 기존 날짜별 분리에 올바른 원천 날짜를 전달한다. 시험은 서로 다른 체인 거래일, boolean true/false, 구조와 analysis의 측정값 불일치를 검사한다.
- 1차 수리에서 바꿨던 공유 `regularQuoteProvenance`, `/api/live/quotes`, `calculateRotationIntensityV2`, `withConfirmedDates`는 이번에 수정하지 않았다. 1차 수리 당시 기존 시세·실적 호출자 회귀 결과는 아래 이력과 구분한다.

브랜치 기존 구현은 Intel 상단 카드 3장, SECTOR_MAP 정본 16개(ETF 14 + 합성 평균 2), ko/en/ja 문구, 기존 Guardian·analysis·실적·경제·AI 캐시 읽기 경로다. 기존 섹터 AI 문장만 재사용하며 새 AI를 생성하지 않는다.

## 돌린 시험과 결과

| 이번 실행 | 실측 결과 |
|---|---|
| 수정 전 `node --test tests/moneyMap.test.cjs` | 기존 39 통과 / 추가 5 실패 |
| 수정 후 같은 시험 | **44/44 통과**, 실패 0, 종료 코드 0 |
| 원본 파일 지정 재생(아래 명령) | **2 통과 / 실패 0 / 나머지 42 skip**, 종료 코드 0 |
| 전체 tsc (공용 잠금, 1회) | **오류 0, 종료 코드 0**. 공용 잠금 대기 후 실행 완료, 반복 실행 없음 |
| `git diff --check` | 코드·시험·기록 4파일 통과, 종료 코드 0 |
| `git ls-files --others --exclude-standard` | **0개**, 종료 코드 0. 생성한 임시 로그는 `/tmp`에만 보관 |

추가 5시험 중 4개는 POST·CLOSED·주말·조기폐장을 각각 검사한다. 각 시험 안에서 양쪽 모두 장중 값 / 섹터만 장중 값 / SPY만 장중 값의 세 경우를 검사하며, 날짜·실제 등락 표시가 남는지도 SSR로 확인한다. 나머지 1개는 실제 reader GET을 캐시 대역으로 실행해 거래일 분리·화면 기준일·측정값 불일치를 확인한다.

명령:

```sh
node --test tests/moneyMap.test.cjs
MONEY_MAP_GUARDIAN_REPLAY=/Users/eunhoon/Documents/signum-work/2026-10-15/guardian-ko.json MONEY_MAP_QUOTES_REPLAY=/Users/eunhoon/Documents/signum-work/2026-10-19/reg-snapshots/quotes-2310.json node --test --test-name-pattern='archived full Guardian|local REG response replay' tests/moneyMap.test.cjs
/usr/bin/lockf -k /tmp/signum-heavy.lock ./node_modules/.bin/tsc --noEmit --incremental false
```

재생 근거:

- 10/19 REG 실제 시세: `reg-snapshots/quotes-2310.json`의 SPY·NVDA·AAPL·TSLA. 값·원천 시각·날짜를 확인했다.
- Guardian 전체 보관 응답: `2026-10-15/guardian-ko.json`, 실제 기준 시각 **2026-10-14T22:32:18.309Z (POST)**. 모든 16개 5일 값을 reader → 3언어 카드로 재생했다. 거래일 메타데이터가 없는 값은 관측일 표식을 검사하며 현재 시세 순위를 만들지 않는다.
- 보고서 §B-3 PRE 실측 발췌도 기본 시험에 포함한다. SMH +2.40% / 5일 −10.07%, NQ 대비 +1.15pp다. 전체 API 응답과 구분한다.
- 신규 Guardian GET은 수행하지 않았다. 재계산·AI·캐시 쓰기가 발생할 수 있어 이미 보관된 원본만 사용했다.

이번 로그: `/tmp/money-map-gate2-before.tap`, `/tmp/money-map-gate2-after.tap`, `/tmp/money-map-gate2-source-replay.tap`, `/tmp/money-map-gate2-tsc.log`, `/tmp/money-map-gate2-physical-save.diff`, `/tmp/money-map-gate2-callers.txt`, `/tmp/money-map-gate2-untracked.txt`.

1차 수리 이력(이번 재실행 결과가 아님): 기존 시세 벌크 9/9, 허브 23/23, 원천 시각 43/43, 실적 변동폭 12/12, 실적 확정일 30/30 통과. 전체 tsc에서 필수 인자 누락 1건을 수정하고 해당 파일·전이 의존성 범위 검사 오류 0을 확인했지만, 당시 수정 후 전체 tsc 0은 확인하지 못했다. 2차 관문에서 이번 두 결함이 추가로 발견되어 위와 같이 수리했다.

## 남은 위험

- 이번 수정본의 전체 tsc 오류 0을 확인했다. 3차 관문 검토 결과는 아직 받지 않았다.
- 10/19 REG 전체 Guardian 응답은 보관본이 없다. Guardian은 10/14 POST 원본, 10/19 REG는 실제 시세 원본으로 재생한 범위다.
- 브라우저·실기기 검증은 금지 범위여서 수행하지 않았다. 검증은 SSR·순수 함수·캐시/시세 경계·타입 검사다.
- 원천 거래일 없는 구형 데이터에는 관측일 표식이 남는다. 원천 시각·확정 종가 여부를 모르는 구형 로컬 값은 날짜와 함께 표시하되 현재 순위에는 쓰지 않는다.
