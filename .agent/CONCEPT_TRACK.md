# 개념 설명 트랙 — 설계서

**근거** yt-dlp 전수 스캔 (채널 138곳 · 금융 쇼츠 348편, 2026-08-20) · `.agent/MARKET_SCAN.json`
**왜 여는가** 뉴스·분석 트랙은 **2만 회가 천장**이다. CNBC 23K · Yahoo 15K · FT 13K ·
Unusual Whales(우리와 같은 옵션 플로우) 11K. 100만+는 전부 **개념을 떠먹여주는 영상**이었다.

```
15,000,000  Inflation #animation                 Primate Economics
 1,300,000  Monkey explain Inflation             Primate Economics
   900,000  Stocks explained with bananas        Primate Economics
```

시의성이 없어 **에버그린**이고, 미리 대량으로 찍어둘 수 있어 **소재 병목도 같이 푼다.**

---

## 1. 우리만 할 수 있는 것 — 「개념 + 실제 숫자」

Primate Economics 는 개념만 설명한다. 우리는 **개념을 설명하고 그 개념이 «지금 얼마인지»를
실제 앱 화면으로 보여줄 수 있다.** 이게 따라할 수 없는 차별점이다.

```
개념 도해(그림)  →  "그래서 지금 AMD 는?"  →  실제 앱 화면 (MAX PAIN $450)
```

---

## 2. 주제 — ★ 검색 수요 실측 순 (2026-08-20 재측정)

⛔ **이전 표(조회 중앙 318K/29K/2.9K)는 폐기.** 그건 «내가 중요해 보인다»로 매긴 순서에
가까웠다. 실제 검색 수요를 재니 순서가 뒤집혔다.

### 옵션·기술지표 군

| 순 | 개념 | 검색어 | 수요(중앙) | 상태 |
|---|---|---|---|---|
| 1 | **RSI** | rsi indicator explained | **33,947** | ✅ 제작완료 (C2) |
| 2 | VWAP | what is vwap trading | 26,831 | |
| 3 | 마켓메이커 | market makers explained | 15,881 | |
| 4 | 콜월/풋플로어 | call wall put floor | 12,628 | |
| 5 | 옵션만기·맥스페인 | options expire worthless | 2,822 | ✅ 제작완료 (C1) |
| 6 | 고래플로우 | unusual options activity | 1,170 | |
| 7 | 감마스퀴즈 | gamma squeeze explained | 984 | |
| 8 | 다크풀 | dark pool trading explained | **404** | ← 내가 3순위로 적었던 것 |

### 매크로·기초 군 — ⚠ 수요가 더 크다

| 순 | 개념 | 수요(중앙) | 최고 |
|---|---|---|---|
| 1 | how the stock market works | **42,562** | 8,567,344 |
| 2 | quantitative easing explained | **35,716** | 1,625,798 |
| 3 | etf vs stock | 29,475 | 727,692 |
| 4 | compound interest explained | 26,466 | 2,046,855 |
| 5 | **how the fed works** | 24,648 | 497,118 |
| 6 | yield curve inversion explained | 14,508 | 1,132,346 |
| 7 | short selling explained | 14,113 | 2,267,926 |
| 8 | dividend investing explained | 7,147 | 1,099,737 |

### ⚠ 결정이 필요한 지점

매크로·기초 군이 옵션 군보다 **수요가 크다**. 다만 「how the stock market works」류는
**완전 초보 시청자**를 부른다 — 우리가 파는 것(옵션 플로우 판단)과 시청자가 어긋날 수 있다.

**우리 데이터로 «우리 색»을 낼 수 있는 것부터 간다:**
- `how the fed works` · `yield curve inversion` → 앱에 국채 금리 데이터가 있다
- `short selling explained` → 앱에 숏스퀴즈 데이터가 있다 (`api/live/short-squeeze`)
- `quantitative easing` · `compound interest` → 우리 데이터로 더할 게 없다. 후순위

## 3. 제목 공식 — ⛔ 폐기됨 (2026-08-20 재측정)

