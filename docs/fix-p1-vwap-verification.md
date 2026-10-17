# P1 VWAP 3차 수리 검증

## 결과 요약

작업 시작 HEAD `18e48c286`, 브랜치 `fix/p1-vwap` 위에 이어서 수정했다. 최신 관문 `gate-fix_p1-vwap-10171450.md`와 이전 관문 `gate-fix_p1-vwap-10170802.md`를 전부 읽었다. 아래 결과는 합성 입력을 사용한 오프라인 함수·JSX 실행이다. 운영 실측이나 브라우저 측정이 아니다.

### 해소한 관문 지적

| 관문 원문 인용 | 원인과 수정 | 검증 |
|---|---|---|
| “현재가 123, 원천 VWAP null이면 `vwap=0`, `vwapDistPct=0`을 반환합니다.” / “`$0.00`, `+Infinity%` 재현” | Terminal의 0 대체와 Intel의 `distance || 재계산`이 결합했다. Terminal은 결측을 null로 보존한다. Intel은 양의 유한 VWAP일 때만 거리를 계산하며, 유효한 이격률 0은 그대로 사용한다. | 실제 `buildPriceEvidence` 함수 본문 → 실제 Intel VWAP JSX를 서버 렌더링. 수정 전 `VWAP Dist$0.00+Infinity%`로 실패, 수정 후 가격의 기존 `$---`와 거리 `---`로 통과. 불완전 item도 null 계약 검증. |
| “새 응답과 SSR의 VWAP이 모두 null이면 화면이 0으로 대체합니다.” / “VWAP `$0.00`, 이격률 `0.0%`, `vwapNear` 설명 선택 재현” | Dashboard의 `|| 0` 및 거리의 0 대체가 결측을 중립으로 판정했다. 명시적 null은 보존하고, 아직 필드가 없는 undefined일 때만 SSR로 대체한다. 값·거리·판정이 없으면 기존 SSR의 `--` 규칙을 적용한다. | 응답 수신 전 SSR 입력과 수신 후 null 입력으로 실제 Dashboard VWAP JSX를 서버 렌더링. 수정 전 두 경로 모두 `$0.00`·`0.0%`·`vwapNear`로 실패, 수정 후 통과. 실제 SSR 프리뷰도 검증. |
| 이전 관문: “전형가격을 `vw`로 반환합니다.” | 기존 2차 수리의 `vw=null`, `typicalPrice` 분리를 유지한다. Intrinio 어댑터와 API 가격·종가 선택 로직은 이번에 수정하지 않았다. | 기존 33개 시험 유지. 체결 `100×1 → 110×97 → 90×1 → 100×1`의 실제 VWAP 109.60과 전형가격 100의 구분, snapshot/daily/grouped/router/매핑 회귀시험 통과. |

VWAP 칸·레이아웃·라벨 `VWAP`, `VWAP Dist`, 기존 설명 번역 키와 문구는 유지했다. 결측일 때 칸을 숨기지 않으며 중립 설명을 선택하지 않는다. 유효한 측정값의 상승·하락·근접 설명과 색상 임계값은 유지한다. 정규장·시간외 종가 확정 코드, 공급사 요청 수·경로·TTL은 변경하지 않았다.

## 바꾼 파일

| 파일 | 변경 |
|---|---|
| `src/lib/vwap.ts` | 양의 유한 VWAP 검증, 결측/0 이격률 구분, 0 나누기·비유한 결과 차단 |
| `src/services/terminalEnricher.ts` | 정상·불완전 evidence 모두 결측 VWAP/거리를 null로 유지 |
| `src/types.ts`, `src/types/intel.ts` | Terminal/Intel 공유 가격 계약에 null 반영 |
| `src/app/[locale]/intel/IntelClientPage.tsx` | 동일한 null 계약, 기존 칸·라벨과 `---` 결측 규칙 유지 |
| `src/app/[locale]/ticker/CommandSSRCards.tsx` | SSR 프리뷰의 명시적 결측 보존, 거리 결측에도 기존 `--` 적용 |
| `src/components/LiveTickerDashboard.tsx` | VWAP 카드·Conviction·차트 2곳·AI 전달의 값 선택 일치 |
| `src/components/AIDeepAnalysis.tsx` | 전달 snapshot의 VWAP 타입에 null 허용(실행 로직·문구 변경 없음) |
| `tests/vwapDisplay.test.ts` | 최종 JSX·SSR 프리뷰·공유 함수·소비 경로 20개 시험 |
| `tests/intrinioVwap.test.ts` | 기존 33개 유지·null 계약 강화, 실제 SSR light → 프리뷰 시험 1개 추가 |
| `tests/tsconfig.intrinio-vwap.json` | 변경 UI·타입·시험을 범위에 포함, Next 타입 선언 포함 |
| `docs/fix-p1-vwap-verification.md` | 이 보고서 |

### 공유 함수 호출자와 영향

