# ASO 검색어 지도 — 실측 (2026-09-02)

> 도구: `python3 scripts/aso-opportunity-scan.py` (언제든 다시 돌린다)
> 판정 = **상위 5개 앱의 평점 수 중앙값**. 우리는 평점 0이므로 이 값이 낮을수록 뚫린다.

## ★ 이 문서가 생긴 이유 — 내가 크게 틀렸다

맥스페인·다크풀·GEX 같은 **전문가 용어**를 공략어로 잡고 있었다. 실측하니 반대였다.

| 검색어 | 그 말을 이름에 넣은 앱 | 그 앱들 평점 |
|---|---:|---|
| `max pain` | **0개** | — |
| `options flow` | 3개 | **17 · 0 · 0** |
| `dark pool` | 1개 | **1** |

경쟁이 약한 게 아니라 **아무도 안 찾는 쪽**이다. 검색량이 있었다면 개발자들이
그 말을 겨냥했을 것이고 그 앱들에 사용자가 있었을 것이다.

**대표 지적(2026-09-02):** 「누가 맥스페인·감마로 검색하냐. 미국주식·주식차트·
무료 주식앱 같은 걸로 찾지. 일단 사람을 끌어와야 안에서 깊이가 무기가 된다.」
→ 이 지적이 맞았다. 아래는 그 지적대로 다시 재본 결과다.

## 🇰🇷 한국 — ★★즉시 (중앙값 ≤100)

| 검색어 | 중앙값 | 현재 우리 순위 | 1위 앱 |
|---|---:|---|---|
| **기업 실적 발표** | **0** | — | Stocks and Shares |
| **장마감** | **0** | — | (무관 앱) |
| **미국주식 실적** | 2 | SIGNUM=5, UC=9, WIM=14 | 퀀트뷰 |
| **실적발표** | 2 | — | Investing.com |
| **실적 발표 일정** | 2 | — | 퀀트뷰 |
| **증시 캘린더** | 2 | — | 스톡나우 |
| **애프터마켓** | 2 | — | (무관 앱) |
| **서학개미** | 4 | UC=6, WIM=8 | 앤트피드 |
| **배당주** | 5 | — | 더리치 |
| **시황** | 9 | — | 스톡베리 |
| **미장** | 9 | SIGNUM=13 | 스톡허브 |
| **증시 뉴스** | 14 | UC=16 | SAVE |
| **엔비디아** | 22 | — | NVIDIA SHIELD TV |
| **오늘의 증시** | 48 | — | 오늘의 증시 |
| **미국증시** | 48 | SIGNUM=13, UC=22 | 스톡나우 |
| **주식 알림 앱** | 67 | — | 래빗스탁 |
| **주식 리포트** | 89 | — | SAVE |

★가능(≤1000): 무료 주식 정보 255 · 테슬라 271 · 주식 실시간 288 · 미국주식 차트 382 · 경제 뉴스 876

## 🇯🇵 일본 — ★★즉시

| 검색어 | 중앙값 | 현재 우리 순위 | 1위 앱 |
|---|---:|---|---|
| **米国株 ニュース** | **5** | UC=10, WIM=17 | Yahoo!ファイナンス |
| **米国株 リアルタイム** | **11** | — | SBI証券 |
| **決算** | 20 | — | KabuDoc |
| **決算発表** | 20 | — | KabuDoc |
| **テスラ** | 22 | — | Tesla |
| **米国 経済** | 50 | WIM=15 | Yahoo!ファイナンス |
| **オルカン** | 75 | — | 全力オルカン |

★가능: 米国株 決算 145 · 時間外取引 615 · 決算 カレンダー 675 · 米国株 分析 697

## 🇺🇸 미국 — ★★즉시

| 검색어 | 중앙값 | 현재 우리 순위 | 1위 앱 |
|---|---:|---|---|
| **premarket** | **1** | **SIGNUM=4** | Premarket |
| **finance quiz** | **6** | — | Quiz of Finance |
| **after hours** | 36 | — | AfterHour |
| **earnings calendar** | 67 | — | Earnings Hub |

★가능: earnings 480 · ticker 2,685

