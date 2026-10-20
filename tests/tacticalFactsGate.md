# Tactical 언어 간 사실 방향 수리 검증

- 작업 기준: `fix/ai-cross-lang-facts`, HEAD `97ecacf68`.
- 합성 고정 입력과 모의 모델/저장소로 검증했다. 운영 문장·운영 데이터·실제 모델 응답을 수집한 결과가 아니다.
- 모델 실호출, 운영 데이터 쓰기, 브라우저 접근, 화면/라벨 수정, 커밋/push/병합/배포는 하지 않았다.

## 확인한 원인

기존 `claimChecks.directionSignReasons`는 출력에 부호가 붙은 변화량이 있을 때만 문장 내부의 부호와 방향어를 대조했다. 숫자 없는 `금리 상승`/`yields fall`/`金利下落`은 입력의 `us10yChangeBp`와 비교하지 않았다. 한 번에 세 언어를 요청하는 프롬프트만으로는 이 반전을 막지 못했다. 교정도 전체 JSON을 다시 요청해 정상 언어까지 바꿀 수 있었다.

## 변경과 공유 호출자 영향

| 파일/공유 함수 | 실제 호출자와 영향 | 검증 |
| --- | --- | --- |
| `src/lib/ai/tacticalFacts.ts` (신규) | 입력 숫자의 값/부호/절댓값/방향/ET 기준일, 뉴스 식별자/발행시각/명시 방향, 일정 UTC 절대시각/정확도/예정 여부를 순수 함수로 구성한다. 수준값의 방향은 null, 변화량의 0만 flat이다. TLT로 금리를 역산하지 않는다. 우려/예상 뉴스는 관측 방향으로 승격하지 않는다. | `tacticalFacts.test.ts` |
| `tacticalPrompt.buildTacticalPrompt` | `IntelligenceNode.generateRealityInsight`가 facts를 한 번 구성해 ko/en/ja와 교정에 공유한다. `unifiedDataStream.currentTacticalPrompts` 및 신규 판정 복구용 프롬프트도 같은 빌더를 쓴다. 원 관측 기준일과 일정 재검사 시각을 분리했다. | 동일 FACTS 3개, 날짜/시간/수준/방향 시험, `tacticalCache.test.ts` |
| `tacticalPrompt.checkTacticalOutput`, `checkTacticalStored` | 실제 소스 호출자는 `IntelligenceNode.gateText` 한 곳이다. 생성뿐 아니라 메모리/Redis/세션 보관/번역/판정 복구/이전 정상본 보존에도 현재 facts와 방향을 대조한다. facts의 해시·UTC 발행시각·절댓값은 기존 숫자 근거에 섞지 않는다. | 생성/저장/번역 반전 거부, TTL/경과 일정 회귀 |
| `IntelligenceNode.generateTrilingualOnce` | `produceInsightOut`를 통해 Tactical(reality), rotation, gamma가 호출한다. Tactical은 실패 언어만 교정 요청·검사하고 통과 언어는 고정한다. 교정 응답에 다른 언어가 끼어도 무시한다. 재실패 시 같은 언어의 검사 통과 직전 정상본으로 복구하고 나쁜 글을 저장하지 않는다. rotation/gamma의 기존 전체 교정/출구 계약은 유지했다. | 언어 1개/2개만 실패, 정상 ko 보존, 부분 JSON 검증, 정상본 보존, 기존 출구 스크립트의 rotation/gamma 사례 |
| `unifiedDataStream.currentTacticalPrompts` | 호출자는 `guardVerdictOnExit(snapshot)`와 `computeGuardianSnapshot`의 저장 판정 복구다. 기존 GNums에는 금리 bp가 없어, 동일 응답 market 또는 공유 core.market에서 기존 bp 계산 함수를 사용해 보충했다. | 실제 `getGuardianSnapshot` 출구에 market 금리 +6/-6bp 주입: 정상 상승 보존/반전 거부, 모델 호출 0 |

`evidenceTime.ts`, `claimChecks.ts`, `cachedEvidence`는 수정하지 않았다. `cachedEvidence`를 공유하는 `watchlistAiLineService`의 계약도 그대로이며 기존 AI 깊이 시험에 포함했다. UI 파일은 변경하지 않았다.

## 시험 결과

모든 실행 시험과 타입 검사는 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 직렬화했다. 전체 타입 검사는 한 번 실행했다.

| 실행 대상 | 결과 |
| --- | --- |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | exit 0, 진단 없음 |
| `tests/tacticalFacts.test.ts` | 11 통과 |
| `tests/tacticalCache.test.ts` | 26 통과, 0 실패 |
| `tests/aiDepthMacro.test.ts` | 36 통과, 모델/네트워크/캐시 호출 0 |
| `tests/guardianNumbers.test.ts` | 22 통과 |
| `tests/guardianCore.test.ts` | 35 통과 |
| `scripts/test-insight-gate.ts` | 103 통과, 기존 실패 2 |
| `git diff --check` | 통과 |

TS 시험 실행기는 설치된 `ts-node`와 `tsconfig-paths/register`를 사용했다. 옵션은 `--transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}'`이다. 의존성은 원 저장소의 node_modules를 연결했다.

별도 기존 스크립트의 실패 2건은 S7의 일본어 마크다운 정리/재시도 없음 검사다. 예문의 `7,500`이 기존 `tactical:orphan-number`에 걸린다. `git show HEAD:<file>`로 수정 전 tacticalPrompt/intelligenceNode를 임시 메모리 모듈에 로드해 동일 스크립트를 실행했으며 **기준본도 103 통과/같은 2 실패**였다. 작업 파일을 되돌리거나 기존 검사를 약화하지 않았다.

## 남은 위험/확인 범위

- 방향 검사는 닫힌 다국어 사전과 절/주어 결합 규칙이다. 사전 밖 표현이나 복잡한 문장 의미 전체를 증명하지 못한다. 조건/미확인/부정 및 다른 주어의 약화는 별도 회귀 사례로 확인했다.
- 원천 id가 없는 기존 뉴스 문자열에는 출처·발행시각·내용의 SHA-256 일부를 안정 식별자로 쓴다. 공급사 원본 id를 새로 조회하지 않았다.
- 정확한 시각이 없는 AMC/BMO 일정은 기존 경계 순간과 `exact: false`를 함께 전달한다. 경계를 정확한 발표 시각으로 바꾸지 않는다.
- 실모델의 문장 품질·운영 적용 결과는 미검증이다. 현재 화면의 문구/표시 형식과 기존 대기 문구는 변경하지 않았다.
