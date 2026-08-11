# 클립 발주서 문법 (사용자가 Higgsfield/Flow에서 생성)

## 절대 규칙

1. **초를 프롬프트 첫 단어로** — Flow는 4/6/10초만 가능. `6 seconds. <내용>`
2. **텍스트 금지 문구를 매 프롬프트 끝에**: `No text, no signs, no readable screens, no logos.`
   (장면 안 글자는 반드시 깨진다 — 달력 "WENESDAY" 사건)
3. **얼굴 클로즈업 금지** (AI 얼굴 티가 난다): 군중은 뒷모습·와이드로
4. 9:16 세로, 최고 해상도. 워터마크는 후처리에서 상단-좌 크롭(0.9)으로 제거된다

## 실사 vs 심볼릭 배분 (이야기 구조와 일치시킬 것)

| 층 | 소재 | 연출 |
|---|---|---|
| 실사·중량감 (신뢰) | 트레이딩 플로어·거래소 외경·광산·탱커·송전·연준 | 자연광 다큐, 먼지·물리적 스케일 |
| 심볼릭·판타지 (욕망·주제선언) | 칩이 자원을 삼킴·미니어처 디오라마·발광 두뇌·로봇 손·모래시계 | 초현실 3D, 발광, 미니어처(틸트시프트) |

전환 지점(색 반전: 주황↔파랑)에서 화이트 플래시를 넣으면 주제가 한 컷에 전달된다.

## 재사용 라이브러리 (재생성 불필요)

`E:\Down\3` — 1 트레이딩플로어 · 2 NYSE 외경 · 3 해협 항공 · 4 탱커 뱃머리 · 5 연준 · 6 화이트 스튜디오(아웃트로)
`E:\Down\4` — 쇳물 · AI칩 매크로 · 데이터센터 비행 · 로봇팔 · 광산트럭 · 송전
`E:\Down\5` — 칩이 구리를 삼킴 · 미니어처 광산-DC · 구리 두뇌 · 로봇 손 · 모래시계 · 고갈 광맥

같은 클립도 zoom(0.68~0.9) 변형으로 다른 컷처럼 쓸 수 있다 — 발주 수를 줄이는 핵심 기법.

## 예시 (심볼릭)

```
6 seconds. Surreal macro: a giant glowing AI processor chip at center, thick molten
copper streams being sucked into its core like it is feeding, circuit traces igniting
orange as the metal is absorbed, dark studio void, dramatic volumetric light.
Cinematic hyper-real 3D render, vertical 9:16. No text, no logos.
```

## 예시 (실사)

```
6 seconds. Wide shot of a stock exchange trading floor from behind, a crowd of traders
seen from the back raising arms, no faces visible to camera, large blurred green wall of
monitors, handheld energy, slight push-in, bright daylight. Photorealistic documentary
footage, vertical 9:16. No text, no readable screens, no logos.
```
