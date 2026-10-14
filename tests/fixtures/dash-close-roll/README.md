# 2026-10-15 종가 조사 — 확인한 범위

## 결과 요약 / 재현

- 세 JSON은 `~/Documents/signum-work/2026-10-15/` 원본과 바이트 단위로 동일하다. 공급사 응답을 만들어 넣지 않았다.
- A: quotes와 Nasdaq `secondaryData`의 `Closed at Oct 14, 2026 4:00 PM ET` 불일치 7종목 확인.
  NVDA 221.47 / 221.30, TSLA 367.31 / 367.16, MSTR 143.285 / 143.24,
  AMZN 254.16 / 254.08, META 738.23 / 737.54, SPY 769.61 / 769.67, QQQ 728.86 / 728.95.
  MSTR quotes 포맷 출력은 143.28 / -5.85%다.
- A의 **공급사 원인 재현 불가**: 원본에는 Intrinio realtime/history 및 `_intrinio` 진단이 없다.
  아래 코드 경로는 확인했지만, 당시에 어느 입력/분기를 탔는지는 확정할 수 없다. 공식 종가 수리는 하지 않았다.
- B: JSON을 store 없이 직접 화면 계산에 넣으면 NVDA 228.52 / +0.97%, POST -3.09%다.
  하지만 실제 store는 unified의 `regularCloseToday`, `prevRegularClose`, `extended`를 복사하지 않는다.
  따라서 이것을 실제 화면 재현이라고 보고하지 않는다.
- B 실제 경로: 빈 store → unified 응답 → quotes 응답 → unified/quotes 재폴링.
  unified 최초 응답의 `prevClose=226.32`가 quotes의 228.52보다 우선해 이후에도 유지된다.
  실제 DashboardClient/MobileDashboardShell 가격 계산식 및 양쪽 차트 기준선 표현식을 AST로 추출하여 실행했다.

| 원본 JSON 재생 / unified 먼저 | 수정 전 큰 가격·등락 | 수정 후 큰 가격·등락 | quotes 전일 기준 |
|---|---|---|---|
| NVDA | 221.47 / -2.14% | 221.47 / -3.09% | 228.52 |
| TSLA | 367.31 / -2.84% | 367.31 / -2.11% | 375.23 |
| SPY | 769.61 / -1.09% | 769.61 / -1.08% | 778.01 |

quotes 먼저 / SSR 먼저인 경우의 출력은 기존과 같다. **수정 후 값도 A의 잘못된 quotes 종가를 사용한다. 공식 종가 기준으로 바로잡았다는 뜻이 아니다.**

## 원인 파일과 수리

- `src/app/api/live/quotes/route.ts:303`: POST `price = dayClose || prevClose`.
- `src/services/intrinioClient.ts:750`: `resolveSessionPrices`에 일봉, EOD, `normal_market_hours_last_price`(없으면 `qualified_last_price`) 전달.
- 같은 파일 `:523`: 최신 일봉 close 우선. `:542`~`:564`: 최신 일봉/EOD가 당일보다 이전이고 당일 정규장 체결 시각이 있으면 `regularLastPrice`를 종가로 대체.
  `:782`~`:789`: 그 결과를 `day.c`에 넣음. 즉 일반 `last_price`를 POST 종가로 바로 쓰는 구조는 아니다.
  원본의 221.47 등이 마지막 정규장 체결인지, 마감 경매인지, 16:00 직후 체결인지 판별할 원천 필드가 없어 추정하지 않는다.
- `src/app/api/dashboard/unified/route.ts:22`~`:80`: 날짜 없는 종목 키로 일봉 쌍을 메모리 1시간/Redis 10분 캐시.
  `:353`, `:783`~`:800`에서 그 쌍을 close/prevClose에 우선 사용한다.
  실측 JSON은 하루 전/이틀 전 값이지만 당시 캐시 적재 시점과 일봉 응답은 없다.
- **수정** `src/stores/dashboardStore.ts:427`: `existing.prevClose`보다 이번 quotes의 `previousClose`/`prevClose` 우선.
  `:373`~`:381` 최초 unified 응답의 잘못된 기준이 영구히 남는 현상을 제거한다. quotes 기준이 없으면 기존 값 유지.
- unified의 필드 이름/값 자체는 변경하지 않았다. `regularCloseToday`가 잘못된 채 직접 화면에 전달된다는 가설은 실제 store 경로에서 재현되지 않았다.
  API 필드 자체의 날짜 계약 정비는 별도 필요사항으로 남긴다.
