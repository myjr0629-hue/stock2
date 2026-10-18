# AI 사실 슬롯: 마이그레이션 1단계

설계 원문 `AI-GUARD-REDESIGN.md`(2026-10-18)의 **7절 1단계: 순수 계층**을 구현한다. 운영 연결은 2단계 이후다. 이 작업은 `fix/ai-weekday-index`의 정규식 패치를 가져오지 않는다.

## 원인과 이번 범위

자유문에서 지표의 소속·현물/선물·방향·시점과 요일의 역할을 복원하던 계약이 반복 회귀의 원인이다. 새 계층은 모델에 완성 문자열을 받지 않고, 서버가 소유한 사실 ID와 문장 템플릿 ID만 받는다.

- `factContract.ts`: 사실·계획·저장 스냅샷 버전. 지수/현물/선물, 신규 포지션, 실적/만기, 거래량 콜÷풋/OI 풋÷콜을 분리한다.
- `factAdapters.ts`: 명시적 원천·버전·관측시각·ET 기준일·단위를 보존한다. UC는 실제 `optionsDate`를 사용하며 생성시각이나 묶음 날짜로 메우지 않는다. 결측/잘못된 값은 사실로 만들지 않는다.
- `factPlan.ts`: JSON 중복 키, 잘림, 미지원 버전/템플릿, 자유 문자열·추가 필드, 중복 참조, 다른 기사/종목/스냅샷과 템플릿 타입 불일치를 검사한다.
- `factRender.ts`: 최종 출구에서 재검증 후 완결된 문장을 한국어·영어·일본어로 렌더링한다. 요일은 해당 날짜에서 계산한다. 지수명·현물/선물·등락률·방향·기준일·관측시각은 코드가 함께 결정한다. 반올림된 0은 보합으로 표시한다.
- `factCache.ts`: 네트워크 없는 저장 스냅샷 읽기/렌더링 어댑터다. 생성 당시 사실만 사용한다. 구형 완성 문자열을 새 검증본으로 승격하지 않으며 미지원 렌더러/스키마는 명시적으로 구분한다.

근거가 없거나 잘못된 사실은 해당 문장만 생략하며 나머지 사실 문장은 유지한다. 서버가 검토한 설명은 `TrustedExplanation` ID로 선택할 수 있다. 설명에 전제가 있으면 `requires`에 같은 스냅샷의 사실 ID를 명시한다. 전제가 없어진 설명은 함께 생략한다. 모델 자유문을 설명 카탈로그에 넣어 우회하면 안 된다.

이번 변경은 신규 순수 모듈·시험·문서만 추가한다. 기존 라우트, 화면 필드·라벨·레이아웃, 프롬프트, 캐시 키·TTL·재시도·보관 정책과 AI 공급자 사다리를 수정하지 않는다. 렌더러 문장은 향후 AI 문장 내용에 연결할 후보이며 현재 화면에는 반영되지 않는다. 추가 AI/API 호출이나 운영 쓰기는 없다.

## 호출 계약

1. 서버가 구조화 원천을 읽고 어댑터로 `FactBundle`을 만든다. 사실과 설명 카탈로그는 모델 출력에서 읽지 않는다.
2. 기존 한 번의 AI 호출에서 `{schemaVersion, itemId, blocks:[{templateId, factId}]}` 계획만 받도록 하는 것은 2단계 작업이다. 설명은 `{templateId:'explanation', explanationId}` 참조만 허용한다. 대상 필드 안에 임의 문자열 노드는 없다.
3. `renderFactPlan(plan, bundle, locale, trustedExplanations)`을 최종 출구에서 호출한다. 원시 JSON 문자열을 전달하면 중복 키도 검출된다. 먼저 일반 `JSON.parse`를 하면 이미 잃은 중복 키 정보는 복구할 수 없다.
4. 저장 시 `FactSnapshot`의 계획·원천 사실 스냅샷·스키마/렌더러 버전을 함께 보존한다. 읽을 때 `renderFactSnapshot`으로 재검증한다. 이 함수는 구형/미지원 저장본을 판별할 뿐 기존 카드나 필드를 숨기거나 재생성을 요청하지 않는다.
5. 렌더 결과에 AI 번역을 다시 적용하지 않는다. 프롬프트에서만 숫자·요일을 금지하는 방식으로 대체하지 않는다.

### 10190139 관문 수정: 방향별 원천 계약

