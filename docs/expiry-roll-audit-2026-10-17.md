# 옵션 레벨 만기 롤오버 — 2026-10-17

## 재현과 원인 (수정 전 HEAD 903beeefb)

- 원본: `~/signum-ego-io/integrity/history.jsonl`의 `2026-10-17T08:02:44`, `runs/2026-10-16T23-02-44-558Z.json`.
- 실측: 10/16 금요일 19:02 ET, MSTR·ASTS·NFLX·COST·BRK.B·IWM·SOXL·FITB의 `2026-10-16` 만기. 상세 findings에는 각 종목의 ticker와 watchlist가 각각 기록돼 있다. SOXL 현물 괴리 경고는 별도 결함이며 이번 수리 범위 밖이다.
- dashboard·Flow·widget·SEO의 같은 시각 전체 응답 실측은 이 기록에 없다. 아래는 코드 경로 확인 및 가짜 체인으로 재현한 영향이다. 운영 재조회는 하지 않았다.

수정 전 원본 위치:

| 선택/검사 | 파일:줄 (수정 전) | 실제 규칙 |
| --- | --- | --- |
| 레벨 캐시의 유효성 | `src/services/structureService.ts:458`, 호출 `:360`, `:554`, `:1534`, `:1664` | `expiration < 오늘 ET`일 때만 거절. 당일 16:00을 검사하지 않음 |
| 새 체인 최소 만기 | 같은 파일 `:28`, `:706` | 토·일만 월요일로 이동. 평일에는 마감 뒤에도 오늘 |
| 수집기 프로브 재사용 | 같은 파일 `:744` | 주간 만기 ≥ 위 최소 날짜면 72시간 프로브 재사용 가능 |
| 벤더 목록/주간 선택 | 같은 파일 `:824`, `:839` | 위 최소 날짜로 걸러 `findWeeklyExpiration` 호출 |
| 주간 선택기의 폴백 | `src/services/holidayCache.ts:62`, `:112` | 금요일 16시 이후 다음 금요일을 기대하지만, 없으면 목록의 첫 금요일을 재선택. 지난 만기를 사전에 걸러야 함 |
| 기존 마감 정의 | `src/lib/marketCalendar.ts:173`, `:182` | 계약은 만기일 정규장 마감에 만료. 조기 폐장 13:00, 평소 16:00 |

`git show HEAD:src/services/structureService.ts`에서 위 두 함수 원문을 추출해 TypeScript를 변환하고 격리 VM으로 실행했다. 날짜는 ET로 고정했다.

| ET 시각 | 원본 새 체인 최소 만기 | 원본 캐시가 10/16 만기를 거절? | 수정 후 최소 만기 |
| --- | --- | --- | --- |
| 금 10/16 15:59 | 10/16 | 아니오 | 10/16 |
| 금 16:01 | 10/16 | 아니오 | 10/19 |
| 금 19:02 | 10/16 | 아니오 | 10/19 |
| 토 10/17 12:00 | 10/19 | 예 | 10/19 |
| 일 10/18 12:00 | 10/19 | 예 | 10/19 |
| 월 10/19 08:00 | 10/19 | 예 | 10/19 |

원인: 계약 흐름의 마감 판정은 병합돼 있었으나 레벨의 캐시·프로브 입구가 날짜 비교를 계속 사용했다. 기존 구조 판본을 바로 반환하면 주간 선택기의 마감 처리까지 도달하지 않았다. 원본 캐시의 실제 롤오버 경계는 ET 자정이었다. `day.*` 가격은 EOD일 수 있으므로 만기 경계의 시계로 사용하지 않았다.

## 수리와 모든 호출자 영향

