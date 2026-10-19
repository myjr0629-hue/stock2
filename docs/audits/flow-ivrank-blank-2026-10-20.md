# 앱 Flow IV 빈칸 수리 — 2026-10-20

## 결과 요약

- 확인: 화면에는 IV 표본 수 하한이나 `currentSession` 일치 게이트가 없다. `percentile` 필드도 정상적으로 읽는다. 서버가 정상 숫자를 반환하면 기존 표시식과 스퀴즈 계산식 자체는 동작한다.
- 확인·재현한 결함: IV 요청의 헤더 제한은 4,500ms인데 서버의 이력 조회 제한은 5,000ms다. 5,100ms에 도착하는 정상 응답을 기존 화면은 버린다. 요청 실패·비정상 HTTP 응답 때도 `setIvRankOverride(null)`을 실행해 지난 정상값을 지운다.
- 확인·재현한 결함: IV를 시세 조회 뒤에 시작하고 다른 보조 요청과 함께 기다린다. 앞선 다크풀/고래 JSON 처리가 실패하면 IV 반영까지 건너뛴다. 다른 요청이 대기 중이어도 IV 반영이 지연된다.
- 저장 사본 5종의 `flow.ivRank`는 모두 null이다. 별도 IV 응답을 놓치면 폴백으로 채울 수도 없다. FINRA 비중은 기존 규칙상 스퀴즈 입력에서 제외되므로 IV까지 사라지면 두 입력이 모두 결측이 되어 스퀴즈도 null이다.
- 수정: IV 요청을 시세와 동시에 시작하고 독립 반영한다. 제한은 8,000ms로 조정했다. 실패·잘못된 JSON·불완전 응답은 같은 종목·표시 정규장 세션의 정상본을 유지한다. 명시적인 원천 결측·수집 중 응답은 숫자를 지운다. 종목 전환·다음 정규장 개장·취소된 요청의 늦은 응답은 격리한다.
- 정의가 보장된 `/api/flow/iv-percentile.percentile`만 사용한다. 다른 객체의 `ivRank` 폴백은 제거했다. 원천 응답의 직전 `currentSession`이나 작은 `sampleSize`를 화면에서 다시 심사하지 않는다. 숫자 0은 보존하며 0~100 밖 값·문자·불리언은 채택하지 않는다.
- 스퀴즈 계산식·FINRA 제외 규칙·화면 라벨·문구·JSX 표시식은 변경하지 않았다. 유효한 IV가 들어오면 기존 계산식이 그 값을 사용한다. 양쪽 입력이 모두 없으면 기존 결측 표시를 유지한다.
- 구분: 02:1x 운영 요청의 네트워크 시간·예외 추적은 제공되지 않았다. 위 실패 경로는 코드와 오프라인 실행으로 확정했지만, 해당 운영 요청이 정확히 어느 경로를 밟았는지는 실측하지 못했다.

## 바꾼 파일과 영향

| 파일 | 변경 |
| --- | --- |
| `src/app/[locale]/app-view/flow/page.tsx` | IV 독립 조회·반영, 실패 시 정상본 유지, 종목/표시 세션 격리, API 백분위만 사용 |
| `tests/flowIvRank.test.ts` | 실제 페이지 fetch effect·파생식·IV/스퀴즈 JSX 표시식·설명 문장 실행, 저장 응답 재생 |
| `tests/flowIntegrity2.test.ts` | 실제 effect 실행 컨텍스트에 새로 사용하는 달력 함수 주입. 기존 기대값 유지 |
| `docs/audits/flow-ivrank-blank-2026-10-20.md` | 원인·검증 기록 |

공유 함수·API·데스크톱 웹은 수정하지 않았다. 기존 `shownRegularSessionDate`, `ivHistoryUnavailable`, `ivRankIsCollecting`을 그대로 호출한다. 앱의 동일 `ivRankVal`을 읽는 IV 카드·설명 문장·변동성 모드, 스퀴즈 점수와 이에 연결되는 종합 점수/AI 입력에 정상 숫자가 다시 전달된다. 점수 공식과 문턱은 유지했다.

## 돌린 시험과 결과

