#!/usr/bin/env node
// 마케팅 자동화 = «이 루프» 다. Vercel/GitHub 크론은 마케팅에 쓰지 않는다(8월 자동발행 체제 = 설치 0).
// 이 스크립트가 루프의 «시계» 역할을 한다: 지금 시각에 무엇이 열려 있고 무엇이 마감됐는지 결정론적으로 알려준다.
//   node scripts/mkt-plan.js              → 지금 할 일
//   node scripts/mkt-plan.js pub <채널> <URL> [메모]  → 발행 원장에 기록(캡 계산의 근거)
//   node scripts/mkt-plan.js today        → 오늘 발행 현황
'use strict';
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const LEDGER = path.join(ROOT, '.agent/marketing/PUBLISH-LEDGER.json');
const QUEUE = path.join(ROOT, '.agent/marketing/QUEUE.json');
const kst = (d = new Date()) => new Date(d.getTime() + 9 * 3600 * 1000);
const kstDate = (d = new Date()) => kst(d).toISOString().slice(0, 10);
const utcDate = (d = new Date()) => d.toISOString().slice(0, 10);
const hhmm = (d = new Date()) => kst(d).toISOString().slice(11, 16);
const load = () => { try { return JSON.parse(fs.readFileSync(LEDGER, 'utf8')); } catch { return { entries: [] }; } };
const save = (o) => fs.writeFileSync(LEDGER, JSON.stringify(o, null, 1));