- `marketCalendar.optionExpirationFloor`는 기존 계약 만료 판정과 휴장 달력을 사용한다. 금요일 16:00부터 최소 날짜는 월요일, 주간 만기 선택은 기존 규칙대로 다음 금요일(예시 10/23)이다. 다음 거래일이 휴장이면 더 건너뛴다.
- `structureService.getNextTradingDayET`, `normalizeExpirationsForToday`, 캐시 판정·프로브·벤더 목록·`inspectStoredVersions`가 같은 최소 날짜를 사용한다. 빈 목록 폴백도 지난 `?exp=` 요청을 다시 살리지 않는다.
- `displayLevels`는 요청이 마감을 가로지르는 경우도 검사한다. 지난 숫자·만기는 null, 출처는 null로 내고 마지막 판본 시각(`levelsAsOf`)·체인 날짜·stale 표식은 보존한다. 다음 판본이 없으면 기존 대기 상태이며 갱신 후보에는 계속 남는다.
- command/unified·dashboard 출구가 사본의 지난 expiration 라벨을 다시 남기지 않는다. 구조 API는 응답 중 만기가 지나면 PENDING이다.
- SEO·UC의 사본 숫자 재사용 경로도 처리했다. 사본은 만기를 싣지 않으므로 만든 시각으로 판정한다(`marketCalendar.copyLevelsPastExpiry`: 만든 시각(생성 완료 시각 − 5분, 레벨은 그보다 앞서 읽음)의 주간 만기가 지금 기준으로 마감됐으면 지난 레벨). 구조 판본이 없거나·낡았거나·세 레벨이 모두 비었을 때 지난 사본이면 숫자를 내지 않고 칸은 기존 «—» 글자로 남긴다(SEO 세 칸 + 기존 «MM/DD 기준» 표식, UC 지도 라벨 세 개). 새 문구·시계·날짜 요소는 없다. 옵션 없는 종목(NO_MARKET)은 기존 동작 그대로.
- 공급사 다음 체인이 비어 PENDING 이 저장되지 않는 동안 직접 getStructureData(auto) 호출이 요청마다 벤더를 다시 부르지 않게 인스턴스당 종목별 1분 기억(`autoPendingMemo`)을 둔다.

공유 함수의 직접·간접 호출자 전수 검색 결과:

| 경로 | 호출자/영향 | 확인 |
| --- | --- | --- |
| ticker·Command·Flow | `api/live/ticker/route.ts:238,252,345`, `api/command/unified/route.ts:520`, `[locale]/ticker/page.tsx:181` → prefetch/levelsForExit → display/apply | 신규 시간 시나리오, 출구·자기 구조 폴백 시험 |
| dashboard | `api/dashboard/unified/route.ts:1032,1043,1273` → levelsForExit/display/getStructureData | 공용 함수 회귀, 타입 검사; 실제 dashboard GET 통합/실화면은 미시험 |
| watchlist·portfolio·widget | `services/watchlistBatchService.ts:288,889,1413`, `portfolioBatchService.ts:113,312,484` → prefetch/getStructureData/applyRealtime. iOS `WidgetData.swift:279`·안드로이드 `WidgetData.java:115`는 같은 batch 응답을 읽음 | 대기 notice/메타, watchlistData/Insights, widgetBridge; 네이티브 렌더는 미시험 |
| 구조·변동성 | `api/live/options/structure/route.ts:43,52,93`, `api/live/volatility-regime/route.ts:24,71`, `api/live/premium-metrics/route.ts:203` | 구조 API 출구·새 체인·PENDING 시험 |
| SEO·UC·실적 주간 | `[locale]/flow/[ticker]/page.tsx:156,204`, `api/undercurrent/ticker/route.ts:210,212` → ucMoneyAtExit → `[locale]/undercurrent/page.tsx:522`, `services/earningsWeekService.ts:123,133` | SEO 실제 서버 렌더 3언어·복귀·범위 밖, UC 지도 원문 렌더·ucMoneyExit/earningsWeek |
| intel | `api/intel/fast/route.ts:743,747`, `api/intel/cross-sector-brief/route.ts:274` | 공용 출구 및 crossSectorLevels 시험 |
| intel 묶음 | `overlayLevelsOnQuotes`의 m7·siliconcore·orbitdefense·cloudfortress·cybershield·quantumedge·biopulse·powermatrix·fintechpulse·physicalai 라우트 | 모두 levelsForExit → applyRealtime. 기존 없음=0 규약 유지, 공용 시험/타입 검사 |
| 계산·관리 호출자 | `services/guardian/gammaShieldEngine.ts:199`, `api/portfolio/analyze/route.ts:29`, `api/watchlist/analyze/route.ts:26`, `api/cron/structure-build/route.ts:166`, `api/cron/structure-warm/route.ts:133`, structureService 내부 scheduleRefresh/refreshStructureForWarm | getStructureData/inspectStoredVersions의 만기 유효성 변경, structureWarm/Compute·warmAppTickers |

