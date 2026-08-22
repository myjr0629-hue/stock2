# SIGNUM HQ 3앱 유통·유입 실행 계획 (2026-08-20 기준)

## 0. 이 계획을 읽는 법 — 먼저 정리해야 할 3가지

**(1) 원 조사의 P0가 44건이다.** 항목별로 독립 채점된 결과라 그대로는 실행 순서가 안 된다. 아래에서 P0를 **4개 트랙(A 계측 → B 자사자산 → C 스토어메타 → D 채널)** 으로 재배열했다. 트랙 A·B를 건너뛰고 D부터 하면 "효과 0"을 또 반복한다.

**(2) 중복·상충 정리 (원 데이터에 같은 채널이 두 번 이상 등장)**

| 채널 | 상충 내용 | 채택 |
|---|---|---|
| Hacker News Show HN | P0 / P1 두 번 | **P0**. 앱당 1회, 링크는 스토어 아닌 웹 화면 |
| GeekNews Show | P0 / P1 두 번 | **계정 생성 P0(7일 대기), 게시 P1** |
| 디스콰이엇 | P0 / P1 | **P0** |
| Fazier | P1(Super $149) / P2(Super $119) | 가격 **상충 — 근거 상충**. 무료 티어만 쓰므로 무관 |
| SaaSHub | P1 두 번 | **P1** 통합 |
| 벤처스퀘어 | P0 두 번 | **P0** 통합 |
| 뉴스와이어(KR) | P2 / 탈락 | **P3 보류**. 무료 티어 없음(77,000원), 스타트업 쿠폰은 국내 법인 한정 |
| Zenn | P0(본체) / P1(가이드라인) / P2(Publication) | **본체 P1, Publication P2** (일본은 3개국 중 후순위) |
| Uneed | "탈락"이나 무료 등재는 가능 | **P3** — 무료 등재만, 런치 슬롯은 유료 |
| iPhone Mania | P0(주소 판독 성공) / P2(게재보증 없음) | **P0로 발송, 기대치는 낮게** |

**(3) 「근거 미확보」로 명시해야 할 것 — 이 계획에서 사실로 쓰면 안 되는 항목**

- **네이버 서치어드바이저·네이버 IndexNow·네이버 블로그·네이버 검색광고**: 조사 환경에서 도메인 차단으로 **규칙 원문을 한 줄도 못 봤다**. "가능"이 아니라 "대표가 로그인해서 확인해야 함".
- **Reddit 전 항목(9건)**: 환경 차단으로 규칙 재검증 실패. 인용된 서브 규칙은 이전 조사분이며 미검증.
- **Samsung Galaxy Store**: 무료앱만 낼 때 commercial seller 승격이 필요한지 **미확정**.
- **클리앙 기업회원**: 미국 LLC로 가입 가능한지 **미확정**(결제 전 문의 필수).
- **PR-Inside / 비석세스 / KoreaTechDesk**: 무료 여부 규칙 원문 **미확보**(정황뿐).
- **LinkedIn `w_organization_social`**: 회사 페이지 게시 권한 승인 트랙 필요 여부 **미확정**.
- **Bluesky 영상 3분**: 공식 확인값은 **60초**. 3분 전제로 렌더 길이 잡지 말 것.
- **Telegram 클라우드 업로드 상한**: 문서 근거 없음(로컬 서버만 2000MB 명시).
- **Apple 국가별 평점 분리**: 1차 출처 미확보. Play는 확인됨(2021-11 롤아웃).
- **Apple Featuring 리드타임**: 마케팅 페이지 "최소 2주" vs ASC 헬프 "최소 3주" **불일치** → 보수적으로 3주 이상.
- **Twelve Tools / Tiny Startups / HUNT0 / Pitchwall / HackerNoon / Qiita 로그인 수단**: 미확인.

---

## 1. 채널 표

자동화 등급: **API**(코드로 끝) · **브라우저**(세션 확보 후 에이전트 가능) · **사람전용**(캡차·2FA·결제·본인인증)

### P0 — 트랙 A: 계측 (이걸 안 하면 나머지가 전부 추측)

| 채널 | URL | 지역 | 무엇을 올리는가 | 가입방식(구글OAuth) | 자동화 |
|---|---|---|---|---|---|
| Apple App Analytics + Reports API | developer.apple.com/documentation/appstoreconnectapi/analytics | 전역 | (읽기) 노출·전환·소스 | Apple ID+2FA / **ASC API 키 2LD2B7366M 보유** | **API** |
| Play Store performance 「검색어」 리포트 | support.google.com/googleplay/android-developer/answer/9859173 | 전역 | (읽기) 실제 검색어 | 구글계정 = OAuth | 브라우저 |
| Apple 캠페인 링크 pt/ct | developer.apple.com/help/app-store-connect-analytics/acquisition/campaign-links/ | 전역 | 채널별 ct 토큰 발급 | Apple ID+2FA (OAuth 없음) | 사람전용(생성) |
| Google Search Console | search.google.com/search-console | 전역 | 도메인 소유확인+사이트맵 | 구글계정 = OAuth | 사람 1회 → **API** |
| Bing Webmaster Tools | bing.com/webmasters/ | 전역 | 소유확인+사이트맵, 무료 Keyword research | **구글 OAuth 있음** | 사람 1회 → **REST** ★SOAP 2026-08-31 폐지 |
| 네이버 서치어드바이저 (사이트맵 제출) | searchadvisor.naver.com | KR | 기존 513 URL 사이트맵 | 네이버 ID (**OAuth 없음**) | 사람전용 ★**규칙 원문 미확보** |

### P0 — 트랙 B: 자사 자산 수리 (코드만, 리스크 0, 회수율 최고)

| 채널/항목 | URL | 지역 | 무엇을 | 가입 | 자동화 |
|---|---|---|---|---|---|
| sitemap.xml WIM 누락 | signumhq.com/sitemap.xml | 전역 | `/en·ko·ja/wim` 3 URL 추가 (현재 'wim' 문자열 0회) | 불요 | **API(자사코드)** |
| hreflang en/ko/ja + x-default | — | 전역 | 501 티커 페이지 상호 링크 (현재 0개) | 불요 | **API** |
| 구조화 데이터 교체 | — | 전역 | **FAQPage(갤러리 삭제 타입) → Dataset+Organization+BreadcrumbList+VideoObject** | 불요 | **API** |
| robots meta `max-image-preview:large` | — | 전역 | 현재 메타태그·X-Robots-Tag 둘 다 0 | 불요 | **API** |
| Apple Smart App Banner | — | 전역 | `<meta name="apple-itunes-app" content="app-id=…">` ×3앱 | 불요 | 코드=API / **검증=실기기 Safari(시뮬 불가)** |
| IndexNow | indexnow.org | 빙·네이버·얀덱스·아카이브 | 갱신 URL 일 1회 POST(최대 1만) | 가입 자체가 없음 | **API** |
| llms.txt | signumhq.com/llms.txt | 전역 | 3앱·3로케일·티커맵 (현재 404) | 불요 | **API** ※표준 아닌 «제안» |