> **아래 「+21 / +9 / -6」 표는 틀린 설계에서 나왔다. 쓰지 말 것.**
> 상위 69편 vs 하위 69편을 «채널 구분 없이» 비교했는데, 그러면 «어느 채널이냐»가
> 제목 효과로 둔갑한다. 구독자 200만 채널은 제목이 뭐든 조회수가 나온다.
>
> 채널 크기를 제거하고(같은 채널 안에서 log 조회수 z-점수) 다시 재니
> **제목·태그·설명의 모든 특징이 무의미**로 나왔다. 근거는
> [.agent/METADATA_BENCHMARK.md](METADATA_BENCHMARK.md) · `scripts/ref-meta.mjs`.
>
> 대신 확인된 것: **제목은 «피드»가 아니라 «검색»에서 일한다.**
> 그래서 검색 수요가 실제로 있는 문구를 앞에 놓는다.

<details><summary>폐기된 원본 표 (기록 보존)</summary>



(교차채널 비교 — 채널 정체성이 섞여 있다)

| 패턴 | 차이 | 규칙 |
|---|---|---|
| **고유명(티커·인물)** | **+21** | 제목에 «반드시» 티커를 넣는다 |
| how 로 시작 | +9 | `How ...` 로 연다 |
| 비교 vs | +7 | 둘을 맞붙인다 |
| 금액 $ | +6 | 숫자에 «$» 를 붙인다 |
| 2인칭 you/your | **-6** | **「당신」이라고 부르지 않는다** |
| 물음표 | -4 | 질문형을 쓰지 않는다 |


</details>

### 확정 제목 8개

```
1  How Max Pain Pulled AMD Toward $450
2  How Market Makers Make Money When Nvidia Moves
3  How Dark Pools Hid $282 Million in One Session
4  Gamma Flip vs Short Squeeze: The $500 Line on AMD
5  How Whales Move $44 Million Without Moving the Price
6  VWAP: The Line Institutions Trade Against
7  Call Wall vs Put Floor: The $50 Band AMD Sat In
8  RSI Said 61. The Options Book Said Something Else.
```

⚠️ 인물명은 «검증된 사실»일 때만. 버핏·버리 등을 넣으려면 근거 기사를 먼저 확인한다.

---

## 4. 비주얼 방향 — 「도해 → 실데이터」 3층

### 층 구조

```
① 배경   Flow 플레이트 (중간 톤 스튜디오·바닥 있음)      ← 이미 있음
② 도해   Remotion 벡터 애니메이션 «크고 단순»            ← ★ 새로 만든다
③ 페이오프 폰 목업 + 실제 앱 화면 + 리프트아웃            ← 이미 있음
④ 자막·효과음                                          ← 이미 있음
```

### 왜 도해를 «AI 영상이 아니라 Remotion 으로» 만드는가

실측(2026-08-19~20): Flow·Seedance 는 구도·조명은 훌륭하지만 **글자와 숫자를 재생성해서 무너뜨린다**
(`BULLISH`→`AMLLISH`, `MACRO BOARD`→`MACHO BOARG`). 도해는 «정확한 숫자와 선»이 생명이라
AI 영상으로 만들 수 없다. 벡터로 그리면 픽셀이 정확하고 타이밍도 자막에 묶을 수 있다.

### 톤 — «어둡게» 가 아니라 «중간 + 강한 대비»

기본 밝기 **90~150**. 화면에서 가장 밝은 것은 «도해와 숫자»여야 한다.
어두운 배경 위에 형광 도해를 얹어 대비로 화려함을 만든다. 톤을 낮춰 고급을 내려 하지 않는다.

### 도해 사양 (개념별)

| 개념 | 그림 | 움직임 |
|---|---|---|
| **Max Pain** | 가격 점 + 아래쪽 «자석» + 만기 눈금 | 만기가 다가올수록 점이 자석 쪽으로 당겨진다 |
| **Gamma Flip** | 수평선 하나, 위/아래 딜러 화살표 | 가격이 선을 넘는 순간 화살표가 «반대로» 뒤집힌다 |
| **Dark Pool** | 빙산 — 수면 위 작은 조각 / 아래 거대한 덩어리 | 수면이 내려가며 아래가 드러난다 |
| **Whale Flow** | 작은 점 수백 개 vs 큰 원 하나 | 큰 원이 여러 작은 점으로 «쪼개져» 흩어진다 |
| **VWAP** | 가격선 + 굵은 기준선 | 가격이 기준선 위·아래를 오가며 색이 바뀐다 |
| **Call Wall / Put Floor** | 위아래 두 벽 + 그 사이 공 | 공이 벽에 튕기며 갇힌다 |

