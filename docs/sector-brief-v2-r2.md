# 섹터 AI 브리프 v2 관문 보류 수리

## 기준과 병합 상태

- 작업 브랜치: `feat/ai-sector-brief-v2`, HEAD `360d642e29883ab0689f2c1d0f807776b6377c3b`.
- 이전 지시서·보고와 `gate-feat_ai-sector-brief-v2-10240502.md`를 먼저 읽었다.
- `git fetch origin`: `FETCH_HEAD` 쓰기가 `Operation not permitted`로 실패했다.
- `git merge --no-commit origin/main`: `ORIG_HEAD.lock` 쓰기가 같은 권한 오류로 실패했다. 병합은 이루어지지 않았다.
- 기존 로컬 `origin/main`은 `08c7d8bb0e575ef8668fa5608ef8d2ea5be6ba43`이며 `51a0deea6`을 포함한다. 원격 최신 여부는 확인하지 못했다.
- 권한 우회·커밋·push·운영 병합·배포·운영 쓰기·환경 파일 읽기·브라우저 접근은 하지 않았다.

## 재현과 원인

NVDA +6%, TSLA -2%, 7종목 중 상승 1·하락 5·보합 1인 동일 입력으로 순수 함수를 실행했다.

| 관문 원문 | 옛 검사 | 수정 전 새 검사 | 원인 |
|---|---|---|---|
| 정규장 NVDA 8%p 우위, TSLA와 큰 격차로 선별 강세 확인 | 통과 | `stock-number:NVDA` | 종목 바로 뒤의 `%p`를 `%` 등락률로 읽음 |
| 정규장 모든 종목 중 NVDA만 상승, 나머지는 보합 또는 하락 확인 | 통과 | `breadth-contradiction` | `모든 종목.*상승`이 범위 표현과 부분 상승까지 전체 상승으로 읽음 |

## 변경과 호출자 영향

`checkSectorBriefNew`의 직접 종목 수익률 검사에서 `%p`·`% points`·`%포인트`·`%ポイント`를 격차 단위로 구분했다.
전체 참여 검사는 한국어·일본어에서 전체 종목 주어 바로 뒤에 상승·하락을 서술할 때만 적용한다.
정상 글을 과하게 거부하지 않는 쪽으로 판정 범위를 좁혔다. 직접 종목 수치·부호 오류와 명백한 전체 참여 모순은 계속 거부한다.

| 호출자 | 영향과 시험 |
|---|---|
| `sectorBriefBatchGate` → sector-headlines cron의 생성 사다리 관문 | 정상 격차·부분 참여 문장이 10섹터 중 3개여도 배치가 통과하는 회귀 시험 |
| `selectSectorBriefOutput` → 같은 cron의 최종 언어별 채택 | 위 배치의 10섹터·3언어 모두 채택되는 회귀 시험, 기존 언어별 부분 채택 시험 |
| 비교 도구 `compareStored` | 생성 검사 진단만 완화. 옛/새 서빙 검사는 기존 존재 검사 유지, 기존 비교 시험 |
| 비교 도구 `liveCompare` | 새 생성 비교만 수정 판정 사용. 옛/새 각 3회·3언어 mock 비교와 호출 수 시험 |
| snapshot·money-map 저장본 소비 | 코드 변경 없음. 기존 문장 복구·언어별 원본 유지 시험 |

프롬프트·공급사 호출 코드·재시도 수·저장본 및 복구 검사·화면 라벨·문구·배치·칸 크기는 변경하지 않았다.
회귀 시험의 문자열은 작성한 시험 입력이며 실제 운영 글이나 실모델 출력으로 제시하지 않는다.

## 검증

- 수정 전 순수 함수 재현: 관문 2건 모두 옛 검사 통과·새 검사 오탈락 확인.
- 수정 후 `sectorBriefV2.test.cjs`: 14/14 통과. 3언어 격차·부분 상승/하락, 실제 수치 오류, 전체 참여 모순, 10섹터 배치·채택, 복구·비교 경로 포함. 격차 단위에도 재료에 없는 숫자는 계속 거부하는 시험을 포함했다.
- `krEveningRefresh.test.ts`: 17/17 통과. 외부 공급사·캐시를 mock하여 생성 호출 수와 실패 시 기존 저장본 보존을 확인했다.
- `moneyMap.test.cjs`: 74/74 통과.
- 위 단일 파일 시험은 환경 파일·외부 통신 차단 preload를 적용했다. 소요 시간은 각각 약 1초·수초·2초인 개별 시험이다.
- 전체 오프라인 시험과 전체 타입 검사를 `/usr/bin/lockf -k /tmp/signum-heavy.lock` 아래 직렬 요청했으나, 다른 작업공간 `fix-close-dry-date`의 `lockf`가 계속 잠금을 보유했다. 작업 본문은 시작되지 않았으며 대기를 중단했다. 전체 오프라인 시험·tsc 결과는 미확인이다.
- 현재 브랜치 시험 파일 297개 중 지정 제외에 해당하는 파일은 `earningsScenario.test.cjs`, `giftShareGate.test.ts`, `readCheck.test.cjs` 3개다. `tacticalV3Compare`는 현재 브랜치에 없으며 main 병합 후 제외해야 한다.
- `git diff --check`: 통과. 수정 파일과 새 인계 문서는 diff로 실제 저장 여부를 확인했다.
- 로그: `.logs/sector-brief-v2-r2/sectorBriefV2.log`, `krEveningRefresh.log`, `moneyMap.log`, `verification.json`.

## 남은 위험

Git 메타데이터 쓰기 권한으로 fetch·main 병합이 미완료다. 최신 main 통합 후 충돌 확인, 지정 4개 제외 전체 오프라인 시험, 전체 tsc 0 확인이 남는다.
실모델 호출·운영 저장본 수집은 하지 않았으므로 실제 발생 빈도와 운영 3언어 전후 예시는 미측정이다.
