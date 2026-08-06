# 쇼츠 엔진 — 마스터 정본 (여기서 시작)

작성 2026-08-07 · **어떤 세션이 이어받아도 이 문서 하나로 재개 가능해야 한다**
연결: `SHORTS_WORKLOG_2026-08.md`(실수의 역사) · `SHORTS_RESEARCH_2026-08-07.md`(조사 원문)
· `SHORTS_TEMPLATE_SYSTEM.md`(대본 4단) · `VIDEO_ENGINE_SPEC.md`(렌더 인프라)

---

## 0. 대원칙 (대표 확정 2026-08-07)

1. **리모션 단독으로 완결된다.** 외부 도구가 없어도 게이트 통과 = 발행 가능.
   ```
   Layer 0  필수 · Remotion만     앱 캡처 · 절차 배경 · 카드 · 자막 · 콜아웃
   Layer 1  선택 · 무료           kling 영상 · 기존 broll 이미지
   Layer 2  선택 · 외부           ElevenLabs 음성 · Higgsfield 이미지/영상
   ```
2. **뉴스 이미지(언론사 사진)는 쓰지 않는다.** 대신 ①절차 배경(배경=데이터)
   ②헤드라인·매체명·시각의 «텍스트 인용»(source 블록) ③우리 앱 실화면.
3. **지표 나열 금지 — 대본(트리)이 반드시 있다.** 줄기 1개(one video, one idea),
   가지(증거)는 약→강, 모든 열린 질문은 닫는다.
4. **홍보이자 수익원.** 광고수익 요건은 §5. 경제적 본질은 앱 유입 깔때기 + Shorts RPM은 부수입.

## 1. 하루 루틴 (수동 1단계 → 자동화는 검증 후)

| 시각 (ET / KST) | 영상 | 소재 | 상태 |
|---|---|---|---|
| 07:30~08:30 / 20:30~21:30 | **T2 장시작 전** | 선물·프리마켓 무버(dash), 밤사이 공시(disclosures), FOMC 확률, 뉴스 다이제스트 | 대본 슬롯만 (템플릿은 공용) |
| 장중 비정기 | **T3 이벤트/지표** | 지표 발표·급변(브레이킹 엔진 연동 예정) | **후순위** (대표: 기본 틀 먼저) |
| 16:10~17:00 / 05:10~06:00 | **★ T4 장마감 브리핑** | 종가·섹터·크로스브리프, 당일 주인공 종목 옵션 북, 컨센서스 | **템플릿 완성 — 대본만 그날 캡처로** |

> ✅ **T4 1호 완료** (`SCRIPT_CLOSE` · BriefingClose · 8/6 마감 실측): «빨간 마감, 차분해진 옵션»
> — 지수 마감→VIX 역설→레짐 화면(RISK 43 콜아웃)→섹터→뉴스 인용(News Pulse)→무버(MU 페이드,
> 전편과 서사 연결)→매크로→다이얼 불일치(F&G 59.7 vs RISK 43). 장중판은 `SCRIPT_FLIP`.

## 2. 파이프라인 런북 (복붙용)

```bash
cd /Users/eunhoon/.gemini/antigravity/scratch/stock2

# ① 캡처 — PNG + «같은 순간» 텍스트(.txt). 대본 숫자는 반드시 .txt/PNG에서만.
SHOTS='[{"name":"signum-dash","path":"/en/app-view/dash","wait":13000},
        {"name":"<티커>-cmd","path":"/en/app-view/cmd?t=<티커>","wait":15000},
        {"name":"<티커>-flow","path":"/en/app-view/flow?t=<티커>","wait":15000}]' \
node scripts/capture-app-screens.mjs public/shorts/appshots

# ② 대본 — src/remotion/kit/scripts.ts 에 SCRIPT_XXX 추가 (SCRIPT_FLIP 을 복제·수정)
#    · 숫자 출처는 ①의 .txt — PNG에 보이는 지표는 PNG 표기 그대로
#    · 콜아웃 좌표는 PIL 로 사각형 그려 «먼저» 검증 (즉석 좌표 금지)
#    · Root.tsx 에 Composition 등록 (durationOf 가 길이 자동 계산)

# ③ 렌더
npx remotion render src/remotion/index.ts <CompositionId> out/<이름>.mp4 --log=error

# ④ 게이트 (통과 못 하면 발행 금지)
node scripts/video-ref-measure.mjs out/<이름>.mp4
#    기준: 길이 36~50s · 평균밝기 ≥25 · 밝은화소 ≥15% · 컷 ≥4/30s · 급변 ≤2

# ⑤ 프레임 눈검증 — 프레임0(썸네일급)·콜아웃·자막 위도우
# ⑥ 발행 = 사람 (업로드 자동화는 다음 단계)
```

