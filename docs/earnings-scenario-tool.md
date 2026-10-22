# 실적 옵션 가격 시나리오

## 결과 요약

새 공개 웹 경로 `/[locale]/tools/earnings-scenario`(ko·en·ja)에만 계산기를 추가했다. 기존 앱·영수증·read-check·내비게이션·API는 수정하지 않았다. 설계 기준은 `/Users/eunhoon/Documents/signum-work/growth/diff-research/1022.md` 전체, 특히 ③-1이다. 연구의 AI 해설 제안 대신 이번 지시대로 결정적 클라이언트 계산만 사용한다.

사용자는 대형주·ATM 콜/풋 매수 1계약을 고르고 주가 변화·IV 변화(%p)·관측 종가부터 경과한 달력 일을 조작한다. 결과는 USD/주 이론가와 USD/100주 계약 손익이다. 면책 문구, 배당·미국형 조기행사 무시, 금리 연 4% 고정 가정, 순서에 따른 분해와 기준 가격 차이를 3언어로 제공한다. 앱 연결은 `https://www.signumhq.com/app?from=scenario_<locale>`다.

## 확인한 원인과 자료 경로

- 기존 `intrinioClient.ts`는 원본 theta·vega 결측을 호환 필드에서 0으로 채운다. `_intrinio.eod`도 IV·gamma만 보존한다. 수집기 슬림 체인 역시 theta·vega를 보존하지 않는 경로가 있다. 따라서 슬림 필드의 0으로 원본 완전성을 증명할 수 없다.
- 새 도구는 공급사 원본 `option`·`prices`를 검사한다. delta·gamma·theta·vega 중 결측·문자열·비유한 값이 있으면 해당 계약을 계산하지 않는다. 실제 숫자 0은 보존한다. 양쪽 마감 호가와 IV도 필수다.
- 일정은 웹 `/earnings-week`와 같은 `CONFIRMED_EARNINGS`만 쓴다. 당일·과거·미확정 종목은 후보에서 제외하고 공급사 추정일로 대체하지 않는다. 캐시 읽기 1차: `intrinio:eod:snapshot`, `earnings:implied:v1`, 확정 후보의 공급사 만기 목록 공유 캐시. 추정 일정 캐시는 읽지 않는다.
- 첫 만기는 부분 체인에 남은 날짜로 추정하지 않고 공급사의 실제 전체 만기 목록에서 고른다. 장전은 발표 당일 만기를 허용하고 장후·시각 미정은 발표일 다음 만기부터다. ATM은 같은 세션 현물 종가와 가장 가까운 행사가(동률이면 낮은 행사가)이며 5% 이내다. 자료가 빈 ATM을 다른 행사가나 먼 만기로 바꾸지 않는다. 원본 페이지가 잘렸으면 계산하지 않는다.
- 2차 MGET: `intrinio:resp:v1:options/chain/<종목>/<만기>/eod::{}` 및 같은 현물 세션 날짜를 지정한 키. 옵션 최신판이 주식 EOD보다 먼저 갱신되면 현물 종가 세션을 `date`로 지정한 원본을 읽어 혼합 세션을 피한다. 기존 원본 공유 캐시 수명은 60초라 캐시만 의존하면 지속 사용을 보장할 수 없다. 결측이면 인증된 Intrinio GET만 호출한다. 기존 어댑터는 조회 후 Redis에 쓰므로 호출하지 않는다.
- 공급사 읽기 상한은 한 스냅샷 최대 24회(12종목 × 만기/체인), 동시 3회, 개별 최대 4초·전체 공급사 예산 8초, 재시도 0이다. 401·403·429 뒤 새 공급사 조회를 중단한다. 인증 URL·오류 원문은 출력하지 않는다. 이 상한은 서버 인스턴스별이며 전역 호출 상한을 뜻하지 않는다.
- 후보는 AAPL·MSFT·AMZN·META·NVDA·GOOGL·TSLA·AMD·AVGO·NFLX·INTC·JPM 중 회사 공지로 미래 발표가 확정된 종목이다. 양쪽 계약과 기본 IV 가정이 완전한 종목 우선으로 최대 5개를 표시하며, 확정 후보의 원본 자료 결측은 자료 부족으로 유지한다. 확정 후보가 5개 미만이면 미확정 종목으로 채우지 않는다. 사용자 입력을 운영 조회 키에 넣지 않는다.
- EOD 현물과 원본 체인은 같은 세션이어야 하고 7일 이내다. 예상 변동 묶음도 같은 발표·만기·세션의 EOD 값만 받는다. 묶음이 없으면 원본 ATM 콜·풋 중간 호가 합/현물이라는 기존 운영 예상 변동 정의를 적용한다. 원본 가격 결측을 보간하는 경로는 없다.
- 새 스냅샷에만 Next 5분 캐시·같은 인스턴스 동시 미스 병합을 사용한다. 운영 Redis·DB·외부 API 쓰기와 AI 호출은 없다.

