# 다음 앱 버전이 나갈 때 «반드시 같이» 처리할 것

라이브 버전(`READY_FOR_SALE`)에서는 못 고치고 **편집 가능한 새 버전이 있어야만** 되는 것들이다.
빌드가 나갈 때 이걸 안 하면 다음 버전까지 또 몇 주를 그대로 간다.

## 라이브 버전에서 «되는 것 / 안 되는 것» (2026-09-19 실측)

| 필드 | 라이브에서 수정 | 근거 |
|---|---|---|
| `promotionalText` | ✅ 된다 | 오늘 36칸 전부 썼고 재쓰기도 성공 |
| `marketingUrl` | ❌ 409 | `Attribute 'marketingUrl' cannot be edited at this time` |
| `supportUrl` | ❌ 409 | `Attribute 'supportUrl' cannot be edited at this time` |
| 앱 미리보기(`appPreviewSets`) | ❌ 409 | `ENTITY_ERROR.ATTRIBUTE.INVALID.INVALID_STATE` |
| 인앱이벤트 `deepLink` | ❌ 409(승인 후) | `territorySchedules`·`priority` 만 허용 |
| **릴리스 노트 `whatsNew`** | **❌ 409** | 2026-09-20 실측: `STATE_ERROR — Attribute 'whatsNew' cannot be edited at this time` |
| **`description`(설명 본문)** | **❌ 409** | 2026-09-20 실측: 같은 `STATE_ERROR`. → **라이브 iOS 버전에서 바꿀 수 있는 것은 `promotionalText` «하나뿐»이다** |
| 이름·부제·키워드 | ❌ 빌드 필요 | 기존 기록 |

## 체크리스트

### 1. 제품 페이지 링크에 추적 태그 — **3앱 × 전 로케일이 전부 무태그다**
현재 상태(2026-09-19 실측):

| 앱 | marketingUrl | supportUrl |
|---|---|---|
| SIGNUM | `https://www.signumhq.com` (3 로케일) | `https://www.signumhq.com` (12 로케일) |
| Undercurrent | `https://www.signumhq.com` (12) | `https://www.signumhq.com` (12) |
| WIM | `https://www.signumhq.com/{en,ja,ko}/wim` (12) | `…/wim/support` (12) |

→ 바꿀 값: 뒤에 **`?from=appstore_site`**(marketing) · **`?from=appstore_support`**(support) 를 붙인다.
   목적지는 같고 추적만 붙는다. 지금은 이 클릭이 전부 무태그로 섞여 `from=home` 에 묻힌다.

### 2. 앱 미리보기 영상(`appPreviewSets`)
- 규격 1080×1920 / 30fps / 15~30초. Remotion 파이프라인이 그 규격을 이미 만든다.
- ⚠️ 애플은 «앱이 실제 동작하는 화면»을 요구한다 — 데이터 모션그래픽은 반려 위험. **앱 화면 캡처**로 만든다.
- 순서: en-US 한 편 올려 통과 확인 → ko/ja 복제.

### 3. 인앱 이벤트를 새로 만들 때
- **`deepLink` 에 `?from=` 을 «생성 시점»에 넣는다.** 승인 후엔 잠긴다(§45).
- 현재 SIGNUM 이벤트가 그래서 무태그다. 다음 이벤트부터 적용.

### 4. 이름·부제·키워드
- 빌드가 있어야 바뀐다. 한국어 ASO 실측(붙여쓰기 한 칸이 순위 12칸)을 반영할 기회다.

---

### ★ 최우선. 2026-09-19 «평점 안전망»이 SIGNUM 한 앱에만 들어갔다 (2026-09-20 코드 실측)

★2026-09-20 정정: 「0/3」은 Play 만 본 숫자였다. 애플은 **SIGNUM US ★5(1)·KR ★5(1), UC KR ★5(1)** 이 이미 있다 →
**iOS 리뷰 요청은 작동한다.** 남은 구멍은 ①Play 3앱 전부 ②**WIM 은 두 스토어 다 0** 이다.
→ 아래 수정의 **1순위는 WIM**(유일하게 어디에도 평점이 없고, 안전망도 없다).

별점 공백은 측정된 1순위 병목이다(노출 2,190 → 등록정보 열람 11 → 설치 7, 그런데 **열면 61% 가 설치**).
9/19 에 기준을 고쳤는데 **세 앱 중 하나에만 적용됐다.**

