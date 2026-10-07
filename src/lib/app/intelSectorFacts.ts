// ============================================================================
// intelSectorFacts — 앱 Intel 섹터 카드의 «감마 펄스»와 «관찰 한 줄»을 «그 섹터 실제 지표»로만 만든다(순수 함수).
//
// 왜 (2026-10-07 운영 실측 · 대표 «정보는 빠르고 정확해야… 조금의 버그 조금의 실수 없도록»):
//   · 섹터 카드의 «감마 펄스 +88» 은 SECTOR_CONFIGS 에 박아 둔 상수였다(m7 +88 · power_matrix +12 · quantum_edge -75 …).
//     운영 실측(10/7 fast-all)으로는 power_matrix 의 실제 섹터 GEX 는 음수(−9.0M·7종목 중 6종목 숏 감마)인데 화면은 «+12»였다.
//   · «퀀트 코맨더 일지»는 섹터마다 박아 둔 고정 문장이었다 — 영어 원본은 «Engine recommends 15% cash reservation»·
//     «Maintain overweight stance. Momentum score hits 92»·«Tactical buy triggered…» 같은 비중 조절·매수 권유였고(사실이 아닌
//     고정 숫자 + 투자 권유 = 유사투자자문 위험), 화면에 실제로 나가던 번역본도 «단기 모멘텀 약화» 같은 «지금 상태»를 데이터와
//     상관없이 주장했다.
//   → 둘 다 «측정값에서 계산한 것»만 말한다. 계산 근거가 없으면 null / 빈 문자열 → 화면은 «—».
//
// 원칙: 관찰어만(측정값·우위·개수). 예측·권유·비중·매매 표현 금지 — tests/intelSectorFacts.test.ts 가 출력 전체를 검사한다.
// ============================================================================

export type FactsLocale = 'ko' | 'en' | 'ja';

/** 계산에 쓰는 시세 행의 최소 모양(IntelQuote 의 부분집합). 못 잰 값은 null/undefined/NaN 이다 — 0 으로 취급하지 않는다. */
export interface FactsQuote {
  ticker: string;
  gex?: number | null;
}

/** GEX 가 «측정된 값»인가 — 유한수이고 0 이 아니다(수집이 못 채운 칸은 null 또는 0 으로 온다 — 실제 GEX 가 정확히 0 인 종목은 없다) */
export function isMeasuredGex(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v !== 0;
}

/**
 * 섹터 감마 펄스의 최소 표본 — GEX 를 잰 종목이 이보다 적거나, 섹터 종목의 절반에 못 미치면 «섹터 값»이라고 부르지 않는다(→ null → «—»).
 * 한 종목(예: 거대 GEX 한 종목)만 잰 상태에서 -100·+100 이 «섹터 전체»처럼 뜨는 것을 막는다.
 */
export const GAMMA_PULSE_MIN_NAMES = 3;

export type GammaPulseTone = 'positive' | 'neutral' | 'negative';

export interface GammaPulse {
  /** −100…+100 정수. +100 = 잰 종목의 감마가 전부 롱, −100 = 전부 숏 */
  pct: number;
  /** GEX > 0 (딜러 롱 감마) 종목 수 */
  long: number;
  /** GEX < 0 (딜러 숏 감마) 종목 수 */
  short: number;
  /** GEX 를 잰 종목 수 (= long + short) */
  measured: number;
  /** 섹터 종목(시세) 수 */
  total: number;
  tone: GammaPulseTone;
}

/** 색 구간 — 한눈 표시용(초록 ≥ +33 · 빨강 ≤ −33 · 사이 노랑). 값 자체는 정의대로이고, 구간은 GEX 칸의 부호 색(양 초록·음 빨강)과 같은 관례다. */
export const GAMMA_PULSE_TONE_EDGE = 33;

export function gammaPulseTone(pct: number): GammaPulseTone {
  if (pct >= GAMMA_PULSE_TONE_EDGE) return 'positive';
  if (pct <= -GAMMA_PULSE_TONE_EDGE) return 'negative';
  return 'neutral';
}

/**
 * 섹터 감마 펄스 = 100 × ΣGEX ÷ Σ|GEX|  (GEX 를 잰 종목만, 종목 GEX 금액 가중).
 *   · +100 = 잰 종목의 딜러 감마가 전부 롱(헤지가 변동을 눌러 주는 쪽) · −100 = 전부 숏(변동을 키우는 쪽) · 0 = 롱·숏 금액이 같다.
 *   · 부호는 같은 카드의 «GEX 합계» 칸과 항상 같다(같은 종목·같은 값에서 나오므로 서로 어긋나지 않는다).
 *   · 롱·숏이 섞여 있으면 반올림이 ±100 까지 올라가도 ±99 로 묶는다 — «전부»라고 말하지 않는다.
 *   · 표본이 모자라면(GAMMA_PULSE_MIN_NAMES · 섹터 종목의 절반) null.
 */
