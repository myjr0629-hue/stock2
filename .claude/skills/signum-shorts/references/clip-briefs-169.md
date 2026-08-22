# 롱폼용 배경 발주서 — 16:9 · ani 스타일 (2026-08-22)

> **한 블록을 통째로 복사해서 Flow 에 그대로 넣으면 됩니다.**
> 캐릭터 설정과 공통 꼬리가 이미 각 프롬프트 안에 들어 있습니다. 따로 붙일 것 없습니다.

---

## 왜 ani 인가 — 레퍼런스 실측 (2026-08-22)

레퍼런스 3편의 «실제 화면»을 스토리보드로 받아 확인했다.

| 채널 | 조회 | 화면을 무엇으로 채우나 | 화면 위 글자 |
|---|---|---|---|
| **MonkeyExplains** | 99.6만 | 손그림 캐릭터가 장면을 «연기»한다 | 거의 없음 |
| **경제사냥꾼** | 13.8만 | 초록 마스코트가 매 장면 등장 + 실제 차트·뉴스 사진 | 한 줄 자막 |
| **Think School** | 311만 | 진행자 얼굴 + 흐름 다이어그램 + 기사 스크린샷 | 기사 원문 |
| **우리 1호** | — | 스톡 영상 + 텍스트 카드 | **한 화면에 53단어** |

셋의 공통점 3개 — 우리는 하나도 없었다.
1. 화면에 **주인공이 계속 있다**
2. **실물을 보여준다**
3. **글자는 라벨이지 내용이 아니다**

⛔ 일본 «쇼츠»에서는 캐릭터 애니가 인기 12편 중 0편이었다. 모순이 아니다 —
   시장도 포맷도 다르다. 일본 쇼츠는 실사, 영어 롱폼은 캐릭터가 이긴다. **포맷마다 따로 잰다.**

---

## 발주 전 확인 3가지 (첫 캐릭터 시안에서 나온 것)

1. **책등·표지에 글자를 넣지 않는다** — 시안에 흐릿한 `LEDGER` 가 보였다.
   AI 는 글자를 반드시 깨뜨린다. 모든 프롬프트에 「완전히 비어 있다」를 넣어두었다.
2. **배경을 밝게** — 캐릭터가 남색이다. 우리 배경 37개 중 12개(32%)가 밝기 95 미만이고
   그 위에서는 실루엣이 사라진다. 모든 프롬프트에 「밝은 배경」을 넣어두었다.
3. **워터마크는 신경 쓰지 않아도 된다** — 요금제와 무관하게 끌 수 없다.
   16:9 는 크롭하면 비율이 깨지므로 «자르지 않고 그 자리만 메운다» (ffmpeg delogo).
   받은 파일을 그대로 넘기면 워터마크 제거 + 검수 + 라이브러리 저장이 한 번에 된다:

   ```bash
   node scripts/clip-ingest.mjs <받은파일.mp4> ax-count-tally --check   # 상자 위치만 확인
   node scripts/clip-ingest.mjs <받은파일.mp4> ax-count-tally           # 처리 + 검수 + 저장
   ```

   ⛔ 첫 클립에서 `--check` 로 상자를 한 번 맞춘 뒤로는 그대로 쓴다.

---

## 먼저 3개만 뽑아보기를 권한다

40개를 다 뽑기 전에 성격이 다른 셋만 확인하면 나머지가 안전해진다.

| 클립 | 확인하려는 것 |
|---|---|
| `ax-count-tally` | 좌 3분할 배치가 되는가 · 우리 정체 장면 |
| `ax-ledger-open` | 클로즈업에서 표지 글자가 튀지 않는가 |
| `ax-lean-in` | 눈만으로 감정이 읽히는가 |

받으면 실제 프레임에 얹어 대비·가독성·캐릭터 일관성을 재서 보고한다.

---

## 검수 (받은 뒤 반드시)

```bash
node scripts/clip-ingest.mjs <받은파일.mp4> <이름>
```
해상도(16:9) · 밝기(72+) · 움직임(18 초과 20% 이하) · 길이(5초+) 를 한 번에 재고,
워터마크를 지운 뒤 `public/shorts/bg/video/<이름>.mp4` 로 저장한다.

⛔ 넣을 위치 `public/shorts/bg/video/` · 접두사 **`ax-`** (세로 `ani-` 와 구분)
⛔ **캐릭터 일관성이 화질보다 중요하다.** 화질이 좋아도 캐릭터가 다르면 시리즈가 깨진다.

---

## A. 캐릭터가 «세는» 장면 — 우리 정체 · 최우선

### 1. `ax-count-tally`

```
10 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It stands on the left third and draws tally marks one at a time on a huge pale floating panel that fills the right side of the frame. The marks keep appearing, slowly. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 2. `ax-two-piles`

```
10 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It sorts glowing cubes into two piles on a bright floor, one pile clearly taller than the other. The character is on the right third. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 3. `ax-ledger-open`

```
10 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. Close on the character opening its own front cover like a book, warm amber light spilling out from between the pages. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 4. `ax-magnifier`

```
10 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It holds an oversized magnifying glass up to a floating grid of tiny glowing dots, standing left of centre. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 5. `ax-clipboard-check`

