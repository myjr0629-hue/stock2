# Seedance 프롬프트 정본 가이드 (2026-08-08 개정 2판)

> ★★ **§0 아트디렉션 캐넌 v2 가 모든 구식 스타일 문구에 우선한다.**
> 이 문서 뒷부분(2026-08-07 초판)의 예시 프롬프트에 남아 있는
> "moody dark navy palette, teal and gold accent light" 계열 문구는 **전부 폐기** —
> 구조(공식·카메라·금지)는 유효하되 스타일 슬롯은 §0 을 따른다.
> 주제별 완성 프롬프트 41종 = `.agent/PROMPT_LIBRARY.json` (인덱스 = PROMPT_LIBRARY_INDEX.md)

## §0. 아트디렉션 캐넌 v2 — BRIGHT

# SIGNUM 아트 디렉션 캐넌 v2 — BRIGHT (구 "다크 네이비" 캐넌 전면 폐기)

> 2026-08-08 대표 지시로 개정. "moody dark navy palette, teal and gold accent light" 계열 문구는 전 프롬프트에서 삭제한다.

## 1. 원칙 (3줄)
1. **시네마틱 ≠ 다크.** 시네마틱은 구도·렌징·프리미엄 완성도를 뜻한다. 어둡게 찍는 것은 시네마틱이 아니라 렌더 실패다.
2. **이미지가 곧 정보다.** 시청자가 1초 안에 주제를 읽어야 한다. 반도체=팹/웨이퍼, 이커머스=물류창고, 리스크온 아침=일출 스카이라인.
3. **내용과 그림을 매칭한다.** 예쁜 무관한 B-roll 금지. 그날의 종목·섹터·레짐이 화면의 피사체로 직역돼야 한다.

## 2. 조명 기본값
- **기본**: 자연광 데이라이트 / 골든아워 / 크리스프한 스튜디오 라이트 / 에어리 하이키(high-key). 프롬프트에 조명 단어를 반드시 명시한다.
- **다크 허용 예외 (전부 충족 시만)**:
  - 주제가 본질적으로 야간인 경우(야경 스카이라인, 데이터센터 내부 등) **그리고**
  - 피사체가 강한 광원으로 명확히 조명되어 평균 밝기가 충분할 것(실루엣·검은 화면 불가) **그리고**
  - 같은 영상의 다른 씬들이 밝아 야간 씬이 악센트로만 기능할 것.
- 자동 검수 게이트(밝기·화소·컷 하한)는 유지된다. 어두운 프롬프트는 게이트에서 떨어진다고 간주하고 쓰지 말 것.

## 3. 부정 레짐 표현법 — "밝은 드라마"
- 셀오프·변동성·공포도 **잘 조명된 주간(daylight) 드라마**로 표현한다.
- 허용 모티프: 대낮의 폭풍 전선과 뇌운, 햇빛 아래 부서지는 거친 파도, 강풍에 흩날리는 붉은 단풍, 역광의 모래폭풍.
- 금지: 검은 프롬프트("dark", "moody", "dim", "shadowy"가 지배하는 문장), 검은 프레임, 야간 폭풍, 조명 없는 실내.
- 요령: 하늘은 어두워도 전경 피사체는 반드시 태양광·역광으로 밝게 세운다. "storm light", "dramatic sunlight breaking through clouds" 계열 어휘 사용.

## 4. 금지 목록 (컴플라이언스 — 예외 없음)
- 실제 브랜드 로고·트레이드마크·식별 가능한 실제 제품 디자인 (○ "a modern smartphone assembly line" / ✕ "iPhone factory")
- 실존 인물·유명인 유사 묘사(이름·닮은꼴 지시 포함)
- 앱 화면·트레이딩 UI·차트·읽을 수 있는 숫자/텍스트. 화면이 등장하면 아웃포커스 또는 내용이 안 읽히는 각도로만.
- 검은 프레임·저조도 씬(§2 예외 요건 미충족 시)
- **말미 고정 문구**: 영상 프롬프트는 `No subtitles, no on-screen text.` / 이미지 프롬프트는 `No text, no logos.` 로 끝난다. 누락 시 발행 불가.

