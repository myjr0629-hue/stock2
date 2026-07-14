# SIGNUM 마케팅 자동화 — 조사·구현 정본 (2026-07-15)

> 양머신(PC/Mac) 공유용. 이 문서 하나로 마케팅 자동화의 **목표·제약·근거·구현 플랜·현재상태·남은결정**을 이어받는다.
> 정본 관계: 엔진 재설계 = `MARKETING_ENGINE_REBUILD.md`(콘솔 C-2.x·현재 빌드상태), 채널·볼륨 운용 = `BUFFER_OPS.md`,
> 전략·실행로그 = `LAUNCH_PROMOTION_PLAN.md` §4-6. **이 문서 = 자율발행 시스템 설계 + 근거조사.**
> ⚠️ 원칙: 아래 표에 **[근거]** = 실출처 확인됨 / **[가설]** = 그럴듯하나 미검증(→아웃오브샘플 측정 후 튜닝, §42.3 검증헌법). 구분 지킬 것.

---

## 0. 목적·현황

- **목표 = 팔로워·조회수 극대화** (단일 목표). 콜드스타트: @signumhq 팔로워 ~1.
- 계정: @signumhq(en, Premium+) · @signumhq_jp(ja, Premium+, 네이티브 보이스) · Bluesky 미러.
- 니치 엣지 = **딜러 포지셔닝/감마/맥스페인/다크풀 데이터**(리테일이 못 보는 층). 시그니처: "the options structure showed it before the chart did".
- 컴플라이언스 불변: 예측 0 · 매수매도어 0 · 숫자는 실데이터 grounded · 교육 프레이밍.
- 데이터 자산: ~1,860 종목 일일 산출(maxPain·gammaFlip·callWall·putFloor·netPremium·darkPool%·GEX·RSI·VWAP·어닝·애널리스트) via cron→Redis→API, 인트라데이 실시간 조회 가능.

---

## 1. 채널 자동화 지도 (무엇이 자동, 무엇이 수동, **왜** — 근거 포함)

| 채널·행위 | 자동/수동 | 도구 | 근거 |
|---|---|---|---|
| **X 오리지널 발행** | 🤖 자동 | Buffer (스케줄) | X 2026 정책 "**콘텐츠·스케줄 자동 허용**". [근거: X automation rules 2026] |
| **X 콜드 답글** (남의 글) | 👤 **수동** | 콘솔 발굴+초안 | X 2026 "**API 프로그래매틱 답글 전면 차단** — 원저자가 멘션/인용한 경우만". 실측 403 확인. [근거: @XDevelopers 2026084506822730185] |
| **X 내 글 댓글 응대** | 🤖 자동 | X API | X 정책 예외(engaged 사용자엔 API 답글 허용). [근거: 동 발표] |
| **Bluesky 글 + 콜드 답글** | 🤖 자동 | AT API/Buffer | Bluesky는 X식 답글 제약 없음. [근거: Bluesky 성장 가이드] |
| **Stocktwits** | 👤 수동(게시)/🤖 발굴 | 공개 API 읽기 | 쓰기 API 없음(신규등록 중단). 규칙상 "가치형 봇 환영, 스팸 금지". [근거: stocktwits.com/about/rules] |
| **Reddit** | 👤 수동(게시)/🤖 발굴 | insane-search 읽기 | Data API 수동승인 게이트 + "auto-post=밴 1위". human-in-loop 권장. [근거: Reddit Responsible Builder Policy; okara] |
| **발굴·초안·자기검수·카드·종목선별** | 🤖 자동 (전 채널) | insane-search·API·Bedrock | — |

**핵심 규칙: 플랫폼이 허용하는 자동화는 전부 자동. 답글 게시(X 콜드/Stocktwits/Reddit)만 수동 — 이건 코드가 아니라 플랫폼 정책 문제.**