### P0 — 트랙 C: 스토어 메타데이터 (ASO 병목 = 이름 필드)

| 항목 | URL | 지역 | 무엇을 | 가입 | 자동화 |
|---|---|---|---|---|---|
| **금융앱 포지셔닝 감사(선행)** | developer.apple.com/app-store/review/guidelines/ | 전역 | 3.2.1(viii)·2.3.7 대응: 전 문구를 «데이터 시각화·교육»으로 고정 | 불요 | **API(원고 린트)** |
| Apple 이름30 / 부제30 | developer.apple.com/app-store/product-page/ | 전역 | SIGNUM·UC의 **ko/ja 현지어 이름** | Apple ID+2FA | **API(ASC)** |
| Apple 키워드 100자 | 〃 | 전역 | 이름·부제와 **중복 없는** 어휘로 100자 채움 | 〃 | **API(ASC)** |
| Apple 카테고리 primary+secondary | developer.apple.com/app-store/search/ | 전역 | secondary 채우기, WIM=Education 검토 | 〃 | **API(ASC)** |
| Play 제목30/짧은설명80/전체설명4000 | support.google.com/…/13393723 | 전역 | ko/ja 재작성 (Play엔 키워드 필드 없음) | 구글계정 | **API(Publisher)** |
| Play 커스텀 스토어 등록정보 50개 | 〃 answer/9867158 | 전역 | 「미국주식」검색자=한국어 이름, 「米国株」=일본어 이름 | 구글계정 | 브라우저(API 없음) |
| Play 그래픽 + **YouTube 프리뷰 연결** | 〃 answer/9866151 | 전역 | 이미 제작된 홍보영상 연결(광고OFF·연령제한X·비공개X) | 구글계정 | **API/브라우저** |
| Play 메타데이터 정책 감사 | 〃 answer/9898842 | 전역 | 이모지·#1·무료·ALL CAPS 제거 | — | **API(린트)** |

### P0 — 트랙 D: 오늘 시계를 돌려야 하는 채널

| 채널 | URL | 지역 | 무엇을 올리는가 | 가입(구글OAuth) | 자동화 |
|---|---|---|---|---|---|
| **Aptoide Connect** | connect.aptoide.com | 전역(50M MAU 자칭) | 패키지명만 — Play에서 자동 수집, 이후 자동 동기화 | 이메일 / **구글 OAuth(쿠키 동의 후)** | **API** |
| **Uptodown Console** | www.uptodown.dev | 전역 | 서명 APK 3종 or 소유권 클레임 | **구글 OAuth + GitHub** | 브라우저 |
| **YouTube API 감사 신청** | support.google.com/youtube/contact/yt_api_form | 전역 | 감사 폼 (수 주 소요, 이거 없으면 업로드가 전부 비공개) | 구글계정 | 사람전용 |
| **Samsung Seller Portal 가입** | seller.samsungapps.com | KR/US | 가입만 — **D-U-N-S 검증 최대 10영업일 ×2** | **구글+카카오 OAuth** | 사람전용 |
| **GeekNews 계정 생성** | news.hada.io | KR | 계정만 (**가입 후 7일 경과해야 등록 가능**) | ID/PW (**OAuth 없음**) | 사람전용 |
| **openPR.com** | openpr.com/news/submit.html | 글로벌(EN) | 영문 PR 1건 + 이미지(Google News 수록 조건) | 계정불요 / **이미지 캡차** | 사람전용(캡차) |
| **Threads API** | developers.facebook.com/docs/threads/create-posts | 전역 | 앱 실화면 세로 영상, 250건/24h | Meta 개발자 (OAuth 없음) | **API** ★심사 0 |
| **Facebook Reels API** | developers.facebook.com/docs/video-api/guides/reels-publishing | 전역 | 세로 MP4 30건/24h, 페이지 신설 필요 | Meta 개발자 | **API** ★개발모드 유지 |
| **Buffer GraphQL Public API 키** | publish.buffer.com/settings/api | 전역 | 기존 X(en/ja) + Bluesky | 이미 유료 구독 중 | **API** ★레거시 REST 금지 |
| **벤처스퀘어** | editor@venturesquare.net | KR | 한글 보도자료 (**무상 게재 원칙** 명문) | 계정불요 | **API(메일)** |
| **플래텀** | editor@platum.kr | KR | 한글 보도자료 «서비스 출시» | 계정불요 / 사이트 403 | **API(메일)** |
| **비석세스 + KoreaTechDesk** | press@besuccess.com / press@koreatechdesk.com | KR(한·영) | **영문 원고 그대로 재사용 가능** | 계정불요 | **API(메일)** ★무료 근거 정황뿐 |
| **ITmedia (11개 매체)** | release@ml.itmedia.co.jp / g-release@ml.itmedia.co.jp | JP | 일본어 릴리스 (Yahoo!/SmartNews/Gunosy 전재) | 계정불요 | **API(메일)** |
| **マイナビニュース** | news-pr@mynavi.jp | JP | 동일 일본어 원고 | 계정불요 | **API(메일)** |
| **アプリオ appllio** | pr@appllio.com | JP | 동일 원고 (당일 4건 게재 = 최고 활성, 기사광고 안 받음) | 계정불요 | **API(메일)** |
| **iPhone Mania** | pr-iphone@red-consulting.jp | JP | iOS 3앱 (LINE/livedoor/SmartNews/Gunosy 전재) | 계정불요 | **API(메일)** ★게재보증 없음 |
| **PR-FREE** | pr-free.jp | JP | 일본어 릴리스 (완전 무료·계정 불요) | 계정 자체 없음 | 브라우저 |
| **Hacker News — Show HN** | news.ycombinator.com/showhn.html | 글로벌 | **웹에서 바로 되는 화면 URL**(스토어 링크 금지) | ID/PW (OAuth 없음) | **사람전용** |
| **Indie Hackers Build Board** | indiehackers.com/products | 글로벌 | 「3앱 51설치·평점 0」숫자 있는 실패담 | 이메일 (**OAuth 없음**) | 브라우저 |
| **디스콰이엇** | disquiet.io | KR | ①제품 3건 등록→승인 ②포스트 (순서 고정) | **구글 OAuth** | 브라우저 |
| **OKKY 피드백** | okky.kr/community/request-for-comments | KR | 「[피드백 원해요]」 — 동종 선례(excelstock.kr) 통과 확인 | **구글 OAuth** | 브라우저 |
| **루리웹 앱 인디 추천 홍보 게시판** | bbs.ruliweb.com/community/board/300034 | KR | WIM 우선 (게시판 목적이 곧 자기홍보) | **구글 OAuth** | 브라우저 |
| **Stocktwits** | stocktwits.com | 글로벌 | **티커 태그 + 데이터**(첫 50포스트 링크 0) | **구글 OAuth** | 브라우저 ★공식 API 신규등록 폐쇄 |
| **FindUpApp** | findupapp.com | JP | 3앱×2스토어=6건 | 가입 자체 없음 / 캡차 | 사람전용(캡차) |
| **네이버TV** | tv.naver.com/upload | KR | 앱 데모 세로 영상 | 네이버 ID (**OAuth 없음**) | **사람전용**(환경에서 도메인 차단) |

