# 서버 한도 사전 예약 관문 수리

## 결과 요약

기준은 `feat/gift-share-step3`의 `62a12917c`이며 시작 시 작업 트리는 깨끗했다. 원인은 `issueToken()`이 기기 장부만 신뢰하고, 서버의 계정 3·IP 10·전체 400 한도는 발송 후에야 검사하던 구조다.

`POST /api/gift/reserve`를 최소 추가했다. 기존 등록 POST 처리와 `issueGift()`·`ISSUE_LUA`를 그대로 재사용해 서버의 기기·계정·IP·전체 몫을 원자적으로 확보한다. 클라이언트는 그 토큰에 대한 HTTP 성공과 `{ok:true}`를 받은 뒤에만 메모리의 예약 확인 상태를 만든다. 링크 발급 직전 유일한 판정인 `issueToken()`은 이 상태·플랫폼·기기·예약 유효 기간과 기존 설정·저장소·발급 표식을 함께 검사한다. 예약 대기·실패·한도 도달·HTTP 실패·응답 불명·응답 유실에는 선물 링크 0·일반 공유다.

서버 토큰은 이미 등록되므로 공유 완료 등록은 `exists`인 멱등 확인이며 추가 차감하지 않는다. 서버 한도는 최초 예약 요청 날짜로 차감한다. 자정 시험의 날짜별 서버 셈 기대값을 이 동작에 맞췄으며, 기존 발송 링크 등록 보장·기기 한도·재시도·미확정 몫 보존 검사는 유지했다.

미발급 예약은 최초 요청 시각·플랫폼·기기·탭 사용권과 함께 IDB에 남긴다. 화면 재진입·응답 유실 후에도 같은 토큰을 서버에서 다시 확인한다. 준비 사용권은 3분이며, 만료 후 다른 탭이 가져가는 처리는 원자적이다. 이전 탭은 사용권이 바뀌면 연장하지 못하고, 늦은 응답도 다른 탭 몫을 풀지 못한다. 예약 자체의 재사용 기한은 서버 토큰의 7일보다 짧은 6일이며 설정 갱신으로 늘어나지 않는다.

플래그·화면 JSX·라벨·문구·CSS·공유 전송기는 변경하지 않았다. 브라우저·스토어·운영 데이터에 접근하지 않았고 `.env*`를 읽지 않았다. 커밋·push·병합·배포는 수행하지 않았다.

## 바꾼 파일·공유 함수 호출자 영향

| 변경 파일 | 호출자·영향·검증 |
|---|---|
| `src/lib/giftShare/client.ts` | 운영 인스턴스는 `giftPreparation` 하나. `usePreparedGift()`를 통한 아래 3개 직접 호출자 모두 서버 예약 성공이 필수. 동기 payload 인터페이스 유지 |
| `src/components/share/ShareButton.tsx`의 호출(파일 변경 없음) | 앱 종목·랭킹. WIM은 기존 비활성 경로. 기존 JSX 및 공유 전 await 부재 시험 통과 |
| `src/lib/invite/useInvite.ts`의 호출(파일 변경 없음) | `useInviteShare` → `InviteShareButton` → 오늘 볼 것·관심종목 AI 한 줄·실적. 기존 콘텐츠·주소·추천 ref 보존 및 추천 회귀 통과 |
| `src/lib/gift/useGift.ts`의 호출(파일 변경 없음) | `useGiftShare` → 설정·`GiftDashButton`·`GiftAnnounceSheet`. 기존 일반 공유 폴백 사용, 선물·안내 회귀 통과 |
| `src/lib/giftShare/state.ts` | `normalizeState()`의 운영 호출자는 `idbAtomic()`, 시험 호출자는 `_giftStateMemory.ts`. 예약 메타데이터 정규화·보존 추가. 기본 IDB 모의·동시 탭·이전 미확정 발급 회귀로 검증. `trimState()`·`recordSent()` 동작은 유지 |
| `src/app/api/gift/reserve/route.ts` | 신규 경로. 기존 issue POST를 재사용하므로 동일한 플래그·출처·기기·계정 검증·장애 폴백 적용. API 시험 추가 |
| `src/app/api/gift/issue/route.ts`, `src/lib/giftShare/server.ts`, `config.ts`, `atomic.cjs` | 동작 변경 없이 설명을 최초 예약 차감 방식으로 정정. `issueGift()`의 운영 직접 호출자는 issue POST 하나이며 reserve POST도 같은 함수를 재사용. 기존 서버·Lua 회귀 통과 |
| `tests/giftShareClient.test.ts`, `giftShareMidnight.test.ts`, `giftShare.test.ts`, `giftShareReservation.test.ts` | 예약 API 모의 분리, 최초 예약 날짜 셈·완료 무차감 기대값 반영, 신규 통합·API 시험 추가 |
| `docs/gift-share-step3.md`, 이 보고 | 현재 설계의 우선순위·호출자·확인 범위 명시 |

## 돌린 시험과 결과

외부 통신·환경 파일 읽기를 차단한 기존 오프라인 실행기를 공용 `/usr/bin/lockf -k /tmp/signum-heavy.lock` 아래 실행했다. 수정 중 실패한 시험은 원인을 확인하고 수정 후 재검증했다. 이번 결과는 관련 18파일 통과이며 실행기가 병기하는 이전 전체 278파일 집계는 이번 실행 결과가 아니다.

- 클라이언트 15개 통과: 꺼짐 객체·공유/복사 바이트 동일, 저장소·등록 접근 0, 기존 JSX 동일, 공유 전 await 없음, 기존 단일 발급 판정 회귀 포함.
- 자정·관문 22개 통과: 무작위 300회와 기존 IDB·완료 기록 실패·발급 표식·미확정 몫·동시 탭 회귀 포함.
- 신규 예약 통합 8개 통과: 계정·IP·전체 한도 도달, 실패·HTTP 실패·응답 불명·유실, 응답 대기 중 클릭, 마지막 1몫에 12기기 동시 예약, 같은 기기 9탭 동시 예약, 응답 유실 뒤 같은 토큰 복원·무추가 차감, 만료 예약 동시 복원·이전 탭 차단, 늦은 응답과 사용권 인계 교차.
- 서버 21개, Lua 모의·대조군 15개, 적재 도구 14개 검사 통과. 실제 Redis Lua 1묶음은 로컬 실행 파일 부재로 건너뜀.
- 기존 선물·선물 안내·초대·랜딩·Android 인앱·쿠폰·iOS 인앱·구독·데스크톱 전달·등록 미리보기·스마트 배너·스마트 링크 회귀 통과.
- 전체 타입 검사(`node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`)는 같은 잠금과 환경 파일 읽기 차단 아래 1회 실행해 종료 0·진단 0. `git diff --check` 통과.

로그는 커밋하지 않는 `.logs/ux-gate/*.log`와 `.logs/gift-server-reservation-tsc.log`에 있다.

## 남은 위험

서버 몫은 공유 전부터 점유하고 자동 반환하지 않는다. 미발급 예약은 같은 기기에서 재사용하지만, 장부·기기 식별자를 잃으면 사용하지 못한 몫이 서버의 해당 날짜 한도에 남을 수 있다. 발급 후 완료·취소가 끝내 확인되지 않는 기기 몫을 영구 보존하는 기존 보수적 동작도 유지한다.

사전 예약은 발신 한도를 확보하며 스토어 재고를 배정하지 않는다. 공유 후 재고·수신자 자격·스토어 조건은 기존 정책의 적용을 받는다. 실제 Redis·실제 IndexedDB·실기기 공유·스토어 등록·PRO 부여는 미검증이다.