## 계산과 표시

Black-Scholes 유럽형 전체 재평가, 배당 0·연복리 금리 4% 고정 가정·ACT/365다. 만기 시 내재가치이며 DST·조기폐장은 기존 ET 달력을 읽는다. 방향 → IV → 시간 순서로 재평가하고 인접 이론가의 차이를 각 효과로 계산한다. 뒤 요인에 상호작용이 포함되므로 순서 의존적이다.

`방향 효과 + 변동성 효과 + 시간 효과 = 최종 BS − 시작 BS`

`표시 손익 = 위 합 + (시작 BS − 운영 시작 가격)`

두 식 모두 계약당 100주를 적용한다. 운영 시작 가격은 원본 양쪽 마감 호가의 중간값이며 체결가로 주장하지 않는다. 금액은 표시할 때만 센트로 반올림한다.

기본 IV 하락은 운영 예상 변동 m(%), 두 계약 평균 IV σ(연율 소수), 잔존연수 T에 대해 `100 × (sqrt(σ² − min(0.95σ², (m/100)²/T)) − σ)` %p다. 분산 제거의 교육용 가정이며 사후 IV 예측이 아니다. 각 다리 IV 하한은 1%다. 기본 시간은 장전 당일 종가, 장후·시각 미정은 다음 달력 일 종가까지이며 정확한 발표 직후 체결 시각이 아니다.

## 바꾼 파일

- `src/app/[locale]/tools/earnings-scenario/{page.tsx,ScenarioClient.tsx,og/route.tsx}`: 공개 SSR·클라이언트 계산·1200×630 OG. 기존 read-check/영수증 카드·다크 토큰·44px 조작·375폭 구성을 재사용했다.
- `src/lib/earningsScenario/{model.ts,snapshot.ts,copy.ts}`: BS·분해·원본 검사·선택·3언어 문구.
- `src/services/earningsScenarioService.ts`: 읽기 전용 자료 경로·상한·5분 캐시.
- `src/lib/seo/sitemap.ts`: 2142/read-check 방식으로 신규 3언어 URL·hreflang·x-default 추가. 기존 항목은 유지한다. 공유 함수 `buildSitemap`의 제품 호출자는 `src/app/sitemap.ts`, `src/app/sitemap-ko.xml/route.ts` 두 곳이며 각각 신규 3개·한국어 1개만 늘어난다.
- `tests/earningsScenario.test.cjs`: 수식·결측·서비스·클라이언트 이벤트·SSR·SEO·OG·기존 페이지 보존·오프라인 검토물.
- `tests/readCheckSeo.test.cjs`, `tests/seoSitemapRobots.test.ts`: 후속 공개 도구 사이트맵 추가를 반영한 기존 회귀시험 기대값.

## 돌린 시험과 결과

최초 구현 검증 결과(아래 관문 수리 전 기록):