### P1

| 채널 | URL | 지역 | 무엇을 | 가입(OAuth) | 자동화 |
|---|---|---|---|---|---|
| ONE store 개발자센터 | dev.onestore.net | KR | AAB 3종 (Samsung D-U-N-S 우회, 이번 주 완료 가능) | 자체계정(**OAuth 없음**) | 브라우저 |
| Play install referrer(UTM) 링크 태깅 | developer.android.com/distribute/marketing-tools/linking-to-google-play | 전역 | 채널별 UTM (라이브러리는 다음 바이너리) | 불요 | **API** |
| Apple In-App Review (SKStoreReviewController) | developer.apple.com/documentation/storekit/skstorereviewcontroller | 전역 | 평점 확보(3회/365일) — **바이너리 변경** | — | 사람전용(빌드·제출) |
| Play In-App Review API | developer.android.com/guide/playcore/in-app-review | 전역 | 동일 — **버튼 금지, 쿼터형** | — | 사람전용(빌드) |
| Apple Custom Product Pages(70개) | developer.apple.com/app-store/custom-product-pages/ | 전역 | 채널별 랜딩(ct와 페어) | Apple ID | **API(ASC)** |
| Apple In-App Events(10/15) | developer.apple.com/app-store/in-app-events/ | 전역 | FOMC·CPI·실적주간 «데이터 해설» | Apple ID | **API(ASC)** |
| Apple 앱 프리뷰 영상 (현재 3앱 0개) | developer.apple.com/help/…/upload-app-previews-and-screenshots | 전역 | 6.9" 3편 ×3언어 | Apple ID | **API(ASC)** |
| 크로스 로컬라이제이션 | developer.apple.com/help/app-store-connect/reference/app-information/app-store-localizations | US | 미국 스토어프론트가 **Korean 함께 색인** | Apple ID | **API(ASC)** ★로케일 1개씩 |
| ASC API 메타데이터 자동화 | developer.apple.com/documentation/appstoreconnectapi | 전역 | 필드 7개 확정(locale, keywords…) | 키 보유 | **API** |
| Play Android Publisher API | developers.google.com/android-publisher/…/edits.listings | 전역 | listings PUT | 서비스계정(대표 1회 권한부여) | **API** |
| Apple Ads $100 크레딧 | ads.apple.com | 전역 | 키워드 인기도 «데이터 구입» | Apple ID+결제 | 사람전용 |
| Apple 마케팅 툴박스 / Play 배지·Device Art Generator | toolbox.marketingtools.apple.com / partnermarketinghub.withgoogle.com | 전역 | 웹 배지 + **스크린샷 기기 프레임** | **로그인 불요** | 브라우저 |
| Zenn (+GitHub 연동) | zenn.dev | JP | 기술글 + **말미 고정 홍보(가이드라인 명시 허용)** | **구글 OAuth** | **API(git push)** |
| DEV.to #showdev | dev.to/t/showdev | 글로벌 | 실측 기술글(인셋 버그·AdMob 차이) | **구글 OAuth** | **API** |
| Fazier / Twelve Tools / Startup Fame / PeerPush / Launching Next | 각 submit | 글로벌 | signumhq.com 1건씩 (무료 dofollow) | 구글 OAuth 다수 | 브라우저 |
| Peerlist Launchpad | peerlist.io/launchpad | 글로벌 | 3앱 3주 순차 (PH 제약 없음) | **구글 OAuth** | 브라우저 |
| AlternativeTo | alternativeto.net | 글로벌 | «Unusual Whales 대안» 등 — $5 우선심사 ×4 | **구글/GitHub/Apple** | 브라우저 |
| SaaSHub | saashub.com/services/submit | 글로벌 | **signumhq.com 본진** + 경쟁사 필수 기재 | 이메일(**OAuth 없음**) | 브라우저 |
| Awesome Indie / Versily / NoonLaunch | 각 submit | 글로벌 | 3앱 or 웹 | **구글 OAuth** | 브라우저 |
| TikTok Content Posting API 감사 | developers.tiktok.com | US/JP | 감사 신청(2~4주) | 이메일(OAuth 없음) | **API**(감사 후) |
| YouTube videos.insert | developers.google.com/youtube/v3/docs/videos/insert | 전역 | 숏폼 100건/일 | 구글 | **API**(감사 후) |
| Bluesky | bsky.social | 전역 | 앱 캡처+데이터 (영상 **60초** 확인값) | 이메일+**SMS 인증 필수** | **API** |
| Telegram Bot API (자사 채널) | core.telegram.org/bots/api | KR/글로벌 | 리포트 자동 게시 | 전화번호 | **API** |
| LinkedIn 회사 페이지 + w_member_social | linkedin.com/company/setup/new | US | 법인 실체 신호 + 개인 게시 | LinkedIn 계정 | 브라우저→**API** ★조직권한 미확정 |
| PR-Inside / valuepress! / PRESSNOW / ぷれりり / DreamNews | 각 사이트 | US/JP | 2차 배포 | 각각 상이 | 사람전용/브라우저 |
| 티스토리 / Daum 검색등록 | tistory.com / register.search.daum.net | KR | 한국어 콘텐츠 + 사이트 등록 | 카카오 / 계정불요 | 브라우저/사람 |
| 모비인사이드 필진지원 | mobiinside.co.kr/editor_apply | KR | 「앱 3종 마케팅 실험기」 | 폼 | 사람전용 |
| kojin.dev / izanami / Tsukutta / Solomaker | 각 사이트 | JP | 3앱 등록 (한 배치로) | **구글 OAuth 다수** | 브라우저 |
| Qiita / Qiita Organization | qiita.com | JP | 자작 기술해설(«홍보 아님» 명문) | **구글 OAuth**(Org 화면 확인) | 브라우저 |
| Google Discover | developers.google.com/search/docs/appearance/google-discover | 전역 | 기사형 콘텐츠 필요(현재 기사 URL 0개) | 제출 창구 없음 | **API**(콘텐츠) |
| EO PLANET / 스타트업엔 | eopla.net / startupn.kr | KR | 회고글 / 보도자료 | 이메일 / 캡차 | 브라우저/사람 |

