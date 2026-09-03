# SIGNUM 랭킹 엔진 — 사용 안내

> 이 문서 하나만 읽고 쓸 수 있게 썼다. 윈도우 등 다른 기기의 에이전트가 대상이다.
> 최종 갱신 2026-09-03.

## 왜 코드가 아니라 «주소»인가

엔진은 DynamoDB·EC2 Redis 를 직접 읽는다. 코드를 복사해 주면 **AWS 키까지 넘어가야
한다.** 그러면 안 된다. 그리고 두 벌로 갈라지면 어느 날 조용히 달라지고, 그때 어느
쪽이 맞는지 알 수 없다. **구현은 한 곳에만 두고 주소만 부른다.**

---

# 1. 엔진의 대전제

> **절대 순위는 만들지 않는다.**
> 「옵션 프리미엄 TOP」 같은 건 시가총액을 따라가서 매일 NVDA·TSLA·AAPL 이 상위다.
> 답을 미리 아는 랭킹은 볼 이유가 없다.

랭킹은 **둘 중 하나**여야 한다.

| 종류 | 뜻 | 이력 필요? |
|---|---|---|
| **① 이탈(deviation)** | 그 종목 «자신의 평소»에서 얼마나 벗어났나 | 필요 (최소 8세션) |
| **② 위치(position)** | 오늘 옵션 체인에서 «어디에 서 있나» | 불필요 (오늘 값만) |

그리고 셋을 통과해야 목록에 넣는다 —
**오늘의 값이 존재하고**(하루 안 변동 < 날짜 간 변동) ·
**무료로 남이 못 주고** · **한 줄로 읽힌다**.

---

# 2. 부를 주소는 두 개다

```
① GET https://www.signumhq.com/api/ranking            ← 카탈로그 (평소엔 이걸 쓴다)
② GET https://www.signumhq.com/api/ranking/deviation   ← 이탈+위치 엔진의 원본 출력
```

## ① `/api/ranking` — 11개 랭킹 카탈로그

```
GET /api/ranking                    # 목록 + 각 랭킹의 what/why/guards
GET /api/ranking?run=all            # 전부 실행
GET /api/ranking?run=gamma-flip     # 하나만
GET /api/ranking?run=all&top=10     # 개수 지정
```

| 파라미터 | 기본 | 설명 |
|---|---|---|
| `run` | (없음) | 없으면 «목록만». `all` 또는 랭킹 id |
| `top` | 5 | 랭킹당 항목 수 (1~10) |
| `days` | 30 | 이탈 계산에 쓰는 이력 일수 (10~90) |
| `refresh` | (없음) | `1` 이면 캐시 무시. 평소엔 넣지 말 것(캐시 10분) |

인증 없다.

**응답을 읽는 법**

```jsonc
{
  "universe": 1986,                       // 실제로 훑은 종목 수
  "universeSource": "structure-build (2,001종목)",
  "optionSession": "2026-09-03",          // 옵션이 보고 있는 세션
  "darkPool": { "available": true, "date": "2026-09-03" },
  "results": {
    "gamma-flip": {
      "available": true,
      "name": { "ko": "감마플립 근접", ... },
      "what": "...",       // ★ 이 두 줄이 곧 사용법이다. 카드·영상 문구로 그대로 쓴다
      "why":  "...",
      "guards": [ ... ],   // 무엇을 걸러냈는지
      "candidates": 249,   // 게이트를 통과한 종목 수
      "items": [ { "ticker": "ARCC", "price": 20.0, "level": 20.0, "gapPct": 0.02 } ]
    }
  }
}
```

## ② `/api/ranking/deviation` — 원본 엔진

```
GET /api/ranking/deviation?top=5
GET /api/ranking/deviation?top=5&refresh=1     # 캐시 무시하고 다시 계산
```

카탈로그의 `deviation` 이 이 엔진이다. 다만 **축별 목록(`groups`)** 과
**커버리지·축 상태**를 더 자세히 준다. 영상·카드를 만들 때는 이쪽이 편하다.