- 전용 시험 `node --test tests/earningsScenario.test.cjs`: **17/17 통과**.
- 전체 타입 검사 `/usr/bin/lockf -k /tmp/signum-heavy.lock node --max-old-space-size=3072 node_modules/typescript/bin/tsc --noEmit --incremental false`: **1회 실행·진단 0·종료 코드 0**. 다른 워크트리 잠금 해제를 기다린 뒤 최종 제품 코드를 검사했다.
- 영향 회귀시험 `/usr/bin/lockf -k /tmp/signum-heavy.lock node scripts/run-offline-tests.cjs earningsScenario.test.cjs readCheckSeo.test.cjs seoSitemapRobots.test.ts`: **3/3 파일 통과**. 전용 시험 17개 및 기존 read-check SEO 3개, sitemap/robots의 실제 경로·XML 대조를 포함한다. 전체 저장소 시험·Next 빌드는 실행하지 않았다.
- 변경 파일 12개 비밀값 검사 통과. `git diff --check` 진단 0.

전용 시험은 교과서 Hull 예제(S=42, K=40, r=10%, IV=20%, T=0.5)의 콜 4.75942와 S=K=100, r=5%, IV=20%, T=1의 콜 10.45058357·풋 5.57352602를 절대오차 0.00002 이내로 대조한다. 풋콜 패리티, 240조합 분해 항등식, 원본 결측·실제 0, ATM/만기 결측 미대체, 세션·DST·조기폐장, 5분 캐시와 GET 제한, 3개 슬라이더·종목/콜풋 변경·리셋 이벤트를 검증한다.

기존 페이지 보존은 작업 시작 커밋 `f762ad032`와 기존 src 수정 목록(사이트맵 1개뿐), read-check·영수증 3언어 SSR HTML 바이트, 기존 사이트맵 XML 바이트를 대조한다. OG는 실제 PNG 시그니처·1200×630·외부 글꼴 장애시 영문 대체를 확인한다.

최종 합성 미리보기 폴더: `/var/folders/sr/3djr6gqn175gntny2vgv05vm0000gn/T/signum-scenario-preview-3sfCDy`.

375 확인은 전용 시험이 출력하는 `signum-scenario-preview-*` 폴더의 `ko.html`·`en.html`·`ja.html`을 운영 세션이 열고 기기 모드의 375px 폭에서 수행한다. 실제 페이지 SSR과 같은 클라이언트 코드를 번들한 합성 자료이며 로컬 파일만으로 세 슬라이더·콜풋·종목 전환·리셋을 조작할 수 있다. 운영 자료나 사용자 정보는 없다. 운영 페이지의 확인 경로는 `/ko/tools/earnings-scenario`, `/en/tools/earnings-scenario`, `/ja/tools/earnings-scenario`다. 이번 세션은 브라우저를 열지 않는다.

## 남은 위험

- 현 세션에 운영 읽기 인증이 없어 실제 5종목 원본 필드 충실도·응답 시간을 확인하지 못했다. 합성 자료 통과를 운영 확인으로 보고하지 않는다. 운영 일정·원본 체인이 비면 자료 부족으로 남는다.
- 브라우저·375 실화면 및 실제 CJK 외부 글꼴은 미확인이다. OG는 글꼴 실패 시 영어로 대체한다. 프로덕션 빌드·배포는 수행하지 않는다.
- 공급사 GET은 읽기여도 한도를 소비한다. 스냅샷 캐시가 여러 인스턴스에서 동시에 비면 전역 중복이 가능하며 8초 예산/429 중단 시 일부 후보는 자료 부족일 수 있다.
- 조기행사·배당·매수매도 호가 차이·수수료·실제 체결·금리 변화·실적 점프의 비정규성은 모델에 반영하지 않는다. 운영 가격과 모델값 차이를 별도 표시한다.
- `.env*` 조회·비밀값 기록·push·main 병합·배포·운영 데이터 쓰기 없음. 커밋은 지정 브랜치에서만 수행한다.

## 관문 보류 수리 (2026-10-22)

관문 원문 `gate-feat_option-scenario-tool-10221847.md`를 끝까지 확인했다.

