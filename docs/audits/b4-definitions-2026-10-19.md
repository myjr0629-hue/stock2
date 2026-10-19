# B4 정의 레지스트리 — 관문 보류 수리 (2026-10-19)

브랜치 `fix/b4-defs-registry`, 시작점 `74c43ed7c`. 관문 기록 `gate-fix_b4-defs-registry-10191157.md`, 원 지시서 `task-b4-defs-registry.md`, `SWEEP-CLOSED.md` 전부와 b5 결과, 운영 람다 배포 계보 README를 읽었다. 아래는 이번 미커밋 수리의 최종 상태다. 운영 조회·쓰기, 브라우저, `.env*` 열람, 커밋·push·병합·배포는 하지 않았다.

## 결과 요약

- **람다 쓰기 변경 제외**: `harvest_lambda/index.js`를 B4 이전 `c78d62b8c`와 바이트 동일하게 복구하고 `harvest_lambda/structure-read.js`를 제거했다. 읽기 범위에 맞춰 웹 `cron/harvest-history`의 B4 쓰기 변경도 복구했다. 이 두 수집 경로는 B4 이전과 차이 0이다. 별도 람다 패치는 이번 읽기 수리에 필요하지 않다.
- **산식 혼합 원인**: 기존 `reconcileGexHistory`는 정본과 같은 날짜 또는 미래 날짜의 구형 행만 분리했다. 따라서 10/15 구형 −14M과 10/16 정본 +4.79M이 같은 차트에 남아 가짜 NEG→POS와 백분위 50을 만들었다.
- **산식 분리**: 읽기 경계에서 각 행에 `gexFormulaVersion`을 부여한다. 기존 `gexBasis:structure_v2`는 식별 가능한 정본으로 호환하고, 무표식 행은 `legacy_whole_chain`으로 남긴다. 명시된 버전이 우선하므로 향후 다른 버전은 정본 배열에 들어오지 않는다. `/api/history.data`는 정본만, 모든 다른 산식은 날짜와 무관하게 `supersededLegacy`/전체 개수로 별도 반환한다. DB 원본이나 과거 산식을 새 산식으로 다시 쓰지 않는다.
- **null 예외 원인**: 웹 `GexTimeline`은 `gex:null`을 숫자로 가정해 `null.toFixed`를 호출했다. 앱은 null 행 자체를 제거해서 결측 양옆을 연결할 수 있었다.
- **결측 처리**: 공용 `gexTimelineRows`/`gexPlot`/`formatGex`를 웹·앱에 연결했다. null/undefined/NaN/Infinity/문자열은 실제 값과 통계에서 제외한다. 마지막 실제 값은 그 값의 ET 날짜와 표시하고, 결측 위치는 SVG 경로를 끊는다. 전부 결측이면 차트 구간을 비워 둔다. 실제 0은 유지한다. 결측을 이유로 웹 탭을 자동 전환하거나 칸을 숨기지 않는다. 최대 600개 표본화도 결측 구간과 마지막 실제 관측을 보존한다.
- **RSI 복구**: Flow와 CMD 모두 B4 이전 표시식을 복구했다. Flow 56.4=Neutral, 35.5=Cool, CMD 56.4=Warm, 48.2=Stable. 상태어·구간의 화면 간 통일(D22)은 대표 지시 전까지 보류한다. 불필요해진 `rsiBand`를 제거했다.

## 유지한 B4 정의

D01 서버 squeezeScore, D03 콜 프리미엄 비중(b5 재사용), D09 서버 net30d, D20 검증된 주식 장외 순명목금액만 AI에 제공, D21 맥스페인 분모, D24 실제 공매도 편차, D38/D41 structure:v2 읽기 정본, D45 표준 S3를 유지한다. D02·D10·D30·D34·D35 라벨은 변경하지 않았다. 이번 표시 변경은 지시된 GEX 결측·관측 날짜 처리와 RSI 원복 범위다.

## 바꾼 파일

- 복구: `harvest_lambda/index.js`, `harvest_lambda/structure-read.js`(삭제), `src/app/api/cron/harvest-history/route.ts`, 앱 `flow/page.tsx`·`cmd/page.tsx`, `src/lib/defs/market.ts`.
- 이력 계약: `src/lib/defs/gexHistory.ts`, `src/lib/defs/gexTimeline.ts`(신규), `src/lib/aws/historyStore.ts`, `src/app/api/history/route.ts`.
- 소비처: `src/components/history/GexTimeline.tsx`, `src/components/app/AppGexTimeline.tsx`, `src/components/LiveTickerDashboard.tsx`, `src/lib/ai/deepSnapshot.ts`, `src/services/gexHistoryService.ts`.
- 시험·인계: `tests/b4Definitions.test.cjs`, 이 문서.

