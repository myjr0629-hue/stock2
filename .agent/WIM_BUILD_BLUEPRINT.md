<!-- WIM 구현 청사진 (2026-07-09). "무엇/왜"=WIM_DIRECTION.md, "어떻게 짓는가"=이 문서.
     착수 전 §0 게이트(노코드 D7 + API도메인/4.3 결정) 통과 필수. 재사용 경로는 전부 실측(repo /Users/eunhoon/.gemini/antigravity/scratch/stock2). -->

# Why'd It Move? (WIM) — 구현 청사진 (바로 착수용)

**동반 문서**: 전략=`WIM_DIRECTION.md`, 제품스펙=`EDU_APP_SPEC_WHY_IT_MOVED.md`. 이 문서는 **파일 단위 빌드 방법**.
**핵심 원칙**: 두뇌(데이터·AI·크론) 재사용 = 신규 파이프라인 0 / 얼굴(퀴즈 UI·셸) = 전부 신규(4.3).

---

## 0. 착수 전 게이트 (코드 짓기 전 — 비타협)
1. **Gate 1 (노코드 D7≥8%)**: 웹 랜딩+수동 푸시로 2~3주 검증. 미달=빌드 안 함. (WIM_DIRECTION §0.5)
2. **★ API 도메인 / 4.3 결정 (기술 1순위)**: 원격 웹뷰라 리뷰어가 Web Inspector 네트워크 탭에서
   `signumhq.com/api/...` 호출을 보면 SIGNUM과 "같은 백엔드"로 읽혀 4.3 리스크. 선택지:
   (a) 별도 API 서브도메인(`api-wim.signumhq.com` 또는 `wim.signumhq.com`)으로 프록시,
   (b) 최악의 경우 별도 개발자 계정. **DOM은 신규라 안전, 네트워크 출처가 관건.** 착수 전 확정.
