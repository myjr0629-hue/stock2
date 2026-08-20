# 하루 한 편 실행 순서 — 이 문서만 보고 처음부터 끝까지 간다

> 2026-08-12 작성. **이번 회차에서 실제로 걸린 함정을 각 단계에 붙여 놓았다.**
> 매번 다시 발견하지 말 것. 새 함정을 만나면 여기에 추가한다.

---

## 1. 캡처 (5분)

```powershell
$env:SHOTS='[{"name":"cMMDD-dash","path":"/en/app-view/dash","wait":14000},{"name":"cMMDD-guardian","path":"/en/app-view/guardian","wait":14000},{"name":"cMMDD-intel","path":"/en/app-view/intel","wait":15000}]'
node scripts/capture-app-screens.mjs public/shorts/appshots
```

### ⛔ 함정 — 캡처 숫자를 그대로 쓰면 «거짓말»이 나간다
마감 후에도 **라이브 값이 계속 흐른다.** 실제로 겪은 것:

| 블록 | 캡처 표시 | 공식 종가 |
|---|---|---|
| TOP MOVERS · NVDA | +0.23% | **-0.02%** ← "엔비디아도 올랐다"가 거짓이 될 뻔 |
| SECTOR HEATMAP | Utilities 1위 | **Energy 1위** |

**규칙**
- 「CLOSED」 표시가 붙은 **CASH INDICES** 와 **우리 고유 지표**(다크풀·RISK·F&G)만 캡처에서 쓴다
- **TOP MOVERS 는 아예 쓰지 않는다** — 시간외 값 + 마이너 종목이 섞인다 (대표 지시)
- 개별 종목·섹터는 **Polygon 종가로 다시 잰다**
- 독립 검증이 불가능한 지표(예: I:VIX — 우리 플랜 미포함)는 **화면에 올리지 않는다**

---

## 2. 우위 스캔 — 소재를 «고르기 전에» 계산한다 (3분)

```bash
node scripts/morning-edge.mjs
```

사전 고정된 12개 조건을 전부 세고, **표본 40+ AND 대조군 대비 8%p+** 만 후보로 낸다.

- 통과 조건이 있으면 → 그게 그날 주제
- **하나도 없으면 그것도 소재다** → `kit/insight.ts` `noEdgeBeat()`
  ("103번 세어봤더니 동전던지기였다" — 통념을 깨서 훅이 오히려 강하다)
- 임계값을 결과 보고 낮추지 않는다

---

## 3. 대본 (20분)

`kit/scripts.ts` 에 `SCRIPT_XXX` 추가 → `Root.tsx` 배열에 `['XXX', SCRIPT_XXX]` 한 줄.

**필수 구성**
- 훅 = 이름 + 모순 한 줄 (프레임 0 = 썸네일)
- 비트마다 `say`(자막=낭독 동일) + `ask`(다음 비트가 답한다)
- **인사이트 비트 최소 1개** — `eyebrow: 'SIGNUM BASE RATE'`
- 의견 비트는 `eyebrow: 'SIGNUM READ'` + 낭독 `"Our read:"` 로 시작
- 미래형 동사 금지: will · expect · should · watch for · poised

### ⛔ 함정 — `rows` / `versus` 에 `sym` 을 빼면 배지가 깨진다
`resolveSymbol` 은 매칭 실패 시 **키 앞 4글자를 잘라** 배지를 만든다 →
`EVENTS SINCE 2021` → **`EVEN`**, `ANY GIVEN DAY` → **`ANYG`** 가 화면에 나갔다.
**모든 행에 `sym` 을 명시한다** (`RISK` · `SEMIS` · `SP500` · `NASDAQ` 등).

---

## 4. 음성 → 비트 초 확정 (5분)

```bash
node scripts/tts-beats.mjs XXX
```

생성된 `kit/voice-xxx.ts` 의 `sec` 이 **그 비트의 정확한 길이**다. 클립 발주는 이 숫자로 한다.
같은 문장은 다시 굽지 않는다(캐시) — 바꾼 문장만 새로 굽힌다.

---

## 5. 클립 발주 (Flow) — 초를 «첫 단어»로

```
<N>s. <피사체+동작> + <장면> + <스타일> + <카메라 무브 1개> + <하단 여백을 만드는 장면 묘사>
+ Vertical 9:16. No subtitles, no on-screen text, no logos, no brand marks.
```

**길이 = 비트 길이보다 길게.** Flow 프리셋 4 / 6 / 10초 중 올려 잡는다.
6초 프리셋으로 6.4초 비트를 덮으면 0.4초 지점에 루프 이음매가 보인다.

### ⛔ 함정 3개 (전부 실제로 당했다)
1. **"하단을 빈 공간으로 두라"고 지시하지 말 것** → 모델이 **크림색 사각형 블록**을 그린다.
   대신 장면으로 만든다: `The bottom third is open evening sky` · `smooth pale cleanroom floor`
2. **`rainbow diffraction` 금지** → 무지개 회절은 CD의 대표 특징이라 **웨이퍼가 CD로 나온다.**
   웨이퍼를 그리려면 `no centre hole` + `grid of tiny rectangular chip dies` + `no iridescence`
