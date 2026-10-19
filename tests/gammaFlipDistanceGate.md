# 밤 검토 2026-10-19 항목 5 — 감마플립 거리

## 결과 요약

- 확인한 원인: `optionLevelGate`는 현물 분모, `volatilityRegime`와 변동성 API 재선택 분기는 플립 분모를 사용했다. Command 화면도 응답 뒤 플립 분모로 다시 계산했다.
- `gammaFlipDistancePct(spot, flip)` 하나로 `(spot - flip) / spot * 100`을 계산한다. 부호는 현물이 플립 위면 양수다.
- 현물 105.10·플립 100 → 원시 거리 4.852521…%, 기존 소수점 한 자리 응답 4.9%. 94.90·100 → -5.4%, 100·100 → 0%.
- 함수는 반올림하지 않는다. 점수는 원시 거리, 응답·화면은 기존 자리수를 유지한다. 기존 결측 표현(null 또는 0)은 호출 경로별로 유지했다.
- 라벨·문구·레이아웃·표시 서식 변경 없음. 커밋·push·배포·운영 데이터 접근 없음.

## 바꾼 파일과 모든 호출자 영향

| 파일 | 영향 |
| --- | --- |
| `src/lib/gammaFlipDistance.ts` | 외부 의존 없는 공통 산식 추가 |
| `src/lib/optionLevelGate.ts` | `applyLevelsToUnified`의 거리 계산 연결. 호출자는 `api/command/unified`의 정상 응답 공통 출구와 `[locale]/ticker/page.tsx`의 SSR 정상·실패 폴백 |
| `src/services/volatilityRegime.ts` | 거리·근접 점수 계산 연결. 호출자는 `api/live/volatility-regime`와 `api/live/premium-metrics` |
| `src/app/api/live/volatility-regime/route.ts` | 출구의 플립이 계산 입력과 달라지는 분기도 같은 산식 사용 |
| `src/app/api/command/unified/route.ts` | DynamoDB GEX 계산·스냅샷 GEX 계산 두 경로 연결. 캐시 등 정상 응답은 공통 레벨 출구에서 최종 보정 |
| `src/components/LiveTickerDashboard.tsx` | 구조 기반 `effectiveVol.flipDistance` 재계산 연결 |
| `src/components/intel/mobile/MobileCmdMetrics.tsx` | 기본 거리와 구조 기반 `effectiveVol` 두 계산 연결 |
| `src/app/[locale]/app-view/cmd/page.tsx` | Command 신호 계산의 거리 연결 |
| `tests/gammaFlipDistance.test.js` | 공통 산식·서비스·API·SSR·DynamoDB 두 분기·웹/모바일·점수 경계 오프라인 회귀 추가 |
| `tests/cmdMissingScores.test.ts` | 실제 Command 계산 재현 추가, VM에 공통 함수 제공 |
| `tests/integrityAudit.test.ts` | 기존 화면 계산 VM에 공통 함수 제공 |
| `tests/integrityStructUnify.test.js` | 기존 오프라인 로더에 공통 함수 등록 |
| `tests/gammaFlipDistanceGate.md` | 원인·호출자 영향·검증 기록 |

## 돌린 시험과 결과

모두 `/usr/bin/lockf -k /tmp/signum-heavy.lock` 안에서 순차 실행. 설치나 `.env*` 읽기 없이 기존 설치 모듈을 `NODE_PATH`로 참조했다.

| 시험 | 결과 |
| --- | --- |
| `gammaFlipDistance.test.js` | 6/6 |
| `optionLevelGate.test.ts` | 61/61 |
| `structureExpiryRoll.test.ts` | 13/13 |
| `cmdMissingScores.test.ts` | 35/35 |
| `integrityStructUnify.test.js` | 84/84 |
| `integrityAudit.test.ts` | 33/33 |
| 공통 함수·변동성 서비스 한정 `tsc --noEmit --skipLibCheck --target ES2020 --module commonjs` | 통과 |
| `git diff --check` | 통과 |

총 232개 통과. 신규 시험 첫 실행은 시험 코드의 AST 속성 오기로 1건 실패했고 수정 후 6개 모두 통과했다.

## 남은 위험

- 산식 변경으로 1·3·5% 근접도 경계를 넘으면 레짐 점수도 기존 점수 규칙에 따라 달라진다. 재현 입력(IV 등 기타 기여 0)은 근접 점수 0 → 5, 4.99%는 표시 5.0%여도 원시 값 기준 5점, 정확한 5%는 0점을 확인했다. `premium-metrics`의 점수도 공유 서비스 변경을 따른다.
- 확인 범위는 같은 입력의 `volatility.flipDistance`와 이를 재계산하는 Command 경로다. 서로 다른 시점·현물·플립 입력까지 같은 결과를 보장하지는 않는다.
- 전체 tsc·Next 빌드·운영 응답·브라우저 화면은 미확인이다.

## 관문 보완 — 2026-10-19

### 결과 요약

- 관문 기록 `gate-fix_nightly1019-gammaflip-dist-10191310.md`, 원 지시서와 밤 검토 항목 5를 전부 읽었다.
- 추가 원인: 딜러 감마가 `(현물 - 플립) / 플립`을 계산한 뒤 그 원시 값으로 `unstable`을 판정했다. 화면 재계산에도 같은 산식이 남아 있었다.
- 기존 `gammaFlipDistancePct`의 구현·서명은 그대로 두고, 아래 누락 경로를 이 함수에 연결했다. 근접 판정은 반올림 전 거리, 출력은 기존 자리수를 유지한다.
- 현물 103.05·플립 100 → 원시 거리 2.959728…%(두 자리 2.96%), 숏감마 `unstable=true`. 기존 한 자리 응답은 3.0%이며, 3.01%도 표시상 3.0%지만 `unstable=false`다.
- 현물 105.10·플립 100 → 원시 4.852521…%, 한 자리 응답·화면 4.9%, 두 자리 Command 상단 4.85%.
- 라벨·문구·자리수·레이아웃 변경 없음. 칸 숨김 없음. 커밋·push·배포·운영 데이터 접근 없음.

