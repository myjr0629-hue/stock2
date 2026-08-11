# 클립 인벤토리 (배경 라이브러리)

**갱신 2026-08-11 · 16편 · 전부 Seedance 2.5 무제한 생성(무과금, `cost: null` 실측)**

기계가 읽는 정본은 **`public/shorts/bg/index.json`** 과 **`src/remotion/kit/bglib.json`**.
이 문서는 사람이 훑어보는 용도다. `node scripts/hf-sync.mjs <manifest>` 를 돌리면 둘 다 자동 갱신된다.

---

## 저장 경로

| | 경로 |
|---|---|
| 최종본 | `public/shorts/bg/<카테고리>/<파일명>.mp4` |
| 원본(재인코딩 전) | `public/shorts/bg/.raw/<jobId>.mp4` |
| 기계용 인덱스 | `public/shorts/bg/index.json` · `src/remotion/kit/bglib.json` |

**전부 `.gitignore` 처리돼 있다** — git 에 올라가지 않는다(§공유 전략 참조).

---

## 스펙 (전 클립 공통)

```
720 × 1280 (9:16) · 5.0초 · h264 · 무음(-an) · GOP 15
```

`-g 15` 재인코딩은 **필수**다. Seedance 원본은 GOP 가 길어 Remotion `OffthreadVideo` 의
프레임 탐색이 멈춘다(2026-08-10 T2 렌더가 862프레임에서 타임아웃한 원인).

**룩 분류**
- `real` = 실사/포토리얼 — 증거 구간, 신뢰가 필요한 자리
- `symbolic` = 은유·양식화(미니어처·애니·판타지·추상) — 훅, 시선을 멈추는 자리

---

## 인벤토리

| 파일명 | 길이 | 내용 | 룩 | 경로 |
|---|---|---|---|---|
| `brief-01-extreme-macro-silicon-wafer.mp4` | 5s | 웨이퍼 거울면에 균열이 방사형으로 번짐 | symbolic | `bg/brief/` |
| `endcard-01-bright-minimal-desk-pale.mp4` | 5s | 밝은 석재 책상, 창빛이 흐름 (중앙 비어 있음) | real | `bg/endcard/` |
| `endcard-02-clean-seamless-white-studio.mp4` | 5s | 화이트 스튜디오 배경, 빛 블룸 (전체 비어 있음) | real | `bg/endcard/` |
| `finance-01-facade-classical-stock-exchange.mp4` | 5s | 골든아워 거래소 파사드, 기둥에 저녁 햇빛 | real | `bg/finance/` |
| `finance-03-enormous-polished-steel-vault.mp4` | 5s | 대리석 홀에서 회전하며 열리는 강철 금고문 | real | `bg/finance/` |
| `hook-01-extreme-macro-shot-silicon.mp4` | 5s | 실리콘 웨이퍼 초접사, 회로가 항공뷰 도시처럼 | real | `bg/hook/` |
| `hook-05-extreme-macro-liquid-mercury.mp4` | 5s | 수은 방울들이 하나의 구로 합쳐짐 | symbolic | `bg/hook/` |
| `morning-01-sunrise-manhattanstyle-skyline-golden.mp4` | 5s | 일출 스카이라인, 빛이 협곡을 타고 들어옴 | real | `bg/morning/` |
| `morning-02-vast-open-office-waking.mp4` | 5s | 새벽 오피스, 모니터가 파도처럼 켜짐 | real | `bg/morning/` |
| `morning-03-enormous-polished-golden-bell.mp4` | 5s | 햇빛 아트리움의 거대한 황금 종 (개장 종 은유) | symbolic | `bg/morning/` |
| `morning-04-aerial-sunrise-harbor-packed.mp4` | 5s | 일출 컨테이너 항만 항공 | real | `bg/morning/` |
| `morning-05-timelapse-dawn-light-sweeping.mp4` | 5s | 책상 위 새벽빛 타임랩스, 커피잔 | real | `bg/morning/` |
| `morning-06-city-waking-above-golden.mp4` | 5s | 골든아워 도시 항공, 차량 광선 | real | `bg/morning/` |
| `stylized-01-anime-style-crisp-cel.mp4` | 5s | 애니풍 칩팹 — 천장 레일로 웨이퍼 캐리어가 흐름 | symbolic | `bg/stylized/` |
| `stylized-02-tiltshift-miniature-semiconductor-fab.mp4` | 5s | 틸트시프트 미니어처 반도체 팹 | symbolic | `bg/stylized/` |
| `tech-11-rocket-engine-static-fire.mp4` | 5s | 로켓 엔진 정지연소 시험, 대낮 배기 플룸 | real | `bg/tech/` |

**합계 16편 · 약 24MB**

---

## 카테고리와 역할 배선

`src/remotion/kit/backdrops.ts` 의 `ALLOW` 가 **역할별로 쓸 수 있는 카테고리를 강제**한다.

| 역할 | 허용 카테고리 | 이유 |
|---|---|---|
| `hook` | stylized · tech · hook · anime · fantasy | **다큐 톤 금지** — 첫 3초에 「뉴스인가」 하고 넘긴다 |
| `open` | morning · stylized · anime | 아침이 열리는 결 |
| `chips` | tech · stylized · anime | 반도체·하드웨어 |
| `money` | finance · tech · stylized | 자금 흐름 |
| `evidence` / `depth` | tech · finance · sector | **신뢰가 필요한 자리 = 실사** |
| `conflict` / `verdict` | stylized · fantasy · hook | 은유가 더 잘 읽힌다 |
| `outro` | endcard | 앱 홍보 플레이트 |

---

## 부족한 것 (다음 수확 우선순위)

1. **tech 카테고리가 1편뿐** — EUV · GPU랙 · 클린룸 로봇팔 · 희석냉동기 · 광섬유
2. **fantasy 0편** — 하늘의 웨이퍼 섬, 서버랙 대성당, 프리즘 분광
3. **stinger 0편** — 컷 전환용 1~2초 소재
4. **밝기** — 현재 평균 41 수준. 레퍼런스 81 대비 낮다. 밝은 실사가 들어와야 오른다
