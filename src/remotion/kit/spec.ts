// ============================================================================
// kit/spec — 쇼츠 템플릿의 «수치 정본». 감으로 정하지 않는다.
// ----------------------------------------------------------------------------
// 전부 조사·실측 근거가 붙어 있다. 바꿀 때는 근거를 같이 바꾼다.
// ============================================================================

/** 캔버스 */
export const CANVAS = { w: 1080, h: 1920, fps: 30 } as const;

/**
 * ── 안전 영역 (2026-08-06 조사) ─────────────────────────────────────────────
 * "자막은 화면 «중앙 1/3»에. 상단 20%는 제목·채널명이, 하단 25%는
 *  좋아요·댓글·공유 버튼이 덮는다."
 * ⚠️ 내 V1~V7은 자막을 «하단»에 뒀다. 유튜브 UI에 가려지는 자리다.
 */
export const SAFE = {
  topPct: 0.20,      // 이 위로는 플랫폼 UI(제목·채널)
  bottomPct: 0.25,   // 이 아래는 좋아요·댓글·공유 버튼
  get top() { return Math.round(CANVAS.h * this.topPct); },      // 384
  get bottom() { return Math.round(CANVAS.h * (1 - this.bottomPct)); }, // 1440
} as const;

/**
 * ── 자막 (2026-08-06 조사) ──────────────────────────────────────────────────
 * · 1080×1920 에서 **64~88px** 이 가장 잘 읽힌다 (다른 출처 60~75px, 70pt 스위트스팟)
 * · 한 줄 **24~28자**, 최대 2줄
 * · 블록당 **1.5~3초** (글자수에 비례)
 * · 산세리프 + **반투명 어두운 배경 바**가 외곽선·그림자보다 일관되게 낫다
 * · 오디오보다 **0.1~0.3초 먼저** 뜬다
 * ⚠️ V7 실측: 36px · 50자+ · 7.8초 = 세 항목 모두 최적에서 크게 벗어나 있었다.
 */
export const CAPTION = {
  size: 74,              // 64~88 중앙값
  lineHeight: 1.22,
  maxCharsPerLine: 26,   // 24~28
  maxLines: 2,
  minMs: 1500,
  maxMs: 3000,
  /** 오디오보다 먼저 뜨는 양 */
  leadMs: 200,
  /** 글자수 → 노출시간. 한국어/영어 공통으로 «읽는 속도» 기준 */
  msFor(text: string) {
    const n = text.replace(/\s/g, '').length;
    const ms = 700 + n * 62;                 // 26자 ≈ 2.3초
    return Math.min(this.maxMs, Math.max(this.minMs, ms));
  },
  /** 26자 기준 줄바꿈 — 단어를 자르지 않는다 */
  wrap(text: string) {
    const words = text.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > this.maxCharsPerLine && cur) { lines.push(cur.trim()); cur = w; }
      else cur = (cur + ' ' + w).trim();
    }
    if (cur) lines.push(cur);
    return lines;   // ★ 자르지 않는다. 넘치면 호출부가 «글자를 줄인다»
  },
  /** 줄 수가 넘치면 폰트를 줄여 «문장을 살린다». 말을 잘라먹는 것보다 낫다. */
  sizeFor(lineCount: number) {
    if (lineCount <= this.maxLines) return this.size;
    if (lineCount === 3) return Math.round(this.size * 0.82);   // 61
    return Math.round(this.size * 0.70);                         // 52
  },
} as const;

/**
 * ── 진행 속도 ───────────────────────────────────────────────────────────────
 * 레퍼런스 실측: 경제사냥꾼 2.9~3.3초/컷 · TIGER ETF 6.3초/컷
 * 조사: 첫 1~3초가 재생 여부를 결정 / 패턴 인터럽트가 리텐션을 올린다
 * ⇒ 우리 기준: 훅은 짧게, 본문은 3초대, 증거 컷만 조금 길게.
 */
export const PACE = {
  hookSec: 3.0,
  // [2026-08-07 조사반영] 교차 확인된 권고 대역 2~4초의 중앙. 3.2→3.0.
  beatSec: 3.0,        // 일반 컷
  // 증거 컷 4.5초는 전 소스 권고(≤3초) 초과 → 씬 «내부» 펀치인으로 분할한다(Briefing).
  proofSec: 4.5,       // 앱 화면·차트처럼 «읽을 게 있는» 컷
  // [2026-08-07 조사반영] CTA는 페이오프 직후 «즉시 컷»이 정석, 영상 내 CTA ≤2초.
  // 4→2. 남는 시간은 늘리지 않는다 — one idea ends, video ends.
  ctaSec: 2.0,
  loopSec: 2.5,        // 루프백(엔딩→오프닝 회귀)은 유지 — 리플레이가 조회수로 집계된다
} as const;

/**
 * ── 총 길이 (2026-08-07 확정) ───────────────────────────────────────────────
 * 26.8초(KIT 1차)는 4단 중 CTA가 눌렸다. 4단(훅·전개·증거·CTA)이 다 사는
 * 최소치가 38~48초 → 표준 42초. 발행 게이트도 이 범위를 강제한다.
 * 대본 산수: 훅3 + CTA4 + 루프2.5 = 9.5초 고정 → 본문 비트 ≈ 32.5초
 * = 일반컷(3.2s)·증거컷(4.5s) 섞어 «8비트 안팎».
 */
export const LENGTH = { targetSec: 42, minSec: 36, maxSec: 50 } as const;

/**
 * ── 4단 대본 프레임 (팔란티어편 실측 비율) ─────────────────────────────────
 */
export const ARC = { hook: 0.10, problem: 0.40, proof: 0.30, cta: 0.20 } as const;