`getNextTradingDayET`의 사용처는 structureService 내부뿐이다. `normalizeExpirationsForToday`의 외부 사용처는 구조 API뿐이다. `peekStructureLevels`는 호환 래퍼이며 현재 외부 호출은 없다. `displayLevels` 직접 호출자는 표의 ticker·dashboard·structure·volatility·SEO·UC·earningsWeek 및 optionLevelGate 내부 apply 두 함수와 structureService 만기 대기 경로다. `levelsFromStructure`의 가격 정의는 변경하지 않았다(signals/detect·AI crossSectorLevels의 이력 계산 포함).

## 시험 결과

- 신규 `tests/structureExpiryRoll.test.ts`: 12개 통과. 금 15:59·16:00·16:01·19:02, 토·일·월 08:00, 72시간 수집기 프로브·명시 만기 캐시·목록 없음·목록은 있으나 체인 없음·응답 중 마감·조기 폐장·휴장·DST. 실제 서비스와 메모리 Redis/가짜 체인 사용.
- 신규 `tests/seoExpiryRoll.test.ts`: 8개 통과. ko/en/ja의 실제 서버 렌더에서 지난 사본 숫자·메타데이터 오염 없음, 새 문구/시계 없음, NO_MARKET 대기 표시 없음, 마감 뒤 사본 유지, 다음 판본 도착 시 복귀.
- 기존 15묶음 422개 통과: optionLevelGate 61, optionExpiry 18, structureWarmCompute 13, structureWarm 54, levelsSupplierDelay 18, webWatchlistLevels 3, watchlistInsights 96, watchlistData 49, etfFollowup 14, ucMoneyExit 7, crossSectorLevels 18, earningsWeek 24, warmAppTickers 14, widgetBridge 13, impliedMove 20.
- `scripts/audit-expiration-selection.js` 오프라인 감사 341건 통과. `--live` 미사용.
- 전체 `tsc --noEmit --incremental false` 1회: locale 인덱싱 오류를 수정했다. 기존 `src/remotion/kit/scripts.ts:5004`가 없는 `./scripts-jpweek`를 참조하는 오류도 확인했다(수정 전 HEAD에도 같은 import). 전체 검사는 반복하지 않았다.
- 처음 수정한 7개 소스 파일을 루트로 한 의존 경로 타입 검사 통과. 이후 SEO 표시 분기는 SEO 루트 타입 검사로 통과했다. UC 대기 추가 때 발생한 번역 객체의 인덱스 타입 오류도 수정했고, `ts-node`의 타입 검사 포함 UC 모듈 compile/load로 최종 통과했다.
- 대형 시험·타입 검사는 `/usr/bin/lockf -k /tmp/signum-heavy.lock ...`로 순차 실행. 기존 시험 묶음은 외부 소켓/HTTP를 막는 preload를 사용했다. 신규 시험은 모든 외부 경로를 가짜로 대체했다. 운영 Redis/DB/API 쓰기는 없었다.

## 남은 위험

- 브랜치 `fix/expiry-roll`에서 커밋 준비를 시도했으나 `git add`가 `.git/worktrees/fix-expiry-roll/index.lock` 생성 권한 오류(`Operation not permitted`)로 실패했다. 파일 수정은 남아 있으며 커밋·push·배포는 하지 않았다. 시험 의존성은 작업공간의 무시된 `node_modules` 심볼릭 링크로 기존 공용 설치를 읽었다.
- 배포·운영 응답 재검증·브라우저·네이티브 실화면 확인은 수행하지 않았다. 공급사 다음 만기 체인이 실제로 준비되는 시각은 확인하지 않았다.
- 공급사 체인이 없으면 대기가 지속된다. 기존 응답 뒤 갱신 상한(요청당 3종목, 종목당 최소 5분)과 사전 갱신 크론에 복구 시점이 좌우된다.
- 네이티브 위젯이 이미 보관한 응답은 다음 batch 갱신 전까지 남을 수 있다. 네이티브 저장본 자체의 만기 시계는 이번 수리 범위 밖이다.
- 전체 타입 검사는 기존 Remotion 누락 파일 때문에 통과했다고 보고할 수 없다. 변경 경로 타입 검사는 통과했다.