### 1.1 "안 되는 걸 되게 하는" 도구 조사 (브라우저 자동화)
- **도구는 존재**: skill-x-social(GitHub, Playwright+Chrome로 post/like/reply), OpenClaw 우회 플레이북 등. 우리 환경에 Chrome MCP·computer-use도 있음.
- **그러나 위험**: X 2026 정책 = "**engagement(답글·좋아요·팔로우) 자동화 금지**", 6월 봇퍼지 대상, "reply 자동화는 거의 항상 탐지됨 → 정지". [근거: opentweet automation-rules; socialnexis 6월 봇퍼지]
- **∴ X 답글 브라우저 자동화 = 계정 정지 위험(1000개 사태보다 나쁜 영구정지) → 강력 비권장.** Stocktwits는 "가치형" 조건부 여지, Reddit은 auto-post 밴 1위.

---

## 2. 발행 볼륨·시점 [근거 — 검증 통과]

### 2.1 볼륨 (검증됨)
- **오리지널 3~5/일** (마이크로<5K은 볼륨 필요, 알고리즘 학습), 롤링24h **하드상한 6**, 간격 **≥90분**, ≤1/15분.
- **콜드스타트 램프**: Wk1-2 =1~2/일 → Wk3-4 =3 → Wk5+ =4~5. (계정 활동 ≥10~14일 후 자동발행 개시)
- **정각(:00/:30) 발행 금지** — 지터 +8~22분 + 슬롯 랜덤 드롭(±1~2). [근거: 6월 봇퍼지가 "정각 규칙 발행"을 봇 신호로 탐지]
- **왜 캡이 필수인가**: TweepCred<65 계정은 For-You 후보가 ~3개로 제한(X 오픈소스 알고 `maxTweepcredForAntiGaming=65, maxHitsPerUser=3`); 무인증 **50/일 상한**(2026-05). **캡이 곧 억제 방지 장치** — 과거 1000개 스프레이가 수학적으로 도달을 죽였음. [근거: opentweet·tweethunter(TweepCred); Yahoo Tech·MediaNama(50/일)]
- 답글: **10~20 양질/일** → 프로필방문 100~200 → 주 20~40 팔로워. 2~10x 팔로워 계정 타깃(메가는 묻힘). [근거: postory; teract 70/30]

### 2.2 발행 시점 (ET, 검증됨)
| 창 | ET | 용도 |
|---|---|---|
| 프리마켓 브리핑 | 08:12~08:34 | 밤사이 감마·레벨 셋업 (marketSession 'pre' 가드는 이 스케줄 앵커엔 오버라이드) |
| 개장 리드 | 09:35~09:45 | 첫 15분 노이즈 후 in-play 레벨 (09:30~09:35 금지) |
| 미드데이 딥다이브 | 12:00~13:00 | 단일종목 구조(최고 TRS) |
| 파워아워 | 15:00~15:30 | 감마플립/핀 |
| 마감 리캡 | 16:05~16:20 | 정산 vs 맥스페인 (영수증) |
| 매크로 2연발 | T-15 티저 / T+10~40 반응 | CPI·NFP·PCE 8:30 |
| FOMC 3비트 | 14:05 반응 / 14:35 presser / 익일 vanna | 2pm 성명 + 2:30 회견 + 익일 vanna drift |
| **Bluesky (별도)** | **13:00~15:00** | 연대순 피드 4~5x, 동일타임스탬프 미러 금지 |
- 매크로 시각 [근거: BLS/BEA 표준 8:30 ET·FOMC 2:00/2:30]; Bluesky 1~3pm 피크 4~5x [근거: 2026 Bluesky 연구]; 인트라데이 U자 볼륨·vanna drift [근거: 시장미시구조 문헌].
- ⚠️ 캐비엇(검증 지적): "첫15분 2.5x" 과대정밀·"6~9am"은 일반벤치(9~11am)와 상충 — 니치 가정이니 측정으로 확인.

### 2.3 주간 리듬
- 화·수·목 프론트로드(수요일 최다). 금=경량(단 NFP 1주차·OPEX 3주차는 풀 이벤트). Sun 14:00~18:00 "주간 캘린더". 주1 교육스레드(핀)·주1 영수증.

---

## 3. 이벤트 트리거 (14개, 우리 데이터 필드로 알고리즘 탐지)