### 이번에 바꾼 파일과 호출자 영향

| 파일 | 영향 |
| --- | --- |
| `src/services/dealerGamma.ts` | 공통 거리로 응답과 `unstable` 판정. 호출자 전수 확인: `api/live/premium-metrics`는 두 필드를 반환하고 앱 dash가 거리·위험 안내에 사용. `guardian/unifiedDataStream`은 백분위·표본 수만 사용하므로 그 반환값 영향 없음 |
| `src/app/[locale]/app-view/flow/page.tsx` | DEX 점수, AI 입력의 `flipPercentage`, 개요 거리, 상단 거리 네 경로 연결 |
| `src/app/[locale]/app-view/cmd/page.tsx` | 이미 연결한 Command 점수 외에 상단 감마플립 거리도 연결 |
| `src/app/[locale]/dashboard/DashboardClient.tsx` | 감마플립 거리 막대 수치와 GEX Regime 재계산 연결 |
| `src/components/FlowRadar.tsx` | 거리·regime·pin weight 재계산 연결 |
| `src/components/mobile/MobileMetricsTab.tsx` | 모바일 웹 GEX 거리·regime·pin weight 재계산 연결 |
| `src/components/guardian/GammaShield.tsx` | 웹 상세 거리와 2% 강조 판정 연결 |
| `src/components/guardian/mobile/MobileGammaShield.tsx` | 모바일 개요·상세 거리와 2% 강조 판정을 같은 원시 거리로 연결 |
| `src/components/IVSkewCurve.tsx` | 2% 근접 판정 연결. 기존 번역 문구 유지 |
| `tests/gammaFlipDistance.test.js` | premium-metrics 실제 GET(모의 I/O), 딜러 경계값, 화면 실제 계산·조건·JSX 추출 회귀 추가 |
| `tests/gammaFlipDistanceGate.md` | 이번 보완의 원인·검색 범위·영향·검증 기록 |

### 전수 검색 범위

- `rg -n 'gammaFlip|flipDist|distance' src tests scripts` 및 소스의 플립 분모 직접 나눗셈 검색으로, 변수명이 `dist`, `diff`, `gfDiff`인 경로와 JSX 안의 계산까지 확인했다.
- 공통 함수 직접 호출 파일 15곳을 확인했다: 위 신규 연결 8곳, 기존 `optionLevelGate`, `volatilityRegime`, 변동성 API, unified API, `LiveTickerDashboard`, `MobileCmdMetrics`, 앱 Command. 기존 함수 구현을 바꾸지 않았으므로 이미 연결된 경로의 산식은 변하지 않는다.
- 기존 현물 분모인 별도 점수·선별 경로(`alphaEngineV2`, `rlsiEngine`, `DecisionGate`, ranking deviation, todayPicks select, marketing suggest/autopilot, `scripts/close-brief.mjs`)도 확인했다. 이들은 기존 점수·선별 계약을 유지했다.
- `MobileGuardianShield.distancePct`는 현물 대비 `(목표 - 현물) / 현물`로 지지·플립·저항의 방향을 함께 표현한다. 차트의 좌표·픽셀 간격, 레벨 유효성 ±15% 검사, 플립 가격 자체 산출도 거리 응답과 구분해 유지했다.

### 이번 시험과 결과

- `/usr/bin/lockf -k /tmp/signum-heavy.lock` 안에서 순차 실행. 다른 작업의 잠금 대기 중이던 최초 명령은 실행 전 중단했고, 완료된 무거운 시험 묶음은 반복하지 않았다.
- 신규 포함 감마 거리 회귀: 10/10 통과. premium-metrics 모의 GET, ±3% 경계·반올림 전후·롱감마, 105.10/100·103.05/100·플립 아래·정확한 0, 화면 점수 경계 및 Guardian 상세 수치를 포함한다.
- Command 관련 기존 회귀: 35/35 통과. Flow 관련 기존 회귀: 33/33 통과.
- `integrityAudit`: 경로 별칭 로더를 포함한 실행에서 33/33 통과. 첫 실행은 별칭 실행 설정 누락으로 시험 시작 전 실패했다.
- 최종 추가한 대시보드 거리 막대는 해당 화면 계산 시험만 선별 실행해 1/1 통과(나머지 9개는 재실행하지 않음).
- 공통 함수·딜러 서비스 한정 `tsc --noEmit --skipLibCheck --target ES2020 --module commonjs` 통과. 변경 소스 9개 `transpileModule` 구문 진단 오류 0건.
- 플립 분모 직접 나눗셈 전수 검색 후 거리 계산 잔존 0건 확인. `git diff --check` 통과.

### 남은 위험

- 현물 분모 적용으로 기존 경계 주변의 DEX 점수·pin weight·regime·근접 판정 결과는 달라질 수 있다. 경계·가중치 규칙과 번역 문구는 바꾸지 않았다.
- 서로 다른 시점의 현물·플립 입력 차이는 이번 산식 통일로 해소되지 않는다.
- 전체 tsc·Next 빌드·브라우저 화면·운영 응답은 확인하지 않았다.
