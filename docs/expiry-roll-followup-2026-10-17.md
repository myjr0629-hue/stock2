# 만기 굴림 후속 검증 — 2026-10-17

## 결과 요약

- 시작 시 브랜치는 `fix/expiry-roll`, HEAD는 요청에 적힌 `e40623d8c`가 아닌 `7039cddf3`였다. 작업 중 다른 세션이 기존 UC·SEO 수정 5개 파일을 반영하고 HEAD를 `c0295ac1f`로 갱신했다. 그 변경을 보존하고 그 위에 후속 수리를 했다. 이력 재작성·main 병합·push·배포·운영 쓰기는 하지 않았다.
- 지정 지시서·결과서·10170909 관문 전문을 읽었다. 추가로 10171002·10171010 관문 전문도 읽고 해당 재현을 확인했다.
- 확인한 원인: `atmStraddleImpliedMove`는 기본 최소 만기가 ET 날짜였고 지정 만기는 만료 여부를 검사하지 않았다. `peekStoredStructure`·읽기 API·실적 묶음도 날짜만 비교했다. 프로브 60초 메모는 마감 경계를 포함하지 않아 지난 0DTE 값이 남을 수 있었다.
- 계산·구조 사본·분석 캐시 출구가 기존 `optionExpirationFloor`/`isOptionExpiredAt`의 정규장 마감 규칙을 따른다. 지정 만기·오래된 minExpiry도 이를 우회하지 못한다. 프로브 메모는 최소 유효 만기·현물가를 키에 포함하며 지난 주간 exact 체인과 다음 주 probe 체인을 구분한다. 계산 정의 `(ATM 콜 mid + ATM 풋 mid) / 현물`은 그대로다.
- `/api/options/implied-move`는 별도 복제 구현 대신 실적 묶음과 같은 `readImpliedMoveRows`를 호출한다. 당일 만기 응답의 CDN 정상·stale 캐시 시간 합도 마감을 넘지 못하게 제한했다.
- 합성 체인: 현물 400, 지난 만기 양 다리 1.2 → ±0.6%, 다음 만기 양 다리 16 → ±8.0%. 금 15:59에는 10/16, 금 16:00부터 10/23 체인을 사용한다. **TSLA 운영 원천 체인 실측값이라는 뜻은 아니다.** 사용자가 보고한 ±0.6%/나스닥 ±0.19%의 실제 입력 계약·기준 세션은 이번 오프라인 작업으로 확정하지 않았다.

## 관문 항목별 확인

| 지적 | 최종 처리·근거 |
| --- | --- |
| UC: 구조 판본 없음·다음 판본 세 값 null·체인 stale에서 지난 사본 재노출 | 기존 차단 유지. UC 22건, 실제 UC 출구→SEO 연쇄 시험으로 확인 |
| SEO: NO_MARKET를 갱신 대기로 오판 | 기존 수정 유지. 숫자·대기 표식이 원래 없는 종목에는 대기 칸을 만들지 않음 |
| 생성 완료시각이 마감을 가로지르면 지난 만기로 오판 | `fetchMoney`가 실제 `levelsExpiration`·`levelsReadAt`을 사본에 보존. UC·SEO는 실제 만기→조회시각→옛 사본 완료시각 순으로 판단. 16:00:10 완료 정상 다음 만기 보존, 16:20 완료 지난 만기 차단 시험 |
| 다음 체인 없음에서 매 요청 재조회 | 기존 인스턴스별 자동 만기 1분 메모 유지. 구조 시험의 연속 호출 제한 확인 |
| UC에서 이미 숫자를 비운 응답을 SEO가 읽으면 세 칸 숨김 | 기존 `levelsPending` 전달 수정 유지. 실제 `ucMoneyAtExit` 결과를 SEO에 넣어 금 16:01·토·일·월 08:00 ET × ko/en/ja에서 세 칸 «—» 유지 확인 |
| 옵션 없는 UC 종목에 대기 칸 생성 | 기존 숫자가 없는 사본은 만기 시각만으로 대기 상태를 만들지 않음. UC·서버 렌더 시험 |

