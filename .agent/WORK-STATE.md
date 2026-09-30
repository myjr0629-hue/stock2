# 작업 상태판 (재부팅·중단 뒤 여기서 이어간다)

갱신: 2026-09-30 11:5x KST · 갱신 규칙: 상태가 바뀔 때마다 이 파일을 먼저 고친다. 저장소 사본: .agent/WORK-STATE.md

## 저장 위치 규칙 (9/30 재부팅 사고 뒤)
- /tmp·/private/tmp 는 재부팅 때 **통째로 지워진다**(9/30 09:03 실측 — 작업공간 /tmp/stock2-*, 스크래치패드, /tmp/ego 전부 소실).
- 작업공간: `~/signum-worktrees/<이름>` (node_modules 는 본 저장소 것을 심볼릭 링크).
- 산출물(패치·캡처·보고서·게시 준비본): `~/Documents/signum-work/<날짜>/`.
- 코드는 **작게 자주 커밋하고 바로 브랜치 푸시**. 커밋 안 한 변경은 재부팅 한 번에 사라진다.

## 맥 다운 원인 (9/30 08:41·09:03)
- 08:41 JetsamEvent: `reader` 6.3GB + 같은 묶음의 `VTDecoderXPCService`(영상 해독) 21.5GB = 27.8GB(8GB 맥) → WindowServer 멈춤(watchdog) → 강제 재부팅. 디스크 98% 로 스왑 공간도 없었다.
- 09:03: 시뮬레이터 화면 도구(tap) 직후 다시 다운 — 같은 원인으로 보임(보고서 없음, 미확정).
- 재발 방지: 시뮬레이터 «화면 스트리밍» 도구(attach/tap) 쓰지 않는다 · 시뮬레이터·에뮬레이터는 필요할 때만 켜고 끝나면 끈다 · 둘을 동시에 켜지 않는다 · 무거운 작업(전체 tsc·빌드)은 한 번에 하나 · 동시 에이전트 3개 이하 · 디스크 여유 20GB 이상 유지.

