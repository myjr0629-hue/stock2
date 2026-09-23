# 인수인계 정본 — «지금 어디까지 왔나»

> **이 파일 하나만 읽으면 바로 이어서 일할 수 있게 쓴다.** (대표 지시 2026-09-23: 「모든 진행상황을 완벽하게 이어서 할 수 있게 해」)
> 절차는 `RUNBOOK.md`, 교리는 `ENGINE.md`, 채널 정본은 `channels.json` 이다. 이 파일은 «상태»만 담는다.
> **사실이 바뀌면 새 문서를 만들지 말고 이 파일을 고친다.** 매 사이클 (7)단계에서 «지금 상태»를 갱신한다.

마지막 갱신: **2026-09-23 03:xx KST** (Opus 5.5 전환 직후)

---

## 0. 새 세션이 제일 먼저 할 일 (5분)

1. `CronList` — 마케팅 크론이 살아 있는지 본다. **없으면 부록 A 의 프롬프트로 즉시 재생성**한다.
   - 2026-09-23 모델 전환 때 크론이 «사라져 있었다»(`No scheduled jobs`). 세션이 바뀌면 크론은 같이 죽는다.
   - 현재: **`a05cab72` · 매시 :13 · 반복 · 만료 ≈ 2026-09-30** (반복 크론은 7일 뒤 자동 삭제)
2. 이 파일 §3(대표 할 일)과 §4(다음 할 일)을 읽는다.
3. `node scripts/mkt-plan.js slot` 로 이번 시간 배정을 받는다.
4. 메모리 인덱스(`~/.claude/projects/-Users-eunhoon-Documents-Project-recipt/memory/MEMORY.md`)의 ★★★ 항목을 훑는다.

**저장소**: `~/.gemini/antigravity/scratch/stock2` (폴더명이 signum 이 아니라 **stock2**)
**브라우저**: ego lite 만 (`export PATH="/Applications/ego lite.app/Contents/Frameworks/ego Framework.framework/Versions/0.5.0.32/Helpers:$PATH"; ego-browser nodejs < 스크립트.mjs`). 크롬 MCP 금지.

---

## 1. 라이브 상태 (전부 실측)

| 항목 | 상태 | 확인 방법 |
|---|---|---|
| SIGNUM iOS | **1.9.2 READY_FOR_SALE** (app id 6783130444) | ASC API `appStoreVersions` |
| Why'd It Move? iOS | **1.0.4 READY_FOR_SALE** (6794356135) | 〃 |
| Undercurrent iOS | **1.0.7 READY_FOR_SALE** (6788779895) | 〃 |
| 애플 별점 | SIGNUM **US★5(1) · KR★5(2) · JP 0** / WIM **KR★5(1)** · US·JP 0 | `itunes.apple.com/lookup?id=…&country=…` |
| Play 별점 | SIGNUM 28일 평균 **5.00** · 총 사용자 5 | Play Console Monitor |
| 구독 | `com.signumhq.app.pro.monthly` **APPROVED** · 175개국 | ASC API |
| 뉴스펄스 | **10건 · 최신 26~77분** (9/23 수리 전 270~406분) | `/api/guardian/news-digest?locale=ko` |
| 스마트링크 | `/app?from=<채널>` · 폰은 스토어로 302 · **PC 는 «폰으로 넘겨주기» QR 페이지(200, no-store)** · `&code=<코드>` → 스토어 리딤 화면 | 5개 UA 실응답 확인(맥·윈도우·아이폰·안드로이드·미리보기봇) |
| 애플 광고 | JP 캠페인 켜짐(일 $5 상한), **콘솔 세션 끊김** → 오늘 지출 미확인 | `app-ads.apple.com` → idmsa 로 튕김 |

### 1-1. 로그인 상태 (2026-09-23 실측)
- **살아 있음**: X(@signumhq·@signumhq_jp) · Bluesky(CLI 앱비밀번호 포함) · Medium · IndieHackers · note · OKKY · Threads ·
  **Mastodon(@signumhq@mastodon.social, 신규)** · Reddit · Play Console · **App Store Connect(대표 9/23 재로그인)** · GitHub
- **끊김**: **애플 광고 콘솔**(ASC 와 «별개 세션») · 티스토리(카카오 로그인 필요)
- 전수 점검: `ego-browser nodejs < scripts/session-audit.mjs` → `SESSION-STATE.json`
- ⛔ **애드몹은 대표 «개인» 계정** — 주소로 열면 회사 계정의 «신규 가입» 화면이 뜬다. 자동으로 열지 않는다.

