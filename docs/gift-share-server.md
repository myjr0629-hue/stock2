# 선물 서버·웹 랜딩 인계

범위는 승인 설계 ⑦의 서버·웹 랜딩이다. 앱 공유 문구와 발행 API 연결은 다음 작업이며, 이번 변경으로 기존 공유가 새 토큰을 발행하지 않는다. 운영 쓰기·커밋·배포는 수행하지 않았다.

## 원인과 분리 방식

기존 선물은 공용 Apple 맞춤 코드 링크이고, 기존 Play 쿠폰은 IP별 재사용이다. 수신자가 다른 OS를 쓰거나 링크가 단체방에 전달되면 토큰 하나를 한 수신자에게 고정할 수 없다. 새 기능은 기존 경로를 유지하고 `promo:gift:v1:*`(운영), `promo:pv:gift:v1:*`(시험)으로 분리한다. 기존 쿠폰·추천 재고를 배분에 사용하지 않는다. 기존 Upstash 패키지와 연결 변수·타임아웃 방식을 사용한다.

## 설정·API

- `GIFT_SHARE_ENABLED=1`일 때만 동작한다. 기본 꺼짐이다.
- `GIFT_SHARE_DAILY_CAP_IOS`, `GIFT_SHARE_DAILY_CAP_ANDROID`: 각각 기본 20, 0~200. 0이면 신규 배정을 중단하되 유효한 기존 배정은 복구한다.
- `GIFT_SHARE_SECRET`: 선택적인 HMAC 전용 비밀값. 없으면 기존 Upstash 인증값을 사용한다. 값은 출력하지 않는다. 수신자 쿠키·한도 식별을 유지하려면 운영 중 변경하지 않는다.
- Redis 연결은 기존 `UPSTASH_REDIS_REST_URL/TOKEN` 또는 `KV_REST_API_URL/TOKEN`을 사용한다. `.env*` 파일을 열거나 적재하지 않는다.
- `POST /api/gift/issue`: 같은 출처의 사람 요청만 처리한다. 앱은 영속적인 비공개 기기 열쇠를 `x-gift-device` 헤더로 전달한다(32~128자 영문·숫자·`_`·`-`). Supabase 쿠키나 Bearer 인증이 있으면 서버 검증 계정도 하루 3회 제한에 포함한다. 본문의 계정 ID는 받지 않는다. 익명 웹은 서버 서명 쿠키 기준 하루 1회, IP별 하루 10회·전체 하루 400회 발행 제한을 병행한다. 성공 응답은 `ok`, 불투명 토큰, 만료 시각뿐이다. 코드를 반환하지 않는다.
- 토큰은 7일 유효하다. 발행·조회에 재고를 예약하거나 소비하지 않는다. 따라서 발행 성공이 추후 재고 확보를 보장하지 않는다.
- `GET/HEAD /app?gift=…`: Redis 호출 없이 기존 쿠폰·QR 템플릿을 사용한다. 기존 제목·라벨·버튼 문구·CSS를 재사용하고 번호 영역은 기존 마스크를 사용한다. 기존 공용 코드의 ‘500명/200명·10/30’은 새 묶음의 사실이 아니므로 선물 분기는 기존 ‘친구가 보낸 선물’ 문구만 같은 부제 영역에 표시한다. 신규 라벨은 없다.
- 등록 버튼은 같은 출처 폼 `POST /api/gift/claim`이다. 서버가 서명한 수신자 쿠키가 있어야 한다. 재고 선택·OS/수신자 고정·상한·캠페인 중복·차감·장부를 한 Lua 실행으로 처리한다. 수신자·계정·OS가 같은 재시도는 같은 코드를 복구한다. 유효 기간이 지난 코드도 풀에 되돌리지 않는다.
- 선물 응답은 `Referrer-Policy: same-origin`을 사용한다. 기존 `no-referrer`는 폼 POST의 Origin을 `null`로 만들어 출처 검사에서 막혔다. 같은 출처의 Origin은 유지하고, 외부 스토어로는 Referer를 보내지 않는다. `null`·누락·다른 출처 및 교차 출처 Fetch Metadata는 계속 거부한다.
- Android 선물 폼은 즉시 Play로 이동하므로, 기존 ‘② 구독’과 앱 설정 경로 안내를 등록 전부터 보이게 한다. 기존 번역·CSS를 그대로 재사용하며 스크립트가 없어도 읽을 수 있다.
- 맥 UA를 쓰는 iPad는 QR 화면의 기존 터치 감지로 같은 토큰·언어의 `/app`에 `gift_os=ios`를 붙여 이동한다. 맥 UA와 해당 힌트가 함께 있을 때만 iOS로 보며, 폼 POST에도 힌트를 유지한다. 일반 PC·터치 Windows는 QR을 유지하고 조회·자동 이동은 재고를 소비하지 않는다.
- PC에서 초대자 `ref`가 붙은 선물 링크를 열면 QR 주소와 iPad 이동 주소에 검증된 `ref`(`normalizeGiftRef`)와 `from`을 그대로 싣는다. 폰으로 스캔해 연 요청이 기존 추천 터치를 남겨 첫 실행 보상이 같은 초대자에게 적립된다(4차 관문 지적 수리). `ref`가 없거나 형식이 틀리면 싣지 않는다. 맥 UA iPad 가 `gift_os=ios` 로 이동한 요청은 추천 터치도 `giftOs` 판정(iOS)을 써서 iOS 첫 실행이 적립된다(5차 관문 지적 수리). 힌트 없는 맥 UA(일반 PC)는 계속 무귀속.
- 수신자는 기기·검증 계정 각각 이 캠페인에서 최대 1장이다(400일 중복 표지). 계정 없이 받은 뒤 다른 기기로 로그인하는 경우까지 정확히 합칠 수는 없다.
- 성공은 Apple/Play의 기존 등록 주소로 303, 소진·만료·상한·장애·불명 OS·잘못된 요청은 코드 없는 일반 설치 주소로 이동한다. PC는 토큰 QR만 표시한다.
- 장부는 토큰 해시를 키로 `at`, `os`, `tokenHash`, `last4`만 기록한다. 원문 코드는 전용 재고와 복구용 토큰 상태에만 보관한다. 애플리케이션 오류·로그에 토큰·코드를 출력하지 않는다. 호스팅 접근 로그의 쿼리와 303 `Location` 마스킹은 운영 설정에서 별도로 확인해야 한다.