- `ucPositionFact(meta, ticker, opening, side)`는 명시한 쪽의 `callContracts/callNotional` 또는 `putContracts/putNotional`만 사용한다. 콜·풋에 서로 다른 사실 ID를 부여해 각각 만든다. `newOiContracts/newOiNotional/newOiSide`는 양쪽 합계와 우세 방향이므로 더 이상 입력 근거로 사용하지 않는다. 방향별 원천이 없으면 합계로 대체하지 않는다.
- `ucRatioFact`의 거래량 입력은 live/ticker의 `volumePcrCallVol/volumePcrPutVol`이다. 공용 `lib/putCall.callOverPut`으로 C/P(콜÷풋)를 계산한다. 풋 거래량 0·결측이면 사실은 `null`이며 렌더하지 않는다. 원천이 양수인 실제 비율 10은 허용하고, 원천 없이 옛 `volumePcr=10`만 있으면 거절한다. 생산자가 거래량 0을 `null`로 보내는 경우에도 거절한다.
- P/C는 공용 정의와 앱 `flowPcRatio.putCallRatio`대로 풋÷콜이다. 기존 거래량 템플릿은 명시적으로 C/P이고, OI 템플릿은 P/C다. 문구·방향 판정·렌더러 계약은 유지한다. 새 어댑터는 옛 `volumePcr` 소비자가 아니므로 `putCall.test.ts`의 허용 목록에 예외를 추가하지 않으며, 이를 회귀 검사한다.
- 후속 운영 연결에는 최종 보정값뿐 아니라 방향별 포지션 집계와 원천 거래량이 필요하다. 현재 `MoneyData`의 합계만 넘기는 방식은 지원하지 않는다. 이번 작업은 운영 자료 전달 경로를 변경하지 않는다.

일반 JSON 모양 오류는 계획 전체를 거절한다. 구조가 정상인 계획의 결측/범위/타입 오류는 해당 문장만 거절하고 `issues`를 남긴다. 호출자는 `issues`나 빈 문자열을 이유로 일반 GET에서 즉시 AI를 재호출하면 안 된다. 호출량 제한·기존 검증본 재사용은 후속 운영 연결에서 구현해야 한다.

## 현재 호출자 전수 확인과 영향

`ucPositionFact`의 실행 호출자는 `tests/factSlots.test.ts`, `ucRatioFact`는 해당 시험과 `tests/putCall.test.ts`뿐이다(`src`·`tests` 전수 검색). 두 공유 어댑터의 입력 계약 변경은 이 호출자에 반영했다. `validFact`는 `factPlan.ts`의 최종 검증에 쓰이며 동작은 유지했다. `renderFactPlan`의 직접 호출자는 `factCache.ts`와 `factSlots` 시험이다. 공용 비율 함수·운영 라우트·렌더러는 수정하지 않았다. 다음은 후속 연결 시 함께 전환해야 할 현재 직접 호출자다.

| 함수/자료 | 직접 호출자와 경로 |
|---|---|
| 뉴스 `guardItems` | `guardian/news-digest/route.ts`: 생성 응답 변환·일반 캐시 응답·누적. pace 조기 반환·실패 대체 등은 별도 경로이므로 후속 단계에서 함께 연결해야 함 |
| 뉴스 `toArchiveItem`, `docItems` | `lib/news/pulseArchive.ts`: 보관 변환·기존 문서 병합·읽기; `guardian/news-archive/route.ts`: 보관본이 없을 때 다이제스트 대체 |
| 다이제스트 직접 독자 | `cron/warm-news-digest/route.ts`, `services/breaking/whyBuilder.ts`, `guardian/news-archive/route.ts` |
| 구형 다이제스트 키 직접 독자 | `lib/marketing-v2/core/data.ts`, `admin/content-gen/route.ts`, `cron/daily-content/route.ts`는 버전 없는 `guardian:news:digest` 키를 읽음. 현재 v2 생성 키와 다르며 키 중앙화 시 별도 확인 대상 |
| `ucNumberProblems` | `undercurrent/shared.ts`의 `enforceLean`, 옵션 재조정 후 문장 검사; 생성·SWR/캐시·종목 `nogen` 반환에 영향 |
| `buildSystem`, `storyPayload`, `enforceLean` | UC `feed/route.ts`, `ticker/route.ts` |
| `ucCardsGate` | UC 피드·종목·매크로 |
| `invokeJSON` | UC 피드·종목·매크로, `shared.enforceLanguage` 번역, WIM today, `services/disclosures.ts` |
| `serveSWR` | UC 피드·종목·매크로, 배당, WIM today/lab |
| `buildWhyContext`, `buildWhyText` | `cron/breaking-detect/route.ts`의 생성·저장, `guardian/breaking/route.ts`의 미리보기; 일반 조회는 저장된 `copy/context`를 읽음 |

