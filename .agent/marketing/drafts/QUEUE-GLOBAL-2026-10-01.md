# 10/1(KST) 전 세계 게시 대기열 — 13시 회차(9/30) 준비본

> 대표 지시(9/30 11시대) «전 세계를 뒤져 설치를 극단적으로». 코디네이터 13시 초점: 인도·필리핀·독일·브라질·일본·한국·미국.
> 이 파일은 **대기열(누가·언제·어디에·무엇을)**이고, 안드로이드 위젯 원고 원문은 `READY-android-widget-2026-10-01.md` 를 그대로 쓴다(중복 금지).
> 9/30(KST) 캡은 전부 소진 — 아래는 전부 10/1 캡이다. 레딧은 **UTC 10/1** 3자리(= KST 10/1 09:00 ~ 10/2 08:59). UTC 9/30 마지막 자리(05:00 KST MU 직후)는 별도·이 파일 밖.

## 0. 게시 직전 공통 게이트 (하나라도 실패하면 그 편은 싣지 않는다)
1. `node scripts/audit-expiration-selection.js --live` 실패 0.
2. 글에 쓰는 종목마다 `node scripts/audit-structure-vs-nasdaq.js <티커>` — ✗ 종목의 수치 금지. 감마 플립은 `gammaFlipType === 'EXACT'` 일 때만.
3. **안드로이드 위젯**: 글에 «안드로이드/Android/Android端末» 명시 · «30분마다 갱신» — «실시간» 금지 · **iOS 위젯 언급·약속 금지**(1.10.0 심사 중).
4. 예측·권유 표현 0(«오른다/반등 임박/매수» 류) · 가치 문장(유료 옵션 단말 월 $50~99 → 무료·가입 없음) · 무료 내 종목 5개(PRO 100) — «무제한» 금지.
5. 링크는 **붙여넣기**(타이핑 금지) · 스마트링크 `?from=<태그>` · 레딧 본문 링크 0 · 게시 즉시 `node scripts/mkt-plan.js pub <채널> <URL>` + 비로그인 공개 페이지에서 본문·이미지·a[href] 검증.
6. 수치 자리표시 `{…}` 는 게시 직전 운영 API 로 채운다: 가격·시간외 = `/api/live/ticker?t=<티커>`(`extended.postChangePct`·`flow.callWall/putFloor/maxPain`) · 예상 변동 = `src/lib/impliedMove.ts` 정의(ATM 스트래들 중간값 — 벽 폭·전일 종가 금지, 메모리 implied-move-one-definition).

## 1. 나라별 한눈표 (본글 18편 + 답글·지식iN 별도)

| 나라 | 편수 | 채널(캡) | 소재 |
|---|---|---|---|
| 🇺🇸 미국 | 5 | x_post ×2(2/2) · bluesky ×2(계정 3 중) · medium ×1 | 위젯(EN) · MU 실적 직후 · NKE 실적 당일 · 제작기 |
| 🇮🇳 인도 | 1 (+x_post 위젯을 IST 저녁에) | reddit r/IndiaInvestments «Show II» | 위젯 + 미국주식 옵션 레벨(제작자 공개) |
| 🇵🇭 필리핀 | 1(조건부) | reddit r/phinvest | PH 시간으로 본 미국 실적 시즌 + MU 데이터(앱명 0) |
| 🇩🇪 독일 | 1 | reddit r/Finanzen «Tägliche Diskussion» | MU 데이터 댓글(독일어, 앱명 0) |
| 🇧🇷 브라질 | 1 | bluesky(포르투갈어, 계정 3 중) | 안드로이드 위젯 «widget ações android» |
| 🇯🇵 일본 | 4 | x_jp ×2(2/2) · threads_jp ×1(계정 2 중) · note_jp ×1 | 위젯(JA) · MU 실적 |
| 🇰🇷 한국 | 5 | threads ×1(계정 2 중) · naver_blog ×3(3/3) · tistory ×1 | 위젯 · MU 실적 · NKE 실적 당일 |

계정 합계 확인: bluesky_acct 3 = MU(EN)+브라질(PT)+제작기(bip) · threads_acct 2 = 한국어 위젯+일본어 MU · x_us_acct 2 · x_jp 2 · naver 3 · reddit UTC 3.

## 2. 시간표 (KST · 현지)

