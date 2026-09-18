# 하네스 엔지니어링 계획 — SIGNUM (2026-09-18)

> 원칙(대표 지시): **Opus 주력**, Sonnet·Fable 은 필요할 때, Haiku 는 특수 경우. 목적은 «싼 모델»이 아니라 **작업에 맞는 최적 모델** — 상위 모델이 필요 없는 일에 상위 모델을 쓰지 않는다. 동시에 여러 모델을 병렬로 돌린다. 고도화·기능 향상·기억 향상·비용 최적화가 동시에 이뤄져야 하며, Ruflo·ECC 에서 차용할 것은 차용한다.
> 근거 실측(2026-09-18): 같은 작업에서 모델별 비용 Haiku $0.10 / Sonnet $0.24 / Fable $0.99(새 세션), 정확도 Haiku 2/3·0/3 / Sonnet 3/3 / Fable 3/3, 서브에이전트 스폰 고정비 5.3만~7.2만 토큰, 워크플로 3모델 동시 실행 22.5초, http 훅 제어(일시정지) 실증, 텔레메트리 모델별 비용 실측 가능.

## 0. 지금 상태(before, 실측)
- 하네스: Claude Code(도구·권한·훅·서브에이전트·크론·메모리) 위에서 돌지만 **설계해 쓰지 않음** — CLAUDE.md 7월판 5.9KB, 스킬 6, 훅 0, 전용 에이전트 0, 텔레메트리 0, Workflow 0.
- 비용 구조: 세션 전사 534MB, 도구 결과 202MB(최대 덩어리), 시간당 도구 결과 90~225KB 가 컨텍스트로 회귀. 임시 브라우저 스크립트 265개/일(결과 보존 10%), 재시도 접두사 9종/일.
- 모델: 한 모델(현재 Fable)이 집계·초안·조작·판단·보고를 전부 수행.
- 기억: 메모리 파일 318 + 색인 140줄 상한 + 132개 .agent 문서 + 994줄 ENGINE. «내 기록을 잊는» 사고 반복(t191).
- 가시성: 채팅뿐. 제어: 채팅뿐.

## 1. 목표 구조(after)
```
헌법 CLAUDE.md + .claude/rules/        ← 대표 지시(육성)·작업 규약·모델 정책·금지·파일 지도
스킬 .claude/skills/  /cycle /change /report /measure /memory-hygiene
에이전트 .claude/agents/  reader(sonnet) drafter(sonnet) reviewer×3(sonnet, 렌즈별) judge(opus) analyst(fable) classifier(haiku·특수)
워크플로 Workflow 스크립트  마케팅 초안 병렬·검증 팬아웃·앱 리뷰 팬아웃 (에이전트마다 model/effort)
훅 .claude/settings.json  가드 2(git add -A·--force 차단) + 관제/제어 http 훅 + SessionStart(STATE 주입) + PreCompact(작업 스냅샷)
기억 STATE.md(지금 어디) · LEDGER.json(발행·배포·결정·측정) · memory/(왜·어떻게) · 주간 위생
관제/제어 앱 로컬 Node(SSE) — 상태판·실시간 이벤트·토큰/비용(OTel)·워크플로·스위치(일시정지·발행금지·예산·모델정책·사이클 지시)
텔레메트리 CLAUDE_CODE_ENABLE_TELEMETRY=1 → 로컬 수집 → 모델별 토큰·비용/시간·사이클
```

## 2. 모델 정책표(주력 Opus)
| 도메인 | 작업 | 모델 | 이유(실측) |
|---|---|---|---|
| 공통 | 집계·게이트·원장·검사(mkt-plan, mkt-clicks, audit-*) | **모델 없음(스크립트)** | 0 토큰, 결정적 |
| 공통 | 세션 주력(사이클 운영·판단·수정·검증·보고) | **Opus 5** | 주력 |
| 공통 | 최고난도 분석(원인·아키텍처·전후 실측 보고·감사) | Fable 5.1(서브에이전트 또는 세션 전환) | 3/3 정확·가장 빠름(20.4s) |
| 앱 관리 | 코드 읽기·추출·의존성 지도(병렬) | Sonnet 5 ×N | 워크플로에서 3/3 정확, 본 세션 컨텍스트 보호 |
| 앱 관리 | 리뷰 팬아웃(정확성·보안·성능 렌즈) | Sonnet ×3 → Opus 판정 | ECC reviewer 규칙 텍스트 차용 |
| 앱 관리 | 구현·배포·실화면 검증 | Opus | 재시도 비용이 모델 절감보다 큼 |
| 마케팅 | 브라우저 조작·발행·공개 페이지 검증 | Opus | 화면 판단·재시도 |
| 마케팅 | 초안(일/한/영 글·답글) | Sonnet 병렬 → Opus 검수 | 정확·비용 1/4 |
| 마케팅 | 대량 분류(예: 지식iN 질문 수백 건 선별, 로그 라벨) | **Haiku(특수)** + Opus 표본 검증 10% | 2/3 정확 실측 → 단독 사용 금지 |
| 위임 규칙 | 도구 호출 1~3회짜리 짧은 일은 위임 금지(스폰 고정비 5~7만 토큰) · 큰 출력물을 만드는 일은 반드시 위임(본 세션 보호) | | |

