# 뉴스 벤더 결정 — 실측 근거

> 2026-08-29. 대표 질문: «뉴스는 FMP 로 충분한가? 다른 대체를 생각해야 하나?
> 지금 30달러 정도에 쓰고 있는데.»
> 문서가 아니라 **같은 종목·같은 시각에 실제로 받아** 비교한 결과다.
> 재현: `ENV_FILE=<env> node scripts/news-vendor-compare.js`

## 결론

**FMP 로 충분하다.** 다만 두 가지는 확실히 잃었고, 그중 하나는 이미 메웠다.

지금 당장 다른 벤더를 붙일 이유는 없다. 아래 «언제 바꿔야 하는가» 조건에
걸리면 그때 검토하면 된다.

---

## 1. 실측 비교 (NVDA · TSLA · AAPL 각 40건)

| 항목 | **FMP** (선택) | Finnhub (보유) | Massive (9/23 해지) |
|---|---|---|---|
| **종목 관련도** | **88 / 85 / 85%** | 65 / 33 / 43% | 65 / 43 / 63% |
| 발행사 수 | **15곳** | 3~4곳 | 2~3곳 |
| 본문 200자+ | 38~63% | 10~18% | **100%** |
| 본문 중앙값 | 218자 | 짧음 | **441자** |
| 이미지 | 100% | 93~98% | 100% |
| 최신 기사 | 4.6~8.7h | 7.8~8.9h | 2.9~8.8h |
| 종목별 감성분석 | ✗ | ✗ | **100%** |
| 다종목 1콜 | **✓ (5종목 60건/214ms)** | ✗ | ✗ |
| 일반 뉴스 | 250건 + 페이지네이션 | 100건 · 발행사 3곳 | - |

**소형주 커버리지** (7일 창)
| | IONQ | AEHR | BBAI | CRCL | RGTI |
|---|---|---|---|---|---|
| **FMP** | **20** | **20** | **20** | **20** | **20** |
| Finnhub | 6 | 1 | 2 | 7 | 6 |

→ **종목 관련도와 소형주 커버리지에서 FMP 가 압도적이다.**
   Finnhub 는 TSLA 관련도 33%, AEHR 1건 — 대안이 못 된다.

### Intrinio 는 왜 탈락했나
`/companies/NVDA/news` 결과에 「GE Vernova」「Ford」「Ulta Beauty」가 섞여 나온다.
30건 중 NVDA 언급은 9건(30%). **종목 연결을 신뢰할 수 없다.**
발행사도 yahoo 한 곳뿐이다.

---

## 2. Massive 대비 잃는 것 두 가지

### (1) 본문 길이 — 절반 ⚠️ 일부 완화함
```
FMP     중앙값 218자 · 평균 227자
Massive 중앙값 441자 · 평균 445자
```
분포(NVDA 40건): `≤100자 4건 · 101~300자 27건 · 301~800자 9건`

**완화 조치**: 4건은 「Loading the player」 같은 **플레이어 껍데기 문구**였다.
그대로 두면 AI 요약이 그걸 기사 내용으로 읽는다.
→ 40자 미만·알려진 껍데기는 본문에서 제거(`fmpNewsAdapter.cleanBody`).
→ URL 기준 중복 제거도 함께 (같은 기사가 여러 심볼로 중복되어 온다).

**남은 영향**: 제목 + 218자 요약으로 AI 요약·번역·분석을 만든다.
Massive 시절보다 재료가 얇다. 다만 우리 AI 는 **시세·옵션 구조·플로우를
함께 넣어** 분석하므로, 기사 본문이 유일한 재료가 아니다.

### (2) 종목별 감성분석(`insights`) — 자체 AI 로 대체
Massive 는 기사마다 이런 것을 줬다:
```json
{"ticker":"NVDA","sentiment":"positive",
 "sentiment_reasoning":"Nvidia is positioned as a strategic investor and
  kingmaker in AI infrastructure with a diversified $63.4B portfolio..."}
```
→ 우리는 이미 자체 AI 분석 레이어가 있다(`summaryKR/JP`, `analysisKR/EN/JP`).
   지어내지 않고 `insights: []` 빈 배열로 두었다.

---

## 3. 언제 바꿔야 하는가 (판단 기준)

아래 중 하나라도 실측으로 확인되면 그때 대안을 검토한다.
지금은 해당 없음.

| 신호 | 확인 방법 |
|---|---|
| 종목 관련도가 70% 아래로 | `node scripts/news-vendor-compare.js` |
| 본문 중앙값이 150자 아래로 | 같은 스크립트 |
| 소형주 커버리지가 절반 아래로 | 같은 스크립트 |
| 최신 기사가 12시간 넘게 정체 | 같은 스크립트 |
| 요금이 오르는데 위 지표가 안 좋아짐 | 청구서 + 스크립트 |

### 후보군 (지금은 착수 불필요 — 참고용)
| 벤더 | 대략 요금 | 강점 | 확인 필요 |
|---|---|---|---|
| **Alpha Vantage** NEWS_SENTIMENT | 무료~$50 | **티커별 감성 점수 제공** (Massive insights 대체) | 관련도·커버리지 미측정 |
| Marketaux | $30~50 | 엔티티 매칭 + 감성 | 미측정 |
| StockNewsAPI | $30~50 | 감성 + 토픽 | 미측정 |
| Benzinga News API | $500+ | 최고 품질·속보 | 예산 초과 |
| Tiingo News | $50 | 큐레이션 | 미측정 |

→ 후보 검토가 필요해지면 **trial 키를 받아 같은 스크립트로 측정**할 것.
   문서 스펙만 보고 고르지 말 것 — Intrinio 가 그렇게 탈락했다.

### FMP 상위 티어로 열리는 것 (실측)
현재 플랜에서 402(제한)인 것:
- `news/press-releases` — 기업 보도자료
- `news/press-releases-latest`

열려 있는 것(이미 쓸 수 있음):
- `grades` (애널리스트 등급 1,138건) · `price-target-summary` · `analyst-estimates`
  → **Intrinio 가 403 으로 막은 Zacks 레이어를 FMP 가 대신 열어 준다.**
    `live/analyst`·`live/earnings` 는 이미 FMP 를 쓰고 있다.

---

## 4. 현재 구성 (2026-08-29 기준)

```
뉴스        FMP  stable/news/stock · news/general-latest
애널리스트   FMP  grades · price-target-summary · analyst-estimates
실적일정     FMP + Finnhub
시세/옵션    Intrinio
13F/내부자   Intrinio (증감 계산 포함)
매크로      Yahoo + FRED
```

되돌리기: `NEWS_SOURCE=massive` 환경변수 (9/23 까지만 유효)
