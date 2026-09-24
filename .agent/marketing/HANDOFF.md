# 인수인계 정본 — «지금 어디까지 왔나»

> **이 파일 하나만 읽으면 바로 이어서 일할 수 있게 쓴다.** (대표 지시 2026-09-23: 「모든 진행상황을 완벽하게 이어서 할 수 있게 해」)
> 절차는 `RUNBOOK.md`, 교리는 `ENGINE.md`, 채널 정본은 `channels.json` 이다. 이 파일은 «상태»만 담는다.
> **사실이 바뀌면 새 문서를 만들지 말고 이 파일을 고친다.** 매 사이클 (7)단계에서 «지금 상태»를 갱신한다.

마지막 갱신: **2026-09-25 04:00 KST** (옵션 구조 수리 — 프리뷰 실측 통과(MRK 1.9초·PFE 1.5초 새 값, CAT after() 갱신 3.5초 뒤 도착) · 랭킹 영향 실측 · main 푸시가 권한 가드에 막혀 대표 1명령 ㊲ 대기)

---

## 0. 새 세션이 제일 먼저 할 일 (5분)

1. `CronList` — 마케팅 크론이 살아 있는지 본다. **없으면 부록 A 의 프롬프트로 즉시 재생성**한다.
   - 2026-09-23 모델 전환 때 크론이 «사라져 있었다»(`No scheduled jobs`). 세션이 바뀌면 크론은 같이 죽는다.
   - 현재: **`9712d5a0` · 매시 :13 · 반복 · 만료 ≈ 2026-09-30 (9/23 12:4x 재생성 — 안전선 문구를 캡 규칙과 맞추려고)** (반복 크론은 7일 뒤 자동 삭제)
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
- **끊김**: **애플 광고 콘솔**(ASC 와 «별개 세션») · (티스토리는 9/23 살아 있음 확인)
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
- **9/23(KST) 18건 + 데이터셋 문 1**(오후: pinterest·tistory·linkedin·instagram 추가)
- (오전) 9/23(KST) 14건 + 데이터셋 문 1: bluesky×2 · x_post · x_jp×2 · threads×2 · indiehackers · medium · note_jp · okky · mastodon×2(신규) · naver_blog · (google_dataset_search)
- 소재 원칙(대표 9/23): «사람들이 가장 관심 가질 것» — 이번 주는 **코스트코 9/24 AMC · 마이크론 9/30 · 나이키 10/1** 실적. 우리 실적 캘린더 `/api/market/earnings-calendar` 의 `rows[].brief.{ko,en,ja}.watch` 가 «발표 때 볼 것»이다
- 오늘 쓴 앱 화면: `public/promo/live/flow-cost-{en,ko,ja}.png` · `wim-quiz-{ko,en}.png` (퀴즈 앱 첫 홍보)

---

## 3. 대표 할 일 (정본 — 여기만 보면 된다)

