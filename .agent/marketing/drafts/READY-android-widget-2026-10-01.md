# 안드로이드 «내 종목» 홈 화면 위젯 — 발행 준비본 (KST 10/1 회차들이 쓴다)

만든 때: 2026-09-30 12시 회차 · 근거: 코디네이터 12:1x «Play 1.3.0 공개 확인 → 안드로이드 대상 위젯 홍보 허용, iOS 위젯은 심사 중이라 약속 금지»

## 0. 지켜야 할 것 (게시 전 체크)
- **플랫폼을 글에 분명히**: «안드로이드 홈 화면 위젯» / «Android home-screen widget» / «Androidのホーム画面ウィジェット». 아이폰 위젯 언급·약속 금지(iOS 1.10.0 심사 중 — 승인 소식은 코디네이터가 준다).
- **«실시간» 금지(위젯)**: 위젯 갱신은 **30분마다 + 앱에서 목록이 바뀔 때**(android/app/src/main/res/xml/widget_info_*.xml 주석, WorkManager 30분). 앱 안 가격은 실시간이지만 위젯 문장엔 «30분마다».
- **숫자는 게시 직전에 다시 잰다**: `node scripts/audit-structure-vs-nasdaq.js <티커>`(✗ 종목 수치 금지) + 감마 플립은 구조 API `gammaFlipType === 'EXACT'` 일 때만 쓴다(0-z).
- 예측·권유 표현 금지 · 가치 문장(유료 옵션 단말 월 $50~99 → 무료·가입 없음) · 무료는 내 종목 5개(PRO 100) — «무제한» 금지.
- 이미지 = **Play 공개 스크린샷**(운영 앱 에뮬레이터·시뮬레이터 스트리밍 금지): `.agent/marketing/assets/widget-android-2026-09-30/play-watchlist-{ko,en,ja}.png`(1080×1920, Play 1번 스크린샷 «내 종목», 9/29 종가 화면). **Play 페이지에 위젯 자체 스크린샷은 없다**(5장 = 내 종목·NVDA·대시보드·플로우·가디언) → 이미지는 «내 종목 화면», 글이 «이걸 홈 화면에서»를 말한다.
  - 이미지 속 종목 META·NVDA·GOOGL·PLTR(+AMZN) = 9/30 12:1x 나스닥 전체 체인 대조 5/5 ✓ · META·NVDA 감마 플립 EXACT(교차점 실재). 날이 바뀌면 다시 잰다.

## 1. 위젯 사실 (소스 origin/main 확인)
- 이름: My Watchlist / 내 종목 / マイ銘柄 · 설명: «♡ 로 담은 종목의 가격과 옵션 레벨을 한눈에»
- 크기: 2×2(small) · 4×2(medium) · 4×4(large), 늘이고 줄일 수 있다 · 행마다 가격 + 풋 플로어~콜 월 막대(맥스 페인·현재가 표시)
- 추가: 홈 화면 빈 곳 길게 누르기 → 위젯 → SIGNUM HQ «내 종목» → 크기 선택 (기기마다 메뉴 이름이 조금 다르다)
- Play «새로운 기능»(ko): «새 홈 화면 위젯: 내 종목의 가격과 옵션 레벨을 한눈에.»

## 2. 검색 수요 실측 (구글 자동완성, 9/30 12:0x — google-ac-widget-1215.json)
- 한국: «주식 위젯 추천» · «주식 위젯 안드로이드» · «주식 어플 위젯» / «미국주식 위젯»은 자기 자신만(얇은 문)
- 미국: «stock widget android» · «best stock widget android» · «stock widget android reddit» · «stock watchlist widget android»
- 인도: «stock market widget for android» · «stock widget for android» / 브라질: «widget ações android» · «widget bolsa de valores android»
- 인도네시아: «widget saham android» / 일본: «株価 ウィジェット android おすすめ» / 독일: «aktien widget android»

