# 관제 v2 운영 확인

변경 범위는 `scripts/hud/`다. 기존 스냅샷 필드는 보존하고 `/api/snapshot`에 `v2`를 추가했다. 판독기·갱신 시각표·launchd 경로는 기존 그대로 사용한다.

## 화면

기본 주소는 `http://127.0.0.1:7788`이다.

| 메뉴 | 주소 해시 |
|---|---|
| 한눈에 | `#dashboard` |
| 에이전트·버전 | `#agents` |
| 하네스 구조도 | `#harness` |
| 크레딧 | `#credits` |
| 게시 | `#publications` |
| 대표님 할 일 | `#todos` |
| 메일 보고 | `#mail` |
| 앱 상태·무결성 | `#integrity` |
| 플랫폼 | `#platforms` |

한눈에는 4개 주요 지표 카드에 설치(아이폰·안드로이드·목표·어제·7일 평균), 리딤, 가입자, 유료 구독자를 묶었다. 설치는 세계표준시 하루, 게시·작업은 한국 하루다. 7일 설치 평균은 직전 완결 7일이 모두 있을 때만 계산한다. 신규 체험을 확정 리딤 사용 수로 대신하지 않는다.

## 새 로더와 피드 계약

`sources.js`가 `v2-sources.js`의 로더를 내보낸다. 모든 로더는 경로·현재 시각을 시험에서 주입할 수 있다. 숫자 누락은 `null`, 원천 없음·깨짐은 해당 항목의 `pending`이다. 명령은 읽기 전용 프로세스·버전·상주 작업·깃 이력 조회만 사용한다.

| 로더 | 원천·역할 |
|---|---|
| `loadAgents` | 코덱스 버전, 이고 버전, 세션·하위 실행 모델, 실행·대기 폴더, 프로세스, 상주 작업 |
| `loadCredits` | `~/Documents/signum-work/hud/feeds/credits.json` |
| `loadPublishing` | 운영 체크아웃의 게시 원장, 한국 날짜별 14일·4지역, 참여 기록 경로 |
| `loadTodos` | 대표 할 일 최신판, 날짜 정렬·완료 제외 |
| `loadMail` | `~/Documents/signum-work/hud/feeds/mail.json` |
| `loadIntegrityV2` | 최신 무결성·이력, 운영 기준 브랜치 7일 병합, 관문 결과 첫 줄 |
| `loadPlatforms` | 플랫폼 전수 대장과 채널 목록, 6지역·상태·마지막 게시 |
| `loadWork` | 대기열 로그의 실제 완료 행, 오늘 관문·병합·게시·플랫폼 수 |
| `loadPerformance` | 기존 설치 판독 + 아래 선택 성과 피드 |
| `loadHarness` | 위 증거를 25노드·28연결로 정규화, 상태·마지막 동작을 인라인 그림으로 표시 |

크레딧 피드는 `readAt`(또는 `updatedAt`), `claude.weeklyPct`(또는 `weeklyAllModelsPct`), `fiveHourPct`, `resetsAt`(또는 `weeklyResetsAt`), `extraSpentUsd`/`extraLimitUsd`(또는 `extraUsage.spentUSD`/`limitUSD`), `codex.weeklyTokens`, `weeklyTasks`, 선택 `weeklyPct`, `daily:[{date,tokens}]`(또는 `byDay`)를 읽는다. 수치는 JSON 숫자로 기록한다. 코덱스 비율이 없으면 진행 링은 판독 대기다.

메일 피드는 `readAt`(또는 `updatedAt`)와 `items:[{date,from,subject,summary,action,kind}]`를 읽는다. 메일 계정에는 직접 접근하지 않는다.

기존 원천에 없는 확정 성과는 `~/Documents/signum-work/hud/feeds/performance.json`을 선택적으로 읽는다. 필드는 `readAt`, `registrations:{total,week}`, `paid:{active,trials,conversion}`, `redeem:{today,week,remaining}`이다. 없는 묶음은 기존 `live.rcOverview`·`live.redeemSummary`로 보충한다. 신규 고객은 가입 계정 수·7일 누적으로 바꾸지 않는다. 개요에 관측된 `period`가 있으면 그대로 표시하고, 28일 원천일 때만 ‘신규 고객(28일)’로 표시한다. 기간 미관측·체험 전환·오늘 실제 리딤 사용은 판독 대기다. 리딤의 수동 확인 누적·오늘 배포·남은 배포 재고를 구분한다. 이 작업은 운영 피드를 작성하지 않는다.