## 재고 적재 도구

운영자가 다른 배포·초대자 보상과 겹치지 않는 전용 묶음을 먼저 분리해야 한다. 공개 저장소 밖에 줄당 코드 1개인 파일과 메타데이터 JSON을 둔다. 모든 Git 저장소 안의 입력 및 `.env*` 입력은 거부한다. 이 작업에서는 실제 재고를 읽거나 적재하지 않았다.

```sh
node scripts/gift-load-codes.mjs --os ios --file /비공개/코드목록.txt --metadata /비공개/묶음.json
```

기본은 로컬 드라이런이며 Redis 클라이언트도 만들지 않는다. 실제 적재는 운영 세션이 같은 인자에 `--apply --target production` 또는 `--apply --target preview`를 명시했을 때만 한다. 최대 1,000장씩 적재하며 결과에는 OS와 개수만 출력한다.

메타데이터 필드: `batch`(영소문자·숫자·밑줄·하이픈), `app="signum"`, `os`, `campaign="gift-v1"`, `exclusive=true`, `product`, `offer`, `regions`(국가 코드 배열), `eligibility`, `freePeriod`(iOS `P1M`, Android `P30D`), `autoRenew=true`, `expiresAt`(시간대가 포함된 ISO 시각). 기존 화면의 무료 기간·자동 갱신·가격·자격 고지와 실제 상품이 맞는 재고만 넣어야 한다. 무료 기간이나 갱신 방식이 다른 상품은 이 화면에 넣지 않는다.

묶음 중복·파일 내 중복·전용 재고에 이미 적재된 코드·기존 Play/초대자 미배정 풀·기존 Play 배정 장부와의 중복은 원자적으로 거부한다. 이미 게시한 코드나 기존 iOS 지급 이력 전체를 자동 검증하는 도구는 아니다. `exclusive=true`는 운영자의 전용 재고 분리 확인이다. 묶음은 OS별 정렬 목록으로 관리하고 만료가 빠른 유효 묶음부터 꺼낸다. 전역 `PLAY_PROMO_END`는 바꾸지 않았다.