```jsonc
{
  "groups": {                 // ★ 정본 — 축별 목록. 이걸 쓴다.
    "gammaFlipEdge": [ { "ticker": "QCOM", "level": 170, "distancePct": 0.04, "direction": "above" } ],
    "maxPainPin":    [ { "ticker": "SPY", "level": 765, "gapPct": 0.04 } ]
  },
  "ranking":    [ ... ],      // 합본(요약용). 축별 상한이 걸려 있다.
  "axesStatus": [ { "metric": "dpShareSpike", "ready": false, "note": "..." } ],
  "structure":  { "available": true, "tickers": 1986, "ageMin": 1, "stale": false },
  "coverage":   { "freshPct": 99.3, "lastSeen": { ... } }
}
```

`groups` 의 축 이름과 카탈로그 id 의 대응:

| `groups` 키 | 카탈로그 id | 뜻 |
|---|---|---|
| `gammaFlipEdge` | `gamma-flip` | 감마플립 경계 |
| `maxPainPin` | — | 맥스페인 «핀»(가장 묶인 종목) |
| `maxPainGap` | `maxpain-gap` | 맥스페인 이탈(가장 벗어난 종목) |
| `wallSqueeze` | — | 콜월↔풋플로어 압착 |
| `dpStealth` | `stealth` | 은밀 매집·분산 |
| `dpVolRatio` | `darkpool-volume` | 장외 거래량 급증 |
| `dpShareSpike` | — | 장외 «비중» 급등 (자료 대기 중) |
| `pcr` 외 | `deviation` | 이탈 축 |

---

# 3. 들어 있는 랭킹 — 전체 목록

## 장중 (`phase: intraday`)

| id | 이름 | 무엇을 재나 | 왜 가치가 있나 |
|---|---|---|---|
| `gamma-flip` | **감마플립 근접** | 현재가가 감마 플립 레벨에서 몇 % 이내인가. 가까운 순 | ★ **이 엔진의 간판.** 플립 위에서 딜러는 변동성을 «죽이는» 방향(하락 시 매수)으로, 아래에서는 «키우는» 방향으로 헤지한다. 그 경계에 붙은 종목은 작은 움직임이 성격을 바꾼다. 2,001종목에서 매일 뽑아 주는 무료 도구가 없다 |
| `maxpain-gap` | **맥스페인 이격도** | 현재가가 맥스페인에서 몇 % 떨어져 있나. 먼 순 | 만기가 가까울수록 주가가 맥스페인 쪽으로 끌리는 경향(핀 현상). 이격이 크다 = 그 인력이 아직 작동 안 했거나 강한 힘이 밀어내고 있다 |
| `deviation` | **평소 대비 이탈** | 풋콜 비율·콜/풋 미결제약정·옵션 자금을 그 종목의 30일 중앙값과 비교 | 「이 종목이 평소와 다르다」만이 매일 답이 달라진다. 그날 시장 중앙 배수로 나눠 «시장이 같이 움직인 몫»을 뺀다 |
| `multi-axis` | **다축 동시 이탈** | 두 축 이상에서 동시에 벗어난 종목만 | 한 축만 튀는 건 우연일 수 있다. 여럿이 같이 움직이면 같은 사건의 여러 얼굴이다 |
| `money-vs-oi` | **돈과 포지션의 불일치** | 프리미엄 비 vs 미결제약정 비가 서로 반대를 가리키는 정도 | 풋이 수로 깔려 있는데 돈은 콜에 몰리는 그림이 실제로 나온다. 하나만 보면 정반대로 읽는다 |

## 마감 후 (`phase: postclose` · FINRA, 17:30 ET 이후)

