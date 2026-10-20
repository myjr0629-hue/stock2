**결과 요약**

`fix/seo-sitemap-robots` 작업공간에서 다음 원인을 수리했다. 커밋·push·배포·네이버 제출은 하지 않았다. 브라우저·계정 콘솔·운영 데이터에 접근하지 않았고 `.env*`를 읽지 않았다.

- `/flow/[ticker]`와 UC 티커 API가 서로 다른 영문 전용 검증식으로 클래스 주식을 거부했다. 두 진입점과 사이트맵이 `isFlowTicker`를 공유한다. 기존 영문 1~6자와 `영문 1~5자.클래스 1자`를 허용하고 `NULL`·다중 점·빈 접미는 거부한다.
- `/*/intel`·`/*/dashboard`에서 `*`가 중간 `/`까지 소비해 공개 가이드도 차단했다. 지원 언어(en·ko·ja)와 앱 경로를 열거하고, 정확 일치(`$`)·쿼리(`?`)·하위 경로(`/`)를 각각 차단한다. `intel-guardian`도 명시했다.
- middleware의 정적 파일 제외식이 점 티커까지 제외했다. 로케일 유무에 따른 `/flow/:ticker` 경로만 명시적으로 통과시켜 언어·공개 페이지 판정용 요청 헤더를 유지한다.
- `/today` 메타데이터와 사이트맵이 `hasIndexablePicks`를 공유한다. 저장본 없음·빈 목록·끄기·읽기 실패 시 사이트맵에서 제외한다. 두 사이트맵은 동적 생성으로 빌드 시점의 상태가 고정되지 않는다.
- 기존 사이트맵 생성기를 공유하고 한국어 전용 XML 경로 `/sitemap-ko.xml`을 추가했다. 로컬 시험의 정상 항목 조건에서 전체 6,774개, 한국어 2,258개다. `/today` 제외 시 각각 6,771개, 2,257개다. 제출은 운영 세션에서 수행한다.

아래는 운영 HTTP 측정이 아닌 **기존 코드 패턴과 수정 코드의 오프라인 시험 결과**다. 점 티커는 저장본을 모의한 실제 서버 컴포넌트 렌더 결과다.

| URL·조건 | 변경 전 | 변경 후 |
|---|---|---|
| `/ko/how-it-works/intel` | robots 차단 | 허용 |
| `/ko/how-it-works/dashboard` | robots 차단 | 허용 |
| `/ko/intel`, `/ko/dashboard` | 차단 | 차단 유지 |
| `/ko/intel/detail`, `/ko/dashboard/detail` | 차단 | 차단 유지 |
| `/ko/intel-guardian` | `/intel` 접두사로 차단 | 명시 규칙으로 차단 |
| `/ko/ticker` | 차단 | 차단 유지 |
| `/ko/ticker?ticker=NVDA` | 허용 | 차단 |
| `/ko/ticker/NVDA` | 허용 | 차단 |
| `/ko/tickers` | 허용 | 허용 유지 |
| `/{en,ko,ja}/flow/{BF.B,BRK.B,HEI.A,MOG.A,PBR.A}` (15개) | robots 허용, 페이지 검증에서 404 | robots 허용, 서버 렌더·자기 canonical 통과 |
| `/ko/today` (표시 항목 있음) | 색인 가능·사이트맵 포함 | 동일 |
| `/ko/today` (없음·빈 목록·꺼짐·읽기 실패) | noindex·사이트맵 포함 | noindex·사이트맵 제외 |
| `/sitemap-ko.xml` | 없음 | 한국어 XML 제공 |

**바꾼 파일**

- `src/lib/seo/flowTicker.ts` (신규), `src/app/[locale]/flow/[ticker]/page.tsx`, `src/app/api/undercurrent/ticker/route.ts`: 티커 계약 공유. 기존 UC 영문 1~5자 제한도 페이지와 같은 1~6자로 맞췄다. UC 호출자는 공개 flow 페이지, 웹 undercurrent의 일반·refresh 요청, cron pace-warm이다. 기존 shared.ts의 뉴스 분류용 `TICKER_RE`는 유지했다.
- `src/app/robots.ts`, `src/middleware.ts`: 앱 경로 경계와 점 티커의 locale middleware 처리.
- `src/lib/todayPicks/view.ts`, `src/app/[locale]/today/page.tsx`: 메타데이터·사이트맵이 사용하는 색인 판정 추가. 기존 `buildView`와 다른 호출자의 동작은 유지했다.
- `src/lib/seo/sitemap.ts` (신규), `src/app/sitemap.ts`, `src/app/sitemap-ko.xml/route.ts` (신규): 전체·한국어 사이트맵이 공유하는 생성기. 호출자는 두 사이트맵 경로뿐이다.
- `tests/seoSitemapRobots.test.ts` (신규), 이 보고서.

**돌린 시험과 결과**

- `seoSitemapRobots.test.ts`: 10개 묶음 통과. 전체 2,228 티커 검증, 모든 앱 경로의 정확·쿼리·하위 차단, 가이드 허용, 전체·한국어 사이트맵의 중복·robots·페이지 형식 검사, 잘못된 항목 주입 시 검사 실패, `/today` 5상태 메타데이터 대조, UC 실제 라우트의 점 키·200/400, 실제 FINRA 읽기 함수의 점 키 조회, 클래스 15개 실제 SSR·canonical, 사본 전용·데이터 없음 404, Next middleware matcher를 검사했다. 외부 의존성은 모의했다.
- `seoExpiryRoll.test.ts`: 기존 SEO 만기·숫자·라벨 유지 회귀시험 14개 통과.
- 별도 Python XML 파서: 한국어 XML 정상, 고유 한국어 URL 2,258개 확인.
- 파일별 `git diff` 저장 확인 및 변경 파일 `git diff --check` 통과.
- 전체 타입 검사: `/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --noEmit --incremental false` 한 번 실행, 종료 코드 0·진단 0건으로 통과. 다른 작업의 공용 잠금이 해제된 뒤 실행했다.

재현 명령(각각 개별 실행):

```sh
node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/seoSitemapRobots.test.ts
node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/seoExpiryRoll.test.ts
```

**남은 위험**

저장소의 `tickerSymbol.ts`와 구조 서비스는 `BRK.B`를 정본으로 사용한다. 실제 FINRA 저장본 읽기 함수도 점 키를 그대로 조회하는 것을 모의 저장본으로 확인했다. 따라서 하이픈 변환은 추가하지 않았다. **운영 저장본에 5종 데이터가 현재 있는지, 운영 HTTP가 200인지까지 확인한 결과는 아니다.** 데이터·FINRA 행이 모두 없을 때 기존 404 분기는 유지된다. 운영 세션에서 15개 HTTP 상태·자기 canonical·index 가능 여부를 확인해야 한다.

네이버 수집제한 약 1,100건과 색인 13개 정체의 직접 원인은 아직 미확정이다. 이번 수리만으로 색인 증가를 보장하지 않는다. 배포 후 운영 세션에서 한국어 사이트맵 제출·다운로드 결과와 Yeti 로그를 대조해야 한다. `/today`는 제출·수집 사이에 저장 상태가 달라질 수 있다. 브라우저·실서버 시험은 실행하지 않았다.
