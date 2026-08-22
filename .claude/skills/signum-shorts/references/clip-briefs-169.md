# 롱폼용 배경 발주서 — 16:9 · ani 스타일 (2026-08-22 개정)

> 대표 지시: **AI 느낌 · 캐릭터 · 그래픽이 자연스럽게 · 건조하지 않게 · 매력 있게.**
> 딱딱한 소재(통계·옵션·확률)를 친근하게 푸는 것이 ani 스타일의 역할이다.

---

## 0. 왜 실사가 아니라 ani 인가 — 근거

레퍼런스 3편의 «실제 화면»을 스토리보드로 받아 확인했다 (2026-08-22).

| 채널 | 조회 | 화면을 무엇으로 채우나 | 화면 위 글자 |
|---|---|---|---|
| **MonkeyExplains** | 99.6만 | **손그림 캐릭터가 장면을 «연기»한다** — 원숭이가 폰을 읽고, 의사 캐릭터가 도표를 가리키고, 금더미에 눕는다 | 거의 없음 (`S-1`, `42%` 같은 손글씨 라벨 몇 개) |
| **경제사냥꾼** | 13.8만 | **초록 마스코트가 매 장면 등장** + 실제 차트 + 실제 뉴스 사진 + 데이터 표 | 한 줄 자막 |
| **Think School** | 311만 | 진행자 얼굴 + 직접 만든 흐름 다이어그램 + 기사 스크린샷(형광펜) + 방송 클립 | 기사 원문 |
| **우리 1호** | — | 스톡 영상 + 텍스트 카드 | **한 화면에 53단어** |

**셋의 공통점 3개 — 우리는 하나도 없었다**
1. 화면에 **주인공이 계속 있다** (마스코트 / 캐릭터 / 사람 얼굴)
2. **실물을 보여준다** (실제 차트·기사·로고·방송)
3. **글자는 라벨이지 내용이 아니다** — 내용은 그림이 나른다

⛔ 참고: 2026-08-22 일본 «쇼츠» 조사에서는 캐릭터 애니가 인기 12편 중 0편이었다.
   **모순이 아니다.** 시장도 포맷도 다르다 — 일본 쇼츠는 실사, 영어 롱폼은 캐릭터가 이긴다.
   포맷마다 따로 잰다.

---

## 1. 캐릭터를 «하나»로 고정한다 — 시리즈가 되는 조건

MonkeyExplains 는 원숭이, 경제사냥꾼은 초록 지폐 마스코트다. **매 편 같은 캐릭터**라서 채널이 된다.
클립을 아무리 많이 뽑아도 캐릭터가 매번 다르면 시리즈가 안 된다.

### SIGNUM 캐릭터 고정 설정 (모든 프롬프트에 그대로 붙인다)

```
CHARACTER (identical in every clip):
A small rounded 3D character shaped like a chunky navy-blue ledger book with
two large friendly eyes on its front cover, short stubby arms and legs, a thin
amber bookmark ribbon hanging from the top like a scarf. Soft matte surface,
gentle rim light. Calm, curious expression. No mouth needed.
Pixar-like soft 3D, clean studio lighting, shallow depth of field.
```

**왜 장부(ledger)인가**: 우리 채널의 정체가 «세는 것»이다. 캐릭터가 하는 일이 곧 채널이 하는 일이어야 한다.
(경제사냥꾼의 초록 지폐 = 돈 이야기, MonkeyExplains 의 원숭이 = 아무나·보통사람 → 같은 원리)

⛔ 표정은 «눈»으로만 만든다. 입을 넣으면 립싱크가 안 맞아 어색해진다 (레퍼런스 둘 다 입을 거의 안 쓴다).
⛔ 캐릭터 «얼굴 클로즈업» 금지는 실사 규칙이었다 — 3D 캐릭터는 클로즈업해도 된다.

---

## 2. 16:9 · ani 공통 규칙

1. **16:9 가로, 1920×1080 이상.** Flow 는 **4 / 6 / 10초**만 받는다 → 기본 10초.
2. **화면 가운데를 비운다.** 우리 레이아웃: 상단 0~170 배너 · 186~370 제목 · **470~760 데이터 카드** · 하단 자막.
   ⇒ 캐릭터는 **좌 3분할 또는 우 3분할**에 세운다. 정중앙은 카드가 덮는다.