### P2 (요약)

Microsoft Store(PWA·개인계정 경로) · Indus Appstore(API) · Amazon Appstore(**Fire OS 전용으로 축소, AdMob·FCM 죽음**) · AppBank(JP 무료PR) · Google Play 스토어 등록정보 실험(표본 부족으로 대기) · **Apps Innovation Corner(평점 4.0 잠김)** · Apple Featuring Nominations(리드타임 3주+) · Featured.com(무료 영구+구글OAuth) · SourceBottle · Apple News Publisher(US/UK/AU/CA만) · Zenn Publication · HackerNoon(창업자 카브아웃, **개인 계정+기술글 필수**) · Statichunt · GitHub Topics + 공개 저장소 · Hashnode · freeCodeCamp(DEV 3편 선행) · Pinterest(Trial은 본인만 보임 → Standard 승인 필요) · Dailymotion · Tumblr · Discord Webhook · LINE VOOM · Spotify for Creators · PR.com/PRLog/PRFree/NewswireToday/openPR.de/Connektar · Sensor Tower 무료 · Internet Archive Save Page Now · RSS 피드 신설 · Open Launch/Smol Launch/Tiny Startups/TinyLaunch/StartupBase/SoloPush · F6S · Feedly

### P3 (요약 — 여력 남을 때만)

AltStore PAL(일본 포함되나 자체 호스팅 부담) · Xiaomi GetApps(**Aptoide로 대체**) · Bing URL Submission API(**IndexNow와 중복 — 만들지 말 것**) · Yandex Webmaster(**IndexNow 부산물**) · Postiz/Publer/Metricool/Blotato/Ayrshare(**Buffer API 생존으로 전부 중복**) · Appfigures · Play Academy · 원스토어 외 KR 3rd · QuantConnect · Substack/beehiiv Recommendations(콜드스타트 불가) · Bogleheads · Wall Street Oasis · TradingView($59.95/월, 서명란만) · Console.dev · StackShare · SoftwareApplication 마크업(**리뷰 확보 후 P1 승격**) · Product Hunt(**아래 1회성 카드 참조 — 실제론 최후에**)

---

## 2. 대표(사람)만 가능한 것 vs 에이전트가 할 수 있는 것 ★가장 중요

### 2-A. 대표 전용 — 「액션 데이 1」 (약 2시간, 이번 주 안)

계정 생성·2FA·결제·캡차·본인인증은 **에이전트가 원천적으로 못 한다.** 아래를 한 번에 끝내면 그 다음부터 대부분이 자동화로 넘어간다.

**① 구글 버튼 한 번씩 (약 25분)** — 전부 구글 OAuth 확인됨
- Aptoide Connect (쿠키 동의 후 구글) / Uptodown Console / OKKY / 디스콰이엇 / 루리웹 / Stocktwits / Bing Webmaster / Google Search Console / Peerlist / Fazier / Startup Fame / PeerPush / Awesome Indie / Zenn / DEV.to / Qiita / Samsung Seller Portal

**② 구글 OAuth 없는 계정 (약 20분)**
- **GeekNews (ID/PW — 오늘 만들어야 7일 뒤에 쓴다)** / Hacker News / Indie Hackers / SaaSHub / ONE store / 네이버 ID 확인(서치어드바이저·네이버TV용) / 티스토리(카카오)

**③ 캡차·폼 (약 30분)**
- openPR.com 제출(이미지 캡차 — **이번 달 슬롯을 안 쓰면 소멸**) / FindUpApp 6건 / 스타트업엔 / (선택) SourceBottle·Featured.com

**④ 개발자 게이트 (약 30분)**
- **YouTube API 감사 폼 제출** (이거 없으면 자동 업로드가 전량 비공개)
- **Meta 개발자 앱 생성** + IG 프로 계정 연결 + **Facebook 페이지 신설** → 토큰 발급해 에이전트에 전달
- **Buffer API 키 발급** (publish.buffer.com/settings/api)
- **Play 서비스 계정 생성 + Console 권한 부여**
- (선택) TikTok 개발자 계정 + 감사 신청

**⑤ 오직 대표만 되는 상시 작업**
- App Store Connect 전 작업의 **Apple ID + 2FA** (ct 캠페인 링크 생성, 로케일 추가, 심사 제출 버튼)
- Play Console 커스텀 스토어 등록정보 생성(API 없음)
- **네이버TV 업로드**(조사 환경에서 도메인 차단 — 주 1~2회, 4주만)
- **실기기 Safari로 Smart App Banner 확인** (애플이 «시뮬레이터에는 안 뜬다»고 명시 → 시뮬에서 안 보이는 걸 버그로 오진하지 말 것)
- 결제가 붙는 것 전부: Apple Ads, AlternativeTo $5×4, 클리앙, PR 유료

### 2-B. 에이전트가 지금 바로 할 수 있는 것 (계정 없이)

- **자사 코드 전부**: sitemap WIM 추가, hreflang, JSON-LD 교체, robots meta, Smart App Banner 삽입, llms.txt, RSS 신설, IndexNow 키 파일 + 크론
- **ASC API 직행**(키 보유): 이름·부제·키워드·카테고리·설명 읽기/쓰기, Analytics Reports 수집, In-App Events·CPP 생성
- **원고·에셋 생산 전량**: en/ko/ja 보도자료 3세트, 스토어 문구 3앱×3언어, 스크린샷 공장 이식(`wim-app/make-store-shots.js` → SIGNUM/UC), 앱 프리뷰 영상, 기술글(Zenn/DEV.to/Qiita)
- **금지어·컴플라이언스 린트**: 예측·추천·수익률 표현, 이모지/#1/무료/ALL CAPS
- **메일 발송 준비**: 벤처스퀘어·플래텀·비석세스·ITmedia·マイナビ·appllio·iPhone Mania — 원고 완성까지. **발송 자체는 대표 승인 후**(외부 발신은 승인 필요)
- **로그인 세션이 확보된 뒤의 브라우저 작업**: 디렉터리 폼 입력, 런치보드 제출, 디스콰이엇 제품 등록

### 2-C. 경계선 — 에이전트가 "하면 안 되는" 것