### 구성 — 3비트 · 첫컷 ≤2.8초

```
0.0~2.5초   훅   개념 이름 + 한 줄 정의        (도해가 «움직이기 시작»)
2.5~8초     설명  도해가 개념을 실연            (숫자 없음 — 그림만)
8~14초      페이오프 폰 등장 + 실제 수치        ★ 여기가 우리만의 층
14~17초     CTA  FREE + 지표 칩
```

---

## 5. 대본 — 1번 「옵션 만기」 (수요 1위, 318K)

```
훅   (0.0~2.5)
     화면: 만기 눈금 위 가격 점 하나. 아래에 자석이 켜진다
     낭독: "Most options expire worthless. There is a price where the most of them do."
     자막: Most options expire worthless.

설명 (2.5~8.0)
     화면: 만기가 다가올수록 점이 자석 쪽으로 끌린다. 주변 옵션들이 하나씩 회색으로 꺼진다
     낭독: "That price is called max pain. It is where option buyers lose the most."
     자막: That price is called max pain.

     낭독: "It is not a prediction. It is just where the contracts are stacked."
     자막: Not a prediction. Just where the contracts sit.

페이오프 (8.0~14.0)
     화면: 폰이 올라오며 Command 화면 → MAX PAIN 타일 리프트아웃
     낭독: "On AMD right now, that price is four fifty."
     자막: On AMD right now: $450.

CTA (14.0~17.0)
     폰 목업 + MAX PAIN · GAMMA FLIP · WHALE FLOW · DARK POOL 칩 + FREE
```

**규칙**: 페이오프 전까지 «숫자를 말하지 않는다». 개념이 먼저 서야 숫자가 의미를 갖는다.
그리고 시세는 바뀌므로 **페이오프 숫자만** 재촬영 대상이다 — 나머지는 영구 재사용된다.

---

## 6. 필요한 영상 — Flow 발주 (10초 · 세로 9:16 · 무음 · 한 컷)

도해는 내가 그린다. **배경 플레이트만** 필요하다. 지금 라이브러리에 없는 톤이다.

### F-A · 중간 톤 그리드 스튜디오 (개념 트랙 기본 배경)
```
10s. An empty studio in mid-tone deep blue, brighter than a dark room but not white. A faint
grid of thin horizontal guide lines recedes into the distance like graph paper in space. Soft
even light from above, gentle volumetric haze, a subtle darker floor plane across the lower
quarter. The centre of the frame is completely open and unoccupied. One very slow camera
push-in. No cuts, no shake, no flashes. Vertical 9:16. No objects, no people, no subtitles,
no on-screen text, no logos, no numbers.
```

### F-B · 자력·인력 느낌의 추상 배경 (Max Pain·Gamma Flip 편)
```
10s. A dark blue field with faint concentric rings of light slowly contracting toward a single
point low in the frame, like a magnetic field drawn in light. Thin, elegant, high contrast
against the dark ground. Slow continuous contraction, no pulsing strobe. The upper half of the
frame stays open and clean. Vertical 9:16. No objects, no people, no subtitles, no on-screen
text, no logos, no numbers.
```

### F-C · 수면 아래 (Dark Pool 편)
```
10s. An underwater view just below a calm surface, looking up. Cool blue-green light shafts
come down through the water. The upper part of the frame is bright where the surface is, and
it grows darker with depth toward the bottom. Fine particles drift in the light. Nothing else
is in the water. One slow upward camera drift. Vertical 9:16. No creatures, no objects, no
people, no subtitles, no on-screen text, no logos.
```

### F-D · 유리벽 사이 (Call Wall / Put Floor 편)
```
10s. Two tall translucent glass walls facing each other with an empty corridor of space
between them, seen head-on. Cool cyan light glows along the inner edges of both walls. Gentle
haze fills the corridor. The corridor between the walls is empty. One slow camera push-in
down the corridor. Vertical 9:16. No objects, no people, no subtitles, no on-screen text,
no logos.
```

**검수**: 컷 0개 · 가운데 비어 있음 · 글자/숫자 없음 · 흰색 점멸 없음 · 평균 밝기 90 이상.

---

## 7. 운영