- 벤더 호출 추가 0, 운영 쓰기 0. 앱 내 종목 한 숫자 계산과 가격 원천은 변경 없음.

## 바꾼 파일과 호출자 영향

실행 코드 변경은 `src/stores/dashboardStore.ts` 한 곳이다. 그 외는 재생 시험과 원본 fixture/이 문서다.

`useDashboardStore` 전체 소비처를 검색했다:

- 폴링 호출: `src/app/[locale]/dashboard/DashboardClient.tsx`, `MobileDashboardPage.tsx`,
  `src/components/mobile/MobileDashboardClient.tsx`. 이번 우선순위 수정이 적용된다.
- 가격 표시: 위 파일 및 `src/components/mobile/MobileDashboardShell.tsx`.
  현행 desktop/mobile 가격식과 차트식 재생으로 확인. MobileDashboardClient의 별도 렌더는 실행하지 않았다.
- 지표 표시: `src/components/mobile/MobileMetricsTab.tsx` — 지표 필드 변경 없음.
- 종목 선택만 사용: `src/app/[locale]/portfolio/PortfolioClientPage.tsx`,
  `src/app/[locale]/watchlist/WatchlistClientPage.tsx`, `src/components/intel/mobile/MobileCommandPage.tsx`,
  `src/components/portfolio/MobileHoldingCard.tsx` — 가격 계산 경로 아님.
- `app-view/dash`는 이 store 소비처에 없다.

라벨·문구·배치·스타일 파일 변경 없음. 칸 숨김 없음. 브라우저/서버 기동/운영 접근 없이 계산 결과만 검증했다.

## 시험과 한계

실행 명령(각각 공용 lock 사용):

```sh
/usr/bin/lockf -k /tmp/signum-heavy.lock node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/dashCloseRoll.test.ts
```

- 수정 전 `--baseline` 실행으로 잘못된 출력 확인. 수정 후 기본 실행은 올바른 quotes 전일 기준을 요구한다.
- 원본 3개 JSON 재생, 도착 순서 3종, 재폴링, 기준 결측 폴백 및 `q.prevClose` 별칭 확인.
- 16:00:01, 16:59, 20:18, 다음날 07:00 PRE는 원본 가격을 유지한 **시계·세션 대역 시험**이다.
  기준값 우선순위/종가 잠금 해제만 시험한다. 해당 시각의 공급사 원본 재생이나 공식 종가 확정/날짜 롤오버 검증은 아니다.
- 보호 경로: NVDA 애프터 221.43 / 전일 228.52의 한 숫자 출력 -3.10% 확인.
- 기존 관련 시험: quotesBulkClose, preCloseCarryAcrossOpen, extWsTrust(12), marketCalendar.session(37), unifiedPrice.edge(48) 통과.
- 전체 tsc 1회 실행: `src/remotion/kit/scripts.ts:5004`의 `./scripts-jpweek` 누락으로 실패.
  HEAD에도 같은 import가 있고 대상 파일이 없다. 변경과 무관하며 전체 검사는 반복하지 않았다.
- 변경 store와 재생 시험의 의존 그래프 범위 tsc 통과. 임시 tsconfig가 저장소 tsconfig를 상속하고
  `next-env.d.ts`, store, 시험, Next의 `types/global.d.ts`를 포함한다. 최초 범위 검사에서 빠진
  Next `RequestInit.next` 전역 선언을 포함한 뒤 통과했으며 실행 코드를 우회/수정하지 않았다.

남은 위험: A 미수리, unified 자체의 오래된 필드 유지, 첫 quotes 수신 전 잘못된 bootstrap 기준,
경계 시각의 실제 공급사 자료 부재. 공식 종가 보장을 위해 당시 Intrinio realtime/history 또는 진단 snapshot 원본이 필요하다.

## 원본 SHA-256

```text
dash-unified-0555.json d5e8d44a0141711c5981fb43c371bd89fee19221a4a36d2ba615aabae94b433f
nasdaq-official-0601.jsonl 2e070b3e0602ef07e3d9fbbb77a414d346158e7253a859d05aa0bf0f6d31ad54
quotes-0601.json 6c3b846f6d115b5e43bcefa009e7b592050b8396b2ebfc329fd9c4554de03ff8
```