- 계약 선택 원인: 가격 세션 필터가 행사가 목록을 먼저 줄여 현물 100의 ATM 100 대신 현재 세션의 102.5를 선택했다. 만기별 계약 목록에서 ATM을 먼저 고정한 뒤 해당 행사가의 세션·호가·그릭스를 검사한다. ATM이 낡거나 비었으면 자료 부족으로 남긴다. 첫 만기를 뒤로 미루지 않는다.
- 실적일 선택 원인: 회사 확정 일정이 당일·과거이면 공급사 캐시의 미래 추정일로 되돌아갔다. `eventFor`에서 추정 일정 입력을 제거하고 서비스는 확정된 미래 발표만 조회·표시한다. 웹 실적 주간 페이지의 확정 원천은 수정하지 않았다.
- 표시 원인: 가정 결과에 관측 현물·IV 라벨을 재사용했다. 결과에 가정 주가·가정 IV를 별도 표시하고 기존 관측값을 유지한다. 기본 IV 변화와 기본 경과일을 숫자로 표시한다. 세 언어에 같은 구분을 적용했다.
- 기존 잘못된 선택 결과가 남지 않도록 도구 전용 5분 캐시 판본을 v2로 변경했다.

공유 함수 호출자 전수 검색 결과: 변경한 `eventFor`와 `buildRow`의 제품 호출자는 `loadScenarioSnapshot` 한 곳이다. 이 서비스의 색인·후보별 만기·체인 대응을 수정했으며 전용 서비스 시험으로 검사했다. `scenarioSnapshot`의 제품 호출자는 시나리오 페이지 한 곳이다. 문구 묶음은 시나리오 페이지·클라이언트·OG가 읽으며 SSR·메타·PNG 시험을 통과했다. 기존 사이트맵 공유 함수와 호출자 두 곳은 이번 수리에서 수정하지 않았다.

수리 검증: 관문 재현 3건을 추가한 전용 시험 20/20 통과. 관측 100·IV 60%에서 주가 +10%·IV −20%p를 주면 관측값 100·60%, 가정값 110·40%가 서로 다른 라벨로 표시됨을 합성 렌더로 확인했다. 브라우저·운영 자료·회사 공지 원문 재접속은 수행하지 않았다.

- `/usr/bin/lockf -k /tmp/signum-heavy.lock node --test tests/earningsScenario.test.cjs`: 20/20 통과. OG 3언어 PNG·기존 페이지 보존 포함.
- `/usr/bin/lockf -k /tmp/signum-heavy.lock ./node_modules/.bin/tsc --noEmit --incremental false`: 전체 검사 1회, 진단 0·종료 코드 0.
- `/usr/bin/lockf -k /tmp/signum-heavy.lock node scripts/run-offline-tests.cjs readCheckSeo.test.cjs seoSitemapRobots.test.ts earningsWeek.test.ts earningsConfirmed.test.ts`: 4/4 파일 통과. 환경 파일·운영망 접근을 차단한 실행이다.
- 최종 문구와 종목별 발표일·첫 만기 대응 검사 보강 후 `--test-name-pattern='관문 재현|서비스: 실제|3언어 실제 SSR'` 선택 검사 5/5 통과. 같은 전체 tsc·시험 묶음을 반복 실행하지 않았다.
- 변경 파일 6개 비밀값 검사와 `git diff --check` 통과. 새 수리 파일은 이 문서·시나리오 클라이언트·문구·스냅샷·서비스·전용 시험이다.

관문 수리의 남은 위험: 실제 운영 자료 충실도·375px 브라우저 화면은 미확인이다. 확정 목록에 미래 발표가 없으면 후보는 비거나 5개 미만일 수 있다. 이번 작업은 `feat/option-scenario-tool` 로컬 브랜치 커밋만 수행하며 push·병합·배포·운영 쓰기는 수행하지 않는다.

커밋 결과: 지정 브랜치에서 `git add`를 실행했으나 `/Users/eunhoon/.gemini/antigravity/scratch/stock2/.git/worktrees/feat-option-scenario-tool/index.lock` 생성이 `Operation not permitted`로 거부되었다. 스테이징·커밋은 미완료다. 권한 우회는 시도하지 않았다. 수리 기준 커밋은 `58550e815`이며 인계 패치는 `/private/tmp/signum-option-scenario-gate-20261022.patch`다. 현재 작업공간에는 변경 6개 파일이 그대로 있으므로 운영 세션에서 이 작업공간을 커밋할 수 있다.
