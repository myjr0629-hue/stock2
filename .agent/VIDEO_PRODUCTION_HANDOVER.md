# 영상 제작 전 과정 — 윈도우 이관 정본

**2026-08-11 작성.** 맥은 앱에 집중하고, **영상 제작은 윈도우에서 통제**한다.
이 문서 하나로 재현 가능해야 한다. 여기 없는 값을 지어내지 않는다.

---

## 0. 전체 그림 — 3부

```
①  소재 수확          힉스필드에서 «내용에 맞는» 배경 클립을 만들어 라이브러리에 쌓는다
    (비동기·상시)      → public/shorts/bg/**            정본 §1

②  주제 선정 + 대본    오늘 무엇을 말할지 정하고, 실캡처 숫자로만 대본을 쓴다
    (매일·30분)        → src/remotion/kit/scripts.ts    정본 §2

③  렌더 · 검수 · 출고   음성을 굽고 렌더해서 게이트를 통과시킨 뒤 플랫폼별로 자른다
    (매일·20분)        → out/*.mp4                      정본 §3
```

①은 **미리 쌓아두는 재고**고, ②③은 **매일 도는 라인**이다. ①이 비면 ③의 품질이 무너진다
— 2026-08-11 에 실제로 그렇게 됐다(라이브러리 10편으로 렌더해서 배경이 전부 절차적 그라디언트가 됨).

---

## 1부 — 소재 수확

### 1-1. 왜 힉스필드인가 · 무엇이 공짜인가

| 모델 | 비용 | 근거 |
|---|---|---|
| **Seedance 2.5 영상** | **무료** (`cost: null`) | 무제한 33일 · 2026-08-07 → **09-09** |
| text2image 이미지 | **유료 (편당 100크레딧)** | `use_unlim:true` 를 보내도 `cost:100` |

> ⛔ **2026-08-11 사고**: 이미지가 무제한인 줄 알고 7편을 발주해 **700크레딧을 태웠다.**
> `use_unlim:true` 를 보냈고 200 OK 가 떨어졌지만 응답 `cost` 가 100이었다.
> **응답을 보고 판단하면 이미 늦다** → 스크립트는 `seedance_2_5` 화이트리스트로 막았다.

**제약 (전부 실측)**
- 동시 생성 **1개** (429 응답의 `concurrent_jobs_limit:1`)
- 길이 **5초 고정** (무제한 모드는 다른 길이가 UI 에 아예 없다)
- 720p · 9:16
- 편당 **8~25분** (대기열 혼잡도에 따라). 시간당 3~7편이 현실적인 상한

### 1-2. 실행

```
1. higgsfield.ai 로그인
2. /flow/video/prompt?model=seedance_2_5 열기
3. F12 → Console → scripts/hf-harvest.browser.js 전체 붙여넣기
4. HF.add([ ...프롬프트... ])
5. HF.status() 로 확인
6. copy(HF.manifest()) → manifest.json 저장
7. node scripts/hf-sync.mjs manifest.json
```

`hf-sync.mjs` 가 하는 일:
- 프롬프트 앞 44자로 프롬프트 라이브러리와 대조 → **카테고리·번호·슬러그** 부여
- **`-g 15` 재인코딩** (필수 — 안 하면 Remotion 프레임 탐색이 멈춘다)
- 오디오 제거(`-an`)
- `public/shorts/bg/index.json` + `src/remotion/kit/bglib.json` 갱신

### 1-3. ⛔ 프롬프트 규약 — 문서화돼 있다

정본은 **`.agent/HIGGSFIELD_HARVEST_PIPELINE.md` §7** 이고, 요지는 다음과 같다.

```
소재(WHAT)  = 금융 · 테크 · 하이테크 산업에서만 고른다
스타일(HOW) = 흥미는 여기서 만든다
```

**이게 규약의 핵심이다.** 세련됨을 «추상»으로 만들려 하면 실패한다 — 도미노·비눗방울·
민들레·양털을 64편 만들었다가 전량 폐기했다. **어떤 종목에도 안 붙어서 정보를 하나도
전달하지 못했다.**