## 3. 채널별 원고 (캡·시간창은 mkt-plan 이 정한다 — 오늘(9/30 KST) 캡은 전부 소진, 10/1 부터)
| 채널 | 언제(KST) | 누구에게 | 원고 |
|---|---|---|---|
| x_post (@signumhq) | 00:13~03:13 (인도 20:43~23:43 IST) | 미국·인도 | 아래 EN-X (278자, 링크 23자 셈) + play-watchlist-en.png |
| threads (한국어) | 07:13~ | 한국(안드로이드 비중 큼) | 아래 KO-TH + play-watchlist-ko.png · 주제 태그 1개(#미국주식) |
| naver_blog | 08:13 첫 편 | 한국 검색 | 제목 후보 «주식 위젯 안드로이드 — 미국주식 관심종목 가격·옵션 레벨을 홈 화면에(추가 방법)» — **발행 전 얇은 문 실측**(블로그 탭 상위 30 제목) · 본문 = §1 추가 방법 + 풋 플로어·콜 월·맥스 페인 뜻(게시 직전 재측정 예시 1종목) + 가치 + 링크 from=naver_blog&l=ko · 카테고리 «투자»·주제 «비즈니스·경제»(발행기 강제 — 첫 발행에서 확인 줄 볼 것) |
| tistory | 08~20 | 한국(다음·구글 검색) | 네이버와 다른 앵글: «안드로이드 홈 화면에 미국주식 옵션 레벨 띄우기 — 위젯 크기 3가지 비교» |
| x_jp (@signumhq_jp) | 창 안 | 일본 안드로이드 | 아래 JA-X + play-watchlist-ja.png |
| note_jp | 일본 낮 | 일본 검색(«株価 ウィジェット android おすすめ») | 사용기형 — 추가 방법 + 레벨 뜻 + 가치 + from=note&l=ja |
| medium | 창 안 | 영어 검색(«stock widget android») | 제작기형(IH·GeekNews 에서 이긴 «만든 사람 이야기» 모양): «I put options levels on an Android home-screen widget» — AI 지원 표시(§19-2) |
| reddit r/IndiaInvestments | UTC 10/1 자리 중 1 | 인도(미국주식 하는 인도 투자자) | **지금 «Show II : Promotional Content thread for September 2026»(1wn6wgp, 9/22 AutoModerator — 매달 22일 새 판, 다음 10/22)** 에 최상위 댓글 1개 = 아래 EN-IN-RD. 스레드 규칙 원문(9/30 12:2x 읽음): «we waive the 'no self promotion' rule» · «If you've made some tools / products, tell us about it» · «Post about your own 'thing' on a top level comment» · «Link only comments will be removed - you must provide a summary» · «be engaged, and answer queries» · 결과가 결제 뒤에만 보이면 삭제 · 사용자 데이터 수집 도구는 모드 먼저 → 우리는 가입 없음·핵심 무료라 해당 없음. 사이클 안전선대로 **본문 링크 없음**(«Search SIGNUM HQ on Google Play») · AI 금지 규칙 없음(9/30 실측) · 게시 뒤 다음 회차들이 답글 확인·응답 |

### EN-X
New on Android: a home-screen widget for your US stock watchlist.

Price + where each stock sits between its put floor and call wall (the strikes with the most open interest), refreshed every 30 min.

Options terminals charge $50–99/mo. Free, no sign-up.
https://signumhq.com/app?from=x_us&l=en

### KO-TH
안드로이드 홈 화면에 «내 종목» 위젯이 생겼습니다.

하트로 담은 미국 종목의 가격과, 풋 플로어(아래쪽 풋 미결제약정 최대 행사가)와 콜 월(위쪽 콜 미결제약정 최대 행사가) 사이 어디쯤인지를 앱을 열지 않고 봅니다. 옵션 포지션이 가장 많이 몰린 가격대라 트레이더들이 먼저 확인하는 선입니다.

2×2·4×2·4×4 세 크기, 30분마다 갱신. 유료 옵션 단말에서 월 50~99달러에 보던 데이터, 가입 없이 무료.
안드로이드: https://signumhq.com/app?from=threads&l=ko

### JA-X
Androidのホーム画面に「マイ銘柄」ウィジェットが登場。

♡で追加した米国株の株価と、プットフロア〜コールウォール（建玉が最も多い行使価格）のどこにいるかを、アプリを開かずに確認。30分ごとに更新。

有料端末で月50〜99ドルのデータを無料・登録不要で。
https://signumhq.com/app?from=x_jp&l=ja

### EN-IN-RD (r/IndiaInvestments Show II — 링크 없음, 제작자 공개)
Disclosure: I build this. SIGNUM HQ is a free app (Android and iOS) for following US stocks from India — the US session runs through the Indian night, so it is laid out to be read in the morning.

New this week on Android: a home-screen widget for your watchlist. Each row shows the price and where the stock sits between its put floor and call wall (the strikes holding the largest put and call open interest), refreshed every 30 minutes.

Inside the app: max pain, put/call ratio and open interest for US stocks — the same open-interest view many Nifty option traders already use, applied to Nasdaq names — plus the earnings calendar and pre-market movers. No account needed; the core data is free (watchlist up to 5 stocks, PRO for more).

Search "SIGNUM HQ" on Google Play. Happy to answer questions about how the levels are calculated.

## 4. 아직 표면이 없는 곳 (다음 판단)
- 브라질·인도네시아: 우리 계정으로 닿는 현지어 표면이 없다(레딧 r/investimentos 는 «Auto-promoção indiscreta» 금지 · r/finansial 은 앱 홍보 금지). → **스토어가 먼저**: Play 기본·국가별 맞춤 등록정보 설명에 «widget» 단어가 없다(9/30 12:0x 공개 페이지 실측 — «widget» 은 «새로운 기능»에만). «stock widget android»·«widget ações android»·«widget saham android» 검색을 받으려면 짧은·전체 설명에 넣어야 한다 → 스토어 담당에 넘김(HANDOFF §4 0-zc).