## 3. 코드 지도

```
src/remotion/kit/
  spec.ts        수치 정본 — SAFE·CAPTION·PACE(훅3/컷3.0/증거4.5/CTA2/루프2.5)
                 ·LENGTH(36~50, 목표42는 상한 개념)·BACKDROP_FOR·HOOK_BACKDROP
  Backdrop.tsx   ★절차 배경 — series(가격곡선)/strikes(풋콜 사다리)/ticks/grid
                 + img/video. 결정론(시드 PRNG). 힉스필드 수확분은 video 로 꽂는다
  Briefing.tsx   템플릿 «하나» — 컷 플래시·톤 교대(컷 가시성)·펀치인(증거 씬 내부 분할)
                 ·consensus(인용 슬롯)·프레임0=썸네일급
  scripts.ts     대본들 — SCRIPT_T1(구·8/4)·SCRIPT_FLIP(정본 예시·8/6 실측)
src/remotion/components/AppShot.tsx
                 앱 캡처 크롭(픽셀 계산) + ★콜아웃: 라벨 필수·박스는 값 밖(outset 12)
scripts/capture-app-screens.mjs   헤드리스 캡처 + 같은 순간 .txt + 웹전용 광고 숨김
scripts/video-ref-measure.mjs     발행 게이트 (길이 게이트 포함)
```

### 레이아웃 정본 추가 (2026-08-07 대표 피드백)
- **실로고**(`public/app-icons/signum.png`)를 배너·CTA·하단 워터마크 3곳에 사용
- 상단: 배너-헤드 간격 확보 (Head top = SAFE.top-174, VIS_TOP = SAFE.top+40)
- **하단 존**(SAFE.bottom 아래 25%): 플랫폼 UI에 덮여도 되는 것만 — 워터마크 + 티커 테이프
  (`props.tape`, 값은 캡처 .txt 실측). 테이프는 mod 래핑 금지(이음매 점프) — 선형 이동 + 4반복.
- 로고 프록시: 없는 티커 로고는 `curl signumhq.com/api/logo/<T> > public/shorts/logos/<T>.png`

## 4. 자산 역할 (대표 확정)

| 자산 | 역할 | 상태 |
|---|---|---|
| **로고** (public/shorts/logos: MU·NVDA·AAPL·AVGO·SNDK·SPY) | logos 블록 + 브랜드 워터마크 | 보유 — 부족분은 로고 프록시로 추가 |
| **ElevenLabs** (Creator 플랜 보유·33.5만 크레딧) | `beat.say` 배열 → TTS. 낭독 실측 길이로 컷 재조정 | 🔑 내일 키 → §7 착지 |
| **Higgsfield Plus** (가입 예정) | 무제한 이미지(Flux.2 Pro·Seedream·Nano Banana)로 broll 보강 = «부족분 채우기» 역할 | 🔑 내일 |
| **Seedance 2.5 무제한 (8/8~8/15)** | ★수확 주간: 로고 박힌 앱 홍보 클립·브랜드 b-roll **30~50개 대량 생성 → 라이브러리화** | §6 계획 |
| **kling_terminal.mp4** (5.04s) | 훅/루프백의 유일한 실사 무빙 배경 (Loop 로 재생) | ✅ 오늘부터 사용 |

## 5. 조사 확정 사항 (2026-08-07, 7에이전트 적대검증 — 원문 `SHORTS_RESEARCH_2026-08-07.md`)