| 우선 | 트리거 | 탐지 룰 | 데이터 필드 |
|---|---|---|---|
| P1 | GAMMA_FLIP_TOUCH | `|spot−gammaFlip|/spot ≤ 0.5%` (netGex<0 증폭 레짐 에스컬) | spotPrice·gammaFlipLevel·netGex |
| P1 | GAMMA_REGIME_FLIP | 전일 netGex 부호 반전 OR squeezeScore≥70 | netGex·squeezeRisk·squeezeScore + 야간 스냅샷 |
| P2 | EARNINGS_EXPECTED_MOVE | 다음장 어닝 → EM%=atmIv×√(DTE/365), "IMPLIED" | earningsDate·atmIv·DTE |
| P2 | IV_CRUSH_POSTPRINT | atmIv 오버나이트 ≤−25% | atmIv + 스냅샷 |
| P3 | MAXPAIN_PIN_OPEX | OPEX주 & `|spot−maxPain|/spot ≤ 1%` & 감마집중 STICKY | maxPain·gammaConcentration + OPEX 캘린더 |
| P3 | MAXPAIN_GAP | `|spot−maxPain|/spot ≥ 3%` (기존 suggest 임계) | maxPain (이미 읽음) |
| P4 | DARKPOOL_SPIKE | darkPool% ≥ 45 (2026Q1 평균 40.3%) | darkPool.percent (realtime-metrics) |
| P5 | NET_PREMIUM_SKEW | `|netPremium|` 20일분포 상위5% (절대금액보다 권장) | netPremium (⚠️ 단위/스케일 실값 검증 필요) |
| P5 | SQUEEZE_SETUP_COMBO | siPercent≥20 & pcr≤0.6 & spot≈callWall | siPercent·pcr·spot·callWall |
| P6 | WALL_BREAK | 벽 돌파 & `|changePct| ≥ 2%` | callWall·putFloor·changePct·prevClose |
| P7 | MACRO_CALENDAR_WINDOW | 정적 캘린더 → SPY/QQQ netGex·flip·EM | SPY/QQQ 구조 + 매크로 캘린더 |
| P7 | VIX_STRUCTURE | VIX9D>VIX3M 백워데이션 OR SPX netGex 음전 | VIX9D/VIX3M(미배선) OR SPX netGex |
| P8 | PC_EXTREME | pcr≥1.8(공포) OR ≤0.4(탐욕) | pcr |

- **매크로 우선**: 지수 촉매(CPI/FOMC/NFP/PCE/VIX스파이크) 라이브면 단일종목 대신 SPY/QQQ 발행 (0DTE≈59% SPX볼륨=딜러감마가 테이프 결정 [근거: Cboe FY2025]).
- 2026 FOMC: Jan27-28·Mar17-18·Apr28-29·Jun16-17·Jul28-29·Sep15-16·Oct27-28·Dec8-9. OPEX 트리플위칭: Mar20·Jun18·Sep18·Dec18.

---

## 4. 종목 선별 TRS 공식 [🔴 가설 — 측정 후 튜닝]

```
TRS(0~100) = (0.50·리테일어텐션 + 0.50·데이터엣지) × 신선도 × 컴플라이언스게이트
 리테일어텐션 = 30·등락% + 25·상대거래량 + 25·WSB급등 + 20·뉴스
 데이터엣지   = 35·레벨근접 + 30·옵션거래폭증 + 20·다크풀 + 15·GEX백분위
 신선도 = max(0.3, exp(−Δt/6h))  · 촉매30일내 ×1.15
 컴플라이언스게이트 = 모든 숫자 실데이터 재해석 & lint 통과 시만 1, 아니면 0(스킵)
 → 전 종목 스캔 → TRS≥60 상위 1~3개만/일 발행 (희소성)
```
- [근거] 개념 앵커는 실사실: 어텐션(Barber-Odean 2008), 0DTE 59%(Cboe), WSB 무키 피드(Tradestie), 6h 가시성 반감기.
- **[가설] 가중치(0.5/0.5·30/25/25/20 등)·계수 전부 백테스트 0 = 검증 안 됨.** → v1로 배포하되 **주간 아웃오브샘플로 impressions/팔로워델타 회귀해 재보정. 인샘플 고정 금지(§42.3).**
- 구현: `suggest/route.ts`의 현행 스코어(maxPainGap×100, 7 ST_TICKERS)를 이 TRS(전 유니버스)로 교체 → Redis `mkt:trs:<etDate>` 저장 → 생성기가 그 쇼트리스트에서만 초안(compliance-by-construction).