## 공유 함수 호출자·영향

- `reconcileGexHistory`/`structureHistoryPoint`/`sampleGexHistory`: History GET. 산식별 반환, 세션 시각 보정과 마지막 실제 관측·결측 구간 보존을 API 모의 실행과 단위 시험으로 확인한다.
- `gexFormulaVersion`/`isCanonicalGexRow`/`normalizeStructureHistoryRow`: 위 이력 경계, 차트 공용 정규화, Intel `gexHistoryService`. 명시된 다른 산식과 결측은 레짐 비교에 쓰지 않는다.
- `gexTimelineRows`/`hasGexValue`: 웹·앱 GEX 차트와 `computeGexStats`. `gexPlot`/`formatGex`는 웹·앱 두 차트에서 사용한다. null 포맷 예외, 결측을 0으로 그림, 결측을 가로지르는 선을 시험한다.
- `computeGexStats`: 앱 CMD, 서버 `deepWarmService`, 웹 `LiveTickerDashboard`. 웹에 따로 있던 통계 코드를 같은 함수로 위임했다. 다른 산식/결측은 표본 수·레짐·백분위에 들어오지 않으며 거래일 표본이 2개 미만이면 null이다.
- `GexTimeline`: `LiveTickerDashboard`가 호출한다. 결측 탭 자동 전환을 제거했다. `AppGexTimeline`: 앱 CMD가 호출한다. 칸을 유지하며 실제 값 1개도 날짜와 표시한다.
- RSI 함수의 기존 호출자는 앱 Flow·CMD 두 곳뿐이었다. 두 표시식을 원복하고 공용 분류를 삭제했다.

## 돌린 시험과 결과

- `node --test tests/b4Definitions.test.cjs`: 최종 **25/25 통과**. History GET 모의 실행, Flow·CMD·Watchlist·Intel·AI 같은 입력, 3개 언어 웹·앱 React 서버 렌더, 날짜가 다른 구형 산식, 명시된 다른 버전, null/NaN/Infinity/문자열, 실제 0, 결측 선 분리, 최대 600개 표본, 주말 결측 사본을 확인했다.
- `node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/deepWarm.test.ts`: **12/12 통과**. 기존 앱·서버 예열의 공용 통계 연결 회귀 없음.
- 전체 타입 검사: `/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`: **1회 실행, 종료 0**. 이후 작은 이력 표본/중복 처리 보완은 두 defs 파일의 strict 타입 검사(전역 lockf, `--noEmit --skipLibCheck --strict --target ES2022 --moduleResolution bundler --module ESNext`)로 확인했고 종료 0이다. 전체 검사는 반복하지 않았다.
- 최초 추가 시험은 잘못된 fixture 세션 날짜와 앱 렌더 하니스의 읽기 정규화 생략을 드러냈고 보정했다. 표본 상한 시험은 601개가 나오는 경계 오류를 잡아 예산을 줄였다. 최종 25개 모두 통과했다.
- 기존 시험 안내의 `.bin/ts-node` 경로는 없어서 127로 종료했다. 설치된 `ts-node/dist/bin.js`를 직접 실행해 위 12개를 확인했다. 의존성 설치나 네트워크 접근은 없었다.
- `git diff --check`: 통과. 수집기 두 경로는 B4 이전과 바이트 동일. 미커밋 상태다.

## 남은 위험

1. 운영 데이터·실제 브라우저·실제 AI 생성은 미확인이다. 이번 확인은 닫힌 모듈 로더의 가짜 Redis/Dynamo/HTTP와 React 서버 렌더이며 외부 서비스에 접근하지 않는다.
2. 운영 람다는 기존 산식으로 계속 수집한다. API가 구형 이력을 정본 차트에 섞지 않으므로 정본 과거 표본이 부족할 수 있다. 현재 구조 캐시가 있으면 그 관측값과 날짜를 표시하며, 과거 산식으로 기간을 채우지 않는다. 정본 이력의 영구 수집·소급 재계산은 별도 운영 작업이다.
3. `gexFormulaVersion`은 API 읽기 시 부여하며 저장 필드 타입도 제공했다. DB 마이그레이션이나 저장 행 갱신은 하지 않았다. 원천에 없는 과거 버전을 추정하여 정본으로 승인하지 않는다.
4. 기존 structure:v2 캐시에 새 ivSkew가 없으면 결측일 수 있다. 운영 구조 생산자의 정상 갱신과 배포는 운영 세션 범위다.
5. D22 화면 상태어 불일치는 의도적으로 보류한다. b5·병행 브랜치 통합 때 같은 지표를 다시 구현하지 않아야 한다.