| 앱 | 9/19 안전망 `maybePromptReview()` | 행동 마일스톤(구) |
|---|---|---|
| SIGNUM | ✅ `src/app/[locale]/app-view/dash/page.tsx:669` 에서 마운트마다 호출 | `signum.reportOpens` [2, 7] |
| **Undercurrent** | ❌ **호출 없음** | `uc.storyOpens` **[5, 14]** |
| **Why'd It Move?** | ❌ **호출 없음** | `wim.setsFinished` [2, 8] |

`maybePromptReview()`(`src/lib/native/capacitorBridge.ts:224`)가 여는 두 갈래 —
**①서로 다른 사용일 2일째·7일째 ②누적 앱 실행 4회째** — 는 «행동 마일스톤에 못 닿는 사용자»를 받는 그물이다.
UC·WIM 에는 그 그물이 없다. 특히 **UC 는 5회째 기사 열람**이라야 뜨는데, 실측 7일 잔존이 1대인 깔때기에서 5회는 멀다.

**고칠 것 (작다 — 승인만 주시면 됩니다)**
1. `src/app/[locale]/undercurrent/page.tsx` · `src/app/[locale]/wim/page.tsx` 에
   `useEffect(() => { maybePromptReview(); }, [])` 를 SIGNUM dash 와 같은 방식으로 추가.
2. UC 마일스톤 `[5, 14]` → `[3, 9]` 로 내린다(WIM `[2, 8]`, SIGNUM `[2, 7]` 과 결이 맞는다).
3. 배포 후 7일 뒤 `node scripts/check-store-ratings.js` 로 별점이 0 에서 움직였는지 본다.

**확인된 것(추측 아님)**: `@capacitor-community/in-app-review@^8.0.0` 은 3앱 package.json 에 모두 있고
2026-07-29(SIGNUM v1.1)·07-20(WIM)·07-08(UC) 에 들어가 **현재 스토어 빌드에 포함**돼 있다.
`android/capacitor.settings.gradle` 에도 등록돼 있다 → 플러그인 부재가 원인은 아니다.
`canRequestReview()` 는 `Capacitor.Plugins.InAppReview.requestReview` 존재로만 판정하므로 네이티브에서 참이다.

⚠️ 안전선상 **앱·웹 코드는 제가 고치지 않습니다** — 대표 승인 후 반영합니다.


---

### 릴리스 노트(`whatsNew`)가 3앱 × 12로케일 전부 «안정성 개선»이다 (2026-09-20 실측)

라이브 버전에서는 **못 고친다(409)** — 그래서 «다음 빌드»에 반드시 같이 한다.
이 자리는 제품 페이지의 「새로운 기능」이자, **기존 사용자의 업데이트 탭에 뜨는 유일한 문장**이다.

현재(SIGNUM 1.9.2 en-US 를 뺀 11개 로케일):
`안정성 개선과 스토어 정보 업데이트입니다.` / `安定性の改善とApp Store情報の更新です。` /
`Stabilitätsverbesserungen und aktualisierte App-Store-Informationen.` … 전부 같은 말이다.

**다음 빌드에서 지킬 규칙**
1. **그 버전에서 실제로 바뀐 것**을 한 줄로 쓴다(거짓 금지 — 안 바뀐 기능을 적지 않는다).
2. 그다음 줄에 §42 «가치 한 줄»을 붙인다(무료·가입 불필요). 내용과 광고를 섞지 않는다.
3. 12로케일 전부 채운다 — 비워 두면 애플이 영어를 그대로 보여 준다.
4. 도구는 이미 있다: `scripts/asc-promo-text.py` 와 같은 모양으로 `appStoreVersionLocalizations` 를 PATCH 하면 된다
   (**편집 가능 상태의 버전에서만** — 라이브는 409).

---

### ★★★ 즉시. 스마트링크가 «봇 프리뷰 HTML»을 사람에게 캐시로 내주고 있다 (2026-09-20 실측·재현)

**이건 다음 빌드가 아니라 «웹 배포 한 줄»이다. 지금 안드로이드 설치를 실제로 깨고 있다.**