## 3. 차용 목록
| 출처 | 차용(무엇을) | 어떻게(우리 식) |
|---|---|---|
| Ruflo | 결정 궤적(trajectory) 기록 | LEDGER.json 에 결정·발행·배포·측정 이벤트 |
| Ruflo | 라우터 | 위 «모델 정책표»를 에이전트 정의·스킬에 고정(권고가 아니라 실행) |
| Ruflo | 백그라운드 워커(map/audit/consolidate) | 크론 3종: 마케팅(매시)·기억 정리(야간)·설정 GC(주간) — 세션 크론으로 |
| Ruflo | CAPABILITIES.md | `.agent/HARNESS.md`(하네스가 할 수 있는 것·스위치 목록) |
| ECC(런타임 X, 텍스트·설계만) | rules/common: coding-style·testing·security·git-workflow | CLAUDE.md/rules 에 10~20줄 |
| ECC | agents: code-reviewer·typescript-reviewer·react-reviewer·security-reviewer·planner | 우리 에이전트 정의 + 모델 정책 |
| ECC | skills: browser-qa·canary-watch | /change 의 «배포 후 실화면·엔드포인트 감시» 단계 |
| ECC | skills: context-budget·config-gc | 월 1회 컨텍스트 감사·주 1회 설정 GC 스킬 |
| ECC | hooks/memory-persistence 계약(SessionStart 로드·PreCompact 저장·SessionEnd 요약) | 우리 훅 3개로 구현(STATE 주입·작업 스냅샷·요약) |
| ECC | continuous-learning 개념(관찰→교훈 승격) | 사이클 끝 «교훈 승격» 단계(feedback 메모리 자동 초안) |
| ECC | content-engine·crosspost·brand-voice | ENGINE 의 채널별 톤·재가공 규칙으로 흡수 |
| ECC | agentic-engineering(eval-first·분해·라우팅) | /change 스킬의 골격 |
| Claude Code 내장 | Agent/Workflow(model·effort)·훅 30여 종(http)·OTel·rules·plugins·skill-creator·Artifact·Cron/Monitor | 전부 그대로 사용(외부 API 불필요) |
| 버림 | Ruflo 런타임(권고형 라우터·MCP 300+·전역 설정·ruv.io 통신), ECC 런타임 훅(매 호출 스폰·Stop 마다 tsc) | — |

## 4. 기억 고도화
1. `STATE.md` 하나 = «지금 어디»(라이브 상태·진행 중·대표 결정 대기) — SessionStart 훅이 2KB 요약을 매 세션 주입.
2. `PreCompact` 훅 — 압축 직전 «하던 일·다음 단계·열린 파일» 스냅샷 → `SessionStart(compact)` 재주입(ECC 계약 차용).
3. `LEDGER.json` — 발행·배포·결정·측정을 기계가 읽는 형식으로; `scripts/mem.js grep` 으로 티켓 전 «내 기록 검색» 강제(/cycle 단계).
4. 메모리 위생 — 색인 140줄·17KB 상한 자동 검사, 보관함 자동 이동(주간 크론).
5. 교훈 승격 — 사이클/변경 끝에 «오늘의 교훈» 1줄을 feedback 메모리 초안으로.

## 5. 관제 + 제어 앱(로컬, 의존성 0)
- 입력: 훅(http: PostToolUse·Stop·SubagentStart/Stop·TaskCompleted·Notification·SessionStart) · OTel(OTLP http) · LEDGER/STATE 파일.
- 화면: 상태판(사이클·채널·티켓·배포) · 실시간 이벤트 · 토큰/비용(모델·시간·사이클) · 워크플로(에이전트·모델·진행) · Redis/광고/클릭 지표.
- 제어: 일시정지/재개(PreToolUse 거부, 실증) · 발행 금지 스위치 · 예산 상한(비용 초과 시 거부) · 모델 정책 편집(에이전트 정의 파일) · 사이클 지시 입력(UserPromptSubmit 주입) · 티켓 승인.

## 6. 실행 순서·측정
| 단계 | 산출물 | 측정 |
|---|---|---|
| 0(즉시) | 텔레메트리 ON, 기준선 기록(턴/사이클·도구 KB·모델별 비용) | 기준선 |
| 1(반나절) | 헌법·rules·에이전트 7종·스킬 5종 | 스킬 eval(skill-creator) |
| 2(반나절) | 훅(가드 2·관제/제어·STATE·PreCompact)·관제/제어 앱·OTel 수집 | 훅 지연·이벤트 수 |
| 3(반나절) | STATE/LEDGER/mem·위생 크론 | 색인 크기·«내 기록 검색» 실행률 |
| 4(사이클마다) | 브라우저 스크립트 라이브러리화(265/일 → 검증본) · 마케팅 초안 병렬 워크플로 | 재시도 수·사이클 시간 |
| 5(1주 후) | 전후 실측 보고 | 사이클당 토큰·비용·턴·재시도·모델 혼합비 |
안전: 프로젝트 스코프(`.claude/`)만, 격리 디렉터리에서 먼저 시험(오늘 방식), 되돌림 목록 유지. 전역 `~/.claude` 무변경.
