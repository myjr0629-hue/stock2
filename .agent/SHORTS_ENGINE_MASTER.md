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

## 6. Seedance 수확 주간 계획 (8/8~9/9, 실측 33일)

1. 프롬프트 20종 준비: ①SIGNUM 로고 리빌(금·다크) ②터미널/차트룸 앰비언스 ③데이터 스트림
   ④세 앱 아이콘 모션 ⑤앱 목업 손 위 클립 — 각 5~10s · 9:16
   프롬프트 문법 정본 = `.agent/SEEDANCE_PROMPT_GUIDE.md` (공식 문서 조사판)
2. 생성 30~50클립 → `public/shorts/broll/video/` + 파일명 규약 `sd25_<주제>_<n>.mp4`
3. `BACKDROP_FOR` 의 video 항목 확장 + 훅/브랜드 로테이션
4. ✅ **SIGNUM 광고 1편 완성 (2026-08-08)** — `out/ad-signum.mp4` 30.5s · GATE PASS
   레시피: `kit/AdPromo.tsx`(광고 템플릿) + `kit/ads.ts`(AD_SIGNUM 7씬: 시네3·실앱3·엔드카드)
   + 시덴스 3클립(sd25_whale/trader/phone_glow, 화면 비노출 각도) + Adam 보이스 7줄
   (`node scripts/tts-ads.mjs SIGNUM` → voice-adsignum.ts 자동). UC/WIM 은 대본만 갈아끼우면 됨.
   광고 마감 노하우: ①어두운 시네 컷은 CutFlash 5f + 스크린블렌드 리프트(#9FB8D8 8.5%)로
   게이트 통과 ②씬0 클레임은 instant(프레임0=쇼츠 썸네일) ③앱 줌은 문장을 자르지 않는 폭으로
5. 라이선스·생성일 기록 남길 것 (reused-content 방어)
5-2. ★★ **아트디렉션 캐넌 v2 = BRIGHT (2026-08-08 대표 강명령)** — «시네마틱≠다크».
   생성물은 밝은 실사 + 내용(기업→산업 모티프/섹터/레짐) 매칭 + 이미지가 정보 전달.
   다크 무드 기본값 전면 폐기. 정본 = SEEDANCE_PROMPT_GUIDE.md §0 +
   주제별 완성 프롬프트 41종 = PROMPT_LIBRARY.json (적대검수 8건 교정: 애플 매장
   트레이드드레스 등). 시연 검증 완료: sd25_riskon_morning.mp4(골든아워 금융가, A급) ·
   밝은 팹 이미지는 **실로고(ASML)가 그려져 폐기**(_LOGOFAIL) →
   ★ «no logos» 지시로도 실로고가 나온다 — **생성 후 실로고·글자 검출이 검수 필수 단계**.
   웹 컴포저 함정 추가: 첨부 레퍼런스가 다음 제출에도 남는다 — 새 제출 전 References 비우기 확인.
6. ★ **무제한은 웹 UI 전용 (실측 2회 + 결정적 증거로 확정)** — MCP 는 `use_unlim` 거부 +
   크레딧 과금 (시덴스 2.5 = 32.5크레딧/5s. 광고 3클립 = 97.5 지출, 잔액 1,017.5).
   결정타(2026-08-08): 구독 페이지에 **Nano Banana 2 Unlimited 가 Active 인 상태에서**
   MCP `use_unlim` 이 거부됨(이미지 NB2·영상 SD2.0 Mini 둘 다, 거부는 무과금) —
   웹 수당은 MCP 로 전파되지 않는다. **대량 수확 = 웹 자동화**(§7 노하우), MCP = 잡 회수·소량용.
7. ★ **웹 무제한 보유 인벤토리 (구독 페이지 실화면 2026-08-08)** — 시덴스만이 아니다:
   · 영상: **Seedance 2.5** (33일, 720p, ~9/9) — 무제한 1회 생성 상한 ≈15s(대표 확인, 첫 제출 때 실측)
   · 이미지 한정: **Nano Banana 2 (2k)** — ⚠️ **8/14 마감 (7일 한정)** → 이미지 수확 최우선
   · 이미지 연중(자동갱신): FLUX.2 Pro(1k) · GPT Image · Seedream 4.5 · Seedream 5.0 Lite ·
     Kling O1 Image · Nano Banana → 백드롭/훅 이미지의 상시 무제한 공급원
   수확 파이프라인: 웹 제출(무제한) → MCP 잡 리스트로 result_url 회수(무과금, 오늘 광고
   3클립이 이 경로) → curl 다운로드. MCP 회수 불가 시 웹 다운로드 폴백(`_min.webp` 노하우).
8. ★ **웹 자동화 E2E 완전 검증 (2026-08-08) — 실전 투입 가능 판정.** 3종 풀사이클 통과:
   ① 영상 t2v: 컴포저 → Unlimited ON → 9:16/720p/5s 제출 → 완성 → MCP 회수 → 다운로드 ✅
   ② 이미지 NB2: ∞ Unlimited ON → 9:16 제출 → 완성 → 회수 ✅ (`hf_whale_aerial.png`, 품질 A급)
   ③ Extend: 소스=라이브러리 클립 장착 → 모델 자동 «2.5 Extend» 전환 → Unlimited ON → 제출 ✅
   **전 과정 무과금 실증: 잔액 1,017.5 불변.**
   **운영 런북 (순서 고정):**
   1) 작업창 브라우저 `/flow/video/prompt?model=seedance_2_5` (이미지=`/flow/image/prompt`)
   2) 로그인 확인 — 랜딩에 «Sign up» 보이면 대표 호출 (세션은 앱 재시작 때 리셋됨. 컴포저가
      열려도 **Unlimited 토글이 안 보이면 로그아웃 상태**다)
   3) 프롬프트 = ref 클릭 → 실타이핑 (form_input 무효). 이미지 컴포저는 타이핑 시 «확장
      에디터»가 덮일 수 있음 → 접기 버튼(ref)으로 접고 진행
   4) 모델·비율 등 드롭다운 = **read_page 로 option ref 잡아 클릭** (좌표 클릭은 패널 리사이즈
      때 빗나감 — 실측 2회)
   5) ★ **Unlimited 토글 ON → Generate 버튼이 «Unlimited» 배지인지 «확인 후» 클릭.**
      크레딧 숫자가 보이면 절대 클릭 금지 (과금 가드)
   6) 회수 = MCP `show_generations` (계정 전체 히스토리 + rawUrl/minUrl) → curl.
      업로드 = MCP `media_upload` → PUT → `media_confirm` (i2v 참조용 media_id)
   7) 패널은 자동화 동안 **열어둬야 함** (숨기면 computer 액션 타임아웃 — 실측)
   ③-검증: Extend 결과 = 소스 종점에서 정확히 이어짐(연속성 A급) · 9:16 유지 ·
   **단 히스토리 메타데이터가 16:9 로 오기록됨 — 판정은 반드시 실파일 ffprobe 로** ·
   Extend 소요 ~6분(t2v 5s 는 ~3분) · 최종 무과금 재확인(잔액 1,017.5 · 총 4회 검증)
   **주의:** 이미지 «Uploads» 픽커 탭에 MCP 업로드분이 안 보였음(참조는 media_id 로 가능) ·
   NB2 백엔드 SKU=nano_banana_flash · 플로어 클립처럼 «스크린 흐림» 지시도 흐릿한 데이터
   표가 그려질 수 있음 — 광고 사용 전 클립별 판독 불가 확인 필수 · Extend 는 elements
   참조를 이미지/오디오 50개까지 받음(로고 스틸 연계 여지)

