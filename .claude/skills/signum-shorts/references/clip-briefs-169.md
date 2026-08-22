# 롱폼용 배경 클립 발주서 — 16:9 (2026-08-22)

> 쇼츠용 발주서(`clip-briefs.md`)는 **9:16 세로**가 규칙이다. 롱폼은 16:9 라 그 라이브러리를 쓸 수 없다.
> 이 문서는 «롱폼 전용» 규칙과 첫 발주 목록이다.

---

## 왜 새로 뽑아야 하나 — 실측

현재 배경 라이브러리 **136개가 전부 세로**다.

| 해상도 | 개수 |
|---|---|
| 720×1280 | 84 |
| 1080×1920 | 52 |
| **16:9** | **0** |

세로 클립을 1920×1080 프레임에 `objectFit: cover` 로 넣으면 이렇게 된다:

| 원본 | 확대율 | 실제로 보이는 부분 | 화면에 쓰이는 원본 픽셀 |
|---|---|---|---|
| 720×1280 | **2.67배** | 세로의 **31.6%** | 720×405 → 1920×1080 |
| 1080×1920 | 1.78배 | 세로의 31.6% | 1080×607 → 1920×1080 |

⇒ 첫 롱폼(`lfearn822_169.mp4`)이 쓴 고유 클립 43개 중 **42개가 720×1280** 이다.
   즉 지금 화면은 **405줄짜리 그림을 1080줄로 늘린 것**이다. 부드럽게 보이는 이유가 이것이다.

---

## 16:9 규칙 — 쇼츠와 다른 점만

쇼츠 발주서의 절대 규칙(초를 첫 단어로 · 텍스트 금지 문구 · 얼굴 클로즈업 금지)은 **그대로 지킨다.**
아래는 «롱폼이라서» 달라지는 것들이다.

1. **16:9 가로, 1920×1080 이상.** (쇼츠는 9:16)
2. **화면 가운데를 비운다.** 우리 롱폼 레이아웃은
   상단 0~170 배너 · 186~370 비트 제목 · **470~760 데이터 카드** · 하단 자막.
   ⇒ 클립의 «주인공»을 정중앙에 두면 카드에 가린다. **좌우 3분할 지점이나 아래쪽**에 둔다.
3. **느리게.** 빠른 돌리는 우리 게이트의 컷 판정에 걸린다 — 실측:
   `datacenter-aisle` 은 프레임간 변화 평균 **34.1** 로 **35/35 프레임**이 기준(18)을 넘겨
   「계속 컷」으로 읽혔다. 발주서에 `very slow`, `almost static` 을 명시한다.
4. **밝게.** 게이트 하한이 평균 밝기 **72** 다. 야간·실루엣 단독 컷은 피한다.
   (실측 탈락: `retail-checkout-empty` 45.2 · `retail-carts-dusk` 58.8 · `floor-empty-night` 69.5)
5. **아웃포커스 전면 금지.** 화면 전체가 흐리면 게이트의 「빈 화면 구간」에 걸린다
   (실측: `device-counter-bright` 프레임간 변화 2.8 → 본문 3.67초 공백 판정).
6. **길이 10초 기본.** Flow 는 4/6/10초만 받는다. 롱폼은 비트가 길어 5초짜리는 루프 이음새가 자주 보인다. 정적인 컷만 6초로 줄인다.

**매 프롬프트 끝에 붙일 고정 꼬리**
```
16:9 horizontal, 1920x1080 or higher. Very slow camera, almost static.
Keep the center of the frame simple and uncluttered.
No text, no signs, no readable screens, no logos. No face close-ups.
```

---

## 첫 발주 목록 30개 — 롱폼 1편을 덮는다

우선순위는 첫 롱폼에서 «실제로 쓴 횟수» 순이다. 위에서부터 뽑으면 된다.

### A. 거래소·기관 (신뢰의 층)

| # | 파일명 | 프롬프트 |
|---|---|---|
| 1 | `lf-tape-wall` | `10 seconds. A wall of financial data monitors in a dark trading room, numbers and small charts glowing in amber and cyan, seen slightly from the side so the wall recedes. Very slow push in.` |
| 2 | `lf-desks-dawn` | `10 seconds. An empty open-plan trading floor at dawn, rows of dark monitors, cold blue light coming through tall windows on the left. Very slow drift to the right.` |
| 3 | `lf-exchange-columns` | `10 seconds. Stone columns of a stock exchange building shot from below in golden late afternoon light, flags moving gently. Almost static, tiny handheld float.` |
| 4 | `lf-vault-door` | `10 seconds. A massive polished steel vault door, warm rim light, shallow depth only on the edges. Extremely slow rotation of the locking wheel.` |
| 5 | `lf-fed-facade` | `10 seconds. A neoclassical central bank facade in flat overcast daylight, wide and symmetrical. Static tripod shot with only clouds moving.` |
| 6 | `lf-floor-quiet` | `10 seconds. A trading floor after hours, lights half on, chairs empty, one screen still glowing far away. Very slow dolly forward, bright enough to read the room.` |

### B. 반도체·AI (소재의 층)

