# 대가 렌즈 PRO 순위 API 수리 — 2026-10-21

## 결과 요약

- 기준 커밋: `df149853d0574ee5209ea8e02cd23eb0710f1bd5`, 작업 브랜치: `fix/guru-lens-pro-gate`.
- 운영 근거는 코디네이터 제공 실측이다. 10/21 09:5x 익명 `lens=moat_compounder&badges=0` 요청에서 10개 티커가 공개 캐시로 노출됐다. 이 작업에서는 운영에 접속하지 않았다.
- 확인한 원인: 화면의 `FREE_ROWS=3`과 `GuruLensProOnly`만 유료 구간을 막았다. API는 권한 확인 없이 전체 행과 배지를 조립해 공개 캐시했다.
- 수정: 익명·비PRO·검증 실패 순위 응답의 처음 3개만 실제 행이다. 이후 행은 정확히 `{rank: 순번, locked: true}` 두 필드만 가진다. 유료 행 배지도 조회하지 않는다. 통과 0의 근접 목록에도 같은 경계를 적용한다.
- 확인: 합성 데이터에서 유료 행 실제 값 0, PRO 응답 본문 바이트 동일, 수정 전후 카드 마크업 240쌍 동일, 전체 타입 오류 0. 화면 문구·라벨·CSS·배치를 바꾸지 않았다.

### 기존 권한 경로 조사와 재사용

현재 기준 브랜치에는 서버 RevenueCat 검증기가 없었다. 로컬 `feat/watchlist-alerts`의 `src/app/api/app/watchlist/alerts/route.ts` → `src/lib/alerts/api.ts` → `src/lib/alerts/revenuecat.ts`에 기존 서버 검증 경로가 있었다. 마지막 모듈을 같은 경로로 그대로 가져왔다. 원본과 복사본의 SHA-256은 같다. 다른 브랜치 병합이나 알림 API·저장소 도입은 하지 않았다.

기존 검증기는 서버 설정 `REVENUECAT_SECRET_API_KEY`로 RevenueCat 구독자의 `pro` 권한·만료·유예기간을 확인한다. 활성은 최대 5분, 비활성은 30초 동안 인스턴스 메모리에 캐시한다. 클라이언트의 PRO 주장이나 `sgpro` 프리뷰 플래그는 서버 권한으로 쓰지 않는다.

앱 식별은 기존 `watchlistAlerts.rcAppUserId()` → `initRevenueCat()` → `Purchases.getAppUserID()`를 재사용한다. 기존 알림 API와 같은 익명·사용자 지정 ID 정규식으로 검증한다. 새 로그인·토큰 발급·쿠키 인증을 만들지 않았다. 조사한 현재 앱은 로그인 없이 RevenueCat 익명 ID를 사용한다. Supabase 쿠키는 운영자 인증 등에 쓰이며, 이 앱의 PRO 결제 권한과 연결된 기존 경로는 찾지 못했다.

PRO 순위 요청은 `/api/guru-lens?access=pro`와 `x-rc-app-user-id` 헤더를 함께 쓴다. ID는 URL에 넣지 않는다. `access=pro`만 있거나 헤더만 있으면 무료 범위다. 헤더만 있는 공개 URL에서는 PRO 본문을 생성하지 않는다.

| 요청 | 실제 행 범위 | 캐시 |
| --- | --- | --- |
| 익명 순위, 기본 배지 | 렌즈별 처음 3개 | `public, s-maxage=60` |
| 익명 순위, `badges=0` | 렌즈별 처음 3개 | `public, s-maxage=600, stale-while-revalidate=3600` |
| `access` 또는 식별 헤더가 있는 요청 | 검증된 PRO만 전체, 나머지는 처음 3개 | `private, no-store` |
| 위 권한 요청의 400·503 | 실제 행 없음 | `private, no-store` |

응답에는 `Vary: x-rc-app-user-id`도 설정한다. 클라이언트의 권한 요청은 `cache: no-store`로 보낸다. 별도 권한 URL 덕분에 PRO 클라이언트가 익명 URL의 공개 캐시에 적중하지 않는다.

### 종목 상세와 모든 호출자 영향

`ticker=`는 기존 무료 칩·이유 기능이다. Top 10 밖 종목도 해당 종목의 전체 렌즈 판정·이유를 유지한다. 무료 역조회에서는 화면에 쓰이지 않는 순위 `score`를 제외하고, 다른 종목 행이나 순번을 추가하지 않는다. PRO 역조회 본문은 기존 바이트와 같다. 앱 상세 호출자는 계속 무료 역조회 URL을 사용하므로 무료·PRO 모두 기존 칩·설명을 그린다.

`src`·`tests`에서 API URL, `GuruLens`, `useTickerLens`, `lensBody`, `tickerLens`, `LensList`, `FREE_ROWS` 호출자를 검색했다.

