# 옵션 레벨(맥스페인·콜월·풋플로어) — 원인·수리·검증 (2026-09-25)

브랜치 `fix/maxpain-chain-vintage` · HANDOFF §3 ㊴ · 관련: 7-i(COST STRIKE 월), 7-j(Command MU MAX PAIN)

## 1. 한 줄 요약

Command 의 MU MAX PAIN $1000 은 «부분 체인»이 아니라 **하루 늦은 미결제약정**이었다(630계약 = 9/25 만기 전체, OI 날짜만 9/23).
뿌리는 둘이다 — ① 수집 Lambda 의 체인 캐시가 날짜를 안 봐서 새 EOD 공표 뒤에도 전날 체인을 최대 20시간 줬고,
② 같은 레벨을 **다섯 생산자**가 서로 다른 정의·만기·판본으로 만들어 **문(라우트)마다 다른 숫자**가 나갔다.

## 2. 원인 — 증거

### 2-1. MU 9/25 만기, 같은 630계약의 OI 합계(콜/풋) — Intrinio 날짜별 직접 조회
| 출처 | OI 날짜 | 콜 OI | 풋 OI | 맥스페인 |
|---|---|---|---|---|
| `/api/live/ticker` flow(수집 Lambda 프로브) · Redis `intrinio:chain:MU:2026-09-25` | **2026-09-23** (630행 전부) | 100,903 | 181,852 | **1000** |
| Intrinio `options/chain/MU/2026-09-25/eod`(날짜 미지정=최신) | 2026-09-24 | 114,728 | 197,101 | 1020 |
| 나스닥 공개 체인(315행사가) | — | 114,728 | 197,101 | **1020** |
| `/api/live/options/structure`(직접 경로 debug.attempts=1·latency 41s, 18:0x ET 계산) | 9/24 | 114,728 | 197,101 | 1020 |

`scripts/lambda-flow-harvest/intrinio-adapter.js` `cachedChain`: 주석은 «그 체인이 밝힌 date 로 키를 만든다»인데 **키는
`intrinio:chain:{sym}:{exp}` 뿐**이고 적중하면 날짜를 안 보고 20시간 돌려줬다. 표본 7종목(SPY·NVDA·AAPL·MU·COST·JNJ·MCD)의
캐시 체인이 23:50 ET 에 전부 date=9/23. Intrinio 9/24 판은 늦어도 17:0x ET 에 이미 있었다(주석의 «20:05 ET 공표»도 낡음).

### 2-2. 같은 키의 생산자가 둘 — 누가 마지막에 썼느냐로 종목별 운이 갈렸다
`polygon:snapshot:probe:{T}` 는 수집 Lambda(체인 캐시 → 하루 늦음)와 Vercel 온디맨드(`_source:'vercel-ondemand'`, 직접 → 신선)가 둘 다 쓴다.
SPY·NVDA·AAPL 은 온디맨드가 마지막이라 맞았고, COST·JNJ·MCD 는 Lambda 가 마지막이라 틀렸다.
그리고 구조 캐시는 장외 신선 TTL **72시간**이라, 장중에 전날 EOD 로 계산한 값이 새 EOD 공표 뒤 밤새(=한국 낮) 나갔다.