| id | 이름 | 무엇을 재나 | 왜 가치가 있나 |
|---|---|---|---|
| `stealth` | **은밀 축적·분산** | `거래량 백분위×0.6 + (100−공매도 백분위)×0.4`. 70↑ 축적 / 30↓ 분산 | ★ **가장 «우리만».** 물량만 보면 방향을 모르고, 공매도만 보면 구조적 절반에 속는다. 둘을 겹쳐야 방향이 나온다 |
| `darkpool-volume` | **장외 물량 이탈** | 장외 체결량이 20일 평균의 몇 배인지를, 다시 그날 시장 중앙 배수로 나눈 값 | 거래소 밖 체결은 기관이 시장가를 안 흔들려 할 때 늘어난다. 시장 전체가 조용한 날 보정을 위해 시장 대비로 본다 |
| `darkpool-short` | **장외 공매도 비중 이탈** | 장외 체결 중 공매도 비중이 평소보다 몇 %p 벗어났나 | ⚠️ 비중 «자체»는 방향성이 아니다. 시장 중앙값이 약 49% — 도매업자가 소매 매수의 상대일 때 일단 공매도로 팔기 때문이다. **「46% 공매도 = 하락 베팅」은 오독이다** |
| `volatility-bet` | **조용한데 비싸진 옵션** | 실현 변동성은 낮은데 내재 변동성이 오른 종목 | 「아직 안 움직였는데 누군가 값을 치르고 있다」 |

## 세션 무관 (`phase: anytime`)

| id | 이름 | 무엇을 재나 | 왜 가치가 있나 |
|---|---|---|---|
| `insider-conviction` | **내부자 자신감 매집** | 미국 시장 «전체» 내부자 신고에서 SEC 코드 **P(장내 매수)만** 골라 종목별 금액 합계 | 회사를 가장 잘 아는 사람이 **자기 돈으로** 산 것만 남긴다. 보상 취득(A)·옵션행사(M)·세금납부(F)는 아무 말도 안 한다(실측 908건 중 절반 이상이 그런 것이었다). 유니버스 밖 «발굴형»이라 모르던 티커가 올라온다 |
| `deep-value-fcf` | **현금창출 대비 저평가** | 잉여현금흐름 대비 기업가치 | 유일한 «펀더멘털» 축. 옵션 축과 겹치지 않아 서로 검증이 된다 |

---

# 4. 언제 무엇이 비어 있는가 (중요)

**비어 있는 것 = 고장이 아니다.** 엔진은 «없는 자료를 지어내지 않는다»가 원칙이다.

| 상황 | 어떻게 보이나 | 이유 |
|---|---|---|
| 장중 (마감 전) | `darkpool-*`·`stealth` 가 `available:false` | FINRA 는 **마감 후 약 90분(17:30 ET)** 에 그날 자료를 낸다. 어제 것을 오늘인 척 섞지 않는다 |
| 옵션 세션 ≠ 다크풀 날짜 | 다크풀 랭킹 전체 제외 | 오늘 옵션에 어제 다크풀을 섞으면 3일 전 숫자가 1위로 올라온다 |
| `deviation`·`multi-axis` 후보가 적음 | 후보 10~20건 | 이력이 최소 8세션 필요하다. 2026-09-03 부터 2,001종목 이력을 새로 쌓기 시작했고 **약 9거래일 뒤** 정상화된다 |
| `axesStatus[].ready === false` | 그 축만 빠짐 | 자료를 기다리는 중이다. 차면 손대지 않아도 켜진다 |
| `structure.stale === true` | 위치 축이 오래됨 | 구조를 구운 지 4시간이 넘었다. 마감 후에는 정상(그날 종가 구조가 정답) |

---

# 5. 절대 하면 안 되는 것

1. **축을 섞어 비교하지 말 것.** 배수·%p·근접도는 «자»가 다르다.
   축 **안에서만** 순위가 정확하다. 그래서 `groups` 가 정본이다.
2. **`direction` 을 빼고 읽지 말 것.** `surge`/`collapse`, `above`/`below` 가 있다.
   배수만 보고 카드를 그리면 「평소의 0.011배」가 1위로 나오는 사고가 난다(실제로 났다).