**소재 화이트리스트**
반도체(EUV·웨이퍼·클린룸·다이 매크로) · AI 데이터센터(GPU랙·액침냉각·광섬유) ·
로보틱스 · 전기차/자율주행(배터리팩·라이다) · 우주(정지연소·위성) · 양자(희석냉동기·초전도) ·
네트워크(해저케이블·안테나) · 금융(거래소 파사드·금괴·금고·트레이딩 플로어) ·
첨단소재(주조·탄소섬유)

**스타일 팔레트** (조사로 검증된 «스크롤 정지» 화풍)
시네마틱 하이퍼리얼 · 틸트시프트 미니어처 · 애니(신카이/90s OVA) · Pixar 3D ·
클레이·페이퍼크래프트·니들펠트 스톱모션 · 뫼비우스 선화 · 믹스드미디어(2D선화+실사) ·
아이소메트릭 3D · 수묵·임파스토

**프롬프트 문장 공식**
```
<피사체> + <동작> + <장면> + <스타일> + <카메라 무브 1개> + <세로 프레이밍>
+ " No subtitles, no on-screen text, no logos, no brand marks."
```

**절대 규칙**
1. **AI 는 로고·앱UI·숫자를 그리지 않는다.** 로고는 우리 파일(`public/shorts/logos/`)을
   Remotion 이 합성한다. 앱 화면은 실캡처만.
2. **카메라 무브는 1개만.** 두 개 이상 쓰면 5초 안에 어지러워진다.
3. **기본은 밝게(high key).** 어두운 건 레짐 은유가 명시적으로 요구할 때만.
4. **하단 여백 지시를 넣는다** — `subject centred in the upper half with clean empty
   space in the lower half for captions`. 안 넣으면 자막과 싸운다.
5. **훅에는 다큐를 쓰지 않는다.** 코드(`backdrops.ts` `ALLOW`)가 강제한다.

**프롬프트 라이브러리 (커밋됨)**
| 파일 | 내용 |
|---|---|
| `.agent/HARVEST_PROMPTS_2026-08-11.json` | 1차 102편 (모닝·훅·애니·판타지·섹터·플레이트·스팅어) |
| `.agent/HARVEST_PROMPTS_V2_2026-08-11.json` | 2차 100편 (화풍 확장 + 조사 근거) |
| `.agent/HARVEST_PROMPTS_HITECH_2026-08-11.json` | 하이테크·금융 34편 ← **여기부터 쓴다** |
| `.agent/HARVEST_PROMPTS_T2B_2026-08-11.json` | 대본 비트 전용 10편 (예시) |

---

## 2부 — 주제 선정과 대본 (가장 중요)

### 2-1. 데이터는 «실캡처»에서만 나온다

```bash
SHOTS='[{"name":"t4-dash","path":"/en/app-view/dash","wait":13000},
        {"name":"t4-guardian","path":"/en/app-view/guardian","wait":13000},
        {"name":"t4-intel","path":"/en/app-view/intel","wait":14000}]' \
node scripts/capture-app-screens.mjs
```

→ `public/shorts/appshots/<name>.png` + **`.txt`** 가 나온다.

> ⛔ **대본의 모든 숫자는 이 `.txt` 안에 실재해야 한다.** 지어내지 않는다.
> 같은 지표에 서로 다른 숫자를 두 번 쓰지 않는다(화면 23.9% ↔ 낭독 "24퍼센트" 금지 —
> 낭독은 "almost a quarter" 처럼 숫자를 안 쓰는 표현으로 우회한다).

### 2-2. 주제를 «고르는» 법 — 4단계

**① 캡처 .txt 를 통째로 읽는다.** dash + guardian + intel 세 장이면 그날 시장 전체가 들어 있다.

**② «모순»을 찾는다.** 이게 주제 선정의 핵심이다. 다음 축에서 어긋난 곳을 본다:

