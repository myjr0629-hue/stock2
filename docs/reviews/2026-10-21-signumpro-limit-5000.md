# SIGNUMPRO 한도 표시 수정 검증

## 결과 요약

기준 커밋은 `8415c9a2a`이다. 기본 한도 500을 유지하며 SIGNUMPRO만 5,000으로 조회한다. 코드별 만료 판정·날짜는 유지한다. 한국어 «선착순 5,000명», 영어 «first 5,000», 일본어 «先着5,000名»을 적용했다. 쿠폰 화면의 영어 «First» 대문자도 기존대로 유지한다.

원인은 쿠폰 부제의 공통 500 상수, 링크 제목의 고정 500, 정적 OG 이미지의 500이었다. PC 안내는 쿠폰 부제를 재사용한다. 쿠폰 HTML의 OG 이미지 주소도 SIGNUMPRO에서는 코드별 OG로 연결했다.

영어 쿠폰 부제는 숫자가 길어지면 375px 화면에서 추가 줄바꿈이 예상되어 SIGNUMPRO의 숫자 부분만 자간 -1.5px와 줄바꿈 방지를 적용했다. OG는 기존 숫자 영역 안에 5,000 전체를 가로 축소해 넣는다. 라벨·구분자·배지·나머지 배치는 이동하지 않는다.

## 바꾼 파일

- `src/lib/marketing/promoLimit.ts`: 기본 500, SIGNUMPRO 5,000 정의·입력 정규화.
- `src/lib/marketing/coupon.ts`: 기존 기본 상수를 같은 값으로 재노출.
- `src/lib/marketing/couponHtml.ts`: 코드별 iOS 부제·OG 주소·영어 숫자 자간.
- `src/lib/marketing/linkPreview.ts`: 코드별 제목·공유 OG 주소 함수.
- `src/components/landing/PromoCodeChip.tsx`: 링크의 코드에 따른 한도 숫자.
- `src/app/api/og/promo/route.ts`: 코드별 숫자 영역 교체, 기존 코드 PNG 원본 반환.
- `tests/signumproLimitDisplay.test.ts`: 기준 커밋 HTML·응답 헤더·PNG 비교 시험 추가.
- `tests/signumproExpiryDisplay.test.ts`: 한도 변경을 반영하고 기존 만료 검증 유지.
- 이 검증 기록.

공유 함수 호출 영향은 다음과 같다.

- `promoCodeLimit`: 쿠폰 부제·링크 제목·OG 주소 선택·홈 칩·프로모션 OG가 사용한다. Android 풀 한도는 그대로다.
- `couponSubline`: 쿠폰 HTML과 `desktopRedeemHtml`이 사용하며 `/app`의 iPhone·PC 응답으로 이어진다.
- `promoCopy`: 기본 `PROMO_COPY`와 `previewHtml`이 사용한다. 기본 문구는 기준 커밋과 바이트 동일하다.
- `promoImageUrl`: `previewHtml`과 쿠폰 HTML이 사용한다. 기존 코드 이미지 주소는 그대로다.
- `/app` 라우트는 공유 함수 결과를 사용하므로 직접 수정하지 않았다. `/api/og/invite`에는 한도 표시가 없으며 소스를 기준 커밋과 바이트 비교했다. 초대 카드·선물 분기도 비교했다.

## 돌린 시험과 결과

확인:

- SIGNUMPRO 한도 표시 회귀 **1,256건 통과**. 3언어 쿠폰·링크 카드·PC 안내·홈 칩·OG, iOS·Android 분기, 기본 `PROMO_COPY`, 기존 채널·기존 크리에이터 시험값, 소문자·공백 정규화를 검증했다.
- SIGNUMPRO 날짜 표시 회귀 **494건 통과**. 3언어 실제 GET, 만료 경계와 기존 Play 종료를 포함한다.
- SIGNUMPRO 만료 회귀 **159건 통과**.
- `/usr/bin/lockf -k /tmp/signum-heavy.lock npx --no-install tsc --noEmit`: **종료 코드 0**, 전체 검사는 1회 실행.
- `git diff --check`: 통과.
- 새 한도 시험의 기준은 메모리에서 읽은 `8415c9a2a`이다. 기존 코드값은 기존 소스·시험에서 메모리로만 재사용하며 새 파일·출력에 복제하지 않았다. 기존 코드 HTML·제목·응답 헤더·PNG는 바이트 동일하다.
- SIGNUMPRO OG는 기준 커밋의 SIGNUMPRO PNG와 비교해 숫자 영역 밖 픽셀이 동일하다. 이미지 크기는 1200×675다.

OG 렌더 확인 방법:

1. `next/og`의 실제 `/api/og/promo` GET을 `NextRequest`로 직접 호출한다. 서버·브라우저·외부 통신을 사용하지 않는다.
2. 시험에서 `SIGNUMPRO_RENDER_DIR=/tmp/signumpro-limit-5000`을 지정하면 3언어 PNG와 SIGNUMPRO HTML을 저장한다. 이번 실행은 로컬 TypeScript 변환 로더 `/tmp/signum-limit-run.cjs`로 수행했다.
3. `sharp`로 기준 PNG와 픽셀 비교 후 `og-ko.png`, `og-en.png`, `og-ja.png`를 직접 열어 5,000 전체가 보이고 잘림·겹침이 없는지 확인했다.
4. 한도·날짜 표시 시험은 각각 `lockf`로 감싸 실행했다. 시험의 외부 fetch는 실패하도록 막고 Redis 접근·쓰기는 차단했으며 응답 후 집계는 실행하지 않았다.

375px 폭 측정:

쿠폰 CSS의 가용폭은 375 − 바깥 여백 32 − 티켓 내부 여백 40 = **303px**다. AppKit의 시스템 글꼴 13.5px, 굵기 600으로 실제 부제 문자열을 측정했다. 영어는 숫자 부분 자간 -1.5px를 포함했다.

| 언어 | 기존 너비 | 변경 너비 | 변경 전후 텍스트 높이 |
|---|---:|---:|---:|
| 한국어 | 221.1px | 233.2px | 16px → 16px |
| 영어 | 295.2px | 299.8px | 16px → 16px |
| 일본어 | 204.1px | 216.2px | 16px → 16px |

## 남은 위험

- 커밋은 미완료다. 현재 브랜치는 `fix/signumpro-limit-5000`이며 `git add` 단계에서 공용 Git 메타데이터의 `index.lock` 생성이 `Operation not permitted`로 거부됐다. 세션 정책상 권한 상승을 요청할 수 없다. 소스·시험·검증 기록은 작업공간에 저장돼 있다.
- 위 너비는 네이티브 글꼴 측정 결과다. 실제 iPhone·브라우저의 375px 화면은 접근 금지 지시에 따라 확인하지 않았다. 해당 화면에서도 추가 줄바꿈이 없을 것으로 예상하지만 실기기 확인과는 구분한다.
- 운영 화면·운영 API·스토어 콘솔에는 접근하지 않았다. 실제 애플 한도 5,000은 작업 지시의 정보를 사용했다.
- 기존 OG URL의 CDN 캐시와 플랫폼 링크 미리보기 캐시에는 예전 이미지가 남을 수 있다. 배포·캐시 운영은 수행하지 않았다.
