# 유입 태그 규약 — 「홍보가 실제로 앱 트래픽을 만들었나」에 답하기 위한 것

대표 지시(2026-08-26): 「실질적인 앱 트래픽을 늘려줘」
→ **늘었는지 세지 못하면 실질이 아니다.** 그래서 모든 홍보 링크에 태그를 붙인다.

## 링크 형태 (이것 말고 다른 건 쓰지 않는다)

| 앱 | 링크 |
|---|---|
| SIGNUM HQ | `signumhq.com/app?from=<태그>` |
| Undercurrent | `signumhq.com/app-uc?from=<태그>` |
| Why'd It Move? | `signumhq.com/app-wim?from=<태그>` |

## 태그

| 태그 | 어디 |
|---|---|
| `x_us` | X 미국 @signumhq 답글 |
| `x_jp` | X 일본 @signumhq_jp 답글 (일본어 청중) |
| `x_kr` | 한국어 청중을 겨냥한 답글. **계정 국적이 아니라 청중 시장 기준** —
          일본 계정(@signumhq_jp)으로 한국어 답글을 달아도 `x_kr` 을 쓴다.
          X 콘텐츠 언어는 로그인 계정과 무관하게 자유롭다(2026-08-26 실측) |
| `stocktwits` | StockTwits 종목 게시판 |
| `reddit` | Reddit (r/Daytrading Software Sunday 등) |
| `seo` | `/{locale}/flow/{ticker}` — 사이트가 이미 자동으로 붙인다 |
| `ph` | Product Hunt |
| `note` | note.com (일본 기사) |

규칙: `[a-z0-9_]{1,24}`. 벗어나면 «조용히» 집계에서 빠진다(`src/app/app/route.ts`).

## 어떻게 세어지나

`/app`·`/app-uc`·`/app-wim` 라우트가 `after()` 로 `mkt:attr:hit:<태그>:<ET날짜>` 를 증가시킨다.
Android 는 여기에 더해 Play install referrer(`utm_source=<태그>&utm_medium=smartlink`)까지 실려서
**Play Console 획득 보고서에서 «설치»까지** 연결된다. iOS 는 클릭까지만 보인다.

읽는 곳: `GET /api/admin/mkt/metrics` (관리자 게이트). `CHANNELS` 배열에 있는 태그만 반환한다 —
**새 태그를 쓰기 시작하면 그 배열에 먼저 넣을 것.** 안 넣으면 클릭은 쌓이는데 화면엔 0으로 보인다.

## 실패 기록

- 2026-08-26: 하루 12건을 붙이고 나서 확인해 보니 `CHANNELS` 에 `x_us`/`x_jp`/`seo` 가 없었다.
  링크에 태그 자체를 안 붙인 건도 많아서, 그날 오전 물량은 채널별로 되짚을 수 없다.
  → 그날 오후부터 태그 부착을 강제. 붙이기 전에 이 파일을 열 것.
