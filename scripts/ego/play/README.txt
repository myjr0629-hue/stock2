Play 콘솔 ego 스크립트 (2026-09-30 스토어 설치 확대에서 검증) — 실행: bash scripts/ego-run.sh <스크립트> <제한초>
입력은 전부 ~/signum-ego-io/store/*-cfg.json 파일로 넘긴다(환경변수는 ego 안 스크립트에 전달되지 않는다 — 9/30 DRY=1 이 무시돼 실제 제출된 사고).
- csl-create.mjs            맞춤 등록정보 생성(기본 복제 → 참조 이름·100%(확인 모달 Yes)·국가 → 대상 언어 문구) · cfg m33-cfg.json {idx} + csl-plan.json
- listing-review-save.mjs   (기본/맞춤) Review 단계 «Don't label assets» → Save. 저장 직후 첫 Next 는 안 넘어가는 일이 있어 최대 4번 · cfg m35-cfg.json {url}
- csl-edit-lang-text.mjs    저장된 맞춤 등록정보 한 언어의 짧은 설명 교체 + 전체 설명 맨 앞 한 줄 · 1단계(Details)로 열리니 Next 로 Assets · cfg m61-cfg.json
- default-listing-text.mjs  기본 등록정보 여러 언어 짧은 설명·첫 줄 + 검토 저장 · widget-geo-plan.json
- listing-shots-order.mjs   폰 스크린샷 순서 재구성: 1번만 남기고 제거 → 라이브러리에서 한 장씩 Add(뒤에 붙음). 0장이 되면 «기본 언어 그래픽 상속» 모드라 Add 가 안 먹는다 · 패널은 언어마다 새로 연다 · cfg m65-cfg.json
- publishing-submit-guarded.mjs  진행 중 심사가 없고 목록이 예상 종류뿐일 때만 Submit(«restart your review» 창은 Cancel)
- publishing-watch-submit-csl.mjs 감시 1회(심사 끝나면 맞춤 등록정보만 있는 대기분 제출)
- publishing-status.mjs     게시 개요 상태 한 줄(PLAY {inReview, quick, rejected, last, pending})
함정: Play 는 «Send for review» 한 번에 대기 중인 모든 변경을 보낸다 · 심사 중에 보내면 진행 중 심사가 취소·재시작된다.
