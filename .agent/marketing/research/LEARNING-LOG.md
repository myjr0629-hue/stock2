# 최신 기술·플랫폼 변화 학습 기록 (주 1회, 1차 출처)

> 대표 지시(2026-09-28): «매번 작업을 하면서 기록하고 그리고 고도화하고 더 최신 기술을 습득하고 성과를 만들어내는 그런 엔진으로 성장»
> 형식: 날짜 · 플랫폼 · 무엇이 바뀌었나(원문 인용·URL) · 우리에게 뜻 · 이번 주 시험 1건 · 결과(다음 주에 채움)

## 2026-09-29 주간 학습 스캔

> 범위: 8~9월 변화 중심(6~7월 발표라도 지금 효력이 생긴 것 포함). 1차 출처로 확인 못 한 것은 «미확인». 권한: [즉시] 지금 권한으로 가능 · [대표 승인] 공개 표면 변경·약관·계정 · [빌드 필요].

### 1. 애플 — iOS 27(9/14 출시) 검색 결과·제품 페이지 맨 위에 «크리에이티브 에셋»
- **무엇이 바뀌었나**: 제품 페이지 헤더·검색 결과 에셋(이미지·영상)이 iOS 27부터 노출. CPP로 «검색 키워드마다 다른 에셋» 가능, Asset Library로 앱 버전 없이 단독 심사. 에셋이 없으면 검색 결과에 인앱 이벤트·프리뷰·스크린샷이 대신 뜬다. 애플 광고용은 «2026년 후반»(https://ads.apple.com/news). 8/5 https://developer.apple.com/news/?id=kug6m2ea · 9/9 https://developer.apple.com/news/?id=k1mtkt1k · https://developer.apple.com/app-store/asset-best-practices/ · https://developer.apple.com/videos/play/wwdc2026/205/
- **미확인**: 공식 문서는 아직 «this fall» — ASC 업로드가 열렸는지 확인 못 함. 3:2 비율은 업계 보도(템플릿으로 확인).
- **우리에게 의미**: 키워드 배정한 CPP 70개가 검색 결과의 «첫 그림»까지 바꾼다. KR 광고 탭이 설치로 안 이어지는 «페이지 문제»(내부 기록)에 직접 닿는 레버.
- **할 일**: [즉시] ASC에 Asset Library 메뉴가 있는지 기록, 애플 템플릿으로 KR/JP/EN 에셋 제작, 인앱 이벤트 카드 점검(대체 노출됨). [대표 승인] 제출.

### 2. 구글 플레이 — «획득» 지표가 «설치 버튼 클릭»으로 바뀌었다
- **무엇이 바뀌었나**: 6~7월부터 등록정보 보고의 주 지표가 획득→설치·열기 버튼 고유 클릭(클릭률 포함). 검색 결과·홈 등 노출(Reach) 지표 신설. 구 «스토어 분석» 페이지는 단계적 폐지(Grow overview로 통합), 9월 D2·3·14·28 리텐션 추가. https://google.play/business/whats-new/ · https://support.google.com/googleplay/android-developer/answer/9859173?hl=en
- **우리에게 의미**: 쓰던 «Device acquisitions»는 7월 전후가 같은 자가 아니다. 대신 국가별 «검색 결과 노출»로 «Play 미노출 = 평점 게이트» 가설을 직접 검증할 수 있다.
- **할 일**: [즉시] 측정 정의에 «7월 이후 = 클릭 기준» 명시(구 지표는 Statistics·CSV에 남음), JP·KR·US 검색 노출 추출.

### 3. 구글 플레이 — Ask Play·Gemini 추천, 키워드 맞춤 등록정보 «Gemini 원클릭»
- **무엇이 바뀌었나**: 5/19 I/O에서 대화형 «Ask Play», 검색 결과 요약, Gemini 앱의 앱 발견, Grow overview 키워드 추천을 누르면 Gemini가 그 키워드용 맞춤 등록정보를 만드는 기능 발표. https://android-developers.googleblog.com/2026/05/io-2026-whats-new-in-google-play.html
- **미확인**: 국가·언어 범위(업계는 «영어·비EEA 위주»), 우리 콘솔에 열렸는지.
- **우리에게 의미**: 영어 설명문이 AI 추천의 입력이 된다(추정). 맞춤 등록정보 50칸을 콘솔 추천 키워드로 채울 수 있다.
- **할 일**: [즉시] Grow overview에 키워드 추천·Gemini 버튼 확인. [대표 승인] en-US 설명 첫 문단을 «무엇을 보여주는 앱인지» 한 문장으로.

### 4. 구글 검색 — AI 개요·AI 모드 노출 보고서가 전 세계에 열렸다(8/31)
- **무엇이 바뀌었나**: Search Console에 생성형 AI 설정(끄면 AI 노출 0, 일반 순위와 무관)과 AI 기능 노출·페이지별 보고서. https://blog.google/products-and-platforms/products/search/new-controls-website-owners/
- **우리에게 의미**: 티커별 SEO 페이지가 AI 답변에 인용되는지 처음으로 잰다.
- **할 일**: [즉시] 설정 «켜짐» 확인, AI 노출 상위 20페이지 추출 → 그 페이지 앱 CTA에 ?from=ai.

### 5. 네이버 — 블로그 목표가 «순위»에서 «AI 브리핑 인용»으로
- **무엇이 바뀌었나**: 네이버 메이트가 «AI 브리핑 인용 횟수와 주제별 전문성, 활동성»으로 매월 약 3,000명에 월 30만~1,000만 원(8/7 https://navercorp.com/media/pressReleasesDetail?seq=10034578). AI탭 정식 6/26(https://www.navercorp.com/media/pressReleasesDetail?seq=10034429), AI 브리핑 광고 7/21(전자신문 보도). 연말 적용 40% 목표는 언론 보도(미확인).
- **미확인**: 금융·투자 질의에 AI 브리핑이 뜨는지.
- **우리에게 의미**: 인용되면 트래픽과 지원금 둘 다. 안 뜨는 질의에 쓰는 글은 헛수고.
- **할 일**: [즉시] «맥스페인»·«감마 플립»·«콜월» 등 10개 질의의 AI 브리핑 노출·인용 출처 조사 → 뜨는 질의만 «첫 문단=정답»으로 보강. [대표 승인] 메이트 신청.

### 6. 스레드 — KR·JP 토픽이 «커뮤니티»로 바뀌는 중
- **무엇이 바뀌었나**: 6/16 커뮤니티 정식, 허브, «일본·한국·대만 현지어 태그» 로컬 커뮤니티 https://about.fb.com/news/2026/06/meta-launching-new-features-500-million-monthly-threads-users/ · Meta Japan(6/17): 파란 글자가 커뮤니티, 토픽이 순차 전환 https://www.threads.com/@metajapan/post/DZtvrZdjz1I
- **미확인**: 커뮤니티 글의 비팔로워 도달 효과, KR/JP 투자 커뮤니티 존재 여부.
- **우리에게 의미**: 커뮤니티로 바뀐 태그에만 전용 피드가 있다. 스레드는 모바일 앱 중심 → «소셜 클릭 81% PC» 문제를 비껴갈 후보(폰 클릭 비율로 검증).
- **할 일**: [즉시] 쓰는 KR/JP 태그의 파란색 여부 전수 확인·교체, 링크에 ?from=threads-c-kr / threads-c-jp.

### 7. 블루스카이 — 9/23부터 새 글 언어가 «계정 기본 언어»로 초기화
- **무엇이 바뀌었나**: v1.133.0: 작성창은 기본 언어로 시작, 수동 선택은 그 작성창에서만 유지 https://github.com/bluesky-social/social-app/pull/11732 · 같은 릴리스에서 스타터팩 검색 탭 플래그 제거 https://github.com/bluesky-social/social-app/releases/tag/1.133.0 · 8/18 계정 단위 «알고리즘 추천 제외» 설정 https://github.com/bluesky-social/social-app/pull/11417
- **우리에게 의미**: 게시가 작성창 언어 선택에 의존하면 9/23 이후 JP 글이 ko/en으로 태깅돼 언어별 피드에서 조용히 빠질 수 있다.
- **할 일**: [즉시] 공개 API(로그인 불필요)로 9/23 이후 글의 langs 확인, 게시 절차에 «언어 명시 선택», 추천 제외 설정 꺼짐 확인.

### 8. MCP 도구가 «AI 비서 속 앱»이 된다 — 카카오툴즈·ChatGPT 플러그인
- **무엇이 바뀌었나**: PlayMCP 서버 15→468개·일 약 10.9만 호출, 외부 도구가 ChatGPT for Kakao의 카카오툴즈에 탑재(9/17 https://www.etnews.com/20260917000296). 공모전 본선 20개 카톡 노출 https://www.kakaocorp.com/page/detail/12059 · OpenAI Plugins Directory https://learn.chatgpt.com/docs/plugins
- **미확인**: 공모전 밖 카카오툴즈 입점 경로, 7/9 «앱→플러그인» 개명(1차 문서 403).
- **우리에게 의미**: «종목 맥스페인·감마 플립 조회» 읽기 전용 도구 하나로 카톡·ChatGPT·Claude에 노출. 중기 과제.
- **할 일**: [즉시] 설계서(무료 공개 데이터만, 앱 딥링크). [빌드 필요·대표 승인] 서버·개발자 계정.

### 9. X — 7/13부터 답글에서 «맞팔» 우선
- **무엇이 바뀌었나**: 답글 순위에 상호 팔로우 신호 추가, 소규모 계정 도달 +1.19%(Bier 공개 수치) https://techcrunch.com/2026/07/13/x-just-tweaked-its-algorithm-to-make-it-more-friendly-less-battleground/ · https://x.com/nikitabier/status/2076917480518558035
- **우리에게 의미**: 모르는 대형 계정 답글은 더 밀린다 — 기존 기록(루트 18만 미만 무의미)과 같은 방향.
- **할 일**: [즉시] X 답글 비중 축소. [대표 승인] 옵션 니치 맞팔 관계 만들기.

### 10. note — 9/8 대시보드에 «유입원»이 생겼다
- **무엇이 바뀌었나**: 인프레션·페이지뷰 분리, 글별 유입원 비율(검색엔진·note 내 등, 브라우저판) https://note.com/info/n/n39880d8a9c57 · 2/12 추천 엔진 개편(«팔로워가 적어도 좋은 글은 닿게») https://note.com/info/n/n42bd663f422a
- **우리에게 의미**: 글이 검색으로 사는지 추천으로 사는지 처음 분리된다.
- **할 일**: [즉시] 글별 유입원 스냅샷 → 검색 유입 주제를 JP CPP 키워드·Qiita/Zenn 글감으로.

### 기타·주의
- LINE VOOM 9/30 종료(https://www.lycbiz.com/jp/news/line-official-account/20260715/) → 막다른 길 목록에.
- Siri AI: 9/14 영어 베타, 일본어·한국어 10월(https://www.apple.com/newsroom/2026/09/major-updates-for-apples-software-platforms-are-now-available/). App Intents 필요 — 획득보다 유지 쪽 [빌드 필요].
- 금융앱 전술: 이번 창에서 1차 근거 있는 새 전술 없음. «AI 키워드 금융앱 다운로드 536%»는 Sensor Tower 보도자료 원문에 없음 → 미확인, 채택 금지.

### 이번 주 시험 1건 — KR «첫 화면» 교체로 광고 탭을 설치로
- **가설**: KR 광고 탭이 설치로 안 이어지는 원인은 첫 화면이다. 첫 줄을 «가치»(교리 ③: 월 $50~99급 옵션 데이터 → 무료)로 바꾸면 전환이 0에서 벗어난다.
- **실행**(빌드·추가 지출·계정 생성·약관 클릭 없음): ① [즉시] ASC Asset Library 메뉴 확인. ② [즉시] 애플 템플릿으로 KR 에셋 1장 — «미국주식 옵션 맥스페인·감마 플립, 무료» + 실제 화면 1컷(애플 가이드 «State the obvious»). ③ [대표 승인] 메뉴가 있으면 단독 심사로 KR 기본 페이지 헤더·검색 에셋과 KR 광고가 가리키는 CPP에 적용, 없으면 같은 그림을 KR CPP 첫 스크린샷으로 만들어 KR 광고 변형에 연결.
- **성공 지표**: 애플 광고 콘솔 KR 캠페인 «설치÷탭», 적용 후 7일 vs 직전 7일(예산 동일). 성공 = 탭 수 비슷한데 설치 3건 이상. 보조: ASC 앱 분석 KR 제품 페이지 전환율(iOS 27 필터 가능 시), RevenueCat KR 신규. 탭 비슷·설치 0 유지 → 페이지 가설 기각, 가격 표기·평점·언어 순으로 재지목.
- **결과**: (다음 주에 채움)

#### 적용(9/29 09:4x, 같은 날)
- 7번(블루스카이 언어) 실측: 공개 API 최근 100편 — langs 없음 92 · 영어인데 ['ko'] 7(9/9~9/21 브라우저 작성창) · ko 정상 1. → `scripts/bsky-publish.mjs` 가 createRecord 에 본문 언어(ja/ko/en)를 자동 지정(운영 코드 무수정). 과거 7편은 편집 불가·삭제 금지선이라 유지. 다음 블루스카이 글에서 공개 API 로 langs 확인.
- 1번(크리에이티브 에셋)·0-v(CPP 키워드)는 같은 레버 — ASC Asset Library 메뉴 확인부터(대표 승인 필요한 제출은 HANDOFF 로).