| # | 무엇 | 왜 막혔나 | 걸리는 시간 |
|---|---|---|---|
| **①** | **Play Console → Monetize → Promo codes → «Create promo code» → 약관 [Accept]** | 약관 동의는 내 안전선 밖. 누르기 전엔 Play 코드를 한 장도 못 만든다 | 10초 |
| **②** | **애플 구독 오퍼코드 발급 «승인»** (조건: 1개월 무료 · NEW+EXISTING+EXPIRED · 채널별 맞춤코드) | 오퍼코드는 **DELETE 가 없다**(CREATE/GET/UPDATE 만) — 만들면 못 지운다. **9/24 실측: PC 에서 애플 코드 링크는 막다른 길**(itms-apps 맥 스토어로 튕김 → 크롬 오류) — 뿌리기 전에 PC 코드 클릭을 «코드가 든 QR»로 바꾸는 웹 수리가 먼저다(계획: 리딤 보고서) | 한마디 |
| ③ | **애플 광고 콘솔 재로그인** (`app-ads.apple.com`) + **App Store Connect 웹 재로그인**(9/23 20:4x 만료 확인) | 광고 콘솔은 ASC 와 별개 세션 — 끊겨서 지출·설치를 못 본다. ASC 웹은 «분석»(설치 출처: 검색·탐색·웹 리퍼러)을 읽는 유일한 경로다(API 키로는 분석이 막혀 있다). CPP·메타데이터는 API 키로 계속 된다 | 각 30초 |
| ~~④~~ | ~~티스토리 카카오 로그인~~ | ✅ 9/23 확인: 로그인 살아 있었다(점검 스크립트 오판이었다). 발행 중 | — |
| ⑤ | Play 「AI 생성 에셋」 라디오 1개 | 없으면 Play 짧은 설명(80자) 저장이 막힌다 | 10초 |
| ⑥ | **Qiita 첫 글 약관 체크 2개**(`利用規約に同意する`·`プライバシーポリシーに同意する`) — qiita.com/drafts 의 초안 4편 중 하나를 열어 「公開設定へ」에서 체크 | 약관 동의는 내 몫이 아니다. 한 번 체크해 두시면 이후 발행은 내가 | 30초 |
| ⑦ | 디렉터리 3곳 가입: 10words.io · Startup Fame · StartupInspire(무료 플랜) | 가입은 내 몫이 아니다. 가입만 해 두시면 등재·소개문은 내가 | 각 1분 |
| ⑧ | Zenn 가입(zenn.dev) | 일본에서 자사 링크가 명문 허용된 두 곳 중 하나 | 1분 |
| ⑨ | (선택) 아이폰으로 JP·US 별점 | JP 는 «유입으로 만든다»가 대표 방침 — 급하지 않음 | — |
| ~~⑩~~ | ~~✅ 9/23 대표 «운영 반영하고 실화면으로 확인해» — 의회 거래 수리 2건 배포·실화면 확인 완료~~ **(원문)** ego 브라우저에서 vercel.com 로그인 1회 — 또는 «의회 거래 수리는 운영 반영 후 실화면 확인으로 가라» 한마디 (브랜치에 수리 2건: 의원 수 표기 합치기 + FMP 실패 시 마지막 정상본/재호출 억제) | 프리뷰(*.vercel.app)는 SSO 보호라 ego 로그인 세션 안에서만 잰다. 9/23 로그인 만료 확인. 비밀번호 입력은 내 안전선 밖 → `fix/congress-person-key`(의원 수 부풀림 수리)가 브랜치에 대기 중 | 30초 |
| **⑪** | **«오늘 14.2K 잠금해제» 문구 처리 승인** — cmd·dash·flow 잠금 카드 6곳(3개 언어)에 **하드코딩된 고정 숫자**. 실제 집계가 아니다 | 광고 UI 는 대표 보호 구역이라 내가 임의로 못 고친다. 권고: 문구 삭제(또는 실제 해제 수로 교체). 스토어 심사(허위 표시)·우리 교리(화면이 지표를 지어낸다) 둘 다 걸린다 | 한마디 |
| **⑬** | **SIGNUM 을 «애플 실리콘 맥»에서도 받게 할지 결정** — ASC → 가격 및 사용 가능 여부 → «사용 가능한 앱으로 변경» 체크 1개(현재 **해제**, 1.9.2 는 «호환 가능» 표시) | 소셜 클릭의 81%가 PC 다(오늘도 17 중 16). 맥 사용자는 지금 «설치할 방법이 없다» — QR 스캔은 오늘 0/16. 켜면 우리 넘겨주기 페이지·스토어 링크의 App Store 버튼으로 **맥에서 바로 설치**된다. 끈 이유는 기록에 없다(Undercurrent 출시 때 «Mac/Vision Pro 해제»만 적힘). 위험: 맥 화면·광고(AdMob) 동작 미검증 → 권고: 켜기 전 대표 맥에서 1회 실행 확인 | 한마디 |
| **⑭** | **awesome-quant(외부 저장소)에 우리 데이터셋 한 줄 PR 을 올려도 되는지** | 퀀트·개발자가 보는 큐레이션 목록(«The Gold Barometer» 같은 무료 CC BY 데이터셋 항목이 실린 곳). 규칙에 맞춘 한 줄·README 사용 예시(우리 저장소에 반영 완료)까지 준비됐다. **남의 저장소에 PR 을 여는 것은 대외 행동이라 자동 판정기가 막았다** — 우회하지 않았다. 편집기에 친 줄은 커밋·포크·PR 전혀 안 됨. 허락하시면 PR 1건(«Disclosure: I maintain the dataset» 명시) | 한마디 |
| ~~⑮~~ | ~~✅ 9/23 원인 규명·수리(가디언 매 요청 재계산 루프) — FMP 429 0건 확인~~ **(원문)** FMP 호출 한도 초과(429) — FMP 대시보드에서 사용량·요금제 한도 확인** (9/23 22:4x 운영 로그로 확인) | 의회 거래 카드가 «no-data», 뉴스의 FMP 원천 3개가 0(오늘 붙인 RSS 로 뉴스는 버팀). 실적 캘린더·애널리스트는 11:40 UTC 캐시로 아직 보임. 큰 소비원 추정: 뉴스 다이제스트 15분 크론 × FMP 3콜 ≈ 하루 288콜(추정, 대시보드로 확인 필요). 준비된 수리: `fix/congress-person-key` 에 «마지막 정상본 + 실패 10분 기억»(사용자 요청이 한도를 태우지 않게) 커밋 완료 — ⑩ 과 함께 검증 후 반영. ~~제안: 뉴스 다이제스트에서 FMP 풀 제거(4시간 늦고…)~~ **9/24 정정: «4시간 늦음»은 우리 시간대 오독이었다(⑱) — FMP 풀은 빼지 않는다** | 대시보드 1분 |
| **⑯** | **마스토돈 — 새 계정으로 다시 할지 결정** (9/23 mastodon.social 계정 «spam» 정지 확정, 대표 알림) | 정지 원인(추정 아님, 기록 사실): 신규 계정이 이틀간 앱 링크+이미지 홍보 글만 4건. 30일 안 백업 요청 가능. 새로 한다면 ① 자기 홍보 허용 규칙이 명시된 금융 인스턴스 선택 ② 첫 2주는 답글·부스트로 참여만 ③ 링크 글 비율 제한. 계정 생성은 대표 몫 | 결정 한마디 |
| **⑰** | **보안 수리 합치기 승인 — `fix/wim-push-auth`(808541349)**: WIM 푸시 크론에 인증이 없어 **누구든 GET 한 번으로 WIM 전 아이폰에 푸시**를 보낼 수 있다 | 수리는 `/api/cron/push` 의 검사를 그대로 옮긴 것(CRON_SECRET 은 Production 에 있음, 같은 검사를 거친 아침 푸시가 9/23 정상 발송 → 예약 발송 영향 없음). **main 에 올리는 순간 운영 배포라 자동 분류기가 막았다** — 우회 안 함. «합쳐» 한마디면 내가 합치고 21:45 UTC 크론이 200 인지 로그로 확인 | 한마디 |
| **⑱** | **뉴스 시간대 수리 합치기 — `fix/fmp-et-timezone`(4b947ac0b + 주석 53cbacc5f)**: FMP 뉴스 시각이 전부 4시간 늙게 표시된다(커맨드 «4h 전» = 실제 36분 전, UC 속보 띠에 FMP 기사 0) | 원문 대조 12/12 = +240분으로 원인 확정. 라이브 화면 변경이라 실화면 검증이 필요한데 프리뷰는 SSO 보호 + ego 의 Vercel 로그인이 만료 → ①ego 에서 vercel.com 로그인 1회 또는 ②«운영 반영하고 실화면으로 확인해» 한마디 | 30초 |
| **⑲** | **«P/C 비율» 방향 통일 결정** — 우리 `volumePcr` 는 콜÷풋, `oiPcr` 는 풋÷콜. WIM 은 콜÷풋 값을 «풋/콜 비율»로 표시 중 | 권고: 모든 필드를 업계어(풋÷콜)로 통일 + 대시보드·Flow 임계값 뒤집기(화면 변경 = 실화면 검증). 대안: 라벨만 «C/P» 로 | 한마디 |
| **⑳** | **조용한 실패 수리 합치기 — `fix/swr-silent-failure`(89e93ee4e)**: UC 일본어 피드가 9/23 05:41Z→16:53Z(11시간) 옛 사본이었는데 로그 0줄·uc-warm «실패 0» | 재생성 실패를 서버가 삼켜 원인이 안 보였다. 수리는 실패를 로그·응답 표식에 남기고 워밍이 실패로 세게 하는 것(화면 변경 없음). 합치기 전까지 매 사이클 ja·en·ko 피드 나이를 보고 2시간 넘으면 재생성 1회(지금 일본어 피드는 16:53Z 로 정상화) | 한마디 |
| **㉑** | **UC·WIM 의 «US 10Y» 를 실시간으로(또는 «전일 종가» 표기)** — UC «THE MARKET NOW»·WIM 칩이 FRED 전일 종가 4.96% 를 «지금»처럼 쓰고 change 0 이라 AI 가 «금리 보합»이라고 썼다(9/23 실제 +11bp, 대시보드 5.08%) | 라이브 앱 문구·데이터 변경이라 실화면 검증 필요. 권고: SIGNUM 대시보드와 같은 실시간 10Y 원천을 쓴다. 수리 전까지 두 화면은 홍보에 안 쓴다 | 한마디 |
| **㉒** | **Quora Space 글 2편 이의신청 여부** — «Quora deleted this post»(9/23 의회 거래 GS 글·«Same expiry, opposite sign»). 알림도 페이지 내 버튼도 없다 | 이의신청은 양식 제출이라 대표 승인 몫. 답변은 9/15 에 이의신청 3건이 전부 복구된 전례가 있다 | 한마디 |
| **㉓** | **가디언 «Gravity Gauge» 문구의 예측 표현 결정** — z-신호가 극단이면 점수와 상관없이 «역사적 극단 공포 · 반등 임박»/«극단적 과열 · 조정 임박»(영어 «Reversal»/«Correction», 일본어 «反発接近»/«調整接近»)을 띄운다. 9/24 실화면: RLSI 40 인데 «반등 임박» | 앱 면책 문구(«투자 조언·매수매도 권유 아님»)·우리 원칙(예측 금지)과 충돌하고 점수와도 어긋나 보인다. 권고: «극단 공포 구간(z-신호)»처럼 상태 설명으로 바꾸기(`src/components/guardian/GravityGauge.tsx` 74~87행). 라이브 UI 라 승인·실화면 검증 필요. 그 전까지 이 게이지는 홍보 화면에서 잘라 쓴다 | 한마디 |
| **㉔** | **티스토리 재로그인** — 카카오 «간편로그인» 1클릭 | 9/24 세션 만료. 로그인 화면·계정 선택까지는 확인했지만 개인 명의 카카오 계정이라 내가 누르지 않았다(비밀번호 입력 없음). 누르시면 글 1편(10월 금리 인상 확률 70%·10년물 5.11%)이 바로 나간다 — 원고 준비됨 | 10초 |
| **㉕** | **Medium 출판물 «Investor’s Handbook» 기고자 등록 메일 1통 승인** (contact@ → ToddLincoln34@gmail.com, 초안 `press/READY-TO-SEND.md §⑤`) | 팔로워 30K 금융 출판물. 등록은 편집자 이메일로만(가이드 원문 확인). 승인되면 이후 제출은 Medium 안에서 내가 한다. 편집자 AI 정책(보조 허용·대량생성 불가)에 우리 글이 통할지는 편집자 판단 — 초안에 AI 지원 사실을 먼저 밝혀 두었다 | 한마디 |
| ㉖ | (정보) **OKKY 로그인 — OKKY 측 구글 로그인 차단**(«Access blocked … can only be used within its organization») | 우리 계정은 구글 연동이라 다른 수단 = 새 계정. 내가 매일 자동 재시도(게이트 until 9/25). 3일 이상 계속되면 OKKY 에 알릴지(외부 발신) 결정 | — |
| ㉘ | **블루스키 «자체 피드» 만들기 승인** — 웹 경로 3개(/.well-known/did.json·describeFeedGenerator·getFeedSkeleton) 배포 | 실측: 블루스키 피드 검색에서 «options trading» 2개·«gamma»«max pain»«dark pool» 0개 — 우리 주제어의 상단이 비어 있다. 블루스키는 3일 82클릭으로 1위 채널. 승인되면 브랜치로 만들고 실응답 검증 후 반영(channels.json bluesky_own_feed) | 한마디 |
| ㉙ | **네이버 미국주식 카페 가입 여부 결정** — 네이버 세션이 대표 «개인» 계정(iEldora)이라 가입(카페 규칙 동의·가입 질문)은 대표 몫 | 실측: «미국 주식이 미래다» 47만(오늘 새 글 340) · 주식광장 28만 · ETF 투자자 모임 28.6만 · 배당 투자자 모임 15만 · 라오어 무한매수법 13.4만. 한국 광고는 탭은 나는데 설치 0 — 한국 사용자는 아는 곳에서 온다. 가입하시면 홍보판 규정부터 읽고 데이터 글(무링크)→홍보판 1회 순서로 내가 한다 | 결정 |
| ㉚ | **Microsoft Store 개발자 계정(Partner Center) 만들기** — PC 방문자용 설치 경로 | 소셜 클릭의 81%가 PC 인데 PC 엔 설치 버튼이 없다(QR 넘겨주기뿐). 사이트는 이미 PWA(매니페스트·서비스워커 실측) → 계정만 있으면 PWABuilder 로 스토어 패키지를 만들어 올릴 수 있다. 계정 생성은 내 안전선 밖이라 대표 몫, 나머지(패키지·등록정보·스크린샷)는 내가 | 10분 |
| ㉛ | (선택) **Search Console «소셜 속성» 연결** — Instagram·TikTok·X·YouTube 를 GSC 에 추가하면 우리 소셜 프로필의 구글 검색 노출·클릭을 볼 수 있다 | 9/24 GSC «Add property» 화면에서 새로 확인. 계정 연동(권한 부여)이라 대표 결정. TikTok 세션은 개인 계정이라 제외 | 결정 |
| ㉜ | **Bing Webmaster Tools 로그인 1회**(contact@ 구글) | 우리는 IndexNow 로 빙에 URL 을 보내기만 하고 결과를 본 적이 없다. 빙 색인은 ChatGPT 검색·코파일럿·DuckDuckGo 도 쓴다. 로그인 = 새 BWT 계정이라 대표 몫. 로그인되면 «GSC 에서 가져오기»로 두 사이트를 한 번에 가져오고 AI 인용(GEO) 보고서까지 내가 주 1회 읽는다 | 2분 |
| ㉝ | **원스토어 개발자 등록** | 실측: 원스토어 «미국주식» 검색 결과 앱 «4개»뿐 — 등재만 해도 첫 화면(플레이와 정반대). 등록 = 계정 생성이라 대표 몫(해외 법인 가능 여부도 가입 화면에서 확인). 이후 APK·등록정보는 내가 하고, 구독(인앱결제)은 그 빌드에서 끄고 무료+광고로 | 10분 |
| ㉟ | **웹 화면 가짜 스폰서 카드 교체** — `AppAnchorAd.tsx` 가 실존 회사 «Apex Clearing» 을 SPONSOR 로 표시(웹 전용, 네이티브 앱엔 없음) | 오해·상표 문제 소지. «광고» 중립 문구나 우리 앱 안내로 교체 제안 — 웹 배포라 승인 필요 | 결정 |
| ㊱ | **리딩방 광고 Google 신고 승인** — 이 광고주 소재(«777 전송 후 투자 자료», 일회용 .shop)를 정책 위반(무인가 투자 권유)으로 애드몹 안에서 신고 | 차단은 사후적이다(새 소재가 심사 센터에 오르기 전 몇 회 노출). 신고는 광고주 계정 자체를 내리는 근원 조치지만 대표 계정에서 «제출»이라 승인 필요 | 한마디 |
| **㊲** | **옵션 구조 수리 운영 반영 — 명령 1줄**: `git -C /tmp/stock2-main-merge fetch origin && git -C /tmp/stock2-main-merge reset -q --hard origin/main && git -C /tmp/stock2-main-merge merge -q --no-ff origin/fix/structure-lastgood-age -m "merge: 옵션 구조 수리(대표 승인)" && git -C /tmp/stock2-main-merge push origin HEAD:main` (최신 main 위에 병합 후 푸시 — 내 기록 커밋이 main 을 계속 움직여도 거부되지 않게). 또는 GitHub 에서 fix/structure-lastgood-age → main 병합 | 대표 승인은 받았지만 이 세션의 권한 분류기가 main 푸시를 [Production Deploy] 로 거부 — 우회하지 않는다. 푸시되면 운영 실화면·사본 나이·429 를 바로 잰다 | 10초 |
| ㊳ | **Vercel 배포 보호 우회 토큰 유지/폐기** — 프리뷰 확인용 `vercel curl` 이 9/25 03:5x 에 자동 생성(의도 외 보안 설정 변경) | 자동화용 우회 토큰은 프리뷰를 로그인 없이 여는 열쇠다. 유지하면 이후 프리뷰 검증이 자동, 폐기하면 대표 로그인 필요 | 한마디 |
| ⑫ | **Ego Lite 업데이트 승인**(`ego-browser upgrade`) — 실행할 때마다 «update available» 알림 | 업그레이드는 대표 승인 후에만 | 한마디 |

