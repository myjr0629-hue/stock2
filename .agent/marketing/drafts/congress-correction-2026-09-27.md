# 의회 거래 «16명·192건» 정정 — 게시 대기 (2026-09-27)

## 무엇이 틀렸나 (실측)
- 게시 수치: «90 days to Sept 23: 16 members, 192 trades (58 buys, 134 sells) · median lag 25 days · 3 filings past 45 days»
- 실제로 센 것: `/api/flow/congress` 목록의 **상위 60종목**(순매수 추정액 절대값 순) × 종목당 **최대 40건** = 192행.
  - 같은 창의 종목은 **173개**(2026-09-27 API `count`) — 113종목이 통째로 빠졌다.
  - TKNO 는 68건(매수 1·매도 67) 중 40건만 실렸다(매도 28건 누락, `rows_complete:false`).
  - 원천 자체도 FMP `senate-latest`·`house-latest` **최신 250건씩**(page=0)만 받는다.
- «16명»도 부분집합 기준(9/27 재생성본은 같은 60종목에서 20명). 중앙값 25일·45일 초과 3건도 부분집합 값.
- 정확한 전체 수치는 수리 작업(원천 페이지 넘김 + API limit) 뒤에 확정 — 그 전엔 «더 많다»까지만 쓴다.

## 정정할 곳 (7)
| 채널 | 주소 | 방법 |
|---|---|---|
| X 본글 | https://x.com/signumhq/status/2103166699835166886 | 답글로 정정(편집 창 지남) |
| X 답글(@unusual_whales) | https://x.com/signumhq/status/2103130925219663992 | 답글로 정정 |
| X 일본 | https://x.com/signumhq_jp/status/2103243573995151842 | 일본어 답글 |
| 블루스키 | https://bsky.app/profile/signumhq.bsky.social/post/3mwblypeeyl2o | 답글 |
| Threads(프로필 고정) | https://www.threads.com/@signumhq_official/post/Ddri65CE53B | 답글 + 고정 해제 검토(앱 소개 글로 교체) |
| Medium(프로필 고정) | https://medium.com/@signum_hq/congress-filed-192-stock-trades-in-90-days-the-median-one-was-25-days-old-when-it-went-public-e954857333d9 | 본문 맨 위 «Correction (Sept 27)» + 제목에서 총계 제거 |
| LinkedIn 아티클 | https://www.linkedin.com/pulse/congress-filed-192-stock-trades-90-days-median-one-25-signum-hq-5qdcc/ | 같은 정정 문단 + 제목 |
| 데이터셋 | congress.html · CSV · JSON | `node scripts/congress-dataset.mjs` 재생성(커버리지 표기 들어감) → github-upload |

## 문구
**EN (X 답글, 가중 ≤280):**
Correction: the 16 members / 192 trades count (90 days to Sept 23) was a subset: only the 60 tickers with the largest estimated net flow (of 173 with filings) and up to 40 filings each. Real totals are higher; the 25-day median lag describes the subset only.

**EN (Bluesky·Threads 답글):** 위와 같은 문장.

**JA (X 일본 답글):**
訂正:「16人・192件」(9/23までの90日)は一部だけの集計でした。推定ネット金額の大きい60銘柄(届出のある173銘柄中)と、1銘柄最大40件のみを数えていたため、実際の件数はこれより多くなります。中央値25日もこの一部についての値です。

**Medium·LinkedIn 맨 위 문단:**
Correction (Sept 27): An earlier version of this article said Congress filed 192 stock trades in 90 days by 16 members. That count covered only the 60 tickers with the largest estimated net flow, out of 173 tickers with filings in the window, and at most 40 filings per ticker. The real totals are higher, and the median-lag and late-filing figures below describe that subset. We are rebuilding the dataset with full coverage and will update the numbers here.