| KST 10/1 | 채널 | 나라 | 무엇 | 이미지 | 태그 |
|---|---|---|---|---|---|
| 00:13~03:13 | x_post | 미국·인도(IST 20:43~23:43 9/30) | READY §EN-X(위젯) | widget-crop-en.png | x_us |
| 05:13~07:00 | x_jp | 일본 | READY §JA-X(위젯) | widget-crop-ja.png | x_jp |
| 05:13~08:59 | note_jp | 일본 | READY 표의 note_jp(위젯 사용기 «株価 ウィジェット android おすすめ») | widget-play-ja-1080x2160.png + crop | note |
| 06:13 | bluesky | 미국(ET 17:13 9/30) | §3-A MU 직후(EN) | MU 앱 화면(ko 아님 — en 캡처) | bluesky |
| 07:13 | threads | 한국 | READY §KO-TH(위젯) | widget-crop-ko.png | threads |
| 07:20~08:59 | threads_jp | 일본 | §3-B MU(JA) | MU 앱 화면(ja) | threads_jp |
| 07:30~08:59 | x_jp | 일본 | §3-C MU(JA 짧게) — 위 x_jp 와 다른 소재·다른 화면 | MU 앱 화면(ja) | x_jp |
| 08:13 | bluesky | 브라질(BRT 20:13 9/30) | §3-D 포르투갈어 위젯 | widget-crop-en.png(앱 UI 영어) | **bluesky_pt**(이번 회차 등록) |
| 08:13 | naver_blog | 한국 | READY 표의 naver_blog(«주식 위젯 안드로이드» — 얇은 문 먼저 실측) | widget-play-ko + crop | naver_blog |
| 10:13~19:59 | tistory | 한국(다음·구글) | READY 표의 tistory(위젯 크기 3가지 비교 — 네이버와 다른 앵글) | widget-crop-ko | tistory |
| 12:13 | naver_blog | 한국 | §3-E MU 실적 정리(KO) | MU 앱 화면(ko) | naver_blog |
| 16:13 | naver_blog | 한국 | §3-F NKE 실적 당일(KO) | NKE 앱 화면(ko) | naver_blog |
| 16:30 (UTC 07:30 · CEST 09:30) | reddit | 독일 | §3-G r/Finanzen 일일 스레드 데이터 댓글 | 없음 | (링크 없음) |
| 21:00 (UTC 12:00 · PHT 20:00) | reddit | 필리핀 | §3-H r/phinvest(조건부 — 아래 배치 규칙) | 없음 | (링크 없음) |
| 22:13 | medium | 미국 | READY 표의 medium(제작기 «I put options levels on an Android home-screen widget», AI 지원 표시) | widget-play-en + crop | medium |
| 22:40 (ET 09:40) | x_post | 미국 | §3-I NKE 실적 당일(EN) | NKE 앱 화면(en) | x_us |
| 23:13 | bluesky | 미국 | §3-J 제작기(#buildinpublic) | widget-crop-en.png | bluesky_bip |
| 23:30 (UTC 14:30 · IST 20:00) | reddit | 인도 | §3-K r/IndiaInvestments «Show II» | 없음 | (링크 없음) |

앱 화면 캡처: `scripts/ego/app-shot.mjs`(작업 파일 `~/signum-ego-io/<날짜>/shot-task.json`, 예 `{"path":"/en/app-view/…","out":"…/mu-en.png"}`) — 게이트 통과 종목만, 시뮬레이터 스트리밍 금지.

## 3. 새 원고 (READY 에 없는 것)

### 3-A. bluesky — MU 직후(EN, 06:13 KST)
```
Micron reported after the close. The options market had priced about ±{MU_IMPLIED}% by this week's expiry (ATM straddle). After hours: {MU_AH}%.

Open interest going in: call wall ${MU_CW}, put floor ${MU_PF}, max pain ${MU_MP}.

Free, no sign-up: https://signumhq.com/app?from=bluesky&l=en
```
- 길이: 예시 값(±7.6%·+10.2%·$1100/$1000/$1000)으로 270자 — 블루스키 300자 안(URL 포함 셈). 시간외 값이 없으면(발표 지연) 이 편은 NKE 로 바꾸지 말고 07시 이후로 미룬다.

### 3-B. threads_jp — MU(JA, 07:20~)
```
マイクロン（MU）決算は引け後に発表。発表前にオプション市場が織り込んでいた値幅は約±{MU_IMPLIED}%（ATMストラドル）。時間外は{MU_AH}%。

発表前に建玉が集まっていたのは、コールウォール${MU_CW}・プットフロア${MU_PF}・マックスペイン${MU_MP}。

有料端末で月50〜99ドルのデータを、無料・登録不要で
https://signumhq.com/app?from=threads_jp&l=ja
```
- 주제 태그 1개 `#米国株`. 금지어(ENGINE §14) 없음 확인.

### 3-C. x_jp — MU(JA 짧게, 07:30~)
```
MU決算：織り込み±{MU_IMPLIED}% → 時間外{MU_AH}%。
発表前の建玉はコールウォール${MU_CW}／プットフロア${MU_PF}。
米国株のオプション水準を無料・登録不要で👇
https://signumhq.com/app?from=x_jp&l=ja
```

### 3-D. bluesky — 브라질(PT, 08:13 KST = BRT 20:13)
```
Novo no Android: widget na tela inicial para suas ações dos EUA.

Preço e posição de cada ação entre o put floor e o call wall (strikes com mais opções em aberto), a cada 30 min. App em inglês.

Terminais cobram US$ 50–99/mês. Aqui: grátis, sem cadastro.
https://signumhq.com/app?from=bluesky_pt
```
- 295자(URL 포함) — 300자 한도 안, 해시태그를 붙이면 넘는다 → 해시태그 없이. «App em inglês» 는 일부러 넣었다(포르투갈어 UI 없음 — 기대와 다른 설치는 나쁜 평점이 된다).
- 태그 `bluesky_pt` 는 이 회차에 channels.json·mkt-plan ACCOUNTS(bluesky_acct)에 등록했다 — 다른 태그를 쓰지 말 것.

### 3-E. naver_blog — MU 실적 정리(KO, 12:13)
- 제목 후보(발행 전 블로그 탭 상위 30 제목 실측 → 얇은 문만): «마이크론 실적 발표 후 시간외 {MU_AH}% — 옵션 시장이 미리 반영한 폭 ±{MU_IMPLIED}%와 비교» / «마이크론 실적 옵션 예상 변동폭»
- 본문: ① 발표 시각(한국 10/1 05:00) ② 옵션 시장 예상 변동(뜻 — ATM 스트래들) vs 실제 시간외 ③ 발표 전 콜월·풋플로어·맥스페인 위치(뜻 한 줄씩) ④ «이 숫자가 왜 의미 있나»(과거 실적 때 실제 변동이 예상 범위 안이면 «이미 반영») ⑤ 앱 가치 + `https://signumhq.com/app?from=naver_blog&l=ko` · 카테고리 «투자»·주제 «비즈니스·경제»(발행기 강제).

### 3-F. naver_blog — NKE 실적 당일(KO, 16:13)
- 제목 후보(실측 뒤): «나이키 실적 발표일 옵션 예상 변동폭 ±{NKE_IMPLIED}% — 콜월·풋플로어 위치»
- 본문: 발표 시각(한국 10/2 05:15 전후 — 회사 공지로 확인) · 예상 변동 · 레벨 · 지난 분기 실제 변동(우리 기록이 있을 때만) · 앱 가치·링크. 예측 문장 금지.

### 3-G. reddit — 🇩🇪 r/Finanzen «Tägliche Diskussion – October 01, 2026»(독일어, 앱명·링크 0)
규칙 원문(9/30 12:0x, about/rules.json): «Keine unabgesprochene Werbung … Links zu eigenen Blogbeiträgen» · «Nur Deutsch oder Englisch» · «Kein Spam» · AI 금지 조항 없음.
```
Kurz zu Micron (MU), weil einige hier den Wert im Depot haben: Die Zahlen kamen gestern nach US-Börsenschluss (bei uns 22:00 Uhr MESZ). Der Optionsmarkt hatte vorher über den At-the-money-Straddle der nächsten Laufzeit rund ±{MU_IMPLIED} % eingepreist; nachbörslich stand die Aktie bei {MU_AH} %. {MU_INSIDE_DE}

Vor den Zahlen lag das größte Call-Open-Interest bei {MU_CW} $, das größte Put-Open-Interest bei {MU_PF} $.

Keine Anlageberatung, nur die Zahlen.
```
- `{MU_INSIDE_DE}` = «Also im Rahmen dessen, was eingepreist war.» 또는 «Also deutlich mehr als eingepreist.»
- ⚠ **활동량이 낮다**(9/25~9/30 일일 스레드 댓글 9·0·8·8·2·0 — 13시 실측). 기대 도달이 작다. 대안: r/mauerstrassenwetten «Tägliche Diskussion»(9/30 2시간에 10댓글, 활발) — 단 «Accountalter und Karma»(계정 나이·카르마 기준, 위키) + «Keine Eigenwerbung». 우리 계정이 기준을 넘는지 모르면 r/Finanzen 에 낸다.

### 3-H. reddit — 🇵🇭 r/phinvest(영어, 앱명·링크 0) — **조건부 배치**
규칙 원문: Rule 3 «Posts should be relevant to Philippine investors» · Rule 4 자기 홍보 «permitted, but only if Rule 1 … maintained» · Rule 8 «Ads are not allowed» · AI 금지 없음.
- ⚠ 주간 «Weekly Random Discussion Thread»(1wrzmmb)는 **52시간에 댓글 1개** — 죽은 자리다. 거기엔 달지 않는다.
- 배치 규칙: 게시 시점에 `r/phinvest` 새 글 중 **24시간 안·댓글 5개 이상·미국주식/해외 브로커 주제**(예: 9/22 «Dragonfi Global Access» 57댓글, «Why is the PH SEC making access to IBKR so difficult?» 34댓글 같은 종류)가 있으면 거기에 답한다. 없으면 **이 자리를 쓰지 않고** UTC 10/1 20:15 이후 NKE 실적 데이터 댓글(WSB 일일 «What Are Your Moves Tomorrow» 등, 우리 댓글 없는 스레드)로 돌린다.
```
For anyone here holding US names through earnings season, one practical thing in PH time: until the US clocks change on Nov 1, the regular session runs 9:30 PM–4:00 AM PHT (10:30 PM–5:00 AM after that). "After the close" reports come out around 4:00–4:30 AM PHT, so the move usually happens while we're asleep and shows up first in after-hours trading.

A quick sanity check before holding through a report is how much the options market has already priced in. For Micron this week the at-the-money straddle implied about ±{MU_IMPLIED}%; the stock moved {MU_AH}% after hours. When the actual move lands inside that range, a big-looking headline was mostly priced in.

Not advice, just how I read the numbers.
```

### 3-I. x_post — NKE 실적 당일(EN, 22:40 KST = ET 09:40)
```
Nike reports after today's close. The options market prices about ±{NKE_IMPLIED}% by Friday's expiry (at-the-money straddle).

Where open interest is stacked: call wall ${NKE_CW}, put floor ${NKE_PF}, max pain ${NKE_MP}.

Options terminals charge $50–99/mo. Free, no sign-up:
https://signumhq.com/app?from=x_us&l=en
```
- X 가중 길이: 예시 값(±8.1%·$80/$70/$75)으로 271/280 — 여유가 작다. 가격 자릿수가 늘면 «(at-the-money straddle)» 를 «(ATM straddle)» 로 줄인다.

### 3-J. bluesky — 제작기(#buildinpublic, 23:13)
```
Shipped an Android home-screen widget for our US-stock watchlist. The hard part: what fits in a 4×2 tile — price, % change and one bar from put floor to call wall, max pain marked.

Refreshes every 30 min.

#buildinpublic
https://signumhq.com/app?from=bluesky_bip
```
- 263자. 사실 확인: 크기 2×2·4×2·4×4, 30분 갱신(android/app/src/main/res/xml/widget_info_*.xml·WorkManager) — READY §1.

### 3-K. reddit — 🇮🇳 r/IndiaInvestments «Show II : Promotional Content thread for September 2026»(1wn6wgp)
- READY §EN-IN-RD 그대로(**앱명 1회로 줄여 둠** — 13시 회차가 마지막 줄 «Search "SIGNUM HQ" on Google Play.» → «It's on Google Play under that name.» 로 고쳤다, 레딧 «앱명 0~1회»).
- 스레드 실측(13시): 댓글 7개·184시간 — 조용한 자리지만 «we waive the 'no self promotion' rule»인 유일한 공식 홍보 칸. 게시 뒤 다음 회차들이 답글 확인·응답(«be engaged, and answer queries»).

## 4. 안 하는 것 (근거)
- 인도 r/IndianStockMarket — «AI Slops» 금지 · r/StockMarketIndia — «Promotional content is not allowed without moderator approval».
- 브라질 레딧 r/investimentos — «Auto-promoção indiscreta» 금지(데이터 댓글도 우리 계정 이력상 홍보로 읽힐 위험) → 블루스키로.
- 싱가포르 r/singaporefi — «No advertising, self-promotion» + 개별 종목 글 금지.
- 영국 r/UKInvesting — R4 단기 트레이딩 논의 금지(실적 직후 변동은 여기 해당).
- GeekNews 새 Show 글 — 원장 «1회성 — 남발 금지»(9/24 Show 가 7일 폰 클릭 16 = 안드 4·iOS 12로 좋았지만 같은 앱 두 번째 Show 는 다음 주 이후 코디네이터 판단).
- 인디해커스 — 세션 만료(9/25 이후 발행 0, HANDOFF ㊹). 7일 안드로이드 폰 클릭 1위 채널이라 **대표 재로그인이 가장 값싼 설치 레버**.
