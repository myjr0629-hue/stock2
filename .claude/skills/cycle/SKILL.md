---
name: cycle
description: 마케팅 사이클 1회를 규약대로 끝까지 돈다 — 슬롯 배정·발행 게이트·발행·검증·광고·기록·커밋·보고. 매시 크론이 주는 지시를 이 절차로 실행할 때 쓴다.
---
# 사이클 규약 (RUNBOOK.md 가 정본, 이 스킬은 실행 순서)

0. `CronList` — 7일 만료 임박이면 그 자리에서 재생성. ScheduleWakeup 금지.
1. **관제 콘솔 확인**: `curl -s localhost:7788/api/snapshot | node -e '...state'` → `paused`/`noPublish`/`note`(대표 지시)를 먼저 읽는다. 꺼져 있으면 `bash scripts/hud/start.sh`.
2. `node scripts/mkt-plan.js slot` — 출력이 지시다. 골라서 하지 않는다.
3. `node scripts/audit-expiration-selection.js --live` — 실패 1건이라도 있으면 발행 금지.
4. **티켓·확장 전에 내 기록 검색**: `grep -n <주제> .agent/marketing/OUTREACH-LOG.md .agent/*.md` (같은 판단을 두 번 하지 않는다).
5. 초안이 필요하면 `drafter`(sonnet) 병렬 → 내가 검수. 조작·발행·검증은 내가 한다(모델 정책).
6. 발행 즉시 `node scripts/mkt-plan.js pub <채널> <URL>` + **비로그인 공개 페이지 검증**. 검증 못 하면 «발행했다»고 쓰지 않는다.
7. 광고: 기간을 «오늘»로 고정(`/tmp/ego/ads-cycle.mjs`)해 지출·설치·CPA. **예산·입찰 증액 금지.**
8. `node scripts/hud/collect.js --clicks --redis --ads-file /tmp/ego/ads-cycle.out --gate "341건 0실패"` → 콘솔 지표 갱신.
9. `OUTREACH-LOG.md` 에 과정·결과·개선을 성공·실패 모두 기록 → `git add <경로>`(-A 금지) → 커밋 → 푸시.
10. 보고: RUNBOOK §7 네 블록(①플랫폼별 한 일 ②채널 리스트 ③성과 ④대표 몫). 대표 몫은 «1클릭»으로 쪼개 적는다.

안전선: 계정생성·비밀번호·결제정보·약관동의·보안문자 금지 · 예산 증액 금지 · 유튜브·StockTwits 금지 · AI작성 금지 서브·HN 게시 금지 · 레딧 하루 3건(UTC)·8분 간격·본문 무링크 · 한 채널 하루 1편.
