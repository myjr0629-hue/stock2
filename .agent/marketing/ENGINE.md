# 마케팅 엔진 — 운영 정본 (2026-09-01)

> **목적은 하나 — 앱 설치.** 사이트 방문도, 조회수도, 팔로워도 목적이 아니다.

## 쓰는 법

```bash
node scripts/marketing-engine.js            # 채널 상태판
node scripts/marketing-engine.js next       # 오늘 할 일 (A형 먼저)
node scripts/marketing-engine.js blockers   # 대표 개입 필요한 것만
node scripts/marketing-engine.js links      # ?from= 태그 규칙 검사
```

정본은 **`.agent/marketing/channels.json` 한 곳**이다. 여기만 고치면 전부 반영된다.
채널을 추가할 때도 이 파일에 한 줄 넣는 것으로 끝난다.

## 왜 이렇게 나눴나 — 실측이 시킨 것

2026-09-01 전수 조사 결과:

| 채널 | 게시물 | 팔로워 |
|---|---:|---:|
| X 미국 | 181 | 5 |
| X 일본 | 145 | 3 |
| Bluesky | 639 | 23 |
| Instagram | 109 | 0 |
| TikTok | 2 | 0 |

**1,000편 넘게 자동으로 올려서 팔로워 31명.** 콘텐츠 문제도 프로필 문제도 아니다.
프로필은 대부분 이미 완비였다. 문제는 **청중이 없는 곳에 계속 올렸다**는 것이다.

그래서 채널을 «청중이 필요한가»로 나눈다.

### A — 수요형 (청중 불필요)
검색·디렉터리·Q&A·앱스토어. **이미 존재하는 수요를 받는다.**
팔로워 0이어도 오늘 올린 글이 내일 검색으로 사람을 데려온다.
→ **여기에 힘을 쓴다.**

### B — 알고리즘형 (팔로워 불필요)
YouTube Shorts·TikTok. 콘텐츠 품질만으로 배포된다.
실측 근거: Shorts KR **1.2만 조회** — 우리가 가진 유일하게 «작동한» 배포.

### C — 청중형 (팔로워 0이면 도달 0)
X·Bluesky·Threads·Instagram·Pinterest.
**우리 계정에 원글을 올리는 것은 금지한다.** 도달이 0이라 시간 낭비다.
대신 **청중이 이미 모인 곳에 답글로 간다.**

> 근거: Bluesky 에서 Unusual Whales 팔로워 **11.4만**, InsiderFinance 도 같은
> 내용을 매일 올린다. 우리 청중은 이미 거기 다 있다. 우리 계정에 올릴 게 아니라
> 그 대화에 들어가야 한다.

## 규칙 (어기면 성과가 조용히 사라진다)

1. **링크는 언제나 앱 스마트링크** — `/app`·`/app-uc`·`/app-wim`
   `?from=` 태그는 **`[a-z0-9_]` 만**. 하이픈을 쓰면 install referrer 가 통째로 죽는다.
   → `marketing-engine.js links` 가 자동 검사한다.
2. **공개 게시는 대표가 「올려」 할 때만.** 준비까지가 내 몫.
3. **한 채널 하루 1건.** 연속 게시는 서로를 잡아먹고 스팸으로 읽힌다.
4. **자동 다발 게시 금지.** Buffer 는 2026-09-01 영구 정지.
5. **예측형 표현 금지** — 「분수령」「~로 향한다」 같은 미래 암시 금지(법규).

## 채널을 추가하는 절차

1. `channels.json` 의 `candidates` 에 넣는다 (`why` 를 반드시 쓴다 — 왜 A형인지)
2. 규칙을 **먼저 읽는다** (AI 작성 금지·자기홍보 금지 서브가 있다)
3. 계정을 만든다 → `channels` 로 옮기고 `tier`·`tag`·`link` 를 채운다
4. 프로필은 `PROFILE-SPEC.md` 5칸 규격대로
5. 결과를 `OUTREACH-LOG.md` 에 기록하고 커밋

## 지금 막힌 것 (대표 1회면 풀림)

`node scripts/marketing-engine.js blockers` 로 항상 최신을 본다.

- **Instagram 프로필 링크** — 데스크톱 웹이 «모바일 전용»으로 잠금
- **LinkedIn 로그인** — reCAPTCHA
- **StockTwits** — House Rules 무기한 제재, 대표 확인 필요