3. **절대값으로 순위를 매기지 말 것.** 다크풀 비중 상위, 프리미엄 상위 — 매일 같은 이름이다.
4. **없는 값을 0 으로 채우지 말 것.** 0 으로 채우면 그 종목이 1위로 올라온다.
5. **`what`/`why` 를 임의로 바꿔 쓰지 말 것.** 응답에 실려 오는 문구가 정본이다.
   특히 공매도 비중은 «평소 대비»로만 말해야 한다(위 표의 ⚠️).

---

# 6. 자료는 누가 만드나 (크론)

| 크론 (UTC) | 하는 일 |
|---|---|
| `5 13,15,17,19,21 * * 1-5` → `/api/cron/structure-build` | 2,001종목의 **오늘 체인 구조**(맥스페인·감마플립·콜월·풋플로어)를 8조각으로 굽는다. 실측 **100%·10초**. 장중이면 이탈 축 이력도 같이 남긴다 |
| `0 15,18 * * 1-5`, `25 21`, `10 22` → `/api/cron/ranking-build` | 이탈 축 조각 8개를 굽고 합본 캐시를 새로 만든다 |

⚠️ **구조 굽기가 먼저 돌아야** 랭킹이 갓 구운 값을 읽는다. 크론 순서가 그렇게 잡혀 있다.

수동 실행이 필요하면:
```
curl "https://www.signumhq.com/api/cron/structure-build"   # 구조 (약 10초)
curl "https://www.signumhq.com/api/cron/ranking-build"     # 랭킹 (약 20초)
```

---

# 7. 윈도우에서 바로 쓰는 예

**PowerShell — 오늘의 감마플립 근접 5종목**
```powershell
$r = Invoke-RestMethod "https://www.signumhq.com/api/ranking?run=gamma-flip&top=5"
$r.results.'gamma-flip'.items | ForEach-Object {
  "{0,-6} 플립 {1} · 거리 {2}%" -f $_.ticker, $_.level, $_.gapPct
}
```

**PowerShell — 전부 한 번에**
```powershell
$r = Invoke-RestMethod "https://www.signumhq.com/api/ranking?run=all&top=5"
"유니버스 $($r.universe) · $($r.universeSource)"
foreach ($k in $r.results.PSObject.Properties.Name) {
  $v = $r.results.$k
  if (-not $v.available) { "$k : (자료 없음 - $($v.reason))"; continue }
  "$k [$($v.name.ko)] 후보 $($v.candidates)"
  $v.items | ForEach-Object { "   $($_.ticker)" }
}
```

**축별 목록이 필요하면(영상·카드용)**
```powershell
$d = Invoke-RestMethod "https://www.signumhq.com/api/ranking/deviation?top=5"
foreach ($k in $d.groups.PSObject.Properties.Name) {
  "-- $k"
  $d.groups.$k | ForEach-Object { "   $($_.rank). $($_.ticker) ($($_.direction))" }
}
```

---

# 8. 문제가 생기면 먼저 볼 것

| 증상 | 먼저 확인할 것 |
|---|---|
| 랭킹이 통째로 비었다 | `universe` 와 `universeSource`. 25 라고 나오면 구조 캐시가 없는 것 → `structure-build` 를 돌린다 |
| 위치 축(감마플립·맥스페인)만 없다 | `structure.available` / `ageMin`. TTL 26시간이라 하루 넘게 안 구우면 사라진다 |
| 다크풀만 없다 | `darkPool.reason`. 「아직 안 들어옴」이면 정상(마감 후 90분) |
| 이탈 축 후보가 10건대다 | `coverage.freshPct` 와 `axes[].samples`. 이력이 8세션을 넘어야 한다 |
| 순위가 이상하다 | 각 항목의 `direction` 을 보고 있는지. 배수만 읽고 있으면 붕괴와 급증이 뒤섞인다 |