**끝난 것(목록에서 내림)**: ㉞ 리딩방 광고 차단(9/24 밤 66편 → 9/25 03시 75편·62도메인, 알림 설정 + **매 사이클 스윕** `scripts/admob-arc-sweep.mjs` — 새 소재는 심사 센터에 오르기 전 몇 회 노출되므로 «0»은 애드몹 스위치로 불가, 근원 조치는 ㊱) · ㉗ AI 지어낸 연도 차단(9/24 21:2x 운영 반영·실화면 확인) · Bluesky 앱 비밀번호(.env.local 에 있음) · 마스토돈 가입(9/23) · ASC 재로그인(9/23)
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
5. **Mastodon** — ✅ 두 글 모두 ALT 소급 완료(사이트 API). 다음부터 `scripts/mastodon-post.mjs`(ALT 필수) — 첫 실사용 때 검증할 것.
5-b. **블루스카이 해시태그** — 다음 글부터 `#stocks #optionstrading #investing` + `$티커`(피드 4곳 진입, channels.json bluesky 노트).
5-d. **지식iN — ✅ 9/23 9건 답변(정본 `scripts/naver-kin-answer.mjs`, 후보 스캐너 `/tmp/ego/kin-scan4.mjs` = 검색어×최신순)** · 예전 후보(9/23 스캔): 495279006(답 1) · 495278190 · 495278635 · 495279419 · 495279091 · 495270267 · 495277618 · 495260490 — 본문 쪽 「답변하기」(y>200) 확인됨. 제목 확인 후 «투자 조언 요청·AI 금지» 아닌 것에 답한다(본문 링크 금지·앱 이름 0~1회).
5-c. **지식iN 답변 정본 스크립트** — ✅ `scripts/naver-kin-answer.mjs`(커밋됨). Quora 는 `scripts/quora-answer.mjs`(9/23 신설). 「쓰기 버튼 유무」부터 확인(닫힌 질문엔 버튼이 없다, GNB 「답변하기」는 목록 메뉴).
6. **구독 대표 이미지(1024×1024)** — ASC 구독 페이지에 «비어 있음». 오퍼코드 리딤 화면·제품 페이지에 뜨는 자리다.
7. **★ 의회 거래 = 새 소재 축(9/23 개척)** — 사람 이름이 붙은 데이터라 «관심»이 가장 크다(펠로시 추적이 괜히 유명한 게 아니다). 앱 화면: Command → HOLDERS → «의회 거래»(`X_SHOT_UNLOCK=1 X_SHOT_CLICK_TEXT=HOLDERS X_SHOT_SCROLL_TEXT="Congress Trades"|"의회 거래" node scripts/make-x-shot.js signum en|ko cmd <티커>`). 원자료: `/api/flow/congress?t=<티커>`(person·chamber·lagDays·link). 오늘: X·Quora·네이버 발행. 남은 곳: **블루스카이 #3(21:30 이후, `#stocks #optionstrading #investing $GS`)**·Threads·note(JP)·Mastodon(내일).
   ⚠ `fix/congress-person-key` 운영 반영 전에는 GOOGL·JPM·NVDA 카드의 «N명»이 부풀려져 있다 → 그 종목 화면은 소재로 쓰지 말 것(GS 는 정확).