---

## 2. 성과 (실측, 2026-09-22 ET 기준)

### 2-1. 클릭 — `node scripts/mkt-clicks.js`
- **21일 합계 996 · 최근 3일 220**
- 3일 상위: home 71 · **bluesky 50** · **indiehackers 28** · medium 11 · note 9 · seo_darkpool 9 · okky 6 · x_us 5
- **가속 중**: indiehackers(3일 28 / 21일 32 → 거의 전부 최근) · bluesky · mastodon(첫 글 당일 1클릭)
- **건당 1 미만(투입 줄임)**: reddit 0.39 · naver_kin · x_reply · pinterest · threads · instagram

### 2-2. ★★★ 이번 주 가장 중요한 발견 — **클릭의 81%가 데스크톱이다**
`node scripts/mkt-clicks-platform.js 2` (9/22 배포한 기기별 집계):

| | 안드로이드 | iOS | 데스크톱 | 폰 비율 |
|---|---|---|---|---|
| **합계(2일 83클릭)** | 1 | 15 | **67** | **19%** |
| bluesky | 0 | 2 | 26 | 7% |
| indiehackers·note·medium·okky·x | 0 | 0 | **전부** | 0% |
| **home(자사 웹)** | 0 | **13** | 3 | **81%** |

**뜻**: 소셜 채널이 만드는 클릭은 거의 전부 PC 에서 온다. PC 에서 `apps.apple.com` 을 열면 **폰에 설치할 방법이 없다.**
그래서 «클릭 882 → Play 등록정보 열람 11 → 설치 7» 이 됐던 것이다. **발행을 늘려도 설치가 안 느는 기계적 원인**이다.
→ §4 의 1순위 작업(데스크톱 → 폰 QR 랜딩)이 이걸 푼다.

⚠ 이 수치는 처음에 bluesky 가 표에서 «빠진 채로» 나왔다. 스크립트가 bluesky 의 `tag`(bluesky_bio)만 봤기 때문이다.
2026-09-23 수리: id·tag·클릭캐시 태그의 합집합을 본다. **검사기가 «없다»고 하면 검사기부터 의심한다.**

### 2-3. 발행 — `PUBLISH-LEDGER.json`
- 누적 **140건 · 40개 채널**. 일별: 9/17 26 · 9/18 24 · 9/19 25 · 9/20 19 · 9/21 17 · 9/22 19
- **9/23(KST) 9건**: bluesky · x_post · x_jp · threads · indiehackers · medium(앱 화면 포함) · note_jp · okky · **mastodon(신규)**

---

## 3. 대표 할 일 (정본 — 여기만 보면 된다)

| # | 무엇 | 왜 막혔나 | 걸리는 시간 |
|---|---|---|---|
| **①** | **Play Console → Monetize → Promo codes → «Create promo code» → 약관 [Accept]** | 약관 동의는 내 안전선 밖. 누르기 전엔 Play 코드를 한 장도 못 만든다 | 10초 |
| **②** | **애플 구독 오퍼코드 발급 «승인»** (조건: 1개월 무료 · NEW+EXISTING+EXPIRED · 채널별 맞춤코드) | 오퍼코드는 **DELETE 가 없다**(CREATE/GET/UPDATE 만) — 만들면 못 지운다 | 한마디 |
| ③ | **애플 광고 콘솔 재로그인** (`app-ads.apple.com`) | ASC 와 별개 세션. 끊겨서 오늘 지출·설치를 못 본다 | 30초 |
| ④ | 티스토리 카카오 로그인 1회 | 세션 끊김 | 30초 |
| ⑤ | Play 「AI 생성 에셋」 라디오 1개 | 없으면 Play 짧은 설명(80자) 저장이 막힌다 | 10초 |
| ⑥ | (선택) 아이폰으로 JP·US 별점 | JP 는 «유입으로 만든다»가 대표 방침 — 급하지 않음 | — |

**끝난 것(목록에서 내림)**: Bluesky 앱 비밀번호(.env.local 에 있음) · 마스토돈 가입(9/23) · ASC 재로그인(9/23)
오래된 대표 몫 목록 `CEO-SIGNUP-LIST.md` 는 9/20 기준이라 낡았다 — **이 표가 정본이다.**

---

## 4. 다음 할 일 (우선순위)