```
10 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It ticks boxes on a floating checklist panel with a stubby arm, one tick at a time, standing on the right third. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 6. `ax-long-corridor-count`

```
10 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It walks slowly down a bright corridor lined on both walls with hundreds of identical small glowing tiles. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 7. `ax-stack-blocks`

```
10 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It stacks translucent blocks into one tall column on a bright white floor, very slowly, standing on the left. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 8. `ax-sort-conveyor`

```
10 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. A slow conveyor belt carries glowing tokens past the character, which reaches out and lifts one up to look at it. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 9. `ax-notebook-write`

```
10 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It writes on a floating notepad while a large shutter stays closed behind it, the notepad clearly finished before the shutter opens. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 10. `ax-calendar-grid`

```
10 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It stands small in front of an enormous soft grid of blank squares that stretches away into the distance, looking up at it. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 11. `ax-measure-tape`

```
10 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It stretches a glowing measuring tape across the frame from the left edge toward the right, holding one end. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 12. `ax-scale-watch`

```
10 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It watches a large balance scale settle, a few big spheres on one side and many small ones on the other, standing on the left third. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

## B. 확률·방향·놀라움 — 이번 편의 논지

### 13. `ax-coin-spin`

```
10 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. A large coin spins slowly in the air above the character, which watches it from below on the left third. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 14. `ax-coin-hard`

```
10 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It flips a coin far harder than needed, the coin blurring upward and out of the top of the frame. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 15. `ax-two-doors`

```
10 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It stands between two identical glowing doorways, turning its head slowly from one to the other. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 16. `ax-high-jump`

```
6 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It looks up at a high jump bar floating above it, the bar drifting slightly higher as it watches. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 17. `ax-bar-rises`

```
6 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. A glowing horizontal bar lifts slowly higher while the character watches from the right third of the frame. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 18. `ax-storm-window`

```
10 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It watches a stylised storm through a bright window, distant lightning outside, the room around it calm and still. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 19. `ax-umbrella-wait`

```
6 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It holds a small umbrella under a clear bright sky, waiting, standing on the right third. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 20. `ax-auction-gavel`

```
10 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It sits alone in a bright auction room where the gavel has already fallen, the chairs around it empty. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 21. `ax-price-tag`

```
6 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. An oversized blank price tag hangs in the air beside the character, swinging very gently. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 22. `ax-shrug-both`

```
6 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It holds one glowing sphere in each stubby arm, weighing them, unable to decide between them. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

## C. 시장·기관·기업 — 배경 층

### 23. `ax-trading-desk`

```
10 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It sits at a tiny desk in front of a huge wall of soft glowing panels, seen from behind and slightly above. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 24. `ax-exchange-steps`

```
10 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It walks slowly up the wide steps of a stylised stone exchange building in warm bright morning light. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 25. `ax-vault-door`

```
10 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It stands before an enormous round vault door that is slowly swinging open, bright light spilling from behind it. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 26. `ax-server-hall`

```
10 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It walks slowly between two rows of tall glowing server towers in a bright white hall. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 27. `ax-chip-city`

```
10 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. A miniature city built out of computer chips and heatsinks, the character walking along one of its small streets. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 28. `ax-earnings-stage`

```
10 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It stands on a small bright stage under a single soft spotlight, an empty auditorium stretching away behind it. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 29. `ax-crowd-of-copies`

```
10 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. Many identical smaller versions of the character all face the same way, while our character faces the opposite way. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 30. `ax-podium-empty`

```
6 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It approaches an empty podium in a bright hall, microphones waiting on the stand. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 31. `ax-boardroom-long`

```
10 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It sits alone at one end of a very long, very bright boardroom table. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 32. `ax-window-city`

```
10 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It looks out through a floor-to-ceiling window at a soft glowing skyline at dawn, seen from behind. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

## D. 감정·전환 — 지루함을 끊는 층

### 33. `ax-lean-in`

```
6 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It leans in toward the camera with wide curious eyes, as if about to share something. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 34. `ax-double-take`

```
6 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It turns away from the camera, then quickly turns back to look again at something just off frame. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 35. `ax-eyes-widen`

```
6 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. Close on the character as its eyes slowly widen, the bookmark ribbon lifting slightly. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 36. `ax-sit-down-think`

```
6 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It sits down on the bright floor, resting its chin on a stubby arm, thinking. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 37. `ax-point-off`

```
6 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It points off toward the right edge of the frame, its whole body turned that way. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 38. `ax-walk-away-turn`

```
10 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It walks away from the camera, then stops and turns its head back over its shoulder. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 39. `ax-tiny-vs-huge`

```
10 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It stands very small beside an enormous glowing shape that dwarfs it completely. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```

### 40. `ax-lights-on`

```
10 seconds. A small rounded 3D character shaped like a chunky navy-blue ledger book, with two large friendly eyes on its front cover, short stubby arms and legs, and a thin amber bookmark ribbon hanging from the top like a scarf. The cover and spine are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light, calm and curious, no mouth. It stands in a softly lit room as bright overhead lights switch on one row at a time. The background is bright and light-toned so the navy character reads clearly against it. 16:9 horizontal, 1920x1080. Very slow camera, almost static. Keep the middle of the frame clear and uncluttered. Soft Pixar-style 3D, clean studio lighting, shallow depth of field, warm neutral palette with amber and cyan accents. No text, no signs, no readable screens, no logos, no watermark.
```