## 7. 내일 키 도착 시 착지 지점

**ElevenLabs** — ✅ **연결 완료 (2026-08-07)**
- 키 위치: `.env.local` `ELEVENLABS_API_KEY` (⚠️ 처음 발급 키가 «권한 없음» 401 —
  키 생성 시 **Text to Speech 권한**을 켜야 한다. 재발급으로 해결)
- `scripts/tts-beats.mjs`: `node scripts/tts-beats.mjs CLOSE` →
  `public/shorts/audio/close/*.mp3` + `src/remotion/kit/voice-close.ts` 자동 생성.
  같은 문장은 재굽지 않음(캐시=.txt 대조) → 크레딧 절약. 대본만 바꾸면 바뀐 문장만 굽는다.
- Briefing `voice` prop: **낭독 실측 + 0.35s 숨**이 컷 길이의 정답 (timingOf).
  1호 실측: 낭독 45.1s → 영상 48.6s (상한 50s 아래 — 낭독 합계가 46s 넘으면 대본을 줄인다)
- 보이스 = **Daniel**(onwK4e9ZLuTAKqWW03F9, 앵커 톤) 고정 — 교체는 대표 승인 후 tts-beats 만

**Higgsfield** — ✅ **Plus 가입 + 1차 수확 완료 (2026-08-07)**
- MCP: claude.ai 커넥터 연결됨(웹 채팅용) + **Claude Code 에도 등록됨**(~/.claude.json,
  다음 세션부터 도구로 뜸 — 첫 호출 때 브라우저 인증 한 번)
- 이 세션은 작업창 브라우저로 웹 UI 를 몰아 수확했다. 실측 노하우:
  · 랜딩(/ai/image)의 모델·비율 칩은 «장식» — 클릭 무반응. 프롬프트+Generate 만 동작
  · 프롬프트는 form_input 이 아니라 **ref 클릭 → 실타이핑** (React 상태 때문)
  · 결과 원본은 403, **`_min.webp`(896×1200)는 인증 없이 다운로드** 가능
    (img src 의 cloudfront url 파라미터에서 추출)
  · **병렬 제출**이 됨 — 기다리지 말고 연속 Generate (Plus 6병렬)
  · NB Pro ✦2/장. 1차 6장 = 12크레딧 (잔여 ~1,190)
- 수확분 = `public/shorts/broll/hf/` + spec.ts `HF` 상수 (⚠️ darkpool 은 가짜 숫자 — 사용 금지 표기)
- 골드 터널이 브랜드 아웃트로 정본으로 승격 (BACKDROP_FOR.brand)
- **8/8 시덴스 2.5 열림** → §6 계획대로 «영상» 수확. ⚠️ 단 무제한은 **웹 UI 전용**(§6-6 실측)
  — MCP 로 돌리면 크레딧이 나간다. 대량 수확은 웹 자동화로.

## 8. 절대 규칙 (누적 — 위반 시 발행 금지)

1. 게이트 미통과 영상 발행 금지 (길이 36~50 포함)
2. **대본 숫자는 캡처 .txt/PNG 에서만** — 같은 지표 숫자 두 개 금지
3. 콜아웃: **라벨 없는 박스 금지** · 박스가 값을 덮으면 안 됨 · 좌표는 PIL 로 선검증
4. 앱 캡처 크롭은 `AppShot.tsx` 외 금지 / 자막은 자르지 않는다(폰트 축소)
5. 컴플라이언스: 관찰형만 · 예측 프레이밍 0 · 매수매도 0 (`BUFFER_OPS` §0)
6. 새 기준은 «좋은 레퍼런스»에 먼저 걸어본다
7. `git add -A` 금지
8. 프레임 0 = 썸네일 — 훅 문장이 프레임 0에 완전히 보여야 한다
