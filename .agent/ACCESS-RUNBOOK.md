# 접근 런북 — 매번 다시 찾지 말 것 (2026-09-02 실측)

> 대표 지적: «왜 매번 한 말 또 하고 초 찾고 왜 그러냐».
> 이 파일은 **자격증명·호출 형태**의 정본이다. 헤매면 여기부터 본다.

## AWS — CLI 는 없다. node SDK 로만 된다

```
which aws → 없음.  `aws lambda ...` 는 이 맥에서 영원히 exit 127 이다.
```
`node_modules/@aws-sdk/client-lambda`, `client-eventbridge`, `client-cloudwatch-logs`,
`client-dynamodb` 로 접근한다. `client-cloudwatch-events` 는 **없다**(구 이름).

```js
require('dotenv').config({ path: '.env.local', quiet: true });
const { LambdaClient, GetFunctionConfigurationCommand } = require('@aws-sdk/client-lambda');
const cfg = { region: 'us-east-1', credentials: {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY } };
```
배포는 `scripts/deploy-*.js` (전부 node). ⚠️ Lambda 배포는 Environment 를 **전체 치환**하므로
반드시 기존 env 를 읽어 머지할 것. 그리고 배포 스크립트가 `signum-flow-harvest-5min` 을
**매번 다시 켜므로** 배포 후 다시 끌 것.

## 키가 어디 사는가

| 키 | 위치 | 비고 |
|---|---|---|
| `AWS_ACCESS_KEY_ID` / `SECRET` | `.env.local` (11줄) | ⚠️ `vercel env pull` 로 덮지 말 것 |
| **`INTRINIO_API_KEY`** | **`.env.local` 에 없다 → Lambda `signum-flow-harvest` 환경변수** (44자) | 위 SDK 로 꺼낸다 |
| `REDIS_PROXY_KEY` | 기본값 `signum-redis-proxy-2026` | Lambda env 에 미설정 |

## EC2 Redis 프록시 — `http://52.23.98.13:8081`

인증은 **`Authorization: Bearer <REDIS_PROXY_KEY>`**. (`x-api-key`·`key_auth` 아님 → Unauthorized)

| 경로 | 메서드 |
|---|---|
| `/get?key=X` · `/mget` | **GET + 쿼리스트링** |
| `/set` · `/setnx` · `/mset` | **POST + JSON 바디** |

```bash
curl -s -H "Authorization: Bearer signum-redis-proxy-2026" \
  "http://52.23.98.13:8081/get?key=flow-harvest:cursor:0"
# → {"result":"240"}
```

## Intrinio — `https://api-v2.intrinio.com/{path}?api_key=`

| 용도 | 상태 |
|---|---|
| `securities/{t}/prices/realtime` | ✅ 200 |
| `securities/{t}/short_interest` | ❌ **403** — 엔드포인트는 있으나 Startup 플랜 권한 없음(Enterprise) |
| `securities/{t}/short_volume` | ❌ **404** — Intrinio 에 아예 없음 |
| `options/chain/{t}/{exp}/realtime` · `options/prices/{code}/realtime` · `options/unusual_activity` | ❌ **403** — 옵션 «실시간» REST 는 전부 권한 없음. `.../eod` 만 쓸 수 있다 |

## ★★ 웹소켓 — 주식은 되고 옵션은 안 된다 (2026-09-02 실측 확정)

### 판정 방법을 틀리지 말 것

- **`/auth` 가 200 을 준다 ≠ 권한이 있다.** 유효한 키면 누구에게나 토큰을 발급한다.
- **JWT 페이로드의 `max_realtime_streams:0` 도 판정 근거가 아니다.**
  주식 토큰도 `max_realtime_streams:0 · exchanges:[]` 인데 **실제로는 붙고 데이터가 온다.**
  (내가 이걸 «권한 0» 으로 읽고 대표에게 두 번 틀린 보고를 했다.)
- **유일하게 믿을 수 있는 판정 = 실제로 핸드셰이크를 해보는 것.**

### 붙는 법 — URL 을 지어내지 말고 SDK 를 그대로 따를 것

`intrinio-realtime` v5.7.0 (npm) 은 **주식 전용**이다. provider 마다 **auth 와 socket 이 같은 호스트**다.

```
auth   : https://equities-edge.intrinio.com/auth?api_key=<KEY>
socket : wss://equities-edge.intrinio.com/socket/websocket
         ?vsn=1.0.0&token=<TOKEN>
         &Client-Information=IntrinioRealtimeNodeSDKv5.7
         &UseNewEquitiesFormat=v2
```
⚠️ `Client-Information` / `UseNewEquitiesFormat` 을 빼면 **업그레이드가 거부되고 빈 HTTP 200** 이 온다.
provider 별 호스트: `realtime-mx`(REALTIME/IEX) · `realtime-delayed-sip` · `realtime-nasdaq-basic` ·
`cboe-one` · `equities-edge`.

| 대상 | 실측 |
|---|---|
| **주식 `equities-edge`** | ✅ **핸드셰이크 성공 · 수신 확인** (장중 실측 45초 3,728건 — 워크로그 L241) |
| **옵션 `realtime-options`** | ❌ **파라미터 3조합 전부 빈 HTTP 200 = 서버가 업그레이드 거부** |

→ 주식은 같은 방식으로 붙는데 옵션만 거부 = **경로 문제가 아니라 우리 플랜에 옵션 실시간이 없다.**
   REST `options/.../realtime` 403 과 일치한다. **Node 용 옵션 SDK 도 npm 에 없다**(C#/Java/Python 만).

계약서에는 「WebSocket 3 연결」이 적혀 있으나 **어느 상품인지는 명시가 없다.**
옵션 실시간이 필요하면 Intrinio 에 **별도 문의/계약**이 필요하다.

### 우리 코드의 현재 상태

| 파일 | 주식 | 옵션 |
|---|---|---|
| `scripts/ec2-price-ws.js` | ✅ L189 `intrinio-realtime` SDK 로 **이관 완료·작동 중** | ❌ L114·L724 **`wss://socket.massive.com/options` 그대로** — 죽은 메시브를 가리킨 채 남아 있다 |

앱이 붙는 곳은 **`wss://ws.signumhq.com`**(우리 EC2 중계)이지 Intrinio 직접이 아니다.
`src/hooks/useWebSocket.ts:25` · `GuardianProvider.tsx:55`.

---

계약: 2,000 calls/min · WebSocket 3 연결(상품 미명시).

## FINRA — 무인증 공개 원본 (`POST https://api.finra.org/data/group/otcMarket/name/{dataset}`)

| 데이터셋 | 내용 | 우리 상태 |
|---|---|---|
| `regShoDaily` | 장외 체결·**공매도 거래량** | ✅ **이미 라이브** (`scripts/finra-offexchange.js`, EC2 크론 02·12 UTC) |
| `consolidatedShortInterest` | **공매도 잔고**(거래소 상장) — `currentShortPositionQuantity` `daysToCoverQuantity` `changePercent` `settlementDate` | ⬜ **미연결** ← `live/short-squeeze` 의 null 을 채울 수 있다 |
| `equityShortInterest` | 공매도 잔고(**OTC 종목만**) | 해당 없음 |

⚠️ `limit` 상한 5,000(페이징 필수). `sortFields` 는 파티션키(`settlementDate`)를 EQUAL 로 지정해야 허용된다.

## 릴리스·스토어

`npm run audit:release` 가 스토어에 직접 물어본다. 「했다」고 쓰기 전에 반드시 통과시킬 것.