한눈에 하단의 ‘운영 조작’은 기존 `/api/control`의 `paused`·`noPublish`·`note` 계약을 사용한다. 조작은 버튼을 눌렀을 때만 전송한다. 크레딧 메뉴에 기존 광고 국가별 세 기간 상세와 앱 인공지능 비용 상세를 표시한다.

하네스는 25개 노드와 전체 화살표를 한 SVG에 배치하고, 640px 이하에서는 세로 SVG로 전환한다. 노드 하나의 대기·지연으로 전체를 실패로 판정하지 않는다. 병합·배포 노드의 시각은 마지막 병합이며 배포 성공은 별도 증거가 필요하다.

활동 시각 원천은 `v2-activity.js`에 모았다. 대표 파일 수정 시각, 세션의 마지막 Agent 호출(전체 기록을 청크 판독하고 이후 추가분만 판독), 이고 작업 파일 수정 시각, 메일 `updatedAt`, 모델이 명시된 `LEDGER.tsv` 마지막 행, 예약 게시 로그 마지막 줄, 대기열·밤 검토 로그, 상주 작업 종료 상태와 로그 수정 시각을 읽는다. 본문·명령·코드 값은 응답에 싣지 않는다. 실행 프로세스가 있는 이고는 정상이다.

공개 게시 주소만 표시하며 인증 주소·민감 인자를 제외한다. 프로그램은 `.env*`를 읽지 않는다.

## 검증

```sh
/usr/bin/lockf -k /tmp/signum-heavy.lock node scripts/hud/verify-v2.js
```

`verify.js`도 같은 통합 검사로 진입한다. 단위 입력은 임시 파일이며, 서버는 임시 홈·저장소에서 자동 수집기를 끄고 기동한다. 운영 서버·외부 서비스에 쓰지 않는다. 포트 바인드가 차단된 환경에서는 동일 HTTP 처리기를 별도 자식 프로세스의 IPC로 호출하고 그 한계를 출력한다. 화면 검사는 VM의 DOM 대역을 사용하며 실제 배치·픽셀을 검증하지 않는다.

2차 회귀 시험 `verify-v2-round2.js`는 A~H 12건, 큰 세션의 Agent 시각 누락 1건, 손상된 과거 차트 격리 1건을 먼저 실패시킨 뒤 수정했다. 최종 결과는 회귀 14건·KPI 10건·통합 73건·기존 판독기 56건·하네스 9건·광고 9건 모두 통과다. 통합의 73건에는 기존 판독기·하네스 묶음의 통과 여부가 각각 한 건으로 포함된다. JS/MJS 19개 문법 검사와 `git diff --check`도 통과했다. 각 묶음은 `/usr/bin/lockf -k /tmp/signum-heavy.lock` 안에서 순차 실행했다.

HTTP 처리기는 포트 바인드 차단으로 임시 서버의 IPC로 검사했다. `/api/snapshot`·화면·SVG 모듈·비용 모듈의 200 응답과 VM 렌더를 확인했다. 실제 소켓과 1280·390 화면 배치는 운영 세션에서 확인해야 한다. 실제 로컬 판독에서는 최근 14일 설치 원천이 모두 존재했다. 현재 개요 JSON에 기간이 없고 리딤 집계 파일도 없어 해당 값은 판독 대기이며, 다음 운영 판독 전에는 확정할 수 없다.

공유 함수 영향과 시험:

| 함수 | 확인한 호출자 | 영향·검증 |
|---|---|---|
| `loadInstalls` | 서버, 기존 `verify.js`, 2차 회귀 시험 | 기존 `days`·`week` 보존, 최신 판독별 `historyDays` 추가. 과거 파일 합산·중복 날짜 우선순위·시험 고객 제외를 검사 |
| `loadRcOverview` | 서버, KPI·2차 회귀 시험 | 기존 필드 유지, 관측 기간 `period` 추가. 기간 유무·0·null·지연을 검사 |
| `readOverviewDocument` | RC 판독기의 페이지 평가, KPI DOM 대역 시험 | 기간 필드만 추가. 기존 카드·공간 제어·갱신 저장 시험 유지 |
| `loadAgents`·`loadPerformance`·`loadIntegrityV2` | `loadV2`, 기존 v2 시험, 2차 회귀 시험 | 활동 원천·KPI 보충·마지막 병합 필드 추가. 잘못된 원천은 항목별 격리 |
| `loadHarness`·`renderHarness` | `loadV2`, 화면, 하네스·v2·2차 시험 | 노드·연결 계약 유지, 전체 SVG와 모바일 SVG로 변경. 주입 방어·대기/실패 분리 검사 |

