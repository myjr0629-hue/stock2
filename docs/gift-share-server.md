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

- `couponHtml`: 기존 `/app`과 새 `giftLanding` 두 운영 호출자. `gift` 옵션이 없으면 출력이 동일하다. 기존 쿠폰·선물·구독 시험과 기존 HEAD 응답 대조로 회귀를 검사한다.
- `desktopRedeemHtml`: 같은 두 운영 호출자. 새 옵션이 없으면 기존 QR·문구·iPad 이동이 동일하다. 선물 QR은 코드 대신 토큰을 보존하며 iPad의 동일 URL 반복 이동을 만들지 않는다.
- `inviteAppHref`: `landingCta`에서 호출한다. 새 선택 인자가 없으면 기존 주소와 동일하다.
- `landingCta`: 공유 카드 페이지에서 호출한다. 서버가 플래그를 확인한 토큰만 추가하고 기존 라벨은 유지한다.
- `ShareLanding`: SIGNUM 종목·랭킹 두 페이지. 서버가 전달한 토큰만 기존 설치 버튼에 추가한다. UC·WIM 주소에는 붙이지 않는다.
- 종목·랭킹 하단의 SIGNUM 설치 CTA에도 토큰을 전달한다. 앱 공유 훅·공유 본문·버튼은 수정하지 않았다.

## 검증 경계

`tests/giftShare.test.ts`는 외부 접근을 차단하고 경로·폴백·응답 복구·표시·플래그 꺼짐을 검증한다. 저장소 응답을 주입하는 시험이므로 Lua 원자성 자체를 증명하지 않는다.

`tests/giftShareLua.test.mjs /로컬/redis-server`는 임시 Unix 소켓 Redis만 실행한다. 외부 주소는 받지 않고 파일 저장·AOF·TCP 포트를 끈다. 동시 20건 단일 배정, OS별 20+20 상한, 멱등 복구, 소진·만료, 수신자·계정 중복, 발행 한도, 재고 중복을 실제 Lua로 검증하도록 작성했다. 로컬 Redis 실행 파일이 없는 환경에서는 미검증으로 보고한다.

쿠키 삭제·기기 열쇠 위조를 완전히 방지하는 앱 무결성 증명은 없다. 서버 전체 상한으로 배분을 제한한다. 실제 코드 자격·스토어 등록 완료·메신저 내 이동·화면 픽셀 비교는 이번 접근 금지 범위이며 운영 세션 확인이 필요하다.

## 바꾼 파일

- 서버 공통: `src/lib/giftShare/config.ts`, `atomic.cjs`, `server.ts`, `http.ts`, `landing.ts`
- API: `src/app/api/gift/issue/route.ts`, `src/app/api/gift/claim/route.ts`
- 적재: `scripts/gift-load-codes.mjs`
- 랜딩·템플릿: `src/app/app/route.ts`, `src/lib/marketing/couponHtml.ts`, `src/lib/marketing/desktopHandoff.ts`
- 링크 전달: `src/lib/invite/kinds.ts`, `src/lib/invite/landing.ts`, `src/components/share/ShareLanding.tsx`, `src/app/[locale]/s/[kind]/[ticker]/page.tsx`, `src/app/[locale]/flow/[ticker]/page.tsx`, `src/app/[locale]/rankings/[id]/page.tsx`
- 시험·인계: `tests/giftShare.test.ts`, `tests/giftShareLua.test.mjs`, `docs/gift-share-server.md`

## 이번 실행의 확인 결과

- 전체 `tsc --noEmit --incremental false --pretty false`: 종료 0, 진단 0건. 공용 잠금 아래 1회 실행했다. 최종 선물 모듈 범위 타입 검사도 종료 0, 진단 0건이다.
- 새 선물 경로: 10개 통과. 꺼짐 상태에서 기존 HEAD의 `/app` 상태·헤더·본문 대조, GET·HEAD·OG·PC QR의 재고 호출 0회, 기존 CSS·라벨, 코드 없는 발행, 저장소 응답 재시도·폴백·거부를 검증했다. 저장소 응답 주입 시험이다.
- 기존 통과: `inviteLanding` 41, `coupon` 32, `gift` 22, `couponSubscribe` 24, `desktopHandoff` 5, `androidInApp` 15, `couponIosInApp` 14개.
- 기존 `invite`는 `tests/invite.test.ts:969`의 관심종목 공유 단추 위치 정규식에서 실패했다. 해당 관심종목 파일은 기존 HEAD와 바이트 단위로 동일하며 같은 정규식이 HEAD와 현재 양쪽 모두 실패한다. 정규식이 공유 버튼 뒤 문단까지를 200자로 제한하지만 기존 주석·래퍼가 그 범위를 넘는다. 이번 작업은 해당 화면·시험을 수정하지 않았다. 이 실패 이후의 `invite` 시험은 실행되지 않았다.
- 최종 적재 도구: OS별 정상 드라이런·대상 미지정 적용 거부·중복 거부·만료 거부 총 8개 통과. 합성 데이터만 임시 디렉터리에 만들고 삭제했다. 외부 접속·실제 적재는 없었다.
- 스크립트 구문 검사와 `git diff --check` 통과.
- 실제 Lua 동시 20건·원자 배분·상한 검증은 미실행이다. 로컬 Redis 실행 파일을 찾지 못했고 다운로드도 DNS 오류로 실패했다. 이 항목을 응답 주입 시험의 통과로 대체하지 않는다.
- 브라우저·스토어 콘솔·운영 Redis·모델 호출·배포·push·커밋은 수행하지 않았다. `.env*` 파일은 읽지 않았다. 실기 스토어 이동·상품 자격·재고 분리·호스팅 로그 마스킹은 미확인이다.
