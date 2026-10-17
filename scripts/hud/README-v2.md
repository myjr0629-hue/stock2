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
| `loadHarness` | 위 증거를 25노드·30연결로 정규화, 상태·마지막 동작을 인라인 그림으로 표시 |

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
