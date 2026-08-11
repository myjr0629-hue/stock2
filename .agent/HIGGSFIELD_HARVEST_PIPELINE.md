# 힉스필드 배경 수확 파이프라인 (정본)

**작성 2026-08-11 · 실측으로 확정.** 추측 금지 — 여기 적힌 값은 전부 실제 응답에서 나왔다.

---

## 0. 결론 한 줄

**무제한 생성은 웹 세션의 JWT 로 API 를 직접 때리면 된다.** UI 를 클릭할 필요가 없다.

---

## 1. 확정된 사실

| 항목 | 값 | 근거 |
|---|---|---|
| Seedance 2.5 무제한 | **33일 · 2026-08-07 → 09-09** | 구독 화면의 Unlimited models 표 (정정: 요금제 표의 PLUS 기본값 14일이 아니다) |
| 구독 | Plus Plan ($59/월, 1,200 크레딧) | 구독 화면 |
| 동시 생성 | **1개** | 429 응답의 `concurrent_jobs_limit:1` |
| 무제한 길이 | **5초 고정** | 무제한 ON 시 duration 드롭다운에 5s 만 존재 |
| 해상도/비율 | 720p / 9:16 | UI 기본값, 그대로 사용 |
| 1편 소요 | **약 8~10분** (대기열 포함) | created_at ↔ completed 실측 |
| 비용 | `cost: null` | 생성 응답 |
| MCP | **불가** — 무제한은 higgsfield.ai 웹에서만 | 가격 페이지 명시 + MCP `use_unlim` 거부 |

> ⚠️ 브라우저 패널의 **마우스 클릭 주입이 이 세션에서 전부 타임아웃**했다.
> `javascript_tool` 은 정상 동작하므로 **JS 로 구동**한다. 이것이 유일하게 작동한 경로다.

---

## 2. API

### 생성
```
POST https://fnf-api-gw.higgsfield.ai/fnf/jobs/v2/seedance_2_5
headers: accept-language: en
         authorization: Bearer <JWT>          ← window.Clerk.session.getToken()
         content-type: application/json
```
```json
{"params":{"prompt":"...","width":720,"height":1280,"medias":[],
 "resolution":"720p","generate_audio":true,"bitrate_mode":"high",
 "batch_size":1,"model":"default","use_unlim":true,"duration":5,
 "aspect_ratio":"9:16"},"use_unlim":true}
```

**JWT 는 60초 만료다** (`exp - iat = 60`). 요청마다 `getToken()` 으로 새로 받는다.

### 조회
```
GET https://fnf-api-gw.higgsfield.ai/fnf/jobs?limit=5
```
- `limit` 은 **5가 상한**이다(100을 넣어도 5개). `has_more:true` 로 더 있음을 알린다.
- `offset`·`page`·`skip` 은 **먹지 않는다** (전부 같은 첫 페이지를 준다).
- → **주기 폴링으로 누적**한다. 1편당 8~10분이라 45초 폴링이면 절대 놓치지 않는다.
- 완료본: `results.raw.url` (CloudFront, **인증 없이 curl 가능**)

### 한도 초과
```
429 {"detail":{"error_type":"rate_limit_reached","plan_type":"plus",
     "concurrent_jobs_limit":1,"use_unlim":false,...}}
```
→ 진행 중 job 이 0이 될 때까지 기다렸다 넣는다. 무작정 재시도하면 429 만 쌓인다.

---

## 3. 브라우저에 심는 3개 (페이지를 떠나면 사라진다)

`https://higgsfield.ai/flow/video/prompt?model=seedance_2_5` 에서 실행.
**이 탭을 내비게이션하면 전부 죽는다.** 상태 확인은 JS 호출로만 한다.

1. `window.__H` — 투입기. `queue[]` 에서 하나씩 꺼내 `active()<limit` 일 때만 POST.
   `cost` 가 null 이 아니면 **즉시 정지**(과금 가드).
2. `window.__M` — 수집기. 45초마다 `jobs?limit=5` 를 읽어 완료본을 `map` 에 누적.
   `window.__M.dump()` 가 매니페스트 배열.
3. 프롬프트 큐 — `.agent/HARVEST_PROMPTS_2026-08-11.json` (102편).