| 축 | 모순의 예 |
|---|---|
| 지수 ↔ 변동성 | 지수 보합인데 VIX 가 +3.76% |
| 지수 ↔ 폭 | 평평한 마감인데 A/D 0.64:1 «Overwhelming Sell» |
| 섹터 ↔ 섹터 | 같은 날 반도체 −2.94% / 에너지 +4.7% |
| 군중 ↔ 기계 | F&G 65 GREED vs RLSI 44 |
| 가격 ↔ 뉴스 | 반도체가 부러진 날, 헤드라인은 «반도체에 168억 달러» |
| 어제 ↔ 오늘 | 가격추세 29 Weak → 71 Healthy |

**모순이 곧 훅이다.** 모순이 없는 날은 «가장 큰 절대 변화»(최대 섹터 이동, 최대 무버)를 쓴다.

**③ 이름을 붙인다.** 일반 시청자는 지표보다 **종목 이름·심볼**에 먼저 반응한다.
「Sixty percent of volume never hit the exchange」(추상)보다
「**Nvidia fell almost 3%. The S&P 500 didn't move.**」(이름+모순)가 훨씬 강하다.

**④ 페이오프를 뒤에 배치한다.** 훅이 던진 질문의 답은 6~7번째 비트에 둔다.
훅을 갚는 비트는 **`prio: 1`** 로 고정한다 — 짧은 판에서 잘리면 이야기가 끊긴다.

### 2-3. 대본 구조

```
훅        1문장 + 부제 1문장 + 심볼 히어로(실로고 1개)     ≈ 2~3초
비트 ×N   eyebrow / head 2줄 / say 1문장 / ask 1마디       ≈ 4~6초
아웃트로  앱 이름 + 한 줄 + 질문                            ≈ 2.5초
루프백    첫 화면으로 이어지는 문장                          ≈ 2.5초
```

- **`say`** = 자막 = 낭독. **같은 문자열이어야 한다.** 다른 원고 금지
- **`ask`** = 답하지 않는 질문. 다음 비트가 답한다(연쇄 커리오시티 루프)
- **`prio`** 1/2/3 = 짧은 판을 만들 때 무엇을 남길지. 1은 절대 안 버린다
- **`field`** = 그날 주목 종목. 배경에 **실제 로고**가 흩뿌려진다
- **`bg`** = 비트별 배경. 내용과 맞는 클립을 지정한다

### 2-4. ⚖️ 의견을 넣는 법 (컴플라이언스)

의견은 **넣어야 한다**. 뉴스 나열은 아무도 안 본다. 다만 **예측 프레이밍은 금지**다.

```
금지  will · expect · should · watch for · headed toward · poised · set up for
      「분수령」「칼날 위」 같은 미래 함의 은유
허용  지금 상태의 «해석» — "Our read: price and capex are pointing opposite ways."
      스스로 판단을 유보하는 마무리 — "A divergence, not a verdict."
```

**세 가지 장치를 반드시 함께 쓴다:**
1. 의견 비트의 `eyebrow` 를 **`SIGNUM READ`** 로 고정 → 사실과 시각적으로 분리
2. 낭독을 **"Our read:"** 로 시작 → 청각적으로도 분리
3. 하단 면책 문구에 **"Our read, not a forecast"** 를 명시

기본 면책(노란 줄 하나, 화면 맨 아래, 프레임0부터 상시):
```
Educational only · Not investment advice · Our read, not a forecast
```

### 2-5. 음성

```bash
node scripts/tts-beats.mjs T4        # SCRIPT_T4 → public/shorts/audio/t4/ + kit/voice-t4.ts
```
- ElevenLabs, 보이스 Adam `s3TPKV1kjDlVtZbl4Ksh`, 모델 `eleven_multilingual_v2`
- 키는 **`.env.local` 의 `ELEVENLABS_API_KEY`** — 커밋 금지, 로그 출력 금지
- **`say` 와 `ask` 를 별도 파일로 굽는다.** 합쳐 구우면 ask 자막이 언제 나와야 하는지 알 수 없어
  «고정 프레임»으로 띄우게 되고, 그러면 **자막이 낭독보다 최대 2초 먼저 뜬다**(2026-08-11 실측 결함)