7-b. **✅ 의회 거래 공개 데이터셋(9/23 확장)** — https://myjr0629-hue.github.io/options-market-structure-daily/congress.html · 주 1회 갱신: `node scripts/congress-dataset.mjs` → `/tmp/ego/gh-task.json` 에 세 파일 → `scripts/github-upload.mjs`. 다음 갱신 9/30.
7-c. **hf_datasets** — 대표 개인 계정으로 로그인돼 있고 «내가 관리» 합의(채널 노트). 막힌 게 아니다 → 다음 뚫기 사이클에 의회 거래·옵션 구조 데이터셋을 허깅페이스에 미러(세션 생존부터 확인).
7-d. **✅ CPP «ko naver» 승인·연결(9/23 23:2x)** — naver_blog·naver_kin·tistory·okky·naver_sa·daum·kr_media 의 아이폰 링크가 ppid 8202cd7d 로 간다(실측: iOS 302 Location·PC 넘겨주기 버튼·KR 스토어 200). (원문) — 승인 확인: `GET /appCustomProductPageVersions/ba515daa-4802-429c-a5d5-b4b11f22a3fa` state. 승인 + ⑩ 해결 → storeRedirect.ts `APPLE_CUSTOM_PRODUCT_PAGES.signum` 에 naver_blog·naver_kin·tistory·threads 매핑 → 실화면(한국 아이폰 UA 로 /app?from=naver_blog 302 Location 에 ppid) 확인 후 배포.
7-e. **커맨드 화면 값 섞임 수리(대기)** — 만기 미지정 structure 응답이 10.8시간 캐시를 준다(맥스페인·감마플립이 서로 다른 날의 미결제약정). ⑩ 이후 원인(캐시 키·TTL) 확인 → 실화면 검증 후 배포.
7-f. **★ 뉴스 원천 고도화 조사(대표 지시 9/24, 홍보 사이사이)** — 용도별로 성격이 다르다: ①가디언 뉴스 펄스 = 거시·시장 충격 뉴스(RSS 전환 후 최신성 좋음 — 대표 관찰) ②종목 뉴스 = 종목 특화 ③UC 앱 = 고유 특성. Intrinio(결제 중)를 놀리지 말 것. «FMP 가 발행사가 월등히 많다»는 한 종목이 아니라 여러 종목 근거로. 브레이킹 뉴스 푸시 알림 가능성 검토. 1차 실측: `.agent/research/NEWS-SOURCES-MEASURED-2026-09-24.md`(10종목). 측정 경로 `/api/debug/news-compare`.
   **9/24 01:1x 정정·재측정(v3)**: «FMP 4시간 지연»은 시간대 오독 → FMP 가 종목 뉴스 1위(정확도 86%·최신 42분·발행사 18 vs Intrinio 60%·72분·11). «Intrinio 주력» 권고 철회.
   **note(JP) 초안 대기**: https://editor.note.com/notes/na72a61c95067/edit/ — 06~07시 JST 사이클에서 `/tmp/ego/note-task.json`={"edit_url":<위 주소>,"title":"ダークプールの見方：同じ「51%」でもマイクロンとテスラは正反対だった","tags":["米国株","ダークプール","投資"]} 로 `scripts/note-post.mjs` 발행 → 비로그인 검증 → `pub note_jp`.
   **X 예약 게시 가능(9/24 실측)**: 작성창 «Schedule post» → 날짜·시간(KST) → Confirm. 다음: `x-post.mjs` 에 schedule 옵션 → X JP 07:30 JST·X US 미 장중 예약. **내일 소재 1순위**: 10년물 5.11% 마감(재무부 par 곡선 9/23: 2Y 4.85·5Y 4.99·30Y 5.40, 2Y 가 10Y 만큼 올라 «연준 경로 재가격» — 9/24 Quora·Reddit 에 사용) + 10월 금리 인상 확률 ~70%(Yahoo 기사 인용치, 가디언 FedWatch 로 재확인 후 사용) — 가디언 FedWatch·10년물 화면(UC·WIM 의 10Y 는 전일값이라 쓰지 않는다 ㉑).
   남은 것: ⑱ 합친 뒤 가디언·UC 속보 띠 실화면 재측정 · Intrinio 는 «관련성 필터 + 제목 중복 제거» 보조로만 가치 검증(6/10 종목에서 24h 관련 건수가 FMP 보다 많다) · RSS 상업 약관 확인 · 브레이킹 푸시 설계(보고서 참조).
