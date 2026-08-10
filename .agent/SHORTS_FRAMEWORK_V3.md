# 쇼츠 엔진 v3 — 제작 정본

> 이 문서가 쇼츠 제작의 유일한 정본이다. 이전의 관행·구두 합의·개별 대본 주석은 여기에 어긋나는 즉시 무효다.
> 대상 리포 `/Users/eunhoon/.gemini/antigravity/scratch/stock2` · 상위 규칙 `.agent/SHORTS_ENGINE_MASTER.md` §8 · `.agent/SEEDANCE_PROMPT_GUIDE.md` §0(BRIGHT) · `.agent/BUFFER_OPS.md` §0-7
> **v3는 §7의 P0가 머지된 뒤에만 실행 가능하다.** 현재 `Briefing.tsx`의 `Visual`/`Beat`에는 `sym`·`topic`·`tone`·`asOf`가 없어, v3 대본을 그대로 넣으면 타입체크와 렌더가 함께 실패한다.

---

## 0. 3대 원칙 (한 문장씩)

1. **모순 하나를 3초 안에 세우고 우리 데이터로 증명한다** — 지표 나열은 대본이 아니라 폐기 대상이고, 한 편은 «A는 X했다, 그런데 B는 Y했다» 한 문장으로 요약되어야 한다.
2. **프레임 0은 심볼과 숫자가 지배한다** — 문장이 아니라 로고와 숫자가 가장 큰 요소이고, 배너·테이프·부가 텍스트는 훅 구간에서 전부 화면에 없다.
3. **화면의 모든 픽셀은 출처가 있다** — 앱 UI는 100% 실캡처, 로고는 100% 우리 파일, 배경은 화이트리스트를 통과한 생성물이며, 문장은 과거·현재의 관찰뿐이다.

---

## 1. 훅 — 3초 안에 멈추게 한다

### 1-1. 훅 아키타입 6종 (편성 비중 포함)

| # | 아키타입 | 편성 비중 | 트리거 데이터 | 프레임 0 심볼 | 문형 | 이어지는 비트 1의 의무 |
|---|---|---|---|---|---|---|
| **H1 이상치** | ANOMALY | **60%** | `flow/realtime-metrics` 거래량 배수·다크풀%·숏볼륨%, `market/movers` 거래대금 | 그 종목 로고 620px | `<규모> did X.` / `<가격> did not.` | 안 움직인 쪽의 실측치 |
| **H2 단일 종목 충격** | SHOCK | 15% | `guardian/breaking` σ 통과 또는 당일 \|등락\| ≥5% | 그 종목 로고 620px | `<회사명> moved <n>% <세션>.` (1줄) | 그 움직임의 크기 맥락(거래량·세션) |
| **H3 모순** | CONTRADICTION | 15% | 지수 vs VIX, 가격 vs 넷플로우 — **누구나 아는 두 값만** | 좌우 심볼 2개(각 340px) | `The market closed red.` / `Fear closed lower.` | 모순의 한쪽을 실화면으로 |
| **H4 헤드라인** | HEADLINE | 5% | `guardian/news-digest` items[0] | 헤드라인이 가리키는 로고 ≤3 | `<사실> jumped overnight.` / sub `<n> names opened higher.` | 우리 데이터로 그 사실을 «측정» |
| **H5 연속 기록** | STREAK | 3% | `sparkline`, `guardian/history` | 로고 620px + `×9` 칩 | `Nine sessions. Nine green closes.` | 스트릭을 만든 한 날의 크기 |
| **H6 임박 시계** | CLOCK | 2% | **D-1 이내에만.** `guardian/economic-calendar`, `guardian/fedwatch` | `FED`/`CPI` 글리프 | `CPI printed at 8:30 this morning.` | 발표 직후 실측 반응 |

> **삭제된 아키타입**: D-2 이상 남은 카운트다운(«39일 뒤 FOMC»)과 «개장 90분 전» 류 시계 훅. 39일 뒤의 일에는 지금 멈출 이유가 없다. FOMC·CPI는 D-1 이내가 아니면 **본문 마지막 비트**로만 쓴다.
> **자체 지표 이름은 훅에 쓰지 않는다.** `Greed reads 64. The machine reads 50.`은 시청자가 두 지표를 모르므로 모순이 성립하지 않는다. 훅은 지수·가격·거래량·VIX 같은 **아는 단어**로만 대치시키고, 우리 지표 이름은 비트 2에서 처음 밝힌다.
> **질문 훅**은 숫자 또는 고유명사를 포함할 때만 허용한다. `Why did the market fall?` 금지 / `Why did $180B leave Nvidia?` 허용.

### 1-2. 프레임 0 규칙 (하나라도 어기면 발행 금지)

Shorts에는 커스텀 썸네일이 없다. 프레임 0이 곧 썸네일이고 유일한 광고 지면이다. `HookBlock`은 훅 요소를 **페이드 없이 opacity 1**로 그린다.

| 위치 | 요소 | 규격 | 프레임 0 상태 |
|---|---|---|---|
| 상단 | **심볼 히어로** | 620px (화면폭 57%) · 흰 플레이트 · 내부 글리프 `size×0.72` `contain` | 불투명 1.0 · **페이드 절대 금지** |
| 심볼 바로 아래 | **대표 숫자 1개** | **200px / 900** — 화면에서 가장 큰 텍스트 | 불투명 1.0 |
| 그 아래 | **훅 라인** | **64px / 900 · 1줄 원칙**(2줄은 예외, 각 ≤22자) | 불투명 1.0 |
| 그 아래 | 훅 서브 | 40px 앰버 · ≤34자 · 선택 | 불투명 1.0 |
| 최상단 | 날짜·시각 스탬프 | 24px · `AUG 11 · 7:32 AM ET` — **시각까지 표기**(지연 고지의 근거) | `useIn(0,5)` 허용 |
| 하단 | 면책 | **26px / 700 / opacity ≥0.85** · SAFE 영역 안 · 대비 4.5:1 | 상시 |
| 배경 | 밝은 주제 매칭 실사 | video ≻ img. 절차 배경(`grid`/`series`) 훅 금지 | 프레임 0부터 재생 |

**훅 구간에서 화면에 없어야 하는 것**: `Banner`(비트 1부터 등장), `BottomZone` 테이프(본문에서 최대 3항목), 그 밖의 모든 부가 텍스트. 1초에 읽히는 블록은 2개뿐이다.

### 1-3. 심볼 히어로 규칙

- **크기 620px 고정.** 히어로 «컷»은 한 편에 1개(훅이 기본). 심볼의 **재등장은 제한 없다** — 루프에 훅 심볼을 다시 세우는 것은 규칙 위반이 아니라 의무다(수미상관).
- **지수를 히어로로 세울 때는 텍스트 배지를 쓰지 않는다.** `NDX`·`500`은 일반 시청자가 못 읽는 약어다. 나스닥은 **구성 종목 로고 3개 스택**(NVDA·AAPL·MSFT) 또는 `NASDAQ` 워드마크 풀스펠로 세운다. 텍스트 글리프는 `rows`·`tape` 같은 **소형 슬롯 전용**이다.
- **ETF 로고는 어떤 경우에도 쓰지 않는다.** `SPY.png = DIA.png = GLD.png`(State Street 마크), `IWM.png = TLT.png`(iShares 마크) — 운용사 마크라 종목 식별이 안 되고 후원 오인 위험이 있다. 전부 글리프로 강등한다.
- **기관 로고 금지**: 연준·거래소·언론사 마크는 생성물·전경 어디에도 넣지 않는다. `FED`·`CPI` 글리프로 대체한다.
- 로고가 등장하는 컷 하단에는 상시 `Logos are trademarks of their owners. Not affiliated.` (18px, opacity 0.7).
- 개별 종목 히어로 컷에는 상시 배지 `Observed. Not a recommendation.`

### 1-4. 예시 라인 (전부 과거·현재 관찰형)