현재 브랜치에는 보류 브랜치의 `indexFacts.ts`/`guardIndexClaims`/`ucWeekdayProblems`가 없다. 이를 현재 호출자로 오인하지 않았다. 급변동은 이미 저장된 뉴스 문장을 조립하므로 생성기만 바꾸면 기존 `copy/context`의 일반 조회는 전환되지 않는다.

## 시험과 확인 범위

`tests/fixtures/ai-guard/weekday-index-gates.json`에는 지정 보고서 8개의 번호 지적 31건과 원문 변형을 기록했다. 각 문장은 새 계획 계약으로 들어오지 못함을 시험한다. 정상/오류 자유문을 다시 분석해서 허용하는 시험이 아니다. 구조화 사실로 바꾼 계획의 각 문장 대상·값·방향·요일과 3언어 정보 보존은 별도 불변식 시험으로 확인한다. 보고서에서 원문 전체 없이 단어로만 언급한 변형은 해당 구절 또는 명시적으로 구성한 변형을 넣었다.

시험: `factSlots` 45건. 구조화 원천/기사 내 검토 사실 분리, 현물/선물·Composite/NDX/VIX 분리, `%`와 미지원 단위 거절, 부호/반올림 0, 비율 종류와 0, 세 날짜 역할, DST/ET-KST 경계·잘못된 날짜, 결측 문장만 생략, 설명 전제, 계약 공격, 저장 왕복과 구형 판별을 포함한다. 관문 재현은 콜 60계약·$600k/풋 40계약·$400k의 양쪽·단독 선택과 3언어 렌더링, 분모 0·결측·옛 대체값 10 거절, 실제 10 허용을 무네트워크 시험으로 고정했다. `putCall`은 새 어댑터와 앱의 공용 C/P 계산 일치·P/C 역수 관계·옛 필드 소비자 센서스를 검사한다. 날짜 경계 시험은 입력 날짜를 보존하는 시험이며 거래일을 새로 추정하지 않는다. 휴장 판정이나 영업일 보정은 이번 계층에 없다.

두 재호출 지적(`10181402 #1`, `10181901 #1`)은 fixture에 후속 작업으로 표시했다. 실제 GET·공급자 호출 수, 보관 API·급변동 API 출구 일관성을 실행 검증했다고 주장하지 않는다. 순수 모듈에는 네트워크·AI·캐시 접근이 없으며 기존 생성·캐시 경로를 변경하지 않았다.

실행 예시(로컬 node_modules가 없는 작업공간):

```sh
NODE_PATH=/Users/eunhoon/.gemini/antigravity/scratch/stock2/node_modules \
/usr/bin/lockf -k /tmp/signum-heavy.lock \
/Users/eunhoon/.gemini/antigravity/scratch/stock2/node_modules/.bin/ts-node \
-r tsconfig-paths/register \
-O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"typeRoots":["/Users/eunhoon/.gemini/antigravity/scratch/stock2/node_modules/@types"]}' \
tests/factSlots.test.ts
```

## 남은 단계와 위험

- **2단계:** UC 자금·세션 문장을 실제 생성·캐시·`nogen`에 연결. 안정 ID로 결합하고 참조 사실 전체/계약 버전을 재사용 서명에 반영. 종목의 EOD·구조·옵션 최종 보정과 상위/카드별 money 동기화 뒤 렌더링. 같은 기존 AI 호출에서 계획을 생성.
- **3단계:** 기사별 독립 검증/구조화 원천 계약과 전체 표시 필드 연결. 기사 장중값을 최신 종가로 덮지 않음. 원문만 있는 기사에 대한 의미 인증은 미해결이다.
- **4~5단계:** 보관 변환·읽기·다이제스트 대체, 급변동 저장·일반 조회 모두 연결. 구형 항목 재구성, 마지막 정상본/재시도 제한을 운영 세션에서 전환. 일반 GET에서 재생성 폭주 금지.
- **6단계:** 전체 소비자 전환과 회귀가 끝난 뒤 기존 정규식 검사를 제거.
- 지원 범위는 신규 포지션·일정·지수·옵션 비율이다. 가격대 거리/파생 의존성 그래프, AIQ 전체 자료, `%p`/`bp`의 새 문장, 기사 인과 해석과 일반 자유문 번역은 이번 범위 밖이다. 미지원 수치를 다른 단위로 렌더링하지 않는다.
- 원천 값·날짜 자체의 오류, 설명 카탈로그의 잘못된 검토는 이 계약이 자동 인증하지 못한다. 스냅샷 출처는 호출자가 보장해야 한다. 아직 운영 경로에 연결되지 않아 기존 사용자 문장의 오류는 이 커밋만으로 바뀌지 않는다.