`collect.js`와 `refresh.js`의 다른 공유 함수 호출도 검색했다. 이번에 수정한 설치·개요 로더의 운영 호출자는 서버뿐이며 수집·시각표 함수는 변경하지 않았다. 전체 앱 빌드 대신 이 독립 Node 도구의 JS/MJS 문법과 오프라인 회귀를 검사한다.

## 운영 세션의 실제 응답·촬영 확인

이미 7788 서버가 실행 중이면 해당 서버를 운영 세션의 절차에 따라 갱신한다. 별도 확인 서버는 비어 있는 포트에서 자동 수집기를 끄고 실행할 수 있다.

```sh
HUD_PORT=17788 HUD_NO_COLLECT=1 node scripts/hud/server.js
curl --fail --silent http://127.0.0.1:17788/api/snapshot | node -e 'let b="";process.stdin.on("data",c=>b+=c);process.stdin.on("end",()=>{const s=JSON.parse(b);console.log("v2 필드:",Object.keys(s.v2).join(","))})'
```

운영 세션이 위 화면 주소를 열고 브라우저 개발자 도구의 반응형 모드에서 너비 **1280**과 **390**으로 설정한다. 9개 해시마다 전체 페이지를 촬영하고, 게시·할 일은 항목 하나를 펼친 상태도 찍는다. 확인할 것은 카드 겹침, 글자 잘림, 가로 넘침, 차트 범례, 하네스 상태 점과 마지막 시각, 빈 값의 판독 대기다. 이 작업 세션은 브라우저 접근 금지 지시를 따라 화면을 열거나 촬영하지 않았다.

대표 지시 11·12의 전 플랫폼 대응과 크레딧 최적화는 이 화면에서 플랫폼 전수 상태 및 실행 역할·사용량을 관찰할 수 있도록 반영했다. 게시·계정·구독·배포 등 실제 운영 변경은 수행하지 않는다.

## 3차 마무리 — 2026-10-17

A. 과거 `rc.log`의 잘린 JSON을 복구하는 `parseRcLine()`에서 날짜 배열 파싱이 예외를 던지면 `loadInstalls()` 밖으로 전파되어 서버의 실측 묶음 전체가 사라졌다. 이제 파일 전체를 하나의 격리 단위로 삼아 손상 파일만 건너뛴다. 정상 판독 중 가장 최신값 및 날짜별 최신값 우선 규칙은 보존한다. 구글 광고는 기존 `live.google.read`의 지출·설치·설치당 비용을 크레딧 표에 복원했다. 누락은 판독 대기, 원천 날짜와 읽은 시각 및 6시간 초과 지연을 표시한다.

AI 모드는 `ai-credit.js` → 원천 `src/lib/ai/creditPacing.ts`의 `PacingMode` 및 실제 분기를 읽어 전수 확인했다. `src/`는 수정하지 않았다.

| 원천 모드 | 표시 |
|---|---|
| bootstrap | 초기 가동 |
| measuring | 속도 측정 중 |
| on-pace | 목표 속도 유지 |
| raising | 신선도 단계 올림 |
| lowering | 신선도 단계 내림 |
| endgame | 기간 말 속도 조절 |
| landing | 남은 예산 보호 · 증가분 정지 |
| done | 목표 도달 · 증가분 정지 |
| credit-off | 크레딧 불가 · 증가분 정지 |

B. `refresh.js auto`의 기존 호출마다 로컬 `redeem-summary.js`를 한 번 실행한다. 이 집계기는 두 장부의 `--count`만 호출한다. 기존 RC·광고·애플 시각표와 재시도 조건은 그대로다. 리딤 작업은 별도 잠금·상태와 35초 제한을 사용하고 자식 출력은 버린다. 실패해도 기존 세 판독은 계속한다. 자동 회차의 종료 코드는 실패를 반영한다. `run all` 등 수동 판독 경로는 기존 계약을 유지한다. launchd 등록·운영 집계 실행은 이 작업에서 수행하지 않았다.