## 5. 프롬프트 템플릿 (한 줄)
- **영상(Seedance 2.5)**: `[피사체] + [동작] + [장면/환경] + [밝은 조명이 명시된 비주얼 스타일] + one continuous camera move, no cuts + vertical framing. No subtitles, no on-screen text.` (씬 5–10초, 카메라 무브는 딱 1개)
- **이미지(Nano Banana 2)**: `[동일한 피사체 언어] + photorealistic editorial photography, vertical composition. No text, no logos.`

## 6. 톤 앤 매너 — 밝되 유치하지 않게
- SIGNUM의 권위·정밀은 **어둠이 아니라 사진 문법**에서 나온다: 에디토리얼/커머셜 광고 사진의 어휘를 쓴다 — 얕은 심도, 85mm/35mm 프라임 렌징, 절제된 구도, 네거티브 스페이스, 정돈된 배경.
- ○: "crisp morning light, clean composition, premium commercial photography" — Bloomberg Businessweek 화보나 애뉴얼 리포트 표지의 결.
- ✕: 채도 폭발 스톡사진 결("vibrant, colorful, cheerful"), 웃는 모델 클로즈업, 클립아트 느낌, 과한 렌즈플레어.
- 색은 자연스러운 실사 팔레트를 기본으로 하되, 레짐 시그널(상승=따뜻한 골든아워, 하락=차가운 스톰라이트)로 **온도만** 기울인다. 인위적 컬러 그레이딩 지시는 넣지 않는다.
- 한 문장 검증: **"이 프레임을 경제지 표지에 실어도 되는가, 그리고 1초 안에 주제가 읽히는가."** 둘 중 하나라도 아니면 다시 쓴다.

---

# (이하 초판 원문 — 구조 참고용)

---

# SIGNUM HQ × Seedance 광고 제작 가이드
**(감독 노트 — 2026-08-07 / 조사 출처: 볼케이노 엔진 공식 문서 4종 + ByteDance Seed 블로그 + 실전 가이드 9종 교차검증)**

---

## 1. Seedance 프롬프트 공식 (구조·순서·카메라 어휘·멀티샷 문법)

### 1-1. 기본 구조 (버전별)

| 버전 | 공식 | 출처 |
|---|---|---|
| **2.5 (확정판)** | **주체 + 동작/사건 + 장면·환경 + 비주얼 스타일 + 운징(카메라)/컷 전환 + 소리** — 불필요한 슬롯은 생략 가능 | docs.volcengine.com/docs/82379/2607688 |
| 2.0 (고급) | 정밀 주체 + 동작 디테일 + 장면 환경 + 광영·색조 + 운징 + 비주얼 스타일 + 화질 + 제약 조건(약속어) | docs.volcengine.com/docs/82379/2222480 |
| 1.5 pro | 主体+운동+환경(선택)+운징/컷(선택)+미학 서술(선택)+소리(선택) | docs.volcengine.com/docs/82379/2168087 |

해외 블로그가 말하는 "ByteDance 6부 공식"의 원문이 2.5 공식이다. 슬롯 순서를 지키는 것 자체가 품질 요인.

### 1-2. 권장 작성 흐름 (2.5 프롬프트 가이드, 2607689)

1. **(레퍼런스 사용 시) 소재 지정** — 각 이미지/영상/오디오의 번호와 용도("@Image 1은 ~의 외형")를 프롬프트 **맨 앞에** 명시. 정밀 참조가 중요한 소재일수록 앞쪽 배치.
2. **한 문장 개요** — "주체+장소+사건+장르/스타일+특수 운징"을 첫 문장으로.
3. **구체 플롯** — 타임스탬프("0-3s…") 또는 "Shot N"으로 분절, 샷마다 ①운징·전환 ②주체 동작·표정 ③위치·공간 ④오디오 순으로 기술. **가급적 긍정문.**
4. **전역 마무리** — 전체를 관통하는 기계 위치·환경·소리·분위기 보충.

### 1-3. 카메라 어휘 (공식 인정 용어)