## 작업 줄기
| # | 무엇 | 상태 | 다음 |
|---|---|---|---|
| 1 | 내 종목 선택 바 제거 + 햅틱 | **운영 반영** 7a185fa23(08:5x) · 운영 CSS 확인 08:57 | 실기기 탭 확인 |
| 2 | 종목 뉴스: FMP 시각 +4h 수리 + 공개 RSS | **운영 반영** 13fa557b6(09:4x) — 전후 최신 기사 나이 7h16m(실제 3h16m)→34분, 원문 대조 24/24 1분 안 | Command 실화면 확인(ego 재개 뒤) · Lambda 어댑터 배포는 다음 정기 배포 |
| 3 | 출시 통합(대표 승인 8건, 9/30 07:4x «모두다 승인한다») — **운영 반영 7d7f01472(10:5x)** · Vercel success · 운영 실측: 레벨 배치 200·웹훅 무서명 400·구글봇 head(canonical·title·hreflang 4)·퍼널 비콘 204 | 브랜치 전부 원격: integ/levels-58-45 d44ddb879 · feat/app-watchlist-levels-ui 3637005f9 · feat/watchlist-widgets a15f65fdd · growth/google-head-metadata 0794b76f5 · growth/funnel-metrics fe273dfeb · growth/pricing-align 84c88925b | release/2026-09-30 통합 → 미리보기 검증 → main. **패치 C(웹 지표 잠금 해제·«2,400명» 삭제·웹 관심종목 안내) 파일 소실 → 다시 만들어 브랜치로 커밋** |
| 4 | 안드로이드 PRO 결제 | **RevenueCat 자격 «Valid credentials»(3/3 ✓, 09:5x)** — 대표가 Play 앱 권한(SIGNUM·4)·Cloud IAM(Pub/Sub Editor·Monitoring Viewer) 부여 · RTDN 주제 projects/signumhq-app/topics/Play-Store-Notifications 생성(RevenueCat) · Play 설정에 주제 입력 | **남은 것(권장)**: 주제에 google-play-developer-notifications@system.gserviceaccount.com «Pub/Sub Publisher» — 조직 정책 «도메인 제한 공유» 때문에 막힘 → 대표가 프로젝트 예외(Allow All)→추가→상속 복구 · 그 뒤 Play «Send test notification»·저장 확인 · 실결제 1건 확인 |
| 5 | 애플 App Group·위젯 App ID | **완료(10:2x)** — group.com.signumhq.app 등록 · 위젯 com.signumhq.app.SignumWidget(6GRS4L882U)·본 앱 com.signumhq.app(7Q885XY349) 둘 다 «Enabled App Groups (1)» 재확인 | 기존 프로비저닝 프로파일 무효 → 앱 업데이트 빌드 때 재생성(scripts/ios_make_profiles.py) |
| 6 | 앱 업데이트 iOS 1.10.0(14)·안드 1.3.0(8) | **둘 다 심사 제출** — iOS 11:10 WAITING_FOR_REVIEW(제출 1a1f7486 = 버전 5fd3c064 + 키워드 CPP a33b91b0, 한도 409 로 9/29 CPP 단독 제출 취소 후 합침 · 인앱 이벤트 제출 a24ef4d1 은 원래 순번) · 아카이브는 ASC API 키 인증(ios-release.sh 반영 903406561) · 스크린샷 11로케일 5장(ko 는 PPO 대조군 유지)·키워드 ko/ja/en·홍보문구 12로케일 · 안드 11:2x «Submit 15 changes»(프로덕션 8(1.3.0) 100% + 등록정보 14) · 관리형 게시 꺼짐 | 심사 추적 · 반려 즉시 대응 · 승인 뒤 위젯 이벤트(event-widget-spec)·위젯 스크린샷 |
| 7 | 홍보 사이클 | 11시 회차(10:58~11:5x) 끝 — **네이버 블로그 금융 글 23편 여행→투자·주제 비즈니스·경제 수리 ✅**(한 편 먼저 → 비로그인 검증 → 22편, 23/23·본문/등록일 변화 0) + 투자 칸 주제 없던 5편 지정 · 발행기 naver-blog-post.mjs 가 투자·비즈니스·경제 강제(못 고르면 발행 중단) · 감사 scripts/naver-blog-audit.py(9/18 이후 28편 0 이상) · 확장: naver_topic_feed 실제 개통 · geeknews_comment 첫 실행(34509#cid66633, 무링크 MU 데이터) · 홈 첫 CTA 배지 스마트링크 브랜치 fix/home-hero-smartlink 9fb6dabfb(출시 담당 검증·합치기) · 데이터셋 9/29 스냅샷 · 개선: ego-run 번호표 줄(FIFO)·광고 판독 CPA/CPM 열 정정 · reddit UTC 2/3(게이트 until 20:00Z = MU 발표 직후) · naver_kin 게이트 20:00 KST 재스캔 · 오늘 누적 31 | 10/1 08:13 naver_blog 첫 발행에서 카테고리·주제 줄 확인 · 10/3 순위·주제 피드 재측정 · 05:00 KST MU 발표 직후 reddit 마지막 자리 |
| 8 | 옵션 레벨 통합 | 브랜치 3 에 포함 · 감사 0 | 3 과 함께 main |
| 9 | 대표 결정 대기 | Stripe 결제 모드 확인 · PRO 체험·연간 · OI 유료 상품 · 링크드인 · 리뷰 답변 4건 · 새 채널 승인 방식 | 물을 때 보고 |
| 10 | 레벨 기준가 수리 — **운영 반영 4bf68c19f(11:2x)·운영 실측 9종목 정의 통과(AAPL 풋플로어 327.5)** | **미리보기 실측 통과(11:2x)**: AAPL 풋플로어 330→327.5(종가 329.40 기준)·5종목 정의 통과 · 브랜치 푸시(11:0x) — ① 장 마감(closed) 서버 기준가=종가(운영 AAPL 종가 329.40·풋플로어 330 으로 지도 가림 실측) ② 실시간 돌파는 가리지 않고 «하향 이탈·상향 돌파» 칩 ③ 웹훅 타입 오류 2건 · 시험 61·87·48·35·3·24 통과 | 끝 — 장중(22:30 KST~) 실시간 돌파 칩 실화면 확인 |
| 11 | 뉴스 번역 금액 자릿수 검사 | **운영 반영 cf4938d94(11:39)** — lib/ai/amountGuard(시험 14) · 종목 뉴스 출구 present()(캐시 적중 포함)·가디언 뉴스 요약 · 운영 실측: NVDA ja 제외·ko 유지 · 오탐 0(번역 149건 중 그 1건만) | UC·섹터 헤드라인·실적 브리프 출구에도 차례로 |
| 12 | 사고·교훈(11시대) | ① `vercel curl --yes` 가 작업공간을 새 Vercel 프로젝트(levels-ref)로 연결·생성 → 배포 0 확인 후 삭제, repo.json 연결로 교정 ② ASC 스크린샷 세트 10장 상한(옛6+새5) → 스크립트 수리(eb114b183, 스토어) ③ ASC 동시 심사 제출 한도 409 MAX_IN_REVIEW_SUBMISSIONS | 메모리 기록 |
| 13 | 홍보 11시 회차 | 배경 에이전트 실행 중 — 1순위 네이버 블로그 22편 «여행»→«투자» 카테고리 수리 | 결과 받으면 다음 회차 연쇄 |
| 14 | 웹→앱 설치 관문 수리 | **운영 반영 1aad788ee(11:39)** — 스마트 앱 배너·manifest 가 사람 방문자에겐 본문으로 스트리밍돼 있었다(Next 15.5) → 루트 layout <head> 정적 태그(lib/seo/smartBanner, 시험 20) · 운영 실측 /ko=SIGNUM·/en/flow/NVDA=UC·/ja/wim=WIM head · manifest head(크롬 related_applications 조건 충족) | 효과 측정: from=home 폰 클릭·스토어 «웹 유입» 전후 · 안드로이드 beforeinstallprompt 버튼 연결은 조사 결과 보고 |
| 15 | 평점 요청 확대 | **운영 반영 7a7f89280** — 하트로 내 종목 담기 3·12번째 성공에 OS 평점 시트(가이드라인 5.6.1, 앱에서만) | Play·iOS 평점 수 추적 |
| 16 | 대표 지시 11시대 «전방위·최신 기술·설치 극대화·피처링 뚫기» | 조사 전담 에이전트 실행 중(GLOBAL-INSTALL-PLAN) · 스토어 에이전트: 애플 1.10.0 피처링 추천(1순위)→Play 국가별 맞춤 등록정보→애플 추가 로케일 키워드 초안 · 홍보 11시 회차 실행 중 | 조사 결과로 실행 배정 · 광고 증액안(근거 숫자) 대표 1회 보고 |