| 호출자 또는 공유 함수 | 영향과 확인 |
| --- | --- |
| `app-view/lenses/page.tsx` → 순위 GET | 실제 행·자리표를 함께 검증한다. 잠금 수를 보존하고 자리표를 실제 종목 Row로 렌더하지 않는다. 기존 공용 PRO 상태 변경에 따라 재요청하며 이전 요청은 취소한다. |
| `GuruLensProOnly` → `useAdUnlockGate` → `useProStatus` | 기존 잠금 DOM·페이월·복원·코드 경로 유지. 서버 자리표가 남아 있으면 PRO 상태에서도 기존 잠금을 유지한다. 광고 해제는 PRO 권한으로 인정하지 않는다. |
| `app-view/cmd/page.tsx` → `useTickerLens` → `tickerLens` → 칩·이유 | 실제 API 응답을 파싱하고, 수정 전후 칩·설명 마크업을 3개 언어에서 대조했다. 상세 화면 파일은 수정하지 않았다. |
| `lib/app/guruLens.ts`의 `lensBody`·타입·무료 경계 | 운영 직접 호출자는 위 순위 페이지와 종목 컴포넌트다. 잠금 필드에 실제 값이 섞이거나 순번이 틀리면 응답을 거절한다. 관련 API·UI 회귀 시험을 실행했다. |
| `watchlistAlerts.rcAppUserId()` | 기존 알림 동기화와 새 순위 요청이 사용한다. 구현은 변경하지 않았다. 무료 순위에서는 ID 조회를 부르지 않는다. |
| `alerts/revenuecat.createRevenueCatVerifier()` | 이 브랜치의 운영 호출자는 순위 GET 한 곳이다. 기존 알림 브랜치의 동일 검증기를 재사용하며 권한·만료·유예·메모리 캐시를 시험했다. |
| `selectSnapshot`·`currentBadges`·발행 서비스·주간 크론 | 공유 구현은 변경하지 않았다. GET의 배지 입력만 공개 가능한 행으로 제한했다. 주간 크론 인증·읽기 전용 어댑터·스냅샷 메모 회귀를 확인했다. |
| 데스크톱 웹 | 이 API·컴포넌트의 별도 데스크톱 호출자는 검색에서 없었다. 데스크톱 화면 파일은 수정하지 않았다. |

## 바꾼 파일

- `src/app/api/guru-lens/route.ts`: 권한 확인, 무료 행 치환, 무료 역조회 점수 제외, 캐시 분리.
- `src/lib/alerts/revenuecat.ts`: 기존 알림 브랜치 검증기 그대로 재사용.
- `src/lib/guruLens/access.ts`: 서버·화면 공용 무료 경계와 자리표 타입.
- `src/lib/app/guruLens.ts`: 자리표 검증·타입, 역조회 점수 선택 타입.
- `src/lib/app/guruLensRequest.ts`: 기존 앱 식별 전달, 공개·권한 요청 URL 분리.
- `src/app/[locale]/app-view/lenses/page.tsx`: 자리표 처리와 권한 변경 재요청.
- `src/components/app/GuruLens.tsx`: 서버 자리표가 남았을 때 기존 잠금 유지.
- `tests/guruLensProGate.test.tsx`: 익명·PRO·캐시·역조회·마크업·권한 전환·검증기 시험.
- `tests/guruLensGate4.test.ts`: 기존 근접 순서 시험을 무료 3개+잠금 2개 계약에 맞춤.
- 이 결과 문서.

## 돌린 시험과 결과

다음 6개만 선택 실행했다. 외부 통신·환경 파일 읽기를 막는 저장소 기존 하네스를 사용했고, 6개 모두 통과했다.

```sh
/usr/bin/lockf -k /tmp/signum-heavy.lock node scripts/run-offline-tests.cjs guruLensApi.test.ts guruLensUi2.test.tsx guruLensProGate.test.tsx guruLensGate4.test.ts guruLensNegativeCache.test.ts guruLensReadOnly.test.ts
```

- 새 관문: 기본·단일 렌즈·배지 유무·`limit=1/3/50`·통과 0·잘못된 ID·PRO 만료/검증 장애·헤더만/프리뷰 주장·400/503 캐시를 확인했다.
- `df149853d`의 실제 라우트를 메모리에서 컴파일하고 시간을 고정해 PRO 본문을 문자열로 직접 대조했다. 전체/단일 렌즈·배지 유무·페이지 제한·근접 목록·역조회 모두 바이트가 같았다.
- 수정 전 실제 카드와 수정 후 실제 카드를 서버 렌더로 대조했다. 렌즈 10개 × 언어 3개 × 무료/PRO × 구매 가능/불가 × 열림/닫힘 = 240쌍 동일. 실제 배지 값이 있는 합성 응답도 사용했다. 칩·이유도 3개 언어에서 같았다. CSS 변경은 0이다.
- 추가한 실제 페이지 effect 시험도 단독 통과했다. 권한 전환 재요청·취소·늦은 무료 응답의 덮어쓰기 방지를 확인했다.
- 읽기 전용 어댑터, 발행본 결측·장애 캐시·복구, 근접 원자료 정렬, 기존 칩·잠금 회귀도 통과했다. 실제 소켓·운영 쓰기는 0이다.