- `normalizeVwap`: Terminal `buildPriceEvidence`, Intel drawer, SSR `CommandSSRCards`, Dashboard의 Conviction·VWAP 카드·StockChart·TechnicalLevelsMap·AI snapshot 값·거리(6곳), `vwapDistancePct` 내부. 직접 호출을 전수 검색했다. 각 경로의 null/undefined/정상값/0/Infinity 선택식을 현재 소스에서 실행했고, 양 화면과 SSR 프리뷰는 실제 JSX를 렌더링했다.
- `vwapDistancePct`: Terminal builder, Intel drawer, SSR 프리뷰, Dashboard의 Conviction·카드·AI 거리. 각 호출을 시험했다. 입력 결측·0·음수·NaN·Infinity·문자열·오버플로는 거리 null, 보고된 유효 거리 0은 보존한다.
- `buildPriceEvidence`의 유일한 직접 호출자는 `enrichSingleTickerWithRetry`다. 상위 `enrichTerminalItems` 호출자는 `reportScheduler`와 `api/cron/backfill-terminal` 두 곳이다. 운영 scheduler/cron은 실행하지 않았다. `createIncompleteItem`도 실제 함수 본문으로 null 직렬화를 확인했다.
- evidence 후속 소비 `powerEngine`: 기존 `vwapDistPct > 0`은 null에도 가산하지 않으며, Alpha·TradePlan 전달은 기존 `?? null`이다(정적 확인). `calculateStealthLabel`은 VWAP을 읽지 않는다. 공유 타입 확장을 포함한 범위 타입 검사로 호출 계약을 확인한다.
- 차트는 기존 양수 값 조건에 따라 선을 그린다. 두 차트에 결측을 undefined로 전달하므로 VWAP 가격선이 만들어지지 않는다. 카드 칸은 유지된다. 실제 차트 DOM 실행은 하지 않았다.
- `AIDeepAnalysis`의 직접 JSX 호출자는 Dashboard 한 곳이다. null 값과 기존 `N/A` 거리를 전달한다. 서버 prompt의 기존 `s.vwap || 'N/A'` 처리와 호환됨을 정적으로 확인했다. AI·외부 API는 호출하지 않았다.
- 2차 수리의 Intrinio 공유 함수 호출자 목록과 기존 어댑터/라우터·17개 파일 소비 매핑 시험은 유지했다. 추가 SSR 시험은 실제 `getStockDataLight` → 어댑터/라우터 → `CommandSSRCards`를 실행한다. 저장소·시계·외부 fetch는 대역으로 격리했다.

## 돌린 시험과 결과

| 시험 | 결과 |
|---|---|
| 수정 전 `vwapDisplay` 11개 | 3 통과 / 8 실패. 관문 2건 모두 실제 출력으로 재현 |
| 수정 후 같은 11개 | 11 통과 / 0 실패 |
| 경계·호출자 확장 후 `vwapDisplay` | 20 통과 / 0 실패 |
| `intrinioVwap` | 기존 33 + SSR 1 = 34 통과 / 0 실패 |
| `regularRealtimeOverlay` | 10 통과 |
| `extStaleSnapshot` | 21 통과 |
| `extendedSipOverlay` | 22 통과 |
| `extStaleRoute` | 6 통과 |
| `quotesBulkClose` | 9 통과 |
| `afterCloseSession` | 35 통과 |
| 최종 실행 시험 합계 | 157 통과 / 0 실패 |

시험 하네스 준비 중 Activity 대역과 Intel JSX 선택 범위를 보정한 실행은 수정 전 결함 수에 포함하지 않았다. 위 수정 전 8개 실패는 하네스 보정 후, 운영 코드 수정 전에 확인한 값이다.

범위 타입 검사를 UI로 확장한 최초 실행은 `<style jsx>` 타입 선언 누락으로 3건 실패했다. Next의 공식 `index.d.ts`를 포함하도록 시험 설정을 보정했다. 전체 tsc·Next build는 실행하지 않았다. 보정 후 확장 범위 타입 검사는 **통과(exit 0)**했다. `git diff --check`도 통과했다. 무거운 시험 묶음과 범위 타입 검사는 모두 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 직렬화했다.

실행 로그는 `/tmp/signum-p1-vwap-3-{red,green,display,intrinio}.log`, 종가 회귀는 각 시험 이름의 `.log`, 타입 검사 로그는 `types.log`와 `types-final.log`다. 영어 커밋 메시지 파일은 `/tmp/signum-p1-vwap-3-commit.txt`다. 커밋·push·병합·배포는 하지 않았다.

## 남은 위험

- 실제 Intrinio 성공 본문·계정 VWAP 수급·실시간 정확성은 확인하지 않았다. 기존 fixture의 공급사 측정 메타데이터는 401/빈 summary이고, 가격·체결 입력은 합성이다.
- 브라우저·운영 화면·모바일 실기기 검증은 하지 않았다. 검증 범위는 오프라인 함수·선택식·React 서버 렌더링이다.
- 과거 근사값이 들어 있는 응답·분석·last-good 캐시는 자연 만료 전까지 남을 수 있다. 양의 유한 숫자만으로 과거 근사값인지 식별할 수 없다. 운영 캐시 삭제·DB/Redis/API 쓰기는 하지 않았다.
- 분봉 average·옵션 VWAP·별도 Lambda 어댑터 등 이번 소비 경로 밖의 가격 정의는 검증 범위 밖이다.