| | |
|---|---|
| 편성 | 하루 3편 중 **1편**을 개념편으로 (뉴스 2 + 개념 1) |
| 재고 | 개념편은 시의성 없음 → **미리 8편 찍어둔다** |
| 갱신 | 페이오프 숫자만 바뀐다. `capture-app.mjs` 한 번이면 전편 갱신 |
| 검증 | 개념편 vs 뉴스편 지속률을 원장에서 분리 비교 (`yt-ledger.mjs`) |

---

## 8. 1편 실제 완성본 — 「몰아치는」 개정 (2026-08-20)

첫 빌드가 **정적이고 읽히지 않았다.** 대표 지적 두 번을 그대로 반영해 다시 만들었다.

| 지적 | 고친 것 |
|---|---|
| "이것이 무엇인지 아무것도 모르게 만들어놓으면" | 추상 도해 폐기 → **AMD 2026 실제 일봉 64점** 위에 실제 레벨을 긋는다 |
| "너무 정적이다 몰아치듯이 정보를 밀어넣어야지" | 카메라·카운트업·정보패널·컷펀치·컷효과음 5종 투입 |
| "어떻게 활용하는지도 자막과 같이" | **활용법 4컷 신설** (cp1m~cp1p) — 붐비는 쪽을 색으로 칠한다 |

### 투입한 「밀도 장치」 5종

| 장치 | 구현 | 왜 |
|---|---|---|
| **카메라** | 컷마다 초점 이동 · 배율 1.00→1.16 | 정지 프레임을 없앤다 |
| **카운트업** | `+$0 → +$34`, `0.0% → 7.6%` 를 26프레임에 걸쳐 센다 | 숫자가 «도착»하는 감각 |
| **정보 패널** | 제목~차트 사이 죽은 공간에 3줄 스택, 구간마다 교체 | 나레이션 1줄에 화면 1줄이면 비어 있다 |
| **컷 펀치** | 컷 순간 0.9% 줌, 8프레임 감쇠 | 정보가 «꽂히는» 타격감 |
| **컷 효과음** | 컷마다 tick, 카메라 큰 이동 3곳에 whoosh | 귀로도 컷을 센다 |

### 패널 3단 — 구간마다 «읽을 것»이 바뀐다

```
정의   ① EVERY CONTRACT SITS AT A STRIKE
       ② ADD UP EVERY PAYOUT AT EXPIRY
       ③ ONE PRICE MAKES THAT TOTAL SMALLEST
숫자   $ SPOT      $484      ◆ MAX PAIN $450     ↑ GAP  +$34 · 7.6%   ← 세어 올라간다
활용   ▲ ABOVE → CALLS ARE CROWDED   ▼ BELOW → PUTS ARE CROWDED   ✕ NOT A PRICE TARGET
```

### ⛔ 레이아웃 함정 (실측으로 확인)

**줌은 화면 밖으로 글자를 밀어낸다.** 첫 시도에서 배율 1.42 · 초점을 오른쪽으로 잡았더니
가격축은 x=1238(화면 밖), `MAX PAIN $450` 라벨은 x=-197 로 잘렸다.

- 가로 초점은 **항상 W/2**, 배율 상한 **1.16**
- 가격축 라벨은 차트 «안쪽 왼쪽»에 둔다 — 바깥에 두면 제일 먼저 잘린다
- 차트 위 텍스트와 패널 텍스트가 **같은 문장이면 안 된다** (겹쳐 보이는 노이즈)
- NOW($484)와 MAX PAIN($450) 사이는 **45px 뿐** — 두 줄 라벨이 안 들어간다

### 실측 결과

| | 값 | 기준 |
|---|---|---|
| 길이 | **51.9초** | 레퍼런스 상위 3편 46·50·56초 |
| 평균 밝기 | **96.6** (최저 82.6 / 최고 108.6) | 중간대 90~150 ✔ |
| 라우드니스 | **-14.8 LUFS** | 유튜브 -14 ✔ |
| 컷 수 | 16컷 + CTA | 첫 컷 1.6초 |

### 캐릭터 — 이번엔 넣지 않았다

Primate Economics(1,570만)는 마스코트로 간다. 우리도 가능하지만 **8편 내내 같은 얼굴**이
유지돼야 하고, Flow·Seedance 는 얼굴을 매 컷 재생성한다. 넣으려면 캐릭터 시트를 먼저 굳혀
레퍼런스로 주입하는 별도 공정이 필요하다 — 이번 개정의 지적(정적·불가독)과는 다른 축이라 분리했다.