## 공유 함수 호출자 영향

- `giftHeaders`·`giftOs`: `giftLanding`·`/app`의 선물 실패 폴백·선물 발행 API·선물 등록 API에서 사용한다. 선물 응답 정책과 맥 UA의 iPad 힌트 처리에만 영향이 있다. 기존 `/app` 분기는 플래그 꺼짐 회귀로, 발행·등록 API는 성공·거부·폴백 시험으로 확인했다. `validGiftPost`의 출처 검사 자체는 바꾸지 않았다.
- `couponHtml`: 기존 `/app`과 새 `giftLanding` 두 운영 호출자. 선물 옵션에서만 iOS 폼에 iPad 힌트를 유지하고 Android 기존 안내를 노출한다. `gift` 옵션이 없으면 출력이 동일하다. 기존 쿠폰·선물·구독 시험과 `origin/main` 템플릿 대조로 확인했다.
- `desktopRedeemHtml`: 같은 두 운영 호출자. 새 옵션이 없으면 기존 QR·문구·iPad 이동이 동일하다. 선물 QR은 코드 대신 토큰을 보존하며 iPad는 같은 토큰의 iOS 폼으로 이동한다. 터치 감지 스크립트 모의 실행과 후속 GET·POST로 반복 이동·조회 배정이 없음을 확인했다.
- `inviteAppHref`: `landingCta`에서 호출한다. 새 선택 인자가 없으면 기존 주소와 동일하다.
- `landingCta`: 공유 카드 페이지에서 호출한다. 서버가 플래그를 확인한 토큰만 추가하고 기존 라벨은 유지한다.
- `ShareLanding`: SIGNUM 종목·랭킹 두 페이지. 서버가 전달한 토큰만 기존 설치 버튼에 추가한다. UC·WIM 주소에는 붙이지 않는다.
- 종목·랭킹 하단의 SIGNUM 설치 CTA에도 토큰을 전달한다. 앱 공유 훅·공유 본문·버튼은 수정하지 않았다.

## 검증 경계

`tests/giftShare.test.ts`는 외부 접근을 차단하고 경로·폴백·응답 복구·표시·플래그 꺼짐을 검증한다. 저장소 응답을 주입하는 시험이므로 Lua 원자성 자체를 증명하지 않는다.

`node --test tests/giftShareLua.test.mjs`(또는 `npx tsx --test …`) 한 줄로 실행한다. 같은 8개 시나리오(동시 20건 단일 배정, OS별 20+20 상한, 멱등 복구, 소진·만료, 수신자·계정 중복, 발행 한도, 재고 중복)를 ① 로컬 redis-server(PATH·`REDIS_SERVER_BIN`)가 있으면 임시 Unix 소켓 Redis에서 실제 Lua로, 없으면 이유를 출력하고 건너뛴다(skip). ② 항상 `tests/_giftLuaMock.mjs`의 순수 JS 모의에서 돌린다 — Lua 원문을 해석기로 그대로 실행하고 EVAL 단위로 직렬 실행해 원자성을 검증한다. ③ 대조군: `redis.call` 사이 끼어들기를 허용(비원자)하면 동시성 시나리오 4개가 실패함을 확인해 시험이 원자성 결함을 실제로 잡는다는 것을 보인다. 외부 주소·운영 접속은 없다.

쿠키 삭제·기기 열쇠 위조를 완전히 방지하는 앱 무결성 증명은 없다. 서버 전체 상한으로 배분을 제한한다. 실제 코드 자격·스토어 등록 완료·메신저 내 이동·화면 픽셀 비교는 이번 접근 금지 범위이며 운영 세션 확인이 필요하다.

## 최초 구현 파일