3. **브랜드**: 히어로 컬러(바이올렛 #6C5CE7 권장), 마스코트(마켓 디텍티브) 아트, 앱 이름/아이콘/상표
   유니크니스, 폰트(M PLUS Rounded 1c + Pretendard) 라이선스. — 사람 결정(WIM_DIRECTION §7).

---

## 1. 아키텍처 (UC 패턴 그대로 복제)

| 레이어 | UC(참조) | WIM(신규) |
|---|---|---|
| 네이티브 셸 | `uc-app/`(Capacitor, appId com.signumhq.undercurrent, server.url=signumhq.com/en/undercurrent) | **`wim-app/`** (uc-app 복제, appId **com.signumhq.wim**, server.url=**signumhq.com/en/wim**, scheme `wim`, bg 바이올렛/오프화이트) |
| 웹 UI | `src/app/[locale]/undercurrent/**` | **`src/app/[locale]/wim/**`** (신규 퀴즈 컴포넌트 — app-view/undercurrent DOM 재사용 금지) |
| 읽기 API | `/api/undercurrent/feed` (SWR) | **`/api/wim/today`** (베이커가 만든 `wim:units:{date}` 읽기, SWR 불필요 — 생성은 베이커가) |
| 생성(크론) | UC는 온디맨드 | **`/api/cron/wim-bake`** (야간 1회, `wim:units:{date}` 기록) |
| 레이아웃 격리 | `src/app/[locale]/layout.tsx`의 `isUndercurrent` 분기(NativeAppProvider 제외) | **동일 분기 추가**: `isWim` → 사이트 크롬·SIGNUM 광고 초기화 제외 |

**셸 복제 절차**: `cp -r uc-app wim-app` → capacitor.config.ts의 appId/appName/server.url/scheme/색 교체 →
아이콘/스플래시(@capacitor/assets, 바이올렛) → 키스토어 신규(`~/android-tools/wim-upload-key.jks`) →
Info.plist(ITSAppUsesNonExemptEncryption=NO, TARGETED_DEVICE_FAMILY=1, **광고 미탑재 MVP는
NSUserTrackingUsageDescription/GADApplicationIdentifier 없음** — UC 교훈: 광고 없으면 ATT키 넣지 말 것).
**⚠️ 디바이스 빌드 후 git add -A 금지**(SPM 오염). `.gitignore`에 `wim-app/ios/App/build*/` 선등록.

---

## 2. 데이터 파이프라인 = 야간 베이커 (`/api/cron/wim-bake`, 탭타임 AI = 0)

크론 등록(vercel.json crons, 미장 종가 후 ET): `{ "path": "/api/cron/wim-bake", "schedule": "0 22 * * 1-5" }`(=ET 종가 부근, UTC 조정).

**단계 (MVP = L1 서사형 원인만):**
1. **무버 선택** — SIGNUM이 이미 `|Δ|≥2%`로 플래그하는 스냅샷 캐시에서 오늘 무버 티커 목록.
   (참조: deep-analysis route L176 `bigMove = abs(priceChange)>=2.0`; 뉴스는 UC `fetchMassive`,
   종목 money는 `fetchMoney`와 동일 소스). MVP는 **L1로 설명되는 무버만 필터**(cat 1/2/3).
2. **정답 생성** — 무버당 1회 `POST /api/command/deep-analysis`
   body=`{ ticker, locale, snapshot, triggerReason:'PRICE_MOVE', gexStats }`
   (입력형태 실측: route L52; 클라 호출 예 `app-view/cmd/page.tsx` L2211). ≥2%면 강제
   'Price Move Attribution' 섹션(route L334-341)이 우선순위대로 원인 해결.
   출력: `{ currentState, sections[], keyInsight, riskFlag, confidence }` 전부 {ko,en,ja}.
   **snapshot 소싱**: cmd page가 만드는 unifiedSnapshot과 동일(L2205~). L1은 옵션구조 불필요라
   최소 snapshot로 충분 — 착수 시 최소 필드 확정.
3. **원인 태깅** — 드라이버를 8카테고리로 매핑(§4 드라이버 사전). **cat 5(옵션)·8(플로우) 태깅되면
   MVP 큐에서 제외**(P2 대기).
4. **선택지 조립** — 정답 카테고리 + 원인 뱅크(§4)에서 그럴듯한 혼동 오답 3개(L1은 오답도 cat1/2/3에서).
5. **영수증** — 같은 deep-analysis 응답의 뉴스 헤드라인 + `disclosures.ts` 8-K 이벤트.
6. **컴플라이언스 게이트** — 모든 유닛 `applyCompliance()`(`src/lib/marketing-v2/core/compliance.ts`)
   통과 + `disclaimer{ko,en,ja}` 부착. 실패 유닛 폐기.
7. **기록** — `setInCache('wim:units:'+dateET, QuizUnit[], TTL)`. 폴백 큐(§5)로 최소 N개 보장.

**폴백(빈 날)**: ① 실제 L1 무버 → ② `getTodayTopic(date)`(`src/lib/marketing-v2/prepare/education.ts`
day-of-year 로테이션, 단 자문톤 스크럽 후) → ③ 휴장/주말=어제 무버 재방영+주말 프리즈. (글로서리
word-of-day·상록뱅크는 P2)

---

## 3. QuizUnit 스키마 (모든 텍스트 {ko,en,ja}) — `src/app/api/wim/types.ts`(신규)

```ts
type Loc<T=string> = { ko:T; en:T; ja:T };
type CauseCategoryId = 'own_earnings'|'peer_sector_news'|'analyst_action'   // L1(MVP)
  |'filing_8k'|'sector_rotation'|'macro'                                    // L2(P2)
  |'options_structure'|'insti_flow';                                        // L3(P3, 언락)
interface QuizUnit {
  id: string; type: 'daily_move';           // concept/8k/evergreen = P2
  dateET: string;                            // YYYY-MM-DD (ET)
  // STEM
  ticker: string; companyName: string; moveMagnitude: number; session: string;
  prompt: Loc;                               // "오늘 TSLA에 무슨 일이 있었나?" (방향 아닌 원인)
  // CHOICES
  choices: { id:string; categoryId:CauseCategoryId; label:Loc }[];  // 4개
  correctCategoryIds: CauseCategoryId[];     // 배열=부분정답 허용
  // REVEAL
  explanation: Loc;                          // ≤2문장, 원인 볼드
  boldTerm?: string;                         // 4단 용어 탭 타깃(P2)
  evidence?: { newsHeadline?: Loc; disclosure?: Loc };  // 영수증
  // META
  attributionPriority: number; difficultyLevel: 1|2|3;
  conceptRefs?: string[];                    // metricGlossary term ids(P2)
  confidence?: string; riskFlag?: string;    // 저장하되 UI 미노출(초보=투자신호 오독 방지)
  // COMPLIANCE
  disclaimer: Loc; compliancePassed: boolean;
}
```

---

## 4. 진짜 새로 저작할 것 = 딱 2개 테이블 (`src/app/api/wim/causeBank.ts` 신규)

1. **8카테고리 원인 뱅크**: `Record<CauseCategoryId, { label:Loc; distractors:CauseCategoryId[] }>`.
   모델=`disclosures.ts` PRIMARY_LABELS(10cat×3언어)의 구조·톤. MVP는 L1 3개만 채우면 됨.
2. **드라이버구문→(causeCategoryId, boldTerm) 사전**: `[{ re:/analyst|목표가|등급/i, cat:'analyst_action' }, { re:/earnings|실적|guidance/i, cat:'own_earnings' }, { re:/8-K|filing|공시/i, cat:'filing_8k' }, ...]`.
   MVP는 L1 매핑만.

**★ 컴플라이언스 실측 경고(WIM_DIRECTION §3-6)**: `education.ts` iv_percentile/pcr 영문 본문은
직접 조언("sell options"/"bearish, precede reversals")이고 **ko/ja엔 그 문장이 빠져 로케일 불균질**
→ "영어 무비용 재활용"은 거짓. **재사용하는 모든 필드는 3언어 사람 검수.** 관찰자 안전 정본
= `metricGlossary.ts`(24 term)만 드롭인.

---

## 5. 웹 UI (MVP) — `src/app/[locale]/wim/**` (신규, 단일 클라 페이지 + 컴포넌트)

**라우트/파일**:
- `page.tsx` — 퀴즈 화면(콜드오픈→오늘 유닛→4지선다 8초→리빌→스트릭). UC page.tsx의 셸 패턴
  (locale 부트스트랩 `router.replace`, 레이아웃 크롬 격리, SWR 클라 즉시페인트) 참조하되 **DOM 신규**.
- `/api/wim/today/route.ts` — `wim:units:{dateET}` 읽어 오늘 유닛 반환(+`_stale` 플래그). 생성 안 함.
- 온디바이스 상태(localStorage): `wim.streak`, `wim.history`, `wim.level`, `wim.interests`, `wim.locale`.

**컴포넌트(신규, 바이올렛 밝은 톤)**: MoverCard(로고+회사명+**추상 스파크라인**·방향색/화살표 제거),
CountdownRing(8s, 탭 정지), ChoiceButton(풀폭 세로 스택 ×4 — CJK 긴 라벨 때문에 2×2 금지, 3D 눌림),
Reveal(정답 초록채움+컨페티 / 오답 코럴+무처벌 / 부분정답), WhyCard(2문장·원인 볼드),
StreakBar(앰버 불꽃, 학습**일수**·정답수 아님), PullLadder(바텀시트: The Why→영수증 = MVP 1~2단).

**퍼스트런(3~4단계)**: 스플래시(계정없음) → **아하 모먼트**(즉시 오늘 실제 무버 웜업, 첫판 타이머 끔)
→ 3탭 미니설문(레벨/관심/푸시시간) → 커스텀 푸시 프라이머(iOS 시스템 프롬프트 전) + 연기가능 가입.

**컴플라이언스 UI(하드)**: 무버카드 방향 화살표·상승/하락 색 제거("+5%↑" 금지, "무슨 일?" 프레임),
confidence/riskFlag 수치 **미노출**, 질문은 항상 원인(why)만.

---

## 6. 재사용 맵 (실측 경로 — 신규 파이프라인 0)

| 쓰임 | 재사용 자산(경로) |
|---|---|
| 정답지 엔진 | `src/app/api/command/deep-analysis/route.ts` (POST, 강제 attribution 섹션) |
| 8-K 원인 택소노미 | `src/services/disclosures.ts` PRIMARY_LABELS(10cat×3언어) + `getOvernightHighlights()` |
| 개념 카드(관찰자 안전) | `src/components/app/metricGlossary.ts` (24 term ×3언어) |
| 트리거 라벨(P2) | `src/app/[locale]/intel/TriggerDefinitions.ts` (ko전용→en/ja 번역 필요) |
| 컴플라이언스 필터 | `src/lib/marketing-v2/core/compliance.ts` `applyCompliance()` |
| 일간 로테이터 | `src/lib/marketing-v2/prepare/education.ts` `getTodayTopic()` |
| 교육 레슨 카드(P2) | education-carousel 템플릿(Hook→개념→왜→읽는법→CTA) |
| SWR/즉시페인트 패턴 | `src/app/api/undercurrent/shared.ts` serveSWR + UC page.tsx localStorage 페인트 |
| 셸/빌드 인프라 | `uc-app/` 전체(Capacitor), JDK21+gradlew(android-release 메모), @capacitor/assets |
| 푸시/광고(P2)/리뷰/i18n | FCM, `src/services/adManager.ts`(P2), in-app-review, `src/messages/{ko,en,ja}.json` |
| 뉴스/money 소스 | `fetchMassive`(massiveClient), `fetchMoney`(undercurrent/shared) |

---

## 7. MVP 착수 순서 (Gate 통과 후, 이 순서로 코딩)
1. `wim-app/` 셸 복제 + config/아이콘/키스토어(빈 www로 부팅 확인).
2. `layout.tsx`에 `isWim` 격리 분기.
3. `src/app/api/wim/types.ts`(스키마) + `causeBank.ts`(L1 3카테고리 + 드라이버 사전).
4. `/api/cron/wim-bake` 베이커(무버선택→deep-analysis→태깅→선택지→compliance→`wim:units:{date}`).
   먼저 수동 호출로 하루치 유닛 실측 검증.
5. `/api/wim/today` 읽기 라우트.
6. `src/app/[locale]/wim/page.tsx` + 컴포넌트(코어 카드→리빌→스트릭) + localStorage 상태.
7. 퍼스트런 3~4단계 + 커스텀 푸시 프라이머.
8. 시뮬레이터 검증(콜드오픈→퀴즈→리빌→스트릭, 방향색/confidence 미노출 확인).
9. 스토어 에셋(이름/아이콘/스크린샷/키워드, Education 카테고리, 17+). **제출은 앞 2앱 안착 후**.
- **MVP 광고 OFF**(AdMob SDK 미배선). P2에 인터스티셜 1개(리빌 완료 이탈점, 하루 1캡).

## 8. App Store 4.3 릴리스 게이트 (스펙 §8 — 위반=리젝)
☑ 네이티브 퀴즈 UI(app-view/undercurrent DOM 재사용 0) ☑ 구조적으로 다른 IA(퀴즈 우선)
☑ 앱소유 온디바이스 상태(오프라인 "어제 복습") ☑ 자체 온보딩(파이낸스 것 재사용 0)
☑ 별도 번들ID·아이콘·이름·스크린샷·비중복 키워드 ☑ **네트워크 출처 분리(§0-2 결정)**.

## 9. 컴플라이언스 3금지(절대선): 예측 게임 메카닉 / 트랙레코드(P&L) / 필터 우회. 과거·현재 설명=OK,
미래·행동유발=금지. 스트릭=학습일수(정답콜 아님). 연령 17+.
