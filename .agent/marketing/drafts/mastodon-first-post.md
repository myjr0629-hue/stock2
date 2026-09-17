# 마스토돈 첫 글 — 대표 가입 즉시 발행 (초안 완성)

**막힌 이유** 계정 생성이 필요하고 안전선상 내가 만들 수 없다. **대표 가입만 하면 나머지는 내가 한다.**

## 인스턴스 권고
**`mastodon.social`** (범용·최대). 이유: 마스토돈은 «연합 타임라인 + 해시태그»로 팔로워 0에게도 도달하는데, 그 도달량은 인스턴스 규모에 비례한다. 금융 전용 인스턴스는 규모가 작아 범용이 낫다. 기술 독자를 노리면 `fosstodon.org` 가 차선이지만 우리 주제는 금융이라 범용이 맞다.
가입에 필요한 것: 이메일(`contact@signumhq.com`) + 표시이름 + 핸들. 핸들은 **`signumhq`** 로 맞춘다(다른 채널과 동일).

## 왜 이 채널인가 (실측 근거)
2026-09-17 실측에서 **블루스카이 글 한 편 = 18클릭(전 채널 1위)**, 레딧은 21일 60건 댓글로 5클릭이었다. 차이는 «구조»다 — 알고리즘 방송이 아니라 시간순·해시태그·연합 타임라인이 팔로워 0에게도 도달하고, **링크와 이미지가 감점 없이 붙는다.** 마스토돈은 그 구조가 같다(ActivityPub·시간순·링크 무감점·이미지 4장·본문 500자).

## 첫 글 본문 (486자 — 500자 한도 안. 처음 쓴 522자판은 한도를 넘어 줄였다)
```
I built a free app to answer one question: what actually happened in the US market today?

- Premarket and after-hours prices, with the session labeled, so you know what the % is against
- This week's earnings with the exact time: before the open or after the close
- A plain-language brief after every close
- Ten sectors, seventy names, plus futures, oil, gold and bitcoin

No account, no paywall. EN / KO / JA.

https://www.signumhq.com/app?from=mastodon

#stocks #investing #finance
```

## 첨부 이미지
`promo-shots/play/signum-dash-en-1080x1920.png` 1장 — **드롭 이벤트를 먼저 보내고 결과를 확인한 뒤** paste 를 쓴다(블루스카이에서 둘 다 먹어 3장 중복된 실측이 있다).
※ 영어판 `dash` 원본은 섹터 칸이 비는 결함이 재발한 적이 있다. 올리기 전에 **밴드 표준편차 자동검사 + 눈으로 한 장**을 반드시 통과시킨다(ENGINE §36).

## 프로필 (t184 규칙 적용 — 지표 나열 금지)
- 소개: `미국 증시를 3분에 · 무료, 가입 없이 · 한국어·영어·일본어` 의 영문판 → `The US market in 3 minutes. Free, no signup. EN / KO / JA.`
- 링크: `https://www.signumhq.com/app?from=mastodon_bio`

## 발행 후
1. `node scripts/mkt-plan.js pub mastodon <글 URL>`
2. 공개 페이지에서 본문·이미지·**링크가 실제로 클릭 가능한지** 확인(블루스카이는 facets 없이는 링크가 죽은 텍스트였다)
3. 24시간 뒤 생존 확인
