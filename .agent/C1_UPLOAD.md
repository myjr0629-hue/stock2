# C1 「Max Pain」 업로드 패키지

**파일** `E:\SIGNUM_UPLOAD\2026-08-20\C1_MAXPAIN_explained_52s.mp4` (51.9초 · 1080×1920)
**썸네일** `C1_MAXPAIN_thumb.jpg` — 본편 13.5초 프레임 캡처 (별도 제작 금지 규약)
**근거** [METADATA_BENCHMARK.md](METADATA_BENCHMARK.md) · [REFERENCE_BENCHMARK.md](REFERENCE_BENCHMARK.md)

---

## 제목

```
Why Most Options Expire Worthless — Max Pain on AMD
```

**왜 이 제목인가**

| 판단 | 근거 |
|---|---|
| `Options Expire Worthless` 를 앞쪽에 배치 | 금융 쇼츠 검색 수요 **중앙 2,822** — 측정한 것 중 1위 |
| `Max Pain` 을 단독으로 앞세우지 않음 | `max pain options trading` 수요 **65**. 게다가 게임 «Max Payne» 과 검색 충돌 |
| `AMD` 포함 | 티커 효과는 실측상 무의미(+5%p)지만 검색 매칭에는 쓰인다 |
| 물음표·이모지·전부대문자 안 씀 | n=1,964 전수에서 전부 무의미로 나왔다. 넣을 이유가 없다 |

**대안 (A/B 하려면)** — 우리 채널 자체 상위 3편이 전부 `Why Your ...` 형식이었다 (n=3, 관찰)
```
Why Your Option Expires Worthless — Max Pain on AMD
```

---

## 설명

```
Most options expire worthless. There is one price where the most of them do —
that is max pain. Here is what it means, how it is calculated, and where AMD
actually sits right now.

Real open interest, real levels, no predictions.

Free options data — max pain, gamma flip, whale flow, dark pool:
https://www.signumhq.com

Data: AMD open interest, Aug 21 expiry. Close $466.42. Max pain $450.
Informational only. Not investment advice.

#options #maxpain #AMD
```

> 설명 글자수·링크 유무는 조회수와 무관했다(상관 0.01 / −1%p).
> 그래서 «검색용 문장 + 앱 주소 + 면책»만 담는다. 길게 쓸 이유가 없다.

---

## 태그 (12개)

```
options expire worthless, max pain, max pain options, open interest,
option expiration, options explained, AMD, AMD options, strike price,
options trading explained, dark pool, gamma flip
```

> 태그 개수는 조회수와 상관 **−0.01**, 1,571만 영상은 태그가 **0개**다.
> 검색 매칭용으로만 쓴다 — 실제 검색되는 말만, 스터핑 금지.

---

## 해시태그

```
#options  #maxpain  #AMD
```

해시태그 개수 상관 0.01. 1~3개면 충분하다.

---

## 게시 시각

```
KST 13:00 ~ 19:00  (= ET 00:00~06:00)
```

| 구간 | 효과 | n | 판정 |
|---|---|---|---|
| **KST 13~19시** | **d +0.31** | 192 | ★★ 99% 유의 |
| KST 22~01시 | d −0.15 | 578 | ★★ 99% 유의 **(나쁨 — 지금까지 우리가 주로 쓰던 시간)** |
| 그 외 전부 | −0.03 ~ +0.04 | 103~494 | 우연 범위 |

---

## 고정 댓글

```
Full breakdown — max pain, gamma flip, whale flow and dark pool on any US ticker:
https://www.signumhq.com

Free. No account needed to look.
```

> 규약: **고정 댓글에는 반드시 앱 주소를 넣는다.**

---

## ⛔ 업로드 체크리스트

- [ ] 자막 파일(SRT)을 **올리지 않는다** — 자막이 영상에 구워져 있어 이중 자막이 된다
- [ ] 썸네일은 **본편 프레임 캡처**를 쓴다 (별도 제작 금지)
- [ ] 고정 댓글에 **앱 주소** 포함
- [ ] 게시 시각 **KST 13~19시**
- [ ] 「Shorts」 로 인식되는지 확인 (세로 1080×1920 · 60초 미만 — 51.9초 ✔)

---

## 영상에 들어간 숫자의 출처 (감사 대비)

| 화면 표기 | 값 | 출처 |
|---|---|---|
| 스트라이크별 미결제약정 사다리 | $450 = 11,991계약 (콜 4,327 / 풋 7,664) 외 16개 스트라이크 | `/api/live/options/atm?t=AMD` 2026-08-20 수집 · 만기 2026-08-21 |
| CLOSE $466 | $466.42 (−3.71%) | 앱 헤더 실캡처 |
| MAX PAIN $450 | $450 · gap +3.65% | 앱 타일 실캡처 (전 체인 계산은 앱이 수행) |
| +$16 | 466.42 − 450 = 16.42 | 위 두 값의 차 |
| AMD 일봉 65점 | 190.9 ~ 580.9 → 466.42 | `src/remotion/kit/Concept.tsx` `SERIES` |

⚠ **페이오프 숫자는 매일 바뀐다.** 재사용 시 `node scripts/capture-app.mjs AMD` 로
앱을 다시 캡처하고 `Concept.tsx` 의 `MAXPAIN / NOW / GAP_*` 와 `OI` 를 갱신한 뒤 재렌더한다.