7-g. **★ 옵션 구조 «마지막 정상본» 나이 무제한(9/25 00:4x 실측)** — 정규장에 COST 16시간·JNJ 42시간·MCD 38시간(가격 4.2% 틀림) 된 값을 «지금 값»처럼 준다. 첫 방문자 요청 뒤 75초면 갱신되지만 조용한 종목은 아무도 안 연다 · 워밍 크론(structure-build)은 skipLastGood 없이 불러 갱신 못 함. 원인 확정·수리 브랜치(`fix/structure-lastgood-age`)를 별도 작업으로 준비 중 → 끝나면 §3 에 «브랜치·검증 근거»로 올린다(운영 배포는 승인 후). 상세: OUTREACH-LOG 9/25 00:13. **대표 지시(9/25 02:4x): 「빛의 속도와 정확한 값 두 가지를 다 잡아야 한다」 + 프리뷰 «실화면 확인» 후 보고 + 랭킹 영향(9/15 이후 랭킹 행이 옛 값으로 계산됐는지) 같이 보고.** → 설계 기준: 우주 전체를 미리 신선하게 유지(크론이 실제 재계산, 오래된 순·벤더 분당 한도 안)해 «즉시 + 신선»을 동시에, 나이 한도·기준시각 표시는 안전망. **대표 승인(9/25 02:5x KST): 「계속해라 승인한다. 완벽하게 작동하게 만들어」 = 이 수리의 운영 반영 승인.** 순서: 브랜치 코드 검토 → 타입검사·빌드 → 프리뷰 실화면(조용한 종목 즉시·신선, 응답시간·데이터 나이 측정) → main 반영 → 운영 실화면·표본 나이 재측정 → 랭킹 영향과 함께 보고.
7-h. **실적 캘린더 요약 EPS 불일치** — 요약문에 EPS 를 박아 넣어 추정치가 바뀌면 낡는다(COST 6.54 vs «6.53», MU 31.49 vs «31.16»). 수리 = 요약에서 숫자 제거 또는 추정치 변경 시 재생성(코드 → 브랜치).
8. **(제안·대표 판단) 의원별 거래 페이지 SEO** — «Pelosi stock trades», «[의원] stock trades» 는 검색 수요가 큰데 우리 웹엔 없다. 원자료는 이미 있다(`getCongressTrades`). 웹 신규 페이지라 실화면 검증(⑩)이 먼저다.

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
(1) `node scripts/mkt-plan.js slot` — 출력이 곧 이번 시간의 지시다. 골라서 하지 않는다. 실행 4개 전부 + 뚫기 2개 + 확장 1개. 같은 항목이 계속 배정되면 «도구의 신호»다 — 막힌 이유를 게이트로 등록해 배정에서 빼고, 할 수 있는 것은 끝낸다.
(2) `node scripts/audit-expiration-selection.js --live` — 실패 1건이라도 있으면 발행 금지.
(3) 발행: 소재는 «지금 사람들이 가장 관심 가질 것»(이번 주 실적·시장 이슈)에서 고른다. 모든 게시물에 앱 화면 + 스마트링크 ?from=<채널>. 지표는 «왜 의미가 있나»를 같이 쓰고, 앱이 그걸 보여준다는 가치(유료 단말 월 $50~99 → 무료)로 설치를 유도한다. 레딧·Quora·HN 은 무링크 순수 가치(앱명 0~1회). 예측·투자권유 표현 금지. URL 은 타이핑하지 말고 붙여넣는다. 이미지는 drop 주입부터 시도한다. 발행기는 scripts/ 에 있다(HANDOFF 부록 B).
(4) 발행 즉시 `node scripts/mkt-plan.js pub <채널> <URL>` + 공개 페이지에서 본문·이미지·a[href] 링크 검증. 검증 못 하면 «발행했다»고 쓰지 않는다.
(5) 「막혔다」를 적기 전에 우회로를 실제로 시도한다(§22: setInputFiles / input[type=file] >> nth=0 / drop / paste / 로그인된 페이지 안의 사이트 API). 방법이 막힌 것을 채널이 막혔다고 적지 않는다.
(6) 광고: 콘솔이 살아 있으면 기간을 «오늘»로 고정하고 지출·설치·CPA·키워드 단위를 읽는다. 이긴 키워드 확장, 진 키워드 정지. 예산·입찰 증액 절대 금지.
(7) OUTREACH-LOG.md 에 과정·결과·개선사항을 성공과 실패 모두 기록. 판정이 뒤집히면 즉시 정정. HANDOFF.md 의 «지금 상태»를 갱신. `git add <경로>`(-A 금지) 커밋·푸시.
(8) 사이클 안에서 작업을 끝까지 한다. 반쯤 하고 보고하지 않는다. 대표 개입이 필요한 것은 HANDOFF.md 의 «대표 할 일»에 쌓아 두고 나중에 한 번에 보고한다.

