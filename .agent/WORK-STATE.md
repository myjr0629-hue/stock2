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
| 6 | 앱 업데이트 iOS 1.10.0(14)·안드 1.3.0(8) | **안드 1.3.0 Play 공개(12:0x, 공개 페이지 1.3.0·Sep 30 확인)** · iOS 심사 대기 · Play 맞춤 등록정보 10개국 131건 12:27 통과 · **둘 다 심사 제출** — iOS 11:10 WAITING_FOR_REVIEW(제출 1a1f7486 = 버전 5fd3c064 + 키워드 CPP a33b91b0, 한도 409 로 9/29 CPP 단독 제출 취소 후 합침 · 인앱 이벤트 제출 a24ef4d1 은 원래 순번) · 아카이브는 ASC API 키 인증(ios-release.sh 반영 903406561) · 스크린샷 11로케일 5장(ko 는 PPO 대조군 유지)·키워드 ko/ja/en·홍보문구 12로케일 · 안드 11:2x «Submit 15 changes»(프로덕션 8(1.3.0) 100% + 등록정보 14) · 관리형 게시 꺼짐 | 심사 추적 · 반려 즉시 대응 · 승인 뒤 위젯 이벤트(event-widget-spec)·위젯 스크린샷 |
| 7 | 홍보 사이클 | 12시 회차(12:02~12:3x) 끝 — 발행 0(오늘 캡 전부 소진) · **안드로이드 위젯 발행 준비본** `.agent/marketing/drafts/READY-android-widget-2026-10-01.md`(Play 공개 스크린샷 3언어 — 위젯 화면은 Play 에 없음·이미지 속 5종목 나스닥 ✓·위젯 «30분 갱신»·원고 EN/KO/JA/인도 레딧) · 뚫기 CPP 키워드 = WAITING_FOR_REVIEW → 심사 게이트(헛배정 해소) · 확장: 레딧 39개 서브 규칙 원문 → AI 금지 10곳 발행기 차단·인도 r/IndiaInvestments «Show II»(매달 22일, 지금 판 10/22까지) 발견 · GLOBAL-INSTALL-PLAN 원장 반영(amazon_appstore 닫음·후보 5) · 대표 할 일 ph-maker 추가·㊹ IH 근거 보강 · 광고 JP $6.63·설치 2·CPA $3.32(07:35 뒤 불변 — 일 예산 $5 초과) · 발견: Play 설명에 «widget» 단어 없음 → 스토어 담당 | 10/1 00:13 x_post(EN 위젯) → 07:13 threads(KO) → 08:13 naver_blog 첫 편(카테고리·주제 줄 확인) · UTC 10/1 레딧 인도 Show II · 05:00 KST MU 발표 직후 reddit 마지막 자리 · 20:00 KST 지식iN 재스캔 |
| 8 | 옵션 레벨 통합 | 브랜치 3 에 포함 · 감사 0 | 3 과 함께 main |
| 9 | 대표 결정 대기 | Stripe 결제 모드 확인 · PRO 체험·연간 · OI 유료 상품 · 링크드인 · 리뷰 답변 4건 · 새 채널 승인 방식 | 물을 때 보고 |
| 10 | 레벨 기준가 수리 — **운영 반영 4bf68c19f(11:2x)·운영 실측 9종목 정의 통과(AAPL 풋플로어 327.5)** | **미리보기 실측 통과(11:2x)**: AAPL 풋플로어 330→327.5(종가 329.40 기준)·5종목 정의 통과 · 브랜치 푸시(11:0x) — ① 장 마감(closed) 서버 기준가=종가(운영 AAPL 종가 329.40·풋플로어 330 으로 지도 가림 실측) ② 실시간 돌파는 가리지 않고 «하향 이탈·상향 돌파» 칩 ③ 웹훅 타입 오류 2건 · 시험 61·87·48·35·3·24 통과 | 끝 — 장중(22:30 KST~) 실시간 돌파 칩 실화면 확인 |
| 11 | 뉴스 번역 금액 자릿수 검사 | **운영 반영 cf4938d94(11:39)** — lib/ai/amountGuard(시험 14) · 종목 뉴스 출구 present()(캐시 적중 포함)·가디언 뉴스 요약 · 운영 실측: NVDA ja 제외·ko 유지 · 오탐 0(번역 149건 중 그 1건만) | UC·섹터 헤드라인·실적 브리프 출구에도 차례로 |
| 12 | 사고·교훈(11시대) | ① `vercel curl --yes` 가 작업공간을 새 Vercel 프로젝트(levels-ref)로 연결·생성 → 배포 0 확인 후 삭제, repo.json 연결로 교정 ② ASC 스크린샷 세트 10장 상한(옛6+새5) → 스크립트 수리(eb114b183, 스토어) ③ ASC 동시 심사 제출 한도 409 MAX_IN_REVIEW_SUBMISSIONS | 메모리 기록 |
| 13 | 홍보 11시 회차 | 배경 에이전트 실행 중 — 1순위 네이버 블로그 22편 «여행»→«투자» 카테고리 수리 | 결과 받으면 다음 회차 연쇄 |
| 14 | 웹→앱 설치 관문 수리 | **운영 반영 1aad788ee(11:39)** — 스마트 앱 배너·manifest 가 사람 방문자에겐 본문으로 스트리밍돼 있었다(Next 15.5) → 루트 layout <head> 정적 태그(lib/seo/smartBanner, 시험 20) · 운영 실측 /ko=SIGNUM·/en/flow/NVDA=UC·/ja/wim=WIM head · manifest head(크롬 related_applications 조건 충족) | 효과 측정: from=home 폰 클릭·스토어 «웹 유입» 전후 · 안드로이드 beforeinstallprompt 버튼 연결은 조사 결과 보고 |
| 15 | 평점 요청 확대 | **운영 반영 7a7f89280** — 하트로 내 종목 담기 3·12번째 성공에 OS 평점 시트(가이드라인 5.6.1, 앱에서만) | Play·iOS 평점 수 추적 |
| 16 | 대표 지시 11시대 «전방위·최신 기술·설치 극대화·피처링 뚫기» | 조사 전담 에이전트 실행 중(GLOBAL-INSTALL-PLAN) · 스토어 에이전트: 애플 1.10.0 피처링 추천(1순위)→Play 국가별 맞춤 등록정보→애플 추가 로케일 키워드 초안 · 홍보 11시 회차 실행 중 | 조사 결과로 실행 배정 · 광고 증액안(근거 숫자) 대표 1회 보고 |
| 17 | UC 카드 금액 10배·풋콜 방향 — **운영 반영 ba5bf0149·84327636b**, WIM 풋/콜 **55baad686** | 금액: **main ba5bf0149**(미리보기 실측: ko NVDA «330억»→«약 33억 달러», ja 3건 «101·329·151億»→«約10·33·15億ドル») · 풋콜 방향: 브랜치 fix/uc-pcr-direction fa56cff8b(AI 입력 volumePutCallRatio=1/volumePcr, UC 화면 P/C 도 환산) | 운영 실측 · **남은 것: SIGNUM 대시보드·FlowRadar «P/C» 라벨(값은 콜÷풋)·WIM «풋/콜 비율»(뒤집힌 값) 통일** — 메모리 volume-pcr-field-is-call-over-put |
| 18 | 홈 첫 CTA 스토어 배지 → 스마트링크 | **운영 반영 e6dbf0101** — 운영 실측: 배지 2개 /app?from=home_hero · 안드로이드 Play 리퍼러 utm_source=home_hero · 아이폰 App Store · PC QR | from 집계로 홈 첫 CTA 효과 측정 |
| 19 | 홍보 사이클 연쇄 | 11시 회차 끝(네이버 23편 «투자·비즈니스·경제» 이동·발행기 강제·GeekNews 새 표면·데이터셋 9/29) → 12시 회차 실행 중 | 결과 받으면 13시 회차 |
| 20 | 스토어 설치 확대(스토어 에이전트) | **Play 기본 등록정보 공개(12:0x 확인)** — en 짧은 설명 «promotion 제외» 경고 해제(가격·Free 제거)·en/ko/ja 앱 찾는 말·스크린샷 새 5장(내 종목 먼저, ja ☒ 해소) · **국가별 맞춤 등록정보 10개(US·IN·UK+IE·CA·AU+NZ·SG/MY/PH/HK·NG/ZA/KE/GH·KR·JP·BR, 100%) 131건 심사 제출 12:02** · iOS 라이브 홍보문구 비영어 9개 로케일 현지화 · 1.10.0 홍보문구 12로케일 · 피처링 추천 55c33c21(1.10 위젯, 19개국) · 다음 버전 en-GB/AU/CA 키워드 초안(NEXT-BUILD-keywords) · 기록 .agent/marketing/store-surfaces/2026-09-30-growth/RESULT.json | 맞춤 등록정보 승인 확인 → IN/KR 목록 A/B(방향 확인용) · 1.10.0 승인 뒤 위젯 인앱 이벤트(위젯 캡처 필요) · 효과 측정 10/3·10/7·10/28 |
| 20 | 조사 보고서 GLOBAL-INSTALL-PLAN-2026-09-30(37daca982) | 안드 개발자 인증: Play Console «All of your Play apps have been successfully registered» 확인(12:3x) · 구글 피처링 공식 폼 2개(Apps Innovation Corner·Featuring Nomination 10/23) · 애플 추천 55c33c21 게재기간 10/21~12/31 수정 · GEO: 구글 AI 개요(일본어)가 옛 이름으로 3위 추천 · 아마존 앱스토어(폰) 종료 | **대표 확인 대기: Apps Innovation Corner 담당자 이름·«미국 기반» 해석**(폼 채움·미제출) · 광고 증액안(JP $5→$20, 구글 앱 광고 $10×14일) · Product Hunt 계정 |
| 21 | 위젯 실캡처 | **완료(12:3x~12:4x)** — 안드로이드(에뮬레이터 -no-window + adb, ko·en·ja 원본·Play 1080×2160·크롭) · iOS(검증 시뮬레이터 simctl 스크린샷 + 디버그 시드 -SGWidgetLocale, ko·en·ja 중형·소형 크롭) → ~/Documents/signum-work/2026-09-30/widget-shots/ · ~/signum-ego-io/widget/ · Play 스크린샷 2번째 자리 반영 중(스토어) | iOS 인앱 이벤트 이미지(1.10.0 승인 뒤 제출) |
| 22 | 다음 앱 빌드 메모(iOS 1.10.1·안드 1.3.1) | 위젯 두 벌 모두 ① 맥스페인 ±20%(iOS WidgetData.swift:177·191, 안드 WidgetData.java:376) → 웹과 같은 ±35% ② 정의 검사를 실시간 가격으로 → 배치 응답 levelsRefPrice 로(웹 9/30 수리와 같은 결함 — 가격이 벽을 넘으면 지도 가림) · iOS 위젯 코드 WidgetData.swift maxPainBand = 0.2 — 웹은 9/30 LEVEL_BANDS 맥스페인 ±35%로 통일 → 다음 빌드에서 위젯도 0.35 로(안드 WidgetData.java 도 확인) · ja 이름에 «オプション» 복원안(NEXT-BUILD-keywords.json signum/ja.next_version_proposal) · en-GB·en-AU·en-CA 로케일 초안 | 1.10.0 승인 뒤 다음 버전 |