| 시험 | 결과 |
| --- | --- |
| 추가 시험의 변경 전 실행 | 초기 10건 중 6건 실패로 결함 재현; 사본 재생은 이 실행에서 제외 |
| `flowIvRank.test.ts` 최종 | 13/13 통과, skip 0. 지연 응답·다른 JSON 실패/대기·시세 대기·갱신 실패·종목 격리·금요일/주말/PRE/월요일 개장·세션 경계 도중 응답·원천 결측·수집 중·0%·잘못된 응답·취소 검증 |
| `ivRank.iv30.test.ts` | 13/13 통과 |
| `flowPcRatio.test.ts` | 13/13 통과 |
| `flowIntegrity2.test.ts` | 26 통과·7 실패. HEAD 원본도 같은 26/7, 실패 7개 이름·내용 일치. 기존 고래 결측 문구 `집계 관측 없음` 대 시험 기대 `—` 불일치 |
| `flowEmptyStates.test.ts` | 순수 검사 6건 통과. 로컬 HTTP 서버 시작 시 `listen EPERM 127.0.0.1`로 중단, 이어지는 HTTP 3건 미검증 |
| `appAccuracy2.test.ts` | 21건 통과 후 Intel 소스 정적 검사 314행 실패. HEAD 원본도 동일 위치 실패 |
| 전체 TypeScript | 아래 명령 1회 실행, 종료 코드 0, 진단 출력 0건 |

```text
/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --noEmit --incremental false
exit=0
stdout/stderr: empty
```

기존 시험 묶음과 HEAD 비교 묶음도 같은 공유 잠금으로 직렬 실행했다. HEAD 비교는 `git show HEAD:.../flow/page.tsx`를 임시 파일로 읽어 시험의 페이지 소스 읽기에만 주입했다. 작업 파일 롤백이나 시험 기대값 변경은 하지 않았다.

재실행 명령:

```sh
SNAPSHOT_DIR=/Users/eunhoon/Documents/signum-work/2026-10-19/reg-snapshots \
node node_modules/ts-node/dist/bin.js --transpile-only \
  -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' \
  tests/flowIvRank.test.ts
```

`SNAPSHOT_DIR` 미지정 시 외부 사본 재생 1건만 skip한다. 나머지는 저장소만으로 실행한다. 사본·환경 파일·의존성을 저장소에 복사하지 않았다. 로컬 검사 준비로 기존 의존성 디렉터리를 가리키는 `node_modules` 링크와 표준 Next 타입 참조용 `next-env.d.ts`를 만들었다(둘 다 gitignore 대상).

### 장중 저장 사본 재생

`ivp-*-2310.json`과 `ticker-*-2310.json`을 실제 페이지 effect에 주입하고 2026-10-19 정규장으로 시간을 고정했다. 숫자·IV 카드 표시식·설명 문장·스퀴즈 표시식을 확인했다.

| 종목 | 원천 percentile | 원천 currentSession | IV 표시 | 스퀴즈 표시 |
| --- | ---: | --- | --- | --- |
| TSLA | 99 | 2026-10-16 | 99% | 99% |
| SPY | 98 | 2026-10-16 | 98% | 98% |
| NVDA | 99 | 2026-10-16 | 99% | 99% |
| AAPL | 99 | 2026-10-16 | 99% | 99% |
| WTFC | null (`dynamodb-stale`) | 없음 | 미제공 | 미제공 |

이 사본은 사용자가 보고한 13:08 ET 응답(TSLA 89·NVDA 94)과 수집 시점이 다르다. 보고된 TSLA 89 응답 형태도 별도 픽스처로 검증했다. 사본의 숫자를 보고 시점의 운영 숫자로 단정하지 않는다.

로컬 상세 로그: `/tmp/flow-ivrank-before.log`, `/tmp/flow-ivrank-after.log`, `/tmp/flow-ivrank-existing-tests.log`, `/tmp/flow-ivrank-head-tests.log`, `/tmp/flow-ivrank-tsc.log`(컴파일러 진단이 없어 빈 파일).

## 남은 위험

- WTFC는 원천 자체가 stale/null이므로 이 수리로 숫자가 생기지 않는다. FINRA 비중으로 스퀴즈를 대신 채우지 않는다.
- 운영 요청의 정확한 실패 분기·실제 기기 렌더링은 미확인이다. 브라우저·운영 접근 없이 코드 재생으로 검증했다.
- 위 기존 시험 실패와 샌드박스의 로컬 서버 제한은 남아 있다. 관련 없는 화면·기대값을 고쳐 통과시키지 않았다.
- 커밋·push·main 병합·배포·운영 데이터 쓰기는 실행하지 않았다. `.env*` 및 계정 서비스에 접근하지 않았다.