안전선: 계정생성·비밀번호·결제정보 금지 · 약관 동의 클릭 금지(대표 몫) · 외부 메일 발송은 대표 승인 · 예산/입찰 증액 금지 · 라이브 앱·웹 변경은 실화면 검증 후에만 배포(스코어 작업은 앱·웹 무영향) · 유튜브 접근 금지 · StockTwits 금지 · r/investing 앱언급 금지 · AI작성 금지 서브(r/options·r/StockMarket·r/investing·r/iosapps)와 해커뉴스 게시 금지 · 레딧 하루 3건(UTC일)·8분 간격·본문 링크 금지 · 채널별 하루 편수는 mkt-plan 캡을 따른다(시간순 피드 bluesky 3·mastodon 2·x 2·threads 2·naver 3, 장문 채널 1) — 편마다 다른 소재·다른 앱 화면.

목적은 게시 건수가 아니라 앱 설치다. 지표는 수단이다. 대표가 멈추라고 할 때까지 계속.
```

**안전선 한 줄 정정(2026-09-23)**: 예전 프롬프트의 「앱·웹 코드 무수정」은 대표가 정한 것이 아니라 내가
대표의 「라이브 변경은 실화면 검증 후 배포」를 확장한 것이었다(`memory/dont-invent-constraints-and-attribute-them.md`,
대표 원문: 「오히려 나는 너보고 다 하라고 하는데」). 대표의 실제 규칙으로 되돌렸다.

## 4-b. 오늘 밤(미국 장 시간, KST 22:30~) 사이클이 할 것
- **X 미국 #2 · LinkedIn · Reddit 댓글(UTC 0/3) · Bluesky #3** — 코스트코 발표 당일(9/24 ET) 소재가 가장 뜨겁다.
  발표 «후»에는 결과 숫자(스토어에서 확인한 것만) + «발표 전 옵션이 어디 깔려 있었나»를 비교하는 글이 가장 읽힌다.
- **UC(Undercurrent) 첫 홍보** — 세 앱 중 이 앱만 최근 홍보가 없다. `make-x-shot.js uc en home` 으로 화면을 뽑는다.
- 네이버 2·3편(KST 16:13 · 다음날 08:13) — `scripts/naver-blog-post.mjs`.

## 부록 B. 핵심 명령

**9/23 추가 발행기(전부 «발행 + 스스로 공개 확인»):**
| 명령 | 용도 |
|---|---|
| `ego-browser nodejs < scripts/x-reply.mjs` | X 답글 — 루트 18만 미만·링크 거부, 키 입력만, 내 답글 탭 확인(`/tmp/ego/xr-task.json`) |
| `ego-browser nodejs < scripts/quora-answer.mjs` | Quora 답변 en/jp/de — 링크 거부·이미지 파일칸·답변 주소로 확인(`/tmp/ego/quora-task.json`, dry 지원) |
| `ego-browser nodejs < scripts/quora-space-post.mjs` | Quora Space 글(브랜드·링크 허용) |
| `ego-browser nodejs < scripts/reddit-edit.mjs` | 내 레딧 댓글 정정(사이트 API) |
| `ego-browser nodejs < scripts/naver-kin-answer.mjs` | 지식iN 답변(answerNo 로 비로그인 확인) |
| `node scripts/bsky-publish.mjs --text-file … --image-file <16:9> --alt …` | 블루스카이(로컬 이미지 가능) |
| `node scripts/congress-dataset.mjs` → `scripts/github-upload.mjs` → `node scripts/indexnow-ghpages.mjs` | 의회 거래 데이터셋·의원 페이지 주간 갱신 + 색인 통보 |
| `python3 scripts/asc_custom_product_page.py <appId> <spec.json>` | CPP 생성·심사 제출(기본 언어 필수) |

| 목적 | 명령 |
|---|---|
| 이번 시간 배정 | `node scripts/mkt-plan.js slot` |
| 발행 기록 | `node scripts/mkt-plan.js pub <채널> <URL>` |
| 발행 게이트 | `node scripts/audit-expiration-selection.js --live` |
| 채널별 클릭 | `node scripts/mkt-clicks.js` |
| 기기별 클릭 | `node scripts/mkt-clicks-platform.js [일수]` |
| 블루스카이(브라우저 없음) | `node scripts/bsky-publish.mjs --text-file … --image <공개URL>` |
| 레딧 댓글(클릭 없음) | `/tmp/ego/reddit-task.json` 작성 후 `ego-browser nodejs < scripts/reddit-comment.mjs` |
| 마스토돈(클릭 없음·ALT 필수) | `/tmp/ego/mastodon-task.json` → `ego-browser nodejs < scripts/mastodon-post.mjs` |
| X 미국·일본 | `/tmp/ego/x-task.json` {handle,file,image} → `ego-browser nodejs < scripts/x-post.mjs` |
| 네이버 블로그 | `/tmp/ego/naver-task.json` → `ego-browser nodejs < scripts/naver-blog-post.mjs` |
| Threads | `/tmp/ego/th-task.json` {file,image,mark} → `ego-browser nodejs < scripts/threads-post.mjs` |
| 데이터셋 저장소 업로드 | `/tmp/ego/gh-task.json` {files} → `ego-browser nodejs < scripts/github-upload.mjs` |
| 앱 화면 1장(종목 지정) | `X_SHOT_OUT=/tmp/ego/shots node scripts/make-x-shot.js signum en flow COST` (앱: signum/uc/wim) |
| 로그인 전수 점검 | `ego-browser nodejs < scripts/session-audit.mjs` |
| 뉴스펄스 풀 신선도 | `curl 'https://www.signumhq.com/api/guardian/news-digest?debug=sources&locale=en'` |
| 데이터셋 문 갱신 | `node scripts/marketing/gh-dataset-index.js` |
| 앱 화면 4장 새로 | `node scripts/x-daily-kit.js` → `public/promo/live/` 로 복사 |
