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
| **`https://realtime-options.intrinio.com/auth?api_key=`** | ✅ **200 + JWT — 옵션 웹소켓 쓸 수 있다(현재 미사용)** |
| `https://realtime-mx.intrinio.com/auth?api_key=` | ✅ 200 + JWT (주식 웹소켓) |

계약: 2,000 calls/min · **WebSocket 3 연결**.

## FINRA — 무인증 공개 원본 (`POST https://api.finra.org/data/group/otcMarket/name/{dataset}`)

| 데이터셋 | 내용 | 우리 상태 |
|---|---|---|
| `regShoDaily` | 장외 체결·**공매도 거래량** | ✅ **이미 라이브** (`scripts/finra-offexchange.js`, EC2 크론 02·12 UTC) |
| `consolidatedShortInterest` | **공매도 잔고**(거래소 상장) — `currentShortPositionQuantity` `daysToCoverQuantity` `changePercent` `settlementDate` | ⬜ **미연결** ← `live/short-squeeze` 의 null 을 채울 수 있다 |
| `equityShortInterest` | 공매도 잔고(**OTC 종목만**) | 해당 없음 |

⚠️ `limit` 상한 5,000(페이징 필수). `sortFields` 는 파티션키(`settlementDate`)를 EQUAL 로 지정해야 허용된다.

## 릴리스·스토어

`npm run audit:release` 가 스토어에 직접 물어본다. 「했다」고 쓰기 전에 반드시 통과시킬 것.
