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

기존 원천에 없는 확정 성과는 `~/Documents/signum-work/hud/feeds/performance.json`을 선택적으로 읽는다. 필드는 `readAt`, `registrations:{total,week}`, `paid:{active,trials,conversion}`, `redeem:{today,week,remaining}`이다. 누락 시 판독 대기를 유지한다. 이 작업은 피드를 작성하지 않는다.

공개 게시 주소만 표시하며 인증 주소·민감 인자를 제외한다. 프로그램은 `.env*`를 읽지 않는다.

## 검증

```sh
/usr/bin/lockf -k /tmp/signum-heavy.lock node scripts/hud/verify-v2.js
```

`verify.js`도 같은 통합 검사로 진입한다. 단위 입력은 임시 파일이며, 서버는 임시 홈·저장소에서 자동 수집기를 끄고 기동한다. 운영 서버·외부 서비스에 쓰지 않는다. 포트 바인드가 차단된 환경에서는 동일 HTTP 처리기를 별도 자식 프로세스의 IPC로 호출하고 그 한계를 출력한다. 화면 검사는 VM의 DOM 대역을 사용하며 실제 배치·픽셀을 검증하지 않는다.

이번 실행 결과: 통합 72건, 기존 판독기 단위 56건, 하네스 독립 9건 모두 통과했다. 통합 집계에는 뒤의 두 시험 묶음 통과 여부도 각각 한 건으로 포함한다. 샌드박스의 포트 바인드 거절로 HTTP 처리기는 IPC 방식으로 검사했다. 실제 소켓 응답과 브라우저 화면 촬영은 미확인이다.

공유 모듈 호출자는 `server.js`, `collect.js`, `refresh.js`, `verify.js`, `verify-ads-api.js`를 확인했다. 기존 함수 본문을 바꾸지 않고 내보내기만 추가했으며, 신규 필드는 서버에서만 사용한다. 기존 판독기 단위 56건으로 파서·설치·광고·자동 갱신 시각표 호환성을 확인했다.

## 운영 세션의 실제 응답·촬영 확인

이미 7788 서버가 실행 중이면 해당 서버를 운영 세션의 절차에 따라 갱신한다. 별도 확인 서버는 비어 있는 포트에서 자동 수집기를 끄고 실행할 수 있다.

```sh
HUD_PORT=17788 HUD_NO_COLLECT=1 node scripts/hud/server.js
curl --fail --silent http://127.0.0.1:17788/api/snapshot | node -e 'let b="";process.stdin.on("data",c=>b+=c);process.stdin.on("end",()=>{const s=JSON.parse(b);console.log("v2 필드:",Object.keys(s.v2).join(","))})'
```

운영 세션이 위 화면 주소를 열고 브라우저 개발자 도구의 반응형 모드에서 너비 **1280**과 **390**으로 설정한다. 9개 해시마다 전체 페이지를 촬영하고, 게시·할 일은 항목 하나를 펼친 상태도 찍는다. 확인할 것은 카드 겹침, 글자 잘림, 가로 넘침, 차트 범례, 하네스 상태 점과 마지막 시각, 빈 값의 판독 대기다. 이 작업 세션은 브라우저 접근 금지 지시를 따라 화면을 열거나 촬영하지 않았다.

대표 지시 11·12의 전 플랫폼 대응과 크레딧 최적화는 이 화면에서 플랫폼 전수 상태 및 실행 역할·사용량을 관찰할 수 있도록 반영했다. 게시·계정·구독·배포 등 실제 운영 변경은 수행하지 않는다.