3. **느리게.** 빠른 카메라는 우리 게이트의 컷 판정에 걸린다 —
   실측: `datacenter-aisle` 프레임간 변화 34.1 로 **35/35 프레임**이 기준(18) 초과 → 「계속 컷」.
   ⇒ `very slow camera` `almost static` 명시.
4. **밝게.** 게이트 하한 평균밝기 **72**. ani 는 스튜디오 조명이라 대개 통과하지만 야간 씬은 피한다.
5. **장면 안 글자 금지.** AI 는 글자를 반드시 깨뜨린다 (달력 「WENESDAY」 사건).
   숫자·라벨은 우리가 Remotion 으로 얹는다.
6. **한 클립 = 한 동작.** 「캐릭터가 저울을 본다」처럼 동사 하나. 두 개 넣으면 둘 다 어중간해진다.

**매 프롬프트 끝에 붙일 고정 꼬리**
```
16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the center of
the frame clear so nothing important sits behind an overlay. Soft Pixar-like 3D,
clean bright studio lighting, shallow depth of field, warm neutral palette with
amber and cyan accents. No text, no signs, no readable screens, no logos.
```

---

## 3. 발주 목록 — 40개

캐릭터 설정 블록 + 아래 장면 + 고정 꼬리, 세 덩어리를 이어 붙여 넣으면 된다.
**우선순위 A → D 순.** A 만 있어도 한 편이 돌아간다.

### A. 캐릭터가 «세는» 장면 (우리 정체 · 최우선 12개)

| # | 파일명 | 장면 |
|---|---|---|
| 1 | `ax-count-tally` | The character stands at the left third, drawing tally marks one by one on a huge floating panel that fills the right side. Marks keep appearing slowly. |
| 2 | `ax-two-piles` | The character sorts glowing cubes into two piles on a bright floor, one pile clearly taller. Placed on the right third. |
| 3 | `ax-ledger-open` | Close on the character opening its own front cover like a book, soft amber light spilling out of the pages. |
| 4 | `ax-magnifier` | The character holds an oversized magnifying glass up to a floating grid of tiny glowing dots, standing left of center. |
| 5 | `ax-clipboard-check` | The character ticks boxes on a floating checklist panel with a stubby arm, one tick at a time. |
| 6 | `ax-long-corridor-count` | The character walks slowly down a bright corridor lined with hundreds of identical small glowing tiles on both walls. |
| 7 | `ax-stack-blocks` | The character stacks translucent blocks into a single tall column on a bright white floor, very slowly. |
| 8 | `ax-sort-conveyor` | A slow conveyor belt carries glowing tokens past the character, who picks one out and holds it up. |
| 9 | `ax-notebook-write` | The character writes on a floating notepad before a shutter opens behind it, the notepad clearly finished first. |
| 10 | `ax-calendar-grid` | The character stands before a large soft grid of blank squares stretching into the distance, looking up at it. |
| 11 | `ax-measure-tape` | The character stretches a glowing measuring tape across the frame, from left edge toward the right. |
| 12 | `ax-scale-watch` | The character watches a large balance scale settle, a few big spheres on one side, many small on the other. |

### B. 확률·방향·놀라움 (이번 편의 논지 · 10개)

| # | 파일명 | 장면 |
|---|---|---|
| 13 | `ax-coin-spin` | A large coin spins slowly in the air above the character, who watches it from below on the left third. |
| 14 | `ax-coin-hard` | The character flips a coin much harder than needed, the coin blurring upward out of frame. |
| 15 | `ax-two-doors` | The character stands between two identical glowing doorways, looking from one to the other. |
| 16 | `ax-high-jump` | The character looks up at a high jump bar that floats above it, the bar rising slightly higher. |
| 17 | `ax-bar-rises` | A glowing horizontal bar slowly lifts higher while the character watches from the right third. |
| 18 | `ax-storm-window` | The character watches a stylised storm through a bright window, distant lightning, the room calm. |
| 19 | `ax-umbrella-wait` | The character holds an umbrella under a clear bright sky, waiting, standing on the right third. |
| 20 | `ax-auction-gavel` | The character sits alone in a bright auction room where the gavel has already fallen, chairs empty. |
| 21 | `ax-price-tag` | An oversized blank price tag hangs in the air beside the character, gently swinging. |
| 22 | `ax-shrug-both` | The character holds one glowing sphere in each arm, weighing them, unable to decide. |