- **캡차 우회 금지**(정책). openPR·PR-Inside·1888PressRelease·FindUpApp·valuepress·Sensor Tower·스타트업엔은 전부 사람.
- **메일·게시물 발송은 대표 승인 후에만.** 원고 준비까지가 에이전트 몫.
- **Show HN / Product Hunt / GeekNews / 레딧**은 업보트 요청·자동 게시가 밴 사유 → **손으로**.

---

## 3. 자동화 설계

### 3-A. API로 붙일 것 (코드 = 영구 자산)

| 배관 | 대상 | 비고 |
|---|---|---|
| **ASC API (JWT/.p8)** | 메타데이터 18종, Analytics Reports, In-App Events, CPP | 필드명 확정: `description, keywords, locale, marketingUrl, promotionalText, supportUrl, whatsNew` — **`localeCode` 아님** |
| **Play Android Publisher API** | listings PUT | **edit은 묶음 커밋. 대표가 Console을 만지면 기존 edit이 통째로 폐기된다** → 동시 작업 금지 락 필요 |
| **IndexNow** | 빙·네이버·얀덱스·아카이브 | 1회 POST로 4곳. **네이버 키 슬롯을 미리 만들어 둘 것** |
| **Buffer GraphQL Public API** | X(en/ja) + Bluesky | Bearer, MCP 서버·CLI 제공. **레거시 REST 금지(2027-02-01 사망)** |
| **Threads / Facebook Reels / Instagram** | 세로 영상 | 자사 계정만 쓰면 App Review 회피(개발모드 유지) |
| **Telegram Bot API** | 자사 채널 | 자사 채널 한정을 코드로 강제 |
| **Zenn ← GitHub push** | JP 기술글 | 마크다운 push = 발행. 계정당 리포 2개 |
| **DEV.to `POST /api/articles`** | 글로벌 기술글 | api-key 헤더, canonical_url을 signumhq.com으로 |
| **YouTube videos.insert** | 숏폼 | **감사 통과 전엔 코드만 짜두고 수동 업로드** |
| **메일 발송(SMTP)** | KR/JP 보도자료 | 원고 생성→승인→발송 |

### 3-B. 브라우저 자동화 (세션 확보 후)

디렉터리 제출(Uptodown·SaaSHub·Fazier·Twelve Tools·Startup Fame·PeerPush·Launching Next·Peerlist·Awesome Indie·kojin.dev 4종) · 디스콰이엇 제품 등록 · Play Console 커스텀 리스팅 · Stocktwits 게시.
**금지**: Cloudflare/봇 차단이 걸린 곳(APKPure·플래텀·GIGAZINE·F6S·arca.live·G2) — 우회 시도 자체를 하지 말 것.

### 3-C. 스킬로 만들 것 (반복되므로)

| 스킬 | 하는 일 | 근거 |
|---|---|---|
| `aso-metadata-sync` | `store-metadata/*.yaml` → ASC + Play 양방향, 드라이런 diff 필수 | 메모리 «ASO 키워드는 제출 시점 붙여넣기까지가 일» 사고 재발 방지 |
| `compliance-lint` | 예측·추천·수익률 / 이모지·#1·무료·ALL CAPS / 투자자문 오인 스캔 | Apple 3.2.1(viii)·2.3.7, Play 메타데이터 정책, 한국 유사투자자문, JP 금상법 |
| `seo-hygiene-gate` | sitemap·hreflang·JSON-LD·robots·llms.txt 검사 + **배포 후 파일 «내용»으로 판정** | 메모리 «HTTP 200·헤더는 무용» |
| `indexnow-ping` | Vercel 크론, 일일 갱신 URL POST | |
| `store-shots` | WIM 스크린샷 공장 → SIGNUM/UC 이식, 3언어 × 6.9"/13" | 이미 puppeteer 공장 보유 |
| `video-gate` | **밝기·화소·컷 하한 자동 검수 후에만 발행** | 메모리: 과거 렌더물 평균밝기 5.2/255 |
| `social-fanout` | Buffer+Threads+Reels+Telegram 단일 진입점, **ct/UTM 자동 부착** | |
| `attribution-weekly` | ASC Analytics Reports + Play 리포트 → 채널별 설치 주간표 | «효과 0» 판정의 유일한 근거 |

---

## 4. 1회성(비가역) 카드 vs 반복 채널 — 순서를 틀리면 안 되는 것

### 4-A. 총알이 한 발인 카드 (준비 끝나기 전에 쏘지 말 것)

| 카드 | 제약 | 언제 쏠 것인가 |
|---|---|---|
| **Product Hunt** | **같은 회사 6개월 1회**. 3앱을 1년에 못 올린다. 회사계정 금지(대표 개인) | **가장 마지막**(90일차). 3앱 중 지표가 붙은 1개만 |
| **Show HN** | 앱당 1회, 업보트 요청 금지, 링크는 «바로 써지는 화면» | 30일차, UC 1발 → 반응 보고 60일차 SIGNUM |
| **GeekNews Show** | «여러 프로젝트 짧은 기간 반복 등록 = 배포 채널 취급»으로 제한 | 계정=오늘 / 게시=수 주 간격 1건씩 |
| **openPR.com** | 30일 1건, 안 쓰면 슬롯 소멸 | 이번 달 안에 무조건 |
| **openPR.de** | 연 2건 (독일어 필요) | 영문 소진 후 |
| **PressReleasePoint** | 3개월 1건 무료 | |
| **1888PressRelease** | **제출 후 수정 불가** | 원고 100% 확정 후 |
| **NewswireToday** | **삭제에 수수료** | 동일 |
| **ぷれりり** | **수정·삭제 건당 5,500엔** + AI 양산 콘텐츠 금지 | 앱마다 다른 각도로 개별 집필 |
| **Smol Launch** | first launch만 무료, 재런치 유료 | 3앱을 3주에 나눠 |
| **Samsung 국가 설정** | 등록 후 변경 불가(탈퇴 후 재등록) | 첫 화면에서 반드시 확인 |
| **Apple 요약 평점 리셋 토글** | **비가역**. 지금은 리셋할 것도 없지만 평점이 붙기 시작하면 사고 | 제출 체크리스트에 «OFF 확인» 한 줄 |
| **Internet Archive** | 사실상 삭제 불가 | **유료화 계획이 있으므로 «무료» 문구 박제 주의** |
| **AlternativeTo** | 다계정·업보트 유도 = 영구 정지 | 정직하게 1회 등록만 |

### 4-B. 반복 가능 (엔진으로 굴릴 것)