1. **✅(2026-09-23 배포·검증) 데스크톱 → 폰 QR 랜딩** — 대표 지시가 아니라 내 판단으로 넣었다. 대표가 「QR 은 먼 말이냐」고 물었다 → 설명함. 원하지 않으면 되돌린다(`git revert` 한 번). 확인할 것: `mkt:attr:qr:*` 가 쌓이는지. 원래 설계: `/app` 에 데스크톱 UA 가 오면 스토어로 바로 보내지 말고
   «폰 카메라로 찍으세요» QR(내용: `signumhq.com/app?from=<원래태그>&via=qr`) + 스토어 버튼 2개를 보여준다.
   근거: 2-2 표(소셜 클릭 81% 데스크톱). 측정: QR 로 들어온 폰 클릭을 `mkt:attr:qr:<태그>:<날짜>` 로 따로 센다.
   라이브 변경이므로 **3개 기기 UA 로 실응답 확인 후** 배포. 미리보기 봇 분기(PREVIEW_BOT_RE)는 건드리지 않는다.
2. **리딤코드** — 대표 ①② 가 풀리는 즉시 실행. 계획 정본: `research/REDEEM-CODES.md` 하단 «2026-09-23 전면 실측».
   준비 완료: 페이로드 검증(가격점만 넣으면 됨) · `/app?code=` 한 줄 링크 배포·검증 · 코드 클릭 별도 집계(`mkt:attr:code:*`).
3. **MacRumors 136** — 애플 **앱 프로모션 코드 100장 남음**(v1.9.2, ASC → 성장 및 마케팅 → 프로모션 코드).
   136번 스레드는 «프로모코드 전용»이라 지금까지 못 쓰던 자리다. 규칙: `memory/macrumors-dev-forum-rules.md`.
4. **앱 안 «코드 사용» 버튼** — RevenueCat `presentCodeRedemptionSheet()` 가 SDK 에 이미 있다(미연결). 다음 빌드 후보.
5. **Mastodon 이미지 ALT** — 첫 글은 ALT 없이 나갔다. 다음 글부터 게시 «전» 썸네일 ALT 배지 → 모달의 «큰» textarea.
6. **구독 대표 이미지(1024×1024)** — ASC 구독 페이지에 «비어 있음». 오퍼코드 리딤 화면·제품 페이지에 뜨는 자리다.

---

## 5. 이번 주 새로 배운 함정 (다시 밟지 말 것)

| 함정 | 증상 | 대처 | 메모리 |
|---|---|---|---|
| URL 을 타이핑 | 편집기가 `https://` 를 `https😕 /` 로 바꿔 링크가 죽는다(200 OK 로 올라가서 조용하다) | `text/plain` paste 또는 `execCommand('insertText')` · 검증은 `a[href]` | paste-urls-never-type-them |
| 파일창 경로 | ego 에서 `waitForFileChooser` 는 열리기만 하고 삽입 안 됨 | **drop 주입 먼저**(base64 → File → DataTransfer, 1MB 이상은 `sips -Z 1200`) | medium-editor-driving-via-ego |
| 벤더 뉴스 | FMP 뉴스 전 엔드포인트가 **4시간 지연** | 공개 RSS 원본(CNBC 6분·MW 8분·Yahoo 9분·Google News 1분) | vendors-repackage-public-originals |
| 신선도만 조이면 | 정치자금·건강 기사가 1위로 | «시장 유의미성»을 두 번째 하드 요건으로 | 〃 |
| 오류 화면 = 실패? | 마스토돈 `/auth/acceptance` 500 인데 **계정은 만들어져 있었다** | 공개 API `accounts/lookup?acct=` 로 확인 | — |
| 콘솔 페이지가 빈다 | ASC 프로모션 코드 화면이 iframe 안에 그려진다 | `iframe.contentDocument` 로 읽는다 | — |
| 기록을 안 읽음 | 이미지 넣는 법을 30분 재발견 | **작업 전 메모리 grep** | read-my-own-records-before-acting |

---

## 부록 A. 크론 재생성 — 이 프롬프트를 그대로 `CronCreate(cron: "13 * * * *", recurring: true)`

