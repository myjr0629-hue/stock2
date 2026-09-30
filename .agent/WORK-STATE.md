# 작업 상태판 (재부팅·중단 뒤 여기서 이어간다)

갱신: 2026-09-30 09:2x KST(4번 09:3x 갱신) · 갱신 규칙: 상태가 바뀔 때마다 이 파일을 먼저 고친다. 저장소 사본: .agent/WORK-STATE.md

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
| 3 | 출시 통합(대표 승인 8건, 9/30 07:4x «모두다 승인한다») — 09:3x 재개(~/signum-worktrees/release), 패치 C 는 growth/web-gates-off 로 재작성 중 | 브랜치 전부 원격: integ/levels-58-45 d44ddb879 · feat/app-watchlist-levels-ui 3637005f9 · feat/watchlist-widgets a15f65fdd · growth/google-head-metadata 0794b76f5 · growth/funnel-metrics fe273dfeb · growth/pricing-align 84c88925b | release/2026-09-30 통합 → 미리보기 검증 → main. **패치 C(웹 지표 잠금 해제·«2,400명» 삭제·웹 관심종목 안내) 파일 소실 → 다시 만들어 브랜치로 커밋** |
| 4 | 안드로이드 PRO 결제 | **RevenueCat 자격 «Valid credentials»(3/3 ✓, 09:5x)** — 대표가 Play 앱 권한(SIGNUM·4)·Cloud IAM(Pub/Sub Editor·Monitoring Viewer) 부여 · RTDN 주제 projects/signumhq-app/topics/Play-Store-Notifications 생성(RevenueCat) · Play 설정에 주제 입력 | **남은 것(권장)**: 주제에 google-play-developer-notifications@system.gserviceaccount.com «Pub/Sub Publisher» — 조직 정책 «도메인 제한 공유» 때문에 막힘 → 대표가 프로젝트 예외(Allow All)→추가→상속 복구 · 그 뒤 Play «Send test notification»·저장 확인 · 실결제 1건 확인 |
| 5 | 애플 App Group·위젯 App ID | 미착수 | developer.apple.com — 로그인 필요 시 대표 |
| 6 | 앱 업데이트 iOS 1.10.0(14)·안드 1.3.0(8) | 위젯 완성·검증(브랜치 3), 스토어 자료 `mkt/store-surfaces` release-1.10.0(PLAN·bundle json) | 5 + 3 뒤 제출 |
| 7 | 홍보 사이클 | 10시 회차(10:08~10:5x) 끝 — 오늘(KST 9/30) 누적 30편 · reddit UTC 2/3(05:00 KST MU 발표 직후 1자리 남김) · naver_blog 3/3·naver_kin 2/12 · 리뷰 답변 4건 PENDING_PUBLISH · ⚠ WSB 주간 실적 스레드 재댓글(발행기에 같은 스레드 거부 추가) · ★ 네이버 블로그 금융 글 22편 «여행» 카테고리 발견 | 11시 회차: HANDOFF §4 0-za(블로그 카테고리 «투자»·주제 «비즈니스·경제» 수리) 1순위 |
| 8 | 옵션 레벨 통합 | 브랜치 3 에 포함 · 감사 0 | 3 과 함께 main |
| 9 | 대표 결정 대기 | Stripe 결제 모드 확인 · PRO 체험·연간 · OI 유료 상품 · 링크드인 · 리뷰 답변 4건 · 새 채널 승인 방식 | 물을 때 보고 |
