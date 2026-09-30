# 작업 상태판 (재부팅·중단 뒤 여기서 이어간다)

갱신: 2026-09-30 09:2x KST · 갱신 규칙: 상태가 바뀔 때마다 이 파일을 먼저 고친다. 저장소 사본: .agent/WORK-STATE.md

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
| 2 | 종목 뉴스: FMP 시각 +4h 수리 + 공개 RSS | 브랜치 `fix/ticker-news-rss` 40765e4b8(원격) — 코드·시험 완료 | 미리보기 검증(10종목 표시시각=원문, 최신 vs 야후 RSS) → main |
| 3 | 출시 통합(대표 승인 8건, 9/30 07:4x «모두다 승인한다») | 브랜치 전부 원격: integ/levels-58-45 d44ddb879 · feat/app-watchlist-levels-ui 3637005f9 · feat/watchlist-widgets a15f65fdd · growth/google-head-metadata 0794b76f5 · growth/funnel-metrics fe273dfeb · growth/pricing-align 84c88925b | release/2026-09-30 통합 → 미리보기 검증 → main. **패치 C(웹 지표 잠금 해제·«2,400명» 삭제·웹 관심종목 안내) 파일 소실 → 다시 만들어 브랜치로 커밋** |
| 4 | 안드로이드 PRO 결제(RevenueCat Play 자격 3개 실패) | 대표 로그인 완료(08:5x) · 진행 중 중단 | ②계정 권한 ③설명 한 글자 ④Check again ⑤Connect · ①Cloud API 사용 설정은 대표(비밀번호) |
| 5 | 애플 App Group·위젯 App ID | 미착수 | developer.apple.com — 로그인 필요 시 대표 |
| 6 | 앱 업데이트 iOS 1.10.0(14)·안드 1.3.0(8) | 위젯 완성·검증(브랜치 3), 스토어 자료 `mkt/store-surfaces` release-1.10.0(PLAN·bundle json) | 5 + 3 뒤 제출 |
| 7 | 홍보 사이클 | 07시 회차까지 23편 · 08시 회차 중단(지식iN 대화상자·티스토리 준비본 소실) · 크론 재생성 필요 | 크론 + 연쇄 재개 |
| 8 | 옵션 레벨 통합 | 브랜치 3 에 포함 · 감사 0 | 3 과 함께 main |
| 9 | 대표 결정 대기 | Stripe 결제 모드 확인 · PRO 체험·연간 · OI 유료 상품 · 링크드인 · 리뷰 답변 4건 · 새 채널 승인 방식 | 물을 때 보고 |