| 아키타입 | line / sub |
|---|---|
| H1 | `Four times the volume.` / `The price didn't move.` — 심볼 MU 620px, 숫자 `4.1×` 200px |
| H1 | `Dark pools took 61%.` / `The visible tape moved 0.4%.` |
| H2 | `Palantir moved 9.4%.` (1줄) — 로고 620px, 숫자 `9.4%` 200px, sub 없음 |
| H3 | `The market closed red.` / `Fear closed lower.` |
| H3 | `Every index closed lower.` / `Volatility closed lower too.` |
| H4 | `Memory prices jumped` / `overnight.` — sub `Three chip names opened higher.` · NVDA·AMD·MU 로고 |
| H5 | `Nine sessions.` / `Nine green closes.` |
| H6 | `CPI printed at 8:30.` / `The board moved before the bell.` |

**금지**: 미래·조동사(will/could/may/might/should), 방향 암시(`lean higher`, `headed toward`, `poised`, `on the verge`), 행동 지시(`go`, `wait`, `watch for`, `keep an eye on`), 인과 단정(`after`, `because`, `on the back of`, `drove`, `sent`), 숫자 없는 sub, 3줄 이상 line, 로고 페이드인.

---

## 2. 스토리 — 뉴스를 우리 자원으로 푼다

### 2-1. 스토리 트리

```
줄기 (TRUNK)  : 한 문장. 반드시 대조 구조 «A는 X했다. 그런데 B는 Y했다.»
   └ 가지 L1  : 스코어보드 — 지수·선물 (누구나 안다 → «그래서?»가 생긴다)
   └ 가지 L2  : 무버·피어 — 로고로 «누가»를 즉시 전달
   └ 가지 L3  : 제3자 인용 — 뉴스 헤드라인 1줄 / 애널리스트 컨센서스 (중간 증거)
   └ 가지 L4  : 우리 앱 실화면 (필수 1개 — 증명이자 유입 장치)
   └ 가지 L5  : 우리만 있는 층 — 옵션 북·다크풀·압력 (필수 1개, 결론 자리)
닫기 (CLOSE)  : 이미 나온 숫자 2개로 줄기를 되풀이 → 루프 문장으로 훅에 회귀
```

- **등급 역행 금지.** L5 다음에 L1을 놓지 않는다.
- **L3(컨센서스)를 결론 자리에 두지 않는다.** 애널리스트 목표주가를 페이오프로 놓으면 사실상 추천 전달이다. `consensus` 블록은 항상 중간 증거이고, 온스크린 `Third-party estimates. Not our view.`를 달고, 등급 색은 **중립 회색**(상승 초록 금지)이다.
- **결론은 반드시 L5**(우리 데이터)이거나 «두 숫자의 대조»다.

### 2-2. 뉴스 → 비트 변환 절차 (6단)

| 단계 | 하는 일 | 소스 | 산출 |
|---|---|---|---|
| **N1 채집** | 오늘의 충격 1건 선정 | `guardian/news-digest` · `live/news?t=` · `guardian/breaking?debug=1` | headline · outlet · publishedAtET · urgency · category |
| **N2 판정** | 시장 전체 / 단일 종목 / 섹터 | `category` | 포맷 배정(§3) |
| **N3 번역** | 뉴스 요약이 아니라 **측정 가능한 주장**으로 | 사람 1줄 | 줄기 문장 |
| **N4 증명** | 줄기를 재는 지표 2~4개를 L1→L5 순으로 | §2-1 사다리 | 가지 비트 |
| **N5 캡처** | 그 지표가 보이는 앱 화면을 **같은 순간** 촬영 | `scripts/capture-app-screens.mjs` (PNG + 동시각 `.txt`) | `shot` 비트 + 콜아웃 좌표 |
| **N6 인용** | 헤드라인 **1줄 + outlet만** 원문. 본문은 우리 문장으로 재작성 | `Visual{kind:'source'}` | 뉴스 비트 |

**N3 번역 예**

| 원문 요지 | ❌ | ✅ |
|---|---|---|
| 메모리 가격 인상 보도 | "메모리 가격이 올라서 반도체가 올랐다" (인과 단정) | "그 보도가 나온 세션에 반도체 3종이 같이 올랐다. 다크풀 비중은 안 움직였다" |
| 연준 위원 발언 | "연준이 매파적이다" | "hold 확률이 57%로 찍혀 있고 VIX는 15 아래로 닫혔다" |

**뉴스 배경은 당일 생성하지 않는다.** 사전 생성된 topic 키(`breaking_newsroom`·`earnings_stage`·`cpi_supermarket`·섹터 키)로만 매핑한다. 당일 생성은 6분 이상을 잡아먹고 캡처 정합을 깨뜨린다. 생성 이미지를 뉴스 컷에 쓸 때는 화면 내 마이크로 라벨 `Illustration · AI-generated` + 발행 시 YouTube 「변경·합성 콘텐츠」 체크가 의무다.

### 2-3. ask / close 규칙

`Beat.ask`는 `say`와 한 세그먼트로 굽힌다(`scripts/tts-beats.mjs` L48-52) — 낭독 예산에 포함된다.

| 규칙 | 내용 |
|---|---|
| A1 | 비트 `i`의 ask는 비트 `i+1`에서 닫힌다. 두 칸 건너뛰기 금지 |
| A2 | 닫힘 = `beats[i+1]`의 `head`·`say`·`visual`이 ask의 핵심 명사/숫자를 직접 다룸 |
| A3 | **마지막 비트의 ask는 질문이 아니라 합산**이다. `askIsSummary: true` 선언 |
| A4 | ask ≤ 46자, 4~6단어 |
| A5 | ask는 **행동이 아니라 독법**을 묻는다. `Which layer would you read first?` ✅ / `Watch this level.` ❌ |
| A6 | 착지 4형: 전환질문 `So what did the book say?` / 축소지시 `Look closer at that number.` / 예외예고 `One print broke the pattern.` / 계층이동 `Zoom out one week.` |

**루프(close)**: 2줄, 각 ≤20자, 78px. 훅 라인의 핵심 명사 **2개 이상 재사용**. 새 숫자 금지. 가장 강한 형태는 훅 문장을 반으로 잘라 후반부를 결론으로 교체하는 것 — `Four times the volume.` / `Nobody bid.`
루프는 엔드카드의 `loopAsk`로 흡수된다(§6) — 즉 **루프 문장은 그날 대본에서 생성**되며 앱별 고정 문구는 폴백일 뿐이다.

### 2-4. 워크드 예시 비트시트 — T2 / H4 헤드라인

> **줄기**: "메모리 가격 보도가 나온 아침, 반도체 3종은 같이 올랐다. 그런데 우리 다크풀 비중과 리스크 다이얼은 안 움직였다."
> **숫자 출처**: `public/shorts/appshots/t2-*.{png,txt}` 동일 배치 · 뉴스 비트만 당일 `guardian/news-digest`
> 훅 심볼 = NVDA·AMD·MU 로고 클러스터(가운데 NVDA 620px, 좌우 340px) · 대표 숫자 `+2.1%` 200px

| # | role / topic | head (≤18자×2줄) | say (5~8단어) | ask | visual | 낭독 | 컷 |
|---|---|---|---|---|---|---|---|
| **훅** | — | — | line `Memory prices jumped` / `overnight.` · sub `Three chip names opened higher.` | — | 심볼 클러스터 · bg `semis_fab` (video) | 2.2 | **3.00** |
| 1 | `market` / `floor_open_rush` | `Index futures`\n`opened green` | `Index futures opened green across the board.` | `Who carried it?` | `rows` ×3 (NDX/500/R2K 글리프 + `as of 7:31 ET`) | 3.6 | **3.95** |
| 2 | `chips` / `semis_fab` | `Three chip names`\n`led the tape` | `Nvidia, AMD and Micron all traded higher.` | `Did the flow agree?` | `logos` ×3 hero(96px 칩) | 3.9 | **4.25** |
| 3 | `evidence` / — | `Straight from`\n`our screen` | `Our board reads Risk-On at seventy-two.` | `So the money followed?` | `shot` `t2-dash.png` · 콜아웃 2개 스태거(58f/88f) · `as of 7:32 ET` | 4.55 | **4.90** |
| 4 | `depth` / `ai_datacenter` | `Off-exchange share`\n`sat at forty` | `Off-exchange share sat at forty percent.` | `That is where it did not move.` | `stat` (다크풀% · 배지 + `as of 7:32 ET`) | 3.6 | **3.95** |
| 5 | `conflict` / `floor_still` | `Tape up.`\n`Flow flat.` | `The tape rose. The flow stayed flat.` | `One book still disagreed.` | `versus` big — 좌 tone `up`, 우 tone **`neutral`(회색)** | 4.0 | **4.35** |
| 6 | `evidence` / `breaking_newsroom` | `The wire`\n`landed at 6:12` | `The wire moved at six twelve Eastern.` | `Which layer priced it?` | `source` (headline 1줄 + outlet + at) · `Illustration · AI-generated` | 4.55 | **4.90** |
| 7 | `depth` / `semis_fab` | `Call premium`\n`took 58%` | `Call premium took fifty-eight percent.` | `Four times the volume. Flat price.` (**합산**) | `stat` (옵션 넷프리미엄 · `as of 7:33 ET`) | 4.2 | **4.55** |
| **엔드카드** | — | — | VO `SIGNUM HQ. Free, with ads.` | loopAsk `Volume moved. Price didn't.` | §6 (105f) | 2.0 | **3.50** |

