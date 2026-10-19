# 오늘 돈의 지도 — 운영 검토 기록

## 결과 요약

- 앱 Intel 상단에 독립 카드 3장 추가. 기존 카드에는 새 컴포넌트 import·마운트 2줄만 추가했다.
- 시장 16개 목록·구성종목은 `SECTOR_MAP` 정본이다. 실제 ETF 14개와 합성 평균 2개(AI_PWR·SAFE_HAVEN)를 구분한다.
- PRE는 같은 날짜의 PRE 값과 NQ 선물, REG는 SPY, POST·CLOSED·주말은 날짜가 붙은 정규장 값과 SPY를 비교한다. 다른 날짜·세션은 순위에 섞지 않고 별도로 표시한다.
- 캐시 결측 때 보유한 실제 값을 원래 날짜와 함께 유지한다. 옵션 합산은 서로 다른 날짜를 섞지 않는다. 원천 거래일이 없는 구형 캐시는 날짜를 추정하지 않고 **관측일 기준**으로 표시한다.
- AI는 `intel:ai_headlines:v1` 읽기만 한다. 연결 가능한 기존 테마 문장은 원래 테마 이름도 표시한다. 새 생성·갱신·AI 호출은 없다.
- 실적은 기존 캘린더의 회사 공지 날짜 보정과 예상 변동폭 검증을 그대로 사용한다. 경제 지표는 FMP의 UTC를 기존 변환기로 해석해 ko=KST·ja=JST·en=ET로 표시한다.

## 바꾼 파일

| 파일 | 변경 |
|---|---|
| `src/components/intel/TodayMoneyMap.tsx` | 읽기·60초 폴링·로컬 실제 값 보존·watchlist 구독 |
| `src/components/intel/MoneyMapCards.tsx` | 3장 표시·섹터 선택·리더/레거드·★·일정 |
| `src/lib/app/moneyMap.ts` | 세션·날짜 비교·순위·옵션 합산·결측 복원 |
| `src/app/api/intel/money-map/route.ts` | 기존 Guardian·analysis·실적·경제·AI 캐시 묶음 읽기 |
| `src/app/[locale]/app-view/intel/page.tsx` | import·상단 마운트만 추가 |
| `src/messages/{ko,en,ja}.json` | 새 moneyMap namespace만 추가 |
| `src/services/guardian/sectorEngine.ts` | 5일 결과에 실제 일봉 날짜·계산 기준 메타데이터만 추가 |
| `src/services/earningsCalendarService.ts` | 기존 `withConfirmedDates`를 새 읽기 경로에서도 쓰도록 export |
| `tests/moneyMap.test.cjs`, `tests/fixtures/money-map-*.json` | 세션·언어·날짜·결측·재생·읽기 경로 시험 |

공유 함수 영향:

- `calculateRotationIntensityV2`: 기존 호출자는 같은 파일의 `SectorEngine.getSectorFlows` 1곳이다. 계산식·순위·수익률은 보존하고 `asOf`·`basis`만 추가한다. `getSectorFlows`는 Guardian 공유 코어(`unifiedDataStream.ts`)와 점검 스크립트 `verify_cache_logic.ts`·`verify_new_sector_engine.ts`에서 사용한다. 반환 계약의 필수 필드는 보존한다. 시험에서 기존/신규 결과의 score·cumReturn 동일성을 확인했다. 실제 엔진을 실행하는 스크립트는 운영 캐시 쓰기가 발생할 수 있어 돌리지 않았다.
- `withConfirmedDates`: 기존 호출자는 같은 서비스의 `getMarketEarningsCalendar` 1곳이며, 새 money-map GET이 추가 호출자다. 함수 본문은 바꾸지 않았다. 원본 캘린더를 다시 만들거나 벤더·AI를 호출하지 않는다.
- SMH·HACK·ICLN의 기존 sectorEngine 5일 계산은 ETF 직접 수익률이 아닌 구성종목 평균이다. 이 차이를 숨기지 않고 카드의 5일 기준에 동일가중 평균이라고 표시한다.

## 돌린 시험과 결과

- `node --test tests/moneyMap.test.cjs`: **27개 통과**. PRE·REG·POST·CLOSED·주말 × ko/en/ja 렌더 15개 포함. 거래일·조기 폐장·서로 다른 세션·오래된 기준선·실측 0·결측 보존·옵션 날짜별 합산·일정·★·16개 정본과 읽기 전용 경로를 검사했다.
- 기존 `guardianCore.test.ts`: **35개 통과**.
- 기존 `earningsConfirmed.test.ts`: **30개 통과**. 기존 `earningsImplied.test.ts`: **12개 통과**. 외부 I/O는 기존 시험의 가짜 의존성으로 대체했다.
- 재생 ①: 운영 세션이 저장한 `reg-snapshots/quotes-2310.json`에서 공개 필드만 추출한 실제 REG 시세 사본. SPY·NVDA·AAPL·TSLA 값·날짜 보존 확인.
- 재생 ②: 근거 보고서 §B-3의 실측 5개 섹터 발췌. SMH +2.40% / 5일 −10.07%, NQ 대비 +1.15pp 확인. **전체 API 응답 사본 재생과는 구분한다.**
- `git diff --check`: 통과. 새 파일도 `git diff --no-index /dev/null <파일>`로 물리 저장 확인.
- 전체 tsc: `/usr/bin/lockf -k /tmp/signum-heavy.lock ./node_modules/.bin/tsc --noEmit --incremental false`를 1회 요청했으나 **공용 잠금 때문에 실행에 진입하지 못했다**. 잠금 점유 작업공간은 `feat-local-currency`로 확인했다. 장시간 대기 후 이 작업의 대기 명령만 종료했다. 같은 무거운 명령은 재실행하지 않았다.

## 남은 위험

- 전체 tsc는 미실행이다. 잠금이 해제된 뒤 실행해 0 오류를 확인해야 한다. 현재는 검증 완료 상태가 아니다.
- 전체 Guardian API 응답 사본은 확보하지 못했다. curl은 DNS 해석 실패(`Could not resolve host`)로 종료했다. 운영 세션에서 사본 경로를 제공하면 같은 세션·날짜 검증으로 추가 재생할 수 있다.
- 브라우저·실기기 확인은 사용자 금지 범위라 수행하지 않았다. 검증 범위는 SSR 렌더·순수 함수·캐시 경계·기존 회귀다.
- 기존 캐시에 원천 거래일이 없으면 거래일을 단정할 수 없다. 이 경우 관측일 기준 표시가 남는다. 새 sectorEngine 5일 결과는 실제 일봉 날짜를 포함한다.

커밋·push·병합·배포·운영 데이터 쓰기는 하지 않았다. `.env*`는 읽지 않았다.