---

## 5. 콘텐츠 포맷 (검증 반영)

| 포맷 | 검증 | 채택 | 템플릿 요지 |
|---|---|---|---|
| T3 단일 반직관 스탯 | 🟢 [근거: 북마크 10x 가중] | ✅ 주력 | "[N]% 넷프리미엄이 콜/풋으로 — K세션 최고. 다크풀 Z%. 감마 [부호]. 차트 1장" |
| T2 영수증/스코어보드 | 🟢 [근거: proof→신뢰] | ✅ 주1+ | "📌 [날짜] 콜월 $X. 가격 N세션 정체. then vs now 👇" (사후사실만=컴플라이언스 클린) |
| T1 "차트가 안 보여주는 층"(플래그십) | 🟡 원리OK·브랜드/전환 미검증 | ✅ 시험 | "$T 마감 $P([등락%]). 차트는 움직임을. 구조는 셋업을: 맥스페인/감마플립/콜월·풋플로어. 딜러 [롱/숏] 감마." |
| T5 일일 스코어보드 카드 | 🟡 Bilello는 주간이 실제 | 🟡 재검토(주간?) | "구조 스코어보드 — 1,860종목 상위 감마플립/넷프리미엄/다크풀" |
| T4 교육 스레드 | 🔴 [2026 롱폼>스레드 경향] | ⚠️ 롱폼 병행·사람검수 | 6트윗 훅→정의→실례→오해→읽는법→"Follow" |
| T6 매크로 pre/post 페어 | 🟢 (시점·EM 근거) | ✅ 지수일 | PRE: "SPY into [이벤트]…옵션이 ±X% 가격. 위=댐핑/아래=증폭" / POST: "settled inside/outside" |
| **답글(최강 팔로우 동력)** | 🔴 **taxonomy에서 누락 + 자동 불가** | 👤 **사람 10~20/일 필수** | 큰 계정 스레드에 실데이터 밸류 답글 |

⚠️ 검증 지적: 이 T1~T6 브랜드 taxonomy·전환율 라벨은 상당부분 생성물(미검증). **북마크→북마크가중(T3)·영수증→신뢰(T2)만 실근거.** 그리고 **최대 팔로우 동력인 "전략적 답글"이 빠져있음**(70/30, ~13.5x 가중) — 이건 자동 불가라 사람이.

---

## 6. 품질 게이트·자기검수·안전장치 (1000개 사태 차단) [근거]

### 6.1 자기검수 게이트 (사람검수 대체, fail-fast 순서)
1. **포맷 린트**(기존 lint 확장): ≤240자·본문링크0·이모지≤2·지표≤3·해시태그≤1
2. **예측/컴플라이언스 린트**: will·target·breakout·buy/sell·moon + 향하/간다/목표가 + 突破する 차단; 교육프레임 토큰 요구; 시그니처 "showed it before the chart"는 허용(사후)
3. **grounded-numbers 게이트**(신규): 모든 숫자가 발행시점 Redis 키에서 재해석(±0.1%, >20분 stale면 차단). 무출처 숫자 0
4. **스켈레톤 중복**(신규): 티커/숫자/날짜 제거 후 SHA-256 → 72h 내 매치 차단, 스켈레톤 7일 2회 초과 금지
5. **임베딩 중복**(신규): 문자-trigram Jaccard≥0.60 OR 문장임베딩 코사인≥0.85 차단 (en/jp 공유 코퍼스 — "여러 운영계정에 substantially similar 금지". Bluesky 별도)
6. **신선도 게이트**: (티커,지표) 72h내 재게시는 값이 실질 변동했을 때만(맥스페인 strike 변경·netGex 부호전환·벽 ≥1 strike 이동·netPremium ≥20% 변동)
7. **엔게이지먼트 자동화 = 0**: auto-like/follow/repost/reply/DM 0. 오리지널 스케줄만 자동. (빌드타임 실패로 강제)

