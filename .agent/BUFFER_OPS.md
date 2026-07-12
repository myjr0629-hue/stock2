# BUFFER 운용 규약 — 양머신(Mac/PC) 공유 정본

> 어느 머신의 어떤 에이전트든 Buffer를 만지기 전에 이 문서를 읽는다.
> 전략 정본 = `LAUNCH_PROMOTION_PLAN.md` PART 3~4 (특히 §4-6.5 아키텍처, §4-6.9 콘텐츠 레시피,
> §4-6.10 운용 런북). 이 문서는 그중 **Buffer 실무**만 자체완결로 담는다.
> 갱신 규칙: 채널/상태가 바뀌면 이 문서 + 코드 레지스트리를 같은 커밋으로 갱신하고 push.

## 0. 절대 규칙 (위반 = 1,000포스트 사태 재현)

1. **자동 발행 금지.** 모든 API 적재는 `draft: true` — 발행 버튼은 항상 사람.
2. **채널당 하루 초안 ≤3.** 사건 없으면 0 (무사건=무초안).
3. **동일문 금지.** en/ja는 같은 사건을 각 언어로 *따로 작성* (번역 복붙 금지 — X 정책상 현지화만 허용).
4. **본문 링크 금지.** 링크는 발행 후 답글/바이오에만.
5. 구실패 DNA 감지 시 초안 폐기: 이모지 3+, 지표 4+ 나열, "Market Pulse" 류 다이제스트 헤더.
6. 예측·매수매도 단어 0 · XS 스코어 노출 금지 · "Why'd It Move?" 문구 금지(3번앱 예약명).

## 1. 라이브 채널 (실측 2026-07-12)

| 채널 | Buffer ID | 상태 |
|---|---|---|
| X (en) `@signumhq` | `6a518928404834462892924a` | ✅ 활성 — Premium+ (2026-07-11 가입) |
| X (ja) `@signumhq_jp` | `TBD — 연결됨(07-12), ID 확인 필요` | ✅ 연결 — Premium+ (2026-07-12 가입) |
| Bluesky `SIGNUM HQ` | `69ca84bbaf47dacb696d9d0f` | ✅ 유지 (구 플릿 유일 생존; 미응답 댓글 59) |
| YouTube `SIGNUM HQ` | `69ca9615af47dacb696df427` | 💤 영상 페이즈 대기 |
| TikTok `signumhq` | `69ca95e7af47dacb696df35a` | 💤 영상 페이즈 대기 |

- 옛 13채널(X3·IG3·Threads3·Pinterest)은 **연결 해제됨** — 재연결 금지.
- 옛 X 계정들은 휴면 보관(삭제 금지 — 핸들 자산).
- **ja ID 확인 방법**: Buffer 웹에서 채널 클릭 → 주소창 URL의 24자리 영숫자. 또는 PC(토큰 보유)에서
  `GET https://api.bufferapp.com/1/profiles.json?access_token=$BUFFER_ACCESS_TOKEN`.
  확인 즉시 ①이 표 ②`src/lib/marketing/bufferClient.ts` CHANNEL_MAP ③`src/lib/marketing-v2/core/channels.ts`
  세 곳을 같은 커밋으로 갱신.

## 2. 토큰/환경

- `BUFFER_ACCESS_TOKEN` = Vercel 프로덕션 env (서버 코드에서만 사용).
- **PC**: 로컬 env 사본 보유 → Buffer API 직접 조회 가능.
- **Mac**: 로컬 토큰 없음, Vercel env 다운로드는 권한 차단 → API 확인이 필요하면 PC 세션에 넘기거나
  사용자에게 채널 URL을 요청. 토큰을 채팅/커밋에 노출 금지.

## 3. API 사용법 (코드 경로)

```ts
import { createPost } from '@/lib/marketing/bufferClient';
await createPost({
  text: '...',                    // 채널별로 다른 문장 (동일문 금지)
  channelIds: ['<channel-id>'],   // 1채널 1문장 원칙 — 여러 채널에 같은 text 금지
  draft: true,                    // 불변 — false 옵션을 만들지도 말 것
  mediaUrl: 'https://...card.png',// 지표 카드 크롭 (§4-6.9)
  scheduledAt: '2026-07-14T13:30:00Z', // 선택: 발행 예약 시각(ET 장중) — 사람이 승인한 초안만
});
```

- 응답의 post id는 로그로 남긴다. 실패 시 재시도 1회, 그래도 실패면 보고만 (조용한 유실 금지).
- 초안 적재 후 사용자 알림(작업 중인 세션에서 보고)까지가 한 사이클.

## 4. 운용 사이클 (누가 뭘 하나 — 상세는 §4-6.10)

| 역할 | 담당 | 내용 |
|---|---|---|
| 사건 탐지 | Vercel 크론(예정: seed-kit) / 당분간 세션 내 Claude | 트렌딩∩±2%무브∩이상치 |
| 글 3안 작성 | Claude (Mac 또는 PC 세션) | 5포맷 중 선택, en/ja 네이티브 |
| 초안 적재 | Claude → `createPost(draft:true)` | 카드 이미지 포함 |
| **발행** | **사람** | 밤 22:30~24:00 KST(미국장) 훑고 버튼 |
| 답글 게임 | 사람 | 큰 계정 3개/계정 + 내 포스트 답글 전원 반응 |
| 주간 성적표 | Claude (일요일) | 포맷별 노출/답글 → 승자 포맷 선별(§4-6.10 매트릭스) |

- **첫 2주는 수동 검증 기간** — seed-kit 자동화는 승자 포맷 확정 후 구축.
- 데드맨: 2주 연속 전 지표 바닥 → 전면 정지 + 보고. 볼륨 증량은 금지 처방.

## 5. 양머신 조율

- **작업 전 `git pull` 필수** — 실행 로그/채널 상태는 이 리포가 유일한 공유 채널.
- 실행 로그는 `LAUNCH_PROMOTION_PLAN.md` §4-6.8에 날짜·머신 표기로 append.
- **Premium+ 다운그레이드 리마인더 = PC Claude 예약작업 (2026-08-13 09:00 KST)** — en/ja 둘 다
  그날 처리(2번째 할인 결제 확인 → Premium 변경 예약). Mac에 중복 리마인더 만들지 말 것.
- 카드 이미지 엔진(3종 디자인: 히어로 숫자/레벨 사다리/괴리 대면 + VERDICT)은 미구현 — 구현 시
  이 문서에 URL 패턴 기록. 그전까지 이미지는 사용자 캡처 크롭.