**증상(재현됨)**
`src/app/app/route.ts` 의 미리보기-봇 분기가 `cache-control: public, max-age=600` 을 달고 HTML 을 돌려주는데
응답의 `Vary` 에 **`User-Agent` 가 없다**. 그래서 Vercel CDN 이 그 HTML 을 **URL 단위로** 캐시하고,
**링크 미리보기 봇이 한 번 긁은 뒤 10분 동안 «사람»이 같은 URL 을 눌러도 302 대신 그 HTML 을 받는다.**

```
$ curl -A "<안드로이드 크롬 UA>" https://www.signumhq.com/app?from=okky -D -
HTTP/2 200 · age: 97 · cache-control: public, max-age=600 · x-vercel-cache: HIT
vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch   ← User-Agent 없음
```

**왜 치명적인가 — 안드로이드가 애플 스토어로 간다**
그 HTML 의 탈출구는 `<meta http-equiv="refresh" content="0;url=…">` 하나인데 **항상 `APP_STORE_URL`(애플)** 이다.
```
http-equiv="refresh" content="0;url=https://apps.apple.com/app/signum-hq-stock-market-intel/id6783130444"
```
→ 캐시에 걸린 **안드로이드 사용자는 apps.apple.com 으로 보내진다. 설치할 수 없다.**
→ Play install referrer 도 사라지고, `recordHit` 이 봇 분기에서 안 불리므로 **그 클릭은 집계도 안 된다.**

**언제 터지나**: 우리가 링크를 올릴 때마다다. 카카오톡·슬랙·디스코드·블루스카이·X 미리보기 봇이 게시 즉시 긁고,
게시 직후 10분이 바로 사람 클릭이 가장 몰리는 구간이다.
2026-09-20 06:4x 관측: `home` · `bluesky` · `okky` · `naver_blog` 이 동시에 `x-vercel-cache: HIT`(age 95~98s) 였다.
⚠️ 정직하게: 그중 일부는 **내가 이번 점검에서 카카오톡 UA 로 긁어 만든 것**이다. 다만 메커니즘은 동일하고,
실제 게시 때마다 남의 봇이 똑같이 만든다. (그래서 앞으로 라이브 태그를 봇 UA 로 긁지 않는다.)

**고칠 것 (택1, 한 줄)**
1. 봇 분기 헤더를 `'cache-control': 'private, no-store'` 로 — 가장 안전하다. 미리보기 봇은 매번 새로 받으면 된다.
2. 또는 `'vary': 'User-Agent'` 를 같이 보낸다(캐시는 유지하되 UA 별로 분리).
3. 덤으로: `previewHtml` 의 meta refresh 를 **UA 에 따라** Play/App Store 로 나눠 준다(캐시를 고쳐도 남는 안전망).

**같이 고칠 것 — UC·WIM 은 미리보기 카드가 «아예 없다»**
`src/app/app-uc/route.ts` · `src/app/app-wim/route.ts` 에는 `PREVIEW_BOT_RE`/`previewHtml` 분기가 **0개**다.
→ 두 앱 스마트링크를 어디에 공유해도 **카드가 안 뜬다**(봇이 302 를 받고 끝). `/app` 과 같은 분기를 넣는다.

**언어**: `previewLang` 이 한국어를 고르는 조건이 `/_kr$|^x_kr$|_ko$/` 뿐이라
`naver_blog`·`okky`·`naver_kin`·`daum_search`·`tistory` 가 전부 **영문 카드**를 받는다(일본어도 `qiita`·`zenn`·`hatena_bookmark` 누락).
한국어·일본어 카드 이미지와 카피는 **이미 있다**(`/promo/card-app-ko.png` 200). 태그 목록만 추가하면 된다.
**그전까지의 임시 우회(코드 수정 없음)**: 링크에 `&l=ko` / `&l=ja` 를 붙인다 — 실측으로 한국어 카드가 뜬다.


---

### 안드로이드에는 «설치 배너»가 없다 — manifest 두 줄 (2026-09-20 실측)

우리 유입 1위는 자사 웹이다(`from=home` 21일 **407클릭**). iOS 는 이미 스마트 앱 배너가 붙어 있다:
`/ko`·`/ja`·`/en` 모두 `<meta name="apple-itunes-app" content="app-id=6783130444">`.

**안드로이드 대응물이 없다.** 라이브 `manifest.json`(200)의 키 13개에
`related_applications` 도 `prefer_related_applications` 도 **둘 다 없다.**