### 6.2 데드맨 (자동 정지)
- (a) 3연속 게이트 실패 → 24h 정지+알림 (생성기 루핑) · (b) 롤링10 비작성자 인게이지 중앙값<2 → 볼륨 2로 축소+알림 · (c) 일 거부율>50% → 정지 · (d) grounded 게이트가 Redis/구조API 2사이클 도달불가 → 정지(stale 가드).
- 감사로그: 모든 draft PASS/BLOCK+실패게이트+출처키+post-id를 `K.audit()`에 최근200(text+embedding+skeleton-hash+(ticker,metric,value)+ET). 이 저장소가 중복·신선도·거부율 카운터를 다 구동.

### 6.3 킬스위치
- `mkt:killswitch=1`(콘솔 Today 버튼) → 크론·buffer/push·미래 자동발행 경로 전부 발행 거부(defense in depth). X 계정 위험신호(피처제한·strike·shadowban·mute/block/report 급증) 시 `reason='ACCOUNT_RISK'` 하드정지(수동 재개만).

---

## 7. 적대적 검증 결과 (뭐가 근거 있고 뭐가 가설)

| 요소 | 판정 | 요지 |
|---|---|---|
| 발행 시점(매크로시각·FOMC·Bluesky·U자볼륨·vanna) | 🟢 **SUPPORTED** | 실출처 다수 일치. 캐비엇: "2.5x"·"6~9am"은 stylized |
| 볼륨 캡·램프·지터(TweepCred<65·50/일·봇퍼지) | 🟢 **SUPPORTED** | X 오픈소스 알고·2026 정책·6월 퍼지 실사실. 캡=억제방지 |
| TRS 종목공식 | 🔴 **NOT SUPPORTED** | 앵커(어텐션·0DTE·WSB)는 실사실이나 **가중치·계수 백테스트 0**. 측정 전 확정 금지 |
| 콘텐츠 T1~T6 | 🔴 **부분** | T3(북마크)·T2(신뢰)만 근거. 브랜드 taxonomy·전환율 생성물. 스레드<롱폼(2026), **답글 누락** |

**교훈(문서화): "그럴듯한 숫자"를 근거인 척 배포 금지. 시점·볼륨·안전은 근거대로, 종목공식·콘텐츠는 v1 가설로 측정·튜닝.**

---

## 8. 현재 콘솔 빌드 상태 (이미 구현됨 — `MARKETING_ENGINE_REBUILD.md` C-2.7 상세)

- **콘솔**: `/[locale]/admin/marketing` — 서버 인증게이트(미인증 404), Donezo 라이트 테마, 6탭.
- **생성 탭 🟢 실작동**: 티커→grounded 4채널 초안+린트+og카드+최적종목 자동추천(`/generate`,`/generate/suggest`).
- **X 운용 🟢**: 타깃 스캔(`/x/scan`)·grounded 답글초안(`/x/draft`)·추천큐(`/x/recommend`)·인박스(`/x/inbox`). **콜드답글=복사→수동**(X 정책). OAuth 연결 완료(en/jp).
- **오늘/성과/자산 🟢**: 실 모니터링·감사로그·수동입력·og카드·계정상태.
- **Buffer push** `/buffer/push`(draft:true, 볼륨캡 서버강제). **Reddit/Stocktwits** = 온디맨드/발굴.
- 파일: `src/lib/marketing-console/{mkt,xScan,xApi,xOAuth,generate,reddit}.ts` + `src/app/api/admin/mkt/**` + `src/app/[locale]/admin/marketing/**`.
- 🔴 **X API 답글 차단 확정**(§1) — 콘솔은 발굴+초안까지, 게시 수동.

---

## 9. 구현 순서 / 남은 작업 (작업 전 — 미착수)