## ⛔ 이름 바꿔도 못 들어가는 곳 (건드리지 말 것)

`stocks` 1,796,989 · `stock app` 1,796,989 · `free stocks` 860,360 · `investing` 860,360 ·
`株価` 73,001 · `stock tracker` 72,838 · `나스닥` 20,170 · `株` 20,122 · `주식차트` 14,387

## ★★ 여기서 나오는 전략 — 세 개의 «문»

전문가 용어가 아니라 **모든 주식 투자자가 매일 쓰는 말**로 문을 만든다.
그리고 **우리 앱은 이미 이 셋을 다 갖고 있다**(없는 걸 지어내는 게 아니다).

1. **캘린더/일정** — 실적 발표 일정 · 증시 캘린더 · earnings calendar · 決算カレンダー
   → 경쟁 사실상 0. 우리에겐 `/api/cron/economic-calendar` 가 이미 돈다.
2. **시간대** — 프리마켓 · 애프터마켓 · premarket · after hours · 時間外
   → `premarket` 은 중앙값 **1**, 우리는 이미 4위.
3. **알림 + 무료** — 주식 알림 앱 · 무료 주식 정보 · free stock alerts
   → 「무료」는 사람들이 실제로 붙여 검색하는 말이다.

깊이(옵션 플로우·다크풀·GEX)는 **들어온 뒤의 무기**이지 문패가 아니다.

---

## 적용 완료 — 2026-09-02 (ASC API, 3앱 × 3로케일 = 9개)

라이브 버전은 건드리지 않았다. 새 편집 버전에만 넣었다
(SIGNUM 1.5 · UC 1.0.4 · WIM 1.0.2, 전부 `PREPARE_FOR_SUBMISSION`).

| | 이름 | 부제 |
|---|---|---|
| SIGNUM ko | `SIGNUM HQ: 서학개미 미국증시 실적` | 프리마켓·애프터마켓·옵션 흐름 알림 |
| SIGNUM en | `SIGNUM HQ: Premarket Earnings` | After Hours, Calendar & Alerts |
| SIGNUM ja | `SIGNUM HQ: 米国株リアルタイム決算` | プレマーケット・時間外・無料アラート |
| UC ko | `언더커런트: 서학개미 미국증시 뉴스` | 오늘의 증시·시황·기관 자금 흐름 |
| UC en | `Undercurrent: Stock News Daily` | Market Recap, Earnings & Money |
| UC ja | `アンダーカレント：米国株ニュース速報` | 決算・市況・機関の資金フローを毎日 |
| WIM ko | `Why'd It Move? 서학개미 미국주식 퀴즈` | 하루 3분, 미국증시 왕초보 공부 |
| WIM en | (유지) `Why'd It Move?: Stock Quiz` | Daily finance quiz in 60 sec |
| WIM ja | `Why'd It Move? 米国株・決算クイズ` | 毎日3分、米国経済とチャートを学ぶ |

키워드 9개 전부 76~97/100자로 채움.

### ★ 잃지 않게 설계한 방법
애플은 **이름+부제+키워드를 합쳐서** 색인하고 필드 간 중복은 제거한다.
그래서 이름에서 뺀 말(`미국주식`·`옵션`)을 **부제·키워드로 옮겨** 보존했다.
현재 순위(`미국주식 옵션` 2위 등)를 잃지 않으면서 새 문만 추가한 것이다.

### 절차 (다음에 그대로 재현)
```python
import sys; sys.path.insert(0,"scripts"); import asc_client as A
A.call("POST","/appStoreVersions", {...})              # 편집 슬롯 생성
A.call("GET", f"/apps/{aid}/appInfos")                 # ★ PREPARE_FOR_SUBMISSION 인 것을 고를 것
A.call("PATCH", f"/appInfoLocalizations/{lid}", {...}) # 이름·부제
A.call("PATCH", f"/appStoreVersionLocalizations/{lid}", {...}) # 키워드
```
**함정:** `BASE` 에 이미 `/v1` 이 있다 — 경로에 또 붙이면 404 다.
**함정:** appInfo 는 앱당 여러 개다. 라이브(`READY_FOR_SALE`)를 고치면 아무 일도 안 일어난다.