```
마케팅 사이클(매시). 저장소 ~/.gemini/antigravity/scratch/stock2. 브라우저는 ego lite 만.

시작 전 반드시 읽는다: .agent/marketing/HANDOFF.md (지금 어디까지 왔나 — 인수인계 정본) · .agent/marketing/RUNBOOK.md (절차 정본) · .agent/marketing/ENGINE.md (교리 §1~§22).

절차:
(0) CronList 로 이 크론의 7일 만료가 가까운지 본다. 가까우면 그 자리에서 재생성한다. ScheduleWakeup 은 쓰지 않는다 — 깨우는 경로는 이 크론 하나뿐이다.
(1) `node scripts/mkt-plan.js slot` — 출력이 곧 이번 시간의 지시다. 골라서 하지 않는다. 실행 4개 전부 + 뚫기 2개 + 확장 1개.
(2) `node scripts/audit-expiration-selection.js --live` — 실패 1건이라도 있으면 발행 금지.
(3) 발행: 모든 게시물에 앱 화면 또는 앱 카드 + 스마트링크 ?from=<채널>. 레딧·Quora·HN 은 무링크 순수 가치(앱명 0~1회). 예측·투자권유 표현 금지. URL 은 타이핑하지 말고 붙여넣는다(편집기가 https:// 를 깨뜨린다). 이미지는 drop 주입부터 시도한다.
(4) 발행 즉시 `node scripts/mkt-plan.js pub <채널> <URL>` + 공개 페이지에서 본문·이미지·a[href] 링크 검증. 검증 못 하면 «발행했다»고 쓰지 않는다.
(5) 「막혔다」를 적기 전에 우회로를 실제로 시도한다(§22: setInputFiles / input[type=file] >> nth=0 / drop / paste). 방법이 막힌 것을 채널이 막혔다고 적지 않는다.
(6) 광고: 콘솔이 살아 있으면 기간을 «오늘»로 고정하고 지출·설치·CPA·키워드 단위를 읽는다. 이긴 키워드 확장, 진 키워드 정지. 예산·입찰 증액 절대 금지.
(7) OUTREACH-LOG.md 에 과정·결과·개선사항을 성공과 실패 모두 기록. 판정이 뒤집히면 즉시 정정. HANDOFF.md 의 «지금 상태»를 갱신. `git add <경로>`(-A 금지) 커밋·푸시.
(8) 사이클 안에서 작업을 끝까지 한다. 반쯤 하고 보고하지 않는다. 대표 개입이 필요한 것은 HANDOFF.md 의 «대표 할 일»에 쌓아 두고 나중에 한 번에 보고한다.

안전선: 계정생성·비밀번호·결제정보 금지 · 약관 동의 클릭 금지(대표 몫) · 예산/입찰 증액 금지 · 라이브 앱·웹 변경은 실화면 검증 후에만 배포(스코어 작업은 앱·웹 무영향) · 유튜브 접근 금지 · StockTwits 금지 · r/investing 앱언급 금지 · AI작성 금지 서브(r/options·r/StockMarket·r/investing·r/iosapps)와 해커뉴스 게시 금지 · 레딧 하루 3건(UTC일)·8분 간격·본문 링크 금지 · 한 채널 하루 1편.

목적은 게시 건수가 아니라 앱 설치다. 지표는 수단이다. 대표가 멈추라고 할 때까지 계속.
```

**안전선 한 줄 정정(2026-09-23)**: 예전 프롬프트의 「앱·웹 코드 무수정」은 대표가 정한 것이 아니라 내가
대표의 「라이브 변경은 실화면 검증 후 배포」를 확장한 것이었다(`memory/dont-invent-constraints-and-attribute-them.md`,
대표 원문: 「오히려 나는 너보고 다 하라고 하는데」). 대표의 실제 규칙으로 되돌렸다.

## 부록 B. 핵심 명령

| 목적 | 명령 |
|---|---|
| 이번 시간 배정 | `node scripts/mkt-plan.js slot` |
| 발행 기록 | `node scripts/mkt-plan.js pub <채널> <URL>` |
| 발행 게이트 | `node scripts/audit-expiration-selection.js --live` |
| 채널별 클릭 | `node scripts/mkt-clicks.js` |
| 기기별 클릭 | `node scripts/mkt-clicks-platform.js [일수]` |
| 블루스카이(브라우저 없음) | `node scripts/bsky-publish.mjs --text-file … --image <공개URL>` |
| 레딧 댓글(클릭 없음) | `/tmp/ego/reddit-task.json` 작성 후 `ego-browser nodejs < scripts/reddit-comment.mjs` |
| 로그인 전수 점검 | `ego-browser nodejs < scripts/session-audit.mjs` |
| 뉴스펄스 풀 신선도 | `curl 'https://www.signumhq.com/api/guardian/news-digest?debug=sources&locale=en'` |
| 데이터셋 문 갱신 | `node scripts/marketing/gh-dataset-index.js` |
| 앱 화면 4장 새로 | `node scripts/x-daily-kit.js` → `public/promo/live/` 로 복사 |
