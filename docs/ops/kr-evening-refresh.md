# 한국 저녁 생성 보강 (fix/kr-evening-refresh)

근거: 운영 보고서 `ux-1019/REPORT.md` §0-2 2위·§B-1. 확인된 원인은 조기 크론 부재와 today-picks의 07:30 ET 이전 시간 창 차단이다. 섹터 AI 입력에는 뉴스·선물·옵션 날짜가 없었다.

## 바꾼 파일

- `vercel.json`
- `src/app/api/cron/today-picks/route.ts`
- `src/app/api/cron/sector-headlines/route.ts`
- `src/services/todayPicksService.ts`
- `src/services/preMarketContext.ts`
- `src/lib/todayPicks/types.ts`
- `src/lib/ai/preMarketContext.ts`
- `tests/todayPicks.test.ts`
- `tests/krEveningRefresh.test.ts`
- `docs/ops/kr-evening-refresh.md`

## 시각과 슬롯

`vercel.json`은 엄격한 JSON이라 주석을 넣지 않았다. UTC 고정 근거 주석은 두 크론 라우트와 `todayPicksService.inWindow`에 있다.

| 생성 | UTC (월~금) | KST | EDT | 11/1 종료 후 EST |
|---|---|---|---|---|
| 오늘 볼 것 조기판 `pre` | 08:30 | 17:30 | 04:30 PRE | 03:30 CLOSED |
| 섹터 한 줄 첫 회 | 08:40 | 17:40 | 04:40 PRE | 03:40 CLOSED |
| 섹터 한 줄 두 번째 | 10:40 | 19:40 | 06:40 PRE | 05:40 PRE |

미국 프리는 04:00 ET부터다. EST 조기판을 PRE로 표시하지 않고 선물·뉴스와 날짜가 붙은 직전 정규장 값을 사용한다. 기존 아침·마감 크론은 유지했다. 21:00 KST의 today-picks는 EDT 08:00에 `am`으로 실행된다. EST 07:00은 기존 창 밖이라 건너뛰고, 기존 22:00 KST(08:00 EST) 크론이 `am`을 만든다.

## 재료와 비용

- 선택된 오늘 볼 것 최대 5종목은 기존 `/api/live/quotes`를 읽는다. 선물은 `yahoo:nq`·`yahoo:spx`, 뉴스는 `guardian:news:digest:v2`의 최근 24시간 항목을 읽는다. 선물 생존 판정은 기존 `buildBackdrop`을 재사용한다. 뉴스·선물을 다시 생성하지 않는다.
- 프리 시세는 `extendedLabel=PRE`, 당일 `extendedDate`, 양수 `extendedPrice`, 유효한 등락률을 함께 확인한다. 미체결 기본 0%는 PRE로 취급하지 않는다. 섹터 평균은 PRE와 REG를 섞지 않으며 PRE 표본 부족 시 날짜가 붙은 REG 한 벌을 사용한다.
- 옵션은 기존 EOD/lastgood 원천과 실제 날짜를 보존한다. EOD 레코드 날짜와 신규 포지션이 열린 `prevDate`는 별개다. 오래된 묶음을 직전 거래일 것으로 재명명하지 않는다. 섹터 옵션 OI는 표본 수를 함께 넣고 없는 값은 null이다.
- 추가 섹터 호출은 기존 `withFreshTier`를 사용한다. Haiku 5.5 크레딧 월 상한·차단 시 AWS로 넘어가지 않는다. today-picks는 기존 크레딧 전용 처리와 일 60회 기본 호출 상한을 유지한다.
- 같은 날짜·같은 슬롯·같은 자료의 today-picks는 추가 AI 호출이 없다. 조기판이 아침판을 막지 않도록 `pre`와 `am`을 구분한다. 섹터는 같은 프리 슬롯 중복을 건너뛰며 기존 배경 잠금을 재사용한다.
- 주말·휴장 생성은 직접 호출과 today-picks force/dry에서도 차단한다. 추가 크론 모두 평일이다. 화면 라벨·문구·배치는 수정하지 않았다.

## 공유 함수 호출자와 영향

- `inWindow`: today-picks 크론만 호출. UTC 조기 창을 추가하고 휴장 여부를 확인한다.
- `slotOf`: `runPicks`가 호출. `pre` 슬롯 키가 새로 생기며 기존 `am`·`pm` 키는 유지된다.
- `writeWhy`: `runPicks`가 호출. 선택적 배경 인자를 추가했으며 기존 숫자·날짜·조언 출구 검사는 그대로다. 직접 시험 호출은 기존 인자만으로도 동작한다.
- 새 `sessionQuote`: 섹터 생성과 today-picks 프리 시세 읽기가 호출한다. 새 `preMarketPrompt`·`readPreMarketContext`: 두 생성 경로가 호출한다. `generationSession`: 두 문서의 생성 메타에 사용한다.
- `TodayPicksDoc` 읽기: `readPicks` → 읽기 API·웹 today·OG·초대 랜딩·마감 푸시, `buildView` → 앱 카드·전체 보기·웹·OG. 필수 기존 필드를 보존하고 새 메타는 선택적이다. UI는 기존 `pickedAt`과 항목별 `asOf`를 계속 사용한다.
- 섹터 읽기: `/api/intel/snapshot`의 `overlayAiHeadline`이 같은 날짜·120분 이내 문서를 채택하고 `headlineSession`을 그대로 전달한다. 기존 응답 필드와 TTL은 유지한다.

## 검증

- `tests/todayPicks.test.ts`: 46개 통과. EDT/EST 17:30·21:00 슬롯, 금요일→월요일 날짜 교체, 같은 슬롯 0콜, 아침판 별도 생성, 주말 차단, 기존 가드·읽기·푸시·표시 계약 포함.
- `tests/krEveningRefresh.test.ts`: 12개 통과. 크론 JSON, PRE 날짜/결측/실제 0%, EDT/EST 두 섹터 슬롯과 기존 아침 생성, 크레딧 차단 보존, 혼합 평균 방지, 오래된 선물·뉴스 배제, 주말 0콜 포함.
- 외부 시세·Redis·AI는 전부 모의했다. 운영 API·운영 데이터 쓰기·브라우저·커밋·push·병합·배포는 실행하지 않았다.
- 전체 TypeScript 검사: `/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --noEmit --incremental false` — 1회 실행, 종료 코드 0(진단 없음).

## 남은 확인

실제 크론 실행과 모델 문장·실제 비용은 배포 후 운영 세션에서 확인해야 한다. 이 작업에서 AI 비용을 실측하지 않았다. 기존 호출 상한/배경 잠금은 get→set 방식이어서 엄밀한 원자적 비용 예약은 아니며 변경하지 않았다. 재료 결측·크레딧 차단 시 기존 규칙 해설 또는 이전 문서를 보존한다.
