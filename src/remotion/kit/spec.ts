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
  beatSec: 3.2,        // 일반 컷
  proofSec: 4.5,       // 앱 화면·차트처럼 «읽을 게 있는» 컷
  ctaSec: 4.0,
  loopSec: 2.5,
} as const;

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

/** 검수 게이트와 같은 기준(scripts/video-ref-measure.mjs) */
export const GATE_HINT = {
  minMeanBrightness: 25,
  minLitPct: 15,
  cutsPer30s: 4,
  shotMinBrightness: 18,
  maxBigJumps: 2,
} as const;