Apple: Featuring Nominations(무제한 재제출) · In-App Events(동시 10/승인 15) · Custom Product Pages(70) · 앱 프리뷰(기기·언어당 3)
Play: 커스텀 리스팅(50) · 스토어 실험 · 태그
콘텐츠: Zenn·Qiita·DEV.to·Hashnode·티스토리·EO PLANET
런치보드 주간 로테이션: Peerlist(주 1) · Smol Launch · TinyLaunch · StartupBase · Open Launch · Tiny Startups
소셜: Buffer·Threads·Reels·Bluesky·Telegram·Stocktwits

### 4-C. 순서 의존성 (선행 조건 위반 금지)

```
검색어 리포트(Play) + Apple Ads 키워드
   └→ Apple 이름/부제/키워드 + Play 제목/설명 + 커스텀 리스팅   ← 확정 전 제출 금지(심사 재탕)

In-App Review 탑재(다음 바이너리)
   └→ 평점 축적(KR·JP·US 3국 집중)
        ├→ Apps Innovation Corner(4.0 필수 — 지금 제출하면 자가확인 허위체크)
        ├→ SoftwareApplication 리치결과(평점/리뷰가 «필수» 속성)
        └→ Apple Featuring Nomination

DEV.to 기술글 3편 → freeCodeCamp 기고 신청(3편 URL 필수)
Capacitor 기술글 공개 → awesome-capacitorjs / riderx PR (등재물 전부 케이스스터디 URL)
はてなブログ 개설 → にほんブログ村 米国株 등록(«블로그»만 등록 가능)
기사형 URL 발행 → RSS → Apple News / Feedly / Google Discover
IndexNow 배관 → 네이버 키 추가(슬롯만 끼우면 끝)
YouTube 감사 통과 → videos.insert 자동화 (그 전엔 전부 비공개)
TikTok 감사 통과 → 공개 게시
Aptoide 파트너 채널 ON → Xiaomi 직접 등록 «불필요»
요금/무료한도 페이지 + GEX·맥스페인 방법론 공개 → awesome-quant PR
```

---

## 5. Buffer + X 「효과 0」 진단과 대체안

### 5-A. 확인된 사실

1. **「0」이 측정된 적이 없다.** ct(Apple)·UTM(Play) 어느 쪽도 안 붙어 있다. 지금 상태에서 «효과 0»은 관측이 아니라 **인상**이다.
2. **소재가 정보를 전달하지 않는다.** OG 자동생성 이미지는 «앱 화면»이 아니라 «썸네일»이다. 대표 판단(앱 화면 캡처가 낫다)은 방향이 맞다. 메모리의 «생성 미디어는 내용과 매칭될 것» 원칙과 동일.
3. **Buffer는 버릴 필요가 없다.** 조사 최대 정정 — Buffer GraphQL Public API가 2026-05 출시되어 살아 있고 Bearer 토큰 + MCP 서버 + CLI를 제공한다. 반대로 **X API 직결은 링크 포함 포스트가 건당 $0.200** — 하루 3편×2계정이면 월 $36을 «지금 공짜로 되는 일»에 새로 내는 셈. **도구 교체는 답이 아니다.**
4. **채널 자체가 미스매치.** X 일반 타임라인은 팔로워 0에서 도달이 안 붙는다. 반면 Stocktwits는 **TSLA 1,061,978 / NVDA 660,172 / SPY 636,248 watchlist**의 티커 스트림이 있고, 규칙이 «데이터 피드형 봇»을 명시 환영한다.
5. **레거시 REST는 2027-02-01 사망.** 브라운아웃 2026-11-11, 12-09. 한 줄도 쓰지 말 것.

※ 「X 알고리즘이 링크 포스트를 억제한다」는 흔한 설명은 **근거 미확보** — 사실로 쓰지 않는다.

### 5-B. 처방 (순서대로)

**1단계 — 측정을 켠다 (이번 주, 비용 0)**
- 채널별 ct 발급: `x-en`, `x-ja`, `youtube`, `web`, `stocktwits`, `threads`, `reels`
- Play는 UTM 링크로 태깅 (완전 귀속은 다음 바이너리의 Install Referrer 라이브러리)
- ★주의: Apple 어트리뷰션 창은 **24시간**. 느린 전환은 과소 계상되므로 «0으로 나왔다 = 효과 0»으로 곧장 읽지 말 것.

**2단계 — 소재를 교체한다 (비용 0)**
- OG 이미지 → **앱 실화면 세로 캡처 + Google Device Art Generator 기기 프레임**(무료·로그인 불요). 프레임이 씌워지면 «광고»가 아니라 «제품»으로 읽힌다.
- 포맷 3종: ①실화면 캡처 1장 + 데이터 한 줄 ②3초 루프(밝기·컷 게이트 통과분만) ③숫자 있는 사실 1문장
- 문구는 현재·과거 사실만. 예측형 은유 금지(사내 규칙 그대로).

**3단계 — 채널을 옮긴다**
- **Stocktwits**: 구글 OAuth로 개설 → **첫 50포스트는 링크 0으로 순수 데이터** → 이후 홍보 10% 이하. FAQ상 «유료 서비스/페이월/광고 링크»가 홍보 정의이고 우리 3앱은 전부 무료라 링크가 «홍보»에 안 걸릴 여지가 크다(단 «홍보 목적 위주 게시»는 별도 스팸 조항).
- **Threads(250/24h) + Facebook Reels(30/24h)**: 같은 세로 MP4 재사용, 심사 0. **Reels는 팔로워 0에서도 알고리즘 노출이 발생**하는 몇 안 되는 채널.
- **Bluesky**: Buffer에 계정만 추가(한계비용 0). 다만 시간순 타임라인이라 즉효 아님.

**4단계 — 4주 뒤 판정**
`attribution-weekly` 리포트로 채널별 설치를 본다. 여기서 처음으로 «X가 0인지»를 사실로 말할 수 있다. 0이면 그때 Buffer의 X 슬롯을 Stocktwits/Threads로 재배분.

---

## 6. 30 / 60 / 90일 실행 순서

### Day 1–7 — 「시계를 돌리고, 자사 자산을 고친다」

**대표 (액션 데이 1, 2시간)** — 2-A 전부. 특히 시계가 걸린 것: **Samsung 가입(D-U-N-S 최대 20영업일)** / **GeekNews 계정(7일)** / **YouTube 감사(수 주)** / **openPR(월 슬롯)** / **Bing REST(SOAP 8-31 폐지)**