### C. 시장·기관·기업 (배경 층 · 10개)

| # | 파일명 | 장면 |
|---|---|---|
| 23 | `ax-trading-desk` | The character sits at a tiny desk in front of a huge wall of soft glowing panels, seen from behind. |
| 24 | `ax-exchange-steps` | The character walks up the wide steps of a stylised stone exchange building in warm morning light. |
| 25 | `ax-vault-door` | The character stands before an enormous round vault door that is slowly opening, backlit. |
| 26 | `ax-server-hall` | The character walks slowly between two rows of tall glowing server towers in a bright hall. |
| 27 | `ax-chip-city` | A miniature city built from computer chips, the character walking along one of its streets. |
| 28 | `ax-earnings-stage` | The character stands on a small bright stage with a single spotlight, an empty auditorium beyond. |
| 29 | `ax-crowd-of-copies` | Many identical smaller characters face the same direction while our character faces the other way. |
| 30 | `ax-podium-empty` | The character approaches an empty podium in a bright hall, microphones waiting. |
| 31 | `ax-boardroom-long` | The character sits alone at one end of a very long bright boardroom table. |
| 32 | `ax-window-city` | The character looks out a floor-to-ceiling window at a soft glowing skyline at dawn. |

### D. 감정·전환 (지루함을 끊는 층 · 8개)

| # | 파일명 | 장면 |
|---|---|---|
| 33 | `ax-lean-in` | The character leans in toward the camera with wide curious eyes, as if about to share something. |
| 34 | `ax-double-take` | The character turns away, then quickly turns back to look again at something off-frame. |
| 35 | `ax-eyes-widen` | Close on the character as its eyes slowly widen, bookmark ribbon lifting slightly. |
| 36 | `ax-sit-down-think` | The character sits down on the floor, chin resting on a stubby arm, thinking. |
| 37 | `ax-point-off` | The character points off toward the right edge of frame, body turned that way. |
| 38 | `ax-walk-away-turn` | The character walks away from camera, then stops and turns its head back. |
| 39 | `ax-tiny-vs-huge` | The character stands very small beside an enormous glowing shape that dwarfs it. |
| 40 | `ax-lights-on` | The character stands in a dim room as bright lights switch on one row at a time. |

---

## 4. 받은 뒤 반드시 하는 검수

```bash
# ① 16:9 인가
ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 <clip>

# ② 움직임 — 게이트 컷 판정에 걸리지 않는가 (18 초과 프레임이 적어야 한다)
node scripts/_clip-diff.mjs <이름>

# ③ 밝기 — 72 이상인가
ffmpeg -i <clip> -vf "format=gray,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-" -f null -

# ④ 캐릭터가 «같은 캐릭터»인가 — 한 장씩 뽑아 나란히 붙여서 눈으로 본다
ffmpeg -ss 1 -i <clip> -frames:v 1 -vf scale=320:-1 chk_<이름>.jpg
```

⛔ 넷 중 하나라도 어기면 라이브러리에 넣지 않는다.
⛔ 넣을 위치: `public/shorts/bg/video/`. 접두사 **`ax-`** (ani × 16:9). 세로 `ani-` 와 구분된다.
⛔ **캐릭터 일관성이 제일 중요하다.** 해상도가 조금 아쉬워도 캐릭터가 같으면 쓸 수 있고,
   화질이 좋아도 캐릭터가 다르면 시리즈가 깨진다.

---

## 5. 곁들여 필요한 것 — 클립이 아닌 자산

레퍼런스 셋이 전부 «실물»을 보여준다. 우리도 필요하다. **이건 발주가 아니라 우리가 만든다.**

| 자산 | 상태 | 만드는 법 |
|---|---|---|
| 종목 로고 | ✅ **이미 40개 있다** (`public/shorts/logos/`) | 종목이 언급되면 **글자가 아니라 로고**를 띄운다 |
| 실제 차트 | 🔲 없음 | Remotion 으로 그린다 — 우리가 제일 잘하는 일 |
| 분포 그림 | 🔲 없음 | 「401개월 중 여기」를 점 분포로. 남이 못 하는 그림 |
| 기사 스크린샷 | 🔲 없음 | 인용 시 출처 표기 필수 |