운영 실측(9/25 04:12Z, 티커/구조/나스닥): MU 1000/1020/1020 · COST 910/910/**905** · MCD 250/250/**242.5**(콜월 255 vs **250**) · JNJ OI 판본 다름(값은 우연히 같음).

### 2-3. 문마다 다른 숫자 — 다섯 생산자 (운영 MU 12:5x KST)
| 문(화면) | 맥스페인 | 콜월/풋플로어 | 감마플립 | 출처 |
|---|---|---|---|---|
| 구조 API · dashboard/unified · UC | 1020 | 1200/1000 | 1075 | 구조(getStructureData) |
| live/ticker (Command·앱 Flow) | **1000** | 1200/1000 | 1075 | 맥스페인만 CentralDataHub 체인 |
| command/unified (웹 /ticker·WIM lab) `_source: dynamodb-unified` | **1000** | **1000/600** | **800** | DynamoDB — 수집 Lambda `harvest_lambda` |
| watchlist/batch | **970** | 1000/600 | 800 | 분석 캐시·stockApi(D+2~7)·AWS 이력 |
| 앱 Flow STRIKE 탭 (COST) | — | **900/900** | — | 브라우저: 0~7DTE «거래량» 최대 행사가 |

감마플립 800 = (1000+600)/2 — **배포된 `signum-harvest` = `harvest_lambda/index.js`(diff 0줄) 237행 `fl=cw&&pf?(cw+pf)/2:null`**,
벽 중간값을 `flipLevel` 로 DynamoDB `signum-gex-history` 에 쓴다. COST 도 945 = (1000+890)/2 vs 구조 770.

## 3. 소비처 표 (바꾸기 전에 전수 확인 — 요약)
- 문(화면으로 나가는 라우트): live/ticker · command/unified(+웹 /ticker SSR) · watchlist/batch · portfolio/batch · intel/fast ·
  dashboard/unified · live/options/structure · undercurrent(→ live/ticker) · SEO /flow/[t](→ UC) · ranking(구조 → structure-build)
- `getStructureData` 호출자 12곳(구조 라우트·ticker·dashboard·portfolio/analyze·watchlist/analyze·volatility-regime·premium-metrics·
  structure-build·watchlist/portfolio 배치·가디언) — 이번 변경은 **추가 필드(chainDate·debug.chainSource)** 와 **장외 캐시 판본 판정**뿐.
  판본표가 없으면(Lambda 배포 전) 예전과 동일. 신규 export 4개(levelsFromStructure·peekStructureLevels·applyLevelsToUnified·applyLevelsToRealtime).
- `polygon:snapshot:probe:*` 읽는 곳: CentralDataHub · structureService · lambda-xs(ATM IV, 추가 필드 무영향) · 헬스체크(존재만).
- `flow.pinZone` 을 화면에서 읽는 곳 없음(→ 구조 정의 = 맥스페인으로 맞춤).
- 알파 점수 등 **내부 계산 입력은 그대로**(live/ticker 폴백 벽만 같은 정의로). 화면으로 나가는 레벨만 한 벌로.

## 4. 수리 (커밋 6개)
1. `e69a66936` 수집 Lambda — `cachedChain` 이 적중해도 `prices.date` 가 «공표된 최신 EOD»(기준 체인 SPY 로 10분에 한 번 학습,
   Redis `intrinio:chain:latest-eod`)보다 앞이면 다시 받음 · 다시 받아도 뒤처지면 30분 억제 · 결과에 `chainDates` ·
   프로브에 `chainDate`·`chainDates` · 판본표 `polygon:snapshot:probe:meta:{T}`(프로브 쓰기 성공 시만).
2. `ddd35c5fa` live/ticker 레벨 한 벌(구조) + `levelsExpiration`·`levelsChainDate`·`levelsSource` · 병합은 레벨 묶음을 통째로 ·
   캐시 키 v4 · 구조 응답 `chainDate` · 장외 신선 캐시 판본 판정(판본표보다 오래된 체인이면 재계산 = 프로브 읽기) ·
   CentralDataHub `dataFreshness.chainDate`(Lambda 경로 늘 null 이던 것) · 온디맨드 프로브도 같은 모양·판본표.
3. `af541fb48`·`4c86e7821` 검사기 `scripts/audit-options-levels.js` — 티커 vs 구조 vs 나스닥(같은 정의·같은 현물) · OI 판본 ·
   다른 문들(command/unified·dashboard·watchlist·UC). 운영/프리뷰(`--deployment <url>`, vercel curl).
4. `06ecbf1a2` 앱 Flow 콜월·풋플로어 = API 값(거래량 최대 행사가는 API 가 비었을 때만) · Command MAX PAIN 팝업(ⓘ)에
   «기준: 9/25 만기 · 미결제약정 9/24 자료»(ko·en·ja, 카드 크기 불변) · `MetricInfo` 선택적 note.
5. `391fe30dc` 모든 문 출구에서 덮기(저장본 mget, 계산 없음): command/unified(jsonResponse 단일 출구) · 웹 /ticker SSR ·
   watchlist/batch · portfolio/batch · intel/fast · dashboard/unified(5출구) · 웹 /flow FlowRadar(props, 만기 표기) ·
   Command 폴백 필드명(`structure.callWall`→`structure.levels.callWall`, 예전엔 늘 0) · ticker last-good 접두사 v3.

## 5. 검증
- **Lambda 로직(배포 전, 로컬)**: 실 Intrinio + 메모리 캐시(Redis 쓰기 없음). 9/23 캐시 적중 → 기준 조회로 9/24 확인 → 다시 받음 →
  MU 주간 맥스페인 **1020** · 모두 신선하면 체인 재호출 0(만기 목록·가격 2콜만, 예전과 같음) · 뒤처진 채 남는 체인은 1회 후 30분 억제.
- **프리뷰 API**(`stock2-1ao8ostme…`, vercel curl): 7종목 전부 티커=구조, 모든 문(command/unified·dashboard·watchlist)이 구조와 일치.
  MU 1020/1200/1000/1075(운영은 문마다 1020/1000/970·600·800). COST·JNJ·MCD 는 **나스닥과 아직 다름 — Lambda 체인 9/23 판본**
  (Lambda 배포가 고친다). UC 는 프리뷰에서도 운영 live/ticker 를 부른다(공개 원점) → 운영 병합 뒤 따라온다.
- **프리뷰 실화면**(헤드리스 크롬, make-x-shot 과 같은 방식 460×900): Command MU MAX PAIN **$1000(+8.05%) → $1020(+5.93%)** ko·en·ja,
  팝업 «기준: 9/25 만기»(OI 날짜는 캐시가 새로 계산되면 붙는다) · 앱 Flow COST STRIKE **900/900 → 890/945**. 카드 레이아웃 불변.
- `audit-expiration-selection --live`: 운영·프리뷰 모두 341/0 · 실응답 실패 0.
- 지연(A/B, vercel curl 동일 경로, 워밍 TTFB): command/unified·dashboard·live/ticker·watchlist 차이 없음(0.4~0.7s 대).
- 타입검사 0(기존 remotion scripts-jpweek 1건은 main 에도 있음) · ESLint 오류 수 main 과 동일 · ㊲(fix/structure-lastgood-age)와 병합 충돌 0·타입 0.

## 6. 운영 반영 (대표 승인 필요 — 이 세션 분류기가 main 푸시·Lambda 배포를 막는다, 우회하지 않음)
순서: **① 병합(Vercel) → 운영 배포 확인(~3분) → ② Lambda 코드**. 반대 순서면 장외에 «티커 신선·구조 캐시 낡음»이 잠깐 생긴다.
```
# ① 병합 — HANDOFF.md 만 충돌하면 main 쪽을 남긴다(시간 사이클이 매시 고친다). 다른 파일 충돌이면 멈춘다(푸시 안 함).
(cd /tmp/stock2-main-merge && git fetch -q origin && git reset -q --hard origin/main && if ! git merge -q --no-ff origin/fix/maxpain-chain-vintage -m "merge: 옵션 레벨 한 벌·체인 판본 수리(대표 승인)"; then git checkout --ours .agent/marketing/HANDOFF.md && git add .agent/marketing/HANDOFF.md && git commit -q --no-edit; fi && git push origin HEAD:main)
# ② 수집 Lambda(signum-flow-harvest) 코드만 — 환경변수·EventBridge 안 건드림(전후 env 개수 확인 출력)
git -C ~/.gemini/antigravity/scratch/stock2 pull -q --ff-only && (cd ~/.gemini/antigravity/scratch/stock2 && node scripts/deploy-flow-harvest-code-only.js)
# ③ 20분 뒤(기준 날짜 학습 ≤10분 + 회전 ~9분) — 전부 ✓ 여야 한다
node scripts/audit-options-levels.js
```
배포된 Lambda 는 저장소와 같다(비밀키 하드코딩 기본값 2줄만 저장소가 이미 제거 — env 로 들어가므로 무영향). ㊲ 와는 순서 무관.

## 7. 남은 것 (같은 종류 — 이번 변경 밖, 기록만)
- **수집 Lambda `harvest_lambda` 의 가짜 감마플립**(237행 벽 중간값)·무제한 벽·전 만기 맥스페인이 DynamoDB `signum-gex-history` 에 계속 쌓인다.
  화면 문은 덮었지만 이력 차트(GexTimeline)·가디언·장외 volatility-regime·AWS 폴백은 그 값을 쓴다 → 생산자 정의 수리(이력 연속성 판단 필요).
- 앱 Flow STRIKE 탭 제목 «장중 행사가 프로파일 / INTRADAY» 인데 막대는 **전일 EOD 거래량**(`day.volume`) — 라벨이 사실과 다르다.
- 앱 Flow 최근 체결 목록이 빈 값을 지어낸다(`Date.now()-i*120000` 시각, 행 번호로 ASK/BID, 크기 `100*(i+1)`).
- CentralDataHub 은 «오늘»을 UTC 로, 구조는 ET 로 판정 — 금 20:00~24:00 ET 에 두 체인의 만기가 갈릴 수 있다(화면 레벨은 이제 구조 한 벌).
- UC `fetchMoney` 는 live/ticker 응답에서 «처음 보이는 maxPain 키»를 깊이 탐색 — 키 순서에 기대는 구조. SEO `/flow/[t]` 는 레벨에 만기 표기 없음.
- 구조 라우트의 `result.gex` 게이트는 죽은 코드(recordGexSnapshot 미실행·맥스페인 게이트 미적용) · admin/trade·마케팅 xScan 의 벽은 늘 null(`s.gex.callWall`).
- quant-radar(운영자 전용)·intel/snapshot(일별 고정본)·intel/{섹터}(화면 호출자 없음)는 덮지 않았다.
- 프리뷰와 운영은 Redis 하나를 쓴다 — 모양이 다른 코드가 같은 last-good 키를 필드 병합하면 서로 섞인다(이번에 ticker last-good v3 로 분리).
- 보안 메모: 프리뷰 확인 중 `vercel curl --debug` 가 기존 보호 우회 토큰(㊳)을 로컬 출력에 한 번 찍었다(파일·커밋엔 없음). ㊳ 폐기를 고르면 함께 무효가 된다.
