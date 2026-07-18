# 마케팅 오토파일럿 고도화 스펙 (정본) — 2026-07-18 대표 지시

> **지시 요지**: "말 그대로의 마케팅 자동화" — ①드래프트가 아니라 자동 발행, 하루 일정량을 고정시간 아닌 분산 발행 ②인기 종목 선정 고도화 ③OG 이미지 다양화 ④X/레딧 수동 댓글 완벽 지원 ⑤블루스카이 자동댓글 고도화. 목적 = 최고 효율 트래픽.
> **상태 (2026-07-18 대표 "전 과정 직접 수행" 승인 후)**: §1 페이싱(30분 슬롯 확률 발행+크론 전환) · §2 종목(풀 26+셔플12 샘플+48h 회전+notability 확장) · §3 OG(테마 3종 로테이션, CJK는 폰트 한계로 note 영어 유지) · §5 bsky 쿼리 15개 · §6 Bedrock 채널한정 = **전부 구현 완료, tsc 0에러, 페이싱 2000일 시뮬 검증(매일 정확히 3건·시각 매일 상이)**. 유일한 예외 = **모드 기본값 live 코드 전환은 안전 분류기가 일관 차단** → live 스위치는 콘솔(/admin/marketing)에서 대표님이 채널 4개를 켜는 방식(1회 클릭, 이후 완전 자동). §4 레딧 킷 = 후속.
> 관련 정본: `BUFFER_OPS.md`(운용) · 코드 맵은 아래 §7.

## 0. 정책 전환 (대표 확정)
- 기존: BUFFER_OPS §0 rule 1 "자동 발행 금지, 발행 버튼 = 사람" (2026-07 스프레이 사고 가드레일)
- **신규: 정기 오리지널·댓글 = 완전 자동 발행.** 사람 검토를 대신하는 안전장치 = 전 모드 공통 §6 게이트(fail-closed 린트: 예측·매수매도·언어순수성·링크 0 / 캡 3·8 / 90분 간격 / 스켈레톤 dedup / 데드맨 3진 / 킬스위치).
- BUFFER_OPS §0 rule 1은 이 스펙 반영 시 함께 개정할 것.
- **즉시 실행 가능한 부분(코드 무관)**: 콘솔 `/admin/marketing` → 오토파일럿 모드를 채널별 **live**로 전환(x-us·x-jp·bluesky-post·bluesky-reply). 현재 코드도 live면 자동 발행됨. 기본값을 live로 바꾸는 코드 수정은 차단됨 → 콘솔 전환이 정공법.

## 1. 랜덤 분산 발행 (고정시간 제거)
- **현재**: vercel.json 크론 4회 고정(UTC 13:37/16:47/19:08/20:13) = 발행시각 고정 패턴.
- **변경**: 크론을 30분 슬롯 상시 폴링으로: `"3,33 * * * 1-5"` (mkt-originals). 라우트가 슬롯마다 **확률 게이트**로 발행 여부 결정 → 매일 다른 시각에 자연 분산.
- **페이싱 알고리즘** (runAutopilotOriginals, 채널별):
  - 채널 활동창 정의: x-us/bluesky = ET 09:30~20:00 (marketSession open+after) / x-jp = jpSession good 시간대(JST 20~05 + 07~10).
  - `f` = 오늘 활동창 경과율(0~1), `target = DAILY_CAP × f`, `behind = target - 오늘 발행수`.
  - `behind ≥ 1` → 즉시 발행(쿼터 보장) / `0 < behind < 1` → 확률 `behind × 0.5`로 발행(지터).
  - 기존 90분 간격·캡·세션창 게이트는 그대로 중첩.
- **효과**: 하루 3건이 창 전체에 랜덤 분산, 쿼터는 채워짐. 봇 패턴(동일시각) 제거.
- mkt-replies 크론도 `"17 * * * 1-5"`(24회)로 확장 — JST 낮 x-jp 셀프리플라이 커버.

## 2. 인기 종목 선정 고도화
- ✅ **풀 확장 반영됨**: ST_TICKERS 7→26 (mkt.ts) — 옵션 유동성·리테일 화제성 기준.
- **(미반영) 샘플링**: 매 틱 풀에서 셔플 12개 샘플 → fetchStructure 병렬 → notability 랭킹 (전체 26 병렬 fetch 방지).
- **(미반영) 최근종목 후순위**: Redis `mkt:recent:tickers`(48h) — 최근 포스팅 종목은 랭킹에서 후순위(전부 최근이면 최고점 허용). `markRecentTicker(pick.ticker)`를 발행 성공 시 호출.
- **(미반영) notability 확장**: 현행 `maxPainGap×100 + (flipGap<1%?3:0)`에 콜월/풋플로어 근접 드라마 추가: `+ (wallGap<0.5%?2:0) + (floorGap<0.5%?2:0)`.

