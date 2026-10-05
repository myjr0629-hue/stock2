#!/usr/bin/env node
// 마케팅 자동화 = «이 루프» 다. Vercel/GitHub 크론은 마케팅에 쓰지 않는다(8월 자동발행 체제 = 설치 0).
// 이 스크립트가 루프의 «시계» 역할을 한다: 지금 시각에 무엇이 열려 있고 무엇이 마감됐는지 결정론적으로 알려준다.
//   node scripts/mkt-plan.js              → 지금 할 일
//   node scripts/mkt-plan.js pub <채널> <URL> [메모]  → 발행 원장에 기록(캡 계산의 근거)
//   node scripts/mkt-plan.js today        → 오늘 발행 현황
'use strict';
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const LEDGER = process.env.MKT_LEDGER_PATH || path.join(ROOT, '.agent/marketing/PUBLISH-LEDGER.json'); // 시험용 덮어쓰기(MKT_LEDGER_PATH)
const QUEUE = path.join(ROOT, '.agent/marketing/QUEUE.json');
const kst = (d = new Date()) => new Date(d.getTime() + 9 * 3600 * 1000);
const kstDate = (d = new Date()) => kst(d).toISOString().slice(0, 10);
const utcDate = (d = new Date()) => d.toISOString().slice(0, 10);
// ★2026-09-29 게이트 until 을 «시각»으로도 받는다(예: '2026-09-29T20:00Z' = 새벽 5시 KST WSB 스레드 자리까지 보류).
//   예전엔 UTC 날짜 문자열 비교뿐이라 «오늘 몇 시까지»를 걸 수 없어 레딧이 매시 헛배정됐다. 날짜만 쓴 until 은 예전과 똑같이 동작한다.
const gateActive = (g) => !!g && (!g.until || (String(g.until).includes('T') ? Date.parse(g.until) > Date.now() : g.until > utcDate()));
const hhmm = (d = new Date()) => kst(d).toISOString().slice(11, 16);
// ★2026-09-27 «새 미국 마감이 있는가» — github 스냅샷처럼 미국 정규장 마감 데이터가 소재인 채널은 주말·휴장엔
//   올릴 것이 없다. 창(5~24시)·캡만 보면 KST 일·월요일에도 «실행 1순위»로 배정돼 헛돈다(9/27 05:28 github 배정 —
//   마지막 거래일 9/25 스냅샷은 9/26 05:34 에 이미 커밋돼 있었다). 규칙에 afterUsClose: true 를 달면
//   «마지막 발행이 가장 최근 정규장 마감(16:00 ET) 뒤»일 때 배정에서 뺀다. 달력은 공용본 scripts/lib/us-market-calendar.js
//   (정본 src/lib/marketCalendar.ts 와 같은 휴장 목록 — 스냅샷 도구도 같은 것을 쓴다).
const { lastUsCloseMs } = require('./lib/us-market-calendar');
// ★2026-10-04 상한 개정 — 대표 «가능한 수준에서 최대치로, 소극적이지 말고. 횟수는 조사로 최적화»(근거: ~/Documents/signum-work/growth/FREQUENCY-CAPS-2026-10-04.md).
//   CH 의 cap = 1주차(10/4~10/10) 권장 상한 · cap2 = 2주차(10/11~) 목표 상한. cap2 는 «마지막 경고 뒤 14일 무사고» 키에만 자동 적용된다.
//   상한은 «천장»이다 — 회차 시간은 계속 «게시당 추정 설치» 순으로 쓴다(slot 키우기 칸). 플랫폼 «규칙»이 아니라 우리가 정한 «보수 값»이었던 숫자를 올린 것이다.
//   경고·제한·도달 급감 신호는 scripts/lib/mkt-health.js 가 그 계정을 7일간 절반(내림)으로 낮춘다(fail·health 명령, slot 이 3시간마다 공개 신호 점검).
const HL = require('./lib/mkt-health');
const RAMP2_FROM = '2026-10-11'; // 2주차 시작(KST)
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
  // ★2026-09-29 18시 «규칙 미정의 3개»(share·threads_communities·apple_cpp_keywords) — 매 사이클 경고 = 도구의 신호
  share:       { cap: 0, day: 'week', window: [0, 24], note: '측정 전용(앱 공유 루프 — 브랜치 feat/share-loop 합치기 전엔 0). 발행 대상 아님 — slot 에 뜨면 무시' },
  threads_communities: { cap: 0, day: 'kst', window: [0, 24], note: '별도 편수 아님 — threads·threads_jp·threads_kr 본글에 현지어 커뮤니티 태그 1개를 붙이는 «방식». 계정 캡(threads_acct 2)에 합산. 다음 본글에서 태그 효과(도달·폰 클릭) 실측' },
  // ★2026-09-30 02시 확장 2건 규칙(발굴 즉시 정의 — «규칙 미정의» 경고를 남기지 않는다)
  threads_fediverse: { cap: 0, day: 'kst', window: [0, 24], note: '설정 1회(대표) — 별도 편수 아님. 켜지면 threads 본글이 그대로 연합우주로 나간다(계정 캡 불변). 확인 = 웹핑거 200' },
  linkedin_comment: { cap: 0, day: 'kst', window: [0, 24], note: '링크드인 이용약관 8.2 자동 댓글 금지 — 자동 실행 대상 아님(대표 결정 전 0)' },
  // ★2026-09-30 05시 규칙 정의(04시 발굴 뒤 «규칙 미정의» 경고가 남아 있었다)
  apple_review_reply: { cap: 0, day: 'kst', window: [0, 24], note: '처음 해 보는 대외 행동(리뷰어에게 애플 알림) — 권한 분류기 거부(MISTAKES #28). 대표 «올려»(HANDOFF §3 store-reply) 전 0' },
  apple_cpp_keywords: { cap: 1, day: 'week', window: [0, 24], note: '주 1회 — ASC API 로 CPP 키워드 연결·한국 CPP 3종(실적·옵션·시장) 첫 스크린샷 = 그 검색어의 답. 심사 대상. 성과는 ASC 분석 CPP 표(첫 다운로드 5건부터 표시)' },
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
  threads_pin: { cap: 1, day: 'week', window: [7, 23], note: '★2026-10-04 창 7~23시 KST — 새 상시 소개글을 쓰는 일이라 threads(한국어) 본글과 같은 창을 따른다(새벽 03시에 «실행 3순위»로 떠 새벽 게시를 부를 뻔했다 — MISTAKES #43 같은 종류). ★2026-09-25 Threads 프로필 고정(기존 글 고정은 본글 캡 무관). 다음 교체 때 상시 소개글 + from=threads_pin' },
  naver_stock_discussion: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-25 보류(대표결정) — 대표 개인 네이버 계정·클린봇·자본시장법 민감' },
  en_media: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-25 게이트(메일승인) — 9to5Mac·TapSmart 인디 코너 제보, 초안 press/READY-TO-SEND.md §⑥' },
  tradingview_ideas: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-25 보류 — 사이트 전체 홍보 금지(회사명·링크 포함), 예외는 유료 Premium 서명' },
  note_joint_magazine: { cap: 0, day: 'kst', window: [7, 23], note: '★2026-09-25 게이트(약관 체크) — note 첫 댓글 모달 체크박스는 대표 몫. 참가 승인 후 cap 1(글을 마가진에 추가, 연속 금지)' },
  google_play_featuring: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-25 게이트(자격) — 구글 추천 폼은 유료 앱 할인용, Apps Accelerator 신청은 대표 결정 ㊴' },
  bluesky_earnings_feeds: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-25 규칙 정의 — channels.json 에서 rejected(enabled:false). 발행 채널이 아니라 태그 실험이었고 기각됨 — 배정 대상 아님' },
  quora_spaces_share: { cap: 0, day: 'kst', window: [0, 24], note: '★2026-09-25 확장 티켓 — 큰 금융 Space 팔로워·제출 허용 여부 측정 전(검색 목록엔 팔로워 수 없음)' },
  bluesky_buildinpublic: { cap: 1, day: 'kst', window: [0, 24], note: '★2026-09-25 확장 — 블루스키 #buildinpublic 제작기(수치 1개 중심, 카드+from=bluesky_bip). 금융 글 캡과 별도. 9/28 판정' },
  bluesky_pt:  { cap: 1, day: 'kst', window: [7, 11], note: '★2026-09-30 13시 확장 — 같은 블루스키 계정의 포르투갈어 글(브라질: 블루스키 사용자 비중 큼). 창 07~11 KST = 브라질 저녁 19~23시(BRT). 계정 캡(bluesky_acct 3)에 합산. 태그 from=bluesky_pt · 앱 UI 영어라 «App em inglês» 명시. 원고 drafts/QUEUE-GLOBAL-2026-10-01.md §3-D. 판정 10/8: 폰 클릭 0 이면 중단' },
  note_pin: { cap: 1, day: 'week', window: [0, 24], note: '★2026-09-25 note 고정 기사(소개 글). 카드 … → クリエイターページに固定表示' },
  x_pin: { cap: 1, day: 'week', window: [0, 24], note: '★2026-09-25 X 미국 프로필 고정 소개 글(from=x_pin) — scripts/x-pin.mjs. 분기 1회 교체' },
  findupapp: { cap: 2, day: 'week', window: [0, 24], note: '★2026-10-05 03시 확장·실행 — FindUpApp(findupapp.com · 무료 · 로그인·이메일·약관 체크·심사 없음 앱 발견 디렉터리). iOS(JP)·Android(JP) 2건 등록·공개 확인 완료 — 같은 앱 재등록은 «既に登録済み» 로 거절되는 «한 번 해 두면 끝» 레인이라 channels.json 게이트(주기). 도구 scripts/ego/findupapp-submit.mjs(기본 드라이런)·findupapp-verify.mjs' },
  bluesky_pin: { cap: 1, day: 'week', window: [0, 24], note: '★2026-09-25 프로필 고정 소개 글(from=bluesky_pin) — scripts/bsky-pin.mjs. 분기 1회 교체' },
  bluesky_reply: { cap: 4, cap2: 6, day: 'kst', window: [0, 24], note: '★10/4 상한 개정(cap=1주차·cap2=2주차 10/11~ 가 정본 — 아래 옛 숫자는 이력, 근거 growth/FREQUENCY-CAPS-2026-10-04.md) 큰 금융 계정 글(게시 1시간 안)에 데이터 한 줄 답글 — getFeed(FinSky·EconSky)로 찾고 bsky-publish --reply-to. 링크·예측 없음' },
  github_pages_congress: { cap: 1, day: 'week', window: [0, 24], note: '주 1회 갱신 — node scripts/congress-dataset.mjs → github-upload.mjs(세 파일). 90일 창이 밀리므로 갱신을 거르면 «죽은 데이터»가 된다' },
  producthunt: { cap: 0, day: 'kst', window: [0, 24], note: '★2026-09-19 확장 등록(57번째). ★계정 대기(t200) — 메이커 계정이 런치 시점에 «약 1주일 이상» 돼 있어야 한다(당일 생성·당일 런치 금지)라 cap 0 으로 잠근다. 계정이 생기면 cap 1 로 올리고 «한 번만» 쏜다 — 6개월 내 재런치는 메이저 업데이트 심사 대상. 태그라인 60자 제한 · 링크는 제품을 받을 수 있는 대표 페이지 하나 · 런치는 1개월 전까지 예약 가능. 화·수·목 태평양시 아침이 노출이 높다. 준비물(한국어·영문 스크린샷, OG 이미지, 스마트링크)은 이미 있다.' },
  apple_ppo:   { cap: 1, day: 'week', window: [0, 24], note: '★(선행: 스크린샷 변형 3장 렌더 — t194) App Store «제품 페이지 최적화»(PPO) — 아이콘·스크린샷·미리보기 A/B(무료, ASC API appStoreVersionExperimentsV2). Play 실험의 iOS 짝. 텍스트는 대상 아님 → 스크린샷 변형(첫 장=프리마켓/실적) 준비가 먼저' },
  naver_search_advisor: { cap: 1, day: 'week', window: [0, 24], note: '★네이버 색인 0건(8/18 실측)의 가장 값싼 카드. 서치어드바이저 사이트 등록→소유확인(meta)→사이트맵 제출. 첫 문턱 = 이용약관 동의 1클릭(대표, t195)' },
  daum_search: { cap: 1, day: 'week', window: [0, 24], note: '★Daum 검색등록(register.search.daum.net) — 무료·로그인 불필요·사이트검색 신규등록 폼. 처리 결과는 이메일. 보안문자가 있으면 대표 1클릭' },
  play_listing_experiments: { cap: 0, day: 'week', window: [0, 24], note: '⏸보류(2026-09-18): 28일 스토어 방문 31명 → A/B 유의성 불가(내 기록 9/17). 트래픽 100/일 넘으면 재개. 지금은 «직접 개선»으로 대체' },
  indexnow:    { cap: 1, day: 'week', window: [0, 24], note: '★계정·게이트 없음. `node scripts/indexnow-submit.js` — sitemap 전량을 Bing·Yandex·Seznam·Naver 에 즉시 통보. 2026-08 에 만들어 1,800건만 쓰고 한 달 방치 → 09-18 6,768건 전량 200. 새 페이지가 늘면 다시 돌린다' },
  llms_txt:    { cap: 1, day: 'week', window: [0, 24], note: '★AI 검색(ChatGPT·Perplexity·Claude)이 읽는 표면. src/app/llms.txt/route.ts. 09-18 앱 섹션·?from=llms 3개 추가(그전 0개). 앱 사실이 바뀌면 갱신하고 IndexNow 로 통보' },
  naver_blog:  { cap: 3, cap2: 4, day: 'kst', window: [8, 20], note: '★10/4 상한 개정(cap=1주차·cap2=2주차 10/11~ 가 정본 — 아래 옛 숫자는 이력, 근거 growth/FREQUENCY-CAPS-2026-10-04.md) ★2026-09-25 창 8~18시 — RUNBOOK 시간대 규칙(08·12·16시 전후, 한국 밤·새벽 금지). [0,24] 였을 때 02시에 배정됐다. ★대표 승인 완료(2026-09-18) — 발행 중. blog.naver.com/donneum «인싸이트팟». 하루 1편(전역 안전선). ★2026-09-20 실측: 색인은 되는데 «자기 제목으로도» 30위 밖 = 권위 문제 → 제목은 «얇은 문»(상위30 제목 적합 0~3건) 질의를 맨 앞에 그대로. 카테고리 투자(주제 비즈니스·경제 자동). 평문 URL 은 링크가 아니다 — 빈 줄 URL+Enter 로 OG 카드. 발행 후 curl 로 <a href> 확인. 에디터에서 Meta+a 금지' },
  android_install_banner: { cap: 0, day: 'week', window: [0, 24], note: '★cap 0 — 발행 채널이 아니라 «1회 설정»이다. public/manifest.json 에 related_applications + prefer_related_applications 를 넣는 웹 자산 변경(대표 승인 필요). 붙기 전까지 할 일은 «확인» 하나: curl https://www.signumhq.com/manifest.json 에 두 키가 있는지. 붙은 뒤엔 Play 획득 보고서로 효과를 잰다' },
  apple_whats_new: { cap: 0, day: 'week', window: [0, 24], note: '★cap 0 — 빌드 게이트다. 라이브 버전에서 PATCH 하면 409 STATE_ERROR(2026-09-20 실측). 다시 시도하지 말 것. 편집 가능한 버전이 생기는 «그 사이클»에만 12로케일을 채운다(규칙은 NEXT-VERSION-CHECKLIST)' },
  play_promotional_content: { cap: 0, day: 'week', window: [0, 24], note: '★cap 0 — 아직 «있는지»도 확인 못 했다. 첫 행동은 발행이 아니라 확인: Play Console → 앱 → Grow users → Store presence 아래에 Promotional content(구 LiveOps) 항목이 있는가. 있으면 cap 1 로 올리고 애플 인앱이벤트와 같은 리듬으로 운영, 없으면 enabled:false 로 닫고 이유를 적는다(Play Developer page 처럼). 주소 직타 금지 — 눌러서 간다' },
  naver_topic_feed: { cap: 0, day: 'week', window: [0, 24], note: '★발행하지 않는다 — 네이버 블로그 글이 그대로 흘러드는 «피드»다(section.blog.naver.com/ThemePost.naver?directoryNo=33 비즈니스·경제). 행동은 주 1회 «노출 확인» 하나: directoryNo=33 에서 donneum 링크가 보이는지 재고 OUTREACH-LOG 에 적는다. 보이면 naver_blog 제목·주제 선택이 듣는 것이고, 안 보이면 피드가 선별형이라는 뜻이다. 비용 0' },
  naver_kin:   { cap: 12, day: 'kst', window: [8, 22], note: '★2026-09-28 창 7~24→8~22: 22:05·23:48 두 번 스캔(최근 질문 99·73건)에 맞는 질문 0 — 밤엔 새 질문이 거의 없어 헛배정만 났다. ★2026-09-25 창 7~24시 — 한국 낮 우선(RUNBOOK), 새벽엔 새 질문도 거의 없다. ★계정 필요. 답변 0건 질문 선점 = 영구 1등. 본문 링크 금지(사업자 홍보 판정) — 프로필 경유. 네이버 메이트 인용수 누적' },
  qiita:       { cap: 1, day: 'week', window: [0, 24], note: '★계정 필요. 자사 기술해설은 광고 아님(명문). 엔지니어링이 본문·미국옵션은 소재. 금융태그로는 아무도 안 온다 → 전체 트렌드 노림. 5~10 LGTM' },
  zenn:        { cap: 1, day: 'week', window: [0, 24], note: '★계정 필요. 홍보는 «말미 고정 메시지» 한 블록만. 일일트렌드 48칸·좋아요 1~2로도 진입' },
  discord_usstock: { cap: 1, day: 'week', window: [0, 24], note: '참여 우선. 콜드 링크 투척 = 규칙4 위반. 파이썬 채널에서 빌더로 먼저 알려질 것' },
  hatena_bookmark: { cap: 1, day: 'week', window: [0, 24], note: '자기 사이트 자기 북마크만 허용(1건·사람 속도). 서브계정·상호북마크 = 사이트 영구제재. 레인은 테크놀로지 엔지니어링 글 하나뿐' },
  reddit:      { cap: 3, cap2: 4, day: 'utc', window: [0, 24], note: '★10/4 상한 개정(cap=1주차·cap2=2주차 10/11~ 가 정본 — 아래 옛 숫자는 이력, 근거 growth/FREQUENCY-CAPS-2026-10-04.md) 무링크·무앱명·같은 스레드 중복 금지·8분 간격 · ⛔AI작성 금지 서브 제외: r/options·r/StockMarket·r/investing·r/iosapps · r/Daytrading 제외 · ★9/25 규칙 실측 추가: r/ValueInvesting·r/Bogleheads·r/economy·r/personalfinance·r/quant·r/CanadianInvestor·r/fatFIRE·r/JapanFinance (reddit-comment.mjs 가 거부)' },
  android_alt_stores: { cap: 1, day: 'week', window: [0, 24], note: '★계정 없이 제출 가능한 경로 있음(APKPure). «클릭»이 아니라 «설치»가 직접 발생하는 유일한 채널. APK 필요(AAB 아님)' },
  google_dataset_search: { cap: 1, day: 'week', window: [0, 24], note: '★무료·게이트 없음. 티커 페이지가 이미 @type:Dataset 을 싣는다 — distribution 만 넣으면 6,768 URL 이 동시에 대상(t163)' },
  hf_datasets: { cap: 2, cap2: 3, day: 'week', window: [0, 24], note: '★10/4 상한 개정(cap=1주차·cap2=2주차 10/11~ 가 정본 — 아래 옛 숫자는 이력, 근거 growth/FREQUENCY-CAPS-2026-10-04.md) ★계정 필요. 깃허브 데이터셋 미러 → 구글 데이터셋 검색 색인. 금융 니치가 비어 있다(검색 0건)' },
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
  tistory:     { cap: 1, cap2: 2, day: 'kst', window: [8, 20], note: '★10/4 상한 개정(cap=1주차·cap2=2주차 10/11~ 가 정본 — 아래 옛 숫자는 이력, 근거 growth/FREQUENCY-CAPS-2026-10-04.md) ★블로그 개설 대기(대표 1회). 다음 검색 전용 레인 — 네이버 블로그와 «같은 글» 금지, 제목·앵글을 달리한다' },
  apple_app_preview: { cap: 1, day: 'week', window: [0, 24], note: 'Remotion 으로 렌더 → appPreviewSets 업로드. 심사 대상이라 «버전과 함께» 나간다. en-US 한 편 검증 후 ko/ja 복제' },
  play_app_tags: { cap: 1, day: 'week', window: [0, 24], note: 'Store settings → Manage tags. 즉시·무심사. 어휘 고정 172개(stock·quiz 없음). 피어그룹도 같이 바뀌니 «약한 태그로 5칸 채우기» 금지' },
  android_deep_links: { cap: 1, day: 'week', window: [0, 24], note: '★대표 1회(매니페스트 intent-filter + autoVerify). 웹쪽 assetlinks.json 은 배포 완료. Play Console→Deep links 의 Status 로 검증' },
  disquiet:    { cap: 1, day: 'week', window: [9, 24], note: '★계정 필요(대표 1회). 한국판 Product Hunt — 홍보가 취지라 삭제 위험 없음. okky 11클릭이 근거' },
  github_pages: { cap: 1, day: 'week', window: [0, 24], note: '데이터셋 랜딩 + schema.org Dataset JSON-LD. 스냅샷 갱신 시 contentUrl·temporalCoverage 같이 갱신' },
  learning_scan: { cap: 1, day: 'week', window: [9, 23], note: '★2026-09-28 대표 지시 «더 최신 기술을 습득» — 주 1회: 스토어(애플·구글)·X·Threads·Bluesky·Reddit·네이버·구글 검색의 «새 기능·알고리즘 변화»를 1차 출처로 조사 → research/LEARNING-LOG.md 날짜별 기록 → 그 주에 시험할 1건을 channels.json 에 등록. pub 은 LEARNING-LOG 커밋 주소로' },
  rss_feed:    { cap: 1, day: 'week', window: [0, 24], note: '피드는 «이미 있다» — /{locale}/feed.xml 3개국어 200. 할 일은 네이버 RSS 제출·피드리더 등록이지 코드가 아니다. /rss 리다이렉트 대상만 404' },
  app_share:   { cap: 1, day: 'week', window: [0, 24], note: '★앱 코드(대표/개발). 공유 버튼 → ?from=share. 붙으면 클릭 추적표에 바로 올라온다' },
  taaft:       { cap: 1, day: 'week', window: [0, 24], note: '★계정 필요(t203). 디렉터리 등재는 «1회»다 — 무료 경로만, 유료 승급 금지. 등재문에 «AI가 무엇을 하는가»를 구체로: 프리마켓·섹터·매크로·기관수급을 읽어 매일 ko/en/ja 브리핑. 재등록·중복 제출 금지' },
  quora_en:    { cap: 1, day: 'utc', window: [0, 24], note: '§11-6 순수 가치·앱명 0~1회·데이터 화면 1장' },
  quora_jp:    { cap: 1, day: 'utc', window: [0, 24], note: '피드가 마르면 억지 발행 금지' },
  quora_de:    { cap: 1, day: 'utc', window: [0, 24], note: '2026-09-15 개통된 유럽 표면. 무응답은 «Dark Pool» 계열에만 있었다' },
  x_post:      { cap: 3, cap2: 4, day: 'kst', window: [0, 24], note: '★10/4 상한 개정(cap=1주차·cap2=2주차 10/11~ 가 정본 — 아래 옛 숫자는 이력, 근거 growth/FREQUENCY-CAPS-2026-10-04.md) 링크는 앞 280자 안' },
  x_reply:     { cap: 4, cap2: 5, day: 'kst', window: [21, 24], note: '★10/4 상한 개정(cap=1주차·cap2=2주차 10/11~ 가 정본 — 아래 옛 숫자는 이력, 근거 growth/FREQUENCY-CAPS-2026-10-04.md) 청중 차용. 280자 하드 제한·링크 금지·with_replies 로 검증' },
  x_reply_jp:  { cap: 2, cap2: 3, day: 'kst', window: [6, 10], note: '★10/4 상한 개정(cap=1주차·cap2=2주차 10/11~ 가 정본 — 아래 옛 숫자는 이력, 근거 growth/FREQUENCY-CAPS-2026-10-04.md) ★2026-09-30 07시 확장(새 곳 — 이미 해 본 «X 답글»을 일본 계정·일본 매체로) — @signumhq_jp(Premium+)로 일본 대형 매체(@nikkei 392만)의 «NY 마감» 글에 무링크 일본어 데이터 답글 1건(오늘 밤 일정 JST·나스닥 ✓ 종목 옵션 수치만). 도구 scripts/x-reply.mjs {handle:"/signumhq_jp"} — 루트 18만 미만·링크 거부·가중 280. 검증 = cdn.syndication.twimg.com tweet-result(비로그인). 판정: 3건 뒤 x_bio·x_jp 폰 클릭 변화 0 이면 닫는다(영어 x_reply 20건 0클릭 전례)' },
  // ★2026-09-30 05시 Threads 2자리 = 한국어 1(threads) + 일본어 1(threads_jp) · 영어 0 (HANDOFF §4 0-x)
  //   실측 ET 9/29: 폰 클릭을 낸 소셜 글은 한국어 Threads 본글(9/30 00:39) 1편뿐(iOS 2) — 영어 소셜(bluesky·x_us·medium·IH·threads 영어)은 전부 데스크톱.
  //   한국어 글은 기존 태그 from=threads 를 그대로 쓴다(00:39 한국어 글과 같은 태그 → 3일 폰 클릭 비교가 끊기지 않는다). 10/3 재판정.
  threads:     { cap: 2, cap2: 3, day: 'kst', window: [7, 23], note: '★10/4 상한 개정(cap=1주차·cap2=2주차 10/11~ 가 정본 — 아래 옛 숫자는 이력, 근거 growth/FREQUENCY-CAPS-2026-10-04.md) ★2026-09-30 한국어 전용(영어 0) — 한국 아침 07~09시 «간밤 미장» 우선 · 앱 화면(ko) + ?from=threads · 폰 클릭 실측으로 10/3 재판정. (이전 9/25: 영어 하루 2→1, 건당 0.36클릭) ★2026-10-04 재판정 통과: 21일 폰 9/17편(건당 폰 0.53·폰 비율 60%) = 게시 채널 중 폰이 나는 사실상 유일한 곳(블루스카이 0.11·X 0.04·Medium 0.13·note 0) → 하루 2편(아침 07~09 «간밤 미장 결과» + 저녁 20~23 «오늘 밤 미장 일정», 소재·앱 화면 다르게). 계정 합계 캡 threads_acct 2 는 그대로(일본어 threads_jp 폰 건당 0.2 보다 한국어에 둘째 칸을 준다). 10/11 재판정 — 건당 폰 0.4 미만이면 1 로 복귀' },
  threads_kr:  { cap: 0, day: 'kst', window: [7, 23], note: '★2026-09-30 쓰지 않는 id — 한국어 자리는 threads(태그 from=threads)가 맡는다. 태그를 따로 재야 할 때만 연다' },
  bluesky_jp:  { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-25 보류 — 일본어 주식 피드가 작다(좋아요 2~21)' },
  threads_jp:  { cap: 2, cap2: 2, day: 'kst', window: [7, 23], note: '★10/4 상한 개정(cap=1주차·cap2=2주차 10/11~ 가 정본 — 아래 옛 숫자는 이력, 근거 growth/FREQUENCY-CAPS-2026-10-04.md) ★2026-09-25 확장 — 같은 Threads 계정의 일본어 글 + 주제 태그 #米国株(글당 태그 1개, 본문 해시태그가 주제로 바뀐다). 실측: 米国株·NISA 주제 인기글 좋아요 365~879·답글 64~131. 앱 화면(ja)+ ?from=threads_jp. 예측·권유 금지' },
  threads_reply: { cap: 3, cap2: 4, day: 'kst', window: [0, 24], note: '★10/4 상한 개정(cap=1주차·cap2=2주차 10/11~ 가 정본 — 아래 옛 숫자는 이력, 근거 growth/FREQUENCY-CAPS-2026-10-04.md) 오독 정정은 반드시 원문 확인 후' },
  instagram:   { cap: 3, cap2: 5, day: 'week', window: [0, 24], note: '★10/4 상한 개정(cap=1주차·cap2=2주차 10/11~ 가 정본 — 아래 옛 숫자는 이력, 근거 growth/FREQUENCY-CAPS-2026-10-04.md) ★2026-09-25 하루 1 → 주 2(줄이되 죽이지 않는다): 9/25 01:58 게시물 9시간 인사이트 = 조회 0·반응 0·프로필 방문 0·링크 누름 0, 21일 건당 0.4클릭. 자르기 «원본»·링크는 바이오. 웹엔 «프로필 고정» 메뉴 없음(앱 전용)' },
  pinterest:   { cap: 2, cap2: 3, day: 'kst', window: [0, 24], note: '★10/4 상한 개정(cap=1주차·cap2=2주차 10/11~ 가 정본 — 아래 옛 숫자는 이력, 근거 growth/FREQUENCY-CAPS-2026-10-04.md) 링크 입력 후 값 재읽기→저장→공개 href 3단 검증' },
  linkedin:    { cap: 1, day: 'kst', window: [0, 24], note: '카드 위 클릭 금지·전체 재입력' },
  linkedin_articles: { cap: 1, day: 'kst', window: [0, 24], note: '★2026-09-24 첫 아티클 발행(피드 «글쓰기»→/article/new/). 편집기는 iframe — 커버=«컴퓨터에서 업로드»(text 선택자)→다음, 제목칸은 좌표 클릭(텍스트 선택자는 textarea 입력 불가), 본문은 키 입력. ⚠ Shift+End 는 문서 끝까지 선택(본문이 통째로 지워졌다)' },
  linkedin_groups: { cap: 1, day: 'kst', window: [0, 24], note: '★2026-09-24 확장 — «US Stock Market | Trading & Investing»(공개·6,033명·금융업 963명) 가입 요청(운영자 승인 대기). 그룹 화면은 iframe — 버튼은 snapshot ref 로 누른다(좌표·DOM 질의는 IFRAME 만 잡힌다)' },
  tildes: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-26 보류 — 초대 코드 전용' },
  digg: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-26 보류 — 기술 뉴스 큐레이션(제출형 아님)' },
  lobsters: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-26 보류 — 초대제' },
  substack_notes: { cap: 0, day: 'kst', window: [0, 24], note: '★2026-09-27 확장 발굴 — 계정 게이트(로그아웃 실측). 계정이 생기면 cap 1' },
  correction: { cap: 12, day: 'kst', window: [0, 24], note: '★2026-09-27 정정 — 자기 글에 다는 정정 답글·본문 수정. 홍보가 아니라 바로잡기라 채널 캡에 합산하지 않는다(의회 거래 192건 부분집합 정정 7곳)' },
  line_official_jp: { cap: 0, day: 'kst', window: [5, 9], note: '★2026-09-27 확장 — 계정 게이트(LINE Business ID). 무료 월 200통' },
  telegram_kr: { cap: 0, day: 'kst', window: [0, 24], note: '★2026-09-27 확장 — 대표결정 게이트(계정·규제 민감성)' },
  apple_news: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-27 확장 — 계정 게이트(News Publisher). RSS 신규 수용 여부 미확정' },
  awesome_investing_lists: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-27 기각 — 최근 닫힌 PR 병합 0(세 목록)' },
  // ★2026-10-05 02시 규칙 정의 — 01시 회차가 channels.json 에만 «기각»을 적어 둬서 slot 이 «규칙 미정의»로 한 회차 더 경고했다(MISTAKES #21·#40: 도구의 신호는 그 회차에 규칙까지)
  awesome_financial_data_apis: { cap: 0, day: 'week', window: [0, 24], note: '★2026-10-05 기각 — 라이브 API 전용 목록(정적 데이터셋 저장소는 대상 아님)·별 6·커밋 1회' },
  jp_blog_listing: { cap: 0, day: 'week', window: [0, 24], note: '★2026-10-05 확장 티켓 — イチリタブログ(米国株アプリ11選·옵션 앱 없음) 문의 폼 게재 의뢰. 폼 제출 = 외부 발송이라 대표 승인 전 0(초안 press/READY-TO-SEND.md §⑦)' },
  awesome_quant: { cap: 1, day: 'week', window: [0, 24], note: '★2026-09-27 확장 — awesome-quant 상업 서비스 칸 등재 1회(선행: 콜월 정의 정합·데이터셋 정리)' },
  apd_core: { cap: 1, day: 'week', window: [0, 24], note: '★2026-09-27 확장 — awesome-public-datasets(apd-core) Finance 등재 1회. 먼저 데이터셋 휴장일 파일 정리(channels.json 메모 순서)' },
  tsukutta: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-27 확장 발굴 — 계정 게이트(구글 OAuth/이메일 가입 + 로그인 시 약관 동의). 계정이 생기면 cap 1(주간 개발기 일·영)' },
  app_village: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-27 확장 발굴 — 계정 게이트(GitHub/Google OAuth). 계정이 생기면 앱 3개 1회 등록' },
  hf_spaces: { cap: 1, day: 'week', window: [9, 23], note: '★2026-09-27 확장 — HF Spaces 정적 데모(다크풀 비중·옵션 구조). 얇은 문: «dark pool» Space 1개·«short volume» 0' },
  github_awesome_ko: { cap: 1, day: 'week', window: [9, 23], note: '★2026-09-26 확장 — 한국어 «미국주식 무료 데이터 출처» 목록 저장소(얇은 문: 52개·최다 별 2)' },
  threads_reply_jp: { cap: 2, cap2: 3, day: 'kst', window: [5, 24], note: '★10/4 상한 개정(cap=1주차·cap2=2주차 10/11~ 가 정본 — 아래 옛 숫자는 이력, 근거 growth/FREQUENCY-CAPS-2026-10-04.md) ★2026-09-30 05시 재개(대상 변경 = 새 곳) — 초보 조언 요청 글(9/26 보류 사유)이 아니라 일본 경제 매체 계정의 미국 시장 글에만: @reutersjapan(ロイター 1.65만, 매일 «米国株式市場＝…» 마감 글 05~06시 JST)·@nikkei(日経 9.1만). 무링크 일본어 데이터 답글 1건 + 앱 카드. 비로그인 크롤러 UA 로 게시물 코드 찾기(/@reutersjapan HTML «code»)' },
  threads_reply_kr: { cap: 2, cap2: 3, day: 'kst', window: [7, 24], note: '★10/4 상한 개정(cap=1주차·cap2=2주차 10/11~ 가 정본 — 아래 옛 숫자는 이력, 근거 growth/FREQUENCY-CAPS-2026-10-04.md) ★2026-09-30 확장 — 한국어 미국주식·금리 글(개인 투자자 글 포함, 9/30 첫 건 = 나이키)에 무링크 데이터 답글 1건. 매수 질문·조언 요청에 답하지 않는다(사실 데이터만). 영어 답글(0클릭/10)과 달리 KR 스토어·한국어 앱 화면으로 이어지는지 실측' },
  free_press_release: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-26 게이트(계정) — PRLog 무료 배포는 계정 필요' },
  bluesky_kr: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-26 보류 — 한국어 블루스키 미국주식 대화 없음(최근 글 32h~393h 전)' },
  smartnews: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-26 게이트(외부 신청 + SmartFormat RSS 웹 배포)' },
  google_news: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-26 게이트(웹 배포) — 구글 뉴스 KR 색인 18건·검색 순위 0. NewsArticle·news-sitemap 필요' },
  geeknews_comment: { cap: 2, cap2: 3, day: 'week', window: [9, 23], note: '★10/4 상한 개정(cap=1주차·cap2=2주차 10/11~ 가 정본 — 아래 옛 숫자는 이력, 근거 growth/FREQUENCY-CAPS-2026-10-04.md) ★2026-09-26 확장 — GeekNews 댓글(무링크·앱명 없이 실측 데이터). 가이드라인: 홍보·트래픽 유도·대량 요약형은 노출 제한' },
  aptoide: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-26 게이트(계정) — Aptoide Connect 개발자 계정(대표). 세 패키지 모두 미등재(404)' },
  yahoo_news_expert: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-26 게이트(자격) — 초청제, 공개 신청 경로 없음' },
  toss_community: { cap: 0, day: 'week', window: [0, 24], note: '★2026-09-26 게이트(대표결정) — 토스증권 피드 주제별 커뮤니티(미국주식이야기 등). 글쓰기 = 대표 개인 실명 계정' },
  note_kojin: { cap: 2, cap2: 3, day: 'week', window: [18, 23], note: '★10/4 상한 개정(cap=1주차·cap2=2주차 10/11~ 가 정본 — 아래 옛 숫자는 이력, 근거 growth/FREQUENCY-CAPS-2026-10-04.md) ★2026-09-26 확장 — note #個人開発(글 56,751·토요일 아침 1시간 20편·인기글 좋아요 10~98). 일본어 제작기(실측 수치) + 앱 화면 + from=note_kojin. 개발자 커뮤니티 제작기 = 우리 이긴 패턴(IH·GeekNews)의 일본판. 저녁 창(일본 개발자 퇴근 뒤)' },
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
  medium:      { cap: 1, cap2: 2, day: 'kst', window: [0, 24], note: '★10/4 상한 개정(cap=1주차·cap2=2주차 10/11~ 가 정본 — 아래 옛 숫자는 이력, 근거 growth/FREQUENCY-CAPS-2026-10-04.md) ★AI 지원 표시 «필수» — 미표시는 Network Only 로 도달이 팔로워(≈0)로 잘린다. 말미에 disclosure 한 줄. 제목 복구 ⌘⌥1 → 1문단 → 이미지 순서' },
  indiehackers:{ cap: 3, cap2: 4, day: 'week', window: [0, 24], note: '★10/4 상한 개정(cap=1주차·cap2=2주차 10/11~ 가 정본 — 아래 옛 숫자는 이력, 근거 growth/FREQUENCY-CAPS-2026-10-04.md) 제품 타임라인 포스트' },
  indiehackers_comment: { cap: 3, cap2: 3, day: 'kst', window: [0, 24], note: '★2026-10-04 신설 — IH 댓글(남의 글·스레드, 가치·무링크). 커뮤니티 규범 «내 제품 글 1편마다 진짜 댓글 여러 개»(give-to-ask) — indiehackers 글 주 3편의 짝(글 1편당 댓글 3개 이상). 기록: node scripts/mkt-plan.js pub indiehackers_comment <댓글 URL>' },
  github:      { cap: 1, day: 'kst', window: [5, 24], afterUsClose: true, note: '미국 마감 후 스냅샷 → edit/new 경로로 커밋 (새 정규장 마감이 없으면 배정 안 함 — 주말·휴장)' },
  x_jp:        { cap: 3, cap2: 4, day: 'kst', window: [5, 12], note: '★10/4 상한 개정(cap=1주차·cap2=2주차 10/11~ 가 정본 — 아래 옛 숫자는 이력, 근거 growth/FREQUENCY-CAPS-2026-10-04.md) ★2026-10-05 정정: 규칙 창은 «5~12시»다(코드 window:[5,12] 가 정본 — 아래 옛 «5~9시»는 9/25 기록·06~08시 회차가 이 옛 문구를 보고 «09시 이후 일반 글 없음»으로 오판해 X 일본어 3번째 칸을 놀렸다, MISTAKES #90). ★2026-09-25 창 5~9시(KST=JST) — ENGINE §17-3 일본 아침. [0,24] 였을 때 일본 새벽(02시)에 «실행 1순위»로 두 사이클 연속 배정됐다(note_jp 와 같은 종류). JP 원글. 계정 전환 후 프로필 링크가 /signumhq_jp 인지 확인하고 쓴다(오발행 전례)' },
  bluesky:     { cap: 5, cap2: 7, day: 'kst', window: [0, 24], note: '★10/4 상한 개정(cap=1주차·cap2=2주차 10/11~ 가 정본 — 아래 옛 숫자는 이력, 근거 growth/FREQUENCY-CAPS-2026-10-04.md) 웹 컴포저. 이미지 첨부는 ego 불가 → 앱 스마트링크의 OG 카드가 자동 임베드되는지 확인하고, 카드가 붙을 때만 발행' },
  quora_space: { cap: 1, day: 'kst', window: [0, 24], note: '브랜드명·앱링크가 허용되는 유일한 Quora 표면 — 답변 재활용 금지, Space 전용 글' },
  hackernews:  { cap: 0, day: 'week', window: [0, 24], note: '⛔관리 제외(대표 전용) — 사이트 전체 가이드라인 「Don\'t post generated text or AI-edited text」. 내가 쓰면 규정 위반' },
  directories: { cap: 1, day: 'kst', window: [0, 24], note: 'DIRECTORY-LIST.md 에서 미시도 1곳씩. 계정 생성 필요하면 즉시 #T8 티켓' },
  aso:         { cap: 1, day: 'week', window: [0, 24], note: '주간: 앱스토어·플레이 키워드 순위와 평점 수 점검 → ASO-KEYWORD-MAP 갱신' },
  seo:         { cap: 1, day: 'week', window: [0, 24], note: '주간: GSC 상위질의·색인 수 점검. 게시 채널이 아니라 사이트 작업' },
  tiktok:      { cap: 1, day: 'week', window: [0, 24], note: '신생계정 도달 0 실측 — 주 1회 유지 게시만(비용 0), 성과 기대 금지' },
};
// ★2026-09-30 03시 «보류» — 캡 0 + 게이트 사유를 이 한 곳에서. 되돌리기 = 그 채널 줄을 지운다(캡·배정·게이트 표시가 원래대로).
//   CH 의 cap 은 건드리지 않는다 — counts() 가 캡을 0 으로, REG 가 게이트로 읽는다.
const HOLD = {
  linkedin:          { kind: '약관', who: '대표 결정(HANDOFF §3 li-tos)', why: '링크드인 이용약관 8.2 가 봇·자동화로 글 «작성»을 명문 금지 — ego 자동 발행이 정면 대상. 건당 클릭 ≈0(피드 8편). 계속·수동·중단은 대표 결정' },
  linkedin_articles: { kind: '약관', who: '대표 결정(HANDOFF §3 li-tos)', why: '링크드인 이용약관 8.2(자동화 게시 금지) — 아티클 자동 발행도 같은 조항. 건당 클릭 0(6편). 계속·수동·중단은 대표 결정' },
  // ★2026-09-30 09시: 그룹 «가입 요청 승인 대기» 게이트(until 9/30)가 풀리자 실행 1순위로 배정됐다(도구의 신호) — 그룹 글도 같은 8.2 조항이라 여기로 묶는다
  linkedin_groups:   { kind: '약관', who: '대표 결정(HANDOFF §3 li-tos)', why: '링크드인 이용약관 8.2(봇·자동화로 글 작성·댓글 금지) — 그룹 글 자동 발행도 같은 조항. 9/24 가입 요청(US Stock Market 그룹)은 승인 대기였다. 계속·수동·중단은 대표 결정' },
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
// ★2026-10-04 합계 캡도 개정(cap=1주차 · cap2=2주차 10/11~, 같은 경고·하향 규칙). 근거: FREQUENCY-CAPS-2026-10-04.md — 블루스카이 7편/일(9/21)·6편/일(9/25·9/28)이 제재·라벨 없이 지나갔다(실측).
//   하위 채널 합산 규칙은 그대로다 — 새 하위 채널을 만들면 반드시 members 에 넣는다.
const ACCOUNTS = {
  bluesky_acct:  { cap: 5, cap2: 7, members: ['bluesky', 'bluesky_buildinpublic', 'bluesky_pin', 'bluesky_pt'] },
  threads_acct:  { cap: 4, cap2: 5, members: ['threads', 'threads_jp', 'threads_kr', 'threads_communities'] },
  x_us_acct:     { cap: 3, cap2: 4, members: ['x_post', 'x_pin'] },
  x_jp_acct:     { cap: 3, cap2: 4, members: ['x_jp'] },
  mastodon_acct: { cap: 2, members: ['mastodon'] }, // 정지(9/23) — 재개 조건은 FREQUENCY-CAPS 문서
  naver_acct:    { cap: 3, cap2: 4, members: ['naver_blog'] },
};
function acctOf(ch) { for (const [k, a] of Object.entries(ACCOUNTS)) if (a.members.includes(ch)) return k; return null; }
// ★2026-10-05 02시 «간격 대기» 표시 — 같은 계정 본글 간격(지시서: 블루스키 1시간·X 2시간·Threads 4시간, Threads 한·일은 같은 계정 @signumhq_official).
//   레인이 «열림»(캡·창 통과)이어도 간격 안이면 지금 못 올린다. bluesky·x_us 가 매시 «실행»으로 배정돼 00·01·02시 회차가 «다음 가능 시각»을 손으로 계산했다 → 도구의 신호.
//   표시만 한다(열림/닫힘 판정·캡은 불변). 계산이 틀려도 배정은 계속된다(try/catch). 답글 채널은 ACCOUNTS.members 에 없어 세지 않는다.
const SPACING_H = { bluesky_acct: 1, x_us_acct: 2, x_jp_acct: 2, threads_acct: 4 };
// ★2026-10-05 03시 «링크 비율» 표시 — 규칙(FREQUENCY-CAPS §2): 블루스키 링크 있는 글 «절반 이하». 10/5 KST 본글 3편이 전부 링크 글이었는데 slot 이 비율을 몰랐다.
//   계산은 scripts/bsky-link-ratio.mjs(공개 API 로 «실제 본문»을 읽어 센다 — 원장 메모는 빠뜨린다) → /tmp/ego/bsky-link-ratio.json. 여기서는 «읽어서 표시»만 한다(표시 전용 — 열림/닫힘·캡 불변·실패하면 조용히 생략).
//   slot 은 캐시가 20분 넘으면 도구를 한 번 돌려 갱신하고(시험용 MKT_LEDGER_PATH 가 있으면 건너뜀), 블루스키 글을 pub 하면 도구를 «분리 실행»해 다음 slot 이 최신 비율을 본다.
const BSKY_RATIO_FILE = '/tmp/ego/bsky-link-ratio.json';
function ensureBskyRatio() {
  try {
    if (process.env.MKT_LEDGER_PATH) return;
    let age = Infinity; try { age = Date.now() - fs.statSync(BSKY_RATIO_FILE).mtimeMs; } catch {}
    if (age < 20 * 60e3) return;
    require('child_process').spawnSync(process.execPath, [path.join(__dirname, 'bsky-link-ratio.mjs'), '--quiet'], { timeout: 20000, stdio: 'ignore' });
  } catch {}
}
function bskyRatio() {
  try { const j = JSON.parse(fs.readFileSync(BSKY_RATIO_FILE, 'utf8')); return j && j.total ? j : null; } catch { return null; }
}
function bskyLinkTag(id) { // 「실행」 줄용 — 다음 글에 링크를 넣으면 절반을 넘을 때만 말한다
  try { if (!ACCOUNTS.bluesky_acct.members.includes(id)) return ''; const j = bskyRatio(); if (!j || j.nextLinkOk) return '';
    return '🔗 링크 글 ' + j.withLink + '/' + j.total + '(최근 ' + j.hours + 'h)' + (j.over ? ' 절반 초과' : '') + ' — 다음 글은 «링크 없는 글»(규칙: 절반 이하) · '; } catch { return ''; }
}
function bskyLinkShort(id) { try { if (!ACCOUNTS.bluesky_acct.members.includes(id)) return ''; const j = bskyRatio(); return j && !j.nextLinkOk ? ' 🔗링크글 ' + j.withLink + '/' + j.total + '→다음은 링크 없이' : ''; } catch { return ''; } }
function spacingWaitMs(led, key) {
  try {
    const acc = acctOf(key); const gap = acc && SPACING_H[acc]; if (!gap) return 0;
    const mem = ACCOUNTS[acc].members;
    const last = led.entries.filter((e) => mem.includes(e.ch)).reduce((m, e) => Math.max(m, Date.parse(e.at) || 0), 0);
    const until = last + gap * 3600e3;
    return last && until > Date.now() ? until : 0;
  } catch { return 0; }
}
function counts() {
  const led = load(); const k = kstDate(); const u = utcDate();
  // ★2026-10-04 «기준 캡» — 2주차 값(cap2)은 10/11 부터, 그리고 «마지막 경고 뒤 14일이 지난» 키에만. 하향 중이면 절반(내림 — 1편짜리는 0 = 7일 정지).
  //   MKT_FAKE_KST 는 시험용(날짜를 앞당겨 2주차 전환을 본다).
  const H = HL.all(); const nowMs = Date.now(); const ramp2 = (process.env.MKT_FAKE_KST || k) >= RAMP2_FROM;
  const capFor = (key, r, acct) => {
    const lastInc = Math.max(HL.lastIncidentMs(H, key), acct ? HL.lastIncidentMs(H, acct) : 0);
    const up = r.cap2 != null && ramp2 && nowMs - lastInc > HL.RAMP_BLOCK_DAYS * 86400000;
    const base = up ? r.cap2 : r.cap;
    const down = HL.active(H, key, nowMs) || (!!acct && HL.active(H, acct, nowMs));
    return { base, cap: down ? HL.halve(base) : base, down, up };
  };
  const out = {};
  for (const [ch, r] of Object.entries(CH)) {
    const d = r.day === 'utc' ? u : k;
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const used = r.day === 'week'
      ? led.entries.filter((e) => e.ch === ch && e.kst >= weekAgo).length
      : led.entries.filter((e) => e.ch === ch && (r.day === 'utc' ? e.utc === d : e.kst === d)).length;
    const cf = capFor(ch, r, acctOf(ch));
    const cap = HOLD[ch] ? 0 : cf.cap;
    out[ch] = { used, cap, base: cf.base, down: cf.down, ramp2: cf.up, left: Math.max(0, cap - used), over: !HOLD[ch] && used > cf.base, day: r.day, window: r.window, note: HOLD[ch] ? '⛔보류[' + HOLD[ch].kind + '] ' + HOLD[ch].why : r.note };
    if (r.afterUsClose) {
      const last = led.entries.filter((e) => e.ch === ch).map((e) => e.at).sort().pop();
      out[ch].noNewClose = !!last && Date.parse(last) >= lastUsCloseMs();
    }
  }
  // 계정 합계 캡 적용(KST 하루) — 합계 캡도 같은 규칙(2주차 값·하향)을 따른다
  for (const [kk, a] of Object.entries(ACCOUNTS)) {
    const cf = capFor(kk, a, null);
    const total = led.entries.filter((e) => a.members.includes(e.ch) && e.kst === kstDate()).length;
    for (const m of a.members) {
      if (!out[m]) continue;
      out[m].acct = kk; out[m].acctUsed = total; out[m].acctCap = cf.cap; out[m].acctDown = cf.down;
      if (total >= cf.cap) { out[m].left = 0; }
      if (total > cf.base) { out[m].acctOver = true; }
    }
  }
  return out;
}

const ALIAS = { x_us: 'x_post', quora: 'quora_en', note: 'note_jp', bluesky_bip: 'bluesky_buildinpublic', wsb_earnings_thread: 'reddit' }; // wsb 스레드 댓글은 레딧 하루 3건(UTC)에 합산(2026-09-26) // 클릭 태그 → 규칙 id (bluesky_bip: 2026-09-26)
const cmd = process.argv[2];
if (cmd === 'pub') {
  let [, , , ch, url, ...rest] = process.argv;
  // ★2026-09-27 slot 은 channels.json 의 id(x_us 등)를 배정하는데 pub 은 규칙 id(x_post)만 받아 «알 수 없는 채널»로 기록이 막혔다 → 별칭을 규칙 id 로 바꿔 기록한다.
  // ★2026-09-30 별칭 원래 이름을 원장에 남긴다(via) — 예전엔 wsb_earnings_thread 가 reddit 으로만 남아 «한 번도 안 쓴 표면»으로 오판됐다(9/30 10시 같은 스레드 재댓글 사고).
  let via = null;
  if (!CH[ch] && ALIAS[ch] && CH[ALIAS[ch]]) { console.log(`(별칭 ${ch} → ${ALIAS[ch]} 로 기록, via 에 원래 이름)`); via = ch; ch = ALIAS[ch]; }
  if (!CH[ch]) { console.error('알 수 없는 채널. 가능: ' + Object.keys(CH).join(', ')); process.exit(1); }
  // ★ 2026-09-18 — 잘린 URL(«...» 포함)이 원장에 들어가 있었고, 그것 때문에 «삭제됨»으로 오판했다.
  //   http 로 시작하는 값은 형태를 검사한다(레딧 댓글 ID 같은 «비 URL 식별자»는 그대로 허용).
  if (typeof url === 'string' && /^https?:/i.test(url) && (/\.\.\./.test(url) || /\s/.test(url) || url.length < 20)) {
    console.error('✗ URL 이 잘렸거나 공백이 있다 — 기록하지 않는다:\n  ' + url + '\n  공개 페이지에서 주소를 «복사»해 다시 시도하라(추측 금지).');
    process.exit(1);
  }
  const led = load(); led.entries.unshift({ ch, ...(via ? { via } : {}), url: url || '', note: rest.join(' '), at: new Date().toISOString(), kst: kstDate(), utc: utcDate() });
  led.entries = led.entries.slice(0, 500); save(led);
  if (!process.env.MKT_LEDGER_PATH && acctOf(ch) === 'bluesky_acct') { try { require('child_process').spawn(process.execPath, [path.join(__dirname, 'bsky-link-ratio.mjs'), '--quiet'], { detached: true, stdio: 'ignore' }).unref(); } catch {} } // 링크 비율 갱신(10/5)
  const c = counts()[ch]; console.log(`기록: ${ch} ${url || ''} → 오늘 ${c.used}/${c.cap} (${c.day} 기준)` + (c.acct ? ` · 계정 합계 ${c.acctUsed}/${c.acctCap}(${c.acct})` : ''));
  if (c.acctOver) console.log(`⚠ 계정 합계 캡 초과 — ${c.acct} 오늘 ${c.acctUsed}/${c.acctCap}. 안전선 위반이다: OUTREACH-LOG 에 기록하고 오늘은 이 계정에 더 올리지 않는다.`);
  // ★2026-10-04 자동 한 단계 하향 — 기록 노트가 스팸·한도·제한·공개 미확인·삭제 신호면 그 계정(묶음)의 캡을 7일간 절반(내림)으로 낮춘다
  { const sig = HL.classify(rest.join(' '), true); if (sig.signal) { const key = acctOf(ch) || ch; const rec = HL.mark(key, ch + ' pub 노트: ' + rest.join(' '), 'pub-note'); const c2 = counts()[ch];
      console.log('⚠ 자동 한 단계 하향 — «' + sig.matched + '» → ' + key + ' 7일간 절반(내림) · ' + ch + ' 상한 ' + c2.cap + '(기준 ' + c2.base + ')' + (c2.acct ? ' · 계정 합계 상한 ' + c2.acctCap : '') + ' · ' + new Date(rec.until).toISOString().slice(5, 10) + ' 까지 · 오탐이면 node scripts/mkt-plan.js health clear ' + key + ' forget'); } }
  process.exit(0);
}
// ★2026-10-04 계정 건강 «자동 한 단계 하향» (대표 10/4 09시 «상한은 최대치로 — 문제 신호가 보이면 낮춰라»)
//   fail <채널> [--scan] <사유…> : 게시 실패·제한 문구·공개 미확인을 기록. 사유가 스팸·한도·제한·정지·경고·도달 급감 신호면 그 계정(묶음)의 캡을 7일간 절반(내림, 1편짜리는 0)으로 — 일반 오류(로그인 만료·편집기 실패)는 캡을 건드리지 않는다.
//   health                       : 하향 중인 계정·자동 복귀 시각 + 상한 단계(1주차/2주차) + 오늘 계정 합계
//   health <채널|계정> <사유…>   : 수동 표시(도달 급감·경고 알림을 눈으로 봤을 때)
//   health clear <키> [forget]   : 조기 복구(forget 이면 기록까지 지워 2주차 상향 잠금도 푼다 — 오탐일 때)
const ruleOf = (x) => (CH[x] ? x : (ALIAS[x] && CH[ALIAS[x]] ? ALIAS[x] : null));
const healthKeyOf = (x) => (ACCOUNTS[x] ? x : (ruleOf(x) ? (acctOf(ruleOf(x)) || ruleOf(x)) : null));
const fmtKst = (t) => kst(new Date(t)).toISOString().slice(5, 16).replace('T', ' ') + ' KST';
function healthLines() {
  const H = HL.all(); const now = Date.now(); const lines = [];
  const ph = (process.env.MKT_FAKE_KST || kstDate()) >= RAMP2_FROM ? '2주차(10/11~)' : '1주차(10/4~10/10)';
  lines.push('■ 상한 단계 — 지금 ' + ph + '. 2주차 상한(cap2)은 10/11 부터 «마지막 경고 뒤 14일 무사고» 계정·채널에만 자동 적용 · 정책·한도·제한·도달 급감 신호 = 7일간 절반(내림)');
  const on = Object.entries(H).filter(([k]) => HL.active(H, k, now));
  if (!on.length) lines.push('   · 건강: 하향 중인 계정 없음(모두 정상)');
  for (const [k, r] of on) lines.push('   ⚠ ' + k + ' 하향 중 → ' + fmtKst(r.until) + ' 자동 복귀 · ' + r.by + ' · ' + String(r.reason).slice(0, 90));
  for (const [k] of Object.entries(H)) { const li = HL.lastIncidentMs(H, k); if (!HL.active(H, k, now) && li && now - li < HL.RAMP_BLOCK_DAYS * 864e5) lines.push('   · ' + k + ': 복귀했지만 마지막 신호(' + fmtKst(li) + ') 뒤 14일 전까지 2주차 상한 잠금'); }
  return lines;
}
if (cmd === 'fail') {
  let [, , , chArg, ...rest] = process.argv; let scanMode = false; if (rest[0] === '--scan') { scanMode = true; rest = rest.slice(1); }
  const rule = ruleOf(chArg); if (!rule) { console.error('알 수 없는 채널: ' + chArg + ' (가능: ' + Object.keys(CH).join(', ') + ')'); process.exit(1); }
  const key = healthKeyOf(chArg); const reason = rest.join(' '); const cl = HL.classify(reason);
  if (!cl.signal) { console.log('실패 기록: ' + rule + ' — 정책·한도·제한 신호가 아니다(일반 오류) → 캡 유지. 사유: ' + reason.slice(0, 120)); process.exit(0); }
  if (scanMode && HL.active(HL.all(), key)) { console.log('(이미 하향 중: ' + key + ') — 점검이 만든 신호는 기한을 밀지 않는다'); process.exit(0); }
  const rec = HL.mark(key, rule + ': ' + reason, scanMode ? 'scan' : 'fail'); const cc = counts()[rule];
  console.log('⚠ 자동 한 단계 하향 — ' + key + ' 를 ' + fmtKst(rec.until) + ' 까지 7일간 절반(내림): ' + rule + ' 상한 ' + cc.cap + '(기준 ' + cc.base + ')' + (cc.acct ? ' · 계정 합계 상한 ' + cc.acctCap : '') + ' · 신호어 «' + cl.matched + '»');
  console.log('  → 7일 뒤 자동 복귀 · 마지막 신호 뒤 14일 안에는 2주차 상한(cap2)으로 올리지 않는다 · OUTREACH-LOG 에 사유 원문을 적을 것 · 오탐이면 node scripts/mkt-plan.js health clear ' + key + ' forget');
  process.exit(0);
}
if (cmd === 'health') {
  const a = process.argv.slice(3);
  if (a[0] === 'clear') { const key = healthKeyOf(a[1] || ''); if (!key) { console.error('사용: health clear <채널|계정> [forget]'); process.exit(1); } console.log(HL.clear(key, a[2] === 'forget') ? '복구: ' + key + (a[2] === 'forget' ? ' (기록까지 삭제 — 2주차 상향 잠금 해제)' : ' (기록은 남김 — 마지막 신호 뒤 14일간 2주차 상한 잠금)') : '하향 기록 없음: ' + key); process.exit(0); }
  if (a[0]) { const key = healthKeyOf(a[0]); if (!key) { console.error('알 수 없는 채널·계정: ' + a[0]); process.exit(1); } const why = a.slice(1).join(' ') || '수동 표시'; const rec = HL.mark(key, why, 'manual'); console.log('⚠ 수동 하향 — ' + key + ' 를 ' + fmtKst(rec.until) + ' 까지 7일간 절반(내림). 사유: ' + why.slice(0, 120)); process.exit(0); }
  healthLines().forEach((l) => console.log(l));
  const cs = counts(); console.log('\n오늘 계정 합계(KST) / 유효 상한:');
  for (const [k, ac] of Object.entries(ACCOUNTS)) { const m = ac.members.find((x) => cs[x]); if (m) console.log('  ' + k.padEnd(14) + ' ' + cs[m].acctUsed + '/' + cs[m].acctCap + (cs[m].acctDown ? ' ⚠하향' : '')); }
  process.exit(0);
}
const c = counts(); const now = hhmm(); const hour = Number(now.slice(0, 2));
let REG = [];
try { const raw = JSON.parse(fs.readFileSync(path.join(ROOT, '.agent/marketing/channels.json'), 'utf8')); REG = (Array.isArray(raw) ? raw : (raw.channels || [])).map((x) => { const id = x.id || x.key || x.name; return { id, tier: x.tier || x.type || '?', note: x.note || '', gate: x.gate || HOLD[ALIAS[id] || id] || null }; }); } catch {}
// (ALIAS 는 pub 에서도 쓰려고 위로 옮겼다 — 2026-09-27)

// ★2026-10-04 23시 «다음 열림» 일정 — 캡이 소진된 채널은 키우기 칸의 «창 닫힘 — 다음 열림» 줄에서도 빠졌다(vv.left > 0 조건).
//   그래서 23시 회차가 «오늘 남은 캡이 0 이고 창도 닫혔다»는 사실을 알아내는 데 도구 호출 10여 번을 썼다(부모 지시서는 «남은 캡 소진 우선»이었다).
//   채널마다 «다시 열리는 시각» = max(캡 초기화(KST 자정, utc 일은 UTC 자정) · 시각/날짜 게이트 해금 · 규칙 창 시작)을 계산해 시각순으로 보여 준다.
//   쓰임: slot 에서 «열린 채널 없음»일 때 자동 출력 · `node scripts/mkt-plan.js slot next` 로 일정만(ego·건강 점검 없이 즉시).
function nextOpenAt(r, nowMs) {
  const KST = 9 * 3600e3, DAY = 86400e3;
  const startOfKstDay = (ms) => Math.floor((ms + KST) / DAY) * DAY - KST;
  let t = nowMs;
  const g = r.gate;
  if (g && g.until) t = Math.max(t, String(g.until).includes('T') ? Date.parse(g.until) : Date.parse(g.until + 'T00:00:00Z'));
  if (r.left <= 0) {
    if (r.day === 'week' && r.used >= r.cap) return null; // 주간 캡 자체가 찼다 = «일정»이 아니라 따로 센다(채널 캡은 남았는데 계정 합계가 찬 경우는 KST 자정에 풀린다)
    t = Math.max(t, r.day === 'utc' ? (Math.floor(nowMs / DAY) + 1) * DAY : startOfKstDay(nowMs) + DAY);
  }
  const w = r.win;
  if (w && !(w[0] === 0 && w[1] === 24)) {
    const hh = new Date(t + KST).getUTCHours();
    if (!(hh >= w[0] && hh < w[1])) { let s = startOfKstDay(t) + w[0] * 3600e3; if (s < t) s += DAY; t = s; }
  }
  return t;
}
function printNext(rows, nowMs, horizonH = 36) {
  const fmt = (ms) => { const d = new Date(ms + 9 * 3600e3); return String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + String(d.getUTCDate()).padStart(2, '0') + ' ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };
  const by = new Map(); const weekFull = [];
  for (const r of rows) {
    if (['열림', '규칙없음', '계정대기', '새마감없음'].includes(r.state) || !(r.cap > 0)) continue;
    if (r.state === '게이트' && !(r.gate && r.gate.until)) continue; // 영구 게이트(대표 결정·약관·자격)는 시각이 없다
    if (r.state === '소진' && r.day === 'week' && r.used >= r.cap) { weekFull.push(r.id + ' ' + r.used + '/' + r.cap); continue; }
    const t = nextOpenAt(r, nowMs); if (t == null || t - nowMs > horizonH * 3600e3) continue;
    const why = r.state === '게이트' ? '해금' : (r.left <= 0 ? '캡 초기화' : '창 열림');
    const key = fmt(t); if (!by.has(key)) by.set(key, { t, items: [] });
    by.get(key).items.push(r.id + '(' + why + (r.left <= 0 ? (r.used < r.cap ? ' · 계정 합계 소진' : ' · 오늘 ' + r.used + '/' + r.cap) : '') + ')');
  }
  console.log('   ⏭ 다음 열림(KST·시각순 · 앞으로 ' + horizonH + '시간 · 캡 초기화=KST 자정, 레딧·Quora 는 UTC 자정=09:00):');
  if (!by.size) console.log('      (없음)');
  [...by.values()].sort((a, b) => a.t - b.t).forEach((g) => console.log('      ' + fmt(g.t) + '  ' + g.items.join(' · ')));
  if (weekFull.length) console.log('   · 주간 캡 소진(일정 없음 — 7일 창이 밀리면 풀린다): ' + weekFull.join(' · '));
}

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
    const gateOn = gateActive(g);
    const st = gateOn ? '게이트' : (acct ? '계정대기' : (v.left <= 0 ? '소진' : (v.noNewClose ? '새마감없음' : (!inWin ? '창밖' : '열림'))));
    rows.push({ id, state: st, age: ageH(key), used: v.used, cap: v.cap, left: v.left, day: v.day, win: v.window, note: (r.note || '').slice(0, 44), gate: g, wait: st === '열림' ? spacingWaitMs(led, key) : 0 });
  }
  ensureBskyRatio();
  const by = (s) => rows.filter((x) => x.state === s).sort((a, b) => b.age - a.age);
  const open = by('열림'), acct = by('계정대기'), norule = by('규칙없음'), gated = by('게이트');
  const rest = rows.filter((x) => x.state === '소진' || x.state === '창밖' || x.state === '새마감없음');
  if (process.argv[3] === 'next') { console.log('━━━ 게시 레인 일정 · ' + hhmm() + ' KST (캡 계산일 KST ' + kstDate() + ' · UTC ' + utcDate() + ') ━━━'); console.log('   · 지금 열린 게시 레인: ' + (open.length ? open.map((r) => r.id + ' ' + r.used + '/' + r.cap + (r.wait ? '(⏳' + hhmm(new Date(r.wait)) + ' 이후)' : '') + bskyLinkShort(r.id)).join(' · ') : '없음')); printNext(rows, Date.now()); process.exit(0); }

  // ★2026-10-05 13시: slot 출력이 47.9KB(게이트 표 ≈29KB = 62%)라 도구 출력 한도에 걸려 파일로 저장되고, 회차가 «읽기»에만 호출 5회를 썼다
  //   → `slot brief` = 같은 출력에서 «게이트 표»만 한 줄 요약(기본 `slot` 출력은 그대로 — HUD·옛 지시서 호환). MISTAKES #95.
  const BRIEF = process.argv[3] === 'brief';
  console.log('━━━ 이번 사이클 담당 구역 · ' + hhmm() + ' KST (UTC ' + utcDate() + ') ━━━\n');

  // ★2026-09-27 브라우저 상태 — 알림 권한 창 같은 «브라우저 소유» 창이 뜨면 ego 가 작업공간을 대표에게 넘긴다
  //   (ownership=agentDelegatedToUser). 발행기는 takeOverTaskSpace 로 그 공간을 «빼앗으므로» 돌리면 안 된다.
  //   04~07시 네 사이클 내리 브라우저 채널만 배정돼, 매번 같은 확인을 손으로 반복했다 → 배정표가 먼저 말한다.
  try {
    const { spawnSync } = require('child_process');
    const V = '/Applications/ego lite.app/Contents/Frameworks/ego Framework.framework/Versions/';
    const helper = ['0.5.0.32', 'Current'].map((v) => V + v + '/Helpers').find((d) => fs.existsSync(d));
    const r = spawnSync('ego-browser', ['nodejs'], { input: 'const s = await listTaskSpaces(); console.log("EGO_STATE " + JSON.stringify((s || []).map((x) => ({ id: x.id, name: x.name, ownership: x.ownership, profileId: x.profileId }))));',
      encoding: 'utf8', timeout: 20000, env: { ...process.env, PATH: (helper ? helper + ':' : '') + (process.env.PATH || '') } });
    // ego-browser 는 스크립트의 console 출력을 stderr 로 낸다(2026-09-27 실측) — 둘 다 본다
    const line = (String(r.stdout || '') + '\n' + String(r.stderr || '')).split('\n').find((l) => l.startsWith('EGO_STATE '));
    const spaces = line ? JSON.parse(line.slice(10)) : null;
    const held = (spaces || []).filter((x) => /user/i.test(String(x.ownership || '')));
    if (!spaces) console.log('⚠ 브라우저 상태를 못 읽었다(ego-browser 응답 없음) — 발행 전에 직접 확인\n');
    else if (held.length) {
      // ★2026-10-04 13시: 발행기 35곳이 L.takeSpaceOrExit 를 거친다(lib.mjs) — 사용자 제어 공간은 건드리지 않고 같은 프로필의 «에이전트 공간»을 쓴다.
      //   그래서 경고(⛔ 발행기 실행 금지)는 «Profile 1 의 모든 공간이 사용자 제어일 때만». 아니면 «어느 공간을 쓰는지·남은 수»를 알린다.
      const free = spaces.filter((x) => x.profileId === 'Profile 1' && !/user/i.test(String(x.ownership || '')));
      const heldTxt = held.map((x) => '#' + x.id + '(' + x.name + ')').join(' · ');
      if (free.length) console.log('ℹ 브라우저: 사용자 제어 공간 ' + heldTxt + ' — 되찾지 않는다. 발행기는 에이전트 공간 #' + free[0].id + '(' + free[0].name + ')을 쓴다(남은 에이전트 공간 ' + free.length + '개 — 알림 권한 프롬프트가 또 뜨면 하나씩 줄어든다: 핀터레스트 pin-builder 는 방문마다 프롬프트 = 게이트).\n');
      else console.log('⛔ 브라우저: ' + held.map((x) => '작업공간 #' + x.id + '(' + x.name + ') ' + x.ownership).join(', ') + ' — 대표 제어 중이고 쓸 에이전트 공간이 없다.\n' +
        '   발행기 실행 금지. 이번 사이클은 비브라우저 일(블루스키 CLI·원고·이미지 준비·도구·확장 발굴)만 하고 HANDOFF 대표 할 일 확인.\n');
    }
  } catch { console.log('⚠ 브라우저 상태 확인 실패 — 발행 전에 직접 확인\n'); }

  // ★2026-10-04 건강 — 공개 신호 점검(3시간에 한 번)·자동 한 단계 하향 현황·상한 단계. 점검이 실패해도 배정은 계속된다.
  { let scanOut = '';
    try {
      const stamp = path.join(require('os').tmpdir(), 'signum-health-scan.stamp');
      const idle = fs.existsSync(stamp) ? Date.now() - fs.statSync(stamp).mtimeMs : 1e12;
      if (idle > 3 * 3600e3 && !process.env.MKT_NO_SCAN) {
        const { spawnSync } = require('child_process');
        const r = spawnSync(process.execPath, [path.join(__dirname, 'mkt-health-scan.js')], { encoding: 'utf8', timeout: 30000, env: process.env });
        fs.writeFileSync(stamp, String(Date.now())); scanOut = String(r.stdout || '').trim();
      }
    } catch {}
    healthLines().forEach((l) => console.log(l));
    if (scanOut) console.log('   · 건강 점검(공개 신호·3시간 주기): ' + scanOut.split('\n').join(' / '));
    console.log(''); }
  // ★2026-09-20 «키우기» 레인 — 아래 «실행»은 오래 방치된 순이라, 매일 클릭을 내는 채널이
  //   구조적으로 영영 안 뽑힌다(bluesky 가 4사이클 내리 «대상 아님»에 있었다).
  //   그로스 규칙은 「이긴 것을 최소 단위로 찾아 키운다」이므로 이 레인을 «맨 앞»에 둔다.
  try {
    const cc = JSON.parse(fs.readFileSync(path.join(ROOT, '.agent/marketing/clicks-cache.json'), 'utf8'));
    const ageH = (Date.now() - Date.parse(cc.at)) / 36e5;
    // ★2026-10-04 home_hero(자사 홈 히어로 CTA — 폰 클릭 1위 «상시 표면»)가 «규칙없음»인 채로 매 회차 ★ 1순위에 올라 키우기 칸을 먹었다
    //   (10/3 16시 회차가 «도구의 신호»로 적음). 게시로 키울 수 없는 자산이다 → 접두어 home_·seo_ 는 전부 제외하고, 정보 한 줄로만 보여 준다(개선은 웹 담당).
    const SELF = new Set(['home', 'seo', 'seo_darkpool', 'home_hero']); // 우리 자산 — 게시로 키우는 대상이 아니다
    const isSelf = (t) => SELF.has(t) || /^(seo|home)_/.test(t);
    // ★2026-09-27 폰 클릭 우선 — 설치가 되는 건 폰 클릭뿐이다(mkt-clicks.js d3phone 주석). 폰 클릭이 있으면 그 순으로, 같으면 전체 클릭 순.
    const PH = cc.d3phone || null;
    // ★2026-10-04 «게시당 추정 설치» 정렬(성장 효과 연구 §4 — 지시서 «개선 1건» 후보 1순위): 폰 클릭 «개수»로 줄 세우면 iOS 폰 클릭(전환 ≈2%)과 안드 폰 클릭(≈20%)이 같은 1이다.
    //   mkt-clicks.js 가 21일 «안드 폰×0.20 + iOS 폰×0.02 ÷ 게시 수» 를 estPerPost 로 캐시에 싣는다 → 있으면 그 값으로 줄 세우고(없으면 옛 3일 폰 순), 아래에 «시간 배분 순서» 한 줄을 보여 준다.
    const EST = cc.estPerPost || null;
    const estV = (t) => (EST ? (EST[t] || EST[ALIAS[t]] || null) : null);
    const estOf = (t) => { const v = estV(t); return v ? v.perInstall : -1; };
    const top = Object.entries(cc.d3 || {}).filter(([t, n]) => n > 0 && !isSelf(t) && (!PH || (PH[t] || 0) > 0))
      .sort((a, b) => (EST ? estOf(b[0]) - estOf(a[0]) : 0) || (PH ? (PH[b[0]] || 0) - (PH[a[0]] || 0) : 0) || b[1] - a[1]).slice(0, 3);
    console.log('■ 키우기 — 최근 3일 «' + (PH ? '폰 클릭(설치 가능)' : '클릭') + '이 실제로 나온» 채널. 이번 사이클에 최소 1편을 여기에 쓴다');
    // ★2026-10-04 «사람 클릭» 기준 표시 — 이 칸의 3일·21일 클릭·폰 클릭(안드/iOS)은 mkt-clicks.js 가 «ET humanSince 이후 날짜는 clk: 사람 키(봇·수집기 제외), 그 전은 원시»로 합산해 캐시에 싣는다.
    //   그래서 키우기·▲▼ 판정이 따로 손대지 않아도 사람 클릭을 읽는다. 어느 날짜까지 사람 기준인지 «보여 줘야» 3일 창이 섞여 있을 때 오독하지 않는다.
    if (cc.humanSince) console.log('   · 클릭 기준: ET ' + cc.humanSince + ' 이후 날짜는 «사람 클릭»(clk: 키 — 봇·수집기 제외), 그 전은 원시 — 3일 창 ' + (cc.humanDays3 || 0) + '/3일 · ' + (cc.days || 21) + '일 창 ' + (cc.humanDaysAll || 0) + '/' + (cc.days || 21) + '일' + ((cc.humanDays3 || 0) === 0 ? ' (아직 사람 키 날짜가 3일 창에 없다 = 전부 원시)' : ''));
    if (EST) {
      const stateOf = (t) => {
        const reg = REG.find((x) => (ALIAS[x.id] || x.id) === (ALIAS[t] || t) || x.id === t); const vv = c[ALIAS[t] || t] || c[t];
        if (reg && gateActive(reg.gate)) return '게이트'; if (!vv) return '규칙없음'; if (!(vv.left > 0)) return '소진';
        return (hour >= vv.window[0] && hour < vv.window[1]) ? '가능' : '창닫힘';
      };
      const ord = Object.entries(EST).filter(([t]) => !isSelf(t) && !/(_reply|^correction$)/.test(t)).sort((a, b) => b[1].perInstall - a[1].perInstall).slice(0, 7);
      if (ord.length) console.log('   ▶ 시간 배분 순서 = 게시당 추정 설치(21일 · 안드 폰×0.20 + iOS 폰×0.02 ÷ 게시 수 · 표본 작음 ±크다): ' + ord.map(([t, v]) => t + ' ' + v.perInstall + '(' + v.n + '건·폰 ' + v.phoneA + '/' + v.phoneI + '·' + stateOf(t) + ')').join(' · '));
      // ★2026-10-04 «창 닫힘» 회차의 할 일 — 새벽엔 한국어·일본어 채널이 전부 닫혀(threads 7시·naver 8시·note 5시·x_jp 5시) 회차가 «열린 영어 채널»에 몰려 효과 없는 편을 냈다.
      //   닫힌 채널마다 «몇 시간 뒤 열리는가»를 보여 주고, 그 시간 안에 원고·앱 화면(KO/JA)·게이트(audit-structure-vs-nasdaq)를 «준비본»으로 끝내 두게 한다.
      const wait = ord.map(([t]) => t).concat(['note_jp', 'x_jp', 'threads_jp', 'tistory']).filter((t, i, a) => a.indexOf(t) === i)
        .map((t) => { const vv = c[ALIAS[t] || t] || c[t]; if (!vv || stateOf(t) === '게이트' || !(vv.left > 0) || (hour >= vv.window[0] && hour < vv.window[1])) return null;
          const h = (vv.window[0] - hour + 24) % 24; return t + ' ' + String(vv.window[0]).padStart(2, '0') + ':00(' + h + '시간 뒤)'; }).filter(Boolean);
      if (wait.length) console.log('   ⏳ 창 닫힘 — 다음 열림: ' + wait.join(' · ') + '  → 지금은 이 채널들의 «준비본»(원고·앱 화면 ko/ja·옵션 수치 게이트)을 만든다. 열린 영어 채널로 효과 없는 편을 채우지 않는다');
    }
    if (PH) { const deskOnly = Object.entries(cc.d3 || {}).filter(([t, n]) => n >= 5 && !isSelf(t) && !(PH[t] > 0)).map(([t, n]) => t + ' ' + n); if (deskOnly.length) console.log('   ⚠ 3일 클릭은 있는데 폰 0 — 설치로 못 간다(데스크톱·봇): ' + deskOnly.join(' · ')); }
    if (!top.length) console.log('   (3일 클릭 0 — 키울 것이 없다)');
    { const selfInfo = Object.entries(cc.d3 || {}).filter(([t, n]) => n > 0 && isSelf(t)).sort((x, y) => ((PH && PH[y[0]]) || 0) - ((PH && PH[x[0]]) || 0)).map(([t, n]) => t + ' 폰 ' + ((PH && PH[t]) || 0) + '/' + n);
      if (selfInfo.length) console.log('   · 상시 표면(게시 대상 아님 — 개선은 웹 담당): ' + selfInfo.join(' · ')); }
    for (const [t, n] of top) {
      const v = c[ALIAS[t] || t];
      // ★2026-09-27 키우기 칸이 게이트를 안 봤다 — indiehackers 가 로그인 게이트(㊹)인데 «오늘 0/1 가능»으로 떠서 헛걸음을 부른다
      const reg = REG.find((x) => (ALIAS[x.id] || x.id) === (ALIAS[t] || t) || x.id === t);
      const gOn = !!reg && gateActive(reg.gate);
      // ★2026-09-27 «오늘 소진 2/3» 으로 떠서 한 편 더 가능한 것처럼 읽혔다 — 실제로는 계정 합계(bluesky 2 + bluesky_bip 1)가 3/3 이었다.
      //   소진 사유가 계정 합계면 그 숫자를 보여 준다.
      const acctFull = v && v.acctCap != null && v.acctUsed >= v.acctCap;
      // ★2026-10-04 키우기 칸이 시간 창을 안 봤다 — 02시에 threads(규칙 창 07~23시·한국어 전용)가 «오늘 0/1 가능»으로 떠 새벽 게시를 부를 뻔했다. 창 밖이면 «창 닫힘»으로 보여 준다.
      const room = gOn ? ('게이트(' + (reg.gate.kind || '?') + ' — ' + (reg.gate.who || '') + ')') : (v ? (v.left > 0 ? ((hour >= v.window[0] && hour < v.window[1]) ? '오늘 ' + v.used + '/' + v.cap + ' 가능' : '창 닫힘 — 규칙 ' + v.window[0] + '~' + v.window[1] + '시 KST(지금 ' + hour + '시)·오늘 ' + v.used + '/' + v.cap) : acctFull ? '오늘 소진 — 계정 합계 ' + v.acctUsed + '/' + v.acctCap + '(자정 KST 초기화)' : '오늘 소진 ' + v.used + '/' + v.cap) : '규칙없음');
      const cm = (cc.contam || {})[t] || 0;
      const ev = estV(t);
      console.log('   ★ ' + t.padEnd(16) + (PH ? '3일 폰 ' + String(PH[t] || 0).padStart(2) + ' / ' : '3일 ') + String(n).padStart(3) + '클릭(실)' + (cm ? ' [내점검 ' + cm + ' 제외]' : '') + ' · ' + String(cc.days || 21) + '일 ' + String((cc.all || {})[t] || 0).padStart(4) + (ev ? ' · 게시당 설치≈' + ev.perInstall : '') + ' · ' + room);
    }
    // ★2026-09-21 «줄일 것» — 키우기만 보여 주면 «무엇을 그만둘지»는 영영 안 보인다(ENGINE §57).
    //   건당 1 미만 채널은 노력 대비 회수가 없다. 죽이지는 않되 신규 투입을 줄인다.
    const pp = cc.perPost || {};
    // ★2026-10-04 판정 기준 «원클릭 건당» → «폰 클릭 건당»(mkt-clicks.js phone21 주석). 10/4 효과 판독: mastodon(3일 8클릭)·medium(11)·note(7)은
    //   UA 감사상 사람 추정 0%(수집기)·폰 0 인데 «가속 중/옮긴다»로 지시됐다. 캐시에 perPhone 이 있으면 그 기준, 없으면(폰 측정 실패) 옛 기준으로 물러난다.
    const PHN = Object.values(pp).some((v) => v.perPhone != null);
    const E = Object.entries(pp);
    const lose = PHN ? E.filter(([, v]) => v.perPhone < 0.15 && v.n >= 5).sort((a, b) => a[1].perPhone - b[1].perPhone || b[1].n - a[1].n)
                     : E.filter(([, v]) => v.per < 1).sort((a, b) => a[1].per - b[1].per);
    // ★2026-09-21(2차) 신선도 반영 — 21일 건당만 보면 «죽은 채널»이 1위로 올라온다.
    //   실제로 quora(12.8)·linkedin(4.5)은 최근 3일 0 이었다. 옮길 곳은 «건당 × 최근에도 난다» 둘 다여야 한다.
    const win = PHN ? E.filter(([, v]) => v.perPhone >= 0.3 && (v.d3phone || 0) > 0).sort((a, b) => b[1].perPhone - a[1].perPhone)
                    : E.filter(([, v]) => v.per >= 4 && (v.d3 || 0) > 0).sort((a, b) => b[1].per - a[1].per);
    const stale = PHN ? E.filter(([, v]) => v.perPhone >= 0.3 && !(v.d3phone || 0)).sort((a, b) => b[1].perPhone - a[1].perPhone)
                      : E.filter(([, v]) => v.per >= 4 && !(v.d3 || 0)).sort((a, b) => b[1].per - a[1].per);
    const rise = PHN ? E.filter(([, v]) => (v.d3phone || 0) >= 2 && v.phone > 0 && v.d3phone / v.phone >= 0.5).sort((a, b) => b[1].d3phone - a[1].d3phone)
                     : E.filter(([, v]) => (v.fresh || 0) >= 50 && (v.d3 || 0) >= 3).sort((a, b) => b[1].d3 - a[1].d3);
    const rawOnly = PHN ? E.filter(([, v]) => v.per >= 4 && v.perPhone < 0.15).sort((a, b) => b[1].per - a[1].per) : [];
    const fp = (v) => v.perPhone + '(21일 폰 ' + v.phone + '/' + v.n + '건·3일 폰 ' + (v.d3phone || 0) + ')';
    if (win.length || lose.length || stale.length || rise.length || rawOnly.length) {
      if (PHN) console.log('   · 아래 ▲▼ 판정 기준 = «건당 폰 클릭»(안드로이드+iOS, 설치 가능한 클릭만 — 원클릭은 봇·미리보기 수집기가 섞인다)');
      if (win.length) console.log('   ▲ ' + (PHN ? '건당 «폰» 높고 «최근에도» 폰이 난다' : '건당 높고 «최근에도» 난다') + '(여기로 옮긴다): ' + win.map(([c, v]) => c + ' ' + (PHN ? fp(v) : v.per + '(3일 ' + v.d3 + ')')).join(' · '));
      if (rise.length) console.log('   ▲▲ ' + (PHN ? '폰 가속 중(3일 폰 ≥2·21일 폰의 절반 이상이 최근 3일)' : '가속 중') + '(순위 낮아도 더 쓴다): ' + rise.map(([c, v]) => c + (PHN ? ' 3일 폰 ' + v.d3phone + '/' + v.phone : ' 3일 ' + v.d3 + '·' + v.fresh + '%')).join(' · '));
      if (stale.length) console.log('   ◇ ' + (PHN ? '폰 건당은 높은데 최근 3일 폰 0' : '건당은 높은데 최근 3일 0') + ' — «과거 실적», 옮기지 말 것: ' + stale.map(([c, v]) => c + ' ' + (PHN ? fp(v) : v.per)).join(' · '));
      if (rawOnly.length) console.log('   ✗ 원클릭만 높음(폰 ≈0 — 봇·PC 클릭, «가속/옮긴다»로 읽지 말 것): ' + rawOnly.map(([c, v]) => c + ' 원클릭 ' + v.per + '→폰 ' + v.perPhone).join(' · '));
      if (lose.length) console.log('   ▼ ' + (PHN ? '건당 폰 0.15 미만·5건 이상(신규 투입 줄임)' : '건당 1 미만(신규 투입 줄임)') + ': ' + lose.map(([c, v]) => c + ' ' + (PHN ? v.perPhone + '(폰 ' + v.phone + '/' + v.n + '건)' : v.per + '(' + v.n + '건)')).join(' · '));
    }
    if (ageH > 6) console.log('   ⚠ 클릭 캐시가 ' + Math.round(ageH) + '시간 전 것이다 → `node scripts/mkt-clicks.js` 를 먼저 돌려라');
    console.log('');
  } catch { console.log('■ 키우기 — 클릭 캐시 없음 → `node scripts/mkt-clicks.js` 를 먼저 돌려라\n'); }

  console.log('■ 실행 — 이 4개를 «반드시» 처리한다 (오래 방치된 순)');
  if (!open.length) {
    console.log('   (열린 채널 없음' + (acct.length ? ' → 아래 «뚫기»가 이번 사이클의 본업이다)' : ' · 뚫기도 없음 → «닫힘 회차» — 아래 ◎ 목록이 이번 사이클의 본업이다)'));
    printNext(rows, Date.now());
    // ★2026-10-05 11시: 09·10·11시 회차가 «열린 레인 0·뚫기 없음» 상태에서 할 일을 매번 새로 찾았다(이 문구는 «뚫기가 본업»이라 했지만 뚫기가 비어 있었다).
    //   게시 캡은 건드리지 않고, 이미 만들어 둔 읽기·측정 도구 + 확장 + 개선을 한 줄 목록으로 세운다(MISTAKES #92·#93 — 후속은 «그 일을 하는 명령»과 함께).
    if (!acct.length) {
      console.log('   ◎ 닫힘 회차 할 일 — 게시 캡은 건드리지 않는다(읽기 전용·측정·확장·개선):');
      console.log('      ① 광고 판독: bash scripts/ego-run.sh scripts/ego/ads-periods.mjs 150  (작업 파일 {"periods":["어제","오늘"]} · 예산·입찰 변경 금지)');
      console.log('      ② 설치 실적 — iOS: python3 ~/Documents/signum-work/redeem/redeem-report.py --brief(즉시) · --ego(RevenueCat 신규 체험·고객, 2시간마다)');
      console.log('                  — 안드로이드: bash scripts/ego-run.sh scripts/ego/play/play-acquisitions.mjs 170 (주 1~2회 · Play 표는 7일 지연 — 최근 일자는 «미집계»≠0) → 같은 날 이어서 play-listing-acq.mjs 240(등록정보 취득: 트래픽 소스·UTM)');
      console.log('                  — 앱스토어 «브랜드 검색 순위»(글을 본 사람이 우리 이름을 쳤을 때 1위인가): python3 scripts/aso-brand-rank.py all (주 1회 · 무인증·약 40초 · 양성 대조군이 통과일 때만 표를 믿는다)');
      console.log('                  — 구글 플레이 «브랜드 검색 순위»(안드 사람이 같은 걸 쳤을 때 · 10/5 16시 신설): python3 scripts/play-brand-rank.py all (주 1회 · 무인증·약 80초 · 파서·이름 대조군이 통과일 때만 표를 믿는다)');
      console.log('      ③ 리딤 글 점검(남이 쓴 답글·«사용» 표현): python3 ~/Documents/signum-work/redeem/b-posts-check.py (약 1.5분, 1시간마다)');
      console.log('      ④ 확장 1 — 아래 ■ 확장 후보 풀을 먼저 읽고 «다른 종류의 표면»에서 고른다 · ⑤ 개선 1건 — 도구·절차·문구를 실제로 고친다(MISTAKES-LOG)');
      // ★2026-10-05 11시(12시 회차 직전): 위 ①~③ 은 «언제 다시 하나»가 문장 어디에도 없어 회차가 앞 회차 로그 문단(6KB)에서 «--ego 는 12:25 이후·B 글 점검은 11:40 이후»를 읽어 와야 했다.
      //   결과 파일 시각(~/signum-ego-io/<KST날짜>/ — 최근 8일)에서 «마지막 실행 → 다음 예정»을 계산해 찍는다(MISTAKES #92·#49 — 후속은 «명령»만이 아니라 «시각»도 읽는 곳에).
      //   ⚠ HUD(scripts/hud/server.js)가 이 구역에서 «숫자.» 줄만 읽는다 — 이 줄은 ⏱ 로 시작해 영향 없다. 못 읽으면 조용히 건너뛴다(slot 이 죽으면 안 된다).
      try {
        const home = process.env.HOME || require('os').homedir();
        const dayList = []; for (let i = 0; i < 8; i++) dayList.push(kstDate(new Date(Date.now() - i * 864e5)));
        // 가장 최근 «날짜 폴더»에서 re 에 맞는 파일 중 가장 늦은 수정 시각(ms) — 없으면 0
        const latestRun = (re) => {
          for (const d of dayList) {
            let best = 0, fl = [];
            try { fl = fs.readdirSync(path.join(home, 'signum-ego-io', d)); } catch { continue; }
            for (const f of fl) if (re.test(f)) { try { best = Math.max(best, fs.statSync(path.join(home, 'signum-ego-io', d, f)).mtimeMs); } catch { /* 건너뜀 */ } }
            if (best) return best;
          }
          return 0;
        };
        const nextTxt = (label, ms, mins) => {
          if (!ms) return '⏰ ' + label + ' 기록 없음 → 지금';
          const nx = ms + mins * 60e3, same = kstDate(new Date(nx)) === kstDate();
          return (nx <= Date.now() ? '⏰ ' : '') + label + ' 마지막 ' + hhmm(new Date(ms)) + (nx <= Date.now() ? ' → 지금 가능' : ' → ' + (same ? '' : kstDate(new Date(nx)).slice(5) + ' ') + hhmm(new Date(nx)) + ' 이후');
        };
        // Play 취득은 «월·목 첫 회차» — 마지막 실행 다음 날부터 처음 만나는 월·목요일(KST)을 센다
        const playMs = latestRun(/^play-acq-result\.json$/);
        let playTxt = '⏰ Play 취득 기록 없음 → 지금';
        if (playMs) {
          let d = new Date(playMs + 9 * 3600e3);
          do { d = new Date(d.getTime() + 864e5); } while (![1, 4].includes(d.getUTCDay()));
          const nd = d.toISOString().slice(0, 10), dueNow = nd <= kstDate();
          playTxt = (dueNow ? '⏰ ' : '') + 'Play 취득 마지막 ' + kstDate(new Date(playMs)).slice(5) + ' ' + hhmm(new Date(playMs)) + ' → ' + (dueNow ? '지금 가능' : nd.slice(5) + '(' + '일월화수목금토'[d.getUTCDay()] + ') 첫 회차');
        }
        console.log('      ⏱ 마지막 실행 → 다음 예정(결과 파일 시각 기준 · ⏰ = 지금 할 차례): '
          + [nextTxt('광고', latestRun(/^ads-periods-result\.json$/), 60),
             nextTxt('RevenueCat(--ego)', latestRun(/^redeem-metrics-\d+\.json$/), 120),
             nextTxt('B 글 점검', latestRun(/^(x-post-replies-result|naver-comments-result|redeem-replies-\d+)\.json$/), 60),
             playTxt,
             nextTxt('브랜드 순위', latestRun(/^aso-brand-rank\.json$/), 7 * 24 * 60),
             nextTxt('Play 브랜드 순위', latestRun(/^play-brand-rank\.json$/), 7 * 24 * 60)].join(' · '));
      } catch { /* 일정 줄은 «있으면 도움» — 실패해도 slot 은 계속 */ }
    }
  }
  open.slice(0, 4).forEach((r, i) => console.log('   ' + (i + 1) + '. ' + r.id.padEnd(20) + fmtAge(r.age).padEnd(12) + (r.wait ? '⏳ 간격 대기 — ' + hhmm(new Date(r.wait)) + ' 이후 · ' : '') + bskyLinkTag(r.id) + r.note));
  if (open.length > 4) console.log('   대기(' + (open.length - 4) + '): ' + open.slice(4).map((r) => r.id).join(', '));
  console.log('\n■ 뚫기 — 계정이 막힌 곳 중 가장 오래된 2개. 우회로를 «실제로» 시도한 뒤에만 보류로 적는다(ENGINE §22)');
  acct.slice(0, 2).forEach((r, i) => console.log('   ' + (i + 1) + '. ' + r.id.padEnd(20) + fmtAge(r.age).padEnd(12) + r.note));
  if (!acct.length) console.log('   (없음)');
  // ★게이트 레인 — «내가 못 여는 것»을 여기 세워 둔다. 실행 4칸을 점유하지 않는다.
  if (gated.length) {
    console.log('\n▣ 게이트 — 내 힘으로 못 연다. 여는 사람·여는 날이 정해져 있다 (실행 대상 아님)');
    if (BRIEF) { const bk = {}; gated.forEach((r) => { const k = (r.gate && r.gate.kind) || '게이트'; bk[k] = (bk[k] || 0) + 1; }); console.log('   · ' + gated.length + '건 — 목록 생략(brief 모드 · 전체 표는 `node scripts/mkt-plan.js slot`): ' + Object.entries(bk).map(([k, n]) => k + ' ' + n).join(' · ')); } else gated.forEach((r) => {
      const g = r.gate || {};
      const when = g.until ? ('해금 ' + g.until) : (g.who ? (g.who + ' 1회') : '조건 미정');
      console.log('   · ' + r.id.padEnd(18) + ('[' + (g.kind || '게이트') + ']').padEnd(10) + when.padEnd(16) + (g.why || ''));
    });
  }
  console.log('\n■ 확장 — 신규 표면 1개: 발굴 → 실행 또는 티켓 → channels.json 등록 (매 사이클 의무)');
  // ★2026-10-05 08시: 확장 구역이 제목만 찍고 비어 있어 회차마다 같은 종류의 조사를 되풀이했다(06시 일본 앱 리뷰 매체 목록 → 07시 디렉터리 검색어 → 08시 일본어 블루스키 풀 —
  //   셋 다 기각). 이미 해 본 것·막힌 것은 channels.json candidates 에 있으니 상태별로 같이 찍는다(MISTAKES #85·#86 — 재조사 금지는 «보이는 곳»에 있어야 지켜진다).
  try {
    const cands = JSON.parse(fs.readFileSync(path.join(ROOT, '.agent/marketing/channels.json'), 'utf8')).candidates || [];
    const stOf = (c) => String(c.status || '').split(/[\s(]/)[0] || '기타';
    const by = {}; for (const c of cands) (by[stOf(c)] = by[stOf(c)] || []).push(c.id);
    const show = (k, label) => { if (by[k] && by[k].length) console.log('   ' + label + '(' + by[k].length + '): ' + by[k].join(' · ')); };
    console.log('   후보 풀 ' + cands.length + '개 — 같은 표면·같은 검색어를 되풀이하지 않는다:');
    show('ready', '▶ 준비 완료(제출은 대표 확인 뒤)'); show('ticket', '▣ 티켓(게이트 등록됨)'); show('rejected', '✖ 기각(재조사 금지)'); show('done', '✔ 완료'); show('todo', '· 미착수');
    // ★2026-10-05 09시: 위 다섯 상태만 찍어 «상태 없음(기타)·gated·blocked·active» 후보가 요약에서 통째로 빠져 있었다 — note_tsubuyaki 는 9/30 에 «투고 메뉴에 つぶやき 없음»을 이미 실측했는데
    //   status 가 비어 보이지 않았고 09시 회차가 같은 시험을 다시 했다(MISTAKES #91). 나머지 상태도 «그 밖» 줄로 찍는다.
    const KNOWN = ['ready', 'ticket', 'rejected', 'done', 'todo'];
    for (const k of Object.keys(by).filter((x) => !KNOWN.includes(x))) console.log('   ' + (k === '기타' ? '? 상태 없음' : '◇ ' + k) + '(' + by[k].length + '): ' + by[k].join(' · ') + (k === '기타' ? '  ← 노트에 이미 실측이 있을 수 있다(읽고 status 를 정해 둘 것)' : ''));
    console.log('   → 새 후보는 «검색어»가 아니라 «다른 종류의 표면»에서 찾는다: ①이미 로그인된 계정의 새 레인·대상 풀 ②측정되는 직접 설치 경로 ③계정·약관 없이 열리는 곳. 등록 = candidates 에 {id,status,name,note(날짜·실측·재조사 금지 사유)}');
  } catch (e) { console.log('   (후보 풀을 못 읽었다: ' + String(e.message).slice(0, 60) + ')'); }
  console.log('\n■ 고정 6단계 — ①게이트 audit-expiration-selection.js --live + audit-structure-vs-nasdaq.js(맥스페인·풋콜을 나스닥 전체 체인과 대조 — ✗ 종목의 수치는 게시 금지) ②광고(기간 «오늘» 고정) ③발행 즉시 pub 기록 ④공개페이지 검증 ⑤OUTREACH-LOG + 커밋·푸시 ' + (gated.some((r) => r.id === 'admob') ? '⑥애드몹 리딩방 스윕 = 게이트(대표 개인 구글 계정 — 자동 접속·스윕 금지, 위 ▣ admob) → 건너뜀' : '⑥애드몹 리딩방 스윕 bash scripts/ego-run.sh scripts/admob-arc-sweep.mjs 540 — 5분 예산·멈춘 자리부터 이어서 (대표 지시 9/24·25 — 일회용 .shop/.vip 소재만 차단, 결과를 로그에)'));
  if (norule.length) console.log('\n⚠ 규칙 미정의 ' + norule.length + '개 — 지금 정할 것: ' + norule.map((r) => r.id).join(', '));
  console.log('\n· 이번 사이클 대상 아님(' + rest.length + '): ' + rest.map((r) => r.id + (r.state === '새마감없음' ? '(새 미국 마감 없음)' : '')).join(', '));

  // ── 대표 할 일 ──────────────────────────────────────────────────
  // ★2026-09-23: 예전엔 CEO-SIGNUP-LIST.md(9/20 기준)를 읽어 이미 끝난 «마스토돈 가입» 등을 계속 띄웠다.
  //   정본은 HANDOFF.md §3 표다 — 거기서 취소선(~~) 없는 행만 센다.
  try {
    const hf = fs.readFileSync(path.join(ROOT, '.agent/marketing/HANDOFF.md'), 'utf8');
    const sec = (hf.split('## 3. 대표 할 일')[1] || '').split('\n## ')[0];
    // ★2026-09-27 ①~⑳ 만 셌다 → ㉑~㊿·51 이후 항목(보안·Redis·브라우저 권한 창 등 최근 승인 대기 전부)이 목록에서 빠졌다.
    const items = sec.split('\n').filter((l) => /^\|\s*\**([①-⑳㉑-㉟㊱-㊿]|\d+)\**\s*\|/.test(l) && !/~~/.test(l))
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
  const line = `${ch.padEnd(14)} ${v.used}/${v.cap}${v.over ? ' ⛔초과' : ''}${v.day === 'utc' ? ' (UTC일)' : ''}${inWindow ? '' : ` [창 ${v.window[0]}~${v.window[1]}시]`}${v.noNewClose ? ' [새 미국 마감 없음]' : ''}  ${v.note}`;
  (v.left > 0 && inWindow && !v.noNewClose ? open : closed).push(line);
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