- **기본 운징**: push-in(推)/pull-out(拉)/pan(摇)/truck(移)/orbit(环绕)/tracking(跟)/crane up·down(升降)/zoom(变焦)/whip pan(甩)/roll(旋转)/dive(俯冲)/handheld(手持) — 출처: 1.0 지침(1631633), 1.5 pro 지침(2168087), 2.5 지침(2607689)
- **경별**: 大全景/全景/中景/近景/特写 = extreme wide → close-up. 문법은 "주체+경별"(예: "close-up of the man's hand").
- **유행 운징 직접 사용 가능(2.5)**: one-take(一镜到底), Hitchcock zoom(dolly zoom), FPV, bullet time, speed ramp(回弹变速). 마이너 용어는 **[용어+서술적 설명]**으로 풀어 쓸 것.
- **1.5 pro 운징 서술 공식**: **시작 구도 + 운징 + 운징 폭 + 종료 구도.**
- **철칙(2.0 공식 규칙)**: **한 샷 안에는 운징 1종만.** 推拉摇移 동시 요구는 화면 불안정을 유발.
- Seedance가 영문으로 직독하는 용어(Higgsfield/Seed 블로그 실측): `dolly in, push in, pull back wide, truck left, arc shot, orbital move, crane up, handheld follow, top-down, whip-pan`. 시퀀싱은 `first / then / finally`.

### 1-4. 멀티샷 문법 (세대별 차이가 핵심)

- **1.0**: 프롬프트 내 "샷 전환(镜头切换)" 서술로 멀티컷.
- **2.0**: **"Shot 1 / Shot 2 / Shot 3" 샷 번호가 정식 문법.** 정밀 타임스탬프는 공식적으로 "지원 불안정 — 비권장".
- **2.5**: **정수 초 타임스탬프 정식 지원** — 구간형("0-3s…3-7s"), 시점형("at 5s…"), 상대형("3초 후"). 단 타임라인 연속성 유지(구간 건너뛰기 금지), 빈도 제어("1초에 3번")에는 사용 금지. 전환은 트리거 시점+방식 명시(예: "at 5s, fast left wipe transition").
- **1.5 pro 컷 3원칙**: ①샷을 명확히 구분 ②컷 타이밍 정밀 기술 ③컷 간 경별/내용 차별화.
- **2.5 추가 수단**: 스토리보드 그리드 참조(15컷 이하), 키프레임 시퀀스("以图片 1~7 순서를 키프레임으로" 첫 문장 명시), 클립 이음(轨道补全), 무봉 전환.
- **파라미터는 프롬프트 밖**: resolution/ratio/duration/seed/camera_fixed는 API 파라미터 또는 앱 UI(Higgsfield)에서. **9:16은 파라미터로 지정**하고 프롬프트에는 "vertical framing"으로 구도만 보강. 2.5는 480p/720p·4~30초·기본 adaptive.
- **2.5 함정 — 태스크 잠금**: 순수 생성 프롬프트에 편집 트리거 단어(add/remove/replace 계열, 增加/删除/修改)를 넣으면 편집 태스크로 오판되어 ratio=adaptive·duration=-1이 강제된다(에러 `InvalidParameter.TaskTypeConstraint`). 생성 프롬프트에서는 이런 동사를 피할 것. (2607688)
- **부정 프롬프트**: 전용 파라미터 없음. **공식 지원되는 반향 서술은 자막·오디오뿐** — "no subtitles", "no bgm, ambient sound only" 등. 나머지는 약속어("불필요한 텍스트·로고·워터마크 없음")로 확률 저감만 가능, 100% 보장 안 됨. (2222480 FAQ)

---

## 2. 광고용 프롬프트 실전 규칙 (약점 회피 포함)

### 2-1. 쓰는 법 자체

1. **"이미지 캡션"이 아니라 "샷 디렉션"으로.** 핵심 피사체·동작·카메라 큐를 문장 앞쪽에. 형용사 나열("beautiful, cinematic")은 지시를 희석. (nemovideo·seedanceai.cc)
2. **20단어 이상.** 미만이면 왜곡·불일치 급증.
3. **피사체 고모션 + 카메라 고모션 결합 금지** — 거의 항상 불안정. 하나만 크게 움직여라.
4. **부정문 역효과(2.0)**: "no blur"라고 쓰면 blur가 콘텐츠로 파싱돼 오히려 블러가 생김. 긍정 대체어를 써라 — "sharp, in-focus", "steady tripod shot". 예외는 공식 지원되는 자막·오디오 부정뿐.
5. **정체성 드리프트 방지**: 멀티샷에서 핵심 정체성 문구(인물 외형·브랜드 팔레트)를 **매 샷 반복.** 레퍼런스 수는 최소화(2.0 공식 권장 소재는 4-5개, 한도 채우면 품질 저하).
6. **손가락**: 빠른 제스처·손 겹침에서 뒤틀림 → "slow, deliberate" 명시 또는 프레이밍으로 배제. **얼굴을 프레임에서 빼고 손·몸통만 쓰는 것**이 Higgsfield 공식 제품데모 요령("only hands and torso visible, no face in frame").
7. **Higgsfield 사용 시**: 카메라 프리셋 1개만 선택(스태킹 금지) + 같은 무브 이름을 프롬프트에도 반복. 강한 무브(Crash Zoom)는 리빌 1회용. 720p 무음으로 프로토타입 → 프롬프트 확정 → 최종만 오디오 렌더(크레딧 절약).