전체 타입 검사 1회, 종료 코드 0:

```sh
/usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/typescript/bin/tsc --noEmit --incremental false
```

각 수정 후 `git diff`로 저장을 확인했고 `git diff --check`도 통과했다. 빌드·전체 시험 묶음·개발 서버는 실행하지 않았다.

### 코디네이터의 375px 화면 확인 방법

이 작업자는 브라우저·스토어 콘솔에 접근하지 않았다. 아래 캡처는 코디네이터가 동일 스냅샷·언어·테마·글자 크기·뷰포트 **너비 375 CSS px**에서 수정 전후를 대조한다.

1. 무료 앱과 모바일 웹에서 `/ko/app-view/lenses?lens=moat_compounder`를 연다. 접힌 카드의 상위 3개 미리보기, 펼친 카드의 1~3위·배지·이유, 4~10위 잠금 높이·문구·버튼·복원·코드 링크, 하단 주석을 같은 스크롤 위치로 캡처한다. 웹에서 원래 없던 구매 버튼은 계속 없어야 한다.
2. 기존 RevenueCat 권한이 활성인 PRO 앱에서 같은 경로를 연다. 네트워크상 `access=pro` 요청 후 1~10위 티커·이유·배지·간격이 기존과 같고 잠금이 없어야 한다. 만료되거나 검증 실패한 요청은 실제 유료 값을 표시하지 않아야 한다. 프리뷰 `sgpro=1`만으로 서버 유료 값을 여는 방법은 제공하지 않는다.
3. 무료 앱에서 기존 구매·복원 경로로 PRO가 되는 경우 순위가 다시 요청되는지 확인한다. 늦은 무료 응답이 도착해도 PRO 목록을 덮지 않아야 한다. 식별 헤더·쿠키·토큰이 보이는 네트워크 화면은 캡처·보고서에 넣지 않는다.
4. 통과 0 렌즈도 확인한다. 기존 근접 5개 중 무료 3개와 나머지 2개 자리표가 기존 잠금 높이를 유지해야 한다. 통과 수·집계 분모가 같은지 확인한다.
5. 무료/PRO 각각 `/ko/app-view/cmd?t=AAPL`에서 통과 렌즈 칩과 펼친 이유, 순위 이동 링크를 캡처한다. 같은 발행본의 Top 10 밖 통과 종목에서도 칩·설명이 같아야 한다. 필요하면 영어·일본어에서도 동일 절차를 반복한다.

## 남은 위험

- 운영 서버의 기존 RevenueCat 서버 키 설정 여부와 실제 구매·복원·375px 캡처는 미확인이다. 설정이 없거나 검증이 실패하면 무료 자리표만 반환한다. 운영 설정 변경·스토어 접근은 하지 않았다.
- 기존 공개 응답은 이전 TTL 및 stale 기간 동안 CDN·클라이언트에 남을 수 있다. 운영 세션에서 배포 시 기존 캐시 제거 또는 만료를 확인해야 한다. 이 작업에서는 캐시 삭제·배포를 하지 않았다.
- 기존 앱 사용자 ID 기반 권한 모델을 그대로 재사용했다. ID 소유 증명·기기 인증을 새로 추가하지 않았다. 기존 알림 API의 저장소 기반 요청 제한은 이 브랜치에 없어서 가져오지 않았다. RevenueCat v1은 없는 ID를 생성할 수 있으므로 악의적인 유효 형식 ID 대량 요청에 대한 운영 요청 제한은 별도 확인이 필요하다. 실제 RevenueCat 호출은 수행하지 않았다.
- 무료 종목 상세의 기존 수치 설명은 유지된다. `score` 자체는 제거했지만 여러 종목의 공개 설명·원자료를 모아 순서를 추론하는 것까지 차단한 것은 아니다. 이를 막으려면 무료 설명 범위를 바꾸는 별도 제품 결정이 필요하다.
- 오래 열린 화면의 구 JS는 자리표 계약을 모를 수 있으므로 운영 검토 시 새 번들로 다시 열어 확인해야 한다. 픽셀 캡처·실기기 테스트를 서버 마크업 시험으로 대체했다고 주장하지 않는다.
- push·main 병합·배포·운영 데이터 쓰기는 수행하지 않았다.
- 요청한 브랜치 커밋은 환경 제한으로 미완료다. `git add` 단계에서 공용 Git 관리 경로의 `index.lock` 생성이 `Operation not permitted`로 거부됐다. 현재 세션은 승인 요청이 불가능하다. 변경 10개 파일은 작업공간에 보존돼 있으며 스테이징되지 않았다. 운영 세션에서 이 문서의 파일 목록만 스테이징하고 기존 비밀값 검사 훅을 통과시켜 커밋해야 한다.