**에이전트**
- 배포 1건에 묶어서: sitemap WIM 3 URL + hreflang(x-default 포함) + **FAQPage→Dataset/Organization/BreadcrumbList 교체** + robots `max-image-preview:large` + Smart App Banner(앱 WebView는 `sig_native` 쿠키로 분기) + llms.txt + IndexNow 키
- 배포 후 **파일 «내용»으로** 검증(200/헤더로 판정 금지)
- ASC API로 3앱 현재 메타데이터 전량 덤프 → `store-metadata/` 버전관리 시작
- `compliance-lint` 1차 통과: 3앱 전 문구를 «데이터 시각화·교육»으로 재프레이밍 (Apple 3.2.1(viii) 방어)
- Aptoide 3앱 등록(패키지명만) / Uptodown 3앱 or 소유권 클레임
- Play 검색어 리포트 + App Analytics 수집 → 진단 문서
- 보도자료 3세트 초고(en/ko/ja) + 스크린샷 번들

**판정 질문**: 노출 자체가 0인가, 노출은 있는데 전환이 0인가. 이 답이 30일차 우선순위를 바꾼다.

### Day 8–30 — 「검색되게 만들고, 1발짜리를 한 발씩」

- **ASO 리라이트**(검색어 리포트 기반): Apple 이름/부제/키워드/카테고리 + 크로스로컬라이제이션(미국 스토어프론트 Korean 색인) / Play 제목·설명·태그 + **커스텀 스토어 등록정보**(「미국주식」→한국어 이름, 「米国株」→일본어 이름). ★로케일은 한 번에 하나씩(저장 원자적 → 핑퐁)
- **Play YouTube 프리뷰 연결** — 이미 만든 영상이 미사용 상태. 광고OFF·연령제한X·공개/비공개목록 확인 후 **실제 스토어 페이지에서 눈으로** 확인(에러 없이 조용히 미표시되는 유형)
- **앱 프리뷰 영상 3앱×3언어** — 현재 0개. `video-gate` 통과분만
- 보도자료 1차 발송(대표 승인 후): KR 3(벤처스퀘어·플래텀·비석세스+KoreaTechDesk) / JP 4(ITmedia·マイナビ·appllio·iPhone Mania) / PR-FREE / openPR 1건
- **Show HN 1발(UC)** — 스토어 링크 아닌 웹 화면
- Indie Hackers Build Board / 디스콰이엇(제품 등록→승인→포스트) / OKKY / 루리웹(WIM) / GeekNews 1건(7일 경과 후)
- Stocktwits 개설 → **첫 50포스트 링크 0**
- Threads + FB Reels 배관 가동, Buffer 소재 교체
- 무료 백링크 배치 1회(Fazier·Twelve Tools·Startup Fame·PeerPush·Launching Next·Peerlist)
- ONE store 3앱 등록(Samsung 대기 중 우회로)

### Day 31–60 — 「평점을 만들고, 판을 넓힌다」

- **In-App Review 탑재 = 다음 바이너리**: SKStoreReviewController + Play In-App Review. **«만족하시나요?» 분기 금지**(5.6.1 위반 소지), **«평가하기» 버튼 금지**(Play 문서 명시), **성공 콜백에 UI 상태 걸지 말 것**(메모리: 플러그인 프라미스에 UI 걸어 WIM 소프트애스크 유실). **시뮬 콜드스타트 실화면 검증 후에만 제출**
- 평점은 **KR·JP·US 3국 집중** (Play는 국가별 평점 분리 확정 / Apple 국가별 분리는 근거 미확보)
- Apple **Custom Product Pages**(ct와 페어) + **In-App Events**(FOMC/CPI «데이터 해설» 프레이밍)
- Samsung 승인 시 3앱 등록 + **US/KR 무료 편집기사(App Promotion 탭)** 신청
- Microsoft Store PWA(**개인 개발자 계정 경로로 D-U-N-S 회피**)
- 기술글 3편(Zenn GitHub 연동 / DEV.to API / Qiita) — 소재: 안드로이드 인셋 음수 버그, AdMob 플랫폼별 margin 기준선, WebView safe-area. → **freeCodeCamp 기고 신청**
- 네이버TV 주 1~2회 수동 업로드 **4주 한정 검증**
- 보도자료 2차 + Show HN 2발(SIGNUM)
- Apple Ads $100 크레딧으로 KR/JP 키워드 인기도 «구입» → 유기적 keywords에 이식
- TikTok 감사 통과 시 게시 개시

### Day 61–90 — 「지표를 근거로 큰 카드를 쓴다」

- 평점 4.0 도달 앱(WIM 유력) → **Google Play Apps Innovation Corner** 제출 (미국 법인·팀 규모·출시 2년 이내는 이미 충족, 남은 건 평점 하나)
- **Apple Featuring Nomination** (리드타임 3주 이상, 보충 URL 5개에 유튜브 영상). 3앱을 한 노미네이션에 묶어 «미국 주식 3부작»
- **Product Hunt 1발** — 회사당 6개월 1회. 3앱 중 지표가 붙은 하나만, 개인 명의로
- SoftwareApplication 마크업(리뷰 확보 후 P1로 승격)
- awesome-quant PR — **요금/무료한도 페이지 + GEX·맥스페인 방법론 공개 페이지 선행**(둘 다 ASO·규제 방어에도 쓰이므로 버리는 공수 아님). UTM 붙이면 즉시 리젝
- awesome-capacitorjs + riderx PR(기술글 1개로 2건)
- **90일 성과 리뷰**: `attribution-weekly` 누적으로 채널 정리 — 설치 기여 0인 채널은 잘라내고, 기여가 확인된 채널에만 시간 재배분

---

## 7. 하지 말아야 할 것

### 7-A. 계정·도메인이 비가역으로 날아가는 것

- **캡차·봇 차단 우회 금지**(정책). APKPure·플래텀·GIGAZINE·F6S·arca.live·G2·인베스팅닷컴은 대표가 사람 브라우저로만.
- **업보트 요청·조작 금지**: Hacker News(«친구에게 부탁 금지» 명문), Product Hunt(«직접 요청 금지»), AlternativeTo(«할인·선물로 유도, 가짜 계정» = 계정 차단), はてなブックマーク(«ブックマークの依頼» 금지·다계정 금지).
- **Reddit 자동 게시 금지**: Developer Terms §4.1이 상업적 사용에 별도 계약을 요구. 최악은 **도메인 단위 shadowban** — 걸리면 signumhq.com 전체가 레딧에서 막히고 3앱 경로를 한 번에 잃는다. r/Daytrading은 «제품 페이지 링크 = 즉시 밴» 명문.
- **한국 대형 커뮤니티 자기홍보 금지**(전부 약관 명문): 디시인사이드 제11조 9호 / 에펨코리아 / 뽐뿌(즉시 레벨강등) / 더쿠(홍보 게시물 삭제·영구차단) / 클리앙(«앱» 명시). 유일한 합법 경로는 유료 상품(클리앙 직접홍보 30일 99,000원 — 단 **LLC 기업회원 가능 여부 미확정, 결제 전 문의**)과 더쿠 체험단.
- **네이버 카페·카카오 오픈채팅 링크 투척 금지**: 등업 없는 계정 = 무통보 삭제·강퇴. 주식 오픈채팅은 리딩방 규제 한복판.
- **타인 텔레그램 채널/디스코드 서버/마스토돈 인스턴스 홍보 투척 금지** — 자사 채널 한정을 **코드 레벨에서 강제**.
- **Wikidata 자작 항목 금지** — 자사 항목 생성은 «strongly discouraged»이고 우리가 근거로 삼으려던 스토어 리스팅·보도자료는 명시적 부적격. 삭제 토론 + 계정 차단 리스크.
- **Lobsters 초대 우회 금지**(첫 70일 신규 도메인 링크 제출 자체가 불가).