새 라벨·문구·번역·화면 요소를 추가하지 않았다. 기존 대기 상태의 칸 유지 경로를 보존했다. 새 만기·조회시각은 선택적 데이터 필드이며 옛 사본도 계속 읽는다.

## 바꾼 파일

소스 7개: `lib/impliedMove.ts`, `services/impliedMoveService.ts`, `app/api/options/implied-move/route.ts`, `app/api/undercurrent/shared.ts`, `lib/marketCalendar.ts`, `lib/seo/ucMoneyExit.ts`, `app/[locale]/flow/[ticker]/page.tsx` (모두 `src/` 아래).

시험 5개: 신규 `impliedMoveExpiryRoll.test.ts`·`ucMoneyProvenance.test.ts`, 보강 `impliedMove.test.ts`·`ucMoneyExit.test.ts`·`seoExpiryRoll.test.ts`. 이 보고서 1개.

## 공유 함수의 모든 호출자·영향·시험

`rg`로 `src`·`scripts`의 함수 이름 전체 및 호출식을 검색했다. 아래 줄 번호는 후속 수리 시점 기준이다. 기존 레벨 게이트의 호출자 목록은 앞 보고서 `expiry-roll-audit-2026-10-17.md`를 따른다.

| 공유 함수 | 직접 호출자 전부·영향 | 검증 범위 |
| --- | --- | --- |
| `atmStraddleImpliedMove` | `structureService:1286`, `impliedMoveService:39,186`, `alphaEngine:1830`, `FlowRadar:1052`, `dashboard/unified:1381` | 공통 계산 20건·새 경계 12건·구조 13건. FlowRadar 실제 브라우저 렌더는 미시험 |
| `impliedMoveFields` | `FlowRadar:1054`, `watchlistBatchService:745,983`, `portfolioBatchService:367`, `analysisCache:267`, `dashboard/unified:1388`, impliedMoveService 내부 | 계산·필드·배치 출구·스토어 마감 경계 시험. 위젯·watchlist 회귀 |
| `readImpliedMoveFields` | `analysisCache:245,256`, `watchlistBatchService:531,596,659`, `portfolioBatchService:236`, `dashboard/unified:384,829`, `intel/fast:653`, `DashboardClient:1625`, `MobileMetricsTab:112`; lib 내부 tagged/copy/stamp 래퍼 | 지난 표식 사본도 제거. `dashCloseRoll` 원본 JSON·웹/모바일 표현식·스토어 검증, 공통 필드/배치 시험 |
| tagged/copy/stamp 경유 | `DashboardClient:1623`, `MobileMetricsTab:112`, `app-view/intel/page:923,924,1657,1658,2501,2502`; `dashboardStore:361,508`; watchlist/portfolio 출구 | 바뀐 read 함수의 간접 영향. 기존 UI 표현은 유지. 공통 필드·스토어·watchlist 시험; intel 전체 화면은 미시험 |
| `weeklyImpliedMoveFromProbe` | `impliedMoveOfStructure` 내부·`analysisCache:266` | 마감 전후 20초 간격 메모·현물가 변경·다음 주 체인 도착·지난 체인만 존재 시험 |
| `peekStoredStructure` | `analysisCache:263`, `watchlistBatchService:730` | 저장본/lastgood 마감 경계 시험 |
| `impliedMoveOfStructure` | `analysisCache:265`, `watchlistBatchService:744,982`, `portfolioBatchService:366` | 지난 구조 및 구조 만기와 다른 impliedMove 차단 시험 |
| `readImpliedMoveRows` | API route:38, `earningsWeekService:120`, `earningsImpliedService:63`, `todayPicksService:151`, `signalAlertsService:143`, `earningsActualsService:111`의 기본 의존성(readImplied 별칭) | 경계·실적 뒤 첫 유효 만기·저장본 읽기 중 마감·API 동등성, earningsWeek/Implied/Actuals·todayPicks 회귀. signalAlerts 서비스 별도 통합 실행은 미시험 |
| `copyLevelsPastExpiry` | `ucMoneyExit:56`, SEO page:217 | 새 사본 실제 만기·조회시각 우선, 옛 사본 폴백, UC·SEO 연쇄 서버 렌더 |
| `fetchMoney` | UC ticker:68, UC `feedCore:133,150`, WIM today:204 | 실제 fetchMoney 모듈+가짜 ticker 응답으로 만기/조회시각 보존→UC 출구 2건. UC 문구·금액·PCR 회귀. feed/WIM 전체 HTTP 통합은 미시험 |

