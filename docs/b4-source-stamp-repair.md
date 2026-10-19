# B4 관문 4차 수리 (2026-10-19)

## 결과 요약

시작 HEAD `b39b54090`. 관문 `10190928·10191007·10191128·10191155` 전문과 ACTIVE-SESSION 12:1x 기록을 읽었다.

- `sourceStamp.acceptQuote(prev,next,now)`가 가격·원천 스탬프·가격 세션·기준 종가를 함께 채택한다. 같은 세션의 더 옛 체결은 보존 시간과 무관하게 거부하고, 세션 변경 시 새 기준 종가로 등락을 계산한다.
- Flow/CMD는 `useLivePrice.restQuote`(혼합 전 REST)와 원본 WS를 공통 변환 함수에 전달한다. 가격 일치로 출처를 추측하던 분기를 제거했다. PRE도 같은 채택 규칙을 쓴다.
- PRE REST가 개장 뒤까지 남아도 새 정규장 WS의 기준 종가는 그 행의 정규장 가격으로 넘긴다($100.50 / $100 → +0.50%).
- 큰 가격의 시각은 채택된 가격 묶음의 스탬프로 표시한다.
- 결측·누락·역전 응답 대신 남긴 REST 행을 `preserved`로 구분한다. 해당 행을 근거로 추가 괴리 재검증을 요청하지 않는다. 체결 시각으로 신선함이 확인된 WS는 가격 괴리만으로 거부하지 않는다. 시각 없는 레거시 메시지의 기존 가격 문턱은 유지한다.
- 로컬 `main`에 b2가 포함되지 않은 것을 `merge-base --is-ancestor`로 확인했다. 현재 달력은 `marketCalendar`를 직접 참조한다.
- 고정 라벨·문구·화면 구조 변경 없음. fetch·폴링 주기 추가 없음. 커밋·push·병합·배포·운영 쓰기 없음.

## 바꾼 파일과 공유 영향

- `src/lib/sourceStamp.ts`: 가격 묶음·채택 함수. WS 세션 끝 경계·휴장·미래 체결도 검사한다. 정규장 마감 첫 1초는 정규장 체결로 유지한다.
- `src/utils/liveQuote.ts`: REST/WS 변환·병합·목록 표시·Flow/CMD 표시가 같은 채택 함수를 사용한다.
- `src/hooks/useLivePrice.ts`: 기존 반환값에 선택 전 REST 원본만 추가한다. 기존 가격 선택·요청 설정은 그대로다.
- 앱 Flow/CMD `page.tsx`: 공통 채택 경로·채택된 가격 시각 사용.
- `tests/sourceStampConsumers.test.ts`: 실제 화면 식·실제 훅을 VM에서 실행하는 회귀 시험 추가.
- `tests/priceTimeBasis.test.ts`: main에도 반영된 순수 `economicSeries` 의존성을 VM에 연결. PRE 시험의 가상 시각을 08:30으로 수정해 09:45 정규장 체결을 PRE에 주입하지 않도록 했다.

호출자 검색 결과:

- `liveDisplay·tickMismatch·mergeQuotesByStamp`: `useLiveQuotes` → `useWatchlistData`(대시·목록), `firstRunValueData`(첫 안내). 정상·누락·오류 응답, 세션 전환, 추가 mutate 횟수를 시험했다.
- `wsTickUsable`: 생산 호출자는 위 목록 경로의 내부 판정이다. 정규장·PRE·POST·마감과 시각 없는 레거시 문턱을 시험했다.
- `useLivePrice`: 앱 Flow/CMD 외 `usePriceDisplay`, 웹 `FlowPageClient·MobileFlowPage`, `LiveTickerDashboard`, `MobileCommandPage·MobileCmdOptions·MobileCmdChart`. 새 필드는 선택적이며 기존 반환 필드는 변경하지 않았다. 연결·끊김 두 반환 경로에서 REST 원본을 확인했다.
- `wsTickFresh`: 공통 채택 함수 외 `tickMismatch`, `useOnePipe`, CMD `RelatedPeersLive`. 경계 시험, 시간외 시험, 대시 마감 재현으로 검증했다. 실제 화면 렌더는 하지 않았다.
- `preferNewer`: 생산 호출자는 제거됐다. 가격 외 기존 스탬프 계약과 시험을 위해 export는 유지했다.

## 돌린 시험과 결과

무네트워크 합성 입력 또는 저장된 fixture 사용. 시험 묶음과 제한 타입 검사는 `/usr/bin/lockf -k /tmp/signum-heavy.lock`으로 직렬 실행했다.

| 시험 | 최종 결과 |
|---|---:|
| sourceStamp | 26 통과 |
| sourceStampConsumers (실제 Flow/CMD 식·useLivePrice·useLiveQuotes) | 15 통과 |
| extWsTrust | 12 통과 |
| watchlistData | 49 통과 |
| firstRunValue | 44 통과 |
| integrityStructUnify | 84 통과 |
| priceTimeBasis | 43 통과 |
| dashCloseRoll | 통과 |
| 공용부 제한 tsc (`sourceStamp·liveQuote·useLivePrice·useLiveQuotes` 및 의존성) | 통과 |
| git diff --check | 통과 |

초기 확장 시험에서 합성 수신시각 `5`가 `5000`으로 바뀌는 회귀를 발견해 브라우저 수신 ms를 그대로 보존했다. PRE 시험의 세션 불일치와 기존 economicSeries 모의 의존성 누락도 수정 후 재시험했다. 마지막 시간외 표시·개장 기준 종가 보강 뒤에는 소비처 시험을 재실행했고, 제한 tsc는 반복하지 않았다.

## 남은 위험

- 수정 파일을 임시 사본으로 3방향 텍스트 비교: `fix/b1b-fake-flow·fix/intel-zero-narrow` 충돌 0. `fix/b2-session-unify`는 `src/utils/liveQuote.ts` import 블록 충돌 1곳. 병합 시 b2의 `quoteSessionAt`과 B4의 날짜·채택 함수 import를 함께 남겨야 한다. 저장소 병합·커밋은 수행하지 않았다.
- 전체 tsc·빌드·브라우저·운영 공급사 호출량은 검증하지 않았다. 재검증 0회는 모의 훅 실행으로 확인한 결과다.
