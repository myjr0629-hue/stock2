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

## 관문 보류 수정 (2026-10-20)

수정 전 고정 입력 `us10yChangeBp=+6`으로 두 지적을 재현했다. `하락한 금리`와 `下落した金利`는 사유 없이 통과했고, 당일 뉴스에 있는 `Policy rates are lower after the decision`은 `us10yChangeBp:up:down`으로 거부됐다.

- 앞 수식 방향어를 언어별 관형 어미로 뒤 주어에 연결한다. 기존의 주어 뒤 방향어·다른 주어 경계·조건/부정 검사도 유지한다. 세 언어의 up/down/flat 조합과 복수 지표, 생성/저장 완성 문장을 시험했다.
- 정책금리 전체 이름을 별도 `policyRateChange` 사실로 추출한다. 전체 이름 안의 일반 `rates`/`금리`/`金利` 중복 매칭을 제거해 10년물에 잘못 연결하지 않는다. 정책금리는 당일 뉴스의 명시 방향으로 검증하며, 근거 부재·정책금리 반전·10년물 반전은 계속 거부한다.
- 기존 출구 스크립트 S7의 마크다운 시험 예문은 숫자 주어 사전에 없는 `支持線` 때문에 수정 전부터 두 검사가 실패했다. `orphanNumberReasons`로 이를 재현한 뒤 예문만 기존 사전의 동의어 `サポート`로 보정했다. 숫자 검사나 제품 문구는 바꾸지 않았다.

공유 함수 호출자 전체를 다시 검색했다. `directionClaims`의 두 호출자는 `buildTacticalFacts`의 뉴스 추출과 `tacticalFactReasons`의 출력 대조다. 외부 경로는 `IntelligenceNode.generateRealityInsight` 및 `buildTacticalPrompt`의 facts 구성, `checkTacticalOutput`/`checkTacticalStored` → `IntelligenceNode.gateText`의 생성/저장/복구 검사다. `unifiedDataStream`의 현재 판정/스냅샷 출구도 동일 프롬프트 빌더를 사용한다. 호출부 인터페이스는 유지했다.

| 실행 대상 | 이번 결과 |
| --- | --- |
| `tests/tacticalFacts.test.ts` | 15 통과 (기존 11 + 관문 회귀 4) |
| `tests/tacticalCache.test.ts` | 30 통과 (기존 26 + 관문 회귀 4), 0 실패 |
| `tests/aiDepthMacro.test.ts` | 36 통과 |
| `tests/guardianNumbers.test.ts` | 22 통과 |
| `tests/guardianCore.test.ts` | 35 통과 |
| `scripts/test-insight-gate.ts` | 105 통과, 0 실패 (S7 예문 보정 포함) |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | 잠금 아래 1회 실행, exit 0, 진단 없음 |
| `git diff --check` | 통과 |

생성/캐시 시험은 모델·Redis·세션 보관을 메모리 모의 구현으로 대체했다. 관문 회귀에서 ko/ja 반전만 교정하고 정상 en을 보존하며, 반전 저장본은 거부하고 정상 정책금리 보도는 교정 없이 생성/메모리/콜드 스타트 저장본 재사용함을 확인했다. 시험 묶음은 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 직렬 실행했다.

남은 위험은 닫힌 방향어/주어 사전과 관형 어미 밖의 표현이다. 여러 국가의 정책금리나 복잡한 문장의 의미 전체를 증명하지 않는다. 실모델·운영 결과는 미검증이며, 모델 실호출·운영 쓰기·브라우저 접근·화면 변경·커밋/push/병합/배포는 하지 않았다.

## 세 번째 관문 보류 수정: 부정·조건 fail-closed (2026-10-20)

원 과제와 `gate-fix_ai-cross-lang-facts-10201913.md`를 읽고 목적을 유지했다. 원인은 `directionClaims`의 일부 부정 어형만 판별하는 규칙과, 조건 표지가 있으면 방향 추출 전에 절 전체를 건너뛰는 처리였다.