### 2-2. 앱 UI / 텍스트 / 로고 — SIGNUM의 핵심 원칙

**Seedance는 화면 속 텍스트·숫자·정밀 로고를 신뢰할 수 없다.** 텍스트로 UI를 생성시키면 모델이 인터페이스를 "창작"한다: 읽을 수 없는 글자, **가짜 지표·가격 날조**(금융앱엔 컴플라이언스 사고), 버튼 위치 변경, 가짜 팝업. (seedance.tv, seedanceai.cc)

따라서 SIGNUM 광고의 3원칙:

1. **실제 앱 UI는 Seedance로 절대 생성하지 않는다.** Seedance가 만드는 모든 샷은 **"화면이 보이지 않는 각도"**로 설계한다:
   - 폰을 **face-down** 또는 **뒷면이 카메라를 향하게**
   - 화면 대신 **엣지에서 새어 나오는 틸·골드 글로우**
   - 인물 정면 촬영 시 **모니터는 뒷면·실루엣만**
   - 화면이 불가피하면 "screen appears only as an abstract light glow, no readable content" 수준의 극사각(極斜角)
2. **진짜 UI가 필요한 컷은 실기기 스크린 레코딩을 편집 단계에서 합성**(디바이스 프레임 목업 또는 풀블리드 인서트). 이것이 성과(실 UI 노출이 리텐션 우위)와 컴플라이언스(ASA "화면이 실사용 경험을 반영해야" 판정) 모두의 정답.
3. **로고·카피·CTA·면책 문구는 전부 포스트 오버레이.** 생성 화면 안 텍스트는 2-3자 초대형이 아니면 금지. 모든 프롬프트 말미에 "no subtitles, no on-screen text"(공식 지원 부정) 고정.

---

## 3. 30초 앱 광고 씬 구조 (금융앱 컴플라이언스 반영)

### 3-1. 검증된 4막 구조 (thread-transfer, sovran.ai, AppsFlyer 2025)

| 구간 | 역할 | 근거 |
|---|---|---|
| **0–3s 훅** | 첫 2초 안에 어텐션. 첫 3초가 성과의 80%. "광고처럼 보이지 않게"(패턴 인터럽트) | sovran.ai, trendtrack.io |
| **3–15s 데모** | 앱이 문제를 해결하는 장면. Google App Campaigns 기준 10초까지 핵심 경험 시연 완료. 비주얼 비트 2-3초마다 전환 | thread-transfer, rocketshiphq |
| **15–20s 소셜프루프** | 별점·사용자 수 스치기 — **실제 수치만**(날조는 오도 광고) | sovran.ai |
| **20–30s CTA** | 페이오프 프레임: 로고+CTA 카드+앱 아이콘으로 고정 종료 | newly.app |

스토리텔링 훅(실패→발견 서사)은 D7 리텐션 최상위 포맷(AppsFlyer 110만 크리에이티브 분석) — 아래 씬 설계는 이 서사형을 채택.

### 3-2. 금융앱 컴플라이언스 레이어 (FINRA 2210 / TikTok·Meta 금융 정책)

- **약속성 문구 전면 금지**: "수익 보장", "시장을 이긴다", "무위험", 구체 수익률 암시. 미래 예측 프레이밍 금지(우리 내부 규칙과 동일).
- **포지셔닝은 "정보/데이터 추적"으로**: "See what institutions are doing" (O) / "Trade like institutions and win" (X).
- **면책 오버레이 필수·판독 가능하게**: "본 앱은 투자 정보를 제공하며 투자 자문이 아닙니다. 투자에는 원금 손실 위험이 있습니다." + "과거 성과는 미래 수익을 보장하지 않습니다"(표준 문구). 작은 글씨 스치기로는 불충분 — 주장 가까이에, 읽힐 만큼.
- **화면 정직성**: 광고 속 앱 화면 = 실사용 경험(ASA 판정). → 실 UI 인서트는 실기기 레코딩만 사용. 오도 광고는 D7 리텐션 1.5% vs 정직 광고 11%로 성과에서도 붕괴.
- **소셜프루프는 검증 가능한 실수치만.**