```
길이 = 3.00 + (3.95+4.25+4.90+3.95+4.35+4.90+4.55) + 3.50 = 37.35s   → 게이트 36~50 ✅
낭독(훅+비트) = 2.2+3.6+3.9+4.55+3.6+4.0+4.55+4.2 = 30.60s          → 상한 34s ✅ (엔드카드 VO 2.0s는 별도)
컷 = 9개 → 9/37.35×30 = 7.2 per 30s                                  → 하한 4 ✅
밝기 = video 5컷 + shot 1컷 + 이미지 2컷                              → 평균밝기·밝은화소 여유 ✅
```

**초과 시 처방 순서** (길이를 늘리지 않는다): ask 4단어로 압축 → say 형용사 제거 → 낭독 숫자 1개 삭제(화면엔 유지) → 비트 하나 통째 삭제.

---

## 3. 포맷 — T2 장시작전 / T3 이벤트 / T4 장마감 (+T5 종목)

**단계적 개시.** 1단계 = **T2×5 + T5×1 = 주 6편.** T3는 §5 배경 재고 23클립 확보 + 템플릿 자동 치환이 붙은 뒤 개시한다. 심야(05:15 KST)에 사람이 대본을 쓰는 운영은 성립하지 않으므로, **모든 포맷의 대본은 seed JSON → 슬롯 치환이 기본이고 사람이 자유 작문하는 것은 훅 2줄과 루프 1줄뿐이다.**

| | **T2 장시작 전** | **T3 장중 이벤트** | **T4 장마감** | **T5 종목 (주말)** |
|---|---|---|---|---|
| **트리거** | 20:30 KST / 07:30 ET 고정. `market/status`가 holiday면 스킵(휴장일 스냅샷은 0%로 찍힌다) | 등급 A: 지수 σ≥2.5 & vol≥1.5 / A′: 개별 σ≥3.0 & vol≥2.0 & \|일간%\|≥4.0 / B: σ≥2.5 & vol≥1.5 + urgency≥8 뉴스 매칭 / C: REVERSAL 1건. **하루 1편**(FOMC·CPI일만 2). 개장 15분·마감 30분 이내 금지 | 05:10 KST / 16:10 ET 고정. 조기폐장은 `market/status`로 판정 | 토 09:00 KST. 대상 = 지난주 movers 누적 1위 또는 `live/earnings` D-3 이내 |
| **답하는 질문** | 오늘 개장을 무엇이 규정하나 | 방금 무슨 일이 있었고 우리 데이터에서 확인되나 | 오늘의 한 문장과 그 반례는 무엇인가 | 이 종목의 세 층은 같은 말을 하나 |
| **훅** | H4 / H1 | **H2 / H1** | **H3 / H1** | **H1 / H2** |
| **소스** | `market/macro` · `market/index-close` · `market/movers` · `guardian/news-digest` · `guardian/briefing`(모닝브리핑·RLSI 서술) · `guardian/fedwatch` · `guardian/economic-calendar` · `flow/realtime-metrics` | `guardian/breaking?debug=1` · `live/news?t=`(뉴스+marketContext 1콜) · `live/options/structure` · `live/options/trades` · `flow/realtime-metrics` · `intel/fast?sector=` | `market/index-close` · `intel/cross-sector-brief` · `intel/snapshot?sector=` · `market/movers` · `guardian/news-digest` · `live/analyst?t=` · `market/macro` · `live/treasury` | `command/unified?t=` · `flow/unified?t=` · `live/options/structure` · `live/analyst?t=` · `command/13f` · `command/insider` · `sparkline?symbol=` |
| **캡처** | `t2-dash` `t2-guardian` `t2-movers` | `t3-<T>-cmd` `t3-<T>-flow` (+지수면 `t3-dash`) | `close-dash` `close-intel` `close-movers` `close-<주인공>-cmd` | `t5-<T>-cmd` `t5-<T>-flow` (금요 마감 후 촬영) |
| **비트 구성** | 7 — market → chips → **shot** → depth → conflict → evidence(source) → **depth(L5)** | 6 — money → **shot** → source → conflict(옵션 북) → chips(피어) → verdict(지수 대비) | 8 — market → conflict → **shot(dash)** → money(섹터) → **shot(intel)** → chips(주인공) → source → **depth(L5)** | 8 — market → money(주간 chart) → conflict → **shot(cmd)** → depth(옵션 북) → **shot(flow)** → consensus(중간) → **depth(L5)** |
| **길이 / 낭독** | 36~40s / ≤34s | **28~34s** / ≤24s (`--short`) | 40~46s / ≤34s | 38~44s / ≤34s |
| **자산(배경)** | 세션·베뉴 2 + 섹터 1~2 + 이벤트 1 | 종목 섹터 2 + `breaking_newsroom` | 세션(마감) 2 + 섹터 2 + 이벤트 1 | 종목 섹터 3 |
| **폴백** | 뉴스 없음(urgency<5) → 훅 H1(이상치)로 전환, 줄기를 «내부 분산»으로(`intel/fast`). 캡처 `.txt` 키워드 검증 실패 → **발행 금지 → EVERGREEN 소진**. API 2개 이상 결측 → EVERGREEN | 임계 미발동 → **만들지 않는다**. 원인 뉴스 없음 → source 비트를 옵션 프린트 depth로 교체. **감지~캡처 15분 초과 → 취소 후 T4 비트로 흡수(기본값)** | 보합(3지수 \|%\|<0.2) → 섹터 스프레드로 전환. 모순 없음 → H1으로. `cross-sector-brief` 결측 → `intel/fast`로 섹터 승패만, 7비트 발행 | 옵션 결측 → 13F/인사이더 층으로. 그것도 없으면 섹터 스포트라이트(`intel/snapshot?sector=`) |

**게이트**: T3만 `node scripts/video-ref-measure.mjs <file> --short` (이미 구현되어 있고 하한 36s만 우회한다). **상한 50s는 전 포맷 동일** — 새 밴드를 만들지 않는다.

**EVERGREEN 재고 상시 2편**(시의성 0, 우리 화면만으로 성립, 배너에 `as of <날짜>` 고정): ①맥스페인이 화면 위 무엇인가 ②다크풀 비중은 어디에 찍히나 ③애널리스트 집계는 이렇게 생겼다.

---

## 4. 비주얼 — 심볼과 배경

### 4-1. LogoChip 규칙

심볼의 출처는 **우리 파일 / 우리 프록시 / 우리 코드** 셋뿐이다.

```ts
type SymbolRef =
  | { kind: 'ticker'; t: string }   // public/shorts/logos/<t>.* — 매니페스트에 있는 것만
  | { kind: 'glyph'; id: GlyphId }  // 코드가 그리는 지수·지표 마크
  | { kind: 'mono'; text: string }  // 결정론적 hue 모노그램 폴백
  | { kind: 'brand' }               // public/app-icons/*.png
  | { kind: 'none' };               // 심볼 없음을 «명시» (린트 통과용)
```

| 티어 | px | 슬롯 | 숫자 폰트 |
|---|---|---|---|
| `micro` | 34 | tape | 24 |
| `xs` | 48 | shot 코너 태그 / source | — |
| `sm` | 64 | rows | 50 |
| `md` | 80 | versus / chart / consensus | 58~62 |
| `lg` | 96 | logos 리스트 | 56 |
| `xl` | 128 | stat | 96 |
| `duo` | 340 | versus big / 훅 좌우 | 96 |
| `hero` | **620** | **훅 히어로 (컷당 1개)** | **200** |

