# SIGNUM 캐릭터 정본 — 영상 생성 시 «반드시» 이 설정을 쓴다

> 대표 확정 2026-08-22. 앞으로 만드는 모든 AI 영상 클립에서 이 캐릭터를 유지한다.
> **매번 새로 만들지 않는다.** 아래 블록을 그대로 복사해 프롬프트 앞에 붙인다.

---

## 고정 블록 (수정 금지 · 그대로 복사)

```
A small rounded 3D character shaped like a chunky navy-blue hardcover ledger book, with
cream page edges showing along one side. On its front cover it has two large expressive
eyes with soft dark eyebrows and a small friendly smile, and it has short stubby arms and
legs. An amber bookmark ribbon hangs from the top edge on the left. The cover and spine
are completely blank, with no lettering of any kind. Soft matte surface, gentle rim light,
calm and curious.
```

확정: 2026-08-22 · 실제 생성 4편으로 검증 (`ax-count-tally` `ax-two-piles` `ax-ledger-open` `ax-magnifier`)

### ⛔ 「입 없음」에서 「입 있음」으로 바꾼 이유

첫 정본은 `no mouth` 였다. 레퍼런스 둘 다 입을 거의 안 써서 립싱크 사고를 피하려던 것이다.
그런데 **4편 전부 입과 눈썹이 나왔다.** 모델이 「친근한 3D 캐릭터」를 그렇게 해석한다.

두 가지 이유로 «결과에 맞춘다»:
1. **결과가 더 낫다** — 감정이 훨씬 잘 읽힌다. 우리는 캐릭터를 말하게 하지 않으므로 립싱크 문제가 없다.
2. **모델과 싸우면 일관성이 깨진다** — 계속 `no mouth` 를 넣으면 어떤 편은 입이 있고 어떤 편은 없다.
   그게 「입이 있는 것」보다 훨씬 나쁘다.

⛔ 원칙: **프롬프트가 결과를 못 이기면, 프롬프트를 결과에 맞춘다.** 일관성이 의도보다 우선이다.

---

## 왜 하나로 고정하는가

레퍼런스 실측 (2026-08-22 · 스토리보드로 직접 확인):

| 채널 | 조회 | 캐릭터 |
|---|---|---|
| MonkeyExplains | 99.6만 | 원숭이 — **매 편 같은 캐릭터**가 장면을 연기 |
| 경제사냥꾼 | 13.8만 | 초록 지폐 마스코트 — **매 장면 등장** |

**같은 캐릭터가 반복되어야 «채널»이 된다.** 클립을 아무리 많이 뽑아도 캐릭터가 매번 다르면
시리즈가 아니라 스톡 영상 모음이 된다.

⛔ 화질보다 캐릭터 일관성이 먼저다. 화질이 조금 아쉬워도 캐릭터가 같으면 쓸 수 있고,
   화질이 좋아도 캐릭터가 다르면 버린다.

## 왜 장부(ledger)인가

우리 채널의 정체가 «세는 것»이다. 캐릭터가 하는 일이 곧 채널이 하는 일이어야 한다.
(경제사냥꾼의 초록 지폐 = 돈 이야기 / MonkeyExplains 의 원숭이 = 보통사람 — 같은 원리)

## 왜 입이 없는가

립싱크가 안 맞으면 즉시 어색해진다. 레퍼런스 둘 다 입을 거의 쓰지 않는다.
**표정은 눈과 리본으로만** 만든다.

---

## 적용 범위 (실측 기준)

| 포맷 | 이 캐릭터 | 근거 |
|---|---|---|
| **영어 롱폼** | **쓴다** | 레퍼런스 둘 다 캐릭터 고정. 지금 발주 중인 `ax-` 40개가 전부 이 캐릭터 |
| **일본 쇼츠** | **쓰지 않는다** | 일본 인기 쇼츠 12편에 캐릭터 애니 **0편** (2026-08-22 실측). 실사가 이긴다 |
| 영어 쇼츠 | **미측정** | 아직 안 재봤다. 롱폼이 자리 잡은 뒤 테스트한다 |

⛔ 「일본 쇼츠에 안 쓴다」는 캐릭터가 나빠서가 아니라 **그 시장·그 포맷에서 반대 결과가 나왔기 때문**이다.
   포맷이 바뀌면 다시 잰다.

---

## 클립 파일 규칙

- 이름 접두사 **`ax-`** (ani × 16:9). 세로 `ani-` 와 구분된다
- 위치 `public/shorts/bg/video/`
- 받은 파일은 **반드시** `clip-ingest` 를 거친다 — 워터마크 제거 + 검수 + 저장이 한 번에 된다

```bash
node scripts/clip-ingest.mjs <받은파일.mp4> ax-count-tally --check   # 첫 클립: 워터마크 상자 확인
node scripts/clip-ingest.mjs <받은파일.mp4> ax-count-tally           # 이후: 처리 + 검수 + 저장
```

발주서 전체: `.claude/skills/signum-shorts/references/clip-briefs-169.md` (40개, 한 블록 = 완성 프롬프트)