### 3-3. SIGNUM 30초 타임라인 (Seedance 생성 6씬 + 실 UI 인서트 1컷)

```
0–5s   S1 훅: 고래 메타포 (기관 = 심해의 고래)          [Seedance]
5–10s  S2 문제: 밤샘 트레이더, 모니터는 뒷면만            [Seedance]
10–13s S3 시그널: face-down 폰이 틸·골드로 빛남           [Seedance]
13–17s ★실 UI 인서트: 실기기 스크린 레코딩(자금 흐름 맵)   [편집 합성 — Seedance 아님]
17–22s S4 데모 메타포: 도시 야경, 골드 광류가 한 점으로 수렴 [Seedance]
22–26s S5 확신: 새벽 창가, 차분한 사용자 (화면 안 보임)     [Seedance]
26–30s S6 CTA 셸: 폰 뒷면 히어로샷 + 네거티브 스페이스     [Seedance]
        └ 포스트: 로고·CTA·별점(실수치)·면책 문구 오버레이
```

소셜프루프(별점)와 면책은 S5–S6 위 포스트 오버레이로 처리. 각 씬은 독립 클립으로 생성 후 편집기에서 이어붙인다(멀티샷 1회 생성보다 드리프트·품질 통제가 쉬움).

---

## 4. SIGNUM 광고용 Seedance 프롬프트 초안 6개
**(영어 / 씬별 5-8초 / ratio=9:16은 파라미터로 지정 / 화면 비노출 원칙 적용 / 매 씬 브랜드 앵커 문구 반복)**

공통 규칙: 클립당 카메라 무브 1개, 손 제스처는 slow·deliberate, 얼굴 없는 샷 우선, 말미에 자막 부정(공식 지원) 고정. 브랜드 앵커 = `moody dark navy palette, teal and gold accent light, premium cinematic fintech commercial style`.

### S1 — 훅: 고래 메타포 (5s)
```
A colossal whale silhouette glides silently beneath a swirling school of
small silver fish in a deep dark navy ocean. The whale's slow movement
pushes a wave of teal bioluminescent particles that shimmer with faint
gold sparks. Volumetric light rays fall from the surface far above.
Moody dark navy palette, teal and gold accent light, premium cinematic
fintech commercial style, vertical framing. Low-angle shot with a slow
push-in toward the whale, one continuous camera move, no cuts. Deep
sub-bass rumble and muffled underwater ambience. No subtitles, no
on-screen text.
```
*포스트 오버레이: "개미는 물결을 본다. 고래는 해류를 만든다." (예측·수익 암시 없음)*

### S2 — 문제: 밤샘 트레이더, 모니터는 뒷면만 (5s)
```
A man in his early 30s sits alone in a dark home office late at night,
his tired face lit by cold flickering light, slowly rubbing his eyes.
The camera faces him from the front, so his three monitors are seen
only from behind: matte black panel backs and cable silhouettes, with
no screen content visible anywhere in frame. Shallow depth of field,
moody dark navy palette, teal and gold accent light, premium cinematic
fintech commercial style, vertical framing. Steady tripod shot with a
very slow push-in, one camera move only. Quiet room tone, faint
electrical hum, a distant city siren. No subtitles, no on-screen text.
```
*요령: 화면 글로우는 "인물 얼굴에 닿는 빛"으로만 존재 — UI 생성 원천 차단.*

### S3 — 시그널: face-down 폰의 글로우 (5s)
```
A smartphone lies face-down on a dark walnut desk next to a cooling cup
of coffee, in a dim night-time room. The phone buzzes once, and a soft
teal and gold glow leaks out from under its edges, spreading across the
desk surface. A hand enters the frame and slowly, deliberately picks
the phone up, lifting it out of frame with the screen always facing
away from the camera. Only the hand and forearm are visible, no face in
frame. Macro tabletop hero shot, moody dark navy palette, teal and gold
accent light, premium cinematic fintech commercial style, vertical
framing. Gentle dolly-in toward the phone, then hold. A single soft
vibration buzz over quiet room ambience. No subtitles, no on-screen
text.
```
*Higgsfield 공식 제품데모 문법(hands-only + gentle dolly-in + hold) 그대로. 이 컷 직후 실기기 스크린 레코딩 인서트(13–17s)로 점프.*