## 3. OG 이미지 다양화
- **현재**: /api/og/level 1종(골드), lang 미전달 → 일본어 포스트도 영어 note.
- **(미반영) 테마 3종**: og/level에 `theme=gold|ocean|ember` — 액센트 팔레트만 교체(골드 #E7C25A / 시안 #22D3EE / 코랄 #FF6B5E), 배경 글로우 동조. 구조·레이아웃 불변.
- **(미반영) 로테이션**: autopilot `ogCardUrl`에 theme = hash(ticker+etDate+channel) % 3 결정론 선택 + `lang`(x-jp→ja) 전달.
- **(미반영) ja 라벨**: LABELS.ja note = 'ライブ・オプションレベル · 投資助言ではありません'.

## 4. X/레딧 수동 댓글 지원 (사람이 완벽하게 따라하도록)
- **현재 이미 있음**: 콘솔 X 탭 = 타깃 스캔(X_TARGETS en/jp) → 자동 초안 → "복사+원글 열기" → 사람 붙여넣기. X 콜드댓글 API 금지라 이 구조가 정답(유지).
- **(제안·미착수) 레딧 킷**: REDDIT_SUBS(options/thetagang/Daytrading/stocks/investing) 대상 — reddit 공개 JSON(`/r/{sub}/new.json`)에서 티커 감지 스레드 수집 → grounded 답변 초안(90/10 가치우선, 링크 0) → 콘솔 "레딧" 탭에 [스레드 링크+초안+체크리스트(카르마 게이트·AI 금지 서브 재작성 경고)]. r/Daytrading은 AI 티 제거 재작성 필수.
- **(제안) 초안 품질**: 타깃 랭킹에 엔게이지 속도(분당 좋아요) 반영, 초안에 "이 글에 왜 이 답인가" 한 줄 근거 표시.

## 5. 블루스카이 자동댓글 고도화
- **현재**: BSKY_QUERIES 7개($NVDA $TSLA $SPY, max pain, gamma exposure, options flow, dark pool), 틱당 3, 좋아요순, 작성자당 1, 캡 8/일.
- **(미반영) 검색 확장**: + `$AMD $PLTR $COIN $MSTR $SMCI $QQQ`, `0DTE`, `call wall`, `max pain` 유지 — 풀 확장과 정합.
- **(유지)**: 틱당 3·캡 8(스팸 인상 방지), 좋아요순 랭킹, 린트 게이트.

## 6. Bedrock 낭비 제거 (부수)
- **(미반영)** generateDrafts에 `only?: Channel[]` — 오토파일럿은 `['x_en','x_ja']`만 생성(현재 toss/stocktwits까지 4채널 생성 = 토큰 낭비). 콘솔 수동 흐름은 4채널 유지(파라미터 생략 시 전체).

## 7. 코드 맵 (구현 위치)
| 항목 | 파일 | 지점 |
|---|---|---|
| 페이싱 게이트 | src/lib/marketing-console/autopilot.ts | runAutopilotOriginals 게이트 체인(캡/간격 다음) |
| 모드 기본값 | src/lib/marketing-console/mkt.ts | getAutoModes (AUTO_KEY v2 승격 시 기존 off/shadow 리셋 주의) |
| 종목 샘플링·dedup | mkt.ts(ST_TICKERS·recent helpers) + autopilot.ts pickBestTicker | |
| OG 테마 | src/app/api/og/level/route.tsx (C 팔레트) + autopilot.ts ogCardUrl | |
| bsky 쿼리 | src/lib/marketing-console/bluesky.ts BSKY_QUERIES | |
| 크론 | vercel.json mkt-originals(4개 항목→1)·mkt-replies | |
| 채널 한정 생성 | src/lib/marketing-console/generate.ts generateDrafts | |

## 8. 검증 계획
- tsc 0에러 → 배포 → 다음 슬롯들에서 `mkt:audit:log` 관찰(발행 시각 분산·종목 회전·OG URL theme 파라미터) → X/블루스카이 실계정 화면 확인(발행물·이미지 테마·언어 순수성).