- 같은 문장은 다시 굽지 않는다(캐시) — 크레딧 절약

---

## 3부 — 렌더 · 검수 · 출고

### 3-1. 길이는 플랫폼마다 다르다

| 플랫폼 | 최적 | 알고리즘이 보는 것 |
|---|---|---|
| YouTube Shorts | **48~58초** | 시청 **시간** |
| TikTok | **28~38초** | 완주**율** |
| Reels | 30~45초 | 루프 반복 |

**RPM 은 길이와 무관하다** (15초든 3분이든 동일). 길이는 «조회수»를 통해서만 수익에 닿는다.
진짜 레버는 **금융 니치 RPM 이 코미디·라이프스타일의 10배**($0.15~0.25 vs $0.01~0.06)라는 것,
그리고 **자체 VO 가 음악 위주보다 RPM 이 높다**는 것. 둘 다 이미 맞게 가고 있다.

그래서 **대본은 길게 쓰고 잘라낸다** — `kit/variants.ts` 가 `beat.prio` 로 플랫폼별 판을 만든다.
시간으로 자르면 문장이 잘리지만, 우선순위로 자르면 **짧은 «완성본»**이 나온다.

```bash
node -e "..."   # variantReport(SCRIPT_X) 로 세 판 길이를 한눈에 확인
```

### 3-2. 렌더

```bash
npx remotion render src/remotion/index.ts BriefingT4      out/t4-yt.mp4      # 유튜브
npx remotion render src/remotion/index.ts BriefingT4-tt   out/t4-tiktok.mp4  # 틱톡
npx remotion render src/remotion/index.ts BriefingT4-reels out/t4-reels.mp4
```

컴포지션 id 규칙: `Briefing<TAG>` = 유튜브판, `Briefing<TAG>-tt` / `-reels`.
새 대본을 만들면 `src/remotion/Root.tsx` 의 배열에 `['TAG', SCRIPT_TAG]` 한 줄만 추가한다.

### 3-3. 발행 게이트 — 통과 못 하면 올리지 않는다

```bash
node scripts/video-ref-measure.mjs out/t4-yt.mp4
```

| 지표 | 하한 | 왜 |
|---|---|---|
| 평균 밝기 | ≥25 | **과거 렌더가 5.2(거의 검정)로 나온 적이 있다.** 렌더 실패를 눈으로 못 잡는다 |
| 밝은 화소 | ≥15% | 위와 같은 이유 |
| 컷 | ≥4회/30초 | 정지 화면은 스와이프를 부른다 |
| 샷별 최소 밝기 | ≥18 | 한 샷만 검게 죽는 사고 방지 |
| 밝기 급변 | ≤2회 | 광과민성 + 검출기 우회 회피 |
| 길이 | 28~58초 | 플랫폼 창의 합집합 |

**속도감**: 목표는 **2.5~3초당 1컷**. 컷은 아무 데나 넣지 않고 **`ask` 가 말해지는 프레임**에
넣는다 — 속도감과 립싱크를 동시에 얻고, 말과 그림이 따로 놀지 않는다.

### 3-4. 썸네일

Shorts 는 커스텀 썸네일이 없다 — **프레임 0 이 썸네일**이다. 그래서 훅 문장은 페이드 없이
프레임 0부터 완전히 보이고, 심볼 히어로(실로고)가 화면 중앙에 크게 온다.
**웹 업로드 시에는** 별도 썸네일을 고를 수 있으므로, 제목이 크게 박힌 프레임을 쓴다.

### 3-5. 엔드카드

```bash
npx remotion render src/remotion/index.ts EndCard-signum    out/ec-signum-3.5s.mp4
npx remotion render src/remotion/index.ts EndCard-signum-7s out/ec-signum-7s.mp4
```
3앱(signum·uc·wim) × 2길이. 105f(3.5초)가 브리핑 부착용 기본, 210f(7초)는 X·웹 히어로 전용.
문구·색·자산 경로는 전부 `src/remotion/kit/endcards.ts` 에 있다.

