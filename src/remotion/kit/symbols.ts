// ============================================================================
// kit/symbols — 티커 «심볼» 해석기 (정본: .agent/SHORTS_FRAMEWORK_V3.md §1-3, §4)
// ----------------------------------------------------------------------------
// 대표 지시(2026-08-10): "모든 티커에 심볼도 같이 넣어 그래픽적으로 괜찮게."
// 심볼은 1초 안에 «무엇인지» 전달하는 가장 강한 장치라 숫자 옆에 항상 붙는다.
//
// 규칙 3가지 (어기면 오히려 신뢰를 깎는다):
//  ① 심볼 이미지는 «우리 파일»만 — public/shorts/logos/* (로고 프록시 수확분).
//     AI 는 어떤 로고도 그리지 않는다(상표).
//  ② ETF 발행사 마크는 «지수»로 쓰지 않는다 — SPY·DIA·GLD 는 전부 State Street
//     마크가 와서 서로 구별이 안 되고(실측), IWM·TLT 는 iShares 마크다.
//     → 지수·상품은 앱이 이미 쓰는 «배지» 문법(NDX·500·DJI·VIX)으로 그린다.
//  ③ 파일이 없으면 결정론적 모노그램 칩 — 화면에 빈칸이 절대 없다.
// ============================================================================

/** 심볼 해석 결과 — TickerMark 가 이걸 보고 그린다 */
export type SymbolRef =
  | { kind: 'logo'; src: string; label: string }        // 우리 파일의 실 로고
  | { kind: 'glyph'; text: string; hue: number; label: string }; // 배지/모노그램

/** 수확 완료된 로고 파일 (public/shorts/logos). 확장자가 섞여 있어 명시한다. */
const LOGO_FILES: Record<string, string> = {
  AAPL: 'AAPL.png', AMD: 'AMD.png', AMZN: 'AMZN.svg', AVGO: 'AVGO.png',
  BA: 'BA.png', CAT: 'CAT.png', COIN: 'COIN.png', COST: 'COST.png',
  GOOGL: 'GOOGL.png', INTC: 'INTC.png', JPM: 'JPM.png', LLY: 'LLY.png',
  META: 'META.png', MSFT: 'MSFT.png', MU: 'MU.png', NFLX: 'NFLX.png',
  // ★ 2026-08-19 추가 — 유입 검색어의 «90%가 티커»였다 (AMD 45 · BROADCOM 17 · SANDISK 11 · MICRON 8).
  //   반도체 확장(파운드리·장비) + 주요 ETF 를 미리 채워둔다.
  TSM: 'TSM.png', ASML: 'ASML.png', QCOM: 'QCOM.png', MRVL: 'MRVL.png',
  TXN: 'TXN.png', WDC: 'WDC.png', LRCX: 'LRCX.png', AMAT: 'AMAT.png', KLAC: 'KLAC.png',
  SPY: 'SPY.png', QQQ: 'QQQ.png', IWM: 'IWM.png', DIA: 'DIA.png', GLD: 'GLD.png', TLT: 'TLT.png',
  NVDA: 'NVDA.png', PLTR: 'PLTR.png', SMCI: 'SMCI.png', SNDK: 'SNDK.png',
  SPCX: 'SPCX.png', TSLA: 'TSLA.png', UNH: 'UNH.png', XOM: 'XOM.png',
  // [2026-08-12] 자원·광산 — 로고 프록시로 받음: curl signumhq.com/api/logo/<T>
  // 모노그램 폴백(분홍 글자 타일)이 구리 배경과 색이 부딪혀 썸네일이 죽었다.
  FCX: 'FCX.png', SCCO: 'SCCO.png', COPX: 'COPX.png',
  // [2026-08-17] 소매 — 소매 실적 주간(WMT·TGT·HD)을 다루는데 셋 다 없어서
  // 배지(DJI·500)로 때웠다. 종목 편에 «그 종목 심볼»이 없으면 안 된다.
  WMT: 'WMT.png', TGT: 'TGT.png', HD: 'HD.png',
};

/**
 * ★ 히어로(SYM.hero=460px) 로 «크게» 써도 되는지 — 로고 «유형»이 가른다.
 *   2026-08-17 실측 (100x100 원본을 400px 로 확대해 비교):
 *     · 심볼형(단순 도형)  WMT 스파크 · TGT 과녁 · AAPL · NVDA → 4배에도 «깨끗»
 *     · 워드마크형(글자)   HD · COST · 대부분의 wordmark      → 4배에 «뭉갠다»
 *   그래서 「로고 프록시는 100x100 이라 키우면 뭉갠다」는 종전 메모는 절반만 맞다.
 *   워드마크 종목이 주인공이면 hook.syms 를 쓰지 말고 배지·큰 숫자로 간다.
 */