3. **추상 소품 금지** — 강철 볼베어링·구·도미노·비눗방울은 예쁘지만 **시장을 하나도 말하지 않는다.**
   맥이 같은 이유로 64편을 전량 폐기했다. 소재는 금융·테크·산업에서만 고르고,
   «흥미»는 스타일(틸트시프트·애니·페이퍼크래프트·매크로)로 만든다.

---

## 6. 후처리 — 워터마크 제거 + zoom 변형 (3분)

```powershell
# 워터마크는 우하단에 있다 → 상단-좌 0.9 크롭으로 잘라낸다
ffmpeg -y -i src.mp4 -an -vf "crop=iw*0.9:ih*0.9:0:0,scale=720:1280:flags=lanczos" `
       -c:v libx264 -g 15 -pix_fmt yuv420p -crf 20 out.mp4
```

- **`-g 15` 는 필수** — GOP 가 길면 Remotion `OffthreadVideo` 프레임 탐색이 멈춘다
- **`-an`** 로 오디오 제거
- **zoom 변형으로 발주 수를 줄인다**: 같은 원본의 다른 구간 + 더 타이트한 크롭(0.62~0.75)이면
  다른 컷으로 읽힌다. 10초 클립 하나에서 2~3컷이 나온다

---

## 7. 배선 → 렌더 (10분)

```ts
bg: { kind: 'video', src: 'shorts/bg/video/<이름>.mp4', loopFrames: Math.floor(초 * 30) }
```

```bash
npx remotion render src/remotion/index.ts BriefingXXX     out/XXX-yt.mp4
npx remotion render src/remotion/index.ts BriefingXXX-tt  out/XXX-tt.mp4
```

- 클립이 아직 없는 머신에서는 `REMOTION_BG=off` — 없으면 **프레임 0에서 404로 죽는다**
- **틱톡판이 창(28~38초)을 넘으면** `prio` 를 조정한다. prio 1 이 많으면 못 자른다
  (실측: 첫 비트를 prio 1 로 두니 40.4초 → prio 2 로 내려 35.3초)

---

## 8. 검수 → 출고 (10분)

```bash
node scripts/video-ref-measure.mjs out/XXX-yt.mp4
```

게이트: 길이 28~58 · 평균밝기 ≥25 · 밝은화소 ≥15% · 컷 ≥4/30초 · 급변 ≤2

**프레임 육안 검수는 내가 한다** — 사용자에게 먼저 묻지 않는다.
프레임 0(썸네일급) · 카드 겹침 0 · 배지 정상 · 자막 프레임 내부 · 하단 면책.

`E:\SIGNUM_UPLOAD\YYYY-MM-DD\` 에 정리하고 `UPLOAD_NOTES.txt` 동봉 → 폴더를 열어준다.
업로드 화면 순서는 `references/upload-walkthrough.md`.

---

## 힉스필드 실측치 (2026-08-12)

| | 값 |
|---|---|
| Seedance 2.5 영상 | **1개씩만** · 편당 **~13.5분** · 5초 고정 · 무과금 |
| Nano Banana 2 이미지 | **1장씩** · **1~2.5분** · 무과금 |
| 배치 2장 이상 | **무제한 깨진다** (4장 = 6크레딧) |
| Nano Banana **Pro** | 무제한 목록에 **없다** — 별개 유료 모델 |
| MCP 경유 | **과금** (시덴스 5초당 32.5크레딧). 반드시 웹 UI |
| 무과금 확인법 | Generate 버튼에 **크레딧 숫자가 없어야** 한다. 있으면 누르지 않는다 |

⇒ **영상은 재고, 이미지는 즉석.** 영상 안 만드는 시간에 영상 재고를 쌓는다.

---

## ⛔ 2026-08-21 이후 공정이 바뀌었다 — 이 순서를 지킨다

```bash
# 1) 소재를 «수요»에서 고른다 (감으로 고르지 않는다)
#    .agent/DEMAND.json 91어휘 · .agent/MACRO_BENCHMARK.md
# 2) 실데이터로 근거를 만든다 (FMP stable/historical-price-eod/full 등)
# 3) 대본을 쓰고 «먼저» 잰다
node scripts/script-check.mjs <TAG>
# 4) 낭독
node scripts/tts-beats.mjs <TAG>
# 5) 렌더
npx remotion render src/remotion/index.ts Briefing<TAG> "E:/SIGNUM_UPLOAD/<날짜>/<TAG>.mp4" --log=error
# 6) ★ 마감 — 빼먹으면 라우드니스에서 걸린다
node scripts/finish-video.mjs "E:/SIGNUM_UPLOAD/<날짜>/<TAG>.mp4"
# 7) 계획서에 scriptTag · evidence 를 넣고 4층 게이트
node scripts/shorts-gate.mjs .agent/plans/<날짜>.json
# 8) 대표 승인 → 업로드 (승인 없이 올리지 않는다)
node scripts/yt-upload.mjs .agent/plans/<날짜>.json
```

**계획서 필수 필드** (없으면 게이트가 막는다)
```json
{ "scriptTag": "GOLD821",
  "evidence": ["GLD 일봉 255개 (FMP, 2025-08-15~2026-08-20)", "..."],
  "homonymPct": 0, "freshnessDays": 1 }
```