`scripts/earnings-actuals-seed-expected.ts`의 함수명은 설명 주석이며 직접 호출은 없다. 운영 시딩 스크립트는 실행하지 않았다.

## 돌린 시험과 결과

- 모든 시험은 외부 socket/HTTP를 차단하는 preload 또는 가짜 모듈·fetch를 사용했다. 운영 Redis/DB/API 호출·쓰기는 없었다.
- `/usr/bin/lockf -k /tmp/signum-heavy.lock node /tmp/signum-expiry-followup-regression.cjs`: 관련 **25묶음 모두 exit 0**, 오프라인 만기 감사 **341건·실패 0건**.
- 묶음: optionLevelGate, optionExpiry, structureWarmCompute, structureWarm, levelsSupplierDelay, webWatchlistLevels, watchlistInsights, watchlistData, etfFollowup, ucMoneyExit, crossSectorLevels, earningsWeek, warmAppTickers, widgetBridge, impliedMove, structureExpiryRoll, impliedMoveExpiryRoll, seoExpiryRoll, earningsImplied, todayPicks, dashCloseRoll, ucNumbers, ucPcrDirection, ucLeanGuard, ucAmounts.
- 별도 잠금 실행: `ucMoneyProvenance` **2건**, `earningsActuals` **29건 통과**(총 27시험 묶음). CDN 마감 제한·읽기 도중 마감 보강 뒤 `impliedMoveExpiryRoll` **최종 12건 통과**.
- 신규/보강 핵심 최종 건수: 구조 13·UC 22·SEO 14·예상 변동 경계 12·실제 사본 보존 2. SEO는 한 항목 안에서 4개 시각×3언어를 추가 대조한다.
- 잠금 적용 변경 소스 11개를 루트로 한 의존 경로 `tsc --noEmit --incremental false -p /tmp/signum-expiry-followup-typecheck.json`: **exit 0**. 전체 tsc·Next build는 실행하지 않았다(앞 작업에서 전체 tsc의 기존 `scripts-jpweek` 누락 확인). 타입 검사 뒤 서비스의 동일 변수 선언을 저장본 await 뒤로 이동한 변경은 경계 시험으로 확인했다.
- `git diff --check`: 통과. 시험 로그와 오프라인 runner는 `/tmp/signum-expiry-followup-*`에 있다.

## 남은 위험

- 커밋 시도는 `git add` 단계에서 Git 작업공간 `index.lock` 생성 `Operation not permitted`로 막혔다. 변경 13파일은 미커밋 상태다. 영어 메시지는 `/tmp/signum-expiry-followup-commit.txt`에 남겼다. 보호 경로·권한을 우회하지 않았다.

- 사용자 실측 TSLA ±0.6%/나스닥 ±0.19%는 계약 원본·만기·세션이 없는 관측이다. 확인된 코드 경로를 막았지만, 운영에서 이 숫자가 실제로 10/16 체인에서 왔다고 확정할 수 없다. 배포 후 운영 세션의 10/23 체인 대조가 필요하다.
- NFLX 종가 원천 1곳 응답은 원천 가용성 관측이며 만기 굴림으로 해결됐다고 볼 수 없다. 이번 작업에서는 운영 원천 재조회·새 종가 선택 규칙 변경을 하지 않았다.
- 실제 만기·조회시각이 없는 **옛** UC 사본에는 기존 생성 완료시각−5분 추정이 남는다. 생성 시간이 그 상한을 넘었거나 완료시각도 없는 옛 사본의 정확한 만기는 확정할 수 없다. 새 사본은 실제 만기·조회시각을 우선한다.
- 레벨 생성의 자동 만기 대기 메모는 프로세스 단위다. 여러 인스턴스 전체의 단일 조회 보장은 아니다. 공급사 다음 체인이 없으면 대기는 지속된다.
- 운영 응답·네이티브/브라우저 실화면·기존 네이티브 저장본의 즉시 교체는 검증하지 않았다. 운영 접근·push·배포는 수행하지 않았다.