// 채널 규칙: cap 은 «하루 몇 편», day 는 캡을 재는 달력(kst | utc), window 는 KST 시간대(열림~닫힘)
// ★2026-09-23 캡 상향(대표 지시: 「플랫폼들 올릴 수 있는 최대 한도로 많이 올려 소극적으로 하지 말고」
//   「수단과 방법을 가리지 말고」). 「한 채널 하루 1편」은 9/1 «게시마다 승인받던» 시절의 규칙이었다
//   (memory/publishing-requires-explicit-approval.md). 그 뒤 자동 게시가 기승인됐고(GROWTH-DOCTRINE §9)
//   대표가 최대치를 거듭 요구했다. 하루 여러 편이 «정상 사용»인 시간순 피드만 올린다:
//   bluesky 3 · mastodon 2 · x_post 2 · x_jp 2 · threads 2. 장문 채널(medium·note·IH·okky·linkedin)은 1 유지 —
//   거기서 같은 날 두 편은 도달이 아니라 스팸 신호다. 편마다 «다른 소재 + 다른 앱 화면»이 조건이다.
const CH = {
  admob:       { cap: 0, day: 'week', window: [0, 24], note: '수익 채널(홍보 아님). 개인 계정 — authuser=1 필수. 금융 차단은 p3(t141), 브랜드·경쟁 이유이고 CPM 손실 가능' },
  dcinside:    { cap: 0, day: 'kst', window: [9, 24], note: '⛔관리 제외(검증) — 글쓰기 화면에 password 입력란 실재. 안전선 「비밀번호 입력 금지」 위반. 대표 전용' },
  okky:        { cap: 1, day: 'kst', window: [9, 24], note: '계정 살아있음(signumhq). /events/promote 는 «무료 서비스 전용» 홍보판. ⚠️영리 광고성 글은 예고 없이 삭제 — «개발자에게 유익한 정보»로 써야 산다. 링크는 자동 링크화 안 됨(평문)' },
  geeknews:    { cap: 1, day: 'week', window: [9, 24], note: '★계정 필요. 자작 앱은 반드시 [Show] 태그. 가입 7일 대기. 1회성 — 남발 금지' },
  fmkorea:     { cap: 1, day: 'kst', window: [9, 24], note: '★계정 필요. 주식게시판 해외주식 하위. 포인트 게이트 있음 — 댓글부터' },
  brunch:      { cap: 1, day: 'week', window: [0, 24], note: '★작가 신청 필요. 키워드 «미국주식» 허브 존재. 에세이 톤, 링크는 말미 1회' },
  apple_promoted_iap: { cap: 1, day: 'week', window: [0, 24], note: '★2026-09-25 확장 티켓 — 구독 대표 이미지(1024) + promotedPurchases 생성(API). 심사 대상' },
  apple_featuring: { cap: 1, day: 'week', window: [0, 24], note: '★무료·최대 레버리지. ASC Featuring Nominations. 국가/지역 필드로 JP·KR 스토어 지정. 3개월 전 제출. In-App Event 와 묶어야 «타이밍 훅»이 생긴다' },
  kr_media:    { cap: 1, day: 'week', window: [0, 24], note: '★무료. 벤처스퀘어·플래텀·스타트업레시피 — 게재되면 네이버 뉴스 검색에 노출(SEO 직결). 메일 발송은 대표 승인' },
  jp_media:    { cap: 1, day: 'week', window: [0, 24], note: '메일 발송은 대표 승인 필요. AppBank·GIGAZINE·iPhone Mania 무료. Appliv 무료등재는 404(유료 전용)' },
  alternativeto: { cap: 0, day: 'kst', window: [0, 24], note: '★2026-09-19 확장 등록(58번째). ★계정 대기(t202) — 계정이 생기면 cap 1. 근거: 오늘 광고 실측에서 전환한 말이 «market data»($1.61)·«finance app»($8.14)·«프리마켓»이었다 — 사람들은 브랜드가 아니라 «기능»으로 찾는다. 「X alternatives」 검색이 그 의도와 겹친다. 무료·사용자 제출형·고권위. 등재는 3앱 각각(설명·스크린샷·카테고리·라이선스) + 관련 alternatives 페이지에 후보 추가. ⚠️ 추적 파라미터 금지 디렉터리가 있다 — 규칙을 먼저 읽고 금지면 순수 URL 로 넣는다.' },
  // ★2026-09-23 «규칙 미정의 6개»를 정했다(매 사이클 경고가 떴다 = 도구의 신호)
  seo_uc:      { cap: 0, day: 'week', window: [0, 24], note: '측정 전용 태그(티커 페이지 CTA 3개 분리, 9/20) — 발행 대상 아님. 9/27 에 seo_uc·seo_sg·seo_wim 클릭을 비교해 이긴 앱을 1순위 CTA 로' },
  seo_sg:      { cap: 0, day: 'week', window: [0, 24], note: '측정 전용 태그 — seo_uc 참고' },
  seo_wim:     { cap: 0, day: 'week', window: [0, 24], note: '측정 전용 태그 — seo_uc 참고' },
  devto:       { cap: 1, day: 'kst', window: [0, 24], note: 'dev.to — 계정 필요(대표 1회, POST /api/articles 401). 자기 제품은 «공개하면» 허용 · canonical_url 로 원본 지정. 원고 준비됨' },
  amazon_appstore: { cap: 0, day: 'week', window: [0, 24], note: '1급 스토어(설치가 직접 난다). 개발자 계정 대표 1회 → 그 뒤 cap 1 로 올려 APK 3개 업로드' },
  apple_cpp_channels: { cap: 1, day: 'week', window: [0, 24], note: 'CPP 를 채널 언어별로(ko/ja/en-tech). ASC API 로 생성 → 심사 24~48h → storeRedirect.ts 매핑(라이브 웹 변경 = 실화면 검증 후 배포)' },
  indexnow_ghpages: { cap: 1, day: 'week', window: [0, 24], note: '데이터셋 주간 갱신 직후 1회 — node scripts/indexnow-ghpages.mjs' },
  congress_member_pages: { cap: 1, day: 'week', window: [0, 24], note: '의원별 페이지 — github_pages_congress 와 같은 주간 갱신에 묶는다' },
  github_pages_finra: { cap: 1, day: 'week', window: [0, 24], note: '주 1회 갱신 — python3 scripts/finra-short-dataset.py <끝날짜> 20 /tmp/ego/gh-finra → github-upload.mjs(csv·html) → indexnow-ghpages.mjs' },
  gsc_ghpages: { cap: 1, day: 'week', window: [0, 24], note: '주 1회 — GSC 데이터셋 속성의 Sitemaps 상태(Couldn\'t fetch→Success)·Pages(색인 수)·Datasets 보고서 확인. 새 페이지는 sitemap.xml 추가 후 URL 검사→Request indexing' },
  bing_webmaster: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-24 확장 티켓 — BWT 로그인 = 새 계정(대표). 로그인되면 GSC 가져오기로 두 속성 + GEO(AI 인용) 보고서' },
  github_pages_finra_i18n: { cap: 2, day: 'week', window: [0, 24], note: '한국어·일본어판 — finra-short-dataset.py 가 영어판과 함께 생성. 갱신 때 세 페이지 함께 업로드 + GSC URL 검사' },
  github_topics: { cap: 1, day: 'week', window: [0, 24], note: '★2026-09-24 — 저장소 About·토픽(얇은 토픽: short-volume 1·max-pain 9·congress-trading 11·dark-pool 19). 새 데이터셋을 올리면 토픽도 같이' },
  onestore: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-24 확장 티켓 — 원스토어 «미국주식» 검색 결과 앱 4개(얇은 문). 개발자 등록 = 대표' },
  linkedin_newsletter: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-25 게이트(자격) — 편집기 «올리는 대상»에 개별 글뿐. 생기면 대표 승인(구독 초대 대량 알림) 후 개설' },
  minkabu: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-25 게이트(계정)' },
  chiebukuro: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-25 게이트(계정) — 지식iN 형식은 건당 0.09 클릭' },
  podcast_daily_brief: { cap: 0, day: 'kst', window: [0, 24], note: '★2026-09-25 게이트(약관) — Apple Podcasts Connect 약관·쇼 제출은 대표 1회, 이후 RSS 갱신은 나' },
  quora_pin: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-26 불가 — Quora 답변 메뉴에 고정 없음' },
  medium_pin: { cap: 1, day: 'week', window: [0, 24], note: '★2026-09-25 Medium 프로필 고정(기존 글) — 본글 캡 무관' },
  threads_pin: { cap: 1, day: 'week', window: [0, 24], note: '★2026-09-25 Threads 프로필 고정(기존 글 고정은 본글 캡 무관). 다음 교체 때 상시 소개글 + from=threads_pin' },
  naver_stock_discussion: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-25 보류(대표결정) — 대표 개인 네이버 계정·클린봇·자본시장법 민감' },
  en_media: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-25 게이트(메일승인) — 9to5Mac·TapSmart 인디 코너 제보, 초안 press/READY-TO-SEND.md §⑥' },
  tradingview_ideas: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-25 보류 — 사이트 전체 홍보 금지(회사명·링크 포함), 예외는 유료 Premium 서명' },
  note_joint_magazine: { cap: 0, day: 'kst', window: [7, 23], note: '★2026-09-25 게이트(약관 체크) — note 첫 댓글 모달 체크박스는 대표 몫. 참가 승인 후 cap 1(글을 마가진에 추가, 연속 금지)' },
  google_play_featuring: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-25 게이트(자격) — 구글 추천 폼은 유료 앱 할인용, Apps Accelerator 신청은 대표 결정 ㊴' },
  bluesky_earnings_feeds: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-25 규칙 정의 — channels.json 에서 rejected(enabled:false). 발행 채널이 아니라 태그 실험이었고 기각됨 — 배정 대상 아님' },
  quora_spaces_share: { cap: 0, day: 'kst', window: [0, 24], note: '★2026-09-25 확장 티켓 — 큰 금융 Space 팔로워·제출 허용 여부 측정 전(검색 목록엔 팔로워 수 없음)' },
  bluesky_buildinpublic: { cap: 1, day: 'kst', window: [0, 24], note: '★2026-09-25 확장 — 블루스키 #buildinpublic 제작기(수치 1개 중심, 카드+from=bluesky_bip). 금융 글 캡과 별도. 9/28 판정' },
  note_pin: { cap: 1, day: 'week', window: [0, 24], note: '★2026-09-25 note 고정 기사(소개 글). 카드 … → クリエイターページに固定表示' },
  x_pin: { cap: 1, day: 'week', window: [0, 24], note: '★2026-09-25 X 미국 프로필 고정 소개 글(from=x_pin) — scripts/x-pin.mjs. 분기 1회 교체' },
  bluesky_pin: { cap: 1, day: 'week', window: [0, 24], note: '★2026-09-25 프로필 고정 소개 글(from=bluesky_pin) — scripts/bsky-pin.mjs. 분기 1회 교체' },
  bluesky_reply: { cap: 2, day: 'kst', window: [0, 24], note: '큰 금융 계정 글(게시 1시간 안)에 데이터 한 줄 답글 — getFeed(FinSky·EconSky)로 찾고 bsky-publish --reply-to. 링크·예측 없음' },
  github_pages_congress: { cap: 1, day: 'week', window: [0, 24], note: '주 1회 갱신 — node scripts/congress-dataset.mjs → github-upload.mjs(세 파일). 90일 창이 밀리므로 갱신을 거르면 «죽은 데이터»가 된다' },
  producthunt: { cap: 0, day: 'kst', window: [0, 24], note: '★2026-09-19 확장 등록(57번째). ★계정 대기(t200) — 메이커 계정이 런치 시점에 «약 1주일 이상» 돼 있어야 한다(당일 생성·당일 런치 금지)라 cap 0 으로 잠근다. 계정이 생기면 cap 1 로 올리고 «한 번만» 쏜다 — 6개월 내 재런치는 메이저 업데이트 심사 대상. 태그라인 60자 제한 · 링크는 제품을 받을 수 있는 대표 페이지 하나 · 런치는 1개월 전까지 예약 가능. 화·수·목 태평양시 아침이 노출이 높다. 준비물(한국어·영문 스크린샷, OG 이미지, 스마트링크)은 이미 있다.' },
  apple_ppo:   { cap: 1, day: 'week', window: [0, 24], note: '★(선행: 스크린샷 변형 3장 렌더 — t194) App Store «제품 페이지 최적화»(PPO) — 아이콘·스크린샷·미리보기 A/B(무료, ASC API appStoreVersionExperimentsV2). Play 실험의 iOS 짝. 텍스트는 대상 아님 → 스크린샷 변형(첫 장=프리마켓/실적) 준비가 먼저' },
  naver_search_advisor: { cap: 1, day: 'week', window: [0, 24], note: '★네이버 색인 0건(8/18 실측)의 가장 값싼 카드. 서치어드바이저 사이트 등록→소유확인(meta)→사이트맵 제출. 첫 문턱 = 이용약관 동의 1클릭(대표, t195)' },
  daum_search: { cap: 1, day: 'week', window: [0, 24], note: '★Daum 검색등록(register.search.daum.net) — 무료·로그인 불필요·사이트검색 신규등록 폼. 처리 결과는 이메일. 보안문자가 있으면 대표 1클릭' },
  play_listing_experiments: { cap: 0, day: 'week', window: [0, 24], note: '⏸보류(2026-09-18): 28일 스토어 방문 31명 → A/B 유의성 불가(내 기록 9/17). 트래픽 100/일 넘으면 재개. 지금은 «직접 개선»으로 대체' },
  indexnow:    { cap: 1, day: 'week', window: [0, 24], note: '★계정·게이트 없음. `node scripts/indexnow-submit.js` — sitemap 전량을 Bing·Yandex·Seznam·Naver 에 즉시 통보. 2026-08 에 만들어 1,800건만 쓰고 한 달 방치 → 09-18 6,768건 전량 200. 새 페이지가 늘면 다시 돌린다' },
  llms_txt:    { cap: 1, day: 'week', window: [0, 24], note: '★AI 검색(ChatGPT·Perplexity·Claude)이 읽는 표면. src/app/llms.txt/route.ts. 09-18 앱 섹션·?from=llms 3개 추가(그전 0개). 앱 사실이 바뀌면 갱신하고 IndexNow 로 통보' },
  naver_blog:  { cap: 3, day: 'kst', window: [8, 18], note: '★2026-09-25 창 8~18시 — RUNBOOK 시간대 규칙(08·12·16시 전후, 한국 밤·새벽 금지). [0,24] 였을 때 02시에 배정됐다. ★대표 승인 완료(2026-09-18) — 발행 중. blog.naver.com/donneum «인싸이트팟». 하루 1편(전역 안전선). ★2026-09-20 실측: 색인은 되는데 «자기 제목으로도» 30위 밖 = 권위 문제 → 제목은 «얇은 문»(상위30 제목 적합 0~3건) 질의를 맨 앞에 그대로. 카테고리 투자(주제 비즈니스·경제 자동). 평문 URL 은 링크가 아니다 — 빈 줄 URL+Enter 로 OG 카드. 발행 후 curl 로 <a href> 확인. 에디터에서 Meta+a 금지' },
  android_install_banner: { cap: 0, day: 'week', window: [0, 24], note: '★cap 0 — 발행 채널이 아니라 «1회 설정»이다. public/manifest.json 에 related_applications + prefer_related_applications 를 넣는 웹 자산 변경(대표 승인 필요). 붙기 전까지 할 일은 «확인» 하나: curl https://www.signumhq.com/manifest.json 에 두 키가 있는지. 붙은 뒤엔 Play 획득 보고서로 효과를 잰다' },
  apple_whats_new: { cap: 0, day: 'week', window: [0, 24], note: '★cap 0 — 빌드 게이트다. 라이브 버전에서 PATCH 하면 409 STATE_ERROR(2026-09-20 실측). 다시 시도하지 말 것. 편집 가능한 버전이 생기는 «그 사이클»에만 12로케일을 채운다(규칙은 NEXT-VERSION-CHECKLIST)' },
  play_promotional_content: { cap: 0, day: 'week', window: [0, 24], note: '★cap 0 — 아직 «있는지»도 확인 못 했다. 첫 행동은 발행이 아니라 확인: Play Console → 앱 → Grow users → Store presence 아래에 Promotional content(구 LiveOps) 항목이 있는가. 있으면 cap 1 로 올리고 애플 인앱이벤트와 같은 리듬으로 운영, 없으면 enabled:false 로 닫고 이유를 적는다(Play Developer page 처럼). 주소 직타 금지 — 눌러서 간다' },
  naver_topic_feed: { cap: 0, day: 'week', window: [0, 24], note: '★발행하지 않는다 — 네이버 블로그 글이 그대로 흘러드는 «피드»다(section.blog.naver.com/ThemePost.naver?directoryNo=33 비즈니스·경제). 행동은 주 1회 «노출 확인» 하나: directoryNo=33 에서 donneum 링크가 보이는지 재고 OUTREACH-LOG 에 적는다. 보이면 naver_blog 제목·주제 선택이 듣는 것이고, 안 보이면 피드가 선별형이라는 뜻이다. 비용 0' },
  naver_kin:   { cap: 12, day: 'kst', window: [7, 24], note: '★2026-09-25 창 7~24시 — 한국 낮 우선(RUNBOOK), 새벽엔 새 질문도 거의 없다. ★계정 필요. 답변 0건 질문 선점 = 영구 1등. 본문 링크 금지(사업자 홍보 판정) — 프로필 경유. 네이버 메이트 인용수 누적' },
  qiita:       { cap: 1, day: 'week', window: [0, 24], note: '★계정 필요. 자사 기술해설은 광고 아님(명문). 엔지니어링이 본문·미국옵션은 소재. 금융태그로는 아무도 안 온다 → 전체 트렌드 노림. 5~10 LGTM' },
  zenn:        { cap: 1, day: 'week', window: [0, 24], note: '★계정 필요. 홍보는 «말미 고정 메시지» 한 블록만. 일일트렌드 48칸·좋아요 1~2로도 진입' },
  discord_usstock: { cap: 1, day: 'week', window: [0, 24], note: '참여 우선. 콜드 링크 투척 = 규칙4 위반. 파이썬 채널에서 빌더로 먼저 알려질 것' },
  hatena_bookmark: { cap: 1, day: 'week', window: [0, 24], note: '자기 사이트 자기 북마크만 허용(1건·사람 속도). 서브계정·상호북마크 = 사이트 영구제재. 레인은 테크놀로지 엔지니어링 글 하나뿐' },
  reddit:      { cap: 3, day: 'utc', window: [0, 24], note: '무링크·무앱명·같은 스레드 중복 금지·8분 간격 · ⛔AI작성 금지 서브 제외: r/options·r/StockMarket·r/investing·r/iosapps · r/Daytrading 제외 · ★9/25 규칙 실측 추가: r/ValueInvesting·r/Bogleheads·r/economy·r/personalfinance·r/quant·r/CanadianInvestor·r/fatFIRE·r/JapanFinance (reddit-comment.mjs 가 거부)' },
  android_alt_stores: { cap: 1, day: 'week', window: [0, 24], note: '★계정 없이 제출 가능한 경로 있음(APKPure). «클릭»이 아니라 «설치»가 직접 발생하는 유일한 채널. APK 필요(AAB 아님)' },
  google_dataset_search: { cap: 1, day: 'week', window: [0, 24], note: '★무료·게이트 없음. 티커 페이지가 이미 @type:Dataset 을 싣는다 — distribution 만 넣으면 6,768 URL 이 동시에 대상(t163)' },
  hf_datasets: { cap: 1, day: 'week', window: [0, 24], note: '★계정 필요. 깃허브 데이터셋 미러 → 구글 데이터셋 검색 색인. 금융 니치가 비어 있다(검색 0건)' },
  mybest_jp:   { cap: 1, day: 'week', window: [0, 24], note: '편집 큐레이션. 신청 경로 미공개 → 문의는 대표 승인. 기사에 붙은 구글폼은 «신고»용이니 쓰지 말 것' },
  mastodon:    { cap: 2, day: 'kst', window: [0, 24], note: '★계정 필요. 블루스카이(글 1편→18클릭) 구조의 복제 — 시간순·해시태그 도달·링크 무감점·이미지 4장·500자. 앱 카드 + ?from=mastodon 필수' },
  home:        { cap: 0, day: 'kst', window: [0, 24], note: '★발행 채널이 아니라 «측정·개선» 채널이다(21일 412클릭=전체 52%). 하는 일: CTA 위치·문구·앱 구분 태그(home_signum|home_uc|home_wim) 점검. 웹 코드 변경은 승인 후 → t168' },
  seo_darkpool:{ cap: 0, day: 'kst', window: [0, 24], note: '/dark-pool 전용 태그(21일 31클릭). 발행 아니라 점검 채널 — 구글봇에 307(임시)을 주는 것을 301 로 고칠 것(승인 필요). 다크풀 순위 갱신 여부 확인' },
  galaxy_store: { cap: 1, day: 'week', window: [0, 24], note: '★계정 필요(무료). 한국 안드로이드 기기 «기본 탑재» — Play 검색 설치가 0 이라 검색에 의존하지 않는 유일한 대안. 소유권 심사 아니라 개발자 등록이라 Uptodown 식 반려 루프가 없다. ONE스토어도 같이' },
  play_custom_listings: { cap: 1, day: 'week', window: [0, 24], note: '★무료·자격 게이트 없음. Play 검색 키워드로 타깃되는 맞춤 스토어 등록정보(앱당 50개). 한 국가당 하나·저장≠제출' },
  apple_cpp:   { cap: 1, day: 'week', window: [0, 24], note: '★무료. 맞춤 제품 페이지가 «유기 검색»에도 나온다(2025-07-30~). 키워드 1개=CPP 1개, 중복 반려. 심사 24~48h' },
  apple_iap_events: { cap: 1, day: 'week', window: [0, 24], note: '★검색 결과에 «별도 행»을 얻는 유일한 무료 수단. 날짜 박힌 시장 이벤트만(반복 일상 과제는 반려). ASC API 로 크론화' },
  macrumors:   { cap: 1, day: 'week', window: [0, 24], note: '앱당 스레드 «하나»만, 영구. 업데이트는 그 스레드에 이어 쓴다. 새 스레드·범프는 밴. ★2026-09-19 SIGNUM 스레드 개설(2489848) — 앞으로는 «그 글에 이어쓰기»만' },
  play_short_description: { cap: 1, day: 'week', window: [0, 24], note: 'Play 등록정보 첫 80자. ⚠️ 저장 끝에 「Label AI-generated assets」 모달이 필수로 뜬다 — 에셋 신고는 대표 몫이라 내 선에서 저장 불가. 문구만 준비해 두고 대표 확인 때 한 번에 넣는다' },
  tistory:     { cap: 1, day: 'kst', window: [8, 20], note: '★블로그 개설 대기(대표 1회). 다음 검색 전용 레인 — 네이버 블로그와 «같은 글» 금지, 제목·앵글을 달리한다' },
  apple_app_preview: { cap: 1, day: 'week', window: [0, 24], note: 'Remotion 으로 렌더 → appPreviewSets 업로드. 심사 대상이라 «버전과 함께» 나간다. en-US 한 편 검증 후 ko/ja 복제' },
  play_app_tags: { cap: 1, day: 'week', window: [0, 24], note: 'Store settings → Manage tags. 즉시·무심사. 어휘 고정 172개(stock·quiz 없음). 피어그룹도 같이 바뀌니 «약한 태그로 5칸 채우기» 금지' },
  android_deep_links: { cap: 1, day: 'week', window: [0, 24], note: '★대표 1회(매니페스트 intent-filter + autoVerify). 웹쪽 assetlinks.json 은 배포 완료. Play Console→Deep links 의 Status 로 검증' },
  disquiet:    { cap: 1, day: 'week', window: [9, 24], note: '★계정 필요(대표 1회). 한국판 Product Hunt — 홍보가 취지라 삭제 위험 없음. okky 11클릭이 근거' },
  github_pages: { cap: 1, day: 'week', window: [0, 24], note: '데이터셋 랜딩 + schema.org Dataset JSON-LD. 스냅샷 갱신 시 contentUrl·temporalCoverage 같이 갱신' },
  rss_feed:    { cap: 1, day: 'week', window: [0, 24], note: '피드는 «이미 있다» — /{locale}/feed.xml 3개국어 200. 할 일은 네이버 RSS 제출·피드리더 등록이지 코드가 아니다. /rss 리다이렉트 대상만 404' },
  app_share:   { cap: 1, day: 'week', window: [0, 24], note: '★앱 코드(대표/개발). 공유 버튼 → ?from=share. 붙으면 클릭 추적표에 바로 올라온다' },
  taaft:       { cap: 1, day: 'week', window: [0, 24], note: '★계정 필요(t203). 디렉터리 등재는 «1회»다 — 무료 경로만, 유료 승급 금지. 등재문에 «AI가 무엇을 하는가»를 구체로: 프리마켓·섹터·매크로·기관수급을 읽어 매일 ko/en/ja 브리핑. 재등록·중복 제출 금지' },
  quora_en:    { cap: 1, day: 'utc', window: [0, 24], note: '§11-6 순수 가치·앱명 0~1회·데이터 화면 1장' },
  quora_jp:    { cap: 1, day: 'utc', window: [0, 24], note: '피드가 마르면 억지 발행 금지' },
  quora_de:    { cap: 1, day: 'utc', window: [0, 24], note: '2026-09-15 개통된 유럽 표면. 무응답은 «Dark Pool» 계열에만 있었다' },
  x_post:      { cap: 2, day: 'kst', window: [0, 24], note: '링크는 앞 280자 안' },
  x_reply:     { cap: 3, day: 'kst', window: [21, 24], note: '청중 차용. 280자 하드 제한·링크 금지·with_replies 로 검증' },
  threads:     { cap: 1, day: 'kst', window: [0, 24], note: '★2026-09-25 하루 2→1: 영어 글 건당 0.36클릭(11건) — 한 자리를 threads_jp 로 옮겼다(계정 합계 하루 2 유지). 패널 좌표로 스코프·프로필 time 으로 검증' },
  threads_kr:  { cap: 0, day: 'kst', window: [8, 23], note: '★2026-09-25 후보 — threads_jp 첫 주 결과 뒤 결정(계정 합계 2 안에서)' },
  bluesky_jp:  { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-25 보류 — 일본어 주식 피드가 작다(좋아요 2~21)' },
  threads_jp:  { cap: 1, day: 'kst', window: [7, 23], note: '★2026-09-25 확장 — 같은 Threads 계정의 일본어 글 + 주제 태그 #米国株(글당 태그 1개, 본문 해시태그가 주제로 바뀐다). 실측: 米国株·NISA 주제 인기글 좋아요 365~879·답글 64~131. 앱 화면(ja)+ ?from=threads_jp. 예측·권유 금지' },
  threads_reply: { cap: 2, day: 'kst', window: [0, 24], note: '오독 정정은 반드시 원문 확인 후' },
  instagram:   { cap: 2, day: 'week', window: [0, 24], note: '★2026-09-25 하루 1 → 주 2(줄이되 죽이지 않는다): 9/25 01:58 게시물 9시간 인사이트 = 조회 0·반응 0·프로필 방문 0·링크 누름 0, 21일 건당 0.4클릭. 자르기 «원본»·링크는 바이오. 웹엔 «프로필 고정» 메뉴 없음(앱 전용)' },
  pinterest:   { cap: 1, day: 'kst', window: [0, 24], note: '링크 입력 후 값 재읽기→저장→공개 href 3단 검증' },
  linkedin:    { cap: 1, day: 'kst', window: [0, 24], note: '카드 위 클릭 금지·전체 재입력' },
  linkedin_articles: { cap: 1, day: 'kst', window: [0, 24], note: '★2026-09-24 첫 아티클 발행(피드 «글쓰기»→/article/new/). 편집기는 iframe — 커버=«컴퓨터에서 업로드»(text 선택자)→다음, 제목칸은 좌표 클릭(텍스트 선택자는 textarea 입력 불가), 본문은 키 입력. ⚠ Shift+End 는 문서 끝까지 선택(본문이 통째로 지워졌다)' },
  linkedin_groups: { cap: 1, day: 'kst', window: [0, 24], note: '★2026-09-24 확장 — «US Stock Market | Trading & Investing»(공개·6,033명·금융업 963명) 가입 요청(운영자 승인 대기). 그룹 화면은 iframe — 버튼은 snapshot ref 로 누른다(좌표·DOM 질의는 IFRAME 만 잡힌다)' },
  smartnews: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-26 게이트(외부 신청 + SmartFormat RSS 웹 배포)' },
  google_news: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-26 게이트(웹 배포) — 구글 뉴스 KR 색인 18건·검색 순위 0. NewsArticle·news-sitemap 필요' },
  geeknews_comment: { cap: 1, day: 'week', window: [9, 23], note: '★2026-09-26 확장 — GeekNews 댓글(무링크·앱명 없이 실측 데이터). 가이드라인: 홍보·트래픽 유도·대량 요약형은 노출 제한' },
  aptoide: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-26 게이트(계정) — Aptoide Connect 개발자 계정(대표). 세 패키지 모두 미등재(404)' },
  yahoo_news_expert: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-26 게이트(자격) — 초청제, 공개 신청 경로 없음' },
  toss_community: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-26 게이트(대표결정) — 토스증권 피드 주제별 커뮤니티(미국주식이야기 등). 글쓰기 = 대표 개인 실명 계정' },
  note_kojin: { cap: 1, day: 'week', window: [18, 23], note: '★2026-09-26 확장 — note #個人開発(글 56,751·토요일 아침 1시간 20편·인기글 좋아요 10~98). 일본어 제작기(실측 수치) + 앱 화면 + from=note_kojin. 개발자 커뮤니티 제작기 = 우리 이긴 패턴(IH·GeekNews)의 일본판. 저녁 창(일본 개발자 퇴근 뒤)' },
  note_magazine: { cap: 1, day: 'week', window: [5, 9], note: '★2026-09-25 확장 티켓 — note マガジン 1개(우리 일본어 글 묶음) 개설·기존 글 추가. 일본 아침 창' },
  note_odai: { cap: 0, day: 'kst', window: [0, 24], note: '★2026-09-24 확장 — 발행 채널이 아니라 note 글의 お題 태그(#わたしの新NISA 등, 내용이 맞을 때만). 상금 콘테스트는 응모조건 수락이라 하지 않음. 규칙은 channels.json note_odai' },
  bluesky_feeds: { cap: 0, day: 'kst', window: [0, 24], note: '★2026-09-24 확장 — 발행 채널이 아니라 블루스키 글의 진입 태그(#econsky 매크로·#quantfinance #derivatives 옵션 구조). 규칙은 channels.json bluesky 노트' },
  bluesky_own_feed: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-24 확장 티켓 — 우리 이름의 블루스키 커스텀 피드(검색 «options trading» 2개·«gamma/max pain/dark pool» 0개 = 얇은 문). 웹 경로 배포가 필요해 대표 승인 게이트' },
  naver_cafe: { cap: 0, day: 'kst', window: [0, 24], note: '★2026-09-24 확장 티켓 — 미국주식 카페(1위 «미국 주식이 미래다» 47만·하루 새 글 340). 네이버 세션이 대표 개인 계정이라 가입은 대표 결정 게이트' },
  microsoft_store_pwa: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-24 확장 티켓 — PC 방문자(소셜 클릭 81%)용 설치 경로. 사이트는 이미 PWA(매니페스트·서비스워커). Partner Center 계정 = 대표' },
  medium_publications: { cap: 1, day: 'week', window: [0, 24], note: '★2026-09-24 티켓 — 다음 Medium 발행 때 패널 «Submit» 을 눌러 출판물 목록 확인' },
  x_communities: { cap: 0, day: 'kst', window: [0, 24], note: '★2026-09-24 티켓 — 가입 전(규칙 동의는 대표 몫)이라 cap 0' },
  bluesky_starter_pack: { cap: 0, day: 'week', window: [0, 24], note: '⛔2026-09-24 실측 기각(금융 팩 가입 0~4)' },
  note_jp:     { cap: 1, day: 'kst', window: [5, 9], note: '★2026-09-24 창 5~9시(KST=JST) — ENGINE §17-3 일본 아침 시계. 0~24 였을 때 새벽 내내 «실행 1순위»로 배정돼 매 사이클 헛돌았다(예약투고는 note 프리미엄 전용이라 못 씀). 발행기 scripts/note-post.mjs(edit_url 로 초안 발행)' },
  medium:      { cap: 1, day: 'kst', window: [0, 24], note: '★AI 지원 표시 «필수» — 미표시는 Network Only 로 도달이 팔로워(≈0)로 잘린다. 말미에 disclosure 한 줄. 제목 복구 ⌘⌥1 → 1문단 → 이미지 순서' },
  indiehackers:{ cap: 1, day: 'kst', window: [0, 24], note: '제품 타임라인 포스트' },
  github:      { cap: 1, day: 'kst', window: [5, 24], note: '미국 마감 후 스냅샷 → edit/new 경로로 커밋' },
  x_jp:        { cap: 2, day: 'kst', window: [5, 9], note: '★2026-09-25 창 5~9시(KST=JST) — ENGINE §17-3 일본 아침. [0,24] 였을 때 일본 새벽(02시)에 «실행 1순위»로 두 사이클 연속 배정됐다(note_jp 와 같은 종류). JP 원글. 계정 전환 후 프로필 링크가 /signumhq_jp 인지 확인하고 쓴다(오발행 전례)' },
  bluesky:     { cap: 3, day: 'kst', window: [0, 24], note: '웹 컴포저. 이미지 첨부는 ego 불가 → 앱 스마트링크의 OG 카드가 자동 임베드되는지 확인하고, 카드가 붙을 때만 발행' },
  quora_space: { cap: 1, day: 'kst', window: [0, 24], note: '브랜드명·앱링크가 허용되는 유일한 Quora 표면 — 답변 재활용 금지, Space 전용 글' },
  hackernews:  { cap: 0, day: 'week', window: [0, 24], note: '⛔관리 제외(대표 전용) — 사이트 전체 가이드라인 「Don\'t post generated text or AI-edited text」. 내가 쓰면 규정 위반' },
  directories: { cap: 1, day: 'kst', window: [0, 24], note: 'DIRECTORY-LIST.md 에서 미시도 1곳씩. 계정 생성 필요하면 즉시 #T8 티켓' },
  aso:         { cap: 1, day: 'week', window: [0, 24], note: '주간: 앱스토어·플레이 키워드 순위와 평점 수 점검 → ASO-KEYWORD-MAP 갱신' },
  seo:         { cap: 1, day: 'week', window: [0, 24], note: '주간: GSC 상위질의·색인 수 점검. 게시 채널이 아니라 사이트 작업' },
  tiktok:      { cap: 1, day: 'week', window: [0, 24], note: '신생계정 도달 0 실측 — 주 1회 유지 게시만(비용 0), 성과 기대 금지' },
};
// 관리 제외(사유 고정): youtube=대표 윈도우 운영 · stocktwits=무기한 제재 · buffer=대표 지시 영구 정지
const EXCLUDED = { youtube: '대표가 윈도우에서 직접 운영 — 접근 금지', stocktwits: '무기한 제재 — 게시 금지', buffer: '2026-09-01 대표 지시로 영구 정지', discord_usstock: '2026-09-18 규칙 원문 확인 — 営利目的の行動 금지·발견 시 강제퇴회. 홍보 불가(§30)', hackernews: '사이트 전역 AI 생성글 금지', dcinside: '관리 제외' };
// 고정 점검(KST)
const CHECKS = [
  { at: '05:00', what: 'GitHub 데이터셋 스냅샷', cmd: 'node scripts/marketing/github-structure-snapshot.js' },
  { at: '06:50', what: 'cross-sector 람다 검증', cmd: 'node /tmp/ego/verify-lambdas.js cross' },
  { at: '07:25', what: 'XS-3.0 / XS-2.0 실행 검증', cmd: 'node /tmp/ego/verify-lambdas.js xs3' },
  { at: '09:00', what: 'UTC 전환 — Reddit·Quora 창 열림', cmd: '' },
  { at: '22:30', what: '미국 정규장 개장 — X 답글·레딧 가치 댓글', cmd: '' },
];

// ★2026-09-25 계정 합계 캡 — 한 계정에 채널이 여러 개(본글·고정 소개글·제작기·언어판)면 채널별 캡만 보고는
//   계정 전체가 안전선을 넘는다. 실측(원장, KST 9/25): 블루스키 본글 5(bluesky 3 + bluesky_buildinpublic 1 + bluesky_pin 소개글 1)
//   > 안전선 3 · X 미국 3(x_post 2 + x_pin 소개글 1) > 2. 그리고 새로 만든 threads_jp 가 같은 날 Threads 3번째 본글로 배정됐다.
//   → 계정 묶음의 합이 캡에 닿으면 묶음 안 모든 채널을 «소진»으로 본다(답글 채널은 본글이 아니라 따로 센다).
const ACCOUNTS = {
  bluesky_acct:  { cap: 3, members: ['bluesky', 'bluesky_buildinpublic', 'bluesky_pin'] },
  threads_acct:  { cap: 2, members: ['threads', 'threads_jp', 'threads_kr'] },
  x_us_acct:     { cap: 2, members: ['x_post', 'x_pin'] },
  x_jp_acct:     { cap: 2, members: ['x_jp'] },
  mastodon_acct: { cap: 2, members: ['mastodon'] },
  naver_acct:    { cap: 3, members: ['naver_blog'] },
};
function acctOf(ch) { for (const [k, a] of Object.entries(ACCOUNTS)) if (a.members.includes(ch)) return k; return null; }
function counts() {
  const led = load(); const k = kstDate(); const u = utcDate();
  const out = {};
  for (const [ch, r] of Object.entries(CH)) {
    const d = r.day === 'utc' ? u : k;
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const used = r.day === 'week'
      ? led.entries.filter((e) => e.ch === ch && e.kst >= weekAgo).length
      : led.entries.filter((e) => e.ch === ch && (r.day === 'utc' ? e.utc === d : e.kst === d)).length;
    out[ch] = { used, cap: r.cap, left: Math.max(0, r.cap - used), over: used > r.cap, day: r.day, window: r.window, note: r.note };
  }
  // 계정 합계 캡 적용(KST 하루)
  for (const [k, a] of Object.entries(ACCOUNTS)) {
    const total = led.entries.filter((e) => a.members.includes(e.ch) && e.kst === kstDate()).length;
    for (const m of a.members) {
      if (!out[m]) continue;
      out[m].acct = k; out[m].acctUsed = total; out[m].acctCap = a.cap;
      if (total >= a.cap) { out[m].left = 0; }
      if (total > a.cap) { out[m].acctOver = true; }
    }
  }
  return out;
}
const cmd = process.argv[2];
if (cmd === 'pub') {
  const [, , , ch, url, ...rest] = process.argv;
  if (!CH[ch]) { console.error('알 수 없는 채널. 가능: ' + Object.keys(CH).join(', ')); process.exit(1); }
  // ★ 2026-09-18 — 잘린 URL(«...» 포함)이 원장에 들어가 있었고, 그것 때문에 «삭제됨»으로 오판했다.
  //   http 로 시작하는 값은 형태를 검사한다(레딧 댓글 ID 같은 «비 URL 식별자»는 그대로 허용).
  if (typeof url === 'string' && /^https?:/i.test(url) && (/\.\.\./.test(url) || /\s/.test(url) || url.length < 20)) {
    console.error('✗ URL 이 잘렸거나 공백이 있다 — 기록하지 않는다:\n  ' + url + '\n  공개 페이지에서 주소를 «복사»해 다시 시도하라(추측 금지).');
    process.exit(1);
  }
  const led = load(); led.entries.unshift({ ch, url: url || '', note: rest.join(' '), at: new Date().toISOString(), kst: kstDate(), utc: utcDate() });
  led.entries = led.entries.slice(0, 500); save(led);
  const c = counts()[ch]; console.log(`기록: ${ch} ${url || ''} → 오늘 ${c.used}/${c.cap} (${c.day} 기준)` + (c.acct ? ` · 계정 합계 ${c.acctUsed}/${c.acctCap}(${c.acct})` : ''));
  if (c.acctOver) console.log(`⚠ 계정 합계 캡 초과 — ${c.acct} 오늘 ${c.acctUsed}/${c.acctCap}. 안전선 위반이다: OUTREACH-LOG 에 기록하고 오늘은 이 계정에 더 올리지 않는다.`);
  process.exit(0);
}
const c = counts(); const now = hhmm(); const hour = Number(now.slice(0, 2));
let REG = [];
try { const raw = JSON.parse(fs.readFileSync(path.join(ROOT, '.agent/marketing/channels.json'), 'utf8')); REG = (Array.isArray(raw) ? raw : (raw.channels || [])).map((x) => ({ id: x.id || x.key || x.name, tier: x.tier || x.type || '?', note: x.note || '', gate: x.gate || null })); } catch {}
const ALIAS = { x_us: 'x_post', quora: 'quora_en', note: 'note_jp', bluesky_bip: 'bluesky_buildinpublic', wsb_earnings_thread: 'reddit' }; // wsb 스레드 댓글은 레딧 하루 3건(UTC)에 합산(2026-09-26) // 클릭 태그 → 규칙 id (bluesky_bip: 2026-09-26)

if (cmd === 'slot') {
  // 이번 사이클의 «담당 구역»을 결정론적으로 배정한다.
  // 목적: 매번 같은 2~3채널만 들락거리는 것을 구조적으로 막는다.
  // 원리: 「가장 오래 방치된 것부터」 + 「이 시간에 캡·창이 열린 것만」.
  //      새 채널이 등록되면 기록이 없어 맨 앞에 선다 → 자동으로 전 채널을 돈다.
  const led = load();
  const lastAt = {};
  for (const e of led.entries) { if (!lastAt[e.ch] || e.at > lastAt[e.ch]) lastAt[e.ch] = e.at; }
  const ageH = (k) => (lastAt[k] ? (Date.now() - Date.parse(lastAt[k])) / 36e5 : 99999);
  const fmtAge = (h) => (h > 9000 ? '기록없음' : h < 48 ? Math.round(h) + '시간 전' : Math.round(h / 24) + '일 전');

  const rows = [];
  for (const r of REG) {
    const id = r.id; const key = ALIAS[id] || id;
    if (EXCLUDED[id]) continue;
    const v = c[key];
    if (!v) { rows.push({ id, state: '규칙없음', age: ageH(key), note: r.note }); continue; }
    const inWin = hour >= v.window[0] && hour < v.window[1];
    // ★2026-09-23 «계정대기» 판정은 메모의 옛 문구(«★계정 필요» 등)로 했다 → 계정이 이미 생겨 오늘 발행한 okky 나
    //   5일 전에 발행한 apple_featuring 까지 «계정 막힘»으로 뚫기 레인에 올라왔다. 최근 7일 안에 실제 발행 기록이
    //   있으면 계정은 살아 있는 것이다 — 기록이 문구를 이긴다.
    const recentPub = ageH(key) < 24 * 7;
    const acct = !recentPub && /★계정 필요|★작가 신청|★무료\. ASC|대표 승인|계정 필요/.test(r.note || '');
    // ★2026-09-21 «게이트» — 내가 아무리 시간을 써도 못 여는 것(대표 결정·법적 동의·해금일)은
    //   «실행» 레인에서 빼고 따로 세운다. 안 그러면 기록이 영영 안 생겨 «가장 오래 방치된 순»의
    //   맨 앞을 영구 점유하고, 실행 4칸이 매 사이클 통째로 낭비된다(§49 와 같은 고장, 다른 얼굴).
    const g = r.gate;
    const gateOn = !!g && (!g.until || g.until > utcDate());
    const st = gateOn ? '게이트' : (acct ? '계정대기' : (v.left <= 0 ? '소진' : (!inWin ? '창밖' : '열림')));
    rows.push({ id, state: st, age: ageH(key), used: v.used, cap: v.cap, note: (r.note || '').slice(0, 44), gate: g });
  }
  const by = (s) => rows.filter((x) => x.state === s).sort((a, b) => b.age - a.age);
  const open = by('열림'), acct = by('계정대기'), norule = by('규칙없음'), gated = by('게이트');
  const rest = rows.filter((x) => x.state === '소진' || x.state === '창밖');

  console.log('━━━ 이번 사이클 담당 구역 · ' + hhmm() + ' KST (UTC ' + utcDate() + ') ━━━\n');

  // ★2026-09-20 «키우기» 레인 — 아래 «실행»은 오래 방치된 순이라, 매일 클릭을 내는 채널이
  //   구조적으로 영영 안 뽑힌다(bluesky 가 4사이클 내리 «대상 아님»에 있었다).
  //   그로스 규칙은 「이긴 것을 최소 단위로 찾아 키운다」이므로 이 레인을 «맨 앞»에 둔다.
  try {
    const cc = JSON.parse(fs.readFileSync(path.join(ROOT, '.agent/marketing/clicks-cache.json'), 'utf8'));
    const ageH = (Date.now() - Date.parse(cc.at)) / 36e5;
    const SELF = new Set(['home', 'seo', 'seo_darkpool']); // 우리 자산 — 게시로 키우는 대상이 아니다
    const top = Object.entries(cc.d3 || {}).filter(([t, n]) => n > 0 && !SELF.has(t))
      .sort((a, b) => b[1] - a[1]).slice(0, 3);
    console.log('■ 키우기 — 최근 3일 «클릭이 실제로 나온» 채널. 이번 사이클에 최소 1편을 여기에 쓴다');
    if (!top.length) console.log('   (3일 클릭 0 — 키울 것이 없다)');
    for (const [t, n] of top) {
      const v = c[ALIAS[t] || t];
      const room = v ? (v.left > 0 ? '오늘 ' + v.used + '/' + v.cap + ' 가능' : '오늘 소진 ' + v.used + '/' + v.cap) : '규칙없음';
      const cm = (cc.contam || {})[t] || 0;
      console.log('   ★ ' + t.padEnd(16) + '3일 ' + String(n).padStart(3) + '클릭(실)' + (cm ? ' [내점검 ' + cm + ' 제외]' : '') + ' · ' + String(cc.days || 21) + '일 ' + String((cc.all || {})[t] || 0).padStart(4) + ' · ' + room);
    }
    // ★2026-09-21 «줄일 것» — 키우기만 보여 주면 «무엇을 그만둘지»는 영영 안 보인다(ENGINE §57).
    //   건당 1 미만 채널은 노력 대비 회수가 없다. 죽이지는 않되 신규 투입을 줄인다.
    const pp = cc.perPost || {};
    const lose = Object.entries(pp).filter(([, v]) => v.per < 1).sort((a, b) => a[1].per - b[1].per);
    // ★2026-09-21(2차) 신선도 반영 — 21일 건당만 보면 «죽은 채널»이 1위로 올라온다.
    //   실제로 quora(12.8)·linkedin(4.5)은 최근 3일 0 이었다. 옮길 곳은 «건당 × 최근에도 난다» 둘 다여야 한다.
    const win = Object.entries(pp).filter(([, v]) => v.per >= 4 && (v.d3 || 0) > 0).sort((a, b) => b[1].per - a[1].per);
    const stale = Object.entries(pp).filter(([, v]) => v.per >= 4 && !(v.d3 || 0)).sort((a, b) => b[1].per - a[1].per);
    const rise = Object.entries(pp).filter(([, v]) => (v.fresh || 0) >= 50 && (v.d3 || 0) >= 3).sort((a, b) => b[1].d3 - a[1].d3);
    if (win.length || lose.length || stale.length || rise.length) {
      if (win.length) console.log('   ▲ 건당 높고 «최근에도» 난다(여기로 옮긴다): ' + win.map(([c, v]) => c + ' ' + v.per + '(3일 ' + v.d3 + ')').join(' · '));
      if (rise.length) console.log('   ▲▲ 가속 중(순위 낮아도 더 쓴다): ' + rise.map(([c, v]) => c + ' 3일 ' + v.d3 + '·' + v.fresh + '%').join(' · '));
      if (stale.length) console.log('   ◇ 건당은 높은데 최근 3일 0 — «과거 실적», 옮기지 말 것: ' + stale.map(([c, v]) => c + ' ' + v.per).join(' · '));
      if (lose.length) console.log('   ▼ 건당 1 미만(신규 투입 줄임): ' + lose.map(([c, v]) => c + ' ' + v.per + '(' + v.n + '건)').join(' · '));
    }
    if (ageH > 6) console.log('   ⚠ 클릭 캐시가 ' + Math.round(ageH) + '시간 전 것이다 → `node scripts/mkt-clicks.js` 를 먼저 돌려라');
    console.log('');
  } catch { console.log('■ 키우기 — 클릭 캐시 없음 → `node scripts/mkt-clicks.js` 를 먼저 돌려라\n'); }

  console.log('■ 실행 — 이 4개를 «반드시» 처리한다 (오래 방치된 순)');
  if (!open.length) console.log('   (열린 채널 없음 → 아래 «뚫기»가 이번 사이클의 본업이다)');
  open.slice(0, 4).forEach((r, i) => console.log('   ' + (i + 1) + '. ' + r.id.padEnd(20) + fmtAge(r.age).padEnd(12) + r.note));
  if (open.length > 4) console.log('   대기(' + (open.length - 4) + '): ' + open.slice(4).map((r) => r.id).join(', '));
  console.log('\n■ 뚫기 — 계정이 막힌 곳 중 가장 오래된 2개. 우회로를 «실제로» 시도한 뒤에만 보류로 적는다(ENGINE §22)');
  acct.slice(0, 2).forEach((r, i) => console.log('   ' + (i + 1) + '. ' + r.id.padEnd(20) + fmtAge(r.age).padEnd(12) + r.note));
  if (!acct.length) console.log('   (없음)');
  // ★게이트 레인 — «내가 못 여는 것»을 여기 세워 둔다. 실행 4칸을 점유하지 않는다.
  if (gated.length) {
    console.log('\n▣ 게이트 — 내 힘으로 못 연다. 여는 사람·여는 날이 정해져 있다 (실행 대상 아님)');
    gated.forEach((r) => {
      const g = r.gate || {};
      const when = g.until ? ('해금 ' + g.until) : (g.who ? (g.who + ' 1회') : '조건 미정');
      console.log('   · ' + r.id.padEnd(18) + ('[' + (g.kind || '게이트') + ']').padEnd(10) + when.padEnd(16) + (g.why || ''));
    });
  }
  console.log('\n■ 확장 — 신규 표면 1개: 발굴 → 실행 또는 티켓 → channels.json 등록 (매 사이클 의무)');
  console.log('\n■ 고정 6단계 — ①게이트 audit-expiration-selection.js --live ②광고(기간 «오늘» 고정) ③발행 즉시 pub 기록 ④공개페이지 검증 ⑤OUTREACH-LOG + 커밋·푸시 ⑥애드몹 리딩방 스윕 ego-browser nodejs < scripts/admob-arc-sweep.mjs (대표 지시 9/24·25 — 일회용 .shop/.vip 소재만 차단, 결과를 로그에)');
  if (norule.length) console.log('\n⚠ 규칙 미정의 ' + norule.length + '개 — 지금 정할 것: ' + norule.map((r) => r.id).join(', '));
  console.log('\n· 이번 사이클 대상 아님(' + rest.length + '): ' + rest.map((r) => r.id).join(', '));

  // ── 대표 할 일 ──────────────────────────────────────────────────
  // ★2026-09-23: 예전엔 CEO-SIGNUP-LIST.md(9/20 기준)를 읽어 이미 끝난 «마스토돈 가입» 등을 계속 띄웠다.
  //   정본은 HANDOFF.md §3 표다 — 거기서 취소선(~~) 없는 행만 센다.
  try {
    const hf = fs.readFileSync(path.join(ROOT, '.agent/marketing/HANDOFF.md'), 'utf8');
    const sec = (hf.split('## 3. 대표 할 일')[1] || '').split('\n## ')[0];
    const items = sec.split('\n').filter((l) => /^\|\s*\**[①-⑳]/.test(l) && !/~~/.test(l))
      .map((l) => l.split('|')[2].replace(/\*\*/g, '').replace(/`/g, '').trim().slice(0, 34));
    console.log('\n· 대표 할 일 ' + items.length + '건(HANDOFF §3 정본): ' + items.join(' / '));
  } catch { console.log('\n· HANDOFF.md §3 을 못 읽었다 — 경로 확인'); }
  process.exit(0);
}
if (cmd === 'today') { const led = load(); const k = kstDate(); for (const e of led.entries.filter((x) => x.kst === k)) console.log(`${e.at.slice(11, 16)}Z ${e.ch.padEnd(14)} ${e.url}`); process.exit(0); }
console.log(`■ 지금 ${now} KST (UTC ${utcDate()} / KST ${kstDate()})`);
const open = [], closed = [];
for (const [ch, v] of Object.entries(c)) {
  const inWindow = hour >= v.window[0] && hour < v.window[1];
  const line = `${ch.padEnd(14)} ${v.used}/${v.cap}${v.over ? ' ⛔초과' : ''}${v.day === 'utc' ? ' (UTC일)' : ''}${inWindow ? '' : ` [창 ${v.window[0]}~${v.window[1]}시]`}  ${v.note}`;
  (v.left > 0 && inWindow ? open : closed).push(line);
}
console.log('\n● 지금 열린 채널(' + open.length + ')'); open.forEach((l) => console.log('  ' + l));
console.log('\n○ 마감/대기(' + closed.length + ')'); closed.forEach((l) => console.log('  ' + l));
console.log('\n■ 등록 채널 전수 점검(' + REG.length + ')');
for (const r of REG) { const key = ALIAS[r.id] || r.id; const v = c[key]; const state = EXCLUDED[r.id] ? ('관리 제외 · ' + EXCLUDED[r.id]) : (v ? `${v.used}/${v.cap}${v.over ? ' ⛔초과' : v.left > 0 ? ' 가능' : ' 소진'}` : '규칙표 없음 → 성격에 맞는 행동 정의 필요'); console.log(`  [${r.tier}] ${String(r.id).padEnd(14)} ${state}${r.note ? '  · ' + String(r.note).slice(0, 48) : ''}`); }
const NOT_IN_RULES = REG.filter((r) => !c[ALIAS[r.id] || r.id] && !EXCLUDED[r.id]).map((r) => r.id);
if (NOT_IN_RULES.length) console.log('  ⚠ 규칙 미정의: ' + NOT_IN_RULES.join(', ') + ' → 이번 사이클에 행동을 정할 것');
else console.log('  ✔ 모든 등록 채널에 규칙이 정의돼 있음');
{ const led2 = load(); const today = kstDate(); const stale = []; for (const ch of Object.keys(CH)) { if (EXCLUDED[ch]) continue; const last = led2.entries.find((e) => e.ch === ch); const days = last ? Math.round((new Date(today) - new Date(last.kst)) / 86400000) : 99; if (days >= 3) stale.push(`${ch}(${days === 99 ? '기록없음' : days + '일'})`); } if (stale.length) console.log('\n⛔ 3일 이상 방치: ' + stale.join(' · ') + ' → 이번 사이클에 처리하거나 사유를 로그에 남길 것'); }
console.log('\n★ 이번 사이클 확장 의무: 신규 표면 1~2개 발굴 → 실행 또는 계정 티켓 → channels.json 에 등록');
const next = CHECKS.find((x) => x.at > now) || CHECKS[0];
console.log(`\n▲ 다음 고정 점검: ${next.at} ${next.what}${next.cmd ? '  →  ' + next.cmd : ''}`);
try { const q = JSON.parse(fs.readFileSync(QUEUE, 'utf8')); const it = q.items || q; const todo = it.filter((x) => x.state === 'todo').sort((a, b) => (a.prio || 9) - (b.prio || 9)).slice(0, 3); console.log('\n▶ 큐 상위 3건'); todo.forEach((x) => console.log(`  ${x.id} p${x.prio} ${x.type}/${x.region} ${String(x.title).slice(0, 70)}`)); } catch {}