리딤 카드에는 기존 장부·댓글 확인 수와 별도로 `live.asc.offerStarts`·`offerStarts30`을 «오퍼 코드 사용 시작»으로 표시한다. «애플 집계 · 집계일», 세계표준시, 30일 기간, 읽은 시각과 지연 여부를 함께 표시한다. 장부 확인과 애플 집계를 합산하지 않는다. 로컬 기존 파일 읽기 확인: 아이폰 배포 385·댓글 확인 8·남은 615, 안드로이드 남은 56. 애플은 집계일 2026-10-15의 사용 시작 6·최근 30일 30이다.

C. 1280 폭에서는 한 장의 가로 흐름 SVG, 640 이하에서는 여섯 묶음의 세로 SVG를 표시한다. 두 SVG 중 하나만 표시하며 노드 25개·연결 28개를 각각 보존한다. 대표→코디네이터에서 클로드 작업과 코덱스 대기열→쓰기→읽기→관문→병합·배포로 분기한다. 아래에는 모델 없는 게시기와 5개 채널, 감시 3종, 밤 검토와 결과 보관처를 연결한다. 화살표 끝 표시, 기록 연결의 점선, 기존 노드 상태·시각을 유지하고 `v2.work`의 한국 날짜 처리·통과·보류 수를 배지에 연결한다. 미측정 수는 판독 대기다. 기존 API 필드는 삭제하지 않았으며 `v2.harness.today`만 추가했다.

### 공유 함수 호출자와 영향

- `sources.loadInstalls`: `server.js`의 실측 묶음, `verify.js`, 2차·3차 회귀 시험에서 호출한다. 파일별 예외 격리만 추가하여 손상 과거 파일 때문에 구글 광고·애플 분석·리딤까지 사라지는 전파를 막는다. 파싱 공유 함수 자체는 변경하지 않았다.
- `refresh.auto`·`runJob`: 기존 명령줄 `auto`가 자동 경로를 호출하고 `run`이 기존 판독 작업을 호출한다. 자동 경로만 리딤 작업을 추가했다. 새 시험은 의존성을 주입한 실패 격리와 임시 파이썬 집계기를 통한 실제 자동 경로를 검사한다.
- `loadHarness`·`renderHarness`: `v2-sources.loadV2` → 서버 API, `index.html` → `/harness.js`, 기존 하네스·화면·2차 시험 및 새 3차 시험이 호출한다. 작업 집계를 추가 입력으로 전달하고 그림 배치만 바꾼다. 상태·마지막 동작 증거 선택은 유지한다.
- `HUDCosts`: `index.html`의 `renderCosts`·`renderCredits`와 화면 시험이 호출한다. 수집 요청 없이 기존 구글 광고 필드를 표로 표시하고 AI 모드를 번역한다.

### 검증 결과와 한계

A 3건은 수정 전 모두 실패를 재현했다. 3차 회귀 10건, 2차 14건, KPI 10건, 통합 73건, 기존 판독기 56건, 하네스 9건, 광고 API 모형 시험 9건 통과. 시험 명령은 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 감싸 직렬 실행했다. 통합 시험은 기존 하네스·판독기 시험도 내부에서 실행한다.

3차 시험: `/usr/bin/lockf -k /tmp/signum-heavy.lock node --test scripts/hud/verify-v2-round3.js`. 손상 과거 로그가 섞인 `/api/snapshot` 처리기 200과 다른 원천 보존, 구글 광고·AI 모드 전수·애플 집계 표시, 자동 회차의 `--count` 전용 호출·실패 격리·원천 갱신, 흐름도 모든 노드·연결·배지 및 연결선의 다른 노드 내부 통과 여부를 검사한다. 화면은 모형 DOM으로 검사했다. 기본 노드의 글자 폭은 로컬 한글 글꼴로 SVG 노드 경계 안에 들어가는 것을 추가 확인했다.

실제 소켓은 샌드박스에서 바인드할 수 없어 동일 HTTP 처리기를 IPC로 검증했다. 브라우저 접근 금지에 따라 실제 1280·390 화면 및 운영 launchd 회차는 미검증이다. 운영 파일 쓰기·커밋·병합·배포는 수행하지 않았다.

변경 파일 8개: `sources.js`, `v2-costs.js`, `refresh.js`, `index.html`, `v2-harness.js`, `v2-sources.js`, `verify-v2-round3.js`, `README-v2.md`. 모두 `scripts/hud/` 아래다. 영어 커밋 메시지만 `/tmp/signum-hud-v2-3-commit.txt`에 작성했다.