| # | 파일명 | 프롬프트 |
|---|---|---|
| 7 | `lf-pcb-macro` | `10 seconds. Macro of a green and gold circuit board, traces catching light, one chip subtly brighter than the rest, positioned left of center. Very slow lateral drift.` |
| 8 | `lf-one-chip-lit` | `10 seconds. A dense circuit board where exactly one processor glows cyan while everything else stays dark metal, the lit chip placed on the right third. Almost static.` |
| 9 | `lf-wafer-spin` | `10 seconds. A silicon wafer rotating slowly under clean-room light, rainbow diffraction across its surface, white bright environment. Very slow rotation.` |
| 10 | `lf-server-aisle-slow` | `10 seconds. A data centre aisle in bright white light, server racks on both sides, blue status LEDs. EXTREMELY slow dolly, nearly a locked shot.` |
| 11 | `lf-chip-city` | `10 seconds. A tilt-shift miniature city built out of computer chips and heatsinks, warm sunlight from the side, shallow miniature focus at the far edges only. Very slow crane up.` |
| 12 | `lf-euv-glow` | `10 seconds. Violet plasma light pulsing inside a lithography machine chamber, metallic housing around it, bright enough to see the machine. Almost static.` |

### C. 저울·확률·비교 (논증의 층)

| # | 파일명 | 프롬프트 |
|---|---|---|
| 13 | `lf-scale-balance` | `10 seconds. A polished metal balance scale on a bright white surface, a few large steel spheres on one side and many small ones on the other, evenly lit studio. Very slow orbit.` |
| 14 | `lf-steel-spheres` | `10 seconds. Rows of mirrored steel spheres on a bright white floor, soft studio light, one sphere slightly apart from the group. Almost static, tiny drift.` |
| 15 | `lf-coin-fall` | `10 seconds. A single metal coin tumbling in slow motion against a bright soft-grey background, sharp specular highlights. Extreme slow motion, coin left of center.` |
| 16 | `lf-dominoes-still` | `10 seconds. A long line of dominoes standing on a bright surface, the nearest one leaning but not falling, shallow depth at the far end only. Very slow push along the line.` |
| 17 | `lf-two-paths` | `10 seconds. A wide bright corridor that splits into two identical passages, clean architectural light, no signage. Very slow forward dolly toward the split.` |

### D. 사람·군중 (얼굴 없이)

| # | 파일명 | 프롬프트 |
|---|---|---|
| 18 | `lf-crowd-wide` | `10 seconds. A crowd of people seen from behind and above in a bright station concourse, motion blurred as they walk, no faces visible. Static high wide shot.` |
| 19 | `lf-paper-figures` | `10 seconds. Many small paper cut-out figures standing on a bright table, one of them turned the opposite way, soft daylight. Very slow push in.` |
| 20 | `lf-empty-boardroom` | `10 seconds. An empty boardroom with a long table and identical chairs, big windows, bright morning light. Slow lateral track past the table.` |
| 21 | `lf-hands-keyboard` | `10 seconds. Hands on a keyboard from a high side angle, screens out of focus behind, warm desk lamp, no face in frame. Almost static.` |

### E. 자연·은유 (비유의 층)

| # | 파일명 | 프롬프트 |
|---|---|---|
| 22 | `lf-storm-radar` | `10 seconds. A weather radar dish silhouetted against a bright dusk sky with distant lightning on the horizon, sky occupying most of the frame. Static shot.` |
| 23 | `lf-calm-sea-bright` | `10 seconds. A calm sea at first light with faint texture on the water and a bright horizon, small boat on the far right. Almost static, gentle swell.` |
| 24 | `lf-glass-tunnel` | `10 seconds. A bright glass corridor with repeating structural ribs, daylight flooding through, clean and empty. Very slow forward dolly.` |
| 25 | `lf-high-jump-bar` | `10 seconds. A high jump bar and standards on an empty athletics field in bright daylight, the bar sitting slightly right of center. Static shot with heat shimmer.` |
| 26 | `lf-auction-room` | `10 seconds. An empty auction room with a lectern and rows of chairs, warm bright light, gavel resting on the stand. Slow push toward the lectern.` |

### F. 금·자산 (무게의 층)

| # | 파일명 | 프롬프트 |
|---|---|---|
| 27 | `lf-gold-bars` | `10 seconds. Stacked gold bars on a bright reflective surface, strong specular highlights, shallow depth at the back only. Very slow lateral drift.` |
| 28 | `lf-bell-bright` | `10 seconds. A large brass bell hanging in a bright atrium with a glass roof, sunlight from above. Almost static, faint sway.` |
| 29 | `lf-glass-tower-up` | `10 seconds. Looking up the side of a glass office tower against a bright sky, clouds reflected and sliding across the panels. Very slow tilt up.` |
| 30 | `lf-insurance-house` | `10 seconds. A suburban house exterior in flat bright daylight, wide and centered low in the frame, sky filling the top half. Static shot.` |

---

## 받은 뒤 반드시 하는 검수

```bash
# ① 해상도 — 16:9 인가
ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 <clip>

# ② 움직임 — 게이트의 컷 판정에 걸리지 않는가 (평균 18 초과 프레임이 적어야 한다)
node scripts/_clip-diff.mjs <이름>

# ③ 밝기 — 72 이상인가
ffmpeg -i <clip> -vf "format=gray,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-" -f null -
```

⛔ 셋 중 하나라도 어기면 **라이브러리에 넣지 않는다.** 넣고 나면 어느 편에서 터질지 모른다.
⛔ 넣을 위치: `public/shorts/bg/video/` (같은 폴더). 이름 앞에 `lf-` 를 붙여 세로판과 구분한다.