**수익화 (확정)**
- 광고 수익쉐어: **구독 1,000 + 90일 Shorts 뷰 1,000만** (쇼츠 시청은 4,000시간에 안 잡힘 → 실질 경로는 이것뿐)
- 500구독 조기 티어는 팬펀딩만 — 광고수익 없음
- Shorts RPM $0.03~0.10/1천뷰, **시청자 국가가 단가 결정** → en 콘텐츠·미국 시청 전제
- **BGM 유무는 내 수령액과 무관**(공식) → 음악 결정은 리텐션 기준으로만
- reused-content 판정이 최대 리스크 → **자체 데이터·자체 렌더**가 곧 독창성 증빙 (우리 구조 그대로)

**이미 반영한 것** ✅
| 항목 | 반영 |
|---|---|
| 컷 2~4초 대역 | beatSec 3.2→3.0 |
| CTA ≤2초, 페이오프 직후 컷 | ctaSec 4→2 |
| 증거 씬(4.5s) 내부 분할 | 2초 시점 펀치인 106% + 콜아웃 점등 |
| 첫 프레임 = 썸네일 (커스텀 썸네일 불가) | 훅 문장 프레임0부터 완전 표시 |
| 컷이 눈에 읽히게 | 비트 경계 5f 플래시 + 톤 교대 1↔1.6 |
| 루프백(리플레이=조회수) | loopSec 2.5 유지 |

**다음에 반영할 것** ⏳
- 등락 색에 화살표/± 제2채널 강제(적록색각 8%) — versus/rows 블록에 부호는 이미 있음, 화살표 추가 검토
- 열린 질문 린트: 대본의 모든 ask 가 다음 비트에서 닫히는지 자동 검사
- 증거 약→강 정렬 규칙을 대본 작성 지침에 명문화
- 42초는 «상한» 개념 — 아이디어가 30초에 끝나면 30초로 출고

## 6. Seedance 수확 주간 계획 (8/8~8/15)

1. 프롬프트 20종 준비: ①SIGNUM 로고 리빌(금·다크) ②터미널/차트룸 앰비언스 ③데이터 스트림
   ④세 앱 아이콘 모션 ⑤앱 목업 손 위 클립 — 각 5~10s · 9:16
2. 생성 30~50클립 → `public/shorts/broll/video/` + 파일명 규약 `sd25_<주제>_<n>.mp4`
3. `BACKDROP_FOR` 의 video 항목 확장 + 훅/브랜드 로테이션
4. **앱 홍보영상 1편**(대표 지시): 실앱 캡처 + Seedance 전환컷 조합, 같은 게이트 통과 후 납품
5. 라이선스·생성일 기록 남길 것 (reused-content 방어)

## 7. 내일 키 도착 시 착지 지점

**ElevenLabs** — `.env.local` 에 `ELEVENLABS_API_KEY` (대표가 직접. 채팅 금지)
1. `scripts/tts-beats.mjs` 신설: SCRIPT_XXX 의 `hook.line→say[]→outro.ask` 순서로 TTS → `public/shorts/audio/<script>/<n>.mp3`
2. Briefing 에 `<Audio>` 트랙 + **낭독 실측 길이가 컷 길이의 정답이 된다** (msFor 추정치 대체)
3. 보이스: 영어 남성 저음 1개 고정(브랜드 일관성) — 선정은 대표 확인

**Higgsfield** — MCP `mcp.higgsfield.ai/mcp` (API 키 불필요, 계정 연결)
1. 연결 확인 → Seedance 2.5 가용 확인(8/8 개시) → §6 수확 시작

## 8. 절대 규칙 (누적 — 위반 시 발행 금지)

1. 게이트 미통과 영상 발행 금지 (길이 36~50 포함)
2. **대본 숫자는 캡처 .txt/PNG 에서만** — 같은 지표 숫자 두 개 금지
3. 콜아웃: **라벨 없는 박스 금지** · 박스가 값을 덮으면 안 됨 · 좌표는 PIL 로 선검증
4. 앱 캡처 크롭은 `AppShot.tsx` 외 금지 / 자막은 자르지 않는다(폰트 축소)
5. 컴플라이언스: 관찰형만 · 예측 프레이밍 0 · 매수매도 0 (`BUFFER_OPS` §0)
6. 새 기준은 «좋은 레퍼런스»에 먼저 걸어본다
7. `git add -A` 금지
8. 프레임 0 = 썸네일 — 훅 문장이 프레임 0에 완전히 보여야 한다