/** ── 팔레트 ─────────────────────────────────────────────────────────────── */
export const C = {
  ink: '#FFFFFF',
  head: '#FFB020',
  hot: '#FF5C74',
  cool: '#3DE38F',
  faint: 'rgba(216,226,242,0.66)',
  panel: 'rgba(8,13,22,0.74)',
  line: 'rgba(255,255,255,0.22)',
  capBg: 'rgba(8,12,20,0.86)',   // 조사: 반투명 어두운 바가 외곽선보다 낫다
} as const;

/**
 * ── 배경 «의미» 사전 ────────────────────────────────────────────────────────
 * 대표 지적: "배경이 가장 큰 문제. 이야기의 흐름과 맞는 배경이어야 한다."
 * 지금까지는 broll 16장을 «순서대로 돌려쓰기»만 했다 — 내용과 무관했다.
 * → 컷의 «역할»에 배경을 매핑한다. 대본이 배경을 고른다.
 */
export type BeatRole =
  | 'market'      // 시장 전체·지수
  | 'chips'       // 반도체·하드웨어
  | 'money'       // 자금 흐름·플로우
  | 'conflict'    // 모순·정반대
  | 'evidence'    // 자료·증거
  | 'depth'       // 다크풀·보이지 않는 층
  | 'verdict'     // 판정·결론
  | 'brand';      // 아웃트로

/** (구판 — AI broll 이미지 매핑. 절차 배경 도입 후 폴백/액센트로만 유지) */
export const BG_FOR: Record<BeatRole, string> = {
  market: 'shorts/broll/v25_scene6_dashboard.png',   // 트레이딩 플로어
  chips: 'shorts/broll/product_reveal.png',          // 회로기판
  money: 'shorts/wall_broll_v4_tall.png',            // 캔들·자금
  conflict: 'shorts/broll/pressure_compression.png', // 빨강↔청록 대비
  evidence: 'shorts/broll/hook_wall.png',            // 데이터 벽 앞 사람
  depth: 'shorts/broll/v25_scene2_darkpool.png',     // 청록 데이터 스트림
  verdict: 'shorts/broll/v25_scene1_hook.png',       // 골든 실드
  brand: 'shorts/broll/v25_scene7_outro.png',        // 골든 광선
};

/**
 * ── ★ 절차 배경 사전 (2026-08-07) — 배경 자체가 데이터 ──────────────────────
 * 대표 방침: "리모션만으로 완벽한 틀. 뉴스 이미지 금지."
 * 스톡·AI 이미지는 «분위기»만 맞지만, 절차 배경은 내용과 100% 일치한다:
 * 돈 이야기 컷의 배경은 가격 곡선이고, 모순 컷의 배경은 풋/콜 사다리다.
 * 값 = kit/Backdrop 의 BackdropSpec. img/video 는 액센트(훅·아웃트로)로만.
 * 힉스필드 수확분(8/8~)이 오면 video 항목이 늘어난다.
 */
export const BACKDROP_FOR = {
  market: { kind: 'grid', accent: 'cool' },
  chips: { kind: 'ticks', accent: 'cool' },
  money: { kind: 'series', accent: 'cool' },
  conflict: { kind: 'strikes', accent: 'clash' },
  evidence: { kind: 'grid', accent: 'amber' },
  depth: { kind: 'ticks', accent: 'hot' },
  verdict: { kind: 'series', accent: 'amber' },
  // [2026-08-07] 힉스필드 1차 수확분으로 업그레이드 (NB Pro, 브랜드 톤 통일)
  brand: { kind: 'img', src: 'shorts/broll/hf/hf_gold_tunnel.png' },
} as const;

/**
 * ── 힉스필드 수확 라이브러리 (2026-08-07 1차 · NB Pro · 각 ✦2, 총 12크레딧) ──
 * 역할별 «액센트» 이미지 — 훅/아웃트로/특수 비트에서 bg 로 지정해 쓴다.
 * ⚠️ hf_darkpool 은 AI 가 그린 «가짜 시세 숫자»(¥23,000·+4.5% 등)가 보인다 —
 *    숫자 나오는 비트 뒤에 깔면 «같은 지표 숫자 두 개 금지» 규칙과 충돌. 사용 주의.
 */
export const HF = {
  terminalNight: 'shorts/broll/hf/hf_terminal_night.png', // 다크 터미널룸 (훅 대안)
  clash: 'shorts/broll/hf/hf_clash.png',                  // 레드↔틸 대치 (conflict 액센트)
  wafer: 'shorts/broll/hf/hf_wafer.png',                  // 반도체 웨이퍼 (chips 액센트)
  dawn: 'shorts/broll/hf/hf_dawn.png',                    // 새벽 스카이라인 (★T2 장시작전 훅)
  goldTunnel: 'shorts/broll/hf/hf_gold_tunnel.png',       // 골드 터널 (브랜드 아웃트로 정본)
  darkpoolRisky: 'shorts/broll/hf/hf_darkpool.png',       // ⚠️ 가짜 숫자 — 기본 사용 금지
} as const;

/** 훅 전용 — 유일하게 «움직이는 실사» (kling 5.04s, 지금까지 안 쓰이던 자산) */
export const HOOK_BACKDROP = { kind: 'video', src: 'shorts/broll/kling_terminal.mp4' } as const;

/** 검수 게이트와 같은 기준(scripts/video-ref-measure.mjs) */
export const GATE_HINT = {
  minMeanBrightness: 25,
  minLitPct: 15,
  cutsPer30s: 4,
  shotMinBrightness: 18,
  maxBigJumps: 2,
} as const;