### ★★ 함정(가장 컸다): 이름·부제·키워드는 «새 빌드»가 있어야 나간다

애플에서 이 셋을 바꾸려면 **새 버전 + 그 버전용 새 빌드**가 필요하다.
빌드 없이 메타데이터만 채우면 버전이 `PREPARE_FOR_SUBMISSION` 에 영원히 멈춘다
— 화면상 아무 에러도 없고, 그냥 **적용이 안 될 뿐**이다.

2026-09-01 에 내가 정확히 이걸 했다. SIGNUM 1.5 는 구독 때문에 빌드가 있어서
같이 나갔지만, **UC 1.0.4 · WIM 1.0.2 는 빌드가 없어 9/2 까지 멈춰 있었다.**
대표가 앱 목록에서 「제출 준비 중」 두 개를 보고 지적해서 발견했다.

**확인법 한 줄:**
```python
A.call("GET", f"/appStoreVersions/{vid}/build")   # data:null 이면 안 나간다
```
**해결:** `./scripts/ios-release.sh <signum|uc|wim> <버전> "<새로운 기능 en>"`
— 이 스크립트는 **기존 버전을 재사용**하고 `whatsNew` 만 채우므로
이름·부제·키워드를 덮어쓰지 않는다.

## 적용 완료 — 구글 플레이 (2026-09-02)

앱스토어만 하고 플레이를 안 했었다. 플레이는 **빌드 없이** 리스팅만 심사 제출된다.

| | 이름 | 짧은 설명 |
|---|---|---|
| SIGNUM en | `SIGNUM HQ: Premarket Earnings` | Premarket and after-hours movers, earnings calendar, and daily stock alerts. |
| SIGNUM ko | `SIGNUM HQ: 서학개미 미국증시 실적발표` | 프리마켓·애프터마켓 급등락, 기업 실적 발표 일정과 증시 캘린더, 미국증시 알림을 한 곳에서. |
| SIGNUM ja | `SIGNUM HQ: 米国株リアルタイム決算` | プレマーケット・時間外取引の値動き、決算発表カレンダーと米国株ニュースをまとめて。 |
| UC en | (유지) | Daily market recap, premarket and after-hours movers, and earnings news. |
| UC ko | `언더커런트: 서학개미 미국증시 뉴스 시황` | 오늘의 증시 브리핑, 프리마켓·애프터마켓 시황과 미장 뉴스를 매일 아침 한 편으로. |
| UC ja | `アンダーカレント：米国株ニュース・決算速報` | 毎朝の市況ブリーフィング、プレマーケット・時間外の値動きと米国株ニュースを1本で。 |
| WIM en | (유지) | (유지 — 이미 일상어) |
| WIM ko | `Why'd It Move? 서학개미 미국주식 퀴즈` | 하루 3분 미국주식 퀴즈. …주식 왕초보 투자 공부, 차트 읽는 법, 경제 공부. |
| WIM ja | `Why'd It Move? 米国株・決算クイズ` | 1日3分の米国株クイズ。…決算発表で学ぶ株初心者の投資と経済の勉強、チャートの読み方。 |

심사 제출: SIGNUM 6건 · UC 5건 · WIM 4건 (Managed publishing off → 승인 즉시 반영)

### ★ 플레이 함정 — 짧은 설명에 「무료/free」를 쓰면 프로모션에서 빠진다
> Your app may not be promoted on Google Play because your short description
> does not meet the following guidelines: Should not use keywords that
> indicate price or promotion

기존 ko/ja 설명이 「무료」·「無料」로 끝나고 있었다 → **세 앱 모두에서 제거**했다.
검사기는 저장할 때 돌고, 고치면 배너가 사라진다. 전체 설명(full description)은
해당 없음. 「무료」로 사람을 끌고 싶으면 **본문**에 쓸 것.

### ★ 플레이는 저장≠제출
저장하면 «Publishing overview» 에 쌓일 뿐이다. 앱마다 들어가서
**「Submit N changes for review」**를 눌러야 심사가 시작된다.
(앱스토어의 빌드 함정과 같은 실수를 여기서도 하기 쉽다)