---

## 4. 클립 저장 — 두 머신 공유 전략

**현재**: `public/shorts/bg/**` 는 `.gitignore` 처리 → **맥 로컬에만 있다.**
100편이면 약 152MB 라 git 에 넣으면 Vercel 배포가 위험하다
(전에 `public/` 을 건드렸다가 배포가 «에러 없이» 35분간 미반영된 적이 있다).

**제안 — 우선순위 순**

| 안 | 방법 | 장점 | 단점 |
|---|---|---|---|
| **① Cloudflare R2 / S3** (권장) | 버킷 하나 + `hf-sync` 에 업로드 한 줄 추가 | 두 머신이 같은 원본을 본다 · Vercel 무관 · 무제한 확장 | 버킷 생성 필요 |
| ② Google Drive / Dropbox 동기 폴더 | `public/shorts/bg` 를 심볼릭 링크 | 설정 5분 · 계정 이미 있음 | 대용량 동기화가 느리고 충돌 가능 |
| ③ git-lfs | LFS 트래킹 | 버전관리 통합 | LFS 용량 과금 · 배포 리스크 |
| ④ 재생성 | 윈도우에서 같은 프롬프트로 다시 수확 | 추가 인프라 0 | 시간 낭비(편당 8~25분) |

**즉시 실행 가능한 임시안**: 맥에서 `public/shorts/bg` 를 zip 으로 묶어 한 번 넘기고,
이후 신규분만 R2 로 옮긴다. 인벤토리는 `.agent/CLIP_LIBRARY.md` 로 계속 동기화한다.

---

## 5. 윈도우 초기 셋업

```powershell
git clone <repo> ; cd stock2
npm install
# .env.local 을 «수동으로» 만든다 (커밋 안 됨) — 필요한 키:
#   ELEVENLABS_API_KEY=...        낭독
#   (렌더만 할 거면 이것 하나로 충분하다)
```

**ffmpeg/ffprobe 는 따로 설치할 필요 없다** — Remotion 이 번들로 가져온다:
`node_modules/@remotion/compositor-win32-x64-msvc/` (맥은 `darwin-arm64`).
`hf-sync.mjs` 의 `BIN` 상수만 윈도우 경로로 바꾸면 된다.

**동작 확인**
```powershell
npx remotion render src/remotion/index.ts EndCard-signum out/test.mp4
node scripts/video-ref-measure.mjs out/test.mp4
```

---

## 6. 매일 루틴 (윈도우)

```
07:30  캡처       node scripts/capture-app-screens.mjs      (프리마켓)
07:40  주제선정   .txt 읽고 «모순» 찾기                      §2-2
07:50  대본       scripts.ts 에 SCRIPT_XXX 작성              §2-3
08:00  음성       node scripts/tts-beats.mjs XXX
08:05  배경배선   비트별 bg 지정 (라이브러리에서)             §1
08:10  렌더       yt / tt 두 판
08:20  게이트     node scripts/video-ref-measure.mjs
08:25  출고       제목·해시태그와 함께
(상시) 수확       HF.add([...]) 로 라이브러리 계속 채우기
```

---

## 7. 관련 문서

| 문서 | 내용 |
|---|---|
| `.agent/HIGGSFIELD_HARVEST_PIPELINE.md` | 힉스필드 API 실측 정본 · 프롬프트 규약 §7 |
| `.agent/CLIP_LIBRARY.md` | 클립 인벤토리 (사람용) |
| `.agent/SHORTS_FRAMEWORK_V3.md` | 훅 아키타입 · 포맷 · 엔드카드 스펙 (41K) |
| `.agent/SEEDANCE_PROMPT_GUIDE.md` | 아트디렉션 캐넌 (BRIGHT) |
| `.agent/VIDEO_ENGINE_SPEC.md` | 렌더 엔진 스펙 |
| `src/remotion/kit/spec.ts` | 수치 정본 (캔버스·안전영역·자막·길이) |