### 7-B. 법적·규제 위험

- **예측·추천·수익률 표현 전면 금지** — 한 문장이 5개 관문에 동시에 걸린다: Apple **3.2.1(viii)**(«금융 거래·투자·자금관리 앱은 해당 금융기관이 제출하고 라이선스가 있어야») / Apple 2.3.7(unverifiable product claims) / Play 메타데이터 정책 / 벤처스퀘어·ITmedia의 «광고성 반려» / 한국 **유사투자자문업** / 일본 **금융상품거래법 투자조언**.
  → 3앱 전 문구를 «시장 데이터 시각화·교육»으로 고정. IssueWire의 «Money making schemes» 금지 조항도 같은 이유로 저촉.
- **Myket / Cafe Bazaar(이란) 금지** — 미국 LLC의 OFAC 제재 위반 소지. **RuStore 비권장**(제재 + 152-FZ). **Huawei AppGallery 비권장**(Entity List 검토 선행, 실익 0).
- **Play Families / Teacher Approved 편입 금지** — 아동 대상 정책으로 들어가면 2026-08-19 막 시작한 광고 수익 구조가 무너진다.
- **Daum 검색등록 시 «투자자문업/유사투자자문업/금융» 카테고리 자칭 금지** — 등록통보 서류나 협회 등록번호를 요구받아 미국 LLC로는 원천 불가. «무료 정보·교육 사이트»로만.

### 7-C. 자충수·중복 투자

- **Buffer 레거시 REST 사용 금지**(2027-02-01 사망). GraphQL만.
- **X API 직결 금지** — 링크 포스트 건당 $0.200, Buffer가 무료로 같은 일을 한다.
- **Publer / Metricool / Blotato / Ayrshare / Postiz 신규 결제 금지** — Buffer API 생존으로 전부 중복. Ayrshare 최저 $149/월.
- **Bing URL Submission API 별도 구축 금지** — IndexNow와 중복(빙 자신이 IndexNow로 안내). **Yandex Webmaster 계정도 불필요**(IndexNow 부산물).
- **Xiaomi GetApps 직접 등록 금지** — Aptoide 파트너 채널로 대체(사업자등록증 업로드·등기명 정합성 회피).
- **launchdirectories.com의 'Free/DR' 표를 근거로 쓰지 말 것** — 실측에서 Firsto(무료 180일 대기), Open-Launch(무료 2027년까지 마감), Product Launchpad(Free 표기인데 $9 전용)로 틀렸고, 해당 사이트 창업자가 Product Launchpad 추천사를 쓴 이해관계가 있다.
- **Uneed 「Auto-Submit to 100+ directories」 $249 금지.** **BriefingWire 등 저품질 포털 대량 배포 금지**(SEO 스팸 신호를 signumhq.com에 쌓는다).
- **Google Play 스토어 실험 / Apple PPO(A/B) 지금 켜지 말 것** — 설치 51건 규모에서 «승자»는 노이즈다. 노이즈를 정책으로 굳히게 된다.
- **Apple 요약 평점 «리셋» 토글** — 새 버전 제출 화면에 붙어 있다. 제출 체크리스트에 «OFF 확인» 한 줄.
- **`git add -A` 금지** — 커밋 전 `git status` 눈으로 확인(메모리: 보류 변경 18파일이 딸려가 전 종목 +0.00% 사고).
- **Play Console 수동 편집과 Publisher API 동시 작업 금지** — «Console 변경이 기존 edit을 폐기»가 원문. 서로의 작업이 조용히 사라진다.
- **Seeking Alpha / r/options에 AI 생성물 금지** — 양쪽 다 AI 사용을 전면 금지하며 엄격 집행. 우리 파이프라인과 원천 충돌.
- **네이버 API·서치어드바이저를 «가능»으로 전제한 계획 금지** — 규칙 원문을 못 봤다. 대표가 네이버 ID로 로그인해 확인하는 것이 첫 단계.

---

## 부록: 이번 조사에서 뒤집힌 전제 (기존 계획을 쓰고 있다면 정정 필요)

1. **Buffer는 API가 없다 → 있다**(GraphQL Public API, MCP·CLI 포함). 유료 스케줄러 이전 검토 중단.
2. **Amazon Appstore = 안드로이드폰 배포 → Fire OS 전용으로 축소.** Play Services 없어 **AdMob·FCM 죽음**.
3. **AltStore PAL = EU 법인 필요 → 아님.** 어디서든 가능하고 **일본 포함**.
4. **디스콰이엇 폐업설 → 오정보.** 실피드 32분 전 게시물.
5. **Google Play 무료앱 편집추천 경로 없음 → 부분 정정.** 프리미엄 폼은 부적격이 맞지만 **Apps Innovation Corner**가 실재(평점 4.0만 미충족).
6. **/flow 501페이지에 구조화 데이터가 «없다» → 있는데 타입이 FAQPage(갤러리 삭제 타입)**. 신규 개발이 아니라 치환.
7. **네이버는 RSS가 선행조건 → 아님.** 네이버 공식 문서가 «RSS보다 사이트맵을 권장». 우리는 이미 513 URL 사이트맵 보유 → **오늘 착수 가능**.
8. **Mobile Action 무료 키워드 추적 → 사실 아님**(ASO Intelligence 무료 플랜 없음, 7일 체험도 결제정보 요구).
9. **PR TIMES 스타트업챌린지·뉴스와이어 스타트업 지원 → 미국 LLC 원천 부적격**(일본/한국 국내 법인 요건).
10. **무료 PR 사이트 5곳(OnlinePRNews·Free-Press-Release·i-Newswire·PRBuzz·ReleaseWire) 사망 확인.** 추천 리스트에서 제거.