- 서버 공통: `src/lib/giftShare/config.ts`, `atomic.cjs`, `server.ts`, `http.ts`, `landing.ts`
- API: `src/app/api/gift/issue/route.ts`, `src/app/api/gift/claim/route.ts`
- 적재: `scripts/gift-load-codes.mjs`
- 랜딩·템플릿: `src/app/app/route.ts`, `src/lib/marketing/couponHtml.ts`, `src/lib/marketing/desktopHandoff.ts`
- 링크 전달: `src/lib/invite/kinds.ts`, `src/lib/invite/landing.ts`, `src/components/share/ShareLanding.tsx`, `src/app/[locale]/s/[kind]/[ticker]/page.tsx`, `src/app/[locale]/flow/[ticker]/page.tsx`, `src/app/[locale]/rankings/[id]/page.tsx`
- 시험·인계: `tests/giftShare.test.ts`, `tests/giftShareLua.test.mjs`, `docs/gift-share-server.md`

## 이번 실행의 확인 결과

- 이번 보완 파일은 `src/lib/giftShare/http.ts`, `src/lib/marketing/couponHtml.ts`, `src/lib/marketing/desktopHandoff.ts`, `tests/giftShare.test.ts`, `tests/invite.test.ts`, 이 문서다. 화면 라벨·번역·CSS는 수정하지 않았다.
- 전체 `tsc --noEmit --incremental false --pretty false`: 종료 0, 진단 0건. `/usr/bin/lockf -k /tmp/signum-heavy.lock` 아래 1회 실행했다.
- 선물 경로 14개 통과. 세 관문 결함 각각의 회귀 시험을 추가했다. 랜딩의 정책·실제 폼·서명 쿠키로 만든 모의 POST가 iOS·Android 등록 주소로 303 이동하고, Android 세 언어 안내는 숨김 조상 밖에 있으며, 맥 UA의 iPad는 터치 감지 → 쿠폰 GET → 등록 POST로 이어진다. 실제 브라우저 시험은 아니다.
- 플래그 꺼짐은 `origin/main`의 라우트와 의존 쿠폰·QR 템플릿을 별도로 읽어 비교한다. 3개 언어·4개 UA·기존 코드/선물 출처·토큰 유무·GET/HEAD 144조합에서 상태·헤더·본문이 같았다. 기존 쿠폰·QR 템플릿 48조합도 바이트 단위로 같았다. 이전 HEAD 자체 비교를 없앴다.
- 관련 기존 시험 12묶음·359개 모두 통과: `invite` 104, `inviteLanding` 41, `coupon` 32, `gift` 22, `couponSubscribe` 24, `desktopHandoff` 5, `androidInApp` 15, `couponIosInApp` 14, `giftAnnounce` 15, `smartLink` 21, `redeemLinkPreview` 41, `smartBanner` 25. 공용 잠금 아래 순차 실행했고 외부 fetch·HTTP·TCP 연결을 차단했다.
- 이전 `invite` 실패는 기존 주석·래퍼에 비해 정규식의 200자 제한이 짧아서 생긴 오판이었다. 화면을 바꾸지 않고 TypeScript JSX 구문 트리로 공유 단추와 글 묶음의 형제 관계를 검사하도록 고쳤다. 긴 주석은 허용하고, 중첩 단추·해당 공유 단추 누락은 계속 실패하는 것도 확인했다.
- 적재 도구의 OS별 정상 드라이런·대상 누락 적용 거부·중복 거부·만료 거부 총 8개도 통과했다. 비공개 임시 디렉터리의 합성 자료만 사용하고 삭제했으며, 외부 네트워크를 차단했다. 적재 스크립트·Lua 시험 파일 구문 검사와 `git diff --check`도 통과했다.
- 실제 Redis 실행 파일이 없는 환경에서는 실제 Redis 묶음이 skip 되고, 원자성·상한·멱등은 Lua 원문 해석 모의(직렬 EVAL)와 비원자 대조군으로 검증한다. 운영 반영 전 redis-server 가 있는 환경에서 한 번 더 돌리면 실제 Lua 런타임까지 확인된다.
- 브라우저·스토어 콘솔·운영 Redis·모델 호출·배포·push·커밋은 수행하지 않았다. `.env*` 파일은 읽지 않았다. 실기 스토어 이동·상품 자격·재고 분리·호스팅 로그 마스킹은 미확인이다.
