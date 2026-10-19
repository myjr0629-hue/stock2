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