export function sectorGammaPulse(quotes: readonly FactsQuote[] | null | undefined): GammaPulse | null {
  const list = quotes ?? [];
  const total = list.length;
  let sum = 0;
  let abs = 0;
  let long = 0;
  let short = 0;
  for (const q of list) {
    const g = q?.gex;
    if (!isMeasuredGex(g)) continue;
    sum += g;
    abs += Math.abs(g);
    if (g > 0) long += 1; else short += 1;
  }
  const measured = long + short;
  if (measured < GAMMA_PULSE_MIN_NAMES || measured * 2 < total || !(abs > 0)) return null;

  let pct = Math.round((100 * sum) / abs);
  if (long > 0 && short > 0) pct = Math.max(-99, Math.min(99, pct));
  pct = Math.max(-100, Math.min(100, pct));
  if (Object.is(pct, -0)) pct = 0;
  return { pct, long, short, measured, total, tone: gammaPulseTone(pct) };
}

/** 카드에 그리는 글자 — 못 쟀으면 «—» */
export function formatGammaPulse(p: GammaPulse | null | undefined): string {
  if (!p) return '—';
  return `${p.pct > 0 ? '+' : ''}${p.pct}`;
}

/** $ 금액 약식(+$307.5M) — 섹터 카드의 NET PREM 칸과 같은 글자 */
export function formatUsdCompact(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '—';
  const sign = value > 0 ? '+' : '-';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export interface SectorObservationInput {
  /** 섹터 순 프리미엄(콜 − 풋, 달러) 합계 — 못 쟀으면 null */
  netPremium: number | null;
  /** sectorGammaPulse 결과 — 못 쟀으면 null */
  gamma: GammaPulse | null;
  /** 카드의 «주도 종목» 칸과 같은 종목 — 없으면 null */
  leadTicker: string | null;
}

const WORDS: Record<FactsLocale, {
  netPremium: (money: string) => string;
  callSide: string;
  putSide: string;
  gammaLong: (n: number, of: number) => string;
  gammaShort: (n: number, of: number) => string;
  gammaSplit: (long: number, short: number) => string;
  lead: (ticker: string) => string;
}> = {
  ko: {
    netPremium: (m) => `순 프리미엄 ${m}`,
    callSide: '콜 우위',
    putSide: '풋 우위',
    gammaLong: (n, of) => `롱 감마 ${n}/${of}종목`,
    gammaShort: (n, of) => `숏 감마 ${n}/${of}종목`,
    gammaSplit: (l, s) => `롱·숏 감마 ${l}:${s}`,
    lead: (t) => `주도 종목 ${t}`,
  },
  en: {
    netPremium: (m) => `Net premium ${m}`,
    callSide: 'call-side tilt',
    putSide: 'put-side tilt',
    gammaLong: (n, of) => `Long gamma ${n}/${of} names`,
    gammaShort: (n, of) => `Short gamma ${n}/${of} names`,
    gammaSplit: (l, s) => `Long/short gamma ${l}:${s}`,
    lead: (t) => `Lead name ${t}`,
  },
  ja: {
    netPremium: (m) => `ネットプレミアム ${m}`,
    callSide: 'コール優勢',
    putSide: 'プット優勢',
    gammaLong: (n, of) => `ロングガンマ ${n}/${of}銘柄`,
    gammaShort: (n, of) => `ショートガンマ ${n}/${of}銘柄`,
    gammaSplit: (l, s) => `ロング・ショートガンマ ${l}:${s}`,
    lead: (t) => `主導銘柄 ${t}`,
  },
};

/**
 * «관찰형 사실 한 줄» — AI 판정이 없을 때 섹터 카드의 «AI 해석» 칸·섹터 상세의 «QUANT COMMANDER» 칸에 쓴다.
 *   예) 순 프리미엄 +$307.5M · 콜 우위 · 롱 감마 5/7종목 · 주도 종목 NVDA
 *   · 있는 재료만 «·» 로 잇는다. 재료가 하나도 없으면 빈 문자열(→ 화면은 «—»).
 *   · 값·개수·종목명 외의 말은 «우위»(부호 설명)뿐이다 — 예측·권유·비중·매매 표현은 만들지 않는다.
 */
export function buildSectorObservation(input: SectorObservationInput, locale: FactsLocale): string {
  const w = WORDS[locale] ?? WORDS.en;
  const parts: string[] = [];

  const np = input.netPremium;
  if (typeof np === 'number' && Number.isFinite(np) && np !== 0) {
    parts.push(w.netPremium(formatUsdCompact(np)));
    parts.push(np > 0 ? w.callSide : w.putSide);
  }

  const g = input.gamma;
  if (g && g.measured > 0) {
    parts.push(
      g.long === g.short ? w.gammaSplit(g.long, g.short)
        : g.long > g.short ? w.gammaLong(g.long, g.measured)
          : w.gammaShort(g.short, g.measured),
    );
  }

  const lead = typeof input.leadTicker === 'string' ? input.leadTicker.trim() : '';
  if (lead) parts.push(w.lead(lead));

  return parts.join(' · ');
}