| # | 작업 | 자동화 | 선행 |
|---|---|---|---|
| 1 | 데이터 배선: extractLevels에 netGex·netPremium·pcr·atmIv·squeeze·darkPool% 추가 + 야간 스냅샷 크론(`K.snap`) | 🤖 | 사장님 승인(§10-4) |
| 2 | TRS 종목선별 교체(suggest→전 유니버스, `mkt:trs`) | 🤖 | 1 |
| 3 | 이벤트 탐지 크론(14 트리거) → 큐 트리거 | 🤖 | 1,2 |
| 4 | 자기검수 게이트(6.1) + 데드맨(6.2) + 킬스위치(6.3) | 🤖 | — |
| 5 | Buffer 자동 발행(캡·시점·지터) — **자동초안 그림자 8주 → 검증 후 자동발행** | 🤖 | 4, 사장님 승인(§10-1) |
| 6 | Bluesky 자동 발행 + 자동 답글(AT API) | 🤖 | 4 |
| 7 | X 내 글 댓글 자동 응대 | 🤖 | — |
| 8 | 콘텐츠 포맷 T1~T6(+롱폼) 생성기 확장, 성과로 튜닝 | 🤖 | 4 |
| 9 | 콘솔 총지휘소: 수동답글 큐(원탭)·자동발행 감시·킬스위치·성과 | 🖥️ | — |
| 10 | Stocktwits/Reddit 발굴+초안(게시 수동) | 🤖발굴 | — |

---

## 10. 사장님 결정 필요 (open questions)

1. **자동발행 vs 자동초안**: 현행 buffer/push=draft:true(사람발행)+메모리 가드레일 "never unsupervised". → **권고: Wk1-8 자동초안(그림자) → 게이트 무탈출·억제無 확인 후 자동발행 전환.** ⭐
2. **Premium 유지**: 무인증 50/일·TweepCred 낮음 → Premium이 4x 도달(+TweepCred). 유지?
3. **사람 답글 루틴**: 최강 팔로우 동력(답글 10~20/일)은 자동 불가 → 사람 배정 확정?
4. **데이터 배선 승인**: extractLevels 확장 + 야간 스냅샷 크론 + darkPool 별도 fetch.
5. **netPremium 단위**: $500K 절대임계 vs 20일분포 상위5% — 실값 검증 후 선택.
6. **유니버스 스캔 범위**: 전 1,860 매 사이클은 무거움 → WSB+RVOL 프리필터 후 상위~50만 구조fetch?
7. **Bluesky 채널**: id `69ca84bbaf47dacb696d9d0f` 라이브 확인 + 타임시프트(1~3pm 착지) 잡.

---

## 11. 출처 (근거)

- X API 답글 차단: [@XDevelopers status/2026084506822730185](https://x.com/XDevelopers/status/2026084506822730185) · devcommunity.x.com
- X 자동화 규칙 2026 / 봇퍼지: opentweet.io/blog/twitter-automation-rules-2026 · socialnexis.com(6월 봇퍼지) · unfollr.com
- TweepCred<65·maxHitsPerUser=3: opentweet.io · tweethunter.io · steventey.com (X 오픈소스 알고)
- 무인증 50/일: Yahoo Tech · MediaNama · piunikaweb (2026-05)
- 포스팅 빈도: tweetarchivist.com/twitter-posting-frequency-guide
- 답글 전략 10~20/일·70/30·2~10x: postory.io/blog/twitter-reply-strategy · teract.ai/twitter-reply-guy-strategy-2026
- FinTwit 콘텐츠 믹스: tweethunter.io/blog/twitter-for-finance · macro-ops.com
- 북마크 10x 가중: posteverywhere.ai · socialpilot.co
- Bluesky 1~3pm 4~5x·80/20·Starter Packs: blog.bskygrowth.com · sproutsocial.com
- 0DTE 59% SPX: Cboe FY2025
- 어텐션(리테일 관심주 매수): Barber & Odean 2008 "All That Glitters" (RFS 21:785-818)
- 브라우저 자동화 도구(존재): github.com/baijunjie/skill-x-social · OpenClaw
- Reddit 자동화 밴/승인: Reddit Responsible Builder Policy · okara.ai · octolens.com
- Stocktwits 규칙: stocktwits.com/about/rules
- vanna drift·U자 볼륨: 시장미시구조 문헌(검증 통과)

---

## 12. 양머신 핸드오프

- 착수 전 `git pull`. **아직 작업 미착수(문서만).** §9 순서로 구축 시작하되 **§10 결정 먼저**.
- 완료분은 이 문서 §8/§9에 ✅+커밋해시 갱신 후 push.
- **불변**: 근거[근거]/가설[가설] 구분 유지 · 인샘플 배포 금지(§42.3) · 자동화는 품질게이트가 안전(볼륨 아님) · 답글 게시는 사람 · 작업 무관 파일(lambda·android) 커밋 금지.