### S4 — 데모 메타포: 자금 흐름의 수렴 (6s)
```
Aerial night view of a vast financial district. Streams of golden light
flow along the dark streets like ocean currents, converging from every
direction toward one glowing teal point near the center of the city.
The gold currents pulse steadily as they merge, growing brighter at the
convergence point. Dark navy cityscape, teal and gold accent light,
volumetric glow, high contrast, premium cinematic fintech commercial
style, vertical framing. Top-down aerial shot slowly craning down
toward the convergence point, one camera move, no cuts. A low ambient
synth pulse building softly. No subtitles, no on-screen text.
```
*앱의 "기관 자금 흐름 추적"을 UI 없이 시각 번역한 컷 — 실 UI 인서트의 의미를 이어받는다.*

### S5 — 확신: 새벽의 사용자 (5s)
```
The same man in his early 30s now stands relaxed by a floor-to-ceiling
window at dawn, the city skyline below tinted navy and gold. He holds
his phone loosely at his side with the screen facing his leg, takes a
calm slow breath, and gives a small confident nod, seen in profile.
Warm gold rim light from the sunrise, teal interior accent lighting,
moody dark navy palette, premium cinematic fintech commercial style,
vertical framing. Slow arc shot moving from behind his shoulder to his
profile, one camera move only. Soft morning city ambience with a gentle
uplifting synth pad. No subtitles, no on-screen text.
```
*"The same man in his early 30s" = 정체성 앵커 반복(드리프트 저감). 폰 화면은 다리를 향해 비노출. 이 씬 위에 실제 별점 오버레이(실수치만) + 면책 문구 시작.*

### S6 — CTA 셸: 폰 뒷면 히어로샷 + 오버레이 여백 (5s)
```
A sleek smartphone stands upright on a dark reflective surface, seen
from directly behind so only its matte back panel is visible, inside an
empty dark navy studio. A slow wave of teal light sweeps across the
reflective floor, followed by fine golden particles drifting upward
around the phone. Large clean negative space fills the upper half of
the frame. Minimal premium product commercial style, moody dark navy
palette, teal and gold accent light, crisp reflections, vertical
framing. Slow pull-back from a close-up to a wider tabletop hero shot,
then hold on a stable end frame. A deep soft bass swell resolving into
near-silence. No subtitles, no on-screen text.
```
*포스트 오버레이(상단 네거티브 스페이스): SIGNUM 로고 + "기관의 흐름을 읽다" + 스토어 배지 + 면책 2줄("투자 정보 제공 앱이며 투자 자문이 아닙니다. 투자에는 원금 손실 위험이 있습니다.") — 판독 가능한 크기로.*

---

### 제작 시 주의 (요약)

- **9:16·5-8초·720p는 전부 파라미터/앱 UI에서 지정** — 프롬프트에는 "vertical framing"만.
- 세로 화면은 가로보다 자막 자동 발생률이 높다(공식 FAQ) → 말미 "no subtitles" 부정 유지 + 발생 시 재생성.
- 순수 생성 프롬프트에 add/remove/replace류 동사를 넣지 말 것(2.5 태스크 오판정).
- 프로토타입은 720p 무음 → 확정 후 최종만 오디오 렌더.
- 발행 전 자동 검수(밝기·컷 하한) 게이트 통과 후 사용 — 기존 리모션 실패(평균밝기 5.2/255) 재발 방지.
- 완성 편집본은 라이브 배포 전 실화면 검증 원칙 동일 적용.

**출처**: docs.volcengine.com/docs/82379/2607688·2607689(2.5), 2222480(2.0), 2168087(1.5 pro), 1631633(1.0), seed.bytedance.com(2.5 발표문), higgsfield.ai(Prompting Guide·1.5 Pro Creator Guide·Help Center), seedance.tv(UI Walkthrough Prompts), newly.app, atlascloud.ai, seedanceai.cc(Troubleshooting), veed.io, memons.ai, thread-transfer.com, sovran.ai, AppsFlyer Creative Optimization 2025, rocketshiphq.com, mishcon.com(ASA 판정), segwise.ai, improvado.io/FINRA 2210, benly.ai, trendtrack.io, kaizen-ad.com