export const WORDMARK_LOGOS = new Set(['HD', 'COST', 'UNH', 'XOM', 'JPM', 'LLY']);

/**
 * 발행사 마크라 «종목 식별»이 안 되는 티커 — 로고가 파일에 있어도 쓰지 않는다.
 * 실측: SPY.png ≡ DIA.png ≡ GLD.png (State Street) · IWM.png ≡ TLT.png (iShares)
 */
const AMBIGUOUS = new Set(['SPY', 'DIA', 'GLD', 'IWM', 'TLT', 'QQQ', 'VIX']);

/** 지수·상품·매크로의 배지 표기 — 앱 화면(Market Pulse)의 배지 문법 그대로 */
const GLYPH: Record<string, { text: string; hue: number }> = {
  NASDAQ: { text: 'NDX', hue: 205 }, NASDAQ100: { text: 'NDX', hue: 205 },
  NDX: { text: 'NDX', hue: 205 }, QQQ: { text: 'NDX', hue: 205 },
  SP500: { text: '500', hue: 355 }, SPX: { text: '500', hue: 355 },
  SPY: { text: '500', hue: 355 },
  DOW: { text: 'DJI', hue: 220 }, DJI: { text: 'DJI', hue: 220 }, DIA: { text: 'DJI', hue: 220 },
  RUSSELL: { text: 'R2K', hue: 265 }, RUSSELL2K: { text: 'R2K', hue: 265 }, IWM: { text: 'R2K', hue: 265 },
  VIX: { text: 'VIX', hue: 12 },
  SOX: { text: 'SOX', hue: 275 }, SOXX: { text: 'SOX', hue: 275 }, SOXL: { text: 'SOX', hue: 275 },
  GOLD: { text: 'AU', hue: 44 }, GLD: { text: 'AU', hue: 44 },
  OIL: { text: 'WTI', hue: 28 }, WTI: { text: 'WTI', hue: 28 },
  BTC: { text: '₿', hue: 36 },
  US10Y: { text: '10Y', hue: 190 }, TLT: { text: '10Y', hue: 190 },
  US30Y: { text: '30Y', hue: 200 }, TYX: { text: '30Y', hue: 200 },
  MTG: { text: 'MTG', hue: 20 }, MORTGAGE: { text: 'MTG', hue: 20 },
  FED: { text: 'FED', hue: 210 }, FOMC: { text: 'FED', hue: 210 },
  CPI: { text: 'CPI', hue: 30 }, JOBS: { text: 'JOBS', hue: 150 },
  RISK: { text: 'RISK', hue: 40 }, RLSI: { text: 'RLSI', hue: 40 },
  FEARGREED: { text: 'F&G', hue: 140 },
};

/** 라벨 정규화 — 'S&P 500 F', 'NASDAQ100 F', 'Fear & Greed' 같은 표기 흡수 */
function normalize(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\bFUT(URES)?\b|\bF\b/g, '')      // 선물 접미사 제거
    .replace(/[^A-Z0-9]/g, '')                  // 공백·&·. 제거
    .replace(/^SP500$|^SANDP500$|^S&P500$/, 'SP500');
}

/** 티커 문자열에서 안정적인 색상(모노그램 폴백용) — 로고 프록시와 같은 해시 */
export function monogramHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

/**
 * 어떤 라벨이 와도 «반드시» 심볼을 돌려준다.
 * 우선순위: 지수·매크로 배지 → 모호하지 않은 실 로고 → 모노그램 칩
 */
export function resolveSymbol(raw: string): SymbolRef {
  const label = raw.trim();
  const key = normalize(label);

  const g = GLYPH[key];
  if (g) return { kind: 'glyph', text: g.text, hue: g.hue, label };

  if (!AMBIGUOUS.has(key)) {
    const f = LOGO_FILES[key];
    if (f) return { kind: 'logo', src: `shorts/logos/${f}`, label };
  }

  // 모노그램 — 최대 4글자, 티커별 고정 색
  return { kind: 'glyph', text: key.slice(0, 4) || '•', hue: monogramHue(key), label };
}

/** 심볼 크기 정본 (§1-3) — 히어로는 프레임0 지배 요소 */
export const SYM = {
  micro: 34,   // 하단 테이프
  chip: 56,    // rows / versus 내부
  card: 78,    // logos 블록
  stat: 104,   // stat 블록 헤드
  hero: 460,   // 훅 심볼 (9:16 1080폭의 43%)
} as const;