- 안드로이드 방문자에게 **「Play 앱 설치」 네이티브 프롬프트가 안 뜬다.**
- 크롬이 대신 **PWA 설치**를 권할 수 있다 — PWA 설치는 Play 설치가 아니라 **우리 지표에도, 평점에도 안 잡힌다.**
- 안드로이드가 약한 쪽(Play 별점 0)이라는 증상과 방향이 맞는다.

**고칠 것**(`public/manifest.json`):
```json
"related_applications": [
  { "platform": "play", "id": "com.signumhq.app",
    "url": "https://play.google.com/store/apps/details?id=com.signumhq.app" }
],
"prefer_related_applications": true
```
**선행 조건**: 위 §「스마트링크 봇 HTML 캐시」를 **먼저** 고친다. 안 고치면 배너로 늘어난 안드로이드 유입이
캐시된 프리뷰를 만나 **애플 스토어로 샌다.**

---

### ★ 다음 빌드 ASO — «얇은 문» 실측으로 고른 키워드 (2026-09-20, `scripts/aso-thin-door.js`)

애플 공개 search API(무인증)로 **질의별 «제목에 그 말이 든 앱 수»** 를 셌다. 그게 진짜 경쟁자 수다.
0이면 완전 개방, 7 이상이면 권위로 못 이긴다(네이버에서 확인한 규칙과 같다).

**한국 — 우리가 이미 1등인 문**(이름·부제 덕): 미국장 프리마켓(결과 6) · 실적발표 일정(4) · 미국주식 실적발표(12) · 미국주식 실적.
**한국 — 열려 있는데 우리가 «없는» 문**(전부 우리 앱의 기능이다):

| 질의 | 결과 | 제목일치 | 지금 1위 | 우리 |
|---|---|---|---|---|
| **다크풀** | 24 | **0** | 나이트오브풀문(무관) | 없음 |
| **맥스페인** | 16 | **0** | Netflix | 없음 |
| **애프터마켓** | 38 | **0** | 파트존매니저(무관) | 없음 |
| **시간외 주가** | **1** | 0 | 불안한개미 | 없음 |
| 옵션만기 | 1 | 0 | 채권 계산기 | 없음 |
| 풋콜 | 6 | 0 | 테니스 블랙박스 | 없음 |

**버려야 할 토큰**(실측상 못 이긴다): `코스피`(제목일치 5·국내주식 질의) · `공시`(12·1위 DART) ·
`테슬라`(7·1위 Tesla 공식) · `주식어플`(1위 한투 MTS, 우리 부재).
유지 근거가 있는 것: `장마감`(결과 3·SIGNUM **#2**) · `오늘의증시`(4·#4) · `배당주`(#13) · `엔비디아`(#22).

**SIGNUM ko `keywords` 교체안 — 정확히 100/100자**
```
주식,투자,ai,엔비디아,미장,증시,시황,실적발표일정,기업실적,나스닥,주가,무료,실시간,해외주식,종목분석,배당주,오늘의증시,증시캘린더,장마감,옵션,다크풀,맥스페인,애프터마켓,시간외
```
(현재 97자에서 코스피·공시·테슬라·주식어플을 빼고 다크풀·맥스페인·애프터마켓·시간외를 넣었다.
 애플은 이름·부제·키워드 토큰을 **조합**하므로 이름의 「미국주식·실적·프리마켓」, 부제의 「서학개미·미국증시·옵션」은 중복 투입하지 않았다.)

**미국 — 열린 문**: premarket movers(0) · max pain(0) · gamma exposure(0) · after hours stock(0·SIGNUM #26) ·
short volume(0) · sector heatmap(0). 막힌 곳: options flow(4) · market brief(3) · earnings calendar(2).
**일본 — 열린 문**: プレマーケット(0·SIGNUM #23) · 米国株 決算(0·#8) · オプション フロー(0·#20) ·
ダークプール(0·부재) · 時間外 株価(결과 7·#7) · 株価 アプリ(0·부재). 막힌 곳: 米国株(19) — 여긴 포기한다.

⚠️ 키워드·이름·부제는 **빌드 게이트**다(라이브 409). 다음 빌드 때 이 표를 그대로 적용한다.
⚠️ 재측정: `node scripts/aso-thin-door.js kr|us|jp`. 경쟁 상황은 바뀌므로 **빌드 직전에 다시 잰다.**