- 플레이트: `#FFFFFF` 0.96, `inset 0 0 0 1px rgba(10,14,22,.12)`, `0 6px 18px rgba(0,0,0,.35)`, radius `size×0.23`, 내부 이미지 `size×0.72` `contain`. 사진 배경 위 소형 칩은 `plate:'ghost'`.
- 폴백 사슬 `png → svg → 모노그램`. **파일 확장자를 하드코딩하지 않는다** — 현재 `Briefing.tsx` L307이 `.png`를 박아 넣고 있어 `AMZN.svg`·`VIX.svg`는 로드되지 않고 미보유 티커(`GS` 등)는 렌더를 깬다.
- `/api/logo/<T>`는 미보유 티커에 **200 + `image/svg+xml` 이니셜 칩**을 돌려준다. 수확 스크립트는 **Content-Type으로 확장자를 결정**하고, SVG 이니셜 칩은 저장하지 않고 `mono`로 남긴다.
- 매니페스트에 `source` / `licenseChecked` 필드를 둔다. `licenseChecked !== true`면 **렌더 거부**.
- 지수·지표 글리프(소형 슬롯 전용, 앱 `getSymBadge` 색 계승): `NDX`(#0891b2) · `500`(#dc2626) · `DJI`(#0284c7) · `2K`(#7c3aed) · `C`=VIX(#1e1b4b + 시안 링) · `10Y` · `$` · `OIL` · `AU` · `₿` · `FED`.
- **모든 숫자 블록의 각 항목은 `sym`을 갖거나 `{kind:'none'}`을 명시**해야 한다. 심볼 없는 숫자 카드는 «어느 종목인지 모르는 숫자»다.
- 등락 표시는 **3채널 동시**: 색(`#3DE38F`/`#FF5C74`/회색) + 화살표(`▲`/`▼`/`■`) + 부호(`+`/`−` U+2212). 카드 좌측 6px 레일은 실선/파선/점선.
- `versus`의 좌=초록·우=빨강 **하드코딩을 제거**한다(`Briefing.tsx` L281). 중립값이 하락으로 칠해지는 것은 허위 진술이다.

### 4-2. 배경 매칭 결정표

해석 순서는 위에서 아래, 처음 걸리는 것으로 확정 (`resolveBackdrop(beat, i, session)`).

| # | 조건 | 배경 | 이유 |
|---|---|---|---|
| 1 | `beat.bg` 명시 | 그대로 | 대본 최우선 |
| 2 | `visual.kind === 'shot'` | 절차 `grid·amber` 고정 | 캡처가 주인공, 배경이 경쟁하면 안 된다 |
| 3 | `beat.topic` + `BACKDROP_LIB[topic].video` (status `live`) | 생성 영상 | 기본값. 움직임 > 정지 |
| 4 | `beat.topic` + `.image` (status `live`) | 생성 이미지 + 느린 줌 | |
| 5 | `role === 'money'` && `data.series`가 실데이터 | 절차 `series` | 배경이 곧 실제 가격 곡선 |
| 6 | `ROLE_TOPIC_DEFAULT[role]`이 라이브러리에 있음 | 그 토픽 자산 | market→세션키, chips→섹터키, conflict→**당일 주제키**, depth→종목/섹터키 |
| 7 | 그 외 | 절차 `grid` | 최후 폴백 |

- **Scrim 2모드**: 절차 배경은 기존 그라디언트(상 0.86/하 0.82), 사진·영상은 **글자가 실제로 있는 띠만** 덮는다(상 0.70 → 20% 0.26 → 44% 0.06 → 53% 0.16 → 하 0.74). 영상 필터는 `saturate(0.94) brightness(1.04)` — 밝기를 깎지 않는다.
- **클립 재사용**: 같은 클립 × 같은 역할은 **3일 내 금지**. 한 편 안에서 두 번 쓸 때는 `startFrom` 지터(`(i*37) % (frames-len)`).
- `loopFrames` 하드코딩(`148`) 폐지 → `Math.floor(asset.sec × fps) - 3`, `sec`은 `ffprobe` 실측을 수확 스크립트가 기입.
- **재고 확보 전 완화 조항**: 라이브 자산이 23클립 미만인 동안 «절차 배경 최대 2컷» 규칙을 **최대 4컷**으로 완화한다. 23클립 달성 후 2컷으로 복귀.

### 4-3. 금지사항

| 금지 | 이유 |
|---|---|
| `ticks` 절차 배경 | 배경이 **가짜 시세 숫자**를 그린다 — «같은 지표 두 숫자 금지» 위반 |
| `data.strikes` 없는 `strikes` | 시드 난수 사다리 = 의미 0 |
| `hf_darkpool.png` | AI가 그린 가짜 시세(¥23,000·+4.5%). `spec.ts`의 `darkpoolRisky` **export 자체를 삭제**한다 |
| `hf_fab_bright_LOGOFAIL.png` | `no logos` 지시에도 실로고 생성 |
| 훅에 절차 배경 | 추상 배경은 3초 안에 아무 정보도 주지 않는다 |
| **빈 판·빈 타일·빈 페데스탈 배경** | «완전히 비어 있는» 소재는 추상 그리드와 정보량이 같다. 대표가 지적한 그 자리로 되돌아간다 |
| **은유 배경**(파도=반등, 저울=달러, 마라톤=브레드스) | 1초 안에 해독되지 않는다. v1은 **문자적 소재만** |
| 로고 워터마크(숫자 뒤 겹침) | 판독성·상표 양쪽 손해 |
| 화이트리스트 밖 생성물 | `ASSET_WHITELIST.json`에 `status:'live'`가 없으면 **렌더 거부** |

---

## 5. 배경 라이브러리 (생성 목록)

**보유 자산(재사용)**: `sd25_riskon_morning.mp4`(→`district_dawn`), `sd25_floor_dolly.mp4`·`sd25_floor_dolly_ext.mp4`·`sd25_trader.mp4`(→`floor_open_rush`), `sd25_fed_columns.mp4`(→`fed_columns`), `hf_wafer.png`(→`semis_fab` 이미지 폴백), `hf_dawn.png`, `hf_gold_tunnel.png`(브랜드). `sd25_calm_sea`·`sd25_whale`은 은유이므로 **레거시 폴백 전용**, 신규 대본에서 사용 금지.

**발주 규칙**: Higgsfield 웹 UI(현재 MCP 미인증 — 대표가 인증하기 전까지 웹 UI가 유일 경로). **9:16 / 720p / 5s(엔드카드용만 8s)** 는 UI 파라미터로 지정하고 프롬프트에 넣지 않는다. Generate 버튼이 Unlimited 배지인지 확인하고, 크레딧 숫자가 보이면 클릭하지 않는다. 수확 후 `npx remotion ffmpeg`로 1080×1920 lanczos 업스케일 → `scripts/scan-generated-asset.mjs` 통과 → 화이트리스트 등록.
**런치 최소 재고 = 23클립**(아래 19키 중 세션·베뉴 4키는 각 2테이크). 미달 상태에서는 T3를 개시하지 않는다.

| key | 용도 | 유형 | 프롬프트 |
|---|---|---|---|
| `district_dawn` | T2 훅 기본 · 개장 전 (**×2테이크**, 1개 보유) | video | `First sunlight breaks across a dense financial district skyline, low mist drifting between glass towers as their east faces ignite with warm gold reflections while the streets below stay in cool blue shadow; premium cinematic look, radiant golden-hour lighting; one continuous slow crane-up camera move rising past the towers, no cuts, vertical framing. No subtitles, no on-screen text.` |
| `floor_open_rush` | 개장 러시 · `market` 기본 (**×2테이크**, 3개 보유) | video | `Analysts and traders stride briskly across a vast sunlit trading floor as the workday begins, tall windows flooding the white desks and glass partitions with clean morning daylight, monitors appearing only as soft out-of-focus glow with no readable content; premium cinematic look, crisp high-key lighting; one continuous slow tracking camera move alongside the walking crowd, no cuts, vertical framing. No subtitles, no on-screen text.` |
| `floor_still` | 정체·모순 컷 · `conflict` 기본 (**×2테이크**) | video | `Analysts stand still at their desks on a wide sunlit trading floor, arms folded, heads turned toward the same side of the room, daylight pouring across pale desks and glass partitions, monitors appearing only as soft out-of-focus glow with no readable content; premium cinematic look, crisp high-key lighting; one continuous slow lateral truck camera move behind the standing row, no cuts, vertical framing. No subtitles, no on-screen text.` |
| `close_goldenhour` | T4 훅 기본 · 마감 (**×2테이크**) | video | `Warm low evening sun rakes across a nearly empty trading floor as the last analysts gather their papers, long golden shadows stretching over polished desks, monitors appearing only as soft out-of-focus glow with no readable content; premium cinematic look, rich golden-hour lighting; one continuous slow pull-back camera move away from the floor, no cuts, vertical framing. No subtitles, no on-screen text.` |
| `semis_fab` | 반도체 섹터 · 칩 종목 | video | `Technicians in white cleanroom suits move a polished silicon wafer cassette between two tool bays inside a brilliantly lit semiconductor fab, mirror-bright wafer surfaces catching the even white ceiling light, spotless pale floors reflecting the machines; premium cinematic look, luminous high-key industrial lighting; one continuous slow tracking camera move down the tool aisle, no cuts, vertical framing. No subtitles, no on-screen text, no branding or markings on the equipment.` |
| `ai_datacenter` | AI·클라우드 · 대형 테크 | video | `A long aisle of tall server racks stretches through a brightly lit white data hall, dense cable bundles running in neat parallel lines overhead, a technician walking between the rows, indicator lights appearing only as soft out-of-focus glow with no readable content; premium cinematic look, clean high-key lighting; one continuous slow push-in down the aisle, no cuts, vertical framing. No subtitles, no on-screen text, no branding on the racks.` |
| `energy_refinery` | 에너지·원유 | video | `Gleaming steel pipework and distillation columns of a refinery rise against a clear blue sky in strong afternoon sun, white steam curling from a vent stack, clean industrial geometry repeating into the distance; photorealistic cinematic style with hard bright daylight; one continuous slow orbit camera move around the column cluster, no cuts, vertical framing. No subtitles, no on-screen text, no markings on the tanks.` |
| `financials_district` | 금융·은행 | video | `People in business coats cross a wide sunlit plaza between tall stone-and-glass bank towers at mid-morning, long clean shadows falling across the pale paving, glass facades throwing bright reflections; photorealistic cinematic style with crisp high-contrast daylight; one continuous low crane-down camera move toward the walking crowd, no cuts, vertical framing. No subtitles, no on-screen text, no signage or lettering on the buildings.` |
| `healthcare_lab` | 헬스케어·제약 | video | `A researcher in a white coat and gloves pipettes clear liquid into a tray of sample wells inside a pristine sunlit laboratory, daylight pouring through wide windows across white benches and gleaming glassware; photorealistic cinematic style with bright clinical high-key lighting; one continuous slow push-in toward the pipette tip, no cuts, vertical framing. No subtitles, no on-screen text, no labels on the containers.` |
| `consumer_retail` | 소비재·리테일 | video | `Shoppers carrying paper bags walk through a bright daylit mall concourse under a wide glass roof, sunlight falling in clean bands across the polished pale floor, plain unbranded storefronts lining both sides; photorealistic cinematic style with luminous high-key lighting; one continuous slow tracking camera move alongside the shoppers, no cuts, vertical framing. No subtitles, no on-screen text, no store signage or lettering.` |
| `industrials_yard` | 산업재·기계 | image | `Rows of heavy yellow earthmoving machines stand in a wide open equipment yard under strong midday sun, dust hanging gold in the air, clean hard shadows falling across compacted gravel, photorealistic editorial photography, vertical composition. No text, no logos, no model markings on the machines.` |
| `utilities_grid` | 유틸리티·전력 | video | `A line of high-voltage transmission towers marches across bright green rolling hills under a clear summer sky, conductor lines catching sharp sunlight as they sweep from tower to tower toward the horizon; photorealistic cinematic style with crisp high-key daylight; one continuous low aerial truck camera move alongside the tower line, no cuts, vertical framing. No subtitles, no on-screen text.` |
| `materials_mine` | 소재·광물 | image | `Wide terraced benches of an open-pit copper mine descend in concentric rings under brilliant midday sun, haul trucks small on the switchback roads, warm ochre and green mineral banding across the rock faces, photorealistic editorial photography, vertical composition. No text, no logos, no markings on the trucks.` |
| `media_studio` | 커뮤니케이션·미디어 | video | `A crew adjusts lights and a camera rig on a bright film soundstage, wide softboxes throwing clean even illumination across a pale cyclorama wall, cables coiled neatly on the polished floor; photorealistic cinematic style with luminous high-key lighting; one continuous slow orbit camera move around the camera rig, no cuts, vertical framing. No subtitles, no on-screen text, no branding on the equipment.` |
| `cpi_supermarket` | CPI·물가 | video | `A long supermarket aisle stretches under bright even ceiling light, shelves densely packed with plain unbranded packaging in soft colors, shelf-edge labels blurred completely beyond legibility, a shopper's cart moving steadily down the aisle; photorealistic cinematic style with clean high-key retail lighting; one continuous slow truck camera move down the aisle, no cuts, vertical framing. No subtitles, no on-screen text.` |
| `jobs_campus` | 고용지표 | video | `Workers arrive through the bright glass lobby of a modern manufacturing campus in early morning light, sunlight pouring across a pale stone floor and casting long clean shadows as the group moves toward the interior; photorealistic cinematic style with crisp daylight; one continuous slow crane-up camera move above the arriving group, no cuts, vertical framing. No subtitles, no on-screen text, no signage or lettering.` |
| `earnings_stage` | 실적 발표 | video | `A bright modern auditorium fills with people taking their seats before a clean stage lit by warm even spotlights, tall windows along one wall pouring daylight across the pale seating, a plain lectern standing at center stage; photorealistic cinematic style with crisp high-key lighting; one continuous slow crane-down camera move toward the stage, no cuts, vertical framing. No subtitles, no on-screen text, no emblems or lettering on the lectern or the backdrop.` |
| `breaking_newsroom` | 속보·뉴스 인용 컷 | video | `A bright open-plan newsroom snaps to attention as several people rise from their desks at once and turn toward the far side of the room, daylight flooding through a full wall of windows, all monitors appearing only as soft out-of-focus glow with no readable content; photorealistic cinematic style with clean high-key lighting; one continuous slow push-in through the desk rows, no cuts, vertical framing. No subtitles, no on-screen text.` |
| `fed_columns_b` | 연준·정책 (보유 1개 + 2번째 테이크) | image | `Bright morning sunlight rakes across the tall fluted stone columns and plain smooth pediment of a generic neoclassical government building, deep clean shadows between the columns, clear blue sky above, photorealistic editorial photography, vertical composition. No text, no logos, no seals, emblems, carvings or lettering anywhere on the stone.` |
| `port_trade` | 무역·지정학 (P1) | video | `Towering gantry cranes work a vast container terminal under brilliant afternoon sun, stacks of plain unmarked containers in flat solid colors extending toward the water, a ship berthed alongside the quay; photorealistic cinematic style with hard bright daylight; one continuous high aerial truck camera move along the quay line, no cuts, vertical framing. No subtitles, no on-screen text, no markings or lettering on the containers or the hull.` |

**생성물 검수 게이트** (`scripts/scan-generated-asset.mjs`, 통과 못 하면 화이트리스트 등록 불가 → 참조 시 렌더 거부):
① 균등 9프레임 추출 → ② `meanBrightness ≥ 30` · `litPixelPct ≥ 15` → ③ OCR **FAIL 룰**: `conf>70`의 3자 이상 단어, **`[0-9]{2,}`, `%`, `$`, `▲`, `▼`, 2자 대문자 티커** 중 하나라도 검출되면 **FAIL**(FLAG 아님) → ④ 콘택트시트 `out/verify/<name>.png`를 사람이 1회 확인(실로고·실존 건물 형태) → ⑤ `ASSET_WHITELIST.json`에 `{file, prompt, model, generatedAt, verifiedBy, sec}` 기록.
**실존 건물 재현 폐기 규칙**: 거래소·연준 등 식별 가능한 실존 파사드·조각·페디먼트가 나오면 그 생성물은 폐기한다.

---

## 6. 앱 홍보 7초 엔드카드 (3앱 시리즈)

**기본값은 3.5초(105f)판이다.** 브리핑에 붙일 때는 105f를 쓴다 — 7초는 총 길이의 18%이고 페이오프 직후 1.8초의 정보 공백이 스와이프를 부른다. **7초(210f)판은 X·Bluesky·웹 히어로·광고 크리에이티브 헤드 전용**이며, 쇼츠 단독 발행은 하지 않는다(재사용 콘텐츠 판정 리스크). App Store 앱 미리보기는 **실화면 100% 별도 컴포지션**으로 만들고 엔드카드를 전용하지 않는다.

### 6-1. 구조 (105f 기본 / 210f 확장)

| 비트 | 105f | 210f | 화면에서 일어나는 일 |
|---|---|---|---|
| **E0 SEAM** | `0–5` (6f) | `0–11` (12f) | 직전 비트 지배색(`seamColor`)의 라이트 스윕 1회. 플레이트 페이드인 |
| **E1 REVEAL** | `6–50` (45f) | `12–101` (90f) | 폰과 궤도 패널 3장이 **동시** 진입. 폰 scale 0.88→1.00 · rotateY −8°→0°. 화면은 전부 실캡처 |
| **E2 LOCKUP** | `51–80` (30f) | `102–161` (60f) | 앱 아이콘 오버슈트(0.62→1.08→1.00) + 앱 이름 좌→우 마스크 리빌 + CTA 필 라이즈 |
| **E3 ASK/HOLD** | `81–104` (24f) | `162–209` (48f) | CTA → `loopAsk` 크로스페이드(같은 y, 레이아웃 점프 0). 마지막 6f 완전 정지 |
| 카메라 | 전 구간 단일 무브 `rotateY −7°→+5°`, `scale 1.06→0.98`, `perspective 1600` | 동일 | 정지 구간은 마지막 6f뿐 |
| 컷 확보 | E2 진입에 **그룹 scale 0.94→1.02 스텝** | 동일 | **화이트 플래시 금지** — 휘도 델타 ≤20%(광과민성 + 검출기 우회 회피) |
| 면책 | **f0부터 opacity 1**, 26px/700, opacity ≥0.85, SAFE 안 | 동일 | 브리핑 전역 면책은 `durationInFrames={endFrom}`으로 잘리므로 엔드카드가 직접 렌더한다 |

브리핑 부착 시 엔드카드가 **CTA 시퀀스와 루프백 시퀀스를 흡수**한다(`timingOf`가 `ctaSec=0, loopSec=0` 반환). 동시에 `Banner`·`BottomZone`·전역 면책을 `<Sequence durationInFrames={endFrom}>`로 감싼다 — 현재는 시퀀스 밖 `AbsoluteFill`이라 **UC/WIM 엔드카드 위에 SIGNUM 배너와 티커 테이프가 얹힌다.**

**크로스프로모 로테이션**: `ENDCARD_FOR('T2', date) = SIGNUM`(아침=최대 도달=본진), `ENDCARD_FOR('T4', date) = 짝수일 UC / 홀수일 WIM`.

### 6-2. 앱별 차이

| | **SIGNUM HQ** | **Undercurrent** | **Why'd It Move?** |
|---|---|---|---|
| 아이콘 | `app-icons/signum.png` (1024) | `app-icons/uc.png` (1024) | `app-icons/wim-1024.png` — **`design/wim-logo/c-icon-1024.png` 복사 선행**(현 `wim.png`는 128px라 116px 렌더가 확대가 된다) |
| 액센트 | `#FFB020` | `#C4441A` | `#FFA51F` |
| 잉크 / 패널 | `#FFFFFF` / `rgba(8,13,22,.74)` | `#1C1C1E` / `rgba(255,255,255,.82)` | `#FFFFFF` / `rgba(46,32,110,.62)` |
| 베젤 | `#0B0F18` | `#F5F2EC` | `#2A1E5E` |
| 플레이트 | `sd25_endcard_signum_1.mp4` | `sd25_endcard_uc_1.mp4` | `sd25_endcard_wim_1.mp4` |
| 플레이트 필터 | `brightness(1.02) saturate(0.95)` | `brightness(1.06) saturate(0.98)` | `brightness(1.04) saturate(1.02)` |
| 앱 이름 | `SIGNUM HQ` | `Undercurrent` | `Why'd It Move?` |
| 한 줄 | `The tape institutions leave behind` | `Where the news meets the money` | `Learn the market by playing it` |
| **CTA** | `Today's whole board. Free, with ads.` | `The other half of the story. Free, with ads.` | `Name the reason. Free, with ads.` |
| `loopAsk` | **그날 대본의 루프 문장** (폴백 `Which dial would you read first?`) | 폴백 `News or money — which moved first?` | 폴백 `Can you name the reason?` |
| 면책 | `Informational only. Not investment advice.` | 동일 | `Educational only. Not investment advice.` |
| VO 1줄 | `SIGNUM HQ. Free, with ads.` | `Undercurrent. Where the news meets the money.` | `Why'd It Move? Learn the market by playing it.` |
| hero 캡처 | `/en/app-view/dash` | `/en/undercurrent` | `/en/wim` |
| 패널 3장 | `cmd?t=NVDA` · `flow?t=NVDA` · `guardian` | `?tab=whale` · `?tab=div` · `?tab=macro` | 하단 `nav button:nth-of-type(2/3/4)` (캡처 스크립트 `click[]` 지원 선행) |

**CTA는 «무료»만 말하지 않는다** — 방금 본 것과 앱을 잇는 한 마디여야 한다. 동시에 광고 탑재·향후 IAP와 충돌하지 않게 `Free, with ads.`로 고정한다(`FREE · iOS & Android` 금지).
**티커 로고 아크는 넣지 않는다** — 광고·스토어 크리에이티브에서 타사 로고는 후원·제휴 오인이 된다.

### 6-3. i2v 프롬프트 3종

**레퍼런스 스틸은 반드시 마스킹해서 업로드한다.**
```bash
npx remotion still src/remotion/index.ts EndCardSignum \
  out/endcard-ref-signum.png --frame=40 --props='{"redact":true}'
```
`redact:true`면 폰·패널 화면이 **단색 마젠타**로 렌더된다. 실 UI 픽셀이 외부 모델로 나가지 않고, 최종 합성에서 덮개가 1px이라도 어긋나면 형광 마젠타가 튀어 육안으로 즉시 잡힌다. 락업(아이콘·앱이름·CTA)이 없는 프레임을 쓰는 이유는 AI가 우리 로고를 흉내 내지 못하게 하기 위함이다.

**① SIGNUM HQ**
```
@Image 1 is the exact starting frame and its subjects hold their exact appearance throughout: the smartphone at the centre and the translucent glass panels around it stay perfectly still, perfectly centred, and their surfaces keep exactly the flat solid colour they have in @Image 1. Animate the surrounding environment only: the navy-blue atmospheric haze breathes, golden dust motes drift slowly upward through the volumetric light shafts, one soft gold light sweep travels across the depth of the space from the upper left, and the reflections along the glass panel edges shimmer faintly as it passes. Any screens or displays appear only as soft out-of-focus glow with no readable content. Bright high-key atmospheric studio photography, premium commercial lighting, vertical framing. Locked-off tripod camera, the framing is identical in every frame, one continuous shot, no cuts. Soft low ambient hum. No subtitles, no on-screen text.
```

**② Undercurrent**
```
@Image 1 is the exact starting frame and its subjects hold their exact appearance throughout: the smartphone at the centre and the translucent glass panels around it stay perfectly still, perfectly centred, and their surfaces keep exactly the flat solid colour they have in @Image 1. Animate the surrounding environment only: the warm cream daylight haze breathes, fine paper dust drifts slowly through the air, one soft window-light sweep travels across the depth of the space from the left, and the reflections along the glass panel edges shimmer faintly as it passes. Any screens or displays appear only as soft out-of-focus glow with no readable content. Bright editorial high-key photography, natural daylight, premium business magazine lighting, vertical framing. Locked-off tripod camera, the framing is identical in every frame, one continuous shot, no cuts. Quiet room tone. No subtitles, no on-screen text.
```

**③ Why'd It Move?**
```
@Image 1 is the exact starting frame and its subjects hold their exact appearance throughout: the smartphone at the centre and the translucent glass panels around it stay perfectly still, perfectly centred, and their surfaces keep exactly the flat solid colour they have in @Image 1. Animate the surrounding environment only: the violet and indigo daylight haze breathes, amber sparks rise slowly through the frame, bokeh orbs at several depths parallax gently past each other, and one warm amber light sweep travels across the depth of the space from the lower right. Any screens or displays appear only as soft out-of-focus glow with no readable content. Bright playful high-key commercial photography, crisp saturated yet natural colour, vertical framing. Locked-off tripod camera, the framing is identical in every frame, one continuous shot, no cuts. Soft airy ambience. No subtitles, no on-screen text.
```

**i2v 결과 필수 검증 3건**: ① `npx remotion ffprobe`로 실파일 비율 확인(히스토리 메타가 16:9로 오기록된 전례) ② 첫·중간·끝 프레임에서 폰 사각형이 1px도 안 움직였는지 — 흔들리면 재생성 ③ §5 검수 게이트 통과. ②가 실패하면 i2v를 포기하고 플레이트 t2v(대기만 생성, 폰·패널은 전부 Remotion CSS 3D)로 되돌린다.
플레이트 사전 검수 하한은 **`meanBrightness ≥ 30`** — 게이트 하한 25에 겨우 맞추는 타협은 «평균밝기 5.2» 실패의 재발 패턴이다. 무제한 생성이므로 30을 넘을 때까지 재생성한다.

### 6-4. 오버레이 스펙 (레이어 스택, 아래 → 위)

| z | 레이어 | 구현 | AI 관여 |
|---|---|---|---|
| 0 | 플레이트 | `<OffthreadVideo>` full-bleed `cover`. **필터는 video 엘리먼트에만** | 생성물 |
| 5 | 톤 리프트 | `#9FB8D8` opacity .06 `mixBlendMode: screen` | — |
| 20 | 궤도 패널 3장 | `<AppShot>` + 틴트 + opacity. P1 `translate3d(-330,-80,-220) rotateY(26°) s.72 op.58` / P2 `(330,40,-260) rotateY(-26°) s.68 op.52` / P3 `(60,-300,-420) rotateY(-12°) rotateX(6°) s.52 op.40` | **실캡처** |
| 30 | 폰 | 베젤 `x352 y548 w376 h789 r44 pad12` + `<AppShot>` `x364 y560 w352 h765` + 글래스 스페큘러 | **실캡처** |
| 40 | 아이콘 글로우 | radial-gradient, 액센트색, opacity .28, r220 — **아이콘 아래 형제 노드** | 코드 |
| 41 | 앱 아이콘 | `<Img src={staticFile(icon)} />` **116px 고정** | 우리 PNG |
| 42 | 앱 이름 · 한 줄 | 58px/900/-0.03em · 26px/700 · y396 · gap20 | — |
| 43 | CTA 필 / loopAsk | y1360, h68, radius 999, 26px/900 | — |
| 50 | E0 시임 스윕 · E2 scale 스텝 | `AbsoluteFill` | — |
| 60 | 면책 | **26px/700, opacity ≥0.85, f0부터 상시** | — |

**절대 지킬 4가지**: ① 아이콘을 AI에게 참조로도 주지 않는다 ② 플레이트 필터를 아이콘 조상 노드에 걸지 않는다 ③ 아이콘 위 `mixBlendMode` 금지 ④ hero·패널 캡처는 **발행일 캡처**(파일 mtime = 발행일 린트)이며, 브리핑에 붙일 때 hero는 **그 대본이 숫자를 주장한 바로 그 캡처 파일**이어야 한다(같은 지표 두 숫자 금지).

---

## 7. 구현 체크리스트

### P0 — 이것이 머지되기 전에는 v3 대본이 렌더되지 않는다

| # | 파일 | 추가/수정 |
|---|---|---|
| 1 | `src/remotion/kit/symbols.ts` **(신규)** | `SymbolRef` · `GlyphId` · `LABEL_TO_GLYPH` · `AMBIGUOUS_LOGOS`(SPY/DIA/GLD/IWM/TLT — **예외 없이 글리프 강등**) · `ETF_GLYPH` · `resolveSymbol()` · `monogramHue()` |
| 2 | `src/remotion/kit/logo-manifest.ts` **(생성물)** | `LOGO_FILES` · `LOGO_MD5` · `LOGO_LICENSE`(`{source, licenseChecked}`) |
| 3 | `src/remotion/components/TickerMark.tsx` **(신규)** | `<TickerMark>` png→svg→모노그램 · `<IndexGlyph>` · `<MonogramChip>`. `Briefing.tsx` L307의 `.png` 하드코딩 제거 |
| 4 | `src/remotion/kit/spec.ts` | `SYM`(micro34…hero620) · `Tone`/`DELTA`/`fmtDelta` · `TOPIC_BACKDROP` · `DENY_ASSETS` · `ENDCARD`(frames 105 / `frames7s` 210) · `APP_SIG` / **삭제**: `BG_FOR`, `darkpoolRisky` / `GATE_HINT` → `scripts/gate.constants.mjs` 단일 출처 재export |
| 5 | `src/remotion/kit/backdrops.ts` **(신규)** | `TopicKey`(=`PROMPT_LIBRARY.json` key 네임스페이스) · `BACKDROP_LIB`(`{video, image, sec, status}`) · `ROLE_TOPIC_DEFAULT` · `resolveBackdrop()` · 화이트리스트 미등재 자산 참조 시 **throw** |
| 6 | `src/remotion/kit/Briefing.tsx` | `Beat.topic` / `askIsSummary` / `askAnswer` 추가 · `Visual` 전 블록에 `sym`·`tone`·`asOf` 추가 · `hook.sym`(hero 620) `hook.stamp`(ET 시각) · `bgOf()` → `resolveBackdrop()` · **L281 versus 하드코딩 색 제거** · `logos.size` · `BottomZone` 마이크로 칩 · **훅 구간 `Banner`/`BottomZone` 숨김** · 배경이 사진/영상일 때 `tone` 교대를 1→1.12로 완화 · 면책 26px/opacity .85 |
| 7 | `src/remotion/kit/Backdrop.tsx` | `Scrim` 2모드(`proc`/`photo`) · video 필터 `brightness(1.04)` · `loopFrames` 필수화 + `startFrom` · **`TicksBg` 폐기**(가짜 시세 숫자 생성부 제거) |
| 8 | `scripts/harvest-logos.mjs` **(신규)** | `/api/logo/<T>` 수확 — **Content-Type으로 확장자 결정**, SVG 이니셜 칩은 저장하지 않음, md5 중복 감사, `licenseChecked` 기입, 매니페스트 재생성. `--from-script` / `--audit` |
| 9 | `scripts/capture-app-screens.mjs` | SHOTS에 `click?: string[]`(온보딩 통과 후·광고 숨김 전 실행) · **기대 키워드 검증**(`RISK`/`FUTURES`/`FEDWATCH`/`MAX PAIN`)이 `.txt`에 없으면 **fail-closed** — 현재는 온보딩 동의서 스크린샷도 정상으로 남는다 |
| 10 | `scripts/lint-shorts-script.mjs` **(신규)** | §8 전 항목. 실패 시 렌더하지 않는다 |
| 11 | `scripts/scan-generated-asset.mjs` **(신규)** | §5 검수 게이트 5단 → `ASSET_WHITELIST.json` |
| 12 | `scripts/gate.constants.mjs` **(신규)** | `GATE` 단일 출처. `video-ref-measure.mjs`와 `spec.ts`가 함께 읽는다 |
| 13 | `src/remotion/Root.tsx` | `BriefingT3` · `BriefingT4` · `BriefingT5` 등록. **현재 등록 ID는 `BriefingT2`/`Briefing`/`BriefingFlip`/`BriefingClose`이며 `T2Open`은 존재하지 않는다.** 구판 V1~V37·MarketPressure*는 `archive/`로 이관 |
| 14 | 대본 상수 개명 | `SCRIPT_T2` / `SCRIPT_T3` / `SCRIPT_T4` / `SCRIPT_T5` 고정(`tts-beats.mjs`가 `SCRIPT_${NAME}` 룩업). **개명과 동시에 `mv public/shorts/audio/close public/shorts/audio/t4`** — 폴더명 기준 캐시라 안 옮기면 13세그 유료 재생성이 발생한다 |

### P1 — 엔드카드·자동화

| # | 파일 | 내용 |
|---|---|---|
| 15 | `src/remotion/kit/EndCard.tsx` **(신규)** | `EndCardProps`(`app`·`hero`·`panels`·`plate`·`mode`·`loopAsk`·`seamColor`·`redact`·`length:'short'\|'long'`) · `ENDCARD_FRAMES = 105` |
| 16 | `src/remotion/kit/endcards.ts` **(신규)** | `ENDCARD_SIGNUM` / `ENDCARD_UC` / `ENDCARD_WIM` + `ENDCARD_FOR(kind, dateISO)` |
| 17 | `src/remotion/kit/Briefing.tsx` | `endCard?: EndCardProps` · `timingOf`에서 `ctaSec=0/loopSec=0` · `durationOf`에 `ENDCARD.frames` · CTA/루프 시퀀스 치환 · **`Banner`/`BottomZone`/전역 면책을 `<Sequence durationInFrames={endFrom}>`로 감쌈** |
| 18 | `src/remotion/components/AppShot.tsx` | `callouts?: ShotCallout[]`(58f/88f 스태거) · `tag?` · `asOf` 라벨 · `redact` 프롭 |
| 19 | `public/app-icons/wim-1024.png` | `cp design/wim-logo/c-icon-1024.png` |
| 20 | `scripts/tts-endcards.mjs` **(신규)** | `tts-ads.mjs` 복제. 앱별 1줄 → `voice-endcard-<app>.ts` |
| 21 | `scripts/shorts/harvest-day.mjs` **(신규)** | 포맷별 API 병렬 수집 → `public/shorts/seeds/<date>-<fmt>.json` |
| 22 | `scripts/shorts/pick-backdrop.mjs` **(신규)** | seed → topic 키 배정 + `DENY_ASSETS` 필터 + **3일 사용 이력 회피** |
| 23 | `scripts/shorts/fill-script.mjs` **(신규)** | seed + 캡처 `.txt` → 대본 슬롯 치환. 사람이 쓰는 것은 훅 2줄·루프 1줄뿐 |

### P2

| # | 내용 |
|---|---|
| 24 | `src/remotion/kit/archive/` 로 구판 대본·컴포지션 이관 |
| 25 | T3 자동 파이프(`breaking-detect?dry=1` 5분 폴링 → seed → 고정 템플릿 치환 → lint 2회 → 렌더). **`CRON_SECRET`은 Vercel env에만 있고 `.env.local`에는 없다** — 로컬 curl 런북은 그대로 돌지 않는다 |
| 26 | 자동 발행 전환 조건: lint fail-closed 30일 무사고 · 게이트 PASS율 ≥95% · 프레임0 OCR 자동검증 · 연속 2편 실패 시 데드맨. live 스위치는 대표만 켠다 |

---

## 8. 절대 규칙 (위반 시 발행 금지)

**출처**
1. 앱 UI 픽셀은 **100% 실캡처**다. AI가 그린 앱 화면, AI가 그린 로고, AI가 그린 숫자는 어떤 레이어에도 없다.
2. 심볼 이미지는 `public/shorts/logos/*` 또는 `public/app-icons/*`뿐이다. 매니페스트에 없거나 `licenseChecked !== true`인 티커를 참조하면 렌더를 거부한다.
3. 배경 생성물은 `ASSET_WHITELIST.json`에 `status:'live'`로 등록된 것만 쓴다. 미등재 자산 참조 시 렌더 거부(fail-open 금지).
4. 언론사 사진·기관 로고·실존 건물 재현물은 쓰지 않는다. 헤드라인은 **텍스트 인용 1줄 + outlet**뿐이고 본문은 우리 문장으로 재작성한다(원문 8-gram 일치 시 FAIL).

**숫자**
5. 대본의 모든 숫자는 캡처 `.txt` 또는 같은 순간의 API 응답에서 온다. `.txt` 결측이거나 기대 키워드가 없으면 **캡처 실패로 간주하고 발행하지 않는다**.
6. 한 영상 안에서 같은 지표에 두 개의 숫자가 등장할 수 없다. **배경 생성물 안의 판독 가능한 숫자도 위반이다.**
7. 모든 `shot`·`stat` 블록에 `as of <ET 시각>`을 표기하고, 훅 스탬프에 발행 시각을 넣는다. 실시간처럼 제시하지 않는다.
8. 미치환 플레이스홀더(`<outlet>`, `<slug>`, `[`, `]`, `<`, `>`)가 하나라도 남으면 FAIL.

**문장**
9. 미래형·조동사(`will`/`could`/`may`/`might`/`should`), 방향 암시(`lean higher`/`lean lower`/`headed toward`/`poised`/`on the verge`/`next leg`), 행동 지시(`go`/`wait`/`watch for`/`keep an eye on`/`don't miss`), 인과 단정(`after`/`because`/`on the back of`/`drove`/`sent`), 트레이딩 액션 용어(`support`/`resistance`/`breakout`/`setup`/`target`/`upside`/`downside`) — 정규식 검출 시 FAIL.
10. 매수·매도·보유 시사 0, 수익 암시 0. 우리 지표의 정확성을 주장하는 문구(`which dial reads true`) 금지.
11. 모든 `ask`는 다음 비트에서 닫히고, 마지막 `ask`는 질문이 아니라 합산이다(`askIsSummary`).
12. 자수 상한: `say` 52 / `ask` 46 / `head` 18×2 / `hook.line` 22×2 / `sub` 34 / `loop` 20×2. 마지막 줄이 1단어이거나 8자 미만이면(위도우) FAIL.
13. 낭독 합계(훅+비트) ≤ 34s. **사전 검사는 보정식(단어수 기반 추정 ×0.85) 경고, 하드게이트는 `voice-*.ts` 생성 후 합계로 렌더 직전에 건다.**

**화면**
14. 프레임 0에 심볼 히어로·대표 숫자·훅 라인·면책이 전부 불투명 1.0으로 존재하고, 배너·테이프는 없다.
15. 컷당 심볼 ≤3, `rows` ≤5행, `logos` ≤3항목(lg). 히어로 **컷**은 편당 1개(심볼 재등장은 무제한).
16. 숫자를 가진 모든 항목은 `sym`을 갖거나 `{kind:'none'}`을 명시한다. 등락은 색·화살표·부호 3채널을 동시에 쓴다.
17. 인접 비트의 배경 종류가 같으면 안 되고, 같은 클립 × 같은 역할은 3일 내 재사용 금지.
18. `ticks` 배경, `data.strikes` 없는 `strikes` 배경, 빈 판·은유 배경, `hf_darkpool.png`, `*_LOGOFAIL` — 전부 사용 금지.

**엔드카드**
19. 엔드카드 면책은 f0부터 opacity 1이고 26px 이상이다.
20. hero·패널 캡처는 발행일 캡처이며, 브리핑에 붙일 때 hero는 그 대본이 숫자를 주장한 캡처와 같은 배치여야 한다.
21. 엔드카드 단독으로 쇼츠 발행하지 않는다. 광고·스토어 크리에이티브에 타사 로고를 넣지 않는다.
22. 화이트 플래시로 컷을 만들지 않는다(휘도 델타 ≤20%).

**최종**
23. `node scripts/lint-shorts-script.mjs <ScriptId>` 통과 전에는 렌더하지 않는다.
24. `node scripts/video-ref-measure.mjs <file>` (T3만 `--short`) 통과 전에는 업로드하지 않는다. 상한 50s는 전 포맷 공통이다.
25. AI 생성 이미지가 사건 장면으로 쓰인 편은 화면 내 `Illustration · AI-generated` 라벨과 YouTube 「변경·합성 콘텐츠」 체크를 함께 단다.
26. 프레임 0·콜아웃 위치·자막 위도우는 사람이 눈으로 1회 확인한 뒤에만 발행한다.