우선순위 순서: **엔드카드 플레이트 → 훅 → 애니 → 판타지 → 로고 플레이트 → 스팅어 → 다큐**.
(다큐를 맨 뒤로 미룬 이유는 §5.)

---

## 4. 내려받기

```bash
node scripts/hf-sync.mjs <manifest.json>
```
- 프롬프트 앞 44자로 `HARVEST_PROMPTS_*.json` 과 대조해 **카테고리·번호·슬러그**를 붙인다
- **`-g 15` 로 재인코딩한다** — 시덴스 원본은 GOP 가 길어 `OffthreadVideo` 프레임 탐색이
  멈춘다(2026-08-10 T2 렌더 862프레임 타임아웃의 원인)
- 오디오는 버린다(`-an`) — 우리 VO/음악을 쓴다
- 산출: `public/shorts/bg/<cat>/<slug>.mp4` + `src/remotion/kit/bglib.json`

**용량**: 최종본 편당 ~1.5MB → 100편 ≈ **152MB**. 원본(.raw)은 편당 ~4MB.
`.gitignore` 로 **둘 다 추적 제외**해 뒀다 — git/LFS/S3 중 무엇에 둘지는 대표 결정 사항.
렌더는 로컬에서 도므로 커밋 없이도 파이프라인은 돈다.

---

## 5. 왜 다큐를 뒤로 미뤘나

대표 지시(2026-08-11):

> "보기 전부터 뉴스나 다큐 같은 느낌만 있는 것은 안 좋다"
> "잘 만들어도 안 보면 아무런 소용이 없다"

그래서 **다큐 실사는 «기본»이 아니라 «증거 구간 전용»**이다.
`kit/backdrops.ts` 의 `ALLOW` 가 이걸 강제한다 — **훅 역할은 `hook`·`anime`·`fantasy`
에서만 고른다. `sector`(다큐)는 훅에 절대 오지 않는다.**

---

## 6. 다음에 이어서 할 때

1. 위 탭에서 `window.__H`/`window.__M` 이 살아 있는지 확인 (`__H.running`)
2. 죽었으면 §3 대로 다시 심고, `HARVEST_PROMPTS` 에서 **이미 받은 것 빼고** 큐에 넣는다
   (받은 목록 = `public/shorts/bg/index.json`)
3. 주기적으로 `__M.dump()` → 파일로 저장 → `hf-sync.mjs` 실행


---

## 7. ⛔ 소재 규칙 — 2026-08-11 대표 지적으로 확정

> "별로인 영상들만 만들어내는 것 같은데 **금융 테크 하이테크 종목들** 그리고
>  여러 가지 **세련된 흥미로운** 영상들로 만들어야지"

**내가 틀렸던 것**: 도미노·비눗방울·민들레·양털·깃털 같은 «범용 추상 B롤»을 대량으로
발주했다. 보기엔 예쁘지만 **우리 주제와 아무 상관이 없다** — 어떤 종목·어떤 섹터에도
붙지 않으니 배경으로서 정보를 하나도 전달하지 못한다. 64편을 큐에서 폐기했다.

### 규칙: 소재는 «주제», 스타일은 «흥미»

```
소재(WHAT)  = 금융 · 테크 · 하이테크 산업에서만 고른다
스타일(HOW) = 흥미는 여기서 만든다 (시네마틱 하이퍼리얼 · 애니 · 틸트시프트
              미니어처 · Pixar 3D · 클레이 · 뫼비우스 선화 · 90s OVA · 믹스드미디어)
```

**소재 화이트리스트** — 반도체(EUV·웨이퍼·클린룸·다이 매크로) · AI 데이터센터(GPU 랙·
액침냉각·광섬유) · 로보틱스 · 전기차/자율주행(배터리팩·라이다) · 우주(정지연소·위성) ·
양자(희석냉동기·초전도) · 네트워크(해저케이블·안테나) · 금융(거래소 파사드·금괴·금고·
트레이딩 플로어) · 첨단소재(주조·탄소섬유)

**금지** — 종목·섹터·레짐 어디에도 매핑되지 않는 범용 추상물.
`bglib.json` 의 `topics` 가 비면 배경 매칭이 안 되므로, **topics 가 비는 프롬프트는 쓰지 않는다.**
예외는 «빈 무대»뿐 — 엔드카드 플레이트와 로고 플레이트는 의도적으로 비어 있어야 한다.