- 같은 절에 금리/수익률 이름·방향어·지정된 부정/조건 표지가 함께 있으면 `unverifiable`로 기록하고 출력 전체를 거부한다. 부정 의미를 반대 방향으로 계산하지 않는다. 사실이 up/down/flat/미확인 중 어느 것이어도 같은 규칙이다. 전치 수식형과 먼 주어도 이 규칙을 우회하지 못한다.
- 접속어(`and`, `if` 앞 공백, `으며`, `고`, `したが`, `しており` 등)와 문장 부호로 절을 나눈다. 조건절 밖 관측절은 계속 대조하므로 `금리는 하락했으며 감마가 약한 경우 충격 흡수력이 제한적입니다`는 +6bp 사실과 반대로 판정해 거부한다. 앞 절이 상승이면 뒤 감마 조건절만으로 거부하지 않는다.
- 뉴스에서도 판정 불가 방향을 사실로 승격하지 않는다. 정상 정책금리 보도는 기존처럼 10년물과 별도 사실로 검증한다.
- ko/en/ja 생성 지시 각각에 금리·수익률 방향을 입력 사실 그대로 긍정 평서문으로 쓰고 부정·조건문을 피하라는 한 줄을 추가했다. 화면 라벨·고정 문구·표시 코드는 수정하지 않았다.

공유 함수 호출자를 전체 검색했다. `directionClaims`는 `buildTacticalFacts`(뉴스 방향 추출)와 `tacticalFactReasons`(문장 검증)가 호출한다. `buildTacticalFacts`는 `buildTacticalPrompt` 기본 인자와 `IntelligenceNode.generateRealityInsight`에서 사용한다. `tacticalFactReasons`는 `tacticalPrompt.tacticalFactsCheck`를 통해 생성/저장 검사 양쪽에 적용되며 실제 서비스 호출자는 `IntelligenceNode.gateText`다. `buildTacticalPrompt`는 `generateRealityInsight`, `unifiedDataStream.currentTacticalPrompts`, 저장 판정 복구 경로에서 사용한다. 외부 함수 인자는 바꾸지 않았다.

| 실행 대상 | 결과 |
| --- | --- |
| `tests/tacticalFacts.test.ts` | 20 통과: 부정 상승/하락 6문장, 지정 표지 전체, 뒤 조건절 앞 관측, 3언어 정상 평서문/정책금리, 뉴스 추출, 생성/저장 출구 |
| `tests/tacticalCache.test.ts` | 49 통과, 0 실패: 부정 6문장과 3언어 조건절 사례의 생성 교정/저장본 거부, 교정 재실패 시 정상본 보존 포함 |
| `tests/aiDepthMacro.test.ts` | 36 통과 |
| `tests/guardianNumbers.test.ts` | 22 통과 |
| `tests/guardianCore.test.ts` | 35 통과 |
| `scripts/test-insight-gate.ts` | 105 통과, 0 실패 |
| 전체 타입 검사 `tsc --noEmit --incremental false` | 잠금 아래 1회, exit 0, 진단 없음 |

6개 묶음 총 267건 통과. 실행 시험과 타입 검사는 `/usr/bin/lockf -k /tmp/signum-heavy.lock` 아래 직렬 실행했다. 캐시 회귀 예문은 감마 문장을 유지하고 방향 사유만으로 탈락하는지도 검증해, 다른 형식 오류로 탈락한 것을 성공으로 세지 않는다. 모델·Redis·세션 보관은 기존 모의 구현만 사용했다. 타입 검사·대형 시험 묶음은 반복하지 않았다.

남은 위험: 닫힌 이름·방향어·접속어 사전 밖 표현은 미검증이다. 같은 절의 부정/조건 표지를 보수적으로 거부하므로 문맥상 맞는 부정문도 의도적으로 탈락한다. 실모델의 거부율·문장 품질과 운영 결과는 측정하지 않았다. `.env*` 읽기, 모델 실호출, 운영 쓰기, 브라우저 접근, 커밋/push/병합/배포는 하지 않았다.
